import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANONICAL_ARCHITECTURE_REGISTRY, INITIAL_GOVERNANCE_ITEMS } from '../governance';
import { buildAthleteKnowledgeGraph } from '../knowledgeGraph';
import { BiometricLog, ExerciseSession, UserProfile, WorkoutSession } from '../types';
import { NEW_USER_PROFILE, SEED_EXERCISES } from '../../services/seedData';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import { buildExerciseInsight } from '../../services/exerciseInsight';
import { buildExerciseNoteFacts } from '../../services/exerciseCoachNote';
import { buildInspectExerciseSession } from '../../services/exerciseDetails';
import { buildMovementStandards } from '../../services/movementStandards';
import { buildCompletedExerciseSummaries } from '../../services/workoutFinish';

type AssertFn = (condition: boolean, message: string) => void;

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export async function runSingleEngineAndCanonicalUiSuite(assert: AssertFn): Promise<void> {
  console.log('\n--- 80. Additive-First Single Engine, Canonical AI Context/Guidelines & Shared UI Surfaces ---');
  const root = process.cwd();
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  // -------------------------------------------------------------------------
  // 1. Permanent architectural rules in AGENTS.md & locked governance registry
  // -------------------------------------------------------------------------
  const agentsMd = read('AGENTS.md');
  assert(
    agentsMd.includes('12. **Additive-first; never duplicate engines, context, guidelines, or cards.**') &&
      agentsMd.includes('### Canonical Architecture Registry'),
    'AGENTS.md codifies Non-Negotiable #12 (additive-first / zero duplication) and the Canonical Architecture Registry'
  );

  const govItem = INITIAL_GOVERNANCE_ITEMS.find((g) => g.id === 'gov-single-engine-additive-architecture');
  assert(
    Boolean(govItem && govItem.status === 'locked'),
    'src/engine/governance.ts locks gov-single-engine-additive-architecture'
  );

  assert(
    CANONICAL_ARCHITECTURE_REGISTRY.some((e) => e.kind === 'engine') &&
      CANONICAL_ARCHITECTURE_REGISTRY.some((e) => e.kind === 'ai_guideline_context') &&
      CANONICAL_ARCHITECTURE_REGISTRY.some((e) => e.kind === 'ui_surface'),
    'CANONICAL_ARCHITECTURE_REGISTRY registers engine, ai_guideline_context, and ui_surface canonical owners'
  );

  const missingCanonicalPaths: string[] = [];
  for (const entry of CANONICAL_ARCHITECTURE_REGISTRY) {
    for (const rel of [...entry.canonicalFiles, ...(entry.requiredEntryPoints ?? [])]) {
      if (!fs.existsSync(path.join(root, rel))) {
        missingCanonicalPaths.push(`${entry.id}: ${rel}`);
      }
    }
  }
  assert(
    missingCanonicalPaths.length === 0,
    `Every path in CANONICAL_ARCHITECTURE_REGISTRY exists on disk (missing: ${missingCanonicalPaths.join(', ') || 'none'})`
  );

  // -------------------------------------------------------------------------
  // 2. Zero duplicate UI modals, cards, or drill-in components
  // -------------------------------------------------------------------------
  const componentFiles = walkFiles(path.join(root, 'src/components')).map((f) =>
    path.relative(root, f).replace(/\\/g, '/')
  );

  const exerciseDetailComponents = componentFiles.filter((f) =>
    /(?:Exercise|Lift)Detail(?:Modal|Sheet|Drawer|Card|View)\.tsx$/i.test(path.basename(f))
  );
  assert(
    exerciseDetailComponents.length === 1 &&
      exerciseDetailComponents[0] === 'src/components/train/ExerciseDetailModal.tsx',
    `ExerciseDetailModal.tsx is the sole exercise detail drill-in component (found: ${exerciseDetailComponents.join(', ')})`
  );

  const exerciseSwapComponents = componentFiles.filter((f) =>
    /(?:Exercise|Lift)Swap(?:Modal|Sheet|Drawer|View)\.tsx$/i.test(path.basename(f))
  );
  assert(
    exerciseSwapComponents.length === 1 &&
      exerciseSwapComponents[0] === 'src/components/train/ExerciseSwapModal.tsx',
    `ExerciseSwapModal.tsx is the sole exercise swap component (found: ${exerciseSwapComponents.join(', ')})`
  );

  const trendChartComponents = componentFiles.filter((f) =>
    /TrendChart\.tsx$/i.test(path.basename(f))
  );
  assert(
    trendChartComponents.length === 1 && trendChartComponents[0] === 'src/components/common/TrendChart.tsx',
    `TrendChart.tsx is the sole trend chart component (found: ${trendChartComponents.join(', ')})`
  );

  const coachProseComponents = componentFiles.filter((f) =>
    /CoachSummaryText\.tsx$/i.test(path.basename(f))
  );
  assert(
    coachProseComponents.length === 1 &&
      coachProseComponents[0] === 'src/components/common/CoachSummaryText.tsx',
    `CoachSummaryText.tsx is the sole coach summary prose component (found: ${coachProseComponents.join(', ')})`
  );

  // -------------------------------------------------------------------------
  // 3. Every exercise entry point across Workout, Program & Progress opens canonical ExerciseDetailModal
  // -------------------------------------------------------------------------
  const trainTabSrc = read('src/components/train/TrainTab.tsx');
  const finishedCardsSrc = read('src/components/train/FinishedWorkoutCards.tsx');
  const programPlanSrc = read('src/components/program/ProgramPlanView.tsx');
  const programTabSrc = read('src/components/program/ProgramTab.tsx');
  const analyticsTabSrc = read('src/components/analytics/AnalyticsTab.tsx');
  const strengthLevelsSrc = read('src/components/analytics/StrengthLevelsCard.tsx');
  const balanceCardSrc = read('src/components/analytics/BalanceCard.tsx');
  const knowledgeGraphCardSrc = read('src/components/analytics/KnowledgeGraphCard.tsx');

  assert(
    trainTabSrc.includes("import { ExerciseDetailModal } from './ExerciseDetailModal'") &&
      trainTabSrc.includes('buildInspectExerciseSession') &&
      trainTabSrc.includes('onOpenDetail={() => setDetailExerciseId(ex.exerciseId)}') &&
      trainTabSrc.includes('setDetailExerciseId(ex.exerciseId)') &&
      trainTabSrc.includes('onSelectExercise={(ex) =>'),
    'Workout tab routes active, finished, past strip, upcoming planned, and PastWorkoutModal exercises to canonical ExerciseDetailModal'
  );

  assert(
    finishedCardsSrc.includes('onOpenDetail?: () => void') &&
      finishedCardsSrc.includes('min-w-[44px] min-h-[44px]'),
    'CompletedExerciseCard exposes an accessible >=44px drill-in trigger to canonical ExerciseDetailModal'
  );

  assert(
    programPlanSrc.includes("import { ExerciseDetailModal } from '../train/ExerciseDetailModal'") &&
      programPlanSrc.includes('onSelectExercise={(ex) => setInspectedExerciseId(ex.exerciseId)}') &&
      programTabSrc.includes("import { ExerciseDetailModal } from '../train/ExerciseDetailModal'") &&
      programTabSrc.includes('onInspectExercise={(id) => setInspectedExerciseId(id)}') &&
      programTabSrc.includes('setInspectedExerciseId(ex.id)'),
    'Program tab routes PastWorkoutModal, SplitEditor, and Custom exercises to canonical ExerciseDetailModal'
  );

  assert(
    analyticsTabSrc.includes("import { ExerciseDetailModal } from '../train/ExerciseDetailModal'") &&
      analyticsTabSrc.includes('onSelectExercise={(id) => setInspectedExerciseId(id)}') &&
      strengthLevelsSrc.includes('onSelectExercise?: (exerciseId: string) => void') &&
      balanceCardSrc.includes('onSelectExercise?: (exerciseId: string) => void') &&
      knowledgeGraphCardSrc.includes('onSelectExercise?: (exerciseId: string) => void'),
    'Progress tab routes Trophy Case, pinned exercise charts, StrengthLevelsCard, BalanceCard, and KnowledgeGraphCard notes to canonical ExerciseDetailModal'
  );

  // -------------------------------------------------------------------------
  // 4. Zero parallel engines or competing AI guideline / context modules
  // -------------------------------------------------------------------------
  const engineAndServiceFiles = [
    ...walkFiles(path.join(root, 'src/engine')).filter((f) => !f.includes('__tests__')),
    ...walkFiles(path.join(root, 'src/services')).filter((f) => !f.includes('__tests__')),
  ].map((f) => path.relative(root, f).replace(/\\/g, '/'));

  const guidelineModules = engineAndServiceFiles.filter((f) =>
    /(?:contentStrategy|guideline|voiceContract|copyPolicy|aiPolicy)/i.test(path.basename(f))
  );
  assert(
    guidelineModules.length === 1 && guidelineModules[0] === 'src/engine/contentStrategy.ts',
    `src/engine/contentStrategy.ts is the sole AI content strategy / guidelines module (found: ${guidelineModules.join(', ')})`
  );

  const contextEnvelopeModules = engineAndServiceFiles
    .filter((f) => /(?:coachContext|contextEnvelope|aiContext)/i.test(path.basename(f)))
    .sort();
  assert(
    contextEnvelopeModules.length === 2 &&
      contextEnvelopeModules[0] === 'src/services/coachContext.ts' &&
      contextEnvelopeModules[1] === 'src/services/coachContextEnvelope.ts',
    `coachContext.ts (UI route/openings) + coachContextEnvelope.ts (LLM context envelope) are the sole AI context modules (found: ${contextEnvelopeModules.join(', ')})`
  );

  const coachNoteSrc = read('src/services/exerciseCoachNote.ts');
  assert(
    coachNoteSrc.includes('buildGoalDrivenLine1') &&
      coachNoteSrc.includes('buildGoalDrivenLine2') &&
      coachNoteSrc.includes('buildSwappedExerciseCopy') &&
      !coachNoteSrc.includes('Your strength is rising—') &&
      !coachNoteSrc.includes('Your bodyweight strength is rising—') &&
      !coachNoteSrc.includes('Your added-weight strength is rising—'),
    'exerciseCoachNote.ts reuses canonical buildGoalDrivenLine1, buildGoalDrivenLine2 & buildSwappedExerciseCopy from exerciseInsight.ts with zero duplicated Line 1/Line 2 prose'
  );

  // Every service that invokes LLM inference (`promptOnDeviceModel`) MUST import canonical guidelines
  // (`contentStrategy` / `coachPersonalization`), and no service may bypass `onDeviceModel` / `geminiFlashLite`
  // to call `/api/coach/generate` directly.
  const llmCallingServices = engineAndServiceFiles.filter((rel) => {
    if (rel === 'src/services/onDeviceModel.ts' || rel === 'src/services/geminiFlashLite.ts') return false;
    const src = read(rel);
    return /import\s+\{[^}]*\bpromptOnDeviceModel\b[^}]*\}\s+from\s+['"][^'"]*onDeviceModel['"]/.test(src);
  });
  assert(
    llmCallingServices.length === 6,
    `All 6 AI generation surfaces route through canonical promptOnDeviceModel (found ${llmCallingServices.length}: ${llmCallingServices.join(', ')})`
  );
  for (const rel of llmCallingServices) {
    const src = read(rel);
    assert(
      src.includes('contentStrategy') || src.includes('coachPersonalization'),
      `AI surface ${rel} imports canonical AI content guidelines (contentStrategy / coachPersonalization)`
    );
  }
  const directCoachApiCallers = engineAndServiceFiles.filter((rel) => {
    if (rel === 'src/services/geminiFlashLite.ts') return false;
    return /['"]\/api\/coach\/generate['"]/.test(read(rel));
  });
  assert(
    directCoachApiCallers.length === 0,
    `No parallel LLM transport calls /api/coach/generate outside geminiFlashLite.ts (found: ${directCoachApiCallers.join(', ') || 'none'})`
  );

  // -------------------------------------------------------------------------
  // 5. Runtime single-source verification: canonical drill-in IDs & Line 1/2 parity
  // -------------------------------------------------------------------------
  const biometrics: BiometricLog[] = [
    {
      date: '2026-11-10',
      bodyweightKg: 82,
      hrvRmssd: 64,
      restingHr: 54,
      sleepHours: 7.8,
      steps: 9000,
      activeZoneMinutes: 35,
    },
    {
      date: '2026-11-18',
      bodyweightKg: 82,
      hrvRmssd: 65,
      restingHr: 54,
      sleepHours: 7.9,
      steps: 9500,
      activeZoneMinutes: 40,
    },
  ];
  const profile: UserProfile = {
    ...NEW_USER_PROFILE,
    name: 'Canonical Athlete',
    gender: 'male',
    age: 32,
    ageEntered: true,
    goalPhase: 'Lean Bulk',
    activeLocation: 'gym',
    experienceLevel: 'intermediate',
    mesocycleWeek: 2,
    weightUnit: 'kg',
  };

  const makeCompletedSession = (
    id: string,
    date: string,
    benchKg: number,
    benchReps: number,
    pushupReps: number,
    plankSec: number
  ): WorkoutSession => ({
    id,
    date,
    name: 'Upper Push',
    splitDay: 'Upper',
    readinessState: 'Normal',
    readinessZScore: 0.1,
    completed: true,
    completedAt: `${date}T10:00:00Z`,
    exercises: [
      {
        id: `${id}-bench`,
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 6,
        maxReps: 10,
        sets: [
          {
            id: `${id}-b1`,
            setNumber: 1,
            targetWeightKg: benchKg,
            targetReps: benchReps,
            targetRir: 2,
            actualWeightKg: benchKg,
            actualReps: benchReps,
            actualRir: 2,
            completed: true,
          },
        ],
      },
      {
        id: `${id}-pushup`,
        exerciseId: 'ex-pushup',
        name: 'Push-Up',
        pillar: 'Horizontal Push',
        equipment: 'bodyweight',
        minReps: 10,
        maxReps: 20,
        sets: [
          {
            id: `${id}-p1`,
            setNumber: 1,
            targetWeightKg: 0,
            targetReps: pushupReps,
            targetRir: 2,
            actualWeightKg: 0,
            actualReps: pushupReps,
            actualRir: 2,
            completed: true,
          },
        ],
      },
      {
        id: `${id}-plank`,
        exerciseId: 'ex-plank',
        name: 'Front Plank',
        pillar: 'Horizontal Push',
        equipment: 'bodyweight',
        minReps: 1,
        maxReps: 1,
        durationSeconds: plankSec,
        repTargetType: 'duration',
        sets: [
          {
            id: `${id}-pl1`,
            setNumber: 1,
            targetWeightKg: 0,
            targetReps: 1,
            targetRir: 2,
            targetDurationSeconds: plankSec,
            actualWeightKg: 0,
            actualReps: 1,
            actualDurationSeconds: plankSec,
            actualRir: 2,
            completed: true,
          },
        ],
      },
    ],
  });

  const w1 = makeCompletedSession('w80-1', '2026-11-10', 80, 8, 14, 45);
  const w2 = makeCompletedSession('w80-2', '2026-11-18', 85, 8, 17, 60);
  const historyWorkouts = [w1, w2];

  // A. Movement standards carry bestFromExerciseId and resolve via canonical buildInspectExerciseSession
  const standards = buildMovementStandards({
    workouts: historyWorkouts,
    bodyweightKg: 82,
    biometrics,
    gender: 'male',
    age: 32,
  });
  const benchLevel = standards.levels.find((l) => l.pillar === 'Horizontal Push');
  assert(
    Boolean(benchLevel?.logged && benchLevel.bestFromExerciseId === 'ex-bench-press'),
    `buildMovementStandards populates bestFromExerciseId (got: ${benchLevel?.bestFromExerciseId})`
  );
  const resolvedStandard = buildInspectExerciseSession({
    exerciseId: benchLevel!.bestFromExerciseId!,
    exerciseCatalog: SEED_EXERCISES,
    workouts: historyWorkouts,
  });
  assert(
    Boolean(resolvedStandard && resolvedStandard.exercise.exerciseId === 'ex-bench-press'),
    'MovementLevel.bestFromExerciseId resolves through canonical buildInspectExerciseSession'
  );

  // B. Completed exercise summaries carry exerciseId and resolve via canonical buildInspectExerciseSession
  const completedSummaries = buildCompletedExerciseSummaries({
    finished: w2,
    workouts: historyWorkouts,
    bodyweightKg: 82,
    biometrics,
    formatWeight: (kg) => `${Math.round(kg * 10) / 10} kg`,
  });
  assert(
    completedSummaries.length === 3 &&
      completedSummaries.every((s) => Boolean(s.exerciseId)),
    'buildCompletedExerciseSummaries populates catalog exerciseId on every completed exercise'
  );
  for (const s of completedSummaries) {
    const resolved = buildInspectExerciseSession({
      exerciseId: s.exerciseId,
      exerciseCatalog: SEED_EXERCISES,
      workouts: historyWorkouts,
    });
    assert(
      Boolean(resolved && resolved.exercise.exerciseId === s.exerciseId),
      `CompletedExerciseSummary (${s.exerciseId}) resolves cleanly through canonical buildInspectExerciseSession`
    );
  }

  // C. Exact Line 1 + Line 2 parity between buildExerciseInsight and buildExerciseNoteFacts
  const weeklyVol = calculateWeeklyMuscleVolume(historyWorkouts, SEED_EXERCISES);
  const kg = buildAthleteKnowledgeGraph(historyWorkouts, biometrics, SEED_EXERCISES, profile, weeklyVol);
  const fmt = (val: number) => `${Math.round(val * 10) / 10} kg`;
  const parityCases: Array<{
    label: string;
    exercise: ExerciseSession;
    workouts: WorkoutSession[];
    bwKg: number;
    bios: BiometricLog[];
    muscle: string;
  }> = [
    {
      label: 'first-ever barbell lift',
      exercise: {
        id: 'p-first',
        exerciseId: 'ex-barbell-squat',
        name: 'Barbell Back Squat',
        pillar: 'Squat',
        equipment: 'barbell',
        minReps: 6,
        maxReps: 10,
        sets: [{ id: 's1', setNumber: 1, targetWeightKg: 80, targetReps: 6, targetRir: 2, completed: false }],
      },
      workouts: [],
      bwKg: 82,
      bios: biometrics,
      muscle: 'Quads',
    },
    {
      label: '1-session barbell lift',
      exercise: {
        id: 'p-one',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 6,
        maxReps: 10,
        sets: [{ id: 's1', setNumber: 1, targetWeightKg: 80, targetReps: 9, targetRir: 2, completed: false }],
      },
      workouts: [w1],
      bwKg: 82,
      bios: biometrics,
      muscle: 'Chest',
    },
    {
      label: '2-session rising barbell lift',
      exercise: {
        id: 'p-rise',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 6,
        maxReps: 10,
        sets: [{ id: 's1', setNumber: 1, targetWeightKg: 87.5, targetReps: 6, targetRir: 2, completed: false }],
      },
      workouts: historyWorkouts,
      bwKg: 82,
      bios: biometrics,
      muscle: 'Chest',
    },
    {
      label: '2-session bodyweight reps (no BW logged)',
      exercise: {
        id: 'p-bw',
        exerciseId: 'ex-pushup',
        name: 'Push-Up',
        pillar: 'Horizontal Push',
        equipment: 'bodyweight',
        minReps: 10,
        maxReps: 20,
        sets: [{ id: 's1', setNumber: 1, targetWeightKg: 0, targetReps: 18, targetRir: 2, completed: false }],
      },
      workouts: historyWorkouts,
      bwKg: 0,
      bios: [],
      muscle: 'Chest',
    },
    {
      label: '2-session timed hold',
      exercise: {
        id: 'p-time',
        exerciseId: 'ex-plank',
        name: 'Front Plank',
        pillar: 'Horizontal Push',
        equipment: 'bodyweight',
        minReps: 1,
        maxReps: 1,
        durationSeconds: 60,
        repTargetType: 'duration',
        sets: [
          {
            id: 's1',
            setNumber: 1,
            targetWeightKg: 0,
            targetReps: 1,
            targetRir: 2,
            targetDurationSeconds: 60,
            completed: false,
          },
        ],
      },
      workouts: historyWorkouts,
      bwKg: 82,
      bios: biometrics,
      muscle: 'Core',
    },
    {
      label: 'one-off swap anchored to rising barbell bench',
      exercise: {
        id: 'p-swap',
        exerciseId: 'ex-flat-db-press',
        name: 'Flat Dumbbell Press',
        pillar: 'Horizontal Push',
        equipment: 'dumbbell',
        minReps: 8,
        maxReps: 12,
        anchorExerciseId: 'ex-bench-press',
        anchorExerciseName: 'Barbell Bench Press',
        sets: [{ id: 's1', setNumber: 1, targetWeightKg: 32, targetReps: 8, targetRir: 2, completed: false }],
      },
      workouts: historyWorkouts,
      bwKg: 82,
      bios: biometrics,
      muscle: 'Chest',
    },
  ];

  for (const tc of parityCases) {
    const insight = buildExerciseInsight(
      tc.exercise,
      tc.workouts,
      'Normal',
      tc.bwKg,
      12,
      fmt,
      tc.bios,
      tc.muscle,
      profile.goalPhase
    );
    const note = buildExerciseNoteFacts({
      exercise: tc.exercise,
      insight,
      workouts: tc.workouts,
      readinessState: 'Normal',
      knowledgeGraph: kg,
      muscleLabel: tc.muscle,
      goalPhase: profile.goalPhase,
      formatWeight: fmt,
    });
    assert(
      insight.lines[0] === note.lines[0] && insight.lines[1] === note.lines[1],
      `Single-source Line 1 & Line 2 parity (${tc.label}): insight === note`
    );
  }
}
