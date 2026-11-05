import {
  Gender,
  StrengthPillar,
  StrengthTier,
  SubDivision,
  SubTierQuest,
  EquipmentType,
} from './types';
import { calculateRepsNeededForTargetE1RM } from './e1rm';
import { KilgoreLift, kilgoreThresholdsKg } from './kilgoreStandards';

export const TIERS: StrengthTier[] = ['Untrained', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
export const SUB_DIVISIONS: SubDivision[] = ['I', 'II', 'III', 'IV'];

export interface TierThresholds {
  Untrained: number;
  Novice: number;
  Intermediate: number;
  Advanced: number;
  Elite: number;
}

/**
 * Where each movement's levels come from (see kilgoreStandards.ts for the tables):
 * - Squat, Hinge (deadlift), Horizontal Push (bench), Vertical Push (standing press): Dr Lon Kilgore's
 *   performance standards (ExRx.net), by sex, bodyweight class and age group.
 * - Vertical Pull: Poliquin's structural balance ratio (Achieving Structural Balance, 1999): a
 *   supinated chin-up 1RM, bodyweight included, of 81% of the close-grip bench 1RM. Treise applies
 *   it to Kilgore's bench levels, because the app logs the bench press, not the close-grip bench.
 * - Horizontal Pull (rows): no published standard, so no level is given.
 */
export type StandardSource = 'kilgore' | 'poliquin' | 'none';

export const PILLAR_STANDARD_SOURCE: Record<StrengthPillar, StandardSource> = {
  Squat: 'kilgore',
  Hinge: 'kilgore',
  'Horizontal Push': 'kilgore',
  'Vertical Push': 'kilgore',
  'Vertical Pull': 'poliquin',
  'Horizontal Pull': 'none',
};

const KILGORE_LIFT: Partial<Record<StrengthPillar, KilgoreLift>> = {
  Squat: 'squat',
  Hinge: 'deadlift',
  'Horizontal Push': 'bench',
  'Vertical Push': 'press',
};

/** The age to pick a standards table by: only an age the athlete entered (else the 18–39 adult table). */
export function standardsAge(profile: { age?: number; ageEntered?: boolean }): number | undefined {
  return profile.ageEntered ? profile.age : undefined;
}

/** Poliquin (1999): supinated chin-up 81% of the close-grip bench press 1RM. */
export const POLIQUIN_CHIN_UP_TO_BENCH = 0.81;

/**
 * The 5 level thresholds as a ratio of bodyweight (Untrained, Novice, Intermediate, Advanced, Elite),
 * or null when the movement has no published standard.
 */
export function getThresholds(
  pillar: StrengthPillar,
  gender: Gender = 'male',
  bodyweightKg: number = 80,
  age?: number
): [number, number, number, number, number] | null {
  const bw = bodyweightKg > 0 ? bodyweightKg : 80;
  const sex = gender === 'female' ? 'female' : 'male';
  const lift = KILGORE_LIFT[pillar];
  if (lift) return kilgoreThresholdsKg(lift, sex, bw, age).map((kg) => kg / bw) as [number, number, number, number, number];
  if (pillar === 'Vertical Pull') {
    return kilgoreThresholdsKg('bench', sex, bw, age).map((kg) => (kg * POLIQUIN_CHIN_UP_TO_BENCH) / bw) as [number, number, number, number, number];
  }
  return null;
}

/**
 * Calculates current Tier, SubDivision (I, II, III, IV), and target for next sub-division
 */
export function evaluateStrengthStandard(
  pillar: StrengthPillar,
  e1rmKg: number,
  bodyweightEmaKg: number,
  gender: Gender = 'male',
  age?: number
): {
  ratio: number;
  tier: StrengthTier;
  subDivision: SubDivision;
  nextTier: StrengthTier;
  nextSubDivision: SubDivision;
  targetRatio: number;
  percentageProgress: number;
  /** Where the level comes from; 'none' means no published standard (no level is shown). */
  source: StandardSource;
} {
  const ratio = bodyweightEmaKg > 0 ? e1rmKg / bodyweightEmaKg : 0;
  const source = PILLAR_STANDARD_SOURCE[pillar];
  const thresholds = getThresholds(pillar, gender, bodyweightEmaKg, age);
  if (!thresholds) {
    return { ratio, tier: 'Untrained', subDivision: 'I', nextTier: 'Untrained', nextSubDivision: 'I', targetRatio: 0, percentageProgress: 0, source };
  }
  const [untrained, novice, intermediate, advanced, elite] = thresholds;

  // Each tier runs from its own threshold up to the next tier's, in 4 equal sub-divisions
  // (AGENTS.md §1.4: Δ = (Threshold_{T+1} − Threshold_T) / 4). On the male squat: Untrained 0.75–1.20,
  // Novice 1.20–1.50, Intermediate 1.50–2.00, Advanced 2.00–2.50, Elite 2.50+.
  const tierRange = (currentTier: StrengthTier, nextTierName: StrengthTier, lower: number, upper: number) => {
    const step = (upper - lower) / 4;
    // A lift exactly on a boundary reaches it (tolerance for floating-point division).
    const subIdx = Math.max(0, Math.min(3, Math.floor((ratio - lower) / step + 1e-9)));
    // Below the Untrained threshold there is no lower tier: it is all Untrained I, measured from 0.
    const prevRatio = ratio < lower ? 0 : lower + subIdx * step;
    const nextTargetRatio = subIdx === 3 ? upper : lower + (subIdx + 1) * step;
    const progress = Math.min(100, Math.max(0, ((ratio - prevRatio) / (nextTargetRatio - prevRatio)) * 100));

    return {
      ratio,
      tier: currentTier,
      subDivision: SUB_DIVISIONS[subIdx],
      nextTier: subIdx === 3 ? nextTierName : currentTier,
      nextSubDivision: subIdx === 3 ? ('I' as SubDivision) : SUB_DIVISIONS[subIdx + 1],
      targetRatio: nextTargetRatio,
      percentageProgress: Math.round(progress),
      source,
    };
  };

  const EPS = 1e-9;
  if (ratio < novice - EPS) return tierRange('Untrained', 'Novice', untrained, novice);
  if (ratio < intermediate - EPS) return tierRange('Novice', 'Intermediate', novice, intermediate);
  if (ratio < advanced - EPS) return tierRange('Intermediate', 'Advanced', intermediate, advanced);
  if (ratio < elite - EPS) return tierRange('Advanced', 'Elite', advanced, elite);

  // Elite and beyond
  const eliteStep = (elite * 0.25) / 4;
  const eliteOffset = Math.max(0, ratio - elite);
  const subIdx = Math.min(3, Math.floor(eliteOffset / eliteStep));
  const progress = Math.min(100, (eliteOffset / (eliteStep * 4)) * 100);

  return {
    ratio,
    tier: 'Elite',
    subDivision: SUB_DIVISIONS[subIdx],
    nextTier: 'Elite',
    nextSubDivision: subIdx < 3 ? SUB_DIVISIONS[subIdx + 1] : 'IV',
    targetRatio: elite + (subIdx + 1) * eliteStep,
    percentageProgress: Math.round(progress),
    source,
  };
}

/**
 * Computes the "Next Sub-Tier Quest" for an exercise
 * e.g. "Hit 92.5kg x 8 to reach Intermediate III"
 */
export function calculateSubTierQuest(
  pillar: StrengthPillar,
  currentE1rmKg: number,
  bodyweightEmaKg: number,
  workingWeightKg: number,
  targetReps: number = 8,
  equipment: EquipmentType = 'barbell',
  isRdl?: boolean,
  isWeightedCalisthenic?: boolean,
  gender: Gender = 'male',
  isolationMeta?: {
    isIsolation?: boolean;
    maxReps?: number;
    sfrScore?: number;
    resistanceProfile?: 'lengthened' | 'mid' | 'shortened';
  }
): SubTierQuest {
  const evalResult = evaluateStrengthStandard(pillar, currentE1rmKg, bodyweightEmaKg, gender);
  const targetE1rm = Math.round(evalResult.targetRatio * bodyweightEmaKg * 10) / 10;

  if (isolationMeta?.isIsolation) {
    const repGoal = isolationMeta.maxReps || Math.max(12, targetReps + 2);
    const sfr = isolationMeta.sfrScore || 9.0;
    const progress = Math.min(95, Math.max(35, Math.round((targetReps / repGoal) * 100)));

    return {
      pillar,
      currentTier: evalResult.tier,
      currentSubDivision: evalResult.subDivision,
      nextTier: evalResult.nextTier,
      nextSubDivision: evalResult.nextSubDivision,
      currentRatio: Math.round(evalResult.ratio * 100) / 100,
      targetRatio: Math.round(evalResult.targetRatio * 100) / 100,
      currentE1rm: Math.round(currentE1rmKg * 10) / 10,
      targetE1rm,
      targetWeightKg: workingWeightKg,
      repsNeededAtWeight: repGoal,
      percentageProgress: progress,
      displayText: `Next rep goal: ${workingWeightKg} kg × ${repGoal} clean reps`,
      isIsolationQuest: true,
      sfrScore: sfr,
      resistanceProfile: isolationMeta.resistanceProfile || 'lengthened',
    };
  }

  // Reps needed at working weight for Compound Pillar Benchmark Lifts:
  const repsNeeded = calculateRepsNeededForTargetE1RM(
    targetE1rm,
    workingWeightKg,
    2, // default 2 RIR standard
    equipment,
    isRdl,
    isWeightedCalisthenic,
    bodyweightEmaKg
  );

  const questTargetName = `${evalResult.nextTier} ${evalResult.nextSubDivision}`;
  const displayText = `Hit ${workingWeightKg}kg × ${repsNeeded} reps to reach ${questTargetName}`;

  return {
    pillar,
    currentTier: evalResult.tier,
    currentSubDivision: evalResult.subDivision,
    nextTier: evalResult.nextTier,
    nextSubDivision: evalResult.nextSubDivision,
    currentRatio: Math.round(evalResult.ratio * 100) / 100,
    targetRatio: Math.round(evalResult.targetRatio * 100) / 100,
    currentE1rm: Math.round(currentE1rmKg * 10) / 10,
    targetE1rm,
    targetWeightKg: workingWeightKg,
    repsNeededAtWeight: repsNeeded,
    percentageProgress: evalResult.percentageProgress,
    displayText,
    isIsolationQuest: false,
    sfrScore: isolationMeta?.sfrScore,
    resistanceProfile: isolationMeta?.resistanceProfile,
  };
}

/**
 * Whether an exercise counts toward a movement pillar's strength benchmark (E1RM charts,
 * strength standards). Isolation work, core, carries/holds and conditioning never do,
 * even when they are filed under a pillar for programming purposes.
 */
const NON_BENCHMARK_ID_PATTERN =
  /(calf|lateral|curl|pushdown|face-pull|crunch|fly|extension|-ext\b|upright-row|plank|sprint|hiit|raise|kickback|shrug|leg-ext|hollow|dead-bug|pike-plank)/;

export function isPillarBenchmarkExercise(ex: {
  exerciseId: string;
  isIsolation?: boolean;
  durationSeconds?: number;
  durationMinutesRange?: [number, number];
  repTargetType?: string;
}): boolean {
  if (ex.isIsolation) return false;
  if (ex.durationSeconds || ex.durationMinutesRange || ex.repTargetType === 'duration') return false;
  return !NON_BENCHMARK_ID_PATTERN.test(ex.exerciseId.toLowerCase());
}
