/**
 * How many of the athlete's repeated lifts have a higher estimated max now than when first logged.
 * One function for the Program message, the goals and the Progress page, so they agree.
 */
import { calculateE1RM } from '../engine/e1rm';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { WorkoutSession, WorkoutSet } from '../engine/types';

const done = (s: WorkoutSet) => s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;

export interface StrengthTrend {
  /** Lifts done in at least two sessions. */
  repeated: number;
  /** Of those, lifts whose latest best estimated max is above their first (by more than 0.5%). */
  improved: number;
  /** Of those, lifts that are level with or above their first (within 0.5% counts as held). */
  heldOrImproved: number;
}

/** Sessions are read oldest first, whatever order they are passed in. */
export function strengthTrend(sessions: WorkoutSession[], bodyweightKg: number): StrengthTrend {
  const byExercise = new Map<string, number[]>();
  const ordered = sessions.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  for (const w of ordered) {
    for (const ex of w.exercises) {
      const top = ex.sets.filter(done).reduce((m, s) => {
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
        return Math.max(m, e);
      }, 0);
      if (top > 0) byExercise.set(ex.exerciseId, [...(byExercise.get(ex.exerciseId) ?? []), top]);
    }
  }
  const series = [...byExercise.values()].filter((v) => v.length >= 2);
  return {
    repeated: series.length,
    improved: series.filter((v) => v[v.length - 1] > v[0] * 1.005).length,
    heldOrImproved: series.filter((v) => v[v.length - 1] >= v[0] * 0.995).length,
  };
}
