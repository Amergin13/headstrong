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
  isIsolation?: boolean; // True for isolation movements (lateral raises, curls, pushdowns, calves)
  movementFamily?: string; // Canonical movement vector ID in the Knowledge Graph
  movementFamilyLabel?: string; // Plain-English movement family name (e.g. "Horizontal Chest Press")
  environments?: TrainingLocation[]; // Where this exercise can be performed ('gym', 'home', 'travel')
  requiredHomeEquipment?: HomeEquipmentTag[]; // Equipment needed when training at home
  whyItWorks?: string; // Plain-English biomechanical rationale for why this alternative works
  resistanceProfile?: ResistanceProfile; // 'lengthened' | 'mid' | 'shortened'
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
  isIsolation?: boolean;
  movementFamily?: string;
  movementFamilyLabel?: string;
  resistanceProfile?: ResistanceProfile;
  sfrScore?: number;
  minReps: number;
  maxReps: number;
  sets: WorkoutSet[];
  notes?: string;
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
  /** Working-set IDs already celebrated as a personal best this session. */
  celebratedSetIds?: string[];
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

export type ProgramSplitType = 'ppl_upper' | 'ppl' | 'upper_lower' | 'full_body' | 'muscle_building_6wk' | 'starter_6wk' | 'starter_4day';

/**
 * The 6-week plans. Everyone gets a goal-based starter plan: 'starter_6wk' (lift 3 days + 1 active day,
 * the default) or 'starter_4day' (lift 4 days). The 24-workout muscle plan is the owner's only.
 */
export type PlanId = 'muscle_building_6wk' | 'starter_6wk' | 'starter_4day';

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
  | 'measurements'
  | 'strength-standards'
  | 'strength-levels'
  | 'balance'
  | 'whoop-summary';

export type ProgressWidgetId =
  | CoreProgressWidgetId
  | `exercise:${string}`
  | `chart:${string}`;

export interface UserProfile {
  /** Goals changed on the Progress page; see GoalSettings. */
  goalSettings?: GoalSettings;
  /** Customised widget selection for the Progress screen; undefined uses the defaults. */
  progressWidgets?: ProgressWidgetId[];
  name: string;
  gender: Gender;
  /** True once the athlete chose it (Settings or the weight form); until then gender is a default. */
  sexEntered?: boolean;
  /** Training experience chosen in onboarding; calibrates starting weights. */
  experienceLevel?: ExperienceLevel;
  /** Display/input unit for weights. Data is always stored in kg. */
  weightUnit?: 'kg' | 'lb';
  /** Placeholder (25) until the athlete enters it; see ageEntered. */
  age: number;
  /** True once the athlete entered their age (Settings); strength standards use the 18–39 table until then. */
  ageEntered?: boolean;
  heightCm: number;
  /** Height the athlete entered themselves; heightCm is only a placeholder until then. */
  measuredHeightCm?: number;
  goalPhase: GoalPhase;
  programType?: ProgramSplitType;
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
  scheduledWeekLocations?: Record<number, TrainingLocation>; // Planned locations for future mesocycle weeks (e.g. week 5 -> 'travel')
  authUserId?: string;
  email?: string;
  avatarUrl?: string;
  authProvider?: 'google' | 'supabase' | 'guest';
  lastLoginAt?: string;
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

export type AssistantActionType =
  | 'UPDATE_EQUIPMENT'
  | 'SCHEDULE_LOCATION_WEEK'
  | 'SWITCH_PROGRAM_SPLIT'
  | 'SWITCH_GOAL_PHASE'
  | 'SWITCH_LOCATION'
  | 'SHIFT_WORKOUT'
  | 'UPDATE_GOALS'
  | 'UPDATE_PROGRESS_WIDGETS';

export interface AssistantActionPayload {
  type: AssistantActionType;
  summary: string;
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

