import { ActivityLog } from '../engine/activeDays';
import {
  CONTROLLED_VOCABULARY,
  COPE_DOMAIN_RELATIONSHIPS,
  COPE_PHYSIOLOGICAL_RELATIONSHIPS,
  CORE_CONCEPTS,
  CORE_OBJECT_DEFINITIONS,
  IA_PROGRESS_TAXONOMY,
  PRAGMATIC_VISIBILITY_MATRIX,
} from '../engine/contentStrategy';
import { getLatestBodyweightEma } from '../engine/ema';
import { calculateDailyReadiness, displayRecoveryScore, ReadinessEvaluation } from '../engine/readiness';
import { prescribeDoubleProgression } from '../engine/progression';
import { calculateSubTierQuest } from '../engine/strengthStandards';
import {
  AssistantChatMessage,
  AthleteMemoryFact,
  BiometricLog,
  ExerciseSession,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import { buildSafetyResponse, buildCoachSystemPrompt } from '../services/aiAssistantService';
import { buildAthleteGoals, makeCustomGoal } from '../services/athleteGoals';
import { buildCoachOpening, CoachOpening, CoachPlace } from '../services/coachContext';
import {
  buildContextEnvelope,
  OOUX_OBJECT_SCHEMAS,
  serializeContextEnvelopeForPrompt,
} from '../services/coachContextEnvelope';
import { COACH_TOOL_DECLARATIONS } from '../services/coachTools';
import { buildExerciseInsight } from '../services/exerciseInsight';
import { buildMovementStandards } from '../services/movementStandards';
import { buildMuscleProgress } from '../services/muscleProgress';
import { buildGoalCardSummaries, buildGoalRings, buildGoalsSummary, buildPersonalBests } from '../services/progressOverview';
import {
  buildCompositionCharts,
  buildStrengthCharts,
  buildWhoopCharts,
  ProgressFormatters,
} from '../services/progressSeries';
import {
  createTodaysActiveWorkout,
  generateSeedBiometrics,
  generateSeedWorkouts,
  SAMPLE_DEMO_PROFILE,
  SEED_EXERCISES,
} from '../services/seedData';
import { buildWeekStrip } from '../services/sessionSchedule';
import { calculateWeeklyMuscleVolume } from '../services/storage';
import { buildWorkoutFinish, buildCompletedExerciseSummaries } from '../services/workoutFinish';
import { buildAthleteKnowledgeGraph, EXERCISE_SCIENCE_KNOWLEDGE_BASE } from '../engine/knowledgeGraph';
import { localDateOffset, localDateString } from '../utils/date';
import { formatPreciseWeight, formatWeight, WeightUnit } from '../utils/units';

export function buildShowcaseFixtures(unit: WeightUnit = 'kg') {
  const now = new Date();
  const today = localDateString(now);

  const profile: UserProfile = {
    ...SAMPLE_DEMO_PROFILE,
    name: 'Sam',
    weightUnit: unit,
    streakDays: 9,
    whoopConnected: true,
    goalSettings: {
      strengthFocus: 'Horizontal Push',
      customGoals: [
        makeCustomGoal('ex-bench-press', 'Barbell Bench Press', 'weight', 100, localDateOffset(-21, now))!,
      ].filter(Boolean),
    },
  };

  const fmt: ProgressFormatters = {
    weight: (kg: number) => formatWeight(kg, unit),
    weightPrecise: (kg: number) => formatPreciseWeight(kg, unit),
    length: (cm: number) => (unit === 'lb' ? `${(cm / 2.54).toFixed(1)} in` : `${cm.toFixed(1)} cm`),
  };

  const baseBiometrics = generateSeedBiometrics();
  const biometrics: BiometricLog[] = baseBiometrics.map((b, i) => ({
    ...b,
    source: 'whoop',
    recoveryScore: i === baseBiometrics.length - 1 ? 84 : 62 + ((i * 7) % 29),
    strain: Number((10.4 + ((i * 3) % 6) * 0.7).toFixed(1)),
  }));

  const workouts: WorkoutSession[] = generateSeedWorkouts().map((w, idx) => ({
    ...w,
    whoopStrain: idx % 2 === 0 ? 12.6 : 10.9,
    avgHeartRate: 134,
    maxHeartRate: 168,
  }));

  const activeWorkout = createTodaysActiveWorkout();
  const squatExercise: ExerciseSession = {
    ...activeWorkout.exercises[0],
    orderCode: 'A1',
    tempo: '3110',
    useWarmupProtocol: true,
    sets: activeWorkout.exercises[0].sets.map((s, idx) =>
      idx === 0 || idx === 1
        ? {
            ...s,
            completed: true,
            actualWeightKg: s.targetWeightKg,
            actualReps: s.targetReps,
            actualRir: s.targetRir ?? 2,
          }
        : s
    ),
  };

  const emptyHistoryExercise: ExerciseSession = {
    ...activeWorkout.exercises[2],
    id: 'ds-empty-chart-ex',
    exerciseId: 'ex-overhead-cable-extension-demo',
    name: 'Overhead Cable Tricep Extension',
    orderCode: 'B1',
    sets: [
      { id: 'ds-e-1', setNumber: 1, targetWeightKg: 25, targetReps: 12, targetRir: 2, completed: false, setType: 'working' },
      { id: 'ds-e-2', setNumber: 2, targetWeightKg: 25, targetReps: 12, targetRir: 2, completed: false, setType: 'working' },
    ],
  };

  const latestBio = biometrics[biometrics.length - 1];
  const bodyweightKg = getLatestBodyweightEma(biometrics) || 81.5;

  const greenReadiness = calculateDailyReadiness(latestBio, biometrics.slice(0, -1), 'whoop');
  const amberBio: BiometricLog = {
    ...latestBio,
    recoveryScore: 49,
    hrvRmssd: Math.max(28, Math.round(latestBio.hrvRmssd * 0.72)),
    restingHr: latestBio.restingHr + 5,
    sleepHours: 5.8,
  };
  const amberReadiness: ReadinessEvaluation = {
    ...greenReadiness,
    state: 'Amber Shield',
    score: -1.1,
    readinessScore: 49,
    streakProtected: true,
    reason: 'HRV dipped below your 14-day baseline after 5.8 h sleep. Weights stay held today to lock in recovery.',
  };
  const lowBio: BiometricLog = {
    ...latestBio,
    recoveryScore: 26,
  };
  const lowReadiness: ReadinessEvaluation = {
    ...greenReadiness,
    state: 'Amber Shield',
    score: -1.6,
    readinessScore: 26,
    streakProtected: true,
    reason: 'Overnight recovery is in the red zone (26%). Keep 2–3 reps in reserve or take a rest day.',
  };

  const prescription = prescribeDoubleProgression(
    squatExercise,
    greenReadiness.state,
    workouts,
    bodyweightKg,
    profile.goalPhase
  );
  const quest = calculateSubTierQuest(
    squatExercise.pillar,
    125,
    bodyweightKg,
    squatExercise.sets.find((s) => !s.isWarmup)?.targetWeightKg ?? 92.5,
    8,
    squatExercise.equipment
  );

  const squatInsight = buildExerciseInsight(
    squatExercise,
    workouts,
    greenReadiness.state,
    bodyweightKg,
    12,
    (kg) => fmt.weightPrecise?.(kg) ?? fmt.weight(kg),
    biometrics
  );
  const emptyInsight = buildExerciseInsight(
    emptyHistoryExercise,
    [],
    greenReadiness.state,
    bodyweightKg,
    12,
    (kg) => fmt.weightPrecise?.(kg) ?? fmt.weight(kg),
    biometrics
  );

  const activitiesRecent: ActivityLog[] = [
    {
      id: 'ds-act-1',
      date: localDateOffset(-2, now),
      startedAt: `${localDateOffset(-2, now)}T07:30:00`,
      type: 'run',
      minutes: 34,
      distanceKm: 6.2,
      avgHeartRate: 146,
      source: 'strava',
      externalId: '987654321',
    },
    {
      id: 'ds-act-2',
      date: localDateOffset(-5, now),
      startedAt: `${localDateOffset(-5, now)}T12:15:00`,
      type: 'walk',
      minutes: 28,
      source: 'manual',
    },
  ];

  const weekStripDays = buildWeekStrip({
    workouts,
    nextSession: activeWorkout,
    programType: profile.programType,
    exerciseCatalog: SEED_EXERCISES,
    now: now.getTime(),
  });

  const finishedSample: WorkoutSession = {
    ...workouts[workouts.length - 1],
    date: today,
    completed: true,
    completedAt: now.toISOString(),
    durationMinutes: 46,
    whoopStrain: 13.4,
    avgHeartRate: 138,
    maxHeartRate: 171,
  };
  const finishReport = buildWorkoutFinish({
    profile,
    workouts: workouts.slice(0, -1),
    finished: finishedSample,
    activities: activitiesRecent,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightKg,
    formatWeight: (kg) => fmt.weightPrecise?.(kg) ?? fmt.weight(kg),
    now: now.getTime(),
  });
  const completedSummaries = buildCompletedExerciseSummaries({
    finished: finishedSample,
    workouts: workouts.slice(0, -1),
    bodyweightKg,
    biometrics,
    formatWeight: (kg) => fmt.weightPrecise?.(kg) ?? fmt.weight(kg),
  });

  const movementReport = buildMovementStandards({
    workouts,
    biometrics,
    bodyweightKg,
    gender: profile.gender,
    age: profile.age,
  });

  const weeklyVolume = calculateWeeklyMuscleVolume(workouts, SEED_EXERCISES, activeWorkout, now);
  const kgGraph = buildAthleteKnowledgeGraph(workouts, biometrics, SEED_EXERCISES, profile, weeklyVolume);
  const muscleProgressList = buildMuscleProgress({
    workouts,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    knowledgeGraph: kgGraph,
    bodyweightKg,
    formatLength: fmt.length,
    now: now.getTime(),
    weeks: 8,
  });

  const goals = buildAthleteGoals({
    profile,
    workouts,
    biometrics,
    activities: activitiesRecent,
    bodyweightKg,
    now: now.getTime(),
  });
  const goalRings = buildGoalRings(goals, (kg) => fmt.weightPrecise?.(kg) ?? fmt.weight(kg));
  const goalsSummary = buildGoalsSummary(goals, (kg) => fmt.weightPrecise?.(kg) ?? fmt.weight(kg));
  const goalCardSummaries = buildGoalCardSummaries(goals, goalRings, (kg) => fmt.weightPrecise?.(kg) ?? fmt.weight(kg));
  const personalBests = buildPersonalBests(workouts, bodyweightKg, biometrics);

  const strengthCharts = buildStrengthCharts({
    workouts,
    profile,
    bodyweightKg,
    biometrics,
    fmt,
  });
  const compCharts = buildCompositionCharts({ biometrics, profile, fmt, now });
  const whoopCharts = buildWhoopCharts({ biometrics, workouts });

  const doubleProgPrinciple =
    EXERCISE_SCIENCE_KNOWLEDGE_BASE.find((sp) => sp.id === 'sp-double-progression') ??
    EXERCISE_SCIENCE_KNOWLEDGE_BASE[0];

  const greenRecoveryPct = displayRecoveryScore(greenReadiness, latestBio) ?? 84;
  const coachRichMessages: AssistantChatMessage[] = [
    {
      id: 'ds-coach-welcome',
      sender: 'assistant',
      text: `You are up for **${activeWorkout.name}**. Recovery sits at ${greenRecoveryPct}% — full loads hold cleanly.`,
      timestamp: '09:40',
    },
    {
      id: 'ds-coach-u1',
      sender: 'user',
      text: 'Swap squats for leg press today and note my right knee prefers moderate depth.',
      timestamp: '09:41',
    },
    {
      id: 'ds-coach-a1',
      sender: 'assistant',
      text: 'Swapped Barbell back squat for **Leg press** in today’s session and saved your right-knee depth preference.',
      timestamp: '09:41',
      memorySaved: {
        id: 'ds-mem-knee',
        category: 'preference',
        value: 'Right knee prefers moderate flexion depth on heavy quad patterns',
        createdAt: today,
        source: 'coach',
      },
      actionApplied: {
        type: 'SWAP_EXERCISE',
        summary: 'Swapped Barbell back squat to Leg press',
        toolName: 'swap_exercise',
        mutationStatus: 'success',
      },
      stateDiff: {
        object_type: 'Exercise',
        object_id: squatExercise.id,
        label: 'Exercise swapped',
        previous_state: { display: 'Barbell back squat' },
        new_state: { display: 'Leg press' },
      },
      navigateTarget: 'train',
      navigateLabel: 'View workout',
      undoSnapshot: {
        label: 'Swap Barbell back squat -> Leg press',
        previousWorkout: activeWorkout,
      },
      scientificPrinciplesCited: [doubleProgPrinciple],
    },
    {
      id: 'ds-coach-u2',
      sender: 'user',
      text: 'Actually start my program over from Week 1 Day 1.',
      timestamp: '09:42',
    },
    {
      id: 'ds-coach-a2',
      sender: 'assistant',
      text: 'Confirm before resetting your active program block position.',
      timestamp: '09:42',
      stateDiff: {
        object_type: 'Program',
        object_id: 'muscle_building_6wk',
        label: 'Program position',
        previous_state: { display: 'Workout 9 of 24' },
        new_state: { display: 'Workout 1 of 24' },
      },
      pendingConfirmation: {
        tool_name: 'reset_program',
        args: {},
        title: 'Reset program to Day 1',
        summary: 'Start Muscle Building Plan over at Workout 1.',
        warning: 'Completed workouts stay in History and Progress, while the active block starts at Day 1.',
        confirm_label: 'Reset to Day 1',
        cancel_label: 'Keep progress',
        status: 'pending',
      },
      suggestedActions: [
        { label: 'Why leg press load?', prompt: 'Why did leg press start at this weight?' },
        { label: 'Check knee recovery', prompt: 'How is recovery today?' },
        { label: 'Short on time', prompt: 'I only have 30 minutes today' },
      ],
    },
  ];

  const coachStreamingMessages: AssistantChatMessage[] = [
    {
      id: 'ds-stream-welcome',
      sender: 'assistant',
      text: 'Ready when you are. Ask about today’s loads, swaps, or recovery.',
      timestamp: '09:40',
    },
    {
      id: 'ds-stream-u1',
      sender: 'user',
      text: 'Lower set count on pressing today — short on time.',
      timestamp: '09:43',
    },
  ];

  // Live Knowledge Graph, OOUX ContextEnvelope & Coach Opening Matrix fixtures
  const aiMemories: AthleteMemoryFact[] = [
    {
      id: 'ds-mem-knee',
      category: 'preference',
      value: 'Right knee prefers moderate flexion depth; avoid barbell back squat when fatigued',
      createdAt: today,
      source: 'coach',
      relatedExerciseIds: ['ex-barbell-squat'],
    },
    {
      id: 'ds-mem-shoulder',
      category: 'injury',
      value: 'Right shoulder impingement sensitivity on steep overhead angles',
      createdAt: today,
      source: 'coach',
    },
    {
      id: 'ds-mem-schedule',
      category: 'schedule',
      value: 'Trains 4 days per week with 45 minute weekday cap',
      createdAt: today,
      source: 'coach',
    },
  ];
  const aiProfile: UserProfile = {
    ...profile,
    athleteMemories: aiMemories,
  };
  const activeSessionMidSet: WorkoutSession = {
    ...activeWorkout,
    exercises: [squatExercise, ...activeWorkout.exercises.slice(1)],
  };
  const aiEnvelope = buildContextEnvelope({
    profile: aiProfile,
    activeWorkout: activeSessionMidSet,
    workouts,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: bodyweightKg,
    readinessState: greenReadiness.state,
    weeklyVolume,
    activities: activitiesRecent,
    place: { tab: 'train' },
    routeName: 'train',
    knowledgeGraph: kgGraph,
  });
  const serializedEnvelope = serializeContextEnvelopeForPrompt(aiEnvelope);
  const coachSystemPromptSample = buildCoachSystemPrompt({
    userMessage: 'Should I swap squats today?',
    profile: aiProfile,
    activeWorkout: activeSessionMidSet,
    workouts,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: bodyweightKg,
    readinessState: greenReadiness.state,
    weeklyVolume,
    activities: activitiesRecent,
    place: { tab: 'train' },
  });

  const openingConfigs: Array<{ routeLabel: string; place: CoachPlace; session?: WorkoutSession }> = [
    {
      routeLabel: '/train · Mid-Workout',
      place: { tab: 'train' },
      session: activeSessionMidSet,
    },
    {
      routeLabel: '/program · Block Plan',
      place: { tab: 'program' },
      session: activeWorkout,
    },
    {
      routeLabel: '/progress/standards · Strength Levels',
      place: { tab: 'analytics', detail: 'standards' },
      session: activeWorkout,
    },
    {
      routeLabel: '/progress/whoop · Recovery & Sleep',
      place: { tab: 'analytics', detail: 'whoop' },
      session: activeWorkout,
    },
    {
      routeLabel: `/progress/goals/${goals[0]?.id ?? 'weekly'} · Goal Focus`,
      place: { tab: 'analytics', goalId: goals[0]?.id },
      session: activeWorkout,
    },
  ];
  const openingContexts: Array<{ routeLabel: string; place: CoachPlace; session?: WorkoutSession; opening: CoachOpening }> =
    openingConfigs.map((entry) => ({
      ...entry,
      opening: buildCoachOpening({
        place: entry.place,
        profile: aiProfile,
        activeWorkout: entry.session ?? activeWorkout,
        workouts,
        activities: activitiesRecent,
        biometrics,
        exerciseCatalog: SEED_EXERCISES,
        readinessState: greenReadiness.state,
        bodyweightEmaKg: bodyweightKg,
        now: now.getTime(),
      }),
    }));

  const safetyResponses = {
    urgent: buildSafetyResponse('I feel chest pain and dizziness during warmups', activeSessionMidSet) || '',
    jointPain: buildSafetyResponse('I have sharp knee pain when squatting down', activeSessionMidSet) || '',
  };

  const onboardingNewProfile: UserProfile = {
    ...profile,
    name: 'Athlete',
    onboardingCompleted: false,
    programType: 'starter_6wk',
    goalPhase: 'Lean Bulk',
    activeLocation: 'gym',
    homeEquipment: [],
  };

  const onboardingReturningProfile: UserProfile = {
    ...profile,
    onboardingCompleted: true,
    activeLocation: 'home',
    homeEquipment: ['dumbbells', 'pullup_bar', 'bench'],
  };

  return {
    today,
    profile,
    onboardingNewProfile,
    onboardingReturningProfile,
    fmt,
    biometrics,
    latestBio,
    amberBio,
    lowBio,
    bodyweightKg,
    workouts,
    activeWorkout,
    squatExercise,
    emptyHistoryExercise,
    squatInsight,
    emptyInsight,
    prescription,
    quest,
    greenReadiness,
    amberReadiness,
    lowReadiness,
    activitiesRecent,
    weekStripDays,
    finishReport,
    completedSummaries,
    movementReport,
    weeklyVolume,
    kgGraph,
    muscleProgressSample: muscleProgressList[0],
    goals,
    goalRings,
    goalsSummary,
    goalCardSummaries,
    personalBests,
    strengthCharts,
    compCharts,
    whoopCharts,
    coachRichMessages,
    coachStreamingMessages,
    exerciseCatalog: SEED_EXERCISES,
    aiEnvelope,
    serializedEnvelope,
    coachSystemPromptSample,
    openingContexts,
    safetyResponses,
    oouxSchemas: OOUX_OBJECT_SCHEMAS,
    toolDeclarations: COACH_TOOL_DECLARATIONS,
    copeDomainRelationships: COPE_DOMAIN_RELATIONSHIPS,
    copePhysiologicalRelationships: COPE_PHYSIOLOGICAL_RELATIONSHIPS,
    controlledVocabulary: CONTROLLED_VOCABULARY,
    coreConcepts: CORE_CONCEPTS,
    coreObjectDefinitions: CORE_OBJECT_DEFINITIONS,
    iaProgressTaxonomy: IA_PROGRESS_TAXONOMY,
    pragmaticVisibilityMatrix: PRAGMATIC_VISIBILITY_MATRIX,
  };
}
