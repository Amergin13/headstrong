/**
 * Suite 77: Dumbbell Load Integrity, Rep-Range Preservation & Storage Migration v10.
 *
 * Pins every root cause behind impossible dumbbell E1RM / load / rep-range prescriptions
 * (e.g., 150 kg Incline DB Press E1RM, 46.5 kg per-DB recommendations, 8–20 rep leaks).
 */
import {
  calculateE1RM,
  detectLikelyCombinedTwoDumbbellImport,
  extractBarbellBenchmarksKg,
  isLikelyCombinedTwoDumbbellWeight,
} from '../e1rm';
import {
  applyEnvironmentOverlayToSession,
  createOverlayForTrainingLocation,
  createPresetOverlay,
  deriveIsolatedProgressionStateFromHistory,
  prescribeSet1WithAnchorPrior,
  rebuildIsolatedProgressionStates,
  toBarbellEquivalentAnchorE1rm,
  updateExerciseProgressionStateDamped,
} from '../continuityEngine';
import {
  equivalentWeightForReps,
  evaluateRepRangeDoubleProgression,
} from '../progressionRules';
import { learnStrengthRatios } from '../loadPersonalization';
import {
  UserProfile,
  WorkoutSession,
} from '../types';
import { NEW_USER_PROFILE, SEED_EXERCISES } from '../../services/seedData';
import { getTemplateDefaultWeight } from '../../services/workoutGenerator';
import { parseCompetitorCsv } from '../../services/competitorCsvImport';
import { buildExerciseInsight } from '../../services/exerciseInsight';
import {
  loadActiveWorkout,
  loadProfile,
  loadWorkouts,
  permanentlyEraseAllUserData,
  repairCorruptedDumbbellAndRepRangeState,
  resetAllToSeedData,
  runStorageMigrations,
  STORAGE_SCHEMA_VERSION,
} from '../../services/storage';
import { LB_PER_KG } from '../../utils/units';

export async function runDumbbellIntegrityAndRepRangeSuite(
  assert: (condition: boolean, message: string) => void
): Promise<void> {
  console.log('\n[77. Dumbbell Load Integrity, Rep-Range Preservation & Storage Migration v10]');

  const inclineDef = SEED_EXERCISES.find((e) => e.id === 'ex-db-bench-press')!;
  const flatDbDef = SEED_EXERCISES.find((e) => e.id === 'ex-flat-db-press')!;
  const benchDef = SEED_EXERCISES.find((e) => e.id === 'ex-bench-press')!;
  const nowMs = Date.parse('2026-11-21T12:00:00Z');

  // 1. Location switch round-trips (Gym -> Bodyweight -> Home -> Gym AND Gym -> Home cap -> Gym)
  //    never leak maxReps=20 onto compound lifts and never crush >90d same-exercise history by 0.74x.
  const old2017InclineHistory: WorkoutSession[] = [
    {
      id: 'w-2017-incline',
      date: '2017-03-01',
      completedAt: '2017-03-01T12:00:00Z',
      name: 'Upper Body',
      splitDay: 'Upper',
      completed: true,
      readinessState: 'Normal',
      readinessZScore: 0,
      exercises: [
        {
          id: 'ex-hist-inc',
          exerciseId: 'ex-db-bench-press',
          name: 'Incline Dumbbell Press',
          pillar: 'Horizontal Push',
          equipment: 'dumbbell',
          minReps: 8,
          maxReps: 12,
          sets: [1, 2, 3].map((n) => ({
            id: `h-inc-${n}`,
            setNumber: n,
            targetWeightKg: 32,
            actualWeightKg: 32,
            targetReps: 10,
            actualReps: 10,
            targetRir: 2,
            actualRir: 2,
            completed: true,
            setType: 'working',
          })),
        },
      ],
    },
  ];

  const baseGymSession: WorkoutSession = {
    id: 'w-active-77',
    date: '2026-11-21',
    name: 'Upper Push',
    splitDay: 'Upper',
    completed: false,
    readinessState: 'Normal',
    readinessZScore: 0,
    exercises: [
      {
        id: 'ex-act-inc',
        exerciseId: 'ex-db-bench-press',
        name: 'Incline Dumbbell Press',
        pillar: 'Horizontal Push',
        equipment: 'dumbbell',
        minReps: 8,
        maxReps: 12,
        sets: [1, 2, 3].map((n) => ({
          id: `a-inc-${n}`,
          setNumber: n,
          targetWeightKg: 32,
          actualWeightKg: 32,
          targetReps: 9,
          actualReps: 9,
          targetRir: 2,
          actualRir: 2,
          completed: false,
          setType: 'working',
        })),
      },
    ],
  };

  const bwOverlay = createOverlayForTrainingLocation('travel', [], nowMs);
  const homeCappedOverlay = createOverlayForTrainingLocation('home', ['bench', 'dumbbells'], nowMs, {
    maxDumbbellKg: 26,
    dumbbellStepKg: 2,
  });

  // Path A: Gym -> Bodyweight -> Home -> Gym
  const afterBw = applyEnvironmentOverlayToSession({
    session: baseGymSession,
    overlay: bwOverlay,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: old2017InclineHistory,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  const afterBwToHome = applyEnvironmentOverlayToSession({
    session: afterBw,
    overlay: homeCappedOverlay,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: old2017InclineHistory,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  const afterBackToGymA = applyEnvironmentOverlayToSession({
    session: afterBwToHome,
    overlay: null,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: old2017InclineHistory,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  const restoredA = afterBackToGymA.exercises[0];
  assert(
    restoredA.exerciseId === 'ex-db-bench-press' &&
      restoredA.minReps === 8 &&
      restoredA.maxReps === 12 &&
      restoredA.sets[0].targetWeightKg === 32,
    `Gym -> Bodyweight -> Home -> Gym restores Incline DB Press to 32 kg × 8–12 (got ${restoredA.sets[0].targetWeightKg} kg × ${restoredA.minReps}–${restoredA.maxReps})`
  );

  // Path B: Gym (32 kg, 8–12) -> Home (capped at 26 kg, coarse-jump expands maxReps) -> Gym (must restore 32 kg & 8–12!)
  const afterDirectHome = applyEnvironmentOverlayToSession({
    session: baseGymSession,
    overlay: homeCappedOverlay,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: old2017InclineHistory,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  const afterHomeBackToGym = applyEnvironmentOverlayToSession({
    session: afterDirectHome,
    overlay: null,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: old2017InclineHistory,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  const restoredB = afterHomeBackToGym.exercises[0];
  assert(
    afterDirectHome.exercises[0].sets[0].targetWeightKg === 26 &&
      afterDirectHome.exercises[0].maxReps > 12 &&
      restoredB.minReps === 8 &&
      restoredB.maxReps === 12 &&
      restoredB.sets[0].targetWeightKg === 32,
    `Gym -> Home (capped 26 kg, expanded reps) -> Gym restores uncapped 32 kg × 8–12 cleanly (got ${restoredB.sets[0].targetWeightKg} kg × ${restoredB.minReps}–${restoredB.maxReps})`
  );

  // Path C: Gym (32 kg, 8–12) -> Home (uncapped 50 kg rack) preserves 32 kg without 0.74x self-penalty
  const homeUncappedOverlay = createOverlayForTrainingLocation('home', ['bench', 'dumbbells'], nowMs, {
    maxDumbbellKg: 50,
    dumbbellStepKg: 2,
  });
  const afterUncappedHome = applyEnvironmentOverlayToSession({
    session: baseGymSession,
    overlay: homeUncappedOverlay,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: old2017InclineHistory,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  assert(
    afterUncappedHome.exercises[0].sets[0].targetWeightKg === 32 &&
      afterUncappedHome.exercises[0].maxReps === 12,
    `Gym -> Home (uncapped dumbbells) keeps personalized 32 kg × 8–12 without 0.74× collapse (got ${afterUncappedHome.exercises[0].sets[0].targetWeightKg} kg × ${afterUncappedHome.exercises[0].minReps}–${afterUncappedHome.exercises[0].maxReps})`
  );

  // 2. Stale lb-derived dumbbellStepKg (e.g. 2.5 lb = 1.134 kg or 5 lb = 2.268 kg) never creates .5 kg loads in kg mode
  const staleLbStepOverlay = createPresetOverlay('HOTEL_DUMBBELLS', 'WEEK_OVERRIDE', {
    nowMs,
    dumbbellStepKg: 2.5 / LB_PER_KG,
    maxDumbbellKg: null,
  });
  const priorFromStaleStep = prescribeSet1WithAnchorPrior({
    slot: {
      slotId: 'A1',
      programId: 'starter_4day',
      workoutDayId: 'Upper',
      movementPattern: 'HORIZONTAL_PRESS',
      anchorExerciseId: 'ex-bench-press',
      targetSets: 3,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRirInitial: 2,
      restSeconds: 120,
    },
    targetDef: inclineDef,
    anchorDef: benchDef,
    targetState: null,
    anchorState: {
      exerciseId: 'ex-bench-press',
      lastLoggedAt: nowMs - 86400000,
      estimated1rmKg: 105,
      lastWorkingWeightKg: 80,
      lastWorkingReps: 8,
      lastLoggedRir: 2,
      calibratedSessionCount: 3,
    },
    overlay: staleLbStepOverlay,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  const suggestedKg = priorFromStaleStep.sets[0].suggestedWeightKg ?? 0;
  assert(
    suggestedKg > 0 && Number.isInteger(suggestedKg),
    `kg dumbbell prescription ignores stale lb-converted dumbbellStepKg and stays an integer kg (got ${suggestedKg} kg)`
  );

  // 3. Unified ExerciseProgressionState.estimated1rmKg across all writers & accurate DB <-> DB / DB -> BW priors
  const derivedDb = deriveIsolatedProgressionStateFromHistory('ex-db-bench-press', old2017InclineHistory);
  const rebuiltDb = rebuildIsolatedProgressionStates(old2017InclineHistory, 82)['ex-db-bench-press'];
  const dampedDb = updateExerciseProgressionStateDamped(
    null,
    { exerciseId: 'ex-db-bench-press', weightKg: 32, reps: 10, rir: 2, loggedAtMs: nowMs },
    { isFirstAnchorCalibration: true }
  );
  const bbEquivFromDb = toBarbellEquivalentAnchorE1rm(rebuiltDb, inclineDef);
  const dbToFlatDbPrior = prescribeSet1WithAnchorPrior({
    slot: {
      slotId: 'A1',
      programId: 'starter_4day',
      workoutDayId: 'Upper',
      movementPattern: 'HORIZONTAL_PRESS',
      anchorExerciseId: 'ex-db-bench-press',
      targetSets: 3,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRirInitial: 2,
      restSeconds: 120,
    },
    targetDef: flatDbDef,
    anchorDef: inclineDef,
    targetState: null,
    anchorState: rebuiltDb,
    overlay: homeUncappedOverlay,
    userBodyweightKg: 82,
    nowMs,
    unit: 'kg',
  });
  const flatDbSuggested = dbToFlatDbPrior.sets[0].suggestedWeightKg ?? 0;
  assert(
    derivedDb?.estimated1rmKg === rebuiltDb?.estimated1rmKg &&
      rebuiltDb?.estimated1rmKg === dampedDb.estimated1rmKg &&
      rebuiltDb?.estimated1rmKg === 44.8 &&
      bbEquivFromDb > 115 &&
      bbEquivFromDb < 125 &&
      flatDbSuggested >= 30 &&
      flatDbSuggested <= 36,
    `All ExerciseProgressionState writers store unified logged-weight Epley 1RM (${rebuiltDb?.estimated1rmKg} kg), barbell-equiv=${Math.round(bbEquivFromDb)} kg, and Incline->Flat DB prior=${flatDbSuggested} kg/DB`
  );

  // 4. Pyramid / back-off set integrity in evaluateRepRangeDoubleProgression & high-rep equivalentWeightForReps cap
  const pyramidEval = evaluateRepRangeDoubleProgression({
    completedWorkingSets: [
      { id: 'p1', setNumber: 1, targetWeightKg: 30, actualWeightKg: 30, targetReps: 7, actualReps: 7, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
      { id: 'p2', setNumber: 2, targetWeightKg: 30, actualWeightKg: 30, targetReps: 7, actualReps: 7, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
      { id: 'p3', setNumber: 3, targetWeightKg: 25, actualWeightKg: 25, targetReps: 11, actualReps: 11, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
    ],
    sourcePrescribedSetCount: 3,
    targetSetCount: 3,
    minReps: 8,
    maxReps: 10,
    sourceMinReps: 7,
    sourceMaxReps: 11,
    currentWeightKg: 30,
    equipment: 'dumbbell',
    readinessState: 'Normal',
    unit: 'kg',
  });
  const highRepEquiv = equivalentWeightForReps(20, 20, 2, 8, 2);
  assert(
    pyramidEval.status === 'range_changed' &&
      pyramidEval.nextWeightKg <= 30 &&
      pyramidEval.nextWeightKg >= 28 &&
      highRepEquiv <= 23.5,
    `Pyramid back-off sets (30×7, 30×7, 25×11 -> 8–10) never mix 30 kg with 11 reps (got ${pyramidEval.nextWeightKg} kg) and 20-rep equivalentWeightForReps stays capped (${highRepEquiv.toFixed(1)} kg)`
  );

  // 5. learnStrengthRatios ignores 82 kg cable crunches & 59 kg cable pushdowns; getTemplateDefaultWeight respects catalog fallbacks
  const noisyCableHistory: WorkoutSession[] = [
    {
      id: 'w-noisy-cables',
      date: '2026-11-18',
      completedAt: '2026-11-18T12:00:00Z',
      name: 'Upper',
      splitDay: 'Upper',
      completed: true,
      readinessState: 'Normal',
      readinessZScore: 0,
      exercises: [
        {
          id: 'ex-n-bench',
          exerciseId: 'ex-bench-press',
          name: 'Barbell Bench Press',
          pillar: 'Horizontal Push',
          equipment: 'barbell',
          minReps: 6,
          maxReps: 8,
          sets: [{ id: 's1', setNumber: 1, targetWeightKg: 70, actualWeightKg: 70, targetReps: 8, actualReps: 8, targetRir: 2, actualRir: 2, completed: true, setType: 'working' }],
        },
        {
          id: 'ex-n-crunch',
          exerciseId: 'ex-cable-crunch',
          name: 'Cable Rope Crunch',
          pillar: 'Horizontal Push',
          equipment: 'cable',
          isIsolation: true,
          minReps: 8,
          maxReps: 12,
          sets: [{ id: 's2', setNumber: 1, targetWeightKg: 82, actualWeightKg: 82, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 2, completed: true, setType: 'working' }],
        },
        {
          id: 'ex-n-pushdown',
          exerciseId: 'ex-tricep-pushdown',
          name: 'Cable Tricep Pushdown',
          pillar: 'Horizontal Push',
          equipment: 'cable',
          isIsolation: true,
          minReps: 10,
          maxReps: 15,
          sets: [{ id: 's3', setNumber: 1, targetWeightKg: 59, actualWeightKg: 59, targetReps: 12, actualReps: 12, targetRir: 2, actualRir: 2, completed: true, setType: 'working' }],
        },
      ],
    },
  ];
  const learnedRatios = learnStrengthRatios(noisyCableHistory, getTemplateDefaultWeight);
  const hPushRatio = learnedRatios.byPillar['Horizontal Push'] ?? 0;
  assert(
    hPushRatio > 0.65 &&
      hPushRatio < 0.85 &&
      getTemplateDefaultWeight('ex-db-fly') === 10 &&
      getTemplateDefaultWeight('ex-cable-fly') === 25,
    `learnStrengthRatios ignores cable crunch/pushdown stacks (Horizontal Push ratio=${hPushRatio.toFixed(2)}) and getTemplateDefaultWeight returns exact fallbacks (DB fly=10, Cable fly=25)`
  );

  // 6. Competitor CSV import bounds compound maxReps <= 15 and flags likely combined two-dumbbell exports
  const hevyCombinedCsv = [
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
    'Push Day,18 Nov 2026 09:00,18 Nov 2026 10:00,,Bench Press (Barbell),,,0,normal,75,8,,,8',
    'Push Day,18 Nov 2026 09:00,18 Nov 2026 10:00,,Incline Bench Press (Dumbbell),,,0,normal,48,10,,,8',
    'Push Day,18 Nov 2026 09:00,18 Nov 2026 10:00,,Incline Bench Press (Dumbbell),,,1,normal,30,20,,,7',
  ].join('\n');
  const parsedUnhalved = parseCompetitorCsv(hevyCombinedCsv, { exerciseCatalog: SEED_EXERCISES });
  const parsedHalved = parseCompetitorCsv(hevyCombinedCsv, {
    exerciseCatalog: SEED_EXERCISES,
    halveCombinedTwoHandDumbbells: true,
  });
  const importedIncline = parsedUnhalved.workouts[0].exercises.find((e) => e.exerciseId === 'ex-db-bench-press')!;
  const importedInclineHalved = parsedHalved.workouts[0].exercises.find((e) => e.exerciseId === 'ex-db-bench-press')!;
  assert(
    importedIncline.maxReps <= 15 &&
      Boolean(parsedUnhalved.summary.combinedDumbbellWarning) &&
      parsedUnhalved.summary.combinedDumbbellWarning?.exampleWeightKg === 48 &&
      !parsedHalved.summary.combinedDumbbellWarning &&
      importedInclineHalved.sets[0].actualWeightKg === 24,
    `Competitor CSV bounds compound maxReps (${importedIncline.minReps}–${importedIncline.maxReps}), flags 48 kg combined DB warning, and halves cleanly to 24 kg when enabled`
  );

  // 7. Storage migration v10 repairs live corrupted user state (150 kg E1RM, 46.5 kg DB, 8–20 reps, doubled customPlans)
  //    while leaving legitimate elite lifters (140 kg bench + 50 kg/DB) completely untouched.
  const corruptedBenchAndDbWorkout: WorkoutSession = {
    id: 'w-corrupt-77',
    date: '2026-11-18',
    completedAt: '2026-11-18T12:00:00Z',
    name: 'Upper Push',
    splitDay: 'Upper',
    completed: true,
    readinessState: 'Normal',
    readinessZScore: 0,
    exercises: [
      {
        id: 'ex-c-bench',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 6,
        maxReps: 8,
        sets: [
          { id: 'cb1', setNumber: 1, targetWeightKg: 75, actualWeightKg: 75, targetReps: 6, actualReps: 6, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
        ],
      },
      {
        id: 'ex-c-incline',
        exerciseId: 'ex-db-bench-press',
        name: 'Incline Dumbbell Press',
        pillar: 'Horizontal Push',
        equipment: 'dumbbell',
        minReps: 8,
        maxReps: 12,
        sets: [
          { id: 'ci1', setNumber: 1, targetWeightKg: 46.5, actualWeightKg: 46.5, targetReps: 9, actualReps: 9, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
        ],
      },
    ],
  };
  const corruptedActive: WorkoutSession = {
    id: 'w-active-corrupt-77',
    date: '2026-11-21',
    name: 'Upper Push',
    splitDay: 'Upper',
    completed: false,
    readinessState: 'Normal',
    readinessZScore: 0,
    exercises: [
      {
        id: 'ex-ac-incline',
        exerciseId: 'ex-db-bench-press',
        name: 'Incline Dumbbell Press',
        pillar: 'Horizontal Push',
        equipment: 'dumbbell',
        minReps: 8,
        maxReps: 20,
        sets: [1, 2, 3].map((n) => ({
          id: `aci-${n}`,
          setNumber: n,
          targetWeightKg: 46.5,
          actualWeightKg: 46.5,
          targetReps: 14,
          actualReps: 14,
          targetRir: 2,
          actualRir: 2,
          completed: false,
          setType: 'working',
        })),
      },
    ],
  };
  const preV9Profile: UserProfile = {
    ...NEW_USER_PROFILE,
    weightUnit: 'kg',
    activeLocation: 'gym',
    customPlans: [
      {
        id: 'custom:phase-1-bt',
        name: 'Phase 1 BT',
        subtitle: 'Imported',
        workoutsPerWeek: 4,
        phases: [
          {
            phaseNumber: 1,
            name: 'Phase 1',
            shortName: 'P1',
            planSummary: 'Base',
            weeks: [1, 4],
            description: 'Base phase',
            intensityFocus: 'Hypertrophy',
          },
        ],
        createdAt: '2026-11-01T00:00:00Z',
        source: 'spreadsheet',
        templates: [
          {
            workoutNumber: 2,
            week: 1,
            dayOfWeek: 'Wednesday',
            phase: 1,
            title: 'Upper Body',
            splitDay: 'Upper',
            exercises: [
              {
                order: '2A',
                name: 'Mid Incline Dumbbell Press',
                exerciseId: 'ex-db-bench-press',
                pillar: 'Horizontal Push',
                equipment: 'dumbbell',
                sets: 3,
                reps: '8 to 12',
                tempo: '3010',
                restSeconds: 90,
                defaultWeightKg: 55,
              },
            ],
          },
        ],
      },
    ],
  };

  // Sanity-confirm before migration: corrupted workout produces the exact reported 150 kg E1RM!
  const beforeE1rm = calculateE1RM(46.5, 9, 2, 'dumbbell', false, false, 82, 'ex-db-bench-press', 'Horizontal Push', 'Incline Dumbbell Press');
  assert(Math.round(beforeE1rm) === 150, `Pre-migration corrupted 46.5 kg × 9 @ 2 reproduces reported 150 kg E1RM (got ${beforeE1rm})`);

  localStorage.setItem('treise_profile_v3', JSON.stringify(preV9Profile));
  localStorage.setItem('treise_workouts_v3', JSON.stringify([corruptedBenchAndDbWorkout]));
  localStorage.setItem('treise_active_workout_v3', JSON.stringify(corruptedActive));
  localStorage.setItem('treise_exercise_notes_v2', JSON.stringify({ stale: 'Estimated max: 150 kg' }));
  localStorage.setItem('treise_schema_version', '9');

  runStorageMigrations();
  const migratedWorkouts1 = loadWorkouts();
  const migratedActive1 = loadActiveWorkout();
  const migratedProfile1 = loadProfile();
  // Run a second time to verify strict idempotence
  runStorageMigrations();
  const migratedWorkouts2 = loadWorkouts();
  const migratedActive2 = loadActiveWorkout();

  const fixedHistIncline = migratedWorkouts2[0].exercises[1];
  const fixedActiveIncline = migratedActive2.exercises[0];
  const fixedInsight = buildExerciseInsight(fixedActiveIncline, migratedWorkouts2, 'Normal', 82);
  const fixedCustomDefault = migratedProfile1.customPlans?.[0]?.templates[0]?.exercises[0]?.defaultWeightKg;

  assert(
    localStorage.getItem('treise_schema_version') === String(STORAGE_SCHEMA_VERSION) &&
      migratedWorkouts1[0].exercises[1].sets[0].actualWeightKg === 23 &&
      fixedHistIncline.sets[0].actualWeightKg === 23 &&
      fixedActiveIncline.sets[0].targetWeightKg === 23 &&
      Number.isInteger(fixedActiveIncline.sets[0].targetWeightKg) &&
      fixedActiveIncline.minReps === 8 &&
      fixedActiveIncline.maxReps === 12 &&
      fixedActiveIncline.sets[0].targetReps <= 12 &&
      fixedCustomDefault === 28 &&
      migratedProfile1.exerciseProgressionStates?.['ex-db-bench-press']?.lastWorkingWeightKg === 23 &&
      localStorage.getItem('treise_exercise_notes_v2') === null &&
      fixedInsight.history[0].e1rmKg < 85 &&
      !fixedInsight.lines[0].includes('150'),
    `Migration v10 repairs corrupted state idempotently (46.5->23 kg, 8–20->8–12, E1RM=${fixedInsight.history[0]?.e1rmKg} kg, customPlan default=${fixedCustomDefault} kg, stale notes cleared)`
  );

  // Elite lifter protection: 140 kg barbell bench + 50 kg/DB Incline DB Press stays untouched!
  const eliteWorkout: WorkoutSession = {
    ...corruptedBenchAndDbWorkout,
    id: 'w-elite-77',
    exercises: [
      {
        ...corruptedBenchAndDbWorkout.exercises[0],
        sets: [{ id: 'eb1', setNumber: 1, targetWeightKg: 140, actualWeightKg: 140, targetReps: 6, actualReps: 6, targetRir: 2, actualRir: 2, completed: true, setType: 'working' }],
      },
      {
        ...corruptedBenchAndDbWorkout.exercises[1],
        sets: [{ id: 'ei1', setNumber: 1, targetWeightKg: 50, actualWeightKg: 50, targetReps: 8, actualReps: 8, targetRir: 2, actualRir: 2, completed: true, setType: 'working' }],
      },
    ],
  };
  const eliteBenchmarks = extractBarbellBenchmarksKg([eliteWorkout]);
  const eliteRepair = repairCorruptedDumbbellAndRepRangeState({
    profile: NEW_USER_PROFILE,
    workouts: [eliteWorkout],
    activeWorkout: null,
  });
  assert(
    !isLikelyCombinedTwoDumbbellWeight(50, eliteWorkout.exercises[1], eliteBenchmarks) &&
      !detectLikelyCombinedTwoDumbbellImport([eliteWorkout]) &&
      eliteRepair.workouts[0].exercises[1].sets[0].actualWeightKg === 50,
    'Elite lifter safeguard preserves legitimate 50 kg/DB Incline DB Press alongside 140 kg Barbell Bench Press untouched'
  );

  // 8. resetAllToSeedData and permanentlyEraseAllUserData stamp current schema version so reload never re-halves seed DBs
  const seedReset = resetAllToSeedData();
  const seedInclineBefore = seedReset.workouts
    .flatMap((w) => w.exercises)
    .find((e) => e.exerciseId === 'ex-db-bench-press')?.sets[0]?.actualWeightKg;
  const schemaAfterReset = localStorage.getItem('treise_schema_version');
  runStorageMigrations();
  const seedInclineAfter = loadWorkouts()
    .flatMap((w) => w.exercises)
    .find((e) => e.exerciseId === 'ex-db-bench-press')?.sets[0]?.actualWeightKg;

  permanentlyEraseAllUserData();
  const schemaAfterErase = localStorage.getItem('treise_schema_version');

  assert(
    schemaAfterReset === String(STORAGE_SCHEMA_VERSION) &&
      schemaAfterErase === String(STORAGE_SCHEMA_VERSION) &&
      seedInclineBefore != null &&
      seedInclineAfter === seedInclineBefore,
    `resetAllToSeedData & permanentlyEraseAllUserData stamp treise_schema_version=${STORAGE_SCHEMA_VERSION} so reload never halves seed DB weights (${seedInclineBefore} -> ${seedInclineAfter})`
  );
}
