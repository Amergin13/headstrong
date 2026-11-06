/**
 * Tests for the Vercel serverless proxies in api/ with simulated Whoop and Fitbit APIs.
 * Run with: npm run test:api
 */
import whoopToken from '../api/whoop/token';
import whoopBiometrics from '../api/whoop/biometrics';
import fitbitToken from '../api/fitbit/token';
import fitbitBiometrics from '../api/fitbit/biometrics';
import stravaToken from '../api/strava/token';
import stravaActivities from '../api/strava/activities';
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

  // ---------------------------------------------------------------- Fitbit / Google Health token proxy
  console.log('\n[Fitbit / Google Health token proxy]');
  delete process.env.FITBIT_CLIENT_ID;
  delete process.env.FITBIT_CLIENT_SECRET;
  delete process.env.GOOGLE_HEALTH_CLIENT_ID;
  delete process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  installFetch(() => ({ status: 200, body: { access_token: 'a' } }));
  res = mockRes();
  await fitbitToken({ method: 'GET', headers: {} }, res);
  assert(
    res.body?.configured === false && !res.body?.clientId,
    'Fitbit token proxy reports configured: false when no server client ID and secret are set'
  );
  res = mockRes();
  await fitbitToken({ method: 'POST', headers: { origin: 'https://treise.vercel.app' }, body: 'code=abc&client_id=23QW89' }, res);
  assert(
    res.statusCode === 503 && calls.length === 0,
    'Without FITBIT_CLIENT_SECRET or GOOGLE_HEALTH_CLIENT_SECRET the proxy refuses instead of calling a decommissioned endpoint'
  );

  process.env.GOOGLE_HEALTH_CLIENT_ID = '123456-gh.apps.googleusercontent.com';
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'gh-server-secret';
  installFetch((url) =>
    url.includes('oauth2.googleapis.com/token')
      ? { status: 200, body: { access_token: 'ya29.test_tok', refresh_token: '1//gh_ref', expires_in: 3599 } }
      : undefined
  );
  res = mockRes();
  await fitbitToken({ method: 'GET', headers: {} }, res);
  assert(
    res.body?.configured === true &&
      res.body?.mode === 'google_health' &&
      res.body?.clientId === '123456-gh.apps.googleusercontent.com' &&
      !JSON.stringify(res.body).includes('gh-server-secret'),
    'Fitbit token GET exposes Google Health clientId and mode without leaking client secret'
  );
  res = mockRes();
  await fitbitToken(
    {
      method: 'POST',
      headers: { origin: 'https://treise.vercel.app' },
      body: 'code=authcode&code_verifier=pkce123&client_secret=attacker&redirect_uri=https://evil.example',
    },
    res
  );
  const sentGh = new URLSearchParams(calls[0]?.init?.body || '');
  assert(
    res.statusCode === 200 && res.body?.access_token === 'ya29.test_tok',
    'Google Health token exchange succeeds via oauth2.googleapis.com/token'
  );
  assert(
    sentGh.get('client_id') === '123456-gh.apps.googleusercontent.com' &&
      sentGh.get('client_secret') === 'gh-server-secret' &&
      sentGh.get('redirect_uri') === 'https://treise.vercel.app/oauth/callback',
    'Google Health token proxy pins client_id, client_secret and redirect_uri server-side'
  );
  delete process.env.GOOGLE_HEALTH_CLIENT_ID;
  delete process.env.GOOGLE_HEALTH_CLIENT_SECRET;

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

  // Google Health API v4 biometrics & sessions
  installFetch((url) => {
    if (url.includes('/dataTypes/daily-resting-heart-rate/dataPoints')) {
      return { status: 200, body: { dataPoints: [{ beatsPerMinute: 54 }] } };
    }
    if (url.includes('/dataTypes/daily-heart-rate-variability/dataPoints')) {
      return { status: 200, body: { dataPoints: [{ rootMeanSquareOfSuccessiveDifferencesMillis: 63.4 }] } };
    }
    if (url.includes('/dataTypes/sleep/dataPoints')) {
      return {
        status: 200,
        body: {
          dataPoints: [
            {
              interval: { startTime: '2026-10-21T23:00:00Z', endTime: '2026-10-22T06:45:00Z' },
              summary: { totalSleepMinutes: 450 },
            },
          ],
        },
      };
    }
    if (url.includes('/dataTypes/steps/dataPoints')) {
      return { status: 200, body: { dataPoints: [{ count: 6200 }, { count: 3100 }] } };
    }
    if (url.includes('/dataTypes/active-zone-minutes/dataPoints')) {
      return { status: 200, body: { dataPoints: [{ activeZoneMinutes: 28 }, { activeZoneMinutes: 14 }] } };
    }
    if (url.includes('/dataTypes/weight/dataPoints')) {
      return { status: 200, body: { dataPoints: [{ weightKilograms: 80.64 }] } };
    }
    return undefined;
  });
  res = mockRes();
  await fitbitBiometrics(
    { method: 'POST', headers: { authorization: 'Bearer ya29.google_health_tok' }, body: {}, query: { date: '2026-10-22' } },
    res
  );
  const ghBio = res.body?.biometrics || {};
  assert(
    ghBio.restingHr === 54 &&
      ghBio.hrvRmssd === 63 &&
      ghBio.sleepHours === 7.5 &&
      ghBio.steps === 9300 &&
      ghBio.activeZoneMinutes === 42 &&
      ghBio.bodyweightKg === 80.6,
    'Google Health API v4 biometrics: maps RHR, HRV RMSSD, sleep, steps, active zone minutes and weight'
  );

  installFetch((url) => {
    if (url.includes('/dataTypes/exercise/dataPoints')) {
      return {
        status: 200,
        body: {
          dataPoints: [
            {
              id: 'gh-ex-1',
              exerciseType: 'RUNNING',
              interval: { startTime: '2026-10-22T07:00:00Z', endTime: '2026-10-22T07:35:00Z' },
              metricsSummary: { distanceMeters: 6400, averageHeartRateBpm: 148.2, activeEnergyKilocalories: 410 },
            },
          ],
        },
      };
    }
    return undefined;
  });
  res = mockRes();
  await fitbitBiometrics(
    { method: 'POST', headers: {}, body: { mode: 'sessions', accessToken: 'ya29.google_health_tok', afterDate: '2026-10-08' }, query: {} },
    res
  );
  const ghSessions = res.body?.sessions || [];
  assert(
    res.body?.success &&
      ghSessions.length === 1 &&
      ghSessions[0].externalId === 'gh-ex-1' &&
      ghSessions[0].minutes === 35 &&
      ghSessions[0].distanceKm === 6.4 &&
      ghSessions[0].avgHeartRate === 148,
    'Google Health API v4 exercise sessions: maps id, duration, distance and average heart rate'
  );

  // ---------------------------------------------------------------- Workout lists for active days
  console.log('\n[Fitbit / Whoop workout lists]');
  installFetch((url) => {
    if (url.includes('/activities/list.json'))
      return {
        status: 200,
        body: {
          activities: [
            { logId: 111, activityName: 'Bike', startTime: '2026-10-21T07:30:00.000+01:00', activeDuration: 32 * 60000, distance: 10, distanceUnit: 'Mile', averageHeartRate: 131 },
            { logId: 112, activityName: 'Walk', startTime: '2026-10-22T12:00:00.000+01:00', duration: 25 * 60000 },
          ],
        },
      };
    return undefined;
  });
  res = mockRes();
  await fitbitBiometrics({ method: 'POST', headers: {}, body: { mode: 'sessions', accessToken: 'tok', afterDate: '2026-10-08' }, query: {} }, res);
  const fs1 = res.body?.sessions || [];
  assert(
    res.body?.success && fs1.length === 2 && fs1[0].externalId === '111' && fs1[0].minutes === 32 && fs1[0].distanceKm === 16.1 && fs1[0].avgHeartRate === 131,
    'Fitbit exercise log: id, minutes, distance (miles to km) and heart rate'
  );
  assert(calls.length === 1 && calls[0].url.includes('afterDate=2026-10-08'), 'Fitbit sessions mode reads only the exercise log, from the date the app sends');

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
