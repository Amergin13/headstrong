import { BiometricLog, ReadinessState } from '../engine/types';
import { localDateString } from '../utils/date';
import { parseHealthConnectExport } from './healthConnectService';
import { publishRefreshedTokens } from './wearableTokens';

export const FITBIT_CONFIG = {
  CLIENT_ID: '23QW89',
  AUTHORIZATION_URI: 'https://www.fitbit.com/oauth2/authorize',
  GOOGLE_AUTHORIZATION_URI: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URI: 'https://api.fitbit.com/oauth2/token',
  SCOPES: ['activity', 'heartrate', 'sleep', 'weight', 'profile'],
  GOOGLE_HEALTH_SCOPES: [
    'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
    'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  ],
  REDIRECT_URI:
    typeof window !== 'undefined'
      ? `${window.location.origin}/oauth/callback`
      : 'https://treise.vercel.app/oauth/callback',
};

export interface FitbitServerConfig {
  configured: boolean;
  clientId?: string;
  mode?: 'google_health' | 'fitbit';
  redirectUri?: string;
}

/**
 * Checks whether Fitbit / Google Health OAuth is configured on the server.
 * Never exposes secrets; only returns whether the server has credentials and the public clientId.
 */
export async function getFitbitConfig(): Promise<FitbitServerConfig> {
  try {
    const res = await fetch('/api/fitbit/token');
    if (!res.ok) return { configured: false };
    const data = await res.json();
    return {
      configured: Boolean(data?.configured && data?.clientId),
      clientId: data?.clientId,
      mode: data?.mode === 'google_health' ? 'google_health' : 'fitbit',
      redirectUri: data?.redirectUri,
    };
  } catch {
    return { configured: false };
  }
}

// PKCE Helper utilities using Web Crypto API
export function generateRandomString(length: number = 64): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      text += possible.charAt(bytes[i] % possible.length);
    }
    return text;
  }
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
  if (cryptoObj?.subtle) {
    const digest = await cryptoObj.subtle.digest('SHA-256', data);
    const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return base64Digest;
  }
  return btoa(verifier).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function initiateFitbitOAuth(
  clientId: string = FITBIT_CONFIG.CLIENT_ID,
  customRedirectUri?: string
): Promise<string> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = `fitbit_${generateRandomString(24)}`;
  const redirectUri = customRedirectUri || FITBIT_CONFIG.REDIRECT_URI;

  // Store in both localStorage and sessionStorage so Android TWA / Custom Tab redirects keep PKCE state
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('fitbit_code_verifier', codeVerifier);
      localStorage.setItem('fitbit_oauth_state', state);
      localStorage.setItem('fitbit_client_id', clientId);
      localStorage.setItem('fitbit_redirect_uri', redirectUri);
    } catch {
      // Ignore if localStorage is blocked
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem('fitbit_code_verifier', codeVerifier);
      sessionStorage.setItem('fitbit_oauth_state', state);
      sessionStorage.setItem('fitbit_client_id', clientId);
      sessionStorage.setItem('fitbit_redirect_uri', redirectUri);
    } catch {
      // Ignore if sessionStorage is blocked
    }
  }

  const isGoogleClient = clientId.trim().endsWith('.apps.googleusercontent.com');
  if (isGoogleClient) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      scope: FITBIT_CONFIG.GOOGLE_HEALTH_SCOPES.join(' '),
      state,
    });
    return `${FITBIT_CONFIG.GOOGLE_AUTHORIZATION_URI}?${params.toString()}`;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: FITBIT_CONFIG.SCOPES.join(' '),
    state,
  });

  return `${FITBIT_CONFIG.AUTHORIZATION_URI}?${params.toString()}`;
}

export async function exchangeFitbitCodeForToken(
  code: string,
  clientId?: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; userId: string }> {
  const codeVerifier =
    (typeof localStorage !== 'undefined' && localStorage.getItem('fitbit_code_verifier')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('fitbit_code_verifier')) ||
    '';
  const effectiveClientId =
    clientId ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('fitbit_client_id')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('fitbit_client_id')) ||
    FITBIT_CONFIG.CLIENT_ID;
  const redirectUri =
    (typeof localStorage !== 'undefined' && localStorage.getItem('fitbit_redirect_uri')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('fitbit_redirect_uri')) ||
    FITBIT_CONFIG.REDIRECT_URI;

  const proxyRes = await fetch('/api/fitbit/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: effectiveClientId,
    }),
  });

  const data = await proxyRes.json().catch(() => ({}));
  if (!proxyRes.ok || !data?.access_token) {
    const errMsg =
      data?.error_description ||
      data?.error ||
      data?.details?.errors?.[0]?.message ||
      `HTTP ${proxyRes.status}`;
    throw new Error(`Fitbit token exchange failed: ${errMsg}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    userId: data.user_id || 'me',
  };
}

export async function refreshFitbitToken(
  refreshToken: string,
  clientId?: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const effectiveClientId =
    clientId ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('fitbit_client_id')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('fitbit_client_id')) ||
    FITBIT_CONFIG.CLIENT_ID;

  const proxyRes = await fetch('/api/fitbit/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: effectiveClientId,
    }),
  });

  const data = await proxyRes.json().catch(() => ({}));
  if (!proxyRes.ok || !data?.access_token) {
    throw new Error(data?.error || `Fitbit token refresh failed: HTTP ${proxyRes.status}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches real daily biometrics from Fitbit / Google Health API:
 * Heart rate/Resting HR, HRV RMSSD, Sleep, Steps & AZM, Bodyweight, and Daily Readiness Score.
 * Routes through /api/fitbit/biometrics serverless proxy to eliminate CORS restrictions.
 */
export async function fetchFitbitDailyBiometrics(
  accessToken: string,
  dateStr?: string,
  refreshToken?: string
): Promise<Partial<BiometricLog>> {
  const date = dateStr || localDateString();

  // 1. Try serverless proxy aggregator first
  try {
    const proxyRes = await fetch(`/api/fitbit/biometrics?date=${date}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        accessToken,
        refreshToken,
        date,
      }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.success && data.biometrics) {
        // Save rotated tokens to the profile (Fitbit refresh tokens are single-use).
        publishRefreshedTokens('fitbit', data.refreshedTokens);
        return {
          ...data.biometrics,
          source: 'fitbit',
        };
      }
    }
  } catch {
    // Fall back to direct browser fetch
  }

  // 2. Direct browser fetch fallback
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const results: Partial<BiometricLog> = { date, source: 'fitbit' };

  try {
    const heartRes = await fetch(
      `https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d.json`,
      { headers }
    );
    if (heartRes.ok) {
      const heartData = await heartRes.json();
      const restingHr = heartData['activities-heart']?.[0]?.value?.restingHeartRate;
      if (typeof restingHr === 'number' && restingHr > 0) {
        results.restingHr = restingHr;
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    const hrvRes = await fetch(`https://api.fitbit.com/1/user/-/hrv/date/${date}.json`, { headers });
    if (hrvRes.ok) {
      const hrvData = await hrvRes.json();
      const dailyRmssd = hrvData?.hrv?.[0]?.value?.dailyRmssd;
      if (typeof dailyRmssd === 'number' && dailyRmssd > 0) {
        results.hrvRmssd = Math.round(dailyRmssd);
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    const sleepRes = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${date}.json`, { headers });
    if (sleepRes.ok) {
      const sleepData = await sleepRes.json();
      const totalMinutesAsleep = sleepData?.summary?.totalMinutesAsleep;
      if (typeof totalMinutesAsleep === 'number' && totalMinutesAsleep > 0) {
        results.sleepHours = Math.round((totalMinutesAsleep / 60) * 10) / 10;
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    const actRes = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, { headers });
    if (actRes.ok) {
      const actData = await actRes.json();
      const steps = actData?.summary?.steps;
      if (typeof steps === 'number') results.steps = steps;
      const azm = actData?.summary?.activeZoneMinutes?.totalMinutes;
      if (typeof azm === 'number') results.activeZoneMinutes = azm;
    }
  } catch {
    // Non-fatal
  }

  try {
    const weightRes = await fetch(`https://api.fitbit.com/1/user/-/body/log/weight/date/${date}.json`, { headers });
    if (weightRes.ok) {
      const weightData = await weightRes.json();
      const weight = weightData?.weight?.[0]?.weight;
      if (typeof weight === 'number' && weight > 0) {
        results.bodyweightKg = Math.round(weight * 10) / 10;
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    const readinessRes = await fetch(`https://api.fitbit.com/1/user/-/readiness/date/${date}.json`, { headers });
    if (readinessRes.ok) {
      const readinessData = await readinessRes.json();
      const rawScore =
        readinessData?.readiness?.[0]?.value?.score ??
        readinessData?.readiness?.[0]?.score ??
        readinessData?.score;
      if (typeof rawScore === 'number' && rawScore > 0) {
        results.fitbitReadinessScore = Math.round(rawScore);
        results.readinessScore = Math.round(rawScore);
      }
    }
  } catch {
    // Non-fatal
  }

  return results;
}

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
 * Live Demo Pixel Watch Telemetry Simulator:
 * Seamlessly generates high-resolution biometric readings from Google Pixel Watch 3
 * including authentic Daily Readiness Score (1-100).
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
