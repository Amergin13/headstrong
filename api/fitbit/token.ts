import { applyCors } from '../_lib/cors';
/**
 * Vercel Serverless Function: Proxy Fitbit / Pixel Watch OAuth Token Exchange
 * Eliminates browser CORS barriers by exchanging auth code / refresh token server-side.
 */
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      configured: true,
      provider: 'fitbit',
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

    const clientId = params.get('client_id') || process.env.FITBIT_CLIENT_ID || '23QW89';
    const clientSecret = process.env.FITBIT_CLIENT_SECRET;

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (clientSecret) {
      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }

    const response = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || data.errors?.[0]?.message || 'Fitbit token exchange failed',
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
