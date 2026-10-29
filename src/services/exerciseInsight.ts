/**
 * Per-exercise progress history and the one-paragraph summary shown on each exercise card.
 *
 * Progress is tracked as the best set's estimated one-rep max per session (RIR-adjusted Epley,
 * the app's E1RM formula). It rises when the athlete adds load or reps at the same effort, which
 * is what double progression aims for, and it is not distorted by planned changes in set count
 * (the 6-week plan drops to 2 working sets in Phase 2). Weekly hard sets, not session volume load,
 * are what drive hypertrophy (Schoenfeld et al., 2017; Baz-Valle et al., 2022); those are tracked
 * per muscle elsewhere. Built only from completed sets.
 */
import { calculateE1RM } from '../engine/e1rm';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { ExerciseSession, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';

export interface ExerciseInsight {
  /** Best-set estimated one-rep max (kg) per past session, oldest first. */
  history: { at: number; e1rmKg: number }[];
  summary: string;
}

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const done = (s: WorkoutSet) => s.completed && isWorking(s) && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;

function bestE1rm(ex: ExerciseSession, bodyweightKg: number): number {
  return ex.sets.filter(done).reduce((best, s) => {
    const e = calculateE1RM(
      weightOf(s),
      s.actualReps ?? 0,
      s.actualRir ?? s.targetRir ?? 2,
      ex.equipment,
      ex.isRdl,
      ex.isWeightedCalisthenic,
      bodyweightKg,
      ex.exerciseId,
      ex.pillar
    );
    return Math.max(best, e);
  }, 0);
}

export function buildExerciseInsight(
  exercise: ExerciseSession,
  workouts: WorkoutSession[],
  readinessState: ReadinessState,
  bodyweightKg = 80,
  maxSessions = 12
): ExerciseInsight {
  const past = workouts
    .filter((w) => w.completed)
    .map((w) => ({ w, ex: w.exercises.find((e) => e.exerciseId === exercise.exerciseId && e.sets.some(done)) }))
    .filter((x): x is { w: WorkoutSession; ex: ExerciseSession } => Boolean(x.ex))
    .sort((a, b) => getWorkoutCompletedAt(a.w) - getWorkoutCompletedAt(b.w))
    .slice(-maxSessions);
  const history = past
    .map(({ w, ex }) => ({ at: getWorkoutCompletedAt(w), e1rmKg: Math.round(bestE1rm(ex, bodyweightKg) * 10) / 10 }))
    .filter((h) => h.e1rmKg > 0);

  const plannedSet = exercise.sets.find(isWorking);
  const plannedRir = plannedSet?.targetRir ?? 2;

  // Timed holds and intervals are measured in time, not load.
  if (exercise.durationSeconds || exercise.durationMinutesRange) {
    const time = exercise.durationSeconds
      ? `${exercise.durationSeconds}-second holds`
      : `${exercise.durationMinutesRange![0]}–${exercise.durationMinutesRange![1]} minutes`;
    return { history: [], summary: `Timed work: ${time}. Keep good form for the full time and steady breathing throughout.` };
  }
  if (past.length === 0) {
    const pureBw = exercise.equipment === 'bodyweight' && !exercise.isWeightedCalisthenic;
    const spare = `${plannedRir} ${plannedRir === 1 ? 'rep' : 'reps'} to spare`;
    return {
      history,
      summary: pureBw
        ? `First time doing this exercise. Today sets your starting point: stop each set with ${spare}.`
        : `First time doing this exercise. Today sets your starting point: use a weight you can lift for the target reps with ${spare}.`,
    };
  }

  let trend: string;
  if (history.length < 2) {
    trend = "You've done this exercise once before.";
  } else {
    const first = history[0].e1rmKg;
    const last = history[history.length - 1].e1rmKg;
    const change = first > 0 ? (last - first) / first : 0;
    trend =
      change >= 0.02
        ? 'Progress has been steady, with your strength on this lift rising over time.'
        : change <= -0.02
        ? 'Your strength on this lift has dipped since earlier sessions.'
        : 'Your strength on this lift has held steady.';
  }

  const last = past[past.length - 1].ex;
  const lastSets = last.sets.filter(done);
  const prevTop = lastSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
  const prevReps = lastSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
  const prevRir = Math.min(...lastSets.map((s) => s.actualRir ?? s.targetRir ?? 2));
  const plannedTop = plannedSet?.targetWeightKg ?? 0;
  const plannedReps = plannedSet?.targetReps ?? 0;

  if (readinessState === 'Amber Shield') {
    return { history, summary: `${trend} Today holds the weight steady with 2–3 reps in reserve while you recover.` };
  }
  let today: string;
  if (plannedTop > prevTop + 0.01) {
    today = "Today's session will increase the weight";
  } else if (plannedTop < prevTop - 0.01) {
    today = "Today's session lightens the weight";
  } else if (plannedReps > prevReps) {
    today = "Today's session adds reps at the same weight";
  } else {
    today = "Today's session repeats the weight so you can own every rep";
  }
  const rirClause = plannedRir < prevRir ? ' and focus on reduced reps in reserve.' : '.';
  return { history, summary: `${trend} ${today}${rirClause}` };
}

/** One set from last time, shown in the PREV column. */
export interface PreviousSet {
  weightKg: number;
  reps: number;
}

/** Working sets from the last completed session of this exact exercise (newest first by finish time). */
export function getPreviousWorkingSets(exerciseId: string, workouts: WorkoutSession[]): PreviousSet[] {
  const ordered = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
  for (const w of ordered) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    const done = ex?.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup') || [];
    if (done.length > 0) {
      return done.map((st) => ({
        weightKg: st.actualWeightKg ?? st.targetWeightKg,
        reps: st.actualReps ?? st.targetReps,
      }));
    }
  }
  return [];
}
