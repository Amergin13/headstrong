/**
 * Canonical Goals -> Signals -> Metrics (GSM / HEART) Product Telemetry Schema.
 *
 * Single source of truth shared between client instrumentation (`src/services/telemetry.ts`)
 * and Vercel Function ingestion (`api/telemetry/ingest.ts` -> `@vercel/functions` `metric()`).
 *
 * Privacy-by-design invariants (AGENTS.md #1, #2, #3):
 * 1. Zero PII: Never accepts or transmits names, emails, account IDs, tokens, passphrases,
 *    free-form notes, chat prompts, or personal health/load values (bodyweight, HRV, RHR, kg lifted).
 * 2. Low-cardinality tags only: Every metric declares its exact allowlist of bounded string dimensions.
 * 3. Non-reserved names: No metric starts with `vercel.` (reserved by Vercel Observability).
 */

export type TelemetryGoalId =
  | 'activation'
  | 'workout_execution'
  | 'workout_customization'
  | 'program_adherence'
  | 'goal_attainment'
  | 'coach_and_ecosystem';

export type TelemetryMetricKind = 'counter' | 'histogram';

export type TelemetryMetricName =
  // Activation & Onboarding
  | 'onboarding.started'
  | 'onboarding.step_viewed'
  | 'onboarding.completed'
  | 'onboarding.duration_sec'
  | 'onboarding.import_used'
  // Core Workout Execution
  | 'workout.started'
  | 'workout.set_completed'
  | 'workout.personal_best'
  | 'workout.completed'
  | 'workout.duration_min'
  | 'workout.sets_completed'
  | 'workout.exercises_completed'
  | 'workout.rest_day_logged'
  | 'workout.past_edited'
  | 'workout.past_deleted'
  // In-Session Customization, Swaps & Recovery
  | 'workout.exercise_swapped'
  | 'workout.location_switched'
  | 'workout.set_added'
  | 'workout.set_removed'
  | 'workout.exercise_reordered'
  | 'workout.exercise_skipped'
  | 'workout.exercise_added'
  | 'workout.display_customized'
  | 'recovery.modulation_applied'
  // Program Adherence, Changes & Graduation
  | 'program.changed'
  | 'program.imported'
  | 'program.week_completed'
  | 'program.completed'
  | 'program.goal_changed'
  | 'program.override_changed'
  | 'program.adaptation_responded'
  // Outcome & Goal Progress
  | 'goal.strength_advanced'
  | 'goal.custom_updated'
  | 'biometrics.logged'
  | 'activity.logged'
  // AI Coach, Wearables, Backup & Navigation
  | 'coach.opened'
  | 'coach.message_processed'
  | 'coach.action_applied'
  | 'coach.action_undone'
  | 'wearable.synced'
  | 'backup.executed'
  | 'navigation.tab_viewed';

export interface TelemetryGoalDefinition {
  id: TelemetryGoalId;
  title: string;
  productQuestion: string;
  signals: readonly string[];
  metrics: readonly TelemetryMetricName[];
}

export interface TelemetryMetricDefinition {
  name: TelemetryMetricName;
  goalId: TelemetryGoalId;
  kind: TelemetryMetricKind;
  description: string;
  maxValue: number;
  allowedTags: readonly string[];
}

export const PRODUCT_TELEMETRY_GOALS: readonly TelemetryGoalDefinition[] = [
  {
    id: 'activation',
    title: 'Day-1 Activation & Onboarding Flow',
    productQuestion: 'Do new athletes finish setup and log their first workout without friction?',
    signals: [
      'Onboarding opened and step progression',
      'History or health data imported during setup',
      'Onboarding completed and Day-1 session started/completed',
    ],
    metrics: [
      'onboarding.started',
      'onboarding.step_viewed',
      'onboarding.completed',
      'onboarding.duration_sec',
      'onboarding.import_used',
    ],
  },
  {
    id: 'workout_execution',
    title: 'Core Workout Execution & Completion',
    productQuestion: 'Once a workout is started, do athletes complete their sets and finish the session?',
    signals: [
      'First set logged in a queued workout (workout started)',
      'Working and warm-up sets completed, personal bests earned',
      'Workout finished with measured duration and completed set/exercise totals',
      'Intentional rest-day shifts and historical log edits',
    ],
    metrics: [
      'workout.started',
      'workout.set_completed',
      'workout.personal_best',
      'workout.completed',
      'workout.duration_min',
      'workout.sets_completed',
      'workout.exercises_completed',
      'workout.rest_day_logged',
      'workout.past_edited',
      'workout.past_deleted',
    ],
  },
  {
    id: 'workout_customization',
    title: 'Gym-Floor Adaptability & Continuity',
    productQuestion: 'How often do athletes adapt sessions for busy equipment, location changes, or recovery?',
    signals: [
      'One-off vs permanent exercise swaps and calibration mode',
      'Gym / Home / Bodyweight location switches',
      '1-tap overflow set/order adjustments and advisory recovery modulations',
    ],
    metrics: [
      'workout.exercise_swapped',
      'workout.location_switched',
      'workout.set_added',
      'workout.set_removed',
      'workout.exercise_reordered',
      'workout.exercise_skipped',
      'workout.exercise_added',
      'workout.display_customized',
      'recovery.modulation_applied',
    ],
  },
  {
    id: 'program_adherence',
    title: 'Program Fit, Changes & 6-Week Graduation',
    productQuestion: 'Which programs retain athletes through all 6 weeks versus triggering mid-block switches?',
    signals: [
      'Program switches and custom spreadsheet imports',
      'Weekly milestones (Weeks 1-5) and full 6-week block graduations (24/24)',
      'Goal phase transitions and AI program adaptation accept/dismiss decisions',
    ],
    metrics: [
      'program.changed',
      'program.imported',
      'program.week_completed',
      'program.completed',
      'program.goal_changed',
      'program.override_changed',
      'program.adaptation_responded',
    ],
  },
  {
    id: 'goal_attainment',
    title: 'Strength, Body & Activity Goal Attainment',
    productQuestion: 'Are athletes progressing up objective strength standards and tracking their target outcomes?',
    signals: [
      'Kilgore / Poliquin strength standard sub-tier advances',
      'Custom goal creation/updates, weigh-in/tape logs, and qualifying active days',
    ],
    metrics: [
      'goal.strength_advanced',
      'goal.custom_updated',
      'biometrics.logged',
      'activity.logged',
    ],
  },
  {
    id: 'coach_and_ecosystem',
    title: 'AI Coach Trust, Wearable Sync & Backup Resilience',
    productQuestion: 'Do AI Coach actions stick without being undone, and are health/backup integrations reliable?',
    signals: [
      'AI Coach sessions, inference transport tier, and applied vs undone tool mutations',
      'Apple Health / Health Connect / Whoop / Strava sync outcomes and encrypted backups',
    ],
    metrics: [
      'coach.opened',
      'coach.message_processed',
      'coach.action_applied',
      'coach.action_undone',
      'wearable.synced',
      'backup.executed',
      'navigation.tab_viewed',
    ],
  },
] as const;

const COMMON_CONTEXT_TAGS = ['platform', 'program_type', 'goal_phase', 'location'] as const;

export const TELEMETRY_METRIC_DEFINITIONS: Record<TelemetryMetricName, TelemetryMetricDefinition> = {
  'onboarding.started': {
    name: 'onboarding.started',
    goalId: 'activation',
    kind: 'counter',
    description: 'Onboarding flow opened (initial install or setup edit).',
    maxValue: 50,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'mode'],
  },
  'onboarding.step_viewed': {
    name: 'onboarding.step_viewed',
    goalId: 'activation',
    kind: 'counter',
    description: 'Onboarding step screen viewed (1..6) to measure step-by-step funnel drop-off.',
    maxValue: 100,
    allowedTags: ['platform', 'step', 'mode'],
  },
  'onboarding.completed': {
    name: 'onboarding.completed',
    goalId: 'activation',
    kind: 'counter',
    description: 'Onboarding completed and Day-1 session generated.',
    maxValue: 50,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'mode', 'health_connected', 'experience'],
  },
  'onboarding.duration_sec': {
    name: 'onboarding.duration_sec',
    goalId: 'activation',
    kind: 'histogram',
    description: 'Elapsed seconds spent completing initial onboarding.',
    maxValue: 3600,
    allowedTags: ['platform', 'mode', 'health_connected'],
  },
  'onboarding.import_used': {
    name: 'onboarding.import_used',
    goalId: 'activation',
    kind: 'counter',
    description: 'External workout history, spreadsheet program, or health file imported.',
    maxValue: 50,
    allowedTags: ['platform', 'source', 'surface'],
  },
  'workout.started': {
    name: 'workout.started',
    goalId: 'workout_execution',
    kind: 'counter',
    description: 'First set completed in a queued workout session (idempotent per workout ID).',
    maxValue: 50,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'readiness', 'is_first_workout'],
  },
  'workout.set_completed': {
    name: 'workout.set_completed',
    goalId: 'workout_execution',
    kind: 'counter',
    description: 'Individual workout set marked completed.',
    maxValue: 200,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'set_type'],
  },
  'workout.personal_best': {
    name: 'workout.personal_best',
    goalId: 'workout_execution',
    kind: 'counter',
    description: 'Personal best earned on a logged set.',
    maxValue: 100,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'pillar'],
  },
  'workout.completed': {
    name: 'workout.completed',
    goalId: 'workout_execution',
    kind: 'counter',
    description: 'Workout session finished and saved to history.',
    maxValue: 50,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'readiness', 'is_first_workout', 'milestone'],
  },
  'workout.duration_min': {
    name: 'workout.duration_min',
    goalId: 'workout_execution',
    kind: 'histogram',
    description: 'Measured session duration in minutes from first logged set to finish.',
    maxValue: 360,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'readiness'],
  },
  'workout.sets_completed': {
    name: 'workout.sets_completed',
    goalId: 'workout_execution',
    kind: 'histogram',
    description: 'Total completed sets in a finished workout session.',
    maxValue: 150,
    allowedTags: [...COMMON_CONTEXT_TAGS],
  },
  'workout.exercises_completed': {
    name: 'workout.exercises_completed',
    goalId: 'workout_execution',
    kind: 'histogram',
    description: 'Number of exercises with at least one completed working set in a finished session.',
    maxValue: 40,
    allowedTags: [...COMMON_CONTEXT_TAGS],
  },
  'workout.rest_day_logged': {
    name: 'workout.rest_day_logged',
    goalId: 'workout_execution',
    kind: 'counter',
    description: 'Athlete shifted today queued session to tomorrow as a rest day.',
    maxValue: 50,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'readiness'],
  },
  'workout.past_edited': {
    name: 'workout.past_edited',
    goalId: 'workout_execution',
    kind: 'counter',
    description: 'Completed historical workout edited in PastWorkoutModal.',
    maxValue: 50,
    allowedTags: ['platform', 'program_type'],
  },
  'workout.past_deleted': {
    name: 'workout.past_deleted',
    goalId: 'workout_execution',
    kind: 'counter',
    description: 'Completed historical workout deleted from history.',
    maxValue: 50,
    allowedTags: ['platform', 'program_type'],
  },
  'workout.exercise_swapped': {
    name: 'workout.exercise_swapped',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Exercise swapped via ExerciseSwapModal or AI Coach.',
    maxValue: 100,
    allowedTags: [...COMMON_CONTEXT_TAGS, 'scope', 'calibration', 'source'],
  },
  'workout.location_switched': {
    name: 'workout.location_switched',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Training environment switched between gym, home, and bodyweight/travel.',
    maxValue: 100,
    allowedTags: ['platform', 'program_type', 'from_location', 'to_location'],
  },
  'workout.set_added': {
    name: 'workout.set_added',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Extra working or warm-up set added from the 1-tap exercise menu.',
    maxValue: 100,
    allowedTags: ['platform', 'program_type', 'set_kind'],
  },
  'workout.set_removed': {
    name: 'workout.set_removed',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Uncompleted set removed from the 1-tap exercise menu.',
    maxValue: 100,
    allowedTags: ['platform', 'program_type'],
  },
  'workout.exercise_reordered': {
    name: 'workout.exercise_reordered',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Exercise moved down in session order from the 1-tap exercise menu.',
    maxValue: 100,
    allowedTags: ['platform', 'program_type'],
  },
  'workout.exercise_skipped': {
    name: 'workout.exercise_skipped',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Unstarted exercise skipped for today from the 1-tap exercise menu.',
    maxValue: 100,
    allowedTags: ['platform', 'program_type'],
  },
  'workout.exercise_added': {
    name: 'workout.exercise_added',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Additional exercise added to today workout from the header menu.',
    maxValue: 100,
    allowedTags: ['platform', 'program_type', 'equipment'],
  },
  'workout.display_customized': {
    name: 'workout.display_customized',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Workout page progressive-disclosure display toggle changed.',
    maxValue: 100,
    allowedTags: ['platform', 'toggle_key', 'enabled'],
  },
  'recovery.modulation_applied': {
    name: 'recovery.modulation_applied',
    goalId: 'workout_customization',
    kind: 'counter',
    description: 'Athlete opted into (or restored) 1-tap advisory recovery modulation.',
    maxValue: 50,
    allowedTags: ['platform', 'action', 'readiness'],
  },
  'program.changed': {
    name: 'program.changed',
    goalId: 'program_adherence',
    kind: 'counter',
    description: 'Active training program changed.',
    maxValue: 50,
    allowedTags: ['platform', 'from_program', 'to_program', 'goal_phase', 'source'],
  },
  'program.imported': {
    name: 'program.imported',
    goalId: 'program_adherence',
    kind: 'counter',
    description: 'Custom spreadsheet training program imported.',
    maxValue: 50,
    allowedTags: ['platform', 'activated', 'with_history'],
  },
  'program.week_completed': {
    name: 'program.week_completed',
    goalId: 'program_adherence',
    kind: 'counter',
    description: 'All lifting sessions for a program week completed.',
    maxValue: 50,
    allowedTags: ['platform', 'program_type', 'goal_phase', 'week'],
  },
  'program.completed': {
    name: 'program.completed',
    goalId: 'program_adherence',
    kind: 'counter',
    description: 'Full multi-week training block (e.g. Week 6 / 24 sessions) graduated.',
    maxValue: 25,
    allowedTags: ['platform', 'program_type', 'goal_phase'],
  },
  'program.goal_changed': {
    name: 'program.goal_changed',
    goalId: 'program_adherence',
    kind: 'counter',
    description: 'Training goal phase changed (Build Muscle, Lose Fat, Stay Lean).',
    maxValue: 50,
    allowedTags: ['platform', 'from_goal', 'to_goal', 'program_type'],
  },
  'program.override_changed': {
    name: 'program.override_changed',
    goalId: 'program_adherence',
    kind: 'counter',
    description: 'Permanent program override removed or reset.',
    maxValue: 50,
    allowedTags: ['platform', 'program_type', 'action'],
  },
  'program.adaptation_responded': {
    name: 'program.adaptation_responded',
    goalId: 'program_adherence',
    kind: 'counter',
    description: 'Athlete accepted or dismissed a suggested program adaptation.',
    maxValue: 50,
    allowedTags: ['platform', 'program_type', 'decision', 'kind'],
  },
  'goal.strength_advanced': {
    name: 'goal.strength_advanced',
    goalId: 'goal_attainment',
    kind: 'counter',
    description: 'Athlete advanced a Kilgore or Poliquin strength standard sub-division.',
    maxValue: 50,
    allowedTags: ['platform', 'pillar', 'tier'],
  },
  'goal.custom_updated': {
    name: 'goal.custom_updated',
    goalId: 'goal_attainment',
    kind: 'counter',
    description: 'Personal custom goal added, edited, or removed.',
    maxValue: 50,
    allowedTags: ['platform', 'action', 'metric'],
  },
  'biometrics.logged': {
    name: 'biometrics.logged',
    goalId: 'goal_attainment',
    kind: 'counter',
    description: 'Bodyweight, composition, or circumference entry saved (no values sent).',
    maxValue: 50,
    allowedTags: ['platform', 'source', 'has_tape', 'has_body_fat'],
  },
  'activity.logged': {
    name: 'activity.logged',
    goalId: 'goal_attainment',
    kind: 'counter',
    description: 'Cardio/sport session logged toward weekly active day.',
    maxValue: 50,
    allowedTags: ['platform', 'source', 'qualifies_active_day'],
  },
  'coach.opened': {
    name: 'coach.opened',
    goalId: 'coach_and_ecosystem',
    kind: 'counter',
    description: 'AI Coach sheet opened from bottom bar or contextual Ask Treise trigger.',
    maxValue: 100,
    allowedTags: ['platform', 'tab', 'has_prefill'],
  },
  'coach.message_processed': {
    name: 'coach.message_processed',
    goalId: 'coach_and_ecosystem',
    kind: 'counter',
    description: 'AI Coach prompt answered (records transport tier and whether a tool ran; never prompt text).',
    maxValue: 100,
    allowedTags: ['platform', 'transport', 'has_action', 'tool_name'],
  },
  'coach.action_applied': {
    name: 'coach.action_applied',
    goalId: 'coach_and_ecosystem',
    kind: 'counter',
    description: 'Deterministic AI Coach state mutation applied.',
    maxValue: 100,
    allowedTags: ['platform', 'tool_name'],
  },
  'coach.action_undone': {
    name: 'coach.action_undone',
    goalId: 'coach_and_ecosystem',
    kind: 'counter',
    description: 'Applied AI Coach mutation reverted via 1-tap Undo (negative trust signal).',
    maxValue: 100,
    allowedTags: ['platform', 'tool_name'],
  },
  'wearable.synced': {
    name: 'wearable.synced',
    goalId: 'coach_and_ecosystem',
    kind: 'counter',
    description: 'Wearable or health-hub sync completed or failed.',
    maxValue: 100,
    allowedTags: ['platform', 'provider', 'outcome'],
  },
  'backup.executed': {
    name: 'backup.executed',
    goalId: 'coach_and_ecosystem',
    kind: 'counter',
    description: 'Local JSON or encrypted Google Drive backup/restore executed.',
    maxValue: 50,
    allowedTags: ['platform', 'kind', 'outcome'],
  },
  'navigation.tab_viewed': {
    name: 'navigation.tab_viewed',
    goalId: 'coach_and_ecosystem',
    kind: 'counter',
    description: 'Primary navigation tab viewed.',
    maxValue: 200,
    allowedTags: ['platform', 'tab'],
  },
};

export const MAX_INGEST_BATCH_SIZE = 25;
export const MAX_TAGS_PER_METRIC = 6;
export const MAX_TAG_VALUE_LENGTH = 40;

const FORBIDDEN_KEY_PATTERN =
  /(?:name|email|mail|user_?id|account|token|secret|passphrase|password|prompt|message|note|weight|hrv|rhr|sleep_hours|body_fat|waist|lat|lng|ip)/i;
const SAFE_TAG_VALUE_PATTERN = /^[a-zA-Z0-9_.:/-]+(?: [a-zA-Z0-9_.:/-]+)*$/;

export interface TelemetrySample {
  name: TelemetryMetricName;
  value: number;
  tags?: Record<string, string>;
  at?: string;
}

/**
 * Normalizes custom plan IDs (`custom_plan_173...`) to bounded `'custom_plan'`
 * so tag cardinality stays strictly bounded in Vercel Custom Metrics.
 */
export function normalizeProgramTypeTag(programType?: string | null): string {
  if (!programType) return 'starter_6wk';
  if (programType.startsWith('custom_plan')) return 'custom_plan';
  const known = new Set([
    'starter_6wk',
    'starter_4day',
    'muscle_building_6wk',
    'ppl_upper',
    'ppl',
    'upper_lower',
    'full_body',
  ]);
  return known.has(programType) ? programType : 'other';
}

export function isTelemetryMetricName(name: unknown): name is TelemetryMetricName {
  return typeof name === 'string' && !name.startsWith('vercel.') && Object.prototype.hasOwnProperty.call(TELEMETRY_METRIC_DEFINITIONS, name);
}

/**
 * Scrubs and bounds metric tags against the metric's strict allowlist.
 * Drops any unlisted key, PII-shaped key/value, email (`@`), or high-cardinality token.
 */
export function sanitizeTelemetryTags(
  metricName: TelemetryMetricName,
  rawTags?: Record<string, string | number | boolean | undefined | null>
): Record<string, string> {
  if (!rawTags || typeof rawTags !== 'object') return {};
  const def = TELEMETRY_METRIC_DEFINITIONS[metricName];
  if (!def) return {};
  const allowed = new Set(def.allowedTags);
  const out: Record<string, string> = {};
  let count = 0;

  for (const [key, rawVal] of Object.entries(rawTags)) {
    if (count >= MAX_TAGS_PER_METRIC) break;
    if (!allowed.has(key)) continue;
    // Allow `tool_name` explicitly while blocking any personal/PII keys
    if (key !== 'tool_name' && FORBIDDEN_KEY_PATTERN.test(key)) continue;
    if (rawVal === undefined || rawVal === null) continue;

    let str = String(rawVal).trim();
    if (!str || str.length > MAX_TAG_VALUE_LENGTH) continue;
    if (str.includes('@') || /^https?:\/\//i.test(str)) continue;
    if (key === 'program_type' || key === 'from_program' || key === 'to_program') {
      str = normalizeProgramTypeTag(str);
    }
    if (!SAFE_TAG_VALUE_PATTERN.test(str)) {
      str = str.replace(/[^a-zA-Z0-9_.: -]/g, '').trim().slice(0, MAX_TAG_VALUE_LENGTH);
    }
    if (!str) continue;

    out[key] = str;
    count += 1;
  }

  return out;
}

export function validateTelemetrySample(raw: unknown): TelemetrySample | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (!isTelemetryMetricName(candidate.name)) return null;
  const def = TELEMETRY_METRIC_DEFINITIONS[candidate.name];
  const num = Number(candidate.value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const clampedValue = Math.min(def.maxValue, Math.round(num * 100) / 100);
  const tags = sanitizeTelemetryTags(
    candidate.name,
    candidate.tags && typeof candidate.tags === 'object'
      ? (candidate.tags as Record<string, string>)
      : undefined
  );
  const at =
    typeof candidate.at === 'string' && candidate.at.length <= 32 ? candidate.at : undefined;
  return {
    name: candidate.name,
    value: clampedValue,
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
    ...(at ? { at } : {}),
  };
}

export function canonicalTagsKey(tags?: Record<string, string>): string {
  if (!tags) return '';
  const keys = Object.keys(tags).sort();
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}=${tags[k]}`).join('&');
}

/**
 * Collapses repeated counter increments sharing identical `(name, tags)` into a single summed
 * sample while keeping histogram observations distinct, bounded to `maxItems`.
 */
export function aggregateTelemetryBatch(
  samples: readonly TelemetrySample[],
  maxItems = MAX_INGEST_BATCH_SIZE
): TelemetrySample[] {
  const counterMap = new Map<string, TelemetrySample>();
  const histograms: TelemetrySample[] = [];

  for (const raw of samples) {
    const valid = validateTelemetrySample(raw);
    if (!valid) continue;
    const def = TELEMETRY_METRIC_DEFINITIONS[valid.name];
    if (def.kind === 'counter') {
      const key = `${valid.name}|${canonicalTagsKey(valid.tags)}`;
      const existing = counterMap.get(key);
      if (existing) {
        existing.value = Math.min(def.maxValue, existing.value + valid.value);
      } else {
        counterMap.set(key, { ...valid });
      }
    } else {
      histograms.push(valid);
    }
  }

  return [...counterMap.values(), ...histograms].slice(0, maxItems);
}

export interface HistogramAggregate {
  count: number;
  sum: number;
  min: number;
  max: number;
}

export interface TelemetryGoalsSummary {
  activation: {
    onboardingsStarted: number;
    onboardingsCompleted: number;
    onboardingCompletionRatePct: number | null;
    avgOnboardingDurationSec: number | null;
    importsUsed: number;
    firstWorkoutsStarted: number;
    firstWorkoutsCompleted: number;
    day1ActivationRatePct: number | null;
  };
  workoutExecution: {
    workoutsStarted: number;
    workoutsCompleted: number;
    workoutCompletionRatePct: number | null;
    setsCompleted: number;
    personalBests: number;
    restDaysLogged: number;
    avgWorkoutDurationMin: number | null;
    avgSetsPerCompletedWorkout: number | null;
  };
  workoutCustomization: {
    exercisesSwapped: number;
    permanentSwaps: number;
    locationsSwitched: number;
    setsAdded: number;
    setsRemoved: number;
    exercisesReordered: number;
    exercisesSkipped: number;
    exercisesAdded: number;
    recoveryModulationsApplied: number;
  };
  programAdherence: {
    programsChanged: number;
    programsImported: number;
    programWeeksCompleted: number;
    programsCompleted: number;
    goalsChanged: number;
    adaptationsAccepted: number;
    adaptationsDismissed: number;
  };
  goalAttainment: {
    strengthStandardsAdvanced: number;
    customGoalsUpdated: number;
    biometricsLogged: number;
    activitiesLogged: number;
  };
  coachAndEcosystem: {
    coachOpened: number;
    coachMessagesProcessed: number;
    coachActionsApplied: number;
    coachActionsUndone: number;
    coachActionRetentionRatePct: number | null;
    wearableSyncSuccesses: number;
    wearableSyncErrors: number;
    backupsExecuted: number;
  };
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.min(100, Math.round((numerator / denominator) * 1000) / 10);
}

function avg(hist?: HistogramAggregate): number | null {
  if (!hist || hist.count <= 0) return null;
  return Math.round((hist.sum / hist.count) * 10) / 10;
}

/**
 * Pure calculator producing decision-ready product KPIs across all 6 Goals from raw counters/histograms
 * and recent tagged events.
 */
export function computeTelemetryGoalsSummary(params: {
  counters: Record<string, number>;
  histograms: Record<string, HistogramAggregate>;
  taggedCounters?: Record<string, number>;
}): TelemetryGoalsSummary {
  const c = (name: TelemetryMetricName) => params.counters[name] ?? 0;
  const tc = (prefix: string) => {
    if (!params.taggedCounters) return 0;
    let total = 0;
    for (const [k, v] of Object.entries(params.taggedCounters)) {
      if (k.startsWith(prefix) || k.includes(prefix)) total += v;
    }
    return total;
  };

  const onboardingsStarted = c('onboarding.started');
  const onboardingsCompleted = c('onboarding.completed');
  const firstWorkoutsStarted = tc('workout.started|') ? tc('is_first_workout=true') : 0;
  // Separate first-workout started vs completed cleanly using metric prefix + tag match
  let firstStarted = 0;
  let firstCompleted = 0;
  let permanentSwaps = 0;
  let adaptationsAccepted = 0;
  let adaptationsDismissed = 0;
  let syncSuccesses = 0;
  let syncErrors = 0;

  for (const [key, val] of Object.entries(params.taggedCounters ?? {})) {
    if (key.startsWith('workout.started|') && key.includes('is_first_workout=true')) firstStarted += val;
    if (key.startsWith('workout.completed|') && key.includes('is_first_workout=true')) firstCompleted += val;
    if (key.startsWith('workout.exercise_swapped|') && key.includes('scope=permanent')) permanentSwaps += val;
    if (key.startsWith('program.adaptation_responded|') && key.includes('decision=accepted')) adaptationsAccepted += val;
    if (key.startsWith('program.adaptation_responded|') && key.includes('decision=dismissed')) adaptationsDismissed += val;
    if (key.startsWith('wearable.synced|') && key.includes('outcome=success')) syncSuccesses += val;
    if (key.startsWith('wearable.synced|') && key.includes('outcome=error')) syncErrors += val;
  }
  void firstWorkoutsStarted;

  const workoutsStarted = c('workout.started');
  const workoutsCompleted = c('workout.completed');
  const coachActionsApplied = c('coach.action_applied');
  const coachActionsUndone = c('coach.action_undone');

  return {
    activation: {
      onboardingsStarted,
      onboardingsCompleted,
      onboardingCompletionRatePct: pct(onboardingsCompleted, onboardingsStarted),
      avgOnboardingDurationSec: avg(params.histograms['onboarding.duration_sec']),
      importsUsed: c('onboarding.import_used'),
      firstWorkoutsStarted: firstStarted,
      firstWorkoutsCompleted: firstCompleted,
      day1ActivationRatePct: pct(firstCompleted, onboardingsCompleted),
    },
    workoutExecution: {
      workoutsStarted,
      workoutsCompleted,
      workoutCompletionRatePct: pct(workoutsCompleted, workoutsStarted),
      setsCompleted: c('workout.set_completed'),
      personalBests: c('workout.personal_best'),
      restDaysLogged: c('workout.rest_day_logged'),
      avgWorkoutDurationMin: avg(params.histograms['workout.duration_min']),
      avgSetsPerCompletedWorkout: avg(params.histograms['workout.sets_completed']),
    },
    workoutCustomization: {
      exercisesSwapped: c('workout.exercise_swapped'),
      permanentSwaps,
      locationsSwitched: c('workout.location_switched'),
      setsAdded: c('workout.set_added'),
      setsRemoved: c('workout.set_removed'),
      exercisesReordered: c('workout.exercise_reordered'),
      exercisesSkipped: c('workout.exercise_skipped'),
      exercisesAdded: c('workout.exercise_added'),
      recoveryModulationsApplied: c('recovery.modulation_applied'),
    },
    programAdherence: {
      programsChanged: c('program.changed'),
      programsImported: c('program.imported'),
      programWeeksCompleted: c('program.week_completed'),
      programsCompleted: c('program.completed'),
      goalsChanged: c('program.goal_changed'),
      adaptationsAccepted,
      adaptationsDismissed,
    },
    goalAttainment: {
      strengthStandardsAdvanced: c('goal.strength_advanced'),
      customGoalsUpdated: c('goal.custom_updated'),
      biometricsLogged: c('biometrics.logged'),
      activitiesLogged: c('activity.logged'),
    },
    coachAndEcosystem: {
      coachOpened: c('coach.opened'),
      coachMessagesProcessed: c('coach.message_processed'),
      coachActionsApplied,
      coachActionsUndone,
      coachActionRetentionRatePct:
        coachActionsApplied > 0
          ? pct(Math.max(0, coachActionsApplied - coachActionsUndone), coachActionsApplied)
          : null,
      wearableSyncSuccesses: syncSuccesses,
      wearableSyncErrors: syncErrors,
      backupsExecuted: c('backup.executed'),
    },
  };
}
