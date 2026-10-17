# HeadStrong Architecture & Exercise Science Formulas

This document outlines the core mathematical models, exercise science principles, and biometric integration formulas implemented in **HeadStrong**, a mobile-first Progressive Web App (PWA) designed for gamified hypertrophy workout tracking, international strength standards, and Google Pixel Watch (Fitbit Web API) telemetry.

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
Active Zone Minutes (AZM) $\ge 30$ and Daily Steps $\ge 8{,}500$ unlock the `1.25x Metabolic Momentum` XP multiplier.

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

---

## 5. Codified Product Design Heuristics Framework (Mandatory Governance Gate)

Every UI component, layout, and copy change MUST be designed and evaluated against these 19 heuristics before shipping:

### 5.1 Visual Design Heuristics
1. **Hierarchy:** Focus each screen on **one primary element or focal point** while clearly de-emphasizing secondary controls. Never show competing session tabs (`1. Push`, `2. Pull`, `3. Legs`, `4. Upper`) as primary navigation inside an active workout.
2. **Alignment:** Use a strict grid, consistent text alignment, and uniform icon stroke weight (`stroke-[2]`).
3. **Consistency:** Place elements in predictable, repeatable positions across all screens using semantic color tokens (`brand-primary` for primary action/progress, `amber` for recovery warnings, neutral slate for passive states).
4. **Contrast:** Clearly differentiate active/actionable elements from passive metadata.
5. **Simplicity:** Preserve negative space; use **no more than 2–3 type styles, weights, and sizes per card** (`text-xs` / `12px` minimum floor — never sub-12px micro-text); never render unlabeled visual bars or mystery steppers without explicit context.
6. **Delight:** Deliver low-stakes satisfaction on set completion, PR breakthroughs, and workout completion without obstructing the logging flow.

### 5.2 Content Design Heuristics
1. **Clarity (Be Clear Instead of Clever):** Use plain, straightforward consumer language. **Never expose internal UX, engineering, or academic method names** (`OOUX`, `PKG`, `Canonical Vector`, `SFR`, `MAV/MEV/MRV`) in user-facing UI. Use progressive disclosure for secondary options.
2. **Consistency:** Use consistent terminology across all 4 tabs (`Workout`, `Program`, `Progress`, `Athlete`).
3. **Structure:** Place the most important information at the top of the screen: immediately answer *(1) What am I training next?* and *(2) What do I need to do to make progress?* Support non-happy-path realities (skipping a day, training at home with dumbbells/TRX/pull-up bar, or travelling with bodyweight).
4. **Product Voice:** Clear, Helpful, Human, and Kind.
5. **Product Tones:** Friendly (onboarding), Direct (settings/modals), Motivating (set logging/completion), **Opinionated** (recommend the single best next workout rather than forcing the user to pick from tabs), Urgent (joint strain or recovery alerts).
6. **Accessibility & Inclusivity:** Secondary-school reading clarity, high contrast, screen-reader labels, and full WCAG AA compliance.

### 5.3 Interaction Design Heuristics
1. **Predictable & Efficient:** Streamline actions with smart defaults so the user can immediately see what they need to do to make progress and log sets in 1 tap.
2. **Communicative:** Provide immediate visual feedback and clear progress (`completedSets / totalSets`), never ambiguous unlabeled bars.
3. **Performant:** Zero-latency local-first interactions.
4. **Guided:** Guide users along a single clear happy path with safe guardrails (e.g., 1-tap Undo for set deletion, automatic weight conversion when switching equipment).
5. **Approachable, Accessible & Inclusive:** Progressive disclosure keeps secondary controls (switching location, changing split, viewing past history) tucked behind a single clean drawer so new and returning users are never overwhelmed.
6. **Cohesive:** Unified patterns across all 4 tabs.
7. **Delightful:** Tailored session-to-session coaching that adapts to the user's actual recovery and available gear.

---

## 6. Asynchronous Hypertrophy Queue (Recovery-Driven, Not Calendar-Bound)

- **No Rigid Calendar Days:** Muscle tissue responds to mechanical tension and local recovery windows (`24h–72h`), not days of the week.
- **Skipping a Day Has Zero Penalty:** The 4-session rotation (`Push` → `Pull` → `Legs` → `Upper`) operates as an **Asynchronous Hypertrophy Queue**. If a user skips a day (due to work, travel, or sleep), the next queued session simply waits for them with full glycogen and CNS recovery—never show confusing "missed calendar day" states or competing day tabs.
- **Single Opinionated Recommendation:** The Workout screen presents **one clear "Up Next" session** with its muscle recovery status (e.g., *"Chest, Shoulders & Triceps • 100% Recovered"*), while keeping manual split/location overrides tucked neatly inside a progressive-disclosure menu (`Switch Location or Split ▾`).

