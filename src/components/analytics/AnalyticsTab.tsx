import React, { useEffect, useMemo, useState } from 'react';
import { Scale, Ruler, Bluetooth } from 'lucide-react';
import { BiometricLog, BodyMeasurementSite, ExerciseDefinition, UserProfile, WorkoutSession } from '../../engine/types';
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
import { buildCompositionCharts, buildStrengthCharts, ProgressChart, ProgressFormatters } from '../../services/progressSeries';
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
import { triggerHaptic } from '../../utils/haptics';
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
  onSaveMeasurements: (entry: MeasurementEntry) => void;
  /** Changes when the "Log Weight" shortcut is used; opens the weigh-in form. */
  openLogWeightRequest?: number;
  onLogWeightRequestHandled?: () => void;
}

/** The overview, or one of the screens its cards open. */
type ProgressDetail = 'bests' | 'lifetime' | 'recent' | 'weight' | 'measurements' | 'standards';
type CompositionView = 'weight' | 'measurements';

const DETAIL_TITLE: Record<ProgressDetail, string> = {
  bests: 'Trophy case',
  lifetime: 'Lifetime stats',
  recent: 'Recent stats',
  weight: 'Body weight',
  measurements: 'Measurements',
  standards: 'Strength standards',
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
  onSaveMeasurements,
  openLogWeightRequest = 0,
  onLogWeightRequestHandled,
}) => {
  const [detail, setDetail] = useState<ProgressDetail | null>(null);
  const compositionView: CompositionView = detail === 'measurements' ? 'measurements' : 'weight';
  const [showLogModal, setShowLogModal] = useState(false);
  const [logModalMode, setLogModalMode] = useState<LogModalMode>('weight');
  const [logModalSite, setLogModalSite] = useState<BodyMeasurementSite>('waist');
  const units = useUnits();
  const latestWeight = [...biometrics].reverse().find((b) => b.bodyweightKg > 0)?.bodyweightKg || 0;
  const hasBodyweight = latestWeight > 0;

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
    () => buildStrengthCharts({ workouts, profile, bodyweightKg: hasBodyweight ? bodyweightEmaKg : 80, fmt }),
    [workouts, profile, bodyweightEmaKg, hasBodyweight, fmt]
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
      bodyweightKg: hasBodyweight ? bodyweightEmaKg : 80,
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
  const goalRings = useMemo(() => buildGoalRings(knowledgeGraph.goals), [knowledgeGraph]);
  const goalsSummary = useMemo(() => buildGoalsSummary(knowledgeGraph.goals, (kg) => units.formatPrecise(kg)), [knowledgeGraph, units]);
  const personalBests = useMemo(() => buildPersonalBests(workouts, hasBodyweight ? bodyweightEmaKg : undefined), [workouts, hasBodyweight, bodyweightEmaKg]);
  const trophies = useMemo(() => trophyCase(personalBests), [personalBests]);
  const lifetime = useMemo(() => buildTrainingTotals(workouts), [workouts]);
  const recent = useMemo(() => buildTrainingTotals(workouts, RECENT_DAYS), [workouts]);
  const pace = useMemo(() => weightPace(biometrics, profile.goalPhase), [biometrics, profile.goalPhase]);
  const weightChart = compositionCharts.find((c) => c.id === 'bodyweight');
  const tapeHighlights = useMemo(() => measurementHighlights(compositionCharts), [compositionCharts]);
  const latestWeighIn = [...biometrics].reverse().find((b) => b.bodyweightKg > 0);
  const bestValue = (b: (typeof personalBests)[number]) =>
    b.isBodyweight ? { value: `${b.reps}`, unit: 'reps' } : { value: units.format(b.weightKg, false), unit: `${units.unit} × ${b.reps}` };
  const whole = (kg: number) => Math.round(units.toDisplay(kg)).toLocaleString();

  const openLogWeight = () => {
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

  // Each screen opens at its top, not where the last one was scrolled to.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [detail]);

  const openLogMeasurements = (site: BodyMeasurementSite = 'waist') => {
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

  const detailScreen = detail && (
    <>
      <DetailHeader title={DETAIL_TITLE[detail]} onBack={() => setDetail(null)} />
      <div className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
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
                          {b.e1rmKg > 0 ? ` • estimated max ${units.formatPrecise(b.e1rmKg)}` : ''}
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
            className="wk-button gap-2"
            style={{ background: 'var(--wk-accent)', color: '#13181C' }}
          >
            {compositionView === 'weight' ? <Scale className="w-4 h-4 stroke-[2]" /> : <Ruler className="w-4 h-4 stroke-[2]" />}
            <span>{compositionView === 'weight' ? 'Log weight' : 'Log measurements'}</span>
          </button>

          {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--wk-card)' }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00F19F]">
                <Bluetooth className="w-3.5 h-3.5 stroke-[2]" />
                <span>Remembered: {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape)?.name}</span>
              </div>
              {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape)?.lastSummary && (
                <span className="text-xs text-[#C6C6C6]">
                  Last: {(compositionView === 'weight' ? savedRenpho.scale : savedRenpho.tape)?.lastSummary}
                </span>
              )}
            </div>
          )}

          {(compositionView === 'weight'
            ? bodyComposition.populatedScaleCount > 0
            : bodyComposition.populatedTapeCount > 0) && (
            <div className="wk-card space-y-3">
              <h2 className="wk-h2 text-white">{compositionView === 'weight' ? 'Body composition' : 'Symmetry'}</h2>
              {compositionView === 'weight' ? (
                <>
                  <p className="wk-body text-[#C6C6C6]">{bodyComposition.recompositionSummary}</p>
                  {/* The latest reading of each metric, from the same series as the charts below. */}
                  {visibleCompositionCharts.some((c) => c.id !== 'bodyweight' && c.points.length > 0) && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
                      {visibleCompositionCharts
                        .filter((c) => c.id !== 'bodyweight' && c.points.length > 0)
                        .map((c) => (
                          <div key={c.id} className="min-w-0">
                            <dt className="text-xs text-[#AAABAD]">{c.title}</dt>
                            <dd className="text-sm font-bold text-white">{c.format(c.points[c.points.length - 1].value)}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                </>
              ) : measuredSymmetryPairs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {measuredSymmetryPairs.map((pair) => (
                    <div key={pair.id} className="rounded-xl p-2.5" style={{ background: 'var(--wk-surface)' }}>
                      <span className="block text-xs text-[#AAABAD] font-semibold">{pair.label}</span>
                      <span className="block text-sm font-bold text-white font-mono mt-0.5">
                        L {fmt.length(pair.leftCm!)} · R {fmt.length(pair.rightCm!)}
                      </span>
                      <span className="block text-xs text-[#00F19F] mt-0.5">
                        {pair.status === 'balanced'
                          ? 'Balanced'
                          : `${pair.dominantSide === 'right' ? 'Right' : 'Left'} +${fmt.length(Math.abs(pair.diffCm ?? 0))}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wk-body text-[#C6C6C6]">Measure both arms, thighs or calves to compare your left and right sides.</p>
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

  const overview = (
    <>
      <header style={{ paddingTop: fig(20) }}>
        <h1 className="font-bold text-white uppercase text-center" style={{ fontSize: `max(12px, ${fig(26)})`, letterSpacing: '0.02em' }}>
          Progress
        </h1>
      </header>

      <GoalsHero rings={goalRings} summary={goalsSummary} />

      <div className="flex flex-col" style={{ gap: fig(22), marginTop: fig(70) }}>
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

        <OverviewCard title="Lifetime stats" opens="your training over time" onOpen={() => setDetail('lifetime')}>
          <StatRow
            stats={[
              { label: `Volume (${units.unit})`, value: whole(lifetime.volumeKg) },
              { label: 'Reps', value: lifetime.reps.toLocaleString() },
              { label: 'Workouts', value: lifetime.workouts.toLocaleString() },
            ]}
          />
        </OverviewCard>

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
      </div>
    </>
  );

  return (
    <div className="wk -mx-3.5" style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 112 }}>
      {detailScreen || overview}

      {showLogModal && (
        <WeightLogModal
          currentWeight={latestWeight}
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
