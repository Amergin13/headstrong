import {
  Gender,
  StrengthPillar,
  StrengthTier,
  SubDivision,
  SubTierQuest,
  EquipmentType,
} from './types';
import { calculateRepsNeededForTargetE1RM } from './e1rm';

export const TIERS: StrengthTier[] = ['Untrained', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
export const SUB_DIVISIONS: SubDivision[] = ['I', 'II', 'III', 'IV'];

export interface TierThresholds {
  Untrained: number;
  Novice: number;
  Intermediate: number;
  Advanced: number;
  Elite: number;
}

// Prompt: Male E1RM/BW thresholds:
// Squat: [0.75, 1.20, 1.50, 2.00, 2.50]
// Hinge: [0.95, 1.45, 1.80, 2.40, 3.00]
// Horizontal Push: [0.60, 0.90, 1.20, 1.55, 1.90]
// Vertical Push: [0.40, 0.60, 0.80, 1.05, 1.30]
// Horizontal Pull: [0.50, 0.75, 1.00, 1.30, 1.60]
// Vertical Pull (Total Mass): [0.85, 1.10, 1.35, 1.65, 1.95]
export const STRENGTH_STANDARDS_MALE: Record<StrengthPillar, [number, number, number, number, number]> = {
  Squat: [0.75, 1.20, 1.50, 2.00, 2.50],
  Hinge: [0.95, 1.45, 1.80, 2.40, 3.00],
  'Horizontal Push': [0.60, 0.90, 1.20, 1.55, 1.90],
  'Vertical Push': [0.40, 0.60, 0.80, 1.05, 1.30],
  'Horizontal Pull': [0.50, 0.75, 1.00, 1.30, 1.60],
  'Vertical Pull': [0.85, 1.10, 1.35, 1.65, 1.95],
};

// Female standards (~68% average relative scaling)
export const STRENGTH_STANDARDS_FEMALE: Record<StrengthPillar, [number, number, number, number, number]> = {
  Squat: [0.50, 0.85, 1.10, 1.45, 1.80],
  Hinge: [0.65, 1.00, 1.30, 1.75, 2.20],
  'Horizontal Push': [0.40, 0.60, 0.80, 1.05, 1.35],
  'Vertical Push': [0.25, 0.40, 0.55, 0.75, 0.95],
  'Horizontal Pull': [0.35, 0.50, 0.70, 0.90, 1.15],
  'Vertical Pull': [0.65, 0.85, 1.05, 1.25, 1.50],
};

export function getThresholds(pillar: StrengthPillar, gender: Gender = 'male'): [number, number, number, number, number] {
  return gender === 'female' ? STRENGTH_STANDARDS_FEMALE[pillar] : STRENGTH_STANDARDS_MALE[pillar];
}

/**
 * Calculates current Tier, SubDivision (I, II, III, IV), and target for next sub-division
 */
export function evaluateStrengthStandard(
  pillar: StrengthPillar,
  e1rmKg: number,
  bodyweightEmaKg: number,
  gender: Gender = 'male'
): {
  ratio: number;
  tier: StrengthTier;
  subDivision: SubDivision;
  nextTier: StrengthTier;
  nextSubDivision: SubDivision;
  targetRatio: number;
  percentageProgress: number;
} {
  const ratio = bodyweightEmaKg > 0 ? e1rmKg / bodyweightEmaKg : 0;
  const thresholds = getThresholds(pillar, gender);
  const [untrained, novice, intermediate, advanced, elite] = thresholds;

  // Define tier segments:
  // Below untrained:
  if (ratio < untrained) {
    const step = untrained / 4;
    const subIdx = Math.min(3, Math.floor(ratio / step));
    const nextSubIdx = (subIdx + 1) as 1 | 2 | 3 | 4;
    const targetRatio = nextSubIdx === 4 ? untrained : (subIdx + 1) * step;
    const prevRatio = subIdx * step;
    const progress = Math.min(100, Math.max(0, ((ratio - prevRatio) / step) * 100));

    return {
      ratio,
      tier: 'Untrained',
      subDivision: SUB_DIVISIONS[subIdx],
      nextTier: nextSubIdx === 4 ? 'Novice' : 'Untrained',
      nextSubDivision: nextSubIdx === 4 ? 'I' : SUB_DIVISIONS[subIdx + 1],
      targetRatio,
      percentageProgress: Math.round(progress),
    };
  }

  // Segment helper:
  const checkTierRange = (
    currentTier: StrengthTier,
    nextTierName: StrengthTier,
    lower: number,
    upper: number
  ) => {
    const step = (upper - lower) / 4;
    const offset = ratio - lower;
    const subIdx = Math.min(3, Math.floor(offset / step));
    const prevRatio = lower + subIdx * step;
    const nextTargetRatio = subIdx === 3 ? upper : lower + (subIdx + 1) * step;
    const progress = Math.min(100, Math.max(0, ((ratio - prevRatio) / step) * 100));

    return {
      ratio,
      tier: currentTier,
      subDivision: SUB_DIVISIONS[subIdx],
      nextTier: subIdx === 3 ? nextTierName : currentTier,
      nextSubDivision: subIdx === 3 ? 'I' : SUB_DIVISIONS[subIdx + 1],
      targetRatio: nextTargetRatio,
      percentageProgress: Math.round(progress),
    };
  };

  if (ratio < novice) {
    return checkTierRange('Novice', 'Intermediate', untrained, novice);
  }
  if (ratio < intermediate) {
    return checkTierRange('Intermediate', 'Advanced', novice, intermediate);
  }
  if (ratio < advanced) {
    return checkTierRange('Intermediate', 'Advanced', intermediate, advanced);
  }
  if (ratio < elite) {
    return checkTierRange('Advanced', 'Elite', advanced, elite);
  }

  // Elite and beyond
  const eliteStep = (elite * 0.25) / 4;
  const eliteOffset = ratio - elite;
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
