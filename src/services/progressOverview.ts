/**
 * The Progress page's overview, built only from logged data: the goals shown as rings and their
 * summary, personal bests, lifetime and recent training totals, and the lean weight and
 * measurement views. Every figure comes from the function the detail screens use, so the overview
 * and the drill-ins agree.
 */
import { runReadAloudQaGate } from '../engine/contentStrategy';
import { calculateE1RM } from '../engine/e1rm';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { calculateSessionTonnage } from '../engine/wci';
import { WorkoutSession, WorkoutSet } from '../engine/types';
import { AthleteGoal, CHOSEN_GOAL_ID, WEEKLY_GOAL_ID, activeGoals, repsAt } from './athleteGoals';
import { promptOnDeviceModel } from './onDeviceModel';
import { mislabelledFigure, markPromptRejected, spelledNumberNotInFacts, wasPromptRejected } from './factChecks';
import { ProgressChart } from './progressSeries';
import { STANDARD_TEST_EXERCISE } from './storage';

const done = (s: WorkoutSet) => s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------------------------
// Personal bests
// ---------------------------------------------------------------------------------------------

export interface PersonalBest {
  exerciseId: string;
  exerciseName: string;
  /** Heaviest working set logged (0 for bodyweight-only work). */
  weightKg: number;
  /** Reps in that set; for bodyweight-only work, the most reps in a set. */
  reps: number;
  isBodyweight: boolean;
  /** When that set was logged (YYYY-MM-DD). */
  date: string;
  /** Best estimated one-rep max on this exercise; 0 for bodyweight-only work without a logged weight. */
  e1rmKg: number;
  sessions: number;
}

/**
 * Each exercise's personal best: its heaviest logged working set (most reps at that weight), or the
 * most reps in a set for bodyweight-only work. Timed work (planks, carries, conditioning) has none.
 */
export function buildPersonalBests(workouts: WorkoutSession[], bodyweightKg?: number): PersonalBest[] {
  const bests = new Map<string, PersonalBest>();
  const ordered = workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  for (const w of ordered) {
    for (const ex of w.exercises) {
      if (ex.durationSeconds || ex.durationMinutesRange) continue;
      const sets = ex.sets.filter(done);
      if (!sets.length) continue;
      const entry: PersonalBest = bests.get(ex.exerciseId) ?? {
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        weightKg: 0,
        reps: 0,
        isBodyweight: true,
        date: w.date,
        e1rmKg: 0,
        sessions: 0,
      };
      entry.sessions += 1;
      entry.exerciseName = ex.name;
      for (const s of sets) {
        const kg = weightOf(s);
        const reps = s.actualReps ?? 0;
        if (kg > entry.weightKg || (kg === entry.weightKg && reps > entry.reps)) {
          entry.weightKg = kg;
          entry.reps = reps;
          entry.date = (w.completedAt || w.date).slice(0, 10);
        }
        // A bodyweight move needs a logged bodyweight before it can be compared as a weight.
        if (kg > 0 || (bodyweightKg ?? 0) > 0) {
          const e = calculateE1RM(kg, reps, s.actualRir ?? s.targetRir ?? 2, ex.equipment, ex.isRdl, ex.isWeightedCalisthenic, bodyweightKg ?? 80, ex.exerciseId, ex.pillar);
          if (kg > 0 && e > entry.e1rmKg) entry.e1rmKg = e;
        }
      }
      entry.isBodyweight = entry.weightKg <= 0;
      bests.set(ex.exerciseId, entry);
    }
  }
  return [...bests.values()].sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps || a.exerciseName.localeCompare(b.exerciseName));
}

/**
 * Three bests for the card: the standard bench, squat and deadlift when the athlete has logged
 * them, then their heaviest other lifts. Never a combined total.
 */
export function trophyCase(bests: PersonalBest[]): PersonalBest[] {
  const standardIds = [STANDARD_TEST_EXERCISE['Horizontal Push'], STANDARD_TEST_EXERCISE.Squat, STANDARD_TEST_EXERCISE.Hinge].filter(Boolean) as string[];
  const loaded = bests.filter((b) => !b.isBodyweight);
  const picked = standardIds.map((id) => loaded.find((b) => b.exerciseId === id)).filter((b): b is PersonalBest => Boolean(b));
  for (const b of loaded) {
    if (picked.length >= 3) break;
    if (!picked.includes(b)) picked.push(b);
  }
  for (const b of bests) {
    if (picked.length >= 3) break;
    if (!picked.includes(b)) picked.push(b);
  }
  return picked.slice(0, 3);
}

// ---------------------------------------------------------------------------------------------
// Lifetime and recent totals
// ---------------------------------------------------------------------------------------------

export const RECENT_DAYS = 30;

export interface TrainingTotals {
  /** Weight × reps over every completed working set (the same sum as each workout's volume). */
  volumeKg: number;
  reps: number;
  workouts: number;
}

/** Totals over all saved workouts, or only those finished in the last `days`. */
export function buildTrainingTotals(workouts: WorkoutSession[], days?: number, now = Date.now()): TrainingTotals {
  const since = days ? now - days * 24 * 60 * 60 * 1000 : -Infinity;
  const totals: TrainingTotals = { volumeKg: 0, reps: 0, workouts: 0 };
  for (const w of workouts) {
    if (!w.completed || getWorkoutCompletedAt(w) < since) continue;
    totals.workouts += 1;
    totals.volumeKg += calculateSessionTonnage(w).tonnageKg;
    totals.reps += w.exercises.reduce((n, ex) => n + ex.sets.filter(done).reduce((r, s) => r + (s.actualReps ?? 0), 0), 0);
  }
  totals.volumeKg = Math.round(totals.volumeKg);
  return totals;
}

// ---------------------------------------------------------------------------------------------
// Goals: the three rings and their summary
// ---------------------------------------------------------------------------------------------

export type RingSegment = 'on' | 'off' | 'unknown';

export interface GoalRing {
  id: string;
  title: string;
  /** What the ring's centre shows: a count against its target ("3/4", "8/10"), never a percentage. */
  value: string;
  /** What the count is of, under the title: "reps at 80 kg", "5 weeks in a row". */
  caption: string;
  /** The goal counted in whole things, one segment each ('unknown' = not measured yet). */
  segments: RingSegment[];
  /** A second, inner ring for the long loop of a process goal: one segment per recent week. */
  inner?: RingSegment[];
  /** Nothing logged for this goal yet: the ring is drawn dimmed. */
  empty: boolean;
  detail: string;
}

/** A count drawn as segments reads well up to about this many; beyond it, segments stand for equal shares. */
const MAX_SEGMENTS = 20;
/** The inner ring shows this many recent weeks: the six weeks the habit research counts. */
export const HABIT_WEEKS = 6;

function countSegments(current: number, target: number): RingSegment[] {
  const total = Math.max(1, Math.min(MAX_SEGMENTS, Math.round(target)));
  const raw = Math.round((current / Math.max(1, target)) * total);
  const filled = current >= target ? total : Math.max(0, Math.min(total - 1, raw));
  return Array.from({ length: total }, (_, i) => (i < filled ? 'on' : 'off'));
}

/** The strength level among the athlete's goals: the lift they follow, else the one nearest its next level. */
export function closestStrengthGoal(goals: AthleteGoal[]): AthleteGoal | undefined {
  return activeGoals(goals).find((g) => g.id.startsWith('strength-'));
}

/** One goal as a ring: a count against its target in the centre, and what it counts beneath. */
function ringFor(goal: AthleteGoal, formatWeight: (kg: number) => string): GoalRing {
  const m = goal.measure;
  const base = { id: goal.id, title: goal.title, detail: goal.detail, empty: false };
  if (m.type === 'frequency') {
    const recent = m.weeks.slice(-HABIT_WEEKS);
    return {
      ...base,
      value: `${m.thisWeek}/${m.perWeek}`,
      caption: m.streakWeeks > 0 ? `${m.streakWeeks} ${m.streakWeeks === 1 ? 'week' : 'weeks'} in a row` : 'this week',
      segments: countSegments(m.thisWeek, m.perWeek),
      // Weeks before the athlete started are left open.
      inner: [...Array.from({ length: HABIT_WEEKS - recent.length }, () => 'unknown' as RingSegment), ...recent.map((w): RingSegment => (w.hit ? 'on' : 'off'))],
    };
  }
  if (m.type === 'reps') {
    return { ...base, value: `${m.currentReps}/${m.targetReps}`, caption: `reps ${repsAt(m, formatWeight)}`, segments: countSegments(m.currentReps, m.targetReps) };
  }
  if (m.type === 'load') {
    const [value, unit] = formatWeight(Math.max(0, m.targetE1rmKg - m.e1rmKg)).split(' ');
    // Ten equal shares of the way from the level held to the level being chased.
    return { ...base, value, caption: `${unit ?? 'kg'} to go on your estimated max`, segments: countSegments(goal.achieved ? 10 : Math.min(9.4, goal.progressPct / 10), 10) };
  }
  if (m.type === 'target') {
    const byWeight = m.metric === 'weight';
    const [targetValue, unit] = byWeight ? formatWeight(m.target).split(' ') : [`${m.target}`, 'reps'];
    return {
      ...base,
      value: `${byWeight ? formatWeight(m.best).split(' ')[0] : m.best}/${targetValue}`,
      caption: m.best > 0 ? `${byWeight ? unit ?? 'kg' : 'reps'}, your goal` : 'your goal, not logged yet',
      segments: byWeight ? countSegments(m.best >= m.target ? 10 : Math.min(9.4, (m.best / m.target) * 10), 10) : countSegments(m.best, m.target),
    };
  }
  return {
    ...base,
    value: m.signsMeasured > 0 ? `${m.signsMet}/${m.signs.length}` : '—',
    caption: m.signsMeasured > 0 ? 'signs showing' : 'nothing measured yet',
    segments: m.signs.map((sign): RingSegment => (sign.met === null ? 'unknown' : sign.met ? 'on' : 'off')),
    empty: m.signsMeasured === 0,
  };
}

/**
 * The snapshot rings, one for each of the athlete's 3 to 5 goals (`activeGoals`): sessions a week
 * (this week outside, the last six weeks inside), a strength level, the chosen goal, then any goals
 * of their own. Before a strength level can be worked out, its place holds an empty ring that says
 * what to log, never a made-up figure.
 */
export function buildGoalRings(goals: AthleteGoal[], formatWeight: (kg: number) => string = (kg) => `${kg} kg`): GoalRing[] {
  const active = activeGoals(goals);
  const rings = active.map((g) => ringFor(g, formatWeight));
  if (!active.some((g) => g.id.startsWith('strength-'))) {
    rings.splice(Math.min(1, rings.length), 0, { id: 'strength-none', title: 'Next strength level', value: '—', caption: 'log your weight to start', segments: countSegments(0, 10), empty: true, detail: 'Log your weight and a standard lift to see this' });
  }
  return rings;
}

export interface GoalsSummary {
  facts: string[];
  /** Built directly from the facts; shown until (or instead of) the model's version. */
  fallback: string;
  /**
   * Nothing has been logged to summarise yet. The fact-based text is the whole message, and the
   * model is not asked: with nothing to report it fills the gap with judgments the facts don't support.
   */
  sparse: boolean;
}

export const GOALS_SUMMARY_SYSTEM_PROMPT =
  "You are the pragmatic, observant strength coach in the athlete's pocket. Write two or three short sentences to them as \"you\" about " +
  'where their goals stand, using only the facts given: what is on track first, then the one thing that would move a goal forward. ' +
  'No hype, no greetings, no lists, no technical terms. Do not praise or judge: state the figures plainly. Never say how they felt. ' +
  'Do not use any number that is not in the facts.';

/** Where the goals stand, in the same order as the rings. */
export function buildGoalsSummary(goals: AthleteGoal[], formatWeight: (kg: number) => string): GoalsSummary {
  const facts: string[] = [];
  const sentences: string[] = [];
  const weekly = goals.find((g) => g.id === WEEKLY_GOAL_ID);
  const frequency = weekly?.measure.type === 'frequency' ? weekly.measure : undefined;
  if (weekly && frequency) {
    const left = frequency.perWeek - frequency.thisWeek;
    facts.push(
      `${weekly.title}: ${frequency.thisWeek} of ${frequency.perWeek} sessions done this week${frequency.thisWeek > 0 && left > 0 ? `, ${left} to go` : ''}.`
    );
    if (frequency.streakWeeks > 0) facts.push(`Weeks in a row at ${frequency.perWeek} sessions: ${frequency.streakWeeks}.`);
    const run = frequency.streakWeeks > 0 ? ` That's ${frequency.streakWeeks} ${frequency.streakWeeks === 1 ? 'week' : 'weeks'} in a row at ${frequency.perWeek}.` : '';
    sentences.push(
      (frequency.thisWeek >= frequency.perWeek
        ? `You've done all ${frequency.perWeek} sessions this week.`
        : frequency.thisWeek === 0
        ? `This week's ${frequency.perWeek} sessions are still ahead of you.`
        : `You've done ${frequency.thisWeek} of ${frequency.perWeek} sessions this week, with ${left} to go.`) + (frequency.thisWeek >= frequency.perWeek ? run : '')
    );
  }
  const chosen = goals.find((g) => g.id === CHOSEN_GOAL_ID);
  const body = chosen?.measure.type === 'body' ? chosen.measure : undefined;
  if (chosen && body) {
    if (body.signsMeasured > 0) {
      const showing = body.signs.filter((sign) => sign.met === true).map((sign) => sign.label.toLowerCase());
      const missing = body.signs.filter((sign) => sign.met === false).map((sign) => sign.label.toLowerCase());
      facts.push(`${chosen.title}: ${body.signsMet} of ${body.signsMeasured} measured signs are showing${showing.length ? ` (${showing.join('; ')})` : ''}.`);
      if (missing.length) facts.push(`${chosen.title}, not showing yet: ${missing.join('; ')}.`);
      facts.push(`How ${chosen.title} is judged: ${body.evidenceLabel}`);
      sentences.push(
        `For ${chosen.title}, ${body.signsMet} of ${body.signsMeasured} measured ${body.signsMeasured === 1 ? 'sign is' : 'signs are'} showing${
          showing.length ? `: ${showing.join(' and ')}` : ''
        }.${body.nextStep ? ` ${body.nextStep}` : ''}`
      );
    } else {
      facts.push(`${chosen.title}: nothing has been measured for it yet.`);
      sentences.push(`${chosen.title} is judged on your strength, your weight and your measurements, which show once you've repeated a workout and logged your weight.`);
    }
  }
  const strength = closestStrengthGoal(goals);
  if (strength && strength.measure.type === 'reps') {
    const m = strength.measure;
    const [movement] = strength.title.split(': ');
    const at = repsAt(m, formatWeight);
    facts.push(`Closest strength level: ${movement} reaches ${m.level} with ${m.targetReps} reps ${at} on ${m.exerciseName}; the best so far is ${m.currentReps} reps.`);
    sentences.push(`Your closest strength level is ${movement}: ${m.targetReps} reps ${at} reaches ${m.level}, and your best is ${m.currentReps}.`);
  } else if (strength && strength.measure.type === 'load') {
    const m = strength.measure;
    const [movement] = strength.title.split(': ');
    const gap = Math.max(0, Math.round((m.targetE1rmKg - m.e1rmKg) * 10) / 10);
    facts.push(`Closest strength level: ${movement} needs ${formatWeight(gap)} more on its estimated max (${formatWeight(m.e1rmKg)} of ${formatWeight(m.targetE1rmKg)}) to reach ${m.level}.`);
    sentences.push(`Your closest strength level is ${movement}: ${formatWeight(gap)} more on your estimated max reaches ${m.level}.`);
  } else {
    facts.push('Strength levels need a logged bodyweight and a logged standard lift; neither is available yet.');
    sentences.push('Log your weight to see how your lifts compare with strength standards.');
  }
  // Goals of the athlete's own.
  for (const own of activeGoals(goals).filter((g) => g.measure.type === 'target')) {
    const m = own.measure as Extract<AthleteGoal['measure'], { type: 'target' }>;
    const goalText = m.metric === 'weight' ? formatWeight(m.target) : `${m.target} reps`;
    const bestText = m.metric === 'weight' ? formatWeight(m.best) : `${m.best} reps`;
    facts.push(`Your own goal: ${goalText} on ${m.exerciseName}. ${m.best > 0 ? `Best so far: ${bestText}.` : 'It has not been logged yet.'}`);
    sentences.push(
      own.achieved
        ? `You've reached your goal of ${goalText} on ${m.exerciseName}.`
        : m.best > 0
        ? `Your own goal is ${goalText} on ${m.exerciseName}, and your best is ${bestText}.`
        : `Your own goal is ${goalText} on ${m.exerciseName}; log it to start counting.`
    );
  }
  const sparse = (frequency?.thisWeek ?? 0) === 0 && (frequency?.streakWeeks ?? 0) === 0 && (body?.signsMeasured ?? 0) === 0 && !strength;
  return { facts, fallback: sentences.join(' '), sparse };
}

const NUMBER = /\d+(?:\.\d+)?/g;

/** The cleaned summary, or why it can't be shown (in words the model can act on in a second try). */
export function checkGoalsSummary(answer: string | null, summary: Pick<GoalsSummary, 'facts'>): { text: string; problem?: undefined } | { text?: undefined; problem: string } {
  if (!answer) return { problem: 'it was empty' };
  const text = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(summary|message|note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 40) return { problem: 'it was too short' };
  if (text.length > 380) return { problem: 'it was too long; write two or three short sentences' };
  if ((text.match(/[.!?](\s|$)/g) || []).length > 4) return { problem: 'it had too many sentences; write two or three' };
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return { problem: 'it talked about itself or "the facts"' };
  if (!runReadAloudQaGate(text).passed) return { problem: 'it used hype, a cliché or judgmental wording' };
  if (/\b(felt|feel|feeling|enjoy(ed)?|loved)\b/i.test(text)) return { problem: 'it said how the athlete felt, which is not known' };
  if (/\b(significant\w*|dramatic\w*|huge|massive|incredibl\w*|amazing|awesome)\b/i.test(text)) return { problem: 'it used a size or hype word the facts do not support' };
  if (/\b(consistent\w*|dedicat\w*|progressing well|going well|great|excellent|impressive|solid|strong (work|effort|progress)|(good|nice) (work|job|session)|well done|keep it up|(on|staying on) (schedule|track))\b/i.test(text)) return { problem: 'it praised consistency or quality that the facts do not show; state the figures plainly' };
  if (/\b(cannot be|can't be|unable to) (assessed|measured|determined|evaluated)\b|\binsufficient\b|\bno data\b/i.test(text)) return { problem: 'it said something cannot be assessed; say what to do next instead' };
  const allowed = new Set(summary.facts.join(' ').match(NUMBER) || []);
  const strange = (text.match(NUMBER) || []).find((n) => !allowed.has(n));
  if (strange) return { problem: `it used the number ${strange}, which is not in the facts` };
  const spelled = spelledNumberNotInFacts(text, summary.facts);
  if (spelled) return { problem: `it used the number "${spelled}", which is not in the facts` };
  const mislabelled = mislabelledFigure(text, summary.facts);
  if (mislabelled) return { problem: `it said "${mislabelled}", but the facts count that figure in something else` };
  return { text };
}

/** Asks the on-device model for the goals summary. Null when no model is ready or its answers fail the checks. */
export async function generateGoalsSummary(
  summary: Pick<GoalsSummary, 'facts'> & Partial<Pick<GoalsSummary, 'sparse'>>,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  if (summary.sparse) return null;
  const rejectKey = `goals:${goalsKey(summary)}`;
  if (prompt === promptOnDeviceModel && wasPromptRejected(rejectKey)) return null;
  let problem: string | undefined;
  let sawModelAnswer = false;
  const base = `Facts:\n${summary.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the summary.`;
  // A model that throws is the same as no model: the fact-based text stays.
  try {
    for (let i = 0; i < attempts; i++) {
      const request = problem ? `${base}\n(Your last summary could not be used because ${problem}. Write it again.)` : base;
      const answer = await prompt(GOALS_SUMMARY_SYSTEM_PROMPT, request, { stateless: true, maxTokens: 120, timeoutMs: 30_000 });
      if (answer === null) return null;
      sawModelAnswer = true;
      const checked = checkGoalsSummary(answer, summary);
      if (checked.problem === undefined) return checked.text;
      problem = checked.problem;
    }
    if (prompt === promptOnDeviceModel && sawModelAnswer) markPromptRejected(rejectKey);
  } catch {
    return null;
  }
  return null;
}

const GOALS_CACHE_KEY = 'treise_goals_summary_v1';

function goalsKey(summary: Pick<GoalsSummary, 'facts'>): string {
  const text = `${GOALS_SUMMARY_SYSTEM_PROMPT}\n${summary.facts.join('\n')}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The written summary saved for these facts, if it still passes the checks. */
export function getCachedGoalsSummary(summary: Pick<GoalsSummary, 'facts'>): string | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GOALS_CACHE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    const hit = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[goalsKey(summary)] : undefined;
    const checked = typeof hit === 'string' ? checkGoalsSummary(hit, summary) : null;
    return checked && checked.problem === undefined ? checked.text : null;
  } catch {
    return null;
  }
}

export function cacheGoalsSummary(summary: Pick<GoalsSummary, 'facts'>, text: string): void {
  try {
    const raw = localStorage.getItem(GOALS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const saved: Record<string, string> = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const entries = Object.entries(saved).filter(([k]) => k !== goalsKey(summary));
    entries.push([goalsKey(summary), text]);
    localStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-6))));
  } catch {
    // Storage unavailable: the summary is simply written again next time.
  }
}

// ---------------------------------------------------------------------------------------------
// Lean measurement view
// ---------------------------------------------------------------------------------------------

export interface MeasurementHighlight {
  id: string;
  label: string;
  /** Latest reading. */
  value: number;
  /** Change since the first reading; undefined with only one. */
  change?: number;
  date: string;
}

/** Waist first (the measurement that says most about fitness), then chest, arms, hips and thighs. */
const MEASUREMENT_ORDER: { ids: string[]; label: string }[] = [
  { ids: ['waist'], label: 'Waist' },
  { ids: ['chest'], label: 'Chest' },
  { ids: ['bicep-right', 'bicep-left'], label: 'Arm' },
  { ids: ['hips'], label: 'Hips' },
  { ids: ['thigh-right', 'thigh-left'], label: 'Thigh' },
];

/** Up to `max` tape measurements for the overview card, waist always first when it has been logged. */
export function measurementHighlights(charts: ProgressChart[], max = 3): MeasurementHighlight[] {
  const highlights: MeasurementHighlight[] = [];
  for (const site of MEASUREMENT_ORDER) {
    const chart = site.ids.map((id) => charts.find((c) => c.id === id && c.points.length > 0)).find(Boolean);
    if (!chart) continue;
    const last = chart.points[chart.points.length - 1];
    highlights.push({
      id: chart.id,
      label: site.label,
      value: last.value,
      change: chart.points.length >= 2 ? Math.round((last.value - chart.points[0].value) * 10) / 10 : undefined,
      date: last.date,
    });
    if (highlights.length >= max) break;
  }
  return highlights;
}
