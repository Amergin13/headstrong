import * as fs from 'fs';
import * as path from 'path';
import {
  COARSE_JUMP_THRESHOLD,
  applyEnvironmentOverlayToSession,
  buildExerciseBridgeBands,
  calculateFractionalVolumeByEquipment,
  createOverlayForTrainingLocation,
  evaluateSingleExerciseContinuitySwap,
  rebuildIsolatedProgressionStates,
} from '../continuityEngine';
import { HARD_SET_MAX_RIR } from '../e1rm';
import { EQUIPMENT_JUMP_EXPANSION_THRESHOLD } from '../progressionRules';
import { ExerciseDefinition, UserProfile, WorkoutSession } from '../types';
import { NEW_USER_PROFILE, SEED_EXERCISES } from '../../services/seedData';
import { parseEnvironmentConstraintText } from '../../services/environmentOverlayParser';
import { buildContextEnvelope, serializeContextEnvelopeForPrompt } from '../../services/coachContextEnvelope';
import { processAssistantMessage } from '../../services/aiAssistantService';
import { buildExerciseProgressChart, filterChartByTimeline } from '../../services/progressSeries';
import { buildExerciseInsight } from '../../services/exerciseInsight';
import { acceptExerciseNote, buildExerciseNoteFacts } from '../../services/exerciseCoachNote';
import { buildAthleteKnowledgeGraph } from '../knowledgeGraph';
import {
  deleteCustomExerciseFromCatalog,
  deletePastWorkoutFromHistory,
  isCustomExercise,
  updateCustomExerciseInCatalog,
  updatePastWorkoutInHistory,
} from '../../services/workoutHistoryEdits';
import { muscleSetsBetween } from '../../services/storage';

type AssertFn = (condition: boolean, message: string) => void;

export async function runPreAndroidCleanupSuite(assert: AssertFn): Promise<void> {
  console.log('\n[76. Pre-Android Web App Completeness, Unification & Cleanup]');

  // 1. Unified Persistent Location Switching onto EnvironmentOverlay (no timeline/expiry — stays until changed back)
  const gymOv = createOverlayForTrainingLocation('gym');
  const homeOv = createOverlayForTrainingLocation('home', ['dumbbells', 'bench']);
  const travelOv = createOverlayForTrainingLocation('travel');
  assert(
    gymOv === null &&
      homeOv !== null &&
      homeOv.label === 'Home' &&
      homeOv.expiresAtEpochMs === null &&
      homeOv.activeProfileType === 'CUSTOM' &&
      homeOv.availableEquipment.includes('DUMBBELLS') &&
      homeOv.availableEquipment.includes('BENCH') &&
      travelOv !== null &&
      travelOv.label === 'Bodyweight / No equipment' &&
      travelOv.expiresAtEpochMs === null &&
      travelOv.activeProfileType === 'BODYWEIGHT' &&
      travelOv.availableEquipment.every((t) => t === 'NONE'),
    'createOverlayForTrainingLocation maps Gym (null), Home (persistent CUSTOM), and Bodyweight / No equipment (persistent BODYWEIGHT) with no auto-expiry'
  );

  const hotelNoWeights = parseEnvironmentConstraintText("I'm in a hotel room with no weights today");
  assert(
    hotelNoWeights.activeProfileType === 'BODYWEIGHT',
    'parseEnvironmentConstraintText resolves "hotel room with no weights" as BODYWEIGHT instead of HOTEL_DUMBBELLS'
  );

  // 2. Single-Exercise Swap Continuity Routing (4-Branch Honest Cold Start)
  const benchHistory: WorkoutSession[] = [
    {
      id: 'w-bench-1',
      date: '2026-11-10',
      name: 'Upper A',
      splitDay: 'Upper',
      readinessState: 'Normal',
      readinessZScore: 0,
      completed: true,
      completedAt: '2026-11-10T12:00:00Z',
      exercises: [
        {
          id: 'ex-s-1',
          exerciseId: 'ex-bench-press',
          name: 'Barbell Bench Press',
          pillar: 'Horizontal Push',
          equipment: 'barbell',
          minReps: 6,
          maxReps: 8,
          sets: [1, 2, 3].map((n) => ({
            id: `b-${n}`,
            setNumber: n,
            targetWeightKg: 80,
            actualWeightKg: 80,
            targetReps: 8,
            actualReps: 8,
            targetRir: 2,
            actualRir: 2,
            completed: true,
            setType: 'working',
          })),
        },
      ],
    },
  ];
  const currentBenchEx = benchHistory[0].exercises[0];
  const activeBenchEx = {
    ...currentBenchEx,
    sets: currentBenchEx.sets.map((s) => ({ ...s, completed: false })),
  };
  const flatDbDef = SEED_EXERCISES.find((e) => e.id === 'ex-flat-db-press')!;
  const machineChestDef =
    SEED_EXERCISES.find((e) => e.equipment === 'machine' && e.pillar === 'Horizontal Push') ??
    SEED_EXERCISES.find((e) => e.equipment === 'cable' && e.pillar === 'Horizontal Push')!;
  const pushupDef = SEED_EXERCISES.find((e) => e.id === 'ex-deficit-pushup') ?? SEED_EXERCISES.find((e) => e.id === 'ex-pushup')!;

  const swapDb = evaluateSingleExerciseContinuitySwap({
    currentExercise: activeBenchEx,
    replacementDef: flatDbDef,
    historicalWorkouts: benchHistory,
    exerciseCatalog: SEED_EXERCISES,
    userBodyweightKg: 80,
  });
  const swapMachine = evaluateSingleExerciseContinuitySwap({
    currentExercise: activeBenchEx,
    replacementDef: machineChestDef,
    historicalWorkouts: benchHistory,
    exerciseCatalog: SEED_EXERCISES,
    userBodyweightKg: 80,
  });
  const swapBw = evaluateSingleExerciseContinuitySwap({
    currentExercise: activeBenchEx,
    replacementDef: pushupDef,
    historicalWorkouts: benchHistory,
    exerciseCatalog: SEED_EXERCISES,
    userBodyweightKg: 80,
  });

  assert(
    swapDb.prescription.calibrationSource === 'ANCHOR_PRIOR' &&
      swapDb.prescription.sets[0].isWeightEstimated === true &&
      (swapDb.prescription.sets[0].suggestedWeightKg ?? 0) > 0 &&
      swapDb.anchorReferenceLabel === 'BB 80×8',
    `Single-lift swap to unlogged DB uses ANCHOR_PRIOR with ~ estimate (${swapDb.prescription.sets[0].suggestedWeightKg} kg/hand) and anchor ref ${swapDb.anchorReferenceLabel}`
  );
  assert(
    swapMachine.prescription.calibrationSource === 'EFFORT_ONLY' &&
      swapMachine.prescription.sets[0].suggestedWeightKg === null &&
      swapMachine.prescription.sets[0].setupLabel === 'Pick moderate',
    'Single-lift swap to unlogged machine/cable uses EFFORT_ONLY ("Pick moderate", null weight) instead of guessing pin weight'
  );
  assert(
    swapBw.prescription.rationaleKind === 'BODYWEIGHT' &&
      Boolean(swapBw.prescription.setupLabel?.includes('% BW')) &&
      swapBw.prescription.sets.every((s) => s.targetRir <= 1),
    `Single-lift swap to bodyweight provides setup label (${swapBw.prescription.setupLabel}) and tightens RIR to 0–1 under light load`
  );

  // 3. Single-Source Hard-Set RIR Threshold (HARD_SET_MAX_RIR = 3) & Coarse-Jump Threshold (0.075)
  assert(
    HARD_SET_MAX_RIR === 3 &&
      COARSE_JUMP_THRESHOLD === EQUIPMENT_JUMP_EXPANSION_THRESHOLD &&
      COARSE_JUMP_THRESHOLD === 0.075,
    'HARD_SET_MAX_RIR (3) and COARSE_JUMP_THRESHOLD === EQUIPMENT_JUMP_EXPANSION_THRESHOLD (7.5%) share single sources of truth'
  );

  const mixedRirWorkout: WorkoutSession = {
    id: 'w-rir-check',
    date: '2026-11-18',
    name: 'Push',
    splitDay: 'Push',
    readinessState: 'Normal',
    readinessZScore: 0,
    completed: true,
    completedAt: '2026-11-18T12:00:00Z',
    exercises: [
      {
        id: 'ex-rir',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 6,
        maxReps: 8,
        sets: [
          { id: 'r1', setNumber: 1, targetWeightKg: 80, actualWeightKg: 80, targetReps: 8, actualReps: 8, targetRir: 2, actualRir: 2, completed: true, setType: 'working' },
          { id: 'r2', setNumber: 2, targetWeightKg: 80, actualWeightKg: 80, targetReps: 8, actualReps: 8, targetRir: 3, actualRir: 3, completed: true, setType: 'working' },
          { id: 'r3', setNumber: 3, targetWeightKg: 80, actualWeightKg: 80, targetReps: 8, actualReps: 8, targetRir: 4, actualRir: 4, completed: true, setType: 'working' },
        ],
      },
    ],
  };
  const fracRir = calculateFractionalVolumeByEquipment([mixedRirWorkout], SEED_EXERCISES, {
    fromDate: '2026-11-16',
    toDate: '2026-11-22',
  });
  const weeklyVol = muscleSetsBetween([mixedRirWorkout], SEED_EXERCISES, '2026-11-16', '2026-11-22');
  assert(
    fracRir.Chest.total === 2 && weeklyVol.Chest === 2,
    `Hard-set RIR threshold matches everywhere: fractional=${fracRir.Chest.total}, weekly=${weeklyVol.Chest} (RIR 4 excluded)`
  );

  // 4. AI Coach Continuity Awareness (Natural-Language Hotel Dumbbell Overlay + Context Envelope)
  const coachProfile: UserProfile = {
    ...NEW_USER_PROFILE,
    programType: 'starter_6wk',
    activeLocation: 'gym',
  };
  const hotelCoachRes = await processAssistantMessage({
    userMessage: "I'm at a hotel with dumbbells up to 30 kg for the next 5 days",
    profile: coachProfile,
    activeWorkout: { ...benchHistory[0], completed: false, exercises: [activeBenchEx] },
    workouts: benchHistory,
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  const hotelOverlayApplied = hotelCoachRes.updatedProfile?.activeEnvironmentOverlay;
  assert(
    hotelCoachRes.actionTaken?.type === 'SWITCH_LOCATION' &&
      hotelOverlayApplied != null &&
      hotelOverlayApplied.activeProfileType === 'HOTEL_DUMBBELLS' &&
      hotelOverlayApplied.maxDumbbellKg === 30 &&
      hotelOverlayApplied.scope === 'CUSTOM_UNTIL_DATE' &&
      hotelCoachRes.updatedProfile?.activeLocation === 'home' &&
      hotelCoachRes.updatedWorkout?.exercises[0]?.exerciseId !== 'ex-bench-press' &&
      hotelCoachRes.updatedWorkout?.exercises[0]?.anchorExerciseId === 'ex-bench-press',
    'AI Coach parses hotel dumbbell constraint prompt into EnvironmentOverlay (≤30 kg, 5 days) and applies continuity swap'
  );

  const envWithOverlay = buildContextEnvelope({
    profile: { ...coachProfile, ...(hotelCoachRes.updatedProfile ?? {}) },
    activeWorkout: hotelCoachRes.updatedWorkout!,
    workouts: benchHistory,
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  const serializedEnv = serializeContextEnvelopeForPrompt(envWithOverlay);
  assert(
    envWithOverlay.working_state.today_workout.active_environment_overlay?.max_dumbbell_kg === 30 &&
      envWithOverlay.working_state.today_workout.exercises[0]?.anchor_exercise_name === 'Barbell Bench Press' &&
      serializedEnv.includes('Active environment overlay') &&
      serializedEnv.includes('Barbell Bench Press'),
    'Coach ContextEnvelope and prompt serializer expose active EnvironmentOverlay and swapped slot anchor metadata'
  );

  const backGymCoachRes = await processAssistantMessage({
    userMessage: 'Switch back to the gym',
    profile: { ...coachProfile, ...(hotelCoachRes.updatedProfile ?? {}) },
    activeWorkout: hotelCoachRes.updatedWorkout!,
    workouts: benchHistory,
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    backGymCoachRes.updatedProfile?.activeLocation === 'gym' &&
      backGymCoachRes.updatedProfile?.activeEnvironmentOverlay === null &&
      backGymCoachRes.updatedWorkout?.exercises[0]?.exerciseId === 'ex-bench-press',
    'AI Coach "back to the gym" clears activeEnvironmentOverlay and restores master barbell anchor'
  );

  // 5. Past Workout Edit & Delete + Isolated Progression State Rebuild
  const w1: WorkoutSession = {
    ...benchHistory[0],
    id: 'w-edit-1',
    date: '2026-11-12',
    completedAt: '2026-11-12T12:00:00Z',
  };
  const w2: WorkoutSession = {
    id: 'w-edit-2',
    date: '2026-11-15',
    name: 'Hotel Upper',
    splitDay: 'Upper',
    readinessState: 'Normal',
    readinessZScore: 0,
    completed: true,
    completedAt: '2026-11-15T12:00:00Z',
    exercises: [
      {
        id: 'ex-db-edit',
        exerciseId: 'ex-flat-db-press',
        name: 'Flat Dumbbell Press',
        pillar: 'Horizontal Push',
        equipment: 'dumbbell',
        minReps: 8,
        maxReps: 12,
        anchorExerciseId: 'ex-bench-press',
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
    ],
  };
  const initialStates = rebuildIsolatedProgressionStates([w1, w2], 80);
  assert(
    initialStates['ex-bench-press']?.lastWorkingWeightKg === 80 &&
      initialStates['ex-flat-db-press']?.lastWorkingWeightKg === 26,
    'rebuildIsolatedProgressionStates maintains strictly isolated barbell & dumbbell states'
  );

  const editedW1: WorkoutSession = {
    ...w1,
    exercises: [
      {
        ...w1.exercises[0],
        athleteNotes: 'Felt locked in',
        sets: w1.exercises[0].sets.map((s) => ({ ...s, actualWeightKg: 85 })),
      },
    ],
  };
  const afterEdit = updatePastWorkoutInHistory({
    workouts: [w1, w2],
    updatedWorkout: editedW1,
    defaultBodyweightKg: 80,
    nowMs: Date.parse('2026-11-16T12:00:00Z'),
  });
  assert(
    afterEdit.exerciseProgressionStates['ex-bench-press']?.lastWorkingWeightKg === 85 &&
      afterEdit.exerciseProgressionStates['ex-flat-db-press']?.lastWorkingWeightKg === 26 &&
      afterEdit.nextWorkouts[0].exercises[0].athleteNotes === 'Felt locked in',
    'updatePastWorkoutInHistory updates sets + notes and rebuilds isolated progression state cleanly'
  );

  const afterDelete = deletePastWorkoutFromHistory({
    workouts: afterEdit.nextWorkouts,
    workoutId: 'w-edit-2',
    defaultBodyweightKg: 80,
    nowMs: Date.parse('2026-11-16T12:00:00Z'),
  });
  assert(
    afterDelete.nextWorkouts.length === 1 &&
      afterDelete.exerciseProgressionStates['ex-flat-db-press'] === undefined &&
      afterDelete.exerciseProgressionStates['ex-bench-press']?.lastWorkingWeightKg === 85 &&
      afterDelete.lastWorkoutDate === '2026-11-12',
    'deletePastWorkoutFromHistory removes workout, purges stale isolated progression state, and recalculates lastWorkoutDate'
  );

  // 6. Travel Bridge Bands on Single-Exercise E1RM Charts
  const bridgeWorkouts: WorkoutSession[] = [
    { ...w1, id: 'bw-1', date: '2026-10-12', completedAt: '2026-10-12T12:00:00Z' },
    { ...w2, id: 'bw-2', date: '2026-10-20', completedAt: '2026-10-20T12:00:00Z' },
    { ...w1, id: 'bw-3', date: '2026-10-27', completedAt: '2026-10-27T12:00:00Z' },
  ];
  const bands = buildExerciseBridgeBands('ex-bench-press', bridgeWorkouts, SEED_EXERCISES);
  const benchChart = buildExerciseProgressChart({
    exercise: SEED_EXERCISES.find((e) => e.id === 'ex-bench-press')!,
    workouts: bridgeWorkouts,
    bodyweightKg: 80,
    exerciseCatalog: SEED_EXERCISES,
    fmt: { weight: (v) => `${v} kg`, length: (v) => `${v} cm` },
  });
  const filteredBenchChart = filterChartByTimeline(benchChart, '3M', '2026-11-01');
  assert(
    bands.length === 1 &&
      bands[0].startDate === '2026-10-19' &&
      bands[0].endDate === '2026-10-25' &&
      (benchChart.bridgeBands?.length ?? 0) === 1 &&
      (filteredBenchChart.bridgeBands?.length ?? 0) === 1,
    `Single-exercise E1RM chart exposes Travel Bridge bands (${bands[0]?.startDate}..${bands[0]?.endDate}) through timeline filtering`
  );

  // 7. Custom Exercise Edit & Delete (with built-in protection)
  const customEx: ExerciseDefinition = {
    id: 'custom-1700000001',
    name: 'Landmine Press',
    pillar: 'Vertical Push',
    equipment: 'barbell',
    primaryMuscle: 'Shoulders',
    defaultRepRange: [8, 12],
  };
  const catalogWithCustom = [...SEED_EXERCISES, customEx];
  const editedCustom = updateCustomExerciseInCatalog(catalogWithCustom, {
    ...customEx,
    name: 'Half-Kneeling Landmine Press',
    defaultRepRange: [10, 15],
  });
  const afterDeleteCustom = deleteCustomExerciseFromCatalog(editedCustom, customEx.id);
  const afterAttemptDeleteBuiltin = deleteCustomExerciseFromCatalog(afterDeleteCustom, 'ex-bench-press');
  assert(
    isCustomExercise(customEx) &&
      !isCustomExercise(SEED_EXERCISES[0]) &&
      editedCustom.find((e) => e.id === customEx.id)?.name === 'Half-Kneeling Landmine Press' &&
      !afterDeleteCustom.some((e) => e.id === customEx.id) &&
      afterAttemptDeleteBuiltin.some((e) => e.id === 'ex-bench-press'),
    'Custom exercise catalog helpers edit & delete custom exercises while protecting built-in lifts'
  );

  // 8. UI Wiring, Dead Code Removal, PKCE Extraction & Privacy Policy Sync
  const trainTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/TrainTab.tsx'), 'utf8');
  const progCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ProgramProgressCard.tsx'), 'utf8');
  const settingsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/ProfileSettingsSections.tsx'), 'utf8');
  const swapModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ExerciseSwapModal.tsx'), 'utf8');
  const exCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ExerciseCard.tsx'), 'utf8');
  const exDetailSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ExerciseDetailModal.tsx'), 'utf8');
  const progChartCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/analytics/ProgressChartCard.tsx'), 'utf8');
  const pastModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/program/PastWorkoutModal.tsx'), 'utf8');
  const customModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/program/CustomExerciseModal.tsx'), 'utf8');
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  const whoopSrc = fs.readFileSync(path.join(process.cwd(), 'src/services/whoopService.ts'), 'utf8');
  const engineBarrelSrc = fs.readFileSync(path.join(process.cwd(), 'src/engine/index.ts'), 'utf8');
  const privacyMain = fs.readFileSync(path.join(process.cwd(), 'public/privacy.html'), 'utf8');
  const privacyMirror = fs.readFileSync(path.join(process.cwd(), 'public/privacy/index.html'), 'utf8');

  assert(
    trainTabSrc.includes('{activeDisplayCount}/7') &&
      !trainTabSrc.includes('{activeDisplayCount}/6') &&
      !trainTabSrc.includes('ReadinessBanner') &&
      !trainTabSrc.includes('showLocationDropdown') &&
      !trainTabSrc.includes('EnvironmentOverlaySheet') &&
      !progCardSrc.includes('Training environment') &&
      !progCardSrc.includes('Temporary environment') &&
      !fs.existsSync(path.join(process.cwd(), 'src/components/train/EnvironmentOverlaySheet.tsx')) &&
      trainTabSrc.includes("label: 'Gym'") &&
      trainTabSrc.includes("label: 'Home'") &&
      trainTabSrc.includes("label: 'Bodyweight / No equipment'") &&
      settingsSrc.includes('Available home equipment') &&
      trainTabSrc.includes('evaluateSingleExerciseContinuitySwap') &&
      trainTabSrc.includes('<PastWorkoutModal'),
    'TrainTab refactors location switching strictly into the 3-dot menu (Gym / Home / Bodyweight / No equipment), removes Training environment & timeline sheet, keeps home gear in Settings/Onboarding, fixes 7/7 counter, and reuses PastWorkoutModal'
  );

  assert(
    swapModalSrc.includes('evaluateSingleExerciseContinuitySwap') &&
      swapModalSrc.includes('Pick moderate') &&
      exCardSrc.includes('buildExerciseBridgeBands') &&
      !exCardSrc.includes('Bridged from') &&
      !exCardSrc.includes('Why this works') &&
      exDetailSrc.includes('buildExerciseBridgeBands') &&
      progChartCardSrc.includes('bridgeBands={visibleChart.bridgeBands}'),
    'ExerciseCard strips Bridged from & Why this works clutter, ExerciseSwapModal uses Continuity Engine priors, and all 3 single-exercise E1RM chart surfaces wire Travel Bridge bands'
  );

  // 9. Bridged Context Refactored into 2-Sentence Summary & "Why this works" Refactored into AI Coach
  const bridgedUnloggedEx = {
    ...activeBenchEx,
    id: 'ex-bridged-1',
    exerciseId: 'ex-flat-db-press',
    name: 'Flat Dumbbell Press',
    equipment: 'dumbbell' as const,
    anchorExerciseId: 'ex-bench-press',
    anchorExerciseName: 'Barbell Bench Press',
    continuityRationaleKind: 'ANCHOR_PRIOR' as const,
    minReps: 8,
    maxReps: 12,
  };
  const bridgedInsight = buildExerciseInsight(bridgedUnloggedEx, [], 'Normal', 80);
  const kgForNote = buildAthleteKnowledgeGraph([], [], SEED_EXERCISES, NEW_USER_PROFILE, {}, []);
  const bridgedNoteFacts = buildExerciseNoteFacts({
    exercise: bridgedUnloggedEx,
    insight: bridgedInsight,
    workouts: [],
    readinessState: 'Normal',
    knowledgeGraph: kgForNote,
    primaryMuscle: 'Chest',
    muscleLabel: 'Chest',
    formatWeight: (kg) => `${kg} kg`,
  });
  assert(
    bridgedInsight.lines.length === 2 &&
      bridgedInsight.lines[0].includes('Barbell Bench Press') &&
      acceptExerciseNote(bridgedNoteFacts.fallback, bridgedNoteFacts) !== null,
    'Bridged exercise context lives cleanly inside the strict 2-sentence summary and passes acceptExerciseNote'
  );

  const bridgedSessionForCoach: WorkoutSession = {
    ...benchHistory[0],
    completed: false,
    exercises: [bridgedUnloggedEx],
  };
  const briefingWithSwap = await processAssistantMessage({
    userMessage: "Give me today's briefing",
    profile: coachProfile,
    activeWorkout: bridgedSessionForCoach,
    workouts: benchHistory,
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    briefingWithSwap.message.text.includes("Why today's swaps work") &&
      briefingWithSwap.message.text.includes('covering Barbell Bench Press'),
    'AI Coach session briefing explains active swaps ("Why today\'s swaps work") cleanly'
  );

  const chatSwapRes = await processAssistantMessage({
    userMessage: 'Swap barbell bench press to flat dumbbell press',
    profile: coachProfile,
    activeWorkout: { ...benchHistory[0], completed: false, exercises: [activeBenchEx] },
    workouts: benchHistory,
    biometrics: [],
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 80,
    readinessState: 'Normal',
  });
  assert(
    chatSwapRes.actionTaken?.type === 'SWAP_EXERCISE' &&
      chatSwapRes.message.text.includes('Why this works:'),
    'AI Coach swap_exercise reply explains "Why this works" right in chat'
  );

  assert(
    pastModalSrc.includes('onSaveWorkout') &&
      pastModalSrc.includes('onDeleteWorkout') &&
      pastModalSrc.includes('Confirm delete') &&
      !pastModalSrc.includes('window.confirm') &&
      customModalSrc.includes('onUpdateExercise') &&
      customModalSrc.includes('onDeleteExercise') &&
      !customModalSrc.includes('window.confirm'),
    'PastWorkoutModal and CustomExerciseModal implement Shift Nudge inline edit & 2-step delete without window.confirm'
  );

  assert(
    appSrc.includes('createOverlayForTrainingLocation') &&
      !appSrc.includes("scope !== 'TODAY_ONLY'") &&
      appSrc.includes("calibrationSource !== 'EFFORT_ONLY'") &&
      appSrc.includes("lazy(() => import('./components/onboarding/OnboardingModal')") &&
      appSrc.includes("lazy(() => import('./components/auth/GoogleAuthModal')") &&
      whoopSrc.includes("from './pkce'") &&
      !whoopSrc.includes("from './fitbitService'") &&
      !engineBarrelSrc.includes('./tensorAI'),
    'App unifies location switching, guards EFFORT_ONLY weights, lazy-loads heavy modals, extracts PKCE, and drops dead tensorAI barrel export'
  );

  assert(
    privacyMain === privacyMirror &&
      privacyMain.includes('Strava') &&
      privacyMain.includes('Google Gemini Flash-Lite') &&
      !privacyMain.includes('Gemini 2.5 Flash-Lite') &&
      !privacyMain.includes('Program &rarr; Settings'),
    'public/privacy.html and public/privacy/index.html are byte-identical, document Strava + Google Gemini Flash-Lite, and use Profile -> Settings'
  );

  // Verify overlay switching round-trip doesn't mutate master anchor
  const applied = applyEnvironmentOverlayToSession({
    session: { ...benchHistory[0], completed: false, exercises: [activeBenchEx] },
    overlay: travelOv,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: benchHistory,
    userBodyweightKg: 80,
  });
  const reverted = applyEnvironmentOverlayToSession({
    session: applied,
    overlay: gymOv,
    exerciseCatalog: SEED_EXERCISES,
    historicalWorkouts: benchHistory,
    userBodyweightKg: 80,
  });
  assert(
    applied.exercises[0].equipment === 'bodyweight' &&
      reverted.exercises[0].exerciseId === 'ex-bench-press' &&
      reverted.environmentProfileType === 'HOME_GYM',
    'Unified overlay round-trip (Full Gym -> Bodyweight -> Full Gym) cleanly restores Barbell Bench Press'
  );
}
