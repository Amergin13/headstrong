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
import { AthleteGoal, GoalProgress, buildAthleteGoals, describeGoalStanding, goalsProgressedBy } from './athleteGoals';
import { promptOnDeviceModel } from './onDeviceModel';
import { mislabelledFigure, markPromptRejected, spelledNumberNotInFacts, wasPromptRejected } from './factChecks';
import { SessionProgressReport, buildSessionProgressReport } from './sessionReport';
import { calculateWeeklyMuscleVolume } from './storage';
import { ExerciseInsight, buildExerciseInsight } from './exerciseInsight';

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
  'Do not mention total volume or the number of sets. Never say how they felt. Do not praise or judge: state what happened. ' +
  'Keep each figure tied to what its fact measures (a gain across several sessions is not a gain today). Do not use any number that is not in the facts.';

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
  const standing = describeGoalStanding(g.goal, formatWeight);
  if (g.kind === 'process') return g.status === 'reached' ? `${g.title}: done, ${standing}` : `${g.title}: ${standing}`;
  if (g.goal.measure.type === 'target') {
    const m = g.goal.measure;
    const target = m.metric === 'weight' ? formatWeight(m.target) : `${m.target} reps`;
    return g.status === 'reached' ? `${m.exerciseName} reached ${target}` : `${m.exerciseName} is at ${standing}`;
  }
  const [movement, level] = g.title.split(': ');
  return g.status === 'reached' ? `${movement} reached ${level}` : `${movement} is at ${standing} for ${level}`;
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

  const goalsInput = { profile: input.profile, activities: input.activities, biometrics: input.biometrics, bodyweightKg, now };
  const goalsBefore = buildAthleteGoals({ ...goalsInput, workouts: before });
  // Before and after are built the same way and at the same moment, so only the workout differs.
  const goals = buildAthleteGoals({ ...goalsInput, workouts: after });
  const goalProgress = goalsProgressedBy(goalsBefore, goals);

  const { firstTimeExercises } = report;
  const records = personalBestsIn(finished);
  const trainedCount = report.session.exerciseCount;
  const allNew = trainedCount > 0 && firstTimeExercises.length === trainedCount;
  const outcomeReached = goalProgress.find((g) => g.kind === 'outcome' && g.status === 'reached');
  const processGoal = goalProgress.find((g) => g.kind === 'process');

  const reachedLabel =
    outcomeReached?.goal.measure.type === 'target'
      ? outcomeReached.goal.measure.metric === 'weight'
        ? input.formatWeight(outcomeReached.goal.measure.target)
        : `${outcomeReached.goal.measure.target} reps`
      : outcomeReached?.title.split(': ')[1] ?? outcomeReached?.title;

  const headline = outcomeReached
    ? `${reachedLabel} reached`
    : records.length > 0
    ? plural(records.length, 'personal best')
    : processGoal?.status === 'reached'
    ? `${processGoal.goal.target} sessions this week`
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
  if (outcomes.length > 0) sentences.push(`${describeGoal(outcomeReached ?? outcomes[0], input.formatWeight)}.`);
  else if (trendSentence) sentences.push(trendSentence);
  if (processGoal) {
    sentences.push(
      processGoal.status === 'reached'
        ? `That's all ${processGoal.goal.target} sessions done this week.`
        : `That's ${processGoal.goal.current} of ${processGoal.goal.target} sessions this week.`
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
  // A gain measured across several sessions must not be reported as today's gain.
  const acrossSessions = /up \+(\d+(?:\.\d+)?) [a-z]+ across \d+ sessions/.exec(allFacts)?.[1];
  if (acrossSessions) {
    const sentence = text.split(/(?<=[.!?])\s+/).find((part) => part.includes(acrossSessions) && /\b(today|this session|this workout)\b/i.test(part) && !/\bacross\b|\bsessions\b|\bsince\b|\bover\b/i.test(part));
    if (sentence) return { problem: `it said the ${acrossSessions} gain happened today, but it is across several sessions` };
  }
  // Errors the real on-device model made when rewording these facts.
  // The facts never compare today with the session before it.
  if (/\b(previous|last|prior) (session|workout|measurement|time|week)\b/i.test(text)) return { problem: 'it compared today with the previous session, which the facts do not do' };
  // Only a goal the facts mark as reached may be called met.
  if (!/Goal reached/.test(allFacts) && /\b(fulfil\w*|meets?|met|achiev\w*|maintain\w*|hit\w*|secur\w*|ensur\w*)\b[^.!?]*\b(target|goal|schedule|frequency|plan|week)\b|\b(target|goal|schedule|frequency)\b[^.!?]*\b(is|was|been) (met|reached|achieved|fulfilled|maintained)\b/i.test(text)) {
    return { problem: 'it said a goal or the week was met, but the facts only show progress toward it' };
  }
  // An estimated max is an estimate, not a weight lifted today.
  const estimate = /estimated max is now (\d+(?:\.\d+)?)/.exec(allFacts)?.[1];
  if (estimate) {
    const loose = text.split(/(?<=[.!?])\s+/).find((part) => part.includes(estimate) && !/\bestimat/i.test(part));
    if (loose) return { problem: `it gave ${estimate} without saying it is an estimated max` };
  }
  const allowed = new Set(allFacts.match(NUMBER) || []);
  const strange = (text.match(NUMBER) || []).find((n) => !allowed.has(n));
  if (strange) return { problem: `it used the number ${strange}, which is not in the facts` };
  const spelled = spelledNumberNotInFacts(text, finish.facts);
  if (spelled) return { problem: `it used the number "${spelled}", which is not in the facts` };
  const mislabelled = mislabelledFigure(text, finish.facts);
  if (mislabelled) return { problem: `it said "${mislabelled}", but the facts count that figure in something else` };
  if (/\b(personal best|PR|record)s?\b/i.test(text) && !/beat their previous best|personal bests?/i.test(allFacts)) return { problem: 'it mentioned a personal best the facts do not show' };
  if (/\b(significant\w*|dramatic\w*|huge|massive|incredibl\w*|amazing|awesome)\b/i.test(text)) return { problem: 'it used a size or hype word the facts do not support' };
  if (/\b(consistent\w*|dedicat\w*|progressing well|going well|great|excellent|impressive|solid|strong (work|effort|progress)|(good|nice) (work|job|session)|well done|keep it up|(on|staying on) (schedule|track))\b/i.test(text)) return { problem: 'it praised consistency or quality that the facts do not show; state the figures plainly' };
  return { text };
}

/**
 * Whether the on-device model is asked to reword the workout summary. Off: tested on Gemini Nano
 * (Chrome 153, Nov 2026), its rewordings changed what the figures meant (a gain across sessions
 * became "since the previous session", 2 of 4 sessions became "the week's target is met", an
 * estimated max became a weight lifted). With checks for those, none of 8 tries passed, so asking
 * only made the athlete wait. The fact-based summary is accurate and is what shows. The checks stay
 * for when a model can do this.
 */
export const WORKOUT_SUMMARY_USES_MODEL = true;

/** Asks the on-device model for the summary. Null when no model is ready or its answers fail the checks. */
export async function generateWorkoutSummary(
  finish: Pick<WorkoutFinish, 'facts'>,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  if (!WORKOUT_SUMMARY_USES_MODEL && prompt === promptOnDeviceModel) return null;
  const rejectKey = `workout:${summaryKey(finish)}`;
  if (prompt === promptOnDeviceModel && wasPromptRejected(rejectKey)) return null;
  let problem: string | undefined;
  let sawModelAnswer = false;
  // A model that throws is the same as no model: the fact-based text stays.
  try {
    for (let i = 0; i < attempts; i++) {
      const request = problem
        ? `${buildWorkoutSummaryPrompt(finish)}\n(Your last summary could not be used because ${problem}. Write it again.)`
        : buildWorkoutSummaryPrompt(finish);
      const answer = await prompt(WORKOUT_SUMMARY_SYSTEM_PROMPT, request, { stateless: true, maxTokens: 120, timeoutMs: 30_000 });
      if (answer === null) return null;
      sawModelAnswer = true;
      const checked = checkWorkoutSummary(answer, finish);
      if (checked.problem === undefined) return checked.text;
      problem = checked.problem;
    }
    if (prompt === promptOnDeviceModel && sawModelAnswer) markPromptRejected(rejectKey);
  } catch {
    return null;
  }
  return null;
}

// A written summary is kept on the device, keyed by its facts, so the finish screen and the
// Workout tab show the same words and the model writes each one once.
const SUMMARY_CACHE_KEY = 'treise_workout_summary_v1';
const MAX_CACHED_SUMMARIES = 8;

function summaryKey(finish: Pick<WorkoutFinish, 'facts'>): string {
  const text = `${WORKOUT_SUMMARY_SYSTEM_PROMPT}\n${finish.facts.join('\n')}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readSummaryCache(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SUMMARY_CACHE_KEY) : null;
    // Anything that isn't a saved map of texts (a damaged or foreign value) counts as empty.
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The written summary saved for these facts, if it still passes the checks. */
export function getCachedWorkoutSummary(finish: Pick<WorkoutFinish, 'facts'>): string | null {
  const hit = readSummaryCache()[summaryKey(finish)];
  const checked = typeof hit === 'string' ? checkWorkoutSummary(hit, finish) : null;
  return checked && checked.problem === undefined ? checked.text : null;
}

export function cacheWorkoutSummary(finish: Pick<WorkoutFinish, 'facts'>, summary: string): void {
  try {
    const key = summaryKey(finish);
    const entries = Object.entries(readSummaryCache()).filter(([k]) => k !== key);
    entries.push([key, summary]);
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_CACHED_SUMMARIES))));
  } catch {
    // Storage unavailable: the summary is simply written again next time.
  }
}

/** One exercise from a finished workout, as the Workout tab shows it afterwards. */
export interface CompletedExerciseSummary {
  /** The exercise's id within the session (unique on the page). */
  id: string;
  exerciseName: string;
  /** Order chip, e.g. "A1". */
  chip?: string;
  isPersonalBest: boolean;
  /** [where this lift now stands, what today's session did]. */
  lines: [string, string];
  /** Estimated max per session, oldest first, ending with today's. Empty for timed work. */
  history: ExerciseInsight['history'];
  /** Planks, carries and conditioning have no estimated max to chart. */
  timed: boolean;
}

/**
 * A written summary and progress history for each exercise done in a finished workout.
 * Line 1 is the same trajectory sentence the exercise card uses, now including today. Line 2 says
 * what today did against the previous session, in concrete load, never a percentage.
 */
export function buildCompletedExerciseSummaries(input: {
  finished: WorkoutSession;
  /** Saved workouts including the finished one. */
  workouts: WorkoutSession[];
  bodyweightKg?: number;
  formatWeight: (kg: number) => string;
}): CompletedExerciseSummary[] {
  const { finished, formatWeight } = input;
  const bests = new Set(personalBestsIn(finished).map((b) => b.exerciseName));
  const isDone = (st: WorkoutSession['exercises'][number]['sets'][number]) =>
    st.completed && !st.isWarmup && st.setType !== 'warmup' && (st.actualReps ?? 0) > 0;
  const summaries: CompletedExerciseSummary[] = [];
  finished.exercises.forEach((ex, index) => {
    const sets = ex.sets.filter(isDone);
    if (!sets.length) return;
    const timed = Boolean(ex.durationSeconds || ex.durationMinutesRange);
    const insight = buildExerciseInsight(ex, input.workouts, 'Normal', input.bodyweightKg ?? 80, 12, formatWeight);
    const history = insight.history;
    const weight = (st: (typeof sets)[number]) => st.actualWeightKg ?? st.targetWeightKg ?? 0;
    const top = sets.reduce((a, b) => (weight(b) > weight(a) || (weight(b) === weight(a) && (b.actualReps ?? 0) > (a.actualReps ?? 0)) ? b : a));
    const topSet = weight(top) > 0 ? `${formatWeight(weight(top))} × ${top.actualReps}` : `${top.actualReps} reps`;
    const isPersonalBest = bests.has(ex.name);

    let line2: string;
    if (timed) {
      line2 = `Today's ${sets.length === 1 ? 'round is' : `${sets.length} rounds are`} logged and count toward your work capacity.`;
    } else if (history.length <= 1) {
      line2 = `Your starting point is ${topSet}; the next session has something to beat.`;
    } else {
      const change = Math.round((history[history.length - 1].e1rmKg - history[history.length - 2].e1rmKg) * 10) / 10;
      // The heaviest working set the last time this exercise was done.
      const previous = input.workouts
        .filter((w) => w.completed && w.id !== finished.id)
        .sort((x, y) => (x.completedAt || x.date).localeCompare(y.completedAt || y.date))
        .map((w) => w.exercises.find((e) => e.exerciseId === ex.exerciseId && e.sets.some(isDone)))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .pop();
      const previousTop = previous ? Math.max(...previous.sets.filter(isDone).map(weight)) : 0;
      if (isPersonalBest) {
        line2 =
          change > 0
            ? `Today set a new best at ${topSet}, adding +${formatWeight(change)} to your estimated max since last session.`
            : `Today set a new best at ${topSet}.`;
      } else if (previousTop > 0 && weight(top) > previousTop + 0.01) {
        // A heavier weight starts again at the bottom of the rep range: that is the plan working.
        line2 = `Today moved up to ${formatWeight(weight(top))} for ${top.actualReps} reps; the reps build back up from here.`;
      } else if (change > 0) {
        line2 = `Today added +${formatWeight(change)} to your estimated max since last session, with a top set of ${topSet}.`;
      } else if (change < 0) {
        line2 = `Today's top set was ${topSet}, under last session; your next targets are set from what you logged.`;
      } else {
        line2 = `Today matched last session with a top set of ${topSet}, holding the load your next increase builds on.`;
      }
    }
    summaries.push({
      id: ex.id,
      exerciseName: ex.name,
      chip: ex.orderCode || String(index + 1),
      isPersonalBest,
      lines: [insight.lines[0], line2],
      history: timed ? [] : history,
      timed,
    });
  });
  return summaries;
}
