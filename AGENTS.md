# Treise Architecture & Exercise Science Formulas

## 0. Non-Negotiables (read first, override everything below)

These rules exist because earlier sessions broke them. Any change that violates one is wrong, even if another section seems to allow it.

1. **Never fabricate data or claims.** No fake users, leaderboard entries, heart rates, sleep, HRV, durations, "simulated" syncs, demo sign-ins, latency numbers or hardware badges in the real app. Missing data is stored as `0`/`undefined` and shown as "—" or an empty state. Sample data only appears after the athlete explicitly loads the demo. The one exception: an exercise card with fewer than two logged sessions shows a dimmed progress chart labelled "Example" (shape only, no numbers).
2. **Never put secrets in client code.** OAuth client secrets live only in Vercel environment variables (`WHOOP_CLIENT_SECRET`, `FITBIT_CLIENT_SECRET`) and are used only in `api/`. CI fails if `client_secret` appears in the built bundle.
3. **Never claim what isn't built.** No "cloud sync", "community", "Bluetooth scale" or hardware claims unless the feature exists end to end. The privacy policy (`public/privacy.html`) must match what the code actually does.
4. **Safety beats engagement.** Pain, injury or warning-symptom messages always get the fixed reply from `buildSafetyResponse` (stop the movement, swap it, see a professional). The model never answers these.
5. **Respect recovery.** The Workout tab never offers the next session as "today's workout" while its muscles are still recovering (`src/engine/recovery.ts`). It shows when it will be ready, a recovered alternative if one exists, and a secondary "Train anyway".
6. **Weights come from the athlete.** Every generated session goes through `personalizeSessionLoads` (history carry-over, learned strength ratios, onboarding calibration). Never show template weights to a new athlete unscaled.
7. **Store kg, display the athlete's unit.** Use `useUnits()` for every weight shown or typed.
8. **Use local dates** (`localDateString`), never `toISOString().split('T')[0]`.
9. **Run `npm run test:engine`, `npm run test:api` and `npx tsc --noEmit -p .` before finishing.** Update tests when behaviour intentionally changes; never weaken a test to hide a regression.

---

This document outlines the core mathematical models, exercise science principles, and biometric integration formulas implemented in **Treise**, a mobile-first Progressive Web App (PWA) designed for gamified hypertrophy workout tracking, international strength standards, and Google Pixel Watch / Fitbit and Whoop telemetry.

---

## 1. Core Exercise Science Formulas

### 1.1 RIR-Adjusted Estimated 1-Rep Max (E1RM)
Based on an augmented Epley/Lombardi progression model accounting for Repetitions in Reserve (RIR):
$$\text{E1RM} = \text{Effective Weight} \times \left(1 + \frac{\text{Reps} + \text{RIR}}{30}\right)$$

#### Weight Adjustments & Equipment Stabilization Multipliers
- **Weighted Calisthenics (Pull-Ups, Dips):**
  $$\text{Effective Weight} = \text{EMA}_{7\text{-day Bodyweight}} + \text{External Load}$$
  *(For bodyweight-only sets, external load = 0 kg).*
- **Dumbbell Exercise Multiplier:**
  $$\text{Effective Barbell-Equivalent Weight} = \text{Combined Dumbbell Weight} \times 1.18$$
  *(Reflects stabilizer muscle fatigue and bilateral deficit).*
- **Romanian Deadlift (RDL) Multiplier:**
  $$\text{Effective Deadlift-Equivalent Weight} = \text{RDL Weight} \times 1.20$$
  *(Normalizes posterior chain loading against conventional deadlift standard).*

---

### 1.2 7-Day Bodyweight Exponential Moving Average (EMA)
Mitigates daily water retention and glycogen fluctuations:
$$\text{EMA}_{\text{today}} = (\text{Weight}_{\text{today}} \times 0.25) + (\text{EMA}_{\text{yesterday}} \times 0.75)$$

---

### 1.3 Official International DOTS Polynomial
The DOTS formula normalizes strength across different body masses for fair relative strength scoring:
$$\text{DOTS} = \text{E1RM}_{\text{kg}} \times \left(\frac{500}{A \cdot w^4 + B \cdot w^3 + C \cdot w^2 + D \cdot w + E}\right)$$
where $w$ is the 7-day EMA bodyweight in kg.

#### Polynomial Coefficients:
- **Male:**
  - $A = -0.0000010930$
  - $B = 0.0007391293$
  - $C = -0.1918759221$
  - $D = 24.0900756$
  - $E = -307.75076$
- **Female:**
  - $A = -0.0000010706$
  - $B = 0.0005158568$
  - $C = -0.1126655495$
  - $D = 13.6175032$
  - $E = -57.96288$

---

### 1.4 6-Pillar International Strength Standards
The 6 foundational movement pillars benchmark a lifter's strength relative to bodyweight ratio ($\frac{\text{E1RM}}{\text{EMA}_{BW}}$):
1. **Squat** (Quads, Glutes)
2. **Hinge** (Hamstrings, Posterior Chain, Conventional Deadlift)
3. **Horizontal Push** (Bench Press, Chest Press)
4. **Vertical Push** (Overhead Press)
5. **Horizontal Pull** (Barbell Row, Cable Row)
6. **Vertical Pull** (Pull-Up, Lat Pulldown; uses Total Mass = $\text{EMA}_{BW} + \text{Load}$)

#### Tier Thresholds (Male E1RM / BW):
| Movement Pillar | Untrained | Novice | Intermediate | Advanced | Elite |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Squat** | 0.75 | 1.20 | 1.50 | 2.00 | 2.50 |
| **Hinge** | 0.95 | 1.45 | 1.80 | 2.40 | 3.00 |
| **Horizontal Push** | 0.60 | 0.90 | 1.20 | 1.55 | 1.90 |
| **Vertical Push** | 0.40 | 0.60 | 0.80 | 1.05 | 1.30 |
| **Horizontal Pull** | 0.50 | 0.75 | 1.00 | 1.30 | 1.60 |
| **Vertical Pull (Total)** | 0.85 | 1.10 | 1.35 | 1.65 | 1.95 |

#### Female Proportional Thresholds:
Derived from international powerlifting and strength databases (approximately ~65-72% of male absolute bodyweight multipliers).

#### Sub-Division Calculation:
Each major tier is segmented into 4 granular sub-divisions: `I, II, III, IV`:
$$\Delta = \frac{\text{Threshold}_{T+1} - \text{Threshold}_{T}}{4}$$
$$\text{Next Sub-Tier Target (kg)} = \text{Target Ratio} \times \text{EMA}_{BW}$$
Exact reps required at current working weight $W$:
$$\text{Reps Needed} = \left\lceil 30 \times \left(\frac{\text{Target E1RM}}{W} - 1\right) - \text{Target RIR}\right\rceil$$

---

## 2. Biometric Integration & Auto-Regulation

### 2.1 Daily Readiness Z-Score (Pixel Watch Telemetry)
Calculated against a 14-day rolling baseline:
$$Z_{\text{HRV}} = \frac{\text{HRV}_{\text{today}} - \mu_{\text{HRV}, 14d}}{\sigma_{\text{HRV}, 14d}}$$
$$Z_{\text{RHR}} = \frac{\text{RHR}_{\text{today}} - \mu_{\text{RHR}, 14d}}{\sigma_{\text{RHR}, 14d}}$$
$$\text{Readiness Score} = 0.50 \cdot Z_{\text{HRV}} - 0.30 \cdot Z_{\text{RHR}} + 0.20 \cdot \left(\frac{\text{Sleep}_{\text{hours}} - 7.5}{1.5}\right)$$

#### Readiness Classification:
- **Primed ($Z \ge +0.8$):** High parasympathetic tone. Boosts workout XP by $+15\%$. Green status.
- **Normal ($-0.8 < Z < +0.8$):** Standard baseline progression.
- **Amber Shield ($Z \le -0.8$, or HRV down $>15\%$, RHR $\ge +4\text{ bpm}$, Sleep $< 6\text{h}$):** Auto-regulation buffer triggered. Prescribes conservative RIR (2–3), holds external load, and guarantees streak/XP protection.

---

### 2.2 Double Progression Auto-Regulation Logic
For any target rep range (e.g., 8–12 reps):
1. **Top of Rep Range Achieved:** If all prescribed sets reach max reps (e.g., 12/12/12) at $1\text{–}2$ RIR:
   - Barbell exercises: Increment load by $+2.5\text{ kg}$.
   - Dumbbell exercises: Increment load by $+2.0\text{ kg}$.
   - Reset working target reps to lower boundary (e.g., 8 reps).
2. **Within Rep Range:** If working within rep range at $1\text{–}2$ RIR:
   - Hold weight constant.
   - Prescribe $+1$ rep on the first two working sets for next session.
3. **Amber Shield State Active:**
   - Override progression: Hold load and reps static.
   - Shift target RIR to $2\text{–}3$ to prevent central nervous system and joint burnout.

---

### 2.3 Work Capacity Index (WCI)
Measures cardiovascular efficiency and localized muscular stamina under load:
$$\text{WCI} = \frac{\text{Effective Tonnage} \times \text{Completed Sets}}{\text{Avg Session HRR}\% \times \text{Duration (min)}}$$
where:
- $\text{Effective Tonnage} = \sum (\text{Weight} \times \text{Reps})$
- $\text{Avg Session HRR}\% = \frac{\text{HR}_{\text{session}} - \text{HR}_{\text{rest}}}{\text{HR}_{\text{max}} - \text{HR}_{\text{rest}}}$

---

### 2.4 The 7th Pillar: Engine / Vitality
Combines cardiovascular fitness and metabolic output with strength:
$$\text{Vitality Score} = 0.40 \cdot \text{Score}_{\text{VO2Max}} + 0.30 \cdot \text{Score}_{\text{RHR}} + 0.30 \cdot \text{Score}_{\text{Steps}}$$
A high vitality score expands the lifter's 7-Pillar Radar profile.
(The previously documented `1.25x Metabolic Momentum` XP multiplier was never implemented and is not shown in the app.)

---

### 2.5 On-Device AI Coach (Gemini Nano via Chrome's Prompt API)
Implementation: `src/services/onDeviceModel.ts` + `src/services/aiAssistantService.ts`.
- Free-form questions are answered by Chrome's built-in Prompt API (`LanguageModel`) **only when the model is already `available`** on the device. On Pixel phones Chrome runs Gemini Nano through Android AICore on the Tensor chip; on desktop Chrome it runs locally too. Prompts and answers never leave the device.
- On Pixel phones with status `downloadable`, `prepareOnDeviceModel()` starts the one-time model download in the background from a user gesture. Other devices never auto-download.
- Otherwise the rule-based coach answers. Plan changes (equipment, travel, split, rest day) are always deterministic intents, never model output.
- The system prompt is compact (Nano has a small context window) and grounded in the athlete's workout, recovery and one matching knowledge-base fact.
- Open questions go to the model when it is available; explicit "why / how does / formula" questions get the knowledge-base card. Answers are rejected (and the rule-based coach answers) if they echo the prompt, which is what Chromium builds without Gemini Nano do.
- The model is warmed up when the coach opens (first load takes several seconds); a question asked meanwhile waits for that load instead of starting a second one.
- **Chrome on Android does not expose Gemini Nano to web apps** (verified on a Pixel 11 Pro XL, Chrome 155). There, the coach offers an opt-in download of Qwen2.5 1.5B Instruct (Apache-2.0) that runs on the phone's GPU through WebGPU (`src/services/gpuModel.ts`, WebLLM in a Web Worker). It is registered with `registerFallbackOnDeviceModel`, used only when Nano isn't available, never downloaded without a tap, kept out of the PWA pre-cache, and removable in Program → Data Backup & Privacy.
- Measured on that Pixel (Imagination GPU, f16): prefill ~30–37 tokens/s, decode ~7 tokens/s. Keep the system prompt short (`buildCoachSystemPrompt`, ~180 tokens) and stable for the whole chat; it is pre-read when the coach opens (`primeGpuModel`) and follow-ups continue the same conversation. Result: ~3 s to first words, 8–13 s per full answer.
- **Exercise overviews (Workout tab):** each exercise card's note is written by the same on-device model from facts in `buildExerciseNoteFacts` (history and estimated-max trend, last session, today's plan and tempo, recovery, the knowledge graph's weekly sets vs personal target for the muscle, joint load, program phase). `acceptExerciseNote` rejects any answer with a number not in the facts, a target claim the knowledge graph doesn't support, or AI talk; one retry, then the fact-based fallback (`fallback`, also personalised from the knowledge graph). Notes are generated one at a time, cached on the device by their facts, and never sent anywhere.
- The model only handles open coaching questions. Plan facts (briefing, targets, warm-ups, swaps), progress (`buildProgressSummary`), nutrition timing, equipment/travel changes and pain/safety are answered from the athlete's data or fixed text, because a small model misreads and invents numbers.
- No hardware names, latency figures or "accelerated" badges in the UI. The only user-facing statement is "Your chats stay on this phone".

The section below describes the original hardware-detection design; detection code remains in `src/engine/tensorAI.ts` but nothing in the UI depends on it.

1. **Hardware Detection & Identification:**
   - Detects device model via Client Hints (`Sec-CH-UA-Model`), User-Agent, and WebGL GPU vendor strings (`Mali-G720` for Tensor G4, `Mali-G715` for Tensor G3, `Mali-G710` for Tensor G2, `Mali-G78` for Tensor G1).
2. **Layered Acceleration Backends:**
   - **Tensor TPU (Chrome Built-in AI / Gemini Nano):** Probes `window.ai.languageModel` connecting via Android AICore directly to the Google Tensor TPU.
   - **Tensor NPU (WebNN):** Probes `navigator.ml` with NPU preference for neural recovery projections.
   - **Tensor GPU (WebGPU):** Probes `navigator.gpu` for Mali GPU compute shader acceleration.
   - **WASM SIMD Engine:** Zero-dependency, on-device local fallback ensuring 100% reliability across all devices.
3. **Core AI Capabilities Accelerated by Tensor:**
   - **On-Device Tensor AI Coach:** Contextual physiological analysis synthesizing Pixel Watch HRV, RHR, Sleep, and active mesocycle week into tactical rep tempo and mechanical tension cues.
   - **On-Device Conversational AI Assistant & Knowledge Graph Mutations:** Natural language assistant enabling athletes to adapt upcoming mesocycle schedules (e.g. work travel in week 5), register new equipment (e.g. pull-up bar), switch splits, and query joint strain and autonomic recovery telemetry. Directly mutates the Personal Knowledge Graph with zero cloud API costs.
   - **Tensor Biomechanical Neural Matcher:** Evaluates exercise substitution compatibility, joint torque, and stimulus-to-fatigue ratios.
   - **Privacy Invariant:** 100% on-device processing. Zero user biometric or health data ever leaves the phone.
   - **User Interface Invariant (Zero Technical Concept Leaks):** Local execution and acceleration must remain completely invisible to the user. The UI must never display "Knowledge Graph Grounding", "On-Device Local Engine", hardware chip names, or millisecond latency telemetry. All actions taken by the AI (such as registering equipment) must surface clear user outcomes with direct action buttons (e.g. "View All Equipment").
   - **AI Coach Single Entry Point Invariant (Mandatory Governance Rule):** The ONLY entry point to the AI Coach is the dedicated "AI Coach" tab in the primary bottom navigation bar. There are to be strictly **NO dedicated AI Coach cards** on the workout/training tab or any other screen, and strictly **NO AI Coach buttons, pills, sparkles, or icons in the application header**. All AI interactions are initiated solely via the bottom navigation bar.

---

## 3. Gamification & Goal Phase Adjustments

- **Lean Bulk:**
  - Volume Target: Progressive overload wave from MEV up to upper MAV across the mesocycle.
  - Bonus XP for tonnage milestones and PR breakthroughs.
- **Cut / Recomp:**
  - Activates **Retention Shield**: No XP penalty for holding strength steady at lower bodyweight; higher DOTS score rewarded as weight drops.
  - Volume Target: Scaled to ~85% of standard volume to account for reduced caloric recovery capacity.
- **Maingain:**
  - Density and WCI progression emphasized; bonus XP for improved recovery heart rate kinetics.

---

## 4. Authoritative Hypertrophy Volume Landmarks (Israetel & Schoenfeld Models)

A flat or blanket "10–20 sets per bodypart" contradicts exercise physiology. Different muscle groups exhibit radically divergent volume capacities and recovery kinetics based on:
1. **Fiber Type Composition:** High slow-twitch muscles (e.g., Soleus ~80–90% Type I) recover rapidly and withstand high volume/frequency, whereas fast-twitch dominant muscles (Hamstrings ~65–70% Type II) incur severe microtrauma and fatigue.
2. **Stretch-Mediated Microtrauma & Muscle Damage:** Exercises loaded under heavy eccentric stretch at long muscle lengths (Hamstrings in RDLs, Chest in deep flyes/presses) trigger extensive sarcomere disruption (Z-disc streaming). Excessive volume here produces counterproductive soreness and blunts protein synthesis.
3. **Axial & Central Nervous System (CNS) Fatigue:** Heavy compound movements (Back Squats, Deadlifts) tax spinal erectors and systemic recovery; performing 20+ weekly sets of these destroys systemic work capacity. In contrast, Lateral Delts and Calves generate near-zero axial or systemic strain.
4. **Compound Crossover (Direct vs. Indirect):** Anterior Deltoids and Triceps receive massive secondary stimulation from horizontal and vertical pressing, requiring minimal direct isolation. Conversely, Lateral Deltoids receive negligible chest press stimulus and demand high direct frequency (3–5x/wk) and volume.

### 4.1 Volume Landmark Definitions
- **Maintenance Volume (MV):** The minimum sets/week required to preserve existing muscular cross-sectional area.
- **Minimum Effective Volume (MEV):** The threshold sets/week required to initiate measurable muscular hypertrophy.
- **Maximum Adaptive Volume (MAV):** The optimal hypertrophy sweet spot where the highest rate of muscle growth occurs with manageable fatigue.
- **Maximum Recoverable Volume (MRV):** The upper boundary of volume from which the athlete can recover. Exceeding MRV results in functional overreaching, diminishing returns, and injury risk.

### 4.2 Comprehensive Muscle Volume Landmarks Table

| Muscle Group | MV (sets/wk) | MEV (sets/wk) | MAV Sweet Spot (sets/wk) | MRV (sets/wk) | Optimal Freq | Recovery Window | Primary Physiological Driver |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Lateral Delts** | 6 | 8 | **16–26** | 30+ | 3–5x/wk | 24h | Zero axial load; mixed fatigue-resistant fibers; no compound crossover. |
| **Calves (Gastroc/Soleus)** | 6 | 8 | **16–24** | 28+ | 3–5x/wk | 24h | Chronic ambulatory conditioning; Soleus ~80-90% Type I; needs paused stretch. |
| **Rear Delts** | 6 | 8 | **14–22** | 26+ | 3–4x/wk | 36h | Rapid recovery; minimal spinal strain; requires direct abduction/rotation. |
| **Back / Lats / Traps** | 8 | 10 | **14–22** | 25+ | 2–4x/wk | 48h | Massive musculature; high work capacity across vertical & horizontal planes. |
| **Chest (Pectorals)** | 4 | 8 | **12–18** | 20 | 1.5–3x/wk | 60h | High eccentric stretch damage; fast-twitch dominant; >18 sets causes joint/tendon strain. |
| **Quadriceps** | 4 | 6 | **12–18** | 20 | 1.5–3x/wk | 60h | Severe systemic & axial fatigue from squats; requires balance with leg extensions. |
| **Hamstrings** | 4 | 6 | **10–16** | 18 | 1.5–2.5x/wk | 72h | Extreme stretch damage in hip hinges; fast-twitch dominant; low volume tolerance. |
| **Triceps Brachii** | 4 | 6 | **10–16** | 18 | 2–3x/wk | 48h | Heavy compound crossover from pressing; high isolation volume risks tendonitis. |
| **Biceps / Brachialis** | 4 | 6 | **12–18** | 22 | 2–4x/wk | 36h | Fast recovery; small muscle group; benefits from varied shoulder abduction angles. |
| **Glutes** | 2 | 4 | **10–16** | 20 | 2–3x/wk | 48h | High crossover from deep squats/deadlifts; targeted thrusts/abductions recover fast. |
| **Front Delts** | 0 | 0 | **4–8** | 12 | 1–2x/wk | 48h | Massive compound pressing crossover; direct isolation rarely needed. |
| **Core / Abs** | 0 | 4 | **8–16** | 20 | 2–4x/wk | 36h | High endurance stabilizer; direct spinal flexion required for rectus hypertrophy. |

### 4.3 Mesocycle Volume Periodization Wave
Volume scales progressively across a 6-week training block to maximize progressive overload and prevent accommodation:
- **Week 1 (Base Intro):** Minimum Effective Volume (MEV) @ 2–3 RIR.
- **Week 2 (Accumulation I):** Early MAV @ 2 RIR (+2.5kg load / +1 rep).
- **Week 3 (Hypertrophy Core):** Mid MAV @ 1–2 RIR (Peak effective reps).
- **Week 4 (Volume Accretion):** Upper MAV @ 1 RIR (High localized mechanical tension).
- **Week 5 (Peak Strain):** Near MRV @ 0–1 RIR (Functional overreaching).
- **Week 6 (Planned Deload):** Maintenance Volume (MV) @ 3–4 RIR (Dissipate systemic fatigue & reset CNS sensitivity).

### 4.4 Caloric Deficit Muscle Retention & Volume Scaling (Helms et al., 2014; Murphy & Koehler, 2022)
- **Physiological Reality:** In a caloric deficit, muscle protein synthesis (MPS) is reduced, glycogen stores deplete faster, and systemic recovery capacity decreases by 15–20%.
- **Retention vs. Accretion Stimulus:** Preserving lean tissue during a cut does NOT require high volume (MRV), which causes excess cortisol elevation, muscle protein breakdown, and joint strain. Instead, it requires **high mechanical tension** (heavy loads, 1–2 RIR) to signal the body that muscle mass is vital for survival.
- **Volume Scaling Invariant:** Volume is capped at ~85% of standard training volume (2–3 working sets per exercise instead of 4–5).
- **Retention Shield in Double Progression:** When holding load and reps in `Cut / Recomp`, Treise displays explicit **Retention Shield** feedback celebrating lean tissue preservation. As body mass drops, holding absolute strength increases relative strength and official DOTS score.

### 4.5 Multi-Program Split Rotations & Asynchronous Queue Invariants
Treise offers 5 program structures (the 4 splits below plus the 24-workout **6-Week Muscle Building Plan**, `muscle_building_6wk`, whose next workout is the one after the last completed plan workout), each adhering to the Asynchronous Hypertrophy Queue:
1. **Push / Pull / Legs + Upper (`ppl_upper` - 4-Day):** Optimal balance of hypertrophy frequency and volume. Day rotation: `Push` → `Pull` → `Legs` → `Upper`.
2. **Push / Pull / Legs (`ppl` - 3-Day Classic):** High-efficiency classic split. Day rotation: `Push` → `Pull` → `Legs`.
3. **Upper / Lower (`upper_lower` - 4-Day Power & Mass):** Heavy compound focus. Day rotation: `Upper` → `Legs`.
4. **Full Body (`full_body` - 3-Day High Frequency):** High systemic stimulus distributed across the week. Day rotation: `Push` → `Pull` → `Legs` movement emphasis.
- **Asynchronous Queue Invariant:** `getNextSplitDay` dynamically advances to the next valid session based on `profile.programType`. If a lifter skips a day, the next queued session simply waits with full glycogen and CNS recovery.

---

## 5. Codified Product Design Heuristics Framework (Mandatory Governance Gate)

Every UI component, layout, copy change, and new flow MUST be designed and evaluated against these 19 heuristics before shipping:

### 5.1 Visual Design Heuristics (6 Principles)
1. **Hierarchy:**
   - **Layout:** Focus each screen on **one element or primary section as the focal point** while clearly de-emphasizing any secondary elements or sections. Never show competing session tabs (`1. Push`, `2. Pull`, `3. Legs`, `4. Upper`) as primary navigation inside an active workout.
   - **Type:** Use typography styles in accordance with standards while emphasizing the most significant text. Strict `text-xs` (`12px`) minimum floor — never sub-12px micro-text.
   - **Color:** Use color tokens (`brand-primary`, emerald, amber, neutral slate) for text, tags, buttons, and statuses to differentiate elements, primary/secondary actions, add emphasis, and organize information.
   - **Visual Assets:** Use icons, pictograms, or illustrations only to focus users on the most important content with uniform optical stroke weight (`stroke-[2]`).
2. **Alignment:**
   - **Layout:** Use a strict responsive grid and create relationships between elements to align with each other in a balanced way.
   - **Type:** Align text accurately and consistently.
   - **Color:** Create consistent alignment and balance across surfaces.
   - **Visual Assets:** All icons, pictograms, and illustrations use the same optical stroke weight (`stroke-[2]`).
3. **Consistency:**
   - **Layout:** Place elements in a predictable and repeatable way across all screens.
   - **Type:** Use typography styles consistently for all types of content (such as headlines and subtitles).
   - **Color:** Consistently use color tokens for differentiation across the experience.
   - **Visual Assets:** Consistently scale and place icons in relation to the content they represent.
4. **Contrast:**
   - **Layout:** Create a dynamic layout using differentiation to lead users to complete their tasks with clarity and visual interest.
   - **Type:** Typography styles create emphasis and differentiation to guide users to the most important content and actions.
   - **Color:** Clearly differentiate between what's active/actionable versus what's inactive/passive.
   - **Visual Assets:** Icons and illustrations create distinction that helps users understand content.
5. **Simplicity:**
   - **Layout:** Preserve negative space to create an open/clean experience instead of clutter or mess.
   - **Type:** Use type in **no more than 2–3 styles, weights, and sizes per card**, only making shifts to emphasize hierarchy.
   - **Color:** Use color consistently and only when needed to emphasize action, status, or reporting.
   - **Visual Assets:** Use icons only to enhance information or create necessary connections with other content.
6. **Delight:**
   - **Layout:** Placement and organization make the experience effortless to understand and use.
   - **Type:** Typography brings joy, satisfaction, or a sense of completion.
   - **Color:** Joyful, motivating, and helpful color interactions (e.g. emerald checkmarks on set completion).
   - **Visual Assets:** Visual assets enhance content to bring joy, positive surprise, or satisfaction when stakes are low.

### 5.2 Content Design Heuristics (6 Principles)
1. **Clarity (Be Clear Instead of Clever & Zero Technical Concepts in UI):**
   - Give customers all the information they need to make good decisions quickly and with confidence.
   - **MANDATORY RULE — NEVER MENTION TECHNICAL CONCEPTS IN THE UI:** The user does not need to know about knowledge graphs, on-device local engines, inference latency, hardware chips (TPU/NPU), canonical vectors, or other engineering details. Machine learning, on-device computation, and knowledge graph grounding must operate completely invisibly in the background. The user interface must speak exclusively to athlete goals, workout progression, and physical recovery.
   - **Actionable User Outcomes Instead of Technical Badges:** When an action occurs (such as adding new equipment like a pull-up bar via the AI Coach or settings), never display technical citation chips (e.g. "Knowledge Graph Grounding") or latency stamps ("5ms • Local Engine"). Instead, provide an immediate, clear Call-to-Action (CTA) button in the "Plan Updated" banner (e.g. `"View All Equipment"`) so the athlete can directly review and manage their equipment setup in 1 tap.
   - Use plain, simple language without complex words, jargon, slang, metaphors, or cultural references. NEVER expose internal UX, engineering, or academic method names (`OOUX`, `PKG`, `Knowledge Graph Grounding`, `On-Device Local Engine`, `Canonical Vector`, `SFR`, `MAV/MEV/MRV`) in user-facing UI.
   - Refer to new features or concepts without introducing confusing new names.
   - Write headings so the meaning of each screen can be quickly understood just by scanning.
   - Make the primary call-to-action compelling for the immediate task and show it on the first screen.
   - Make help resources available with progressive disclosure.
2. **Consistency:**
   - Use terms that align across the entire product (`Workout`, `Program`, `Progress`, `Athlete`).
   - Use shared, standardized terminology for all product concepts.
   - Align memory, terms, and voice across app surfaces, settings, and documentation.
   - Use clear, reusable snippets for recurring UI patterns.
3. **Structure:**
   - Thoughtful information architecture makes the complex clear.
   - Prioritize the most important content so it appears at the top of all screens and the beginning of sentences: immediately answer *(1) What am I training next?* and *(2) What do I need to do to make progress?*
   - Make the path to task completion easy and fast, even when customers aren't on the happy path (skipping a day, training at home with dumbbells/TRX/pull-up bar, or travelling with bodyweight).
   - Navigation, tabs, panels, and headings tell a meaningful story with a clear sequence.
   - Clearly label and link next steps, help resources, and ways to cancel or exit.
4. **Product Voice (Clear, Helpful, Human, Kind):**
   - **Clear:** Helps customers complete tasks quickly and well.
   - **Helpful:** Gives customers the right level of information at the right time, guiding them to the best possible outcome.
   - **Human:** Customer-focused, warm, natural, and conversational without being loud or overbearing.
   - **Kind:** Makes all customers feel welcome, respected, and appreciated.
5. **Product Tones:**
   - **Friendly:** Onboarding, welcome messages, sign up, support, and conversational introductions.
   - **Direct:** Standardized create, edit, and management flows, tooltips, forms, settings, and error messages.
   - **Motivating:** Coaching, tips, tour completions, set/goal completions, and sharing progress milestones.
   - **Opinionated:** Recommending the single best next workout or program split rather than forcing the user to pick from a confusing list.
   - **Urgent:** Highlighting joint strain alerts, critical notifications, and auto-regulation recovery buffers.
6. **Accessibility & Inclusivity:**
   - **Perceivable:** Text alternatives for all non-text content (icons, charts, illustrations).
   - **Operable:** All interactive content controllable via touch, keyboard, and assistive technology.
   - **Understandable:** Content written so a secondary school student can understand it.
   - **Robust:** Compatible with screen readers and assistive tech in the intended order.
   - **Inclusive:** Welcoming for all audiences, culturally unbiased, and fully WCAG AA compliant.

### 5.3 Interaction Design Heuristics (7 Principles)
1. **Predictable & Efficient:**
   - Simple structure with a clear conceptual model and no unnecessary hierarchy levels.
   - Navigation options relevant in the moment; clear wayfinding.
   - High confidence in what will happen next upon user selection.
   - Users quickly find what they need to make progress in 1 tap.
   - Smart defaults in place to streamline user actions.
   - Purposeful motion instead of purely decorative animations.
2. **Communicative:**
   - Immediate visual and haptic feedback for every user interaction.
   - Unambiguous feedback from interface elements.
   - Communicates progress for multi-step tasks (e.g. `Step 1 of 4` progress bars).
   - State changes visually referential to prevent confusion (saved, unsaved, offline).
   - Clear empty states, focus states, and disabled states.
3. **Performant:**
   - Fast load times and zero-latency local-first interactions.
   - Interface reacts promptly without calculation lag.
4. **Guided:**
   - Guardrails proactively prevent mistakes (e.g. 1-tap Undo for set deletion, automatic weight conversion when switching equipment).
   - Obvious where to click first on every screen.
   - Clear error identification and fast inline resolution without leaving the flow of work.
5. **Approachable, Accessible & Inclusive:**
   - Users get started effortlessly without needing external instructions.
   - Progressive disclosure keeps secondary controls tucked behind clean drawers so newcomers are never overwhelmed.
   - Minimum `>=44px` touch targets, high contrast, and full WCAG AA compliance.
6. **Cohesive:**
   - Free of conflicts in design patterns and behaviors across user journeys.
   - Components, buttons, links, and toggles behave identically in similar contexts across all tabs.
   - Exactly 1 canonical entry point per user job (1 method for switching equipment, 1 for changing an exercise).
7. **Delightful:**
   - **Behavioral Joy:** First-time-to-value: immediately upon completing onboarding or opening the app, the user sees their tailored workout ready to log.
   - **Natural Joy:** Content and recommendations feel specifically created for the athlete and their recovery state.
   - **Visceral Joy:** Aesthetic athletic interface with purposeful dark-mode contrast.
   - **Moment of Joy:** Celebrates PR breakthroughs and workout completions appropriately without patronizing.
   - **Reflective Joy:** A clean moment of accomplishment and streak milestone after completing a workout.

---

## 6. Asynchronous Hypertrophy Queue (Recovery-Driven, Not Calendar-Bound)

- **No Rigid Calendar Days:** Muscle tissue responds to mechanical tension and local recovery windows (`24h–72h`), not days of the week.
- **Skipping a Day Has Zero Penalty:** The 4-session rotation (`Push` → `Pull` → `Legs` → `Upper`) operates as an **Asynchronous Hypertrophy Queue**. If a user skips a day (due to work, travel, or sleep), the next queued session simply waits for them with full glycogen and CNS recovery—never show confusing "missed calendar day" states or competing day tabs.
- **Recovery gate (implemented in `src/engine/recovery.ts`):** each completed session stimulates its exercises' primary muscles fully and secondary muscles at half weight; windows come from §4.2 and scale with hard sets. The queued session is ready when every target muscle reaches 90% of its window, and never before 6 AM the day after a workout. Until then the Workout tab shows a rest card with per-muscle ready times.
- **Single Opinionated Recommendation:** The Workout screen presents **one clear "Up Next" session** with its muscle recovery status (e.g., *"Chest, Shoulders & Triceps • 100% Recovered"*), while keeping manual split/location overrides tucked neatly inside a progressive-disclosure menu (`Switch Location or Split ▾`).

---

## 7. Onboarding & First-Time-to-Value Specification (Mandatory Flow)

New users must be guided along the **quickest path to value** in under 60 seconds:
1. **Step 1: Welcome & How Treise Works (Introduction)**
   - Welcomes the athlete with a friendly, motivating, and clear product voice.
   - **What Treise Does for You:** Explains that the app automatically tracks your weights, sets, reps, tempo, and rest intervals, and handles all weekly progressive overload planning (+1 rep or +2.5 kg). It completely replaces the tedious, error-prone manual paper training diary—the athlete just needs to show up and lift.
   - **How to Measure Real Progress:** Explains morning weigh-ins on the same scale under consistent conditions, taking body circumference measurements (waist, chest, arms), and the physiological reality of **body recomposition** (since muscle is ~18% denser than fat, the scale may stay flat or move slowly while fat is burned and muscle built, yet you look radically different with your shirt off; smoothed via a 7-day rolling average).
   - **Friction-Free Smart Devices:** Explains automated ingestion from Bluetooth smart scales, digital measuring devices, and wearable telemetry (Google Pixel Watch, Fitbit, Whoop, Android Health Connect) to remove manual data-entry fatigue.
   - **Life-Proof Schedule & Anywhere Gear:** Explains the Asynchronous Hypertrophy Queue (train when muscles recover with zero missed-day guilt) and multi-location adaptability across Full Gym, Home Gear, and Travel Bodyweight.
   - Provides a clear primary CTA (`Choose My Goal`) and a subtle exit (`Skip to Demo`).
2. **Step 2: Primary Goal & Phase (Goal Selection)**
   - Anchors the athlete's motivation and intent first. Calibrates volume landmarks and rules for `Lean Bulk`, `Cut / Recomp` (with Retention Shield), or `Maingain`.
   - Provides a clear primary CTA (`Continue to Split`).
3. **Step 3: Choose Training Split (Program Type)**
   - Presents the 4 evidence-based hypertrophy splits calibrated to their selected goal:
     - `Push / Pull / Legs + Upper (4-Day)` *(Recommended for Hypertrophy)*
     - `Push / Pull / Legs (3-Day Classic)`
     - `Upper / Lower (4-Day Power & Mass)`
     - `Full Body (3-Day High Frequency)`
   - Clearly displays session rotation, weekly frequency, and Day 1 starter workout.
   - Provides a clear primary CTA (`Set Up Equipment`).
4. **Step 4: Training Locations & Available Equipment**
   - Configures places (`Full Gym`, `At Home`, `Travel`), home gear (`Bench`, `Dumbbells`, `TRX`, `Pull-Up Bar`, `Bands`), and today's location.
5. **First-Time-to-Value Delivery:**
   - Instantly generates the calibrated Day 1 workout and directs the athlete straight to the Workout tab with Exercise #1, target weight, and reps ready to train in 1 tap.

---

## 8. Authoritative Information Architecture & Interaction Design Master Template (Locked Invariant)

All future sessions, developers, and AI agents must strictly adhere to the structure defined in `PRODUCT_REQUIREMENTS_SPEC.md` and `INTERACTION_DESIGN_MASTER_TEMPLATE.md`. **Do not iterate on, rearrange, or redesign what has been agreed as complete and final.**

### 8.1 4-Page Information Architecture & Canonical Focal Points
1. **Workout Tab (`TrainTab.tsx`):** built from the Figma design (1344 px frame; every size is `calc(<figma px> * var(--f))`, see `.wk` in `src/index.css`; --f is 0.5 on a 448 px phone so text and controls match Whoop-like sizes: 13 px body, 37 px inputs). Inter font, page gradient #283339 → #13181C, cards #2C3034 with radius 30 / padding 38, accent #00F19F.
   - *Header:* program name, "⋯" menu (location, log rest day, last workout), and a 7-day strip (2 days back, today, 4 ahead): tick = trained, ring = today, filled = next sessions expected from recovery (`buildWeekStrip`).
   - *Program card:* phase (or mesocycle week), plain-English phase name, "Today/Next: <session>", "n/24" and progress bar; opens the Program tab.
   - *Recovery card:* wearable score ring, provider tag, what today's plan does; opens watch sync.
   - *Exercise cards:* name + swap button, order chip (A1), progress summary + best-set estimated max per session chart (`buildExerciseInsight`; labelled "Example" until 2 sessions), SET/PREV/WEIGHT/REPS/RIR/✓ table; tempo, warm-ups, plates and add/remove set behind the chevron.
   - *After today's session:* the session-complete card leads instead of the Program and recovery cards.
2. **Program Tab (`ProgramTab.tsx`):**
   - *Focal Point:* Training Locations & Equipment Summary Card with single `[Edit Equipment]` trigger.
   - *Goal Phase Switcher:* Build Muscle, Lose Fat, Stay Lean.
   - *6-Week Mesocycle:* Week 1 to 6 periodization with 1-tap Deload trigger.
   - *Split Editor:* Routine preview, `[+ Custom Exercise]`, and `[Start This Workout]` triggers.
   - *Profile & Data Drawers:* Collapsible accordions for Athlete Profile, Data Backup (export/restore/erase), and Product Governance Matrix.
3. **Progress Tab (`AnalyticsTab.tsx`):**
   - *Focal Point:* 2-Way Segmented Switcher (`Strength & Stamina` vs. `Recovery, Joints & Steps`).
   - *View A (Strength & Stamina):* E1RM vs Bodyweight Chart (with `[Log Today's Weight]`) + Work Capacity Index (WCI) Chart.
   - *View B (Recovery, Joints & Steps):* Joint Health & Recovery Insights Knowledge Graph + Daily Steps & Active Minutes Tracker.
4. **Athlete Tab (`CharacterTab.tsx`):**
   - *Focal Point:* Athlete Scorecard (Avatar, Level, 7-day EMA weight, DOTS score, Big 3 total).
   - *Sub-View Switcher:* `Weekly Muscle Sets` vs. `Strength Balance & Bonuses`.
   - *Sub-View A:* Israetel/Schoenfeld Hypertrophy Volume Landmarks horizontal bar gauges across 12 muscles.
   - *Sub-View B:* 7-Pillar Strength Balance Radar + Active Bonuses (Streak Safe & 1.25x Active Bonus).

---

## 9. Google Pixel Tensor Hardware Acceleration & On-Device AI Architecture

When running on Google Pixel hardware (Pixel 6, 7, 8, 9, Fold), Treise routes AI inference through on-device Google Tensor silicon:
1. **Model Identification:** Client Hints (`Sec-CH-UA-Model`), User-Agent, and WebGL GPU string (`Mali-G720` -> Tensor G4; `Mali-G715` -> Tensor G3; `Mali-G710` -> Tensor G2; `Mali-G78` -> Tensor G1).
2. **Acceleration Backends:**
   - **Tensor TPU (Gemini Nano):** Connects via `window.ai.languageModel` for tactical coaching cues and tempo adaptations.
   - **Tensor NPU (WebNN):** Probes `navigator.ml` for neural fatigue projections.
   - **Tensor GPU (WebGPU):** Probes `navigator.gpu` for Mali compute shaders.
   - **WASM SIMD Fallback:** High-performance local engine on non-Pixel devices.
3. **Invariants:**
   - AI Coach prompts and answers stay on the device.
   - Wearable data is fetched through Treise's Vercel functions (`api/`), which do not store it. Workout history is stored only on the device.

---

## 10. Clean Slate for New Users, Authoritative XP Economy & Opt-In Leaderboard

### 10.1 Zero Dummy Data Exposure Invariant
- **First-Time Visitors:** Fresh installs start with `NEW_USER_PROFILE`: Level 1, 0 XP, 0 streak, 'Athlete', fresh starter workout, and clean empty arrays `[]` for biometrics and completed workouts.
- **Preview & Demo Mode:** Sample 6-week demonstration data (`SAMPLE_DEMO_PROFILE`, 42 days biometrics, 24 workouts for Alex Vance) is available strictly on explicit opt-in via "Load Sample Demo History" or the Onboarding "Explore Demo Mode" trigger.

### 10.2 Authoritative XP Economy Invariant
XP is a measure of genuine athletic progression and consistency:
- **Legitimate XP Award Triggers:**
  - **Full Workout Completion:** Base 250 XP + 50 XP all-working-sets completed bonus (+15% Primed multiplier).
  - **Program Milestones:** +200 XP for mesocycle week completion; +500 XP for 6-week cycle graduation.
  - **Progressive Overload PRs:** Evaluated per set against historical exercise bests: +60 XP for load increases (>=+2.5kg BB / >=+2kg DB); +40 XP for rep increases at equal/higher load; +50 XP for reaching the top of the rep range (unlocking double progression). Ordinary non-PR sets award 0 XP.
  - **Strength Standards Gains:** +100 XP for international sub-division rank-ups (I -> II -> III -> IV); +350 XP for major tier breakthroughs (Novice -> Intermediate -> Advanced -> Elite). A lift's first-ever log is its starting point and earns no rank-up XP.
  - Each set earns progress XP at most once, even if it is unticked and ticked again.
- **Strictly Prohibited XP Actions:**
  - Zero XP is awarded for: switching exercises, switching split days, switching training locations, changing mesocycle weeks via slider, shifting workout dates, changing goal phases, exporting/importing JSON backups, syncing Pixel Watch, completing onboarding, loading demo data, or logging bodyweight.

### 10.3 XP Divisions (community leaderboard not built yet)
- There is no backend, so the app shows only the athlete's own division and progress. It must never show other athletes or say anything is shared. A real leaderboard needs a server with verified XP before it returns.
- **6 Divisions:** `Elite` (5,000+ XP), `Diamond` (3,500–4,999 XP), `Platinum` (2,500–3,499 XP), `Gold` (1,500–2,499 XP), `Silver` (750–1,499 XP), and `Bronze` (0–749 XP).
- **Navigation Placement:** Third segment in the Athlete tab subview switcher (`Weekly Sets | Strength Radar | XP Division`).

---

## 11. Authoritative Exercise Science Knowledge Base & Zero-Hallucination AI Grounding

To eliminate all model hallucinations, ungrounded approximations, and conflicting advice across sessions, Treise codifies all mathematical models and physiological rationale directly within the On-Device Knowledge Graph (`src/engine/knowledgeGraph.ts`):

### 11.1 The 21 Authoritative Scientific Principles
1. **E1RM Formula & RIR Adjustment (`sp-e1rm-epley-rir`):** Augmented Epley/Lombardi model with Reps in Reserve.
2. **Dumbbell Bilateral Stabilization Multiplier (`sp-db-multiplier`):** $1.18\times$ combined DB load multiplier for stabilizer fatigue and bilateral deficit (Saeterbakken et al., 2011; approximation).
3. **Romanian Deadlift Conventional Normalization (`sp-rdl-multiplier`):** $1.20\times$ RDL load normalization to conventional deadlift standard.
4. **Weighted Calisthenics Total Gravitational Mass (`sp-weighted-calisthenics-total-load`):** Total Mass = $\text{EMA}_{BW} + \text{External Load}$.
5. **7-Day Exponential Moving Average Bodyweight (`sp-ema-bodyweight`):** Smoothing daily glycogen/water shifts ($0.25 \times \text{Today} + 0.75 \times \text{Yesterday}$).
6. **Official IPF DOTS Strength Polynomial (`sp-dots-polynomial`):** 4th-degree polynomial normalizing relative strength across bodyweights.
7. **6-Pillar International Relative Strength Standards (`sp-6-pillar-standards`):** Squat, Hinge, Horizontal Push, Vertical Push, Horizontal Pull, Vertical Pull standards.
8. **Autonomic Readiness Z-Score Auto-Regulation (`sp-autonomic-readiness`):** 14-day rolling baseline HRV, RHR, and sleep score driving Amber Shield / Primed states.
9. **Double Progression Auto-Regulation Logic (`sp-double-progression`):** Top-of-rep-range load step (+2.5kg BB, +2.0kg DB) vs. within-range rep accretion.
10. **Israetel & Schoenfeld Muscle-Specific Hypertrophy Volume Landmarks (`sp-volume-landmarks`):** Divergent MV/MEV/MAV/MRV based on fiber type and eccentric stretch.
11. **Caloric Deficit Muscle Retention & Volume Scaling (`sp-retention-shield-deficit`):** High mechanical tension with volume capped at ~85% (2–3 sets) and Retention Shield.
12. **Pure Bodyweight & Travel Hypertrophy Overload (`sp-travel-bodyweight-hypertrophy`):** Strictly 0kg external load progressed via tempo, paused eccentrics, and reps.
13. **Inter-Set Rest Intervals for Hypertrophy & Tonnage (`sp-rest-intervals`):** 2–3+ minute rest intervals for compound lifts vs 60–90s for low-axial isolations.
14. **Stretch-Mediated Hypertrophy & Sarcomerogenesis (`sp-stretch-mediated-hypertrophy`):** Mechanical tension at long muscle lengths driving passive titin stiffness.
15. **6-Week Mesocycle Volume Periodization Wave (`sp-mesocycle-periodization`):** MEV $\to$ MAV $\to$ MRV progression wave terminating in deload.
16. **Asynchronous Hypertrophy Queue & Glycogen Preservation (`sp-asynchronous-queue`):** Dynamic session advancement waiting with full recovery on skipped days.
17. **Work Capacity Index (WCI) & Cardiovascular Efficiency (`sp-work-capacity-index`):** Effective tonnage per unit of heart rate reserve over session duration.
18. **Google Pixel Tensor On-Device AI Acceleration (`sp-tensor-ai-acceleration`):** Local TPU/NPU/GPU inference preserving zero-latency privacy.
19. **Automated Progressive Overload vs. Traditional Paper Training Diary (`sp-progress-tracking-diary`):** Automated tracking of weights, sets, reps, tempo, and rest; calculates weekly double progression (+1 rep or +2.5kg load) so lifters never have to guess or keep manual notebooks; they just show up and lift.
20. **Morning Weigh-Ins, Circumference Measurements & Body Recomposition (`sp-scale-weight-measurements`):** Muscle tissue density (~1.06 g/mL vs ~0.90 g/mL) explains scale neutrality during concurrent fat loss and muscle gain; paired with waist/chest/arm measurements and 7-day EMA smoothing ("look radically different with shirt off").
21. **Friction-Free Telemetry & Smart Device Integration (`sp-smart-device-integration`):** Automated ingestion from Bluetooth smart scales, digital measuring tapes, and wearable APIs (Google Pixel Watch, Fitbit, Whoop, Android Health Connect) to eliminate data-entry cognitive friction and tracking abandonment.

### 11.2 Invariants for AI Chat and App UI
- **Zero Hallucination Invariant:** All scientific inquiries in the on-device AI Coach are resolved via `queryExerciseScienceKnowledgeBase`, returning exact mathematical formulas, physiological rationale, and academic citations.
- **Searchable UI:** The Progress tab provides an interactive "Science & Logic" browser in `KnowledgeGraphCard.tsx` with a search bar and expandable cards.
- **Visual Compliance:** Strictly adheres to the $\ge 12\text{px}$ typography floor and $\ge 44\text{px}$ touch targets.




