/**
 * Everything the "Workout finished" screen shows, built from the logged sets, the plan and the
 * athlete's goals: the session report (volume, sets, personal bests), the goals this workout moved,
 * and a short written summary.
 *
 * The summary follows the content strategy's post-session rule: reinforce identity with concrete
 * milestones (+kg, reps), never hype or percentages, and never repeat the figures shown beside it
 * (volume and sets). The on-device model may write it from the same facts; its answer is shown only
 * if every number comes from the facts and it passes the read-aloud gate, otherwise the fact-based
 * text stays. Nothing leaves the device.
 */
import { ActivityLog } from '../engine/activeDays';
import { runReadAloudQaGate } from '../engine/contentStrategy';
import { buildAthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { BiometricLog, ExerciseDefinition, UserProfile, WorkoutSession } from '../engine/types';
import { standardsAge } from '../engine/strengthStandards';
import { AthleteGoal, GoalProgress, buildAthleteGoals, goalsProgressedBy } from './athleteGoals';
import { promptOnDeviceModel } from './onDeviceModel';
import { SessionProgressReport, buildSessionProgressReport } from './sessionReport';
import { calculateWeeklyMuscleVolume } from './storage';

export interface WorkoutFinishInput {
  profile: UserProfile;
  /** Saved workouts, without (or with an unfinished copy of) the one being finished. */
  workouts: WorkoutSession[];
  /** The workout being finished, with its sets as logged. */
  finished: WorkoutSession;
  activities?: ActivityLog[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  /** 7-day average bodyweight; omit when the athlete has never logged a weight. */
  bodyweightKg?: number;
  /** A calculated weight in the athlete's unit, to 0.1 (e.g. "63.3 kg"). */
  formatWeight: (kg: number) => string;
  now?: number;
}

/** A personal best set in this workout: the best of the sets celebrated as they were logged. */
export interface FinishPersonalBest {
  exerciseName: string;
  weightKg: number;
  reps: number;
  /** Bodyweight exercise with no added load: the best is a rep count. */
  isBodyweight: boolean;
}

export interface WorkoutFinish {
  report: SessionProgressReport;
  /** One per exercise, from the same sets the athlete saw celebrated during the workout. */
  personalBests: FinishPersonalBest[];
  /** Every goal after this workout (the knowledge graph's goals). */
  goals: AthleteGoal[];
  /** The goals this workout moved or reached. */
  goalProgress: GoalProgress[];
  /** Short card heading, e.g. "2 personal bests". */
  headline: string;
  /** What the model is given, and what its answer is checked against. */
  facts: string[];
  /** Summary built directly from the facts; shown until (or instead of) the model's. */
  fallback: string;
}

export const WORKOUT_SUMMARY_SYSTEM_PROMPT =
  'You are the pragmatic, observant strength coach in the athlete\'s pocket. They have just finished a workout. ' +
  'Write two or three short sentences to them as "you", using only the facts given: first what this session showed on their lifts, ' +
  'then what it did for their goals. Earned, understated pride. No hype, no greetings, no lists, no percentages. ' +
  'Do not mention total volume or the number of sets. Never say how they felt. Do not use any number that is not in the facts.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listAnd = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The workout's personal bests: for each exercise, the best of the sets that were celebrated when
 * they were logged (`celebratedSetIds`, set by the same rule as the in-workout message), so this
 * screen and those messages can never disagree.
 */
export function personalBestsIn(finished: WorkoutSession): FinishPersonalBest[] {
  const celebrated = new Set(finished.celebratedSetIds ?? []);
  const bests: FinishPersonalBest[] = [];
  for (const ex of finished.exercises) {
    const sets = ex.sets.filter((st) => celebrated.has(st.id) && st.completed && (st.actualReps ?? 0) > 0);
    if (!sets.length) continue;
    const weight = (st: (typeof sets)[number]) => st.actualWeightKg ?? st.targetWeightKg ?? 0;
    const best = sets.reduce((a, b) => (weight(b) > weight(a) || (weight(b) === weight(a) && (b.actualReps ?? 0) > (a.actualReps ?? 0)) ? b : a));
    bests.push({ exerciseName: ex.name, weightKg: weight(best), reps: best.actualReps ?? 0, isBodyweight: weight(best) <= 0 });
  }
  return bests;
}

function describeGoal(g: GoalProgress, formatWeight: (kg: number) => string): string {
  if (g.kind === 'process') {
    return g.status === 'reached'
      ? `${g.title}: done, ${g.current} of ${g.target} sessions this week`
      : `${g.title}: ${g.current} of ${g.target} sessions this week`;
  }
  const [movement, level] = g.title.split(': ');
  return g.status === 'reached'
    ? `${movement} reached ${level}`
    : `${movement} estimated max is ${formatWeight(g.current)} of the ${formatWeight(g.target)} needed for ${level}`;
}

export function buildWorkoutFinish(input: WorkoutFinishInput): WorkoutFinish | null {
  const now = input.now ?? Date.now();
  const before = input.workouts.filter((w) => w.id !== input.finished.id && w.completed);
  const finished: WorkoutSession = {
    ...input.finished,
    completed: true,
    completedAt: input.finished.completedAt ?? new Date(now).toISOString(),
  };
  const after = [...before, finished];
  const hasWeighIn = input.biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const bodyweightKg = hasWeighIn ? input.bodyweightKg : undefined;

  const knowledgeGraph = buildAthleteKnowledgeGraph(
    after,
    input.biometrics,
    input.exerciseCatalog,
    input.profile,
    calculateWeeklyMuscleVolume(after, input.exerciseCatalog),
    input.activities ?? []
  );
  const report = buildSessionProgressReport({
    workouts: after,
    exerciseCatalog: input.exerciseCatalog,
    knowledgeGraph,
    bodyweightKg,
    gender: input.profile.gender,
    age: standardsAge(input.profile),
    now,
  });
  if (!report) return null;

  const goalsInput = { profile: input.profile, activities: input.activities, biometrics: input.biometrics, bodyweightKg };
  const goalsBefore = buildAthleteGoals({ ...goalsInput, workouts: before });
  const goals = knowledgeGraph.goals;
  const goalProgress = goalsProgressedBy(goalsBefore, goals);

  const { firstTimeExercises } = report;
  const records = personalBestsIn(finished);
  const trainedCount = report.session.exerciseCount;
  const allNew = trainedCount > 0 && firstTimeExercises.length === trainedCount;
  const outcomeReached = goalProgress.find((g) => g.kind === 'outcome' && g.status === 'reached');
  const processGoal = goalProgress.find((g) => g.kind === 'process');

  const headline = outcomeReached
    ? `${outcomeReached.title.split(': ')[1]} reached`
    : records.length > 0
    ? plural(records.length, 'personal best')
    : processGoal?.status === 'reached'
    ? `Week ${goals.find((g) => g.kind === 'process')?.week ?? 1} complete`
    : allNew
    ? 'Starting point set'
    : 'Session logged';

  // The summary says what moved without restating the set figures on the cards beside it.
  const facts: string[] = [`Workout finished: ${report.session.name}.`];
  const sentences: string[] = [];
  if (records.length > 0) {
    const names = records.map((r) => r.exerciseName);
    facts.push(`Lifts that beat their previous best today (${records.length}): ${listAnd(names)}.`);
    const more = names.length - 2;
    sentences.push(
      names.length === 1
        ? `${names[0]} beat its previous best today.`
        : `${names.length} lifts beat their previous best today: ${more > 0 ? `${names[0]}, ${names[1]} and ${more} more` : listAnd(names)}.`
    );
  } else if (allNew) {
    facts.push('Every exercise today was logged for the first time, so these sets are the starting point.');
    sentences.push('Every lift today was a first, so these sets are your starting point: the next session has something to beat.');
  } else {
    facts.push('No personal bests today; the loads and reps held at their current level.');
    sentences.push('No personal bests today. Holding your current loads with clean reps is what the next increase is built on.');
  }
  // The longer view on one lift: its estimated max since the first session on it (concrete load).
  const climbing = [...report.trends]
    .map((t) => ({ ...t, gainKg: t.latestE1rmKg - t.firstE1rmKg }))
    .filter((t) => t.gainKg >= 0.1)
    .sort((x, y) => y.gainKg - x.gainKg)[0];
  const trendSentence = climbing
    ? `${climbing.exerciseName} estimated max is now ${input.formatWeight(climbing.latestE1rmKg)}, up +${input.formatWeight(climbing.gainKg)} across ${climbing.sessions} sessions.`
    : '';
  if (trendSentence) facts.push(trendSentence);
  if (firstTimeExercises.length > 0 && !allNew) {
    facts.push(`Logged for the first time: ${listAnd(firstTimeExercises)}.`);
  }
  for (const g of goalProgress) facts.push(`Goal ${g.status}: ${describeGoal(g, input.formatWeight)}.`);
  const outcomes = goalProgress.filter((g) => g.kind === 'outcome');
  if (outcomes.length > 0) sentences.push(`${describeGoal(outcomes[0], input.formatWeight)}.`);
  else if (trendSentence) sentences.push(trendSentence);
  if (processGoal) {
    sentences.push(
      processGoal.status === 'reached'
        ? `That's all ${processGoal.target} sessions done this week.`
        : `That's ${processGoal.current} of ${processGoal.target} sessions this week.`
    );
  }

  return { report, personalBests: records, goals, goalProgress, headline, facts, fallback: sentences.join(' ') };
}

export function buildWorkoutSummaryPrompt(finish: Pick<WorkoutFinish, 'facts'>): string {
  return `Facts:\n${finish.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the summary.`;
}

const NUMBER = /\d+(?:\.\d+)?/g;

/** The cleaned summary, or why it can't be shown (in words the model can act on in a second try). */
export function checkWorkoutSummary(
  answer: string | null,
  finish: Pick<WorkoutFinish, 'facts'>
): { text: string; problem?: undefined } | { text?: undefined; problem: string } {
  if (!answer) return { problem: 'it was empty' };
  const text = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(summary|message|note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 40) return { problem: 'it was too short' };
  if (text.length > 360) return { problem: 'it was too long; write two or three short sentences' };
  if ((text.match(/[.!?](\s|$)/g) || []).length > 4) return { problem: 'it had too many sentences; write two or three' };
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return { problem: 'it talked about itself or "the facts"' };
  if (!runReadAloudQaGate(text).passed) return { problem: 'it used hype, a cliché or judgmental wording' };
  if (/\d\s*%|\bpercent/i.test(text)) return { problem: 'it used a percentage; use the figures as given' };
  if (/\b(felt|feel|feeling|enjoy(ed)?|loved)\b/i.test(text)) return { problem: 'it said how the athlete felt, which is not known' };
  if (/\b(volume|tonnage|\d+\s+(working\s+|hard\s+)?sets?)\b/i.test(text)) return { problem: 'it mentioned volume or a number of sets, which are shown beside it' };
  const allFacts = finish.facts.join(' ');
  const allowed = new Set(allFacts.match(NUMBER) || []);
  const strange = (text.match(NUMBER) || []).find((n) => !allowed.has(n));
  if (strange) return { problem: `it used the number ${strange}, which is not in the facts` };
  if (/\b(personal best|PR|record)s?\b/i.test(text) && !/beat their previous best/.test(allFacts)) return { problem: 'it mentioned a personal best the facts do not show' };
  if (/\b(significant\w*|dramatic\w*|huge|massive|incredibl\w*|amazing|awesome)\b/i.test(text)) return { problem: 'it used a size or hype word the facts do not support' };
  return { text };
}

/** Asks the on-device model for the summary. Null when no model is ready or its answers fail the checks. */
export async function generateWorkoutSummary(
  finish: Pick<WorkoutFinish, 'facts'>,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  let problem: string | undefined;
  for (let i = 0; i < attempts; i++) {
    const request = problem
      ? `${buildWorkoutSummaryPrompt(finish)}\n(Your last summary could not be used because ${problem}. Write it again.)`
      : buildWorkoutSummaryPrompt(finish);
    const answer = await prompt(WORKOUT_SUMMARY_SYSTEM_PROMPT, request, { stateless: true, timeoutMs: 30_000 });
    if (answer === null) return null;
    const checked = checkWorkoutSummary(answer, finish);
    if (checked.problem === undefined) return checked.text;
    problem = checked.problem;
  }
  return null;
}
