import { BiometricLog, ReadinessState, WearableSyncProgress } from '../engine/types';
import { generateCodeChallenge, generateRandomString } from './fitbitService';

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
  CLIENT_ID: '8bcb0a0d-b6ff-42e0-82b7-c3508e18c9f8',
  CLIENT_SECRET: 'f3f985af0e1113b650b43fe977eb2f22ffb0f008c98e90e5d60ad669d4c365ea',
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
  clientSecret?: string,
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
  const effectiveClientSecret =
    clientSecret ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_client_secret')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_client_secret')) ||
    WHOOP_CONFIG.CLIENT_SECRET;
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
  if (effectiveClientSecret) {
    bodyParams.append('client_secret', effectiveClientSecret);
  }

  // 1. Try local serverless proxy first (to avoid browser CORS restrictions)
  try {
    const proxyResponse = await fetch('/api/whoop/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (proxyResponse.ok) {
      const data = await proxyResponse.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        userId: data.user?.id ? String(data.user.id) : undefined,
      };
    } else {
      const errData = await proxyResponse.json().catch(() => ({}));
      console.warn('WHOOP token exchange error via proxy:', proxyResponse.status, errData);
      const errMsg = errData.error_description || errData.error || `HTTP ${proxyResponse.status}`;
      throw new Error(`Whoop token exchange failed: ${errMsg}`);
    }
  } catch (proxyErr: any) {
    if (proxyErr?.message?.includes('Whoop token exchange failed')) {
      throw proxyErr;
    }
    // Fall back to direct Whoop token endpoint only on network failure of proxy
  }

  // 2. Direct Whoop token endpoint
  const response = await fetch(WHOOP_CONFIG.TOKEN_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.error_description || errData.error || response.statusText;
    throw new Error(`Whoop OAuth token exchange failed: ${errMsg}`);
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
  clientId?: string,
  clientSecret?: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const effectiveClientId =
    clientId ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_client_id')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_client_id')) ||
    WHOOP_CONFIG.CLIENT_ID;
  const effectiveClientSecret =
    clientSecret ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('whoop_client_secret')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('whoop_client_secret')) ||
    WHOOP_CONFIG.CLIENT_SECRET;

  const bodyParams = new URLSearchParams({
    client_id: effectiveClientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  if (effectiveClientSecret) {
    bodyParams.append('client_secret', effectiveClientSecret);
  }

  // 1. Try proxy first
  try {
    const proxyResponse = await fetch('/api/whoop/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (proxyResponse.ok) {
      const data = await proxyResponse.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    }
  } catch {
    // Fall back to direct
  }

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
  refreshToken?: string
): Promise<Partial<BiometricLog>> {
  const date = dateStr || new Date().toISOString().split('T')[0];
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
      }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.success && data.biometrics) {
        if (data.refreshedTokens && typeof window !== 'undefined') {
          try {
            localStorage.setItem('whoop_access_token', data.refreshedTokens.accessToken);
            if (data.refreshedTokens.refreshToken) {
              localStorage.setItem('whoop_refresh_token', data.refreshedTokens.refreshToken);
            }
          } catch {}
        }
        return {
          ...data.biometrics,
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

  const fetchWithFallback = async (urlV1: string, urlV2: string) => {
    try {
      const res1 = await fetch(urlV1, { headers });
      if (res1.ok) return res1;
      if (res1.status === 404 || res1.status === 410) {
        const res2 = await fetch(urlV2, { headers });
        if (res2.ok) return res2;
      }
      return res1;
    } catch {
      return fetch(urlV2, { headers }).catch(() => null);
    }
  };

  try {
    const recRes = await fetchWithFallback(
      'https://api.prod.whoop.com/developer/v1/recovery?limit=10',
      'https://api.prod.whoop.com/developer/v2/recovery?limit=10'
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
      'https://api.prod.whoop.com/developer/v1/activity/sleep?limit=10',
      'https://api.prod.whoop.com/developer/v2/activity/sleep?limit=10'
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
      'https://api.prod.whoop.com/developer/v1/cycle?limit=10',
      'https://api.prod.whoop.com/developer/v2/cycle?limit=10'
    );
    if (cycleRes && cycleRes.ok) {
      const cycleData = await cycleRes.json();
      const latest = getLatestRecord(cycleData);
      if (latest) {
        if (typeof latest.step_count === 'number') {
          results.steps = latest.step_count;
        } else if (latest?.score?.strain) {
          results.steps = Math.round(latest.score.strain * 650);
        }
        if (latest?.score?.strain) {
          results.activeZoneMinutes = Math.round(latest.score.strain * 3.5);
        }
      }
    }
  } catch (e) {
    console.warn('Could not fetch Whoop cycle directly:', e);
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

    if (isNaN(hrv)) hrv = 60;
    if (isNaN(rhr)) rhr = 58;

    let sleepHours = 7.5;
    if (!isNaN(sleepDuration) && sleepDuration > 0) {
      if (sleepDuration > 100000) {
        sleepHours = Math.round((sleepDuration / 3600000) * 10) / 10;
      } else if (sleepDuration > 24) {
        sleepHours = Math.round((sleepDuration / 60) * 10) / 10;
      } else {
        sleepHours = Math.round(sleepDuration * 10) / 10;
      }
    }

    const steps = !isNaN(strain) ? Math.round(strain * 650) : 8500;
    const azm = !isNaN(strain) ? Math.round(strain * 3.5) : 35;

    logs.push({
      date,
      bodyweightKg: 80.0,
      hrvRmssd: Math.round(hrv),
      restingHr: Math.round(rhr),
      sleepHours,
      steps,
      activeZoneMinutes: azm,
      vo2Max: 46.0,
    });
  }

  return logs.sort((a, b) => a.date.localeCompare(b.date));
}
