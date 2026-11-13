import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads `.env.local` (if present) into process.env without overwriting already-exported variables.
 * Keeps secrets out of git and client bundles, matching Vercel server env behavior.
 */
function loadDotEnvLocal(rootDir) {
  const envPath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('[localApiPlugin] Could not read .env.local:', err?.message || err);
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createVercelResAdapter(nodeRes) {
  const res = {
    statusCode: 200,
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
      return res;
    },
    getHeader(name) {
      return nodeRes.getHeader(name);
    },
    status(code) {
      res.statusCode = code;
      nodeRes.statusCode = code;
      return res;
    },
    json(payload) {
      if (!nodeRes.hasHeader('Content-Type')) {
        nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      nodeRes.statusCode = res.statusCode;
      nodeRes.end(JSON.stringify(payload));
      return res;
    },
    send(payload) {
      if (payload !== undefined && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
        return res.json(payload);
      }
      nodeRes.statusCode = res.statusCode;
      nodeRes.end(payload ?? '');
      return res;
    },
    end(chunk) {
      nodeRes.statusCode = res.statusCode;
      nodeRes.end(chunk);
      return res;
    },
  };
  return res;
}

/**
 * Vite dev middleware that executes Vercel functions in `api/*.ts` directly via `ssrLoadModule`,
 * so the local test copy mirrors production `/api/*` routes (AI coach proxy, Whoop, Fitbit, Strava).
 */
export function localApiPlugin(options = {}) {
  const enabled = Boolean(options.enabled);
  return {
    name: 'treise-local-api',
    configureServer(server) {
      if (!enabled) return;
      const rootDir = server.config.root || process.cwd();
      loadDotEnvLocal(rootDir);

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        if (!rawUrl.startsWith('/api/')) return next();

        const url = new URL(rawUrl, 'http://localhost');
        const rel = url.pathname.replace(/^\/api\//, '').replace(/\.js$/, '');
        if (!rel || rel.includes('..') || rel.startsWith('_lib')) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        const apiDir = path.resolve(rootDir, 'api');
        const tsFile = path.resolve(apiDir, `${rel}.ts`);
        if (!tsFile.startsWith(apiDir + path.sep) || !fs.existsSync(tsFile)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: `API route /api/${rel} not found` }));
          return;
        }

        try {
          const query = {};
          for (const [k, v] of url.searchParams.entries()) {
            query[k] = k in query ? (Array.isArray(query[k]) ? [...query[k], v] : [query[k], v]) : v;
          }

          let parsedBody = {};
          if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
            const rawBody = await readRawBody(req);
            const ctype = String(req.headers['content-type'] || '').toLowerCase();
            if (rawBody.trim()) {
              if (ctype.includes('application/json')) {
                try {
                  parsedBody = JSON.parse(rawBody);
                } catch {
                  parsedBody = rawBody;
                }
              } else if (ctype.includes('application/x-www-form-urlencoded')) {
                parsedBody = Object.fromEntries(new URLSearchParams(rawBody).entries());
              } else {
                try {
                  parsedBody = JSON.parse(rawBody);
                } catch {
                  parsedBody = rawBody;
                }
              }
            }
          }

          const mod = await server.ssrLoadModule(`/api/${rel}.ts`);
          const handler = mod?.default;
          if (typeof handler !== 'function') {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: `API handler /api/${rel} has no default export` }));
            return;
          }

          const vercelReq = Object.assign(req, { query, body: parsedBody });
          const vercelRes = createVercelResAdapter(res);
          await handler(vercelReq, vercelRes);
        } catch (err) {
          console.error(`[localApiPlugin] Error in /api/${rel}:`, err);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: err?.message || 'Local API execution error' }));
          }
        }
      });
    },
  };
}
