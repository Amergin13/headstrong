import { BiometricLog, ReadinessState, WearableSyncProgress } from '../engine/types';
import { generateCodeChallenge, generateRandomString } from './fitbitService';

export const WHOOP_CONFIG = {
  CLIENT_ID: 'headstrong_whoop_client',
  AUTHORIZATION_URI: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  TOKEN_URI: 'https://api.prod.whoop.com/oauth/oauth2/token',
  SCOPES: [
    'read:recovery',
    'read:cycles',
    'read:workout',
    'read:sleep',
    'read:profile',
    'read:body_measurement',
  ],
  REDIRECT_URI:
    typeof window !== 'undefined'
      ? `${window.location.origin}/oauth/whoop/callback`
      : 'http://localhost:5173/oauth/whoop/callback',
};

/**
 * Initiates Whoop OAuth 2.0 PKCE Authorization flow.
 */
export async function initiateWhoopOAuth(
  clientId: string = WHOOP_CONFIG.CLIENT_ID
): Promise<string> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = `whoop_${generateRandomString(24)}`;

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('whoop_code_verifier', codeVerifier);
    sessionStorage.setItem('whoop_oauth_state', state);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: WHOOP_CONFIG.REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: WHOOP_CONFIG.SCOPES.join(' '),
    state,
  });

  return `${WHOOP_CONFIG.AUTHORIZATION_URI}?${params.toString()}`;
}

/**
 * Exchanges authorization code for Whoop access and refresh tokens.
 */
export async function exchangeWhoopCodeForToken(
  code: string,
  clientId: string = WHOOP_CONFIG.CLIENT_ID
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; userId?: string }> {
  const codeVerifier = sessionStorage.getItem('whoop_code_verifier') || '';

  const bodyParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    redirect_uri: WHOOP_CONFIG.REDIRECT_URI,
    code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(WHOOP_CONFIG.TOKEN_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    throw new Error(`Whoop OAuth token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    userId: data.user?.id ? String(data.user.id) : undefined,
  };
}

/**
 * Refreshes an expired Whoop access token using a refresh token.
 */
export async function refreshWhoopToken(
  refreshToken: string,
  clientId: string = WHOOP_CONFIG.CLIENT_ID
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const bodyParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(WHOOP_CONFIG.TOKEN_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    throw new Error(`Whoop token refresh failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches daily telemetry from Whoop Developer API v1:
 * - Recovery: recovery_score, resting_heart_rate, hrv_rmssd_milli
 * - Sleep: total_sleep_time (hours)
 * - Cycle: strain, kilojoules -> activeZoneMinutes
 * - Body: weight_kilogram
 */
export async function fetchWhoopDailyBiometrics(
  accessToken: string,
  dateStr?: string
): Promise<Partial<BiometricLog>> {
  const date = dateStr || new Date().toISOString().split('T')[0];
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const results: Partial<BiometricLog> = { date };

  try {
    // 1. Recovery Endpoint
    const recRes = await fetch('https://api.prod.whoop.com/developer/v1/recovery', { headers });
    if (recRes.ok) {
      const recData = await recRes.json();
      const records = recData.records || recData;
      const latest = Array.isArray(records) ? records[0] : records;
      if (latest?.score) {
        if (typeof latest.score.hrv_rmssd_milli === 'number') {
          results.hrvRmssd = Math.round(latest.score.hrv_rmssd_milli);
        }
        if (typeof latest.score.resting_heart_rate === 'number') {
          results.restingHr = Math.round(latest.score.resting_heart_rate);
        }
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    // 2. Sleep Endpoint
    const sleepRes = await fetch('https://api.prod.whoop.com/developer/v1/activity/sleep', { headers });
    if (sleepRes.ok) {
      const sleepData = await sleepRes.json();
      const records = sleepData.records || sleepData;
      const latest = Array.isArray(records) ? records[0] : records;
      const stages = latest?.score?.stage_summary;
      if (stages) {
        const totalInBed = stages.total_in_bed_time_milli || 0;
        const totalAwake = stages.total_awake_time_milli || 0;
        const asleepMs = Math.max(0, totalInBed - totalAwake);
        if (asleepMs > 0) {
          results.sleepHours = Math.round((asleepMs / 3600000) * 10) / 10;
        }
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    // 3. Cycle / Strain Endpoint
    const cycleRes = await fetch('https://api.prod.whoop.com/developer/v1/cycle', { headers });
    if (cycleRes.ok) {
      const cycleData = await cycleRes.json();
      const records = cycleData.records || cycleData;
      const latest = Array.isArray(records) ? records[0] : records;
      if (latest?.score?.strain) {
        // Map Whoop strain (0 - 21 scale) to active minutes approximation
        const strain = latest.score.strain;
        results.activeZoneMinutes = Math.round(strain * 3.5);
        results.steps = Math.round(strain * 650);
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    // 4. Body Measurement Endpoint
    const bodyRes = await fetch('https://api.prod.whoop.com/developer/v1/user/measurement/body', { headers });
    if (bodyRes.ok) {
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

/**
 * Live Whoop 4.0 Telemetry Simulator:
 * Seamlessly generates high-resolution biometric readings matching Whoop strap sensors
 * for testing and instant user evaluation.
 */
export async function simulateWhoopSync(
  onProgress?: (progress: WearableSyncProgress) => void,
  forcedState?: ReadinessState
): Promise<BiometricLog> {
  const todayStr = new Date().toISOString().split('T')[0];

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
