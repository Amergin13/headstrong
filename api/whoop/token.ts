const WHOOP_CLIENT_ID = '8bcb0a0d-b6ff-42e0-82b7-c3508e18c9f8';
const WHOOP_CLIENT_SECRET =
  process.env.WHOOP_CLIENT_SECRET || 'f3f985af0e1113b650b43fe977eb2f22ffb0f008c98e90e5d60ad669d4c365ea';
const WHOOP_REDIRECT_URI = 'https://treise.vercel.app/oauth/whoop/callback';

// Vercel Serverless Function: Proxy Whoop OAuth Token Exchange to eliminate browser CORS barriers
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      configured: true,
      clientId: WHOOP_CLIENT_ID,
      redirectUri: WHOOP_REDIRECT_URI,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    // Default to configured user client ID if not provided in payload
    if (!params.get('client_id')) {
      params.append('client_id', WHOOP_CLIENT_ID);
    }

    if (!params.get('redirect_uri')) {
      params.append('redirect_uri', WHOOP_REDIRECT_URI);
    }

    if (!params.get('client_secret')) {
      params.append('client_secret', WHOOP_CLIENT_SECRET);
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
