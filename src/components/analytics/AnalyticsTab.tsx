import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Scale, Ruler, ChevronRight, MoreHorizontal, SlidersHorizontal, Sparkles, Target } from 'lucide-react';
import { PageTopGradient } from '../common/PageTopGradient';
import { CoachPlace } from '../../services/coachContext';
import { BiometricLog, BodyMeasurementSite, ExerciseDefinition, GoalPhase, ProgressWidgetId, ReadinessState, UserProfile, WorkoutSession, isWhoopConfigured } from '../../engine/types';
import { StrengthLevelsCard } from './StrengthLevelsCard';
import { BalanceCard } from './BalanceCard';
import { CoachIntervention, detectCoachInterventions } from '../../services/coachInterventions';
import { buildMovementStandards } from '../../services/movementStandards';
import { standardsAge } from '../../engine/strengthStandards';
import { buildBodyCompositionKnowledgeGraph } from '../../engine/knowledgeGraph';
import { LogModalMode, MeasurementEntry, WeightLogModal } from './WeightLogModal';
import { KnowledgeGraphCard } from './KnowledgeGraphCard';
import { ProgressChartCard } from './ProgressChartCard';
import { MuscleProgressCard } from './MuscleProgressCard';
import { buildMuscleProgress } from '../../services/muscleProgress';
import { buildAthleteKnowledgeGraph } from '../../engine/knowledgeGraph';
import {
  averageRecentSteps,
  buildCompositionCharts,
  buildExerciseProgressChart,
  buildStepsChart,
  buildStrengthCharts,
  buildWhoopCharts,
  buildWhoopSnapshot,
  ChartTimeline,
  DEFAULT_CHART_TIMELINE,
  getTimelineMeta,
  ProgressChart,
  ProgressFormatters,
} from '../../services/progressSeries';
import { TimelineToggle } from './TimelineToggle';
import { stepsOnDate } from '../../services/athleteGoals';
import { BODY_MEASUREMENT_SITES } from '../../services/renphoBluetooth';
import { ActivityLog } from '../../engine/activeDays';
import {
  RECENT_DAYS,
  buildGoalCardSummaries,
  buildGoalRings,
  buildGoalsSummary,
  buildPersonalBests,
  buildTrainingTotals,
  measurementHighlights,
  trophyCase,
} from '../../services/progressOverview';
import { weightPace } from '../../services/progressSeries';
import { parseLocalDate } from '../../utils/date';
import { formatSentenceCase } from '../../utils/typography';
import { DetailHeader, GoalsHero, OverviewCard, Sparkline, StandardsRadar, StatRow } from './ProgressOverviewCards';
import { CompositionCard } from './CompositionCard';
import { GoalDetailScreen } from './GoalDetailScreen';
import { GoalSettingsScreen } from './GoalSettingsScreen';
import { ProgressWidgetsScreen } from './ProgressWidgetsScreen';
import { parseProgressWidgetId, resolveVisibleProgressWidgets, toggleProgressWidget } from '../../services/progressWidgets';
import { alignStrengthAndWeight, strengthIndexSeries } from '../../services/strengthTrend';
import { calculateEmaSeries, hasMeasuredBodyweight, latestBodyweightLog } from '../../engine/ema';
import { triggerHaptic } from '../../utils/haptics';
import '../../services/deviceModels';
import { useUnits } from '../../utils/unitsContext';
import { kgToUnit } from '../../utils/units';
import { ExerciseDetailModal } from '../train/ExerciseDetailModal';
import { buildInspectExerciseSession } from '../../services/exerciseDetails';


const CHART_ID_TO_TAPE_SITE: Partial<Record<string, BodyMeasurementSite>> = {
  neck: 'neck',
  shoulders: 'shoulder',
  chest: 'chest',
  waist: 'waist',
  'waist-to-height': 'waist',
  abdomen: 'abdomen',
  hips: 'hip',
  'bicep-left': 'bicep_left',
  'bicep-right': 'bicep_right',
  'thigh-left': 'thigh_left',
  'thigh-right': 'thigh_right',
  'calf-left': 'calf_left',
  'calf-right': 'calf_right',
};

/** The overview, or one of the screens its cards open. */
type ProgressDetail = 'bests' | 'lifetime' | 'recent' | 'steps' | 'whoop' | 'weight' | 'measurements' | 'insights' | 'standards' | 'goals' | 'widgets';

interface AnalyticsTabProps {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  profile: UserProfile;
  bodyweightEmaKg: number;
  latestBiometrics: BiometricLog;
  exerciseCatalog: ExerciseDefinition[];
  weeklyVolume: Record<string, number>;
  /** Active days (rides, runs…), which count toward the weekly sessions goal. */
  activities?: ActivityLog[];
  /** Saves a change to the athlete's goals. */
  onUpdateProfile: (update: Partial<UserProfile>) => void;
  /** Changes the main goal (Build Muscle, Lose Fat, Stay Lean), which also reshapes the plan. */
  onUpdateGoalPhase: (phase: GoalPhase) => void;
  /** Tells the app which goal or screen is open, so the coach can open with what is on screen. */
  onContextChange?: (context: { goalId?: string; detail?: ProgressDetail }) => void;
  onSaveMeasurements: (entry: MeasurementEntry) => void;
  /** Changes when the "Log Weight" shortcut is used; opens the weigh-in form. */
  openLogWeightRequest?: number;
  onLogWeightRequestHandled?: () => void;
  /** Opens Training insights (e.g. from an exercise card's last session note). */
  openInsightsRequest?: { nonce: number; exerciseId?: string } | null;
  onInsightsRequestHandled?: () => void;
  /** Opens a specific Progress sub-view or goal detail (e.g. from Treise action cards). */
  openDetailRequest?: { detail?: string; goalId?: string; nonce: number } | null;
  onDetailRequestHandled?: () => void;
  /** Latest readiness classification, used for contextual HITL coach interventions. */
  readinessState?: ReadinessState;
  /** Opens Treise coach with a pre-filled HITL adaptation prompt. */
  onOpenCoachIntervention?: (opts: { prompt: string; detail?: ProgressDetail }) => void;
  /** Opens Treise coach in the given Progress context (optional pre-filled prompt). */
  onOpenCoach?: (opts?: { detail?: CoachPlace['detail']; goalId?: string; prompt?: string }) => void;
  /** Directly executes and persists an accepted adaptation suggestion across the entire product. */
  onAcceptIntervention?: (intervention: CoachIntervention) => void;
  /** Dismisses an adaptation suggestion and persists dismissal across the entire product. */
  onDismissIntervention?: (intervention: CoachIntervention) => void;
}

type CompositionView = 'weight' | 'measurements';

const DETAIL_TITLE: Record<ProgressDetail, string> = {
  bests: 'Trophy case',
  lifetime: 'Lifetime stats',
  recent: 'Recent stats',
  steps: 'Steps',
  whoop: 'Whoop metrics',
  weight: 'Body weight',
  measurements: 'Measurements',
  insights: 'Training insights',
  standards: 'Strength standards',
  goals: 'Change goals',
  widgets: 'Customize widgets',
};

/** A lift's name without its kit, for the three-across card: "Barbell Bench Press" → "Bench Press". */
const shortLiftName = (name: string) => name.replace(/\s*\([^)]*\)/g, '').replace(/^(Barbell|Dumbbell|DB|Cable|Machine)\s+/i, '').trim();

const shortDate = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
};

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  workouts,
  biometrics,
  profile,
  bodyweightEmaKg,
  latestBiometrics,
  exerciseCatalog,
  weeklyVolume,
  activities = [],
  onUpdateProfile,
  onUpdateGoalPhase,
  onContextChange,
  onSaveMeasurements,
  openLogWeightRequest = 0,
  onLogWeightRequestHandled,
  openInsightsRequest = null,
  onInsightsRequestHandled,
  openDetailRequest = null,
  onDetailRequestHandled,
  readinessState = 'Normal',
  onOpenCoachIntervention,
  onOpenCoach,
  onAcceptIntervention,
  onDismissIntervention,
}) => {
  const [detail, setDetail] = useState<ProgressDetail | null>(null);
  const [focusedInsightExerciseId, setFocusedInsightExerciseId] = useState<string | undefined>(undefined);
  const [detailTimeline, setDetailTimeline] = useState<ChartTimeline>(DEFAULT_CHART_TIMELINE);
  /** The goal whose detail is open (a ring was tapped). */
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const compositionView: CompositionView = detail === 'measurements' ? 'measurements' : 'weight';
  const [showLogModal, setShowLogModal] = useState(false);
  const [logModalMode, setLogModalMode] = useState<LogModalMode>('weight');
  const [logModalSite, setLogModalSite] = useState<BodyMeasurementSite | undefined>(undefined);
  const [showUnloggedScaleCharts, setShowUnloggedScaleCharts] = useState(false);
  const [showLimbSitesList, setShowLimbSitesList] = useState(false);
  const units = useUnits();
  const latestWeighIn = latestBodyweightLog(biometrics);
  const hasBodyweight = hasMeasuredBodyweight(biometrics);
  const whoopConfigured = isWhoopConfigured(profile);
  const activeWidgets = useMemo(
    () => resolveVisibleProgressWidgets(profile.progressWidgets, profile),
    [profile.progressWidgets, profile.whoopConnected, profile.wearableSource]
  );
  const hasWidget = (id: ProgressWidgetId) => activeWidgets.includes(id);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const fmt: ProgressFormatters = useMemo(
    () => ({
      // Exact values (not rounded to plate steps) so small body changes show.
      weight: (kg) => `${Math.round(kgToUnit(kg, units.unit) * 10) / 10} ${units.unit}`,
      weightPrecise: (kg) => `${Math.round(kgToUnit(kg, units.unit) * 100) / 100} ${units.unit}`,
      length: (cm) => (units.unit === 'lb' ? `${Math.round((cm / 2.54) * 10) / 10} in` : `${Math.round(cm * 10) / 10} cm`),
    }),
    [units]
  );
  const strengthCharts = useMemo(
    () => buildStrengthCharts({ workouts, profile, bodyweightKg: hasBodyweight ? bodyweightEmaKg : 0, biometrics, fmt }),
    [workouts, profile, bodyweightEmaKg, hasBodyweight, biometrics, fmt]
  );
  const movementStandards = useMemo(
    () =>
      buildMovementStandards({
        workouts,
        biometrics,
        bodyweightKg: bodyweightEmaKg,
        gender: profile.gender,
        age: standardsAge(profile),
      }),
    [workouts, biometrics, bodyweightEmaKg, profile]
  );
  const compositionCharts = useMemo(() => buildCompositionCharts({ biometrics, profile, fmt }), [biometrics, profile, fmt]);
  const knowledgeGraph = useMemo(
    () => buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, weeklyVolume, activities),
    [workouts, biometrics, exerciseCatalog, profile, weeklyVolume, activities]
  );
  const coachInterventions = useMemo(
    () =>
      detectCoachInterventions({
        profile,
        workouts,
        biometrics,
        exerciseCatalog,
        bodyweightEmaKg: hasBodyweight ? bodyweightEmaKg : 0,
        readinessState,
        weeklyVolume,
        activities,
        knowledgeGraph,
      }),
    [profile, workouts, biometrics, exerciseCatalog, hasBodyweight, bodyweightEmaKg, readinessState, weeklyVolume, activities, knowledgeGraph]
  );
  const balanceIntervention = coachInterventions.find(
    (i) => i.surface === 'balance' || i.kind === 'pull_push_imbalance' || i.kind === 'unilateral_asymmetry' || i.kind === 'strength_level_gap'
  );
  const balanceAdaptationApplied = Boolean(!balanceIntervention && (profile.programOverrides?.length ?? 0) > 0);
  const balanceAdaptationDismissed = Boolean(
    !balanceIntervention &&
      (profile.dismissedInterventions ?? []).some(
        (d) => d.id.startsWith('imbalance-') || d.id.startsWith('symmetry-') || d.id.startsWith('gap-')
      )
  );
  const timelineMeta = useMemo(() => getTimelineMeta(detailTimeline), [detailTimeline]);
  const muscleProgress = useMemo(() => {
    return buildMuscleProgress({
      workouts,
      exerciseCatalog,
      biometrics,
      knowledgeGraph,
      bodyweightKg: hasBodyweight ? bodyweightEmaKg : 0,
      formatLength: fmt.length,
      weeks: timelineMeta.weeks,
    });
  }, [workouts, exerciseCatalog, biometrics, knowledgeGraph, hasBodyweight, bodyweightEmaKg, fmt, timelineMeta.weeks]);
  const bodyComposition = useMemo(
    () => buildBodyCompositionKnowledgeGraph(biometrics, profile, fmt),
    [biometrics, profile, fmt]
  );
  const visibleCompositionCharts = useMemo(
    () =>
      compositionCharts
        .filter((c) => c.category === (compositionView === 'weight' ? 'scale' : 'tape'))
        // Waist leads the measurements: it says the most about fitness.
        .map((c, i) => ({ c, rank: c.id === 'waist' ? -2 : c.id === 'waist-to-height' ? -1 : i }))
        .sort((x, y) => x.rank - y.rank)
        .map(({ c }) => c),
    [compositionCharts, compositionView]
  );

  // The overview: goals, personal bests, totals, and the lean weight and measurement views.
  const goalRings = useMemo(() => buildGoalRings(knowledgeGraph.goals, (kg) => units.format(kg)), [knowledgeGraph, units]);
  const openGoal = openGoalId ? knowledgeGraph.goals.find((g) => g.id === openGoalId) : undefined;
  // Strength and bodyweight on one scale (both start at 100), for the chosen goal's chart.
  const { strength: strengthIndex, weight: weightIndex } = useMemo(
    () => alignStrengthAndWeight(strengthIndexSeries(workouts, hasBodyweight ? bodyweightEmaKg : 0, biometrics), calculateEmaSeries(biometrics)),
    [workouts, biometrics, hasBodyweight, bodyweightEmaKg]
  );
  const goalsSummary = useMemo(() => buildGoalsSummary(knowledgeGraph.goals, (kg) => units.formatPrecise(kg)), [knowledgeGraph, units]);
  const goalCardSummaries = useMemo(
    () => buildGoalCardSummaries(knowledgeGraph.goals, goalRings, (kg) => units.formatPrecise(kg)),
    [knowledgeGraph, goalRings, units]
  );
  const personalBests = useMemo(
    () => buildPersonalBests(workouts, hasBodyweight ? bodyweightEmaKg : 0, biometrics),
    [workouts, hasBodyweight, bodyweightEmaKg, biometrics]
  );
  const trophies = useMemo(() => trophyCase(personalBests), [personalBests]);
  const bwForTotals = hasBodyweight ? bodyweightEmaKg : 0;
  const lifetime = useMemo(() => buildTrainingTotals(workouts, undefined, undefined, bwForTotals, biometrics), [workouts, bwForTotals, biometrics]);
  const recent = useMemo(() => buildTrainingTotals(workouts, RECENT_DAYS, undefined, bwForTotals, biometrics), [workouts, bwForTotals, biometrics]);
  const recentWindow = useMemo(
    () => buildTrainingTotals(workouts, timelineMeta.days, undefined, bwForTotals, biometrics),
    [workouts, timelineMeta.days, bwForTotals, biometrics]
  );
  const pace = useMemo(() => weightPace(biometrics, profile.goalPhase), [biometrics, profile.goalPhase]);
  const weightChart = compositionCharts.find((c) => c.id === 'bodyweight');
  const stepsChart = useMemo(() => buildStepsChart(biometrics), [biometrics]);
  const whoopCharts = useMemo(
    () => (whoopConfigured ? buildWhoopCharts({ biometrics, workouts }) : []),
    [whoopConfigured, biometrics, workouts]
  );
  const whoopSnapshot = useMemo(
    () => (whoopConfigured ? buildWhoopSnapshot(biometrics, workouts) : {}),
    [whoopConfigured, biometrics, workouts]
  );
  const whoopRecoveryChart = whoopCharts.find((c) => c.id === 'whoop-recovery');
  const todaySteps = stepsOnDate(biometrics);
  const avgSteps7d = useMemo(() => averageRecentSteps(biometrics, 7), [biometrics]);
  const latestStepsEntry = stepsChart.points[stepsChart.points.length - 1];
  const stepsGoal = profile.goalSettings?.customGoals?.find((g) => g.metric === 'steps');
  const tapeHighlights = useMemo(() => measurementHighlights(compositionCharts), [compositionCharts]);
  const bestValue = (b: (typeof personalBests)[number]) =>
    b.isBodyweight ? { value: `${b.reps}`, unit: 'reps' } : { value: units.format(b.weightKg, false), unit: `${units.unit} × ${b.reps}` };
  const whole = (kg: number) => Math.round(units.toDisplay(kg)).toLocaleString();

  const openLogWeight = () => {
    setOpenGoalId(null);
    setDetail('weight');
    setLogModalMode('weight');
    setShowLogModal(true);
  };

  useEffect(() => {
    if (openLogWeightRequest > 0) {
      openLogWeight();
      onLogWeightRequestHandled?.();
    }
  }, [openLogWeightRequest]);

  useEffect(() => {
    if (openInsightsRequest && openInsightsRequest.nonce > 0) {
      setOpenGoalId(null);
      setFocusedInsightExerciseId(openInsightsRequest.exerciseId);
      setDetail('insights');
      onInsightsRequestHandled?.();
    }
  }, [openInsightsRequest]);

  useEffect(() => {
    if (!openDetailRequest || openDetailRequest.nonce <= 0) return;
    const validDetails: ProgressDetail[] = [
      'bests',
      'lifetime',
      'recent',
      'steps',
      'whoop',
      'weight',
      'measurements',
      'insights',
      'standards',
      'goals',
      'widgets',
    ];
    if (openDetailRequest.goalId) {
      setDetail(null);
      setOpenGoalId(openDetailRequest.goalId);
    } else if (
      openDetailRequest.detail &&
      validDetails.includes(openDetailRequest.detail as ProgressDetail)
    ) {
      setOpenGoalId(null);
      setFocusedInsightExerciseId(undefined);
      setDetail(openDetailRequest.detail as ProgressDetail);
    } else if (openDetailRequest.detail === 'composition' || openDetailRequest.detail === 'overview') {
      setOpenGoalId(null);
      setDetail(null);
    }
    onDetailRequestHandled?.();
  }, [openDetailRequest]);

  useEffect(() => {
    onContextChange?.({ goalId: openGoalId ?? undefined, detail: openGoalId ? undefined : detail ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, openGoalId]);
  // Leaving the Progress page clears it.
  useEffect(() => () => onContextChange?.({}), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each screen opens at its top, not where the last one was scrolled to.
  useEffect(() => {
    setDetailTimeline(DEFAULT_CHART_TIMELINE);
    setShowUnloggedScaleCharts(false);
    setShowLimbSitesList(false);
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [detail, openGoalId]);

  const openLogMeasurements = (site?: BodyMeasurementSite) => {
    setOpenGoalId(null);
    setDetail('measurements');
    setLogModalMode('measurements');
    setLogModalSite(site);
    setShowLogModal(true);
  };

  const openLogForChart = (chart: ProgressChart) => {
    if (chart.category === 'tape') {
      openLogMeasurements(CHART_ID_TO_TAPE_SITE[chart.id]);
    } else {
      openLogWeight();
    }
  };

  const measuredSymmetryPairs = bodyComposition.bilateralSymmetry.filter(
    (p) => p.status !== 'insufficient_data'
  );

  const handleSaveAndShowComposition = (entry: MeasurementEntry) => {
    onSaveMeasurements(entry);
    setDetail(logModalMode === 'weight' ? 'weight' : 'measurements');
  };

  const logWeightPrompt = (
    <div className="wk-card">
      <h2 className="wk-h1">Strength levels</h2>
      <p className="wk-body mt-3 max-w-prose">
        Strength levels compare what you lift with your bodyweight. Log your weight to see them.
      </p>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          openLogWeight();
        }}
        className="wk-button mt-4 active:scale-[0.98] transition-transform"
        style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
      >
        Log weight
      </button>
    </div>
  );

  const [inspectedExerciseId, setInspectedExerciseId] = useState<string | null>(null);
  const cardsTopRef = useRef<HTMLDivElement>(null);

  const inspectedExercise = useMemo(() => {
    if (!inspectedExerciseId) return null;
    return buildInspectExerciseSession({
      exerciseId: inspectedExerciseId,
      exerciseCatalog,
      workouts,
    });
  }, [inspectedExerciseId, exerciseCatalog, workouts]);

  const detailScreen = detail && (
    <>
      <DetailHeader title={DETAIL_TITLE[detail]} onBack={() => setDetail(null)} />
      <div ref={cardsTopRef} className="flex flex-col gap-3 mt-4">
        {detail === 'bests' &&
          (personalBests.length > 0 ? (
            <section className="wk-card" aria-label="All personal bests">
              <p className="wk-body max-w-prose">Your heaviest logged set on each lift, or your most reps where there is no weight to add.</p>
              <ul className="flex flex-col mt-3">
                {personalBests.map((b) => {
                  const shown = bestValue(b);
                  return (
                    <li
                      key={b.exerciseId}
                      className="border-t"
                      style={{ borderColor: 'var(--color-border-subtle)' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setInspectedExerciseId(b.exerciseId);
                        }}
                        aria-label={`Open details for ${formatSentenceCase(b.exerciseName)}`}
                        className="w-full text-left flex items-center justify-between gap-3 py-3 min-h-[44px]"
                      >
                        <div className="min-w-0">
                          <p className="wk-subhead leading-tight">
                            {formatSentenceCase(b.exerciseName)}
                          </p>
                          <p className="wk-caption mt-1">
                            {shortDate(b.date)}
                            {b.e1rmKg > 0
                              ? ` • estimated max ${units.formatPrecise(b.e1rmKg)}${b.includesBodyweight ? ' (bodyweight + added weight)' : ''}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-base font-medium tabular-nums text-right leading-none" style={{ color: 'var(--color-text-primary)' }}>
                            {shown.value}
                            <span className="wk-caption ml-1">
                              {shown.unit}
                            </span>
                          </p>
                          <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <div className="wk-card">
              <p className="wk-body">Finish a workout and your best set on each lift appears here.</p>
            </div>
          ))}

        {detail === 'lifetime' && (
          <>
            <section className="wk-card" aria-label="Lifetime totals">
              <h2 className="wk-title">All time</h2>
              <StatRow
                stats={[
                  { label: `Volume (${units.unit})`, value: whole(lifetime.volumeKg) },
                  { label: 'Reps', value: lifetime.reps.toLocaleString() },
                  { label: 'Workouts', value: lifetime.workouts.toLocaleString() },
                ]}
              />
            </section>
            <TimelineToggle
              value={detailTimeline}
              onChange={setDetailTimeline}
              ariaLabel="Strength charts timeline"
            />
            {strengthCharts.map((chart) => (
              <ProgressChartCard key={chart.id} chart={chart} timeline={detailTimeline} hideTimelineToggle />
            ))}
          </>
        )}

        {detail === 'recent' && (
          <>
            <TimelineToggle
              value={detailTimeline}
              onChange={setDetailTimeline}
              ariaLabel="Recent training timeline"
            />
            <section className="wk-card" aria-label={`Totals for the last ${timelineMeta.days} days`}>
              <h2 className="wk-title">Last {timelineMeta.days} days</h2>
              <StatRow
                stats={[
                  { label: `Volume (${units.unit})`, value: whole(recentWindow.volumeKg) },
                  { label: 'Reps', value: recentWindow.reps.toLocaleString() },
                  { label: 'Workouts', value: recentWindow.workouts.toLocaleString() },
                ]}
              />
            </section>
            {muscleProgress.length > 0 ? (
              muscleProgress.map((m) => (
                <MuscleProgressCard
                  key={m.key}
                  progress={m}
                  formatLength={fmt.length}
                  timeline={detailTimeline}
                />
              ))
            ) : (
              <div className="wk-card">
                <h2 className="wk-h1">Muscles</h2>
                <p className="wk-body mt-3 max-w-prose">
                  Finish a workout to see each muscle's weekly sets, strength and size here.
                </p>
              </div>
            )}
          </>
        )}

        {detail === 'steps' && (
          <>
            <section className="wk-card" aria-label="Daily step summary">
              <h2 className="wk-title">Daily steps</h2>
              <StatRow
                stats={[
                  {
                    label: todaySteps > 0 ? 'Today' : latestStepsEntry ? shortDate(latestStepsEntry.date) : 'Today',
                    value: (todaySteps > 0 ? todaySteps : latestStepsEntry?.value ?? 0) > 0
                      ? Math.round(todaySteps > 0 ? todaySteps : latestStepsEntry!.value).toLocaleString()
                      : '—',
                  },
                  {
                    label: '7-day avg',
                    value: avgSteps7d !== null ? avgSteps7d.toLocaleString() : '—',
                  },
                  {
                    label: 'Goal',
                    value: stepsGoal ? stepsGoal.target.toLocaleString() : '—',
                  },
                ]}
              />
              {stepsGoal && (
                <div
                  className="wk-bar mt-3"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={stepsGoal.target}
                  aria-valuenow={todaySteps}
                  aria-label={`${todaySteps.toLocaleString()} of ${stepsGoal.target.toLocaleString()} steps today`}
                >
                  <div style={{ width: `${Math.min(100, (todaySteps / stepsGoal.target) * 100)}%` }} />
                </div>
              )}
              <p className="wk-body mt-3 max-w-prose">
                {stepsChart.summary}
              </p>
            </section>
            <ProgressChartCard chart={stepsChart} />
            {stepsChart.points.length > 0 && (
              <section className="wk-card" aria-label="Recent daily step counts">
                <h2 className="wk-title">Recent days</h2>
                <ul className="flex flex-col mt-3">
                  {[...stepsChart.points].reverse().slice(0, 14).map((pt) => (
                    <li
                      key={pt.date}
                      className="flex items-center justify-between gap-3 py-3 border-t"
                      style={{ borderColor: 'var(--color-border-subtle)' }}
                    >
                      <span className="wk-body">{shortDate(pt.date)}</span>
                      <span className="text-base font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                        {Math.round(pt.value).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {detail === 'whoop' && whoopConfigured && (
          <>
            <section className="wk-card" aria-label="Whoop metrics summary">
              <div className="flex items-center justify-between gap-3">
                <h2 className="wk-title">Latest Whoop metrics</h2>
                {whoopSnapshot.latestDate && <span className="wk-pill">{shortDate(whoopSnapshot.latestDate)}</span>}
              </div>
              <StatRow
                stats={[
                  {
                    label: 'Recovery',
                    value: whoopSnapshot.recoveryScore !== undefined ? `${Math.round(whoopSnapshot.recoveryScore)}%` : '—',
                  },
                  {
                    label: 'Day strain',
                    value: whoopSnapshot.dayStrain !== undefined ? whoopSnapshot.dayStrain.toFixed(1) : '—',
                  },
                  {
                    label: 'Workout strain',
                    value: whoopSnapshot.workoutStrain !== undefined ? whoopSnapshot.workoutStrain.toFixed(1) : '—',
                  },
                ]}
              />
              <StatRow
                stats={[
                  {
                    label: 'HRV (RMSSD)',
                    value: whoopSnapshot.hrvRmssd !== undefined ? `${Math.round(whoopSnapshot.hrvRmssd)}` : '—',
                    unit: whoopSnapshot.hrvRmssd !== undefined ? 'ms' : undefined,
                  },
                  {
                    label: 'Resting HR',
                    value: whoopSnapshot.restingHr !== undefined ? `${Math.round(whoopSnapshot.restingHr)}` : '—',
                    unit: whoopSnapshot.restingHr !== undefined ? 'bpm' : undefined,
                  },
                  {
                    label: 'Sleep',
                    value: whoopSnapshot.sleepHours !== undefined ? whoopSnapshot.sleepHours.toFixed(1) : '—',
                    unit: whoopSnapshot.sleepHours !== undefined ? 'h' : undefined,
                  },
                ]}
              />
              {(whoopSnapshot.sleepPerformance !== undefined ||
                whoopSnapshot.sleepEfficiency !== undefined ||
                whoopSnapshot.respiratoryRate !== undefined ||
                whoopSnapshot.spo2 !== undefined ||
                whoopSnapshot.skinTemp !== undefined) && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {whoopSnapshot.sleepPerformance !== undefined && (
                    <span className="wk-pill">
                      Sleep perf {Math.round(whoopSnapshot.sleepPerformance)}%
                    </span>
                  )}
                  {whoopSnapshot.sleepEfficiency !== undefined && (
                    <span className="wk-pill">
                      Efficiency {Math.round(whoopSnapshot.sleepEfficiency)}%
                    </span>
                  )}
                  {whoopSnapshot.respiratoryRate !== undefined && (
                    <span className="wk-pill">
                      Resp rate {whoopSnapshot.respiratoryRate.toFixed(1)} brpm
                    </span>
                  )}
                  {whoopSnapshot.spo2 !== undefined && (
                    <span className="wk-pill">
                      SpO2 {whoopSnapshot.spo2.toFixed(1)}%
                    </span>
                  )}
                  {whoopSnapshot.skinTemp !== undefined && (
                    <span className="wk-pill">
                      Skin temp {whoopSnapshot.skinTemp.toFixed(1)} °C
                    </span>
                  )}
                </div>
              )}
            </section>
            <TimelineToggle
              value={detailTimeline}
              onChange={setDetailTimeline}
              ariaLabel="Whoop charts timeline"
            />
            {whoopCharts.map((chart) => (
              <ProgressChartCard key={chart.id} chart={chart} timeline={detailTimeline} hideTimelineToggle />
            ))}
          </>
        )}

        {detail === 'goals' && (
          <GoalSettingsScreen
            profile={profile}
            goals={knowledgeGraph.goals}
            onUpdateProfile={onUpdateProfile}
            onUpdateGoalPhase={onUpdateGoalPhase}
            onAskCoach={
              onOpenCoach
                ? (prompt) => onOpenCoach({ detail: 'goals', prompt })
                : undefined
            }
          />
        )}

        {detail === 'widgets' && (
          <ProgressWidgetsScreen
            activeWidgets={activeWidgets}
            exerciseCatalog={exerciseCatalog}
            workouts={workouts}
            whoopConfigured={whoopConfigured}
            isDefault={profile.progressWidgets === undefined}
            onToggle={(id) => onUpdateProfile({ progressWidgets: toggleProgressWidget(profile.progressWidgets, id) })}
            onReset={() => onUpdateProfile({ progressWidgets: undefined })}
            onAskCoach={
              onOpenCoach
                ? (prompt) => onOpenCoach({ detail: 'widgets', prompt })
                : undefined
            }
          />
        )}

        {detail === 'insights' && (
          <KnowledgeGraphCard
            workouts={workouts}
            biometrics={biometrics}
            exerciseCatalog={exerciseCatalog}
            profile={profile}
            weeklyVolume={weeklyVolume}
            knowledgeGraph={knowledgeGraph}
            focusExerciseId={focusedInsightExerciseId}
          />
        )}

        {detail === 'standards' && (
          <>
            {hasBodyweight ? (
              <>
                <StrengthLevelsCard
                  report={movementStandards}
                  latestBiometrics={latestBiometrics}
                  onAskCoach={
                    onOpenCoach
                      ? () => onOpenCoach({ detail: 'standards' })
                      : undefined
                  }
                />
                <BalanceCard
                  report={movementStandards}
                  intervention={balanceIntervention}
                  adaptationApplied={balanceAdaptationApplied}
                  adaptationDismissed={balanceAdaptationDismissed}
                  onAcceptIntervention={onAcceptIntervention}
                  onDismissIntervention={onDismissIntervention}
                  onFixImbalanceWithCoach={
                    onOpenCoachIntervention
                      ? (prompt) => onOpenCoachIntervention({ prompt, detail: 'standards' })
                      : undefined
                  }
                />
              </>
            ) : (
              logWeightPrompt
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setFocusedInsightExerciseId(undefined);
                setDetail('insights');
              }}
              className="wk-btn-secondary w-full"
            >
              Open training insights &amp; exercise notes
            </button>
          </>
        )}

        {(detail === 'weight' || detail === 'measurements') && (() => {
          const isWeight = compositionView === 'weight';
          const primaryCharts = isWeight
            ? visibleCompositionCharts.filter((c) => c.id === 'bodyweight' || c.points.length > 0)
            : visibleCompositionCharts.filter((c) => c.points.length > 0);
          const unloggedScaleCharts = isWeight
            ? visibleCompositionCharts.filter((c) => c.id !== 'bodyweight' && c.points.length === 0)
            : [];
          const loggedSiteIds = new Set(
            primaryCharts
              .map((c) => CHART_ID_TO_TAPE_SITE[c.id])
              .filter((id): id is BodyMeasurementSite => Boolean(id))
          );
          const unmeasuredSites = !isWeight
            ? BODY_MEASUREMENT_SITES.filter((s) => !loggedSiteIds.has(s.id))
            : [];
          const primaryUnmeasuredSites = unmeasuredSites.filter((s) => s.primary);
          const limbUnmeasuredSites = unmeasuredSites.filter((s) => !s.primary);

          return (
            <>
              {/* One focused action at the top matching the active screen */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  if (isWeight) openLogWeight();
                  else openLogMeasurements();
                }}
                className="wk-button gap-2 active:scale-[0.98] transition-transform"
                style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
              >
                {isWeight ? <Scale className="w-4 h-4 stroke-[2]" /> : <Ruler className="w-4 h-4 stroke-[2]" />}
                <span>{isWeight ? 'Log weight' : 'Log measurements'}</span>
              </button>

              {isWeight && bodyComposition.populatedScaleCount > 0 && (
                <div className="wk-card space-y-3">
                  <h2 className="wk-title">Body composition</h2>
                  <p className="wk-body text-[color:var(--wk-body)] max-w-prose">{bodyComposition.recompositionSummary}</p>
                  {visibleCompositionCharts.some((c) => c.id !== 'bodyweight' && c.points.length > 0) && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
                      {visibleCompositionCharts
                        .filter((c) => c.id !== 'bodyweight' && c.points.length > 0)
                        .map((c) => (
                          <div key={c.id} className="min-w-0">
                            <dt className="wk-caption">{c.title}</dt>
                            <dd className="text-base font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                              {c.format(c.points[c.points.length - 1].value)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  )}
                </div>
              )}

              {!isWeight && measuredSymmetryPairs.length > 0 && (
                <div className="wk-card space-y-3">
                  <h2 className="wk-title">Symmetry</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {measuredSymmetryPairs.map((pair) => (
                      <div
                        key={pair.id}
                        className="rounded-xl p-3 border"
                        style={{ background: 'var(--wk-raised)', borderColor: 'var(--color-border-subtle)' }}
                      >
                        <span className="block wk-meta-title">{pair.label}</span>
                        <span className="block text-base font-medium tabular-nums mt-1" style={{ color: 'var(--color-text-primary)' }}>
                          L {fmt.length(pair.leftCm!)} · R {fmt.length(pair.rightCm!)}
                        </span>
                        <span
                          className="block text-xs font-medium mt-1 tabular-nums"
                          style={{ color: pair.status === 'balanced' ? 'var(--wk-accent)' : 'var(--color-status-warning)' }}
                        >
                          {pair.status === 'balanced'
                            ? 'Balanced'
                            : `${pair.dominantSide === 'right' ? 'Right' : 'Left'} +${fmt.length(Math.abs(pair.diffCm ?? 0))}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {primaryCharts.length > 0 && (
                <>
                  <TimelineToggle
                    value={detailTimeline}
                    onChange={setDetailTimeline}
                    ariaLabel={isWeight ? 'Body weight charts timeline' : 'Body measurements charts timeline'}
                  />
                  {primaryCharts.map((chart) => (
                    <ProgressChartCard
                      key={chart.id}
                      chart={chart}
                      timeline={detailTimeline}
                      hideTimelineToggle
                      onOpen={() => openLogForChart(chart)}
                    />
                  ))}
                </>
              )}

              {isWeight && unloggedScaleCharts.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={showUnloggedScaleCharts}
                    onClick={() => {
                      triggerHaptic('light');
                      setShowUnloggedScaleCharts((v) => !v);
                    }}
                    className="wk-btn-secondary w-full"
                  >
                    {showUnloggedScaleCharts
                      ? 'Hide unmeasured scale metrics'
                      : `More scale metrics (${unloggedScaleCharts.length} not logged)`}
                  </button>
                  {showUnloggedScaleCharts &&
                    unloggedScaleCharts.map((chart) => (
                      <ProgressChartCard
                        key={chart.id}
                        chart={chart}
                        timeline={detailTimeline}
                        hideTimelineToggle
                        onOpen={() => openLogForChart(chart)}
                      />
                    ))}
                </>
              )}

              {!isWeight && unmeasuredSites.length > 0 && (
                <section aria-label="Body measurement sites" className="wk-card space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="wk-title">
                      {primaryCharts.length > 0 ? 'Add another site' : 'Measure a body part'}
                    </h2>
                    <span className="wk-caption">Tap one to log</span>
                  </div>
                  <ul className="flex flex-col">
                    {primaryUnmeasuredSites.map((site, idx) => (
                      <li
                        key={site.id}
                        style={idx > 0 ? { borderTop: '1px solid var(--color-border-subtle)' } : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            openLogMeasurements(site.id);
                          }}
                          className="w-full text-left flex items-center justify-between gap-3 py-3 min-h-[44px]"
                        >
                          <span className="min-w-0">
                            <span className="wk-subhead block">{site.label}</span>
                            <span className="wk-caption block mt-1">{site.hint}</span>
                          </span>
                          <ChevronRight className="wk-chevron shrink-0" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {limbUnmeasuredSites.length > 0 && (
                    <>
                      <button
                        type="button"
                        aria-expanded={showLimbSitesList}
                        onClick={() => {
                          triggerHaptic('light');
                          setShowLimbSitesList((v) => !v);
                        }}
                        className="wk-btn-secondary w-full"
                      >
                        {showLimbSitesList
                          ? 'Hide arms & legs'
                          : `Arms & legs (${limbUnmeasuredSites.length} sites)`}
                      </button>
                      {showLimbSitesList && (
                        <ul className="flex flex-col pt-1">
                          {limbUnmeasuredSites.map((site, idx) => (
                            <li
                              key={site.id}
                              style={idx > 0 ? { borderTop: '1px solid var(--color-border-subtle)' } : undefined}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  openLogMeasurements(site.id);
                                }}
                                className="w-full text-left flex items-center justify-between gap-3 py-3 min-h-[44px]"
                              >
                                <span className="min-w-0">
                                  <span className="wk-subhead block">{site.label}</span>
                                  <span className="wk-caption block mt-1">{site.hint}</span>
                                </span>
                                <ChevronRight className="wk-chevron shrink-0" strokeWidth={2} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          );
        })()}
      </div>
    </>
  );

  const renderProgressMenu = (close: () => void) => (
    <div
      role="menu"
      aria-label="Progress options"
      className="w-60 rounded-2xl bg-surface-card border shadow-2xl p-2 space-y-1 text-left"
      style={{ borderColor: 'var(--color-border-subtle)' }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          triggerHaptic('light');
          close();
          setDetail('goals');
        }}
        className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center gap-2 min-h-[44px]"
        style={{ color: 'var(--color-text-primary)' }}
      >
        <Target className="w-4 h-4 stroke-[2] shrink-0" />
        <span>Change goals</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          triggerHaptic('light');
          close();
          setDetail('widgets');
        }}
        className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center justify-between gap-2 min-h-[44px]"
        style={{ color: 'var(--color-text-primary)' }}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 stroke-[2] shrink-0" />
          <span>Customize widgets</span>
        </span>
        <span className="text-xs font-normal tabular-numbers" style={{ color: 'var(--color-text-muted)' }}>
          {activeWidgets.length} active
        </span>
      </button>
    </div>
  );

  const overview = (
    <>
      <header className="relative pt-2">
        <div className="relative flex items-center justify-start pr-12">
          <h1 className="wk-page-title">Progress</h1>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setMenuOpen((o) => !o);
            }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Progress options: change goals and customize widgets"
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, color: 'var(--wk-muted)' }}
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 top-full mt-2 z-30">{renderProgressMenu(() => setMenuOpen(false))}</div>
            </>
          )}
        </div>
      </header>

      {hasWidget('goals') && (
        <GoalsHero
          rings={goalRings}
          summary={goalsSummary}
          goals={knowledgeGraph.goals}
          cardSummaries={goalCardSummaries}
          onOpenGoal={(id) => {
            if (id.startsWith('strength-none')) {
              openLogWeight();
              return;
            }
            setOpenGoalId(id);
          }}
        />
      )}

      <div
        ref={cardsTopRef}
        className={`flex flex-col gap-3 ${hasWidget('goals') ? 'mt-4' : 'mt-5'}`}
      >
        {hasWidget('trophy-case') && (
          <OverviewCard title="Trophy case" opens="all personal bests" onOpen={() => setDetail('bests')}>
            {trophies.length > 0 ? (
              <StatRow
                sentenceLabels
                stats={trophies.map((b) => {
                  const shown = bestValue(b);
                  return { label: formatSentenceCase(shortLiftName(b.exerciseName)), value: shown.value, unit: shown.unit };
                })}
              />
            ) : (
              <p className="wk-body mt-3 max-w-prose">
                Your best set on each lift appears here after your first workout.
              </p>
            )}
          </OverviewCard>
        )}

        {hasWidget('lifetime-stats') && (
          <OverviewCard title="Lifetime stats" opens="your training over time" onOpen={() => setDetail('lifetime')}>
            <StatRow
              stats={[
                { label: `Volume (${units.unit})`, value: whole(lifetime.volumeKg) },
                { label: 'Reps', value: lifetime.reps.toLocaleString() },
                { label: 'Workouts', value: lifetime.workouts.toLocaleString() },
              ]}
            />
          </OverviewCard>
        )}

        {hasWidget('recent-stats') && (
          <OverviewCard title="Recent stats" opens={`the last ${RECENT_DAYS} days by muscle`} onOpen={() => setDetail('recent')}>
            <p className="wk-caption mt-1">
              Last {RECENT_DAYS} days
            </p>
            <StatRow
              stats={[
                { label: `Volume (${units.unit})`, value: whole(recent.volumeKg) },
                { label: 'Reps', value: recent.reps.toLocaleString() },
                { label: 'Workouts', value: recent.workouts.toLocaleString() },
              ]}
            />
          </OverviewCard>
        )}

        {hasWidget('steps') && (
          <OverviewCard title="Steps" opens="daily steps history" onOpen={() => setDetail('steps')}>
            {latestStepsEntry || todaySteps > 0 ? (
              <div className="flex items-end justify-between gap-3 mt-4">
                <div className="min-w-0">
                  <p className="wk-caption">
                    {todaySteps > 0 ? 'Today' : `Latest (${shortDate(latestStepsEntry!.date)})`}
                  </p>
                  <p className="wk-display leading-none mt-1">
                    {Math.round(todaySteps > 0 ? todaySteps : latestStepsEntry!.value).toLocaleString()}
                  </p>
                  {avgSteps7d !== null && (
                    <p className="wk-caption mt-2 tabular-nums">
                      7-day avg {avgSteps7d.toLocaleString()}
                    </p>
                  )}
                  {stepsGoal && (
                    <span
                      className="wk-pill mt-2 tabular-nums"
                      style={{
                        background: todaySteps >= stepsGoal.target ? 'var(--color-status-positive-soft)' : 'var(--wk-pill)',
                        color: todaySteps >= stepsGoal.target ? 'var(--wk-accent)' : 'var(--color-status-neutral)',
                      }}
                    >
                      {todaySteps >= stepsGoal.target
                        ? `Goal met (${stepsGoal.target.toLocaleString()})`
                        : `${todaySteps.toLocaleString()} / ${stepsGoal.target.toLocaleString()} goal`}
                    </span>
                  )}
                </div>
                {stepsChart.points.length >= 2 && (
                  <Sparkline
                    points={stepsChart.points}
                    tone="telemetry"
                    positiveProgress={Boolean(stepsGoal && todaySteps >= stepsGoal.target)}
                    label={`Daily steps from ${Math.round(stepsChart.points[0].value).toLocaleString()} to ${Math.round(stepsChart.points[stepsChart.points.length - 1].value).toLocaleString()}`}
                  />
                )}
              </div>
            ) : (
              <>
                <StatRow stats={[{ label: 'Today', value: '—' }, { label: '7-day avg', value: '—' }, { label: 'Goal', value: stepsGoal ? stepsGoal.target.toLocaleString() : '—' }]} />
                <p className="wk-body mt-3 max-w-prose">
                  {stepsChart.summary}
                </p>
              </>
            )}
          </OverviewCard>
        )}

        {hasWidget('body-weight') && (
          <OverviewCard title="Body weight" opens="weight, body composition and logging" onOpen={() => setDetail('weight')}>
            <p className="wk-body mt-2 max-w-prose">
              {weightChart?.summary}
            </p>
            {latestWeighIn && (
              <div className="flex items-end justify-between gap-3 mt-4">
                <div className="min-w-0">
                  <p className="wk-display leading-none">
                    {units.formatPrecise(latestWeighIn.bodyweightKg)}
                  </p>
                  {pace && (
                    <span
                      className="wk-pill mt-2"
                      style={{
                        background: pace.pace === 'on' ? 'var(--color-status-positive-soft)' : 'var(--wk-pill)',
                        color: pace.pace === 'on' ? 'var(--wk-accent)' : 'var(--color-status-neutral)',
                      }}
                    >
                      {pace.direction === 'steady' ? 'Your weight is steady' : pace.direction === 'losing' ? "You're losing weight" : "You're gaining weight"}
                    </span>
                  )}
                </div>
                <Sparkline
                  points={weightChart?.points ?? []}
                  positiveProgress={pace?.pace === 'on'}
                  label={`7-day average weight from ${units.formatPrecise(weightChart?.points[0]?.value ?? 0)} to ${units.formatPrecise(weightChart?.points[weightChart.points.length - 1]?.value ?? 0)}`}
                />
              </div>
            )}
          </OverviewCard>
        )}

        {hasWidget('composition') && (
          <CompositionCard
            biometrics={biometrics}
            goalPhase={profile.goalPhase}
            onOpenLog={openLogWeight}
            onAskCoach={
              onOpenCoach
                ? () => onOpenCoach({ detail: 'composition' })
                : undefined
            }
          />
        )}

        {hasWidget('measurements') && (
          <OverviewCard title="Measurements" opens="all measurements and logging" onOpen={() => setDetail('measurements')}>
            {tapeHighlights.length > 0 ? (
              <StatRow
                stats={tapeHighlights.map((m) => {
                  const [value, unit] = fmt.length(m.value).split(' ');
                  return {
                    label: m.label,
                    value,
                    unit,
                    note: m.change === undefined || m.change === 0 ? (m.change === 0 ? 'No change' : 'First reading') : `${m.change > 0 ? 'Up' : 'Down'} ${fmt.length(Math.abs(m.change))}`,
                  };
                })}
              />
            ) : (
              <p className="wk-body mt-3 max-w-prose">
                Start with your waist: it says the most about your fitness. Measure at the navel, first thing in the morning.
              </p>
            )}
          </OverviewCard>
        )}

        {hasWidget('insights') && (
          <OverviewCard
            title="Training insights"
            opens="recovery, joint load and exercise notes"
            onOpen={() => {
              setFocusedInsightExerciseId(undefined);
              setDetail('insights');
            }}
          >
            <StatRow
              stats={[
                {
                  label: 'Recovery',
                  value: knowledgeGraph.recoveryEfficiencyScore > 0 ? `${knowledgeGraph.recoveryEfficiencyScore}` : 'Ready',
                  unit: knowledgeGraph.recoveryEfficiencyScore > 0 ? '/100' : undefined,
                },
                {
                  label: 'Full-stretch',
                  value: `${knowledgeGraph.lengthenedStimulusRatio}%`,
                },
                {
                  label: 'Notes',
                  value: `${knowledgeGraph.exerciseNotesHistory.length}`,
                },
              ]}
            />
            <p className="wk-body mt-3 max-w-prose">
              {knowledgeGraph.exerciseNotesHistory[0]
                ? `Latest note (${knowledgeGraph.exerciseNotesHistory[0].exerciseName}): "${knowledgeGraph.exerciseNotesHistory[0].note}"`
                : knowledgeGraph.insights[0]?.narrative || 'Weekly muscle sets, joint load and exercise cues pull together here as you train.'}
            </p>
          </OverviewCard>
        )}

        {hasWidget('strength-standards') && (
          <OverviewCard title="Strength standards" opens="your level on each lift" onOpen={() => setDetail('standards')}>
            {hasBodyweight && movementStandards.levels.some((l) => l.logged && l.source !== 'none') ? (
              <>
                <p className="wk-body mt-2 max-w-prose">
                  Your best estimated max on each lift against published standards for {movementStandards.tableLabel} at your bodyweight.
                </p>
                <div className="flex justify-center mt-3">
                  <StandardsRadar report={movementStandards} />
                </div>
              </>
            ) : (
              <p className="wk-body mt-3 max-w-prose">
                {hasBodyweight
                  ? 'Log a squat, deadlift, bench press, overhead press or chin-up to see your level.'
                  : 'Strength levels compare what you lift with your bodyweight. Log your weight to see them.'}
              </p>
            )}
          </OverviewCard>
        )}

        {hasWidget('strength-levels') &&
          (hasBodyweight ? (
            <StrengthLevelsCard
              report={movementStandards}
              latestBiometrics={latestBiometrics}
              onAskCoach={
                onOpenCoach
                  ? () => onOpenCoach({ detail: 'standards' })
                  : undefined
              }
            />
          ) : (
            logWeightPrompt
          ))}

        {hasWidget('balance') && (
          <BalanceCard
            report={movementStandards}
            intervention={balanceIntervention}
            adaptationApplied={balanceAdaptationApplied}
            adaptationDismissed={balanceAdaptationDismissed}
            onAcceptIntervention={onAcceptIntervention}
            onDismissIntervention={onDismissIntervention}
            onFixImbalanceWithCoach={
              onOpenCoachIntervention
                ? (prompt) => onOpenCoachIntervention({ prompt, detail: 'standards' })
                : undefined
            }
          />
        )}

        {whoopConfigured && hasWidget('whoop-summary') && (
          <OverviewCard title="Whoop metrics" opens="Whoop recovery, strain and sleep" onOpen={() => setDetail('whoop')}>
            <StatRow
              stats={[
                {
                  label: 'Recovery',
                  value: whoopSnapshot.recoveryScore !== undefined ? `${Math.round(whoopSnapshot.recoveryScore)}%` : '—',
                },
                {
                  label: 'Day strain',
                  value: whoopSnapshot.dayStrain !== undefined ? whoopSnapshot.dayStrain.toFixed(1) : '—',
                },
                {
                  label: 'Workout strain',
                  value: whoopSnapshot.workoutStrain !== undefined ? whoopSnapshot.workoutStrain.toFixed(1) : '—',
                },
              ]}
            />
            {(whoopSnapshot.hrvRmssd !== undefined || whoopSnapshot.restingHr !== undefined || whoopSnapshot.sleepHours !== undefined || (whoopRecoveryChart?.points.length ?? 0) >= 2) ? (
              <div className="flex items-end justify-between gap-3 mt-4">
                <div className="flex flex-wrap gap-2">
                  {whoopSnapshot.hrvRmssd !== undefined && (
                    <span className="wk-pill tabular-nums">
                      HRV {Math.round(whoopSnapshot.hrvRmssd)} ms
                    </span>
                  )}
                  {whoopSnapshot.restingHr !== undefined && (
                    <span className="wk-pill tabular-nums">
                      RHR {Math.round(whoopSnapshot.restingHr)} bpm
                    </span>
                  )}
                  {whoopSnapshot.sleepHours !== undefined && (
                    <span className="wk-pill tabular-nums">
                      Sleep {whoopSnapshot.sleepHours.toFixed(1)} h
                    </span>
                  )}
                </div>
                {whoopRecoveryChart && whoopRecoveryChart.points.length >= 2 && (
                  <Sparkline
                    points={whoopRecoveryChart.points}
                    tone="telemetry"
                    label={`Whoop recovery from ${Math.round(whoopRecoveryChart.points[0].value)}% to ${Math.round(whoopRecoveryChart.points[whoopRecoveryChart.points.length - 1].value)}%`}
                  />
                )}
              </div>
            ) : (
              <p className="wk-body mt-3 max-w-prose">
                Sync or import Whoop telemetry to see overnight recovery, strain, HRV and sleep trends here.
              </p>
            )}
          </OverviewCard>
        )}

        {activeWidgets.map((wid) => {
          const parsed = parseProgressWidgetId(wid);
          if (parsed.kind === 'chart') {
            const chart =
              compositionCharts.find((c) => c.id === parsed.chartId) ??
              strengthCharts.find((c) => c.id === parsed.chartId) ??
              whoopCharts.find((c) => c.id === parsed.chartId);
            if (!chart) return null;
            return (
              <ProgressChartCard
                key={wid}
                chart={chart}
                onOpen={chart.category ? () => openLogForChart(chart) : undefined}
              />
            );
          }
          if (parsed.kind === 'exercise') {
            const def = exerciseCatalog.find((e) => e.id === parsed.exerciseId);
            const histEx = def
              ? undefined
              : workouts.flatMap((w) => w.exercises).find((e) => e.exerciseId === parsed.exerciseId);
            const exDef = def
              ? {
                  id: def.id,
                  name: def.name,
                  equipment: def.equipment,
                  isRdl: def.isRdl,
                  isWeightedCalisthenic: def.isWeightedCalisthenic,
                }
              : histEx
              ? {
                  id: histEx.exerciseId,
                  name: histEx.name,
                  equipment: histEx.equipment,
                  isRdl: histEx.isRdl,
                  isWeightedCalisthenic: histEx.isWeightedCalisthenic,
                }
              : null;
            if (!exDef) return null;
            const chart = buildExerciseProgressChart({
              exercise: exDef,
              workouts,
              bodyweightKg: hasBodyweight ? bodyweightEmaKg : 0,
              biometrics,
              fmt,
            });
            return (
              <ProgressChartCard
                key={wid}
                chart={chart}
                onOpen={() => setInspectedExerciseId(exDef.id)}
                openLabel={`Open details for ${formatSentenceCase(exDef.name)}`}
              />
            );
          }
          return null;
        })}

        {activeWidgets.length === 0 && (
          <section className="wk-card" aria-label="No widgets selected">
            <h2 className="wk-h1">Progress widgets hidden</h2>
            <p className="wk-body mt-2 max-w-prose">
              Choose what you want to track here, or let Treise pin the widgets you care about.
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDetail('widgets');
                }}
                className="wk-btn-secondary w-full justify-center min-h-[48px]"
              >
                Customize widgets
              </button>
              {onOpenCoach && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenCoach({ detail: 'widgets' });
                  }}
                  className="wk-btn-secondary w-full min-h-[48px] inline-flex items-center justify-center gap-2"
                  style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
                >
                  <Sparkles
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--color-coach-accent)' }}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <span>Ask Treise to set up Progress</span>
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );

  const goalScreen = openGoal && (
    <>
      <DetailHeader title={openGoal.title} onBack={() => setOpenGoalId(null)} />
      <div ref={cardsTopRef} className="flex flex-col gap-3 mt-4">
        <GoalDetailScreen
          goal={openGoal}
          goals={knowledgeGraph.goals}
          strengthIndex={strengthIndex}
          weightIndex={weightIndex}
          supporting={compositionCharts.filter((c) => (c.id === 'lean-mass' || c.id === 'waist') && c.points.length > 0)}
          onOpenGoal={setOpenGoalId}
          onLogWeight={openLogWeight}
          onLogMeasurements={() => openLogMeasurements('waist')}
          onAskCoach={
            onOpenCoach
              ? (prompt) => onOpenCoach({ goalId: openGoal.id, prompt })
              : undefined
          }
        />
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setOpenGoalId(null);
            setDetail('goals');
          }}
          className="wk-btn-secondary w-full justify-center min-h-[48px]"
        >
          Change goals
        </button>
      </div>
    </>
  );

  return (
    <div className="wk -mx-4 px-4 pb-28">
      <PageTopGradient markerRef={cardsTopRef} deps={[detail, openGoalId, workouts.length, activeWidgets.join(',')]} />
      {goalScreen || detailScreen || overview}

      {showLogModal && (
        <WeightLogModal
          currentWeight={latestWeighIn?.bodyweightKg ?? 0}
          currentEma={bodyweightEmaKg}
          biometrics={biometrics}
          initialMode={logModalMode}
          initialSite={logModalSite}
          heightCm={profile.measuredHeightCm}
          athleteAge={profile.ageEntered ? profile.age : undefined}
          athleteGender={profile.sexEntered ? profile.gender : undefined}
          onSave={handleSaveAndShowComposition}
          onAutoCapture={handleSaveAndShowComposition}
          onClose={() => setShowLogModal(false)}
        />
      )}

      {inspectedExercise && (
        <ExerciseDetailModal
          exercise={inspectedExercise.exercise}
          exerciseDef={inspectedExercise.exerciseDef}
          exerciseCatalog={exerciseCatalog}
          workouts={workouts}
          biometrics={biometrics}
          bodyweightKg={hasBodyweight ? bodyweightEmaKg : 0}
          goalPhase={profile.goalPhase}
          readinessState={readinessState}
          intervention={coachInterventions.find((i) => i.exerciseId === inspectedExercise.exercise.exerciseId)}
          onAcceptIntervention={onAcceptIntervention}
          onDismissIntervention={onDismissIntervention}
          onAskCoach={
            onOpenCoach
              ? (exId) =>
                  onOpenCoach({
                    detail: detail ?? undefined,
                    prompt: `Review my progress and form cues for ${formatSentenceCase(inspectedExercise.exercise.name)}`,
                    ...(exId ? {} : {}),
                  })
              : undefined
          }
          onClose={() => setInspectedExerciseId(null)}
        />
      )}
    </div>
  );
};
