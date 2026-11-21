/**
 * The athlete's goals, built only from their plan and logged data. Two kinds, measured the way
 * they are measured in practice:
 *
 * PROCESS goals are things the athlete does, and have no finish line.
 * - Train 4 times a week. Two loops: the small one is this week's sessions out of 4; the long one
 *   is how many weeks in a row the athlete has done it. Weeks are calendar weeks (Monday to Sunday),
 *   because that is what "4 times a week" means and how the habit research counts it (Kaushal &
 *   Rhodes, 2015: exercising at least 4 times a week for 6 weeks). A session is a day with a
 *   finished workout or a qualifying active day.
 *
 * OUTCOME goals are results.
 * - Each movement with a published strength standard has one: reach its next level (Kilgore /
 *   Poliquin, the levels on Progress → Strength standards). It is counted in reps, the way a lifter
 *   tracks it: the reps needed at the weight of their best set to reach that level (for chin-ups,
 *   reps at bodyweight), against the reps they did. Never a percentage. When that would take more
 *   than 20 reps the weight is the wrong one to chase reps on, so the goal is given as the estimated
 *   max to reach instead. These need a logged bodyweight (a level compares the lift with it).
 * - The goal the athlete chose (Build Muscle, Lose Fat, Stay Lean). There is no single number for
 *   these, so the goal is judged on three signs, each from the best evidence logged:
 *     1. strength (repeated lifts stronger, or held when losing fat),
 *     2. bodyweight moving at the pace that suits the goal (needs a week of weigh-ins),
 *     3. size: fat-free mass from body-fat readings, else tape measurements (muscle sites and waist).
 *   The goal states how good its evidence is. Fat-free mass is the standard field measure of muscle
 *   gain; tape is next; weight plus strength alone is only an estimate and is labelled as one.
 *
 * The knowledge graph carries these as `goals`; the Progress page draws them and the finish screen
 * compares them before and after a workout.
 */
import { ActivityLog, activeDayDates } from '../engine/activeDays';
import { calculateE1RM } from '../engine/e1rm';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { evaluateStrengthStandard, standardsAge } from '../engine/strengthStandards';
import { resolveActivePlan } from '../engine/trainingPlans';
import { BiometricLog, CustomGoal, ExerciseSession, GoalPhase, StrengthPillar, UserProfile, WorkoutSession, WorkoutSet } from '../engine/types';
import { localDateString, parseLocalDate } from '../utils/date';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import { formatWeight } from '../utils/units';
import { buildMovementStandards } from './movementStandards';
import { weightPace } from './progressSeries';
import { calculateBestPillarDetails } from './storage';
import { strengthTrend } from './strengthTrend';

export type GoalKind = 'outcome' | 'process';

/** One calendar week of the weekly sessions goal. */
export interface GoalWeek {
  /** The Monday the week starts on (YYYY-MM-DD). */
  start: string;
  sessions: number;
  hit: boolean;
  /** The week that is still running. */
  current: boolean;
}

/** One calendar month of the weekly sessions goal. */
export interface GoalMonth {
  /** Calendar month key in YYYY-MM (local date). */
  month: string;
  sessions: number;
  target: number;
  hit: boolean;
  /** The month that is still running. */
  current: boolean;
}

/** Process: sessions a week. The outer ring is `thisWeek` of `perWeek`, then 4 weeks in the month, then 12 months in the year. */
export interface FrequencyMeasure {
  type: 'frequency';
  perWeek: number;
  thisWeek: number;
  /** Up to the last 12 weeks since the athlete's first session, oldest first, ending with this week. */
  weeks: GoalWeek[];
  /** Up to the last 12 calendar months since the athlete's first session, oldest first, ending with this month. */
  months: GoalMonth[];
  /** Weeks in a row at target, counting this week once it is reached. */
  streakWeeks: number;
  /** Every week at target since the athlete started. */
  weeksHit: number;
  /** Weeks since the first session, including this one. */
  weeksTracked: number;
  /** Calendar months hitting `perWeek * 4` sessions since the athlete started. */
  monthsHit: number;
  /** Calendar months since the first session, including this one. */
  monthsTracked: number;
}

/** Outcome: reps at a set weight to reach a strength level. */
export interface RepsMeasure {
  type: 'reps';
  currentReps: number;
  targetReps: number;
  /** The weight the reps are counted at; 0 means bodyweight only. */
  weightKg: number;
  atBodyweight: boolean;
  /** A bodyweight move done with extra weight (a weighted chin-up): the weight is added to bodyweight. */
  addedToBodyweight: boolean;
  /** The exercise the best set came from. */
  exerciseName: string;
  /** The level this reaches, e.g. "Intermediate II". */
  level: string;
  currentLevel: string;
  e1rmKg: number;
  targetE1rmKg: number;
}

/** Outcome: an estimated max to reach, when reps at the current weight aren't a sensible target. */
export interface LoadMeasure {
  type: 'load';
  exerciseName: string;
  level: string;
  currentLevel: string;
  e1rmKg: number;
  targetE1rmKg: number;
}

export type BodyEvidence = 'tape' | 'weight-and-strength' | 'strength-only' | 'none';

export interface BodySign {
  id: 'strength' | 'weight' | 'size';
  label: string;
  /** null = not measured yet. */
  met: boolean | null;
  detail: string;
}

/**
 * Secondary consumer BIA fat-free mass overlay (Siedler et al., 2023):
 * consumer foot-to-foot scales have ±3.4–5.2% BF (±2.0–4.9 kg) individual 95% LoA,
 * so BIA FFM is never used as a Tier-1 goal gate and is shown only as a secondary
 * 12+ week directional overlay with an explicit uncertainty band and fasted morning prompt.
 */
export interface BiaDirectionalOverlay {
  spanDays: number;
  isDirectionalReady: boolean;
  fatFreeMassChangeKg?: number;
  fatMassChangeKg?: number;
  uncertaintyBandKg: number;
  summary: string;
  fastedWeighInPrompt: string;
}

/** Outcome: the chosen goal, judged on three Tier-1 signs (anchor-lift E1RM, 7-day EMA bodyweight, optional waist/tape). */
export interface BodyMeasure {
  type: 'body';
  phase: GoalPhase;
  signs: BodySign[];
  signsMet: number;
  signsMeasured: number;
  evidence: BodyEvidence;
  /** How far the evidence can be trusted, in plain words. */
  evidenceLabel: string;
  /** What to log to judge the goal better; empty when the best evidence is already in. */
  nextStep: string;
  /** Change in fat-free mass over logged BIA readings when 12+ weeks span (secondary overlay only). */
  fatFreeMassChangeKg?: number;
  /** Secondary 12+ week consumer BIA directional overlay with explicit uncertainty band. */
  biaOverlay?: BiaDirectionalOverlay;
}

/** Outcome: a target the athlete set themselves (on one exercise or daily steps). */
export interface TargetMeasure {
  type: 'target';
  metric: 'weight' | 'reps' | 'steps';
  exerciseId: string;
  exerciseName: string;
  /** Heaviest logged set in kg (weight), most reps in one set (reps), or today's steps (steps); 0 before logged. */
  best: number;
  target: number;
  /** When the best/reading was logged (YYYY-MM-DD). */
  bestOn?: string;
  createdOn: string;
}

export type GoalMeasure = FrequencyMeasure | RepsMeasure | LoadMeasure | BodyMeasure | TargetMeasure;

export interface AthleteGoal {
  /** Stable across sessions: 'process-sessions-per-week', 'strength-<movement>', 'chosen-goal' or 'custom-<id>'. */
  id: string;
  kind: GoalKind;
  /** e.g. "Train 4 times a week", "Bench press: Intermediate II", "Build Muscle". */
  title: string;
  /** Where it stands, in words (weights in kg; screens format their own). */
  detail: string;
  /** How it is measured, in one or two plain sentences. */
  method: string;
  measure: GoalMeasure;
  /** The count the goal is tracked by, and its target (reps, sessions, signs, steps, or kg for a load goal). */
  current: number;
  target: number;
  unit: 'sessions' | 'reps' | 'kg' | 'signs' | 'steps';
  /** 0–100, only for drawing; never shown as a figure for outcome goals. */
  progressPct: number;
  achieved: boolean;
  /** Strength goals: the movement and how many sub-levels up the standard the athlete is now. */
  pillar?: StrengthPillar;
  levelStep?: number;
  /** The athlete chose this strength level to lead the Progress page. */
  featured?: boolean;
  /** True when the goal is as the plan sets it; false when the athlete changed it. */
  fromPlan: boolean;
}

export interface AthleteGoalsInput {
  profile: UserProfile;
  workouts: WorkoutSession[];
  activities?: ActivityLog[];
  biometrics: BiometricLog[];
  /** 7-day average bodyweight. Only used when the athlete has logged a weigh-in. */
  bodyweightKg?: number;
  now?: number;
}

export const WEEKLY_GOAL_ID = 'process-sessions-per-week';
/** Sessions a week the athlete may aim for. */
export const MIN_SESSIONS_PER_WEEK = 2;
export const MAX_SESSIONS_PER_WEEK = 7;

/** The sessions a week the goal counts against: the athlete's own figure if they set one, else the plan's. */
export function sessionsPerWeekTarget(profile: UserProfile): { perWeek: number; planPerWeek: number; fromPlan: boolean } {
  const planPerWeek = resolveActivePlan(profile).workoutsPerWeek;
  const own = profile.goalSettings?.sessionsPerWeek;
  const valid = typeof own === 'number' && Number.isInteger(own) && own >= MIN_SESSIONS_PER_WEEK && own <= MAX_SESSIONS_PER_WEEK;
  return { perWeek: valid ? own : planPerWeek, planPerWeek, fromPlan: !valid || own === planPerWeek };
}
export const CHOSEN_GOAL_ID = 'chosen-goal';
/** Above this many reps, a rep target at that weight says little about strength. */
export const MAX_REP_TARGET = 20;
const WEEKS_SHOWN = 12;
const MONTHS_SHOWN = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const clampPct = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
const round1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isDone = (s: WorkoutSet) => s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;

/** The weight reps are counted at, in words: "at bodyweight", "with 15 kg added", "at 80 kg". */
export function repsAt(m: Pick<RepsMeasure, 'atBodyweight' | 'addedToBodyweight' | 'weightKg'>, formatWeight: (kg: number) => string): string {
  return m.atBodyweight ? 'at bodyweight' : m.addedToBodyweight ? `with ${formatWeight(m.weightKg)} added` : `at ${formatWeight(m.weightKg)}`;
}

/** The Monday of the week a local date falls in. */
export function weekStart(date: string): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateString(d);
}

// ---------------------------------------------------------------------------------------------
// Process: train N times a week
// ---------------------------------------------------------------------------------------------

/**
 * Pro-rates a weekly session target to the exact number of calendar days in a given month
 * (28/29/30/31 days) instead of assuming every month is exactly 4 weeks (4 × perWeek).
 * Example at 4 sessions/week: Feb (28d) = 16, Apr (30d) = 17, May (31d) = 18.
 */
export function proRatedMonthlyTarget(year: number, month1Based: number, perWeek: number): number {
  const daysInMonth = new Date(year, month1Based, 0).getDate();
  return Math.max(perWeek, Math.round((daysInMonth / 7) * perWeek));
}

function sessionsPerWeekGoal(input: AthleteGoalsInput): AthleteGoal {
  const { perWeek, planPerWeek, fromPlan } = sessionsPerWeekTarget(input.profile);
  const today = localDateString(new Date(input.now ?? Date.now()));
  const thisWeekStart = weekStart(today);
  // A session is a day trained: a finished workout, or an active day of 20+ minutes.
  const days = new Set<string>();
  for (const w of input.workouts) {
    if (w.completed) days.add(w.completedAt ? localDateString(new Date(w.completedAt)) : w.date);
  }
  for (const d of activeDayDates(input.activities ?? [])) days.add(d);
  const byWeek = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const d of days) {
    if (d > today) continue;
    const start = weekStart(d);
    byWeek.set(start, (byWeek.get(start) ?? 0) + 1);
    const month = d.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }

  // Every week from the athlete's first session to now, so a week off shows as a week off.
  const firstWeek = [...byWeek.keys()].sort()[0] ?? thisWeekStart;
  const all: GoalWeek[] = [];
  for (let d = parseLocalDate(firstWeek); localDateString(d) <= thisWeekStart; d.setDate(d.getDate() + 7)) {
    const start = localDateString(d);
    const sessions = byWeek.get(start) ?? 0;
    all.push({ start, sessions, hit: sessions >= perWeek, current: start === thisWeekStart });
  }
  const thisMonth = today.slice(0, 7);
  const firstMonth = [...byMonth.keys()].sort()[0] ?? thisMonth;
  const allMonths: GoalMonth[] = [];
  const [startYear, startMonth] = firstMonth.split('-').map(Number);
  const [endYear, endMonth] = thisMonth.split('-').map(Number);
  for (let y = startYear, mo = startMonth; y < endYear || (y === endYear && mo <= endMonth); ) {
    const month = `${y}-${String(mo).padStart(2, '0')}`;
    const sessions = byMonth.get(month) ?? 0;
    const monthTarget = proRatedMonthlyTarget(y, mo, perWeek);
    allMonths.push({ month, sessions, target: monthTarget, hit: sessions >= monthTarget, current: month === thisMonth });
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  const currentMonthTarget = proRatedMonthlyTarget(endYear, endMonth, perWeek);
  const thisWeek = all[all.length - 1].sessions;
  // The run of weeks at target. This week joins it once reached; until then it neither adds nor breaks it.
  let streakWeeks = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].current && !all[i].hit) continue;
    if (!all[i].hit) break;
    streakWeeks += 1;
  }
  const weeksHit = all.filter((w) => w.hit).length;
  const monthsHit = allMonths.filter((m) => m.hit).length;
  const measure: FrequencyMeasure = {
    type: 'frequency',
    perWeek,
    thisWeek,
    weeks: all.slice(-WEEKS_SHOWN),
    months: allMonths.slice(-MONTHS_SHOWN),
    streakWeeks,
    weeksHit,
    weeksTracked: all.length,
    monthsHit,
    monthsTracked: allMonths.length,
  };
  return {
    id: WEEKLY_GOAL_ID,
    kind: 'process',
    title: `Train ${perWeek} times a week`,
    detail: `${thisWeek} of ${perWeek} sessions this week${streakWeeks > 0 ? `, ${plural(streakWeeks, 'week')} in a row at ${perWeek}` : ''}`,
    method: `A session is a day with a finished workout or an active day of 20 minutes or more. Weeks run Monday to Sunday; monthly targets pro-rate to each month's days (${currentMonthTarget} sessions this month at ${perWeek}/week). ${fromPlan ? `${perWeek} a week is what your plan is built on.` : `You set ${perWeek} a week; your plan is built on ${planPerWeek}.`}`,
    measure,
    current: thisWeek,
    target: perWeek,
    unit: 'sessions',
    progressPct: clampPct((thisWeek / perWeek) * 100),
    achieved: thisWeek >= perWeek,
    fromPlan,
  };
}

// ---------------------------------------------------------------------------------------------
// Outcome: the next strength level on each standard movement
// ---------------------------------------------------------------------------------------------

interface BestSet {
  exercise: ExerciseSession;
  set: WorkoutSet;
  e1rmKg: number;
}

/** The set behind a movement's best estimated max (the same sets and formula as the strength levels). */
function bestSetFor(workouts: WorkoutSession[], exerciseId: string | undefined, bodyweightKg: number, biometrics?: BiometricLog[]): BestSet | null {
  if (!exerciseId) return null;
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  let best: BestSet | null = null;
  for (const w of workouts) {
    if (!w.completed) continue;
    const sessionBw = emaLookup ? emaLookup(w.date, bodyweightKg) : bodyweightKg;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets.filter(isDone)) {
        const e = calculateE1RM(weightOf(s), s.actualReps ?? 0, s.actualRir ?? s.targetRir ?? 2, ex.equipment, ex.isRdl, ex.isWeightedCalisthenic, sessionBw, ex.exerciseId, ex.pillar);
        if (!best || e > best.e1rmKg) best = { exercise: ex, set: s, e1rmKg: e };
      }
    }
  }
  return best;
}

/** The fewest reps at the best set's weight (same reps in reserve) whose estimated max reaches the target. */
function repsToReach(best: BestSet, targetE1rmKg: number, bodyweightKg: number): number | null {
  const { exercise: ex, set } = best;
  for (let r = set.actualReps ?? 0; r <= MAX_REP_TARGET; r++) {
    const e = calculateE1RM(weightOf(set), r, set.actualRir ?? set.targetRir ?? 2, ex.equipment, ex.isRdl, ex.isWeightedCalisthenic, bodyweightKg, ex.exerciseId, ex.pillar);
    if (e >= targetE1rmKg) return r;
  }
  return null;
}

function strengthLevelGoals(input: AthleteGoalsInput): AthleteGoal[] {
  const hasWeighIn = input.biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const bodyweightKg = input.bodyweightKg ?? 0;
  if (!hasWeighIn || bodyweightKg <= 0) return [];
  const age = standardsAge(input.profile);
  const unit = input.profile.weightUnit || 'kg';
  const fmtLoad = (kg: number) => (unit === 'lb' ? formatWeight(kg, 'lb') : `${round1(kg)} kg`);
  const emaLookup = buildBodyweightEmaLookup(input.biometrics);
  const report = buildMovementStandards({ workouts: input.workouts, biometrics: input.biometrics, bodyweightKg, gender: input.profile.gender, age });
  const bests = calculateBestPillarDetails(input.workouts, bodyweightKg, { bodyweightOnDate: (d) => emaLookup(d, bodyweightKg) });
  const goals: AthleteGoal[] = [];
  for (const level of report.levels) {
    if (!level.logged || level.source === 'none' || !level.next || level.step === undefined) continue;
    const standard = evaluateStrengthStandard(level.pillar, level.e1rmKg, bodyweightKg, input.profile.gender, age);
    const targetE1rmKg = round1(standard.targetRatio * bodyweightKg);
    if (!(targetE1rmKg > 0)) continue;
    const currentLevel = `${level.tier} ${level.subDivision}`;
    const best = bestSetFor(input.workouts, bests[level.pillar]?.exerciseId, bodyweightKg, input.biometrics);
    const targetReps = best ? repsToReach(best, targetE1rmKg, bodyweightKg) : null;
    const exerciseName = best?.exercise.name ?? level.bestFrom ?? level.name;
    const base = {
      id: `strength-${level.pillar}`,
      kind: 'outcome' as const,
      title: `${level.name}: ${level.next}`,
      achieved: false,
      fromPlan: true,
      pillar: level.pillar,
      levelStep: level.step,
      progressPct: clampPct(level.progress ?? 0),
    };
    const currentReps = best?.set.actualReps ?? 0;
    if (best && targetReps !== null && targetReps > currentReps) {
      const weightKg = weightOf(best.set);
      const atBodyweight = weightKg <= 0;
      const addedToBodyweight = !atBodyweight && (best.exercise.isWeightedCalisthenic === true || best.exercise.equipment === 'bodyweight' || best.exercise.equipment === 'weighted_bodyweight');
      const at = repsAt({ atBodyweight, addedToBodyweight, weightKg }, fmtLoad);
      goals.push({
        ...base,
        detail: `${currentReps} of ${targetReps} reps ${at} on ${exerciseName}`,
        method: `Counted in reps at the weight of your best set${atBodyweight ? ' (bodyweight)' : ''}: ${targetReps} reps ${at} gives the estimated max that ${level.next} needs at your bodyweight.`,
        measure: { type: 'reps', currentReps, targetReps, weightKg, atBodyweight, addedToBodyweight, exerciseName, level: level.next, currentLevel, e1rmKg: round1(level.e1rmKg), targetE1rmKg },
        current: currentReps,
        target: targetReps,
        unit: 'reps',
        // Reps done toward the reps needed, for the ring's arc.
        progressPct: clampPct((currentReps / targetReps) * 100),
      });
    } else {
      goals.push({
        ...base,
        detail: unit === 'lb' ? `${fmtLoad(level.e1rmKg)} of ${fmtLoad(targetE1rmKg)} estimated max on ${exerciseName}` : `${round1(level.e1rmKg)} of ${targetE1rmKg} kg estimated max on ${exerciseName}`,
        method: `${level.next} needs an estimated max of ${fmtLoad(targetE1rmKg)} at your bodyweight. That is more than ${MAX_REP_TARGET} reps away at the weight of your best set, so it is tracked by the estimated max.`,
        measure: { type: 'load', exerciseName, level: level.next, currentLevel, e1rmKg: round1(level.e1rmKg), targetE1rmKg },
        current: round1(level.e1rmKg),
        target: targetE1rmKg,
        unit: 'kg',
      });
    }
  }
  return goals;
}

// ---------------------------------------------------------------------------------------------
// Outcome: the chosen goal (Build Muscle, Lose Fat, Stay Lean)
// ---------------------------------------------------------------------------------------------

/** A tape reading must be this far from the first one before a change in it means anything. */
const MIN_BODY_SPAN_DAYS = 14;
/** Consumer BIA FFM needs at least 12 weeks before reading as a secondary directional overlay (Siedler et al., 2023). */
export const MIN_BIA_OVERLAY_DAYS = 84;
/** Tape readings closer than this are within measuring error. */
const TAPE_NOISE_CM = 0.5;
/** Fasted morning weigh-in guidance for consumer BIA scales. */
export const FASTED_BIA_WEIGH_IN_PROMPT =
  'Weigh in fasted first thing in the morning after using the bathroom so hydration shifts affect BIA less.';

type TapeSite = 'bicepRightCm' | 'bicepLeftCm' | 'chestCm' | 'thighRightCm' | 'thighLeftCm' | 'waistCm';

function firstAndLast<T extends { date: string }>(rows: T[], minSpanDays: number = MIN_BODY_SPAN_DAYS): [T, T] | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return parseLocalDate(last.date).getTime() - parseLocalDate(first.date).getTime() >= minSpanDays * DAY_MS ? [first, last] : null;
}

function fatFreeMassOf(b: BiometricLog): number {
  if ((b.fatFreeMassKg ?? 0) > 0) return b.fatFreeMassKg as number;
  return (b.bodyFatPct ?? 0) > 0 && b.bodyweightKg > 0 ? b.bodyweightKg * (1 - (b.bodyFatPct as number) / 100) : 0;
}

/**
 * Individual 95% longitudinal uncertainty band for consumer BIA FFM (~3.4–5.2% BF per Siedler et al., 2023,
 * translating to roughly ±2.0 to ±4.9 kg for 60–95 kg lifters).
 */
export function consumerBiaUncertaintyKg(bodyweightKg: number): number {
  const bw = bodyweightKg > 0 ? bodyweightKg : 80;
  return round1(Math.max(2.0, Math.min(4.9, bw * 0.043)));
}

function buildBiaDirectionalOverlay(biometrics: BiometricLog[], fallbackBwKg: number): BiaDirectionalOverlay | undefined {
  const rows = biometrics
    .filter((b) => fatFreeMassOf(b) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) return undefined;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const spanDays = Math.max(
    0,
    Math.round((parseLocalDate(last.date).getTime() - parseLocalDate(first.date).getTime()) / DAY_MS)
  );
  const uncertaintyBandKg = consumerBiaUncertaintyKg(last.bodyweightKg || fallbackBwKg);
  const isDirectionalReady = rows.length >= 2 && spanDays >= MIN_BIA_OVERLAY_DAYS;
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n} kg`;
  const fatFreeMassChangeKg =
    rows.length >= 2 ? round1(fatFreeMassOf(last) - fatFreeMassOf(first)) : undefined;
  const fatMassChangeKg =
    rows.length >= 2 && last.bodyweightKg > 0 && first.bodyweightKg > 0
      ? round1(last.bodyweightKg - fatFreeMassOf(last) - (first.bodyweightKg - fatFreeMassOf(first)))
      : undefined;

  const summary = isDirectionalReady && fatFreeMassChangeKg !== undefined
    ? `12+ week BIA directional overlay (${Math.round(spanDays / 7)} weeks): fat-free mass ${signed(fatFreeMassChangeKg)} (±${uncertaintyBandKg} kg consumer scale uncertainty). Secondary reference only alongside weight, strength, and waist.`
    : `Consumer BIA fat-free mass has ±${uncertaintyBandKg} kg individual uncertainty. Log fasted morning weigh-ins for 12+ weeks (${spanDays} of ${MIN_BIA_OVERLAY_DAYS} days so far) before reading it as a directional overlay.`;

  return {
    spanDays,
    isDirectionalReady,
    fatFreeMassChangeKg,
    fatMassChangeKg,
    uncertaintyBandKg,
    summary,
    fastedWeighInPrompt: FASTED_BIA_WEIGH_IN_PROMPT,
  };
}

/** Change in the first of these tape sites with two readings two weeks or more apart. */
function tapeChange(biometrics: BiometricLog[], sites: TapeSite[]): number | null {
  for (const site of sites) {
    const pair = firstAndLast(biometrics.filter((b) => (b[site] ?? 0) > 0));
    if (pair) return round1((pair[1][site] as number) - (pair[0][site] as number));
  }
  return null;
}

function chosenGoal(input: AthleteGoalsInput): AthleteGoal {
  const phase: GoalPhase = input.profile.goalPhase || 'Lean Bulk';
  const building = phase === 'Lean Bulk';
  const losing = phase === 'Cut / Recomp';
  const hasWeighIn = input.biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const trend = strengthTrend(input.workouts, hasWeighIn && input.bodyweightKg ? input.bodyweightKg : 0, input.biometrics);

  // 1. Strength.
  const strongEnough = building ? trend.improved * 2 >= trend.repeated : trend.heldOrImproved * 5 >= trend.repeated * 4;
  const strength: BodySign = {
    id: 'strength',
    label: building ? 'Lifts getting stronger' : 'Strength held',
    met: trend.repeated > 0 ? strongEnough : null,
    detail:
      trend.repeated === 0
        ? 'Repeat a lift to start measuring this.'
        : building
        ? `${trend.improved} of ${plural(trend.repeated, 'repeated lift')} stronger than when first logged (at least half is the sign).`
        : `${trend.heldOrImproved} of ${plural(trend.repeated, 'repeated lift')} held or stronger than when first logged (at least 4 in 5 is the sign).`,
  };

  // 2. Bodyweight at the pace that suits the goal.
  const pace = weightPace(input.biometrics, phase);
  const weight: BodySign = {
    id: 'weight',
    label: building ? 'Weight rising at a steady pace' : losing ? 'Weight falling at a steady pace' : 'Weight holding steady',
    met: pace ? pace.pace === 'on' : null,
    detail: !pace
      ? hasWeighIn
        ? 'Needs a week of weigh-ins.'
        : 'Log your weight to measure this.'
      : `7-day average ${pace.direction === 'steady' ? 'steady' : `${pace.perWeekKg > 0 ? 'up' : 'down'} ${Math.abs(round1(pace.perWeekKg))} kg a week`}: ${
          pace.pace === 'on' ? 'on pace for' : pace.pace === 'faster' ? 'faster than suits' : 'slower than suits'
        } ${pace.goalLabel}.`,
  };

  // 3. Tier-1 Size sign: optional waist circumference (and muscle tape sites when logged).
  // Consumer BIA fat-free mass is retired from Tier-1 goal gating (Siedler et al., 2023) and
  // demoted to a secondary 12+ week directional overlay with an explicit uncertainty band.
  const biaOverlay = buildBiaDirectionalOverlay(input.biometrics, input.bodyweightKg ?? 80);
  const muscleTape = tapeChange(input.biometrics, ['bicepRightCm', 'bicepLeftCm', 'chestCm', 'thighRightCm', 'thighLeftCm']);
  const waist = tapeChange(input.biometrics, ['waistCm']);
  let size: BodySign;
  let evidence: BodyEvidence;
  if (muscleTape !== null || waist !== null) {
    evidence = 'tape';
    const cm = (n: number) => `${n > 0 ? '+' : ''}${n} cm`;
    const parts = [muscleTape !== null ? `arm, chest or thigh ${cm(muscleTape)}` : '', waist !== null ? `waist ${cm(waist)}` : ''].filter(Boolean).join(', ');
    const met = building
      ? muscleTape !== null
        ? muscleTape >= TAPE_NOISE_CM && (waist === null || waist <= muscleTape)
        : waist !== null
        ? waist <= TAPE_NOISE_CM * 2
        : null
      : waist !== null
      ? losing
        ? waist <= -TAPE_NOISE_CM
        : waist <= TAPE_NOISE_CM
      : null;
    size = {
      id: 'size',
      label: building
        ? muscleTape !== null
          ? 'Muscle sites up, waist steady'
          : 'Waist staying controlled'
        : losing
        ? 'Waist down'
        : 'Waist steady',
      met,
      detail: `By tape since your first reading: ${parts}.`,
    };
  } else {
    evidence = 'none';
    size = {
      id: 'size',
      label: building ? 'Waist & muscle tape (optional)' : 'Waist circumference (optional)',
      met: null,
      detail: building
        ? 'Optional: tape your waist (and arm, chest or thigh) every 2+ weeks to confirm gain is lean.'
        : 'Optional: tape your waist every 2+ weeks to confirm fat loss alongside 7-day average weight.',
    };
  }
  // Without a measured tape sign, Tier-1 rests on 7-day EMA bodyweight + anchor-lift E1RM.
  if (size.met === null) evidence = pace ? 'weight-and-strength' : trend.repeated > 0 ? 'strength-only' : 'none';

  const signs = [strength, weight, size];
  const signsMeasured = signs.filter((s) => s.met !== null).length;
  const signsMet = signs.filter((s) => s.met === true).length;
  const evidenceLabel =
    evidence === 'tape'
      ? 'Tracked by 7-day average bodyweight, anchor-lift E1RM, and tape circumference.'
      : evidence === 'weight-and-strength'
      ? 'Tracked by 7-day average bodyweight and anchor-lift E1RM (optional waist tape adds a direct size check).'
      : evidence === 'strength-only'
      ? 'Tracked by anchor-lift E1RM so far. Add morning weigh-ins to track bodyweight pace.'
      : 'Nothing to judge this on yet.';
  const nextStep =
    evidence === 'tape'
      ? ''
      : !pace
      ? hasWeighIn
        ? 'Keep weighing in fasted each morning; a week of weigh-ins shows your 7-day average pace.'
        : 'Log your weight fasted each morning; a week of weigh-ins shows your 7-day average pace.'
      : 'Optionally tape your waist every 2 weeks to pair with weight and anchor-lift strength.';

  return {
    id: CHOSEN_GOAL_ID,
    kind: 'outcome',
    title: GOAL_DISPLAY_NAME[phase],
    detail: signsMeasured > 0 ? `${signsMet} of ${signsMeasured} measured signs are showing` : 'Nothing measured yet',
    method: `Tier-1 progress uses 7-day average bodyweight, multi-week anchor-lift E1RM, and optional waist circumference. Consumer smart-scale fat-free mass is shown only as a secondary 12+ week directional overlay due to scale measurement error. ${evidenceLabel}`,
    measure: {
      type: 'body',
      phase,
      signs,
      signsMet,
      signsMeasured,
      evidence,
      evidenceLabel,
      nextStep,
      fatFreeMassChangeKg: biaOverlay?.isDirectionalReady ? biaOverlay.fatFreeMassChangeKg : undefined,
      biaOverlay,
    },
    current: signsMet,
    target: signs.length,
    unit: 'signs',
    progressPct: clampPct((signsMet / signs.length) * 100),
    achieved: signsMeasured === signs.length && signsMet === signs.length,
    fromPlan: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Outcome: targets the athlete set themselves
// ---------------------------------------------------------------------------------------------

export const CUSTOM_GOAL_PREFIX = 'custom-';
/**
 * An athlete has 3 to 5 goals. Three come with the plan and are always there: sessions a week, the
 * chosen goal, and one strength level. Up to two more are goals of their own.
 */
export const PLAN_GOAL_COUNT = 3;
export const MAX_GOALS = 5;
export const MAX_CUSTOM_GOALS = MAX_GOALS - PLAN_GOAL_COUNT;
/** Limits on a target, so a slip of the thumb can't set one that means nothing. */
export const MAX_CUSTOM_WEIGHT_KG = 500;
export const MAX_CUSTOM_REPS = 100;
export const MIN_CUSTOM_STEPS = 500;
export const MAX_CUSTOM_STEPS = 100000;
export const STEPS_GOAL_EXERCISE_ID = 'daily-steps';

export interface OwnGoalOption {
  exerciseId: string;
  label: string;
  metric: CustomGoal['metric'];
}

/** The lifts offered when setting a goal of one's own in onboarding, each counted the way it is trained. */
export const OWN_GOAL_LIFTS: { exerciseId: string; label: string; metric: CustomGoal['metric'] }[] = [
  { exerciseId: 'ex-chinup', label: 'Chin-ups', metric: 'reps' },
  { exerciseId: 'ex-pushup', label: 'Push-ups', metric: 'reps' },
  { exerciseId: 'ex-bench-press', label: 'Bench press', metric: 'weight' },
  { exerciseId: 'ex-barbell-squat', label: 'Squat', metric: 'weight' },
  { exerciseId: 'ex-deadlift', label: 'Deadlift', metric: 'weight' },
];

export const STEPS_GOAL_OPTION: OwnGoalOption = {
  exerciseId: STEPS_GOAL_EXERCISE_ID,
  label: 'Daily steps',
  metric: 'steps',
};

/** Every preset custom goal offered when adding a goal of one's own (lifts + daily steps). */
export const OWN_GOAL_OPTIONS: OwnGoalOption[] = [...OWN_GOAL_LIFTS, STEPS_GOAL_OPTION];

/** The everyday name for a goal ("Chin-ups", "Daily steps"), where the library's name is long. */
export function ownGoalName(exerciseId: string, libraryName: string): string {
  return OWN_GOAL_OPTIONS.find((l) => l.exerciseId === exerciseId)?.label ?? libraryName;
}

/** Steps recorded for `date` (defaults to today in local time). */
export function stepsOnDate(biometrics: BiometricLog[], date: string = localDateString()): number {
  const entry = [...biometrics].reverse().find((b) => b.date === date && (b.steps ?? 0) > 0)
    ?? [...biometrics].reverse().find((b) => b.date === date);
  return Math.max(0, Math.round(entry?.steps ?? 0));
}

const CHINUP_IDS = new Set(['ex-chinup', 'ex-weighted-pullup', 'ex-hammer-chinup']);

/** A goal of the athlete's own, or null when the target isn't one that can be tracked. */
export function makeCustomGoal(exerciseId: string, exerciseName: string, metric: CustomGoal['metric'], target: number, createdOn: string): CustomGoal | null {
  const rounded = metric === 'weight' ? Math.round(target * 100) / 100 : Math.round(target);
  const goal: CustomGoal = { id: `${exerciseId}-${metric}`, exerciseId, exerciseName, metric, target: rounded, createdOn };
  return isValidCustomGoal(goal) ? goal : null;
}

/** The athlete's best on an exercise: heaviest logged set (kg) and most reps in one set, with dates. */
export function bestOnExercise(workouts: WorkoutSession[], exerciseId: string): { weightKg: number; weightOn?: string; reps: number; repsOn?: string } {
  const best: { weightKg: number; weightOn?: string; reps: number; repsOn?: string } = { weightKg: 0, reps: 0 };
  for (const w of workouts) {
    if (!w.completed) continue;
    const on = w.completedAt ? localDateString(new Date(w.completedAt)) : w.date;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId && !(exerciseId === 'ex-chinup' && CHINUP_IDS.has(ex.exerciseId))) continue;
      for (const st of ex.sets.filter(isDone)) {
        if (weightOf(st) > best.weightKg) {
          best.weightKg = weightOf(st);
          best.weightOn = on;
        }
        if ((st.actualReps ?? 0) > best.reps) {
          best.reps = st.actualReps ?? 0;
          best.repsOn = on;
        }
      }
    }
  }
  return best;
}

function isValidCustomGoal(g: CustomGoal | undefined): g is CustomGoal {
  if (!g || typeof g.id !== 'string' || typeof g.exerciseId !== 'string' || typeof g.exerciseName !== 'string') return false;
  if (!Number.isFinite(g.target)) return false;
  if (g.metric === 'steps') return g.target >= MIN_CUSTOM_STEPS && g.target <= MAX_CUSTOM_STEPS;
  return (g.metric === 'weight' || g.metric === 'reps') && g.target > 0 && g.target <= (g.metric === 'weight' ? MAX_CUSTOM_WEIGHT_KG : MAX_CUSTOM_REPS);
}

function customGoals(input: AthleteGoalsInput): AthleteGoal[] {
  const saved = input.profile.goalSettings?.customGoals;
  if (!Array.isArray(saved)) return [];
  const today = localDateString(new Date(input.now ?? Date.now()));
  const unit = input.profile.weightUnit || 'kg';
  const fmtLoad = (kg: number) => (unit === 'lb' ? formatWeight(kg, 'lb') : `${kg} kg`);
  return saved.filter(isValidCustomGoal).slice(0, MAX_CUSTOM_GOALS).map((g) => {
    if (g.metric === 'steps') {
      const current = stepsOnDate(input.biometrics, today);
      const targetFmt = g.target.toLocaleString('en-US');
      const currentFmt = current.toLocaleString('en-US');
      return {
        id: `${CUSTOM_GOAL_PREFIX}${g.id}`,
        kind: 'outcome' as const,
        title: g.exerciseName || 'Daily steps',
        detail: current > 0 ? `${currentFmt} of ${targetFmt} steps today` : `${targetFmt} steps a day; no steps logged today`,
        method: 'A goal you set. Counted by your steps today from Health Connect or your watch.',
        measure: { type: 'target' as const, metric: 'steps', exerciseId: g.exerciseId, exerciseName: g.exerciseName || 'Daily steps', best: current, target: g.target, bestOn: current > 0 ? today : undefined, createdOn: g.createdOn },
        current,
        target: g.target,
        unit: 'steps' as const,
        progressPct: clampPct((current / g.target) * 100),
        achieved: current >= g.target,
        fromPlan: false,
      };
    }
    const best = bestOnExercise(input.workouts, g.exerciseId);
    const current = g.metric === 'weight' ? round1(best.weightKg) : best.reps;
    const what = g.metric === 'weight' ? `${fmtLoad(g.target)} on ${g.exerciseName}` : `${g.target} reps on ${g.exerciseName}`;
    const currentText = g.metric === 'weight' && unit === 'lb' ? formatWeight(current, 'lb') : String(current);
    return {
      id: `${CUSTOM_GOAL_PREFIX}${g.id}`,
      kind: 'outcome' as const,
      // A weight target is shown in the athlete's unit by the screen, so it stays out of the title.
      title: g.metric === 'weight' ? g.exerciseName : `${g.exerciseName}: ${g.target} reps`,
      detail: current > 0 ? `${currentText} of ${what}` : `${what}; not logged yet`,
      method:
        g.metric === 'weight'
          ? 'A goal you set. Counted by the heaviest set you have logged on this exercise, whatever the reps.'
          : 'A goal you set. Counted by the most reps you have logged in one set of this exercise.',
      measure: { type: 'target' as const, metric: g.metric, exerciseId: g.exerciseId, exerciseName: g.exerciseName, best: current, target: g.target, bestOn: g.metric === 'weight' ? best.weightOn : best.repsOn, createdOn: g.createdOn },
      current,
      target: g.target,
      unit: g.metric === 'weight' ? ('kg' as const) : ('reps' as const),
      progressPct: clampPct((current / g.target) * 100),
      achieved: current >= g.target,
      fromPlan: false,
    };
  });
}

/** Every goal the athlete is working towards right now: process first, then outcomes. */
export function buildAthleteGoals(input: AthleteGoalsInput): AthleteGoal[] {
  const focus = input.profile.goalSettings?.strengthFocus;
  const strength = strengthLevelGoals(input).map((g) => (focus && g.pillar === focus ? { ...g, featured: true, fromPlan: false } : g));
  return [sessionsPerWeekGoal(input), chosenGoal(input), ...strength, ...customGoals(input)];
}

/**
 * The athlete's 3 to 5 goals, in the order they are shown: sessions a week, one strength level (the
 * lift they chose to follow, else the one nearest its next level; reps goals first, since those can
 * be acted on today), the chosen goal, then any goals of their own. Every other strength level is
 * still tracked, on Progress → Strength standards.
 */
export function activeGoals(goals: AthleteGoal[]): AthleteGoal[] {
  const remaining = (g: AthleteGoal) => (g.target - g.current) / Math.max(1, g.target);
  const levels = goals.filter((g) => g.id.startsWith('strength-'));
  const strength = levels.find((g) => g.featured) ?? [...levels].sort((a, b) => Number(b.unit === 'reps') - Number(a.unit === 'reps') || remaining(a) - remaining(b))[0];
  const weekly = goals.find((g) => g.id === WEEKLY_GOAL_ID);
  const chosen = goals.find((g) => g.id === CHOSEN_GOAL_ID);
  const own = goals.filter((g) => g.id.startsWith(CUSTOM_GOAL_PREFIX)).slice(0, MAX_CUSTOM_GOALS);
  return [weekly, strength, chosen, ...own].filter((g): g is AthleteGoal => Boolean(g));
}

// ---------------------------------------------------------------------------------------------
// What a workout moved
// ---------------------------------------------------------------------------------------------

export interface GoalProgress {
  /** 'reached' = the target was hit in this workout; 'progressed' = it moved closer. */
  status: 'reached' | 'progressed';
  kind: GoalKind;
  /** The goal as the athlete was chasing it, e.g. "Bench press: Intermediate II". */
  title: string;
  /** The goal after the workout (for a level just reached, the goal that was being chased). */
  goal: AthleteGoal;
  /** 0–100 for the card's bar. */
  progressPct: number;
}

const e1rmOf = (g: AthleteGoal) => (g.measure.type === 'reps' || g.measure.type === 'load' ? g.measure.e1rmKg : 0);

/**
 * Which goals a workout moved, comparing the goals before it with the goals after it. A movement
 * logged for the first time is a starting point, not progress, and the chosen goal is a running
 * judgment on the Progress page rather than a per-workout card.
 */
export function goalsProgressedBy(before: AthleteGoal[], after: AthleteGoal[]): GoalProgress[] {
  const earlier = new Map(before.map((g) => [g.id, g]));
  const moved: GoalProgress[] = [];
  for (const goal of after) {
    const was = earlier.get(goal.id);
    if (goal.id === CHOSEN_GOAL_ID) continue;
    if (goal.kind === 'process') {
      if (goal.current === 0 || (was && goal.current <= was.current)) continue;
      moved.push({ status: goal.achieved && !(was?.achieved ?? false) ? 'reached' : 'progressed', kind: 'process', title: goal.title, goal, progressPct: goal.progressPct });
      continue;
    }
    if (goal.measure.type === 'target') {
      // The athlete's own target: it moved if their best on the exercise went up.
      if (!was || goal.current <= was.current) continue;
      moved.push({ status: goal.achieved && !was.achieved ? 'reached' : 'progressed', kind: 'outcome', title: goal.title, goal, progressPct: goal.progressPct });
      continue;
    }
    if (!was) continue;
    if ((goal.levelStep ?? 0) > (was.levelStep ?? 0)) {
      // The level they were chasing is the level they now hold.
      moved.push({ status: 'reached', kind: 'outcome', title: was.title, goal: was, progressPct: 100 });
    } else if (e1rmOf(goal) > e1rmOf(was) + 0.05) {
      moved.push({ status: 'progressed', kind: 'outcome', title: goal.title, goal, progressPct: goal.progressPct });
    }
  }
  return moved;
}

/** Where a goal stands, in the athlete's unit, e.g. "8 of 10 reps at 80 kg" or "3 of 4 sessions this week". */
export function describeGoalStanding(goal: AthleteGoal, formatWeight: (kg: number) => string): string {
  const m = goal.measure;
  if (m.type === 'frequency') return `${m.thisWeek} of ${m.perWeek} sessions this week`;
  if (m.type === 'reps') return `${m.currentReps} of ${m.targetReps} reps ${repsAt(m, formatWeight)}`;
  if (m.type === 'load') return `${formatWeight(m.e1rmKg)} of ${formatWeight(m.targetE1rmKg)} estimated max`;
  if (m.type === 'target') {
    if (m.metric === 'steps') {
      if (m.best <= 0) return `${m.target.toLocaleString()} steps today: none recorded yet`;
      return `${m.best.toLocaleString()} of ${m.target.toLocaleString()} steps today`;
    }
    if (m.best <= 0) return m.metric === 'weight' ? `${formatWeight(m.target)}: not logged yet` : `${m.target} reps: not logged yet`;
    return m.metric === 'weight' ? `${formatWeight(m.best)} of ${formatWeight(m.target)}` : `${m.best} of ${m.target} reps`;
  }
  return m.signsMeasured > 0 ? `${m.signsMet} of ${m.signsMeasured} measured signs showing` : 'Nothing measured yet';
}
