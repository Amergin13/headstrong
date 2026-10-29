import { StrengthPillar, StrengthTier, SubDivision } from './types';

/** A moment worth celebrating: a personal best, a strength rank-up or a finished training week. */
export interface Milestone {
  title: string;
  description: string;
  tag?: string;
}

/** Finished training week, or the whole 6-week block. */
export function programMilestone(completedWeek: number, programName: string = 'Hypertrophy Split'): Milestone {
  if (completedWeek >= 6) {
    return {
      title: 'Block complete',
      description: `You finished the 6-week ${programName}.`,
      tag: 'Block complete',
    };
  }
  return {
    title: `Week ${completedWeek} complete`,
    description: `You finished every session in week ${completedWeek}.`,
    tag: `Week ${completedWeek}`,
  };
}

/**
 * Personal bests on a logged set (progressive overload), compared with the best earlier set:
 * - more weight (at 6+ reps)
 * - the top of the rep range reached for the first time (ready to add weight)
 * - more reps at the same or higher weight
 * A first-ever log of an exercise is a starting point, not a personal best.
 */
export function evaluateExerciseProgress(
  exerciseName: string,
  currentWeightKg: number,
  currentReps: number,
  previousBestWeightKg?: number,
  previousBestReps?: number,
  maxReps: number = 12
): Milestone | null {
  if (!previousBestWeightKg || !previousBestReps) return null;

  if (currentWeightKg > previousBestWeightKg && currentReps >= 6) {
    const delta = Math.round((currentWeightKg - previousBestWeightKg) * 10) / 10;
    return {
      title: 'Weight PR',
      description: `Lifted +${delta} kg on ${exerciseName} (${currentWeightKg} kg × ${currentReps})!`,
      tag: 'Weight PR',
    };
  }

  if (currentReps >= maxReps && previousBestReps < maxReps) {
    return {
      title: 'Top of the range',
      description: `Hit ${maxReps} reps on ${exerciseName}. Ready for more weight next session!`,
      tag: 'Add weight next time',
    };
  }

  if (currentWeightKg >= previousBestWeightKg && currentReps > previousBestReps) {
    const repDelta = currentReps - previousBestReps;
    return {
      title: 'Rep PR',
      description: `Added +${repDelta} rep${repDelta > 1 ? 's' : ''} on ${exerciseName} (${currentWeightKg} kg × ${currentReps})!`,
      tag: 'Rep PR',
    };
  }

  return null;
}

/** Moving up a strength standard tier (Untrained → Elite) or sub-division (I → IV). */
export function evaluateStrengthStandardAdvance(
  pillar: StrengthPillar,
  oldTier: StrengthTier,
  oldSubDiv: SubDivision,
  newTier: StrengthTier,
  newSubDiv: SubDivision
): Milestone | null {
  const TIER_ORDER: Record<StrengthTier, number> = { Untrained: 0, Novice: 1, Intermediate: 2, Advanced: 3, Elite: 4 };
  const SUBDIV_ORDER: Record<SubDivision, number> = { I: 0, II: 1, III: 2, IV: 3 };
  const oldTotal = TIER_ORDER[oldTier] * 4 + SUBDIV_ORDER[oldSubDiv];
  const newTotal = TIER_ORDER[newTier] * 4 + SUBDIV_ORDER[newSubDiv];
  if (newTotal <= oldTotal) return null;

  if (TIER_ORDER[newTier] > TIER_ORDER[oldTier]) {
    return { title: `${newTier} ${pillar}`, description: `You moved up to ${newTier} in ${pillar}!`, tag: `${newTier}` };
  }
  return {
    title: 'Strength level up',
    description: `You moved up to ${pillar} ${newTier} ${newSubDiv}!`,
    tag: `${newTier} ${newSubDiv}`,
  };
}
