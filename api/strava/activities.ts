import { applyCors } from '../_lib/cors.js';

/**
 * Vercel Serverless Function: the athlete's recent Strava activities, for counting active days.
 * Refreshes an expired access token (Strava rotates refresh tokens, so the new pair is returned for
 * the app to save). Nothing is stored here; Strava data goes only back to the athlete it belongs to.
 */
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  let accessToken = String(body.accessToken || '').trim();
  const refreshToken = body.refreshToken ? String(body.refreshToken).trim() : '';
  const expiresAt = Number(body.expiresAt) || 0;
  const after = Number(body.after) || Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
  if (!accessToken && !refreshToken) return res.status(400).json({ error: 'Missing Strava token' });

  const clientId = process.env.STRAVA_CLIENT_ID || '';
  const clientSecret = process.env.STRAVA_CLIENT_SECRET || '';
  let refreshedTokens: { accessToken: string; refreshToken: string; expiresAt: number } | null = null;

  const refresh = async (): Promise<boolean> => {
    if (!refreshToken || !clientId || !clientSecret) return false;
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!r.ok) return false;
    const t: any = await r.json().catch(() => null);
    if (!t?.access_token) return false;
    accessToken = t.access_token;
    refreshedTokens = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at };
    return true;
  };

  const list = () =>
    fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

  try {
    // Access tokens last six hours; refresh first when it has expired (or will within a minute).
    if (!accessToken || (expiresAt && expiresAt * 1000 < Date.now() + 60 * 1000)) await refresh();
    let r = await list();
    if (r.status === 401 && !refreshedTokens && (await refresh())) r = await list();
    if (!r.ok) {
      return res.status(r.status).json({ success: false, error: 'Could not read Strava activities', refreshedTokens });
    }
    const raw: any[] = (await r.json().catch(() => [])) || [];
    const sessions = (Array.isArray(raw) ? raw : [])
      .filter((a) => a && a.id && a.start_date)
      .map((a) => ({
        externalId: String(a.id),
        name: a.name || undefined,
        sportType: a.sport_type || a.type || undefined,
        startedAt: new Date(a.start_date).toISOString(),
        minutes: Math.round((a.moving_time || a.elapsed_time || 0) / 60),
        distanceKm: typeof a.distance === 'number' && a.distance > 0 ? Math.round(a.distance / 100) / 10 : undefined,
        avgHeartRate: typeof a.average_heartrate === 'number' ? Math.round(a.average_heartrate) : undefined,
      }));
    return res.status(200).json({ success: true, sessions, refreshedTokens, provider: 'strava' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Strava activities proxy error' });
  }
}
