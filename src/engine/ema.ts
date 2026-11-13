import { BiometricLog } from './types';
import { daysBetweenLocalDates } from '../utils/date';

export const EMA_ALPHA = 0.25; // 0.25 for today, 0.75 for yesterday

/**
 * 7-Day Bodyweight EMA single step update:
 * EMA_today = (Weight_today * 0.25) + (EMA_yesterday * 0.75)
 */
export function calculateNextEma(todayWeight: number, yesterdayEma: number): number {
  const ema = todayWeight * EMA_ALPHA + yesterdayEma * (1 - EMA_ALPHA);
  return Math.round(ema * 100) / 100;
}

/**
 * Computes 7-Day EMA bodyweight array across chronological biometric logs
 */
export function calculateEmaSeries(
  rawLogs: { date: string; bodyweightKg: number }[]
): { date: string; weight: number; ema: number }[] {
  // Days without a weigh-in (0 = not measured) are skipped; multiple entries on the same date take the latest one logged.
  const byDate = new Map<string, number>();
  for (const l of rawLogs) {
    if (l.bodyweightKg > 0 && l.date) byDate.set(l.date, l.bodyweightKg);
  }
  const logs = [...byDate.entries()]
    .map(([date, bodyweightKg]) => ({ date, bodyweightKg }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (logs.length === 0) return [];

  const result: { date: string; weight: number; ema: number }[] = [];
  let currentEma = logs[0].bodyweightKg;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (i === 0) {
      currentEma = log.bodyweightKg;
    } else {
      // Gap-aware: a weigh-in after N days without one counts as N daily steps,
      // so a single reading after a break moves the average as much as it should.
      const days = Math.max(1, daysBetweenLocalDates(logs[i - 1].date, log.date));
      const alpha = 1 - Math.pow(1 - EMA_ALPHA, days);
      currentEma = Math.round((log.bodyweightKg * alpha + currentEma * (1 - alpha)) * 100) / 100;
    }
    result.push({
      date: log.date,
      weight: log.bodyweightKg,
      ema: Math.round(currentEma * 100) / 100,
    });
  }

  return result;
}

/**
 * Builds a fast lookup returning the athlete's smoothed 7-day EMA bodyweight on or before `date`
 * (or their earliest logged EMA if `date` precedes the first weigh-in), falling back only if no weigh-ins exist.
 */
export function buildBodyweightEmaLookup(
  logs: { date: string; bodyweightKg: number }[]
): (date: string, fallbackKg?: number) => number {
  const series = calculateEmaSeries(logs);
  return (date: string, fallbackKg: number = 0) => {
    if (series.length === 0) return fallbackKg;
    let best: number | undefined;
    for (const pt of series) {
      if (pt.date <= date) best = pt.ema;
      else break;
    }
    return best ?? series[0].ema;
  };
}

/** Most recent logged weigh-in by calendar date (tie-broken by latest array position). */
export function latestBodyweightLog(logs: BiometricLog[]): BiometricLog | undefined {
  let best: BiometricLog | undefined;
  for (const log of logs) {
    if (!(log.bodyweightKg > 0)) continue;
    if (!best || log.date >= best.date) best = log;
  }
  return best;
}

/** True when at least one real weigh-in (> 0 kg) has been recorded. */
export function hasMeasuredBodyweight(logs: BiometricLog[]): boolean {
  return logs.some((l) => l.bodyweightKg > 0);
}

/**
 * Returns latest 7-Day EMA bodyweight from a list of logs
 */
export function getLatestBodyweightEma(logs: BiometricLog[], fallbackKg: number = 80): number {
  if (!logs || logs.length === 0) return fallbackKg;
  const series = calculateEmaSeries(logs);
  return series[series.length - 1]?.ema ?? fallbackKg;
}
