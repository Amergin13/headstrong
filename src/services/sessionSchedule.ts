/**
 * The Workout page's 7-day strip: days already trained, today, and the days the next sessions
 * are expected to fall on. Expected days come from the recovery model (each session waits until
 * its muscles recover), never from a fixed calendar.
 */
import { generate6WeekMuscleBuildingWorkout, getProgramWorkoutNumber, WORKOUT_TEMPLATES_24 } from '../engine/muscleBuildingProgram';
import { evaluateSessionRecovery, getTrainableReadyAt, getWorkoutCompletedAt } from '../engine/recovery';
import { ExerciseDefinition, ExerciseSession, ProgramSplitType, WorkoutSession } from '../engine/types';
import { localDateOffset, localDateString, parseLocalDate } from '../utils/date';
import { getNextSplitDay, getSplitTemplateExerciseIds, SplitDayType } from './workoutGenerator';

export type StripDayStatus = 'trained' | 'planned' | 'rest';

export interface StripDay {
  date: string;
  /** 'SAT', 'SUN', ... */
  label: string;
  isToday: boolean;
  status: StripDayStatus;
}

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
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
  catalog: ExerciseDefinition[]
): WorkoutSession {
  const planNumber = getProgramWorkoutNumber(session);
  if (planNumber) {
    return generate6WeekMuscleBuildingWorkout(planNumber >= WORKOUT_TEMPLATES_24.length ? 1 : planNumber + 1);
  }
  return splitDaySession(getNextSplitDay(session.splitDay, programType), catalog);
}

export function buildWeekStrip(input: {
  workouts: WorkoutSession[];
  /** The queued session (today's or the next one). */
  nextSession: WorkoutSession;
  programType?: ProgramSplitType;
  exerciseCatalog: ExerciseDefinition[];
  now?: number;
  daysBefore?: number;
  daysAfter?: number;
}): StripDay[] {
  const now = input.now ?? Date.now();
  const today = new Date(now);
  const daysBefore = input.daysBefore ?? 2;
  const daysAfter = input.daysAfter ?? 4;
  const dates = Array.from({ length: daysBefore + 1 + daysAfter }, (_, i) => localDateOffset(i - daysBefore, today));
  const lastDate = dates[dates.length - 1];

  const completed = input.workouts.filter((w) => w.completed);
  const trained = new Set(completed.map((w) => localDateString(new Date(getWorkoutCompletedAt(w)))));

  // Walk the queue forward: each session lands on the day its muscles are ready.
  const planned = new Set<string>();
  const simulated = [...completed];
  let session = input.nextSession;
  let cursor = now;
  for (let i = 0; i < daysAfter + 2; i++) {
    const gate = evaluateSessionRecovery(session, simulated, input.exerciseCatalog, cursor);
    const readyAt = gate.isReady || gate.readyAt === null ? cursor : getTrainableReadyAt(gate.readyAt);
    const day = localDateString(new Date(readyAt));
    if (day > lastDate) break;
    planned.add(day);
    const trainAt = new Date(readyAt);
    if (trainAt.getHours() < PROJECTED_TRAINING_HOUR) trainAt.setHours(PROJECTED_TRAINING_HOUR, 0, 0, 0);
    simulated.push(asCompleted(session, trainAt.getTime(), i));
    session = getFollowingSession(session, input.programType, input.exerciseCatalog);
    cursor = trainAt.getTime() + 60 * 1000;
  }

  const todayStr = localDateString(today);
  return dates.map((date) => ({
    date,
    label: WEEKDAY_LABELS[parseLocalDate(date).getDay()],
    isToday: date === todayStr,
    status: trained.has(date) ? 'trained' : planned.has(date) && date >= todayStr ? 'planned' : 'rest',
  }));
}
