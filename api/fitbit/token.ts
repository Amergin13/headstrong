import { applyCors } from '../_lib/cors.js';

const FITBIT_REDIRECT_URI = 'https://treise.vercel.app/oauth/callback';
const PLACEHOLDER_CLIENT_ID = '23QW89';

function getConfiguredClientId(): string {
  const raw = (
    process.env.GOOGLE_HEALTH_CLIENT_ID ||
    process.env.FITBIT_CLIENT_ID ||
    ''
  ).trim();
  if (!raw || raw === PLACEHOLDER_CLIENT_ID) return '';
  return raw;
}

function getConfiguredClientSecret(): string {
  return (
    process.env.GOOGLE_HEALTH_CLIENT_SECRET ||
    process.env.FITBIT_CLIENT_SECRET ||
    ''
  ).trim();
}

export function isGoogleHealthClientId(clientId: string): boolean {
  return Boolean(clientId && clientId.trim().endsWith('.apps.googleusercontent.com'));
}

/**
 * Vercel Serverless Function: Proxy Fitbit / Pixel Watch / Google Health OAuth Token Exchange.
 *
 * Google retired the legacy Fitbit Web API OAuth endpoints on October 30, 2026 in favour of the
 * Google Health API (oauth2.googleapis.com/token + health.googleapis.com/v4). This proxy supports
 * both Google Health OAuth 2.0 client IDs (*.apps.googleusercontent.com) and legacy Fitbit OAuth
 * client IDs, while keeping the client secret strictly on the server.
 */
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  const clientId = getConfiguredClientId();
  const clientSecret = getConfiguredClientSecret();
  const configured = Boolean(clientId && clientSecret);
  const isGoogleHealth = isGoogleHealthClientId(clientId);

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      configured,
      clientId: configured ? clientId : undefined,
      mode: isGoogleHealth ? 'google_health' : 'fitbit',
      redirectUri: FITBIT_REDIRECT_URI,
      provider: 'fitbit',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!configured) {
    return res.status(503).json({
      error: 'server_not_configured',
      error_description:
        'Fitbit / Google Health cloud sign-in is not configured on the server. In the Android app, connect your Pixel Watch or Fitbit through Health Connect.',
    });
  }

  try {
    const rawBody = req.body;
    let params: URLSearchParams;

    if (typeof rawBody === 'string') {
      try {
        const parsedJson = JSON.parse(rawBody);
        params = new URLSearchParams();
        for (const [key, value] of Object.entries(parsedJson)) {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        }
      } catch {
        params = new URLSearchParams(rawBody);
      }
    } else if (rawBody && typeof rawBody === 'object') {
      params = new URLSearchParams();
      for (const [key, value] of Object.entries(rawBody)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
    } else {
      params = new URLSearchParams();
    }

    // Enforce server-configured client_id and redirect_uri; never trust client-supplied secrets.
    params.set('client_id', clientId);
    params.delete('client_secret');

    if (params.get('grant_type') === 'refresh_token') {
      params.delete('redirect_uri');
    } else {
      params.set('redirect_uri', FITBIT_REDIRECT_URI);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    let tokenEndpoint = 'https://api.fitbit.com/oauth2/token';
    if (isGoogleHealth) {
      tokenEndpoint = 'https://oauth2.googleapis.com/token';
      params.set('client_secret', clientSecret);
    } else {
      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data.error_description ||
          data.error ||
          data.errors?.[0]?.message ||
          'Fitbit / Google Health token exchange failed',
        details: data,
      });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || 'Internal proxy error during Fitbit token exchange',
    });
  }
}
