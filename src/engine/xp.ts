import {
  ReadinessState,
  StrengthPillar,
  StrengthTier,
  SubDivision,
  WorkoutSession,
  WorkoutSet,
} from './types';

export type XpCategory =
  | 'workout_completion'
  | 'program_milestone'
  | 'exercise_progress'
  | 'strength_standard';

export interface XpAward {
  amount: number;
  category: XpCategory;
  title: string;
  description: string;
  bonusTag?: string;
}

/**
 * List of forbidden actions that must NEVER award XP points:
 * - Switching an exercise or browsing alternatives
 * - Switching split day or workout type
 * - Switching training location (gym / home / travel)
 * - Changing mesocycle week via UI dropdown
 * - Shifting workout date / logging rest day
 * - Switching goal phase (Bulk / Cut / Maingain)
 * - Exporting or importing JSON backups
 * - Syncing Google Pixel Watch
 * - Loading demo data
 * - Completing onboarding wizard
 * - Logging daily body weight
 */
export const FORBIDDEN_XP_ACTIONS = [
  'change_exercise',
  'change_split',
  'change_workout_type',
  'change_location',
  'change_mesocycle',
  'shift_workout',
  'change_goal',
  'export_data',
  'import_data',
  'watch_sync',
  'load_demo',
  'onboarding',
  'log_weight',
] as const;

export function isForbiddenXpAction(action: string): boolean {
  return (FORBIDDEN_XP_ACTIONS as readonly string[]).includes(action);
}

/**
 * 1. Completing Workouts:
 * Awards XP strictly when a lifter finishes a full workout session.
 */
export function calculateWorkoutCompletionXp(
  workout: WorkoutSession,
  readinessState: ReadinessState,
  xpMultiplier: number = 1.0
): XpAward {
  const completedWorkingSets = workout.exercises.reduce(
    (acc, ex) =>
      acc +
      ex.sets.filter((s) => s.completed && !s.isWarmup && s.setType !== 'warmup').length,
    0
  );
  const totalWorkingSets = workout.exercises.reduce(
    (acc, ex) =>
      acc + ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length,
    0
  );

  const baseCompletionXp = 250;
  const allSetsCompletedBonus = completedWorkingSets >= totalWorkingSets && totalWorkingSets > 0 ? 50 : 0;
  const rawTotal = baseCompletionXp + allSetsCompletedBonus;
  const finalXp = Math.round(rawTotal * xpMultiplier);

  const bonusTag =
    readinessState === 'Primed'
      ? '+15% Primed Bonus'
      : allSetsCompletedBonus > 0
      ? 'Full Session Complete'
      : 'Workout Complete';

  return {
    amount: finalXp,
    category: 'workout_completion',
    title: 'Workout Completed',
    description: `Finished ${workout.name} (${completedWorkingSets}/${totalWorkingSets} working sets).`,
    bonusTag,
  };
}

/**
 * 2. Completing Programs & Mesocycle Milestones:
 * Awards XP upon completing training program blocks or cycles.
 */
export function calculateProgramMilestoneXp(
  completedWeek: number,
  programName: string = 'Hypertrophy Split'
): XpAward {
  if (completedWeek >= 6) {
    return {
      amount: 500,
      category: 'program_milestone',
      title: 'Mesocycle Cycle Complete',
      description: `Graduated 6-week ${programName} block! Fatigue cleared via Deload.`,
      bonusTag: 'Cycle Graduate',
    };
  }

  return {
    amount: 200,
    category: 'program_milestone',
    title: `Week ${completedWeek} Complete`,
    description: `Completed all scheduled sessions for Mesocycle Week ${completedWeek}.`,
    bonusTag: `Week ${completedWeek} Milestone`,
  };
}

/**
 * 3. Improving Exercise Progress (Progressive Overload):
 * Evaluates whether a logged set represents genuine progressive overload:
 * - Load Breakthrough (+2.5kg / +2kg load increase)
 * - Rep Breakthrough (+1 or more reps at equal/higher load)
 * - Top of Rep Range Hit (qualifying for double progression)
 */
export function evaluateExerciseProgressXp(
  exerciseName: string,
  currentWeightKg: number,
  currentReps: number,
  previousBestWeightKg?: number,
  previousBestReps?: number,
  maxReps: number = 12
): XpAward | null {
  if (!previousBestWeightKg || !previousBestReps) {
    // First time establishing baseline for an exercise: standard effort award
    return null;
  }

  // A. Weight Increase Breakthrough (Load Overload)
  if (currentWeightKg > previousBestWeightKg && currentReps >= 6) {
    const delta = Math.round((currentWeightKg - previousBestWeightKg) * 10) / 10;
    return {
      amount: 60,
      category: 'exercise_progress',
      title: 'Load Breakthrough',
      description: `Lifted +${delta} kg on ${exerciseName} (${currentWeightKg} kg × ${currentReps})!`,
      bonusTag: 'Weight PR',
    };
  }

  // B. Top of Rep Range Achieved (Unlocking Double Progression)
  if (currentReps >= maxReps && previousBestReps < maxReps) {
    return {
      amount: 50,
      category: 'exercise_progress',
      title: 'Progression Earned',
      description: `Hit ${maxReps} reps on ${exerciseName}. Ready for weight progression next session!`,
      bonusTag: 'Overload Unlocked',
    };
  }

  // C. Rep Increase Breakthrough at Equal or Greater Load
  if (currentWeightKg >= previousBestWeightKg && currentReps > previousBestReps) {
    const repDelta = currentReps - previousBestReps;
    return {
      amount: 40,
      category: 'exercise_progress',
      title: 'Rep Breakthrough',
      description: `Added +${repDelta} rep${repDelta > 1 ? 's' : ''} on ${exerciseName} (${currentWeightKg} kg × ${currentReps})!`,
      bonusTag: 'Rep PR',
    };
  }

  return null;
}

/**
 * 4. Improving Strength Standards:
 * Awards significant XP when a lifter advances their official international
 * strength standards tier (Untrained -> Novice -> Intermediate -> Advanced -> Elite)
 * or sub-division (I -> II -> III -> IV).
 */
export function evaluateStrengthStandardAdvanceXp(
  pillar: StrengthPillar,
  oldTier: StrengthTier,
  oldSubDiv: SubDivision,
  newTier: StrengthTier,
  newSubDiv: SubDivision
): XpAward | null {
  const TIER_ORDER: Record<StrengthTier, number> = {
    Untrained: 0,
    Novice: 1,
    Intermediate: 2,
    Advanced: 3,
    Elite: 4,
  };

  const SUBDIV_ORDER: Record<SubDivision, number> = {
    I: 0,
    II: 1,
    III: 2,
    IV: 3,
  };

  const oldTotal = TIER_ORDER[oldTier] * 4 + SUBDIV_ORDER[oldSubDiv];
  const newTotal = TIER_ORDER[newTier] * 4 + SUBDIV_ORDER[newSubDiv];

  if (newTotal <= oldTotal) {
    return null;
  }

  // Major Tier Advancement
  if (TIER_ORDER[newTier] > TIER_ORDER[oldTier]) {
    return {
      amount: 350,
      category: 'strength_standard',
      title: 'Major Tier Breakthrough',
      description: `Ranked up to ${newTier} in ${pillar}!`,
      bonusTag: `${newTier} Athlete`,
    };
  }

  // Sub-Division Advancement
  return {
    amount: 100,
    category: 'strength_standard',
    title: 'Strength Standard Advanced',
    description: `Advanced to ${pillar} ${newTier} ${newSubDiv}!`,
    bonusTag: `${newTier} ${newSubDiv}`,
  };
}
