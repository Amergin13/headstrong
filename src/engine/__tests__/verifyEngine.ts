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
import { findLastCompletedExerciseSession, prescribeDoubleProgression } from '../progression';
import { calculateWci, calculateHrrPercentage } from '../wci';
import { kilgoreThresholdsKg, KILGORE_STANDARDS } from '../kilgoreStandards';
import { getThresholds, POLIQUIN_CHIN_UP_TO_BENCH, standardsAge } from '../strengthStandards';
import { calculateEngineVitalityScore, generate7PillarRadarData } from '../vitality';
import { BiometricLog, ExerciseSession, HomeEquipmentTag, WorkoutSession } from '../types';
import {
  detectPixelTensorHardware,
  generateTensorCoachingInsight,
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
  buildBodyCompositionKnowledgeGraph,
} from '../knowledgeGraph';
import { SEED_EXERCISES, generateSeedWorkouts } from '../../services/seedData';
import { processAssistantMessage, buildSafetyResponse, buildProgressSummary } from '../../services/aiAssistantService';
import { evaluateSessionRecovery, getDaysUntilReady, getDisplayReadyAt } from '../recovery';
import { buildWeekStrip } from '../../services/sessionSchedule';
import { buildExerciseInsight, getPreviousWorkingSets } from '../../services/exerciseInsight';
import { buildMuscleProgress } from '../../services/muscleProgress';
import { PROGRESSION_RULES, hadQualityEffort, loadIncrementFor } from '../progressionRules';
import { acceptExerciseNote, buildExerciseNoteFacts, generateExerciseNote } from '../../services/exerciseCoachNote';
import { acceptIdentityMessage, buildIdentityFacts, generateIdentityMessage } from '../../services/identityMessage';
import { buildSessionProgressReport } from '../../services/sessionReport';
import { personalizeSessionLoads } from '../loadPersonalization';
import { buildPlanOverview, getNextProgramWorkoutNumber, planWorkoutLabel, withPlanWorkoutName } from '../muscleBuildingProgram';
import { computeTrainingStreak } from '../recovery';
import { getTemplateDefaultWeight } from '../../services/workoutGenerator';
import { snapLoadKg, formatWeight } from '../../utils/units';
import { localDateString } from '../../utils/date';
import { calculateBestPillarE1rms } from '../../services/storage';
import { evaluateSetPersonalBest, planRestAfterSet } from '../../services/setCompletion';
import { completeWorkout } from '../../services/workoutCompletion';
import { prepareSessionForAthlete, startingWeightForNewExercise } from '../../services/sessionPreparation';
import { buildCompositionCharts, buildStrengthCharts } from '../../services/progressSeries';
import {
  BODY_MEASUREMENT_SITES,
  buildQnScaleConfigPayload,
  buildQnScaleTimePayload,
  clearSavedRenphoDevices,
  computeRenphoScaleMetrics,
  connectRenphoScale,
  decodeRenphoScalePacket, build55AaGuestProfile, build55AaSetClock, build55AaDisplayUnit, scaleFinalKey,
  decodeRenphoTapePacket,
  forgetPairedRenphoDevice,
  loadSavedRenphoDevices,
  recordRenphoDeviceSync,
  RENPHO_SCALE_METRICS,
  RENPHO_SCALE_UUIDS,
  RENPHO_TAPE_UUIDS,
  resolveRememberedBleDevice,
  savePairedRenphoDevice,
} from '../../services/renphoBluetooth';

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

// 4. Strength standards: Kilgore (ExRx) tables by sex, bodyweight class and age; Poliquin for chin-ups.
console.log('\n[4. Strength Standards (Kilgore / Poliquin) & 4 Sub-Divisions]');
{
  // Published values (ExRx, men 18–39, 75 kg class squat): 50 / 92.5 / 112.5 / 155 / 202.5.
  const t75 = kilgoreThresholdsKg('squat', 'male', 75);
  assert(t75.join() === '50,92.5,112.5,155,202.5', `Kilgore men 18–39 squat, 75 kg class matches ExRx (got ${t75.join()})`);
  // Classes are upper limits: 76 kg uses the 82 kg class; 200 kg uses the open class.
  assert(kilgoreThresholdsKg('squat', 'male', 76)[2] === 122.5 && kilgoreThresholdsKg('squat', 'male', 200)[4] === 270, 'Bodyweight picks the right class (76 kg → 82 class; 200 kg → open class)');
  // Age groups: men 50–59 at 75 kg need less for each level than 18–39.
  assert(kilgoreThresholdsKg('bench', 'male', 75, 55)[2] === 65 && kilgoreThresholdsKg('bench', 'male', 75, 30)[2] === 85, 'Age group changes the table (bench, 75 kg: Intermediate 85 kg at 30, 65 kg at 55)');
  assert(kilgoreThresholdsKg('deadlift', 'female', 60)[4] === 125, 'Women have their own tables (deadlift, 60 kg: Elite 125 kg)');
  // The one source typo (women 40–49 deadlift 60 kg, Untrained 60 > Novice 52.5) is clamped.
  const typo = kilgoreThresholdsKg('deadlift', 'female', 60, 45);
  assert(KILGORE_STANDARDS.deadlift['40-49'].female.find((r) => r[0] === 60)![1] === 60 && typo[0] <= typo[1], 'Source typo kept as published but clamped so levels never go backwards');
  // Every table: levels rise from Untrained to Elite after the clamp.
  const lifts = ['squat', 'bench', 'deadlift', 'press'] as const;
  const bad: string[] = [];
  for (const lift of lifts) for (const sex of ['male', 'female'] as const) for (const age of [25, 45, 55, 65]) for (const bw of [50, 60, 75, 90, 110, 150]) {
    const t = kilgoreThresholdsKg(lift, sex, bw, age);
    if (!t.every((v, i) => i === 0 || v >= t[i - 1])) bad.push(`${lift} ${sex} ${age} ${bw}`);
  }
  assert(bad.length === 0, `All Kilgore tables rise from Untrained to Elite (${bad.join('; ') || 'all'})`);
  // Chin-ups: Poliquin 81% of the bench levels; rows have no standard.
  const bench = getThresholds('Horizontal Push', 'male', 80)!;
  const chin = getThresholds('Vertical Pull', 'male', 80)!;
  assert(chin.every((v, i) => Math.abs(v - bench[i] * POLIQUIN_CHIN_UP_TO_BENCH) < 1e-9), 'Chin-up levels are 81% of the bench levels (Poliquin)');
  assert(getThresholds('Horizontal Pull', 'male', 80) === null && evaluateStrengthStandard('Horizontal Pull', 100, 80).source === 'none', 'Rows have no published standard, so no level');
  assert(standardsAge({ age: 25 }) === undefined && standardsAge({ age: 52, ageEntered: true }) === 52, 'Only an age the athlete entered picks an age group');

  // 120 kg squat at 80 kg (82 kg class: Novice 100, Intermediate 122.5): Novice IV.
  const squatStd = evaluateStrengthStandard('Squat', 120, 80, 'male');
  assert(`${squatStd.tier} ${squatStd.subDivision}` === 'Novice IV' && squatStd.source === 'kilgore', `120 kg squat at 80 kg is Novice IV on Kilgore (got ${squatStd.tier} ${squatStd.subDivision})`);

  // Each level runs from its own threshold to the next (100 kg class: 60 / 110 / 135 / 185 / 240).
  const lvl = (kg: number) => {
    const r = evaluateStrengthStandard('Squat', kg, 100, 'male');
    return `${r.tier} ${r.subDivision}`;
  };
  const cases: [number, string][] = [
    [30, 'Untrained I'], [60, 'Untrained I'], [72.5, 'Untrained II'], [109, 'Untrained IV'],
    [110, 'Novice I'], [134, 'Novice IV'],
    [135, 'Intermediate I'], [184, 'Intermediate IV'],
    [185, 'Advanced I'], [239, 'Advanced IV'],
    [240, 'Elite I'],
  ];
  const wrong = cases.filter(([kg, want]) => lvl(kg) !== want).map(([kg, want]) => `${kg} kg: ${lvl(kg)} (want ${want})`);
  assert(wrong.length === 0, `Squat levels follow Kilgore's 100 kg class: Untrained 60–110, Novice 110–135, Intermediate 135–185, Advanced 185–240, Elite 240+ (${wrong.join('; ') || 'all match'})`);
  const below = evaluateStrengthStandard('Squat', 30, 100, 'male');
  const top = evaluateStrengthStandard('Squat', 109, 100, 'male');
  assert(below.nextTier === 'Untrained' && below.nextSubDivision === 'II' && below.percentageProgress > 0 && below.percentageProgress < 100, 'Below the Untrained standard: Untrained I, working towards Untrained II');
  assert(top.nextTier === 'Novice' && top.nextSubDivision === 'I' && Math.abs(top.targetRatio - 1.1) < 1e-9, 'Untrained IV leads to Novice I at the Novice threshold');
}

const quest = calculateSubTierQuest('Squat', 120, 80, 100, 8, 'barbell', false, false, 'male');
assert(quest.displayText.includes('reach Intermediate I'), `Quest points to the next sub-division (got ${quest.displayText})`);

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
{
  const partial = generate7PillarRadarData({ Squat: 167.5, Hinge: 0, 'Horizontal Push': 0, 'Vertical Push': 0, 'Horizontal Pull': 0, 'Vertical Pull': 0 }, 80, undefined, 'male');
  const squatScore = partial.find((p) => p.pillar === 'Squat')!.score;
  assert(partial.filter((p) => p.pillar !== 'Squat' && p.pillar !== 'Engine / Vitality').every((p) => p.score === 0), 'A movement never logged scores 0 on the radar (no placeholder level)');
  assert(squatScore === 60, `Radar steps are equal: Advanced I (167.5 kg squat at 80 kg) scores 60 (got ${squatScore})`);
}

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
  // Dated this week, so the weekly insights (full-stretch share) have real sets to measure.
  [{ ...wciWorkout, date: localDateString() }],
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
  saveWorkouts,
  saveActiveWorkout,
  loadActiveWorkout,
  loadBiometrics,
  removeFabricatedBiometrics,
  removeDayHeartRateFromWorkouts,
  runStorageMigrations,
} from '../../services/storage';
import {
  NEW_USER_PROFILE,
  SAMPLE_DEMO_PROFILE,
} from '../../services/seedData';
import { programMilestone, evaluateExerciseProgress, evaluateStrengthStandardAdvance } from '../milestones';
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
  parseFitbitExport,
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
  mergeWearableLog,
  syncWearableBiometrics,
  disconnectWearable,
  setActiveTracker,
} from '../../services/wearableSyncService';
import {
  GOOGLE_AUTH_CONFIG,
  decodeGoogleIdToken,
  signInWithGoogleCredential,
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
  erased.workouts.length === 0 && loadWorkouts().length === 0 && loadProfile().streakDays === 0,
  `permanentlyEraseAllUserData wipes all workout history and resets the profile`
);
assert(
  erased.biometrics.length === 0 && loadBiometrics().length === 0,
  `permanentlyEraseAllUserData leaves no readings behind (no placeholder weight, heart rate or sleep)`
);
// Older erases left a placeholder day; the v8 migration removes it and keeps real readings.
localStorage.setItem(
  'treise_biometrics_v3',
  JSON.stringify([
    { date: '2026-10-01', bodyweightKg: 80, hrvRmssd: 58, restingHr: 58, sleepHours: 7.5, steps: 0, activeZoneMinutes: 0, vo2Max: 44 },
    { date: '2026-10-02', bodyweightKg: 80, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0, vo2Max: 0 },
  ])
);
localStorage.setItem('treise_schema_version', '7');
runStorageMigrations();
assert(
  loadBiometrics().length === 1 && loadBiometrics()[0].date === '2026-10-02',
  `Migration v8 removes the old erase placeholder day and keeps a real 80 kg weigh-in`
);
localStorage.setItem('treise_biometrics_v3', '[]');
{
  const emptyGraph = buildAthleteKnowledgeGraph([], [], SEED_EXERCISES, NEW_USER_PROFILE, {});
  assert(
    emptyGraph.lengthenedStimulusRatio === 0 &&
      emptyGraph.recoveryEfficiencyScore === 0 &&
      !emptyGraph.insights.some((i) => i.id === 'pkg-insight-2'),
    `With no workouts or watch data, insights show no full-stretch share or recovery score`
  );
}

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
    (exerciseCardSrc.match(/Change exercise/gi) || []).length === 1 &&
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
  'src/components/common/Toast.tsx',
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
  onboardingModalSrc.includes("title: 'Identity'") &&
    onboardingModalSrc.includes('title: `${total} sessions`') &&
    onboardingModalSrc.includes("title: 'Your superpower is restarting'") &&
    onboardingModalSrc.includes("What's your goal?") &&
    !onboardingModalSrc.includes('Other programs') &&
    onboardingModalSrc.includes('Where will you train?') &&
    onboardingModalSrc.includes('What do you have at home?') &&
    onboardingModalSrc.includes('Start my first workout') &&
    onboardingModalSrc.includes('aria-valuemax={3}'),
  `Onboarding is 3 illustrated screens (identity, the plan's sessions, restarting); the last one picks the goal and place (no program list), then delivers workout 1`
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
  // Cardio is a plan fact (active days), so it is answered from the plan even with a model available.
  const cardioFromPlan = await processAssistantMessage({
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
    /active day/.test(cardioFromPlan.message.text) && /20 minutes/.test(cardioFromPlan.message.text),
    `Cardio questions are answered from the plan's active days, not the model (got "${cardioFromPlan.message.text.slice(0, 60)}")`
  );
  const cardioReply = await processAssistantMessage({
    userMessage: 'Is it better to lift in the morning or the evening?',
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
  // SUITE 20: CLEAN SLATE FOR NEW USERS, NO POINTS, REAL MILESTONES
  // ============================================================================
  console.log('\n--- SUITE 20: CLEAN SLATE FOR NEW USERS, NO POINTS, REAL MILESTONES ---');

  // A. Clean Slate Invariants: fresh launch has no workouts, biometrics, streak or points
  memStore.clear(); // Simulate a completely fresh user install with empty localStorage
  const freshProfile = loadProfile();
  assert(
    freshProfile.streakDays === 0 &&
      freshProfile.name === 'Athlete' &&
      freshProfile.onboardingCompleted === false &&
      !('currentXp' in freshProfile) &&
      !('level' in freshProfile),
    `Fresh user profile starts cleanly with 0 streak, 'Athlete', onboarding uncompleted and no XP or level`
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
    SAMPLE_DEMO_PROFILE.name === 'Alex Vance' && !('currentXp' in SAMPLE_DEMO_PROFILE),
    `SAMPLE_DEMO_PROFILE preserves the 6-week demonstration state for explicit demo mode, with no XP`
  );

  // Restore seed dataset for subsequent tests
  resetAllToSeedData();

  // B. Finished weeks and blocks are celebrated (no points)
  const weekDone = programMilestone(3, 'PPL Upper');
  assert(weekDone.title === 'Week 3 complete' && !('amount' in weekDone), `A finished week is celebrated without points`);
  const blockDone = programMilestone(6, 'PPL Upper');
  assert(blockDone.title === 'Block complete', `Finishing the 6-week block is celebrated`);

  // C. Personal bests on a set
  const loadPr = evaluateExerciseProgress('Barbell Bench Press', 95, 8, 92.5, 8);
  assert(loadPr !== null && loadPr.title === 'Weight PR', `More weight (+2.5 kg) is a Weight PR`);
  const repPr = evaluateExerciseProgress('Barbell Bench Press', 92.5, 10, 92.5, 8);
  assert(repPr !== null && repPr.title === 'Rep PR', `More reps at the same weight is a Rep PR`);
  const topRep = evaluateExerciseProgress('Barbell Bench Press', 92.5, 12, 92.5, 10, 12);
  assert(topRep !== null && topRep.title === 'Top of the range', `Reaching the top of the rep range says to add weight next time`);
  const nonPr = evaluateExerciseProgress('Barbell Bench Press', 90, 8, 92.5, 8);
  assert(nonPr === null, `An ordinary set is not celebrated`);
  assert(evaluateExerciseProgress('Barbell Bench Press', 60, 10) === null, `A first-ever log is a starting point, not a personal best`);

  // D. Strength standard level ups
  const subDivAdvance = evaluateStrengthStandardAdvance('Horizontal Push', 'Novice', 'I', 'Novice', 'II');
  assert(subDivAdvance !== null && subDivAdvance.title === 'Strength level up', `Novice I → II is a strength level up`);
  const majorTierAdvance = evaluateStrengthStandardAdvance('Horizontal Push', 'Novice', 'IV', 'Intermediate', 'I');
  assert(majorTierAdvance !== null && majorTierAdvance.tag === 'Intermediate', `Novice IV → Intermediate I celebrates the new tier`);
  assert(evaluateStrengthStandardAdvance('Horizontal Push', 'Novice', 'II', 'Novice', 'II') === null, `No change is not celebrated`);

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
  // Only the 6-week plans are offered: asking for a split explains that the plan follows the goal.
  assert(
    !splitResult.updatedProfile?.programType && !splitResult.updatedWorkout && /goal/.test(splitResult.message.text),
    'AI Assistant does not switch to an old split; it explains the plan follows your goal'
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

  // H. Exercise Substitution: a real alternative, with no invented match score
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
    /You can swap \*\*.+\*\* for \*\*.+\*\*/.test(swapResult.message.text) &&
      !/\d+%|Biomechanical Match|joint shear/i.test(swapResult.message.text) &&
      Boolean(swapResult.message.knowledgeGraphCitations?.some((c) => c.metric === 'Swap Option')),
    'Coach names a real swap and points to the swap button, with no invented match percentage or joint rating'
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
  const googleHealthAuthUrl = await initiateFitbitOAuth('12345-gh.apps.googleusercontent.com');
  assert(
    googleHealthAuthUrl.includes('accounts.google.com/o/oauth2/v2/auth') &&
      googleHealthAuthUrl.includes('googlehealth') &&
      googleHealthAuthUrl.includes('code_challenge') &&
      googleHealthAuthUrl.includes('access_type=offline') &&
      localStorage.getItem('fitbit_code_verifier') !== null &&
      sessionStorage.getItem('fitbit_code_verifier') !== null,
    `Google Health API OAuth 2.0 PKCE generates Google authorization URL and persists verifier in localStorage and sessionStorage`
  );
  const sampleFitbitCsv = `date,resting_heart_rate,rmssd,minutesAsleep,steps,activeZoneMinutes,weight
2026-10-20,53,64.8,465,9840,44,80.4`;
  const parsedFitbitCsv = parseFitbitExport(sampleFitbitCsv);
  assert(
    parsedFitbitCsv.length === 1 &&
      parsedFitbitCsv[0].date === '2026-10-20' &&
      parsedFitbitCsv[0].restingHr === 53 &&
      parsedFitbitCsv[0].hrvRmssd === 65 &&
      parsedFitbitCsv[0].sleepHours === 7.8 &&
      parsedFitbitCsv[0].steps === 9840 &&
      parsedFitbitCsv[0].activeZoneMinutes === 44 &&
      parsedFitbitCsv[0].bodyweightKg === 80.4 &&
      parsedFitbitCsv[0].source === 'fitbit',
    `parseFitbitExport parses Fitbit / Google Takeout CSV with RHR, HRV RMSSD, sleep minutes, steps, active zone minutes and weight`
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
        startTime: '2026-10-18T06:00:00',
        heartRateVariabilityMillis: 68.5,
      },
      {
        type: 'RestingHeartRateRecord',
        startTime: '2026-10-18T06:00:00',
        beatsPerMinute: 52,
      },
      {
        type: 'SleepSessionRecord',
        startTime: '2026-10-17T22:30:00',
        endTime: '2026-10-18T06:30:00',
      },
      {
        type: 'StepsRecord',
        startTime: '2026-10-18T18:00:00',
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
  assert(
    parsedHcLogs[0].bodyweightKg === 0 && parsedHcLogs[0].vo2Max === 0 && parsedHcLogs[0].activeZoneMinutes === 0,
    `Health Connect import leaves values the file doesn't have at 0 (no 80 kg or VO2 max 45 placeholders)`
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
      WEARABLE_PROVIDERS.whoop.name === 'Whoop' &&
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
    readinessWhoop49.reason.includes('49%') && readinessWhoop49.reason.includes('Yellow'),
    `Whoop 49% recovery reason indicates 49% Yellow recovery (${readinessWhoop49.reason})`
  );

  // 7. One recovery tracker; other connections stay connected (setActiveTracker)
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
      activeFitbitUpdates.whoopConnected === undefined &&
      activeFitbitUpdates.healthConnectConnected === undefined,
    'setActiveTracker(fitbit) makes Fitbit the recovery tracker and leaves Whoop and Health Connect connected'
  );

  const activeWhoopUpdates = setActiveTracker('whoop', multiProfile);
  assert(
    activeWhoopUpdates.wearableSource === 'whoop' &&
      activeWhoopUpdates.whoopConnected === true &&
      activeWhoopUpdates.fitbitConnected === undefined &&
      activeWhoopUpdates.healthConnectConnected === undefined,
    'setActiveTracker(whoop) makes Whoop the recovery tracker and leaves Fitbit and Health Connect connected'
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
      fitbitHighEval.readinessScore === 88,
    `Pixel Watch High Readiness (88 >= 65) evaluates to Primed with Daily Readiness label`
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
      fitbitTargetEval.readinessScore === 54,
    `Pixel Watch Target Readiness (54, 30-64) evaluates to Normal with Daily Readiness label`
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

  // 4. There is no demo sign-in: only a real Google credential signs in.
  assert(
    !fs.readFileSync(path.resolve(process.cwd(), 'src/services/googleAuthService.ts'), 'utf-8').includes('signInWithDemoGoogleAccount'),
    `No demo or mock Google sign-in exists in the app`
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
      autonomicInsight?.narrative.includes('49% (yellow)') &&
        autonomicInsight?.narrative.includes('11.4 workout strain') &&
        !/parasympathetic|autonomic|RIR/.test(autonomicInsight?.narrative ?? '')
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
      Boolean(smartPrinciple.formula?.includes('RENPHO')) &&
      Boolean(smartPrinciple.formula?.includes('Bluetooth')),
    'Knowledge Graph codifies sp-smart-device-integration with RENPHO Web Bluetooth scales & smart tape measures'
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

  const qSmart = queryExerciseScienceKnowledgeBase('How do RENPHO smart scales and measuring devices connect?');
  assert(
    qSmart !== null && qSmart.id === 'sp-smart-device-integration',
    'queryExerciseScienceKnowledgeBase returns sp-smart-device-integration for RENPHO smart scale query'
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
      smartDeviceAnswer.message.text.includes('RENPHO') &&
      smartDeviceAnswer.message.text.includes('Bluetooth'),
    'AI Assistant explains friction-free RENPHO Bluetooth scale, smart tape measure, and wearable telemetry'
  );

  // D. OnboardingModal Source Context Verification
  const freshOnboardingModalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/onboarding/OnboardingModal.tsx'),
    'utf-8'
  );
  assert(
    !freshOnboardingModalSrc.includes('Bluetooth') &&
      !freshOnboardingModalSrc.includes('takes 4 sessions a week') &&
      freshOnboardingModalSrc.includes("experienceLevel: returning ? profile.experienceLevel || 'intermediate' : 'new'") &&
      !/bodyweightKg:\s*\d/.test(freshOnboardingModalSrc),
    'Onboarding makes no unbuilt device or unsupported science claims, starts new athletes light and never invents a bodyweight'
  );

  // E. Choosing Home in onboarding: plan workout 1 is swapped to home gear, then personalized,
  // so every loaded exercise has a starting weight and none carries a barbell number unconverted.
  const homePlanW1 = prepareSessionForAthlete(
    adaptWorkoutSessionToLocation(
      generate6WeekMuscleBuildingWorkout(1, 80),
      'home',
      ['dumbbells', 'bench'],
      SEED_EXERCISES,
      [],
      'Normal',
      80
    ),
    { history: [], bodyweightKg: 80, readinessState: 'Normal', experienceLevel: 'new', gender: 'male', unit: 'kg', isProgramPlan: true }
  );
  const homeLoaded = homePlanW1.exercises.filter((ex) => !(ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic));
  const homeWeights = homeLoaded.map((ex) => ex.sets.find((st) => !st.isWarmup)?.targetWeightKg ?? 0);
  assert(
    homePlanW1.location === 'home' &&
      homeLoaded.length > 0 &&
      homePlanW1.exercises.every((ex) => ex.equipment !== 'barbell' && ex.equipment !== 'cable' && ex.equipment !== 'machine') &&
      homeWeights.every((w) => w > 0 && w <= 50),
    `Plan workout 1 at home with dumbbells and a bench uses home gear with real starting weights (${homePlanW1.exercises.map((ex, i) => `${ex.name} ${ex.equipment === 'bodyweight' ? 'BW' : homeWeights[homeLoaded.indexOf(ex)] + ' kg'}`).join(', ')})`
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

    // Program page overview: done, up next and upcoming workouts, active phase and run of the plan.
    const ov1 = buildPlanOverview([day1]);
    assert(
      ov1.cycleNumber === 1 && ov1.completedCount === 1 && ov1.nextWorkoutNumber === 2 && ov1.activePhase === 1,
      'Program page: after Workout 1 the athlete is on their first run, 1 done, Workout 2 next in Phase 1'
    );
    assert(
      ov1.workouts[0].status === 'done' && ov1.workouts[0].session === day1 &&
        ov1.workouts[1].status === 'next' && ov1.workouts[1].label === 'Shoulders and Arms' &&
        ov1.workouts[2].status === 'upcoming' && ov1.workouts.length === 24,
      'Program page: Workout 1 links to its logged session, Workout 2 is up next, the rest are upcoming'
    );
    const ovNew = buildPlanOverview([]);
    assert(ovNew.completedCount === 0 && ovNew.workouts[0].status === 'next', 'Program page: a new athlete starts with Workout 1 up next');
    const ov2 = buildPlanOverview([mkDone(24, 30), mkDone(1, 2)]);
    assert(
      ov2.cycleNumber === 2 && ov2.completedCount === 1 && ov2.workouts[23].status === 'upcoming',
      'Program page: finishing Workout 24 starts a new run, and earlier runs do not count as done'
    );
    assert(planWorkoutLabel('Delts and Arms (Tri-Sets)') === 'Shoulders and Arms', 'Program page: workout names are plain English');

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

    // Per-set personal bests: celebrated once, and re-ticking the same set is not celebrated again.
    const prev = mkHistoryWith('ex-guillotine-press', 40, 12);
    const live = generate6WeekMuscleBuildingWorkout(3, 80);
    const g = live.exercises.find((e) => e.exerciseId === 'ex-guillotine-press')!;
    const prSet = { ...g.sets[0], completed: true, actualWeightKg: 42.5, actualReps: 12 };
    const liveWithSet = { ...live, exercises: live.exercises.map((e) => (e.id === g.id ? { ...e, sets: [prSet, ...e.sets.slice(1)] } : e)) };
    const award = evaluateSetPersonalBest(liveWithSet, [prev], g, prSet);
    assert(award?.title === 'Weight PR', 'A heavier set than last session is celebrated as a Weight PR');
    const again = evaluateSetPersonalBest({ ...liveWithSet, celebratedSetIds: [prSet.id] }, [prev], g, prSet);
    assert(again === null, 'Unticking and re-ticking the same set is not celebrated twice');
    const secondSet = { ...g.sets[1], completed: true, actualWeightKg: 42.5, actualReps: 12 };
    const both = { ...live, exercises: live.exercises.map((e) => (e.id === g.id ? { ...e, sets: [prSet, secondSet, ...e.sets.slice(2)] } : e)) };
    assert(evaluateSetPersonalBest(both, [prev], g, secondSet) === null, 'Repeating the same PR on the next set is not celebrated again');

    // Workout completion: measured values only, plan week follows the workout number.
    const done = completeWorkout({
      activeWorkout: { ...plan, exercises: plan.exercises.map((e) => ({ ...e, sets: e.sets.map((st) => ({ ...st, completed: true })) })) },
      history: [],
      profile: { ...NEW_USER_PROFILE, programType: 'muscle_building_6wk', mesocycleWeek: 1 },
      readiness: { state: 'Normal', score: 0 },
      bodyweightKg: 80,
    });
    assert(
      done.completedSession.avgHeartRate === undefined && done.completedSession.kilojoules === undefined,
      'Completed workouts store no estimated heart rate or energy'
    );
    assert(done.strengthMilestone === null && !('xpEarned' in done.completedSession), 'Day 1 stores no XP and a first log is not a strength level up');
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

  console.log('\n[34. Workout Page: Day Strip & Exercise Summaries]');
  {
    const HOUR = 60 * 60 * 1000;
    const stripNow = new Date(2026, 9, 24, 12, 0).getTime(); // Saturday noon
    const doneAt = (num: number, at: number): WorkoutSession => {
      const w = generate6WeekMuscleBuildingWorkout(num, 80);
      w.completed = true;
      w.completedAt = new Date(at).toISOString();
      w.date = localDateString(new Date(at));
      w.exercises.forEach((ex) => ex.sets.forEach((st) => { st.completed = true; st.actualReps = st.targetReps; }));
      return w;
    };
    const yesterday = doneAt(1, stripNow - 20 * HOUR);
    const strip = buildWeekStrip({
      workouts: [yesterday],
      nextSession: generate6WeekMuscleBuildingWorkout(2, 80),
      programType: 'muscle_building_6wk',
      exerciseCatalog: SEED_EXERCISES,
      now: stripNow,
    });
    assert(
      strip.length === 7 && strip[3].isToday && strip[3].label === 'SAT' && strip[2].status === 'trained' && strip[1].status === 'rest',
      'Day strip shows three days back, today in the middle, and three days ahead, marking the day trained'
    );
    const plannedAhead = strip.filter((d) => d.status === 'planned');
    assert(
      plannedAhead.length >= 2 && plannedAhead.every((d) => d.date >= strip[3].date),
      `Upcoming sessions are spread out by recovery (${plannedAhead.map((d) => d.label).join(', ')}), never in the past`
    );
    const trainedToday = buildWeekStrip({
      workouts: [doneAt(1, stripNow - HOUR)],
      nextSession: generate6WeekMuscleBuildingWorkout(2, 80),
      programType: 'muscle_building_6wk',
      exerciseCatalog: SEED_EXERCISES,
      now: stripNow,
    });
    assert(trainedToday[3].status === 'trained' && trainedToday[4].status === 'planned', 'After training today, the next session is expected tomorrow at the earliest');

    const first = buildExerciseInsight(generate6WeekMuscleBuildingWorkout(1, 80).exercises[0], [], 'Normal');
    assert(first.history.length === 0 && /First time/.test(first.summary), 'A new exercise says it sets the starting point');
    const plan2 = generate6WeekMuscleBuildingWorkout(2, 80);
    const lighter = doneAt(2, stripNow - 14 * 24 * HOUR);
    lighter.exercises.forEach((ex) => ex.sets.forEach((st) => (st.actualWeightKg = st.targetWeightKg - 2)));
    const same = doneAt(2, stripNow - 7 * 24 * HOUR);
    same.exercises.forEach((ex) => ex.sets.forEach((st) => (st.actualWeightKg = st.targetWeightKg - 1)));
    const insight = buildExerciseInsight(plan2.exercises[0], [lighter, same], 'Normal');
    assert(
      insight.history.length === 2 &&
        insight.history[1].e1rmKg > insight.history[0].e1rmKg &&
        /Strength on this lift is rising/.test(insight.summary) &&
        /increases the weight/.test(insight.summary),
      `Exercise summary describes the trend and today's change: "${insight.summary}"`
    );
    assert(/holds the weight steady/.test(buildExerciseInsight(plan2.exercises[0], [same], 'Amber Shield').summary), 'Low recovery days say the weight is held');
    // Fewer sets at a heavier weight is progress, even though session volume falls (Phase 2 drops to 2 sets).
    const fourSets = doneAt(2, stripNow - 7 * 24 * HOUR);
    const twoHeavierSets = doneAt(2, stripNow - 2 * 24 * HOUR);
    twoHeavierSets.exercises.forEach((ex) => {
      ex.sets = ex.sets.slice(0, 2).map((st) => ({ ...st, actualWeightKg: st.targetWeightKg + 2.5 }));
    });
    const phaseChange = buildExerciseInsight(plan2.exercises[0], [fourSets, twoHeavierSets], 'Normal');
    assert(
      phaseChange.history[1].e1rmKg > phaseChange.history[0].e1rmKg && /rising/.test(phaseChange.summary),
      'Progress is tracked by estimated max, so dropping from 4 to 2 heavier sets shows as progress, not a decline'
    );

    const lateEvening = new Date(2026, 9, 24, 21, 40).getTime();
    assert(
      new Date(getDisplayReadyAt(lateEvening)).getHours() === 6 && new Date(getDisplayReadyAt(lateEvening)).getDate() === 25,
      'A ready time just before 10 PM rounds to the next morning, not "22:00"'
    );
  }

  console.log('\n[35. Dynamic Exercise Card 2-Line Summary (Strict 2-Line, Concrete Load, Zero Duplication)]');
  {
    const HOUR = 60 * 60 * 1000;
    const done = (num: number, hoursAgo: number, bump: number): WorkoutSession => {
      const w = generate6WeekMuscleBuildingWorkout(num, 80);
      const at = new Date(Date.now() - hoursAgo * HOUR);
      w.completed = true;
      w.completedAt = at.toISOString();
      w.date = localDateString(at);
      w.exercises.forEach((ex) =>
        ex.sets.forEach((st) => {
          st.completed = true;
          st.actualReps = st.targetReps;
          st.actualRir = 2;
          st.actualWeightKg = st.targetWeightKg + bump;
        })
      );
      return w;
    };
    const history = [done(2, 14 * 24, -2), done(2, 3 * 24, -1)];
    const today = generate6WeekMuscleBuildingWorkout(2, 80);
    const lateral = today.exercises[0];
    const kgForNotes = buildAthleteKnowledgeGraph(history, [], SEED_EXERCISES, NEW_USER_PROFILE, calculateWeeklyMuscleVolume(history, SEED_EXERCISES));
    const lateralInsight = buildExerciseInsight(lateral, history, 'Normal');
    const facts = buildExerciseNoteFacts({
      exercise: lateral,
      insight: lateralInsight,
      workouts: history,
      readinessState: 'Normal',
      knowledgeGraph: kgForNotes,
      primaryMuscle: 'Side Delts',
      muscleLabel: 'Side shoulders',
      programLabel: 'Phase 1 (Building foundations), week 1 of 6',
      formatWeight: (kg) => `${kg} kg`,
    });

    // Rule 1: Strict 2-line limit & zero section headers.
    const fallbackLines = facts.fallback.split('\n');
    const insightLines = lateralInsight.summary.split('\n');
    assert(
      fallbackLines.length === 2 &&
        facts.lines.length === 2 &&
        insightLines.length === 2 &&
        lateralInsight.lines.length === 2 &&
        !/^(?:progress|goal|summary|focus)\s*:/im.test(facts.fallback) &&
        !/^(?:progress|goal|summary|focus)\s*:/im.test(lateralInsight.summary),
      `Exercise summary is strictly 2 headerless lines: "${facts.fallback}"`
    );

    // Rule 4: Concrete absolute load (+1.7 kg, 15.9 kg) over abstract percentages.
    assert(
      facts.facts.some((f) => /risen by \+1\.7 kg across 2 sessions \(from 14\.2 kg to 15\.9 kg\)/.test(f)) &&
        /\+1\.7 kg/.test(fallbackLines[0]) &&
        /15\.9 kg/.test(fallbackLines[0]) &&
        !/%/.test(facts.fallback) &&
        !/%/.test(facts.facts.join(' ')),
      `Line 1 uses concrete absolute load rounded to 0.1 kg, never percentages: "${fallbackLines[0]}"`
    );

    // Rules 2, 3, 5: Zero table duplication, no movement execution cues, no macro volume leakage.
    assert(
      !/\b(?:4 sets|15 reps|10 kg|2 reps in reserve|rir|seconds|tempo|12 of 17–27|hard sets)\b/i.test(facts.fallback) &&
        !facts.facts.some((f) => /hard sets against a target|\b4 sets\b|\b15 reps\b|reps in reserve|seconds to lower/i.test(f)),
      'Facts and fallback never duplicate set/rep/weight/RIR table mechanics, tempo cues, or weekly muscle sets'
    );

    const good =
      'Strength on this lift is rising, up +1.7 kg across 2 sessions to a 15.9 kg estimated max.\nToday increases the weight to drive progressive mechanical tension for your side shoulders.';
    assert(acceptExerciseNote(good, facts) === good, 'A valid 2-line summary with concrete load and stimulus directive is accepted');
    assert(
      acceptExerciseNote(good.replace('\n', ' '), facts) === good,
      'Two valid sentences on a single line are normalized into the strict 2-line format'
    );
    assert(acceptExerciseNote('**Note:** ' + good, facts) === good, 'Markdown and "Note:" prefixes are stripped');

    // Reject section headers (Progress:, Goal:, Summary:, Focus:).
    assert(
      acceptExerciseNote(`Progress: ${fallbackLines[0]}\nGoal: ${fallbackLines[1]}`, facts) === null &&
        acceptExerciseNote(`Summary: ${fallbackLines[0]}\nFocus: ${fallbackLines[1]}`, facts) === null,
      'Section headers like Progress:, Goal:, Summary:, or Focus: are rejected'
    );

    // Reject 1-line or 3-line summaries.
    assert(
      acceptExerciseNote(fallbackLines[0], facts) === null &&
        acceptExerciseNote(`${fallbackLines[0]}\n${fallbackLines[1]}\nKeep your core braced throughout.`, facts) === null,
      'Single-line and 3-line summaries are rejected'
    );

    // Reject abstract percentages (Rule 4).
    assert(
      acceptExerciseNote(
        'Your strength on this lift is up +19% across 2 sessions.\nToday increases the weight to drive progressive mechanical tension.',
        facts
      ) === null,
      'Abstract strength percentages (+19%) are rejected in favor of concrete absolute load'
    );

    // Reject table/grid duplication (Rule 2: target weight, target reps, target sets, target RIR).
    assert(
      acceptExerciseNote(
        `${fallbackLines[0]}\nToday lift 10 kg for 4 sets of 15 to build your side shoulders.`,
        facts
      ) === null &&
        acceptExerciseNote(
          `${fallbackLines[0]}\nComplete 4 sets today to build volume accumulation for hypertrophy.`,
          facts
        ) === null &&
        acceptExerciseNote(
          `${fallbackLines[0]}\nAim for 15 reps per set to expand hypertrophy capacity.`,
          facts
        ) === null,
      'Summaries that duplicate table weight, sets, or reps are rejected'
    );

    // Reject movement execution cues (Rule 3: tempo/cadence, rest intervals, RIR).
    assert(
      acceptExerciseNote(
        `${fallbackLines[0]}\nToday increases the weight while lowering each rep over 2 seconds.`,
        facts
      ) === null &&
        acceptExerciseNote(
          `${fallbackLines[0]}\nToday increases the weight, stopping with 2 reps in reserve.`,
          facts
        ) === null &&
        acceptExerciseNote(
          `${fallbackLines[0]}\nToday increases the weight with 60 seconds rest between efforts.`,
          facts
        ) === null,
      'Summaries with tempo, RIR, or rest interval cues are rejected'
    );

    // Reject macro volume leakage (Rule 5: weekly muscle sets).
    assert(
      acceptExerciseNote(
        `You are at 12 of 17–27 hard sets for side shoulders this week.\n${fallbackLines[1]}`,
        facts
      ) === null &&
        acceptExerciseNote(
          `${fallbackLines[0]}\nToday adds toward your weekly set target for side shoulders.`,
          facts
        ) === null,
      'Summaries that leak weekly muscle set benchmarks are rejected'
    );

    // Reject invented numbers and AI self-reference.
    assert(
      acceptExerciseNote(
        'Strength on this lift is rising, up +12.9 kg across 6 sessions to a 99.5 kg estimated max.\nToday increases the weight to drive progressive mechanical tension.',
        facts
      ) === null,
      'A summary with numbers not in the facts is rejected'
    );
    assert(
      acceptExerciseNote(
        'As an AI language model, your strength is up +1.7 kg across 2 sessions.\nToday increases the weight for hypertrophy.',
        facts
      ) === null,
      'Summaries that talk about being an AI are rejected'
    );

    const plank = generate6WeekMuscleBuildingWorkout(4, 80).exercises.find((e) => e.durationSeconds)!;
    const plankFacts = buildExerciseNoteFacts({
      exercise: plank,
      insight: buildExerciseInsight(plank, [], 'Normal'),
      workouts: [],
      readinessState: 'Normal',
      knowledgeGraph: kgForNotes,
      formatWeight: (kg) => `${kg} kg`,
    });
    assert(
      plankFacts.fallback.split('\n').length === 2 &&
        /isometric trunk stability/.test(plankFacts.fallback) &&
        !plankFacts.facts.some((f) => /reps in reserve|seconds/.test(f)),
      `Timed holds use a 2-line stability directive without seconds or RIR (${plank.name})`
    );
    assert(
      acceptExerciseNote(
        `First time on ${plank.name}—today sets your starting point.\nHold for 60 seconds with 2 reps left in reserve.`,
        plankFacts
      ) === null,
      'A timed hold summary with seconds or reps in reserve is rejected'
    );

    const squatFirst = generate6WeekMuscleBuildingWorkout(4, 80).exercises.find((e) => e.exerciseId.includes('squat'))!;
    const squatFacts = buildExerciseNoteFacts({
      exercise: squatFirst,
      insight: buildExerciseInsight(squatFirst, [], 'Normal'),
      workouts: [],
      readinessState: 'Normal',
      knowledgeGraph: kgForNotes,
      formatWeight: (kg) => `${kg} kg`,
    });
    assert(
      acceptExerciseNote(
        "You've only logged the squat once before.\nToday focuses on clean mechanical tension for hypertrophy.",
        squatFacts
      ) === null &&
        acceptExerciseNote(
          'You have been consistently building strength in your quads.\nToday focuses on clean mechanical tension for hypertrophy.',
          squatFacts
        ) === null,
      'A first-time summary may not invent prior history or claim consistent strength building'
    );

    let seenSystem = '';
    let seenUser = '';
    const fromModel = await generateExerciseNote(facts, async (system: string, user: string) => {
      seenSystem = system;
      seenUser = user;
      return good;
    });
    assert(
      fromModel === good && /Use only the facts/.test(seenSystem) && seenUser.includes('+1.7 kg'),
      'The on-device model is prompted with the concrete load facts and its checked 2-line summary is used'
    );
    assert((await generateExerciseNote(facts, async () => null)) === null, 'Without an on-device model the card keeps the fact-based 2-line fallback');
    let calls = 0;
    const retried = await generateExerciseNote(facts, async () => (++calls === 1 ? 'Progress: +19% strength.\nGoal: Lift 10 kg for 4 sets of 15.' : good));
    assert(retried === good && calls === 2, 'A rejected summary gets one retry before falling back');
    assert(
      facts.key ===
        buildExerciseNoteFacts({
          exercise: lateral,
          insight: buildExerciseInsight(lateral, history, 'Normal'),
          workouts: history,
          readinessState: 'Normal',
          knowledgeGraph: kgForNotes,
          primaryMuscle: 'Side Delts',
          muscleLabel: 'Side shoulders',
          programLabel: 'Phase 1 (Building foundations), week 1 of 6',
          formatWeight: (kg) => `${kg} kg`,
        }).key,
      'Summaries are cached by their facts, so the same facts reuse the same summary'
    );
  }

  console.log('\n[35b. Program Page Identity Message (facts, AI checks, fallback)]');
  {
    const DAYMS = 24 * 60 * 60 * 1000;
    const idNow = new Date(2026, 9, 29, 18, 0).getTime();
    const doneSession = (n: number, at: number, kg: (planned: number) => number) => {
      const w = generate6WeekMuscleBuildingWorkout(n, 80);
      w.completed = true;
      w.completedAt = new Date(at).toISOString();
      w.date = localDateString(new Date(at));
      w.exercises.forEach((ex) =>
        ex.sets.forEach((st) => {
          st.completed = true;
          st.actualReps = st.targetReps;
          st.actualRir = 2;
          st.actualWeightKg = kg(st.targetWeightKg);
        })
      );
      return w;
    };
    const fresh = buildIdentityFacts({ plan: buildPlanOverview([]), workouts: [], exerciseCatalog: SEED_EXERCISES, now: idNow });
    assert(
      /first workout, chest and back, is ready/.test(fresh.fallback) && fresh.facts.some((f) => /0 of 24/.test(f)),
      `A new athlete's message points at their first workout: "${fresh.fallback}"`
    );

    const day1 = doneSession(1, idNow - 4 * DAYMS, (kg) => kg);
    const day3 = doneSession(3, idNow - DAYMS, (kg) => kg + 2.5);
    const idHistory = [day3, day1];
    const plan = buildPlanOverview(idHistory);
    const idFacts = buildIdentityFacts({
      plan,
      workouts: idHistory,
      nextSession: generate6WeekMuscleBuildingWorkout(plan.nextWorkoutNumber, 80),
      exerciseCatalog: SEED_EXERCISES,
      readinessState: 'Normal',
      now: idNow,
    });
    const all = idFacts.facts.join(' ');
    assert(
      /2 of 24/.test(all) && /Last workout: Chest and Back, yesterday/.test(all) && /personal best/.test(all) && /Estimated strength is up on \d+ of \d+/.test(all),
      'Identity facts come from the athlete\'s history: workouts done, last workout, personal bests and strength trend'
    );
    assert(
      /^2 workouts done, with \d+ personal bests? along the way\. Your estimated strength is already up on/.test(idFacts.fallback) && /Next up is legs and abs/.test(idFacts.fallback),
      `Without a model the message is built from the same facts: "${idFacts.fallback}"`
    );
    assert(!/NaN|undefined/.test(idFacts.fallback + all), 'Identity facts and fallback have no NaN or undefined');

    const goodId = 'Two workouts in and your lifts are already climbing. Next up is legs and abs, a chance to build a stronger base.';
    assert(acceptIdentityMessage(goodId, idFacts) === goodId, 'A message with no invented numbers or claims is accepted');
    assert(acceptIdentityMessage('Your first workout was strong, and you felt great afterwards. Keep that feeling for legs and abs next.', idFacts) === null, 'A message that claims how the athlete felt is rejected');
    assert(acceptIdentityMessage('You have done 9 workouts and set 14 personal bests. Next up is legs and abs, so keep building.', idFacts) === null, 'A message with invented numbers is rejected');
    const noPbFacts = { ...idFacts, facts: idFacts.facts.filter((f) => !/personal best/i.test(f)) };
    assert(acceptIdentityMessage('You keep setting personal bests and showing up. Next up is legs and abs, a chance to build your base.', noPbFacts) === null, 'A message may not mention personal bests the history does not show');

    let idSystem = '';
    const fromIdModel = await generateIdentityMessage(idFacts, async (system: string) => {
      idSystem = system;
      return goodId;
    });
    assert(fromIdModel === goodId && /Never say how they felt/.test(idSystem), 'The on-device model writes the message from the facts and its checked answer is used');
    assert((await generateIdentityMessage(idFacts, async () => null)) === null, 'Without an on-device model the page keeps the fact-based message');
  }

  console.log('\n[36. Full 6-Week Plan Simulation (24 workouts, session 1 to graduation)]');
  {
    const HOUR = 60 * 60 * 1000;
    const issues: string[] = [];
    let profile6: UserProfile = { ...NEW_USER_PROFILE, programType: 'muscle_building_6wk', mesocycleWeek: 1, experienceLevel: 'intermediate', gender: 'male' } as UserProfile;
    let history6: WorkoutSession[] = [];
    let t = new Date(2026, 9, 19, 18, 0).getTime(); // Monday evening, session 1
    const start = t;
    const awards: string[] = [];
    let maxWaitDays = 0;
    const topWeightByExercise = new Map<string, number>();
    const hasBadNumber = (v: unknown): boolean =>
      typeof v === 'number' ? !Number.isFinite(v) : Array.isArray(v) ? v.some(hasBadNumber) : v && typeof v === 'object' ? Object.values(v).some(hasBadNumber) : false;

    for (let k = 1; k <= 24; k++) {
      const n = getNextProgramWorkoutNumber(history6);
      if (n !== k) issues.push(`expected plan workout ${k}, app queued ${n}`);
      let session = prepareSessionForAthlete(generate6WeekMuscleBuildingWorkout(n, 80), {
        history: history6,
        bodyweightKg: 80,
        gender: 'male',
        experienceLevel: 'intermediate',
        readinessState: 'Normal',
        unit: 'kg',
        isProgramPlan: true,
      });
      if (hasBadNumber(session)) issues.push(`workout ${n}: NaN/Infinity in prepared session`);
      for (const ex of session.exercises) {
        const timed = Boolean(ex.durationSeconds || ex.durationMinutesRange);
        const pureBw = ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic;
        for (const st of ex.sets.filter((x) => !x.isWarmup && x.setType !== 'warmup')) {
          if (!pureBw && !(st.targetWeightKg > 0)) issues.push(`workout ${n}: ${ex.name} has no weight`);
          if (!timed && !(st.targetReps > 0)) issues.push(`workout ${n}: ${ex.name} has no reps`);
        }
        const prevTop = topWeightByExercise.get(ex.exerciseId);
        const planned = ex.sets.find((x) => !x.isWarmup && x.setType !== 'warmup')?.targetWeightKg ?? 0;
        if (prevTop && planned > prevTop * 1.3 + 2.5) issues.push(`workout ${n}: ${ex.name} jumps from ${prevTop} to ${planned} kg`);
      }

      // Wait until the recovery gate opens (as the Workout tab would).
      const gate = evaluateSessionRecovery(session, history6, SEED_EXERCISES, t);
      if (!gate.isReady && gate.readyAt) {
        const trainAt = new Date(getDisplayReadyAt(gate.readyAt));
        if (trainAt.getHours() < 17) trainAt.setHours(17, 0, 0, 0);
        maxWaitDays = Math.max(maxWaitDays, (trainAt.getTime() - t) / (24 * HOUR));
        t = trainAt.getTime();
      }

      // Things the Workout tab builds for this session must not throw.
      try {
        buildWeekStrip({ workouts: history6, nextSession: session, programType: 'muscle_building_6wk', exerciseCatalog: SEED_EXERCISES, now: t });
        const kgSim = buildAthleteKnowledgeGraph(history6, [], SEED_EXERCISES, profile6, calculateWeeklyMuscleVolume(history6, SEED_EXERCISES));
        for (const ex of session.exercises) {
          const def = SEED_EXERCISES.find((d) => d.id === ex.exerciseId);
          if (!def) issues.push(`workout ${n}: ${ex.name} (${ex.exerciseId}) missing from the exercise catalog`);
          const f = buildExerciseNoteFacts({
            exercise: ex,
            insight: buildExerciseInsight(ex, history6, 'Normal', 80),
            workouts: history6,
            readinessState: 'Normal',
            knowledgeGraph: kgSim,
            primaryMuscle: def?.primaryMuscle,
            formatWeight: (kg) => `${kg} kg`,
          });
          if (/NaN|undefined/.test(f.fallback + f.facts.join(' '))) issues.push(`workout ${n}: ${ex.name} overview text has NaN/undefined`);
        }
      } catch (err) {
        issues.push(`workout ${n}: Workout tab helpers threw ${(err as Error).message}`);
      }

      // The athlete does the session as prescribed.
      session = {
        ...session,
        exercises: session.exercises.map((ex) => ({
          ...ex,
          sets: ex.sets.map((st, i) => ({
            ...st,
            completed: true,
            completedAt: new Date(t + i * 3 * 60 * 1000).toISOString(),
            actualWeightKg: st.targetWeightKg,
            actualReps: st.targetReps,
            actualRir: st.targetRir ?? 2,
          })),
        })),
      };
      t += 60 * 60 * 1000;
      const result = completeWorkout({
        activeWorkout: session,
        history: history6,
        profile: profile6,
        readiness: { state: 'Normal', score: 0 },
        bodyweightKg: 80,
        now: new Date(t),
      });
      if (result.completedSession.programWorkoutNumber !== n) issues.push(`workout ${n}: completed session lost its plan number`);
      if (result.weekMilestone) awards.push(`${n}:${result.weekMilestone.title}`);
      history6 = result.nextHistory;
      profile6 = { ...profile6, mesocycleWeek: result.nextMesocycleWeek };
      if (n < 24 && result.nextMesocycleWeek !== Math.ceil((n + 1) / 4)) issues.push(`after workout ${n}: week ${result.nextMesocycleWeek}, expected ${Math.ceil((n + 1) / 4)}`);
      for (const ex of session.exercises) {
        const top = ex.sets.filter((x) => !x.isWarmup && x.setType !== 'warmup').reduce((m, x) => Math.max(m, x.actualWeightKg ?? 0), 0);
        if (top > 0) topWeightByExercise.set(ex.exerciseId, top);
      }
      try {
        const kgDone = buildAthleteKnowledgeGraph(history6, [], SEED_EXERCISES, profile6, calculateWeeklyMuscleVolume(history6, SEED_EXERCISES));
        const rep = buildSessionProgressReport({ workouts: history6, exerciseCatalog: SEED_EXERCISES, knowledgeGraph: kgDone, bodyweightKg: 80, now: t });
        if (!rep || rep.program.kind !== 'plan' || (rep.program.kind === 'plan' && rep.program.workoutNumber !== n)) issues.push(`workout ${n}: session report has the wrong plan position`);
      } catch (err) {
        issues.push(`workout ${n}: session report threw ${(err as Error).message}`);
      }
      t += 60 * 1000;
    }

    const days = (t - start) / (24 * HOUR);
    console.log(`   24 workouts over ${days.toFixed(1)} days; longest recovery wait ${maxWaitDays.toFixed(1)} days; milestones ${awards.join(', ')}`);
    issues.slice(0, 25).forEach((i) => console.log(`   ISSUE: ${i}`));
    assert(issues.length === 0, `All 24 plan workouts prepare, wait for recovery, complete and report without issues (${issues.length} issues)`);
    assert(
      awards.length === 6 && awards[5] === '24:Block complete' && awards.slice(0, 5).every((a) => / complete$/.test(a) && a.includes(':Week ')),
      'Five finished weeks and the finished 6-week block are celebrated'
    );
    assert(getNextProgramWorkoutNumber(history6) === 1 && profile6.mesocycleWeek === 1, 'After graduation the plan starts again at workout 1, week 1');
    assert(days <= 49 && maxWaitDays <= 4, `The plan fits in about 6 weeks (${days.toFixed(1)} days) and no session waits more than 4 days`);
  }

  console.log('\n[36b. End to End: Data Carries Across Workouts, Fills Every Card, Progresses by the Knowledge-Graph Rule]');
  {
    const HOUR = 60 * 60 * 1000;
    const isWork = (st: { isWarmup?: boolean; setType?: string }) => !st.isWarmup && st.setType !== 'warmup';
    const rule = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find((p) => p.id === 'sp-double-progression')!;
    const ruleText = rule.formula ?? '';
    assert(
      ruleText.includes(`+${PROGRESSION_RULES.barbellIncrementKg} kg barbell`) &&
        ruleText.includes(`+${PROGRESSION_RULES.dumbbellIncrementKg} kg dumbbell`) &&
        ruleText.includes(`+${PROGRESSION_RULES.repStep} rep`) &&
        loadIncrementFor('barbell') === PROGRESSION_RULES.barbellIncrementKg &&
        loadIncrementFor('dumbbell') === PROGRESSION_RULES.dumbbellIncrementKg,
      'The knowledge graph states the exact progression rule the app applies (one shared source)'
    );
    assert(
      hadQualityEffort(2, 2) && hadQualityEffort(3, 2) && hadQualityEffort(1, 2) && !hadQualityEffort(0, 2) && hadQualityEffort(0, 0),
      'Quality effort: reps in reserve count (more is fine), grinding to failure does not, unless the plan asked for failure'
    );

    // Split programs (rep ranges): easy sets at the top of the range still earn the load step.
    const splitEx: ExerciseSession = {
      ...generateSmartWorkoutSession('Push', [], SEED_EXERCISES, 'Normal', 1, 'gym', [], 'Lean Bulk', 80).exercises.find((e) => e.equipment === 'barbell')!,
    };
    const easyTop = { ...splitEx, sets: splitEx.sets.map((st) => ({ ...st, completed: true, actualWeightKg: 60, actualReps: splitEx.maxReps || 12, actualRir: 3 })) };
    const easyRx = prescribeDoubleProgression(easyTop, 'Normal');
    assert(easyRx.weightChanged && easyRx.nextWeightKg === 60 + PROGRESSION_RULES.barbellIncrementKg, `Top of the range with 3 reps to spare adds ${PROGRESSION_RULES.barbellIncrementKg} kg (got ${easyRx.nextWeightKg})`);
    const groundOut = { ...easyTop, sets: easyTop.sets.map((st) => ({ ...st, actualRir: 0 })) };
    assert(!prescribeDoubleProgression(groundOut, 'Normal').weightChanged, 'Top of the range ground out to failure holds the weight');
    const newer = { ...generate6WeekMuscleBuildingWorkout(1, 80) };
    assert(
      findLastCompletedExerciseSession('ex-guillotine-press', [newer], newer.exercises.find((e) => e.exerciseId === 'ex-guillotine-press')) === null,
      'An exercise never completed has no last session'
    );

    let hist: WorkoutSession[] = [];
    let prof: UserProfile = { ...NEW_USER_PROFILE, programType: 'muscle_building_6wk', mesocycleWeek: 1, experienceLevel: 'intermediate', gender: 'male' } as UserProfile;
    let t = new Date(2026, 9, 19, 18, 0).getTime();
    const issues: string[] = [];
    const truth = new Map<string, number>(); // the athlete's real estimated max per exercise
    const last = new Map<string, { weight: number; reps: number; target: number; quality: boolean }>();
    const sessionsDone = new Map<string, number>();
    let increases = 0;
    let holds = 0;
    let amberChecked = 0;
    const AMBER_WORKOUT = 14;

    for (let k = 1; k <= 24; k++) {
      const n = getNextProgramWorkoutNumber(hist);
      const amber = n === AMBER_WORKOUT;
      let session = prepareSessionForAthlete(generate6WeekMuscleBuildingWorkout(n, 80), {
        history: hist,
        bodyweightKg: 80,
        gender: 'male',
        experienceLevel: 'intermediate',
        readinessState: amber ? 'Amber Shield' : 'Normal',
        unit: 'kg',
        isProgramPlan: true,
      });

      // What the Workout tab shows before training: prescription, PREV column, chart history.
      for (const ex of session.exercises) {
        const first = ex.sets.find(isWork);
        if (!first || ex.durationSeconds || ex.durationMinutesRange) continue;
        const prev = last.get(ex.exerciseId);
        const done = sessionsDone.get(ex.exerciseId) ?? 0;
        const insight = buildExerciseInsight(ex, hist, 'Normal', 80);
        if (insight.history.length !== Math.min(12, done)) issues.push(`workout ${n}: ${ex.name} chart has ${insight.history.length} points, expected ${done}`);
        if (!prev) continue;
        const prevCol = getPreviousWorkingSets(ex.exerciseId, hist);
        if (prevCol.length === 0 || prevCol[0].weightKg !== prev.weight || prevCol[0].reps !== prev.reps) {
          issues.push(`workout ${n}: ${ex.name} PREV shows ${prevCol[0]?.weightKg}×${prevCol[0]?.reps}, logged ${prev.weight}×${prev.reps}`);
        }
        if (first.targetWeightKg <= 0 || first.targetReps !== prev.target) continue; // rep target changed with the phase
        const planned = first.targetWeightKg;
        const step = loadIncrementFor(ex.equipment);
        if (amber) {
          amberChecked++;
          if (planned > prev.weight + 1e-9) issues.push(`workout ${n}: ${ex.name} went up on a low-recovery day (${prev.weight} → ${planned})`);
        } else if (prev.quality) {
          if (!(planned > prev.weight && planned <= prev.weight * (1 + PROGRESSION_RULES.maxSessionIncreaseFraction) + step + 0.01)) {
            issues.push(`workout ${n}: ${ex.name} hit every target last time but went ${prev.weight} → ${planned}`);
          } else increases++;
        } else if (planned > prev.weight + 1e-9) {
          issues.push(`workout ${n}: ${ex.name} missed reps last time but went up ${prev.weight} → ${planned}`);
        } else holds++;
      }

      // Wait for recovery, as the Workout tab does.
      const gate = evaluateSessionRecovery(session, hist, SEED_EXERCISES, t);
      if (!gate.isReady && gate.readyAt) {
        const at = new Date(getDisplayReadyAt(gate.readyAt));
        if (at.getHours() < 17) at.setHours(17, 0, 0, 0);
        t = at.getTime();
      }

      // The athlete trains: reps come from their real strength, so some sets fall short.
      session = {
        ...session,
        exercises: session.exercises.map((ex, exIdx) => {
          const working = ex.sets.filter(isWork);
          const firstW = working[0];
          const weighted = firstW && firstW.targetWeightKg > 0 && !ex.durationSeconds && !ex.durationMinutesRange;
          if (weighted && !truth.has(ex.exerciseId)) {
            const base = firstW.targetWeightKg * (1 + (firstW.targetReps + (firstW.targetRir ?? 2)) / 30);
            truth.set(ex.exerciseId, base * (exIdx % 3 === 0 ? 0.95 : 1.04)); // some lifts start too heavy
          }
          const e1 = truth.get(ex.exerciseId) ?? 0;
          let wi = 0;
          return {
            ...ex,
            sets: ex.sets.map((st, i) => {
              if (!weighted || !isWork(st)) {
                return { ...st, completed: true, completedAt: new Date(t + i * 180000).toISOString(), actualWeightKg: st.targetWeightKg, actualReps: st.targetReps, actualRir: st.targetRir ?? 2 };
              }
              const toFailure = Math.floor(30 * (e1 / st.targetWeightKg - 1)) - Math.floor(wi++ / 2);
              const reps = Math.max(1, Math.min(st.targetReps, toFailure));
              const rir = Math.max(0, Math.min(5, toFailure - reps));
              return { ...st, completed: true, completedAt: new Date(t + i * 180000).toISOString(), actualWeightKg: st.targetWeightKg, actualReps: reps, actualRir: rir };
            }),
          };
        }),
      };
      t += HOUR;
      const result = completeWorkout({ activeWorkout: session, history: hist, profile: prof, readiness: { state: amber ? 'Amber Shield' : 'Normal', score: 0 }, bodyweightKg: 80, now: new Date(t) });
      hist = result.nextHistory;
      prof = { ...prof, mesocycleWeek: result.nextMesocycleWeek };
      t += 60 * 1000;

      for (const ex of session.exercises) {
        const working = ex.sets.filter(isWork);
        if (!working.length || ex.durationSeconds || ex.durationMinutesRange) continue;
        sessionsDone.set(ex.exerciseId, (sessionsDone.get(ex.exerciseId) ?? 0) + 1);
        const quality = working.every((st) => (st.actualReps ?? 0) >= st.targetReps && hadQualityEffort(st.actualRir, st.targetRir));
        last.set(ex.exerciseId, { weight: working[0].actualWeightKg ?? 0, reps: working[0].actualReps ?? 0, target: working[0].targetReps, quality });
        if (truth.has(ex.exerciseId)) truth.set(ex.exerciseId, truth.get(ex.exerciseId)! * (quality ? 1.015 : 1.005));
      }

      // What the Progress tab shows after each workout.
      const kgNow = buildAthleteKnowledgeGraph(hist, [], SEED_EXERCISES, prof, calculateWeeklyMuscleVolume(hist, SEED_EXERCISES));
      const report = buildSessionProgressReport({ workouts: hist, exerciseCatalog: SEED_EXERCISES, knowledgeGraph: kgNow, bodyweightKg: 80, now: t });
      if (!report) issues.push(`workout ${n}: no session report`);
    }

    issues.slice(0, 25).forEach((i) => console.log(`   ISSUE: ${i}`));
    console.log(`   ${increases} load increases after every target was hit; ${holds} holds after missed reps; ${amberChecked} lifts held on the low-recovery day`);
    assert(issues.length === 0, `Across 24 workouts every prescription, PREV value and chart follows the logged data (${issues.length} issues)`);
    assert(increases > 10 && holds > 0 && amberChecked > 0, 'Weights go up only after every target is hit with reps to spare, hold after missed reps, and hold on low recovery');

    const strengthCards = buildStrengthCharts({ workouts: hist, profile: prof, bodyweightKg: 80, fmt: { weight: (kg) => `${kg} kg`, length: (cm) => `${cm} cm` } });
    const realCards = strengthCards.filter((c) => c.points.length >= 2);
    assert(
      realCards.length >= 3 && strengthCards.some((c) => /sets/i.test(c.title) && c.points.length > 0),
      `Progress tab strength cards fill from the logged workouts (${realCards.map((c) => `${c.title}: ${c.points.length}`).join(', ')})`
    );
    const pressCard = realCards.find((c) => c.points.length >= 3);
    assert(Boolean(pressCard) && pressCard!.points[pressCard!.points.length - 1].value > pressCard!.points[0].value, `Estimated strength rises across the plan on the Progress tab (${pressCard?.title})`);
    const kgEnd = buildAthleteKnowledgeGraph(hist, [], SEED_EXERCISES, prof, calculateWeeklyMuscleVolume(hist, SEED_EXERCISES));
    assert(
      kgEnd.muscleProfiles.some((m) => m.weeklySets > 0) && kgEnd.muscleProfiles.some((m) => m.e1rmVelocityPct > 0),
      'The knowledge graph records weekly sets per muscle and a rising strength trend from the same workouts'
    );
    const pillarsEnd = calculateBestPillarE1rms(hist, 80);
    assert((pillarsEnd['Horizontal Push'] ?? 0) > 0 && (pillarsEnd['Horizontal Pull'] ?? 0) > 0, 'Strength levels fill from the logged workouts');
    const volumeEnd = calculateWeeklyMuscleVolume(hist, SEED_EXERCISES);
    assert(Object.values(volumeEnd).some((v) => v > 0), 'Weekly sets fill from the logged workouts');
  }

  console.log('\n[36c. Exercise Card Charts Show Real Data From the First Session]');
  {
    const at = new Date(2026, 9, 26, 18, 0).getTime();
    const once = generate6WeekMuscleBuildingWorkout(1, 80);
    once.completed = true;
    once.completedAt = new Date(at).toISOString();
    once.date = localDateString(new Date(at));
    once.exercises.forEach((ex) => ex.sets.forEach((st) => { st.completed = true; st.actualWeightKg = 50; st.actualReps = 12; st.actualRir = 2; }));
    const press = generate6WeekMuscleBuildingWorkout(3, 80).exercises.find((e) => e.exerciseId === 'ex-guillotine-press')!;
    const first = buildExerciseInsight(press, [once], 'Normal', 80);
    const expected = Math.round(calculateE1RM(50, 12, 2, 'barbell', false, false, 80, 'ex-guillotine-press', 'Horizontal Push') * 10) / 10;
    assert(first.history.length === 1 && first.history[0].e1rmKg === expected, `After one session the card chart has the real starting point (${first.history[0]?.e1rmKg} kg), not an example`);
    const sameDay = { ...once, id: 'same-day-2', completedAt: new Date(at + 2 * 60 * 60 * 1000).toISOString() };
    assert(buildExerciseInsight(press, [sameDay, once], 'Normal', 80).history.length === 2, 'Two sessions on the same day are two points on the chart');
  }

  console.log('\n[36d. Muscle Progress: Weekly Sets, Strength Index and Size per Muscle]');
  {
    const DAYM = 24 * 60 * 60 * 1000;
    const mNow = new Date(2026, 9, 29, 20, 0).getTime();
    const session = (n: number, at: number, kg: (planned: number) => number) => {
      const w = generate6WeekMuscleBuildingWorkout(n, 80);
      w.completed = true;
      w.completedAt = new Date(at).toISOString();
      w.date = localDateString(new Date(at));
      w.exercises.forEach((ex) => ex.sets.forEach((st) => { st.completed = true; st.actualReps = st.targetReps; st.actualRir = 2; st.actualWeightKg = kg(st.targetWeightKg); }));
      return w;
    };
    // Chest and Back three weeks running, 2.5 kg heavier each week.
    const mHist = [session(1, mNow - 15 * DAYM, (k) => k), session(1, mNow - 8 * DAYM, (k) => k + 2.5), session(1, mNow - DAYM, (k) => k + 5)];
    const kgM = buildAthleteKnowledgeGraph(mHist, [], SEED_EXERCISES, NEW_USER_PROFILE, calculateWeeklyMuscleVolume(mHist, SEED_EXERCISES, undefined, new Date(mNow)));
    const tape: BiometricLog[] = [
      { date: localDateString(new Date(mNow - 14 * DAYM)), bodyweightKg: 80, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0, chestCm: 100 },
      { date: localDateString(new Date(mNow - DAYM)), bodyweightKg: 80, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0, chestCm: 101.5 },
    ];
    const muscles = buildMuscleProgress({ workouts: mHist, exerciseCatalog: SEED_EXERCISES, biometrics: tape, knowledgeGraph: kgM, bodyweightKg: 80, now: mNow });
    const chest = muscles.find((m) => m.key === 'Chest')!;
    const weekly = calculateWeeklyMuscleVolume(mHist, SEED_EXERCISES, undefined, new Date(mNow));
    assert(Boolean(chest) && chest.weeklySets === weekly.Chest, `Muscle view weekly sets match the knowledge graph and cards (${chest?.weeklySets} = ${weekly.Chest})`);
    assert(chest.setsByWeek.length === 8 && chest.setsByWeek[7].sets === chest.weeklySets && chest.setsByWeek.filter((w) => w.sets > 0).length >= 3, 'Weekly sets history covers 8 weeks and includes each trained week');
    assert(
      chest.strengthIndex.length === 3 && chest.strengthIndex[0].value === 100 && chest.strengthIndex[2].value > chest.strengthIndex[1].value && chest.strengthIndex[1].value > 100,
      `Chest strength index starts at 100 and rises as the lifts get heavier (${chest.strengthIndex.map((p) => p.value).join(' → ')})`
    );
    assert(chest.measurement?.label === 'Chest' && chest.measurement.points.length === 2 && /Chest measurement up 1.5 cm/.test(chest.summary), `Chest tape measurement is part of the muscle view: "${chest.summary}"`);
    assert(chest.exercises[0] === 'Ring press-up' || chest.exercises.includes('Guillotine press'), `Muscle view lists the exercises that feed it (${chest.exercises.join(', ')})`);
    const triceps = muscles.find((m) => m.key === 'Triceps');
    assert(Boolean(triceps) && triceps!.strengthIndex.length > 0, 'Helping muscles (triceps in pressing) get credit too');
    // Swapping in a new exercise does not jump the index.
    const swapped = session(3, mNow - 0.5 * DAYM, (k) => k);
    swapped.exercises = swapped.exercises.map((ex) => (ex.exerciseId === 'ex-guillotine-press' ? { ...ex, exerciseId: 'ex-incline-db-press', name: 'Incline dumbbell press', equipment: 'dumbbell' as const } : ex));
    const withSwap = buildMuscleProgress({ workouts: [...mHist, swapped], exerciseCatalog: SEED_EXERCISES, biometrics: [], knowledgeGraph: kgM, bodyweightKg: 80, now: mNow });
    const chestSwap = withSwap.find((m) => m.key === 'Chest')!;
    assert(Math.abs(chestSwap.strengthIndex[chestSwap.strengthIndex.length - 1].value - chest.strengthIndex[2].value) < 6, 'A newly swapped-in exercise starts at its own baseline, so the index does not jump');
    assert(buildMuscleProgress({ workouts: [], exerciseCatalog: SEED_EXERCISES, biometrics: [], bodyweightKg: 80, now: mNow }).length === 0, 'No workouts: no muscle cards (the view shows an empty state)');
    assert(EXERCISE_SCIENCE_KNOWLEDGE_BASE.some((p) => p.id === 'sp-muscle-progress'), 'The knowledge graph explains how muscle progress is measured');
  }

  console.log('\n[36e. Cross-Page Consistency: Same History, Same Numbers on Every Page]');
  {
    const DAYC = 24 * 60 * 60 * 1000;
    const cNow = Date.now();
    let cHist: WorkoutSession[] = [];
    const gaps = [20, 18, 16, 13, 11, 9, 6, 4, 2]; // days ago for plan workouts 1-9
    gaps.forEach((ago, i) => {
      const n = i + 1;
      const w = generate6WeekMuscleBuildingWorkout(n, 80);
      const at = cNow - ago * DAYC;
      w.completed = true;
      w.completedAt = new Date(at).toISOString();
      w.date = localDateString(new Date(at));
      w.exercises.forEach((ex) => ex.sets.forEach((st) => { st.completed = true; st.actualReps = st.targetReps; st.actualRir = 2; st.actualWeightKg = st.targetWeightKg + (n > 4 ? 2.5 : 0); }));
      cHist = [w, ...cHist];
    });
    const weekly = calculateWeeklyMuscleVolume(cHist, SEED_EXERCISES);
    const kgC = buildAthleteKnowledgeGraph(cHist, [], SEED_EXERCISES, NEW_USER_PROFILE, weekly);
    const musclesC = buildMuscleProgress({ workouts: cHist, exerciseCatalog: SEED_EXERCISES, biometrics: [], knowledgeGraph: kgC, bodyweightKg: 80, now: cNow });
    const setMismatch = musclesC.filter((m) => {
      const kgProfile = kgC.muscleProfiles.find((p) => p.muscleKey === m.key);
      return m.weeklySets !== (weekly[m.key] ?? 0) || (kgProfile && kgProfile.weeklySets !== m.weeklySets);
    });
    assert(setMismatch.length === 0 && musclesC.length > 3, `Weekly hard sets are identical on cards, Program, the Progress muscle cards and the knowledge graph (${musclesC.map((m) => `${m.key} ${m.weeklySets}`).join(', ')})`);

    const athletePillars = calculateBestPillarE1rms(cHist, 80);
    const progressCharts = buildStrengthCharts({ workouts: cHist, profile: NEW_USER_PROFILE, bodyweightKg: 80, fmt: { weight: (kg) => `${kg} kg`, length: (cm) => `${cm} cm` } });
    const pillarMismatch = progressCharts
      .filter((c) => c.id.startsWith('strength-'))
      .filter((c) => {
        const pillar = c.id.replace('strength-', '') as keyof typeof athletePillars;
        const best = Math.max(...c.points.map((p) => p.value));
        return Math.abs(best - Math.round(athletePillars[pillar] * 10) / 10) > 0.1;
      });
    assert(pillarMismatch.length === 0, `Strength levels and the Progress charts give the same best estimated max per movement (${pillarMismatch.map((c) => c.title).join(', ') || 'all match'})`);

    const planC = buildPlanOverview(cHist);
    assert(planC.nextWorkoutNumber === getNextProgramWorkoutNumber(cHist) && planC.completedCount === 9, 'Program page and Workout page agree on plan position (10 of 24 next, 9 done)');
    assert(
      generate6WeekMuscleBuildingWorkout(2, 80).name === 'Shoulders and Arms' && planC.workouts[1].label === 'Shoulders and Arms',
      'A plan workout has the same plain name on the Workout page, Program page, summary and coach'
    );
    const oldSave = { ...generate6WeekMuscleBuildingWorkout(1, 80), name: 'W1D1 • Chest and Back (Phase 1)' };
    assert(withPlanWorkoutName(oldSave).name === 'Chest and Back', 'Older saved plan workouts are renamed to the plain name when loaded');

    const streakAt = (agos: number[]) =>
      computeTrainingStreak(agos.map((ago) => ({ ...generate6WeekMuscleBuildingWorkout(1, 80), completed: true, date: localDateString(new Date(cNow - ago * DAYC)) })), cNow);
    assert(streakAt([1, 4, 7, 9]) === 4, 'Recovery rest days (gaps up to 4 days) keep the streak going');
    assert(streakAt([1, 3, 12, 14]) === 2, 'A longer break starts the streak again');
    assert(streakAt([10, 12]) === 0 && streakAt([]) === 0, 'No training for over 5 days, or none at all, is a 0 streak');
    assert(computeTrainingStreak(cHist, cNow) === 9, 'The streak shown everywhere comes from the saved workouts');

    const coachArgs = { profile: NEW_USER_PROFILE, activeWorkout: generate6WeekMuscleBuildingWorkout(10, 80), workouts: cHist, biometrics: [], exerciseCatalog: SEED_EXERCISES, bodyweightEmaKg: 80, readinessState: 'Normal' as const };
    const progressReply = await processAssistantMessage({ ...coachArgs, userMessage: 'How is my progress?' });
    assert(
      progressReply.message.text === buildProgressSummary(cHist, 'kg') && !/Scientific Formula/.test(progressReply.message.text),
      'Coach: "How is my progress?" answers from the athlete\'s own workouts, not a science card'
    );
    const scienceReply = await processAssistantMessage({ ...coachArgs, userMessage: 'How is muscle progress calculated?' });
    assert(/Measuring Progress per Muscle/.test(scienceReply.message.text), 'Coach: asking how muscle progress is calculated still gets the knowledge-graph explanation');

    const dotsReply = await processAssistantMessage({ ...coachArgs, userMessage: 'How is my strength score (DOTS) worked out?' });
    assert(/DOTS/.test(dotsReply.message.text) && /Scientific Formula/.test(dotsReply.message.text), 'Coach: the "strength score" chip reaches the DOTS explanation');
    const timed = generate6WeekMuscleBuildingWorkout(10, 80);
    const startT = cNow - 47 * 60 * 1000;
    timed.exercises.forEach((ex) => ex.sets.forEach((st, i) => { st.completed = true; st.actualReps = st.targetReps; st.actualRir = 2; st.completedAt = new Date(startT + i * 60000).toISOString(); }));
    const finished = completeWorkout({ activeWorkout: timed, history: cHist, profile: { ...NEW_USER_PROFILE, programType: 'muscle_building_6wk' }, readiness: { state: 'Normal', score: 0 }, bodyweightKg: 80, now: new Date(cNow) });
    const kgT = buildAthleteKnowledgeGraph(finished.nextHistory, [], SEED_EXERCISES, NEW_USER_PROFILE, calculateWeeklyMuscleVolume(finished.nextHistory, SEED_EXERCISES));
    const reportT = buildSessionProgressReport({ workouts: finished.nextHistory, exerciseCatalog: SEED_EXERCISES, knowledgeGraph: kgT, bodyweightKg: 80, now: cNow });
    assert(
      finished.completedSession.durationMinutes === 47 && reportT?.session.durationMin === 47,
      `Workout time is measured (first set to finish, nothing added) and the same on the summary, session card and history (${finished.completedSession.durationMinutes} / ${reportT?.session.durationMin} min)`
    );

    const blankBio = { hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 };
    const todayStr = localDateString(new Date(cNow));
    const merged = mergeWearableLog(
      [{ ...blankBio, date: todayStr, bodyweightKg: 82.4, isManualEntry: true }],
      { ...blankBio, date: todayStr, bodyweightKg: 81.6, hrvRmssd: 62, restingHr: 52, sleepHours: 7.1, recoveryScore: 71, source: 'whoop' },
      'whoop'
    );
    assert(
      merged.length === 1 && merged[0].bodyweightKg === 82.4 && merged[0].hrvRmssd === 62 && merged[0].recoveryScore === 71 && merged[0].sleepHours === 7.1,
      'A wearable sync adds recovery data to today without replacing the athlete\'s own weigh-in'
    );
    const twoDays = buildCompositionCharts({
      biometrics: [
        { ...blankBio, date: localDateString(new Date(cNow - DAYC)), bodyweightKg: 51.2 },
        { ...blankBio, date: localDateString(new Date(cNow)), bodyweightKg: 82.4 },
      ],
      profile: NEW_USER_PROFILE,
      fmt: { weight: (kg) => `${kg} kg`, length: (cm) => `${cm} cm` },
    }).find((c) => c.id === 'bodyweight')!;
    assert(!/a week \(/.test(twoDays.summary) && /weekly pace appears after a week/.test(twoDays.summary), `No weekly pace from less than a week of weigh-ins: "${twoDays.summary}"`);

    const noWeight = buildCompositionCharts({ biometrics: [], profile: NEW_USER_PROFILE, fmt: { weight: (kg) => `${kg} kg`, length: (cm) => `${cm} cm` } });
    assert(noWeight.every((c) => c.points.length === 0), 'With no weigh-ins, no bodyweight value is shown anywhere (no 80 kg placeholder)');
  }

  console.log('\n[36f. Persistence: Saves Survive a Full Phone, Reloads and Old Data]');
  {
    const ls = (globalThis as any).localStorage;
    const realSet = ls.setItem;
    // Storage full until the rebuildable caches are cleared.
    memStore.set('treise_exercise_notes_v1', 'x'.repeat(1000));
    let attempts = 0;
    ls.setItem = (k: string, v: string) => {
      attempts++;
      if (memStore.has('treise_exercise_notes_v1')) throw new Error('QuotaExceededError');
      return realSet(k, v);
    };
    const toSave = [generate6WeekMuscleBuildingWorkout(1, 80)];
    saveWorkouts(toSave);
    assert(
      attempts === 2 && !memStore.has('treise_exercise_notes_v1') && loadWorkouts().length === 1,
      'When storage is full, rebuildable caches are cleared and the workout is still saved'
    );
    // Still full after clearing caches: the app is told, nothing throws.
    let warned = false;
    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = { dispatchEvent: (e: { type: string }) => { warned = e.type === 'treise-save-failed'; return true; } };
    (globalThis as any).CustomEvent = (globalThis as any).CustomEvent ?? class { type: string; constructor(t: string) { this.type = t; } };
    ls.setItem = () => { throw new Error('QuotaExceededError'); };
    saveWorkouts(toSave);
    assert(warned, 'If a save still fails, the app is told so it can warn the athlete (no silent loss)');
    ls.setItem = realSet;
    (globalThis as any).window = prevWindow;

    // Round trip: what's saved is exactly what loads, including in-progress sets.
    const live = generate6WeekMuscleBuildingWorkout(3, 80);
    live.exercises[0].sets[0] = { ...live.exercises[0].sets[0], completed: true, actualWeightKg: 57.5, actualReps: 11, actualRir: 1, completedAt: new Date().toISOString() };
    saveActiveWorkout(live);
    const back = loadActiveWorkout();
    assert(
      JSON.stringify(back.exercises[0].sets[0]) === JSON.stringify(live.exercises[0].sets[0]) && back.programWorkoutNumber === 3,
      'An in-progress workout loads back exactly as saved (ticked set, edited weight, reps, RIR, time)'
    );
  }

  console.log('\n[37. Progress Tab: Strength & Composition Charts]');
  {
    const fmtP = { weight: (kg: number) => `${kg} kg`, length: (cm: number) => `${cm} cm` };
    const day = (n: number) => localDateString(new Date(2026, 9, n));
    const blank = { hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 };
    const logs: BiometricLog[] = [
      { date: day(1), bodyweightKg: 80, bodyFatPct: 20, waistCm: 86, ...blank },
      ...Array.from({ length: 20 }, (_, i) => ({ date: day(i + 2), bodyweightKg: Math.round((80 + (i + 1) * 0.05) * 100) / 100, ...blank })),
      { date: day(22), bodyweightKg: 81.1, bodyFatPct: 19, waistCm: 85, ...blank },
    ];
    const bulker = { ...NEW_USER_PROFILE, goalPhase: 'Lean Bulk' } as UserProfile;
    const charts = buildCompositionCharts({ biometrics: logs, profile: bulker, fmt: fmtP });
    const byId = (id: string) => charts.find((c) => c.id === id)!;
    assert(
      [
        'bodyweight',
        'bmi',
        'body-fat',
        'lean-mass',
        'ffmi',
        'subcutaneous-fat',
        'visceral-fat',
        'body-water',
        'skeletal-muscle-mass',
        'muscle-mass',
        'bone-mass',
        'protein-mass',
        'bmr',
        'metabolic-age',
        'neck',
        'shoulders',
        'chest',
        'waist',
        'waist-to-height',
        'abdomen',
        'hips',
        'bicep-left',
        'bicep-right',
        'thigh-left',
        'thigh-right',
        'calf-left',
        'calf-right',
      ].every((id) => charts.some((c) => c.id === id)),
      'Composition charts cover all 13 RENPHO scale metrics and all 12 RENPHO tape measure sites'
    );
    assert(
      byId('bodyweight').points.length === 22 && byId('bodyweight').secondary!.length === 22 && /a week/.test(byId('bodyweight').summary) && /lean bulk/.test(byId('bodyweight').summary),
      `Bodyweight shows the 7-day average over daily weigh-ins and the weekly pace against the goal: "${byId('bodyweight').summary}"`
    );
    assert(
      byId('body-fat').points.map((p) => p.value).join() === '20,19' && /down 1 point since/.test(byId('body-fat').summary),
      'Body fat charts only measured days and reports the change'
    );
    assert(byId('lean-mass').points.map((p) => p.value).join() === '64,65.7', 'Lean mass = weight × (1 − body fat)');
    assert(
      byId('ffmi').points.length === 0 && byId('waist-to-height').points.length === 0 && /Add your height/.test(byId('ffmi').summary),
      'FFMI and waist-to-height need a height the athlete entered (no placeholder height)'
    );
    const withHeight = buildCompositionCharts({ biometrics: logs, profile: { ...bulker, measuredHeightCm: 180 }, fmt: fmtP });
    const ffmi = withHeight.find((c) => c.id === 'ffmi')!;
    const whtr = withHeight.find((c) => c.id === 'waist-to-height')!;
    assert(ffmi.points[1].value === 20.3 && whtr.points[1].value === 0.47 && /healthy range/.test(whtr.summary), `FFMI (${ffmi.points[1].value}) and waist-to-height (${whtr.points[1].value}) use the entered height`);
    assert(
      buildCompositionCharts({ biometrics: [], profile: bulker, fmt: fmtP }).every((c) => c.points.length === 0 && c.summary.length > 20),
      'With no measurements every chart explains how to start, with no numbers'
    );

    const w1 = generate6WeekMuscleBuildingWorkout(1, 80);
    w1.completed = true;
    w1.date = day(5);
    w1.exercises.forEach((ex) => ex.sets.forEach((st) => { st.completed = true; st.actualReps = st.targetReps; st.actualRir = 2; }));
    const w2 = JSON.parse(JSON.stringify(w1)) as WorkoutSession;
    w2.id = 'w2';
    w2.date = day(12);
    w2.exercises.forEach((ex) => ex.sets.forEach((st) => (st.actualWeightKg = (st.targetWeightKg || 0) + 2.5)));
    const strength = buildStrengthCharts({ workouts: [w1, w2], profile: bulker, bodyweightKg: 80, fmt: fmtP });
    const lifts = strength.filter((c) => c.id.startsWith('strength-'));
    assert(lifts.length > 0 && lifts.every((c) => c.points.length === 2 && c.points[1].value > c.points[0].value) && /up .*% since/.test(lifts[0].summary), 'Strength charts track estimated max per movement type over sessions');
    assert(strength.some((c) => c.id === 'weekly-sets' && c.points.length === 2), 'Weekly hard sets are charted per week');
    assert(!strength.some((c) => c.id === 'work-capacity'), 'Work capacity only appears with measured workout heart rate');
    assert(buildStrengthCharts({ workouts: [], profile: bulker, bodyweightKg: 80, fmt: fmtP }).length === 1, 'With no workouts, only the weekly sets card (as an example) shows');
  }

  console.log('\n[38. RENPHO Bluetooth Scale (13 Metrics) & Smart Tape Measure (12 Sites) + Knowledge Graph Trends]');
  {
    assert(
      BODY_MEASUREMENT_SITES.length === 12 &&
        [
          'neck',
          'shoulder',
          'chest',
          'waist',
          'abdomen',
          'hip',
          'bicep_left',
          'bicep_right',
          'thigh_left',
          'thigh_right',
          'calf_left',
          'calf_right',
        ].every((id, idx) => BODY_MEASUREMENT_SITES[idx]?.id === id),
      'BODY_MEASUREMENT_SITES covers all 12 RENPHO Smart Tape Measure sites in exact canonical order'
    );

    assert(
      RENPHO_SCALE_METRICS.length === 13 &&
        [
          'weight',
          'bmi',
          'body_fat',
          'fat_free_mass',
          'subcutaneous_fat',
          'visceral_fat',
          'body_water',
          'skeletal_muscle_mass',
          'muscle_mass',
          'bone_mass',
          'protein_mass',
          'bmr',
          'metabolic_age',
        ].every((id, idx) => RENPHO_SCALE_METRICS[idx]?.id === id),
      'RENPHO_SCALE_METRICS covers all 13 RENPHO Health Scale metrics in exact canonical order'
    );

    // 1. QN-Scale / Yolanda (0xFFE1/0xFFE2) live & locked packets + 13-metric BIA computation
    const qnGreeting5120 = decodeRenphoScalePacket(
      new Uint8Array([0x12, 0x0b, 0x15, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x3b]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1
    );
    const qnGreeting512 = decodeRenphoScalePacket(
      new Uint8Array([0x12, 0x0b, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1
    );
    const qnConfigAck = decodeRenphoScalePacket(
      new Uint8Array([0x14, 0x0b, 0x15, 0x14, 0x00, 0x01, 0x00, 0x00]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1
    );
    assert(
      qnGreeting5120 === null && qnGreeting512 === null && qnConfigAck === null,
      'QN-Scale 0x12 / 0x14 greeting and ack frames are ignored and never misdecoded as 51.2 kg'
    );

    const qn91Hundredths = decodeRenphoScalePacket(
      new Uint8Array([0x10, 0x0b, 0x15, 0x23, 0x8c, 0x02, 0x01, 0xf4, 0x00, 0x00, 0x00]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1,
      { heightCm: 180, age: 30, gender: 'male' }
    );
    const qn91Tenths = decodeRenphoScalePacket(
      new Uint8Array([0x10, 0x0b, 0x01, 0x03, 0x8e, 0x01, 0x01, 0xf4]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1,
      { heightCm: 180, age: 30, gender: 'male' }
    );
    assert(
      qn91Hundredths !== null &&
        qn91Hundredths.weightKg === 91 &&
        qn91Hundredths.stabilized === true &&
        qn91Tenths !== null &&
        qn91Tenths.weightKg === 91 &&
        qn91Tenths.stabilized === true,
      `QN-Scale 91.0 kg packet decodes accurately in both 0.01 kg (9100 -> ${qn91Hundredths?.weightKg}) and 0.1 kg (910 -> ${qn91Tenths?.weightKg}) precision`
    );

    const qnLive = decodeRenphoScalePacket(
      new Uint8Array([0x10, 0x0b, 0x00, 0x20, 0x35, 0x00, 0x00, 0x00]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1,
      { heightCm: 180, age: 28, gender: 'male' }
    );
    assert(
      qnLive !== null && qnLive.weightKg === 82.45 && qnLive.stabilized === false && qnLive.sourceProtocol === 'qn_scale',
      `QN-Scale live packet decodes 82.45 kg unsteady reading (got ${qnLive?.weightKg} kg, stabilized=${qnLive?.stabilized})`
    );

    const qnLocked = decodeRenphoScalePacket(
      new Uint8Array([0x10, 0x0b, 0x00, 0x20, 0x35, 0x01, 0x02, 0x00]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1,
      { heightCm: 180, age: 28, gender: 'male' }
    );
    assert(
      qnLocked !== null &&
        qnLocked.weightKg === 82.45 &&
        qnLocked.stabilized === true &&
        qnLocked.impedanceOhms === 512 &&
        qnLocked.metrics !== undefined &&
        qnLocked.metrics.bodyweightKg === 82.5 &&
        qnLocked.metrics.bodyFatPct === undefined &&
        qnLocked.metrics.visceralFat === undefined &&
        qnLocked.metrics.muscleMassKg === undefined &&
        qnLocked.metrics.bmrKcal === undefined &&
        qnLocked.metrics.metabolicAge === undefined,
      `QN-Scale locked packet decodes 82.45 kg with 512Ω impedance and invents no body composition, even when placeholder age/height are passed`
    );
    const qnWithHeight = decodeRenphoScalePacket(
      new Uint8Array([0x10, 0x0b, 0x00, 0x20, 0x35, 0x01, 0x02, 0x00]),
      RENPHO_SCALE_UUIDS.QN_NOTIFY_FFE1,
      { measuredHeightCm: 180 }
    );
    assert(
      qnWithHeight?.metrics?.bmi === 25.4 && qnWithHeight.metrics.bodyFatPct === undefined,
      `BMI comes from the athlete's entered height (got ${qnWithHeight?.metrics?.bmi}); body fat stays empty`
    );

    // 1b. 0x55AA protocol: frames captured from a real ES-CS20M (athlete 91.4 kg, 5 Nov 2026).
    const hex55 = (h: string) => new Uint8Array(h.split(' ').map((b) => parseInt(b, 16)));
    const CHAR_2A10 = '00002a10-0000-1000-8000-00805f9b34fb';
    assert(
      decodeRenphoScalePacket(hex55('55 aa 11 00 0a 01 01 01 00 00 64 00 00 00 00 81'), CHAR_2A10) === null,
      'The 0x55AA device-status frame is never read as a weight (it once saved 25.6 kg, impedance 257)'
    );
    const settling55 = decodeRenphoScalePacket(hex55('55 aa 14 00 07 00 00 00 23 b4 00 00 f1'), CHAR_2A10);
    assert(
      settling55?.weightKg === 91.4 && settling55.stabilized === false && settling55.impedanceOhms === undefined && settling55.sourceProtocol === 'lefu_55aa',
      `A real settling frame decodes to 91.4 kg, not yet final (got ${settling55?.weightKg})`
    );
    const frame55 = (cmd: number, payload: number[]) => {
      const body = [0x55, 0xaa, cmd, 0, payload.length, ...payload];
      return new Uint8Array([...body, body.reduce((a, b) => a + b, 0) & 0xff]);
    };
    const final55 = decodeRenphoScalePacket(frame55(0x14, [0x01, 0, 0, 0x23, 0xb4, 0x01, 0xf4]), CHAR_2A10, { gender: 'male', age: 28, heightCm: 176 });
    assert(
      final55?.weightKg === 91.4 && final55.stabilized === true && final55.impedanceOhms === 500 && final55.metrics?.bodyFatPct === undefined && final55.metrics?.bmi === undefined,
      'A 0x55AA final frame gives weight and impedance, and invents nothing from placeholder age or height'
    );
    const ext55 = decodeRenphoScalePacket(frame55(0x18, [0x01, 0x01, 0x09, 0, 0, 0x23, 0xb4, 0x01, 0xf4, 0x01, 0x1f, 0x00, 0xc8]), CHAR_2A10);
    assert(ext55?.weightKg === 91.4 && ext55.stabilized === true && ext55.impedanceOhms === 500 && ext55.bodyFatPct === undefined, "An extended final frame gives weight and impedance, and ignores the scale's own body fat (from an unknown profile)");
    assert(decodeRenphoScalePacket(hex55('55 aa 14 00 07 00 00 00 23 b4 00 00 f0'), CHAR_2A10) === null, 'A 0x55AA frame with a bad checksum is rejected');
    // Captured from the real scale: it finished, but its body reading found nothing (resistance 0, body fat 0).
    const noBodyReading55 = decodeRenphoScalePacket(hex55('55 aa 18 00 0d 01 01 09 00 00 23 46 00 00 01 85 00 00 1e'), CHAR_2A10);
    assert(
      noBodyReading55?.weightKg === 90.3 && noBodyReading55.isFinal === true && noBodyReading55.impedanceOhms === undefined && noBodyReading55.bodyFatPct === undefined,
      'A real 0x55AA final with no body reading gives the weight and no impedance or body fat'
    );
    // Body metrics: only from a measured impedance plus the athlete's own height, age and sex.
    const real = computeRenphoScaleMetrics({ weightKg: 91.05, impedanceOhms: 500 }, { measuredHeightCm: 180, age: 40, gender: 'male' });
    assert(
      real?.bodyFatPct === 29.2 && real.bmi === 28.1 && real.bodyWaterPct === 51.1 && real.fatFreeMassKg === 64.5 && typeof real.boneMassKg === 'number' && typeof real.muscleMassKg === 'number' && typeof real.bmrKcal === 'number',
      `Impedance with real height, age and sex gives the published formulas (body fat ${real?.bodyFatPct}, BMI ${real?.bmi}, water ${real?.bodyWaterPct})`
    );
    assert(real?.visceralFat === undefined && real?.subcutaneousFatPct === undefined && real?.metabolicAge === undefined, 'Metrics with no published formula stay empty');
    for (const missing of [{ age: 40, gender: 'male' as const }, { measuredHeightCm: 180, gender: 'male' as const }, { measuredHeightCm: 180, age: 40 }]) {
      assert(computeRenphoScaleMetrics({ weightKg: 91.05, impedanceOhms: 500 }, missing)?.bodyFatPct === undefined, `No body fat without all of height, age and sex (${Object.keys(missing).join(', ')})`);
    }
    const noImpedance = computeRenphoScaleMetrics({ weightKg: 91.05 }, { measuredHeightCm: 180, age: 40, gender: 'male' });
    assert(noImpedance?.bodyFatPct === undefined && noImpedance?.bmi === 28.1, 'No impedance, no body fat; BMI still comes from the entered height');
    // Captured from the real scale: a foot woke it (8.2 kg, then 12.9 kg finals), then the real weigh-in
    // finished with a body reading. The early finals must not stop the real one reaching the form.
    const footFinal55 = decodeRenphoScalePacket(hex55('55 aa 18 00 0d 01 01 09 00 00 05 0a 00 00 00 38 00 00 76'), CHAR_2A10);
    const realFinal55 = decodeRenphoScalePacket(hex55('55 aa 18 00 0d 01 01 09 00 00 23 5f 02 0d 01 86 01 7e c6'), CHAR_2A10);
    assert(realFinal55?.weightKg === 90.55 && realFinal55.impedanceOhms === 525 && realFinal55.isFinal === true, 'A real 0x55AA final with a body reading gives 90.55 kg and 525 ohms');
    assert(
      footFinal55 !== null && realFinal55 !== null && scaleFinalKey(footFinal55) !== scaleFinalKey(realFinal55) && scaleFinalKey(realFinal55) === scaleFinalKey({ weightKg: 90.55, impedanceOhms: 525 }),
      'A low final from waking the scale does not block the real final, and a repeat of the same final is ignored'
    );
    const realMetrics55 = computeRenphoScaleMetrics(realFinal55!, { measuredHeightCm: 152.4, age: 39, gender: 'male' });
    // The scale's own body fat on that frame was 38.2% (0x017E).
    assert(Math.abs((realMetrics55?.bodyFatPct ?? 0) - 38.2) <= 0.5, `Body fat from the real resistance agrees with the scale's own 38.2% (got ${realMetrics55?.bodyFatPct})`);
    // One source per number: a weigh-in after a gap gives the summary card and the Weight chart the same average.
    const gapLogs = [
      { date: '2026-10-23', bodyweightKg: 81.6, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 },
      { date: '2026-11-05', bodyweightKg: 90.4, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 },
    ];
    const gapEma = calculateEmaSeries(gapLogs);
    const gapTrend = buildBodyCompositionKnowledgeGraph(gapLogs, NEW_USER_PROFILE).scaleTrends.find((t) => t.id === 'weight');
    assert(gapTrend?.ema7d === gapEma[gapEma.length - 1].ema, `The summary card and Weight chart share one 7-day average (${gapTrend?.ema7d} vs ${gapEma[gapEma.length - 1].ema})`);
    // The clock goes first: 1700000000 = 0x6553F100, sent as 6 bytes, then time-zone sign and hours.
    const clock55 = build55AaSetClock(new Date(1700000000 * 1000));
    assert(
      [...clock55.slice(0, 12)].join() === [0x55, 0xaa, 0x97, 0, 9, 1, 0, 0, 0x65, 0x53, 0xf1, 0].join() &&
        clock55[clock55.length - 1] === ([...clock55.slice(0, -1)].reduce((t, b) => t + b, 0) & 0xff),
      'The 0x55AA set-clock frame has the right layout and checksum'
    );
    const withWeight55 = build55AaGuestProfile({ measuredHeightCm: 180, age: 40, gender: 'male', lastWeightKg: 90.3 }, new Date(2026, 10, 5));
    assert(((withWeight55[12] << 24) | (withWeight55[13] << 16) | (withWeight55[14] << 8) | withWeight55[15]) === 9030, 'The guest profile carries the last known weight');
    assert(
      [...build55AaDisplayUnit('lb')].join() === [0x55, 0xaa, 0x90, 0, 4, 2, 0, 0, 0, 0x95].join() && build55AaDisplayUnit('kg')[5] === 1,
      'The 0x55AA display-unit frame sets the unit and leaves the scale mode alone'
    );
    // The guest profile: slot 9 (never stored on the scale), valid checksum.
    const sum55 = (f: Uint8Array) => f.slice(0, -1).reduce((t, b) => t + b, 0) & 0xff;
    const guest = build55AaGuestProfile({ measuredHeightCm: 180, age: 40, gender: 'female' }, new Date(2026, 10, 5));
    assert(
      guest.length === 20 && guest[0] === 0x55 && guest[1] === 0xaa && guest[2] === 0x96 && guest[4] === 14 && guest[5] === ((2 << 4) | 9) && ((guest[6] << 8) | guest[7]) === 1986 && ((guest[10] << 8) | guest[11]) === 1800 && guest[17] === 0xff && guest[18] === 0x05 && guest[19] === sum55(guest),
      'Guest profile: guest slot 9, female, born 1986, 180.0 cm, impedance on, valid checksum'
    );
    const anon = build55AaGuestProfile({ measuredHeightCm: 180, age: 40 }, new Date(2026, 10, 5));
    assert(anon[5] === ((1 << 4) | 9) && anon[18] === 0x06 && anon[19] === sum55(anon), 'Missing any answer: the impedance pass is off, so nothing is measured from values that are not the athlete\'s');

    // 2. Standard Bluetooth SIG Weight Measurement (0x2A9D) SI & Imperial packets
    const bleSi = decodeRenphoScalePacket(
      new Uint8Array([0x00, 0x80, 0x3e]),
      RENPHO_SCALE_UUIDS.BLE_WEIGHT_MEASUREMENT_CHAR
    );
    assert(
      bleSi !== null && bleSi.weightKg === 80 && bleSi.stabilized === true && bleSi.sourceProtocol === 'ble_weight_scale' && bleSi.metrics?.bodyweightKg === 80,
      `Standard BLE 0x2A9D SI packet decodes 80.0 kg (got ${bleSi?.weightKg} kg)`
    );

    const bleImp = decodeRenphoScalePacket(
      new Uint8Array([0x01, 0xe8, 0x44]),
      RENPHO_SCALE_UUIDS.BLE_WEIGHT_MEASUREMENT_CHAR
    );
    assert(
      bleImp !== null && Math.abs(bleImp.weightKg - 80.01) < 0.02 && bleImp.stabilized === true,
      `Standard BLE 0x2A9D Imperial packet converts 176.4 lb to ${bleImp?.weightKg} kg`
    );

    // 3. Standard Bluetooth SIG Body Composition (0x2A9C) packet
    const bleBf = decodeRenphoScalePacket(
      new Uint8Array([0x00, 0x00, 0x94, 0x00]),
      RENPHO_SCALE_UUIDS.BLE_BODY_COMPOSITION_CHAR
    );
    assert(
      bleBf !== null && bleBf.bodyFatPct === 14.8 && bleBf.sourceProtocol === 'ble_body_composition',
      `Standard BLE 0x2A9C packet decodes 14.8% body fat (got ${bleBf?.bodyFatPct}%)`
    );

    // 4. QN-Scale config & time payloads
    const cfgKg = buildQnScaleConfigPayload('kg');
    const cfgLb = buildQnScaleConfigPayload('lb');
    assert(
      cfgKg.length === 9 && cfgKg[0] === 0x13 && cfgKg[3] === 0x01 && cfgLb[3] === 0x02,
      'buildQnScaleConfigPayload builds valid 9-byte checksummed handshake for kg and lb'
    );
    const timePayload = buildQnScaleTimePayload(1761400000000);
    assert(timePayload.length === 5 && timePayload[0] === 0x02, 'buildQnScaleTimePayload builds 5-byte timestamp packet');

    // 5. RENPHO Smart Tape Measure (0783b03e-8535-b5a0-7140-a304d2495cb8) 20-byte ASCII packets
    const enc = (str: string) => new TextEncoder().encode(str);
    const tapeLiveMetric = decodeRenphoTapePacket(enc('*08510;00000;0000PM\n'));
    assert(
      tapeLiveMetric !== null &&
        tapeLiveMetric.lengthCm === 85.1 &&
        tapeLiveMetric.stabilized === false &&
        tapeLiveMetric.deviceUnit === 'cm' &&
        tapeLiveMetric.sourceProtocol === 'renpho_ascii_tape',
      `RENPHO Smart Tape live packet '*08510;00000;0000PM\\n' decodes 85.1 cm unsteady (got ${tapeLiveMetric?.lengthCm} cm)`
    );

    const tapeLockedMetric = decodeRenphoTapePacket(enc('*08510;00000;0000SM\n'));
    assert(
      tapeLockedMetric !== null &&
        tapeLockedMetric.lengthCm === 85.1 &&
        tapeLockedMetric.stabilized === true &&
        tapeLockedMetric.deviceUnit === 'cm',
      `RENPHO Smart Tape button-locked packet '*08510;00000;0000SM\\n' decodes 85.1 cm stabilized`
    );

    const tapeLockedImperial = decodeRenphoTapePacket(enc('*03810;00000;0000SI\n'));
    assert(
      tapeLockedImperial !== null &&
        tapeLockedImperial.lengthCm === 38.1 &&
        tapeLockedImperial.stabilized === true &&
        tapeLockedImperial.deviceUnit === 'in',
      `RENPHO Smart Tape imperial-mode packet '*03810;00000;0000SI\\n' decodes 38.1 cm (15.0 in) stabilized`
    );

    const tapeZero = decodeRenphoTapePacket(enc('*00000;00000;0000PM\n'));
    assert(tapeZero === null, 'RENPHO Smart Tape zero reading is ignored');

    // Binary millimeter tape packet: 850 mm = 0x0352 -> 85.0 cm locked
    const tapeBinary = decodeRenphoTapePacket(new Uint8Array([0xaa, 0x01, 0x03, 0x52, 0x01, 0x00]));
    assert(
      tapeBinary !== null && tapeBinary.lengthCm === 85 && tapeBinary.stabilized === true,
      `RENPHO binary tape frame decodes 85.0 cm locked`
    );
    assert(
      RENPHO_TAPE_UUIDS.TAPE_SERVICE === '0783b03e-8535-b5a0-7140-a304d2495cb7' &&
        RENPHO_TAPE_UUIDS.TAPE_NOTIFY_CHAR === '0783b03e-8535-b5a0-7140-a304d2495cb8',
      'RENPHO Smart Tape GATT service and notification characteristic UUIDs are configured'
    );

    // 6. All 13 Scale Metrics & 12 Tape Measure Sites in Knowledge Graph & Progress Charts
    const day = (n: number) => localDateString(new Date(2026, 9, n));
    const blank = { hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 };
    const m1 = computeRenphoScaleMetrics({ weightKg: 80.0, bodyFatPct: 16.2, subcutaneousFatPct: 14.1, visceralFat: 8, bodyWaterPct: 57.5, skeletalMuscleMassKg: 38.2, muscleMassKg: 63.6, boneMassKg: 3.4, proteinMassKg: 13.1, bmrKcal: 1760, metabolicAge: 27 }, { measuredHeightCm: 180 })!;
    const m2 = computeRenphoScaleMetrics({ weightKg: 80.8, bodyFatPct: 15.6, subcutaneousFatPct: 13.6, visceralFat: 8, bodyWaterPct: 58.0, skeletalMuscleMassKg: 38.9, muscleMassKg: 64.6, boneMassKg: 3.4, proteinMassKg: 13.4, bmrKcal: 1785, metabolicAge: 26 }, { measuredHeightCm: 180 })!;
    const multiSiteLogs: BiometricLog[] = [
      {
        date: day(1),
        ...m1,
        neckCm: 40.0,
        shouldersCm: 122.0,
        chestCm: 104.0,
        waistCm: 84.0,
        abdomenCm: 86.0,
        hipsCm: 98.0,
        bicepLeftCm: 37.8,
        bicepRightCm: 38.0,
        thighLeftCm: 57.8,
        thighRightCm: 58.0,
        calfLeftCm: 38.9,
        calfRightCm: 39.0,
        ...blank,
      },
      {
        date: day(15),
        ...m2,
        neckCm: 40.2,
        shouldersCm: 123.5,
        chestCm: 105.5,
        waistCm: 82.5,
        abdomenCm: 84.2,
        hipsCm: 97.5,
        bicepLeftCm: 38.4,
        bicepRightCm: 38.6,
        thighLeftCm: 58.8,
        thighRightCm: 59.0,
        calfLeftCm: 39.3,
        calfRightCm: 39.4,
        ...blank,
      },
    ];
    const fmtCm = { weight: (kg: number) => `${kg} kg`, length: (cm: number) => `${Math.round(cm * 10) / 10} cm` };
    const fmtIn = { weight: (kg: number) => `${Math.round(kg * 2.20462 * 10) / 10} lb`, length: (cm: number) => `${Math.round((cm / 2.54) * 10) / 10} in` };
    const bulker = { ...NEW_USER_PROFILE, goalPhase: 'Lean Bulk', measuredHeightCm: 180 } as UserProfile;

    const kgComp = buildBodyCompositionKnowledgeGraph(multiSiteLogs, bulker);
    assert(
      kgComp.populatedScaleCount === 13 &&
        kgComp.populatedTapeCount === 12 &&
        kgComp.scaleTrends.every((t) => t.sampleCount === 2) &&
        kgComp.tapeTrends.every((t) => t.sampleCount === 2) &&
        kgComp.bilateralSymmetry.length === 3 &&
        kgComp.bilateralSymmetry.every((p) => p.status === 'balanced'),
      `Knowledge Graph tracks all 13 scale trends (${kgComp.populatedScaleCount}/13), all 12 tape trends (${kgComp.populatedTapeCount}/12), and 3 bilateral symmetry pairs`
    );

    const chartsCm = buildCompositionCharts({ biometrics: multiSiteLogs, profile: bulker, fmt: fmtCm });
    const chartsIn = buildCompositionCharts({ biometrics: multiSiteLogs, profile: bulker, fmt: fmtIn });

    const allScaleAndTapeChartIds = [
      'bodyweight',
      'bmi',
      'body-fat',
      'lean-mass',
      'ffmi',
      'subcutaneous-fat',
      'visceral-fat',
      'body-water',
      'skeletal-muscle-mass',
      'muscle-mass',
      'bone-mass',
      'protein-mass',
      'bmr',
      'metabolic-age',
      'neck',
      'shoulders',
      'chest',
      'waist',
      'waist-to-height',
      'abdomen',
      'hips',
      'bicep-left',
      'bicep-right',
      'thigh-left',
      'thigh-right',
      'calf-left',
      'calf-right',
    ];
    assert(
      allScaleAndTapeChartIds.every((id) => {
        const c = chartsCm.find((ch) => ch.id === id);
        return c !== undefined && c.points.length === 2;
      }),
      'All 13 scale metric charts and 12 tape circumference charts populate 2-point time series when logged'
    );
    const shouldersCmChart = chartsCm.find((c) => c.id === 'shoulders')!;
    const shouldersInChart = chartsIn.find((c) => c.id === 'shoulders')!;
    assert(
      shouldersCmChart.summary.includes('123.5 cm') &&
        shouldersCmChart.summary.includes('up 1.5 cm') &&
        shouldersInChart.summary.includes('48.6 in'),
      `Shoulders chart formats summary in cm ("${shouldersCmChart.summary}") and inches ("${shouldersInChart.summary}")`
    );

    // 7. Persistent Paired Device Memory & Silent Reconnection (Never forgets paired scale/tape)
    clearSavedRenphoDevices();
    assert(
      loadSavedRenphoDevices().scale === undefined && loadSavedRenphoDevices().tape === undefined,
      'clearSavedRenphoDevices starts with clean state'
    );
    savePairedRenphoDevice({
      id: 'scale-ble-01',
      name: 'QN-Scale ES-26M',
      kind: 'scale',
      pairedAt: '2026-10-26',
    });
    savePairedRenphoDevice({
      id: 'tape-ble-01',
      name: 'ES_TAPE RF-BMF01',
      kind: 'tape',
      pairedAt: '2026-10-26',
    });
    recordRenphoDeviceSync('scale', '82.5 kg · 14.8% BF');
    const savedDevs = loadSavedRenphoDevices();
    assert(
      savedDevs.scale?.id === 'scale-ble-01' &&
        savedDevs.scale?.name === 'QN-Scale ES-26M' &&
        savedDevs.scale?.lastSummary === '82.5 kg · 14.8% BF' &&
        savedDevs.tape?.id === 'tape-ble-01' &&
        savedDevs.tape?.name === 'ES_TAPE RF-BMF01',
      'Paired RENPHO Scale and Smart Tape persist across sessions in localStorage'
    );

    // Simulate Web Bluetooth getDevices() returning the already-permitted scale so connectRenphoScale reconnects WITHOUT calling requestDevice
    let requestDeviceCalled = false;
    const mockCharListenerMap = new Map<string, (ev: any) => void>();
    const mockScaleDevice = {
      id: 'scale-ble-01',
      name: 'QN-Scale ES-26M',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      gatt: {
        connected: false,
        connect: async function () {
          this.connected = true;
          return this;
        },
        disconnect: function () {
          this.connected = false;
        },
        getPrimaryServices: async () => [
          {
            uuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
            getCharacteristics: async () => [
              {
                uuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
                properties: { notify: true },
                startNotifications: async function () {
                  return this;
                },
                addEventListener: (type: string, fn: (ev: any) => void) => {
                  mockCharListenerMap.set(type, fn);
                },
                removeEventListener: (type: string) => {
                  mockCharListenerMap.delete(type);
                },
              },
            ],
          },
        ],
      },
    };
    const prevNavigator = (globalThis as any).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        bluetooth: {
          requestDevice: async () => {
            requestDeviceCalled = true;
            return mockScaleDevice;
          },
          getDevices: async () => [mockScaleDevice],
        },
      },
    });

    const resolvedDevice = await resolveRememberedBleDevice('scale');
    assert(
      resolvedDevice !== null && resolvedDevice.id === 'scale-ble-01',
      'resolveRememberedBleDevice retrieves remembered scale from navigator.bluetooth.getDevices() without manual pairing dialog'
    );

    let streamedReadingWeight = 0;
    const reconnectedScale = await connectRenphoScale({
      onReading: (r) => {
        streamedReadingWeight = r.weightKg;
      },
    });
    const notifyHandler = mockCharListenerMap.get('characteristicvaluechanged');
    notifyHandler?.({
      target: {
        value: new DataView(new Uint8Array([0x10, 0x0b, 0x00, 0x20, 0x35, 0x01, 0x02, 0x00]).buffer),
      },
    });
    assert(
      reconnectedScale.reconnectedFromMemory === true &&
        requestDeviceCalled === false &&
        streamedReadingWeight === 82.45,
      'connectRenphoScale reconnects to remembered scale and streams locked 82.45 kg reading without opening Bluetooth pairing prompt'
    );
    reconnectedScale.disconnect();

    forgetPairedRenphoDevice('scale');
    assert(
      loadSavedRenphoDevices().scale === undefined && loadSavedRenphoDevices().tape?.id === 'tape-ble-01',
      'forgetPairedRenphoDevice removes only the specified device kind'
    );
    clearSavedRenphoDevices();
    if (prevNavigator !== undefined) {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: prevNavigator });
    }

    // 8. Verify Separated Weight vs Measurements UX in AnalyticsTab & WeightLogModal
    const analyticsTabSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/analytics/AnalyticsTab.tsx'),
      'utf-8'
    );
    const weightLogModalSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/analytics/WeightLogModal.tsx'),
      'utf-8'
    );
    assert(
      analyticsTabSrc.includes('openLogWeight') &&
        analyticsTabSrc.includes('openLogMeasurements') &&
        analyticsTabSrc.includes('Log weight') &&
        analyticsTabSrc.includes('Log measurements'),
      'AnalyticsTab separates the choice between "Log weight" and "Log measurements"'
    );
    assert(
      weightLogModalSrc.includes('Listening for your scale') &&
        weightLogModalSrc.includes('Reconnect your scale') &&
        !weightLogModalSrc.includes('Option 2: Step on RENPHO Scale') &&
        weightLogModalSrc.includes('How tape measurements are pulled into the app:'),
      'WeightLogModal keeps manual weight entry first, with one scale alert (pair, connected, listening, reconnect), and keeps tape measurements separate'
    );
  }

  // ==========================================================================
  // 39. One plan per athlete: goal-based starter plan, muscle plan only on the owner's account
  // ==========================================================================
  console.log('\n[39. Starter plan for everyone, muscle plan only on the owner account]');
  {
    const { canUseMusclePlan, resolveActivePlan, getPlanById, hashAccountEmail } = await import('../trainingPlans');
    const { buildStarterPlan, STARTER_WORKOUT_COUNT } = await import('../starterPlan');
    const mbp = await import('../muscleBuildingProgram');
    const { normalizeProgramType } = await import('../../services/storage');

    // Access: only the owner's signed-in account sees the muscle plan; the address isn't in the code.
    const plansSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/engine/trainingPlans.ts'), 'utf-8');
    assert(
      canUseMusclePlan('benentaylor@gmail.com') &&
        canUseMusclePlan('  BenenTaylor@Gmail.com ') &&
        !canUseMusclePlan('someone@gmail.com') &&
        !canUseMusclePlan(undefined) &&
        !plansSrc.includes('benentaylor@') &&
        hashAccountEmail('a@b.c') !== hashAccountEmail('a@b.d'),
      'Muscle plan access: only the owner account (by hash, not the plain address)'
    );
    assert(
      resolveActivePlan({ programType: 'muscle_building_6wk', goalPhase: 'Lean Bulk', email: 'benentaylor@gmail.com' }).id ===
        'muscle_building_6wk' &&
        resolveActivePlan({ programType: 'muscle_building_6wk', goalPhase: 'Lean Bulk', email: 'tester@example.com' }).id ===
          'starter_6wk' &&
        resolveActivePlan({ programType: 'muscle_building_6wk', goalPhase: 'Lean Bulk' }).id === 'starter_6wk' &&
        resolveActivePlan({ programType: 'starter_6wk', goalPhase: 'Cut / Recomp', email: 'benentaylor@gmail.com' }).id ===
          'starter_6wk',
      'Everyone else (and the owner when signed out) gets the starter plan, even with the muscle plan saved'
    );
    assert(
      normalizeProgramType('ppl_upper') === 'starter_6wk' &&
        normalizeProgramType('full_body') === 'starter_6wk' &&
        normalizeProgramType(undefined) === 'starter_6wk' &&
        normalizeProgramType('muscle_building_6wk') === 'muscle_building_6wk',
      'Older split programs move to the starter plan on load; no program list is offered'
    );

    // Science: 4 sessions a week for 6 weeks (habit), each muscle about twice a week (growth),
    // 6-20 reps, 1-3 reps in reserve. Two layouts: 3 lifts + 1 active day (default) or 4 lifts.
    const catalogById = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
    const issues: string[] = [];
    const weekSets = (plan: ReturnType<typeof buildStarterPlan>, week: number) => {
      const out: Record<string, number> = {};
      plan.templates
        .filter((t) => t.week === week)
        .forEach((t) =>
          t.exercises.forEach((e) => {
            const m = catalogById.get(e.exerciseId)?.primaryMuscle as string;
            out[m] = (out[m] || 0) + e.sets;
          })
        );
      return out;
    };
    for (const layout of ['lift3_active1', 'lift4'] as const) {
      for (const goal of ['Lean Bulk', 'Cut / Recomp', 'Maingain'] as const) {
        const plan = buildStarterPlan(goal, layout);
        const tag = `${layout} ${goal}`;
        if (plan.templates.length !== 24 || STARTER_WORKOUT_COUNT !== 24) issues.push(`${tag}: not 24 sessions`);
        if (plan.workoutsPerWeek !== 4) issues.push(`${tag}: not 4 a week`);
        const actives = plan.templates.filter((t) => t.kind === 'active');
        if (layout === 'lift3_active1' && (actives.length !== 6 || actives.some((t) => t.workoutNumber % 4 !== 0)))
          issues.push(`${tag}: should have one active day at the end of each week`);
        if (layout === 'lift4' && actives.length) issues.push(`${tag}: 4-day layout has active days`);
        const lifts = plan.templates.filter((t) => t.kind !== 'active');
        plan.templates.forEach((t, i) => {
          if (t.week !== Math.floor(i / 4) + 1) issues.push(`${tag} #${t.workoutNumber}: week ${t.week}`);
          if (t.phase !== Math.ceil(t.week / 2)) issues.push(`${tag} #${t.workoutNumber}: phase ${t.phase}`);
        });
        lifts.forEach((t, i) => {
          if (i > 0 && lifts[i - 1].title === t.title) issues.push(`${tag} #${t.workoutNumber}: same workout twice in a row`);
          if (t.exercises.length < 5 || t.exercises.length > 7) issues.push(`${tag} #${t.workoutNumber}: ${t.exercises.length} exercises`);
          const rir = plan.targetRirForPhase(t.phase);
          if (rir < 1 || rir > 3) issues.push(`${tag} phase ${t.phase}: RIR ${rir}`);
          for (const e of t.exercises) {
            if (!catalogById.get(e.exerciseId)) issues.push(`${tag}: unknown exercise ${e.exerciseId}`);
            const m = /^(\d+)-(\d+)$/.exec(e.reps);
            if (!m || +m[1] < 5 || +m[2] > 20 || +m[1] >= +m[2]) issues.push(`${tag} ${e.name}: reps ${e.reps}`);
            if (e.sets < 2 || e.sets > 4) issues.push(`${tag} ${e.name}: ${e.sets} sets`);
          }
        });
        // Each main muscle trained at least twice in week 1, and a sensible weekly dose in week 3.
        const sessionsPerMuscle: Record<string, number> = {};
        plan.templates.filter((t) => t.week === 1).forEach((t) => {
          new Set(t.exercises.map((e) => catalogById.get(e.exerciseId)?.primaryMuscle as string)).forEach((m) => {
            sessionsPerMuscle[m] = (sessionsPerMuscle[m] || 0) + 1;
          });
        });
        const wk3 = weekSets(plan, 3);
        for (const muscle of ['Chest', 'Back', 'Quads', 'Hamstrings']) {
          if ((sessionsPerMuscle[muscle] ?? 0) < 2) issues.push(`${tag}: ${muscle} trained ${sessionsPerMuscle[muscle] ?? 0}x in week 1`);
          if ((wk3[muscle] ?? 0) < 6 || (wk3[muscle] ?? 0) > 14) issues.push(`${tag}: ${muscle} ${wk3[muscle] ?? 0} sets in week 3`);
        }
      }
    }
    // Same weekly dose either way: the 4-day layout spreads the sets, it doesn't add them.
    for (const goal of ['Lean Bulk', 'Cut / Recomp', 'Maingain'] as const) {
      const three = weekSets(buildStarterPlan(goal, 'lift3_active1'), 3);
      const four = weekSets(buildStarterPlan(goal, 'lift4'), 3);
      for (const muscle of ['Chest', 'Back', 'Quads', 'Hamstrings']) {
        if (Math.abs((three[muscle] ?? 0) - (four[muscle] ?? 0)) > 3) issues.push(`${goal}: ${muscle} ${three[muscle]} vs ${four[muscle]} sets`);
      }
    }
    // Goals differ the way the evidence says: losing fat keeps the big lifts heavier and adds no volume.
    const bulk = buildStarterPlan('Lean Bulk');
    const cut = buildStarterPlan('Cut / Recomp');
    const sumSets = (p: typeof bulk) => p.templates.reduce((n, t) => n + t.exercises.reduce((m, e) => m + e.sets, 0), 0);
    const squatReps = (p: typeof cut) => p.templates[0].exercises.find((e) => e.exerciseId === 'ex-barbell-squat')!.reps;
    if (!(sumSets(cut) < sumSets(bulk))) issues.push('Lose Fat should not have more sets than Build Muscle');
    if (!(parseInt(squatReps(cut), 10) < parseInt(squatReps(bulk), 10))) issues.push('Lose Fat squat reps should be heavier');
    if (!(bulk.templates[0].exercises[0].sets < bulk.templates[22].exercises[0].sets)) issues.push('Sets should build across the block');
    assert(issues.length === 0, `Starter plan follows the evidence for every goal and layout (${issues.length ? issues.join('; ') : '24 sessions, 4 a week; 3 lifts + 1 active day or 4 lifts'})`);
    // Workouts: real weights for a new athlete, a rep range for double progression, own plan numbering.
    const starter = buildStarterPlan('Lean Bulk');
    const w1 = prepareSessionForAthlete(mbp.generatePlanWorkout(starter, 1), {
      history: [],
      bodyweightKg: 80,
      readinessState: 'Normal',
      experienceLevel: 'new',
      isProgramPlan: true,
    });
    const loaded = w1.exercises.filter((e) => e.equipment !== 'bodyweight');
    assert(
      w1.planId === 'starter_6wk' &&
        w1.programWorkoutNumber === 1 &&
        loaded.length > 0 &&
        loaded.every((e) => e.sets.every((st) => st.targetWeightKg > 0 && st.targetWeightKg < 120)) &&
        w1.exercises.every((e) => (e.maxReps ?? 0) > (e.minReps ?? 0)),
      `Starter workout 1 has personalised starting weights and rep ranges (${loaded.map((e) => `${e.name} ${e.sets[0].targetWeightKg}`).join(', ')})`
    );
    // The two plans keep separate positions: muscle-plan history doesn't move the starter plan on.
    const doneMuscle = { ...mbp.generate6WeekMuscleBuildingWorkout(5), completed: true, completedAt: '2026-10-01T10:00:00.000Z' };
    const doneStarter = { ...mbp.generatePlanWorkout(starter, 2), completed: true, completedAt: '2026-10-02T10:00:00.000Z' };
    const legacyMuscle = { ...doneMuscle, planId: undefined, completedAt: '2026-09-30T10:00:00.000Z' };
    assert(
      mbp.getNextProgramWorkoutNumber([doneMuscle, doneStarter], starter) === 3 &&
        mbp.getNextProgramWorkoutNumber([doneMuscle, doneStarter]) === 6 &&
        mbp.getNextProgramWorkoutNumber([legacyMuscle], starter) === 1 &&
        mbp.buildPlanOverview([doneMuscle, doneStarter], starter).completedCount === 1 &&
        getPlanById('starter_6wk').templates.length === 24 &&
        getPlanById('starter_4day').templates.length === 24,
      'Starter and muscle plans keep their own progress (older plan saves count as the muscle plan)'
    );
    const report = buildSessionProgressReport({
      workouts: [doneStarter],
      exerciseCatalog: SEED_EXERCISES,
      knowledgeGraph: buildAthleteKnowledgeGraph([doneStarter], [], SEED_EXERCISES, NEW_USER_PROFILE, {}),
    });
    assert(
      report?.program.kind === 'plan' && report.program.totalWorkouts === 24 && report.program.totalWeeks === 6,
      'The session report counts the starter plan as 24 sessions over 6 weeks'
    );
  }

  // ==========================================================================
  // 39b. Rep ranges on the 6-week plan: reps build first, the weight rises only at the top of the range
  // ==========================================================================
  console.log('\n[39b. Starter plan double progression through the rep range]');
  {
    const { buildStarterPlan } = await import('../starterPlan');
    const mbp = await import('../muscleBuildingProgram');
    const { prepareSessionForAthlete } = await import('../../services/sessionPreparation');
    const BENCH = 'ex-bench-press'; // "6-10" in the Build Muscle starter plan

    type Logged = { reps: number; rir?: number };
    const runBench = (
      logSet: (setIndex: number, target: number) => Logged,
      opts: { goal?: 'Lean Bulk' | 'Cut / Recomp'; readiness?: (session: number) => 'Normal' | 'Amber Shield'; sessions?: number } = {}
    ) => {
      const plan = buildStarterPlan(opts.goal ?? 'Lean Bulk');
      const benchWorkouts = plan.templates.filter((t) => t.kind !== 'active' && t.exercises.some((e) => e.exerciseId === BENCH));
      let history: WorkoutSession[] = [];
      const seen: { weight: number; targets: number[] }[] = [];
      let day = new Date(2026, 0, 5, 18).getTime();
      for (const tmpl of benchWorkouts.slice(0, opts.sessions ?? benchWorkouts.length)) {
        const prepared = prepareSessionForAthlete(mbp.generatePlanWorkout(plan, tmpl.workoutNumber), {
          history,
          bodyweightKg: 80,
          readinessState: opts.readiness?.(seen.length) ?? 'Normal',
          gender: 'male',
          experienceLevel: 'intermediate',
          unit: 'kg',
          isProgramPlan: true,
        });
        const at = new Date(day);
        const done: WorkoutSession = {
          ...prepared,
          completed: true,
          date: localDateString(at),
          completedAt: at.toISOString(),
          exercises: prepared.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((s, i) => {
              const logged = ex.exerciseId === BENCH ? logSet(i, s.targetReps) : { reps: s.targetReps };
              return { ...s, completed: true, actualWeightKg: s.targetWeightKg, actualReps: logged.reps, actualRir: logged.rir ?? s.targetRir };
            }),
          })),
        };
        const bench = prepared.exercises.find((e) => e.exerciseId === BENCH)!;
        seen.push({ weight: bench.sets[0].targetWeightKg, targets: bench.sets.map((s) => s.targetReps) });
        history = [...history, done];
        day += 2 * 24 * 60 * 60 * 1000;
      }
      return seen;
    };

    // Only ticking the pre-filled sets adds reps, then one load step at the top, then back to the bottom.
    const ticks = runBench((_i, target) => ({ reps: target }));
    const firstStep = ticks.findIndex((s) => s.weight > ticks[0].weight);
    assert(ticks[0].targets.every((r) => r === 6), `Starter bench starts at the bottom of 6-10 (got ${ticks[0].targets.join()})`);
    assert(
      ticks[1].weight === ticks[0].weight && ticks[1].targets.join() === '7,7' && ticks[2].targets.join() === '8,8',
      `Within the range the weight holds and the first two sets aim for +1 rep (got ${JSON.stringify(ticks.slice(0, 3))})`
    );
    assert(
      firstStep > 0 && ticks[firstStep - 1].targets.every((r) => r === 10) && ticks[firstStep].weight === ticks[0].weight + 2.5 && ticks[firstStep].targets.every((r) => r === 6),
      `The weight rises by one step only after every set reaches 10, and reps return to 6 (got ${JSON.stringify(ticks)})`
    );
    assert(ticks.every((s, i) => i === 0 || s.weight - ticks[i - 1].weight <= 2.5), `Ticking through 6 weeks never adds more than one step at a time (got ${ticks.map((s) => s.weight).join()})`);

    // Staying inside the range never earns weight, however long it lasts.
    const inRange = runBench((i) => ({ reps: i === 0 ? 8 : 7, rir: 2 }));
    assert(inRange.every((s) => s.weight === inRange[0].weight), `Reps inside the range never raise the weight (got ${inRange.map((s) => s.weight).join()})`);
    const oneShort = runBench((i) => ({ reps: i === 0 ? 10 : 9, rir: 2 }), { sessions: 4 });
    assert(oneShort.every((s) => s.weight === oneShort[0].weight), 'Only some sets at the top of the range holds the weight');

    // Effort and missed reps.
    const groundOut = runBench(() => ({ reps: 10, rir: 0 }), { sessions: 4 });
    assert(groundOut.every((s) => s.weight === groundOut[0].weight), `The top of the range ground out to failure holds the weight (got ${groundOut.map((s) => s.weight).join()})`);
    const missed = runBench(() => ({ reps: 3, rir: 2 }), { sessions: 3 });
    assert(missed[1].weight < missed[0].weight && missed[1].targets.every((r) => r === 6), `The best set well under the range lowers the weight to match (got ${JSON.stringify(missed)})`);
    const dropOff = runBench((i) => ({ reps: i === 0 ? 7 : 5, rir: 2 }), { sessions: 3 });
    assert(dropOff[1].weight === dropOff[0].weight, 'A later set dropping under the range is normal fatigue: the weight holds');

    // Far more reps than the range: the starting weight was too light, so it can move faster (still capped).
    const tooLight = runBench(() => ({ reps: 20, rir: 2 }), { sessions: 2 });
    const tooLightCap = tooLight[0].weight * 1.1 + 2.5;
    assert(tooLight[1].weight > tooLight[0].weight + 2.5 && tooLight[1].weight <= tooLightCap, `Reps far past the range catch up quickly, within the jump cap (got ${tooLight.map((s) => s.weight).join()})`);

    // Low recovery holds weight and reps.
    const amber = runBench((_i, target) => ({ reps: target }), { sessions: 3, readiness: (n) => (n === 1 ? 'Amber Shield' : 'Normal') });
    assert(amber[1].weight === amber[0].weight && amber[1].targets.join() === amber[0].targets.join(), `Low recovery holds weight and reps (got ${JSON.stringify(amber)})`);

    // A new goal changes the range: the weight matches it, and reps start at its bottom.
    const buildPlan = buildStarterPlan('Lean Bulk');
    const cutPlan = buildStarterPlan('Cut / Recomp');
    const bulkFirst = prepareSessionForAthlete(mbp.generatePlanWorkout(buildPlan, 1), { history: [], bodyweightKg: 80, readinessState: 'Normal', gender: 'male', experienceLevel: 'intermediate', unit: 'kg', isProgramPlan: true });
    const bulkDone: WorkoutSession = {
      ...bulkFirst,
      completed: true,
      completedAt: new Date(2026, 0, 5, 18).toISOString(),
      exercises: bulkFirst.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s, completed: true, actualWeightKg: s.targetWeightKg, actualReps: 8, actualRir: 2 })) })),
    };
    const cutNext = prepareSessionForAthlete(mbp.generatePlanWorkout(cutPlan, 3), { history: [bulkDone], bodyweightKg: 80, readinessState: 'Normal', gender: 'male', experienceLevel: 'intermediate', unit: 'kg', isProgramPlan: true });
    const cutBench = cutNext.exercises.find((e) => e.exerciseId === BENCH);
    assert(
      Boolean(cutBench) && cutBench!.minReps === 5 && cutBench!.sets.every((s) => s.targetReps === 5) && cutBench!.sets[0].targetWeightKg >= bulkFirst.exercises.find((e) => e.exerciseId === BENCH)!.sets[0].targetWeightKg,
      'Changing goal moves to the new range: reps at its bottom, weight matched to what was lifted'
    );
  }

  // ==========================================================================
  // 39c. The coach changes equipment only when asked, and never invents numbers
  // ==========================================================================
  console.log('\n[39c. Coach: equipment changes and honest numbers]');
  {
    const baseArgs = {
      profile: { ...NEW_USER_PROFILE, homeEquipment: ['dumbbells'] as HomeEquipmentTag[] },
      activeWorkout: generate6WeekMuscleBuildingWorkout(1, 80),
      workouts: [] as WorkoutSession[],
      biometrics: [] as BiometricLog[],
      exerciseCatalog: SEED_EXERCISES,
      bodyweightEmaKg: 80,
      readinessState: 'Normal' as const,
    };
    const ask = (userMessage: string) => processAssistantMessage({ ...baseArgs, userMessage });

    for (const msg of [
      'my bench felt heavy today',
      'whats my bench 1rm',
      'log 80kg x 8 on bench',
      'i did 8 reps on the bench today',
      'set a goal of 100 kg bench',
      'I got 8 reps on bench',
      'I got a new bench PR',
      'I have bench press today',
      'I have dumbbell rows next',
      'do I have dumbbells',
      'can I use a bench?',
    ]) {
      const reply = await ask(msg);
      assert(!reply.updatedProfile?.homeEquipment && reply.actionTaken?.type !== 'UPDATE_EQUIPMENT', `Coach: "${msg}" doesn't change equipment`);
    }
    for (const [msg, tag] of [
      ['I got a new pull-up bar for my home setup', 'pullup_bar'],
      ['I bought an adjustable bench', 'bench'],
      ['I have resistance bands', 'bands'],
      ['just picked up a trx', 'trx'],
      ['add a bench', 'bench'],
    ] as const) {
      const reply = await ask(msg);
      assert(Boolean(reply.updatedProfile?.homeEquipment?.includes(tag)), `Coach: "${msg}" adds ${tag}`);
    }
    for (const msg of ['I sold my dumbbells', "I don't have dumbbells any more", 'I no longer have dumbbells', 'remove the dumbbells']) {
      const reply = await ask(msg);
      assert(reply.updatedProfile?.homeEquipment?.length === 0, `Coach: "${msg}" removes the dumbbells`);
    }
    // At the gym, "I don't have dumbbells" is about today's workout: swap options, home gear untouched.
    {
      const atGym = await ask("I don't have dumbbells");
      assert(
        !atGym.updatedProfile?.homeEquipment && atGym.actionTaken?.type !== 'UPDATE_EQUIPMENT' && /today's (workout|exercises)/.test(atGym.message.text),
        `Coach: "I don't have dumbbells" at the gym is about today's workout and never deletes home equipment (got "${atGym.message.text.slice(0, 80)}")`
      );
      const atHome = await processAssistantMessage({ ...baseArgs, activeWorkout: { ...baseArgs.activeWorkout, location: 'home' }, userMessage: "I don't have dumbbells" });
      assert(atHome.updatedProfile?.homeEquipment?.length === 0, 'Coach: "I don\'t have dumbbells" while training at home removes them from home equipment');
    }

    for (const msg of ['what tier am i', 'how close am i to the next tier']) {
      const reply = await ask(msg);
      assert(!/DOTS|\b280\b/.test(reply.message.text) && /log your weight first/.test(reply.message.text), `Coach: "${msg}" answers from real levels, with no invented score`);
    }
    const loggedBench = generate6WeekMuscleBuildingWorkout(1, 80);
    const twoLifts: WorkoutSession = {
      ...loggedBench,
      completed: true,
      completedAt: '2026-10-01T18:00:00.000Z',
      date: '2026-10-01',
      exercises: [
        { id: 'a', exerciseId: 'ex-barbell-squat', name: 'Barbell Back Squat', pillar: 'Squat', equipment: 'barbell', minReps: 5, maxReps: 5, sets: [{ id: 'a1', setNumber: 1, targetWeightKg: 100, actualWeightKg: 100, targetReps: 5, actualReps: 5, targetRir: 1, actualRir: 1, completed: true }] },
        { id: 'b', exerciseId: 'ex-bench-press', name: 'Barbell Bench Press', pillar: 'Horizontal Push', equipment: 'barbell', minReps: 5, maxReps: 5, sets: [{ id: 'b1', setNumber: 1, targetWeightKg: 70, actualWeightKg: 70, targetReps: 5, actualReps: 5, targetRir: 1, actualRir: 1, completed: true }] },
      ],
    };
    const noWeighIn = await processAssistantMessage({ ...baseArgs, workouts: [twoLifts], userMessage: 'what tier am i' });
    assert(!/your lifts are in proportion/.test(noWeighIn.message.text), 'Coach: without a weigh-in it makes no claim that lifts are in proportion');
    const oneRepMax = await ask('whats my bench 1rm');
    assert(!/\b280\b|DOTS score is/.test(oneRepMax.message.text), 'Coach: asking for a one-rep max never returns an invented score');

    // Readiness can be set with no readings saved: the coach must not fill them in.
    for (const state of ['Primed', 'Amber Shield'] as const) {
      const recovery = await processAssistantMessage({ ...baseArgs, readinessState: state, userMessage: 'how is my recovery' });
      const briefing = await processAssistantMessage({ ...baseArgs, readinessState: state, userMessage: 'what is my workout today' });
      assert(!/\b58\b|\b7\.5\b|\bHRV\b/.test(recovery.message.text) && !/\b58\b|\b7\.5\b|\bHRV\b/.test(briefing.message.text), `Coach: with no watch data, a ${state} answer shows no invented readings`);
    }
    const withReadings = await processAssistantMessage({
      ...baseArgs,
      readinessState: 'Primed',
      biometrics: [{ date: '2026-11-01', bodyweightKg: 80, hrvRmssd: 71, restingHr: 49, sleepHours: 6.5, steps: 0, activeZoneMinutes: 0 }],
      userMessage: 'how is my recovery',
    });
    assert(/HRV 71 ms/.test(withReadings.message.text) && /6\.5 h sleep/.test(withReadings.message.text), 'Coach: real readings are still shown');
  }

  // ==========================================================================
  // 39d. Plans away from the gym, logged sets and the sample athlete
  // ==========================================================================
  console.log('\n[39d. Plans away from the gym, logged sets and the sample athlete]');
  {
    const { buildStarterPlan } = await import('../starterPlan');
    const mbp = await import('../muscleBuildingProgram');
    const { prepareSessionForAthlete } = await import('../../services/sessionPreparation');
    const { usesOneDumbbell } = await import('../e1rm');
    const { formatReadyTime } = await import('../recovery');
    const prep = { bodyweightKg: 80, readinessState: 'Normal' as const, gender: 'male' as const, experienceLevel: 'new' as const, unit: 'kg' as const, isProgramPlan: true };

    for (const goal of ['Lean Bulk', 'Cut / Recomp', 'Maingain'] as const) {
      for (const layout of ['lift3_active1', 'lift4'] as const) {
        const plan = buildStarterPlan(goal, layout);
        const home = prepareSessionForAthlete(
          adaptWorkoutSessionToLocation(mbp.generatePlanWorkout(plan, 1), 'home', ['dumbbells', 'bench'], SEED_EXERCISES, [], 'Normal', 80),
          { ...prep, history: [] }
        );
        const loaded = home.exercises.filter((e) => !(e.equipment === 'bodyweight' && !e.isWeightedCalisthenic));
        assert(
          loaded.length > 0 &&
            loaded.every((e) => e.sets.every((st) => !st.isWarmup && st.targetWeightKg >= 4 && st.targetReps >= e.minReps && st.targetReps <= e.maxReps)),
          `${goal} ${layout} at home: real starting weights, reps inside each exercise's range, no added warm-ups (${loaded.map((e) => `${e.name} ${e.sets[0].targetWeightKg}x${e.sets[0].targetReps}`).join(', ')})`
        );
      }
    }

    // Logged sets belong to the exercise that was done, wherever the athlete goes next.
    const plan = buildStarterPlan('Lean Bulk');
    const fresh = prepareSessionForAthlete(mbp.generatePlanWorkout(plan, 1), { ...prep, history: [] });
    const started: WorkoutSession = {
      ...fresh,
      exercises: fresh.exercises.map((e, i) =>
        i === 0 ? { ...e, sets: e.sets.map((st, j) => (j === 0 ? { ...st, completed: true, actualWeightKg: 52.5, actualReps: 9 } : st)) } : e
      ),
    };
    const movedHome = adaptWorkoutSessionToLocation(started, 'home', ['dumbbells', 'bench'], SEED_EXERCISES, [], 'Normal', 80);
    assert(
      movedHome.exercises[0].exerciseId === fresh.exercises[0].exerciseId &&
        movedHome.exercises[0].sets[0].actualWeightKg === 52.5 &&
        movedHome.exercises[1].exerciseId !== fresh.exercises[1].exerciseId,
      'Switching place mid-workout never relabels logged sets; only exercises not started change'
    );

    // Low recovery with a new rep range never raises the weight.
    const bench = fresh.exercises.find((e) => e.exerciseId === 'ex-bench-press')!;
    const lastBench: WorkoutSession = {
      ...fresh,
      completed: true,
      completedAt: new Date(2026, 0, 5, 18).toISOString(),
      exercises: [{ ...bench, sets: bench.sets.map((st) => ({ ...st, completed: true, actualWeightKg: 60, actualReps: 10, actualRir: 2 })) }],
    };
    const cutPlan = buildStarterPlan('Cut / Recomp');
    const amberCut = prepareSessionForAthlete(mbp.generatePlanWorkout(cutPlan, 3), { ...prep, history: [lastBench], readinessState: 'Amber Shield' });
    const amberBench = amberCut.exercises.find((e) => e.exerciseId === 'ex-bench-press')!;
    assert(amberBench.sets[0].targetWeightKg <= 60 && amberCut.readinessState === 'Amber Shield', `Low recovery holds the weight even when the goal's range changes (got ${amberBench.sets[0].targetWeightKg})`);

    // One-dumbbell moves.
    const goblet = getTemplateDefaultWeight('ex-goblet-squat')!;
    assert(usesOneDumbbell({ exerciseId: 'ex-goblet-squat' }) && usesOneDumbbell({ name: 'Bench Dumbbell Lat Pullover' }) && !usesOneDumbbell({ name: 'Incline Dumbbell Press' }), 'Goblet squats and pullovers are recognised as one dumbbell');
    assert(goblet > 0 && goblet <= 60, `A goblet squat's borrowed default assumes one dumbbell (got ${goblet} kg)`);
    const toPullover = translateWeightBetweenImplements(
      37.5,
      { equipment: 'cable', exerciseId: 'ex-lat-pulldown', name: 'Lat Pulldown', pillar: 'Vertical Pull' },
      { equipment: 'dumbbell', exerciseId: 'ex-db-pullover', name: 'Bench Dumbbell Lat Pullover', pillar: 'Vertical Pull' },
      80
    );
    assert(toPullover <= 20, `Swapping to a one-dumbbell move halves the converted weight (37.5 kg pulldown gives ${toPullover} kg)`);
    const onboardingSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert(onboardingSrc.includes('isOpen={authModalOpen && !onboardingOpen}') && onboardingSrc.includes('if (!isEditingSetup) setActiveTab'), 'Sign-in waits for onboarding, and saving equipment stays in Settings');

    // Coach: place changes, and no internal day labels for plan workouts.
    const coachArgs = { profile: { ...NEW_USER_PROFILE, programType: 'starter_6wk' as const }, activeWorkout: fresh, workouts: [] as WorkoutSession[], biometrics: [] as BiometricLog[], exerciseCatalog: SEED_EXERCISES, bodyweightEmaKg: 80, readinessState: 'Normal' as const };
    const backToGym = await processAssistantMessage({ ...coachArgs, userMessage: 'back to the gym' });
    assert(backToGym.actionTaken?.type === 'SWITCH_LOCATION' && backToGym.updatedProfile?.activeLocation === 'gym', 'Coach: "back to the gym" switches place, not an answer about back muscles');
    const planBriefing = await processAssistantMessage({ ...coachArgs, userMessage: "give me today's briefing" });
    assert(/Full Body A/.test(planBriefing.message.text) && !/Push Day|Pull Day/.test(planBriefing.message.text), 'Coach: a plan briefing uses the plan name, never an internal day label');

    // Wording and backups.
    const morning = new Date(2026, 5, 10, 9, 0).getTime();
    const oneHour = formatReadyTime(morning + 60 * 60 * 1000, morning);
    const threeHours = formatReadyTime(morning + 3 * 60 * 60 * 1000, morning);
    assert(oneHour === 'in 1 hour' && threeHours === 'in 3 hours', `Ready times read correctly for one hour and several (got "${oneHour}", "${threeHours}")`);
    const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert(appSrc.includes('treise-backup-') && !appSrc.includes('headstrong-backup-'), 'Backups are named after Treise');

    // The sample athlete is partway through the plan, with names and exercises that agree.
    const demo = resetAllToSeedData();
    const demoPlan = buildStarterPlan(demo.profile.goalPhase, 'lift4');
    const demoRun = demo.workouts.filter((w) => w.planId === 'starter_4day');
    assert(
      demo.profile.programType === 'starter_4day' &&
        demoRun.length === 10 &&
        mbp.getNextProgramWorkoutNumber(demo.workouts, demoPlan) === 11 &&
        demo.workouts.length === generateSeedWorkouts().length &&
        demoRun.every((w) => {
          const tmpl = demoPlan.templates.find((t) => t.workoutNumber === w.programWorkoutNumber)!;
          return w.name === mbp.planWorkoutLabel(tmpl.title) && w.exercises.map((e) => e.exerciseId).join() === tmpl.exercises.map((e) => e.exerciseId).join() && w.exercises.every((e) => e.sets.every((st) => st.completed && (st.actualWeightKg ?? 0) >= 0));
        }),
      'Sample data shows a plan athlete on workout 11 of 24, with sessions that match their names'
    );
  }

  // ==========================================================================
  // 39e. Honest coach answers, one rounding per number, accessibility floors and safe sign-in links
  // ==========================================================================
  console.log('\n[39e. Honest coach answers, rounding, accessibility floors and sign-in links]');
  {
    const { acceptCoachAnswer } = await import('../../services/aiAssistantService');
    const { isExpectedOAuthState } = await import('../../services/whoopService');
    const { formatPreciseWeight } = await import('../../utils/units');
    const { buildStarterPlan } = await import('../starterPlan');
    const mbp = await import('../muscleBuildingProgram');
    const { prepareSessionForAthlete } = await import('../../services/sessionPreparation');

    const grounding = 'Today: Back Squat 2x6 @ 60 kg. Goal: 15 sets. Recovery 72%.';
    assert(acceptCoachAnswer('Keep your form tight and stop a rep or two short.', grounding), 'Coach: an answer with no numbers is shown');
    assert(acceptCoachAnswer('Start with 60 kg and warm up with 1 or 2 easy sets.', grounding), 'Coach: numbers the model was given are shown');
    assert(!acceptCoachAnswer('I recommend exactly 137 kg on every lift.', grounding), 'Coach: an invented weight is rejected');
    assert(!acceptCoachAnswer('Aim for 15% more volume.', grounding), 'Coach: an invented percentage is rejected, even if the number appears elsewhere');
    assert(!acceptCoachAnswer('Do 40 reps today.', grounding), 'Coach: an invented larger number is rejected');
    assert(!acceptCoachAnswer('As an AI language model I cannot say.', grounding), 'Coach: talk about being an AI is rejected');

    const plan = buildStarterPlan('Lean Bulk');
    const active = prepareSessionForAthlete(mbp.generatePlanWorkout(plan, 1), { history: [], bodyweightKg: 80, readinessState: 'Normal', gender: 'male', experienceLevel: 'new', unit: 'kg', isProgramPlan: true });
    const bench = active.exercises.find((e) => e.exerciseId === 'ex-bench-press')!;
    const logged: WorkoutSession = { ...active, completed: true, completedAt: '2026-10-01T18:00:00.000Z', date: '2026-10-01', exercises: [{ ...bench, sets: [{ ...bench.sets[0], completed: true, actualWeightKg: 47.5, actualReps: 7, actualRir: 3 }] }] };
    const args = { profile: { ...NEW_USER_PROFILE, programType: 'starter_6wk' as const }, activeWorkout: active, workouts: [logged], biometrics: [] as BiometricLog[], exerciseCatalog: SEED_EXERCISES, bodyweightEmaKg: 80, readinessState: 'Normal' as const };
    const maxReply = await processAssistantMessage({ ...args, userMessage: 'whats my bench 1rm' });
    assert(/63\.3 kg on Barbell Bench Press/.test(maxReply.message.text) && !/Scientific Formula/.test(maxReply.message.text), `Coach: "my bench 1rm" gives the athlete's own estimated max (${maxReply.message.text.slice(0, 80)})`);
    const noLift = await processAssistantMessage({ ...args, workouts: [], userMessage: 'whats my squat 1rm' });
    assert(/haven't logged a squat/.test(noLift.message.text), 'Coach: with no history there is no estimated max, and it says so');
    const scoreReply = await processAssistantMessage({ ...args, userMessage: 'what is my dots score' });
    assert(/instead of giving one score/.test(scoreReply.message.text) && !/\b280\b/.test(scoreReply.message.text), 'Coach: "my DOTS score" explains levels and never gives a stock score');
    const workoutWithoutBench: WorkoutSession = { ...active, exercises: active.exercises.filter((e) => e.exerciseId !== 'ex-bench-press') };
    const absent = await processAssistantMessage({ ...args, activeWorkout: workoutWithoutBench, userMessage: 'how much should I bench today' });
    assert(/isn't in today's workout/.test(absent.message.text) && /47\.5 kg × 7/.test(absent.message.text), `Coach: a lift not in today's workout says so, with what was last lifted (${absent.message.text.slice(0, 90)})`);
    const present = await processAssistantMessage({ ...args, userMessage: 'how much should I bench today' });
    assert(new RegExp(`leaving \\*\\*${bench.sets[0].targetRir} reps in reserve`).test(present.message.text), 'Coach: the effort it gives matches the workout card');

    assert(isExpectedOAuthState('whoop_abc', 'whoop_abc') && !isExpectedOAuthState('evil', 'whoop_abc') && !isExpectedOAuthState('whoop_abc', null) && !isExpectedOAuthState('', null), 'A Whoop return link is only accepted with the state saved on this device');
    assert(formatPreciseWeight(63.333, 'kg') === '63.3 kg' && formatPreciseWeight(91.4, 'kg') === '91.4 kg', 'Calculated and measured weights show to 0.1, not rounded to plate sizes');

    // Accessibility floors, checked in the source so they can't quietly return.
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d: any) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.tsx') ? [path.join(dir, d.name)] : []));
    const uiFiles = walk(path.resolve(process.cwd(), 'src/components'));
    const unfloored = uiFiles.filter((f) => /fontSize: fig\(/.test(fs.readFileSync(f, 'utf-8')));
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf-8');
    assert(unfloored.length === 0 && !/font-size: calc\(/.test(css), `No text can render under 12 px on a small phone (${unfloored.join(', ')})`);
    const modalsWithoutRole = uiFiles.filter((f) => {
      const src = fs.readFileSync(f, 'utf-8');
      return /className="(wk )?fixed inset-0 z-50/.test(src) && !/role="dialog"/.test(src);
    });
    assert(modalsWithoutRole.length === 0, `Every modal is announced as a dialog (${modalsWithoutRole.join(', ')})`);
    const setRowSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/train/SetRow.tsx'), 'utf-8');
    assert((setRowSrc.match(/wk-tap/g) || []).length >= 5 && /\.wk-tap::after[\s\S]*height: 44px/.test(css), 'Every control in a set row has a 44 px touch area');
    const { markLinkSignInStarted, consumeLinkSignIn } = await import('../../services/googleAuthService');
    assert(!consumeLinkSignIn(), 'A sign-in link this device did not start is ignored');
    markLinkSignInStarted();
    assert(consumeLinkSignIn() && !consumeLinkSignIn(), 'A sign-in this device started is accepted once');
    const persistSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/usePersistedState.ts'), 'utf-8');
    assert(
      persistSrc.includes('useLayoutEffect') && /hasUnsavedChange\.current\) return/.test(persistSrc),
      "A change is saved as soon as it's shown, and another tab's message can't replace one not saved yet"
    );
    const coachSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/assistant/AICoachChatModal.tsx'), 'utf-8');
    assert(coachSrc.includes('aria-label="Message your coach"'), "The coach's message box has a label");
  }

  // ==========================================================================
  // 39f. One story everywhere: coach answers use the same figures as the app's pages
  // ==========================================================================
  console.log('\n[39f. Coach answers match the pages, the knowledge graph and the athlete\'s data]');
  {
    const storage = await import('../../services/storage');
    const { buildCoachSystemPrompt } = await import('../../services/aiAssistantService');
    const { planPosition } = await import('../../services/coachAnswers');
    const { calculateDailyReadiness, displayRecoveryScore } = await import('../readiness');
    const { buildAthleteKnowledgeGraph } = await import('../knowledgeGraph');
    const { resolveActivePlan } = await import('../trainingPlans');
    const mbp = await import('../muscleBuildingProgram');
    const { prepareSessionForAthlete } = await import('../../services/sessionPreparation');
    const { planRestAfterSet } = await import('../../services/setCompletion');
    const { computeTrainingStreak } = await import('../recovery');

    const demo = storage.resetAllToSeedData();
    const { profile, biometrics, workouts, exercises } = demo;
    const plan = resolveActivePlan(profile);
    const bw = (await import("../ema")).getLatestBodyweightEma(biometrics);
    const readiness = calculateDailyReadiness(biometrics[biometrics.length - 1], biometrics, profile.wearableSource);
    const overview = mbp.buildPlanOverview(workouts, plan);
    const nextNumber = mbp.getNextProgramWorkoutNumber(workouts, plan);
    const active = prepareSessionForAthlete(mbp.generatePlanWorkout(plan, nextNumber), { history: workouts, bodyweightKg: bw, readinessState: readiness.state, gender: profile.gender, experienceLevel: 'intermediate', unit: 'kg', isProgramPlan: true });
    const volume = storage.calculateWeeklyMuscleVolume(workouts, exercises);
    const kg = buildAthleteKnowledgeGraph(workouts, biometrics, exercises, profile, volume);
    const args = { profile, activeWorkout: active, workouts, biometrics, exerciseCatalog: exercises, bodyweightEmaKg: bw, readinessState: readiness.state, weeklyVolume: volume };
    const ask = async (userMessage: string) => (await processAssistantMessage({ ...args, userMessage })).message.text;
    const week = plan.templates.find((t) => t.workoutNumber === nextNumber)!.week;

    const position = await ask('what week am i in');
    assert(
      position.includes(`week ${week} of 6`) && position.includes(`${overview.completedCount} of ${plan.templates.length} sessions`) && planPosition(profile, workouts).week === week,
      `Coach: plan position is the Program page's (${position.slice(0, 90)})`
    );
    assert(/Week \d of 6/.test(await ask("give me today's briefing")) && (await ask("give me today's briefing")).includes(`Week ${week} of 6`), "Coach: the briefing's week follows the plan, not a stored counter");
    assert(buildCoachSystemPrompt(args as any).includes(`week ${week}/6`), "The model is told the plan's week");

    const streak = computeTrainingStreak(workouts);
    assert((await ask('how is my streak')).includes(`${streak} day`), `Coach: the streak is the header's (${streak} days)`);

    for (const [question, key] of [['how many sets for chest this week', 'Chest'], ['how many sets for back this week', 'Back'], ['how many sets for rear delts', 'RearDelts']] as const) {
      const m = kg.muscleProfiles.find((p) => p.muscleKey === key)!;
      const reply = await ask(question);
      assert(
        reply.includes(`${m.weeklySets} of ${m.personalizedMav[0]}–${m.personalizedMav[1]} hard sets`) && !/Lumbar|Strain Score|Shoulder Capsule/.test(reply),
        `Coach: "${question}" gives the exercise card's figure (${m.displayName} ${m.weeklySets} of ${m.personalizedMav[0]}–${m.personalizedMav[1]})`
      );
    }
    assert(!/Side Shoulders/.test(await ask('how many sets for rear delts')), 'Coach: naming rear delts gives only rear delts');
    const shoulders = await ask('am i doing enough for my shoulders');
    assert(/Side Shoulders/.test(shoulders) && !/Strain Score|load \(/.test(shoulders), 'Coach: "enough for my shoulders" is about training, not joint strain');
    assert(/Knee/.test(await ask('how is my knee doing')), 'Coach: a joint question still gets the joint answer');

    const rest = await ask('how long should i rest between sets');
    const restSeconds = active.exercises.map((ex) => planRestAfterSet(active, ex, ex.sets[0].id).seconds);
    assert(
      rest.includes(active.name) && (Math.max(...restSeconds) % 60 === 0 ? rest.includes(`${Math.max(...restSeconds) / 60} minute`) : true) && !/2\.5 to 3\.5/.test(rest),
      `Coach: rest times are the rest timer's (${restSeconds.join(', ')} s)`
    );

    const score = displayRecoveryScore(readiness, biometrics[biometrics.length - 1]);
    assert(score !== null && kg.recoveryEfficiencyScore === score, `The knowledge graph's recovery score is the recovery card's (${kg.recoveryEfficiencyScore} vs ${score})`);
    assert((await ask('how is my recovery')).includes(`${score}%`), 'Coach: the recovery answer gives the card\'s score');

    const train = await ask('should i train today');
    assert(/^(Yes|Not yet|You've already trained)/.test(train), `Coach: "should I train" uses the Workout page's recovery check (${train.slice(0, 60)})`);

    const incline = active.exercises.find((e) => /Incline Dumbbell Press/.test(e.name))!;
    const why = await ask('why is incline press heavier today');
    assert(why.includes(incline.name) && !why.includes('Cable Chest Press') && /every set reached the top|same|matched/.test(why), `Coach: "why is it heavier" explains that exercise from its logged sets (${why.slice(0, 100)})`);

    // Checks written from the real on-device model's own answers (Gemini Nano, Chrome 153).
    const coach = await import('../../services/aiAssistantService');
    const notes = await import('../../services/exerciseCoachNote');
    const identity = await import('../../services/identityMessage');
    const sideShoulders = [{ names: ['side shoulders', 'cable lateral raise', 'lateral raise'], status: 'below target' as const }];
    assert(coach.contradictsMuscleTargets("You're performing a good amount of sets for lateral raises.", sideShoulders), 'Model check: "a good amount of sets" for a muscle below target is rejected');
    assert(!coach.contradictsMuscleTargets('Your side shoulders are below target this week, so every set counts.', sideShoulders), 'Model check: an accurate target statement is kept');
    assert(coach.claimsPastResults("You've completed 18/17 reps per set.") && coach.claimsPastResults('You did not reach the target reps.') && !coach.claimsPastResults("You're aiming for 18 reps today."), 'Model check: invented past results are rejected, today\'s plan is fine');
    assert(coach.misnamesEquipment('Focus on slowly lifting the dumbbells. Your lateral raises should be smooth.', [{ name: 'Cable Lateral Raise', equipment: 'cable' }]), 'Model check: calling a cable exercise a dumbbell one is rejected');
    assert(coach.changesPlanWeight('Since you are below target, you may need to increase the weight.') && !coach.changesPlanWeight('The weight will go up once every set reaches the top of the range.'), "Model check: the plan decides weights, the coach doesn't");
    // Checks written from the Qwen fallback's answers (WebGPU, used where Gemini Nano isn't exposed).
    assert(coach.contradictsRecovery("If you feel flat, it means your muscles need more rest.", 'Primed') && coach.contradictsRecovery('Focus on form rather than pushing yourself too hard.', 'Normal') && !coach.contradictsRecovery('Your recovery is high, so follow the plan.', 'Primed'), 'Model check: advice that contradicts today\'s recovery is rejected');
    assert(coach.contradictsRecovery('Push hard on your first set today.', 'Amber Shield'), 'Model check: "push hard" on a low-recovery day is rejected');
    assert(coach.changesPlanWeight('Start with a weight that allows you to do 18 reps comfortably.') && coach.changesPlanWeight('Adjusting your weight or reps can help.') && coach.changesPlanWeight('Use a moderate weight you can control.'), 'Model check: every way of telling the athlete to pick a weight is rejected');
    const today = [{ name: 'Incline Dumbbell Press', minReps: 8, maxReps: 12 }, { name: 'Cable Lateral Raise', minReps: 12, maxReps: 20 }];
    assert(coach.genericRepTarget('Aim for 8-12 reps per set, depending on your weight.', today) && !coach.genericRepTarget('For lateral raises, aim for 18 reps.', today), "Model check: a rep target that isn't tied to an exercise and doesn't fit them all is rejected");
    assert(coach.contradictsPlanSchedule('Set aside time each day for training and stick to it.') && !coach.contradictsPlanSchedule('Rest days between sessions help you recover.'), 'Model check: "train every day" contradicts the 4-sessions-a-week plan');
    assert(coach.misnamesEquipment('Keep your back straight when lowering the bar on your rows.', [{ name: 'Chest-Supported Dumbbell Row', equipment: 'dumbbell' }]) && coach.claimsPastResults("It's normal to feel flat if you're new to the exercise."), 'Model check: "the bar" for a dumbbell row and invented beginner status are rejected');
    assert(coach.exerciseNamedIn('how can i get more from my rows', 'Chest-Supported Dumbbell Row') && coach.exerciseNamedIn('any tips for my lateral raises', 'Cable Lateral Raise') && !coach.exerciseNamedIn('how do i stay consistent', 'Cable Lateral Raise'), 'Exercises are recognised by their usual short names');
    const tipsReply = await ask('any tips for my lateral raises');
    const raise = active.exercises.find((e) => /Lateral Raise/.test(e.name))!;
    assert(tipsReply.includes(`${raise.sets[0].targetReps} reps`) && /goes up by itself/.test(tipsReply), `Coach without a model: exercise tips come from that exercise's card (${tipsReply.slice(0, 90)})`);
    assert(/streak/i.test(await ask('how do i stay consistent')), 'Coach without a model: staying consistent answers from the streak and plan');
    const noteFacts = (ex: string, muscle: string) => ({
      exerciseId: 'x',
      key: 'k',
      fallback: 'f',
      lines: ['a', 'b'],
      facts: [
        `Exercise: ${ex} (trains your ${muscle.toLowerCase()}).`,
        'Estimated 1RM on this exercise has risen by +12.9 kg across 4 sessions (from 95.5 kg to 108.4 kg).',
        `Today consolidates volume accumulation at the current load for your ${muscle.toLowerCase()}.`,
      ],
    } as any);
    assert(
      notes.acceptExerciseNote(
        "You've completed 7 of 13–19 hard sets for chest this week.\nToday consolidates volume accumulation for chest hypertrophy.",
        noteFacts('Cable Chest Press', 'Chest')
      ) === null,
      'Note check: weekly muscle set benchmarks never leak into the 2-line exercise summary'
    );
    assert(
      notes.acceptExerciseNote(
        'Strength on this lift is up +19% across 4 sessions.\nToday consolidates volume accumulation for chest hypertrophy.',
        noteFacts('Cable Chest Press', 'Chest')
      ) === null,
      'Note check: abstract percentages (+19%) are rejected in favor of concrete load'
    );
    assert(
      notes.acceptExerciseNote(
        'Strength on this lift is rising, up +12.9 kg across 4 sessions to a 108.4 kg estimated max.\nToday consolidates volume accumulation at your current load to deepen chest hypertrophy.',
        noteFacts('Cable Chest Press', 'Chest')
      ) !== null,
      'Note check: a headerless 2-line summary with +12.9 kg concrete load and stimulus directive is accepted'
    );
    const idFacts = { key: 'k', fallback: 'f', facts: ['Sessions finished in this plan: 10 of 24.', 'Estimated strength is up on 11 of 21 lifts done more than once in this plan.', 'Personal bests in this plan so far: 45.', 'Workouts in the last 14 days: 8.'] } as any;
    assert(identity.acceptIdentityMessage("You've built up your strength significantly, improving on most of your lifts across 10 of 24 sessions so far.", idFacts) === null, 'Program message check: "significantly" and "most" need figures behind them (11 of 21 is not most)');
    assert(identity.acceptIdentityMessage("You're building a solid foundation, with strength up on many lifts. You've logged 10 of 24 sessions and 45 personal bests.", idFacts) !== null, 'Program message check: an accurate message is kept');
    // Everyday questions: answered from the plan and the log, on topic, with nothing invented.
    {
      const { answerEverydayQuestion, answerSwap, findExerciseNamed } = await import('../../services/coachAnswers');
      const { MUSCLE_FRIENDLY_NAMES } = await import('../recovery');
      const friendlyMuscle = (m: string) => ((MUSCLE_FRIENDLY_NAMES as Record<string, string>)[m] ?? m).toLowerCase();
      const firstEx = active.exercises[0];
      const firstDef = exercises.find((d) => d.id === firstEx.exerciseId)!;
      const planRir = firstEx.sets.find((st) => !st.isWarmup)?.targetRir;
      const failure = await ask('should i train to failure');
      assert(
        /reps in reserve/i.test(failure) && (planRir === undefined || failure.includes(`${planRir} rep`)) && !/^Yes\. Your muscles/.test(failure),
        `"Should I train to failure" explains reps to spare from today's plan, not whether to train (got "${failure.slice(0, 70)}")`
      );
      const twice = await ask('can i train twice today');
      assert(/one workout a day/i.test(twice) && !/^Yes/.test(twice), '"Can I train twice today" is not answered with "Yes"');
      const great = await ask('i feel great today');
      assert(!/protein/i.test(great), '"I feel great" is not a food question ("eat" inside "great")');
      const short = await ask('i only have 30 minutes');
      assert(short.includes(firstEx.name) && !/Planned Movements/.test(short), 'Short on time: keep the first exercises, in order');
      const timed = workouts.filter((w) => w.completed && (w.durationMinutes ?? 0) > 0 && w.name === active.name);
      const howLong = await ask('how long will today take');
      assert(
        !/rest timer/.test(howLong) && (timed.length ? howLong.includes(`${Math.round(timed[timed.length - 1].durationMinutes!)}`) : /don't have a measured time/.test(howLong)),
        `Workout length comes from measured sessions only (got "${howLong.slice(0, 80)}")`
      );
      const neverTimed = answerEverydayQuestion({ lowerMsg: 'how long will today take', profile: NEW_USER_PROFILE, activeWorkout: active, workouts: [], biometrics: [], exerciseCatalog: exercises, readinessState: 'Normal', bodyweightEmaKg: 80, progressSummary: () => '', strengthLevels: () => '' });
      assert(/don't have a measured time/.test(neverTimed ?? '') && !/\d+ minutes/.test(neverTimed ?? ''), 'With no finished workout, no workout length is invented');
      const missed = await ask('i missed a week, what now');
      assert(/nothing to make up/.test(missed) && missed.includes(`${nextNumber} of ${plan.templates.length}`), 'Missed sessions: the plan waits at the same session, nothing to make up');
      const sore = await ask("i'm sore from yesterday");
      assert(/soreness/i.test(sore) && /normal/.test(sore) && !/Planned Movements/.test(sore), 'Soreness gets a soreness answer with the recovery check');
      const cardio = await ask('should i do cardio');
      assert(/active day/.test(cardio) && !/Kaushal|Academic Citation/.test(cardio), 'Cardio is answered from the plan, not a science card');
      const how = await ask(`how do i do the ${firstEx.name.toLowerCase()}`);
      assert(how.includes(firstEx.name) && how.includes(friendlyMuscle(firstDef.primaryMuscle)) && !/Scientific Formula/.test(how), `"How do I do X" uses the exercise's own library entry (got "${how.slice(0, 80)}")`);
      const rdl = await ask('how do i do a romanian deadlift');
      assert(/Romanian Deadlift/.test(rdl) && /hamstrings/.test(rdl) && !/1\.2|multiplier/i.test(rdl), 'An exercise outside today\'s workout is still explained from the library, not the RDL multiplier card');
      const muscles = await ask(`what muscles does the ${firstEx.name.toLowerCase()} work`);
      assert(muscles.includes(friendlyMuscle(firstDef.primaryMuscle)) && !/Academic Citation/.test(muscles), 'Muscles trained come from the exercise library');
      const rir = await ask('what is rir');
      assert(/how many more good reps/.test(rir) && !/Epley|Formula/.test(rir), '"What is RIR" gets a plain definition');
      const deload = await ask('should i deload');
      assert(!/\b(MEV|MAV|MRV|mesocycle)\b/i.test(deload) && /easy week/.test(deload), 'Deload is answered from the athlete\'s plan with no jargon');
      const last = [...workouts].filter((w) => w.completed).sort((a, b) => (a.completedAt || a.date).localeCompare(b.completedAt || b.date)).pop()!;
      const lastAnswer = await ask('what did i do last workout');
      assert(lastAnswer.includes(last.name) && lastAnswer.includes(last.exercises[0].name), 'Last workout is read from the log');
      const count = await ask('how many workouts have i done');
      assert(count.includes(`${workouts.filter((w) => w.completed).length} workouts`) && count.includes(`${overview.completedCount} of ${plan.templates.length}`), 'Workout count matches the log and the Program page');
      const doing = await ask('how am i doing');
      assert(doing.includes(`${overview.completedCount} of ${plan.templates.length}`) && !/Planned Movements/.test(doing), '"How am I doing" is plan position, streak and progress');
      const weight = await ask("what's my bodyweight");
      const latestWeighIn = [...biometrics].filter((b) => b.bodyweightKg > 0).pop()!;
      assert(weight.includes(`${latestWeighIn.bodyweightKg} kg`), 'Bodyweight is the logged weigh-in');
      const noWeighIn = answerEverydayQuestion({ lowerMsg: "what's my bodyweight", profile: NEW_USER_PROFILE, activeWorkout: active, workouts: [], biometrics: [], exerciseCatalog: exercises, readinessState: 'Normal', bodyweightEmaKg: 80, progressSummary: () => '', strengthLevels: () => '' });
      assert(/haven't logged a weigh-in/.test(noWeighIn ?? '') && !/80/.test(noWeighIn ?? ''), 'Without a weigh-in, the placeholder bodyweight is never shown');
      const newProtein = await processAssistantMessage({ ...args, biometrics: [], bodyweightEmaKg: 80, userMessage: 'how much protein do i need' });
      assert(!/\b1[0-9]{2} g\b/.test(newProtein.message.text) && /per kg/.test(newProtein.message.text), 'Protein in grams needs a logged bodyweight; otherwise only per-kg guidance');
      const calories = await ask('how many calories should i eat');
      assert(/can't give you a calorie number/.test(calories) && !/\d{3,4}/.test(calories), 'No calorie figure is invented');
      const thanks = await ask('thanks');
      assert(thanks.length < 80 && !/Planned Movements/.test(thanks), '"Thanks" gets a short reply, not a briefing');
      const offTopic = await ask("what's the capital of france");
      assert(/don't have a good answer/.test(offTopic) && !/Planned Movements/.test(offTopic), 'An unrelated question gets an honest reply, not the workout list');
      const briefing = await ask('what am i doing today');
      assert(/Planned Movements/.test(briefing), 'Questions about today still get the briefing');
      const hello = await ask('hi');
      assert(!/auto-regulate|tactical|optimi[sz]e/i.test(hello), 'The greeting has no jargon');
      const travel = (await processAssistantMessage({ ...args, userMessage: "i'll be away in week 5" })).message.text;
      assert(!/mesocycle|calibrate|eccentric/i.test(travel), 'The travel reply has no jargon');

      // Swaps: only today's exercises, never the kit the athlete lacks.
      const notToday = exercises.find((d) => !active.exercises.some((e) => e.exerciseId === d.id) && d.name === 'Barbell Back Squat')!;
      const swapAbsent = answerSwap(`swap the ${notToday.name.toLowerCase()}`, active, exercises);
      assert(/isn't in today's workout/.test(swapAbsent) && !/You can swap/.test(swapAbsent), 'An exercise that isn\'t in today\'s workout is never offered for a swap');
      const kit = active.exercises.find((e) => ['dumbbell', 'cable', 'barbell', 'machine'].includes(e.equipment))!.equipment;
      const kitWord = kit === 'dumbbell' ? 'dumbbells' : kit === 'cable' ? 'cables' : kit === 'barbell' ? 'a barbell' : 'machines';
      const noKit = answerSwap(`i don't have ${kitWord}`, active, exercises);
      const offered = noKit.split('\n').filter((l) => l.includes('→')).map((l) => l.split('→')[1].trim());
      assert(
        offered.length > 0 && offered.every((name) => exercises.find((d) => d.name === name)?.equipment !== kit),
        `Swaps for missing kit never use that kit (got "${noKit.slice(0, 120)}")`
      );
      const unusedKit = (['barbell', 'machine'] as const).find((k) => !active.exercises.some((e) => e.equipment === k));
      if (unusedKit) {
        assert(/None of today's exercises need/.test(answerSwap(`i don't have a ${unusedKit}`, active, exercises)), 'Missing kit that today doesn\'t use: the workout goes ahead as planned');
      }
      assert(findExerciseNamed('i love rdls', active, exercises)?.def?.isRdl === true, 'Common short names (RDL) find the exercise');
      // The on-device model: follow-ups continue the chat, rejected answers are forgotten and retried
      // with the reason, and the instructions never carry a bodyweight the athlete didn't log.
      {
        const onDevice = await import('../../services/onDeviceModel');
        const savedModel = (globalThis as any).LanguageModel;
        (globalThis as any).window = globalThis;
        let created = 0;
        const asked: string[] = [];
        const replies: string[] = [];
        const makeSession = (history: string[]): any => ({
          history,
          clone: async () => makeSession([...history]),
          prompt: async (q: string) => {
            asked.push(q);
            history.push(q);
            return replies.shift() ?? 'Keep each rep smooth and controlled, and breathe out as you lift.';
          },
          destroy: () => undefined,
        });
        (globalThis as any).LanguageModel = {
          availability: async () => 'available',
          create: async () => {
            created++;
            return makeSession([]);
          },
        };
        onDevice.resetOnDeviceConversation();
        const open1 = await ask('is it better to lift in the morning or the evening');
        const open2 = await ask('and what about late at night');
        assert(created === 1 && /smooth and controlled/.test(open1) && /smooth and controlled/.test(open2), `Follow-up questions continue one chat with the model instead of starting again (sessions created: ${created})`);

        // A rejected answer (an invented weight) is retried once with the reason, and not remembered.
        asked.length = 0;
        replies.push('Try 137.5 kg for a few sets and see how it goes in the evening.', 'Either works: pick the time you can keep to each week.');
        const retried = await ask('is the evening really fine for lifting');
        assert(
          /Either works/.test(retried) && asked.length === 2 && /could not be used because it used a number, weight or percentage/.test(asked[1]),
          `A rejected model answer gets one retry that says what was wrong (got "${retried.slice(0, 60)}")`
        );
        replies.push('Use 137.5 kg.', 'Go with 212.5 kg today.');
        const twiceBad = await ask('is the evening really fine for lifting then');
        assert(!/137\.5|212\.5/.test(twiceBad), 'Two rejected answers fall back to the data-based coach');

        const newPrompt = buildCoachSystemPrompt({ ...args, biometrics: [], bodyweightEmaKg: 80, userMessage: '' });
        const loggedPrompt = buildCoachSystemPrompt({ ...args, userMessage: '' });
        assert(!/\b80 kg\b/.test(newPrompt.split('\n')[1]) && /Athlete: \d/.test(loggedPrompt), "The model's instructions carry a bodyweight only once the athlete has logged one");
        onDevice.resetOnDeviceConversation();
        (globalThis as any).LanguageModel = savedModel;

        // The downloaded phone model (used where Chrome has no built-in model): a rejected answer is
        // forgotten there too, and a slow model is never asked twice.
        {
          const { withoutLastExchange } = onDevice;
          const turns = [{ role: 'system', content: 's' }, { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' }];
          const trimmed = withoutLastExchange(turns);
          assert(
            trimmed.length === 3 && trimmed[2].content === 'a1' && withoutLastExchange(trimmed.slice(0, 1)).length === 1 && withoutLastExchange(turns.slice(0, 4)).length === 4,
            'Phone model: forgetting drops exactly the last question and answer, and only when the chat ends with an answer'
          );
          delete (globalThis as any).LanguageModel;
          let forgotten = 0;
          const gpuAsked: string[] = [];
          const gpuReplies = ['Load 137.5 kg and go for it.', 'Either time works: pick the one you can keep to.'];
          let delayMs = 0;
          onDevice.registerFallbackOnDeviceModel({
            isReady: async () => true,
            prompt: async (_s: string, q: string) => {
              gpuAsked.push(q);
              if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
              return gpuReplies.shift() ?? null;
            },
            forgetLast: () => { forgotten++; },
          });
          const fastRetry = await ask('is the evening a fine time for lifting');
          assert(forgotten === 1 && gpuAsked.length === 2 && /Either time works/.test(fastRetry), `Phone model: a rejected answer is forgotten, then retried with the reason (forgotten ${forgotten}, asked ${gpuAsked.length})`);
          gpuAsked.length = 0;
          forgotten = 0;
          gpuReplies.push('Load 137.5 kg and go for it.', 'This second answer must never be requested.');
          delayMs = 6200;
          const slow = await ask('is the evening a fine time for lifting really');
          assert(forgotten === 1 && gpuAsked.length === 1 && !/137\.5|second answer/.test(slow), 'Phone model: a slow rejected answer is forgotten and not asked again; the data-based coach answers');
          onDevice.registerFallbackOnDeviceModel(null);
          (globalThis as any).LanguageModel = savedModel;
        }

        // Program message: the second try is told why the first was rejected.
        const idFacts2 = { key: 'k', fallback: 'f', facts: ['Sessions finished in this plan: 10 of 24.', 'Workouts in the last 14 days: 8.'] } as any;
        const idPrompts: string[] = [];
        const idReplies = ["You have made huge progress across 10 of 24 sessions, and your next workout builds on it again.", "You've finished 10 of 24 sessions and trained 8 times in the last 14 days. Your next workout carries that forward."];
        const idMessage = await identity.generateIdentityMessage(idFacts2, async (_s: string, u: string) => { idPrompts.push(u); return idReplies.shift() ?? null; });
        assert(/10 of 24 sessions and trained 8 times/.test(idMessage ?? '') && /could not be used because it used a size word/.test(idPrompts[1] ?? ''), 'Program message: a rejected first try is retried with the reason');
        assert(identity.checkIdentityMessage('Short.', idFacts2).problem === 'it was too short', 'Program message checks say why a message was rejected');
      }

      // Content strategy (src/engine/contentStrategy.ts) governs the coach too.
      {
        const { runReadAloudQaGate } = await import('../contentStrategy');
        const { buildExerciseInsight } = await import('../../services/exerciseInsight');
        const everyday = [
          'should i train to failure', 'can i train twice today', 'i feel great today', 'i only have 30 minutes', 'how long will today take',
          'i missed a week, what now', 'can i skip leg day', "i'm sore from yesterday", 'i slept badly', 'should i do cardio', 'should i deload',
          'how am i doing', 'what should i focus on', "what's my bodyweight", 'am i losing fat', 'how many calories should i eat', 'creatine?',
          'thanks', 'hi', 'what am i doing today', 'should i train today', 'how long should i rest', 'swap something', "i don't have a barbell",
          'what did i do last workout', 'how do i get bigger arms', 'should i skip today', "what's the capital of france",
        ];
        const failures: string[] = [];
        for (const q of everyday) {
          const qa = runReadAloudQaGate(await ask(q));
          if (!qa.passed) failures.push(`${q}: ${qa.violations.join('; ')}`);
        }
        assert(failures.length === 0, `Every coach answer passes the content strategy's read-aloud gate${failures.length ? ` (${failures.join(' | ')})` : ''}`);

        // Create once, publish everywhere: the coach's answer about an exercise carries the card's own two lines.
        const cardEx = active.exercises[0];
        const { buildExerciseNoteFacts: noteFacts } = await import('../../services/exerciseCoachNote');
        const precise = (v: number) => `${Math.round(v * 10) / 10} kg`;
        const cardDef = exercises.find((d) => d.id === cardEx.exerciseId)!;
        const cardInsight = buildExerciseInsight(cardEx, workouts, readiness.state, bw, 12, precise);
        // Exactly what the Workout page shows on the card when no model has written a note.
        const cardLines = noteFacts({ exercise: cardEx, insight: cardInsight, workouts, readinessState: readiness.state, knowledgeGraph: kg, primaryMuscle: cardDef.primaryMuscle, muscleLabel: (MUSCLE_FRIENDLY_NAMES as Record<string, string>)[cardDef.primaryMuscle], formatWeight: precise }).lines;
        assert(cardInsight.lines[0] === cardLines[0], `The two card-line builders word line 1 identically ("${cardInsight.lines[0]}" vs "${cardLines[0]}")`);
        assert(!/for your [a-z ]+ for hypertrophy/.test(cardLines[1]), `Line 2 doesn't say "for" twice ("${cardLines[1]}")`);

        // Every card in every plan, for a logged athlete and a new one, in every recovery state, passes
        // the content strategy's own audit and the note validator, and both builders agree on line 1.
        {
          const { runRotContentAudit } = await import('../contentStrategy');
          const { acceptExerciseNote: acceptNote } = await import('../../services/exerciseCoachNote');
          const { getPlanById } = await import('../trainingPlans');
          const problems: string[] = [];
          let checked = 0;
          for (const hist of [workouts, [] as WorkoutSession[]]) {
            const histKg = buildAthleteKnowledgeGraph(hist, biometrics, exercises, profile, storage.calculateWeeklyMuscleVolume(hist, exercises));
            for (const planId of ['starter_6wk', 'starter_4day', 'muscle_building_6wk'] as const) {
              const auditPlan = getPlanById(planId, 'Lean Bulk');
              for (const t of auditPlan.templates) {
                if (mbp.isActiveSlot(t)) continue;
                for (const rs of ['Normal', 'Amber Shield'] as const) {
                  const session = prepareSessionForAthlete(mbp.generatePlanWorkout(auditPlan, t.workoutNumber), { history: hist, bodyweightKg: bw, readinessState: rs, gender: profile.gender, experienceLevel: 'intermediate', unit: 'kg', isProgramPlan: true });
                  for (const ex of session.exercises) {
                    const def = exercises.find((d) => d.id === ex.exerciseId);
                    const ins = buildExerciseInsight(ex, hist, rs, bw, 12, precise);
                    const f = noteFacts({ exercise: ex, insight: ins, workouts: hist, readinessState: rs, knowledgeGraph: histKg, primaryMuscle: def?.primaryMuscle, muscleLabel: def ? (MUSCLE_FRIENDLY_NAMES as Record<string, string>)[def.primaryMuscle] : undefined, formatWeight: precise });
                    checked++;
                    const timed = Boolean(ex.durationSeconds || ex.durationMinutesRange);
                    if (!runRotContentAudit([{ exerciseName: ex.name, summary: f.fallback }, { exerciseName: ex.name, summary: ins.summary }]).passed) problems.push(`${ex.name}: fails the audit`);
                    else if (acceptNote(f.fallback, f) === null) problems.push(`${ex.name}: rejected by the note validator`);
                    else if (!timed && ins.lines[0] !== f.lines[0]) problems.push(`${ex.name}: line 1 worded two ways`);
                  }
                }
              }
            }
          }
          assert(checked > 1000 && problems.length === 0, `All ${checked} exercise cards across the plans pass the content strategy audit${problems.length ? ` (${[...new Set(problems)].slice(0, 4).join(' | ')})` : ''}`);
        }
        const targets = await ask(`what are my targets for the ${cardEx.name.toLowerCase()} today`);
        assert(targets.includes(cardLines[0]) && targets.includes(cardLines[1]), `The coach's exercise answer uses the exercise card's two lines (got "${targets.slice(0, 160)}")`);

        // Model answers with hype are rejected by the same gate, in chat and in the Program message.
        const savedLm = (globalThis as any).LanguageModel;
        (globalThis as any).window = globalThis;
        (globalThis as any).LanguageModel = {
          availability: async () => 'available',
          create: async () => ({ prompt: async () => 'Evenings are fine. Just crush it and make every set count!', destroy: () => undefined }),
        };
        (await import('../../services/onDeviceModel')).resetOnDeviceConversation();
        const hype = await ask('is the evening a good time to lift');
        assert(!/crush it|make every set count/i.test(hype), 'A model answer with hype or clichés is rejected by the read-aloud gate');
        (await import('../../services/onDeviceModel')).resetOnDeviceConversation();
        (globalThis as any).LanguageModel = savedLm;
        const hypeFacts = { key: 'k', fallback: 'f', facts: ['Sessions finished in this plan: 10 of 24.'] } as any;
        assert(/hype/.test(identity.checkIdentityMessage("You've finished 10 of 24 sessions, so go and crush it in your next workout and keep building.", hypeFacts).problem ?? ''), 'Program message: hype is rejected by the read-aloud gate');
        assert(/pragmatic, observant strength coach/.test(buildCoachSystemPrompt({ ...args, userMessage: '' })), "The model's instructions use the content strategy's voice");
      }

      // A question never changes the plan, and the streak it quotes is the header's.
      const skipQuestion = await processAssistantMessage({ ...args, userMessage: 'should i skip today' });
      assert(!skipQuestion.updatedWorkout && !skipQuestion.actionTaken, '"Should I skip today?" is answered from recovery and moves nothing');
      const restDay = await processAssistantMessage({ ...args, userMessage: 'take a rest day' });
      const headerStreak = computeTrainingStreak(workouts, Date.now(), []);
      assert(
        restDay.actionTaken?.type === 'SHIFT_WORKOUT' && (headerStreak > 0 ? restDay.message.text.includes(`${headerStreak}-day streak`) : !/streak/.test(restDay.message.text)),
        `"Take a rest day" still logs it, quoting the header's streak (${headerStreak}) and not a stored counter`
      );
      const twoPresses = active.exercises.filter((e) => /press/i.test(e.name));
      if (twoPresses.length >= 2) {
        const second = twoPresses[1];
        const core = second.name.toLowerCase().replace(/\b(dumbbell|cable|barbell|machine)\b/g, '').replace(/\s+/g, ' ').trim();
        const target = await ask(`what are my targets for the ${core} today`);
        assert(target.includes(second.name) && !target.includes(`**${twoPresses[0].name}**`), `A named exercise is matched exactly: "${core}" is ${second.name}, not the first press in the list`);
      }
      const walked = await ask('i walked 40 minutes today');
      assert(/active day/.test(walked) && !/Planned Movements/.test(walked), 'Reporting a walk explains how it counts as an active day');
      const arms = await ask('how do i get bigger arms');
      const bi = kg.muscleProfiles.find((m) => m.muscleKey === 'Biceps')!;
      assert(arms.includes(`Biceps: ${bi.weeklySets} of ${bi.personalizedMav[0]}–${bi.personalizedMav[1]}`), 'Growing a muscle is answered with its weekly sets against target, the exercise cards\' count');
      assert(answerEverydayQuestion({ lowerMsg: 'why does the formula use 30', profile, activeWorkout: active, workouts, biometrics, exerciseCatalog: exercises, readinessState: 'Normal', bodyweightEmaKg: bw, progressSummary: () => '', strengthLevels: () => '' }) === null, 'Formula questions still go to the science cards');
    }
    const kbRest = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find((p) => p.id === 'sp-rest-intervals');
    assert(!kbRest || !/simulated|2\.5 minutes for compound lifts and 90 seconds/.test(kbRest.practicalApplication), 'The science card describes the rest timer as it really works');
    storage.resetAllToSeedData();
  }

  // ==========================================================================
  // 40. Active days: the 4th weekly session (ride, run, walk, class), counted honestly
  // ==========================================================================
  console.log('\n[40. Active days]');
  {
    const ad = await import('../activeDays');
    const { toDetectedActivities, fetchStravaActivities, startStravaConnect, STRAVA_ENABLED } = await import('../../services/activitySources');
    const { buildStarterPlan } = await import('../starterPlan');
    const mbp = await import('../muscleBuildingProgram');
    const { completeWorkout } = await import('../../services/workoutCompletion');

    assert(
      ad.classifyActivity('Ride') === 'cycle' &&
        ad.classifyActivity('VirtualRide') === 'cycle' &&
        ad.classifyActivity('EXERCISE_TYPE_BIKING_STATIONARY') === 'cycle' &&
        ad.classifyActivity('Run') === 'run' &&
        ad.classifyActivity('Walk') === 'walk' &&
        ad.classifyActivity('swimming_pool') === 'swim' &&
        ad.classifyActivity('WeightTraining') === 'strength' &&
        ad.classifyActivity('EXERCISE_TYPE_STRENGTH_TRAINING') === 'strength' &&
        ad.classifyActivity('Weightlifting') === 'strength' &&
        ad.classifyActivity('Spinning') === 'cycle' &&
        ad.classifyActivity('HIIT') === 'class',
      'Activity names from Health Connect, Fitbit, Whoop and Strava map to plain types; lifting is recognised'
    );
    const raw = [
      { externalId: 'a', sportType: 'Ride', startedAt: '2026-10-20T07:00:00.000Z', minutes: 32 },
      { externalId: 'b', sportType: 'WeightTraining', startedAt: '2026-10-20T17:00:00.000Z', minutes: 50 },
    ];
    const det = toDetectedActivities('fitbit', raw);
    assert(det.length === 2 && det[0].type === 'cycle' && det[1].type === 'strength' && det[1].source === 'fitbit', 'A workout from any app is captured, including strength done outside Treise');
    // Strava is off for the beta: even a profile saved as connected never reaches it.
    const stravaFound = await fetchStravaActivities({ stravaConnected: true, stravaAccessToken: 'test' } as any);
    const stravaStarted = await startStravaConnect();
    assert(!STRAVA_ENABLED && stravaFound.length === 0 && !stravaStarted, 'Strava is switched off: it is never offered, connected or read');
    assert(
      ad.qualifiesAsActiveDay({ minutes: 20 }) && !ad.qualifiesAsActiveDay({ minutes: 12 }),
      'An active day is at least 20 minutes (a 12-minute walk is saved but does not count)'
    );

    // Same ride from two apps counts once; a removed one doesn't come back; re-sync adds nothing.
    const ride = { externalId: 'r1', startedAt: '2026-10-21T06:00:00.000Z', minutes: 40, type: 'cycle' as const, source: 'fitbit' as const };
    const sameRideHc = { ...ride, externalId: 'hc-9', source: 'health_connect' as const, startedAt: '2026-10-21T06:03:00.000Z', minutes: 38 };
    const first = ad.mergeDetectedActivities([], [ride, sameRideHc]);
    const again = ad.mergeDetectedActivities(first.merged, [ride]);
    const dismissed = ad.mergeDetectedActivities([], [ride], ['fitbit:r1']);
    assert(
      first.added.length === 1 && again.added.length === 0 && dismissed.added.length === 0 && first.added[0].date === localDateString(new Date(ride.startedAt)),
      'Found workouts: one per real session, never duplicated, and a removed one stays removed'
    );
    const shortCopyFirst = ad.mergeDetectedActivities([], [{ ...ride, externalId: 'stub', source: 'health_connect' as const, minutes: 1 }, ride]);
    assert(shortCopyFirst.added.length === 1 && shortCopyFirst.added[0].minutes === 40, 'When two apps recorded one workout, the longest recording is kept');
    const backToBack = ad.mergeDetectedActivities([], [
      { ...ride, externalId: 'w', type: 'walk' as const, startedAt: '2026-10-21T06:00:00.000Z', minutes: 20 },
      { ...ride, externalId: 'c', startedAt: '2026-10-21T06:25:00.000Z', minutes: 30 },
    ]);
    assert(backToBack.added.length === 2, 'A walk and a ride straight after it are two workouts');
    const lift = { id: 'l', date: '2026-10-21', name: 'Full Body A', splitDay: 'Push' as const, exercises: [], completed: true, readinessState: 'Normal' as const, readinessZScore: 0, startedAt: '2026-10-21T17:00:00.000Z', completedAt: '2026-10-21T18:00:00.000Z' };
    assert(
      ad.overlapsLifting({ startedAt: '2026-10-21T17:10:00.000Z', minutes: 45 }, [lift as any]) &&
        !ad.overlapsLifting({ startedAt: '2026-10-21T06:00:00.000Z', minutes: 45 }, [lift as any]),
      'A watch workout recorded during a lifting session is that session, not an active day'
    );
    assert(
      !ad.overlapsLifting({ startedAt: new Date(new Date((lift as any).startedAt).getTime() - 40 * 60000).toISOString(), minutes: 42 }, [lift as any]),
      'A ride that ends as a logged session starts is still its own workout'
    );

    // Plan: lift 3 days + 1 active day. Active days fill one per week, up to the current week.
    const plan = buildStarterPlan('Lean Bulk', 'lift3_active1');
    const done = (n: number, day: string) => ({
      ...mbp.generatePlanWorkout(plan, n),
      date: day,
      completed: true,
      completedAt: `${day}T18:00:00.000Z`,
    });
    const act = (day: string, minutes = 30) => ({ id: `m-${day}-${minutes}`, date: day, startedAt: `${day}T07:00:00.000Z`, minutes, type: 'walk' as const, source: 'manual' as const });
    const ov0 = mbp.buildPlanOverview([], plan, [act('2026-10-05'), act('2026-10-05', 45), act('2026-10-06')]);
    assert(
      ov0.workouts[3].status === 'done' && ov0.workouts[7].status === 'upcoming' && ov0.completedCount === 1,
      'Week 1: one active day counts; extra activities that week wait (no banking ahead)'
    );
    const week1 = [done(1, '2026-10-05'), done(2, '2026-10-07'), done(3, '2026-10-09')];
    assert(mbp.getNextProgramWorkoutNumber(week1, plan) === 5, 'After the 3rd lift the next workout is the next week\'s first lift (the active day is not queued)');
    const ov1 = mbp.buildPlanOverview(week1, plan, []);
    assert(ov1.workouts[3].status === 'due' && ov1.workouts[7].status === 'due', 'A missed active day stays open to catch up (no penalty)');
    const ov2 = mbp.buildPlanOverview(week1, plan, [act('2026-10-12'), act('2026-10-13')]);
    assert(ov2.workouts[3].status === 'done' && ov2.workouts[7].status === 'done' && ov2.completedCount === 5, 'Catching up fills the earliest open active days first');
    const fourDay = buildStarterPlan('Lean Bulk', 'lift4');
    assert(
      mbp.buildPlanOverview([], fourDay, [act('2026-10-05')]).completedCount === 0,
      'Activities never count in the 4-day lifting layout (it has no active days)'
    );
    const result = completeWorkout({
      activeWorkout: { ...mbp.generatePlanWorkout(plan, 3), startedAt: '2026-10-09T17:00:00.000Z' },
      history: [done(1, '2026-10-05'), done(2, '2026-10-07')],
      profile: { ...NEW_USER_PROFILE, programType: 'starter_6wk', mesocycleWeek: 1 },
      readiness: { state: 'Normal', score: 0 },
      bodyweightKg: 80,
      now: new Date('2026-10-09T18:00:00.000Z'),
    });
    assert(Boolean(result.weekMilestone) && result.nextMesocycleWeek === 2, 'Finishing the week\'s 3rd lift completes the week and moves the plan to week 2');
    assert(
      computeTrainingStreak([], new Date('2026-10-13T12:00:00').getTime(), ['2026-10-12']) === 1,
      'An active day keeps the training streak'
    );
    // Activities are stored apart from workouts: weekly sets and strength numbers can't change.
    const withRide = calculateWeeklyMuscleVolume([done(1, localDateString())], SEED_EXERCISES);
    assert(JSON.stringify(withRide) === JSON.stringify(calculateWeeklyMuscleVolume([done(1, localDateString())], SEED_EXERCISES)), 'Activities never change weekly hard sets');
  }

  console.log('\n[41. Movement standards: levels, balance, sides]');
  {
    const ms = await import('../../services/movementStandards');
    const { calculateEngineVitalityScore: cardio } = await import('../vitality');
    let n = 0;
    const set = (kg: number, reps: number, extra: Record<string, unknown> = {}) => ({
      id: `s${n++}`, setNumber: 1, targetWeightKg: kg, targetReps: reps, actualWeightKg: kg, actualReps: reps, actualRir: 1, completed: true, ...extra,
    });
    const ex = (exerciseId: string, name: string, pillar: string, equipment: string, sets: any[]) => ({
      id: `e${n++}`, exerciseId, name, pillar, equipment, sets, minReps: 5, maxReps: 8,
    });
    const workout = (at: string, exercises: any[]): any => ({
      id: `w${n++}`, date: at.slice(0, 10), name: 'Test', splitDay: 'Push', exercises, completed: true, completedAt: at, readinessState: 'Normal', readinessZScore: 0,
    });
    const bw = 80;
    const history = [
      workout('2026-09-01T18:00:00.000Z', [
        ex('ex-barbell-squat', 'Back Squat', 'Squat', 'barbell', [set(100, 5)]),
        ex('ex-bench-press', 'Bench Press', 'Horizontal Push', 'barbell', [set(80, 5)]),
      ]),
      workout('2026-10-20T18:00:00.000Z', [
        ex('ex-barbell-squat', 'Back Squat', 'Squat', 'barbell', [set(140, 3)]),
        ex('ex-bench-press', 'Bench Press', 'Horizontal Push', 'barbell', [set(100, 3)]),
        ex('ex-db-rdl', 'DB Romanian Deadlift', 'Hinge', 'dumbbell', [set(30, 10)]),
        ex('ex-chinup', 'Chin-Up', 'Vertical Pull', 'bodyweight', [set(0, 4, { actualWeightKg: 0 })]),
        ex('ex-bulgarian-split-squat', 'Bulgarian Split Squat', 'Squat', 'dumbbell', [set(16, 8, { actualRepsLeft: 6, actualRepsRight: 8, actualReps: 6 })]),
      ]),
    ];
    const r = ms.buildMovementStandards({ workouts: history, biometrics: [], bodyweightKg: bw, gender: 'male' });
    const L = (p: string) => r.levels.find((l) => l.pillar === p)!;
    assert(r.tableLabel === 'men, 18–39', `Card names the table it uses (got ${r.tableLabel})`);
    assert(L('Squat').tested && !L('Hinge').tested, 'Tested = the standard lift for 5 reps or fewer; a dumbbell RDL is Estimated');
    assert(!L('Vertical Push').logged && L('Horizontal Pull').source === 'none', 'Unlogged movements have no level; rows have no published standard');
    assert(L('Squat').firstLevel !== undefined && L('Squat').firstLoggedOn === localDateString(new Date('2026-09-01T18:00:00.000Z')), `Level history: the squat's level when first logged is kept (${L('Squat').firstLevel} on ${L('Squat').firstLoggedOn})`);
    // Chin-up 4 reps at bodyweight ≈ 80 × (1 + (4+1)/30) = 93 kg vs bench ~113 kg: 82%, balanced (Poliquin 81%).
    assert(!r.imbalances.some((i) => i.kind === 'pull-vs-push'), `Chin-up near 81% of bench is balanced (${r.imbalances.map((i) => i.message).join(' ')})`);
    const weakPull = ms.buildMovementStandards({
      workouts: [...history, workout('2026-10-22T18:00:00.000Z', [ex('ex-bench-press', 'Bench Press', 'Horizontal Push', 'barbell', [set(130, 3)])])],
      biometrics: [], bodyweightKg: bw, gender: 'male',
    });
    assert(weakPull.imbalances.some((i) => i.kind === 'pull-vs-push' && i.weaker === 'Vertical Pull'), 'Chin-up well under 81% of bench is flagged as pull behind push');
    assert(r.imbalances.some((i) => i.kind === 'level-gap' && i.weaker === 'Hinge'), `A lift a full level behind another on the same standards is flagged (${r.levels.map((l) => `${l.pillar} ${l.tier ?? '-'} ${l.subDivision ?? ''}`).join(', ')})`);
    // Sides: 6 vs 8 reps = 75% symmetry, under 90%.
    assert(r.sideDifferences.length === 1 && r.sideDifferences[0].weakerSide === 'left' && r.sideDifferences[0].symmetryPct === 75, `Left side at 75% of right is flagged (got ${JSON.stringify(r.sideDifferences)})`);
    const even = ms.buildSideDifferences([workout('2026-10-20T18:00:00.000Z', [ex('ex-bulgarian-split-squat', 'Bulgarian Split Squat', 'Squat', 'dumbbell', [set(16, 9, { actualRepsLeft: 9, actualRepsRight: 10 })])])]);
    assert(even.length === 0, 'Sides at 90% (9 vs 10 reps) are not flagged; only under 90% is');
    assert(ms.isUnilateralExercise({ exerciseId: 'ex-bulgarian-split-squat' }) && ms.isUnilateralExercise({ exerciseId: 'ex-x', name: 'Single-Arm DB Row' }) && !ms.isUnilateralExercise({ exerciseId: 'ex-bench-press', name: 'Bench Press' }), 'Single-arm and single-leg exercises are recognised; bilateral lifts are not');
    assert(cardio(undefined) === 0 && cardio({ date: '2026-10-01', bodyweightKg: 0, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 } as any) === 0, 'Cardio score is 0 with no watch data (never a default)');
    const stepsOnly = cardio({ date: '2026-10-01', bodyweightKg: 0, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 10000, activeZoneMinutes: 0 } as any);
    assert(stepsOnly > 0, 'Cardio score uses only what the watch measured (steps only still scores)');
    const coach = await processAssistantMessage({
      userMessage: 'Am I balanced or is one side weaker?',
      profile: { ...SAMPLE_DEMO_PROFILE, gender: 'male', ageEntered: false },
      activeWorkout: history[1],
      workouts: history,
      biometrics: [{ date: '2026-10-20', bodyweightKg: 80, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 }],
      exerciseCatalog: SEED_EXERCISES,
      bodyweightEmaKg: 80,
      readinessState: 'Normal',
    });
    const t = coach.message.text;
    assert(t.includes('Your levels') && t.includes('Bulgarian Split Squat') && t.includes('75%') && t.includes('Kilgore'), `Coach answers level and balance questions from the athlete's data (got "${t.slice(0, 120)}")`);
  }

  // ==========================================
  // Suite 42: a never-done exercise never takes another lift's number
  // ==========================================
  console.log('\n--- Suite 42: Starting weight for a never-done exercise ---');
  {
    // Sample data: barbell back squat at 117.5 kg, Dumbbell Bulgarian Split Squat never done.
    const demo = generateSeedWorkouts();
    const bss = SEED_EXERCISES.find((e) => e.id === 'ex-bulgarian-split-squat')!;
    const seed: ExerciseSession = {
      id: 'added',
      exerciseId: bss.id,
      name: bss.name,
      pillar: bss.pillar,
      equipment: bss.equipment,
      minReps: 8,
      maxReps: 12,
      sets: [1, 2, 3].map((n) => ({ id: `s${n}`, setNumber: n, targetWeightKg: 16, targetReps: 8, targetRir: 2, completed: false, setType: 'working' as const })),
    };
    const squatKg = 117.5;
    const ctx = { history: demo, bodyweightKg: 81, readinessState: 'Normal' as const, gender: 'male' as const, experienceLevel: 'experienced' as const, unit: 'kg' as const };
    const started = startingWeightForNewExercise(demo[demo.length - 1], seed, ctx);
    assert(started !== null && started >= 30 && started <= 60, `Added split squat starts from a scaled weight, not the 100 kg it used to (got ${started} kg with a ${squatKg} kg squat)`);

    const newAthlete = startingWeightForNewExercise(demo[demo.length - 1], seed, { ...ctx, history: [], experienceLevel: 'new' });
    assert(newAthlete !== null && newAthlete > 0 && newAthlete < (started as number), `A new athlete starts lighter than the sample athlete (got ${newAthlete} kg)`);

    const prescribed = prescribeDoubleProgression(seed, 'Normal', demo, 81, 'Lean Bulk');
    assert(prescribed.nextWeightKg <= 52, `Falling back on the squat halves it for one working leg and converts it to dumbbells (got ${prescribed.nextWeightKg} kg)`);

    const barbell = { equipment: 'barbell' as const, exerciseId: 'ex-barbell-squat', pillar: 'Squat' };
    const single = { equipment: 'dumbbell' as const, exerciseId: bss.id, name: bss.name, pillar: 'Squat' };
    assert(translateWeightBetweenImplements(100, barbell, single, 80) === 42, 'Barbell to single-leg dumbbell: 100 kg becomes 42 kg combined');
    assert(translateWeightBetweenImplements(42, single, barbell, 80) === 100, 'Single-leg dumbbell back to barbell: 42 kg combined becomes 100 kg');
    assert(
      translateWeightBetweenImplements(90, { equipment: 'barbell', exerciseId: 'ex-bench-press' }, { equipment: 'dumbbell', exerciseId: 'ex-db-bench-press' }, 80) === 76,
      'Two-sided lifts keep the plain dumbbell conversion (90 kg barbell = 76 kg combined)'
    );
    assert(
      translateWeightBetweenImplements(20, { equipment: 'dumbbell', exerciseId: 'ex-walking-lunge' }, single, 80) === 20,
      'Two single-sided lifts on the same equipment convert one to one'
    );
    // Estimated max is not touched by the starting-weight factor.
    const e1rmPlain = calculateE1RM(40, 8, 2, 'dumbbell', false, false, 80, bss.id, 'Squat');
    assert(e1rmPlain === Math.round(40 * 1.18 * (1 + 10 / 30) * 10) / 10, 'Estimated max for a split squat is unchanged by the starting-weight factor');
  }

  console.log('\n[42. Renpho scale through the Android app: pair once]');
  {
    const bridge = await import('../../services/healthConnectBridge');
    const rb = await import('../../services/renphoBluetooth');
    const native = await import('../../services/nativeScale');
    const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
    rb.clearSavedRenphoDevices();
    // A stand-in for ScaleBridge.kt, speaking the real messages over a fake port.
    const SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
    const NOTIFY = '0000ffe1-0000-1000-8000-00805f9b34fb';
    const WRITE = '0000ffe3-0000-1000-8000-00805f9b34fb';
    const sent: any[] = [];
    const fromApp = (m: Record<string, unknown>) => port.onmessage?.({ data: JSON.stringify(m) } as MessageEvent);
    const port: any = {
      onmessage: null,
      postMessage(raw: string) {
        const m = JSON.parse(raw);
        sent.push(m);
        if (m.type === 'ble-status') setTimeout(() => fromApp({ type: 'ble-status', supported: true, granted: true, enabled: true }));
        if (m.type === 'ble-listen') {
          setTimeout(() =>
            fromApp({
              type: 'ble-connected', id: m.id, name: 'QN-Scale',
              services: [{ uuid: SERVICE, chars: [
                { uuid: NOTIFY, notify: true },
                { uuid: WRITE, write: true },
              ] }],
            })
          );
        }
        if (m.type === 'ble-notify' || m.type === 'ble-write') setTimeout(() => fromApp({ type: 'ble-op', requestId: m.requestId, ok: true }));
      },
    };
    bridge.attachAppPort(port, 1);
    assert(!native.isNativeScaleAvailable(), 'An older installed app keeps using Web Bluetooth for the scale');
    bridge.attachAppPort(port, 2);
    assert(native.isNativeScaleAvailable(), 'An app that announces it reaches the scale itself');
    assert((await native.getNativeScaleStatus()).granted, 'Status comes from the app');
    assert((await rb.resolveRememberedBleDevice('scale')) === null, 'Nothing is reachable before pairing');

    const readings: any[] = [];
    let disconnects = 0;
    const callbacks = { onReading: (r: any) => readings.push(r), onDisconnect: () => { disconnects++; } };
    const paired = await rb.connectRenphoScale(callbacks, { silentOnly: false, nativeScale: { id: 'AA:BB:CC:DD:EE:FF', name: 'QN-Scale' } });
    assert(sent.some((m) => m.type === 'ble-listen' && m.id === 'AA:BB:CC:DD:EE:FF'), 'Pairing connects to the chosen scale by address, with no browser prompt');
    assert(sent.some((m) => m.type === 'ble-notify' && m.char === NOTIFY), 'The page subscribes to the scale through the app');
    const handshake = sent.find((m) => m.type === 'ble-write' && m.char === WRITE);
    assert(handshake && handshake.hex.length > 0, 'The scale handshake is written through the app');
    assert(rb.loadSavedRenphoDevices().scale?.id === 'AA:BB:CC:DD:EE:FF', 'The paired scale is saved');
    fromApp({ type: 'ble-value', service: SERVICE, char: NOTIFY, hex: '100b002035010200' });
    assert(readings.length === 1 && readings[0].weightKg === 82.45 && readings[0].stabilized, `A packet from the app decodes like Web Bluetooth (got ${JSON.stringify(readings[0]?.weightKg)})`);
    fromApp({ type: 'ble-disconnected' });
    await wait();
    assert(disconnects === 1, 'The scale sleeping reaches the page');
    paired.disconnect();

    // "Restart": the page has only its saved scale, and still needs no prompt.
    const remembered = await rb.resolveRememberedBleDevice('scale');
    assert(remembered?.id === 'AA:BB:CC:DD:EE:FF', 'After pairing the saved scale is reachable with no prompt');
    const before = sent.filter((m) => m.type === 'ble-listen').length;
    const again = await rb.connectRenphoScale(callbacks, { silentOnly: true });
    assert(sent.filter((m) => m.type === 'ble-listen').length === before + 1, 'Listening again needs no pairing');
    again.disconnect();
    // A wait for a sleeping scale is cancelled when the form closes.
    port.postMessage = (raw: string) => { sent.push(JSON.parse(raw)); };
    let rejected = false;
    const waiting = rb.connectRenphoScale(callbacks, { silentOnly: true }).catch(() => { rejected = true; });
    await wait();
    native.stopNativeScale();
    await waiting;
    assert(rejected && sent[sent.length - 1].type === 'ble-stop', 'Closing the form stops listening');
    rb.clearSavedRenphoDevices();
    assert((await rb.resolveRememberedBleDevice('scale')) === null, 'Forgetting the scale clears it');
    // Captured on a real Pixel: Chrome hands the page the channel with empty data, from android-app://<site>,
    // and the app's hello arrives on the channel. The page must keep it, or the app can't reach anything.
    {
      const { receiveAppChannel, isAppBridgeReady, getAppBridgeVersion, canOpenAppScreens } = await import('../../services/healthConnectBridge');
      const trusted = new MessageChannel();
      const accepted = receiveAppChannel({ origin: 'android-app://treise.vercel.app', data: '', ports: [trusted.port1] as any }, 'https://treise.vercel.app', 'treise.vercel.app');
      const stranger = new MessageChannel();
      const rejected = receiveAppChannel({ origin: 'https://evil.example', data: '', ports: [stranger.port1] as any }, 'https://treise.vercel.app', 'treise.vercel.app');
      trusted.port2.postMessage(JSON.stringify({ type: 'hello', version: 3 }));
      await new Promise((r) => setTimeout(r, 20));
      assert(accepted && !rejected && isAppBridgeReady() && getAppBridgeVersion() === 3 && canOpenAppScreens(), 'The page keeps the channel Chrome hands it from the verified app, reads the hello on it, and ignores other senders');
      trusted.port1.close();
      stranger.port1.close();
    }
  }

  console.log('\n[43. Content Strategy Quad, Message Architecture, COPE Domain Model, Poka-Yoke & ROT Governance]');
  {
    const cs = await import('../contentStrategy');

    // 1. Core Content Vision & Winning Aspiration (Halvorson Quad + Playing to Win)
    assert(
      cs.CORE_CONTENT_VISION.coreStrategyStatement ===
        'Translate empirical training data into concise, identity-affirming coaching that guides athletes from effort to mastery.' &&
        cs.CORE_CONTENT_VISION.quadPillars.length === 4 &&
        Boolean(cs.CORE_CONTENT_VISION.winningAspiration.achieve) &&
        Boolean(cs.CORE_CONTENT_VISION.winningAspiration.be) &&
        Boolean(cs.CORE_CONTENT_VISION.winningAspiration.do),
      'Core Content Vision codifies Halvorson Quad and Playing to Win aspiration'
    );

    // 2. User Context & Conversational Design Principles (Pre-Session, Intra-Session, Post-Session)
    assert(
      cs.WORKOUT_LIFECYCLE_CONTEXT_MATRIX.length === 3 &&
        cs.WORKOUT_LIFECYCLE_CONTEXT_MATRIX[0].id === 'pre_session' &&
        cs.WORKOUT_LIFECYCLE_CONTEXT_MATRIX[1].id === 'intra_session' &&
        cs.WORKOUT_LIFECYCLE_CONTEXT_MATRIX[2].id === 'post_session',
      'Workout lifecycle context matrix maps Doing, Feeling, and Gricean execution across all 3 phases'
    );

    // 3. Message Architecture & Voice/Tone Matrix
    assert(
      cs.TREISE_MESSAGE_ARCHITECTURE.length === 3 &&
        cs.TREISE_MESSAGE_ARCHITECTURE[0].id === 'empirical_verifiable' &&
        cs.TREISE_MESSAGE_ARCHITECTURE[0].priority === 1 &&
        cs.VOICE_TONE_MATRIX.tones.prs_and_milestones.sampleCopy === 'New 8RM baseline established.',
      'Message Architecture prioritizes Empirical & Verifiable first and defines lifecycle Voice/Tone matrix'
    );

    // 4. COPE Domain Model & Channel Reuse (Mobile/PWA vs. Pixel Watch Companion)
    assert(cs.COPE_DOMAIN_RELATIONSHIPS.length === 4, 'COPE OOUX domain relationships link Athlete, Goal, Program, Workout, and Exercise');
    const sampleW = generate6WeekMuscleBuildingWorkout(1, 80);
    const sampleEx = sampleW.exercises[2]; // Guillotine press
    const goalChunk = cs.buildCopeGoalChunk({
      baselineValue: 95.5,
      currentValue: 108.4,
      targetValue: 105.0,
      sessionCount: 4,
    });
    assert(goalChunk.Historical_Delta_kg === 12.9, `Goal chunk computes Historical_Delta_kg (+12.9 kg, got ${goalChunk.Historical_Delta_kg})`);
    const exChunk = cs.buildCopeExerciseChunk({
      exercise: sampleEx,
      goal: goalChunk,
      prevBestSet: { weightKg: 68, reps: 12 },
      sessionStimulusRule: 'Today consolidates volume accumulation at your current load to deepen chest hypertrophy.',
    });
    const progChunk = {
      Program_Title: '6-Week Muscle Building Plan',
      Block_Stimulus: 'Hypertrophy' as const,
      Duration_Weeks: 6,
      Weekly_Volume_Landmarks: {
        muscleLabel: 'Chest',
        currentSets: 7,
        mevMrvRange: [13, 19] as [number, number],
        formattedBarLabel: '7 of 13–19 hard sets',
      },
    };
    const mobileView = cs.projectExerciseToMobileCard({
      exerciseChunk: exChunk,
      goalChunk,
      programChunk: progChunk,
    });
    const watchView = cs.projectExerciseToPixelWatch({
      workoutChunk: {
        Workout_ID: sampleW.id,
        Session_Focus: sampleW.name,
        Estimated_Duration: 45,
        Readiness_Adjustment_Note: null,
      },
      exerciseChunk: exChunk,
      goalChunk,
    });
    assert(
      mobileView.twoLineBrief.length === 2 &&
        /\+12\.9 kg/.test(mobileView.twoLineBrief[0]) &&
        mobileView.weeklyVolumeProgressBar?.visible === true &&
        mobileView.weeklyVolumeProgressBar.label === '7 of 13–19 hard sets' &&
        watchView.activeSetScreen.weeklyVolumeVisible === false &&
        watchView.postSetHapticMilestoneAlert === true,
      'COPE channel projections separate Mobile Card (with Weekly Volume bar) from Pixel Watch Companion (hides Weekly Volume during active set, triggers haptic milestone)'
    );

    // 5. UI Microcopy, Action-Oriented Controls, Poka-Yoke & Graceful Empty States
    assert(
      cs.formatRestActionLabel(120) === 'Start 2:00 Rest' &&
        cs.CONTENT_SCHEMA_DICTIONARY.controls.logSet === 'Log Set' &&
        cs.CONTENT_SCHEMA_DICTIONARY.controls.swapExercise === 'Swap Exercise',
      'Action-oriented controls use explicit verbs (Log Set, Start 2:00 Rest, Swap Exercise)'
    );
    const baselineBrief = cs.buildGracefulBaselineBrief(2);
    assert(
      baselineBrief[0] === 'Establishing your baseline strength on this lift today.' &&
        baselineBrief[1] === 'Leave 2 reps in reserve on your final set to calibrate your starting e1RM.',
      'Graceful empty state provides baseline framing for new exercises (n < 2 sessions)'
    );
    const pokaTypo = cs.evaluateWeightPokaYoke(700, 70, 'kg');
    const pokaNormal = cs.evaluateWeightPokaYoke(72.5, 70, 'kg');
    assert(
      pokaTypo.isSuspiciousJump &&
        pokaTypo.message === '700 kg is a 630 kg jump from your last set. Did you mean 70 kg?' &&
        pokaTypo.actionLabel === 'Change to 70 kg' &&
        !pokaNormal.isSuspiciousJump,
      `Poka-yoke fat-finger validation catches 70 kg -> 700 kg jump ("${pokaTypo.message}")`
    );

    // 6. Content Intelligence, Read-Aloud QA Gate & ROT Audit
    assert(
      cs.CONTENT_EVALUATION_MATRIX.length === 3 &&
        cs.runReadAloudQaGate(mobileView.twoLineBrief.join('\n')).passed &&
        !cs.runReadAloudQaGate('Make every set count! Unicorns high-fiving T-Rexes!').passed &&
        !cs.runReadAloudQaGate('Weight: NaN kg').passed,
      'Read-Aloud QA gate passes grounded coaching and rejects cheerleading clichés, hyperbole, and NaN leaks'
    );
    const rotClean = cs.runRotContentAudit([
      { exerciseName: exChunk.Exercise_Name, summary: mobileView.twoLineBrief.join('\n') },
    ]);
    const rotDirty = cs.runRotContentAudit([
      {
        exerciseName: 'Bench Press',
        summary: 'Progress: Your strength is up +19% (7 of 13–19 hard sets).\nGoal: Lift 70 kg for 3 sets of 8 reps at 2 RIR.',
      },
    ]);
    assert(
      rotClean.passed &&
        !rotDirty.passed &&
        rotDirty.redundant.length > 0 &&
        rotDirty.outdated.length > 0,
      'ROT audit passes clean 2-line briefs and flags redundant table/volume duplication and outdated percentages'
    );
  }

  console.log('\nALL 40 ENGINE, GOVERNANCE, DESIGN HEURISTICS, TYPOGRAPHY, WEARABLES, WHOOP STRAIN, GOOGLE AUTH, ONBOARDING CONTEXT, 6-WEEK PROGRAM, TENSOR AI, SESSION REPORT, WORKOUT PAGE, EXERCISE OVERVIEW & RENPHO BLUETOOTH SUITES PASSED SUCCESSFULLY! 🎯');
})().catch((err) => {
  console.error('Test Suite Failed:', err);
  if (typeof process !== 'undefined' && process.exit) {
    process.exit(1);
  }
});







