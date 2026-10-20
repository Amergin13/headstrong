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

## 📱 Mobile-First 4-Tab Interface

1. **Train Tab (Live Workout HUD):**
   - Morning Pixel Watch Readiness Banner with interactive 1-tap testing toggle (`⚡ Primed (+15% XP)`, `🟢 Normal`, `🛡️ Amber Shield`).
   - Dynamic Double Progression recommendations and Sub-Tier Quest callouts.
   - 1-tap set completion with `0 | 1 | 2 | 3+` RIR selector pills.
   - Floating Rest Timer with real-time simulated Pixel Watch "60% Max HR Ready" recovery telemetry.
   - Live XP popups and level progression rings.
2. **Character Tab (Gamification & Goals):**
   - Macro Goal Phase switcher: `Lean Bulk`, `Cut / Recomp` (with Retention Shield active), `Maingain`.
   - 7-Pillar Athletic Radar Chart.
   - Weekly Muscle Group Volume tracker highlighting the evidence-based 10–20 hard-set sweet spot.
   - International DOTS score breakdown.
3. **Analytics Tab (The Fitness Story):**
   - Dual-axis trend chart: E1RM progression vs. 7-Day EMA Bodyweight with 1-tap daily scale log.
   - Work Capacity Index (WCI) cardiovascular efficiency area chart.
   - Daily Steps & Active Zone Minutes (AZM) with `1.25x Metabolic Momentum` XP badge.
4. **Program & Watch Sync Tab:**
   - Push / Pull / Legs workout split and template editor.
   - Custom exercise creator with equipment multipliers.
   - Google Pixel Watch 3 / Fitbit OAuth 2.0 PKCE module and live demo telemetry simulator.

---

## 🚀 Getting Started

### Install Dependencies:
```bash
npm install
```

### Run Engine Test Suite:
```bash
npm run test:engine
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
