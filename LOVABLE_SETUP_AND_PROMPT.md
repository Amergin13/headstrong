# Running HeadStrong in Lovable (`lovable.dev`) — Complete Setup Guide & Master Prompt

Because **HeadStrong** is built on **Vite + React 18 + TypeScript + Tailwind CSS + Lucide Icons + Recharts**—the exact native stack used by **Lovable**—you have two ways to bring this app into a new Lovable project:

1. **Method 1 (Recommended — 100% Exact Codebase via GitHub Sync):** Push this exact verified repository (`/Users/benentaylor/Lift`) into a new Lovable project's GitHub repository so you keep every single line of the 16-suite verified engine, 24-workout seed history, and UI components.
2. **Method 2 (Prompt-First Creation in Lovable):** Paste the **Master Lovable Prompt** below into `lovable.dev` to generate the project, and paste the **Project Knowledge** block into Lovable's `Settings → Knowledge` so Lovable's AI strictly obeys your exercise science formulas and 19 design heuristics.

---

## Method 1: Push This Exact Codebase into a New Lovable Project (2 Minutes)

Lovable has two-way GitHub synchronization. To load this exact codebase into a brand-new Lovable project without losing any code:

1. **Create a Blank Project in Lovable:**
   - Go to [lovable.dev](https://lovable.dev) and start a new project with a short starter prompt:
     > *"Initialize a minimal dark-mode Vite + React + TypeScript + Tailwind fitness app shell for HeadStrong."*
2. **Connect GitHub in Lovable:**
   - In the top-right corner of the Lovable editor, click the **GitHub icon** $\rightarrow$ **Connect to GitHub** and let Lovable create the repository (e.g. `https://github.com/<your-username>/headstrong.git`).
3. **Push Your Local `/Users/benentaylor/Lift` Codebase to Lovable's Repo:**
   - Open your terminal in `/Users/benentaylor/Lift` and run:
     ```bash
     git init
     git add .
     git commit -m "Import verified HeadStrong PWA & Exercise Science Engine"
     git branch -M main
     git remote add origin https://github.com/<your-username>/<your-lovable-repo>.git
     git push -u origin main --force
     ```
4. **Add the Project Knowledge in Lovable:**
   - In Lovable, open **Project Settings $\rightarrow$ Knowledge** and paste the contents of [`AGENTS.md`](./AGENTS.md) (or the Knowledge block in Section 3 below). Lovable will immediately hot-reload the exact app in its preview window!

---

## Method 2: Master Prompt to Paste into Lovable ("Create New Project")

Copy and paste the prompt below directly into **Lovable's main prompt box** when creating a new project:

```markdown
Build **HeadStrong**, a mobile-first dark-mode Hypertrophy & Strength Progression Web App (React 18, TypeScript, Tailwind CSS, Lucide React icons, Recharts) that tells the lifter what they need to train next and the exact weight and reps required from session to session across any equipment environment (Full Gym, At Home, or Travel).

### 1. Core Value Proposition & Information Architecture (4 Bottom Tabs)
Use a sleek dark obsidian glass aesthetic (`#060709` background, `#10B981` emerald primary accent, `#22D3EE` cyan secondary accent, `#F59E0B` amber recovery shield, `Inter` + `JetBrains Mono` tabular numbers, minimum `12px` / `text-xs` typography floor—never use sub-12px micro-text or internal UX jargon like "OOUX", "PKG", "Canonical Vector", or "SFR").

Build 4 bottom navigation tabs (`Workout`, `Program`, `Progress`, `Athlete`) plus a sticky `Header` showing Level, XP bar, Streak badge (`14d`), and a single `Watch` sync button:

1. **Workout Tab (`TrainTab`):**
   - **Single Opinionated "Up Next" Hero Card (Asynchronous Hypertrophy Queue):**
     - Do NOT tie workouts to calendar days of the week and NEVER show competing session tabs (`1. Push`, `2. Pull`, `3. Legs`, `4. Upper`) or unlabeled stepper bars in the workout hero card.
     - Present **one single recommended session** from the 4-part rotation (`Push` → `Pull` → `Legs` → `Upper`) based on muscle-group biological recovery windows (`Push`: 60h Chest/Shoulders/Triceps; `Pull`: 48h Back/Rear Delts/Biceps; `Legs`: 72h Quads/Hamstrings/Calves; `Upper`: 48h).
     - Show a recovery status badge (`✓ Chest & Synergists 100% Recovered`) and a 1-sentence science rationale that handles skipped days with zero calendar penalty (*"Not tied to a calendar: after X rest days since your last workout, your target muscles are 100% recharged for maximum muscle growth."*).
     - **Single Canonical Equipment Location Bar (`Full Gym` | `At Home` | `Travel`):** A 3-segment control inside the hero card that adapts all exercises in the active workout to the user's available equipment in 1 tap while translating target weights automatically.
     - **"How to Make Progress This Session" Action Checklist:** Bullet list telling the user which lifts have a weight increase (`+2.5 kg` Barbell / `+2.0 kg` Dumbbell) and which lifts need `+1 rep` to beat last session, plus a live set progress bar (`completedSets / totalSets`) and `Finish Workout` button.
     - **`Rest / History` Toggle:** Progressive-disclosure toggle in the top-right of the hero card to log a rest day (holding the current session at the front of the queue with streak protection) or inspect recent completed workouts.
   - **Collapsible Recovery Status Bar (`ReadinessBanner`):**
     - Single-line summary (`Recovery: Ready to Push (+15% XP) • 7.8h sleep`) that expands on tap to show Pixel Watch HRV (`ms`), Resting HR (`bpm`), Sleep (`hrs`), and an intensity mode switcher (`Push Hard` | `Normal` | `Light / Recovery`).
   - **Exercise Cards (`ExerciseCard`):**
     - Header shows step number (`1/5`), muscle & equipment metadata (`Chest • Barbell • 0/3 sets`), a `Plates` calculator button (for barbell lifts), and **one single `Change Exercise` button** (never render an inline duplicate `Equipment:` pill carousel on the card).
     - Target callout box shows `Target: 92.5 kg × 8 reps` (`+2.5 kg Weight Increase` or `+1 Rep Goal Today`) alongside `Last: 90×12`.
     - 12-column set logging table (`Set`, `Last`, `Weight (kg)` with `-`/`+` steppers, `Reps` with `-`/`+` steppers, `Left` [RIR cycler `2 -> 1 -> 0 -> 3`], and `Done` checkmark that auto-propagates changes to remaining uncompleted sets and launches a 90s floating rest timer).
   - **`Change Exercise` Modal (`ExerciseSwapModal`):**
     - Strictly filters alternatives by **13 Biomechanical Movement Families** so `Barbell Bench Press` only swaps with true Horizontal Chest Press equivalents (`Incline Dumbbell Press`, `Flat Dumbbell Bench Press`, `Cable Chest Press`, `TRX Suspension Push-Up`, `Deficit Push-Up`)—never core crunches or tricep pushdowns.
     - Automatically converts the working weight using biomechanical multipliers (`1.18x` Dumbbell stabilizer factor, `1.20x` RDL factor, and `7-Day Bodyweight EMA` for calisthenics) and displays a plain-English `"Why It Works"` explanation on each option.

2. **Program Tab (`ProgramTab`):**
   - **Training Locations & Equipment Card:** Shows `Full Gym`, `At Home` (`Bench, Dumbbells, TRX, Pull-Up Bar`), and `Travel` (`Bodyweight Variations`) with **one single `Edit Equipment` button** that opens a 3-step Goals & Equipment Onboarding Modal.
   - **Training Goal Switcher:** `Build Muscle` (`Lean Bulk`), `Lose Fat` (`Cut / Recomp` with Streak & XP Protection), `Stay Lean` (`Maingain`).
   - **6-Week Training Plan (`MesocycleManager`):** Weeks 1–5 progressive volume wave (MEV to MRV) + Week 6 Light Recovery Deload.
   - **Workout Splits & Exercises (`SplitEditor`):** Browse exercises across `Push`, `Pull`, `Legs`, and `Upper`, launch any split, or add a custom exercise.
   - **Profile & Data Settings + Product Governance & Competitor Matrix Modal:** Export/Import JSON backup, Reset 6-week sample data, Delete all data, and inspect Locked vs. Progressing governance items and competitor benchmarks (vs. RP Hypertrophy, Fitbod, Hevy/Strong, Whoop).

3. **Progress Tab (`AnalyticsTab`):**
   - 2-way segmented switcher:
     - `Strength & Stamina`: Cross-Equipment E1RM vs. 7-Day EMA Bodyweight chart (with `Log Weight` modal) and Work Capacity Index (WCI) chart.
     - `Recovery, Joints & Steps`: Training Insights & Joint Load monitor (Shoulder, Elbow, Knee, Lower Back, Wrist) + Daily Steps & Active Minutes tracker.

4. **Athlete Tab (`CharacterTab`):**
   - Scorecard with Level, 7-Day EMA Bodyweight, official Powerlifting **DOTS Score**, and Combined Big 3 Max (`Squat + Bench + Deadlift`).
   - 2-way segmented switcher:
     - `Weekly Muscle Sets`: Tracks weekly working sets across 12 muscle groups against authoritative Israetel/Schoenfeld hypertrophy landmarks (e.g., `Side Delts 16–26 sets`, `Calves 16–24 sets`, `Chest/Quads 12–18 sets`, `Hamstrings 10–16 sets`, crediting `0.5x` sets for secondary synergists and excluding warmups).
     - `Strength Balance & Bonuses`: 7-Pillar Radar Chart (`Squat`, `Hinge`, `Horizontal Push`, `Vertical Push`, `Horizontal Pull`, `Vertical Pull`, `Engine/Vitality`) benchmarked against international bodyweight ratios (`Untrained` to `Elite`).
```

---

## Section 3: Paste This into Lovable's `Project Settings → Knowledge`

To prevent Lovable's AI from introducing design debt in future edits, paste these rules into **Project Settings $\rightarrow$ Manage Knowledge**:

```markdown
### Mandatory HeadStrong Governance & Design Rules
1. **Single Canonical Entry Point Per Job (Zero Duplication):**
   - There must be ONLY 1 method for switching session equipment (`Full Gym | At Home | Travel` segmented bar in the Workout Hero Card).
   - There must be ONLY 1 method for changing an individual exercise (`Change Exercise` button in the `ExerciseCard` header -> opens `Change Exercise` modal). NEVER add an inline `Equipment:` pill carousel to `ExerciseCard`.
2. **Asynchronous Hypertrophy Queue (Not Calendar-Bound):**
   - Never show competing workout tabs (`Push`, `Pull`, `Legs`, `Upper`) or unlabeled progress steppers in the Workout Hero Card. Always show the single recommended "Up Next" session with its muscle recovery window (`48h–72h`) and zero penalty for skipped days.
3. **13 Biomechanical Movement Families for Swaps:**
   - Never match exercise swaps by broad 6-pillar tags. Strictly match by `movementFamily` (`chest_press`, `overhead_press`, `side_delt_raise`, `tricep_extension`, `vertical_pull`, `horizontal_row`, `rear_delt_pull`, `bicep_curl`, `knee_dominant_squat`, `hip_hinge`, `hamstring_curl`, `calf_raise`, `core_flexion`).
4. **Content Clarity & Typography Floor:**
   - Minimum font size is `12px` (`text-xs`). Never use `text-[9px]`, `text-[10px]`, or `text-[11px]`.
   - Never expose internal UX or academic jargon (`OOUX`, `PKG`, `Canonical Vector`, `SFR`, `MEV/MAV/MRV`) in user-facing labels.
```
