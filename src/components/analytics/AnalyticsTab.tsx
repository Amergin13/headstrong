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
  onSaveMeasurements: (entry: MeasurementEntry) => void;
  /** Changes when the "Log Weight" shortcut is used; opens the weigh-in form. */
  openLogWeightRequest?: number;
  onLogWeightRequestHandled?: () => void;
}

/** Strength (lifts and each muscle) or Composition (weight and tape measurements). */
type ProgressView = 'strength' | 'composition';
type CompositionView = 'weight' | 'measurements';

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  workouts,
  biometrics,
  profile,
  bodyweightEmaKg,
  latestBiometrics,
  exerciseCatalog,
  weeklyVolume,
  onSaveMeasurements,
  openLogWeightRequest = 0,
  onLogWeightRequestHandled,
}) => {
  const [activeView, setActiveView] = useState<ProgressView>('strength');
  const [compositionView, setCompositionView] = useState<CompositionView>('weight');
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
  const muscleProgress = useMemo(() => {
    const knowledgeGraph = buildAthleteKnowledgeGraph(
      workouts,
      biometrics,
      exerciseCatalog,
      profile,
      calculateWeeklyMuscleVolume(workouts, exerciseCatalog)
    );
    return buildMuscleProgress({
      workouts,
      exerciseCatalog,
      biometrics,
      knowledgeGraph,
      bodyweightKg: hasBodyweight ? bodyweightEmaKg : 80,
      formatLength: fmt.length,
    });
  }, [workouts, exerciseCatalog, biometrics, profile, hasBodyweight, bodyweightEmaKg, fmt]);
  const bodyComposition = useMemo(
    () => buildBodyCompositionKnowledgeGraph(biometrics, profile, fmt),
    [biometrics, profile, fmt]
  );
  const visibleCompositionCharts = useMemo(
    () => compositionCharts.filter((c) => c.category === (compositionView === 'weight' ? 'scale' : 'tape')),
    [compositionCharts, compositionView]
  );

  const openLogWeight = () => {
    setCompositionView('weight');
    setLogModalMode('weight');
    setShowLogModal(true);
  };

  useEffect(() => {
    if (openLogWeightRequest > 0) {
      setActiveView('composition');
      openLogWeight();
      onLogWeightRequestHandled?.();
    }
  }, [openLogWeightRequest]);

  const openLogMeasurements = (site: BodyMeasurementSite = 'waist') => {
    setCompositionView('measurements');
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

  /** One button of a two-way switch (top: Strength / Composition; inside Composition: Weight / Measurements). */
  const segment = (selected: boolean, label: string, onSelect: () => void, size: 'page' | 'sub' = 'page') => (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        triggerHaptic('light');
        onSelect();
      }}
      className="flex items-center justify-center font-bold uppercase transition-colors"
      style={{
        minHeight: 44,
        height: fig(size === 'page' ? 96 : 84),
        borderRadius: fig(22),
        fontSize: `max(12px, ${fig(24)})`,
        background: selected ? 'var(--wk-pill)' : 'transparent',
        color: selected ? '#fff' : 'var(--wk-muted)',
      }}
    >
      {label}
    </button>
  );

  const measuredSymmetryPairs = bodyComposition.bilateralSymmetry.filter(
    (p) => p.status !== 'insufficient_data'
  );
  const savedRenpho = loadSavedRenphoDevices();

  const handleSaveAndShowComposition = (entry: MeasurementEntry) => {
    onSaveMeasurements(entry);
    setActiveView('composition');
    setCompositionView(logModalMode === 'weight' ? 'weight' : 'measurements');
  };

  return (
    <div className="wk -mx-3.5" style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 112 }}>
      <header style={{ paddingTop: fig(20) }}>
        <h1 className="font-bold text-white uppercase text-center" style={{ fontSize: `max(12px, ${fig(26)})`, letterSpacing: '0.02em' }}>
          Progress
        </h1>
        <div
          role="group"
          aria-label="Progress category"
          className="grid grid-cols-2"
          style={{ marginTop: fig(40), padding: fig(8), gap: fig(8), borderRadius: fig(30), background: 'var(--wk-card)' }}
        >
          {segment(activeView === 'strength', 'Strength', () => setActiveView('strength'))}
          {segment(activeView === 'composition', 'Composition', () => setActiveView('composition'))}
        </div>
      </header>

      <div className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
        {activeView === 'strength' ? (
          <>
            {hasBodyweight ? (
              <>
                <StrengthLevelsCard report={movementStandards} latestBiometrics={latestBiometrics} />
                <BalanceCard report={movementStandards} />
              </>
            ) : (
              <div className="wk-card">
                <h2 className="wk-h1">Strength levels</h2>
                <p className="wk-body" style={{ marginTop: fig(24) }}>
                  Strength levels compare what you lift with your bodyweight. Log your weight in Composition to see them.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveView('composition');
                    openLogWeight();
                  }}
                  className="wk-button"
                  style={{ marginTop: fig(28), background: 'var(--wk-raised)', color: '#fff' }}
                >
                  Log weight
                </button>
              </div>
            )}
            {strengthCharts.map((chart) => (
              <ProgressChartCard key={chart.id} chart={chart} />
            ))}
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
            {/* How progress is worked out, joint load and recovery insights. */}
            <KnowledgeGraphCard
              workouts={workouts}
              biometrics={biometrics}
              exerciseCatalog={exerciseCatalog}
              profile={profile}
              weeklyVolume={weeklyVolume}
            />
          </>
        ) : (
          <>
            <div
              role="group"
              aria-label="Weight or measurements"
              className="grid grid-cols-2"
              style={{ padding: fig(8), gap: fig(8), borderRadius: fig(30), background: 'var(--wk-card)' }}
            >
              {segment(compositionView === 'weight', 'Weight', () => setCompositionView('weight'), 'sub')}
              {segment(compositionView === 'measurements', 'Measurements', () => setCompositionView('measurements'), 'sub')}
            </div>

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
