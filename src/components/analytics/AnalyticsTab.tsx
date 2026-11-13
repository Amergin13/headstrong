import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Scale, Ruler, Bluetooth, MoreHorizontal, SlidersHorizontal, Target } from 'lucide-react';
import { PageTopGradient } from '../common/PageTopGradient';
import { BiometricLog, BodyMeasurementSite, ExerciseDefinition, GoalPhase, ProgressWidgetId, UserProfile, WorkoutSession } from '../../engine/types';
import { StrengthLevelsCard } from './StrengthLevelsCard';
import { BalanceCard } from './BalanceCard';
import { buildMovementStandards } from '../../services/movementStandards';
import { standardsAge } from '../../engine/strengthStandards';
import { buildBodyCompositionKnowledgeGraph } from '../../engine/knowledgeGraph';
import { LogModalMode, MeasurementEntry, WeightLogModal } from './WeightLogModal';
import { KnowledgeGraphCard } from './KnowledgeGraphCard';
import { ProgressChartCard } from './ProgressChartCard';
import { MuscleProgressCard } from './MuscleProgressCard';
import { buildMuscleProgress } from '../../services/muscleProgress';
import { buildAthleteKnowledgeGraph } from '../../engine/knowledgeGraph';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import {
  averageRecentSteps,
  buildCompositionCharts,
  buildExerciseProgressChart,
  buildStepsChart,
  buildStrengthCharts,
  ProgressChart,
  ProgressFormatters,
} from '../../services/progressSeries';
import { stepsOnDate } from '../../services/athleteGoals';
import { loadSavedRenphoDevices } from '../../services/renphoBluetooth';
import { ActivityLog } from '../../engine/activeDays';
import {
  RECENT_DAYS,
  buildGoalRings,
  buildGoalsSummary,
  buildPersonalBests,
  buildTrainingTotals,
  measurementHighlights,
  trophyCase,
} from '../../services/progressOverview';
import { weightPace } from '../../services/progressSeries';
import { parseLocalDate } from '../../utils/date';
import { DetailHeader, GoalsHero, OverviewCard, Sparkline, StandardsRadar, StatRow } from './ProgressOverviewCards';
import { GoalDetailScreen } from './GoalDetailScreen';
import { GoalSettingsScreen } from './GoalSettingsScreen';
import { ProgressWidgetsScreen } from './ProgressWidgetsScreen';
import { parseProgressWidgetId, resolveProgressWidgets, toggleProgressWidget } from '../../services/progressWidgets';
import { alignStrengthAndWeight, strengthIndexSeries } from '../../services/strengthTrend';
import { calculateEmaSeries, hasMeasuredBodyweight, latestBodyweightLog } from '../../engine/ema';
import { triggerHaptic } from '../../utils/haptics';
import '../../services/deviceModels';
import { useUnits } from '../../utils/unitsContext';
import { kgToUnit } from '../../utils/units';

/** One Figma pixel (1344 px frame) in screen pixels; see .wk in index.css. */
const fig = (px: number) => `calc(${px} * var(--f))`;
const PAGE_GUTTER = 38;

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
type ProgressDetail = 'bests' | 'lifetime' | 'recent' | 'steps' | 'weight' | 'measurements' | 'standards' | 'goals' | 'widgets';

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
}

type CompositionView = 'weight' | 'measurements';

const DETAIL_TITLE: Record<ProgressDetail, string> = {
  bests: 'Trophy case',
  lifetime: 'Lifetime stats',
  recent: 'Recent stats',
  steps: 'Steps',
  weight: 'Body weight',
  measurements: 'Measurements',
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
}) => {
  const [detail, setDetail] = useState<ProgressDetail | null>(null);
  /** The goal whose detail is open (a ring was tapped). */
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const compositionView: CompositionView = detail === 'measurements' ? 'measurements' : 'weight';
  const [showLogModal, setShowLogModal] = useState(false);
  const [logModalMode, setLogModalMode] = useState<LogModalMode>('weight');
  const [logModalSite, setLogModalSite] = useState<BodyMeasurementSite>('waist');
  const units = useUnits();
  const latestWeighIn = latestBodyweightLog(biometrics);
  const hasBodyweight = hasMeasuredBodyweight(biometrics);
  const activeWidgets = useMemo(() => resolveProgressWidgets(profile.progressWidgets), [profile.progressWidgets]);
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
    () => buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, calculateWeeklyMuscleVolume(workouts, exerciseCatalog), activities),
    [workouts, biometrics, exerciseCatalog, profile, activities]
  );
  const muscleProgress = useMemo(() => {
    return buildMuscleProgress({
      workouts,
      exerciseCatalog,
      biometrics,
      knowledgeGraph,
      bodyweightKg: hasBodyweight ? bodyweightEmaKg : 0,
      formatLength: fmt.length,
    });
  }, [workouts, exerciseCatalog, biometrics, knowledgeGraph, hasBodyweight, bodyweightEmaKg, fmt]);
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
  const personalBests = useMemo(
    () => buildPersonalBests(workouts, hasBodyweight ? bodyweightEmaKg : 0, biometrics),
    [workouts, hasBodyweight, bodyweightEmaKg, biometrics]
  );
  const trophies = useMemo(() => trophyCase(personalBests), [personalBests]);
  const lifetime = useMemo(() => buildTrainingTotals(workouts), [workouts]);
  const recent = useMemo(() => buildTrainingTotals(workouts, RECENT_DAYS), [workouts]);
  const pace = useMemo(() => weightPace(biometrics, profile.goalPhase), [biometrics, profile.goalPhase]);
  const weightChart = compositionCharts.find((c) => c.id === 'bodyweight');
  const stepsChart = useMemo(() => buildStepsChart(biometrics), [biometrics]);
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
    onContextChange?.({ goalId: openGoalId ?? undefined, detail: openGoalId ? undefined : detail ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, openGoalId]);
  // Leaving the Progress page clears it.
  useEffect(() => () => onContextChange?.({}), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each screen opens at its top, not where the last one was scrolled to.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [detail, openGoalId]);

  const openLogMeasurements = (site: BodyMeasurementSite = 'waist') => {
    setOpenGoalId(null);
    setDetail('measurements');
    setLogModalMode('measurements');
    setLogModalSite(site);
    setShowLogModal(true);
  };

  const openLogForChart = (chart: ProgressChart) => {
    if (chart.category === 'tape') {
      openLogMeasurements(CHART_ID_TO_TAPE_SITE[chart.id] ?? 'waist');
    } else {
      openLogWeight();
    }
  };

  const measuredSymmetryPairs = bodyComposition.bilateralSymmetry.filter(
    (p) => p.status !== 'insufficient_data'
  );
  const savedRenpho = loadSavedRenphoDevices();

  const handleSaveAndShowComposition = (entry: MeasurementEntry) => {
    onSaveMeasurements(entry);
    setDetail(logModalMode === 'weight' ? 'weight' : 'measurements');
  };

  const logWeightPrompt = (
    <div className="wk-card">
      <h2 className="wk-h1">Strength levels</h2>
      <p className="wk-body" style={{ marginTop: fig(24) }}>
        Strength levels compare what you lift with your bodyweight. Log your weight to see them.
      </p>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          openLogWeight();
        }}
        className="wk-button"
        style={{ marginTop: fig(28), background: 'var(--wk-raised)', color: '#fff' }}
      >
        Log weight
      </button>
    </div>
  );

  const cardsTopRef = useRef<HTMLDivElement>(null);

  const detailScreen = detail && (
    <>
      <DetailHeader title={DETAIL_TITLE[detail]} onBack={() => setDetail(null)} />
      <div ref={cardsTopRef} className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
        {detail === 'bests' &&
          (personalBests.length > 0 ? (
            <section className="wk-card" aria-label="All personal bests">
              <p className="wk-body">Your heaviest logged set on each lift, or your most reps where there is no weight to add.</p>
              <ul className="flex flex-col" style={{ marginTop: fig(20) }}>
                {personalBests.map((b) => {
                  const shown = bestValue(b);
                  return (
                    <li
                      key={b.exerciseId}
                      className="flex items-center justify-between"
                      style={{ gap: fig(24), padding: `${fig(26)} 0`, borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}
                    >
                      <div className="min-w-0">
                        <p className="wk-label" style={{ lineHeight: 1.21 }}>
                          {b.exerciseName}
                        </p>
                        <p className="wk-caption" style={{ marginTop: fig(8) }}>
                          {shortDate(b.date)}
                          {b.e1rmKg > 0
                            ? ` • estimated max ${units.formatPrecise(b.e1rmKg)}${b.includesBodyweight ? ' (bodyweight + added weight)' : ''}`
                            : ''}
                        </p>
                      </div>
                      <p className="font-bold text-white tabular-numbers shrink-0 text-right" style={{ fontSize: `max(12px, ${fig(40)})`, lineHeight: 1 }}>
                        {shown.value}
                        <span className="font-semibold" style={{ fontSize: `max(12px, ${fig(22)})`, color: 'var(--wk-muted)', marginLeft: fig(8) }}>
                          {shown.unit}
                        </span>
                      </p>
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
              <h2 className="wk-label">All time</h2>
              <StatRow
                stats={[
                  { label: `Volume (${units.unit})`, value: whole(lifetime.volumeKg) },
                  { label: 'Reps', value: lifetime.reps.toLocaleString() },
                  { label: 'Workouts', value: lifetime.workouts.toLocaleString() },
                ]}
              />
            </section>
            {strengthCharts.map((chart) => (
              <ProgressChartCard key={chart.id} chart={chart} />
            ))}
          </>
        )}

        {detail === 'recent' && (
          <>
            <section className="wk-card" aria-label={`Totals for the last ${RECENT_DAYS} days`}>
              <h2 className="wk-label">Last {RECENT_DAYS} days</h2>
              <StatRow
                stats={[
                  { label: `Volume (${units.unit})`, value: whole(recent.volumeKg) },
                  { label: 'Reps', value: recent.reps.toLocaleString() },
                  { label: 'Workouts', value: recent.workouts.toLocaleString() },
                ]}
              />
            </section>
            {muscleProgress.length > 0 ? (
              muscleProgress.map((m) => <MuscleProgressCard key={m.key} progress={m} formatLength={fmt.length} />)
            ) : (
              <div className="wk-card">
                <h2 className="wk-h1">Muscles</h2>
                <p className="wk-body" style={{ marginTop: fig(24) }}>
                  Finish a workout to see each muscle's weekly sets, strength and size here.
                </p>
              </div>
            )}
          </>
        )}

        {detail === 'steps' && (
          <>
            <section className="wk-card" aria-label="Daily step summary">
              <h2 className="wk-label">Daily steps</h2>
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
                  className="wk-bar"
                  style={{ marginTop: fig(32) }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={stepsGoal.target}
                  aria-valuenow={todaySteps}
                  aria-label={`${todaySteps.toLocaleString()} of ${stepsGoal.target.toLocaleString()} steps today`}
                >
                  <div style={{ width: `${Math.min(100, (todaySteps / stepsGoal.target) * 100)}%` }} />
                </div>
              )}
              <p className="wk-body" style={{ marginTop: fig(24) }}>
                {stepsChart.summary}
              </p>
            </section>
            <ProgressChartCard chart={stepsChart} />
            {stepsChart.points.length > 0 && (
              <section className="wk-card" aria-label="Recent daily step counts">
                <h2 className="wk-label">Recent days</h2>
                <ul className="flex flex-col" style={{ marginTop: fig(20) }}>
                  {[...stepsChart.points].reverse().slice(0, 14).map((pt) => (
                    <li
                      key={pt.date}
                      className="flex items-center justify-between"
                      style={{ gap: fig(20), padding: `${fig(22)} 0`, borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}
                    >
                      <span className="wk-body">{shortDate(pt.date)}</span>
                      <span className="font-bold text-white tabular-numbers" style={{ fontSize: `max(12px, ${fig(36)})` }}>
                        {Math.round(pt.value).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {detail === 'goals' && (
          <GoalSettingsScreen profile={profile} goals={knowledgeGraph.goals} onUpdateProfile={onUpdateProfile} onUpdateGoalPhase={onUpdateGoalPhase} />
        )}

        {detail === 'widgets' && (
          <ProgressWidgetsScreen
            activeWidgets={activeWidgets}
            exerciseCatalog={exerciseCatalog}
            workouts={workouts}
            isDefault={profile.progressWidgets === undefined}
            onToggle={(id) => onUpdateProfile({ progressWidgets: toggleProgressWidget(profile.progressWidgets, id) })}
            onReset={() => onUpdateProfile({ progressWidgets: undefined })}
          />
        )}

        {detail === 'standards' && (
          <>
            {hasBodyweight ? (
              <>
                <StrengthLevelsCard report={movementStandards} latestBiometrics={latestBiometrics} />
                <BalanceCard report={movementStandards} />
              </>
            ) : (
              logWeightPrompt
            )}
            {/* How progress is worked out, joint load and recovery insights. */}
            <KnowledgeGraphCard workouts={workouts} biometrics={biometrics} exerciseCatalog={exerciseCatalog} profile={profile} weeklyVolume={weeklyVolume} />
          </>
        )}

        {(detail === 'weight' || detail === 'measurements') && (
          <>
                      {/* One log button: it logs whatever the tab above shows. */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              if (compositionView === 'weight') openLogWeight();
              else openLogMeasurements('waist');
            }}
            className="wk-button gap-[calc(16*var(--f))]"
            style={{ background: 'var(--wk-accent)', color: '#13181C' }}
          >
            {compositionView === 'weight' ? <Scale className="w-4 h-4 stroke-[2]" /> : <Ruler className="w-4 h-4 stroke-[2]" />}
            <span>{compositionView === 'weight' ? 'Log weight' : 'Log measurements'}</span>
          </button>

          {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape) && (
            <div className="flex flex-wrap items-center justify-between gap-[calc(16*var(--f))] px-[calc(26*var(--f))] py-[calc(16*var(--f))] rounded-[calc(22*var(--f))]" style={{ background: 'var(--wk-card)' }}>
              <div className="flex items-center gap-[calc(12*var(--f))] text-[length:max(12px,calc(26*var(--f)))] font-semibold text-[color:var(--wk-accent)]">
                <Bluetooth className="w-3.5 h-3.5 stroke-[2]" />
                <span>Remembered: {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape)?.name}</span>
              </div>
              {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape)?.lastSummary && (
                <span className="text-[length:max(12px,calc(26*var(--f)))] text-[color:var(--wk-body)]">
                  Last: {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape)?.lastSummary}
                </span>
              )}
            </div>
          )}

          {(compositionView === 'weight'
            ? bodyComposition.populatedScaleCount > 0
            : bodyComposition.populatedTapeCount > 0) && (
            <div className="wk-card space-y-[calc(26*var(--f))]">
              <h2 className="wk-label">{compositionView === 'weight' ? 'Body composition' : 'Symmetry'}</h2>
              {compositionView === 'weight' ? (
                <>
                  <p className="wk-body text-[color:var(--wk-body)]">{bodyComposition.recompositionSummary}</p>
                  {/* The latest reading of each metric, from the same series as the charts below. */}
                  {visibleCompositionCharts.some((c) => c.id !== 'bodyweight' && c.points.length > 0) && (
                    <dl className="grid grid-cols-2 gap-x-[calc(38*var(--f))] gap-y-[calc(26*var(--f))] pt-[calc(8*var(--f))]">
                      {visibleCompositionCharts
                        .filter((c) => c.id !== 'bodyweight' && c.points.length > 0)
                        .map((c) => (
                          <div key={c.id} className="min-w-0">
                            <dt className="text-[length:max(12px,calc(26*var(--f)))] text-[color:var(--wk-muted)]">{c.title}</dt>
                            <dd className="text-[length:max(12px,calc(30*var(--f)))] font-bold text-white">{c.format(c.points[c.points.length - 1].value)}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                </>
              ) : measuredSymmetryPairs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-[calc(16*var(--f))] pt-[calc(8*var(--f))]">
                  {measuredSymmetryPairs.map((pair) => (
                    <div key={pair.id} className="rounded-[calc(22*var(--f))] p-[calc(22*var(--f))]" style={{ background: 'var(--wk-raised)' }}>
                      <span className="block text-[length:max(12px,calc(26*var(--f)))] text-[color:var(--wk-muted)] font-semibold">{pair.label}</span>
                      <span className="block text-[length:max(12px,calc(30*var(--f)))] font-bold text-white font-mono mt-[calc(4*var(--f))]">
                        L {fmt.length(pair.leftCm!)} · R {fmt.length(pair.rightCm!)}
                      </span>
                      <span className="block text-[length:max(12px,calc(26*var(--f)))] text-[color:var(--wk-accent)] mt-[calc(4*var(--f))]">
                        {pair.status === 'balanced'
                          ? 'Balanced'
                          : `${pair.dominantSide === 'right' ? 'Right' : 'Left'} +${fmt.length(Math.abs(pair.diffCm ?? 0))}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wk-body text-[color:var(--wk-body)]">Measure both arms, thighs or calves to compare your left and right sides.</p>
              )}
            </div>
          )}

          {visibleCompositionCharts.map((chart) => (
            <ProgressChartCard key={chart.id} chart={chart} onOpen={() => openLogForChart(chart)} />
          ))}
          </>
        )}
      </div>
    </>
  );

  const renderProgressMenu = (close: () => void) => (
    <div
      role="menu"
      aria-label="Progress options"
      className="w-60 rounded-2xl bg-[#2C3034] border border-white/[0.08] shadow-2xl p-1.5 space-y-1 text-left"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          triggerHaptic('light');
          close();
          setDetail('goals');
        }}
        className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-white/85 hover:text-white hover:bg-white/[0.06] flex items-center gap-2.5 min-h-[44px]"
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
        className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-white/85 hover:text-white hover:bg-white/[0.06] flex items-center justify-between gap-2 min-h-[44px]"
      >
        <span className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-4 h-4 stroke-[2] shrink-0" />
          <span>Customize widgets</span>
        </span>
        <span className="text-xs font-semibold text-white/55 tabular-numbers">
          {activeWidgets.length} active
        </span>
      </button>
    </div>
  );

  const overview = (
    <>
      <header className="relative" style={{ paddingTop: fig(20) }}>
        <div className="relative flex items-center justify-center">
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
            <MoreHorizontal style={{ width: fig(48), height: fig(48) }} strokeWidth={2} aria-hidden="true" />
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
        className="flex flex-col"
        style={{ gap: fig(22), marginTop: hasWidget('goals') ? fig(70) : fig(48) }}
      >
        {hasWidget('trophy-case') && (
          <OverviewCard title="Trophy case" opens="all personal bests" onOpen={() => setDetail('bests')}>
            {trophies.length > 0 ? (
              <StatRow
                stats={trophies.map((b) => {
                  const shown = bestValue(b);
                  return { label: shortLiftName(b.exerciseName), value: shown.value, unit: shown.unit };
                })}
              />
            ) : (
              <p className="wk-body" style={{ marginTop: fig(24) }}>
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
            <p className="wk-caption" style={{ marginTop: fig(10) }}>
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
              <div className="flex items-end justify-between" style={{ gap: fig(24), marginTop: fig(36) }}>
                <div className="min-w-0">
                  <p className="wk-caption">
                    {todaySteps > 0 ? 'Today' : `Latest (${shortDate(latestStepsEntry!.date)})`}
                  </p>
                  <p className="font-bold text-white tabular-numbers" style={{ fontSize: `max(12px, ${fig(64)})`, lineHeight: 1, marginTop: fig(10) }}>
                    {Math.round(todaySteps > 0 ? todaySteps : latestStepsEntry!.value).toLocaleString()}
                  </p>
                  {avgSteps7d !== null && (
                    <p className="wk-caption" style={{ marginTop: fig(12) }}>
                      7-day avg {avgSteps7d.toLocaleString()}
                    </p>
                  )}
                  {stepsGoal && (
                    <span
                      className="wk-pill"
                      style={{
                        textTransform: 'none',
                        marginTop: fig(14),
                        background: todaySteps >= stepsGoal.target ? 'rgba(0,241,159,0.16)' : 'var(--wk-pill)',
                        color: todaySteps >= stepsGoal.target ? 'var(--wk-accent)' : '#C9CDD0',
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
                    label={`Daily steps from ${Math.round(stepsChart.points[0].value).toLocaleString()} to ${Math.round(stepsChart.points[stepsChart.points.length - 1].value).toLocaleString()}`}
                  />
                )}
              </div>
            ) : (
              <>
                <StatRow stats={[{ label: 'Today', value: '—' }, { label: '7-day avg', value: '—' }, { label: 'Goal', value: stepsGoal ? stepsGoal.target.toLocaleString() : '—' }]} />
                <p className="wk-body" style={{ marginTop: fig(20) }}>
                  {stepsChart.summary}
                </p>
              </>
            )}
          </OverviewCard>
        )}

        {hasWidget('body-weight') && (
          <OverviewCard title="Body weight" opens="weight, body composition and logging" onOpen={() => setDetail('weight')}>
            <p className="wk-body" style={{ marginTop: fig(12) }}>
              {weightChart?.summary}
            </p>
            {latestWeighIn && (
              <div className="flex items-end justify-between" style={{ gap: fig(24), marginTop: fig(44) }}>
                <div className="min-w-0">
                  <p className="font-bold text-white tabular-numbers uppercase" style={{ fontSize: `max(12px, ${fig(64)})`, lineHeight: 1 }}>
                    {units.formatPrecise(latestWeighIn.bodyweightKg)}
                  </p>
                  {pace && (
                    <span
                      className="wk-pill"
                      style={{
                        textTransform: 'none',
                        marginTop: fig(16),
                        background: pace.pace === 'on' ? 'rgba(0,241,159,0.16)' : 'var(--wk-pill)',
                        color: pace.pace === 'on' ? 'var(--wk-accent)' : '#C9CDD0',
                      }}
                    >
                      {pace.direction === 'steady' ? 'Your weight is steady' : pace.direction === 'losing' ? "You're losing weight" : "You're gaining weight"}
                    </span>
                  )}
                </div>
                <Sparkline
                  points={weightChart?.points ?? []}
                  label={`7-day average weight from ${units.formatPrecise(weightChart?.points[0]?.value ?? 0)} to ${units.formatPrecise(weightChart?.points[weightChart.points.length - 1]?.value ?? 0)}`}
                />
              </div>
            )}
          </OverviewCard>
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
              <p className="wk-body" style={{ marginTop: fig(24) }}>
                Start with your waist: it says the most about your fitness. Measure at the navel, first thing in the morning.
              </p>
            )}
          </OverviewCard>
        )}

        {hasWidget('strength-standards') && (
          <OverviewCard title="Strength standards" opens="your level on each lift" onOpen={() => setDetail('standards')}>
            {hasBodyweight && movementStandards.levels.some((l) => l.logged && l.source !== 'none') ? (
              <>
                <p className="wk-body" style={{ marginTop: fig(12) }}>
                  Your best estimated max on each lift against published standards for {movementStandards.tableLabel} at your bodyweight.
                </p>
                <div className="flex justify-center" style={{ marginTop: fig(20) }}>
                  <StandardsRadar report={movementStandards} />
                </div>
              </>
            ) : (
              <p className="wk-body" style={{ marginTop: fig(24) }}>
                {hasBodyweight
                  ? 'Log a squat, deadlift, bench press, overhead press or chin-up to see your level.'
                  : 'Strength levels compare what you lift with your bodyweight. Log your weight to see them.'}
              </p>
            )}
          </OverviewCard>
        )}

        {hasWidget('strength-levels') &&
          (hasBodyweight ? (
            <StrengthLevelsCard report={movementStandards} latestBiometrics={latestBiometrics} />
          ) : (
            logWeightPrompt
          ))}

        {hasWidget('balance') && <BalanceCard report={movementStandards} />}

        {activeWidgets.map((wid) => {
          const parsed = parseProgressWidgetId(wid);
          if (parsed.kind === 'chart') {
            const chart =
              compositionCharts.find((c) => c.id === parsed.chartId) ??
              strengthCharts.find((c) => c.id === parsed.chartId);
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
            return <ProgressChartCard key={wid} chart={chart} />;
          }
          return null;
        })}

        {activeWidgets.length === 0 && (
          <section className="wk-card" aria-label="No widgets selected">
            <h2 className="wk-h1">Progress widgets hidden</h2>
            <p className="wk-body" style={{ marginTop: fig(16) }}>
              Choose what you want to track here, or ask Treise in chat to add widgets back.
            </p>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setDetail('widgets');
              }}
              className="wk-button"
              style={{ marginTop: fig(28), background: 'var(--wk-raised)', color: '#fff' }}
            >
              Customize widgets
            </button>
          </section>
        )}
      </div>
    </>
  );

  const goalScreen = openGoal && (
    <>
      <DetailHeader title={openGoal.title} onBack={() => setOpenGoalId(null)} />
      <div ref={cardsTopRef} className="flex flex-col" style={{ gap: fig(22), marginTop: fig(32) }}>
        <GoalDetailScreen
          goal={openGoal}
          goals={knowledgeGraph.goals}
          strengthIndex={strengthIndex}
          weightIndex={weightIndex}
          supporting={compositionCharts.filter((c) => (c.id === 'lean-mass' || c.id === 'waist') && c.points.length > 0)}
          onOpenGoal={setOpenGoalId}
          onLogWeight={openLogWeight}
          onLogMeasurements={() => openLogMeasurements('waist')}
        />
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setOpenGoalId(null);
            setDetail('goals');
          }}
          className="wk-button"
          style={{ background: 'var(--wk-raised)', color: '#fff' }}
        >
          Change goals
        </button>
      </div>
    </>
  );

  return (
    <div className="wk -mx-3.5" style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 120 }}>
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
    </div>
  );
};
