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
  source?: WearableProvider;
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

export interface WorkoutSet {
  id: string;
  setNumber: number;
  targetWeightKg: number;
  actualWeightKg?: number;
  targetReps: number;
  actualReps?: number;
  targetRir: number; // 0, 1, 2, 3+
  actualRir?: number;
  completed: boolean;
  completedAt?: string;
  isWarmup?: boolean;
  setType?: SetType;
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
  xpEarned: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  durationMinutes?: number;
  location?: TrainingLocation;
  whoopStrain?: number; // 0 - 21 Whoop workout strain
  kilojoules?: number; // energy burned during session
  wearableSource?: WearableProvider;
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

export type ProgramSplitType = 'ppl_upper' | 'ppl' | 'upper_lower' | 'full_body';

export interface UserProfile {
  name: string;
  gender: Gender;
  age: number;
  heightCm: number;
  goalPhase: GoalPhase;
  programType?: ProgramSplitType;
  mesocycleWeek?: number; // 1 to 6
  level: number;
  currentXp: number;
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
  healthConnectConnected?: boolean;
  healthConnectLastSync?: string;
  maxHr: number; // e.g. 220 - age or measured
  restingHrBaseline: number;
  onboardingCompleted?: boolean;
  activeLocation?: TrainingLocation;
  availableLocations?: TrainingLocation[];
  homeEquipment?: HomeEquipmentTag[];
  scheduledWeekLocations?: Record<number, TrainingLocation>; // Planned locations for future mesocycle weeks (e.g. week 5 -> 'travel')
  leaderboardOptIn?: boolean;
  leaderboardDisplayName?: string;
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

export type AssistantActionType =
  | 'UPDATE_EQUIPMENT'
  | 'SCHEDULE_LOCATION_WEEK'
  | 'SWITCH_PROGRAM_SPLIT'
  | 'SWITCH_GOAL_PHASE'
  | 'SWITCH_LOCATION'
  | 'SHIFT_WORKOUT';

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
  | 'layout';

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

