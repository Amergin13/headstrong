# Treise ⚡🛡️
### Mobile-First PWA for Gamified Hypertrophy, Strength Standards & Pixel Watch Biometrics

**Treise** (old Irish for *strength, force, and power*) is a Progressive Web App (PWA) built for serious lifters that fuses progressive overload exercise science with real-time biometric auto-regulation from the Google Pixel Watch (Fitbit Web API).

---

## ⚡ Core Architecture & Engineering Highlights

### 1. Exercise Science Engine (`src/engine/`)
- **RIR-Adjusted Estimated 1RM (E1RM):**
  $$E1RM = \text{Effective Weight} \times \left(1 + \frac{\text{Reps} + \text{RIR}}{30}\right)$$
  - **Weighted Calisthenics:** Includes 7-day EMA bodyweight plus external load.
  - **Equipment Stabilization Multipliers:**
    - Dumbbell compound presses = `1.18x` combined weight.
    - Romanian Deadlifts (RDL) = `1.20x` vs. Conventional Deadlift standard.
- **7-Day Bodyweight Exponential Moving Average (EMA):**
  $$EMA_{today} = (Weight_{today} \times 0.25) + (EMA_{yesterday} \times 0.75)$$
- **Official International DOTS Polynomial:**
  $$DOTS = E1RM_{kg} \times \left(\frac{500}{A \cdot w^4 + B \cdot w^3 + C \cdot w^2 + D \cdot w + E}\right)$$
  - Full male and female international powerlifting polynomial coefficients.
- **6-Pillar Strength Standards with 4 Sub-Divisions:**
  - Tiers: `Untrained`, `Novice`, `Intermediate`, `Advanced`, `Elite` each segmented into `I, II, III, IV`.
  - Live "Sub-Tier Quest" calculating exact kg or reps needed to level up.
- **Double Progression Auto-Regulation & Amber Shield:**
  - Prescribes `+2.5kg` (barbell) or `+2.0kg` (dumbbell) when top of rep range is hit across sets at 1–2 RIR.
  - Daily Readiness Z-Score computed from Pixel Watch HRV (RMSSD), Resting Heart Rate, and Sleep vs. 14-day baseline.
  - **Amber Shield:** Detects high systemic fatigue (HRV down >15%, RHR +4 bpm, or sleep <6h), holds working load static, shifts target effort to 2–3 RIR, and guarantees streak and XP protection.
- **Work Capacity Index (WCI):**
  $$WCI = \frac{\text{Effective Tonnage} \times \text{Completed Sets}}{\text{Avg Session HRR}\% \times \text{Duration (min)}}$$
- **7th Pillar (Engine / Vitality):**
  - Synthesizes Pixel Watch VO2 Max, Resting HR, and Daily Steps alongside the 6 movement pillars.

---

## 📱 Mobile-First Tabs

1. **Workout:** the next queued session with weights carried over from your history, exact previous sets (PREV), optional haptic tempo guide, a rest timer labelled with the exercise and next set, and a recovery screen that holds the next session until your muscles are ready (with per-muscle ready times, a recovered alternative, and "Train anyway").
2. **Program:** goal, 6-week block, splits (including the 24-workout 6-Week Muscle Building Plan), equipment, units (kg/lb), wearables, and data backup. Has a "Back to workout" link; the Workout tab's week pill opens it.
3. **AI Coach:** answers with on-device Gemini Nano when Chrome has it available (Pixel phones via AICore), otherwise with the rule-based coach. Pain or warning symptoms always get a fixed safety reply.
4. **Progress:** estimated 1-rep max vs bodyweight per movement, workout volume (or stamina when Whoop provides workout heart rate), recovery insights from real watch data only.
5. **Athlete:** strength-to-weight score and Big 3 from logged lifts only, weekly sets per muscle against this week's target, strength balance, and your XP division.

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
