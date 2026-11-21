/**
 * The Workout page's 7-day strip: days already trained, today, and the days the next sessions
 * are expected to fall on. Expected days come from the recovery model (each session waits until
 * its muscles recover), never from a fixed calendar.
 */
import { isTimedExercise } from '../engine/e1rm';
import {
  TrainingPlan,
  generatePlanWorkout,
  getProgramWorkoutNumber,
  getSessionPlanId,
  isActiveSlot,
  planWorkoutLabel,
} from '../engine/muscleBuildingProgram';
import { getPlanById } from '../engine/trainingPlans';
import { evaluateSessionRecovery, getTrainableReadyAt, getWorkoutCompletedAt } from '../engine/recovery';
import { ExerciseDefinition, ExerciseSession, HabitAnchor, ProgramSplitType, WeekdayShort, WorkoutSession } from '../engine/types';
import { localDateOffset, localDateString, parseLocalDate } from '../utils/date';
import { getNextSplitDay, getSplitTemplateExerciseIds, SplitDayType } from './workoutGenerator';

export type StripDayStatus = 'trained' | 'planned' | 'rest';

export interface UpcomingSessionPreview {
  name: string;
  splitDay?: string;
  programWorkoutNumber?: number;
  totalProgramWorkouts?: number;
  exercises: Array<{
    exerciseId: string;
    name: string;
    setsCount: number;
    targetLabel: string;
  }>;
}

export interface StripDay {
  date: string;
  /** 'Sat', 'Sun', ... */
  label: string;
  isToday: boolean;
  status: StripDayStatus;
  /** Scheduled workout preview for upcoming 'planned' training days. */
  plannedSession?: UpcomingSessionPreview;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Sessions are assumed to be trained in the early evening when projecting ahead. */
const PROJECTED_TRAINING_HOUR = 18;

function asCompleted(session: WorkoutSession, at: number, index: number): WorkoutSession {
  return {
    ...session,
    id: `projected-${index}`,
    completed: true,
    completedAt: new Date(at).toISOString(),
    date: localDateString(new Date(at)),
    exercises: session.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({ ...s, completed: true, actualReps: s.actualReps ?? s.targetReps })),
    })),
  };
}

/** Minimal session for a split day: enough for the recovery model (exercises and set counts). */
function splitDaySession(split: SplitDayType, catalog: ExerciseDefinition[]): WorkoutSession {
  const exercises: ExerciseSession[] = getSplitTemplateExerciseIds(split).map((id, i) => {
    const def = catalog.find((d) => d.id === id);
    return {
      id: `projected-${split}-${i}`,
      exerciseId: id,
      name: def?.name ?? id,
      pillar: def?.pillar ?? 'Horizontal Push',
      equipment: def?.equipment ?? 'barbell',
      minReps: 8,
      maxReps: 12,
      sets: [1, 2, 3].map((n) => ({ id: `${id}-${n}`, setNumber: n, targetWeightKg: 0, targetReps: 10, targetRir: 2, completed: false })),
    } as ExerciseSession;
  });
  return {
    id: `projected-${split}`,
    date: localDateString(),
    name: split,
    splitDay: split,
    exercises,
    completed: false,
    readinessState: 'Normal',
    readinessZScore: 0,
  };
}

/** The session that follows `session` in the athlete's program. */
export function getFollowingSession(
  session: WorkoutSession,
  programType: ProgramSplitType | undefined,
  catalog: ExerciseDefinition[],
  plan?: TrainingPlan
): WorkoutSession {
  const planNumber = getProgramWorkoutNumber(session);
  const planId = getSessionPlanId(session);
  if (planNumber && planId) {
    const p = plan && plan.id === planId ? plan : getPlanById(planId);
    // The next lifting workout; active days aren't lifting sessions.
    const lifts = p.templates.filter((t) => !isActiveSlot(t)).map((t) => t.workoutNumber);
    return generatePlanWorkout(p, lifts.find((n) => n > planNumber) ?? lifts[0] ?? 1);
  }
  return splitDaySession(getNextSplitDay(session.splitDay, programType), catalog);
}

function toUpcomingPreview(session: WorkoutSession, plan?: TrainingPlan): UpcomingSessionPreview {
  const num = getProgramWorkoutNumber(session);
  const planId = getSessionPlanId(session);
  const p = num && planId ? (plan && plan.id === planId ? plan : getPlanById(planId)) : undefined;
  const totalProgramWorkouts = p ? p.templates.filter((t) => !isActiveSlot(t)).length : undefined;
  return {
    name: planWorkoutLabel(session.name),
    splitDay: session.splitDay,
    ...(num ? { programWorkoutNumber: num, totalProgramWorkouts } : {}),
    exercises: session.exercises.map((ex) => {
      const working = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
      const sets = working.length > 0 ? working : ex.sets;
      const timed = isTimedExercise(ex);
      const holdSecs = sets[0]?.targetDurationSeconds ?? ex.durationSeconds ?? 45;
      const targetLabel = timed
        ? `${holdSecs}s hold`
        : ex.minReps === ex.maxReps
        ? `${ex.minReps} reps`
        : `${ex.minReps}–${ex.maxReps} reps`;
      return {
        exerciseId: ex.exerciseId,
        name: ex.name,
        setsCount: sets.length,
        targetLabel,
      };
    }),
  };
}

export function buildWeekStrip(input: {
  workouts: WorkoutSession[];
  /** The queued session (today's or the next one). */
  nextSession: WorkoutSession;
  programType?: ProgramSplitType;
  /** The athlete's plan, so projected plan sessions use their goal's sets. */
  plan?: TrainingPlan;
  exerciseCatalog: ExerciseDefinition[];
  now?: number;
  daysBefore?: number;
  daysAfter?: number;
}): StripDay[] {
  const now = input.now ?? Date.now();
  const today = new Date(now);
  // Today sits in the middle of the week.
  const daysBefore = input.daysBefore ?? 3;
  const daysAfter = input.daysAfter ?? 3;
  const dates = Array.from({ length: daysBefore + 1 + daysAfter }, (_, i) => localDateOffset(i - daysBefore, today));
  const lastDate = dates[dates.length - 1];
  const todayStr = localDateString(today);

  // Only completed program/lifting sessions count as trained days on the Workout week strip.
  // Health Connect steps and non-program activities never appear here as completed workouts.
  const completed = input.workouts.filter((w) => w.completed);
  const trained = new Set(
    completed.map((w) => localDateString(new Date(getWorkoutCompletedAt(w))))
  );

  // Walk the queue forward: each session lands on the day its muscles are ready.
  const planned = new Set<string>();
  const plannedSessions = new Map<string, WorkoutSession>();
  const simulated = [...completed];
  let session = input.nextSession;
  // If today's session was deliberately pushed onto an upcoming day in this window (rest day), start projection there.
  let cursor =
    input.nextSession.date > todayStr &&
    input.nextSession.date <= lastDate &&
    !input.nextSession.completed
      ? Math.max(now, parseLocalDate(input.nextSession.date).getTime())
      : now;
  for (let i = 0; i < daysAfter + 2; i++) {
    const gate = evaluateSessionRecovery(session, simulated, input.exerciseCatalog, cursor);
    const readyAt = gate.isReady || gate.readyAt === null ? cursor : getTrainableReadyAt(gate.readyAt);
    const day = localDateString(new Date(readyAt));
    if (day > lastDate) break;
    planned.add(day);
    if (!plannedSessions.has(day)) {
      plannedSessions.set(day, session);
    }
    const trainAt = new Date(readyAt);
    if (trainAt.getHours() < PROJECTED_TRAINING_HOUR) trainAt.setHours(PROJECTED_TRAINING_HOUR, 0, 0, 0);
    simulated.push(asCompleted(session, trainAt.getTime(), i));
    session = getFollowingSession(session, input.programType, input.exerciseCatalog, input.plan);
    cursor = trainAt.getTime() + 60 * 1000;
  }

  return dates.map((date) => {
    const status: StripDayStatus = trained.has(date)
      ? 'trained'
      : planned.has(date) && date >= todayStr
      ? 'planned'
      : 'rest';
    const scheduled = status === 'planned' ? plannedSessions.get(date) : undefined;
    return {
      date,
      label: WEEKDAY_LABELS[parseLocalDate(date).getDay()],
      isToday: date === todayStr,
      status,
      ...(scheduled ? { plannedSession: toUpcomingPreview(scheduled, input.plan) } : {}),
    };
  });
}

export interface HabitAnchorStatus {
  hasAnchor: boolean;
  isPreferredDayToday: boolean;
  rolledOverFromMissedDay: boolean;
  headline?: string;
  detail?: string;
}

const TIME_LABELS: Record<NonNullable<HabitAnchor['preferredTime']>, string> = {
  morning: 'morning',
  midday: 'midday',
  evening: 'evening',
  flexible: 'any time',
};

/**
 * Evaluates an athlete's optional habit anchor (Kaushal & Rhodes, 2015) with non-punitive
 * asynchronous rollover (Lally et al., 2010: a single missed session does not break habit formation;
 * "never miss twice"). Never blocks training or penalizes streaks.
 */
export function evaluateHabitAnchor(
  anchor: HabitAnchor | undefined,
  workouts: WorkoutSession[],
  activeDates: string[] = [],
  now: number = Date.now()
): HabitAnchorStatus {
  const days = anchor?.preferredDays ?? [];
  const hasCue = Boolean(anchor?.cue?.trim());
  const hasTime = Boolean(anchor?.preferredTime && anchor.preferredTime !== 'flexible');
  if (days.length === 0 && !hasCue && !hasTime) {
    return { hasAnchor: false, isPreferredDayToday: false, rolledOverFromMissedDay: false };
  }

  const today = new Date(now);
  const todayStr = localDateString(today);
  const todayLabel = WEEKDAY_LABELS[today.getDay()] as WeekdayShort;
  const trainedSet = new Set<string>(activeDates);
  for (const w of workouts) {
    if (w.completed) trainedSet.add(w.completedAt ? localDateString(new Date(w.completedAt)) : w.date);
  }
  const trainedToday = trainedSet.has(todayStr);

  // Check if the most recent preferred day within the past 2 days was missed -> gentle "never miss twice" rollover.
  let missedRecentPreferredDay: WeekdayShort | null = null;
  if (!trainedToday && days.length > 0) {
    for (let offset = 1; offset <= 2; offset++) {
      const dStr = localDateOffset(-offset, today);
      const dLabel = WEEKDAY_LABELS[parseLocalDate(dStr).getDay()] as WeekdayShort;
      if (days.includes(dLabel)) {
        if (!trainedSet.has(dStr)) {
          missedRecentPreferredDay = dLabel;
        }
        break;
      }
    }
  }

  const isPreferredDayToday = days.includes(todayLabel);
  const cuePart = anchor?.cue?.trim();
  const timePart = hasTime && anchor?.preferredTime ? TIME_LABELS[anchor.preferredTime] : undefined;

  if (trainedToday) {
    return {
      hasAnchor: true,
      isPreferredDayToday,
      rolledOverFromMissedDay: false,
      headline: 'Habit cue hit today',
      detail: cuePart ? `Anchored to "${cuePart}".` : undefined,
    };
  }

  if (missedRecentPreferredDay) {
    return {
      hasAnchor: true,
      isPreferredDayToday,
      rolledOverFromMissedDay: true,
      headline: 'Rolled forward — never miss twice',
      detail: `Your ${missedRecentPreferredDay} session moved cleanly to today${cuePart ? ` · Cue: ${cuePart}` : ''}. One missed day doesn't break the habit.`,
    };
  }

  if (isPreferredDayToday) {
    return {
      hasAnchor: true,
      isPreferredDayToday: true,
      rolledOverFromMissedDay: false,
      headline: timePart ? `Planned ${timePart} session` : 'Preferred training day',
      detail: cuePart ? `Cue: ${cuePart}` : `Scheduled for ${days.join(', ')}.`,
    };
  }

  return {
    hasAnchor: true,
    isPreferredDayToday: false,
    rolledOverFromMissedDay: false,
    headline: days.length > 0 ? `Preferred days: ${days.join(', ')}` : 'Habit anchor active',
    detail: cuePart ? `Cue: ${cuePart}` : timePart ? `Preferred window: ${timePart}` : undefined,
  };
}
