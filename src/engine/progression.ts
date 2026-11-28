import {
  evaluateRepRangeDoubleProgression,
  hadQualityEffort,
  loadIncrementFor,
} from './progressionRules';
import {
  ExerciseDefinition,
  ExerciseSession,
  HomeEquipmentTag,
  ProgressionPrescription,
  ReadinessState,
  TrainingLocation,
  WorkoutSession,
  GoalPhase,
} from './types';
import {
  calculateE1RM,
  calculateHypertrophyBodyweightReps,
  isAssistedExercise,
  isTimedExercise,
  learnExerciseEnduranceSlope,
  solveTargetWeightForE1RM,
  translateWeightBetweenImplements,
  usesOneDumbbell,
} from './e1rm';
import { formatWeight, snapLoadKg, WeightUnit } from '../utils/units';

const MOVEMENT_FAMILY_LABELS: Record<string, string> = {
  'vector-pillar-horizontal-push': 'Horizontal Chest Press',
  'vector-pillar-vertical-push': 'Overhead Shoulder Press',
  'vector-pillar-horizontal-pull': 'Horizontal Back Row',
  'vector-pillar-vertical-pull': 'Vertical Lats Pull',
  'vector-pillar-squat': 'Squat & Knee Flexion',
  'vector-pillar-hinge': 'Deadlift & Hip Hinge',
  'vector-iso-chest': 'Chest Fly & Adduction',
  'vector-iso-lats': 'Lat Pullover & Straight-Arm Pulldown',
  'vector-iso-glutes': 'Glute & Hip Isolation',
  'vector-iso-sidedelts': 'Side Shoulder Isolation',
  'vector-iso-reardelts': 'Rear Shoulder Isolation',
  'vector-iso-triceps': 'Triceps Extension',
  'vector-iso-biceps': 'Biceps Curl',
  'vector-iso-hamstrings': 'Hamstring Leg Curl',
  'vector-iso-quads': 'Quad Knee Extension',
  'vector-iso-calves': 'Calf Raise',
  'vector-iso-core': 'Core & Abs',
  'vector-power-olympic': 'Olympic & Explosive Power',
  'vector-carry-conditioning': 'Loaded Carries & Conditioning',
  'vector-mobility-prehab': 'Mobility & Joint Prehab',
};

/**
 * Related biomechanical movement vectors sharing primary prime movers
 * (e.g., Hamstring Knee Flexion <-> Hip Hinge when home equipment lacks a leg-curl machine,
 * or Chest Adduction Fly <-> Horizontal Chest Press when cables/fly stations are busy).
 */
export const RELATED_MOVEMENT_FAMILIES: Record<string, string[]> = {
  'vector-iso-chest': ['vector-pillar-horizontal-push'],
  'vector-pillar-horizontal-push': ['vector-iso-chest'],
  'vector-iso-lats': ['vector-pillar-vertical-pull'],
  'vector-pillar-vertical-pull': ['vector-iso-lats'],
  'vector-iso-glutes': ['vector-pillar-hinge'],
  'vector-iso-hamstrings': ['vector-pillar-hinge'],
  'vector-pillar-hinge': ['vector-iso-hamstrings', 'vector-iso-glutes'],
  'vector-iso-quads': ['vector-pillar-squat'],
  'vector-pillar-squat': ['vector-iso-quads'],
  'vector-iso-triceps': ['vector-pillar-horizontal-push'],
  'vector-iso-biceps': ['vector-pillar-vertical-pull', 'vector-pillar-horizontal-pull'],
  'vector-power-olympic': ['vector-pillar-hinge', 'vector-pillar-squat'],
  'vector-carry-conditioning': ['vector-iso-core', 'vector-pillar-hinge'],
};

/**
 * Maps any ExerciseSession or ExerciseDefinition to its Canonical Movement Family ID.
 * This ensures that substituting equipment (e.g., Barbell Bench <-> Dumbbell Press <-> Push-Up,
 * Back Squat <-> Goblet Squat <-> Split Squat, Pull-Up <-> Lat Pulldown)
 * tracks unified longitudinal progress rather than fragmenting into per-exercise silos,
 * and NEVER confuses compound presses with core crunches or tricep pushdowns.
 */
export function getMovementVectorId(ex: {
  exerciseId?: string;
  id?: string;
  movementFamily?: string;
  pillar: string;
  isIsolation?: boolean;
  primaryMuscle?: string;
}): string {
  if (ex.movementFamily) {
    return ex.movementFamily;
  }

  const rawId = (ex.exerciseId || ex.id || '').toLowerCase();

  if (
    rawId.includes('farmers-walk') ||
    rawId.includes('carry') ||
    rawId.includes('sled') ||
    rawId.includes('rowerg') ||
    rawId.includes('skierg') ||
    rawId.includes('airbike') ||
    rawId.includes('hiit-sprints')
  ) {
    return 'vector-carry-conditioning';
  }
  if (
    rawId.includes('power-clean') ||
    rawId.includes('squat-clean') ||
    rawId.includes('clean-and-jerk') ||
    rawId.includes('snatch') ||
    rawId.includes('high-pull') ||
    rawId.includes('kettlebell-swing') ||
    rawId.includes('kb-swing') ||
    rawId.includes('box-jump') ||
    rawId.includes('broad-jump') ||
    rawId.includes('depth-jump') ||
    rawId.includes('hurdle-hop') ||
    rawId.includes('med-ball')
  ) {
    return 'vector-power-olympic';
  }
  if (
    rawId.includes('worlds-greatest') ||
    rawId.includes('90-90') ||
    rawId.includes('couch-stretch') ||
    rawId.includes('open-book') ||
    rawId.includes('thread-needle') ||
    rawId.includes('wall-mobilization') ||
    rawId.includes('wall-slide') ||
    rawId.includes('dislocates') ||
    rawId.includes('external-rotation')
  ) {
    return 'vector-mobility-prehab';
  }
  if (
    (rawId.includes('fly') && !rawId.includes('rear-delt') && !rawId.includes('y-fly')) ||
    rawId.includes('pec-deck') ||
    rawId.includes('crossover')
  ) {
    return 'vector-iso-chest';
  }
  if (
    rawId.includes('pullover') ||
    rawId.includes('straight-arm-pulldown') ||
    rawId.includes('lat-prayer')
  ) {
    return 'vector-iso-lats';
  }
  if (
    rawId.includes('lateral') ||
    rawId.includes('y-fly') ||
    rawId.includes('y-raise') ||
    rawId.includes('lu-raise') ||
    rawId.includes('side-plank-abduction') ||
    ex.primaryMuscle === 'Side Delts'
  ) {
    return 'vector-iso-sidedelts';
  }
  if (rawId.includes('calf') || rawId.includes('tibialis') || ex.primaryMuscle === 'Calves') {
    return 'vector-iso-calves';
  }
  if (
    rawId.includes('face-pull') ||
    rawId.includes('rear-delt') ||
    rawId.includes('reverse-pec-deck') ||
    rawId.includes('w-raise') ||
    ex.primaryMuscle === 'Rear Delts'
  ) {
    return 'vector-iso-reardelts';
  }
  if (
    rawId.includes('bicep') ||
    rawId.includes('incline-curl') ||
    rawId.includes('cable-curl') ||
    rawId.includes('bayesian') ||
    rawId.includes('preacher') ||
    rawId.includes('spider-curl') ||
    rawId.includes('concentration-curl') ||
    rawId.includes('zottman') ||
    ex.primaryMuscle === 'Biceps'
  ) {
    return 'vector-iso-biceps';
  }
  if (
    rawId.includes('tricep') ||
    rawId.includes('pushdown') ||
    rawId.includes('skullcrusher') ||
    rawId.includes('jm-press') ||
    rawId.includes('tate-press') ||
    rawId.includes('overhead-db-extension') ||
    rawId.includes('diamond-pushup') ||
    ex.primaryMuscle === 'Triceps'
  ) {
    return 'vector-iso-triceps';
  }
  if (rawId.includes('leg-curl') || rawId.includes('hamstring-curl')) {
    return 'vector-iso-hamstrings';
  }
  if (
    rawId.includes('glute-kickback') ||
    rawId.includes('hip-abduction') ||
    rawId.includes('hip-adduction')
  ) {
    return 'vector-iso-glutes';
  }
  if (
    rawId.includes('crunch') ||
    rawId.includes('hanging-leg-raise') ||
    rawId.includes('toes-to-bar') ||
    rawId.includes('ab-wheel') ||
    rawId.includes('pallof') ||
    rawId.includes('woodchop') ||
    rawId.includes('trx-pike') ||
    rawId.includes('hollow-body') ||
    ex.primaryMuscle === 'Core'
  ) {
    return 'vector-iso-core';
  }

  if (ex.isIsolation && ex.primaryMuscle) {
    return `vector-iso-${ex.primaryMuscle.toLowerCase().replace(/\s+/g, '')}`;
  }

  // Canonical 6 Compound Strength Vectors
  return `vector-pillar-${ex.pillar.toLowerCase().replace(/\s+/g, '-')}`;
}

export function getMovementFamilyLabel(exOrVectorId: string | {
  exerciseId?: string;
  id?: string;
  movementFamily?: string;
  movementFamilyLabel?: string;
  pillar: string;
  isIsolation?: boolean;
  primaryMuscle?: string;
}): string {
  if (typeof exOrVectorId === 'string') {
    return MOVEMENT_FAMILY_LABELS[exOrVectorId] || 'Matched Movement';
  }
  if (exOrVectorId.movementFamilyLabel) {
    return exOrVectorId.movementFamilyLabel;
  }
  const vecId = getMovementVectorId(exOrVectorId);
  return MOVEMENT_FAMILY_LABELS[vecId] || exOrVectorId.pillar;
}

/**
 * Checks whether an exercise can be performed in the given TrainingLocation
 * given the user's available home equipment.
 */
export function canPerformExerciseInLocation(
  def: ExerciseDefinition,
  location: TrainingLocation,
  homeEquipment: HomeEquipmentTag[] = ['bench', 'dumbbells', 'trx', 'pullup_bar']
): boolean {
  if (location === 'gym') {
    return def.environments ? def.environments.includes('gym') : true;
  }

  if (location === 'travel') {
    if (def.environments?.includes('travel')) {
      if (!def.requiredHomeEquipment || def.requiredHomeEquipment.length === 0) {
        return true;
      }
      // If a travel movement optionally uses TRX/bands, check if user has it
      return def.requiredHomeEquipment.every((eq) => homeEquipment.includes(eq));
    }
    return def.equipment === 'bodyweight' && (!def.requiredHomeEquipment || def.requiredHomeEquipment.length === 0);
  }

  // location === 'home'
  const allowedInHome =
    def.environments?.includes('home') ||
    def.environments?.includes('travel') ||
    def.equipment === 'dumbbell' ||
    def.equipment === 'bodyweight' ||
    def.equipment === 'weighted_bodyweight';

  if (!allowedInHome) return false;

  if (def.requiredHomeEquipment && def.requiredHomeEquipment.length > 0) {
    return def.requiredHomeEquipment.every((req) => homeEquipment.includes(req));
  }

  return true;
}

/**
 * Returns all exercises in the catalog that express the same Canonical Movement Family
 * (used by ExerciseSwapModal and inline 1-tap implement switcher Pills on ExerciseCard).
 */
export function getVectorImplementOptions(
  currentEx: {
    exerciseId?: string;
    id?: string;
    movementFamily?: string;
    pillar: string;
    isIsolation?: boolean;
    primaryMuscle?: string;
  },
  exerciseCatalog: ExerciseDefinition[],
  locationFilter?: TrainingLocation,
  homeEquipment?: HomeEquipmentTag[]
): ExerciseDefinition[] {
  const targetVector = getMovementVectorId(currentEx);
  const familyMatches = exerciseCatalog.filter(
    (def) => getMovementVectorId(def) === targetVector
  );

  if (!locationFilter) {
    return familyMatches;
  }

  const locationMatches = familyMatches.filter((def) =>
    canPerformExerciseInLocation(def, locationFilter, homeEquipment)
  );

  if (locationFilter === 'travel' || locationFilter === 'home') {
    return locationMatches;
  }

  return locationMatches.length > 0 ? locationMatches : familyMatches;
}

/**
 * Secondary substitutes targeting the same primary muscle via a related movement pattern
 * (e.g. Dumbbell Romanian Deadlift when substituting Seated Leg Curl at home).
 */
export function getRelatedSwapAlternatives(
  currentEx: {
    exerciseId?: string;
    id?: string;
    movementFamily?: string;
    pillar: string;
    isIsolation?: boolean;
    primaryMuscle?: string;
  },
  exerciseCatalog: ExerciseDefinition[],
  locationFilter?: TrainingLocation,
  homeEquipment?: HomeEquipmentTag[],
  excludeExerciseIds: string[] = []
): ExerciseDefinition[] {
  const sourceVector = getMovementVectorId(currentEx);
  const relatedVectors = RELATED_MOVEMENT_FAMILIES[sourceVector] || [];
  if (relatedVectors.length === 0) return [];

  const currentId = currentEx.exerciseId || currentEx.id;
  const currentDef = currentId ? exerciseCatalog.find((e) => e.id === currentId) : undefined;
  const primaryMuscle = currentEx.primaryMuscle || currentDef?.primaryMuscle;

  return exerciseCatalog
    .filter((def) => {
      if (def.id === currentId || excludeExerciseIds.includes(def.id)) return false;
      const vec = getMovementVectorId(def);
      if (!relatedVectors.includes(vec)) return false;
      if (
        primaryMuscle &&
        def.primaryMuscle !== primaryMuscle &&
        !(def.secondaryMuscles as string[] | undefined)?.includes(primaryMuscle)
      ) {
        return false;
      }
      if (!locationFilter) return true;
      return canPerformExerciseInLocation(def, locationFilter, homeEquipment);
    })
    .sort((a, b) => {
      const aPrimaryMatch = a.primaryMuscle === primaryMuscle ? 1 : 0;
      const bPrimaryMatch = b.primaryMuscle === primaryMuscle ? 1 : 0;
      if (aPrimaryMatch !== bPrimaryMatch) return bPrimaryMatch - aPrimaryMatch;
      const aLoaded = a.equipment !== 'bodyweight' ? 1 : 0;
      const bLoaded = b.equipment !== 'bodyweight' ? 1 : 0;
      return bLoaded - aLoaded;
    });
}

export interface SwapPrescription {
  targetWeightKg: number;
  targetReps: number;
  minReps: number;
  maxReps: number;
  targetRir: number;
  isTimed: boolean;
  targetDurationSeconds?: number;
  isPureBodyweight: boolean;
  usedOwnHistory: boolean;
  isCrossFamily: boolean;
  tempoCue?: string;
  rationale: string;
  /** Biomechanical continuity summary (stretch bias, stability, fractional muscle attribution). */
  biomechanicalSummary?: string;
}

/**
 * Computes science-backed target weight, reps (or hold seconds), rep range, and rationale
 * when switching from `sourceExercise` to `targetDef`:
 * - Uses the target movement's own double-progression history first when logged before.
 * - Calibrates rep ranges by movement role (compound vs isolation) and athlete goal phase.
 * - For timed movements, converts to duration hold progression in seconds.
 * - For pure bodyweight movements, solves Epley reps at real bodyweight (`calculateHypertrophyBodyweightReps`).
 * - For same-family loaded movements without own history, solves inverse Epley weight at the new `(targetReps, targetRir)`.
 */
export function prescribeExerciseSwap(params: {
  sourceExercise: ExerciseSession;
  targetDef: ExerciseDefinition;
  workouts?: WorkoutSession[];
  readinessState?: ReadinessState;
  goalPhase?: GoalPhase;
  bodyweightEmaKg?: number;
  location?: TrainingLocation;
  unit?: WeightUnit;
  fallbackTargetWeightKg?: number;
}): SwapPrescription {
  const {
    sourceExercise,
    targetDef,
    workouts = [],
    readinessState = 'Normal',
    goalPhase = 'Lean Bulk',
    bodyweightEmaKg = 80,
    location = 'gym',
    unit = 'kg',
    fallbackTargetWeightKg,
  } = params;

  const isCrossFamily =
    getMovementVectorId(sourceExercise) !== getMovementVectorId(targetDef);
  const isPureBw =
    location === 'travel' ||
    (targetDef.equipment === 'bodyweight' && !targetDef.isWeightedCalisthenic);
  const targetRir = readinessState === 'Amber Shield' ? 3 : 2;
  const timed = isTimedExercise(targetDef);

  const exactHistory = findLastCompletedExerciseSession(targetDef.id, workouts);
  const hasOwnHistory = Boolean(exactHistory && !exactHistory.isCrossImplementTransfer);

  if (timed) {
    const baseDuration = targetDef.defaultDurationSeconds || 45;
    let targetDurationSeconds = baseDuration;
    let targetWeightKg = isPureBw ? 0 : fallbackTargetWeightKg ?? 0;

    if (hasOwnHistory && exactHistory) {
      const doneTimed = exactHistory.session.sets.filter(
        (s) => s.completed && !s.isWarmup && s.setType !== 'warmup'
      );
      const lastDuration =
        doneTimed[0]?.actualDurationSeconds ??
        doneTimed[0]?.targetDurationSeconds ??
        exactHistory.session.durationSeconds ??
        baseDuration;
      const lastWeight = doneTimed[0]?.actualWeightKg ?? doneTimed[0]?.targetWeightKg ?? 0;
      targetDurationSeconds =
        readinessState === 'Amber Shield' ? lastDuration : Math.min(120, lastDuration + 5);
      if (!isPureBw && lastWeight > 0) targetWeightKg = lastWeight;
    }

    const rationale = hasOwnHistory
      ? `From your last ${targetDef.name} hold (+${targetDurationSeconds - (targetDurationSeconds > baseDuration ? 5 : 0)}s target)`
      : `Timed isometric hold calibrated at ${targetDurationSeconds}s @ controlled breathing`;

    return {
      targetWeightKg: isPureBw ? 0 : snapLoadKg(targetWeightKg, unit, targetDef.equipment),
      targetReps: 1,
      minReps: 1,
      maxReps: 1,
      targetRir,
      isTimed: true,
      targetDurationSeconds,
      isPureBodyweight: isPureBw,
      usedOwnHistory: hasOwnHistory,
      isCrossFamily,
      rationale,
    };
  }

  // Calibrate double-progression rep band by isolation role and athlete's current goal phase.
  const [baseMin, baseMax] = targetDef.defaultRepRange;
  let minReps = baseMin;
  let maxReps = baseMax;
  if (goalPhase === 'Maingain' && !targetDef.isIsolation && baseMin >= 6) {
    minReps = Math.max(4, baseMin - 2);
    maxReps = Math.max(minReps + 2, baseMax - 2);
  } else if (goalPhase === 'Cut / Recomp') {
    maxReps = targetDef.isIsolation
      ? Math.min(baseMax, Math.max(minReps + 2, 12))
      : Math.min(baseMax, Math.max(minReps + 2, 10));
  }

  if (hasOwnHistory && exactHistory) {
    const candidate: ExerciseSession = {
      id: `swap-${targetDef.id}`,
      exerciseId: targetDef.id,
      name: targetDef.name,
      pillar: targetDef.pillar,
      equipment: isPureBw ? 'bodyweight' : targetDef.equipment,
      isRdl: targetDef.isRdl,
      isWeightedCalisthenic: isPureBw ? false : targetDef.isWeightedCalisthenic,
      isIsolation: targetDef.isIsolation,
      minReps,
      maxReps,
      sets: sourceExercise.sets
        .filter((s) => !s.isWarmup && s.setType !== 'warmup')
        .map((s, i) => ({
          ...s,
          setNumber: i + 1,
          completed: false,
          targetWeightKg: exactHistory.session.sets[0]?.actualWeightKg ?? exactHistory.session.sets[0]?.targetWeightKg ?? 0,
          targetReps: minReps,
        })),
    };
    const dp = prescribeDoubleProgression(
      candidate,
      readinessState,
      workouts,
      bodyweightEmaKg,
      goalPhase
    );
    const prescribedReps = dp.nextTargetReps[0] ?? minReps;
    const prescribedWeight = isPureBw ? 0 : snapLoadKg(dp.nextWeightKg, unit, targetDef.equipment);
    return {
      targetWeightKg: prescribedWeight,
      targetReps: prescribedReps,
      minReps,
      maxReps,
      targetRir,
      isTimed: false,
      isPureBodyweight: isPureBw,
      usedOwnHistory: true,
      isCrossFamily,
      tempoCue: dp.calibratedTempoCue,
      rationale: `From your ${targetDef.name} history${exactHistory.date ? ` (${exactHistory.date})` : ''} • ${minReps}–${maxReps} rep band`,
    };
  }

  // Compute source stimulus E1RM & reps from working sets
  const sourceWorking = sourceExercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  const sourceFirst = sourceWorking[0] ?? sourceExercise.sets[0];
  const sourceWeightKg = sourceFirst?.actualWeightKg ?? sourceFirst?.targetWeightKg ?? 0;
  const sourceReps = sourceFirst?.actualReps ?? sourceFirst?.targetReps ?? minReps;
  const sourceIsPureBw = sourceExercise.equipment === 'bodyweight' && !sourceExercise.isWeightedCalisthenic;

  let sourceE1rmKg = 0;
  for (const s of sourceWorking) {
    const w = s.actualWeightKg ?? s.targetWeightKg;
    const r = s.actualReps ?? s.targetReps;
    const rir = s.actualRir ?? s.targetRir ?? 2;
    const e1rm = calculateE1RM(
      w,
      r,
      rir,
      sourceExercise.equipment,
      sourceExercise.isRdl,
      sourceExercise.isWeightedCalisthenic,
      bodyweightEmaKg,
      sourceExercise.exerciseId,
      sourceExercise.pillar,
      sourceExercise.name
    );
    if (e1rm > sourceE1rmKg) sourceE1rmKg = e1rm;
  }

  if (isPureBw) {
    const bwRx = calculateHypertrophyBodyweightReps(
      isCrossFamily ? 0 : sourceE1rmKg,
      bodyweightEmaKg,
      targetDef.id,
      targetDef.pillar,
      minReps,
      maxReps,
      targetRir
    );
    return {
      targetWeightKg: 0,
      targetReps: bwRx.targetReps,
      minReps,
      maxReps,
      targetRir,
      isTimed: false,
      isPureBodyweight: true,
      usedOwnHistory: false,
      isCrossFamily,
      tempoCue: bwRx.tempoCue,
      rationale:
        !isCrossFamily && sourceE1rmKg > 0 && bwRx.effectiveBwLoadKg > 0
          ? `Calibrated to ${bwRx.targetReps} reps via Epley against ~${bwRx.effectiveBwLoadKg} kg bodyweight load`
          : `Hypertrophy range ${minReps}–${maxReps} reps @ ${targetRir} RIR`,
    };
  }

  // Loaded replacement without own history
  const targetReps =
    !isCrossFamily && !sourceIsPureBw && sourceReps >= minReps && sourceReps <= maxReps
      ? sourceReps
      : minReps;

  let rawTargetWeightKg: number;
  let rationale: string;
  if (!isCrossFamily && !sourceIsPureBw && sourceE1rmKg > 0 && sourceWeightKg > 0) {
    rawTargetWeightKg = solveTargetWeightForE1RM(
      sourceE1rmKg,
      targetReps,
      targetRir,
      sourceExercise,
      {
        exerciseId: targetDef.id,
        id: targetDef.id,
        name: targetDef.name,
        equipment: targetDef.equipment,
        isRdl: targetDef.isRdl,
        isWeightedCalisthenic: targetDef.isWeightedCalisthenic,
        pillar: targetDef.pillar,
      },
      bodyweightEmaKg
    );
    rationale = `Matched ~${Math.round(sourceE1rmKg)} kg E1RM stimulus across ${targetReps} reps @ ${targetRir} RIR`;
  } else {
    rawTargetWeightKg =
      fallbackTargetWeightKg && fallbackTargetWeightKg > 0
        ? fallbackTargetWeightKg
        : targetDef.equipment === 'dumbbell'
        ? usesOneDumbbell(targetDef)
          ? 16
          : 12
        : 30;
    rationale = isCrossFamily
      ? `Targets ${targetDef.primaryMuscle.toLowerCase()} • ${minReps}–${maxReps} reps @ ${targetRir} RIR`
      : `Calibrated for ${minReps}–${maxReps} reps (${goalPhase})`;
  }

  const targetIdLower = targetDef.id.toLowerCase();
  const derivedProfile =
    targetDef.resistanceProfile ||
    (/(seated-calf|lying-leg-curl|prone-leg-curl|db-leg-curl|sliding-leg-curl|stability-ball-leg-curl|jm-press|tate-press)/.test(
      targetIdLower
    )
      ? 'mid'
      : /(rdl|good-morning|45-back-extension|incline|bayesian|preacher|spider-curl|cable-lateral|behind-back-lateral|side-lying-lateral|lu-raise|y-raise|standing-calf|leg-press-calf|donkey-calf|single-leg-calf|db-calf|slow-calf|leg-curl|nordic|sissy-squat|leg-press|leg-extension|pullup|pullover|lat-prayer|straight-arm|squat|lunge|step-up|step-down|overhead-tricep|overhead-db-extension|skullcrusher|pec-deck|deficit-pushup|fly)/.test(
          targetIdLower
        )
      ? 'lengthened'
      : /(pushdown|kickback|concentration-curl|high-cable-curl|face-pull|pull-apart|hip-thrust|glute-bridge|frog-pump|glute-kickback|reverse-hyper|db-lateral|seated-lateral|machine-lateral|cable-row|seal-row|chest-supported)/.test(
          targetIdLower
        )
      ? 'shortened'
      : 'mid');
  const stretchNote =
    derivedProfile === 'lengthened'
      ? 'Preserves lengthened-stretch stimulus'
      : derivedProfile === 'shortened'
      ? 'Shortened peak tension profile'
      : 'Balanced mid-range resistance curve';
  const derivedStability =
    targetDef.stability ||
    (/(split-squat|bulgarian|lunge|pistol|single-leg|cossack|sissy|step-down|trx|ring|gymball|stability-ball|handstand|bottoms-up|turkish|waiter|windmill)/.test(
      targetIdLower
    )
      ? 'low'
      : targetDef.equipment === 'machine' ||
        targetDef.equipment === 'cable' ||
        /(leg-press|hack|pendulum|belt-squat|smith|chest-supported|seal-row|helms-row|preacher|spider-curl|seated-calf|leg-extension|pulldown|pec-deck)/.test(
          targetIdLower
        ) ||
        (targetIdLower.includes('leg-curl') && !targetIdLower.includes('db-leg-curl') && !targetIdLower.includes('sliding'))
      ? 'high'
      : 'moderate');
  const stabilityNote =
    derivedStability === 'high'
      ? 'high external stability'
      : derivedStability === 'low'
      ? 'unilateral/balance stability demand'
      : 'moderate free-weight stability';
  const secNote =
    targetDef.secondaryMuscles && targetDef.secondaryMuscles.length > 0
      ? ` · 1.0× ${targetDef.primaryMuscle} + 0.5× ${targetDef.secondaryMuscles.join(', ')}`
      : ` · 1.0× ${targetDef.primaryMuscle}`;
  const biomechanicalSummary = `${stretchNote} (${stabilityNote}${secNote}); original lift's progression curve stays untouched.`;

  return {
    targetWeightKg: snapLoadKg(rawTargetWeightKg, unit, targetDef.equipment),
    targetReps,
    minReps,
    maxReps,
    targetRir,
    isTimed: false,
    isPureBodyweight: false,
    usedOwnHistory: false,
    isCrossFamily,
    rationale,
    biomechanicalSummary,
  };
}

/**
 * Finds the most recent completed ExerciseSession for a given exerciseId OR its Canonical Movement Vector
 */
export function findLastCompletedExerciseSession(
  exerciseId: string,
  workouts: WorkoutSession[],
  targetSessionForVectorLookup?: ExerciseSession
): { session: ExerciseSession; date: string; isCrossImplementTransfer: boolean } | null {
  const completedWorkouts = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));

  const targetVector = targetSessionForVectorLookup
    ? getMovementVectorId(targetSessionForVectorLookup)
    : null;

  const hasWorkingSet = (ex: ExerciseSession) => ex.sets.some((s) => s.completed && !s.isWarmup && s.setType !== 'warmup');

  // 1. The exercise's own last session, however long ago: its own history is the best guide to
  //    what to lift next, even when a similar movement was trained more recently.
  for (const w of completedWorkouts) {
    const exactMatch = w.exercises.find((ex) => ex.exerciseId === exerciseId && hasWorkingSet(ex));
    if (exactMatch) {
      return { session: exactMatch, date: w.date, isCrossImplementTransfer: false };
    }
  }

  // 2. Never done before: the most recent exercise with the same movement pattern.
  if (targetVector) {
    for (const w of completedWorkouts) {
      const vectorMatch = w.exercises.find((ex) => getMovementVectorId(ex) === targetVector && hasWorkingSet(ex));
      if (vectorMatch) {
        return {
          session: vectorMatch,
          date: w.date,
          isCrossImplementTransfer: vectorMatch.exerciseId !== exerciseId,
        };
      }
    }
  }
  return null;
}

/**
 * Formats a completed set into a concise Hevy/TrainHeroic ghost reference string (e.g. "90×10 @2R")
 */
export function formatPreviousSetGhost(
  weightKg: number | undefined,
  reps: number | undefined,
  rir: number | undefined,
  isTranslated = false
): string {
  if (weightKg === undefined || reps === undefined) return '—';
  const prefix = isTranslated ? '≈' : '';
  const rirSuffix = rir !== undefined ? ` @${rir}R` : '';
  const weightStr = weightKg === 0 ? 'BW' : `${weightKg}`;
  return `${prefix}${weightStr}×${reps}${rirSuffix}`;
}

/**
 * Evaluates exercise performance across the Canonical Movement Vector and prescribes
 * next session's target load and reps with seamless Cross-Implement Equivalence:
 *
 * Double Progression Rule:
 * 1. If Amber Shield is active:
 *    - Hold load static (translated to current implement if switched).
 *    - Shift target effort to 2–3 RIR.
 *    - Protect the athlete's streak.
 *
 * 2. If all completed working sets hit the top of the rep range (e.g. 12/12/12) at 1–2 RIR:
 *    - Barbell: +2.5 kg.
 *    - Dumbbell: +2.0 kg.
 *    - Other (Cable/Machine): +2.5 kg or smallest increment.
 *    - Reset target reps to bottom of rep range (e.g. 8 reps).
 *
 * 3. If within rep range at 1–2 RIR:
 *    - Hold weight static (or translated equivalent).
 *    - Prescribe +1 rep on the first two sets for next session (capped at max reps).
 */
export function prescribeDoubleProgression(
  session: ExerciseSession,
  readinessState: ReadinessState = 'Normal',
  historicalWorkouts?: WorkoutSession[],
  bodyweightEmaKg: number = 81.5,
  goalPhase: GoalPhase = 'Lean Bulk',
  unit: WeightUnit = 'kg'
): ProgressionPrescription {
  let sourceSession = session;
  let lastSessionDate: string | undefined;
  let isCrossImplement = false;

  const workingCompletedInCurrent = session.sets.filter(
    (s) => s.completed && !s.isWarmup && s.setType !== 'warmup'
  );

  if (workingCompletedInCurrent.length === 0 && historicalWorkouts && historicalWorkouts.length > 0) {
    const historicalMatch = findLastCompletedExerciseSession(
      session.exerciseId,
      historicalWorkouts,
      session
    );
    if (historicalMatch) {
      sourceSession = historicalMatch.session;
      lastSessionDate = historicalMatch.date;
      isCrossImplement = historicalMatch.isCrossImplementTransfer;
    }
  }

  const sets = sourceSession.sets.filter(
    (s) => s.completed && !s.isWarmup && s.setType !== 'warmup'
  );
  const workingSetsInSession = session.sets.filter(
    (s) => !s.isWarmup && s.setType !== 'warmup'
  );
  const targetSets = workingSetsInSession.length > 0 ? workingSetsInSession : session.sets;
  const sourceWorkingSets = sourceSession.sets.filter(
    (s) => !s.isWarmup && s.setType !== 'warmup'
  );
  const minReps = session.minReps || sourceSession.minReps || 8;
  const maxReps = session.maxReps || sourceSession.maxReps || 12;
  const sourceMaxReps = sourceSession.maxReps || maxReps;
  const sourceMinReps = sourceSession.minReps || minReps;

  const firstWorkingInSession = targetSets[0] ?? session.sets[0];

  const translateWeight = (rawW: number): number =>
    isCrossImplement
      ? translateWeightBetweenImplements(
          rawW,
          {
            equipment: sourceSession.equipment,
            isRdl: sourceSession.isRdl,
            isWeightedCalisthenic: sourceSession.isWeightedCalisthenic,
            exerciseId: sourceSession.exerciseId,
            name: sourceSession.name,
            pillar: sourceSession.pillar,
          },
          {
            equipment: session.equipment,
            isRdl: session.isRdl,
            isWeightedCalisthenic: session.isWeightedCalisthenic,
            exerciseId: session.exerciseId,
            name: session.name,
            pillar: session.pillar,
          },
          bodyweightEmaKg
        )
      : rawW;

  const completedWorkingWeights = sets
    .map((s) => translateWeight(s.actualWeightKg ?? s.targetWeightKg ?? 0))
    .filter((w) => w > 0);
  const rawFallbackWeight = firstWorkingInSession?.targetWeightKg ?? 20;
  const rawSourceFirst = sets[0]?.actualWeightKg ?? sets[0]?.targetWeightKg;

  const isPureBodyweight =
    (session.equipment === 'bodyweight' && !session.isWeightedCalisthenic) ||
    ((rawSourceFirst ?? rawFallbackWeight) === 0 && session.equipment === 'bodyweight');

  // Anchor to the heaviest completed working weight in the athlete's target implement (never warm-up sets).
  const currentWeight = isPureBodyweight
    ? 0
    : completedWorkingWeights.length > 0
    ? Math.max(...completedWorkingWeights)
    : rawSourceFirst !== undefined
    ? translateWeight(rawSourceFirst)
    : rawFallbackWeight;

  // Compute Canonical Pillar E1RM from the source session's best set
  let canonicalE1rmKg = 0;
  for (const s of sets) {
    const w = s.actualWeightKg ?? s.targetWeightKg;
    const r = s.actualReps ?? s.targetReps;
    const rir = s.actualRir ?? s.targetRir ?? 2;
    const e1rm = calculateE1RM(
      w,
      r,
      rir,
      sourceSession.equipment,
      sourceSession.isRdl,
      sourceSession.isWeightedCalisthenic,
      bodyweightEmaKg,
      sourceSession.exerciseId,
      sourceSession.pillar,
      sourceSession.name
    );
    if (e1rm > canonicalE1rmKg) canonicalE1rmKg = e1rm;
  }

  const previousSetsSummary = sets.map((s) => {
    const rawW = s.actualWeightKg ?? s.targetWeightKg;
    const displayW = isPureBodyweight
      ? 0
      : isCrossImplement
      ? translateWeightBetweenImplements(
          rawW,
          {
            equipment: sourceSession.equipment,
            isRdl: sourceSession.isRdl,
            isWeightedCalisthenic: sourceSession.isWeightedCalisthenic,
            exerciseId: sourceSession.exerciseId,
            name: sourceSession.name,
            pillar: sourceSession.pillar,
          },
          {
            equipment: session.equipment,
            isRdl: session.isRdl,
            isWeightedCalisthenic: session.isWeightedCalisthenic,
            exerciseId: session.exerciseId,
            name: session.name,
            pillar: session.pillar,
          },
          bodyweightEmaKg
        )
      : rawW;

    return formatPreviousSetGhost(
      displayW,
      s.actualReps ?? s.targetReps,
      s.actualRir ?? s.targetRir,
      isCrossImplement
    );
  });

  const transferredFromExerciseName = isCrossImplement ? sourceSession.name : undefined;
  const transferPrefix = isCrossImplement
    ? `Matched from ${sourceSession.name}: `
    : '';

  // Amber Shield override:
  if (readinessState === 'Amber Shield') {
    const snappedHold = isPureBodyweight ? 0 : currentWeight > 0 ? snapLoadKg(currentWeight, unit, session.equipment) : 0;
    const amberReason = isPureBodyweight
      ? `${transferPrefix}Recovery mode is active. Stop 2–3 reps short of failure on bodyweight sets so your joints and muscles can recover.`
      : `${transferPrefix}Recovery mode is active. Weight stays at ${formatWeight(snappedHold, unit)} with 2–3 reps left in reserve so your joints and muscles can recover.`;

    return {
      exerciseId: session.exerciseId,
      nextWeightKg: snappedHold,
      nextTargetReps: targetSets.map((s, idx) => sets[idx]?.actualReps || s.targetReps || minReps),
      reason: amberReason,
      weightChanged: false,
      repsChanged: false,
      isAmberShieldBuffer: true,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
      isPureBodyweight,
      calibratedTempoCue: isPureBodyweight ? 'Controlled 3s eccentric tempo' : undefined,
    };
  }

  // If no sets completed anywhere, return current defaults or calibrated bodyweight hypertrophy reps
  if (sets.length === 0) {
    if (isPureBodyweight) {
      const bwPrescription = calculateHypertrophyBodyweightReps(
        canonicalE1rmKg,
        bodyweightEmaKg,
        session.exerciseId,
        session.pillar,
        minReps,
        maxReps
      );
      return {
        exerciseId: session.exerciseId,
        nextWeightKg: 0,
        nextTargetReps: targetSets.map(() => bwPrescription.targetReps),
        reason: `${transferPrefix}${bwPrescription.explanation}`,
        weightChanged: false,
        repsChanged: bwPrescription.targetReps !== minReps,
        isAmberShieldBuffer: false,
        lastSessionDate,
        previousSetsSummary: [],
        transferredFromExerciseName,
        canonicalE1rmKg,
        isPureBodyweight: true,
        calibratedTempoCue: bwPrescription.tempoCue,
      };
    }

    return {
      exerciseId: session.exerciseId,
      nextWeightKg: currentWeight > 0 ? snapLoadKg(currentWeight, unit, session.equipment) : 0,
      nextTargetReps: targetSets.map((s) => s.targetReps || minReps),
      reason: 'Starting target based on your current training plan.',
      weightChanged: false,
      repsChanged: false,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary: [],
      transferredFromExerciseName,
      canonicalE1rmKg,
      isPureBodyweight: false,
    };
  }

  // Form-failure protocols ('F*') intentionally push high-rep failure rather than strict rep floors.
  if (session.repTargetType === 'form_failure') {
    const snappedCurrent = isPureBodyweight ? 0 : currentWeight > 0 ? snapLoadKg(currentWeight, unit, session.equipment) : 0;
    const allAtTop =
      sets.length >= Math.max(1, sourceWorkingSets.length) &&
      sets.every((s) => (s.actualReps ?? 0) >= sourceMaxReps && hadQualityEffort(s.actualRir, s.targetRir));
    if (allAtTop && !isPureBodyweight) {
      const increment = loadIncrementFor(session.equipment, unit);
      const nextWeight = snapLoadKg(snappedCurrent + increment, unit, session.equipment);
      return {
        exerciseId: session.exerciseId,
        nextWeightKg: nextWeight,
        nextTargetReps: targetSets.map(() => minReps),
        reason: `${transferPrefix}Hit ${sourceMaxReps} reps cleanly on all form-failure sets — increasing weight to ${formatWeight(nextWeight, unit)}.`,
        weightChanged: nextWeight > snappedCurrent + 0.05,
        repsChanged: true,
        isAmberShieldBuffer: false,
        lastSessionDate,
        previousSetsSummary,
        transferredFromExerciseName,
        canonicalE1rmKg,
        isPureBodyweight: false,
      };
    }
    return {
      exerciseId: session.exerciseId,
      nextWeightKg: snappedCurrent,
      nextTargetReps: targetSets.map((s, idx) => sets[idx]?.actualReps || s.targetReps || minReps),
      reason: isPureBodyweight
        ? `${transferPrefix}Push each bodyweight set close to crisp technical failure.`
        : `${transferPrefix}Keeping ${formatWeight(snappedCurrent, unit)} while pushing close to clean technical failure.`,
      weightChanged: false,
      repsChanged: false,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
      isPureBodyweight,
    };
  }

  // Evaluate Double Progression cleanly through the single shared rule engine
  const isAssisted = isAssistedExercise(session);
  const learnedSlope =
    historicalWorkouts && historicalWorkouts.length > 0
      ? learnExerciseEnduranceSlope(session.exerciseId, historicalWorkouts)
      : null;
  // Translate historical set weights into the target implement when transferring across implements
  // so single-set Epley scoring inside evaluateRepRangeDoubleProgression uses target-implement kg.
  const setsForEvaluation = isCrossImplement
    ? sets.map((s) => {
        const translated = translateWeight(s.actualWeightKg ?? s.targetWeightKg ?? 0);
        return {
          ...s,
          targetWeightKg: translated,
          actualWeightKg: translated,
        };
      })
    : sets;
  const evaluation = evaluateRepRangeDoubleProgression({
    completedWorkingSets: setsForEvaluation,
    sourcePrescribedSetCount: sourceWorkingSets.length || sets.length,
    targetSetCount: targetSets.length,
    minReps,
    maxReps,
    sourceMinReps: isCrossImplement ? minReps : sourceMinReps,
    sourceMaxReps: isCrossImplement ? maxReps : sourceMaxReps,
    sourceTargetRir: sourceWorkingSets[sourceWorkingSets.length - 1]?.targetRir ?? sets[sets.length - 1]?.targetRir,
    targetRir: targetSets[targetSets.length - 1]?.targetRir ?? firstWorkingInSession?.targetRir,
    currentWeightKg: currentWeight,
    equipment: session.equipment,
    readinessState,
    unit,
    isPureBodyweight,
    isAssisted,
    epleyDenominator: learnedSlope?.isPersonalized ? learnedSlope.denominator : undefined,
    weightOfSetKg: (s) => translateWeight(s.actualWeightKg ?? s.targetWeightKg ?? 0),
  });
  const extraPrescriptionMeta = {
    ...(evaluation.repCeilingExpanded && evaluation.effectiveMaxReps
      ? {
          expandedRepCeiling: evaluation.effectiveMaxReps,
          repCeilingExplanation: evaluation.repCeilingExplanation,
        }
      : {}),
    ...(learnedSlope?.isPersonalized ? { enduranceSlopeDenominator: learnedSlope.denominator } : {}),
  };

  if (evaluation.status === 'increase_load') {
    if (isPureBodyweight) {
      return {
        exerciseId: session.exerciseId,
        nextWeightKg: 0,
        nextTargetReps: evaluation.nextRepsBySet,
        reason: `${transferPrefix}You hit ${sourceMaxReps} reps on all bodyweight sets! Increasing target by +2 reps (or pause 2 seconds in the stretch) to continue progressive overload without external weights.`,
        weightChanged: false,
        repsChanged: true,
        isAmberShieldBuffer: false,
        lastSessionDate,
        previousSetsSummary,
        transferredFromExerciseName,
        canonicalE1rmKg,
        isPureBodyweight: true,
        calibratedTempoCue: '2s paused stretch in the bottom',
      };
    }

    if (isAssisted) {
      const reducedBy = formatWeight(Math.max(0.5, currentWeight - evaluation.nextWeightKg), unit);
      const reasonText =
        evaluation.nextWeightKg <= 0
          ? `${transferPrefix}You hit ${maxReps} reps across every set — ready for unassisted bodyweight reps (0 kg assistance), resetting target to ${minReps} reps.`
          : `${transferPrefix}You hit ${maxReps} reps across every set with reps in reserve — reducing assistance by ${reducedBy} to ${formatWeight(evaluation.nextWeightKg, unit)} and resetting target to ${minReps} reps.`;
      return {
        exerciseId: session.exerciseId,
        nextWeightKg: evaluation.nextWeightKg,
        nextTargetReps: evaluation.nextRepsBySet,
        reason: reasonText,
        weightChanged: evaluation.weightChanged,
        repsChanged: evaluation.repsChanged,
        isAmberShieldBuffer: false,
        lastSessionDate,
        previousSetsSummary,
        transferredFromExerciseName,
        canonicalE1rmKg,
        isPureBodyweight: false,
      };
    }

    const deltaText = formatWeight(Math.max(0.5, evaluation.nextWeightKg - currentWeight), unit);
    const reasonText =
      goalPhase === 'Cut / Recomp'
        ? `${transferPrefix}Retention Shield Breakthrough: You hit ${maxReps} reps across all sets! Moving weight up by +${deltaText} to ${formatWeight(evaluation.nextWeightKg, unit)} and resetting target to ${minReps} reps.`
        : `${transferPrefix}You hit ${maxReps} reps across every set with reps in reserve — moving weight up by +${deltaText} to ${formatWeight(evaluation.nextWeightKg, unit)} and resetting target to ${minReps} reps.`;

    return {
      exerciseId: session.exerciseId,
      nextWeightKg: evaluation.nextWeightKg,
      nextTargetReps: evaluation.nextRepsBySet,
      reason: reasonText,
      weightChanged: evaluation.weightChanged,
      repsChanged: evaluation.repsChanged,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
      isPureBodyweight: false,
    };
  }

  if (evaluation.status === 'reduce_load') {
    if (isPureBodyweight) {
      return {
        exerciseId: session.exerciseId,
        nextWeightKg: 0,
        nextTargetReps: evaluation.nextRepsBySet,
        reason: `${transferPrefix}At least one set fell below ${minReps} reps (low: ${evaluation.lowestReps}). Hold bodyweight and build cleanly until every set reaches ${minReps}–${maxReps} reps.`,
        weightChanged: false,
        repsChanged: evaluation.repsChanged,
        isAmberShieldBuffer: false,
        lastSessionDate,
        previousSetsSummary,
        transferredFromExerciseName,
        canonicalE1rmKg,
        isPureBodyweight: true,
        calibratedTempoCue: 'Controlled 3s eccentric tempo',
      };
    }

    const reasonText = evaluation.weightChanged
      ? `${transferPrefix}Set performance dropped below the ${minReps}-rep floor (lowest: ${evaluation.lowestReps} reps) — reducing weight from ${formatWeight(currentWeight, unit)} to ${formatWeight(evaluation.nextWeightKg, unit)} and targeting ${minReps} reps across every set.`
      : `${transferPrefix}At least one set fell below ${minReps} reps — keeping minimum load (${formatWeight(evaluation.nextWeightKg, unit)}) and targeting ${minReps} reps cleanly across each set.`;

    return {
      exerciseId: session.exerciseId,
      nextWeightKg: evaluation.nextWeightKg,
      nextTargetReps: evaluation.nextRepsBySet,
      reason: reasonText,
      weightChanged: evaluation.weightChanged,
      repsChanged: evaluation.repsChanged,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
      isPureBodyweight: false,
    };
  }

  if (evaluation.status === 'range_changed') {
    return {
      exerciseId: session.exerciseId,
      nextWeightKg: evaluation.nextWeightKg,
      nextTargetReps: evaluation.nextRepsBySet,
      reason: isPureBodyweight
        ? `${transferPrefix}Rep range shifted to ${minReps}–${maxReps} — starting at ${minReps} reps across each set.`
        : `${transferPrefix}Rep range shifted to ${minReps}–${maxReps} — matched load to ${formatWeight(evaluation.nextWeightKg, unit)} at ${minReps} reps across each set.`,
      weightChanged: evaluation.weightChanged,
      repsChanged: evaluation.repsChanged,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
      isPureBodyweight,
    };
  }

  if (evaluation.status === 'build_reps') {
    if (isPureBodyweight) {
      return {
        exerciseId: session.exerciseId,
        nextWeightKg: 0,
        nextTargetReps: evaluation.nextRepsBySet,
        reason: `${transferPrefix}Strong bodyweight sets last session${lastSessionDate ? ` (${lastSessionDate})` : ''}. Aiming for +1 rep on your first two sets toward ${maxReps}.`,
        weightChanged: false,
        repsChanged: true,
        isAmberShieldBuffer: false,
        lastSessionDate,
        previousSetsSummary,
        transferredFromExerciseName,
        canonicalE1rmKg,
        isPureBodyweight: true,
        calibratedTempoCue: 'Controlled 3s eccentric tempo',
      };
    }

    const targetCeiling = evaluation.effectiveMaxReps ?? maxReps;
    const inRangeReason =
      evaluation.repCeilingExpanded && evaluation.repCeilingExplanation
        ? `${transferPrefix}${evaluation.repCeilingExplanation}`
        : goalPhase === 'Cut / Recomp'
        ? `${transferPrefix}Retention Shield: All sets hit the ${minReps}-rep floor. Keeping ${formatWeight(currentWeight, unit)} and pushing +1 rep toward ${targetCeiling} across every set to preserve lean mass.`
        : `${transferPrefix}All sets hit at least ${minReps} reps${lastSessionDate ? ` (${lastSessionDate})` : ''}. Keeping weight at ${formatWeight(currentWeight, unit)} until all sets reach ${targetCeiling} reps.`;

    return {
      exerciseId: session.exerciseId,
      nextWeightKg: evaluation.nextWeightKg,
      nextTargetReps: evaluation.nextRepsBySet,
      reason: inRangeReason,
      weightChanged: false,
      repsChanged: true,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
      isPureBodyweight: false,
      ...extraPrescriptionMeta,
    };
  }

  // status === 'consolidate' (sets hit >= minReps, e.g., ground-out 0 RIR or incomplete sets -> hold load and reps)
  const holdReason = isPureBodyweight
    ? `${transferPrefix}Hold reps steady today and focus on clean form and reps in reserve before adding more.`
    : goalPhase === 'Cut / Recomp'
    ? `${transferPrefix}Retention Shield Active: Holding weight at ${formatWeight(currentWeight, unit)} until all sets finish cleanly with 1+ rep in reserve.`
    : `${transferPrefix}Keeping ${formatWeight(currentWeight, unit)} today until every prescribed set finishes cleanly with at least 1 rep in reserve.`;

  return {
    exerciseId: session.exerciseId,
    nextWeightKg: isPureBodyweight ? 0 : evaluation.nextWeightKg,
    nextTargetReps: evaluation.nextRepsBySet,
    reason: holdReason,
    weightChanged: false,
    repsChanged: false,
    isAmberShieldBuffer: false,
    lastSessionDate,
    previousSetsSummary,
    transferredFromExerciseName,
    canonicalE1rmKg,
    isPureBodyweight,
    calibratedTempoCue: isPureBodyweight ? 'Controlled 3s eccentric tempo' : undefined,
  };
}

/**
 * Synthesizes the current program stage (mesocycle week 1-6), athlete goal (e.g. hypertrophy),
 * and autonomic recovery into a concise, everyday natural language description of how to make
 * progress this session. Replaces fragmented per-exercise repetition with clear macro guidance.
 */
export function getSessionProgressNarrative(
  mesoWeek: number,
  goalPhase: GoalPhase = 'Lean Bulk',
  readinessState: ReadinessState = 'Normal'
): { stageHeadline: string; narrativeText: string } {
  const week = Math.min(6, Math.max(1, mesoWeek));

  if (readinessState === 'Amber Shield') {
    return {
      stageHeadline: `Week ${week} of 6 • Active Recovery Focus`,
      narrativeText:
        'Your body needs extra recovery today. Keep your working weights steady and leave 2–3 reps in the tank to protect your muscle gains and keep your streak alive without burnout.',
    };
  }

  if (goalPhase === 'Lean Bulk') {
    switch (week) {
      case 1:
        return {
          stageHeadline: 'Week 1 of 6 • Base Accumulation',
          narrativeText:
            'Start your training block with clean, controlled reps. Leaving 2 reps in reserve on your working sets builds the foundation to maximize muscle growth over the next 5 weeks.',
        };
      case 2:
        return {
          stageHeadline: 'Week 2 of 6 • Progressive Momentum',
          narrativeText:
            'Your muscles have adapted to the baseline movements. Aim to match or add 1 clean rep on your working sets—this progressive mechanical tension is the primary signal that triggers new muscle growth.',
        };
      case 3:
        return {
          stageHeadline: 'Week 3 of 6 • Muscle Growth Core',
          narrativeText:
            "You're in the hypertrophy sweet spot. Push your working sets with high mechanical tension, leaving 1–2 reps in the tank on your heaviest compounds to maximize muscle fiber recruitment.",
        };
      case 4:
        return {
          stageHeadline: 'Week 4 of 6 • Peak Stimulus',
          narrativeText:
            "Training volume reaches its peak this week. Focus on matching or beating last session's reps on each exercise to spur deep muscular adaptation before fatigue sets in.",
        };
      case 5:
        return {
          stageHeadline: 'Week 5 of 6 • Maximum Overload',
          narrativeText:
            'Final hard push of the block. Give this session everything you have, pushing working sets to 0–1 reps in reserve to fully fatigue target fibers before next week’s planned deload.',
        };
      case 6:
      default:
        return {
          stageHeadline: 'Week 6 of 6 • Deload & Muscle Repair',
          narrativeText:
            'Active recovery week. Halving your volume dissipates accumulated fatigue and repairs joint tissue, allowing your body to cement newly built muscle and return stronger next block.',
        };
    }
  }

  if (goalPhase === 'Cut / Recomp') {
    if (week === 6) {
      return {
        stageHeadline: 'Week 6 of 6 • Deload & Refresh',
        narrativeText:
          'Lighter sets today dissipate systemic fatigue while in a deficit, keeping your metabolism primed and protecting your lean mass.',
      };
    }
    return {
      stageHeadline: `Week ${week} of 6 • Muscle Retention Phase`,
      narrativeText:
        'You are training in a caloric deficit. Heavy mechanical tension signals your body that muscle is vital for survival—holding your working weights steady today protects 100% of your lean mass while you burn fat.',
    };
  }

  // Maingain (Strength & Density)
  if (week === 6) {
    return {
      stageHeadline: 'Week 6 of 6 • Deload & Rebuild',
      narrativeText:
        'Lighter sets flush localized muscle fatigue, restore connective tissues, and prime your nervous system for heavy strength output next block.',
    };
  }
  return {
    stageHeadline: `Week ${week} of 6 • Strength & Density`,
    narrativeText:
      'Focus on crisp execution and movement speed. Hitting your target reps with 1–2 reps in reserve builds dense muscle and athletic work capacity while staying lean.',
  };
}

