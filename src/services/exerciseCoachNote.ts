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
import { buildExerciseBriefContractPrompt, runReadAloudQaGate } from '../engine/contentStrategy';
import { isAssistedExercise, isTimedExercise, usesTwoDumbbells } from '../engine/e1rm';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { ExerciseSession, GoalPhase, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import {
  buildGoalDrivenLine2,
  buildSwappedExerciseCopy,
  ExerciseInsight,
  getExerciseRepRangeLabel,
  resolveSwapCalibrationMode,
} from './exerciseInsight';
import { markPromptRejected, mismatchedWeightUnit, spelledNumberNotInFacts, wasPromptRejected } from './factChecks';
import { promptOnDeviceModel } from './onDeviceModel';
import {
  buildSummaryVoiceGuidelines,
  checkSummaryVoiceGuidelines,
  normalizeSummaryVoice,
} from './coachPersonalization';
import { coalesceAiGeneration, readCachedAiText, writeCachedAiText } from './aiGenerationCache';

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
  /** Athlete's active goal phase (Build Muscle / Lose Fat / Stay Lean). */
  goalPhase?: GoalPhase;
  /** Formats kilograms in the athlete's unit, e.g. "10 kg". */
  formatWeight: (kg: number) => string;
}

export interface ExerciseNoteFacts {
  exerciseId: string;
  /** Changes whenever any fact changes; used to cache the generated note. */
  key: string;
  /** False on a first-ever session for this movement (uses the zero-cost baseline fallback). */
  hasHistory: boolean;
  facts: string[];
  /** Strict 2-line summary built directly from the facts, shown until (or instead of) the model's. */
  fallback: string;
  /** [Line 1: Historical Trajectory Anchor, Line 2: Session Stimulus Directive]. */
  lines: [string, string];
}

export const EXERCISE_NOTE_SYSTEM_PROMPT =
  buildExerciseBriefContractPrompt() + buildSummaryVoiceGuidelines('exercise_brief');

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
  if (input.goalPhase) {
    facts.push(`Athlete goal: ${GOAL_DISPLAY_NAME[input.goalPhase]}.`);
  }

  // History on this exact exercise.
  const completedSessions = workouts
    .filter((w) => w.completed)
    .sort((a, b) => getWorkoutCompletedAt(b) - getWorkoutCompletedAt(a))
    .map((w) => w.exercises.find((e) => e.exerciseId === exercise.exerciseId && e.sets.some(done)))
    .filter((e): e is ExerciseSession => Boolean(e));
  const lastSession = completedSessions[0];
  const timedWork = Boolean(exercise.durationSeconds || exercise.durationMinutesRange || isTimedExercise(exercise));
  const isAssisted = isAssistedExercise(exercise);
  const isCalisthenic =
    exercise.equipment === 'bodyweight' ||
    exercise.equipment === 'weighted_bodyweight' ||
    Boolean(exercise.isWeightedCalisthenic);
  const hasAddedLoad =
    completedSessions.some((ex) => ex.sets.filter(done).some((s) => weightOf(s) > 0)) ||
    exercise.sets.filter(isWorking).some((s) => (s.targetWeightKg ?? 0) > 0);
  const isPureBodyweight =
    isCalisthenic && !isAssisted && exercise.equipment === 'bodyweight' && !exercise.isWeightedCalisthenic && !hasAddedLoad;
  const bwFactsQualifier = isAssisted
    ? ''
    : insight.includesBodyweight
    ? isPureBodyweight
      ? ' (including bodyweight)'
      : ' (bodyweight + added weight)'
    : '';
  const repRange = getExerciseRepRangeLabel(exercise);
  const bridgedAnchor =
    exercise.anchorExerciseId &&
    exercise.anchorExerciseId !== exercise.exerciseId &&
    exercise.anchorExerciseName
      ? exercise.anchorExerciseName.replace(/[.!?]/g, '').trim()
      : undefined;
  const isReentry = Boolean(exercise.isBridgeReentry);
  const isTwoDb = usesTwoDumbbells(exercise);
  const hasOwnHistory = timedWork ? completedSessions.length > 0 : Boolean(lastSession && insight.history.length > 0);
  const swapCalibrationMode = bridgedAnchor ? resolveSwapCalibrationMode(exercise) : undefined;
  const swappedCopy = bridgedAnchor
    ? buildSwappedExerciseCopy({
        anchorName: bridgedAnchor,
        pillar: exercise.pillar,
        muscleLabel: input.muscleLabel,
        repRange,
        readinessState,
        hasOwnHistory,
        isTimed: timedWork,
        calibrationMode: swapCalibrationMode,
        setupLabel: exercise.setupLabel,
        goalPhase: input.goalPhase,
        anchorProgress: insight.anchorProgress,
        formatLoad: load,
      })
    : null;

  if (swappedCopy) {
    facts.push(swappedCopy.factLine1);
  } else if (isReentry) {
    facts.push('Returning to this gym lift after away sessions; previous logged sets reflect your last gym session.');
  }
  if (isTwoDb && !hasOwnHistory) {
    facts.push('Weight is logged per dumbbell.');
  } else if (isAssisted && !hasOwnHistory) {
    facts.push('Weight is counterweight assistance (less assistance is harder).');
  }

  // Line 1: Overall Progress Against Goals (plain trajectory verdict + concrete load/rep metric, zero percentages).
  let line1: string;
  if (timedWork) {
    if (completedSessions.length === 0) {
      facts.push('This is the first time you have logged this exercise.');
      line1 = swappedCopy
        ? swappedCopy.firstSessionLine1
        : `First time on ${exercise.name}—sets your starting hold baseline.`;
    } else if (completedSessions.length === 1) {
      const startSec = insight.history[0]?.value;
      facts.push(`Logged 1 completed session on ${exercise.name}, establishing your baseline endurance${startSec ? ` (${startSec}s)` : ''}.`);
      line1 = startSec
        ? `Your starting hold baseline is set at ${startSec}s from session 1.`
        : `Your starting hold endurance is set from session 1.`;
    } else {
      const topSec = insight.history[insight.history.length - 1]?.value;
      facts.push(`Logged ${completedSessions.length} completed sessions on ${exercise.name}, building endurance capacity${topSec ? ` (${topSec}s)` : ''}.`);
      line1 = topSec
        ? `Your hold endurance sits at ${topSec}s across ${completedSessions.length} sessions.`
        : `Your hold endurance is building across ${completedSessions.length} sessions.`;
    }
  } else if (!lastSession || insight.history.length === 0) {
    facts.push('This is the first time you have logged this exercise.');
    line1 = swappedCopy
      ? swappedCopy.firstSessionLine1
      : isAssisted
      ? `First time on ${exercise.name}—sets your starting baseline (less assistance is harder).`
      : isTwoDb
      ? `First time on ${exercise.name}—sets your starting baseline (log weight per dumbbell).`
      : isPureBodyweight && insight.includesBodyweight
      ? `First time on ${exercise.name}—sets your starting baseline using your bodyweight.`
      : `First time on ${exercise.name}—sets your starting strength baseline.`;
  } else if (insight.metric === 'reps') {
    const val = (h: (typeof insight.history)[number]) => h.value ?? h.e1rmKg;
    if (insight.history.length === 1) {
      const startReps = val(insight.history[0]);
      facts.push(`Baseline bodyweight best set established at ${startReps} per set from your first session.`);
      line1 = `Your starting baseline is set at ${startReps} per set from session 1.`;
    } else {
      const first = val(insight.history[0]);
      const last = val(insight.history[insight.history.length - 1]);
      const delta = last - first;
      const n = insight.history.length;
      if (delta > 0) {
        facts.push(`Best set on this bodyweight exercise has risen by +${delta} across ${n} sessions (from ${first} to ${last} per set).`);
        line1 = `Your bodyweight strength is rising—best set is up +${delta} over ${n} sessions to ${last}.`;
      } else if (delta < 0) {
        facts.push(`Best set on this bodyweight exercise shifted -${Math.abs(delta)} across ${n} sessions (from ${first} to ${last} per set).`);
        line1 = `Your best set sits at ${last} (-${Math.abs(delta)} over ${n} sessions) as you rebuild capacity.`;
      } else {
        facts.push(`Best set on this bodyweight exercise has held steady at ${last} per set across ${n} sessions.`);
        line1 = `Your bodyweight strength is holding steady at ${last} per set across ${n} sessions.`;
      }
    }
  } else if (insight.metric === 'added_kg') {
    const val = (h: (typeof insight.history)[number]) => h.value ?? h.e1rmKg;
    if (insight.history.length === 1) {
      const startAdded = load(val(insight.history[0]));
      facts.push(`Baseline added weight established at ${startAdded} from your first session.`);
      line1 = `Your starting added weight is set at ${startAdded} from session 1.`;
    } else {
      const first = round1(val(insight.history[0]));
      const last = round1(val(insight.history[insight.history.length - 1]));
      const delta = round1(last - first);
      const n = insight.history.length;
      if (delta > 0) {
        facts.push(`Added weight on this exercise has risen by +${load(delta)} across ${n} sessions (from ${load(first)} to ${load(last)}).`);
        line1 = `Your added-weight strength is rising—up +${load(delta)} over ${n} sessions to ${load(last)}.`;
      } else if (delta < 0) {
        facts.push(`Added weight on this exercise shifted -${load(Math.abs(delta))} across ${n} sessions (from ${load(first)} to ${load(last)}).`);
        line1 = `Your added weight sits at ${load(last)} (-${load(Math.abs(delta))} over ${n} sessions) as you rebuild momentum.`;
      } else {
        facts.push(`Added weight on this exercise has held steady at ${load(last)} across ${n} sessions.`);
        line1 = `Your added weight is holding steady at ${load(last)} across ${n} sessions.`;
      }
    }
  } else if (insight.history.length === 1) {
    const startE1rm = load(insight.history[0].e1rmKg);
    const bwShort = bwFactsQualifier;
    facts.push(`Baseline estimated 1RM${bwFactsQualifier} established at ${startE1rm} from your first session.`);
    line1 = `Your starting strength is set at a ${startE1rm} estimated max${bwShort} from session 1.`;
  } else {
    const first = round1(insight.history[0].e1rmKg);
    const last = round1(insight.history[insight.history.length - 1].e1rmKg);
    const delta = round1(last - first);
    const n = insight.history.length;
    const bwShort = bwFactsQualifier;
    if (delta > 0) {
      facts.push(
        `Estimated 1RM${bwFactsQualifier} on this exercise has risen by +${load(delta)} across ${n} sessions (from ${load(first)} to ${load(last)}).`
      );
      line1 = `Your strength is rising—estimated max${bwShort} is up +${load(delta)} over ${n} sessions to ${load(last)}.`;
    } else if (delta < 0) {
      facts.push(
        `Estimated 1RM${bwFactsQualifier} on this exercise has shifted by -${load(Math.abs(delta))} across ${n} sessions (from ${load(first)} to ${load(last)}).`
      );
      line1 = `Your estimated max${bwShort} sits at ${load(last)} (-${load(Math.abs(delta))} over ${n} sessions) as you rebuild momentum.`;
    } else {
      facts.push(`Estimated 1RM${bwFactsQualifier} on this exercise has held steady at ${load(last)} across ${n} sessions.`);
      line1 = `Your strength is holding steady at a ${load(last)} estimated max${bwShort} across ${n} sessions.`;
    }
  }

  // Line 2: Today's Session Action -> Goal Outcome (shared single source of truth with `buildExerciseInsight`).
  const working = exercise.sets.filter(isWorking);
  const planned = working[0];
  const joint = knowledgeGraph.joints.find((j) => j.status !== 'Optimal' && j.topContributors.includes(exercise.name));

  if (repRange) {
    facts.push(`Target rep range: ${repRange}.`);
  }

  let line2: string;
  if (swappedCopy) {
    facts.push(swappedCopy.factLine2);
    line2 = swappedCopy.line2;
  } else {
    const prevSets = lastSession ? lastSession.sets.filter(done) : [];
    const prevTop = prevSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
    const prevReps = prevSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    const goalLine2 = buildGoalDrivenLine2({
      readinessState,
      isTimed: timedWork,
      isIsometricTimed: Boolean(exercise.durationSeconds || isTimedExercise(exercise)),
      hasOwnHistory: Boolean(lastSession && planned && (timedWork ? completedSessions.length > 0 : insight.history.length > 0)),
      isReentry,
      metric: insight.metric,
      isAssisted,
      repRange,
      muscleLabel: input.muscleLabel,
      goalPhase: input.goalPhase,
      plannedTop: planned?.targetWeightKg ?? 0,
      prevTop,
      plannedReps: planned?.targetReps ?? 0,
      prevReps,
      maxReps: exercise.maxReps,
      lastMaxReps: lastSession?.maxReps ?? 0,
    });
    facts.push(goalLine2.factLine2);
    line2 = goalLine2.line2;
  }

  if (exercise.intensityProtocol) facts.push(`Technique today: ${exercise.intensityProtocol.name}.`);
  if (readinessState === 'Primed') facts.push('Recovery today is high.');
  else if (readinessState === 'Normal') facts.push('Recovery today is normal.');
  if (joint) facts.push(`${joint.joint} load this week: ${joint.status.toLowerCase()}, partly from this exercise.`);
  if (input.programLabel) facts.push(`Program context: ${input.programLabel}.`);

  const hasHistory = timedWork
    ? completedSessions.length > 0
    : Boolean((lastSession && insight.history.length > 0) || insight.anchorProgress);
  const lines: [string, string] = [line1, line2];
  return {
    exerciseId: exercise.id,
    key: hash(`${EXERCISE_NOTE_SYSTEM_PROMPT}\n${facts.join('\n')}`),
    hasHistory,
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
 * Validates a model note against all 5 Hard Architectural Rules, returning the cleaned note or a
 * plain-English problem description for a retry.
 */
export function checkExerciseNote(
  answer: string | null,
  facts: ExerciseNoteFacts
): { text: string; problem?: undefined } | { text?: undefined; problem: string } {
  if (!answer) return { problem: 'it was empty' };
  const rawCleaned = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(?:coaching\s+note|note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  const cleaned = normalizeSummaryVoice(rawCleaned, {
    preserveNewlines: true,
    prefixPattern: /^\s*(?:coaching\s+note|note)\s*:\s*/i,
  });
  if (cleaned.length < 30 || cleaned.length > 240) {
    return { problem: 'it must be two concise sentences under 240 characters' };
  }

  // Rule 1: Zero section headers or line prefixes (e.g., Progress:, Goal:, Summary:, Focus:, Line 1:).
  if (
    /(?:^|\n|\b)(?:progress|goal|summary|focus|line\s*\d+|history|trajectory|stimulus|directive|anchor|today's\s+goal|session\s+goal)\s*:/i.test(
      cleaned
    )
  ) {
    return { problem: 'it included a section header or label like Progress: or Goal:' };
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
  if (rawLines.length !== 2) {
    return { problem: 'it must be exactly 2 lines separated by a newline, with one sentence per line' };
  }
  for (const line of rawLines) {
    const sentenceCount = (line.match(/[.!?](\s|$)/g) || []).length;
    if (sentenceCount !== 1) {
      return { problem: 'each of the 2 lines must have exactly one sentence' };
    }
    if (/^(?:progress|goal|summary|focus|line\s*\d+|history|trajectory|stimulus|directive|note)\s*[:\-–—]/i.test(line)) {
      return { problem: 'a line began with a label prefix' };
    }
  }

  const text = `${rawLines[0]}\n${rawLines[1]}`;

  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) {
    return { problem: 'it talked about itself or the facts' };
  }

  // Rule 2: Zero Table/Grid Duplication (no set counts, single-set rep counts, weight×rep notation, or target weight/sets/RIR).
  // Allow the exact prescribed rep range (e.g., "8–12 reps") when it appears in the facts so it can live naturally in Line 2 instead of a badge.
  if (/\b\d+\s*(?:working\s+|hard\s+|warmup\s+|warm-up\s+)?sets?\b/i.test(text)) {
    return { problem: 'it mentioned a number of sets' };
  }
  if (/\bsets?\s+of\s+\d+/i.test(text)) {
    return { problem: 'it mentioned sets and reps' };
  }
  const repRangeFact = facts.facts
    .map((f) => f.match(/Target rep range:\s*(\d+)\s*[–-]\s*(\d+)\s*reps/i))
    .find(Boolean);
  const textWithoutAllowedRepRange = repRangeFact
    ? text.replace(
        new RegExp(`\\b${repRangeFact[1]}\\s*[–-]\\s*${repRangeFact[2]}\\s*(?:reps?|rep\\s+range)\\b`, 'gi'),
        ''
      )
    : text;
  if (/\b\d+(?:\s*[–-]\s*\d+)?\s*reps?\b/i.test(textWithoutAllowedRepRange)) {
    return { problem: 'it mentioned a number of reps' };
  }
  if (/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)?\s*[x×]\s*\d+/i.test(text)) {
    return { problem: 'it used weight×rep notation' };
  }
  if (/\btarget\s+(?:weight|load|reps?|sets?|rir)\b/i.test(text)) {
    return { problem: 'it mentioned target weight, reps, sets, or RIR' };
  }
  // Line 2 is the Session Stimulus Directive and must never output operational target weights.
  if (/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)\b/i.test(rawLines[1])) {
    return { problem: 'Line 2 included a weight in kg/lb; keep weights only in Line 1' };
  }

  // Rule 3: No Movement Execution Cues (no tempo/cadence, rest intervals, or proximity to failure / RIR).
  if (/\b(?:tempo|cadence|eccentric|concentric)\b/i.test(text)) {
    return { problem: 'it mentioned tempo or cadence' };
  }
  if (/\b\d+\s*(?:s|sec|seconds?)\b/i.test(text)) {
    return { problem: 'it mentioned seconds' };
  }
  if (/\b(?:rest\s+interval|rest\s+\d+|\d+\s*(?:min|minutes?)\s+(?:of\s+)?rest)\b/i.test(text)) {
    return { problem: 'it mentioned rest time' };
  }
  if (/\b(?:rir|reps?\s+(?:in\s+reserve|to\s+spare|left|shy\s+of\s+failure)|proximity\s+to\s+failure|to\s+failure)\b/i.test(text)) {
    return { problem: 'it mentioned RIR or failure' };
  }

  // Rule 4: Concrete Absolute Load Over Abstract Percentages (ban % and percent/percentage).
  if (/\d+(?:\.\d+)?\s*%|\bpercent(?:age)?\b/i.test(text)) {
    return { problem: 'it used a percentage; use only exact kg/lb figures from the facts' };
  }

  // Rule 5: No Macro Volume Leakage (ban weekly muscle set counts/benchmarks).
  if (
    /\b(?:hard\s+sets?|weekly\s+(?:sets?|volume|target)|sets?\s+this\s+week|this\s+week's\s+(?:sets?|target|volume)|\d+\s+of\s+\d+\s*[–-]\s*\d+)\b/i.test(
      text
    )
  ) {
    return { problem: 'it mentioned weekly sets or hard sets' };
  }

  const allFacts = facts.facts.join(' ');
  const allowed = new Set(allFacts.match(NUMBER) || []);
  const used = text.match(NUMBER) || [];
  const strange = used.find((n) => !allowed.has(n));
  if (strange) return { problem: `it used the number ${strange}, which is not in the facts` };
  const spelled = spelledNumberNotInFacts(text, facts.facts);
  if (spelled) return { problem: `it used the number "${spelled}", which is not in the facts` };
  const wrongUnit = mismatchedWeightUnit(text, facts.facts);
  if (wrongUnit) return { problem: `it used the weight unit "${wrongUnit}", which does not match the facts` };

  // When historical load figures exist in the facts, Line 1 must anchor on a concrete load metric (kg/lb).
  if (/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)\b/i.test(allFacts) && !/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)\b/i.test(rawLines[0])) {
    return { problem: 'Line 1 must include the exact estimated max kg/lb figure from the facts' };
  }

  // Line 1 must lead with plain-English progress against goals, not a bare KPI label dump.
  if (/^(?:estimated\s+max|baseline\s+estimated\s+max|best\s+set|added\s+weight)\s*:/i.test(rawLines[0])) {
    return { problem: 'Line 1 used a bare KPI label; write a plain-English progress sentence anchored to the exact figure instead' };
  }

  // A first-ever session has no history to talk about (unless grounded in an anchor lift's real logged history).
  if (
    /first time you have logged/i.test(allFacts) &&
    !/Anchor lift /i.test(allFacts) &&
    /\b(last time|last session|previous|before|once|again|progress|improv\w*|increas\w*|risen|up \+?\d|consistent\w*|building strength|stronger|so far)\b/i.test(
      text
    )
  ) {
    return { problem: 'this is a first-ever session, so do not claim prior history' };
  }

  // Errors the real on-device model made when rewording these facts. Every load figure in the
  // facts is an estimated max, so it must be called an estimate and never a weight that was lifted,
  // and the facts never describe the last session.
  if (/\byou (lifted|pressed|rowed|pulled|curled|squatted|benched|hit|moved)\b/i.test(text)) {
    return { problem: 'it treated an estimated max as a weight lifted' };
  }
  if (/\b(last|previous|prior) (session|workout|time)\b/i.test(text) && !/\b(last|previous) (session|workout|time)\b/i.test(allFacts)) {
    return { problem: 'it mentioned a previous session not described in the facts' };
  }
  if (/\b(kg|lbs?)\b/i.test(rawLines[0]) && /estimated/i.test(allFacts) && !/\bestimat/i.test(rawLines[0])) {
    return { problem: 'Line 1 gave the load without calling it an estimated max' };
  }

  // No praise the facts don't show, and must pass the Read-Aloud QA Gate (no hollow cheerleading or error leaks).
  if (/\b(consistent\w*|dedicat\w*|never miss\w*)\b/i.test(text)) {
    return { problem: 'it praised consistency not shown in the facts' };
  }
  const qa = runReadAloudQaGate(text);
  if (!qa.passed) {
    return { problem: `it failed the coaching voice gate (${(qa.violations[0] || 'hype, cliché, or judgmental wording').toLowerCase()})` };
  }
  const voiceProblem = checkSummaryVoiceGuidelines(text);
  if (voiceProblem) {
    return { problem: voiceProblem };
  }

  return { text };
}

/**
 * Cleans a model answer and accepts it only if it obeys all 5 Hard Architectural Rules.
 * Returns null to use the deterministic 2-line fallback.
 */
export function acceptExerciseNote(answer: string | null, facts: ExerciseNoteFacts): string | null {
  const checked = checkExerciseNote(answer, facts);
  return checked.problem !== undefined ? null : checked.text;
}

/** Asks the on-device model for the note. Null when no model is ready or its answer fails the checks. */
export async function generateExerciseNote(
  facts: ExerciseNoteFacts,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  const isLive = prompt === promptOnDeviceModel;
  const rejectKey = `note:${facts.key}`;
  if (isLive) {
    const cached = acceptExerciseNote(getCachedExerciseNote(facts.key) ?? null, facts);
    if (cached) return cached;
    if (wasPromptRejected(rejectKey)) return null;
  }

  const run = async (): Promise<string | null> => {
    let problem: string | undefined;
    let sawModelAnswer = false;
    // A model that throws is the same as no model: the fact-based text stays.
    try {
      for (let i = 0; i < attempts; i++) {
        const request = problem
          ? `${buildExerciseNotePrompt(facts)}\n(Your last 2-line summary could not be used because ${problem}. Write it again.)`
          : buildExerciseNotePrompt(facts);
        const answer = await prompt(EXERCISE_NOTE_SYSTEM_PROMPT, request, {
          stateless: true,
          maxTokens: 110,
          timeoutMs: 45_000,
        });
        if (answer === null) return null; // no model, or it failed: don't retry or poison cache
        sawModelAnswer = true;
        const checked = checkExerciseNote(answer, facts);
        if (checked.problem === undefined) return checked.text;
        problem = checked.problem;
      }
      if (isLive && sawModelAnswer) {
        markPromptRejected(rejectKey);
      }
    } catch {
      return null;
    }
    return null;
  };

  if (isLive) {
    return coalesceAiGeneration(rejectKey, run, (text) => cacheExerciseNote(facts.key, text));
  }
  return run();
}

// Generated notes are kept on the device, keyed by their facts, so each is written once.
const CACHE_KEY = 'treise_exercise_notes_v2';
const MAX_CACHED = 80;

export function getCachedExerciseNote(key: string): string | undefined {
  return readCachedAiText(CACHE_KEY, key);
}

export function cacheExerciseNote(key: string, note: string): void {
  writeCachedAiText(CACHE_KEY, key, note, MAX_CACHED);
}
