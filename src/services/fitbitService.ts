import { BiometricLog, ReadinessState } from '../engine/types';

export const FITBIT_CONFIG = {
  CLIENT_ID: '23QW89', // Example registered client ID or user provided
  AUTHORIZATION_URI: 'https://www.fitbit.com/oauth2/authorize',
  TOKEN_URI: 'https://api.fitbit.com/oauth2/token',
  SCOPES: ['activity', 'heartrate', 'sleep', 'weight', 'profile'],
  REDIRECT_URI: typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'http://localhost:5173/oauth/callback',
};

// PKCE Helper utilities using Web Crypto API
export function generateRandomString(length: number = 64): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
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

export async function initiateFitbitOAuth(clientId: string = FITBIT_CONFIG.CLIENT_ID): Promise<string> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  // Store in sessionStorage for exchange after redirect
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('fitbit_code_verifier', codeVerifier);
    sessionStorage.setItem('fitbit_oauth_state', state);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: FITBIT_CONFIG.REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: FITBIT_CONFIG.SCOPES.join(' '),
    state,
  });

  return `${FITBIT_CONFIG.AUTHORIZATION_URI}?${params.toString()}`;
}

export async function exchangeFitbitCodeForToken(
  code: string,
  clientId: string = FITBIT_CONFIG.CLIENT_ID
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; userId: string }> {
  const codeVerifier = sessionStorage.getItem('fitbit_code_verifier') || '';

  const bodyParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    redirect_uri: FITBIT_CONFIG.REDIRECT_URI,
    code: code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(FITBIT_CONFIG.TOKEN_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    throw new Error(`Fitbit OAuth token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    userId: data.user_id,
  };
}

export async function refreshFitbitToken(
  refreshToken: string,
  clientId: string = FITBIT_CONFIG.CLIENT_ID
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const bodyParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(FITBIT_CONFIG.TOKEN_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    throw new Error(`Fitbit token refresh failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches real daily biometrics from Fitbit Web API:
 * Heart rate/Resting HR, HRV RMSSD, Sleep, Steps & AZM, Bodyweight.
 */
export async function fetchFitbitDailyBiometrics(
  accessToken: string,
  dateStr?: string
): Promise<Partial<BiometricLog>> {
  const date = dateStr || new Date().toISOString().split('T')[0];
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const results: Partial<BiometricLog> = { date };

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

  return results;
}

export interface WatchSyncProgress {
  stage: 'idle' | 'connecting' | 'hrv' | 'sleep' | 'steps' | 'complete' | 'error';
  percent: number;
  message: string;
}

/**
 * Live Demo Pixel Watch Telemetry Simulator:
 * Seamlessly generates high-resolution biometric readings from Google Pixel Watch 3
 * without requiring real-world API credentials during testing.
 */
export async function simulatePixelWatchSync(
  onProgress?: (progress: WatchSyncProgress) => void,
  forcedState?: ReadinessState
): Promise<BiometricLog> {
  const todayStr = new Date().toISOString().split('T')[0];

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

  if (forcedState === 'Amber Shield') {
    hrv = 41; // >15% drop
    rhr = 64; // elevated
    sleep = 5.2; // <6h
    steps = 6200;
    azm = 18;
  } else if (forcedState === 'Primed') {
    hrv = 69;
    rhr = 51;
    sleep = 8.3;
    steps = 11400;
    azm = 56;
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
  };

  update('complete', 100, 'Watch recovery data synced!');
  return syncedLog;
}
