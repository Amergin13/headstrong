// Shared CORS policy for the serverless proxies. Files under api/_lib are not routed by Vercel.
// The app calls these endpoints same-origin, so cross-origin access is limited to known hosts.
const DEFAULT_ALLOWED_ORIGINS = ['https://treise.vercel.app'];

function getAllowedOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

function isLocalDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

/**
 * Applies CORS headers. Returns true when the request was a preflight that has been answered.
 */
export function applyCors(req: any, res: any, methods = 'GET,POST,OPTIONS'): boolean {
  const origin = String(req.headers?.origin || '');
  if (origin && (getAllowedOrigins().includes(origin) || isLocalDevOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
