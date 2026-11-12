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
import { MUSCLE_BUILDING_PLAN, PlanOverview, TrainingPlan } from '../engine/muscleBuildingProgram';
import { MUSCLE_FRIENDLY_NAMES, getWorkoutCompletedAt } from '../engine/recovery';
import { calculateE1RM } from '../engine/e1rm';
import { runReadAloudQaGate } from '../engine/contentStrategy';
import { ExerciseDefinition, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';
import { promptOnDeviceModel } from './onDeviceModel';
import { strengthTrend } from './strengthTrend';
import { mislabelledFigure, markPromptRejected, spelledNumberNotInFacts, wasPromptRejected } from './factChecks';
import { MUSCLE_TO_GRAPH_KEY } from './sessionReport';

export interface IdentityMessageInput {
  plan: PlanOverview;
  /** The plan the overview is for (phases, workouts per week). Defaults to the muscle plan. */
  trainingPlan?: TrainingPlan;
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
  'they are becoming, using their real progress; then, how their next workout moves them forward. Grounded and plain, like a pragmatic coach: no hype, no greetings, lists ' +
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

export function buildIdentityFacts(input: IdentityMessageInput): IdentityMessageFacts {
  const { plan, workouts, exerciseCatalog, knowledgeGraph } = input;
  const now = input.now ?? Date.now();
  const facts: string[] = [];
  const next = plan.workouts.find((w) => w.workoutNumber === plan.nextWorkoutNumber)!;
  const trainingPlan = input.trainingPlan ?? MUSCLE_BUILDING_PLAN;
  const phase = trainingPlan.phases.find((p) => p.phaseNumber === plan.activePhase) ?? trainingPlan.phases[0];
  // The same week the Program page and the coach give (the plan's own, never past week 6).
  const week =
    trainingPlan.templates.find((t) => t.workoutNumber === plan.nextWorkoutNumber)?.week ??
    Math.min(6, Math.ceil(plan.nextWorkoutNumber / trainingPlan.workoutsPerWeek));
  const completed = plan.completedCount;

  facts.push(`Sessions finished in this plan: ${completed} of ${trainingPlan.templates.length}.`);
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

    // Active days fill plan sessions too, but they aren't workouts.
    const activeDaysDone = completed - runSessions.length;
    if (activeDaysDone > 0) facts.push(`Workouts finished: ${runSessions.length}. Active days finished: ${activeDaysDone}.`);
    const doneText =
      activeDaysDone > 0
        ? `${plural(runSessions.length, 'workout')} and ${plural(activeDaysDone, 'active day')} done`
        : completed === 1
        ? 'Your first workout is done'
        : `${completed} workouts done`;
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
  // "side shoulders" already covers "shoulders"; listing both reads as a repeat.
  const trains = muscles.filter((m) => !muscles.some((o) => o !== m && o.endsWith(` ${m}`))).slice(0, 3);
  facts.push(`Next workout: ${next.label} (workout ${next.workoutNumber})${trains.length ? `, training your ${listWords(trains)}` : ''}.`);
  const behind = knowledgeGraph?.muscleProfiles.find(
    (m) => graphKeys.includes(m.muscleKey) && m.weeklySets < m.personalizedMav[0]
  );
  if (behind) {
    // No figures here: given the set counts, the real model read them as the next workout's sets
    // ("you'll be performing 6.5 hard sets", "aiming for 17–27"). The fact-based message states them.
    facts.push(`${behind.displayName} are below target for the week so far; the next workout adds to them.`);
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

  // "Full Body A" keeps its capitals; "Chest and Back" reads as "chest and back" mid-sentence.
  const nextName = /\s[A-Z]$/.test(next.label) ? next.label : next.label.toLowerCase();
  const focus = trains.length ? `your ${listWords(trains.slice(0, 2))}` : nextName;
  let nextSentence: string;
  if (completed === 0) {
    nextSentence = `Every workout you finish shapes the athlete you're becoming. Your first workout, ${nextName}, is ready when you are.`;
  } else {
    // Name the muscle the set count belongs to (it may not be one of the first ones listed).
    nextSentence = `Next up is ${nextName}, a chance to build ${focus}${
      behind
        ? `. You're at ${behind.weeklySets} of ${behind.personalizedMav[0]}–${behind.personalizedMav[1]} sets for ${behind.displayName.toLowerCase()} this week`
        : ''
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
  const checked = checkIdentityMessage(answer, facts);
  return checked.problem !== undefined ? null : checked.text;
}

/** The cleaned message, or why it can't be shown (in words the model can act on in a second try). */
export function checkIdentityMessage(answer: string | null, facts: IdentityMessageFacts): { text: string; problem?: undefined } | { text?: undefined; problem: string } {
  if (!answer) return { problem: 'it was empty' };
  const text = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(message|note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 60) return { problem: 'it was too short' };
  if (text.length > 420) return { problem: 'it was too long; write two or three sentences' };
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return { problem: 'it talked about itself or "the facts" instead of the athlete' };
  // The app never asks how a workout felt, so the message can't say.
  if (/\b(felt|feel|feeling|enjoy(ed)?|loved)\b/i.test(text)) return { problem: 'it said how the athlete felt, which is not known' };
  if ((text.match(/[.!?](\s|$)/g) || []).length > 4) return { problem: 'it had too many sentences; write two or three' };
  // The content strategy's read-aloud gate: no hype, clichés, judgmental wording or error leaks.
  if (!runReadAloudQaGate(text).passed) return { problem: 'it used hype, a cliché or judgmental wording' };
  if (/\d\s*%|\bpercent/i.test(text)) return { problem: 'it used a percentage; use the figures as given' };
  const allFacts = facts.facts.join(' ');
  const allowed = new Set(allFacts.match(NUMBER) || []);
  const strange = (text.match(NUMBER) || []).find((n) => !allowed.has(n));
  if (strange) return { problem: `it used the number ${strange}, which is not in the facts` };
  // Where the athlete is in a phase or the plan is only what the facts state ("week 3 of 6"); the
  // real model turned that into "nearing the end of Phase 2".
  if (/\b(near\w*|approach\w*|close to|reach\w*) the (end|start|middle|finish)\b|\b(half-?way|almost (done|finished|there|complete)|(final|last) (week|phase|stretch|session))\b/i.test(text)) {
    return { problem: 'it described how far through a phase or the plan the athlete is, beyond what the facts state' };
  }
  // The plan's total is the whole plan's, not one phase's (an error the real model made).
  if (/\b(of|out of)( the)? \d+( planned| total| sessions| workouts)*,? (in|for|of|during|planned for|planned in) (this |the |current )?phase\b/i.test(text)) return { problem: 'it gave the plan total as a phase total' };
  const spelled = spelledNumberNotInFacts(text, facts.facts);
  if (spelled) return { problem: `it used the number "${spelled}", which is not in the facts` };
  const mislabelled = mislabelledFigure(text, facts.facts);
  if (mislabelled) return { problem: `it said "${mislabelled}", but the facts count that figure in something else` };
  if (/\btarget\b/i.test(text) && !/below target/.test(allFacts)) return { problem: 'it mentioned a target the facts do not give' };
  if (/\b(personal best|PR)s?\b/i.test(text) && !/personal best/i.test(allFacts)) return { problem: 'it mentioned personal bests the facts do not show' };
  // Size words must match the figures: "most" needs more than half the repeated lifts up, and the
  // facts never measure how big a change was, so "significantly" or "huge" can't be said.
  const trend = /Estimated strength is up on (\d+) of (\d+) lifts/.exec(allFacts);
  const share = trend ? Number(trend[1]) / Number(trend[2]) : 0;
  if (/\b(most|majority|nearly all|almost all|every|all of)\b/i.test(text) && share <= 0.5) return { problem: 'it said "most" or "all" where the facts show half or fewer' };
  if (/\b(significant\w*|dramatic\w*|huge|massive|substantial\w*|enormous|remarkabl\w*|incredibl\w*)\b/i.test(text)) return { problem: 'it used a size word like "significant" or "huge" that the facts do not measure' };
  // Sets for the next workout or the week are never in the facts, so no set count for them can be said.
  if (/\b(aim\w*|perform\w*|do|doing|complete|completing|target\w*)\b[^.!?]{0,40}\b\d+(?:\.\d+)?(?:\s*[–-]\s*\d+)?\s*(hard\s+)?sets\b/i.test(text)) return { problem: 'it gave a number of sets to do, which the facts do not give' };
  // The facts give how many sets were logged, never that sets, reps or volume went up (an error the
  // real model made).
  if (/\b(increas\w*|more|add\w*|rais\w*|grow\w*)\b[^.!?]{0,30}\b(sets?|volume|reps)\b/i.test(text)) return { problem: 'it said sets, reps or volume went up, which the facts do not show' };
  // No praise for consistency unless the facts show regular training.
  const recent = Number(/Workouts in the last 14 days: (\d+)/.exec(allFacts)?.[1] ?? 0);
  if (/\b(consistent\w*|dedicat\w*)\b/i.test(text) && recent < 6) return { problem: 'it praised consistency the facts do not show' };
  return { text };
}

/** Asks the on-device model for the message. Null when no model is ready or its answer fails the checks. */
export async function generateIdentityMessage(
  facts: IdentityMessageFacts,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  // Before the first finished session there is no progress to write about; the fact-based
  // welcome is the message.
  if (facts.facts.some((f) => /^Sessions finished in this plan: 0 of /.test(f))) return null;
  const rejectKey = `identity:${facts.key}`;
  if (prompt === promptOnDeviceModel && wasPromptRejected(rejectKey)) return null;
  let problem: string | undefined;
  let sawModelAnswer = false;
  // A model that throws is the same as no model: the fact-based text stays.
  try {
    for (let i = 0; i < attempts; i++) {
      // A second try is told what was wrong with the first, so it isn't the same mistake again.
      const request = problem
        ? `${buildIdentityPrompt(facts)}\n(Your last message could not be used because ${problem}. Write it again.)`
        : buildIdentityPrompt(facts);
      const answer = await prompt(IDENTITY_SYSTEM_PROMPT, request, { stateless: true, maxTokens: 130, timeoutMs: 45_000 });
      if (answer === null) return null; // no model, or it failed: don't retry
      sawModelAnswer = true;
      const checked = checkIdentityMessage(answer, facts);
      if (checked.problem === undefined) return checked.text;
      problem = checked.problem;
    }
    if (prompt === promptOnDeviceModel && sawModelAnswer) markPromptRejected(rejectKey);
  } catch {
    return null;
  }
  return null;
}

// Generated messages are kept on the device, keyed by their facts, so each is written once.
const CACHE_KEY = 'treise_identity_message_v1';
const MAX_CACHED = 12;

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

export function getCachedIdentityMessage(key: string): string | undefined {
  const hit = readCache()[key];
  return typeof hit === 'string' ? hit : undefined;
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
