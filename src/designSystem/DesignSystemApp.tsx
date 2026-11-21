import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Flame,
  GitBranch,
  Layers,
  Palette,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { TREISE_DESIGN_SYSTEM } from '../engine/knowledgeGraph';
import { ReadinessState, WorkoutSet } from '../engine/types';
import { formatSentenceCase } from '../utils/typography';
import { UnitsProvider } from '../utils/unitsContext';
import { WeightUnit } from '../utils/units';
import { Header } from '../components/common/Header';
import { NavigationBar, TabId } from '../components/common/NavigationBar';
import { Toast } from '../components/common/Toast';
import { BiometricCircularGauge } from '../components/common/BiometricCircularGauge';
import { TrendChart } from '../components/common/TrendChart';
import { RestTimerModal } from '../components/common/RestTimerModal';
import { WorkoutPageHeader } from '../components/train/WorkoutPageHeader';
import { CurrentSessionCard, ProgramProgressCard, StickySessionHeader } from '../components/train/ProgramProgressCard';
import { RecoveryScoreCard } from '../components/train/RecoveryScoreCard';
import { ReadinessBanner } from '../components/train/ReadinessBanner';
import { ActiveDayCard } from '../components/train/ActiveDayCard';
import { ExerciseCard } from '../components/train/ExerciseCard';
import { ExerciseDetailModal } from '../components/train/ExerciseDetailModal';
import { SET_TABLE_COLUMNS, SET_TABLE_GAP, SetRow } from '../components/train/SetRow';
import {
  CompletedExerciseCard,
  FinishedWorkoutSummaryCard,
  WhoopStrainCard,
} from '../components/train/FinishedWorkoutCards';
import { PlateCalculatorModal } from '../components/train/PlateCalculatorModal';
import { ExerciseSwapModal } from '../components/train/ExerciseSwapModal';
import { AICoachChatModal } from '../components/assistant/AICoachChatModal';
import { OnboardingModal } from '../components/onboarding/OnboardingModal';
import { TimelineToggle } from '../components/analytics/TimelineToggle';
import { GoalPhaseSwitcher } from '../components/program/GoalPhaseSwitcher';
import {
  DetailHeader,
  GoalsHero,
  OverviewCard,
  Sparkline,
  StandardsRadar,
  StatRow,
} from '../components/analytics/ProgressOverviewCards';
import { ProgressChartCard } from '../components/analytics/ProgressChartCard';
import { CompositionCard } from '../components/analytics/CompositionCard';
import { StrengthLevelsCard } from '../components/analytics/StrengthLevelsCard';
import { BalanceCard } from '../components/analytics/BalanceCard';
import { MuscleProgressCard } from '../components/analytics/MuscleProgressCard';
import { KnowledgeGraphCard } from '../components/analytics/KnowledgeGraphCard';
import { ChartTimeline } from '../services/progressSeries';
import { buildShowcaseFixtures } from './showcaseFixtures';
import { parseDesignTokens, parseWkCssSpecs } from './tokenParser';

const SECTIONS = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'typography', label: 'Typography' },
  { id: 'primitives', label: 'Primitives' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'workout', label: 'Workout' },
  { id: 'progress', label: 'Progress' },
  { id: 'coach', label: 'AI Coach' },
  { id: 'ai-context', label: 'KG & AI' },
  { id: 'modals', label: 'Modals' },
  { id: 'specs', label: 'Specs & KG' },
] as const;

const OOUX_MUTATION_RULES: Record<
  'Athlete' | 'Program' | 'Workout' | 'Exercise' | 'Goal' | 'ActiveDay' | 'ExerciseNote',
  {
    mutableVia: string;
    mutableFields: string;
    readOnlyFields: string;
  }
> = {
  Athlete: {
    mutableVia: 'save_athlete_memory, location & home equipment intents',
    mutableFields: 'memories[], home_equipment[], active_location',
    readOnlyFields: 'bodyweight_kg (7-day EMA), training_maxes_kg (E1RM), contraindications (derived)',
  },
  Program: {
    mutableVia: 'reset_program (confirmation_required: true) & split intents',
    mutableFields: 'current_week, current_day_number, cycle_started_at, phase_name',
    readOnlyFields: 'completed_workouts, completion_pct, total_weeks, total_workouts',
  },
  Workout: {
    mutableVia: 'swap_exercise & adjust_workout_volume (uncompleted sets only)',
    mutableFields: 'uncompleted exercises[], uncompleted set count/load modifiers',
    readOnlyFields: 'completed, completed_sets, day_instance_kind, readiness_state, logged workout history',
  },
  Exercise: {
    mutableVia: 'swap_exercise & adjust_workout_volume (uncompleted sets)',
    mutableFields: 'exercise swap target, uncompleted set count / deload modifier, athleteNotes',
    readOnlyFields: 'is_timed, target_duration_seconds, estimated_1rm_kg, stalled flag, double-progression weights',
  },
  Goal: {
    mutableVia: 'Explicit goal actions (CustomGoal, GoalSettings)',
    mutableFields: 'strengthFocus, customGoals[] (target & exercise selection)',
    readOnlyFields: 'current, progress_pct, achieved (buildAthleteGoals / describeGoalStanding)',
  },
  ActiveDay: {
    mutableVia: 'Log active day / Strava / Fitbit / Health Connect sync',
    mutableFields: 'activity_type, duration_minutes, distance_km, date',
    readOnlyFields: 'source attribution, workoutsPerWeek adherence rollover',
  },
  ExerciseNote: {
    mutableVia: 'ExerciseCard Exercise notes open input (immediately persisted)',
    mutableFields: 'note text per active workout exercise',
    readOnlyFields: 'historical dates, longitudinal Knowledge Graph fatigue/discomfort insight mining',
  },
};

const AI_MUTATION_GUARDRAILS = [
  {
    title: 'Question guard (?)',
    rule: 'Questions never trigger state edits, equipment deletion, or rest-day logging.',
    tone: 'var(--color-status-info)',
  },
  {
    title: 'Confirmation gate',
    rule: 'Destructive actions (reset_program) pause with CoachPendingConfirmation before writing.',
    tone: 'var(--color-status-warning)',
  },
  {
    title: 'Diff receipt + undo',
    rule: 'Committed tools attach CoachStateDiff (previous -> new) and CoachUndoSnapshot.',
    tone: 'var(--color-status-positive)',
  },
  {
    title: 'Truthfulness gate',
    rule: 'enforceMutationTruthfulness restores prior state and blocks false success copy on error.',
    tone: 'var(--color-status-danger)',
  },
] as const;

const AI_RUNTIME_PIPELINE = [
  {
    step: '01 · Safety Circuit-Breaker',
    module: 'buildSafetyResponse',
    rule: 'Chest pain, dizziness, or sharp joint pain returns a fixed medical/swap response immediately.',
  },
  {
    step: '02 · Deterministic Intents & KG',
    module: 'coachAnswers.ts',
    rule: 'Targets, warm-ups, swaps, readiness, equipment edits, and science cards resolve from canonical state.',
  },
  {
    step: '03 · Grounded Model Layer',
    module: 'onDeviceModel.ts · geminiFlashLite.ts',
    rule: 'Built-in Prompt API when available; otherwise stateless /api/coach/generate with COACH_TOOL_DECLARATIONS.',
  },
  {
    step: '04 · Fact Gates & Fallback',
    module: 'factChecks.ts · runReadAloudQaGate',
    rule: 'Every numeric/unit/tone check allows at most 1 retry before falling back to deterministic coaching text.',
  },
] as const;

const AI_SURFACE_QUALITY_GATES = [
  {
    surface: 'Coach Chat',
    source: 'src/services/aiAssistantService.ts',
    validator: 'acceptCoachAnswer',
    checks: [
      'runReadAloudQaGate + numeric/unit/spelled-number match against system & question grounding',
      'contradictsMuscleTargets, claimsInventedPastResults, misnamesEquipment',
      'changesPlanWeight, contradictsRecovery, genericRepTarget, contradictsPlanSchedule',
    ],
    retryAndFallback: 'Withdraws streamed partial on first violation; 1 retry if < 6000ms -> rule-based coach fallback',
  },
  {
    surface: 'Exercise 2-Line Brief',
    source: 'src/services/exerciseCoachNote.ts',
    validator: 'checkExerciseNote',
    checks: [
      'Front-loaded 2-line CoachSummaryText brief (<= 240 chars, target <= 180 chars), zero Progress:/Goal: headers',
      'Shift Nudge hierarchy: Line 1 at 16px/500 (--color-text-primary) over Line 2 at 16px/400 (--color-text-secondary)',
      'Zero sets, reps, weight×rep, RIR, %, tempo, rest seconds, or weekly-set leakage',
    ],
    retryAndFallback: '1 retry with failure reason -> concise buildExerciseInsight fallback',
  },
  {
    surface: 'Program Identity Message',
    source: 'src/services/identityMessage.ts',
    validator: 'checkIdentityMessage',
    checks: [
      '2–3 crisp left-aligned sentences (<= 260 chars) inside wk-card with Plan momentum eyebrow',
      'Blocks ungrounded digits/%, feeling claims, and invented phase-completion estimates',
      'Guards plan-vs-phase totals, "most" (requires share > 0.5), and "consistent" (>= 6 recent sessions)',
    ],
    retryAndFallback: '1 retry + persistent negative reject cache (treise_ai_rejected_v1) -> deterministic fallback',
  },
  {
    surface: 'Workout Finish Summary',
    source: 'src/services/workoutFinish.ts',
    validator: 'checkWorkoutSummary',
    checks: [
      '2–3 crisp sentences (<= 240 chars) separated by subtle divider from Volume & Sets telemetry',
      'Blocks multi-session E1RM deltas framed as single-day gains or unreached goals marked met',
      'Requires estimated max to be labelled as estimate; blocks volume/set duplication & "felt"',
    ],
    retryAndFallback: '1 retry + negative reject cache -> deterministic WorkoutFinish summary',
  },
  {
    surface: 'Progress Goals Carousel Summary',
    source: 'src/services/progressOverview.ts',
    validator: 'checkGoalsSummary',
    checks: [
      'Per-goal carousel slide (<= 250 chars): canvas-native 192px hero ring + directly paired 2-sentence Goal takeaway',
      'Bans "insufficient data / cannot be assessed", hype words, percentages on rings, and feeling claims',
      'Exact number, unit, and counted-noun check + runReadAloudQaGate',
    ],
    retryAndFallback: '1 retry + negative reject cache -> buildSingleGoalSummary fallback (buildGoalsSummary kept for full overview)',
  },
] as const;

const THREE_LAYER_SPECS = [
  {
    pillar: 'Typography & Numerals',
    heuristic: 'Maximum 4 font sizes (12/16/20/32px, 2.67x span), 4 functional weights (400/500/600/700 — with 700 reserved exclusively for 32px), 3 ink opacities (1.00 / 0.78 / 0.60), and strict Sentence-case discipline.',
    spec: 'Inter 400/500/600/700; 12px: .wk-label (500 uppercase +0.06em muted) / .wk-meta-title (500 none secondary) / .wk-pill (500 none) / .wk-segment (500 active, 400 inactive) / .wk-caption (400 muted); 16px: .wk-button (600) / .wk-subhead, .wk-btn-secondary, .wk-field (500) / .wk-body (400 0.78); 20px: .wk-h1, .wk-title, .wk-nav-title, .wk-number, .wk-input (600); 32px: .wk-page-title (700 left Large Title) & .wk-display (700).',
    trigger: 'Multi-weight 600 bloat at 12px, ALL-CAPS list/goal sprawl, 20px page title collision with cards, or muted headers -> Apply 4×4×3 Apple HIG matrix + ds-card-archetypes scan order.',
  },
  {
    pillar: '4px Grid & Concentric Radii',
    heuristic: 'Every margin, gap, height, and radius snaps to 4px multiples; inner corners match outer minus padding so curves never pinch.',
    spec: '--radius-card 24px (p-4 / 16px) -> --radius-tray 16px (p-1 / 4px) -> --radius-control 12px -> --radius-inset 8px -> --radius-badge 4px; touch floors 44px / 48px; pb-28 bottom clearance.',
    trigger: 'Arbitrary px values, --f scaling, or matching 24px child inside 24px parent -> Map onto 4px grid and R_inner = R_outer - padding.',
  },
  {
    pillar: 'Treise Slate & Semantic Polarity',
    heuristic: 'Tinted cool dark slate surfaces step up cleanly; chromatic saturation is rationed strictly by meaning, never decoration or third-party brands.',
    spec: '#13181C canvas -> #2C3034 card -> #3B4044 raised & static pill -> #4B5156 secondary CTA (top rim bevel). #FFFFFF primary CTA; #F5F8FB cool off-white primary ink; #1AE3A0 calibrated precision Mint for achieved progress; #8FD3FF non-progress telemetry; #F5B94A warmup/caution; #FF8A94 crimson danger; #F29468 Coach Copper.',
    trigger: 'Third-party brand hexes, goal-specific ring hues, or mint on informational telemetry -> Route to semantic status tokens.',
  },
  {
    pillar: 'Interactive State Polarity',
    heuristic: 'Pre-filled smart defaults read calmly so unlogged targets never masquerade as logged data; completed sets snap into high-contrast celebration.',
    spec: 'Pending set: --color-text-secondary (0.80 cool Slate) inputs above 0.65 passive PREV/unit labels + bordered #4B5156 Done button. Focused: 2px #FFFFFF ring. Completed: #F5F8FB digits (12.47:1) + calm soft-mint Done check + active:scale-[0.98].',
    trigger: 'Muted defaults indistinguishable from logged sets, missing checkmark on Done, or next-set row highlight -> Enforce pending/active/completed polarity.',
  },
] as const;

function rgbToHex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#')) return trimmed.toUpperCase();
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgbMatch) return trimmed;
  const [, r, g, b, a] = rgbMatch;
  if (a !== undefined && Number(a) < 1) return trimmed;
  return (
    '#' +
    [r, g, b]
      .map((c) => Number(c).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

const StageHeader: React.FC<{
  title: string;
  source: string;
  dsId?: string;
  description?: string;
}> = ({ title, source, dsId, description }) => (
  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="wk-title">{title}</h3>
        {dsId && <span className="wk-pill">{dsId}</span>}
      </div>
      {description && (
        <p className="wk-caption mt-1 max-w-prose" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </p>
      )}
    </div>
    <code
      className="wk-caption tabular-numbers px-2 py-1 rounded-[var(--radius-inset)] shrink-0 max-w-full overflow-x-auto"
      style={{
        background: 'var(--color-bg-canvas)',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {source}
    </code>
  </div>
);

const PhoneStage: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, className = '', style }) => (
  <div
    className={`w-full min-w-0 ${className}`.trim()}
    style={{
      maxWidth: 'var(--ds-phone-max, 448px)',
      borderRadius: 'var(--radius-card)',
      border: '1px solid var(--color-border-subtle)',
      background: 'var(--color-bg-canvas)',
      padding: '16px',
      ...style,
    }}
  >
    {children}
  </div>
);

export const DesignSystemContent: React.FC<{
  unit: WeightUnit;
  onChangeUnit: (u: WeightUnit) => void;
}> = ({ unit, onChangeUnit }) => {
  const [previewWidth, setPreviewWidth] = useState<'448' | '375'>('448');
  const [activeNavTab, setActiveNavTab] = useState<TabId>('train');
  const [timeline, setTimeline] = useState<ChartTimeline>('1M');
  const [goalPhase, setGoalPhase] = useState<'Lean Bulk' | 'Cut / Recomp' | 'Maingain'>('Lean Bulk');
  const [showToast, setShowToast] = useState(false);
  const [openModal, setOpenModal] = useState<'rest' | 'plates' | 'swap' | 'exercise-detail' | 'coach' | 'onboarding' | 'onboarding-edit' | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<'ssr' | 'http' | 'file'>('ssr');
  const [liveComputedVars, setLiveComputedVars] = useState<Record<string, string>>({});

  const fixtures = useMemo(() => buildShowcaseFixtures(unit), [unit]);
  const [interactiveSquat, setInteractiveSquat] = useState(() => fixtures.squatExercise);

  useEffect(() => {
    setInteractiveSquat(buildShowcaseFixtures(unit).squatExercise);
  }, [unit]);

  const parsedTokens = useMemo(() => parseDesignTokens(), []);
  const tokenHexByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const grp of parsedTokens.semanticGroups) {
      for (const tok of grp.tokens) map[tok.name] = tok.resolvedValue;
    }
    for (const prim of parsedTokens.primitives) {
      map[prim.name] = prim.resolvedValue;
    }
    return map;
  }, [parsedTokens]);
  const typographySpecs = useMemo(
    () =>
      parseWkCssSpecs([
        '.wk-display',
        '.wk-page-title',
        '.wk-nav-title',
        '.wk-title, .wk-h1',
        '.wk-subhead',
        '.wk-body',
        '.wk-label',
        '.wk-meta-title',
        '.wk-caption',
        '.wk-number',
        '.wk-pill',
        '.wk-segment',
        '.wk-btn-secondary',
        '.wk-field',
        '.wk-button',
        '.wk-input',
        '.wk-card',
        '.wk-raised',
      ]),
    []
  );

  // Sample set rows showcasing every SetRow visual state without violating uniform calm styling
  const [matrixSets, setMatrixSets] = useState<{
    warmup: WorkoutSet;
    upcoming: WorkoutSet;
    completed: WorkoutSet;
    failure: WorkoutSet;
    unilateral: WorkoutSet;
  }>({
    warmup: {
      id: 'mx-w',
      setNumber: 1,
      targetWeightKg: 60,
      actualWeightKg: 60,
      targetReps: 5,
      actualReps: 5,
      targetRir: 3,
      actualRir: 3,
      completed: false,
      isWarmup: true,
      setType: 'warmup',
    },
    upcoming: {
      id: 'mx-u',
      setNumber: 1,
      targetWeightKg: 100,
      targetReps: 8,
      targetRir: 2,
      completed: false,
      setType: 'working',
    },
    completed: {
      id: 'mx-c',
      setNumber: 2,
      targetWeightKg: 100,
      actualWeightKg: 100,
      targetReps: 8,
      actualReps: 8,
      targetRir: 2,
      actualRir: 2,
      completed: true,
      setType: 'working',
    },
    failure: {
      id: 'mx-f',
      setNumber: 3,
      targetWeightKg: 100,
      targetReps: 8,
      targetRir: 0,
      completed: false,
      setType: 'working',
    },
    unilateral: {
      id: 'mx-l',
      setNumber: 1,
      targetWeightKg: 26,
      targetReps: 10,
      actualRepsLeft: 10,
      actualRepsRight: 9,
      targetRir: 2,
      completed: true,
      setType: 'working',
    },
  });

  const dummyStickyRef = useRef<HTMLDivElement>(null);
  const dummyMeasureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRuntimeMode(window.location.protocol === 'file:' ? 'file' : 'http');
    const style = getComputedStyle(document.documentElement);
    const computed: Record<string, string> = {};
    for (const grp of parsedTokens.semanticGroups) {
      for (const tok of grp.tokens) {
        const val = style.getPropertyValue(tok.name).trim();
        if (val) computed[tok.name] = rgbToHex(val);
      }
    }
    for (const p of parsedTokens.primitives) {
      const val = style.getPropertyValue(p.name).trim();
      if (val) computed[p.name] = rgbToHex(val);
    }
    setLiveComputedVars(computed);
  }, [parsedTokens]);

  const balancedWithFindingsReport = useMemo(
    () => ({
      ...fixtures.movementReport,
      imbalances: [
        {
          id: 'chin-ratio',
          kind: 'pull-vs-push' as const,
          message: 'Vertical pulling sits below Poliquin’s 81% close-grip bench structural target.',
          advice: 'Keep Chin-up / Pulldown progressions equal priority with pressing over this block.',
          weaker: 'Vertical Pull' as const,
          stronger: 'Horizontal Push' as const,
        },
      ],
      sideDifferences: [
        {
          exerciseId: 'ex-db-bulgarian-split-squat',
          exerciseName: 'Bulgarian split squat',
          weakerSide: 'left' as const,
          symmetryPct: 86,
          sessions: 2,
          lastLoggedOn: fixtures.today,
        },
      ],
    }),
    [fixtures]
  );

  const stageScaleStyle = useMemo(
    () =>
      ({
        '--ds-phone-max': `${previewWidth}px`,
      }) as React.CSSProperties,
    [previewWidth]
  );

  const handleUpdateSquatSet = (setId: string, updated: Partial<WorkoutSet>) => {
    setInteractiveSquat((prev) => ({
      ...prev,
      sets: prev.sets.map((s) => (s.id === setId ? { ...s, ...updated } : s)),
    }));
  };

  const handleCompleteSquatSet = (setId: string) => {
    setInteractiveSquat((prev) => ({
      ...prev,
      sets: prev.sets.map((s) =>
        s.id === setId
          ? {
              ...s,
              completed: !s.completed,
              actualWeightKg: s.actualWeightKg ?? s.targetWeightKg,
              actualReps: s.actualReps ?? s.targetReps,
              actualRir: s.actualRir ?? s.targetRir ?? 2,
            }
          : s
      ),
    }));
  };

  const handleAddSquatSet = (isWarmup = false) => {
    setInteractiveSquat((prev) => {
      const workingCount = prev.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup').length;
      const lastWorking = [...prev.sets].reverse().find((s) => !s.isWarmup);
      return {
        ...prev,
        sets: [
          ...prev.sets,
          {
            id: `ds-added-${Date.now()}`,
            setNumber: isWarmup ? 1 : workingCount + 1,
            targetWeightKg: isWarmup ? Math.round((lastWorking?.targetWeightKg ?? 80) * 0.6) : lastWorking?.targetWeightKg ?? 92.5,
            targetReps: isWarmup ? 5 : lastWorking?.targetReps ?? 8,
            targetRir: isWarmup ? 3 : lastWorking?.targetRir ?? 2,
            completed: false,
            isWarmup,
            setType: isWarmup ? 'warmup' : 'working',
          },
        ],
      };
    });
  };

  const syncModeBadge =
    runtimeMode === 'http'
      ? { label: 'Live HMR Sync Active', color: 'var(--color-status-positive)', bg: 'var(--color-status-positive-soft)' }
      : runtimeMode === 'file'
      ? { label: 'Standalone File (Live tokens.css)', color: 'var(--color-status-neutral)', bg: 'var(--color-bg-surface-control)' }
      : { label: 'Snapshot + Live Source', color: 'var(--color-status-neutral)', bg: 'var(--color-bg-surface-control)' };

  return (
    <div
      className="wk min-h-screen overflow-x-clip"
      style={{
        background: 'var(--color-bg-canvas)',
        color: 'var(--color-text-primary)',
        paddingBottom: '96px',
      }}
    >
      {/* Top Sticky Control & Jump Bar */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{
          background: 'rgba(19, 24, 28, 0.92)',
          borderColor: 'var(--color-border-subtle)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                  color: 'var(--color-coach-surface)',
                }}
              >
                Treise<span style={{ color: 'var(--color-coach-accent)' }}>.</span>
              </span>
              <span className="wk-title">Design system catalog</span>
              <span
                className="wk-pill"
                id="ds-sync-pill"
                style={{ background: syncModeBadge.bg, color: syncModeBadge.color }}
              >
                {syncModeBadge.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Unit switcher */}
              <div
                className="wk-segments inline-grid grid-cols-2"
                role="group"
                aria-label="Preview weight unit"
                style={{ background: 'var(--color-bg-surface)' }}
              >
                {(['kg', 'lb'] as const).map((u) => {
                  const selected = unit === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => onChangeUnit(u)}
                      className={`wk-segment uppercase ${selected ? 'is-active' : ''}`}
                      style={{
                        background: selected ? 'var(--color-action-secondary-bg)' : 'transparent',
                        color: selected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                      }}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>

              {/* Viewport scale switcher */}
              <div
                className="wk-segments inline-grid grid-cols-2"
                role="group"
                aria-label="Preview mobile frame width"
                style={{ background: 'var(--color-bg-surface)' }}
              >
                {(['448', '375'] as const).map((w) => {
                  const selected = previewWidth === w;
                  return (
                    <button
                      key={w}
                      type="button"
                      data-ds-width={w}
                      aria-pressed={selected}
                      onClick={() => setPreviewWidth(w)}
                      className={`wk-segment tabular-nums ${selected ? 'is-active' : ''}`}
                      style={{
                        background: selected ? 'var(--color-action-secondary-bg)' : 'transparent',
                        color: selected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                      }}
                    >
                      {w}px
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            <nav aria-label="Design system sections" className="w-full min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="shrink-0 wk-btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  {s.label}
                </a>
              ))}
            </nav>
            <p className="wk-caption">
              Single source: <code className="text-white/90">src/styles/tokens.css</code> ·{' '}
              <code className="text-white/90">src/index.css</code> ·{' '}
              <code className="text-white/90">src/components/</code>
            </p>
          </div>
        </div>
      </header>

      <main
        className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-12 overflow-x-clip"
        data-ds-scale-root="true"
        style={stageScaleStyle}
      >
        {/* Art Direction & Sync Architecture Banner */}
        <section
          className="wk-card space-y-4"
          aria-label="Art direction and synchronization overview"
          style={{ border: '1px solid var(--color-border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div>
              <span className="wk-label">
                Art Direction · Adjective &amp; Metaphor Filter
              </span>
              <h1 className="wk-title mt-1">
                Precision dark-room telemetry — Crisp · Calm · Authoritative · Tactile
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="wk-pill">4px Implicit Grid</span>
              <span className="wk-pill">Treise Slate</span>
              <span className="wk-pill">Inter 400 / 500 / 600 / 700</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} aria-hidden="true" />
                <span className="wk-title">Direct token link</span>
              </div>
              <p className="wk-body max-w-prose">
                All swatches, surfaces, <code>4px</code> spacing/radii, and component colors read from{' '}
                <code>src/styles/tokens.css</code>. Semantic status boundaries exclude third-party brands and goal-specific hues.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4" style={{ color: 'var(--color-status-neutral)' }} aria-hidden="true" />
                <span className="wk-title">Shared product components</span>
              </div>
              <p className="wk-body max-w-prose">
                This page imports and renders the live React components from <code>src/components/</code> with Vite
                HMR and auto-syncs <code>design-system.html</code> on disk.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4" style={{ color: 'var(--color-status-neutral)' }} aria-hidden="true" />
                <span className="wk-title">Commands</span>
              </div>
              <p className="wk-body max-w-prose">
                Live interactive mode: <code>npm run design-system</code> · Refresh offline HTML snapshot:{' '}
                <code>npm run design-system:sync</code>
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================
            1. COLOR TOKENS (TREISE SLATE) & 4PX SPATIAL SYSTEM
        ================================================================ */}
        <section id="tokens" className="space-y-6 scroll-mt-32">
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              01 · Foundations
            </span>
            <h2 className="wk-title mt-1">Color system (Treise Slate two-tier tokens) &amp; 4px spatial grid</h2>
            <p className="wk-body mt-1 max-w-prose">
              Pruned strictly to surface neutrals and semantic roles: calibrated Mint (<code>#1AE3A0</code>) for achieved progress,
              Info Blue (<code>#8FD3FF</code>) strictly for non-progress telemetry, Amber for caution, and Crimson for failure.
            </p>
          </div>

          <div className="grid gap-6">
            {parsedTokens.semanticGroups.map((group) => (
              <div key={group.group} className="wk-card space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="wk-title">{formatSentenceCase(group.group)}</h3>
                  <span className="wk-pill">{group.tokens.length} tokens</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {group.tokens.map((tok) => {
                    const liveHex = liveComputedVars[tok.name] || tok.resolvedValue;
                    return (
                      <div
                        key={tok.name}
                        className="wk-raised flex items-center gap-3 min-w-0"
                        style={{ border: '1px solid var(--color-border-subtle)' }}
                      >
                        <div
                          className="w-11 h-11 rounded-lg shrink-0"
                          style={{
                            background: `var(${tok.name})`,
                            border: '1px solid var(--color-border-strong)',
                          }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="wk-caption font-medium text-white truncate">{tok.name}</div>
                          <div className="wk-caption tabular-numbers truncate" data-token-hex={tok.name}>
                            {liveHex}
                          </div>
                          {tok.rawValue !== liveHex && (
                            <div className="wk-caption truncate opacity-80">{tok.rawValue}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* 4px Spatial & Concentric Radius Scale */}
            <div className="wk-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="wk-title">4px implicit spatial grid &amp; concentric corner radii</h3>
                  <p className="wk-caption mt-0.5">
                    R_inner = R_outer - padding (e.g. 24px card with 8px offset &rarr; 16px tray &rarr; 12px control &rarr; 8px inset &rarr; 4px badge)
                  </p>
                </div>
                <span className="wk-pill">{parsedTokens.spatialTokens.length} tokens</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {parsedTokens.spatialTokens.map((tok) => (
                  <div
                    key={tok.name}
                    className="wk-raised space-y-1.5 min-w-0"
                    style={{ border: '1px solid var(--color-border-subtle)' }}
                  >
                    <div className="wk-caption font-medium text-white truncate">{tok.name}</div>
                    <div className="wk-title tabular-numbers" style={{ color: 'var(--color-text-primary)' }}>
                      {tok.resolvedValue}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="p-2 border"
                style={{
                  borderRadius: 'var(--radius-card)',
                  background: 'var(--color-bg-canvas)',
                  borderColor: 'var(--color-border-strong)',
                }}
              >
                <div className="wk-caption px-2 py-1">Card · 24px (--radius-card) + 8px padding</div>
                <div
                  className="p-2 border"
                  style={{
                    borderRadius: 'var(--radius-tray)',
                    background: 'var(--color-bg-surface)',
                    borderColor: 'var(--color-border-subtle)',
                  }}
                >
                  <div className="wk-caption px-1 pb-1">Tray · 16px (--radius-tray) + 8px padding</div>
                  <div
                    className="p-2 border flex flex-wrap items-center gap-2"
                    style={{
                      borderRadius: 'var(--radius-inset)',
                      background: 'var(--color-bg-surface-raised)',
                      borderColor: 'var(--color-border-subtle)',
                    }}
                  >
                    <span className="wk-caption">Nested well · 8px (--radius-inset)</span>
                    <span className="wk-pill">12px Control / 4px Badge</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tier 1 Primitive Palette */}
            <div className="wk-card space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="wk-title">Tier 1 core primitives (private ramp)</h3>
                <span className="wk-pill">{parsedTokens.primitives.length} primitives</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {parsedTokens.primitives.map((p) => {
                  const liveHex = liveComputedVars[p.name] || p.resolvedValue;
                  return (
                    <div
                      key={p.name}
                      className="wk-raised space-y-2"
                      style={{ border: '1px solid var(--color-border-subtle)' }}
                    >
                      <div
                        className="w-full h-9 rounded-md"
                        style={{
                          background: `var(${p.name})`,
                          border: '1px solid var(--color-border-strong)',
                        }}
                      />
                      <div className="wk-caption font-medium text-white truncate">{p.name.replace('--palette-', '')}</div>
                      <div className="wk-caption tabular-numbers truncate" data-token-hex={p.name}>
                        {liveHex}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            2. 4-ROLE INTER TYPOGRAPHY SYSTEM
        ================================================================ */}
        <section id="typography" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              02 · Foundations
            </span>
            <h2 className="wk-title mt-1">Apple HIG × Shift Nudge typography: 4 sizes × 4 weights × 3 inks</h2>
            <p className="wk-body mt-1">
              Sole font: <code>Inter</code> across 4 weights (<code>400</code> prose &amp; units, <code>500</code> labels,
              pills, subheads &amp; secondary controls, <code>600</code> card/nav titles &amp; primary actions,{' '}
              <code>700</code> strictly on 32px Large Titles &amp; Hero KPIs). Rigid 4-size ceiling (<code>12 / 16 / 20 / 32px</code>,
              2.67× span) paired with wide 3-ink luminance separation (<code>#FFFFFF</code> 1.00, <code>0.78</code> Secondary,{' '}
              <code>0.60</code> Muted — all &ge; 4.5:1 AA on Slate surfaces) and strict Sentence-case discipline.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 min-w-0">
            {/* Interactive live specimens */}
            <div className="wk-card space-y-6 min-w-0">
              <StageHeader
                title="Canonical 4-size × 4-weight × 3-ink scale"
                source="src/index.css"
                dsId="ds-typography-scale"
              />

              <div className="space-y-5 divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="wk-subhead">
                      Tier 1 · Eyebrows, Micro Titles, Pills &amp; Captions
                    </span>
                    <span className="wk-caption tabular-numbers">12px / 16px · text-xs · 500 / 400</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="wk-label">EST. 1RM · SET · PREV</span>
                    <span className="wk-meta-title">Romanian deadlift · Oct 17 – Nov 15, 2026</span>
                    <span className="wk-pill">Watch</span>
                    <span className="wk-pill">Up next</span>
                    <span className="wk-pill">A1</span>
                  </div>
                  <p className="wk-caption">
                    .wk-label (500 uppercase +0.06em muted) only for 1–3 word eyebrows; .wk-meta-title &amp; .wk-pill stay clean sentence case (500 secondary); .wk-caption units &amp; dates drop to 400 muted.
                  </p>
                </div>

                <div className="pt-4 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="wk-subhead">
                      Tier 2 · Nested Subheads, Prose &amp; Interactive Controls
                    </span>
                    <span className="wk-caption tabular-numbers">16px / 24px · text-base · 600 / 500 / 400</span>
                  </div>
                  <h4 className="wk-subhead">1. Chest supported machine row (.wk-subhead 500 #FFFFFF)</h4>
                  <p className="wk-body">
                    Your best recent set was 100 kg × 8 @ 2 RIR. All prescribed sets hit target with quality reps, so today
                    steps up to 102.5 kg.
                  </p>
                </div>

                <div className="pt-4 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="wk-subhead">
                      Tier 3 · Card Titles, Nav Titles &amp; Tabular KPIs
                    </span>
                    <span className="wk-caption tabular-numbers">20px / 24px · text-xl · 600 #FFFFFF · tabular-nums</span>
                  </div>
                  <div className="space-y-2">
                    <h4 className="wk-h1">Squat strength (.wk-h1 / .wk-title 600)</h4>
                    <div
                      className="relative flex items-center justify-center rounded-lg px-8 py-2"
                      style={{
                        background: 'var(--color-bg-canvas)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <ChevronLeft
                        className="w-4 h-4 absolute left-2.5"
                        style={{ color: 'var(--color-text-secondary)' }}
                        aria-hidden="true"
                      />
                      <h4 className="wk-nav-title">Strength standards (.wk-nav-title)</h4>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-6 pt-1">
                    <span className="wk-number">92.5 kg</span>
                    <span className="wk-number">8 reps</span>
                    <span className="wk-number">4/16</span>
                    <span className="wk-number">00:84</span>
                  </div>
                </div>

                <div className="pt-4 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="wk-subhead">
                      Tier 4 · Top-Level Large Titles &amp; Hero KPIs (700 only here)
                    </span>
                    <span className="wk-caption tabular-numbers">32px / 36px · text-3xl · 700 -0.03em #FFFFFF</span>
                  </div>
                  <div className="wk-page-title pt-1">Workout · Progress</div>
                  <div className="flex flex-wrap items-baseline gap-6 pt-1">
                    <span className="inline-flex items-baseline gap-1">
                      <span className="wk-display leading-none">86</span>
                      <span className="wk-caption">%</span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="wk-display leading-none">14.2</span>
                      <span className="wk-caption">/ 21</span>
                    </span>
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="wk-display leading-none">156.5</span>
                      <span className="wk-caption">kg</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Parsed Rules Table from src/index.css */}
            <div className="wk-card space-y-4 min-w-0">
              <StageHeader
                title="Live .wk-* rules parsed from stylesheet"
                source="src/index.css"
              />
              <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1 min-w-0">
                {typographySpecs.map((spec) => (
                  <div
                    key={spec.selector}
                    className="wk-raised space-y-1.5 min-w-0"
                    style={{ border: '1px solid var(--color-border-subtle)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="wk-caption font-medium text-white break-all">{spec.selector}</code>
                      {spec.declarations['font-size'] && (
                        <code className="wk-caption tabular-numbers shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                          {spec.declarations['font-size']}
                        </code>
                      )}
                    </div>
                    {spec.roleComment && <p className="wk-caption">{spec.roleComment}</p>}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {Object.entries(spec.declarations).map(([k, v]) => (
                        <code
                          key={k}
                          className="wk-caption px-2 py-0.5 rounded break-all"
                          style={{ background: 'var(--color-bg-canvas)' }}
                        >
                          {k}: {v}
                        </code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6-Lever Apple HIG × Shift Nudge Matrix */}
          <div className="wk-card space-y-4 min-w-0">
            <StageHeader
              title="6-Lever Hierarchy Playbook (inside the 4-size ceiling)"
              source="src/styles/tokens.css &amp; src/index.css"
              dsId="ds-typography-levers"
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
              {[
                {
                  lever: '1 · Weight polarity (400 / 500 / 600 / 700)',
                  rule: '700 Bold is locked strictly to 32px Large Titles and Hero KPIs. 600 Semibold anchors 20px card/nav headers, inputs & Primary CTAs. 500 Medium handles list rows (.wk-subhead), secondary buttons, fields, eyebrows, micro titles & pills. 400 Regular keeps prose, units, dates, ticks & inactive tabs airy.',
                },
                {
                  lever: '2 · Ink opacity & WCAG AA contrast',
                  rule: '#FFFFFF (1.00, 13.30:1 card) for titles & hero numbers; rgba 0.78 (8.74:1 card / 7.13:1 raised / 5.67:1 ctrl) for prose, date steppers & pills; rgba 0.60 (5.86:1 card / 4.96:1 raised) for eyebrows, units, dates & inactive controls.',
                },
                {
                  lever: '3 · Case & tracking discipline',
                  rule: 'Sentence case is the default everywhere (titles, goals, Trophy lifts, pills, weekday Sun..Sat, dates Oct 17 – Nov 15, 2026). Uppercase (+0.06em) is strictly quarantined to 1–3 word eyebrows and column headers (.wk-label).',
                },
                {
                  lever: '4 · Navigation vs card differentiation',
                  rule: 'Main tabs anchor top-left at 32px/700 (-0.03em Large Title), separating pages cleanly from centered 20px/600 drill-in DetailHeader (.wk-nav-title) and 20px/600 left card headers (.wk-title).',
                },
                {
                  lever: '5 · Tracking matched to scale',
                  rule: 'Tight display tracking (-0.03em at 32px, -0.02em at 20px, -0.015em on tabular numbers) gives large headlines Apple tight solidity while +0.06em opens small uppercase eyebrows and +0.005em eases 12px captions.',
                },
                {
                  lever: '6 · Saturation restraint',
                  rule: 'Mint (--color-status-positive) and Info Blue (--color-status-info) live strictly in chart strokes, deltas, completion checks & active streaks — never decorative card text or shouting section banners.',
                },
              ].map((item) => (
                <div
                  key={item.lever}
                  className="wk-raised space-y-1.5 min-w-0"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="wk-subhead">{item.lever}</div>
                  <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                    {item.rule}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Product-Wide Card Archetypes & Ink/Weight Governance */}
          <div className="wk-card space-y-4 min-w-0">
            <StageHeader
              title="Card typographic archetypes &amp; baseline rules"
              source="src/engine/knowledgeGraph.ts"
              dsId="ds-card-archetypes"
            />
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
              {[
                {
                  type: 'A · Telemetry / Chart Card',
                  examples: 'ProgressChartCard, MuscleProgressCard',
                  scan: '1) .wk-h1 #FFFFFF + Toggle (500 active / 400 muted) -> 2) .wk-label (12/500 muted) -> 3) .wk-display (32/700) + 12/400 .wk-caption unit -> 4) Delta pill (500) + Date range (.wk-meta-title Oct 17 – Nov 15, 2026) -> 5) TrendChart (400 intermediate / 500 latest) -> 6) .wk-body summary below plot.',
                },
                {
                  type: 'B · KPI Summary / Stat Card',
                  examples: 'OverviewCard, StatRow, WorkoutFinishScreen',
                  scan: '1) .wk-h1/.wk-title #FFFFFF + Chevron -> 2) 3-col StatRow: .wk-label (12/500 muted) or .wk-meta-title (Trophy lifts) -> .wk-number (20/600) or .wk-display (32/700) #FFFFFF + 12/400 .wk-caption unit -> .wk-caption note.',
                },
                {
                  type: 'C · Active Execution Card',
                  examples: 'ExerciseCard, RecoveryScoreCard, ReadinessBanner',
                  scan: '1) .wk-h1 #F5F8FB + >=44px icon controls -> 2) .wk-pill order/status tag (12/500 sentence case) -> 3) 2-line Insight (.wk-body 16/400 secondary) -> 4) Table header (.wk-label 12/500 muted) -> 5) SetRow (20/600 #F5F8FB done vs 0.80 pending vs 0.65 PREV/units).',
                },
                {
                  type: 'D · Structured Breakdown Card',
                  examples: 'StrengthLevelsCard, BalanceCard, KnowledgeGraphCard, Plan phases',
                  scan: '1) .wk-h1 #FFFFFF + optional .wk-pill -> 2) Lead copy (.wk-body 16/400 0.78 — never dimmed to --wk-muted) -> 3) Nested rows use .wk-subhead (16/500 #FFFFFF) + secondary standing -> .wk-caption.',
                },
              ].map((card) => (
                <div
                  key={card.type}
                  className="wk-raised space-y-2 min-w-0"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="wk-subhead">{card.type}</div>
                  <div className="wk-caption">{card.examples}</div>
                  <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                    {card.scan}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================
            3. PRIMITIVES: BUTTONS, BADGES, INPUTS & CONTROLS
        ================================================================ */}
        <section id="primitives" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              03 · Primitives
            </span>
            <h2 className="wk-title mt-1">Buttons, badges, inputs &amp; segmented controls</h2>
            <p className="wk-body mt-1">
              Primary actions use <code>--color-action-primary-bg</code> (
              <span data-token-hex="--color-action-primary-bg">
                {liveComputedVars['--color-action-primary-bg'] || tokenHexByName['--color-action-primary-bg'] || ''}
              </span>
              ) with dark ink; secondary actions use <code>--color-action-secondary-bg</code> (
              <span data-token-hex="--color-action-secondary-bg">
                {liveComputedVars['--color-action-secondary-bg'] || tokenHexByName['--color-action-secondary-bg'] || ''}
              </span>
              ); <code>.wk-pill</code> is reserved exclusively for non-interactive badges.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            {/* Buttons & Badges */}
            <PhoneStage className="space-y-6">
              <StageHeader
                title="Actions &amp; read-only pills"
                source="src/index.css"
                dsId="ds-btn-primary / ds-badge-status"
              />

              <div className="space-y-3">
                <div className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                  Button hierarchy
                </div>
                <button
                  type="button"
                  className="wk-button"
                  style={{
                    background: 'var(--color-action-primary-bg)',
                    color: 'var(--color-action-primary-fg)',
                  }}
                >
                  Finish workout
                </button>
                <button
                  type="button"
                  className="wk-button"
                  style={{
                    background: 'var(--color-action-secondary-bg)',
                    color: 'var(--color-action-secondary-fg)',
                  }}
                >
                  Train anyway
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" className="wk-btn-secondary min-h-[44px]">
                    Swap exercise
                  </button>
                  <button
                    type="button"
                    className="wk-btn-secondary min-h-[44px]"
                    style={{
                      background: 'var(--color-action-destructive-bg)',
                      color: 'var(--color-action-destructive-fg)',
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    Delete session
                  </button>
                </div>
                <button
                  type="button"
                  disabled
                  className="wk-button cursor-not-allowed"
                  style={{
                    background: 'var(--color-action-disabled-bg)',
                    color: 'var(--color-action-disabled-fg)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  Disabled primary action
                </button>
              </div>

              <div className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <div className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                  Informational badges (.wk-pill — non-interactive only)
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="wk-pill">Watch</span>
                  <span className="wk-pill">A1</span>
                  <span
                    className="wk-pill"
                    style={{
                      background: 'var(--color-status-positive-soft)',
                      color: 'var(--color-status-positive)',
                    }}
                  >
                    Balanced
                  </span>
                  <span
                    className="wk-pill"
                    style={{
                      background: 'var(--color-status-warning-soft)',
                      color: 'var(--color-status-warning)',
                    }}
                  >
                    Amber Shield
                  </span>
                  <span
                    className="wk-pill"
                    style={{
                      background: 'var(--color-status-danger-soft)',
                      color: 'var(--color-status-danger-fg)',
                    }}
                  >
                    Failure
                  </span>
                  <span
                    className="wk-pill"
                    style={{
                      background: 'var(--color-status-info-soft)',
                      color: 'var(--color-status-info)',
                    }}
                  >
                    Strain 13.4
                  </span>
                  <span className="wk-pill" style={{ color: 'var(--color-text-primary)' }}>
                    <Flame className="w-3.5 h-3.5 mr-1 fill-current" aria-hidden="true" />
                    9d
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <div className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                  Inputs &amp; progress bar
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="wk-label text-center mb-1">WEIGHT</div>
                    <input
                      type="number"
                      defaultValue={92.5}
                      step={2.5}
                      aria-label="Sample weight input"
                      className="wk-input"
                    />
                  </div>
                  <div>
                    <div className="wk-label text-center mb-1">REPS</div>
                    <input type="number" defaultValue={8} aria-label="Sample reps input" className="wk-input" />
                  </div>
                  <div>
                    <div className="wk-label text-center mb-1">RIR</div>
                    <input type="number" defaultValue={2} aria-label="Sample RIR input" className="wk-input" />
                  </div>
                </div>
                <input
                  type="text"
                  defaultValue="Barbell Romanian Deadlift"
                  aria-label="Sample text field"
                  className="wk-field"
                />
                <div className="flex flex-col gap-2">
                  <span className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                    Exercise notes (.wk-textarea)
                  </span>
                  <textarea
                    rows={2}
                    defaultValue="Keep elbows 45° and pause 1s on chest."
                    aria-label="Sample exercise notes textarea"
                    className="wk-textarea resize-none"
                  />
                </div>
                <div className="wk-bar" role="progressbar" aria-valuenow={62} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: '62%' }} />
                </div>
              </div>
            </PhoneStage>

            {/* Interactive Controls: TimelineToggle & GoalPhaseSwitcher */}
            <PhoneStage className="space-y-6">
              <StageHeader
                title="Timeline &amp; Goal Phase Controls"
                source="src/components/.../TimelineToggle &amp; GoalPhaseSwitcher"
                dsId="ds-btn-segmented"
                description="Shift Nudge dark-mode elevation: --color-bg-surface on canvas, stepping up to --color-bg-surface-raised inside cards so trays never punch a dark pit."
              />

              <div className="space-y-2">
                <div className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                  TimelineToggle · Canvas surface (--color-bg-surface)
                </div>
                <TimelineToggle value={timeline} onChange={setTimeline} />
              </div>

              <div className="space-y-2">
                <div className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                  TimelineToggle · Nested in card (--color-bg-surface-raised)
                </div>
                <div className="wk-card space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="wk-title">Bodyweight</span>
                    <TimelineToggle value={timeline} onChange={setTimeline} variant="header" />
                  </div>
                  <TimelineToggle value={timeline} onChange={setTimeline} compact />
                </div>
              </div>

              <GoalPhaseSwitcher currentPhase={goalPhase} onSelectPhase={setGoalPhase} />

              <div className="wk-card space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                    Interactive state polarity
                  </div>
                  <span className="wk-pill">Pending · Focused · Done</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div
                    className="rounded-lg p-3 text-center space-y-1 border"
                    style={{ background: 'var(--color-bg-surface-raised)', borderColor: 'var(--color-border-subtle)' }}
                  >
                    <div className="wk-caption">Pending editable</div>
                    <div className="text-base font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      100 × 8
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-3 text-center space-y-1 border-2"
                    style={{ background: 'var(--color-bg-surface-raised)', borderColor: 'var(--color-border-focus)' }}
                  >
                    <div className="wk-caption">Focused input</div>
                    <div className="text-base font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      100 × 8
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-3 text-center space-y-1 border"
                    style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border-accent)' }}
                  >
                    <div className="wk-caption" style={{ color: 'var(--color-status-positive)' }}>
                      Done · Read-only
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-base font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                        100 × 8
                      </span>
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded"
                        style={{ background: 'var(--color-status-positive)', color: 'var(--color-text-on-accent)' }}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </PhoneStage>
          </div>
        </section>

        {/* ================================================================
            4. NAVIGATION & APP CHROME
        ================================================================ */}
        <section id="chrome" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              04 · Chrome &amp; Navigation
            </span>
            <h2 className="wk-title mt-1">App headers, week strip, bottom dock &amp; toast</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <PhoneStage className="space-y-6">
              <StageHeader
                title="Header &amp; DetailHeader"
                source="src/components/common/Header.tsx"
              />
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <Header profile={fixtures.profile} onOpenAuth={() => setShowToast(true)} />
              </div>

              <div className="rounded-2xl px-4 pb-3 border" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <DetailHeader title="Strength standards" onBack={() => setShowToast(true)} />
              </div>

              <StageHeader
                title="WorkoutPageHeader (7-day streak strip &amp; menu)"
                source="src/components/train/WorkoutPageHeader.tsx"
              />
              <div className="rounded-2xl px-4 pb-4 border" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <WorkoutPageHeader
                  title="Workout"
                  days={fixtures.weekStripDays}
                  selectedDate={fixtures.today}
                  onSelectDay={() => undefined}
                  renderMenu={(close) => (
                    <div
                      role="menu"
                      className="w-56 rounded-2xl bg-surface-card border border-white/[0.08] shadow-2xl p-2 space-y-1 text-left"
                    >
                      <button
                        type="button"
                        onClick={close}
                        className="w-full text-left px-3 py-2 rounded-xl wk-caption font-semibold text-white hover:bg-white/[0.06] flex items-center gap-2 min-h-[44px]"
                      >
                        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                        <span>Show / hide workout widgets</span>
                      </button>
                    </div>
                  )}
                />
              </div>
            </PhoneStage>

            <PhoneStage className="space-y-6">
              <StageHeader
                title="NavigationBar + Detached AI coach Pill"
                source="src/components/common/NavigationBar.tsx"
                dsId="ds-ai-coach-navigation-rule"
                description="Matched h-16 rounded-full pill curvature with unified 20×20 geometric T + copper AI spark icon and visible 'AI coach' label on the shared tab baseline."
              />
              <div
                className="relative rounded-2xl overflow-hidden border"
                style={{
                  height: 112,
                  transform: 'translateZ(0)',
                  background: 'var(--color-bg-canvas)',
                  borderColor: 'var(--color-border-subtle)',
                }}
              >
                <NavigationBar
                  activeTab={activeNavTab}
                  onTabChange={setActiveNavTab}
                  onOpenAICoach={() => setOpenModal('coach')}
                />
              </div>

              <StageHeader
                title="Toast Notification"
                source="src/components/common/Toast.tsx"
              />
              <div className="p-2 rounded-2xl border" style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-bg-canvas)' }}>
                <Toast
                  inline
                  subtitle="PERSONAL BEST · SQUAT"
                  message="New estimated 1RM: 126.7 kg on Barbell back squat"
                  onDismiss={() => undefined}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowToast(true)}
                className="wk-btn-secondary w-full min-h-[44px]"
              >
                Trigger live floating Toast
              </button>
            </PhoneStage>
          </div>
        </section>

        {/* ================================================================
            5. ONBOARDING & LOCATION SETUP SCREENS
        ================================================================ */}
        <section id="onboarding" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              05 · Onboarding Flow
            </span>
            <h2 className="wk-title mt-1">3-step onboarding, habit framing &amp; location setup</h2>
            <p className="wk-body mt-1 max-w-prose">
              Rendered from the live <code>OnboardingModal</code> component using lean progressive disclosure across Step 1 (Identity + Goal), Step 2 (24 sessions + Weekly rhythm &amp; optional habit anchor),
              Step 3 (Restarting + Place, conditional Home gear &amp; Experience), and the returning athlete &quot;Where you train&quot; editor.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <PhoneStage className="space-y-5">
              <StageHeader
                title="Step 1 of 3 · Identity &amp; goal"
                source="src/components/onboarding/OnboardingModal.tsx"
                dsId="ds-onboarding-flow"
                description="Value-first identity framing paired with one essential goal decision, Skip action, Continue CTA, and demo launcher."
              />
              <div className="rounded-[var(--radius-card)] overflow-hidden border" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <OnboardingModal
                  inline
                  initialStep={1}
                  profile={fixtures.onboardingNewProfile}
                  onCompleteOnboarding={() => setShowToast(true)}
                  onExploreDemo={() => setShowToast(true)}
                  onClose={() => undefined}
                />
              </div>

              <StageHeader
                title="Step 2 of 3 · 24 sessions &amp; weekly rhythm"
                source="src/components/onboarding/OnboardingModal.tsx"
                description="6-week consistency science paired with cadence choice and collapsed-by-default optional habit anchor."
              />
              <div className="rounded-[var(--radius-card)] overflow-hidden border" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <OnboardingModal
                  inline
                  initialStep={2}
                  profile={fixtures.onboardingNewProfile}
                  onCompleteOnboarding={() => setShowToast(true)}
                  onClose={() => undefined}
                />
              </div>
            </PhoneStage>

            <PhoneStage className="space-y-5">
              <StageHeader
                title="Step 3 of 3 · Place, experience &amp; launch"
                source="src/components/onboarding/OnboardingModal.tsx"
                description="Lean setup with conditional Home gear (revealed only when Home is selected), experience calibration, collapsed fine-tune drawer, and ready-to-launch summary."
              />
              <div className="rounded-[var(--radius-card)] overflow-hidden border" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <OnboardingModal
                  inline
                  initialStep={3}
                  profile={fixtures.onboardingNewProfile}
                  onCompleteOnboarding={() => setShowToast(true)}
                  onClose={() => undefined}
                />
              </div>

              <StageHeader
                title="Returning athlete · Where you train"
                source="src/components/onboarding/OnboardingModal.tsx"
                description="Quick location and home-equipment editor launched later from Settings or Workout menu."
              />
              <div className="rounded-[var(--radius-card)] overflow-hidden border" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <OnboardingModal
                  inline
                  initialStep={3}
                  profile={fixtures.onboardingReturningProfile}
                  onCompleteOnboarding={() => setShowToast(true)}
                  onClose={() => setShowToast(true)}
                />
              </div>

              <button
                type="button"
                onClick={() => setOpenModal('onboarding')}
                className="wk-button w-full"
                style={{
                  background: 'var(--color-action-primary-bg)',
                  color: 'var(--color-action-primary-fg)',
                }}
              >
                Open live onboarding flow
              </button>
            </PhoneStage>
          </div>
        </section>

        {/* ================================================================
            6. WORKOUT LOGGING COMPONENTS
        ================================================================ */}
        <section id="workout" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              06 · Workout Tab Components
            </span>
            <h2 className="wk-title mt-1">Session cards, interactive set table, recovery &amp; completion</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            {/* Left Column: Session Cards + SetRow States + Recovery + Active Day */}
            <PhoneStage className="space-y-5">
              <StageHeader
                title="ProgramProgressCard (Phase &amp; link to Program)"
                source="src/components/train/ProgramProgressCard.tsx"
              />
              <ProgramProgressCard
                title="Phase 1"
                description="Two weeks to learn each lift: 3 sets per exercise, stopping about 3 reps short of failure."
                onOpen={() => undefined}
              />

              <StageHeader
                title="CurrentSessionCard (Workout set progress)"
                source="src/components/train/ProgramProgressCard.tsx"
              />
              <CurrentSessionCard
                sessionLabel="Full body A"
                current={6}
                total={16}
              />

              <StageHeader
                title="StickySessionHeader (Docked bar)"
                source="src/components/train/ProgramProgressCard.tsx"
              />
              <div
                className="relative rounded-2xl overflow-hidden border"
                style={
                  {
                    height: 82,
                    transform: 'translateZ(0)',
                    borderColor: 'var(--color-border-subtle)',
                    '--dock-active': 1,
                    '--dock-pe': 'auto',
                    '--dock-t': 1,
                  } as React.CSSProperties
                }
              >
                <StickySessionHeader
                  sessionLabel="Full body A"
                  current={6}
                  total={16}
                  docked
                  headerRef={dummyStickyRef}
                  measureRef={dummyMeasureRef}
                />
              </div>

              <StageHeader
                title="SetRow State Matrix (>= 48px targets, solid Mint completion + read-only completed cells)"
                source="src/components/train/SetRow.tsx"
                dsId="ds-set-toggle / ds-input-numeric"
                description="Active sets display raised editable inputs; completed sets fill the Done CTA in solid Mint (#1AE3A0) and flatten Weight, Reps, and RIR to read-only text on the card background until unchecked."
              />
              <div className="wk-card space-y-2">
                <div
                  className="grid items-center wk-label"
                  style={{ gridTemplateColumns: SET_TABLE_COLUMNS, gap: SET_TABLE_GAP, color: 'var(--color-text-secondary)' }}
                >
                  <span className="text-center">SET</span>
                  <span className="text-center">PREV</span>
                  <span className="text-center">WEIGHT</span>
                  <span className="text-center">REPS</span>
                  <span className="text-center">RIR</span>
                  <span className="text-center">DONE</span>
                </div>
                <div className="flex flex-col" style={{ gap: SET_TABLE_GAP }}>
                  <SetRow
                    set={matrixSets.warmup}
                    displayBadge="W"
                    onUpdate={(u) => setMatrixSets((p) => ({ ...p, warmup: { ...p.warmup, ...u } }))}
                    onComplete={() => undefined}
                  />
                  <SetRow
                    set={matrixSets.upcoming}
                    displayBadge="1"
                    previous={{ weightKg: 97.5, reps: 8 }}
                    onUpdate={(u) => setMatrixSets((p) => ({ ...p, upcoming: { ...p.upcoming, ...u } }))}
                    onComplete={() => undefined}
                  />
                  <SetRow
                    set={matrixSets.completed}
                    displayBadge="2"
                    previous={{ weightKg: 97.5, reps: 8 }}
                    onUpdate={(u) => setMatrixSets((p) => ({ ...p, completed: { ...p.completed, ...u } }))}
                    onComplete={() => undefined}
                  />
                  <SetRow
                    set={matrixSets.failure}
                    displayBadge="F"
                    previous={{ weightKg: 100, reps: 7 }}
                    onUpdate={(u) => setMatrixSets((p) => ({ ...p, failure: { ...p.failure, ...u } }))}
                    onComplete={() => undefined}
                  />
                  <SetRow
                    set={matrixSets.unilateral}
                    displayBadge="1"
                    isDumbbell
                    perSide
                    onUpdate={(u) => setMatrixSets((p) => ({ ...p, unilateral: { ...p.unilateral, ...u } }))}
                    onComplete={() => undefined}
                  />
                </div>
              </div>

              <StageHeader
                title="RecoveryScoreCard (Green / Amber / Red) &amp; ReadinessBanner"
                source="src/components/train/RecoveryScoreCard.tsx"
              />
              <RecoveryScoreCard
                readiness={fixtures.greenReadiness}
                latestBiometrics={fixtures.latestBio}
                isConnected
                onOpen={() => undefined}
              />
              <RecoveryScoreCard
                readiness={fixtures.amberReadiness}
                latestBiometrics={fixtures.amberBio}
                isConnected
                onOpen={() => undefined}
              />
              <RecoveryScoreCard
                readiness={fixtures.lowReadiness}
                latestBiometrics={fixtures.lowBio}
                isConnected
                onOpen={() => undefined}
              />
              <ReadinessBanner
                readiness={fixtures.greenReadiness}
                latestBiometrics={fixtures.latestBio}
                isConnected
                mesoWeek={2}
              />

              <StageHeader
                title="ActiveDayCard (Non-training cardio day)"
                source="src/components/train/ActiveDayCard.tsx"
              />
              <ActiveDayCard
                thisWeek={fixtures.activitiesRecent[0]}
                recent={fixtures.activitiesRecent}
                onLog={() => undefined}
                onOpenApps={() => undefined}
              />
            </PhoneStage>

            {/* Right Column: Interactive ExerciseCard + 0-point Example Card + Finished Workout Cards */}
            <PhoneStage className="space-y-5">
              <StageHeader
                title="ExerciseCard (Live interactive card + progressive chart)"
                source="src/components/train/ExerciseCard.tsx"
                dsId="ds-card-biometric"
              />
              <ExerciseCard
                exerciseIndex={1}
                totalExercises={4}
                exercise={interactiveSquat}
                exerciseDef={fixtures.exerciseCatalog.find((d) => d.id === interactiveSquat.exerciseId)}
                workouts={fixtures.workouts}
                prescription={fixtures.prescription}
                quest={fixtures.quest}
                readinessState={'Normal' as ReadinessState}
                muscleLabel="Quads"
                previousSets={[
                  { weightKg: 90, reps: 8 },
                  { weightKg: 90, reps: 8 },
                  { weightKg: 90, reps: 8 },
                ]}
                insight={fixtures.squatInsight}
                onUpdateSet={handleUpdateSquatSet}
                onCompleteSet={handleCompleteSquatSet}
                onAddSet={handleAddSquatSet}
                onOpenDetail={() => setOpenModal('exercise-detail')}
                onOpenSwap={() => setOpenModal('swap')}
                onOpenPlateCalc={() => setOpenModal('plates')}
              />

              <StageHeader
                title="ExerciseCard (No history · Empty chart)"
                source="src/components/train/ExerciseCard.tsx"
              />
              <ExerciseCard
                exerciseIndex={2}
                totalExercises={4}
                exercise={fixtures.emptyHistoryExercise}
                exerciseDef={fixtures.exerciseCatalog.find((d) => d.id === fixtures.emptyHistoryExercise.exerciseId)}
                workouts={[]}
                prescription={fixtures.prescription}
                quest={fixtures.quest}
                readinessState={'Normal' as ReadinessState}
                muscleLabel="Triceps"
                insight={fixtures.emptyInsight}
                onUpdateSet={() => undefined}
                onCompleteSet={() => undefined}
                onAddSet={() => undefined}
              />

              <StageHeader
                title="FinishedWorkoutCards (Summary, Whoop Strain &amp; Completed Exercise)"
                source="src/components/train/FinishedWorkoutCards.tsx"
              />
              {fixtures.finishReport && (
                <FinishedWorkoutSummaryCard finish={fixtures.finishReport} />
              )}
              <WhoopStrainCard
                workoutStrain={13.4}
                dayStrain={15.2}
                avgHr={138}
                maxHr={171}
                hasLiveConnection
              />
              {fixtures.completedSummaries[0] && (
                <CompletedExerciseCard summary={fixtures.completedSummaries[0]} />
              )}
            </PhoneStage>
          </div>
        </section>

        {/* ================================================================
            7. TELEMETRY, CHARTS & PROGRESS COMPONENTS
        ================================================================ */}
        <section id="progress" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              07 · Progress &amp; Telemetry
            </span>
            <h2 className="wk-title mt-1">Gauges, TrendChart variants, Strength Standards &amp; Knowledge Graph</h2>
          </div>

          {/* Gauges Row */}
          <div className="wk-card space-y-4">
            <StageHeader
              title="BiometricCircularGauge (4 semantic variants)"
              source="src/components/common/BiometricCircularGauge.tsx"
              description="Positive Mint for readiness/recovery; Info Blue strictly for non-progress telemetry (strain, sleep); Amber for caution; Crimson for overreaching danger."
            />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 justify-items-center">
              <BiometricCircularGauge value={84} label="Recovery" unit="%" variant="positive" size="sm" />
              <BiometricCircularGauge value={13.4} max={21} label="Strain" variant="info" size="sm" />
              <BiometricCircularGauge value={7.8} max={10} label="Sleep" unit="h" variant="info" size="sm" />
              <BiometricCircularGauge value={48} label="Caution" unit="%" variant="amber" size="sm" />
              <BiometricCircularGauge value={24} label="Alert" unit="%" variant="danger" size="sm" />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <PhoneStage className="space-y-5">
              <StageHeader
                title="GoalsHero, OverviewCard, StatRow, Sparkline &amp; StandardsRadar"
                source="src/components/analytics/ProgressOverviewCards.tsx"
              />
              <GoalsHero
                rings={fixtures.goalRings}
                summary={fixtures.goalsSummary}
                goals={fixtures.goals}
                cardSummaries={fixtures.goalCardSummaries}
                onOpenGoal={() => undefined}
              />

              <OverviewCard title="Workouts" opens="training totals" onOpen={() => undefined}>
                <StatRow
                  stats={[
                    { label: 'Workouts', value: String(fixtures.workouts.length), note: '4 this week' },
                    { label: 'Duration', value: '46', unit: 'min', note: 'avg session' },
                    { label: 'Personal bests', value: String(fixtures.personalBests.length), note: 'all-time lifts' },
                  ]}
                />
              </OverviewCard>

              <OverviewCard title="Strength &amp; bodyweight" opens="trend sparkline" onOpen={() => undefined}>
                <div className="flex items-center justify-between gap-3 mt-3">
                  <div>
                    <div className="wk-number">
                      {fixtures.fmt.weightPrecise?.(fixtures.bodyweightKg) ?? fixtures.fmt.weight(fixtures.bodyweightKg)}
                    </div>
                    <div className="wk-caption">7-day EMA bodyweight</div>
                  </div>
                  {fixtures.compCharts[0] && (
                    <Sparkline
                      points={fixtures.compCharts[0].points.slice(-10)}
                      label="Bodyweight trend sparkline"
                    />
                  )}
                </div>
              </OverviewCard>

              <div className="wk-card flex flex-col items-center">
                <StandardsRadar report={fixtures.movementReport} />
              </div>

              <StageHeader
                title="CompositionCard (Overlaid Weight, Body Fat % &amp; Lean Mass + AI Insight)"
                source="src/components/analytics/CompositionCard.tsx"
              />
              <CompositionCard
                biometrics={fixtures.biometrics.map((b, i) => ({
                  ...b,
                  bodyFatPct: Number((18.4 - i * 0.04).toFixed(1)),
                }))}
                goalPhase={fixtures.profile.goalPhase}
                onOpenLog={() => undefined}
              />

              <StageHeader
                title="StrengthLevelsCard &amp; BalanceCard (Imbalance findings + Balanced)"
                source="src/components/analytics/StrengthLevelsCard.tsx &amp; BalanceCard.tsx"
                description="Shift Nudge hierarchy: Mint overall standing pill, elevated inset radar telemetry stage, structured .wk-raised movement tiles, bounded Engine tile, and collapsed methodology drawer."
              />
              <StrengthLevelsCard report={fixtures.movementReport} latestBiometrics={fixtures.latestBio} />
              <BalanceCard report={balancedWithFindingsReport} />
              <BalanceCard report={fixtures.movementReport} />
            </PhoneStage>

            <PhoneStage className="space-y-5">
              <StageHeader
                title="ProgressChartCard (Positive Mint vs Info Blue Telemetry)"
                source="src/components/analytics/ProgressChartCard.tsx"
              />
              {fixtures.strengthCharts[0] && (
                <ProgressChartCard
                  chart={fixtures.strengthCharts[0]}
                  timeline={timeline}
                  onTimelineChange={setTimeline}
                />
              )}
              {fixtures.whoopCharts[3] && (
                <ProgressChartCard
                  chart={{
                    ...fixtures.whoopCharts[3],
                    chartTone: 'biometric',
                    supportsTypicalRange: true,
                    higherIsBetter: true,
                  }}
                  timeline={timeline}
                  onTimelineChange={setTimeline}
                />
              )}

              <StageHeader
                title="TrendChart State Variants (1 point vs 0 points)"
                source="src/components/common/TrendChart.tsx"
              />
              <div className="wk-card space-y-5">
                <div>
                  <div className="wk-caption mb-2">1 logged session (shows real starting point, no invented line)</div>
                  <TrendChart
                    points={[{ date: fixtures.today, value: 85 }]}
                    format={(v) => fixtures.fmt.weight(v)}
                    height={180}
                    label="Single data point example"
                  />
                </div>
                <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <div className="wk-caption mb-2">0 logged sessions (empty chart state)</div>
                  <TrendChart
                    points={[]}
                    format={(v) => fixtures.fmt.weight(v)}
                    height={180}
                    emptyTitle="No data yet"
                    emptyMessage="Log this exercise to establish your starting point."
                    label="Empty chart state"
                  />
                </div>
              </div>

              {fixtures.muscleProgressSample && (
                <>
                  <StageHeader
                    title="MuscleProgressCard (Stimulus bars + strength index)"
                    source="src/components/analytics/MuscleProgressCard.tsx"
                  />
                  <MuscleProgressCard
                    progress={fixtures.muscleProgressSample}
                    formatLength={fixtures.fmt.length}
                    timeline={timeline}
                  />
                </>
              )}

              <StageHeader
                title="KnowledgeGraphCard (Recovery &amp; Body Insights)"
                source="src/components/analytics/KnowledgeGraphCard.tsx"
              />
              <KnowledgeGraphCard
                workouts={fixtures.workouts}
                biometrics={fixtures.biometrics}
                exerciseCatalog={fixtures.exerciseCatalog}
                profile={fixtures.profile}
                weeklyVolume={fixtures.weeklyVolume}
              />
            </PhoneStage>
          </div>
        </section>

        {/* ================================================================
            8. AI COACH & CHAT EXPERIENCE
        ================================================================ */}
        <section id="coach" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              08 · AI Coach &amp; Chat
            </span>
            <h2 className="wk-title mt-1">Treise sheet, structured reply cards &amp; composer</h2>
            <p className="wk-body mt-1">
              Rendered from the live <code>AICoachChatModal</code> component across opening, multi-turn confirmation/diff,
              scientific rationale, and streaming status states.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <PhoneStage className="space-y-6">
              <StageHeader
                title="Opening Sheet &amp; Quick Prompt Chips"
                source="src/components/assistant/AICoachChatModal.tsx"
                dsId="ds-ai-coach-sheet"
                description="Editorial headline prompt before conversation starts, single-row 44px quick chips, and pill composer."
              />
              <AICoachChatModal
                embedded
                profile={fixtures.profile}
                activeWorkout={fixtures.activeWorkout}
                workouts={fixtures.workouts}
                biometrics={fixtures.biometrics}
                exerciseCatalog={fixtures.exerciseCatalog}
                bodyweightEmaKg={fixtures.bodyweightKg}
                readinessState={'Primed' as ReadinessState}
                weeklyVolume={fixtures.weeklyVolume}
                activities={fixtures.activitiesRecent}
                place={{ tab: 'train' }}
                onClose={() => setShowToast(true)}
                onApplyAction={() => setShowToast(true)}
                onNavigateTab={() => undefined}
              />

              <StageHeader
                title="Streaming Status, Scroll Pill &amp; Active Composer"
                source="src/components/assistant/AICoachChatModal.tsx"
                description="Typing indicator dots with inferred tool status, floating New message jump pill, and active Send button."
              />
              <AICoachChatModal
                embedded
                embeddedHeight={460}
                initialMessages={fixtures.coachStreamingMessages}
                initialPendingStatus="Updating workout…"
                initialShowNewMsgPill
                initialInputValue="How heavy for my first working set?"
                profile={fixtures.profile}
                activeWorkout={fixtures.activeWorkout}
                workouts={fixtures.workouts}
                biometrics={fixtures.biometrics}
                exerciseCatalog={fixtures.exerciseCatalog}
                bodyweightEmaKg={fixtures.bodyweightKg}
                readinessState={'Primed' as ReadinessState}
                weeklyVolume={fixtures.weeklyVolume}
                activities={fixtures.activitiesRecent}
                place={{ tab: 'train' }}
                onClose={() => setShowToast(true)}
                onApplyAction={() => setShowToast(true)}
              />
            </PhoneStage>

            <PhoneStage className="space-y-6">
              <StageHeader
                title="Rich Conversation: Memory, Citations, Diff &amp; Confirmation"
                source="src/components/assistant/AICoachChatModal.tsx"
                dsId="ds-ai-coach-sheet"
                description="User bubble, Saved to Athlete Memory pill, Scientific Rationale card, OOUX diff receipt with Undo, amber Confirmation card, and follow-up chips."
              />
              <AICoachChatModal
                embedded
                initialMessages={fixtures.coachRichMessages}
                profile={fixtures.profile}
                activeWorkout={fixtures.activeWorkout}
                workouts={fixtures.workouts}
                biometrics={fixtures.biometrics}
                exerciseCatalog={fixtures.exerciseCatalog}
                bodyweightEmaKg={fixtures.bodyweightKg}
                readinessState={'Primed' as ReadinessState}
                weeklyVolume={fixtures.weeklyVolume}
                activities={fixtures.activitiesRecent}
                place={{ tab: 'train' }}
                onClose={() => setShowToast(true)}
                onApplyAction={() => setShowToast(true)}
                onUndoAction={() => setShowToast(true)}
                onNavigateTab={() => undefined}
                onViewAllEquipment={() => undefined}
              />
              <button
                type="button"
                onClick={() => setOpenModal('coach')}
                className="wk-button w-full min-h-[44px]"
                style={{
                  background: 'var(--color-action-primary-bg)',
                  color: 'var(--color-action-primary-fg)',
                }}
              >
                Open Live AI Coach Overlay
              </button>
            </PhoneStage>
          </div>
        </section>

        {/* ================================================================
            9. KNOWLEDGE GRAPH & AI OBJECT CONTEXT
        ================================================================ */}
        <section id="ai-context" className="space-y-6 scroll-mt-32">
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              09 · Information Experience, Knowledge Graph &amp; AI Object Context
            </span>
            <h2 className="wk-title mt-1">
              Information Strategy (Ontology) → Information Design (Semiotics) &amp; AI Grounding
            </h2>
            <p className="wk-body mt-1 max-w-prose">
              Single architectural contract shared by Treise screens,{' '}
              <code>contentStrategy.ts</code>, <code>coachContextEnvelope.ts</code>,{' '}
              <code>knowledgeGraph.ts</code>, and <code>coachTools.ts</code>.
            </p>
          </div>

          {/* 9A. Information Strategy (Ontology): Objects vs Concepts, Controlled Vocabulary & Taxonomy */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent-primary)' }} aria-hidden="true" />
                <h3 className="wk-title">09A · Information Strategy (Ontology: Concepts, Objects &amp; Vocabulary)</h3>
              </div>
              <span className="wk-pill">ds-info-experience</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Objects vs Concepts */}
              <div className="wk-card space-y-3 min-w-0" style={{ border: '1px solid var(--color-border-subtle)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="wk-label" style={{ color: 'var(--color-accent-primary)' }}>
                      Ontology
                    </span>
                    <h4 className="wk-title mt-1">Concepts → Object Instances</h4>
                  </div>
                  <span className="wk-pill">{fixtures.coreConcepts.length} concepts</span>
                </div>
                <p className="wk-caption max-w-prose">
                  Concepts organize mental models and navigation; Objects are data-backed instances stored and acted upon.
                </p>
                <ul className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  {fixtures.coreConcepts.map((c) => (
                    <li key={c.concept} className="wk-raised space-y-1">
                      <div className="wk-subhead">{c.concept}</div>
                      <div className="wk-caption" style={{ color: 'var(--color-text-muted)' }}>
                        {c.navigationSurface}
                      </div>
                      <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                        Instances: {c.objectInstances.join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Controlled Vocabulary */}
              <div className="wk-card space-y-3 min-w-0" style={{ border: '1px solid var(--color-border-subtle)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="wk-label" style={{ color: 'var(--color-status-info)' }}>
                      Definitions
                    </span>
                    <h4 className="wk-title mt-1">Controlled Vocabulary</h4>
                  </div>
                  <span className="wk-pill">Single Source</span>
                </div>
                <p className="wk-caption max-w-prose">
                  Canonical nouns and action labels enforced across Onboarding, Workout, Progress, and AI Coach replies.
                </p>
                <div className="space-y-2 pt-2 border-t wk-caption" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <div>
                    <span className="wk-label block mb-1">Locations</span>
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {fixtures.controlledVocabulary.locations.gym.label} · {fixtures.controlledVocabulary.locations.home.label} · {fixtures.controlledVocabulary.locations.travel.label}
                    </span>
                  </div>
                  <div>
                    <span className="wk-label block mb-1">Scheduled Day Instances</span>
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {fixtures.controlledVocabulary.dayInstances.workout} · {fixtures.controlledVocabulary.dayInstances.activeDay} · {fixtures.controlledVocabulary.dayInstances.restDay}
                    </span>
                  </div>
                  <div>
                    <span className="wk-label block mb-1">Canonical Actions</span>
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {fixtures.controlledVocabulary.actions.swapExercise} · {fixtures.controlledVocabulary.actions.logActiveDay} · {fixtures.controlledVocabulary.actions.finishWorkout}
                    </span>
                  </div>
                  <div className="pt-1 border-t" style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-status-warning)' }}>
                    Retired drift: {fixtures.controlledVocabulary.deprecatedTerms.join(', ')}
                  </div>
                </div>
              </div>

              {/* Progress Taxonomy */}
              <div className="wk-card space-y-3 min-w-0" style={{ border: '1px solid var(--color-border-subtle)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="wk-label" style={{ color: 'var(--color-status-positive)' }}>
                      Taxonomy
                    </span>
                    <h4 className="wk-title mt-1">Progress IA Grouping</h4>
                  </div>
                  <span className="wk-pill">{fixtures.iaProgressTaxonomy.length} groups</span>
                </div>
                <p className="wk-caption max-w-prose">
                  Separates Training insights (Knowledge Graph &amp; Exercise notes timeline) from Strength standards so mental models match destinations.
                </p>
                <ul className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  {fixtures.iaProgressTaxonomy.map((grp) => (
                    <li key={grp.id} className="wk-raised space-y-1">
                      <div className="wk-subhead">{grp.label}</div>
                      <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                        {grp.description}
                      </p>
                      <div className="wk-caption tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                        Widgets: {grp.widgetIds.join(', ')}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 9B. Information Design (Semiotics): Pragmatics Matrix, Semantics & Choreography */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 shrink-0" style={{ color: 'var(--color-status-positive)' }} aria-hidden="true" />
                <h3 className="wk-title">09B · Information Design (Semiotics: Pragmatics, Semantics &amp; Choreography)</h3>
              </div>
              <span className="wk-pill">{fixtures.pragmaticVisibilityMatrix.length} contexts</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fixtures.pragmaticVisibilityMatrix.map((ctx) => (
                <article
                  key={ctx.mode}
                  className="wk-card space-y-2 min-w-0"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <span className="wk-label" style={{ color: 'var(--color-status-info)' }}>
                    Pragmatics · {ctx.mode}
                  </span>
                  <h4 className="wk-title">{ctx.label}</h4>
                  <div className="wk-caption" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="font-semibold">Shown:</span> {ctx.shownSurfaces.join(' · ')}
                  </div>
                  <div className="wk-caption" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="font-semibold">Suppressed:</span> {ctx.suppressedSurfaces.join(' · ')}
                  </div>
                  <p className="wk-caption pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
                    {ctx.semioticNote}
                  </p>
                </article>
              ))}
            </div>
          </div>

          {/* 9C. COPE Ontology + All OOUX Domain Schemas & Mutation Boundary */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 shrink-0" style={{ color: 'var(--color-status-neutral)' }} aria-hidden="true" />
                <h3 className="wk-title">OOUX Domain Objects, Relationships &amp; Write Boundaries</h3>
              </div>
              <span className="wk-pill">ds-ai-ooux-context</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* COPE Domain + Physiological Relationships */}
              <div
                className="wk-card space-y-3 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="wk-label">
                      COPE Ontology
                    </span>
                    <h4 className="wk-title mt-1">Core &amp; Physiological Graph</h4>
                  </div>
                  <span className="wk-pill">Read-Only</span>
                </div>
                <p className="wk-caption max-w-prose">
                  Entities and cardinalities shared across screens and prompt projections (<code>contentStrategy.ts</code>).
                </p>
                <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <div className="wk-label">Core Domain</div>
                  <ul className="space-y-1">
                    {fixtures.copeDomainRelationships.map((rel) => (
                      <li key={`${rel.from}-${rel.to}`} className="flex items-center justify-between gap-2 wk-caption">
                        <code style={{ color: 'var(--color-text-primary)' }}>
                          {rel.from} → {rel.to}
                        </code>
                        <span style={{ color: 'var(--color-text-muted)' }}>{rel.cardinality}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <div className="wk-label">Physiological Layer</div>
                  <ul className="space-y-1">
                    {fixtures.copePhysiologicalRelationships.map((rel) => (
                      <li key={`${rel.from}-${rel.to}`} className="flex items-center justify-between gap-2 wk-caption">
                        <code style={{ color: 'var(--color-text-primary)' }}>
                          {rel.from} → {rel.to}
                        </code>
                        <span style={{ color: 'var(--color-text-muted)' }}>{rel.cardinality}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Dynamic OOUX_OBJECT_SCHEMAS cards */}
              {(
                Object.entries(fixtures.oouxSchemas) as Array<
                  [
                    'Athlete' | 'Program' | 'Workout' | 'Exercise' | 'Goal' | 'ActiveDay' | 'ExerciseNote',
                    (typeof fixtures.oouxSchemas)['Athlete'],
                  ]
                >
              ).map(([objectName, schema]) => {
                const boundary = OOUX_MUTATION_RULES[objectName];
                const requiredSet = new Set<string>(schema.required as readonly string[]);
                const propertyKeys = Object.keys(schema.properties);
                return (
                  <article
                    key={objectName}
                    className="wk-card space-y-3 min-w-0"
                    style={{ border: '1px solid var(--color-border-subtle)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="wk-label" style={{ color: 'var(--color-accent-primary)' }}>
                          OOUX Object
                        </span>
                        <h4 className="wk-title mt-1">{objectName}</h4>
                      </div>
                      <span className="wk-pill">{requiredSet.size} req fields</span>
                    </div>

                    <div className="wk-caption leading-relaxed break-words">
                      <span style={{ color: 'var(--color-text-muted)' }}>Schema keys (* required): </span>
                      {propertyKeys.map((prop, idx) => (
                        <React.Fragment key={prop}>
                          <code
                            style={{
                              color: requiredSet.has(prop)
                                ? 'var(--color-text-primary)'
                                : 'var(--color-text-muted)',
                            }}
                          >
                            {prop}
                            {requiredSet.has(prop) ? '*' : ''}
                          </code>
                          {idx < propertyKeys.length - 1 ? ', ' : ''}
                        </React.Fragment>
                      ))}
                    </div>

                    <div
                      className="wk-raised space-y-2 min-w-0"
                      style={{ border: '1px solid var(--color-border-subtle)' }}
                    >
                      <div className="wk-caption break-words">
                        <span className="font-semibold text-white">AI Mutable ({boundary.mutableVia}): </span>
                        {boundary.mutableFields}
                      </div>
                      <div className="wk-caption break-words" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="font-semibold">Read-Only Source: </span>
                        {boundary.readOnlyFields}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* 8B. Live Knowledge Graph Entities & Derived Contraindications */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent-primary)' }} aria-hidden="true" />
                <h3 className="wk-title">Live Knowledge Graph Nodes, Edges &amp; Contraindications</h3>
              </div>
              <span className="wk-pill">
                {fixtures.kgGraph.nodes.length} nodes · {fixtures.aiEnvelope.semantic_memory.knowledge_graph_edges.length} edges
              </span>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div
                className="wk-card space-y-3 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="wk-title">AthleteKnowledgeGraph Nodes &amp; Causal Edges</h4>
                  <span className="wk-pill">src/engine/knowledgeGraph.ts</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {fixtures.kgGraph.nodes.slice(0, 6).map((node) => (
                    <div
                      key={node.id}
                      className="wk-raised space-y-1 min-w-0"
                      style={{ border: '1px solid var(--color-border-subtle)' }}
                    >
                      <div className="wk-label">
                        {node.category}
                      </div>
                      <div className="wk-body font-semibold text-white break-words">{node.label}</div>
                      {node.score !== undefined && (
                        <div className="wk-caption tabular-nums">Score {node.score}/100</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <div className="wk-label">Active System Edges ({fixtures.kgGraph.edges.length})</div>
                  <div className="space-y-2">
                    {fixtures.kgGraph.edges.slice(0, 6).map((edge) => (
                      <div
                        key={edge.id}
                        className="flex flex-wrap items-center justify-between gap-2 wk-caption wk-raised"
                        style={{ border: '1px solid var(--color-border-subtle)' }}
                      >
                        <span className="break-words text-white">
                          <code>{edge.source}</code> — <code>{edge.relation}</code> → <code>{edge.target}</code>
                        </span>
                        <span className="wk-pill">{edge.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="wk-card space-y-3 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="wk-title">Derived Contraindications &amp; Athlete Memories</h4>
                  <span className="wk-pill">deriveContraindicationEdges</span>
                </div>
                <p className="wk-caption max-w-prose">
                  Durable memory nodes across 6 categories (<code>injury</code>, <code>contraindication</code>,{' '}
                  <code>preference</code>, <code>equipment</code>, <code>goal_note</code>, <code>schedule</code>) automatically
                  compile into exercise-level avoid/caution graph edges alongside overloaded joint strain scores.
                </p>

                <div className="space-y-2">
                  <div className="wk-label">Saved Memories ({fixtures.aiEnvelope.semantic_memory.saved_memories.length})</div>
                  {fixtures.aiEnvelope.semantic_memory.saved_memories.map((mem) => (
                    <div
                      key={mem.id}
                      className="wk-raised flex flex-wrap items-start justify-between gap-2 min-w-0"
                      style={{ border: '1px solid var(--color-border-subtle)' }}
                    >
                      <span className="wk-body text-white break-words max-w-prose">{mem.value}</span>
                      <span className="wk-pill">{mem.category}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <div className="wk-label">
                    Derived Exercise Edges ({fixtures.aiEnvelope.working_state.athlete.contraindications.length})
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {fixtures.aiEnvelope.working_state.athlete.contraindications.slice(0, 6).map((edge) => (
                      <div
                        key={`${edge.relation}-${edge.to_exercise_id}`}
                        className="wk-raised flex flex-wrap items-center justify-between gap-2 min-w-0"
                        style={{
                          border: `1px solid ${
                            edge.severity === 'avoid' ? 'var(--color-status-danger)' : 'var(--color-status-warning)'
                          }`,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="wk-body font-semibold text-white break-words">{edge.to_exercise_name}</div>
                          <div className="wk-caption break-words">{edge.reason}</div>
                        </div>
                        <span
                          className="wk-pill"
                          style={{
                            color:
                              edge.severity === 'avoid' ? 'var(--color-status-danger)' : 'var(--color-status-warning)',
                          }}
                        >
                          {edge.relation} · {edge.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 8C. 3-Tier ContextEnvelope & Live Grounded Prompt Inspector */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="wk-title">3-Tier ContextEnvelope &amp; Verbatim Model Grounding</h3>
              <span className="wk-pill">schema_version {fixtures.aiEnvelope.schema_version}</span>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div
                className="wk-card space-y-2 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-label">
                    Tier 1 · Working State
                  </span>
                  <span className="wk-pill">{fixtures.aiEnvelope.working_state.app_route}</span>
                </div>
                <div className="wk-body text-white font-semibold">
                  {fixtures.aiEnvelope.working_state.program.name} ·{' '}
                  <span className="tabular-nums">
                    Wk {fixtures.aiEnvelope.working_state.program.current_week}/
                    {fixtures.aiEnvelope.working_state.program.total_weeks}
                  </span>
                </div>
                <div className="wk-caption tabular-nums">
                  Completion: {fixtures.aiEnvelope.working_state.program.completion_pct}% (
                  {fixtures.aiEnvelope.working_state.program.completed_workouts}/
                  {fixtures.aiEnvelope.working_state.program.total_workouts}) · Readiness:{' '}
                  {fixtures.aiEnvelope.working_state.today_workout?.readiness_state ?? 'Normal'}
                </div>
                <div className="wk-caption tabular-nums">
                  Active exercises: {fixtures.aiEnvelope.working_state.today_workout?.exercises.length ?? 0} · Goals tracked:{' '}
                  {fixtures.aiEnvelope.working_state.goals.length}
                </div>
              </div>

              <div
                className="wk-card space-y-2 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-label" style={{ color: 'var(--color-status-positive)' }}>
                    Tier 2 · Episodic Memory
                  </span>
                  <span className="wk-pill tabular-nums">
                    {fixtures.aiEnvelope.episodic_memory.adherence_streak_days}d streak
                  </span>
                </div>
                <div className="wk-body text-white font-semibold tabular-nums">
                  Recent Sessions: {fixtures.aiEnvelope.episodic_memory.recent_workouts.length} · PRs:{' '}
                  {fixtures.aiEnvelope.episodic_memory.recent_prs.length}
                </div>
                <div className="wk-caption">
                  Latest session:{' '}
                  {fixtures.aiEnvelope.episodic_memory.recent_workouts[0]
                    ? `${fixtures.aiEnvelope.episodic_memory.recent_workouts[0].date} ${fixtures.aiEnvelope.episodic_memory.recent_workouts[0].name}`
                    : 'none'}
                </div>
                <div className="wk-caption tabular-nums">
                  Stalled lifts (&ge; 3 flat sessions): {fixtures.aiEnvelope.episodic_memory.stalled_lifts.length}
                </div>
              </div>

              <div
                className="wk-card space-y-2 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-label">
                    Tier 3 · Semantic Memory
                  </span>
                  <span className="wk-pill tabular-nums">
                    {fixtures.aiEnvelope.semantic_memory.knowledge_graph_edges.length} KG edges
                  </span>
                </div>
                <div className="wk-body text-white font-semibold tabular-nums">
                  Goal: {fixtures.aiEnvelope.semantic_memory.athlete_attributes.identity_goal} · Unit:{' '}
                  {fixtures.aiEnvelope.semantic_memory.athlete_attributes.weight_unit}
                </div>
                <div className="wk-caption tabular-nums">
                  E1RM map keys: {Object.keys(fixtures.aiEnvelope.semantic_memory.athlete_attributes.training_maxes_kg).length}{' '}
                  lifts · Saved notes: {fixtures.aiEnvelope.semantic_memory.saved_memories.length}
                </div>
                <div className="wk-caption tabular-nums">
                  EMA bodyweight:{' '}
                  {fixtures.aiEnvelope.semantic_memory.athlete_attributes.bodyweight_kg !== null
                    ? (fixtures.fmt.weightPrecise?.(fixtures.aiEnvelope.semantic_memory.athlete_attributes.bodyweight_kg) ??
                        fixtures.fmt.weight(fixtures.aiEnvelope.semantic_memory.athlete_attributes.bodyweight_kg))
                    : 'Not weighed in'}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div
                className="wk-card space-y-2 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="wk-title">serializeContextEnvelopeForPrompt()</h4>
                  <span className="wk-pill">Compact Prompt Facts</span>
                </div>
                <pre
                  className="wk-raised wk-caption whitespace-pre-wrap break-words font-sans m-0 min-w-0"
                  style={{ border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}
                >
                  {fixtures.serializedEnvelope}
                </pre>
              </div>

              <div
                className="wk-card space-y-2 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="wk-title">buildCoachSystemPrompt() (~180 tok budget)</h4>
                  <span className="wk-pill">Voice + Today Plan + KG</span>
                </div>
                <pre
                  className="wk-raised wk-caption whitespace-pre-wrap break-words font-sans m-0 min-w-0 max-h-60 overflow-y-auto"
                  style={{ border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}
                >
                  {fixtures.coachSystemPromptSample}
                </pre>
              </div>
            </div>
          </div>

          {/* 8D. Tool Declarations, Mutation Guardrails & CoachPlace Entry Matrix */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 shrink-0" style={{ color: 'var(--color-status-neutral)' }} aria-hidden="true" />
                <h3 className="wk-title">Declared AI Tools (COACH_TOOL_DECLARATIONS), Guardrails &amp; CoachPlace Routing</h3>
              </div>
              <span className="wk-pill">ds-ai-tool-grounding</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {fixtures.toolDeclarations.map((tool) => {
                const reqParams = new Set<string>(tool.parameters.required ?? []);
                const paramNames = Object.keys(tool.parameters.properties ?? {});
                const isDestructive = tool.name === 'reset_program';
                return (
                  <article
                    key={tool.name}
                    className="wk-card space-y-3 min-w-0"
                    style={{ border: '1px solid var(--color-border-subtle)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="wk-body font-semibold text-white">{tool.name}</code>
                      <span
                        className="wk-pill"
                        style={{
                          color: isDestructive ? 'var(--color-status-warning)' : 'var(--color-status-positive)',
                        }}
                      >
                        {isDestructive ? 'Confirm Gate' : 'Undo Ready'}
                      </span>
                    </div>
                    <p className="wk-caption max-w-prose">{tool.description}</p>
                    <div
                      className="wk-caption leading-relaxed break-words pt-2 border-t"
                      style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-muted)' }}
                    >
                      Params (* required):{' '}
                      {paramNames.map((param, idx) => (
                        <React.Fragment key={param}>
                          <code
                            style={{
                              color: reqParams.has(param)
                                ? 'var(--color-text-primary)'
                                : 'var(--color-text-muted)',
                            }}
                          >
                            {param}
                            {reqParams.has(param) ? '*' : ''}
                          </code>
                          {idx < paramNames.length - 1 ? ', ' : ''}
                        </React.Fragment>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <div className="space-y-4 min-w-0">
                <div
                  className="wk-card space-y-3 min-w-0"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="wk-title">Deterministic Mutation &amp; Intent Guardrails</h4>
                    <span className="wk-pill">coachTools.ts</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {AI_MUTATION_GUARDRAILS.map((g) => (
                      <div
                        key={g.title}
                        className="wk-raised space-y-1 min-w-0"
                        style={{ border: '1px solid var(--color-border-subtle)' }}
                      >
                        <div className="wk-label" style={{ color: g.tone }}>
                          {g.title}
                        </div>
                        <p className="wk-caption break-words">{g.rule}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="wk-card space-y-3 min-w-0"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="wk-title">Runtime Routing &amp; Fallback Hierarchy</h4>
                    <span className="wk-pill">Stateless Proxy</span>
                  </div>
                  <div className="space-y-2">
                    {AI_RUNTIME_PIPELINE.map((stage) => (
                      <div
                        key={stage.step}
                        className="wk-raised space-y-1 min-w-0"
                        style={{ border: '1px solid var(--color-border-subtle)' }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="wk-label">
                            {stage.step}
                          </span>
                          <code className="wk-caption" style={{ color: 'var(--color-text-muted)' }}>
                            {stage.module}
                          </code>
                        </div>
                        <p className="wk-caption break-words">{stage.rule}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="wk-card space-y-3 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="wk-title">Contextual CoachPlace Opening Matrix</h4>
                  <span className="wk-pill">buildCoachOpening()</span>
                </div>
                <div className="space-y-2">
                  {fixtures.openingContexts.map((item) => (
                    <div
                      key={item.routeLabel}
                      className="wk-raised space-y-2 min-w-0"
                      style={{ border: '1px solid var(--color-border-subtle)' }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="wk-label">
                          {item.routeLabel}
                        </span>
                        <span className="wk-pill">{item.opening.id}</span>
                      </div>
                      <p className="wk-caption text-white break-words">{item.opening.line}</p>
                      <div className="flex flex-wrap gap-1">
                        {item.opening.hooks.map((hook) => (
                          <span key={hook.label} className="wk-pill">
                            {hook.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 8E. Safety Circuit-Breaker & 5-Surface AI Quality Gates */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: 'var(--color-status-danger)' }} aria-hidden="true" />
                <h3 className="wk-title">Safety Circuit-Breaker &amp; 5-Surface Quality Gates</h3>
              </div>
              <span className="wk-pill">Zero Invented Numbers</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div
                className="wk-card space-y-2 min-w-0"
                style={{ border: '1px solid var(--color-status-danger)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-label" style={{ color: 'var(--color-status-danger)' }}>
                    Hard-Stop Safety Gate · Urgent Medical
                  </span>
                  <span className="wk-pill">buildSafetyResponse()</span>
                </div>
                <p className="wk-caption break-words">{fixtures.safetyResponses.urgent}</p>
              </div>

              <div
                className="wk-card space-y-2 min-w-0"
                style={{ border: '1px solid var(--color-status-warning)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-label" style={{ color: 'var(--color-status-warning)' }}>
                    Hard-Stop Safety Gate · Acute Joint Pain
                  </span>
                  <span className="wk-pill">Bypasses LLM</span>
                </div>
                <p className="wk-caption break-words whitespace-pre-line">{fixtures.safetyResponses.jointPain}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {AI_SURFACE_QUALITY_GATES.map((gate) => (
                <article
                  key={gate.surface}
                  className="wk-card space-y-3 min-w-0"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="wk-label" style={{ color: 'var(--color-status-positive)' }}>
                        {gate.validator}
                      </span>
                      <h4 className="wk-title mt-1">{gate.surface}</h4>
                    </div>
                    <span className="wk-pill">QA + Retry</span>
                  </div>
                  <div className="wk-caption break-words">
                    <code>{gate.source}</code>
                  </div>
                  <ul className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                    {gate.checks.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-2 wk-caption text-white/85 min-w-0">
                        <Check
                          className="w-4 h-4 shrink-0"
                          style={{ color: 'var(--color-status-positive)' }}
                          aria-hidden="true"
                        />
                        <span className="break-words">{c}</span>
                      </li>
                    ))}
                  </ul>
                  <div
                    className="wk-raised wk-caption break-words"
                    style={{ border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}
                  >
                    <span className="font-semibold">Retry &amp; Fallback: </span>
                    {gate.retryAndFallback}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================
            10. INTERACTIVE MODALS LAUNCHER
        ================================================================ */}
        <section id="modals" className="space-y-6 scroll-mt-32" style={stageScaleStyle}>
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              10 · Overlays &amp; Utility Modals
            </span>
            <h2 className="wk-title mt-1">Interactive workout &amp; coach modals</h2>
            <p className="wk-body mt-1">
              Click any card below (in Vite live mode via <code>npm run design-system</code>) to open the real{' '}
              <code>role=&quot;dialog&quot;</code> overlay component.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="wk-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="wk-title">RestTimerModal</h3>
                <span className="wk-pill">ds-modal-dialog</span>
              </div>
              <p className="wk-body">Wall-clock countdown timer between sets with +15s / pause controls.</p>
              <button type="button" onClick={() => setOpenModal('rest')} className="wk-btn-secondary w-full min-h-[44px]">
                Open Rest Timer
              </button>
            </div>

            <div className="wk-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="wk-title">PlateCalculatorModal</h3>
                <span className="wk-pill">Barbell plates</span>
              </div>
              <p className="wk-body">Barbell plate breakdown per side respecting selected kg / lb unit system.</p>
              <button
                type="button"
                onClick={() => setOpenModal('plates')}
                className="wk-btn-secondary w-full min-h-[44px]"
              >
                Open Plate Calculator
              </button>
            </div>

            <div className="wk-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="wk-title">ExerciseDetailModal</h3>
                <span className="wk-pill">ds-exercise-detail-tabs</span>
              </div>
              <p className="wk-body">Canonical 3-tab exercise view (Overview, Form, History) shared from Workout, Progress, Past Workouts &amp; Split Editor.</p>
              <button type="button" onClick={() => setOpenModal('exercise-detail')} className="wk-btn-secondary w-full min-h-[44px]">
                Open Exercise Detail
              </button>
            </div>

            <div className="wk-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="wk-title">ExerciseSwapModal</h3>
                <span className="wk-pill">E1RM Translate</span>
              </div>
              <p className="wk-body">Biomechanical replacement alternatives with load translation across equipment.</p>
              <button type="button" onClick={() => setOpenModal('swap')} className="wk-btn-secondary w-full min-h-[44px]">
                Open Exercise Swap
              </button>
            </div>

            <div className="wk-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="wk-title">AICoachChatModal</h3>
                <span className="wk-pill">ds-ai-coach-sheet</span>
              </div>
              <p className="wk-body">Invoked Treise chat sheet anchored cleanly to the detached bottom dock entry.</p>
              <button type="button" onClick={() => setOpenModal('coach')} className="wk-btn-secondary w-full min-h-[44px]">
                Open AI Coach
              </button>
            </div>

            <div className="wk-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="wk-title">OnboardingModal</h3>
                <span className="wk-pill">ds-onboarding-flow</span>
              </div>
              <p className="wk-body">Opaque 3-step onboarding overlay and returning athlete location &amp; gear editor.</p>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setOpenModal('onboarding')} className="wk-btn-secondary w-full min-h-[44px]">
                  Open onboarding
                </button>
                <button type="button" onClick={() => setOpenModal('onboarding-edit')} className="wk-btn-secondary w-full min-h-[44px]">
                  Open place editor
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            11. CODIFIED DESIGN SYSTEM REGISTRY (TREISE_DESIGN_SYSTEM)
        ================================================================ */}
        <section id="specs" className="space-y-6 scroll-mt-32">
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="wk-label">
              11 · Architectural Governance
            </span>
            <h2 className="wk-title mt-1">
              Shift Nudge 3-Layer Translation &amp; Knowledge Graph Registry ({TREISE_DESIGN_SYSTEM.length} components)
            </h2>
            <p className="wk-body mt-1 max-w-prose">
              Optical heuristics, exact CSS/token specifications, diagnostic refactoring triggers, and authoritative component contracts from <code>src/engine/knowledgeGraph.ts</code>.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {THREE_LAYER_SPECS.map((item) => (
              <div
                key={item.pillar}
                className="wk-card space-y-2.5 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="wk-title">{item.pillar}</h3>
                  <span className="wk-pill">3-Layer Rule</span>
                </div>
                <p className="wk-body max-w-prose">
                  <strong className="text-white font-semibold">Visual Heuristic: </strong>
                  {item.heuristic}
                </p>
                <p className="wk-caption max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
                  <strong className="text-white font-semibold">Token / CSS Spec: </strong>
                  {item.spec}
                </p>
                <p className="wk-caption max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
                  <strong className="font-semibold">Diagnostic Trigger (Smell → Fix): </strong>
                  {item.trigger}
                </p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {TREISE_DESIGN_SYSTEM.map((spec) => (
              <article
                key={spec.id}
                className="wk-card space-y-3 min-w-0"
                style={{ border: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="wk-label" style={{ color: 'var(--color-accent-primary)' }}>
                      {spec.category}
                    </span>
                    <h3 className="wk-title mt-0.5">{formatSentenceCase(spec.name)}</h3>
                  </div>
                  <span className="wk-pill">{spec.id}</span>
                </div>

                <p className="wk-body">{spec.rationale}</p>

                <ul className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  {spec.logic.rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-2 wk-caption text-white/85">
                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-accent-primary)' }} aria-hidden="true" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>

                <div
                  className="wk-raised space-y-1"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="wk-caption">
                    <span className="font-semibold text-white">Touch Target: </span>
                    {spec.anatomy.touchTarget}
                  </div>
                  <div className="wk-caption">
                    <span className="font-semibold text-white">Accessibility: </span>
                    {spec.logic.accessibility}
                  </div>
                  <div className="wk-caption break-words">
                    <span className="font-semibold text-white">Tokens: </span>
                    <code>{spec.tailwindTokens}</code>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {/* Live Toast Preview Overlay */}
      {showToast && (
        <Toast
          subtitle="PERSONAL BEST · SQUAT"
          message="Toast preview triggered from the live Design System showcase."
          onDismiss={() => setShowToast(false)}
        />
      )}

      {/* Live Modals */}
      {openModal === 'rest' && (
        <RestTimerModal
          initialSeconds={90}
          context={{
            exerciseName: fixtures.squatExercise.name,
            nextLabel: `Set 3 of 4 · ${fixtures.fmt.weight(92.5)} × 8 · 2 RIR`,
            restReason: 'Compound squat pattern recovery',
          }}
          onDismiss={() => setOpenModal(null)}
        />
      )}
      {openModal === 'plates' && (
        <PlateCalculatorModal
          initialWeightKg={92.5}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'exercise-detail' && (
        <ExerciseDetailModal
          exercise={interactiveSquat}
          exerciseDef={fixtures.exerciseCatalog.find((d) => d.id === interactiveSquat.exerciseId)}
          workouts={fixtures.workouts}
          biometrics={fixtures.biometrics}
          insight={fixtures.squatInsight}
          bodyweightKg={fixtures.bodyweightKg}
          muscleLabel="Quads"
          prescription={fixtures.prescription}
          readinessState={'Normal' as ReadinessState}
          onAddSet={handleAddSquatSet}
          onOpenSwap={() => setOpenModal('swap')}
          onOpenPlateCalc={() => setOpenModal('plates')}
          onAskCoach={() => setOpenModal('coach')}
          onClose={() => setOpenModal(null)}
        />
      )}

      {openModal === 'swap' && (
        <ExerciseSwapModal
          currentExercise={fixtures.squatExercise}
          exerciseCatalog={fixtures.exerciseCatalog}
          bodyweightEmaKg={fixtures.bodyweightKg}
          activeLocation="gym"
          onConfirmSwap={() => setOpenModal(null)}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'coach' && (
        <AICoachChatModal
          profile={fixtures.profile}
          activeWorkout={fixtures.activeWorkout}
          workouts={fixtures.workouts}
          biometrics={fixtures.biometrics}
          exerciseCatalog={fixtures.exerciseCatalog}
          bodyweightEmaKg={fixtures.bodyweightKg}
          readinessState={'Primed' as ReadinessState}
          weeklyVolume={fixtures.weeklyVolume}
          activities={fixtures.activitiesRecent}
          place={{ tab: 'train' }}
          onClose={() => setOpenModal(null)}
          onApplyAction={() => setShowToast(true)}
          onUndoAction={() => setShowToast(true)}
          onNavigateTab={() => setOpenModal(null)}
          onViewAllEquipment={() => setOpenModal(null)}
        />
      )}
      {openModal === 'onboarding' && (
        <OnboardingModal
          initialStep={1}
          profile={fixtures.onboardingNewProfile}
          onCompleteOnboarding={() => {
            setOpenModal(null);
            setShowToast(true);
          }}
          onExploreDemo={() => {
            setOpenModal(null);
            setShowToast(true);
          }}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'onboarding-edit' && (
        <OnboardingModal
          initialStep={3}
          profile={fixtures.onboardingReturningProfile}
          onCompleteOnboarding={() => {
            setOpenModal(null);
            setShowToast(true);
          }}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
};

export const DesignSystemApp: React.FC = () => {
  const [unit, setUnit] = useState<WeightUnit>('kg');
  return (
    <UnitsProvider unit={unit}>
      <DesignSystemContent unit={unit} onChangeUnit={setUnit} />
    </UnitsProvider>
  );
};
