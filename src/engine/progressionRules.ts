import { EquipmentInventory, EquipmentType, ReadinessState, WorkoutSet } from './types';
import { formatWeight, LB_PER_KG, snapLoadKg, WeightUnit } from '../utils/units';
import { getInventoryStepKg, snapWeightToInventory } from './equipmentInventory';
import { isMesocycleLoadHoldTransition } from './hypertrophyVolume';
import { DEFAULT_EPLEY_DENOMINATOR } from './e1rm';

/**
 * The double progression rule, in one place. The knowledge graph's `sp-double-progression`
 * principle is written from these values, and both the split progression (`progression.ts`) and the
 * 6-week plan's load carry-over (`loadPersonalization.ts`) apply them, so the app always does what
 * the knowledge graph says (Helms, Morgan & Valdez, 2019; Israetel, Feather & Helms, 2020).
 */
export const PROGRESSION_RULES = {
  /** Load step when every working set reached the top of the rep range. */
  barbellIncrementKg: 2.5,
  /** Logged weight on paired dumbbells is per dumbbell (+1 kg/DB = +2 kg total pair load). */
  dumbbellIncrementKg: 1,
  /** Machines and cables use the smallest common plate step. */
  otherIncrementKg: 2.5,
  /** Reps added on the first sets when the athlete is inside the range. */
  repStep: 1,
  /** Sets this many reps or more short of failure count as quality reps (not ground out). */
  minRirForProgress: 1,
  /** Largest jump allowed from one session to the next. */
  maxSessionIncreaseFraction: 0.1,
} as const;

export function loadIncrementFor(equipment: string, unit: WeightUnit = 'kg'): number {
  if (unit === 'lb') return 5 / LB_PER_KG;
  if (equipment === 'dumbbell') return PROGRESSION_RULES.dumbbellIncrementKg;
  if (equipment === 'barbell') return PROGRESSION_RULES.barbellIncrementKg;
  return PROGRESSION_RULES.otherIncrementKg;
}

/**
 * Dampens single-set RIR outliers across multi-set working blocks (3+ sets) so one misjudged
 * RIR entry (e.g. [2, 2, 0] or [2, 2, 5]) cannot single-handedly block or skew next week's
 * prescribed load, while genuine fatigue across multiple sets (e.g. [0, 0, 0] or [1, 0, 0])
 * is preserved untouched.
 */
export function dampenSingleSetRirOutliers(rirs: number[]): number[] {
  if (rirs.length < 3) return [...rirs];
  return rirs.map((val, idx) => {
    const others = rirs.filter((_, j) => j !== idx).sort((a, b) => a - b);
    const mid = Math.floor(others.length / 2);
    const otherMedian =
      others.length % 2 === 1 ? others[mid] : (others[mid - 1] + others[mid]) / 2;
    const otherSpread = others[others.length - 1] - others[0];
    if (otherSpread <= 1 && Math.abs(val - otherMedian) >= 2) {
      return Math.round(otherMedian * 0.65 + val * 0.35);
    }
    return val;
  });
}

/**
 * Whether a set was done with enough reps in reserve to progress from. A set the plan deliberately
 * takes to failure (target 0 RIR) counts when it reaches failure on the target reps; otherwise at
 * least 1 rep must be left in reserve, so ground-out reps never raise the weight.
 */
export function hadQualityEffort(actualRir: number | undefined, targetRir: number | undefined): boolean {
  const required = Math.min(targetRir ?? PROGRESSION_RULES.minRirForProgress, PROGRESSION_RULES.minRirForProgress);
  return (actualRir ?? targetRir ?? 2) >= required;
}

/**
 * When an exercise's smallest physical load increment exceeds this fraction of working load
 * (e.g., 8 kg -> 10 kg dumbbell = +25%), double progression automatically expands the rep
 * ceiling instead of forcing an unsustainable jump (Schoenfeld et al., 2021; Plotkin et al., 2022).
 */
export const EQUIPMENT_JUMP_EXPANSION_THRESHOLD = 0.08;

/** Upper rep ceiling for equipment-aware expansion (remains squarely in the hypertrophy zone). */
export const MAX_EXPANDED_REP_CEILING = 25;

/**
 * Prescribes physiologically valid, non-increasing RIR targets across fixed-load straight sets.
 * Acute inter-set fatigue causes effort to rise (RIR to fall) across identical weight × rep sets
 * (Robinson et al., 2024; Refalo et al., 2024); prescribing *higher* RIR on later straight sets
 * (e.g. 1 → 1 → 2) contradicts exercise physiology.
 */
export function prescribeFatigueAwareSetRirs(
  setCount: number,
  endTargetRir: number,
  options?: { maxRir?: number; isFixedLoadStraightSet?: boolean }
): number[] {
  const count = Math.max(1, Math.round(setCount));
  const clampedEnd = Math.max(0, Math.min(4, Math.round(endTargetRir)));
  if (count === 1) return [clampedEnd];

  const isStraight = options?.isFixedLoadStraightSet ?? true;
  if (!isStraight) {
    return Array.from({ length: count }, () => clampedEnd);
  }

  // Keep standard working sets in the productive 0–3 RIR hypertrophy window while descending
  // cleanly across acute inter-set fatigue (e.g. end=0 -> [2, 1, 0]; end=1 -> [2, 2, 1];
  // explicit maxRir=3 -> [3, 2, 1] or [3, 2, 2]; deload maxRir=4 -> [4, 3]).
  const defaultCeiling =
    clampedEnd === 0
      ? Math.min(2, count - 1)
      : clampedEnd === 1
      ? 2
      : clampedEnd;
  const startRir = Math.max(
    clampedEnd,
    Math.min(4, options?.maxRir !== undefined ? Math.min(options.maxRir, clampedEnd + 2) : defaultCeiling)
  );
  const span = startRir - clampedEnd;

  return Array.from({ length: count }, (_, idx) => {
    if (idx === count - 1) return clampedEnd;
    if (span <= 0) return clampedEnd;
    // Linear descent from startRir (set 1) down to endTargetRir (final set), strictly non-increasing.
    const progress = idx / (count - 1);
    return Math.max(clampedEnd, Math.round(startRir - span * progress));
  });
}

/**
 * Returns true if any two consecutive fixed-load, fixed-rep working straight sets prescribe
 * an easier (higher) RIR on the later set (e.g. 1 → 2), which contradicts inter-set fatigue.
 */
export function hasInvertedStraightSetRir(sets: WorkoutSet[]): boolean {
  const straight = sets.filter(
    (s) => !s.isWarmup && s.setType !== 'warmup' && s.setType !== 'drop' && s.setType !== 'myo'
  );
  for (let i = 1; i < straight.length; i++) {
    const prev = straight[i - 1];
    const curr = straight[i];
    const sameWeight = Math.abs((curr.targetWeightKg ?? 0) - (prev.targetWeightKg ?? 0)) <= 0.05;
    const sameReps = (curr.targetReps ?? 0) === (prev.targetReps ?? 0);
    if (sameWeight && sameReps && (curr.targetRir ?? 2) > (prev.targetRir ?? 2)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes targetRir across contiguous same-weight, same-rep working straight sets so RIR
 * never increases on a later set.
 */
export function normalizeStraightSetRirs(sets: WorkoutSet[]): WorkoutSet[] {
  let lastStraight: WorkoutSet | null = null;
  return sets.map((s) => {
    if (s.isWarmup || s.setType === 'warmup' || s.setType === 'drop' || s.setType === 'myo') {
      return s;
    }
    if (lastStraight) {
      const sameWeight = Math.abs((s.targetWeightKg ?? 0) - (lastStraight.targetWeightKg ?? 0)) <= 0.05;
      const sameReps = (s.targetReps ?? 0) === (lastStraight.targetReps ?? 0);
      if (sameWeight && sameReps && s.targetRir > lastStraight.targetRir) {
        const fixed = { ...s, targetRir: lastStraight.targetRir };
        lastStraight = fixed;
        return fixed;
      }
    }
    lastStraight = s;
    return s;
  });
}

export interface EquipmentRepCeilingResult {
  effectiveMaxReps: number;
  expanded: boolean;
  jumpFraction: number;
  stepKg: number;
  explanation?: string;
}

/**
 * Automatically expands the double-progression rep ceiling when the smallest physical weight
 * increment represents a disproportionate (>8%) jump — typical on light dumbbells (e.g. 8 → 10 kg
 * lateral raises = +25%) and coarse cable/machine pin stacks.
 */
export function computeEquipmentAwareRepCeiling(params: {
  currentWeightKg: number;
  minReps: number;
  maxReps: number;
  equipment: EquipmentType | string;
  unit?: WeightUnit;
  inventory?: EquipmentInventory | null;
  targetRir?: number;
  epleyDenominator?: number;
  isPureBodyweight?: boolean;
  isAssisted?: boolean;
}): EquipmentRepCeilingResult {
  const {
    currentWeightKg,
    minReps,
    maxReps,
    equipment,
    unit = 'kg',
    inventory,
    targetRir = 2,
    epleyDenominator = DEFAULT_EPLEY_DENOMINATOR,
    isPureBodyweight = false,
    isAssisted = false,
  } = params;

  const stepKg = inventory
    ? getInventoryStepKg(equipment, unit, inventory)
    : loadIncrementFor(equipment, unit);

  if (
    isPureBodyweight ||
    isAssisted ||
    currentWeightKg <= 0 ||
    stepKg <= 0 ||
    maxReps >= MAX_EXPANDED_REP_CEILING
  ) {
    return {
      effectiveMaxReps: maxReps,
      expanded: false,
      jumpFraction: 0,
      stepKg,
    };
  }

  const jumpFraction = stepKg / currentWeightKg;
  if (jumpFraction <= EQUIPMENT_JUMP_EXPANSION_THRESHOLD + 1e-9) {
    return {
      effectiveMaxReps: maxReps,
      expanded: false,
      jumpFraction,
      stepKg,
    };
  }

  // Solve reps needed at currentWeightKg to match Epley E1RM of hitting minReps at (currentWeightKg + stepKg)
  const denom = Math.max(20, Math.min(45, epleyDenominator));
  const safeRir = Math.max(0, Math.min(4, targetRir));
  const nextWeightKg = currentWeightKg + stepKg;
  const requiredE1rm = nextWeightKg * (1 + (Math.max(1, minReps) + safeRir) / denom);
  const rawRequiredReps = denom * (requiredE1rm / currentWeightKg - 1) - safeRir;
  const requiredReps = Math.ceil(rawRequiredReps);

  if (requiredReps <= maxReps) {
    return {
      effectiveMaxReps: maxReps,
      expanded: false,
      jumpFraction,
      stepKg,
    };
  }

  const effectiveMaxReps = Math.min(MAX_EXPANDED_REP_CEILING, Math.max(maxReps + 1, requiredReps));
  const jumpPct = Math.round(jumpFraction * 100);
  const weightLabel = formatWeight(currentWeightKg, unit);
  const explanation = `Next weight step is +${jumpPct}% — building to ${effectiveMaxReps} reps at ${weightLabel} before stepping up.`;

  return {
    effectiveMaxReps,
    expanded: true,
    jumpFraction,
    stepKg,
    explanation,
  };
}

/** Epley-based equivalent working weight for a new rep/RIR target from a completed set. */
export function equivalentWeightForReps(
  prevWeight: number,
  prevReps: number,
  prevRir: number,
  newReps: number,
  newRir: number,
  epleyDenominator: number = DEFAULT_EPLEY_DENOMINATOR
): number {
  const denom = Math.max(20, Math.min(45, epleyDenominator));
  const e1rm = prevWeight * (1 + (Math.max(0, prevReps) + Math.max(0, prevRir)) / denom);
  return e1rm / (1 + (Math.max(1, newReps) + Math.max(0, newRir)) / denom);
}

/** Snaps a load to real equipment increments (or custom gym/home inventory) while enforcing the max session jump cap. */
export function capAndSnapWeight(
  equipment: EquipmentType | string,
  weightKg: number,
  prevWeightKg: number,
  unit: WeightUnit = 'kg',
  inventory?: EquipmentInventory | null
): number {
  const step = inventory ? getInventoryStepKg(equipment, unit, inventory) : loadIncrementFor(equipment, unit);
  const cap = prevWeightKg * (1 + PROGRESSION_RULES.maxSessionIncreaseFraction) + step;
  const snapFn = (w: number) =>
    inventory ? snapWeightToInventory(w, equipment, unit, inventory) : snapLoadKg(w, unit, equipment);
  let snapped = snapFn(Math.min(weightKg, cap));
  while (snapped > cap + 1e-9 && snapped > prevWeightKg) {
    const lower = snapFn(snapped - step);
    if (lower >= snapped - 1e-9) break;
    snapped = lower;
  }
  return snapped;
}

export type RepRangeProgressionStatus =
  | 'increase_load'
  | 'reduce_load'
  | 'build_reps'
  | 'consolidate'
  | 'amber_hold'
  | 'range_changed';

export interface RepRangeEvaluationInput {
  completedWorkingSets: WorkoutSet[];
  sourcePrescribedSetCount: number;
  targetSetCount: number;
  minReps: number;
  maxReps: number;
  sourceMinReps?: number;
  sourceMaxReps?: number;
  sourceTargetRir?: number;
  targetRir?: number;
  currentWeightKg: number;
  equipment: EquipmentType | string;
  readinessState: ReadinessState;
  unit?: WeightUnit;
  isPureBodyweight?: boolean;
  /** True for counterweight-assisted movements (e.g. Assisted Chin-Up) where progression reduces counterweight. */
  isAssisted?: boolean;
  /** When false (beginner/RIR-hidden mode), progression evaluates weight × reps cleanly without requiring per-set RIR input. */
  rirTrackingEnabled?: boolean;
  /** Optional gym/home plate and dumbbell inventory so prescribed loads match actually loadable weights. */
  inventory?: EquipmentInventory | null;
  /** Optional personalized Epley strength-endurance slope denominator (default 30; Nuzzo et al., 2024). */
  epleyDenominator?: number;
  weightOfSetKg?: (s: WorkoutSet) => number;
}

export interface RepRangeEvaluationResult {
  status: RepRangeProgressionStatus;
  nextWeightKg: number;
  nextRepsBySet: number[];
  weightChanged: boolean;
  repsChanged: boolean;
  lowestReps: number;
  bestReps: number;
  effectiveStepKg: number;
  /** Effective upper rep ceiling (equals maxReps normally, or expanded up to 25 when next weight step > 8%). */
  effectiveMaxReps?: number;
  repCeilingExpanded?: boolean;
  jumpFraction?: number;
  repCeilingExplanation?: string;
}

/**
 * Single authoritative double-progression evaluator across rep ranges (Helms, Morgan & Valdez, 2019;
 * Israetel, Feather & Helms, 2020):
 * 1. If Amber Shield recovery is active: hold weight and reps conservatively.
 * 2. If any working set fell below `minReps`: reduce load by at least one real increment (scaled
 *    via Epley to match `minReps`), and reset targets to `minReps` across all sets.
 * 3. If all prescribed working sets reached `maxReps` with quality effort (>= 1 RIR unless
 *    planned 0 RIR): increase load by one equipment step, and reset targets to `minReps`.
 * 4. If all sets hit >= `minReps` but not all hit `maxReps`: hold weight constant and progress
 *    +1 rep on up to two sets still below `maxReps` with quality effort; otherwise hold & consolidate.
 */
export function evaluateRepRangeDoubleProgression(
  input: RepRangeEvaluationInput
): RepRangeEvaluationResult {
  const {
    completedWorkingSets,
    sourcePrescribedSetCount,
    targetSetCount,
    minReps,
    maxReps,
    targetRir: inputTargetRir,
    currentWeightKg,
    equipment,
    readinessState,
    unit = 'kg',
    isPureBodyweight = false,
    isAssisted = false,
    rirTrackingEnabled = true,
    inventory,
    epleyDenominator = DEFAULT_EPLEY_DENOMINATOR,
  } = input;

  const sourceMinReps = input.sourceMinReps ?? minReps;
  const sourceMaxReps = input.sourceMaxReps ?? maxReps;
  const ceilingInfo = computeEquipmentAwareRepCeiling({
    currentWeightKg,
    minReps,
    maxReps,
    equipment,
    unit,
    inventory,
    targetRir: inputTargetRir ?? 2,
    epleyDenominator,
    isPureBodyweight,
    isAssisted,
  });
  const effectiveMaxReps = ceilingInfo.effectiveMaxReps;
  const effectiveSourceMaxReps =
    sourceMaxReps === maxReps ? effectiveMaxReps : sourceMaxReps;
  const step = ceilingInfo.stepKg;
  const ceilingMeta = {
    effectiveMaxReps,
    repCeilingExpanded: ceilingInfo.expanded,
    jumpFraction: ceilingInfo.jumpFraction,
    ...(ceilingInfo.explanation ? { repCeilingExplanation: ceilingInfo.explanation } : {}),
  };
  const snap = (wKg: number) =>
    inventory ? snapWeightToInventory(wKg, equipment, unit, inventory) : snapLoadKg(wKg, unit, equipment);
  const weightOf =
    input.weightOfSetKg ?? ((s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0);
  const repsOf = (s: WorkoutSet) => s.actualReps ?? s.targetReps ?? minReps;

  // Exclude intentional drop/myo finisher sets from straight-set range evaluation when standard sets exist.
  const straightSets = completedWorkingSets.filter(
    (s) => s.setType !== 'drop' && s.setType !== 'myo'
  );
  const evalSets = straightSets.length > 0 ? straightSets : completedWorkingSets;
  const atBottom = Array.from({ length: Math.max(1, targetSetCount) }, () => minReps);

  if (evalSets.length === 0) {
    return {
      status: 'consolidate',
      nextWeightKg: isPureBodyweight ? 0 : currentWeightKg,
      nextRepsBySet: atBottom,
      weightChanged: false,
      repsChanged: false,
      lowestReps: minReps,
      bestReps: minReps,
      effectiveStepKg: step,
    };
  }

  // Dampen single-set RIR outliers across 3+ set blocks so one misjudged RIR reading
  // doesn't swing next week's load or falsely block progression.
  const rawRirs = evalSets.map((s) =>
    rirTrackingEnabled
      ? (s.actualRir ?? s.targetRir ?? inputTargetRir ?? 2)
      : (s.targetRir ?? inputTargetRir ?? 2)
  );
  const dampenedRirs = dampenSingleSetRirOutliers(rawRirs);
  const effectiveRirAt = (idx: number) => dampenedRirs[idx] ?? inputTargetRir ?? 2;
  const qualityAt = (idx: number) =>
    !rirTrackingEnabled || hadQualityEffort(effectiveRirAt(idx), evalSets[idx]?.targetRir);

  const prevWeight = isPureBodyweight ? 0 : currentWeightKg;
  let bestSetIdx = 0;
  for (let i = 1; i < evalSets.length; i++) {
    if (repsOf(evalSets[i]) > repsOf(evalSets[bestSetIdx])) bestSetIdx = i;
  }
  const bestSet = evalSets[bestSetIdx];
  const bestReps = repsOf(bestSet);
  const lowestReps = Math.min(...evalSets.map(repsOf));
  const bestRir = effectiveRirAt(bestSetIdx);
  const newRir = inputTargetRir ?? bestRir;
  const clampToRange = (reps: number) => Math.min(effectiveMaxReps, Math.max(minReps, reps));
  const repsLastTime = (idx: number) => {
    const s = evalSets[idx];
    return s ? repsOf(s) : lowestReps;
  };

  if (sourceMinReps !== minReps || sourceMaxReps !== maxReps) {
    if (isPureBodyweight) {
      return {
        status: 'range_changed',
        nextWeightKg: 0,
        nextRepsBySet: atBottom,
        weightChanged: false,
        repsChanged: evalSets.some((s) => repsOf(s) !== minReps),
        lowestReps,
        bestReps,
        effectiveStepKg: 0,
      };
    }
    if (isAssisted) {
      // For assisted calisthenics, hold current assistance when rep range shifts and reset to minReps.
      return {
        status: 'range_changed',
        nextWeightKg: prevWeight,
        nextRepsBySet: atBottom,
        weightChanged: false,
        repsChanged: evalSets.some((s) => repsOf(s) !== minReps),
        lowestReps,
        bestReps,
        effectiveStepKg: step,
      };
    }
    const matched = equivalentWeightForReps(prevWeight, bestReps, bestRir, minReps, newRir, epleyDenominator);
    const neverHeavier = minReps >= bestReps || readinessState === 'Amber Shield';
    const nextWeightKg = capAndSnapWeight(
      equipment,
      neverHeavier ? Math.min(matched, prevWeight) : matched,
      prevWeight,
      unit,
      inventory
    );
    return {
      status: 'range_changed',
      nextWeightKg,
      nextRepsBySet: atBottom,
      weightChanged: Math.abs(nextWeightKg - prevWeight) > 0.05,
      repsChanged: evalSets.some((s) => repsOf(s) !== minReps),
      lowestReps,
      bestReps,
      effectiveStepKg: step,
      ...ceilingMeta,
    };
  }

  if (readinessState === 'Amber Shield') {
    return {
      status: 'amber_hold',
      nextWeightKg: isPureBodyweight ? 0 : prevWeight,
      nextRepsBySet: Array.from({ length: Math.max(1, targetSetCount) }, (_, i) =>
        isPureBodyweight
          ? Math.max(minReps, Math.min(30, repsLastTime(i)))
          : clampToRange(repsLastTime(i))
      ),
      weightChanged: false,
      repsChanged: false,
      lowestReps,
      bestReps,
      effectiveStepKg: step,
      ...ceilingMeta,
    };
  }

  // Rule 1: Missed the bottom of the rep range on one or more working sets -> ease difficulty & reset to minReps.
  if (lowestReps < sourceMinReps) {
    if (isPureBodyweight) {
      return {
        status: 'reduce_load',
        nextWeightKg: 0,
        nextRepsBySet: atBottom,
        weightChanged: false,
        repsChanged: evalSets.some((s) => repsOf(s) !== minReps),
        lowestReps,
        bestReps,
        effectiveStepKg: 0,
      };
    }

    if (isAssisted) {
      // Assisted movements ease difficulty by ADDING counterweight assistance by one equipment step.
      const nextWeightKg = snapLoadKg(prevWeight + step, unit, equipment);
      return {
        status: 'reduce_load',
        nextWeightKg,
        nextRepsBySet: atBottom,
        weightChanged: Math.abs(nextWeightKg - prevWeight) > 0.05,
        repsChanged: evalSets.some((s) => repsOf(s) !== minReps),
        lowestReps,
        bestReps,
        effectiveStepKg: step,
      };
    }

    const repAnchor =
      bestReps < sourceMinReps
        ? Math.max(1, bestReps)
        : Math.max(1, Math.min(sourceMinReps - 1, Math.round((bestReps + lowestReps) / 2)));
    let weakestIdx = 0;
    for (let i = 1; i < evalSets.length; i++) {
      if (repsOf(evalSets[i]) < repsOf(evalSets[weakestIdx])) weakestIdx = i;
    }
    const anchorRir = effectiveRirAt(weakestIdx);
    const rawMatched = equivalentWeightForReps(prevWeight, repAnchor, anchorRir, minReps, newRir, epleyDenominator);
    const snappedMatched = snap(rawMatched);
    const canStepDown = prevWeight > step + 0.05;
    const oneStepDown = canStepDown
      ? snap(Math.max(step, prevWeight - step))
      : snap(prevWeight);
    const maxDropFloor = snap(Math.max(step, prevWeight * 0.85));
    const bounded = canStepDown
      ? Math.max(maxDropFloor, Math.min(snappedMatched, oneStepDown))
      : oneStepDown;
    const nextWeightKg = Math.min(prevWeight, bounded);

    return {
      status: 'reduce_load',
      nextWeightKg,
      nextRepsBySet: atBottom,
      weightChanged: Math.abs(nextWeightKg - prevWeight) > 0.05,
      repsChanged: evalSets.some((s) => repsOf(s) !== minReps),
      lowestReps,
      bestReps,
      effectiveStepKg: step,
      ...ceilingMeta,
    };
  }

  // Rule 2: Every prescribed working set hit top of (possibly equipment-expanded) rep range with quality RIR -> increase load & reset to minReps.
  const prescribedCount = Math.max(1, sourcePrescribedSetCount);
  const everySetDone = evalSets.length >= prescribedCount;
  const allAtTop =
    everySetDone &&
    evalSets.every((s, idx) => repsOf(s) >= effectiveSourceMaxReps && qualityAt(idx));

  if (allAtTop) {
    // Mesocycle collision guard: do not also increase load in the exact week the mesocycle
    // drops target RIR (closer to failure) AND adds working sets.
    const sourceTargetRir = input.sourceTargetRir ?? evalSets[0]?.targetRir;
    if (
      isMesocycleLoadHoldTransition({
        sourceTargetRir,
        targetRir: inputTargetRir,
        sourcePrescribedSetCount: prescribedCount,
        targetSetCount,
      })
    ) {
      return {
        status: 'consolidate',
        nextWeightKg: isPureBodyweight ? 0 : prevWeight,
        nextRepsBySet: Array.from({ length: Math.max(1, targetSetCount) }, (_, i) =>
          isPureBodyweight
            ? Math.max(minReps, Math.min(30, repsLastTime(i)))
            : clampToRange(repsLastTime(i))
        ),
        weightChanged: false,
        repsChanged: false,
        lowestReps,
        bestReps,
        effectiveStepKg: isPureBodyweight ? 0 : step,
        ...ceilingMeta,
      };
    }

    if (isPureBodyweight) {
      const nextRepsBySet = Array.from({ length: Math.max(1, targetSetCount) }, (_, i) =>
        Math.min(30, (evalSets[i] ? repsOf(evalSets[i]) : effectiveSourceMaxReps) + 2)
      );
      return {
        status: 'increase_load',
        nextWeightKg: 0,
        nextRepsBySet,
        weightChanged: false,
        repsChanged: true,
        lowestReps,
        bestReps,
        effectiveStepKg: 0,
        ...ceilingMeta,
      };
    }

    if (isAssisted) {
      // Assisted movements progress by REDUCING counterweight assistance by one equipment step
      // down to 0 kg (unassisted bodyweight chin-up).
      const reduced = Math.max(0, prevWeight - step);
      const nextWeightKg = reduced <= 0.05 ? 0 : snap(reduced);
      const changed = prevWeight - nextWeightKg > 0.05;
      return {
        status: changed ? 'increase_load' : 'consolidate',
        nextWeightKg,
        nextRepsBySet: changed ? atBottom : Array.from({ length: Math.max(1, targetSetCount) }, () => maxReps),
        weightChanged: changed,
        repsChanged: changed,
        lowestReps,
        bestReps,
        effectiveStepKg: step,
        ...ceilingMeta,
      };
    }

    const base =
      lowestReps > effectiveSourceMaxReps
        ? equivalentWeightForReps(prevWeight, lowestReps, bestRir, effectiveSourceMaxReps, bestRir, epleyDenominator)
        : prevWeight;
    const nextWeightKg = capAndSnapWeight(equipment, base + step, prevWeight, unit, inventory);

    // When target RIR shifted across mesocycle weeks/phases, verify via Epley that the
    // demonstrated performance actually supports the load jump at the new target RIR.
    const rirChanged =
      sourceTargetRir !== undefined &&
      inputTargetRir !== undefined &&
      Math.abs(inputTargetRir - sourceTargetRir) > 1e-6;
    if (rirChanged) {
      const limitingActualRir = Math.min(
        ...evalSets.map((_, idx) => effectiveRirAt(idx))
      );
      const denom = Math.max(20, Math.min(45, epleyDenominator));
      const demonstratedE1rm =
        prevWeight * (1 + (lowestReps + Math.max(0, limitingActualRir)) / denom);
      const requiredE1rm =
        nextWeightKg * (1 + (minReps + Math.max(0, newRir)) / denom);
      if (requiredE1rm > demonstratedE1rm + 1e-6) {
        return {
          status: 'consolidate',
          nextWeightKg: prevWeight,
          nextRepsBySet: Array.from({ length: Math.max(1, targetSetCount) }, (_, i) =>
            clampToRange(repsLastTime(i))
          ),
          weightChanged: false,
          repsChanged: false,
          lowestReps,
          bestReps,
          effectiveStepKg: step,
          ...ceilingMeta,
        };
      }
    }

    return {
      status: 'increase_load',
      nextWeightKg,
      nextRepsBySet: atBottom,
      weightChanged: nextWeightKg > prevWeight + 0.05,
      repsChanged: true,
      lowestReps,
      bestReps,
      effectiveStepKg: step,
      ...ceilingMeta,
    };
  }

  // Rule 3: Inside [minReps, effectiveMaxReps] on all sets -> hold load, nudge +1 rep on first two quality sets below effectiveMaxReps.
  let repsAdded = 0;
  const nextRepsBySet = Array.from({ length: Math.max(1, targetSetCount) }, (_, i) => {
    const rawLast = repsLastTime(i);
    const reps = isPureBodyweight
      ? Math.min(30, Math.max(minReps, rawLast))
      : clampToRange(rawLast);
    const cap = isPureBodyweight ? 30 : effectiveMaxReps;
    const prevSet = evalSets[i];
    const atSameLoad =
      prevSet !== undefined &&
      (isPureBodyweight || Math.abs(weightOf(prevSet) - prevWeight) <= 0.05 || weightOf(prevSet) >= prevWeight);
    const earnedRep =
      repsAdded < 2 &&
      reps < cap &&
      prevSet !== undefined &&
      atSameLoad &&
      qualityAt(i);
    if (!earnedRep) return reps;
    repsAdded++;
    return Math.min(cap, reps + PROGRESSION_RULES.repStep);
  });

  return {
    status: repsAdded > 0 ? 'build_reps' : 'consolidate',
    nextWeightKg: isPureBodyweight ? 0 : prevWeight,
    nextRepsBySet,
    weightChanged: false,
    repsChanged: repsAdded > 0,
    lowestReps,
    bestReps,
    effectiveStepKg: step,
    ...ceilingMeta,
  };
}
