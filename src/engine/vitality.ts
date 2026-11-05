import { BiometricLog, PillarScore, StrengthPillar, RadarPillar } from './types';
import { evaluateStrengthStandard } from './strengthStandards';

/**
 * Normalizes VO2 Max into a 0-100 vitality scale
 * Typical values: 30 = low (30), 45 = good (70), 55+ = elite (95-100)
 */
export function scoreVo2Max(vo2: number = 42): number {
  const score = ((vo2 - 25) / 35) * 100;
  return Math.min(100, Math.max(10, Math.round(score)));
}

/**
 * Normalizes Resting Heart Rate into a 0-100 vitality scale (lower is better)
 * 75 bpm = 40, 60 bpm = 75, 48 bpm = 95
 */
export function scoreRestingHr(rhr: number = 60): number {
  const score = ((85 - rhr) / 40) * 100;
  return Math.min(100, Math.max(10, Math.round(score)));
}

/**
 * Normalizes average Daily Steps into a 0-100 vitality scale
 * 5,000 steps = 40, 10,000 steps = 80, 15,000+ = 100
 */
export function scoreDailySteps(steps: number = 8500): number {
  const score = (steps / 13000) * 100;
  return Math.min(100, Math.max(10, Math.round(score)));
}

/**
 * Combines VO2 Max, Resting Heart Rate, and Steps into the 7th Pillar:
 * Vitality = 0.40 * VO2 + 0.30 * RHR + 0.30 * Steps
 */
export function calculateEngineVitalityScore(latestBiometrics?: BiometricLog): number {
  if (!latestBiometrics) return 72; // default healthy baseline
  const vo2Score = scoreVo2Max(latestBiometrics.vo2Max ?? 45);
  const rhrScore = scoreRestingHr(latestBiometrics.restingHr ?? 58);
  const stepsScore = scoreDailySteps(latestBiometrics.steps ?? 9200);

  const composite = 0.40 * vo2Score + 0.30 * rhrScore + 0.30 * stepsScore;
  return Math.round(composite);
}

/**
 * Computes the complete 7-Pillar Radar profile:
 * 6 Strength Movement Pillars + 7th Engine/Vitality Pillar
 */
const TIER_ORDER = ['Untrained', 'Novice', 'Intermediate', 'Advanced', 'Elite'] as const;

export function generate7PillarRadarData(
  pillarBestE1rm: Record<StrengthPillar, number>,
  bodyweightEmaKg: number,
  latestBiometrics?: BiometricLog,
  gender: 'male' | 'female' = 'male'
): PillarScore[] {
  const strengthPillars: StrengthPillar[] = [
    'Squat',
    'Hinge',
    'Horizontal Push',
    'Vertical Push',
    'Horizontal Pull',
    'Vertical Pull',
  ];

  const results: PillarScore[] = strengthPillars.map((pillar) => {
    const e1rm = pillarBestE1rm[pillar] || 0;
    const std = evaluateStrengthStandard(pillar, e1rm, bodyweightEmaKg, gender);

    // Map tier + sub-division onto 0–100 in equal steps: each of the 5 tiers is 20 points wide,
    // each sub-division 5, plus progress within it. A movement never logged scores 0 (no shape
    // is drawn for it), never a placeholder.
    const tierIndex = TIER_ORDER.indexOf(std.tier);
    const subIndex = (['I', 'II', 'III', 'IV'] as const).indexOf(std.subDivision);
    const pillarScore =
      e1rm > 0 ? Math.min(100, Math.round(tierIndex * 20 + subIndex * 5 + (std.percentageProgress / 100) * 5)) : 0;

    return {
      pillar,
      score: pillarScore,
      rawRatioOrScore: std.ratio,
      tier: std.tier,
      subDivision: std.subDivision,
    };
  });

  // 7th Pillar: Engine / Vitality — only scored from real watch data (0 = no data).
  const hasCardioData = Boolean(
    latestBiometrics && ((latestBiometrics.restingHr || 0) > 0 || (latestBiometrics.vo2Max || 0) > 0 || (latestBiometrics.steps || 0) > 0)
  );
  const vitalityScore = hasCardioData ? calculateEngineVitalityScore(latestBiometrics) : 0;
  results.push({
    pillar: 'Engine / Vitality',
    score: vitalityScore,
    rawRatioOrScore: latestBiometrics?.vo2Max ?? 45,
    tier: !hasCardioData ? 'Untrained' : vitalityScore >= 85 ? 'Elite' : vitalityScore >= 70 ? 'Advanced' : 'Intermediate',
  });

  return results;
}
