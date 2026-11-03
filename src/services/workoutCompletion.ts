import {
  ProgramSplitType,
  ReadinessState,
  StrengthPillar,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import { Milestone, evaluateStrengthStandardAdvance, programMilestone } from '../engine/milestones';
import { evaluateStrengthStandard } from '../engine/strengthStandards';
import { getNextProgramWorkoutNumber, getSessionPlanId } from '../engine/muscleBuildingProgram';
import { getPlanById, getSessionPlanShape } from '../engine/trainingPlans';
import { calculateBestPillarE1rms } from './storage';
import { WhoopWorkoutStrainSummary } from './whoopService';
import { localDateString } from '../utils/date';

const SESSIONS_PER_WEEK: Record<ProgramSplitType, number> = {
  ppl_upper: 4,
  ppl: 3,
  upper_lower: 4,
  full_body: 3,
  muscle_building_6wk: 4,
  starter_6wk: 3,
};

const PROGRAM_LABELS: Record<ProgramSplitType, string> = {
  ppl_upper: 'PPL + Upper',
  ppl: 'PPL Classic',
  upper_lower: 'Upper / Lower',
  full_body: 'Full Body',
  muscle_building_6wk: '6-Week Muscle Building Plan',
  starter_6wk: '6-Week Starter Plan',
};

const STRENGTH_PILLARS: StrengthPillar[] = [
  'Squat',
  'Hinge',
  'Horizontal Push',
  'Vertical Push',
  'Horizontal Pull',
  'Vertical Pull',
];

export interface WorkoutCompletionInput {
  activeWorkout: WorkoutSession;
  history: WorkoutSession[];
  profile: UserProfile;
  readiness: { state: ReadinessState; score: number };
  bodyweightKg: number;
  whoopTelemetry?: WhoopWorkoutStrainSummary;
  now?: Date;
}

export interface WorkoutCompletionResult {
  completedSession: WorkoutSession;
  /** History including the just-completed session (newest first). */
  nextHistory: WorkoutSession[];
  nextMesocycleWeek: number;
  /** First strength standard the athlete moved up in, if any. */
  strengthMilestone: Milestone | null;
  /** Finished training week or block, if this session completed one. */
  weekMilestone: Milestone | null;
}

/**
 * Pure: turns the active workout into a completed record and works out what to celebrate and the
 * next training week. Only measured values are stored (no estimated heart rate or energy).
 */
export function completeWorkout(input: WorkoutCompletionInput): WorkoutCompletionResult {
  const { activeWorkout, history, profile, readiness, bodyweightKg, whoopTelemetry } = input;
  const now = input.now ?? new Date();

  const setTimes = activeWorkout.exercises
    .flatMap((ex) => ex.sets)
    .filter((st) => st.completed && st.completedAt)
    .map((st) => new Date(st.completedAt as string).getTime())
    .filter((t) => !Number.isNaN(t));
  const firstSetAt = setTimes.length > 0 ? Math.min(...setTimes) : undefined;
  // Measured duration only: first logged set to finish (nothing added for warm-ups).
  const measuredDuration = firstSetAt ? Math.max(1, Math.round((now.getTime() - firstSetAt) / 60000)) : undefined;

  const isWhoopActive = Boolean(profile.whoopConnected || profile.wearableSource === 'whoop');

  const completedSession: WorkoutSession = {
    ...activeWorkout,
    date: localDateString(now),
    completed: true,
    completedAt: now.toISOString(),
    startedAt: firstSetAt ? new Date(firstSetAt).toISOString() : activeWorkout.startedAt,
    readinessState: readiness.state,
    readinessZScore: readiness.score,
    avgHeartRate: whoopTelemetry?.avgHeartRate,
    maxHeartRate: whoopTelemetry?.maxHeartRate,
    hasMeasuredHeartRate: whoopTelemetry?.avgHeartRate !== undefined,
    durationMinutes: whoopTelemetry?.workoutDurationMin || measuredDuration,
    whoopStrain: whoopTelemetry?.workoutStrain,
    kilojoules: whoopTelemetry?.kilojoules && whoopTelemetry.kilojoules < 3500 ? whoopTelemetry.kilojoules : undefined,
    wearableSource: isWhoopActive ? 'whoop' : undefined,
  };

  const nextHistory = [completedSession, ...history];

  // Strength rank-ups: only for lifts that were already logged before (a first log is a starting point).
  const prevPillars = calculateBestPillarE1rms(history, bodyweightKg);
  const nextPillars = calculateBestPillarE1rms(nextHistory, bodyweightKg);
  let strengthMilestone: Milestone | null = null;
  for (const p of STRENGTH_PILLARS) {
    if (!prevPillars[p]) continue;
    const oldStd = evaluateStrengthStandard(p, prevPillars[p], bodyweightKg, profile.gender);
    const newStd = evaluateStrengthStandard(p, nextPillars[p], bodyweightKg, profile.gender);
    const adv = evaluateStrengthStandardAdvance(p, oldStd.tier, oldStd.subDivision, newStd.tier, newStd.subDivision);
    if (adv) {
      strengthMilestone = adv;
      break;
    }
  }

  // Week milestone: every N sessions of the program (a plan: every workoutsPerWeek-th plan workout).
  const programType = profile.programType || 'starter_6wk';
  const planShape = getSessionPlanShape(completedSession);
  const isPlan = Boolean(planShape);
  const planNumber = completedSession.programWorkoutNumber || 0;
  const isWeekMilestone = planShape
    ? planNumber > 0 && planNumber % planShape.perWeek === 0
    : nextHistory.filter((w) => w.completed).length % (SESSIONS_PER_WEEK[programType] || 4) === 0;

  let weekMilestone: Milestone | null = null;
  let nextMesocycleWeek = profile.mesocycleWeek || 1;
  if (isWeekMilestone) {
    const completedWeek = profile.mesocycleWeek || 1;
    const planId = getSessionPlanId(completedSession);
    weekMilestone = programMilestone(completedWeek, PROGRAM_LABELS[planId ?? programType] || 'Hypertrophy Split');
    nextMesocycleWeek = completedWeek >= 6 ? 1 : completedWeek + 1;
  }
  if (isPlan && planNumber && planShape) {
    // The plan's week always follows its workout number.
    // The week follows the plan this workout belongs to.
    const plan = getPlanById(getSessionPlanId(completedSession) ?? 'starter_6wk', profile.goalPhase);
    nextMesocycleWeek = Math.ceil(getNextProgramWorkoutNumber(nextHistory, plan) / plan.workoutsPerWeek);
  }

  return { completedSession, nextHistory, nextMesocycleWeek, strengthMilestone, weekMilestone };
}
