/**
 * Tests for the Vercel serverless proxies in api/ with simulated Whoop and Fitbit APIs.
 * Run with: npm run test:api
 */
import whoopToken from '../api/whoop/token';
import whoopBiometrics from '../api/whoop/biometrics';
import stravaToken from '../api/strava/token';
import stravaActivities from '../api/strava/activities';
import coachGenerate from '../api/coach/generate';
import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✓ ${msg}`);
  } else {
    failures++;
    console.error(`✗ ${msg}`);
  }
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  status: (code: number) => MockRes;
  json: (b: any) => MockRes;
  end: () => MockRes;
  setHeader: (k: string, v: string) => void;
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(b) {
      res.body = b;
      return res;
    },
    end() {
      return res;
    },
    setHeader(k, v) {
      res.headers[k] = v;
    },
  };
  return res;
}

type Route = (url: string, init?: any) => { status: number; body: any } | undefined;
const calls: { url: string; init?: any }[] = [];
function installFetch(route: Route) {
  calls.length = 0;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    calls.push({ url, init });
    const r = route(url, init) || { status: 404, body: {} };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };
}

const HOUR = 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

(async () => {
  // ---------------------------------------------------------------- Whoop token proxy
  console.log('\n[Whoop token proxy]');
  delete process.env.WHOOP_CLIENT_SECRET;
  installFetch(() => ({ status: 200, body: { access_token: 'a' } }));
  let res = mockRes();
  await whoopToken({ method: 'POST', headers: { origin: 'https://treise.vercel.app' }, body: 'code=x' }, res);
  assert(res.statusCode === 503 && calls.length === 0, 'Without WHOOP_CLIENT_SECRET the proxy refuses instead of using a hardcoded secret');

  process.env.WHOOP_CLIENT_SECRET = 'server-only-secret';
  installFetch((url) => (url.includes('oauth2/token') ? { status: 200, body: { access_token: 'tok', refresh_token: 'r', expires_in: 3600 } } : undefined));
  res = mockRes();
  await whoopToken(
    { method: 'POST', headers: { origin: 'https://treise.vercel.app' }, body: 'code=abc&client_secret=attacker&redirect_uri=https://evil.example' },
    res
  );
  const sent = new URLSearchParams(calls[0]?.init?.body || '');
  assert(res.statusCode === 200 && res.body.access_token === 'tok', 'Token exchange succeeds with the server-side secret');
  assert(sent.get('client_secret') === 'server-only-secret', 'Client-supplied secrets are overridden by the server secret');
  assert(sent.get('redirect_uri') === 'https://treise.vercel.app/oauth/whoop/callback', 'Redirect URI is pinned server-side');

  installFetch((url) => (url.includes('oauth2/token') ? { status: 200, body: { access_token: 'tok2', refresh_token: 'r2', expires_in: 3600 } } : undefined));
  res = mockRes();
  await whoopToken(
    { method: 'POST', headers: { origin: 'https://treise.vercel.app' }, body: 'grant_type=refresh_token&refresh_token=r&redirect_uri=https://treise.vercel.app/oauth/whoop/callback' },
    res
  );
  const sentRefresh = new URLSearchParams(calls[0]?.init?.body || '');
  assert(
    res.statusCode === 200 && !sentRefresh.has('redirect_uri') && sentRefresh.get('scope') === 'offline' && sentRefresh.get('client_secret') === 'server-only-secret',
    'Token renewals omit redirect_uri (Whoop rejects it) and request scope=offline'
  );
  assert(res.headers['Access-Control-Allow-Origin'] === 'https://treise.vercel.app', 'The app origin is allowed');

  res = mockRes();
  await whoopToken({ method: 'POST', headers: { origin: 'https://evil.example' }, body: 'code=abc' }, res);
  assert(!res.headers['Access-Control-Allow-Origin'], 'Other origins get no CORS allowance');

  res = mockRes();
  await whoopToken({ method: 'GET', headers: {} }, res);
  assert(res.body.configured === true && !JSON.stringify(res.body).includes('server-only-secret'), 'Status check never echoes the secret');

  // ---------------------------------------------------------------- Whoop biometrics proxy
  console.log('\n[Whoop biometrics proxy]');
  const sessionStart = iso(1.5 * HOUR);
  const sessionEnd = iso(0.25 * HOUR);
  const whoopWorkouts = (scoreState: string) => ({
    records: [
      // Treise session overlap
      {
        id: 'w-today',
        sport_name: 'weightlifting',
        start: iso(1.4 * HOUR),
        end: iso(0.3 * HOUR),
        score_state: scoreState,
        score: scoreState === 'SCORED' ? { strain: 9.34, average_heart_rate: 121, max_heart_rate: 164, kilojoule: 1350 } : undefined,
      },
      // An evening run 10 hours ago
      {
        id: 'w-run',
        sport_name: 'running',
        start: iso(10 * HOUR),
        end: iso(9.5 * HOUR),
        score_state: 'SCORED',
        score: { strain: 14.1, average_heart_rate: 152, max_heart_rate: 181, kilojoule: 2100 },
      },
    ],
  });
  const whoopRoute = (scoreState: string): Route => (url) => {
    if (url.includes('/v2/recovery')) return { status: 200, body: { records: [{ score_state: 'SCORED', created_at: iso(5 * HOUR), score: { recovery_score: 71, hrv_rmssd_milli: 62.4, resting_heart_rate: 52 } }] } };
    if (url.includes('/v2/activity/workout')) return { status: 200, body: whoopWorkouts(scoreState) };
    if (url.includes('/v2/')) return { status: 200, body: { records: [] } };
    return { status: 404, body: {} };
  };

  installFetch(whoopRoute('SCORED'));
  res = mockRes();
  await whoopBiometrics(
    { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { workoutWindowStart: sessionStart, workoutWindowEnd: sessionEnd }, query: {} },
    res
  );
  const b = res.body?.biometrics || {};
  assert(b.workoutStrain === 9.3, `Picks the Whoop workout that overlaps the Treise session, not the latest run (strain ${b.workoutStrain})`);
  assert(b.workoutAvgHr === 121 && b.workoutMaxHr === 164, 'Uses measured workout heart rate from Whoop');
  assert(calls.every((c) => !c.url.includes('/developer/v1/')), 'Uses Whoop v2 endpoints (no deprecated v1 calls when v2 works)');

  installFetch(whoopRoute('PENDING_SCORE'));
  res = mockRes();
  await whoopBiometrics(
    { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { workoutWindowStart: sessionStart, workoutWindowEnd: sessionEnd }, query: {} },
    res
  );
  assert(res.body.biometrics.isPendingScore === true && res.body.biometrics.workoutStrain === undefined, 'A workout Whoop is still scoring is reported as pending, with no made-up strain');

  installFetch(whoopRoute('SCORED'));
  res = mockRes();
  await whoopBiometrics(
    {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: { workoutWindowStart: iso(30 * HOUR), workoutWindowEnd: iso(29 * HOUR) },
      query: {},
    },
    res
  );
  assert(res.body.biometrics.workoutStrain === undefined, 'No Whoop workout in the session window means no strain is attached');

  // ---------------------------------------------------------------- Decommissioned Fitbit Web API check
  console.log('\n[Legacy Fitbit Web API decommissioned]');
  assert(!fs.existsSync(path.join(process.cwd(), 'api/fitbit')), 'Dead api/fitbit/ proxy directory is permanently removed');

  // A dead Whoop sign-in is reported as that, not as "no data yet".
  installFetch((url) => {
    if (url.includes('api.prod.whoop.com/oauth')) return { status: 400, body: { error: 'invalid_grant' } };
    if (url.includes('api.prod.whoop.com')) return { status: 401, body: {} };
    return undefined;
  });
  res = mockRes();
  await whoopBiometrics({ method: 'POST', headers: { authorization: 'Bearer dead' }, body: { refreshToken: 'dead' }, query: {} }, res);
  assert(res.statusCode === 401 && res.body?.error === 'whoop_reconnect_needed', 'A Whoop sign-in that can no longer refresh says so');

  // ---------------------------------------------------------------- Workout lists for active days
  console.log('\n[Whoop workout lists]');
  installFetch((url) => {
    if (url.includes('/activity/workout'))
      return {
        status: 200,
        body: { records: [{ id: 'w-9', sport_name: 'cycling', start: '2026-10-21T06:00:00Z', end: '2026-10-21T06:45:00Z', score: { average_heart_rate: 140.4, distance_meter: 18234 } }] },
      };
    return undefined;
  });
  res = mockRes();
  await whoopBiometrics({ method: 'POST', headers: {}, body: { mode: 'sessions', accessToken: 'tok' } }, res);
  const ws1 = res.body?.sessions || [];
  assert(
    res.body?.success && ws1.length === 1 && ws1[0].minutes === 45 && ws1[0].name === 'cycling' && ws1[0].distanceKm === 18.2 && ws1[0].avgHeartRate === 140,
    'Whoop workouts: sport, minutes, distance and heart rate'
  );

  // ---------------------------------------------------------------- Strava
  console.log('\n[Strava]');
  delete process.env.STRAVA_CLIENT_ID;
  delete process.env.STRAVA_CLIENT_SECRET;
  installFetch(() => ({ status: 200, body: {} }));
  res = mockRes();
  await stravaToken({ method: 'GET', headers: {} }, res);
  assert(res.body?.configured === false, 'Strava reports "not set up" until the server has its client id and secret');
  res = mockRes();
  await stravaToken({ method: 'POST', headers: {}, body: { code: 'c' } }, res);
  assert(res.statusCode === 503 && calls.length === 0, 'Without STRAVA_CLIENT_SECRET the token proxy refuses and calls nothing');

  process.env.STRAVA_CLIENT_ID = '12345';
  process.env.STRAVA_CLIENT_SECRET = 'server-only-secret';
  installFetch((url) =>
    url.includes('/oauth/token')
      ? { status: 200, body: { access_token: 'acc', refresh_token: 'ref', expires_at: 1900000000, athlete: { firstname: 'Sam', lastname: 'X', city: 'Leeds' } } }
      : undefined
  );
  res = mockRes();
  await stravaToken({ method: 'GET', headers: {} }, res);
  assert(res.body?.configured === true && res.body?.clientId === '12345' && !JSON.stringify(res.body).includes('secret'), 'Config returns the public client id only');
  res = mockRes();
  await stravaToken({ method: 'POST', headers: {}, body: { code: 'c', scope: 'read,activity:read_all' } }, res);
  const sentBody = String(calls[0]?.init?.body || '');
  assert(
    res.statusCode === 200 && res.body.accessToken === 'acc' && res.body.refreshToken === 'ref' && res.body.athleteFirstName === 'Sam' &&
      res.body.athlete === undefined && sentBody.includes('client_secret=server-only-secret') && sentBody.includes('grant_type=authorization_code'),
    'Code exchange uses the server secret and returns only tokens and first name'
  );

  installFetch((url) => {
    if (url.includes('/oauth/token')) return { status: 200, body: { access_token: 'new-acc', refresh_token: 'new-ref', expires_at: 1900003600 } };
    if (url.includes('/athlete/activities'))
      return {
        status: 200,
        body: [
          { id: 777, name: 'Morning Ride', sport_type: 'Ride', start_date: '2026-10-21T06:10:00Z', moving_time: 1980, elapsed_time: 2100, distance: 15400, average_heartrate: 128.6 },
          { id: 778, name: 'Lifting', sport_type: 'WeightTraining', start_date: '2026-10-22T17:00:00Z', moving_time: 3000 },
        ],
      };
    return undefined;
  });
  res = mockRes();
  await stravaActivities({ method: 'POST', headers: {}, body: { accessToken: 'old', refreshToken: 'ref', expiresAt: 1000 } }, res);
  const st = res.body?.sessions || [];
  assert(calls[0]?.url.includes('/oauth/token') && calls[1]?.init?.headers?.Authorization === 'Bearer new-acc', 'An expired Strava token is refreshed before reading activities');
  assert(res.body?.refreshedTokens?.refreshToken === 'new-ref', 'The rotated refresh token goes back to the app to save');
  assert(
    st.length === 2 && st[0].externalId === '777' && st[0].sportType === 'Ride' && st[0].minutes === 33 && st[0].distanceKm === 15.4 && st[0].avgHeartRate === 129,
    'Strava activities: id, sport type, moving minutes, distance and heart rate'
  );
  delete process.env.STRAVA_CLIENT_ID;
  delete process.env.STRAVA_CLIENT_SECRET;

  // ---------------------------------------------------------------- Coach (Gemini Flash-Lite)
  console.log('\n[Coach Gemini Flash-Lite]');
  delete process.env.GEMINI_API_KEY;
  installFetch(() => ({ status: 200, body: {} }));
  res = mockRes();
  await coachGenerate({ method: 'GET', headers: {} }, res);
  assert(res.body?.configured === false && res.body?.model === 'gemini-3.5-flash-lite', 'Coach proxy reports configured=false until GEMINI_API_KEY is set');
  res = mockRes();
  await coachGenerate({ method: 'POST', headers: {}, body: { systemPrompt: 'sys', messages: [{ role: 'user', content: 'hi' }] } }, res);
  assert(res.statusCode === 503 && calls.length === 0, 'Without GEMINI_API_KEY the coach proxy refuses with 503 and makes no upstream calls');

  process.env.GEMINI_API_KEY = 'server-only-gemini-key';
  installFetch((url) =>
    url.includes('gemini-3.5-flash-lite:generateContent')
      ? {
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Keep 2 reps in reserve on your working sets today.' }],
                },
              },
            ],
          },
        }
      : undefined
  );
  res = mockRes();
  await coachGenerate({ method: 'GET', headers: {} }, res);
  assert(
    res.body?.configured === true && !JSON.stringify(res.body).includes('server-only-gemini-key'),
    'Coach GET config returns configured=true and never exposes GEMINI_API_KEY'
  );
  res = mockRes();
  await coachGenerate(
    {
      method: 'POST',
      headers: {},
      body: {
        systemPrompt: 'Coach instructions.',
        messages: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: 'Follow-up question' },
        ],
        maxOutputTokens: 9999,
      },
    },
    res
  );
  const geminiCall = calls[0];
  const geminiPayload = JSON.parse(String(geminiCall?.init?.body || '{}'));
  assert(
    res.statusCode === 200 &&
      res.body?.text === 'Keep 2 reps in reserve on your working sets today.' &&
      geminiCall?.init?.headers?.['x-goog-api-key'] === 'server-only-gemini-key' &&
      !geminiCall?.url.includes('server-only-gemini-key') &&
      geminiPayload.systemInstruction?.parts?.[0]?.text === 'Coach instructions.' &&
      geminiPayload.contents?.length === 3 &&
      geminiPayload.contents[1].role === 'model' &&
      geminiPayload.generationConfig?.maxOutputTokens === 250,
    'Coach POST sends x-goog-api-key header, maps assistant->model turns, clamps maxOutputTokens, and returns clean text'
  );
  installFetch((url) =>
    url.includes('gemini-3.5-flash-lite:generateContent')
      ? { status: 404, body: { error: { code: 404 } } }
      : url.includes('gemini-3.1-flash-lite:generateContent')
      ? {
          status: 200,
          body: { candidates: [{ content: { parts: [{ text: 'Fallback Flash-Lite answer.' }] } }] },
        }
      : undefined
  );
  res = mockRes();
  await coachGenerate({ method: 'POST', headers: {}, body: { systemPrompt: 'sys', userPrompt: 'hi' } }, res);
  assert(
    res.statusCode === 200 && res.body?.text === 'Fallback Flash-Lite answer.' && res.body?.model === 'gemini-3.1-flash-lite',
    'Coach POST falls back to gemini-3.1-flash-lite when the primary model returns 404'
  );

  installFetch((url) =>
    url.includes('gemini-3.1-flash-lite:generateContent')
      ? { status: 429, body: { error: { code: 429, message: 'Rate limit exceeded' } } }
      : url.includes('gemini-3.5-flash-lite:generateContent')
      ? { status: 503, body: { error: { code: 503, message: 'Service unavailable' } } }
      : url.includes('gemini-2.5-flash-lite:generateContent')
      ? {
          status: 200,
          body: { candidates: [{ content: { parts: [{ text: 'Fallback after 429/503.' }] } }] },
        }
      : undefined
  );
  res = mockRes();
  await coachGenerate({ method: 'POST', headers: {}, body: { systemPrompt: 'sys', userPrompt: 'hi' } }, res);
  assert(
    res.statusCode === 200 && res.body?.text === 'Fallback after 429/503.' && res.body?.model === 'gemini-2.5-flash-lite',
    'Coach POST falls back across candidate models on 429 and 503 upstream statuses'
  );

  let toolPayload: any = null;
  installFetch((_url, init) => {
    toolPayload = JSON.parse(String(init?.body || '{}'));
    return {
      status: 200,
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'reset_program',
                    args: { target_week: 1, target_day: 1, confirmation_required: false },
                  },
                },
              ],
            },
          },
        ],
      },
    };
  });
  res = mockRes();
  await coachGenerate(
    {
      method: 'POST',
      headers: {},
      body: {
        systemPrompt: 'sys',
        userPrompt: 'reset to day 1',
        maxOutputTokens: 400,
        tools: [
          {
            name: 'reset_program',
            description: 'Reset active program',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        ],
      },
    },
    res
  );
  assert(
    res.statusCode === 200 &&
      res.body?.functionCall?.name === 'reset_program' &&
      res.body?.functionCall?.args?.target_day === 1 &&
      toolPayload?.tools?.[0]?.functionDeclarations?.[0]?.name === 'reset_program' &&
      toolPayload?.generationConfig?.maxOutputTokens === 400,
    'Coach POST forwards tools declarations and returns parsed functionCall cleanly'
  );

  // Verify all 21 OOUX coach tools (up to 32 cap) are forwarded without truncation at 16
  let multiToolPayload: any = null;
  installFetch((_url, init) => {
    multiToolPayload = JSON.parse(String(init?.body || '{}'));
    return {
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: 'All tools registered.' }] } }] },
    };
  });
  const twentyOneTools = Array.from({ length: 21 }, (_, idx) => ({
    name: `coach_tool_${idx + 1}`,
    description: `Tool ${idx + 1}`,
    parameters: { type: 'object', properties: {}, required: [] },
  }));
  res = mockRes();
  await coachGenerate(
    {
      method: 'POST',
      headers: {},
      body: {
        systemPrompt: 'sys',
        userPrompt: 'check tools',
        tools: twentyOneTools,
      },
    },
    res
  );
  assert(
    res.statusCode === 200 &&
      multiToolPayload?.tools?.[0]?.functionDeclarations?.length === 21 &&
      multiToolPayload?.tools?.[0]?.functionDeclarations?.[20]?.name === 'coach_tool_21',
    'Coach POST forwards all 21 OOUX tool declarations (32 tool cap, no truncation at 16)'
  );

  delete process.env.GEMINI_API_KEY;

  // ---------------------------------------------------------------- Deployability
  // package.json is "type": "module", so Vercel runs api/ as ES modules, which need explicit
  // file extensions on relative imports. A missing ".js" crashes every function at runtime.
  console.log('\n[Deployability]');
  const apiDir = path.join(process.cwd(), 'api');
  const apiFiles: string[] = [];
  const walk = (dir: string) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) apiFiles.push(p);
    });
  walk(apiDir);
  const badImports = apiFiles.flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)]
      .map((m) => m[1])
      .filter((spec) => !spec.endsWith('.js'))
      .map((spec) => `${path.relative(process.cwd(), file)} -> ${spec}`)
  );
  assert(apiFiles.length > 0 && badImports.length === 0, `Relative imports in api/ end in .js (${badImports.join(', ') || 'all OK'})`);

  console.log(failures === 0 ? '\nALL API PROXY TESTS PASSED' : `\n${failures} API PROXY TEST(S) FAILED`);
  if (failures > 0) process.exit(1);
})();
