/**
 * Suite 78: Smart Recommended Exercise Swaps & Unified Best-Set Trend Graph.
 *
 * Verifies:
 * 1. rankSwapRecommendations picks one clear recommended swap with transparent, QA-gated
 *    coaching logic across Gym / Home / Bodyweight, Amber Shield recovery, own history,
 *    and injury contraindications, while collapsing remaining options in ExerciseSwapModal.
 * 2. Isolation exercises replace the data-dense 6-tile Best Set grid with a single calm,
 *    unified TrendChart (reps at constant weight, or load with compact "12×15" markers when
 *    weight increases) shared by both ExerciseCard and ExerciseDetailModal.
 */
import * as fs from 'fs';
import * as path from 'path';
import { runReadAloudQaGate } from '../contentStrategy';
import { AthleteMemoryFact, ExerciseSession, WorkoutSession } from '../types';
import { SEED_EXERCISES, generateSeedWorkouts } from '../../services/seedData';
import { rankSwapRecommendations } from '../../services/swapRecommendations';
import { buildExerciseInsight } from '../../services/exerciseInsight';
import { buildExerciseTrendSpec } from '../../services/exerciseDetails';
import { localDateString } from '../../utils/date';

export async function runSwapRecommendationAndBestSetTrendSuite(
  assert: (condition: boolean, message: string) => void
): Promise<void> {
  console.log('\n[78. Smart Recommended Exercise Swaps & Unified Best-Set Trend Graph]');

  const seedWorkouts = generateSeedWorkouts();
  const makeEx = (id: string, w: number): ExerciseSession => {
    const def = SEED_EXERCISES.find((e) => e.id === id)!;
    return {
      id: `s78-${id}`,
      exerciseId: def.id,
      name: def.name,
      pillar: def.pillar,
      equipment: def.equipment,
      isIsolation: def.isIsolation,
      minReps: def.defaultRepRange[0],
      maxReps: def.defaultRepRange[1],
      sets: [1, 2, 3].map((n) => ({
        id: `s78-${id}-${n}`,
        setNumber: n,
        targetWeightKg: w,
        actualWeightKg: w,
        targetReps: def.defaultRepRange[0],
        targetRir: 2,
        completed: false,
        setType: 'working',
      })),
    };
  };

  // 1. Recommended swap logic across Gym (Normal), Gym (Amber Shield), Squat, Home, Travel, and Injury Memory
  const benchEx = makeEx('ex-bench-press', 80);
  const squatEx = makeEx('ex-barbell-squat', 100);

  const gymBenchNormal = rankSwapRecommendations({
    currentExercise: benchEx,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
    workouts: seedWorkouts,
    readinessState: 'Normal',
  });
  assert(
    gymBenchNormal.recommended != null &&
      gymBenchNormal.recommended.exercise.equipment === 'dumbbell' &&
      gymBenchNormal.recommended.reasons.length >= 2 &&
      gymBenchNormal.otherOptions.length >= 3 &&
      runReadAloudQaGate(gymBenchNormal.recommended.whyRecommended).passed,
    `Gym BB Bench (Normal) recommends ${gymBenchNormal.recommended?.exercise.name} with ${gymBenchNormal.recommended?.reasons.length} clear logic points and ${gymBenchNormal.otherOptions.length} collapsed alternatives`
  );

  const gymBenchAmber = rankSwapRecommendations({
    currentExercise: benchEx,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
    workouts: seedWorkouts,
    readinessState: 'Amber Shield',
  });
  assert(
    gymBenchAmber.recommended != null &&
      (gymBenchAmber.recommended.exercise.equipment === 'machine' ||
        gymBenchAmber.recommended.exercise.equipment === 'cable') &&
      gymBenchAmber.recommended.badgeLabel === 'Recovery-friendly pick' &&
      gymBenchAmber.recommended.reasons.some((r) => /recovery|fatigue|stability/i.test(r)),
    `Gym BB Bench (Amber Shield) recommends high-stability lower-fatigue option (${gymBenchAmber.recommended?.exercise.name}) with Recovery-friendly pick badge`
  );

  const gymSquatNormal = rankSwapRecommendations({
    currentExercise: squatEx,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
    workouts: [],
    readinessState: 'Normal',
  });
  assert(
    gymSquatNormal.recommended?.exercise.id === 'ex-leg-press' ||
      gymSquatNormal.recommended?.exercise.id === 'ex-bulgarian-split-squat',
    `Gym BB Squat recommends primary squat substitute (got ${gymSquatNormal.recommended?.exercise.name}, not arbitrary alphabetical step-up)`
  );

  const homeBench = rankSwapRecommendations({
    currentExercise: benchEx,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'home',
    homeEquipment: ['bench', 'dumbbells'],
    workouts: [],
  });
  assert(
    homeBench.recommended?.exercise.id === 'ex-flat-db-press',
    `Home BB Bench (bench + dumbbells) recommends Flat Dumbbell Bench Press (got ${homeBench.recommended?.exercise.name})`
  );

  const travelBench = rankSwapRecommendations({
    currentExercise: benchEx,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'travel',
    workouts: seedWorkouts,
  });
  assert(
    travelBench.recommended?.exercise.id === 'ex-deficit-pushup' &&
      travelBench.recommended.reasons.some((r) => /zero gym equipment/i.test(r)),
    `Bodyweight / No equipment BB Bench recommends strength-matched Feet-Elevated Deficit Push-Up (got ${travelBench.recommended?.exercise.name})`
  );

  const shoulderInjuryMemories: AthleteMemoryFact[] = [
    {
      id: 'mem-78-shoulder',
      category: 'injury',
      value: 'Avoid dumbbell bench presses due to right shoulder pinch',
      relatedExerciseIds: ['ex-flat-db-press', 'ex-db-bench-press', 'ex-db-floor-press'],
      createdAt: '2026-11-15T10:00:00Z',
      source: 'user',
    },
  ];
  const injurySafeSwap = rankSwapRecommendations({
    currentExercise: benchEx,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
    workouts: seedWorkouts,
    athleteMemories: shoulderInjuryMemories,
  });
  assert(
    injurySafeSwap.recommended != null &&
      !injurySafeSwap.recommended.isContraindicated &&
      !['ex-flat-db-press', 'ex-db-bench-press', 'ex-db-floor-press'].includes(
        injurySafeSwap.recommended.exercise.id
      ) &&
      injurySafeSwap.otherOptions.some((o) => o.exercise.id === 'ex-db-bench-press' && o.isContraindicated),
    `Injury memory blocks contraindicated dumbbell presses from top recommendation (picked ${injurySafeSwap.recommended?.exercise.name}) and marks them contraindicated`
  );

  // Exhaustive Read-Aloud QA check across every catalog exercise × 3 locations × 2 readiness states
  let qaViolations = 0;
  for (const def of SEED_EXERCISES) {
    const ex = makeEx(def.id, 30);
    for (const loc of ['gym', 'home', 'travel'] as const) {
      for (const rState of ['Normal', 'Amber Shield'] as const) {
        const res = rankSwapRecommendations({
          currentExercise: ex,
          exerciseCatalog: SEED_EXERCISES,
          bodyweightEmaKg: 82,
          location: loc,
          readinessState: rState,
        });
        if (res.recommended && !runReadAloudQaGate(res.recommended.whyRecommended).passed) {
          qaViolations++;
        }
      }
    }
  }
  assert(
    qaViolations === 0,
    `All swap recommendation logic strings pass Read-Aloud QA gate across ${SEED_EXERCISES.length} exercises × 6 states (violations=${qaViolations})`
  );

  // 2. Unified Best-Set Trend Graph for isolation exercises (constant weight -> reps line; varied weight -> load line with compact WxR labels)
  const makeIsoWorkout = (id: string, date: string, weightKg: number, reps: number): WorkoutSession => ({
    id,
    date,
    completedAt: `${date}T12:00:00Z`,
    name: 'Push',
    splitDay: 'Push',
    completed: true,
    readinessState: 'Normal',
    readinessZScore: 0,
    exercises: [
      {
        id: `ex-${id}`,
        exerciseId: 'ex-db-lateral-raise',
        name: 'Dumbbell Lateral Raise',
        pillar: 'Vertical Push',
        equipment: 'dumbbell',
        isIsolation: true,
        minReps: 10,
        maxReps: 15,
        sets: [
          {
            id: `st-${id}`,
            setNumber: 1,
            targetWeightKg: weightKg,
            actualWeightKg: weightKg,
            targetReps: reps,
            actualReps: reps,
            targetRir: 1,
            actualRir: 1,
            completed: true,
            setType: 'working',
          },
        ],
      },
    ],
  });

  const latRaiseActive = makeEx('ex-db-lateral-raise', 10);
  const constantWtWorkouts = [
    makeIsoWorkout('iso-c1', '2026-11-01', 10, 10),
    makeIsoWorkout('iso-c2', '2026-11-08', 10, 12),
    makeIsoWorkout('iso-c3', '2026-11-15', 10, 15),
  ];
  const constantInsight = buildExerciseInsight(latRaiseActive, constantWtWorkouts, 'Normal', 82);
  const constantTrend = buildExerciseTrendSpec(
    constantInsight,
    false,
    (kg) => `${kg} kg`,
    localDateString,
    { isIsolation: true, isTwoDumbbell: true, formatWeight: (kg) => `${kg} kg` }
  );
  assert(
    constantTrend.mode === 'best_set_reps' &&
      constantTrend.caption === 'Best set · reps at 10 kg/DB' &&
      constantTrend.latestDisplay === '10 kg/DB × 15' &&
      constantTrend.positiveProgress === true &&
      constantTrend.points.map((p) => p.value).join(',') === '10,12,15',
    `Constant-weight isolation history renders clean Best Set reps trend (${constantTrend.caption}: ${constantTrend.points.map((p) => p.value).join(' -> ')})`
  );

  const steppedWtWorkouts = [
    makeIsoWorkout('iso-s1', '2026-11-01', 10, 12),
    makeIsoWorkout('iso-s2', '2026-11-08', 10, 15),
    makeIsoWorkout('iso-s3', '2026-11-15', 12, 10),
    makeIsoWorkout('iso-s4', '2026-11-20', 12, 12),
  ];
  const steppedInsight = buildExerciseInsight(latRaiseActive, steppedWtWorkouts, 'Normal', 82);
  const steppedTrend = buildExerciseTrendSpec(
    steppedInsight,
    false,
    (kg) => `${kg} kg`,
    localDateString,
    { isIsolation: true, isTwoDumbbell: true, formatWeight: (kg) => `${kg} kg` }
  );
  assert(
    steppedTrend.mode === 'best_set_load' &&
      steppedTrend.caption === 'Best set · load & reps' &&
      steppedTrend.latestDisplay === '12 kg/DB × 12' &&
      steppedTrend.positiveProgress === true &&
      steppedTrend.points.map((p) => p.value).join(',') === '10,10,12,12' &&
      steppedTrend.points.map((p) => p.pointLabel).join(',') === '10×12,10×15,12×10,12×12',
    `Weight-stepped isolation history renders clean Best Set load trend without sawtooth regression (${steppedTrend.points.map((p) => p.pointLabel).join(' -> ')})`
  );

  const emptyIsoInsight = buildExerciseInsight(latRaiseActive, [], 'Normal', 82);
  const emptyIsoTrend = buildExerciseTrendSpec(
    emptyIsoInsight,
    false,
    (kg) => `${kg} kg`,
    localDateString,
    { isIsolation: true, isTwoDumbbell: true, formatWeight: (kg) => `${kg} kg` }
  );
  assert(
    emptyIsoTrend.points.length === 0 && emptyIsoTrend.emptyTitle === 'No history yet',
    'Unlogged isolation exercise uses honest TrendChart empty state'
  );

  // 3. UI & single-source wiring checks across ExerciseSwapModal, TrainTab, coachTools, ExerciseCard, ExerciseDetailModal, TrendChart
  const swapModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ExerciseSwapModal.tsx'), 'utf8');
  const trainTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/TrainTab.tsx'), 'utf8');
  const coachToolsSrc = fs.readFileSync(path.join(process.cwd(), 'src/services/coachTools.ts'), 'utf8');
  const exCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ExerciseCard.tsx'), 'utf8');
  const exDetailSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/train/ExerciseDetailModal.tsx'), 'utf8');
  const trendChartSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/common/TrendChart.tsx'), 'utf8');

  assert(
    swapModalSrc.includes('rankSwapRecommendations') &&
      swapModalSrc.includes('Why this swap') &&
      swapModalSrc.includes('showAllOptions') &&
      swapModalSrc.includes('Hide other options') &&
      trainTabSrc.includes('athleteMemories={profile.athleteMemories}') &&
      trainTabSrc.includes("id: 'add-exercise'") &&
      !trainTabSrc.includes('+ Add exercise') &&
      coachToolsSrc.includes('rankSwapRecommendations'),
    'ExerciseSwapModal highlights the recommended swap with Why this swap logic, collapses other options by default, and shares rankSwapRecommendations with AI Coach'
  );

  assert(
    !exCardSrc.includes('role="progressbar"') &&
      !exCardSrc.includes('grid-cols-2 sm:grid-cols-3') &&
      exCardSrc.includes('isIsolation: isIsolationView') &&
      exCardSrc.includes('<TrendChart') &&
      exDetailSrc.includes('isIsolation: isIsolationView') &&
      trendChartSrc.includes('pointLabel') &&
      trendChartSrc.includes('detailLabel'),
    'ExerciseCard removes the cluttered 6-tile Best Set grid & progress bar in favor of a unified TrendChart shared with ExerciseDetailModal'
  );
}
