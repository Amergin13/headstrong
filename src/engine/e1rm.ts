import { EquipmentType } from './types';

/** Above this many reps from failure, rep-max equations stop being reliable. */
export const MAX_E1RM_REPS_FROM_FAILURE = 15;

export const EQUIPMENT_MULTIPLIERS = {
  DUMBBELL: 1.18, // 1.18x combined dumbbell weight (stabilizer & bilateral deficit)
  RDL: 1.20,      // 1.20x vs Conventional Deadlift standard
};

/**
 * Biomechanical Bodyweight Load Fractions (percentage of body mass supported/lifted):
 * Based on published exercise biomechanics (Ebben et al., 2011; Suprak et al., 2011; Vigotsky et al., 2019):
 * - Push-Up (standard): ~64% BW
 * - Feet-Elevated Deficit Push-Up: ~74% BW
 * - Incline Push-Up (hands elevated): ~45% BW
 * - Diamond Push-Up: ~68% BW
 * - Pike Push-Up / Elevated Pike: ~65–75% BW
 * - Inverted Table / Bar Row: ~60% BW
 * - Pull-Up / Chin-Up: ~100% BW
 * - Bulgarian Split Squat (single working leg): ~85% BW
 * - Bodyweight Squat (bilateral): ~65% BW
 * - Single-Leg RDL / Hip Hinge: ~80% BW
 * - Single-Leg Calf Raise: ~100% BW
 */
export const BODYWEIGHT_LOAD_RATIOS: Record<string, number> = {
  // Push / Horizontal Chest
  'ex-deficit-pushup': 0.74,
  'ex-pushup': 0.64,
  'ex-incline-pushup': 0.45,
  'ex-diamond-pushup': 0.68,
  'ex-trx-pushup': 0.60,
  // Overhead / Vertical Push
  'ex-pike-pushup': 0.65,
  'ex-elevated-pike-pushup': 0.75,
  'ex-handstand-pushup': 0.85,
  // Rows / Horizontal Pull
  'ex-inverted-row': 0.60,
  'ex-table-inverted-row': 0.60,
  'ex-doorframe-row': 0.45,
  'ex-trx-row': 0.55,
  // Vertical Pull
  'ex-pullup': 1.00,
  'ex-chinup': 1.00,
  'ex-weighted-pullup': 1.00,
  'ex-sliding-lat-pulldown': 0.45,
  // Squat / Quads
  'ex-bw-squat': 0.65,
  'ex-bulgarian-split-squat': 0.85,
  'ex-pistol-squat': 0.90,
  'ex-trx-single-leg-squat': 0.75,
  'ex-walking-lunge': 0.75,
  // Hinge / Hamstrings & Glutes
  'ex-single-leg-rdl-bw': 0.80,
  'ex-glute-bridge-bw': 0.45,
  'ex-single-leg-glute-bridge': 0.75,
  'ex-sliding-hamstring-curl': 0.50,
  // Calves
  'ex-single-leg-calf-raise': 1.00,
};

export function getBodyweightLoadRatio(exerciseId?: string, pillar?: string): number {
  if (exerciseId && BODYWEIGHT_LOAD_RATIOS[exerciseId]) {
    return BODYWEIGHT_LOAD_RATIOS[exerciseId];
  }
  const id = (exerciseId || '').toLowerCase();
  if (id.includes('deficit') && id.includes('pushup')) return 0.74;
  if (id.includes('incline') && id.includes('pushup')) return 0.45;
  if (id.includes('diamond') && id.includes('pushup')) return 0.68;
  if (id.includes('pushup')) return 0.64;
  if (id.includes('handstand')) return 0.85;
  if (id.includes('pike')) return 0.72;
  if (id.includes('inverted-row') || id.includes('table')) return 0.60;
  if (id.includes('doorframe') || id.includes('towel')) return 0.45;
  if (id.includes('sliding') && id.includes('lat')) return 0.45;
  if (id.includes('pullup') || id.includes('chinup')) return 1.00;
  if (id.includes('bulgarian') || id.includes('split-squat')) return 0.85;
  if (id.includes('pistol') || id.includes('single-leg-squat')) return 0.90;
  if (id.includes('lunge')) return 0.75;
  if (id.includes('squat')) return 0.65;
  if (id.includes('rdl') || id.includes('hinge')) return 0.80;
  if (id.includes('bridge')) return 0.50;
  if (id.includes('calf')) return 1.00;
  if (id.includes('trx')) return 0.65;

  if (pillar === 'Vertical Pull') return 1.00;
  if (pillar === 'Horizontal Push') return 0.64;
  if (pillar === 'Vertical Push') return 0.70;
  if (pillar === 'Horizontal Pull') return 0.60;
  if (pillar === 'Squat') return 0.75;
  if (pillar === 'Hinge') return 0.75;

  return 0.65;
}

/**
 * Calculates effective canonical load normalized for barbell strength standards:
 * - Weighted calisthenics: Weight = (7Day_EMA_Bodyweight * BW_Ratio) + External_Load
 * - Pure bodyweight: Weight = (7Day_EMA_Bodyweight * BW_Ratio) + External_Load
 * - Dumbbells: Weight = Combined_Dumbbell_Weight * 1.18
 * - RDLs: Weight = RDL_Weight * 1.20
 */
export function calculateEffectiveLoad(
  externalWeightKg: number,
  equipment: EquipmentType,
  isRdl?: boolean,
  isWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80,
  exerciseId?: string,
  pillar?: string
): number {
  let effectiveLoad = externalWeightKg;

  if (isWeightedCalisthenic || equipment === 'weighted_bodyweight') {
    // Weighted calisthenics (e.g. Weighted Pull-Up) uses full bodyweight or specific ratio + plate load
    const ratio = getBodyweightLoadRatio(exerciseId, pillar || (equipment === 'weighted_bodyweight' ? 'Vertical Pull' : undefined));
    effectiveLoad = bodyweightEmaKg * ratio + Math.max(0, externalWeightKg);
  } else if (equipment === 'bodyweight') {
    // Pure bodyweight movements load a specific biomechanical fraction of bodyweight
    const ratio = getBodyweightLoadRatio(exerciseId, pillar);
    effectiveLoad = bodyweightEmaKg * ratio + Math.max(0, externalWeightKg);
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
 * Pure bodyweight exercises ALWAYS return 0 external load.
 */
export function convertEffectiveToExternalLoad(
  effectiveLoadKg: number,
  targetEquipment: EquipmentType,
  targetIsRdl?: boolean,
  targetIsWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80,
  targetExerciseId?: string,
  targetPillar?: string
): number {
  // Pure bodyweight exercises (bodyweight squats, push-ups, lunges, travel exercises) have ZERO external load
  if (targetEquipment === 'bodyweight' && !targetIsWeightedCalisthenic) {
    return 0;
  }

  let rawExternal = effectiveLoadKg;

  if (targetIsRdl) {
    rawExternal /= EQUIPMENT_MULTIPLIERS.RDL;
  }

  if (targetEquipment === 'dumbbell') {
    rawExternal /= EQUIPMENT_MULTIPLIERS.DUMBBELL;
    // Round to nearest 2kg combined (1kg per hand)
    return Math.max(4, Math.round(rawExternal / 2) * 2);
  }

  // Weighted calisthenics (e.g. weighted pull-up with dip belt)
  if (targetIsWeightedCalisthenic || targetEquipment === 'weighted_bodyweight') {
    const ratio = getBodyweightLoadRatio(targetExerciseId, targetPillar || 'Vertical Pull');
    rawExternal = Math.max(0, rawExternal - (bodyweightEmaKg * ratio));
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
    exerciseId?: string;
    pillar?: string;
  },
  targetMeta: {
    equipment: EquipmentType;
    isRdl?: boolean;
    isWeightedCalisthenic?: boolean;
    exerciseId?: string;
    pillar?: string;
  },
  bodyweightEmaKg: number = 80
): number {
  if (targetMeta.equipment === 'bodyweight' && !targetMeta.isWeightedCalisthenic) {
    return 0;
  }

  const canonicalLoad = calculateEffectiveLoad(
    sourceWeightKg,
    sourceMeta.equipment,
    sourceMeta.isRdl,
    sourceMeta.isWeightedCalisthenic,
    bodyweightEmaKg,
    sourceMeta.exerciseId,
    sourceMeta.pillar
  );

  return convertEffectiveToExternalLoad(
    canonicalLoad,
    targetMeta.equipment,
    targetMeta.isRdl,
    targetMeta.isWeightedCalisthenic,
    bodyweightEmaKg,
    targetMeta.exerciseId,
    targetMeta.pillar
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
  if (equipment === 'bodyweight' && (!isWeightedCalisthenic || externalWeightKg === 0)) {
    return 'Bodyweight';
  }
  if (isWeightedCalisthenic || equipment === 'weighted_bodyweight') {
    return externalWeightKg > 0 ? `BW + ${externalWeightKg}kg` : 'Bodyweight';
  }
  return `${externalWeightKg}kg`;
}

export interface HypertrophyBodyweightPrescription {
  targetReps: number;
  effectiveBwLoadKg: number;
  bwLoadRatio: number;
  tempoCue?: string;
  isHighEnduranceCap: boolean;
  explanation: string;
}

/**
 * Calculates the exact hypertrophy-effective bodyweight reps based on:
 * 1. The lifter's existing strength profile (Canonical Pillar E1RM)
 * 2. 7-Day EMA bodyweight
 * 3. The exercise's biomechanical load fraction (e.g. 64% BW for pushup, 85% for split squat)
 * 4. Target 1–2 RIR threshold for muscle hypertrophy
 */
export function calculateHypertrophyBodyweightReps(
  pillarE1rmKg: number,
  bodyweightEmaKg: number = 80,
  exerciseId?: string,
  pillar?: string,
  minReps: number = 8,
  maxReps: number = 20,
  targetRir: number = 2
): HypertrophyBodyweightPrescription {
  const bwLoadRatio = getBodyweightLoadRatio(exerciseId, pillar);
  const effectiveBwLoadKg = Math.round(bodyweightEmaKg * bwLoadRatio * 10) / 10;

  if (pillarE1rmKg <= 0 || effectiveBwLoadKg <= 0) {
    return {
      targetReps: minReps,
      effectiveBwLoadKg,
      bwLoadRatio,
      isHighEnduranceCap: false,
      explanation: `Targeting standard baseline hypertrophy rep range (${minReps}–${maxReps} reps).`,
    };
  }

  // E1RM = W_eff * (1 + (Reps + RIR)/30)
  // Reps = 30 * (E1RM / W_eff - 1) - RIR
  const rawReps = 30 * (pillarE1rmKg / effectiveBwLoadKg - 1) - targetRir;
  const roundedReps = Math.round(rawReps);

  let targetReps: number;
  let tempoCue: string | undefined;
  let isHighEnduranceCap = false;
  let explanation: string;

  if (roundedReps > 30) {
    // Advanced lifter: performing >30 reps causes endurance/cardiovascular limitation.
    // Cap target reps at 25-30 and prescribe high-tension tempo & paused stretch!
    targetReps = Math.min(30, Math.max(20, maxReps));
    isHighEnduranceCap = true;
    tempoCue = '3s eccentric + 2s paused stretch in the bottom';
    explanation = `Your high strength profile (${Math.round(pillarE1rmKg)} kg E1RM) exceeds standard bodyweight load (≈${effectiveBwLoadKg} kg, ${Math.round(bwLoadRatio * 100)}% BW). To drive maximum hypertrophy without endurance fatigue, target ${targetReps} reps with a 3-second eccentric tempo and 2-second paused stretch.`;
  } else if (roundedReps >= minReps) {
    targetReps = roundedReps;
    if (targetReps >= 18) {
      tempoCue = '3s controlled eccentric';
    }
    explanation = `Calibrated to your ${Math.round(pillarE1rmKg)} kg strength standard and ${bodyweightEmaKg} kg bodyweight (≈${effectiveBwLoadKg} kg effective load). Target ${targetReps} reps to reach the 1–2 RIR hypertrophy threshold.`;
  } else {
    // Bodyweight movement provides heavy mechanical tension (e.g. pullups for untrained)
    targetReps = minReps;
    explanation = `This bodyweight movement provides heavy mechanical tension (≈${effectiveBwLoadKg} kg load vs ${Math.round(pillarE1rmKg)} kg E1RM). Focus on clean form for ${minReps} reps at 1–2 RIR.`;
  }

  return {
    targetReps,
    effectiveBwLoadKg,
    bwLoadRatio,
    tempoCue,
    isHighEnduranceCap,
    explanation,
  };
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
  bodyweightEmaKg: number = 80,
  exerciseId?: string,
  pillar?: string
): number {
  if (reps <= 0) return 0;

  const effectiveWeight = calculateEffectiveLoad(
    externalWeightKg,
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg,
    exerciseId,
    pillar
  );

  // Epley drifts high beyond ~15 reps from failure, so cap the rep term for estimation only.
  const repsFromFailure = Math.min(reps + rir, MAX_E1RM_REPS_FROM_FAILURE);
  const e1rm = effectiveWeight * (1 + repsFromFailure / 30);
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
