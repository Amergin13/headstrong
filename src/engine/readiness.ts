import { BiometricLog, ReadinessState, WearableProvider } from './types';

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
  streakProtected: boolean;
  provider?: WearableProvider;
  readinessScore?: number; // 1-100 score for display
  scoreLabel?: string; // 'Recovery' vs 'Daily Readiness' vs 'Readiness'
  hasRecoveryData?: boolean; // false when nothing was measured today, so no score may be shown
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
 * Calculates daily Readiness from Pixel Watch / Fitbit or Whoop telemetry against
 * an isolated 14-day rolling baseline for the active tracker:
 *
 * PIPELINE SEPARATION:
 * 1. Whoop Pipeline: Whoop Recovery Score (0-100%, Green >=67%, Yellow 34-66%, Red <34%)
 * 2. Pixel Watch / Fitbit Pipeline: Daily Readiness Score (1-100, High >=65, Target 30-64, Low <30)
 * 3. Health Connect / Standard: Section 2.1 Z-composite model (0.50*Z_HRV - 0.30*Z_RHR + 0.20*SleepNorm)
 *
 * BASELINE ISOLATION:
 * 14-day rolling baseline filters by active tracker to guarantee zero cross-contamination.
 */
export function calculateDailyReadiness(
  todayLog: BiometricLog,
  historyLogs: BiometricLog[], // past logs up to 14 days
  activeProvider?: WearableProvider | null
): ReadinessEvaluation {
  // Determine effective tracker
  const effectiveProvider: WearableProvider | null =
    activeProvider ??
    todayLog.source ??
    (typeof todayLog.recoveryScore === 'number'
      ? 'whoop'
      : typeof todayLog.fitbitReadinessScore === 'number'
      ? 'fitbit'
      : null);

  // No recovery data today (no wearable, or only a manual weigh-in): stay at the normal plan.
  // Never invent HRV / resting heart rate values.
  const hasCoreMetrics = (l: BiometricLog) => (l.hrvRmssd || 0) > 0 && (l.restingHr || 0) > 0;
  const hasProviderScore =
    typeof todayLog.recoveryScore === 'number' || typeof todayLog.fitbitReadinessScore === 'number';
  if (!hasCoreMetrics(todayLog) && !hasProviderScore) {
    return {
      state: 'Normal',
      score: 0,
      zHrv: 0,
      zRhr: 0,
      sleepDeviation: 0,
      hrvChangePercent: 0,
      rhrDeltaBpm: 0,
      sleepHours: todayLog.sleepHours || 0,
      reason: 'No recovery data today. Your plan runs at normal effort.',
      streakProtected: false,
      provider: effectiveProvider ?? undefined,
      hasRecoveryData: false,
    };
  }

  // Filter history logs strictly by active provider to guarantee zero cross-contamination
  const providerHistory = historyLogs.filter((l) => {
    if (!hasCoreMetrics(l)) return false;
    if (l.date === todayLog.date) return false;
    if (effectiveProvider === 'whoop') {
      return l.source === 'whoop' || (!l.source && l.recoveryScore !== undefined && l.fitbitReadinessScore === undefined);
    }
    if (effectiveProvider === 'fitbit') {
      return l.source === 'fitbit' || (!l.source && l.fitbitReadinessScore !== undefined) || (!l.source && l.recoveryScore === undefined);
    }
    if (effectiveProvider === 'health_connect') {
      return l.source === 'health_connect' || (!l.source && l.recoveryScore === undefined && l.fitbitReadinessScore === undefined);
    }
    return true;
  });

  const past14 = providerHistory.slice(-14);

  let meanHrv = 55;
  let stdDevHrv = 8;
  let lnMeanHrv = Math.log(55);
  let lnStdDevHrv = 0.15;
  let meanRhr = 58;
  let stdDevRhr = 3;

  if (past14.length >= 3) {
    const hrvStats = calculateMeanAndStdDev(past14.map((l) => l.hrvRmssd));
    meanHrv = hrvStats.mean;
    stdDevHrv = hrvStats.stdDev;
    // HRV is log-normally distributed, so the z-score uses ln(rMSSD) (Plews et al., 2013).
    const lnStats = calculateMeanAndStdDev(past14.map((l) => Math.log(Math.max(1, l.hrvRmssd))));
    lnMeanHrv = lnStats.mean;
    lnStdDevHrv = lnStats.stdDev;

    const rhrStats = calculateMeanAndStdDev(past14.map((l) => l.restingHr));
    meanRhr = rhrStats.mean;
    stdDevRhr = rhrStats.stdDev;
  }

  const zHrv = (Math.log(Math.max(1, todayLog.hrvRmssd)) - lnMeanHrv) / lnStdDevHrv;
  const zRhr = (todayLog.restingHr - meanRhr) / stdDevRhr;
  const sleepNorm = (todayLog.sleepHours - 7.5) / 1.5;

  const score = 0.50 * zHrv - 0.30 * zRhr + 0.20 * sleepNorm;
  const roundedScore = Math.round(score * 100) / 100;
  const roundedZHrv = Math.round(zHrv * 100) / 100;
  const roundedZRhr = Math.round(zRhr * 100) / 100;
  const roundedSleep = Math.round(sleepNorm * 100) / 100;

  // Percentage change in HRV vs baseline:
  const hrvChangePercent = meanHrv > 0 ? ((todayLog.hrvRmssd - meanHrv) / meanHrv) * 100 : 0;
  const rhrDeltaBpm = todayLog.restingHr - meanRhr;

  // Acute physiological strain flags:
  const isHrvDepressed = hrvChangePercent < -15;
  const isRhrElevated = rhrDeltaBpm >= 4;
  const isSleepDeprived = todayLog.sleepHours < 6.0;

  // =========================================================================
  // PIPELINE 1: WHOOP RECOVERY PIPELINE (0 - 100%)
  // Green >= 67%, Yellow 34 - 66%, Red < 34%
  // =========================================================================
  if (effectiveProvider === 'whoop' || (typeof todayLog.recoveryScore === 'number' && !isNaN(todayLog.recoveryScore))) {
    const recScore = todayLog.recoveryScore ?? Math.max(1, Math.min(100, Math.round(55 + 20 * score)));

    if (recScore >= 67) {
      const mappedZ = Math.round((0.8 + ((recScore - 67) / 33) * 0.7) * 100) / 100;
      return {
        state: 'Primed',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: todayLog.sleepHours,
        reason: `Great recovery (${recScore}% - Green). Peak parasympathetic tone—ready to push for PRs and progressive overload.`,
        streakProtected: false,
        provider: 'whoop',
        readinessScore: recScore,
        scoreLabel: 'Recovery',
      };
    }

    if (recScore >= 34) {
      const mappedZ = Math.round((((recScore - 34) / 33) * 1.4 - 0.7) * 100) / 100;
      return {
        state: 'Normal',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: todayLog.sleepHours,
        reason: `Steady recovery (${recScore}% - Yellow). Standard double progression targets (1–2 RIR) apply today.`,
        streakProtected: false,
        provider: 'whoop',
        readinessScore: recScore,
        scoreLabel: 'Recovery',
      };
    }

    // Red zone (< 34%): Amber Shield triggered
    return {
      state: 'Amber Shield',
      score: -1.0,
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: todayLog.sleepHours,
      reason: `Recovery Shield Active (${recScore}% - Red). Working loads are held steady today (2–3 RIR buffer) and your streak is protected.`,
      streakProtected: true,
      provider: 'whoop',
      readinessScore: recScore,
      scoreLabel: 'Recovery',
    };
  }

  // =========================================================================
  // PIPELINE 2: PIXEL WATCH / FITBIT DAILY READINESS PIPELINE (1 - 100)
  // High Readiness >= 65, Target Readiness 30 - 64, Low Readiness < 30
  // =========================================================================
  if (
    effectiveProvider === 'fitbit' ||
    typeof todayLog.fitbitReadinessScore === 'number' ||
    (todayLog.source === 'fitbit' && typeof todayLog.readinessScore === 'number')
  ) {
    const drs =
      todayLog.fitbitReadinessScore ??
      todayLog.readinessScore ??
      Math.max(1, Math.min(100, Math.round(55 + 20 * score)));

    // High Readiness (>= 65) -> Primed
    if (drs >= 65) {
      const mappedZ = Math.round((0.8 + ((drs - 65) / 35) * 0.7) * 100) / 100;
      return {
        state: 'Primed',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: todayLog.sleepHours,
        reason: `High Readiness (${drs} - Pixel Watch). Autonomic recovery is primed—ready for peak training volume and PR attempts.`,
        streakProtected: false,
        provider: 'fitbit',
        readinessScore: drs,
        scoreLabel: 'Daily Readiness',
      };
    }

    // Target Readiness (30 - 64) -> Normal unless acute physiological strain triggers Amber Shield
    if (drs >= 30) {
      if (isHrvDepressed || isRhrElevated || isSleepDeprived) {
        const triggers: string[] = [];
        if (isHrvDepressed) triggers.push(`HRV down ${Math.abs(Math.round(hrvChangePercent))}%`);
        if (isRhrElevated) triggers.push(`resting pulse +${Math.round(rhrDeltaBpm * 10) / 10} bpm`);
        if (isSleepDeprived) triggers.push(`${todayLog.sleepHours}h sleep`);

        return {
          state: 'Amber Shield',
          score: -1.0,
          zHrv: roundedZHrv,
          zRhr: roundedZRhr,
          sleepDeviation: roundedSleep,
          hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
          rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
          sleepHours: todayLog.sleepHours,
          reason: `Recovery Shield Active (${triggers.join(', ')}). Daily Readiness (${drs}) with elevated fatigue. Loads held steady and streak protected.`,
          streakProtected: true,
          provider: 'fitbit',
          readinessScore: drs,
          scoreLabel: 'Daily Readiness',
        };
      }

      const mappedZ = Math.round((((drs - 30) / 34) * 1.4 - 0.7) * 100) / 100;
      return {
        state: 'Normal',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: todayLog.sleepHours,
        reason: `Target Readiness (${drs} - Pixel Watch). Normal autonomic state. Standard double progression (1–2 RIR) applies today.`,
        streakProtected: false,
        provider: 'fitbit',
        readinessScore: drs,
        scoreLabel: 'Daily Readiness',
      };
    }

    // Low Readiness (< 30) -> Amber Shield
    return {
      state: 'Amber Shield',
      score: -1.0,
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: todayLog.sleepHours,
      reason: `Recovery Shield Active (${drs} Low Readiness - Pixel Watch). Body is carrying high fatigue. Loads held steady (2–3 RIR buffer) and streak protected.`,
      streakProtected: true,
      provider: 'fitbit',
      readinessScore: drs,
      scoreLabel: 'Daily Readiness',
    };
  }

  // =========================================================================
  // PIPELINE 3: HEALTH CONNECT / SECTION 2.1 STATISTICAL Z-SCORE BASELINE
  // Primed (Z >= +0.8), Normal (-0.8 < Z < +0.8), Amber Shield (Z <= -0.8 or acute drops)
  // =========================================================================
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
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: todayLog.sleepHours,
      reason: `Recovery Mode (${triggers.join(', ')}). Weights are held steady today and your streak is protected.`,
      streakProtected: true,
      provider: effectiveProvider || undefined,
      readinessScore: Math.max(1, Math.min(100, Math.round(55 + 20 * score))),
      scoreLabel: 'Readiness',
    };
  }

  if (score >= 0.8) {
    return {
      state: 'Primed',
      score: roundedScore,
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: todayLog.sleepHours,
      reason: 'Great sleep and heart rate recovery! Ready to push for new records.',
      streakProtected: false,
      provider: effectiveProvider || undefined,
      readinessScore: Math.max(1, Math.min(100, Math.round(55 + 20 * score))),
      scoreLabel: 'Readiness',
    };
  }

  return {
    state: 'Normal',
    score: roundedScore,
    zHrv: roundedZHrv,
    zRhr: roundedZRhr,
    sleepDeviation: roundedSleep,
    hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
    rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
    sleepHours: todayLog.sleepHours,
    reason: 'Your recovery is right on track. Follow your normal target weights and reps today.',
    streakProtected: false,
    provider: effectiveProvider || undefined,
    readinessScore: Math.max(1, Math.min(100, Math.round(55 + 20 * score))),
    scoreLabel: 'Readiness',
  };
}
