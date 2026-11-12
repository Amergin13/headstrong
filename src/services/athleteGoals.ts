/**
 * The athlete's goals, built only from their plan and logged data.
 *
 * Two kinds:
 * - Process goals are things the athlete does. The plan's own commitment is one: train 4 times a
 *   week (workouts and active days, counted exactly as the Program page counts them).
 * - Outcome goals are results. Each movement with a published strength standard has one: reach its
 *   next level (Kilgore / Poliquin, the same levels as Progress → Strength standards). These need a logged
 *   bodyweight, because a level compares the lift with the athlete's weight; without one there are
 *   no outcome goals rather than a guessed one.
 *
 * - The goal the athlete chose (Build Muscle, Lose Fat, Stay Lean) is an outcome goal too, measured
 *   by their lifts: how many repeated lifts are stronger than when first logged (Build Muscle), or
 *   have held or gained (Lose Fat and Stay Lean, where keeping strength is the win). Bodyweight
 *   itself is on the Progress page's weight card, which needs weigh-ins.
 *
 * The knowledge graph carries these as `goals`; the finish screen compares them before and after a
 * workout to show which ones moved.
 */
import { ActivityLog } from '../engine/activeDays';
import { buildPlanOverview } from '../engine/muscleBuildingProgram';
import { evaluateStrengthStandard, standardsAge } from '../engine/strengthStandards';
import { resolveActivePlan } from '../engine/trainingPlans';
import { BiometricLog, StrengthPillar, UserProfile, WorkoutSession } from '../engine/types';
import { buildMovementStandards } from './movementStandards';
import { strengthTrend } from './strengthTrend';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';

export type GoalKind = 'outcome' | 'process';

export interface AthleteGoal {
  /** Stable across sessions: 'process-sessions-per-week' or 'strength-<movement>'. */
  id: string;
  kind: GoalKind;
  /** e.g. "Train 4 times a week" or "Bench press: Intermediate II". */
  title: string;
  /** Where it stands, in words: "2 of 4 sessions in week 1". */
  detail: string;
  current: number;
  target: number;
  unit: 'sessions' | 'kg' | 'lifts';
  /** 0–100 towards the target. */
  progressPct: number;
  achieved: boolean;
  /** Process goals: the plan week being counted. */
  week?: number;
  /** Outcome goals: the movement, and how many sub-levels up the standard the athlete is now. */
  pillar?: StrengthPillar;
  levelStep?: number;
  /** Outcome goals: the level the athlete holds now, e.g. "Intermediate I". */
  currentLevel?: string;
}

export interface AthleteGoalsInput {
  profile: UserProfile;
  workouts: WorkoutSession[];
  activities?: ActivityLog[];
  biometrics: BiometricLog[];
  /** 7-day average bodyweight. Only used when the athlete has logged a weigh-in. */
  bodyweightKg?: number;
}

const clampPct = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The plan's weekly commitment, counted over the plan week the athlete is in. */
function sessionsPerWeekGoal(input: AthleteGoalsInput): AthleteGoal {
  const plan = resolveActivePlan(input.profile);
  const overview = buildPlanOverview(input.workouts, plan, input.activities ?? []);
  const weekOf = (workoutNumber: number) => plan.templates.find((t) => t.workoutNumber === workoutNumber)?.week ?? 1;
  const done = overview.workouts.filter((w) => w.status === 'done');
  // The week of the latest finished session, so finishing the 4th session reads "4 of 4" and not
  // "0 of 4" of the week that follows.
  const week = done.length ? Math.max(...done.map((w) => weekOf(w.workoutNumber))) : 1;
  const target = plan.workoutsPerWeek;
  const current = done.filter((w) => weekOf(w.workoutNumber) === week).length;
  return {
    id: 'process-sessions-per-week',
    kind: 'process',
    title: `Train ${target} times a week`,
    detail: `${current} of ${target} sessions in week ${week}`,
    current,
    target,
    unit: 'sessions',
    progressPct: clampPct((current / target) * 100),
    achieved: current >= target,
    week,
  };
}

/** One goal per movement with a published standard: its next level. */
function strengthLevelGoals(input: AthleteGoalsInput): AthleteGoal[] {
  const hasWeighIn = input.biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const bodyweightKg = input.bodyweightKg ?? 0;
  if (!hasWeighIn || bodyweightKg <= 0) return [];
  const age = standardsAge(input.profile);
  const report = buildMovementStandards({
    workouts: input.workouts,
    biometrics: input.biometrics,
    bodyweightKg,
    gender: input.profile.gender,
    age,
  });
  const goals: AthleteGoal[] = [];
  for (const level of report.levels) {
    if (!level.logged || level.source === 'none' || !level.next || level.step === undefined) continue;
    const standard = evaluateStrengthStandard(level.pillar, level.e1rmKg, bodyweightKg, input.profile.gender, age);
    const targetKg = round1(standard.targetRatio * bodyweightKg);
    if (!(targetKg > 0)) continue;
    goals.push({
      id: `strength-${level.pillar}`,
      kind: 'outcome',
      title: `${level.name}: ${level.next}`,
      detail: `${round1(level.e1rmKg)} of ${targetKg} kg estimated max`,
      current: round1(level.e1rmKg),
      target: targetKg,
      unit: 'kg',
      progressPct: clampPct(level.progress ?? 0),
      achieved: false,
      pillar: level.pillar,
      levelStep: level.step,
      currentLevel: `${level.tier} ${level.subDivision}`,
    });
  }
  return goals;
}

export const CHOSEN_GOAL_ID = 'chosen-goal';

/** The athlete's chosen goal, measured by the lifts they have done more than once. */
function chosenGoal(input: AthleteGoalsInput): AthleteGoal {
  const phase = input.profile.goalPhase || 'Lean Bulk';
  const hasWeighIn = input.biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const trend = strengthTrend(input.workouts, hasWeighIn && input.bodyweightKg ? input.bodyweightKg : 80);
  const building = phase === 'Lean Bulk';
  const current = building ? trend.improved : trend.heldOrImproved;
  const what = building ? 'stronger than when first logged' : 'held or stronger than when first logged';
  return {
    id: CHOSEN_GOAL_ID,
    kind: 'outcome',
    title: GOAL_DISPLAY_NAME[phase],
    detail: trend.repeated > 0 ? `${current} of ${trend.repeated} repeated lifts ${what}` : 'Repeat a lift to start measuring this',
    current,
    target: trend.repeated,
    unit: 'lifts',
    progressPct: trend.repeated > 0 ? clampPct((current / trend.repeated) * 100) : 0,
    achieved: trend.repeated > 0 && current >= trend.repeated,
  };
}

/** Every goal the athlete is working towards right now: process first, then outcomes. */
export function buildAthleteGoals(input: AthleteGoalsInput): AthleteGoal[] {
  return [sessionsPerWeekGoal(input), chosenGoal(input), ...strengthLevelGoals(input)];
}

export interface GoalProgress {
  /** 'reached' = the target was hit in this workout; 'progressed' = it moved closer. */
  status: 'reached' | 'progressed';
  kind: GoalKind;
  /** The goal as the athlete was chasing it, e.g. "Bench press: Intermediate II". */
  title: string;
  detail: string;
  progressPct: number;
  current: number;
  target: number;
  unit: 'sessions' | 'kg';
}

/**
 * Which goals a workout moved, comparing the goals before it with the goals after it. A movement
 * logged for the first time is a starting point, not progress.
 */
export function goalsProgressedBy(before: AthleteGoal[], after: AthleteGoal[]): GoalProgress[] {
  const earlier = new Map(before.map((g) => [g.id, g]));
  const moved: GoalProgress[] = [];
  for (const goal of after) {
    const was = earlier.get(goal.id);
    if (goal.kind === 'process') {
      const advanced = !was || goal.week !== was.week || goal.current > was.current;
      if (!advanced || goal.current === 0) continue;
      moved.push({
        status: goal.achieved ? 'reached' : 'progressed',
        kind: 'process',
        title: goal.title,
        detail: goal.detail,
        progressPct: goal.progressPct,
        current: goal.current,
        target: goal.target,
        unit: 'sessions',
      });
      continue;
    }
    // The chosen goal is a running count on the Progress page, not a per-workout card.
    if (!was || goal.id === CHOSEN_GOAL_ID) continue;
    if ((goal.levelStep ?? 0) > (was.levelStep ?? 0)) {
      // The level they were chasing is the level they now hold.
      moved.push({
        status: 'reached',
        kind: 'outcome',
        title: was.title,
        detail: `${goal.current} kg estimated max`,
        progressPct: 100,
        current: goal.current,
        target: was.target,
        unit: 'kg',
      });
    } else if (goal.current > was.current + 0.05) {
      moved.push({ status: 'progressed', kind: 'outcome', title: goal.title, detail: goal.detail, progressPct: goal.progressPct, current: goal.current, target: goal.target, unit: 'kg' });
    }
  }
  return moved;
}
