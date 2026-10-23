import { applyCors } from '../_lib/cors.js';
const WHOOP_CLIENT_ID = '8bcb0a0d-b6ff-42e0-82b7-c3508e18c9f8';
// Must be configured as a Vercel environment variable. Never hardcode it.
// Read per request so a newly set variable takes effect without a code change.
const getWhoopClientSecret = (): string => process.env.WHOOP_CLIENT_SECRET || '';
const WHOOP_REDIRECT_URI = 'https://treise.vercel.app/oauth/whoop/callback';

// Vercel Serverless Function: Proxy Whoop OAuth Token Exchange to eliminate browser CORS barriers
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      configured: Boolean(getWhoopClientSecret()),
      clientId: WHOOP_CLIENT_ID,
      redirectUri: WHOOP_REDIRECT_URI,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!getWhoopClientSecret()) {
    return res.status(503).json({ error: 'server_not_configured', error_description: 'Whoop connection is not configured on the server.' });
  }

  try {
    const rawBody = req.body;
    let params: URLSearchParams;

    if (typeof rawBody === 'string') {
      params = new URLSearchParams(rawBody);
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

    // Ensure configured credentials and registered redirect URI are always strictly enforced
    params.set('client_id', WHOOP_CLIENT_ID);
    params.set('client_secret', getWhoopClientSecret());
    if (params.get('grant_type') === 'refresh_token') {
      // Whoop rejects renewals that carry a redirect_uri; they need scope=offline instead.
      params.delete('redirect_uri');
      params.set('scope', 'offline');
    } else {
      params.set('redirect_uri', WHOOP_REDIRECT_URI);
    }

    const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('WHOOP token exchange rejected by Whoop API:', response.status, data);
    }
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error('WHOOP token proxy error:', error);
    return res.status(500).json({ error: error?.message || 'Whoop token exchange proxy error' });
  }
}
