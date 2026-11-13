# Treise Local Test Copy

Run a completely isolated local test copy of Treise to manually exercise every workout, recovery, progression, strength standard, location, unit, onboarding, and API use case without affecting production (`https://treise.vercel.app/`).

## Quick Start

```bash
npm run local
```

- Opens an isolated dev server at **`http://localhost:5174`** (separate browser `localStorage` origin from port `5173` and production, plus LAN IP for testing directly on your phone).
- Executes real Vercel functions under `api/*.ts` locally (`/api/coach/generate`, `/api/whoop/*`, `/api/fitbit/*`, `/api/strava/*`).
- Mounts the **Local Test Lab** button at the bottom-left (`Treise Local Test Lab`) for 1-click use-case switching and live state overrides.
- Automatically stripped from production builds (`npm run build`) when `VITE_LOCAL_TEST_COPY` is unset.

## Optional Local API Keys

By default, `/api/coach/generate` runs in offline-ready deterministic fallback mode (`configured: false`). To also test live Gemini Flash-Lite coaching or wearable OAuth locally:

```bash
cp env.local.example .env.local
```

Add `GEMINI_API_KEY=...` (or wearable client secrets) to `.env.local` (gitignored) and restart `npm run local`.

## Direct Scenario URLs

Open any scenario directly by adding `?scenario=<id>` on `http://localhost:5174`:

- `fresh-onboarding` — Clean install 3-step onboarding flow
- `starter-day1-calibrated` — Post-onboarding Day 1 (`1/24`) calibrated weights
- `mid-plan-normal` — Week 3 (`10/24`), 6-week weigh-ins, charts & streak
- `returning-cycle-2` — Cycle 1 completed (18 lifts + 6 active days) -> Cycle 2 start
- `recovery-gate-blocked` — Muscles still recovering gate + `Train anyway`
- `amber-shield` — Depressed HRV/sleep -> `Amber Shield` static weights & 2–3 RIR
- `primed-progression` — High readiness + topped-out prior reps -> `+2.5 kg / +2 kg` step-up
- `today-finished` — Post-workout finished summary card + next workout recovery
- `home-gym` — Gym history adapted to home bench/dumbbells/pull-up bar
- `travel-bodyweight` — Bodyweight-only hotel travel adaptation
- `imperial-lb` — Pounds (`lb`) units, charts, plates & snapped weights
- `strength-imbalances-female` — Female 40–49 Kilgore tables, Tested `<=5` rep lifts, Poliquin chin-up lag & `<90%` left/right asymmetry
- `active-days-wearables` — Cardio `ActivityLog` days bridging rest gaps + Pixel Watch vitality

## Automated End-to-End Local Check

```bash
npm run test:local:e2e
```

Starts the local test server, verifies zero test-harness code leaks into `dist/`, tests local `/api/*` routes, and renders all 13 scenarios in headless Chrome.
