import { ExerciseDefinition, MuscleGroup, ReadinessState, WorkoutSession, WorkoutSet } from './types';
import { daysBetweenLocalDates, localDateString } from '../utils/date';

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
/**
 * Modest multiplier applied to local muscle recovery windows while systemic Amber Shield
 * is active, unifying systemic and local recovery so they never contradict each other.
 */
export const AMBER_SHIELD_RECOVERY_MULTIPLIER = 1.2;
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

export type RecoveryAdvisoryStatus = 'ready' | 'recovering' | 'systemic_low' | 'trained_today';

export interface SessionRecoveryGate {
  isReady: boolean;
  trainedToday: boolean;
  readyAt: number | null;
  recoveryPct: number; // lowest recovery across target muscles, 0-100
  targetMuscles: MuscleGroup[];
  limitingMuscles: { muscle: MuscleGroup; recoveryPct: number; readyAt: number }[];
  lastWorkoutName?: string;
  lastWorkoutAt?: number;
  /** Systemic multiplier applied to local recovery windows (1.2 during Amber Shield, else 1.0). */
  systemicMultiplier: number;
  /** Readiness state incorporated into this unified recovery check. */
  readinessState?: ReadinessState;
  /** Unified advisory status across local muscle recovery and systemic wearable readiness. */
  advisoryStatus: RecoveryAdvisoryStatus;
  /** Calm, non-blocking advisory note describing recovery without blocking the session. */
  advisoryMessage: string;
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
 * When `readinessState === 'Amber Shield'`, local recovery windows are scaled by
 * `AMBER_SHIELD_RECOVERY_MULTIPLIER` (1.2x) so local muscle recovery and systemic readiness stay unified.
 */
export function computeMuscleRecovery(
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  now: number = Date.now(),
  readinessState?: ReadinessState
): Partial<Record<MuscleGroup, MuscleRecoveryStatus>> {
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const result: Partial<Record<MuscleGroup, MuscleRecoveryStatus>> = {};
  const systemicMultiplier = readinessState === 'Amber Shield' ? AMBER_SHIELD_RECOVERY_MULTIPLIER : 1;

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
      const baseRequiredHours = pSets > 0
        ? base * volumeFactor(pSets)
        : base * SECONDARY_STIMULUS_FACTOR * volumeFactor(sSets);
      const requiredHours = baseRequiredHours * systemicMultiplier;
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
 * Advisory unified recovery evaluation across local muscle windows and systemic wearable readiness.
 * Never blocks the planned workout; surfaces calm guidance and opt-in modulation cues.
 */
export function evaluateSessionRecovery(
  session: WorkoutSession,
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  now: number = Date.now(),
  readinessState?: ReadinessState
): SessionRecoveryGate {
  const completed = workouts
    .filter((w) => w.completed)
    .sort((a, b) => getWorkoutCompletedAt(b) - getWorkoutCompletedAt(a));
  const last = completed[0];
  const lastAt = last ? getWorkoutCompletedAt(last) : undefined;
  const trainedToday = lastAt !== undefined && localDateString(new Date(lastAt)) === localDateString(new Date(now));
  const systemicMultiplier = readinessState === 'Amber Shield' ? AMBER_SHIELD_RECOVERY_MULTIPLIER : 1;

  const recovery = computeMuscleRecovery(workouts, exerciseCatalog, now, readinessState);
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

  const rawLowestPct = targetMuscles.reduce((min, m) => {
    const r = recovery[m];
    return Math.min(min, r ? r.recoveryPct : 100);
  }, 100);
  // Prevent contradictory "100% recovered" local readout while systemic Amber Shield is active.
  const lowestPct = readinessState === 'Amber Shield' ? Math.min(rawLowestPct, 85) : rawLowestPct;

  const isReady = readyAt === null || readyAt <= now;
  const advisoryStatus: RecoveryAdvisoryStatus = trainedToday
    ? 'trained_today'
    : !isReady
    ? 'recovering'
    : readinessState === 'Amber Shield'
    ? 'systemic_low'
    : 'ready';

  const topMuscleNames = limitingMuscles
    .slice(0, 2)
    .map((m) => MUSCLE_FRIENDLY_NAMES[m.muscle].toLowerCase())
    .join(' and ');

  let advisoryMessage: string;
  if (advisoryStatus === 'trained_today') {
    advisoryMessage = `You already finished ${last?.name ?? 'a workout'} today. Your next session is queued for tomorrow.`;
  } else if (advisoryStatus === 'recovering') {
    const systemicNote = readinessState === 'Amber Shield' ? ' Systemic recovery is also low today.' : '';
    advisoryMessage = `${
      topMuscleNames ? `${topMuscleNames.charAt(0).toUpperCase() + topMuscleNames.slice(1)} still recovering` : 'Target muscles are still recovering'
    } (full recovery ${formatReadyTime(readyAt ?? now, now)}).${systemicNote} Your planned workout is ready if today fits your schedule—optionally trim 1 set per lift or leave 2–3 RIR.`;
  } else if (advisoryStatus === 'systemic_low') {
    advisoryMessage =
      'Systemic recovery signal is low today. Your planned session is ready—optionally trim 1 set per lift or shift to 2–3 RIR.';
  } else {
    advisoryMessage = 'Target muscles are recovered and ready for your planned session.';
  }

  return {
    isReady,
    trainedToday,
    readyAt,
    recoveryPct: lowestPct,
    targetMuscles,
    limitingMuscles,
    lastWorkoutName: last?.name,
    lastWorkoutAt: lastAt,
    systemicMultiplier,
    readinessState,
    advisoryStatus,
    advisoryMessage,
  };
}

/**
 * Applies a 1-tap opt-in recovery modulation to an active workout without blocking or hiding it:
 * - 'trim_sets': removes 1 uncompleted working set per exercise (down to a minimum of 1 working set).
 * - 'conservative_rir': shifts uncompleted working sets to 2–3 RIR.
 * - 'both': applies both set trim and 2–3 RIR buffer.
 * Preserves the original planned sets so the athlete can restore them with 1 tap.
 */
export function applyRecoveryModulation(
  session: WorkoutSession,
  mode: 'trim_sets' | 'conservative_rir' | 'both'
): WorkoutSession {
  const baselineByEx: Record<string, WorkoutSet[]> =
    session.recoveryModulation?.originalSetsByExerciseId ??
    Object.fromEntries(session.exercises.map((ex) => [ex.id, ex.sets.map((s) => ({ ...s }))]));

  const exercises = session.exercises.map((ex) => {
    const sourceSets = (baselineByEx[ex.id] ?? ex.sets).map((s) => {
      const current = ex.sets.find((c) => c.id === s.id);
      return current?.completed ? { ...current } : { ...s };
    });

    let workingIndices = sourceSets
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.isWarmup && s.setType !== 'warmup');

    let kept = sourceSets;
    if ((mode === 'trim_sets' || mode === 'both') && workingIndices.length > 1) {
      // Remove the last uncompleted working set so at least 1 working set remains.
      const removable = [...workingIndices].reverse().find(({ s }) => !s.completed);
      if (removable) {
        kept = sourceSets.filter((_, idx) => idx !== removable.i);
      }
    }

    if (mode === 'conservative_rir' || mode === 'both') {
      kept = kept.map((s) => {
        if (s.completed || s.isWarmup || s.setType === 'warmup') return s;
        const shiftedRir = Math.max(2, Math.min(3, (s.targetRir ?? 2) <= 1 ? 2 : 3));
        return {
          ...s,
          targetRir: shiftedRir,
          actualRir: s.actualRir !== undefined ? shiftedRir : undefined,
        };
      });
    }

    return {
      ...ex,
      sets: kept.map((s, idx) => ({ ...s, setNumber: idx + 1 })),
    };
  });

  return {
    ...session,
    exercises,
    recoveryModulation: {
      mode,
      appliedAt: new Date().toISOString(),
      originalSetsByExerciseId: baselineByEx,
    },
  };
}

/** Restores an opt-in modulated workout back to its original planned sets and RIR targets. */
export function clearRecoveryModulation(session: WorkoutSession): WorkoutSession {
  const baselineByEx = session.recoveryModulation?.originalSetsByExerciseId;
  if (!baselineByEx) return { ...session, recoveryModulation: undefined };
  return {
    ...session,
    exercises: session.exercises.map((ex) => {
      const orig = baselineByEx[ex.id];
      if (!orig) return ex;
      return {
        ...ex,
        sets: orig.map((s, idx) => {
          const current = ex.sets.find((c) => c.id === s.id);
          return current?.completed ? { ...current, setNumber: idx + 1 } : { ...s, setNumber: idx + 1 };
        }),
      };
    }),
    recoveryModulation: undefined,
  };
}

/** Nobody trains at 2 AM: overnight ready times move to the following morning. */
export function getTrainableReadyAt(rawReadyAt: number): number {
  const ready = new Date(rawReadyAt);
  if (ready.getHours() < NEXT_DAY_EARLIEST_HOUR) {
    ready.setHours(NEXT_DAY_EARLIEST_HOUR, 0, 0, 0);
  } else if (ready.getHours() >= 22) {
    ready.setDate(ready.getDate() + 1);
    ready.setHours(NEXT_DAY_EARLIEST_HOUR, 0, 0, 0);
  }
  return ready.getTime();
}

/** The ready time as shown to the athlete: rounded up to the hour, overnight moved to the morning. */
export function getDisplayReadyAt(rawReadyAt: number): number {
  const rounded = new Date(rawReadyAt);
  if (rounded.getMinutes() || rounded.getSeconds() || rounded.getMilliseconds()) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  }
  return getTrainableReadyAt(rounded.getTime());
}

/** Calendar days from today until the next session can be trained (0 = later today). */
export function getDaysUntilReady(rawReadyAt: number, now: number = Date.now()): number {
  return Math.max(0, daysBetweenLocalDates(localDateString(new Date(now)), localDateString(new Date(getDisplayReadyAt(rawReadyAt)))));
}

/** "Tomorrow at 6 PM", "Friday at 9 AM", or "in 3 hours" — plain English for the rest screen. */
export function formatReadyTime(rawReadyAt: number, now: number = Date.now()): string {
  const readyAt = getDisplayReadyAt(rawReadyAt);
  const diffHours = (readyAt - now) / HOUR_MS;
  if (diffHours <= 0) return 'now';
  if (diffHours < 1) return 'in under an hour';
  const target = new Date(readyAt);
  const timeLabel = target.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dayDiff = Math.round(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
      new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()) /
      (24 * HOUR_MS)
  );
  if (dayDiff === 0) {
    if (diffHours >= 6) return `today at ${timeLabel}`;
    const hours = Math.max(1, Math.round(diffHours));
    return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
  }
  if (dayDiff === 1) return `tomorrow at ${timeLabel}`;
  return `${target.toLocaleDateString([], { weekday: 'long' })} at ${timeLabel}`;
}

/** Longest rest between training days that keeps a streak going (recovery waits run up to about 4 days). */
export const STREAK_MAX_REST_DAYS = 4;

/**
 * Training-day streak from the saved workouts: distinct days trained, counting back from the most
 * recent, as long as no rest gap is longer than STREAK_MAX_REST_DAYS. Rest days the recovery queue
 * asks for never break it. 0 when the last workout was too long ago.
 */
export function computeTrainingStreak(
  workouts: WorkoutSession[],
  now: number = Date.now(),
  /** Local dates of active days (rides, runs, classes of 20+ minutes); they keep the streak too. */
  activeDates: string[] = []
): number {
  const days = [...new Set([...workouts.filter((w) => w.completed).map((w) => w.date), ...activeDates])].sort().reverse();
  if (!days.length) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const toTime = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).getTime();
  };
  const today = new Date(now);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (Math.round((todayStart - toTime(days[0])) / dayMs) > STREAK_MAX_REST_DAYS + 1) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((toTime(days[i - 1]) - toTime(days[i])) / dayMs);
    if (gap > STREAK_MAX_REST_DAYS + 1) break;
    streak++;
  }
  return streak;
}
