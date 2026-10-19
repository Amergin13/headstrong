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

7. **`gov-ia-master-template-and-prs` — Information Architecture Master Template & Product Requirements Spec**
   - **Rationale:** Customer needs dictate zero-guesswork progression and cross-environment continuity. The Interaction Design Master Template (`INTERACTION_DESIGN_MASTER_TEMPLATE.md`) and Product Requirements Spec (`PRODUCT_REQUIREMENTS_SPEC.md`) codify the exact page layouts, focal points, and section hierarchies.
   - **Why It's Locked:** Prevents future sessions from regressing or reorganizing completed and agreed structures. All 4 main tabs (`Workout`, `Program`, `Progress`, `Athlete`) and all critical modals follow locked templates.
   - **CI Invariant:** All pages, section hierarchies, and canonical entry points must adhere to `INTERACTION_DESIGN_MASTER_TEMPLATE.md`. No session may re-introduce calendar-bound day tabs, duplicate controls, or micro-text.

8. **`gov-authoritative-hypertrophy-and-retention-science` — Authoritative Exercise Science for Hypertrophy, Muscle Retention & Split Rotations**
   - **Rationale:** Caloric deficits impair systemic recovery capacity and accelerate catabolic muscle loss. Hypertrophy blocks require progressive volume accretion (MEV $\to$ MAV $\to$ MRV), while fat loss phases require maintaining heavy mechanical tension (1–2 RIR) with volume scaled to ~80–85% (capped at 2–3 sets) to prevent overtraining.
   - **Why It's Locked:** Programmatic volume scaling in `generateSmartWorkoutSession` and double progression in `prescribeDoubleProgression` automatically adapt based on `goalPhase`. When in `Cut / Recomp`, holding load and reps triggers the **Retention Shield**, celebrating lean tissue preservation as relative strength (DOTS) rises. Furthermore, `getNextSplitDay` and `getSplitDaysForProgram` dynamically support all 4 split types (`ppl`, `ppl_upper`, `upper_lower`, `full_body`).
   - **CI Invariant:** Verified in `Suite 18` of `src/engine/__tests__/verifyEngine.ts`. In `Cut / Recomp`, set volumes must be capped at 2–3 sets and double progression must display Retention Shield feedback. Split day rotation must match the athlete's `programType`.

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

---

## 3. Authoritative 19-Point Product Design Heuristics Framework

Every screen, modal, copy string, and feature in **HeadStrong** is continuously designed and audited against these 19 non-negotiable heuristics from the product design standards:

### 3.1 Visual Design Heuristics (6 Principles)
1. **Hierarchy:**
   - **Layout:** Focus each screen on **one element or primary section as the focal point** while clearly de-emphasizing secondary controls. Never show competing session tabs (`1. Push`, `2. Pull`, `3. Legs`, `4. Upper`) as primary navigation inside an active workout.
   - **Type:** Use correct typography styles emphasizing the most significant text. Strict `text-xs` (`12px`) minimum floor — never sub-12px micro-text.
   - **Color:** Use semantic color tokens (`brand-primary`, emerald, amber, neutral slate) to differentiate elements, primary/secondary actions, and statuses.
   - **Visual Assets:** Use icons only to focus users on the most important content with uniform optical stroke weight (`stroke-[2]`).
2. **Alignment:**
   - **Layout:** Use a strict responsive grid and balanced relationships between all elements.
   - **Type:** Align text accurately and consistently.
   - **Color:** Ensure balanced color tokens across surfaces.
   - **Visual Assets:** All icons, pictograms, and illustrations use the same optical stroke weight (`stroke-[2]`).
3. **Consistency:**
   - **Layout:** Predictable and repeatable layout grid and placement across all screens.
   - **Type:** Typography styles used consistently for all content (headlines, subtitles, labels).
   - **Color:** Consistent color tokens for differentiation across the experience.
   - **Visual Assets:** Consistently scale and place icons in relation to the content they represent.
4. **Contrast:**
   - **Layout:** Dynamic layout leading users to complete tasks with clarity and visual interest.
   - **Type:** Typography styles create clear emphasis to guide users to the most important actions.
   - **Color:** Clearly differentiate active/actionable versus inactive/passive elements.
   - **Visual Assets:** Icons create clear distinction that helps users understand content.
5. **Simplicity:**
   - **Layout:** Preserve negative space to create an open, clean experience instead of clutter or mess.
   - **Type:** Consistently use type in **no more than 2–3 styles, weights, and sizes per card**.
   - **Color:** Use color consistently and only when needed to emphasize action, status, or reporting.
   - **Visual Assets:** Use icons only to enhance information or create necessary connections with other content.
6. **Delight:**
   - **Layout:** Organization makes the experience easy and intuitive to understand and use.
   - **Type:** Typography brings joy, satisfaction, or a sense of completion.
   - **Color:** Joyful and motivating color interactions (e.g., emerald checkmarks on completed sets).
   - **Visual Assets:** Visual assets enhance content to bring joy and positive surprise when stakes are low.

### 3.2 Content Design Heuristics (6 Principles)
1. **Clarity (Be Clear Instead of Clever):**
   - Give customers all information needed to make good decisions quickly and with confidence.
   - Use plain, simple language without complex words, jargon, slang, metaphors, or cultural references. **NEVER expose internal UX, engineering, or academic method names** (`OOUX`, `PKG`, `Canonical Vector`, `SFR`, `MAV/MEV/MRV`) in user-facing UI.
   - Headings must be quickly understood just by scanning.
   - Primary call-to-action must be compelling for the immediate task and shown on the first screen.
   - Content and help resources available with progressive disclosure.
2. **Consistency:**
   - Terms align across the entire product (`Workout`, `Program`, `Progress`, `Athlete`).
   - Shared, standardized vocabulary for all product features and concepts.
   - Consistent voice across all product surfaces and settings.
3. **Structure:**
   - Thoughtful information architecture makes the complex clear.
   - Prioritize the most important content at the top of all screens and the beginning of sentences: immediately answer *(1) What am I training next?* and *(2) What do I need to do to make progress?*
   - Support non-happy-path realities (skipping a day, training at home with dumbbells/TRX/pull-up bar, or travelling with bodyweight).
   - Navigation, tabs, panels, and headings tell a meaningful story with a clear sequence.
   - Clearly label next steps, help resources, and ways to cancel or exit.
4. **Product Voice (Clear, Helpful, Human, Kind):**
   - **Clear:** Content helps customers complete their tasks quickly and well.
   - **Helpful:** Gives the right level of information at the right time.
   - **Human:** Customer-focused, warm, natural, and conversational without being loud or overbearing.
   - **Kind:** Makes all customers feel welcome, respected, and appreciated.
5. **Product Tones:**
   - **Friendly:** Onboarding, welcome messages, sign up, and conversational support.
   - **Direct:** Standardized create, edit, and management flows, tooltips, forms, settings, and error messages.
   - **Motivating:** Coaching, set completion feedback, PR celebrations, and sharing progress milestones.
   - **Opinionated:** Recommending the single best next workout or program split rather than forcing the user to pick from a confusing list.
   - **Urgent:** Highlighting joint strain alerts, critical notifications, and auto-regulation recovery buffers.
6. **Accessibility & Inclusivity:**
   - **Perceivable:** Text alternatives for all non-text content.
   - **Operable:** All interactive content controllable via touch, keyboard, and assistive technologies.
   - **Understandable:** Secondary-school reading clarity.
   - **Robust:** Compatible with screen readers in the intended order with identical meaning.
   - **Inclusive:** Welcoming for all audiences, culturally unbiased, and fully WCAG AA compliant.

### 3.3 Interaction Design Heuristics (7 Principles)
1. **Predictable & Efficient:**
   - Simple structure with a clear conceptual model and no unnecessary levels.
   - Relevant navigation options in the moment; clear wayfinding.
   - High confidence in outcomes when a user makes a selection.
   - Users quickly find what they need to make progress in 1 tap.
   - Smart defaults streamline user actions.
   - Purposeful motion instead of purely decorative animations.
2. **Communicative:**
   - Immediate visual and haptic feedback for every user interaction.
   - Unambiguous feedback from interface elements.
   - Communicates progress for multi-step tasks (e.g. `Step 1 of 4` progress bars).
   - Visually referential state changes (saved, unsaved, offline).
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
   - **Behavioral Joy:** First-time-to-value: immediately upon completing onboarding, the user sees their tailored workout ready to log.
   - **Natural Joy:** Content and recommendations feel specifically created for the athlete and their recovery state.
   - **Visceral Joy:** Aesthetic athletic interface with purposeful dark-mode contrast.
   - **Moment of Joy:** Celebrates PR breakthroughs and workout completions appropriately without patronizing.
   - **Reflective Joy:** A clean moment of accomplishment and streak milestone after completing a workout.

---

## 4. Onboarding & First-Time-to-Value Governance Specification (`gov-onboarding-first-time-to-value`)

1. **Automatic First-Launch Trigger:** Any new user without `profile.onboardingCompleted = true` is immediately greeted by the Onboarding experience on launch.
2. **Under 60-Second Completion:** The wizard uses smart defaults and a 4-step progressive flow:
   - **Step 1 (Welcome & How It Works):** Explains Asynchronous Hypertrophy Queue, Double Progression, and Adaptive Locations with a friendly tone and a `Skip to Demo` escape hatch.
   - **Step 2 (Program Split Selection):** Lets the lifter select their training split (`Push / Pull / Legs + Upper`, `Push / Pull / Legs`, `Upper / Lower`, or `Full Body`) with clear frequency and starter session labels.
   - **Step 3 (Main Goal):** Calibrates volume landmarks for `Lean Bulk`, `Cut / Recomp` (Retention Shield), or `Maingain`.
   - **Step 4 (Locations & Equipment):** Configures places (`Full Gym`, `At Home`, `Travel`) and specific home gear (`Bench`, `Dumbbells`, `TRX`, `Pull-Up Bar`, `Bands`).
3. **Instant First-Time-to-Value Delivery:** Upon tapping *"Start Day 1 Workout"*, the app immediately generates Day 1 for that chosen split, switches to the Workout tab, and displays Exercise #1 ready to train in 1 tap.


