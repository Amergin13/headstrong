import { WorkoutSession } from './types';
import { getBodyweightLoadRatio, isAssistedExercise, toCombinedExternalLoadKg } from './e1rm';

/**
 * Floor on Heart Rate Reserve fraction used inside the WCI cardiovascular-cost term so
 * lifting with minimal cardiovascular effort or taking excessively long rests cannot inflate WCI.
 */
export const WCI_HRR_FLOOR = 0.35;

/**
 * Calculates Heart Rate Reserve Percentage (HRR%):
 * HRR% = (HR_session - HR_rest) / (HR_max - HR_rest)
 */
export function calculateHrrPercentage(
  avgSessionHr: number,
  restingHr: number = 60,
  maxHr: number = 190
): number {
  if (maxHr <= restingHr) return 0.5;
  const hrr = (avgSessionHr - restingHr) / (maxHr - restingHr);
  return Math.min(1.0, Math.max(0.1, hrr)); // clamp between 0.1 and 1.0
}

/**
 * Calculates Total Effective Tonnage from a workout session:
 * Tonnage = sum(effectiveWeight * reps) across completed dynamic working sets.
 * Paired two-dumbbell exercises store weight per dumbbell (e.g. 24 kg) and contribute
 * combined two-hand external load (e.g. 48 kg) to total session volume/tonnage.
 * When a measured bodyweight (`> 0`) is supplied, bodyweight and weighted-calisthenic
 * sets include their biomechanical bodyweight fraction alongside added load.
 * Timed holds / carries are counted in completedSetsCount without multiplying seconds as reps.
 */
export function calculateSessionTonnage(
  session: WorkoutSession,
  bodyweightKgOrLookup: number | ((date: string) => number) = 0
): {
  tonnageKg: number;
  completedSetsCount: number;
} {
  let tonnageKg = 0;
  let completedSetsCount = 0;
  const resolvedBw =
    typeof bodyweightKgOrLookup === 'function'
      ? bodyweightKgOrLookup(session.date)
      : bodyweightKgOrLookup;
  const sessionBw = resolvedBw > 0 ? resolvedBw : 0;

  for (const ex of session.exercises) {
    const isTimed = Boolean(
      ex.repTargetType === 'duration' || ex.durationSeconds || ex.durationMinutesRange
    );
    const isAssisted = isAssistedExercise(ex);
    const isCalisthenic =
      isAssisted ||
      ex.equipment === 'bodyweight' ||
      ex.equipment === 'weighted_bodyweight' ||
      Boolean(ex.isWeightedCalisthenic);
    const bwLoad =
      !isTimed && isCalisthenic && sessionBw > 0
        ? sessionBw * getBodyweightLoadRatio(ex.exerciseId, ex.pillar)
        : 0;

    for (const s of ex.sets) {
      if (!s.completed || s.isWarmup || s.setType === 'warmup') continue;
      if (isTimed) {
        if ((s.actualDurationSeconds ?? s.targetDurationSeconds ?? s.actualReps ?? 0) > 0) {
          completedSetsCount++;
        }
        continue;
      }
      if (s.actualReps && s.actualReps > 0) {
        const loggedWeight = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const addedWeight = toCombinedExternalLoadKg(loggedWeight, ex);
        const effectiveWeight = isAssisted
          ? Math.max(0, bwLoad > 0 ? bwLoad - loggedWeight : 0)
          : bwLoad + addedWeight;
        tonnageKg += effectiveWeight * s.actualReps;
        completedSetsCount++;
      }
    }
  }

  return { tonnageKg: Math.round(tonnageKg * 10) / 10, completedSetsCount };
}

/**
 * Work Capacity Index (WCI):
 * Formula: WCI = Effective Tonnage / (Duration_minutes * (1 + max(0.35, Avg Session HRR%)))
 *
 * Mechanical work rate (kg/min) normalized by bounded cardiovascular cost:
 * - No CompletedSets multiplier in the numerator (tonnage already scales with sets; multiplying
 *   again caused quadratic scaling that rewarded high-volume junk sets).
 * - Bounded (1 + max(0.35, HRR%)) denominator rewards genuine cardiovascular conditioning at equal
 *   work density without allowing long rests or low-effort heart rates to inflate the score.
 */
export function calculateWci(
  session: WorkoutSession,
  restingHr: number = 60,
  maxHr: number = 190,
  bodyweightKg: number = 0
): number {
  const { tonnageKg, completedSetsCount } = calculateSessionTonnage(session, bodyweightKg);
  if (completedSetsCount === 0 || tonnageKg === 0) return 0;

  const durationMin = Math.max(15, session.durationMinutes || 60);
  // Needs a measured workout heart rate; never assume one.
  if (!session.avgHeartRate) return 0;
  const avgHr = session.avgHeartRate;
  const hrrPct = calculateHrrPercentage(avgHr, restingHr, maxHr);
  const boundedHrr = Math.max(WCI_HRR_FLOOR, hrrPct);

  const denominator = durationMin * (1 + boundedHrr);
  if (denominator <= 0) return 0;

  const wci = tonnageKg / denominator;
  return Math.round(wci);
}
