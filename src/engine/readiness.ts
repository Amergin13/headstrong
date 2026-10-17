import { BiometricLog, ReadinessState } from './types';

export interface ReadinessEvaluation {
  state: ReadinessState;
  score: number; // Z-composite score
  zHrv: number;
  zRhr: number;
  sleepDeviation: number;
  hrvChangePercent: number;
  rhrDeltaBpm: number;
  sleepHours: number;
  reason: string;
  xpMultiplier: number;
  streakProtected: boolean;
}

/**
 * Calculates mean and sample standard deviation of an array of numbers
 */
export function calculateMeanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 1 };
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  if (values.length === 1) return { mean, stdDev: 1 };

  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
  const stdDev = Math.max(0.001, Math.sqrt(variance)); // prevent divide by zero
  return { mean, stdDev };
}

/**
 * Calculates daily Readiness Z-Score from Pixel Watch HRV, Resting HR, and Sleep
 * against a 14-day rolling baseline:
 * Readiness Z-Score = 0.50 * Z_HRV - 0.30 * Z_RHR + 0.20 * ((Sleep_hrs - 7.5) / 1.5)
 */
export function calculateDailyReadiness(
  todayLog: BiometricLog,
  historyLogs: BiometricLog[] // past logs up to 14 days
): ReadinessEvaluation {
  // Take last 14 logs excluding today if present
  const past14 = historyLogs
    .filter((l) => l.date !== todayLog.date)
    .slice(-14);

  let meanHrv = 55;
  let stdDevHrv = 8;
  let meanRhr = 58;
  let stdDevRhr = 3;

  if (past14.length >= 3) {
    const hrvStats = calculateMeanAndStdDev(past14.map((l) => l.hrvRmssd));
    meanHrv = hrvStats.mean;
    stdDevHrv = hrvStats.stdDev;

    const rhrStats = calculateMeanAndStdDev(past14.map((l) => l.restingHr));
    meanRhr = rhrStats.mean;
    stdDevRhr = rhrStats.stdDev;
  }

  const zHrv = (todayLog.hrvRmssd - meanHrv) / stdDevHrv;
  const zRhr = (todayLog.restingHr - meanRhr) / stdDevRhr;
  const sleepNorm = (todayLog.sleepHours - 7.5) / 1.5;

  const score = 0.50 * zHrv - 0.30 * zRhr + 0.20 * sleepNorm;
  const roundedScore = Math.round(score * 100) / 100;

  // Percentage change in HRV vs baseline:
  const hrvChangePercent = meanHrv > 0 ? ((todayLog.hrvRmssd - meanHrv) / meanHrv) * 100 : 0;
  const rhrDeltaBpm = todayLog.restingHr - meanRhr;

  // Amber Shield conditions:
  // - HRV down > 15% (hrvChangePercent < -15)
  // - RHR +4 bpm (rhrDeltaBpm >= 4)
  // - Sleep < 6h (todayLog.sleepHours < 6)
  // - or composite score <= -0.8
  const isHrvDepressed = hrvChangePercent < -15;
  const isRhrElevated = rhrDeltaBpm >= 4;
  const isSleepDeprived = todayLog.sleepHours < 6.0;
  const isAmberShield = isHrvDepressed || isRhrElevated || isSleepDeprived || score <= -0.8;

  if (isAmberShield) {
    const triggers = [];
    if (isHrvDepressed) triggers.push(`heart rate recovery down ${Math.abs(Math.round(hrvChangePercent))}%`);
    if (isRhrElevated) triggers.push(`resting pulse +${Math.round(rhrDeltaBpm * 10) / 10} bpm`);
    if (isSleepDeprived) triggers.push(`${todayLog.sleepHours}h sleep`);
    if (triggers.length === 0) triggers.push(`lower recovery score`);

    return {
      state: 'Amber Shield',
      score: roundedScore,
      zHrv: Math.round(zHrv * 100) / 100,
      zRhr: Math.round(zRhr * 100) / 100,
      sleepDeviation: Math.round(sleepNorm * 100) / 100,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: todayLog.sleepHours,
      reason: `Recovery Mode (${triggers.join(', ')}). Weights are held steady today and your streak is protected.`,
      xpMultiplier: 1.0, // streak and XP preserved
      streakProtected: true,
    };
  }

  if (score >= 0.8) {
    return {
      state: 'Primed',
      score: roundedScore,
      zHrv: Math.round(zHrv * 100) / 100,
      zRhr: Math.round(zRhr * 100) / 100,
      sleepDeviation: Math.round(sleepNorm * 100) / 100,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: todayLog.sleepHours,
      reason: 'Great sleep and heart rate recovery! Ready to push for new records (+15% XP bonus).',
      xpMultiplier: 1.15,
      streakProtected: false,
    };
  }

  return {
    state: 'Normal',
    score: roundedScore,
    zHrv: Math.round(zHrv * 100) / 100,
    zRhr: Math.round(zRhr * 100) / 100,
    sleepDeviation: Math.round(sleepNorm * 100) / 100,
    hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
    rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
    sleepHours: todayLog.sleepHours,
    reason: 'Your recovery is right on track. Follow your normal target weights and reps today.',
    xpMultiplier: 1.0,
    streakProtected: false,
  };
}
