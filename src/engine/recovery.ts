import { ExerciseDefinition, MuscleGroup, WorkoutSession } from './types';
import { localDateString } from '../utils/date';

/**
 * Muscle-level recovery model behind the Asynchronous Hypertrophy Queue.
 *
 * Base recovery windows come from the volume landmarks table (AGENTS.md §4.2). Each completed
 * session stimulates its exercises' primary muscles fully and secondary muscles partially; the
 * required window scales mildly with the number of hard sets. A session is "ready" once every
 * muscle it targets has recovered to at least READY_THRESHOLD of its window.
 */

export const MUSCLE_RECOVERY_HOURS: Record<MuscleGroup, number> = {
  'Side Delts': 24,
  Calves: 24,
  'Rear Delts': 36,
  Back: 48,
  Chest: 60,
  Quads: 60,
  Hamstrings: 72,
  Triceps: 48,
  Biceps: 36,
  Glutes: 48,
  'Front Delts': 48,
  Shoulders: 48,
  Core: 36,
};

export const MUSCLE_FRIENDLY_NAMES: Record<MuscleGroup, string> = {
  'Side Delts': 'Side shoulders',
  Calves: 'Calves',
  'Rear Delts': 'Rear shoulders',
  Back: 'Back',
  Chest: 'Chest',
  Quads: 'Quads',
  Hamstrings: 'Hamstrings',
  Triceps: 'Triceps',
  Biceps: 'Biceps',
  Glutes: 'Glutes',
  'Front Delts': 'Front shoulders',
  Shoulders: 'Shoulders',
  Core: 'Core',
};

/** A muscle counts as ready at 90% of its recovery window. */
export const READY_THRESHOLD = 0.9;
/** Secondary (assisting) muscles need roughly half the window of a direct hit. */
const SECONDARY_STIMULUS_FACTOR = 0.5;
/** After training today, the next session is never recommended before this local hour tomorrow. */
const NEXT_DAY_EARLIEST_HOUR = 6;

const HOUR_MS = 60 * 60 * 1000;

export interface MuscleRecoveryStatus {
  muscle: MuscleGroup;
  lastTrainedAt: number;
  requiredHours: number;
  hoursSince: number;
  recoveryPct: number; // 0-100
  readyAt: number; // epoch ms when the muscle reaches READY_THRESHOLD
}

export interface SessionRecoveryGate {
  isReady: boolean;
  trainedToday: boolean;
  readyAt: number | null;
  recoveryPct: number; // lowest recovery across target muscles, 0-100
  targetMuscles: MuscleGroup[];
  limitingMuscles: { muscle: MuscleGroup; recoveryPct: number; readyAt: number }[];
  lastWorkoutName?: string;
  lastWorkoutAt?: number;
}

function isWorkingSet(s: { completed?: boolean; isWarmup?: boolean; setType?: string }): boolean {
  return Boolean(s.completed) && !s.isWarmup && s.setType !== 'warmup';
}

/** When a completed workout finished, falling back to 6 PM local on its date for older records. */
export function getWorkoutCompletedAt(w: WorkoutSession): number {
  if (w.completedAt) {
    const t = new Date(w.completedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const [y, m, d] = (w.date || localDateString()).split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1, 18, 0, 0).getTime();
}

function volumeFactor(hardSets: number): number {
  return Math.max(0.8, Math.min(1.2, 0.7 + hardSets * 0.075));
}

/**
 * Latest stimulus per muscle across completed workouts.
 */
export function computeMuscleRecovery(
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  now: number = Date.now()
): Partial<Record<MuscleGroup, MuscleRecoveryStatus>> {
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const result: Partial<Record<MuscleGroup, MuscleRecoveryStatus>> = {};

  for (const w of workouts) {
    if (!w.completed) continue;
    const completedAt = getWorkoutCompletedAt(w);
    if (completedAt > now) continue;

    // Sum hard sets per muscle for this session (primary full, secondary partial).
    const primarySets = new Map<MuscleGroup, number>();
    const secondarySets = new Map<MuscleGroup, number>();
    for (const ex of w.exercises) {
      const def = exMap.get(ex.exerciseId);
      if (!def) continue;
      const hardSets = ex.sets.filter(isWorkingSet).length;
      if (hardSets === 0) continue;
      primarySets.set(def.primaryMuscle, (primarySets.get(def.primaryMuscle) || 0) + hardSets);
      for (const sec of def.secondaryMuscles || []) {
        if (sec === def.primaryMuscle) continue;
        secondarySets.set(sec, (secondarySets.get(sec) || 0) + hardSets);
      }
    }

    const muscles = new Set<MuscleGroup>([...primarySets.keys(), ...secondarySets.keys()]);
    for (const muscle of muscles) {
      const base = MUSCLE_RECOVERY_HOURS[muscle] ?? 48;
      const pSets = primarySets.get(muscle) || 0;
      const sSets = secondarySets.get(muscle) || 0;
      const requiredHours = pSets > 0
        ? base * volumeFactor(pSets)
        : base * SECONDARY_STIMULUS_FACTOR * volumeFactor(sSets);
      const readyAt = completedAt + requiredHours * READY_THRESHOLD * HOUR_MS;

      const existing = result[muscle];
      // Keep whichever stimulus keeps the muscle recovering the longest.
      if (!existing || readyAt > existing.readyAt) {
        const hoursSince = Math.max(0, (now - completedAt) / HOUR_MS);
        result[muscle] = {
          muscle,
          lastTrainedAt: completedAt,
          requiredHours,
          hoursSince,
          recoveryPct: Math.min(100, Math.round((hoursSince / requiredHours) * 100)),
          readyAt,
        };
      }
    }
  }

  return result;
}

/** Primary muscles a session will train, ordered by planned working sets. */
export function getSessionTargetMuscles(
  session: WorkoutSession,
  exerciseCatalog: ExerciseDefinition[]
): MuscleGroup[] {
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const sets = new Map<MuscleGroup, number>();
  for (const ex of session.exercises) {
    const def = exMap.get(ex.exerciseId);
    if (!def) continue;
    const working = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length;
    sets.set(def.primaryMuscle, (sets.get(def.primaryMuscle) || 0) + working);
  }
  return [...sets.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

/**
 * Decides whether the queued session should be trained now, and if not, when it will be ready.
 */
export function evaluateSessionRecovery(
  session: WorkoutSession,
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  now: number = Date.now()
): SessionRecoveryGate {
  const completed = workouts
    .filter((w) => w.completed)
    .sort((a, b) => getWorkoutCompletedAt(b) - getWorkoutCompletedAt(a));
  const last = completed[0];
  const lastAt = last ? getWorkoutCompletedAt(last) : undefined;
  const trainedToday = lastAt !== undefined && localDateString(new Date(lastAt)) === localDateString(new Date(now));

  const recovery = computeMuscleRecovery(workouts, exerciseCatalog, now);
  const targetMuscles = getSessionTargetMuscles(session, exerciseCatalog);

  const limitingMuscles = targetMuscles
    .map((m) => recovery[m])
    .filter((r): r is MuscleRecoveryStatus => Boolean(r) && r!.readyAt > now)
    .map((r) => ({ muscle: r.muscle, recoveryPct: r.recoveryPct, readyAt: r.readyAt }))
    .sort((a, b) => b.readyAt - a.readyAt);

  let readyAt: number | null = limitingMuscles.length > 0 ? limitingMuscles[0].readyAt : null;

  if (trainedToday) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(NEXT_DAY_EARLIEST_HOUR, 0, 0, 0);
    readyAt = Math.max(readyAt ?? 0, tomorrow.getTime());
  }

  const lowestPct = targetMuscles.reduce((min, m) => {
    const r = recovery[m];
    return Math.min(min, r ? r.recoveryPct : 100);
  }, 100);

  return {
    isReady: readyAt === null || readyAt <= now,
    trainedToday,
    readyAt,
    recoveryPct: lowestPct,
    targetMuscles,
    limitingMuscles,
    lastWorkoutName: last?.name,
    lastWorkoutAt: lastAt,
  };
}

/** "Tomorrow at 6 PM", "Friday at 9 AM", or "in 3 hours" — plain English for the rest screen. */
export function formatReadyTime(rawReadyAt: number, now: number = Date.now()): string {
  // Nobody trains at 2 AM: overnight ready times are shown as the following morning.
  const ready = new Date(rawReadyAt);
  if (ready.getHours() < NEXT_DAY_EARLIEST_HOUR) {
    ready.setHours(NEXT_DAY_EARLIEST_HOUR, 0, 0, 0);
  } else if (ready.getHours() >= 22) {
    ready.setDate(ready.getDate() + 1);
    ready.setHours(NEXT_DAY_EARLIEST_HOUR, 0, 0, 0);
  }
  const readyAt = ready.getTime();
  const diffHours = (readyAt - now) / HOUR_MS;
  if (diffHours <= 0) return 'now';
  if (diffHours < 1) return 'in under an hour';
  const target = new Date(readyAt);
  const timeLabel = target.toLocaleTimeString([], { hour: 'numeric', minute: target.getMinutes() ? '2-digit' : undefined });
  const dayDiff = Math.round(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
      new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()) /
      (24 * HOUR_MS)
  );
  if (dayDiff === 0) return diffHours < 6 ? `in ${Math.round(diffHours)} hours` : `today at ${timeLabel}`;
  if (dayDiff === 1) return `tomorrow at ${timeLabel}`;
  return `${target.toLocaleDateString([], { weekday: 'long' })} at ${timeLabel}`;
}
