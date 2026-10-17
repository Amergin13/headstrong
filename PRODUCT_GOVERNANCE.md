# HeadStrong Product Governance Model & Competitor Feature Matrix

This document is the authoritative **Product Governance Ledger** for **HeadStrong**. It establishes:
1. **Why a Governance Model is Required:** Some iterations significantly advanced the core value proposition (*telling the user what they need to do to reach their goals from session to session across any equipment environment*), while other iterations introduced unnecessary complexity, academic jargon, or UI bloat.
2. **Governance States (`Locked` 🔒 | `Progressing` 🔄 | `Under Review` ⚠️):**
   - **`Locked` 🔒 (Verified & Protected):** High-value capabilities and design guardrails that are proven, tested in `src/engine/__tests__/verifyEngine.ts`, and **must not be regressed or altered** without explicit user approval.
   - **`Progressing` 🔄 (Active Iteration):** Capabilities with a strong foundation that are actively being refined based on session-to-session usage.
   - **`Under Review` ⚠️ (Critique & Remediation):** Changes or UI patterns that exhibited friction, vertical density bloat, or edge cases and require strict oversight or simplification.
3. **Competitor Feature Comparison Matrix:** Benchmarks HeadStrong against **RP Hypertrophy App**, **Fitbod**, **Hevy / Strong**, and **Whoop / Athlytic**.

---

## 1. Competitor Feature Comparison Matrix

| Capability / User Need | Governance Status | **HeadStrong** | **RP Hypertrophy App** | **Fitbod** | **Hevy / Strong** | **Whoop / Athlytic** |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| **1. Session-to-Session Actionable Targets** (*"What do I lift today to progress?"*) | **Locked** 🔒 | **✓ Leader** — Explicit *"How to Make Progress Today"* checklist + per-set Double Progression (`+1 rep` or `+2.5kg`/`+2kg`). | **✓ Leader** — Prescribes weight/reps from post-set RIR & pump ratings (\$35/mo). | **◐ Partial** — Algorithmic weights often fluctuate unpredictably between sessions. | **✕ None** — Passive digital notebook; shows last session's numbers without prescribing today's target. | **✕ None** — Tracks cardio strain/recovery only; no weight/rep targets. |
| **2. Cross-Equipment Strength Continuity** (*Barbell ↔ Dumbbell ↔ TRX/Bodyweight*) | **Locked** 🔒 | **✓ Leader** — Unified 13-family movement vectors with `1.18x` DB & `1.20x` RDL load conversion. | **✕ None** — Swapping an exercise mid-block resets weight/rep history for the new lift. | **◐ Partial** — Estimates starting weight from general muscle score, but tracks history per exercise. | **✕ None** — Strict per-exercise silos; swapping equipment breaks your progress chart. | **✕ None** — No exercise progression tracking. |
| **3. 1-Tap Location Adaptation** (*Full Gym ↔ Home [DB, Bench, TRX, Bar] ↔ Travel*) | **Progressing** 🔄 | **✓ Leader** — 1-tap location bar converts today's entire session to matched Home or Travel gear while carrying over targets. | **✕ None** — Requires manually building a separate mesocycle template for home or travel. | **✓ Leader** — Supports multiple gym profiles, though swaps can alter split structure. | **✕ None** — Requires manually swapping every exercise one by one. | **✕ None** — N/A. |
| **4. Biomechanical Movement Swap Guardrails** (*Never mix Chest Press with Crunches*) | **Locked** 🔒 | **✓ Leader** — 13 movement families with plain-English *"Why It Works"* rationale and location filters. | **✓ Leader** — Curated muscle-group exercise slots per mesocycle. | **◐ Partial** — Can suggest mismatched accessory movements when filtering by broad muscle group. | **◐ Partial** — Filters by broad muscle group (e.g., "Chest" mixes compound presses and flyes). | **✕ None** — N/A. |
| **5. Muscle-Specific Hypertrophy Volume Landmarks** (*Side Delts/Calves vs. Hamstrings*) | **Locked** 🔒 | **✓ Leader** — Israetel/Schoenfeld MV/MEV/MAV/MRV landmarks across 12 muscles (`16–26` Side Delts vs `10–16` Hams) + `0.5x` synergist credit. | **✓ Leader** — Pioneered MEV-to-MRV volume progression across mesocycle weeks. | **✕ None** — Uses opaque muscle recovery percentages rather than weekly set landmarks. | **◐ Partial** — Counts weekly sets per muscle, but uses flat targets without recovery physiology. | **✕ None** — No hypertrophy set volume tracking. |
| **6. Wearable Sleep/HRV Auto-Regulation & Streak Protection** | **Progressing** 🔄 | **✓ Leader** — 14-day HRV/RHR/Sleep Z-score triggers Recovery Shield (holds load, 2–3 RIR, streak safe) or `+15%` Primed XP. | **◐ Partial** — Relies on manual subjective soreness questions rather than wearable sync. | **◐ Partial** — Syncs workouts/calories, but does not auto-regulate RIR or protect streaks from HRV. | **✕ None** — No biometric readiness or auto-regulation. | **✓ Leader** — Best-in-class HRV/Sleep recovery scoring, but disconnected from lifting prescriptions. |
| **7. Relative Strength Standards (DOTS & 7-Day Bodyweight EMA)** | **Locked** 🔒 | **✓ Leader** — Official DOTS polynomial + 7-day EMA bodyweight smoothing + exact reps needed at current weight to rank up. | **✕ None** — Focuses strictly on hypertrophy blocks; no relative strength standards. | **◐ Partial** — Proprietary muscle scores rather than official bodyweight ratios. | **◐ Partial** — Basic 1RM estimates without DOTS or 7-day bodyweight EMA smoothing. | **◐ Partial** — Tracks VO2Max and RHR only. |

---

## 2. Change Ledger & Honest Retrospective Critique

### 2.1 Locked Changes (`Locked` 🔒 — Good Changes Protected by CI)
1. **`gov-13-movement-families` — 13-Family Biomechanical Exercise Database & Strict Swap Matching**
   - **Rationale:** Earlier versions filtered exercise swaps by broad 6-pillar tags (`ex.pillar === currentExercise.pillar`), which caused `Barbell Bench Press` (`Horizontal Push`) to offer `Cable Kneeling Crunch` and `Cable Tricep Pushdown` as swaps.
   - **Why It's Locked:** Every exercise in `src/services/seedData.ts` now maps to one of 13 strict movement families (`vector-pillar-horizontal-push`, `vector-iso-core`, `vector-iso-triceps`, etc.). `ExerciseSwapModal.tsx` and `getVectorImplementOptions` strictly enforce movement-family equality.
   - **CI Invariant:** `Barbell Bench Press` alternatives must never contain `ex-cable-crunch` or `ex-tricep-pushdown`.

2. **`gov-cross-implement-continuity` — Cross-Implement Strength Continuity (`1.18x` DB, `1.20x` RDL)**
   - **Rationale:** Lifters shouldn't lose their progression history when switching from a barbell at the gym to dumbbells at home.
   - **Why It's Locked:** `translateWeightBetweenImplements` and `prescribeDoubleProgression` carry over the athlete's canonical E1RM across implements and display clear cross-implement ghost sets (`≈76×12 @2R`).
   - **CI Invariant:** `90 kg` Barbell Bench Press translates to `76 kg` combined Dumbbell press (`38 kg/DB`) and prescribes `+2 kg` (`78 kg`) when all sets hit top of rep range.

3. **`gov-rp-volume-landmarks` — Evidence-Based Hypertrophy Volume Landmarks (Israetel/Schoenfeld)**
   - **Rationale:** Blanket "20 sets per muscle" causes overtraining on high-damage fast-twitch muscles (Hamstrings) and under-stimulates fast-recovering muscles (Lateral Delts, Calves).
   - **Why It's Locked:** `HYPERTROPHY_VOLUME_LANDMARKS` enforces muscle-specific MV/MEV/MAV/MRV ranges, credits `0.5` sets for secondary synergists, and excludes warmup sets.

4. **`gov-plain-english-design-heuristics` — Zero Internal Jargon & 3-Tier Typography**
   - **Rationale:** Previous iterations exposed internal UX and engineering terminology (`OOUX Movement Swap`, `Personal Knowledge Graph`, `Canonical Vector`, `SFR`) and used unreadable `8px–10px` badges.
   - **Why It's Locked:** All user-facing screens use plain consumer English (`Switch Exercise`, `How to Make Progress This Session`, `Training Insights`) and a strict 3-tier typography hierarchy (`12px` minimum floor).

5. **`gov-hero-card-vertical-density` — Asynchronous Hypertrophy Queue & Single-Focus Workout Hero Card**
   - **Rationale (Resolving the Confusing 6-Segment Stepper & 4-Session Tab Strip):** Earlier versions rendered 6 unlabeled green segments above 4 competing session buttons (`1. Push TODAY`, `2. Pull`, `3. Legs`, `4. Upper`). Users were confused why other sessions appeared as tabs when they were supposed to train Push, what the unlabeled green segments meant, and what happens if they skip a day.
   - **Why It's Locked:** Replaced with a single, opinionated **"Up Next"** session recommendation driven by `getHypertrophyQueueRecommendation()`, displaying the muscle-group recovery window (`48h–72h`, e.g., `Chest & Synergists 100% Recovered`) and explicitly adapting to skipped days without calendar penalties.

6. **`gov-single-entry-point-cohesion` — Single Canonical Entry Point Per Job (1 Equipment Switcher, 1 Exercise Changer)**
   - **Rationale (Eliminating Design Debt & Duplicated Entry Points):** Previous iterations introduced duplicated entry points across the app: `ExerciseCard.tsx` had both a `Switch Equipment` button AND an inline `Equipment: [Barbell] [Dumbbell] [Dumbbell]...` horizontal carousel (which mapped alternative exercises to duplicate equipment labels); `TrainTab.tsx` had an `Adjust Gear / Split` drawer that duplicated the `Program` tab's split switcher and onboarding button; `ProgramTab.tsx` had two onboarding buttons (`Goals & Gear Setup` + `Edit Gear`) and a duplicate `Google Pixel Watch` accordion; `Header.tsx` had a duplicate `Reset Demo Data` icon.
   - **Why It's Locked:** Enforces **1 method for switching session equipment** (`Full Gym | At Home | Travel` segmented bar on the Workout card) and **1 method for changing an exercise** (`Change Exercise` button on `ExerciseCard.tsx` opening `ExerciseSwapModal.tsx`), with all duplicate entry points and sub-12px micro-text (`text-[9px]`, `text-[10px]`, `text-[11px]`) permanently removed.

---

### 2.2 Progressing Changes (`Progressing` 🔄 — Active Refinement)
1. **`gov-session-to-session-checklist` — "How to Make Progress This Session" Action Checklist (`TrainTab.tsx`)**
   - **Rationale:** Directly answers *"what am I training next, and what do I need to do to make progress"* at the top of the Workout tab.
   - **Next Refinement:** Dynamically strike through or check off each progression goal as the user logs the corresponding sets during the workout.

2. **`gov-location-equipment-onboarding` — Multi-Location Equipment Context (`Full Gym` | `At Home` | `Travel`)**
   - **Rationale:** Allows users with a gym membership, a home setup (`Bench`, `Dumbbells`, `TRX`, `Pull-Up Bar`), and travel days (`Bodyweight`) to adapt their session in 1 tap.
   - **Next Refinement:** Continue tuning pure bodyweight/TRX progression cues (tempo, pauses, mechanical advantage) when external weight is `0 kg`.

3. **`gov-wearable-readiness-autoregulation` — Pixel Watch Z-Score Readiness & Recovery Shield**
   - **Rationale:** Protects lifters from CNS burnout and streak loss when sleep (`<6h`) or HRV (`Z <= -0.8`) dips.

---

## 3. Codified 19-Point Product Design Heuristics Framework

Every screen and feature in **HeadStrong** is designed and evaluated against these 19 non-negotiable heuristics:

### 3.1 Visual Design (6 Principles)
1. **Simplicity:** Strip away non-essential elements—never show unlabeled progress bars or competing multi-tab workout switchers on the primary workout canvas.
2. **Hierarchy:** Guide attention through size, color, and placement—1 primary focal point per screen (`Up Next` Session & Action Checklist).
3. **Consistency:** Uniform dark-glass cards, 3-tier typography (`12px` minimum floor), and `1.5px–2px` stroke icons.
4. **Negative Space:** Generous padding (`p-4`, `gap-3.5`) so Exercise #1 sits immediately accessible above the fold.
5. **Emotional Resonance:** Semantic athletic palette (`#10B981` Primed Emerald, `#22D3EE` Vector Cyan, `#F59E0B` Recovery Shield Amber).
6. **Context & Relevance:** Surface only what matters for the active session and current equipment profile.

### 3.2 Content Design (6 Principles)
7. **Clarity & Conciseness:** Plain, direct consumer English so users immediately know what to train next and what weight/reps to hit.
8. **Scannability:** Concise bullet checklists and `font-mono tabular-nums` for all weights, reps, and recovery windows.
9. **User-Centric Language:** Zero internal UX or academic jargon (never expose `OOUX`, `PKG`, `Canonical Vector`, or `SFR`).
10. **Consistent Tone & Voice:** Authoritative, encouraging coach grounded in exercise physiology.
11. **Contextual Help:** Deliver microcopy (e.g., `60h` chest recovery window, skipped-day reassurance, why an exercise swap works) right where decisions happen.
12. **Opinionated:** Tell the user what session is **Up Next** based on their Asynchronous Hypertrophy Queue and muscle recovery window—never dump a menu of competing workouts.

### 3.3 Interaction Design (7 Principles)
13. **Intuitiveness:** Single-tap gym-floor ergonomics aligned with lifter mental models.
14. **Responsiveness & Feedback:** Immediate visual and haptic feedback on set completion, PRs, and gear switches.
15. **Forgiveness & Error Prevention:** Undo banner for set deletion, zero calendar penalty when skipping a day, and strict 13-family swap guardrails.
16. **Efficiency:** Auto-propagate working weight/reps to subsequent sets and tuck secondary controls into a single drawer.
17. **Accessibility:** Enforce `>=44px` touch targets, semantic ARIA roles, and WCAG AA contrast.
18. **Adaptability:** Adapt seamlessly to skipped days (Asynchronous Hypertrophy Queue) and changing locations (`Full Gym`, `At Home`, `Travel`).
19. **Progressive Disclosure:** Show only the **Up Next** session recommendation and progress checklist by default; reveal equipment/split overrides inside `Adjust Gear / Split`.

