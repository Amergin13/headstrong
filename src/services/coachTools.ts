import {
  ACTIVITY_LABELS,
  ActivityLog,
  ActivityType,
  MIN_ACTIVE_MINUTES,
  activeDayDates,
} from '../engine/activeDays';
import { isTimedExercise, usesOneDumbbell } from '../engine/e1rm';
import { getExerciseBiomechanicalMeta } from '../engine/knowledgeGraph';
import {
  buildPlanOverview,
  generatePlanWorkout,
  getNextProgramWorkoutNumber,
  getSessionPlanId,
  isActiveSlot,
  planWorkoutLabel,
} from '../engine/muscleBuildingProgram';
import {
  applyProgramOverridesToPlan,
  matchesWorkoutTemplateFilter,
  previewProgramOverrides,
} from '../engine/programOverrides';
import {
  getMovementFamilyLabel,
  getMovementVectorId,
  prescribeDoubleProgression,
  prescribeExerciseSwap,
} from '../engine/progression';
import { loadIncrementFor } from '../engine/progressionRules';
import { computeTrainingStreak, MUSCLE_FRIENDLY_NAMES } from '../engine/recovery';
import { canUseMusclePlan, getPlanById, isPlanProgram, resolveActivePlan } from '../engine/trainingPlans';
import {
  AssistantActionType,
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
  PlanId,
  ProgramExerciseOverride,
  ProgramSplitType,
  ReadinessState,
  StrengthPillar,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { ensureWarmupSetsOnExercise, isFirstCompoundForPillar } from '../engine/warmup';
import { localDateString } from '../utils/date';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import { formatPreciseWeight, formatWeight, snapLoadKg, unitToKg } from '../utils/units';
import { findExerciseNamed } from './coachAnswers';
import { CoachPlace } from './coachContext';
import { ContextEnvelope, createMemoryFact, deriveContraindicationEdges } from './coachContextEnvelope';
import { detectCoachInterventions } from './coachInterventions';
import { detectGoalChange } from './coachGoals';
import { GOOGLE_AUTH_CONFIG, isSupabaseConfigured } from './googleAuthService';
import { detectProgressWidgetChange } from './progressWidgets';
import { prepareSessionForAthlete, startingWeightForNewExercise } from './sessionPreparation';
import { loadAuthUser, saveActiveWorkout, saveActivities, saveBiometrics, saveProfile } from './storage';
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
  {
    name: 'modify_workout_exercises',
    description:
      'Add a new exercise to today active workout or remove an existing exercise from today active workout while keeping completed sets.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: 'Whether to add or remove the named exercise.',
        },
        exercise_name: {
          type: 'string',
          description: 'Exercise ID or name to add or remove.',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for the change.',
        },
      },
      required: ['action', 'exercise_name'],
    },
  },
  {
    name: 'switch_location',
    description:
      'Switch training location between gym, home, and travel (bodyweight) for today active session or schedule a specific future week (1-6) away/home.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          enum: ['gym', 'home', 'travel'],
          description: 'Target training environment (travel = bodyweight without equipment).',
        },
        week: {
          type: 'integer',
          description: 'Optional future program week number (1-6) to schedule this location for.',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'update_home_equipment',
    description:
      'Add or remove equipment tags saved for home workouts (only when the athlete owns, bought, added, or sold/removed home equipment—never when gym equipment is temporarily busy).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: 'Add or remove the listed equipment tags.',
        },
        equipment: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['pullup_bar', 'dumbbells', 'bench', 'trx', 'bands'],
          },
          description: 'Equipment tags to add or remove.',
        },
      },
      required: ['action', 'equipment'],
    },
  },
  {
    name: 'switch_program',
    description:
      'Switch the athlete active training plan (e.g. Starter 3-day + active day, Starter 4-day / Upper-Lower, 6-Week Muscle Plan if unlocked, or a saved custom program).',
    parameters: {
      type: 'object',
      properties: {
        program_name: {
          type: 'string',
          description: 'Program name or id (e.g. starter_6wk, starter_4day, 4-day, upper lower, Phase 1 BT).',
        },
      },
      required: ['program_name'],
    },
  },
  {
    name: 'switch_goal_phase',
    description:
      'Switch the athlete primary training goal between Lean Bulk (Build Muscle), Cut / Recomp (Lose Fat), and Maingain (Stay Lean).',
    parameters: {
      type: 'object',
      properties: {
        goal_phase: {
          type: 'string',
          enum: ['Lean Bulk', 'Cut / Recomp', 'Maingain'],
          description: 'Target training goal phase.',
        },
      },
      required: ['goal_phase'],
    },
  },
  {
    name: 'log_rest_day',
    description:
      'Log a rest day by moving today unstarted workout to tomorrow without breaking the athlete streak.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Optional note for resting today.',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_goals',
    description:
      'Update weekly training session target (2-7), daily steps target, personal lift target (weight or reps), featured strength standard lift, or reset goals to plan defaults.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'set_sessions_per_week',
            'set_step_goal',
            'set_lift_goal',
            'set_strength_focus',
            'remove_custom_goal',
            'reset_goals',
          ],
          description: 'Goal operation to perform.',
        },
        value: {
          type: 'number',
          description: 'Numeric target (sessions/week 2-7, steps count, weight amount, or rep count).',
        },
        metric: {
          type: 'string',
          enum: ['weight', 'reps'],
          description: 'Whether a custom lift target is weight or reps.',
        },
        unit: {
          type: 'string',
          enum: ['kg', 'lb'],
          description: 'Weight unit for custom lift weight goals.',
        },
        exercise_name: {
          type: 'string',
          description: 'Lift name (e.g. Bench Press, Chin-Ups, Squat) when setting/removing a lift goal or focus.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'update_progress_widgets',
    description:
      'Add, remove, or reset dashboard cards/charts on the Progress screen (e.g. composition, balance, measurements, trophy, goals, steps, whoop, specific exercise/tape charts).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'reset'],
          description: 'Widget update mode.',
        },
        widget_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of widgets, measurements, or exercises to add or remove.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'log_entry',
    description:
      'Log an athlete-supplied measurement (bodyweight, body fat %, waist circumference) or deliberate active day cardio/sport session.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['bodyweight', 'body_fat', 'waist', 'active_day'],
          description: 'Measurement or activity type.',
        },
        value: {
          type: 'number',
          description: 'Numeric value provided by the athlete (weight, %, waist size, or duration minutes).',
        },
        unit: {
          type: 'string',
          enum: ['kg', 'lb', 'cm', 'in', 'minutes'],
          description: 'Unit for the supplied value.',
        },
        activity_type: {
          type: 'string',
          enum: ['run', 'walk', 'cycle', 'swim', 'row', 'hike', 'class', 'sport', 'strength', 'other'],
          description: 'Activity type when kind is active_day.',
        },
      },
      required: ['kind', 'value'],
    },
  },
  {
    name: 'modify_program',
    description:
      'Create permanent structural changes across all (or filtered) workouts in the athlete active training program: permanently swap an exercise across sessions, add/remove an exercise, adjust working sets across the plan, move a lagging lift first, or clear program adaptations. Uses confirmation_required=true by default so the athlete approves multi-session changes (human-in-the-loop).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['swap_exercise', 'add_exercise', 'remove_exercise', 'adjust_sets', 'prioritize_first', 'clear_overrides'],
          description: 'Program-level adaptation to perform.',
        },
        old_exercise_id: {
          type: 'string',
          description: 'Exercise ID or name currently in the program to swap, remove, adjust, or prioritize.',
        },
        new_exercise_id: {
          type: 'string',
          description: 'Replacement or newly added exercise ID or name.',
        },
        sets: {
          type: 'integer',
          description: 'Target working sets per session (1-10) when adding or adjusting sets.',
        },
        set_delta: {
          type: 'integer',
          description: 'Relative working set change (e.g. +1 or -1) when adjusting sets across sessions.',
        },
        workout_filter: {
          type: 'string',
          description: 'Optional filter (e.g. "Upper", "Legs", "Full Body A", "Chest and Back", "Week 2") to limit which workouts change; omit for all matching workouts.',
        },
        reason: {
          type: 'string',
          description: 'Clinical or athlete rationale (e.g. "shoulder comfort", "balance pull vs push").',
        },
        confirmation_required: {
          type: 'boolean',
          description: 'True to show a human-in-the-loop approval preview before applying permanent plan changes (default true).',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'rebalance_program',
    description:
      'Analyze real strength imbalances (Poliquin pull-vs-push, Kilgore movement tier gaps), left/right asymmetries (<90% symmetry), stalled lifts, saved contraindications, or under-target muscle volume and propose permanent program adaptations with human-in-the-loop confirmation.',
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['auto', 'pull_vs_push', 'level_gap', 'left_right_symmetry', 'plateau', 'contraindication', 'muscle_volume'],
          description: 'Specific imbalance or intervention category to address (default auto).',
        },
        target_muscle_or_pillar: {
          type: 'string',
          description: 'Optional muscle or movement pattern the athlete wants to bring up across the program (e.g. "pull", "rear delts", "hamstrings", "squat").',
        },
        confirmation_required: {
          type: 'boolean',
          description: 'True to present a human-in-the-loop approval card before changing the program (default true).',
        },
      },
      required: [],
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
  biometrics?: BiometricLog[];
  activities?: ActivityLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  place?: CoachPlace;
  supabaseSyncFn?: SupabaseSyncHook;
}

export interface CoachToolOutcome {
  toolName: CoachToolName;
  actionType?: AssistantActionType;
  mutationStatus: CoachMutationStatus;
  summaryText: string;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
  updatedBiometrics?: BiometricLog[];
  updatedActivities?: ActivityLog[];
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
  actionType?: AssistantActionType;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
  updatedBiometrics?: BiometricLog[];
  updatedActivities?: ActivityLog[];
  stateDiff: CoachStateDiff;
  summaryText: string;
  memorySaved?: AthleteMemoryFact;
  navigateTarget?: 'train' | 'program' | 'analytics';
  navigateLabel?: string;
}): Promise<CoachToolOutcome> {
  const {
    context,
    toolName,
    actionType,
    updatedProfile,
    updatedWorkout,
    updatedBiometrics,
    updatedActivities,
    stateDiff,
    summaryText,
    memorySaved,
    navigateTarget,
    navigateLabel,
  } = args;

  const undoSnapshot: CoachUndoSnapshot = {
    label: stateDiff.label,
    previousProfile: updatedProfile
      ? {
          ...context.profile,
          ...('programOverrides' in updatedProfile
            ? { programOverrides: context.profile.programOverrides }
            : {}),
        }
      : undefined,
    previousWorkout: updatedWorkout
      ? {
          ...context.activeWorkout,
          exercises: context.activeWorkout.exercises.map((e) => ({
            ...e,
            sets: e.sets.map((s) => ({ ...s })),
          })),
        }
      : undefined,
    previousBiometrics: updatedBiometrics && context.biometrics ? context.biometrics.map((b) => ({ ...b })) : undefined,
    previousActivities: updatedActivities && context.activities ? context.activities.map((a) => ({ ...a })) : undefined,
  };

  const remote = await syncMutationRemote(context, toolName, updatedProfile, updatedWorkout);
  if (!remote.ok) {
    if (updatedProfile) saveProfile(context.profile);
    if (updatedWorkout) saveActiveWorkout(context.activeWorkout);
    if (updatedBiometrics && context.biometrics) saveBiometrics(context.biometrics);
    if (updatedActivities && context.activities) saveActivities(context.activities);
    return {
      toolName,
      actionType,
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
  if (updatedBiometrics) {
    saveBiometrics(updatedBiometrics);
  }
  if (updatedActivities) {
    saveActivities(updatedActivities);
  }

  return {
    toolName,
    actionType,
    mutationStatus: 'success',
    summaryText,
    updatedProfile,
    updatedWorkout,
    updatedBiometrics,
    updatedActivities,
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
    ? getPlanById(
        requestedProgramId as PlanId,
        context.profile.goalPhase,
        context.profile.customPlans,
        context.profile.programOverrides
      )
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

function cleanExerciseQuery(raw?: string): string {
  return (raw || '')
    .trim()
    .replace(/[?!.,;:]+$/g, '')
    .replace(/\b(?:please|thanks|thank you|today|tonight|now)\b/gi, '')
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bestTokenMatch<T extends { name: string }>(items: T[], query: string): T | undefined {
  const qTokens = normalizeExerciseTokens(query);
  if (qTokens.length === 0) return undefined;
  let best: T | undefined;
  let bestScore = 0;
  for (const item of items) {
    const itemTokens = normalizeExerciseTokens(item.name);
    const overlap = qTokens.filter((t) => itemTokens.includes(t)).length;
    if (overlap === qTokens.length) {
      const score = overlap * 10 - Math.abs(itemTokens.length - qTokens.length);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  return best;
}

export function resolveWorkoutExerciseByName(
  query: string,
  workout: WorkoutSession,
  catalog: ExerciseDefinition[]
): ExerciseSession | undefined {
  return findWorkoutExercise(query, workout, catalog);
}

function findWorkoutExercise(query: string, workout: WorkoutSession, catalog: ExerciseDefinition[]): ExerciseSession | undefined {
  const cleaned = cleanExerciseQuery(query);
  if (!cleaned) return undefined;
  const q = cleaned.toLowerCase();
  return (
    workout.exercises.find((e) => e.id.toLowerCase() === q || e.exerciseId.toLowerCase() === q) ??
    workout.exercises.find((e) => e.name.toLowerCase() === q) ??
    findExerciseNamed(q, workout, catalog)?.session ??
    workout.exercises.find((e) => e.name.toLowerCase().includes(q) || q.includes(e.name.toLowerCase())) ??
    bestTokenMatch(workout.exercises, cleaned)
  );
}

function normalizeExerciseTokens(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'to', 'for', 'with', 'in', 'on', 'of', 'my', 'today', 'todays', 'workout', 'session']);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((tok) => {
      if (tok === 'db' || tok === 'dbs') return 'dumbbell';
      if (tok === 'bb') return 'barbell';
      if (tok === 'ohp') return 'overhead';
      if (tok === 'rdl' || tok === 'rdls') return 'romanian';
      if (tok === 'flyes' || tok === 'flies') return 'fly';
      if (tok === 'pulldowns') return 'pulldown';
      if (tok === 'pushdowns') return 'pushdown';
      if (tok === 'pullups') return 'pullup';
      if (tok === 'chinups') return 'chinup';
      if (tok === 'raises') return 'raise';
      if (tok === 'presses') return 'press';
      if (tok === 'crunches') return 'crunch';
      if (tok.length > 4 && tok.endsWith('s') && !tok.endsWith('ss')) return tok.slice(0, -1);
      return tok;
    })
    .filter((tok) => !stopWords.has(tok));
}

export function resolveCatalogExerciseByName(
  query: string,
  catalog: ExerciseDefinition[],
  workout?: WorkoutSession
): ExerciseDefinition | undefined {
  return findCatalogExercise(query, catalog, workout);
}

function findCatalogExercise(query: string, catalog: ExerciseDefinition[], workout?: WorkoutSession): ExerciseDefinition | undefined {
  const cleaned = cleanExerciseQuery(query);
  if (!cleaned) return undefined;
  const q = cleaned.toLowerCase();
  const byId = catalog.find((d) => d.id.toLowerCase() === q);
  if (byId) return byId;
  const byExact = catalog.find((d) => d.name.toLowerCase() === q);
  if (byExact) return byExact;
  const bySub = catalog.find((d) => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase()));
  if (bySub) return bySub;
  const byToken = bestTokenMatch(catalog, cleaned);
  if (byToken) return byToken;
  const dummyWorkout: WorkoutSession = workout ?? {
    id: 'catalog-lookup',
    date: localDateString(),
    name: 'Lookup',
    splitDay: 'Full Body',
    exercises: [],
    completed: false,
    readinessState: 'Normal',
    readinessZScore: 0,
  };
  return findExerciseNamed(q, dummyWorkout, catalog)?.def;
}

function findBestReplacementExercise(
  currentEx: ExerciseSession,
  requestedNew: string | undefined,
  catalog: ExerciseDefinition[],
  todayWorkout: WorkoutSession,
  context: CoachToolExecutionContext
): ExerciseDefinition | undefined {
  const avoidedIds = new Set(
    deriveContraindicationEdges(context.profile.athleteMemories ?? [], catalog)
      .filter((edge) => edge.severity === 'avoid')
      .map((edge) => edge.to_exercise_id)
  );
  const where = todayWorkout.location ?? 'gym';
  const homeEquip = context.profile.homeEquipment ?? [];
  const fitsHomeEquip = (d: ExerciseDefinition) =>
    where !== 'home' ||
    !d.requiredHomeEquipment?.length ||
    d.requiredHomeEquipment.every((tag) => homeEquip.includes(tag));

  const cleanedNew = cleanExerciseQuery(requestedNew);
  if (cleanedNew) {
    const q = cleanedNew.toLowerCase();
    const byId = catalog.find((d) => d.id.toLowerCase() === q);
    if (byId && byId.id !== currentEx.exerciseId) return byId;
    const byExact = catalog.find((d) => d.name.toLowerCase() === q);
    if (byExact && byExact.id !== currentEx.exerciseId) return byExact;
    const bySafeSubstring = catalog.find(
      (d) =>
        d.id !== currentEx.exerciseId &&
        !avoidedIds.has(d.id) &&
        fitsHomeEquip(d) &&
        (d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase()))
    );
    if (bySafeSubstring) return bySafeSubstring;
    const namedCatalog = findCatalogExercise(cleanedNew, catalog, todayWorkout);
    if (namedCatalog && namedCatalog.id !== currentEx.exerciseId) return namedCatalog;
    const bySubstring = catalog.find(
      (d) => d.id !== currentEx.exerciseId && (d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase()))
    );
    if (bySubstring) return bySubstring;
  }

  const currentDef = catalog.find((d) => d.id === currentEx.exerciseId);
  const existingIds = new Set(todayWorkout.exercises.map((e) => e.exerciseId));
  return (
    catalog.find(
      (d) =>
        d.id !== currentEx.exerciseId &&
        !existingIds.has(d.id) &&
        !avoidedIds.has(d.id) &&
        (!d.environments || d.environments.includes(where)) &&
        fitsHomeEquip(d) &&
        d.pillar === currentEx.pillar &&
        (!currentDef?.primaryMuscle || d.primaryMuscle === currentDef.primaryMuscle)
    ) ??
    catalog.find(
      (d) =>
        d.id !== currentEx.exerciseId &&
        !existingIds.has(d.id) &&
        !avoidedIds.has(d.id) &&
        (!d.environments || d.environments.includes(where)) &&
        fitsHomeEquip(d) &&
        d.pillar === currentEx.pillar
    )
  );
}

function buildSwappedExerciseSession(
  targetEx: ExerciseSession,
  replacement: ExerciseDefinition,
  context: CoachToolExecutionContext
): {
  replacementEx: ExerciseSession;
  completedSets: WorkoutSet[];
  targetWeightKg: number;
} {
  const { activeWorkout } = context;
  const unit = context.profile.weightUnit || 'kg';
  const completedSets = targetEx.sets.filter((s) => s.completed);
  const completedWorkingCount = completedSets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length;
  const totalWorkingCount = Math.max(1, targetEx.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length);
  const remainingWorkingCount = Math.max(1, totalWorkingCount - completedWorkingCount);

  const rx = prescribeExerciseSwap({
    sourceExercise: targetEx,
    targetDef: replacement,
    workouts: context.workouts,
    readinessState: context.readinessState,
    goalPhase: context.profile.goalPhase,
    bodyweightEmaKg: context.bodyweightEmaKg,
    location: activeWorkout.location || context.profile.activeLocation || 'gym',
    unit,
  });

  const timed = rx.isTimed;
  const holdSecs = replacement.defaultDurationSeconds || 45;
  const targetWeightKg = rx.isPureBodyweight ? 0 : rx.targetWeightKg;
  const targetReps = timed ? 1 : rx.targetReps;
  const meta = getExerciseBiomechanicalMeta(replacement);

  const baseReplacement: ExerciseSession = {
    id: completedSets.length > 0 ? `${targetEx.id}-swap-${Date.now()}` : targetEx.id,
    exerciseId: replacement.id,
    name: replacement.name,
    pillar: replacement.pillar,
    equipment: replacement.equipment,
    isRdl: replacement.isRdl,
    isWeightedCalisthenic: replacement.isWeightedCalisthenic,
    isIsolation: meta.isIsolation,
    movementFamily: getMovementVectorId(replacement),
    movementFamilyLabel: getMovementFamilyLabel(replacement),
    resistanceProfile: meta.resistanceProfile,
    sfrScore: meta.sfrScore,
    minReps: timed ? 1 : replacement.defaultRepRange[0],
    maxReps: timed ? 1 : replacement.defaultRepRange[1],
    tempo: replacement.isIsolation ? '2-1-1-0' : '3-0-1-0',
    ...(timed
      ? {
          repTargetType: 'duration' as const,
          durationSeconds: holdSecs,
          tempo: `${holdSecs}sec`,
        }
      : {}),
    notes: timed
      ? rx.rationale
      : rx.tempoCue
      ? `${rx.tempoCue}. ${rx.rationale}.`
      : meta.resistanceProfile === 'lengthened'
      ? `${rx.rationale}. Focus on a controlled stretch at the bottom of each rep.`
      : `${rx.rationale}. Keep a steady, controlled pace on every rep.`,
    sets: Array.from({ length: remainingWorkingCount }, (_, idx) => ({
      id: `swap-${replacement.id}-${Date.now()}-${idx}`,
      setNumber: idx + 1,
      setType: 'working' as const,
      targetWeightKg,
      actualWeightKg: targetWeightKg,
      targetReps,
      actualReps: targetReps,
      targetRir: context.readinessState === 'Amber Shield' ? 2 : 2,
      actualRir: 2,
      ...(timed ? { targetDurationSeconds: holdSecs, actualDurationSeconds: holdSecs } : {}),
      completed: false,
    })),
  };

  const preparedSingle = prepareSessionForAthlete(
    { ...activeWorkout, exercises: [baseReplacement] },
    {
      history: context.workouts,
      bodyweightKg: context.bodyweightEmaKg,
      readinessState: context.readinessState,
      gender: context.profile.gender,
      experienceLevel: context.profile.experienceLevel,
      unit,
      isProgramPlan: isPlanProgram(context.profile.programType),
    }
  ).exercises[0];

  const replacementEx: ExerciseSession = {
    ...preparedSingle,
    sets: preparedSingle.sets.map((st, idx) =>
      targetWeightKg > 0 && (st.targetWeightKg ?? 0) <= 0
        ? { ...st, setNumber: idx + 1, targetWeightKg, actualWeightKg: targetWeightKg }
        : { ...st, setNumber: idx + 1 }
    ),
  };

  return { replacementEx, completedSets, targetWeightKg };
}

export async function executeSwapExercise(
  rawArgs: SwapExerciseArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout, exerciseCatalog } = context;
  const oldQuery = cleanExerciseQuery(rawArgs.old_exercise_id);
  const targetEx = findWorkoutExercise(oldQuery, activeWorkout, exerciseCatalog);

  if (!targetEx) {
    const names = activeWorkout.exercises.map((e) => e.name).join(', ');
    return {
      toolName: 'swap_exercise',
      actionType: 'SWAP_EXERCISE',
      mutationStatus: 'error',
      summaryText: names
        ? `Couldn't find "${oldQuery || 'that exercise'}" in today's **${activeWorkout.name}** session (today's exercises: ${names}). No exercises were changed.`
        : `Couldn't find "${oldQuery || 'that exercise'}" in today's **${activeWorkout.name}** session. No exercises were changed.`,
      errorMessage: 'Exercise not in active workout.',
    };
  }

  const replacement = findBestReplacementExercise(targetEx, rawArgs.new_exercise_id, exerciseCatalog, activeWorkout, context);
  if (!replacement) {
    return {
      toolName: 'swap_exercise',
      actionType: 'SWAP_EXERCISE',
      mutationStatus: 'error',
      summaryText: `Couldn't find a matching replacement for **${targetEx.name}** in the exercise library. No exercises were changed.`,
      errorMessage: 'Replacement exercise not found.',
    };
  }

  const { replacementEx: finalReplacement, completedSets } = buildSwappedExerciseSession(
    targetEx,
    replacement,
    context
  );

  const updatedWorkout: WorkoutSession = {
    ...activeWorkout,
    exercises:
      completedSets.length === 0
        ? activeWorkout.exercises.map((ex) => (ex.id === targetEx.id ? finalReplacement : ex))
        : activeWorkout.exercises.flatMap((ex) =>
            ex.id === targetEx.id
              ? [
                  {
                    ...targetEx,
                    sets: completedSets.map((st, idx) => ({ ...st, setNumber: idx + 1 })),
                  },
                  finalReplacement,
                ]
              : [ex]
          ),
  };

  const reasonSuffix = rawArgs.reason ? ` (${rawArgs.reason})` : '';
  return commitMutationTransaction({
    context,
    toolName: 'swap_exercise',
    actionType: 'SWAP_EXERCISE',
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
  const { activeWorkout, exerciseCatalog } = context;
  const workingCountBefore = activeWorkout.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length,
    0
  );
  if (workingCountBefore === 0) {
    return {
      toolName: 'adjust_workout_volume',
      actionType: 'ADJUST_WORKOUT_VOLUME',
      mutationStatus: 'error',
      summaryText: `There are no working sets in **${activeWorkout.name}** to adjust.`,
      errorMessage: 'Empty workout.',
    };
  }

  if (rawArgs.modifier_type === 'increase_sets' && context.readinessState === 'Amber Shield') {
    return {
      toolName: 'adjust_workout_volume',
      actionType: 'ADJUST_WORKOUT_VOLUME',
      mutationStatus: 'error',
      summaryText: `Recovery is low today, so working sets in **${activeWorkout.name}** stay capped to protect your joints and recovery.`,
      errorMessage: 'Cannot increase sets during Amber Shield recovery.',
    };
  }

  // Scope to a single named exercise if details mentions one specifically (unless asking for all/workout-wide).
  const detailText = (rawArgs.details || '').toLowerCase();
  const isWorkoutWide = /\b(all|every|each|whole|entire|workout|session)\b/.test(detailText);
  const specificEx =
    detailText && !isWorkoutWide && rawArgs.modifier_type !== 'short_on_time'
      ? findWorkoutExercise(detailText, activeWorkout, exerciseCatalog)
      : undefined;

  const unit = context.profile.weightUnit || 'kg';
  let changed = false;
  const updatedExercises = activeWorkout.exercises.map((ex, exIdx) => {
    if (specificEx && ex.id !== specificEx.id) return ex;
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
      actionType: 'ADJUST_WORKOUT_VOLUME',
      mutationStatus: 'error',
      summaryText: specificEx
        ? `**${specificEx.name}** is already at its minimum or completed. No volume changes were made.`
        : `Every exercise in **${activeWorkout.name}** is already at its minimum or completed. No volume changes were made.`,
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

  const scopeLabel = specificEx ? `${specificEx.name} in **${activeWorkout.name}**` : `**${activeWorkout.name}**`;
  return commitMutationTransaction({
    context,
    toolName: 'adjust_workout_volume',
    actionType: 'ADJUST_WORKOUT_VOLUME',
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
        ? `Lightened uncompleted sets in ${scopeLabel} by ~10% and set target effort to 2 RIR.`
        : `Adjusted ${scopeLabel} from ${workingCountBefore} to **${workingCountAfter} working sets**.`,
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
      actionType: 'SAVE_ATHLETE_MEMORY',
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
    actionType: 'SAVE_ATHLETE_MEMORY',
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

export interface ModifyWorkoutExercisesArgs {
  action: 'add' | 'remove';
  exercise_name: string;
  sets?: number;
  reason?: string;
}

function buildCalibratedAddedExercise(
  def: ExerciseDefinition,
  setsCount: number,
  workout: WorkoutSession,
  context: CoachToolExecutionContext
): { exercise: ExerciseSession; fallbackKg: number; isPureBw: boolean } {
  const unit = context.profile.weightUnit || 'kg';
  const meta = getExerciseBiomechanicalMeta(def);
  const timed = isTimedExercise(def);
  const isPureBw = def.equipment === 'bodyweight' && !def.isWeightedCalisthenic;
  const holdSecs = def.defaultDurationSeconds || 45;
  const cleanSets = Math.max(1, Math.min(8, Math.round(setsCount || 3)));
  const seedEx: ExerciseSession = {
    id: `coach-add-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    exerciseId: def.id,
    name: def.name,
    pillar: def.pillar,
    equipment: def.equipment,
    isRdl: def.isRdl,
    isWeightedCalisthenic: def.isWeightedCalisthenic,
    isIsolation: meta.isIsolation,
    movementFamily: getMovementVectorId(def),
    movementFamilyLabel: getMovementFamilyLabel(def),
    resistanceProfile: meta.resistanceProfile,
    sfrScore: meta.sfrScore,
    minReps: timed ? 1 : def.defaultRepRange[0],
    maxReps: timed ? 1 : def.defaultRepRange[1],
    ...(timed ? { repTargetType: 'duration' as const, durationSeconds: holdSecs, tempo: `${holdSecs}sec` } : {}),
    notes: timed
      ? `Hold with controlled tension for ${holdSecs}s per set.`
      : meta.resistanceProfile === 'lengthened'
      ? 'Focus on a controlled stretch at the bottom of each rep.'
      : 'Keep a steady, controlled pace on every rep.',
    sets: Array.from({ length: cleanSets }, (_, i) => i + 1).map((n) => ({
      id: `coach-s-${Date.now()}-${n}`,
      setNumber: n,
      targetWeightKg: isPureBw ? 0 : def.equipment === 'dumbbell' ? (usesOneDumbbell(def) ? 16 : 12) : 40,
      targetReps: timed ? 1 : def.defaultRepRange[0],
      targetRir: n === cleanSets ? 1 : 2,
      ...(timed ? { targetDurationSeconds: holdSecs, actualDurationSeconds: holdSecs } : {}),
      completed: false,
      setType: 'working' as const,
    })),
  };

  const rx = prescribeDoubleProgression(
    seedEx,
    context.readinessState,
    context.workouts,
    context.bodyweightEmaKg,
    context.profile.goalPhase
  );
  const fallbackKg = isPureBw
    ? 0
    : startingWeightForNewExercise(workout, seedEx, {
        history: context.workouts,
        bodyweightKg: context.bodyweightEmaKg,
        readinessState: context.readinessState,
        gender: context.profile.gender,
        experienceLevel: context.profile.experienceLevel,
        unit,
      }) ?? rx.nextWeightKg;

  const baseHydrated: ExerciseSession = {
    ...seedEx,
    sets: seedEx.sets.map((s, idx) => ({
      ...s,
      targetWeightKg: fallbackKg,
      actualWeightKg: fallbackKg,
      targetReps: timed ? 1 : (rx.nextTargetReps[idx] ?? def.defaultRepRange[0]),
      actualReps: timed ? 1 : (rx.nextTargetReps[idx] ?? def.defaultRepRange[0]),
    })),
  };
  const isFirstComp = isFirstCompoundForPillar(
    baseHydrated,
    workout.exercises.length,
    [...workout.exercises, baseHydrated]
  );
  return {
    exercise: timed ? baseHydrated : ensureWarmupSetsOnExercise(baseHydrated, isFirstComp),
    fallbackKg,
    isPureBw,
  };
}

export async function executeModifyWorkoutExercises(
  rawArgs: ModifyWorkoutExercisesArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout, exerciseCatalog } = context;
  const query = cleanExerciseQuery(rawArgs.exercise_name);
  if (!query) {
    return {
      toolName: 'modify_workout_exercises',
      actionType: rawArgs.action === 'remove' ? 'REMOVE_EXERCISE' : 'ADD_EXERCISE',
      mutationStatus: 'error',
      summaryText: 'Tell me which exercise you want to add or remove from today\'s workout.',
      errorMessage: 'Missing exercise name.',
    };
  }

  if (rawArgs.action === 'remove') {
    const target = findWorkoutExercise(query, activeWorkout, exerciseCatalog);
    if (!target) {
      return {
        toolName: 'modify_workout_exercises',
        actionType: 'REMOVE_EXERCISE',
        mutationStatus: 'error',
        summaryText: `Couldn't find "${query}" in today's **${activeWorkout.name}** session. No exercises were removed.`,
        errorMessage: 'Exercise not in active workout.',
      };
    }
    const completedSets = target.sets.filter((s) => s.completed);
    const pendingSets = target.sets.filter((s) => !s.completed);
    if (completedSets.length > 0 && pendingSets.length === 0) {
      return {
        toolName: 'modify_workout_exercises',
        actionType: 'REMOVE_EXERCISE',
        mutationStatus: 'error',
        summaryText: `All sets on **${target.name}** are already logged, so it stays in **${activeWorkout.name}**.`,
        errorMessage: 'Cannot remove exercise with all sets completed.',
      };
    }
    if (completedSets.length === 0 && activeWorkout.exercises.length <= 1) {
      return {
        toolName: 'modify_workout_exercises',
        actionType: 'REMOVE_EXERCISE',
        mutationStatus: 'error',
        summaryText: `**${target.name}** is the only exercise left in **${activeWorkout.name}**. Swap it for another lift or log a rest day instead.`,
        errorMessage: 'Cannot empty active workout.',
      };
    }
    const nextExercises =
      completedSets.length === 0
        ? activeWorkout.exercises.filter((e) => e.id !== target.id)
        : activeWorkout.exercises.map((e) =>
            e.id === target.id
              ? { ...e, sets: completedSets.map((s, idx) => ({ ...s, setNumber: idx + 1 })) }
              : e
          );
    return commitMutationTransaction({
      context,
      toolName: 'modify_workout_exercises',
      actionType: 'REMOVE_EXERCISE',
      updatedWorkout: { ...activeWorkout, exercises: nextExercises },
      stateDiff: {
        object_type: 'Workout',
        object_id: activeWorkout.id,
        label: 'Exercise Removed',
        previous_state: { display: `${activeWorkout.exercises.length} exercises` },
        new_state: { display: `${nextExercises.length} exercises (removed ${target.name})` },
      },
      summaryText:
        completedSets.length > 0
          ? `Kept your ${completedSets.length} logged set${completedSets.length === 1 ? '' : 's'} on **${target.name}** and removed remaining pending sets from **${activeWorkout.name}**.`
          : `Removed **${target.name}** from **${activeWorkout.name}**.`,
      navigateTarget: 'train',
      navigateLabel: 'View Workout',
    });
  }

  const def = findCatalogExercise(query, exerciseCatalog, activeWorkout);
  if (!def) {
    return {
      toolName: 'modify_workout_exercises',
      actionType: 'ADD_EXERCISE',
      mutationStatus: 'error',
      summaryText: `Couldn't find "${query}" in the exercise library. No exercises were added.`,
      errorMessage: 'Exercise not found.',
    };
  }
  if (activeWorkout.exercises.some((e) => e.exerciseId === def.id)) {
    return {
      toolName: 'modify_workout_exercises',
      actionType: 'ADD_EXERCISE',
      mutationStatus: 'error',
      summaryText: `**${def.name}** is already in today's **${activeWorkout.name}** session.`,
      errorMessage: 'Exercise already present.',
    };
  }

  const unit = context.profile.weightUnit || 'kg';
  const { exercise: finalEx, fallbackKg, isPureBw } = buildCalibratedAddedExercise(
    def,
    rawArgs.sets ?? 3,
    activeWorkout,
    context
  );

  return commitMutationTransaction({
    context,
    toolName: 'modify_workout_exercises',
    actionType: 'ADD_EXERCISE',
    updatedWorkout: { ...activeWorkout, exercises: [...activeWorkout.exercises, finalEx] },
    stateDiff: {
      object_type: 'Workout',
      object_id: activeWorkout.id,
      label: 'Exercise Added',
      previous_state: { display: `${activeWorkout.exercises.length} exercises` },
      new_state: { display: `${activeWorkout.exercises.length + 1} exercises (+ ${def.name})` },
    },
    summaryText: `Added **${def.name}** (${finalEx.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length} working sets @ ${isPureBw ? 'bodyweight' : `${formatWeight(fallbackKg, unit)}${def.equipment === 'dumbbell' && !usesOneDumbbell(def) ? ' each' : ''}`}) to **${activeWorkout.name}**.`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

const LOCATION_LABELS: Record<TrainingLocation, string> = {
  gym: 'Full Gym',
  home: 'At Home',
  travel: 'Bodyweight',
};

export interface SwitchLocationArgs {
  location: TrainingLocation;
  week?: number;
}

export async function executeSwitchLocation(
  rawArgs: SwitchLocationArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const targetLoc: TrainingLocation =
    rawArgs.location === 'home' || rawArgs.location === 'travel' ? rawArgs.location : 'gym';
  const equipNames: Record<HomeEquipmentTag, string> = {
    pullup_bar: 'Pull-Up Bar',
    dumbbells: 'Dumbbells',
    bench: 'Exercise Bench',
    trx: 'TRX Suspension Trainer',
    bands: 'Resistance Bands',
  };

  if (typeof rawArgs.week === 'number' && rawArgs.week >= 1 && rawArgs.week <= 6) {
    const targetWeek = Math.round(rawArgs.week);
    const currentSchedule = { ...(context.profile.scheduledWeekLocations || {}) };
    const prevWeekLoc = currentSchedule[targetWeek] ?? context.profile.activeLocation ?? 'gym';
    currentSchedule[targetWeek] = targetLoc;
    const updatedProfile: Partial<UserProfile> = { scheduledWeekLocations: currentSchedule };
    let updatedWorkout: WorkoutSession | undefined;

    if ((context.profile.mesocycleWeek || 1) === targetWeek && context.activeWorkout.location !== targetLoc) {
      const adapted = adaptWorkoutSessionToLocation(
        context.activeWorkout,
        targetLoc,
        context.profile.homeEquipment || [],
        context.exerciseCatalog,
        context.workouts,
        context.readinessState,
        context.bodyweightEmaKg
      );
      updatedWorkout = prepareSessionForAthlete(adapted, {
        history: context.workouts,
        bodyweightKg: context.bodyweightEmaKg,
        readinessState: context.readinessState,
        gender: context.profile.gender,
        experienceLevel: context.profile.experienceLevel,
        unit: context.profile.weightUnit || 'kg',
        isProgramPlan: isPlanProgram(context.profile.programType),
      });
      updatedProfile.activeLocation = targetLoc;
    }

    const summary =
      targetLoc === 'travel'
        ? `Done. Week ${targetWeek} of your plan is set to bodyweight training. When you reach it, each workout switches to exercises that need no equipment, like push-ups, split squats and inverted rows, with reps matched to your strength. Back early? Switch to the gym from the Workout tab.`
        : `Scheduled Week ${targetWeek} for **${LOCATION_LABELS[targetLoc]}** mode.`;

    return commitMutationTransaction({
      context,
      toolName: 'switch_location',
      actionType: 'SCHEDULE_LOCATION_WEEK',
      updatedProfile,
      updatedWorkout,
      stateDiff: {
        object_type: 'Program',
        object_id: `week-${targetWeek}`,
        label: `Week ${targetWeek} Location`,
        previous_state: { display: `Week ${targetWeek}: ${LOCATION_LABELS[prevWeekLoc]}` },
        new_state: { display: `Week ${targetWeek}: ${LOCATION_LABELS[targetLoc]}` },
      },
      summaryText: summary,
      navigateTarget: updatedWorkout ? 'train' : 'program',
      navigateLabel: updatedWorkout ? 'View Workout' : 'View Program',
    });
  }

  const prevLoc = context.activeWorkout.location ?? context.profile.activeLocation ?? 'gym';
  const adapted = adaptWorkoutSessionToLocation(
    context.activeWorkout,
    targetLoc,
    context.profile.homeEquipment || [],
    context.exerciseCatalog,
    context.workouts,
    context.readinessState,
    context.bodyweightEmaKg
  );
  const updatedWorkout = prepareSessionForAthlete(adapted, {
    history: context.workouts,
    bodyweightKg: context.bodyweightEmaKg,
    readinessState: context.readinessState,
    gender: context.profile.gender,
    experienceLevel: context.profile.experienceLevel,
    unit: context.profile.weightUnit || 'kg',
    isProgramPlan: isPlanProgram(context.profile.programType),
  });
  const reply =
    targetLoc === 'travel'
      ? `Switched today's workout to bodyweight. Every exercise now needs no equipment, with reps matched to your strength.`
      : targetLoc === 'home'
      ? `Switched today's workout to home. It now uses ${(context.profile.homeEquipment || []).map((t) => equipNames[t] || t).join(', ') || 'your bodyweight'}.`
      : `Switched today's workout back to the gym, with barbells, cables and machines available again.`;

  return commitMutationTransaction({
    context,
    toolName: 'switch_location',
    actionType: 'SWITCH_LOCATION',
    updatedProfile: { activeLocation: targetLoc },
    updatedWorkout,
    stateDiff: {
      object_type: 'Workout',
      object_id: context.activeWorkout.id,
      label: 'Location Switched',
      previous_state: { display: LOCATION_LABELS[prevLoc] },
      new_state: { display: LOCATION_LABELS[targetLoc] },
    },
    summaryText: reply,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface UpdateHomeEquipmentArgs {
  action: 'add' | 'remove';
  equipment: HomeEquipmentTag[];
}

export async function executeUpdateHomeEquipment(
  rawArgs: UpdateHomeEquipmentArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const equipNames: Record<HomeEquipmentTag, string> = {
    pullup_bar: 'Pull-Up Bar',
    dumbbells: 'Dumbbells',
    bench: 'Exercise Bench',
    trx: 'TRX Suspension Trainer',
    bands: 'Resistance Bands',
  };
  const validTags = (rawArgs.equipment || []).filter((t): t is HomeEquipmentTag => t in equipNames);
  if (validTags.length === 0) {
    return {
      toolName: 'update_home_equipment',
      actionType: 'UPDATE_EQUIPMENT',
      mutationStatus: 'error',
      summaryText: 'No recognized home equipment items were named (supported: Pull-Up Bar, Dumbbells, Bench, TRX, Resistance Bands).',
      errorMessage: 'No recognized equipment tags.',
    };
  }

  const prevList = context.profile.homeEquipment || [];
  const nextSet = new Set<HomeEquipmentTag>(prevList);
  for (const tag of validTags) {
    if (rawArgs.action === 'remove') nextSet.delete(tag);
    else nextSet.add(tag);
  }
  const nextEquip = Array.from(nextSet);
  const changedLabels = validTags.map((t) => equipNames[t]).join(', ');

  let updatedWorkout: WorkoutSession | undefined;
  if (context.activeWorkout.location === 'home') {
    const adapted = adaptWorkoutSessionToLocation(
      context.activeWorkout,
      'home',
      nextEquip,
      context.exerciseCatalog,
      context.workouts,
      context.readinessState,
      context.bodyweightEmaKg
    );
    updatedWorkout = prepareSessionForAthlete(adapted, {
      history: context.workouts,
      bodyweightKg: context.bodyweightEmaKg,
      readinessState: context.readinessState,
      gender: context.profile.gender,
      experienceLevel: context.profile.experienceLevel,
      unit: context.profile.weightUnit || 'kg',
      isProgramPlan: isPlanProgram(context.profile.programType),
    });
  }

  let reply: string;
  if (rawArgs.action === 'remove') {
    reply = `Done. Removed ${changedLabels} from your home equipment, so your home workouts and swap options won't use ${validTags.length === 1 ? 'it' : 'them'}.`;
  } else if (validTags.length === 1 && validTags[0] === 'pullup_bar') {
    reply = `Nice addition. I've added the Pull-Up Bar to your home equipment, so your home workouts can now include pull-ups and chin-ups.`;
  } else if (validTags.length === 1 && validTags[0] === 'dumbbells') {
    reply = `Great. I've added Dumbbells to your home equipment, so your home workouts can now include dumbbell presses, rows and Romanian deadlifts.`;
  } else if (validTags.length === 1 && validTags[0] === 'bench') {
    reply = `Added an Exercise Bench to your home equipment. Your home workouts can now include flat and incline presses with proper back support.`;
  } else if (validTags.length === 1 && validTags[0] === 'trx') {
    reply = `Added the TRX Suspension Trainer to your home equipment. Your home workouts can now include TRX rows, push-ups and single-leg squats.`;
  } else {
    reply = `Added ${changedLabels} to your home equipment. Your home workouts and swap options can now use ${validTags.length === 1 ? 'it' : 'them'}.`;
  }

  return commitMutationTransaction({
    context,
    toolName: 'update_home_equipment',
    actionType: 'UPDATE_EQUIPMENT',
    updatedProfile: { homeEquipment: nextEquip },
    updatedWorkout,
    stateDiff: {
      object_type: 'Athlete',
      object_id: 'home-equipment',
      label: 'Equipment Updated',
      previous_state: { display: prevList.map((t) => equipNames[t]).join(', ') || 'None' },
      new_state: { display: nextEquip.map((t) => equipNames[t]).join(', ') || 'None' },
    },
    summaryText: reply,
    navigateTarget: updatedWorkout ? 'train' : undefined,
    navigateLabel: updatedWorkout ? 'View Workout' : undefined,
  });
}

export interface SwitchProgramArgs {
  program_name: string;
}

export function resolveProgramSelection(
  query: string,
  profile: UserProfile
): { id: ProgramSplitType; name: string } | null {
  const lower = query.toLowerCase().trim();
  if (!lower) return null;
  for (const custom of profile.customPlans ?? []) {
    const cname = custom.name.toLowerCase();
    if (
      lower === custom.id.toLowerCase() ||
      lower.includes(cname) ||
      cname.includes(lower) ||
      (cname.includes('phase 1') && /\bphase\s*1\b/i.test(lower)) ||
      (cname.includes('bt') && /\bbt\b/i.test(lower))
    ) {
      return { id: custom.id, name: custom.name };
    }
  }
  if (/\b(muscle_building_6wk|6[\s-]*week\s*muscle|muscle\s*building|muscle\s*plan)\b/i.test(lower)) {
    return { id: 'muscle_building_6wk', name: '6-Week Muscle Building Plan' };
  }
  if (/\b(starter_4day|4[\s-]*day|lift\s*4|four\s*day|upper\s*\/?\s*lower)\b/i.test(lower)) {
    return { id: 'starter_4day', name: '6-Week Starter Plan' };
  }
  if (/\b(starter_6wk|starter\s*plan|starter|3[\s-]*day|three\s*day|3\s*workouts?)\b/i.test(lower)) {
    return { id: 'starter_6wk', name: '6-Week Starter Plan' };
  }
  return null;
}

export async function executeSwitchProgram(
  rawArgs: SwitchProgramArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const matchedPlan = resolveProgramSelection(rawArgs.program_name || '', context.profile);
  const currentPlan = resolveActivePlan(context.profile);
  if (!matchedPlan) {
    return {
      toolName: 'switch_program',
      actionType: 'SWITCH_PROGRAM_SPLIT',
      mutationStatus: 'error',
      summaryText: `Couldn't find a saved plan matching "${rawArgs.program_name || 'that'}". Active program remains **${currentPlan.name}**.`,
      errorMessage: 'Program not found.',
    };
  }
  if (matchedPlan.id === 'muscle_building_6wk' && !canUseMusclePlan(context.profile.email)) {
    return {
      toolName: 'switch_program',
      actionType: 'SWITCH_PROGRAM_SPLIT',
      mutationStatus: 'error',
      summaryText: `The 6-Week Muscle Building Plan isn't enabled on this account, so I kept **${currentPlan.name}** active.`,
      errorMessage: 'Program not unlocked.',
    };
  }

  const nextProfile: UserProfile = { ...context.profile, programType: matchedPlan.id };
  const targetPlan = resolveActivePlan(nextProfile);
  const nextNum = getNextProgramWorkoutNumber(context.workouts, targetPlan, nextProfile.planCycleStarts);
  const nextWeek = targetPlan.templates.find((t) => t.workoutNumber === nextNum)?.week ?? 1;
  const freshWorkout = buildPreparedSessionForReset(targetPlan, nextNum, context, nextProfile);

  return commitMutationTransaction({
    context,
    toolName: 'switch_program',
    actionType: 'SWITCH_PROGRAM_SPLIT',
    updatedProfile: { programType: matchedPlan.id, mesocycleWeek: nextWeek },
    updatedWorkout: freshWorkout,
    stateDiff: {
      object_type: 'Program',
      object_id: targetPlan.id,
      label: 'Program Updated',
      previous_state: { display: currentPlan.name },
      new_state: { display: targetPlan.name },
    },
    summaryText: `Switched your program to **${targetPlan.name}**. Your next session on the Workout tab is **Workout ${nextNum} of ${targetPlan.templates.length}: ${planWorkoutLabel(freshWorkout.name)}** (Week ${nextWeek}).`,
    navigateTarget: 'program',
    navigateLabel: 'View Program',
  });
}

export interface SwitchGoalPhaseArgs {
  goal_phase: GoalPhase;
}

export async function executeSwitchGoalPhase(
  rawArgs: SwitchGoalPhaseArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const prevGoal = context.profile.goalPhase;
  const targetGoal: GoalPhase =
    rawArgs.goal_phase === 'Cut / Recomp' || rawArgs.goal_phase === 'Maingain' ? rawArgs.goal_phase : 'Lean Bulk';

  const nextProfile: UserProfile = { ...context.profile, goalPhase: targetGoal };
  let updatedWorkout: WorkoutSession | undefined;
  const hasStartedSets = context.activeWorkout.exercises.some((ex) => ex.sets.some((st) => st.completed));
  if (!hasStartedSets && isPlanProgram(nextProfile.programType)) {
    const plan = resolveActivePlan(nextProfile);
    if (plan.id !== 'muscle_building_6wk' && !plan.id.startsWith('custom:')) {
      const nextNum = getNextProgramWorkoutNumber(context.workouts, plan, nextProfile.planCycleStarts);
      updatedWorkout = buildPreparedSessionForReset(plan, nextNum, context, nextProfile);
    }
  }

  const reply =
    targetGoal === 'Cut / Recomp'
      ? `Your goal is now ${GOAL_DISPLAY_NAME[targetGoal]}. From your next workout the big lifts stay heavy, with no extra sets, so you keep your strength and muscle while you eat a little less.`
      : targetGoal === 'Lean Bulk'
      ? `Your goal is now ${GOAL_DISPLAY_NAME[targetGoal]}. From your next workout your sets build across the 6 weeks, with an extra set on smaller muscles in the last two weeks.`
      : `Your goal is now ${GOAL_DISPLAY_NAME[targetGoal]}. From your next workout you'll keep a steady 3 sets per exercise to get stronger without wearing yourself down.`;

  return commitMutationTransaction({
    context,
    toolName: 'switch_goal_phase',
    actionType: 'SWITCH_GOAL_PHASE',
    updatedProfile: { goalPhase: targetGoal },
    updatedWorkout,
    stateDiff: {
      object_type: 'Goal',
      object_id: 'goal-phase',
      label: 'Goal Updated',
      previous_state: { display: GOAL_DISPLAY_NAME[prevGoal] || prevGoal },
      new_state: { display: GOAL_DISPLAY_NAME[targetGoal] },
    },
    summaryText: reply,
    navigateTarget: 'analytics',
    navigateLabel: 'View Goals',
  });
}

export async function executeLogRestDay(
  _rawArgs: { reason?: string },
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  if (hasInProgressSets(context.activeWorkout)) {
    return {
      toolName: 'log_rest_day',
      actionType: 'SHIFT_WORKOUT',
      mutationStatus: 'error',
      summaryText: `You already have logged sets in **${context.activeWorkout.name}** today. Finish the session or ask to reset your workout if you're stopping early.`,
      errorMessage: 'Active workout already has completed sets.',
    };
  }
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = localDateString(tomorrow);
  const streak = computeTrainingStreak(context.workouts, Date.now(), activeDayDates(context.activities ?? []));
  const updatedWorkout: WorkoutSession = { ...context.activeWorkout, date: tomorrowStr };

  return commitMutationTransaction({
    context,
    toolName: 'log_rest_day',
    actionType: 'SHIFT_WORKOUT',
    updatedWorkout,
    stateDiff: {
      object_type: 'Workout',
      object_id: context.activeWorkout.id,
      label: 'Rest Day Logged',
      previous_state: { display: `${context.activeWorkout.name} (${context.activeWorkout.date || 'Today'})` },
      new_state: { display: `${context.activeWorkout.name} (${tomorrowStr})` },
    },
    summaryText: `Rest day logged. ${context.activeWorkout.name} will be waiting for you tomorrow. Missing a day doesn't set your plan back${streak > 0 ? `, and your ${streak}-day streak is safe` : ''}.`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface UpdateGoalsToolArgs {
  action: 'set_sessions_per_week' | 'set_step_goal' | 'set_lift_goal' | 'set_strength_focus' | 'remove_custom_goal' | 'reset_goals';
  value?: number;
  metric?: 'weight' | 'reps';
  unit?: 'kg' | 'lb';
  exercise_name?: string;
}

export async function executeUpdateGoals(
  rawArgs: UpdateGoalsToolArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const unit = rawArgs.unit || context.profile.weightUnit || 'kg';
  let syntheticMsg = '';
  switch (rawArgs.action) {
    case 'reset_goals':
      syntheticMsg = 'reset my goals';
      break;
    case 'set_sessions_per_week':
      syntheticMsg = `change my goal to ${Math.round(rawArgs.value ?? 3)} times a week`;
      break;
    case 'set_step_goal':
      syntheticMsg = `set a steps goal of ${Math.round(rawArgs.value ?? 8000)}`;
      break;
    case 'set_strength_focus':
      syntheticMsg = `follow my ${rawArgs.exercise_name || 'bench press'} strength level`;
      break;
    case 'remove_custom_goal':
      syntheticMsg = `remove my ${rawArgs.exercise_name ? `${rawArgs.exercise_name} ` : ''}goal`;
      break;
    case 'set_lift_goal': {
      const targetStr =
        rawArgs.metric === 'reps'
          ? `${Math.round(rawArgs.value ?? 10)} reps`
          : `${rawArgs.value ?? 100} ${unit}`;
      syntheticMsg = `set a goal of ${targetStr} on ${rawArgs.exercise_name || 'bench press'}`;
      break;
    }
  }

  const result = detectGoalChange(
    syntheticMsg.toLowerCase(),
    context.profile,
    context.activeWorkout,
    context.workouts,
    context.exerciseCatalog
  );
  if (!result || !result.changed) {
    return {
      toolName: 'update_goals',
      actionType: 'UPDATE_GOALS',
      mutationStatus: 'error',
      summaryText: result?.reply || "Tell me what goal you'd like to set (for example, weekly sessions, daily steps, or a lift target).",
      errorMessage: 'Goal update not applied.',
    };
  }

  return commitMutationTransaction({
    context,
    toolName: 'update_goals',
    actionType: 'UPDATE_GOALS',
    updatedProfile: { goalSettings: result.goalSettings },
    stateDiff: {
      object_type: 'Goal',
      object_id: 'goals',
      label: 'Goals Updated',
      previous_state: { display: `${(context.profile.goalSettings?.customGoals?.length ?? 0)} custom goal(s)` },
      new_state: { display: result.summary || 'Goals updated' },
    },
    summaryText: result.reply,
    navigateTarget: 'analytics',
    navigateLabel: 'View Goals',
  });
}

export interface UpdateProgressWidgetsToolArgs {
  action: 'add' | 'remove' | 'reset';
  widget_names?: string[];
}

export async function executeUpdateProgressWidgets(
  rawArgs: UpdateProgressWidgetsToolArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const names = (rawArgs.widget_names || []).filter(Boolean).join(', ');
  const syntheticMsg =
    rawArgs.action === 'reset'
      ? 'reset my progress widgets'
      : `${rawArgs.action === 'remove' ? 'remove' : 'add'} ${names} ${rawArgs.action === 'remove' ? 'from' : 'to'} my progress page`;

  const result = detectProgressWidgetChange(
    syntheticMsg.toLowerCase(),
    context.profile,
    context.exerciseCatalog,
    context.activeWorkout
  );
  if (!result || !result.changed) {
    return {
      toolName: 'update_progress_widgets',
      actionType: 'UPDATE_PROGRESS_WIDGETS',
      mutationStatus: 'error',
      summaryText: result?.reply || 'Tell me which Progress card or chart you want to add or remove.',
      errorMessage: 'Progress widgets unchanged.',
    };
  }

  return commitMutationTransaction({
    context,
    toolName: 'update_progress_widgets',
    actionType: 'UPDATE_PROGRESS_WIDGETS',
    updatedProfile: { progressWidgets: result.progressWidgets },
    stateDiff: {
      object_type: 'Program',
      object_id: 'progress-widgets',
      label: 'Progress Updated',
      previous_state: { display: `${(context.profile.progressWidgets ?? []).length || 'Default'} widgets` },
      new_state: { display: result.summary || 'Progress widgets updated' },
    },
    summaryText: result.reply,
    navigateTarget: 'analytics',
    navigateLabel: 'View Progress',
  });
}

export interface LogEntryArgs {
  kind: 'bodyweight' | 'body_fat' | 'waist' | 'active_day';
  value: number;
  unit?: 'kg' | 'lb' | 'cm' | 'in' | 'minutes';
  activity_type?: ActivityType;
}

export async function executeLogEntry(
  rawArgs: LogEntryArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const val = Number(rawArgs.value);
  const todayStr = localDateString();

  if (rawArgs.kind === 'active_day') {
    const mins = Math.round(val);
    if (!Number.isFinite(mins) || mins < 5 || mins > 600) {
      return {
        toolName: 'log_entry',
        actionType: 'LOG_ACTIVE_DAY',
        mutationStatus: 'error',
        summaryText: 'Give me a valid workout duration between 5 and 600 minutes to log.',
        errorMessage: 'Invalid activity duration.',
      };
    }
    const actType: ActivityType = rawArgs.activity_type && rawArgs.activity_type in ACTIVITY_LABELS ? rawArgs.activity_type : 'other';
    const label = ACTIVITY_LABELS[actType];
    const existing = context.activities ?? [];
    const entry: ActivityLog = {
      id: `act-coach-${Date.now()}`,
      date: todayStr,
      startedAt: new Date().toISOString(),
      minutes: mins,
      type: actType,
      source: 'manual',
      name: `${label} (${mins} min)`,
    };
    const updatedActivities = [...existing, entry];
    const countsActiveDay = mins >= MIN_ACTIVE_MINUTES;
    return commitMutationTransaction({
      context,
      toolName: 'log_entry',
      actionType: 'LOG_ACTIVE_DAY',
      updatedActivities,
      stateDiff: {
        object_type: 'ActiveDay',
        object_id: entry.id,
        label: 'Activity Logged',
        previous_state: { display: `${existing.length} logged activities` },
        new_state: { display: `${label} · ${mins} min` },
      },
      summaryText: countsActiveDay
        ? `Logged your **${mins}-minute ${label.toLowerCase()}** for today. It counts as an active day toward your weekly sessions and keeps your streak alive.`
        : `Logged your **${mins}-minute ${label.toLowerCase()}** for today. Sessions of ${MIN_ACTIVE_MINUTES}+ minutes count toward your weekly active-day goal.`,
      navigateTarget: 'train',
      navigateLabel: 'View Workout',
    });
  }

  if (!Number.isFinite(val) || val <= 0) {
    return {
      toolName: 'log_entry',
      actionType: 'LOG_BIOMETRIC',
      mutationStatus: 'error',
      summaryText: 'Provide a positive measurement value to record.',
      errorMessage: 'Invalid measurement value.',
    };
  }

  const profileUnit = context.profile.weightUnit || 'kg';
  const existingBio = context.biometrics ?? [];
  const todayIdx = existingBio.findIndex((b) => b.date === todayStr);
  const currentToday = todayIdx >= 0 ? existingBio[todayIdx] : undefined;

  let patch: Partial<BiometricLog> = {};
  let displayNew = '';
  if (rawArgs.kind === 'bodyweight') {
    const unitUsed = rawArgs.unit === 'lb' || rawArgs.unit === 'kg' ? rawArgs.unit : profileUnit;
    const kg = Math.round(unitToKg(val, unitUsed) * 10) / 10;
    if (kg < 25 || kg > 300) {
      return {
        toolName: 'log_entry',
        actionType: 'LOG_BIOMETRIC',
        mutationStatus: 'error',
        summaryText: `Bodyweight ${val} ${unitUsed} looks outside a realistic range (25–300 kg).`,
        errorMessage: 'Bodyweight out of range.',
      };
    }
    patch = { bodyweightKg: kg, isManualEntry: true };
    displayNew = `Weight: ${formatPreciseWeight(kg, profileUnit)}`;
  } else if (rawArgs.kind === 'body_fat') {
    const bf = Math.round(val * 10) / 10;
    if (bf < 3 || bf > 65) {
      return {
        toolName: 'log_entry',
        actionType: 'LOG_BIOMETRIC',
        mutationStatus: 'error',
        summaryText: 'Body fat percentage must be between 3% and 65%.',
        errorMessage: 'Body fat out of range.',
      };
    }
    patch = { bodyFatPct: bf, isManualEntry: true };
    displayNew = `Body fat: ${bf}%`;
  } else {
    const lenUnit = rawArgs.unit === 'in' || rawArgs.unit === 'cm' ? rawArgs.unit : profileUnit === 'lb' ? 'in' : 'cm';
    const cm = Math.round((lenUnit === 'in' ? val * 2.54 : val) * 10) / 10;
    if (cm < 40 || cm > 200) {
      return {
        toolName: 'log_entry',
        actionType: 'LOG_BIOMETRIC',
        mutationStatus: 'error',
        summaryText: 'Waist circumference must be between 40 and 200 cm.',
        errorMessage: 'Waist out of range.',
      };
    }
    patch = { waistCm: cm, isManualEntry: true };
    displayNew = profileUnit === 'lb' ? `Waist: ${Math.round((cm / 2.54) * 10) / 10} in` : `Waist: ${cm} cm`;
  }

  const nextLog: BiometricLog = currentToday
    ? { ...currentToday, ...patch }
    : {
        date: todayStr,
        bodyweightKg: 0,
        hrvRmssd: 0,
        restingHr: 0,
        sleepHours: 0,
        steps: 0,
        activeZoneMinutes: 0,
        ...patch,
      };
  const updatedBiometrics =
    todayIdx >= 0
      ? existingBio.map((b, i) => (i === todayIdx ? nextLog : b))
      : [...existingBio, nextLog].sort((a, b) => a.date.localeCompare(b.date));

  return commitMutationTransaction({
    context,
    toolName: 'log_entry',
    actionType: 'LOG_BIOMETRIC',
    updatedBiometrics,
    stateDiff: {
      object_type: 'Biometric',
      object_id: todayStr,
      label: 'Measurement Logged',
      previous_state: { display: currentToday?.bodyweightKg ? formatPreciseWeight(currentToday.bodyweightKg, profileUnit) : 'Today' },
      new_state: { display: displayNew },
    },
    summaryText: `Logged **${displayNew}** for today. Your Progress trend charts now reflect it.`,
    navigateTarget: 'analytics',
    navigateLabel: 'View Progress',
  });
}

function findProgramTemplateExercise(
  query: string,
  plan: ReturnType<typeof resolveActivePlan>,
  catalog: ExerciseDefinition[]
): { exerciseId: string; name: string; pillar: StrengthPillar; equipment: ExerciseSession['equipment'] } | undefined {
  const cleaned = cleanExerciseQuery(query);
  if (!cleaned) return undefined;
  const q = cleaned.toLowerCase();
  const planEntries = plan.templates
    .filter((t) => !isActiveSlot(t))
    .flatMap((t) => t.exercises);
  const direct =
    planEntries.find((e) => e.exerciseId.toLowerCase() === q) ??
    planEntries.find((e) => e.name.toLowerCase() === q) ??
    planEntries.find((e) => e.name.toLowerCase().includes(q) || q.includes(e.name.toLowerCase())) ??
    bestTokenMatch(planEntries, cleaned);
  if (direct) {
    return {
      exerciseId: direct.exerciseId,
      name: direct.name,
      pillar: direct.pillar,
      equipment: direct.equipment,
    };
  }
  const cat = findCatalogExercise(cleaned, catalog);
  if (cat && planEntries.some((e) => e.exerciseId === cat.id)) {
    return {
      exerciseId: cat.id,
      name: cat.name,
      pillar: cat.pillar,
      equipment: cat.equipment,
    };
  }
  return undefined;
}

function syncActiveWorkoutWithOverrides(
  plan: ReturnType<typeof resolveActivePlan>,
  appliedOverrides: ProgramExerciseOverride[],
  context: CoachToolExecutionContext
): WorkoutSession | undefined {
  const { activeWorkout, exerciseCatalog } = context;
  if (activeWorkout.completed || !activeWorkout.programWorkoutNumber) return undefined;
  if (getSessionPlanId(activeWorkout) !== plan.id) return undefined;
  const tmpl = plan.templates.find((t) => t.workoutNumber === activeWorkout.programWorkoutNumber);
  if (!tmpl) return undefined;

  let current: WorkoutSession = {
    ...activeWorkout,
    exercises: activeWorkout.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({ ...s })),
    })),
  };
  let touched = false;

  for (const ov of appliedOverrides) {
    if (!matchesWorkoutTemplateFilter(tmpl, ov.workoutFilter)) continue;

    if (ov.kind === 'swap_exercise' && ov.replacementExerciseId) {
      const replacementDef = exerciseCatalog.find((d) => d.id === ov.replacementExerciseId);
      const targetEx = current.exercises.find(
        (e) =>
          (ov.targetExerciseId && e.exerciseId === ov.targetExerciseId) ||
          (ov.targetExerciseName && e.name.toLowerCase() === ov.targetExerciseName.toLowerCase())
      );
      if (replacementDef && targetEx) {
        const { replacementEx, completedSets } = buildSwappedExerciseSession(targetEx, replacementDef, {
          ...context,
          activeWorkout: current,
        });
        const alreadyHasRep = current.exercises.some(
          (e) => e.exerciseId === replacementDef.id && e.id !== targetEx.id
        );
        current = {
          ...current,
          exercises:
            completedSets.length === 0
              ? alreadyHasRep
                ? current.exercises.filter((e) => e.id !== targetEx.id)
                : current.exercises.map((e) => (e.id === targetEx.id ? replacementEx : e))
              : current.exercises.flatMap((e) =>
                  e.id === targetEx.id
                    ? [
                        { ...targetEx, sets: completedSets.map((st, idx) => ({ ...st, setNumber: idx + 1 })) },
                        ...(alreadyHasRep ? [] : [replacementEx]),
                      ]
                    : [e]
                ),
        };
        touched = true;
      }
    } else if (ov.kind === 'add_exercise' && ov.replacementExerciseId) {
      const addDef = exerciseCatalog.find((d) => d.id === ov.replacementExerciseId);
      if (addDef && !current.exercises.some((e) => e.exerciseId === addDef.id)) {
        const { exercise } = buildCalibratedAddedExercise(addDef, ov.sets ?? 3, current, {
          ...context,
          activeWorkout: current,
        });
        current = { ...current, exercises: [...current.exercises, exercise] };
        touched = true;
      }
    } else if (ov.kind === 'remove_exercise') {
      const targetEx = current.exercises.find(
        (e) =>
          (ov.targetExerciseId && e.exerciseId === ov.targetExerciseId) ||
          (ov.targetExerciseName && e.name.toLowerCase() === ov.targetExerciseName.toLowerCase())
      );
      if (targetEx && !targetEx.sets.some((s) => s.completed) && current.exercises.length > 1) {
        current = { ...current, exercises: current.exercises.filter((e) => e.id !== targetEx.id) };
        touched = true;
      }
    } else if (ov.kind === 'adjust_sets') {
      const targetEx = current.exercises.find(
        (e) =>
          (ov.targetExerciseId && e.exerciseId === ov.targetExerciseId) ||
          (ov.targetExerciseName && e.name.toLowerCase() === ov.targetExerciseName.toLowerCase())
      );
      if (targetEx) {
        const warmups = targetEx.sets.filter((s) => s.isWarmup || s.setType === 'warmup');
        const working = targetEx.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
        const desiredCount =
          typeof ov.sets === 'number'
            ? Math.max(1, Math.min(10, Math.round(ov.sets)))
            : Math.max(1, Math.min(10, working.length + Math.round(ov.setDelta ?? 1)));
        if (desiredCount > working.length) {
          const sample = working[working.length - 1];
          const extra: WorkoutSet[] = Array.from({ length: desiredCount - working.length }, (_, idx) => ({
            id: `prog-set-${Date.now()}-${idx}`,
            setNumber: working.length + idx + 1,
            setType: 'working',
            targetWeightKg: sample?.targetWeightKg ?? 0,
            actualWeightKg: sample?.targetWeightKg ?? 0,
            targetReps: sample?.targetReps ?? targetEx.minReps,
            actualReps: sample?.targetReps ?? targetEx.minReps,
            targetRir: sample?.targetRir ?? 2,
            actualRir: sample?.targetRir ?? 2,
            ...(sample?.targetDurationSeconds
              ? { targetDurationSeconds: sample.targetDurationSeconds, actualDurationSeconds: sample.actualDurationSeconds }
              : {}),
            completed: false,
          }));
          const combined = [...warmups, ...working, ...extra].map((st, idx) => ({ ...st, setNumber: idx + 1 }));
          current = {
            ...current,
            exercises: current.exercises.map((e) => (e.id === targetEx.id ? { ...e, sets: combined } : e)),
          };
          touched = true;
        } else if (desiredCount < working.length) {
          const doneWorking = working.filter((s) => s.completed);
          const uncompleted = working.filter((s) => !s.completed);
          const keepUncompleted = Math.max(0, desiredCount - doneWorking.length);
          const nextWorking = [...doneWorking, ...uncompleted.slice(0, keepUncompleted)];
          if (nextWorking.length < working.length) {
            const combined = [...warmups, ...nextWorking].map((st, idx) => ({ ...st, setNumber: idx + 1 }));
            current = {
              ...current,
              exercises: current.exercises.map((e) => (e.id === targetEx.id ? { ...e, sets: combined } : e)),
            };
            touched = true;
          }
        }
      }
    } else if (ov.kind === 'prioritize_first') {
      const hasStarted = current.exercises.some((e) => e.sets.some((s) => s.completed));
      const idx = current.exercises.findIndex(
        (e) =>
          (ov.targetExerciseId && e.exerciseId === ov.targetExerciseId) ||
          (ov.targetExerciseName && e.name.toLowerCase() === ov.targetExerciseName.toLowerCase())
      );
      if (!hasStarted && idx > 0) {
        const reordered = [...current.exercises];
        const [promoted] = reordered.splice(idx, 1);
        reordered.unshift(promoted);
        current = { ...current, exercises: reordered };
        touched = true;
      }
    }
  }

  return touched ? current : undefined;
}

export interface ModifyProgramArgs {
  action: 'swap_exercise' | 'add_exercise' | 'remove_exercise' | 'adjust_sets' | 'prioritize_first' | 'clear_overrides';
  old_exercise_id?: string;
  new_exercise_id?: string;
  sets?: number;
  set_delta?: number;
  workout_filter?: string;
  reason?: string;
  confirmation_required?: boolean;
}

export async function executeModifyProgram(
  rawArgs: ModifyProgramArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const plan = resolveActivePlan(context.profile);
  const existingOverrides = context.profile.programOverrides ?? [];
  const planOverrides = existingOverrides.filter((o) => o.planId === plan.id);

  if (rawArgs.action === 'clear_overrides') {
    if (planOverrides.length === 0) {
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'noop',
        summaryText: `**${plan.name}** is already using its original exercises and set counts.`,
      };
    }
    const clearDiff: CoachStateDiff = {
      object_type: 'Program',
      object_id: plan.id,
      label: 'Program Adaptations',
      previous_state: { display: `${planOverrides.length} active adaptation${planOverrides.length === 1 ? '' : 's'}` },
      new_state: { display: `Default ${plan.name} plan` },
    };
    if (rawArgs.confirmation_required !== false) {
      const pendingConfirmation: CoachPendingConfirmation = {
        tool_name: 'modify_program',
        args: { action: 'clear_overrides', confirmation_required: false },
        title: `Restore default exercises in ${plan.name}?`,
        summary: `${planOverrides.length} custom program edit${planOverrides.length === 1 ? '' : 's'} → Original plan`,
        warning: `All remaining sessions will return to the default ${plan.name} template. Past completed sessions remain unchanged.`,
        confirm_label: 'Restore default plan',
        cancel_label: 'Keep adaptations',
        preview_diff: clearDiff,
        status: 'pending',
      };
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'awaiting_confirmation',
        summaryText: `Review the reset below before removing ${planOverrides.length} adaptation${planOverrides.length === 1 ? '' : 's'} from **${plan.name}**.`,
        stateDiff: clearDiff,
        pendingConfirmation,
      };
    }

    const nextOverrides = existingOverrides.filter((o) => o.planId !== plan.id);
    const nextProfile: UserProfile = {
      ...context.profile,
      programOverrides: nextOverrides.length > 0 ? nextOverrides : undefined,
    };
    const restoredPlan = resolveActivePlan(nextProfile);
    let updatedWorkout: WorkoutSession | undefined;
    if (
      !context.activeWorkout.completed &&
      context.activeWorkout.programWorkoutNumber &&
      getSessionPlanId(context.activeWorkout) === restoredPlan.id &&
      !hasInProgressSets(context.activeWorkout)
    ) {
      updatedWorkout = buildPreparedSessionForReset(
        restoredPlan,
        context.activeWorkout.programWorkoutNumber,
        context,
        nextProfile
      );
    }
    return commitMutationTransaction({
      context,
      toolName: 'modify_program',
      actionType: 'MODIFY_PROGRAM',
      updatedProfile: { programOverrides: nextProfile.programOverrides },
      updatedWorkout,
      stateDiff: clearDiff,
      summaryText: `Restored **${restoredPlan.name}** to its default exercise plan across remaining sessions.`,
      navigateTarget: 'program',
      navigateLabel: 'View Program',
    });
  }

  let targetEx:
    | { exerciseId: string; name: string; pillar: StrengthPillar; equipment: ExerciseSession['equipment'] }
    | undefined;
  let replacementDef: ExerciseDefinition | undefined;

  if (rawArgs.action !== 'add_exercise') {
    targetEx = findProgramTemplateExercise(rawArgs.old_exercise_id || '', plan, context.exerciseCatalog);
    if (!targetEx) {
      const sampleNames = Array.from(
        new Set(plan.templates.filter((t) => !isActiveSlot(t)).flatMap((t) => t.exercises.map((e) => e.name)))
      )
        .slice(0, 6)
        .join(', ');
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'error',
        summaryText: `Couldn't find "${rawArgs.old_exercise_id || 'that exercise'}" inside **${plan.name}** (current exercises include: ${sampleNames}).`,
        errorMessage: 'Exercise not found in active plan.',
      };
    }
  }

  if (rawArgs.action === 'swap_exercise' || rawArgs.action === 'add_exercise') {
    if (rawArgs.new_exercise_id) {
      replacementDef = findCatalogExercise(rawArgs.new_exercise_id, context.exerciseCatalog, context.activeWorkout);
    } else if (rawArgs.action === 'swap_exercise' && targetEx) {
      const pseudoSession: ExerciseSession = {
        id: targetEx.exerciseId,
        exerciseId: targetEx.exerciseId,
        name: targetEx.name,
        pillar: targetEx.pillar,
        equipment: targetEx.equipment,
        minReps: 8,
        maxReps: 12,
        sets: [],
      };
      replacementDef = findBestReplacementExercise(
        pseudoSession,
        undefined,
        context.exerciseCatalog,
        context.activeWorkout,
        context
      );
    }
    if (!replacementDef) {
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'error',
        summaryText: `Couldn't find a matching replacement "${rawArgs.new_exercise_id || ''}" in the exercise library.`,
        errorMessage: 'Replacement exercise not found.',
      };
    }
  }

  const now = new Date().toISOString();
  const candidate: ProgramExerciseOverride = {
    id: `ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    planId: plan.id,
    kind: rawArgs.action,
    ...(targetEx ? { targetExerciseId: targetEx.exerciseId, targetExerciseName: targetEx.name } : {}),
    ...(replacementDef
      ? {
          replacementExerciseId: replacementDef.id,
          replacementExerciseName: replacementDef.name,
          replacementPillar: replacementDef.pillar,
          replacementEquipment: replacementDef.equipment,
          replacementRepRange: replacementDef.defaultRepRange,
          replacementIsTimed: replacementDef.isTimed,
          replacementDurationSeconds: replacementDef.defaultDurationSeconds,
        }
      : {}),
    ...(typeof rawArgs.sets === 'number' ? { sets: Math.max(1, Math.min(10, Math.round(rawArgs.sets))) } : {}),
    ...(typeof rawArgs.set_delta === 'number' ? { setDelta: Math.round(rawArgs.set_delta) } : {}),
    ...(rawArgs.workout_filter ? { workoutFilter: rawArgs.workout_filter } : {}),
    ...(rawArgs.reason ? { reason: rawArgs.reason } : {}),
    createdAt: now,
  };

  const preview = previewProgramOverrides(plan, [candidate], context.workouts, context.profile.planCycleStarts);
  if (preview.totalAffectedCount === 0) {
    return {
      toolName: 'modify_program',
      actionType: 'MODIFY_PROGRAM',
      mutationStatus: 'error',
      summaryText:
        rawArgs.action === 'add_exercise' && replacementDef
          ? `**${replacementDef.name}** is already included in the matching workouts of **${plan.name}**.`
          : `No workouts in **${plan.name}** needed changing for that adjustment.`,
      errorMessage: 'No program templates changed.',
    };
  }

  const sessionCount = preview.remainingAffectedCount || preview.totalAffectedCount;
  const affectedLabel = preview.affectedTitles.slice(0, 2).join(', ');
  const slotsText = `${sessionCount} session${sessionCount === 1 ? '' : 's'}${affectedLabel ? ` · ${affectedLabel}` : ''}`;
  let titleText = `Update ${plan.name}?`;
  let prevDisplay = targetEx?.name || plan.name;
  let newDisplay = replacementDef?.name || plan.name;
  let commitSummary = `Updated **${plan.name}** across ${slotsText}.`;

  if (rawArgs.action === 'swap_exercise' && targetEx && replacementDef) {
    titleText = `Swap ${targetEx.name} → ${replacementDef.name} across ${plan.name}?`;
    prevDisplay = targetEx.name;
    newDisplay = `${replacementDef.name} (${slotsText})`;
    commitSummary = `Permanently swapped **${targetEx.name} → ${replacementDef.name}** across ${slotsText} in **${plan.name}**.`;
  } else if (rawArgs.action === 'add_exercise' && replacementDef) {
    const setsLbl = `${candidate.sets ?? 3} sets`;
    titleText = `Add ${replacementDef.name} (${setsLbl}) across ${plan.name}?`;
    prevDisplay = plan.name;
    newDisplay = `+ ${replacementDef.name} (${setsLbl}, ${slotsText})`;
    commitSummary = `Permanently added **${replacementDef.name}** (${setsLbl}) across ${slotsText} in **${plan.name}**.`;
  } else if (rawArgs.action === 'remove_exercise' && targetEx) {
    titleText = `Remove ${targetEx.name} across ${plan.name}?`;
    prevDisplay = targetEx.name;
    newDisplay = `Removed across ${slotsText}`;
    commitSummary = `Permanently removed **${targetEx.name}** across ${slotsText} in **${plan.name}**.`;
  } else if (rawArgs.action === 'adjust_sets' && targetEx) {
    const label = typeof candidate.sets === 'number' ? `${candidate.sets} sets` : `${(candidate.setDelta ?? 1) > 0 ? '+' : ''}${candidate.setDelta ?? 1} set`;
    titleText = `Adjust sets on ${targetEx.name} (${label}) across ${plan.name}?`;
    prevDisplay = `${targetEx.name}`;
    newDisplay = `${targetEx.name}: ${label} (${slotsText})`;
    commitSummary = `Adjusted **${targetEx.name}** (${label}) across ${slotsText} in **${plan.name}**.`;
  } else if (rawArgs.action === 'prioritize_first' && targetEx) {
    titleText = `Train ${targetEx.name} first across ${plan.name}?`;
    prevDisplay = `${targetEx.name} (later slot)`;
    newDisplay = `${targetEx.name} first (${slotsText})`;
    commitSummary = `Moved **${targetEx.name}** to exercise #1 across ${slotsText} in **${plan.name}**.`;
  }

  const stateDiff: CoachStateDiff = {
    object_type: 'Program',
    object_id: plan.id,
    label: 'Program Adapted',
    previous_state: { display: prevDisplay },
    new_state: { display: newDisplay },
  };

  if (rawArgs.confirmation_required !== false) {
    const pendingConfirmation: CoachPendingConfirmation = {
      tool_name: 'modify_program',
      args: {
        action: rawArgs.action,
        ...(targetEx ? { old_exercise_id: targetEx.exerciseId } : {}),
        ...(replacementDef ? { new_exercise_id: replacementDef.id } : {}),
        ...(candidate.sets !== undefined ? { sets: candidate.sets } : {}),
        ...(candidate.setDelta !== undefined ? { set_delta: candidate.setDelta } : {}),
        ...(rawArgs.workout_filter ? { workout_filter: rawArgs.workout_filter } : {}),
        ...(rawArgs.reason ? { reason: rawArgs.reason } : {}),
        confirmation_required: false,
      },
      title: titleText,
      summary: `${slotsText} · ${formatStateDiffText(stateDiff)}`,
      warning: `${rawArgs.reason && !/^(athlete|user)\s+request$/i.test(rawArgs.reason.trim()) ? `Reason: ${rawArgs.reason}. ` : ''}Applies to remaining weeks of ${plan.name}; past history stays intact and you can Undo anytime.`,
      confirm_label: 'Apply to program',
      cancel_label: 'Keep current plan',
      preview_diff: stateDiff,
      status: 'pending',
    };
    return {
      toolName: 'modify_program',
      actionType: 'MODIFY_PROGRAM',
      mutationStatus: 'awaiting_confirmation',
      summaryText: `Confirm below to apply this change across **${slotsText}** in **${plan.name}**.`,
      stateDiff,
      pendingConfirmation,
    };
  }

  const nextOverrides = [...existingOverrides, candidate];
  const updatedPlan = applyProgramOverridesToPlan(plan, [candidate]);
  const updatedWorkout = syncActiveWorkoutWithOverrides(updatedPlan, [candidate], context);

  return commitMutationTransaction({
    context,
    toolName: 'modify_program',
    actionType: 'MODIFY_PROGRAM',
    updatedProfile: { programOverrides: nextOverrides },
    updatedWorkout,
    stateDiff,
    summaryText: `${commitSummary} Remaining workouts now follow this update automatically.`,
    navigateTarget: 'program',
    navigateLabel: 'View Program',
  });
}

export interface RebalanceProgramArgs {
  focus?: 'auto' | 'pull_vs_push' | 'level_gap' | 'left_right_symmetry' | 'plateau' | 'contraindication' | 'muscle_volume';
  target_muscle_or_pillar?: string;
  confirmation_required?: boolean;
}

export async function executeRebalanceProgram(
  rawArgs: RebalanceProgramArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const plan = resolveActivePlan(context.profile);
  const interventions = detectCoachInterventions({
    profile: context.profile,
    activeWorkout: context.activeWorkout,
    workouts: context.workouts,
    biometrics: context.biometrics ?? [],
    exerciseCatalog: context.exerciseCatalog,
    bodyweightEmaKg: context.bodyweightEmaKg,
    readinessState: context.readinessState,
    activities: context.activities,
    trainingPlan: plan,
  });

  const focusMap: Record<NonNullable<RebalanceProgramArgs['focus']>, string[]> = {
    auto: [],
    pull_vs_push: ['pull_push_imbalance'],
    level_gap: ['strength_level_gap'],
    left_right_symmetry: ['unilateral_asymmetry'],
    plateau: ['exercise_plateau'],
    contraindication: ['contraindication_conflict'],
    muscle_volume: ['volume_gap'],
  };

  const query = (rawArgs.target_muscle_or_pillar || '').toLowerCase().trim();
  const focusKinds = rawArgs.focus ? focusMap[rawArgs.focus] : [];

  let chosen =
    (focusKinds.length > 0
      ? interventions.find((it) => focusKinds.includes(it.kind))
      : undefined) ??
    (query
      ? interventions.find(
          (it) =>
            it.title.toLowerCase().includes(query) ||
            it.rationale.toLowerCase().includes(query) ||
            (it.pillar && it.pillar.toLowerCase().includes(query))
        )
      : undefined) ??
    interventions[0];

  // If no existing diagnostic triggered yet (e.g. athlete explicitly names a muscle/symmetry preference), build targeted adaptation cleanly
  let candidateChanges = chosen?.proposedChanges;
  let chosenTitle = chosen?.title;
  let chosenRationale = chosen?.rationale;

  if (!candidateChanges && query) {
    const planExercises = plan.templates.filter((t) => !isActiveSlot(t)).flatMap((t) => t.exercises);
    if (/\b(symmetr|unilateral|left|right|single[\s-]?(arm|leg)|one[\s-]?side)\b/i.test(query)) {
      const bilateralSwapMap: Record<string, string> = {
        'ex-bench-press': 'ex-flat-db-press',
        'ex-barbell-row': 'ex-single-arm-db-row',
        'ex-barbell-squat': 'ex-bulgarian-split-squat',
        'ex-leg-press': 'ex-bulgarian-split-squat',
        'ex-rdl': 'ex-single-leg-db-rdl',
      };
      const match = planExercises.find((e) => bilateralSwapMap[e.exerciseId]);
      const uniDef = match ? context.exerciseCatalog.find((d) => d.id === bilateralSwapMap[match.exerciseId]) : undefined;
      if (match && uniDef) {
        candidateChanges = [
          {
            kind: 'swap_exercise',
            targetExerciseId: match.exerciseId,
            targetExerciseName: match.name,
            replacementExerciseId: uniDef.id,
            replacementExerciseName: uniDef.name,
            replacementPillar: uniDef.pillar,
            replacementEquipment: uniDef.equipment,
            replacementRepRange: uniDef.defaultRepRange,
            reason: 'unilateral symmetry balance',
            humanSummary: `${match.name} → ${uniDef.name} across sessions`,
          },
        ];
        chosenTitle = `Switch ${match.name} to unilateral ${uniDef.name}`;
        chosenRationale = `Replacing bilateral ${match.name} with ${uniDef.name} lets your weaker side set the pace on every set.`;
      }
    } else {
      const catMatch =
        context.exerciseCatalog.find((d) => d.primaryMuscle.toLowerCase().includes(query) || d.pillar.toLowerCase().includes(query)) ??
        findCatalogExercise(query, context.exerciseCatalog, context.activeWorkout);
      if (catMatch) {
        const existing = planExercises.find((e) => e.exerciseId === catMatch.id || e.pillar === catMatch.pillar);
        if (existing) {
          candidateChanges = [
            {
              kind: 'adjust_sets',
              targetExerciseId: existing.exerciseId,
              targetExerciseName: existing.name,
              setDelta: 1,
              reason: `bring up ${query}`,
              humanSummary: `+1 working set on ${existing.name} across sessions`,
            },
          ];
          chosenTitle = `Increase ${existing.name} focus in ${plan.name}`;
          chosenRationale = `Adds +1 working set on ${existing.name} across remaining workouts to bring up your ${query}.`;
        } else {
          candidateChanges = [
            {
              kind: 'add_exercise',
              replacementExerciseId: catMatch.id,
              replacementExerciseName: catMatch.name,
              replacementPillar: catMatch.pillar,
              replacementEquipment: catMatch.equipment,
              replacementRepRange: catMatch.defaultRepRange,
              sets: 3,
              workoutFilter: catMatch.pillar === 'Squat' || catMatch.pillar === 'Hinge' ? 'lower_or_full' : 'upper_or_full',
              reason: `bring up ${query}`,
              humanSummary: `Add ${catMatch.name} (3 sets) to matching workouts`,
            },
          ];
          chosenTitle = `Add ${catMatch.name} across ${plan.name}`;
          chosenRationale = `Adds ${catMatch.name} to matching sessions so ${query} receives direct weekly stimulus.`;
        }
      }
    }
  }

  if (!candidateChanges || candidateChanges.length === 0) {
    return {
      toolName: 'rebalance_program',
      actionType: 'MODIFY_PROGRAM',
      mutationStatus: 'error',
      summaryText: `Your lifts currently show no strength imbalances or symmetry gaps to rebalance in **${plan.name}**. Log more sessions across main lifts (or "Log each side" on unilateral exercises), or tell me a specific lift or muscle to emphasize across your program.`,
      errorMessage: 'No active imbalance intervention detected.',
    };
  }

  const now = new Date().toISOString();
  const overridesToApply: ProgramExerciseOverride[] = candidateChanges.map((c, idx) => ({
    id: `ov-rebal-${Date.now()}-${idx}`,
    planId: plan.id,
    kind: c.kind,
    targetExerciseId: c.targetExerciseId,
    targetExerciseName: c.targetExerciseName,
    replacementExerciseId: c.replacementExerciseId,
    replacementExerciseName: c.replacementExerciseName,
    replacementPillar: c.replacementPillar,
    replacementEquipment: c.replacementEquipment,
    replacementRepRange: c.replacementRepRange,
    replacementIsTimed: c.replacementIsTimed,
    replacementDurationSeconds: c.replacementDurationSeconds,
    sets: c.sets,
    setDelta: c.setDelta,
    workoutFilter: c.workoutFilter,
    reason: c.reason,
    createdAt: now,
  }));

  const preview = previewProgramOverrides(
    plan,
    overridesToApply,
    context.workouts,
    context.profile.planCycleStarts
  );
  const sessionCount = preview.remainingAffectedCount || preview.totalAffectedCount;
  const slotsText = `${sessionCount} session${sessionCount === 1 ? '' : 's'}`;
  const changeListText = candidateChanges.map((c) => c.humanSummary).join(' + ');

  const stateDiff: CoachStateDiff = {
    object_type: 'Program',
    object_id: plan.id,
    label: 'Program Rebalanced',
    previous_state: { display: `${plan.name} (current setup)` },
    new_state: { display: `${changeListText} (${slotsText})` },
  };

  if (rawArgs.confirmation_required !== false) {
    const pendingConfirmation: CoachPendingConfirmation = {
      tool_name: 'rebalance_program',
      args: {
        ...(rawArgs.focus ? { focus: rawArgs.focus } : {}),
        ...(rawArgs.target_muscle_or_pillar ? { target_muscle_or_pillar: rawArgs.target_muscle_or_pillar } : {}),
        confirmation_required: false,
      },
      title: chosenTitle || `Rebalance ${plan.name}?`,
      summary: `${slotsText} affected · ${changeListText}`,
      warning: `${chosenRationale || 'Targeted adjustment based on your logged strength ratios and symmetry.'} Past logs stay untouched and you can Undo anytime.`,
      confirm_label: 'Apply to program',
      cancel_label: 'Keep current plan',
      preview_diff: stateDiff,
      status: 'pending',
    };
    return {
      toolName: 'rebalance_program',
      actionType: 'MODIFY_PROGRAM',
      mutationStatus: 'awaiting_confirmation',
      summaryText: `${chosenRationale || ''}\n\nConfirm below to apply **${changeListText}** across **${slotsText}** in **${plan.name}**.`.trim(),
      stateDiff,
      pendingConfirmation,
    };
  }

  const nextOverrides = [...(context.profile.programOverrides ?? []), ...overridesToApply];
  const updatedPlan = applyProgramOverridesToPlan(plan, overridesToApply);
  const updatedWorkout = syncActiveWorkoutWithOverrides(updatedPlan, overridesToApply, context);

  return commitMutationTransaction({
    context,
    toolName: 'rebalance_program',
    actionType: 'MODIFY_PROGRAM',
    updatedProfile: { programOverrides: nextOverrides },
    updatedWorkout,
    stateDiff,
    summaryText: `Applied **${changeListText}** across **${slotsText}** in **${plan.name}**. Your Program schedule and remaining sessions now reflect this change.`,
    navigateTarget: 'program',
    navigateLabel: 'View Program',
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
    case 'modify_program':
      return executeModifyProgram(rawArgs as unknown as ModifyProgramArgs, context);
    case 'rebalance_program':
      return executeRebalanceProgram(rawArgs as unknown as RebalanceProgramArgs, context);
    case 'swap_exercise':
      return executeSwapExercise(rawArgs as unknown as SwapExerciseArgs, context);
    case 'adjust_workout_volume':
      return executeAdjustWorkoutVolume(rawArgs as unknown as AdjustWorkoutVolumeArgs, context);
    case 'save_athlete_memory':
      return executeSaveAthleteMemory(rawArgs as unknown as SaveAthleteMemoryArgs, context);
    case 'modify_workout_exercises':
      return executeModifyWorkoutExercises(rawArgs as unknown as ModifyWorkoutExercisesArgs, context);
    case 'switch_location':
      return executeSwitchLocation(rawArgs as unknown as SwitchLocationArgs, context);
    case 'update_home_equipment':
      return executeUpdateHomeEquipment(rawArgs as unknown as UpdateHomeEquipmentArgs, context);
    case 'switch_program':
      return executeSwitchProgram(rawArgs as unknown as SwitchProgramArgs, context);
    case 'switch_goal_phase':
      return executeSwitchGoalPhase(rawArgs as unknown as SwitchGoalPhaseArgs, context);
    case 'log_rest_day':
      return executeLogRestDay(rawArgs as { reason?: string }, context);
    case 'update_goals':
      return executeUpdateGoals(rawArgs as unknown as UpdateGoalsToolArgs, context);
    case 'update_progress_widgets':
      return executeUpdateProgressWidgets(rawArgs as unknown as UpdateProgressWidgetsToolArgs, context);
    case 'log_entry':
      return executeLogEntry(rawArgs as unknown as LogEntryArgs, context);
  }
}

export async function executeCoachToolCalls(
  calls: Array<{ name: CoachToolName; args: Record<string, unknown> }>,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome | null> {
  if (!calls.length) return null;
  if (calls.length === 1) {
    return executeCoachToolCall(calls[0].name, calls[0].args, context);
  }

  let rollingCtx: CoachToolExecutionContext = { ...context };
  let mergedProfile: Partial<UserProfile> | undefined;
  let latestWorkout: WorkoutSession | undefined;
  let latestBiometrics: BiometricLog[] | undefined;
  let latestActivities: ActivityLog[] | undefined;
  let memorySaved: AthleteMemoryFact | undefined;
  const summaries: string[] = [];
  const diffs: string[] = [];
  let lastOutcome: CoachToolOutcome | null = null;

  const initialUndoSnapshot: CoachUndoSnapshot = {
    label: 'Coach Actions',
    previousProfile: {
      ...context.profile,
      programOverrides: context.profile.programOverrides,
    },
    previousWorkout: {
      ...context.activeWorkout,
      exercises: context.activeWorkout.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s })),
      })),
    },
    previousBiometrics: context.biometrics ? context.biometrics.map((b) => ({ ...b })) : undefined,
    previousActivities: context.activities ? context.activities.map((a) => ({ ...a })) : undefined,
  };

  for (const call of calls) {
    const outcome = await executeCoachToolCall(call.name, call.args, rollingCtx);
    if (outcome.mutationStatus === 'awaiting_confirmation') {
      return outcome;
    }
    if (outcome.mutationStatus !== 'success') {
      if (!lastOutcome) return outcome;
      summaries.push(outcome.summaryText);
      continue;
    }
    lastOutcome = outcome;
    if (outcome.updatedProfile) {
      mergedProfile = { ...(mergedProfile ?? {}), ...outcome.updatedProfile };
      rollingCtx = { ...rollingCtx, profile: { ...rollingCtx.profile, ...outcome.updatedProfile } };
    }
    if (outcome.updatedWorkout) {
      latestWorkout = outcome.updatedWorkout;
      rollingCtx = { ...rollingCtx, activeWorkout: outcome.updatedWorkout };
    }
    if (outcome.updatedBiometrics) {
      latestBiometrics = outcome.updatedBiometrics;
      rollingCtx = { ...rollingCtx, biometrics: outcome.updatedBiometrics };
    }
    if (outcome.updatedActivities) {
      latestActivities = outcome.updatedActivities;
      rollingCtx = { ...rollingCtx, activities: outcome.updatedActivities };
    }
    if (outcome.memorySaved) memorySaved = outcome.memorySaved;
    summaries.push(outcome.summaryText);
    if (outcome.stateDiff) diffs.push(formatStateDiffText(outcome.stateDiff));
  }

  if (!lastOutcome) return null;
  return {
    ...lastOutcome,
    summaryText: summaries.join('\n\n'),
    updatedProfile: mergedProfile,
    updatedWorkout: latestWorkout,
    updatedBiometrics: latestBiometrics,
    updatedActivities: latestActivities,
    memorySaved,
    stateDiff:
      diffs.length > 1
        ? {
            object_type: lastOutcome.stateDiff?.object_type ?? 'Program',
            object_id: 'multi-action',
            label: `${diffs.length} Updates Applied`,
            previous_state: { display: 'Previous state' },
            new_state: { display: diffs.join(' · ') },
          }
        : lastOutcome.stateDiff,
    undoSnapshot: { ...initialUndoSnapshot, label: `${diffs.length || 1} Updates Applied` },
  };
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
  /\b(i['’]?ve reset|i have reset|program reset|reset to week|permanently swapped|rebalanced your program|applied.*to your program|swapped\b.+\bfor\b|adjusted your sets|volume adjusted|saved to (?:your )?memory|updated your (?:plan|workout|program)|logged your (?:weight|bodyweight|waist|body fat)|removed\b.+\bfrom today|added\b.+\bto today)\b/i;

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
    if (fallbackText) return fallbackText;
    if (!FALSE_SUCCESS_RE.test(replyText) && replyText.trim().length > 0) return replyText;
    return 'The update could not be saved, so your training data was left unchanged. Please try again.';
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
  lastSwap?: { from: string; to: string };
}): CoachSuggestedAction[] {
  if (params.custom && params.custom.length > 0) {
    return params.custom
      .filter((a) => a.label?.trim() && a.prompt?.trim())
      .slice(0, 3);
  }

  const { toolName, mutationStatus, envelope, place, lastSwap } = params;
  const todayFirstEx = envelope.working_state.today_workout?.exercises[0]?.name;

  if (mutationStatus === 'awaiting_confirmation') {
    return [
      { label: 'How recovery looks', prompt: 'Should I train today?' },
      { label: 'Keep current week', prompt: 'What am I lifting today?' },
    ];
  }

  if ((toolName === 'modify_program' || toolName === 'rebalance_program') && mutationStatus === 'success') {
    return [
      { label: 'Review updated workout', prompt: 'What am I lifting today?' },
      { label: 'Where am I in my program?', prompt: 'Where am I in my program?' },
      { label: 'Reset program edits', prompt: 'Clear my program customizations' },
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
      ...(lastSwap
        ? [
            {
              label: 'Apply to whole program',
              prompt: `Swap ${lastSwap.from} for ${lastSwap.to} across my whole program`,
            },
          ]
        : []),
      { label: 'Review updated workout', prompt: 'What am I lifting today?' },
      { label: 'Check weekly volume', prompt: 'Am I doing enough sets this week?' },
    ].slice(0, 3);
  }

  if (
    (toolName === 'modify_workout_exercises' || toolName === 'switch_location') &&
    mutationStatus === 'success'
  ) {
    return [
      { label: 'Review updated workout', prompt: 'What am I lifting today?' },
      { label: 'Check weekly volume', prompt: 'Am I doing enough sets this week?' },
      { label: 'Trim today to 25m', prompt: 'Shorten today\'s workout' },
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
      {
        label: todayFirstEx ? `Swap ${todayFirstEx.split(' ').slice(0, 2).join(' ')}` : 'Swap an exercise',
        prompt: todayFirstEx ? `Swap ${todayFirstEx}` : 'What can I swap today?',
      },
    ];
  }

  if ((toolName === 'update_goals' || toolName === 'switch_goal_phase' || toolName === 'log_entry') && mutationStatus === 'success') {
    return [
      { label: 'How am I doing?', prompt: 'How am I doing?' },
      { label: 'Weekly muscle sets', prompt: 'Am I doing enough sets this week?' },
      { label: 'Today workout brief', prompt: 'What am I lifting today?' },
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
