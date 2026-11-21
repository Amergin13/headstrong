import { BiometricLog, ReadinessState, WearableProvider, WorkoutSession } from './types';

/** Multi-day rolling window used to separate genuine recovery suppression from single-day wearable noise. */
export const MULTI_DAY_SUPPRESSION_WINDOW = 5;
/** Minimum suppressed days in the rolling window before flagging a sustained multi-day dip. */
export const MULTI_DAY_SUPPRESSION_MIN_DAYS = 4;

export type RecoveryTrendStatus = 'sustained_low' | 'single_day_dip' | 'steady' | 'primed';

export interface Set1RirConfirmation {
  status: 'pending' | 'confirmed_strong' | 'confirmed_manageable' | 'fatigue_confirmed';
  exerciseName?: string;
  actualRir?: number;
  targetRir?: number;
  message?: string;
}

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
  /** Multi-day trend filter distinguishing isolated single-day noise from sustained suppression. */
  trendStatus?: RecoveryTrendStatus;
  /** Number of suppressed recovery days in the last 5-day window (including today). */
  consecutiveLowDays?: number;
  /** 7-day rolling HRV percentage delta against the 14-day baseline. */
  rolling7dHrvChangePct?: number;
  /** True only for sustained multi-day suppression (never for isolated 1-day wearable dips). */
  recommendVolumeModulation?: boolean;
  /** Anti-nocebo guidance prompting the athlete to judge by warm-ups & Set 1 RIR on a single-day dip. */
  set1ConfirmationCue?: string;
}

/** Evaluates Set 1 working-set RIR in the active workout to confirm or override a morning wearable dip. */
export function evaluateSet1RirConfirmation(activeWorkout?: WorkoutSession | null): Set1RirConfirmation {
  if (!activeWorkout?.exercises?.length) return { status: 'pending' };
  for (const ex of activeWorkout.exercises) {
    const firstCompletedWorking = ex.sets.find(
      (s) => s.completed && !s.isWarmup && s.setType !== 'warmup'
    );
    if (!firstCompletedWorking) continue;
    const targetRir = firstCompletedWorking.targetRir ?? 2;
    const actualRir = firstCompletedWorking.actualRir ?? targetRir;
    if (actualRir >= targetRir) {
      return {
        status: 'confirmed_strong',
        exerciseName: ex.name,
        actualRir,
        targetRir,
        message: 'Set 1 felt on target — proceed with your planned session.',
      };
    }
    if (actualRir <= targetRir - 2 || (actualRir === 0 && targetRir >= 2)) {
      return {
        status: 'fatigue_confirmed',
        exerciseName: ex.name,
        actualRir,
        targetRir,
        message:
          'Set 1 felt noticeably harder than planned — consider trimming 1 set per lift or shifting to 2–3 RIR.',
      };
    }
    return {
      status: 'confirmed_manageable',
      exerciseName: ex.name,
      actualRir,
      targetRir,
      message: 'Set 1 was solid — stay with your planned loads and watch effort on later sets.',
    };
  }
  return { status: 'pending' };
}

function isHistoricalDaySuppressed(
  log: BiometricLog,
  meanHrv: number,
  meanRhr: number,
  effectiveProvider: WearableProvider | null
): boolean {
  if (effectiveProvider === 'whoop' && typeof log.recoveryScore === 'number') {
    return log.recoveryScore < 34;
  }
  if (effectiveProvider === 'fitbit' && typeof log.fitbitReadinessScore === 'number') {
    return log.fitbitReadinessScore < 30;
  }
  const hrvDrop = log.hrvRmssd > 0 && meanHrv > 0 ? ((log.hrvRmssd - meanHrv) / meanHrv) * 100 < -15 : false;
  const rhrRise = log.restingHr > 0 && meanRhr > 0 ? log.restingHr - meanRhr >= 4 : false;
  const lowSleep = log.sleepHours > 0 && log.sleepHours < 6.0;
  return hrvDrop || rhrRise || lowSleep;
}

/**
 * Multi-day wearable trend filter (De Oliveira et al., 2019; 2024 resistance-training HRV reviews):
 * Separates an isolated 1-day morning dip (anti-nocebo: verify with warm-ups & Set 1 RIR)
 * from a sustained multi-day suppressed recovery trend (>= 4 of last 5 days or >= 3 days with
 * rolling 7-day HRV down >= 10%).
 */
export function evaluateRecoveryTrend(params: {
  todayLog: BiometricLog;
  providerHistory: BiometricLog[];
  meanHrv: number;
  meanRhr: number;
  effectiveProvider: WearableProvider | null;
  todayIsLow: boolean;
  todayIsPrimed?: boolean;
}): {
  trendStatus: RecoveryTrendStatus;
  consecutiveLowDays: number;
  rolling7dHrvChangePct?: number;
  recommendVolumeModulation: boolean;
  set1ConfirmationCue?: string;
} {
  const { todayLog, providerHistory, meanHrv, meanRhr, effectiveProvider, todayIsLow, todayIsPrimed } = params;

  // Rolling 7-day HRV percentage delta vs 14-day baseline
  const recent7 = [...providerHistory.slice(-6), todayLog].filter((l) => (l.hrvRmssd || 0) > 0);
  const rolling7dHrvChangePct =
    recent7.length >= 3 && meanHrv > 0
      ? Math.round((((recent7.reduce((sum, l) => sum + l.hrvRmssd, 0) / recent7.length) - meanHrv) / meanHrv) * 1000) /
        10
      : undefined;

  if (!todayIsLow) {
    return {
      trendStatus: todayIsPrimed ? 'primed' : 'steady',
      consecutiveLowDays: 0,
      rolling7dHrvChangePct,
      recommendVolumeModulation: false,
    };
  }

  const recentPrior = providerHistory.slice(-(MULTI_DAY_SUPPRESSION_WINDOW - 1));
  const priorSuppressedCount = recentPrior.filter((l) =>
    isHistoricalDaySuppressed(l, meanHrv, meanRhr, effectiveProvider)
  ).length;
  const totalSuppressedInWindow = 1 + priorSuppressedCount;

  const isSustained =
    totalSuppressedInWindow >= MULTI_DAY_SUPPRESSION_MIN_DAYS ||
    (totalSuppressedInWindow >= 3 && rolling7dHrvChangePct !== undefined && rolling7dHrvChangePct <= -10);

  if (isSustained) {
    return {
      trendStatus: 'sustained_low',
      consecutiveLowDays: totalSuppressedInWindow,
      rolling7dHrvChangePct,
      recommendVolumeModulation: true,
    };
  }

  return {
    trendStatus: 'single_day_dip',
    consecutiveLowDays: totalSuppressedInWindow,
    rolling7dHrvChangePct,
    recommendVolumeModulation: false,
    set1ConfirmationCue: "Single-day dip — judge by warm-ups and Set 1 RIR before changing today's plan.",
  };
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
/**
 * The one recovery score shown anywhere (recovery card, knowledge graph, coach): the wearable's own
 * score when it has one, otherwise today's readiness against the 14-day baseline. Null when nothing
 * was measured today, so no number is shown.
 */
export function displayRecoveryScore(readiness: ReadinessEvaluation, latest?: BiometricLog): number | null {
  if (readiness.hasRecoveryData === false) return null;
  const provider = readiness.provider || latest?.source;
  const providerScore =
    provider === 'whoop' ? latest?.recoveryScore : provider === 'fitbit' ? latest?.fitbitReadinessScore : undefined;
  return providerScore ?? readiness.readinessScore ?? Math.max(1, Math.min(99, Math.round(60 + readiness.score * 20)));
}

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

  const hrvVal = todayLog.hrvRmssd || 0;
  const rhrVal = todayLog.restingHr || 0;
  const sleepVal = todayLog.sleepHours || 0;

  const zHrv = hrvVal > 0 ? (Math.log(Math.max(1, hrvVal)) - lnMeanHrv) / lnStdDevHrv : 0;
  const zRhr = rhrVal > 0 ? (rhrVal - meanRhr) / stdDevRhr : 0;
  const sleepNorm = sleepVal > 0 ? (sleepVal - 7.5) / 1.5 : 0;

  const score = 0.50 * zHrv - 0.30 * zRhr + 0.20 * sleepNorm;
  const roundedScore = Math.round(score * 100) / 100;
  const roundedZHrv = Math.round(zHrv * 100) / 100;
  const roundedZRhr = Math.round(zRhr * 100) / 100;
  const roundedSleep = Math.round(sleepNorm * 100) / 100;

  // Percentage change in HRV vs baseline (only when measured today):
  const hrvChangePercent = hrvVal > 0 && meanHrv > 0 ? ((hrvVal - meanHrv) / meanHrv) * 100 : 0;
  const rhrDeltaBpm = rhrVal > 0 ? rhrVal - meanRhr : 0;

  // Acute physiological strain flags (only when that metric was actually measured today):
  const isHrvDepressed = hrvVal > 0 && hrvChangePercent < -15;
  const isRhrElevated = rhrVal > 0 && rhrDeltaBpm >= 4;
  const isSleepDeprived = sleepVal > 0 && sleepVal < 6.0;

  // =========================================================================
  // PIPELINE 1: WHOOP RECOVERY PIPELINE (0 - 100%)
  // Green >= 67%, Yellow 34 - 66%, Red < 34%
  // =========================================================================
  if (effectiveProvider === 'whoop' || (typeof todayLog.recoveryScore === 'number' && !isNaN(todayLog.recoveryScore))) {
    const recScore = todayLog.recoveryScore ?? Math.max(1, Math.min(100, Math.round(55 + 20 * score)));

    if (recScore >= 67) {
      const mappedZ = Math.round((0.8 + ((recScore - 67) / 33) * 0.7) * 100) / 100;
      const trend = evaluateRecoveryTrend({
        todayLog,
        providerHistory,
        meanHrv,
        meanRhr,
        effectiveProvider: 'whoop',
        todayIsLow: false,
        todayIsPrimed: true,
      });
      return {
        state: 'Primed',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: sleepVal,
        reason: `Great recovery (${recScore}% - Green). Peak parasympathetic tone—ready to push for PRs and progressive overload.`,
        streakProtected: false,
        provider: 'whoop',
        readinessScore: recScore,
        scoreLabel: 'Recovery',
        ...trend,
      };
    }

    if (recScore >= 34) {
      const mappedZ = Math.round((((recScore - 34) / 33) * 1.4 - 0.7) * 100) / 100;
      const trend = evaluateRecoveryTrend({
        todayLog,
        providerHistory,
        meanHrv,
        meanRhr,
        effectiveProvider: 'whoop',
        todayIsLow: false,
      });
      return {
        state: 'Normal',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: sleepVal,
        reason: `Steady recovery (${recScore}% - Yellow). Standard double progression targets (1–2 RIR) apply today.`,
        streakProtected: false,
        provider: 'whoop',
        readinessScore: recScore,
        scoreLabel: 'Recovery',
        ...trend,
      };
    }

    // Red zone (< 34%): multi-day trend filter distinguishes isolated single-day noise vs sustained suppression
    const whoopLowTrend = evaluateRecoveryTrend({
      todayLog,
      providerHistory,
      meanHrv,
      meanRhr,
      effectiveProvider: 'whoop',
      todayIsLow: true,
    });
    return {
      state: 'Amber Shield',
      score: -1.0,
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: sleepVal,
      reason:
        whoopLowTrend.trendStatus === 'sustained_low'
          ? `Sustained Low Recovery (${recScore}% across ${whoopLowTrend.consecutiveLowDays} days). Your planned workout is ready—optionally trim 1 set per lift or leave 2–3 RIR today. Streak protected.`
          : `Single-Day Recovery Dip (${recScore}%). One low morning rarely limits strength—judge by warm-ups and Set 1 RIR before adjusting today's plan. Streak protected.`,
      streakProtected: true,
      provider: 'whoop',
      readinessScore: recScore,
      scoreLabel: 'Recovery',
      ...whoopLowTrend,
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
      const trend = evaluateRecoveryTrend({
        todayLog,
        providerHistory,
        meanHrv,
        meanRhr,
        effectiveProvider: 'fitbit',
        todayIsLow: false,
        todayIsPrimed: true,
      });
      return {
        state: 'Primed',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: sleepVal,
        reason: `High Readiness (${drs} - Pixel Watch). Autonomic recovery is primed—ready for peak training volume and PR attempts.`,
        streakProtected: false,
        provider: 'fitbit',
        readinessScore: drs,
        scoreLabel: 'Daily Readiness',
        ...trend,
      };
    }

    // Target Readiness (30 - 64) -> Normal unless acute physiological strain triggers Amber Shield
    if (drs >= 30) {
      if (isHrvDepressed || isRhrElevated || isSleepDeprived) {
        const triggers: string[] = [];
        if (isHrvDepressed) triggers.push(`HRV down ${Math.abs(Math.round(hrvChangePercent))}%`);
        if (isRhrElevated) triggers.push(`resting pulse +${Math.round(rhrDeltaBpm * 10) / 10} bpm`);
        if (isSleepDeprived) triggers.push(`${todayLog.sleepHours}h sleep`);
        const strainTrend = evaluateRecoveryTrend({
          todayLog,
          providerHistory,
          meanHrv,
          meanRhr,
          effectiveProvider: 'fitbit',
          todayIsLow: true,
        });

        return {
          state: 'Amber Shield',
          score: -1.0,
          zHrv: roundedZHrv,
          zRhr: roundedZRhr,
          sleepDeviation: roundedSleep,
          hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
          rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
          sleepHours: sleepVal,
          reason:
            strainTrend.trendStatus === 'sustained_low'
              ? `Sustained Low Recovery (${triggers.join(', ')} across ${strainTrend.consecutiveLowDays} days). Your planned workout is ready—optionally trim 1 set per lift or leave 2–3 RIR today. Streak protected.`
              : `Single-Day Readiness Dip (${triggers.join(', ')}). Judge by warm-ups and Set 1 RIR before adjusting today's plan. Streak protected.`,
          streakProtected: true,
          provider: 'fitbit',
          readinessScore: drs,
          scoreLabel: 'Daily Readiness',
          ...strainTrend,
        };
      }

      const mappedZ = Math.round((((drs - 30) / 34) * 1.4 - 0.7) * 100) / 100;
      const steadyTrend = evaluateRecoveryTrend({
        todayLog,
        providerHistory,
        meanHrv,
        meanRhr,
        effectiveProvider: 'fitbit',
        todayIsLow: false,
      });
      return {
        state: 'Normal',
        score: mappedZ,
        zHrv: roundedZHrv,
        zRhr: roundedZRhr,
        sleepDeviation: roundedSleep,
        hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
        rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
        sleepHours: sleepVal,
        reason: `Target Readiness (${drs} - Pixel Watch). Normal autonomic state. Standard double progression (1–2 RIR) applies today.`,
        streakProtected: false,
        provider: 'fitbit',
        readinessScore: drs,
        scoreLabel: 'Daily Readiness',
        ...steadyTrend,
      };
    }

    // Low Readiness (< 30) -> Amber Shield advisory with multi-day trend filtering
    const fitbitLowTrend = evaluateRecoveryTrend({
      todayLog,
      providerHistory,
      meanHrv,
      meanRhr,
      effectiveProvider: 'fitbit',
      todayIsLow: true,
    });
    return {
      state: 'Amber Shield',
      score: -1.0,
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: sleepVal,
      reason:
        fitbitLowTrend.trendStatus === 'sustained_low'
          ? `Sustained Low Readiness (${drs} across ${fitbitLowTrend.consecutiveLowDays} days). Your planned workout is ready—optionally trim 1 set per lift or leave 2–3 RIR today. Streak protected.`
          : `Single-Day Readiness Dip (${drs}). Judge by warm-ups and Set 1 RIR before adjusting today's plan. Streak protected.`,
      streakProtected: true,
      provider: 'fitbit',
      readinessScore: drs,
      scoreLabel: 'Daily Readiness',
      ...fitbitLowTrend,
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
    const hcLowTrend = evaluateRecoveryTrend({
      todayLog,
      providerHistory,
      meanHrv,
      meanRhr,
      effectiveProvider,
      todayIsLow: true,
    });

    return {
      state: 'Amber Shield',
      score: roundedScore,
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: sleepVal,
      reason:
        hcLowTrend.trendStatus === 'sustained_low'
          ? `Sustained Low Recovery (${triggers.join(', ')} across ${hcLowTrend.consecutiveLowDays} days). Your planned workout is ready—optionally trim 1 set per lift or leave 2–3 RIR today. Streak protected.`
          : `Single-Day Recovery Dip (${triggers.join(', ')}). Judge by warm-ups and Set 1 RIR before adjusting today's plan. Streak protected.`,
      streakProtected: true,
      provider: effectiveProvider || undefined,
      readinessScore: Math.max(1, Math.min(100, Math.round(55 + 20 * score))),
      scoreLabel: 'Readiness',
      ...hcLowTrend,
    };
  }

  if (score >= 0.8) {
    const trend = evaluateRecoveryTrend({
      todayLog,
      providerHistory,
      meanHrv,
      meanRhr,
      effectiveProvider,
      todayIsLow: false,
      todayIsPrimed: true,
    });
    return {
      state: 'Primed',
      score: roundedScore,
      zHrv: roundedZHrv,
      zRhr: roundedZRhr,
      sleepDeviation: roundedSleep,
      hrvChangePercent: Math.round(hrvChangePercent * 10) / 10,
      rhrDeltaBpm: Math.round(rhrDeltaBpm * 10) / 10,
      sleepHours: sleepVal,
      reason: 'Great sleep and heart rate recovery! Ready to push for new records.',
      streakProtected: false,
      provider: effectiveProvider || undefined,
      readinessScore: Math.max(1, Math.min(100, Math.round(55 + 20 * score))),
      scoreLabel: 'Readiness',
      ...trend,
    };
  }

  const steadyTrend = evaluateRecoveryTrend({
    todayLog,
    providerHistory,
    meanHrv,
    meanRhr,
    effectiveProvider,
    todayIsLow: false,
  });
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
    ...steadyTrend,
  };
}
