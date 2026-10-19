import {
  calculateE1RM,
  calculateEffectiveLoad,
  calculateRepsNeededForTargetE1RM,
  calculateWeightNeededForTargetE1RM,
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
import { BiometricLog, ExerciseSession } from '../types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
  console.log(`✓ ${msg}`);
}

console.log('--- TEST SUITE: HEADSTRONG EXERCISE SCIENCE ENGINE ---');

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
import {
  translateWeightBetweenImplements,
  formatImplementWeightLabel,
} from '../e1rm';

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
} from '../../services/storage';
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
} from '../../services/fitbitService';

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
  `Competitor comparison matrix benchmarks HeadStrong against RP Hypertrophy, Fitbod, Hevy/Strong, and Whoop across ${COMPETITOR_COMPARISON_MATRIX.length} core capabilities`
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
declare const process: { cwd: () => string };
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
    trainTabSrc.includes('Travel'),
  `TrainTab has 1 single canonical Equipment Location bar (Full Gym | At Home | Travel) with no duplicate inline gear/split drawers`
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
  onboardingModalSrc.includes('Welcome to HeadStrong') &&
    onboardingModalSrc.includes('Asynchronous Hypertrophy Queue') &&
    onboardingModalSrc.includes('Guaranteed Overload') &&
    onboardingModalSrc.includes('Adapts Across Any Gear') &&
    onboardingModalSrc.includes('Choose your training split') &&
    onboardingModalSrc.includes('What is your main goal right now?') &&
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
const cutBenchSets = cutW5.exercises.find((e) => e.exerciseId === 'ex-bench-press')?.sets.length;
assert(
  cutLateralRaiseSets === 3 && cutBenchSets === 2,
  `Cut / Recomp caps volume to ~85% (3 sets isolation, 2 sets compound) to protect systemic recovery in a caloric deficit`
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

console.log('\nALL 18 ENGINE, GOVERNANCE, DESIGN HEURISTICS & EXERCISE SCIENCE SUITES PASSED SUCCESSFULLY! 🎯');






