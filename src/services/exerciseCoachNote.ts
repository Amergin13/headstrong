/**
 * Dynamic 2-line exercise card summary, written by the on-device model (Gemini Nano, or
 * the downloaded phone-GPU model) from facts in the athlete's history and session stimulus.
 *
 * Architectural invariants:
 * 1. Strict 2-Line Limit & Zero Section Headers:
 *    - Line 1: Historical Trajectory Anchor (validates long-term capability and identity).
 *    - Line 2: Session Stimulus Directive (frames the acute training goal).
 *    - Never prefix lines with labels like Progress:, Goal:, Summary:, or Focus:.
 * 2. Zero Table/Grid Duplication: never output target weight, target reps, target sets, or target RIR.
 * 3. No Movement Execution Cues: never output tempo/cadence, rest intervals, or RIR.
 * 4. Concrete Absolute Load Over Abstract Percentages: use Δkg/Δlb and e1RM rounded to 0.1, never %.
 * 5. No Macro Volume Leakage: never output weekly muscle set counts (e.g., 7 of 13–19 hard sets).
 */
import { AthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { runReadAloudQaGate } from '../engine/contentStrategy';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { ExerciseSession, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';
import { ExerciseInsight } from './exerciseInsight';
import { promptOnDeviceModel } from './onDeviceModel';

export interface ExerciseNoteInput {
  exercise: ExerciseSession;
  insight: ExerciseInsight;
  workouts: WorkoutSession[];
  readinessState: ReadinessState;
  knowledgeGraph: AthleteKnowledgeGraph;
  /** Catalog primary muscle, e.g. "Side Delts". */
  primaryMuscle?: string;
  /** Plain-English muscle, e.g. "side shoulders". */
  muscleLabel?: string;
  /** e.g. "Phase 1 (Building foundations), week 1 of 6". */
  programLabel?: string;
  /** Formats kilograms in the athlete's unit, e.g. "10 kg". */
  formatWeight: (kg: number) => string;
}

export interface ExerciseNoteFacts {
  exerciseId: string;
  /** Changes whenever any fact changes; used to cache the generated note. */
  key: string;
  facts: string[];
  /** Strict 2-line summary built directly from the facts, shown until (or instead of) the model's. */
  fallback: string;
  /** [Line 1: Historical Trajectory Anchor, Line 2: Session Stimulus Directive]. */
  lines: [string, string];
}

export const EXERCISE_NOTE_SYSTEM_PROMPT =
  "You write a strict 2-line coaching summary for one exercise in the athlete's workout today. Use only the facts given. " +
  'Output exactly two lines separated by a newline, speaking to the athlete as "you", with one sentence per line and zero section headers or labels (never write Progress:, Goal:, Summary:, or Focus:). ' +
  'Line 1 is the historical trajectory anchor using only the exact load or estimated 1RM figures in the facts (never use percentages). ' +
  "Line 2 is the session stimulus directive framing today's acute training goal (such as progressive mechanical tension or volume accumulation for hypertrophy). " +
  'Never mention target weight, target reps, target sets, RIR, reps in reserve, tempo, rest times, or weekly muscle set counts. ' +
  'Every load figure in the facts is an estimated max: call it an estimated max, never a weight the athlete lifted, and do not mention the last session. ' +
  'Do not use any number that is not in the facts.';

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const done = (s: WorkoutSet) => s.completed && isWorking(s) && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildExerciseNoteFacts(input: ExerciseNoteInput): ExerciseNoteFacts {
  const { exercise, insight, workouts, readinessState, knowledgeGraph, formatWeight } = input;
  const facts: string[] = [];
  const muscle = input.muscleLabel ? input.muscleLabel.toLowerCase() : undefined;
  const load = (kg: number) => formatWeight(round1(kg));

  facts.push(`Exercise: ${exercise.name}${muscle ? ` (trains your ${muscle})` : ''}.`);

  // History on this exact exercise.
  const completedSessions = workouts
    .filter((w) => w.completed)
    .sort((a, b) => getWorkoutCompletedAt(b) - getWorkoutCompletedAt(a))
    .map((w) => w.exercises.find((e) => e.exerciseId === exercise.exerciseId && e.sets.some(done)))
    .filter((e): e is ExerciseSession => Boolean(e));
  const lastSession = completedSessions[0];
  const timedWork = Boolean(exercise.durationSeconds || exercise.durationMinutesRange);

  // Line 1: Historical Trajectory Anchor (concrete absolute load, zero percentages).
  let line1: string;
  if (timedWork) {
    if (completedSessions.length === 0) {
      facts.push('This is the first time you have logged this exercise.');
      line1 = `First time on ${exercise.name}—today sets your starting point.`;
    } else if (completedSessions.length === 1) {
      facts.push(`Logged 1 completed session on ${exercise.name}, establishing your baseline endurance.`);
      line1 = `Baseline endurance established from your first session on ${exercise.name}.`;
    } else {
      facts.push(`Logged ${completedSessions.length} completed sessions on ${exercise.name}, building endurance capacity.`);
      line1 = `Endurance capacity is rising across ${completedSessions.length} logged sessions on ${exercise.name}.`;
    }
  } else if (!lastSession || insight.history.length === 0) {
    facts.push('This is the first time you have logged this exercise.');
    line1 = `First time on ${exercise.name}—today sets your starting point.`;
  } else if (insight.history.length === 1) {
    const startE1rm = load(insight.history[0].e1rmKg);
    facts.push(`Baseline estimated 1RM established at ${startE1rm} from your first session.`);
    line1 = `Baseline strength established at a ${startE1rm} estimated max from your first session.`;
  } else {
    const first = round1(insight.history[0].e1rmKg);
    const last = round1(insight.history[insight.history.length - 1].e1rmKg);
    const delta = round1(last - first);
    const n = insight.history.length;
    if (delta > 0) {
      facts.push(
        `Estimated 1RM on this exercise has risen by +${load(delta)} across ${n} sessions (from ${load(first)} to ${load(last)}).`
      );
      line1 = `Strength on this lift is rising, up +${load(delta)} across ${n} sessions to a ${load(last)} estimated max.`;
    } else if (delta < 0) {
      facts.push(
        `Estimated 1RM on this exercise has shifted by -${load(Math.abs(delta))} across ${n} sessions (from ${load(first)} to ${load(last)}).`
      );
      line1 = `Estimated max on this lift shifted -${load(Math.abs(delta))} across ${n} sessions and currently stands at ${load(last)}.`;
    } else {
      facts.push(`Estimated 1RM on this exercise has held steady at ${load(last)} across ${n} sessions.`);
      line1 = `Strength on this lift has held steady at a ${load(last)} estimated max across ${n} sessions.`;
    }
  }

  // Line 2: Session Stimulus Directive (acute training goal, zero table duplication or execution cues).
  const working = exercise.sets.filter(isWorking);
  const planned = working[0];
  const joint = knowledgeGraph.joints.find((j) => j.status !== 'Optimal' && j.topContributors.includes(exercise.name));
  const jointClause = joint ? ` while keeping ${joint.joint.toLowerCase()} tracking smooth` : '';
  const musclePhrase = muscle ? ` for your ${muscle}` : '';

  let line2: string;
  if (readinessState === 'Amber Shield') {
    facts.push('Recovery today is low, so the session holds load steady to preserve muscle and limit fatigue.');
    line2 = `Recovery is low, so today holds the weight steady to preserve muscle${jointClause || ' while managing fatigue'}.`;
  } else if (timedWork) {
    if (exercise.durationSeconds) {
      facts.push('Session stimulus today: sustained isometric trunk stability and muscular endurance.');
      line2 = `Today targets sustained isometric trunk stability and muscular endurance${jointClause}.`;
    } else {
      facts.push('Session stimulus today: aerobic conditioning and sustained work capacity.');
      line2 = `Today builds aerobic conditioning and sustained work capacity${jointClause}.`;
    }
  } else if (!lastSession || !planned) {
    facts.push(`Session stimulus today: establish baseline mechanical tension and hypertrophy stimulus${musclePhrase}.`);
    line2 = `Today focuses on clean mechanical tension to establish your baseline hypertrophy stimulus${musclePhrase}${jointClause}.`;
  } else {
    const prevSets = lastSession.sets.filter(done);
    const prevTop = prevSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
    const prevReps = prevSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    if (planned.targetWeightKg > prevTop + 0.01) {
      facts.push(`Today is heavier than last time: progressive mechanical tension stimulus${musclePhrase}.`);
      line2 = `Today increases the weight to drive progressive mechanical tension${musclePhrase}${jointClause || (musclePhrase ? '' : ' for hypertrophy')}.`;
    } else if (planned.targetWeightKg < prevTop - 0.01) {
      facts.push(`Today is lighter than last time: deloaded volume accumulation stimulus${musclePhrase}.`);
      line2 = `Today lightens the weight to prioritize clean volume accumulation${musclePhrase}${jointClause || (musclePhrase ? '' : ' for hypertrophy')}.`;
    } else if (planned.targetReps > prevReps) {
      facts.push(`Today expands volume accumulation at the current load${musclePhrase}.`);
      line2 = `Today builds volume accumulation at your current load to expand hypertrophy capacity${musclePhrase}${jointClause}.`;
    } else {
      facts.push(`Today consolidates volume accumulation at the current load${musclePhrase}.`);
      line2 = `Today consolidates volume accumulation at your current load to deepen hypertrophy${musclePhrase}${jointClause}.`;
    }
  }

  if (exercise.intensityProtocol) facts.push(`Technique today: ${exercise.intensityProtocol.name}.`);
  if (readinessState === 'Primed') facts.push('Recovery today is high.');
  else if (readinessState === 'Normal') facts.push('Recovery today is normal.');
  if (joint) facts.push(`${joint.joint} load this week: ${joint.status.toLowerCase()}, partly from this exercise.`);
  if (input.programLabel) facts.push(`Program context: ${input.programLabel}.`);

  const lines: [string, string] = [line1, line2];
  return {
    exerciseId: exercise.id,
    key: hash(`${EXERCISE_NOTE_SYSTEM_PROMPT}\n${facts.join('\n')}`),
    facts,
    lines,
    fallback: `${line1}\n${line2}`,
  };
}

export function buildExerciseNotePrompt(facts: ExerciseNoteFacts): string {
  return `Facts:\n${facts.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the 2-line summary.`;
}

const NUMBER = /\d+(?:\.\d+)?/g;

/**
 * Cleans a model answer and accepts it only if it obeys all 5 Hard Architectural Rules:
 * 1. Strict 2-line limit & zero section headers (Progress:, Goal:, Summary:, Focus:, etc.).
 * 2. Zero table/grid duplication (no target weight, target reps, target sets, target RIR).
 * 3. No movement execution cues (no tempo/cadence, rest intervals, or RIR).
 * 4. Concrete absolute load over abstract percentages (no % or percent).
 * 5. No macro volume leakage (no weekly muscle set benchmarks).
 * Returns null to use the deterministic 2-line fallback.
 */
export function acceptExerciseNote(answer: string | null, facts: ExerciseNoteFacts): string | null {
  if (!answer) return null;
  const cleaned = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(?:coaching\s+note|note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (cleaned.length < 30 || cleaned.length > 340) return null;

  // Rule 1: Zero section headers or line prefixes (e.g., Progress:, Goal:, Summary:, Focus:, Line 1:).
  if (
    /(?:^|\n|\b)(?:progress|goal|summary|focus|line\s*\d+|history|trajectory|stimulus|directive|anchor|today's\s+goal|session\s+goal)\s*:/i.test(
      cleaned
    )
  ) {
    return null;
  }

  // Split into lines (if newline-delimited) or sentences (if two sentences on a single line).
  const rawLines = cleaned.includes('\n')
    ? cleaned
        .split(/\n+/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    : cleaned
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

  // Rule 1: Strict 2-line limit (exactly 2 lines, 1 sentence per line).
  if (rawLines.length !== 2) return null;
  for (const line of rawLines) {
    const sentenceCount = (line.match(/[.!?](\s|$)/g) || []).length;
    if (sentenceCount !== 1) return null;
    if (/^(?:progress|goal|summary|focus|line\s*\d+|history|trajectory|stimulus|directive|note)\s*[:\-–—]/i.test(line)) {
      return null;
    }
  }

  const text = `${rawLines[0]}\n${rawLines[1]}`;

  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return null;

  // Rule 2: Zero Table/Grid Duplication (no set counts, rep counts, weight×rep notation, or target weight/reps/sets/RIR).
  if (/\b\d+\s*(?:working\s+|hard\s+|warmup\s+|warm-up\s+)?sets?\b/i.test(text)) return null;
  if (/\bsets?\s+of\s+\d+/i.test(text)) return null;
  if (/\b\d+(?:\s*[–-]\s*\d+)?\s*reps?\b/i.test(text)) return null;
  if (/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)?\s*[x×]\s*\d+/i.test(text)) return null;
  if (/\btarget\s+(?:weight|load|reps?|sets?|rir)\b/i.test(text)) return null;
  // Line 2 is the Session Stimulus Directive and must never output operational target weights.
  if (/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)\b/i.test(rawLines[1])) return null;

  // Rule 3: No Movement Execution Cues (no tempo/cadence, rest intervals, or proximity to failure / RIR).
  if (/\b(?:tempo|cadence|eccentric|concentric)\b/i.test(text)) return null;
  if (/\b\d+\s*(?:s|sec|seconds?)\b/i.test(text)) return null;
  if (/\b(?:rest\s+interval|rest\s+\d+|\d+\s*(?:min|minutes?)\s+(?:of\s+)?rest)\b/i.test(text)) return null;
  if (/\b(?:rir|reps?\s+(?:in\s+reserve|to\s+spare|left|shy\s+of\s+failure)|proximity\s+to\s+failure|to\s+failure)\b/i.test(text)) {
    return null;
  }

  // Rule 4: Concrete Absolute Load Over Abstract Percentages (ban % and percent/percentage).
  if (/\d+(?:\.\d+)?\s*%|\bpercent(?:age)?\b/i.test(text)) return null;

  // Rule 5: No Macro Volume Leakage (ban weekly muscle set counts/benchmarks).
  if (
    /\b(?:hard\s+sets?|weekly\s+(?:sets?|volume|target)|sets?\s+this\s+week|this\s+week's\s+(?:sets?|target|volume)|\d+\s+of\s+\d+\s*[–-]\s*\d+)\b/i.test(
      text
    )
  ) {
    return null;
  }

  const allFacts = facts.facts.join(' ');
  const allowed = new Set(allFacts.match(NUMBER) || []);
  const used = text.match(NUMBER) || [];
  if (used.some((n) => !allowed.has(n))) return null;

  // When historical load figures exist in the facts, Line 1 must anchor on a concrete load metric (kg/lb).
  if (/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)\b/i.test(allFacts) && !/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)\b/i.test(rawLines[0])) {
    return null;
  }

  // A first-ever session has no history to talk about.
  if (
    /first time you have logged/i.test(allFacts) &&
    /\b(last time|last session|previous|before|once|again|progress|improv\w*|increas\w*|risen|up \+?\d|consistent\w*|building strength|stronger|so far)\b/i.test(
      text
    )
  ) {
    return null;
  }

  // Errors the real on-device model made when rewording these facts. Every load figure in the
  // facts is an estimated max, so it must be called an estimate and never a weight that was lifted,
  // and the facts never describe the last session.
  if (/\byou (lifted|pressed|rowed|pulled|curled|squatted|benched|hit|moved)\b/i.test(text)) return null;
  if (/\b(last|previous|prior) (session|workout|time)\b/i.test(text) && !/\b(last|previous) (session|workout|time)\b/i.test(allFacts)) return null;
  if (/\b(kg|lbs?)\b/i.test(rawLines[0]) && /estimated/i.test(allFacts) && !/\bestimat/i.test(rawLines[0])) return null;

  // No praise the facts don't show, and must pass the Read-Aloud QA Gate (no hollow cheerleading or error leaks).
  if (/\b(consistent\w*|dedicat\w*|never miss\w*)\b/i.test(text)) return null;
  if (!runReadAloudQaGate(text).passed) return null;

  return text;
}

/** Asks the on-device model for the note. Null when no model is ready or its answer fails the checks. */
export async function generateExerciseNote(
  facts: ExerciseNoteFacts,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  // A model that throws is the same as no model: the fact-based text stays.
  try {
    for (let i = 0; i < attempts; i++) {
      const answer = await prompt(EXERCISE_NOTE_SYSTEM_PROMPT, buildExerciseNotePrompt(facts), {
        stateless: true,
        timeoutMs: 45_000,
      });
      if (answer === null) return null; // no model, or it failed: don't retry
      const accepted = acceptExerciseNote(answer, facts);
      if (accepted) return accepted;
    }
  } catch {
    return null;
  }
  return null;
}

// Generated notes are kept on the device, keyed by their facts, so each is written once.
const CACHE_KEY = 'treise_exercise_notes_v2';
const MAX_CACHED = 80;

function readCache(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    // Anything that isn't a saved map of texts (a damaged or foreign value) counts as empty.
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedExerciseNote(key: string): string | undefined {
  const hit = readCache()[key];
  return typeof hit === 'string' ? hit : undefined;
}

export function cacheExerciseNote(key: string, note: string): void {
  try {
    const entries = Object.entries(readCache()).filter(([k]) => k !== key);
    entries.push([key, note]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_CACHED))));
  } catch {
    // Storage unavailable: the note is simply generated again next time.
  }
}
