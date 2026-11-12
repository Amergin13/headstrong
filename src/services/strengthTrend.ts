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

/** Sets above this many reps say little about strength, so they are left out of the index. */
const MAX_INDEX_REPS = 15;

/**
 * Overall strength over time as one index (100 = the first week trained). Each week, every lift
 * trained that week is compared with the last week it was trained; the average of those changes
 * moves the index. Comparing each lift only with itself means a swapped exercise doesn't jump it.
 * Weeks start on Monday; `date` is that Monday.
 */
export function strengthIndexSeries(sessions: WorkoutSession[], bodyweightKg: number): { date: string; value: number }[] {
  const mondayOf = (ms: number) => {
    const d = new Date(ms);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Best estimated max per lift per week.
  const weeks = new Map<string, Map<string, number>>();
  for (const w of sessions) {
    if (!w.completed) continue;
    const week = mondayOf(getWorkoutCompletedAt(w));
    for (const ex of w.exercises) {
      const top = ex.sets
        .filter((s) => done(s) && (s.actualReps ?? 0) <= MAX_INDEX_REPS)
        .reduce(
          (m, s) => Math.max(m, calculateE1RM(weightOf(s), s.actualReps ?? 0, s.actualRir ?? s.targetRir ?? 2, ex.equipment, ex.isRdl, ex.isWeightedCalisthenic, bodyweightKg, ex.exerciseId, ex.pillar)),
          0
        );
      if (top <= 0) continue;
      const lifts = weeks.get(week) ?? new Map<string, number>();
      lifts.set(ex.exerciseId, Math.max(lifts.get(ex.exerciseId) ?? 0, top));
      weeks.set(week, lifts);
    }
  }
  const lastSeen = new Map<string, number>();
  const series: { date: string; value: number }[] = [];
  let index = 100;
  for (const week of [...weeks.keys()].sort()) {
    const lifts = weeks.get(week)!;
    const changes = [...lifts.entries()].filter(([id]) => lastSeen.has(id)).map(([id, e]) => e / (lastSeen.get(id) as number));
    if (changes.length) index *= changes.reduce((a, b) => a + b, 0) / changes.length;
    series.push({ date: week, value: Math.round(index * 10) / 10 });
    for (const [id, e] of lifts) lastSeen.set(id, e);
  }
  return series;
}

/**
 * Strength and bodyweight on the same weeks and the same scale, for one chart: both start at 100 in
 * the first week that has both. A week's bodyweight is the latest 7-day average in that week (or
 * the last one before it). With no weigh-ins, strength alone is returned.
 */
export function alignStrengthAndWeight(
  strength: { date: string; value: number }[],
  averages: { date: string; ema: number }[]
): { strength: { date: string; value: number }[]; weight: { date: string; value: number }[] } {
  const sorted = [...averages].sort((a, b) => a.date.localeCompare(b.date));
  const endOf = (monday: string) => {
    const d = new Date(`${monday}T12:00:00`);
    d.setDate(d.getDate() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const weightIn = (monday: string) => [...sorted].reverse().find((a) => a.date <= endOf(monday))?.ema;
  const both = strength.map((s) => ({ ...s, kg: weightIn(s.date) })).filter((s): s is { date: string; value: number; kg: number } => s.kg !== undefined);
  if (both.length < 2) return { strength, weight: [] };
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    strength: both.map((s) => ({ date: s.date, value: round((s.value / both[0].value) * 100) })),
    weight: both.map((s) => ({ date: s.date, value: round((s.kg / both[0].kg) * 100) })),
  };
}
