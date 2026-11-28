export type FlowLaneId =
  | 'onboarding'
  | 'workout'
  | 'program'
  | 'coach'
  | 'progress'
  | 'platform';

export type FlowTone = 'info' | 'mint' | 'copper' | 'amber';

export interface FlowSectionSpec {
  id: FlowLaneId;
  code: string;
  title: string;
  subtitle: string;
  tone: FlowTone;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MiniPreviewKind =
  | 'launch'
  | 'goal-pills'
  | 'equipment'
  | 'sync'
  | 'queued'
  | 'set-table'
  | 'amber-banner'
  | 'detail-chart'
  | 'swap-card'
  | 'finish-pr'
  | 'sphere-plan'
  | 'volume-bars'
  | 'active-day'
  | 'coach-diff'
  | 'safety-gate'
  | 'goal-ring'
  | 'radar-balance'
  | 'telemetry-privacy';

export interface FlowNodeSpec {
  id: string;
  laneId: FlowLaneId;
  stepCode: string;
  title: string;
  summary: string;
  surfaceTag: string;
  sourceModule: string;
  engineRule: string;
  telemetryEvents: string[];
  preview: MiniPreviewKind;
  tone: FlowTone;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PortSide = 'left' | 'right' | 'top' | 'bottom';

export interface FlowEdgeSpec {
  id: string;
  from: string;
  to: string;
  fromPort: PortSide;
  toPort: PortSide;
  laneId: FlowLaneId;
  tone: FlowTone;
  label?: string;
  dashed?: boolean;
}

export const BOARD_WIDTH = 2640;
export const BOARD_HEIGHT = 3320;
export const NODE_WIDTH = 304;
export const NODE_HEIGHT = 216;
export const MIN_ZOOM = 0.28;
export const MAX_ZOOM = 1.6;

export const FLOW_SECTIONS: FlowSectionSpec[] = [
  {
    id: 'onboarding',
    code: 'FLOW 01',
    title: 'First launch, onboarding & load calibration',
    subtitle: 'Cold start or returning install → clean slate migration → goal, place & equipment → scaled Day 1 workout queued',
    tone: 'info',
    x: 80,
    y: 80,
    width: 2480,
    height: 360,
  },
  {
    id: 'workout',
    code: 'FLOW 02',
    title: 'Daily workout execution, drill-ins & scientific swaps',
    subtitle: 'Advisory readiness → invariant SET | PREV | WEIGHT | REPS | RIR | DONE logging → drill-in / 304-lift swap / travel overlay → finish & double progression',
    tone: 'mint',
    x: 80,
    y: 504,
    width: 2480,
    height: 888,
  },
  {
    id: 'program',
    code: 'FLOW 03',
    title: '6-week program lifecycle, active days & cycle graduation',
    subtitle: '3D IdentityForm sphere & MV/MEV/MAV/MRV landmarks → deliberate 20+ min active days → AI adaptation carousel → 24/24 cycle rollover',
    tone: 'mint',
    x: 80,
    y: 1456,
    width: 2480,
    height: 360,
  },
  {
    id: 'coach',
    code: 'FLOW 04',
    title: 'Agentic AI Coach, safety circuit-breaker & OOUX undo loop',
    subtitle: 'Contextual Ask Treise triggers → 3-tier ContextEnvelope → deterministic safety gate → 21 OOUX tools → fact gates, diff receipt & 1-tap Undo',
    tone: 'copper',
    x: 80,
    y: 1880,
    width: 2480,
    height: 360,
  },
  {
    id: 'progress',
    code: 'FLOW 05',
    title: 'Progress analytics, strength standards & body composition',
    subtitle: '192px Goals Hero rings → Kilgore & Poliquin allometric levels + L/R symmetry → Personal Knowledge Graph → BLE scale & 12-site tape',
    tone: 'info',
    x: 80,
    y: 2304,
    width: 2480,
    height: 360,
  },
  {
    id: 'platform',
    code: 'FLOW 06',
    title: 'Wearable bridges, GSM telemetry & zero-loss data portability',
    subtitle: 'iOS HealthKit, Android Health Connect, Whoop v2 & Strava → Readiness Z-score → PII-free custom metrics → 1-tap JSON backup & hard erase',
    tone: 'amber',
    x: 80,
    y: 2728,
    width: 2480,
    height: 360,
  },
];

export const FLOW_NODES: FlowNodeSpec[] = [
  // ================= FLOW 01: ONBOARDING =================
  {
    id: 'n-1-launch',
    laneId: 'onboarding',
    stepCode: '1.1',
    title: 'App launch & clean slate',
    summary: 'Runs v10 storage migrations, requests persistent storage, and boots zero-dummy NEW_USER_PROFILE.',
    surfaceTag: 'Bootstrap',
    sourceModule: 'src/App.tsx · src/services/storage.ts',
    engineRule: 'Rule #1 & #10: Zero fabricated athlete metrics; legacy keys migrate automatically with cross-tab sync.',
    telemetryEvents: ['onboarding.started'],
    preview: 'launch',
    tone: 'info',
    x: 120,
    y: 176,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-1-goal',
    laneId: 'onboarding',
    stepCode: '1.2',
    title: 'Goal, unit & baseline',
    summary: 'Selects Build Muscle, Lose Fat, or Stay Lean, preferred kg/lb unit, optional age, and starting weigh-in.',
    surfaceTag: 'OnboardingModal',
    sourceModule: 'src/components/onboarding/OnboardingModal.tsx',
    engineRule: 'Rule #7 & #9: Stores kg internally, displays athlete unit, and maps internal phases via GOAL_DISPLAY_NAME.',
    telemetryEvents: ['goal.phase_changed', 'bodyweight.logged'],
    preview: 'goal-pills',
    tone: 'info',
    x: 520,
    y: 176,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-1-place',
    laneId: 'onboarding',
    stepCode: '1.3',
    title: 'Place, gear & 6-week plan',
    summary: 'Picks Gym, Home (bench, DBs, TRX, bar, bands), or Bodyweight and assigns 3-day + active or 4-day plan.',
    surfaceTag: 'OnboardingModal',
    sourceModule: 'src/engine/trainingPlans.ts · starterPlan.ts',
    engineRule: 'Rule #9: 24-session 6-week structure (4x/wk) anchored to Kaushal & Rhodes (2015) habit formation.',
    telemetryEvents: ['environment.location_switched', 'program.selected'],
    preview: 'equipment',
    tone: 'info',
    x: 920,
    y: 176,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-1-sync',
    laneId: 'onboarding',
    stepCode: '1.4',
    title: 'History, maxes & health sync',
    summary: 'TrainHeroic (.zip, CSV, JSON, Lift History), Hevy, Strong, FitNotes, or 1RM sheet import plus Apple Health / Health Connect / Whoop.',
    surfaceTag: 'Import / Health',
    sourceModule: 'src/services/competitorCsvImport.ts · ImportProgramModal.tsx',
    engineRule: 'Unpacks TrainHeroic .zip locally, documents exact 1RMs & heaviest sets across 304 exercises, and flags combined 2-DB loads.',
    telemetryEvents: ['onboarding.import_used', 'wearable.sync_completed'],
    preview: 'sync',
    tone: 'info',
    x: 1320,
    y: 176,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-1-queued',
    laneId: 'onboarding',
    stepCode: '1.5',
    title: 'Calibrated Day 1 queued',
    summary: 'Scales every working weight via personalizeSessionLoads and opens Workout 1 ready to lift.',
    surfaceTag: 'Workout Tab',
    sourceModule: 'src/engine/loadPersonalization.ts · sessionPreparation.ts',
    engineRule: 'Rule #6: Template weights never render unscaled; history, strength ratios, and unit plate-snapping apply first.',
    telemetryEvents: ['onboarding.completed', 'workout.session_queued'],
    preview: 'queued',
    tone: 'mint',
    x: 1720,
    y: 176,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-1-demo',
    laneId: 'onboarding',
    stepCode: '1.6',
    title: 'Opt-in demo sandbox',
    summary: 'Loads clearly labelled sample athlete data only when explicitly requested; 1-tap banner exits cleanly.',
    surfaceTag: 'Demo Mode',
    sourceModule: 'src/services/seedData.ts (SAMPLE_DEMO_PROFILE)',
    engineRule: 'Rule #1: Sample history never mixes with real athlete storage and clears completely on exit.',
    telemetryEvents: ['onboarding.demo_loaded'],
    preview: 'launch',
    tone: 'amber',
    x: 2120,
    y: 176,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },

  // ================= FLOW 02: DAILY WORKOUT =================
  {
    id: 'n-2-amber',
    laneId: 'workout',
    stepCode: '2.1A',
    title: 'Advisory recovery & Amber Shield',
    summary: 'Unifies local muscle recovery (1.2x window) with HRV/RHR/sleep readiness; offers 1-tap set or RIR modulation.',
    surfaceTag: 'RecoveryScoreCard',
    sourceModule: 'src/engine/recovery.ts · readiness.ts',
    engineRule: 'Rule #5: Advisory, never blocking—never hides today’s workout behind a mandatory rest gate.',
    telemetryEvents: ['workout.recovery_modulated'],
    preview: 'amber-banner',
    tone: 'amber',
    x: 520,
    y: 592,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-detail',
    laneId: 'workout',
    stepCode: '2.2A',
    title: 'Canonical exercise drill-in',
    summary: 'Opens muted looping form clip, Best-Set TrendChart, muscle contribution (1.0x / 0.5x), and plate calculator.',
    surfaceTag: 'ExerciseDetailModal',
    sourceModule: 'src/components/train/ExerciseDetailModal.tsx',
    engineRule: 'Rule #12: Exact same ExerciseDetailModal opens across Workout, Program, Progress, and AI Coach.',
    telemetryEvents: ['exercise.detail_opened', 'exercise.plate_calc_opened'],
    preview: 'detail-chart',
    tone: 'info',
    x: 920,
    y: 592,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-queue',
    laneId: 'workout',
    stepCode: '2.1',
    title: 'Queued session & place bar',
    summary: 'Displays next planned workout (1..24), target muscle readiness, environment switcher, and 1-tap overflow menu.',
    surfaceTag: 'TrainTab',
    sourceModule: 'src/components/train/TrainTab.tsx',
    engineRule: 'Rule #9: Unstarted sessions out of sync with getNextProgramWorkoutNumber are automatically refreshed.',
    telemetryEvents: ['workout.session_queued'],
    preview: 'queued',
    tone: 'mint',
    x: 120,
    y: 856,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-logging',
    laneId: 'workout',
    stepCode: '2.2',
    title: 'Invariant set logging table',
    summary: 'Logs SET | PREV | WEIGHT | REPS | RIR | DONE with Exercise 2-line brief and inline Best-Set trend sparkline.',
    surfaceTag: 'ExerciseCard · SetRow',
    sourceModule: 'src/components/train/ExerciseCard.tsx · SetRow.tsx',
    engineRule: 'Pending sets use calm slate ink; tapping Done snaps to high-contrast primary ink + precision Mint check.',
    telemetryEvents: ['workout.started', 'workout.set_completed'],
    preview: 'set-table',
    tone: 'mint',
    x: 520,
    y: 856,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-rest',
    laneId: 'workout',
    stepCode: '2.3',
    title: 'Rest timer & live PR check',
    summary: 'Starts session clock on first logged set, triggers RestTimerModal, and celebrates verified E1RM personal bests.',
    surfaceTag: 'RestTimerModal',
    sourceModule: 'src/components/common/RestTimerModal.tsx · e1rm.ts',
    engineRule: 'Rule #9 & §1.1: Workout duration runs strictly from Set 1 to Finish; E1RM requires <= 3 RIR.',
    telemetryEvents: ['workout.pr_achieved', 'workout.rest_timer_used'],
    preview: 'set-table',
    tone: 'mint',
    x: 920,
    y: 856,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-finish',
    laneId: 'workout',
    stepCode: '2.4',
    title: 'Workout finish celebration',
    summary: 'Summarizes elapsed minutes, tonnage, Work Capacity Index, PRs, Whoop/Health HR, and governed AI takeaway.',
    surfaceTag: 'WorkoutFinishScreen',
    sourceModule: 'src/components/train/WorkoutFinishScreen.tsx · workoutFinish.ts',
    engineRule: 'Rule #14: AI summary passes checkWorkoutSummary + runReadAloudQaGate with deterministic fallback.',
    telemetryEvents: ['workout.completed', 'workout.duration_minutes'],
    preview: 'finish-pr',
    tone: 'mint',
    x: 1520,
    y: 856,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-advance',
    laneId: 'workout',
    stepCode: '2.5',
    title: 'Double progression & rollover',
    summary: 'Updates isolated ExerciseProgressionState (+2.5 kg BB / +1 kg DB or +1 rep) and queues next plan workout.',
    surfaceTag: 'Progression Engine',
    sourceModule: 'src/engine/progression.ts · progressionRules.ts',
    engineRule: '§2.2: All sets hitting maxReps at quality RIR add 1 load step and reset reps to minReps.',
    telemetryEvents: ['program.workout_advanced'],
    preview: 'queued',
    tone: 'mint',
    x: 2040,
    y: 856,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-swap',
    laneId: 'workout',
    stepCode: '2.2B',
    title: 'Scientific exercise swap (304)',
    summary: 'Ranks replacements by role fidelity, joint plane, biarticular stretch, contraindictions & Amber stability.',
    surfaceTag: 'ExerciseSwapModal',
    sourceModule: 'src/services/swapRecommendations.ts · ExerciseSwapModal.tsx',
    engineRule: 'Offers Swap for today only vs Swap permanently in plan; preserves original lift progression curve.',
    telemetryEvents: ['exercise.swap_opened', 'exercise.swap_applied'],
    preview: 'swap-card',
    tone: 'mint',
    x: 920,
    y: 1120,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-2-overlay',
    laneId: 'workout',
    stepCode: '2.2C',
    title: 'Travel / hotel DB continuity',
    summary: 'Applies temporary EnvironmentOverlay (bodyweight leverage tier or capped DBs) with Set-1 RIR auto-calibration.',
    surfaceTag: 'Continuity Engine',
    sourceModule: 'src/engine/continuityEngine.ts',
    engineRule: 'Logs BRIDGE_WEEK continuity so returning to the gym surfaces pre-travel reference loads cleanly.',
    telemetryEvents: ['environment.overlay_applied'],
    preview: 'swap-card',
    tone: 'info',
    x: 1400,
    y: 1120,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },

  // ================= FLOW 03: 6-WEEK PROGRAM =================
  {
    id: 'n-3-overview',
    laneId: 'program',
    stepCode: '3.1',
    title: 'Program hub & Identity sphere',
    summary: 'Visualizes 6-week momentum via 3D IdentityForm sphere, Phase 1–3 timeline (1..24), and governed plan brief.',
    surfaceTag: 'ProgramTab',
    sourceModule: 'src/components/program/ProgramPlanView.tsx · identityMessage.ts',
    engineRule: 'Rule #9 & #14: Plan position uses buildPlanOverview; brief validates via checkIdentityMessage.',
    telemetryEvents: ['navigation.tab_viewed'],
    preview: 'sphere-plan',
    tone: 'mint',
    x: 120,
    y: 1552,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-3-volume',
    laneId: 'program',
    stepCode: '3.2',
    title: 'Volume landmarks & imports',
    summary: 'Tracks weekly hard sets vs MV/MEV/MAV/MRV, switches Goal Phase, or imports spreadsheet / custom splits.',
    surfaceTag: 'WeeklyVolumeCard',
    sourceModule: 'src/engine/hypertrophyVolume.ts · ImportProgramModal.tsx',
    engineRule: '§3: Direct sets count 1.0x, synergists 0.5x, warmups excluded; Cut caps volume at ~85% Retention Shield.',
    telemetryEvents: ['program.imported_spreadsheet', 'program.changed'],
    preview: 'volume-bars',
    tone: 'mint',
    x: 560,
    y: 1552,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-3-active',
    laneId: 'program',
    stepCode: '3.3',
    title: 'Deliberate active day slot',
    summary: 'Logs 20+ min cardio/sport manually or via Strava / Apple Health / Health Connect to complete active slots.',
    surfaceTag: 'ActiveDayCard',
    sourceModule: 'src/engine/activeDays.ts · LogActivityModal.tsx',
    engineRule: '§3: Passive daily steps never count as workouts; active days never alter lifting volume or E1RM.',
    telemetryEvents: ['activity.active_day_logged'],
    preview: 'active-day',
    tone: 'info',
    x: 1000,
    y: 1552,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-3-adapt',
    laneId: 'program',
    stepCode: '3.4',
    title: 'Adaptation carousel & history',
    summary: 'Surfaces 1-tap program fixes (pull/push balance, MEV gaps) and PastWorkoutModal session inspection/editing.',
    surfaceTag: 'ProgramAdaptationCarousel',
    sourceModule: 'src/services/coachInterventions.ts · PastWorkoutModal.tsx',
    engineRule: 'All permanent overrides store structured ProgramOverride records with reversible state.',
    telemetryEvents: ['program.override_saved', 'workout.past_edited'],
    preview: 'coach-diff',
    tone: 'copper',
    x: 1440,
    y: 1552,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-3-graduate',
    laneId: 'program',
    stepCode: '3.5',
    title: '24/24 cycle graduation',
    summary: 'Celebrates completing all 24 sessions and starts a new 6-week block carrying every learned E1RM forward.',
    surfaceTag: 'Cycle Rollover',
    sourceModule: 'src/engine/muscleBuildingProgram.ts',
    engineRule: 'Records planCycleStarts[planId] so Cycle 2 begins at Workout 1 without losing historical PRs.',
    telemetryEvents: ['program.completed', 'program.cycle_restarted'],
    preview: 'finish-pr',
    tone: 'mint',
    x: 1960,
    y: 1552,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },

  // ================= FLOW 04: AGENTIC AI COACH =================
  {
    id: 'n-4-entry',
    laneId: 'coach',
    stepCode: '4.1',
    title: 'Contextual Ask Treise sheet',
    summary: 'Opens from bottom nav or inline Ask Treise pills with a fresh 3-tier OOUX ContextEnvelope.',
    surfaceTag: 'AICoachChatModal',
    sourceModule: 'src/components/assistant/AICoachChatModal.tsx · coachContextEnvelope.ts',
    engineRule: 'Rule #12: Single ContextEnvelope builder combining Working State, Episodic Memory, and PKG edges.',
    telemetryEvents: ['coach.sheet_opened', 'coach.prompt_sent'],
    preview: 'coach-diff',
    tone: 'copper',
    x: 120,
    y: 1976,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-4-safety',
    laneId: 'coach',
    stepCode: '4.2',
    title: 'Safety & question guardrails',
    summary: 'Intercepts sharp pain, injury, or red-flag symptoms deterministically; blocks state edits on questions (?).',
    surfaceTag: 'Circuit-Breaker',
    sourceModule: 'src/services/aiAssistantService.ts (buildSafetyResponse)',
    engineRule: 'Rule #4: Safety beats engagement—the LLM never answers pain/injury prompts; fixed medical/swap reply fires.',
    telemetryEvents: ['coach.safety_triggered'],
    preview: 'safety-gate',
    tone: 'amber',
    x: 560,
    y: 1976,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-4-tools',
    laneId: 'coach',
    stepCode: '4.3',
    title: 'Hybrid inference & 21 tools',
    summary: 'Routes across on-device Gemini Nano, stateless /api/coach/generate Flash-Lite, and offline coachAnswers.',
    surfaceTag: 'OOUX Tool Layer',
    sourceModule: 'src/services/onDeviceModel.ts · geminiFlashLite.ts · coachTools.ts',
    engineRule: 'Destructive tools (reset_program) pause behind CoachPendingConfirmation human-in-the-loop approval.',
    telemetryEvents: ['coach.tool_executed'],
    preview: 'coach-diff',
    tone: 'copper',
    x: 1000,
    y: 1976,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-4-gates',
    laneId: 'coach',
    stepCode: '4.4',
    title: 'Fact & Read-Aloud QA gates',
    summary: 'Verifies numeric grounding, units, muscle targets, and voice rules; withdraws bad streams and falls back.',
    surfaceTag: 'Validation Gate',
    sourceModule: 'src/services/factChecks.ts · contentStrategy.ts',
    engineRule: 'Rule #14: Maximum 1 retry (< 6s) before deterministic coaching answer renders.',
    telemetryEvents: ['coach.fallback_used'],
    preview: 'safety-gate',
    tone: 'info',
    x: 1440,
    y: 1976,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-4-receipt',
    laneId: 'coach',
    stepCode: '4.5',
    title: 'Diff receipt & 1-tap Undo',
    summary: 'Renders verified CoachStateDiff card (previous -> new) with instant CoachUndoSnapshot state rollback.',
    surfaceTag: 'Mutation Receipt',
    sourceModule: 'src/services/coachTools.ts · AICoachChatModal.tsx',
    engineRule: 'enforceMutationTruthfulness guarantees UI never claims a workout/plan change that did not persist.',
    telemetryEvents: ['coach.action_applied', 'coach.action_undone'],
    preview: 'coach-diff',
    tone: 'mint',
    x: 1960,
    y: 1976,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },

  // ================= FLOW 05: PROGRESS ANALYTICS =================
  {
    id: 'n-5-goals',
    laneId: 'progress',
    stepCode: '5.1',
    title: '192px Goals Hero carousel',
    summary: 'Pairs canvas-native progress rings (Weekly Consistency, Closest Strength Level, Custom Goals) with 2-line copy.',
    surfaceTag: 'AnalyticsTab · GoalsHero',
    sourceModule: 'src/components/analytics/ProgressOverviewCards.tsx · progressOverview.ts',
    engineRule: 'Rule #9 & #14: Streak allows <= 4d rest gaps; goal takeaways pass checkGoalsSummary.',
    telemetryEvents: ['navigation.tab_viewed', 'goal.custom_saved'],
    preview: 'goal-ring',
    tone: 'mint',
    x: 120,
    y: 2400,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-5-standards',
    laneId: 'progress',
    stepCode: '5.2',
    title: 'Strength standards & balance',
    summary: 'Scores Squat, Hinge, Push & Chin-Up across Kilgore / Poliquin I–IV tiers and flags L/R < 90% asymmetries.',
    surfaceTag: 'StrengthLevels · Balance',
    sourceModule: 'src/engine/kilgoreStandards.ts · movementStandards.ts',
    engineRule: '§1.4: Rows report no fake standard; age groups apply only when ageEntered is true.',
    telemetryEvents: ['analytics.strength_inspected'],
    preview: 'radar-balance',
    tone: 'info',
    x: 560,
    y: 2400,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-5-pkg',
    laneId: 'progress',
    stepCode: '5.3',
    title: 'Knowledge Graph & Trophy Case',
    summary: 'Mines longitudinal sleep/HRV-to-strength causal edges, joint strain alerts, and verified lift PR badges.',
    surfaceTag: 'KnowledgeGraphCard',
    sourceModule: 'src/engine/knowledgeGraph.ts · KnowledgeGraphCard.tsx',
    engineRule: 'Bounded memoization prevents redundant graph rebuilds across tabs.',
    telemetryEvents: ['analytics.kg_inspected'],
    preview: 'detail-chart',
    tone: 'info',
    x: 1000,
    y: 2400,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-5-comp',
    laneId: 'progress',
    stepCode: '5.4',
    title: 'Weight, BLE scale & 12-site tape',
    summary: 'Logs manual or RENPHO BLE (0x55AA) weigh-ins, 7-day EMA trend, Siedler-bounded FFM, and tape sites.',
    surfaceTag: 'CompositionCard',
    sourceModule: 'src/services/renphoBluetooth.ts · CompositionCard.tsx',
    engineRule: 'Rule #1 & #9: Never fabricates bone/protein mass; weekly pace requires >= 7d of real weigh-ins.',
    telemetryEvents: ['bodyweight.logged', 'composition.tape_logged'],
    preview: 'detail-chart',
    tone: 'info',
    x: 1440,
    y: 2400,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-5-drillin',
    laneId: 'progress',
    stepCode: '5.5',
    title: 'Widget customization & drill-in',
    summary: 'Pins any of 304 exercises via ProgressWidgetsScreen and opens canonical ExerciseDetailModal on tap.',
    surfaceTag: 'ProgressWidgetsScreen',
    sourceModule: 'src/components/analytics/ProgressWidgetsScreen.tsx',
    engineRule: 'Rule #1 & #12: Unlogged exercises show dimmed "Example" curve with zero numbers; >= 2 sessions show trend.',
    telemetryEvents: ['analytics.widgets_customized', 'exercise.detail_opened'],
    preview: 'detail-chart',
    tone: 'mint',
    x: 1960,
    y: 2400,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },

  // ================= FLOW 06: PLATFORM, WEARABLES & PRIVACY =================
  {
    id: 'n-6-wearables',
    laneId: 'platform',
    stepCode: '6.1',
    title: 'Native HealthKit & Connect',
    summary: 'Syncs read-only workouts, HRV, RHR, sleep, and steps from iOS HealthKit, Android Health Connect, Whoop & Strava.',
    surfaceTag: 'WatchSyncModal',
    sourceModule: 'ios/.../HealthKitBridge.swift · android/.../HealthConnectBridge.kt · api/',
    engineRule: 'Rule #2: Zero client secrets in bundle; native bridges request strictly read-only permissions.',
    telemetryEvents: ['wearable.sync_completed'],
    preview: 'sync',
    tone: 'amber',
    x: 120,
    y: 2824,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-6-readiness',
    laneId: 'platform',
    stepCode: '6.2',
    title: 'Daily Readiness Z-score',
    summary: 'Computes 0.50 Z_HRV - 0.30 Z_RHR + 0.20 Sleep Z-score -> Primed (>= +0.8), Normal, or Amber Shield (<= -0.8).',
    surfaceTag: 'Readiness Engine',
    sourceModule: 'src/engine/readiness.ts · vitality.ts',
    engineRule: '§2.1: Days without measured biometrics show calm empty state—never a fabricated readiness score.',
    telemetryEvents: ['readiness.evaluated'],
    preview: 'amber-banner',
    tone: 'amber',
    x: 560,
    y: 2824,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-6-telemetry',
    laneId: 'platform',
    stepCode: '6.3',
    title: 'GSM product telemetry',
    summary: 'Batches 42 privacy-safe usage counters/histograms to /api/telemetry/ingest with Settings opt-out & JSON export.',
    surfaceTag: 'Telemetry Pipeline',
    sourceModule: 'src/engine/telemetrySchema.ts · src/services/telemetry.ts · api/telemetry/ingest.ts',
    engineRule: 'Strict tag allowlist strips all lift weights, biometrics, emails, and prompt text before flush.',
    telemetryEvents: ['workout.started', 'workout.completed', 'program.completed'],
    preview: 'telemetry-privacy',
    tone: 'info',
    x: 1000,
    y: 2824,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-6-backup',
    laneId: 'platform',
    stepCode: '6.4',
    title: 'Settings import, maxes & backup',
    summary: 'Settings training & lift maxes importer (.zip/CSV/JSON), immediate localStorage writes, quota eviction, and encrypted Drive backup.',
    surfaceTag: 'Settings / Storage',
    sourceModule: 'src/services/storage.ts · ProfileSettingsSections.tsx',
    engineRule: 'Rule #10: Suite 36f guarantees saved workouts, documented 1RMs, and weigh-ins survive reloads, quota pressure, and updates.',
    telemetryEvents: ['onboarding.import_used', 'backup.executed'],
    preview: 'telemetry-privacy',
    tone: 'mint',
    x: 1440,
    y: 2824,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'n-6-erase',
    laneId: 'platform',
    stepCode: '6.5',
    title: 'Hard erase & privacy parity',
    summary: '1-tap permanentlyEraseAllUserData wipes workouts, biometrics, memories, and telemetry in parity with privacy.html.',
    surfaceTag: 'Data Safety',
    sourceModule: 'src/services/storage.ts · public/privacy.html',
    engineRule: 'Rule #3: Every capability and deletion guarantee in privacy.html matches live code 1:1.',
    telemetryEvents: ['data.hard_erased'],
    preview: 'safety-gate',
    tone: 'amber',
    x: 1960,
    y: 2824,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

export const FLOW_EDGES: FlowEdgeSpec[] = [
  // Flow 01
  { id: 'e-1-1', from: 'n-1-launch', to: 'n-1-goal', fromPort: 'right', toPort: 'left', laneId: 'onboarding', tone: 'info', label: 'New athlete' },
  { id: 'e-1-2', from: 'n-1-goal', to: 'n-1-place', fromPort: 'right', toPort: 'left', laneId: 'onboarding', tone: 'info', label: 'Goal + unit' },
  { id: 'e-1-3', from: 'n-1-place', to: 'n-1-sync', fromPort: 'right', toPort: 'left', laneId: 'onboarding', tone: 'info', label: 'Gear saved' },
  { id: 'e-1-4', from: 'n-1-sync', to: 'n-1-queued', fromPort: 'right', toPort: 'left', laneId: 'onboarding', tone: 'mint', label: 'Scale loads' },
  { id: 'e-1-5', from: 'n-1-queued', to: 'n-1-demo', fromPort: 'right', toPort: 'left', laneId: 'onboarding', tone: 'amber', label: 'Optional demo', dashed: true },

  // Cross-lane: Onboarding -> Workout
  { id: 'e-cross-1-2', from: 'n-1-queued', to: 'n-2-queue', fromPort: 'bottom', toPort: 'top', laneId: 'workout', tone: 'mint', label: 'Opens Workout 1', dashed: true },

  // Flow 02 Spine & Branches
  { id: 'e-2-1', from: 'n-2-queue', to: 'n-2-logging', fromPort: 'right', toPort: 'left', laneId: 'workout', tone: 'mint', label: 'Ready to lift' },
  { id: 'e-2-amber-in', from: 'n-2-queue', to: 'n-2-amber', fromPort: 'top', toPort: 'left', laneId: 'workout', tone: 'amber', label: 'Z <= -0.8 / sore' },
  { id: 'e-2-amber-out', from: 'n-2-amber', to: 'n-2-logging', fromPort: 'bottom', toPort: 'top', laneId: 'workout', tone: 'amber', label: '1-tap trim / RIR' },
  { id: 'e-2-detail', from: 'n-2-logging', to: 'n-2-detail', fromPort: 'top', toPort: 'left', laneId: 'workout', tone: 'info', label: 'Tap title / info' },
  { id: 'e-2-2', from: 'n-2-logging', to: 'n-2-rest', fromPort: 'right', toPort: 'left', laneId: 'workout', tone: 'mint', label: 'Tap Done' },
  { id: 'e-2-3', from: 'n-2-rest', to: 'n-2-finish', fromPort: 'right', toPort: 'left', laneId: 'workout', tone: 'mint', label: 'Finish workout' },
  { id: 'e-2-4', from: 'n-2-finish', to: 'n-2-advance', fromPort: 'right', toPort: 'left', laneId: 'workout', tone: 'mint', label: 'Save session' },
  { id: 'e-2-swap-in', from: 'n-2-logging', to: 'n-2-swap', fromPort: 'bottom', toPort: 'left', laneId: 'workout', tone: 'mint', label: 'Overflow -> Swap' },
  { id: 'e-2-swap-overlay', from: 'n-2-swap', to: 'n-2-overlay', fromPort: 'right', toPort: 'left', laneId: 'workout', tone: 'info', label: 'Home / Travel tab' },
  { id: 'e-2-overlay-back', from: 'n-2-overlay', to: 'n-2-finish', fromPort: 'top', toPort: 'bottom', laneId: 'workout', tone: 'mint', label: 'Set 1 calibrates' },

  // Cross-lane: Workout -> Program
  { id: 'e-cross-2-3', from: 'n-2-advance', to: 'n-3-overview', fromPort: 'bottom', toPort: 'top', laneId: 'program', tone: 'mint', label: 'Advances 1..24', dashed: true },

  // Flow 03
  { id: 'e-3-1', from: 'n-3-overview', to: 'n-3-volume', fromPort: 'right', toPort: 'left', laneId: 'program', tone: 'mint', label: 'Hard sets' },
  { id: 'e-3-2', from: 'n-3-volume', to: 'n-3-active', fromPort: 'right', toPort: 'left', laneId: 'program', tone: 'info', label: 'Active slot' },
  { id: 'e-3-3', from: 'n-3-active', to: 'n-3-adapt', fromPort: 'right', toPort: 'left', laneId: 'program', tone: 'copper', label: 'Gap detected' },
  { id: 'e-3-4', from: 'n-3-adapt', to: 'n-3-graduate', fromPort: 'right', toPort: 'left', laneId: 'program', tone: 'mint', label: '24/24 done' },

  // Cross-lane: Workout/Program -> AI Coach
  { id: 'e-cross-3-4', from: 'n-3-adapt', to: 'n-4-entry', fromPort: 'bottom', toPort: 'top', laneId: 'coach', tone: 'copper', label: 'Ask Treise', dashed: true },

  // Flow 04
  { id: 'e-4-1', from: 'n-4-entry', to: 'n-4-safety', fromPort: 'right', toPort: 'left', laneId: 'coach', tone: 'amber', label: 'Pre-LLM check' },
  { id: 'e-4-2', from: 'n-4-safety', to: 'n-4-tools', fromPort: 'right', toPort: 'left', laneId: 'coach', tone: 'copper', label: 'Safe intent' },
  { id: 'e-4-3', from: 'n-4-tools', to: 'n-4-gates', fromPort: 'right', toPort: 'left', laneId: 'coach', tone: 'info', label: 'Validate facts' },
  { id: 'e-4-4', from: 'n-4-gates', to: 'n-4-receipt', fromPort: 'right', toPort: 'left', laneId: 'coach', tone: 'mint', label: 'Commit + Undo' },

  // Cross-lane: Workout/Coach -> Progress
  { id: 'e-cross-4-5', from: 'n-4-receipt', to: 'n-5-goals', fromPort: 'bottom', toPort: 'top', laneId: 'progress', tone: 'info', label: 'Updates standing', dashed: true },

  // Flow 05
  { id: 'e-5-1', from: 'n-5-goals', to: 'n-5-standards', fromPort: 'right', toPort: 'left', laneId: 'progress', tone: 'info', label: 'E1RM / BW' },
  { id: 'e-5-2', from: 'n-5-standards', to: 'n-5-pkg', fromPort: 'right', toPort: 'left', laneId: 'progress', tone: 'info', label: 'Causal graph' },
  { id: 'e-5-3', from: 'n-5-pkg', to: 'n-5-comp', fromPort: 'right', toPort: 'left', laneId: 'progress', tone: 'info', label: 'Scale & tape' },
  { id: 'e-5-4', from: 'n-5-comp', to: 'n-5-drillin', fromPort: 'right', toPort: 'left', laneId: 'progress', tone: 'mint', label: 'Pin & inspect' },

  // Cross-lane: Progress -> Platform
  { id: 'e-cross-5-6', from: 'n-5-comp', to: 'n-6-wearables', fromPort: 'bottom', toPort: 'top', laneId: 'platform', tone: 'amber', label: 'BLE & Health sync', dashed: true },

  // Flow 06
  { id: 'e-6-1', from: 'n-6-wearables', to: 'n-6-readiness', fromPort: 'right', toPort: 'left', laneId: 'platform', tone: 'amber', label: 'HRV · RHR · Sleep' },
  { id: 'e-6-2', from: 'n-6-readiness', to: 'n-6-telemetry', fromPort: 'right', toPort: 'left', laneId: 'platform', tone: 'info', label: 'GSM signals' },
  { id: 'e-6-3', from: 'n-6-telemetry', to: 'n-6-backup', fromPort: 'right', toPort: 'left', laneId: 'platform', tone: 'mint', label: 'Local-first save' },
  { id: 'e-6-4', from: 'n-6-backup', to: 'n-6-erase', fromPort: 'right', toPort: 'left', laneId: 'platform', tone: 'amber', label: 'User control' },
];

export function getPortPoint(node: FlowNodeSpec, side: PortSide): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + Math.round(node.height / 2) };
    case 'right':
      return { x: node.x + node.width, y: node.y + Math.round(node.height / 2) };
    case 'top':
      return { x: node.x + Math.round(node.width / 2), y: node.y };
    case 'bottom':
      return { x: node.x + Math.round(node.width / 2), y: node.y + node.height };
  }
}

export function buildConnectorPath(
  p1: { x: number; y: number },
  s1: PortSide,
  p2: { x: number; y: number },
  s2: PortSide
): { d: string; midX: number; midY: number } {
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const offset = Math.max(48, Math.min(180, Math.round(Math.max(dx, dy) * 0.42)));

  const c1 = {
    x: p1.x + (s1 === 'right' ? offset : s1 === 'left' ? -offset : 0),
    y: p1.y + (s1 === 'bottom' ? offset : s1 === 'top' ? -offset : 0),
  };
  const c2 = {
    x: p2.x + (s2 === 'right' ? offset : s2 === 'left' ? -offset : 0),
    y: p2.y + (s2 === 'bottom' ? offset : s2 === 'top' ? -offset : 0),
  };

  const midX = Math.round(0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x);
  const midY = Math.round(0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y);

  return {
    d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
    midX,
    midY,
  };
}
