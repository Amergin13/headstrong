/**
 * The message under "Your new identity as an athlete is forming" on the Program page.
 *
 * Facts come from the athlete's own plan, workout history and knowledge graph. The on-device model
 * (Gemini Nano, or the downloaded phone-GPU model) writes the message from those facts; every number
 * it uses must appear in them and it may not claim how the athlete felt, otherwise the fact-based
 * fallback is shown. Prompts and answers never leave the device.
 */
import { AthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { evaluateExerciseProgress } from '../engine/milestones';
import { PROGRAM_PHASES, PlanOverview } from '../engine/muscleBuildingProgram';
import { MUSCLE_FRIENDLY_NAMES, getWorkoutCompletedAt } from '../engine/recovery';
import { calculateE1RM } from '../engine/e1rm';
import { ExerciseDefinition, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';
import { promptOnDeviceModel } from './onDeviceModel';
import { MUSCLE_TO_GRAPH_KEY } from './sessionReport';

export interface IdentityMessageInput {
  plan: PlanOverview;
  /** All saved workouts. */
  workouts: WorkoutSession[];
  /** The next plan workout as it will be trained. */
  nextSession?: WorkoutSession;
  exerciseCatalog: ExerciseDefinition[];
  knowledgeGraph?: AthleteKnowledgeGraph;
  readinessState?: ReadinessState;
  bodyweightKg?: number;
  now?: number;
}

export interface IdentityMessageFacts {
  /** Changes whenever any fact changes; used to cache the generated message. */
  key: string;
  facts: string[];
  /** Personal message built directly from the facts, shown until (or instead of) the model's. */
  fallback: string;
}

export const IDENTITY_SYSTEM_PROMPT =
  'You write the short message at the top of an athlete\'s training plan, under the heading "Your new identity as an athlete is forming". ' +
  'Use only the facts given. Write two or three sentences to the athlete as "you": first, what their training so far shows about the athlete ' +
  'they are becoming, using their real progress; then, how their next workout moves them forward. Warm, plain English. No greetings, lists ' +
  'or headings. Never say how they felt. Do not use any number that is not in the facts.';

const DAY = 24 * 60 * 60 * 1000;
const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const done = (s: WorkoutSet) => s.completed && isWorking(s) && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** Personal bests set in each session, in order, compared with every earlier set of that exercise. */
function personalBestsBySession(sessions: WorkoutSession[], earlier: WorkoutSession[]): Map<WorkoutSession, number> {
  const best = new Map<string, { weight: number; reps: number }>();
  const record = (exerciseId: string, s: WorkoutSet) => {
    const w = weightOf(s);
    const r = s.actualReps ?? 0;
    const b = best.get(exerciseId);
    if (!b || w > b.weight || (w === b.weight && r > b.reps)) best.set(exerciseId, { weight: w, reps: r });
  };
  for (const w of earlier) for (const ex of w.exercises) ex.sets.filter(done).forEach((s) => record(ex.exerciseId, s));
  const counts = new Map<WorkoutSession, number>();
  for (const w of sessions) {
    let n = 0;
    for (const ex of w.exercises) {
      for (const s of ex.sets.filter(done)) {
        const b = best.get(ex.exerciseId);
        if (b && evaluateExerciseProgress(ex.name, weightOf(s), s.actualReps ?? 0, b.weight, b.reps, ex.maxReps || 12)) n++;
        record(ex.exerciseId, s);
      }
    }
    counts.set(w, n);
  }
  return counts;
}

/** Lifts done at least twice in these sessions, and how many of them have a higher estimated max now. */
function strengthTrend(sessions: WorkoutSession[], bodyweightKg: number): { repeated: number; improved: number } {
  const byExercise = new Map<string, number[]>();
  for (const w of sessions) {
    for (const ex of w.exercises) {
      const top = ex.sets.filter(done).reduce((m, s) => {
        const e = calculateE1RM(
          weightOf(s),
          s.actualReps ?? 0,
          s.actualRir ?? s.targetRir ?? 2,
          ex.equipment,
          ex.isRdl,
          ex.isWeightedCalisthenic,
          bodyweightKg,
          ex.exerciseId,
          ex.pillar
        );
        return Math.max(m, e);
      }, 0);
      if (top > 0) byExercise.set(ex.exerciseId, [...(byExercise.get(ex.exerciseId) ?? []), top]);
    }
  }
  const series = [...byExercise.values()].filter((v) => v.length >= 2);
  return { repeated: series.length, improved: series.filter((v) => v[v.length - 1] > v[0] * 1.005).length };
}

export function buildIdentityFacts(input: IdentityMessageInput): IdentityMessageFacts {
  const { plan, workouts, exerciseCatalog, knowledgeGraph } = input;
  const now = input.now ?? Date.now();
  const facts: string[] = [];
  const next = plan.workouts.find((w) => w.workoutNumber === plan.nextWorkoutNumber)!;
  const phase = PROGRAM_PHASES.find((p) => p.phaseNumber === plan.activePhase) ?? PROGRAM_PHASES[0];
  const week = Math.ceil(plan.nextWorkoutNumber / 4);
  const completed = plan.completedCount;

  facts.push(`Workouts finished in this plan: ${completed} of 24.`);
  facts.push(`Current phase: Phase ${phase.phaseNumber} (${phase.shortName.toLowerCase()}), week ${week} of 6.`);

  // History in this run of the plan, oldest first.
  const runSessions = plan.workouts
    .map((w) => w.session)
    .filter((w): w is WorkoutSession => Boolean(w))
    .sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  const firstAt = runSessions.length ? getWorkoutCompletedAt(runSessions[0]) : now;
  const earlier = workouts.filter((w) => w.completed && getWorkoutCompletedAt(w) < firstAt);
  const pbs = personalBestsBySession(runSessions, earlier);
  const totalPbs = [...pbs.values()].reduce((a, b) => a + b, 0);
  const trend = strengthTrend(runSessions, input.bodyweightKg ?? 80);

  let progressSentence = '';
  if (runSessions.length > 0) {
    const last = runSessions[runSessions.length - 1];
    const lastLabel = plan.workouts.find((w) => w.session === last)?.label ?? last.name;
    const daysAgo = Math.max(0, Math.floor((now - getWorkoutCompletedAt(last)) / DAY));
    const when = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
    const sets = last.exercises.reduce((n, ex) => n + ex.sets.filter(done).length, 0);
    const lastPbs = pbs.get(last) ?? 0;
    facts.push(
      `Last workout: ${lastLabel}, ${when}, ${plural(sets, 'working set')} logged${lastPbs > 0 ? `, ${plural(lastPbs, 'personal best')}` : ''}.`
    );
    if (totalPbs > 0) facts.push(`Personal bests in this plan so far: ${totalPbs}.`);
    if (trend.repeated > 0) {
      facts.push(`Estimated strength is up on ${trend.improved} of ${trend.repeated} lifts done more than once in this plan.`);
    }
    const recent = workouts.filter((w) => w.completed && now - getWorkoutCompletedAt(w) <= 14 * DAY).length;
    facts.push(`Workouts in the last 14 days: ${recent}.`);

    const doneText = completed === 1 ? 'Your first workout is done' : `${completed} workouts done`;
    progressSentence = `${doneText}${totalPbs > 0 ? `, with ${plural(totalPbs, 'personal best')} along the way` : ''}.`;
    if (trend.improved > 0) {
      progressSentence += ` Your estimated strength is already up on ${trend.improved} of the ${plural(trend.repeated, 'lift')} you've repeated.`;
    } else if (recent >= 2) {
      progressSentence += ` That's ${recent} workouts in the last 14 days: showing up is who you are now.`;
    }
  }

  // What the next workout trains, and where the knowledge graph says those muscles stand this week.
  const muscles: string[] = [];
  const graphKeys: string[] = [];
  for (const ex of input.nextSession?.exercises ?? []) {
    const def = exerciseCatalog.find((d) => d.id === ex.exerciseId);
    if (!def) continue;
    const friendly = MUSCLE_FRIENDLY_NAMES[def.primaryMuscle]?.toLowerCase();
    if (friendly && !muscles.includes(friendly)) muscles.push(friendly);
    const key = MUSCLE_TO_GRAPH_KEY[def.primaryMuscle];
    if (key && !graphKeys.includes(key)) graphKeys.push(key);
  }
  const trains = muscles.slice(0, 3);
  facts.push(`Next workout: ${next.label} (workout ${next.workoutNumber})${trains.length ? `, training your ${listWords(trains)}` : ''}.`);
  const behind = knowledgeGraph?.muscleProfiles.find(
    (m) => graphKeys.includes(m.muscleKey) && m.weeklySets < m.personalizedMav[0]
  );
  if (behind) {
    const [min, max] = behind.personalizedMav;
    facts.push(`${behind.displayName} this week: ${behind.weeklySets} hard sets against a target of ${min}–${max} (below target).`);
  }
  const readiness = input.readinessState;
  if (readiness) {
    facts.push(
      readiness === 'Amber Shield'
        ? 'Recovery today is low.'
        : readiness === 'Primed'
        ? 'Recovery today is high.'
        : 'Recovery today is normal.'
    );
  }

  const nextName = next.label.toLowerCase();
  const focus = trains.length ? `your ${listWords(trains.slice(0, 2))}` : nextName;
  let nextSentence: string;
  if (completed === 0) {
    nextSentence = `Every workout you finish shapes the athlete you're becoming. Your first workout, ${nextName}, is ready when you are.`;
  } else {
    nextSentence = `Next up is ${nextName}, a chance to build ${focus}${
      behind ? `, where you're at ${behind.weeklySets} of ${behind.personalizedMav[0]}–${behind.personalizedMav[1]} sets this week` : ''
    }.`;
    if (readiness === 'Amber Shield') nextSentence += ' Recovery is low today, so a steady session still counts.';
    else if (readiness === 'Primed') nextSentence += " You're well recovered, so it's a good day to push.";
  }

  return {
    key: hash(`${IDENTITY_SYSTEM_PROMPT}\n${facts.join('\n')}`),
    facts,
    fallback: [progressSentence, nextSentence].filter(Boolean).join(' '),
  };
}

export function buildIdentityPrompt(facts: IdentityMessageFacts): string {
  return `Facts:\n${facts.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the message.`;
}

const NUMBER = /\d+(?:\.\d+)?/g;

/**
 * Cleans a model answer and accepts it only if it reads as a short message, every number in it
 * comes from the facts, and it makes no claim the facts can't support. Returns null to use the
 * fallback.
 */
export function acceptIdentityMessage(answer: string | null, facts: IdentityMessageFacts): string | null {
  if (!answer) return null;
  const text = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(message|note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 60 || text.length > 420) return null;
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return null;
  // The app never asks how a workout felt, so the message can't say.
  if (/\b(felt|feel|feeling|enjoy(ed)?|loved)\b/i.test(text)) return null;
  if ((text.match(/[.!?](\s|$)/g) || []).length > 4) return null;
  const allFacts = facts.facts.join(' ');
  const allowed = new Set(allFacts.match(NUMBER) || []);
  if ((text.match(NUMBER) || []).some((n) => !allowed.has(n))) return null;
  if (/\btarget\b/i.test(text) && !/below target/.test(allFacts)) return null;
  if (/\b(personal best|PR)s?\b/i.test(text) && !/personal best/i.test(allFacts)) return null;
  return text;
}

/** Asks the on-device model for the message. Null when no model is ready or its answer fails the checks. */
export async function generateIdentityMessage(
  facts: IdentityMessageFacts,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const answer = await prompt(IDENTITY_SYSTEM_PROMPT, buildIdentityPrompt(facts), { stateless: true, timeoutMs: 45_000 });
    if (answer === null) return null; // no model, or it failed: don't retry
    const accepted = acceptIdentityMessage(answer, facts);
    if (accepted) return accepted;
  }
  return null;
}

// Generated messages are kept on the device, keyed by their facts, so each is written once.
const CACHE_KEY = 'treise_identity_message_v1';
const MAX_CACHED = 12;

function readCache(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCachedIdentityMessage(key: string): string | undefined {
  return readCache()[key];
}

export function cacheIdentityMessage(key: string, message: string): void {
  try {
    const entries = Object.entries(readCache()).filter(([k]) => k !== key);
    entries.push([key, message]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_CACHED))));
  } catch {
    // Storage unavailable: the message is simply generated again next time.
  }
}
