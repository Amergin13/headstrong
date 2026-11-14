import { ActivityLog } from '../engine/activeDays';
import {
  buildPlanOverview,
  generatePlanWorkout,
  isActiveSlot,
  planWorkoutLabel,
} from '../engine/muscleBuildingProgram';
import { loadIncrementFor } from '../engine/progressionRules';
import { getPlanById, isPlanProgram, resolveActivePlan } from '../engine/trainingPlans';
import {
  AthleteMemoryCategory,
  AthleteMemoryFact,
  CoachMutationStatus,
  CoachPendingConfirmation,
  CoachStateDiff,
  CoachSuggestedAction,
  CoachToolName,
  CoachUndoSnapshot,
  ExerciseDefinition,
  ExerciseSession,
  PlanId,
  ProgramSplitType,
  ReadinessState,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import { snapLoadKg } from '../utils/units';
import { findExerciseNamed } from './coachAnswers';
import { CoachPlace } from './coachContext';
import { ContextEnvelope, createMemoryFact } from './coachContextEnvelope';
import { GOOGLE_AUTH_CONFIG, isSupabaseConfigured } from './googleAuthService';
import { prepareSessionForAthlete } from './sessionPreparation';
import { loadAuthUser, saveActiveWorkout, saveProfile } from './storage';
import { adaptWorkoutSessionToLocation, generateSmartWorkoutSession, getFirstSplitDayForProgram } from './workoutGenerator';

// ============================================================================
// 1. Gemini Function Calling / Tool Declarations (Strict JSON Schema)
// ============================================================================

export interface GeminiFunctionDeclaration {
  name: CoachToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const COACH_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'reset_program',
    description:
      'Reset the athlete active program back to a target week and day (defaults to Week 1, Day 1) without deleting past completed workout logs. Set confirmation_required=true if the athlete currently has logged sets in an active session or asks to wipe current week progress.',
    parameters: {
      type: 'object',
      properties: {
        program_id: {
          type: 'string',
          description: 'Target program or split id (optional; defaults to current active program).',
        },
        target_week: {
          type: 'integer',
          description: 'Week number to start from (default 1).',
        },
        target_day: {
          type: 'integer',
          description: 'Day/workout slot within the target week to start from (default 1).',
        },
        confirmation_required: {
          type: 'boolean',
          description:
            'True when resetting would discard in-progress sets in today workout or when the athlete should confirm before wiping progress.',
        },
      },
      required: ['target_week', 'target_day', 'confirmation_required'],
    },
  },
  {
    name: 'swap_exercise',
    description:
      'Swap an exercise in the active workout for an appropriate alternative based on equipment, injury contraindications, or preference. Preserves already logged sets.',
    parameters: {
      type: 'object',
      properties: {
        workout_id: {
          type: 'string',
          description: 'ID of the active workout session.',
        },
        old_exercise_id: {
          type: 'string',
          description: 'Exercise ID or name currently in today workout to replace.',
        },
        new_exercise_id: {
          type: 'string',
          description: 'Target replacement exercise ID or name (optional; best match chosen if omitted).',
        },
        reason: {
          type: 'string',
          description: 'Concise reason for the swap (e.g. knee pain, no cables available).',
        },
      },
      required: ['old_exercise_id', 'reason'],
    },
  },
  {
    name: 'adjust_workout_volume',
    description:
      'Adjust set counts or working load targets for uncompleted sets in the active workout (e.g. short on time, recovery adjustment, or extra working sets).',
    parameters: {
      type: 'object',
      properties: {
        workout_id: {
          type: 'string',
          description: 'ID of the active workout session.',
        },
        modifier_type: {
          type: 'string',
          enum: ['reduce_sets', 'increase_sets', 'deload_load', 'short_on_time'],
          description: 'Volume or load adjustment mode.',
        },
        details: {
          type: 'string',
          description: 'Specific target muscle/exercise or detail (e.g. "-1 working set per lift", "25 min express").',
        },
      },
      required: ['modifier_type', 'details'],
    },
  },
  {
    name: 'save_athlete_memory',
    description:
      'Persist a durable athlete constraint, injury/pain contraindication, equipment note, or training preference into athlete semantic memory and knowledge graph edges.',
    parameters: {
      type: 'object',
      properties: {
        fact_category: {
          type: 'string',
          enum: ['injury', 'contraindication', 'equipment', 'preference', 'goal_note', 'schedule'],
          description: 'Category of athlete memory fact.',
        },
        fact_value: {
          type: 'string',
          description: 'Concise factual statement to remember across future sessions.',
        },
      },
      required: ['fact_category', 'fact_value'],
    },
  },
];

// ============================================================================
// 2. Formatting Helpers & Transactional Persistence
// ============================================================================

export function formatStateDiffText(diff?: CoachStateDiff): string {
  if (!diff) return '';
  const prev =
    typeof diff.previous_state.display === 'string'
      ? diff.previous_state.display
      : JSON.stringify(diff.previous_state);
  const next =
    typeof diff.new_state.display === 'string'
      ? diff.new_state.display
      : JSON.stringify(diff.new_state);
  return `${prev} → ${next}`;
}

export type SupabaseSyncHook = (payload: {
  toolName: CoachToolName;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
}) => Promise<{ ok: boolean; error?: string }>;

export interface CoachToolExecutionContext {
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  activities?: ActivityLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  place?: CoachPlace;
  supabaseSyncFn?: SupabaseSyncHook;
}

export interface CoachToolOutcome {
  toolName: CoachToolName;
  mutationStatus: CoachMutationStatus;
  summaryText: string;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
  stateDiff?: CoachStateDiff;
  undoSnapshot?: CoachUndoSnapshot;
  pendingConfirmation?: CoachPendingConfirmation;
  memorySaved?: AthleteMemoryFact;
  navigateTarget?: 'train' | 'program' | 'analytics';
  navigateLabel?: string;
  errorMessage?: string;
}

function getEnvVar(key: string): string {
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key] as string;
    }
  } catch {}
  try {
    const metaEnv = new Function('return typeof import.meta !== "undefined" ? import.meta.env : null')();
    if (metaEnv?.[key]) return String(metaEnv[key]);
  } catch {}
  return '';
}

async function syncMutationRemote(
  context: CoachToolExecutionContext,
  toolName: CoachToolName,
  updatedProfile?: Partial<UserProfile>,
  updatedWorkout?: WorkoutSession
): Promise<{ ok: boolean; error?: string }> {
  if (context.supabaseSyncFn) {
    try {
      return await context.supabaseSyncFn({ toolName, updatedProfile, updatedWorkout });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Remote sync failed.' };
    }
  }

  const syncTable = getEnvVar('VITE_SUPABASE_SYNC_TABLE');
  if (!syncTable || !isSupabaseConfigured()) {
    return { ok: true };
  }
  const auth = loadAuthUser();
  if (!auth?.accessToken) {
    return { ok: true };
  }

  try {
    const res = await fetch(`${GOOGLE_AUTH_CONFIG.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${syncTable}`, {
      method: 'POST',
      headers: {
        apikey: GOOGLE_AUTH_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: auth.id,
        updated_at: new Date().toISOString(),
        last_tool: toolName,
        profile_patch: updatedProfile ?? null,
        active_workout: updatedWorkout ?? null,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Sync failed (${res.status}).` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error during sync.' };
  }
}

async function commitMutationTransaction(args: {
  context: CoachToolExecutionContext;
  toolName: CoachToolName;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
  stateDiff: CoachStateDiff;
  summaryText: string;
  memorySaved?: AthleteMemoryFact;
  navigateTarget?: 'train' | 'program' | 'analytics';
  navigateLabel?: string;
}): Promise<CoachToolOutcome> {
  const {
    context,
    toolName,
    updatedProfile,
    updatedWorkout,
    stateDiff,
    summaryText,
    memorySaved,
    navigateTarget,
    navigateLabel,
  } = args;

  const undoSnapshot: CoachUndoSnapshot = {
    label: stateDiff.label,
    previousProfile: updatedProfile ? { ...context.profile } : undefined,
    previousWorkout: updatedWorkout
      ? {
          ...context.activeWorkout,
          exercises: context.activeWorkout.exercises.map((e) => ({ ...e, sets: [...e.sets] })),
        }
      : undefined,
  };

  const remote = await syncMutationRemote(context, toolName, updatedProfile, updatedWorkout);
  if (!remote.ok) {
    if (updatedProfile) saveProfile(context.profile);
    if (updatedWorkout) saveActiveWorkout(context.activeWorkout);
    return {
      toolName,
      mutationStatus: 'error',
      summaryText: `Could not complete "${stateDiff.label}": ${remote.error || 'save rejected'}. No training state was changed.`,
      errorMessage: remote.error || 'Sync failed.',
    };
  }

  if (updatedProfile) {
    saveProfile({ ...context.profile, ...updatedProfile });
  }
  if (updatedWorkout) {
    saveActiveWorkout(updatedWorkout);
  }

  return {
    toolName,
    mutationStatus: 'success',
    summaryText,
    updatedProfile,
    updatedWorkout,
    stateDiff,
    undoSnapshot,
    memorySaved,
    navigateTarget,
    navigateLabel,
  };
}

// ============================================================================
// 3. Deterministic Tool Execution Handlers
// ============================================================================

function buildPreparedSessionForReset(
  plan: ReturnType<typeof resolveActivePlan>,
  workoutNumber: number,
  context: CoachToolExecutionContext,
  targetProfile: UserProfile
): WorkoutSession {
  const raw = generatePlanWorkout(plan, workoutNumber);
  const loc = targetProfile.activeLocation || context.activeWorkout?.location || 'gym';
  const placed =
    loc !== 'gym'
      ? adaptWorkoutSessionToLocation(
          raw,
          loc,
          targetProfile.homeEquipment || [],
          context.exerciseCatalog,
          context.workouts,
          context.readinessState,
          context.bodyweightEmaKg
        )
      : raw;
  return prepareSessionForAthlete(placed, {
    history: context.workouts,
    bodyweightKg: context.bodyweightEmaKg,
    readinessState: context.readinessState,
    gender: targetProfile.gender,
    experienceLevel: targetProfile.experienceLevel,
    unit: targetProfile.weightUnit || 'kg',
    isProgramPlan: true,
  });
}

function hasInProgressSets(workout?: WorkoutSession): boolean {
  if (!workout || workout.completed) return false;
  return workout.exercises.some((ex) =>
    ex.sets.some((st) => st.completed && !st.isWarmup && st.setType !== 'warmup')
  );
}

export interface ResetProgramArgs {
  program_id?: string;
  target_week?: number;
  target_day?: number;
  confirmation_required?: boolean;
}

export async function executeResetProgram(
  rawArgs: ResetProgramArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const targetWeek = Math.max(1, Math.round(rawArgs.target_week ?? 1));
  const targetDay = Math.max(1, Math.round(rawArgs.target_day ?? 1));
  const requestedProgramId = (rawArgs.program_id || context.profile.programType || 'muscle_building_6wk') as ProgramSplitType;
  const plan = isPlanProgram(requestedProgramId)
    ? getPlanById(requestedProgramId as PlanId, context.profile.goalPhase, context.profile.customPlans)
    : resolveActivePlan(context.profile);

  const overviewBefore = buildPlanOverview(
    context.workouts,
    plan,
    context.activities ?? [],
    context.profile.planCycleStarts
  );
  const completedInProgress = hasInProgressSets(context.activeWorkout);
  const shouldConfirm =
    rawArgs.confirmation_required === true ||
    (rawArgs.confirmation_required !== false && completedInProgress);

  const totalWeeks = Math.max(1, ...plan.templates.map((t) => t.week));
  const liftingSlots = plan.templates.filter((t) => !isActiveSlot(t));
  const slotIndex = Math.min(
    Math.max(0, (targetWeek - 1) * Math.max(1, Math.round(liftingSlots.length / totalWeeks)) + (targetDay - 1)),
    Math.max(0, liftingSlots.length - 1)
  );
  const targetWorkoutNumber =
    targetWeek === 1 && targetDay === 1
      ? liftingSlots[0]?.workoutNumber ?? 1
      : liftingSlots[slotIndex]?.workoutNumber ?? 1;

  const previousDisplay = `Week ${context.profile.mesocycleWeek || 1}, ${overviewBefore.completedCount} done`;
  const newDisplay = `Week ${targetWeek}, Day ${targetDay} (${planWorkoutLabel(plan.templates.find((t) => t.workoutNumber === targetWorkoutNumber)?.title || 'Day 1')})`;

  const previewDiff: CoachStateDiff = {
    object_type: 'Program',
    object_id: plan.id,
    label: `Program Reset • Week ${targetWeek}, Day ${targetDay}`,
    previous_state: {
      display: previousDisplay,
      week: context.profile.mesocycleWeek || 1,
      completed_workouts: overviewBefore.completedCount,
    },
    new_state: {
      display: newDisplay,
      week: targetWeek,
      day: targetDay,
      workout_number: targetWorkoutNumber,
    },
  };

  if (shouldConfirm) {
    const pendingConfirmation: CoachPendingConfirmation = {
      tool_name: 'reset_program',
      title: `Reset ${plan.name} to Week ${targetWeek}, Day ${targetDay}?`,
      summary: `${previousDisplay} → ${newDisplay}`,
      warning: completedInProgress
        ? `Today's session (${context.activeWorkout.name}) has logged sets in progress. Confirming restarts your current plan run from Day 1 while keeping past finished workouts in history.`
        : `This starts a fresh cycle of ${plan.name} at Week ${targetWeek}, Day ${targetDay} while keeping your completed workout log.`,
      confirm_label: `Confirm Reset to Day ${targetDay}`,
      cancel_label: 'Cancel',
      preview_diff: previewDiff,
      status: 'pending',
      args: {
        program_id: requestedProgramId,
        target_week: targetWeek,
        target_day: targetDay,
        confirmation_required: false,
      },
    };
    return {
      toolName: 'reset_program',
      mutationStatus: 'awaiting_confirmation',
      summaryText: completedInProgress
        ? `Today's **${context.activeWorkout.name}** already has logged sets in progress. Confirm below if you want to discard today's uncompleted draft and restart **${plan.name}** from Week ${targetWeek}, Day ${targetDay} (saved workouts stay in history).`
        : `Ready to restart **${plan.name}** at Week ${targetWeek}, Day ${targetDay}. Confirm below to apply the reset.`,
      pendingConfirmation,
      stateDiff: previewDiff,
    };
  }

  // Non-plan split (Full Body / UL / PPL) fallback reset
  if (!isPlanProgram(requestedProgramId)) {
    const splitDay = getFirstSplitDayForProgram(requestedProgramId);
    const updatedProfilePatch: Partial<UserProfile> = {
      programType: requestedProgramId,
      mesocycleWeek: targetWeek,
    };
    const generated = prepareSessionForAthlete(
      generateSmartWorkoutSession(
        splitDay,
        context.workouts,
        context.exerciseCatalog,
        context.readinessState,
        targetWeek,
        context.profile.activeLocation || 'gym',
        context.profile.homeEquipment || [],
        context.profile.goalPhase,
        context.bodyweightEmaKg,
        context.profile.scheduledWeekLocations
      ),
      {
        history: context.workouts,
        bodyweightKg: context.bodyweightEmaKg,
        readinessState: context.readinessState,
        gender: context.profile.gender,
        experienceLevel: context.profile.experienceLevel,
        unit: context.profile.weightUnit || 'kg',
        isProgramPlan: false,
      }
    );
    return commitMutationTransaction({
      context,
      toolName: 'reset_program',
      updatedProfile: updatedProfilePatch,
      updatedWorkout: generated,
      stateDiff: {
        object_type: 'Program',
        object_id: requestedProgramId,
        label: `Program Reset • Week ${targetWeek}, Day ${targetDay}`,
        previous_state: {
          display: `Week ${context.profile.mesocycleWeek || 1} • ${context.activeWorkout.name}`,
          week: context.profile.mesocycleWeek || 1,
        },
        new_state: {
          display: `Week ${targetWeek}, Day ${targetDay} • ${generated.name}`,
          week: targetWeek,
          day: targetDay,
        },
      },
      summaryText: `**Program reset to Week ${targetWeek}, Day ${targetDay}.** Today's session is now **${generated.name}**.`,
      navigateTarget: 'program',
      navigateLabel: `View Day ${targetDay}`,
    });
  }

  const cycleStarts = {
    ...(context.profile.planCycleStarts || {}),
    [plan.id]: new Date(Date.now() + 1).toISOString(),
  };
  const updatedProfilePatch: Partial<UserProfile> = {
    programType: plan.id,
    mesocycleWeek: targetWeek,
    planCycleStarts: cycleStarts,
  };
  const nextProfile = { ...context.profile, ...updatedProfilePatch };
  const freshWorkout = buildPreparedSessionForReset(plan, targetWorkoutNumber, context, nextProfile);

  return commitMutationTransaction({
    context,
    toolName: 'reset_program',
    updatedProfile: updatedProfilePatch,
    updatedWorkout: freshWorkout,
    stateDiff: previewDiff,
    summaryText: `**${plan.name} reset to Week ${targetWeek}, Day ${targetDay}.** Today's queued workout is **${planWorkoutLabel(freshWorkout.name)}**, and your past completed logs remain in history.`,
    navigateTarget: 'program',
    navigateLabel: `View Day ${targetDay}`,
  });
}

export interface SwapExerciseArgs {
  workout_id?: string;
  old_exercise_id: string;
  new_exercise_id?: string;
  reason?: string;
}

function findBestReplacementExercise(
  currentEx: ExerciseSession,
  requestedNew: string | undefined,
  catalog: ExerciseDefinition[],
  todayWorkout: WorkoutSession
): ExerciseDefinition | undefined {
  if (requestedNew) {
    const q = requestedNew.toLowerCase().trim();
    const byId = catalog.find((d) => d.id.toLowerCase() === q);
    if (byId) return byId;
    const byExact = catalog.find((d) => d.name.toLowerCase() === q);
    if (byExact) return byExact;
    const bySubstring = catalog.find((d) => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase()));
    if (bySubstring) return bySubstring;
  }

  const currentDef = catalog.find((d) => d.id === currentEx.exerciseId);
  const where = todayWorkout.location ?? 'gym';
  const existingIds = new Set(todayWorkout.exercises.map((e) => e.exerciseId));
  return catalog.find(
    (d) =>
      d.id !== currentEx.exerciseId &&
      !existingIds.has(d.id) &&
      (!d.environments || d.environments.includes(where)) &&
      d.pillar === currentEx.pillar &&
      (!currentDef?.primaryMuscle || d.primaryMuscle === currentDef.primaryMuscle)
  );
}

export async function executeSwapExercise(
  rawArgs: SwapExerciseArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout, exerciseCatalog } = context;
  const oldQuery = (rawArgs.old_exercise_id || '').trim();
  const byId = activeWorkout.exercises.find((e) => e.id === oldQuery || e.exerciseId === oldQuery);
  const byName = !byId ? findExerciseNamed(oldQuery.toLowerCase(), activeWorkout, exerciseCatalog)?.session : undefined;
  const targetEx = byId || byName;

  if (!targetEx) {
    return {
      toolName: 'swap_exercise',
      mutationStatus: 'error',
      summaryText: `Couldn't find "${oldQuery || 'that exercise'}" in today's **${activeWorkout.name}** session. No exercises were changed.`,
      errorMessage: 'Exercise not in active workout.',
    };
  }

  const replacement = findBestReplacementExercise(targetEx, rawArgs.new_exercise_id, exerciseCatalog, activeWorkout);
  if (!replacement) {
    return {
      toolName: 'swap_exercise',
      mutationStatus: 'error',
      summaryText: `Couldn't find a matching replacement for **${targetEx.name}** in the exercise library. No exercises were changed.`,
      errorMessage: 'Replacement exercise not found.',
    };
  }

  const unit = context.profile.weightUnit || 'kg';
  const workingCount = Math.max(1, targetEx.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length);
  const repTarget = targetEx.sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.targetReps ?? targetEx.minReps;
  const seedSession: WorkoutSession = {
    ...activeWorkout,
    exercises: [
      {
        ...targetEx,
        exerciseId: replacement.id,
        name: replacement.name,
        pillar: replacement.pillar,
        equipment: replacement.equipment,
        sets: Array.from({ length: workingCount }, (_, idx) => ({
          id: `swap-${replacement.id}-${Date.now()}-${idx}`,
          setNumber: idx + 1,
          setType: 'working' as const,
          targetWeightKg: 0,
          targetReps: repTarget,
          targetRir: 2,
          actualWeightKg: 0,
          actualReps: 0,
          actualRir: 2,
          completed: false,
        })),
      },
    ],
  };

  const preparedSingle = prepareSessionForAthlete(seedSession, {
    history: context.workouts,
    bodyweightKg: context.bodyweightEmaKg,
    readinessState: context.readinessState,
    gender: context.profile.gender,
    experienceLevel: context.profile.experienceLevel,
    unit,
    isProgramPlan: isPlanProgram(context.profile.programType),
  }).exercises[0];

  const completedSets = targetEx.sets.filter((s) => s.completed);
  const finalReplacement: ExerciseSession = {
    ...preparedSingle,
    sets: [...completedSets, ...preparedSingle.sets.slice(completedSets.length)].map((st, idx) => ({
      ...st,
      setNumber: idx + 1,
    })),
  };

  const updatedWorkout: WorkoutSession = {
    ...activeWorkout,
    exercises: activeWorkout.exercises.map((ex) => (ex.id === targetEx.id ? finalReplacement : ex)),
  };

  const reasonSuffix = rawArgs.reason ? ` (${rawArgs.reason})` : '';
  return commitMutationTransaction({
    context,
    toolName: 'swap_exercise',
    updatedWorkout,
    stateDiff: {
      object_type: 'Workout',
      object_id: activeWorkout.id,
      label: 'Exercise Swapped',
      previous_state: { display: targetEx.name, exercise_id: targetEx.exerciseId },
      new_state: { display: replacement.name, exercise_id: replacement.id },
    },
    summaryText: `Swapped **${targetEx.name}** → **${replacement.name}** in **${activeWorkout.name}**${reasonSuffix}.`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface AdjustWorkoutVolumeArgs {
  workout_id?: string;
  modifier_type: 'reduce_sets' | 'increase_sets' | 'deload_load' | 'short_on_time';
  details?: string;
}

export async function executeAdjustWorkoutVolume(
  rawArgs: AdjustWorkoutVolumeArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout } = context;
  const workingCountBefore = activeWorkout.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length,
    0
  );
  if (workingCountBefore === 0) {
    return {
      toolName: 'adjust_workout_volume',
      mutationStatus: 'error',
      summaryText: `There are no working sets in **${activeWorkout.name}** to adjust.`,
      errorMessage: 'Empty workout.',
    };
  }

  const unit = context.profile.weightUnit || 'kg';
  let changed = false;
  const updatedExercises = activeWorkout.exercises.map((ex, exIdx) => {
    const warmups = ex.sets.filter((s) => s.isWarmup || s.setType === 'warmup');
    const working = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
    const completedWorking = working.filter((s) => s.completed);
    const pendingWorking = working.filter((s) => !s.completed);
    if (pendingWorking.length === 0) return ex;

    if (rawArgs.modifier_type === 'reduce_sets' || rawArgs.modifier_type === 'short_on_time') {
      const minRemaining = rawArgs.modifier_type === 'short_on_time' ? (exIdx < 3 ? 2 : 1) : Math.max(1, working.length - 1);
      const keepTotal = Math.max(completedWorking.length, minRemaining);
      if (keepTotal < working.length) {
        changed = true;
        const nextSets = [...warmups, ...completedWorking, ...pendingWorking.slice(0, keepTotal - completedWorking.length)].map(
          (s, idx) => ({ ...s, setNumber: idx + 1 })
        );
        return { ...ex, sets: nextSets };
      }
      return ex;
    }

    if (rawArgs.modifier_type === 'increase_sets') {
      const lastWorking = working[working.length - 1];
      if (!lastWorking) return ex;
      changed = true;
      const extraSet = {
        ...lastWorking,
        id: `${ex.id}-extra-${Date.now()}-${exIdx}`,
        setNumber: ex.sets.length + 1,
        completed: false,
      };
      return { ...ex, sets: [...ex.sets, extraSet] };
    }

    if (rawArgs.modifier_type === 'deload_load') {
      changed = true;
      const nextWorking = working.map((s) => {
        if (s.completed || s.targetWeightKg <= 0) return s;
        const reduced = snapLoadKg(Math.max(loadIncrementFor(ex.equipment), s.targetWeightKg * 0.9), unit, ex.equipment);
        return {
          ...s,
          targetWeightKg: reduced,
          actualWeightKg: reduced,
          targetRir: Math.max(2, s.targetRir),
        };
      });
      return { ...ex, sets: [...warmups, ...nextWorking] };
    }

    return ex;
  });

  if (!changed) {
    return {
      toolName: 'adjust_workout_volume',
      mutationStatus: 'error',
      summaryText: `Every exercise in **${activeWorkout.name}** is already at its minimum or completed. No volume changes were made.`,
      errorMessage: 'No adjustable pending sets.',
    };
  }

  const workingCountAfter = updatedExercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length,
    0
  );
  const updatedWorkout: WorkoutSession = { ...activeWorkout, exercises: updatedExercises };

  const previousDisplay =
    rawArgs.modifier_type === 'deload_load'
      ? `Standard load (${workingCountBefore} working sets)`
      : `${workingCountBefore} working sets`;
  const nextDisplay =
    rawArgs.modifier_type === 'deload_load'
      ? `-10% load, RIR 2+ (${workingCountAfter} sets)`
      : `${workingCountAfter} working sets`;

  return commitMutationTransaction({
    context,
    toolName: 'adjust_workout_volume',
    updatedWorkout,
    stateDiff: {
      object_type: 'Workout',
      object_id: activeWorkout.id,
      label:
        rawArgs.modifier_type === 'deload_load'
          ? 'Recovery Load Reduced'
          : rawArgs.modifier_type === 'increase_sets'
            ? 'Volume Added'
            : 'Workout Trimmed',
      previous_state: { display: previousDisplay, working_sets: workingCountBefore },
      new_state: { display: nextDisplay, working_sets: workingCountAfter },
    },
    summaryText:
      rawArgs.modifier_type === 'deload_load'
        ? `Lightened uncompleted sets in **${activeWorkout.name}** by ~10% and set target effort to 2 RIR.`
        : `Adjusted **${activeWorkout.name}** from ${workingCountBefore} to **${workingCountAfter} working sets**${rawArgs.details ? ` (${rawArgs.details})` : ''}.`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface SaveAthleteMemoryArgs {
  fact_category: AthleteMemoryCategory;
  fact_value: string;
}

export async function executeSaveAthleteMemory(
  rawArgs: SaveAthleteMemoryArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const cleanedValue = (rawArgs.fact_value || '').trim();
  if (!cleanedValue) {
    return {
      toolName: 'save_athlete_memory',
      mutationStatus: 'error',
      summaryText: 'No memory detail was provided to save.',
      errorMessage: 'Empty memory fact.',
    };
  }

  const existing = context.profile.athleteMemories ?? [];
  const fact = createMemoryFact(rawArgs.fact_category || 'preference', cleanedValue, context.exerciseCatalog);
  const deduped = existing.filter(
    (m) => m.value.toLowerCase() !== fact.value.toLowerCase() || m.category !== fact.category
  );
  const nextMemories = [...deduped, fact].slice(-25);

  return commitMutationTransaction({
    context,
    toolName: 'save_athlete_memory',
    updatedProfile: { athleteMemories: nextMemories },
    memorySaved: fact,
    stateDiff: {
      object_type: 'Athlete',
      object_id: context.profile.name || 'athlete',
      label: 'Memory Updated',
      previous_state: { display: `${existing.length} saved note${existing.length === 1 ? '' : 's'}`, count: existing.length },
      new_state: { display: `${fact.category}: ${fact.value}`, count: nextMemories.length },
    },
    summaryText: `Saved to your athlete profile: **${fact.value}**. I will apply this context in future coaching and exercise suggestions.`,
  });
}

export async function executeCoachToolCall(
  toolName: CoachToolName,
  rawArgs: Record<string, unknown>,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  switch (toolName) {
    case 'reset_program':
      return executeResetProgram(rawArgs as unknown as ResetProgramArgs, context);
    case 'swap_exercise':
      return executeSwapExercise(rawArgs as unknown as SwapExerciseArgs, context);
    case 'adjust_workout_volume':
      return executeAdjustWorkoutVolume(rawArgs as unknown as AdjustWorkoutVolumeArgs, context);
    case 'save_athlete_memory':
      return executeSaveAthleteMemory(rawArgs as unknown as SaveAthleteMemoryArgs, context);
  }
}

export async function executePendingConfirmation(
  pending: CoachPendingConfirmation,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  return executeCoachToolCall(pending.tool_name, { ...pending.args, confirmation_required: false }, context);
}

// ============================================================================
// 4. Truthfulness Gate & Tailored Next-Action Chips (1–3 items max)
// ============================================================================

const FALSE_SUCCESS_RE =
  /\b(i['’]?ve reset|i have reset|program reset|reset to week|swapped\b.+\bfor\b|adjusted your sets|volume adjusted|saved to (?:your )?memory|updated your (?:plan|workout|program))\b/i;

/**
 * Hard contract: never allow assistant text to claim a state mutation succeeded
 * unless `mutationStatus === 'success'`.
 */
export function enforceMutationTruthfulness(
  replyText: string,
  mutationStatus?: CoachMutationStatus,
  fallbackText?: string
): string {
  if (mutationStatus === 'success') return replyText;
  if (mutationStatus === 'error') {
    return fallbackText || 'The update could not be saved, so your training data was left unchanged. Please try again.';
  }
  if (mutationStatus === 'awaiting_confirmation') {
    if (FALSE_SUCCESS_RE.test(replyText)) {
      return fallbackText || 'Confirm below before I change your current program.';
    }
    return replyText;
  }
  if (FALSE_SUCCESS_RE.test(replyText)) {
    return fallbackText || replyText.replace(FALSE_SUCCESS_RE, 'I have checked that option');
  }
  return replyText;
}

export function buildSuggestedActions(params: {
  toolName?: CoachToolName;
  mutationStatus?: CoachMutationStatus;
  envelope: ContextEnvelope;
  place?: CoachPlace;
  custom?: CoachSuggestedAction[];
}): CoachSuggestedAction[] {
  if (params.custom && params.custom.length > 0) {
    return params.custom
      .filter((a) => a.label?.trim() && a.prompt?.trim())
      .slice(0, 3);
  }

  const { toolName, mutationStatus, envelope, place } = params;
  const todayFirstEx = envelope.working_state.today_workout?.exercises[0]?.name;

  if (mutationStatus === 'awaiting_confirmation') {
    return [
      { label: 'How recovery looks', prompt: 'Should I train today?' },
      { label: 'Keep current week', prompt: 'What am I lifting today?' },
    ];
  }

  if (toolName === 'reset_program' && mutationStatus === 'success') {
    return [
      { label: 'Preview Day 1 exercises', prompt: 'What am I lifting today?' },
      { label: 'Check starting weights', prompt: 'How hard should I push today?' },
      { label: 'Schedule rest days', prompt: 'How does the weekly schedule work?' },
    ];
  }

  if (toolName === 'swap_exercise' && mutationStatus === 'success') {
    return [
      { label: 'Review updated workout', prompt: 'What am I lifting today?' },
      { label: 'Check weekly volume', prompt: 'Am I doing enough sets this week?' },
      { label: 'Short on time?', prompt: 'I only have 25 minutes today' },
    ];
  }

  if (toolName === 'adjust_workout_volume' && mutationStatus === 'success') {
    return [
      { label: 'Updated workout brief', prompt: 'What am I lifting today?' },
      { label: 'Rest between sets', prompt: 'How long should I rest between sets?' },
    ];
  }

  if (toolName === 'save_athlete_memory' && mutationStatus === 'success') {
    return [
      {
        label: todayFirstEx ? `Check ${todayFirstEx}` : 'Check today workout',
        prompt: 'What am I lifting today?',
      },
      { label: 'Swap an exercise', prompt: 'Can I swap an exercise today?' },
    ];
  }

  if (place?.tab === 'program') {
    return [
      { label: 'Reset program to Day 1', prompt: 'Reset my program to Day 1' },
      { label: 'Next workout plan', prompt: 'Where am I in my program?' },
      { label: 'Weekly muscle sets', prompt: 'Am I doing enough sets this week?' },
    ];
  }

  if (place?.tab === 'analytics') {
    return [
      { label: 'Strength balance', prompt: 'What are my strength standards?' },
      { label: 'Check weekly sets', prompt: 'Am I doing enough sets this week?' },
      { label: 'Training streak', prompt: 'What is my training streak?' },
    ];
  }

  const defaults: CoachSuggestedAction[] = [
    { label: 'Today workout brief', prompt: 'What am I lifting today?' },
    { label: 'Should I push or hold?', prompt: 'Should I train today?' },
  ];
  if (todayFirstEx) {
    defaults.push({
      label: `Swap ${todayFirstEx.split(' ').slice(0, 2).join(' ')}`,
      prompt: `What can I swap ${todayFirstEx} for?`,
    });
  }
  return defaults.slice(0, 3);
}
