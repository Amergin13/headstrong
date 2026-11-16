import { PROGRESSION_RULES } from './progressionRules';
import {
  BiometricLog,
  BodyMeasurementSite,
  DesignSystemComponent,
  DesignSystemComponentCategory,
  ExerciseDefinition,
  JointType,
  ReadinessState,
  ResistanceProfile,
  ScientificPrinciple,
  UserProfile,
  WorkoutSession,
  isWhoopConfigured,
} from './types';
import { localDateString, parseLocalDate } from '../utils/date';
import { formatWeight } from '../utils/units';
import { buildBodyweightEmaLookup, calculateEmaSeries, getLatestBodyweightEma } from './ema';
import { ActivityLog } from './activeDays';
import { AthleteGoal, buildAthleteGoals } from '../services/athleteGoals';
export type { ScientificPrinciple, DesignSystemComponent, DesignSystemComponentCategory };
import { HYPERTROPHY_VOLUME_LANDMARKS, evaluateVolumeStatus } from './hypertrophyVolume';
import { calculateE1RM } from './e1rm';
import { calculateDailyReadiness, displayRecoveryScore } from './readiness';
import {
  BODY_MEASUREMENT_SITES,
  RENPHO_SCALE_METRICS,
  RenphoScaleMetricUnitKind,
} from '../services/renphoBluetooth';

export type KgNodeCategory = 'athlete' | 'muscle' | 'joint' | 'biometric' | 'pillar';

export interface KgNode {
  id: string;
  label: string;
  category: KgNodeCategory;
  score: number; // Normalized 0 - 100 health/adaptation score
  status: 'optimal' | 'elevated' | 'warning' | 'under';
  subtitle: string;
  metrics: Record<string, string | number>;
  detailText: string;
}

export interface KgEdge {
  id: string;
  source: string;
  target: string;
  relation: 'STIMULATES' | 'LOADS_JOINT' | 'MODULATES_RECOVERY' | 'DRIVES_ADAPTATION';
  weight: number; // 0.1 - 1.0
  label: string;
}

export interface JointStrainProfile {
  joint: JointType;
  strainScore: number; // 0 - 100
  status: 'Optimal' | 'Moderate Load' | 'High Strain Alert';
  topContributors: string[];
  biomechanicalAdvice: string;
}

export interface MuscleAdaptationProfile {
  muscleKey: string;
  displayName: string;
  weeklySets: number;
  populationMav: [number, number];
  personalizedMav: [number, number];
  lengthenedBiasPct: number; // % of sets in lengthened resistance profile
  avgSfr: number; // 1.0 - 10.0
  e1rmVelocityPct: number; // 6-week progression %
  recommendation: string;
}

export interface CausalInsight {
  id: string;
  category: 'Biomechanical' | 'Autonomic' | 'Hypertrophy' | 'Joint Health';
  title: string;
  confidence: number; // e.g. 94%
  impactMetric: string;
  narrative: string;
  actionableStep: string;
}

export interface KgMetricTrend {
  id: string;
  field: keyof BiometricLog;
  label: string;
  shortLabel: string;
  category: 'scale' | 'tape';
  unitKind: RenphoScaleMetricUnitKind | 'length';
  latest?: number;
  latestDate?: string;
  baseline?: number;
  baselineDate?: string;
  delta?: number;
  deltaPct?: number;
  ema7d?: number;
  sampleCount: number;
  direction: 'up' | 'down' | 'flat' | 'empty';
  points: Array<{ date: string; value: number }>;
}

export interface KgBilateralPair {
  id: 'bicep' | 'thigh' | 'calf';
  label: string;
  leftSite: BodyMeasurementSite;
  rightSite: BodyMeasurementSite;
  leftCm?: number;
  rightCm?: number;
  diffCm?: number;
  asymmetryPct?: number;
  dominantSide?: 'left' | 'right' | 'balanced';
  status: 'balanced' | 'mild_asymmetry' | 'notable_asymmetry' | 'insufficient_data';
  summary: string;
}

export interface BodyCompositionKnowledgeProfile {
  scaleTrends: KgMetricTrend[];
  tapeTrends: KgMetricTrend[];
  bilateralSymmetry: KgBilateralPair[];
  recompositionStatus: 'recomp_positive' | 'lean_gain' | 'fat_loss' | 'holding' | 'insufficient_data';
  recompositionSummary: string;
  populatedScaleCount: number;
  populatedTapeCount: number;
  latestScaleDate?: string;
  latestTapeDate?: string;
}

export interface KgStepsSummary {
  todaySteps?: number;
  latestSteps?: number;
  latestStepsDate?: string;
  avg7d?: number;
  previous7dAvg?: number;
  avg14d?: number;
  loggedDays: number;
  goalTarget?: number;
  trend: 'up' | 'down' | 'flat' | 'insufficient_data';
  summary: string;
}

export interface KgWhoopSummary {
  configured: boolean;
  recoveryScore?: number;
  dayStrain?: number;
  workoutStrain?: number;
  hrvRmssd?: number;
  restingHr?: number;
  sleepHours?: number;
  sleepPerformance?: number;
  sleepEfficiency?: number;
  respiratoryRate?: number;
  spo2?: number;
  skinTemp?: number;
  latestDate?: string;
}

export interface KgActivitySummary {
  completedWorkouts: number;
  lastWorkoutDate?: string;
  lastWorkoutName?: string;
  loggedActivities: number;
  activitiesLast7d: number;
  activeMinutesLast7d: number;
}

export type ExerciseNoteCategory =
  | 'pain_discomfort'
  | 'fatigue_heavy'
  | 'strong_easy'
  | 'equipment_setup'
  | 'technique_cue'
  | 'general';

export interface ExerciseNoteEntry {
  exerciseId: string;
  exerciseName: string;
  date: string;
  workoutId: string;
  note: string;
  category: ExerciseNoteCategory;
  readinessState: ReadinessState;
  bestE1rmKg?: number;
  topWeightKg?: number;
  topReps?: number;
}

export interface AthleteKnowledgeGraph {
  nodes: KgNode[];
  edges: KgEdge[];
  joints: JointStrainProfile[];
  muscleProfiles: MuscleAdaptationProfile[];
  /**
   * What the athlete is working towards: process goals (train 4 times a week) and outcome goals
   * (each movement's next strength level). See services/athleteGoals.ts.
   */
  goals: AthleteGoal[];
  bodyComposition: BodyCompositionKnowledgeProfile;
  stepsSummary: KgStepsSummary;
  whoopSummary: KgWhoopSummary;
  activitySummary: KgActivitySummary;
  /** Chronological athlete notes captured on exercise blocks across workouts (newest first). */
  exerciseNotesHistory: ExerciseNoteEntry[];
  insights: CausalInsight[];
  scientificKnowledgeBase: ScientificPrinciple[];
  designSystem: DesignSystemComponent[];
  systemicAxialLoadScore: number; // 0 - 100
  lengthenedStimulusRatio: number; // 0 - 100%
  recoveryEfficiencyScore: number; // 0 - 100
}

/**
 * Authoritative Exercise Science & Biomechanical Knowledge Base:
 * Codified mathematical models, exercise physiology laws, and wearable telemetry principles
 * powering deterministic Knowledge Graph grounding for both the app UI and the On-Device AI Coach.
 */
export const EXERCISE_SCIENCE_KNOWLEDGE_BASE: ScientificPrinciple[] = [
  {
    id: 'sp-e1rm',
    topic: 'Load Mechanics & E1RM',
    title: 'RIR-Adjusted Estimated 1-Rep Max (E1RM)',
    formula: 'E1RM = Effective Weight × (1 + (Reps + RIR) / 30)',
    scientificRationale:
      'Based on an augmented Lombardi/Epley progression model. Accounting for Repetitions in Reserve (RIR) standardizes true neuromuscular capacity without the severe injury and systemic fatigue costs of taking heavy compound lifts to absolute concentric failure.',
    academicCitation: 'Epley (1985); Lombardi (1989); Zourdos et al. (2016)',
    practicalApplication:
      'Calculates your working 1-rep maximum on every set, normalizes strength across different rep ranges, and benchmarks your progress against international strength standards.',
    keywords: ['e1rm', '1rm', 'epley', 'lombardi', 'e1rm formula', 'reps in reserve', 'rir', 'one rep max', 'one-rep max', 'rep max', 'estimate max', 'estimated max', 'estimated 1rm', 'estimated strength', 'calculate max', 'strength formula'],
  },
  {
    id: 'sp-db-multiplier',
    topic: 'Cross-Implement Continuity',
    title: 'Dumbbell Stabilizer Multiplier (1.18x)',
    formula: 'Effective Barbell-Equivalent = Combined Dumbbell Weight × 1.18',
    scientificRationale:
      'Dumbbells require independent neuromuscular control across multiple rotational axes, recruiting rotator cuff and serratus stabilizers while exhibiting a bilateral force deficit compared to a rigid barbell bar.',
    academicCitation: 'Saeterbakken, van den Tillaar & Fimland (2011), J Sports Sci: dumbbell bench 1RM ~17% below barbell, so 1.18x is an approximation',
    practicalApplication:
      'Allows seamless progressive overload when training with dumbbells at home. For example, pressing two 30 kg dumbbells (60 kg total) provides an authoritative 70.8 kg barbell bench press equivalent.',
    keywords: ['dumbbell', 'dumbbells', 'db', 'dumbbell multiplier', '1.18', '1.18x', 'stabilizer', 'bilateral deficit', 'barbell equivalent', 'barbell vs dumbbell', 'single dumbbell', 'dumbbell bench'],
  },
  {
    id: 'sp-rdl-multiplier',
    topic: 'Cross-Implement Continuity',
    title: 'Romanian Deadlift (RDL) Multiplier (1.20x)',
    formula: 'Effective Deadlift-Equivalent = RDL Weight × 1.20',
    scientificRationale:
      'The Romanian Deadlift loads the posterior chain (hamstrings, glutes, and erector spinae) under deep eccentric stretch without quad drive from the floor, resulting in ~20% higher posterior chain mechanical tension per unit of load compared to conventional deadlifts.',
    academicCitation: 'Schoenfeld et al. (2020); Escamilla et al. (2000)',
    practicalApplication:
      'Normalizes posterior chain loading when performing RDLs at home or the gym against international hinge standards.',
    keywords: ['rdl', 'romanian deadlift', 'rdl multiplier', 'romanian deadlift multiplier', 'deadlift multiplier', '1.2', '1.20', '1.2x', '1.20x', 'hinge multiplier', 'posterior chain', 'deadlift equivalent'],
  },
  {
    id: 'sp-calisthenics-load',
    topic: 'Load Mechanics & E1RM',
    title: 'Weighted Calisthenics Total Mass Equation',
    formula: 'Effective Weight = 7-Day EMA Bodyweight + External Load',
    scientificRationale:
      'Bodyweight movements (pull-ups, chin-ups, dips) lift the athlete’s body mass against gravity. External plate load must be added to smoothed bodyweight to compute true mechanical tension.',
    academicCitation: 'Ronai et al. (2014); Sanchez-Moreno et al. (2020)',
    practicalApplication:
      'For bodyweight-only pull-ups, external load is 0 kg while total effective mass equals bodyweight (e.g. 80 kg), properly crediting vertical pull volume and DOTS scores.',
    keywords: ['pullup', 'pull-up', 'chin-up', 'dip', 'calisthenics', 'bodyweight load', 'weighted pullup', 'external load', 'calisthenics load'],
  },
  {
    id: 'sp-ema-bw',
    topic: 'Relative Strength Standards',
    title: '7-Day Bodyweight Exponential Moving Average (EMA)',
    formula: 'EMA_today = (Weight_today × 0.25) + (EMA_yesterday × 0.75)',
    scientificRationale:
      'Daily scale weight fluctuates by 1–3 kg due to glycogen storage (1g glycogen binds ~3g water), sodium-potassium fluid shifts, and gastrointestinal transit. A 7-day EMA dampens high-frequency noise to reveal true tissue changes.',
    academicCitation: 'Morton et al. (2018); Helms et al. (2014)',
    practicalApplication:
      'Used for all relative strength ratios and DOTS scoring so temporary water retention never distorts your strength classifications.',
    keywords: ['ema', 'bodyweight', 'average', 'scale weight', 'water retention', 'glycogen', 'smoothing', '7-day', 'body weight average'],
  },
  {
    id: 'sp-dots-polynomial',
    topic: 'Relative Strength Standards',
    title: 'Official International DOTS Polynomial',
    formula: 'DOTS = E1RM_kg × (500 / (A·w⁴ + B·w³ + C·w² + D·w + E))',
    scientificRationale:
      'Eliminates allometric scaling bias. Pure strength-to-weight ratios (e.g. 2x bodyweight) unfairly penalize heavier lifters due to the square-cube law (muscle cross-sectional area scales with length squared, but mass scales with length cubed). DOTS mathematically normalizes strength across all bodyweights.',
    academicCitation: 'International Powerlifting Federation (IPF) Scientific Commission (2019)',
    practicalApplication:
      'Provides an unbiased score normalizing strength across bodyweights so heavier and lighter lifters are evaluated fairly.',
    keywords: ['dots', 'polynomial', 'relative strength', 'ipf', 'powerlifting', 'formula', 'allometric', 'coefficient', 'dots score', 'strength score', 'strength-to-weight'],
  },
  {
    id: 'sp-6-pillars',
    topic: 'Relative Strength Standards',
    title: 'Strength Levels, Balance and Left/Right Symmetry',
    formula:
      'Level: best estimated max vs Kilgore standard for sex, bodyweight class and age (Untrained → Elite, I–IV each). Chin-up (bodyweight included) ≈ 81% of bench (Poliquin). Symmetry = weaker side ÷ stronger side, flagged under 90%.',
    scientificRationale:
      "Squat, deadlift, bench press and standing press levels use Dr Lon Kilgore's performance standards (ExRx.net), built from nearly 70 years of weightlifting and powerlifting performance data for adults, by sex, bodyweight class and age group (18–39, 40–49, 50–59, 60–69). Chin-ups are judged with Charles Poliquin's structural balance ratio: a supinated chin-up 1RM, bodyweight included, of about 81% of the close-grip bench press (elite male athletes, 1999); Treise applies it to the bench press it logs. Rows have no published standard, so they get no level. Large gaps between movements and left/right differences under 90% are flagged: 90% limb symmetry is the line used in return-to-sport criteria (Grindem et al., 2016).",
    academicCitation:
      'Kilgore L. Strength performance standards, ExRx.net; Poliquin C. Achieving Structural Balance, T-Nation (1999); Grindem H et al., Br J Sports Med 2016;50:804–808; van den Hoek DJ et al., J Sci Med Sport 2024;27(10):734–742 (normative powerlifting data, 809,986 entries).',
    practicalApplication:
      'Progress → Strength standards shows your level on each lift (Tested when it came from the standard lift for 5 reps or fewer, otherwise Estimated), how it has changed since you started, and a Balance card for imbalances between lifts and weaker sides. Log single-arm and single-leg sets with "Log each side".',
    keywords: [
      '6 pillars', 'pillars', 'standard', 'standards', 'tier', 'tiers', 'strength tier', 'strength tiers', 'sub-tier',
      'untrained', 'novice', 'intermediate', 'advanced', 'elite', 'strength level', 'strength levels', 'strength standards',
      'squat standard', 'bench standard', 'deadlift standard', 'press standard', 'overhead press standard', 'ohp standard',
      'chin-up standard', 'pull-up standard', 'kilgore', 'poliquin', 'exrx', 'grindem', '81%', '90%', 'age group',
      'bodyweight class', 'weight class', 'frameworks', 'structural balance', 'imbalance', 'asymmetry', 'symmetry',
      'left vs right', 'left side', 'right side', 'unilateral', 'single-arm', 'single-leg', 'limb symmetry',
      'tested', 'estimated', 'tested vs estimated', 'level',
    ],
  },
  {
    id: 'sp-autonomic-readiness',
    topic: 'Biometric Auto-Regulation',
    title: 'Daily Readiness Z-Score & Wearable Telemetry (Fitbit, Whoop, Android Health Connect)',
    formula: 'Readiness = 0.50·Z_ln(HRV) - 0.30·Z_RHR + 0.20·((Sleep - 7.5)/1.5)',
    scientificRationale:
      'Nighttime Heart Rate Variability (log-transformed HRV RMSSD to normalize right-skewed autonomic distributions) and Resting Heart Rate (RHR) benchmarked against a 14-day rolling baseline reflect parasympathetic autonomic nervous system balance. Telemetry from Fitbit, Whoop 4.0, or Android Health Connect tracks systemic recovery. Suppressed HRV combined with elevated resting pulse signals central nervous system fatigue and incomplete microtrauma repair.',
    academicCitation: 'Plews et al. (2013); Buchheit (2014); Altini & Plews (2021); Whoop 4.0 Telemetry Validation (2022)',
    practicalApplication:
      'Auto-regulates daily training: Primed (Z >= +0.8, push for records), Normal (-0.8 < Z < +0.8), or Amber Shield (Z <= -0.8, holds working weight, 2–3 RIR, protects streak and joints). Seamlessly driven by Google Pixel Watch, Fitbit, Whoop, or Android Health Connect.',
    keywords: [
      'readiness', 'z-score', 'hrv', 'heart rate variability', 'hrv baseline', '14-day baseline', 'rmssd',
      'resting hr', 'resting heart rate', 'rhr', 'sleep', 'amber shield', 'primed', 'recovery', 'recovery score',
      'pixel watch', 'fitbit', 'whoop', 'health connect', 'android health connect', 'autonomic', 'parasympathetic',
      'readiness score', 'wearable',
    ],
  },
  {
    id: 'sp-double-progression',
    topic: 'Progression Mechanics',
    title: 'Double Progression Auto-Regulation Logic',
    formula: `Every set at the top of the rep range with >= ${PROGRESSION_RULES.minRirForProgress} rep in reserve (or the planned 0 RIR) -> +${PROGRESSION_RULES.barbellIncrementKg} kg barbell / +${PROGRESSION_RULES.dumbbellIncrementKg} kg dumbbell / +${PROGRESSION_RULES.otherIncrementKg} kg machine and cable; inside the range -> same weight, +${PROGRESSION_RULES.repStep} rep; missed reps, ground-out sets or low recovery -> no increase; never more than +${Math.round(PROGRESSION_RULES.maxSessionIncreaseFraction * 100)}% plus one step per session`,
    scientificRationale:
      'Prevents the common pitfall of increasing weight too early, which compromises technique and reduces effective motor unit recruitment. Lifters first master the rep range with reps in reserve, then add load. Reps taken to failure when the plan did not ask for it signal the weight is not yet owned, so load holds.',
    academicCitation: 'Helms, Morgan & Valdez (2019); Israetel, Feather & Helms (2020)',
    practicalApplication:
      `Tells you exactly what to lift on each set. In the 6-week plan each workout sets a fixed rep target, which is the top of the range: hit it on every set with reps to spare and the weight goes up by ${PROGRESSION_RULES.barbellIncrementKg} kg (${PROGRESSION_RULES.dumbbellIncrementKg} kg on dumbbells) next time; miss it and the weight stays where your reps say it should. In the other splits you add ${PROGRESSION_RULES.repStep} rep at the same weight until you reach the top of the range. Each exercise's own last session sets its next weight; a similar exercise is only used the first time.`,
    keywords: ['double progression', 'progression', 'add weight', 'add rep', 'rep range', 'auto-regulation', 'overload', 'progressive overload'],
  },
  {
    id: 'sp-muscle-progress',
    topic: 'Progress Tracking',
    title: 'Measuring Progress per Muscle: Sets, Strength and Size',
    formula:
      'Weekly hard sets (<= 3 reps in reserve; main muscle 1 set, helping muscle 0.5) vs personal target; strength index = 100 x chain of weekly weighted mean (best estimated max this week / previous best) per exercise (main 1, helper 0.5; sets over 15 reps excluded); size = tape measurement for the muscle',
    scientificRationale:
      'Muscle growth rises with weekly hard sets up to a point (dose-response), and sets where a muscle only assists count about half. Strength is specific to each exercise, so each lift is compared only with itself and the changes are averaged, which keeps the index honest when exercises are swapped. Circumference is the most practical sign of actual size change. Together they separate what drove growth, what the muscle can now do, and what changed.',
    academicCitation: 'Schoenfeld, Ogborn & Krieger (2017); Baz-Valle et al. (2022); Pelland et al. (2024)',
    practicalApplication:
      "The Progress tab's Muscles view shows, for each muscle, this week's hard sets against your target, a strength index that starts at 100, and its tape measurement when you log one. Each exercise card shows this week's sets for its main muscle.",
    keywords: ['muscle progress', 'progress per muscle', 'muscle', 'muscle group', 'weekly sets', 'strength index', 'progress', 'chest', 'back', 'arms', 'legs', 'hypertrophy tracking'],
  },
  {
    id: 'sp-starter-plan',
    topic: 'Program Design',
    title: 'The 6-Week Starter Plan: 4 Sessions a Week, Set for Your Goal',
    formula:
      '24 sessions = 6 weeks x 4. Default: 3 full-body workouts (A and B alternating) + 1 active day (any ride, run, walk, swim or class of 20+ minutes). Or: 4 upper/lower workouts with the same weekly sets per muscle. Sets per exercise: weeks 1-2 = 2, weeks 3-4 = 3, weeks 5-6 = 3 (+1 on smaller muscles for Build Muscle). Reps in reserve: 3 -> 2 -> 1 (Stay Lean ends at 2). Reps: big lifts 6-10 (Lose Fat 5-8), other compounds 8-12 (Lose Fat 6-10), isolation 10-15, side shoulders 12-20.',
    scientificRationale:
      'In new gym members, exercising at least 4 times a week for 6 weeks was the minimum linked to forming an exercise habit, and any exercise counted. Muscle growth depends on hard sets per muscle and training each muscle about twice a week, which 3 full-body days provide; spreading the same weekly sets over 4 days gives similar growth. New lifters progress well on 2-3 lifting days. Loads from about 6 to 20 reps build muscle when sets finish close to failure. When losing fat, keeping the weights heavy without adding volume holds on to strength and muscle while eating less.',
    academicCitation:
      'Kaushal & Rhodes (2015); ACSM Progression Models (2009); Schoenfeld, Ogborn & Krieger (2016, 2017); Schoenfeld et al. (2017, 2019); Helms et al. (2014); Murphy & Koehler (2022); Refalo et al. (2023)',
    practicalApplication:
      'Each week has 4 sessions. By default that is 3 lifting workouts we set for you plus 1 active day of anything you enjoy; a watch or Health Connect can add the active day automatically. If you can lift 4 days, choose 4 shorter upper and lower body workouts instead. The first two weeks are easier while you learn the lifts, then sets and effort build. Missing a day never resets the plan.',
    keywords: ['starter plan', 'plan', 'program', 'full body', '3 days', 'three days', '4 days', 'four days', 'active day', 'habit', 'cardio', 'cycling', 'beginner', 'frequency', 'how often', 'split', 'lose fat', 'build muscle', 'stay lean', 'goal'],
  },
  {
    id: 'sp-hypertrophy-landmarks',
    topic: 'Hypertrophy Volume Landmarks',
    title: 'Israetel & Schoenfeld Muscle Volume Landmarks (MV/MEV/MAV/MRV)',
    formula: 'Weekly Hard Sets MAV: Side Delts (16-26), Calves (16-24), Rear Delts (14-22), Back (14-22), Chest (12-18), Quads (12-18), Triceps (12-18), Biceps (12-20), Glutes (10-16), Hamstrings (10-16), Front Delts (8-14), Core (8-16); scaled ×0.85 while losing fat, ×1.05 lean bulking',
    scientificRationale:
      'Different muscles possess radically divergent fiber type composition, eccentric stretch microtrauma, and axial CNS strain. Side delts (zero axial load, fatigue-resistant) thrive on 20+ weekly sets; hamstrings (fast-twitch dominant, severe stretch damage) exceed MRV past 16–18 sets. Primary muscles earn 1 hard set per working set at <= 3 RIR, while synergistic assisting muscles earn 0.5 sets.',
    academicCitation: 'Schoenfeld, Ogborn & Krieger (2017); Israetel et al. (2019); Pelland et al. (2024)',
    practicalApplication:
      'Calibrates weekly set targets for all 12 tracked muscle groups so each receives optimal hypertrophy stimulus without crossing into wasted excess volume or systemic fatigue.',
    keywords: ['volume landmarks', 'mav', 'mev', 'mrv', 'mv', 'minimum effective volume', 'maximum recoverable volume', 'israetel', 'schoenfeld', 'sets per week', 'how many sets', 'how are sets calculated', 'optimal volume', 'hypertrophy landmarks', 'hamstrings', 'side delts', 'calves', 'glutes', 'core', 'muscle recovery'],
  },
  {
    id: 'sp-retention-shield',
    topic: 'Nutrition & Retention',
    title: 'Caloric Deficit Muscle Retention & Volume Scaling (Retention Shield)',
    formula: 'Volume scaled to ~85% (~2-3 sets/exercise); Heavy Mechanical Tension (1-2 RIR) Prioritized',
    scientificRationale:
      'In a caloric deficit, muscle protein synthesis (MPS) is reduced and systemic recovery drops by 15–20%. Performing excessive volume (MRV) elevates cortisol and accelerates muscle protein breakdown. Preserving muscle requires high mechanical tension signals, not high-volume exhaustion.',
    academicCitation: 'Helms, Aragon & Fitschen (2014); Murphy & Koehler (2022)',
    practicalApplication:
      'Activates the Retention Shield in Cut / Recomp mode: holds volume at 2–3 sets and celebrates steady weight holding, knowing DOTS relative strength rises as body fat drops.',
    keywords: ['cut', 'cutting', 'recomp', 'retention shield', 'caloric deficit', 'lose fat', 'maintain muscle', 'deficit volume', 'helms', 'retention'],
  },
  {
    id: 'sp-bodyweight-travel',
    topic: 'Cross-Implement Continuity',
    title: 'Bodyweight Hypertrophy & 0kg External Load Mechanics',
    formula: 'External Load = 0 kg; Reps: 15–30 @ 1–2 RIR + 3s Eccentric & 2s Paused Stretch',
    scientificRationale:
      'Lifting light loads or pure bodyweight stimulates equal hypertrophy to heavy weights provided sets are taken within 1–3 reps of failure. Terminal motor unit recruitment is achieved via the size principle as muscle fibers fatigue.',
    academicCitation: 'Schoenfeld, Grgic, et al. (2016); Pedrosa et al. (2022)',
    practicalApplication:
      'When in Travel mode, Treise sets target weight strictly to 0 kg (never telling you to add +5kg) and calibrates reps to your strength level with lengthened tempo cues.',
    keywords: ['travel', 'bodyweight', 'hotel', 'no weights', 'deficit pushup', '0kg', 'bodyweight reps', 'calisthenics reps', 'hotel workout'],
  },
  {
    id: 'sp-rest-intervals',
    topic: 'Physiology & Recovery',
    title: 'Rest Interval Physiology & Neuromuscular Recovery',
    formula: 'About 2–3 min for heavy compound lifts; 60–90 sec for smaller muscles',
    scientificRationale:
      'Resynthesis of cellular phosphocreatine (PCr) follows a biphasic recovery curve: ~70% in 30 seconds, ~90% in 90 seconds, and >98% by 3 minutes. Truncating rest on compound squats or bench presses impairs subsequent set volume load and motor unit recruitment.',
    academicCitation: 'Henselmans & Schoenfeld (2014); Schoenfeld et al. (2016)',
    practicalApplication:
      'The rest timer counts each exercise\'s planned rest: about 2.5 minutes for the main lifts, 2 minutes for other compound lifts, and 60–75 seconds for smaller muscles. Ask the coach "how long should I rest" for today\'s exact times.',
    keywords: ['rest', 'rest time', 'rest interval', 'between sets', 'how long to rest', 'pcr', 'phosphocreatine', 'timer', 'rest duration'],
  },
  {
    id: 'sp-stretch-hypertrophy',
    topic: 'Physiology & Recovery',
    title: 'Stretch-Mediated Hypertrophy & Lengthened Position Tension',
    formula: '2–3s Controlled Lowering + 2s Paused Stretch in Full Extension',
    scientificRationale:
      'Tension applied at long muscle lengths causes passive tension in titin filaments, triggering longitudinal sarcomere addition (sarcomerogenesis in series) and elevated muscle protein synthesis compared to contracted-position loading.',
    academicCitation: 'Pedrosa et al. (2022); Wolf et al. (2023)',
    practicalApplication:
      'Tracks your Lengthened Stimulus Ratio (% of sets loaded at long lengths) and provides tactical stretch tempo cues.',
    keywords: ['stretch', 'lengthened', 'eccentric', 'tempo', 'sarcomerogenesis', 'titin', 'long muscle length', 'stretch-mediated', 'stretch hypertrophy'],
  },
  {
    id: 'sp-meso-periodization',
    topic: 'Periodization',
    title: '6-Week Mesocycle Periodization Wave',
    formula: 'W1 (MEV @ 2-3 RIR) -> W3 (Core MAV @ 1-2 RIR) -> W5 (Near-MRV @ 0-1 RIR) -> W6 (Deload MV @ 3-4 RIR)',
    scientificRationale:
      'Periodizing volume across 6 weeks prevents the repeated bout effect and neuromuscular accommodation. A planned deload in Week 6 allows connective tissue recovery and resets muscle sensitivity to anabolic tension.',
    academicCitation: 'Israetel (2017); Plisk & Stone (2003)',
    practicalApplication:
      'Automatically modulates target RIR and set counts across your 6-week training block on the Program tab (while dedicated transformation plans periodize intensity phases across 3 two-week waves).',
    keywords: ['mesocycle', 'periodization', 'deload', 'week 1', 'week 6', 'overreaching', 'volume wave', 'training block', 'periodize'],
  },
  {
    id: 'sp-asynchronous-queue',
    topic: 'Periodization',
    title: 'Asynchronous Hypertrophy Queue Mechanics',
    formula: 'Sequential Rotation (Push -> Pull -> Legs -> Upper); Advance on Completion Only',
    scientificRationale:
      'Muscular recovery and protein synthesis operate on 48h–72h biological clocks, not arbitrary 7-day human calendars. Missing a calendar day does not reduce muscular capacity; holding the queued workout allows optimal training with full glycogen stores.',
    academicCitation: 'Fisher, Steele & Smith (2013)',
    practicalApplication:
      'Eliminates missed workout guilt: if work or travel delays a session, your next planned workout waits at the front of the queue with zero penalty and streak protection.',
    keywords: ['asynchronous', 'queue', 'missed day', 'skip workout', 'calendar day', 'rest day', 'streak safe', 'up next', 'skip day'],
  },
  {
    id: 'sp-wci',
    topic: 'Cardiovascular & Stamina',
    title: 'Work Capacity Index (WCI)',
    formula: 'WCI = (Effective Tonnage × Completed Sets) / (Avg Session HRR% × Duration (min))',
    scientificRationale:
      'Measures total localized mechanical work completed relative to cardiovascular cost (Heart Rate Reserve percentage) over time.',
    academicCitation: 'Banister et al. (1975); Foster et al. (2001)',
    practicalApplication:
      'Quantifies cardiovascular and muscular endurance efficiency across sessions so held working weights still show work-capacity adaptation.',
    keywords: ['wci', 'work capacity', 'stamina', 'tonnage', 'hrr', 'heart rate reserve', 'cardiovascular', 'work capacity index'],
  },
  {
    id: 'sp-tensor-ai',
    topic: 'Hardware Acceleration & On-Device AI',
    title: 'Hardware Acceleration & Zero-Cost Local Inference',
    formula: 'Tensor G1-G4 TPU (Gemini Nano AICore) / NPU (WebNN) / GPU (WebGPU) / WASM SIMD Fallback',
    scientificRationale:
      'Processing health, biometric, and training data locally on device protects athlete confidentiality, functions without network coverage in gym basements, eliminates cloud API fees, and delivers < 15ms inference latency.',
    academicCitation: 'Google Tensor Architecture Whitepaper; W3C WebNN / WebGPU Specifications',
    practicalApplication:
      'Accelerates your AI Coach directly on your device with 100% privacy and zero subscription fees.',
    keywords: ['tensor', 'pixel', 'tpu', 'gemini nano', 'on-device', 'local ai', 'latency', 'privacy', 'aicore', 'google pixel ai'],
  },
  {
    id: 'sp-ai-coach-single-entry-invariant',
    topic: 'Product Architecture & Interface Governance',
    title: 'Treise Coach Single Entry Point & Interface Invariant',
    formula: 'Treise Coach Entry = Detached Bottom Dock Button ONLY; Zero Dedicated Cards; Zero Header Icons',
    scientificRationale:
      'Cognitive load research proves that attention span and executive function degrade under heavy neuromuscular strain. Displaying dedicated coach cards across training sessions or placing repetitive coach icons/pills in the app header fragments focus, creates visual clutter, and competes with immediate workout execution and telemetry. Separating Treise as a single invoked button to the right of the connected destination bar preserves visual hierarchy and clarifies that Treise is an invoked layer rather than a page.',
    academicCitation: 'Hick-Hyman Law of Decision Latency; Treise Product Governance Framework 2026',
    practicalApplication:
      'The athlete invokes Treise exclusively via the detached button to the right of the connected bottom navigation pill (Workout, Program, Progress). The active training workout contains zero dedicated coach cards, and the top app header contains zero coach icons or pill buttons.',
    keywords: ['ai coach entry', 'bottom nav', 'no cards', 'no header icon', 'ai coach card', 'header coach icon', 'single entry point', 'coach navigation'],
  },
  {
    id: 'sp-design-system-4-tier-typography',
    topic: 'Design System & Visual Hierarchy',
    title: '4-Size × 4-Weight × 3-Ink Apple HIG × Shift Nudge Typography System',
    formula: '4 Sizes = { 12, 16, 20, 32px } × 4 Weights = { 400, 500, 600, 700 (32px only) } × 3 Inks = { 1.00, 0.78, 0.60 }',
    scientificRationale:
      'Capping font sizes at 4 fixed stops (12, 16, 20, 32px — 2.67× span) removes size drift while Apple HIG weight polarity (400 regular, 500 medium, 600 semibold, and 700 bold strictly confined to 32px Large Titles and Display hero KPIs) plus wide 3-tier luminance separation (--color-text-primary 1.00, --color-text-secondary 0.78, --color-text-muted 0.60 — all >= 4.5:1 AA on Slate surfaces) create crisp visual steps without intermediate sizes. Case discipline ends ALL-CAPS sprawl: Sentence case is the default for titles, goals, lift names, pills, weekdays (Sun..Sat), and date windows (Oct 17 – Nov 15, 2026), while uppercase (+0.06em tracking) is quarantined strictly to 1–3 word eyebrows and column headers (.wk-label).',
    academicCitation: 'Apple Human Interface Guidelines Typography; Shift Nudge Typography, Colour & Numerals Architecture; WCAG 2.1 AA',
    practicalApplication:
      'Top-level tabs use left-aligned 32px/700 Apple Health Large Titles (.wk-page-title), drill-in screens with back navigation center at 20px/600 (.wk-nav-title), and every card type inherits one consistent hierarchy and scan order.',
    keywords: ['typography', 'font size', 'text size', '4-tier', 'text-xs', 'text-base', 'text-xl', 'text-3xl', 'hierarchy', 'typography scale', 'luminance', 'card header', 'wk-subhead', 'wk-meta-title', 'apple hig'],
  },
  {
    id: 'sp-design-system-semantic-colors',
    topic: 'Design System & Color Semantics',
    title: 'Whoop Slate Semantic Colour System & CTA Hierarchy',
    formula: 'Primary CTA = --color-action-primary-bg on --color-text-on-accent; Surface Tiers = canvas -> surface -> raised -> control; Status = positive / warning / danger / info / neutral',
    scientificRationale:
      'Codifying every UI colour into Tier 2 semantic CSS tokens over the Whoop Slate baseline removes competing palettes, guarantees WCAG 2.1 AA contrast across cards and raised controls, and keeps caution, strain, danger, and AI Coach accents visually distinct.',
    academicCitation: 'WCAG 2.1 AA Contrast (1.4.3) & ISO 9241-110; Whoop Slate Telemetry Architecture',
    practicalApplication:
      'Unifies Finish Workout, modal confirmations, completed sets, recovery rings, and navigation onto one token contract defined in src/styles/tokens.css.',
    keywords: ['color system', 'button color', 'primary cta', 'whoop slate', 'semantic color', 'amber shield', 'contrast', 'tokens'],
  },
  {
    id: 'sp-design-system-touch-targets',
    topic: 'Mobile Ergonomics & Accessibility',
    title: 'Mandatory 44px Touch Target & Invariant Floors',
    formula: 'Minimum Target Dimensions = 44px × 44px (min-h-[44px])',
    scientificRationale:
      'Sweaty and fatigued athletes experiencing post-exercise tremors exhibit significantly impaired fine motor control. Interactive targets below 44px produce high mis-tap error rates and user frustration.',
    academicCitation: 'WCAG 2.1 Success Criterion 2.5.5 (Target Size); Apple Human Interface Guidelines',
    practicalApplication:
      'Guarantees all interactive elements (buttons, segmented pills, modal headers, stepper inputs) have at least 44px vertical touch targets for effortless in-gym logging.',
    keywords: ['touch target', '44px', 'accessibility', 'wcag', 'min-h-[44px]', 'ergonomics', 'mobile target', 'tap target'],
  },
  {
    id: 'sp-progress-tracking-diary',
    topic: 'Progress Tracking & Progression Systems',
    title: 'Automated Progressive Overload vs. Traditional Paper Training Diary',
    formula: 'Treise Engine = Auto(Weights, Sets, Reps, Double Progression, Periodization) vs. Manual Paper Diary',
    scientificRationale:
      'Historically, serious lifters maintained physical training diaries to record loads, track reps in reserve, and manually plan weekly progressions. While vital for progressive overload, manual notebooks suffer from high friction, missed session logs, calculation errors, and arbitrary load jumps. Treise completely automates the training diary: tracking every set, rep, weight, tempo, and rest interval, and calculating optimal weekly progression (+1 rep or +2.5kg/+2.0kg) and mesocycle waves. The athlete simply shows up and executes.',
    academicCitation: 'Helms et al. (2014); Schoenfeld (2020); ACSM Guidelines for Exercise Testing and Prescription',
    practicalApplication:
      'Completely replaces the manual gym notebook. You never have to guess what weight to use or remember what you did last week—Treise plans every set and rep automatically. You just show up.',
    keywords: [
      'training diary',
      'paper diary',
      'workout log',
      'gym notebook',
      'track progress',
      'what the app does',
      'automatic planning',
      'plan for you',
      'just show up',
      'automated diary',
      'log workout',
      'progressive overload log',
      'paper log',
      'exercise diary',
      'tracks your weights',
      'planning from week to week',
    ],
  },
  {
    id: 'sp-scale-weight-measurements',
    topic: 'Body Composition & Physical Metrics',
    title: 'Morning Weigh-Ins, Circumference Measurements & Body Recomposition',
    formula:
      'True Physical Progress = 7-Day EMA Bodyweight + 13 Scale Composition Metrics (BF%, FFM, SMM, Visceral Fat, Water, Bone, Protein, BMR, Metabolic Age) + 12 Tape Sites (Neck, Shoulder, Chest, Waist, Abdomen, Hip, Bicep L/R, Thigh L/R, Calf L/R)',
    scientificRationale:
      'Muscle tissue is ~18% denser than adipose tissue (~1.06 g/mL vs ~0.90 g/mL). Lifters with extra body fat undergoing progressive resistance training often experience simultaneous muscle hypertrophy and fat loss (body recomposition). Under recomposition, total scale weight may remain flat or even fluctuate upwards despite substantial loss of visceral and subcutaneous fat. Assessing progress solely through bathroom scales creates false stalls; pairing morning weigh-ins (dampened by a 7-day EMA) and 4-compartment bioelectrical impedance body composition with 12-site tape circumference measurements (waist/abdomen reduction alongside chest/shoulder and bilateral left/right arm, thigh, and calf expansion) captures real muscular cross-sectional changes. You look radically different with your shirt off even when the scale barely budges.',
    academicCitation: 'Barakat et al. (2020); Longland et al. (2016); Morton et al. (2018); Lukaski et al. (1986)',
    practicalApplication:
      'Weigh yourself first thing in the morning on the same scale under consistent conditions, and track body fat and circumference measurements manually or via RENPHO Bluetooth devices. Even if total weight stays flat, losing waist/abdomen circumference while growing fat-free mass and limb circumferences proves body recomposition.',
    keywords: [
      'weigh yourself',
      'morning weigh-in',
      'scale weight',
      'body recomposition',
      'recomp',
      'measurements',
      'tape measure',
      'circumference',
      'waist',
      'abdomen',
      'bicep left',
      'bicep right',
      'thigh left',
      'thigh right',
      'calf left',
      'calf right',
      'shirt off',
      'scale flat',
      'scale not moving',
      'scale weight flat',
      'scale weight not moving',
      'muscle density',
      'fat loss muscle gain',
      'how to measure progress',
      'body measurements',
      'weighing yourself',
      'measure progress',
      'visceral fat',
      'subcutaneous fat',
      'skeletal muscle mass',
      'fat free mass',
      'metabolic age',
      'bmr',
      'body water',
      'bone mass',
      'protein mass',
    ],
  },
  {
    id: 'sp-smart-device-integration',
    topic: 'Biometric Auto-Regulation & IoT',
    title: 'Friction-Free Telemetry & Smart Device Integration',
    formula:
      'Telemetry Ingestion = RENPHO Web Bluetooth Scales (13 Metrics) & Smart Tape Measures (12 Sites in cm/in) + Manual Entry + Fitbit / Pixel Watch / Whoop APIs + Health Connect data import',
    scientificRationale:
      'Adherence is the single greatest determinant of long-term physique and athletic progress. Manual data entry creates cognitive friction and tracking abandonment. Connecting directly to RENPHO Bluetooth health scales (capturing Weight, BMI, Body Fat %, Fat-Free Mass, Subcutaneous Fat, Visceral Fat, Body Water, Skeletal Muscle Mass, Muscle Mass, Bone Mass, Protein Mass, BMR, and Metabolic Age) and RENPHO smart body tape measures (capturing Neck, Shoulder, Chest, Waist, Abdomen, Hip, Bicep Left, Bicep Right, Thigh Left, Thigh Right, Calf Left, and Calf Right) via Web Bluetooth—while always allowing full manual entry with zero hardware requirement—populates longitudinal trends and bilateral symmetry tracking.',
    academicCitation: 'Piwek et al. (2016); Hermsen et al. (2017); WCAG Cognitive Accessibility & Friction Reduction',
    practicalApplication:
      'Pairs directly with RENPHO Bluetooth health scales and smart tape measures in Progress → Measurements → Log measurements (or lets you type Weight, Body Fat %, and any of the 12 tape sites manually at any time), and syncs wearable recovery from Fitbit or Whoop.',
    keywords: [
      'smart scale',
      'smart scales',
      'measuring devices',
      'smart tape',
      'friction free',
      'bluetooth scale',
      'bluetooth tape',
      'renpho',
      'renpho scale',
      'renpho tape',
      'health connect',
      'fitbit',
      'whoop',
      'automatic sync',
      'device integration',
      'wearable telemetry',
      'measuring tape',
      'digital scale',
      'smart measuring devices',
      'friction free tracking',
    ],
  },
  {
    id: 'sp-6wk-muscle-building-plan',
    topic: 'Program Architecture & Hypertrophy Blocks',
    title: '6-Week Muscle Building Plan (High-Volume, High-Intensity & Giant Sets)',
    formula: 'Phase 1: Antagonist Supersets (4x12) + 10x10 Squats -> Phase 2: Rest-Pause / Drop-Sets (2x12) + 10x8 Squats -> Phase 3: Giant Sets / Tri-Sets + 10x6 Squats',
    scientificRationale:
      'An intensive 6-week, 24-workout periodized hypertrophy mesocycle structured into three distinct 2-week microcycles based on the Nick Mitchell & Joe Warner body transformation methodology. Phase 1 accumulates volume and structural work capacity through antagonist pairings (Chest & Back) and a 10-set Squat volume foundation (10x10 down to 10x9). Phase 2 cuts set volume to 2 high-intensity sets taken beyond form failure via double/triple rest-pause, triple drop-sets, and heavy partial holds (Squats 10x8). Phase 3 maximizes muscular density and lactate buffering through 4-exercise Giant Sets and 3-exercise Tri-Sets with 0-second intra-group rest (Squats 10x6 peak load). Strict 4-digit tempo control (e.g. 4010, 3110) guarantees time under tension and maximal stretch-mediated hypertrophy.',
    academicCitation: 'Mitchell & Warner (2012); Schoenfeld et al. (2019); Fink et al. (2018); Israetel (2017)',
    practicalApplication:
      'Available as a full 24-workout program in Treise with superset/giant set grouping (A1–A4), 4-digit tempo cues, 5-step warmup ramp calculator, and intensity protocol finisher instructions.',
    keywords: [
      '6-week',
      '6 week muscle building plan',
      'muscle building plan',
      'nick mitchell',
      'joe warner',
      '12-week body plan',
      'guillotine press',
      'ring press-up',
      'rest-pause',
      'drop set',
      'triple drop set',
      'giant set',
      'giant sets',
      'tri-set',
      'tri-sets',
      '10-set squat',
      '10x10 squats',
      '10x8 squats',
      '10x6 squats',
      'warmup ramp',
      'antagonist supersets',
    ],
  },
  {
    id: 'sp-joint-axial-load',
    topic: 'Joint Stress & Workload Pacing',
    title: 'Joint & Axial Load Accumulation vs Workload Pacing (ACWR)',
    formula: 'Weekly Joint Strain = Σ(Working Sets × Axial Load Multiplier); Acute spikes moderated via RIR and low-stress swaps',
    scientificRationale:
      'Connective tissues (rotator cuff, patellar tendon, lumbar discs, elbow flexors) adapt slower than skeletal muscle. Monitoring weekly joint load accumulation alongside acute-to-chronic workload balance (Gabbett, 2016) flags sudden jumps in compressive or shear stress before overuse irritation develops.',
    academicCitation: 'Gabbett TJ, Br J Sports Med 2016;50:273–280; Schoenfeld et al. (2017); Magnusson et al. (2010)',
    practicalApplication:
      'Tracks rolling 7-day load across your Shoulder, Elbow, Lumbar Spine, Knee, and Ankle in Progress and surfaces joint-friendly exercise alternatives before irritation builds.',
    keywords: [
      'joint load',
      'joint strain',
      'axial load',
      'lumbar strain',
      'lower back load',
      'shoulder strain',
      'elbow strain',
      'knee strain',
      'ankle strain',
      'acwr',
      'acute chronic',
      'acute to chronic',
      'workload ratio',
      'gabbett',
      'tendon recovery',
    ],
  },
  {
    id: 'sp-cross-implement',
    topic: 'Cross-Implement Continuity',
    title: 'Movement Vectors, Bodyweight Ratios & Implement Translation',
    formula: 'Equivalence maps Bench ↔ Push-Up (64% BW) ↔ DB Bench (÷ 1.18); Hinge ↔ RDL (× 1.20) ↔ Deadlift; Single-limb = Unilateral Fraction',
    scientificRationale:
      'Muscles respond to mechanical tension along a biomechanical movement pattern rather than a specific brand of bar or machine. Grouping exercises by movement vector allows Treise to carry progression smoothly across barbell, dumbbell, cable, machine, and calisthenic variations when equipment or location changes.',
    academicCitation: 'Saeterbakken et al. (2011); Suprak et al. (2011) [push-up 64% BW load]; Helms et al. (2019)',
    practicalApplication:
      'When you switch between Gym, Home, or Bodyweight workouts—or swap an occupied machine—your weights carry over automatically using equipment and bodyweight load ratios instead of resetting to guesses.',
    keywords: [
      'movement vector',
      'movement family',
      'cross-implement',
      'carry-over',
      'carryover',
      'implement translation',
      'swap weight',
      'translate weight',
      'bodyweight ratio',
      'push-up load',
      'pushup load',
      '64%',
    ],
  },
  {
    id: 'sp-junk-volume',
    topic: 'Hypertrophy Volume Landmarks',
    title: 'Effective Stimulus vs Excess (Junk) Volume',
    formula: 'Optimal stimulus <= ~8–10 hard sets per muscle per session inside weekly MAV; sets past MRV add fatigue without extra growth',
    scientificRationale:
      'Per-session protein synthesis saturates after roughly 6–10 quality hard sets for a muscle group. Adding excessive sets beyond your Maximum Recoverable Volume (MRV) or when recovery is suppressed creates prolonged muscle damage and CNS fatigue with diminishing hypertrophy return.',
    academicCitation: 'Schoenfeld, Ogborn & Krieger (2017); Pelland et al. (2024); Baz-Valle et al. (2022)',
    practicalApplication:
      'Caps working sets cleanly inside your phase-adjusted target range so every set contributes productive growth stimulus without wasted effort.',
    keywords: [
      'junk volume',
      'wasted sets',
      'excess volume',
      'too many sets',
      'diminishing returns',
      'per session cap',
      'stimulus to fatigue',
      'overtraining volume',
    ],
  },
];

/**
 * Codified Treise Component Design System:
 * Authoritative registry of component logic, anatomy, variants, and Tailwind tokens stored in the Knowledge Graph.
 */
export const TREISE_DESIGN_SYSTEM: DesignSystemComponent[] = [
  {
    id: 'ds-typography-scale',
    name: '4-Size × 4-Weight × 3-Ink Apple HIG × Shift Nudge Typography System',
    category: 'typography',
    anatomy: {
      container: 'w-full space-y-1',
      typography:
        '4 Fixed Sizes (12 / 16 / 20 / 32px, 2.67x span) × 4 Weights (400, 500, 600, 700 only at 32px) — Tier 1 (text-xs 12px/16px): .wk-label (500 uppercase +0.06em --color-text-muted, 1–3 words only), .wk-meta-title (500 normal-case --color-text-secondary), .wk-pill (500 normal-case +0.01em --color-text-secondary), .wk-segment (500 active --color-text-primary / 400 inactive muted), .wk-caption (400 +0.005em --color-text-muted); Tier 2 (text-base 16px/24px): .wk-button (600), .wk-subhead / .wk-btn-secondary / .wk-field (500), .wk-body (400 --color-text-secondary 0.78, 65ch cap); Tier 3 (text-xl 20px/24px): .wk-title / .wk-h1 / .wk-nav-title / .wk-number / .wk-input (600 -0.02em/-0.015em --color-text-primary tabular-nums); Tier 4 (text-3xl 32px/36px): .wk-page-title (700 -0.03em left-aligned Large Title) & .wk-display (700 -0.03em tabular-nums --color-text-primary)',
      colors: 'Tier 1 Primary: --color-text-primary (13.30:1 card) | Tier 2 Secondary: --color-text-secondary (0.78, 8.74:1 card / 7.13:1 raised / 5.67:1 ctrl) | Tier 3 Muted: --color-text-muted (0.60, 7.02:1 canvas / 5.86:1 card / 4.96:1 raised)',
      states: {
        default: 'Inter font family (400, 500, 600, 700); 700 reserved strictly for 32px .wk-page-title and .wk-display CSS rules (zero font-bold in component TSX, weights 800/900 banned); card headers stay --color-text-primary',
        numeric: 'wk-number / wk-input (20px/600) and wk-display (32px/700) with Inter tabular-nums; unit suffixes stay 12px/400 .wk-caption (--color-text-muted)',
      },
      touchTarget: 'N/A (Typography Scale)',
    },
    logic: {
      rules: [
        'Maximum 4 distinct font sizes allowed across the entire application: text-xs (12px), text-base (16px), text-xl (20px), and text-3xl (32px) — spanning 2.67x on the 4px grid.',
        'Strict 12px (text-xs) minimum floor across all metadata/caption surfaces; interactive buttons (.wk-button, .wk-btn-secondary), body prose (.wk-body with 65ch measure cap), nested row titles (.wk-subhead), and form inputs enforce >= 16px.',
        'Apple HIG 4-weight polarity: 700 is reserved exclusively for Tier 4 32px Display hero numerals (.wk-display) and top-level Large Titles (.wk-page-title); 600 anchors Tier 3 20px card headers (.wk-h1/.wk-title), centered drill-in .wk-nav-title, KPI .wk-number/.wk-input, and primary .wk-button CTAs; 500 carries Tier 2 16px .wk-subhead rows, .wk-btn-secondary, .wk-field, and Tier 1 .wk-label/.wk-meta-title/.wk-pill/active .wk-segment; 400 carries .wk-body prose, .wk-caption footnotes/units/dates, chart intermediate ticks, and inactive controls.',
        'Top-level tabs use left-aligned 32px/700 .wk-page-title Large Titles; drill-in screens with back navigation center at 20px/600 .wk-nav-title; nested row/subsection headings inside cards use .wk-subhead (16px/500 --color-text-primary).',
        '3 measured ink tiers keep contrast clear without flattening: --color-text-primary (1.00), --color-text-secondary (0.78 for sentence-case meta titles, pills, date ranges, .wk-body), and --color-text-muted (0.60 for eyebrows, units, footnotes, inactive tabs — all >= 4.5:1 AA on Slate raised surfaces). Semantic accents stay rationed to trend lines, delta pills, and completion checks.',
        'Strict Case Discipline: Sentence case is the default across titles, cards, goals, Trophy case lift names, .wk-pill tags, form field labels (.wk-meta-title), weekdays (Sun..Sat), and date steppers (Oct 17 – Nov 15, 2026); uppercase (.wk-label, 500 +0.06em) is quarantined strictly to 1–3 word eyebrows and column headers.',
      ],
      variants: {
        labelAndUnit: '.wk-label (12px/500 uppercase +0.06em --color-text-muted), .wk-meta-title (12px/500 normal-case --color-text-secondary), .wk-pill (12px/500 normal-case +0.01em --color-text-secondary), .wk-segment (12px/500 active vs 400 muted), .wk-caption (12px/400 +0.005em --color-text-muted)',
        subheadAndBody: '.wk-button (16px/24px 600), .wk-subhead / .wk-btn-secondary / .wk-field (16px/24px 500), .wk-body (16px/24px 400 --color-text-secondary 0.78, 65ch)',
        titleAndNumber: '.wk-title / .wk-h1 / .wk-nav-title (20px/24px 600 -0.02em --color-text-primary) and .wk-number / .wk-input (20px/24px 600 -0.015em tabular-nums)',
        display: '.wk-page-title (32px/36px 700 -0.03em left-aligned) and .wk-display (32px/36px 700 -0.03em tabular-nums --color-text-primary) paired with subdued 12px/400 .wk-caption unit suffix',
      },
      accessibility: 'Passes WCAG 1.4.4 text scaling, prevents iOS/Android input auto-zoom (>= 16px interactive floor), and maintains >= 4.5:1 AA contrast across all 3 ink tiers (13.30:1 Primary, 8.74:1 Secondary, 5.86:1 Muted on card; 4.96:1 Muted on raised --color-bg-surface-raised)',
    },
    tailwindTokens: 'text-xs | text-base | text-xl | text-3xl | wk-label | wk-meta-title | wk-caption | wk-pill | wk-segment | wk-subhead | wk-body | wk-nav-title | wk-title | wk-number | wk-page-title | wk-display | tabular-numbers',
    rationale: 'Combining 4 crisp sizes (12/16/20/32px) with Apple HIG 4-weight polarity (400/500/600/700-at-32px), 3 distinct ink luminances (1.00 / 0.78 / 0.60), and strict Sentence-case discipline eliminates uniform semi-bold weight soup and creates effortless scan hierarchy.',
  },
  {
    id: 'ds-btn-primary',
    name: 'Primary CTA Button (Treise Slate High-Contrast White)',
    category: 'button',
    anatomy: {
      container: 'wk-button w-full px-4 rounded-xl min-h-[48px] flex items-center justify-center transition-all active:scale-[0.98]',
      typography: 'text-base font-medium',
      colors: 'background: var(--color-action-primary-bg) | color: var(--color-action-primary-fg)',
      states: {
        default: 'bg-[var(--color-action-primary-bg)] text-[var(--color-action-primary-fg)] font-semibold',
        hover: 'opacity-95',
        active: 'active:scale-[0.98]',
        disabled: 'bg-[var(--color-action-disabled-bg)] text-[var(--color-action-disabled-fg)] cursor-not-allowed',
        focus: 'outline: 2px solid var(--color-border-focus)',
      },
      touchTarget: 'Standard 48px vertical height (min-h-[48px], >= 44px floor) with full touch target pad',
      iconSpec: 'w-4 h-4 stroke-[2] using var(--color-action-primary-fg)',
    },
    logic: {
      rules: [
        'Exactly ONE primary CTA button per view, modal, or action card.',
        'Uses Treise Slate semantic primary action token (--color-action-primary-bg) with dark slate ink (--color-action-primary-fg, 17.56:1 contrast).',
        'Positive mint (--color-accent-primary / --color-status-positive) is reserved for achieved progress and completion states and is never used for primary system CTA fills.',
        'Disabled state uses --color-action-disabled-bg (0.04 white scrim) with --color-action-disabled-fg (0.44 white, ~3.44:1 inactive UI legibility over card surfaces), cleanly separating disabled buttons from active --color-action-secondary-bg controls.',
        'Maintains 48px primary height (exceeding the 44px touch target floor) on a 12px radius.',
      ],
      variants: {
        finishWorkout: 'wk-button with var(--color-action-primary-bg) fill and var(--color-action-primary-fg) ink',
        modalConfirm: 'w-full wk-button using var(--color-action-primary-bg) and var(--color-action-primary-fg)',
      },
      accessibility: 'Passes WCAG 2.5.5 Touch Target (>= 44x44px) and WCAG 1.4.3 Contrast (>= 4.5:1 AA on active CTAs; WCAG 1.4.3 inactive UI exemption on disabled buttons)',
    },
    tailwindTokens: 'wk-button bg-[var(--color-action-primary-bg)] text-[var(--color-action-primary-fg)] font-semibold rounded-xl min-h-[48px] min-h-[44px]',
    rationale: 'Unifies live UI components onto high-contrast white-on-slate primary CTAs (--color-action-primary-bg) while keeping secondary actions calm.',
  },
  {
    id: 'ds-btn-secondary',
    name: 'Secondary Bordered Slate Action Button',
    category: 'button',
    anatomy: {
      container: 'wk-btn-secondary px-4 py-2 rounded-xl border border-[var(--color-border-strong)] min-h-[44px] inline-flex items-center justify-center transition-colors active:scale-[0.98]',
      typography: 'text-base font-medium',
      colors: 'background: var(--color-action-secondary-bg) | color: var(--color-action-secondary-fg) | border: var(--color-border-strong)',
      states: {
        default: 'bg-[var(--color-action-secondary-bg)] text-[var(--color-action-secondary-fg)] border border-[var(--color-border-strong)]',
        hover: 'opacity-90',
        active: 'active:scale-[0.98]',
        disabled: 'bg-[var(--color-action-disabled-bg)] text-[var(--color-action-disabled-fg)] cursor-not-allowed',
      },
      touchTarget: 'Min 44px vertical height (min-h-[44px])',
      iconSpec: 'w-3.5 h-3.5 stroke-[2] using var(--color-text-secondary)',
    },
    logic: {
      rules: [
        'Used for secondary, auxiliary, or cancel actions alongside a primary CTA.',
        'Uses bordered Treise Slate token (--color-action-secondary-bg + 1px border --color-border-strong) on a 12px radius via .wk-btn-secondary.',
        'Never use the borderless informational badge class (.wk-pill, 24px height, 8px radius) on <button> elements; interactive compact buttons must use .wk-btn-secondary.',
        'Destructive solid confirmation buttons use --color-action-destructive-bg with --color-action-destructive-fg (>= 5.8:1 AA contrast).',
      ],
      variants: {
        cancel: 'wk-btn-secondary with var(--color-action-secondary-bg) and var(--color-action-secondary-fg)',
        compactAction: 'wk-btn-secondary with var(--color-action-secondary-bg) and 1px border',
        destructive: 'bg-[var(--color-action-destructive-bg)] text-[var(--color-action-destructive-fg)]',
      },
      accessibility: 'Passes WCAG 2.5.5 touch target with >= 4.5:1 text-to-background contrast',
    },
    tailwindTokens: 'wk-btn-secondary bg-[var(--color-action-secondary-bg)] text-[var(--color-action-secondary-fg)] font-medium rounded-xl min-h-[44px]',
    rationale: 'Clearly separates bordered 44px+ interactive secondary actions from borderless 24px read-only .wk-pill badges.',
  },
  {
    id: 'ds-btn-segmented',
    name: 'Segmented Control / Mode Switcher',
    category: 'pill',
    anatomy: {
      container: 'wk-segments grid gap-1 bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] p-1 rounded-2xl',
      typography: 'text-xs (500 active / 400 inactive)',
      colors: 'Active: var(--color-action-secondary-bg) + var(--color-text-primary) | Inactive: var(--color-text-muted)',
      states: {
        active: 'bg-[var(--color-action-secondary-bg)] text-[var(--color-text-primary)] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
        inactive: 'text-[var(--color-text-muted)] font-normal',
      },
      touchTarget: 'Min 44px height (min-h-[44px]) per segment on 12px inner radius (16px tray - 4px padding)',
    },
    logic: {
      rules: [
        'Used for mutually exclusive mode selections (e.g. Full Gym | At Home | Bodyweight, 1W | 1M | 3M | 1Y timeline).',
        'A segmented control is NOT a primary CTA and recesses its tray to --color-bg-canvas with 1px --color-border-subtle so the active --color-action-secondary-bg pill elevates cleanly.',
        'Active state maintains 8.04:1 ink contrast against --color-action-secondary-bg.',
      ],
      variants: {
        equipmentSwitcher: '3-way grid: Full Gym | At Home | Bodyweight',
        splitSelector: 'Multi-day horizontal scroll or flex grid',
        timeframeFilter: '1W | 1M | 3M | 1Y',
      },
      accessibility: 'ARIA role="group" or role="tablist" with aria-pressed or aria-selected',
    },
    tailwindTokens: 'wk-segment bg-[var(--color-action-secondary-bg)] text-[var(--color-text-primary)] font-medium rounded-xl min-h-[44px]',
    rationale: 'Prevents cognitive noise by keeping mode selection calm, allowing the actual workout or progress data below to hold primary visual interest.',
  },
  {
    id: 'ds-set-toggle',
    name: 'Set Completion & Interactive State Polarity',
    category: 'toggle',
    anatomy: {
      container: 'min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center transition-all active:scale-[0.98]',
      typography: 'Pending: var(--color-text-muted) | Completed: var(--color-text-primary) (tabular-nums)',
      colors: 'Completed: var(--color-status-positive) + var(--color-text-on-accent) | Pending: var(--color-action-secondary-bg) + border var(--color-border-strong)',
      states: {
        incomplete: 'bg-[var(--color-action-secondary-bg)] border border-[var(--color-border-strong)] text-[var(--color-text-secondary)]',
        completed: 'bg-[var(--color-status-positive)] text-[var(--color-text-on-accent)] shadow-sm',
        warmup: 'text-[var(--color-set-warmup)] tabular-numbers font-medium',
        failure: 'bg-[var(--color-set-failure-bg)] text-[var(--color-set-failure-fg)] tabular-numbers font-medium',
      },
      touchTarget: '>= 48px Android touch target height (minHeight: 48, minWidth: 48)',
      iconSpec: 'Check SVG always visible in Done button (--color-text-secondary 5.67:1 on pending --color-action-secondary-bg, --color-text-on-accent on completed)',
    },
    logic: {
      rules: [
        'Positive status accent (--color-status-positive) celebrates completed sets and snaps input digits from --color-text-muted (0.60, 4.96:1 AA on raised) to --color-text-primary (10.49:1) so unlogged targets never masquerade as logged data.',
        'The Done button always renders a visible checkmark icon even before completion (--color-text-secondary on upcoming sets over bordered --color-action-secondary-bg with top rim bevel) and enforces a >= 48px Android touch target height.',
        'Uncompleted set rows maintain uniform calm styling with no next-set row highlight borders or mint tints.',
        'Warmup sets display amber W indicator (--color-set-warmup) and failure sets display crimson soft badge (--color-set-failure-bg / --color-set-failure-fg).',
        'Completing a set triggers haptic feedback and real-time tonnage updates.',
      ],
      variants: {
        workingSet: 'Checkmark toggle separating pending smart defaults from completed locks',
        warmupSet: 'Amber W indicator with pre-filled ramping loads',
      },
      accessibility: 'aria-label="Complete set N" / aria-pressed="true|false"',
    },
    tailwindTokens: 'bg-[var(--color-status-positive)] text-[var(--color-text-on-accent)] shadow-sm rounded-xl min-h-[48px] min-w-[48px]',
    rationale: 'Delivers clear pending-vs-completed state polarity and tactile feedback while maintaining calm uncompleted rows.',
  },
  {
    id: 'ds-card-biometric',
    name: 'Biometric Card (Treise Slate Surface)',
    category: 'card',
    anatomy: {
      container: 'wk-card rounded-3xl bg-[var(--color-bg-surface)] space-y-4',
      typography: 'Card Header: .wk-h1/.wk-title (20px/600 --color-text-primary); Nested Subhead: .wk-subhead (16px/500 --color-text-primary); Body: .wk-body (16px/400, max 65ch) var(--color-text-secondary); Eyebrow: .wk-label (12px/500 uppercase var(--color-text-muted))',
      colors: 'Surface: var(--color-bg-surface), Raised child: var(--color-bg-surface-raised), Hairline: var(--color-border-subtle)',
      states: {
        default: 'Clean Treise Slate elevation above var(--color-bg-canvas)',
      },
      touchTarget: 'N/A (Card Surface)',
    },
    logic: {
      rules: [
        'Use codified surface tokens (--color-bg-surface / --color-bg-surface-raised / --color-bg-surface-control) rather than ad-hoc hex fills.',
        'Maintain generous internal padding on the 4px grid (p-4 / 16px) and clear hairline separation dividers (--color-border-subtle).',
        'Top focal point of every card must clearly answer: What is this and what is my next action? Always render card titles in full --color-text-primary and follow ds-card-archetypes scan order.',
      ],
      variants: {
        heroCard: 'wk-card bg-[var(--color-bg-surface)] space-y-4',
        compactSubCard: 'wk-raised bg-[var(--color-bg-surface-raised)] rounded-lg',
      },
      accessibility: 'Passes WCAG AA contrast against --color-bg-canvas',
    },
    tailwindTokens: 'wk-card bg-[var(--color-bg-surface)] rounded-3xl space-y-4',
    rationale: 'Establishes one unified Treise Slate card elevation hierarchy across workouts, program, analytics, and modals.',
  },
  {
    id: 'ds-card-archetypes',
    name: 'Card Typographic Archetypes (Telemetry Chart, KPI Summary, Active Execution, Structured Breakdown)',
    category: 'card',
    anatomy: {
      container: 'wk-card rounded-3xl bg-[var(--color-bg-surface)] p-4 (Card Type A/B/C/D over Treise Slate canvas)',
      typography: 'Card Title: .wk-h1/.wk-title (20px/600 --color-text-primary) | Subhead: .wk-subhead (16px/500 --color-text-primary) | KPI Hero: .wk-display (32px/700 --color-text-primary) + unit (12px/400 .wk-caption) | Body: .wk-body (16px/400 --color-text-secondary) | Eyebrow: .wk-label (12px/500 uppercase --color-text-muted) | Micro Title: .wk-meta-title (12px/500 sentence case --color-text-secondary) | Footnote: .wk-caption (12px/400 --color-text-muted)',
      colors: '--color-text-primary anchors titles & KPI values; 0.78 --color-text-secondary carries prose, meta titles & date ranges; 0.60 --color-text-muted carries labels, units, captions & inactive segments; semantic accents are rationed to deltas, lines & completion checks',
      states: {
        telemetryChart: 'ProgressChartCard & MuscleProgressCard: Title (--color-text-primary) + Timeline (500 active / 400 muted) -> Eyebrow (.wk-label) -> Hero (.wk-display 32/700 + 12/400 unit) -> Delta pill (500) + Date range (.wk-meta-title) -> TrendChart -> Narrative summary (.wk-body below plot)',
        kpiSummary: 'OverviewCard / WhoopStrainCard / WorkoutFinishScreen: Title (--color-text-primary) -> 3-col StatRow (.wk-label or .wk-meta-title -> .wk-number 20/600 or .wk-display 32/700 --color-text-primary + 12/400 unit -> .wk-caption)',
        activeExecution: 'ProgramProgressCard (Phase title + description + 44px arrow button to Program) · CurrentSessionCard (Workout title + completed sets bar) · ExerciseCard / RecoveryScoreCard (Title + action controls -> .wk-pill -> 2-line Insight -> TrendChart -> .wk-label headers -> SetRow)',
        structuredBreakdown: 'StrengthLevelsCard / BalanceCard / KnowledgeGraphCard / Plan phases: Card Title (--color-text-primary) + optional .wk-pill -> Lead prose (.wk-body 0.78) -> Nested items (.wk-subhead 16px/500 --color-text-primary paired with secondary/muted standing) -> Caption',
      },
      touchTarget: '44px minimum on interactive timeline toggles, date steppers, row triggers & buttons',
    },
    logic: {
      rules: [
        'Telemetry Chart Card (ProgressChartCard): Render Card Title in full --color-text-primary (.wk-h1), Headline Eyebrow in .wk-label (12px/500 muted), KPI Unit in 12px/400 .wk-caption beside .wk-display (32px/700), Date Range in .wk-meta-title (12px/500 --color-text-secondary, e.g. Oct 17 – Nov 15, 2026), TrendChart directly below KPI/delta controls (intermediate nodes in 400 --color-text-secondary, latest in 500 --color-text-primary), and Narrative Summary (.wk-body) below the chart.',
        'KPI Summary Card (Overview / StatRow / Finish): Pair crisp .wk-h1/.wk-title (--color-text-primary) with .wk-label metric names (or .wk-meta-title for exercise lift names like Trophy case), .wk-number (20px/600) or .wk-display (32px/700) values, and subdued 12px/400 .wk-caption units.',
        'Active Execution Card (ExerciseCard / RecoveryScoreCard): Exercise Title anchors at 20px/600 --color-text-primary, 2-line coach brief renders in 16px/400 --color-text-secondary, table headers sit calmly in .wk-label (12px/500 muted), and logged SetRow values step cleanly ahead of unconfirmed smart defaults.',
        'Structured Breakdown Card (StrengthLevelsCard / KnowledgeGraphCard / Personal Bests / Modals): Top Card Title uses 20px/600 --color-text-primary (.wk-h1/.wk-title); lead description stays 16px/400 --color-text-secondary (.wk-body, never dimmed to --wk-muted); every nested item or subsection header steps down to .wk-subhead (16px/500 --color-text-primary) so internal hierarchy never collides with the card header.',
      ],
      variants: {
        telemetryChart: 'ProgressChartCard & MuscleProgressCard',
        kpiSummary: 'OverviewCard, StatRow, WhoopStrainCard & WorkoutFinishScreen summary cards',
        activeExecution: 'ProgramProgressCard, CurrentSessionCard, ExerciseCard, RecoveryScoreCard & ReadinessBanner',
        structuredBreakdown: 'StrengthLevelsCard, BalanceCard, KnowledgeGraphCard & PastWorkout/Goal/Program list cards',
      },
      accessibility: 'Clear scannability for fatigued gym users; zero muted card headers; WCAG 2.1 AA >= 4.5:1 on all ink tiers',
    },
    tailwindTokens: 'wk-card wk-h1 wk-title wk-nav-title wk-subhead wk-body wk-label wk-meta-title wk-caption wk-page-title wk-display wk-number wk-pill',
    rationale: 'Guarantees that every card across Workout, Program, Progress, and Modals shares an unmistakable scan order (Title -> Primary Anchor -> Supportive Prose -> Muted Metadata) built from one baseline.',
  },
  {
    id: 'ds-badge-status',
    name: 'Semantic Status Badge / Indicator (.wk-pill)',
    category: 'badge',
    anatomy: {
      container: 'wk-pill inline-flex items-center min-h-[24px] rounded-[var(--radius-inset)] px-2 py-1',
      typography: '12px / 16px 500 text-transform: none tracking-[0.01em]',
      colors: 'Neutral: --color-bg-surface-control/--color-text-secondary | Positive: --color-status-positive-soft/--color-status-positive | Warning: --color-status-warning-soft/--color-status-warning | Danger: --color-status-danger-soft/--color-status-danger-fg | Info: --color-status-info-soft/--color-status-info',
      states: {
        default: 'Quiet bordered read-only informational badge surface (--wk-pill: var(--color-bg-surface-control) + 1px border-subtle) with WCAG AA verified secondary ink (--color-text-secondary, 6.23:1 on control)',
      },
      touchTarget: 'N/A (Read-only informational badge only; never interactive)',
    },
    logic: {
      rules: [
        '.wk-pill (background: var(--wk-pill) / var(--color-bg-surface-control), 1px solid var(--color-border-subtle), border-radius: var(--radius-inset) / 8px, min-height: 24px, color: var(--color-text-secondary), 12px/500 normal-case +0.01em) is reserved strictly for non-interactive informational badges (e.g. Watch, Fitbit, Balanced, Up next, A1) and must never be used on <button> elements.',
        'Color semantics are strictly codified: Positive = --color-status-positive (achieved progress/completion), Info = --color-status-info (strictly non-progress telemetry), Caution = --color-status-warning, Danger/Alert = --color-status-danger, Neutral = --color-status-neutral.',
        'Goal types and third-party services never receive custom brand or goal-specific colors; danger text on dark slate uses --color-status-danger (>= 4.65:1 AA).',
      ],
      variants: {
        neutralInfo: 'wk-pill with var(--color-bg-surface-control) fill and var(--color-text-secondary) ink (e.g. Watch, A1, Balanced)',
        primed: 'status-positive-soft with status-positive ink',
        amberShield: 'status-warning-soft with status-warning ink',
        jointStrain: 'status-danger-soft with status-danger-fg ink',
        telemetryInfo: 'status-info-soft with status-info ink (non-progress metrics)',
      },
      accessibility: 'Verified text-to-surface contrast ratio >= 4.5:1 AA',
    },
    tailwindTokens: 'wk-pill text-xs font-medium rounded-lg min-h-[24px]',
    rationale: 'Allows athletes to scan physiological state and non-progress telemetry with strict semantic meaning and accessible contrast.',
  },
  {
    id: 'ds-input-numeric',
    name: 'Numeric Load & Reps Stepper Input',
    category: 'input',
    anatomy: {
      container: 'wk-input flex items-center bg-[var(--color-bg-surface-raised)] rounded-lg min-h-[48px]',
      typography: 'wk-number (20px/600 Inter tabular-numbers) text-center; general text fields >= 16px (wk-field)',
      colors: 'Pending: var(--color-text-muted) | Completed: var(--color-text-primary) | Focus: 2px --color-border-focus',
      states: {
        default: 'text-[var(--color-text-muted)] tabular-numbers',
        completed: 'text-[var(--color-text-primary)] tabular-numbers',
        focus: 'outline: 2px solid var(--color-border-focus)',
      },
      touchTarget: 'Min 48px vertical height (min-h-[48px])',
      iconSpec: 'Minus/Plus icons w-3.5 h-3.5 stroke-[2]',
    },
    logic: {
      rules: [
        'Always selects all text on focus for effortless 1-tap overwrite on mobile keyboards.',
        'Pre-fills with target load and target reps from progression engine or previous session in muted ink (0.64, 5.40:1 AA) until completed.',
        'Uses >= 16px on text fields (.wk-field) and 20px/600 tabular-nums on numeric cells (.wk-input) to prevent mobile auto-zoom and layout jitter.',
      ],
      variants: {
        weightInput: 'Displays weight unit with plate calculator quick-trigger',
        repsInput: 'Displays reps with increment/decrement steppers',
      },
      accessibility: 'Accessible aria-label specifying exercise, set number, and metric',
    },
    tailwindTokens: 'wk-input wk-field rounded-lg text-center text-xl font-semibold tabular-numbers min-h-[48px]',
    rationale: 'Gym fingers are sweaty and fatigued; inputs must be forgiving, >= 16px, pre-filled clearly without mimicking completed logs.',
  },
  {
    id: 'ds-modal-dialog',
    name: 'Modal Sheet & Dialog',
    category: 'modal',
    anatomy: {
      container: 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-md',
      typography: 'Title: wk-h1 (20px/600 sentence case) text-[var(--color-text-primary)]; Subtitle: wk-caption (12px/400) text-[var(--color-text-muted)]',
      colors: 'Modal Box: bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] shadow-2xl; Backdrop: var(--color-bg-scrim)',
      states: {
        default: 'Sliding up from bottom on mobile, centered on tablet/desktop on 24px card radius',
      },
      touchTarget: 'Close button min-h-[44px] min-w-[44px]',
    },
    logic: {
      rules: [
        'Modal header must feature a clear dismiss button (x) with min-h-[44px] touch target.',
        'Backdrop uses --color-bg-scrim with heavy blur to isolate interaction context.',
        'Action button group places primary CTA clearly above or beside bordered secondary cancel action.',
      ],
      variants: {
        actionSheet: 'Bottom-sheet style on mobile with confirmation button',
        fullModal: 'Centered dialog for deep configurations like telemetry or split editor',
      },
      accessibility: 'Traps focus, supports Escape key dismiss, aria-modal="true" role="dialog"',
    },
    tailwindTokens: 'bg-[var(--color-bg-surface)] p-4 sm:p-6 rounded-3xl shadow-2xl space-y-4 max-w-md w-full',
    rationale: 'Keeps focused secondary flows contextual and consistent with the Treise Slate surface model.',
  },
  {
    id: 'ds-nested-radius',
    name: 'Shift Nudge Concentric Radius Invariant',
    category: 'layout',
    anatomy: {
      container: 'Outer container with 4px-grid padding enclosing inner nested container',
      typography: 'N/A (Geometric Rule)',
      colors: 'Outer: var(--color-bg-surface) | Inner: var(--color-bg-surface-raised) or var(--color-bg-canvas)',
      states: {
        default: 'Concentric corners where negative space between curves remains mathematically constant on the 4px ladder',
      },
      touchTarget: 'Preserves inner touch target boundaries without corner clipping',
    },
    logic: {
      rules: [
        'Shift Nudge Nested Radius Formula: Inner Radius = Outer Radius - Padding, quantized to 4px multiples.',
        'Canonical Treise radius ladder: --radius-card 24px -> --radius-tray 16px -> --radius-control 12px -> --radius-inset 8px -> --radius-badge 4px.',
        'Outer card (24px) with p-4 (16px padding) uses 8px (--radius-inset) for nested wells/inputs; outer tray (16px) with p-1 (4px padding) uses 12px (--radius-control) for segments.',
      ],
      variants: {
        cardToWell: 'rounded-3xl (24px) outer with p-4 (16px) -> rounded-lg (8px) nested wells & inputs',
        trayToSegment: 'rounded-2xl (16px) outer tray with p-1 (4px) -> rounded-xl (12px) segment controls',
      },
      accessibility: 'Optical harmony reduces cognitive fatigue and visual jarring during intense gym workouts',
    },
    tailwindTokens: 'Outer: rounded-3xl p-4 | Tray: rounded-2xl p-1 | Control: rounded-xl | Well: rounded-lg | Badge: rounded',
    rationale: 'Concentric 4px radii prevent corner pinch so negative space flows naturally across every nested surface.',
  },
  {
    id: 'ds-spatial-grid',
    name: 'Treise 4px Implicit Spatial Grid & Proximity Hierarchy',
    category: 'layout',
    anatomy: {
      container: 'Multi-tiered vertical rhythm utilizing strict 4px baseline increments (--space-1..8)',
      typography: 'N/A (Spatial Scale)',
      colors: 'Negative space over var(--color-bg-canvas)',
      states: {
        default: 'Fixed pixel rhythm across cards, sections, and active workouts (zero viewport-scaling --f multipliers)',
      },
      touchTarget: 'Ensures >= 8px separation between interactive controls and >= 44px/48px target heights',
    },
    logic: {
      rules: [
        'All margins, paddings, gaps, and radii strictly snap to 4px multiples (4, 8, 12, 16, 20, 24, 32px; --space-1..8) without viewport-proportional --f scaling.',
        'Law of Proximity: Internal card padding (16px) and module gaps (12–16px) keep related metrics tightly bound while separating distinct cards.',
        'Mobile page containers apply px-4 (16px gutter) and pb-28 (112px bottom dock clearance) so the floating dock never clips content.',
      ],
      variants: {
        microGap: 'gap-1 (4px) or gap-2 (8px) for tightly grouped badges and controls',
        elementGap: 'gap-3 (12px) or gap-4 (16px) for card lists and multi-column forms',
        cardPadding: 'p-4 (16px) default card padding; p-3 (12px) raised inner wells',
        dockClearance: 'pb-28 (112px) safe bottom clearance above NavigationBar',
      },
      accessibility: 'WCAG 2.5.8 compliant: maintains generous separation between adjacent tap targets',
    },
    tailwindTokens: 'px-4 pb-28 space-y-3 gap-2 gap-3 p-4 p-3',
    rationale: 'Fixed 4px spatial increments eliminate viewport-scaling drift and create a predictable, hardware-grade rhythm on every screen.',
  },
  {
    id: 'ds-squint-hierarchy',
    name: 'Shift Nudge Squint Test & Focal Point Authority',
    category: 'layout',
    anatomy: {
      container: 'Full viewport layout structure and visual weight distribution',
      typography: 'Primary: wk-title / wk-number (16px–20px font-semibold); Secondary: var(--color-text-muted)',
      colors: 'Primary CTA var(--color-action-primary-bg), positive progress var(--color-status-positive), non-progress telemetry var(--color-status-info) over var(--color-bg-canvas)',
      states: {
        squintPass: 'When blurred, the primary action and active exercise card are unmistakably obvious in < 200ms',
      },
      touchTarget: 'Primary focal element commands prominent touch envelope (>= 48px)',
    },
    logic: {
      rules: [
        'The Squint Test Rule: An interface is not a democracy; elements cannot compete with equal visual weight.',
        'Exactly ONE primary focal point per screen or modal dialog.',
        'Active exercise card holds highest visual weight in the training view; segmented mode controls and bordered secondary actions remain quiet neutrals.',
        'Primary action uses high-contrast white-on-slate (--color-action-primary-bg / --color-action-primary-fg) while Info Blue (--color-status-info) and Mint (--color-status-positive) communicate non-progress telemetry vs achieved progress respectively.',
      ],
      variants: {
        trainingView: 'Focal 1: Current Exercise Card -> Focal 2: Solid Checkmark -> Focal 3: Finish Workout CTA',
        analyticsView: 'Focal 1: 7-Day EMA Weight Hero -> Focal 2: Strength vs Bodyweight Chart',
      },
      accessibility: 'Guarantees immediate cognitive orientation for visually impaired or physically exhausted lifters',
    },
    tailwindTokens: 'Primary CTA: wk-button bg-[var(--color-action-primary-bg)] text-[var(--color-action-primary-fg)] font-semibold | Active Card: wk-card',
    rationale: 'Athletes in the middle of a heavy compound set experience tunnel vision; visual hierarchy must be ruthless so orientation requires zero effort.',
  },
  {
    id: 'ds-ai-coach-navigation-rule',
    name: 'Treise Single Entry Invoked-Layer Rule',
    category: 'navigation',
    anatomy: {
      container: 'NavigationBar.tsx connected 3-tab destination pill + separate right-hand Treise button',
      typography: 'Destination labels: text-xs font-medium (active) / font-normal (inactive)',
      colors: 'Active destination: var(--color-text-primary) + glow | Inactive: var(--color-text-muted) | Treise button: var(--color-coach-surface) T + var(--color-coach-accent) AI sparkles',
      states: {
        active: 'font-medium using var(--color-text-primary)',
        inactive: 'font-normal opacity-70',
      },
      touchTarget: 'Min 44px vertical height (h-16 segmented pill and 64x64 squircle button)',
      iconSpec: 'Dumbbell, CalendarDays, TrendingUp in pill; Treise T + copper brand sparkles in detached button',
    },
    logic: {
      rules: [
        'MANDATORY INVARIANT: The ONLY entry point to Treise is the detached right-hand button in the bottom navigation dock.',
        'Zero dedicated coach cards are permitted on the workout/training tab or any other screen.',
        'Zero coach buttons, pills, sparkles, or icons are permitted in the top application header.',
        'Tapping Treise opens the invoked assistant sheet over the current screen.',
      ],
      variants: {
        bottomNavTab: 'Detached squircle button to the right of the connected 3-tab segmented pill in NavigationBar.tsx',
      },
      accessibility: 'aria-label="Open Treise" with aria-haspopup="dialog" and min-h-[44px] touch target',
    },
    tailwindTokens: 'fixed bottom-0 left-0 right-0 z-40 px-4; flex-1 h-16 rounded-full + shrink-0 w-16 h-16 rounded-3xl',
    rationale: 'Separating Treise from the destination tabs signals that Treise is an invoked layer while keeping athletes 100% focused on their workout.',
  },
  {
    id: 'ds-ai-coach-sheet',
    name: 'Treise Chat Sheet & Structured Reply Cards',
    category: 'modal',
    anatomy: {
      container: 'Top-radius 24px overlay sheet with grab bar, scrollable message thread, single-row quick-reply strip, and pill composer',
      typography: 'Brand title in wk-h1 (--color-coach-surface), headline greeting text-xl/600, message & card copy wk-body (max-w-prose), citations & timestamps wk-caption',
      colors: 'Assistant cards wk-card; User bubble wk-raised + subtle mint border; Memory badge & scientific accents in --color-accent-primary; Confirmation warning in --color-status-warning; Send / Confirm CTAs in --color-action-primary-bg / --color-action-primary-fg',
      states: {
        opening: 'Editorial headline prompt with contextual quick-reply chips and empty composer',
        richReply: 'Supports Saved to Athlete Memory badge, OOUX Mutation Receipt diff + Undo, Destructive Confirmation prompt, and Scientific Rationale citations',
        pending: 'Three staggered wk-typing-dot mint pulses paired with inferred status caption and optional floating New message scroll pill (with pb-16 bottom clearance)',
      },
      touchTarget: '44px minimum height on expand/close circular buttons, quick-reply chips, confirmation/undo actions, textarea (>= 16px), and circular send button',
    },
    logic: {
      rules: [
        'Opening line stands alone cleanly before conversation starts; subsequent turns align user right and assistant left at 82% max width with max-w-prose.',
        'Plan and workout mutations surface structured inline receipt diffs (with Undo) or amber confirmation cards instead of hiding changes in prose.',
        'Quick-reply and follow-up chips stay in a single horizontal scrollable row above the >= 16px multiline composer; message thread increases bottom padding whenever the New message jump pill is visible.',
      ],
      variants: {
        sheet: 'Compact fly-up sheet capped at 74dvh / 640px for quick mid-session checks',
        expanded: 'Full-height conversation sheet respecting visualViewport height and safe-area insets',
      },
      accessibility: 'role="dialog" aria-modal="true" when presented as overlay; aria-live="polite" on streaming status; 44px touch targets throughout',
    },
    tailwindTokens: 'wk rounded-t-3xl wk-card wk-raised wk-body wk-label wk-pill wk-typing-dot min-h-[44px]',
    rationale: 'Structured confirmation, diff receipts, and concise scientific citations keep mid-workout coaching legible and reversible without cluttering primary logging tabs.',
  },
  {
    id: 'ds-ai-ooux-context',
    name: 'OOUX Domain Model, COPE Ontology & 3-Tier ContextEnvelope',
    category: 'layout',
    anatomy: {
      container: 'Working State + Episodic Memory + Semantic Memory & KG Edges assembled by buildContextEnvelope() for Coach System Prompt grounding',
      typography: 'Object and schema metadata in wk-label (12px/600), wk-body (16px/400), and wk-caption (12px/400) with tabular-nums telemetry',
      colors: 'Read-only live topology in var(--color-status-info); achieved progress edges in var(--color-status-positive); injuries and contraindications in var(--color-status-warning) / var(--color-status-danger)',
      states: {
        working_state: 'Current app_route plus OouxAthlete, OouxProgram, OouxWorkout, OouxExercise[] (incl. timed holds & notes), and OouxGoal[]',
        episodic_memory: 'Last 5 completed workouts, recent ActiveDay[] activities, ExerciseNote[] timeline, recent PRs, stalled lifts, and adherence streak days',
        semantic_memory: 'Persistent AthleteMemoryFact nodes (6 categories) + derived AthleteExerciseEdge contraindications + AthleteKnowledgeGraph edges',
      },
      touchTarget: 'N/A (AI Context Schema & Graph Topology Contract)',
    },
    logic: {
      rules: [
        'Every AI request builds a live ContextEnvelope (schema_version 1.0) over the 7 OOUX objects (Athlete, Program, Workout, Exercise, Goal, ActiveDay, ExerciseNote) from OOUX_OBJECT_SCHEMAS plus COPE core and physiological entities.',
        'Store weights internally in kg (OouxExercise.target_weight_kg, bodyweight_kg, training_maxes_kg) and project display strings in weight_unit using one canonical source per metric.',
        'Derive AthleteExerciseEdge (CONTRAINDICATED_WITH, AVOIDS, HIGH_JOINT_STRAIN) deterministically via deriveContraindicationEdges() from saved memories and elevated Knowledge Graph joint strain profiles.',
        'Enforce strict Read-Only vs Mutable boundaries: AI cannot alter historical workouts, completed sets, recovery biometrics, E1RM formulas, or progressive overload weights.',
      ],
      variants: {
        workingState: 'Route + current Workout, Program, and Goals snapshot for tactical mid-session coaching',
        semanticGraph: 'Persistent AthleteMemoryFact nodes and CONTRAINDICATION_RULES edges persisted across sessions',
      },
      accessibility: 'Every object field, relationship edge, and prompt fact is human-readable and mirrored by deterministic on-screen receipts or labels',
    },
    tailwindTokens: 'wk-card wk-raised wk-label wk-body wk-caption --color-status-info --color-status-positive --color-status-warning --color-status-danger',
    rationale: 'AI quality depends on a single-source object graph. Providing explicit OOUX schemas, COPE domain links, and contraindication edges prevents invented anatomy, unit mix-ups, and stale plan advice.',
  },
  {
    id: 'ds-ai-tool-grounding',
    name: 'AI Tool Contracts, Contextual Routing & Multi-Gate Quality Filter',
    category: 'modal',
    anatomy: {
      container: 'COACH_TOOL_DECLARATIONS + Confirmation/Undo Pipeline + CoachPlace Contextual Opening + 5-Surface Anti-Hallucination Gates',
      typography: 'Tool schemas and validator contracts in wk-label (12px/600), wk-body (16px/400), and wk-caption (12px/400) wrapped cleanly for mobile viewports',
      colors: 'Verified gates and committed diffs in var(--color-status-positive); confirmation prompts in var(--color-status-warning); injury safety stops and mutation failures in var(--color-status-danger); routing in var(--color-status-info)',
      states: {
        awaiting_confirmation: 'Explicit confirmation card rendered before destructive mutations such as reset_program',
        success: 'Committed CoachStateDiff receipt plus one-tap Undo snapshot',
        error: 'enforceMutationTruthfulness restores previous state and blocks false success claims',
      },
      touchTarget: 'Confirm, Cancel, Undo, and contextual CoachHook triggers maintain >= 44px height',
    },
    logic: {
      rules: [
        'Restrict tool calling to four declared tools (reset_program, swap_exercise, adjust_workout_volume, save_athlete_memory); read-only questions (?) must never execute unprompted mutations.',
        'Safety circuit-breaker (buildSafetyResponse) intercepts urgent medical or sharp joint pain before any model inference or tool execution runs.',
        'Route every remote or local sync outcome through enforceMutationTruthfulness so failed saves never claim success.',
        'Pass all 5 AI-written surfaces (Coach Chat, Exercise 2-Line Brief, Program Identity Message, Workout Finish Summary, Progress Goals Summary) through runReadAloudQaGate and surface fact checkers with at most one corrective retry before deterministic fallback.',
      ],
      variants: {
        chatGrounding: 'acceptCoachAnswer + contradictsRecovery + misnamesEquipment + changesPlanWeight + contradictsMuscleTargets + genericRepTarget',
        cardBriefs: 'checkExerciseNote (2 lines, zero grid leakage), checkIdentityMessage, checkWorkoutSummary, checkGoalsSummary + rejected cache',
      },
      accessibility: 'Every AI mutation produces an explicit diff card, confirmation prompt, or deterministic fallback with zero silent state drift',
    },
    tailwindTokens: 'wk-card wk-raised wk-pill wk-btn-secondary --color-status-positive --color-status-warning --color-status-danger --color-status-info',
    rationale: 'Holding every AI tool call and generated sentence to deterministic biomechanical and factual gates eliminates hallucinated loads, unconfirmed resets, and off-voice copy.',
  },
  {
    id: 'ds-onboarding-flow',
    name: '3-Step Onboarding & Location Editor Flow',
    category: 'layout',
    anatomy: {
      container: 'Opaque full-screen overlay (var(--color-bg-canvas) + 28% top surface gradient) constrained to max-w-448px, or inline PhoneStage specimen in catalog',
      typography: 'Steps 1-2 hero titles use .wk-page-title (32px/700); Step 3 and editing sheet headings use 20px/600 (--color-text-primary); body 16px/400 (var(--wk-body), 65ch max); fieldset legends 12px/500 (--color-text-muted); option rows 16px/500 with 12px detail',
      colors: 'Step progress bar & active selection ring use var(--wk-accent) over --color-status-positive-soft; primary Continue/Start CTA uses --color-action-primary-bg / --color-action-primary-fg; inline validation alert uses --color-status-danger-fill; unselected choices sit on --wk-card + --color-border-subtle',
      states: {
        step1: 'Identity + IdentityIllustration + Continue CTA + optional "See a demo with sample data" action',
        step2: 'Session cadence & habit rationale + SessionsIllustration (hollow upcoming rings with Day 1 highlight) + Back / Skip navigation',
        step3: 'Restarting mindset + Goal / optional Custom Goal (Check icon + crimson alert) / Plan cadence / single-column Location rows + contextual Home Equipment picker + deepened sticky CTA fade',
        editing: 'Returning athlete "Where you train" sheet with Close button, Escape handler, location/equipment persistence, and disclosure toggle when away from home',
      },
      touchTarget: '>= 44px on Back, Skip, Close, goal/location/equipment buttons, and custom target input; >= 48px primary sticky CTA',
    },
    logic: {
      rules: [
        'Full-screen overlay keeps solid backgroundColor: var(--color-bg-canvas) beneath the top gradient so underlying tabs never bleed through.',
        'Steps 1 and 2 pair animated canvas-safe SVG illustrations with concise scannable copy and support horizontal swipe, Escape close (when dismissible), and visible focus outlines.',
        'Goal choices always map to GOAL_DISPLAY_NAME (Build Muscle, Lose Fat, Stay Lean) and never expose internal phase names.',
        'Home equipment pills default to empty for new athletes and appear contextually when At Home is selected (or via Edit home fallback gear).',
      ],
      variants: {
        firstRun: 'Steps 1-3 full onboarding with demo mode entry on Step 1',
        editPlace: 'Returning athlete Step 3 ("Where you train") launched from Workout menu or Settings',
      },
      accessibility: 'progressbar announces Step 1-3, heading receives focus on modal step change, custom goal input announces validation errors via aria-invalid and aria-describedby',
    },
    tailwindTokens: 'wk fixed inset-0 z-50 wk-button wk-field wk-pill --color-bg-canvas --wk-card --wk-accent --color-status-positive-soft --color-action-primary-bg',
    rationale: 'Calm, progressive 3-step onboarding grounds habits first, keeps configuration concrete and reversible, and maintains strict opaque full-screen contrast.',
  },
  {
    id: 'ds-info-experience',
    name: 'Information Experience: Ontology (Objects vs Concepts) & Semiotics Contract',
    category: 'layout',
    anatomy: {
      container: 'Two-layer Information Strategy (Ontology) -> Information Design (Semiotics) specification in Section 09 of DesignSystemApp and contentStrategy.ts',
      typography: 'Ontology concepts, vocabulary rules, and visibility matrices styled with wk-label, wk-title, wk-body, and wk-caption tokens',
      colors: 'Canonical terms highlighted with --color-accent-primary; deprecated terms flagged with --color-status-warning / --color-status-danger; suppressed surfaces muted on --wk-raised',
      states: {
        ontology: 'CORE_CONCEPTS vs CORE_OBJECT_DEFINITIONS, CONTROLLED_VOCABULARY, and IA_PROGRESS_TAXONOMY',
        semiotics: 'PRAGMATIC_VISIBILITY_MATRIX across 6 training contexts, BW vs loaded set semantics, Syntactics card grammar, and cross-tab Choreography',
      },
      touchTarget: '>= 44px on cross-tab choreography links such as ExerciseCard note history -> Progress Training insights',
    },
    logic: {
      rules: [
        'Separate abstract organizing Concepts (Scheduled Day, Performance & Standards, Body & Recovery Insights, Plan & Progression) from data-backed Object instances (Workout, ActiveDay, RestDay, Exercise, Set, ExerciseNote, Goal).',
        'Enforce a single Controlled Vocabulary across UI and AI Coach: locations are Full Gym / At Home / Bodyweight (never Travel); unlifted days read Rest day (never Non-training day); replacements use Swap exercise.',
        'Separate Training insights (KnowledgeGraphCard + Session notes timeline) as its own top-level Progress surface rather than nesting it under Strength standards.',
        'Bind Pragmatics visibility strictly per mode (Active Set Logging suppresses Steps card; Future Day Preview suppresses today session & Finish button) and display BW rather than misleading 0 on zero-added-load sets.',
      ],
      variants: {
        strategy: 'Definitions, Relationships, Controlled Vocabulary & IA Taxonomy',
        semiotics: 'Semantics, Pragmatics Visibility Matrix, Syntactics & Choreography',
      },
      accessibility: 'Direct 44px Choreography links connect ExerciseCard notes to Training insights without hiding notes inside Strength standards',
    },
    tailwindTokens: 'wk-card wk-raised wk-label wk-title wk-body wk-caption wk-pill --color-accent-primary --color-border-subtle',
    rationale: 'Treating Ontology and Semiotics as an executable design-system contract prevents vocabulary drift, surface leaks, and disconnected AI mental models.',
  },
];
export const HEADSTRONG_DESIGN_SYSTEM = TREISE_DESIGN_SYSTEM;

/**
 * Searches and queries the Knowledge Graph's Design System components.
 */
export function queryDesignSystemComponents(query?: string): DesignSystemComponent[] {
  if (!query || !query.trim()) return TREISE_DESIGN_SYSTEM;
  const q = query.toLowerCase().trim();
  const stopWords = new Set(['what', 'is', 'the', 'a', 'an', 'and', 'in', 'on', 'of', 'for', 'to', 'how', 'does', 'do', 'are', 'treise', 'headstrong', 'app']);
  const tokens = q
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));

  const scored = TREISE_DESIGN_SYSTEM.map((c) => {
    const textBlob = `${c.id} ${c.name} ${c.category} ${c.rationale} ${c.logic.rules.join(' ')} ${c.tailwindTokens}`.toLowerCase();
    let score = 0;
    if (textBlob.includes(q)) score += 50;
    if (c.id.toLowerCase().includes(q)) score += 30;
    if (c.name.toLowerCase().includes(q)) score += 20;
    for (const tok of tokens) {
      if (c.id.toLowerCase().includes(tok)) score += 10;
      if (c.name.toLowerCase().includes(tok)) score += 8;
      if (c.category.toLowerCase() === tok) score += 6;
      if (textBlob.includes(tok)) score += 3;
    }
    return { component: c, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.component);

  return scored;
}

export function getDesignSystemComponentById(id: string): DesignSystemComponent | undefined {
  return TREISE_DESIGN_SYSTEM.find((c) => c.id === id);
}

/**
 * Searches and queries the Knowledge Graph's authoritative Exercise Science knowledge base.
 */
function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!.,'":;()[\]/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesKeyword(cleanQuery: string, normalizedQuery: string, kw: string): boolean {
  const cleanKw = kw.toLowerCase().trim();
  if (!cleanKw) return false;
  // Multi-word phrases and symbol tokens match cleanly as phrase substrings; short words require word boundaries so
  // "mv" never falsely matches "movement", "ema" never matches "systematic", and "cut" never matches "execute".
  if (!cleanKw.includes(' ') && cleanKw.length <= 4 && /^[a-z0-9-]+$/.test(cleanKw)) {
    const escaped = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`).test(normalizedQuery);
  }
  return cleanQuery.includes(cleanKw) || normalizedQuery.includes(normalizeSearchText(cleanKw));
}

const QUERY_STOPWORDS = new Set([
  'about', 'all', 'also', 'and', 'any', 'are', 'because', 'been', 'before', 'behind', 'being', 'between',
  'both', 'but', 'can', 'could', 'did', 'does', 'doing', 'done', 'during', 'each', 'for', 'from', 'get',
  'getting', 'give', 'goes', 'good', 'got', 'had', 'has', 'have', 'help', 'here', 'his', 'her', 'how',
  'into', 'its', 'just', 'keep', 'know', 'like', 'make', 'many', 'may', 'might', 'more', 'most', 'much',
  'must', 'need', 'not', 'now', 'only', 'other', 'our', 'out', 'over', 'said', 'same', 'say', 'see',
  'she', 'should', 'some', 'such', 'take', 'tell', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'tip', 'tips', 'too', 'try', 'use', 'used', 'using', 'very',
  'want', 'was', 'way', 'ways', 'well', 'were', 'what', 'whats', 'when', 'where', 'which', 'while', 'who',
  'why', 'will', 'with', 'work', 'worked', 'would', 'you', 'your', 'yours',
]);

/**
 * Searches and queries the Knowledge Graph's authoritative Exercise Science knowledge base.
 */
export function queryExerciseScienceKnowledgeBase(query: string): ScientificPrinciple | null {
  const cleanQuery = query.toLowerCase().trim();
  const normalizedQuery = normalizeSearchText(cleanQuery);
  if (!cleanQuery) return null;

  let bestMatch: ScientificPrinciple | null = null;
  let maxScore = 0;

  for (const principle of EXERCISE_SCIENCE_KNOWLEDGE_BASE) {
    let score = 0;

    // 1. Title match (highest weight)
    if (cleanQuery.includes(principle.title.toLowerCase()) || normalizedQuery.includes(normalizeSearchText(principle.title))) {
      score += 100;
    }

    // 2. Keyword match (prefer longer/multi-word exact matches; guard short terms with word boundaries)
    for (const kw of principle.keywords) {
      if (matchesKeyword(cleanQuery, normalizedQuery, kw)) {
        score += kw.includes(' ') ? kw.length * 5 : kw.length * 2.5;
      }
    }

    // 3. Topic match
    if (cleanQuery.includes(principle.topic.toLowerCase())) {
      score += 20;
    }

    if (score > maxScore && score >= 4) {
      maxScore = score;
      bestMatch = principle;
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // Fallback: Whole-word token overlap across title, keywords, and academic citations (require 2+ domain hits)
  const tokens = normalizedQuery
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !QUERY_STOPWORDS.has(t));
  if (tokens.length === 0) return null;
  for (const principle of EXERCISE_SCIENCE_KNOWLEDGE_BASE) {
    let score = 0;
    const titleWords = new Set(normalizeSearchText(principle.title).split(/\s+/));
    const citationWords = new Set(normalizeSearchText(principle.academicCitation || '').split(/\s+/));
    for (const tok of tokens) {
      if (principle.keywords.some((k) => {
        const nk = normalizeSearchText(k);
        return nk === tok || nk.split(/\s+/).includes(tok);
      })) {
        score += 4;
      }
      if (titleWords.has(tok)) {
        score += 4;
      }
      if (citationWords.has(tok)) {
        score += 4;
      }
    }
    if (score > maxScore && score >= 8) {
      maxScore = score;
      bestMatch = principle;
    }
  }

  return bestMatch;
}

/**
 * Multi-result fuzzy search across scientific principles (including formulas and academic citations)
 */
export function searchExerciseScienceKnowledgeBase(query: string, maxResults: number = 6): ScientificPrinciple[] {
  const cleanQuery = query.toLowerCase().trim();
  const normalizedQuery = normalizeSearchText(cleanQuery);
  if (!cleanQuery) return EXERCISE_SCIENCE_KNOWLEDGE_BASE.slice(0, maxResults);

  const tokens = normalizedQuery.split(/\s+/).filter((t) => t.length > 2 && !QUERY_STOPWORDS.has(t));
  const scored = EXERCISE_SCIENCE_KNOWLEDGE_BASE.map((p) => {
    let score = 0;
    if (p.title.toLowerCase().includes(cleanQuery)) score += 10;
    if (p.topic.toLowerCase().includes(cleanQuery)) score += 8;
    if (p.formula?.toLowerCase().includes(cleanQuery)) score += 6;
    if (p.academicCitation?.toLowerCase().includes(cleanQuery)) score += 6;
    for (const kw of p.keywords) {
      if (matchesKeyword(cleanQuery, normalizedQuery, kw) || kw.toLowerCase().includes(normalizedQuery)) {
        score += kw.includes(' ') ? 8 : 6;
      }
    }
    for (const tok of tokens) {
      if (p.keywords.some((k) => normalizeSearchText(k).split(/\s+/).includes(tok) || normalizeSearchText(k).includes(tok))) score += 3;
      if (p.title.toLowerCase().includes(tok)) score += 3;
      if (p.formula?.toLowerCase().includes(tok)) score += 2;
      if (p.academicCitation?.toLowerCase().includes(tok)) score += 2;
      if (p.scientificRationale.toLowerCase().includes(tok)) score += 1;
      if (p.practicalApplication.toLowerCase().includes(tok)) score += 1;
    }
    return { principle: p, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.principle);

  return scored.slice(0, maxResults);
}

/**
 * Default biomechanical metadata enrichment for any exercise ID
 */
export function getExerciseBiomechanicalMeta(ex: ExerciseDefinition): {
  isIsolation: boolean;
  resistanceProfile: ResistanceProfile;
  sfrScore: number;
  axialLoadIndex: number;
  primaryJoints: JointType[];
} {
  if (
    ex.isIsolation !== undefined &&
    ex.resistanceProfile &&
    ex.sfrScore !== undefined &&
    ex.axialLoadIndex !== undefined &&
    ex.primaryJoints
  ) {
    return {
      isIsolation: ex.isIsolation,
      resistanceProfile: ex.resistanceProfile,
      sfrScore: ex.sfrScore,
      axialLoadIndex: ex.axialLoadIndex,
      primaryJoints: ex.primaryJoints,
    };
  }

  const id = ex.id.toLowerCase();
  const name = ex.name.toLowerCase();

  // Calves, Lateral Raises, Face Pulls, Curls, Pushdowns, Leg Curls, Leg Extensions, Core = Isolation
  const isIsolation =
    ex.isIsolation ??
    (id.includes('lateral') ||
      id.includes('calf') ||
      id.includes('curl') ||
      id.includes('leg-extension') ||
      id.includes('pushdown') ||
      id.includes('skullcrusher') ||
      id.includes('face-pull') ||
      id.includes('pull-apart') ||
      id.includes('crunch') ||
      id.includes('plank') ||
      id.includes('fly') ||
      id.includes('reverse-nordic') ||
      ex.primaryMuscle === 'Side Delts' ||
      ex.primaryMuscle === 'Rear Delts' ||
      ex.primaryMuscle === 'Calves' ||
      ex.primaryMuscle === 'Biceps' ||
      ex.primaryMuscle === 'Triceps' ||
      ex.primaryMuscle === 'Core');

  // Resistance profile classification (Lengthened stretch vs Mid vs Shortened peak)
  let resistanceProfile: ResistanceProfile = ex.resistanceProfile || 'mid';
  if (
    id.includes('rdl') ||
    id.includes('incline') ||
    id.includes('cable-lateral') ||
    id.includes('standing-calf') ||
    id.includes('seated-calf') ||
    id.includes('leg-curl') ||
    id.includes('nordic') ||
    id.includes('leg-extension') ||
    id.includes('pullup') ||
    id.includes('squat') ||
    id.includes('lunge') ||
    id.includes('step-up') ||
    id.includes('skullcrusher') ||
    id.includes('fly')
  ) {
    resistanceProfile = 'lengthened';
  } else if (
    id.includes('pushdown') ||
    id.includes('face-pull') ||
    id.includes('pull-apart') ||
    id.includes('hip-thrust') ||
    id.includes('glute-bridge') ||
    id.includes('db-lateral') ||
    id.includes('cable-row')
  ) {
    resistanceProfile = 'shortened';
  }

  // Axial / Spinal CNS load per set (0.0 to 1.0)
  let axialLoadIndex = ex.axialLoadIndex ?? 0.2;
  if (ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic) {
    axialLoadIndex = isIsolation ? 0.04 : 0.10;
  } else if (id.includes('deadlift') && !id.includes('rdl')) axialLoadIndex = 0.95;
  else if (id.includes('squat')) axialLoadIndex = 0.85;
  else if (id.includes('rdl')) axialLoadIndex = 0.75;
  else if (id.includes('barbell-row')) axialLoadIndex = 0.65;
  else if (id.includes('ohp') || id.includes('farmers-walk') || id.includes('suitcase-carry')) axialLoadIndex = 0.50;
  else if (id.includes('hip-thrust')) axialLoadIndex = 0.30;
  else if (id.includes('bench') || id.includes('pullup') || id.includes('dip') || id.includes('leg-press')) axialLoadIndex = 0.35;
  else if (isIsolation) axialLoadIndex = 0.08;

  // Stimulus-to-Fatigue Ratio (1.0 - 10.0)
  let sfrScore = ex.sfrScore ?? 8.0;
  if (ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic) {
    sfrScore = 9.0;
  } else if (
    id.includes('cable') ||
    id.includes('incline') ||
    id.includes('calf') ||
    id.includes('leg-curl') ||
    id.includes('leg-extension') ||
    id.includes('hip-thrust')
  ) {
    sfrScore = 9.2;
  } else if (id.includes('deadlift') && !id.includes('rdl')) {
    sfrScore = 6.2;
  } else if (id.includes('squat') || id.includes('bench')) {
    sfrScore = 7.8;
  }

  // Articular Joint mapping
  let primaryJoints: JointType[] = ex.primaryJoints || [];
  if (primaryJoints.length === 0) {
    if (ex.pillar === 'Horizontal Push' || ex.pillar === 'Vertical Push') {
      primaryJoints = id.includes('lateral') || id.includes('fly')
        ? ['Shoulder Capsule']
        : id.includes('pushdown') || id.includes('skullcrusher')
        ? ['Elbow Tendons']
        : ['Shoulder Capsule', 'Elbow Tendons'];
    } else if (ex.pillar === 'Horizontal Pull' || ex.pillar === 'Vertical Pull') {
      primaryJoints = id.includes('barbell-row')
        ? ['Lumbar Spine', 'Elbow Tendons']
        : id.includes('face-pull') || id.includes('pull-apart')
        ? ['Shoulder Capsule']
        : ['Elbow Tendons', 'Shoulder Capsule'];
    } else if (ex.pillar === 'Squat') {
      primaryJoints = id.includes('calf')
        ? ['Ankle / Achilles']
        : id.includes('plank')
        ? ['Shoulder Capsule', 'Lumbar Spine']
        : id.includes('squat')
        ? ['Knee / Patellar', 'Lumbar Spine']
        : ['Knee / Patellar'];
    } else if (ex.pillar === 'Hinge') {
      primaryJoints =
        id.includes('leg-curl') || id.includes('nordic')
          ? ['Knee / Patellar']
          : id.includes('hip-thrust') || id.includes('glute-bridge') || id.includes('farmers-walk') || id.includes('suitcase-carry')
          ? ['Lumbar Spine']
          : ['Lumbar Spine', 'Knee / Patellar'];
    }
  }

  return {
    isIsolation,
    resistanceProfile,
    sfrScore,
    axialLoadIndex,
    primaryJoints,
  };
}

/**
 * Builds the longitudinal Body Composition & Anthropometry Knowledge Profile across all
 * 13 RENPHO Health Scale metrics and 12 RENPHO Smart Tape Measure sites, including
 * bilateral left/right symmetry analysis for Biceps, Thighs, and Calves.
 */
export function buildBodyCompositionKnowledgeGraph(
  biometrics: BiometricLog[],
  profile: UserProfile,
  /** Formats kilograms and centimetres in the athlete's units for the summary. */
  fmt: { weight: (kg: number) => string; length: (cm: number) => string } = {
    weight: (kg) => `${Math.round(kg * 10) / 10} kg`,
    length: (cm) => `${Math.round(cm * 10) / 10} cm`,
  }
): BodyCompositionKnowledgeProfile {
  const sorted = [...biometrics].sort((a, b) => a.date.localeCompare(b.date));
  const athleteHeightCm = profile.measuredHeightCm || profile.heightCm;
  const heightM =
    typeof athleteHeightCm === 'number' && athleteHeightCm >= 100 && athleteHeightCm <= 250
      ? athleteHeightCm / 100
      : undefined;

  const scaleTrends: KgMetricTrend[] = RENPHO_SCALE_METRICS.map((meta) => {
    const points: Array<{ date: string; value: number }> = [];
    for (const b of sorted) {
      let val = b[meta.field] as number | undefined;
      if (meta.id === 'bmi' && !(val && val > 0)) {
        const entryHeightM =
          b.heightCm && b.heightCm >= 100 && b.heightCm <= 250 ? b.heightCm / 100 : heightM;
        if (entryHeightM && b.bodyweightKg > 0) {
          val = Math.round((b.bodyweightKg / (entryHeightM * entryHeightM)) * 10) / 10;
        }
      } else if (meta.id === 'fat_free_mass' && !(val && val > 0)) {
        if (b.bodyweightKg > 0 && b.bodyFatPct && b.bodyFatPct > 0 && b.bodyFatPct < 70) {
          val = Math.round(b.bodyweightKg * (1 - b.bodyFatPct / 100) * 10) / 10;
        }
      } else if (meta.id === 'bmr' && !(val && val > 0)) {
        const ffm =
          b.fatFreeMassKg && b.fatFreeMassKg > 0
            ? b.fatFreeMassKg
            : b.bodyweightKg > 0 && b.bodyFatPct && b.bodyFatPct > 0 && b.bodyFatPct < 70
            ? b.bodyweightKg * (1 - b.bodyFatPct / 100)
            : undefined;
        if (ffm && ffm > 15) {
          val = Math.round(370 + 21.6 * ffm);
        }
      }
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
        points.push({ date: b.date, value: val });
      }
    }

    const first = points[0];
    const last = points[points.length - 1];
    const delta =
      first && last && points.length >= 2
        ? Math.round((last.value - first.value) * 100) / 100
        : undefined;
    const deltaPct =
      first && last && points.length >= 2 && first.value !== 0
        ? Math.round(((last.value - first.value) / first.value) * 1000) / 10
        : undefined;

    let ema7d: number | undefined;
    if (meta.id === 'weight' && points.length > 0) {
      // The same average as the Weight chart: one source per number.
      const series = calculateEmaSeries(points.map((p) => ({ date: p.date, bodyweightKg: p.value })));
      ema7d = series[series.length - 1].ema;
    }

    const direction: KgMetricTrend['direction'] =
      points.length === 0
        ? 'empty'
        : delta === undefined || Math.abs(delta) < 0.05
        ? 'flat'
        : delta > 0
        ? 'up'
        : 'down';

    return {
      id: meta.id,
      field: meta.field,
      label: meta.label,
      shortLabel: meta.shortLabel,
      category: 'scale',
      unitKind: meta.unitKind,
      latest: last?.value,
      latestDate: last?.date,
      baseline: first?.value,
      baselineDate: first?.date,
      delta,
      deltaPct,
      ema7d,
      sampleCount: points.length,
      direction,
      points,
    };
  });

  const tapeTrends: KgMetricTrend[] = BODY_MEASUREMENT_SITES.map((meta) => {
    const points: Array<{ date: string; value: number }> = [];
    for (const b of sorted) {
      let val = b[meta.field] as number | undefined;
      if (!(val && val > 0)) {
        if (meta.id === 'bicep_right' && b.armCm && b.armCm > 0) val = b.armCm;
        else if (meta.id === 'thigh_right' && b.thighCm && b.thighCm > 0) val = b.thighCm;
        else if (meta.id === 'calf_right' && b.calfCm && b.calfCm > 0) val = b.calfCm;
      }
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
        points.push({ date: b.date, value: Math.round(val * 10) / 10 });
      }
    }

    const first = points[0];
    const last = points[points.length - 1];
    const delta =
      first && last && points.length >= 2
        ? Math.round((last.value - first.value) * 10) / 10
        : undefined;
    const deltaPct =
      first && last && points.length >= 2 && first.value !== 0
        ? Math.round(((last.value - first.value) / first.value) * 1000) / 10
        : undefined;

    const direction: KgMetricTrend['direction'] =
      points.length === 0
        ? 'empty'
        : delta === undefined || Math.abs(delta) < 0.05
        ? 'flat'
        : delta > 0
        ? 'up'
        : 'down';

    return {
      id: meta.id,
      field: meta.field,
      label: meta.label,
      shortLabel: meta.shortLabel,
      category: 'tape',
      unitKind: 'length',
      latest: last?.value,
      latestDate: last?.date,
      baseline: first?.value,
      baselineDate: first?.date,
      delta,
      deltaPct,
      sampleCount: points.length,
      direction,
      points,
    };
  });

  const trendBySite = new Map(tapeTrends.map((t) => [t.id, t]));
  const bilateralPairsConfig: Array<{
    id: 'bicep' | 'thigh' | 'calf';
    label: string;
    leftSite: BodyMeasurementSite;
    rightSite: BodyMeasurementSite;
  }> = [
    { id: 'bicep', label: 'Biceps (Left vs Right)', leftSite: 'bicep_left', rightSite: 'bicep_right' },
    { id: 'thigh', label: 'Thighs (Left vs Right)', leftSite: 'thigh_left', rightSite: 'thigh_right' },
    { id: 'calf', label: 'Calves (Left vs Right)', leftSite: 'calf_left', rightSite: 'calf_right' },
  ];

  const bilateralSymmetry: KgBilateralPair[] = bilateralPairsConfig.map((cfg) => {
    const leftCm = trendBySite.get(cfg.leftSite)?.latest;
    const rightCm = trendBySite.get(cfg.rightSite)?.latest;
    if (leftCm === undefined || rightCm === undefined) {
      return {
        ...cfg,
        leftCm,
        rightCm,
        status: 'insufficient_data',
        summary: `Log both left and right ${cfg.id} circumferences to evaluate bilateral muscular symmetry.`,
      };
    }
    const diffCm = Math.round((rightCm - leftCm) * 10) / 10;
    const absDiff = Math.abs(diffCm);
    const maxSide = Math.max(leftCm, rightCm);
    const asymmetryPct = maxSide > 0 ? Math.round((absDiff / maxSide) * 1000) / 10 : 0;
    const dominantSide: 'left' | 'right' | 'balanced' =
      absDiff <= 0.4 ? 'balanced' : diffCm > 0 ? 'right' : 'left';
    const status: KgBilateralPair['status'] =
      absDiff <= 0.5 || asymmetryPct <= 1.5
        ? 'balanced'
        : asymmetryPct <= 4.0
        ? 'mild_asymmetry'
        : 'notable_asymmetry';

    const summary =
      status === 'balanced'
        ? `Left (${fmt.length(leftCm)}) and Right (${fmt.length(rightCm)}) ${cfg.id}s are well balanced (Δ ${fmt.length(absDiff)}).`
        : `${dominantSide === 'right' ? 'Right' : 'Left'} ${cfg.id} is +${fmt.length(absDiff)} larger (${asymmetryPct}% difference). Start unilateral sets with your ${dominantSide === 'right' ? 'left' : 'right'} side and match reps.`;

    return {
      ...cfg,
      leftCm,
      rightCm,
      diffCm,
      asymmetryPct,
      dominantSide,
      status,
      summary,
    };
  });

  const weightTrend = scaleTrends.find((t) => t.id === 'weight');
  const bfTrend = scaleTrends.find((t) => t.id === 'body_fat');
  const ffmTrend = scaleTrends.find((t) => t.id === 'fat_free_mass');
  const waistTrend = tapeTrends.find((t) => t.id === 'waist');

  let recompositionStatus: BodyCompositionKnowledgeProfile['recompositionStatus'] = 'insufficient_data';
  let recompositionSummary =
    'Log your weight, body fat or tape measurements to see how your body is changing.';

  const ffmDelta = ffmTrend?.delta;
  const bfDelta = bfTrend?.delta;
  const waistDelta = waistTrend?.delta;
  const weightDelta = weightTrend?.delta;

  if (
    (ffmDelta !== undefined && ffmDelta >= 0.2 && bfDelta !== undefined && bfDelta <= -0.2) ||
    (waistDelta !== undefined && waistDelta <= -0.4 && weightDelta !== undefined && weightDelta >= -0.5)
  ) {
    recompositionStatus = 'recomp_positive';
    const parts: string[] = [];
    if (ffmDelta !== undefined && ffmDelta > 0) parts.push(`lean mass up ${fmt.weight(ffmDelta)}`);
    if (bfDelta !== undefined && bfDelta < 0) parts.push(`body fat down ${Math.abs(bfDelta).toFixed(1)}%`);
    if (waistDelta !== undefined && waistDelta < 0) parts.push(`waist down ${fmt.length(Math.abs(waistDelta))}`);
    recompositionSummary = `You're building muscle and losing fat at the same time: ${parts.join(', ')}.`;
  } else if (ffmDelta !== undefined && ffmDelta > 0.2) {
    recompositionStatus = 'lean_gain';
    recompositionSummary = `Your lean mass is up ${fmt.weight(ffmDelta)} since your first measurement.`;
  } else if (
    (bfDelta !== undefined && bfDelta < -0.2) ||
    (waistDelta !== undefined && waistDelta < -0.4)
  ) {
    recompositionStatus = 'fat_loss';
    const lost: string[] = [];
    if (bfDelta !== undefined && bfDelta < 0) lost.push(`body fat down ${Math.abs(bfDelta).toFixed(1)}%`);
    if (waistDelta !== undefined && waistDelta < 0) lost.push(`waist down ${fmt.length(Math.abs(waistDelta))}`);
    recompositionSummary = `You're losing fat: ${lost.join(', ')}.`;
  } else if (weightTrend && weightTrend.sampleCount >= 1) {
    recompositionStatus = 'holding';
    recompositionSummary = `Latest weight ${fmt.weight(weightTrend.latest ?? 0)}${weightTrend.ema7d && Math.abs(weightTrend.ema7d - (weightTrend.latest ?? 0)) >= 0.05 ? ` (7-day average ${fmt.weight(weightTrend.ema7d)})` : ''}. Keep logging your weight and measurements to see your trend.`;
  }

  const populatedScaleCount = scaleTrends.filter((t) => t.sampleCount > 0).length;
  const populatedTapeCount = tapeTrends.filter((t) => t.sampleCount > 0).length;

  let latestScaleDate: string | undefined;
  for (const t of scaleTrends) {
    if (t.latestDate && (!latestScaleDate || t.latestDate > latestScaleDate)) {
      latestScaleDate = t.latestDate;
    }
  }
  let latestTapeDate: string | undefined;
  for (const t of tapeTrends) {
    if (t.latestDate && (!latestTapeDate || t.latestDate > latestTapeDate)) {
      latestTapeDate = t.latestDate;
    }
  }

  return {
    scaleTrends,
    tapeTrends,
    bilateralSymmetry,
    recompositionStatus,
    recompositionSummary,
    populatedScaleCount,
    populatedTapeCount,
    latestScaleDate,
    latestTapeDate,
  };
}

/**
 * Builds the complete Athlete Personal Knowledge Graph from longitudinal history
 */
export function buildAthleteKnowledgeGraph(
  workouts: WorkoutSession[],
  biometrics: BiometricLog[],
  exerciseCatalog: ExerciseDefinition[],
  profile: UserProfile,
  weeklyVolume: Record<string, number>,
  /** Active days (rides, runs…), which count toward the weekly sessions goal. */
  activities: ActivityLog[] = []
): AthleteKnowledgeGraph {
  const exMap = new Map<string, ExerciseDefinition>(
    exerciseCatalog.map((e) => [e.id, e])
  );

  // Filter last 7 days for acute load
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weekStartStr = localDateString(weekStart);

  const recentWorkouts = workouts.filter((w) => w.date >= weekStartStr);

  // 1. Compute Joint Strain & Systemic Axial Load
  const jointRawStrain: Record<JointType, { strain: number; contributors: Set<string> }> = {
    'Shoulder Capsule': { strain: 0, contributors: new Set() },
    'Elbow Tendons': { strain: 0, contributors: new Set() },
    'Lumbar Spine': { strain: 0, contributors: new Set() },
    'Knee / Patellar': { strain: 0, contributors: new Set() },
    'Ankle / Achilles': { strain: 0, contributors: new Set() },
  };

  let totalWeeklyAxialUnits = 0;
  let totalHardSetsWeek = 0;
  let lengthenedSetsCount = 0;

  // Per-muscle lengthened vs shortened tracking
  const muscleLengthenedSets: Record<string, { lengthened: number; total: number; sfrSum: number }> = {};

  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      const def = exMap.get(ex.exerciseId) || {
        id: ex.exerciseId,
        name: ex.name,
        pillar: ex.pillar,
        primaryMuscle: 'Chest',
        equipment: ex.equipment,
        isRdl: ex.isRdl,
        isWeightedCalisthenic: ex.isWeightedCalisthenic,
        defaultRepRange: [ex.minReps, ex.maxReps],
      };

      const meta = getExerciseBiomechanicalMeta(def);
      const hardSets = ex.sets.filter(
        (s) => s.completed && s.setType !== 'warmup' && !s.isWarmup && (s.actualRir ?? 2) <= 3
      ).length;

      if (hardSets === 0) continue;

      totalHardSetsWeek += hardSets;
      totalWeeklyAxialUnits += hardSets * meta.axialLoadIndex;
      if (meta.resistanceProfile === 'lengthened') {
        lengthenedSetsCount += hardSets;
      }

      // Attribute to joints
      const rirIntensityMultiplier = ex.sets.some((s) => (s.actualRir ?? 2) === 0) ? 1.25 : 1.0;
      for (const j of meta.primaryJoints) {
        const jointIncrement = hardSets * (meta.isIsolation ? 2.4 : 4.2) * rirIntensityMultiplier;
        jointRawStrain[j].strain += jointIncrement;
        jointRawStrain[j].contributors.add(ex.name);
      }

      // Attribute lengthened profile to muscle key
      const mKey =
        def.primaryMuscle === 'Side Delts'
          ? 'SideDelts'
          : def.primaryMuscle === 'Rear Delts'
          ? 'RearDelts'
          : def.primaryMuscle === 'Front Delts'
          ? 'FrontDelts'
          : def.primaryMuscle;

      if (!muscleLengthenedSets[mKey]) {
        muscleLengthenedSets[mKey] = { lengthened: 0, total: 0, sfrSum: 0 };
      }
      muscleLengthenedSets[mKey].total += hardSets;
      muscleLengthenedSets[mKey].sfrSum += hardSets * meta.sfrScore;
      if (meta.resistanceProfile === 'lengthened') {
        muscleLengthenedSets[mKey].lengthened += hardSets;
      }
    }
  }

  // Format Joint Profiles
  const joints: JointStrainProfile[] = (Object.keys(jointRawStrain) as JointType[]).map((joint) => {
    const raw = jointRawStrain[joint];
    const strainScore = Math.min(100, Math.round(raw.strain));
    const status: JointStrainProfile['status'] =
      strainScore >= 72
        ? 'High Strain Alert'
        : strainScore >= 45
        ? 'Moderate Load'
        : 'Optimal';

    const topContributors = Array.from(raw.contributors).slice(0, 3);

    let biomechanicalAdvice = 'Joint load is well within a healthy, comfortable range this week.';
    if (joint === 'Shoulder Capsule' && strainScore >= 45) {
      biomechanicalAdvice =
        'Your shoulders have worked hard on presses this week. Use a neutral grip on dumbbells or cables if the front of your shoulder feels tight, and keep doing light face pulls.';
    } else if (joint === 'Elbow Tendons' && strainScore >= 45) {
      biomechanicalAdvice =
        'Heavy presses and arm work have loaded your elbows. Use a rope attachment on tricep pushdowns so your wrists can rotate naturally.';
    } else if (joint === 'Lumbar Spine' && strainScore >= 45) {
      biomechanicalAdvice =
        'Squats, deadlifts, and bent-over rows all load your lower back. Swap Barbell Rows for Seated Cable Rows if your lower back feels tired.';
    } else if (joint === 'Knee / Patellar' && strainScore >= 45) {
      biomechanicalAdvice =
        'Warm up with Seated Leg Curls before squatting—warming up your hamstrings first makes heavy squats feel much smoother on your knees.';
    } else if (joint === 'Ankle / Achilles' && strainScore >= 45) {
      biomechanicalAdvice =
        'Use a smooth 2-second pause at the bottom of your calf raises instead of bouncing.';
    }

    return {
      joint,
      strainScore,
      status,
      topContributors: topContributors.length > 0 ? topContributors : ['Normal Daily Movement'],
      biomechanicalAdvice,
    };
  });

  // 2. Calculate 6-Week E1RM Velocity per Movement / Muscle
  const sortedWorkouts = [...workouts].filter((w) => w.completed).sort((a, b) => a.date.localeCompare(b.date));
  const bwEmaAt = buildBodyweightEmaLookup(biometrics);
  const firstHalf = sortedWorkouts.slice(0, Math.max(1, Math.floor(sortedWorkouts.length / 2)));
  const secondHalf = sortedWorkouts.slice(Math.floor(sortedWorkouts.length / 2));

  const getAvgE1rmForPillar = (subset: WorkoutSession[], pillar: string): number => {
    let best = 0;
    for (const w of subset) {
      const sessionBw = bwEmaAt(w.date, 0);
      for (const ex of w.exercises) {
        if (ex.pillar === pillar) {
          for (const s of ex.sets) {
            if (s.completed && s.actualReps) {
              const extLoad = s.actualWeightKg ?? s.targetWeightKg;
              // Never fabricate bodyweight if no weigh-in has been recorded.
              if ((ex.isWeightedCalisthenic || ex.equipment === 'bodyweight') && extLoad === 0 && sessionBw <= 0) {
                continue;
              }
              const e1rm = calculateE1RM(
                extLoad,
                s.actualReps,
                s.actualRir ?? 2,
                ex.equipment,
                ex.isRdl,
                ex.isWeightedCalisthenic,
                sessionBw,
                ex.exerciseId,
                ex.pillar
              );
              if (e1rm > best) best = e1rm;
            }
          }
        }
      }
    }
    return best;
  };

  // 3. Build Muscle Adaptation Profiles with Personalized Landmarks across all 12 tracked muscles
  const trackedMuscles = [
    'SideDelts',
    'Calves',
    'RearDelts',
    'Back',
    'Chest',
    'Quads',
    'Hamstrings',
    'Triceps',
    'Biceps',
    'Glutes',
    'FrontDelts',
    'Core',
  ];

  const muscleProfiles: MuscleAdaptationProfile[] = trackedMuscles.map((mKey) => {
    const lm = HYPERTROPHY_VOLUME_LANDMARKS[mKey] || HYPERTROPHY_VOLUME_LANDMARKS.Chest;
    const weeklySets = Math.round((weeklyVolume[mKey] || 0) * 10) / 10;
    const stats = muscleLengthenedSets[mKey] || { lengthened: 0, total: 0, sfrSum: 0 };

    // 0 = not measured (no sets logged for this muscle yet).
    const lengthenedBiasPct = stats.total > 0 ? Math.round((stats.lengthened / stats.total) * 100) : 0;
    const avgSfr = stats.total > 0 ? Math.round((stats.sfrSum / stats.total) * 10) / 10 : 0;

    // Personalized MAV calibration based on athlete's goal phase and recovery kinetics
    const phaseModifier = profile.goalPhase === 'Cut / Recomp' ? 0.85 : profile.goalPhase === 'Lean Bulk' ? 1.05 : 1.0;
    const personalMin = Math.round(lm.mavMin * phaseModifier);
    const personalMax = Math.round(lm.mavMax * phaseModifier);

    // Map muscle to pillar for velocity estimation
    const pillarForMuscle =
      mKey === 'Chest' || mKey === 'Triceps'
        ? 'Horizontal Push'
        : mKey === 'Back' || mKey === 'Biceps' || mKey === 'RearDelts'
        ? 'Vertical Pull'
        : mKey === 'Quads' || mKey === 'Calves' || mKey === 'Core'
        ? 'Squat'
        : mKey === 'Hamstrings' || mKey === 'Glutes'
        ? 'Hinge'
        : 'Vertical Push';

    // Strength change between the first and second half of the athlete's history; 0 = not enough data.
    const earlyBest = sortedWorkouts.length >= 2 ? getAvgE1rmForPillar(firstHalf, pillarForMuscle) : 0;
    const lateBest = sortedWorkouts.length >= 2 ? getAvgE1rmForPillar(secondHalf, pillarForMuscle) : 0;
    const e1rmVelocityPct =
      earlyBest > 0 && lateBest > 0 ? Math.round(((lateBest - earlyBest) / earlyBest) * 1000) / 10 : 0;

    let recommendation =
      e1rmVelocityPct > 0
        ? `Growing steadily (+${e1rmVelocityPct}% so far). Keep weekly sets between ${personalMin} and ${personalMax}.`
        : `Keep weekly sets between ${personalMin} and ${personalMax}.`;
    if (weeklySets < personalMin) {
      recommendation = `Currently ${Math.round((personalMin - weeklySets) * 10) / 10} sets below your target range (${personalMin}–${personalMax} sets). Add 2–3 sets this week.`;
    } else if (stats.total > 0 && lengthenedBiasPct < 40) {
      recommendation = `Set count is on track (${weeklySets} sets). Include an exercise with a full bottom stretch (like Incline DB or Cable variations) for extra growth.`;
    }

    return {
      muscleKey: mKey,
      displayName: lm.displayName,
      weeklySets,
      populationMav: [lm.mavMin, lm.mavMax],
      personalizedMav: [personalMin, personalMax],
      lengthenedBiasPct,
      avgSfr,
      e1rmVelocityPct,
      recommendation,
    };
  });

  // 4. Compute Body Composition & Anthropometry Knowledge Profile (13 Scale Metrics + 12 Tape Sites)
  const athleteUnit = profile.weightUnit || 'kg';
  const bodyFmt = {
    weight: (kg: number) => formatWeight(kg, athleteUnit),
    length: (cm: number) =>
      athleteUnit === 'lb'
        ? `${Math.round((cm / 2.54) * 10) / 10} in`
        : `${Math.round(cm * 10) / 10} cm`,
  };
  const bodyComposition = buildBodyCompositionKnowledgeGraph(biometrics, profile, bodyFmt);

  // 5. Compute Biometric, Steps, Whoop & Activity Correlations
  // Only days with real watch data count; zeros mean "not measured".
  const sortedBiometrics = [...biometrics].sort((a, b) => a.date.localeCompare(b.date));
  const recentBiometrics = sortedBiometrics.slice(-14);
  const hrvDays = recentBiometrics.filter((b) => (b.hrvRmssd || 0) > 0);
  const sleepDays = recentBiometrics.filter((b) => (b.sleepHours || 0) > 0);
  const hasRecoveryData = hrvDays.length > 0;
  const avgHrv = hasRecoveryData
    ? Math.round(hrvDays.reduce((a, b) => a + b.hrvRmssd, 0) / hrvDays.length)
    : 0;
  const avgSleep =
    sleepDays.length > 0
      ? Math.round((sleepDays.reduce((a, b) => a + b.sleepHours, 0) / sleepDays.length) * 10) / 10
      : 0;

  const recentWhoopStrain = recentWorkouts
    .map((w) => w.whoopStrain)
    .filter((s): s is number => typeof s === 'number' && s > 0);
  const latestBio = sortedBiometrics[sortedBiometrics.length - 1];
  const avgWorkoutStrain =
    recentWhoopStrain.length > 0
      ? Math.round((recentWhoopStrain.reduce((a, b) => a + b, 0) / recentWhoopStrain.length) * 10) / 10
      : latestBio?.workoutStrain || latestBio?.strain;
  const latestRecoveryScore = latestBio?.recoveryScore;

  // Map daily steps telemetry chronologically.
  const todayStr = localDateString();
  const todayMs = parseLocalDate(todayStr).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const stepByDate = new Map<string, number>();
  for (const b of sortedBiometrics) {
    if ((b.steps || 0) > 0 && b.date) {
      stepByDate.set(b.date, Math.max(stepByDate.get(b.date) ?? 0, Math.round(b.steps)));
    }
  }
  const stepEntries = [...stepByDate.entries()]
    .map(([date, steps]) => ({ date, steps }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const todayStepsVal = stepByDate.get(todayStr);
  const latestStepEntry = stepEntries[stepEntries.length - 1];
  const last7Steps = stepEntries.filter((e) => {
    const ms = parseLocalDate(e.date).getTime();
    return ms >= todayMs - 6 * DAY_MS && ms <= todayMs;
  });
  const prev7Steps = stepEntries.filter((e) => {
    const ms = parseLocalDate(e.date).getTime();
    return ms >= todayMs - 13 * DAY_MS && ms <= todayMs - 7 * DAY_MS;
  });
  const last14Steps = stepEntries.filter((e) => {
    const ms = parseLocalDate(e.date).getTime();
    return ms >= todayMs - 13 * DAY_MS && ms <= todayMs;
  });
  const avg7dSteps = last7Steps.length > 0 ? Math.round(last7Steps.reduce((s, e) => s + e.steps, 0) / last7Steps.length) : undefined;
  const prev7dSteps = prev7Steps.length > 0 ? Math.round(prev7Steps.reduce((s, e) => s + e.steps, 0) / prev7Steps.length) : undefined;
  const avg14dSteps = last14Steps.length > 0 ? Math.round(last14Steps.reduce((s, e) => s + e.steps, 0) / last14Steps.length) : undefined;
  const stepsGoalTarget = profile.goalSettings?.customGoals?.find((g) => g.metric === 'steps')?.target;
  let stepsTrend: KgStepsSummary['trend'] = 'insufficient_data';
  if (avg7dSteps !== undefined && prev7dSteps !== undefined && prev7dSteps > 0) {
    const pctDiff = (avg7dSteps - prev7dSteps) / prev7dSteps;
    stepsTrend = pctDiff >= 0.05 ? 'up' : pctDiff <= -0.05 ? 'down' : 'flat';
  } else if (stepEntries.length >= 2) {
    const firstVal = stepEntries[0].steps;
    const lastVal = latestStepEntry.steps;
    const pctDiff = firstVal > 0 ? (lastVal - firstVal) / firstVal : 0;
    stepsTrend = pctDiff >= 0.05 ? 'up' : pctDiff <= -0.05 ? 'down' : 'flat';
  }
  const stepsSummaryText =
    stepEntries.length === 0
      ? stepsGoalTarget
        ? `No step counts recorded yet toward your ${stepsGoalTarget.toLocaleString()} daily step goal.`
        : 'No step counts recorded yet.'
      : stepEntries.length === 1
      ? `${latestStepEntry.steps.toLocaleString()} steps recorded on ${latestStepEntry.date}${stepsGoalTarget ? ` (goal ${stepsGoalTarget.toLocaleString()})` : ''}.`
      : [
          todayStepsVal !== undefined
            ? `${todayStepsVal.toLocaleString()} steps today`
            : `Latest ${latestStepEntry.steps.toLocaleString()} steps on ${latestStepEntry.date}`,
          avg7dSteps !== undefined ? `7-day avg ${avg7dSteps.toLocaleString()}` : undefined,
          prev7dSteps !== undefined ? `prior 7-day avg ${prev7dSteps.toLocaleString()}` : undefined,
          stepsGoalTarget ? `goal ${stepsGoalTarget.toLocaleString()}` : undefined,
        ]
          .filter(Boolean)
          .join(', ') + '.';
  const stepsSummary: KgStepsSummary = {
    todaySteps: todayStepsVal,
    latestSteps: latestStepEntry?.steps,
    latestStepsDate: latestStepEntry?.date,
    avg7d: avg7dSteps,
    previous7dAvg: prev7dSteps,
    avg14d: avg14dSteps,
    loggedDays: stepEntries.length,
    goalTarget: stepsGoalTarget,
    trend: stepsTrend,
    summary: stepsSummaryText,
  };

  // Map Whoop vitals chronologically from recorded fields only.
  const pickLatest = (fn: (b: BiometricLog) => number | undefined): { value?: number; date?: string } => {
    for (let i = sortedBiometrics.length - 1; i >= 0; i--) {
      const v = fn(sortedBiometrics[i]);
      if (typeof v === 'number' && v > 0) return { value: v, date: sortedBiometrics[i].date };
    }
    return {};
  };
  const whoopConfigured = isWhoopConfigured(profile);
  const latestRecEntry = pickLatest((b) => b.recoveryScore);
  const latestDayStrainEntry = pickLatest((b) => b.strain);
  const latestBioWoStrainEntry = pickLatest((b) => b.workoutStrain);
  const latestWorkoutStrainWorkout = [...sortedWorkouts].reverse().find((w) => typeof w.whoopStrain === 'number' && w.whoopStrain > 0);
  const whoopWorkoutStrain =
    latestWorkoutStrainWorkout && latestBioWoStrainEntry.date
      ? latestWorkoutStrainWorkout.date >= latestBioWoStrainEntry.date
        ? latestWorkoutStrainWorkout.whoopStrain
        : latestBioWoStrainEntry.value
      : latestWorkoutStrainWorkout?.whoopStrain ?? latestBioWoStrainEntry.value;
  const whoopLatestDates = [latestRecEntry.date, latestDayStrainEntry.date, latestBioWoStrainEntry.date, latestWorkoutStrainWorkout?.date].filter(
    (d): d is string => Boolean(d)
  );
  const whoopSummary: KgWhoopSummary = {
    configured: whoopConfigured,
    recoveryScore: latestRecEntry.value,
    dayStrain: latestDayStrainEntry.value,
    workoutStrain: whoopWorkoutStrain,
    hrvRmssd: pickLatest((b) => b.hrvRmssd).value,
    restingHr: pickLatest((b) => b.restingHr).value,
    sleepHours: pickLatest((b) => b.sleepHours).value,
    sleepPerformance: pickLatest((b) => b.sleepPerformance).value,
    sleepEfficiency: pickLatest((b) => b.sleepEfficiency).value,
    respiratoryRate: pickLatest((b) => b.respiratoryRate).value,
    spo2: pickLatest((b) => b.spo2).value,
    skinTemp: pickLatest((b) => b.skinTemp).value,
    latestDate: whoopLatestDates.sort().pop() ?? latestBio?.date,
  };

  // Map non-lifting active days & completed workouts.
  const recentActivities7d = activities.filter((a) => {
    const ms = parseLocalDate(a.date).getTime();
    return ms >= todayMs - 6 * DAY_MS && ms <= todayMs;
  });
  const lastDoneWorkout = sortedWorkouts[sortedWorkouts.length - 1];
  const activitySummary: KgActivitySummary = {
    completedWorkouts: sortedWorkouts.length,
    lastWorkoutDate: lastDoneWorkout?.date,
    lastWorkoutName: lastDoneWorkout?.name,
    loggedActivities: activities.length,
    activitiesLast7d: recentActivities7d.length,
    activeMinutesLast7d: Math.round(recentActivities7d.reduce((s, a) => s + (a.minutes || 0), 0)),
  };

  const systemicAxialLoadScore = Math.min(100, Math.round((totalWeeklyAxialUnits / 16) * 100));
  const lengthenedStimulusRatio =
    totalHardSetsWeek > 0 ? Math.round((lengthenedSetsCount / totalHardSetsWeek) * 100) : 0;
  // The same score as the recovery card (0 = nothing measured today).
  const recoveryEfficiencyScore = latestBio
    ? displayRecoveryScore(calculateDailyReadiness(latestBio, biometrics, profile.wearableSource), latestBio) ?? 0
    : 0;

  // 6. Generate Plain-English Coaching Insights
  const highestStrainJoint = [...joints].sort((a, b) => b.strainScore - a.strainScore)[0];
  const fastestMuscle = [...muscleProfiles].sort((a, b) => b.e1rmVelocityPct - a.e1rmVelocityPct)[0];
  const underVolumeHighResponder =
    muscleProfiles.find(
      (m) =>
        (m.muscleKey === 'SideDelts' || m.muscleKey === 'Calves') &&
        m.weeklySets < m.personalizedMav[1] - 2
    ) || muscleProfiles[0];

  const insights: CausalInsight[] = [];

  // Whoop Autonomic & Strain Insight
  // Only when Whoop has actually reported a recovery score and a strain value.
  const measuredStrain = avgWorkoutStrain || latestBio?.strain;
  if (latestRecoveryScore !== undefined && measuredStrain !== undefined) {
    const strainVal = measuredStrain;
    const recVal = latestRecoveryScore;
    const isGreen = recVal >= 67;
    const isYellow = recVal >= 34 && recVal < 67;

    insights.push({
      id: 'pkg-insight-whoop-strain',
      category: 'Autonomic',
      title: 'Recovery and Workout Strain',
      confidence: 97,
      impactMetric: `${recVal}% Recovery • ${strainVal} Strain`,
      narrative: isGreen
        ? `Your recovery is ${recVal}% (green) after ${strainVal} workout strain. You're well recovered, so it's a good day to push for more reps or weight.`
        : isYellow
        ? `Your recovery is ${recVal}% (yellow) after ${strainVal} workout strain. Train as planned, stopping 1–2 reps short of failure.`
        : `Your recovery is ${recVal}% (red) after ${strainVal} workout strain. Keep today's weights steady and stop 2–3 reps short of failure so your body can catch up.`,
      actionableStep: isGreen
        ? 'Push for the upper boundary of your rep targets to earn progressive load jumps.'
        : isYellow
        ? 'Keep your usual pace and stop 1–2 reps short of failure on every working set.'
        : 'On the big lifts, stop 2–3 reps short of failure today.',
    });
  }

  insights.push(
    {
      id: 'pkg-insight-1',
      category: 'Hypertrophy',
      title: `${underVolumeHighResponder.displayName} Can Handle More Sets`,
      confidence: 96,
      impactMetric: `Fast Recovery`,
      narrative: `${underVolumeHighResponder.displayName} recover in about 24 hours and put zero strain on your lower back. You are at ${underVolumeHighResponder.weeklySets} sets this week (target range: ${underVolumeHighResponder.personalizedMav[0]}–${underVolumeHighResponder.personalizedMav[1]} sets).`,
      actionableStep: `Add 1–2 extra sets of ${underVolumeHighResponder.displayName} at the end of your workout for faster growth.`,
    },
    {
      id: 'pkg-insight-2',
      category: 'Biomechanical',
      title: `Full-Stretch Exercises (${lengthenedStimulusRatio}% of Sets)`,
      confidence: 93,
      impactMetric: `${lengthenedStimulusRatio}% Full Stretch`,
      narrative: `Out of your weekly sets, ${lengthenedStimulusRatio}% work the muscle in a deep stretch (like Romanian Deadlifts, Incline Dumbbell Press, and Calf Raises), which is proven to build muscle faster.`,
      actionableStep:
        lengthenedStimulusRatio >= 55
          ? `Great exercise mix—keep controlling the lowering phase for 2 seconds on every rep.`
          : `Include more full-stretch movements like Incline Dumbbell Press or Seated Leg Curls.`,
    },
    {
      id: 'pkg-insight-3',
      category: 'Joint Health',
      title: `${highestStrainJoint.joint} Check (${highestStrainJoint.strainScore}/100)`,
      confidence: 91,
      impactMetric: highestStrainJoint.status,
      narrative: `Most of the load on your ${highestStrainJoint.joint.toLowerCase()} this week came from ${highestStrainJoint.topContributors.join(', ')}.`,
      actionableStep: highestStrainJoint.biomechanicalAdvice,
    },
  );
  if (sleepDays.length >= 3) {
    insights.push({
      id: 'pkg-insight-4',
      category: 'Autonomic',
      title: `Your sleep: ${avgSleep}h a night`,
      confidence: 80,
      impactMetric: avgSleep >= 7 ? 'On track' : 'Below 7 hours',
      narrative: `Over your last ${sleepDays.length} nights with watch data you averaged ${avgSleep} hours of sleep. Most lifters recover best with 7–9 hours.`,
      actionableStep:
        avgSleep >= 7
          ? 'Keep it up. Push for weight increases on well-rested days.'
          : 'Aim for an earlier bedtime this week, and keep weights steady on short-sleep days.',
    });
  }

  // Body Composition & Tape Anthropometry Insight (when body fat, scale composition, or tape sites are logged)
  const hasExplicitCompositionOrTape = biometrics.some(
    (b) =>
      (b.bodyFatPct && b.bodyFatPct > 0) ||
      (b.skeletalMuscleMassKg && b.skeletalMuscleMassKg > 0) ||
      (b.waistCm && b.waistCm > 0) ||
      (b.chestCm && b.chestCm > 0) ||
      (b.bicepLeftCm && b.bicepLeftCm > 0) ||
      (b.bicepRightCm && b.bicepRightCm > 0) ||
      (b.thighLeftCm && b.thighLeftCm > 0) ||
      (b.thighRightCm && b.thighRightCm > 0)
  );
  if (hasExplicitCompositionOrTape) {
    const bfTrend = bodyComposition.scaleTrends.find((t) => t.id === 'body_fat');
    const ffmTrend = bodyComposition.scaleTrends.find((t) => t.id === 'fat_free_mass');
    const waistTrend = bodyComposition.tapeTrends.find((t) => t.id === 'waist');
    const asymPair = bodyComposition.bilateralSymmetry.find(
      (p) => p.status === 'mild_asymmetry' || p.status === 'notable_asymmetry'
    );
    insights.push({
      id: 'pkg-insight-body-composition',
      category: 'Hypertrophy',
      title: 'Body Composition & Tape Trends',
      confidence: 95,
      impactMetric:
        bfTrend?.latest !== undefined
          ? `${bfTrend.latest}% BF${ffmTrend?.latest ? ` • ${bodyFmt.weight(ffmTrend.latest)} FFM` : ''}`
          : waistTrend?.latest !== undefined
          ? `${bodyFmt.length(waistTrend.latest)} Waist`
          : `${bodyComposition.populatedTapeCount} Tape Sites`,
      narrative: `${bodyComposition.recompositionSummary}${asymPair ? ` ${asymPair.summary}` : ''}`,
      actionableStep: asymPair
        ? `Begin unilateral arm/leg sets on your ${asymPair.dominantSide === 'right' ? 'left' : 'right'} side and match reps on the dominant side.`
        : 'Log morning weigh-ins and tape measurements weekly under consistent conditions to track lean mass and circumferences.',
    });
  }

  const hasTravelOrBw =
    recentWorkouts.some(
      (w) => w.location === 'travel' || w.exercises.some((e) => e.equipment === 'bodyweight')
    ) || profile.activeLocation === 'travel';

  if (hasTravelOrBw) {
    insights.push({
      id: 'pkg-insight-travel-bw',
      category: 'Hypertrophy',
      title: 'Bodyweight Mechanical Tension Progression',
      confidence: 94,
      impactMetric: 'Effective Tension',
      narrative:
        'Without gym weights, muscles still grow from higher rep targets (up to 30 reps, stopping 1–2 reps short of failure) and slow 3-second lowering, which keeps tension on the muscle at its longest.',
      actionableStep:
        'Focus on full range of motion with a 2-second paused stretch at the bottom of each bodyweight rep.',
    });
  }

  // Extract athlete session notes across workouts and derive longitudinal insights
  const classifyExerciseNote = (note: string): ExerciseNoteCategory => {
    if (/\b(pain|ache|aching|sharp|pinch|tweak|twinge|stiff|tight|sore|hurt|strain|clicking|impinge|discomfort|tendon)\b/i.test(note)) {
      return 'pain_discomfort';
    }
    if (/\b(heavy|grind|ground out|exhaust|fatigue|tired|weak|struggl|failed|slipping|grip gave)\b/i.test(note)) {
      return 'fatigue_heavy';
    }
    if (/\b(easy|light|smooth|fast|crisp|snappy|explosive|felt strong|room for more|move up|increase weight)\b/i.test(note)) {
      return 'strong_easy';
    }
    if (/\b(pin|seat|hole|bench|notch|rack|grip width|stance|belt|straps|hook|cable|attachment|setting)\b/i.test(note)) {
      return 'equipment_setup';
    }
    if (/\b(pause|slow|tempo|eccentric|stretch|lockout|depth|form|cue|brace|arch|elbow|scapula|control)\b/i.test(note)) {
      return 'technique_cue';
    }
    return 'general';
  };

  const emaForNotes = buildBodyweightEmaLookup(biometrics);
  const completedChrono = [...workouts]
    .filter((w) => w.completed)
    .sort((a, b) => a.date.localeCompare(b.date));
  const exerciseNotesHistory: ExerciseNoteEntry[] = [];
  for (const w of completedChrono) {
    const bwKg = emaForNotes(w.date, 0);
    for (const ex of w.exercises) {
      const note = ex.athleteNotes?.trim();
      if (!note) continue;
      const doneSets = ex.sets.filter((s) => s.completed && !s.isWarmup && s.setType !== 'warmup');
      let bestE1rmKg = 0;
      let topWeightKg = 0;
      let topReps = 0;
      for (const s of doneSets) {
        const kg = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const reps = s.actualReps ?? 0;
        if (kg > topWeightKg || (kg === topWeightKg && reps > topReps)) {
          topWeightKg = kg;
          topReps = reps;
        }
        const usesBw = ex.equipment === 'bodyweight' || ex.equipment === 'weighted_bodyweight' || Boolean(ex.isWeightedCalisthenic);
        if (!usesBw || bwKg > 0) {
          const e = calculateE1RM(
            kg,
            reps,
            s.actualRir ?? s.targetRir ?? 2,
            ex.equipment,
            ex.isRdl,
            ex.isWeightedCalisthenic,
            bwKg > 0 ? bwKg : 80,
            ex.exerciseId,
            ex.pillar
          );
          if (e > bestE1rmKg) bestE1rmKg = Math.round(e * 10) / 10;
        }
      }
      exerciseNotesHistory.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        date: w.date,
        workoutId: w.id,
        note,
        category: classifyExerciseNote(note),
        readinessState: w.readinessState || 'Normal',
        ...(bestE1rmKg > 0 ? { bestE1rmKg } : {}),
        ...(topWeightKg > 0 ? { topWeightKg } : {}),
        ...(topReps > 0 ? { topReps } : {}),
      });
    }
  }
  exerciseNotesHistory.reverse();

  const discomfortNotes = exerciseNotesHistory.filter((n) => n.category === 'pain_discomfort');
  if (discomfortNotes.length > 0) {
    const byExercise = new Map<string, ExerciseNoteEntry[]>();
    for (const n of discomfortNotes) {
      const arr = byExercise.get(n.exerciseName) || [];
      arr.push(n);
      byExercise.set(n.exerciseName, arr);
    }
    const repeatedEntry = [...byExercise.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const [flaggedName, entries] = repeatedEntry;
    const dateList = entries.slice(0, 3).map((e) => e.date).join(', ');
    insights.push({
      id: 'pkg-insight-notes-discomfort',
      category: 'Joint Health',
      title:
        entries.length >= 2
          ? `Recurring Note: ${flaggedName}`
          : `Discomfort Note: ${flaggedName}`,
      confidence: entries.length >= 2 ? 93 : 84,
      impactMetric: `${entries.length} ${entries.length === 1 ? 'note' : 'notes'}`,
      narrative:
        entries.length >= 2
          ? `You noted discomfort or tightness on ${flaggedName} across ${entries.length} sessions (${dateList}): "${entries[0].note}".`
          : `You logged a discomfort note on ${flaggedName} (${entries[0].date}): "${entries[0].note}".`,
      actionableStep:
        'Use the Swap button if pain repeats on this pattern, keep 2–3 reps in reserve, and stop any set that produces sharp joint pain.',
    });
  }

  const fatigueNotes = exerciseNotesHistory.filter((n) => n.category === 'fatigue_heavy');
  if (fatigueNotes.length >= 2) {
    const lowRecoveryMatches = fatigueNotes.filter((n) => n.readinessState === 'Amber Shield').length;
    insights.push({
      id: 'pkg-insight-notes-fatigue',
      category: 'Autonomic',
      title: 'Session Notes Show Elevated Fatigue',
      confidence: 88,
      impactMetric: `${fatigueNotes.length} heavy logs`,
      narrative:
        lowRecoveryMatches > 0
          ? `${fatigueNotes.length} recent exercise notes mention heavy or grinding sets, with ${lowRecoveryMatches} falling on Amber Shield recovery days (${fatigueNotes[0].exerciseName} on ${fatigueNotes[0].date}).`
          : `You flagged heavy or grinding effort in ${fatigueNotes.length} sessions (latest: ${fatigueNotes[0].exerciseName} on ${fatigueNotes[0].date}: "${fatigueNotes[0].note}").`,
      actionableStep:
        'Hold weight steady until bar speed returns cleanly within 1–2 reps in reserve.',
    });
  }

  if (exerciseNotesHistory.length > 0 && discomfortNotes.length === 0) {
    const latestNote = exerciseNotesHistory[0];
    const uniqueExCount = new Set(exerciseNotesHistory.map((n) => n.exerciseId)).size;
    insights.push({
      id: 'pkg-insight-notes-log',
      category: 'Biomechanical',
      title: 'Session Notes & Cues Tracked',
      confidence: 90,
      impactMetric: `${exerciseNotesHistory.length} ${exerciseNotesHistory.length === 1 ? 'note' : 'notes'}`,
      narrative: `Latest on ${latestNote.exerciseName} (${latestNote.date}): "${latestNote.note}" across ${uniqueExCount} ${uniqueExCount === 1 ? 'exercise' : 'exercises'}.`,
      actionableStep:
        'Your latest cue stays pinned directly on each exercise card next session so setups and feel stay consistent.',
    });
  }

  const latestBf = bodyComposition.scaleTrends.find((t) => t.id === 'body_fat')?.latest;
  const latestFfm = bodyComposition.scaleTrends.find((t) => t.id === 'fat_free_mass')?.latest;
  const latestWaist = bodyComposition.tapeTrends.find((t) => t.id === 'waist')?.latest;

  // 7. Construct Graph Nodes & Edges for Interactive Visualization
  const nodes: KgNode[] = [
    {
      id: 'node-athlete',
      label: profile.name.split(' ')[0] || 'You',
      category: 'athlete',
      score: recoveryEfficiencyScore,
      status: 'optimal',
      subtitle: `Week ${profile.mesocycleWeek || 3}`,
      metrics: {
        'Recovery': recoveryEfficiencyScore > 0 ? `${recoveryEfficiencyScore}/100` : 'No watch data',
        ...(avgWorkoutStrain ? { 'Workout Strain': `${avgWorkoutStrain}` } : { 'Back Load': `${systemicAxialLoadScore}%` }),
        'Full Stretch': `${lengthenedStimulusRatio}%`,
        ...(stepsSummary.avg7d !== undefined ? { 'Steps (7d avg)': stepsSummary.avg7d.toLocaleString() } : {}),
        ...(activitySummary.activitiesLast7d > 0 ? { 'Active Days (7d)': `${activitySummary.activitiesLast7d}` } : {}),
      },
      detailText: `Your overall training balance across 6 weeks of workouts, sleep, daily movement, and weekly set targets.`,
    },
    {
      id: 'node-biometrics',
      label: whoopConfigured ? 'Whoop Recovery & Strain' : 'Sleep & Heart',
      category: 'biometric',
      score: recoveryEfficiencyScore,
      status:
        latestRecoveryScore !== undefined
          ? latestRecoveryScore >= 67
            ? 'optimal'
            : latestRecoveryScore >= 34
            ? 'optimal'
            : 'warning'
          : avgHrv >= 55
          ? 'optimal'
          : 'elevated',
      subtitle:
        whoopConfigured && (whoopSummary.recoveryScore !== undefined || latestRecoveryScore !== undefined)
          ? `${whoopSummary.recoveryScore ?? latestRecoveryScore}% Recovery${avgWorkoutStrain ?? whoopSummary.dayStrain ? ` • ${avgWorkoutStrain ?? whoopSummary.dayStrain} Strain` : avgSleep ? ` • ${avgSleep}h Sleep` : ''}`
          : hasRecoveryData
          ? `${avgSleep ? `${avgSleep}h • ` : ''}${avgHrv}ms`
          : stepsSummary.avg7d !== undefined
          ? `${stepsSummary.avg7d.toLocaleString()} steps/day`
          : 'No watch data yet',
      metrics: {
        ...(whoopSummary.recoveryScore !== undefined ? { 'Whoop Recovery': `${whoopSummary.recoveryScore}%` } : {}),
        ...(whoopSummary.workoutStrain !== undefined ? { 'Workout Strain': `${whoopSummary.workoutStrain}` } : avgWorkoutStrain !== undefined ? { 'Workout Strain': `${avgWorkoutStrain}` } : {}),
        ...(whoopSummary.dayStrain !== undefined ? { 'Day Strain': `${whoopSummary.dayStrain}` } : {}),
        ...(latestBio?.kilojoules !== undefined ? { 'Energy': `${latestBio.kilojoules} kJ` } : {}),
        ...(hasRecoveryData ? { 'Avg HRV': `${avgHrv} ms` } : {}),
        ...(avgSleep ? { 'Avg Sleep': `${avgSleep} hrs` } : {}),
        ...(whoopSummary.sleepPerformance !== undefined ? { 'Sleep Performance': `${Math.round(whoopSummary.sleepPerformance)}%` } : {}),
        ...(whoopSummary.sleepEfficiency !== undefined ? { 'Sleep Efficiency': `${Math.round(whoopSummary.sleepEfficiency)}%` } : {}),
        ...(whoopSummary.respiratoryRate !== undefined ? { 'Resp Rate': `${whoopSummary.respiratoryRate.toFixed(1)} brpm` } : {}),
        ...(whoopSummary.spo2 !== undefined ? { 'SpO2': `${whoopSummary.spo2.toFixed(1)}%` } : {}),
        ...(whoopSummary.skinTemp !== undefined ? { 'Skin Temp': `${whoopSummary.skinTemp.toFixed(1)} °C` } : {}),
        ...((latestBio?.restingHr || 0) > 0 ? { 'Resting Pulse': `${latestBio?.restingHr} bpm` } : {}),
        ...(stepsSummary.todaySteps !== undefined ? { 'Steps Today': stepsSummary.todaySteps.toLocaleString() } : {}),
        ...(stepsSummary.avg7d !== undefined ? { 'Steps (7d avg)': stepsSummary.avg7d.toLocaleString() } : {}),
        ...(latestBf !== undefined ? { 'Body Fat': `${latestBf}%` } : {}),
        ...(latestFfm !== undefined ? { 'Fat-Free Mass': bodyFmt.weight(latestFfm) } : {}),
        ...(latestWaist !== undefined ? { 'Waist': bodyFmt.length(latestWaist) } : {}),
      },
      detailText: whoopConfigured
        ? `Your Whoop recovery${(whoopSummary.recoveryScore ?? latestRecoveryScore) !== undefined ? ` (${whoopSummary.recoveryScore ?? latestRecoveryScore}%)` : ''}${avgWorkoutStrain !== undefined ? ` and workout strain (${avgWorkoutStrain})` : ''} set how hard each day's workout should be.`
        : hasRecoveryData
        ? `Your 14-day sleep and heart rate recovery trend. It adjusts your daily effort targets.`
        : `Connect a watch to see your sleep and heart rate recovery here.`,
    },
    {
      id: 'node-delts-calves',
      label: 'Shoulders & Calves',
      category: 'muscle',
      score: 92,
      status:
        (weeklyVolume.SideDelts || 0) >= 16 && (weeklyVolume.Calves || 0) >= 16
          ? 'optimal'
          : 'under',
      subtitle: `${weeklyVolume.SideDelts || 0} / ${weeklyVolume.Calves || 0} sets`,
      metrics: {
        'Side Shoulders': `${weeklyVolume.SideDelts || 0} / 16–26 sets`,
        'Calves': `${weeklyVolume.Calves || 0} / 16–24 sets`,
        'Recovery Speed': '24 Hours',
      },
      detailText: `Fast-recovering muscles that cause zero lower-back fatigue and grow best with 16–26 sets per week.`,
    },
    {
      id: 'node-anterior-chain',
      label: 'Chest & Quads',
      category: 'muscle',
      score: 88,
      status: 'optimal',
      subtitle: `${weeklyVolume.Chest || 0} / ${weeklyVolume.Quads || 0} sets`,
      metrics: {
        'Chest': `${weeklyVolume.Chest || 0} / 12–18 sets`,
        'Quads': `${weeklyVolume.Quads || 0} / 12–18 sets`,
        'Strength Gain': fastestMuscle.e1rmVelocityPct > 0 ? `+${fastestMuscle.e1rmVelocityPct}%` : '—',
      },
      detailText: `Pushing and squatting muscles. Best trained with 12–18 quality sets per week and 48–60 hours of rest between heavy sessions.`,
    },
    {
      id: 'node-posterior-chain',
      label: 'Back & Hams',
      category: 'muscle',
      score: 86,
      status: (weeklyVolume.Hamstrings || 0) > 18 ? 'warning' : 'optimal',
      subtitle: `${weeklyVolume.Back || 0} / ${weeklyVolume.Hamstrings || 0} sets`,
      metrics: {
        'Back & Lats': `${weeklyVolume.Back || 0} / 14–22 sets`,
        'Hamstrings': `${weeklyVolume.Hamstrings || 0} / 10–16 sets`,
        'Recovery Speed': '48–72 Hours',
      },
      detailText: `Pulling and hinge muscles. Hamstrings take up to 72 hours to recover after heavy deadlifts, so 10–16 sets is the ideal weekly target.`,
    },
    {
      id: 'node-joints',
      label: 'Joint Health',
      category: 'joint',
      score: 100 - Math.round(highestStrainJoint.strainScore * 0.5),
      status:
        highestStrainJoint.strainScore >= 72
          ? 'warning'
          : highestStrainJoint.strainScore >= 45
          ? 'elevated'
          : 'optimal',
      subtitle: `${highestStrainJoint.joint.split(' ')[0]} ${highestStrainJoint.strainScore}%`,
      metrics: {
        'Most Loaded': highestStrainJoint.joint,
        'Joint Load': `${highestStrainJoint.strainScore}/100`,
        'Lower Back': `${systemicAxialLoadScore}%`,
      },
      detailText: highestStrainJoint.biomechanicalAdvice,
    },
  ];

  const edges: KgEdge[] = [
    {
      id: 'e-bio-ath',
      source: 'node-biometrics',
      target: 'node-athlete',
      relation: 'MODULATES_RECOVERY',
      weight: 0.9,
      label: 'Daily Recovery Check',
    },
    {
      id: 'e-dc-ath',
      source: 'node-delts-calves',
      target: 'node-athlete',
      relation: 'STIMULATES',
      weight: 0.85,
      label: 'Fast Recovery Muscles',
    },
    {
      id: 'e-ant-ath',
      source: 'node-anterior-chain',
      target: 'node-athlete',
      relation: 'DRIVES_ADAPTATION',
      weight: 0.92,
      label: 'Squat & Bench Strength',
    },
    {
      id: 'e-post-ath',
      source: 'node-posterior-chain',
      target: 'node-athlete',
      relation: 'DRIVES_ADAPTATION',
      weight: 0.88,
      label: 'Pull & Deadlift Strength',
    },
    {
      id: 'e-ant-joint',
      source: 'node-anterior-chain',
      target: 'node-joints',
      relation: 'LOADS_JOINT',
      weight: 0.65,
      label: 'Shoulder & Knee Load',
    },
    {
      id: 'e-post-joint',
      source: 'node-posterior-chain',
      target: 'node-joints',
      relation: 'LOADS_JOINT',
      weight: 0.72,
      label: 'Lower Back Load',
    },
  ];

  return {
    nodes,
    edges,
    joints,
    muscleProfiles,
    goals: buildAthleteGoals({
      profile,
      workouts,
      activities,
      biometrics,
      bodyweightKg: biometrics.some((b) => (b.bodyweightKg || 0) > 0) ? getLatestBodyweightEma(biometrics) : undefined,
    }),
    bodyComposition,
    stepsSummary,
    whoopSummary,
    activitySummary,
    exerciseNotesHistory,
    // The full-stretch share only means something once there are sets this week.
    insights: totalHardSetsWeek > 0 ? insights : insights.filter((i) => i.id !== 'pkg-insight-2'),
    scientificKnowledgeBase: EXERCISE_SCIENCE_KNOWLEDGE_BASE,
    designSystem: TREISE_DESIGN_SYSTEM,
    systemicAxialLoadScore,
    lengthenedStimulusRatio,
    recoveryEfficiencyScore,
  };
}
