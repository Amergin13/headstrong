import {
  ACTIVITY_LABELS,
  ActivityLog,
  ActivityType,
  MIN_ACTIVE_MINUTES,
  activeDayDates,
} from '../engine/activeDays';
import {
  applyEnvironmentOverlayToSession,
  buildSwapWhyThisWorksForExercise,
  createOverlayForTrainingLocation,
  createPresetOverlay,
  evaluateSingleExerciseContinuitySwap,
  overlayToTrainingLocation,
  resolveActiveOverlay,
} from '../engine/continuityEngine';
import { isTimedExercise, isUnilateralExercise, usesOneDumbbell, usesTwoDumbbells } from '../engine/e1rm';
import { getExerciseBiomechanicalMeta } from '../engine/knowledgeGraph';
import {
  buildPlanOverview,
  generatePlanWorkout,
  getNextProgramWorkoutNumber,
  getSessionPlanId,
  isActiveSlot,
  planWorkoutLabel,
  TrainingPlan,
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
import { computeTrainingStreak, evaluateSessionRecovery, formatReadyTime, MUSCLE_FRIENDLY_NAMES } from '../engine/recovery';
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
  EnvironmentOverlay,
  ExerciseDefinition,
  ExerciseSession,
  ExperienceLevel,
  Gender,
  GoalPhase,
  HomeEquipmentTag,
  PlanId,
  ProgramExerciseOverride,
  ProgramSplitType,
  ReadinessState,
  StrengthPillar,
  TrainingLocation,
  UserProfile,
  WorkoutDisplaySettings,
  WorkoutSession,
  WorkoutSet,
  resolveWorkoutDisplaySettings,
} from '../engine/types';
import { ensureWarmupSetsOnExercise, isFirstCompoundForPillar } from '../engine/warmup';
import { localDateString } from '../utils/date';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import { formatPreciseWeight, formatWeight, snapLoadKg, unitToKg } from '../utils/units';
import { parseEnvironmentConstraintText } from './environmentOverlayParser';
import { findExerciseNamed } from './coachAnswers';
import { CoachPlace } from './coachContext';
import { ContextEnvelope, createMemoryFact, deriveContraindicationEdges } from './coachContextEnvelope';
import {
  buildOverridesForIntervention,
  CoachIntervention,
  detectCoachInterventions,
} from './coachInterventions';
import { detectGoalChange } from './coachGoals';
import { GOOGLE_AUTH_CONFIG, isSupabaseConfigured } from './googleAuthService';
import { detectProgressWidgetChange } from './progressWidgets';
import { BODY_MEASUREMENT_SITES, BodySiteDefinition } from './renphoBluetooth';
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
      'Adjust set counts or working load targets for uncompleted sets in the active workout (e.g. short on time, recovery adjustment, exact set count, or extra working sets on a specific lift).',
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
        exercise_name: {
          type: 'string',
          description: 'Optional exercise ID or name to scope the change to one exercise in today workout.',
        },
        target_sets: {
          type: 'integer',
          description: 'Optional exact target working set count (1-10) when setting an exercise to N sets.',
        },
        set_delta: {
          type: 'integer',
          description: 'Optional number of working sets to add or remove (e.g. +2 or -1).',
        },
        load_delta_pct: {
          type: 'number',
          description: 'Optional percentage load reduction (e.g. -10 or -15) for deload_load.',
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
          enum: ['injury', 'contraindication', 'equipment', 'preference', 'goal', 'schedule'],
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
      'Add a new exercise to today active workout (with optional working set count) or remove an existing exercise from today active workout while keeping completed sets.',
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
        sets: {
          type: 'integer',
          description: 'Optional working sets count (1-8, default 3) when adding an exercise.',
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
      'Switch training location between gym, home, travel (bodyweight), or a temporary hotel/dumbbell/time-constrained environment overlay for today or a multi-day trip, or schedule a specific future week (1-6) away/home.',
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
        constraint_text: {
          type: 'string',
          description:
            'Optional natural-language environment constraint (e.g. "Hotel dumbbells up to 30 kg for 5 days" or "Only have 25 minutes today") parsed into a temporary EnvironmentOverlay.',
        },
        max_dumbbell_kg: {
          type: 'number',
          description: 'Optional maximum available dumbbell weight per hand in kg.',
        },
        max_session_minutes: {
          type: 'integer',
          description: 'Optional session duration cap in minutes (e.g. 25 or 30).',
        },
        duration_days: {
          type: 'integer',
          description: 'Optional number of days before the temporary environment overlay auto-reverts to Full Gym.',
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
      'Log an athlete-supplied measurement (bodyweight, body fat %, any of the 12 tape circumference sites, daily steps, height) or deliberate active day cardio/sport session.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [
            'bodyweight',
            'body_fat',
            'waist',
            'tape_measurement',
            'steps',
            'height',
            'active_day',
          ],
          description: 'Measurement or activity type.',
        },
        value: {
          type: 'number',
          description: 'Numeric value provided by the athlete (weight, %, tape measurement, steps, height, or duration minutes).',
        },
        unit: {
          type: 'string',
          enum: ['kg', 'lb', 'cm', 'in', 'steps', 'minutes'],
          description: 'Unit for the supplied value.',
        },
        measurement_site: {
          type: 'string',
          enum: [
            'neck',
            'shoulder',
            'chest',
            'waist',
            'abdomen',
            'hip',
            'bicep_left',
            'bicep_right',
            'thigh_left',
            'thigh_right',
            'calf_left',
            'calf_right',
          ],
          description: 'Tape measurement site when kind is tape_measurement (or waist).',
        },
        activity_type: {
          type: 'string',
          enum: ['run', 'walk', 'cycle', 'swim', 'row', 'elliptical', 'hike', 'class', 'sport', 'strength', 'other'],
          description: 'Activity type when kind is active_day.',
        },
        distance_km: {
          type: 'number',
          description: 'Optional distance in km for an active day run/ride/walk/row/swim.',
        },
        date: {
          type: 'string',
          description: 'Optional local date YYYY-MM-DD (or "yesterday"); defaults to today.',
        },
      },
      required: ['kind', 'value'],
    },
  },
  {
    name: 'modify_program',
    description:
      'Create permanent structural changes across all (or filtered) workouts in the athlete active training program: permanently swap an exercise across sessions, add/remove an exercise, adjust working sets or rep range across the plan, move a lagging lift first, remove a single custom edit, or clear program adaptations. Uses confirmation_required=true by default so the athlete approves multi-session changes (human-in-the-loop).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'swap_exercise',
            'add_exercise',
            'remove_exercise',
            'adjust_sets',
            'adjust_rep_range',
            'prioritize_first',
            'remove_override',
            'clear_overrides',
          ],
          description: 'Program-level adaptation to perform.',
        },
        old_exercise_id: {
          type: 'string',
          description: 'Exercise ID or name currently in the program to swap, remove, adjust, prioritize, or un-override.',
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
        min_reps: {
          type: 'integer',
          description: 'Lower bound of target rep range (e.g. 6 for 6-8) when action is adjust_rep_range.',
        },
        max_reps: {
          type: 'integer',
          description: 'Upper bound of target rep range (e.g. 8 for 6-8) when action is adjust_rep_range.',
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
  {
    name: 'log_workout_set',
    description:
      'Log, complete, or edit a working set on an exercise in today active workout (weight per dumbbell for paired DB lifts, reps or timed hold seconds, RIR, optional left/right unilateral reps).',
    parameters: {
      type: 'object',
      properties: {
        exercise_name: {
          type: 'string',
          description: 'Exercise ID or name in today active workout.',
        },
        set_number: {
          type: 'integer',
          description: 'Optional 1-based working set number to update; defaults to the next uncompleted working set.',
        },
        weight: {
          type: 'number',
          description: 'Weight used (per dumbbell for paired two-dumbbell exercises).',
        },
        unit: {
          type: 'string',
          enum: ['kg', 'lb'],
          description: 'Weight unit; defaults to athlete profile unit.',
        },
        reps: {
          type: 'integer',
          description: 'Repetitions completed.',
        },
        reps_left: {
          type: 'integer',
          description: 'Left-side repetitions for unilateral exercises.',
        },
        reps_right: {
          type: 'integer',
          description: 'Right-side repetitions for unilateral exercises.',
        },
        duration_seconds: {
          type: 'integer',
          description: 'Hold or carry duration in seconds for timed exercises.',
        },
        rir: {
          type: 'integer',
          description: 'Reps in reserve (0-5).',
        },
      },
      required: ['exercise_name'],
    },
  },
  {
    name: 'reorder_workout_exercises',
    description:
      'Reorder exercises within today active workout (e.g. move an exercise first, or place it before/after another exercise).',
    parameters: {
      type: 'object',
      properties: {
        exercise_name: {
          type: 'string',
          description: 'Exercise ID or name in today workout to move.',
        },
        position: {
          type: 'string',
          enum: ['first', 'last', 'before', 'after'],
          description: 'Where to move the exercise.',
        },
        reference_exercise_name: {
          type: 'string',
          description: 'Target exercise name when position is before or after.',
        },
      },
      required: ['exercise_name', 'position'],
    },
  },
  {
    name: 'update_exercise_note',
    description:
      'Save, append, or clear a session cue/note on an exercise in today active workout (e.g. seat height, grip width, brace cue).',
    parameters: {
      type: 'object',
      properties: {
        exercise_name: {
          type: 'string',
          description: 'Exercise ID or name in today workout.',
        },
        note: {
          type: 'string',
          description: 'Note text to save on the exercise.',
        },
        mode: {
          type: 'string',
          enum: ['set', 'append', 'clear'],
          description: 'Whether to set, append to, or clear the note (default set).',
        },
      },
      required: ['exercise_name'],
    },
  },
  {
    name: 'override_recovery_gate',
    description:
      'Unlock today queued workout when its muscles are still recovering (Train anyway). Always confirms with the athlete first so recovery is respected.',
    parameters: {
      type: 'object',
      properties: {
        confirmation_required: {
          type: 'boolean',
          description: 'True to warn about recovering muscles and ask for confirmation first (default true).',
        },
      },
      required: [],
    },
  },
  {
    name: 'delete_athlete_memory',
    description:
      'Forget/remove a saved athlete memory fact (e.g. resolved injury, old preference) by keyword or category, or clear all saved memories with confirmation.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword or phrase matching the saved memory to remove (e.g. "shoulder", "overhead press").',
        },
        category: {
          type: 'string',
          enum: ['injury', 'contraindication', 'equipment', 'preference', 'goal', 'schedule'],
          description: 'Optional category filter.',
        },
        clear_all: {
          type: 'boolean',
          description: 'True to remove all saved athlete memories (requires confirmation).',
        },
        confirmation_required: {
          type: 'boolean',
          description: 'True to confirm before clearing all saved memories.',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_athlete_profile',
    description:
      'Update athlete profile settings or Workout screen display preferences: weight units (kg/lb), age, strength standard category (male/female), experience level, height, or Workout card display toggles.',
    parameters: {
      type: 'object',
      properties: {
        weight_unit: {
          type: 'string',
          enum: ['kg', 'lb'],
          description: 'Switch weight display and rounding between kg and lb.',
        },
        age: {
          type: 'integer',
          description: 'Athlete age in years (13-100) for strength standards age group.',
        },
        gender: {
          type: 'string',
          enum: ['male', 'female'],
          description: 'Strength standard category (male or female).',
        },
        experience_level: {
          type: 'string',
          enum: ['new', 'beginner', 'intermediate', 'experienced'],
          description: 'Training experience level for starting weight calibration.',
        },
        height_cm: {
          type: 'number',
          description: 'Athlete height in cm (110-250).',
        },
        display_setting: {
          type: 'string',
          enum: [
            'showExerciseCharts',
            'showExerciseSummaries',
            'showRecoveryCard',
            'showSessionCard',
            'showProgramCard',
            'showStepsCard',
          ],
          description: 'Workout screen display card toggle to update.',
        },
        display_enabled: {
          type: 'boolean',
          description: 'Whether to show (true) or hide (false) the specified Workout screen card.',
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
  navigateDetail?: {
    detail?: string;
    goalId?: string;
    exerciseId?: string;
  };
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
  navigateDetail?: {
    detail?: string;
    goalId?: string;
    exerciseId?: string;
  };
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
    navigateDetail,
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
    navigateDetail,
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
    context.profile.planCycleStarts,
    context.profile.planStartWorkouts
  );
  const completedInProgress = hasInProgressSets(context.activeWorkout);
  const shouldConfirm =
    rawArgs.confirmation_required === true ||
    (rawArgs.confirmation_required !== false && (completedInProgress || overviewBefore.completedCount > 0));

  const totalWeeks = Math.max(1, ...plan.templates.map((t) => t.week));
  const clampedWeek = Math.min(totalWeeks, targetWeek);
  const liftingSlots = plan.templates.filter((t) => !isActiveSlot(t));
  const weekSlots = liftingSlots.filter((t) => t.week === clampedWeek);
  const targetWorkoutNumber =
    clampedWeek === 1 && targetDay === 1
      ? liftingSlots[0]?.workoutNumber ?? 1
      : weekSlots[Math.min(Math.max(0, targetDay - 1), Math.max(0, weekSlots.length - 1))]?.workoutNumber ??
        liftingSlots[
          Math.min(
            Math.max(0, (clampedWeek - 1) * Math.max(1, Math.round(liftingSlots.length / totalWeeks)) + (targetDay - 1)),
            Math.max(0, liftingSlots.length - 1)
          )
        ]?.workoutNumber ??
        1;

  const currentWeekBefore =
    plan.templates.find((t) => t.workoutNumber === overviewBefore.nextWorkoutNumber)?.week ||
    context.profile.mesocycleWeek ||
    1;
  const previousDisplay = `Week ${currentWeekBefore}, ${overviewBefore.completedCount} done`;
  const newDisplay = `Week ${clampedWeek}, Day ${targetDay} (${planWorkoutLabel(plan.templates.find((t) => t.workoutNumber === targetWorkoutNumber)?.title || 'Day 1')})`;

  const previewDiff: CoachStateDiff = {
    object_type: 'Program',
    object_id: plan.id,
    label: `Program Reset • Week ${clampedWeek}, Day ${targetDay}`,
    previous_state: {
      display: previousDisplay,
      week: currentWeekBefore,
      completed_workouts: overviewBefore.completedCount,
    },
    new_state: {
      display: newDisplay,
      week: clampedWeek,
      day: targetDay,
      workout_number: targetWorkoutNumber,
    },
  };

  if (shouldConfirm) {
    const pendingConfirmation: CoachPendingConfirmation = {
      tool_name: 'reset_program',
      title: `Reset ${plan.name} to Week ${clampedWeek}, Day ${targetDay}?`,
      summary: `${previousDisplay} → ${newDisplay}`,
      warning: completedInProgress
        ? `Today's session (${context.activeWorkout.name}) has logged sets in progress. Confirming restarts your current plan run at Week ${clampedWeek}, Day ${targetDay} while keeping past finished workouts in history.`
        : overviewBefore.completedCount > 0
          ? `You have ${overviewBefore.completedCount} completed workout${overviewBefore.completedCount === 1 ? '' : 's'} in this run of ${plan.name}. Confirming starts a fresh cycle at Week ${clampedWeek}, Day ${targetDay} while keeping your workout log and personal bests.`
          : `Confirming starts a fresh run of ${plan.name} at Week ${clampedWeek}, Day ${targetDay} while keeping your workout log and personal bests.`,
      confirm_label: `Reset to W${clampedWeek} Day ${targetDay}`,
      cancel_label: 'Cancel',
      preview_diff: previewDiff,
      status: 'pending',
      args: {
        program_id: requestedProgramId,
        target_week: clampedWeek,
        target_day: targetDay,
        confirmation_required: false,
      },
    };
    return {
      toolName: 'reset_program',
      mutationStatus: 'awaiting_confirmation',
      summaryText: completedInProgress
        ? `Today's **${context.activeWorkout.name}** already has logged sets in progress. Confirm below if you want to discard today's uncompleted draft and restart **${plan.name}** at Week ${clampedWeek}, Day ${targetDay} (saved workouts stay in history).`
        : overviewBefore.completedCount > 0
          ? `You currently have **${overviewBefore.completedCount} completed workout${overviewBefore.completedCount === 1 ? '' : 's'}** in this run of **${plan.name}**. Confirm below to restart at Week ${clampedWeek}, Day ${targetDay} (your past workout history stays intact).`
          : `Confirm below to reset **${plan.name}** to Week ${clampedWeek}, Day ${targetDay} (your past workout history stays intact).`,
      pendingConfirmation,
      stateDiff: previewDiff,
    };
  }

  // Non-plan split (Full Body / UL / PPL) fallback reset
  if (!isPlanProgram(requestedProgramId)) {
    const splitDay = getFirstSplitDayForProgram(requestedProgramId);
    const updatedProfilePatch: Partial<UserProfile> = {
      programType: requestedProgramId,
      mesocycleWeek: clampedWeek,
    };
    const generated = prepareSessionForAthlete(
      generateSmartWorkoutSession(
        splitDay,
        context.workouts,
        context.exerciseCatalog,
        context.readinessState,
        clampedWeek,
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
      actionType: 'RESET_PROGRAM',
      updatedProfile: updatedProfilePatch,
      updatedWorkout: generated,
      stateDiff: {
        object_type: 'Program',
        object_id: requestedProgramId,
        label: `Program Reset • Week ${clampedWeek}, Day ${targetDay}`,
        previous_state: {
          display: `Week ${context.profile.mesocycleWeek || 1} • ${context.activeWorkout.name}`,
          week: context.profile.mesocycleWeek || 1,
        },
        new_state: {
          display: `Week ${clampedWeek}, Day ${targetDay} • ${generated.name}`,
          week: clampedWeek,
          day: targetDay,
        },
      },
      summaryText: `**Program reset to Week ${clampedWeek}, Day ${targetDay}.** Today's session is now **${generated.name}**.`,
      navigateTarget: 'program',
      navigateLabel: 'View Program',
    });
  }

  const cycleStarts = {
    ...(context.profile.planCycleStarts || {}),
    [plan.id]: new Date(Date.now() + 1).toISOString(),
  };
  const nextStartWorkouts: Record<string, number> = {
    ...(context.profile.planStartWorkouts || {}),
  };
  if (targetWorkoutNumber > 1) {
    nextStartWorkouts[plan.id] = targetWorkoutNumber;
  } else {
    delete nextStartWorkouts[plan.id];
  }
  const updatedProfilePatch: Partial<UserProfile> = {
    programType: plan.id,
    mesocycleWeek: clampedWeek,
    planCycleStarts: cycleStarts,
    planStartWorkouts: Object.keys(nextStartWorkouts).length > 0 ? nextStartWorkouts : undefined,
  };
  const nextProfile = { ...context.profile, ...updatedProfilePatch };
  const freshWorkout = buildPreparedSessionForReset(plan, targetWorkoutNumber, context, nextProfile);

  return commitMutationTransaction({
    context,
    toolName: 'reset_program',
    actionType: 'RESET_PROGRAM',
    updatedProfile: updatedProfilePatch,
    updatedWorkout: freshWorkout,
    stateDiff: previewDiff,
    summaryText: `**${plan.name} reset to Week ${clampedWeek}, Day ${targetDay}.** Today's queued workout is **${planWorkoutLabel(freshWorkout.name)}**, and your past completed logs remain in history.`,
    navigateTarget: 'program',
    navigateLabel: 'View Program',
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

  const continuity = evaluateSingleExerciseContinuitySwap({
    currentExercise: targetEx,
    replacementDef: replacement,
    historicalWorkouts: context.workouts,
    exerciseCatalog: context.exerciseCatalog,
    storedProgressionStates: context.profile.exerciseProgressionStates,
    activeOverlay: resolveActiveOverlay(context.profile.activeEnvironmentOverlay).active,
    userBodyweightKg: context.bodyweightEmaKg,
    unit,
    planId: getSessionPlanId(activeWorkout) ?? 'default',
    splitDay: activeWorkout.splitDay,
  });

  const replacementEx: ExerciseSession = {
    ...preparedSingle,
    slotId: targetEx.slotId ?? targetEx.orderCode ?? targetEx.id,
    anchorExerciseId: targetEx.anchorExerciseId ?? targetEx.exerciseId,
    anchorExerciseName: targetEx.anchorExerciseName ?? targetEx.name,
    anchorReferenceLabel: continuity.anchorReferenceLabel,
    calibrationSource: timed ? undefined : continuity.prescription.calibrationSource,
    continuityRationaleKind: timed ? undefined : continuity.prescription.rationaleKind,
    coarseJumpPct: timed ? undefined : continuity.prescription.coarseJumpPct,
    setupLabel: timed ? undefined : continuity.prescription.setupLabel,
    bodyweightLoadPct: timed ? undefined : continuity.prescription.bodyweightLoadPct,
    leverageTier: timed ? undefined : continuity.targetMetadata.leverageTier,
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
  const swapWhy = buildSwapWhyThisWorksForExercise({
    exercise: finalReplacement,
    exerciseCatalog,
    unit: context.profile.weightUnit || 'kg',
  });
  const whyClause = swapWhy
    ? `\n\n**Why this works:** ${swapWhy.tier1} ${swapWhy.whyBullets[0] ?? ''}`.trimEnd()
    : replacement.whyItWorks
    ? `\n\n**Why this works:** ${replacement.whyItWorks}`
    : '';
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
    summaryText: `Swapped **${targetEx.name}** → **${replacement.name}** in **${activeWorkout.name}**${reasonSuffix}.${whyClause}`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface AdjustWorkoutVolumeArgs {
  workout_id?: string;
  modifier_type: 'reduce_sets' | 'increase_sets' | 'deload_load' | 'short_on_time';
  exercise_name?: string;
  target_sets?: number;
  set_delta?: number;
  load_delta_pct?: number;
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

  const detailText = (rawArgs.details || '').toLowerCase();
  const explicitExQuery = (rawArgs.exercise_name || '').trim();
  const isExplicitlyAll = /\b(all|every|each|whole|entire)\b/.test(detailText) && !explicitExQuery;

  // Resolve a named exercise FIRST so phrases like "Add a set to Bench Press in today's workout"
  // target that exercise instead of mutating every lift in the session.
  let specificEx: ExerciseSession | undefined;
  if (rawArgs.modifier_type !== 'short_on_time' && !isExplicitlyAll) {
    if (explicitExQuery) {
      specificEx = findWorkoutExercise(explicitExQuery, activeWorkout, exerciseCatalog);
    }
    if (!specificEx && detailText) {
      specificEx = findWorkoutExercise(detailText, activeWorkout, exerciseCatalog);
    }
  }

  // If the athlete asked to add N sets of an exercise that is NOT in today's workout (e.g. "Add 4 sets of Face Pulls"),
  // delegate cleanly to executeModifyWorkoutExercises(add) rather than bumping every unrelated lift.
  if (
    !specificEx &&
    rawArgs.modifier_type === 'increase_sets' &&
    !isExplicitlyAll &&
    (explicitExQuery || /\b(?:of|for|on)\s+[a-z]/i.test(detailText))
  ) {
    const candidateQuery =
      explicitExQuery ||
      detailText.match(/\b(?:of|for|on)\s+([a-z0-9\s-]{3,40}?)(?:\s+(?:to|in)\s+today|$)/i)?.[1]?.trim() ||
      '';
    const catalogDef = candidateQuery ? findCatalogExercise(candidateQuery, exerciseCatalog, activeWorkout) : undefined;
    if (catalogDef && !activeWorkout.exercises.some((e) => e.exerciseId === catalogDef.id)) {
      const explicitSetMatch = detailText.match(/\b(\d+)\s*(?:working\s*)?sets?\b/i);
      const setsToAdd =
        typeof rawArgs.target_sets === 'number'
          ? rawArgs.target_sets
          : typeof rawArgs.set_delta === 'number'
            ? rawArgs.set_delta
            : explicitSetMatch
              ? Number(explicitSetMatch[1])
              : 3;
      return executeModifyWorkoutExercises(
        {
          action: 'add',
          exercise_name: catalogDef.name,
          sets: Math.max(1, Math.min(8, Math.round(setsToAdd))),
          reason: rawArgs.details,
        },
        context
      );
    }
  }

  // Parse explicit target set count, set delta, or load percentage from args or details text.
  const explicitTargetSets =
    typeof rawArgs.target_sets === 'number'
      ? Math.max(1, Math.min(10, Math.round(rawArgs.target_sets)))
      : detailText.match(/\b(?:to|at)\s+(\d+)\s*(?:working\s*)?sets?\b/i)
        ? Math.max(1, Math.min(10, Number(detailText.match(/\b(?:to|at)\s+(\d+)\s*(?:working\s*)?sets?\b/i)![1])))
        : undefined;
  const parsedDeltaMatch = detailText.match(/(?:^|\s)[+-]?(\d+)\s*(?:more|extra|working)?\s*sets?\b/i);
  const deltaStep =
    typeof rawArgs.set_delta === 'number'
      ? Math.max(1, Math.min(5, Math.abs(Math.round(rawArgs.set_delta))))
      : !explicitTargetSets && parsedDeltaMatch
        ? Math.max(1, Math.min(5, Number(parsedDeltaMatch[1])))
        : 1;
  const parsedPctMatch = detailText.match(/(\d+(?:\.\d+)?)\s*%/);
  const loadDropPct =
    typeof rawArgs.load_delta_pct === 'number'
      ? Math.max(5, Math.min(40, Math.abs(rawArgs.load_delta_pct)))
      : parsedPctMatch
        ? Math.max(5, Math.min(40, Number(parsedPctMatch[1])))
        : 10;

  const unit = context.profile.weightUnit || 'kg';
  let changed = false;
  const updatedExercises = activeWorkout.exercises.map((ex, exIdx) => {
    if (specificEx && ex.id !== specificEx.id) return ex;
    const warmups = ex.sets.filter((s) => s.isWarmup || s.setType === 'warmup');
    const working = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
    const completedWorking = working.filter((s) => s.completed);
    const pendingWorking = working.filter((s) => !s.completed);
    if (pendingWorking.length === 0 && rawArgs.modifier_type !== 'increase_sets') return ex;

    if (rawArgs.modifier_type === 'reduce_sets' || rawArgs.modifier_type === 'short_on_time') {
      const targetRemaining =
        rawArgs.modifier_type === 'short_on_time'
          ? exIdx < 3
            ? 2
            : 1
          : explicitTargetSets !== undefined
            ? explicitTargetSets
            : Math.max(1, working.length - deltaStep);
      const keepTotal = Math.max(completedWorking.length, Math.min(working.length, targetRemaining));
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
      const desiredTotal =
        explicitTargetSets !== undefined
          ? Math.min(10, Math.max(working.length, explicitTargetSets))
          : Math.min(10, working.length + deltaStep);
      const addCount = desiredTotal - working.length;
      if (addCount <= 0) return ex;
      changed = true;
      const extras: WorkoutSet[] = Array.from({ length: addCount }, (_, idx) => ({
        ...lastWorking,
        id: `${ex.id}-extra-${Date.now()}-${exIdx}-${idx}`,
        setNumber: ex.sets.length + idx + 1,
        completed: false,
        completedAt: undefined,
      }));
      return { ...ex, sets: [...ex.sets, ...extras] };
    }

    if (rawArgs.modifier_type === 'deload_load') {
      const factor = 1 - loadDropPct / 100;
      const nextWorking = working.map((s) => {
        if (s.completed || s.targetWeightKg <= 0) return s;
        const reduced = snapLoadKg(Math.max(loadIncrementFor(ex.equipment), s.targetWeightKg * factor), unit, ex.equipment);
        changed = true;
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
        ? `**${specificEx.name}** is already at that set count or completed. No volume changes were made.`
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
      ? `-${Math.round(loadDropPct)}% load, RIR 2+ (${workingCountAfter} sets)`
      : `${workingCountAfter} working sets`;

  const scopeLabel = specificEx ? `**${specificEx.name}** in **${activeWorkout.name}**` : `**${activeWorkout.name}**`;
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
        ? `Lightened uncompleted sets on ${scopeLabel} by ~${Math.round(loadDropPct)}% and set target effort to 2 RIR.`
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
  gym: 'Gym',
  home: 'Home',
  travel: 'Bodyweight / No equipment',
};

export interface SwitchLocationArgs {
  location: TrainingLocation;
  week?: number;
  constraint_text?: string;
  max_dumbbell_kg?: number;
  max_session_minutes?: number;
  duration_days?: number;
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
  const nowMs = Date.now();
  const unit = context.profile.weightUnit || 'kg';

  const activePlanForWeek = resolveActivePlan(context.profile);
  const maxPlanWeeks = Math.max(6, ...activePlanForWeek.templates.map((t) => t.week));
  if (typeof rawArgs.week === 'number' && rawArgs.week >= 1 && rawArgs.week <= maxPlanWeeks) {
    const targetWeek = Math.round(rawArgs.week);
    const currentSchedule = { ...(context.profile.scheduledWeekLocations || {}) };
    const prevWeekLoc = currentSchedule[targetWeek] ?? context.profile.activeLocation ?? 'gym';
    currentSchedule[targetWeek] = targetLoc;
    const updatedProfile: Partial<UserProfile> = { scheduledWeekLocations: currentSchedule };
    let updatedWorkout: WorkoutSession | undefined;

    const planOverview = buildPlanOverview(
      context.workouts,
      activePlanForWeek,
      context.activities ?? [],
      context.profile.planCycleStarts,
      context.profile.planStartWorkouts
    );
    const currentPlanWeek = isPlanProgram(context.profile.programType)
      ? activePlanForWeek.templates.find((t) => t.workoutNumber === planOverview.nextWorkoutNumber)?.week ||
        context.profile.mesocycleWeek ||
        1
      : context.profile.mesocycleWeek || 1;

    if (currentPlanWeek === targetWeek && context.activeWorkout.location !== targetLoc) {
      const weekOverlay = createOverlayForTrainingLocation(
        targetLoc,
        context.profile.homeEquipment,
        nowMs,
        {
          scope: 'WEEK_OVERRIDE',
          maxDumbbellKg: context.profile.equipmentInventories?.home?.dumbbellMaxKg ?? null,
          dumbbellStepKg: context.profile.equipmentInventories?.home?.dumbbellStepKg ?? null,
        }
      );
      updatedWorkout = applyEnvironmentOverlayToSession({
        session: context.activeWorkout,
        overlay: weekOverlay,
        exerciseCatalog: context.exerciseCatalog,
        historicalWorkouts: context.workouts,
        storedProgressionStates: context.profile.exerciseProgressionStates,
        userBodyweightKg: context.bodyweightEmaKg,
        nowMs,
        unit,
      });
      updatedProfile.activeLocation = targetLoc;
      updatedProfile.activeEnvironmentOverlay = weekOverlay;
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
  const prevOverlay = resolveActiveOverlay(context.profile.activeEnvironmentOverlay, nowMs).active;

  // Build unified EnvironmentOverlay from natural-language constraints, structured caps, or TrainingLocation.
  let nextOverlay: EnvironmentOverlay | null = null;
  const hasStructuredConstraint =
    Boolean(rawArgs.constraint_text && rawArgs.constraint_text.trim().length > 0) ||
    typeof rawArgs.max_dumbbell_kg === 'number' ||
    typeof rawArgs.max_session_minutes === 'number' ||
    typeof rawArgs.duration_days === 'number';

  if (rawArgs.constraint_text && rawArgs.constraint_text.trim().length > 0) {
    const parsed = parseEnvironmentConstraintText(rawArgs.constraint_text, { nowMs });
    nextOverlay = parsed.activeProfileType === 'HOME_GYM' ? null : parsed;
  } else if (hasStructuredConstraint) {
    const scope =
      typeof rawArgs.duration_days === 'number' && rawArgs.duration_days > 1
        ? 'CUSTOM_UNTIL_DATE'
        : 'TODAY_ONLY';
    const expiresAtEpochMs =
      typeof rawArgs.duration_days === 'number' && rawArgs.duration_days > 0
        ? nowMs + Math.round(rawArgs.duration_days) * 24 * 60 * 60 * 1000
        : undefined;
    const profileType =
      typeof rawArgs.max_dumbbell_kg === 'number'
        ? 'HOTEL_DUMBBELLS'
        : typeof rawArgs.max_session_minutes === 'number' && targetLoc === 'gym'
        ? 'TIME_CONSTRAINED'
        : targetLoc === 'travel'
        ? 'BODYWEIGHT'
        : targetLoc === 'home'
        ? 'CUSTOM'
        : 'HOME_GYM';
    nextOverlay =
      profileType === 'HOME_GYM'
        ? null
        : createPresetOverlay(profileType, scope, {
            nowMs,
            maxDumbbellKg: rawArgs.max_dumbbell_kg ?? null,
            maxSessionMinutes: rawArgs.max_session_minutes ?? null,
            expiresAtEpochMs,
            homeEquipment: context.profile.homeEquipment,
          });
  } else {
    nextOverlay = createOverlayForTrainingLocation(targetLoc, context.profile.homeEquipment, nowMs, {
      maxDumbbellKg: context.profile.equipmentInventories?.home?.dumbbellMaxKg ?? null,
      dumbbellStepKg: context.profile.equipmentInventories?.home?.dumbbellStepKg ?? null,
    });
  }

  const resolvedLoc: TrainingLocation = nextOverlay ? overlayToTrainingLocation(nextOverlay) : 'gym';

  let baseSessionForOverlay = context.activeWorkout;
  const returningToGymWithoutAnchors =
    !nextOverlay &&
    (context.activeWorkout.location ?? context.profile.activeLocation) !== 'gym' &&
    !context.activeWorkout.exercises.some((ex) => Boolean(ex.anchorExerciseId));

  if (returningToGymWithoutAnchors) {
    const adaptedGym = adaptWorkoutSessionToLocation(
      context.activeWorkout,
      'gym',
      context.profile.homeEquipment || [],
      context.exerciseCatalog,
      context.workouts,
      context.readinessState,
      context.bodyweightEmaKg
    );
    baseSessionForOverlay = prepareSessionForAthlete(adaptedGym, {
      history: context.workouts,
      bodyweightKg: context.bodyweightEmaKg,
      readinessState: context.readinessState,
      gender: context.profile.gender,
      experienceLevel: context.profile.experienceLevel,
      unit,
      isProgramPlan: isPlanProgram(context.profile.programType),
    });
  }

  const updatedWorkout = applyEnvironmentOverlayToSession({
    session: baseSessionForOverlay,
    overlay: nextOverlay,
    exerciseCatalog: context.exerciseCatalog,
    historicalWorkouts: context.workouts,
    storedProgressionStates: context.profile.exerciseProgressionStates,
    userBodyweightKg: context.bodyweightEmaKg,
    nowMs,
    unit,
  });

  let reply: string;
  if (nextOverlay && hasStructuredConstraint) {
    const capPart = nextOverlay.maxDumbbellKg
      ? ` with dumbbells capped at ${formatWeight(nextOverlay.maxDumbbellKg, unit)}`
      : '';
    const minsPart = nextOverlay.maxSessionMinutes
      ? ` sized for ~${nextOverlay.maxSessionMinutes} min`
      : '';
    const expiryPart =
      nextOverlay.scope === 'CUSTOM_UNTIL_DATE' && nextOverlay.expiresAtEpochMs
        ? ` Auto-reverts to your master program after ${localDateString(new Date(nextOverlay.expiresAtEpochMs))}.`
        : nextOverlay.scope === 'WEEK_OVERRIDE'
        ? ' Auto-reverts to your master program at the end of this week.'
        : ' Applies to today only — your master program stays untouched.';
    reply = `Switched to **${nextOverlay.label}**${capPart}${minsPart}. Set 1 weights are anchored from your gym history and will calibrate on the fly.${expiryPart}`;
  } else {
    reply =
      resolvedLoc === 'travel'
        ? `Switched today's workout to bodyweight. Every exercise now needs no equipment, with reps matched to your strength.`
        : resolvedLoc === 'home'
        ? `Switched today's workout to home. It now uses ${(context.profile.homeEquipment || []).map((t) => equipNames[t] || t).join(', ') || 'your bodyweight'}.`
        : `Switched today's workout back to the gym, with barbells, cables and machines available again.`;
  }

  const firstSwappedWhy = updatedWorkout.exercises
    .map((ex) =>
      buildSwapWhyThisWorksForExercise({
        exercise: ex,
        exerciseCatalog: context.exerciseCatalog,
        unit,
      })
    )
    .find(Boolean);
  const locationWhyClause =
    firstSwappedWhy && resolvedLoc !== 'gym'
      ? `\n\n**Why these swaps work:** ${firstSwappedWhy.whyBullets[0] ?? firstSwappedWhy.tier1}`
      : '';

  return commitMutationTransaction({
    context,
    toolName: 'switch_location',
    actionType: 'SWITCH_LOCATION',
    updatedProfile: {
      activeLocation: resolvedLoc,
      activeEnvironmentOverlay: nextOverlay,
    },
    updatedWorkout,
    stateDiff: {
      object_type: 'Workout',
      object_id: context.activeWorkout.id,
      label: nextOverlay && hasStructuredConstraint ? 'Environment Overlay Applied' : 'Location Switched',
      previous_state: { display: prevOverlay ? prevOverlay.label : LOCATION_LABELS[prevLoc] },
      new_state: { display: nextOverlay ? nextOverlay.label : LOCATION_LABELS[resolvedLoc] },
    },
    summaryText: `${reply}${locationWhyClause}`,
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
  if (/\b(starter_4day|4[\s-]*day|lift\s*4|four\s*day|upper\s*[\/-]?\s*lower|upper\s+and\s+lower)\b/i.test(lower)) {
    return { id: 'starter_4day', name: '6-Week Starter Plan (4-Day Upper/Lower)' };
  }
  if (/\b(starter_6wk|starter\s*plan|starter|3[\s-]*day|three\s*day|3\s*workouts?|full[\s-]*body)\b/i.test(lower)) {
    return { id: 'starter_6wk', name: '6-Week Starter Plan (3-Day Full Body)' };
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
  const nextNum = getNextProgramWorkoutNumber(
    context.workouts,
    targetPlan,
    nextProfile.planCycleStarts,
    nextProfile.planStartWorkouts
  );
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
      previous_state: { display: currentPlan.id === 'starter_4day' ? '6-Week Starter Plan (4-Day Upper/Lower)' : currentPlan.id === 'starter_6wk' ? '6-Week Starter Plan (3-Day Full Body)' : currentPlan.name },
      new_state: { display: matchedPlan.name },
    },
    summaryText: `Switched your program to **${matchedPlan.name}**. Your next session on the Workout tab is **Workout ${nextNum} of ${targetPlan.templates.length}: ${planWorkoutLabel(freshWorkout.name)}** (Week ${nextWeek}).`,
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
      const nextNum = getNextProgramWorkoutNumber(
        context.workouts,
        plan,
        nextProfile.planCycleStarts,
        nextProfile.planStartWorkouts
      );
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
    navigateDetail: { detail: 'goals' },
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
    navigateDetail: { detail: 'goals' },
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
      object_type: 'Dashboard',
      object_id: 'progress-widgets',
      label: 'Progress Updated',
      previous_state: { display: `${(context.profile.progressWidgets ?? []).length || 'Default'} widgets` },
      new_state: { display: result.summary || 'Progress widgets updated' },
    },
    summaryText: result.reply,
    navigateTarget: 'analytics',
    navigateLabel: 'View Progress',
    navigateDetail: { detail: 'overview' },
  });
}

export interface LogEntryArgs {
  kind: 'bodyweight' | 'body_fat' | 'waist' | 'tape_measurement' | 'steps' | 'height' | 'active_day';
  value: number;
  unit?: 'kg' | 'lb' | 'cm' | 'in' | 'steps' | 'minutes';
  measurement_site?: string;
  activity_type?: ActivityType | 'mobility';
  distance_km?: number;
  date?: string;
}

function resolveLogDateString(rawDate?: string): { dateStr: string; label: string } {
  const today = new Date();
  const todayStr = localDateString(today);
  if (!rawDate) return { dateStr: todayStr, label: 'today' };
  const cleaned = rawDate.trim().toLowerCase();
  if (cleaned === 'today') return { dateStr: todayStr, label: 'today' };
  if (cleaned === 'yesterday') {
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    return { dateStr: localDateString(y), label: 'yesterday' };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return { dateStr: cleaned, label: cleaned === todayStr ? 'today' : cleaned };
  }
  return { dateStr: todayStr, label: 'today' };
}

function resolveTapeSite(rawSite?: string): BodySiteDefinition | undefined {
  if (!rawSite) return undefined;
  const s = rawSite.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const direct = BODY_MEASUREMENT_SITES.find((site) => site.id === s || site.label.toLowerCase().replace(/\s+/g, '_') === s);
  if (direct) return direct;
  if (s === 'shoulders' || s === 'delts') return BODY_MEASUREMENT_SITES.find((site) => site.id === 'shoulder');
  if (s === 'hips' || s === 'glutes') return BODY_MEASUREMENT_SITES.find((site) => site.id === 'hip');
  if (s === 'stomach' || s === 'belly' || s === 'navel') return BODY_MEASUREMENT_SITES.find((site) => site.id === 'abdomen');
  if (s === 'left_bicep' || s === 'left_arm' || s === 'arm_left' || s === 'biceps_left') {
    return BODY_MEASUREMENT_SITES.find((site) => site.id === 'bicep_left');
  }
  if (s === 'right_bicep' || s === 'right_arm' || s === 'arm_right' || s === 'biceps_right' || s === 'bicep' || s === 'biceps' || s === 'arm') {
    return BODY_MEASUREMENT_SITES.find((site) => site.id === 'bicep_right');
  }
  if (s === 'left_thigh' || s === 'left_quad' || s === 'quad_left' || s === 'thighs_left') {
    return BODY_MEASUREMENT_SITES.find((site) => site.id === 'thigh_left');
  }
  if (s === 'right_thigh' || s === 'right_quad' || s === 'quad_right' || s === 'thighs_right' || s === 'thigh' || s === 'thighs') {
    return BODY_MEASUREMENT_SITES.find((site) => site.id === 'thigh_right');
  }
  if (s === 'left_calf' || s === 'calves_left') return BODY_MEASUREMENT_SITES.find((site) => site.id === 'calf_left');
  if (s === 'right_calf' || s === 'calves_right' || s === 'calf' || s === 'calves') {
    return BODY_MEASUREMENT_SITES.find((site) => site.id === 'calf_right');
  }
  return undefined;
}

export async function executeLogEntry(
  rawArgs: LogEntryArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const val = Number(rawArgs.value);
  const { dateStr: targetDateStr, label: dateLabel } = resolveLogDateString(rawArgs.date);
  const profileUnit = context.profile.weightUnit || 'kg';

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
    const rawType = rawArgs.activity_type === 'mobility' ? 'class' : rawArgs.activity_type;
    const actType: ActivityType = rawType && rawType in ACTIVITY_LABELS ? (rawType as ActivityType) : 'other';
    const label = ACTIVITY_LABELS[actType];
    const distKm =
      typeof rawArgs.distance_km === 'number' && Number.isFinite(rawArgs.distance_km) && rawArgs.distance_km > 0 && rawArgs.distance_km <= 300
        ? Math.round(rawArgs.distance_km * 10) / 10
        : undefined;
    const existing = context.activities ?? [];
    const entry: ActivityLog = {
      id: `act-coach-${Date.now()}`,
      date: targetDateStr,
      startedAt: new Date().toISOString(),
      minutes: mins,
      type: actType,
      source: 'manual',
      name: `${label} (${mins} min${distKm ? ` · ${distKm} km` : ''})`,
      ...(distKm ? { distanceKm: distKm } : {}),
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
        new_state: { display: `${label} · ${mins} min${distKm ? ` (${distKm} km)` : ''}` },
      },
      summaryText: countsActiveDay
        ? `Logged your **${mins}-minute ${label.toLowerCase()}**${distKm ? ` (${distKm} km)` : ''} for ${dateLabel}. It counts as an active day toward your weekly sessions and keeps your streak alive.`
        : `Logged your **${mins}-minute ${label.toLowerCase()}** for ${dateLabel}. Sessions of ${MIN_ACTIVE_MINUTES}+ minutes count toward your weekly active-day goal.`,
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

  if (rawArgs.kind === 'height') {
    const lenUnit = rawArgs.unit === 'in' || rawArgs.unit === 'cm' ? rawArgs.unit : profileUnit === 'lb' ? 'in' : 'cm';
    const cm = Math.round((lenUnit === 'in' ? val * 2.54 : val) * 10) / 10;
    if (cm < 110 || cm > 250) {
      return {
        toolName: 'log_entry',
        actionType: 'UPDATE_PROFILE',
        mutationStatus: 'error',
        summaryText: 'Height must be between 110 and 250 cm.',
        errorMessage: 'Height out of range.',
      };
    }
    const prevHeight = context.profile.measuredHeightCm
      ? `${context.profile.measuredHeightCm} cm`
      : 'Not set';
    return commitMutationTransaction({
      context,
      toolName: 'log_entry',
      actionType: 'UPDATE_PROFILE',
      updatedProfile: { heightCm: Math.round(cm), measuredHeightCm: Math.round(cm) },
      stateDiff: {
        object_type: 'Athlete',
        object_id: 'height',
        label: 'Height Updated',
        previous_state: { display: prevHeight },
        new_state: { display: `${Math.round(cm)} cm` },
      },
      summaryText: `Saved your height as **${Math.round(cm)} cm**. Body composition ratios now use it.`,
      navigateTarget: 'analytics',
      navigateLabel: 'View Measurements',
      navigateDetail: { detail: 'measurements' },
    });
  }

  const existingBio = context.biometrics ?? [];
  const dayIdx = existingBio.findIndex((b) => b.date === targetDateStr);
  const currentDay = dayIdx >= 0 ? existingBio[dayIdx] : undefined;

  let patch: Partial<BiometricLog> = {};
  let displayPrev = dateLabel === 'today' ? 'Not logged today' : `Not logged (${dateLabel})`;
  let displayNew = '';
  let navDetail: { detail?: string } = { detail: 'weight' };
  let navLabel = 'View Body Weight';

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
    if (currentDay?.bodyweightKg && currentDay.bodyweightKg > 0) {
      displayPrev = `Weight: ${formatPreciseWeight(currentDay.bodyweightKg, profileUnit)}`;
    }
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
    if (typeof currentDay?.bodyFatPct === 'number' && currentDay.bodyFatPct > 0) {
      displayPrev = `Body fat: ${currentDay.bodyFatPct}%`;
    }
    displayNew = `Body fat: ${bf}%`;
    navDetail = { detail: 'composition' };
    navLabel = 'View Composition';
  } else if (rawArgs.kind === 'steps') {
    const steps = Math.round(val);
    if (steps < 100 || steps > 100000) {
      return {
        toolName: 'log_entry',
        actionType: 'LOG_BIOMETRIC',
        mutationStatus: 'error',
        summaryText: 'Daily steps should be between 100 and 100,000.',
        errorMessage: 'Steps out of range.',
      };
    }
    patch = { steps, isManualEntry: true };
    if (currentDay?.steps && currentDay.steps > 0) {
      displayPrev = `${currentDay.steps.toLocaleString()} steps`;
    }
    displayNew = `${steps.toLocaleString()} steps`;
    navDetail = { detail: 'steps' };
    navLabel = 'View Steps';
  } else {
    // waist or any of the 12 tape_measurement sites
    const siteDef =
      rawArgs.kind === 'waist'
        ? BODY_MEASUREMENT_SITES.find((s) => s.id === 'waist')!
        : resolveTapeSite(rawArgs.measurement_site) ?? BODY_MEASUREMENT_SITES.find((s) => s.id === 'waist')!;
    const lenUnit = rawArgs.unit === 'in' || rawArgs.unit === 'cm' ? rawArgs.unit : profileUnit === 'lb' ? 'in' : 'cm';
    const cm = Math.round((lenUnit === 'in' ? val * 2.54 : val) * 10) / 10;
    if (cm < siteDef.minCm || cm > siteDef.maxCm) {
      return {
        toolName: 'log_entry',
        actionType: 'LOG_BIOMETRIC',
        mutationStatus: 'error',
        summaryText: `${siteDef.label} measurement must be between ${siteDef.minCm} and ${siteDef.maxCm} cm.`,
        errorMessage: `${siteDef.label} out of range.`,
      };
    }
    patch = { [siteDef.field]: cm, isManualEntry: true } as Partial<BiometricLog>;
    const prevVal = currentDay?.[siteDef.field];
    if (typeof prevVal === 'number' && prevVal > 0) {
      displayPrev =
        profileUnit === 'lb'
          ? `${siteDef.label}: ${Math.round((prevVal / 2.54) * 10) / 10} in`
          : `${siteDef.label}: ${prevVal} cm`;
    }
    displayNew =
      profileUnit === 'lb'
        ? `${siteDef.label}: ${Math.round((cm / 2.54) * 10) / 10} in`
        : `${siteDef.label}: ${cm} cm`;
    navDetail = { detail: 'measurements' };
    navLabel = 'View Measurements';
  }

  const nextLog: BiometricLog = currentDay
    ? { ...currentDay, ...patch }
    : {
        date: targetDateStr,
        bodyweightKg: 0,
        hrvRmssd: 0,
        restingHr: 0,
        sleepHours: 0,
        steps: 0,
        activeZoneMinutes: 0,
        ...patch,
      };
  const updatedBiometrics =
    dayIdx >= 0
      ? existingBio.map((b, i) => (i === dayIdx ? nextLog : b))
      : [...existingBio, nextLog].sort((a, b) => a.date.localeCompare(b.date));

  return commitMutationTransaction({
    context,
    toolName: 'log_entry',
    actionType: 'LOG_BIOMETRIC',
    updatedBiometrics,
    stateDiff: {
      object_type: 'Biometric',
      object_id: targetDateStr,
      label: 'Measurement Logged',
      previous_state: { display: displayPrev },
      new_state: { display: displayNew },
    },
    summaryText: `Logged **${displayNew}** for ${dateLabel}. Your Progress trend charts now reflect it.`,
    navigateTarget: 'analytics',
    navigateLabel: navLabel,
    navigateDetail: navDetail,
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
    } else if (ov.kind === 'adjust_rep_range' && ov.repRange) {
      const targetEx = current.exercises.find(
        (e) =>
          (ov.targetExerciseId && e.exerciseId === ov.targetExerciseId) ||
          (ov.targetExerciseName && e.name.toLowerCase() === ov.targetExerciseName.toLowerCase())
      );
      if (targetEx) {
        const [minR, maxR] = ov.repRange;
        current = {
          ...current,
          exercises: current.exercises.map((e) =>
            e.id === targetEx.id
              ? {
                  ...e,
                  minReps: minR,
                  maxReps: maxR,
                  sets: e.sets.map((s) =>
                    s.completed || s.isWarmup || s.setType === 'warmup'
                      ? s
                      : { ...s, targetReps: minR, actualReps: minR }
                  ),
                }
              : e
          ),
        };
        touched = true;
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

export interface ApplyCoachInterventionInput {
  intervention: CoachIntervention;
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  trainingPlan?: TrainingPlan;
}

export interface ApplyCoachInterventionResult {
  appliedOverrides: ProgramExerciseOverride[];
  updatedProfilePatch: Pick<UserProfile, 'programOverrides'>;
  updatedActiveWorkout?: WorkoutSession;
  previousProfileSnapshot: Pick<UserProfile, 'programOverrides' | 'dismissedInterventions'>;
  previousActiveWorkout: WorkoutSession;
  summaryText: string;
  affectedCount: number;
}

/**
 * Deterministically executes a suggested CoachIntervention when accepted by the athlete:
 * persists the resulting ProgramExerciseOverride rules on UserProfile, updates the active plan,
 * and synchronizes today's uncompleted active workout so changes take effect immediately across
 * Program, Workout, Progress, Knowledge Graph, and AI Coach.
 */
export function applyCoachInterventionToState(
  input: ApplyCoachInterventionInput
): ApplyCoachInterventionResult {
  const {
    intervention,
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
  } = input;
  const plan = input.trainingPlan ?? resolveActivePlan(profile);
  const appliedOverrides = buildOverridesForIntervention(intervention, plan.id);
  const nextOverrides = [...(profile.programOverrides ?? []), ...appliedOverrides];
  const updatedPlan = applyProgramOverridesToPlan(plan, appliedOverrides);

  const syntheticContext: CoachToolExecutionContext = {
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
  };

  let updatedActiveWorkout = syncActiveWorkoutWithOverrides(updatedPlan, appliedOverrides, syntheticContext);

  // Also synchronize custom/split active workouts (when not tied to a numbered 6-week plan slot)
  // if the current uncompleted workout contains an affected exercise.
  if (!updatedActiveWorkout && !activeWorkout.completed && !activeWorkout.programWorkoutNumber) {
    const mappedSplitDay: 'Push' | 'Pull' | 'Legs' | 'Upper' =
      activeWorkout.splitDay === 'Lower'
        ? 'Legs'
        : activeWorkout.splitDay === 'Full Body'
        ? 'Upper'
        : activeWorkout.splitDay;
    const syntheticTemplate = {
      workoutNumber: 1,
      week: profile.mesocycleWeek ?? 1,
      phase: 1,
      dayOfWeek: 'Monday' as const,
      title: activeWorkout.name,
      splitDay: mappedSplitDay,
      exercises: [],
    };
    const syntheticPlan: TrainingPlan = {
      ...updatedPlan,
      templates: [syntheticTemplate],
    };
    const synced = syncActiveWorkoutWithOverrides(syntheticPlan, appliedOverrides, {
      ...syntheticContext,
      activeWorkout: { ...activeWorkout, planId: updatedPlan.id, programWorkoutNumber: 1 },
    });
    if (synced) {
      updatedActiveWorkout = {
        ...synced,
        planId: activeWorkout.planId,
        programWorkoutNumber: activeWorkout.programWorkoutNumber,
      };
    }
  }

  const affectedCount = intervention.remainingAffectedCount || intervention.totalAffectedCount;
  const sessionsLabel = `${affectedCount} ${affectedCount === 1 ? 'session' : 'sessions'}`;
  const changeSummary = intervention.proposedChanges.map((c) => c.humanSummary).join(' · ');

  return {
    appliedOverrides,
    updatedProfilePatch: { programOverrides: nextOverrides },
    updatedActiveWorkout,
    previousProfileSnapshot: {
      programOverrides: profile.programOverrides,
      dismissedInterventions: profile.dismissedInterventions,
    },
    previousActiveWorkout: activeWorkout,
    summaryText: changeSummary
      ? `Applied across ${sessionsLabel}: ${changeSummary}.`
      : `Applied "${intervention.title}" across ${sessionsLabel}.`,
    affectedCount,
  };
}

export interface ModifyProgramArgs {
  action:
    | 'swap_exercise'
    | 'add_exercise'
    | 'remove_exercise'
    | 'adjust_sets'
    | 'adjust_rep_range'
    | 'prioritize_first'
    | 'remove_override'
    | 'clear_overrides';
  old_exercise_id?: string;
  new_exercise_id?: string;
  sets?: number;
  set_delta?: number;
  min_reps?: number;
  max_reps?: number;
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

  if (rawArgs.action === 'remove_override') {
    if (planOverrides.length === 0) {
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'noop',
        summaryText: `**${plan.name}** has no custom program edits to remove.`,
      };
    }
    const q = (rawArgs.old_exercise_id || rawArgs.new_exercise_id || rawArgs.reason || '').toLowerCase().trim();
    const matched = q
      ? planOverrides.find(
          (o) =>
            o.targetExerciseName?.toLowerCase().includes(q) ||
            o.replacementExerciseName?.toLowerCase().includes(q) ||
            o.targetExerciseId?.toLowerCase() === q ||
            o.replacementExerciseId?.toLowerCase() === q ||
            o.reason?.toLowerCase().includes(q)
        )
      : planOverrides[planOverrides.length - 1];
    if (!matched) {
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'error',
        summaryText: `Couldn't find a custom program edit matching "${q}" in **${plan.name}**.`,
        errorMessage: 'Override not found.',
      };
    }
    const matchedLabel =
      matched.kind === 'swap_exercise'
        ? `${matched.targetExerciseName || matched.targetExerciseId} → ${matched.replacementExerciseName || matched.replacementExerciseId}`
        : matched.kind === 'add_exercise'
          ? `+ ${matched.replacementExerciseName || matched.replacementExerciseId}`
          : matched.targetExerciseName || matched.targetExerciseId || matched.kind;
    const removeDiff: CoachStateDiff = {
      object_type: 'Program',
      object_id: plan.id,
      label: 'Program Edit Removed',
      previous_state: { display: `${planOverrides.length} active edit${planOverrides.length === 1 ? '' : 's'}` },
      new_state: { display: `Removed: ${matchedLabel}` },
    };
    if (rawArgs.confirmation_required !== false) {
      const pendingConfirmation: CoachPendingConfirmation = {
        tool_name: 'modify_program',
        args: {
          action: 'remove_override',
          old_exercise_id: matched.targetExerciseName || matched.replacementExerciseName || matched.targetExerciseId,
          confirmation_required: false,
        },
        title: `Remove "${matchedLabel}" from ${plan.name}?`,
        summary: `Restores that edit to the default plan while keeping ${planOverrides.length - 1} other edit${planOverrides.length - 1 === 1 ? '' : 's'}`,
        warning: `Only this single customization is removed; your other program adaptations and past logs stay untouched.`,
        confirm_label: 'Remove edit',
        cancel_label: 'Keep edit',
        preview_diff: removeDiff,
        status: 'pending',
      };
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'awaiting_confirmation',
        summaryText: `Confirm below to remove **${matchedLabel}** from **${plan.name}**.`,
        stateDiff: removeDiff,
        pendingConfirmation,
      };
    }
    const nextOverrides = existingOverrides.filter((o) => o.id !== matched.id);
    const nextProfile: UserProfile = {
      ...context.profile,
      programOverrides: nextOverrides.length > 0 ? nextOverrides : undefined,
    };
    const rebuiltPlan = resolveActivePlan(nextProfile);
    let updatedWorkout: WorkoutSession | undefined;
    if (
      !context.activeWorkout.completed &&
      context.activeWorkout.programWorkoutNumber &&
      getSessionPlanId(context.activeWorkout) === rebuiltPlan.id &&
      !hasInProgressSets(context.activeWorkout)
    ) {
      updatedWorkout = buildPreparedSessionForReset(
        rebuiltPlan,
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
      stateDiff: removeDiff,
      summaryText: `Removed the **${matchedLabel}** customization from **${rebuiltPlan.name}**. ${nextOverrides.filter((o) => o.planId === plan.id).length} custom edit${nextOverrides.filter((o) => o.planId === plan.id).length === 1 ? '' : 's'} remain active.`,
      navigateTarget: 'program',
      navigateLabel: 'View Program',
    });
  }

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

  let validatedRepRange: [number, number] | undefined;
  if (rawArgs.action === 'adjust_rep_range') {
    const minR = Math.round(rawArgs.min_reps ?? 6);
    const maxR = Math.round(rawArgs.max_reps ?? Math.max(minR, minR + 2));
    if (!Number.isFinite(minR) || !Number.isFinite(maxR) || minR < 1 || maxR > 30 || maxR < minR) {
      return {
        toolName: 'modify_program',
        actionType: 'MODIFY_PROGRAM',
        mutationStatus: 'error',
        summaryText: 'Provide a valid rep range between 1 and 30 reps (for example, 6–8 or 8–12).',
        errorMessage: 'Invalid rep range.',
      };
    }
    validatedRepRange = [minR, maxR];
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
    ...(validatedRepRange ? { repRange: validatedRepRange } : {}),
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
  } else if (rawArgs.action === 'adjust_rep_range' && targetEx && validatedRepRange) {
    const rangeLbl =
      validatedRepRange[0] === validatedRepRange[1]
        ? `${validatedRepRange[0]} reps`
        : `${validatedRepRange[0]}–${validatedRepRange[1]} reps`;
    titleText = `Change ${targetEx.name} rep range to ${rangeLbl} across ${plan.name}?`;
    prevDisplay = targetEx.name;
    newDisplay = `${targetEx.name}: ${rangeLbl} (${slotsText})`;
    commitSummary = `Updated **${targetEx.name}** to **${rangeLbl}** across ${slotsText} in **${plan.name}**. Double progression will now progress within ${rangeLbl}.`;
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
        ...(validatedRepRange ? { min_reps: validatedRepRange[0], max_reps: validatedRepRange[1] } : {}),
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

export interface LogWorkoutSetArgs {
  exercise_name: string;
  set_number?: number;
  weight?: number;
  unit?: 'kg' | 'lb';
  reps?: number;
  reps_left?: number;
  reps_right?: number;
  duration_seconds?: number;
  rir?: number;
}

export async function executeLogWorkoutSet(
  rawArgs: LogWorkoutSetArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout, exerciseCatalog } = context;
  const query = cleanExerciseQuery(rawArgs.exercise_name);
  let targetEx = query ? findWorkoutExercise(query, activeWorkout, exerciseCatalog) : undefined;
  if (!targetEx && context.place?.exerciseId) {
    targetEx = activeWorkout.exercises.find(
      (e) => e.exerciseId === context.place?.exerciseId || e.id === context.place?.exerciseId
    );
  }
  if (!targetEx) {
    return {
      toolName: 'log_workout_set',
      actionType: 'LOG_WORKOUT_SET',
      mutationStatus: 'error',
      summaryText: query
        ? `Couldn't find "${query}" in today's **${activeWorkout.name}** session.`
        : `Tell me which exercise in **${activeWorkout.name}** you want to log a set for.`,
      errorMessage: 'Exercise not found in active workout.',
    };
  }

  const workingIndices: number[] = [];
  targetEx.sets.forEach((s, idx) => {
    if (!s.isWarmup && s.setType !== 'warmup') workingIndices.push(idx);
  });
  if (workingIndices.length === 0) {
    return {
      toolName: 'log_workout_set',
      actionType: 'LOG_WORKOUT_SET',
      mutationStatus: 'error',
      summaryText: `**${targetEx.name}** has no working sets to log.`,
      errorMessage: 'No working sets.',
    };
  }

  let workingPos = -1;
  if (typeof rawArgs.set_number === 'number' && Number.isFinite(rawArgs.set_number)) {
    const requested = Math.round(rawArgs.set_number);
    if (requested >= 1 && requested <= workingIndices.length) {
      workingPos = requested - 1;
    } else {
      return {
        toolName: 'log_workout_set',
        actionType: 'LOG_WORKOUT_SET',
        mutationStatus: 'error',
        summaryText: `**${targetEx.name}** has ${workingIndices.length} working set${workingIndices.length === 1 ? '' : 's'} (1–${workingIndices.length}).`,
        errorMessage: 'Set number out of range.',
      };
    }
  } else {
    workingPos = workingIndices.findIndex((idx) => !targetEx!.sets[idx].completed);
    if (workingPos < 0) workingPos = workingIndices.length - 1;
  }

  const setIdx = workingIndices[workingPos];
  const prevSet = targetEx.sets[setIdx];
  const profileUnit = context.profile.weightUnit || 'kg';
  const inputUnit = rawArgs.unit === 'lb' || rawArgs.unit === 'kg' ? rawArgs.unit : profileUnit;
  const timed = isTimedExercise(targetEx);
  const unilateral = isUnilateralExercise(targetEx);

  let nextWeightKg = prevSet.actualWeightKg ?? prevSet.targetWeightKg;
  if (typeof rawArgs.weight === 'number' && Number.isFinite(rawArgs.weight)) {
    const converted = Math.round(unitToKg(rawArgs.weight, inputUnit) * 10) / 10;
    if (converted < 0 || converted > 500) {
      return {
        toolName: 'log_workout_set',
        actionType: 'LOG_WORKOUT_SET',
        mutationStatus: 'error',
        summaryText: `Weight ${rawArgs.weight} ${inputUnit} is outside a realistic range (0–500 kg).`,
        errorMessage: 'Weight out of range.',
      };
    }
    nextWeightKg = converted;
  }

  let nextReps = prevSet.actualReps ?? prevSet.targetReps;
  let repsLeft = prevSet.actualRepsLeft;
  let repsRight = prevSet.actualRepsRight;
  if (
    typeof rawArgs.reps_left === 'number' &&
    typeof rawArgs.reps_right === 'number' &&
    Number.isFinite(rawArgs.reps_left) &&
    Number.isFinite(rawArgs.reps_right)
  ) {
    const l = Math.round(rawArgs.reps_left);
    const r = Math.round(rawArgs.reps_right);
    if (l < 1 || l > 100 || r < 1 || r > 100) {
      return {
        toolName: 'log_workout_set',
        actionType: 'LOG_WORKOUT_SET',
        mutationStatus: 'error',
        summaryText: 'Left and right side reps must be between 1 and 100.',
        errorMessage: 'Unilateral reps out of range.',
      };
    }
    repsLeft = l;
    repsRight = r;
    nextReps = Math.min(l, r);
  } else if (typeof rawArgs.reps === 'number' && Number.isFinite(rawArgs.reps)) {
    const r = Math.round(rawArgs.reps);
    if (r < 1 || r > 100) {
      return {
        toolName: 'log_workout_set',
        actionType: 'LOG_WORKOUT_SET',
        mutationStatus: 'error',
        summaryText: 'Reps must be between 1 and 100.',
        errorMessage: 'Reps out of range.',
      };
    }
    nextReps = r;
  }

  let nextDuration = prevSet.actualDurationSeconds ?? prevSet.targetDurationSeconds;
  if (typeof rawArgs.duration_seconds === 'number' && Number.isFinite(rawArgs.duration_seconds)) {
    const secs = Math.round(rawArgs.duration_seconds);
    if (secs < 5 || secs > 600) {
      return {
        toolName: 'log_workout_set',
        actionType: 'LOG_WORKOUT_SET',
        mutationStatus: 'error',
        summaryText: 'Hold duration must be between 5 and 600 seconds.',
        errorMessage: 'Duration out of range.',
      };
    }
    nextDuration = secs;
  }

  let nextRir = prevSet.actualRir ?? prevSet.targetRir;
  if (typeof rawArgs.rir === 'number' && Number.isFinite(rawArgs.rir)) {
    const rir = Math.round(rawArgs.rir);
    if (rir < 0 || rir > 6) {
      return {
        toolName: 'log_workout_set',
        actionType: 'LOG_WORKOUT_SET',
        mutationStatus: 'error',
        summaryText: 'RIR (reps in reserve) must be between 0 and 6.',
        errorMessage: 'RIR out of range.',
      };
    }
    nextRir = rir;
  }

  const nowIso = new Date().toISOString();
  const nextSet: WorkoutSet = {
    ...prevSet,
    actualWeightKg: nextWeightKg,
    actualReps: timed ? 1 : nextReps,
    ...(repsLeft !== undefined ? { actualRepsLeft: repsLeft } : {}),
    ...(repsRight !== undefined ? { actualRepsRight: repsRight } : {}),
    ...(nextDuration !== undefined ? { actualDurationSeconds: nextDuration } : {}),
    actualRir: nextRir,
    completed: true,
    completedAt: nowIso,
  };

  const updatedWorkout: WorkoutSession = {
    ...activeWorkout,
    startedAt: activeWorkout.startedAt || nowIso,
    exercises: activeWorkout.exercises.map((ex) =>
      ex.id === targetEx!.id
        ? { ...ex, sets: ex.sets.map((s, idx) => (idx === setIdx ? nextSet : s)) }
        : ex
    ),
  };

  const pairSuffix = usesTwoDumbbells(targetEx) ? ' each' : '';
  const loadLabel =
    nextWeightKg > 0
      ? `${formatWeight(nextWeightKg, profileUnit)}${pairSuffix}`
      : 'Bodyweight';
  const perfLabel = timed
    ? `${nextDuration ?? 45}s hold`
    : repsLeft !== undefined && repsRight !== undefined
      ? `L ${repsLeft} / R ${repsRight} reps`
      : `${nextReps} reps`;
  const rirLabel = `${nextRir} RIR`;
  const workingNum = workingPos + 1;

  return commitMutationTransaction({
    context,
    toolName: 'log_workout_set',
    actionType: 'LOG_WORKOUT_SET',
    updatedWorkout,
    stateDiff: {
      object_type: 'Workout',
      object_id: activeWorkout.id,
      label: `Set ${workingNum} Logged`,
      previous_state: {
        display: prevSet.completed
          ? `Set ${workingNum}: ${formatWeight(prevSet.actualWeightKg ?? prevSet.targetWeightKg, profileUnit)} × ${prevSet.actualReps ?? prevSet.targetReps}`
          : `Set ${workingNum}: pending`,
      },
      new_state: {
        display: `${targetEx.name} Set ${workingNum}: ${loadLabel} × ${perfLabel} @ ${rirLabel}`,
      },
    },
    summaryText: `Logged **Set ${workingNum}** on **${targetEx.name}**: **${loadLabel} × ${perfLabel}** @ ${rirLabel}${unilateral && repsLeft !== undefined && repsRight !== undefined && repsLeft !== repsRight ? ` (tracking the weaker side at ${nextReps} reps for balanced progression)` : ''}.`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface ReorderWorkoutExercisesArgs {
  exercise_name: string;
  position: 'first' | 'last' | 'before' | 'after';
  reference_exercise_name?: string;
}

export async function executeReorderWorkoutExercises(
  rawArgs: ReorderWorkoutExercisesArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout, exerciseCatalog } = context;
  const target = findWorkoutExercise(cleanExerciseQuery(rawArgs.exercise_name), activeWorkout, exerciseCatalog);
  if (!target) {
    return {
      toolName: 'reorder_workout_exercises',
      actionType: 'REORDER_WORKOUT',
      mutationStatus: 'error',
      summaryText: `Couldn't find "${rawArgs.exercise_name || 'that exercise'}" in today's **${activeWorkout.name}** session.`,
      errorMessage: 'Exercise not found in active workout.',
    };
  }
  const fromIdx = activeWorkout.exercises.findIndex((e) => e.id === target.id);
  const remaining = activeWorkout.exercises.filter((e) => e.id !== target.id);
  let toIdx = 0;
  if (rawArgs.position === 'first') {
    toIdx = 0;
  } else if (rawArgs.position === 'last') {
    toIdx = remaining.length;
  } else {
    const ref = findWorkoutExercise(cleanExerciseQuery(rawArgs.reference_exercise_name), activeWorkout, exerciseCatalog);
    if (!ref || ref.id === target.id) {
      return {
        toolName: 'reorder_workout_exercises',
        actionType: 'REORDER_WORKOUT',
        mutationStatus: 'error',
        summaryText: `Tell me which exercise in **${activeWorkout.name}** to place **${target.name}** ${rawArgs.position}.`,
        errorMessage: 'Reference exercise not found.',
      };
    }
    const refIdx = remaining.findIndex((e) => e.id === ref.id);
    toIdx = rawArgs.position === 'before' ? Math.max(0, refIdx) : Math.min(remaining.length, refIdx + 1);
  }

  if (toIdx === fromIdx) {
    return {
      toolName: 'reorder_workout_exercises',
      actionType: 'REORDER_WORKOUT',
      mutationStatus: 'noop',
      summaryText: `**${target.name}** is already in slot #${fromIdx + 1} of **${activeWorkout.name}**.`,
    };
  }

  const nextExercises = [...remaining];
  nextExercises.splice(toIdx, 0, target);
  return commitMutationTransaction({
    context,
    toolName: 'reorder_workout_exercises',
    actionType: 'REORDER_WORKOUT',
    updatedWorkout: { ...activeWorkout, exercises: nextExercises },
    stateDiff: {
      object_type: 'Workout',
      object_id: activeWorkout.id,
      label: 'Workout Reordered',
      previous_state: { display: `${target.name} (#${fromIdx + 1})` },
      new_state: { display: `${target.name} (#${toIdx + 1})` },
    },
    summaryText: `Moved **${target.name}** to exercise **#${toIdx + 1}** in today's **${activeWorkout.name}** session.`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface UpdateExerciseNoteArgs {
  exercise_name: string;
  note?: string;
  mode?: 'set' | 'append' | 'clear';
}

export async function executeUpdateExerciseNote(
  rawArgs: UpdateExerciseNoteArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout, exerciseCatalog } = context;
  let target = findWorkoutExercise(cleanExerciseQuery(rawArgs.exercise_name), activeWorkout, exerciseCatalog);
  if (!target && context.place?.exerciseId) {
    target = activeWorkout.exercises.find(
      (e) => e.exerciseId === context.place?.exerciseId || e.id === context.place?.exerciseId
    );
  }
  if (!target) {
    return {
      toolName: 'update_exercise_note',
      actionType: 'UPDATE_EXERCISE_NOTE',
      mutationStatus: 'error',
      summaryText: `Couldn't find "${rawArgs.exercise_name || 'that exercise'}" in today's **${activeWorkout.name}** session.`,
      errorMessage: 'Exercise not found in active workout.',
    };
  }

  const mode = rawArgs.mode || 'set';
  const cleanedNote = (rawArgs.note || '').trim();
  if (mode !== 'clear' && !cleanedNote) {
    return {
      toolName: 'update_exercise_note',
      actionType: 'UPDATE_EXERCISE_NOTE',
      mutationStatus: 'error',
      summaryText: `Tell me what note you'd like saved on **${target.name}**.`,
      errorMessage: 'Empty note.',
    };
  }

  const prevNote = target.athleteNotes?.trim() || '';
  const nextNote =
    mode === 'clear'
      ? undefined
      : mode === 'append' && prevNote
        ? `${prevNote} · ${cleanedNote}`
        : cleanedNote;

  const updatedWorkout: WorkoutSession = {
    ...activeWorkout,
    exercises: activeWorkout.exercises.map((e) => (e.id === target!.id ? { ...e, athleteNotes: nextNote } : e)),
  };

  return commitMutationTransaction({
    context,
    toolName: 'update_exercise_note',
    actionType: 'UPDATE_EXERCISE_NOTE',
    updatedWorkout,
    stateDiff: {
      object_type: 'Exercise',
      object_id: target.exerciseId,
      label: mode === 'clear' ? 'Note Cleared' : 'Exercise Note Saved',
      previous_state: { display: prevNote || 'No note' },
      new_state: { display: nextNote || 'Cleared' },
    },
    summaryText:
      mode === 'clear'
        ? `Cleared your session note on **${target.name}**.`
        : `Saved your note on **${target.name}**: "${nextNote}".`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface OverrideRecoveryGateArgs {
  confirmation_required?: boolean;
}

export async function executeOverrideRecoveryGate(
  rawArgs: OverrideRecoveryGateArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const { activeWorkout, workouts, exerciseCatalog } = context;
  if (activeWorkout.recoveryOverride) {
    return {
      toolName: 'override_recovery_gate',
      actionType: 'OVERRIDE_RECOVERY',
      mutationStatus: 'noop',
      summaryText: `**${activeWorkout.name}** is already unlocked on your Workout tab.`,
    };
  }

  const rec = evaluateSessionRecovery(activeWorkout, workouts, exerciseCatalog);
  const recoveringNames = rec.limitingMuscles
    .map((m) => MUSCLE_FRIENDLY_NAMES[m.muscle] || m.muscle)
    .slice(0, 3);
  const musclesText = recoveringNames.length > 0 ? recoveringNames.join(', ') : 'target muscles';
  const readyLabel = rec.readyAt ? formatReadyTime(rec.readyAt) : 'soon';

  const diff: CoachStateDiff = {
    object_type: 'Workout',
    object_id: activeWorkout.id,
    label: 'Train Anyway Override',
    previous_state: { display: rec.isReady ? 'Ready' : `Recovering (${musclesText})` },
    new_state: { display: `${activeWorkout.name} unlocked today` },
  };

  if (rawArgs.confirmation_required !== false) {
    const pendingConfirmation: CoachPendingConfirmation = {
      tool_name: 'override_recovery_gate',
      args: { confirmation_required: false },
      title: `Train ${activeWorkout.name} before recovery finishes?`,
      summary: rec.isReady
        ? `Unlock ${activeWorkout.name} on the Workout tab`
        : `${musclesText} still recovering · ready ${readyLabel}`,
      warning: rec.isReady
        ? `This unlocks ${activeWorkout.name} right now on your Workout tab.`
        : `Your ${musclesText} are still recovering. Training early can blunt strength gains and raise joint fatigue — keep 2–3 reps in reserve if you train anyway.`,
      confirm_label: 'Train anyway',
      cancel_label: 'Respect recovery',
      preview_diff: diff,
      status: 'pending',
    };
    return {
      toolName: 'override_recovery_gate',
      actionType: 'OVERRIDE_RECOVERY',
      mutationStatus: 'awaiting_confirmation',
      summaryText: rec.isReady
        ? `Confirm below to unlock **${activeWorkout.name}** on your Workout tab.`
        : `Your **${musclesText}** are still recovering (ready ${readyLabel}). Confirm below if you still want to unlock **${activeWorkout.name}** and train anyway — if you go ahead, leave 2–3 reps in reserve.`,
      stateDiff: diff,
      pendingConfirmation,
    };
  }

  return commitMutationTransaction({
    context,
    toolName: 'override_recovery_gate',
    actionType: 'OVERRIDE_RECOVERY',
    updatedWorkout: { ...activeWorkout, recoveryOverride: true },
    stateDiff: diff,
    summaryText: `Unlocked **${activeWorkout.name}** on your Workout tab. Keep effort controlled (2–3 RIR) while recovering muscles catch up.`,
    navigateTarget: 'train',
    navigateLabel: 'View Workout',
  });
}

export interface DeleteAthleteMemoryArgs {
  query?: string;
  category?: AthleteMemoryCategory;
  clear_all?: boolean;
  confirmation_required?: boolean;
}

export async function executeDeleteAthleteMemory(
  rawArgs: DeleteAthleteMemoryArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const existing = context.profile.athleteMemories ?? [];
  if (existing.length === 0) {
    return {
      toolName: 'delete_athlete_memory',
      actionType: 'DELETE_ATHLETE_MEMORY',
      mutationStatus: 'noop',
      summaryText: "You don't have any saved coaching memories on file yet.",
    };
  }

  if (rawArgs.clear_all) {
    const clearDiff: CoachStateDiff = {
      object_type: 'Athlete',
      object_id: 'memories',
      label: 'Memories Cleared',
      previous_state: { display: `${existing.length} saved note${existing.length === 1 ? '' : 's'}` },
      new_state: { display: '0 saved notes' },
    };
    if (rawArgs.confirmation_required !== false) {
      const pendingConfirmation: CoachPendingConfirmation = {
        tool_name: 'delete_athlete_memory',
        args: { clear_all: true, confirmation_required: false },
        title: `Clear all ${existing.length} saved coaching notes?`,
        summary: `${existing.length} saved note${existing.length === 1 ? '' : 's'} → None`,
        warning: 'Injuries, contraindications, and preferences saved in chat will be forgotten until you tell Treise again.',
        confirm_label: 'Clear all notes',
        cancel_label: 'Keep notes',
        preview_diff: clearDiff,
        status: 'pending',
      };
      return {
        toolName: 'delete_athlete_memory',
        actionType: 'DELETE_ATHLETE_MEMORY',
        mutationStatus: 'awaiting_confirmation',
        summaryText: `Confirm below to forget all **${existing.length}** saved coaching note${existing.length === 1 ? '' : 's'}.`,
        stateDiff: clearDiff,
        pendingConfirmation,
      };
    }
    return commitMutationTransaction({
      context,
      toolName: 'delete_athlete_memory',
      actionType: 'DELETE_ATHLETE_MEMORY',
      updatedProfile: { athleteMemories: undefined },
      stateDiff: clearDiff,
      summaryText: `Cleared all ${existing.length} saved coaching note${existing.length === 1 ? '' : 's'} from your profile.`,
    });
  }

  const q = (rawArgs.query || '').toLowerCase().trim();
  const qTokens = q
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !['the', 'my', 'note', 'memory', 'fact', 'about', 'that', 'injury', 'pain'].includes(t));

  const matched = existing.filter((m) => {
    if (rawArgs.category && m.category === rawArgs.category && !q) return true;
    const hay = `${m.category} ${m.value}`.toLowerCase();
    if (q && hay.includes(q)) return true;
    if (qTokens.length > 0 && qTokens.some((tok) => hay.includes(tok))) return true;
    if (rawArgs.category && m.category === rawArgs.category && /\b(injury|pain|constraint|preference)\b/i.test(q)) {
      return true;
    }
    return false;
  });

  if (matched.length === 0) {
    const listed = existing.map((m) => `"${m.value}"`).join(', ');
    return {
      toolName: 'delete_athlete_memory',
      actionType: 'DELETE_ATHLETE_MEMORY',
      mutationStatus: 'error',
      summaryText: `Couldn't find a saved note matching "${rawArgs.query || rawArgs.category || 'that'}". Currently saved: ${listed}.`,
      errorMessage: 'Memory fact not found.',
    };
  }

  const matchedIds = new Set(matched.map((m) => m.id));
  const remaining = existing.filter((m) => !matchedIds.has(m.id));
  const removedLabel = matched.map((m) => m.value).join('; ');

  return commitMutationTransaction({
    context,
    toolName: 'delete_athlete_memory',
    actionType: 'DELETE_ATHLETE_MEMORY',
    updatedProfile: { athleteMemories: remaining.length > 0 ? remaining : undefined },
    stateDiff: {
      object_type: 'Athlete',
      object_id: 'memories',
      label: 'Memory Removed',
      previous_state: { display: `${existing.length} saved note${existing.length === 1 ? '' : 's'}` },
      new_state: { display: `Forgot: ${removedLabel}` },
    },
    summaryText: `Forgot **${removedLabel}** from your athlete profile.${remaining.length > 0 ? ` ${remaining.length} saved note${remaining.length === 1 ? '' : 's'} remain.` : ''}`,
  });
}

export interface UpdateAthleteProfileArgs {
  weight_unit?: 'kg' | 'lb';
  age?: number;
  gender?: Gender;
  experience_level?: ExperienceLevel | 'beginner';
  height_cm?: number;
  display_setting?: keyof WorkoutDisplaySettings;
  display_enabled?: boolean;
}

const DISPLAY_SETTING_LABELS: Record<keyof WorkoutDisplaySettings, string> = {
  showExerciseCharts: 'exercise charts',
  showExerciseSummaries: 'exercise summaries',
  showRecoveryCard: 'recovery card',
  showSessionCard: 'session card',
  showProgramCard: 'program card',
  showStepsCard: 'daily steps card',
  showRirTracking: 'RIR tracking',
};

export async function executeUpdateAthleteProfile(
  rawArgs: UpdateAthleteProfileArgs,
  context: CoachToolExecutionContext
): Promise<CoachToolOutcome> {
  const patch: Partial<UserProfile> = {};
  const prevParts: string[] = [];
  const nextParts: string[] = [];
  let updatedWorkout: WorkoutSession | undefined;
  let navTarget: 'train' | 'program' | 'analytics' | undefined;
  let navLabel: string | undefined;

  if (rawArgs.weight_unit === 'kg' || rawArgs.weight_unit === 'lb') {
    const prevUnit = context.profile.weightUnit || 'kg';
    if (prevUnit !== rawArgs.weight_unit) {
      patch.weightUnit = rawArgs.weight_unit;
      prevParts.push(`Units: ${prevUnit}`);
      nextParts.push(`Units: ${rawArgs.weight_unit}`);
      const hasStarted = context.activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed));
      if (!hasStarted) {
        updatedWorkout = {
          ...context.activeWorkout,
          exercises: context.activeWorkout.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((st) =>
              st.targetWeightKg > 0
                ? {
                    ...st,
                    targetWeightKg: snapLoadKg(st.targetWeightKg, rawArgs.weight_unit!, ex.equipment),
                    actualWeightKg: snapLoadKg(st.targetWeightKg, rawArgs.weight_unit!, ex.equipment),
                  }
                : st
            ),
          })),
        };
      }
      navTarget = 'train';
      navLabel = 'View Workout';
    }
  }

  if (typeof rawArgs.age === 'number' && Number.isFinite(rawArgs.age)) {
    const age = Math.round(rawArgs.age);
    if (age < 13 || age > 100) {
      return {
        toolName: 'update_athlete_profile',
        actionType: 'UPDATE_PROFILE',
        mutationStatus: 'error',
        summaryText: 'Age must be between 13 and 100 years.',
        errorMessage: 'Age out of range.',
      };
    }
    patch.age = age;
    patch.ageEntered = true;
    prevParts.push(context.profile.ageEntered ? `Age: ${context.profile.age}` : 'Age: default (18–39)');
    nextParts.push(`Age: ${age}`);
    navTarget = navTarget || 'analytics';
    navLabel = navLabel || 'View Standards';
  }

  if (rawArgs.gender === 'male' || rawArgs.gender === 'female') {
    patch.gender = rawArgs.gender;
    patch.sexEntered = true;
    prevParts.push(`Category: ${context.profile.gender}`);
    nextParts.push(`Category: ${rawArgs.gender}`);
    navTarget = navTarget || 'analytics';
    navLabel = navLabel || 'View Standards';
  }

  if (
    rawArgs.experience_level === 'new' ||
    rawArgs.experience_level === 'beginner' ||
    rawArgs.experience_level === 'intermediate' ||
    rawArgs.experience_level === 'experienced'
  ) {
    const normalizedExp: ExperienceLevel =
      rawArgs.experience_level === 'beginner' ? 'new' : rawArgs.experience_level;
    patch.experienceLevel = normalizedExp;
    prevParts.push(`Experience: ${context.profile.experienceLevel || 'unset'}`);
    nextParts.push(`Experience: ${normalizedExp === 'new' ? 'beginner' : normalizedExp}`);
  }

  if (typeof rawArgs.height_cm === 'number' && Number.isFinite(rawArgs.height_cm)) {
    const cm = Math.round(rawArgs.height_cm);
    if (cm < 110 || cm > 250) {
      return {
        toolName: 'update_athlete_profile',
        actionType: 'UPDATE_PROFILE',
        mutationStatus: 'error',
        summaryText: 'Height must be between 110 and 250 cm.',
        errorMessage: 'Height out of range.',
      };
    }
    patch.heightCm = cm;
    patch.measuredHeightCm = cm;
    prevParts.push(context.profile.measuredHeightCm ? `Height: ${context.profile.measuredHeightCm} cm` : 'Height: unset');
    nextParts.push(`Height: ${cm} cm`);
  }

  if (rawArgs.display_setting && rawArgs.display_setting in DISPLAY_SETTING_LABELS) {
    const resolved = resolveWorkoutDisplaySettings(context.profile.workoutDisplay);
    const desired = rawArgs.display_enabled ?? !resolved[rawArgs.display_setting];
    patch.workoutDisplay = { ...resolved, [rawArgs.display_setting]: desired };
    const lbl = DISPLAY_SETTING_LABELS[rawArgs.display_setting];
    prevParts.push(`${lbl}: ${resolved[rawArgs.display_setting] ? 'shown' : 'hidden'}`);
    nextParts.push(`${lbl}: ${desired ? 'shown' : 'hidden'}`);
    navTarget = 'train';
    navLabel = 'View Workout';
  }

  if (Object.keys(patch).length === 0) {
    return {
      toolName: 'update_athlete_profile',
      actionType: 'UPDATE_PROFILE',
      mutationStatus: 'noop',
      summaryText: 'Your profile setting already matches that value.',
    };
  }

  const unitSnapNote =
    patch.weightUnit && updatedWorkout
      ? ` Unstarted weights in today's session were snapped to real ${patch.weightUnit} increments.`
      : '';

  return commitMutationTransaction({
    context,
    toolName: 'update_athlete_profile',
    actionType: 'UPDATE_PROFILE',
    updatedProfile: patch,
    updatedWorkout,
    stateDiff: {
      object_type: 'Athlete',
      object_id: 'profile',
      label: 'Profile Updated',
      previous_state: { display: prevParts.join(' · ') },
      new_state: { display: nextParts.join(' · ') },
    },
    summaryText: `Updated your profile: **${nextParts.join(' · ')}**.${unitSnapNote}`,
    navigateTarget: navTarget,
    navigateLabel: navLabel,
    navigateDetail: navLabel === 'View Standards' ? { detail: 'standards' } : undefined,
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
    case 'log_workout_set':
      return executeLogWorkoutSet(rawArgs as unknown as LogWorkoutSetArgs, context);
    case 'reorder_workout_exercises':
      return executeReorderWorkoutExercises(rawArgs as unknown as ReorderWorkoutExercisesArgs, context);
    case 'update_exercise_note':
      return executeUpdateExerciseNote(rawArgs as unknown as UpdateExerciseNoteArgs, context);
    case 'override_recovery_gate':
      return executeOverrideRecoveryGate(rawArgs as unknown as OverrideRecoveryGateArgs, context);
    case 'delete_athlete_memory':
      return executeDeleteAthleteMemory(rawArgs as unknown as DeleteAthleteMemoryArgs, context);
    case 'update_athlete_profile':
      return executeUpdateAthleteProfile(rawArgs as unknown as UpdateAthleteProfileArgs, context);
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
      // Preserve any earlier committed tool mutations so React state never falls out of sync with storage.
      if (lastOutcome) {
        return {
          ...outcome,
          summaryText: [...summaries, outcome.summaryText].join('\n\n'),
          updatedProfile: mergedProfile,
          updatedWorkout: latestWorkout,
          updatedBiometrics: latestBiometrics,
          updatedActivities: latestActivities,
          memorySaved,
          undoSnapshot: { ...initialUndoSnapshot, label: `${diffs.length || 1} Updates Applied` },
        };
      }
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
  /\b(i['’]?ve reset|i have reset|program reset|reset to week|permanently swapped|rebalanced your program|applied.*to your program|swapped\b.+\bfor\b|adjusted your sets|volume adjusted|saved to (?:your )?memory|updated your (?:plan|workout|program|profile)|logged your (?:weight|bodyweight|waist|body fat|set)|removed\b.+\bfrom today|added\b.+\bto today|forgot\b.+\bfrom your profile)\b/i;

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

function dedupeAgainstUserMessage(
  chips: CoachSuggestedAction[],
  lastUserMessage?: string
): CoachSuggestedAction[] {
  const normUser = (lastUserMessage || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const seen = new Set<string>();
  const filtered: CoachSuggestedAction[] = [];
  for (const chip of chips) {
    if (!chip.label?.trim() || !chip.prompt?.trim()) continue;
    const normPrompt = chip.prompt.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (normUser && normPrompt === normUser) continue;
    if (seen.has(normPrompt)) continue;
    seen.add(normPrompt);
    filtered.push(chip);
    if (filtered.length >= 3) break;
  }
  return filtered;
}

export function buildSuggestedActions(params: {
  toolName?: CoachToolName;
  mutationStatus?: CoachMutationStatus;
  envelope: ContextEnvelope;
  place?: CoachPlace;
  custom?: CoachSuggestedAction[];
  lastSwap?: { from: string; to: string };
  lastUserMessage?: string;
  isSafetyResponse?: boolean;
}): CoachSuggestedAction[] {
  if (params.custom && params.custom.length > 0) {
    return dedupeAgainstUserMessage(params.custom, params.lastUserMessage);
  }

  const { toolName, mutationStatus, envelope, place, lastSwap, lastUserMessage, isSafetyResponse } = params;
  const todayFirstEx = envelope.working_state.today_workout?.exercises[0]?.name;

  if (isSafetyResponse) {
    return dedupeAgainstUserMessage(
      [
        ...(todayFirstEx
          ? [
              {
                label: `Swap ${todayFirstEx.split(' ').slice(0, 2).join(' ')}`,
                prompt: `Swap ${todayFirstEx} for a gentler alternative`,
              },
            ]
          : []),
        { label: 'Take a rest day', prompt: 'Take a rest day today' },
        { label: 'Remember constraint', prompt: 'Remember I have ', fill: true },
      ],
      lastUserMessage
    );
  }

  if (mutationStatus === 'awaiting_confirmation') {
    return dedupeAgainstUserMessage(
      [
        { label: 'How recovery looks', prompt: 'Should I train today?' },
        { label: 'Keep current plan', prompt: 'Cancel' },
      ],
      lastUserMessage
    );
  }

  if (mutationStatus === 'error') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Today workout brief', prompt: 'What am I lifting today?' },
        { label: 'Where am I in my plan?', prompt: 'Where am I in my program?' },
      ],
      lastUserMessage
    );
  }

  if ((toolName === 'modify_program' || toolName === 'rebalance_program') && mutationStatus === 'success') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Review updated workout', prompt: 'What am I lifting today?' },
        { label: 'List my program edits', prompt: 'What custom changes are on my program?' },
        { label: 'Where am I in my plan?', prompt: 'Where am I in my program?' },
      ],
      lastUserMessage
    );
  }

  if (toolName === 'reset_program' && mutationStatus === 'success') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Preview today’s workout', prompt: 'What am I lifting today?' },
        { label: 'Check starting effort', prompt: 'How hard should I push today?' },
        { label: 'How the schedule works', prompt: 'How does the weekly schedule work?' },
      ],
      lastUserMessage
    );
  }

  if (toolName === 'swap_exercise' && mutationStatus === 'success') {
    return dedupeAgainstUserMessage(
      [
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
      ],
      lastUserMessage
    );
  }

  if (
    (toolName === 'modify_workout_exercises' ||
      toolName === 'switch_location' ||
      toolName === 'reorder_workout_exercises' ||
      toolName === 'update_exercise_note' ||
      toolName === 'override_recovery_gate') &&
    mutationStatus === 'success'
  ) {
    return dedupeAgainstUserMessage(
      [
        { label: 'Review updated workout', prompt: 'What am I lifting today?' },
        { label: 'Check weekly volume', prompt: 'Am I doing enough sets this week?' },
        { label: 'Trim today to 25m', prompt: "Shorten today's workout" },
      ],
      lastUserMessage
    );
  }

  if (toolName === 'log_workout_set' && mutationStatus === 'success') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Rest between sets', prompt: 'How long should I rest between sets?' },
        { label: 'Log another set', prompt: 'Log set ', fill: true },
        { label: 'How hard to push', prompt: 'How hard should I push today?' },
      ],
      lastUserMessage
    );
  }

  if (toolName === 'adjust_workout_volume' && mutationStatus === 'success') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Updated workout brief', prompt: 'What am I lifting today?' },
        { label: 'Rest between sets', prompt: 'How long should I rest between sets?' },
      ],
      lastUserMessage
    );
  }

  if ((toolName === 'save_athlete_memory' || toolName === 'delete_athlete_memory') && mutationStatus === 'success') {
    return dedupeAgainstUserMessage(
      [
        { label: 'What do you remember?', prompt: 'What do you remember about me?' },
        ...(todayFirstEx
          ? [
              {
                label: `Swap ${todayFirstEx.split(' ').slice(0, 2).join(' ')}`,
                prompt: `Swap ${todayFirstEx}`,
              },
            ]
          : [{ label: 'Today workout brief', prompt: 'What am I lifting today?' }]),
      ],
      lastUserMessage
    );
  }

  if (
    (toolName === 'update_goals' ||
      toolName === 'switch_goal_phase' ||
      toolName === 'log_entry' ||
      toolName === 'update_progress_widgets' ||
      toolName === 'update_athlete_profile') &&
    mutationStatus === 'success'
  ) {
    return dedupeAgainstUserMessage(
      [
        { label: 'How am I doing?', prompt: 'How am I doing?' },
        { label: 'What are my goals?', prompt: 'What are my goals?' },
        { label: 'Today workout brief', prompt: 'What am I lifting today?' },
      ],
      lastUserMessage
    );
  }

  if ((toolName === 'switch_program' || toolName === 'log_rest_day' || toolName === 'update_home_equipment') && mutationStatus === 'success') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Today workout brief', prompt: 'What am I lifting today?' },
        { label: 'Where am I in my plan?', prompt: 'Where am I in my program?' },
        { label: 'Check weekly volume', prompt: 'Am I doing enough sets this week?' },
      ],
      lastUserMessage
    );
  }

  if (place?.tab === 'program') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Next workout plan', prompt: 'Where am I in my program?' },
        { label: 'Rebalance my program', prompt: 'Rebalance my program for any imbalances' },
        { label: 'Weekly muscle sets', prompt: 'Am I doing enough sets this week?' },
        { label: 'How the schedule works', prompt: 'How does the weekly schedule work?' },
      ],
      lastUserMessage
    );
  }

  if (place?.tab === 'analytics') {
    return dedupeAgainstUserMessage(
      [
        { label: 'Strength balance', prompt: 'What are my strength standards?' },
        { label: 'Body composition', prompt: 'How is my body composition trending?' },
        { label: 'Check weekly sets', prompt: 'Am I doing enough sets this week?' },
        { label: 'What are my goals?', prompt: 'What are my goals?' },
      ],
      lastUserMessage
    );
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
  defaults.push({ label: 'Weekly muscle sets', prompt: 'Am I doing enough sets this week?' });
  return dedupeAgainstUserMessage(defaults, lastUserMessage);
}
