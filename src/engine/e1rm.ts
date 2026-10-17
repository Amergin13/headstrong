import { EquipmentType } from './types';

export const EQUIPMENT_MULTIPLIERS = {
  DUMBBELL: 1.18, // 1.18x combined dumbbell weight (stabilizer & bilateral deficit)
  RDL: 1.20,      // 1.20x vs Conventional Deadlift standard
};

/**
 * Calculates effective canonical load normalized for barbell strength standards:
 * - Weighted calisthenics: Weight = 7Day_EMA_Bodyweight + External_Load
 * - Dumbbells: Weight = Combined_Dumbbell_Weight * 1.18
 * - RDLs: Weight = RDL_Weight * 1.20
 */
export function calculateEffectiveLoad(
  externalWeightKg: number,
  equipment: EquipmentType,
  isRdl?: boolean,
  isWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80
): number {
  let effectiveLoad = externalWeightKg;

  if (isWeightedCalisthenic || equipment === 'weighted_bodyweight' || equipment === 'bodyweight') {
    effectiveLoad = bodyweightEmaKg + Math.max(0, externalWeightKg);
  }

  if (equipment === 'dumbbell') {
    effectiveLoad *= EQUIPMENT_MULTIPLIERS.DUMBBELL;
  }

  if (isRdl) {
    effectiveLoad *= EQUIPMENT_MULTIPLIERS.RDL;
  }

  return effectiveLoad;
}

/**
 * Inverse of calculateEffectiveLoad:
 * Converts a Canonical Barbell-Equivalent Load into the exact external load
 * required on any target implement (Barbell, Dumbbell, RDL, Weighted Calisthenics).
 */
export function convertEffectiveToExternalLoad(
  effectiveLoadKg: number,
  targetEquipment: EquipmentType,
  targetIsRdl?: boolean,
  targetIsWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80
): number {
  let rawExternal = effectiveLoadKg;

  if (targetIsRdl) {
    rawExternal /= EQUIPMENT_MULTIPLIERS.RDL;
  }

  if (targetEquipment === 'dumbbell') {
    rawExternal /= EQUIPMENT_MULTIPLIERS.DUMBBELL;
    // Round to nearest 2kg combined (1kg per hand)
    return Math.max(4, Math.round(rawExternal / 2) * 2);
  }

  if (
    targetIsWeightedCalisthenic ||
    targetEquipment === 'weighted_bodyweight' ||
    targetEquipment === 'bodyweight'
  ) {
    rawExternal = Math.max(0, rawExternal - bodyweightEmaKg);
    // Round to nearest 1.25kg plate increment
    return Math.round(rawExternal / 1.25) * 1.25;
  }

  // Standard Barbell / Cable / Machine: round to nearest 2.5kg
  return Math.max(5, Math.round(rawExternal / 2.5) * 2.5);
}

/**
 * Directly translates working weight from one exercise implement to another
 * while preserving 100% Canonical Pillar Mechanical Tension / E1RM equivalence.
 */
export function translateWeightBetweenImplements(
  sourceWeightKg: number,
  sourceMeta: {
    equipment: EquipmentType;
    isRdl?: boolean;
    isWeightedCalisthenic?: boolean;
  },
  targetMeta: {
    equipment: EquipmentType;
    isRdl?: boolean;
    isWeightedCalisthenic?: boolean;
  },
  bodyweightEmaKg: number = 80
): number {
  const canonicalLoad = calculateEffectiveLoad(
    sourceWeightKg,
    sourceMeta.equipment,
    sourceMeta.isRdl,
    sourceMeta.isWeightedCalisthenic,
    bodyweightEmaKg
  );

  return convertEffectiveToExternalLoad(
    canonicalLoad,
    targetMeta.equipment,
    targetMeta.isRdl,
    targetMeta.isWeightedCalisthenic,
    bodyweightEmaKg
  );
}

/**
 * Formats an implement load for clear gym-floor ergonomics
 * (e.g., Dumbbells show both combined & per-hand weight).
 */
export function formatImplementWeightLabel(
  externalWeightKg: number,
  equipment: EquipmentType,
  isWeightedCalisthenic?: boolean
): string {
  if (equipment === 'dumbbell') {
    const perHand = Math.round((externalWeightKg / 2) * 10) / 10;
    return `${externalWeightKg}kg (${perHand}kg/DB)`;
  }
  if (equipment === 'bodyweight' && externalWeightKg === 0) {
    return 'Bodyweight';
  }
  if (isWeightedCalisthenic || equipment === 'weighted_bodyweight' || equipment === 'bodyweight') {
    return `BW + ${externalWeightKg}kg`;
  }
  return `${externalWeightKg}kg`;
}

/**
 * RIR-Adjusted Estimated 1RM (E1RM):
 * Formula: E1RM = Weight * (1 + (Reps + RIR) / 30)
 */
export function calculateE1RM(
  externalWeightKg: number,
  reps: number,
  rir: number = 0,
  equipment: EquipmentType = 'barbell',
  isRdl?: boolean,
  isWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80
): number {
  if (reps <= 0) return 0;

  const effectiveWeight = calculateEffectiveLoad(
    externalWeightKg,
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg
  );

  const e1rm = effectiveWeight * (1 + (reps + rir) / 30);
  return Math.round(e1rm * 10) / 10;
}

/**
 * Calculates exact reps needed at working weight to hit a target E1RM:
 * E1RM = Weight * (1 + (Reps + RIR) / 30)
 * => Reps + RIR = 30 * (E1RM / Weight - 1)
 * => Reps = ceil(30 * (E1RM / Weight - 1) - RIR)
 */
export function calculateRepsNeededForTargetE1RM(
  targetE1rmKg: number,
  externalWeightKg: number,
  targetRir: number = 2,
  equipment: EquipmentType = 'barbell',
  isRdl?: boolean,
  isWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80
): number {
  const effectiveWeight = calculateEffectiveLoad(
    externalWeightKg,
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg
  );

  if (effectiveWeight <= 0) return 1;
  if (effectiveWeight >= targetE1rmKg) return 1;

  const rawReps = 30 * (targetE1rmKg / effectiveWeight - 1) - targetRir;
  return Math.max(1, Math.ceil(rawReps));
}

/**
 * Reverses E1RM to find what external weight is needed for a specific rep target:
 * Weight = E1RM / (1 + (Reps + RIR) / 30)
 */
export function calculateWeightNeededForTargetE1RM(
  targetE1rmKg: number,
  targetReps: number,
  targetRir: number = 2,
  equipment: EquipmentType = 'barbell',
  isRdl?: boolean,
  isWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80
): number {
  const divisor = 1 + (targetReps + targetRir) / 30;
  const effectiveRequired = targetE1rmKg / divisor;

  return convertEffectiveToExternalLoad(
    effectiveRequired,
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg
  );
}
