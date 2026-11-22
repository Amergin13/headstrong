# Treise ⚡🛡️
### Mobile-First PWA for Gamified Hypertrophy, Strength Standards & Pixel Watch Biometrics

**Treise** (old Irish for *strength, force, and power*) is a Progressive Web App (PWA) built for serious lifters that fuses progressive overload exercise science with real-time biometric auto-regulation from the Google Pixel Watch (Fitbit Web API).

---

## ⚡ Core Architecture & Engineering Highlights

### 1. Exercise Science Engine (`src/engine/`)
- **RIR-Adjusted Estimated 1RM (E1RM):**
  $$\text{E1RM} = \text{Effective Weight} \times \left(1 + \frac{\min(\text{Reps} + \text{EffectiveRIR},\, 15)}{30}\right)$$
  - **Weighted & Assisted Calisthenics:** Includes 7-day EMA bodyweight plus external load (or minus counterweight assistance).
  - **Equipment Stabilization Multipliers:**
    - Dumbbell compound presses = `1.18x` combined weight (logged per dumbbell on paired 2-DB lifts).
    - Romanian Deadlifts (RDL) = `1.20x` vs. Conventional Deadlift standard.
- **7-Day Bodyweight Exponential Moving Average (EMA):**
  $$\text{EMA}_{\text{today}} = (\text{Weight}_{\text{today}} \times 0.25) + (\text{EMA}_{\text{yesterday}} \times 0.75)$$
- **Official International DOTS Polynomial:**
  $$\text{DOTS} = \text{E1RM}_{\text{kg}} \times \left(\frac{500}{A \cdot w^4 + B \cdot w^3 + C \cdot w^2 + D \cdot w + E}\right)$$
  - Full male and female international powerlifting polynomial coefficients.
- **Published Strength Standards (Kilgore / Poliquin) with 4 Sub-Divisions:**
  - Tiers: `Untrained`, `Novice`, `Intermediate`, `Advanced`, `Elite` each segmented into `I, II, III, IV`.
  - Live rep/load targets calculating exact reps or kg needed to reach the next sub-division.
- **Double Progression Auto-Regulation & Amber Shield:**
  - Prescribes `+2.5kg` (barbell/cable/machine) or `+1.0kg/DB` (`+2.0kg` pair) when top of rep range is hit across sets at quality RIR.
  - Daily Readiness Z-Score computed from wearable HRV (RMSSD), Resting Heart Rate, and Sleep vs. 14-day baseline.
  - **Amber Shield:** Detects high systemic fatigue (HRV down >15%, RHR +4 bpm, or sleep <6h), scales local muscle recovery windows by `1.2x`, holds working load static, shifts target effort to 2–3 RIR, and protects the training streak.
- **Work Capacity Index (WCI):**
  $$\text{WCI} = \frac{\sum (\text{Weight} \times \text{Reps})}{\text{Duration (min)} \times (1 + \max(0.35,\; \text{Avg Session HRR}\%))}$$
- **7th Pillar (Engine / Vitality):**
  - Synthesizes VO2 Max, Resting HR, and Daily Steps alongside the 6 movement pillars.

---

## 📱 Mobile-First 4-Tab Architecture

1. **Workout:** Today's queued session with personalized loads, invariant `SET | PREV | WEIGHT | REPS | RIR | DONE` logging table, 2-line goal-driven exercise summary (`EXERCISE_BRIEF_BLUEPRINT`), unified best-set / E1RM `TrendChart`, canonical `ExerciseDetailModal` drill-in, smart `ExerciseSwapModal`, and calm advisory recovery with 1-tap opt-in modulation (`Trim 1 set / lift` or `Shift to 2–3 RIR`).
2. **Program:** 6-Week plan overview with the 3D `IdentityForm` sphere, phases 1–3, `PastWorkoutModal`, and Settings (location & equipment, goal phase, units `kg/lb`, wearables, and encrypted/JSON data backup).
3. **AI Coach:** Fly-up sheet powered by on-device Gemini Nano (`LanguageModel`) + stateless `/api/coach/generate` (`gemini-3.5-flash-lite`) fallback and 21 undo-safe deterministic tools. Pain or warning symptoms always receive a fixed safety reply (`buildSafetyResponse`).
4. **Progress:** Segmented count rings (`GoalsHero`), Trophy Case personal bests, Lifetime & Recent 30-day totals, 8-week per-muscle cards, Bodyweight & 12-site tape measurements, Kilgore/Poliquin `StrengthLevelsCard` & `BalanceCard`, and `KnowledgeGraphCard` insights (every exercise entry point opens the canonical `ExerciseDetailModal`).

## 🔐 Configuration

Set these as Vercel environment variables (never in code):

- `WHOOP_CLIENT_SECRET`: Whoop OAuth client secret (rotate the one that was previously committed).
- `FITBIT_CLIENT_SECRET` (and optionally `FITBIT_CLIENT_ID`).
- `ALLOWED_ORIGINS` (optional): extra comma-separated origins allowed to call `api/`.

---

## 🚀 Getting Started

### Install Dependencies:
```bash
npm install
```

### Run Test Suites:
```bash
npm run test:engine
```
```bash
npm run test:api
```

### Start Development Server:
```bash
npm run dev
```
*Note: Vite is configured with `host: true` so you can open `http://<your-lan-ip>:5173` directly on your mobile device over local Wi-Fi.*

### Build Production PWA:
```bash
npm run build
```
Generates production assets, Service Worker, and Web App Manifest in `dist/`.
