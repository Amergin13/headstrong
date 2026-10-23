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

    // Map tier + subdivision to 0-100 scale:
    // Untrained: 0 - 25
    // Novice: 25 - 50
    // Intermediate: 50 - 75
    // Advanced: 75 - 90
    // Elite: 90 - 100
    const tierOffsets: Record<string, number> = {
      Untrained: 0,
      Novice: 25,
      Intermediate: 50,
      Advanced: 75,
      Elite: 90,
    };
    const tierBase = tierOffsets[std.tier] ?? 0;
    const subOffset = (['I', 'II', 'III', 'IV'].indexOf(std.subDivision) / 4) * 20;
    const pillarScore = Math.min(100, Math.max(15, Math.round(tierBase + subOffset + std.percentageProgress * 0.05)));

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
