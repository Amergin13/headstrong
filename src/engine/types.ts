import type { ActivityLog } from './activeDays';

export type StrengthPillar =
  | 'Squat'
  | 'Hinge'
  | 'Horizontal Push'
  | 'Vertical Push'
  | 'Horizontal Pull'
  | 'Vertical Pull';

export type RadarPillar = StrengthPillar | 'Engine / Vitality';

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'weighted_bodyweight';

export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Quads'
  | 'Hamstrings'
  | 'Glutes'
  | 'Shoulders'
  | 'Side Delts'
  | 'Rear Delts'
  | 'Front Delts'
  | 'Triceps'
  | 'Biceps'
  | 'Calves'
  | 'Core';

export type StrengthTier =
  | 'Untrained'
  | 'Novice'
  | 'Intermediate'
  | 'Advanced'
  | 'Elite';

export type SubDivision = 'I' | 'II' | 'III' | 'IV';

export type GoalPhase = 'Lean Bulk' | 'Cut / Recomp' | 'Maingain';

export type ReadinessState = 'Primed' | 'Normal' | 'Amber Shield';

export type Gender = 'male' | 'female';

export type BodyMeasurementSite =
  | 'neck'
  | 'shoulder'
  | 'chest'
  | 'waist'
  | 'abdomen'
  | 'hip'
  | 'bicep_left'
  | 'bicep_right'
  | 'thigh_left'
  | 'thigh_right'
  | 'calf_left'
  | 'calf_right';

export interface BiometricLog {
  date: string; // ISO date 'YYYY-MM-DD'
  bodyweightKg: number;
  hrvRmssd: number; // ms
  restingHr: number; // bpm
  sleepHours: number; // hours
  steps: number;
  activeZoneMinutes: number; // AZM
  vo2Max?: number; // mL/kg/min
  recoveryScore?: number; // % (0-100, e.g. Whoop recovery score)
  fitbitReadinessScore?: number; // % (1-100, Fitbit / Pixel Watch Daily Readiness Score)
  readinessScore?: number; // % (1-100, Universal active tracker readiness score)
  workoutStrain?: number; // 0 - 21 Whoop workout strain
  strain?: number; // 0 - 21 Whoop day strain
  kilojoules?: number; // Daily cumulative energy burned (kJ)
  workoutKilojoules?: number; // Single session active workout energy burned (kJ)
  avgWorkoutHr?: number;
  maxWorkoutHr?: number;
  workoutDurationMin?: number;
  sleepPerformance?: number; // % (0-100, Whoop sleep performance)
  sleepEfficiency?: number; // % (0-100, Whoop sleep efficiency)
  respiratoryRate?: number; // breaths/min (Whoop respiratory rate)
  spo2?: number; // % blood oxygen saturation
  skinTemp?: number; // °C skin temperature
  source?: WearableProvider;
  /** Weight typed in by the athlete (onboarding or Log weight). */
  isManualEntry?: boolean;
  /**
   * RENPHO Bluetooth Health Scale (13 metrics) & Smart Body Tape Measure (12 sites),
   * or manual entry. Undefined = not measured.
   */
  bmi?: number;
  bodyFatPct?: number;
  fatFreeMassKg?: number;
  subcutaneousFatPct?: number;
  visceralFat?: number;
  bodyWaterPct?: number;
  skeletalMuscleMassKg?: number;
  muscleMassKg?: number;
  boneMassKg?: number;
  proteinMassKg?: number;
  bmrKcal?: number;
  metabolicAge?: number;
  impedanceOhms?: number;

  // 12 RENPHO Smart Tape Measure circumference sites (stored in cm):
  neckCm?: number;
  shouldersCm?: number;
  chestCm?: number;
  waistCm?: number;
  abdomenCm?: number;
  hipsCm?: number;
  bicepLeftCm?: number;
  bicepRightCm?: number;
  thighLeftCm?: number;
  thighRightCm?: number;
  calfLeftCm?: number;
  calfRightCm?: number;

  // Legacy single-site circumference fields retained for backwards compatibility:
  armCm?: number;
  forearmCm?: number;
  thighCm?: number;
  calfCm?: number;
  heightCm?: number;
}

export type SetType = 'working' | 'warmup' | 'drop' | 'myo';

export type ResistanceProfile = 'lengthened' | 'mid' | 'shortened';

export type ExerciseStability = 'high' | 'moderate' | 'low';

export type JointType =
  | 'Shoulder Capsule'
  | 'Elbow Tendons'
  | 'Lumbar Spine'
  | 'Knee / Patellar'
  | 'Ankle / Achilles';

export type TrainingLocation = 'gym' | 'home' | 'travel';

export type HomeEquipmentTag =
  | 'bench'
  | 'dumbbells'
  | 'trx'
  | 'pullup_bar'
  | 'bands';

// ============================================================================
// Seamless Cross-Environment Exercise Swapping & Continuity Domain Contracts
// ============================================================================

export type EquipmentClass =
  | 'STANDARDIZED_FREE_WEIGHT'   // Barbell, Dumbbell, Smith Machine, Kettlebell
  | 'BODYWEIGHT'                 // Push-ups, Pull-ups, Dips, Lunges
  | 'VARIABLE_MACHINE_OR_CABLE'; // Pin-loaded machines, cable stacks (unknown pulley ratios)

export type OverlayScope =
  | 'TODAY_ONLY'
  | 'WEEK_OVERRIDE'              // Auto-reverts at start of next training week
  | 'CUSTOM_UNTIL_DATE';

export type EnvironmentProfileType =
  | 'HOME_GYM'
  | 'HOTEL_DUMBBELLS'
  | 'BODYWEIGHT'
  | 'TIME_CONSTRAINED'
  | 'CUSTOM';

export type CalibrationSource =
  | 'OWN_HISTORY'
  | 'ANCHOR_PRIOR'
  | 'SET_1_RECALIBRATED'
  | 'EFFORT_ONLY';

export type ContinuityRationaleKind =
  | 'ANCHOR_PRIOR'
  | 'BODYWEIGHT'
  | 'EFFORT_ONLY'
  | 'COARSE_JUMP_EXPANDED'
  | 'HOME_GYM_REENTRY';

export type EquipmentAvailabilityToken =
  | 'BARBELL'
  | 'DUMBBELLS'
  | 'BENCH'
  | 'CABLE'
  | 'MACHINE'
  | 'PULLUP_BAR'
  | 'TRX'
  | 'BANDS'
  | 'NONE';

export interface ExerciseMetadata {
  exerciseId: string;
  name: string;
  movementPattern: string;
  equipmentClass: EquipmentClass;
  equipmentRequired: EquipmentAvailabilityToken[];
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  /** Optional prior vs canonical barbell anchor (e.g., Flat DB Press = 0.78 total). */
  anchorTransferRatio?: number;
  /** Optional % of user BW (e.g., Floor Push-Up = 0.64, Feet-Elevated = 0.74). */
  bodyweightLoadPct?: number;
  /** Ordered difficulty ladder for bodyweight variants (1 = easiest). */
  leverageTier?: number;
  /** If true, split estimated total load across 2 hands (per-dumbbell logging). */
  isUnilateralPerHand: boolean;
}

export interface ProgramSlot {
  slotId: string; // e.g., "A1"
  programId: string;
  workoutDayId: string;
  movementPattern: string;
  anchorExerciseId: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  targetRirInitial: number; // Clamped 0..6
  restSeconds: number;
}

export interface EnvironmentOverlay {
  overlayId: string;
  activeProfileType: EnvironmentProfileType;
  label?: string;
  availableEquipment: EquipmentAvailabilityToken[];
  maxDumbbellKg?: number | null;
  dumbbellStepKg?: number | null;
  maxSessionMinutes?: number | null;
  scope: OverlayScope;
  /** Null only for default HOME_GYM. */
  expiresAtEpochMs: number | null;
  /** Local natural-language prompt entered by user (kept strictly on-device). */
  sourcePrompt?: string;
  createdAtEpochMs?: number;
}

export interface ExerciseProgressionState {
  exerciseId: string; // Strictly isolated per exercise
  lastLoggedAt: number | null;
  estimated1rmKg: number | null;
  lastWorkingWeightKg: number | null;
  lastWorkingReps: number | null;
  lastLoggedRir: number | null;
  calibratedSessionCount: number;
}

export interface ActiveSetPrescription {
  setNumber: number;
  /** Null for BODYWEIGHT or uncalibrated VARIABLE_MACHINE_OR_CABLE. */
  suggestedWeightKg: number | null;
  /** Drives "~" prefix in UI. */
  isWeightEstimated: boolean;
  /** e.g., "Elevated (~74% BW)" or "Pick moderate". */
  setupLabel: string | null;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRir: number; // 0..6
  calibrationSource: CalibrationSource;
}

export interface ContinuityCopyBlock {
  kind: ContinuityRationaleKind;
  tier1: string;
  tier2Bullets: string[];
}

export interface LeverageUpgradeNudge {
  currentExerciseId: string;
  suggestedExerciseId?: string;
  suggestedSetupLabel: string;
  suggestedName: string;
  chipLabel: string;
  promptText: string;
}

export interface BridgeWeekClassification {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
  status: 'LOGGED_ANCHOR' | 'BRIDGE_WEEK' | 'MISSED_WEEK';
  substituteExerciseNames: string[];
  substituteSetCount: number;
}

export interface SessionContinuitySummary {
  winLeverBadge: 'STIMULUS MATCHED' | 'LEVERAGE & EFFORT WIN' | 'CARRYOVER CONFIRMED';
  headline: string;
  primaryMuscle: MuscleGroup;
  weeklySetsCompleted: number;
  weeklyTargetMin: number;
  weeklyTargetMax: number;
  weeklyTargetPct: number;
  muscleGrowthStatus: string;
  anchorStatusLine: string;
  environmentLabel: string;
}

export interface IntensityProtocol {
  id: string;
  symbol: string;
  name: string;
  instruction: string;
}

export interface WarmupProtocolStep {
  setNumber: number;
  reps: number;
  percentageOfWorkWeight: number;
  exampleWeightKg?: number;
  restSecondsMin?: number;
  restSecondsMax?: number;
  restLabel?: string;
}

export interface WarmupProtocol {
  description: string;
  sets: WarmupProtocolStep[];
}

export interface WorkoutSet {
  id: string;
  setNumber: number;
  targetWeightKg: number;
  actualWeightKg?: number;
  targetReps: number;
  actualReps?: number;
  /**
   * Single-arm / single-leg sets logged per side. actualReps is then the weaker side's reps (what
   * both sides managed), so progression and estimated maxes never count the stronger side alone.
   */
  actualRepsLeft?: number;
  actualRepsRight?: number;
  targetRir: number; // 0, 1, 2, 3+
  actualRir?: number;
  completed: boolean;
  completedAt?: string;
  isWarmup?: boolean;
  setType?: SetType;
  tempo?: string;
  isFormFailure?: boolean;
  repDisplay?: string;
  /** Target hold/carry time in seconds for timed isometric or loaded-carry exercises. */
  targetDurationSeconds?: number;
  /** Logged hold/carry time in seconds for timed exercises. */
  actualDurationSeconds?: number;
  /** True when target weight is an anchor-derived prior ("~" prefix in UI). */
  isWeightEstimated?: boolean;
  /** Non-numeric setup label for bodyweight or unfamiliar machines (e.g. "Elevated (~74% BW)", "Pick moderate"). */
  setupLabel?: string | null;
  /** How this set's target was calibrated (OWN_HISTORY | ANCHOR_PRIOR | SET_1_RECALIBRATED | EFFORT_ONLY). */
  calibrationSource?: CalibrationSource;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  pillar: StrengthPillar;
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  isRdl?: boolean;
  isWeightedCalisthenic?: boolean;
  /** True for counterweight-assisted calisthenics (e.g. Assisted Chin-Up) where lower counterweight = heavier effective load. */
  isAssisted?: boolean;
  isIsolation?: boolean; // True for isolation movements (lateral raises, curls, pushdowns, calves)
  /** True when sets are tracked for duration (seconds/minutes) rather than rep count (e.g., planks, carries, holds). */
  isTimed?: boolean;
  /** Default hold duration in seconds when adding or swapping into a timed exercise. */
  defaultDurationSeconds?: number;
  movementFamily?: string; // Canonical movement vector ID in the Knowledge Graph
  movementFamilyLabel?: string; // Plain-English movement family name (e.g. "Horizontal Chest Press")
  environments?: TrainingLocation[]; // Where this exercise can be performed ('gym', 'home', 'travel')
  requiredHomeEquipment?: HomeEquipmentTag[]; // Equipment needed when training at home
  whyItWorks?: string; // Plain-English biomechanical rationale for why this alternative works
  resistanceProfile?: ResistanceProfile; // 'lengthened' | 'mid' | 'shortened'
  stability?: ExerciseStability; // 'high' | 'moderate' | 'low' external stability profile
  sfrScore?: number; // Stimulus-to-Fatigue Ratio (1.0 - 10.0)
  axialLoadIndex?: number; // Spinal / CNS strain index per set (0.0 - 1.0)
  primaryJoints?: JointType[];
  biomechanicalCue?: string;
  defaultRepRange: [number, number]; // e.g. [8, 12]
}

export interface ExerciseSession {
  id: string;
  exerciseId: string;
  name: string;
  pillar: StrengthPillar;
  equipment: EquipmentType;
  isRdl?: boolean;
  isWeightedCalisthenic?: boolean;
  /** True for counterweight-assisted calisthenics (e.g. Assisted Chin-Up) where lower counterweight = heavier effective load. */
  isAssisted?: boolean;
  isIsolation?: boolean;
  movementFamily?: string;
  movementFamilyLabel?: string;
  resistanceProfile?: ResistanceProfile;
  sfrScore?: number;
  minReps: number;
  maxReps: number;
  sets: WorkoutSet[];
  notes?: string;
  /** Open session notes written by the athlete for this exercise during the workout. */
  athleteNotes?: string;
  orderCode?: string; // Grouping / superset code, e.g. 'A1', 'A2', 'B1', 'B2', 'C'
  tempo?: string; // 4-digit tempo e.g. '4010', '3110', or duration target e.g. '60sec', '15-30min'
  restSeconds?: number;
  durationSeconds?: number;
  durationMinutesRange?: [number, number];
  intensityProtocol?: IntensityProtocol;
  useWarmupProtocol?: boolean;
  repTargetType?: 'reps' | 'wave' | 'form_failure' | 'duration';
  waveReps?: [number, number];
  exerciseNotes?: string[];
  /** Movement slot identifier (e.g. "A1") decoupling program continuity from exercise-isolated math. */
  slotId?: string;
  /** Master program anchor exercise id when swapped under an environment overlay. */
  anchorExerciseId?: string;
  /** Master program anchor exercise display name. */
  anchorExerciseName?: string;
  /** Compact Set-1 parent anchor reference shown in PREV/REF (e.g., "BB 77.5×8"). */
  anchorReferenceLabel?: string;
  /** Calibration mode for this exercise session. */
  calibrationSource?: CalibrationSource;
  /** Rationale template key driving Tier-1 + expandable Tier-2 disclosure. */
  continuityRationaleKind?: ContinuityRationaleKind;
  /** Percentage of the next coarse load jump when COARSE_JUMP_EXPANDED triggers. */
  coarseJumpPct?: number;
  /** Setup label for bodyweight / unfamiliar machine slots (e.g., "Elevated (~74% BW)" or "Pick moderate"). */
  setupLabel?: string;
  /** Biomechanical % of bodyweight loaded (0..1) for bodyweight variants. */
  bodyweightLoadPct?: number;
  /** Ordered bodyweight leverage tier (1 = easiest). */
  leverageTier?: number;
  /** Pre-travel reference label shown under LAST AT GYM on first session back (e.g., "Wk 3: 77.5×8"). */
  reentryFromLabel?: string;
  /** True on first session back on an anchor lift after one or more BRIDGE_WEEK travel weeks. */
  isBridgeReentry?: boolean;
}

export interface WorkoutSession {
  id: string;
  date: string; // 'YYYY-MM-DD'
  name: string;
  splitDay: 'Push' | 'Pull' | 'Legs' | 'Upper' | 'Lower' | 'Full Body';
  exercises: ExerciseSession[];
  completed: boolean;
  completedAt?: string;
  readinessState: ReadinessState;
  readinessZScore: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  durationMinutes?: number;
  location?: TrainingLocation;
  whoopStrain?: number; // 0 - 21 Whoop workout strain
  kilojoules?: number; // energy burned during session
  wearableSource?: WearableProvider;
  /** True when heart rate / duration came from a real wearable rather than estimates. */
  hasMeasuredHeartRate?: boolean;
  /** When the first set of the session was logged (ISO), used for real session duration. */
  startedAt?: string;
  /** Position in the athlete's 6-week plan (1-24 muscle plan, 1-18 starter plan), when the session belongs to one. */
  programWorkoutNumber?: number;
  /** Which plan the session belongs to; older saves without it are muscle-plan sessions. */
  planId?: PlanId;
  /** Athlete chose to train before the queued session's muscles were recovered. */
  recoveryOverride?: boolean;
  /** Opt-in 1-tap recovery modulation applied by the athlete on a low-recovery or recovering day. */
  recoveryModulation?: {
    mode: 'trim_sets' | 'conservative_rir' | 'both';
    appliedAt: string;
    originalSetsByExerciseId?: Record<string, WorkoutSet[]>;
  };
  /** Working-set IDs already celebrated as a personal best this session. */
  celebratedSetIds?: string[];
  /** Active temporary environment overlay ID when this session was adapted. */
  environmentOverlayId?: string;
  /** Active environment profile type when this session was logged/adapted. */
  environmentProfileType?: EnvironmentProfileType;
  /** Human-readable active environment label (e.g., "Hotel Dumbbells (≤30 kg)"). */
  environmentOverlayLabel?: string;
}

export interface SubTierQuest {
  pillar: StrengthPillar;
  currentTier: StrengthTier;
  currentSubDivision: SubDivision;
  nextTier: StrengthTier;
  nextSubDivision: SubDivision;
  currentRatio: number; // e1rm / bw
  targetRatio: number;
  currentE1rm: number;
  targetE1rm: number;
  targetWeightKg: number;
  repsNeededAtWeight: number;
  percentageProgress: number; // 0 - 100
  displayText: string;
  isIsolationQuest?: boolean;
  sfrScore?: number;
  resistanceProfile?: ResistanceProfile;
}

export interface ProgressionPrescription {
  exerciseId: string;
  nextWeightKg: number;
  nextTargetReps: number[]; // Target reps per set, e.g. [9, 9, 8]
  reason: string;
  weightChanged: boolean;
  repsChanged: boolean;
  isAmberShieldBuffer: boolean;
  lastSessionDate?: string;
  previousSetsSummary?: string[]; // e.g. ["90×10 @2R", "90×10 @2R", "90×9 @1R"]
  transferredFromExerciseName?: string; // Populated when progress carried over from a substitute implement
  canonicalE1rmKg?: number; // Unified Pillar E1RM preserving continuity across equipment
  isPureBodyweight?: boolean; // Flags zero external load bodyweight movements
  calibratedTempoCue?: string; // Biomechanical tempo cue for hypertrophy progression
  /** Set when coarse equipment increments (>8% jump) automatically expand the rep ceiling before bumping load. */
  expandedRepCeiling?: number;
  /** Plain-English note explaining why the rep ceiling expanded for a coarse weight step. */
  repCeilingExplanation?: string;
  /** Individualized Epley strength-endurance denominator when learned from multi-rep-range history (Nuzzo et al., 2024). */
  enduranceSlopeDenominator?: number;
}

export interface PillarScore {
  pillar: RadarPillar;
  score: number; // 0 - 100 scaled
  rawRatioOrScore: number;
  tier: StrengthTier | 'Engine Peak';
  subDivision?: SubDivision;
}

export type WearableProvider = 'fitbit' | 'whoop' | 'health_connect';

export interface WearableDeviceStatus {
  provider: WearableProvider;
  deviceName: string;
  batteryLevel?: number;
  lastSyncTime?: string;
  isConnected: boolean;
}

export interface WearableSyncProgress {
  stage: 'idle' | 'connecting' | 'hrv' | 'sleep' | 'steps' | 'complete' | 'error';
  percent: number;
  message: string;
  provider?: WearableProvider;
}

export interface SavedPlanPhase {
  phaseNumber: number;
  name: string;
  shortName: string;
  planSummary: string;
  weeks: [number, number];
  description: string;
  intensityFocus: string;
}

export interface SavedPlanExercise {
  order: string;
  name: string;
  exerciseId: string;
  pillar: StrengthPillar;
  equipment: EquipmentType;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  notes?: string;
  defaultWeightKg?: number;
  durationSeconds?: number;
  isRdl?: boolean;
  isWeightedCalisthenic?: boolean;
}

export interface SavedPlanWorkout {
  workoutNumber: number;
  week: number;
  dayOfWeek: 'Monday' | 'Wednesday' | 'Friday' | 'Saturday';
  phase: number;
  title: string;
  splitDay: 'Push' | 'Pull' | 'Legs' | 'Upper';
  exercises: SavedPlanExercise[];
  kind?: 'lift' | 'active';
}

export interface SavedTrainingPlan {
  id: `custom:${string}`;
  name: string;
  subtitle?: string;
  workoutsPerWeek: number;
  phases: SavedPlanPhase[];
  templates: SavedPlanWorkout[];
  createdAt: string;
  source?: 'spreadsheet';
}

export type CustomPlanId = `custom:${string}`;

/**
 * The structured plans. Built-in: 'starter_6wk' (lift 3 days + 1 active day, the default),
 * 'starter_4day' (lift 4 days), 'muscle_building_6wk' (owner's 24-workout muscle plan),
 * plus any saved/imported spreadsheet plan (`custom:${slug}`).
 */
export type PlanId = 'muscle_building_6wk' | 'starter_6wk' | 'starter_4day' | CustomPlanId;

export type ProgramSplitType = 'ppl_upper' | 'ppl' | 'upper_lower' | 'full_body' | PlanId;

export type ExperienceLevel = 'new' | 'intermediate' | 'experienced';

/**
 * Goals the athlete changed on the Progress page. Anything left out follows the plan: its sessions
 * a week, and the strength level closest to being reached.
 */
export interface GoalSettings {
  /** Sessions a week to aim for, when different from the plan's. */
  sessionsPerWeek?: number;
  /** The movement whose strength level leads the Progress page, instead of the closest one. */
  strengthFocus?: StrengthPillar;
  /** Up to two targets the athlete set themselves, e.g. "12 chin-ups" or "100 kg bench press". */
  customGoals?: CustomGoal[];
  /** No longer used (every goal of the athlete's own now has its own ring); kept so older saves load. */
  followCustomGoalId?: string;
}

/** A target the athlete set: a weight to lift, reps to do in one set, or a daily step count. */
export interface CustomGoal {
  id: string;
  exerciseId: string;
  exerciseName: string;
  /** 'weight' = heaviest logged set reaches `target` kg; 'reps' = most reps in one set reaches `target`; 'steps' = daily steps reaches `target`. */
  metric: 'weight' | 'reps' | 'steps';
  target: number;
  /** When it was set (YYYY-MM-DD). */
  createdOn: string;
}

export type CoreProgressWidgetId =
  | 'goals'
  | 'trophy-case'
  | 'lifetime-stats'
  | 'recent-stats'
  | 'steps'
  | 'body-weight'
  | 'composition'
  | 'measurements'
  | 'insights'
  | 'strength-standards'
  | 'strength-levels'
  | 'balance'
  | 'whoop-summary';

export type ProgressWidgetId =
  | CoreProgressWidgetId
  | `exercise:${string}`
  | `chart:${string}`;

export type AthleteMemoryCategory =
  | 'injury'
  | 'contraindication'
  | 'preference'
  | 'equipment'
  | 'schedule'
  | 'training_max'
  | 'goal'
  | 'general';

export interface AthleteMemoryFact {
  id: string;
  category: AthleteMemoryCategory;
  value: string;
  createdAt: string;
  source?: 'coach' | 'user';
  relatedExerciseIds?: string[];
}

export interface WorkoutDisplaySettings {
  /** Show the Program & phase card (phase title, description, arrow button to Program tab; default: false). */
  showProgramCard?: boolean;
  /** Show the standalone Current session card with workout title and set progress bar (default: true). */
  showSessionCard?: boolean;
  /** Show the biometric Recovery / Readiness card when a wearable is connected (default: true). */
  showRecoveryCard?: boolean;
  /** Show the 2-line written summary on each ExerciseCard (default: true). */
  showExerciseSummaries?: boolean;
  /** Show the E1RM / reps trend chart on each ExerciseCard (default: true). */
  showExerciseCharts?: boolean;
  /** Show the daily steps card on Workout overview / rest days (default: true). */
  showStepsCard?: boolean;
  /**
   * Progressive disclosure for RIR (reps in reserve) tracking on sets:
   * - `undefined`: hidden by default for `'new'` lifters (clean weight × reps), shown for `'intermediate'` / `'experienced'`.
   * - `true` / `false`: explicit athlete preference.
   */
  showRirTracking?: boolean;
}

export const DEFAULT_WORKOUT_DISPLAY_SETTINGS: Required<Omit<WorkoutDisplaySettings, 'showRirTracking'>> = {
  showProgramCard: false,
  showSessionCard: true,
  showRecoveryCard: true,
  showExerciseSummaries: true,
  showExerciseCharts: true,
  showStepsCard: true,
};

export function resolveWorkoutDisplaySettings(
  settings?: WorkoutDisplaySettings | null
): Required<Omit<WorkoutDisplaySettings, 'showRirTracking'>> & Pick<WorkoutDisplaySettings, 'showRirTracking'> {
  return {
    showProgramCard: settings?.showProgramCard ?? DEFAULT_WORKOUT_DISPLAY_SETTINGS.showProgramCard,
    showSessionCard: settings?.showSessionCard ?? DEFAULT_WORKOUT_DISPLAY_SETTINGS.showSessionCard,
    showRecoveryCard: settings?.showRecoveryCard ?? DEFAULT_WORKOUT_DISPLAY_SETTINGS.showRecoveryCard,
    showExerciseSummaries: settings?.showExerciseSummaries ?? DEFAULT_WORKOUT_DISPLAY_SETTINGS.showExerciseSummaries,
    showExerciseCharts: settings?.showExerciseCharts ?? DEFAULT_WORKOUT_DISPLAY_SETTINGS.showExerciseCharts,
    showStepsCard: settings?.showStepsCard ?? DEFAULT_WORKOUT_DISPLAY_SETTINGS.showStepsCard,
    showRirTracking: settings?.showRirTracking,
  };
}

/**
 * Resolves whether per-set RIR inputs should be shown on the gym floor.
 * New lifters start with RIR hidden by default so they focus on clean weight & rep targets
 * (Alpha Progression; Robinson et al., 2024), while intermediate/experienced lifters or anyone
 * who toggles it on gets RIR-first logging.
 */
export function resolveRirTrackingEnabled(
  profile?: Pick<UserProfile, 'experienceLevel' | 'workoutDisplay'> | null
): boolean {
  if (typeof profile?.workoutDisplay?.showRirTracking === 'boolean') {
    return profile.workoutDisplay.showRirTracking;
  }
  return (profile?.experienceLevel ?? 'intermediate') !== 'new';
}

export type WeekdayShort = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type PreferredTimeOfDay = 'morning' | 'midday' | 'evening' | 'flexible';

/** Optional habit anchor (Kaushal & Rhodes, 2015; Lally et al., 2010) with non-punitive rollover. */
export interface HabitAnchor {
  preferredDays?: WeekdayShort[];
  preferredTime?: PreferredTimeOfDay;
  /** Short environmental/temporal cue, e.g. "After morning coffee" or "Right after work". */
  cue?: string;
}

/** Granular available plate pair counts and dumbbell increments for a gym or home profile. */
export interface EquipmentInventory {
  /** Barbell weight in kg (e.g. 20 kg Olympic bar, 15 kg women's bar, or 20.41 kg for 45 lb). */
  barWeightKg: number;
  /**
   * Pairs of plates available per denomination, keyed by display-unit weight string
   * (e.g. `{ "20": 4, "15": 2, "10": 2, "5": 2, "2.5": 2, "1.25": 2 }` in kg, or `"45"`, `"35"`, `"25"`, `"10"`, `"5"`, `"2.5"` in lb).
   * Unit is stored explicitly so switching kg/lb never misinterprets plate counts.
   */
  plateUnit: 'kg' | 'lb';
  platePairs: Record<string, number>;
  /** Dumbbell increment configuration (either fixed rack range + step, or exact available weights). */
  dumbbellMode: 'range' | 'fixed_list';
  dumbbellMinKg?: number;
  dumbbellMaxKg?: number;
  dumbbellStepKg?: number;
  /** Exact available per-dumbbell weights in kg when `dumbbellMode === 'fixed_list'`. */
  availableDumbbellsKg?: number[];
}

/** Record of a program adaptation suggestion explicitly dismissed by the athlete so it stays hidden across all surfaces. */
export interface DismissedCoachIntervention {
  /** Stable deterministic intervention id (e.g., "imbalance-pull-vs-push", "plateau-ex-bench-press", "volume-Chest"). */
  id: string;
  /** Plan id this dismissal applies to (when omitted, applies across all plans). */
  planId?: string;
  /** ISO timestamp when dismissed. */
  dismissedAt: string;
}

export interface UserProfile {
  /** Goals changed on the Progress page; see GoalSettings. */
  goalSettings?: GoalSettings;
  /** Customised widget selection for the Progress screen; undefined uses the defaults. */
  progressWidgets?: ProgressWidgetId[];
  /** Personal layout defaults for the Workout screen, configured from the Workout 3-dots menu. */
  workoutDisplay?: WorkoutDisplaySettings;
  name: string;
  gender: Gender;
  /** True once the athlete chose it (Settings or the weight form); until then gender is a default. */
  sexEntered?: boolean;
  /** Training experience chosen in onboarding; calibrates starting weights. */
  experienceLevel?: ExperienceLevel;
  /** Display/input unit for weights. Data is always stored in kg. */
  weightUnit?: 'kg' | 'lb';
  /** Display/input unit for height. Data is always stored in cm. */
  heightUnit?: 'cm' | 'ft_in';
  /** Placeholder (25) until the athlete enters it; see ageEntered. */
  age: number;
  /** True once the athlete entered their age (Settings); strength standards use the 18–39 table until then. */
  ageEntered?: boolean;
  heightCm: number;
  /** Height the athlete entered themselves; heightCm is only a placeholder until then. */
  measuredHeightCm?: number;
  goalPhase: GoalPhase;
  programType?: ProgramSplitType;
  /** User-imported or custom saved training plans selectable alongside Treise's built-in plans. */
  customPlans?: SavedTrainingPlan[];
  /** Seed/import markers applied to this profile so auto-imports remain idempotent across launches. */
  importedSheetIds?: string[];
  /** ISO timestamps when each plan was explicitly reset so prior logs stay in stats without blocking a fresh run. */
  planCycleStarts?: Record<string, string>;
  /** Optional starting workoutNumber when a plan was reset to a specific week/day (defaults to 1). */
  planStartWorkouts?: Record<string, number>;
  /** Persistent program-level exercise swaps, additions, removals, set adjustments, and priority reorders across sessions. */
  programOverrides?: ProgramExerciseOverride[];
  /** Persistent dismissals of program adaptation suggestions so dismissed items never reappear across Program, Workout, Progress, or Coach. */
  dismissedInterventions?: DismissedCoachIntervention[];
  /** Persistent athlete memory facts saved via Treise Coach (injuries, contraindications, preferences, schedule). */
  athleteMemories?: AthleteMemoryFact[];
  mesocycleWeek?: number; // 1 to 6
  streakDays: number;
  lastWorkoutDate?: string;
  wearableSource?: WearableProvider | null;
  fitbitConnected: boolean;
  fitbitAccessToken?: string;
  fitbitRefreshToken?: string;
  fitbitTokenExpiresAt?: number;
  whoopConnected?: boolean;
  whoopClientId?: string;
  whoopClientSecret?: string;
  whoopRedirectUri?: string;
  whoopAccessToken?: string;
  whoopRefreshToken?: string;
  whoopTokenExpiresAt?: number;
  /** Strava, used only to count rides, runs and other activities as active days. */
  stravaConnected?: boolean;
  stravaAccessToken?: string;
  stravaRefreshToken?: string;
  /** Unix seconds, as Strava reports it. */
  stravaTokenExpiresAt?: number;
  stravaAthleteFirstName?: string;
  /** Athlete turned on reading workouts from Health Connect (Android app only). */
  healthConnectActivities?: boolean;
  healthConnectConnected?: boolean;
  healthConnectLastSync?: string;
  maxHr: number; // e.g. 220 - age or measured
  /** True once the athlete typed it; maxHr is only a placeholder until then. */
  maxHrEntered?: boolean;
  restingHrBaseline: number;
  /** True once the athlete typed it; restingHrBaseline is only a placeholder until then. */
  restingHrEntered?: boolean;
  onboardingCompleted?: boolean;
  activeLocation?: TrainingLocation;
  availableLocations?: TrainingLocation[];
  homeEquipment?: HomeEquipmentTag[];
  /** Granular plate pair counts and dumbbell increments per gym / home profile. */
  equipmentInventories?: Partial<Record<'gym' | 'home', EquipmentInventory>>;
  /** Optional habit anchor (preferred days/time/cue) with non-punitive asynchronous rollover. */
  habitAnchor?: HabitAnchor;
  scheduledWeekLocations?: Record<number, TrainingLocation>; // Planned locations for future mesocycle weeks (e.g. week 5 -> 'travel')
  /** Active time-bounded training environment overlay (auto-reverts on expiry without mutating master program). */
  activeEnvironmentOverlay?: EnvironmentOverlay | null;
  /** Strictly exercise-isolated progression states keyed by exerciseId (never merged across implements). */
  exerciseProgressionStates?: Record<string, ExerciseProgressionState>;
  authUserId?: string;
  email?: string;
  avatarUrl?: string;
  authProvider?: 'google' | 'supabase' | 'guest';
  lastLoginAt?: string;
  /** Opt-in automatic client-side encrypted backup (AES-256-GCM to user's private Google Drive appDataFolder). */
  cloudBackup?: {
    enabled: boolean;
    provider: 'google_drive';
    lastBackedUpAt?: string;
    lastBackupHash?: string;
    lastError?: string;
    lastRestoredAt?: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: 'google' | 'supabase' | 'guest';
  idToken?: string;
  accessToken?: string;
  createdAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  error?: string | null;
}

export function isWearableConnected(profile?: UserProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.wearableSource ||
    profile.fitbitConnected ||
    profile.whoopConnected ||
    profile.healthConnectConnected
  );
}

export function getActiveWearableProvider(profile?: UserProfile | null): WearableProvider | null {
  if (!profile) return null;
  if (profile.wearableSource) return profile.wearableSource;
  if (profile.whoopConnected) return 'whoop';
  if (profile.healthConnectConnected) return 'health_connect';
  if (profile.fitbitConnected) return 'fitbit';
  return null;
}

/** True when the athlete has Whoop configured (OAuth connected, CSV imported, or active wearable source). */
export function isWhoopConfigured(profile?: UserProfile | null): boolean {
  return Boolean(profile && (profile.whoopConnected || profile.wearableSource === 'whoop'));
}

export interface ProgramExerciseOverride {
  id: string;
  planId: PlanId;
  kind:
    | 'swap_exercise'
    | 'add_exercise'
    | 'remove_exercise'
    | 'adjust_sets'
    | 'adjust_rep_range'
    | 'prioritize_first';
  targetExerciseId?: string;
  targetExerciseName?: string;
  replacementExerciseId?: string;
  replacementExerciseName?: string;
  replacementPillar?: ExerciseSession['pillar'];
  replacementEquipment?: ExerciseSession['equipment'];
  replacementRepRange?: [number, number];
  replacementIsTimed?: boolean;
  replacementDurationSeconds?: number;
  sets?: number;
  setDelta?: number;
  repRange?: [number, number];
  workoutFilter?: string;
  reason?: string;
  createdAt: string;
}

export type AssistantActionType =
  | 'UPDATE_EQUIPMENT'
  | 'SCHEDULE_LOCATION_WEEK'
  | 'SWITCH_PROGRAM_SPLIT'
  | 'RESET_PROGRAM'
  | 'MODIFY_PROGRAM'
  | 'SWAP_EXERCISE'
  | 'ADJUST_WORKOUT_VOLUME'
  | 'ADD_EXERCISE'
  | 'REMOVE_EXERCISE'
  | 'LOG_WORKOUT_SET'
  | 'REORDER_WORKOUT'
  | 'UPDATE_EXERCISE_NOTE'
  | 'OVERRIDE_RECOVERY'
  | 'SAVE_ATHLETE_MEMORY'
  | 'DELETE_ATHLETE_MEMORY'
  | 'UPDATE_PROFILE'
  | 'SWITCH_GOAL_PHASE'
  | 'SWITCH_LOCATION'
  | 'SHIFT_WORKOUT'
  | 'UPDATE_GOALS'
  | 'UPDATE_PROGRESS_WIDGETS'
  | 'LOG_BIOMETRIC'
  | 'LOG_ACTIVE_DAY';

export type CoachToolName =
  | 'reset_program'
  | 'modify_program'
  | 'rebalance_program'
  | 'swap_exercise'
  | 'adjust_workout_volume'
  | 'log_workout_set'
  | 'reorder_workout_exercises'
  | 'update_exercise_note'
  | 'override_recovery_gate'
  | 'save_athlete_memory'
  | 'delete_athlete_memory'
  | 'update_athlete_profile'
  | 'modify_workout_exercises'
  | 'switch_location'
  | 'update_home_equipment'
  | 'switch_program'
  | 'switch_goal_phase'
  | 'log_rest_day'
  | 'update_goals'
  | 'update_progress_widgets'
  | 'log_entry';

export type CoachMutationStatus =
  | 'success'
  | 'awaiting_confirmation'
  | 'cancelled'
  | 'error'
  | 'noop';

export interface CoachStateDiff {
  object_type: 'Program' | 'Workout' | 'Exercise' | 'Athlete' | 'Goal' | 'Biometric' | 'ActiveDay' | 'Dashboard';
  object_id: string;
  label: string;
  previous_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
}

export interface CoachSuggestedAction {
  label: string;
  prompt: string;
  /** When true, populates the composer for the athlete to complete instead of sending immediately. */
  fill?: boolean;
}

export interface CoachPendingConfirmation {
  tool_name:
    | 'reset_program'
    | 'swap_exercise'
    | 'adjust_workout_volume'
    | 'modify_program'
    | 'rebalance_program'
    | 'override_recovery_gate'
    | 'delete_athlete_memory';
  args: Record<string, unknown>;
  title: string;
  summary: string;
  warning: string;
  confirm_label: string;
  cancel_label: string;
  preview_diff?: CoachStateDiff;
  status?: 'pending' | 'confirmed' | 'cancelled';
}

export interface CoachUndoSnapshot {
  label: string;
  previousProfile?: Partial<UserProfile>;
  previousWorkout?: WorkoutSession;
  previousBiometrics?: BiometricLog[];
  previousActivities?: ActivityLog[];
  undone?: boolean;
}

export interface AssistantActionPayload {
  type: AssistantActionType;
  summary: string;
  toolName?: CoachToolName;
  mutationStatus?: CoachMutationStatus;
  stateDiff?: CoachStateDiff;
  details?: Record<string, any>;
}

export interface ScientificPrinciple {
  id: string;
  topic: string;
  title: string;
  formula?: string;
  scientificRationale: string;
  academicCitation: string;
  practicalApplication: string;
  keywords: string[];
}

export interface AssistantChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actionApplied?: AssistantActionPayload;
  mutationStatus?: CoachMutationStatus;
  stateDiff?: CoachStateDiff;
  pendingConfirmation?: CoachPendingConfirmation;
  memorySaved?: AthleteMemoryFact;
  undoSnapshot?: CoachUndoSnapshot;
  suggestedActions?: CoachSuggestedAction[];
  navigateTarget?: 'train' | 'program' | 'analytics';
  navigateDetail?: {
    detail?: string;
    goalId?: string;
    exerciseId?: string;
  };
  navigateLabel?: string;
  knowledgeGraphCitations?: {
    label: string;
    metric: string;
    value: string;
  }[];
  scientificPrinciplesCited?: ScientificPrinciple[];
  latencyMs?: number;
  backend?: string;
  isTensorAccelerated?: boolean;
}

export type DesignSystemComponentCategory =
  | 'typography'
  | 'button'
  | 'card'
  | 'input'
  | 'pill'
  | 'modal'
  | 'badge'
  | 'toggle'
  | 'layout'
  | 'navigation';

export interface DesignSystemComponent {
  id: string;
  name: string;
  category: DesignSystemComponentCategory;
  anatomy: {
    container: string;
    typography: string;
    colors: string;
    states: Record<string, string>;
    touchTarget: string;
    iconSpec?: string;
  };
  logic: {
    rules: string[];
    variants: Record<string, string>;
    accessibility: string;
  };
  tailwindTokens: string;
  rationale: string;
}

