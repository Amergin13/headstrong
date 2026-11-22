import {
  ActiveSetPrescription,
  BridgeWeekClassification,
  CalibrationSource,
  ContinuityCopyBlock,
  ContinuityRationaleKind,
  EnvironmentOverlay,
  EnvironmentProfileType,
  EquipmentAvailabilityToken,
  EquipmentClass,
  ExerciseDefinition,
  ExerciseMetadata,
  ExerciseProgressionState,
  ExerciseSession,
  HomeEquipmentTag,
  LeverageUpgradeNudge,
  MuscleGroup,
  OverlayScope,
  ProgramSlot,
  SessionContinuitySummary,
  TrainingLocation,
  WorkoutSession,
  WorkoutSet,
} from './types';
import {
  getBodyweightLoadRatio,
  HARD_SET_MAX_RIR,
  HIGH_REP_RIR_DAMPEN_THRESHOLD,
  isUnilateralExercise,
  MAX_E1RM_REPS_FROM_FAILURE,
  MAX_LOGGABLE_RIR,
  usesTwoDumbbells,
} from './e1rm';
import {
  EQUIPMENT_JUMP_EXPANSION_THRESHOLD,
  hasInvertedStraightSetRir,
} from './progressionRules';
import { localDateString } from '../utils/date';
import { formatWeight, LB_PER_KG, snapLoadKg, WeightUnit } from '../utils/units';

// ============================================================================
// Constants (Spec REQ-1 .. REQ-5)
// ============================================================================

export const OWN_HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const COARSE_JUMP_THRESHOLD = EQUIPMENT_JUMP_EXPANSION_THRESHOLD;
export const MAX_COARSE_EXPANDED_REPS = 20;
export const DEFAULT_COMPOUND_DECAY_RATE = 0.045;
export const DEFAULT_ISOLATION_DECAY_RATE = 0.03;
export const LIGHT_LOAD_ANCHOR_RATIO = 0.6;
export const CROSS_SESSION_MAX_UPWARD_E1RM_JUMP = 0.05;
export const BODYWEIGHT_LEVERAGE_UPGRADE_REP_THRESHOLD = 18;

export function clampRir(rir: number): number {
  if (!Number.isFinite(rir)) return 2;
  return Math.max(0, Math.min(MAX_LOGGABLE_RIR, Math.round(rir)));
}

/**
 * Logged-weight Epley 1RM used consistently across ExerciseProgressionState writers
 * (per-hand for paired two-dumbbell exercises, total external load for barbell/single-DB/machine/cable).
 * Dampens RIR credit above 12 reps and caps reps-from-failure at 15 to match e1rm.ts.
 */
function computeLoggedWeightEpley1rm(weightKg: number, reps: number, rir: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  const clampedRir = clampRir(rir);
  const effRir = reps > HIGH_REP_RIR_DAMPEN_THRESHOLD ? clampedRir * 0.5 : clampedRir;
  const effReps = Math.min(MAX_E1RM_REPS_FROM_FAILURE, reps + effRir);
  return Math.round(weightKg * (1 + effReps / 30) * 10) / 10;
}

/**
 * Converts an ExerciseProgressionState's logged-weight Epley 1RM into a canonical
 * barbell-equivalent 1RM for cross-exercise anchor prior transfers (Branch B / Branch C / bodyweight sizing).
 * Barbell anchors pass through 1:1; paired two-dumbbell anchors convert per-hand -> combined -> barbell equivalent.
 */
export function toBarbellEquivalentAnchorE1rm(
  anchorState: ExerciseProgressionState | null | undefined,
  anchorDef?: ExerciseDefinition
): number {
  const raw = anchorState?.estimated1rmKg ?? 0;
  if (raw <= 0) return 0;
  if (!anchorDef) return raw;
  const anchorMeta = resolveExerciseMetadata(anchorDef);
  if (anchorMeta.equipmentClass !== 'STANDARDIZED_FREE_WEIGHT') return raw;
  if (anchorDef.equipment === 'barbell') return raw;
  const totalCombinedE1rm = anchorMeta.isUnilateralPerHand ? raw * 2 : raw;
  const ratio = anchorMeta.anchorTransferRatio ?? 0.78;
  return ratio > 0 ? totalCombinedE1rm / ratio : totalCombinedE1rm;
}

function resolveEffectiveStepKg(
  equipment: ExerciseDefinition['equipment'],
  overlay: EnvironmentOverlay | null | undefined,
  unit: WeightUnit
): number {
  if (equipment === 'dumbbell') {
    const rawStep = overlay?.dumbbellStepKg;
    if (unit === 'kg') {
      // Only honor clean integer kg steps in kg mode so stale lb-derived steps (e.g. 2.268 kg / 1.134 kg)
      // never manufacture impossible fractional dumbbell weights such as 46.5 kg.
      if (rawStep != null && rawStep >= 0.99 && Math.abs(rawStep - Math.round(rawStep)) < 0.05) {
        return Math.max(1, Math.round(rawStep));
      }
      return 2;
    }
    return rawStep != null && rawStep > 0 ? rawStep : 5 / LB_PER_KG;
  }
  return unit === 'lb' ? 5 / LB_PER_KG : 2.5;
}

export function formatRirDisplay(rir: number): string {
  const c = clampRir(rir);
  return c >= MAX_LOGGABLE_RIR ? '6+' : String(c);
}

// ============================================================================
// Metadata Resolution (ExerciseMetadata)
// ============================================================================

const MOVEMENT_FAMILY_TO_PATTERN: Record<string, string> = {
  'vector-pillar-horizontal-push': 'HORIZONTAL_PRESS',
  'vector-pillar-vertical-push': 'VERTICAL_PRESS',
  'vector-pillar-horizontal-pull': 'HORIZONTAL_PULL',
  'vector-pillar-vertical-pull': 'VERTICAL_PULL',
  'vector-pillar-squat': 'KNEE_DOMINANT',
  'vector-pillar-hinge': 'HIP_HINGE',
  'vector-iso-sidedelts': 'SIDE_DELT_ISOLATION',
  'vector-iso-reardelts': 'REAR_DELT_ISOLATION',
  'vector-iso-triceps': 'TRICEP_ISOLATION',
  'vector-iso-biceps': 'BICEP_ISOLATION',
  'vector-iso-hamstrings': 'HAMSTRING_CURL',
  'vector-iso-quads': 'QUAD_EXTENSION',
  'vector-iso-calves': 'CALF_RAISE',
  'vector-iso-core': 'CORE_FLEXION',
};

const PILLAR_TO_PATTERN: Record<string, string> = {
  'Horizontal Push': 'HORIZONTAL_PRESS',
  'Vertical Push': 'VERTICAL_PRESS',
  'Horizontal Pull': 'HORIZONTAL_PULL',
  'Vertical Pull': 'VERTICAL_PULL',
  Squat: 'KNEE_DOMINANT',
  Hinge: 'HIP_HINGE',
};

/**
 * Conservative prior ratios converting a canonical barbell anchor e1RM into a first-time
 * standardized free-weight substitute e1RM (total combined load across both hands).
 */
const ANCHOR_TRANSFER_RATIOS: Record<string, number> = {
  'ex-flat-db-press': 0.78,
  'ex-db-bench-press': 0.74,
  'ex-db-floor-press': 0.74,
  'ex-db-shoulder-press': 0.78,
  'ex-arnold-press': 0.74,
  'ex-chest-supported-db-row': 0.76,
  'ex-single-arm-db-row': 0.42,
  'ex-db-rdl': 0.72,
  'ex-single-leg-db-rdl': 0.38,
  'ex-bulgarian-split-squat': 0.5,
  'ex-goblet-squat': 0.42,
  'ex-db-front-squat': 0.62,
  'ex-db-walking-lunge': 0.48,
  'ex-db-step-up': 0.45,
  'ex-db-hip-thrust': 0.48,
};

/** Ordered difficulty ladder for bodyweight variants per pattern (1 = easiest). */
const BODYWEIGHT_LEVERAGE_TIERS: Record<string, number> = {
  // Horizontal Press
  'ex-incline-pushup': 1,
  'ex-pushup': 2,
  'ex-wide-pushup': 3,
  'ex-trx-pushup': 4,
  'ex-deficit-pushup': 5,
  'ex-ring-pressup': 6,
  // Vertical Press
  'ex-dolphin-pushup': 1,
  'ex-pike-pushup': 2,
  // Horizontal Pull
  'ex-doorframe-row': 1,
  'ex-trx-inverted-row': 2,
  'ex-bodyweight-inverted-row': 3,
  // Vertical Pull
  'ex-sliding-floor-pulldown': 1,
  'ex-doorway-lat-pull': 2,
  'ex-chinup': 3,
  'ex-weighted-pullup': 4,
  // Knee Dominant
  'ex-bw-squat': 1,
  'ex-bw-split-squat': 2,
  'ex-trx-pistol-squat': 3,
  // Hip Hinge
  'ex-bw-good-morning': 1,
  'ex-single-leg-glute-bridge': 2,
  'ex-single-leg-rdl': 3,
  // Triceps
  'ex-bw-tricep-extension': 1,
  'ex-diamond-pushup': 2,
  'ex-trx-tricep-extension': 3,
  'ex-triceps-dip': 4,
  // Biceps
  'ex-doorframe-curl': 1,
  'ex-trx-bicep-curl': 2,
  'ex-underhand-bar-curl': 3,
  // Hamstring curl
  'ex-sliding-leg-curl': 1,
  'ex-hamstring-walkout': 2,
  'ex-trx-hamstring-curl': 3,
  'ex-nordic-curl': 4,
  // Calves
  'ex-bw-single-leg-calf': 1,
  'ex-slow-calf-raise': 2,
};

export function classifyEquipment(equipment: ExerciseDefinition['equipment']): EquipmentClass {
  if (equipment === 'barbell' || equipment === 'dumbbell') return 'STANDARDIZED_FREE_WEIGHT';
  if (equipment === 'bodyweight' || equipment === 'weighted_bodyweight') return 'BODYWEIGHT';
  return 'VARIABLE_MACHINE_OR_CABLE';
}

export function resolveMovementPattern(def: Pick<ExerciseDefinition, 'movementFamily' | 'pillar'>): string {
  if (def.movementFamily && MOVEMENT_FAMILY_TO_PATTERN[def.movementFamily]) {
    return MOVEMENT_FAMILY_TO_PATTERN[def.movementFamily];
  }
  return PILLAR_TO_PATTERN[def.pillar] ?? 'HORIZONTAL_PRESS';
}

function mapHomeTagToToken(tag: HomeEquipmentTag): EquipmentAvailabilityToken {
  switch (tag) {
    case 'bench':
      return 'BENCH';
    case 'dumbbells':
      return 'DUMBBELLS';
    case 'trx':
      return 'TRX';
    case 'pullup_bar':
      return 'PULLUP_BAR';
    case 'bands':
      return 'BANDS';
  }
}

export function resolveExerciseMetadata(def: ExerciseDefinition): ExerciseMetadata {
  const equipmentClass = classifyEquipment(def.equipment);
  const movementPattern = resolveMovementPattern(def);
  const isUnilateralPerHand = usesTwoDumbbells({
    equipment: def.equipment,
    exerciseId: def.id,
    name: def.name,
  });

  const requiredSet = new Set<EquipmentAvailabilityToken>();
  if (def.equipment === 'barbell') {
    requiredSet.add('BARBELL');
    if (def.id === 'ex-bench-press' || def.id === 'ex-guillotine-press') {
      requiredSet.add('BENCH');
    }
  } else if (def.equipment === 'dumbbell') {
    requiredSet.add('DUMBBELLS');
    for (const tag of def.requiredHomeEquipment ?? []) {
      requiredSet.add(mapHomeTagToToken(tag));
    }
  } else if (def.equipment === 'cable') {
    requiredSet.add('CABLE');
  } else if (def.equipment === 'machine') {
    requiredSet.add('MACHINE');
  } else {
    for (const tag of def.requiredHomeEquipment ?? []) {
      requiredSet.add(mapHomeTagToToken(tag));
    }
    if (
      def.equipment === 'weighted_bodyweight' ||
      (def.environments &&
        def.environments.length > 0 &&
        !def.environments.includes('travel') &&
        !def.environments.includes('home'))
    ) {
      requiredSet.add('BARBELL');
    }
    if (requiredSet.size === 0) {
      requiredSet.add('NONE');
    }
  }

  let anchorTransferRatio: number | undefined;
  if (equipmentClass === 'STANDARDIZED_FREE_WEIGHT') {
    if (def.equipment === 'barbell') {
      anchorTransferRatio = 1.0;
    } else if (def.id in ANCHOR_TRANSFER_RATIOS) {
      anchorTransferRatio = ANCHOR_TRANSFER_RATIOS[def.id];
    } else if (isUnilateralExercise({ exerciseId: def.id, name: def.name })) {
      anchorTransferRatio = 0.45;
    } else {
      anchorTransferRatio = 0.78;
    }
  }

  const bodyweightLoadPct =
    equipmentClass === 'BODYWEIGHT'
      ? getBodyweightLoadRatio(def.id, def.pillar)
      : undefined;

  const leverageTier =
    equipmentClass === 'BODYWEIGHT'
      ? BODYWEIGHT_LEVERAGE_TIERS[def.id] ?? 2
      : undefined;

  return {
    exerciseId: def.id,
    name: def.name,
    movementPattern,
    equipmentClass,
    equipmentRequired: Array.from(requiredSet),
    primaryMuscles: [def.primaryMuscle],
    secondaryMuscles: def.secondaryMuscles ?? [],
    anchorTransferRatio,
    bodyweightLoadPct,
    leverageTier,
    isUnilateralPerHand,
  };
}

export function deriveBodyweightSetupShort(def: Pick<ExerciseDefinition, 'id' | 'name'>): string {
  const id = def.id.toLowerCase();
  const name = def.name.toLowerCase();
  if (id.includes('deficit') || name.includes('elevated') && !name.includes('incline')) return 'Elevated';
  if (id.includes('incline') || name.includes('incline')) return 'Incline';
  if (id.includes('diamond') || name.includes('diamond')) return 'Close-grip';
  if (id.includes('wide') || name.includes('wide')) return 'Wide-grip';
  if (id.includes('trx') || id.includes('ring') || name.includes('trx') || name.includes('ring')) return 'Suspended';
  if (id.includes('pike') || name.includes('pike')) return 'Pike';
  if (id.includes('split-squat') || name.includes('bulgarian')) return 'Rear-foot elevated';
  if (id.includes('single-leg') || name.includes('single-leg')) return 'Single-leg';
  if (id.includes('inverted') || name.includes('inverted')) return 'Inverted';
  if (id.includes('chinup') || id.includes('pullup')) return 'Full hang';
  if (id.includes('pushup') || name.includes('push-up')) return 'Floor';
  return 'Bodyweight';
}

export function formatBodyweightSetupLabel(def: Pick<ExerciseDefinition, 'id' | 'name' | 'pillar'>, bwLoadPct?: number): string {
  const pct = bwLoadPct ?? getBodyweightLoadRatio(def.id, def.pillar);
  const short = deriveBodyweightSetupShort(def);
  if (pct <= 0) return short;
  return `${short} (~${Math.round(pct * 100)}% BW)`;
}

// ============================================================================
// REQ-1: Temporary Environment Overlay Resolution & Preset Builders
// ============================================================================

export function computeOverlayExpiryMs(
  scope: OverlayScope,
  nowMs: number = Date.now(),
  customUntilEpochMs?: number | null
): number | null {
  if (scope === 'CUSTOM_UNTIL_DATE' && customUntilEpochMs != null && Number.isFinite(customUntilEpochMs)) {
    return customUntilEpochMs;
  }
  const d = new Date(nowMs);
  if (scope === 'TODAY_ONLY') {
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  // WEEK_OVERRIDE: expires at end of current training week (Sunday 23:59:59.999 local)
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const daysToSunday = day === 0 ? 7 : 7 - day;
  d.setDate(d.getDate() + daysToSunday);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function createPresetOverlay(
  profileType: EnvironmentProfileType,
  scope: OverlayScope = 'TODAY_ONLY',
  options?: {
    nowMs?: number;
    maxDumbbellKg?: number | null;
    dumbbellStepKg?: number | null;
    maxSessionMinutes?: number | null;
    expiresAtEpochMs?: number | null;
    homeEquipment?: HomeEquipmentTag[];
    sourcePrompt?: string;
    label?: string;
  }
): EnvironmentOverlay {
  const nowMs = options?.nowMs ?? Date.now();
  const id = `overlay-${profileType.toLowerCase()}-${nowMs}`;

  if (profileType === 'HOME_GYM') {
    return {
      overlayId: id,
      activeProfileType: 'HOME_GYM',
      label: options?.label ?? 'Gym',
      availableEquipment: [
        'BARBELL',
        'DUMBBELLS',
        'BENCH',
        'CABLE',
        'MACHINE',
        'PULLUP_BAR',
        'TRX',
        'BANDS',
        'NONE',
      ],
      maxDumbbellKg: null,
      dumbbellStepKg: null,
      maxSessionMinutes: null,
      scope: 'TODAY_ONLY',
      expiresAtEpochMs: null,
      createdAtEpochMs: nowMs,
    };
  }

  const expiresAtEpochMs =
    options?.expiresAtEpochMs !== undefined
      ? options.expiresAtEpochMs
      : computeOverlayExpiryMs(scope, nowMs);

  if (profileType === 'HOTEL_DUMBBELLS') {
    const capSuffix = options?.maxDumbbellKg ? ` (≤${options.maxDumbbellKg} kg)` : '';
    return {
      overlayId: id,
      activeProfileType: 'HOTEL_DUMBBELLS',
      label: options?.label ?? `Hotel Dumbbells${capSuffix}`,
      availableEquipment: ['DUMBBELLS', 'BENCH', 'NONE'],
      maxDumbbellKg: options?.maxDumbbellKg ?? null,
      dumbbellStepKg: options?.dumbbellStepKg ?? 2,
      maxSessionMinutes: options?.maxSessionMinutes ?? null,
      scope,
      expiresAtEpochMs,
      sourcePrompt: options?.sourcePrompt,
      createdAtEpochMs: nowMs,
    };
  }

  if (profileType === 'BODYWEIGHT') {
    return {
      overlayId: id,
      activeProfileType: 'BODYWEIGHT',
      label: options?.label ?? 'Bodyweight / No equipment',
      availableEquipment: ['NONE'],
      maxDumbbellKg: null,
      dumbbellStepKg: null,
      maxSessionMinutes: options?.maxSessionMinutes ?? null,
      scope,
      expiresAtEpochMs,
      sourcePrompt: options?.sourcePrompt,
      createdAtEpochMs: nowMs,
    };
  }

  if (profileType === 'TIME_CONSTRAINED') {
    const mins = options?.maxSessionMinutes ?? 30;
    return {
      overlayId: id,
      activeProfileType: 'TIME_CONSTRAINED',
      label: options?.label ?? `Short on time (${mins} min)`,
      availableEquipment: [
        'BARBELL',
        'DUMBBELLS',
        'BENCH',
        'CABLE',
        'MACHINE',
        'PULLUP_BAR',
        'TRX',
        'BANDS',
        'NONE',
      ],
      maxDumbbellKg: options?.maxDumbbellKg ?? null,
      dumbbellStepKg: options?.dumbbellStepKg ?? null,
      maxSessionMinutes: mins,
      scope,
      expiresAtEpochMs,
      sourcePrompt: options?.sourcePrompt,
      createdAtEpochMs: nowMs,
    };
  }

  // CUSTOM (Home equipment setup configured in onboarding or settings)
  const tokens: EquipmentAvailabilityToken[] = ['NONE'];
  for (const tag of options?.homeEquipment ?? ['bench', 'dumbbells']) {
    const t = mapHomeTagToToken(tag);
    if (!tokens.includes(t)) tokens.push(t);
  }
  return {
    overlayId: id,
    activeProfileType: 'CUSTOM',
    label: options?.label ?? 'Home',
    availableEquipment: tokens,
    maxDumbbellKg: options?.maxDumbbellKg ?? null,
    dumbbellStepKg: options?.dumbbellStepKg ?? 2,
    maxSessionMinutes: options?.maxSessionMinutes ?? null,
    scope,
    expiresAtEpochMs,
    sourcePrompt: options?.sourcePrompt,
    createdAtEpochMs: nowMs,
  };
}

export function resolveActiveOverlay(
  overlay: EnvironmentOverlay | null | undefined,
  nowMs: number = Date.now()
): { active: EnvironmentOverlay | null; expired: boolean; expiredOverlay?: EnvironmentOverlay } {
  if (!overlay || overlay.activeProfileType === 'HOME_GYM') {
    return { active: null, expired: false };
  }
  if (overlay.expiresAtEpochMs != null && nowMs > overlay.expiresAtEpochMs) {
    return { active: null, expired: true, expiredOverlay: overlay };
  }
  return { active: overlay, expired: false };
}

export function overlayToTrainingLocation(overlay: EnvironmentOverlay | null | undefined): TrainingLocation {
  if (!overlay || overlay.activeProfileType === 'HOME_GYM') return 'gym';
  if (overlay.activeProfileType === 'BODYWEIGHT') return 'travel';
  if (overlay.activeProfileType === 'HOTEL_DUMBBELLS' || overlay.activeProfileType === 'CUSTOM') {
    return overlay.availableEquipment.includes('DUMBBELLS') ? 'home' : 'travel';
  }
  return 'gym';
}

/**
 * Maps the athlete's selected TrainingLocation ('gym' | 'home' | 'travel') onto a persistent
 * EnvironmentOverlay (no timeline/expiry — stays active until the athlete switches location back).
 * Equipment for Home comes strictly from what the athlete configured in onboarding or settings.
 */
export function createOverlayForTrainingLocation(
  location: TrainingLocation,
  homeEquipment?: HomeEquipmentTag[],
  nowMs: number = Date.now(),
  options?: {
    maxDumbbellKg?: number | null;
    dumbbellStepKg?: number | null;
    scope?: OverlayScope;
    expiresAtEpochMs?: number | null;
  }
): EnvironmentOverlay | null {
  if (location === 'gym') return null;
  const scope = options?.scope ?? 'TODAY_ONLY';
  // Location stays active until the athlete switches it back unless a caller explicitly supplies an expiry.
  const expiresAtEpochMs = options?.expiresAtEpochMs !== undefined ? options.expiresAtEpochMs : null;
  if (location === 'travel') {
    return createPresetOverlay('BODYWEIGHT', scope, {
      nowMs,
      expiresAtEpochMs,
      label: 'Bodyweight / No equipment',
    });
  }
  const tags =
    homeEquipment && homeEquipment.length > 0 ? homeEquipment : (['bench', 'dumbbells'] as HomeEquipmentTag[]);
  return createPresetOverlay('CUSTOM', scope, {
    nowMs,
    expiresAtEpochMs,
    homeEquipment: tags,
    maxDumbbellKg: options?.maxDumbbellKg ?? null,
    dumbbellStepKg: options?.dumbbellStepKg ?? null,
    label: 'Home',
  });
}

export function isExerciseCompatibleWithOverlay(
  def: ExerciseDefinition,
  overlay: EnvironmentOverlay | null | undefined
): boolean {
  if (!overlay || overlay.activeProfileType === 'HOME_GYM') return true;
  const meta = resolveExerciseMetadata(def);
  const avail = new Set<EquipmentAvailabilityToken>(overlay.availableEquipment);
  avail.add('NONE');
  return meta.equipmentRequired.every((req) => avail.has(req));
}

// ============================================================================
// REQ-1 & REQ-2C: Deterministic Slot Swapping
// ============================================================================

const PREFERRED_DUMBBELL_SWAP_FOR_ANCHOR: Record<string, string[]> = {
  'ex-bench-press': ['ex-flat-db-press', 'ex-db-bench-press', 'ex-db-floor-press'],
  'ex-guillotine-press': ['ex-db-bench-press', 'ex-flat-db-press', 'ex-db-floor-press'],
  'ex-ohp': ['ex-db-shoulder-press', 'ex-arnold-press'],
  'ex-barbell-row': ['ex-chest-supported-db-row', 'ex-single-arm-db-row'],
  'ex-reverse-bb-row': ['ex-chest-supported-db-row', 'ex-single-arm-db-row'],
  'ex-barbell-squat': ['ex-bulgarian-split-squat', 'ex-db-front-squat', 'ex-goblet-squat'],
  'ex-deadlift': ['ex-db-rdl', 'ex-single-leg-db-rdl'],
  'ex-rdl': ['ex-db-rdl', 'ex-single-leg-db-rdl'],
  'ex-tricep-pushdown': ['ex-overhead-db-extension', 'ex-db-skullcrusher'],
  'ex-cable-curl': ['ex-bicep-curl', 'ex-db-hammer-curl'],
  'ex-face-pull': ['ex-rear-delt-db-fly'],
  'ex-cable-lateral-raise': ['ex-db-lateral-raise'],
  'ex-leg-curl': ['ex-db-leg-curl'],
  'ex-standing-calf-raise': ['ex-db-calf-raise'],
};

export interface SlotResolutionResult {
  exerciseDef: ExerciseDefinition;
  metadata: ExerciseMetadata;
  wasSwapped: boolean;
  anchorDef: ExerciseDefinition;
}

export function resolveSlotForOverlay(params: {
  slot: ProgramSlot;
  overlay: EnvironmentOverlay | null | undefined;
  exerciseCatalog: ExerciseDefinition[];
  anchorE1rmKg?: number | null;
  userBodyweightKg?: number;
}): SlotResolutionResult {
  const { slot, overlay, exerciseCatalog, anchorE1rmKg, userBodyweightKg = 80 } = params;
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const anchorDef =
    exMap.get(slot.anchorExerciseId) ??
    exerciseCatalog.find((e) => resolveMovementPattern(e) === slot.movementPattern) ??
    exerciseCatalog[0];

  if (!overlay || isExerciseCompatibleWithOverlay(anchorDef, overlay)) {
    return {
      exerciseDef: anchorDef,
      metadata: resolveExerciseMetadata(anchorDef),
      wasSwapped: false,
      anchorDef,
    };
  }

  const targetPattern = slot.movementPattern || resolveMovementPattern(anchorDef);
  const compatible = exerciseCatalog.filter((e) => {
    if (e.id === anchorDef.id) return false;
    if (!isExerciseCompatibleWithOverlay(e, overlay)) return false;
    return resolveMovementPattern(e) === targetPattern;
  });

  const pool =
    compatible.length > 0
      ? compatible
      : exerciseCatalog.filter(
          (e) =>
            e.id !== anchorDef.id &&
            isExerciseCompatibleWithOverlay(e, overlay) &&
            e.pillar === anchorDef.pillar &&
            Boolean(e.isIsolation) === Boolean(anchorDef.isIsolation)
        );

  if (pool.length === 0) {
    return {
      exerciseDef: anchorDef,
      metadata: resolveExerciseMetadata(anchorDef),
      wasSwapped: false,
      anchorDef,
    };
  }

  // 1) If dumbbells are available, check explicit biomechanical priority first
  if (overlay.availableEquipment.includes('DUMBBELLS')) {
    const preferredIds = PREFERRED_DUMBBELL_SWAP_FOR_ANCHOR[anchorDef.id] ?? [];
    for (const prefId of preferredIds) {
      const match = pool.find((e) => e.id === prefId);
      if (match) {
        return {
          exerciseDef: match,
          metadata: resolveExerciseMetadata(match),
          wasSwapped: true,
          anchorDef,
        };
      }
    }
    const freeWeightCandidates = pool.filter((e) => classifyEquipment(e.equipment) === 'STANDARDIZED_FREE_WEIGHT');
    if (freeWeightCandidates.length > 0) {
      const pick = freeWeightCandidates[0];
      return {
        exerciseDef: pick,
        metadata: resolveExerciseMetadata(pick),
        wasSwapped: true,
        anchorDef,
      };
    }
  }

  // 2) Bodyweight auto-selection (REQ-2C): pick leverage_tier putting predicted RTF closest to 8–18 reps
  const bwCandidates = pool.filter((e) => classifyEquipment(e.equipment) === 'BODYWEIGHT');
  if (bwCandidates.length > 0) {
    const safeBw = userBodyweightKg > 0 ? userBodyweightKg : 80;
    const anchorE1rm = anchorE1rmKg && anchorE1rmKg > 0 ? anchorE1rmKg : 0;

    if (anchorE1rm > 0) {
      const scored = bwCandidates.map((cand) => {
        const meta = resolveExerciseMetadata(cand);
        const pct = meta.bodyweightLoadPct ?? getBodyweightLoadRatio(cand.id, cand.pillar);
        const effLoad = safeBw * pct;
        const predRtf = effLoad > 0 && anchorE1rm > effLoad ? 30 * (anchorE1rm / effLoad - 1) : 6;
        // Distance to the [8, 18] hypertrophy rep zone
        const zoneDistance = predRtf < 8 ? 8 - predRtf : predRtf > 18 ? predRtf - 18 : 0;
        const midDistance = Math.abs(predRtf - 13);
        const tier = meta.leverageTier ?? 2;
        return { cand, meta, zoneDistance, midDistance, tier };
      });
      scored.sort((a, b) => {
        if (Math.abs(a.zoneDistance - b.zoneDistance) > 0.01) return a.zoneDistance - b.zoneDistance;
        if (Math.abs(a.midDistance - b.midDistance) > 0.01) return a.midDistance - b.midDistance;
        return b.tier - a.tier;
      });
      return {
        exerciseDef: scored[0].cand,
        metadata: scored[0].meta,
        wasSwapped: true,
        anchorDef,
      };
    }

    // No anchor e1RM yet: pick a sensible mid-tier bodyweight variant
    const ordered = [...bwCandidates].sort(
      (a, b) => (resolveExerciseMetadata(a).leverageTier ?? 2) - (resolveExerciseMetadata(b).leverageTier ?? 2)
    );
    const pick = ordered[Math.min(1, ordered.length - 1)];
    return {
      exerciseDef: pick,
      metadata: resolveExerciseMetadata(pick),
      wasSwapped: true,
      anchorDef,
    };
  }

  // 3) Fallback: first compatible replacement (e.g. machine or cable)
  const pick = pool[0];
  return {
    exerciseDef: pick,
    metadata: resolveExerciseMetadata(pick),
    wasSwapped: true,
    anchorDef,
  };
}

// ============================================================================
// REQ-2: Anchor-Based Set-1 Prior Routing (4-Branch Decision Tree)
// ============================================================================

export interface SlotPrescriptionOutput {
  sets: ActiveSetPrescription[];
  calibrationSource: CalibrationSource;
  rationaleKind?: ContinuityRationaleKind;
  coarseJumpPct?: number;
  setupLabel?: string;
  bodyweightLoadPct?: number;
  isLightLoadTightened?: boolean;
  copy?: ContinuityCopyBlock;
}

function buildMonotonicRirs(setCount: number, initialRir: number, isLightLoadTightened: boolean): number[] {
  const count = Math.max(1, setCount);
  if (isLightLoadTightened) {
    // 0–1 RIR schedule (e.g., 3 sets -> [1, 1, 0], 2 sets -> [1, 0], 4 sets -> [1, 1, 0, 0])
    if (count === 1) return [0];
    return Array.from({ length: count }, (_, idx) => (idx >= Math.ceil(count / 2) ? 0 : 1));
  }
  const start = clampRir(initialRir);
  const end = Math.max(0, start - 1);
  if (count === 1) return [start];
  return Array.from({ length: count }, (_, idx) => {
    if (idx === count - 1) return end;
    return start;
  });
}

function solveFatigueDecayedReps(params: {
  e1rmFresh: number;
  weightKg: number;
  setIndexZeroBased: number;
  targetRir: number;
  decayRate: number;
  minFloor?: number;
  maxCap?: number;
}): number {
  const { e1rmFresh, weightKg, setIndexZeroBased, targetRir, decayRate, minFloor = 1, maxCap = 25 } = params;
  if (weightKg <= 0 || e1rmFresh <= 0) return minFloor;
  const e1rmK = e1rmFresh * Math.pow(1 - decayRate, setIndexZeroBased);
  const raw = 30 * (e1rmK / weightKg - 1) - clampRir(targetRir);
  return Math.max(minFloor, Math.min(maxCap, Math.round(raw)));
}

export function prescribeSet1WithAnchorPrior(params: {
  slot: ProgramSlot;
  targetDef: ExerciseDefinition;
  anchorDef?: ExerciseDefinition;
  targetState?: ExerciseProgressionState | null;
  anchorState?: ExerciseProgressionState | null;
  overlay?: EnvironmentOverlay | null;
  userBodyweightKg?: number;
  nowMs?: number;
  unit?: WeightUnit;
}): SlotPrescriptionOutput {
  const {
    slot,
    targetDef,
    anchorDef,
    targetState,
    anchorState,
    overlay,
    userBodyweightKg = 80,
    nowMs = Date.now(),
    unit = 'kg',
  } = params;

  const meta = resolveExerciseMetadata(targetDef);
  const setCount = Math.max(1, slot.targetSets);
  const initialRir = clampRir(slot.targetRirInitial);
  const decayRate = targetDef.isIsolation ? DEFAULT_ISOLATION_DECAY_RATE : DEFAULT_COMPOUND_DECAY_RATE;
  const stepKg = resolveEffectiveStepKg(targetDef.equipment, overlay, unit);
  const isSameAsAnchor = Boolean(anchorDef && anchorDef.id === targetDef.id);

  // -------------------------------------------------------------------------
  // Branch A — Existing Exercise History within 90 days (or same-exercise history
  // when the lift was not swapped, so older own history never suffers a 0.74x penalty)
  // -------------------------------------------------------------------------
  const hasOwnHistory = Boolean(
    targetState &&
      targetState.lastLoggedAt != null &&
      (nowMs - targetState.lastLoggedAt <= OWN_HISTORY_WINDOW_MS || isSameAsAnchor) &&
      (meta.equipmentClass === 'BODYWEIGHT' ||
        (targetState.lastWorkingWeightKg != null && targetState.lastWorkingWeightKg > 0))
  );

  if (hasOwnHistory && targetState) {
    if (meta.equipmentClass === 'BODYWEIGHT') {
      const bwPct = meta.bodyweightLoadPct ?? getBodyweightLoadRatio(targetDef.id, targetDef.pillar);
      const setupLabel = formatBodyweightSetupLabel(targetDef, bwPct);
      const baseReps = targetState.lastWorkingReps ?? slot.targetRepMin;
      const rirs = buildMonotonicRirs(setCount, initialRir, false);
      const sets: ActiveSetPrescription[] = Array.from({ length: setCount }, (_, idx) => {
        const repTarget = Math.max(slot.targetRepMin, Math.round(baseReps * Math.pow(1 - decayRate, idx)));
        return {
          setNumber: idx + 1,
          suggestedWeightKg: null,
          isWeightEstimated: false,
          setupLabel,
          targetRepsMin: repTarget,
          targetRepsMax: Math.max(repTarget, slot.targetRepMax),
          targetRir: rirs[idx],
          calibrationSource: 'OWN_HISTORY',
        };
      });
      return {
        sets,
        calibrationSource: 'OWN_HISTORY',
        setupLabel,
        bodyweightLoadPct: bwPct,
      };
    }

    let workingWeight = snapLoadKg(targetState.lastWorkingWeightKg ?? 0, unit, targetDef.equipment);
    let repMax = slot.targetRepMax;
    let rationaleKind: ContinuityRationaleKind | undefined;
    let coarseJumpPct: number | undefined;

    if (
      targetDef.equipment === 'dumbbell' &&
      overlay?.maxDumbbellKg != null &&
      workingWeight > overlay.maxDumbbellKg
    ) {
      workingWeight = Math.max(stepKg, Math.floor(overlay.maxDumbbellKg / stepKg) * stepKg);
      if (unit === 'kg') workingWeight = snapLoadKg(workingWeight, 'kg', 'dumbbell');
      const coarse = evaluateCoarseJumpRepExpansion({
        currentWeightKg: workingWeight,
        nextAvailableWeightKg: null,
        maxDumbbellKg: overlay.maxDumbbellKg,
        currentRepMin: slot.targetRepMin,
        currentRepMax: slot.targetRepMax,
        stepKg,
      });
      if (coarse.expanded) {
        repMax = coarse.expandedRepMax;
        rationaleKind = 'COARSE_JUMP_EXPANDED';
        coarseJumpPct = coarse.jumpPct;
      }
    }

    const rirs = buildMonotonicRirs(setCount, initialRir, false);
    const baseReps = targetState.lastWorkingReps ?? slot.targetRepMin;
    const sets: ActiveSetPrescription[] = Array.from({ length: setCount }, (_, idx) => {
      const repFloor = Math.max(slot.targetRepMin, Math.min(repMax, baseReps));
      return {
        setNumber: idx + 1,
        suggestedWeightKg: workingWeight,
        isWeightEstimated: false,
        setupLabel: null,
        targetRepsMin: idx === 0 ? repFloor : Math.max(slot.targetRepMin, repFloor - idx),
        targetRepsMax: repMax,
        targetRir: rirs[idx],
        calibrationSource: 'OWN_HISTORY',
      };
    });

    return {
      sets,
      calibrationSource: 'OWN_HISTORY',
      rationaleKind,
      coarseJumpPct,
      copy: rationaleKind
        ? buildContinuityCopy(rationaleKind, {
            coarseJumpPct,
            unit,
          })
        : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Branch B — Standardized Free-Weight Prior (ANCHOR_PRIOR)
  // -------------------------------------------------------------------------
  if (
    meta.equipmentClass === 'STANDARDIZED_FREE_WEIGHT' &&
    anchorState?.estimated1rmKg != null &&
    anchorState.estimated1rmKg > 0
  ) {
    const rTarget = (slot.targetRepMin + slot.targetRepMax) / 2;
    const targetEpleyDivisor = 1 + Math.min(MAX_E1RM_REPS_FROM_FAILURE, rTarget + initialRir) / 30;
    let rawPerHand: number;
    let perUnitPriorE1rm: number;
    if (isSameAsAnchor) {
      perUnitPriorE1rm = anchorState.estimated1rmKg;
      rawPerHand = perUnitPriorE1rm / targetEpleyDivisor;
    } else {
      const canonicalBarbellAnchorE1rm = toBarbellEquivalentAnchorE1rm(anchorState, anchorDef);
      const transferRatio = meta.anchorTransferRatio ?? 0.78;
      const priorTotalE1rm = canonicalBarbellAnchorE1rm * transferRatio;
      const totalLoad = priorTotalE1rm / targetEpleyDivisor;
      rawPerHand = meta.isUnilateralPerHand ? totalLoad / 2 : totalLoad;
      perUnitPriorE1rm = meta.isUnilateralPerHand ? priorTotalE1rm / 2 : priorTotalE1rm;
    }

    // Round DOWN to nearest available gym increment
    let suggested = Math.max(stepKg, Math.floor(rawPerHand / stepKg) * stepKg);
    if (unit === 'kg' && targetDef.equipment === 'dumbbell') {
      suggested = Math.max(1, Math.round(suggested));
    }
    let repMax = slot.targetRepMax;
    let rationaleKind: ContinuityRationaleKind = 'ANCHOR_PRIOR';
    let coarseJumpPct: number | undefined;

    if (targetDef.equipment === 'dumbbell' && overlay?.maxDumbbellKg != null && suggested > overlay.maxDumbbellKg) {
      suggested = Math.max(stepKg, Math.floor(overlay.maxDumbbellKg / stepKg) * stepKg);
      if (unit === 'kg') suggested = Math.max(1, Math.round(suggested));
      const coarse = evaluateCoarseJumpRepExpansion({
        currentWeightKg: suggested,
        nextAvailableWeightKg: null,
        maxDumbbellKg: overlay.maxDumbbellKg,
        currentRepMin: slot.targetRepMin,
        currentRepMax: slot.targetRepMax,
        stepKg,
      });
      if (coarse.expanded) {
        repMax = coarse.expandedRepMax;
        rationaleKind = 'COARSE_JUMP_EXPANDED';
        coarseJumpPct = coarse.jumpPct;
      }
    }

    const rirs = buildMonotonicRirs(setCount, initialRir, false);

    const sets: ActiveSetPrescription[] = [];
    for (let idx = 0; idx < setCount; idx++) {
      const rirK = rirs[idx];
      let targetReps =
        idx === 0
          ? Math.round(rTarget)
          : solveFatigueDecayedReps({
              e1rmFresh: perUnitPriorE1rm,
              weightKg: suggested,
              setIndexZeroBased: idx,
              targetRir: rirK,
              decayRate,
              minFloor: Math.max(4, slot.targetRepMin - 2),
              maxCap: repMax,
            });
      if (idx > 0) {
        const prev = sets[idx - 1];
        if (targetReps > prev.targetRepsMin) targetReps = prev.targetRepsMin;
        if (targetReps === prev.targetRepsMin && rirK > prev.targetRir) {
          // Never inverted RIR
        }
      }
      sets.push({
        setNumber: idx + 1,
        suggestedWeightKg: suggested,
        isWeightEstimated: true,
        setupLabel: null,
        targetRepsMin: idx === 0 ? slot.targetRepMin : Math.min(slot.targetRepMin, targetReps),
        targetRepsMax: idx === 0 ? repMax : Math.max(targetReps, Math.min(repMax, sets[idx - 1].targetRepsMax)),
        targetRir: rirK,
        calibrationSource: 'ANCHOR_PRIOR',
      });
    }

    return {
      sets,
      calibrationSource: 'ANCHOR_PRIOR',
      rationaleKind,
      coarseJumpPct,
      copy: buildContinuityCopy(rationaleKind, {
        anchorName: anchorDef?.name ?? 'Barbell anchor',
        anchorWeightKg: anchorState.lastWorkingWeightKg ?? undefined,
        coarseJumpPct,
        unit,
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Branch C — Bodyweight Leverage & Effort Shift (BODYWEIGHT)
  // -------------------------------------------------------------------------
  if (meta.equipmentClass === 'BODYWEIGHT') {
    const bwPct = meta.bodyweightLoadPct ?? getBodyweightLoadRatio(targetDef.id, targetDef.pillar);
    const safeBw = userBodyweightKg > 0 ? userBodyweightKg : 80;
    const effectiveLoad = safeBw * bwPct;
    const anchorE1rm = toBarbellEquivalentAnchorE1rm(anchorState, anchorDef);
    const isLightLoadTightened =
      anchorE1rm > 0 && effectiveLoad > 0 && effectiveLoad < LIGHT_LOAD_ANCHOR_RATIO * anchorE1rm;

    const rirs = buildMonotonicRirs(setCount, initialRir, isLightLoadTightened);
    const setupLabel = formatBodyweightSetupLabel(targetDef, bwPct);

    const predictedSet1Reps =
      anchorE1rm > effectiveLoad && effectiveLoad > 0
        ? Math.max(
            slot.targetRepMin,
            Math.min(MAX_COARSE_EXPANDED_REPS, Math.round(30 * (anchorE1rm / effectiveLoad - 1) - rirs[0]))
          )
        : Math.max(slot.targetRepMin, 10);

    const sets: ActiveSetPrescription[] = [];
    for (let idx = 0; idx < setCount; idx++) {
      const repEst =
        idx === 0
          ? predictedSet1Reps
          : Math.max(
              Math.max(6, slot.targetRepMin),
              Math.min(sets[idx - 1].targetRepsMin, Math.round(predictedSet1Reps * Math.pow(1 - decayRate, idx)))
            );
      sets.push({
        setNumber: idx + 1,
        suggestedWeightKg: null,
        isWeightEstimated: false,
        setupLabel,
        targetRepsMin: repEst,
        targetRepsMax: Math.max(repEst, Math.min(MAX_COARSE_EXPANDED_REPS, Math.max(slot.targetRepMax, repEst + 2))),
        targetRir: rirs[idx],
        calibrationSource: anchorE1rm > 0 ? 'ANCHOR_PRIOR' : 'EFFORT_ONLY',
      });
    }

    return {
      sets,
      calibrationSource: anchorE1rm > 0 ? 'ANCHOR_PRIOR' : 'EFFORT_ONLY',
      rationaleKind: 'BODYWEIGHT',
      setupLabel,
      bodyweightLoadPct: bwPct,
      isLightLoadTightened,
      copy: buildContinuityCopy('BODYWEIGHT', {
        setupLabel,
        bodyweightLoadPct: bwPct,
        isLightLoadTightened,
        primaryMuscle: targetDef.primaryMuscle,
        unit,
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Branch D — Unfamiliar Machine or Cable (VARIABLE_MACHINE_OR_CABLE)
  // -------------------------------------------------------------------------
  const rirs = buildMonotonicRirs(setCount, initialRir, false);
  const sets: ActiveSetPrescription[] = Array.from({ length: setCount }, (_, idx) => ({
    setNumber: idx + 1,
    suggestedWeightKg: null,
    isWeightEstimated: false,
    setupLabel: 'Pick moderate',
    targetRepsMin: slot.targetRepMin,
    targetRepsMax: slot.targetRepMax,
    targetRir: rirs[idx],
    calibrationSource: 'EFFORT_ONLY',
  }));

  return {
    sets,
    calibrationSource: 'EFFORT_ONLY',
    rationaleKind: 'EFFORT_ONLY',
    setupLabel: 'Pick moderate',
    copy: buildContinuityCopy('EFFORT_ONLY', { unit }),
  };
}

// ============================================================================
// REQ-3: Equipment-Aware Rep-Ceiling Expansion (Coarse-Jump Escape Hatch)
// ============================================================================

export interface CoarseJumpEvaluation {
  expanded: boolean;
  heldWeightKg: number;
  expandedRepMax: number;
  jumpPct: number;
  reason: 'COARSE_STEP' | 'MAX_DUMBBELL_CAP' | 'NONE';
  rationaleKind?: ContinuityRationaleKind;
  copy?: ContinuityCopyBlock;
}

export function evaluateCoarseJumpRepExpansion(params: {
  currentWeightKg: number;
  nextAvailableWeightKg?: number | null;
  maxDumbbellKg?: number | null;
  currentRepMin: number;
  currentRepMax: number;
  stepKg?: number;
  targetRir?: number;
  unit?: WeightUnit;
}): CoarseJumpEvaluation {
  const {
    currentWeightKg,
    nextAvailableWeightKg,
    maxDumbbellKg,
    currentRepMin,
    currentRepMax,
    stepKg = 2,
    targetRir = 2,
    unit = 'kg',
  } = params;

  if (currentWeightKg <= 0) {
    return {
      expanded: false,
      heldWeightKg: currentWeightKg,
      expandedRepMax: currentRepMax,
      jumpPct: 0,
      reason: 'NONE',
    };
  }

  const candidateNext =
    nextAvailableWeightKg !== undefined ? nextAvailableWeightKg : currentWeightKg + stepKg;

  // Case 1: Equipment cap reached (e.g. max_dumbbell_kg = 26.0) or no heavier weight exists
  const hitsCap =
    candidateNext == null ||
    (maxDumbbellKg != null && (currentWeightKg >= maxDumbbellKg - 1e-6 || candidateNext > maxDumbbellKg + 1e-6));

  if (hitsCap) {
    const expandedRepMax = Math.min(MAX_COARSE_EXPANDED_REPS, Math.max(currentRepMax + 2, 15));
    const jumpPct = Math.round((stepKg / currentWeightKg) * 100);
    return {
      expanded: true,
      heldWeightKg: currentWeightKg,
      expandedRepMax,
      jumpPct,
      reason: 'MAX_DUMBBELL_CAP',
      rationaleKind: 'COARSE_JUMP_EXPANDED',
      copy: buildContinuityCopy('COARSE_JUMP_EXPANDED', {
        coarseJumpPct: jumpPct,
        isAtEquipmentCap: true,
        maxDumbbellKg: maxDumbbellKg ?? currentWeightKg,
        unit,
      }),
    };
  }

  // Case 2: Next available step exceeds > 7.5% jump threshold
  const jumpFraction = (candidateNext - currentWeightKg) / currentWeightKg;
  if (jumpFraction > COARSE_JUMP_THRESHOLD + 1e-9) {
    const safeRir = clampRir(targetRir);
    const nextE1rm = candidateNext * (1 + (Math.max(1, currentRepMin) + safeRir) / 30);
    const neededReps = Math.ceil(30 * (nextE1rm / currentWeightKg - 1) - safeRir);
    const expandedRepMax = Math.min(
      MAX_COARSE_EXPANDED_REPS,
      Math.max(currentRepMax + 2, neededReps)
    );
    const jumpPct = Math.round(jumpFraction * 100);
    return {
      expanded: true,
      heldWeightKg: currentWeightKg,
      expandedRepMax,
      jumpPct,
      reason: 'COARSE_STEP',
      rationaleKind: 'COARSE_JUMP_EXPANDED',
      copy: buildContinuityCopy('COARSE_JUMP_EXPANDED', {
        coarseJumpPct: jumpPct,
        unit,
      }),
    };
  }

  return {
    expanded: false,
    heldWeightKg: currentWeightKg,
    expandedRepMax: currentRepMax,
    jumpPct: Math.round(jumpFraction * 100),
    reason: 'NONE',
  };
}

// ============================================================================
// REQ-3: Immediate Set-1 Recalibration & Fatigue-Accurate Inter-Set Solver
// ============================================================================

export interface Set1RecalibrationResult {
  didRecalibrate: boolean;
  prescriptions: ActiveSetPrescription[];
  estimated1rmSet1Kg: number;
  restBarStatus?: string;
  leverageUpgradeNudge?: LeverageUpgradeNudge;
  coarseJump?: CoarseJumpEvaluation;
  updatedProgressionState: ExerciseProgressionState;
}

export function findNextBodyweightLeverageUpgrade(
  currentDef: ExerciseDefinition,
  exerciseCatalog: ExerciseDefinition[]
): LeverageUpgradeNudge {
  const currentMeta = resolveExerciseMetadata(currentDef);
  const currentTier = currentMeta.leverageTier ?? 2;

  const higherCandidates = exerciseCatalog
    .filter((e) => {
      if (e.id === currentDef.id) return false;
      const m = resolveExerciseMetadata(e);
      if (m.equipmentClass !== 'BODYWEIGHT') return false;
      if (m.movementPattern !== currentMeta.movementPattern) return false;
      // Only suggest equipment-free bodyweight upgrades (no TRX/bar needed in hotel room)
      const isNoGear = m.equipmentRequired.every((t) => t === 'NONE');
      return isNoGear && (m.leverageTier ?? 0) > currentTier;
    })
    .sort((a, b) => (resolveExerciseMetadata(a).leverageTier ?? 0) - (resolveExerciseMetadata(b).leverageTier ?? 0));

  if (higherCandidates.length > 0) {
    const next = higherCandidates[0];
    const nextMeta = resolveExerciseMetadata(next);
    const setup = formatBodyweightSetupLabel(next, nextMeta.bodyweightLoadPct);
    return {
      currentExerciseId: currentDef.id,
      suggestedExerciseId: next.id,
      suggestedName: next.name,
      suggestedSetupLabel: setup,
      chipLabel: `Step up to ${next.name} on Set 2`,
      promptText: `Too light? Step up to ${next.name} on Set 2`,
    };
  }

  // Already at top catalog bodyweight leverage tier (e.g. Feet-Elevated Deficit Push-Up) -> tempo/pause step-up
  const label = currentDef.id === 'ex-deficit-pushup' ? 'Deficit + 2s Pause' : `${deriveBodyweightSetupShort(currentDef)} + 2s Pause`;
  return {
    currentExerciseId: currentDef.id,
    suggestedName: `${currentDef.name} (2s Pause)`,
    suggestedSetupLabel: `${label} (~${Math.round((currentMeta.bodyweightLoadPct ?? 0.74) * 100)}% BW)`,
    chipLabel: `Step up to ${label} on Set 2`,
    promptText: `Too light? Step up to ${label} on Set 2`,
  };
}

export function recalibrateSetsAfterSet1(params: {
  slot: ProgramSlot;
  targetDef: ExerciseDefinition;
  currentPrescriptions: ActiveSetPrescription[];
  loggedSet1: { weightKg: number | null; reps: number; rir: number };
  previousTargetState?: ExerciseProgressionState | null;
  overlay?: EnvironmentOverlay | null;
  mode?: 'REPS_FIRST';
  decayRate?: number;
  exerciseCatalog?: ExerciseDefinition[];
  userBodyweightKg?: number;
  nowMs?: number;
  unit?: WeightUnit;
}): Set1RecalibrationResult {
  const {
    slot,
    targetDef,
    currentPrescriptions,
    loggedSet1,
    previousTargetState,
    overlay,
    decayRate = targetDef.isIsolation ? DEFAULT_ISOLATION_DECAY_RATE : DEFAULT_COMPOUND_DECAY_RATE,
    exerciseCatalog = [],
    userBodyweightKg = 80,
    nowMs = Date.now(),
    unit = 'kg',
  } = params;

  const meta = resolveExerciseMetadata(targetDef);
  const rirS1 = clampRir(loggedSet1.rir);
  const repsS1 = Math.max(0, Math.round(loggedSet1.reps));
  const set1Presc = currentPrescriptions[0];

  // -------------------------------------------------------------------------
  // Bodyweight Set-1 recalibration + Leverage Upgrade Nudge (>18 reps)
  // -------------------------------------------------------------------------
  if (meta.equipmentClass === 'BODYWEIGHT') {
    const bwPct = meta.bodyweightLoadPct ?? getBodyweightLoadRatio(targetDef.id, targetDef.pillar);
    const effLoad = (userBodyweightKg > 0 ? userBodyweightKg : 80) * bwPct;
    const e1rmS1 = repsS1 > 0 && rirS1 < MAX_LOGGABLE_RIR ? effLoad * (1 + (repsS1 + rirS1) / 30) : 0;

    const leverageUpgradeNudge =
      repsS1 > BODYWEIGHT_LEVERAGE_UPGRADE_REP_THRESHOLD
        ? findNextBodyweightLeverageUpgrade(targetDef, exerciseCatalog)
        : undefined;

    const updatedSets: ActiveSetPrescription[] = currentPrescriptions.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          suggestedWeightKg: null,
          isWeightEstimated: false,
          calibrationSource: p.calibrationSource,
        };
      }
      const decayedReps = Math.max(
        Math.max(5, slot.targetRepMin),
        Math.round(repsS1 * Math.pow(1 - decayRate, idx))
      );
      return {
        ...p,
        suggestedWeightKg: null,
        isWeightEstimated: false,
        targetRepsMin: decayedReps,
        targetRepsMax: Math.max(decayedReps, p.targetRepsMax),
        targetRir: Math.min(currentPrescriptions[idx - 1].targetRir, p.targetRir),
        calibrationSource: 'SET_1_RECALIBRATED',
      };
    });

    // Enforce monotonic reps/RIR on Sets 2..N
    for (let i = 1; i < updatedSets.length; i++) {
      const prev = updatedSets[i - 1];
      const curr = updatedSets[i];
      if (curr.targetRepsMin > prev.targetRepsMin) curr.targetRepsMin = prev.targetRepsMin;
      if (curr.targetRir > prev.targetRir) curr.targetRir = prev.targetRir;
      if (curr.targetRepsMin === prev.targetRepsMin && curr.targetRir >= prev.targetRir) {
        if (prev.targetRir > 0) {
          curr.targetRir = prev.targetRir - 1;
        } else {
          curr.targetRepsMin = Math.max(1, prev.targetRepsMin - 1);
        }
      }
    }

    const updatedProgressionState = updateExerciseProgressionStateDamped(
      previousTargetState ?? null,
      {
        exerciseId: targetDef.id,
        weightKg: effLoad,
        reps: repsS1,
        rir: rirS1,
        loggedAtMs: nowMs,
      },
      {
        isFirstAnchorCalibration:
          set1Presc?.calibrationSource === 'ANCHOR_PRIOR' ||
          set1Presc?.calibrationSource === 'EFFORT_ONLY',
        storeWeightAsNull: true,
      }
    );

    return {
      didRecalibrate: updatedSets.length > 1,
      prescriptions: updatedSets,
      estimated1rmSet1Kg: Math.round(e1rmS1 * 10) / 10,
      restBarStatus: leverageUpgradeNudge
        ? leverageUpgradeNudge.promptText
        : `Dialed in from Set 1 → Sets 2–${updatedSets.length} adjusted for fatigue`,
      leverageUpgradeNudge,
      updatedProgressionState,
    };
  }

  // -------------------------------------------------------------------------
  // Loaded Set-1 recalibration (STANDARDIZED_FREE_WEIGHT / VARIABLE_MACHINE_OR_CABLE)
  // -------------------------------------------------------------------------
  const wS1 = loggedSet1.weightKg ?? 0;
  if (wS1 <= 0 || repsS1 <= 0 || currentPrescriptions.length === 0) {
    return {
      didRecalibrate: false,
      prescriptions: currentPrescriptions,
      estimated1rmSet1Kg: 0,
      updatedProgressionState: previousTargetState ?? {
        exerciseId: targetDef.id,
        lastLoggedAt: null,
        estimated1rmKg: null,
        lastWorkingWeightKg: null,
        lastWorkingReps: null,
        lastLoggedRir: null,
        calibratedSessionCount: 0,
      },
    };
  }

  const expectedRepsMid = set1Presc
    ? (set1Presc.targetRepsMin + set1Presc.targetRepsMax) / 2
    : (slot.targetRepMin + slot.targetRepMax) / 2;
  const expectedRir = set1Presc ? clampRir(set1Presc.targetRir) : clampRir(slot.targetRirInitial);
  const rtfDeviation = Math.abs(repsS1 + rirS1 - (expectedRepsMid + expectedRir));

  const wasPriorOrEffort =
    set1Presc?.calibrationSource === 'ANCHOR_PRIOR' ||
    set1Presc?.calibrationSource === 'EFFORT_ONLY';

  const shouldRecalibrate = wasPriorOrEffort || rtfDeviation >= 2;
  const e1rmS1 = wS1 * (1 + (repsS1 + rirS1) / 30);

  const updatedProgressionState = updateExerciseProgressionStateDamped(
    previousTargetState ?? null,
    {
      exerciseId: targetDef.id,
      weightKg: wS1,
      reps: repsS1,
      rir: rirS1,
      loggedAtMs: nowMs,
    },
    { isFirstAnchorCalibration: wasPriorOrEffort }
  );

  if (!shouldRecalibrate || currentPrescriptions.length <= 1) {
    return {
      didRecalibrate: false,
      prescriptions: currentPrescriptions,
      estimated1rmSet1Kg: Math.round(e1rmS1 * 10) / 10,
      updatedProgressionState,
    };
  }

  const stepKg = resolveEffectiveStepKg(targetDef.equipment, overlay, unit);
  const maxDbCap = targetDef.equipment === 'dumbbell' ? overlay?.maxDumbbellKg ?? null : null;

  // Decide working weight for Sets 2..N (REPS_FIRST: choose one clean working weight and hold it across Sets 2..N)
  let remainingWeight = wS1;
  let coarseJump: CoarseJumpEvaluation | undefined;
  let bumpedUp = false;
  let steppedDown = false;

  const beatCeilingCleanly = repsS1 > slot.targetRepMax && rirS1 >= Math.max(1, expectedRir - 1);
  const undershotSignificantly = repsS1 < slot.targetRepMin - 1 && rirS1 <= 1;

  if (beatCeilingCleanly) {
    const nextStepWeight = wS1 + stepKg;
    const capped = maxDbCap != null && nextStepWeight > maxDbCap + 1e-6;
    // Allow normal free-weight Set-1 under-estimation step-up (e.g. 26 -> 28 kg = 7.69%),
    // while blocking genuinely coarse small-dumbbell steps (>12%, e.g. 8 -> 10 kg = 25%) or hotel DB cap.
    const tooSteepForIntraBump = stepKg / wS1 > 0.12;
    if (capped || tooSteepForIntraBump) {
      coarseJump = evaluateCoarseJumpRepExpansion({
        currentWeightKg: wS1,
        nextAvailableWeightKg: capped ? null : nextStepWeight,
        maxDumbbellKg: maxDbCap,
        currentRepMin: slot.targetRepMin,
        currentRepMax: slot.targetRepMax,
        stepKg,
        targetRir: expectedRir,
        unit,
      });
      remainingWeight = wS1;
    } else {
      remainingWeight = nextStepWeight;
      bumpedUp = true;
    }
  } else if (undershotSignificantly && wS1 - stepKg >= stepKg) {
    remainingWeight = Math.max(stepKg, wS1 - stepKg);
    steppedDown = true;
  }

  const effectiveRepMax = coarseJump?.expanded ? coarseJump.expandedRepMax : slot.targetRepMax;
  const baseRirs = buildMonotonicRirs(currentPrescriptions.length, expectedRir, false);

  const nextPrescriptions: ActiveSetPrescription[] = [
    {
      ...currentPrescriptions[0],
      suggestedWeightKg: wS1,
      isWeightEstimated: false,
      setupLabel: null,
    },
  ];

  for (let idx = 1; idx < currentPrescriptions.length; idx++) {
    const rirK = Math.min(baseRirs[idx - 1], baseRirs[idx]);
    const e1rmK = e1rmS1 * Math.pow(1 - decayRate, idx);
    let solvedReps = Math.max(
      4,
      Math.min(MAX_COARSE_EXPANDED_REPS, Math.round(30 * (e1rmK / remainingWeight - 1) - rirK))
    );

    // Enforce physiological honesty across fixed-load Sets 2..N:
    // Never flat weight + flat reps + higher (or equal after decay) RIR on Set k+1!
    let finalRir = rirK;
    const prev = nextPrescriptions[idx - 1];
    const sameWeightAsPrev =
      prev.suggestedWeightKg != null && Math.abs(prev.suggestedWeightKg - remainingWeight) <= 0.05;

    if (sameWeightAsPrev) {
      const prevRepsRef = idx === 1 ? repsS1 : prev.targetRepsMin;
      const prevRirRef = idx === 1 ? rirS1 : prev.targetRir;
      if (solvedReps > prevRepsRef) {
        solvedReps = prevRepsRef;
      }
      if (finalRir > prevRirRef) {
        finalRir = prevRirRef;
      }
      if (solvedReps === prevRepsRef && finalRir >= prevRirRef) {
        if (prevRirRef > 0) {
          finalRir = prevRirRef - 1;
        } else {
          solvedReps = Math.max(1, prevRepsRef - 1);
        }
      }
    } else if (idx > 1) {
      // Compare with previous recalibrated set
      if (solvedReps > prev.targetRepsMin) solvedReps = prev.targetRepsMin;
      if (finalRir > prev.targetRir) finalRir = prev.targetRir;
    }

    nextPrescriptions.push({
      setNumber: idx + 1,
      suggestedWeightKg: remainingWeight,
      isWeightEstimated: false,
      setupLabel: null,
      targetRepsMin: solvedReps,
      targetRepsMax: Math.max(solvedReps, Math.min(effectiveRepMax, Math.max(slot.targetRepMax, solvedReps))),
      targetRir: finalRir,
      calibrationSource: 'SET_1_RECALIBRATED',
    });
  }

  const formattedRemaining = formatWeight(remainingWeight, unit);
  let restBarStatus: string;
  if (bumpedUp) {
    restBarStatus = `Dialed in from Set 1 → bumped Set 2 to ${formattedRemaining} (saved for future trips)`;
  } else if (steppedDown) {
    restBarStatus = `Dialed in from Set 1 → adjusted Set 2 to ${formattedRemaining} to keep reps crisp`;
  } else if (coarseJump?.expanded) {
    restBarStatus = `Dialed in from Set 1 → holding ${formattedRemaining}, targeting up to ${effectiveRepMax} reps`;
  } else {
    const set2Reps = nextPrescriptions[1]?.targetRepsMin ?? slot.targetRepMin;
    restBarStatus = `Dialed in from Set 1 → Set 2 set to ${formattedRemaining} × ${set2Reps} (saved for future trips)`;
  }

  return {
    didRecalibrate: true,
    prescriptions: nextPrescriptions,
    estimated1rmSet1Kg: Math.round(e1rmS1 * 10) / 10,
    restBarStatus,
    coarseJump,
    updatedProgressionState,
  };
}

// ============================================================================
// REQ-3: RIR Clamping & Cross-Session Outlier Damping
// ============================================================================

export function updateExerciseProgressionStateDamped(
  prevState: ExerciseProgressionState | null | undefined,
  loggedSet: {
    exerciseId: string;
    weightKg: number;
    reps: number;
    rir: number;
    loggedAtMs?: number;
  },
  options?: {
    isFirstAnchorCalibration?: boolean;
    incrementSessionCount?: boolean;
    storeWeightAsNull?: boolean;
  }
): ExerciseProgressionState {
  const clampedRir = clampRir(loggedSet.rir);
  const loggedAt = loggedSet.loggedAtMs ?? Date.now();
  const prevCount = prevState?.calibratedSessionCount ?? 0;
  const prevE1rm = prevState?.estimated1rmKg ?? null;
  const shouldBumpSessionCount = options?.incrementSessionCount ?? true;

  // RIR >= 6 ("6+") is excluded from high-precision 1RM estimation
  if (clampedRir >= MAX_LOGGABLE_RIR || loggedSet.weightKg <= 0 || loggedSet.reps <= 0) {
    return {
      exerciseId: loggedSet.exerciseId,
      lastLoggedAt: loggedAt,
      estimated1rmKg: prevE1rm,
      lastWorkingWeightKg: options?.storeWeightAsNull ? null : loggedSet.weightKg,
      lastWorkingReps: loggedSet.reps,
      lastLoggedRir: clampedRir,
      calibratedSessionCount: prevCount,
    };
  }

  const rawE1rm = computeLoggedWeightEpley1rm(loggedSet.weightKg, loggedSet.reps, clampedRir);
  let nextE1rm: number;

  const isEstablishedLift =
    prevCount >= 1 &&
    prevE1rm != null &&
    prevE1rm > 0 &&
    !options?.isFirstAnchorCalibration;

  if (isEstablishedLift && prevE1rm != null) {
    // Reduce update weighting by 50% when logged_reps > 12 (RIR error rises sharply above 12 reps)
    const updateWeight = loggedSet.reps > 12 ? 0.5 : 1.0;
    const weightedCandidate = prevE1rm + (rawE1rm - prevE1rm) * updateWeight;
    const maxAllowedUpward = prevE1rm * (1 + CROSS_SESSION_MAX_UPWARD_E1RM_JUMP);
    if (weightedCandidate > maxAllowedUpward) {
      // Floor to 1 decimal so post-rounding value never exceeds +5.0%
      nextE1rm = Math.floor(maxAllowedUpward * 10) / 10;
    } else {
      nextE1rm = Math.round(weightedCandidate * 10) / 10;
    }
  } else {
    // First-time ANCHOR_PRIOR / EFFORT_ONLY calibration bypasses +5% cap to freely correct conservative priors
    nextE1rm = Math.round(rawE1rm * 10) / 10;
  }

  return {
    exerciseId: loggedSet.exerciseId,
    lastLoggedAt: loggedAt,
    estimated1rmKg: nextE1rm,
    lastWorkingWeightKg: options?.storeWeightAsNull ? null : loggedSet.weightKg,
    lastWorkingReps: loggedSet.reps,
    lastLoggedRir: clampedRir,
    calibratedSessionCount: shouldBumpSessionCount ? prevCount + 1 : Math.max(1, prevCount),
  };
}

// ============================================================================
// REQ-4: Live Fractional Muscle Volume Accounting Across All Equipment Modes
// ============================================================================

export type EquipmentToolBucket = 'barbell' | 'dumbbell' | 'bodyweight' | 'machineCable';

export interface MuscleVolumeWithTools {
  total: number;
  direct: number;
  indirect: number;
  byTool: Record<EquipmentToolBucket, number>;
}

export function classifyToolBucket(equipment: ExerciseDefinition['equipment']): EquipmentToolBucket {
  if (equipment === 'barbell') return 'barbell';
  if (equipment === 'dumbbell') return 'dumbbell';
  if (equipment === 'bodyweight' || equipment === 'weighted_bodyweight') return 'bodyweight';
  return 'machineCable';
}

export function calculateFractionalVolumeByEquipment(
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  options?: {
    fromDate?: string;
    toDate?: string;
    activeSession?: WorkoutSession | null;
    maxRir?: number;
  }
): Record<string, MuscleVolumeWithTools> {
  const maxRir = options?.maxRir ?? HARD_SET_MAX_RIR;
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const result: Record<string, MuscleVolumeWithTools> = {};

  const credit = (
    muscle: string,
    amount: number,
    isDirect: boolean,
    bucket: EquipmentToolBucket
  ) => {
    const entry = result[muscle] ?? {
      total: 0,
      direct: 0,
      indirect: 0,
      byTool: { barbell: 0, dumbbell: 0, bodyweight: 0, machineCable: 0 },
    };
    if (isDirect) entry.direct += amount;
    else entry.indirect += amount;
    entry.total += amount;
    entry.byTool[bucket] += amount;
    result[muscle] = entry;
  };

  const sessions = options?.activeSession
    ? [options.activeSession, ...workouts.filter((w) => w.id !== options.activeSession?.id)]
    : workouts;

  for (const w of sessions) {
    if (options?.fromDate && w.date < options.fromDate) continue;
    if (options?.toDate && w.date > options.toDate) continue;
    for (const ex of w.exercises) {
      const def = exMap.get(ex.exerciseId);
      const bucket = classifyToolBucket(def?.equipment ?? ex.equipment);
      const workingCount = ex.sets.filter((s) => {
        if (!s.completed) return false;
        if (s.isWarmup || s.setType === 'warmup') return false;
        const rir = s.actualRir ?? s.targetRir ?? 2;
        return rir <= maxRir;
      }).length;
      if (workingCount === 0) continue;

      if (def) {
        const primary = def.primaryMuscle;
        if (primary === 'Side Delts') {
          credit('SideDelts', workingCount, true, bucket);
          credit('Side Delts', workingCount, true, bucket);
          credit('Shoulders', workingCount, true, bucket);
        } else if (primary === 'Rear Delts') {
          credit('RearDelts', workingCount, true, bucket);
          credit('Rear Delts', workingCount, true, bucket);
          credit('Shoulders', workingCount, true, bucket);
        } else if (primary === 'Front Delts') {
          credit('FrontDelts', workingCount, true, bucket);
          credit('Front Delts', workingCount, true, bucket);
          credit('Shoulders', workingCount, true, bucket);
        } else if (primary === 'Shoulders') {
          credit('Shoulders', workingCount, true, bucket);
          credit('FrontDelts', workingCount, true, bucket);
          credit('Front Delts', workingCount, true, bucket);
          credit('SideDelts', workingCount * 0.5, false, bucket);
          credit('Side Delts', workingCount * 0.5, false, bucket);
        } else {
          credit(primary, workingCount, true, bucket);
        }

        for (const sec of def.secondaryMuscles ?? []) {
          const half = workingCount * 0.5;
          if (sec === 'Side Delts') {
            credit('SideDelts', half, false, bucket);
            credit('Side Delts', half, false, bucket);
          } else if (sec === 'Rear Delts') {
            credit('RearDelts', half, false, bucket);
            credit('Rear Delts', half, false, bucket);
          } else if (sec === 'Shoulders') {
            credit('Shoulders', half, false, bucket);
            credit('FrontDelts', half, false, bucket);
            credit('Front Delts', half, false, bucket);
          } else {
            credit(sec, half, false, bucket);
          }
        }
      } else {
        if (ex.pillar === 'Horizontal Push') credit('Chest', workingCount, true, bucket);
        else if (ex.pillar === 'Vertical Push') credit('Shoulders', workingCount, true, bucket);
        else if (ex.pillar === 'Horizontal Pull' || ex.pillar === 'Vertical Pull') credit('Back', workingCount, true, bucket);
        else if (ex.pillar === 'Squat') credit('Quads', workingCount, true, bucket);
        else if (ex.pillar === 'Hinge') credit('Hamstrings', workingCount, true, bucket);
      }
    }
  }

  // Round cleanly to nearest 0.5
  for (const key of Object.keys(result)) {
    const e = result[key];
    e.direct = Math.round(e.direct * 2) / 2;
    e.indirect = Math.round(e.indirect * 2) / 2;
    e.total = Math.round((e.direct + e.indirect) * 2) / 2;
    e.byTool.barbell = Math.round(e.byTool.barbell * 2) / 2;
    e.byTool.dumbbell = Math.round(e.byTool.dumbbell * 2) / 2;
    e.byTool.bodyweight = Math.round(e.byTool.bodyweight * 2) / 2;
    e.byTool.machineCable = Math.round(e.byTool.machineCable * 2) / 2;
  }

  return result;
}

// ============================================================================
// REQ-5: Clean Home-Gym Re-Entry & Travel Bridge Classification
// ============================================================================

export function classifyTravelBridgeWeeks(params: {
  anchorExerciseId: string;
  slotId?: string;
  movementPattern?: string;
  workouts: WorkoutSession[];
  exerciseCatalog: ExerciseDefinition[];
  weekWindows: { start: string; end: string }[];
}): BridgeWeekClassification[] {
  const { anchorExerciseId, slotId, movementPattern, workouts, exerciseCatalog, weekWindows } = params;
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const anchorDef = exMap.get(anchorExerciseId);
  const resolvedPattern = movementPattern ?? (anchorDef ? resolveMovementPattern(anchorDef) : undefined);

  return weekWindows.map((win) => {
    const inWeek = workouts.filter(
      (w) => w.completed && w.date >= win.start && w.date <= win.end
    );

    let anchorSetCount = 0;
    let substituteSetCount = 0;
    const substituteNames = new Set<string>();

    for (const w of inWeek) {
      for (const ex of w.exercises) {
        const workingSets = ex.sets.filter(
          (s) => s.completed && !s.isWarmup && s.setType !== 'warmup'
        ).length;
        if (workingSets === 0) continue;

        if (ex.exerciseId === anchorExerciseId) {
          anchorSetCount += workingSets;
        } else {
          const def = exMap.get(ex.exerciseId);
          const sameSlot = Boolean(slotId && ex.slotId === slotId);
          const sameAnchorRef = ex.anchorExerciseId === anchorExerciseId;
          const samePattern = Boolean(
            resolvedPattern &&
              def &&
              resolveMovementPattern(def) === resolvedPattern
          );
          if (sameSlot || sameAnchorRef || samePattern) {
            substituteSetCount += workingSets;
            substituteNames.add(ex.name);
          }
        }
      }
    }

    if (anchorSetCount > 0) {
      return {
        weekStart: win.start,
        weekEnd: win.end,
        status: 'LOGGED_ANCHOR',
        substituteExerciseNames: [],
        substituteSetCount: 0,
      };
    }

    if (substituteSetCount > 0) {
      return {
        weekStart: win.start,
        weekEnd: win.end,
        status: 'BRIDGE_WEEK',
        substituteExerciseNames: Array.from(substituteNames),
        substituteSetCount,
      };
    }

    return {
      weekStart: win.start,
      weekEnd: win.end,
      status: 'MISSED_WEEK',
      substituteExerciseNames: [],
      substituteSetCount: 0,
    };
  });
}

export interface ReentryPrescriptionResult {
  isBridgeReentry: boolean;
  bridgeWeekCount: number;
  lastGymWeightKg: number | null;
  lastGymReps: number | null;
  lastGymDate: string | null;
  reentryFromLabel?: string;
  welcomeCue?: string;
}

export function buildReentryPrescription(params: {
  anchorExerciseId: string;
  slotId?: string;
  workouts: WorkoutSession[];
  exerciseCatalog: ExerciseDefinition[];
  unit?: WeightUnit;
}): ReentryPrescriptionResult {
  const { anchorExerciseId, slotId, workouts, exerciseCatalog, unit = 'kg' } = params;
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const anchorDef = exMap.get(anchorExerciseId);
  const pattern = anchorDef ? resolveMovementPattern(anchorDef) : undefined;

  const completed = workouts
    .filter((w) => w.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  let lastAnchorWorkout: WorkoutSession | null = null;
  let lastAnchorEx: ExerciseSession | null = null;
  for (const w of completed) {
    const match = w.exercises.find(
      (e) =>
        e.exerciseId === anchorExerciseId &&
        e.sets.some((s) => s.completed && !s.isWarmup && s.setType !== 'warmup')
    );
    if (match) {
      lastAnchorWorkout = w;
      lastAnchorEx = match;
      break;
    }
  }

  if (!lastAnchorWorkout || !lastAnchorEx) {
    return {
      isBridgeReentry: false,
      bridgeWeekCount: 0,
      lastGymWeightKg: null,
      lastGymReps: null,
      lastGymDate: null,
    };
  }

  // Find substitute sessions logged AFTER lastAnchorWorkout.date
  const bridgeWorkouts = completed.filter((w) => {
    if (w.date <= lastAnchorWorkout!.date) return false;
    return w.exercises.some((ex) => {
      if (ex.exerciseId === anchorExerciseId) return false;
      const hasSets = ex.sets.some((s) => s.completed && !s.isWarmup && s.setType !== 'warmup');
      if (!hasSets) return false;
      const def = exMap.get(ex.exerciseId);
      return (
        ex.anchorExerciseId === anchorExerciseId ||
        Boolean(slotId && ex.slotId === slotId) ||
        Boolean(pattern && def && resolveMovementPattern(def) === pattern)
      );
    });
  });

  const bestWorkingSet = lastAnchorEx.sets
    .filter((s) => s.completed && !s.isWarmup && s.setType !== 'warmup')
    .reduce<WorkoutSet | null>((best, s) => {
      const w = s.actualWeightKg ?? s.targetWeightKg ?? 0;
      const bw = best ? best.actualWeightKg ?? best.targetWeightKg ?? 0 : -1;
      return w >= bw ? s : best;
    }, null);

  const lastW = bestWorkingSet ? bestWorkingSet.actualWeightKg ?? bestWorkingSet.targetWeightKg : null;
  const lastR = bestWorkingSet ? bestWorkingSet.actualReps ?? bestWorkingSet.targetReps : null;

  if (bridgeWorkouts.length === 0) {
    return {
      isBridgeReentry: false,
      bridgeWeekCount: 0,
      lastGymWeightKg: lastW,
      lastGymReps: lastR,
      lastGymDate: lastAnchorWorkout.date,
    };
  }

  // Distinct bridge weeks (up to 3 weeks away -> 100% re-acclimation match)
  const weekKeys = new Set(
    bridgeWorkouts.map((w) => {
      const d = new Date(`${w.date}T12:00:00`);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      return localDateString(d);
    })
  );
  const bridgeWeekCount = weekKeys.size;
  const weekTag =
    lastAnchorWorkout.programWorkoutNumber != null
      ? `Wk ${Math.ceil(lastAnchorWorkout.programWorkoutNumber / 4)}`
      : lastAnchorWorkout.date.slice(5);
  const weightLabel = lastW != null ? formatWeight(lastW, unit).replace(/ (kg|lb)$/, '') : '—';
  const reentryFromLabel = `${weekTag}: ${weightLabel}×${lastR ?? '—'}`;
  const muscle = anchorDef?.primaryMuscle ?? 'Muscle';

  return {
    isBridgeReentry: bridgeWeekCount >= 1 && bridgeWeekCount <= 3,
    bridgeWeekCount,
    lastGymWeightKg: lastW,
    lastGymReps: lastR,
    lastGymDate: lastAnchorWorkout.date,
    reentryFromLabel,
    welcomeCue: `${muscle} volume stayed on track while away — matching your last gym load (${lastW != null ? formatWeight(lastW, unit) : ''}${lastR ? ` × ${lastR}` : ''}) to groove back in.`,
  };
}

// ============================================================================
// Tier-1 / Tier-2 Deterministic Copy Matrix (UI-2b & Spec Section 5)
// ============================================================================

export function buildContinuityCopy(
  kind: ContinuityRationaleKind,
  context: {
    anchorName?: string;
    anchorWeightKg?: number;
    coarseJumpPct?: number;
    isAtEquipmentCap?: boolean;
    maxDumbbellKg?: number;
    setupLabel?: string;
    bodyweightLoadPct?: number;
    isLightLoadTightened?: boolean;
    primaryMuscle?: string;
    reentryWelcomeCue?: string;
    unit?: WeightUnit;
  } = {}
): ContinuityCopyBlock {
  const unit = context.unit ?? 'kg';
  const muscleLower = (context.primaryMuscle ?? 'muscle').toLowerCase();

  if (kind === 'ANCHOR_PRIOR') {
    const anchorName = context.anchorName ?? 'main gym lift';
    const weightPart =
      context.anchorWeightKg && context.anchorWeightKg > 0
        ? ` (${formatWeight(context.anchorWeightKg, unit)})`
        : '';
    return {
      kind,
      tier1: `Estimated from your ${anchorName}${weightPart}. Log Set 1 honestly — Sets 2 & 3 will dial in.`,
      tier2Bullets: [
        'Muscle growth responds to hard tension near failure across any tool.',
        'Set 1 personalizes dumbbell or machine differences immediately for Sets 2–3.',
        'Your original lift history stays untouched so you pick up where you left off when back.',
      ],
    };
  }

  if (kind === 'BODYWEIGHT') {
    const pct = Math.round((context.bodyweightLoadPct ?? 0.7) * 100);
    const setupText = context.setupLabel ?? `Feet elevated (~${pct}% BW)`;
    return {
      kind,
      tier1: `${setupText} keeps tension high. Push close to failure (0–1 RIR) to match gym ${muscleLower} growth.`,
      tier2Bullets: [
        'Lighter loads match heavier weights for muscle growth when taken close to failure.',
        'Elevating leverage keeps reps productive instead of turning sets into endurance drills.',
        'Short bodyweight-only blocks preserve your gym strength while keeping muscle growth moving.',
      ],
    };
  }

  if (kind === 'EFFORT_ONLY') {
    return {
      kind,
      tier1: 'Machine pulley ratios vary by gym. Pick a moderate Set 1 weight and Sets 2–3 will dial in.',
      tier2Bullets: [
        'Cable/pin machines differ by 1:1 to 4:1 pulley ratios, so effort (RIR) is more accurate than copied numbers.',
        'Logging Set 1 calibrates Sets 2–3 to this exact machine while keeping weekly muscle progress moving.',
      ],
    };
  }

  if (kind === 'COARSE_JUMP_EXPANDED') {
    const tier1 = context.isAtEquipmentCap && context.maxDumbbellKg
      ? `Dumbbells top out at ${formatWeight(context.maxDumbbellKg, unit)}. Building reps here drives the same muscle growth until heavier weights are back.`
      : `Next weight jump is steep (+${context.coarseJumpPct ?? 15}%). Building reps here drives the same muscle growth until you're ready to step up.`;
    return {
      kind,
      tier1,
      tier2Bullets: [
        'Adding reps produces equivalent hypertrophy to adding weight.',
        'Expanding the rep ceiling avoids form breakdown on light dumbbells or coarse stacks.',
      ],
    };
  }

  // HOME_GYM_REENTRY
  return {
    kind: 'HOME_GYM_REENTRY',
    tier1:
      context.reentryWelcomeCue ??
      'Your weekly muscle volume stayed on track while away. Match your last gym weight today to confirm readiness before adding load.',
    tier2Bullets: [
      'Swapped sessions maintained muscle stimulus while your original gym lift history stayed untouched.',
      'Matching your last gym working load confirms readiness cleanly before stepping up weight again.',
    ],
  };
}

/**
 * Builds the science-backed "Why this works" swap/continuity explanation for AI Coach briefings,
 * chat swaps, and exercise Q&A (moved off the ExerciseCard to keep cards focused and scannable).
 */
export function buildSwapWhyThisWorksForExercise(params: {
  exercise: ExerciseSession;
  exerciseCatalog: ExerciseDefinition[];
  unit?: WeightUnit;
}): { headline: string; tier1: string; whyBullets: string[] } | null {
  const { exercise, exerciseCatalog, unit = 'kg' } = params;
  const isSwapped = Boolean(exercise.anchorExerciseId && exercise.anchorExerciseId !== exercise.exerciseId);
  const kind: ContinuityRationaleKind | undefined =
    exercise.continuityRationaleKind ??
    (exercise.isBridgeReentry
      ? 'HOME_GYM_REENTRY'
      : isSwapped
      ? classifyEquipment(exercise.equipment) === 'BODYWEIGHT'
        ? 'BODYWEIGHT'
        : classifyEquipment(exercise.equipment) === 'VARIABLE_MACHINE_OR_CABLE' &&
          exercise.calibrationSource === 'EFFORT_ONLY'
        ? 'EFFORT_ONLY'
        : 'ANCHOR_PRIOR'
      : undefined);

  const def = exerciseCatalog.find((d) => d.id === exercise.exerciseId);
  if (!kind && !isSwapped) return null;

  const resolvedKind: ContinuityRationaleKind = kind ?? 'ANCHOR_PRIOR';
  const copy = buildContinuityCopy(resolvedKind, {
    anchorName: exercise.anchorExerciseName,
    coarseJumpPct: exercise.coarseJumpPct,
    setupLabel: exercise.setupLabel,
    bodyweightLoadPct: exercise.bodyweightLoadPct,
    primaryMuscle: def?.primaryMuscle,
    unit,
  });
  const whyBullets =
    def?.whyItWorks && !copy.tier2Bullets.includes(def.whyItWorks)
      ? [...copy.tier2Bullets, def.whyItWorks]
      : copy.tier2Bullets;

  const headline =
    resolvedKind === 'HOME_GYM_REENTRY'
      ? `${exercise.name} (back at the gym)`
      : exercise.anchorExerciseName && isSwapped
      ? `${exercise.name} (replaces ${exercise.anchorExerciseName})`
      : exercise.name;

  return {
    headline,
    tier1: copy.tier1,
    whyBullets,
  };
}

// ============================================================================
// UI-5: Post-Session Continuity Summary
// ============================================================================

export function buildSessionContinuitySummary(params: {
  session: WorkoutSession;
  allWorkouts: WorkoutSession[];
  exerciseCatalog: ExerciseDefinition[];
  weeklyTargetsByMuscle?: Record<string, { min: number; max: number }>;
}): SessionContinuitySummary | undefined {
  const { session, allWorkouts, exerciseCatalog, weeklyTargetsByMuscle } = params;
  const swappedExercises = session.exercises.filter(
    (e) => Boolean(e.anchorExerciseId && e.anchorExerciseId !== e.exerciseId)
  );
  const reentryExercises = session.exercises.filter((e) => Boolean(e.isBridgeReentry));
  const hasOverlay = Boolean(
    session.environmentProfileType && session.environmentProfileType !== 'HOME_GYM'
  );

  if (!hasOverlay && swappedExercises.length === 0 && reentryExercises.length === 0) {
    return undefined;
  }

  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const primaryEx = swappedExercises[0] ?? reentryExercises[0] ?? session.exercises[0];
  const primaryDef = primaryEx ? exMap.get(primaryEx.exerciseId) : undefined;
  const primaryMuscle: MuscleGroup = primaryDef?.primaryMuscle ?? 'Chest';

  // Compute 7-day rolling volume ending on session.date
  const endDate = new Date(`${session.date}T12:00:00`);
  const startDate = new Date(endDate.getTime());
  startDate.setDate(startDate.getDate() - 6);
  const volMap = calculateFractionalVolumeByEquipment(allWorkouts, exerciseCatalog, {
    fromDate: localDateString(startDate),
    toDate: session.date,
    activeSession: session,
    maxRir: HARD_SET_MAX_RIR,
  });
  const muscleVol = volMap[primaryMuscle]?.total ?? 0;
  const target = weeklyTargetsByMuscle?.[primaryMuscle] ?? { min: 10, max: 18 };
  const pct = target.min > 0 ? Math.min(100, Math.round((muscleVol / target.min) * 100)) : 100;

  let winLeverBadge: SessionContinuitySummary['winLeverBadge'] = 'STIMULUS MATCHED';
  if (reentryExercises.length > 0 && !hasOverlay) {
    winLeverBadge = 'CARRYOVER CONFIRMED';
  } else if (
    session.environmentProfileType === 'BODYWEIGHT' ||
    swappedExercises.every((e) => classifyEquipment(e.equipment) === 'BODYWEIGHT')
  ) {
    winLeverBadge = 'LEVERAGE & EFFORT WIN';
  }

  const anchorName =
    primaryEx?.anchorExerciseName ??
    (primaryEx?.anchorExerciseId ? exMap.get(primaryEx.anchorExerciseId)?.name : undefined) ??
    primaryEx?.name ??
    'Barbell lifts';

  const anchorStatusLine =
    winLeverBadge === 'CARRYOVER CONFIRMED'
      ? `${anchorName}: Clean gym re-entry confirmed`
      : `${anchorName}: Protected while away`;

  const environmentLabel =
    session.environmentOverlayLabel ??
    (session.environmentProfileType === 'HOTEL_DUMBBELLS'
      ? 'Hotel Dumbbells'
      : session.environmentProfileType === 'BODYWEIGHT'
      ? 'Bodyweight / No equipment'
      : session.environmentProfileType === 'CUSTOM'
      ? 'Home'
      : session.environmentProfileType === 'TIME_CONSTRAINED'
      ? 'Short on time'
      : 'Gym');

  return {
    winLeverBadge,
    headline:
      winLeverBadge === 'CARRYOVER CONFIRMED'
        ? 'Right back where you left off'
        : `${primaryMuscle} progress kept moving`,
    primaryMuscle,
    weeklySetsCompleted: muscleVol,
    weeklyTargetMin: target.min,
    weeklyTargetMax: target.max,
    weeklyTargetPct: pct,
    muscleGrowthStatus: 'Muscle growth: Actively progressing',
    anchorStatusLine,
    environmentLabel,
  };
}

// ============================================================================
// Apply Environment Overlay to an Active WorkoutSession (Non-Mutating)
// ============================================================================

export function deriveIsolatedProgressionStateFromHistory(
  exerciseId: string,
  workouts: WorkoutSession[],
  storedStates?: Record<string, ExerciseProgressionState>,
  defaultBodyweightKg: number = 80
): ExerciseProgressionState | null {
  if (storedStates && storedStates[exerciseId]) {
    return storedStates[exerciseId];
  }
  const completed = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));

  let sessionCount = 0;
  let latest: { weight: number; reps: number; rir: number; e1rm: number; atMs: number; isBodyweight: boolean } | null = null;

  for (const w of completed) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const working = ex.sets.filter((s) => s.completed && !s.isWarmup && s.setType !== 'warmup');
    if (working.length === 0) continue;
    sessionCount++;
    if (!latest) {
      const isBodyweight = classifyEquipment(ex.equipment) === 'BODYWEIGHT';
      let bestSet: WorkoutSet | null = null;
      let bestScore = -1;
      for (const s of working) {
        const wt = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const rp = s.actualReps ?? s.targetReps ?? 0;
        if (rp <= 0) continue;
        const rir = clampRir(s.actualRir ?? s.targetRir ?? 2);
        const score = isBodyweight
          ? rp * 10 - rir
          : wt > 0
          ? computeLoggedWeightEpley1rm(wt, rp, Math.min(rir, 5))
          : -1;
        if (score > bestScore) {
          bestScore = score;
          bestSet = s;
        }
      }
      if (bestSet) {
        const wt = bestSet.actualWeightKg ?? bestSet.targetWeightKg ?? 0;
        const rp = bestSet.actualReps ?? bestSet.targetReps ?? 0;
        const rir = clampRir(bestSet.actualRir ?? bestSet.targetRir ?? 2);
        const atMs = w.completedAt ? Date.parse(w.completedAt) : Date.parse(`${w.date}T12:00:00`);
        const effectiveWt = isBodyweight
          ? (defaultBodyweightKg > 0 ? defaultBodyweightKg : 80) * getBodyweightLoadRatio(ex.exerciseId, ex.pillar)
          : wt;
        // Keep estimated1rmKg strictly in the same logged-weight Epley convention as
        // rebuildIsolatedProgressionStates & updateExerciseProgressionStateDamped.
        const rawE1 =
          rir >= MAX_LOGGABLE_RIR || effectiveWt <= 0 || rp <= 0
            ? 0
            : computeLoggedWeightEpley1rm(effectiveWt, rp, rir);
        latest = {
          weight: isBodyweight ? 0 : wt,
          reps: rp,
          rir,
          e1rm: rawE1,
          atMs: Number.isFinite(atMs) ? atMs : Date.now(),
          isBodyweight,
        };
      }
    }
  }

  if (!latest) return null;
  return {
    exerciseId,
    lastLoggedAt: latest.atMs,
    estimated1rmKg: latest.e1rm > 0 ? latest.e1rm : null,
    lastWorkingWeightKg: !latest.isBodyweight && latest.weight > 0 ? latest.weight : null,
    lastWorkingReps: latest.reps > 0 ? latest.reps : null,
    lastLoggedRir: latest.rir,
    calibratedSessionCount: sessionCount,
  };
}

function formatCompactAnchorRef(
  anchorDef: ExerciseDefinition,
  anchorState: ExerciseProgressionState | null,
  unit: WeightUnit
): string | undefined {
  if (!anchorState?.lastWorkingWeightKg || !anchorState.lastWorkingReps) return undefined;
  const prefix =
    anchorDef.equipment === 'barbell'
      ? 'BB'
      : anchorDef.equipment === 'dumbbell'
      ? 'DB'
      : 'Gym';
  const wNum = formatWeight(anchorState.lastWorkingWeightKg, unit).replace(/ (kg|lb)$/, '');
  return `${prefix} ${wNum}×${anchorState.lastWorkingReps}`;
}

export function applyEnvironmentOverlayToSession(params: {
  session: WorkoutSession;
  overlay: EnvironmentOverlay | null | undefined;
  exerciseCatalog: ExerciseDefinition[];
  historicalWorkouts: WorkoutSession[];
  storedProgressionStates?: Record<string, ExerciseProgressionState>;
  userBodyweightKg?: number;
  nowMs?: number;
  unit?: WeightUnit;
}): WorkoutSession {
  const {
    session,
    overlay,
    exerciseCatalog,
    historicalWorkouts,
    storedProgressionStates,
    userBodyweightKg = 80,
    nowMs = Date.now(),
    unit = 'kg',
  } = params;

  const { active } = resolveActiveOverlay(overlay, nowMs);
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));

  // When returning to HOME_GYM (no active overlay), restore anchor exercises if previously overlaid
  const nextExercises: ExerciseSession[] = session.exercises.map((ex, idx) => {
    const anyCompleted = ex.sets.some((s) => s.completed);
    if (anyCompleted) return ex;

    const anchorId = ex.anchorExerciseId ?? ex.exerciseId;
    const anchorDef = exMap.get(anchorId) ?? exMap.get(ex.exerciseId);
    if (!anchorDef) return ex;

    const slotId = ex.slotId ?? ex.orderCode ?? `S${idx + 1}`;
    const workingSets = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
    const targetSetsCount =
      active?.activeProfileType === 'TIME_CONSTRAINED' && active.maxSessionMinutes && active.maxSessionMinutes <= 30
        ? Math.max(2, workingSets.length - 1)
        : Math.max(1, workingSets.length);

    // Always derive the canonical slot rep range from the preserved anchor bounds (never from a
    // bodyweight push-up or coarse-jump capped rep ceiling such as 20 reps from a prior overlay).
    const wasPreviouslyOverlaid = Boolean(
      ex.anchorExerciseId ||
        ex.continuityRationaleKind === 'COARSE_JUMP_EXPANDED' ||
        ex.continuityRationaleKind === 'BODYWEIGHT' ||
        ex.anchorMinReps !== undefined ||
        ex.anchorMaxReps !== undefined
    );
    const isLoadedCompoundAnchor =
      !anchorDef.isIsolation &&
      anchorDef.equipment !== 'bodyweight' &&
      anchorDef.equipment !== 'weighted_bodyweight' &&
      ex.repTargetType !== 'form_failure';
    const rawAnchorMin =
      ex.anchorMinReps ??
      (wasPreviouslyOverlaid ? anchorDef.defaultRepRange[0] : ex.minReps || anchorDef.defaultRepRange[0]);
    let rawAnchorMax =
      ex.anchorMaxReps ??
      (wasPreviouslyOverlaid ? anchorDef.defaultRepRange[1] : ex.maxReps || anchorDef.defaultRepRange[1]);
    if (
      ex.anchorMaxReps === undefined &&
      isLoadedCompoundAnchor &&
      rawAnchorMax > 15 &&
      anchorDef.defaultRepRange[1] <= 15
    ) {
      rawAnchorMax = anchorDef.defaultRepRange[1];
    }
    const origMinReps = Math.max(1, rawAnchorMin);
    const origMaxReps = Math.max(origMinReps, rawAnchorMax);
    const origWeightKg =
      ex.anchorTargetWeightKg ??
      (ex.exerciseId === anchorDef.id && ex.continuityRationaleKind !== 'COARSE_JUMP_EXPANDED'
        ? workingSets[0]?.targetWeightKg
        : undefined);

    const slot: ProgramSlot = {
      slotId,
      programId: session.planId ?? 'default',
      workoutDayId: session.splitDay,
      movementPattern: resolveMovementPattern(anchorDef),
      anchorExerciseId: anchorDef.id,
      targetSets: targetSetsCount,
      targetRepMin: origMinReps,
      targetRepMax: origMaxReps,
      targetRirInitial: clampRir(workingSets[0]?.targetRir ?? 2),
      restSeconds: ex.restSeconds ?? (anchorDef.isIsolation ? 75 : 120),
    };

    const anchorState = deriveIsolatedProgressionStateFromHistory(
      anchorDef.id,
      historicalWorkouts,
      storedProgressionStates,
      userBodyweightKg
    );

    // No active overlay -> restore master anchor exercise & check clean Home-Gym Re-Entry (REQ-5)
    if (!active) {
      const reentry = buildReentryPrescription({
        anchorExerciseId: anchorDef.id,
        slotId,
        workouts: historicalWorkouts,
        exerciseCatalog,
        unit,
      });

      const needsOverlayRestore =
        ex.exerciseId !== anchorDef.id ||
        reentry.isBridgeReentry ||
        ex.continuityRationaleKind === 'COARSE_JUMP_EXPANDED' ||
        ex.anchorMaxReps !== undefined ||
        ex.anchorMinReps !== undefined ||
        ex.anchorTargetWeightKg !== undefined ||
        ex.minReps !== origMinReps ||
        ex.maxReps !== origMaxReps;

      if (!needsOverlayRestore) {
        return {
          ...ex,
          slotId,
          anchorExerciseId: undefined,
          anchorExerciseName: undefined,
          anchorMinReps: undefined,
          anchorMaxReps: undefined,
          anchorTargetWeightKg: undefined,
          anchorReferenceLabel: undefined,
          continuityRationaleKind: undefined,
          coarseJumpPct: undefined,
          isBridgeReentry: false,
          reentryFromLabel: undefined,
        };
      }

      const rawRestoredWeight =
        reentry.lastGymWeightKg ??
        ex.anchorTargetWeightKg ??
        anchorState?.lastWorkingWeightKg ??
        workingSets[0]?.targetWeightKg ??
        0;
      const isAnchorPureBw = anchorDef.equipment === 'bodyweight' && !anchorDef.isWeightedCalisthenic;
      const restoredWeight = isAnchorPureBw
        ? 0
        : rawRestoredWeight > 0
        ? snapLoadKg(rawRestoredWeight, unit, anchorDef.equipment)
        : 0;
      const rawRestoredReps =
        reentry.lastGymReps ??
        anchorState?.lastWorkingReps ??
        slot.targetRepMin;
      const restoredReps = Math.min(slot.targetRepMax, Math.max(slot.targetRepMin, rawRestoredReps));
      const rirs = buildMonotonicRirs(targetSetsCount, slot.targetRirInitial, false);

      const restoredSets: WorkoutSet[] = Array.from({ length: targetSetsCount }, (_, sIdx) => ({
        id: workingSets[sIdx]?.id ?? `set-${anchorDef.id}-${nowMs}-${sIdx}`,
        setNumber: sIdx + 1,
        targetWeightKg: restoredWeight,
        actualWeightKg: restoredWeight,
        targetReps: restoredReps,
        actualReps: restoredReps,
        targetRir: rirs[sIdx],
        completed: false,
        setType: 'working',
        isWeightEstimated: false,
        setupLabel: null,
        calibrationSource: 'OWN_HISTORY',
      }));

      return {
        ...ex,
        exerciseId: anchorDef.id,
        name: anchorDef.name,
        pillar: anchorDef.pillar,
        equipment: anchorDef.equipment,
        isRdl: anchorDef.isRdl,
        isWeightedCalisthenic: anchorDef.isWeightedCalisthenic,
        isAssisted: anchorDef.isAssisted,
        isIsolation: anchorDef.isIsolation,
        movementFamily: anchorDef.movementFamily,
        movementFamilyLabel: anchorDef.movementFamilyLabel,
        minReps: slot.targetRepMin,
        maxReps: slot.targetRepMax,
        slotId,
        anchorExerciseId: undefined,
        anchorExerciseName: undefined,
        anchorMinReps: undefined,
        anchorMaxReps: undefined,
        anchorTargetWeightKg: undefined,
        anchorReferenceLabel: undefined,
        calibrationSource: 'OWN_HISTORY',
        continuityRationaleKind: reentry.isBridgeReentry ? 'HOME_GYM_REENTRY' : undefined,
        coarseJumpPct: undefined,
        setupLabel: undefined,
        bodyweightLoadPct: undefined,
        leverageTier: undefined,
        isBridgeReentry: reentry.isBridgeReentry,
        reentryFromLabel: reentry.reentryFromLabel,
        sets: restoredSets,
      };
    }

    // Active overlay -> resolve slot deterministically & compute Set-1 prior
    const resolved = resolveSlotForOverlay({
      slot,
      overlay: active,
      exerciseCatalog,
      anchorE1rmKg: toBarbellEquivalentAnchorE1rm(anchorState, anchorDef),
      userBodyweightKg,
    });
    const targetDef = resolved.exerciseDef;

    // Fast path: the master anchor lift is ALREADY compatible with the new overlay (e.g., Incline DB Press
    // when switching Gym -> Home with dumbbells). Preserve the athlete's personalized working weight and
    // rep range rather than overwriting them with a generic anchor prior; only enforce maxDumbbellKg cap.
    if (!resolved.wasSwapped && ex.exerciseId === anchorDef.id && origWeightKg !== undefined && origWeightKg > 0) {
      const stepKg = resolveEffectiveStepKg(targetDef.equipment, active, unit);
      let workingWeight = snapLoadKg(origWeightKg, unit, targetDef.equipment);
      let repMax = slot.targetRepMax;
      let rationaleKind: ContinuityRationaleKind | undefined;
      let coarseJumpPct: number | undefined;

      if (
        targetDef.equipment === 'dumbbell' &&
        active.maxDumbbellKg != null &&
        workingWeight > active.maxDumbbellKg
      ) {
        workingWeight = Math.max(stepKg, Math.floor(active.maxDumbbellKg / stepKg) * stepKg);
        if (unit === 'kg') workingWeight = Math.max(1, Math.round(workingWeight));
        const coarse = evaluateCoarseJumpRepExpansion({
          currentWeightKg: workingWeight,
          nextAvailableWeightKg: null,
          maxDumbbellKg: active.maxDumbbellKg,
          currentRepMin: slot.targetRepMin,
          currentRepMax: slot.targetRepMax,
          stepKg,
          unit,
        });
        if (coarse.expanded) {
          repMax = coarse.expandedRepMax;
          rationaleKind = 'COARSE_JUMP_EXPANDED';
          coarseJumpPct = coarse.jumpPct;
        }
      }

      const preservedSets: WorkoutSet[] = ex.sets.map((s) => {
        if (s.isWarmup || s.setType === 'warmup') return s;
        const clampedReps = Math.min(repMax, Math.max(slot.targetRepMin, s.targetReps || slot.targetRepMin));
        return {
          ...s,
          targetWeightKg: workingWeight,
          actualWeightKg: workingWeight,
          targetReps: clampedReps,
          actualReps: clampedReps,
        };
      });

      return {
        ...ex,
        minReps: slot.targetRepMin,
        maxReps: repMax,
        slotId,
        anchorMinReps: origMinReps,
        anchorMaxReps: origMaxReps,
        anchorTargetWeightKg: origWeightKg,
        continuityRationaleKind: rationaleKind,
        coarseJumpPct,
        isBridgeReentry: false,
        reentryFromLabel: undefined,
        sets: preservedSets,
      };
    }

    const targetState = deriveIsolatedProgressionStateFromHistory(
      targetDef.id,
      historicalWorkouts,
      storedProgressionStates,
      userBodyweightKg
    );

    const presc = prescribeSet1WithAnchorPrior({
      slot,
      targetDef,
      anchorDef,
      targetState,
      anchorState,
      overlay: active,
      userBodyweightKg,
      nowMs,
      unit,
    });

    const newSets: WorkoutSet[] = presc.sets.map((p, sIdx) => ({
      id: workingSets[sIdx]?.id ?? `set-${targetDef.id}-${nowMs}-${sIdx}`,
      setNumber: p.setNumber,
      targetWeightKg: p.suggestedWeightKg ?? 0,
      actualWeightKg: p.suggestedWeightKg ?? 0,
      targetReps: p.targetRepsMin,
      actualReps: p.targetRepsMin,
      targetRir: p.targetRir,
      completed: false,
      setType: 'working',
      isWeightEstimated: p.isWeightEstimated,
      setupLabel: p.setupLabel,
      calibrationSource: p.calibrationSource,
    }));

    // Verify physiological honesty invariant
    if (hasInvertedStraightSetRir(newSets)) {
      for (let i = 1; i < newSets.length; i++) {
        if (newSets[i].targetRir > newSets[i - 1].targetRir) {
          newSets[i] = { ...newSets[i], targetRir: newSets[i - 1].targetRir };
        }
      }
    }

    const maxRepAcrossSets = Math.max(
      slot.targetRepMax,
      ...presc.sets.map((s) => s.targetRepsMax)
    );

    return {
      ...ex,
      exerciseId: targetDef.id,
      name: targetDef.name,
      pillar: targetDef.pillar,
      equipment: targetDef.equipment,
      isRdl: targetDef.isRdl,
      isWeightedCalisthenic: targetDef.isWeightedCalisthenic,
      isAssisted: targetDef.isAssisted,
      isIsolation: targetDef.isIsolation,
      movementFamily: targetDef.movementFamily,
      movementFamilyLabel: targetDef.movementFamilyLabel,
      minReps: slot.targetRepMin,
      maxReps: maxRepAcrossSets,
      slotId,
      anchorExerciseId: resolved.wasSwapped ? anchorDef.id : undefined,
      anchorExerciseName: resolved.wasSwapped ? anchorDef.name : undefined,
      anchorMinReps: origMinReps,
      anchorMaxReps: origMaxReps,
      anchorTargetWeightKg: origWeightKg,
      anchorReferenceLabel: resolved.wasSwapped
        ? formatCompactAnchorRef(anchorDef, anchorState, unit)
        : undefined,
      calibrationSource: presc.calibrationSource,
      continuityRationaleKind: resolved.wasSwapped || presc.rationaleKind === 'COARSE_JUMP_EXPANDED'
        ? presc.rationaleKind
        : undefined,
      coarseJumpPct: presc.coarseJumpPct,
      setupLabel: presc.setupLabel,
      bodyweightLoadPct: presc.bodyweightLoadPct,
      leverageTier: resolved.metadata.leverageTier,
      isBridgeReentry: false,
      reentryFromLabel: undefined,
      sets: newSets,
    };
  });

  return {
    ...session,
    location: overlayToTrainingLocation(active),
    environmentOverlayId: active?.overlayId,
    environmentProfileType: active?.activeProfileType ?? 'HOME_GYM',
    environmentOverlayLabel: active?.label ?? 'Gym',
    exercises: nextExercises,
  };
}

// ============================================================================
// Isolated Progression State Sync, Travel Bridge Bands & Single-Lift Swap
// ============================================================================

/**
 * Rebuilds every exercise's isolated progression state strictly from completed
 * workout history (never merging dumbbell/bodyweight sets into a barbell exercise).
 * Call whenever past workouts are edited or deleted so profile.exerciseProgressionStates
 * stays in exact lockstep with workouts[].
 */
export function rebuildIsolatedProgressionStates(
  workouts: WorkoutSession[],
  defaultBodyweightKg: number = 80
): Record<string, ExerciseProgressionState> {
  const completedAsc = workouts
    .filter((w) => w.completed)
    .slice()
    .sort((a, b) => (a.completedAt || `${a.date}T12:00:00`).localeCompare(b.completedAt || `${b.date}T12:00:00`));

  const states: Record<string, ExerciseProgressionState> = {};

  for (const w of completedAsc) {
    const loggedAtMs = w.completedAt ? Date.parse(w.completedAt) : Date.parse(`${w.date}T12:00:00`);
    const safeLoggedAtMs = Number.isFinite(loggedAtMs) ? loggedAtMs : Date.now();

    for (const ex of w.exercises) {
      const working = ex.sets.filter((s) => s.completed && !s.isWarmup && s.setType !== 'warmup');
      if (working.length === 0) continue;

      const isBodyweight = classifyEquipment(ex.equipment) === 'BODYWEIGHT';
      let bestSet: WorkoutSet | null = null;
      let bestScore = -1;

      for (const s of working) {
        const wt = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const rp = s.actualReps ?? s.targetReps ?? 0;
        if (rp <= 0) continue;
        const rir = clampRir(s.actualRir ?? s.targetRir ?? 2);
        if (isBodyweight) {
          const score = rp * 10 - rir;
          if (score > bestScore) {
            bestScore = score;
            bestSet = s;
          }
        } else {
          if (wt <= 0) continue;
          const score = wt * (1 + (rp + Math.min(rir, 5)) / 30);
          if (score > bestScore) {
            bestScore = score;
            bestSet = s;
          }
        }
      }

      if (!bestSet) continue;

      const rp = bestSet.actualReps ?? bestSet.targetReps ?? 0;
      const rir = clampRir(bestSet.actualRir ?? bestSet.targetRir ?? 2);
      const wt = isBodyweight
        ? (defaultBodyweightKg > 0 ? defaultBodyweightKg : 80) * getBodyweightLoadRatio(ex.exerciseId, ex.pillar)
        : bestSet.actualWeightKg ?? bestSet.targetWeightKg ?? 0;

      const prev = states[ex.exerciseId] ?? null;
      states[ex.exerciseId] = updateExerciseProgressionStateDamped(
        prev,
        {
          exerciseId: ex.exerciseId,
          weightKg: wt,
          reps: rp,
          rir,
          loggedAtMs: safeLoggedAtMs,
        },
        {
          isFirstAnchorCalibration: !prev,
          incrementSessionCount: true,
          storeWeightAsNull: isBodyweight,
        }
      );
    }
  }

  return states;
}

/**
 * Builds shaded "Travel Bridge" date bands for a single exercise's E1RM chart:
 * identifies calendar weeks after the exercise's first logged session where the
 * anchor lift was not logged, yet a same-slot / same-pattern substitute kept volume moving.
 */
export function buildExerciseBridgeBands(
  exerciseId: string,
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[]
): { startDate: string; endDate: string; label: string }[] {
  const completed = workouts.filter((w) => w.completed);
  if (completed.length === 0) return [];

  const anchorDates: string[] = [];
  let maxAnyDate = '';
  for (const w of completed) {
    if (w.date > maxAnyDate) maxAnyDate = w.date;
    const hasAnchor = w.exercises.some(
      (ex) =>
        ex.exerciseId === exerciseId &&
        ex.sets.some((s) => s.completed && !s.isWarmup && s.setType !== 'warmup')
    );
    if (hasAnchor) anchorDates.push(w.date);
  }
  if (anchorDates.length === 0 || !maxAnyDate) return [];

  anchorDates.sort();
  const firstDate = anchorDates[0];

  const toMonday = (iso: string): Date => {
    const d = new Date(`${iso}T12:00:00`);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
  };

  const startMon = toMonday(firstDate);
  const endMon = toMonday(maxAnyDate);
  const weekWindows: { start: string; end: string }[] = [];

  const cursor = new Date(startMon.getTime());
  let guard = 0;
  while (cursor.getTime() <= endMon.getTime() && guard < 104) {
    const sun = new Date(cursor.getTime());
    sun.setDate(sun.getDate() + 6);
    weekWindows.push({
      start: localDateString(cursor),
      end: localDateString(sun),
    });
    cursor.setDate(cursor.getDate() + 7);
    guard++;
  }

  if (weekWindows.length === 0) return [];

  const classified = classifyTravelBridgeWeeks({
    anchorExerciseId: exerciseId,
    workouts: completed,
    exerciseCatalog,
    weekWindows,
  });

  return classified
    .filter((c) => c.status === 'BRIDGE_WEEK')
    .map((c) => ({
      startDate: c.weekStart,
      endDate: c.weekEnd,
      label:
        c.substituteExerciseNames.length > 0
          ? `Travel bridge · ${c.substituteExerciseNames[0]}`
          : 'Travel bridge',
    }));
}

export interface SingleExerciseSwapPreview {
  prescription: SlotPrescriptionOutput;
  targetMetadata: ExerciseMetadata;
  anchorDef: ExerciseDefinition | undefined;
  anchorState: ExerciseProgressionState | null;
  targetState: ExerciseProgressionState | null;
  anchorReferenceLabel?: string;
}

/**
 * Evaluates a single-exercise swap through the 4-branch Continuity Engine
 * (OWN_HISTORY -> ANCHOR_PRIOR -> BODYWEIGHT -> EFFORT_ONLY for unfamiliar machines/cables),
 * so single-lift swaps share identical cold-start honesty and Set-1 recalibration with
 * full-session Environment Overlays.
 */
export function evaluateSingleExerciseContinuitySwap(params: {
  currentExercise: ExerciseSession;
  replacementDef: ExerciseDefinition;
  historicalWorkouts: WorkoutSession[];
  exerciseCatalog: ExerciseDefinition[];
  storedProgressionStates?: Record<string, ExerciseProgressionState>;
  activeOverlay?: EnvironmentOverlay | null;
  userBodyweightKg?: number;
  nowMs?: number;
  unit?: WeightUnit;
  planId?: string;
  splitDay?: string;
}): SingleExerciseSwapPreview {
  const {
    currentExercise,
    replacementDef,
    historicalWorkouts,
    exerciseCatalog,
    storedProgressionStates,
    activeOverlay = null,
    userBodyweightKg = 80,
    nowMs = Date.now(),
    unit = 'kg',
    planId = 'default',
    splitDay = 'Session',
  } = params;

  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const anchorId = currentExercise.anchorExerciseId ?? currentExercise.exerciseId;
  const anchorDef = exMap.get(anchorId) ?? exMap.get(currentExercise.exerciseId);

  const remainingWorking = currentExercise.sets.filter(
    (s) => !s.completed && !s.isWarmup && s.setType !== 'warmup'
  );
  const allWorking = currentExercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  const setCount = Math.max(1, remainingWorking.length || allWorking.length || 3);
  const initialRir = clampRir(remainingWorking[0]?.targetRir ?? allWorking[0]?.targetRir ?? 2);

  const slot: ProgramSlot = {
    slotId: currentExercise.slotId ?? currentExercise.orderCode ?? currentExercise.id,
    programId: planId,
    workoutDayId: splitDay,
    movementPattern: anchorDef
      ? resolveMovementPattern(anchorDef)
      : resolveMovementPattern(replacementDef),
    anchorExerciseId: anchorDef?.id ?? currentExercise.exerciseId,
    targetSets: setCount,
    targetRepMin: replacementDef.defaultRepRange[0] || currentExercise.minReps || 8,
    targetRepMax: replacementDef.defaultRepRange[1] || currentExercise.maxReps || 12,
    targetRirInitial: initialRir,
    restSeconds: currentExercise.restSeconds ?? (replacementDef.isIsolation ? 75 : 120),
  };

  const targetState = deriveIsolatedProgressionStateFromHistory(
    replacementDef.id,
    historicalWorkouts,
    storedProgressionStates
  );

  let anchorState = anchorDef
    ? deriveIsolatedProgressionStateFromHistory(
        anchorDef.id,
        historicalWorkouts,
        storedProgressionStates
      )
    : null;

  // If the athlete hasn't logged the anchor lift in history yet (e.g. Day 1 onboarding calibration),
  // synthesize a conservative anchor prior from today's calibrated anchor load for standardized free weights.
  if (!anchorState && anchorDef && classifyEquipment(anchorDef.equipment) === 'STANDARDIZED_FREE_WEIGHT') {
    const firstW = allWorking[0]?.targetWeightKg ?? 0;
    const firstR = allWorking[0]?.targetReps ?? currentExercise.minReps ?? 8;
    const firstRir = clampRir(allWorking[0]?.targetRir ?? 2);
    if (firstW > 0 && firstR > 0) {
      anchorState = {
        exerciseId: anchorDef.id,
        lastLoggedAt: nowMs,
        estimated1rmKg: computeLoggedWeightEpley1rm(firstW, firstR, firstRir),
        lastWorkingWeightKg: firstW,
        lastWorkingReps: firstR,
        lastLoggedRir: firstRir,
        calibratedSessionCount: 0,
      };
    }
  }

  const prescription = prescribeSet1WithAnchorPrior({
    slot,
    targetDef: replacementDef,
    anchorDef,
    targetState,
    anchorState,
    overlay: activeOverlay,
    userBodyweightKg,
    nowMs,
    unit,
  });

  const anchorReferenceLabel =
    anchorDef && anchorDef.id !== replacementDef.id
      ? formatCompactAnchorRef(anchorDef, anchorState, unit)
      : undefined;

  return {
    prescription,
    targetMetadata: resolveExerciseMetadata(replacementDef),
    anchorDef,
    anchorState,
    targetState,
    anchorReferenceLabel,
  };
}
