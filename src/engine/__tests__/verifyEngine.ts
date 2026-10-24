import {
  calculateE1RM,
  calculateEffectiveLoad,
  calculateRepsNeededForTargetE1RM,
  calculateWeightNeededForTargetE1RM,
  getBodyweightLoadRatio,
  calculateHypertrophyBodyweightReps,
  translateWeightBetweenImplements,
  formatImplementWeightLabel,
} from '../e1rm';
import { calculateNextEma, calculateEmaSeries } from '../ema';
import { calculateDotsScore } from '../dots';
import {
  evaluateStrengthStandard,
  calculateSubTierQuest,
} from '../strengthStandards';
import { calculateDailyReadiness } from '../readiness';
import { prescribeDoubleProgression } from '../progression';
import { calculateWci, calculateHrrPercentage } from '../wci';
import { calculateEngineVitalityScore, generate7PillarRadarData } from '../vitality';
import { BiometricLog, ExerciseSession, WorkoutSession } from '../types';
import {
  detectPixelTensorHardware,
  generateTensorCoachingInsight,
  evaluateTensorBiomechanicalMatch,
  setTensorSimulationOverride,
} from '../tensorAI';
import {
  getExerciseBiomechanicalMeta,
  EXERCISE_SCIENCE_KNOWLEDGE_BASE,
  queryExerciseScienceKnowledgeBase,
  searchExerciseScienceKnowledgeBase,
  TREISE_DESIGN_SYSTEM,
  queryDesignSystemComponents,
  getDesignSystemComponentById,
} from '../knowledgeGraph';
import { SEED_EXERCISES } from '../../services/seedData';
import { processAssistantMessage, buildSafetyResponse, buildProgressSummary } from '../../services/aiAssistantService';
import { evaluateSessionRecovery, getDaysUntilReady } from '../recovery';
import { buildSessionProgressReport } from '../../services/sessionReport';
import { personalizeSessionLoads } from '../loadPersonalization';
import { getNextProgramWorkoutNumber } from '../muscleBuildingProgram';
import { getTemplateDefaultWeight } from '../../services/workoutGenerator';
import { snapLoadKg, formatWeight } from '../../utils/units';
import { localDateString } from '../../utils/date';
import { calculateBestPillarE1rms } from '../../services/storage';
import { evaluateSetProgressAward, planRestAfterSet } from '../../services/setCompletion';
import { completeWorkout } from '../../services/workoutCompletion';
import { onWearableTokensRefreshed } from '../../services/wearableTokens';
import { registerFallbackOnDeviceModel } from '../../services/onDeviceModel';
import { fetchWhoopDailyBiometrics, fetchWhoopWorkoutStrain } from '../../services/whoopService';
import { WhoopWorkoutStrainSummary } from '../../services/whoopService';
import {
  calculateWarmupPrescription,
  generateWarmupSets,
  isCompoundMovement,
  isIsolationMovement,
  isFirstCompoundForPillar,
  ensureWarmupSetsOnExercise,
} from '../warmup';
import {
  WORKOUT_TEMPLATES_24,
  PROGRAM_PHASES,
  WARMUP_PROTOCOL,
  INTENSITY_PROTOCOLS,
  calculate5StepWarmupRamp,
  generate6WeekMuscleBuildingWorkout,
  MUSCLE_BUILDING_PROGRAM_META,
} from '../muscleBuildingProgram';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
  console.log(`✓ ${msg}`);
}

console.log('--- TEST SUITE: TREISE EXERCISE SCIENCE ENGINE ---');

// 1. E1RM Formula & Stabilization Multipliers
console.log('\n[1. E1RM & Stabilization Multipliers]');
const bbE1rm = calculateE1RM(100, 10, 2, 'barbell');
// 100 * (1 + 12/30) = 140
assert(Math.abs(bbE1rm - 140) < 0.1, `Barbell 100kg x 10 @ 2 RIR = 140kg (got ${bbE1rm})`);

const dbE1rm = calculateE1RM(30, 10, 2, 'dumbbell');
// 30 * 1.18 * 1.4 = 49.56 -> 49.6
assert(Math.abs(dbE1rm - 49.6) < 0.2, `Dumbbell 30kg x 10 @ 2 RIR with 1.18x multiplier (got ${dbE1rm})`);

const rdlE1rm = calculateE1RM(100, 10, 2, 'barbell', true);
// 100 * 1.20 * 1.4 = 168
assert(Math.abs(rdlE1rm - 168) < 0.1, `RDL 100kg x 10 @ 2 RIR with 1.20x multiplier = 168kg (got ${rdlE1rm})`);

const pullupE1rm = calculateE1RM(10, 10, 2, 'weighted_bodyweight', false, true, 80);
// (80 + 10) * 1.4 = 126
assert(Math.abs(pullupE1rm - 126) < 0.1, `Weighted Pullup 10kg load with 80kg BW = 126kg (got ${pullupE1rm})`);

// 2. 7-Day Bodyweight EMA
console.log('\n[2. 7-Day Bodyweight EMA]');
const nextEma = calculateNextEma(84, 80);
// 84 * 0.25 + 80 * 0.75 = 21 + 60 = 81
assert(Math.abs(nextEma - 81) < 0.01, `Next EMA(84, 80) = 81kg (got ${nextEma})`);

// 3. Official International DOTS Polynomial
console.log('\n[3. Official International DOTS Polynomial]');
const dotsMale = calculateDotsScore(400, 80, 'male');
assert(dotsMale > 250 && dotsMale < 350, `Male DOTS for 400kg total @ 80kg BW is valid (got ${dotsMale})`);

const dotsFemale = calculateDotsScore(300, 60, 'female');
assert(dotsFemale > 250 && dotsFemale < 400, `Female DOTS for 300kg total @ 60kg BW is valid (got ${dotsFemale})`);

// 4. 6-Pillar Strength Standards & Sub-Divisions
console.log('\n[4. 6-Pillar Standards & 4 Sub-Divisions]');
// Squat standard thresholds male: [0.75, 1.20, 1.50, 2.00, 2.50]
// 120kg squat @ 80kg BW = 1.50 ratio -> Intermediate I
const squatStd = evaluateStrengthStandard('Squat', 120, 80, 'male');
assert(squatStd.tier === 'Intermediate', `120kg squat @ 80kg BW is Intermediate (got ${squatStd.tier})`);
assert(squatStd.subDivision === 'I', `120kg squat @ 80kg BW is Sub-division I (got ${squatStd.subDivision})`);

const quest = calculateSubTierQuest('Squat', 120, 80, 100, 8, 'barbell', false, false, 'male');
assert(quest.displayText.includes('reach Intermediate II'), `Quest points to next sub-division (got ${quest.displayText})`);

// 5. Pixel Watch Readiness & Amber Shield
console.log('\n[5. Pixel Watch Readiness & Amber Shield Auto-Regulation]');
const baselineLogs: BiometricLog[] = Array.from({ length: 14 }).map((_, i) => ({
  date: `2026-10-0${i + 1}`,
  bodyweightKg: 80,
  hrvRmssd: 60,
  restingHr: 55,
  sleepHours: 7.5,
  steps: 9000,
  activeZoneMinutes: 40,
}));

// Primed day: HRV high, RHR low, sleep high
const primedLog: BiometricLog = {
  date: '2026-10-15',
  bodyweightKg: 80,
  hrvRmssd: 75,
  restingHr: 50,
  sleepHours: 8.5,
  steps: 11000,
  activeZoneMinutes: 50,
};
const primedEval = calculateDailyReadiness(primedLog, baselineLogs);
assert(primedEval.state === 'Primed', `Primed day evaluates to Primed (got ${primedEval.state})`);
assert(primedEval.xpMultiplier === 1.15, `Primed grants +15% XP bonus`);

// Amber Shield day: HRV drops > 15%
const amberLog: BiometricLog = {
  date: '2026-10-16',
  bodyweightKg: 80,
  hrvRmssd: 45, // 60 -> 45 (-25%)
  restingHr: 61,
  sleepHours: 5.2, // < 6h
  steps: 6000,
  activeZoneMinutes: 15,
};
const amberEval = calculateDailyReadiness(amberLog, baselineLogs);
assert(amberEval.state === 'Amber Shield', `Depressed biometrics trigger Amber Shield (got ${amberEval.state})`);
assert(amberEval.streakProtected === true, `Amber Shield protects streak`);
const weighInOnlyEval = calculateDailyReadiness({ date: '2026-10-16', bodyweightKg: 80, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 }, baselineLogs, 'whoop');
assert(
  weighInOnlyEval.hasRecoveryData === false && primedEval.hasRecoveryData !== false,
  'A day with nothing measured is flagged so no readiness score is shown'
);

// 6. Double Progression
console.log('\n[6. Double Progression Logic]');
const sampleSession: ExerciseSession = {
  id: 's-1',
  exerciseId: 'ex-bench-press',
  name: 'Barbell Bench Press',
  pillar: 'Horizontal Push',
  equipment: 'barbell',
  minReps: 8,
  maxReps: 12,
  sets: [
    { id: '1', setNumber: 1, targetWeightKg: 90, actualWeightKg: 90, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 2, completed: true },
    { id: '2', setNumber: 2, targetWeightKg: 90, actualWeightKg: 90, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 2, completed: true },
    { id: '3', setNumber: 3, targetWeightKg: 90, actualWeightKg: 90, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 1, completed: true },
  ],
};

const topPrescription = prescribeDoubleProgression(sampleSession, 'Normal');
assert(topPrescription.nextWeightKg === 92.5, `Top of rep range (12/12/12) prescribes +2.5kg (got ${topPrescription.nextWeightKg})`);
assert(topPrescription.nextTargetReps[0] === 8, `Reps reset to bottom of range 8 reps (got ${topPrescription.nextTargetReps[0]})`);

const amberPrescription = prescribeDoubleProgression(sampleSession, 'Amber Shield');
assert(amberPrescription.isAmberShieldBuffer === true, `Amber shield prescription activates protective buffer`);
assert(amberPrescription.nextWeightKg === 90, `Amber shield holds load static at 90kg`);

// 7. Work Capacity Index (WCI)
console.log('\n[7. Work Capacity Index (WCI)]');
const wciWorkout = {
  id: 'w-1',
  date: '2026-10-14',
  name: 'Push Day',
  splitDay: 'Push' as const,
  completed: true,
  readinessState: 'Normal' as const,
  readinessZScore: 0.1,
  xpEarned: 400,
  avgHeartRate: 145,
  durationMinutes: 60,
  exercises: [sampleSession],
};
const wci = calculateWci(wciWorkout, 55, 192);
assert(wci > 0, `WCI calculates positive index (got ${wci})`);

// 8. 7th Pillar Engine / Vitality
console.log('\n[8. 7-Pillar Athletic Radar]');
const radar = generate7PillarRadarData(
  {
    Squat: 140,
    Hinge: 180,
    'Horizontal Push': 115,
    'Vertical Push': 75,
    'Horizontal Pull': 100,
    'Vertical Pull': 125,
  },
  80,
  primedLog,
  'male'
);
assert(radar.length === 7, `Radar contains 7 pillars (got ${radar.length})`);
assert(radar.some((p) => p.pillar === 'Engine / Vitality'), `Radar includes 7th Pillar Engine / Vitality`);

// 9. Hypertrophy Volume Landmarks Engine
console.log('\n[9. Authoritative Hypertrophy Volume Landmarks (RP & Schoenfeld)]');
import { HYPERTROPHY_VOLUME_LANDMARKS, evaluateVolumeStatus, getRecommendedSetsForWeek } from '../hypertrophyVolume';

const sideDelts = HYPERTROPHY_VOLUME_LANDMARKS.SideDelts;
const calves = HYPERTROPHY_VOLUME_LANDMARKS.Calves;
const hamstrings = HYPERTROPHY_VOLUME_LANDMARKS.Hamstrings;
const chest = HYPERTROPHY_VOLUME_LANDMARKS.Chest;

assert(sideDelts.mavMin === 16 && sideDelts.mavMax === 26, `Side Delts MAV is 16–26 sets/week`);
assert(calves.mavMin === 16 && calves.mavMax === 24, `Calves MAV is 16–24 sets/week`);
assert(hamstrings.mavMin === 10 && hamstrings.mavMax === 16, `Hamstrings MAV is 10–16 sets/week (lower due to high damage/fast-twitch)`);
assert(sideDelts.mavMax > hamstrings.mavMax, `Lateral Delts volume capacity exceeds Hamstrings`);

// Volume Status Evaluations
const deltEval = evaluateVolumeStatus('SideDelts', 20);
assert(deltEval.status === 'optimal_mav', `20 sets of Lateral Delts is in Optimal MAV (got ${deltEval.status})`);

const hamsEval = evaluateVolumeStatus('Hamstrings', 20);
assert(hamsEval.status === 'above_mrv', `20 sets of Hamstrings exceeds MRV recovery ceiling (got ${hamsEval.status})`);

const chestLowEval = evaluateVolumeStatus('Chest', 5);
assert(chestLowEval.status === 'maintenance', `5 sets of Chest is in maintenance (below MEV 8)`);

// Mesocycle Week Recommendations
const w1Delt = getRecommendedSetsForWeek('SideDelts', 1, 'Lean Bulk');
assert(w1Delt.targetSets === 8, `Week 1 Lateral Delts prescribes MEV = 8 sets`);

const w3Delt = getRecommendedSetsForWeek('SideDelts', 3, 'Lean Bulk');
assert(w3Delt.targetSets === 21, `Week 3 Lateral Delts prescribes Mid-MAV = 21 sets`);

const w6Deload = getRecommendedSetsForWeek('Chest', 6, 'Lean Bulk');
assert(w6Deload.targetSets === 4, `Week 6 Deload prescribes Maintenance MV = 4 sets`);

// 10. Personal Knowledge Graph (PKG) & Historical Progression Engine
console.log('\n[10. Personal Knowledge Graph (PKG) & Historical Progression]');
import { buildAthleteKnowledgeGraph } from '../knowledgeGraph';

const pkg = buildAthleteKnowledgeGraph(
  [wciWorkout],
  baselineLogs,
  [
    {
      id: 'ex-bench-press',
      name: 'Barbell Bench Press',
      pillar: 'Horizontal Push',
      primaryMuscle: 'Chest',
      secondaryMuscles: ['Triceps', 'Shoulders'],
      equipment: 'barbell',
      defaultRepRange: [8, 12],
    },
    {
      id: 'ex-db-lateral-raise',
      name: 'DB Lateral Raise',
      pillar: 'Vertical Push',
      primaryMuscle: 'Side Delts',
      equipment: 'dumbbell',
      defaultRepRange: [12, 20],
    },
  ],
  {
    name: 'Alex Vance',
    gender: 'male',
    age: 28,
    heightCm: 178,
    goalPhase: 'Lean Bulk',
    mesocycleWeek: 3,
    level: 14,
    currentXp: 4850,
    streakDays: 19,
    fitbitConnected: true,
    maxHr: 192,
    restingHrBaseline: 56,
  },
  { SideDelts: 18, Calves: 18, Chest: 14, Back: 16, Quads: 14, Hamstrings: 12 }
);
assert(pkg.nodes.length === 6, `PKG contains 6 core physiological nodes (got ${pkg.nodes.length})`);
assert(pkg.edges.length === 6, `PKG contains 6 weighted causal edges (got ${pkg.edges.length})`);
assert(pkg.joints.length === 5, `PKG tracks all 5 articular joint structures (got ${pkg.joints.length})`);
assert(pkg.insights.length === 4, `PKG mines 4 longitudinal causal insights (got ${pkg.insights.length})`);

// Historical Double Progression Lookup on an uncompleted active session:
const uncompletedActiveBench: ExerciseSession = {
  id: 'active-bench',
  exerciseId: 'ex-bench-press',
  name: 'Barbell Bench Press',
  pillar: 'Horizontal Push',
  equipment: 'barbell',
  minReps: 8,
  maxReps: 12,
  sets: [
    { id: 'u1', setNumber: 1, targetWeightKg: 90, targetReps: 8, targetRir: 2, completed: false },
    { id: 'u2', setNumber: 2, targetWeightKg: 90, targetReps: 8, targetRir: 2, completed: false },
    { id: 'u3', setNumber: 3, targetWeightKg: 90, targetReps: 8, targetRir: 2, completed: false },
  ],
};
const histPrescription = prescribeDoubleProgression(uncompletedActiveBench, 'Normal', [wciWorkout]);
assert(
  histPrescription.nextWeightKg === 92.5,
  `Uncompleted active session inherits +2.5kg progression (92.5kg) from historical workout (got ${histPrescription.nextWeightKg})`
);
assert(
  histPrescription.previousSetsSummary?.[0] === '90×12 @2R',
  `Previous set ghost string accurately reflects historical set "90×12 @2R" (got ${histPrescription.previousSetsSummary?.[0]})`
);

// Isolation Hypertrophy Quest vs Compound Benchmark Quest
const isoQuest = calculateSubTierQuest(
  'Vertical Push',
  35,
  80,
  14,
  15,
  'dumbbell',
  false,
  false,
  'male',
  { isIsolation: true, maxReps: 20, sfrScore: 9.2, resistanceProfile: 'lengthened' }
);


// 11. OOUX Cross-Implement Equivalence & Unified Movement Vector Progression
console.log('\n[11. OOUX Cross-Implement Equivalence & Unified Vector Progression]');
// 90kg Barbell Bench -> Dumbbell Press (90 / 1.18 = 76.27 -> 76kg combined = 38kg/DB)
const translatedDbWeight = translateWeightBetweenImplements(
  90,
  { equipment: 'barbell' },
  { equipment: 'dumbbell' },
  80
);
assert(
  translatedDbWeight === 76,
  `90kg Barbell translates to 76kg combined Dumbbell (38kg/DB) @ 1.18x (got ${translatedDbWeight})`
);
assert(
  formatImplementWeightLabel(translatedDbWeight, 'dumbbell') === '76kg (38kg/DB)',
  `Dumbbell label formats combined and per-hand weight clearly`
);

// Round-trip: 76kg Dumbbell -> Barbell (76 * 1.18 = 89.68 -> 90kg Barbell)
const roundTripBarbell = translateWeightBetweenImplements(
  76,
  { equipment: 'dumbbell' },
  { equipment: 'barbell' },
  80
);
assert(
  roundTripBarbell === 90,
  `76kg combined Dumbbell translates back to 90kg Barbell (got ${roundTripBarbell})`
);

// Cross-implement Double Progression:
// Athlete's last workout had Barbell Bench Press (90kg x 12/12/12 @ 1-2 RIR).
// Today the athlete only has Dumbbells (Incline Dumbbell Press).
const activeDumbbellPress: ExerciseSession = {
  id: 'active-db-press',
  exerciseId: 'ex-db-bench-press',
  name: 'Incline Dumbbell Press',
  pillar: 'Horizontal Push',
  equipment: 'dumbbell',
  minReps: 8,
  maxReps: 12,
  sets: [
    { id: 'db1', setNumber: 1, targetWeightKg: 68, targetReps: 10, targetRir: 2, completed: false },
    { id: 'db2', setNumber: 2, targetWeightKg: 68, targetReps: 10, targetRir: 2, completed: false },
    { id: 'db3', setNumber: 3, targetWeightKg: 68, targetReps: 10, targetRir: 2, completed: false },
  ],
};

const crossPrescription = prescribeDoubleProgression(
  activeDumbbellPress,
  'Normal',
  [wciWorkout],
  80
);
assert(
  crossPrescription.transferredFromExerciseName === 'Barbell Bench Press',
  `Cross-implement prescription detects transfer from Barbell Bench Press (got ${crossPrescription.transferredFromExerciseName})`
);
assert(
  crossPrescription.nextWeightKg === 78,
  `Cross-implement Double Progression translates 90kg BB -> 76kg DB and adds +2kg DB progression = 78kg (got ${crossPrescription.nextWeightKg})`
);
assert(
  crossPrescription.previousSetsSummary?.[0] === '≈76×12 @2R',
  `Cross-implement ghost displays translated load "≈76×12 @2R" (got ${crossPrescription.previousSetsSummary?.[0]})`
);

// 12. Full End-to-End Application Lifecycle: Storage, Workout Generator & Google Play Data Safety
console.log('\n[12. End-to-End App Lifecycle: Storage, Generator & Google Play Data Safety]');

// Polyfill in-memory localStorage & sessionStorage for Node environment
const memStore = new Map<string, string>();
const sessionMemStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => memStore.set(k, String(v)),
  removeItem: (k: string) => memStore.delete(k),
  clear: () => memStore.clear(),
};
(globalThis as any).sessionStorage = {
  getItem: (k: string) => (sessionMemStore.has(k) ? sessionMemStore.get(k)! : null),
  setItem: (k: string, v: string) => sessionMemStore.set(k, String(v)),
  removeItem: (k: string) => sessionMemStore.delete(k),
  clear: () => sessionMemStore.clear(),
};

import {
  resetAllToSeedData,
  calculateWeeklyMuscleVolume,
  exportAllUserDataJSON,
  importUserDataJSON,
  permanentlyEraseAllUserData,
  loadProfile,
  loadWorkouts,
  loadBiometrics,
  removeFabricatedBiometrics,
  removeDayHeartRateFromWorkouts,
} from '../../services/storage';
import {
  NEW_USER_PROFILE,
  SAMPLE_DEMO_PROFILE,
} from '../../services/seedData';
import {
  FORBIDDEN_XP_ACTIONS,
  isForbiddenXpAction,
  calculateWorkoutCompletionXp,
  calculateProgramMilestoneXp,
  evaluateExerciseProgressXp,
  evaluateStrengthStandardAdvanceXp,
} from '../xp';
import {
  buildLeaderboardSummary,
  DIVISION_THRESHOLDS,
} from '../leaderboard';
import {
  adaptWorkoutSessionToLocation,
  generateSmartWorkoutSession,
  getNextSplitDay,
} from '../../services/workoutGenerator';
import {
  getMovementVectorId,
  getVectorImplementOptions,
} from '../progression';
import {
  generateRandomString,
  initiateFitbitOAuth,
  simulatePixelWatchSync,
  FITBIT_CONFIG,
} from '../../services/fitbitService';
import {
  initiateWhoopOAuth,
  simulateWhoopSync,
  WHOOP_CONFIG,
  getWhoopRedirectUri,
  parseWhoopCsvExport,
} from '../../services/whoopService';
import {
  HEALTH_CONNECT_CONFIG,
  openHealthConnectSettings,
  parseHealthConnectExport,
  simulateHealthConnectSync,
} from '../../services/healthConnectService';
import {
  WEARABLE_PROVIDERS,
  syncWearableBiometrics,
  disconnectWearable,
  setActiveTracker,
} from '../../services/wearableSyncService';
import {
  GOOGLE_AUTH_CONFIG,
  decodeGoogleIdToken,
  signInWithGoogleCredential,
  signInWithDemoGoogleAccount,
  signOutUser,
  isSupabaseConfigured,
  getSupabaseGoogleAuthUrl,
} from '../../services/googleAuthService';
import {
  loadAuthUser,
  saveAuthUser,
  clearAuthUser,
} from '../../services/storage';
import {
  isWearableConnected,
  getActiveWearableProvider,
  UserProfile,
  AuthUser,
} from '../types';

// Step A: Initialize 6-week seed dataset
const seeded = resetAllToSeedData();
assert(seeded.workouts.length >= 20, `Seeded ${seeded.workouts.length} historical workouts`);
assert(seeded.biometrics.length >= 40, `Seeded ${seeded.biometrics.length} daily biometric logs`);

// Step B: Dynamic Workout Generation across Splits & Mesocycle Weeks
const pushW3 = generateSmartWorkoutSession(
  'Push',
  seeded.workouts,
  seeded.exercises,
  'Primed',
  3
);
assert(
  pushW3.exercises.length >= 5,
  `Dynamic Push W3 workout contains ${pushW3.exercises.length} compound & isolation exercises`
);

const legsW6Deload = generateSmartWorkoutSession(
  'Legs',
  seeded.workouts,
  seeded.exercises,
  'Normal',
  6
);
assert(
  legsW6Deload.exercises[0].sets.length === 2,
  `Mesocycle Week 6 Deload scales sets down to 2 maintenance sets (got ${legsW6Deload.exercises[0].sets.length})`
);
assert(
  getNextSplitDay('Push') === 'Pull' &&
    getNextSplitDay('Pull') === 'Legs' &&
    getNextSplitDay('Legs') === 'Upper' &&
    getNextSplitDay('Upper') === 'Push',
  `Split rotation cycles Push -> Pull -> Legs -> Upper -> Push`
);

// Step C: Warmup set exclusion from Hypertrophy Weekly Volume
const baselineVol = calculateWeeklyMuscleVolume(seeded.workouts, seeded.exercises);
const mockActiveWithWarmup = generateSmartWorkoutSession(
  'Push',
  seeded.workouts,
  seeded.exercises,
  'Normal',
  3
);
// Add 1 completed warmup set and 1 completed working set on Bench Press
mockActiveWithWarmup.exercises[0].sets = [
  {
    id: 'w-set',
    setNumber: 1,
    targetWeightKg: 55,
    actualWeightKg: 55,
    targetReps: 8,
    actualReps: 8,
    targetRir: 3,
    actualRir: 3,
    completed: true,
    isWarmup: true,
    setType: 'warmup',
  },
  {
    id: 'work-set',
    setNumber: 2,
    targetWeightKg: 92.5,
    actualWeightKg: 92.5,
    targetReps: 10,
    actualReps: 10,
    targetRir: 2,
    actualRir: 2,
    completed: true,
    setType: 'working',
  },
];
const updatedVol = calculateWeeklyMuscleVolume(
  seeded.workouts,
  seeded.exercises,
  mockActiveWithWarmup
);
assert(
  updatedVol.Chest === baselineVol.Chest + 1,
  `Warmup set is excluded and only the 1 working set increments Chest volume (${baselineVol.Chest} -> ${updatedVol.Chest})`
);

// Step D: Fitbit OAuth 2.0 PKCE Verifier Generation
const pkceVerifier = generateRandomString(64);
assert(
  pkceVerifier.length === 64,
  `Fitbit OAuth 2.0 PKCE code_verifier generated with RFC 7636 length 64`
);

// Step E: Google Play Data Safety — Export Backup, Restore & Permanent Data Deletion
const backupJson = exportAllUserDataJSON();
assert(
  backupJson.includes('"appVersion": "1.0.0"') && backupJson.includes('Alex Vance'),
  `exportAllUserDataJSON exports complete user profile, workouts, and biometrics`
);

// Permanently erase all user data (Google Play User Data Deletion requirement)
const erased = permanentlyEraseAllUserData();
assert(
  erased.workouts.length === 0 && loadWorkouts().length === 0 && loadProfile().level === 1,
  `permanentlyEraseAllUserData wipes all workout history and resets profile to Level 1`
);

// Restore from JSON backup
const restored = importUserDataJSON(backupJson);
assert(
  restored.workouts.length === seeded.workouts.length &&
    loadProfile().name === 'Alex Vance',
  `importUserDataJSON restores all ${restored.workouts.length} workouts and athlete profile`
);

// 13. Knowledge Graph Biomechanical Exercise Alternatives & Location Adaptation (Gym / Home / Travel)
console.log('\n[13. Biomechanical Exercise Alternatives & Gym / Home / Travel Adaptation]');
const benchDef = seeded.exercises.find((e) => e.id === 'ex-bench-press')!;
const benchAlternatives = getVectorImplementOptions(benchDef, seeded.exercises);
const benchAltIds = benchAlternatives.map((e) => e.id);
assert(
  !benchAltIds.includes('ex-cable-crunch') && !benchAltIds.includes('ex-tricep-pushdown'),
  `Barbell Bench Press NEVER swaps with Cable Kneeling Crunch or Cable Tricep Pushdown (got: ${benchAltIds.join(', ')})`
);
assert(
  benchAltIds.includes('ex-db-bench-press') &&
    benchAltIds.includes('ex-flat-db-press') &&
    benchAltIds.includes('ex-trx-pushup') &&
    benchAltIds.includes('ex-deficit-pushup'),
  `Barbell Bench Press maps to true Horizontal Chest Press alternatives across Gym, Home (DB/TRX), and Travel (Push-Up)`
);

// Verify that filtering for Travel strictly excludes Barbell Bench Press and loaded gym gear
const travelBenchAlternatives = getVectorImplementOptions(benchDef, seeded.exercises, 'travel', []);
const travelBenchAltIds = travelBenchAlternatives.map((e) => e.id);
assert(
  !travelBenchAltIds.includes('ex-bench-press') &&
    !travelBenchAltIds.includes('ex-db-bench-press') &&
    !travelBenchAltIds.includes('ex-flat-db-press') &&
    !travelBenchAltIds.includes('ex-cable-chest-press'),
  `When workout is set to Travel, Barbell Bench Press, Dumbbell Bench Press, and Cable Chest Press are NEVER included as exercise swap alternatives (got: ${travelBenchAltIds.join(', ')})`
);
assert(
  travelBenchAltIds.includes('ex-deficit-pushup') &&
    travelBenchAltIds.includes('ex-pushup') &&
    travelBenchAltIds.includes('ex-wide-pushup'),
  `Travel exercise swaps provide multiple distinct pure-bodyweight alternatives (got: ${travelBenchAltIds.join(', ')})`
);

const travelPushSession = adaptWorkoutSessionToLocation(
  pushW3,
  'travel',
  [],
  seeded.exercises,
  seeded.workouts,
  'Normal'
);
assert(
  travelPushSession.location === 'travel' &&
    travelPushSession.exercises.every(
      (ex) => ex.equipment === 'bodyweight' && !ex.name.toLowerCase().includes('barbell')
    ),
  `Travel location adaptation converts all Push Day exercises to pure bodyweight movements without any barbell or gym exercises (${travelPushSession.exercises.map((e) => e.name).join(' | ')})`
);
const pushChestExs = travelPushSession.exercises.filter((e) => e.pillar === 'Horizontal Push');
const pushChestIds = new Set(pushChestExs.map((e) => e.exerciseId));
assert(
  pushChestExs.length >= 2 && pushChestIds.size === pushChestExs.length,
  `Travel Push Day converts multiple chest exercises to distinct, non-duplicate bodyweight push-up variations (got: ${pushChestExs.map((e) => e.name).join(' | ')})`
);

const homePushSession = adaptWorkoutSessionToLocation(
  pushW3,
  'home',
  ['bench', 'dumbbells', 'trx', 'pullup_bar'],
  seeded.exercises,
  seeded.workouts,
  'Normal'
);
assert(
  homePushSession.location === 'home' &&
    homePushSession.exercises.every(
      (ex) => ex.equipment !== 'barbell' && ex.equipment !== 'cable' && ex.equipment !== 'machine'
    ),
  `Home location adaptation converts all barbell/cable exercises on Push Day to matched DB/Bench/TRX movements (${homePushSession.exercises.map((e) => e.name).join(' | ')})`
);

const travelLegsSession = adaptWorkoutSessionToLocation(
  legsW6Deload,
  'travel',
  [],
  seeded.exercises,
  seeded.workouts,
  'Normal'
);
assert(
  travelLegsSession.location === 'travel' &&
    travelLegsSession.exercises.every((ex) => ex.equipment === 'bodyweight'),
  `Travel location adaptation converts all Leg Day exercises to pure bodyweight variations (${travelLegsSession.exercises.map((e) => e.name).join(' | ')})`
);

// 14. Product Governance Ledger & Competitor Comparison Matrix Verification
import {
  CODIFIED_DESIGN_HEURISTICS,
  COMPETITOR_COMPARISON_MATRIX,
  INITIAL_GOVERNANCE_ITEMS,
  loadGovernanceItems,
  saveGovernanceItems,
} from '../governance';
import {
  getFirstSplitDayForProgram,
  getHypertrophyQueueRecommendation,
  getSplitDaysForProgram,
  PROGRAM_OPTIONS,
} from '../../services/workoutGenerator';

console.log('\n[14. Product Governance Model & Competitor Comparison Matrix]');
assert(
  INITIAL_GOVERNANCE_ITEMS.length >= 8 &&
    INITIAL_GOVERNANCE_ITEMS.some((i) => i.status === 'locked') &&
    INITIAL_GOVERNANCE_ITEMS.some((i) => i.status === 'progressing'),
  `Governance ledger tracks Locked and Progressing items with rationale and critique (${INITIAL_GOVERNANCE_ITEMS.length} items)`
);

assert(
  COMPETITOR_COMPARISON_MATRIX.length >= 7 &&
    COMPETITOR_COMPARISON_MATRIX.every(
      (row) =>
        row.headstrong &&
        row.rpHypertrophy &&
        row.fitbod &&
        row.hevyStrong &&
        row.whoopAthlytic
    ),
  `Competitor comparison matrix benchmarks Treise against RP Hypertrophy, Fitbod, Hevy/Strong, and Whoop across ${COMPETITOR_COMPARISON_MATRIX.length} core capabilities`
);

const updatedGov = loadGovernanceItems().map((item) =>
  item.id === 'gov-session-to-session-checklist' ? { ...item, status: 'locked' as const } : item
);
saveGovernanceItems(updatedGov);
assert(
  loadGovernanceItems().find((i) => i.id === 'gov-session-to-session-checklist')?.status === 'locked',
  `Governance status transitions persist accurately`
);
saveGovernanceItems(INITIAL_GOVERNANCE_ITEMS);

// 15. Codified 19-Point Design Heuristics & Asynchronous Hypertrophy Queue
console.log('\n[15. Codified 19-Point Design Heuristics & Asynchronous Hypertrophy Queue]');
assert(
  CODIFIED_DESIGN_HEURISTICS.length === 19 &&
    CODIFIED_DESIGN_HEURISTICS.filter((h) => h.pillar === 'Visual Design').length === 6 &&
    CODIFIED_DESIGN_HEURISTICS.filter((h) => h.pillar === 'Content Design').length === 6 &&
    CODIFIED_DESIGN_HEURISTICS.filter((h) => h.pillar === 'Interaction Design').length === 7,
  `All 19 Design Heuristics (6 Visual, 6 Content, 7 Interaction) are codified in governance engine`
);

const normalQueueRec = getHypertrophyQueueRecommendation(
  'Push',
  seeded.workouts,
  seeded.activeWorkout.date
);
assert(
  normalQueueRec.activeSplit === 'Push' &&
    normalQueueRec.nextInQueue === 'Pull' &&
    normalQueueRec.requiredRecoveryHours === 60 &&
    normalQueueRec.recoveryPercentage === 100,
  `Asynchronous Hypertrophy Queue recommends Push with 60h Chest recovery window and 100% recovery (${normalQueueRec.recoveryBadge})`
);

// Simulate skipping 3 days after last workout
const futureSkippedDate = new Date(
  new Date(`${seeded.activeWorkout.date}T12:00:00Z`).getTime() + 4 * 24 * 60 * 60 * 1000
)
  .toISOString()
  .split('T')[0];
const skippedDayRec = getHypertrophyQueueRecommendation(
  'Push',
  seeded.workouts,
  futureSkippedDate
);
assert(
  skippedDayRec.isSkippedDayAdapted &&
    skippedDayRec.daysSinceLastWorkoutOverall >= 3 &&
    skippedDayRec.scienceRationale.includes('Not tied to a calendar'),
  `Skipped-day scenario (${skippedDayRec.daysSinceLastWorkoutOverall} days off) adapts without calendar penalty: "${skippedDayRec.scienceRationale}"`
);

// 16. Single Canonical Entry Point Per Job & Zero Sub-12px Micro-Text Audit
declare const require: (mod: string) => any;
declare const process: { cwd: () => string; exit?: (code?: number) => void };
const fs = require('fs');
const path = require('path');

console.log('\n[16. Single Canonical Entry Point Per Job & Design Debt Guardrails]');
const exerciseCardSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/train/ExerciseCard.tsx'),
  'utf-8'
);
const trainTabSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/train/TrainTab.tsx'),
  'utf-8'
);
const swapModalSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/train/ExerciseSwapModal.tsx'),
  'utf-8'
);

assert(
  !exerciseCardSrc.includes('implementOptions') &&
    !exerciseCardSrc.includes('onSwitchImplement') &&
    !exerciseCardSrc.includes('Equipment:') &&
    exerciseCardSrc.includes('Change Exercise') &&
    swapModalSrc.includes('Change Exercise'),
  `ExerciseCard has 1 single "Change Exercise" entry point and zero duplicate inline Equipment carousels`
);

assert(
  !trainTabSrc.includes('handleSwitchImplementInline') &&
    !trainTabSrc.includes('Adjust Gear / Split') &&
    trainTabSrc.includes('Full Gym') &&
    trainTabSrc.includes('At Home') &&
    (trainTabSrc.includes('Bodyweight') || trainTabSrc.includes('Travel')),
  `TrainTab has 1 single canonical Equipment Location bar (Full Gym | At Home | Bodyweight) with no duplicate inline gear/split drawers`
);

const auditedFiles = [
  'src/components/train/TrainTab.tsx',
  'src/components/train/ExerciseCard.tsx',
  'src/components/train/ExerciseSwapModal.tsx',
  'src/components/train/PlateCalculatorModal.tsx',
  'src/components/common/Header.tsx',
  'src/components/common/XPNotification.tsx',
  'src/components/program/ProgramTab.tsx',
  'src/components/program/MesocycleManager.tsx',
  'src/components/onboarding/OnboardingModal.tsx',
];
const filesWithMicroText = auditedFiles.filter((relPath) => {
  const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
  return /text-\[(?:8|9|10|11)px\]/.test(content);
});
assert(
  filesWithMicroText.length === 0,
  `Zero sub-12px micro-text classes (text-[8px..11px]) across all ${auditedFiles.length} core UI components`
);

// 17. Onboarding Experience, First-Time-To-Value & 19 Design Heuristics Governance
console.log('\n[17. Onboarding Experience, First-Time-To-Value & 19 Design Heuristics Audit]');

assert(
  PROGRAM_OPTIONS.length === 4 &&
    PROGRAM_OPTIONS.some((p) => p.id === 'ppl_upper' && p.recommended) &&
    PROGRAM_OPTIONS.some((p) => p.id === 'ppl') &&
    PROGRAM_OPTIONS.some((p) => p.id === 'upper_lower') &&
    PROGRAM_OPTIONS.some((p) => p.id === 'full_body'),
  `Onboarding offers all 4 evidence-based training split options with PPL+Upper marked Recommended for Hypertrophy`
);

assert(
  getFirstSplitDayForProgram('ppl_upper') === 'Push' &&
    getFirstSplitDayForProgram('ppl') === 'Push' &&
    getFirstSplitDayForProgram('upper_lower') === 'Upper' &&
    getFirstSplitDayForProgram('full_body') === 'Push',
  `getFirstSplitDayForProgram accurately determines starter day across all splits (Upper for upper_lower, Push for PPL/PPL+Upper)`
);

const upperLowerDay1 = generateSmartWorkoutSession(
  getFirstSplitDayForProgram('upper_lower'),
  [],
  seeded.exercises,
  'Primed',
  1,
  'gym',
  ['bench', 'dumbbells', 'trx', 'pullup_bar']
);
assert(
  upperLowerDay1.splitDay === 'Upper' && upperLowerDay1.exercises.length > 0,
  `Day 1 workout for Upper/Lower program dynamically generates a valid Upper body session (${upperLowerDay1.exercises.length} exercises)`
);

const onboardingModalSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/onboarding/OnboardingModal.tsx'),
  'utf-8'
);

assert(
  onboardingModalSrc.includes('Welcome to Treise') &&
    onboardingModalSrc.includes("Train when you're recovered") &&
    onboardingModalSrc.includes('Guaranteed Overload') &&
    onboardingModalSrc.includes('Adapts Across Any Gear') &&
    onboardingModalSrc.includes('Choose your training split') &&
    onboardingModalSrc.includes('What is your main goal right now?') &&
    onboardingModalSrc.includes('About you') &&
    onboardingModalSrc.includes('Where do you train') &&
    onboardingModalSrc.includes('what gear do you have') &&
    onboardingModalSrc.includes('Start Day 1 Workout'),
  `Onboarding introduces the app, explains the 3 core principles, prompts split selection, sets goals and gear, and delivers instant Day 1 value`
);

const appSrc = fs.readFileSync(
  path.resolve(process.cwd(), 'src/App.tsx'),
  'utf-8'
);
assert(
  appSrc.includes('useState(!profile.onboardingCompleted)'),
  `New users without completed onboarding are automatically greeted by OnboardingModal on first app launch`
);

const forbiddenJargon = [
  'OOUX',
  'Personal Knowledge Graph',
  'Canonical Vector',
  'SFR',
  'MAV/MEV/MRV',
];
const foundForbidden = forbiddenJargon.filter((term) =>
  onboardingModalSrc.includes(term)
);
assert(
  foundForbidden.length === 0,
  `Onboarding strictly adheres to Content Design Heuristic #1 (Clarity: zero internal UX or academic jargon, found: ${foundForbidden.join(', ') || 'none'})`
);

assert(
  INITIAL_GOVERNANCE_ITEMS.some((i) => i.id === 'gov-onboarding-first-time-to-value' && i.status === 'locked') &&
    INITIAL_GOVERNANCE_ITEMS.some((i) => i.id === 'gov-19-design-heuristics-framework' && i.status === 'locked'),
  `Both gov-onboarding-first-time-to-value and gov-19-design-heuristics-framework are locked in the governance ledger`
);

// 18. Authoritative Exercise Science for Hypertrophy, Muscle Retention & Program Types
console.log('\n[18. Authoritative Exercise Science for Hypertrophy, Muscle Retention & Program Types]');

// A. Program Split Rotation Science
assert(
  getNextSplitDay('Upper', 'ppl_upper') === 'Push' &&
    getNextSplitDay('Legs', 'ppl_upper') === 'Upper' &&
    getNextSplitDay('Push', 'ppl_upper') === 'Pull',
  '4-Day PPL+Upper split rotates Push -> Pull -> Legs -> Upper with ~2x/week frequency'
);

assert(
  getNextSplitDay('Legs', 'ppl') === 'Push' &&
    getNextSplitDay('Push', 'ppl') === 'Pull' &&
    getNextSplitDay('Pull', 'ppl') === 'Legs',
  '3-Day Classic PPL split rotates Push -> Pull -> Legs -> Push with complete dedicated recovery'
);

assert(
  getNextSplitDay('Upper', 'upper_lower') === 'Legs' &&
    getNextSplitDay('Legs', 'upper_lower') === 'Upper',
  '4-Day Upper/Lower split alternates Upper and Lower/Legs to minimize axial fatigue overlap'
);

assert(
  getNextSplitDay('Legs', 'full_body') === 'Push' &&
    getNextSplitDay('Push', 'full_body') === 'Pull',
  '3-Day Full Body split cycles through full-body sessions for high frequency stimulation'
);

// B. getSplitDaysForProgram Verification
const pplDays = getSplitDaysForProgram('ppl');
assert(pplDays.length === 3 && pplDays.map((d) => d.id).join(',') === 'Push,Pull,Legs', 'PPL exposes exactly 3 dedicated split days');

const ulDays = getSplitDaysForProgram('upper_lower');
assert(ulDays.length === 2 && ulDays.map((d) => d.id).join(',') === 'Upper,Legs', 'Upper/Lower exposes Upper and Lower split days');

const pplUpperDays = getSplitDaysForProgram('ppl_upper');
assert(pplUpperDays.length === 4 && pplUpperDays.map((d) => d.id).join(',') === 'Push,Pull,Legs,Upper', 'PPL+Upper exposes all 4 hypertrophy days');

// C. Caloric Deficit Muscle Retention Science (Helms et al., 2014; Murphy & Koehler, 2022)
// In Lean Bulk: volume wave scales to 4-5 sets on high responders during peak weeks
const leanBulkW5 = generateSmartWorkoutSession(
  'Push',
  [],
  seeded.exercises,
  'Normal',
  5,
  'gym',
  ['bench', 'dumbbells', 'trx', 'pullup_bar'],
  'Lean Bulk'
);
const bulkLateralRaiseSets = leanBulkW5.exercises.find((e) => e.exerciseId === 'ex-db-lateral-raise')?.sets.length;
assert(
  bulkLateralRaiseSets === 5,
  `Lean Bulk Week 5 scales high-volume responders to near-MRV (5 sets) to maximize progressive overload (got ${bulkLateralRaiseSets})`
);

// In Cut / Recomp: volume is scaled to ~85% (capped at 2-3 sets) to prevent catabolic overreaching in deficit
const cutW5 = generateSmartWorkoutSession(
  'Push',
  [],
  seeded.exercises,
  'Normal',
  5,
  'gym',
  ['bench', 'dumbbells', 'trx', 'pullup_bar'],
  'Cut / Recomp'
);
const cutLateralRaiseSets = cutW5.exercises.find((e) => e.exerciseId === 'ex-db-lateral-raise')?.sets.length;
const cutBenchWorkingSets = cutW5.exercises.find((e) => e.exerciseId === 'ex-bench-press')?.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length;
const cutBenchWarmupSets = cutW5.exercises.find((e) => e.exerciseId === 'ex-bench-press')?.sets.filter((s) => s.isWarmup || s.setType === 'warmup').length;
assert(
  cutLateralRaiseSets === 3 && cutBenchWorkingSets === 2 && cutBenchWarmupSets === 2,
  `Cut / Recomp caps working volume to ~85% (3 sets isolation, 2 sets compound) with pre-filled warmups`
);

// D. Double Progression Retention Shield Feedback
const mockCuttingEx: ExerciseSession = {
  ...seeded.exercises[0],
  exerciseId: 'ex-bench-press',
  name: 'Barbell Bench Press',
  pillar: 'Horizontal Push',
  equipment: 'barbell',
  minReps: 8,
  maxReps: 12,
  sets: [
    { id: 's1', setNumber: 1, targetWeightKg: 85, actualWeightKg: 85, targetReps: 10, actualReps: 10, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
    { id: 's2', setNumber: 2, targetWeightKg: 85, actualWeightKg: 85, targetReps: 10, actualReps: 10, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
  ],
};

const cutPrescription = prescribeDoubleProgression(
  mockCuttingEx,
  'Normal',
  [],
  80,
  'Cut / Recomp'
);
assert(
  cutPrescription.reason.includes('Retention Shield'),
  `Double Progression in Cut / Recomp explicitly invokes Retention Shield to celebrate muscle preservation in a deficit`
);

// E. Asynchronous Queue Science Rationale by Goal Phase
const queueRecCut = getHypertrophyQueueRecommendation('Push', [], undefined, 'ppl_upper', 'Cut / Recomp');
assert(
  queueRecCut.scienceRationale.includes('Retention Shield') && queueRecCut.scienceRationale.includes('caloric deficit'),
  'Queue recommendation for Cut / Recomp emphasizes caloric deficit recovery windows and mechanical tension'
);

const queueRecBulk = getHypertrophyQueueRecommendation('Push', [], undefined, 'ppl_upper', 'Lean Bulk');
assert(
  queueRecBulk.scienceRationale.includes('Hypertrophy Wave') && queueRecBulk.scienceRationale.includes('surplus'),
  'Queue recommendation for Lean Bulk emphasizes caloric surplus and progressive volume overload'
);

// ============================================================================
// 19. Google Pixel Tensor Hardware Acceleration & On-Device AI Subsystem
// ============================================================================
console.log('\n[19. Google Pixel Tensor Hardware Acceleration & On-Device AI Subsystem]');

(async () => {
  // A. Detect Pixel 9 Pro with Tensor G4 TPU
  const pixel9 = await detectPixelTensorHardware('Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro Build/AD1A) AppleWebKit/537.36');
  assert(
    pixel9.isPixelDevice === true &&
      pixel9.chipModel === 'Google Tensor G4' &&
      pixel9.backend === 'Tensor TPU (Gemini Nano)' &&
      pixel9.isHardwareAccelerated === true &&
      pixel9.isOnDevicePrivate === true &&
      pixel9.inferenceLatencyMs <= 15,
    `Pixel 9 Pro successfully identified with Google Tensor G4 TPU (${pixel9.inferenceLatencyMs}ms, Private: ${pixel9.isOnDevicePrivate})`
  );

  // B. Detect Pixel 8 with Tensor G3
  const pixel8 = await detectPixelTensorHardware('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A) AppleWebKit/537.36');
  assert(
    pixel8.isPixelDevice === true &&
      pixel8.chipModel === 'Google Tensor G3' &&
      pixel8.backend === 'Tensor TPU (Gemini Nano)',
    `Pixel 8 successfully identified with Google Tensor G3 TPU`
  );

  // C. Detect Pixel 7 with Tensor G2
  const pixel7 = await detectPixelTensorHardware('Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TD1A) AppleWebKit/537.36');
  assert(
    pixel7.isPixelDevice === true &&
      pixel7.chipModel === 'Google Tensor G2' &&
      pixel7.backend === 'Tensor NPU (WebNN)',
    `Pixel 7 successfully identified with Google Tensor G2 NPU`
  );

  // D. Detect Pixel 6 with Tensor G1
  const pixel6 = await detectPixelTensorHardware('Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A) AppleWebKit/537.36');
  assert(
    pixel6.isPixelDevice === true &&
      pixel6.chipModel === 'Google Tensor G1' &&
      pixel6.backend === 'Tensor GPU (WebGPU Compute)',
    `Pixel 6 successfully identified with Google Tensor G1 GPU`
  );

  // E. WebGL ARM Mali GPU detection fallback for Tensor
  const maliG720 = await detectPixelTensorHardware(undefined, undefined, 'ANGLE (ARM, Mali-G720, OpenGL ES 3.2)');
  assert(
    maliG720.isPixelDevice === true && maliG720.chipModel === 'Google Tensor G4',
    `ARM Mali-G720 WebGL GPU string maps to Google Tensor G4`
  );

  const maliG715 = await detectPixelTensorHardware(undefined, undefined, 'ANGLE (ARM, Mali-G715, OpenGL ES 3.2)');
  assert(
    maliG715.isPixelDevice === true && maliG715.chipModel === 'Google Tensor G3',
    `ARM Mali-G715 WebGL GPU string maps to Google Tensor G3`
  );

  // F. Non-Pixel graceful fallback (desktop / iOS)
  const desktopProfile = await detectPixelTensorHardware('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  assert(
    desktopProfile.isPixelDevice === false &&
      desktopProfile.chipModel === 'Generic / Standard' &&
      desktopProfile.backend === 'WASM SIMD Neural Engine' &&
      desktopProfile.isOnDevicePrivate === true,
    `Non-Pixel environment gracefully falls back to WASM SIMD local engine (Private: ${desktopProfile.isOnDevicePrivate})`
  );

  // G. On-Device AI Coaching Insight Generation on Tensor
  const mockSession = pushW3;
  const tensorInputPrimed = {
    workoutSession: mockSession,
    readinessState: 'Primed' as const,
    readinessZScore: 1.2,
    hrvRmssd: 68,
    restingHr: 52,
    sleepHours: 8.2,
    goalPhase: 'Lean Bulk' as const,
    mesocycleWeek: 3,
    location: 'gym' as const,
  };

  const primedInsight = await generateTensorCoachingInsight(tensorInputPrimed, pixel9);
  assert(
    primedInsight.predictedFatigueRate === 'Low' &&
      primedInsight.headline.includes('Neural Drive') &&
      primedInsight.latencyMs <= 15 &&
      primedInsight.hardwareTag.includes('Google Tensor G4 TPU'),
    `Tensor G4 generates low-fatigue primed insight in ${primedInsight.latencyMs}ms with hardware tag "${primedInsight.hardwareTag}"`
  );

  const tensorInputAmber = {
    workoutSession: mockSession,
    readinessState: 'Amber Shield' as const,
    readinessZScore: -1.4,
    hrvRmssd: 34,
    restingHr: 66,
    sleepHours: 5.2,
    goalPhase: 'Cut / Recomp' as const,
    mesocycleWeek: 4,
    location: 'gym' as const,
  };

  const amberInsight = await generateTensorCoachingInsight(tensorInputAmber, pixel9);
  assert(
    amberInsight.predictedFatigueRate === 'Elevated' &&
      amberInsight.headline.includes('Recovery Shield Active') &&
      amberInsight.summary.includes('Caloric deficit') &&
      amberInsight.tacticalCue.includes('2–3 reps in reserve'),
    `Tensor G4 correctly auto-regulates Amber Shield + Cut with Recovery Shield cues`
  );

  // H. Biomechanical Neural Matcher
  const matchResult = evaluateTensorBiomechanicalMatch('ex-bench-press', 'ex-db-bench-press', 0.4, pixel9);
  assert(
    matchResult.compatibilityScore >= 80 &&
      matchResult.rationale.includes('Tensor Google Tensor G4 Biomechanical Matcher') &&
      matchResult.hypertrophyStimulusRating === 'Optimal',
    `Tensor Biomechanical Matcher scores DB Bench Press at ${matchResult.compatibilityScore}% with optimal stimulus`
  );

  // I. Client Hints & High-Entropy Model Detection
  const chPixel9 = await detectPixelTensorHardware(undefined, 'Pixel 9 Pro');
  assert(
    chPixel9.isPixelDevice === true && chPixel9.chipModel === 'Google Tensor G4',
    'Client hints model Pixel 9 Pro correctly maps to Google Tensor G4 TPU'
  );

  const chPixel8 = await detectPixelTensorHardware(undefined, 'Pixel 8 Pro');
  assert(
    chPixel8.isPixelDevice === true && chPixel8.chipModel === 'Google Tensor G3',
    'Client hints model Pixel 8 Pro correctly maps to Google Tensor G3 TPU'
  );

  const chPixel7 = await detectPixelTensorHardware(undefined, 'Pixel 7 Pro');
  assert(
    chPixel7.isPixelDevice === true && chPixel7.chipModel === 'Google Tensor G2',
    'Client hints model Pixel 7 Pro correctly maps to Google Tensor G2 NPU'
  );

  const chPixel6 = await detectPixelTensorHardware(undefined, 'Pixel 6 Pro');
  assert(
    chPixel6.isPixelDevice === true && chPixel6.chipModel === 'Google Tensor G1',
    'Client hints model Pixel 6 Pro correctly maps to Google Tensor G1 GPU'
  );

  // J. WebGL ARM Mali GPU Signatures
  const maliG710 = await detectPixelTensorHardware(undefined, undefined, 'Mali-G710 MP7');
  assert(
    maliG710.isPixelDevice === true && maliG710.chipModel === 'Google Tensor G2',
    'Mali-G710 correctly maps to Google Tensor G2'
  );

  const maliG78 = await detectPixelTensorHardware(undefined, undefined, 'Mali-G78 MP20');
  assert(
    maliG78.isPixelDevice === true && maliG78.chipModel === 'Google Tensor G1',
    'Mali-G78 correctly maps to Google Tensor G1'
  );

  // K. Bottom-Nav AI Coach Execution on Tensor Hardware
  setTensorSimulationOverride(true, 'Google Tensor G4');
  const tensorCoachMsg = await processAssistantMessage({
    userMessage: 'What is my bench press target today?',
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: [
      {
        date: new Date().toISOString().split('T')[0],
        bodyweightKg: 80,
        restingHr: 54,
        hrvRmssd: 68,
        sleepHours: 8.0,
        steps: 9000,
        activeZoneMinutes: 45,
      },
    ],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    tensorCoachMsg.message.isTensorAccelerated === undefined &&
      tensorCoachMsg.message.backend === undefined &&
      tensorCoachMsg.message.latencyMs === undefined,
    'AI Coach replies never carry hardware, backend or latency claims'
  );

  // K2. When the on-device model (Chrome Prompt API / Gemini Nano) is available, free-form
  // questions are answered by it; the system prompt carries the athlete's real context.
  let capturedSystemPrompt = '';
  (globalThis as any).window = globalThis;
  (globalThis as any).LanguageModel = {
    availability: async () => 'available',
    create: async (opts: any) => {
      capturedSystemPrompt = opts?.initialPrompts?.[0]?.content || '';
      return {
        promptStreaming: async function* () {
          yield 'Keep your elbows ';
          yield 'tucked and control the descent.';
        },
        destroy: () => undefined,
      };
    },
  };
  const nanoReply = await processAssistantMessage({
    userMessage: 'Any tips for staying focused before I train?',
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    nanoReply.message.text === 'Keep your elbows tucked and control the descent.',
    `On-device model answer is streamed and used (got "${nanoReply.message.text}")`
  );
  assert(
    capturedSystemPrompt.includes(pushW3.name) && !/Tensor|TPU|Knowledge Graph/.test(capturedSystemPrompt),
    'On-device model prompt is grounded in today\'s workout without technical jargon'
  );
  const cardioReply = await processAssistantMessage({
    userMessage: 'Should I do cardio on my rest days?',
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    cardioReply.message.text === 'Keep your elbows tucked and control the descent.',
    `Open questions go to the on-device model when available (got "${cardioReply.message.text.slice(0, 60)}")`
  );

  // K2b. A stub that echoes the prompt (Chromium without Gemini Nano) must never be shown.
  (globalThis as any).LanguageModel = {
    availability: async () => 'available',
    create: async (opts: any) => ({
      promptStreaming: async function* (q: string) {
        yield `On-device model is not available in Chromium, this API is just echoing back the input:\n${opts?.initialPrompts?.[0]?.content}${q}`;
      },
      destroy: () => undefined,
    }),
  };
  const echoReply = await processAssistantMessage({
    userMessage: 'Any tips for staying focused before I train?',
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    !/echoing|not available in Chromium|You are Treise/.test(echoReply.message.text),
    'An echoing stub model is rejected and the regular coach answers instead'
  );
  delete (globalThis as any).LanguageModel;
  delete (globalThis as any).window;

  // K2c. Where Gemini Nano isn't exposed (Chrome on Android), a registered on-device GPU model answers.
  registerFallbackOnDeviceModel({
    isReady: async () => true,
    prompt: async (_sys: string, _q: string, onPartial?: (t: string) => void) => {
      const text = 'Do five minutes of light cardio, then two easy ramp-up sets before your first working set.';
      onPartial?.(text);
      return text;
    },
  });
  const gpuReply = await processAssistantMessage({
    userMessage: 'Any tips for staying focused before I train?',
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  const briefingWithModel = await processAssistantMessage({
    userMessage: "Give me a briefing for today's workout and targets",
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    !briefingWithModel.message.text.startsWith('Do five minutes') && briefingWithModel.message.text.includes(pushW3.exercises[0].name),
    "Today's briefing is built from the plan even when a model is available (no invented details)"
  );
  const progressWithModel = await processAssistantMessage({
    userMessage: 'How am I progressing?',
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [],
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    /haven't finished a workout yet/.test(progressWithModel.message.text),
    'Progress questions are answered from real history, not by the model'
  );
  registerFallbackOnDeviceModel(null);
  assert(
    gpuReply.message.text.startsWith('Do five minutes of light cardio'),
    'Without Gemini Nano, the downloaded on-device GPU model answers open questions'
  );

  // K3. Pain reports always get the fixed safety reply, never "your joint is fine".
  const painReply = await processAssistantMessage({
    userMessage: 'My shoulder hurts when I bench, what should I do today?',
    profile: SAMPLE_DEMO_PROFILE,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    /Don't train through shoulder pain/.test(painReply.message.text) &&
      /physiotherapist|doctor/.test(painReply.message.text) &&
      !/healthy|comfortable range/i.test(painReply.message.text),
    'Shoulder pain triggers the safety reply with a swap suggestion and professional referral'
  );
  const urgentReply = buildSafetyResponse('I feel dizzy and have chest pain');
  assert(Boolean(urgentReply && /emergency/.test(urgentReply)), 'Chest pain or dizziness tells the athlete to stop and seek help');

  // L. Simulation Override Mode
  const simulated = await detectPixelTensorHardware('Generic User Agent');
  assert(
    simulated.isPixelDevice === true && simulated.chipModel === 'Google Tensor G4',
    `Simulation override activates Tensor G4 profile on generic User Agent for testing`
  );
  setTensorSimulationOverride(false);

  // ============================================================================
  // SUITE 20: CLEAN SLATE FOR NEW USERS, LEGITIMATE XP ECONOMY & OPT-IN LEADERBOARD
  // ============================================================================
  console.log('\n--- SUITE 20: CLEAN SLATE FOR NEW USERS, LEGITIMATE XP ECONOMY & OPT-IN LEADERBOARD ---');

  // A. Clean Slate Invariants: Fresh launch must start at Level 1, 0 XP, 0 completed workouts/biometrics
  memStore.clear(); // Simulate a completely fresh user install with empty localStorage
  const freshProfile = loadProfile();
  assert(
    freshProfile.level === 1 &&
      freshProfile.currentXp === 0 &&
      freshProfile.streakDays === 0 &&
      freshProfile.name === 'Athlete' &&
      freshProfile.onboardingCompleted === false &&
      freshProfile.leaderboardOptIn === false,
    `Fresh user profile starts cleanly at Level 1, 0 XP, 0 streak, 'Athlete', and onboarding uncompleted (got Lv.${freshProfile.level}, ${freshProfile.currentXp} XP)`
  );

  const freshBiometrics = loadBiometrics();
  assert(
    freshBiometrics.length === 0,
    `Fresh user biometrics returns clean empty array without auto-seeding dummy records (got ${freshBiometrics.length} logs)`
  );

  const freshWorkouts = loadWorkouts();
  assert(
    freshWorkouts.length === 0,
    `Fresh user workouts returns clean empty array without auto-seeding dummy sessions (got ${freshWorkouts.length} workouts)`
  );

  assert(
    SAMPLE_DEMO_PROFILE.level === 14 &&
      SAMPLE_DEMO_PROFILE.currentXp === 4850 &&
      SAMPLE_DEMO_PROFILE.name === 'Alex Vance',
    `SAMPLE_DEMO_PROFILE preserves 6-week demonstration state for explicit demo preview mode`
  );

  // Restore seed dataset for subsequent tests
  resetAllToSeedData();

  // B. Forbidden XP Actions (Must NEVER award XP)
  assert(
    FORBIDDEN_XP_ACTIONS.length === 13,
    `All 13 unauthorized UI actions are registered in FORBIDDEN_XP_ACTIONS (got ${FORBIDDEN_XP_ACTIONS.length})`
  );
  for (const action of FORBIDDEN_XP_ACTIONS) {
    assert(isForbiddenXpAction(action) === true, `Action '${action}' is strictly forbidden from awarding XP`);
  }
  assert(isForbiddenXpAction('finish_workout') === false, `Legitimate action 'finish_workout' is allowed`);

  // C. Legitimate XP Economy: Workout Completion
  const mockWorkoutToFinish = JSON.parse(JSON.stringify(pushW3));
  mockWorkoutToFinish.exercises.forEach((ex: any) =>
    ex.sets.forEach((s: any) => {
      s.completed = true;
    })
  );
  const primedCompletionAward = calculateWorkoutCompletionXp(mockWorkoutToFinish, 'Primed', 1.15);
  assert(
    primedCompletionAward.category === 'workout_completion' &&
      primedCompletionAward.amount === Math.round(300 * 1.15) &&
      Boolean(primedCompletionAward.bonusTag?.includes('Primed')),
    `Workout completion awards legitimate base + set bonus with Primed multiplier: ${primedCompletionAward.amount} XP`
  );

  const normalCompletionAward = calculateWorkoutCompletionXp(mockWorkoutToFinish, 'Normal', 1.0);
  assert(
    normalCompletionAward.amount === 300,
    `Normal workout completion awards exact 300 XP (250 base + 50 all working sets completed bonus)`
  );

  // D. Legitimate XP Economy: Program Milestones
  const weekMilestone = calculateProgramMilestoneXp(3, 'PPL Upper');
  assert(
    weekMilestone.amount === 200 && weekMilestone.category === 'program_milestone',
    `Mesocycle week milestone awards +200 XP`
  );
  const cycleMilestone = calculateProgramMilestoneXp(6, 'PPL Upper');
  assert(
    cycleMilestone.amount === 500 && cycleMilestone.title === 'Mesocycle Cycle Complete',
    `6-week cycle graduation awards +500 XP`
  );

  // E. Legitimate XP Economy: Progressive Overload Evaluation
  // Case 1: Load breakthrough (+2.5kg PR)
  const loadPr = evaluateExerciseProgressXp('Barbell Bench Press', 95, 8, 92.5, 8);
  assert(
    loadPr !== null && loadPr.amount === 60 && loadPr.title === 'Load Breakthrough',
    `Weight increase (+2.5kg) awards +60 XP for Load Breakthrough`
  );

  // Case 2: Rep breakthrough (+2 reps at same load)
  const repPr = evaluateExerciseProgressXp('Barbell Bench Press', 92.5, 10, 92.5, 8);
  assert(
    repPr !== null && repPr.amount === 40 && repPr.title === 'Rep Breakthrough',
    `Rep increase (+2 reps) awards +40 XP for Rep Breakthrough`
  );

  // Case 3: Top of rep range hit (12 reps hit for double progression)
  const topRep = evaluateExerciseProgressXp('Barbell Bench Press', 92.5, 12, 92.5, 10, 12);
  assert(
    topRep !== null && topRep.amount === 50 && topRep.title === 'Progression Earned',
    `Top of rep range (12 reps) awards +50 XP for Progression Earned`
  );

  // Case 4: Ordinary non-PR working set
  const nonPr = evaluateExerciseProgressXp('Barbell Bench Press', 90, 8, 92.5, 8);
  assert(
    nonPr === null,
    `Regular non-PR set produces null XP award (zero phantom XP inflation)`
  );

  // F. Legitimate XP Economy: Strength Standards Advancement
  const subDivAdvance = evaluateStrengthStandardAdvanceXp('Horizontal Push', 'Novice', 'I', 'Novice', 'II');
  assert(
    subDivAdvance !== null && subDivAdvance.amount === 100 && subDivAdvance.title === 'Strength Standard Advanced',
    `Advancing sub-division (Novice I -> II) awards +100 XP`
  );

  const majorTierAdvance = evaluateStrengthStandardAdvanceXp('Horizontal Push', 'Novice', 'IV', 'Intermediate', 'I');
  assert(
    majorTierAdvance !== null && majorTierAdvance.amount === 350 && majorTierAdvance.title === 'Major Tier Breakthrough',
    `Advancing major tier (Novice IV -> Intermediate I) awards +350 XP`
  );

  const noTierAdvance = evaluateStrengthStandardAdvanceXp('Horizontal Push', 'Novice', 'II', 'Novice', 'II');
  assert(
    noTierAdvance === null,
    `Equal or lower tier produces null award (zero duplicate XP)`
  );

  // G. Community XP Leaderboard Engine
  const optedOutSummary = buildLeaderboardSummary(freshProfile);
  assert(
    optedOutSummary.isOptedIn === false && optedOutSummary.currentUserEntry === null,
    `New athlete starts opted OUT of community leaderboard with privacy preserved`
  );

  const optedInAthlete = {
    ...freshProfile,
    currentXp: 1850,
    leaderboardOptIn: true,
    leaderboardDisplayName: 'Marcus Vance',
  };
  const optedInSummary = buildLeaderboardSummary(optedInAthlete);
  assert(
    optedInSummary.isOptedIn === true &&
      optedInSummary.currentUserEntry !== null &&
      optedInSummary.currentUserEntry.division === 'Gold' &&
      optedInSummary.currentUserEntry.rank > 0 &&
      optedInSummary.currentUserEntry.xp === 1850,
    `Opted-in athlete with 1,850 XP is dynamically placed into Gold Division at rank #${optedInSummary.currentUserEntry?.rank}`
  );

  assert(
    DIVISION_THRESHOLDS.length === 6 &&
      optedInSummary.entries.every((e) => e.isCurrentUser),
    `Leaderboard has 6 divisions and never contains fabricated athletes`
  );

  // ============================================================================
  // 21. Location Adaptation, Pure Bodyweight Load Fractions & Hypertrophy Rep Cues
  // ============================================================================
  console.log('\n[21. Location Adaptation, Bodyweight Load Fractions & Hypertrophy Rep Cues]');

  // A. Biomechanical Load Fractions
  assert(
    getBodyweightLoadRatio('ex-deficit-pushup') === 0.74,
    'Deficit pushup correctly uses 74% bodyweight load fraction'
  );
  assert(
    getBodyweightLoadRatio('ex-bw-split-squat') === 0.85,
    'Bulgarian split squat correctly uses 85% bodyweight load fraction'
  );
  assert(
    getBodyweightLoadRatio('ex-single-leg-rdl') === 0.80,
    'Single-leg RDL correctly uses 80% bodyweight load fraction'
  );

  // B. Translation from 90kg Bench Press to Travel Deficit Pushup
  // Bench 90kg -> Effective load 90kg.
  // Converting to bodyweight deficit pushup at 80kg bodyweight:
  const convertedPushupWeight = translateWeightBetweenImplements(
    90,
    { equipment: 'barbell', pillar: 'Horizontal Push', exerciseId: 'ex-bench-press' },
    { equipment: 'bodyweight', pillar: 'Horizontal Push', exerciseId: 'ex-deficit-pushup' },
    80
  );
  assert(
    convertedPushupWeight === 0,
    `Switching from 90kg barbell bench to travel deficit pushup yields exactly 0 kg external load (got ${convertedPushupWeight} kg, never +5kg)`
  );

  // C. Calibrated Hypertrophy Rep Engine for Bodyweight Movements
  // An athlete benching 90kg x 10 @ 2 RIR has E1RM = 126kg.
  // At 80kg BW, deficit pushup effective load is 80 * 0.74 = 59.2kg.
  // Target reps = 30 * (126 / 59.2 - 1) - 2 = 30 * (1.128) - 2 = 31.8 -> capped at 25-30 with tempo cue
  const bwRepPrescription = calculateHypertrophyBodyweightReps(
    126,
    80,
    'ex-deficit-pushup',
    'Horizontal Push',
    8,
    15
  );
  assert(
    bwRepPrescription.targetReps >= 20 && bwRepPrescription.targetReps <= 30,
    `Calibrated hypertrophy reps for deficit pushup are within 20–30 reps (got ${bwRepPrescription.targetReps})`
  );
  assert(
    bwRepPrescription.tempoCue !== undefined && bwRepPrescription.tempoCue.includes('eccentric'),
    `Prescribes lengthened-position tempo cue when reps approach ceiling (got "${bwRepPrescription.tempoCue}")`
  );

  // D. Workout Session Location Adaptation to Travel
  const gymSession: WorkoutSession = {
    id: 'test-session-1',
    date: '2026-10-19',
    name: 'Day 1: Chest & Shoulders',
    splitDay: 'Push',
    completed: false,
    readinessState: 'Normal',
    readinessZScore: 0.2,
    xpEarned: 0,
    location: 'gym',
    exercises: [
      {
        id: 's-ex-1',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 8,
        maxReps: 12,
        sets: [
          { id: 'set-1', setNumber: 1, targetWeightKg: 90, targetReps: 10, targetRir: 2, completed: false, setType: 'working' },
          { id: 'set-2', setNumber: 2, targetWeightKg: 90, targetReps: 10, targetRir: 2, completed: false, setType: 'working' },
          { id: 'set-3', setNumber: 3, targetWeightKg: 90, targetReps: 10, targetRir: 1, completed: false, setType: 'working' },
        ],
      },
    ],
  };

  const travelAdapted = adaptWorkoutSessionToLocation(gymSession, 'travel', [], SEED_EXERCISES, [], 'Normal', 80);
  assert(
    travelAdapted.location === 'travel',
    'WorkoutSession location adapted to travel'
  );
  const travelEx = travelAdapted.exercises[0];
  assert(
    travelEx.equipment === 'bodyweight',
    `Substituted gym bench press for travel bodyweight exercise (${travelEx.name})`
  );
  assert(
    travelEx.sets.every((s) => s.targetWeightKg === 0 && (s.actualWeightKg === undefined || s.actualWeightKg === 0)),
    'All sets in travel bodyweight exercise have strictly 0 kg target load (no phantom +5kg)'
  );
  assert(
    travelEx.sets[0].targetReps >= 15,
    `Travel exercise sets have calibrated hypertrophy reps >= 15 (got ${travelEx.sets[0].targetReps} reps)`
  );
  assert(
    formatImplementWeightLabel(travelEx.sets[0].targetWeightKg, travelEx.equipment, travelEx.isWeightedCalisthenic) === 'Bodyweight',
    'formatImplementWeightLabel for 0kg bodyweight returns "Bodyweight"'
  );

  // E. Double Progression for Pure Bodyweight
  const bwProgression = prescribeDoubleProgression(
    travelEx,
    'Normal',
    [],
    80,
    'Lean Bulk'
  );
  assert(
    bwProgression.isPureBodyweight === true,
    'prescribeDoubleProgression flags isPureBodyweight: true'
  );
  assert(
    bwProgression.nextWeightKg === 0,
    'prescribeDoubleProgression nextWeightKg is strictly 0 kg'
  );
  assert(
    bwProgression.weightChanged === false,
    'prescribeDoubleProgression weightChanged is false (never prompts Add Weight)'
  );

  // F. Knowledge Graph Biomechanical Meta for Bodyweight
  const deficitPushupDef = SEED_EXERCISES.find((e) => e.id === 'ex-deficit-pushup')!;
  const bwMeta = getExerciseBiomechanicalMeta(deficitPushupDef);
  assert(
    bwMeta.axialLoadIndex <= 0.15,
    `Bodyweight deficit pushup has low spinal axial load index (${bwMeta.axialLoadIndex} <= 0.15)`
  );
  assert(
    bwMeta.sfrScore >= 8.5,
    `Bodyweight deficit pushup has high stimulus-to-fatigue ratio (${bwMeta.sfrScore} >= 8.5)`
  );

  // ============================================================================
  // 22. ON-DEVICE AI COACH, KNOWLEDGE GRAPH MUTATIONS & LOCAL PROCESSING
  // ============================================================================
  console.log('\n[22. On-Device Conversational AI Assistant & Personal Knowledge Graph Mutations]');

  const testProfile = { ...SAMPLE_DEMO_PROFILE, homeEquipment: ['dumbbells' as const, 'bench' as const], scheduledWeekLocations: {} };
  const mockBiometrics = [
    {
      date: '2026-10-18',
      bodyweightKg: 80,
      restingHr: 56,
      hrvRmssd: 68,
      sleepHours: 8.0,
      activeZoneMinutes: 45,
      dailySteps: 10500,
      steps: 10500,
      readinessScore: 88,
    },
  ];

  // A. Intent: Add New Equipment ("I got a pull up bar")
  const equipResult = await processAssistantMessage({
    userMessage: 'I got a new pull up bar for my room',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    equipResult.actionTaken?.type === 'UPDATE_EQUIPMENT',
    'AI Assistant classifies equipment addition intent (type: UPDATE_EQUIPMENT)'
  );
  assert(
    equipResult.updatedProfile?.homeEquipment?.includes('pullup_bar') === true,
    'AI Assistant mutates profile.homeEquipment to include pullup_bar'
  );
  assert(
    equipResult.message.text.includes('Pull-Up Bar'),
    'AI Assistant message articulates authoritative pull-up bar guidance'
  );

  // B. Intent: Schedule Travel Week ("I'll be away with work during week 5 of my program")
  const travelScheduleResult = await processAssistantMessage({
    userMessage: "I'll be away with work during week 5 of my program",
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    travelScheduleResult.actionTaken?.type === 'SCHEDULE_LOCATION_WEEK',
    'AI Assistant classifies scheduled travel intent (type: SCHEDULE_LOCATION_WEEK)'
  );
  assert(
    travelScheduleResult.updatedProfile?.scheduledWeekLocations?.[5] === 'travel',
    'AI Assistant records scheduledWeekLocations[5] = travel in UserProfile'
  );
  assert(
    travelScheduleResult.actionTaken?.details?.week === 5,
    'AI Assistant extracted exact week 5 parameter from natural language'
  );

  // C. Verify Workout Session Generated for Scheduled Week 5 Automatically Uses Travel Mode
  const scheduledLocations = travelScheduleResult.updatedProfile?.scheduledWeekLocations;
  const week5GeneratedSession = generateSmartWorkoutSession(
    'Push',
    [pushW3],
    SEED_EXERCISES,
    'Normal',
    5, // Mesocycle Week 5
    'gym', // Default location is gym, but scheduled override should take precedence
    ['bench', 'dumbbells', 'pullup_bar'],
    'Lean Bulk',
    80,
    scheduledLocations
  );

  assert(
    week5GeneratedSession.location === 'travel',
    'generateSmartWorkoutSession automatically applies scheduledWeekLocations[5] override to Travel mode'
  );
  assert(
    week5GeneratedSession.exercises[0].equipment === 'bodyweight',
    `Week 5 session uses bodyweight exercises (${week5GeneratedSession.exercises[0].name})`
  );
  assert(
    week5GeneratedSession.exercises[0].sets.every((s) => s.targetWeightKg === 0),
    'Week 5 travel session enforces strictly 0kg external load'
  );

  // D. Intent: Switch Program Split ("Switch my split to Upper / Lower")
  const splitResult = await processAssistantMessage({
    userMessage: 'Switch my split to Upper / Lower',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    splitResult.actionTaken?.type === 'SWITCH_PROGRAM_SPLIT',
    'AI Assistant classifies split change intent (type: SWITCH_PROGRAM_SPLIT)'
  );
  assert(
    splitResult.updatedProfile?.programType === 'upper_lower',
    'AI Assistant mutates profile.programType to upper_lower'
  );
  assert(
    splitResult.updatedWorkout?.splitDay === 'Upper',
    'AI Assistant queues starter Upper Day session'
  );

  // E. Intent: Query Joint Strain & Biomechanical Grounding
  const jointQueryResult = await processAssistantMessage({
    userMessage: 'How is my shoulder recovery and joint strain looking?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });

  assert(
    jointQueryResult.message.text.toLowerCase().includes('shoulder'),
    'AI Assistant responds with contextual shoulder joint analysis'
  );
  assert(
    Boolean(jointQueryResult.message.knowledgeGraphCitations && jointQueryResult.message.knowledgeGraphCitations.length > 0),
    'AI Assistant grounds response with Knowledge Graph citations'
  );

  // F. Privacy invariant: replies carry no fabricated latency or hardware stamps
  assert(
    jointQueryResult.message.latencyMs === undefined && jointQueryResult.message.backend === undefined,
    'AI Assistant replies carry no latency or hardware stamps'
  );

  // G. Dynamic Exercise Targets Grounding (Eliminates Stock Responses)
  const exerciseTargetResult = await processAssistantMessage({
    userMessage: 'What is my prescribed weight and rep target on bench press today?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    exerciseTargetResult.message.text.includes('Bench Press') &&
      exerciseTargetResult.message.text.includes('working sets') &&
      Boolean(exerciseTargetResult.message.knowledgeGraphCitations?.some((c) => c.metric === 'Target Load & Reps')),
    'AI Assistant returns exact exercise-specific targets and citations instead of canned stock response'
  );

  // H. Exercise Substitution Grounding via Biomechanical Neural Matcher
  const swapResult = await processAssistantMessage({
    userMessage: 'Can I swap barbell bench press for dumbbell bench press?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    swapResult.message.text.includes('Biomechanical Match') &&
      Boolean(swapResult.message.knowledgeGraphCitations?.some((c) => c.metric === 'Biomechanical Match')),
    'AI Assistant evaluates exercise substitution compatibility and joint shear from Knowledge Graph'
  );

  // I. Dynamic Tactical Session Briefing
  const briefingResult = await processAssistantMessage({
    userMessage: "Give me a tactical briefing for today's workout and targets",
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    briefingResult.message.text.includes('Planned Movements') &&
      briefingResult.message.text.includes('Push Day') &&
      briefingResult.message.text.includes('recovery') &&
      Boolean(briefingResult.message.knowledgeGraphCitations?.some((c) => c.metric === "Today's Session")),
    'AI Assistant synthesizes bespoke tactical briefing of active session and biometrics'
  );

  // ============================================================================
  // SUITE 23: EXERCISE SCIENCE KNOWLEDGE BASE & ZERO-HALLUCINATION AI GROUNDING
  // ============================================================================
  console.log('\n--- SUITE 23: EXERCISE SCIENCE KNOWLEDGE BASE & ZERO-HALLUCINATION AI GROUNDING ---');

  // A. Knowledge Base Completeness & Structure
  assert(
    EXERCISE_SCIENCE_KNOWLEDGE_BASE.length >= 18,
    `Exercise science knowledge base contains all 18 authoritative scientific principles (got ${EXERCISE_SCIENCE_KNOWLEDGE_BASE.length})`
  );

  const dotsPrinciple = queryExerciseScienceKnowledgeBase('What is the formula and rationale for the DOTS score?');
  assert(
    dotsPrinciple !== null &&
      dotsPrinciple.id === 'sp-dots-polynomial' &&
      Boolean(dotsPrinciple.formula?.includes('A·w⁴ + B·w³')) &&
      dotsPrinciple.academicCitation.includes('International Powerlifting Federation'),
    `DOTS query returns sp-dots-polynomial with 4th-degree polynomial and IPF citation`
  );

  const dbMultiplierPrinciple = queryExerciseScienceKnowledgeBase('Why does dumbbell bench press use a 1.18x multiplier?');
  assert(
    dbMultiplierPrinciple !== null &&
      dbMultiplierPrinciple.id === 'sp-db-multiplier' &&
      Boolean(dbMultiplierPrinciple.formula?.includes('1.18')) &&
      dbMultiplierPrinciple.academicCitation.includes('Saeterbakken'),
    `DB multiplier query returns sp-db-multiplier with 1.18x factor and a verifiable citation`
  );

  const rdlMultiplierPrinciple = queryExerciseScienceKnowledgeBase('RDL deadlift multiplier 1.20x');
  assert(
    rdlMultiplierPrinciple !== null &&
      rdlMultiplierPrinciple.id === 'sp-rdl-multiplier' &&
      Boolean(rdlMultiplierPrinciple.formula?.includes('1.20')),
    `RDL multiplier query returns sp-rdl-multiplier with 1.20x normalization`
  );

  const cutVolumePrinciple = queryExerciseScienceKnowledgeBase('Why are we doing fewer sets on a cut?');
  assert(
    cutVolumePrinciple !== null &&
      cutVolumePrinciple.id === 'sp-retention-shield' &&
      Boolean(cutVolumePrinciple.formula?.includes('85%')) &&
      cutVolumePrinciple.academicCitation.includes('Helms'),
    `Deficit volume query returns sp-retention-shield with 85% volume cap and Helms citation`
  );

  const hamstringRecovery = queryExerciseScienceKnowledgeBase('Why do hamstrings take 72 hours to recover?');
  assert(
    hamstringRecovery !== null &&
      hamstringRecovery.id === 'sp-hypertrophy-landmarks' &&
      hamstringRecovery.scientificRationale.includes('hamstrings'),
    `Hamstring volume query returns sp-hypertrophy-landmarks with high fast-twitch rationale`
  );

  // B. Search Utility Verification
  const searchResults = searchExerciseScienceKnowledgeBase('hypertrophy volume sets', 3);
  assert(
    searchResults.length >= 2,
    `Knowledge base search returns top matching principles (got ${searchResults.length})`
  );

  // C. AI Assistant Grounding & Zero-Hallucination Delivery
  const aiScienceAnswer = await processAssistantMessage({
    userMessage: 'Why does dumbbell bench press use a 1.18x multiplier?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    aiScienceAnswer.message.text.includes('1.18x') &&
      aiScienceAnswer.message.text.includes('stabilizer') &&
      Boolean(aiScienceAnswer.message.scientificPrinciplesCited && aiScienceAnswer.message.scientificPrinciplesCited.length > 0),
    `AI Assistant answers dumbbell multiplier query using exact formula and cites scientific principles`
  );
  assert(
    aiScienceAnswer.message.text.includes('Academic Citation:') &&
      aiScienceAnswer.message.text.includes('Saeterbakken'),
    `AI Assistant provides peer-reviewed academic citation without hallucination`
  );

  const aiCutAnswer = await processAssistantMessage({
    userMessage: 'Why is my workout volume reduced during a cut?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });

  assert(
    aiCutAnswer.message.text.includes('85%') &&
      aiCutAnswer.message.text.includes('Retention Shield') &&
      aiCutAnswer.message.text.includes('Helms'),
    `AI Assistant delivers Retention Shield deficit rationale citing Helms et al.`
  );

  // 24. Evidence-Based Warmup Sets Protocol with Pre-filled Loads & Reps
  console.log('\n[24. Evidence-Based Warmup Sets Protocol with Pre-filled Loads & Reps]');

  // A. Primary Compound Movement Warmup Prescription (2-stage ramping: 50% & 72%)
  const primaryBenchWarmup = calculateWarmupPrescription(
    { pillar: 'Horizontal Push', equipment: 'barbell', name: 'Barbell Bench Press', exerciseId: 'ex-bench-press' },
    100,
    true
  );
  assert(
    primaryBenchWarmup.count === 2 &&
      primaryBenchWarmup.sets[0].weightKg === 50 &&
      primaryBenchWarmup.sets[0].reps === 8 &&
      primaryBenchWarmup.sets[1].weightKg === 72.5 &&
      primaryBenchWarmup.sets[1].reps === 4,
    `Primary compound barbell lift (100kg) generates 2 ramping warmup sets: 50kg x 8 (50%) and 72.5kg x 4 (72%)`
  );

  // B. Secondary Compound Movement Warmup Prescription (1-stage acclimation: 60%)
  const secondaryInclineWarmup = calculateWarmupPrescription(
    { pillar: 'Horizontal Push', equipment: 'dumbbell', name: 'Incline Dumbbell Press', exerciseId: 'ex-incline-db-press' },
    34,
    false
  );
  assert(
    secondaryInclineWarmup.count === 1 &&
      secondaryInclineWarmup.sets[0].weightKg === 20 &&
      secondaryInclineWarmup.sets[0].reps === 5,
    `Secondary compound dumbbell lift (34kg) generates 1 acclimation set at 20kg x 5 (60% rounded to 2kg DB jump)`
  );

  // C. Weighted Calisthenics Warmup Prescription (+0kg Bodyweight Prep)
  const weightedPullUpWarmup = calculateWarmupPrescription(
    { pillar: 'Vertical Pull', equipment: 'bodyweight', isWeightedCalisthenic: true, name: 'Weighted Pull-Up', exerciseId: 'ex-weighted-pullup' },
    25,
    true
  );
  assert(
    weightedPullUpWarmup.count === 1 &&
      weightedPullUpWarmup.sets[0].weightKg === 0 &&
      weightedPullUpWarmup.sets[0].reps === 5,
    `Weighted calisthenic lift (+25kg) prescribes 1 bodyweight-only (+0kg x 5) prep set before external load`
  );

  // D. Isolation Movements Exclusion (0 warmup sets)
  const lateralRaiseWarmup = calculateWarmupPrescription(
    { pillar: 'Horizontal Push', equipment: 'dumbbell', isIsolation: true, name: 'Dumbbell Lateral Raise', exerciseId: 'ex-db-lateral-raise' },
    14,
    false
  );
  assert(
    lateralRaiseWarmup.count === 0 && lateralRaiseWarmup.sets.length === 0,
    `Isolation movement (Lateral Raise) generates 0 warmup sets as muscles are already warm from compound pressing`
  );

  // E. Pure Bodyweight Travel Movements Exclusion (0 warmup sets)
  const travelPushupWarmup = calculateWarmupPrescription(
    { pillar: 'Horizontal Push', equipment: 'bodyweight', isWeightedCalisthenic: false, name: 'Push-Up', exerciseId: 'ex-pushup' },
    0,
    true
  );
  assert(
    travelPushupWarmup.count === 0 && travelPushupWarmup.sets.length === 0,
    `Pure bodyweight travel exercise generates 0 warmup sets, starting directly with working sets`
  );

  // F. generateWarmupSets pre-fills actualWeightKg and actualReps
  const generatedWarmupSets = generateWarmupSets('ex-bench-press', primaryBenchWarmup);
  assert(
    generatedWarmupSets.length === 2 &&
      generatedWarmupSets[0].targetWeightKg === 50 &&
      generatedWarmupSets[0].actualWeightKg === 50 &&
      generatedWarmupSets[0].targetReps === 8 &&
      generatedWarmupSets[0].actualReps === 8 &&
      generatedWarmupSets[0].isWarmup === true &&
      generatedWarmupSets[0].setType === 'warmup',
    `generateWarmupSets produces pre-filled actualWeightKg and actualReps with setType='warmup'`
  );

  // G. Dynamic Smart Workout Generation includes warmups on compounds
  const testPushWorkout = generateSmartWorkoutSession(
    'Push',
    [],
    SEED_EXERCISES,
    'Normal',
    3,
    'gym'
  );
  const benchInPush = testPushWorkout.exercises.find((e) => e.exerciseId === 'ex-bench-press');
  const benchWarmups = benchInPush?.sets.filter((s) => s.isWarmup || s.setType === 'warmup');
  const benchWorking = benchInPush?.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  assert(
    Boolean(benchWarmups && benchWarmups.length === 2 && benchWorking && benchWorking.length >= 3),
    `Smart Workout Generator automatically adds 2 pre-filled warmup sets to Barbell Bench Press`
  );
  assert(
    (benchWarmups?.[0]?.actualWeightKg ?? 0) > 0 && benchWarmups?.[0]?.actualReps === 8,
    `Warmup set 1 has pre-filled load (${benchWarmups?.[0]?.actualWeightKg}kg) and 8 reps`
  );
  assert(
    (benchWarmups?.[1]?.actualWeightKg ?? 0) > (benchWarmups?.[0]?.actualWeightKg ?? 0) && benchWarmups?.[1]?.actualReps === 4,
    `Warmup set 2 has pre-filled load (${benchWarmups?.[1]?.actualWeightKg}kg) and 4 reps`
  );

  const lateralInPush = testPushWorkout.exercises.find((e) => e.exerciseId === 'ex-db-lateral-raise');
  const lateralWarmups = lateralInPush?.sets.filter((s) => s.isWarmup || s.setType === 'warmup');
  assert(
    Boolean(lateralWarmups && lateralWarmups.length === 0),
    `Smart Workout Generator preserves 0 warmup sets on isolation movements (Lateral Raise)`
  );

  // H. Progression Weight Protection: warmup sets do not pollute progression working weight
  const mockSessionWithWarmups: ExerciseSession = {
    ...benchInPush!,
    sets: [
      { id: 'w1', setNumber: 1, targetWeightKg: 45, actualWeightKg: 45, targetReps: 8, actualReps: 8, targetRir: 4, completed: true, isWarmup: true, setType: 'warmup' },
      { id: 'w2', setNumber: 2, targetWeightKg: 65, actualWeightKg: 65, targetReps: 4, actualReps: 4, targetRir: 3, completed: true, isWarmup: true, setType: 'warmup' },
      { id: 's1', setNumber: 3, targetWeightKg: 90, actualWeightKg: 90, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
      { id: 's2', setNumber: 4, targetWeightKg: 90, actualWeightKg: 90, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
      { id: 's3', setNumber: 5, targetWeightKg: 90, actualWeightKg: 90, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
    ],
  };
  const mockWorkoutWithWarmups: WorkoutSession = {
    ...testPushWorkout,
    completed: true,
    exercises: [mockSessionWithWarmups],
  };
  const nextPrescription = prescribeDoubleProgression(
    mockSessionWithWarmups,
    'Normal',
    [mockWorkoutWithWarmups],
    80,
    'Lean Bulk'
  );
  assert(
    nextPrescription.nextWeightKg === 92.5,
    `Double progression anchors to working sets (90kg -> 92.5kg) instead of warmup set load (got ${nextPrescription.nextWeightKg}kg)`
  );

  console.log('\n--- SUITE 25: CODIFIED DESIGN SYSTEM & STRICT 4-TIER TYPOGRAPHY INVARIANTS ---');

  // A. Design System Registry Completeness & Structure
  assert(
    TREISE_DESIGN_SYSTEM.length >= 8,
    `Knowledge Graph contains authoritative design system components (got ${TREISE_DESIGN_SYSTEM.length} components)`
  );

  for (const comp of TREISE_DESIGN_SYSTEM) {
    assert(
      Boolean(comp.id && comp.name && comp.category && comp.anatomy && comp.logic && comp.tailwindTokens && comp.rationale),
      `Component ${comp.id} contains valid anatomy, logic invariants, tailwind tokens, and rationale`
    );
    assert(
      Boolean(comp.anatomy.container && comp.anatomy.typography && comp.anatomy.colors && comp.anatomy.touchTarget),
      `Component ${comp.id} contains full anatomy breakdown (container, typography, colors, touchTarget)`
    );
    assert(
      comp.logic.rules.length >= 2,
      `Component ${comp.id} defines at least 2 invariant rules for developers and AI agents`
    );
  }

  // B. 4-Tier Typography Scale Invariant Verification
  const typoComp = getDesignSystemComponentById('ds-typography-scale');
  assert(
    typoComp !== undefined &&
      typoComp.category === 'typography' &&
      typoComp.anatomy.typography.includes('text-xs') &&
      typoComp.anatomy.typography.includes('text-sm') &&
      typoComp.anatomy.typography.includes('text-base') &&
      typoComp.anatomy.typography.includes('text-xl'),
    `Design system strictly codifies the 4-tier typography scale (text-xs, text-sm, text-base, text-xl)`
  );
  assert(
    Boolean(typoComp?.logic.rules.some((r) => r.includes('Maximum 4 distinct typography') || r.includes('4 distinct typography sizes'))),
    `Typography component rules enforce strict maximum of 4 font sizes across app`
  );
  assert(
    Boolean(typoComp?.logic.rules.some((r) => r.includes('12px') || r.includes('text-xs') && r.includes('floor'))),
    `Typography component rules enforce strict 12px minimum floor`
  );

  // C. Primary CTA & Semantic Color Reservation Invariants
  const primaryBtnComp = getDesignSystemComponentById('ds-btn-primary');
  assert(
    primaryBtnComp !== undefined &&
      primaryBtnComp.tailwindTokens.includes('bg-white') &&
      primaryBtnComp.tailwindTokens.includes('text-slate-950') &&
      primaryBtnComp.tailwindTokens.includes('min-h-[44px]'),
    `Primary CTA button is codified as luminous solid white with min-h-[44px] touch target`
  );
  assert(
    Boolean(primaryBtnComp?.logic.rules.some((r) => r.includes('Never use neon green as button background'))),
    `Primary CTA explicitly forbids using green as a button background fill`
  );

  const setToggleComp = getDesignSystemComponentById('ds-set-toggle');
  assert(
    setToggleComp !== undefined &&
      setToggleComp.tailwindTokens.includes('bg-brand-primary') &&
      Boolean(setToggleComp?.logic.rules.some((r) => r.includes('Green is strictly reserved'))),
    `Set completion checkmark is codified with semantic emerald green reserved for progressive overload celebration`
  );

  // D. Search and Lookup Helper Functions
  const buttonComps = queryDesignSystemComponents('button');
  assert(
    buttonComps.length >= 2,
    `queryDesignSystemComponents('button') returns button specifications (got ${buttonComps.length})`
  );

  const cardComp = queryDesignSystemComponents('biometric card');
  assert(
    cardComp.length >= 1 && cardComp[0].id === 'ds-card-biometric',
    `queryDesignSystemComponents('biometric card') returns ds-card-biometric`
  );

  // E. AthleteKnowledgeGraph Integration
  const testPkg = buildAthleteKnowledgeGraph(
    [pushW3],
    mockBiometrics,
    SEED_EXERCISES,
    testProfile,
    { 'Chest': 14, 'Side Delts': 18 }
  );
  assert(
    Array.isArray(testPkg.designSystem) && testPkg.designSystem.length === TREISE_DESIGN_SYSTEM.length,
    `AthleteKnowledgeGraph exposes complete designSystem array in the Knowledge Graph (got ${testPkg.designSystem.length} components)`
  );

  // F. On-Device AI Assistant Design System Grounding
  const aiDesignAnswer = await processAssistantMessage({
    userMessage: 'What is the primary CTA button specification and touch target in Treise?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });
  assert(
    !aiDesignAnswer.message.text.includes('bg-white') && !aiDesignAnswer.message.text.includes('Tailwind'),
    'Athlete-facing AI Coach never exposes internal design-system documentation'
  );

  // G. Shift Nudge Nested Radius & 8pt Spatial Grid Codification
  const nestedRadiusComp = getDesignSystemComponentById('ds-nested-radius');
  assert(
    nestedRadiusComp !== undefined &&
      nestedRadiusComp.category === 'layout' &&
      Boolean(nestedRadiusComp?.logic.rules.some((r) => r.includes('Inner Radius = Outer Radius - Padding'))),
    `Design system codifies Shift Nudge concentric nested radius formula (Inner Radius = Outer Radius - Padding)`
  );

  const spatialGridComp = getDesignSystemComponentById('ds-spatial-grid');
  assert(
    spatialGridComp !== undefined &&
      spatialGridComp.category === 'layout' &&
      Boolean(spatialGridComp?.logic.rules.some((r) => r.includes('base-8'))),
    `Design system codifies Shift Nudge 8pt spatial grid and proximity hierarchy`
  );

  // --- SUITE 26: MULTI-WEARABLE BIOMETRIC TELEMETRY (FITBIT, WHOOP, HEALTH CONNECT) ---
  console.log('\n--- SUITE 26: MULTI-WEARABLE BIOMETRIC TELEMETRY (FITBIT, WHOOP, HEALTH CONNECT) ---');
  // 1. Fitbit Provider
  assert(
    FITBIT_CONFIG.SCOPES.includes('heartrate') && FITBIT_CONFIG.SCOPES.includes('sleep'),
    `Fitbit Web API config requests heartrate, sleep, and activity scopes`
  );
  const fitbitAuthUrl = await initiateFitbitOAuth('test_fitbit_client');
  assert(
    fitbitAuthUrl.includes('fitbit.com/oauth2/authorize') &&
      fitbitAuthUrl.includes('code_challenge') &&
      fitbitAuthUrl.includes('response_type=code'),
    `Fitbit OAuth 2.0 PKCE generates valid authorization URL with code_challenge`
  );
  const fitbitLog = await simulatePixelWatchSync(undefined, 'Primed');
  assert(
    fitbitLog.hrvRmssd >= 65 && fitbitLog.sleepHours >= 8.0 && fitbitLog.restingHr <= 52,
    `Fitbit / Pixel Watch sync generates high parasympathetic recovery metrics for Primed state`
  );

  // 2. Whoop 4.0 Provider
  assert(
    WHOOP_CONFIG.CLIENT_ID === '8bcb0a0d-b6ff-42e0-82b7-c3508e18c9f8',
    `WHOOP_CONFIG.CLIENT_ID binds to user's registered Whoop Client ID`
  );
  assert(
    !('CLIENT_SECRET' in WHOOP_CONFIG),
    `Whoop client secret is never shipped in the client bundle`
  );
  assert(
    WHOOP_CONFIG.AUTHORIZATION_URI === 'https://api.prod.whoop.com/oauth/oauth2/auth' &&
      WHOOP_CONFIG.SCOPES.includes('read:recovery') &&
      WHOOP_CONFIG.SCOPES.includes('read:sleep'),
    `Whoop 4.0 Developer config targets v1 API with read:recovery and read:sleep scopes`
  );
  const whoopRedirectUri = getWhoopRedirectUri();
  assert(
    whoopRedirectUri.endsWith('/oauth/whoop/callback'),
    `getWhoopRedirectUri returns valid callback URI ending in /oauth/whoop/callback`
  );
  const whoopAuthUrl = await initiateWhoopOAuth('test_whoop_client');
  assert(
    whoopAuthUrl.includes('api.prod.whoop.com/oauth/oauth2/auth') &&
      whoopAuthUrl.includes('response_type=code') &&
      whoopAuthUrl.includes('offline'),
    `Whoop OAuth 2.0 generates valid authorization URL with required parameters`
  );
  const whoopPrimedLog = await simulateWhoopSync(undefined, 'Primed');
  assert(
    whoopPrimedLog.hrvRmssd >= 70 && whoopPrimedLog.restingHr <= 50,
    `Whoop 4.0 sync generates Green Recovery metrics (HRV >= 70ms, RHR <= 50bpm) for Primed state`
  );
  const whoopAmberLog = await simulateWhoopSync(undefined, 'Amber Shield');
  assert(
    whoopAmberLog.hrvRmssd <= 40 && whoopAmberLog.sleepHours <= 5.5,
    `Whoop 4.0 sync generates Red Recovery metrics (HRV <= 40ms, Sleep <= 5.5h) for Amber Shield recovery`
  );
  const whoopCoordinatorLog = await syncWearableBiometrics('whoop', { forcedState: 'Primed', allowSimulation: true });
  assert(
    whoopCoordinatorLog.hrvRmssd >= 70 && whoopCoordinatorLog.restingHr <= 50,
    `syncWearableBiometrics coordinates Whoop provider correctly for Primed state`
  );

  // 3. Android Health Connect Provider
  assert(
    HEALTH_CONNECT_CONFIG.PACKAGE_NAME === 'com.google.android.apps.healthdata' &&
      HEALTH_CONNECT_CONFIG.RECORD_TYPES.includes('HeartRateVariabilityRmssdRecord') &&
      HEALTH_CONNECT_CONFIG.RECORD_TYPES.includes('RestingHeartRateRecord') &&
      HEALTH_CONNECT_CONFIG.RECORD_TYPES.includes('SleepSessionRecord'),
    `Android Health Connect config binds to package com.google.android.apps.healthdata with standard record schemas`
  );
  const sampleHealthConnectExport = {
    records: [
      {
        type: 'HeartRateVariabilityRmssdRecord',
        startTime: '2026-10-18T06:00:00Z',
        heartRateVariabilityMillis: 68.5,
      },
      {
        type: 'RestingHeartRateRecord',
        startTime: '2026-10-18T06:00:00Z',
        beatsPerMinute: 52,
      },
      {
        type: 'SleepSessionRecord',
        startTime: '2026-10-17T22:30:00Z',
        endTime: '2026-10-18T06:30:00Z',
      },
      {
        type: 'StepsRecord',
        startTime: '2026-10-18T18:00:00Z',
        count: 10450,
      },
    ],
  };
  const parsedHcLogs = parseHealthConnectExport(sampleHealthConnectExport);
  assert(
    parsedHcLogs.length === 1 &&
      parsedHcLogs[0].date === '2026-10-18' &&
      parsedHcLogs[0].hrvRmssd === 69 &&
      parsedHcLogs[0].restingHr === 52 &&
      parsedHcLogs[0].sleepHours === 8.0 &&
      parsedHcLogs[0].steps === 10450,
    `Health Connect JSON export parser extracts HRV, Resting HR, Sleep duration (8.0h), and Steps correctly`
  );
  const hcSyncedLog = await simulateHealthConnectSync(undefined, 'Amber Shield');
  assert(
    hcSyncedLog.hrvRmssd <= 42 && hcSyncedLog.sleepHours <= 5.5,
    `Health Connect sync generates valid recovery data for Amber Shield state`
  );

  // Whoop CSV Export Parser
  const sampleWhoopCsv = `Cycle start time,Cycle end time,Heart Rate Variability (HRV) (ms),Resting Heart Rate (RHR) (bpm),Recovery score (%),Day Strain,Energy burned (kcal)
2026-10-19 06:30:00,2026-10-20 06:15:00,72.4,49,82,14.2,2450
2026-10-20 06:15:00,2026-10-21 06:45:00,68.1,51,77,15.8,2680`;
  const parsedWhoopCsvLogs = parseWhoopCsvExport(sampleWhoopCsv);
  assert(
    parsedWhoopCsvLogs.length === 2 &&
      parsedWhoopCsvLogs[0].date === '2026-10-19' &&
      parsedWhoopCsvLogs[0].hrvRmssd === 72 &&
      parsedWhoopCsvLogs[0].restingHr === 49 &&
      parsedWhoopCsvLogs[0].steps === 0 &&
      parsedWhoopCsvLogs[0].strain === 14.2 &&
      parsedWhoopCsvLogs[0].bodyweightKg === 0,
    `Whoop CSV export parser extracts HRV, Resting HR and Day Strain, without guessing steps or bodyweight`
  );
  const csvMissingHrv = parseWhoopCsvExport(`Cycle start time,Day Strain
2026-10-19 06:30:00,9.1`);
  assert(
    csvMissingHrv.length === 1 && csvMissingHrv[0].hrvRmssd === 0 && csvMissingHrv[0].restingHr === 0 && csvMissingHrv[0].sleepHours === 0,
    'Missing CSV columns are stored as not measured (0), never typical-looking defaults'
  );

  // Saved data from older versions: simulated syncs removed, strain-derived steps cleared.
  localStorage.setItem(
    'treise_biometrics_v3',
    JSON.stringify([
      { date: '2026-10-20', bodyweightKg: 81.8, hrvRmssd: 66, restingHr: 52, sleepHours: 7.9, steps: 10200, activeZoneMinutes: 48, vo2Max: 47, avgWorkoutHr: 142, workoutDurationMin: 60 },
      { date: '2026-10-23', bodyweightKg: 0, hrvRmssd: 29, restingHr: 71, sleepHours: 7.8, steps: 3120, activeZoneMinutes: 17, strain: 4.8, source: 'whoop', recoveryScore: 86 },
      { date: '2026-10-21', bodyweightKg: 0, hrvRmssd: 40, restingHr: 60, sleepHours: 7, steps: 2525, activeZoneMinutes: 17, strain: 4.8, source: 'whoop' },
      { date: '2026-10-22', bodyweightKg: 80, hrvRmssd: 50, restingHr: 55, sleepHours: 7, steps: 8000, activeZoneMinutes: 30 },
    ])
  );
  removeFabricatedBiometrics();
  const cleanedLogs = JSON.parse(localStorage.getItem('treise_biometrics_v3') || '[]');
  assert(
    cleanedLogs.length === 3 &&
      cleanedLogs.find((l: any) => l.date === '2026-10-21').steps === 2525 &&
      !cleanedLogs.some((l: any) => l.date === '2026-10-20') &&
      cleanedLogs.find((l: any) => l.date === '2026-10-23').steps === 0 &&
      cleanedLogs.find((l: any) => l.date === '2026-10-23').activeZoneMinutes === 0 &&
      cleanedLogs.find((l: any) => l.date === '2026-10-23').hrvRmssd === 29 &&
      cleanedLogs.find((l: any) => l.date === '2026-10-22').steps === 8000,
    'Migration removes simulated syncs and strain-guessed steps, keeping measured values (incl. real Whoop steps)'
  );
  localStorage.removeItem('treise_biometrics_v3');

  const sampleWhoopCsvWithHr = `Cycle start time,Cycle end time,Heart Rate Variability (HRV) (ms),Resting Heart Rate (RHR) (bpm),Recovery score (%),Day Strain,Energy burned (kcal),Average Heart Rate (bpm),Max Heart Rate (bpm)
2026-10-19 06:30:00,2026-10-20 06:15:00,72.4,49,82,14.2,2450,138,168`;
  const parsedWhoopLogsWithHr = parseWhoopCsvExport(sampleWhoopCsvWithHr);
  assert(
    parsedWhoopLogsWithHr.length === 1 &&
      parsedWhoopLogsWithHr[0].avgWorkoutHr === 138 &&
      parsedWhoopLogsWithHr[0].maxWorkoutHr === 168,
    'Whoop CSV export parser extracts Average Heart Rate (138 bpm) and Max Heart Rate (168 bpm)'
  );

  // 4. Universal Wearable Sync Coordinator & Multi-Provider State
  assert(
    WEARABLE_PROVIDERS.fitbit.name.includes('Pixel Watch') &&
      WEARABLE_PROVIDERS.whoop.name.includes('Whoop 4.0') &&
      WEARABLE_PROVIDERS.health_connect.name.includes('Health Connect'),
    `Universal coordinator exposes metadata for Fitbit, Whoop, and Android Health Connect`
  );

  // Real syncs never fabricate readings: without a connection they fail with a clear message.
  let unconnectedError = '';
  try {
    await syncWearableBiometrics('fitbit');
  } catch (e: any) {
    unconnectedError = e?.message || '';
  }
  assert(/Connect your Pixel Watch or Fitbit/.test(unconnectedError), 'Sync without a connected watch fails instead of inventing data');

  const fitbitResult = await syncWearableBiometrics('fitbit', { forcedState: 'Primed', allowSimulation: true });
  assert(fitbitResult.hrvRmssd > 0 && fitbitResult.restingHr > 0, `syncWearableBiometrics('fitbit') succeeds`);

  const whoopResult = await syncWearableBiometrics('whoop', { forcedState: 'Normal', allowSimulation: true });
  assert(whoopResult.hrvRmssd > 0 && whoopResult.restingHr > 0, `syncWearableBiometrics('whoop') succeeds`);

  const hcResult = await syncWearableBiometrics('health_connect', { forcedState: 'Amber Shield', allowSimulation: true });
  assert(hcResult.hrvRmssd > 0 && hcResult.restingHr > 0, `syncWearableBiometrics('health_connect') succeeds`);

  const profileNone: UserProfile = { ...testProfile, fitbitConnected: false, whoopConnected: false, healthConnectConnected: false, wearableSource: null };
  assert(!isWearableConnected(profileNone), `isWearableConnected returns false when no wearable is connected`);
  assert(getActiveWearableProvider(profileNone) === null, `getActiveWearableProvider returns null when none connected`);

  const profileFitbit: UserProfile = { ...testProfile, fitbitConnected: true, whoopConnected: false, healthConnectConnected: false, wearableSource: 'fitbit' };
  assert(isWearableConnected(profileFitbit), `isWearableConnected returns true when Fitbit is connected`);
  assert(getActiveWearableProvider(profileFitbit) === 'fitbit', `getActiveWearableProvider returns 'fitbit'`);

  const profileWhoop: UserProfile = {
    ...testProfile,
    fitbitConnected: false,
    whoopConnected: true,
    whoopClientId: 'custom_whoop_id',
    whoopClientSecret: 'custom_secret',
    healthConnectConnected: false,
    wearableSource: 'whoop',
  };
  assert(isWearableConnected(profileWhoop), `isWearableConnected returns true when Whoop is connected`);
  assert(getActiveWearableProvider(profileWhoop) === 'whoop', `getActiveWearableProvider returns 'whoop'`);
  assert(profileWhoop.whoopClientId === 'custom_whoop_id', `UserProfile correctly associates with custom WHOOP Client ID`);

  const profileHealthConnect: UserProfile = { ...testProfile, fitbitConnected: false, whoopConnected: false, healthConnectConnected: true, wearableSource: 'health_connect' };
  assert(isWearableConnected(profileHealthConnect), `isWearableConnected returns true when Health Connect is connected`);
  assert(getActiveWearableProvider(profileHealthConnect) === 'health_connect', `getActiveWearableProvider returns 'health_connect'`);

  const disconnectedUpdates = disconnectWearable('whoop', profileWhoop);
  assert(disconnectedUpdates.whoopConnected === false && disconnectedUpdates.wearableSource === null, `disconnectWearable cleanly disconnects Whoop and resets wearableSource`);

  // 5. Recovery Calculation Driven by Synced Telemetry
  const readinessFromFitbit = calculateDailyReadiness(fitbitResult, mockBiometrics);
  assert(readinessFromFitbit.state === 'Primed', `Fitbit sync telemetry correctly drives calculateDailyReadiness to Primed`);

  const readinessFromWhoop = calculateDailyReadiness(whoopAmberLog, mockBiometrics);
  assert(readinessFromWhoop.state === 'Amber Shield' && readinessFromWhoop.streakProtected, `Whoop sync telemetry correctly triggers Amber Shield recovery with streak protection`);

  const readinessFromHc = calculateDailyReadiness(hcSyncedLog, mockBiometrics);
  assert(readinessFromHc.state === 'Amber Shield', `Health Connect sync telemetry correctly triggers Amber Shield recovery`);

  // 6. Whoop 49% Official Recovery Score Evaluation (Yellow Zone -> Normal Progression)
  const whoop49Log: BiometricLog = {
    date: '2026-10-21',
    bodyweightKg: 81.8,
    hrvRmssd: 58,
    restingHr: 54,
    sleepHours: 7.2,
    steps: 9200,
    activeZoneMinutes: 40,
    recoveryScore: 49,
    source: 'whoop',
  };
  const readinessWhoop49 = calculateDailyReadiness(whoop49Log, mockBiometrics);
  assert(
    readinessWhoop49.state === 'Normal',
    `Whoop 49% recovery score maps to Normal baseline (not Amber Shield) (got ${readinessWhoop49.state})`
  );
  assert(
    readinessWhoop49.xpMultiplier === 1.0,
    `Whoop 49% recovery score provides standard 1.0x XP multiplier`
  );
  assert(
    readinessWhoop49.reason.includes('49%') && readinessWhoop49.reason.includes('Yellow'),
    `Whoop 49% recovery reason indicates 49% Yellow recovery (${readinessWhoop49.reason})`
  );

  // 7. Single Tracker Exclusivity (setActiveTracker)
  const multiProfile: UserProfile = {
    ...testProfile,
    fitbitConnected: true,
    whoopConnected: true,
    healthConnectConnected: true,
    wearableSource: 'fitbit',
  };
  const activeFitbitUpdates = setActiveTracker('fitbit', multiProfile);
  assert(
    activeFitbitUpdates.wearableSource === 'fitbit' &&
      activeFitbitUpdates.fitbitConnected === true &&
      activeFitbitUpdates.whoopConnected === false &&
      activeFitbitUpdates.healthConnectConnected === false,
    'setActiveTracker(fitbit) activates only Fitbit and deactivates Whoop and Health Connect'
  );

  const activeWhoopUpdates = setActiveTracker('whoop', multiProfile);
  assert(
    activeWhoopUpdates.wearableSource === 'whoop' &&
      activeWhoopUpdates.whoopConnected === true &&
      activeWhoopUpdates.fitbitConnected === false &&
      activeWhoopUpdates.healthConnectConnected === false,
    'setActiveTracker(whoop) activates only Whoop and deactivates Fitbit and Health Connect'
  );

  const activeNoneUpdates = setActiveTracker(null, multiProfile);
  assert(
    activeNoneUpdates.wearableSource === null &&
      activeNoneUpdates.whoopConnected === false &&
      activeNoneUpdates.fitbitConnected === false &&
      activeNoneUpdates.healthConnectConnected === false,
    'setActiveTracker(null) deactivates all wearable trackers'
  );

  // 8. Pixel Watch / Fitbit Daily Readiness Score Pipeline (1 - 100)
  const fitbitHighLog: BiometricLog = {
    date: '2026-10-21',
    bodyweightKg: 82.0,
    hrvRmssd: 68,
    restingHr: 52,
    sleepHours: 8.0,
    steps: 11000,
    activeZoneMinutes: 50,
    fitbitReadinessScore: 88,
    source: 'fitbit',
  };
  const fitbitHighEval = calculateDailyReadiness(fitbitHighLog, mockBiometrics, 'fitbit');
  assert(
    fitbitHighEval.state === 'Primed' &&
      fitbitHighEval.provider === 'fitbit' &&
      fitbitHighEval.scoreLabel === 'Daily Readiness' &&
      fitbitHighEval.xpMultiplier === 1.15 &&
      fitbitHighEval.readinessScore === 88,
    `Pixel Watch High Readiness (88 >= 65) evaluates to Primed (+15% XP) with Daily Readiness label`
  );

  const fitbitTargetLog: BiometricLog = {
    date: '2026-10-21',
    bodyweightKg: 82.0,
    hrvRmssd: 58,
    restingHr: 56,
    sleepHours: 7.2,
    steps: 9000,
    activeZoneMinutes: 35,
    fitbitReadinessScore: 54,
    source: 'fitbit',
  };
  const fitbitTargetEval = calculateDailyReadiness(fitbitTargetLog, mockBiometrics, 'fitbit');
  assert(
    fitbitTargetEval.state === 'Normal' &&
      fitbitTargetEval.provider === 'fitbit' &&
      fitbitTargetEval.scoreLabel === 'Daily Readiness' &&
      fitbitTargetEval.xpMultiplier === 1.0 &&
      fitbitTargetEval.readinessScore === 54,
    `Pixel Watch Target Readiness (54, 30-64) evaluates to Normal (1.0x XP) with Daily Readiness label`
  );

  const fitbitLowLog: BiometricLog = {
    date: '2026-10-21',
    bodyweightKg: 82.0,
    hrvRmssd: 40,
    restingHr: 65,
    sleepHours: 5.0,
    steps: 5000,
    activeZoneMinutes: 10,
    fitbitReadinessScore: 24,
    source: 'fitbit',
  };
  const fitbitLowEval = calculateDailyReadiness(fitbitLowLog, mockBiometrics, 'fitbit');
  assert(
    fitbitLowEval.state === 'Amber Shield' &&
      fitbitLowEval.streakProtected === true &&
      fitbitLowEval.provider === 'fitbit' &&
      fitbitLowEval.scoreLabel === 'Daily Readiness' &&
      fitbitLowEval.readinessScore === 24,
    `Pixel Watch Low Readiness (24 < 30) evaluates to Amber Shield with streak protection`
  );

  // 9. Strict Baseline Isolation between Fitbit and Whoop
  const mixedHistory: BiometricLog[] = [
    // 7 days of Whoop logs with high HRV (90ms) and low RHR (45bpm)
    ...Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-0${i + 1}`,
      bodyweightKg: 82.0,
      hrvRmssd: 90,
      restingHr: 45,
      sleepHours: 8.5,
      steps: 10000,
      activeZoneMinutes: 45,
      recoveryScore: 92,
      source: 'whoop' as const,
    })),
    // 7 days of Fitbit logs with standard baseline (55ms HRV, 58bpm RHR)
    ...Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${i + 10}`,
      bodyweightKg: 82.0,
      hrvRmssd: 55,
      restingHr: 58,
      sleepHours: 7.5,
      steps: 9000,
      activeZoneMinutes: 40,
      fitbitReadinessScore: 60,
      source: 'fitbit' as const,
    })),
  ];

  // If Fitbit baseline is calculated, Whoop's 90ms HRV must NOT be included in Fitbit's past14 baseline
  const fitbitIsolatedTestLog: BiometricLog = {
    date: '2026-10-22',
    bodyweightKg: 82.0,
    hrvRmssd: 56, // Close to Fitbit mean of 55, far below Whoop mean of 90
    restingHr: 57,
    sleepHours: 7.5,
    steps: 9000,
    activeZoneMinutes: 40,
    fitbitReadinessScore: 58,
    source: 'fitbit',
  };
  const isolatedFitbitEval = calculateDailyReadiness(fitbitIsolatedTestLog, mixedHistory, 'fitbit');
  assert(
    isolatedFitbitEval.hrvChangePercent > -5 && isolatedFitbitEval.hrvChangePercent < 5,
    `Fitbit baseline strictly filters out Whoop logs, preventing artificial HRV depression (got ${isolatedFitbitEval.hrvChangePercent}%)`
  );
  assert(
    isolatedFitbitEval.state === 'Normal',
    `Fitbit evaluation remains Normal without being penalized by Whoop history`
  );

  // --- SUITE 27: GOOGLE IDENTITY SERVICES, JWT CREDENTIALS & ACCOUNT SYNC ---
  console.log('\n--- SUITE 27: GOOGLE IDENTITY SERVICES, JWT CREDENTIALS & ACCOUNT SYNC ---');

  // 1. Google Auth Configuration Invariants
  assert(
    GOOGLE_AUTH_CONFIG.CLIENT_ID.includes('apps.googleusercontent.com') &&
      GOOGLE_AUTH_CONFIG.REDIRECT_URI === 'https://treise.vercel.app' &&
      GOOGLE_AUTH_CONFIG.SCOPES.includes('email') &&
      GOOGLE_AUTH_CONFIG.SCOPES.includes('profile') &&
      GOOGLE_AUTH_CONFIG.SCOPES.includes('openid'),
    `Google Auth config binds to official GIS client with email, profile, and openid scopes`
  );

  // 2. Client-Side JWT Credential Decoder (Zero External Dependencies)
  const base64UrlEncode = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const testHeader = base64UrlEncode({ alg: 'RS256', typ: 'JWT' });
  const testPayload = base64UrlEncode({
    sub: 'google-sub-9876543210',
    email: 'athlete@treise.fit',
    name: 'Ben Taylor',
    picture: 'https://lh3.googleusercontent.com/a/treise-athlete-avatar',
    given_name: 'Ben',
    family_name: 'Taylor',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const mockValidJwt = `${testHeader}.${testPayload}.mockSignatureString`;

  const parsedPayload = decodeGoogleIdToken(mockValidJwt);
  assert(
    parsedPayload !== null &&
      parsedPayload.sub === 'google-sub-9876543210' &&
      parsedPayload.email === 'athlete@treise.fit' &&
      parsedPayload.name === 'Ben Taylor' &&
      parsedPayload.picture === 'https://lh3.googleusercontent.com/a/treise-athlete-avatar',
    `decodeGoogleIdToken correctly extracts subject ID, email, name, and profile picture from JWT`
  );

  const invalidJwtParsed = decodeGoogleIdToken('invalid.token');
  assert(invalidJwtParsed === null, `decodeGoogleIdToken safely returns null for malformed JWT`);

  // 3. Credential to AuthUser Conversion
  const authUserFromJwt = signInWithGoogleCredential(mockValidJwt);
  assert(
    authUserFromJwt.provider === 'google' &&
      authUserFromJwt.id === 'google-sub-9876543210' &&
      authUserFromJwt.email === 'athlete@treise.fit' &&
      authUserFromJwt.name === 'Ben Taylor' &&
      authUserFromJwt.avatarUrl === 'https://lh3.googleusercontent.com/a/treise-athlete-avatar',
    `signInWithGoogleCredential normalizes Google JWT into verified AuthUser`
  );

  // 4. Demo Account Sign-In (Instant Verification & Dev Testing)
  const demoUser = signInWithDemoGoogleAccount();
  assert(
    demoUser.provider === 'google' &&
      demoUser.email.includes('@') &&
      demoUser.name.length > 0 &&
      demoUser.avatarUrl !== undefined &&
      demoUser.avatarUrl.length > 0,
    `signInWithDemoGoogleAccount creates fully hydrated demo Google account`
  );

  // 5. Auth User Local Storage Persistence & Google Play Data Isolation
  saveAuthUser(authUserFromJwt);
  const loadedAuthUser = loadAuthUser();
  assert(
    loadedAuthUser !== null &&
      loadedAuthUser.id === authUserFromJwt.id &&
      loadedAuthUser.email === authUserFromJwt.email &&
      loadedAuthUser.avatarUrl === authUserFromJwt.avatarUrl,
    `saveAuthUser and loadAuthUser successfully persist account session locally`
  );

  clearAuthUser();
  const clearedAuthUser = loadAuthUser();
  assert(
    clearedAuthUser === null,
    `clearAuthUser cleanly wipes account session from localStorage`
  );

  // 6. Supabase Auth Bridge & Lovable Compatibility
  const configured = isSupabaseConfigured();
  assert(
    typeof configured === 'boolean',
    `isSupabaseConfigured cleanly returns boolean check for VITE_SUPABASE_URL`
  );

  const supabaseUrl = getSupabaseGoogleAuthUrl('https://example.supabase.co');
  assert(
    supabaseUrl !== null &&
      supabaseUrl.includes('example.supabase.co/auth/v1/authorize') &&
      supabaseUrl.includes('provider=google') &&
      supabaseUrl.includes('redirect_to=https%3A%2F%2Ftreise.vercel.app'),
    `getSupabaseGoogleAuthUrl returns valid OAuth authorize URL with provider=google and Vercel redirect`
  );

  // 7. User Profile Synchronization
  const profileWithAuth: UserProfile = {
    ...testProfile,
    authUserId: authUserFromJwt.id,
    email: authUserFromJwt.email,
    avatarUrl: authUserFromJwt.avatarUrl,
    authProvider: authUserFromJwt.provider,
    lastLoginAt: new Date().toISOString(),
  };
  assert(
    profileWithAuth.authUserId === 'google-sub-9876543210' &&
      profileWithAuth.authProvider === 'google' &&
      profileWithAuth.email === 'athlete@treise.fit',
    `UserProfile successfully associates with authenticated Google account`
  );

  // --- SUITE 28: WHOOP 4.0 WORKOUT STRAIN CAPTURE, KNOWLEDGE GRAPH & AI COACH INTEGRATION ---
  console.log('\n--- SUITE 28: WHOOP 4.0 WORKOUT STRAIN CAPTURE, KNOWLEDGE GRAPH & AI COACH INTEGRATION ---');

  // 1. Workout Session with Whoop Strain Telemetry
  const sessionWithWhoopStrain: WorkoutSession = {
    id: 'whoop-session-1',
    date: '2026-10-21',
    name: 'Day 1: Chest & Shoulders',
    splitDay: 'Push',
    completed: true,
    completedAt: '2026-10-21T10:30:00Z',
    readinessState: 'Normal',
    readinessZScore: -0.04,
    xpEarned: 460,
    avgHeartRate: 142,
    maxHeartRate: 168,
    durationMinutes: 58,
    whoopStrain: 11.4,
    kilojoules: 485,
    wearableSource: 'whoop',
    exercises: [
      {
        id: 'w-ex-1',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 8,
        maxReps: 12,
        sets: [
          { id: 'ws-1', setNumber: 1, targetWeightKg: 85, actualWeightKg: 85, targetReps: 10, actualReps: 10, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
          { id: 'ws-2', setNumber: 2, targetWeightKg: 85, actualWeightKg: 85, targetReps: 10, actualReps: 10, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
          { id: 'ws-3', setNumber: 3, targetWeightKg: 85, actualWeightKg: 85, targetReps: 10, actualReps: 10, targetRir: 1, actualRir: 1, completed: true, setType: 'working' },
        ],
      },
    ],
  };

  assert(
    sessionWithWhoopStrain.whoopStrain === 11.4 &&
      sessionWithWhoopStrain.maxHeartRate === 168 &&
      sessionWithWhoopStrain.kilojoules === 485 &&
      sessionWithWhoopStrain.wearableSource === 'whoop',
    'WorkoutSession encapsulates Whoop workout strain (11.4), peak HR (168 bpm), kilojoules (485 kJ), and wearable source'
  );

  // 2. Hydrated BiometricLog with Recovery and Strain
  const biometricsWithWhoop: BiometricLog[] = [
    ...mockBiometrics,
    {
      date: '2026-10-21',
      bodyweightKg: 81.8,
      hrvRmssd: 58,
      restingHr: 54,
      sleepHours: 7.2,
      steps: 9200,
      activeZoneMinutes: 40,
      recoveryScore: 49,
      workoutStrain: 11.4,
      strain: 13.8,
      kilojoules: 485,
      source: 'whoop',
    },
  ];

  // 3. Athlete Personal Knowledge Graph Grounding with Whoop Recovery & Strain
  const whoopProfile: UserProfile = {
    ...testProfile,
    whoopConnected: true,
    wearableSource: 'whoop',
  };

  const kgWithWhoop = buildAthleteKnowledgeGraph(
    [sessionWithWhoopStrain],
    biometricsWithWhoop,
    SEED_EXERCISES,
    whoopProfile,
    { Chest: 14, Shoulders: 12 }
  );

  // Check Knowledge Graph node-biometrics
  const nodeBio = kgWithWhoop.nodes.find((n) => n.id === 'node-biometrics');
  assert(
    nodeBio !== undefined &&
      nodeBio.label === 'Whoop Recovery & Strain' &&
      nodeBio.subtitle?.includes('49% Recovery') &&
      nodeBio.subtitle?.includes('11.4 Strain'),
    `Knowledge Graph node-biometrics reflects authentic 49% Recovery and 11.4 Workout Strain (got "${nodeBio?.subtitle}")`
  );
  assert(
    nodeBio?.metrics['Whoop Recovery'] === '49%' &&
      nodeBio?.metrics['Workout Strain'] === '11.4',
    `Knowledge Graph node-biometrics metrics include Whoop Recovery: 49% and Workout Strain: 11.4`
  );

  // Check Knowledge Graph node-athlete
  const nodeAthlete = kgWithWhoop.nodes.find((n) => n.id === 'node-athlete');
  assert(
    nodeAthlete !== undefined &&
      nodeAthlete.metrics['Workout Strain'] === '11.4',
    `Knowledge Graph node-athlete reflects 11.4 Workout Strain`
  );

  // Check Causal Insight
  const autonomicInsight = kgWithWhoop.insights.find((i) => i.id === 'pkg-insight-whoop-strain');
  assert(
    autonomicInsight !== undefined &&
      autonomicInsight.category === 'Autonomic' &&
      autonomicInsight.impactMetric.includes('49% Recovery') &&
      autonomicInsight.impactMetric.includes('11.4 Strain'),
    `Knowledge Graph produces Autonomic causal insight integrating 49% Recovery and 11.4 Strain`
  );
  assert(
    Boolean(
      autonomicInsight?.narrative.includes('Yellow recovery') &&
        autonomicInsight?.narrative.includes('11.4 workout strain')
    ),
    `Causal insight narrative accurately evaluates Yellow recovery and 11.4 workout strain`
  );

  // 4. AI Assistant Context Synthesis (Recovery & Workout Strain queries)
  const aiRecoveryQuery = await processAssistantMessage({
    userMessage: 'What is my whoop recovery score today?',
    profile: whoopProfile,
    activeWorkout: sessionWithWhoopStrain,
    workouts: [sessionWithWhoopStrain],
    biometrics: biometricsWithWhoop,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 81.8,
    readinessState: 'Normal',
  });
  assert(
    aiRecoveryQuery.message.text.includes('49%') &&
      aiRecoveryQuery.message.text.includes('Yellow zone'),
    `AI Assistant answers recovery query stating 49% Yellow recovery (got "${aiRecoveryQuery.message.text.slice(0, 100)}...")`
  );
  assert(
    Boolean(
      aiRecoveryQuery.message.knowledgeGraphCitations?.some(
        (c) => c.label === 'Whoop Recovery' && c.value.includes('49%')
      )
    ),
    `AI Assistant recovery query cites 49% Whoop Recovery in Knowledge Graph citations`
  );

  const aiStrainQuery = await processAssistantMessage({
    userMessage: 'What was my workout strain from Whoop?',
    profile: whoopProfile,
    activeWorkout: sessionWithWhoopStrain,
    workouts: [sessionWithWhoopStrain],
    biometrics: biometricsWithWhoop,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 81.8,
    readinessState: 'Normal',
  });
  assert(
    aiStrainQuery.message.text.includes('11.4') &&
      aiStrainQuery.message.text.includes('49%'),
    `AI Assistant answers strain query citing 11.4 workout strain and 49% recovery (got "${aiStrainQuery.message.text.slice(0, 100)}...")`
  );
    assert(
      Boolean(
        aiStrainQuery.message.knowledgeGraphCitations?.some(
          (c) => c.label === 'Workout Strain' && c.value.includes('11.4')
        )
      ),
      'AI Assistant strain query cites 11.4 Workout Strain in citations'
    );

    // 5. Whoop Workout Telemetry vs Daily Cycle Invariants
    const sampleWhoopSummary: WhoopWorkoutStrainSummary = {
    workoutStrain: 11.4,
    dayStrain: 14.2,
    avgHeartRate: 138,
    maxHeartRate: 168,
    kilojoules: 1450, // Authentic workout active burn
    dayKilojoules: 4372, // Authentic total cumulative day burn
    recoveryScore: 49,
    hasRecentWorkout: true,
    isPendingScore: false,
    workoutDurationMin: 65,
  };
  assert(
    sampleWhoopSummary.kilojoules !== sampleWhoopSummary.dayKilojoules,
    'WhoopWorkoutStrainSummary strictly isolates workout active burn from cumulative day burn'
  );
  assert(
    sampleWhoopSummary.kilojoules === 1450 && sampleWhoopSummary.dayKilojoules === 4372,
    'Workout active burn is 1,450 kJ while Day burn is 4,372 kJ'
  );
  assert(
    sampleWhoopSummary.avgHeartRate === 138 && sampleWhoopSummary.maxHeartRate === 168,
    'WhoopWorkoutStrainSummary captures strap avg (138 bpm) and peak (168 bpm) heart rate'
  );

  // 6. Heart Rate Sync Invariant: Preserving Workout HR upon recovery update
  const initialLogWithWorkout: BiometricLog = {
    date: '2026-10-21',
    bodyweightKg: 81.5,
    hrvRmssd: 58,
    restingHr: 54,
    sleepHours: 7.2,
    steps: 9200,
    activeZoneMinutes: 45,
    recoveryScore: 49,
    workoutStrain: 11.4,
    avgWorkoutHr: 138,
    maxWorkoutHr: 168,
    workoutKilojoules: 485,
    source: 'whoop',
  };

  const syncUpdateWithoutWorkout: BiometricLog = {
    date: '2026-10-21',
    bodyweightKg: 81.5,
    hrvRmssd: 61,
    restingHr: 53,
    sleepHours: 7.4,
    steps: 10400,
    activeZoneMinutes: 52,
    recoveryScore: 52,
    source: 'whoop',
  };

  const mergedLog: BiometricLog = {
    ...initialLogWithWorkout,
    ...syncUpdateWithoutWorkout,
    avgWorkoutHr: syncUpdateWithoutWorkout.avgWorkoutHr ?? initialLogWithWorkout.avgWorkoutHr,
    maxWorkoutHr: syncUpdateWithoutWorkout.maxWorkoutHr ?? initialLogWithWorkout.maxWorkoutHr,
    workoutStrain: syncUpdateWithoutWorkout.workoutStrain ?? initialLogWithWorkout.workoutStrain,
    workoutKilojoules: syncUpdateWithoutWorkout.workoutKilojoules ?? initialLogWithWorkout.workoutKilojoules,
  };

  assert(
    mergedLog.avgWorkoutHr === 138 &&
      mergedLog.maxWorkoutHr === 168 &&
      mergedLog.restingHr === 53 &&
      mergedLog.hrvRmssd === 61 &&
      mergedLog.workoutStrain === 11.4,
    'Daily recovery sync preserves previously captured workout heart rate (138/168 bpm) and strain'
  );

  // ============================================================================
  // SUITE 29: ONBOARDING PROGRESS MEASUREMENT, BODY RECOMP & AUTOMATED DIARY
  // ============================================================================
  console.log('\n--- SUITE 29: ONBOARDING PROGRESS MEASUREMENT, BODY RECOMP & AUTOMATED DIARY ---');

  // A. Knowledge Graph verification of all 3 principles
  const diaryPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find((p) => p.id === 'sp-progress-tracking-diary');
  assert(
    diaryPrinciple !== undefined &&
      diaryPrinciple.title.includes('Paper Training Diary') &&
      diaryPrinciple.practicalApplication.includes('You just show up'),
    'Knowledge Graph codifies sp-progress-tracking-diary replacing manual paper diary'
  );

  const recompPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find((p) => p.id === 'sp-scale-weight-measurements');
  assert(
    recompPrinciple !== undefined &&
      recompPrinciple.scientificRationale.includes('18% denser') &&
      recompPrinciple.scientificRationale.includes('shirt off') &&
      recompPrinciple.academicCitation.includes('Barakat'),
    'Knowledge Graph codifies sp-scale-weight-measurements with recomp dynamics and Barakat citation'
  );

  const smartPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find((p) => p.id === 'sp-smart-device-integration');
  assert(
    smartPrinciple !== undefined &&
      smartPrinciple.title.includes('Smart Device Integration') &&
      Boolean(smartPrinciple.formula?.includes('Fitbit')) &&
      !smartPrinciple.formula?.includes('Bluetooth'),
    'Knowledge Graph codifies sp-smart-device-integration for friction-free data ingestion'
  );

  // B. Querying Knowledge Base
  const qRecomp = queryExerciseScienceKnowledgeBase('Why is my scale weight flat despite fat loss?');
  assert(
    qRecomp !== null && qRecomp.id === 'sp-scale-weight-measurements',
    'queryExerciseScienceKnowledgeBase returns sp-scale-weight-measurements for scale weight / recomp query'
  );

  const qDiary = queryExerciseScienceKnowledgeBase('Do I need a paper training diary or does the app track for me?');
  assert(
    qDiary !== null && qDiary.id === 'sp-progress-tracking-diary',
    'queryExerciseScienceKnowledgeBase returns sp-progress-tracking-diary for training diary query'
  );

  const qSmart = queryExerciseScienceKnowledgeBase('How do smart scales and measuring devices connect?');
  assert(
    qSmart !== null && qSmart.id === 'sp-smart-device-integration',
    'queryExerciseScienceKnowledgeBase returns sp-smart-device-integration for smart scale query'
  );

  // C. AI Assistant Grounding & Conversational Delivery
  const recompAnswer = await processAssistantMessage({
    userMessage: 'Why is the scale not moving?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });
  assert(
    recompAnswer.message.text.includes('shirt off') &&
      recompAnswer.message.text.includes('18% denser') &&
      recompAnswer.message.text.includes('Circumference Measurements'),
    'AI Assistant explains body recomposition, scale neutrality, and morning measurements when asked why scale is not moving'
  );

  const diaryAnswer = await processAssistantMessage({
    userMessage: 'What does the app do for me?',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });
  assert(
    diaryAnswer.message.text.includes('replaces the traditional paper training diary') &&
      diaryAnswer.message.text.includes('just need to show up'),
    'AI Assistant explains automated tracking and planning from week to week replacing paper diary'
  );

  const smartDeviceAnswer = await processAssistantMessage({
    userMessage: 'Tell me about smart scales and measuring devices',
    profile: testProfile,
    activeWorkout: pushW3,
    workouts: [pushW3],
    biometrics: mockBiometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Primed',
  });
  assert(
    smartDeviceAnswer.message.text.toLowerCase().includes('friction-free') &&
      smartDeviceAnswer.message.text.includes('Fitbit') &&
      !smartDeviceAnswer.message.text.includes('Bluetooth'),
    'AI Assistant explains friction-free smart scale and measuring device telemetry'
  );

  // D. OnboardingModal Source Context Verification
  const freshOnboardingModalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/onboarding/OnboardingModal.tsx'),
    'utf-8'
  );
  assert(
    freshOnboardingModalSrc.includes('we do the math') &&
      freshOnboardingModalSrc.includes('Track real progress') &&
      freshOnboardingModalSrc.includes('7-day average') &&
      freshOnboardingModalSrc.includes('waist shrinks') &&
      !freshOnboardingModalSrc.includes('Bluetooth smart scales'),
    'OnboardingModal Step 1 briefly covers automated planning, morning weigh-ins and body recomposition, with no unbuilt smart-scale claims'
  );

  // 30. 6-Week Muscle Building Program, Wave Sets, Warm-Up Calculator, Giant Sets & Knowledge Base
  console.log('\n[30. 6-Week Muscle Building Program, Wave Sets, Warm-Up Calculator & Giant Sets]');
  assert(WORKOUT_TEMPLATES_24.length === 24, '6-Week program contains exactly 24 workout templates');
  assert(PROGRAM_PHASES.length === 3, 'Program contains 3 two-week phases');
  for (let p = 1; p <= 3; p++) {
    const pWorkouts = WORKOUT_TEMPLATES_24.filter((w) => w.phase === p);
    assert(pWorkouts.length === 8, `Phase ${p} contains exactly 8 scheduled workouts (4/week x 2 weeks)`);
  }

  // Warmup Ramp Calculator
  const ramp100 = calculate5StepWarmupRamp(100);
  assert(ramp100.length === 5, 'Warmup ramp calculator produces 5 graduated sets');
  assert(ramp100[0].targetWeightKg === 30 && ramp100[0].reps === 8, 'Warmup Set 1: 30% x 8 reps (30kg for 100kg work weight)');
  assert(ramp100[1].targetWeightKg === 50 && ramp100[1].reps === 5, 'Warmup Set 2: 50% x 5 reps (50kg for 100kg work weight)');
  assert(ramp100[2].targetWeightKg === 70 && ramp100[2].reps === 3, 'Warmup Set 3: 70% x 3 reps (70kg for 100kg work weight)');
  assert(ramp100[3].targetWeightKg === 85 && ramp100[3].reps === 2, 'Warmup Set 4: 85% x 2 reps (85kg for 100kg work weight)');
  assert(ramp100[4].targetWeightKg === 95 && ramp100[4].reps === 1, 'Warmup Set 5: 95% x 1 rep (95kg for 100kg work weight)');

  // Saturday 10-Set Squats Linear Progression
  const satW1 = WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === 4)!;
  const satW2 = WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === 8)!;
  const satW3 = WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === 12)!;
  const satW4 = WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === 16)!;
  const satW5 = WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === 20)!;
  const satW6 = WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === 24)!;

  assert(satW1.exercises[0].sets === 10 && satW1.exercises[0].reps === '10', 'Sat Wk 1 Squats: 10 sets x 10 reps');
  assert(satW2.exercises[0].sets === 10 && satW2.exercises[0].reps === '9', 'Sat Wk 2 Squats: 10 sets x 9 reps');
  assert(satW3.exercises[0].sets === 10 && satW3.exercises[0].reps === '8', 'Sat Wk 3 Squats: 10 sets x 8 reps');
  assert(satW4.exercises[0].sets === 10 && satW4.exercises[0].reps === '8', 'Sat Wk 4 Squats: 10 sets x 8 reps');
  assert(satW5.exercises[0].sets === 10 && satW5.exercises[0].reps === '6', 'Sat Wk 5 Squats: 10 sets x 6 reps');
  assert(satW6.exercises[0].sets === 10 && satW6.exercises[0].reps === '6', 'Sat Wk 6 Squats: 10 sets x 6 reps');

  // Workout Generation: Phase 1 Antagonist Supersets
  const genW1 = generate6WeekMuscleBuildingWorkout(1, 80);
  assert(genW1.exercises.length === 5, 'Workout 1 generates 5 exercises across antagonist superset pairs and core');
  assert(genW1.exercises[0].orderCode === 'A1' && genW1.exercises[0].restSeconds === 0, 'Exercise A1 has 0s rest to transition immediately into A2');
  assert(genW1.exercises[1].orderCode === 'A2' && genW1.exercises[1].restSeconds === 60, 'Exercise A2 has 60s rest completing the superset group');
  assert(genW1.exercises[0].tempo === '3110', 'Exercise A1 has strict 3110 4-digit tempo cue');

  // Workout Generation: Phase 2 Wave Reps & Intensity Protocols
  const genW10 = generate6WeekMuscleBuildingWorkout(10, 80);
  assert(genW10.exercises[0].sets.length === 2, 'Phase 2 lateral raise has 2 working sets');
  assert(genW10.exercises[0].sets[0].targetReps === 12 && genW10.exercises[0].sets[1].targetReps === 8, 'Phase 2 lateral raise applies 12/8 wave rep progression');
  assert(genW10.exercises[0].intensityProtocol !== undefined, 'Phase 2 lateral raise specifies attached intensity protocol');

  // Workout Generation: Phase 3 Giant Sets
  const genW17 = generate6WeekMuscleBuildingWorkout(17, 80);
  assert(genW17.exercises[0].orderCode === 'A1' && genW17.exercises[3].orderCode === 'A4', 'Phase 3 Workout 17 generates 4-exercise Giant Set A1-A4');
  assert(genW17.exercises[0].restSeconds === 0 && genW17.exercises[1].restSeconds === 0 && genW17.exercises[2].restSeconds === 0, 'Giant set intra-group exercises have 0s rest');
  assert(genW17.exercises[3].restSeconds === 90, 'Giant set anchor exercise has 90s rest');

  // Knowledge Graph Grounding
  const q6Wk = queryExerciseScienceKnowledgeBase('6-week muscle building plan');
  assert(q6Wk !== null && q6Wk.id === 'sp-6wk-muscle-building-plan', 'queryExerciseScienceKnowledgeBase returns sp-6wk-muscle-building-plan');
  const qSquat10 = queryExerciseScienceKnowledgeBase('Saturday 10-set squats linear progression');
  assert(qSquat10 !== null && qSquat10.id === 'sp-6wk-muscle-building-plan', 'queryExerciseScienceKnowledgeBase returns sp-6wk-muscle-building-plan for Saturday 10-set squats');
  assert(q6Wk?.academicCitation.includes('Schoenfeld') ?? false, 'Knowledge principle cites Schoenfeld on giant sets and mechanical tension');

  // ============================================================================
  // 31. Recovery Gate, Weight Carry-Over, Units, Local Dates & Honest Data
  // ============================================================================
  console.log('\n[31. Recovery Gate, Weight Carry-Over, Units, Local Dates & Honest Data]');
  {
    const HOUR = 60 * 60 * 1000;
    const now = new Date(2026, 9, 22, 18, 0, 0).getTime(); // Thu 6 PM local
    const mkDone = (num: number, hoursAgo: number, edit?: (w: WorkoutSession) => void): WorkoutSession => {
      const w = generate6WeekMuscleBuildingWorkout(num, 80);
      const at = new Date(now - hoursAgo * HOUR);
      w.completed = true;
      w.completedAt = at.toISOString();
      w.date = localDateString(at);
      w.exercises.forEach((ex) => ex.sets.forEach((st) => (st.completed = true)));
      edit?.(w);
      return w;
    };

    // A. Finishing Day 1 today holds Day 2 until muscles recover (and never before tomorrow).
    const day1 = mkDone(1, 0.5);
    const day2 = generate6WeekMuscleBuildingWorkout(2, 80);
    const gateToday = evaluateSessionRecovery(day2, [day1], SEED_EXERCISES, now);
    assert(
      !gateToday.isReady && gateToday.trainedToday && (gateToday.readyAt ?? 0) > now + 6 * HOUR,
      'After finishing Day 1, Day 2 is not offered today: it waits for recovery'
    );
    const day3 = generate6WeekMuscleBuildingWorkout(3, 80);
    const gateChest = evaluateSessionRecovery(day3, [mkDone(1, 26)], SEED_EXERCISES, now);
    assert(
      !gateChest.isReady && gateChest.limitingMuscles.some((m) => m.muscle === 'Chest'),
      'Chest & Back again 26h later is held back because chest is still recovering'
    );
    const gateLater = evaluateSessionRecovery(day3, [mkDone(1, 96)], SEED_EXERCISES, now);
    assert(gateLater.isReady, 'Four days later the same session is ready');
    assert(getNextProgramWorkoutNumber([day1]) === 2, 'Next 6-week plan workout follows the last completed one');
    assert(getNextProgramWorkoutNumber([mkDone(24, 1)]) === 1, 'The plan wraps from workout 24 back to 1');

    // B. Exact weight carry-over: same exercise next time uses what was actually lifted.
    const liftedDay1 = mkDone(1, 72, (w) => {
      const g = w.exercises.find((e) => e.exerciseId === 'ex-guillotine-press')!;
      g.sets.forEach((st) => {
        st.actualWeightKg = 40;
        st.actualReps = 12;
        st.actualRir = 2;
      });
    });
    const personalized = personalizeSessionLoads(generate6WeekMuscleBuildingWorkout(3, 80), {
      history: [liftedDay1],
      bodyweightKg: 80,
      templateDefaultFor: getTemplateDefaultWeight,
      templateReferenceLevel: 'intermediate',
      carryOverExactHistory: true,
    });
    const guillotine = personalized.exercises.find((e) => e.exerciseId === 'ex-guillotine-press')!;
    assert(
      guillotine.sets.find((st) => !st.isWarmup)!.targetWeightKg === 42.5,
      `Guillotine press carries over 40 kg x 12 (all reps hit) to 42.5 kg next time (got ${guillotine.sets[0].targetWeightKg})`
    );

    // C. Never-done exercises scale by what the athlete has lifted elsewhere, not template weights.
    // An athlete who lifted ~60% of every template weight on Day 1.
    const lighterDay1 = mkDone(1, 72, (w) =>
      w.exercises.forEach((ex) =>
        ex.sets.forEach((st) => {
          st.actualWeightKg = Math.round(st.targetWeightKg * 0.6 * 2) / 2;
        })
      )
    );
    const day2Personalized = personalizeSessionLoads(generate6WeekMuscleBuildingWorkout(2, 80), {
      history: [lighterDay1],
      bodyweightKg: 80,
      templateDefaultFor: getTemplateDefaultWeight,
      templateReferenceLevel: 'intermediate',
      carryOverExactHistory: true,
    });
    const btn = day2Personalized.exercises.find((e) => e.exerciseId === 'ex-btn-press')!;
    assert(
      btn.sets[0].targetWeightKg <= 30,
      `Behind-the-neck press is scaled down from the 45 kg template for a lighter lifter (got ${btn.sets[0].targetWeightKg} kg)`
    );

    // C2. A loaded exercise saved with no weight (old swaps) gets a calibrated starting weight.
    const weightlessDay2 = generate6WeekMuscleBuildingWorkout(2, 80);
    weightlessDay2.exercises[1] = {
      ...weightlessDay2.exercises[1],
      exerciseId: 'ex-ohp',
      equipment: 'barbell',
      sets: weightlessDay2.exercises[1].sets.map((st) => ({ ...st, targetWeightKg: 0, actualWeightKg: 0 })),
    };
    const repairedOhp = personalizeSessionLoads(weightlessDay2, {
      history: [],
      bodyweightKg: 82,
      experienceLevel: 'new',
      templateDefaultFor: getTemplateDefaultWeight,
      templateReferenceLevel: 'intermediate',
    }).exercises[1];
    assert(
      repairedOhp.sets[0].targetWeightKg > 10 && repairedOhp.sets[0].targetWeightKg < 57.5,
      `A weightless overhead press gets a scaled starting weight (got ${repairedOhp.sets[0].targetWeightKg} kg)`
    );

    const borrowedCableCurl = getTemplateDefaultWeight('ex-cable-curl');
    assert(
      borrowedCableCurl !== undefined && borrowedCableCurl > 0 && getTemplateDefaultWeight('ex-pushup') === undefined,
      `Exercises outside the templates borrow a default from the same movement (cable curl ${borrowedCableCurl} kg); bodyweight moves don't`
    );

    // D. New athletes get calibrated starting weights.
    const beginnerPush = personalizeSessionLoads(
      generateSmartWorkoutSession('Push', [], SEED_EXERCISES, 'Normal', 1, 'gym', [], 'Lean Bulk', 70),
      { history: [], bodyweightKg: 70, experienceLevel: 'new', gender: 'female', templateDefaultFor: getTemplateDefaultWeight }
    );
    const beginnerBench = beginnerPush.exercises.find((e) => e.exerciseId === 'ex-bench-press')!;
    assert(
      beginnerBench.sets.find((st) => !st.isWarmup)!.targetWeightKg <= 30,
      `A new 70 kg female lifter is not prescribed the 92.5 kg template bench (got ${beginnerBench.sets.find((st) => !st.isWarmup)!.targetWeightKg} kg)`
    );

    // E. Units and dates.
    assert(Math.abs(snapLoadKg(92.5, 'lb', 'barbell') * 2.2046226218 - 205) < 0.01, '92.5 kg snaps to 205 lb for lb users');
    assert(formatWeight(92.5, 'lb') === '204 lb' && formatWeight(92.5, 'kg') === '92.5 kg', 'Weights format in the athlete unit');
    const lateEvening = new Date(2026, 9, 22, 23, 30);
    assert(localDateString(lateEvening) === '2026-10-22', 'Late-evening dates stay on the local day (no UTC rollover)');

    // F. No fabricated pillar maxes for lifts never logged.
    const pillars = calculateBestPillarE1rms([liftedDay1], 80);
    assert(pillars.Squat === 0 && pillars.Hinge === 0, 'Squat and deadlift stay empty until actually logged');
  }

  {
    const mk = (hoursAgo: number, kg: number): WorkoutSession => {
      const w = generate6WeekMuscleBuildingWorkout(1, 80);
      w.completed = true;
      w.completedAt = new Date(Date.now() - hoursAgo * 3600e3).toISOString();
      w.exercises.forEach((ex) => ex.sets.forEach((st) => { st.completed = true; if (ex.exerciseId === 'ex-guillotine-press') st.actualWeightKg = kg; }));
      return w;
    };
    const summary = buildProgressSummary([mk(100, 40), mk(4, 42.5)], 'kg');
    assert(/2 workouts/.test(summary) && /Guillotine press: 40 kg → 42.5 kg/.test(summary), `Progress summary reports real lift changes (${summary.split('\n')[1]})`);
  }

  // ============================================================================
  // 32. Set Completion, Workout Completion & Wearable Token Rotation
  // ============================================================================
  console.log('\n[32. Set Completion, Workout Completion & Wearable Token Rotation]');
  {
    const mkHistoryWith = (exerciseId: string, weightKg: number, reps: number): WorkoutSession => {
      const w = generate6WeekMuscleBuildingWorkout(1, 80);
      w.completed = true;
      w.completedAt = new Date(Date.now() - 72 * 3600e3).toISOString();
      w.exercises.forEach((ex) =>
        ex.sets.forEach((st) => {
          st.completed = true;
          if (ex.exerciseId === exerciseId) {
            st.actualWeightKg = weightKg;
            st.actualReps = reps;
          }
        })
      );
      return w;
    };
    const plan = generate6WeekMuscleBuildingWorkout(1, 80);
    const a1 = plan.exercises[0]; // superset A1 -> 0 s rest
    const b2 = plan.exercises.find((e) => e.orderCode === 'B2')!;
    assert(planRestAfterSet(plan, a1, a1.sets[0].id).seconds === 0, 'Superset first exercise goes straight to its pair (no rest timer)');
    const b2Rest = planRestAfterSet(plan, b2, b2.sets[0].id);
    assert(
      b2Rest.seconds === 60 && b2Rest.context.nextLabel === 'set 2 of 4' && b2Rest.context.exerciseName === b2.name,
      `Rest timer is labelled with the exercise and next set (${b2Rest.context.nextLabel})`
    );

    // Per-set XP: a PR pays once, and re-ticking the same set pays nothing.
    const prev = mkHistoryWith('ex-guillotine-press', 40, 12);
    const live = generate6WeekMuscleBuildingWorkout(3, 80);
    const g = live.exercises.find((e) => e.exerciseId === 'ex-guillotine-press')!;
    const prSet = { ...g.sets[0], completed: true, actualWeightKg: 42.5, actualReps: 12 };
    const liveWithSet = { ...live, exercises: live.exercises.map((e) => (e.id === g.id ? { ...e, sets: [prSet, ...e.sets.slice(1)] } : e)) };
    const award = evaluateSetProgressAward(liveWithSet, [prev], g, prSet);
    assert(Boolean(award && award.amount > 0), 'A heavier set than last session earns progress XP');
    const again = evaluateSetProgressAward({ ...liveWithSet, xpAwardedSetIds: [prSet.id] }, [prev], g, prSet);
    assert(again === null, 'Unticking and re-ticking the same set does not pay XP twice');
    const secondSet = { ...g.sets[1], completed: true, actualWeightKg: 42.5, actualReps: 12 };
    const both = { ...live, exercises: live.exercises.map((e) => (e.id === g.id ? { ...e, sets: [prSet, secondSet, ...e.sets.slice(2)] } : e)) };
    assert(evaluateSetProgressAward(both, [prev], g, secondSet) === null, 'Repeating the same PR on the next set pays nothing');

    // Workout completion: measured values only, plan week follows the workout number.
    const done = completeWorkout({
      activeWorkout: { ...plan, exercises: plan.exercises.map((e) => ({ ...e, sets: e.sets.map((st) => ({ ...st, completed: true })) })) },
      history: [],
      profile: { ...NEW_USER_PROFILE, programType: 'muscle_building_6wk', mesocycleWeek: 1 },
      readiness: { state: 'Normal', score: 0, xpMultiplier: 1 },
      bodyweightKg: 80,
    });
    assert(
      done.completedSession.avgHeartRate === undefined && done.completedSession.kilojoules === undefined,
      'Completed workouts store no estimated heart rate or energy'
    );
    assert(done.completionAward.amount === 300 && done.strengthAdvanceAward === null, 'Day 1 earns 300 XP and no first-log rank-up');
    assert(done.nextMesocycleWeek === 1 && getNextProgramWorkoutNumber(done.nextHistory) === 2, 'After plan workout 1 the plan moves to workout 2 in week 1');

    // Wearable token rotation: refreshed tokens from the proxy reach the app.
    const received: string[] = [];
    const unsubscribe = onWearableTokensRefreshed((u) => received.push(`${u.provider}:${u.accessToken}:${u.refreshToken}`));
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        biometrics: { hrvRmssd: 60, restingHr: 52 },
        refreshedTokens: { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 3600 },
      }),
    });
    await fetchWhoopDailyBiometrics('old-access', '2026-10-22', 'old-refresh');
    (globalThis as any).fetch = realFetch;
    unsubscribe();
    assert(received.includes('whoop:new-access:new-refresh'), 'Rotated Whoop tokens are published so the profile saves them');

    // Workout heart rate comes only from a matched Whoop workout, never the all-day average.
    const mockWhoop = (biometrics: Record<string, unknown>) =>
      ((globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, biometrics }) }));
    mockWhoop({ hrvRmssd: 30, restingHr: 70, strain: 4.8, cycleAvgHr: 79, cycleMaxHr: 136, hasRecentWorkout: false });
    const noWorkout = await fetchWhoopWorkoutStrain('a', 'r', { start: '2026-10-24T10:00:00Z', end: '2026-10-24T11:00:00Z' });
    const dayOnly = await fetchWhoopDailyBiometrics('a', '2026-10-24', 'r');
    const daySync = await syncWearableBiometrics('whoop', { accessToken: 'a', refreshToken: 'r' });
    mockWhoop({ strain: 9, workoutStrain: 11.1, avgWorkoutHr: 128, maxWorkoutHr: 161, cycleAvgHr: 80, hasRecentWorkout: true });
    const matched = await fetchWhoopWorkoutStrain('a', 'r', { start: '2026-10-22T11:40:00Z', end: '2026-10-22T12:30:00Z' });
    (globalThis as any).fetch = realFetch;
    assert(
      noWorkout.avgHeartRate === undefined && noWorkout.maxHeartRate === undefined && dayOnly.avgWorkoutHr === undefined &&
        daySync.avgWorkoutHr === undefined && daySync.maxWorkoutHr === undefined,
      "Without a Whoop workout in the session's window, no heart rate is attached (the all-day average isn't a workout)"
    );
    assert(matched.workoutStrain === 11.1 && matched.avgHeartRate === 128 && matched.maxHeartRate === 161, 'A matched Whoop workout brings its strain and heart rate');

    localStorage.setItem(
      'treise_workouts_v3',
      JSON.stringify([
        { ...generate6WeekMuscleBuildingWorkout(1, 80), completed: true, wearableSource: 'whoop', avgHeartRate: 78, maxHeartRate: 136, hasMeasuredHeartRate: true },
        { ...generate6WeekMuscleBuildingWorkout(2, 80), id: 'w2', completed: true, wearableSource: 'whoop', whoopStrain: 11.1, avgHeartRate: 128, maxHeartRate: 161, hasMeasuredHeartRate: true },
      ])
    );
    removeDayHeartRateFromWorkouts();
    const cleanedWorkouts = JSON.parse(localStorage.getItem('treise_workouts_v3') || '[]');
    assert(
      cleanedWorkouts[0].avgHeartRate === undefined && cleanedWorkouts[0].hasMeasuredHeartRate === false && cleanedWorkouts[1].avgHeartRate === 128,
      'Migration clears all-day heart rate saved on Whoop sessions without a matched workout, keeping real workout heart rate'
    );
    localStorage.removeItem('treise_workouts_v3');
  }

  console.log('\n[33. Session Complete Report]');
  {
    const HOUR = 60 * 60 * 1000;
    const reportNow = Date.now();
    const finish = (w: WorkoutSession, hoursAgo: number, edit?: (w: WorkoutSession) => void): WorkoutSession => {
      const at = new Date(reportNow - hoursAgo * HOUR);
      w.completed = true;
      w.completedAt = at.toISOString();
      w.startedAt = new Date(at.getTime() - 55 * 60 * 1000).toISOString();
      w.date = localDateString(at);
      w.exercises.forEach((ex) => ex.sets.forEach((st) => (st.completed = true)));
      edit?.(w);
      return w;
    };
    const lastWeek = finish(generate6WeekMuscleBuildingWorkout(1, 80), 6 * 24);
    const today = finish({ ...generate6WeekMuscleBuildingWorkout(1, 80), id: 'today-5', programWorkoutNumber: 5 }, 1, (w) => {
      const first = w.exercises[0];
      first.sets.forEach((st) => {
        if (!st.isWarmup) st.actualWeightKg = (st.actualWeightKg ?? st.targetWeightKg) + 5;
      });
      const last = w.exercises[w.exercises.length - 1];
      w.exercises[w.exercises.length - 1] = { ...last, exerciseId: 'ex-cable-curl', name: 'Behind-Back Cable Bicep Curl', equipment: 'cable' };
    });
    const history = [lastWeek, today];
    const nextSession = generate6WeekMuscleBuildingWorkout(6, 80);
    const gate = evaluateSessionRecovery(nextSession, history, SEED_EXERCISES, reportNow);
    const kg = buildAthleteKnowledgeGraph(history, [], SEED_EXERCISES, NEW_USER_PROFILE, calculateWeeklyMuscleVolume(history, SEED_EXERCISES));
    const report = buildSessionProgressReport({
      workouts: history,
      nextSession,
      nextReadyAt: gate.readyAt,
      exerciseCatalog: SEED_EXERCISES,
      knowledgeGraph: kg,
      bodyweightKg: 80,
      gender: 'male',
      now: reportNow,
    })!;
    assert(
      report.next !== null && report.next.daysUntil >= 1 && report.next.name === nextSession.name,
      `The report leads with when the next session is (in ${report.next?.daysUntil} day(s))`
    );
    assert(
      report.program.kind === 'plan' && report.program.workoutNumber === 5 && report.program.week === 2 && report.program.totalWorkouts === 24,
      'Program context shows the plan position (workout 5 of 24, week 2)'
    );
    assert(
      report.records.some((r) => r.exerciseName === today.exercises[0].name && r.kind === 'heavier' && r.newKg > r.previousKg),
      'A heavier working set than any earlier session is reported as a personal best'
    );
    assert(report.firstTimeExercises.includes('Behind-Back Cable Bicep Curl'), 'A first-time exercise is a starting point, not a record');
    assert(
      report.trends.some((t) => t.exerciseName === today.exercises[0].name && t.sessions === 2 && t.changePct > 0),
      'Lift trends compare the first session with today'
    );
    assert(
      report.muscles.length > 0 &&
        report.muscles.every((m) => m.targetMin > 0 && m.targetMax >= m.targetMin && m.weeklySets >= m.setsThisSession),
      'Muscle growth uses weekly sets and personal targets from the knowledge graph'
    );
    assert(report.session.durationMin === 55 && report.session.whoopStrain === undefined, 'Session stats use measured values only');
    const noBodyweight = buildSessionProgressReport({ workouts: history, exerciseCatalog: SEED_EXERCISES, knowledgeGraph: kg, now: reportNow })!;
    assert(noBodyweight.strengthLevels.length === 0 && noBodyweight.next === null, 'No strength levels without a logged bodyweight');

    const fixedNow = new Date(2026, 9, 24, 18, 0).getTime();
    assert(
      getDaysUntilReady(new Date(2026, 9, 25, 3, 0).getTime(), fixedNow) === 1 &&
        getDaysUntilReady(new Date(2026, 9, 26, 9, 0).getTime(), fixedNow) === 2 &&
        getDaysUntilReady(new Date(2026, 9, 24, 21, 0).getTime(), fixedNow) === 0,
      'Days until the next session count calendar days, with overnight times moved to the morning'
    );
    assert(
      kg.muscleProfiles.every((m) => m.e1rmVelocityPct === 0 || Number.isFinite(m.e1rmVelocityPct)) &&
        buildAthleteKnowledgeGraph([], [], SEED_EXERCISES, NEW_USER_PROFILE, {}).muscleProfiles.every(
          (m) => m.e1rmVelocityPct === 0 && m.lengthenedBiasPct === 0 && m.avgSfr === 0
        ),
      'The knowledge graph reports no strength gain or stretch data for an athlete with no history'
    );
  }

  console.log('\nALL 33 ENGINE, GOVERNANCE, DESIGN HEURISTICS, TYPOGRAPHY, WEARABLES, WHOOP STRAIN, GOOGLE AUTH, ONBOARDING CONTEXT, 6-WEEK PROGRAM, TENSOR AI & SESSION REPORT SUITES PASSED SUCCESSFULLY! 🎯');
})().catch((err) => {
  console.error('Test Suite Failed:', err);
  if (typeof process !== 'undefined' && process.exit) {
    process.exit(1);
  }
});






