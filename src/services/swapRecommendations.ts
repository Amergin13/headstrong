/**
 * Single-source Exercise Swap Recommendation Engine.
 *
 * Ranks eligible replacement exercises for both ExerciseSwapModal and the AI Coach's
 * swap_exercise tool using biomechanical pattern continuity, muscle & stretch-profile match,
 * equipment/location fit, the athlete's own logged history, recovery readiness (Amber Shield),
 * and saved injury/preference contraindications—returning one clear Recommended Swap with
 * athlete-readable logic plus the remaining ranked alternatives for progressive disclosure.
 */
import {
  AthleteMemoryFact,
  EnvironmentOverlay,
  ExerciseDefinition,
  ExerciseProgressionState,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ReadinessState,
  TrainingLocation,
  WorkoutSession,
} from '../engine/types';
import {
  createOverlayForTrainingLocation,
  deriveIsolatedProgressionStateFromHistory,
  evaluateSingleExerciseContinuitySwap,
  resolveMovementPattern,
  resolveSlotForOverlay,
  toBarbellEquivalentAnchorE1rm,
} from '../engine/continuityEngine';

export type SingleExerciseContinuitySwapResult = ReturnType<typeof evaluateSingleExerciseContinuitySwap>;
import { getExerciseBiomechanicalMeta } from '../engine/knowledgeGraph';
import {
  canPerformExerciseInLocation,
  getMovementFamilyLabel,
  getMovementVectorId,
  getRelatedSwapAlternatives,
  prescribeExerciseSwap,
  SwapPrescription,
} from '../engine/progression';
import { deriveContraindicationEdges } from './coachContextEnvelope';
import { WeightUnit } from '../utils/units';

export interface RankedSwapCandidate {
  exercise: ExerciseDefinition;
  /** False when exact same biomechanical movement family; true when related pattern hitting the same muscle. */
  isRelatedPattern: boolean;
  score: number;
  /** True when blocked by an injury/contraindication athlete memory. */
  isContraindicated: boolean;
  /** True when flagged as a preference/caution edge. */
  isCaution: boolean;
  /** Human reason if flagged as contraindicated or caution. */
  cautionReason?: string;
  /** Concise headline tag for the recommended swap card (e.g. "Recommended swap", "Recovery-friendly pick"). */
  badgeLabel: string;
  /** Optional secondary pill tag (e.g. "From your history", "Different gear"). */
  highlightTag?: string;
  /** 2–3 concrete, plain-English bullet reasons explaining WHY this replacement was recommended. */
  reasons: string[];
  /** Single-paragraph summary joining the core logic for compact cards or coach replies. */
  whyRecommended: string;
  prescription: SwapPrescription;
  continuity: SingleExerciseContinuitySwapResult;
}

export interface SwapRecommendationResult {
  recommended: RankedSwapCandidate | null;
  /** Remaining eligible options sorted by score (safe options first, contraindicated last). */
  otherOptions: RankedSwapCandidate[];
  /** All ranked candidates (`recommended` first, followed by `otherOptions`). */
  allRanked: RankedSwapCandidate[];
}

export interface RankSwapRecommendationsParams {
  currentExercise: ExerciseSession;
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  location?: TrainingLocation;
  homeEquipment?: HomeEquipmentTag[];
  workouts?: WorkoutSession[];
  activeOverlay?: EnvironmentOverlay | null;
  storedProgressionStates?: Record<string, ExerciseProgressionState>;
  athleteMemories?: AthleteMemoryFact[];
  readinessState?: ReadinessState;
  goalPhase?: GoalPhase;
  unit?: WeightUnit;
  excludeExerciseIds?: string[];
  resolveFallbackWeight?: (def: ExerciseDefinition) => number | undefined;
}

const EQUIP_PHRASE: Record<ExerciseDefinition['equipment'], string> = {
  barbell: 'a barbell',
  dumbbell: 'dumbbells',
  cable: 'cables',
  machine: 'a machine',
  bodyweight: 'bodyweight',
  weighted_bodyweight: 'weighted bodyweight',
};

const RESISTANCE_PHRASE: Record<'lengthened' | 'mid' | 'shortened', string> = {
  lengthened: 'lengthened-stretch tension',
  mid: 'balanced mid-range tension',
  shortened: 'peak-contraction tension',
};

const PREFERRED_BIOMECHANICAL_SWAPS: Record<string, string[]> = {
  'ex-bench-press': ['ex-flat-db-press', 'ex-db-bench-press', 'ex-machine-chest-press'],
  'ex-guillotine-press': ['ex-db-bench-press', 'ex-flat-db-press', 'ex-machine-chest-press'],
  'ex-db-bench-press': ['ex-flat-db-press', 'ex-bench-press', 'ex-machine-chest-press'],
  'ex-flat-db-press': ['ex-db-bench-press', 'ex-bench-press', 'ex-machine-chest-press'],
  'ex-barbell-squat': ['ex-leg-press', 'ex-bulgarian-split-squat', 'ex-db-front-squat'],
  'ex-leg-press': ['ex-barbell-squat', 'ex-bulgarian-split-squat', 'ex-db-front-squat'],
  'ex-deadlift': ['ex-rdl', 'ex-db-rdl'],
  'ex-rdl': ['ex-db-rdl', 'ex-deadlift'],
  'ex-ohp': ['ex-db-shoulder-press', 'ex-arnold-press'],
  'ex-db-shoulder-press': ['ex-ohp', 'ex-arnold-press'],
  'ex-barbell-row': ['ex-chest-supported-db-row', 'ex-cable-row', 'ex-single-arm-db-row'],
  'ex-cable-row': ['ex-chest-supported-db-row', 'ex-barbell-row', 'ex-single-arm-db-row'],
  'ex-chinup': ['ex-lat-pulldown', 'ex-neutral-grip-pulldown'],
  'ex-weighted-pullup': ['ex-lat-pulldown', 'ex-neutral-grip-pulldown', 'ex-chinup'],
  'ex-lat-pulldown': ['ex-neutral-grip-pulldown', 'ex-chinup'],
  'ex-leg-curl': ['ex-db-leg-curl', 'ex-db-rdl'],
};

function lowercaseMuscle(muscle: string): string {
  return muscle.toLowerCase();
}

function formatMuscleList(primary: string, secondaries: string[]): string {
  const all = [lowercaseMuscle(primary), ...secondaries.slice(0, 2).map(lowercaseMuscle)];
  if (all.length === 1) return all[0];
  if (all.length === 2) return `${all[0]} and ${all[1]}`;
  return `${all.slice(0, -1).join(', ')}, and ${all[all.length - 1]}`;
}

function buildRecommendationReasons(params: {
  currentExercise: ExerciseSession;
  currentDef?: ExerciseDefinition;
  candidate: ExerciseDefinition;
  isRelatedPattern: boolean;
  prescription: SwapPrescription;
  continuity: SingleExerciseContinuitySwapResult;
  location: TrainingLocation;
  readinessState: ReadinessState;
  currentMeta: ReturnType<typeof getExerciseBiomechanicalMeta> | null;
  candMeta: ReturnType<typeof getExerciseBiomechanicalMeta>;
  sidesteppedContraindication: boolean;
  isContraindicated: boolean;
  cautionReason?: string;
  isBestBodyweightTier: boolean;
}): {
  badgeLabel: string;
  highlightTag?: string;
  reasons: string[];
  whyRecommended: string;
} {
  const {
    currentExercise,
    currentDef,
    candidate,
    isRelatedPattern,
    prescription,
    continuity,
    location,
    readinessState,
    currentMeta,
    candMeta,
    sidesteppedContraindication,
    isContraindicated,
    cautionReason,
    isBestBodyweightTier,
  } = params;

  const familyLabel = getMovementFamilyLabel(currentDef || currentExercise).toLowerCase();
  const primaryMuscle = lowercaseMuscle(candidate.primaryMuscle);
  const musclePhrase = formatMuscleList(candidate.primaryMuscle, candidate.secondaryMuscles ?? []);

  const sameProfile = currentMeta && currentMeta.resistanceProfile === candMeta.resistanceProfile;
  const diffEquip = candidate.equipment !== currentExercise.equipment;
  const hasOwnHistory =
    prescription.usedOwnHistory || continuity.prescription.calibrationSource === 'OWN_HISTORY';
  const isEffortMachine =
    !prescription.isTimed &&
    continuity.prescription.calibrationSource === 'EFFORT_ONLY' &&
    continuity.targetMetadata.equipmentClass === 'VARIABLE_MACHINE_OR_CABLE';
  const isAnchorEstimate =
    !prescription.isTimed &&
    continuity.prescription.calibrationSource === 'ANCHOR_PRIOR' &&
    continuity.targetMetadata.equipmentClass === 'STANDARDIZED_FREE_WEIGHT';
  const isPureBw = prescription.isPureBodyweight;
  const lowerAxial = currentMeta != null && candMeta.axialLoadIndex < currentMeta.axialLoadIndex - 0.5;
  const highStability = candMeta.stability === 'high';
  const recoveryFriendly = readinessState === 'Amber Shield' && (highStability || lowerAxial);

  const reasons: string[] = [];

  // 1. Biomechanical & equipment fit
  if (isRelatedPattern) {
    reasons.push(
      `Targets your ${primaryMuscle} through a closely related pattern using ${EQUIP_PHRASE[candidate.equipment]}.`
    );
  } else if (location === 'travel') {
    reasons.push(
      `Preserves your ${familyLabel} stimulus on ${musclePhrase} with zero gym equipment needed.`
    );
  } else if (diffEquip) {
    const profileNote = sameProfile
      ? ` while preserving ${RESISTANCE_PHRASE[candMeta.resistanceProfile]}`
      : '';
    reasons.push(
      `Matches your ${familyLabel} pattern using ${EQUIP_PHRASE[candidate.equipment]} instead of ${EQUIP_PHRASE[currentExercise.equipment]}${profileNote}.`
    );
  } else {
    reasons.push(
      `Matches your ${familyLabel} pattern on ${musclePhrase} with ${RESISTANCE_PHRASE[candMeta.resistanceProfile]}.`
    );
  }

  // 2. Load calibration / strength matching
  if (prescription.isTimed) {
    reasons.push(
      `Targets a ${prescription.targetDurationSeconds ?? 45}s controlled hold to match this slot's isometric work.`
    );
  } else if (hasOwnHistory) {
    reasons.push(
      'Uses your logged history on this movement so your working load and reps carry straight over.'
    );
  } else if (isPureBw && isBestBodyweightTier && continuity.prescription.setupLabel) {
    reasons.push(
      `Leverage matched to your strength (${continuity.prescription.setupLabel}) to keep sets in an effective hypertrophy rep range.`
    );
  } else if (isEffortMachine) {
    reasons.push(
      'Pick a moderate pin weight on Set 1—Sets 2 and 3 calibrate automatically from your effort.'
    );
  } else if (isAnchorEstimate) {
    reasons.push(
      'Starting load is estimated from your current lift and dials in automatically after Set 1.'
    );
  }

  // 3. Recovery, safety, or stability advantage
  if (isContraindicated && cautionReason) {
    reasons.push(`Heads up: matches a flagged note (${cautionReason}).`);
  } else if (sidesteppedContraindication) {
    reasons.push('Avoids the joint stress flagged in your saved training notes.');
  } else if (recoveryFriendly) {
    reasons.push(
      'Higher external stability and lower systemic fatigue suit your lower recovery day.'
    );
  } else if (highStability && currentMeta && currentMeta.stability !== 'high') {
    reasons.push(
      'Higher external stability lets you focus output on the target muscle with less joint fatigue.'
    );
  } else if (lowerAxial && !candMeta.isIsolation) {
    reasons.push('Reduces spinal and systemic fatigue while keeping high tension on the target muscle.');
  } else if (candMeta.resistanceProfile === 'lengthened' && !sameProfile && !isRelatedPattern) {
    reasons.push('Loads the muscle strongly in the stretched position to drive hypertrophy.');
  }

  // Pick a calm, truthful headline badge and optional secondary highlight tag
  const badgeLabel = recoveryFriendly
    ? 'Recovery-friendly pick'
    : sidesteppedContraindication
    ? 'Joint-friendly pick'
    : 'Recommended swap';

  const highlightTag = hasOwnHistory
    ? 'From your history'
    : location === 'travel'
    ? 'Strength-matched'
    : recoveryFriendly
    ? 'Lower fatigue'
    : diffEquip
    ? `Uses ${EQUIP_PHRASE[candidate.equipment].replace(/^a /, '')}`
    : undefined;

  const trimmedReasons = reasons.slice(0, 3);
  return {
    badgeLabel,
    highlightTag,
    reasons: trimmedReasons,
    whyRecommended: trimmedReasons.join(' '),
  };
}

/**
 * Evaluates and ranks every valid replacement exercise for `currentExercise` in `location`,
 * returning a clear top `recommended` swap with concrete coaching logic plus `otherOptions`.
 */
export function rankSwapRecommendations(
  params: RankSwapRecommendationsParams
): SwapRecommendationResult {
  const {
    currentExercise,
    exerciseCatalog,
    bodyweightEmaKg,
    location = 'gym',
    homeEquipment = ['bench', 'dumbbells', 'trx', 'pullup_bar'],
    workouts = [],
    activeOverlay = null,
    storedProgressionStates,
    athleteMemories = [],
    readinessState = 'Normal',
    goalPhase = 'Lean Bulk',
    unit = 'kg',
    excludeExerciseIds = [],
    resolveFallbackWeight,
  } = params;

  const currentDef = exerciseCatalog.find((e) => e.id === currentExercise.exerciseId);
  const targetVectorId = getMovementVectorId(currentDef || currentExercise);
  const currentMeta = currentDef ? getExerciseBiomechanicalMeta(currentDef) : null;
  const excludedSet = new Set<string>([currentExercise.exerciseId, ...excludeExerciseIds]);

  const sameFamily = exerciseCatalog.filter((ex) => {
    if (excludedSet.has(ex.id)) return false;
    if (getMovementVectorId(ex) !== targetVectorId) return false;
    return canPerformExerciseInLocation(ex, location, homeEquipment);
  });

  const related = getRelatedSwapAlternatives(
    currentDef || currentExercise,
    exerciseCatalog,
    location,
    homeEquipment,
    [...excludedSet, ...sameFamily.map((a) => a.id)]
  );

  const pool: Array<{ exercise: ExerciseDefinition; isRelatedPattern: boolean }> = [
    ...sameFamily.map((exercise) => ({ exercise, isRelatedPattern: false })),
    ...related.map((exercise) => ({ exercise, isRelatedPattern: true })),
  ];

  if (pool.length === 0) {
    return { recommended: null, otherOptions: [], allRanked: [] };
  }

  // Derive injury / contraindication / preference edges from athlete memories
  const edges = deriveContraindicationEdges(athleteMemories, exerciseCatalog);
  const avoidEdgeById = new Map<string, string>();
  const cautionEdgeById = new Map<string, string>();
  for (const edge of edges) {
    if (edge.severity === 'avoid') {
      avoidEdgeById.set(edge.to_exercise_id, edge.reason);
    } else if (!avoidEdgeById.has(edge.to_exercise_id)) {
      cautionEdgeById.set(edge.to_exercise_id, edge.reason);
    }
  }
  const currentIsFlagged =
    avoidEdgeById.has(currentExercise.exerciseId) || cautionEdgeById.has(currentExercise.exerciseId);

  // Determine the Continuity Engine's ideal preferred substitute for the selected location
  // (e.g., Flat DB Press for BB Bench at Home, or leverage-matched Feet-Elevated Push-Up in Travel)
  let continuityPreferredId: string | null = null;
  if (currentDef && location !== 'gym') {
    const locationOverlay =
      activeOverlay &&
      ((location === 'travel' && activeOverlay.activeProfileType === 'BODYWEIGHT') ||
        (location === 'home' && activeOverlay.activeProfileType !== 'BODYWEIGHT'))
        ? activeOverlay
        : createOverlayForTrainingLocation(location, homeEquipment);
    const anchorState = deriveIsolatedProgressionStateFromHistory(
      currentDef.id,
      workouts,
      storedProgressionStates,
      bodyweightEmaKg
    );
    const resolved = resolveSlotForOverlay({
      slot: {
        slotId: currentExercise.slotId ?? currentExercise.orderCode ?? currentExercise.id,
        programId: 'swap',
        workoutDayId: 'Swap',
        movementPattern: resolveMovementPattern(currentDef),
        anchorExerciseId: currentDef.id,
        targetSets: Math.max(1, currentExercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length),
        targetRepMin: currentExercise.minReps || currentDef.defaultRepRange[0],
        targetRepMax: currentExercise.maxReps || currentDef.defaultRepRange[1],
        targetRirInitial: 2,
        restSeconds: currentExercise.restSeconds ?? 120,
      },
      overlay: locationOverlay,
      exerciseCatalog,
      anchorE1rmKg: toBarbellEquivalentAnchorE1rm(anchorState, currentDef),
      userBodyweightKg: bodyweightEmaKg,
    });
    if (resolved.wasSwapped) {
      continuityPreferredId = resolved.exerciseDef.id;
    }
  }

  const ranked: RankedSwapCandidate[] = pool.map(({ exercise: cand, isRelatedPattern }) => {
    const candMeta = getExerciseBiomechanicalMeta(cand);
    const prescription = prescribeExerciseSwap({
      sourceExercise: currentExercise,
      targetDef: cand,
      workouts,
      readinessState,
      goalPhase,
      bodyweightEmaKg,
      location,
      unit,
      fallbackTargetWeightKg: resolveFallbackWeight?.(cand),
    });
    const continuity = evaluateSingleExerciseContinuitySwap({
      currentExercise,
      replacementDef: cand,
      historicalWorkouts: workouts,
      exerciseCatalog,
      storedProgressionStates,
      activeOverlay,
      userBodyweightKg: bodyweightEmaKg,
      unit,
    });

    const isContraindicated = avoidEdgeById.has(cand.id);
    const isCaution = !isContraindicated && cautionEdgeById.has(cand.id);
    const cautionReason = avoidEdgeById.get(cand.id) ?? cautionEdgeById.get(cand.id);
    const sidesteppedContraindication = currentIsFlagged && !isContraindicated && !isCaution;

    let score = 0;

    // 1. Safety / contraindication guardrail (highest weight)
    if (isContraindicated) score -= 1000;
    else if (isCaution) score -= 35;
    if (sidesteppedContraindication) score += 20;

    // 2. Movement family & muscle continuity
    score += isRelatedPattern ? 10 : 32;
    if (currentDef && cand.primaryMuscle === currentDef.primaryMuscle) {
      score += 18;
    }
    if (currentDef?.secondaryMuscles && cand.secondaryMuscles) {
      const sharedSec = cand.secondaryMuscles.filter((m) =>
        currentDef.secondaryMuscles!.includes(m)
      ).length;
      score += Math.min(6, sharedSec * 3);
    }

    // 3. Compound vs isolation role fidelity
    if (currentMeta && candMeta.isIsolation === currentMeta.isIsolation) {
      score += 12;
    }

    // 4. Environment & equipment fit
    const isBestBodyweightTier = location === 'travel' && continuityPreferredId === cand.id;
    if (location === 'travel') {
      if (isBestBodyweightTier) score += 28;
      if (!cand.requiredHomeEquipment || cand.requiredHomeEquipment.length === 0) {
        score += 12;
      }
    } else {
      if (cand.equipment !== 'bodyweight') score += 18;
      if (continuityPreferredId === cand.id) score += 16;
      const preferredOrder = PREFERRED_BIOMECHANICAL_SWAPS[currentExercise.exerciseId] ?? [];
      const prefIdx = preferredOrder.indexOf(cand.id);
      if (prefIdx >= 0) {
        score += Math.max(4, 12 - prefIdx * 3);
      }
      // At the gym, athletes most commonly swap because the current station/implement is occupied
      // or uncomfortable; slightly favoring a different implement keeps swaps immediately actionable.
      if (location === 'gym' && cand.equipment !== currentExercise.equipment) {
        score += 6;
      }
      // Prefer standardized free weights (accurate anchor prior) slightly over unfamiliar machines
      // unless Amber Shield / low recovery specifically favors high-stability machines.
      if (
        readinessState !== 'Amber Shield' &&
        (cand.equipment === 'dumbbell' || cand.equipment === 'barbell')
      ) {
        score += 5;
      }
    }

    // 5. Athlete's own logged history (calibrated working load ready to go)
    const hasOwnHistory =
      prescription.usedOwnHistory || continuity.prescription.calibrationSource === 'OWN_HISTORY';
    if (hasOwnHistory) {
      score += 14;
    }

    // 6. Biomechanical tension profile & hypertrophy efficiency
    if (currentMeta && candMeta.resistanceProfile === currentMeta.resistanceProfile) {
      score += 10;
    }
    score += Math.max(0, Math.min(8, Math.round((candMeta.sfrScore - 6) * 2)));

    // 7. Recovery-aware modulation (Amber Shield prefers high stability & lower axial load)
    if (readinessState === 'Amber Shield') {
      if (candMeta.stability === 'high') score += 16;
      if (currentMeta && candMeta.axialLoadIndex < currentMeta.axialLoadIndex) {
        score += 12;
      }
    }

    const copy = buildRecommendationReasons({
      currentExercise,
      currentDef,
      candidate: cand,
      isRelatedPattern,
      prescription,
      continuity,
      location,
      readinessState,
      currentMeta,
      candMeta,
      sidesteppedContraindication,
      isContraindicated,
      cautionReason,
      isBestBodyweightTier,
    });

    return {
      exercise: cand,
      isRelatedPattern,
      score,
      isContraindicated,
      isCaution,
      cautionReason,
      badgeLabel: copy.badgeLabel,
      highlightTag: copy.highlightTag,
      reasons: copy.reasons,
      whyRecommended: copy.whyRecommended,
      prescription,
      continuity,
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.exercise.name.localeCompare(b.exercise.name);
  });

  const [recommended, ...otherOptions] = ranked;
  return {
    recommended: recommended ?? null,
    otherOptions,
    allRanked: ranked,
  };
}
