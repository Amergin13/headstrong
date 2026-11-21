# Specification: Seamless Cross-Environment Exercise Swapping & Continuity Engine (Treise)

## 1. Agent Directive & Workflow Rules

* **Explore first, then plan:** Inspect the existing project structure, persistence layer, workout session state manager, progression engine, and on-device AI coach interface before proposing code edits.
* **Output an Implementation Plan artifact before modifying files:** Map the domain models below to existing entities and migrations rather than creating parallel architectures.
* **Strict separation of concerns:** All progression calculations, load priors, inter-set fatigue adjustments, and volume totals **must be implemented as pure, deterministic functions** with unit test coverage. The on-device AI coach must **never** compute loads or e1RMs directly; it only parses natural-language user constraints into structured JSON inputs consumed by the deterministic engine.
* **Verification loop:** Create and run automated unit tests covering every scenario in Section 7 before marking any task complete.

---

## 2. Product Objective & Non-Negotiable Architectural Invariants

Enable a lifter to transition smoothly across training environments (e.g., Home Gym Barbell → Hotel Dumbbells → Bodyweight Only → Return to Home Gym) without feeling like they are restarting their program, losing momentum, or manually managing multiple routines.

### Core Invariants (Must Not Be Violated)

1. **Slot-First UI, Exercise-Isolated Math:** Decouple `MovementSlot` (which governs program continuity, weekly set targets, and muscle volume progress) from `Exercise` (which stores isolated e1RM history and progression curves). **Never** merge dumbbell or bodyweight sets into a barbell exercise's e1RM time series.
2. **Temporary by Default:** Environment switches are time-bounded overlays (`TODAY_ONLY` or `UNTIL_DATE`) that expire and auto-revert to the user's master program. Never mutate the master program template unless the user explicitly chooses a permanent swap.
3. **Zero Blank Cold-Start Friction:** When swapping to an unlogged exercise, always populate actionable Set-1 guidance (either an anchor-derived load prior for standardized equipment, a leverage/bodyweight setup, or an explicit effort/RIR prompt for unfamiliar machines).
4. **Physiological Honesty:** Never prescribe flat weight + flat reps with an *ascending* (easier) RIR on later sets, and never synthesize a fake barbell 1RM gain from bodyweight push-ups.
5. **Local Privacy:** On-device AI coach chats and temporary constraint overrides must remain local on the device.

---

## 3. Domain Data Contracts

Map these fields onto Treise's existing local database / domain models:

```ts
enum EquipmentClass {
  STANDARDIZED_FREE_WEIGHT,   // Barbell, Dumbbell, Smith Machine, Kettlebell
  BODYWEIGHT,                 // Push-ups, Pull-ups, Dips, Lunges
  VARIABLE_MACHINE_OR_CABLE   // Pin-loaded machines, cable stacks (unknown pulley ratios)
}

enum OverlayScope {
  TODAY_ONLY,
  WEEK_OVERRIDE,              // Auto-reverts at start of next training week
  CUSTOM_UNTIL_DATE
}
```

- `ExerciseMetadata`: `exercise_id`, `name`, `movement_pattern`, `equipment_class`, `equipment_required`, `primary_muscles`, `secondary_muscles`, `anchor_transfer_ratio`, `bodyweight_load_pct`, `leverage_tier`, `is_unilateral_per_hand`
- `ProgramSlot`: `slot_id`, `program_id`, `workout_day_id`, `movement_pattern`, `anchor_exercise_id`, `target_sets`, `target_rep_min`, `target_rep_max`, `target_rir_initial`, `rest_seconds`
- `EnvironmentOverlay`: `overlay_id`, `active_profile_type`, `available_equipment`, `max_dumbbell_kg`, `max_session_minutes`, `scope`, `expires_at_epoch_ms`
- `ExerciseProgressionState`: `exercise_id`, `last_logged_at`, `estimated_1rm_kg`, `last_working_weight_kg`, `last_working_reps`, `last_logged_rir`, `calibrated_session_count`
- `ActiveSetPrescription`: `set_number`, `suggested_weight_kg`, `is_weight_estimated`, `setup_label`, `target_reps_min`, `target_reps_max`, `target_rir`, `calibration_source`

---

## 4. Functional Requirements: Progression & Calibration Engine

### REQ-1: Temporary Environment Overlay & On-Device AI Coach Contract

* **Overlay Resolution:** When opening a workout, resolve `active_overlay`. If `now > expires_at_epoch_ms`, automatically archive the overlay and restore `anchor_exercise_id` for all slots with zero confirmation modals.
* **Slot Swapping:** For each `ProgramSlot`, if `anchor_exercise_id` is incompatible with `active_overlay.available_equipment`, deterministically select the highest-priority replacement matching `slot.movement_pattern` and `available_equipment`.
* **AI Coach Structured Output:** When the user enters a free-text prompt in the environment sheet (e.g., *"Hotel dumbbells only up to 30 kg for the next 5 days"*), the on-device AI coach parses the text into an `EnvironmentOverlay` payload (`available_equipment`, `max_dumbbell_kg`, `max_session_minutes`, `expires_at_epoch_ms`) and hands it to the deterministic resolver.

### REQ-2: Anchor-Based Set-1 Prior Routing

For a resolved `target_exercise_id` inside a `ProgramSlot`, determine Set-1 targets using this exact 4-branch decision tree:

1. **Branch A — Existing Exercise History (No Prior Needed):** If `ExerciseProgressionState(target_exercise_id)` has logged data within the past 90 days, use its own progression state directly (`is_weight_estimated = false`, `calibration_source = OWN_HISTORY`).
2. **Branch B — Standardized Free-Weight Prior (`STANDARDIZED_FREE_WEIGHT`):** If unlogged and the slot's `anchor_exercise_id` has an `estimated_1rm_kg`:
   * Compute conservative estimated 1RM: `prior_e1rm = anchor_e1rm * target_meta.anchor_transfer_ratio` (default safety buffer: 0.78 for Barbell Bench → Flat Dumbbell Press).
   * Solve target load for `(target_rep_min + target_rep_max)/2` reps at `target_rir_initial` using inverse Epley: $w = \frac{\text{prior\_e1rm}}{1 + (r_{\text{target}} + \text{RIR}_{\text{target}})/30}$.
   * If `is_unilateral_per_hand == true`, divide by 2.
   * Round **down** to the nearest available gym increment (and clamp to `max_dumbbell_kg` if set).
   * Flag `is_weight_estimated = true` and `calibration_source = ANCHOR_PRIOR`.
3. **Branch C — Bodyweight Leverage & Effort Shift (`BODYWEIGHT`):**
   * Estimate effective load for candidate bodyweight variants in the same `movement_pattern` as `effective_load = user_bodyweight_kg * variant.bodyweight_load_pct`.
   * Choose the `leverage_tier` whose `effective_load` puts predicted reps to failure closest to an 8–18 rep zone relative to `anchor_e1rm`.
   * **Light-Load RIR Tightening Rule:** If `effective_load < 0.60 * anchor_e1rm`, automatically tighten `target_rir` to `0–1` across working sets (e.g., `1 → 1 → 0`).
4. **Branch D — Unfamiliar Machine or Cable (`VARIABLE_MACHINE_OR_CABLE`):**
   * Do **not** compute an absolute kg/lb guess.
   * Inherit `target_sets`, `target_rep_min..max`, and `target_rir` from the slot, set `suggested_weight_kg = null`, `setup_label = "Pick moderate"`, and `calibration_source = EFFORT_ONLY`.

### REQ-3: Immediate Set-1 Recalibration, Fatigue Solver & Guardrails

* **RIR Input Scale:** Clamp user RIR selection to integers `0, 1, 2, 3, 4, 5, 6+` (where `6+` is stored as `6` and excluded from high-precision 1RM estimation).
* **Immediate Intra-Session Recalibration (Sets 2..N):** Compute $e1\text{RM}_{S1} = w_{S1} \cdot (1 + (r_{S1} + \text{RIR}_{S1})/30)$. If Set 1 was `ANCHOR_PRIOR` or `EFFORT_ONLY` (or deviated from expected reps/RIR by $\ge 2$ reps), immediately recalculate Sets 2..N in place without blocking modals and mark `calibration_source = SET_1_RECALIBRATED`. Persist baseline under `target_exercise_id` ONLY—leaving `anchor_exercise_id` untouched.
* **Fatigue-Accurate Inter-Set Solver:** Default `decay_rate = 0.045` (compounds) / `0.03` (isolations): $e1\text{RM}_{\text{set }k} = e1\text{RM}_{S1} \cdot (1 - \text{decay\_rate})^{k-1}$. Default mode `REPS_FIRST`: hold `suggested_weight_kg` constant where practical and solve decreasing rep targets for Sets 2..N. **Invariant:** never emit flat weight + flat reps + higher (easier) RIR on Set $k+1$ than Set $k$.
* **Equipment-Aware Rep-Ceiling Expansion (Coarse-Jump Escape Hatch):** If `(next_available_weight - current_weight) / current_weight > 0.075` or hitting `max_dumbbell_kg`, hold current weight and expand `target_rep_max` upward (up to 20 reps).
* **RIR Outlier Damping (Cross-Session Protection):** On already-calibrated lifts (`calibrated_session_count >= 1`), cap single-session upward `estimated_1rm_kg` jumps at `+5%` and reduce update weight by 50% when `logged_reps > 12`. Bypass `+5%` cap on first-time `ANCHOR_PRIOR` calibration.

### REQ-4: Live Fractional Muscle Volume Accounting

* Every completed working set (excluding warm-ups, requiring `RIR <= 4` or working effort) credits `+1.0` to `primary_muscles` and `+0.5` to `secondary_muscles`.
* Aggregate weekly totals by muscle group across all equipment modes.

### REQ-5: Clean Home-Gym Re-Entry & Travel Bridge Classification

* **Re-Entry Prescription:** On returning to `anchor_exercise_id` after 1–3 bridge weeks, prescribe `100%` of the anchor's last pre-travel working load/reps.
* **Travel Bridge Tagging:** Weeks with 0 anchor sets where the parent `slot_id` (or `movement_pattern`) completed $\ge 1$ working set via a substitute exercise classify as `BRIDGE_WEEK` rather than `MISSED_WEEK`.

---

## 5. UI, UX & Progressive Disclosure

- **UI-1:** Location Pill & Environment Bottom Sheet (`Home Gym`, `Hotel / Dumbbells Only`, `Bodyweight / No Equipment`, `Short on time`, private on-device free-text input, scope selector `Today only` / `All Week N`, primary CTA `Adapt This Week's Plan`).
- **UI-2 / UI-2b:** Swapped exercise card shows Tier-1 visible 1-sentence rationale + Tier-2 expandable `"Why this works"` science bullets, `~` estimated weight prefix, anchor reference (`BB 77.5x8`) on Set 1, `Adapts on S1` on Sets 2–N. (Note: Per Treise's Exercise Card decluttering rule, live weekly muscle volume bar renders in `ExerciseDetailModal`, `WeeklyVolumeCard` on Program, `MuscleProgressCard`, and `WorkoutFinishScreen`, keeping only the single sequence `.wk-pill` badge on `ExerciseCard`.)
- **UI-3:** Bodyweight mode replaces `KG` with `SETUP` + `~% BW` estimate (never `0 kg`); rest-bar leverage upgrade chip when Set 1 > 18 reps.
- **UI-4 / UI-4b:** Silent rest-bar recalibration toast on Set-1 recalibration; `LAST AT GYM` re-entry cue after `BRIDGE_WEEK`.
- **UI-5 / UI-5b:** Post-session Continuity Card with win-lever badge (`STIMULUS MATCHED`, `LEVERAGE & EFFORT WIN`, or `CARRYOVER CONFIRMED`) + dual honest status lines; Dual-Layer Progress View with stacked tool volume bars and lightly shaded `"Travel Bridge"` bands on anchor e1RM charts.

---

## 6. Non-Functional, Privacy & Out-of-Scope Boundaries

* Offline-first; zero off-device transmission of AI coach prompts or temporary gym descriptions; synchronous `< 50 ms` Set-1 recalibration and volume accounting.
* Out of scope: Whoop recovery integration, allometric strength-standard tables, account/auth flows.

---

## 7. Automated Verification Plan (Tests 1–8)

1. Barbell-to-Dumbbell Anchor Prior (`REQ-2B`)
2. Immediate Set-1 Recalibration & Fatigue Decay (`REQ-3`)
3. Hotel Dumbbell Cap + Coarse-Jump Rep Expansion (`REQ-3`)
4. Bodyweight Auto-Selection & Light-Load RIR Tightening (`REQ-2C`)
5. Unfamiliar Machine Skips Load Guess (`REQ-2D`)
6. RIR Clamping & Cross-Session Outlier Damping (`REQ-3`)
7. Live Fractional Volume Continuity (`REQ-4`)
8. Overlay Auto-Expiration, Clean Re-Entry & Travel Bridge (`REQ-1`, `REQ-5`)
