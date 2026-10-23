/**
 * Tests for the Vercel serverless proxies in api/ with simulated Whoop and Fitbit APIs.
 * Run with: npm run test:api
 */
import whoopToken from '../api/whoop/token';
import whoopBiometrics from '../api/whoop/biometrics';
import fitbitBiometrics from '../api/fitbit/biometrics';
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

  // ---------------------------------------------------------------- Fitbit biometrics proxy
  console.log('\n[Fitbit biometrics proxy]');
  installFetch((url) => {
    if (url.includes('/activities/heart/')) return { status: 200, body: { 'activities-heart': [{ value: { restingHeartRate: 57, heartRateZones: [{ name: 'Peak', min: 160 }] } }] } };
    if (url.includes('/hrv/')) return { status: 200, body: { hrv: [{ value: { dailyRmssd: 48.6 } }] } };
    if (url.includes('/sleep/')) return { status: 200, body: { summary: { totalMinutesAsleep: 412 } } };
    if (url.includes('/activities/date/')) return { status: 200, body: { summary: { steps: 8123, activeZoneMinutes: { totalMinutes: 31 }, caloriesOut: 2400 } } };
    if (url.includes('/body/log/weight/')) return { status: 200, body: { weight: [{ weight: 81.35 }] } };
    if (url.includes('/readiness/')) return { status: 404, body: {} };
    return undefined;
  });
  res = mockRes();
  await fitbitBiometrics({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: {}, query: { date: '2026-10-22' } }, res);
  const f = res.body?.biometrics || {};
  assert(f.restingHr === 57 && f.hrvRmssd === 49 && f.sleepHours === 6.9, 'Maps resting HR, HRV and sleep from Fitbit');
  assert(f.steps === 8123 && f.activeZoneMinutes === 31 && f.bodyweightKg === 81.4, 'Maps steps, active minutes and weight');
  assert(f.maxWorkoutHr === undefined, 'Does not invent a workout peak heart rate from zone boundaries');
  assert(f.fitbitReadinessScore === undefined, "Does not label its own estimate as Fitbit's readiness score");
  assert(calls.every((c) => !c.url.includes('/date/') || c.url.includes('2026-10-22')), "Uses the athlete's local date sent by the app");

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
