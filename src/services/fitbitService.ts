import { BiometricLog, ReadinessState } from '../engine/types';
import { localDateString } from '../utils/date';
import { parseHealthConnectExport } from './healthConnectService';

/**
 * Legacy Fitbit Web API decommission note:
 * Google permanently shut down the legacy Fitbit Web API on November 2, 2026 (410 Gone).
 * Fitbit and Google Pixel Watch telemetry now flows automatically through Android Health Connect
 * (sleep, heart rate, resting HR, HRV, weight, body fat, steps, and workouts) with zero cloud
 * OAuth proxy or Restricted-scope review dependency.
 */
export const FITBIT_WEB_API_DECOMMISSIONED_DATE = '2026-11-02';
export const FITBIT_HEALTH_CONNECT_MIGRATION_MESSAGE =
  'Google shut down the legacy Fitbit Web API on November 2, 2026. Connect Android Health Connect in the Treise app so your Fitbit and Pixel Watch data (sleep, HR, HRV, weight, body fat, steps, and workouts) syncs automatically.';

export interface FitbitServerConfig {
  configured: false;
  decommissioned: true;
  recommendedProvider: 'health_connect';
}

/** Legacy Fitbit Web API OAuth is permanently decommissioned; routes athletes to Android Health Connect. */
export async function getFitbitConfig(): Promise<FitbitServerConfig> {
  return {
    configured: false,
    decommissioned: true,
    recommendedProvider: 'health_connect',
  };
}

export { generateRandomString, generateCodeChallenge } from './pkce';

/**
 * Parses a Fitbit / Google Takeout CSV or JSON export (daily readiness, HRV, resting heart rate,
 * sleep, steps, or Health Connect JSON) into BiometricLog records tagged with `source: 'fitbit'`.
 * Missing fields remain 0 ("not measured").
 */
export function parseFitbitExport(rawInput: string | Record<string, any>): BiometricLog[] {
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const logs = parseHealthConnectExport(trimmed);
      return logs.map((l) => ({ ...l, source: 'fitbit' as const }));
    }

    // CSV export format (Fitbit / Google Takeout CSVs: e.g. Daily Readiness Score, HRV, Sleep, Steps)
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/["'_\-\s]/g, ''));
    const findCol = (...candidates: string[]) => {
      const normCandidates = candidates.map((c) => c.toLowerCase().replace(/["'_\-\s]/g, ''));
      return headers.findIndex((h) => normCandidates.some((c) => h === c || h.includes(c)));
    };

    const dateIdx = findCol('date', 'timestamp', 'sleep_end', 'start_time');
    const hrvIdx = findCol('rmssd', 'hrv', 'heart_rate_variability', 'daily_rmssd');
    const rhrIdx = findCol('resting_heart_rate', 'restingheartrate', 'rhr', 'beats_per_minute');
    const sleepIdx = findCol('minutes_asleep', 'minutesasleep', 'total_minutes_asleep', 'sleep_hours', 'asleep_duration');
    const stepsIdx = findCol('steps', 'step_count');
    const azmIdx = findCol('active_zone_minutes', 'activezoneminutes', 'total_minutes', 'azm');
    const weightIdx = findCol('weight_kg', 'weight', 'bodyweight');
    const readinessIdx = findCol('readiness_score', 'daily_readiness', 'readiness', 'score');

    const byDate = new Map<string, BiometricLog>();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/["']/g, ''));
      if (cols.length < 2) continue;
      const rawDate = dateIdx >= 0 ? cols[dateIdx] : cols[0];
      const m = rawDate?.match(/(\d{4}-\d{2}-\d{2})/);
      const date = m ? m[1] : '';
      if (!date) continue;

      const existing: BiometricLog = byDate.get(date) || {
        date,
        bodyweightKg: 0,
        hrvRmssd: 0,
        restingHr: 0,
        sleepHours: 0,
        steps: 0,
        activeZoneMinutes: 0,
        source: 'fitbit',
      };

      const num = (idx: number) => (idx >= 0 ? parseFloat(cols[idx]) : NaN);
      const hrv = num(hrvIdx);
      const rhr = num(rhrIdx);
      const slp = num(sleepIdx);
      const stp = num(stepsIdx);
      const azm = num(azmIdx);
      const wgt = num(weightIdx);
      const rdy = num(readinessIdx);

      if (!isNaN(hrv) && hrv > 0) existing.hrvRmssd = Math.round(hrv);
      if (!isNaN(rhr) && rhr > 0) existing.restingHr = Math.round(rhr);
      if (!isNaN(slp) && slp > 0) {
        existing.sleepHours = slp > 24 ? Math.round((slp / 60) * 10) / 10 : Math.round(slp * 10) / 10;
      }
      if (!isNaN(stp) && stp >= 0) existing.steps = Math.round(stp);
      if (!isNaN(azm) && azm >= 0) existing.activeZoneMinutes = Math.round(azm);
      if (!isNaN(wgt) && wgt > 0) existing.bodyweightKg = Math.round(wgt * 10) / 10;
      if (!isNaN(rdy) && rdy > 0 && rdy <= 100) {
        existing.fitbitReadinessScore = Math.round(rdy);
        existing.readinessScore = Math.round(rdy);
      }

      byDate.set(date, existing);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  return parseHealthConnectExport(rawInput).map((l) => ({ ...l, source: 'fitbit' as const }));
}

export interface WatchSyncProgress {
  stage: 'idle' | 'connecting' | 'hrv' | 'sleep' | 'steps' | 'complete' | 'error';
  percent: number;
  message: string;
}

/**
 * Explicit Demo-Mode Pixel Watch Telemetry Simulator (used only when athlete loads demo data).
 */
export async function simulatePixelWatchSync(
  onProgress?: (progress: WatchSyncProgress) => void,
  forcedState?: ReadinessState
): Promise<BiometricLog> {
  const todayStr = localDateString();

  const update = (stage: WatchSyncProgress['stage'], percent: number, message: string) => {
    if (onProgress) onProgress({ stage, percent, message });
  };

  update('connecting', 15, 'Connecting to Google Pixel Watch...');
  await new Promise((r) => setTimeout(r, 400));

  update('hrv', 40, 'Syncing overnight heart rate recovery...');
  await new Promise((r) => setTimeout(r, 450));

  update('sleep', 70, 'Syncing last night’s sleep hours...');
  await new Promise((r) => setTimeout(r, 450));

  update('steps', 90, 'Syncing daily steps and active minutes...');
  await new Promise((r) => setTimeout(r, 350));

  let hrv = 62;
  let rhr = 54;
  let sleep = 7.8;
  let steps = 9850;
  let azm = 45;
  let fitbitReadinessScore = 78;

  if (forcedState === 'Amber Shield') {
    hrv = 41; // >15% drop
    rhr = 64; // elevated
    sleep = 5.2; // <6h
    steps = 6200;
    azm = 18;
    fitbitReadinessScore = 24; // Low Readiness (<30)
  } else if (forcedState === 'Primed') {
    hrv = 69;
    rhr = 51;
    sleep = 8.3;
    steps = 11400;
    azm = 56;
    fitbitReadinessScore = 88; // High Readiness (>=65)
  }

  const syncedLog: BiometricLog = {
    date: todayStr,
    bodyweightKg: 82.1,
    hrvRmssd: hrv,
    restingHr: rhr,
    sleepHours: sleep,
    steps,
    activeZoneMinutes: azm,
    vo2Max: 46.2,
    avgWorkoutHr: 144,
    workoutDurationMin: 65,
    fitbitReadinessScore,
    readinessScore: fitbitReadinessScore,
    source: 'fitbit',
  };

  update('complete', 100, 'Pixel Watch readiness data synced!');
  return syncedLog;
}
