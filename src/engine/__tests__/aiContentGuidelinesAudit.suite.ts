/**
 * Suite 79: Cross-Surface AI Content Guidelines Audit
 *
 * Ensures every AI-generated and AI-fallback content surface in Treise strictly adheres to
 * the Content Strategy (`src/engine/contentStrategy.ts`) and Voice/Personalisation guidelines
 * (`src/services/coachPersonalization.ts`):
 * 1. Exercise 2-line briefs (swapped first-session, swapped with history, bodyweight, timed,
 *    Amber Shield, and gym re-entry) clearly explain what is replaced and how target-muscle
 *    growth and saved progression stay intact — never opaque idioms like "standing in for"
 *    or "covering <exercise>".
 * 2. Runtime validators across ALL 6 AI surfaces (Exercise Brief, Program Identity, Workout
 *    Finish, Progress Goals, Body Composition, and AI Coach Chat) reject vague swap idioms,
 *    internal engineering jargon, drifted terminology, surveillance phrasing, and third-person
 *    brand references — and feed actionable retry reasons back to the model.
 * 3. Every deterministic fallback across all 5 non-chat summary surfaces + Continuity Engine
 *    copy passes both `runReadAloudQaGate` and `checkSummaryVoiceGuidelines` with 0 violations.
 * 4. System prompts & serialized context envelopes never leak internal "temporary overlay" or
 *    "(covering ...)" phrasing into model inputs.
 */
import {
  buildExerciseBriefContractPrompt,
  EXERCISE_BRIEF_BLUEPRINT,
  runReadAloudQaGate,
  runRotContentAudit,
} from '../contentStrategy';
import {
  buildContinuityCopy,
  buildSwapWhyThisWorksForExercise,
} from '../continuityEngine';
import { buildAthleteKnowledgeGraph } from '../knowledgeGraph';
import { buildPlanOverview, generate6WeekMuscleBuildingWorkout } from '../muscleBuildingProgram';
import { BiometricLog, ContinuityRationaleKind, ExerciseSession, UserProfile, WorkoutSession } from '../types';
import { NEW_USER_PROFILE, SEED_EXERCISES } from '../../services/seedData';
import { buildExerciseInsight } from '../../services/exerciseInsight';
import {
  acceptExerciseNote,
  buildExerciseNoteFacts,
  checkExerciseNote,
  EXERCISE_NOTE_SYSTEM_PROMPT,
  generateExerciseNote,
} from '../../services/exerciseCoachNote';
import { buildIdentityFacts, checkIdentityMessage } from '../../services/identityMessage';
import { buildWorkoutFinish, checkWorkoutSummary } from '../../services/workoutFinish';
import {
  buildGoalCardSummaries,
  buildGoalRings,
  buildGoalsSummary,
  checkGoalsSummary,
} from '../../services/progressOverview';
import { buildCompositionOverview, checkCompositionInsight } from '../../services/compositionOverview';
import { checkSummaryVoiceGuidelines } from '../../services/coachPersonalization';
import { buildCoachSystemPrompt, processAssistantMessage } from '../../services/aiAssistantService';
import { buildContextEnvelope, serializeContextEnvelopeForPrompt } from '../../services/coachContextEnvelope';
import { buildCoachOpening, CoachPlace } from '../../services/coachContext';
import { answerWeeklySchedule } from '../../services/coachAnswers';
import { buildAthleteGoals, CHOSEN_GOAL_ID, WEEKLY_GOAL_ID } from '../../services/athleteGoals';

type AssertFn = (condition: boolean, message: string) => void;

export async function runAiContentGuidelinesAuditSuite(assert: AssertFn): Promise<void> {
  console.log('\n[79. Cross-Surface AI Content Guidelines Audit]');

  const fmtKg = (kg: number) => `${Math.round(kg * 10) / 10} kg`;
  const now = Date.parse('2026-11-22T10:00:00Z');
  const profile: UserProfile = {
    ...NEW_USER_PROFILE,
    name: 'Alex',
    weightUnit: 'kg',
    gender: 'male',
    goalPhase: 'Lean Bulk',
    activeLocation: 'home',
    activeEnvironmentOverlay: {
      overlayId: 'ov-home-79',
      activeProfileType: 'HOTEL_DUMBBELLS',
      label: 'Hotel Dumbbells (≤30 kg)',
      availableEquipment: ['DUMBBELLS', 'BENCH'],
      maxDumbbellKg: 30,
      scope: 'TODAY_ONLY',
      createdAtEpochMs: now - 3600_000,
      expiresAtEpochMs: now + 12 * 3600_000,
    },
  };

  // Seed 2 historical workouts so both first-ever and experienced swapped lifts are exercised
  const prevDbBenchWorkout: WorkoutSession = {
    id: 'w79-db-1',
    date: '2026-11-12',
    completedAt: '2026-11-12T10:45:00Z',
    name: 'Upper Body A',
    splitDay: 'Upper',
    location: 'home',
    readinessState: 'Normal',
    readinessZScore: 0,
    completed: true,
    durationMinutes: 42,
    exercises: [
      {
        id: 'w79-db-ex-1',
        exerciseId: 'ex-flat-db-press',
        name: 'Flat Dumbbell Press',
        pillar: 'Horizontal Push',
        equipment: 'dumbbell',
        minReps: 8,
        maxReps: 12,
        sets: [
          { id: 's1', setNumber: 1, targetWeightKg: 24, targetReps: 10, targetRir: 2, actualWeightKg: 24, actualReps: 10, actualRir: 2, isWarmup: false, completed: true },
          { id: 's2', setNumber: 2, targetWeightKg: 24, targetReps: 10, targetRir: 2, actualWeightKg: 24, actualReps: 10, actualRir: 2, isWarmup: false, completed: true },
        ],
      },
    ],
  };
  const prevDbBenchWorkout2: WorkoutSession = {
    ...prevDbBenchWorkout,
    id: 'w79-db-2',
    date: '2026-11-17',
    completedAt: '2026-11-17T10:45:00Z',
    exercises: [
      {
        ...prevDbBenchWorkout.exercises[0],
        id: 'w79-db-ex-2',
        sets: [
          { id: 's3', setNumber: 1, targetWeightKg: 26, targetReps: 10, targetRir: 2, actualWeightKg: 26, actualReps: 10, actualRir: 2, isWarmup: false, completed: true },
          { id: 's4', setNumber: 2, targetWeightKg: 26, targetReps: 10, targetRir: 2, actualWeightKg: 26, actualReps: 10, actualRir: 2, isWarmup: false, completed: true },
        ],
      },
    ],
  };
  const workouts = [prevDbBenchWorkout, prevDbBenchWorkout2];
  const biometrics: BiometricLog[] = [
    { date: '2026-08-10', bodyweightKg: 80.2, bodyFatPct: 18.4, fatFreeMassKg: 65.4, hrvRmssd: 64, restingHr: 54, sleepHours: 7.4, steps: 8200, activeZoneMinutes: 25 },
    { date: '2026-11-21', bodyweightKg: 81.4, bodyFatPct: 16.0, fatFreeMassKg: 68.4, hrvRmssd: 68, restingHr: 52, sleepHours: 7.8, steps: 9100, activeZoneMinutes: 30 },
  ];
  const kg = buildAthleteKnowledgeGraph(workouts, biometrics, SEED_EXERCISES, profile, {}, []);

  // -------------------------------------------------------------------------
  // 1. Swapped & Re-Entry Exercise 2-Line Briefs (the exact user examples)
  // -------------------------------------------------------------------------
  const swappedFacePullFirst: ExerciseSession = {
    id: 'ex79-facepull-sub',
    exerciseId: 'ex-rear-delt-fly',
    name: 'Dumbbell Rear Delt Fly',
    pillar: 'Horizontal Pull',
    equipment: 'dumbbell',
    isIsolation: true,
    anchorExerciseId: 'ex-face-pull',
    anchorExerciseName: 'Cable Face Pull',
    continuityRationaleKind: 'ANCHOR_PRIOR',
    minReps: 12,
    maxReps: 15,
    sets: [{ id: 'fp1', setNumber: 1, targetWeightKg: 8, targetReps: 12, targetRir: 2, isWarmup: false, completed: false }],
  };
  const swappedBenchExperienced: ExerciseSession = {
    id: 'ex79-bench-sub',
    exerciseId: 'ex-flat-db-press',
    name: 'Flat Dumbbell Press',
    pillar: 'Horizontal Push',
    equipment: 'dumbbell',
    anchorExerciseId: 'ex-bench-press',
    anchorExerciseName: 'Barbell Bench Press',
    continuityRationaleKind: 'ANCHOR_PRIOR',
    minReps: 8,
    maxReps: 12,
    sets: [{ id: 'bp1', setNumber: 1, targetWeightKg: 26, targetReps: 11, targetRir: 2, isWarmup: false, completed: false }],
  };
  const swappedBwFirst: ExerciseSession = {
    id: 'ex79-bw-sub',
    exerciseId: 'ex-pushup',
    name: 'Push-Ups',
    pillar: 'Horizontal Push',
    equipment: 'bodyweight',
    anchorExerciseId: 'ex-bench-press',
    anchorExerciseName: 'Barbell Bench Press',
    continuityRationaleKind: 'BODYWEIGHT',
    setupLabel: 'Feet elevated (~74% BW)',
    minReps: 12,
    maxReps: 20,
    sets: [{ id: 'pu1', setNumber: 1, targetWeightKg: 0, targetReps: 15, targetRir: 1, isWarmup: false, completed: false }],
  };
  const swappedEffortOnlyFirst: ExerciseSession = {
    id: 'ex79-machine-sub',
    exerciseId: 'ex-machine-chest-press',
    name: 'Machine Chest Press',
    pillar: 'Horizontal Push',
    equipment: 'machine',
    anchorExerciseId: 'ex-bench-press',
    anchorExerciseName: 'Barbell Bench Press',
    continuityRationaleKind: 'EFFORT_ONLY',
    minReps: 8,
    maxReps: 12,
    sets: [{ id: 'mc1', setNumber: 1, targetWeightKg: 0, targetReps: 10, targetRir: 2, calibrationSource: 'EFFORT_ONLY', isWarmup: false, completed: false }],
  };
  const swappedTimedFirst: ExerciseSession = {
    id: 'ex79-timed-sub',
    exerciseId: 'ex-plank',
    name: 'Forearm Plank',
    pillar: 'Squat',
    equipment: 'bodyweight',
    repTargetType: 'duration',
    durationSeconds: 45,
    anchorExerciseId: 'ex-decline-gymball-plank',
    anchorExerciseName: 'Decline Gym Ball Plank',
    minReps: 1,
    maxReps: 1,
    sets: [{ id: 'pl1', setNumber: 1, targetWeightKg: 0, targetReps: 0, targetDurationSeconds: 45, targetRir: 2, isWarmup: false, completed: false }],
  };
  const reentryBench: ExerciseSession = {
    id: 'ex79-reentry',
    exerciseId: 'ex-flat-db-press',
    name: 'Flat Dumbbell Press',
    pillar: 'Horizontal Push',
    equipment: 'dumbbell',
    isBridgeReentry: true,
    minReps: 8,
    maxReps: 12,
    sets: [{ id: 're1', setNumber: 1, targetWeightKg: 26, targetReps: 10, targetRir: 2, isWarmup: false, completed: false }],
  };

  const cases: { ex: ExerciseSession; muscle: string; readiness: 'Normal' | 'Amber Shield'; label: string }[] = [
    { ex: swappedFacePullFirst, muscle: 'Rear shoulders', readiness: 'Normal', label: 'Swapped Face Pull first-ever (Normal)' },
    { ex: swappedFacePullFirst, muscle: 'Rear shoulders', readiness: 'Amber Shield', label: 'Swapped Face Pull first-ever (Amber Shield)' },
    { ex: swappedBenchExperienced, muscle: 'Chest', readiness: 'Normal', label: 'Swapped Bench w/ history (Normal)' },
    { ex: swappedBenchExperienced, muscle: 'Chest', readiness: 'Amber Shield', label: 'Swapped Bench w/ history (Amber Shield)' },
    { ex: swappedBwFirst, muscle: 'Chest', readiness: 'Normal', label: 'Swapped Bodyweight w/ setup first-ever (Normal)' },
    { ex: swappedEffortOnlyFirst, muscle: 'Chest', readiness: 'Normal', label: 'Swapped Effort-Only Machine first-ever (Normal)' },
    { ex: swappedTimedFirst, muscle: 'Core', readiness: 'Normal', label: 'Swapped Timed hold first-ever (Normal)' },
    { ex: reentryBench, muscle: 'Chest', readiness: 'Normal', label: 'Gym re-entry after away block (Normal)' },
    { ex: reentryBench, muscle: 'Chest', readiness: 'Amber Shield', label: 'Gym re-entry after away block (Amber Shield)' },
  ];

  const rotPayloads: { exerciseName: string; summary: string }[] = [];
  for (const c of cases) {
    const insight = buildExerciseInsight(c.ex, workouts, c.readiness, 81.4, 12, fmtKg, biometrics, c.muscle);
    const noteFacts = buildExerciseNoteFacts({
      exercise: c.ex,
      insight,
      workouts,
      readinessState: c.readiness,
      knowledgeGraph: kg,
      muscleLabel: c.muscle,
      formatWeight: fmtKg,
    });
    const qa = runReadAloudQaGate(noteFacts.fallback);
    const voice = checkSummaryVoiceGuidelines(noteFacts.fallback);
    const noteCheck = checkExerciseNote(noteFacts.fallback, noteFacts);
    assert(
      qa.passed &&
        voice === null &&
        noteCheck.problem === undefined &&
        insight.summary === noteFacts.fallback &&
        !/standing in for|covering /i.test(noteFacts.fallback) &&
        !/standing in for|today covers/i.test(noteFacts.facts.join(' ')),
      `${c.label} passes QA/voice/note checks with single-source clarity ("${noteFacts.fallback.replace(/\n/g, ' / ')}")`
    );
    rotPayloads.push({ exerciseName: c.ex.name, summary: noteFacts.fallback });
  }

  // Explicitly verify user's concrete examples & changing session contexts live inside the 2-line summary
  const facePullInsight = buildExerciseInsight(swappedFacePullFirst, workouts, 'Normal', 81.4, 12, fmtKg, biometrics, 'Rear shoulders', 'Lean Bulk');
  const benchSubInsight = buildExerciseInsight(swappedBenchExperienced, workouts, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Lean Bulk');
  const bwSetupInsight = buildExerciseInsight(swappedBwFirst, workouts, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Lean Bulk');
  const effortOnlyInsight = buildExerciseInsight(swappedEffortOnlyFirst, workouts, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Lean Bulk');
  const reentryInsight = buildExerciseInsight(reentryBench, workouts, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Lean Bulk');
  assert(
    facePullInsight.lines[0].includes('Replaces Cable Face Pull') &&
      facePullInsight.lines[0].includes('estimated starting weight') &&
      facePullInsight.lines[1].includes('rear shoulders') &&
      facePullInsight.lines[1].includes('pull progression') &&
      benchSubInsight.lines[0].startsWith('Your strength is rising—estimated max is up +') &&
      benchSubInsight.lines[1].includes('Replacing Barbell Bench Press') &&
      benchSubInsight.lines[1].includes('chest') &&
      benchSubInsight.lines[1].includes('push progression') &&
      bwSetupInsight.lines[0].includes('feet elevated') &&
      !bwSetupInsight.summary.includes('%') &&
      effortOnlyInsight.lines[0].includes('moderate opening weight') &&
      reentryInsight.lines[1].includes('last gym load'),
    'Swapped exercise, leverage setup, calibration, and gym re-entry contexts live cleanly inside the codified 2-line summary rather than varying table headers'
  );

  // -------------------------------------------------------------------------
  // 1b. Codified EXERCISE_BRIEF_BLUEPRINT End-to-End Scenarios
  //     (Line 1 = Overall Progress Against Goals; Line 2 = Today's Action -> Goal Outcome)
  // -------------------------------------------------------------------------
  assert(
    EXERCISE_BRIEF_BLUEPRINT.line1.role === 'Overall Progress Against Goals' &&
      EXERCISE_BRIEF_BLUEPRINT.line2.role.includes('Goal Outcome') &&
      EXERCISE_NOTE_SYSTEM_PROMPT.startsWith(buildExerciseBriefContractPrompt()),
    'EXERCISE_BRIEF_BLUEPRINT is codified in contentStrategy.ts and drives EXERCISE_NOTE_SYSTEM_PROMPT directly'
  );

  // Build Barbell Bench history climbing by ~+19 kg E1RM (75 kg x 6 @ 2 RIR -> 90 kg x 6 @ 2 RIR)
  const benchHist1: WorkoutSession = {
    ...prevDbBenchWorkout,
    id: 'w79-bb-1',
    date: '2026-11-01',
    completedAt: '2026-11-01T10:00:00Z',
    exercises: [
      {
        id: 'bb-ex-1',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 8,
        maxReps: 12,
        sets: [
          { id: 'bb1', setNumber: 1, targetWeightKg: 75, targetReps: 6, targetRir: 2, actualWeightKg: 75, actualReps: 6, actualRir: 2, isWarmup: false, completed: true },
        ],
      },
    ],
  };
  const benchHist2: WorkoutSession = {
    ...prevDbBenchWorkout,
    id: 'w79-bb-2',
    date: '2026-11-18',
    completedAt: '2026-11-18T10:00:00Z',
    exercises: [
      {
        id: 'bb-ex-2',
        exerciseId: 'ex-bench-press',
        name: 'Barbell Bench Press',
        pillar: 'Horizontal Push',
        equipment: 'barbell',
        minReps: 8,
        maxReps: 12,
        sets: [
          { id: 'bb2', setNumber: 1, targetWeightKg: 90, targetReps: 6, targetRir: 2, actualWeightKg: 90, actualReps: 6, actualRir: 2, isWarmup: false, completed: true },
        ],
      },
    ],
  };
  const benchHistory79 = [benchHist1, benchHist2];

  // Scenario A: Keeping same weight for 8–12 reps -> stimulates muscle growth
  const todaySameWtBench: ExerciseSession = {
    ...benchHist2.exercises[0],
    id: 'bb-today-same',
    minReps: 8,
    maxReps: 12,
    sets: [{ id: 't1', setNumber: 1, targetWeightKg: 90, targetReps: 6, targetRir: 2, isWarmup: false, completed: false }],
  };
  const sameWtBulk = buildExerciseInsight(todaySameWtBench, benchHistory79, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Lean Bulk');
  const sameWtCut = buildExerciseInsight(todaySameWtBench, benchHistory79, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Cut / Recomp');
  const sameWtRecomp = buildExerciseInsight(todaySameWtBench, benchHistory79, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Maingain');
  const sameWtFacts = buildExerciseNoteFacts({
    exercise: todaySameWtBench,
    insight: sameWtBulk,
    workouts: benchHistory79,
    readinessState: 'Normal',
    knowledgeGraph: kg,
    muscleLabel: 'Chest',
    goalPhase: 'Lean Bulk',
    formatWeight: fmtKg,
  });
  assert(
    sameWtBulk.lines[0].includes('Your strength is rising—estimated max is up +19 kg over 2 sessions to 114 kg') &&
      sameWtBulk.lines[1].includes('Keeping the same weight for 8–12 reps stimulates muscle growth in your chest') &&
      sameWtCut.lines[1].includes('preserves muscle in your chest') &&
      sameWtRecomp.lines[1].includes('builds lean muscle in your chest') &&
      sameWtBulk.summary === sameWtFacts.fallback &&
      checkExerciseNote(sameWtFacts.fallback, sameWtFacts).problem === undefined &&
      runRotContentAudit([{ exerciseName: todaySameWtBench.name, summary: sameWtBulk.summary }]).passed,
    `Codified Scenario A (same weight for 8–12 reps across Bulk/Cut/Recomp) passes end-to-end ("${sameWtBulk.summary.replace(/\n/g, ' / ')}")`
  );

  // Scenario B: Increasing weight with fewer reps (5–8 strength range) -> builds overall strength
  const todayStrengthBench: ExerciseSession = {
    ...benchHist2.exercises[0],
    id: 'bb-today-strength',
    minReps: 5,
    maxReps: 8,
    sets: [{ id: 't2', setNumber: 1, targetWeightKg: 92.5, targetReps: 5, targetRir: 2, isWarmup: false, completed: false }],
  };
  const strengthInsight = buildExerciseInsight(todayStrengthBench, benchHistory79, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Lean Bulk');
  const strengthFacts = buildExerciseNoteFacts({
    exercise: todayStrengthBench,
    insight: strengthInsight,
    workouts: benchHistory79,
    readinessState: 'Normal',
    knowledgeGraph: kg,
    muscleLabel: 'Chest',
    goalPhase: 'Lean Bulk',
    formatWeight: fmtKg,
  });
  assert(
    strengthInsight.lines[1].includes('Increasing the weight with fewer reps for 5–8 reps builds overall strength') &&
      strengthInsight.summary === strengthFacts.fallback &&
      checkExerciseNote(strengthFacts.fallback, strengthFacts).problem === undefined,
    `Codified Scenario B (heavier weight + fewer reps builds overall strength) passes end-to-end ("${strengthInsight.lines[1]}")`
  );

  // Scenario C: One-off swap backed by real logged Barbell Bench Press progression -> Flat DB Press (no own DB history)
  const oneOffSwapDb: ExerciseSession = {
    id: 'ex79-oneoff-db',
    exerciseId: 'ex-incline-db-press',
    name: 'Incline Dumbbell Press',
    pillar: 'Horizontal Push',
    equipment: 'dumbbell',
    anchorExerciseId: 'ex-bench-press',
    anchorExerciseName: 'Barbell Bench Press',
    continuityRationaleKind: 'ANCHOR_PRIOR',
    minReps: 8,
    maxReps: 12,
    sets: [{ id: 'od1', setNumber: 1, targetWeightKg: 28, targetReps: 10, targetRir: 2, isWeightEstimated: true, calibrationSource: 'ANCHOR_PRIOR', isWarmup: false, completed: false }],
  };
  const oneOffInsight = buildExerciseInsight(oneOffSwapDb, benchHistory79, 'Normal', 81.4, 12, fmtKg, biometrics, 'Chest', 'Lean Bulk');
  const oneOffFacts = buildExerciseNoteFacts({
    exercise: oneOffSwapDb,
    insight: oneOffInsight,
    workouts: benchHistory79,
    readinessState: 'Normal',
    knowledgeGraph: kg,
    muscleLabel: 'Chest',
    goalPhase: 'Lean Bulk',
    formatWeight: fmtKg,
  });
  assert(
    oneOffInsight.lines[0].includes('Your push strength is rising—Barbell Bench Press estimated max is up +19 kg to 114 kg') &&
      oneOffInsight.lines[1].includes("Today's estimated load for 8–12 reps stimulates muscle growth in your chest based on your push progression") &&
      oneOffInsight.summary === oneOffFacts.fallback &&
      checkExerciseNote(oneOffFacts.fallback, oneOffFacts).problem === undefined &&
      runRotContentAudit([{ exerciseName: oneOffSwapDb.name, summary: oneOffInsight.summary }]).passed,
    `Codified Scenario C (one-off swap anchored to real push strength progression) passes end-to-end ("${oneOffInsight.summary.replace(/\n/g, ' / ')}")`
  );

  // Bare KPI label dump ("Estimated max: 114 kg (+19 kg over 2 sessions).") is rejected on live AI rewrites
  const bareKpiReject = checkExerciseNote(
    'Estimated max: 114 kg (+19 kg over 2 sessions).\nKeeping the same weight for 8–12 reps stimulates muscle growth in your chest.',
    sameWtFacts
  );
  assert(
    Boolean(bareKpiReject.problem) && /bare KPI label/i.test(bareKpiReject.problem!),
    'checkExerciseNote rejects bare KPI label dumps in Line 1 in favor of plain-English goal-progress sentences'
  );

  const rotAudit = runRotContentAudit(rotPayloads);
  assert(
    rotAudit.passed,
    `All swapped and re-entry 2-line exercise briefs pass ROT Content Audit (R=${rotAudit.redundant.length}, O=${rotAudit.outdated.length}, T=${rotAudit.trivial.length})`
  );

  // -------------------------------------------------------------------------
  // 2. Runtime Validators Reject Vague Swap Idioms & Jargon Across ALL 6 AI Surfaces
  // -------------------------------------------------------------------------
  const badOutputs = [
    'Standing in for Cable Face Pull—first session sets your starting point.',
    'Covering Barbell Bench Press across 8–12 reps keeps mechanical tension moving.',
    'Switch to Travel mode for bodyweight workouts.',
    'Your knowledge graph and temporary overlay are active.',
    'Matching your pre-travel anchor-lift strength today.',
  ];
  assert(
    badOutputs.every((s) => !runReadAloudQaGate(s).passed),
    'runReadAloudQaGate rejects vague swap idioms ("standing in for", "covering <lift>") and internal jargon across all surfaces'
  );

  const benchSubFacts = buildExerciseNoteFacts({
    exercise: swappedBenchExperienced,
    insight: benchSubInsight,
    workouts,
    readinessState: 'Normal',
    knowledgeGraph: kg,
    muscleLabel: 'Chest',
    formatWeight: fmtKg,
  });
  const badModelCovering = `${benchSubFacts.lines[0]}\nCovering Barbell Bench Press across 8–12 reps keeps mechanical tension moving.`;
  const badModelStandingIn = `Standing in for Cable Face Pull—first session sets your starting point.\nTrains your rear shoulders for 12–15 reps to keep growth moving while your saved progression stays intact.`;
  const facePullFacts = buildExerciseNoteFacts({
    exercise: swappedFacePullFirst,
    insight: facePullInsight,
    workouts,
    readinessState: 'Normal',
    knowledgeGraph: kg,
    muscleLabel: 'Rear shoulders',
    formatWeight: fmtKg,
  });

  const coverReject = checkExerciseNote(badModelCovering, benchSubFacts);
  const standReject = checkExerciseNote(badModelStandingIn, facePullFacts);
  assert(
    Boolean(coverReject.problem) &&
      /covering/i.test(coverReject.problem!) &&
      Boolean(standReject.problem) &&
      /standing in for/i.test(standReject.problem!),
    'checkExerciseNote rejects opaque "covering" and "standing in for" model outputs with actionable retry reasons'
  );

  // Live retry loop: attempt 1 emits bad "Covering ..." phrasing -> retry receives exact reason -> attempt 2 accepted
  let retryPromptSeen = '';
  let attemptCount = 0;
  const mockRetryModel = async (_sys: string, userPrompt: string): Promise<string | null> => {
    attemptCount += 1;
    if (attemptCount === 1) return badModelCovering;
    retryPromptSeen = userPrompt;
    return benchSubFacts.fallback;
  };
  const retriedNote = await generateExerciseNote(benchSubFacts, mockRetryModel as never, 2);
  assert(
    attemptCount === 2 &&
      /covering/i.test(retryPromptSeen) &&
      retriedNote === benchSubFacts.fallback &&
      acceptExerciseNote(retriedNote, benchSubFacts) === benchSubFacts.fallback,
    'generateExerciseNote retries once with explicit swap-clarity feedback and accepts compliant output'
  );

  // Check remaining 4 non-chat summary validators reject internal jargon & vague swap phrasing too
  const genericFacts = {
    key: 'test-79',
    fallback: 'Estimated max is 100 kg across 3 sessions. Next is Upper Body A.',
    facts: ['Estimated max is 100 kg across 3 sessions. Next is Upper Body A.'],
  };
  assert(
    checkIdentityMessage('Your knowledge graph shows 100 kg estimated max across 3 sessions. Next is Upper Body A.', genericFacts).problem !== undefined &&
      checkWorkoutSummary('Flat Dumbbell Press was covering Barbell Bench Press at 100 kg across 3 sessions.', genericFacts).problem !== undefined &&
      checkGoalsSummary('Your anchor-lift strength reached 100 kg across 3 sessions; keep repeating Upper Body A.', genericFacts).problem !== undefined &&
      checkCompositionInsight('Weight and anchor-lift strength held steady at 100 kg across 3 sessions.\nTrack fasted morning weigh-ins.', genericFacts).problem !== undefined,
    'Program Identity, Workout Finish, Progress Goals, and Body Composition validators all enforce the hardened voice/jargon gate'
  );

  // -------------------------------------------------------------------------
  // 3. Continuity Copy & Swap Explanations Pass QA & Voice Gates
  // -------------------------------------------------------------------------
  const kinds: ContinuityRationaleKind[] = [
    'ANCHOR_PRIOR',
    'BODYWEIGHT',
    'EFFORT_ONLY',
    'COARSE_JUMP_EXPANDED',
    'HOME_GYM_REENTRY',
  ];
  for (const kind of kinds) {
    const block = buildContinuityCopy(kind, {
      anchorName: 'Barbell Bench Press',
      anchorWeightKg: 80,
      primaryMuscle: 'Chest',
      maxDumbbellKg: 30,
      coarseJumpPct: 16,
      unit: 'kg',
    });
    const allLines = [block.tier1, ...block.tier2Bullets];
    for (const line of allLines) {
      const qa = runReadAloudQaGate(line);
      const voice = checkSummaryVoiceGuidelines(line);
      assert(
        qa.passed && voice === null && !/\bpre-travel\b|\btravel break\b|\blets Treise\b|^Welcome back/i.test(line),
        `Continuity copy (${kind}) obeys QA & voice guidelines: "${line}"`
      );
    }
  }
  const swapWhyBench = buildSwapWhyThisWorksForExercise({
    exercise: swappedBenchExperienced,
    exerciseCatalog: SEED_EXERCISES,
    unit: 'kg',
  });
  assert(
    Boolean(swapWhyBench) &&
      swapWhyBench!.headline === 'Flat Dumbbell Press (replaces Barbell Bench Press)' &&
      runReadAloudQaGate(`${swapWhyBench!.headline}. ${swapWhyBench!.tier1} ${swapWhyBench!.whyBullets.join(' ')}`).passed,
    'buildSwapWhyThisWorksForExercise uses clear "(replaces ...)" framing and passes QA gate'
  );

  // -------------------------------------------------------------------------
  // 4. All 5 Non-Chat Deterministic Summary Fallbacks Pass QA + Voice Gates
  // -------------------------------------------------------------------------
  const planOverview = buildPlanOverview(workouts);
  const nextSession = generate6WeekMuscleBuildingWorkout(planOverview.nextWorkoutNumber, 81.4);
  const idFacts = buildIdentityFacts({
    plan: planOverview,
    workouts,
    nextSession,
    exerciseCatalog: SEED_EXERCISES,
    knowledgeGraph: kg,
    readinessState: 'Normal',
    now,
  });
  const finish = buildWorkoutFinish({
    finished: prevDbBenchWorkout2,
    workouts: [prevDbBenchWorkout],
    profile,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightKg: 81.4,
    formatWeight: fmtKg,
    now,
  });
  const goals = buildAthleteGoals({ workouts, biometrics, profile, bodyweightKg: 81.4, now });
  const goalsSummary = buildGoalsSummary(goals, fmtKg);
  const goalRings = buildGoalRings(goals, fmtKg);
  const goalCards = buildGoalCardSummaries(goals, goalRings, fmtKg);
  const compOverview = buildCompositionOverview({
    biometrics,
    timeline: '1Y',
    goalPhase: 'Lean Bulk',
    formatWeight: fmtKg,
    formatPreciseWeight: fmtKg,
    today: '2026-11-22',
  });

  const allFallbacks: { name: string; text: string }[] = [
    { name: 'Program Identity', text: idFacts.fallback },
    ...(finish ? [{ name: 'Workout Finish', text: finish.fallback }] : []),
    { name: 'Goals Overview', text: goalsSummary.fallback },
    ...goalCards.map((c) => ({ name: `Goal Card (${c.goalId})`, text: c.fallback })),
    { name: 'Body Composition', text: compOverview.summary.fallback },
  ];
  for (const fb of allFallbacks) {
    const qa = runReadAloudQaGate(fb.text);
    const voice = checkSummaryVoiceGuidelines(fb.text);
    assert(
      qa.passed && voice === null,
      `${fb.name} deterministic fallback passes QA + voice gate ("${fb.text.replace(/\n/g, ' / ')}")`
    );
  }

  // -------------------------------------------------------------------------
  // 5. System Prompts, Context Envelopes & AI Coach Chat Alignment
  // -------------------------------------------------------------------------
  const activeWithSwaps: WorkoutSession = {
    ...nextSession,
    completed: false,
    exercises: [swappedBenchExperienced, swappedFacePullFirst],
  };
  const coachPrompt = buildCoachSystemPrompt({
    userMessage: 'Why am I doing Flat Dumbbell Press today?',
    profile,
    activeWorkout: activeWithSwaps,
    workouts,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 81.4,
    readinessState: 'Normal',
  });
  const envelope = buildContextEnvelope({
    profile,
    activeWorkout: activeWithSwaps,
    workouts,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 81.4,
    readinessState: 'Normal',
    knowledgeGraph: kg,
  });
  const serializedEnv = serializeContextEnvelopeForPrompt(envelope);
  assert(
    EXERCISE_NOTE_SYSTEM_PROMPT.includes('standing in for') &&
      EXERCISE_NOTE_SYSTEM_PROMPT.includes("overall progress against the athlete's goals") &&
      EXERCISE_NOTE_SYSTEM_PROMPT.includes('movement-pattern strength progression') &&
      coachPrompt.includes('standing in for') &&
      coachPrompt.includes('Gym, Home, Bodyweight / No equipment') &&
      !coachPrompt.includes('temporary overlay') &&
      !coachPrompt.includes('(covering ') &&
      !serializedEnv.includes('Active environment overlay:') &&
      !serializedEnv.includes('(covering '),
    'Coach & Exercise prompts enforce goal-progress + swap-clarity rules and never leak "temporary overlay" or "(covering ...)" into model inputs'
  );

  const scheduleReply = answerWeeklySchedule(profile, workouts, []);
  const briefingReply = await processAssistantMessage({
    userMessage: "Give me today's briefing",
    profile,
    activeWorkout: activeWithSwaps,
    workouts,
    biometrics,
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 81.4,
    readinessState: 'Normal',
  });
  assert(
    runReadAloudQaGate(scheduleReply).passed &&
      !scheduleReply.includes('temporary overlay') &&
      runReadAloudQaGate(briefingReply.message.text).passed &&
      briefingReply.message.text.includes('replaces Barbell Bench Press') &&
      !briefingReply.message.text.includes('covering Barbell Bench Press'),
    'AI Coach schedule answer and swapped session briefing pass Read-Aloud QA gate cleanly'
  );

  // -------------------------------------------------------------------------
  // 6. AI Coach Chat Conversational Experience Audit:
  //    Warm Coach Greeting on Open, Contextual Next-Action Hooks & First-Person Coach Voice
  // -------------------------------------------------------------------------
  const fs79 = require('fs');
  const path79 = require('path');
  const allOpeningPlaces: Array<{ label: string; place: CoachPlace; readiness?: 'Normal' | 'Amber Shield'; workout?: WorkoutSession }> = [
    { label: 'Workout ready (Normal)', place: { tab: 'train' }, workout: { ...activeWithSwaps, recoveryOverride: true } },
    { label: 'Workout ready (Amber Shield)', place: { tab: 'train' }, readiness: 'Amber Shield', workout: { ...activeWithSwaps, recoveryOverride: true } },
    {
      label: 'Workout active (in-progress)',
      place: { tab: 'train' },
      workout: {
        ...activeWithSwaps,
        exercises: activeWithSwaps.exercises.map((ex, idx) =>
          idx === 0
            ? { ...ex, sets: ex.sets.map((s) => ({ ...s, completed: true, actualWeightKg: s.targetWeightKg, actualReps: s.targetReps })) }
            : ex
        ),
      },
    },
    { label: 'Workout exercise drill-in', place: { tab: 'train', exerciseId: 'ex-flat-db-press' }, workout: activeWithSwaps },
    { label: 'Program tab', place: { tab: 'program' } },
    { label: 'Progress overview', place: { tab: 'analytics' } },
    { label: 'Progress -> Insights', place: { tab: 'analytics', detail: 'insights' } },
    { label: 'Progress -> Standards', place: { tab: 'analytics', detail: 'standards' } },
    { label: 'Progress -> Composition', place: { tab: 'analytics', detail: 'composition' } },
    { label: 'Progress -> Measurements', place: { tab: 'analytics', detail: 'measurements' } },
    { label: 'Progress -> Weight', place: { tab: 'analytics', detail: 'weight' } },
    { label: 'Progress -> Steps', place: { tab: 'analytics', detail: 'steps' } },
    { label: 'Progress -> Whoop', place: { tab: 'analytics', detail: 'whoop' } },
    { label: 'Progress -> Recent', place: { tab: 'analytics', detail: 'recent' } },
    { label: 'Progress -> Bests', place: { tab: 'analytics', detail: 'bests' } },
    { label: 'Progress -> Lifetime', place: { tab: 'analytics', detail: 'lifetime' } },
    { label: 'Progress -> Widgets', place: { tab: 'analytics', detail: 'widgets' } },
    { label: 'Progress -> Goals settings', place: { tab: 'analytics', detail: 'goals' } },
    { label: 'Goal -> Weekly frequency', place: { tab: 'analytics', goalId: WEEKLY_GOAL_ID } },
    { label: 'Goal -> Chosen goal', place: { tab: 'analytics', goalId: CHOSEN_GOAL_ID } },
  ];

  for (const item of allOpeningPlaces) {
    const opening = buildCoachOpening({
      place: item.place,
      profile,
      activeWorkout: item.workout ?? activeWithSwaps,
      workouts,
      biometrics,
      exerciseCatalog: SEED_EXERCISES,
      readinessState: item.readiness ?? 'Normal',
      bodyweightEmaKg: 81.4,
      now,
    });
    const qa = runReadAloudQaGate(opening.line);
    const hasWarmGreeting = Boolean(opening.greeting && /^(Hey|Nice work|Great work)\b/.test(opening.greeting));
    const hasNextActionQuestion = Boolean(opening.nextActionPrompt && /\?$/.test(opening.nextActionPrompt.trim()));
    const noThirdPersonOrSurveillance =
      !/\bTreise\s+(?:thinks|recommends|suggests|uses|tracks|compares|replaces|makes)\b/i.test(opening.line) &&
      !/\b(?:i\s+noticed|based\s+on\s+your\s+data|according\s+to\s+your\s+profile)\b/i.test(opening.line);
    assert(
      qa.passed &&
        hasWarmGreeting &&
        hasNextActionQuestion &&
        noThirdPersonOrSurveillance &&
        opening.hooks.length >= 2 &&
        opening.hooks.length <= 5,
      `Coach opening (${item.label}) greets the athlete warmly, invites a next action, and surfaces ${opening.hooks.length} contextual hooks ("${opening.line}")`
    );
  }

  // Multi-turn conversational next-action hooks & first-person coach voice checks
  const chatTurnScenarios: Array<{
    label: string;
    userMessage: string;
    place?: CoachPlace;
    readiness?: 'Normal' | 'Amber Shield';
    expectReplyRegex: RegExp;
    expectHookRegex: RegExp;
  }> = [
    {
      label: 'Short on time in workout',
      userMessage: "I'm short on time today",
      place: { tab: 'train' },
      expectReplyRegex: /trim 1 working set/i,
      expectHookRegex: /trim 1 set|25-min express/i,
    },
    {
      label: 'Exercise weight / form question',
      userMessage: 'Why is my Flat Dumbbell Press weight set to this?',
      place: { tab: 'train', exerciseId: 'ex-flat-db-press' },
      expectReplyRegex: /Flat Dumbbell Press/i,
      expectHookRegex: /Log Set 1|How to do|Swap|Warm-up/i,
    },
    {
      label: 'Busy equipment / missing kit today',
      userMessage: "I don't have dumbbells today",
      place: { tab: 'train' },
      expectReplyRegex: /need a swap/i,
      expectHookRegex: /Swap /i,
    },
    {
      label: 'Should I train today on Amber Shield',
      userMessage: 'Should I train today?',
      place: { tab: 'train' },
      readiness: 'Amber Shield',
      expectReplyRegex: /lighter effort|2–3 RIR/i,
      expectHookRegex: /Trim 1 set|Take a rest day|Log 20m active day/i,
    },
    {
      label: 'Weekly muscle volume check',
      userMessage: 'Which muscles need more sets this week?',
      place: { tab: 'analytics', detail: 'insights' },
      expectReplyRegex: /hard sets this week/i,
      expectHookRegex: /Rebalance my program|weakest lift/i,
    },
    {
      label: 'Body composition & recomp check',
      userMessage: 'Why is scale weight flat during body recomposition?',
      place: { tab: 'analytics', detail: 'composition' },
      expectReplyRegex: /I track a 7-day rolling average/i,
      expectHookRegex: /Log today's weight|Log waist|How much protein/i,
    },
    {
      label: 'Greeting / capabilities turn',
      userMessage: 'Hey',
      place: { tab: 'train' },
      expectReplyRegex: /Hey — I'm Treise, your strength coach/i,
      expectHookRegex: /Today workout brief|Log Set 1|Should I push or hold/i,
    },
  ];

  for (const sc of chatTurnScenarios) {
    const res = await processAssistantMessage({
      userMessage: sc.userMessage,
      profile,
      activeWorkout: activeWithSwaps,
      workouts,
      biometrics,
      exerciseCatalog: SEED_EXERCISES,
      bodyweightEmaKg: 81.4,
      readinessState: sc.readiness ?? 'Normal',
      place: sc.place ?? { tab: 'train' },
    });
    const text = res.message.text;
    const hooks = res.message.suggestedActions ?? [];
    const hooksJoined = hooks.map((h) => `${h.label} (${h.prompt})`).join(' | ');
    const qa = runReadAloudQaGate(text);
    const noThirdPerson =
      !/\bTreise\s+(?:thinks|recommends|suggests|uses|tracks|compares|replaces|makes)\b/i.test(text);
    const noSurveillance =
      !/\b(?:i\s+noticed|based\s+on\s+your\s+data|according\s+to\s+your\s+profile)\b/i.test(text);
    assert(
      qa.passed &&
        noThirdPerson &&
        noSurveillance &&
        sc.expectReplyRegex.test(text) &&
        hooks.length >= 2 &&
        sc.expectHookRegex.test(hooksJoined),
      `Chat turn (${sc.label}) speaks in first-person coach voice and surfaces contextual next-action hooks [${hooks.map((h) => h.label).join(', ')}]`
    );
  }

  const chatModalSrc79 = fs79.readFileSync(
    path79.resolve(process.cwd(), 'src/components/assistant/AICoachChatModal.tsx'),
    'utf8'
  );
  assert(
    chatModalSrc79.includes('data-coach-greeting="true"') &&
      chatModalSrc79.includes('data-coach-opening-hooks="true"') &&
      chatModalSrc79.includes('Suggested next actions') &&
      chatModalSrc79.includes('lastCtxMsg'),
    'AICoachChatModal renders the Coach greeting card, in-thread Suggested next actions hooks on open, and cross-tab greeting refresh'
  );
}
