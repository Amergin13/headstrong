import { BiometricLog, ReadinessState, WearableSyncProgress } from '../engine/types';
import { generateCodeChallenge, generateRandomString } from './fitbitService';
import { localDateString } from '../utils/date';
import { publishRefreshedTokens } from './wearableTokens';

export function getWhoopRedirectUri(customUri?: string): string {
  if (customUri && customUri.trim()) {
    return customUri.trim();
  }
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('whoop_redirect_uri');
    if (saved && saved.trim()) return saved.trim();
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/oauth/whoop/callback`;
  }
  return 'https://treise.vercel.app/oauth/whoop/callback';
}

export function generateAlphanumericString(length: number = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const WHOOP_CONFIG = {
  // Public OAuth client ID. The client secret lives only in the serverless
  // token proxy (WHOOP_CLIENT_SECRET env var) and is never shipped to the browser.
  CLIENT_ID: '8bcb0a0d-b6ff-42e0-82b7-c3508e18c9f8',
  AUTHORIZATION_URI: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  TOKEN_URI: 'https://api.prod.whoop.com/oauth/oauth2/token',
  SCOPES: [
    'offline',
    'read:recovery',
    'read:cycles',
    'read:workout',
    'read:sleep',
  ],
  REDIRECT_URI:
    typeof window !== 'undefined'
      ? `${window.location.origin}/oauth/whoop/callback`
      : 'https://treise.vercel.app/oauth/whoop/callback',
};

/**
 * Initiates Whoop OAuth 2.0 Authorization flow.
 */
export async function initiateWhoopOAuth(
  clientId: string = WHOOP_CONFIG.CLIENT_ID,
  customRedirectUri?: string
): Promise<string> {
  const state = `whoop_${generateAlphanumericString(12)}`;
  const redirectUri = getWhoopRedirectUri(customRedirectUri);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('whoop_oauth_state', state);
      localStorage.setItem('whoop_redirect_uri', redirectUri);
      if (clientId) {
        localStorage.setItem('whoop_client_id', clientId);
      }
    } catch {
      // In case localStorage is blocked
    }
    sessionStorage.setItem('whoop_oauth_state', state);
    sessionStorage.setItem('whoop_redirect_uri', redirectUri);
    if (clientId) {
      sessionStorage.setItem('whoop_client_id', clientId);
    }
  }

  // WHOOP requires standard space-delimited scopes (%20)
  const scopeString = WHOOP_CONFIG.SCOPES.join(' ');
  const queryParts = [
    `response_type=code`,
    `client_id=${encodeURIComponent(clientId)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=${encodeURIComponent(scopeString)}`,
    `state=${encodeURIComponent(state)}`,
  ];

  return `${WHOOP_CONFIG.AUTHORIZATION_URI}?${queryParts.join('&')}`;
}

/**
 * Exchanges authorization code for Whoop access and refresh tokens.
 * Supports both direct PKCE and serverless proxy (for CORS prevention).
 */
export async function exchangeWhoopCodeForToken(
  code: string,
  clientId?: string,
  _clientSecret?: string,
  customRedirectUri?: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; userId?: string }> {
  const codeVerifier =
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_code_verifier')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_code_verifier')) ||
    '';
  const effectiveClientId =
    clientId ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_client_id')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_client_id')) ||
    WHOOP_CONFIG.CLIENT_ID;
  const redirectUri =
    customRedirectUri ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_redirect_uri')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_redirect_uri')) ||
    getWhoopRedirectUri();

  const bodyParams = new URLSearchParams({
    client_id: effectiveClientId,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  if (codeVerifier) {
    bodyParams.append('code_verifier', codeVerifier);
  }

  // The token exchange always goes through the serverless proxy, which adds the
  // client secret server-side. There is deliberately no direct browser fallback.
  const proxyResponse = await fetch('/api/whoop/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!proxyResponse.ok) {
    const errData = await proxyResponse.json().catch(() => ({}));
    const errMsg = errData.error_description || errData.error || `HTTP ${proxyResponse.status}`;
    throw new Error(`Whoop token exchange failed: ${errMsg}`);
  }

  const data = await proxyResponse.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    userId: data.user?.id ? String(data.user.id) : undefined,
  };
}

/**
 * Refreshes an expired Whoop access token using a refresh token (via the serverless proxy).
 */
export async function refreshWhoopToken(
  refreshToken: string,
  clientId?: string,
  _clientSecret?: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const effectiveClientId =
    clientId ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_client_id')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_client_id')) ||
    WHOOP_CONFIG.CLIENT_ID;

  const bodyParams = new URLSearchParams({
    client_id: effectiveClientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const proxyResponse = await fetch('/api/whoop/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!proxyResponse.ok) {
    throw new Error(`Whoop token refresh failed: HTTP ${proxyResponse.status}`);
  }

  const data = await proxyResponse.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches daily telemetry from Whoop Developer API (v1 / v2):
 * - Prioritizes /api/whoop/biometrics serverless aggregator (zero CORS, server-to-server)
 * - Falls back to direct browser fetch if serverless proxy is unreachable
 * - Recovery: recovery_score, resting_heart_rate, hrv_rmssd_milli
 * - Sleep: total_sleep_time (hours)
 * - Cycle: strain, steps, kilojoules -> activeZoneMinutes
 * - Body: weight_kilogram
 */
export async function fetchWhoopDailyBiometrics(
  accessToken: string,
  dateStr?: string,
  refreshToken?: string,
  workoutWindow?: { start: string; end: string }
): Promise<Partial<BiometricLog>> {
  const date = dateStr || localDateString();
  const effectiveRefreshToken =
    refreshToken ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_refresh_token')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_refresh_token')) ||
    undefined;

  // 1. Primary: Serverless Aggregator Proxy (zero CORS, server-to-server)
  try {
    const proxyRes = await fetch('/api/whoop/biometrics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        accessToken,
        refreshToken: effectiveRefreshToken,
        workoutWindowStart: workoutWindow?.start,
        workoutWindowEnd: workoutWindow?.end,
      }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.success && data.biometrics) {
        // Save rotated tokens to the profile (Whoop refresh tokens are single-use).
        publishRefreshedTokens('whoop', data.refreshedTokens);
        return {
          ...data.biometrics,
          avgWorkoutHr:
            data.biometrics.avgWorkoutHr ??
            data.biometrics.workoutAvgHr ??
            data.biometrics.avgHeartRate ??
            data.biometrics.cycleAvgHr,
          maxWorkoutHr:
            data.biometrics.maxWorkoutHr ??
            data.biometrics.workoutMaxHr ??
            data.biometrics.maxHeartRate ??
            data.biometrics.cycleMaxHr,
          date,
        };
      }
    } else {
      const errJson = await proxyRes.json().catch(() => ({}));
      console.warn('Whoop biometrics proxy response error:', proxyRes.status, errJson);
    }
  } catch (proxyErr) {
    console.warn('Whoop biometrics proxy connection error:', proxyErr);
  }

  // 2. Direct Fallback
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const results: Partial<BiometricLog> = { date };

  const getLatestRecord = (recordsData: any) => {
    if (!recordsData) return null;
    const records = Array.isArray(recordsData.records)
      ? recordsData.records
      : Array.isArray(recordsData)
      ? recordsData
      : [recordsData];
    if (records.length === 0) return null;
    const scored = records.filter((r: any) => r && (r.score || r.score_state === 'SCORED'));
    const candidateList = scored.length > 0 ? scored : records;
    return [...candidateList].sort((a: any, b: any) => {
      const timeA = new Date(a.created_at || a.updated_at || a.start || 0).getTime();
      const timeB = new Date(b.created_at || b.updated_at || b.start || 0).getTime();
      return timeB - timeA;
    })[0];
  };

  const fetchWithFallback = async (urlV2: string, urlV1: string) => {
    try {
      const res2 = await fetch(urlV2, { headers });
      if (res2.ok) return res2;
      if (res2.status !== 401) {
        const res1 = await fetch(urlV1, { headers });
        if (res1.ok) return res1;
      }
      return res2;
    } catch {
      return fetch(urlV1, { headers }).catch(() => null);
    }
  };

  try {
    const recRes = await fetchWithFallback(
      'https://api.prod.whoop.com/developer/v2/recovery?limit=10',
      'https://api.prod.whoop.com/developer/v1/recovery?limit=10'
    );
    if (recRes && recRes.ok) {
      const recData = await recRes.json();
      const latest = getLatestRecord(recData);
      if (latest?.score) {
        const rawHrv =
          typeof latest.score.hrv_rmssd_milli === 'number'
            ? latest.score.hrv_rmssd_milli
            : typeof latest.score.heart_rate_variability_milli === 'number'
            ? latest.score.heart_rate_variability_milli
            : typeof latest.score.heart_rate_variability_rmssd === 'number'
            ? latest.score.heart_rate_variability_rmssd
            : latest.score.hrv;
        if (typeof rawHrv === 'number' && !isNaN(rawHrv)) {
          results.hrvRmssd = Math.round(rawHrv);
        }
        if (typeof latest.score.resting_heart_rate === 'number' && !isNaN(latest.score.resting_heart_rate)) {
          results.restingHr = Math.round(latest.score.resting_heart_rate);
        }
      }
    }
  } catch (e) {
    console.warn('Could not fetch Whoop recovery directly:', e);
  }

  try {
    const sleepRes = await fetchWithFallback(
      'https://api.prod.whoop.com/developer/v2/activity/sleep?limit=10',
      'https://api.prod.whoop.com/developer/v1/activity/sleep?limit=10'
    );
    if (sleepRes && sleepRes.ok) {
      const sleepData = await sleepRes.json();
      const latest = getLatestRecord(sleepData);
      const stages = latest?.score?.stage_summary;
      if (stages) {
        const totalInBed = stages.total_in_bed_time_milli || 0;
        const totalAwake = stages.total_awake_time_milli || 0;
        const asleepMs = Math.max(0, totalInBed - totalAwake);
        if (asleepMs > 0) {
          results.sleepHours = Math.round((asleepMs / 3600000) * 10) / 10;
        } else {
          const sumMs =
            (stages.total_light_sleep_time_milli || 0) +
            (stages.total_slow_wave_sleep_time_milli || 0) +
            (stages.total_rem_sleep_time_milli || 0);
          if (sumMs > 0) {
            results.sleepHours = Math.round((sumMs / 3600000) * 10) / 10;
          }
        }
      } else if (latest?.start && latest?.end) {
        const diffMs = new Date(latest.end).getTime() - new Date(latest.start).getTime();
        if (diffMs > 0) {
          results.sleepHours = Math.round((diffMs / 3600000) * 10) / 10;
        }
      }
    }
  } catch (e) {
    console.warn('Could not fetch Whoop sleep directly:', e);
  }

  try {
    const cycleRes = await fetchWithFallback(
      'https://api.prod.whoop.com/developer/v2/cycle?limit=10',
      'https://api.prod.whoop.com/developer/v1/cycle?limit=10'
    );
    if (cycleRes && cycleRes.ok) {
      const cycleData = await cycleRes.json();
      const latest = getLatestRecord(cycleData);
      if (latest) {
        // Use Whoop's own step count when present; never derive steps or active minutes from strain.
        if (typeof latest.step_count === 'number') {
          results.steps = latest.step_count;
        }
        if (latest?.score?.strain) {
          results.strain = Math.round(latest.score.strain * 10) / 10;
        }
        if (typeof latest?.score?.kilojoule === 'number') {
          results.kilojoules = Math.round(latest.score.kilojoule);
        }
        if (typeof latest?.score?.average_heart_rate === 'number') {
          (results as any).cycleAvgHr = Math.round(latest.score.average_heart_rate);
        }
        if (typeof latest?.score?.max_heart_rate === 'number') {
          (results as any).cycleMaxHr = Math.round(latest.score.max_heart_rate);
        }
      }
    }
  } catch (e) {
    console.warn('Could not fetch Whoop cycle directly:', e);
  }

  try {
    const workoutRes = await fetchWithFallback(
      'https://api.prod.whoop.com/developer/v1/activity/workout?limit=10',
      'https://api.prod.whoop.com/developer/v2/activity/workout?limit=10'
    );
    if (workoutRes && workoutRes.ok) {
      const workoutData = await workoutRes.json();
      const records = Array.isArray(workoutData?.records)
        ? workoutData.records
        : Array.isArray(workoutData)
        ? workoutData
        : [];
      const now = Date.now();
      const recent =
        records
          .filter(Boolean)
          .sort((a: any, b: any) => {
            const timeA = new Date(a.end || a.start || a.created_at || 0).getTime();
            const timeB = new Date(b.end || b.start || b.created_at || 0).getTime();
            return timeB - timeA;
          })
          .find((w: any) => {
            const startTime = new Date(w.start || w.created_at || 0).getTime();
            const hoursAgo = (now - startTime) / (1000 * 60 * 60);
            return hoursAgo >= -1 && hoursAgo <= 24;
          }) || records[0];

      if (recent) {
        (results as any).hasRecentWorkout = true;
        if (recent.sport_name) {
          (results as any).workoutSportName = recent.sport_name;
        }
        if (recent.start && recent.end) {
          const durMin = Math.round(
            (new Date(recent.end).getTime() - new Date(recent.start).getTime()) / 60000
          );
          if (durMin > 0) results.workoutDurationMin = durMin;
        }
        if (recent.score && (recent.score_state === 'SCORED' || !recent.score_state)) {
          if (typeof recent.score.strain === 'number') {
            results.workoutStrain = Math.round(recent.score.strain * 10) / 10;
          }
          if (typeof recent.score.average_heart_rate === 'number') {
            const avg = Math.round(recent.score.average_heart_rate);
            results.avgWorkoutHr = avg;
            (results as any).workoutAvgHr = avg;
            (results as any).avgHeartRate = avg;
          }
          if (typeof recent.score.max_heart_rate === 'number') {
            const max = Math.round(recent.score.max_heart_rate);
            results.maxWorkoutHr = max;
            (results as any).workoutMaxHr = max;
            (results as any).maxHeartRate = max;
          }
          if (typeof recent.score.kilojoule === 'number') {
            results.workoutKilojoules = Math.round(recent.score.kilojoule);
          }
        } else if (recent.score_state === 'PENDING_SCORE') {
          (results as any).isPendingScore = true;
        }
      }
    }
  } catch (e) {
    console.warn('Could not fetch Whoop workout directly:', e);
  }

  try {
    const bodyRes = await fetchWithFallback(
      'https://api.prod.whoop.com/developer/v1/user/measurement/body',
      'https://api.prod.whoop.com/developer/v2/user/measurement/body'
    );
    if (bodyRes && bodyRes.ok) {
      const bodyData = await bodyRes.json();
      if (typeof bodyData.weight_kilogram === 'number' && bodyData.weight_kilogram > 0) {
        results.bodyweightKg = Math.round(bodyData.weight_kilogram * 10) / 10;
      }
    }
  } catch {
    // Non-fatal
  }

  return results;
}

export interface WhoopWorkoutStrainSummary {
  workoutStrain?: number;
  dayStrain?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  kilojoules?: number; // Active session energy in kJ
  dayKilojoules?: number; // Total cumulative daily energy in kJ
  recoveryScore?: number;
  isPendingScore?: boolean;
  hasRecentWorkout?: boolean;
  workoutSportName?: string;
  workoutDurationMin?: number;
}

/**
 * Captures live workout strain and recovery telemetry from Whoop at session completion.
 */
export async function fetchWhoopWorkoutStrain(
  accessToken: string,
  refreshToken?: string,
  workoutWindow?: { start: string; end: string }
): Promise<WhoopWorkoutStrainSummary> {
  const bio = await fetchWhoopDailyBiometrics(accessToken, undefined, refreshToken, workoutWindow);
  // Ensure workout energy (kJ) is distinct from cumulative daily energy (kJ)
  const workoutKj =
    bio.workoutKilojoules !== undefined
      ? bio.workoutKilojoules
      : bio.kilojoules && bio.kilojoules < 3500 && bio.workoutStrain
      ? bio.kilojoules
      : undefined;

  const avgHeartRate =
    bio.avgWorkoutHr ??
    (bio as any).workoutAvgHr ??
    (bio as any).avgHeartRate ??
    (bio as any).cycleAvgHr;

  const maxHeartRate =
    bio.maxWorkoutHr ??
    (bio as any).workoutMaxHr ??
    (bio as any).maxHeartRate ??
    (bio as any).cycleMaxHr;

  return {
    workoutStrain: bio.workoutStrain,
    dayStrain: bio.strain,
    avgHeartRate,
    maxHeartRate,
    kilojoules: workoutKj,
    dayKilojoules: bio.kilojoules,
    recoveryScore: bio.recoveryScore,
    isPendingScore: (bio as any).isPendingScore ?? false,
    hasRecentWorkout: (bio as any).hasRecentWorkout ?? false,
    workoutSportName: (bio as any).workoutSportName,
    workoutDurationMin: (bio as any).workoutDurationMin ?? bio.workoutDurationMin,
  };
}

/**
 * Live Whoop 4.0 Telemetry Simulator:
 * Seamlessly generates high-resolution biometric readings matching Whoop strap sensors
 * for testing and instant user evaluation.
 */
export async function simulateWhoopSync(
  onProgress?: (progress: WearableSyncProgress) => void,
  forcedState?: ReadinessState
): Promise<BiometricLog> {
  const todayStr = localDateString();

  const update = (stage: WearableSyncProgress['stage'], percent: number, message: string) => {
    if (onProgress) onProgress({ stage, percent, message, provider: 'whoop' });
  };

  update('connecting', 15, 'Connecting to Whoop 4.0 strap...');
  await new Promise((r) => setTimeout(r, 380));

  update('hrv', 45, 'Syncing overnight Whoop HRV RMSSD & resting heart rate...');
  await new Promise((r) => setTimeout(r, 420));

  update('sleep', 75, 'Syncing Whoop sleep performance & recovery cycle...');
  await new Promise((r) => setTimeout(r, 420));

  update('steps', 90, 'Syncing day strain & active recovery minutes...');
  await new Promise((r) => setTimeout(r, 320));

  let hrv = 66;
  let rhr = 52;
  let sleep = 7.9;
  let azm = 48;
  let steps = 10200;

  if (forcedState === 'Amber Shield') {
    hrv = 38; // Whoop Red Recovery (<34%)
    rhr = 66; // Elevated resting heart rate
    sleep = 5.0; // Short sleep
    azm = 16;
    steps = 5800;
  } else if (forcedState === 'Primed') {
    hrv = 74; // Whoop Green Recovery (>66%)
    rhr = 49;
    sleep = 8.4;
    azm = 62;
    steps = 12600;
  }

  const syncedLog: BiometricLog = {
    date: todayStr,
    bodyweightKg: 81.8,
    hrvRmssd: hrv,
    restingHr: rhr,
    sleepHours: sleep,
    steps,
    activeZoneMinutes: azm,
    vo2Max: 47.0,
    avgWorkoutHr: 142,
    workoutDurationMin: 60,
  };

  update('complete', 100, 'Whoop 4.0 recovery synced!');
  return syncedLog;
}

/**
 * Parses raw CSV export files from the Whoop mobile app
 * (such as physiological_cycles.csv or sleeps.csv) into normalized BiometricLog records.
 */
export function parseWhoopCsvExport(csvText: string): BiometricLog[] {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/["']/g, ''));
  const findCol = (...candidates: string[]) => {
    return headers.findIndex((h) => candidates.some((c) => h === c.toLowerCase() || h.includes(c.toLowerCase())));
  };

  const cycleStartIdx = findCol('cycle start time', 'sleep start time', 'start time', 'date');
  const hrvIdx = findCol('heart rate variability (hrv) (ms)', 'hrv (ms)', 'hrv');
  const rhrIdx = findCol('resting heart rate (rhr) (bpm)', 'resting heart rate', 'rhr');
  const strainIdx = findCol('day strain', 'strain');
  const sleepDurationIdx = findCol('asleep duration', 'asleep duration (min)', 'asleep duration (ms)', 'total sleep time');
  const avgHrIdx = findCol('average heart rate (bpm)', 'average heart rate', 'avg heart rate', 'avg hr');
  const maxHrIdx = findCol('max heart rate (bpm)', 'max heart rate', 'peak heart rate', 'max hr');

  const logs: BiometricLog[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/["']/g, ''));
    if (cols.length < 2) continue;

    const rawDateStr = cycleStartIdx >= 0 ? cols[cycleStartIdx] : '';
    if (!rawDateStr) continue;
    const dateMatch = rawDateStr.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : rawDateStr.split(' ')[0];
    if (!date || date.length < 10) continue;

    let hrv = hrvIdx >= 0 ? parseFloat(cols[hrvIdx]) : NaN;
    let rhr = rhrIdx >= 0 ? parseFloat(cols[rhrIdx]) : NaN;
    let strain = strainIdx >= 0 ? parseFloat(cols[strainIdx]) : NaN;
    let sleepDuration = sleepDurationIdx >= 0 ? parseFloat(cols[sleepDurationIdx]) : NaN;
    let avgHr = avgHrIdx >= 0 ? parseFloat(cols[avgHrIdx]) : NaN;
    let maxHr = maxHrIdx >= 0 ? parseFloat(cols[maxHrIdx]) : NaN;

    // Missing columns stay 0 ("not measured"), never typical-looking defaults.
    let sleepHours = 0;
    if (!isNaN(sleepDuration) && sleepDuration > 0) {
      if (sleepDuration > 100000) {
        sleepHours = Math.round((sleepDuration / 3600000) * 10) / 10;
      } else if (sleepDuration > 24) {
        sleepHours = Math.round((sleepDuration / 60) * 10) / 10;
      } else {
        sleepHours = Math.round(sleepDuration * 10) / 10;
      }
    }

    logs.push({
      date,
      bodyweightKg: 0,
      hrvRmssd: isNaN(hrv) ? 0 : Math.round(hrv),
      restingHr: isNaN(rhr) ? 0 : Math.round(rhr),
      sleepHours,
      steps: 0,
      activeZoneMinutes: 0,
      strain: isNaN(strain) ? undefined : Math.round(strain * 10) / 10,
      source: 'whoop',
      avgWorkoutHr: !isNaN(avgHr) && avgHr > 0 ? Math.round(avgHr) : undefined,
      maxWorkoutHr: !isNaN(maxHr) && maxHr > 0 ? Math.round(maxHr) : undefined,
    });
  }

  return logs.sort((a, b) => a.date.localeCompare(b.date));
}
