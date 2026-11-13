import { CoreProgressWidgetId, ExerciseDefinition, ProgressWidgetId, UserProfile, WorkoutSession, isWhoopConfigured } from '../engine/types';
import { findExerciseNamed } from './coachAnswers';

export interface ProgressWidgetDefinition {
  id: CoreProgressWidgetId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  requiresWhoop?: boolean;
  aliases: string[];
}

export interface ProgressChartWidgetDefinition {
  id: `chart:${string}`;
  chartId: string;
  label: string;
  group: 'tape' | 'body' | 'training' | 'whoop';
  description: string;
  requiresWhoop?: boolean;
  aliases: string[];
}

export const PROGRESS_WIDGETS: readonly ProgressWidgetDefinition[] = [
  {
    id: 'goals',
    label: 'Goals',
    description: 'Your weekly goal rings and short summary.',
    defaultEnabled: true,
    aliases: ['goal rings', 'goal ring', 'goals summary', 'goals widget', 'goals card', 'weekly goals', 'goals', 'goal'],
  },
  {
    id: 'trophy-case',
    label: 'Trophy case',
    description: 'Your top three personal best lifts.',
    defaultEnabled: true,
    aliases: ['trophy case', 'trophies', 'personal bests', 'personal records', 'prs', 'pbs'],
  },
  {
    id: 'lifetime-stats',
    label: 'Lifetime stats',
    description: 'All-time volume, reps and workouts.',
    defaultEnabled: true,
    aliases: ['lifetime stats', 'lifetime totals', 'all-time stats', 'all time stats', 'lifetime'],
  },
  {
    id: 'recent-stats',
    label: 'Recent stats',
    description: 'Volume, reps and workouts over the last 30 days.',
    defaultEnabled: true,
    aliases: ['recent stats', '30 day stats', '30-day stats', 'last 30 days', 'monthly stats', 'recent'],
  },
  {
    id: 'steps',
    label: 'Steps',
    description: 'Today’s steps, 7-day average and daily trend.',
    defaultEnabled: true,
    aliases: ['daily steps', 'step count', 'steps card', 'steps widget', 'steps'],
  },
  {
    id: 'body-weight',
    label: 'Body weight',
    description: 'Latest weigh-in, trend line and weekly pace.',
    defaultEnabled: true,
    aliases: ['body weight', 'bodyweight', 'scale weight', 'weigh-ins', 'weigh ins', 'weigh-in', 'weight'],
  },
  {
    id: 'measurements',
    label: 'Measurements',
    description: 'Waist and body tape highlights.',
    defaultEnabled: true,
    aliases: ['body measurements', 'measurements', 'measurement', 'tape highlights'],
  },
  {
    id: 'strength-standards',
    label: 'Strength standards',
    description: 'Strength level radar across your main lifts.',
    defaultEnabled: true,
    aliases: ['strength standards', 'standards radar', 'strength radar', 'standards', 'radar'],
  },
  {
    id: 'strength-levels',
    label: 'Strength levels',
    description: 'Detailed strength tier and next target for each movement.',
    defaultEnabled: false,
    aliases: ['strength levels', 'strength level', 'lifting levels', 'movement levels', 'tiers'],
  },
  {
    id: 'balance',
    label: 'Balance',
    description: 'Push/pull proportions and left vs right symmetry.',
    defaultEnabled: false,
    aliases: ['muscle balance', 'left right symmetry', 'left/right symmetry', 'imbalances', 'symmetry', 'balance'],
  },
  {
    id: 'whoop-summary',
    label: 'Whoop metrics',
    description: 'Recovery score, day strain, workout strain, HRV and sleep from Whoop.',
    defaultEnabled: false,
    requiresWhoop: true,
    aliases: ['whoop metrics', 'whoop overview', 'whoop summary', 'whoop card', 'whoop widget', 'whoop'],
  },
] as const;

export const PROGRESS_CHART_WIDGETS: readonly ProgressChartWidgetDefinition[] = [
  {
    id: 'chart:bicep-left',
    chartId: 'bicep-left',
    label: 'Left bicep',
    group: 'tape',
    description: 'Left upper-arm circumference over time.',
    aliases: ['left bicep', 'bicep left', 'left arm'],
  },
  {
    id: 'chart:bicep-right',
    chartId: 'bicep-right',
    label: 'Right bicep',
    group: 'tape',
    description: 'Right upper-arm circumference over time.',
    aliases: ['right bicep', 'bicep right', 'right arm'],
  },
  {
    id: 'chart:waist',
    chartId: 'waist',
    label: 'Waist',
    group: 'tape',
    description: 'Waist circumference over time.',
    aliases: ['waist measurement', 'waist size', 'waist'],
  },
  {
    id: 'chart:waist-to-height',
    chartId: 'waist-to-height',
    label: 'Waist-to-height',
    group: 'tape',
    description: 'Waist-to-height health ratio over time.',
    aliases: ['waist-to-height', 'waist to height', 'whtr'],
  },
  {
    id: 'chart:chest',
    chartId: 'chest',
    label: 'Chest',
    group: 'tape',
    description: 'Chest circumference over time.',
    aliases: ['chest measurement', 'chest size', 'chest'],
  },
  {
    id: 'chart:shoulders',
    chartId: 'shoulders',
    label: 'Shoulder',
    group: 'tape',
    description: 'Shoulder width circumference over time.',
    aliases: ['shoulder measurement', 'shoulders measurement', 'shoulder width', 'shoulders', 'shoulder'],
  },
  {
    id: 'chart:neck',
    chartId: 'neck',
    label: 'Neck',
    group: 'tape',
    description: 'Neck circumference over time.',
    aliases: ['neck measurement', 'neck size', 'neck'],
  },
  {
    id: 'chart:abdomen',
    chartId: 'abdomen',
    label: 'Abdomen',
    group: 'tape',
    description: 'Navel-level abdomen circumference over time.',
    aliases: ['abdomen measurement', 'abdomen', 'belly'],
  },
  {
    id: 'chart:hips',
    chartId: 'hips',
    label: 'Hip',
    group: 'tape',
    description: 'Hip circumference over time.',
    aliases: ['hip measurement', 'hips measurement', 'hips', 'hip'],
  },
  {
    id: 'chart:thigh-left',
    chartId: 'thigh-left',
    label: 'Left thigh',
    group: 'tape',
    description: 'Left thigh circumference over time.',
    aliases: ['left thigh', 'thigh left', 'left quad', 'left leg'],
  },
  {
    id: 'chart:thigh-right',
    chartId: 'thigh-right',
    label: 'Right thigh',
    group: 'tape',
    description: 'Right thigh circumference over time.',
    aliases: ['right thigh', 'thigh right', 'right quad', 'right leg'],
  },
  {
    id: 'chart:calf-left',
    chartId: 'calf-left',
    label: 'Left calf',
    group: 'tape',
    description: 'Left calf circumference over time.',
    aliases: ['left calf', 'calf left'],
  },
  {
    id: 'chart:calf-right',
    chartId: 'calf-right',
    label: 'Right calf',
    group: 'tape',
    description: 'Right calf circumference over time.',
    aliases: ['right calf', 'calf right'],
  },
  {
    id: 'chart:bodyweight',
    chartId: 'bodyweight',
    label: 'Weight trend',
    group: 'body',
    description: '7-day average weight with daily weigh-ins.',
    aliases: ['weight trend', 'weight chart', '7-day average weight'],
  },
  {
    id: 'chart:body-fat',
    chartId: 'body-fat',
    label: 'Body fat %',
    group: 'body',
    description: 'Body fat percentage over time.',
    aliases: ['body fat percentage', 'body fat %', 'body fat', 'bodyfat'],
  },
  {
    id: 'chart:lean-mass',
    chartId: 'lean-mass',
    label: 'Fat free mass',
    group: 'body',
    description: 'Lean mass (everything but fat) over time.',
    aliases: ['fat free mass', 'fat-free mass', 'lean mass', 'lean body mass'],
  },
  {
    id: 'chart:ffmi',
    chartId: 'ffmi',
    label: 'Muscle for your height',
    group: 'body',
    description: 'Fat-free mass index (FFMI) over time.',
    aliases: ['muscle for your height', 'ffmi'],
  },
  {
    id: 'chart:skeletal-muscle-mass',
    chartId: 'skeletal-muscle-mass',
    label: 'Skeletal muscle mass',
    group: 'body',
    description: 'Skeletal muscle mass trend.',
    aliases: ['skeletal muscle mass', 'skeletal muscle'],
  },
  {
    id: 'chart:bmi',
    chartId: 'bmi',
    label: 'BMI',
    group: 'body',
    description: 'Body Mass Index trend.',
    aliases: ['body mass index', 'bmi'],
  },
  {
    id: 'chart:visceral-fat',
    chartId: 'visceral-fat',
    label: 'Visceral fat',
    group: 'body',
    description: 'Visceral fat rating trend.',
    aliases: ['visceral fat'],
  },
  {
    id: 'chart:weekly-sets',
    chartId: 'weekly-sets',
    label: 'Weekly hard sets',
    group: 'training',
    description: 'Weekly working sets completed across workouts.',
    aliases: ['weekly hard sets', 'weekly sets'],
  },
  {
    id: 'chart:whoop-recovery',
    chartId: 'whoop-recovery',
    label: 'Whoop recovery',
    group: 'whoop',
    description: 'Overnight Whoop recovery percentage over time.',
    requiresWhoop: true,
    aliases: ['whoop recovery score', 'whoop recovery', 'recovery score', 'recovery %'],
  },
  {
    id: 'chart:whoop-strain',
    chartId: 'whoop-strain',
    label: 'Whoop day strain',
    group: 'whoop',
    description: 'Daily Whoop cardiovascular strain score (0–21) over time.',
    requiresWhoop: true,
    aliases: ['whoop day strain', 'whoop strain', 'day strain'],
  },
  {
    id: 'chart:whoop-workout-strain',
    chartId: 'whoop-workout-strain',
    label: 'Whoop workout strain',
    group: 'whoop',
    description: 'Strain score recorded for each workout session.',
    requiresWhoop: true,
    aliases: ['whoop workout strain', 'workout strain', 'session strain'],
  },
  {
    id: 'chart:whoop-hrv',
    chartId: 'whoop-hrv',
    label: 'Whoop HRV',
    group: 'whoop',
    description: 'Overnight heart rate variability (RMSSD) over time.',
    requiresWhoop: true,
    aliases: ['whoop hrv', 'heart rate variability', 'hrv rmssd', 'hrv'],
  },
  {
    id: 'chart:whoop-rhr',
    chartId: 'whoop-rhr',
    label: 'Whoop resting HR',
    group: 'whoop',
    description: 'Overnight resting heart rate (bpm) over time.',
    requiresWhoop: true,
    aliases: ['whoop resting heart rate', 'whoop resting hr', 'whoop rhr', 'resting heart rate', 'resting hr', 'rhr'],
  },
  {
    id: 'chart:whoop-sleep',
    chartId: 'whoop-sleep',
    label: 'Whoop sleep',
    group: 'whoop',
    description: 'Nightly sleep hours recorded by Whoop over time.',
    requiresWhoop: true,
    aliases: ['whoop sleep', 'sleep duration', 'sleep hours', 'sleep'],
  },
] as const;

const CHART_GROUP_ALIASES: { aliases: string[]; ids: `chart:${string}`[] }[] = [
  { aliases: ['arm measurements', 'arms measurement', 'upper arms', 'biceps', 'bicep', 'arms', 'arm'], ids: ['chart:bicep-left', 'chart:bicep-right'] },
  { aliases: ['thigh measurements', 'thighs', 'thigh', 'quads'], ids: ['chart:thigh-left', 'chart:thigh-right'] },
  { aliases: ['calf measurements', 'calves', 'calf'], ids: ['chart:calf-left', 'chart:calf-right'] },
];

export const DEFAULT_PROGRESS_WIDGETS: CoreProgressWidgetId[] = PROGRESS_WIDGETS.filter((w) => w.defaultEnabled).map((w) => w.id);

const VALID_CORE_IDS = new Set<CoreProgressWidgetId>(PROGRESS_WIDGETS.map((w) => w.id));
const VALID_CHART_IDS = new Set<string>(PROGRESS_CHART_WIDGETS.map((c) => c.id));
const CORE_MAP = new Map<CoreProgressWidgetId, ProgressWidgetDefinition>(PROGRESS_WIDGETS.map((w) => [w.id, w]));
const CHART_MAP = new Map<string, ProgressChartWidgetDefinition>(PROGRESS_CHART_WIDGETS.map((c) => [c.id, c]));

export const exerciseWidgetId = (exerciseId: string): `exercise:${string}` => `exercise:${exerciseId}`;

export function parseProgressWidgetId(
  id: ProgressWidgetId
): { kind: 'core'; coreId: CoreProgressWidgetId } | { kind: 'exercise'; exerciseId: string } | { kind: 'chart'; chartId: string } {
  if (typeof id === 'string' && id.startsWith('exercise:')) {
    return { kind: 'exercise', exerciseId: id.slice('exercise:'.length) };
  }
  if (typeof id === 'string' && id.startsWith('chart:')) {
    return { kind: 'chart', chartId: id.slice('chart:'.length) };
  }
  return { kind: 'core', coreId: id as CoreProgressWidgetId };
}

export function isValidProgressWidgetId(id: ProgressWidgetId): boolean {
  if (VALID_CORE_IDS.has(id as CoreProgressWidgetId)) return true;
  if (typeof id === 'string' && id.startsWith('exercise:') && id.length > 'exercise:'.length) return true;
  if (typeof id === 'string' && VALID_CHART_IDS.has(id)) return true;
  return false;
}

export function isWhoopWidgetId(id: ProgressWidgetId): boolean {
  const parsed = parseProgressWidgetId(id);
  if (parsed.kind === 'core') return Boolean(CORE_MAP.get(parsed.coreId)?.requiresWhoop);
  if (parsed.kind === 'chart') return Boolean(CHART_MAP.get(id)?.requiresWhoop);
  return false;
}

export function availableProgressWidgets(profile?: UserProfile | null): readonly ProgressWidgetDefinition[] {
  const whoopReady = isWhoopConfigured(profile);
  return PROGRESS_WIDGETS.filter((w) => !w.requiresWhoop || whoopReady);
}

export function availableProgressChartWidgets(profile?: UserProfile | null): readonly ProgressChartWidgetDefinition[] {
  const whoopReady = isWhoopConfigured(profile);
  return PROGRESS_CHART_WIDGETS.filter((c) => !c.requiresWhoop || whoopReady);
}

/** Resolve the athlete's active widget IDs (core blocks in canonical order, plus custom pinned charts/exercises in saved order). */
export function resolveProgressWidgets(saved?: ProgressWidgetId[]): ProgressWidgetId[] {
  if (saved === undefined) return [...DEFAULT_PROGRESS_WIDGETS];
  const validUnique: ProgressWidgetId[] = [];
  const seen = new Set<ProgressWidgetId>();
  for (const raw of saved) {
    if (!isValidProgressWidgetId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    validUnique.push(raw);
  }
  const coreIds = PROGRESS_WIDGETS.filter((w) => seen.has(w.id)).map((w) => w.id);
  const customIds = validUnique.filter((id) => !VALID_CORE_IDS.has(id as CoreProgressWidgetId));
  return [...coreIds, ...customIds];
}

/** Resolve active Progress widgets visible for this profile (hiding Whoop widgets until Whoop is configured). */
export function resolveVisibleProgressWidgets(saved?: ProgressWidgetId[], profile?: UserProfile | null): ProgressWidgetId[] {
  const whoopReady = isWhoopConfigured(profile);
  return resolveProgressWidgets(saved).filter((id) => whoopReady || !isWhoopWidgetId(id));
}

/** Return undefined when the selection matches defaults so unmodified profiles stay clean. */
export function normalizeProgressWidgets(next: ProgressWidgetId[]): ProgressWidgetId[] | undefined {
  const canonical = resolveProgressWidgets(next);
  if (
    canonical.length === DEFAULT_PROGRESS_WIDGETS.length &&
    canonical.every((id, idx) => id === DEFAULT_PROGRESS_WIDGETS[idx])
  ) {
    return undefined;
  }
  return canonical;
}

/** Toggle a single widget on or off and return the normalised persisted value. */
export function toggleProgressWidget(
  saved: ProgressWidgetId[] | undefined,
  id: ProgressWidgetId
): ProgressWidgetId[] | undefined {
  const current = resolveProgressWidgets(saved);
  const exists = current.includes(id);
  const next = exists ? current.filter((w) => w !== id) : [...current, id];
  return normalizeProgressWidgets(next);
}

export function labelForProgressWidget(id: ProgressWidgetId, exerciseCatalog: ExerciseDefinition[] = []): string {
  const parsed = parseProgressWidgetId(id);
  if (parsed.kind === 'core') return CORE_MAP.get(parsed.coreId)?.label ?? id;
  if (parsed.kind === 'chart') return CHART_MAP.get(id)?.label ?? parsed.chartId;
  return exerciseCatalog.find((e) => e.id === parsed.exerciseId)?.name ?? parsed.exerciseId;
}

export interface ProgressWidgetChange {
  /** Normalized widget list for UserProfile.progressWidgets (`undefined` = default set). */
  progressWidgets?: ProgressWidgetId[];
  changed: boolean;
  reply: string;
  summary?: string;
}

const CORE_ALIAS_ENTRIES: { ids: ProgressWidgetId[]; alias: string; re: RegExp }[] = PROGRESS_WIDGETS.flatMap((w) =>
  w.aliases.map((alias) => ({
    ids: [w.id] as ProgressWidgetId[],
    alias,
    re: new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }))
).sort((a, b) => b.alias.length - a.alias.length);

const CHART_ALIAS_ENTRIES: { ids: ProgressWidgetId[]; alias: string; re: RegExp }[] = [
  ...PROGRESS_CHART_WIDGETS.flatMap((c) =>
    c.aliases.map((alias) => ({
      ids: [c.id] as ProgressWidgetId[],
      alias,
      re: new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(?:measurements?|widgets?|cards?|charts?|graphs?))?\\b`, 'i'),
    }))
  ),
  ...CHART_GROUP_ALIASES.flatMap((g) =>
    g.aliases.map((alias) => ({
      ids: g.ids as ProgressWidgetId[],
      alias,
      re: new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(?:measurements?|widgets?|cards?|charts?|graphs?))?\\b`, 'i'),
    }))
  ),
].sort((a, b) => b.alias.length - a.alias.length);

const EVERYDAY_LIFT_WIDGET_ALIASES: { re: RegExp; exerciseId: string }[] = [
  { re: /\b(?<!incline |flat dumbbell |flat db |seated cable )bench(?: press)?\b/i, exerciseId: 'ex-bench-press' },
  { re: /\b(?<!split |goblet |single-leg |paused |bodyweight )(?:back )?squats?\b/i, exerciseId: 'ex-barbell-squat' },
  { re: /\b(?<!romanian |single-leg )deadlifts?\b/i, exerciseId: 'ex-deadlift' },
  { re: /\b(?:overhead press|ohp|(?<!dumbbell |db |seated |seated db )shoulder press|military press)\b/i, exerciseId: 'ex-ohp' },
  { re: /\b(?:chin[\s-]?ups?|pull[\s-]?ups?|chins)\b/i, exerciseId: 'ex-chinup' },
  { re: /\b(?:romanian deadlifts?|rdls?)\b/i, exerciseId: 'ex-rdl' },
];

const ADD_VERB_RE = /\b(add|show|enable|turn on|put back|put|display|include|track|pin|bring back|restore|keep)\b/;
const REMOVE_VERB_RE = /\b(remove|hide|disable|turn off|take off|drop|unpin|clear|stop showing|don'?t show|do not show|without)\b/;
const WIDGET_ANCHOR_RE =
  /\b(widgets?|cards?|tiles?|charts?|graphs?|progressions?|goal rings?|progress\s*(page|screen|tab|view|overview)|(?:on|to|from|in)\s+(?:my\s+|the\s+)?progress(?:\s+(?:page|screen|tab|view))?)\b/;

function maskSpan(text: string, start: number, length: number): string {
  return text.slice(0, start) + ' '.repeat(length) + text.slice(start + length);
}

function findWidgetsInText(
  text: string,
  exerciseCatalog: ExerciseDefinition[],
  activeWorkout?: WorkoutSession
): ProgressWidgetId[] {
  let working = text;
  const found: ProgressWidgetId[] = [];
  const pushId = (id: ProgressWidgetId) => {
    if (!found.includes(id)) found.push(id);
  };

  // 1. Exact exercise names from catalog (longest first), so e.g. "Cable Chest Press" isn't confused with "Chest" tape.
  const catalogByLength = [...exerciseCatalog]
    .filter((d) => d.name.trim().length >= 4)
    .sort((a, b) => b.name.length - a.name.length);
  for (const def of catalogByLength) {
    const escaped = def.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}(?:\\s+(?:progressions?|widgets?|cards?|charts?))?\\b`, 'i');
    const m = re.exec(working);
    if (m) {
      pushId(exerciseWidgetId(def.id));
      working = maskSpan(working, m.index, m[0].length);
    }
  }

  // 2. Specific body measurements, groups ("arms" / "biceps" / "thighs"), and training charts.
  for (const entry of CHART_ALIAS_ENTRIES) {
    const m = entry.re.exec(working);
    if (m) {
      for (const id of entry.ids) pushId(id);
      working = maskSpan(working, m.index, m[0].length);
    }
  }

  // 3. Everyday lift names ("bench press", "squat", "rdl") when they map directly to a lift in catalog.
  for (const alias of EVERYDAY_LIFT_WIDGET_ALIASES) {
    const m = alias.re.exec(working);
    if (m && exerciseCatalog.some((d) => d.id === alias.exerciseId)) {
      pushId(exerciseWidgetId(alias.exerciseId));
      working = maskSpan(working, m.index, m[0].length);
    }
  }

  // 4. Core overview widgets ("Goals", "Trophy case", "Measurements", "Balance", etc.).
  for (const entry of CORE_ALIAS_ENTRIES) {
    const m = entry.re.exec(working);
    if (m) {
      for (const id of entry.ids) pushId(id);
      working = maskSpan(working, m.index, m[0].length);
    }
  }

  // 5. Remaining exercise phrases matched via the shared exercise name matcher ("incline press", "bicep curl", "skullcrusher").
  if (exerciseCatalog.length > 0 && working.trim().length >= 4) {
    const cleaned = working
      .replace(ADD_VERB_RE, ' ')
      .replace(REMOVE_VERB_RE, ' ')
      .replace(WIDGET_ANCHOR_RE, ' ')
      .replace(/\b(my|the|a|an|me|please|progress|page|screen|tab)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 4) {
      const dummySession: WorkoutSession =
        activeWorkout ?? {
          id: 'dummy',
          date: '2026-01-01',
          name: 'Dummy',
          splitDay: 'Full Body',
          exercises: [],
          completed: false,
          readinessState: 'Normal',
          readinessZScore: 0,
        };
      const named = findExerciseNamed(cleaned, dummySession, exerciseCatalog);
      if (named?.def) {
        pushId(exerciseWidgetId(named.def.id));
      }
    }
  }

  return found;
}

function joinLabels(ids: ProgressWidgetId[], exerciseCatalog: ExerciseDefinition[] = []): string {
  const labels = ids.map((id) => labelForProgressWidget(id, exerciseCatalog));
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function describeCurrentWidgets(
  saved?: ProgressWidgetId[],
  exerciseCatalog: ExerciseDefinition[] = [],
  whoopConfigured = false
): string {
  const active = resolveProgressWidgets(saved).filter((id) => whoopConfigured || !isWhoopWidgetId(id));
  const activeSet = new Set(active);
  const availableCore = PROGRESS_WIDGETS.filter(
    (w) => (!w.requiresWhoop || whoopConfigured) && !activeSet.has(w.id)
  ).map((w) => w.id);
  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(`On Progress right now: ${joinLabels(active, exerciseCatalog)}.`);
  } else {
    parts.push('No widgets are currently shown on Progress.');
  }
  if (availableCore.length > 0) {
    parts.push(`Overview cards you can add: ${joinLabels(availableCore, exerciseCatalog)}.`);
  }
  parts.push(
    whoopConfigured
      ? 'You can also add any exercise progression (like Bench Press), body measurement (like Left bicep, Waist or Chest), or Whoop trend chart (like Whoop recovery, Day strain or HRV).'
      : 'You can also add any exercise progression (like Bench Press) or body measurement (like Left bicep, Right bicep, Waist or Chest).'
  );
  return parts.join(' ');
}

/**
 * Deterministic parser for customizing Progress screen widgets in AI chat.
 * Requires an explicit widget/progress-screen cue so ordinary data questions and goal targets stay untouched.
 */
export function detectProgressWidgetChange(
  lowerMsg: string,
  profile: UserProfile,
  exerciseCatalog: ExerciseDefinition[] = [],
  activeWorkout?: WorkoutSession
): ProgressWidgetChange | null {
  const msg = lowerMsg.trim();
  const whoopConfigured = isWhoopConfigured(profile);
  const hasWidgetAnchor = WIDGET_ANCHOR_RE.test(msg);
  const isPoliteRequest = /^(can|could|would|will)\s+you\b/.test(msg);
  const isInquiry = /\bwhat|which\b/.test(msg) && /\b(widgets?|cards?|charts?)\b/.test(msg) && /\bprogress\b/.test(msg);

  if (isInquiry) {
    return {
      changed: false,
      reply: describeCurrentWidgets(profile.progressWidgets, exerciseCatalog, whoopConfigured),
    };
  }

  // Questions other than polite requests ("can you add balance to progress?") are never mutations.
  if (!isPoliteRequest && (/^(why|when|what|which|how|is|are|do|does|did)\b/.test(msg) || /\?\s*$/.test(msg))) {
    return null;
  }

  // Help / overview request without a specific widget.
  if (
    /\b(customi[sz]e|edit|manage|arrange|change)\b/.test(msg) &&
    /\b(widgets?|cards?)\b/.test(msg) &&
    findWidgetsInText(msg, exerciseCatalog, activeWorkout).length === 0 &&
    !/\b(all|every|default)\b/.test(msg)
  ) {
    return {
      changed: false,
      reply: describeCurrentWidgets(profile.progressWidgets, exerciseCatalog, whoopConfigured),
    };
  }

  // Reset widgets to defaults (explicitly requires widget/card/progress-screen wording; "reset goals" goes to goal settings).
  if (
    /\b(reset|restore|default)\b/.test(msg) &&
    /\b(widgets?|cards?|progress\s*(page|screen|tab|view|layout))\b/.test(msg)
  ) {
    if (profile.progressWidgets === undefined) {
      return { changed: false, reply: 'Your Progress widgets are already set to the defaults.' };
    }
    return {
      progressWidgets: undefined,
      changed: true,
      reply: `Done. Your Progress screen is back to the default widgets: ${joinLabels(DEFAULT_PROGRESS_WIDGETS, exerciseCatalog)}.`,
      summary: 'Progress widgets reset to defaults',
    };
  }

  if (!hasWidgetAnchor) return null;

  const isAllWidgets = /\b(all( of the)?|every)\s+(progress\s+)?(widgets?|cards?)\b/.test(msg);
  const hasAdd = ADD_VERB_RE.test(msg);
  const hasRemove = REMOVE_VERB_RE.test(msg);

  if (isAllWidgets && hasRemove && !hasAdd) {
    const current = resolveVisibleProgressWidgets(profile.progressWidgets, profile);
    if (current.length === 0) {
      return { changed: false, reply: 'All Progress widgets are already hidden.' };
    }
    return {
      progressWidgets: [],
      changed: true,
      reply: 'Done. Cleared all widgets from your Progress screen. You can add any back anytime.',
      summary: 'All Progress widgets removed',
    };
  }

  if (!hasAdd && !hasRemove) return null;

  const mentionedAnywhere = findWidgetsInText(msg, exerciseCatalog, activeWorkout);
  if (mentionedAnywhere.length === 0) return null;

  if (!whoopConfigured && hasAdd && !hasRemove && mentionedAnywhere.every(isWhoopWidgetId)) {
    return {
      changed: false,
      reply: 'Whoop widgets only appear once Whoop is connected or imported. Set up Whoop in Watch & telemetry first.',
    };
  }

  // Guard: "change my goals on progress" belongs to GoalSettings, not hiding the widget.
  if (
    mentionedAnywhere.length === 1 &&
    mentionedAnywhere[0] === 'goals' &&
    !/\b(widgets?|cards?|rings?)\b/.test(msg) &&
    !/\b(remove|hide|disable|turn off|take off|drop|add|show|enable|turn on)\b/.test(msg)
  ) {
    return null;
  }

  const nextList = [...resolveProgressWidgets(profile.progressWidgets)];
  const added: ProgressWidgetId[] = [];
  const removed: ProgressWidgetId[] = [];
  const blockedWhoop: ProgressWidgetId[] = [];
  const alreadyInState: { id: ProgressWidgetId; op: 'add' | 'remove' }[] = [];

  const applyOp = (op: 'add' | 'remove', ids: ProgressWidgetId[]) => {
    for (const id of ids) {
      if (op === 'add' && !whoopConfigured && isWhoopWidgetId(id)) {
        if (!blockedWhoop.includes(id)) blockedWhoop.push(id);
        continue;
      }
      const idx = nextList.indexOf(id);
      if (op === 'add') {
        if (idx >= 0) {
          alreadyInState.push({ id, op: 'add' });
        } else {
          nextList.push(id);
          if (!added.includes(id)) added.push(id);
        }
      } else {
        if (idx < 0) {
          alreadyInState.push({ id, op: 'remove' });
        } else {
          nextList.splice(idx, 1);
          if (!removed.includes(id)) removed.push(id);
        }
      }
    }
  };

  if (hasAdd && hasRemove) {
    const clauses = msg.split(/[,;]|\band\b|\bthen\b/).map((c) => c.trim()).filter(Boolean);
    let currentOp: 'add' | 'remove' = msg.search(REMOVE_VERB_RE) < msg.search(ADD_VERB_RE) ? 'remove' : 'add';
    for (const clause of clauses) {
      const clauseAdd = ADD_VERB_RE.test(clause);
      const clauseRemove = REMOVE_VERB_RE.test(clause);
      if (clauseRemove && !clauseAdd) currentOp = 'remove';
      else if (clauseAdd && !clauseRemove) currentOp = 'add';
      const ids = findWidgetsInText(clause, exerciseCatalog, activeWorkout);
      applyOp(currentOp, ids);
    }
  } else {
    applyOp(hasRemove ? 'remove' : 'add', mentionedAnywhere);
  }

  if (added.length === 0 && removed.length === 0) {
    if (alreadyInState.length > 0 || blockedWhoop.length > 0) {
      const alreadyAdded = alreadyInState.filter((x) => x.op === 'add').map((x) => x.id);
      const alreadyRemoved = alreadyInState.filter((x) => x.op === 'remove').map((x) => x.id);
      const notes: string[] = [];
      if (alreadyAdded.length) {
        notes.push(`${joinLabels(alreadyAdded, exerciseCatalog)} ${alreadyAdded.length === 1 ? 'is' : 'are'} already shown on Progress.`);
      }
      if (alreadyRemoved.length) {
        notes.push(`${joinLabels(alreadyRemoved, exerciseCatalog)} ${alreadyRemoved.length === 1 ? 'is' : 'are'} already hidden from Progress.`);
      }
      if (blockedWhoop.length) {
        notes.push(`${joinLabels(blockedWhoop, exerciseCatalog)} requires Whoop to be connected or imported first.`);
      }
      return { changed: false, reply: notes.join(' ') };
    }
    return null;
  }

  const normalized = normalizeProgressWidgets(nextList);
  const phrases: string[] = [];
  if (added.length > 0) phrases.push(`Added ${joinLabels(added, exerciseCatalog)} to your Progress screen.`);
  if (removed.length > 0) phrases.push(`Removed ${joinLabels(removed, exerciseCatalog)} from your Progress screen.`);
  if (blockedWhoop.length > 0) {
    phrases.push(`${joinLabels(blockedWhoop, exerciseCatalog)} requires Whoop to be connected or imported first.`);
  }

  const summaryParts: string[] = [];
  if (added.length > 0) summaryParts.push(`Added ${joinLabels(added, exerciseCatalog)}`);
  if (removed.length > 0) summaryParts.push(`Removed ${joinLabels(removed, exerciseCatalog)}`);

  return {
    progressWidgets: normalized,
    changed: true,
    reply: `Done. ${phrases.join(' ')}`,
    summary: summaryParts.join(' · '),
  };
}
