import { ActivityLog, activeDayDates } from '../engine/activeDays';
import { rebuildIsolatedProgressionStates } from '../engine/continuityEngine';
import { computeTrainingStreak } from '../engine/recovery';
import { ExerciseDefinition, ExerciseProgressionState, WorkoutSession } from '../engine/types';
import { SEED_EXERCISES } from './seedData';

const BUILTIN_EXERCISE_IDS = new Set(SEED_EXERCISES.map((e) => e.id));

export function isCustomExercise(exercise: Pick<ExerciseDefinition, 'id'>): boolean {
  return !BUILTIN_EXERCISE_IDS.has(exercise.id);
}

export interface PastWorkoutMutationResult {
  nextWorkouts: WorkoutSession[];
  streakDays: number;
  lastWorkoutDate: string | undefined;
  exerciseProgressionStates: Record<string, ExerciseProgressionState>;
}

function latestCompletedWorkoutDate(workouts: WorkoutSession[]): string | undefined {
  let latest: string | undefined;
  for (const w of workouts) {
    if (!w.completed) continue;
    if (!latest || w.date > latest) latest = w.date;
  }
  return latest;
}

/**
 * Pure deterministic update of a completed past workout in history.
 * Recomputes streak, lastWorkoutDate, and isolated per-exercise progression states
 * so Analytics, Program, Coach, and Continuity priors stay on one source of truth.
 */
export function updatePastWorkoutInHistory(params: {
  workouts: WorkoutSession[];
  updatedWorkout: WorkoutSession;
  activities?: ActivityLog[];
  defaultBodyweightKg?: number;
  nowMs?: number;
}): PastWorkoutMutationResult {
  const {
    workouts,
    updatedWorkout,
    activities = [],
    defaultBodyweightKg = 80,
    nowMs = Date.now(),
  } = params;

  const nextWorkouts = workouts.map((w) =>
    w.id === updatedWorkout.id ? updatedWorkout : w
  );
  const exerciseProgressionStates = rebuildIsolatedProgressionStates(
    nextWorkouts,
    defaultBodyweightKg
  );
  const streakDays = computeTrainingStreak(
    nextWorkouts,
    nowMs,
    activeDayDates(activities)
  );
  const lastWorkoutDate = latestCompletedWorkoutDate(nextWorkouts);

  return {
    nextWorkouts,
    streakDays,
    lastWorkoutDate,
    exerciseProgressionStates,
  };
}

/**
 * Pure deterministic removal of a completed past workout from history.
 * Recomputes streak, lastWorkoutDate, and isolated per-exercise progression states.
 */
export function deletePastWorkoutFromHistory(params: {
  workouts: WorkoutSession[];
  workoutId: string;
  activities?: ActivityLog[];
  defaultBodyweightKg?: number;
  nowMs?: number;
}): PastWorkoutMutationResult {
  const {
    workouts,
    workoutId,
    activities = [],
    defaultBodyweightKg = 80,
    nowMs = Date.now(),
  } = params;

  const nextWorkouts = workouts.filter((w) => w.id !== workoutId);
  const exerciseProgressionStates = rebuildIsolatedProgressionStates(
    nextWorkouts,
    defaultBodyweightKg
  );
  const streakDays = computeTrainingStreak(
    nextWorkouts,
    nowMs,
    activeDayDates(activities)
  );
  const lastWorkoutDate = latestCompletedWorkoutDate(nextWorkouts);

  return {
    nextWorkouts,
    streakDays,
    lastWorkoutDate,
    exerciseProgressionStates,
  };
}

export function updateCustomExerciseInCatalog(
  catalog: ExerciseDefinition[],
  updated: ExerciseDefinition
): ExerciseDefinition[] {
  if (!isCustomExercise(updated)) return catalog;
  return catalog.map((ex) => (ex.id === updated.id ? { ...ex, ...updated } : ex));
}

export function deleteCustomExerciseFromCatalog(
  catalog: ExerciseDefinition[],
  exerciseId: string
): ExerciseDefinition[] {
  if (BUILTIN_EXERCISE_IDS.has(exerciseId)) return catalog;
  return catalog.filter((ex) => ex.id !== exerciseId);
}
