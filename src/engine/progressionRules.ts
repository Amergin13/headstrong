import { EquipmentType, ReadinessState, WorkoutSet } from './types';
import { LB_PER_KG, snapLoadKg, WeightUnit } from '../utils/units';

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
 * Whether a set was done with enough reps in reserve to progress from. A set the plan deliberately
 * takes to failure (target 0 RIR) counts when it reaches failure on the target reps; otherwise at
 * least 1 rep must be left in reserve, so ground-out reps never raise the weight.
 */
export function hadQualityEffort(actualRir: number | undefined, targetRir: number | undefined): boolean {
  const required = Math.min(targetRir ?? PROGRESSION_RULES.minRirForProgress, PROGRESSION_RULES.minRirForProgress);
  return (actualRir ?? targetRir ?? 2) >= required;
}

/** Epley-based equivalent working weight for a new rep/RIR target from a completed set. */
export function equivalentWeightForReps(
  prevWeight: number,
  prevReps: number,
  prevRir: number,
  newReps: number,
  newRir: number
): number {
  const e1rm = prevWeight * (1 + (Math.max(0, prevReps) + Math.max(0, prevRir)) / 30);
  return e1rm / (1 + (Math.max(1, newReps) + Math.max(0, newRir)) / 30);
}

/** Snaps a load to real equipment increments while enforcing the max session jump cap. */
export function capAndSnapWeight(
  equipment: EquipmentType | string,
  weightKg: number,
  prevWeightKg: number,
  unit: WeightUnit = 'kg'
): number {
  const step = loadIncrementFor(equipment, unit);
  const cap = prevWeightKg * (1 + PROGRESSION_RULES.maxSessionIncreaseFraction) + step;
  let snapped = snapLoadKg(Math.min(weightKg, cap), unit, equipment);
  while (snapped > cap + 1e-9 && snapped > prevWeightKg) {
    snapped = snapLoadKg(snapped - step, unit, equipment);
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
  targetRir?: number;
  currentWeightKg: number;
  equipment: EquipmentType | string;
  readinessState: ReadinessState;
  unit?: WeightUnit;
  isPureBodyweight?: boolean;
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
  } = input;

  const sourceMinReps = input.sourceMinReps ?? minReps;
  const sourceMaxReps = input.sourceMaxReps ?? maxReps;
  const step = loadIncrementFor(equipment, unit);
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

  const prevWeight = isPureBodyweight ? 0 : currentWeightKg;
  const bestSet = evalSets.reduce((best, s) => (repsOf(s) > repsOf(best) ? s : best));
  const bestReps = repsOf(bestSet);
  const lowestReps = Math.min(...evalSets.map(repsOf));
  const bestRir = bestSet.actualRir ?? bestSet.targetRir ?? inputTargetRir ?? 2;
  const newRir = inputTargetRir ?? bestRir;
  const clampToRange = (reps: number) => Math.min(maxReps, Math.max(minReps, reps));
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
    const matched = equivalentWeightForReps(prevWeight, bestReps, bestRir, minReps, newRir);
    const neverHeavier = minReps >= bestReps || readinessState === 'Amber Shield';
    const nextWeightKg = capAndSnapWeight(
      equipment,
      neverHeavier ? Math.min(matched, prevWeight) : matched,
      prevWeight,
      unit
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
    };
  }

  // Rule 1: Missed the bottom of the rep range on one or more working sets -> reduce weight & reset to minReps.
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

    const repAnchor =
      bestReps < sourceMinReps
        ? Math.max(1, bestReps)
        : Math.max(1, Math.min(sourceMinReps - 1, Math.round((bestReps + lowestReps) / 2)));
    const anchorSet = evalSets.reduce((weakest, s) =>
      repsOf(s) < repsOf(weakest) ? s : weakest
    );
    const anchorRir = anchorSet.actualRir ?? anchorSet.targetRir ?? newRir;
    const rawMatched = equivalentWeightForReps(prevWeight, repAnchor, anchorRir, minReps, newRir);
    const snappedMatched = snapLoadKg(rawMatched, unit, equipment);
    const canStepDown = prevWeight > step + 0.05;
    const oneStepDown = canStepDown
      ? snapLoadKg(Math.max(step, prevWeight - step), unit, equipment)
      : snapLoadKg(prevWeight, unit, equipment);
    const maxDropFloor = snapLoadKg(Math.max(step, prevWeight * 0.85), unit, equipment);
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
    };
  }

  // Rule 2: Every prescribed working set hit top of rep range with quality RIR -> increase load & reset to minReps.
  const prescribedCount = Math.max(1, sourcePrescribedSetCount);
  const everySetDone = evalSets.length >= prescribedCount;
  const allAtTop =
    everySetDone &&
    evalSets.every((s) => repsOf(s) >= sourceMaxReps && hadQualityEffort(s.actualRir, s.targetRir));

  if (allAtTop) {
    if (isPureBodyweight) {
      const nextRepsBySet = Array.from({ length: Math.max(1, targetSetCount) }, (_, i) =>
        Math.min(30, (evalSets[i] ? repsOf(evalSets[i]) : sourceMaxReps) + 2)
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
      };
    }

    const base =
      lowestReps > sourceMaxReps
        ? equivalentWeightForReps(prevWeight, lowestReps, bestRir, sourceMaxReps, bestRir)
        : prevWeight;
    const nextWeightKg = capAndSnapWeight(equipment, base + step, prevWeight, unit);

    return {
      status: 'increase_load',
      nextWeightKg,
      nextRepsBySet: atBottom,
      weightChanged: nextWeightKg > prevWeight + 0.05,
      repsChanged: true,
      lowestReps,
      bestReps,
      effectiveStepKg: step,
    };
  }

  // Rule 3: Inside [minReps, maxReps] on all sets -> hold load, nudge +1 rep on first two quality sets below maxReps.
  let repsAdded = 0;
  const nextRepsBySet = Array.from({ length: Math.max(1, targetSetCount) }, (_, i) => {
    const rawLast = repsLastTime(i);
    const reps = isPureBodyweight
      ? Math.min(30, Math.max(minReps, rawLast))
      : clampToRange(rawLast);
    const cap = isPureBodyweight ? 30 : maxReps;
    const prevSet = evalSets[i];
    const atSameLoad =
      prevSet !== undefined &&
      (isPureBodyweight || Math.abs(weightOf(prevSet) - prevWeight) <= 0.05 || weightOf(prevSet) >= prevWeight);
    const earnedRep =
      repsAdded < 2 &&
      reps < cap &&
      prevSet !== undefined &&
      atSameLoad &&
      hadQualityEffort(prevSet.actualRir, prevSet.targetRir);
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
  };
}
