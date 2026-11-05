import { applyCors } from '../_lib/cors.js';

/**
 * Vercel Serverless Function: Strava OAuth.
 * GET  -> { configured, clientId } so the app can start the Strava sign-in (the client id is public).
 * POST -> exchanges an authorization code (grant_type=authorization_code) or a refresh token
 *         (grant_type=refresh_token) for tokens. The client secret lives only in the
 *         STRAVA_CLIENT_SECRET environment variable and never reaches the app.
 */
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  const clientId = process.env.STRAVA_CLIENT_ID || '';
  const clientSecret = process.env.STRAVA_CLIENT_SECRET || '';

  if (req.method === 'GET') {
    return res.status(200).json({ configured: Boolean(clientId && clientSecret), clientId: clientId || undefined, provider: 'strava' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: 'Strava is not set up on the server yet.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = Object.fromEntries(new URLSearchParams(body).entries());
    }
  }

  const grantType = body.grant_type === 'refresh_token' ? 'refresh_token' : 'authorization_code';
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: grantType });
  if (grantType === 'refresh_token') {
    if (!body.refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });
    params.set('refresh_token', String(body.refresh_token));
  } else {
    if (!body.code) return res.status(400).json({ error: 'Missing code' });
    params.set('code', String(body.code));
  }

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || 'Strava token exchange failed' });
    }
    // Only what the app needs: tokens, expiry, granted scope and the athlete's first name.
    return res.status(200).json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      scope: body.scope || data.scope,
      athleteFirstName: data.athlete?.firstname,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Strava token proxy error' });
  }
}
