import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 5175;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry until ready
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for local test server at ${url}`);
}

function assertProductionDistClean() {
  const distAssetsDir = path.resolve(process.cwd(), 'dist', 'assets');
  if (!fs.existsSync(distAssetsDir)) {
    console.log('ℹ️  dist/assets not built yet; skipping prod leakage check.');
    return;
  }
  const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
  for (const f of jsFiles) {
    const content = fs.readFileSync(path.join(distAssetsDir, f), 'utf8');
    assert.ok(
      !content.includes('Treise Local Test Lab') && !content.includes('treise_local_active_scenario_v1'),
      `Production bundle ${f} must not contain local test harness code`
    );
  }
  console.log(`✓ Production dist/assets (${jsFiles.length} JS chunks) contains zero local test harness code`);
}

async function verifyLocalApiRoutes() {
  const getCoach = await fetch(`${BASE_URL}/api/coach/generate`);
  assert.equal(getCoach.status, 200, 'GET /api/coach/generate should return 200');
  const coachInfo = await getCoach.json();
  assert.equal(typeof coachInfo.configured, 'boolean');
  assert.ok(coachInfo.model, 'GET /api/coach/generate returns model');

  const postCoach = await fetch(`${BASE_URL}/api/coach/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userPrompt: 'test' }),
  });
  assert.ok(
    coachInfo.configured ? postCoach.status === 200 : postCoach.status === 503,
    `POST /api/coach/generate returned unexpected status ${postCoach.status}`
  );

  for (const route of ['/api/whoop/token', '/api/fitbit/token', '/api/strava/token']) {
    const r = await fetch(`${BASE_URL}${route}`);
    assert.equal(r.status, 200, `GET ${route} should return 200`);
    const body = await r.json();
    assert.equal(typeof body.configured, 'boolean', `GET ${route} should return configured flag`);
  }
  console.log('✓ Local /api/* middleware routes executed cleanly (coach, whoop, fitbit, strava)');
}

function verifyAllScenariosInChrome() {
  if (!fs.existsSync(CHROME_PATH)) {
    console.log('ℹ️  Google Chrome not found; skipping headless DOM render checks.');
    return;
  }

  const expectations = [
    ['fresh-onboarding', ['Identity', 'role="dialog"', 'Local Test Lab']],
    ['starter-day1-calibrated', ['1/24', 'Barbell Back Squat', 'Open Local Test Lab']],
    ['mid-plan-normal', ['11/24', 'Upper', 'Open Local Test Lab']],
    ['returning-cycle-2', ['Cycle 2', '6 Week Starter Plan', 'Open Local Test Lab']],
    ['recovery-gate-blocked', ['Your muscles are still recovering', 'Train anyway']],
    ['amber-shield', ['Amber Shield', 'Open Local Test Lab']],
    ['primed-progression', ['Primed', 'Barbell Back Squat']],
    ['today-finished', ["Today's workout finished", 'Sets', 'Open Local Test Lab']],
    ['home-gym', ['Dumbbell', 'Open Local Test Lab']],
    ['travel-bodyweight', ['Push-Up', 'Open Local Test Lab']],
    ['imperial-lb', ['LB', 'Open Local Test Lab']],
    ['strength-imbalances-female', ['Strength standards', 'Strength levels', 'Barbell Bench Press']],
    ['active-days-wearables', ['Progress', 'Strength standards', 'Open Local Test Lab']],
  ];

  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'treise-e2e-'));
  try {
    for (const [id, tokens] of expectations) {
      const url = `${BASE_URL}/?scenario=${encodeURIComponent(id)}`;
      const dom = execFileSync(
        CHROME_PATH,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--log-level=3',
          `--user-data-dir=${tmpProfile}`,
          '--window-size=412,915',
          '--virtual-time-budget=3500',
          '--dump-dom',
          url,
        ],
        { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      assert.ok(!dom.includes('Something went wrong in'), `Scenario ${id} triggered an ErrorBoundary`);
      for (const token of tokens) {
        assert.ok(
          dom.toLowerCase().includes(token.toLowerCase()),
          `Scenario ${id} DOM missing expected text/attribute "${token}"`
        );
      }
      console.log(`✓ Scenario "${id}" rendered cleanly (${tokens.join(', ')})`);
    }
  } finally {
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  }
}

async function main() {
  assertProductionDistClean();

  const child = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--host', '127.0.0.1'],
    {
      env: {
        ...process.env,
        TREISE_LOCAL_TEST: '1',
        VITE_LOCAL_TEST_COPY: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let serverLogs = '';
  child.stdout?.on('data', (d) => {
    serverLogs += d.toString();
  });
  child.stderr?.on('data', (d) => {
    serverLogs += d.toString();
  });

  try {
    await waitForServer(`${BASE_URL}/`);
    await verifyLocalApiRoutes();
    verifyAllScenariosInChrome();
    console.log('\nALL LOCAL TEST COPY API & 13 USE-CASE RENDER CHECKS PASSED!');
  } catch (err) {
    console.error('\nLocal test copy verification failed:', err);
    if (serverLogs.trim()) {
      console.error('--- Server logs ---\n' + serverLogs.slice(-2000));
    }
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

await main();
