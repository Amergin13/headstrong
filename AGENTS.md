# Treise Architecture & Exercise Science Formulas

## 0. Non-Negotiables & Starting Point for All New Work (read first, override everything below)

These rules exist because earlier sessions broke them. Any change that violates one is wrong, even if another section seems to allow it.

1. **Never fabricate data or claims.** No fake users, leaderboard entries, heart rates, sleep, HRV, durations, "simulated" syncs, demo sign-ins, latency numbers or hardware badges in the real app. Missing data is stored as `0`/`undefined` and shown as "—" or an empty state. Sample data appears only after the athlete loads the demo. One exception: a chart for an exercise never logged shows a dimmed shape labelled "Example" (no numbers). One session shows the starting point; `>= 2` show the trend line.
2. **Never put secrets in client code.** OAuth client secrets and API keys live only in Vercel env vars (`WHOOP_CLIENT_SECRET`, `FITBIT_CLIENT_SECRET`, `GEMINI_API_KEY`) and are used only in `api/`. CI fails if `client_secret` appears in `dist/assets`.
3. **Never claim what isn't built.** No "cloud sync", "community", "Bluetooth scale" or hardware claims unless built end to end. `public/privacy.html` must match what the code does.
4. **Safety beats engagement.** Pain, injury or warning-symptom messages always get the fixed reply from `buildSafetyResponse` (stop the movement, swap it, see a professional). The model never answers these.
5. **Respect recovery (advisory, never blocking).** Local muscle recovery (`src/engine/recovery.ts`) and systemic Amber Shield readiness (`src/engine/readiness.ts`) are unified: while Amber Shield is active, local recovery windows scale by `1.2x` so statuses never contradict. The Workout tab shows today's queued session directly with a calm recovery indicator and 1-tap opt-in modulation buttons (trim 1 set/lift or shift to 2–3 RIR), never a blocking rest card.
6. **Weights come from the athlete.** Every generated session goes through `personalizeSessionLoads` (history carry-over, learned strength ratios, onboarding calibration). Never show template weights unscaled.
7. **Store kg, display the athlete's unit.** Use `useUnits()` for every weight shown or typed.
8. **Use local dates** (`localDateString`), never `toISOString().split('T')[0]`.
9. **One source per number (suite 36e):**
   - Weekly hard sets: `calculateWeeklyMuscleVolume` / `calculateWeeklyMuscleVolumeBreakdown` over saved workouts only.
   - Estimated max: `calculateE1RM` with exercise id and movement type.
   - Plan position & names: `getNextProgramWorkoutNumber` / `buildPlanOverview` with `resolveActivePlan` (`planId` per plan; `planWorkoutLabel`). Unstarted sessions not matching the plan's next workout are replaced.
   - Streak: `computeTrainingStreak` from saved workouts (rest gaps `<= 4d` keep it).
   - Workout time: measured from first logged set to finish (or watch time); nothing added for warm-ups.
   - Bodyweight: shown only after a weigh-in (`80 kg` fallback only seeds starting loads; weekly pace needs 7d of weigh-ins).
   - Goal names: `GOAL_DISPLAY_NAME` (Build Muscle, Lose Fat, Stay Lean); internal phase names never appear in UI.
   - Switching kg/lb snaps unstarted session weights to real plate/DB sizes.
10. **Never lose saved data (suite 36f).** Immediate `usePersistedState` saves, cross-tab sync, `runStorageMigrations` (incl. legacy `headstrong_*` keys), quota cache eviction + `SAVE_FAILED_EVENT` in `storage.ts`, and `requestPersistentStorage`. Forms never re-save pre-filled values the athlete didn't enter.
11. **Run `npm run test:engine`, `npm run test:api` and `npx tsc --noEmit -p .` before finishing.** Update tests when behaviour intentionally changes; never weaken a test to hide a regression.
12. **Additive-first; never duplicate engines, context, guidelines, or cards (`CANONICAL_ARCHITECTURE_REGISTRY` in `src/engine/governance.ts`, suite 80):**
    - **One engine per domain:** Extend the canonical owner in the registry below; never create a second engine or calculation module for an existing domain.
    - **One AI guideline & context layer:** Extend `src/engine/contentStrategy.ts`, `src/services/coachPersonalization.ts`, `src/services/coachContext.ts` + `src/services/coachContextEnvelope.ts`, and `src/services/onDeviceModel.ts` + `src/services/deviceModels.ts`; never create parallel AI guidelines or context builders.
    - **One canonical card / drill-in per domain object:** Every related entry point across tabs MUST open the exact same canonical view:
      - Exercise drill-in: `src/components/train/ExerciseDetailModal.tsx` (`buildInspectExerciseSession` / `buildExerciseDetailModel` in `src/services/exerciseDetails.ts`) across Workout (`ExerciseCard`, `CompletedExerciseCard`, upcoming planned day, `PastWorkoutModal`), Program (`PastWorkoutModal`, `SplitEditor`, custom exercises), Progress (Trophy Case, pinned Exercise chart, `StrengthLevelsCard`, `BalanceCard`, `KnowledgeGraphCard`), and Coach.
      - Exercise swap: `src/components/train/ExerciseSwapModal.tsx` (`recommendExerciseSwaps` in `src/engine/progression.ts`).
      - Exercise 2-line summary: `buildGoalDrivenLine1`, `buildGoalDrivenLine2`, `buildSwappedExerciseCopy` (`src/services/exerciseInsight.ts`), reused by `exerciseCoachNote.ts` & `workoutFinish.ts`.
      - Charts & coach prose: `src/components/common/TrendChart.tsx` (`buildExerciseTrendSpec`) and `src/components/common/CoachSummaryText.tsx`.
13. **Use existing Design System components; never introduce a new component without explicit user permission (`DESIGN_SYSTEM_SOURCE_CONTEXT` & `APPROVED_COMPONENT_FILES` in `src/engine/governance.ts`, suite 80):**
    - **Design System source context:** Tokens in `src/styles/tokens.css` & `src/styles/semanticTokens.ts` (zero raw `#hex`/`rgba(...)` in `src/components/`); `.wk-*` primitives & 4-Size (`12/16/20/32px`) × 4-Weight (`400/500/600/700-at-32px`) × 3-Ink (`1.00/0.78/0.60`) typography in `src/index.css`; specs in `TREISE_DESIGN_SYSTEM` (`src/engine/knowledgeGraph.ts`) & `src/designSystem/DesignSystemApp.tsx` (`npm run design-system:sync` → `design-system.html`).
    - **Strict component freeze:** Never create a new file under `src/components/` (or a new `.wk-*` class) without explicit user permission. Compose or extend the 58 approved files in `APPROVED_COMPONENT_FILES` (suite 80 fails CI on any unapproved file).
14. **Every AI feature and functionality must reference and validate against the canonical AI guidelines (`AI_GUIDELINES_SOURCE_CONTEXT` in `src/engine/governance.ts`, suites 79 & 80):**
    - **Canonical AI source context:** `src/engine/contentStrategy.ts` (`VOICE_TONE_MATRIX`, `EXERCISE_BRIEF_BLUEPRINT`, `buildExerciseBriefContractPrompt`, `runReadAloudQaGate`, `runRotContentAudit`), `src/services/coachPersonalization.ts` (`buildSummaryVoiceGuidelines`, `checkSummaryVoiceGuidelines`, `normalizeSummaryVoice`), `src/services/factChecks.ts`, `src/services/coachContext.ts` + `src/services/coachContextEnvelope.ts`, `src/services/onDeviceModel.ts` + `src/services/deviceModels.ts` + `src/services/geminiFlashLite.ts`, and `src/services/coachTools.ts`.
    - All 6 AI surfaces (`exerciseCoachNote.ts`, `identityMessage.ts`, `workoutFinish.ts`, `progressOverview.ts`, `compositionOverview.ts`, `aiAssistantService.ts`) and any new AI functionality must import these guidelines, render a deterministic fact fallback first, and pass `runReadAloudQaGate` + `checkSummaryVoiceGuidelines`.

### Starting Point for All New Work (Mandatory Pre-Flight Protocol)

1. **Locate canonical owner (Rule #12):** Check `CANONICAL_ARCHITECTURE_REGISTRY` below before editing; extend the registered module rather than creating a new file.
2. **Check Design System & component freeze (Rule #13):** For UI changes, use tokens/classes from `tokens.css` + `index.css` and existing components in `APPROVED_COMPONENT_FILES`; never create a new component without user permission, and run `npm run design-system:sync`.
3. **Check AI guidelines & gates (Rule #14):** For AI/copy work, wire `contentStrategy.ts` + `coachPersonalization.ts` + `factChecks.ts` with a deterministic fact fallback.
4. **Verify before finishing (Rule #11):** Run `npm run design-system:sync`, `npx tsc --noEmit -p .`, `npm run test:engine` (all 80 suites), and `npm run test:api`. Keep `AGENTS.md <= 23,750` bytes so `<user_rules>` never truncates it.

### Canonical Architecture Registry (Single Owner Per Domain)

| Domain | Kind | Canonical Module(s) | Additive Rule |
| :--- | :--- | :--- | :--- |
| E1RM & load multipliers | Engine | `src/engine/e1rm.ts` | Extend here; never re-implement Epley/DB/RDL/calisthenic math. |
| Double progression & load carry-over | Engine | `src/engine/progressionRules.ts`, `src/engine/progression.ts`, `src/engine/loadPersonalization.ts` | Extend shared rules, load personalization & `recommendExerciseSwaps`. |
| Cross-environment continuity | Engine | `src/engine/continuityEngine.ts` | Extend anchor bridging, travel/home conversion & gym reentry here. |
| Hypertrophy volume landmarks | Engine | `src/engine/hypertrophyVolume.ts`, `src/services/storage.ts` | Use `calculateWeeklyMuscleVolume` / `calculateWeeklyMuscleVolumeBreakdown`. |
| Local muscle recovery & readiness | Engine | `src/engine/recovery.ts`, `src/engine/readiness.ts` | Extend unified recovery + Amber Shield logic here. |
| Strength standards & symmetry | Engine | `src/engine/kilgoreStandards.ts`, `src/engine/strengthStandards.ts`, `src/services/movementStandards.ts` | Authoritative tables & balance checks live only here. |
| Personal knowledge graph | Engine | `src/engine/knowledgeGraph.ts` | Extend athlete graph, `TREISE_DESIGN_SYSTEM` & science KB here. |
| AI content guidelines & voice | AI Guideline | `src/engine/contentStrategy.ts`, `src/services/coachPersonalization.ts`, `src/services/factChecks.ts` | Build additively on `EXERCISE_BRIEF_BLUEPRINT`, `runReadAloudQaGate` & `buildSummaryVoiceGuidelines`. |
| AI context & model transport | AI Context | `src/services/coachContext.ts`, `src/services/coachContextEnvelope.ts`, `src/services/onDeviceModel.ts`, `src/services/deviceModels.ts` | Add screen hooks to `coachContext.ts`, signals to `coachContextEnvelope.ts`, inference to `onDeviceModel.ts`. |
| 2-line exercise summary | Engine / AI | `src/services/exerciseInsight.ts`, `src/services/exerciseCoachNote.ts` | Share `buildGoalDrivenLine1`, `buildGoalDrivenLine2`, `buildSwappedExerciseCopy`. |
| Exercise drill-in modal & model | UI Surface | `src/components/train/ExerciseDetailModal.tsx`, `src/services/exerciseDetails.ts` | Single exercise drill-in across Workout, Program, Progress & Coach via `buildInspectExerciseSession`. |
| Exercise swap modal | UI Surface | `src/components/train/ExerciseSwapModal.tsx` | Single swap UI backed by `recommendExerciseSwaps`. |
| Exercise card & trend chart | UI Surface | `src/components/train/ExerciseCard.tsx`, `src/components/common/TrendChart.tsx`, `src/components/common/CoachSummaryText.tsx` | Reuse canonical cards/charts/prose across surfaces; never clone variants. |

---

## 1. Core Exercise Science Formulas

### 1.1 RIR-Adjusted Estimated 1-Rep Max (`src/engine/e1rm.ts`)
Restricted to sets logged at `<= 3 RIR` (`0` above 3 RIR) with RIR credit halved above 12 reps (Halperin et al., 2022):
$$\text{E1RM} = \text{Effective Weight} \times \left(1 + \frac{\min(\text{Reps} + \text{EffectiveRIR},\, 15)}{30}\right)$$
- **Calisthenics:** Weighted/BW: $\text{Effective Weight} = \text{EMA}_{7\text{d BW}} + \text{External Load}$ (`1.00` BW ratio for pull-ups/chin-ups/dips; `0.64` push-ups). Assisted (`isAssisted`): $\max(5, \text{EMA}_{7\text{d BW}} - \text{Assistance Load})$.
- **Dumbbell (`1.18x`) & RDL (`1.20x`):** Paired 2-DB lifts (`usesTwoDumbbells`) log/display weight **per dumbbell** (`24 kg`), while tonnage, WCI, and E1RM use `2 × 24 = 48 kg` (`× 1.18`). Single-DB (`usesOneDumbbell`) uses `1 ×` DB weight. RDLs multiply by `1.20`.

### 1.2 7-Day Bodyweight EMA (`src/engine/ema.ts`) & 1.3 DOTS (`src/engine/dots.ts`)
$$\text{EMA}_{\text{today}} = 0.25 \cdot W_{\text{today}} + 0.75 \cdot \text{EMA}_{\text{yesterday}}, \quad \text{DOTS} = \text{E1RM}_{\text{kg}} \cdot \frac{500}{A w^4 + B w^3 + C w^2 + D w + E}$$
Male: $A=-1.093\times 10^{-6}, B=7.391293\times 10^{-4}, C=-0.1918759221, D=24.0900756, E=-307.75076$. Female: $A=-1.0706\times 10^{-6}, B=5.158568\times 10^{-4}, C=-0.1126655495, D=13.6175032, E=-57.96288$.

### 1.4 Strength Standards, Balance & Symmetry (`kilgoreStandards.ts`, `strengthStandards.ts`, `movementStandards.ts`)
- **Squat, Hinge, Horizontal Push, Vertical Push:** Kilgore (ExRx.net) tables by sex, BW class, and age group (`18–39`, `40–49`, `50–59`, `60–69` when `ageEntered`). **Vertical Pull (Chin-Up):** Poliquin (1999) `81%` of bench for men; `~105%` caveated guideline for women. **Horizontal Pull (Rows):** no published standard.
- **4 Sub-Divisions (`I–IV`):** $\Delta = (\text{Threshold}_{T+1} - \text{Threshold}_{T})/4$. **Tested** = `STANDARD_TEST_EXERCISE` at `<= 5` reps; else **Estimated**.
- **Imbalances:** Chin-up `< 90%` of Poliquin ratio → pull behind push; `>= 4` sub-levels between Kilgore lifts → level gap; unilateral L/R `< 90%` over last 3 sessions → flagged (Grindem et al., 2016).

---

## 2. Biometric Integration, Progression & AI Coach

### 2.1 Daily Readiness Z-Score (`src/engine/readiness.ts`)
$$\text{Readiness Score} = 0.50 \cdot Z_{\text{HRV}} - 0.30 \cdot Z_{\text{RHR}} + 0.20 \cdot \left(\frac{\text{Sleep}_{\text{hours}} - 7.5}{1.5}\right)$$
- **Primed ($Z \ge +0.8$)** | **Normal ($-0.8 < Z < +0.8$)** | **Amber Shield ($Z \le -0.8$, HRV down $>15\%$, RHR $\ge +4\text{ bpm}$, or Sleep $< 6\text{h}$):** Advisory buffer; scales local recovery windows by `1.2x`, holds load, shifts target RIR to `2–3`, protects streak.

### 2.2 Double Progression (`src/engine/progressionRules.ts`, `src/engine/progression.ts`)
1. **Top of rep range hit on all working sets at quality RIR (`>= 1`, or `0` on failure sets):** Barbell/cable/machine `+2.5 kg` (`+5 lb`); dumbbell `+1.0 kg/DB` (`+2 kg` pair; `+5 lb`); reset reps to `minReps` (jump capped at `+10% + 1 step`).
2. **Within rep range (all sets `>= minReps`):** Hold load; `+1 rep` on up to two sets short of `maxReps`.
3. **Below rep range (any set `< minReps`):** Reduce load by `>= 1` step (Epley capacity) and reset reps to `minReps`.
4. **Amber Shield active:** Hold load and reps static; shift target RIR to `2–3`.

### 2.3 Work Capacity Index (`src/engine/wci.ts`) & 2.4 Engine Vitality (`src/engine/vitality.ts`)
$$\text{WCI} = \frac{\sum (\text{Weight} \times \text{Reps})}{\text{Duration (min)} \times (1 + \max(0.35,\; \text{Avg Session HRR}\%))}, \quad \text{Vitality} = 0.40 \cdot S_{\text{VO2Max}} + 0.30 \cdot S_{\text{RHR}} + 0.30 \cdot S_{\text{Steps}}$$

### 2.5 AI Coach & 6 Governed AI Content Surfaces
- **Transport:** On-device Gemini Nano (`LanguageModel`) when `available`, plus stateless fallback (`src/services/geminiFlashLite.ts` → `/api/coach/generate` `gemini-3.5-flash-lite`), falling back to deterministic `coachAnswers.ts` offline.
- **21 Deterministic OOUX Tools (`src/services/coachTools.ts`):** All plan/workout/profile/goal/logging mutations execute deterministically with `CoachStateDiff` receipts, HITL confirmations for destructive actions, and 1-tap Undo.
- **6 Governed AI Surfaces:** (1) Exercise 2-line brief (`exerciseCoachNote.ts` + `exerciseInsight.ts`, `EXERCISE_BRIEF_BLUEPRINT`: Line 1 = Overall Progress Against Goals in concrete kg/lb; Line 2 = Today's Action → Goal Outcome; zero table/tempo/rest/weekly-set duplication), (2) Program identity message (`identityMessage.ts`), (3) Workout finish summary (`workoutFinish.ts`), (4) Progress goals overview (`progressOverview.ts`), (5) Body composition insight (`compositionOverview.ts`), (6) AI Coach chat (`aiAssistantService.ts`). Every surface enforces `runReadAloudQaGate`, `checkSummaryVoiceGuidelines`, and `factChecks.ts`.

---

## 3–11. Volume Landmarks, 6-Week Plans, IA & Shift Nudge Design System

- **Goal Phases:** Build Muscle (`Lean Bulk`: `MEV → MAV → MRV → Deload`), Lose Fat (`Cut / Recomp`: `~85%` volume cap `2–3` sets, heavy tension, **Retention Shield**), Stay Lean (`Maingain`: steady MAV).
- **Volume Landmarks (`src/engine/hypertrophyVolume.ts`, sets/wk [MV/MEV/MAV/MRV, recovery]):** Lateral Delts `6/8/16–26/30+ (24h)`, Calves `6/8/16–24/28+ (24h)`, Rear Delts `6/8/14–22/26+ (36h)`, Back `8/10/14–22/25+ (48h)`, Chest `4/8/12–18/20 (60h)`, Quads `4/6/12–18/20 (60h)`, Hamstrings `4/6/10–16/18 (72h)`, Triceps `4/6/10–16/18 (48h)`, Biceps `4/6/12–18/22 (36h)`, Glutes `2/4/10–16/20 (48h)`, Front Delts `0/0/4–8/12 (48h)`, Core `0/4/8–16/20 (36h)`. Direct = `1.0`, synergist = `0.5`, warmups excluded.
- **6-Week Plans (`trainingPlans.ts`, `starterPlan.ts`):** 24 sessions (4/wk × 6 wks; Kaushal & Rhodes, 2015). `starter_6wk` (3 full-body + 1 active day/wk), `starter_4day` (4 Upper/Lower/wk), owner-only `muscle_building_6wk` (`canUseMusclePlan`). Active days (`20+ min` deliberate exercise in `treise_activities_v1`; steps never count as workouts) fill active slots without altering lifting volume/E1RM.
- **Android TWA Bridges:** `HealthConnectBridge.kt` (`READ_EXERCISE`) & `ScaleBridge.kt` (ES-CS20M `0x55AA` BLE in `renphoBluetooth.ts`). Build Android releases exclusively via `./gradlew bundleRelease` (never `bubblewrap build/update`).
- **4-Page IA & Clean Slate:** Bottom nav: **Workout** (`TrainTab.tsx` — invariant `SET | PREV | WEIGHT | REPS | RIR | DONE` table, 2-line brief, `TrendChart`, advisory recovery, `WorkoutFinishScreen.tsx`), **Program** (`ProgramTab.tsx` / `ProgramPlanView.tsx` — 3D `IdentityForm` sphere, phases 1–3, `PastWorkoutModal`, Settings), **AI Coach** (`AICoachChatModal.tsx` fly-up sheet + `"Ask Treise"` triggers), **Progress** (`AnalyticsTab.tsx` — `GoalsHero` rings, Trophy Case, totals, Weight & 12-site tape, `StrengthLevelsCard`, `BalanceCard`, `KnowledgeGraphCard`). Zero dummy data (`NEW_USER_PROFILE`); no Athlete tab, XP, levels, or leaderboards.
- **Apple HIG × Shift Nudge Design System (`src/styles/tokens.css`, `src/index.css`, `TREISE_DESIGN_SYSTEM`):**
  - **4 Sizes × 4 Weights × 3 Inks (`Inter` `tabular-nums`):** `12px` (`text-xs`: `.wk-label`, `.wk-meta-title`, `.wk-pill`, `.wk-segment`, `.wk-caption`), `16px` (`text-base`: `.wk-button`, `.wk-subhead`, `.wk-btn-secondary`, `.wk-field`, `.wk-body`), `20px` (`text-xl`: `.wk-title`, `.wk-h1`, `.wk-nav-title`, `.wk-number`, `.wk-input`), `32px` (`text-3xl`: `.wk-page-title`, `.wk-display`). Weights: `400/500/600/700` (700 only at 32px; 800/900 banned). Inks: `--color-text-primary` (`1.00`), `--color-text-secondary` (`0.78`), `--color-text-muted` (`0.60`, all `>= 4.5:1` AA).
  - **Case & Controls:** Sentence case (`formatSentenceCase`) default; uppercase (`.wk-label`) only for 1–3 word eyebrows/headers. `.wk-pill` is strictly for non-interactive badges (never on `<button>`); buttons use `.wk-button` (`#FFFFFF` on `#13181C`) or `.wk-btn-secondary` (`#44494C`). Mint (`#00F19F`) = positive progress/completed sets; Telemetry Blue (`#8FD3FF`) = informational biometrics.

---

## 12. System Evaluation: Strengths, Weaknesses, Opportunities & Risks (SWOT)

Codified in `SYSTEM_SWOT_EVALUATION` (`src/engine/governance.ts`) and detailed in `CONTINUOUS_GOVERNANCE_GUIDE.md`:

| Dimension | Finding | Active Mitigation / Next Step |
| :--- | :--- | :--- |
| **Strength 1** | **Deterministic Exercise Science:** E1RM (`1.18x` DB, `1.20x` RDL), Double Progression, Continuity, Volume Landmarks (`0.5x` synergist), Recovery + Amber Shield, and Kilgore/Poliquin standards are single-source (80 suites). | Keep formula updates additive inside their canonical engine owner. |
| **Strength 2** | **Zero-Hallucination Hybrid AI:** All 6 AI surfaces pair Gemini Nano / `gemini-3.5-flash-lite` with fact fallbacks (`buildGoalDrivenLine1/Line2`), `factChecks.ts`, `runReadAloudQaGate`, and 21 undo-safe tools (`coachTools.ts`). | Require every AI feature to import `contentStrategy.ts` + `coachPersonalization.ts`. |
| **Strength 3** | **Locked Shift Nudge Design System & Canonical UI:** 4-Size × 4-Weight × 3-Ink typography, semantic tokens, invariant table headers, and canonical `ExerciseDetailModal` / `ExerciseSwapModal` / `TrendChart` prevent UI drift. | Enforce `APPROVED_COMPONENT_FILES` freeze and `npm run design-system:sync`. |
| **Strength 4** | **Local-First Resilience & Privacy:** Immediate `usePersistedState` writes, cross-tab sync, quota eviction + `SAVE_FAILED_EVENT`, v10 migrations, and zero server storage of health data. | Maintain Suite 36f storage resilience tests and bundle secret scans. |
| **Weakness 1** | **Historical Rule Truncation & Doc Drift (Resolved):** `AGENTS.md` was 99.3 KB (truncating 76% in `<user_rules>`), and legacy docs had pre-Shift-Nudge/Bubblewrap references. | Enforce `AGENTS.md <= 23,750` bytes in Suite 80 so 100% of rules load untruncated. |
| **Weakness 2** | **Large Orchestrator Files:** `App.tsx`, `TrainTab.tsx`, `aiAssistantService.ts`, `knowledgeGraph.ts`, and `verifyEngine.ts` have high line counts. | Extract pure service view-models (`exerciseDetails.ts`) and modular `*.suite.ts` files. |
| **Weakness 3** | **Single-Device LocalStorage Boundary:** Clearing browser site data without a JSON backup export loses local history. | Call `requestPersistentStorage` and surface 1-tap JSON backup export in Settings. |
| **Weakness 4** | **Cross-Gym Machine Pulley Variance:** Uncalibrated cable/machine stacks vary (`1:1` vs `2:1`), preventing exact kg transfer on first swap. | Use `EFFORT_ONLY` opening-set calibration copy and auto-recalibrate after Set 1 RIR. |
| **Opportunity 1** | **Zero-Knowledge Encrypted Backup:** Optional client-side encrypted backup/restore on top of `storage.ts` JSON serialization. | Extend `exportAllData` / `importAllData` additively without server plaintext. |
| **Opportunity 2** | **Google Health Web OAuth Proxy:** Restore direct web Fitbit/Pixel sync in `api/` alongside native Android `HealthConnectBridge.kt`. | Add stateless OAuth exchange in `api/` with secrets solely in Vercel env vars. |
| **Opportunity 3** | **Cycle-Over-Cycle Block Analytics:** Compare 6-week Cycle 1 vs Cycle 2 strength/volume inside `ProgressChartCard` & `ExerciseDetailModal`. | Reuse canonical `TrendChart` and `buildExerciseInsight` without new chart components. |
| **Opportunity 4** | **Continued Test Suite Modularization:** Extract remaining inline suites from `verifyEngine.ts` into focused `*.suite.ts` files. | Follow the Suite 76–80 modular import pattern. |
| **Risk 1** | **Upstream LLM Drift (`gemini-3.5-flash-lite` / Nano):** Model updates can shift phrasing, echo prompts, or invent figures. | Pre-render gates (`factChecks.ts`, `runReadAloudQaGate`, `checkSummaryVoiceGuidelines`) reject bad outputs. |
| **Risk 2** | **Component & Engine Sprawl:** Unchecked feature work could spawn duplicate modals, off-scale classes, or parallel calculators. | Enforce `CANONICAL_ARCHITECTURE_REGISTRY`, `APPROVED_COMPONENT_FILES`, and Suites 47, 79, 80. |
| **Risk 3** | **Android TWA Bridge Overwrite:** Running `bubblewrap update/build` deletes native `HealthConnectBridge.kt` and `ScaleBridge.kt`. | Build exclusively with `./gradlew bundleRelease` and gate on `npm run verify:playstore`. |
| **Risk 4** | **Wearable API Outages / Rate Limits:** Upstream Whoop/Google Health failures could interrupt readiness sync. | Degrade gracefully to local muscle recovery (`recovery.ts`) and advisory readiness. |
