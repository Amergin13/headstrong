import { ActivitySource, DetectedActivity, classifyActivity } from '../engine/activeDays';
import { UserProfile } from '../engine/types';
import { localDateString } from '../utils/date';
import { publishRefreshedTokens } from './wearableTokens';

/**
 * Reads recent workouts from the sources the athlete connected (Fitbit / Pixel Watch, Whoop,
 * Strava) through Treise's serverless functions, and turns them into activities. Lifting is left
 * out (it is the lifting session itself). Nothing is invented: each activity carries its source's id.
 */

/** A workout as a source reports it, before classification. */
export interface RawSourceSession {
  externalId: string;
  name?: string;
  /** Strava's sport_type, Health Connect's exercise type name. */
  sportType?: string;
  startedAt: string;
  minutes: number;
  distanceKm?: number;
  avgHeartRate?: number;
}

/** Classifies raw sessions; lifting and empty ones are dropped. */
export function toDetectedActivities(source: ActivitySource, raw: RawSourceSession[]): DetectedActivity[] {
  const out: DetectedActivity[] = [];
  for (const r of raw) {
    const type = classifyActivity(r.sportType || r.name);
    if (type === 'strength' || !(r.minutes > 0)) continue;
    out.push({
      externalId: String(r.externalId),
      startedAt: r.startedAt,
      minutes: Math.round(r.minutes),
      type,
      source,
      name: r.name,
      distanceKm: r.distanceKm,
      avgHeartRate: r.avgHeartRate,
    });
  }
  return out;
}

const LOOKBACK_DAYS = 14;

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchFitbitActivities(profile: UserProfile, now: Date = new Date()): Promise<DetectedActivity[]> {
  if (!profile.fitbitConnected || !profile.fitbitAccessToken) return [];
  const after = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);
  const data = await postJson('/api/fitbit/biometrics', {
    mode: 'sessions',
    accessToken: profile.fitbitAccessToken,
    refreshToken: profile.fitbitRefreshToken,
    afterDate: localDateString(after),
  });
  publishRefreshedTokens('fitbit', data.refreshedTokens);
  return toDetectedActivities('fitbit', data.sessions || []);
}

export async function fetchWhoopActivities(profile: UserProfile, now: Date = new Date()): Promise<DetectedActivity[]> {
  if (!profile.whoopConnected || !profile.whoopAccessToken) return [];
  const data = await postJson('/api/whoop/biometrics', {
    mode: 'sessions',
    accessToken: profile.whoopAccessToken,
    refreshToken: profile.whoopRefreshToken,
    since: new Date(now.getTime() - LOOKBACK_DAYS * 86400000).toISOString(),
  });
  publishRefreshedTokens('whoop', data.refreshedTokens);
  return toDetectedActivities('whoop', data.sessions || []);
}

// ---------------------------------------------------------------- Strava

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteFirstName?: string;
}

type StravaTokenListener = (tokens: StravaTokens) => void;
const stravaListeners = new Set<StravaTokenListener>();

/** Strava rotates refresh tokens: the newest pair must be saved each time. */
export function onStravaTokensRefreshed(listener: StravaTokenListener): () => void {
  stravaListeners.add(listener);
  return () => {
    stravaListeners.delete(listener);
  };
}

export const STRAVA_SCOPE = 'activity:read_all';

export function getStravaRedirectUri(): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'https://treise.vercel.app/oauth/callback';
}

/** Whether Strava is set up on the server (client id and secret in Vercel), and its public client id. */
export async function getStravaConfig(): Promise<{ configured: boolean; clientId?: string }> {
  try {
    const res = await fetch('/api/strava/token');
    const data = await res.json();
    return { configured: Boolean(data?.configured), clientId: data?.clientId };
  } catch {
    return { configured: false };
  }
}

/** Sends the athlete to Strava's sign-in. Returns false when Strava isn't set up yet. */
export async function startStravaConnect(): Promise<boolean> {
  const config = await getStravaConfig();
  if (!config.configured || !config.clientId) return false;
  const state = `strava_${Math.random().toString(36).slice(2, 12)}`;
  try {
    sessionStorage.setItem('strava_oauth_state', state);
  } catch {
    // Private mode: the state check is skipped
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getStravaRedirectUri(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state,
  });
  window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`;
  return true;
}

/** Exchanges the code Strava returned for tokens. Throws if the athlete didn't allow reading activities. */
export async function exchangeStravaCode(code: string, grantedScope?: string | null): Promise<StravaTokens> {
  if (grantedScope && !/activity:read/.test(grantedScope)) {
    throw new Error('Strava needs permission to read your activities to count them.');
  }
  const res = await fetch('/api/strava/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.accessToken) throw new Error(data?.error || 'Could not connect to Strava.');
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    athleteFirstName: data.athleteFirstName,
  };
}

export async function fetchStravaActivities(profile: UserProfile, now: Date = new Date()): Promise<DetectedActivity[]> {
  if (!profile.stravaConnected || !(profile.stravaAccessToken || profile.stravaRefreshToken)) return [];
  const data = await postJson('/api/strava/activities', {
    accessToken: profile.stravaAccessToken,
    refreshToken: profile.stravaRefreshToken,
    expiresAt: profile.stravaTokenExpiresAt,
    after: Math.floor(now.getTime() / 1000) - LOOKBACK_DAYS * 86400,
  });
  if (data.refreshedTokens?.accessToken) {
    stravaListeners.forEach((l) => l(data.refreshedTokens));
  }
  return toDetectedActivities('strava', data.sessions || []);
}
