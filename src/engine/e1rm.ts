import { EquipmentType, WorkoutSession } from './types';

/** Above this many reps from failure, rep-max equations stop being reliable. */
export const MAX_E1RM_REPS_FROM_FAILURE = 15;

/**
 * Cap logged RIR at 6 ("6+" in UI) because human rep-in-reserve perception loses precision
 * beyond ~5–6 reps from failure (Halperin et al., 2022; Robinson et al., 2024).
 */
export const MAX_LOGGABLE_RIR = 6;

/** Population-average Epley strength-endurance denominator (30). */
export const DEFAULT_EPLEY_DENOMINATOR = 30;

/**
 * Sets logged further than 3 reps from failure are excluded from E1RM calculation
 * (Halperin et al., 2022: lifters mispredict reps to failure by ~0.95 reps SD 1.45,
 * with error rising sharply further from failure and above 12 reps).
 */
export const MAX_E1RM_RIR = 3;

/** Above 12 reps, RIR prediction error rises sharply (Halperin et al., 2022), so RIR credit is dampened. */
export const HIGH_REP_RIR_DAMPEN_THRESHOLD = 12;

/** True when a logged set is close enough to failure (<= 3 RIR) to yield a valid E1RM estimate. */
export function isE1rmEligibleSet(reps: number, rir: number = 0): boolean {
  return reps > 0 && rir <= MAX_E1RM_RIR;
}

/** True for counterweight-assisted calisthenics (e.g. Assisted Chin-Up / Assisted Dip) where lower counterweight = heavier load. */
export function isAssistedExercise(ex: {
  isAssisted?: boolean;
  exerciseId?: string;
  id?: string;
  name?: string;
}): boolean {
  if (ex.isAssisted) return true;
  const s = `${ex.exerciseId || ex.id || ''} ${ex.name || ''}`.toLowerCase();
  return /(assisted.*(chin|pull|dip)|(chin|pull|dip).*assisted)/.test(s);
}

export const EQUIPMENT_MULTIPLIERS = {
  DUMBBELL: 1.18, // 1.18x combined dumbbell weight (stabilizer & bilateral deficit)
  RDL: 1.20,      // 1.20x vs Conventional Deadlift standard
};

/**
 * Load on a single-arm or single-leg variation compared with the two-sided lift of the same
 * movement. One side does the work, so it starts from half. This is a conservative starting
 * approximation, not a published ratio (no study found gives a split squat to back squat conversion);
 * the athlete's first logged sets replace it. It only converts starting weights: estimated maxes
 * and strength levels never use it.
 */
export const UNILATERAL_LOAD_FRACTION = 0.5;

/** Single-arm or single-leg exercises, where each side works on its own. */
export function isUnilateralExercise(ex: { exerciseId?: string; name?: string }): boolean {
  const s = `${ex.exerciseId || ''} ${ex.name || ''}`.toLowerCase();
  return /(single[- ]?(arm|leg)|one[- ]arm|1[- ]arm|\bsa[- ]|split[- ]squat|bulgarian|lunge|pistol|step[- ]?up|unilateral|copenhagen|suitcase)/.test(s);
}

/** Moves done holding one dumbbell, so the weight logged on the dumbbell IS the total external load moved. */
export function usesOneDumbbell(ex: { exerciseId?: string; id?: string; name?: string }): boolean {
  const id = (ex.exerciseId || ex.id || '').toLowerCase();
  const s = `${id} ${(ex.name || '').toLowerCase()}`;
  if (/(two[- ]?(arm|hand|dumbbell)|bilateral|paired)/.test(s)) return false;
  return (
    id === 'ex-db-hip-thrust' ||
    id === 'ex-gymball-crunch' ||
    id === 'ex-db-calf-raise' ||
    id === 'ex-overhead-db-extension' ||
    /(goblet|pullover|single[- ]?arm|one[- ]?arm|1[- ]arm|suitcase|db[- ]leg[- ]curl|lying leg curl|hip thrust|gym ?ball crunch|step calf raise|overhead.*tricep)/.test(
      s
    )
  );
}

/** True when a dumbbell movement holds a pair of dumbbells (one in each hand), so logged weight is per dumbbell. */
export function usesTwoDumbbells(ex: {
  equipment?: EquipmentType;
  exerciseId?: string;
  id?: string;
  name?: string;
}): boolean {
  if (ex.equipment && ex.equipment !== 'dumbbell') return false;
  return !usesOneDumbbell(ex);
}

/** 2 for paired two-dumbbell lifts (logged per dumbbell), 1 otherwise. */
export function getDumbbellCount(ex: {
  equipment?: EquipmentType;
  exerciseId?: string;
  id?: string;
  name?: string;
}): 1 | 2 {
  return ex.equipment === 'dumbbell' && !usesOneDumbbell(ex) ? 2 : 1;
}

/** Converts logged set weight (per DB for paired DB exercises, full load otherwise) into total external mass moved. */
export function toCombinedExternalLoadKg(
  loggedWeightKg: number,
  ex: { equipment?: EquipmentType; exerciseId?: string; id?: string; name?: string }
): number {
  return loggedWeightKg * getDumbbellCount(ex);
}

/**
 * Bilateral single-dumbbell exercises constrained by rack/balance/leverage (~0.5× bilateral bar/cable load),
 * unlike two-arm single-DB tricep extension which matches full combined tricep load.
 */
function isLeverageLimitedSingleDumbbell(ex: { exerciseId?: string; id?: string; name?: string }): boolean {
  if (!usesOneDumbbell(ex) || isUnilateralExercise(ex)) return false;
  const id = (ex.exerciseId || ex.id || '').toLowerCase();
  const s = `${id} ${(ex.name || '').toLowerCase()}`;
  return /(goblet|pullover|hip thrust|db[- ]leg[- ]curl|lying leg curl|gym ?ball crunch)/.test(s);
}

/** True when an exercise is tracked by time (seconds/minutes held) rather than repetition count. */
export function isTimedExercise(ex: {
  isTimed?: boolean;
  durationSeconds?: number;
  durationMinutesRange?: [number, number];
  repTargetType?: string;
  exerciseId?: string;
  id?: string;
}): boolean {
  const id = (ex.exerciseId || ex.id || '').toLowerCase();
  return Boolean(
    ex.isTimed ||
      (ex.durationSeconds !== undefined && ex.durationSeconds > 0) ||
      ex.durationMinutesRange ||
      ex.repTargetType === 'duration' ||
      id === 'ex-decline-gymball-plank' ||
      id === 'ex-forearm-plank' ||
      id === 'ex-side-plank' ||
      id === 'ex-dead-hang' ||
      id === 'ex-wall-sit' ||
      id === 'ex-farmers-walk' ||
      id === 'ex-suitcase-carry' ||
      id === 'ex-hiit-sprints'
  );
}

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
  'ex-wide-pushup': 0.64,
  'ex-incline-pushup': 0.45,
  'ex-diamond-pushup': 0.68,
  'ex-trx-pushup': 0.60,
  'ex-ring-pressup': 0.68,
  'ex-triceps-dip': 1.00,
  'ex-dip': 1.00,
  'ex-weighted-dip': 1.00,
  'ex-bw-tricep-extension': 0.45,
  'ex-trx-tricep-extension': 0.55,
  // Overhead / Vertical Push
  'ex-pike-pushup': 0.65,
  'ex-dolphin-pushup': 0.68,
  'ex-elevated-pike-pushup': 0.75,
  'ex-handstand-pushup': 0.85,
  // Rows / Horizontal Pull
  'ex-inverted-row': 0.60,
  'ex-bodyweight-inverted-row': 0.60,
  'ex-table-inverted-row': 0.60,
  'ex-doorframe-row': 0.45,
  'ex-trx-row': 0.55,
  'ex-trx-inverted-row': 0.55,
  // Vertical Pull
  'ex-pullup': 1.00,
  'ex-chinup': 1.00,
  'ex-hammer-chinup': 1.00,
  'ex-weighted-pullup': 1.00,
  'ex-sliding-lat-pulldown': 0.45,
  'ex-sliding-floor-pulldown': 0.45,
  'ex-doorway-lat-pull': 0.50,
  // Squat / Quads
  'ex-bw-squat': 0.65,
  'ex-bulgarian-split-squat': 0.85,
  'ex-bw-split-squat': 0.85,
  'ex-pistol-squat': 0.90,
  'ex-trx-single-leg-squat': 0.75,
  'ex-trx-pistol-squat': 0.75,
  'ex-walking-lunge': 0.75,
  'ex-reverse-nordic': 0.55,
  // Hinge / Hamstrings & Glutes
  'ex-single-leg-rdl-bw': 0.80,
  'ex-single-leg-rdl': 0.80,
  'ex-bw-good-morning': 0.45,
  'ex-glute-bridge-bw': 0.45,
  'ex-single-leg-glute-bridge': 0.75,
  'ex-sliding-hamstring-curl': 0.50,
  'ex-sliding-leg-curl': 0.50,
  'ex-trx-hamstring-curl': 0.55,
  'ex-hamstring-walkout': 0.55,
  'ex-nordic-curl': 0.65,
  // Arms / Core / Calves
  'ex-trx-bicep-curl': 0.50,
  'ex-underhand-bar-curl': 0.70,
  'ex-single-leg-calf-raise': 1.00,
  'ex-bw-single-leg-calf': 1.00,
  'ex-slow-calf-raise': 1.00,
  'ex-dead-hang': 1.00,
  'ex-wall-sit': 0.55,
  'ex-decline-gymball-plank': 0,
  'ex-forearm-plank': 0,
  'ex-side-plank': 0,
  'ex-hiit-sprints': 0,
  'ex-band-leg-curl': 0,
  'ex-band-lat-pulldown': 0,
  'ex-band-seated-row': 0,
  'ex-band-pull-apart': 0,
};

export function getBodyweightLoadRatio(exerciseId?: string, pillar?: string): number {
  if (exerciseId && exerciseId in BODYWEIGHT_LOAD_RATIOS) {
    return BODYWEIGHT_LOAD_RATIOS[exerciseId];
  }
  const id = (exerciseId || '').toLowerCase();
  if (id.includes('deficit') && id.includes('pushup')) return 0.74;
  if (id.includes('incline') && id.includes('pushup')) return 0.45;
  if (id.includes('diamond') && id.includes('pushup')) return 0.68;
  if (id.includes('pushup') || id.includes('pressup')) return 0.64;
  if (id.includes('handstand')) return 0.85;
  if (id.includes('pike')) return 0.72;
  if (id.includes('inverted-row') || id.includes('table')) return 0.60;
  if (id.includes('doorframe') || id.includes('towel')) return 0.45;
  if (id.includes('sliding') && id.includes('lat')) return 0.45;
  if (id.includes('pullup') || id.includes('chinup') || id.includes('dip') || id.includes('dead-hang')) return 1.00;
  if (id.includes('bulgarian') || id.includes('split-squat')) return 0.85;
  if (id.includes('pistol') || id.includes('single-leg-squat')) return 0.90;
  if (id.includes('lunge')) return 0.75;
  if (id.includes('squat')) return 0.65;
  if (id.includes('rdl') || id.includes('hinge')) return 0.80;
  if (id.includes('nordic')) return 0.60;
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
 * Portion of the athlete's own bodyweight moved on a bodyweight/calisthenic movement.
 * Returns 0 when bodyweight hasn't been logged yet (never invents an 80 kg figure).
 */
export function getEffectiveBodyweightLoadKg(
  bodyweightKg: number | undefined,
  exerciseId?: string,
  pillar?: string
): number {
  if (!bodyweightKg || bodyweightKg <= 0) return 0;
  return Math.round(bodyweightKg * getBodyweightLoadRatio(exerciseId, pillar) * 10) / 10;
}

/**
 * Calculates effective canonical load normalized for barbell strength standards:
 * - Weighted calisthenics: Weight = (7Day_EMA_Bodyweight * BW_Ratio) + External_Load
 * - Pure bodyweight: Weight = (7Day_EMA_Bodyweight * BW_Ratio) + External_Load
 * - Dumbbells: Paired two-DB moves store per-DB weight so Combined_Dumbbell_Weight = External * 2;
 *   Single-DB moves use External * 1. Then Effective = Combined_Dumbbell_Weight * 1.18
 * - RDLs: Weight = RDL_Weight * 1.20
 */
export function calculateEffectiveLoad(
  externalWeightKg: number,
  equipment: EquipmentType,
  isRdl?: boolean,
  isWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80,
  exerciseId?: string,
  pillar?: string,
  exerciseName?: string
): number {
  let effectiveLoad = Math.max(0, externalWeightKg);

  if (isAssistedExercise({ exerciseId, name: exerciseName })) {
    // Counterweight-assisted calisthenics (e.g. Assisted Chin-Up): effective load is BW - counterweight.
    const ratio = getBodyweightLoadRatio(exerciseId, pillar || 'Vertical Pull');
    effectiveLoad = Math.max(5, bodyweightEmaKg * ratio - Math.max(0, externalWeightKg));
  } else if (isWeightedCalisthenic || equipment === 'weighted_bodyweight') {
    // Weighted calisthenics (e.g. Weighted Pull-Up) uses full bodyweight or specific ratio + plate load
    const ratio = getBodyweightLoadRatio(exerciseId, pillar || (equipment === 'weighted_bodyweight' ? 'Vertical Pull' : undefined));
    effectiveLoad = bodyweightEmaKg * ratio + Math.max(0, externalWeightKg);
  } else if (equipment === 'bodyweight') {
    // Pure bodyweight movements load a specific biomechanical fraction of bodyweight
    const ratio = getBodyweightLoadRatio(exerciseId, pillar);
    effectiveLoad = bodyweightEmaKg * ratio + Math.max(0, externalWeightKg);
  }

  if (equipment === 'dumbbell') {
    effectiveLoad = toCombinedExternalLoadKg(effectiveLoad, { equipment, exerciseId, name: exerciseName }) * EQUIPMENT_MULTIPLIERS.DUMBBELL;
  }

  if (isRdl) {
    effectiveLoad *= EQUIPMENT_MULTIPLIERS.RDL;
  }

  return effectiveLoad;
}

/**
 * Inverse of calculateEffectiveLoad:
 * Converts a Canonical Barbell-Equivalent Load into the logged external load
 * required on any target implement (Barbell, per-DB weight for paired Dumbbell moves,
 * single-DB weight for one-DB moves, RDL, Weighted Calisthenics).
 * Pure bodyweight exercises ALWAYS return 0 external load.
 */
export function convertEffectiveToExternalLoad(
  effectiveLoadKg: number,
  targetEquipment: EquipmentType,
  targetIsRdl?: boolean,
  targetIsWeightedCalisthenic?: boolean,
  bodyweightEmaKg: number = 80,
  targetExerciseId?: string,
  targetPillar?: string,
  targetExerciseName?: string
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
    const pairCount = getDumbbellCount({
      equipment: 'dumbbell',
      exerciseId: targetExerciseId,
      name: targetExerciseName,
    });
    const perDumbbellKg = rawExternal / pairCount;
    // Standard 1 kg per dumbbell step (minimum 2 kg per dumbbell)
    return Math.max(2, Math.round(perDumbbellKg));
  }

  // Counterweight-assisted calisthenics (e.g. Assisted Chin-Up): assistance = BW - effectiveLoad
  if (isAssistedExercise({ exerciseId: targetExerciseId, name: targetExerciseName })) {
    const ratio = getBodyweightLoadRatio(targetExerciseId, targetPillar || 'Vertical Pull');
    rawExternal = Math.max(0, bodyweightEmaKg * ratio - effectiveLoadKg);
    return Math.round(rawExternal / 2.5) * 2.5;
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
 * Two-dumbbell moves accept & return weight per dumbbell (e.g. 90 kg Barbell -> 38 kg per DB).
 */
export function translateWeightBetweenImplements(
  sourceWeightKg: number,
  sourceMeta: {
    equipment: EquipmentType;
    isRdl?: boolean;
    isWeightedCalisthenic?: boolean;
    exerciseId?: string;
    name?: string;
    pillar?: string;
  },
  targetMeta: {
    equipment: EquipmentType;
    isRdl?: boolean;
    isWeightedCalisthenic?: boolean;
    exerciseId?: string;
    name?: string;
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
    sourceMeta.pillar,
    sourceMeta.name
  );

  const sourceUnilateral = isUnilateralExercise(sourceMeta);
  const targetUnilateral = isUnilateralExercise(targetMeta);
  const sourceLimitedSingle = sourceMeta.equipment === 'dumbbell' && isLeverageLimitedSingleDumbbell(sourceMeta);
  const targetLimitedSingle = targetMeta.equipment === 'dumbbell' && isLeverageLimitedSingleDumbbell(targetMeta);
  const oneDumbbellFactor =
    targetLimitedSingle && !sourceLimitedSingle
      ? 0.5
      : sourceLimitedSingle && !targetLimitedSingle
      ? 2
      : 1;
  const sideFactor =
    targetUnilateral && !sourceUnilateral
      ? UNILATERAL_LOAD_FRACTION
      : sourceUnilateral && !targetUnilateral
      ? 1 / UNILATERAL_LOAD_FRACTION
      : 1;

  return convertEffectiveToExternalLoad(
    canonicalLoad * sideFactor * oneDumbbellFactor,
    targetMeta.equipment,
    targetMeta.isRdl,
    targetMeta.isWeightedCalisthenic,
    bodyweightEmaKg,
    targetMeta.exerciseId,
    targetMeta.pillar,
    targetMeta.name
  );
}

/**
 * Formats an implement load for clear gym-floor ergonomics:
 * Two-dumbbell lifts store per-hand weight and show e.g. "24kg/DB (48kg total)";
 * single-dumbbell lifts show e.g. "24kg".
 */
export function formatImplementWeightLabel(
  externalWeightKg: number,
  equipment: EquipmentType,
  isWeightedCalisthenic?: boolean,
  exerciseMeta?: { exerciseId?: string; id?: string; name?: string }
): string {
  if (equipment === 'dumbbell') {
    if (exerciseMeta && usesOneDumbbell(exerciseMeta)) {
      return `${externalWeightKg}kg`;
    }
    const combined = Math.round(externalWeightKg * 2 * 10) / 10;
    return `${externalWeightKg}kg/DB (${combined}kg total)`;
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
 * Formula: E1RM = Weight * (1 + (Reps + EffectiveRIR) / 30)
 *
 * Restricted to sets logged at <= 3 RIR (returns 0 above 3 RIR), with RIR credit dampened
 * above 12 reps to avoid high-rep E1RM inflation (Halperin et al., 2022).
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
  pillar?: string,
  exerciseName?: string
): number {
  if (!isE1rmEligibleSet(reps, rir)) return 0;

  const effectiveWeight = calculateEffectiveLoad(
    externalWeightKg,
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg,
    exerciseId,
    pillar,
    exerciseName
  );

  // Dampen RIR credit above 12 reps where RIR prediction error rises sharply (Halperin et al., 2022),
  // and cap total reps-from-failure at MAX_E1RM_REPS_FROM_FAILURE so Epley never drifts high.
  const clampedRir = Math.max(0, rir);
  const effectiveRir = reps > HIGH_REP_RIR_DAMPEN_THRESHOLD ? clampedRir * 0.5 : clampedRir;
  const repsFromFailure = Math.min(reps + effectiveRir, MAX_E1RM_REPS_FROM_FAILURE);
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
  bodyweightEmaKg: number = 80,
  exerciseId?: string,
  pillar?: string,
  exerciseName?: string
): number {
  const effectiveWeight = calculateEffectiveLoad(
    externalWeightKg,
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg,
    exerciseId,
    pillar,
    exerciseName
  );

  if (targetE1rmKg <= 0 || effectiveWeight <= 0) return 1;
  if (effectiveWeight >= targetE1rmKg) return 1;

  const safeRir = Math.max(0, targetRir);
  const rawReps = 30 * (targetE1rmKg / effectiveWeight - 1) - safeRir;
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
  bodyweightEmaKg: number = 80,
  exerciseId?: string,
  pillar?: string,
  exerciseName?: string
): number {
  if (targetE1rmKg <= 0 || targetReps <= 0) return 0;
  const repsFromFailure = Math.min(targetReps + Math.max(0, targetRir), MAX_E1RM_REPS_FROM_FAILURE);
  const divisor = 1 + repsFromFailure / 30;
  const effectiveRequired = targetE1rmKg / divisor;

  return convertEffectiveToExternalLoad(
    effectiveRequired,
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg,
    exerciseId,
    pillar,
    exerciseName
  );
}

/**
 * Solves the external weight required on a target implement to preserve a canonical E1RM
 * stimulus at a new (targetReps, targetRir) prescription, accounting for unilateral and
 * single-dumbbell vs paired-dumbbell loading differences.
 */
export function solveTargetWeightForE1RM(
  targetE1rmKg: number,
  targetReps: number,
  targetRir: number,
  sourceMeta: { exerciseId?: string; id?: string; name?: string; equipment: EquipmentType },
  targetMeta: {
    exerciseId?: string;
    id?: string;
    name?: string;
    equipment: EquipmentType;
    isRdl?: boolean;
    isWeightedCalisthenic?: boolean;
    pillar?: string;
  },
  bodyweightEmaKg: number = 80
): number {
  if (targetMeta.equipment === 'bodyweight' && !targetMeta.isWeightedCalisthenic) return 0;
  if (targetE1rmKg <= 0 || targetReps <= 0) return 0;

  const sourceUnilateral = isUnilateralExercise(sourceMeta);
  const targetUnilateral = isUnilateralExercise(targetMeta);
  const sourceLimitedSingle = sourceMeta.equipment === 'dumbbell' && isLeverageLimitedSingleDumbbell(sourceMeta);
  const targetLimitedSingle = targetMeta.equipment === 'dumbbell' && isLeverageLimitedSingleDumbbell(targetMeta);
  const oneDumbbellFactor =
    targetLimitedSingle && !sourceLimitedSingle
      ? 0.5
      : sourceLimitedSingle && !targetLimitedSingle
      ? 2
      : 1;
  const sideFactor =
    targetUnilateral && !sourceUnilateral
      ? UNILATERAL_LOAD_FRACTION
      : sourceUnilateral && !targetUnilateral
      ? 1 / UNILATERAL_LOAD_FRACTION
      : 1;

  const repsFromFailure = Math.min(targetReps + Math.max(0, targetRir), MAX_E1RM_REPS_FROM_FAILURE);
  const divisor = 1 + repsFromFailure / 30;
  const effectiveRequired = (targetE1rmKg * sideFactor * oneDumbbellFactor) / divisor;

  return convertEffectiveToExternalLoad(
    effectiveRequired,
    targetMeta.equipment,
    targetMeta.isRdl,
    targetMeta.isWeightedCalisthenic,
    bodyweightEmaKg,
    targetMeta.exerciseId || targetMeta.id,
    targetMeta.pillar,
    targetMeta.name
  );
}

export interface ExerciseEnduranceSlope {
  /** Personalized Epley denominator (clamped to [22, 42]; default 30). Higher = better high-rep endurance. */
  denominator: number;
  /** Number of eligible working sessions inspected for this exercise. */
  sampleCount: number;
  /** Number of valid distinct-rep-bracket pairs that informed the slope. */
  pairCount: number;
  /** True once at least 3 eligible sessions spanning >= 3 reps-to-failure yield a personalized estimate. */
  isPersonalized: boolean;
  /** Plain-English endurance curve label for transparent UI / coach display. */
  profile: 'high_endurance' | 'standard' | 'strength_biased';
  explanation: string;
}

/**
 * Learns an athlete's individual strength-endurance slope per exercise from multi-rep-range
 * training history (Nuzzo et al., 2024: individual reps-at-%1RM slopes vary widely across lifts
 * and lifters, e.g. leg press vs. overhead press).
 *
 * Uses exponentially weighted recency pairs across distinct rep brackets (separation >= 3 RTF)
 * with empirical-Bayes shrinkage toward the population Epley denominator (30), clamped safely
 * to [22, 42]. Standard Kilgore E1RM remains deterministic at D = 30; this slope personalizes
 * rep-range transitions and equipment-aware rep-ceiling conversions.
 */
export function learnExerciseEnduranceSlope(
  exerciseId: string,
  workouts: WorkoutSession[]
): ExerciseEnduranceSlope {
  const defaultResult = (sampleCount: number): ExerciseEnduranceSlope => ({
    denominator: DEFAULT_EPLEY_DENOMINATOR,
    sampleCount,
    pairCount: 0,
    isPersonalized: false,
    profile: 'standard',
    explanation: 'Using standard rep-to-load curve until more multi-rep-range history is logged.',
  });

  if (!exerciseId || !workouts || workouts.length === 0) return defaultResult(0);

  const ordered = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (a.completedAt || a.date).localeCompare(b.completedAt || b.date));

  type Sample = { weight: number; rtf: number; sessionIdx: number };
  const samples: Sample[] = [];

  for (const w of ordered) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    let bestInSession: { weight: number; rtf: number; score: number } | null = null;
    for (const s of ex.sets) {
      if (!s.completed || s.isWarmup || s.setType === 'warmup') continue;
      const weight = s.actualWeightKg ?? s.targetWeightKg ?? 0;
      const reps = s.actualReps ?? s.targetReps ?? 0;
      const rawRir = Math.max(0, Math.min(MAX_LOGGABLE_RIR, s.actualRir ?? s.targetRir ?? 2));
      if (weight <= 0 || reps < 1 || reps > 20 || rawRir > MAX_E1RM_RIR) continue;
      const effectiveRir = reps > HIGH_REP_RIR_DAMPEN_THRESHOLD ? rawRir * 0.5 : rawRir;
      const rtf = reps + effectiveRir;
      const score = weight * (1 + rtf / DEFAULT_EPLEY_DENOMINATOR);
      if (!bestInSession || score > bestInSession.score) {
        bestInSession = { weight, rtf, score };
      }
    }
    if (bestInSession) {
      samples.push({ weight: bestInSession.weight, rtf: bestInSession.rtf, sessionIdx: samples.length });
    }
  }

  if (samples.length < 3) return defaultResult(samples.length);

  const rtfs = samples.map((s) => s.rtf);
  if (Math.max(...rtfs) - Math.min(...rtfs) < 3) {
    return defaultResult(samples.length);
  }

  // Evaluate recent cross-rep-bracket pairs (within 10 sessions of each other so long-term strength
  // gain doesn't masquerade as endurance slope).
  const latestIdx = samples.length - 1;
  let weightedSum = 0;
  let totalWeight = 0;
  let pairCount = 0;

  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const a = samples[i];
      const b = samples[j];
      if (b.sessionIdx - a.sessionIdx > 10) continue;
      const heavier = a.weight > b.weight ? a : b;
      const lighter = a.weight > b.weight ? b : a;
      const weightDiff = heavier.weight - lighter.weight;
      const rtfDiff = lighter.rtf - heavier.rtf;
      if (weightDiff <= 0.25 || rtfDiff < 3) continue;

      const rawD = (lighter.weight * lighter.rtf - heavier.weight * heavier.rtf) / weightDiff;
      if (!Number.isFinite(rawD) || rawD < 10 || rawD > 70) continue;

      const clampedPairD = Math.max(18, Math.min(48, rawD));
      const recencyAge = latestIdx - Math.max(a.sessionIdx, b.sessionIdx);
      const recencyWeight = Math.pow(0.85, recencyAge);
      const separationWeight = Math.min(2, rtfDiff / 4);
      const pairWeight = recencyWeight * separationWeight;

      weightedSum += clampedPairD * pairWeight;
      totalWeight += pairWeight;
      pairCount++;
    }
  }

  if (pairCount === 0 || totalWeight <= 0) return defaultResult(samples.length);

  // Empirical-Bayes shrinkage toward standard 30 with prior strength k = 2.0
  const PRIOR_WEIGHT = 2.0;
  const shrunk = (weightedSum + PRIOR_WEIGHT * DEFAULT_EPLEY_DENOMINATOR) / (totalWeight + PRIOR_WEIGHT);
  const denominator = Math.round(Math.max(22, Math.min(42, shrunk)) * 10) / 10;

  const profile: ExerciseEnduranceSlope['profile'] =
    denominator >= 33 ? 'high_endurance' : denominator <= 27 ? 'strength_biased' : 'standard';

  const explanation =
    profile === 'high_endurance'
      ? `Learned higher rep endurance on this lift (slope ${denominator} vs 30 standard) — higher-rep sets hold weight closer to your heavy sets.`
      : profile === 'strength_biased'
      ? `Learned steeper rep drop-off on this lift (slope ${denominator} vs 30 standard) — load adjustments scale more conservatively when reps rise.`
      : `Your rep-to-load curve on this lift tracks close to standard (slope ${denominator}).`;

  return {
    denominator,
    sampleCount: samples.length,
    pairCount,
    isPersonalized: true,
    profile,
    explanation,
  };
}
