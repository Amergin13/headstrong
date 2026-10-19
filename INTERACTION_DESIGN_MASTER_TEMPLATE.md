# HeadStrong Interaction Design Master Template & Information Architecture

**Status:** Locked & Final 🔒  
**Version:** 1.0.0 (Production Canonical)  
**Governance Scope:** Entire Product Experience & Cross-Session AI Guardrails  
**Mandate:** Authoritative Master Template defining the Information Architecture (IA) of each page, and each section of each page. All future sessions, contributors, and AI agents must strictly adhere to this structure and are **strictly forbidden from iterating on, rearranging, or regressing what is agreed as complete and final**.

---

## 1. Interaction Design Foundations & Governance Gate

Every screen, card, modal, and control in HeadStrong is governed by three non-negotiable foundations codified from the 19 Product Design Heuristics:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 HEADSTRONG INTERACTION DESIGN GOVERNANCE GATE               │
├────────────────────────────────┬────────────────────────────────────────────┤
│ 1. SINGLE CANONICAL ENTRY POINT│ Exactly 1 interactive path per user job.   │
│    PER JOB                     │ Never duplicate controls across tabs.      │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 2. 12px MINIMUM TEXT FLOOR     │ Strict text-xs (12px) minimum.             │
│    & 2–3 STYLES PER CARD       │ Zero sub-12px micro-text anywhere.         │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 3. >= 44px TOUCH TARGETS       │ All buttons, icon triggers, and rows have  │
│    WITH PURPOSEFUL HAPTICS     │ >=44px touch targets and physical feedback.│
├────────────────────────────────┼────────────────────────────────────────────┤
│ 4. SINGLE FOCAL POINT PER PAGE │ One primary section leads each view.       │
│    & 2-WAY VIEW SEGMENTATION   │ Multi-view toggles prevent vertical bloat. │
└────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 2. Global Application Chrome Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [HS] HEADSTRONG  Lv.4 [━━━━━━━░░░░] 250/500 XP    🔥 14d   [⌚ Watch 🟢]  │ <- Top Header
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│                            ACTIVE TAB CONTENT                             │
│       (Workout [train] | Program [program] | Progress [analytics] |       │
│                             Athlete [character])                          │
│                                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│   🏋️ Workout       📅 Program          📈 Progress         🛡️ Athlete     │ <- Bottom Nav
└───────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Sticky Top Header (`Header.tsx`)
- **Visual Hierarchy:** Sticky top `z-30`, surface-glass backdrop blur (`bg-surface-bg/90`), height $52\text{px}$.
- **Section Order (Left-to-Right):**
  1. *Brand Monogram:* `w-8 h-8 rounded-xl` Obsidian container with white `"HS"` mark.
  2. *Athlete Identity & Level:* Headline `HEADSTRONG`, badge `Lv.{level}`, and miniature XP progress bar ($500\text{ XP}$ per level).
  3. *Streak Protection Badge:* Flame icon with `{streakDays}d` counter in amber pill.
  4. *Single Canonical Watch Sync Trigger:* `w-auto px-2.5 py-1` pill with watch icon, status text, and live pulsating readiness dot (Emerald = Primed, Amber = Recovery Shield, Cyan = Normal).
- **Forbidden Iterations:**
  - ❌ NEVER add data reset, settings cog, or navigation links to the header.
  - ❌ NEVER display multiple wearable badges or raw HRV milliseconds in the header.

### 2.2 Persistent Bottom Navigation Bar (`NavigationBar.tsx`)
- **Visual Hierarchy:** Fixed bottom `z-40`, surface-glass backdrop blur, height $64\text{px} + \text{safe-area-inset-bottom}$.
- **Grid Layout:** Strict 4-column balanced grid (`grid-cols-4`).
  1. `train` &rarr; **Workout** (Icon: `Dumbbell`, stroke `[2]`).
  2. `program` &rarr; **Program** (Icon: `CalendarDays`, stroke `[2]`).
  3. `analytics` &rarr; **Progress** (Icon: `TrendingUp`, stroke `[2]`).
  4. `character` &rarr; **Athlete** (Icon: `Shield`, stroke `[2]`).
- **Interactive State:**
  - Active: Text and icon highlight in `text-brand-primary` / `text-white` with bold label.
  - Inactive: Subdued `text-slate-400`.
  - Tap: Light haptic pulse (`triggerHaptic('light')`).
- **Forbidden Iterations:**
  - ❌ NEVER add a 5th navigation tab or floating action button (FAB) that covers content.
  - ❌ NEVER rename tabs to internal jargon (e.g., "Telemetry", "Vectors", "Engine").

---

## 3. Page 1: Workout Tab (`TrainTab.tsx`)

**Primary Purpose:** Execute today's training session with zero cognitive load and guaranteed progressive overload.  
**Focal Point:** The Unified Asynchronous Hypertrophy Hero Card.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. UNIFIED HERO CARD (Primary Focal Point)                                │
│    [Week 1 of 6 • Smooth Start]                        [ Full Gym ▾ ]     │
│    Push 1 • Hypertrophy Core                                              │
│    5 exercises • 21 sets                                                  │
│    ┌─────────────────────────────────────────────────────────────────┐    │
│    │ [ (92%) ]  Week 1 Accumulation: Peak parasympathetic recovery   │    │
│    │ RECOVERY   detected. Full capacity to drive progressive overload.│    │
│    │ ─────────────────────────────────────────────────────────────── │    │
│    │ 📈 HOW TO MAKE PROGRESS THIS SESSION                            │    │
│    │ Week 1 of 6 • Base Building                                     │    │
│    │ Start your block with clean, controlled reps leaving 2 reps in  │    │
│    │ reserve. Prioritise form and set your baseline for muscle growth│    │
│    └─────────────────────────────────────────────────────────────────┘    │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. EXERCISE CARD STACK                                                    │
│    ┌─────────────────────────────────────────────────────────────────┐    │
│    │ 1/6 • Chest                             [Plates] [Change Exercise]│   │
│    │ Barbell Bench Press                              0/3 sets       │    │
│    │ ┌─────────────────────────────────────────────────────────────┐ │    │
│    │ │ 📈 Target: 82.5 kg × 10 reps                 [+2.5 kg Load] │ │    │
│    │ └─────────────────────────────────────────────────────────────┘ │    │
│    │ Set  Prev        Weight (kg)    Reps      RIR      ✓            │    │
│    │ 1    80×10       [  82.5  ]     [ 10 ]    [ 2 ]    [  ✓  ]      │    │
│    │ 2    80×10       [  82.5  ]     [ 10 ]    [ 2 ]    [  ✓  ]      │    │
│    │ 3    80×10       [  82.5  ]     [ 10 ]    [ 1 ]    [  ✓  ]      │    │
│    │ + Add set                                          - Remove set │    │
│    └─────────────────────────────────────────────────────────────────┘    │
├───────────────────────────────────────────────────────────────────────────┤
│ 3. ADD EXERCISE BUTTON (+ Add Exercise to Today's Session)                │
│ 4. FINISH WORKOUT CTA  (✓ Finish Workout)                                 │
└───────────────────────────────────────────────────────────────────────────┘
```

### Section-by-Section Anatomy & Layout Order:
1. **Section 1.1: Unified Hero Card (Focal Point)**
   - *Meta Row:* Context badge (`[Week X of 6 • Phase Name]`) + Location Dropdown (`[Full Gym ▾]`).
   - *Workout Identity:* Title (`activeWorkout.name`, e.g., "Push 1 • Hypertrophy Core") and volume summary (exercises, sets).
   - *Blended Recovery & Progression Area (`ReadinessBanner.tsx`):*
     - Row 1 (Recovery): Circular biometric dial (e.g. `92% RECOVERY`) and contextual recovery narrative, or clean empty state if no watch.
     - Row 2 (Progression): Short written description in natural, everyday language connecting the 6-week program stage to the athlete's primary goal (e.g. hypertrophy), replacing redundant bulleted exercise lists.
2. **Section 1.2: Exercise Card Stack (`ExerciseCard.tsx`)**
   - *Step Number & Metadata:* `1/6 • Chest` on the top row, `0/3 sets` on the exercise title row.
   - *Action Buttons:* `[Plates]` (barbell only) and `[Change Exercise]` (single entry point).
   - *Exercise Title & Done State:* Clean heading with emerald checkmark upon completion.
   - *Target Progression Micro-Cue:* Sleek, single-line micro-target displaying target weight $\times$ reps and concise progress badge for genuine milestones (e.g. `[+2.5 kg Load]`, `[Top of Range]`, `[Hold Steady]`), eliminating nested card clutter and redundant algorithmic text.
   - *12-Column Set Table (`SetRow.tsx`):*
     - Headers: `Set | Prev | Weight (kg) | Reps | RIR | ✓`.
     - Inputs: Clean, spacious numerical inputs pre-filled with calibrated targets (no micro +/- clutter).
     - Set Badge: Stable, non-interactive index label (`1`, `2`, `3`) or auto-generated warmup/drop badge (`W`, `D`). No mystery-meat cycling on tap.
     - Checkmark: Green fill with haptic pulse upon set completion.
   - *Progressive Set Management:* Discreet, low-contrast text actions (`+ Add set` and progressive `— Remove set` when sets > 1) that recede completely into the card to prevent plan tampering and accidental deletions.
3. **Section 1.3: Add Exercise Trigger**
   - Clean button at bottom of stack to append custom movements to today's session.
4. **Section 1.4: Finish Workout Primary Action**
   - Clean, full-width CTA button placed at the bottom of the session flow. Enabled upon logging set 1. Displays completed sets count and total tonnage lifted.

---

## 4. Page 2: Program Tab (`ProgramTab.tsx`)

**Primary Purpose:** Configure high-level training architecture, equipment locations, periodization, and account settings.  
**Focal Point:** Training Locations & Equipment Setup Card.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ TRAINING PROGRAM & SETUP                                                  │
│ Your goal phase, equipment locations, and 6-week plan                     │
├───────────────────────────────────────────────────────────────────────────┤
│ 1. LOCATIONS & EQUIPMENT SUMMARY CARD                 [Edit Equipment]    │
│    Exercises adapt automatically when you switch location on Workout tab  │
│    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│    │ Full Gym         │  │ At Home          │  │ Travel           │       │
│    │ Barbells, Cables │  │ DBs, Bench, TRX  │  │ Bodyweight       │       │
│    └──────────────────┘  └──────────────────┘  └──────────────────┘       │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. TRAINING GOAL PHASE (Build Muscle | Lose Fat | Stay Lean)              │
├───────────────────────────────────────────────────────────────────────────┤
│ 3. 6-WEEK MESOCYCLE PERIODIZATION (Week 1 Base -> Week 6 Deload)          │
├───────────────────────────────────────────────────────────────────────────┤
│ 4. 4-DAY WORKOUT SPLIT & EXERCISES (Push | Pull | Legs | Upper)           │
├───────────────────────────────────────────────────────────────────────────┤
│ 5. PROFILE & DATA SETTINGS (Collapsible Drawers)                          │
│    ▸ 👤 Athlete Profile & Heart Rate Zones                                │
│    ▸ 🛡️ Data Backup, Privacy & Permanent Erase                            │
│    ▸ 📋 Product Governance Ledger & Competitor Matrix                     │
└───────────────────────────────────────────────────────────────────────────┘
```

### Section-by-Section Anatomy & Layout Order:
1. **Section 2.1: Page Header**
   - Title: `Training Program & Setup`. Subtitle: `Your goal phase, equipment locations, and 6-week plan`.
2. **Section 2.2: Locations & Equipment Summary Card (Canonical Setup Entry Point)**
   - 3-column overview of configured gear across `Full Gym`, `At Home`, and `Travel`.
   - Single CTA button: `[Edit Equipment]` (re-launches onboarding gear wizard).
3. **Section 2.3: Training Goal Phase Switcher (`GoalPhaseSwitcher.tsx`)**
   - 3-segment switcher: `Build Muscle (Lean Bulk)`, `Lose Fat (Cut/Recomp)`, `Stay Lean (Maingain)`.
   - Outlines hypertrophy volume landmark adjustments and Retention Shield rules.
4. **Section 2.4: 6-Week Mesocycle Periodization Manager (`MesocycleManager.tsx`)**
   - 6-step interactive week progression stepper with RIR rules and load volume progression.
   - 1-tap `[Trigger Deload Week]` action.
5. **Section 2.5: Workout Split & Routine Editor (`SplitEditor.tsx`)**
   - Shows current split rotation (e.g., Push &bull; Pull &bull; Legs &bull; Upper).
   - Lists exercises assigned to each split day.
   - Includes `[+ Custom Exercise]` builder button and `[Start This Workout]` launch buttons.
6. **Section 2.6: Profile & Heart Rate Zones Accordion (Collapsible)**
   - Athlete name, gender (Male / Female standards), Max Heart Rate, and Resting Heart Rate inputs.
7. **Section 2.7: Data Backup, Privacy & Permanent Erase Accordion (Collapsible)**
   - PWA Install button (when available).
   - Data Portability: `[Export Backup]` (JSON) and `[Restore Backup]` (schema-validated JSON).
   - Data Reset: `[Load 6-Wk Sample]` and `[Delete All Data]` with 2-step confirmation.
   - In-app Privacy Summary & link to `privacy.html`.
8. **Section 2.8: Product Governance & Competitor Matrix Launcher**
   - Launches in-app modal benchmark against RP Hypertrophy, Fitbod, Hevy, and Whoop.

---

## 5. Page 3: Progress Tab (`AnalyticsTab.tsx`)

**Primary Purpose:** Evaluate longitudinal strength trajectories, bodyweight trends, stamina (WCI), and joint health.  
**Focal Point:** Unified Strength Progress vs. Bodyweight Chart.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ PROGRESS & BODY TRENDS                                 7-Day Avg Weight   │
│ Strength across all equipment, stamina & recovery              82.4 kg    │
├───────────────────────────────────────────────────────────────────────────┤
│ [   Strength & Stamina (Active)   |     Recovery, Joints & Steps     ]    │
├───────────────────────────────────────────────────────────────────────────┤
│ VIEW A: STRENGTH & STAMINA                                                │
│ 1. PRIMARY FOCAL POINT: E1RM vs Bodyweight Trend Chart   [Log Today's Wt] │
│    Plots 7-day EMA bodyweight against estimated 1RM across movement       │
│    pillars. Proves true relative strength progression.                   │
│                                                                           │
│ 2. SECONDARY CARD: Work Capacity Index (WCI) Chart                        │
│    Tracks session tonnage per heart-rate reserve percentage over time.    │
├───────────────────────────────────────────────────────────────────────────┤
│ VIEW B: RECOVERY, JOINTS & STEPS (When toggled)                           │
│ 1. PRIMARY FOCAL POINT: Joint Health & Recovery Insights Card             │
│    Analyzes weekly volume against MRV limits; flags joint strain risks.   │
│                                                                           │
│ 2. SECONDARY CARD: Daily Steps & Active Minutes Tracker                   │
│    Tracks daily ambulatory steps and Active Zone Minutes (AZM).          │
└───────────────────────────────────────────────────────────────────────────┘
```

### Section-by-Section Anatomy & Layout Order:
1. **Section 3.1: Header & 7-Day EMA Bodyweight Display**
   - Title: `Progress & Body Trends`. Subtitle: `Strength across all equipment, stamina & joint recovery`.
   - Top-right stat: 7-Day Exponential Moving Average weight in bold monospace.
2. **Section 3.2: 2-Way Segmented Category Switcher**
   - Prevents infinite vertical scroll fatigue by dividing analytics into two discrete views:
     - `[ Strength & Stamina ]`
     - `[ Recovery, Joints & Steps ]`
3. **Section 3.3 (View A): E1RM vs. Weight Chart (`E1rmVsWeightChart.tsx`)**
   - Interactive chart plotting smoothed bodyweight vs. Bench Press, Squat, and Deadlift E1RM.
   - Header action: `[Log Today's Weight]` (launches `WeightLogModal.tsx`).
4. **Section 3.4 (View A): Work Capacity Index Chart (`WciChart.tsx`)**
   - Line chart demonstrating cardiovascular and localized muscular work capacity under load.
5. **Section 3.5 (View B): Joint Health & Recovery Insights (`KnowledgeGraphCard.tsx`)**
   - Evaluates weekly set volumes against muscle MRV limits.
   - Highlights positive adaptation flags and joint strain risk warnings with remedial cues.
6. **Section 3.6 (View B): Daily Steps & Activity Tracker (`ActivityTracker.tsx`)**
   - Bar chart of daily ambulatory steps ($\ge 8{,}500$ goal) and Active Zone Minutes ($\ge 30$ goal).

---

## 6. Page 4: Athlete Tab (`CharacterTab.tsx`)

**Primary Purpose:** Celebrate athlete mastery, relative strength standards (DOTS), and muscle balance.  
**Focal Point:** Athlete Scorecard & Big 3 Strength Benchmarks.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. ATHLETE SCORECARD & BENCHMARKS                                         │
│    (B) Benen Taylor  Lv.4                                 Goal: Build     │
│        82.4 kg bodyweight (7-day average)                                 │
│    ┌──────────────────────────────────┐  ┌───────────────────────────┐    │
│    │ Strength-to-Weight Score         │  │ Combined Big 3 Max        │    │
│    │ 364 pts                          │  │ 412 kg (5.0x BW)          │    │
│    │ Adjusted for 82.4 kg weight      │  │ Squat 140 • Bench 112 • DL│    │
│    └──────────────────────────────────┘  └───────────────────────────┘    │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. SUB-VIEW SWITCHER                                                      │
│    [   Weekly Muscle Sets (Active)    |    Strength Balance & Bonuses    ]│
├───────────────────────────────────────────────────────────────────────────┤
│ SUB-VIEW A: WEEKLY MUSCLE SETS                                            │
│ • Israetel & Schoenfeld Hypertrophy Volume Landmarks Tracker              │
│   Horizontal bar charts tracking 12 muscle groups against MV/MEV/MAV/MRV  │
│   Includes 0.5x synergist credits and excludes warmup sets.               │
├───────────────────────────────────────────────────────────────────────────┤
│ SUB-VIEW B: STRENGTH BALANCE & BONUSES (When toggled)                      │
│ 1. 7-Pillar Strength Balance Radar (6 Strength Pillars + Vitality Engine) │
│ 2. Active Gamification Bonuses (Streak Safe & 1.25x Active Bonus)         │
└───────────────────────────────────────────────────────────────────────────┘
```

### Section-by-Section Anatomy & Layout Order:
1. **Section 4.1: Athlete Scorecard Header**
   - Athlete Avatar initial container, Name, Level badge (`Lv.X`), 7-day EMA bodyweight, and active Goal badge.
2. **Section 4.2: Key Strength Benchmarks (2-Column Grid)**
   - *Left Tile:* **Strength-to-Weight Score (DOTS):** Official DOTS polynomial score adjusted for 7-day EMA bodyweight.
   - *Right Tile:* **Combined Big 3 Max:** Sum of Squat + Bench + Deadlift E1RM with bodyweight multiplier ratio (e.g., $5.0\times\text{ BW}$).
3. **Section 4.3: 2-Way Sub-View Switcher**
   - `[ Weekly Muscle Sets ]` vs. `[ Strength Balance & Bonuses ]`.
4. **Section 4.4 (Sub-View A): Weekly Muscle Volume Landmarks (`VolumeTracker.tsx`)**
   - Horizontal volume gauge for all 12 muscle groups.
   - Color-coded zones for Maintenance (MV), Minimum Effective (MEV), Optimal Hypertrophy (MAV), and Overreaching (MRV).
5. **Section 4.5 (Sub-View B): 7-Pillar Strength Balance Radar (`SevenPillarRadar.tsx`)**
   - Radar chart mapping: Squat, Hinge, Horizontal Push, Vertical Push, Horizontal Pull, Vertical Pull, and Vitality Engine.
6. **Section 4.6 (Sub-View B): Active Gamification Bonuses Card**
   - *Streak Safe:* Confirms streak protection on rest and recovery days.
   - *1.25x Metabolic Momentum Bonus:* Displays qualification status ($\ge 30\text{ AZM} + \ge 8{,}500\text{ steps}$).

---

## 7. Master Templates for Critical Modal & Overlay Flows

### 7.1 Onboarding Wizard (`OnboardingModal.tsx`)
- **Structure:** 4 sequential steps with progress indicators (`Step X of 4`).
  - *Step 1: Welcome & Principles:* Explains Asynchronous Queue, Double Progression, and Multi-Location adaptation. Includes subtle `[Skip to Demo]` escape hatch.
  - *Step 2: Training Split Selection:* 4 evidence-based cards (4-Day PPL+Upper, 3-Day PPL, 4-Day Upper/Lower, 3-Day Full Body).
  - *Step 3: Primary Goal & Phase:* Build Muscle, Lose Fat (Retention Shield), or Stay Lean.
  - *Step 4: Training Locations & Gear:* Selects places and checks specific home equipment.
- **Completion Guarantee:** On step 4 completion, immediately routes athlete to the Workout tab with Day 1 ready to train in 1 tap.

### 7.2 Biomechanical Exercise Swap Modal (`ExerciseSwapModal.tsx`)
- **Structure:**
  - Header: Current exercise name, equipment tag, and movement family badge.
  - Location Filter Tabs: `[ All Locations | Full Gym | At Home | Travel ]`.
  - Movement Alternative Cards: Strictly locked to matching movement family. Shows equipment badge, converted target weight, and plain English *"Why It Works"* biomechanical rationale.
  - Confirmation: 1-tap select converts all sets and updates the active workout.

### 7.3 Plate Calculator Modal (`PlateCalculatorModal.tsx`)
- **Structure:**
  - Header: Target weight, barbell weight ($20\text{ kg}$), and close button (`w-9 h-9 rounded-full`, $\ge 44\text{px}$).
  - Visual Barbell Representation: Rendered barbell sleeve with color-coded Olympic plate rings.
  - Plate Count Table: Exact breakdown of $25\text{ kg}$, $20\text{ kg}$, $15\text{ kg}$, $10\text{ kg}$, $5\text{ kg}$, $2.5\text{ kg}$, and $1.25\text{ kg}$ plates needed per side.

### 7.4 Workout Summary & Level-Up Modal (`WorkoutSummaryModal.tsx`)
- **Structure:**
  - Celebration Header: Confetti animation, completed workout title, date, and duration.
  - Key Metrics Grid: Total tonnage lifted, total completed sets, and WCI efficiency score.
  - PR Breakthroughs & Quests: Highlights any new 1RM records or strength tier advancements.
  - Gamification & XP Award: Displays base XP + Primed bonus + Streak bonus with animated level progress bar.
  - "Up Next" Teaser: Shows the next queued workout in the Asynchronous Hypertrophy Queue.
  - Primary CTA: `[Save & Complete Workout]` (archives session, updates profile XP, closes modal).

### 7.5 Google Pixel Watch Telemetry Sync Modal (`WatchSyncModal.tsx`)
- **Structure:**
  - Header: Watch identity, connection status, and last sync timestamp.
  - Live Biometric Telemetry Tiles: HRV (ms), Resting Heart Rate (bpm), Sleep Duration (hrs), AZM, and Daily Steps.
  - 14-Day Rolling Baseline Z-Score Gauges: Visual gauges for $Z_{\text{HRV}}$ and $Z_{\text{RHR}}$.
  - Readiness Outcome: Displays Primed, Normal, or Amber Shield classification with auto-regulation rules.
  - Actions: `[Sync Now with Pixel Watch]` and interactive state simulation buttons for testing.

### 7.6 Daily Bodyweight Logging Modal (`WeightLogModal.tsx`)
- **Structure:**
  - Header: Today's date and current 7-day EMA bodyweight.
  - Weight Input: Large numerical keypad/input with $0.1\text{ kg}$ increments.
  - Instant Smoothing Feedback: Calculates and previews today's updated 7-day EMA in real time.
  - Action: `[Save Bodyweight]` (updates biometrics log, recalculates DOTS, closes modal).

---

## 8. Anti-Patterns & Strictly Forbidden Iterations

To prevent future sessions from regressing or re-introducing past failures, these anti-patterns are **permanently locked and forbidden**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STRICTLY FORBIDDEN ITERATIONS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. NO COMPETING WORKOUT DAY TABS                                            │
│    Never show [1. Push] [2. Pull] [3. Legs] [4. Upper] as primary navigation│
│    inside the Workout tab. Always show the single 'Up Next' session.        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. NO CALENDAR PENALTIES OR MISSED-DAY SHAMING                              │
│    Never display red 'Missed Workout' badges or break streaks when calendar │
│    days elapse. The Asynchronous Queue always waits for the lifter.         │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. NO DUPLICATE EQUIPMENT CONTROLS OR EXERCISE SWAPPERS                     │
│    Never add horizontal equipment carousels to ExerciseCard. Use only the   │
│    single canonical 'Change Exercise' button and 1-tap Location bar.        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. NO INTERNAL UX, ENGINEERING OR ACADEMIC JARGON                           │
│    Never expose 'OOUX', 'Personal Knowledge Graph', 'Canonical Vector',     │
│    'SFR', or raw 'MEV/MRV' acronyms in user-facing UI copy.                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. NO MICRO-TEXT (< 12px) OR UNSIZED TOUCH TARGETS (< 44px)                 │
│    Never use text-[8px..11px] or icon buttons smaller than 44px touch space.│
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. NO BLANKET '20 SETS PER MUSCLE' FLAT TARGETS                             │
│    Never replace Israetel/Schoenfeld muscle-specific landmarks with flat    │
│    generic set counts. Hamstrings != Lateral Delts.                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Invariant Governance Mandate

This document represents the **final, authoritative Information Architecture and Interaction Design specification** for HeadStrong. Any automated script, AI pair programmer, or human developer must:
1. Treat all sections and layouts defined herein as **LOCKED 🔒**.
2. Run `npm run verify:all` to guarantee that code changes satisfy these structural invariants.
3. Reject any proposed redesign that violates single-entry-point architecture, introduces micro-text, or fractures the Asynchronous Hypertrophy Queue.
