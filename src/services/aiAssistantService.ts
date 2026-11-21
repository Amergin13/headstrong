import { buildMovementStandards, buildStandardsAnswer } from './movementStandards';
import { resolveActiveOverlay } from '../engine/continuityEngine';
import {
  CoachPersonaSpec,
  CoachSurface,
  CoachThreadMemory,
  buildPersonalizationContractPrompt,
  buildVoicePersonaPrompt,
  detectSituationalTone,
  enforceNameUsePolicy,
  isExplicitPermanentMemoryRequest,
  resolveCoachMode,
  resolveContextSliceScope,
  stripFillerOpeners,
  stripReflexiveSignOffs,
  updateThreadMemoryFromTurn,
} from './coachPersonalization';
import { standardsAge } from '../engine/strengthStandards';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import {
  AssistantActionPayload,
  AssistantActionType,
  AssistantChatMessage,
  AthleteMemoryCategory,
  AthleteMemoryFact,
  BiometricLog,
  CoachMutationStatus,
  CoachPendingConfirmation,
  CoachStateDiff,
  CoachSuggestedAction,
  CoachToolName,
  CoachUndoSnapshot,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  ReadinessState,
  ScientificPrinciple,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import {
  AthleteKnowledgeGraph,
  buildAthleteKnowledgeGraph,
  EXERCISE_SCIENCE_KNOWLEDGE_BASE,
  getExerciseBiomechanicalMeta,
  queryDesignSystemComponents,
  queryExerciseScienceKnowledgeBase,
} from '../engine/knowledgeGraph';
import { forgetOnDeviceExchange, getOnDeviceModelStatus, isOnDeviceModelReady, promptOnDeviceModel } from './onDeviceModel';
import {
  canUseMusclePlan,
  isPlanProgram,
  resolveActivePlan,
} from '../engine/trainingPlans';
import { planWorkoutLabel } from '../engine/muscleBuildingProgram';
import { formatPreciseWeight, formatWeight } from '../utils/units';
import { calculateWarmupPrescription } from '../engine/warmup';
import { PROGRESSION_RULES } from '../engine/progressionRules';
import { calculateE1RM, isTimedExercise, usesOneDumbbell, usesTwoDumbbells } from '../engine/e1rm';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { runReadAloudQaGate, VOICE_TONE_MATRIX } from '../engine/contentStrategy';
import { buildExerciseInsight } from './exerciseInsight';
import { spelledNumberNotInFacts } from './factChecks';
import { detectGoalChange } from './coachGoals';
import { detectProgressWidgetChange } from './progressWidgets';
import { buildExerciseNoteFacts } from './exerciseCoachNote';
import { MUSCLE_FRIENDLY_NAMES } from '../engine/recovery';
import { findLastCompletedExerciseSession } from '../engine/progression';
import { ActivityLog, activeDayDates } from '../engine/activeDays';
import type { CoachPlace } from './coachContext';
import { computeTrainingStreak } from '../engine/recovery';
import { calculateSessionTonnage } from '../engine/wci';
import { MUSCLE_TO_GRAPH_KEY } from './sessionReport';
import {
  answerAthleteMemories,
  answerBodyCompositionAndMeasurements,
  answerEverydayQuestion,
  answerExerciseBiomechanics,
  answerExerciseHistory,
  answerGoalsStatus,
  answerLastSessionTonnage,
  answerPlanPosition,
  answerProgramOverrides,
  answerRestTimes,
  answerShouldTrain,
  answerStreak,
  answerSwap,
  answerSwapWithOptions,
  answerWeeklySchedule,
  answerWeeklySets,
  answerWeightChange,
  asksAboutVolume,
  exerciseNamedIn,
  findExerciseNamed,
  planPosition,
} from './coachAnswers';

import { buildContextEnvelope, ContextEnvelope, serializeContextEnvelopeForPrompt } from './coachContextEnvelope';
import { detectCoachInterventions } from './coachInterventions';
import {
  buildSuggestedActions,
  COACH_TOOL_DECLARATIONS,
  CoachToolExecutionContext,
  CoachToolOutcome,
  enforceMutationTruthfulness,
  executeCoachToolCall,
  executeCoachToolCalls,
  executePendingConfirmation,
  formatStateDiffText,
  resolveCatalogExerciseByName,
  resolveProgramSelection,
  resolveWorkoutExerciseByName,
  SupabaseSyncHook,
} from './coachTools';
import {
  forgetLastFlashLiteExchange,
  isFlashLiteReady,
  promptFlashLiteStructured,
  recordFlashLiteExchange,
} from './geminiFlashLite';

export { exerciseNamedIn };

export interface AssistantProcessInput {
  userMessage: string;
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  weeklyVolume?: Record<string, number>;
  /** Logged active days, so plan position and streak match the Program page and header. */
  activities?: ActivityLog[];
  /** Screen / goal where the athlete opened the coach, used to contextualize advice and prompts. */
  place?: CoachPlace;
  /** Current active app route / tab name for working-state grounding. */
  routeName?: 'train' | 'program' | 'analytics';
  /** Ephemeral thread-local memory (style overrides, temporary constraints, name-use counter). Resets on New Chat. */
  threadMemory?: CoachThreadMemory;
  /** Optional custom persona spec layered on top of non-overridable Treise platform voice defaults. */
  persona?: CoachPersonaSpec;
  /** Active UI surface (mobile, chat, sidebar, watch) for consistent cross-surface persona behavior. */
  surface?: CoachSurface;
  /** Optional remote persistence verification hook (Supabase / test harness). */
  supabaseSyncFn?: SupabaseSyncHook;
  /** Streams the on-device model's answer as it is generated. */
  onPartial?: (textSoFar: string) => void;
  /** Reports first-time model download progress (0-1). */
  onDownloadProgress?: (fraction: number) => void;
}

export interface AssistantProcessResult {
  message: AssistantChatMessage;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
  updatedBiometrics?: BiometricLog[];
  updatedActivities?: ActivityLog[];
  actionTaken?: AssistantActionPayload;
  /** Updated thread-local ephemeral memory (never written to persistent profile storage). */
  updatedThreadMemory?: CoachThreadMemory;
}

function actionTypeForOutcome(outcome: CoachToolOutcome): AssistantActionType {
  if (outcome.actionType) return outcome.actionType;
  switch (outcome.toolName) {
    case 'reset_program':
      return 'RESET_PROGRAM';
    case 'modify_program':
    case 'rebalance_program':
      return 'MODIFY_PROGRAM';
    case 'swap_exercise':
      return 'SWAP_EXERCISE';
    case 'adjust_workout_volume':
      return 'ADJUST_WORKOUT_VOLUME';
    case 'modify_workout_exercises':
      return 'ADD_EXERCISE';
    case 'switch_location':
      return 'SWITCH_LOCATION';
    case 'update_home_equipment':
      return 'UPDATE_EQUIPMENT';
    case 'switch_program':
      return 'SWITCH_PROGRAM_SPLIT';
    case 'switch_goal_phase':
      return 'SWITCH_GOAL_PHASE';
    case 'log_rest_day':
      return 'SHIFT_WORKOUT';
    case 'update_goals':
      return 'UPDATE_GOALS';
    case 'update_progress_widgets':
      return 'UPDATE_PROGRESS_WIDGETS';
    case 'log_entry':
      return 'LOG_BIOMETRIC';
    case 'log_workout_set':
      return 'LOG_WORKOUT_SET';
    case 'reorder_workout_exercises':
      return 'REORDER_WORKOUT';
    case 'update_exercise_note':
      return 'UPDATE_EXERCISE_NOTE';
    case 'override_recovery_gate':
      return 'OVERRIDE_RECOVERY';
    case 'delete_athlete_memory':
      return 'DELETE_ATHLETE_MEMORY';
    case 'update_athlete_profile':
      return 'UPDATE_PROFILE';
    default:
      return 'SAVE_ATHLETE_MEMORY';
  }
}

/**
 * Maps home equipment tags to natural user-facing names
 */
const EQUIPMENT_NAMES: Record<HomeEquipmentTag, string> = {
  pullup_bar: 'Pull-Up Bar',
  dumbbells: 'Dumbbells',
  bench: 'Exercise Bench',
  trx: 'TRX Suspension Trainer',
  bands: 'Resistance Bands',
};

function isProtectiveInjuryActionCommand(message: string): {
  isProtective: boolean;
  isForgetResolved: boolean;
} {
  const lower = message.toLowerCase().trim();
  if (URGENT_SYMPTOMS.test(lower)) return { isProtective: false, isForgetResolved: false };
  // Never treat pure advisory questions ("My shoulder hurts, should I stop?") as mutations.
  const isAdvisory =
    /\?\s*$/.test(lower) && !/\b(?:can|could|would|will)\s+you\b/i.test(lower);
  if (isAdvisory) return { isProtective: false, isForgetResolved: false };
  const isForgetResolved =
    /^(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:forget|delete|remove|clear)\b.*\b(?:memory|memories|note|notes|injury|injuries|pain|contraindication|constraint|shoulder|knee|back|elbow|wrist|neck)\b/i.test(
      lower
    );
  if (isForgetResolved) return { isProtective: true, isForgetResolved: true };
  const actionClause = lower.replace(
    /^[^,;.!?]{3,70}(?:,|;|\s+—\s+|\s+-\s+|\s+so\s+)\s*/i,
    ''
  );
  const protectiveVerbRe =
    /^(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:please\s+|i(?:'d|\s+would)?\s+like\s+to\s+|i\s+want\s+to\s+)?(?:swap|replace|substitute|remove|drop|take\s+out|rebalance|fix|adapt|remember(?:\s+that|\s+this)?|save\s+(?:this|to\s+(?:my\s+)?memory)|keep\s+in\s+mind|note\s+that)\b/i;
  const isProtective = protectiveVerbRe.test(lower) || protectiveVerbRe.test(actionClause);
  return { isProtective, isForgetResolved: false };
}

/**
 * Core On-Device AI Assistant Service:
 * Synthesizes athlete intent, queries the Athlete Knowledge Graph, executes state mutations,
 * and formulates direct tactical coaching responses via on-device Prompt API, stateless Flash-Lite, or offline rules.
 */
export async function processAssistantMessage(
  input: AssistantProcessInput
): Promise<AssistantProcessResult> {
  // Safety first: urgent symptoms and pain/injury messages NEVER go to the model.
  // Explicit deterministic protective actions (swapping a painful movement, saving/forgetting an injury constraint)
  // execute deterministically without the LLM and carry the fixed safety guidance when active pain is present.
  const safety = buildSafetyResponse(input.userMessage, input.activeWorkout);
  if (safety) {
    const { isProtective, isForgetResolved } = isProtectiveInjuryActionCommand(input.userMessage);
    if (isProtective) {
      const protectiveResult = await processAssistantMessageCore(input, { suppressModel: true });
      const didDeterministicTool =
        Boolean(protectiveResult.actionTaken) ||
        protectiveResult.message.mutationStatus === 'awaiting_confirmation' ||
        protectiveResult.message.mutationStatus === 'success';
      if (didDeterministicTool) {
        if (!isForgetResolved) {
          protectiveResult.message = {
            ...protectiveResult.message,
            text: `${safety}\n\n${protectiveResult.message.text}`,
          };
        }
        return protectiveResult;
      }
    }
    const envelope = buildContextEnvelope({
      profile: input.profile,
      activeWorkout: input.activeWorkout,
      workouts: input.workouts,
      biometrics: input.biometrics,
      exerciseCatalog: input.exerciseCatalog,
      bodyweightEmaKg: input.bodyweightEmaKg,
      readinessState: input.readinessState,
      weeklyVolume: input.weeklyVolume,
      activities: input.activities,
      place: input.place,
      routeName: input.routeName,
    });
    return {
      message: {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: 'assistant',
        text: safety,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: buildSuggestedActions({
          envelope,
          place: input.place,
          lastUserMessage: input.userMessage,
          isSafetyResponse: true,
        }),
      },
    };
  }
  return processAssistantMessageCore(input);
}

/**
 * Executes a pending destructive-action confirmation card (e.g. Confirm Reset to Day 1) in one tap.
 */
export async function confirmAssistantPendingAction(
  pending: CoachPendingConfirmation,
  context: Omit<AssistantProcessInput, 'userMessage'>
): Promise<AssistantProcessResult> {
  const envelope = buildContextEnvelope({
    profile: context.profile,
    activeWorkout: context.activeWorkout,
    workouts: context.workouts,
    biometrics: context.biometrics,
    exerciseCatalog: context.exerciseCatalog,
    bodyweightEmaKg: context.bodyweightEmaKg,
    readinessState: context.readinessState,
    weeklyVolume: context.weeklyVolume,
    activities: context.activities,
    place: context.place,
    routeName: context.routeName,
  });
  const outcome = await executePendingConfirmation(pending, {
    profile: context.profile,
    activeWorkout: context.activeWorkout,
    workouts: context.workouts,
    biometrics: context.biometrics,
    activities: context.activities,
    exerciseCatalog: context.exerciseCatalog,
    bodyweightEmaKg: context.bodyweightEmaKg,
    readinessState: context.readinessState,
    place: context.place,
    supabaseSyncFn: context.supabaseSyncFn,
  });
  const text = enforceMutationTruthfulness(outcome.summaryText, outcome.mutationStatus);
  const actionTaken: AssistantActionPayload | undefined =
    outcome.mutationStatus === 'success'
      ? {
          type: actionTypeForOutcome(outcome),
          summary: outcome.stateDiff ? `${outcome.stateDiff.label}: ${formatStateDiffText(outcome.stateDiff)}` : text,
          toolName: outcome.toolName,
          mutationStatus: outcome.mutationStatus,
          stateDiff: outcome.stateDiff,
        }
      : undefined;

  return {
    message: {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sender: 'assistant',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionApplied: actionTaken,
      mutationStatus: outcome.mutationStatus,
      stateDiff: outcome.stateDiff,
      memorySaved: outcome.memorySaved,
      undoSnapshot: outcome.undoSnapshot,
      navigateTarget: outcome.navigateTarget,
      navigateLabel: outcome.navigateLabel,
      navigateDetail: outcome.navigateDetail,
      suggestedActions: buildSuggestedActions({
        toolName: outcome.toolName,
        mutationStatus: outcome.mutationStatus,
        envelope,
        place: context.place,
      }),
    },
    updatedProfile: outcome.updatedProfile,
    updatedWorkout: outcome.updatedWorkout,
    updatedBiometrics: outcome.updatedBiometrics,
    updatedActivities: outcome.updatedActivities,
    actionTaken,
  };
}

const URGENT_SYMPTOMS =
  /\b(chest\s*pain|chest\s*tight|pressure\s*in\s*(my\s*)?chest|faint(ed|ing)?|pass(ed)?\s*out|dizz(y|iness)|can'?t\s*breathe|short(ness)?\s*of\s*breath|heart\s*(is\s*)?racing|palpitations?|numb(ness)?\s*(in\s*)?(my\s*)?(arm|face|jaw))\b/i;
const PAIN_WORDS =
  /\b(pain(ful)?|hurts?|hurting|hurt|injur(y|ed|ies)|ach(e|es|ing)|sharp|stabbing|tweak(ed)?|pulled\s+(a|my)|sprain(ed)?|strained|swollen|swelling|numb|tingl(e|ing)|popped|torn)\b/i;

const BODY_PART_EXERCISE_HINTS: { part: RegExp; label: string; matches: (ex: ExerciseSession) => boolean }[] = [
  {
    part: /\bshoulders?\b|\brotator\b/i,
    label: 'shoulder',
    matches: (ex) => ['Horizontal Push', 'Vertical Push'].includes(ex.pillar) || /raise|press|dip|fly/i.test(ex.name),
  },
  { part: /\belbows?\b|\bforearms?\b/i, label: 'elbow', matches: (ex) => /curl|extension|pushdown|dip|press|chin|pull/i.test(ex.name) },
  { part: /\bwrists?\b/i, label: 'wrist', matches: (ex) => /press|curl|push-?up|front squat/i.test(ex.name) },
  { part: /\bknees?\b/i, label: 'knee', matches: (ex) => ex.pillar === 'Squat' || /lunge|leg ext|split squat|sprint/i.test(ex.name) },
  {
    part: /\b(lower\s*)?back\b|\bspine\b|\bhips?\b/i,
    label: 'back',
    matches: (ex) => ex.pillar === 'Hinge' || ex.pillar === 'Squat' || /row|deadlift|rdl|good morning/i.test(ex.name),
  },
  { part: /\bneck\b/i, label: 'neck', matches: (ex) => /behind-the-neck|shrug|upright row|overhead/i.test(ex.name) },
  { part: /\bchest\b|\bpec/i, label: 'chest', matches: (ex) => ex.pillar === 'Horizontal Push' },
];

/**
 * Fixed, conservative replies for pain, injury and warning symptoms. Never generated by a model.
 */
export function buildSafetyResponse(message: string, activeWorkout?: WorkoutSession): string | null {
  if (URGENT_SYMPTOMS.test(message)) {
    return (
      'Stop training now. Chest pain, fainting, dizziness, trouble breathing or a racing heart can be ' +
      'signs of a medical problem. Sit down, and if it doesn\'t settle quickly or feels severe, call your local ' +
      'emergency number. Please get checked by a doctor before your next workout.'
    );
  }
  if (!PAIN_WORDS.test(message)) return null;
  // "Sore" alone (normal muscle soreness) is handled by the regular coach.
  const hint = BODY_PART_EXERCISE_HINTS.find((h) => h.part.test(message));
  const affected = hint && activeWorkout ? activeWorkout.exercises.filter(hint.matches).map((e) => e.name) : [];
  const exerciseLine =
    affected.length > 0
      ? `In today's workout that means ${affected.slice(0, 3).join(', ')}. Tap "Swap exercise" on any of them (or ask me to swap it) to switch to a variation that doesn't hurt, or skip it today.`
      : 'Skip any exercise that causes it, or tap "Swap exercise" (or ask me to swap it) to try a variation that is pain-free.';
  return (
    `Don't train through ${hint ? `${hint.label} ` : ''}pain. Normal muscle burn and next-day soreness are fine, ` +
    'but sharp, pinching or joint pain is a signal to stop that movement.\n\n' +
    `${exerciseLine}\n\n` +
    'If the pain is sharp, lasts more than a few days, or comes with swelling, numbness or weakness, see a doctor ' +
    'or physiotherapist before loading it again. I can\'t diagnose injuries—before you go, note which lift triggered it, ' +
    'the load and rep range from your Treise log, and when it started.'
  );
}

/**
 * The on-device coach's instructions. Short on purpose (phone GPUs read ~30 tokens/s) and stable
 * for a whole chat, so follow-up questions can reuse it. Question-specific facts go in the question.
 */
export function buildCoachSystemPrompt(input: AssistantProcessInput): string {
  const { profile, activeWorkout, workouts, biometrics, exerciseCatalog, bodyweightEmaKg, readinessState, weeklyVolume = {} } = input;
  const kg = buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, weeklyVolume, input.activities ?? []);
  const latestBio = biometrics[biometrics.length - 1];
  const unit = profile.weightUnit || 'kg';
  const exercisesDesc = (activeWorkout?.exercises || [])
    .map((e) => {
      const working = e.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup');
      const def = exerciseCatalog.find((d) => d.id === e.exerciseId);
      const wtKg = working[0]?.targetWeightKg ?? 0;
      const pairSuffix = usesTwoDumbbells(e) && wtKg > 0 ? ' each' : '';
      const loadLabel = wtKg > 0 ? `${formatWeight(wtKg, unit)}${pairSuffix}` : 'bodyweight';
      if (isTimedExercise(e) || (def && isTimedExercise(def))) {
        const secs = working[0]?.targetDurationSeconds ?? def?.defaultDurationSeconds ?? 45;
        return `${e.name} ${working.length} sets aiming for ${secs}s hold @ ${loadLabel}`;
      }
      // Today's own rep targets (what the workout card shows), then the range and structured biomechanics.
      const range = e.minReps === e.maxReps ? '' : ` (range ${e.minReps}-${e.maxReps})`;
      const bio = def ? getExerciseBiomechanicalMeta(def) : null;
      const bioTag = bio
        ? ` [${bio.stability} stability, ${bio.stretchBias} bias, ${bio.fractionalMuscleWeights
            .map((mw) => `${mw.muscle} ${mw.weight}x`)
            .join('/')}]`
        : '';
      return `${e.name} ${working.length} sets aiming for ${working[0]?.targetReps ?? e.minReps} reps${range} @ ${loadLabel}${bioTag}`;
    })
    .join('; ');
  // The muscles today's exercises train, with the same status the exercise cards show.
  const todaysMuscleKeys = [
    ...new Set(
      (activeWorkout?.exercises || [])
        .map((e) => exerciseCatalog.find((d) => d.id === e.exerciseId)?.primaryMuscle)
        .map((m) => (m ? MUSCLE_TO_GRAPH_KEY[m] : undefined))
        .filter((k): k is string => Boolean(k))
    ),
  ];
  const activeMuscles = kg.muscleProfiles.filter(
    (m) => todaysMuscleKeys.includes(m.muscleKey) || m.weeklySets > 0
  );
  const selectedMuscles = activeMuscles.length
    ? activeMuscles
    : [...kg.muscleProfiles].sort((a, b) => a.weeklySets / a.personalizedMav[0] - b.weeklySets / b.personalizedMav[0]).slice(0, 4);
  const musclesDesc = selectedMuscles
    .map((m) => `${m.displayName} ${m.weeklySets} of ${m.personalizedMav[0]}-${m.personalizedMav[1]} (${muscleTargetStatus(m)})`)
    .join(', ');
  const athleteName = profile.name && profile.name !== 'Athlete' ? profile.name.split(' ')[0] : '';
  const goalLabel =
    profile.goalPhase === 'Cut / Recomp' ? 'lose fat, keep muscle' : profile.goalPhase === 'Maingain' ? 'stay lean' : 'build muscle';
  const recovery = readinessState === 'Amber Shield' ? 'low' : readinessState === 'Primed' ? 'high' : 'normal';
  // Bodyweight is only given once the athlete has logged one (never the starting-load placeholder).
  const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const placeFacts: string[] = [];
  if (input.place) {
    if (input.place.exerciseId) {
      const openEx =
        activeWorkout?.exercises.find((e) => e.exerciseId === input.place?.exerciseId || e.id === input.place?.exerciseId) ??
        exerciseCatalog.find((d) => d.id === input.place?.exerciseId);
      placeFacts.push(`Workout → Exercise (${openEx ? openEx.name : input.place.exerciseId})`);
    } else if (input.place.goalId) {
      const openGoal = kg.goals.find((g) => g.id === input.place?.goalId);
      if (openGoal) {
        placeFacts.push(`Progress → Goal (${openGoal.title}: ${openGoal.detail})`);
      } else {
        placeFacts.push(`Progress → Goal (${input.place.goalId})`);
      }
    } else if (input.place.detail) {
      placeFacts.push(`Progress → ${input.place.detail}`);
    } else if (input.place.tab === 'program') {
      placeFacts.push('Program tab');
    } else if (input.place.tab === 'analytics') {
      placeFacts.push('Progress tab');
    } else {
      placeFacts.push('Workout tab');
    }
  }
  const kgFacts: string[] = [];
  const planPos = planPosition(profile, workouts, input.activities ?? []);
  const streakDays = computeTrainingStreak(workouts, Date.now(), activeDayDates(input.activities ?? []));
  const coachMode = resolveCoachMode(input.place, activeWorkout);
  const contextScope = resolveContextSliceScope(input.place, activeWorkout);
  const queryLower = (input.userMessage || '').toLowerCase();
  // Scope Knowledge Graph facts to the active screen/mode unless the athlete explicitly asks about another domain.
  const isFloorSlice = Boolean(input.place) && (contextScope === 'exercise_focus' || contextScope === 'mid_workout');
  const asksSteps = /\b(steps?|walk\w*|cardio|active\s+day)\b/i.test(queryLower);
  const asksComposition = /\b(body\s*fat|composition|waist|tape|measure\w*|lean\s+mass|weight)\b/i.test(queryLower);
  const asksStandards = /\b(standard|level|tier|kilgore|poliquin|imbalance|symmetr|strong|e1rm|1rm|max)\b/i.test(queryLower);
  const asksWidgets = /\b(widget|progress\s+card|pin|hide\s+card)\b/i.test(queryLower);

  kgFacts.push(
    `Plan: ${planPos.plan.name}, week ${planPos.week} of ${planPos.totalWeeks}, Phase ${planPos.phase.phaseNumber} (${planPos.phase.shortName}), ${planPos.overview.completedCount} of ${planPos.total} workouts in current run (${workouts.filter((w) => w.completed).length} workouts saved overall)${streakDays > 0 ? `, ${streakDays}-day streak` : ''}.`
  );
  if ((!isFloorSlice || asksSteps) && (kg.stepsSummary.loggedDays > 0 || kg.stepsSummary.goalTarget)) {
    kgFacts.push(`Steps: ${kg.stepsSummary.summary}`);
  }
  if (kg.whoopSummary.configured) {
    const wp: string[] = [];
    if (kg.whoopSummary.recoveryScore !== undefined) wp.push(`recovery ${Math.round(kg.whoopSummary.recoveryScore)}%`);
    if (kg.whoopSummary.dayStrain !== undefined) wp.push(`day strain ${kg.whoopSummary.dayStrain.toFixed(1)}`);
    if (kg.whoopSummary.workoutStrain !== undefined) wp.push(`workout strain ${kg.whoopSummary.workoutStrain.toFixed(1)}`);
    if (kg.whoopSummary.hrvRmssd !== undefined) wp.push(`HRV ${Math.round(kg.whoopSummary.hrvRmssd)} ms`);
    if (kg.whoopSummary.restingHr !== undefined) wp.push(`resting HR ${Math.round(kg.whoopSummary.restingHr)} bpm`);
    if (wp.length > 0) kgFacts.push(`Whoop telemetry: ${wp.join(', ')}.`);
  }
  const topJoints = [...kg.joints]
    .filter((j) => j.strainScore > 0)
    .sort((a, b) => b.strainScore - a.strainScore)
    .slice(0, 3);
  if (topJoints.length > 0) {
    kgFacts.push(
      `Joint load: ${topJoints.map((j) => `${j.joint} ${j.strainScore}/100 (${j.status})`).join(', ')}; axial load ${kg.systemicAxialLoadScore}%.`
    );
  }
  if (workouts.length > 0 && (!isFloorSlice || asksStandards)) {
    const std = buildMovementStandards({
      workouts,
      biometrics,
      bodyweightKg: bodyweightEmaKg,
      gender: profile.gender,
      age: standardsAge(profile),
    });
    const liftSummary = std.levels
      .filter((l) => l.logged && l.source !== 'none' && l.e1rmKg > 0)
      .map((l) => `${l.name} ${formatWeight(l.e1rmKg, unit)} E1RM (${l.tier}${l.subDivision ? ` ${l.subDivision}` : ''})`)
      .join(', ');
    if (liftSummary) kgFacts.push(`Strength levels: ${liftSummary}.`);
  }
  if (kg.insights.length > 0 && !isFloorSlice) {
    kgFacts.push(
      ...kg.insights.slice(0, 3).map((ins) => `Insight: ${ins.title} — ${ins.narrative}`)
    );
  }
  if (kg.exerciseNotesHistory.length > 0) {
    const todayIds = new Set((activeWorkout?.exercises || []).map((e) => e.exerciseId));
    const focusedExId = input.place?.exerciseId;
    const prioritizedNotes = [...kg.exerciseNotesHistory].sort((a, b) => {
      const aRank = focusedExId && a.exerciseId === focusedExId ? 2 : todayIds.has(a.exerciseId) ? 1 : 0;
      const bRank = focusedExId && b.exerciseId === focusedExId ? 2 : todayIds.has(b.exerciseId) ? 1 : 0;
      return bRank - aRank;
    });
    kgFacts.push(
      ...prioritizedNotes
        .slice(0, 3)
        .map((n) => `Exercise note (${n.exerciseName}, ${n.date}): "${n.note}"`)
    );
  }
  if (!isFloorSlice || asksComposition) {
    const latestTapeEntries = kg.bodyComposition.tapeTrends
      .filter((t) => t.latest !== undefined)
      .slice(0, 4)
      .map((t) =>
        unit === 'lb'
          ? `${t.label.toLowerCase()} ${Math.round((t.latest! / 2.54) * 10) / 10} in`
          : `${t.label.toLowerCase()} ${t.latest} cm`
      );
    const latestBf = kg.bodyComposition.scaleTrends.find((t) => t.id === 'body_fat')?.latest;
    const latestFfm = kg.bodyComposition.scaleTrends.find((t) => t.id === 'fat_free_mass')?.latest;
    if (latestTapeEntries.length > 0 || latestBf !== undefined || latestFfm !== undefined) {
      const bc: string[] = [...latestTapeEntries];
      if (latestBf !== undefined) bc.push(`body fat ${latestBf}%`);
      if (latestFfm !== undefined) bc.push(`lean mass ${formatWeight(latestFfm, unit)}`);
      kgFacts.push(`Body composition: ${bc.join(', ')}.`);
    }
  }
  if ((!isFloorSlice || asksWidgets) && profile.progressWidgets && profile.progressWidgets.length > 0) {
    kgFacts.push(`Pinned Progress widgets: ${profile.progressWidgets.join(', ')}.`);
  }
  if ((!isFloorSlice || asksSteps) && kg.activitySummary.activitiesLast7d > 0) {
    kgFacts.push(`Active days (7d): ${kg.activitySummary.activitiesLast7d} sessions (${kg.activitySummary.activeMinutesLast7d} min).`);
  }

  // Voice from the content strategy: pragmatic and observant, grounded in logged facts, no hype, formatted for mobile chat.
  const athleteAge = standardsAge(profile);
  const homeGearList =
    (profile.homeEquipment || []).length > 0
      ? (profile.homeEquipment || []).map((t) => EQUIPMENT_NAMES[t] || t).join(', ')
      : 'none listed';
  const availablePlanNames = [
    ...(profile.customPlans ?? []).map((p) => `${p.name} (${p.id})`),
    '6-Week Starter Plan (starter_6wk)',
    '4-Day Starter Plan (starter_4day)',
    ...(canUseMusclePlan(profile.email) ? ['6-Week Muscle Building Plan (muscle_building_6wk)'] : []),
  ].join('; ');
  const activePlanResolved = resolveActivePlan(profile);
  const overrideCount = (profile.programOverrides ?? []).filter((o) => o.planId === activePlanResolved.id).length;
  const activeInterventions = detectCoachInterventions({
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume,
    activities: input.activities,
    knowledgeGraph: kg,
    trainingPlan: activePlanResolved,
  });
  if (overrideCount > 0) {
    kgFacts.push(`Active program adaptations: ${overrideCount} custom rule${overrideCount === 1 ? '' : 's'} on ${activePlanResolved.name}.`);
  }
  if (activeInterventions.length > 0) {
    kgFacts.push(
      `Detected program opportunities (offer HITL confirmation with modify_program/rebalance_program when relevant): ${activeInterventions
        .slice(0, 2)
        .map((it) => `${it.title} — ${it.rationale}`)
        .join(' | ')}`
    );
  }
  const contextEnvelope = buildContextEnvelope({
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume,
    activities: input.activities,
    place: input.place,
    routeName: input.routeName,
    knowledgeGraph: kg,
  });
  const effectiveThreadMemory = {
    ...updateThreadMemoryFromTurn(input.threadMemory, input.userMessage || ''),
    // Keep prior activeTopic during prompt construction so detectTopicShift compares prior vs current topic.
    activeTopic: input.threadMemory?.activeTopic,
  };
  const situationTone = detectSituationalTone({
    userMessage: input.userMessage || '',
    mode: coachMode,
    readinessState,
  });
  const voicePersonaContract = buildVoicePersonaPrompt({
    situationTone,
    persona: input.persona,
    surface: input.surface,
  });
  const personalizationContract = buildPersonalizationContractPrompt({
    mode: coachMode,
    scope: contextScope,
    threadMemory: effectiveThreadMemory,
    userMessage: input.userMessage || '',
  });
  const readinessZClause =
    typeof activeWorkout?.readinessZScore === 'number' && Number.isFinite(activeWorkout.readinessZScore) && activeWorkout.readinessZScore !== 0
      ? `, readiness Z ${activeWorkout.readinessZScore >= 0 ? '+' : ''}${activeWorkout.readinessZScore.toFixed(2)}`
      : '';
  const activeOverlay = resolveActiveOverlay(profile.activeEnvironmentOverlay).active;
  const overlayClause = activeOverlay ? ` (temporary overlay: ${activeOverlay.label})` : '';
  return `You are ${VOICE_TONE_MATRIX.steadyVoice.replace(/^The /, 'the ').replace(/\.$/, '')}, speaking directly to ${athleteName || 'the athlete'} using "I" and "you". ${voicePersonaContract} ${personalizationContract} Front-load one direct sentence answering the question with the key figure or outcome first (no greeting, and never repeat visible set tables). Keep each paragraph to 1-2 short sentences, and use concise bold-lead bullets (- **Topic:** detail) for multi-part guidance unless the athlete asked for plain prose. For anything about their plan, weights, sets or progress, use only the facts below. Whenever the athlete asks or implies they want to take an action—logging/editing sets (log_workout_set), reordering exercises (reorder_workout_exercises), saving exercise notes (update_exercise_note), unlocking a recovering session with confirmation (override_recovery_gate), swapping/adding/removing exercises (for today OR permanently across their program via modify_program, including rep-range edits and removing single edits), rebalancing for imbalances/symmetry/stalls/contraindications (rebalance_program), adjusting sets/volume/load, switching location (gym, home, travel) or future week, updating home equipment, switching program, changing goal phase, setting targets/goals, toggling Progress cards, logging bodyweight/body fat/any tape measurement/steps/height/cardio, logging a rest day, resetting their plan, updating profile/units/display toggles (update_athlete_profile), or saving/forgetting athlete memories (save_athlete_memory / delete_athlete_memory)—invoke the matching function tool(s) immediately, even when phrased politely ("Can you...", "Could you..."). Ask clarifying questions only when an essential target cannot be inferred. Never claim a mutation happened unless a tool call succeeded. For general training questions (timing, motivation, habits, technique, recovery, sleep, food), give practical, widely accepted advice in your own words without inventing numbers (avoid ungrounded weights, reps, sets, percentages, minutes, seconds, or hours—say "a short rest" or "a focused session" instead). Never say the plan or the facts don't cover something. Never call a muscle's sets enough unless it is on target. High recovery means today's targets stand. Don't praise effort the facts don't show. Never guess or invent how individual sets or reps went in past workouts. The plan sets weights and raises them itself when every set reaches the top of the range; never tell them to change the weight. No hype, cheerleading or percentages; say why something works in one plain clause.
Athlete: ${hasWeighIn ? `${formatWeight(bodyweightEmaKg, unit)}, ` : ''}${athleteAge ? `age ${athleteAge}, ` : ''}location ${profile.activeLocation === 'travel' ? 'Bodyweight / No equipment' : profile.activeLocation === 'home' ? 'Home' : 'Gym'}${overlayClause}, home gear: ${homeGearList}, goal ${goalLabel}, week ${planPos.week}/${planPos.totalWeeks}, recovery ${recovery}${kg.recoveryEfficiencyScore > 0 ? ` (${kg.recoveryEfficiencyScore}%)` : ''}${readinessZClause}${
    latestBio && latestBio.hrvRmssd > 0 ? `, slept ${latestBio.sleepHours} h` : ''
  }.${placeFacts.length ? `\nViewing: ${placeFacts.join(' ')}.` : ''}${kgFacts.length ? `\n${kgFacts.join('\n')}` : ''}
Available plans: ${availablePlanNames}.
${serializeContextEnvelopeForPrompt(contextEnvelope, { mode: coachMode, scope: contextScope, focusedExerciseId: input.place?.exerciseId })}
Today's plan (not done yet): ${activeWorkout?.name || 'rest'}: ${exercisesDesc || 'nothing planned'}.
Weekly hard sets (done of target): ${musclesDesc || 'none yet'}.`;
}

/**
 * The model is given today's plan but no history, so anything it says about how past sessions went
 * is invented. Questions about history are answered from the logged sessions instead.
 */
/** An answer that calls an exercise by the wrong kit ("lift the dumbbells" for a cable raise). */
export function misnamesEquipment(answer: string, exercises: { name: string; equipment: string }[]): boolean {
  const text = answer.toLowerCase();
  const said = new Set<string>();
  if (/\bdumbbells?\b/.test(text)) said.add('dumbbell');
  if (/\b(barbells?|the bar|a bar)\b/.test(text)) said.add('barbell');
  if (/\bcables?\b/.test(text)) said.add('cable');
  if (/\bmachines?\b/.test(text)) said.add('machine');
  if (!said.size) return false;
  const mentioned = exercises.filter((ex) => exerciseNamedIn(text, ex.name));
  if (!mentioned.length) return false;
  return [...said].some((k) => !mentioned.some((ex) => ex.equipment === k));
}

/** The plan sets every weight (double progression), so the coach never tells the athlete to change it. */
export function changesPlanWeight(answer: string): boolean {
  // Allow explaining how automatic double progression works (e.g. "the plan raises weight once all sets reach the top").
  const scrubbedRule = answer
    .replace(/\b(?:the\s+plan|treise|double\s+progression|it)\s+(?:automatically\s+)?(?:raises?|increases?|lowers?|reduces?|adjusts?|bumps?|drops?)\s+(?:the\s+|your\s+)?(?:weight|load)\b/gi, '')
    .replace(/\bweight\s+(?:goes\s+up|increases?|rises?|drops?|lowers?)\s+(?:automatically|by\s+itself|once|when|if)\b/gi, '');
  if (/\b(adjust\w*|chang\w*|pick|choose|select|use|start with|begin with|go with|find) (a |the |your )?(\w+ )?(weight|load)\b/i.test(scrubbedRule)) return true;
  return /\b(increas\w*|rais\w*|add\w*|bump\w*|lower\w*|reduc\w*|decreas\w*|drop\w*|go up in|go heavier|go lighter)\b[^.!?]{0,20}\b(the |your )?(weight|load|kg)\b|\b(heavier|lighter) weight\b/i.test(scrubbedRule);
}

/** Advice must agree with today's recovery: no "you need more rest" on a good day, no "push hard" on a low one. */
export function contradictsRecovery(answer: string, readinessState: ReadinessState): boolean {
  const scrubbedRest = answer
    .replace(/\brest days? between\b/gi, '')
    .replace(/\brest\s+(?:\d+(?:\s*[-–to]+\s*\d+)?\s*(?:min(?:ute)?s?|sec(?:ond)?s?|s|m)\s+)?between\s+sets\b/gi, '');
  const saysRest = /\b(need(s)? (more )?rest|take (it )?easy|take a rest|skip (today|the workout)|back off|go easy|rest instead|too hard|don'?t push|not push(ing)? (yourself )?(too )?hard|ease off|hold back)\b/i.test(scrubbedRest);
  const saysPush = /\b(push (hard|harder|it)|go heavy|max out|all out)\b/i.test(answer) && !/\bnot\b[^.!?]{0,15}\bpush/i.test(answer);
  if (readinessState === 'Amber Shield') return saysPush;
  return saysRest;
}

/**
 * "Aim for 8–12 reps per set" with no exercise named, when today's exercises have different targets,
 * contradicts the workout card. A rep target has to belong to a named exercise.
 */
export function genericRepTarget(answer: string, exercises: { name: string; minReps: number; maxReps: number }[]): boolean {
  for (const sentence of answer.toLowerCase().split(/(?<=[.!?])\s+/)) {
    const scrubbed = sentence.replace(
      /\b\d+(?:\s*(?:-|–|to|or)\s*\d+)?\s*reps?\s+(?:in\s+reserve|to\s+spare|short(?:\s+of\s+failure)?|left)\b/g,
      ''
    );
    const range = /\b(\d+)\s*(?:-|–|to)\s*(\d+)\s*reps?\b/.exec(scrubbed) || /\b(\d+)\s*reps?\b/.exec(scrubbed);
    if (!range) continue;
    const namesOne = exercises.some((ex) => exerciseNamedIn(sentence, ex.name));
    if (namesOne) continue;
    const lo = Number(range[1]);
    const hi = Number(range[2] ?? range[1]);
    const fitsAll = exercises.every((ex) => lo >= ex.minReps && hi <= ex.maxReps);
    if (!fitsAll) return true;
  }
  return false;
}

/** The plan is 4 sessions a week with recovery between them, so "train every day" contradicts it. */
export function contradictsPlanSchedule(answer: string): boolean {
  return /\b(train\w*|lift\w*|work ?outs?|exercis\w*|gym)\b[^.!?]{0,40}\b(every|each) (single )?day\b|\b(every|each) day\b[^.!?]{0,40}\b(train\w*|lift\w*|work ?outs?)\b|\bdaily (training|workouts?|lifting)\b/i.test(answer);
}

export function claimsPastResults(answer: string): boolean {
  return /\b(you(?:'re| are) new|if you'?re new|new to (the|this)|you(?:'ve| have)? (performed|did|done|completed|managed|reached|missed|failed|lifted|logged|hit)|you did not|you didn'?t (reach|hit|manage|complete)|last (time|session|week)|previous(ly)? (session|workout))\b/i.test(answer);
}

/**
 * Strips exact Knowledge-Graph summary counts (e.g. "completed 4 of 24 workouts", "logged 8,500 steps")
 * before checking for fabricated past-set results, so Gemini Flash can cite real KG telemetry.
 */
function claimsInventedPastResults(answer: string): boolean {
  const scrubbed = answer
    .replace(/\b(?:you(?:'ve| have)\s+)?(?:completed|done|logged|hit)\s+[\d,]+\s+(?:of\s+[\d,]+\s+)?(?:workouts?|sessions?|days?|steps)\b/gi, '')
    .replace(/\b(?:if|when|even if)\s+you(?:'ve| have)?\s+(?:missed|skipped|had|taken)\b/gi, '')
    .replace(/\b(?:last\s+(?:week|7\s+days))\b/gi, '');
  return claimsPastResults(scrubbed);
}

function muscleTargetStatus(m: { weeklySets: number; personalizedMav: [number, number] | number[] }): 'below target' | 'on target' | 'above target' {
  return m.weeklySets < m.personalizedMav[0] ? 'below target' : m.weeklySets > m.personalizedMav[1] ? 'above target' : 'on target';
}

/**
 * Rejects a model answer that says a muscle (or an exercise for it) has enough, a good amount or too
 * much training when the knowledge graph says otherwise.
 */
export function contradictsMuscleTargets(
  answer: string,
  muscles: { names: string[]; status: 'below target' | 'on target' | 'above target' }[]
): boolean {
  const sentences = answer.toLowerCase().split(/(?<=[.!?])\s+/);
  const saysEnough = /\b(good amount|enough|plenty|solid (amount|volume)|on (track|target)|hitting (your|the) target|great volume)\b/;
  const saysTooMuch = /\b(too (much|many)|over (your|the) target|above (your|the) target|back off|cut back)\b/;
  const saysTooLittle = /\b(below|under|short of|behind|not enough|more sets)\b/;
  for (const sentence of sentences) {
    if (/\b(?:good amount of|enough) (?:sleep|protein|calories|food|water|recovery|rest|time)\b/.test(sentence) && !/\bsets?|volume\b/.test(sentence)) {
      continue;
    }
    for (const m of muscles) {
      if (!m.names.some((n) => sentence.includes(n))) continue;
      if (saysEnough.test(sentence) && m.status !== 'on target') return true;
      if (saysTooMuch.test(sentence) && m.status !== 'above target') return true;
      if (saysTooLittle.test(sentence) && !/\bnot (below|behind)\b/.test(sentence) && m.status !== 'below target' && /\bsets?|volume|training\b/.test(sentence)) return true;
    }
  }
  return false;
}

/**
 * Plain-English progress summary from completed workouts: how many sessions, and how each
 * repeated exercise's best working set has changed. Never estimates or invents numbers.
 */
export function buildProgressSummary(workouts: WorkoutSession[], unit: 'kg' | 'lb'): string {
  const completed = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (a.completedAt || a.date).localeCompare(b.completedAt || b.date));
  if (completed.length === 0) {
    return "You haven't finished a workout yet. Once you do, I'll track every lift and show you how it's moving.";
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const lastWeek = completed.filter((w) => new Date(w.completedAt || w.date).getTime() >= weekAgo).length;

  // Best working set per exercise per session, in time order.
  const history = new Map<string, { name: string; sets: { weightKg: number; reps: number }[] }>();
  for (const w of completed) {
    for (const ex of w.exercises) {
      const done = ex.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup');
      if (done.length === 0) continue;
      const best = done.reduce((a, b) => {
        const aw = a.actualWeightKg ?? a.targetWeightKg;
        const bw = b.actualWeightKg ?? b.targetWeightKg;
        return bw > aw || (bw === aw && (b.actualReps ?? b.targetReps) > (a.actualReps ?? a.targetReps)) ? b : a;
      });
      const entry = history.get(ex.exerciseId) || { name: ex.name, sets: [] };
      entry.sets.push({ weightKg: best.actualWeightKg ?? best.targetWeightKg, reps: best.actualReps ?? best.targetReps });
      history.set(ex.exerciseId, entry);
    }
  }

  const changes: string[] = [];
  for (const { name, sets } of history.values()) {
    if (sets.length < 2) continue;
    const first = sets[0];
    const last = sets[sets.length - 1];
    // Bodyweight lifts read "bodyweight" (and "bodyweight + 2.5 kg" once loaded), never "0 kg".
    const load = (kg: number) => (kg > 0 ? formatWeight(kg, unit) : 'bodyweight');
    if (last.weightKg > first.weightKg) {
      changes.push(
        first.weightKg > 0
          ? `${name}: ${load(first.weightKg)} → ${load(last.weightKg)}`
          : `${name}: bodyweight → bodyweight + ${formatWeight(last.weightKg, unit)}`
      );
    } else if (last.weightKg === first.weightKg && last.reps > first.reps) {
      changes.push(`${name}: ${first.reps} → ${last.reps} reps at ${last.weightKg > 0 ? formatWeight(last.weightKg, unit) : 'bodyweight'}`);
    }
  }

  const sessions = `You've finished ${completed.length} workout${completed.length === 1 ? '' : 's'} in total${
    lastWeek > 0 ? ` (${lastWeek} in the last 7 days)` : ''
  }.`;
  if (changes.length > 0) {
    return `${sessions} Lifts that have gone up:\n${changes.slice(0, 4).map((c) => `• ${c}`).join('\n')}\n\nThe Progress tab shows the full trend.`;
  }
  const repeated = [...history.values()].some((h) => h.sets.length >= 2);
  return repeated
    ? `${sessions} Your repeated lifts are holding steady so far. Aim to beat last time by one rep or a small weight jump.`
    : `${sessions} Each exercise has only been done once so far, so there's nothing to compare yet. Your next sessions will show your gains here and on the Progress tab.`;
}

const EQUIPMENT_KEYWORDS: { tag: HomeEquipmentTag; pattern: string; name: string }[] = [
  { tag: 'pullup_bar', pattern: 'pull[\\s-]?up\\s*bar|chin[\\s-]?up\\s*bar', name: 'Pull-Up Bar' },
  { tag: 'dumbbells', pattern: 'dumbbells?|dbs?', name: 'Dumbbells' },
  { tag: 'bench', pattern: 'bench', name: 'Exercise Bench' },
  { tag: 'trx', pattern: 'trx|suspension\\s*trainer|(?:gymnastic\\s*)?rings', name: 'TRX Suspension Trainer' },
  { tag: 'bands', pattern: '(?:resistance\\s*)?bands?', name: 'Resistance Bands' },
];
/** Only these words may sit between the verb and the gear, so "got 8 reps on bench" isn't a purchase. */
const EQUIPMENT_FILLER =
  '(?:\\s+(?:a|an|some|new|the|my|me|myself|our|this|that|adjustable|flat|incline|exercise|weight|lifting|workout|home|pair|set|of|second|spare|old|own))*';
/** "Bench" is also a lift: "got a new bench PR" and "have bench today" are about training, not gear. */
const NOT_EQUIPMENT_AFTER =
  '(?!\\s+(?:press|presses|pressing|row|rows|curl|curls|fly|flies|flyes|squat|squats|raise|raises|extension|extensions|lunge|lunges|rdl|deadlift|deadlifts|pull|pulls|pr|prs|pb|pbs|max|1rm|e1rm|record|best|rep|reps|set|sets|today|tonight|tomorrow|day|session|workout|next)\\b)';
const EQUIPMENT_ADD_VERBS = 'bought|got|have|has|own|new|add|added|purchased|acquired|picked\\s*up|equipped\\s*with|can\\s*use';
const EQUIPMENT_REMOVE_VERBS =
  'remove|removed|delete|deleted|drop|dropped|lost|sold|don[\'’]?t\\s*have|do\\s*not\\s*have|no\\s*longer\\s*(?:have|own|use)|got\\s*rid\\s*of';

/**
 * Extracts all home-gear additions/removals requested ("I got dumbbells and a bench",
 * "Can you add a pull-up bar to my home equipment?"), while ignoring questions and lift names.
 */
function detectEquipmentChanges(
  lowerMsg: string
): { equipment: (typeof EQUIPMENT_KEYWORDS)[number]; action: 'add' | 'remove' }[] {
  const isPoliteGearCommand =
    /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:add|remove|delete|drop|take\s+off)\b/i.test(lowerMsg) &&
    (/\b(?:home\s+)?(?:equipment|gear|setup)\b/i.test(lowerMsg) ||
      (!/\b(set|sets|widget|card|chart|goal)\b/i.test(lowerMsg) &&
        !/(?:to|from|in)\s+(?:today'?s?\s+)?(?:workout|session|routine)\b/i.test(lowerMsg)));
  if (
    !isPoliteGearCommand &&
    (/\?\s*$/.test(lowerMsg) ||
      /^(do|does|did|can|could|should|would|will|what|what['’]?s|whats|which|how|why|when|where|is|are)\b/.test(lowerMsg))
  ) {
    return [];
  }

  const allPattern = EQUIPMENT_KEYWORDS.map((e) => `(?:${e.pattern})`).join('|');
  const results: { equipment: (typeof EQUIPMENT_KEYWORDS)[number]; action: 'add' | 'remove' }[] = [];
  const seenTags = new Set<HomeEquipmentTag>();

  const scanAction = (verbs: string, action: 'add' | 'remove') => {
    const chainRegex = new RegExp(
      `\\b(?:${verbs})${EQUIPMENT_FILLER}\\s+((?:${allPattern})(?:${NOT_EQUIPMENT_AFTER})(?:\\s*(?:,|and|&|\\+)${EQUIPMENT_FILLER}\\s*(?:${allPattern})(?:${NOT_EQUIPMENT_AFTER}))*)`,
      'gi'
    );
    for (const m of lowerMsg.matchAll(chainRegex)) {
      const span = m[1] || '';
      for (const equipment of EQUIPMENT_KEYWORDS) {
        if (seenTags.has(equipment.tag)) continue;
        if (new RegExp(`\\b(?:${equipment.pattern})\\b`, 'i').test(span)) {
          results.push({ equipment, action });
          seenTags.add(equipment.tag);
        }
      }
    }
  };

  scanAction(EQUIPMENT_REMOVE_VERBS, 'remove');
  scanAction(EQUIPMENT_ADD_VERBS, 'add');
  return results;
}

function detectEquipmentChange(
  lowerMsg: string
): { equipment: (typeof EQUIPMENT_KEYWORDS)[number]; action: 'add' | 'remove' } | null {
  return detectEquipmentChanges(lowerMsg)[0] ?? null;
}

/**
 * A small model invents numbers, so a chat answer is only shown if every weight, percentage or larger
 * number in it came from what the model was given. Otherwise the rule-based coach answers.
 */
export function acceptCoachAnswer(answer: string, grounding: string): boolean {
  if (/\b(as an ai|language model)\b/i.test(answer)) return false;
  // A number written as a word ("twelve reps") is held to the same rule as digits; up to three is general talk.
  if (spelledNumberNotInFacts(answer, [grounding, '0 1 2 3'])) return false;
  const known = new Set(grounding.match(/\d+(?:\.\d+)?/g) || []);
  for (const m of answer.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?|%)?/gi)) {
    const value = m[1];
    if (m[2]) {
      // A weight or percentage has to appear as that same figure, not just as any matching number.
      const unit = m[2].toLowerCase().startsWith('kilo') ? 'kg' : m[2].toLowerCase().startsWith('p') ? 'lb' : m[2].toLowerCase().replace(/^lbs$/, 'lb');
      if (!new RegExp(`(^|[^\\d.])${value.replace('.', '\\.')}\\s*${unit === '%' ? '%' : `${unit}s?\\b`}`, 'i').test(grounding)) return false;
    } else if (!known.has(value) && parseFloat(value) > 3) {
      return false;
    }
  }
  // A figure (> 3) that only appears in grounding as a weight (kg/lb) or percentage (%) cannot be repurposed as reps, sets, workouts, days or weeks.
  for (const cm of answer.matchAll(/\b(\d+(?:\.\d+)?)\s+(?:working\s+|hard\s+|planned\s+|daily\s+)?(sets?|reps?|repetitions?|workouts?|sessions?|weeks?|days?|steps?)\b/gi)) {
    const value = cm[1];
    if (parseFloat(value) <= 3) continue;
    const escaped = value.replace('.', '\\.');
    const nonWeightOccurrences = grounding.replace(
      new RegExp(`(?<![\\d.])${escaped}\\s*(?:kg|kilos?|lbs?|pounds?|%)`, 'gi'),
      ''
    );
    if (!new RegExp(`(?<![\\d.])${escaped}(?!\\d|\\.\\d)`).test(nonWeightOccurrences)) {
      return false;
    }
  }
  return true;
}

/** A rejected chat answer is retried only when the first one came back this quickly. */
const RETRY_IF_FASTER_THAN_MS = 6000;

const LIFT_WORDS = ['bench', 'squat', 'deadlift', 'rdl', 'overhead', 'shoulder press', 'pulldown', 'pull-up', 'pull up', 'chin', 'row', 'curl', 'leg press'];

/** The best estimated max logged for the lift named in the message, from the same formula as Progress. */
function buildEstimatedMaxAnswer(
  lowerMsg: string,
  workouts: WorkoutSession[],
  bodyweightKg: number,
  unit: 'kg' | 'lb',
  biometrics?: BiometricLog[],
  activeWorkout?: WorkoutSession,
  exerciseCatalog?: ExerciseDefinition[]
): string {
  const liftWord = LIFT_WORDS.find((word) => lowerMsg.includes(word));
  const namedMatch =
    activeWorkout && exerciseCatalog ? findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog) : null;
  const matchedFullName = namedMatch?.session?.name || namedMatch?.def?.name;
  // Only scope to one exact exerciseId when the athlete named a specific exercise (not a generic word like "squat")
  const explicitSpecificExercise =
    Boolean(matchedFullName && lowerMsg.includes(matchedFullName.toLowerCase())) || !liftWord;
  const namedId = explicitSpecificExercise ? namedMatch?.session?.exerciseId || namedMatch?.def?.id : undefined;
  const lift = explicitSpecificExercise && matchedFullName ? matchedFullName.toLowerCase() : liftWord;
  if (!lift) return 'Which lift do you mean? Ask me for your bench, squat or deadlift, for example.';
  const spelled = lift.replace(' ', '-');
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  let best: { name: string; kg: number; includesBodyweight: boolean; bestReps: number; bestAddedKg: number } | null = null;
  let needsBodyweight = false;
  for (const w of workouts.filter((session) => session.completed)) {
    const sessionBw = emaLookup ? emaLookup(w.date, bodyweightKg) : bodyweightKg;
    for (const ex of w.exercises) {
      const name = ex.name.toLowerCase();
      if (!(namedId && ex.exerciseId === namedId) && !name.includes(lift) && !name.includes(spelled)) continue;
      const isCalisthenic =
        ex.equipment === 'bodyweight' || ex.equipment === 'weighted_bodyweight' || Boolean(ex.isWeightedCalisthenic);
      if (isCalisthenic && sessionBw <= 0) {
        if (ex.sets.some((st) => st.completed && !st.isWarmup && st.setType !== 'warmup')) needsBodyweight = true;
        continue;
      }
      for (const st of ex.sets) {
        if (!st.completed || st.isWarmup || st.setType === 'warmup') continue;
        const added = st.actualWeightKg ?? st.targetWeightKg ?? 0;
        const reps = st.actualReps ?? st.targetReps ?? 0;
        const kg = calculateE1RM(
          added,
          reps,
          st.actualRir ?? st.targetRir ?? 2,
          ex.equipment,
          ex.isRdl,
          ex.isWeightedCalisthenic,
          sessionBw,
          ex.exerciseId,
          ex.pillar,
          ex.name
        );
        if (!best || kg > best.kg) {
          best = { name: ex.name, kg, includesBodyweight: isCalisthenic, bestReps: reps, bestAddedKg: added };
        }
      }
    }
  }
  if (!best && needsBodyweight) {
    return 'Log your bodyweight on Progress first so I can work out a total-load estimated max (bodyweight + added weight) for your bodyweight lifts.';
  }
  if (!best) return `You haven't logged a ${lift} yet, so there's no estimated max to give. Your first session will set your starting point.`;
  if (best.includesBodyweight) {
    const loadDesc = best.bestAddedKg > 0 ? `${formatPreciseWeight(best.bestAddedKg, unit)} added × ${best.bestReps}` : `${best.bestReps} bodyweight reps`;
    return `Your best estimated one-rep max is ${formatPreciseWeight(best.kg, unit)} on ${best.name} (total load: your bodyweight + added weight, from your best set of ${loadDesc}).`;
  }
  return `Your best estimated one-rep max is ${formatPreciseWeight(best.kg, unit)} on ${best.name}. It's worked out from your best logged set, not a tested max.`;
}

/** The athlete's real recovery readings for a sentence, e.g. ", with HRV 58 ms, 7 h sleep"; empty without any. */
function recoveryReadingsClause(log?: BiometricLog): string {
  const readings = [
    log?.hrvRmssd ? `HRV ${log.hrvRmssd} ms` : '',
    log?.sleepHours ? `${log.sleepHours} h sleep` : '',
    log?.restingHr ? `resting heart rate ${log.restingHr} bpm` : '',
  ].filter(Boolean);
  return readings.length ? `, with ${readings.join(', ')}` : '';
}

function matchTargetProgramFromMessage(
  lowerMsg: string,
  profile: UserProfile
): { id: ProgramSplitType; name: string } | null {
  return resolveProgramSelection(lowerMsg, profile);
}

async function processAssistantMessageCore(
  input: AssistantProcessInput,
  opts?: { suppressModel?: boolean }
): Promise<AssistantProcessResult> {
  const {
    userMessage,
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume = {},
  } = input;

  const lowerMsg = userMessage.toLowerCase().trim();

  // Build current Knowledge Graph for deep context
  const kg: AthleteKnowledgeGraph = buildAthleteKnowledgeGraph(
    workouts,
    biometrics,
    exerciseCatalog,
    profile,
    weeklyVolume,
    input.activities ?? []
  );

  const envelope: ContextEnvelope = buildContextEnvelope({
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume,
    activities: input.activities,
    place: input.place,
    routeName: input.routeName,
    knowledgeGraph: kg,
  });
  const toolCtx: CoachToolExecutionContext = {
    profile,
    activeWorkout,
    workouts,
    biometrics,
    activities: input.activities,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    place: input.place,
    supabaseSyncFn: input.supabaseSyncFn,
  };

  let answerText = '';
  let actionTaken: AssistantActionPayload | undefined;
  let updatedProfile: Partial<UserProfile> | undefined;
  let updatedWorkout: WorkoutSession | undefined;
  let updatedBiometrics: BiometricLog[] | undefined;
  let updatedActivities: ActivityLog[] | undefined;
  let mutationStatus: CoachMutationStatus | undefined;
  let stateDiff: CoachStateDiff | undefined;
  let pendingConfirmation: CoachPendingConfirmation | undefined;
  let memorySaved: AthleteMemoryFact | undefined;
  let undoSnapshot: CoachUndoSnapshot | undefined;
  let navigateTarget: 'train' | 'program' | 'analytics' | undefined;
  let navigateLabel: string | undefined;
  let navigateDetail: { detail?: string; goalId?: string; exerciseId?: string } | undefined;
  let toolNameUsed: CoachToolName | undefined;
  let modelSuggestedActions: CoachSuggestedAction[] | undefined;

  const applyToolOutcome = (outcome: CoachToolOutcome) => {
    toolNameUsed = outcome.toolName;
    mutationStatus = outcome.mutationStatus;
    stateDiff = outcome.stateDiff;
    pendingConfirmation = outcome.pendingConfirmation;
    memorySaved = outcome.memorySaved;
    undoSnapshot = outcome.undoSnapshot;
    navigateTarget = outcome.navigateTarget;
    navigateLabel = outcome.navigateLabel;
    navigateDetail = outcome.navigateDetail;
    answerText = enforceMutationTruthfulness(outcome.summaryText, outcome.mutationStatus);
    if (outcome.mutationStatus === 'success') {
      if (outcome.updatedProfile) updatedProfile = outcome.updatedProfile;
      if (outcome.updatedWorkout) updatedWorkout = outcome.updatedWorkout;
      if (outcome.updatedBiometrics) updatedBiometrics = outcome.updatedBiometrics;
      if (outcome.updatedActivities) updatedActivities = outcome.updatedActivities;
      actionTaken = {
        type: actionTypeForOutcome(outcome),
        summary: outcome.stateDiff ? `${outcome.stateDiff.label}: ${formatStateDiffText(outcome.stateDiff)}` : outcome.summaryText,
        toolName: outcome.toolName,
        mutationStatus: outcome.mutationStatus,
        stateDiff: outcome.stateDiff,
      };
    } else if (outcome.mutationStatus === 'awaiting_confirmation') {
      if (outcome.updatedProfile) updatedProfile = outcome.updatedProfile;
      if (outcome.updatedWorkout) updatedWorkout = outcome.updatedWorkout;
      if (outcome.updatedBiometrics) updatedBiometrics = outcome.updatedBiometrics;
      if (outcome.updatedActivities) updatedActivities = outcome.updatedActivities;
    }
  };

  const citations: { label: string; metric: string; value: string }[] = [];
  const scientificPrinciplesCited: ScientificPrinciple[] = [];
  const strengthLevelsAnswer = () =>
    buildStandardsAnswer(
      buildMovementStandards({
        workouts,
        biometrics,
        bodyweightKg: bodyweightEmaKg,
        gender: profile.gender,
        age: standardsAge(profile),
      }),
      biometrics.some((b) => (b.bodyweightKg || 0) > 0)
    );

  // ============================================================================
  // 1. INTENT: UPDATE HOME EQUIPMENT (e.g. "I got a pull up bar", "I bought dumbbells")
  // ============================================================================
  const hasMeasuredBw = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const measuredBodyweightKg = hasMeasuredBw ? bodyweightEmaKg : 0;
  // The exercise card's own two lines (built exactly as the Workout page builds them), so the coach
  // and the card never word the same thing differently.
  const cardLines = (ex: ExerciseSession): [string, string] => {
    const precise = (kgValue: number) => formatPreciseWeight(kgValue, profile.weightUnit || 'kg');
    const def = exerciseCatalog.find((d) => d.id === ex.exerciseId);
    return buildExerciseNoteFacts({
      exercise: ex,
      insight: buildExerciseInsight(ex, workouts, readinessState, measuredBodyweightKg, 12, precise, biometrics),
      workouts,
      readinessState,
      knowledgeGraph: kg,
      primaryMuscle: def?.primaryMuscle,
      muscleLabel: def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined,
      formatWeight: precise,
    }).lines;
  };

  // Everyday questions answered from the athlete's plan and log ("I only have 30 minutes").
  const everydayAnswer = answerEverydayQuestion({
    lowerMsg,
    profile,
    activeWorkout,
    workouts,
    activities: input.activities,
    biometrics,
    exerciseCatalog,
    readinessState,
    bodyweightEmaKg,
    progressSummary: () => buildProgressSummary(workouts, profile.weightUnit || 'kg'),
    strengthLevels: strengthLevelsAnswer,
    weeklySets: (message) => answerWeeklySets(message, kg),
    place: input.place,
    knowledgeGraph: kg,
  });

  const detectedEquipmentChanges = detectEquipmentChanges(lowerMsg);
  const detectedEquipmentChange = detectedEquipmentChanges[0] ?? null;
  // "No dumbbells today" / "busy" / "taken" (at gym OR at home) is about today's session only,
  // never deleting saved home gear. Explicit permanent removals ("I sold my dumbbells",
  // "remove dumbbells from home equipment") still update home equipment.
  const isTemporaryKitMissing =
    /\b(today|right\s+now|at\s+the\s+moment|busy|taken|in\s+use|broken|occupied)\b/.test(lowerMsg) &&
    !/\b(sold|got\s+rid|permanently|from\s+my\s+home)\b/.test(lowerMsg);
  const kitMissingToday =
    (detectedEquipmentChange?.action === 'remove' &&
      ((activeWorkout.location ?? 'gym') === 'gym' || isTemporaryKitMissing) &&
      (/\b(don['’]?t|do not) have\b/.test(lowerMsg) || isTemporaryKitMissing) &&
      !/\b(any ?more|any longer|at home|sold|got rid)\b/.test(lowerMsg)) ||
    (/\bno\s+(?:free\s+)?(barbells?|dumbbells?|dbs?|cables?|machines?|bench|pull[\s-]?up\s*bar|bands?|trx)\s+today\b/i.test(
      lowerMsg
    ) &&
      !/\b(sold|remove|delete)\b/.test(lowerMsg));
  const equipmentChanges = kitMissingToday ? [] : detectedEquipmentChanges;
  const matchedEquip = equipmentChanges[0]?.equipment;

  const isPoliteCommandPrefix = /^(?:can|could|would|will)\s+you\b/i.test(lowerMsg);
  const isAdvisoryQuestion =
    /^(?:what|which|how|why|when|where|who|should\s+i|can\s+i|could\s+i|do\s+i|did\s+i|am\s+i|are\s+my|is\s+my|would\s+you\s+(?:recommend|suggest|advise)|if\s+i)\b/i.test(
      lowerMsg
    ) ||
    (/\?\s*$/.test(lowerMsg) && !isPoliteCommandPrefix);
  const hasActionRequestVerb =
    /\b(swap|replace|substitute|switch|change|adjust|modify|edit|reduce|cut|drop|trim|lower|decrease|increase|shorten|deload|add|remove|delete|reset|restart|remember|forget|log|record|save|schedule|update|set|fix|rebalance|correct|adapt|prioritize|move|put|restore|clear|compensate|even\s+out|bring\s+up|unlock|override|hide|show|use)\b/i.test(
      lowerMsg
    );
  const isExplicitActionIntent = hasActionRequestVerb && !isAdvisoryQuestion;

  // ============================================================================
  // 0. INTENT: CUSTOMISE PROGRESS WIDGETS / CHANGE GOALS / OOUX ACTIONS
  // ============================================================================
  const resetProgramIntent =
    /\b(reset|restart|re-start|start\s+over|go\s+back|back\s+to)\b.*\b(program|plan|cycle|day\s*(?:\d+|one)|workout\s*\d+|week\s*\d+|the\s+beginning|scratch)\b|\b(start|begin)\b.*\b(from\s+(day\s*(?:\d+|one)|workout\s*\d+|week\s*\d+|(the\s+)?(beginning|start|scratch)))\b/i.test(
      lowerMsg
    ) &&
    !/\b(weight|load|barbell|timer|streak|app|data|account|factory|everything)\b/i.test(lowerMsg);
  const isResetQuestionOnly =
    resetProgramIntent &&
    /^(should\s+i|would\s+you\s+(?:recommend|suggest|advise)|do\s+i\s+need\s+to|is\s+it\s+better\s+to|what\s+happens\s+if\s+i)\b/i.test(
      lowerMsg
    );

  const progressWidgetChange = detectProgressWidgetChange(lowerMsg, profile, exerciseCatalog, activeWorkout);
  const goalChange = progressWidgetChange
    ? null
    : detectGoalChange(lowerMsg, profile, activeWorkout, workouts, exerciseCatalog);

  const cleanPromptForCmd = userMessage
    .trim()
    .replace(
      /^[^,;.!?]{3,70}(?:,|;|\s+—\s+|\s+-\s+|\s+so\s+)\s*(?=(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:swap|replace|substitute|remove|drop|take\s+out|remember|forget|rebalance|move|put|add|log|record)\b)/i,
      ''
    )
    .replace(/^(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:please\s+|i(?:'d|\s+would)?\s+like\s+to\s+|i\s+want\s+to\s+|help\s+me\s+)?/i, '')
    .replace(/[?.!\s]+$/, '')
    .trim();
  const cleanLowerForCmd = cleanPromptForCmd.toLowerCase();

  // New OOUX deterministic parsers (memory delete, profile/units/display, recovery override, set logging, reorder, exercise notes)
  const clearAllMemoriesMatch =
    !isAdvisoryQuestion &&
    /\b(?:clear|delete|remove|forget|wipe)\s+(?:all\s+)?(?:my\s+)?(?:saved\s+)?(?:coach(?:ing)?\s+)?(?:memories|memory\s+notes|saved\s+notes)\b/i.test(
      cleanLowerForCmd
    );
  const deleteMemoryMatch =
    !isAdvisoryQuestion && !clearAllMemoriesMatch
      ? /^(?:forget|delete|remove|clear)\s+(?:the\s+|my\s+)?(?:saved\s+)?(?:memory|note|fact)?\s*(?:about|that|regarding|on|for)?\s*(.+)$/i.exec(
          cleanPromptForCmd
        )
      : null;
  const deleteMemoryCandidate = (() => {
    if (!deleteMemoryMatch) return null;
    const rawQ = deleteMemoryMatch[1].trim();
    const isExplicitMemoryPhrase =
      /^(?:forget)\b/i.test(cleanLowerForCmd) ||
      /\b(?:memory|memories|saved\s+note|injury|injuries|pain|contraindication|preference)\b/i.test(cleanLowerForCmd);
    if (!isExplicitMemoryPhrase) return null;
    if (/\b(?:program\s+(?:edit|override|custom|adapt)|widget|card|chart|goal|exercise)\b/i.test(rawQ)) return null;
    return rawQ.replace(/\s+from\s+(?:my\s+)?(?:memory|profile|notes?)\b/gi, '').trim();
  })();

  const profileUpdateCandidate = (() => {
    if (isAdvisoryQuestion) return null;
    // Units: "switch my units to lb", "use kg", "change weights to pounds"
    const unitMatch =
      /\b(?:switch|change|set|use|show|display)\b.*\b(?:units?|weights?|loads?)\b.*\b(kg|kilos?|kilograms?|lb|lbs|pounds?)\b/i.exec(
        cleanLowerForCmd
      ) || /^(?:switch|change|use|set)\s+(?:to\s+)?(kg|kilos?|kilograms?|lb|lbs|pounds?)\b/i.exec(cleanLowerForCmd);
    if (unitMatch && !/\b(?:goal|log|record|weigh|bench|squat|deadlift|press|curl|row)\b/i.test(cleanLowerForCmd)) {
      const u = unitMatch[1].startsWith('lb') || unitMatch[1].startsWith('pound') ? 'lb' : 'kg';
      return { weight_unit: u as 'kg' | 'lb' };
    }
    // Age: "set my age to 34", "update age to 42", "I'm 42 years old"
    const ageMatch =
      /\b(?:set|update|change|log|record)\s+(?:my\s+)?age\s*(?:to|as|at|:)?\s*(\d{2,3})\b/i.exec(cleanLowerForCmd);
    if (ageMatch) {
      return { age: parseInt(ageMatch[1], 10) };
    }
    // Gender / Strength standard category
    const genderMatch =
      /\b(?:set|switch|change|update)\s+(?:my\s+)?(?:strength\s+standard(?:s)?\s+category|standard(?:s)?\s+category|gender|sex)\s*(?:to|as)?\s*(male|female|men|women)\b/i.exec(
        cleanLowerForCmd
      );
    if (genderMatch) {
      const g = /^f|^w/i.test(genderMatch[1]) ? 'female' : 'male';
      return { gender: g as 'male' | 'female' };
    }
    // Experience level
    const expMatch =
      /\b(?:set|switch|change|update)\s+(?:my\s+)?(?:training\s+)?experience(?:\s+level)?\s*(?:to|as)?\s*(new|beginner|intermediate|experienced|advanced)\b/i.exec(
        cleanLowerForCmd
      );
    if (expMatch) {
      const rawLvl = expMatch[1].toLowerCase();
      const lvl =
        rawLvl === 'advanced' ? 'experienced' : rawLvl === 'beginner' ? 'new' : rawLvl;
      return { experience_level: lvl as 'new' | 'intermediate' | 'experienced' };
    }
    // Workout screen display toggles (only when NOT targeting Progress page widgets)
    const displayToggleMatch =
      !progressWidgetChange &&
      /\b(hide|show|turn\s+off|turn\s+on|disable|enable)\s+(?:the\s+|my\s+)?(exercise\s+charts?|exercise\s+summar(?:y|ies)|recovery\s+card|session\s+card|program\s+card|steps?\s+card)(?:\s+on\s+(?:the\s+)?workout(?:\s+(?:tab|screen|page))?)?$/i.exec(
        cleanLowerForCmd
      );
    if (displayToggleMatch) {
      const enabled = /^(?:show|turn\s+on|enable)/i.test(displayToggleMatch[1]);
      const rawCard = displayToggleMatch[2].toLowerCase();
      const setting = rawCard.includes('chart')
        ? 'showExerciseCharts'
        : rawCard.includes('summar')
          ? 'showExerciseSummaries'
          : rawCard.includes('recovery')
            ? 'showRecoveryCard'
            : rawCard.includes('session')
              ? 'showSessionCard'
              : rawCard.includes('program')
                ? 'showProgramCard'
                : 'showStepsCard';
      return {
        display_setting: setting as
          | 'showExerciseCharts'
          | 'showExerciseSummaries'
          | 'showRecoveryCard'
          | 'showSessionCard'
          | 'showProgramCard'
          | 'showStepsCard',
        display_enabled: enabled,
      };
    }
    return null;
  })();

  const overrideRecoveryIntent =
    !isAdvisoryQuestion &&
    /\b(train\s+anyway|override\s+(?:the\s+)?recovery(?:\s+gate)?|unlock\s+(?:today'?s?\s+)?(?:workout|session)|let\s+me\s+train\s+today)\b/i.test(
      cleanLowerForCmd
    );

  const exerciseNoteCandidate = (() => {
    if (isAdvisoryQuestion) return null;
    const clearM = /^(?:clear|remove|delete)\s+(?:the\s+|my\s+)?(?:exercise\s+|session\s+)?note\s+(?:on|for|from)\s+(.+)$/i.exec(
      cleanPromptForCmd
    );
    if (clearM) {
      return { exercise_name: clearM[1].trim(), mode: 'clear' as const };
    }
    const setM =
      /^(?:add|save|set|update|write)?\s*(?:a\s+|an\s+)?(?:session\s+|exercise\s+)?note\s+(?:on|for|to)\s+(.+?)(?:\s*[:\-–]\s*|\s+saying\s+|\s+that\s+)(.+)$/i.exec(
        cleanPromptForCmd
      );
    if (setM) {
      return {
        exercise_name: setM[1].trim(),
        note: setM[2].trim(),
        mode: /^add\b/i.test(cleanLowerForCmd) ? ('append' as const) : ('set' as const),
      };
    }
    return null;
  })();

  const logWorkoutSetCandidate = (() => {
    if (isAdvisoryQuestion) return null;
    if (
      !/^(?:log|record|complete|finish|mark|update|edit)\b/i.test(cleanLowerForCmd) ||
      /\b(body\s*weight|body\s*fat|waist|neck|shoulder|chest|abdomen|hip|bicep|thigh|calf|steps?|height|rest\s*day|active\s*day|walk|run|ride|bike|cycle|swim|hike|yoga|cardio)\b/i.test(
        cleanLowerForCmd
      )
    ) {
      return null;
    }
    const setNumM = /\bset\s*#?\s*(\d+)\b/i.exec(cleanPromptForCmd);
    const rirM = /@?\s*(\d+)\s*rir\b/i.exec(cleanPromptForCmd);
    const lrM = /\b(\d+)\s*(?:reps?\s*)?left\s*(?:,|and|\/)?\s*(\d+)\s*(?:reps?\s*)?right\b/i.exec(cleanPromptForCmd) ||
      /\bl\s*(\d+)\s*\/\s*r\s*(\d+)\b/i.exec(cleanPromptForCmd);
    const durM = /\b(\d+)\s*(?:s|sec|secs|seconds?)\b/i.exec(cleanPromptForCmd);
    const wtRepsM =
      /(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)?\s*(?:x|×|for)\s*(\d+)\s*(?:reps?)?\b/i.exec(cleanPromptForCmd);
    const repsOnlyM = !wtRepsM && !lrM ? /\b(\d+)\s*reps?\b/i.exec(cleanPromptForCmd) : null;
    const wtOnlyM = !wtRepsM ? /(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)\b/i.exec(cleanPromptForCmd) : null;

    if (!wtRepsM && !lrM && !durM && !repsOnlyM && !setNumM) return null;

    const exFromOn = /\b(?:on|for)\s+([a-z0-9\s-]{3,50})$/i.exec(cleanPromptForCmd)?.[1]?.trim();
    const matchedEx =
      (exFromOn ? resolveWorkoutExerciseByName(exFromOn, activeWorkout, exerciseCatalog) : undefined) ??
      findExerciseNamed(cleanLowerForCmd, activeWorkout, exerciseCatalog)?.session ??
      (input.place?.exerciseId && /\b(this\s+(?:exercise|lift|movement)|it|next\s+set|set\s*\d+)\b/i.test(cleanLowerForCmd)
        ? activeWorkout.exercises.find(
            (e) => e.exerciseId === input.place?.exerciseId || e.id === input.place?.exerciseId
          )
        : undefined);
    if (!matchedEx) return null;

    const rawUnit = (wtRepsM?.[2] || wtOnlyM?.[2] || '').toLowerCase();
    const unitArg = rawUnit.startsWith('lb') || rawUnit.startsWith('pound')
      ? ('lb' as const)
      : rawUnit.startsWith('kg') || rawUnit.startsWith('kilo')
        ? ('kg' as const)
        : undefined;

    return {
      exercise_name: matchedEx.name,
      ...(setNumM ? { set_number: parseInt(setNumM[1], 10) } : {}),
      ...(wtRepsM ? { weight: parseFloat(wtRepsM[1]), reps: parseInt(wtRepsM[3], 10) } : {}),
      ...(!wtRepsM && wtOnlyM ? { weight: parseFloat(wtOnlyM[1]) } : {}),
      ...(!wtRepsM && repsOnlyM ? { reps: parseInt(repsOnlyM[1], 10) } : {}),
      ...(lrM ? { reps_left: parseInt(lrM[1], 10), reps_right: parseInt(lrM[2], 10) } : {}),
      ...(durM ? { duration_seconds: parseInt(durM[1], 10) } : {}),
      ...(rirM ? { rir: parseInt(rirM[1], 10) } : {}),
      ...(unitArg ? { unit: unitArg } : {}),
    };
  })();

  const twoSidedSwapMatch =
    !isAdvisoryQuestion
      ? /^(?:swap|replace|substitute|switch|change)\s+(?:out\s+)?(.+?)\s+(?:with|for|to|instead\s+of|->|→)\s+(.+)$/i.exec(
          cleanPromptForCmd
        )
      : null;
  const twoSidedSwapCandidate = (() => {
    if (!twoSidedSwapMatch) return null;
    const isGenericSwitch = /^(?:switch|change)\b/i.test(cleanLowerForCmd);
    if (
      isGenericSwitch &&
      /\b(goal|goals|phase|program|plan|split|location|home|gym|travel|bodyweight|bulk|cut|maingain|week|widget|widgets|chart|card|progress|units?|kg|lb|pounds?|kilos?|age|gender|experience|rep\s*range)\b/i.test(
        cleanLowerForCmd
      )
    ) {
      return null;
    }
    const oldPart = twoSidedSwapMatch[1].replace(/\s+(?:in\s+today'?s?\s+workout|today)\b/gi, '').trim();
    const newPart = twoSidedSwapMatch[2].replace(/\s+(?:because|since|due\s+to)\s+.*$/i, '').trim();
    if (!oldPart || !newPart) return null;
    if (isGenericSwitch && !findExerciseNamed(oldPart.toLowerCase(), activeWorkout, exerciseCatalog)?.session) {
      return null;
    }
    return { oldPart, newPart };
  })();

  const oneSidedSwapMatch =
    !isAdvisoryQuestion && !twoSidedSwapCandidate
      ? /^(?:swap|replace|substitute)(?:\s+out)?\s+(.+)$/i.exec(cleanPromptForCmd)
      : null;
  const oneSidedSwapExercise = (() => {
    if (!oneSidedSwapMatch) return null;
    const candidate = oneSidedSwapMatch[1]
      .replace(/\s+(?:in\s+today'?s?\s+workout|today|please)\b/gi, '')
      .replace(/\s+(?:because|since|due\s+to)\s+.*$/i, '')
      .trim();
    if (!candidate || /^(?:an?\s+exercise|exercises?|something|this|that|it|one)$/i.test(candidate)) return null;
    return findExerciseNamed(candidate.toLowerCase(), activeWorkout, exerciseCatalog)?.session ?? null;
  })();

  // If "Add 4 sets of Face Pulls" names a catalog exercise NOT in today's workout, treat it as modify_workout_exercises(add).
  const addSetsOfNewExerciseMatch =
    !isAdvisoryQuestion
      ? /^(?:add|include)\s+(\d+)\s+(?:working\s+)?sets?\s+(?:of\s+)(.+)$/i.exec(cleanPromptForCmd)
      : null;
  const addSetsOfNewExerciseCandidate = (() => {
    if (!addSetsOfNewExerciseMatch) return null;
    const setsCount = parseInt(addSetsOfNewExerciseMatch[1], 10);
    const cleanedName = addSetsOfNewExerciseMatch[2]
      .replace(/\b(?:to|into|in)\s+(?:today'?s?\s+)?(?:workout|session|routine|plan)\b/gi, '')
      .trim();
    const def = resolveCatalogExerciseByName(cleanedName, exerciseCatalog, activeWorkout);
    if (!def) return null;
    if (activeWorkout.exercises.some((e) => e.exerciseId === def.id)) return null;
    return { action: 'add' as const, exerciseName: def.name, setsCount };
  })();

  const hasVolumeVerbTarget =
    !addSetsOfNewExerciseCandidate &&
    (/\b(?:reduce|cut|drop|trim|lower|decrease|increase|add)\s+(?:my\s+|today'?s?\s+)?(?:(?:\d+|a|an|more|extra|another)\s+)?(?:working\s+)?(?:sets?|volume)\b/i.test(
      cleanLowerForCmd
    ) ||
      /\b(?:reduce|cut|drop|trim|lower|decrease|increase)\b[^.?!]*\b(?:working\s+)?(?:sets?|volume)\b(?:\s+(?:on|for|from|in)\b)?/i.test(
        cleanLowerForCmd
      ) ||
      /\bset\s+.+\s+to\s+\d+\s+(?:working\s+)?sets?\b/i.test(cleanLowerForCmd) ||
      /\bdeload\s+(?:today'?s?\s+)?(?:workout|weights|loads|session)\b|\b(?:shorten|trim)\s+(?:today'?s?\s+)?(?:workout|session)\b|\bmake\s+(?:today'?s?\s+)?(?:workout|session)\s+shorter\b/i.test(
        cleanLowerForCmd
      ) ||
      /\bshorten\s+(?:today'?s?\s+)?(?:workout|session)\b|\badjust\s+(?:today'?s?\s+)?(?:workout|session)\s+to\s+(?:fit|be\s+shorter)\b/i.test(
        lowerMsg
      ));
  const volumeCmdMatch = !isAdvisoryQuestion && hasVolumeVerbTarget;

  const modifyExerciseMatch =
    !isAdvisoryQuestion && !volumeCmdMatch && !progressWidgetChange && !goalChange && !addSetsOfNewExerciseCandidate && !deleteMemoryCandidate
      ? /^(add|include|append|insert|remove|delete|drop|take\s+out)\s+(.+)$/i.exec(cleanPromptForCmd)
      : null;
  const modifyExerciseCandidate =
    addSetsOfNewExerciseCandidate ??
    (() => {
      if (!modifyExerciseMatch) return null;
      const verb = modifyExerciseMatch[1].toLowerCase();
      const action: 'add' | 'remove' =
        verb.startsWith('add') || verb.startsWith('include') || verb.startsWith('append') || verb.startsWith('insert')
          ? 'add'
          : 'remove';
      let body = modifyExerciseMatch[2].trim();
      if (
        /\b(home\s*(?:equipment|gear|setup)|progress\s*(?:page|tab|widget|chart|card)|goal|goals|memory|memories|override|edit|customi[sz]ation)\b/i.test(
          body
        )
      ) {
        return null;
      }
      const setsMatch = /\bfor\s+(\d+)\s+sets?\b/i.exec(body);
      const setsCount = setsMatch ? parseInt(setsMatch[1], 10) : undefined;
      body = body
        .replace(/\bfor\s+\d+\s+sets?\b/gi, '')
        .replace(/\b(?:to|into|from|out\s+of|in)\s+(?:today'?s?\s+)?(?:workout|session|routine|plan)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!body) return null;
      if (action === 'remove') {
        const matched = resolveWorkoutExerciseByName(body, activeWorkout, exerciseCatalog);
        return matched ? { action, exerciseName: matched.name, setsCount } : null;
      }
      const explicitlyWorkout = /\b(?:workout|session|routine)\b/i.test(modifyExerciseMatch[2]);
      const matchedDef = resolveCatalogExerciseByName(body, exerciseCatalog, activeWorkout);
      if (!matchedDef && !explicitlyWorkout) return null;
      if (!explicitlyWorkout && equipmentChanges.length > 0) return null;
      return matchedDef ? { action, exerciseName: matchedDef.name, setsCount } : null;
    })();

  const isSessionOnlyPhrase =
    /\b(today|this\s+session|right\s+now|for\s+this\s+workout)\b/i.test(lowerMsg) &&
    !isExplicitPermanentMemoryRequest(userMessage);
  const memoryCmdMatch =
    !isAdvisoryQuestion &&
    !exerciseNoteCandidate &&
    !isSessionOnlyPhrase &&
    /\b(remember\s+(that|this)?|save\s+(this|to\s+(?:my\s+)?memory)|keep\s+in\s+mind|note\s+that)\b/i.test(lowerMsg) &&
    !/^(what|can\s+you\s+tell\s+me|do\s+you\s+remember)\b/i.test(lowerMsg);

  const dateHintInMsg = /\byesterday\b/i.test(cleanLowerForCmd) ? 'yesterday' : undefined;
  const strippedDateCmd = cleanPromptForCmd.replace(/\s+(?:for\s+)?(?:today|yesterday)\b/gi, '').trim();

  const logWeightMatch =
    !isAdvisoryQuestion
      ? /^(?:log|record|save|update|enter|set)\s+(?:my\s+)?(?:body\s*weight|weight)\s*(?:to|as|at|is|:)?\s*(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)?$/i.exec(
          strippedDateCmd
        ) || /^i\s+(?:just\s+)?weigh(?:ed)?\s+(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)$/i.exec(strippedDateCmd)
      : null;
  const logBodyFatMatch =
    !isAdvisoryQuestion && !logWeightMatch
      ? /^(?:log|record|save|update|enter|set)\s+(?:my\s+)?body\s*fat(?:\s*%|\s*pct|\s*percentage)?\s*(?:to|as|at|is|:)?\s*(\d+(?:\.\d+)?)\s*%?$/i.exec(
          strippedDateCmd
        )
      : null;
  const logStepsMatch =
    !isAdvisoryQuestion && !logWeightMatch && !logBodyFatMatch && !goalChange
      ? /^(?:log|record|save|update|enter|add)\s+(?:my\s+)?(\d[\d,]*)\s*steps?$/i.exec(strippedDateCmd) ||
        /^(?:log|record|save|update|enter)\s+(?:my\s+)?steps?\s*(?:to|as|at|is|:)?\s*(\d[\d,]*)$/i.exec(strippedDateCmd)
      : null;
  const logHeightMatch =
    !isAdvisoryQuestion && !logWeightMatch && !logBodyFatMatch && !logStepsMatch
      ? /^(?:log|record|save|update|enter|set)\s+(?:my\s+)?height\s*(?:to|as|at|is|:)?\s*(\d+(?:\.\d+)?)\s*(cm|in|inch|inches)?$/i.exec(
          strippedDateCmd
        )
      : null;
  const logTapeMatch =
    !isAdvisoryQuestion && !logWeightMatch && !logBodyFatMatch && !logStepsMatch && !logHeightMatch
      ? /^(?:log|record|save|update|enter|set)\s+(?:my\s+)?(neck|shoulders?|chest|waist|abdomen|stomach|hips?|(?:left|right)\s+(?:biceps?|arms?|thighs?|quads?|cal(?:f|ves))|(?:biceps?|arms?|thighs?|quads?|cal(?:f|ves))(?:\s+(?:left|right))?)(?:\s*(?:measurement|circumference|size))?\s*(?:to|as|at|is|:)?\s*(\d+(?:\.\d+)?)\s*(cm|in|inch|inches)?$/i.exec(
          strippedDateCmd
        )
      : null;
  const ACTIVITY_NOUN_PATTERN =
    '(walk(?:ing)?|run(?:ning)?|jog(?:ging)?|bike|biking|cycling|ride|riding|swim(?:ming)?|row(?:ing)?|elliptical|cross[\\s-]?trainer|hike|hiking|sport|cardio|hiit|class|yoga|pilates|stretch(?:ing)?|mobility|activity|workout)';
  const logActiveDayMatch = (() => {
    if (isAdvisoryQuestion || logWeightMatch || logBodyFatMatch || logStepsMatch || logHeightMatch || logTapeMatch) {
      return null;
    }
    const minsFirst = new RegExp(
      `^(?:log|record|save|add)\\s+(?:a\\s+|an\\s+|my\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:-|\\s)?min(?:ute)?s?\\s+(?:(\\d+(?:\\.\\d+)?)\\s*(?:km|k)\\s+)?(?:of\\s+)?${ACTIVITY_NOUN_PATTERN}(?:\\s+(\\d+(?:\\.\\d+)?)\\s*(?:km|k))?$`,
      'i'
    ).exec(strippedDateCmd);
    if (minsFirst) {
      return {
        mins: parseFloat(minsFirst[1]),
        noun: minsFirst[3].toLowerCase(),
        distKm: minsFirst[2] || minsFirst[4] ? parseFloat(minsFirst[2] || minsFirst[4]) : undefined,
      };
    }
    const nounFirst = new RegExp(
      `^(?:log|record|save|add)\\s+(?:a\\s+|an\\s+|my\\s+)?${ACTIVITY_NOUN_PATTERN}\\s+(?:for\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:-|\\s)?min(?:ute)?s?(?:\\s+(\\d+(?:\\.\\d+)?)\\s*(?:km|k))?$`,
      'i'
    ).exec(strippedDateCmd);
    if (nounFirst) {
      return {
        mins: parseFloat(nounFirst[2]),
        noun: nounFirst[1].toLowerCase(),
        distKm: nounFirst[3] ? parseFloat(nounFirst[3]) : undefined,
      };
    }
    return null;
  })();

  const PROGRAM_SCOPE_SOURCE =
    '\\b(?:all\\s+(?:remaining\\s+|future\\s+|upper(?:\\s+body)?\\s+|lower(?:\\s+body)?\\s+|leg\\s+|push\\s+|pull\\s+)?(?:workouts?|sessions?|days?|weeks?)|every\\s+(?:upper(?:\\s+body)?\\s+|lower(?:\\s+body)?\\s+|leg\\s+|push\\s+|pull\\s+)?(?:workout|session|day|week)|(?:upper|lower|leg|push|pull)\\s+days|(?:whole|entire)\\s+(?:program|plan)|rest\\s+of\\s+(?:my\\s+|the\\s+)?(?:program|plan)|(?:across|throughout|in|to|from)\\s+(?:my\\s+|the\\s+)?(?:program|plan|all\\s+(?:workouts?|sessions?))|permanent(?:ly)?|going\\s+forward|from\\s+now\\s+on|for\\s+good)\\b';
  const isProgramScope = new RegExp(PROGRAM_SCOPE_SOURCE, 'i').test(lowerMsg);
  const wantsImmediateNoHitl = /\b(immediately|without asking|no confirm(?:ation)?|skip confirm(?:ation)?)\b/i.test(lowerMsg);
  const clearProgramEditsIntent =
    !isAdvisoryQuestion &&
    /\b(?:clear|remove|reset|undo|restore)\b.*\b(?:all\s+)?(?:program\s+(?:edits|overrides|customi[sz]ations|adaptations|changes)|default\s+exercises)\b/i.test(
      lowerMsg
    );
  const removeSingleOverrideMatch =
    !isAdvisoryQuestion && !clearProgramEditsIntent
      ? /^(?:remove|undo|delete|revert|clear)\s+(?:the\s+|my\s+)?(.+?)\s+(?:program\s+)?(?:edit|override|swap|customi[sz]ation|adaptation)\b/i.exec(
          cleanPromptForCmd
        )
      : null;
  const programRepRangeMatch =
    !isAdvisoryQuestion &&
    (/\b(?:change|set|adjust|update)\s+(.+?)\s+(?:rep\s*range|reps?)\s+(?:to\s+)?(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:reps?)?/i.exec(
      cleanPromptForCmd
    ) ||
      (isProgramScope
        ? /^(?:change|set|adjust|update)\s+(.+?)\s+to\s+(\d+)\s*(?:-|–|to)\s*(\d+)\s*reps?\b/i.exec(
            cleanPromptForCmd
          )
        : null));
  const rebalanceProgramIntent =
    !isAdvisoryQuestion &&
    !resetProgramIntent &&
    (/\b(?:rebalance|fix|correct|address|even\s+out|make\s+up\s+for|compensate\s+for|adapt|adjust|modify)\b.*\b(?:imbalanc\w*|asymmetr\w*|weaker\s+side|weak\s+side|symmetry|pull(?:ing)?\s+(?:behind|vs|imbalance|weak\w*)|level\s+gap|lagging|weakness|stall(?:ed)?|contraindication)\b/i.test(
      lowerMsg
    ) ||
      /\brebalance\s+(?:my\s+)?(?:program|plan|workouts?)\b/i.test(lowerMsg));
  const cleanProgramScopedCmd = cleanPromptForCmd
    .replace(new RegExp(PROGRAM_SCOPE_SOURCE, 'gi'), ' ')
    .replace(/\b(?:permanently|always)\b/gi, ' ')
    .replace(/\b(?:stalled|bothersome|painful)\b/gi, ' ')
    .replace(/\s+(?:because|since|due\s+to)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const programReasonMatch = /\b(?:because|since|due\s+to)\s+(.+)$/i.exec(cleanPromptForCmd);
  const programFilterMatch = /\b(?:on|in|for|all)\s+(upper(?:\s*body)?|lower(?:\s*body)?|legs?|chest\s+and\s+back|shoulders?\s+and\s+arms|full\s+body\s+[ab]|week\s*\d+)\b/i.exec(
    lowerMsg
  );
  const extractedProgramFilter = programFilterMatch?.[1]?.trim();

  const programSwapTwoMatch =
    !isAdvisoryQuestion && isProgramScope
      ? /^(?:swap|replace|substitute|switch|change)\s+(?:out\s+)?(.+?)\s+(?:with|for|to|instead\s+of|->|→)\s+(.+)$/i.exec(
          cleanProgramScopedCmd
        )
      : null;
  const programSwapOneMatch =
    !isAdvisoryQuestion && isProgramScope && !programSwapTwoMatch
      ? /^(?:swap|replace|substitute)(?:\s+out)?\s+(.+)$/i.exec(cleanProgramScopedCmd)
      : null;
  const programAddMatch =
    !isAdvisoryQuestion && isProgramScope && !programSwapTwoMatch && !programSwapOneMatch
      ? /^(?:add|include|append|insert)\s+(.+)$/i.exec(cleanProgramScopedCmd)
      : null;
  const programRemoveMatch =
    !isAdvisoryQuestion && isProgramScope && !programSwapTwoMatch && !programSwapOneMatch && !programAddMatch
      ? /^(?:remove|delete|drop|take\s+out)\s+(.+)$/i.exec(cleanProgramScopedCmd)
      : null;
  const programAdjustSetsMatch =
    !isAdvisoryQuestion && isProgramScope
      ? /^(?:adjust|change|increase|add|reduce|drop|cut)\b.*\b(\d+)\s+sets?\b.*\b(?:on|to|for|of)\s+(.+)$/i.exec(cleanProgramScopedCmd) ||
        /^(?:add|increase|reduce|drop|cut)\s+(?:a\s+|an\s+|one\s+|1\s+)?(?:working\s+)?set\b.*\b(?:on|to|for|of)\s+(.+)$/i.exec(cleanProgramScopedCmd)
      : null;
  const programPrioritizeMatch =
    !isAdvisoryQuestion && isProgramScope
      ? /^(?:prioritize|move)\s+(.+?)(?:\s+first|\s+to\s+first|\s+to\s+(?:#?1|exercise\s*1))?$/i.exec(cleanProgramScopedCmd)
      : null;

  const reorderTodayCandidate = (() => {
    if (isAdvisoryQuestion || isProgramScope) return null;
    const firstLastM = /^(?:move|put|do)\s+(.+?)\s+(first|last|to\s+first|to\s+the\s+top|to\s+the\s+end|#?1)(?:\s+today|\s+in\s+today'?s?\s+workout)?$/i.exec(
      cleanPromptForCmd
    );
    if (firstLastM) {
      const ex = resolveWorkoutExerciseByName(firstLastM[1].trim(), activeWorkout, exerciseCatalog);
      if (ex) {
        const pos = /last|end/i.test(firstLastM[2]) ? ('last' as const) : ('first' as const);
        return { exercise_name: ex.name, position: pos };
      }
    }
    const relM = /^(?:move|put|do)\s+(.+?)\s+(before|after)\s+(.+?)(?:\s+today|\s+in\s+today'?s?\s+workout)?$/i.exec(
      cleanPromptForCmd
    );
    if (relM) {
      const ex = resolveWorkoutExerciseByName(relM[1].trim(), activeWorkout, exerciseCatalog);
      const ref = resolveWorkoutExerciseByName(relM[3].trim(), activeWorkout, exerciseCatalog);
      if (ex && ref) {
        return {
          exercise_name: ex.name,
          position: relM[2].toLowerCase() as 'before' | 'after',
          reference_exercise_name: ref.name,
        };
      }
    }
    return null;
  })();

  if (progressWidgetChange) {
    answerText = progressWidgetChange.reply;
    if (progressWidgetChange.changed) {
      const prevCount = profile.progressWidgets?.length;
      updatedProfile = { progressWidgets: progressWidgetChange.progressWidgets };
      mutationStatus = 'success';
      stateDiff = {
        object_type: 'Dashboard',
        object_id: 'progress-widgets',
        label: 'Progress Updated',
        previous_state: { display: prevCount ? `${prevCount} widgets` : 'Default' },
        new_state: { display: progressWidgetChange.summary ?? 'Progress widgets updated' },
      };
      undoSnapshot = {
        label: 'Undo Progress Update',
        previousProfile: { progressWidgets: profile.progressWidgets },
      };
      navigateTarget = 'analytics';
      navigateLabel = 'View Progress';
      navigateDetail = { detail: 'overview' };
      actionTaken = {
        type: 'UPDATE_PROGRESS_WIDGETS',
        summary: progressWidgetChange.summary ?? 'Progress widgets updated',
        toolName: 'update_progress_widgets',
        mutationStatus: 'success',
        stateDiff,
      };
    }
  } else if (goalChange) {
    answerText = goalChange.reply;
    if (goalChange.changed) {
      updatedProfile = { goalSettings: goalChange.goalSettings };
      mutationStatus = 'success';
      stateDiff = {
        object_type: 'Goal',
        object_id: 'goals',
        label: 'Goals Updated',
        previous_state: { display: `${profile.goalSettings?.customGoals?.length ?? 0} custom goal(s)` },
        new_state: { display: goalChange.summary ?? 'Goals updated' },
      };
      undoSnapshot = {
        label: 'Undo Goal Update',
        previousProfile: { goalSettings: profile.goalSettings },
      };
      navigateTarget = 'analytics';
      navigateLabel = 'View Goals';
      navigateDetail = { detail: 'goals' };
      actionTaken = {
        type: 'UPDATE_GOALS',
        summary: goalChange.summary ?? 'Goals updated',
        toolName: 'update_goals',
        mutationStatus: 'success',
        stateDiff,
      };
    }
  } else if (clearAllMemoriesMatch || deleteMemoryCandidate) {
    const outcome = await executeCoachToolCall(
      'delete_athlete_memory',
      clearAllMemoriesMatch
        ? { clear_all: true, confirmation_required: wantsImmediateNoHitl ? false : undefined }
        : { query: deleteMemoryCandidate! },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (profileUpdateCandidate) {
    const outcome = await executeCoachToolCall('update_athlete_profile', profileUpdateCandidate, toolCtx);
    applyToolOutcome(outcome);
  } else if (overrideRecoveryIntent) {
    const outcome = await executeCoachToolCall(
      'override_recovery_gate',
      { confirmation_required: wantsImmediateNoHitl ? false : undefined },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (exerciseNoteCandidate) {
    const outcome = await executeCoachToolCall('update_exercise_note', exerciseNoteCandidate, toolCtx);
    applyToolOutcome(outcome);
  } else if (logWorkoutSetCandidate) {
    const outcome = await executeCoachToolCall('log_workout_set', logWorkoutSetCandidate, toolCtx);
    applyToolOutcome(outcome);
  } else if (isResetQuestionOnly) {
    const currentPlan = resolveActivePlan(profile);
    answerText = `You can reset **${currentPlan.name}** to Day 1 whenever you want a clean run from Week 1 without losing any logged workouts, total volume, or personal bests. Say "reset my program to day 1" and I'll queue Workout 1 for you right away.`;
  } else if (resetProgramIntent) {
    const wantsConfirmationGate = /\b(wipe|discard|ask\s+me\s+first|confirm)\b/i.test(lowerMsg);
    const parsedWeek = lowerMsg.match(/\bweek\s*(\d+)\b/i)?.[1];
    const parsedDay = lowerMsg.match(/\bday\s*(\d+)\b/i)?.[1];
    const targetWeek = parsedWeek ? Math.max(1, parseInt(parsedWeek, 10)) : 1;
    const targetDay = parsedDay ? Math.max(1, parseInt(parsedDay, 10)) : 1;
    const outcome = await executeCoachToolCall(
      'reset_program',
      {
        program_id: profile.programType,
        target_week: targetWeek,
        target_day: targetDay,
        confirmation_required: wantsConfirmationGate ? true : wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
    if (outcome.mutationStatus === 'success') {
      const activePlan = resolveActivePlan(profile);
      const totalWeeks = Math.max(1, ...activePlan.templates.map((t) => t.week));
      const workoutNum = updatedWorkout?.programWorkoutNumber ?? 1;
      const workoutLabel = updatedWorkout?.programWorkoutNumber
        ? `Workout ${updatedWorkout.programWorkoutNumber}: ${planWorkoutLabel(updatedWorkout.name)}`
        : updatedWorkout?.name || 'Workout 1';
      answerText = `Done — I've reset **${activePlan.name}** to Week ${targetWeek}, Day ${targetDay} (of ${totalWeeks} weeks).\n\nYour Workout tab is now queued on **${workoutLabel}**, and your Program progress for this run starts fresh. All of your past logged sessions, total volume, and Trophy Cabinet personal bests remain saved in your history.`;
      if (actionTaken) {
        actionTaken.details = {
          planId: activePlan.id,
          resetAt: outcome.updatedProfile?.planCycleStarts?.[activePlan.id],
          workoutNumber: workoutNum,
        };
      }
      citations.push({
        label: activePlan.name,
        metric: 'Program Run',
        value: `Workout ${workoutNum} of ${activePlan.templates.length} (Week ${targetWeek}/${totalWeeks})`,
      });
    }
  } else if (clearProgramEditsIntent) {
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'clear_overrides',
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (removeSingleOverrideMatch) {
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'remove_override',
        old_exercise_id: removeSingleOverrideMatch[1].trim(),
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (programRepRangeMatch) {
    const cleanTarget = programRepRangeMatch[1]
      .replace(new RegExp(PROGRAM_SCOPE_SOURCE, 'gi'), ' ')
      .replace(/\b(?:on|for|in)\s+$/i, '')
      .trim();
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'adjust_rep_range',
        old_exercise_id: cleanTarget,
        min_reps: parseInt(programRepRangeMatch[2], 10),
        max_reps: parseInt(programRepRangeMatch[3], 10),
        ...(extractedProgramFilter ? { workout_filter: extractedProgramFilter } : {}),
        reason: programReasonMatch?.[1]?.trim() || 'rep range adjustment',
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (programAdjustSetsMatch) {
    const hasNumericSets = programAdjustSetsMatch.length >= 3 && /^\d+$/.test(programAdjustSetsMatch[1]);
    const rawTarget = (hasNumericSets ? programAdjustSetsMatch[2] : programAdjustSetsMatch[1] || '').trim();
    const isDrop = /\b(reduce|drop|cut|lower|decrease)\b/i.test(cleanProgramScopedCmd);
    const isDeltaWord = /\b(?:a|an|one)\s+(?:working\s+)?set\b/i.test(cleanLowerForCmd) || !hasNumericSets;
    const valNum = hasNumericSets ? parseInt(programAdjustSetsMatch[1], 10) : 1;
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'adjust_sets',
        old_exercise_id: rawTarget,
        ...(isDeltaWord ? { set_delta: isDrop ? -valNum : valNum } : { sets: valNum }),
        ...(extractedProgramFilter ? { workout_filter: extractedProgramFilter } : {}),
        reason: programReasonMatch?.[1]?.trim() || 'athlete request',
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (rebalanceProgramIntent && !programSwapTwoMatch && !programAddMatch && !programRemoveMatch) {
    let focus: 'auto' | 'pull_vs_push' | 'level_gap' | 'left_right_symmetry' | 'plateau' | 'contraindication' | 'muscle_volume' = 'auto';
    if (/\bpull(?:ing)?\b|\bchin[\s-]?up|\bpoliquin\b/i.test(lowerMsg)) focus = 'pull_vs_push';
    else if (/\basymmetr|symmetr|left[\s-]?(?:vs|and|to)?\s*right|weaker\s+side|weak\s+side\b/i.test(lowerMsg)) focus = 'left_right_symmetry';
    else if (/\blevel\s+gap|kilgore|lagging\b/i.test(lowerMsg)) focus = 'level_gap';
    else if (/\bstall|plateau\b/i.test(lowerMsg)) focus = 'plateau';
    else if (/\bshoulder|knee|back|elbow|wrist|contraindicat\w*|joint\b/i.test(lowerMsg)) focus = 'contraindication';
    else if (/\bvolume|sets\b/i.test(lowerMsg)) focus = 'muscle_volume';
    const muscleHint =
      lowerMsg.match(/\b(pull(?:ing)?|push|squat|hinge|deadlift|bench|chest|back|shoulders?|rear\s*delts?|side\s*delts?|quads?|hamstrings?|glutes?|biceps?|triceps?|calves?|symmetry)\b/i)?.[1];
    const outcome = await executeCoachToolCall(
      'rebalance_program',
      {
        focus,
        ...(muscleHint ? { target_muscle_or_pillar: muscleHint } : {}),
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (programSwapTwoMatch || programSwapOneMatch) {
    const oldPart = (programSwapTwoMatch ? programSwapTwoMatch[1] : programSwapOneMatch![1]).trim();
    const newPart = programSwapTwoMatch ? programSwapTwoMatch[2].trim() : undefined;
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'swap_exercise',
        old_exercise_id: oldPart,
        ...(newPart ? { new_exercise_id: newPart } : {}),
        ...(extractedProgramFilter ? { workout_filter: extractedProgramFilter } : {}),
        reason: programReasonMatch?.[1]?.trim() || 'athlete request',
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (programAddMatch && !/\bsets?\b/.test(cleanProgramScopedCmd.replace(/\bfor\s+\d+\s+sets?\b/gi, ''))) {
    const setsMatchProg = /\bfor\s+(\d+)\s+sets?\b/i.exec(programAddMatch[1]);
    const cleanNewName = programAddMatch[1]
      .replace(/\bfor\s+\d+\s+sets?\b/gi, '')
      .replace(/\b(?:to|into|across|in)\b.*$/i, '')
      .trim();
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'add_exercise',
        new_exercise_id: cleanNewName,
        sets: setsMatchProg ? parseInt(setsMatchProg[1], 10) : 3,
        ...(extractedProgramFilter ? { workout_filter: extractedProgramFilter } : {}),
        reason: programReasonMatch?.[1]?.trim(),
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (programRemoveMatch) {
    const cleanOld = programRemoveMatch[1].replace(/\b(?:from|out\s+of|in)\b.*$/i, '').trim();
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'remove_exercise',
        old_exercise_id: cleanOld,
        ...(extractedProgramFilter ? { workout_filter: extractedProgramFilter } : {}),
        reason: programReasonMatch?.[1]?.trim(),
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (programPrioritizeMatch) {
    const cleanOld = programPrioritizeMatch[1].replace(/\s+in\s+(?:the\s+|my\s+)?(?:workout|session|program|plan)\b/gi, '').trim();
    const outcome = await executeCoachToolCall(
      'modify_program',
      {
        action: 'prioritize_first',
        old_exercise_id: cleanOld,
        ...(extractedProgramFilter ? { workout_filter: extractedProgramFilter } : {}),
        reason: programReasonMatch?.[1]?.trim() || 'prioritize lagging movement',
        confirmation_required: wantsImmediateNoHitl ? false : undefined,
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (reorderTodayCandidate) {
    const outcome = await executeCoachToolCall('reorder_workout_exercises', reorderTodayCandidate, toolCtx);
    applyToolOutcome(outcome);
  } else if (twoSidedSwapCandidate || oneSidedSwapExercise) {
    const reasonMatch = /\b(?:because|since|due\s+to)\s+(.+)$/i.exec(cleanPromptForCmd);
    const outcome = await executeCoachToolCall(
      'swap_exercise',
      {
        workout_id: activeWorkout.id,
        old_exercise_id: twoSidedSwapCandidate ? twoSidedSwapCandidate.oldPart : oneSidedSwapExercise!.name,
        ...(twoSidedSwapCandidate ? { new_exercise_id: twoSidedSwapCandidate.newPart } : {}),
        reason: reasonMatch?.[1]?.trim() || 'athlete request',
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (volumeCmdMatch) {
    const modifierType = /\b(increase|add)\b/i.test(cleanLowerForCmd)
      ? 'increase_sets'
      : /\bdeload\b/i.test(cleanLowerForCmd)
        ? 'deload_load'
        : /\b(shorten|trim|shorter)\b/i.test(cleanLowerForCmd)
          ? 'short_on_time'
          : 'reduce_sets';
    const targetSetsM = /\b(?:to|at)\s+(\d+)\s+(?:working\s+)?sets?\b/i.exec(cleanLowerForCmd);
    const outcome = await executeCoachToolCall(
      'adjust_workout_volume',
      {
        workout_id: activeWorkout.id,
        modifier_type: modifierType,
        ...(targetSetsM ? { target_sets: parseInt(targetSetsM[1], 10) } : {}),
        details: userMessage.trim().slice(0, 120),
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (modifyExerciseCandidate) {
    const outcome = await executeCoachToolCall(
      'modify_workout_exercises',
      {
        action: modifyExerciseCandidate.action,
        exercise_name: modifyExerciseCandidate.exerciseName,
        ...(modifyExerciseCandidate.setsCount ? { sets: modifyExerciseCandidate.setsCount } : {}),
      },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (memoryCmdMatch) {
    const cleanedFact = userMessage
      .replace(/^.*?\b(?:remember\s+(?:that|this)?|save\s+(?:this|to\s+(?:my\s+)?memory)|keep\s+in\s+mind|note\s+that)[:,\s-]*/i, '')
      .replace(/[?.!\s]+$/, '')
      .trim();
    const category: AthleteMemoryCategory = /\b(injur\w*|pain\w*|hurt\w*|tweak\w*|sprain\w*|torn)\b/i.test(cleanedFact)
      ? 'injury'
      : /\b(avoid|skip|sensitive|impingement|issue|knee|shoulder|back|elbow|wrist)\b/i.test(cleanedFact)
        ? 'contraindication'
        : /\b(dumbbell|barbell|cable|machine|rack|home|gym|equipment)\b/i.test(cleanedFact)
          ? 'equipment'
          : /\b(schedule|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+\s*(am|pm))\b/i.test(cleanedFact)
            ? 'schedule'
            : 'preference';
    const outcome = await executeCoachToolCall(
      'save_athlete_memory',
      { fact_category: category, fact_value: cleanedFact || userMessage.trim() },
      toolCtx
    );
    applyToolOutcome(outcome);
  } else if (logWeightMatch || logBodyFatMatch || logStepsMatch || logHeightMatch || logTapeMatch || logActiveDayMatch) {
    if (logWeightMatch) {
      const val = parseFloat(logWeightMatch[1]);
      const rawUnit = (logWeightMatch[2] || '').toLowerCase();
      const unitArg = rawUnit.startsWith('lb') || rawUnit.startsWith('pound') ? 'lb' : rawUnit.startsWith('kg') || rawUnit.startsWith('kilo') ? 'kg' : undefined;
      const outcome = await executeCoachToolCall(
        'log_entry',
        { kind: 'bodyweight', value: val, ...(unitArg ? { unit: unitArg } : {}), ...(dateHintInMsg ? { date: dateHintInMsg } : {}) },
        toolCtx
      );
      applyToolOutcome(outcome);
    } else if (logBodyFatMatch) {
      const outcome = await executeCoachToolCall(
        'log_entry',
        { kind: 'body_fat', value: parseFloat(logBodyFatMatch[1]), ...(dateHintInMsg ? { date: dateHintInMsg } : {}) },
        toolCtx
      );
      applyToolOutcome(outcome);
    } else if (logStepsMatch) {
      const stepsVal = parseInt(logStepsMatch[1].replace(/,/g, ''), 10);
      const outcome = await executeCoachToolCall(
        'log_entry',
        { kind: 'steps', value: stepsVal, unit: 'steps', ...(dateHintInMsg ? { date: dateHintInMsg } : {}) },
        toolCtx
      );
      applyToolOutcome(outcome);
    } else if (logHeightMatch) {
      const val = parseFloat(logHeightMatch[1]);
      const rawUnit = (logHeightMatch[2] || '').toLowerCase();
      const unitArg = rawUnit.startsWith('in') ? 'in' : rawUnit.startsWith('cm') ? 'cm' : undefined;
      const outcome = await executeCoachToolCall(
        'log_entry',
        { kind: 'height', value: val, ...(unitArg ? { unit: unitArg } : {}) },
        toolCtx
      );
      applyToolOutcome(outcome);
    } else if (logTapeMatch) {
      const rawSite = logTapeMatch[1].trim().toLowerCase();
      const val = parseFloat(logTapeMatch[2]);
      const rawUnit = (logTapeMatch[3] || '').toLowerCase();
      const unitArg = rawUnit.startsWith('in') ? 'in' : rawUnit.startsWith('cm') ? 'cm' : undefined;
      const outcome = await executeCoachToolCall(
        'log_entry',
        {
          kind: rawSite === 'waist' ? 'waist' : 'tape_measurement',
          measurement_site: rawSite,
          value: val,
          ...(unitArg ? { unit: unitArg } : {}),
          ...(dateHintInMsg ? { date: dateHintInMsg } : {}),
        },
        toolCtx
      );
      applyToolOutcome(outcome);
    } else if (logActiveDayMatch) {
      const { mins, distKm, noun } = logActiveDayMatch;
      const actType = /walk/.test(noun)
        ? 'walk'
        : /run|jog/.test(noun)
          ? 'run'
          : /bik|cycl|ride/.test(noun)
            ? 'cycle'
            : /swim/.test(noun)
              ? 'swim'
              : /row/.test(noun)
                ? 'row'
                : /elliptical|cross/.test(noun)
                  ? 'elliptical'
                  : /hik/.test(noun)
                    ? 'hike'
                    : /sport/.test(noun)
                      ? 'sport'
                      : /class|hiit|yoga|pilates|stretch|mobility/.test(noun)
                        ? 'class'
                        : 'other';
      const outcome = await executeCoachToolCall(
        'log_entry',
        {
          kind: 'active_day',
          value: mins,
          unit: 'minutes',
          activity_type: actType,
          ...(distKm ? { distance_km: distKm } : {}),
          ...(dateHintInMsg ? { date: dateHintInMsg } : {}),
        },
        toolCtx
      );
      applyToolOutcome(outcome);
    }
  } else if (matchedEquip) {
    const toolCallsForEquip = equipmentChanges.map((change) => ({
      name: 'update_home_equipment' as const,
      args: { action: change.action, equipment: [change.equipment.tag] },
    }));
    const outcome =
      toolCallsForEquip.length === 1
        ? await executeCoachToolCall('update_home_equipment', toolCallsForEquip[0].args, toolCtx)
        : await executeCoachToolCalls(toolCallsForEquip, toolCtx);
    if (outcome) {
      applyToolOutcome(outcome);
      if (outcome.mutationStatus === 'success') {
        const nextEquip = outcome.updatedProfile?.homeEquipment ?? [];
        if (actionTaken) {
          actionTaken.details = {
            equipment: nextEquip,
            ...(equipmentChanges[0].action === 'remove'
              ? { removed: matchedEquip.tag }
              : { added: matchedEquip.tag }),
          };
        }
        citations.push({
          label: 'Home Equipment',
          metric: 'Available Tools',
          value: nextEquip.map((t) => EQUIPMENT_NAMES[t] || t).join(', '),
        });
      }
    }
  }

  // ============================================================================
  // 2. INTENT: SCHEDULE TRAVEL / HOME / GYM FOR FUTURE PLAN WEEK (e.g. "away in week 5", "switch week 3 to home")
  // ============================================================================
  else if (
    !isAdvisoryQuestion &&
    /\b(away|travel|travelling|traveling|trip|holiday|vacation|hotel|work\s*trip|bodyweight|home|house|gym)\b/i.test(lowerMsg) &&
    /\b(week\s*\d+|next\s*week)\b/i.test(lowerMsg)
  ) {
    const pos = planPosition(profile, workouts, input.activities ?? []);
    let targetWeek = pos.week;
    const weekMatch = lowerMsg.match(/week\s*(\d+)/i);
    if (weekMatch) {
      targetWeek = Math.min(pos.totalWeeks, Math.max(1, parseInt(weekMatch[1], 10)));
    } else if (/next\s*week/i.test(lowerMsg)) {
      targetWeek = Math.min(pos.totalWeeks, pos.week + 1);
    }
    const targetLoc: TrainingLocation = /\b(home|house)\b/i.test(lowerMsg)
      ? 'home'
      : /\b(gym|full\s*gym)\b/i.test(lowerMsg)
        ? 'gym'
        : 'travel';

    const outcome = await executeCoachToolCall(
      'switch_location',
      { location: targetLoc, week: targetWeek },
      toolCtx
    );
    applyToolOutcome(outcome);
    if (outcome.mutationStatus === 'success') {
      if (actionTaken) {
        actionTaken.details = { week: targetWeek, location: targetLoc };
      }
      citations.push({
        label: `Week ${targetWeek} Plan`,
        metric: 'Location Override',
        value: targetLoc === 'travel' ? 'Bodyweight / No equipment' : targetLoc === 'home' ? 'Home' : 'Gym',
      });
    }
  }

  // ============================================================================
  // 3. INTENT: SWITCH CURRENT WORKOUT LOCATION OR TEMPORARY ENVIRONMENT OVERLAY
  //    (e.g. "switch today to bodyweight", "train at home", "hotel dumbbells up to 30 kg for 5 days")
  // ============================================================================
  else if (
    !isAdvisoryQuestion &&
    (/\b(switch|change|set|turn|move)\b.*\b(travel|bodyweight|home|gym)\b/i.test(lowerMsg) ||
      /\b(train\s*at\s*home|at\s*home\s*today|in\s*a\s*hotel|hotel\s*(?:gym|dumbbells?|only|for)|no\s*weights?\s*today|bodyweight\s*today|back\s*(?:to|at|in)\s*(?:the\s*)?gym|at\s*the\s*gym\s*today|train\s*at\s*the\s*gym)\b/i.test(
        lowerMsg
      ) ||
      /\b(dumbbells?|dbs?)\s*(?:only|up\s*to|max|capped?\s*at)\b/i.test(lowerMsg))
  ) {
    const hasOverlayConstraints =
      /\b(hotel|up\s*to|max(?:imum)?|capped?\s*at|<=|≤|\d+\s*(?:kg|lb|lbs|days?|mins?|minutes?)|dumbbells?\s*only)\b/i.test(
        lowerMsg
      );
    let targetLoc: TrainingLocation = 'travel';
    if (/\b(home|house|hotel\s*(?:gym|dumbbells?)|dumbbells?)\b/i.test(lowerMsg) && !/\bno\s*dumbbells?\b/i.test(lowerMsg)) {
      targetLoc = 'home';
    } else if (/\b(gym|full\s*gym)\b/i.test(lowerMsg) && !/\bhotel\s*gym\b/i.test(lowerMsg)) {
      targetLoc = 'gym';
    }

    const outcome = await executeCoachToolCall(
      'switch_location',
      hasOverlayConstraints
        ? { location: targetLoc, constraint_text: userMessage }
        : { location: targetLoc },
      toolCtx
    );
    applyToolOutcome(outcome);
    if (outcome.mutationStatus === 'success') {
      if (actionTaken) {
        actionTaken.details = {
          location: outcome.updatedProfile?.activeLocation ?? targetLoc,
          ...(outcome.updatedProfile?.activeEnvironmentOverlay
            ? { overlayLabel: outcome.updatedProfile.activeEnvironmentOverlay.label }
            : {}),
        };
      }
      citations.push({
        label: 'Active Session',
        metric: outcome.updatedProfile?.activeEnvironmentOverlay ? 'Environment Overlay' : 'Location',
        value: outcome.updatedProfile?.activeEnvironmentOverlay?.label ?? (outcome.updatedProfile?.activeLocation ?? targetLoc),
      });
    }
  }

  // ============================================================================
  // 4. INTENT: SWITCH PROGRAM OR SPLIT (supports saved/built-in plans; legacy PPL explains available plans honestly)
  // ============================================================================
  else if (
    !isAdvisoryQuestion &&
    matchTargetProgramFromMessage(lowerMsg, profile) &&
    /\b(switch|change|set|swap|use|start|load|move|go\s+to)\b/i.test(lowerMsg)
  ) {
    const matchedPlan = matchTargetProgramFromMessage(lowerMsg, profile)!;
    const outcome = await executeCoachToolCall(
      'switch_program',
      { program_name: matchedPlan.id },
      toolCtx
    );
    applyToolOutcome(outcome);
    if (outcome.mutationStatus === 'success') {
      const nextNum = outcome.updatedWorkout?.programWorkoutNumber ?? 1;
      if (actionTaken) {
        actionTaken.details = { programType: matchedPlan.id, workoutNumber: nextNum };
      }
      citations.push({
        label: 'Active Program',
        metric: 'Program',
        value: matchedPlan.name,
      });
    }
  } else if (
    /\b(switch|change|set)\b.*\b(program|split|ppl)\b/i.test(lowerMsg) ||
    /\b(push\s*pull\s*legs)\b/i.test(lowerMsg)
  ) {
    // Honest explanation without fabricating a green actionApplied receipt.
    answerText =
      "Your training runs on 6-week plans shaped by your goal rather than a separate Push/Pull/Legs split: you can switch between the **3-Day Full Body** Starter Plan, the **4-Day Upper/Lower** Starter Plan, or any custom saved plan. Say \"switch to 4-day upper/lower\" or \"switch to 3-day full body\" whenever you want to change.";
  }

  // ============================================================================
  // 5. INTENT: SWITCH GOAL PHASE (e.g. "switch my goal to Cut / Recomp", "start a bulk")
  // ============================================================================
  else if (
    !isAdvisoryQuestion &&
    /\b(cut|cutting|recomp|lose\s*fat|fat\s*loss|lean\s*bulk|bulk|bulking|build\s*muscle|muscle\s*gain|gain\s*muscle|maingain|stay\s*lean)\b/i.test(
      lowerMsg
    ) &&
    /\b(goal|phase|switch|change|want\s*to|start|set)\b/i.test(lowerMsg)
  ) {
    let targetGoal: GoalPhase = 'Cut / Recomp';
    if (/\b(bulk|bulking|build\s*muscle|muscle\s*gain|gain\s*muscle|lean\s*bulk)\b/i.test(lowerMsg)) {
      targetGoal = 'Lean Bulk';
    } else if (/\b(maingain|stay\s*lean|maintain)\b/i.test(lowerMsg)) {
      targetGoal = 'Maingain';
    }

    const outcome = await executeCoachToolCall(
      'switch_goal_phase',
      { goal_phase: targetGoal },
      toolCtx
    );
    applyToolOutcome(outcome);
    if (outcome.mutationStatus === 'success') {
      if (actionTaken) {
        actionTaken.details = { goalPhase: targetGoal };
      }
      citations.push({
        label: 'Training Goal',
        metric: 'Goal',
        value: GOAL_DISPLAY_NAME[targetGoal],
      });
    }
  }

  // ============================================================================
  // 6. INTENT: LOG REST DAY / SHIFT WORKOUT (e.g. "I can't train today", "take a rest day")
  // ============================================================================
  else if (
    /\b(rest\s*day|can['’]?t\s*train|skip\s*today|shift\s*(workout|session|today)|day\s*off)\b/i.test(lowerMsg) &&
    (/\?\s*$/.test(lowerMsg) || /^(should|can|could|do|does|is|would|what|when|how|why)\b/.test(lowerMsg)) &&
    !(/\b(log|take|make|give\s+me|schedule|i\s+need|i\s+want|i'?m\s+taking)\b/.test(lowerMsg) &&
      (isPoliteCommandPrefix || !/^(should|can\s+i|could\s+i)\b/.test(lowerMsg)))
  ) {
    // "Should I skip today?" is a question: answer it from recovery and change nothing.
    const check = answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState);
    const lead = /^Not yet\. /.test(check) ? 'Yes, rest today. ' : /^Yes\. /.test(check) ? "You don't need to. " : '';
    answerText = `${lead}${check.replace(/^(Not yet|Yes)\. /, '')} ${lead.startsWith('Yes') ? 'Say' : "If you'd rather rest, say"} "take a rest day" and ${activeWorkout.name} moves to tomorrow; missing a day doesn't set your plan back.`;
  } else if (
    /\b(rest\s*day|can['’]?t\s*train|skip\s*today|shift\s*(workout|session|today)|day\s*off)\b/i.test(lowerMsg)
  ) {
    const outcome = await executeCoachToolCall('log_rest_day', {}, toolCtx);
    applyToolOutcome(outcome);
    if (outcome.mutationStatus === 'success') {
      const tomorrowStr = outcome.updatedWorkout?.date;
      if (actionTaken) {
        actionTaken.details = { date: tomorrowStr };
      }
      citations.push({
        label: 'Schedule',
        metric: 'Next Session',
        value: `Tomorrow (${activeWorkout.name})`,
      });
    }
  }

  // ============================================================================
  // 6b. INTENTS ABOUT THE ATHLETE'S OWN PLAN AND DATA (same figures as the pages)
  // ============================================================================
  else if (
    !isExplicitActionIntent &&
    /\b(what do you remember|what have you saved|my (?:saved )?(?:memories|notes)|list (?:my )?memories|show (?:my )?memories)\b/i.test(
      lowerMsg
    )
  ) {
    answerText = answerAthleteMemories(profile);
  } else if (
    !isExplicitActionIntent &&
    /\b(what (?:are|is) my goals?|show (?:me )?my goals?|my active goals?|how are my goals)\b/i.test(lowerMsg)
  ) {
    answerText = answerGoalsStatus(
      profile,
      workouts,
      biometrics,
      input.activities ?? [],
      hasMeasuredBw ? bodyweightEmaKg : undefined
    );
  } else if (
    !isExplicitActionIntent &&
    /\b(custom (?:changes?|edits?|adaptations?|overrides?)|program (?:changes?|edits?|adaptations?|overrides?)|what have i changed|what edits)\b/i.test(
      lowerMsg
    )
  ) {
    answerText = answerProgramOverrides(profile);
  } else if (
    !isExplicitActionIntent &&
    /\b(how does (?:the|my) weekly schedule work|weekly schedule|schedule rest days|when do i train)\b/i.test(lowerMsg)
  ) {
    answerText = answerWeeklySchedule(profile, workouts, input.activities ?? []);
  } else if (
    !isExplicitActionIntent &&
    /\b(my|last|previous)\b.*\b(tonnage|work capacity|wci)\b|\b(what was|how much) (?:was )?my (?:total )?(?:tonnage|volume|work capacity|wci)\b.*\b(last|previous|workout|session)\b/i.test(
      lowerMsg
    )
  ) {
    answerText = answerLastSessionTonnage(workouts, biometrics, profile, bodyweightEmaKg);
  } else if (
    !isExplicitActionIntent &&
    /\b(what did i lift|last time|history|previous(?:ly)?)\b.*\b(?:on|for)\b|\b(?:my )?history (?:on|for)\b/i.test(lowerMsg) &&
    findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)
  ) {
    answerText =
      answerExerciseHistory(lowerMsg, activeWorkout, workouts, exerciseCatalog, profile.weightUnit || 'kg') ||
      answerPlanPosition(profile, workouts, input.activities ?? []);
  } else if (
    !isExplicitActionIntent &&
    /\b(which|what) joints?\b|\bresistance profile\b|\baxial load\b/i.test(lowerMsg) &&
    findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.def
  ) {
    answerText =
      answerExerciseBiomechanics(lowerMsg, activeWorkout, exerciseCatalog) ||
      answerPlanPosition(profile, workouts, input.activities ?? []);
  } else if (
    !isExplicitActionIntent &&
    !/\b(formula|calculat\w*|worked out|why|explain|science|how does|how is|recomposition|shirt off|scale\s*flat|scale\s*not\s*moving|smart\s*scale|smart\s*tape|renpho|measure\s*progress|weigh\s*myself|take\s*measurements)\b/i.test(
      lowerMsg
    ) &&
    !/\b(sets?|volume|enough|train(?:ing)?|workout|recovery|strain|sore|pain|hurt|injur\w*|imbalanc\w*|standard|level)\b/i.test(
      lowerMsg
    ) &&
    (/\b(my|what(?:'s| is| are)|latest|current|how(?:'s| is) my)\b.*\b(waist|neck|abdomen|hips?|measurements?|body\s*comp(?:osition)?|body\s*fat|bf\s*%|lean\s*(?:body\s*)?mass|fat[- ]?free\s*mass|lbm|ffm)\b/i.test(
      lowerMsg
    ) ||
      (/\b(my|what(?:'s| is| are)|latest|current|how big)\b.*\b(chest|biceps?|arms?|thighs?|cal(?:f|ves)|shoulders?)\b/i.test(
        lowerMsg
      ) &&
        /\b(size|measurement|measurements|circumference|tape|cm|inch(?:es)?|in\.|how big|girth|symmetry)\b/i.test(
          lowerMsg
        )))
  ) {
    const compAns = answerBodyCompositionAndMeasurements(lowerMsg, biometrics, profile, bodyweightEmaKg);
    answerText = compAns || answerPlanPosition(profile, workouts, input.activities ?? []);
  } else if (!isExplicitActionIntent && /\bstreak\b/.test(lowerMsg)) {
    answerText = answerStreak(workouts, input.activities ?? []);
  } else if (
    kitMissingToday ||
    /\b(no|without) (a |an |the |any )?(free )?(barbells?|dumbbells?|cables?|machines?)\b|\b(barbells?|dumbbells?|cables?|machines?) (is|are|were|was) (all )?(taken|busy|in use|broken|full|occupied)\b/.test(lowerMsg)
  ) {
    const swapOpts = answerSwapWithOptions(lowerMsg, activeWorkout, exerciseCatalog);
    answerText = `${swapOpts.text}${
      kitMissingToday && detectedEquipmentChange
        ? `\n\nIf you meant your home equipment permanently, say "remove the ${detectedEquipmentChange.equipment.name.toLowerCase()} from my home equipment".`
        : ''
    }`;
  } else if (everydayAnswer && !isExplicitActionIntent) {
    answerText = everydayAnswer;
  } else if (
    !isExplicitActionIntent &&
    /\b(what|which) week\b|\bweek am i\b|\b(sessions?|workouts?) (are )?left\b|\bhow far (am i|through)\b|\bwhere am i in\b|\bwhat'?s next\b|\bwhat is next\b|\bnext workout\b|\bafter this (workout|session)\b|\bwhich phase\b|\bwhat phase\b/.test(lowerMsg)
  ) {
    answerText = answerPlanPosition(profile, workouts, input.activities ?? []);
  } else if (
    !isExplicitActionIntent &&
    ((/\bshould i (train|work ?out|lift|go to the gym|skip)\b(?! (to|till|until) failure)/.test(lowerMsg) &&
      !/\b(?:how|what way|why)\s+should\s+i\s+(?:train|lift|work ?out)\b/.test(lowerMsg) &&
      !/\bshould i (?:train|lift|work ?out) (?:for|to|with|more|less|heavier|lighter|faster|after|when|while)\b/.test(lowerMsg)) ||
      /\b(am i|are my muscles) (ready|recovered)\b|\b(ok|okay|fine) to train\b|\bcan i train\b/.test(lowerMsg))
  ) {
    answerText = answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState);
  } else if (
    !isExplicitActionIntent &&
    /\bwhy\b.*\b(weights?|heavier|lighter|reps?|load)\b/.test(lowerMsg) &&
    /\b(go|goes|went|gone|change[ds]?|up|down|drop(ped)?|increase[ds]?|same|heavier|lighter|more|less|higher|lower)\b/.test(lowerMsg)
  ) {
    answerText = answerWeightChange(
      lowerMsg,
      activeWorkout,
      workouts,
      readinessState,
      profile.weightUnit || 'kg',
      exerciseCatalog
    );
  } else if (
    !isExplicitActionIntent &&
    !/\b(why|explain|science|formula|research)\b/.test(lowerMsg) &&
    (/\b(how long|how much|how many (minutes|seconds))\b.*\brest\b|\brest (times?|between|periods?)\b/.test(lowerMsg))
  ) {
    answerText = answerRestTimes(activeWorkout);
  } else if (!isExplicitActionIntent && asksAboutVolume(lowerMsg)) {
    answerText = answerWeeklySets(lowerMsg, kg);
  }

  // ============================================================================
  // 7. INTENT: KNOWLEDGE GRAPH QUERIES (Joints, Recovery, Muscles, Science)
  // ============================================================================
  else {
    // Internal design-system documentation is not exposed in the athlete-facing coach.
    const isDesignQuery = false;

    const dsMatches = isDesignQuery ? queryDesignSystemComponents(lowerMsg) : [];

    // A. Joint Strain & Health Query (only when genuinely asking about joint load/strain/ache/stiffness, not hypertrophy or "get back")
    const asksAboutMuscleBuildOrReturn =
      /\b(build|grow|wider|bigger|broader|thickness|width|size|hypertrophy|come back|getting back|back on track|back to (?:training|lifting|the gym))\b/.test(
        lowerMsg
      );
    const asksAboutJointLoad =
      !asksAboutMuscleBuildOrReturn &&
      (/\b(joint|joints|joint strain|strain|stress|ache|pain|sore\w*|tight\w*|load on my|capsule|tendon|stiff\w*)\b/.test(lowerMsg) ||
        /\bhow(?:'?s| is| are) my (?:shoulder|elbow|back|lower back|knee|ankle)s?\b/.test(lowerMsg));

    const jointQuery = asksAboutJointLoad
      ? kg.joints.find((j) => {
          const lowerJ = j.joint.toLowerCase();
          return (
            lowerMsg.includes(lowerJ.split(' ')[0]) ||
            (lowerMsg.includes('shoulder') && lowerJ.includes('shoulder')) ||
            (lowerMsg.includes('elbow') && lowerJ.includes('elbow')) ||
            (lowerMsg.includes('back') && lowerJ.includes('lumbar')) ||
            (lowerMsg.includes('knee') && lowerJ.includes('knee')) ||
            (lowerMsg.includes('ankle') && lowerJ.includes('ankle'))
          );
        })
      : undefined;

    if (!isExplicitActionIntent && (jointQuery || lowerMsg.includes('joint strain') || /\bjoints?\b/.test(lowerMsg))) {
      const targetJoint = jointQuery || kg.joints.sort((a, b) => b.strainScore - a.strainScore)[0];
      answerText = `Your ${targetJoint.joint} is currently at ${targetJoint.strainScore}/100 load (${targetJoint.status}). Most of the recent stress came from ${targetJoint.topContributors.slice(0, 2).join(' and ') || 'recent pressing movements'}. ${targetJoint.biomechanicalAdvice}`;

      citations.push({
        label: targetJoint.joint,
        metric: 'Strain Score',
        value: `${targetJoint.strainScore}/100 (${targetJoint.status})`,
      });
      citations.push({
        label: 'Lower Back Load',
        metric: 'Axial Load',
        value: `${kg.systemicAxialLoadScore}%`,
      });
    }

    // B. Grounded Design System Component Query (Anatomy, Logic Invariants, Tailwind Tokens)
    else if (isDesignQuery && dsMatches.length > 0) {
      const comp = dsMatches[0];
      answerText = `Component Specification: ${comp.name} (${comp.category})\n\nRationale:\n${comp.rationale}\n\nComponent Anatomy:\n- Typography: ${comp.anatomy.typography}\n- Container: ${comp.anatomy.container}\n- Touch Target: ${comp.anatomy.touchTarget}\n- Colors & States: ${comp.anatomy.colors}\n\nKey Invariant Rules:\n${comp.logic.rules.map((r) => `• ${r}`).join('\n')}\n\nTailwind Tokens:\n${comp.tailwindTokens}`;

      citations.push({
        label: comp.name,
        metric: 'Component ID',
        value: comp.id,
      });
      citations.push({
        label: 'Touch Target',
        metric: 'Accessibility',
        value: comp.anatomy.touchTarget,
      });
    }

    // C. Grounded Exercise Science Knowledge Base Query (Exact Formulas & Physiological Rationale)
    else {
      // Concept/rule questions that contain words like "tempo", "warm-up", "weight", "sets", "readiness"
      // must reach the Exercise Science Knowledge Base instead of tactical target lookup.
      const asksConceptOrRuleDefinition =
        !/\b(my targets?|my sets?|my reps?|my weight|today'?s|for today|in today'?s)\b/i.test(lowerMsg) &&
        /\b(what does .* mean|meaning of|what is a |what are (?:drop|giant|super|myo|warm[- ]?up|volume|rir|dots|tempo)|per dumbbell|each dumbbell|combined weight|both dumbbells|how much of my bodyweight|bodyweight percentage|bodyweight fraction|how is .* calculated|how do warm[- ]?ups? work|warm[- ]?up protocol|drop[- ]?set|giant[- ]?set|super[- ]?set|myo[- ]?rep|tempo\s*\d{4}|what does tempo)\b/i.test(
          lowerMsg
        );

      // Prioritize active exercise targets over theoretical science when athlete asks about today's weights/reps
      const isTacticalWorkoutQuery =
        !asksConceptOrRuleDefinition &&
        (lowerMsg.includes('weight') ||
          lowerMsg.includes('rep') ||
          lowerMsg.includes('set') ||
          lowerMsg.includes('target') ||
          lowerMsg.includes('today') ||
          lowerMsg.includes('prescribed') ||
          lowerMsg.includes('how much') ||
          lowerMsg.includes('how many') ||
          lowerMsg.includes('swap') ||
          lowerMsg.includes('substitute') ||
          lowerMsg.includes('replace') ||
          lowerMsg.includes('alternative') ||
          lowerMsg.includes('instead of') ||
          lowerMsg.includes('briefing') ||
          lowerMsg.includes('warm') ||
          lowerMsg.includes('tempo')) &&
        !lowerMsg.includes('why') &&
        !lowerMsg.includes('formula') &&
        !lowerMsg.includes('calculat') &&
        !lowerMsg.includes('worked out') &&
        !lowerMsg.includes('how are') &&
        !lowerMsg.includes('how does') &&
        !lowerMsg.includes('hypertrophy') &&
        !lowerMsg.includes('multiplier') &&
        !lowerMsg.includes('citation') &&
        !lowerMsg.includes('academic') &&
        !lowerMsg.includes('retention shield') &&
        !lowerMsg.includes('scale') &&
        !lowerMsg.includes('diary') &&
        !lowerMsg.includes('measure') &&
        !lowerMsg.includes('recomp') &&
        !lowerMsg.includes('shirt off') &&
        !lowerMsg.includes('progress') &&
        !lowerMsg.includes('app do') &&
        !lowerMsg.includes('plan for me') &&
        !lowerMsg.includes('just show up') &&
        !lowerMsg.includes('how does the app') &&
        !lowerMsg.includes('science');
      const isPersonalTelemetryQuery =
        !asksConceptOrRuleDefinition &&
        !/\b(formula|calculat\w*|worked out|why|explain|science)\b/i.test(lowerMsg) &&
        (lowerMsg.includes('my') ||
          lowerMsg.includes('today') ||
          lowerMsg.includes('current') ||
          lowerMsg.includes('score') ||
          lowerMsg.includes('what was') ||
          lowerMsg.includes('what is') ||
          lowerMsg.includes('how was') ||
          lowerMsg.includes('how much')) &&
        (lowerMsg.includes('recovery') ||
          lowerMsg.includes('strain') ||
          lowerMsg.includes('hrv') ||
          lowerMsg.includes('sleep') ||
          lowerMsg.includes('whoop') ||
          lowerMsg.includes('fitbit') ||
          lowerMsg.includes('readiness'));

      // Explicit "why / how does / formula / framework" questions get the full science card.
      // Guard "what is / what's" when the athlete asks about their own personal metric ("What is my squat level?").
      const asksPersonalMetricWithWhatIs =
        /\b(what is|what's|what are)\s+my\b/i.test(lowerMsg) &&
        !/\b(formula|calculat\w*|worked out|science|multiplier|why|explain)\b/i.test(lowerMsg);
      const isExplicitScienceQuestion =
        !asksPersonalMetricWithWhatIs &&
        (asksConceptOrRuleDefinition ||
          /\b(why|how does|how do|formula|what is|what's|explain|science|research|studies|study|calculat\w*|worked out|measured|citation|framework\w*|behind the|kilgore|poliquin|exrx|grindem|acwr|gabbett|junk volume|cross-implement|movement vector)\b/.test(
            lowerMsg
          ));
      // "How is my progress?" is about the athlete's own data, not a science card.
      const isOwnProgressQuestion = /\b(progress|progressing|improv\w*|stronger|getting better|gains?|prs?|personal (best|record)s?)\b/i.test(lowerMsg);

      // Levels, balance and left/right questions about the athlete's own lifts: answered from their
      // data (movement standards), never by the model. "Why / how is it worked out" still gets the card.
      const isStandardsQuestion =
        /\b(my level|levels?|strength standards?|how strong|tier|tiers|untrained|novice|intermediate|advanced|elite|(?:squat|bench|deadlift|press|overhead press|ohp|chin-?up|pull-?up) (?:standard|level)|imbalanc\w*|balanced?|asymmetr\w*|left vs\.? right|unilateral|weaker side|weak side|left side|right side|one side|weak link|lagging|(weakest|strongest|best|worst) (lift|lifts|exercise|movement)|weak points?)\b/i.test(
          lowerMsg
        );
      // "What's my bench 1RM?" and "what's my DOTS score?" ask for the athlete's own number, not a formula.
      const asksHowItWorks = /\b(why|how|formula|explain|science|research|calculat\w*|worked out|framework\w*|behind)\b/.test(lowerMsg);
      const asksForOwnMax = /\bmy\b.*\b(e?1\s?rm|one[\s-]rep\s*max|estimated\s*max)\b/.test(lowerMsg) && !asksHowItWorks;
      const asksForOwnScore = /\bmy\b.*\b(dots|strength\s*score)\b/.test(lowerMsg) && !asksHowItWorks;
      const asksOwnAttributes =
        /\b(my|what are my)\b.*\b(attributes?|stats|profile|overview|metrics|numbers)\b/.test(lowerMsg) &&
        !isExplicitScienceQuestion;
      const isDedicatedDomainGuide =
        /\b(scale\s*weight|scale\s*flat|scale\s*not\s*moving|why\s*isn'?t\s*(my|the)\s*scale|measure\s*progress|weigh\s*myself|weigh\s*in|take\s*measurements|body\s*recomp|recomposition|shirt\s*off|measuring\s*progress|training\s*diary|paper\s*diary|gym\s*notebook|what\s*(does\s*)?(the\s*)?app\s*(do|does)|plan(ning)?\s*(for\s*me|from\s*week\s*to\s*week)|just\s*show\s*up|paper\s*log|track(s)?\s*(my|your)?\s*weights|smart\s*scale|smart\s*scales|measuring\s*devices?|smart\s*measuring|smart\s*tape|renpho|friction\s*free\s*track)\b/i.test(
          lowerMsg
        );

      const namesTodayExercise = (activeWorkout?.exercises ?? []).some((e) => exerciseNamedIn(lowerMsg, e.name));

      const candidatePrinciple =
        !isExplicitActionIntent &&
        !asksForOwnMax &&
        !asksForOwnScore &&
        !asksOwnAttributes &&
        !isDedicatedDomainGuide &&
        !(namesTodayExercise && !isExplicitScienceQuestion) &&
        !(isStandardsQuestion && !isExplicitScienceQuestion && !isTacticalWorkoutQuery) &&
        !isTacticalWorkoutQuery &&
        !isPersonalTelemetryQuery
          ? queryExerciseScienceKnowledgeBase(lowerMsg)
          : null;
      const scientificPrinciple =
        candidatePrinciple &&
        (isExplicitScienceQuestion || (!isOwnProgressQuestion && !(await isOnDeviceModelReady())))
          ? candidatePrinciple
          : null;
      if (!isExplicitActionIntent && asksOwnAttributes) {
        const unit = profile.weightUnit || 'kg';
        const planPos = planPosition(profile, workouts, input.activities ?? []);
        const hasBw = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
        const athleteAge = standardsAge(profile);
        const parts = [
          `Goal: ${GOAL_DISPLAY_NAME[profile.goalPhase] ?? profile.goalPhase}`,
          `Plan: ${planPos.plan.name} (Week ${planPos.week} of ${planPos.totalWeeks})`,
          hasBw ? `7-day avg weight: ${formatPreciseWeight(bodyweightEmaKg, unit)}` : 'Weight: not logged yet',
          athleteAge ? `Age group: ${athleteAge} (${profile.gender === 'female' ? 'Female' : 'Male'} standards)` : `${profile.gender === 'female' ? 'Female' : 'Male'} standards`,
          `Recovery: ${readinessState === 'Amber Shield' ? 'low' : readinessState === 'Primed' ? 'high' : 'normal'}${kg.recoveryEfficiencyScore > 0 ? ` (${kg.recoveryEfficiencyScore}%)` : ''}`,
        ];
        if (kg.stepsSummary.avg7d !== undefined) parts.push(`7-day steps avg: ${kg.stepsSummary.avg7d.toLocaleString()}/day`);
        answerText = `Your current profile and metrics:\n• ${parts.join('\n• ')}`;
      } else if (!isExplicitActionIntent && asksForOwnMax) {
        answerText = buildEstimatedMaxAnswer(lowerMsg, workouts, measuredBodyweightKg, profile.weightUnit || 'kg', biometrics, activeWorkout, exerciseCatalog);
      } else if (!isExplicitActionIntent && asksForOwnScore) {
        answerText = `Treise compares each lift with published strength standards instead of giving one score.\n\n${strengthLevelsAnswer()}`;
      } else if (!isExplicitActionIntent && isStandardsQuestion && !isExplicitScienceQuestion && !isTacticalWorkoutQuery) {
        answerText = strengthLevelsAnswer();
      } else if (!isExplicitActionIntent && scientificPrinciple) {
        scientificPrinciplesCited.push(scientificPrinciple);
        const unit = profile.weightUnit || 'kg';
        const liveNotes: string[] = [];
        if (scientificPrinciple.id === 'sp-double-progression') {
          const stepBar = formatWeight(PROGRESSION_RULES.barbellIncrementKg, unit);
          const stepDb = unit === 'lb' ? '5 lb' : `${PROGRESSION_RULES.dumbbellIncrementKg} kg per dumbbell`;
          liveNotes.push(`In your ${unit} setting, barbells/cables step by ${stepBar} and dumbbells by ${stepDb}.`);
        } else if (scientificPrinciple.id === 'sp-bw-ema' && hasMeasuredBw) {
          liveNotes.push(`Your current 7-day average bodyweight is ${formatPreciseWeight(bodyweightEmaKg, unit)}.`);
        } else if (scientificPrinciple.id === 'sp-readiness-zscore') {
          const score = kg.recoveryEfficiencyScore > 0 ? ` (${kg.recoveryEfficiencyScore}%)` : '';
          liveNotes.push(`Today's readiness state is **${readinessState}**${score}.`);
        } else if (scientificPrinciple.id === 'sp-rest-intervals' && activeWorkout.exercises.length > 0) {
          const firstEx = activeWorkout.exercises[0];
          const restSecs = firstEx.restSeconds ?? (firstEx.isIsolation ? 90 : 150);
          liveNotes.push(`Today's opener (${firstEx.name}) is timed for ${Math.round(restSecs)}s rest between working sets.`);
        } else if (scientificPrinciple.id === 'sp-tempo-codes' && activeWorkout.exercises.length > 0) {
          const tempoEx = activeWorkout.exercises.find((e) => e.tempo && /^\d{4}$/.test(e.tempo));
          if (tempoEx) liveNotes.push(`In today's session, ${tempoEx.name} uses **${tempoEx.tempo}** tempo.`);
        } else if (scientificPrinciple.id === 'sp-wci') {
          const lastDone = [...workouts].filter((w) => w.completed).pop();
          if (lastDone) {
            const { tonnageKg } = calculateSessionTonnage(lastDone, hasMeasuredBw ? bodyweightEmaKg : 0);
            if (tonnageKg > 0) liveNotes.push(`Your last finished workout (${lastDone.name}) totaled **${formatWeight(tonnageKg, unit)}**.`);
          }
        }
        answerText = `${scientificPrinciple.title}\n\n${scientificPrinciple.scientificRationale}\n\n`;
        if (scientificPrinciple.formula) {
          answerText += `Scientific Formula:\n${scientificPrinciple.formula}\n\n`;
        }
        answerText += `How Treise applies this:\n${scientificPrinciple.practicalApplication}`;
        if (liveNotes.length > 0) {
          answerText += `\n\nWith your data:\n${liveNotes.join(' ')}`;
        }
        answerText += `\n\nAcademic Citation:\n${scientificPrinciple.academicCitation}`;

        citations.push({
          label: scientificPrinciple.title,
          metric: 'Scientific Grounding',
          value: scientificPrinciple.academicCitation,
        });
        if (scientificPrinciple.formula) {
          citations.push({
            label: 'Formula Model',
            metric: 'Calculation',
            value: scientificPrinciple.formula,
          });
        }
      }

      // C. Recovery, Strain & Autonomic Telemetry Query (direct telemetry checks; open sleep/recovery/motivation tips go to Gemini when available)
      else if (
        !isExplicitActionIntent &&
        (lowerMsg.includes('recovery') ||
          lowerMsg.includes('strain') ||
          lowerMsg.includes('hrv') ||
          lowerMsg.includes('sleep') ||
          lowerMsg.includes('readiness') ||
          lowerMsg.includes('pulse') ||
          lowerMsg.includes('heart') ||
          lowerMsg.includes('whoop') ||
          lowerMsg.includes('fitbit') ||
          lowerMsg.includes('health connect') ||
          lowerMsg.includes('wearable') ||
          lowerMsg.includes('watch')) &&
        (!(
          /\b(tips?|advice|how (?:can|do|should) i (?:improve|get better|sleep|recover|boost|fix)|better sleep|sleep better|recover faster|why does|motivat\w*|routine|habits?|strategies)\b/.test(
            lowerMsg
          ) &&
          !/\b(my recovery|how(?:'?s| is) my (?:recovery|sleep|hrv|strain|readiness|whoop|watch)|recovery score|strain score|did .* sync|what was my)\b/.test(
            lowerMsg
          )
        ) ||
          !(await isOnDeviceModelReady()))
      ) {
        const latest = biometrics[biometrics.length - 1];
        const readings = recoveryReadingsClause(latest);
        // The same score as the recovery card on the Workout page.
        const scoreText = kg.recoveryEfficiencyScore > 0 ? ` (recovery score ${kg.recoveryEfficiencyScore}%)` : '';
        const recScore = latest?.recoveryScore;
        const workoutStrain = latest?.workoutStrain;
        const dayStrain = latest?.strain;
        const kilojoules = latest?.kilojoules;

        const isWhoop = profile.whoopConnected || recScore !== undefined || workoutStrain !== undefined;
        const zoneLabel =
          typeof recScore === 'number'
            ? recScore >= 67
              ? 'Green'
              : recScore >= 34
              ? 'Yellow'
              : 'Red'
            : readinessState === 'Primed'
            ? 'Green'
            : readinessState === 'Amber Shield'
            ? 'Red'
            : 'Yellow';

        if (lowerMsg.includes('strain')) {
          if (workoutStrain !== undefined) {
            answerText = `Your Whoop workout strain is ${workoutStrain}${dayStrain ? ` (Day Strain: ${dayStrain})` : ''}${kilojoules ? ` with ${kilojoules} kJ burned` : ''}. Combined with your ${recScore !== undefined ? `${recScore}% ${zoneLabel}` : 'current'} recovery, your stimulus-to-fatigue ratio is balanced. Standard progressive double progression applies.`;
          } else if (dayStrain !== undefined) {
            answerText = `Your Whoop day strain is ${dayStrain}${kilojoules ? ` with ${kilojoules} kJ energy burned` : ''}. Combined with your ${recScore !== undefined ? `${recScore}% ${zoneLabel}` : 'current'} recovery, your recovery capacity matches today's prescribed training volume.`;
          } else {
            answerText = `Your daily strain is currently balanced with your recovery. Complete today's session to capture your full cardiovascular and muscular workout strain.`;
          }
        } else if (recScore !== undefined) {
          if (recScore >= 67) {
            answerText = `Your Whoop recovery is at ${recScore}% (${zoneLabel} zone)${readings}. You're well recovered, so it's a good day to push the weight on your working sets.`;
          } else if (recScore >= 34) {
            answerText = `Your Whoop recovery is at ${recScore}% (${zoneLabel} zone)${readings}. Your autonomic nervous system is in a balanced baseline. Follow your standard 1–2 RIR double progression targets.`;
          } else {
            answerText = `Your Whoop recovery is at ${recScore}% (${zoneLabel} zone, Amber Shield active)${readings}. Systemic fatigue has accumulated. Working weights are held steady with 2–3 reps left in reserve to prevent joint burnout and protect your streak.`;
          }
        } else if (readinessState === 'Primed') {
          answerText = `Your recovery is high today${scoreText}${readings}. You're well recovered, so it's a good day to push the weight on your first working sets.`;
        } else if (readinessState === 'Amber Shield') {
          answerText = `Your recovery is low today${scoreText}${readings}. Your central nervous system needs lighter effort today. Working weights are held steady with 2–3 reps left in reserve to prevent joint burnout and protect your streak.`;
        } else if (kg.recoveryEfficiencyScore > 0) {
          answerText = `Your recovery looks normal${scoreText}${readings}. Follow today's targets as planned.`;
        } else {
          answerText = `I don't have any recovery data from a watch yet, so your plan runs at normal effort. Connect a Pixel Watch, Fitbit or Whoop in Profile → Settings → Wearable & Recovery and I'll adjust each day to your sleep and heart rate. Meanwhile, your workout page shows when each muscle group has recovered from your last session.`;
        }

        citations.push({
          label: isWhoop ? 'Whoop Recovery' : 'Daily Readiness',
          metric: 'Status',
          value: recScore !== undefined ? `${recScore}% (${zoneLabel})` : readinessState,
        });
        if (workoutStrain !== undefined) {
          citations.push({
            label: 'Workout Strain',
            metric: 'Strain Score',
            value: `${workoutStrain} (Whoop)`,
          });
        }
        if (kg.recoveryEfficiencyScore > 0) {
          citations.push({
            label: 'Recovery Score',
            metric: 'Today',
            value: `${kg.recoveryEfficiencyScore}%`,
          });
        }
      }

      // D. Hypertrophy Muscle Volume Query
      else if (!isExplicitActionIntent && /\b(volume|sets|mav)\b/.test(lowerMsg)) {
        const matchedMuscle = kg.muscleProfiles.find((m) =>
          lowerMsg.includes(m.displayName.toLowerCase()) || lowerMsg.includes(m.muscleKey.toLowerCase())
        ) || kg.muscleProfiles[0];
        if (!matchedMuscle) {
          answerText = answerWeeklySets(lowerMsg, kg);
        } else {

        answerText = answerWeeklySets(lowerMsg, kg);

        citations.push({
          label: matchedMuscle.displayName,
          metric: 'This week',
          value: `${matchedMuscle.weeklySets} of ${matchedMuscle.personalizedMav[0]}–${matchedMuscle.personalizedMav[1]} hard sets`,
        });
        citations.push({
          label: 'Full Stretch Stimulus',
          metric: 'Lengthened Ratio',
          value: `${kg.lengthenedStimulusRatio}% of sets`,
        });
        }
      } else if (
        !isExplicitActionIntent &&
        /\b(protein|eat|eating|ate|meals?|diet|nutrition|food|snack)\b/.test(lowerMsg) &&
        (!/\b(recipes?|meal prep|ideas?|breakfast|lunch|dinner|vegan|vegetarian|high[- ]?protein (?:meals?|foods?|snacks?))\b/.test(
          lowerMsg
        ) ||
          !(await isOnDeviceModelReady()))
      ) {
        const isPreWorkout = /\b(before|pre[\s-]?workout|pre[\s-]?training|prior to)\b/.test(lowerMsg);
        const isPostWorkout = /\b(after|post[\s-]?workout|post[\s-]?training)\b/.test(lowerMsg);
        // A gram figure needs a logged bodyweight; without one, only the per-kg guidance is given.
        const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
        const dailyProtein = Math.round(bodyweightEmaKg * (profile.goalPhase === 'Cut / Recomp' ? 2.2 : 2.0));
        const gramsNote = hasWeighIn ? ` (about ${dailyProtein} g)` : '';
        if (isPreWorkout) {
          answerText =
            '1–2 hours before training, eat a normal meal with carbs and some protein, like rice and chicken, oats with yogurt, or a sandwich. ' +
            'If you only have 30–60 minutes, keep it small and easy to digest, like a banana or toast. Go light on fat and fibre right before so your stomach feels settled.';
        } else if (isPostWorkout) {
          answerText = `After training, have a meal with 20–40 g of protein and some carbs within a few hours, like eggs on toast or a chicken and rice bowl. Your total for the day matters most: ${hasWeighIn ? `about ${dailyProtein} g of protein` : 'about 2 g of protein per kg of bodyweight (log your weight in Progress for a figure in grams)'}.`;
        } else {
          answerText =
            profile.goalPhase === 'Cut / Recomp'
              ? `While losing fat, aim for about 2.0–2.4 g of protein per kg of bodyweight a day${gramsNote} to keep your muscle.`
              : `To build muscle, aim for about 1.8–2.2 g of protein per kg of bodyweight a day${gramsNote}, with carbs around your workouts.`;
        }
      } else if (
        /\b(scale\s*weight|scale\s*flat|scale\s*not\s*moving|why\s*isn'?t\s*(my|the)\s*scale|measure\s*progress|weigh\s*myself|weigh\s*in|take\s*measurements|body\s*recomp|recomposition|shirt\s*off|measuring\s*progress)\b/i.test(
          lowerMsg
        )
      ) {
        const recompPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find(
          (p) => p.id === 'sp-scale-weight-measurements'
        );
        if (recompPrinciple) {
          scientificPrinciplesCited.push(recompPrinciple);
          citations.push({
            label: recompPrinciple.title,
            metric: 'Scientific Grounding',
            value: recompPrinciple.academicCitation,
          });
        }
        answerText =
          `When you are resistance training, **scale weight tells only part of the story** — how you look with your shirt off and how your lifts move tell far more.\n\n` +
          `Muscle tissue is ~18% denser than fat (~1.06 g/mL vs ~0.90 g/mL). If you are building lean muscle while losing body fat (body recomposition), total scale weight can stay flat even while your body composition visibly improves.\n\n` +
          `**How to track progress accurately:**\n` +
          `1. **Morning Weigh-Ins:** Weigh yourself first thing in the morning on the same scale under consistent conditions (after using the bathroom, before food or water). Treise tracks a 7-day rolling average to filter out normal water and glycogen swings.\n` +
          `2. **Circumference Measurements:** Take tape measurements (waist, chest, arms). A narrowing waist alongside steady or growing arms confirms real muscle gain and visceral fat reduction.\n` +
          `3. **Progressive Overload in the App:** If your workout weights and reps are advancing from week to week, you are building new contractile muscle tissue.`;
      } else if (
        /\b(training\s*diary|paper\s*diary|gym\s*notebook|what\s*(does\s*)?(the\s*)?app\s*(do|does)|plan(ning)?\s*(for\s*me|from\s*week\s*to\s*week)|just\s*show\s*up|paper\s*log|track(s)?\s*(my|your)?\s*weights)\b/i.test(
          lowerMsg
        )
      ) {
        const diaryPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find(
          (p) => p.id === 'sp-progress-tracking-diary'
        );
        if (diaryPrinciple) {
          scientificPrinciplesCited.push(diaryPrinciple);
          citations.push({
            label: diaryPrinciple.title,
            metric: 'Scientific Grounding',
            value: diaryPrinciple.academicCitation,
          });
        }
        const stepLabel = formatWeight(PROGRESSION_RULES.barbellIncrementKg, profile.weightUnit || 'kg');
        answerText =
          `Treise replaces the traditional paper training diary — you just need to show up and lift while the app handles the planning from week to week:\n\n` +
          `• **Automated Tracking:** Logs your weights, sets, reps, tempo, and rest intervals.\n` +
          `• **Double Progression:** Advances reps inside your range or steps up weight (${stepLabel} on barbells) once all working sets hit the target.\n` +
          `• **Life-Proof Queue:** Missed sessions wait without losing progress and adapt cleanly across Gym, Home, or Bodyweight workouts.`;
      } else if (
        /\b(smart\s*scale|smart\s*scales|measuring\s*devices?|smart\s*measuring|smart\s*tape|renpho|friction\s*free\s*track)\b/i.test(
          lowerMsg
        )
      ) {
        const smartPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find(
          (p) => p.id === 'sp-smart-device-integration'
        );
        if (smartPrinciple) {
          scientificPrinciplesCited.push(smartPrinciple);
          citations.push({
            label: smartPrinciple.title,
            metric: 'Scientific Grounding',
            value: smartPrinciple.academicCitation,
          });
        }
        answerText =
          `Treise makes body tracking friction-free with direct smart-device capture or quick manual logging:\n\n` +
          `• **RENPHO Smart Scale (Bluetooth):** Connect your RENPHO scale in **Progress → Body weight → Log weight** via Web Bluetooth (or Android native BLE) to capture weight, body fat %, and lean mass directly, or say "Log weight 80 kg" right here.\n` +
          `• **RENPHO Smart Body Tape Measure:** Capture all 12 circumference sites (Neck, Shoulder, Chest, Waist, Abdomen, Hip, Biceps, Thighs, Calves) in **Progress → Measurements**, or log any site in chat (e.g. "Log waist 82 cm").\n` +
          `• **Wearable Telemetry:** Syncs with Fitbit, Whoop, Strava, and Android Health Connect to feed daily recovery readiness, sleep, steps, and active days into your plan.`;
      } else if (
        /^(hi|hello|hey|heya|howdy|greetings|good\s*(morning|afternoon|evening)|help|who\s*are\s*you|what\s*can\s*you\s*do)\b/i.test(
          lowerMsg
        ) && lowerMsg.split(/\s+/).length <= 6
      ) {
        // Conversational Welcome & Capabilities Intent
        const workoutNameForGreeting = (activeWorkout?.exercises[0]?.name ?? 'a squat').toLowerCase();
        // Per Personalisation & Memory Guidelines §4 (Name Use): never repeat the athlete's name at the start of a chat.
        answerText = `I'm Treise — I have your plan, logged workouts, body composition, and recovery ready, and I can update them directly.\n\nThings you can ask or tell me to do:\n• "What am I lifting today?" or "Log 24 kg × 10 @ 2 RIR on ${workoutNameForGreeting}"\n• "Swap ${workoutNameForGreeting} across my whole program" or "Rebalance my program"\n• "Shorten today's workout" or "Switch to bodyweight today"\n• "Set a 100 kg bench press goal" or "Log waist 82 cm"\n• "Why did my weight change?" or "What does tempo 3010 mean?"\n\nWhat would you like to check or update?`;
      } else {
        // ============================================================================
        // 8. ATHLETIC COACHING & TACTICAL GUIDANCE
        // ============================================================================
        let nanoHandled = false;
        let flashHistoryRecorded = false;
        const workoutExercises = activeWorkout?.exercises || [];

        // Questions explicitly about the athlete's own progress or PRs are answered from their logged
        // history, while open coaching questions containing "improving" / "gains" still reach Gemini.
        const isExplicitOwnProgressQuery =
          /\b((?:am i|how(?:'?s| is| are)|check|show|summarize|tell me about)\s+(?:my\s+|i\s+)?(?:progress\w*|improv\w*|getting\s+(?:stronger|better)|gains?|prs?|personal\s+(?:best|record)s?)|(?:my|recent)\s+(?:prs?|personal\s+(?:best|record)s?|progress|gains?))\b/i.test(
            lowerMsg
          ) || /^(?:progress|prs?|personal\s+(?:best|record)s?)\??$/i.test(lowerMsg.trim());
        const isLooseProgressQuery = /\b(progress|progressing|improv\w*|stronger|getting better|gains?|prs?|personal (best|record)s?)\b/i.test(lowerMsg);
        const isProgressQuery =
          !isExplicitActionIntent &&
          (isExplicitOwnProgressQuery || (isLooseProgressQuery && !(await isOnDeviceModelReady())));
        if (isProgressQuery) {
          answerText = buildProgressSummary(workouts, profile.weightUnit || 'kg');
          nanoHandled = true;
        }

        // A. Function calling (Gemini Flash-Lite tool calling) for explicit action intents + open coaching,
        //    or Chrome on-device LanguageModel for non-action open questions when available.
        //    NEVER invoked when opts?.suppressModel is set (pain/injury safety guardrail).
        if (!opts?.suppressModel && !nanoHandled && (!isTacticalWorkoutQuery || isExplicitActionIntent)) {

          const groundingPrinciple = queryExerciseScienceKnowledgeBase(userMessage);
          const groundingFacts = groundingPrinciple
            ? `- ${groundingPrinciple.title}${groundingPrinciple.formula ? ` (${groundingPrinciple.formula})` : ''}: ${groundingPrinciple.practicalApplication}${groundingPrinciple.academicCitation ? ` [Source: ${groundingPrinciple.academicCitation}]` : ''}`
            : '';

          const systemPrompt = buildCoachSystemPrompt(input);
          // When the question names one of today's exercises, give the model that exercise's own cue,
          // so technique advice comes from the exercise library rather than the model's guess.
          const namedToday = findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.session;
          const namedDef = namedToday ? exerciseCatalog.find((d) => d.id === namedToday.exerciseId) : undefined;
          const cue = namedToday ? [namedDef?.whyItWorks, namedToday.notes].filter(Boolean).join(' ').slice(0, 220) : '';
          const factsForQuestion = [groundingFacts.replace(/^- /, ''), cue ? `${namedToday!.name} (${namedToday!.equipment}): ${cue}` : '']
            .filter(Boolean)
            .join(' ');
          const questionWithFacts = factsForQuestion ? `${userMessage}\n(Useful fact: ${factsForQuestion})` : userMessage;

          // Each muscle trained today, named by itself and by today's exercises for it.
          const muscleClaims = kg.muscleProfiles.map((m) => ({
            status: muscleTargetStatus(m),
            names: [
              m.displayName.toLowerCase(),
              ...workoutExercises
                .filter((e) => {
                  const pm = exerciseCatalog.find((d) => d.id === e.exerciseId)?.primaryMuscle;
                  return pm ? MUSCLE_TO_GRAPH_KEY[pm] === m.muscleKey : false;
                })
                .flatMap((e) => [e.name.toLowerCase(), e.name.toLowerCase().replace(/^(dumbbell|db|cable|barbell|machine|seated)\s+/, '').replace(/s$/, '')]),
            ],
          }));
          // Why an answer can't be shown, in words the model can act on.
          const problemWith = (answer: string): string | null =>
            !runReadAloudQaGate(answer).passed
              ? 'it used hype, a cliché or judgmental wording; write like a pragmatic coach'
              : !acceptCoachAnswer(answer, `${systemPrompt} ${questionWithFacts}`)
              ? 'it used a number, weight or percentage that is not in the facts'
              : contradictsMuscleTargets(answer, muscleClaims)
              ? "it described a muscle's weekly sets differently from the status given"
              : claimsInventedPastResults(answer)
              ? 'it said how past sets or reps went, which is not known'
              : misnamesEquipment(answer, workoutExercises)
              ? 'it named the wrong equipment for an exercise'
              : changesPlanWeight(answer)
              ? 'it told the athlete to choose or change a weight, but the plan sets every weight'
              : contradictsRecovery(answer, readinessState)
              ? `it went against today's recovery, which is ${readinessState === 'Amber Shield' ? 'low' : readinessState === 'Primed' ? 'high' : 'normal'}`
              : genericRepTarget(answer, workoutExercises)
              ? 'it gave a rep target without naming the exercise it belongs to'
              : contradictsPlanSchedule(answer)
              ? 'it suggested training every day, but the plan is 4 sessions a week'
              : null;
          // The answer is shown as it is written, but only while it still passes the checks: the
          // moment it stops passing, the stream is withdrawn (an empty partial) and "Thinking…" shows
          // until the checked answer, or the data-based one, is ready.
          let streamWithdrawn = false;
          const showWhileSound = (textSoFar: string) => {
            if (streamWithdrawn) return;
            if (problemWith(textSoFar)) {
              streamWithdrawn = true;
              input.onPartial?.('');
              return;
            }
            input.onPartial?.(textSoFar);
          };
          const runStructuredFlashLite = async (): Promise<void> => {
            const startedAt = Date.now();
            const executeStructuredTools = async (
              res: NonNullable<Awaited<ReturnType<typeof promptFlashLiteStructured>>>
            ): Promise<boolean> => {
              const calls = res.toolCalls?.length
                ? res.toolCalls
                : res.functionCall
                  ? [res.functionCall]
                  : [];
              if (calls.length === 0) return false;
              const toolOutcome =
                calls.length > 1
                  ? await executeCoachToolCalls(calls, toolCtx)
                  : await executeCoachToolCall(calls[0].name, calls[0].args, toolCtx);
              if (!toolOutcome) return false;
              applyToolOutcome(toolOutcome);
              modelSuggestedActions = res.suggestedActions;
              recordFlashLiteExchange(
                userMessage,
                enforceMutationTruthfulness(toolOutcome.summaryText, toolOutcome.mutationStatus)
              );
              flashHistoryRecorded = true;
              nanoHandled = true;
              return true;
            };

            let structured = await promptFlashLiteStructured(questionWithFacts, {
              systemPrompt,
              tools: COACH_TOOL_DECLARATIONS,
            });
            if (structured && (await executeStructuredTools(structured))) {
              return;
            }
            if (!structured?.text) return;

            let problem = problemWith(structured.text);
            if (problem) {
              forgetLastFlashLiteExchange();
              if (Date.now() - startedAt < RETRY_IF_FASTER_THAN_MS) {
                structured = await promptFlashLiteStructured(
                  `${questionWithFacts}\n(Your last answer could not be used because ${problem}. Answer again in 2-4 short sentences, using only the facts given.)`,
                  {
                    systemPrompt,
                    tools: COACH_TOOL_DECLARATIONS,
                  }
                );
                if (structured && (await executeStructuredTools(structured))) {
                  return;
                }
                problem = structured?.text ? problemWith(structured.text) : 'empty reply';
                if (problem && structured?.text) {
                  forgetLastFlashLiteExchange();
                }
              }
            }
            if (!problem && !nanoHandled && structured?.text) {
              answerText = structured.text;
              modelSuggestedActions = structured.suggestedActions;
              flashHistoryRecorded = true;
              nanoHandled = true;
              for (const ex of workoutExercises) {
                if (
                  lowerMsg.includes(ex.name.toLowerCase()) ||
                  structured.text.toLowerCase().includes(ex.name.toLowerCase())
                ) {
                  citations.push({
                    label: ex.name,
                    metric: 'Target Load & Reps',
                    value: `${formatWeight(ex.sets.find((st) => !st.isWarmup && st.setType !== 'warmup')?.targetWeightKg ?? 0, profile.weightUnit || 'kg')}${usesTwoDumbbells(ex) ? ' each' : ''} × ${ex.minReps}–${ex.maxReps} reps`,
                  });
                  break;
                }
              }
            }
          };

          const onDeviceStatus = await getOnDeviceModelStatus();
          let handledByStructuredFlash = false;
          if ((onDeviceStatus !== 'available' || isExplicitActionIntent) && (await isFlashLiteReady())) {
            handledByStructuredFlash = true;
            await runStructuredFlashLite();
          }

          if (!handledByStructuredFlash && !isTacticalWorkoutQuery && !isExplicitActionIntent) {
            const startedAt = Date.now();
            let nanoAnswer = await promptOnDeviceModel(systemPrompt, questionWithFacts, {
              onPartial: showWhileSound,
              onDownloadProgress: input.onDownloadProgress,
            });
            let problem = nanoAnswer ? problemWith(nanoAnswer) : null;
            if (nanoAnswer && problem) {
              forgetOnDeviceExchange();
              input.onPartial?.('');
              streamWithdrawn = false;
              if (Date.now() - startedAt < RETRY_IF_FASTER_THAN_MS) {
                nanoAnswer = await promptOnDeviceModel(
                  systemPrompt,
                  `${questionWithFacts}\n(Your last answer could not be used because ${problem}. Answer again in 2-4 short sentences, using only the facts given.)`,
                  { onPartial: showWhileSound }
                );
                problem = nanoAnswer ? problemWith(nanoAnswer) : null;
                if (nanoAnswer && problem) {
                  forgetOnDeviceExchange();
                  input.onPartial?.('');
                }
              }
            }
            if (nanoAnswer && !problem) {
              answerText = nanoAnswer;
              nanoHandled = true;

              for (const ex of workoutExercises) {
                if (
                  lowerMsg.includes(ex.name.toLowerCase()) ||
                  nanoAnswer.toLowerCase().includes(ex.name.toLowerCase())
                ) {
                  citations.push({
                    label: ex.name,
                    metric: 'Target Load & Reps',
                    value: `${formatWeight(ex.sets.find((st) => !st.isWarmup && st.setType !== 'warmup')?.targetWeightKg ?? 0, profile.weightUnit || 'kg')}${usesTwoDumbbells(ex) ? ' each' : ''} × ${ex.minReps}–${ex.maxReps} reps`,
                  });
                  break;
                }
              }
            } else if (onDeviceStatus === 'available' && (await isFlashLiteReady())) {
              await runStructuredFlashLite();
            }
          }
        }

        // B0. Open questions the model couldn't answer well: a fact-based answer on the same topic,
        // rather than the general briefing.
        if (!nanoHandled && !isTacticalWorkoutQuery) {
          const named = findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.session;
          if (named) {
            const working = named.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup');
            const def = exerciseCatalog.find((d) => d.id === named.exerciseId);
            const first = working[0];
            const rir = readinessState === 'Amber Shield' ? '2–3' : `${first?.targetRir ?? 2}`;
            const namedBrief = cardLines(named);
            const pairSuffix = usesTwoDumbbells(named) && (first?.targetWeightKg ?? 0) > 0 ? ' each' : '';
            answerText = first
              ? `For ${named.name} today: ${working.length} sets of ${first.targetReps} reps at ${first.targetWeightKg > 0 ? `${formatWeight(first.targetWeightKg, profile.weightUnit || 'kg')}${pairSuffix}` : 'bodyweight'}, stopping with ${rir} reps to spare. ${namedBrief[1]} ${def?.whyItWorks ?? ''} The weight goes up by itself once every set reaches ${named.maxReps} reps.`.replace(/\s+/g, ' ').trim()
              : `${named.name} is in today's workout. ${def?.whyItWorks ?? ''}`.trim();
            nanoHandled = true;
          } else if (/\b(flat|tired|exhausted|drained|no energy|low energy|push (hard|it)|go hard|sluggish)\b/.test(lowerMsg)) {
            answerText = `${answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState)} If you feel off once you start, keep the planned weight and stop with an extra rep or two to spare; the plan adjusts from what you log.`;
            nanoHandled = true;
          } else if (/\b(motivat\w*|consisten\w*|habit|keep going|stick with)\b/.test(lowerMsg)) {
            answerText = `${answerStreak(workouts, input.activities ?? [])} ${answerPlanPosition(profile, workouts, input.activities ?? [])}`;
            nanoHandled = true;
          }
        }

        // B. On-Device Semantic Athletic Engine Fallback (Zero Latency, 100% Deterministic)
        if (!nanoHandled) {
          const matchedWorkoutEx = findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.session ?? workoutExercises.find((e) =>
            lowerMsg.includes(e.name.toLowerCase()) ||
            exerciseNamedIn(lowerMsg, e.name) ||
            (lowerMsg.includes('bench') && e.name.toLowerCase().includes('bench')) ||
            (lowerMsg.includes('incline') && e.name.toLowerCase().includes('incline')) ||
            (lowerMsg.includes('squat') && e.name.toLowerCase().includes('squat')) ||
            (lowerMsg.includes('deadlift') && e.name.toLowerCase().includes('deadlift')) ||
            (lowerMsg.includes('rdl') && (e.name.toLowerCase().includes('rdl') || e.isRdl)) ||
            (lowerMsg.includes('overhead') && e.name.toLowerCase().includes('overhead')) ||
            (lowerMsg.includes('ohp') && (e.name.toLowerCase().includes('press') || e.pillar === 'Vertical Push')) ||
            (lowerMsg.includes('pull up') && (e.name.toLowerCase().includes('pull-up') || e.name.toLowerCase().includes('chin'))) ||
            (lowerMsg.includes('pulldown') && e.name.toLowerCase().includes('pulldown')) ||
            (lowerMsg.includes('row') && e.name.toLowerCase().includes('row')) ||
            (lowerMsg.includes('lateral raise') && e.name.toLowerCase().includes('lateral')) ||
            (lowerMsg.includes('curl') && e.name.toLowerCase().includes('curl')) ||
            (lowerMsg.includes('tricep') && e.name.toLowerCase().includes('tricep')) ||
            (lowerMsg.includes('pushdown') && e.name.toLowerCase().includes('pushdown')) ||
            (lowerMsg.includes('leg press') && e.name.toLowerCase().includes('leg press')) ||
            (lowerMsg.includes('leg curl') && e.name.toLowerCase().includes('leg curl')) ||
            (lowerMsg.includes('extension') && e.name.toLowerCase().includes('extension')) ||
            (lowerMsg.includes('calf') && e.name.toLowerCase().includes('calf'))
          );

          const matchedCatalogEx = !matchedWorkoutEx
            ? exerciseCatalog.find((e) =>
                lowerMsg.includes(e.name.toLowerCase()) ||
                (lowerMsg.includes('bench') && e.name.toLowerCase().includes('bench')) ||
                (lowerMsg.includes('squat') && e.name.toLowerCase().includes('squat')) ||
                (lowerMsg.includes('deadlift') && e.name.toLowerCase().includes('deadlift'))
              )
            : null;

          const targetEx = matchedWorkoutEx || matchedCatalogEx;

          const isExerciseQuery =
            Boolean(targetEx) &&
            (lowerMsg.includes('weight') ||
              lowerMsg.includes('rep') ||
              lowerMsg.includes('set') ||
              lowerMsg.includes('target') ||
              lowerMsg.includes('how much') ||
              lowerMsg.includes('how many') ||
              lowerMsg.includes('load') ||
              lowerMsg.includes('should i') ||
              lowerMsg.includes('progress') ||
              (Boolean(matchedWorkoutEx) && /\b(approach|today|do for|go about|tips?|advice|get more|better|improve|help)\b/.test(lowerMsg)) ||
              !matchedWorkoutEx);

          const isSwapQuery =
            lowerMsg.includes('swap') ||
            lowerMsg.includes('substitute') ||
            lowerMsg.includes('replace') ||
            lowerMsg.includes('alternative') ||
            lowerMsg.includes('instead of') ||
            lowerMsg.includes("don't have") ||
            lowerMsg.includes('dont have');

          const isWarmupQuery =
            lowerMsg.includes('warm') ||
            lowerMsg.includes('ramp up') ||
            lowerMsg.includes('warm-up') ||
            lowerMsg.includes('warmup');

          const isRestQuery =
            lowerMsg.includes('rest') ||
            lowerMsg.includes('interval') ||
            lowerMsg.includes('pace') ||
            lowerMsg.includes('time between') ||
            lowerMsg.includes('how long');

          const isStrengthLevelQuery =
            lowerMsg.includes('dots') ||
            lowerMsg.includes('tier') ||
            lowerMsg.includes('level up') ||
            lowerMsg.includes('1rm') ||
            lowerMsg.includes('e1rm') ||
            lowerMsg.includes('standard') ||
            lowerMsg.includes('strength ratio') ||
            lowerMsg.includes('strength score');

          const isTempoQuery =
            lowerMsg.includes('tempo') ||
            lowerMsg.includes('cadence') ||
            lowerMsg.includes('speed') ||
            lowerMsg.includes('eccentric') ||
            lowerMsg.includes('form') ||
            lowerMsg.includes('technique');

          if (isSwapQuery) {
            const swap = answerSwapWithOptions(lowerMsg, activeWorkout, exerciseCatalog);
            answerText = swap.text;
            const targetExForChips = matchedWorkoutEx ?? findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.session;
            if (targetExForChips && swap.options.length > 0) {
              modelSuggestedActions = swap.options.slice(0, 3).map((opt) => ({
                label: `Swap → ${opt.name.split(' ').slice(0, 3).join(' ')}`,
                prompt: `Swap ${targetExForChips.name} for ${opt.name}`,
              }));
            } else if (!targetExForChips && workoutExercises.length > 0) {
              modelSuggestedActions = workoutExercises.slice(0, 3).map((ex) => ({
                label: `Swap ${ex.name.split(' ').slice(0, 3).join(' ')}`,
                prompt: `Swap ${ex.name}`,
              }));
            }
            for (const option of swap.options.slice(0, 3)) {
              citations.push({ label: option.name, metric: 'Swap Option', value: `${option.defaultRepRange[0]}–${option.defaultRepRange[1]} reps` });
            }
          } else if (isWarmupQuery) {
            const primaryEx = matchedWorkoutEx || workoutExercises[0];
            const primaryDef = primaryEx ? exerciseCatalog.find((d) => d.id === primaryEx.exerciseId) : undefined;
            const unit = profile.weightUnit || 'kg';
            const targetWeight =
              primaryEx?.sets.find((st) => !st.isWarmup && st.setType !== 'warmup')?.targetWeightKg ?? 0;
            const rx = primaryEx
              ? calculateWarmupPrescription(
                  {
                    pillar: primaryEx.pillar,
                    equipment: primaryEx.equipment,
                    isIsolation: primaryDef?.isIsolation,
                    isWeightedCalisthenic: primaryEx.isWeightedCalisthenic,
                    name: primaryEx.name,
                    exerciseId: primaryEx.exerciseId,
                  },
                  targetWeight,
                  primaryEx.exerciseId === workoutExercises[0]?.exerciseId
                )
              : null;

            if (rx && rx.sets.length > 0) {
              const pairSuffix = primaryEx && usesTwoDumbbells(primaryEx) ? ' each' : '';
              const steps = rx.sets
                .map(
                  (s, idx) =>
                    `${idx + 1}. **${s.label}:** ${s.weightKg > 0 ? `${formatWeight(s.weightKg, unit)}${pairSuffix}` : 'bodyweight'} × ${s.reps} reps`
                )
                .join('\n');
              answerText = `Warm-up ramp for **${primaryEx!.name}**:\n\n${steps}\n\n${rx.rationale}`;
              citations.push({
                label: primaryEx!.name,
                metric: 'Warm-up Ramp',
                value: rx.sets.map((s) => `${s.weightKg > 0 ? formatWeight(s.weightKg, unit) : 'BW'}×${s.reps}`).join(' → '),
              });
            } else {
              answerText = primaryEx
                ? `**${primaryEx.name}** needs 0 dedicated warm-up sets${rx?.rationale ? ` — ${rx.rationale}` : ' (the muscles are warmed from your opening lifts).'}`
                : 'Warm-up sets ramp smoothly up to your first heavy compound weight.';
            }
          } else if (isRestQuery) {
            answerText = answerRestTimes(activeWorkout);
          } else if (isStrengthLevelQuery) {
            answerText = strengthLevelsAnswer();
          } else if (isTempoQuery) {
            const focusEx = matchedWorkoutEx || workoutExercises[0];
            const focusDef = focusEx ? exerciseCatalog.find((d) => d.id === focusEx.exerciseId) : matchedCatalogEx ?? undefined;
            const tempoCode = focusEx?.tempo || '3-0-1-0';
            answerText = focusEx
              ? `Prescribed cadence for **${focusEx.name}** is **${tempoCode}** (controlled eccentric lowering, brief pause, purposeful concentric lift).${focusDef?.whyItWorks ? ` ${focusDef.whyItWorks}` : ''}`
              : `Prescribed lifting cadence is **${tempoCode}** (controlled lowering under tension with crisp concentric drive).`;

            citations.push({
              label: focusEx ? focusEx.name : 'Rep Cadence',
              metric: 'Prescribed Tempo',
              value: tempoCode,
            });
          } else if (isExerciseQuery && targetEx) {
            const isWorkoutEx = 'sets' in targetEx;
            const unit = profile.weightUnit || 'kg';
            if (!isWorkoutEx) {
              const last = findLastCompletedExerciseSession(targetEx.id, workouts);
              const lastSets = last?.session.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup') ?? [];
              const bestSet = lastSets.reduce<WorkoutSet | undefined>(
                (best, st) => (!best || (st.actualWeightKg ?? 0) > (best.actualWeightKg ?? 0) ? st : best),
                undefined
              );
              const pairSuffix = usesTwoDumbbells(targetEx) ? ' each' : '';
              answerText = `**${targetEx.name}** isn't in today's workout (${activeWorkout.name}). ${
                bestSet
                  ? `Last time you did ${formatWeight(bestSet.actualWeightKg ?? bestSet.targetWeightKg, unit)}${pairSuffix} × ${bestSet.actualReps ?? bestSet.targetReps}.`
                  : "You haven't logged it yet, so the first session will set your starting point."
              } Your plan sets the weight when it comes up.`;
              return {
                message: {
                  id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                  sender: 'assistant',
                  text: answerText,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  suggestedActions: buildSuggestedActions({
                    envelope,
                    place: input.place,
                    lastUserMessage: userMessage,
                  }),
                },
              };
            }
            const workingSets = isWorkoutEx
              ? (targetEx as ExerciseSession).sets.filter((st) => !st.isWarmup && st.setType !== 'warmup')
              : [];
            const targetMeta = isWorkoutEx
              ? { exerciseId: (targetEx as ExerciseSession).exerciseId, name: (targetEx as ExerciseSession).name }
              : { id: (targetEx as ExerciseDefinition).id, name: (targetEx as ExerciseDefinition).name };
            const isTwoDbTarget = targetEx.equipment === 'dumbbell' && !usesOneDumbbell(targetMeta);
            const targetWeightLabel = workingSets[0]
              ? targetEx.equipment === 'bodyweight' && workingSets[0].targetWeightKg === 0
                ? 'bodyweight'
                : `${formatWeight(workingSets[0].targetWeightKg, unit)}${isTwoDbTarget ? ' each' : ''}`
              : 'a weight you can lift with 1–2 reps to spare';
            const minReps = isWorkoutEx
              ? (targetEx as ExerciseSession).minReps
              : (targetEx as ExerciseDefinition).defaultRepRange[0];
            const maxReps = isWorkoutEx
              ? (targetEx as ExerciseSession).maxReps
              : (targetEx as ExerciseDefinition).defaultRepRange[1];
            const setCount = isWorkoutEx ? workingSets.length : 3;
            const plannedRir = workingSets[0]?.targetRir;
            const targetRir =
              readinessState === 'Amber Shield'
                ? '2–3 reps in reserve'
                : plannedRir === undefined
                ? '1–2 reps in reserve'
                : plannedRir === 1
                ? '1 rep in reserve'
                : `${plannedRir} reps in reserve`;
            const todayReps = workingSets[0]?.targetReps;
            const repLabel =
              minReps === maxReps ? `${minReps}` : todayReps ? `${todayReps} (range ${minReps}–${maxReps})` : `${minReps}–${maxReps}`;
            const inc = unit === 'lb' ? '5 lb' : targetEx.equipment === 'dumbbell' ? '1 kg per dumbbell' : '2.5 kg';

            const brief = cardLines(targetEx as ExerciseSession);
            answerText = `For **${targetEx.name}** today, your target is **${targetWeightLabel}** for **${setCount} working sets** of **${repLabel}** reps, leaving **${targetRir}**.\n\n${brief[0]}\n${brief[1]}\n\nOnce all ${setCount} sets reach ${maxReps} reps, the weight goes up by ${inc} next session.`;

            citations.push({
              label: targetEx.name,
              metric: 'Target Load & Reps',
              value: `${targetWeightLabel} × ${setCount} sets (${minReps}–${maxReps} reps)`,
            });
          } else {
            const asksAboutToday = /\b(today|tonight|workout|session|briefing|plan|training|train|exercises?|doing|lifting|gym)\b/.test(lowerMsg);
            if (!asksAboutToday) {
              const placeHint =
                input.place?.tab === 'program'
                  ? 'Try asking to swap an exercise across your program, rebalance lagging lifts, schedule a home/bodyweight week, or inspect your weekly schedule.'
                  : input.place?.tab === 'analytics'
                    ? 'Try asking about your strength levels, body composition trend, weekly muscle sets, goals, or logging a measurement (e.g. "Log waist 82 cm").'
                    : `Try asking about today's ${activeWorkout?.name || 'workout'} targets, logging a set, swapping or reordering exercises, or how double progression, RIR, and tempo codes work.`;
              answerText = `I don't have a good answer for that. ${placeHint}`;
            } else {
            const plannedList = workoutExercises.length > 0
              ? workoutExercises
                  .map((e, idx) => {
                    const working = e.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup');
                    const w = working[0]?.targetWeightKg ?? 0;
                    const pairSuffix = usesTwoDumbbells(e) && w > 0 ? ' each' : '';
                    const load = w > 0 ? `${formatWeight(w, profile.weightUnit || 'kg')}${pairSuffix}` : 'bodyweight';
                    const def = exerciseCatalog.find((d) => d.id === e.exerciseId);
                    const targetText =
                      isTimedExercise(e) || (def && isTimedExercise(def))
                        ? `${working[0]?.targetDurationSeconds ?? def?.defaultDurationSeconds ?? 45}s hold`
                        : `${e.minReps === e.maxReps ? e.minReps : `${e.minReps}–${e.maxReps}`} reps`;
                    return `${idx + 1}. **${e.name}** — ${working.length} sets × ${targetText} @ ${load}`;
                  })
                  .join('\n')
              : '  No movements scheduled.';

            const latestBio = biometrics[biometrics.length - 1];
            const plannedRirs = [...new Set(workoutExercises.flatMap((e) => e.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup').map((st) => st.targetRir)).filter((r): r is number => typeof r === 'number'))].sort((a, b) => a - b);
            const effortForBriefing = plannedRirs.length === 0 ? '1–2 reps to spare' : plannedRirs.length === 1 ? `${plannedRirs[0]} ${plannedRirs[0] === 1 ? 'rep' : 'reps'} to spare` : `${plannedRirs[0]}–${plannedRirs[plannedRirs.length - 1]} reps to spare`;

            const briefPos = planPosition(profile, workouts, input.activities ?? []);
            answerText = `Today's session is **${activeWorkout?.name || 'Workout'}**${activeWorkout?.programWorkoutNumber ? '' : ` (**${activeWorkout?.splitDay || 'Scheduled'} Day**)`} in **Week ${briefPos.week} of ${briefPos.totalWeeks}** (${activeWorkout?.location === 'travel' ? 'Bodyweight / No equipment' : activeWorkout?.location === 'home' ? 'Home' : 'Gym'} mode).\n\nPlanned Movements:\n${plannedList}\n\n${
              readinessState === 'Primed'
                ? `Your recovery is high today${recoveryReadingsClause(latestBio)}, so it's a good day to push your first working sets.`
                : readinessState === 'Amber Shield'
                ? `Your recovery is low today${recoveryReadingsClause(latestBio)}. Keep the planned weights and stop each set with 2–3 reps to spare.`
                : `${kg.recoveryEfficiencyScore > 0 ? `Recovery looks normal (${kg.recoveryEfficiencyScore}/100). ` : ''}Lower each rep under control and stop each set with ${effortForBriefing}.`
            }\n\nAsk me about any exercise's targets, warm-up sets, rest times or swaps.`;

            citations.push({
              label: activeWorkout?.name || 'Session Briefing',
              metric: 'Today\'s Session',
              value: `${workoutExercises.length} Exercises Planned`,
            });
            }
          }
        }
        // Record deterministic/non-Flash turns into Flash-Lite session memory so multi-turn follow-ups retain context.
        if (!flashHistoryRecorded && !opts?.suppressModel && answerText) {
          recordFlashLiteExchange(userMessage, answerText);
        }
      }
    }
  }

  const effectiveStatus: CoachMutationStatus | undefined =
    mutationStatus ?? (actionTaken ? 'success' : undefined);
  const athleteFirstName = profile.name?.trim().split(/\s+/)[0];
  const finalAnswerText = stripReflexiveSignOffs(
    stripFillerOpeners(
      enforceNameUsePolicy(
        enforceMutationTruthfulness(answerText, effectiveStatus),
        athleteFirstName,
        input.threadMemory
      )
    )
  );
  const updatedThreadMemory = updateThreadMemoryFromTurn(
    input.threadMemory,
    userMessage,
    finalAnswerText,
    athleteFirstName,
    pendingConfirmation?.status === 'pending' ? pendingConfirmation.summary : ''
  );
  // Also record deterministic top-level tool/readout turns into Flash-Lite history for multi-turn continuity.
  if (!opts?.suppressModel && finalAnswerText && (actionTaken || mutationStatus || answerText)) {
    // Only record top-level turns that didn't go through the else block above (avoid duplicate turns).
    const wentThroughTopDeterministic = Boolean(actionTaken || mutationStatus) && !modelSuggestedActions;
    if (wentThroughTopDeterministic) {
      recordFlashLiteExchange(userMessage, finalAnswerText);
    }
  }
  const lastSwap =
    toolNameUsed === 'swap_exercise' &&
    effectiveStatus === 'success' &&
    typeof stateDiff?.previous_state?.display === 'string' &&
    typeof stateDiff?.new_state?.display === 'string'
      ? { from: stateDiff.previous_state.display, to: stateDiff.new_state.display }
      : undefined;
  const suggestedActions = buildSuggestedActions({
    toolName: toolNameUsed,
    mutationStatus: effectiveStatus,
    envelope,
    place: input.place,
    custom: modelSuggestedActions,
    lastSwap,
    lastUserMessage: userMessage,
  });

  const message: AssistantChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    sender: 'assistant',
    text: finalAnswerText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    actionApplied: actionTaken,
    mutationStatus: effectiveStatus,
    stateDiff,
    pendingConfirmation,
    memorySaved,
    undoSnapshot,
    navigateTarget,
    navigateLabel,
    navigateDetail,
    suggestedActions,
    knowledgeGraphCitations: citations.length > 0 ? citations : undefined,
    scientificPrinciplesCited:
      scientificPrinciplesCited.length > 0 ? scientificPrinciplesCited : undefined,
  };

  return {
    message,
    updatedProfile,
    updatedWorkout,
    updatedBiometrics,
    updatedActivities,
    actionTaken,
    updatedThreadMemory,
  };
}
