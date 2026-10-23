import { WorkoutSession } from './types';

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
 * Tonnage = sum(weight * reps) across completed sets
 */
export function calculateSessionTonnage(session: WorkoutSession): {
  tonnageKg: number;
  completedSetsCount: number;
} {
  let tonnageKg = 0;
  let completedSetsCount = 0;

  for (const ex of session.exercises) {
    for (const s of ex.sets) {
      if (s.completed && !s.isWarmup && s.setType !== 'warmup' && s.actualReps && s.actualReps > 0) {
        const weight = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        tonnageKg += weight * s.actualReps;
        completedSetsCount++;
      }
    }
  }

  return { tonnageKg, completedSetsCount };
}

/**
 * Work Capacity Index (WCI):
 * Formula: WCI = (Effective Tonnage * Sets) / (Avg Session HRR% * Duration_minutes)
 * 
 * High WCI indicates the lifter is handling more volume/density with less cardiovascular strain,
 * proving physiological conditioning alongside mechanical overload.
 */
export function calculateWci(
  session: WorkoutSession,
  restingHr: number = 60,
  maxHr: number = 190
): number {
  const { tonnageKg, completedSetsCount } = calculateSessionTonnage(session);
  if (completedSetsCount === 0 || tonnageKg === 0) return 0;

  const durationMin = Math.max(15, session.durationMinutes || 60);
  // Needs a measured workout heart rate; never assume one.
  if (!session.avgHeartRate) return 0;
  const avgHr = session.avgHeartRate;
  const hrrPct = calculateHrrPercentage(avgHr, restingHr, maxHr);

  const denominator = hrrPct * durationMin;
  if (denominator <= 0) return 0;

  const wci = (tonnageKg * completedSetsCount) / denominator;
  return Math.round(wci);
}
