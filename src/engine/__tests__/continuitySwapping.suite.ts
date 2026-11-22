import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyEnvironmentOverlayToSession,
  buildContinuityCopy,
  buildReentryPrescription,
  buildSessionContinuitySummary,
  calculateFractionalVolumeByEquipment,
  clampRir,
  classifyTravelBridgeWeeks,
  createPresetOverlay,
  evaluateCoarseJumpRepExpansion,
  prescribeSet1WithAnchorPrior,
  recalibrateSetsAfterSet1,
  resolveActiveOverlay,
  resolveExerciseMetadata,
  resolveSlotForOverlay,
  updateExerciseProgressionStateDamped,
} from '../continuityEngine';
import { hasInvertedStraightSetRir } from '../progressionRules';
import { ProgramSlot, WorkoutSession } from '../types';
import { parseEnvironmentConstraintText } from '../../services/environmentOverlayParser';
import { buildMuscleProgress } from '../../services/muscleProgress';
import { SEED_EXERCISES } from '../../services/seedData';

type AssertFn = (condition: boolean, message: string) => void;

export async function runContinuitySwappingSuite(assert: AssertFn): Promise<void> {
  console.log('\n--- 75. Seamless Cross-Environment Exercise Swapping & Continuity Engine (Spec Tests 1–8) ---');

  const benchDef75 = SEED_EXERCISES.find((e) => e.id === 'ex-bench-press')!;
  const flatDbDef75 = SEED_EXERCISES.find((e) => e.id === 'ex-flat-db-press')!;
  const latRaiseDef75 = SEED_EXERCISES.find((e) => e.id === 'ex-db-lateral-raise')!;
  const machineChestDef75 = SEED_EXERCISES.find((e) => e.id === 'ex-machine-chest-press')!;
  const inclinePushupDef75 = SEED_EXERCISES.find((e) => e.id === 'ex-incline-pushup')!;

  assert(
    Boolean(benchDef75 && flatDbDef75 && latRaiseDef75 && machineChestDef75 && inclinePushupDef75),
    'All required catalog exercises for Suite 75 exist'
  );

  const slotA1: ProgramSlot = {
    slotId: 'A1',
    programId: 'muscle_building_6wk',
    workoutDayId: 'Upper',
    movementPattern: 'HORIZONTAL_PRESS',
    anchorExerciseId: 'ex-bench-press',
    targetSets: 3,
    targetRepMin: 8,
    targetRepMax: 10,
    targetRirInitial: 2,
    restSeconds: 120,
  };

  const now75 = Date.parse('2026-11-21T12:00:00Z');

  // TEST 1: Barbell-to-Dumbbell Anchor Prior (REQ-2B)
  const anchorBenchState = {
    exerciseId: 'ex-bench-press',
    lastLoggedAt: now75 - 7 * 86400000,
    estimated1rmKg: 101.0,
    lastWorkingWeightKg: 77.5,
    lastWorkingReps: 8,
    lastLoggedRir: 2,
    calibratedSessionCount: 3,
  };
  const anchorSnapshotBefore = JSON.stringify(anchorBenchState);
  const hotelDbOverlay = createPresetOverlay('HOTEL_DUMBBELLS', 'WEEK_OVERRIDE', {
    nowMs: now75,
    dumbbellStepKg: 2,
    maxDumbbellKg: null,
  });

  const resolvedHotel = resolveSlotForOverlay({
    slot: slotA1,
    overlay: hotelDbOverlay,
    exerciseCatalog: SEED_EXERCISES,
    anchorE1rmKg: anchorBenchState.estimated1rmKg,
    userBodyweightKg: 80,
  });
  assert(
    resolvedHotel.wasSwapped && resolvedHotel.exerciseDef.id === 'ex-flat-db-press',
    'Test 1: HOTEL_DUMBBELLS deterministically swaps Barbell Bench -> Flat Dumbbell Press'
  );

  const flatDbMeta = resolveExerciseMetadata(flatDbDef75);
  assert(
    flatDbMeta.anchorTransferRatio === 0.78 && flatDbMeta.isUnilateralPerHand === true,
    'Test 1: Flat DB Press metadata has ratio=0.78 and unilateral per-hand split'
  );

  const priorPresc = prescribeSet1WithAnchorPrior({
    slot: slotA1,
    targetDef: flatDbDef75,
    anchorDef: benchDef75,
    targetState: null,
    anchorState: anchorBenchState,
    overlay: hotelDbOverlay,
    userBodyweightKg: 80,
    nowMs: now75,
  });
  // Exact inverse Epley math: 101 * 0.78 = 78.78; / (1 + (9+2)/30) = 57.644; / 2 = 28.822 -> floor to 2 kg = 28 kg
  assert(
    priorPresc.sets[0].isWeightEstimated === true &&
      priorPresc.sets[0].suggestedWeightKg === 28 &&
      priorPresc.sets[0].calibrationSource === 'ANCHOR_PRIOR' &&
      JSON.stringify(anchorBenchState) === anchorSnapshotBefore,
    `Test 1: Anchor prior produces ~28 kg/hand (got ${priorPresc.sets[0].suggestedWeightKg}), isWeightEstimated=true, ANCHOR_PRIOR, and leaves anchor state untouched`
  );

  // TEST 2: Immediate Set-1 Recalibration & Fatigue Decay (REQ-3)
  const set1Beat = recalibrateSetsAfterSet1({
    slot: slotA1,
    targetDef: flatDbDef75,
    currentPrescriptions: priorPresc.sets.map((s) => ({ ...s, suggestedWeightKg: 26 })),
    loggedSet1: { weightKg: 26, reps: 12, rir: 2 },
    previousTargetState: null,
    overlay: hotelDbOverlay,
    mode: 'REPS_FIRST',
    nowMs: now75,
  });
  const s2 = set1Beat.prescriptions[1];
  const s3 = set1Beat.prescriptions[2];
  const asWorkoutSets = set1Beat.prescriptions.map((p, i) => ({
    id: `t2-${i}`,
    setNumber: p.setNumber,
    targetWeightKg: p.suggestedWeightKg ?? 0,
    targetReps: p.targetRepsMin,
    targetRir: p.targetRir,
    completed: i === 0,
    setType: 'working' as const,
  }));
  assert(
    set1Beat.didRecalibrate &&
      s2.calibrationSource === 'SET_1_RECALIBRATED' &&
      s3.calibrationSource === 'SET_1_RECALIBRATED' &&
      s2.suggestedWeightKg === 28 &&
      s3.suggestedWeightKg === 28 &&
      (s3.targetRepsMin < s2.targetRepsMin || s3.targetRir < s2.targetRir) &&
      !hasInvertedStraightSetRir(asWorkoutSets) &&
      Boolean(set1Beat.restBarStatus && set1Beat.restBarStatus.includes('28 kg')),
    `Test 2: Set-1 beat (26x12 @2 RIR) recalibrates Sets 2–3 to 28 kg with fatigue decay (${s2.targetRepsMin}@${s2.targetRir} -> ${s3.targetRepsMin}@${s3.targetRir}), zero inverted RIR, and calm rest-bar toast`
  );

  // Also verify capped at 26 kg holds weight & decays reps cleanly
  const cappedOverlay = createPresetOverlay('HOTEL_DUMBBELLS', 'WEEK_OVERRIDE', {
    nowMs: now75,
    dumbbellStepKg: 2,
    maxDumbbellKg: 26,
  });
  const set1BeatCapped = recalibrateSetsAfterSet1({
    slot: slotA1,
    targetDef: flatDbDef75,
    currentPrescriptions: priorPresc.sets.map((s) => ({ ...s, suggestedWeightKg: 26 })),
    loggedSet1: { weightKg: 26, reps: 12, rir: 2 },
    previousTargetState: null,
    overlay: cappedOverlay,
    mode: 'REPS_FIRST',
    nowMs: now75,
  });
  assert(
    set1BeatCapped.prescriptions[1].suggestedWeightKg === 26 &&
      set1BeatCapped.prescriptions[2].suggestedWeightKg === 26 &&
      set1BeatCapped.prescriptions[2].targetRepsMin < set1BeatCapped.prescriptions[1].targetRepsMin &&
      set1BeatCapped.coarseJump?.expanded === true,
    'Test 2 (capped): Holding at 26 kg max cap still recalibrates Sets 2–3 with strictly decreasing fatigue reps'
  );

  // TEST 3: Hotel Dumbbell Cap + Coarse-Jump Rep Expansion (REQ-3)
  const coarseLatRaise = evaluateCoarseJumpRepExpansion({
    currentWeightKg: 8,
    nextAvailableWeightKg: 10,
    currentRepMin: 8,
    currentRepMax: 10,
    stepKg: 2,
    targetRir: 1,
  });
  assert(
    coarseLatRaise.expanded &&
      coarseLatRaise.heldWeightKg === 8 &&
      coarseLatRaise.expandedRepMax > 10 &&
      coarseLatRaise.expandedRepMax <= 20 &&
      coarseLatRaise.rationaleKind === 'COARSE_JUMP_EXPANDED' &&
      Boolean(coarseLatRaise.copy?.tier1.includes('+25%')),
    `Test 3A: Lateral raise 8 -> 10 kg (+25% > 7.5%) holds 8 kg and expands rep ceiling to ${coarseLatRaise.expandedRepMax} with COARSE_JUMP_EXPANDED copy`
  );

  const coarseDbCap = evaluateCoarseJumpRepExpansion({
    currentWeightKg: 26,
    maxDumbbellKg: 26,
    currentRepMin: 8,
    currentRepMax: 10,
    stepKg: 2,
    targetRir: 2,
  });
  assert(
    coarseDbCap.expanded &&
      coarseDbCap.heldWeightKg === 26 &&
      coarseDbCap.expandedRepMax > 10 &&
      coarseDbCap.expandedRepMax <= 20 &&
      coarseDbCap.rationaleKind === 'COARSE_JUMP_EXPANDED' &&
      Boolean(coarseDbCap.copy?.tier1),
    `Test 3B: Flat DB Press capped at max_dumbbell_kg=26 holds 26 kg and expands rep ceiling to ${coarseDbCap.expandedRepMax} with COARSE_JUMP_EXPANDED copy`
  );

  // TEST 4: Bodyweight Auto-Selection & Light-Load RIR Tightening (REQ-2C)
  const bwOverlay = createPresetOverlay('BODYWEIGHT', 'WEEK_OVERRIDE', { nowMs: now75 });
  const resolvedBw = resolveSlotForOverlay({
    slot: slotA1,
    overlay: bwOverlay,
    exerciseCatalog: SEED_EXERCISES,
    anchorE1rmKg: 101,
    userBodyweightKg: 80,
  });
  const bwPresc = prescribeSet1WithAnchorPrior({
    slot: slotA1,
    targetDef: resolvedBw.exerciseDef,
    anchorDef: benchDef75,
    targetState: null,
    anchorState: anchorBenchState,
    overlay: bwOverlay,
    userBodyweightKg: 80,
    nowMs: now75,
  });
  const bwRirs = bwPresc.sets.map((s) => s.targetRir);
  const bwAfter22 = recalibrateSetsAfterSet1({
    slot: slotA1,
    targetDef: resolvedBw.exerciseDef,
    currentPrescriptions: bwPresc.sets,
    loggedSet1: { weightKg: null, reps: 22, rir: 1 },
    overlay: bwOverlay,
    exerciseCatalog: SEED_EXERCISES,
    userBodyweightKg: 80,
    nowMs: now75,
  });
  assert(
    resolvedBw.exerciseDef.id === 'ex-deficit-pushup' &&
      (bwPresc.bodyweightLoadPct ?? 0) >= 0.7 &&
      (bwPresc.bodyweightLoadPct ?? 0) <= 0.75 &&
      bwPresc.sets.every((s) => s.suggestedWeightKg === null) &&
      bwRirs.join(',') === '1,1,0' &&
      Boolean(bwAfter22.leverageUpgradeNudge && bwAfter22.leverageUpgradeNudge.chipLabel.includes('Set 2')),
    `Test 4: 80 kg user / 101 kg bench selects Feet-Elevated (~74% BW), suggestedWeightKg=null, light-load RIR=${bwRirs.join('->')}, and emits leverage upgrade nudge at 22 reps`
  );

  // TEST 5: Unfamiliar Machine Skips Load Guess (REQ-2D)
  const machinePresc = prescribeSet1WithAnchorPrior({
    slot: slotA1,
    targetDef: machineChestDef75,
    anchorDef: benchDef75,
    targetState: null,
    anchorState: anchorBenchState,
    nowMs: now75,
  });
  const machineRecal = recalibrateSetsAfterSet1({
    slot: slotA1,
    targetDef: machineChestDef75,
    currentPrescriptions: machinePresc.sets,
    loggedSet1: { weightKg: 55, reps: 10, rir: 2 },
    previousTargetState: null,
    nowMs: now75,
  });
  assert(
    machinePresc.sets[0].suggestedWeightKg === null &&
      machinePresc.sets[0].setupLabel === 'Pick moderate' &&
      machinePresc.sets[0].calibrationSource === 'EFFORT_ONLY' &&
      machinePresc.sets.length === 3 &&
      machinePresc.sets[0].targetRepsMin === 8 &&
      machinePresc.sets[0].targetRepsMax === 10 &&
      machineRecal.didRecalibrate &&
      machineRecal.prescriptions[1].calibrationSource === 'SET_1_RECALIBRATED' &&
      machineRecal.prescriptions[1].suggestedWeightKg === 55 &&
      machineRecal.prescriptions[2].suggestedWeightKg === 55 &&
      machineRecal.prescriptions[2].targetRepsMin <= machineRecal.prescriptions[1].targetRepsMin,
    'Test 5: Unfamiliar Pin-Loaded Chest Press skips load guess (null, "Pick moderate", EFFORT_ONLY) and calibrates Sets 2–3 after Set 1 (55 kg × 10 @ 2 RIR)'
  );

  // TEST 6: RIR Clamping & Cross-Session Outlier Damping (REQ-3)
  assert(clampRir(9) === 6 && clampRir(-2) === 0, 'Test 6: RIR clamps cleanly to 0..6');
  const establishedState = {
    exerciseId: 'ex-bench-press',
    lastLoggedAt: now75 - 7 * 86400000,
    estimated1rmKg: 95.7,
    lastWorkingWeightKg: 70,
    lastWorkingReps: 9,
    lastLoggedRir: 2,
    calibratedSessionCount: 3,
  };
  const dampedNext = updateExerciseProgressionStateDamped(establishedState, {
    exerciseId: 'ex-bench-press',
    weightKg: 70,
    reps: 10,
    rir: 4, // Raw Epley = 70 * (1 + 14/30) = 102.67 (+7.3%)
    loggedAtMs: now75,
  });
  const firstCalBypass = updateExerciseProgressionStateDamped(
    null,
    { exerciseId: 'ex-flat-db-press', weightKg: 26, reps: 12, rir: 2, loggedAtMs: now75 },
    { isFirstAnchorCalibration: true }
  );
  const rir6Ignored = updateExerciseProgressionStateDamped(establishedState, {
    exerciseId: 'ex-bench-press',
    weightKg: 70,
    reps: 10,
    rir: 7, // Clamps to 6 ("6+") -> excluded from high-precision 1RM estimation
    loggedAtMs: now75,
  });
  assert(
    dampedNext.estimated1rmKg != null &&
      dampedNext.estimated1rmKg <= 95.7 * 1.05 &&
      dampedNext.estimated1rmKg < 102.7 &&
      firstCalBypass.estimated1rmKg === 38.1 &&
      rir6Ignored.lastLoggedRir === 6 &&
      rir6Ignored.estimated1rmKg === 95.7,
    `Test 6: Established lift damped from 102.7 kg down to ${dampedNext.estimated1rmKg} kg (<= +5%), first-time calibration bypasses cap (${firstCalBypass.estimated1rmKg}), and RIR 6+ excluded from 1RM`
  );

  // TEST 7: Live Fractional Volume Continuity (REQ-4)
  const week4Workouts75: WorkoutSession[] = [
    {
      id: 'w4-db',
      date: '2026-11-18',
      name: 'Hotel Upper',
      splitDay: 'Upper',
      completed: true,
      readinessState: 'Normal',
      readinessZScore: 0,
      exercises: [
        {
          id: 'e-db',
          exerciseId: 'ex-flat-db-press',
          name: 'Flat Dumbbell Bench Press',
          pillar: 'Horizontal Push',
          equipment: 'dumbbell',
          minReps: 8,
          maxReps: 10,
          sets: [1, 2, 3].map((n) => ({
            id: `db-${n}`,
            setNumber: n,
            targetWeightKg: 26,
            actualWeightKg: 26,
            targetReps: 10,
            actualReps: 10,
            targetRir: 2,
            actualRir: 2,
            completed: true,
            setType: 'working',
          })),
        },
        {
          id: 'e-inc',
          exerciseId: 'ex-incline-pushup',
          name: 'Incline Push-Up',
          pillar: 'Horizontal Push',
          equipment: 'bodyweight',
          minReps: 10,
          maxReps: 18,
          sets: [1, 2, 3].map((n) => ({
            id: `inc-${n}`,
            setNumber: n,
            targetWeightKg: 0,
            actualWeightKg: 0,
            targetReps: 15,
            actualReps: 15,
            targetRir: 1,
            actualRir: 1,
            completed: true,
            setType: 'working',
          })),
        },
      ],
    },
  ];
  const fracVol75 = calculateFractionalVolumeByEquipment(week4Workouts75, SEED_EXERCISES, {
    fromDate: '2026-11-16',
    toDate: '2026-11-22',
  });
  assert(
    fracVol75.Chest.total === 6.0 &&
      fracVol75.Chest.direct === 6.0 &&
      fracVol75.Chest.indirect === 0.0 &&
      fracVol75.Chest.byTool.dumbbell === 3.0 &&
      fracVol75.Chest.byTool.bodyweight === 3.0 &&
      fracVol75.Triceps.total === 3.0 &&
      fracVol75.Triceps.direct === 0.0 &&
      fracVol75.Triceps.indirect === 3.0,
    `Test 7: Fractional volume across DB + BW sums to Chest ${fracVol75.Chest.total} (6.0 direct, 0.0 indirect) and Triceps ${fracVol75.Triceps.total} (0.0 direct, 3.0 indirect)`
  );

  // TEST 8: Overlay Auto-Expiration, Clean Re-Entry & Travel Bridge (REQ-1, REQ-5)
  const mkWkSession = (
    id: string,
    date: string,
    exId: string,
    name: string,
    eq: 'barbell' | 'dumbbell' | 'bodyweight',
    weightKg: number,
    reps: number,
    anchorId?: string,
    wkNum?: number
  ): WorkoutSession => ({
    id,
    date,
    name: `Upper ${id}`,
    splitDay: 'Upper',
    completed: true,
    completedAt: `${date}T12:00:00Z`,
    readinessState: 'Normal',
    readinessZScore: 0,
    programWorkoutNumber: wkNum,
    exercises: [
      {
        id: `ex-${id}`,
        exerciseId: exId,
        name,
        pillar: 'Horizontal Push',
        equipment: eq,
        slotId: 'A1',
        anchorExerciseId: anchorId,
        minReps: 8,
        maxReps: 10,
        sets: [1, 2, 3].map((n) => ({
          id: `${id}-s${n}`,
          setNumber: n,
          targetWeightKg: weightKg,
          actualWeightKg: weightKg,
          targetReps: reps,
          actualReps: reps,
          targetRir: 2,
          actualRir: 2,
          completed: true,
          setType: 'working',
        })),
      },
    ],
  });

  const sixWeekHistory: WorkoutSession[] = [
    mkWkSession('w1', '2026-10-06', 'ex-bench-press', 'Barbell Bench Press', 'barbell', 75, 8, undefined, 1),
    mkWkSession('w2', '2026-10-13', 'ex-bench-press', 'Barbell Bench Press', 'barbell', 75, 9, undefined, 5),
    mkWkSession('w3', '2026-10-20', 'ex-bench-press', 'Barbell Bench Press', 'barbell', 77.5, 8, undefined, 9),
    mkWkSession('w4', '2026-10-27', 'ex-flat-db-press', 'Flat Dumbbell Bench Press', 'dumbbell', 28, 9, 'ex-bench-press', 13),
    mkWkSession('w5', '2026-11-03', 'ex-deficit-pushup', 'Feet-Elevated Deficit Push-Up', 'bodyweight', 0, 16, 'ex-bench-press', 17),
  ];

  const week5ExpiryMs = Date.parse('2026-11-08T23:59:59Z');
  const week6NowMs = Date.parse('2026-11-10T10:00:00Z');
  const expiredBwOverlay = createPresetOverlay('BODYWEIGHT', 'CUSTOM_UNTIL_DATE', {
    nowMs: Date.parse('2026-11-02T08:00:00Z'),
    expiresAtEpochMs: week5ExpiryMs,
  });
  const expiryCheck = resolveActiveOverlay(expiredBwOverlay, week6NowMs);
  assert(
    expiryCheck.expired === true && expiryCheck.active === null,
    'Test 8: Overlay auto-expires past expiresAtEpochMs into Week 6'
  );

  const week6ActiveBase: WorkoutSession = {
    id: 'w6-active',
    date: '2026-11-10',
    name: 'Week 6 Upper',
    splitDay: 'Upper',
    completed: false,
    readinessState: 'Normal',
    readinessZScore: 0,
    exercises: [
      {
        id: 'ex-w6',
        exerciseId: 'ex-deficit-pushup',
        name: 'Feet-Elevated Deficit Push-Up',
        pillar: 'Horizontal Push',
        equipment: 'bodyweight',
        slotId: 'A1',
        anchorExerciseId: 'ex-bench-press',
        minReps: 8,
        maxReps: 10,
        sets: [1, 2, 3].map((n) => ({
          id: `w6-s${n}`,
          setNumber: n,
          targetWeightKg: 0,
          targetReps: 14,
          targetRir: 1,
          completed: false,
          setType: 'working',
        })),
      },
    ],
  };

  const week6Restored = applyEnvironmentOverlayToSession({
    session: week6ActiveBase,
    overlay: expiredBwOverlay,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: sixWeekHistory,
    nowMs: week6NowMs,
  });
  const restoredA1 = week6Restored.exercises[0];
  assert(
    week6Restored.environmentProfileType === 'HOME_GYM' &&
      restoredA1.exerciseId === 'ex-bench-press' &&
      restoredA1.isBridgeReentry === true &&
      restoredA1.sets[0].targetWeightKg === 77.5 &&
      restoredA1.sets[0].targetReps === 8 &&
      Boolean(restoredA1.reentryFromLabel?.includes('77.5')),
    `Test 8: Week 6 auto-restores Barbell Bench Press at 77.5 kg × 8 untouched with LAST AT GYM ref (${restoredA1.reentryFromLabel})`
  );

  const bridgeWeeks = classifyTravelBridgeWeeks({
    anchorExerciseId: 'ex-bench-press',
    slotId: 'A1',
    workouts: sixWeekHistory,
    exerciseCatalog: SEED_EXERCISES,
    weekWindows: [
      { start: '2026-10-05', end: '2026-10-11' },
      { start: '2026-10-12', end: '2026-10-18' },
      { start: '2026-10-19', end: '2026-10-25' },
      { start: '2026-10-26', end: '2026-11-01' },
      { start: '2026-11-02', end: '2026-11-08' },
    ],
  });
  assert(
    bridgeWeeks[0].status === 'LOGGED_ANCHOR' &&
      bridgeWeeks[2].status === 'LOGGED_ANCHOR' &&
      bridgeWeeks[3].status === 'BRIDGE_WEEK' &&
      bridgeWeeks[4].status === 'BRIDGE_WEEK' &&
      bridgeWeeks[3].substituteExerciseNames.includes('Flat Dumbbell Bench Press') &&
      bridgeWeeks[4].substituteExerciseNames.includes('Feet-Elevated Deficit Push-Up'),
    'Test 8: Barbell e1RM history classifies Weeks 4 & 5 as BRIDGE_WEEK (not MISSED_WEEK) with substitute names preserved'
  );

  // Verify 6-week unbroken volume streak once Week 6 completes
  const week6Completed = {
    ...week6Restored,
    completed: true,
    exercises: week6Restored.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({ ...s, completed: true, actualWeightKg: 77.5, actualReps: 8, actualRir: 2 })),
    })),
  };
  const allSix = [...sixWeekHistory, week6Completed];
  const sixWindows = [
    { start: '2026-10-05', end: '2026-10-11' },
    { start: '2026-10-12', end: '2026-10-18' },
    { start: '2026-10-19', end: '2026-10-25' },
    { start: '2026-10-26', end: '2026-11-01' },
    { start: '2026-11-02', end: '2026-11-08' },
    { start: '2026-11-09', end: '2026-11-15' },
  ];
  const weeklyChestAllSix = sixWindows.map(
    (win) => calculateFractionalVolumeByEquipment(allSix, SEED_EXERCISES, { fromDate: win.start, toDate: win.end }).Chest?.total ?? 0
  );
  assert(
    weeklyChestAllSix.every((v) => v >= 3),
    `Test 8: Unbroken 6-week chest volume continuity across BB -> DB -> BW -> BB (${weeklyChestAllSix.join(', ')})`
  );

  // Local constraint parser + deterministic copy templates check
  const parsedHotel5d = parseEnvironmentConstraintText('Hotel dumbbells only up to 30 kg for the next 5 days', {
    nowMs: now75,
  });
  assert(
    parsedHotel5d.activeProfileType === 'HOTEL_DUMBBELLS' &&
      parsedHotel5d.availableEquipment.includes('DUMBBELLS') &&
      !parsedHotel5d.availableEquipment.includes('BARBELL') &&
      parsedHotel5d.maxDumbbellKg === 30 &&
      parsedHotel5d.scope === 'CUSTOM_UNTIL_DATE' &&
      parsedHotel5d.expiresAtEpochMs === now75 + 5 * 86400000,
    'Local parser converts "Hotel dumbbells only up to 30 kg for the next 5 days" into exact EnvironmentOverlay payload offline'
  );

  const copyCheck = buildContinuityCopy('ANCHOR_PRIOR', { anchorName: 'Barbell Bench Press', anchorWeightKg: 77.5 });
  const reentryCheck = buildReentryPrescription({
    anchorExerciseId: 'ex-bench-press',
    slotId: 'A1',
    workouts: sixWeekHistory,
    exerciseCatalog: SEED_EXERCISES,
  });
  assert(
    copyCheck.tier1.includes('Barbell Bench Press') &&
      copyCheck.tier2Bullets.length === 3 &&
      reentryCheck.isBridgeReentry &&
      reentryCheck.bridgeWeekCount === 2 &&
      reentryCheck.lastGymWeightKg === 77.5,
    'Deterministic Tier-1/Tier-2 copy templates and re-entry prescription helper pass all invariants'
  );

  // Post-session Continuity Summary + Dual-Layer Progress (stacked tools + Travel Bridge bands)
  const hotelSummary75 = buildSessionContinuitySummary({
    session: {
      ...sixWeekHistory[3],
      environmentProfileType: 'HOTEL_DUMBBELLS',
      environmentOverlayLabel: 'Hotel Dumbbells (≤30 kg)',
    },
    allWorkouts: sixWeekHistory,
    exerciseCatalog: SEED_EXERCISES,
  });
  const bwSummary75 = buildSessionContinuitySummary({
    session: {
      ...sixWeekHistory[4],
      environmentProfileType: 'BODYWEIGHT',
      environmentOverlayLabel: 'Bodyweight Only',
    },
    allWorkouts: sixWeekHistory,
    exerciseCatalog: SEED_EXERCISES,
  });
  const reentrySummary75 = buildSessionContinuitySummary({
    session: week6Completed,
    allWorkouts: allSix,
    exerciseCatalog: SEED_EXERCISES,
  });
  assert(
    hotelSummary75?.winLeverBadge === 'STIMULUS MATCHED' &&
      bwSummary75?.winLeverBadge === 'LEVERAGE & EFFORT WIN' &&
      reentrySummary75?.winLeverBadge === 'CARRYOVER CONFIRMED' &&
      hotelSummary75.muscleGrowthStatus === 'Muscle growth: Actively progressing' &&
      hotelSummary75.anchorStatusLine.includes('Protected while away'),
    'Post-session Continuity Card produces STIMULUS MATCHED, LEVERAGE & EFFORT WIN, and CARRYOVER CONFIRMED badges with honest dual status lines'
  );

  const muscleProg75 = buildMuscleProgress({
    workouts: allSix,
    exerciseCatalog: SEED_EXERCISES,
    biometrics: [{ date: '2026-10-06', bodyweightKg: 80, hrvRmssd: 0, restingHr: 0, sleepHours: 0, steps: 0, activeZoneMinutes: 0 }],
    bodyweightKg: 80,
    now: Date.parse('2026-11-15T12:00:00Z'),
    weeks: 8,
  });
  const chestProg75 = muscleProg75.find((m) => m.key === 'Chest');
  assert(
    Boolean(chestProg75) &&
      chestProg75!.setsByWeek.some((w) => (w.byTool?.barbell ?? 0) > 0) &&
      chestProg75!.setsByWeek.some((w) => (w.byTool?.dumbbell ?? 0) > 0) &&
      chestProg75!.setsByWeek.some((w) => (w.byTool?.bodyweight ?? 0) > 0) &&
      Boolean(chestProg75!.bridgeBands && chestProg75!.bridgeBands.length >= 1),
    'Dual-Layer Progress View populates stacked tool volume breakdowns and Travel Bridge bands cleanly'
  );

  // UI wiring & privacy checks across Workout 3-dot menu and Continuity surfaces
  const trainTabSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/train/TrainTab.tsx'), 'utf8');
  const progCardSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ProgramProgressCard.tsx'), 'utf8');
  const exCardSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ExerciseCard.tsx'), 'utf8');
  const setRowSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/train/SetRow.tsx'), 'utf8');
  const restModalSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/common/RestTimerModal.tsx'), 'utf8');
  const finishSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/train/WorkoutFinishScreen.tsx'), 'utf8');
  const muscleCardSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/analytics/MuscleProgressCard.tsx'), 'utf8');
  const trendChartSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/components/common/TrendChart.tsx'), 'utf8');
  const parserSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/services/environmentOverlayParser.ts'), 'utf8');
  const appSrc75 = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

  assert(
    !fs.existsSync(path.join(process.cwd(), 'src/components/train/EnvironmentOverlaySheet.tsx')) &&
      !progCardSrc75.includes('Training environment') &&
      !progCardSrc75.includes('Temporary environment') &&
      trainTabSrc75.includes("label: 'Gym'") &&
      trainTabSrc75.includes("label: 'Home'") &&
      trainTabSrc75.includes("label: 'Bodyweight / No equipment'") &&
      !parserSrc75.includes('/api/coach') &&
      !parserSrc75.includes('fetch(') &&
      !exCardSrc75.includes('Why this works') &&
      !exCardSrc75.includes('Bridged from') &&
      !exCardSrc75.includes('LAST AT GYM') &&
      !exCardSrc75.includes('Adapts on S1') &&
      !exCardSrc75.includes("'SETUP'") &&
      !exCardSrc75.includes("'REF'") &&
      !exCardSrc75.includes("'PER DB'") &&
      !exCardSrc75.includes("'ASSIST'") &&
      exCardSrc75.includes('>PREV<') &&
      exCardSrc75.includes('WEIGHT') &&
      setRowSrc75.includes('Pick moderate') &&
      setRowSrc75.includes('showEstimatedTilde') &&
      restModalSrc75.includes('recalibrationStatus') &&
      restModalSrc75.includes('leverageUpgradeNudge') &&
      finishSrc75.includes('continuity.winLeverBadge') &&
      muscleCardSrc75.includes('TOOL_SEGMENTS') &&
      trendChartSrc75.includes('Travel Bridge') &&
      appSrc75.includes('handleApplyEnvironmentOverlay') &&
      appSrc75.includes('exerciseProgressionStates'),
    '3-dot menu location switcher (Gym / Home / Bodyweight / No equipment), Continuity UI surfaces, local-only constraint parser, and App persistence are wired cleanly end-to-end'
  );
}
