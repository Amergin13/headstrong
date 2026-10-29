import React, { useMemo, useState } from 'react';
import { Scale, Ruler, Bluetooth } from 'lucide-react';
import { BiometricLog, BodyMeasurementSite, ExerciseDefinition, UserProfile, WorkoutSession } from '../../engine/types';
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
  exerciseCatalog: ExerciseDefinition[];
  weeklyVolume: Record<string, number>;
  onSaveMeasurements: (entry: MeasurementEntry) => void;
}

type ProgressView = 'strength' | 'muscles' | 'composition';
type CompositionFilter = 'all' | 'scale' | 'tape';

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  workouts,
  biometrics,
  profile,
  bodyweightEmaKg,
  exerciseCatalog,
  weeklyVolume,
  onSaveMeasurements,
}) => {
  const [activeView, setActiveView] = useState<ProgressView>('strength');
  const [compositionFilter, setCompositionFilter] = useState<CompositionFilter>('all');
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
    () => buildBodyCompositionKnowledgeGraph(biometrics, profile),
    [biometrics, profile]
  );
  const filteredCompositionCharts = useMemo(() => {
    if (compositionFilter === 'all') return compositionCharts;
    return compositionCharts.filter((c) => c.category === compositionFilter);
  }, [compositionCharts, compositionFilter]);

  const openLogWeight = () => {
    setLogModalMode('weight');
    setShowLogModal(true);
  };

  const openLogMeasurements = (site: BodyMeasurementSite = 'waist') => {
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

  const segment = (view: ProgressView, label: string) => (
    <button
      type="button"
      aria-pressed={activeView === view}
      onClick={() => {
        triggerHaptic('light');
        setActiveView(view);
      }}
      className="flex items-center justify-center font-bold uppercase transition-colors"
      style={{
        minHeight: 44,
        height: fig(96),
        borderRadius: fig(22),
        fontSize: fig(24),
        background: activeView === view ? 'var(--wk-pill)' : 'transparent',
        color: activeView === view ? '#fff' : 'var(--wk-muted)',
      }}
    >
      {label}
    </button>
  );

  const filterPill = (filter: CompositionFilter, label: string) => (
    <button
      type="button"
      aria-pressed={compositionFilter === filter}
      onClick={() => {
        triggerHaptic('light');
        setCompositionFilter(filter);
      }}
      className="px-3.5 py-2 rounded-full text-xs font-bold transition-colors min-h-[44px]"
      style={{
        background: compositionFilter === filter ? 'var(--wk-pill)' : 'var(--wk-card)',
        color: compositionFilter === filter ? '#fff' : 'var(--wk-muted)',
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
  };

  return (
    <div className="wk -mx-3.5" style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 112 }}>
      <header style={{ paddingTop: fig(20) }}>
        <h1 className="font-bold text-white uppercase text-center" style={{ fontSize: fig(26), letterSpacing: '0.02em' }}>
          Progress
        </h1>
        <div
          role="group"
          aria-label="Progress category"
          className="grid grid-cols-3"
          style={{ marginTop: fig(40), padding: fig(8), gap: fig(8), borderRadius: fig(30), background: 'var(--wk-card)' }}
        >
          {segment('strength', 'Strength')}
          {segment('muscles', 'Muscles')}
          {segment('composition', 'Body')}
        </div>
      </header>

      <div className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
        {/* Separated Weight vs Measurements Actions — Always visible at the top of Progress */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                openLogWeight();
              }}
              aria-label="Log weight manually or step on RENPHO scale"
              className="wk-button gap-2"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              <Scale className="w-4 h-4 stroke-[2]" />
              <span>Log weight</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                openLogMeasurements('waist');
              }}
              aria-label="Log body tape measurements"
              className="wk-button gap-2"
              style={{ background: 'var(--wk-card)', color: '#fff' }}
            >
              <Ruler className="w-4 h-4 stroke-[2]" />
              <span>Log measurements</span>
            </button>
          </div>

          {(savedRenpho.scale || savedRenpho.tape) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--wk-card)' }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00F19F]">
                <Bluetooth className="w-3.5 h-3.5 stroke-[2]" />
                <span>
                  Remembered:{' '}
                  {[savedRenpho.scale?.name, savedRenpho.tape?.name].filter(Boolean).join(' · ')}
                </span>
              </div>
              {(savedRenpho.scale?.lastSummary || savedRenpho.tape?.lastSummary) && (
                <span className="text-xs text-[#C6C6C6]">
                  Last: {savedRenpho.scale?.lastSummary ?? savedRenpho.tape?.lastSummary}
                </span>
              )}
            </div>
          )}
        </div>

        {activeView === 'muscles' ? (
          muscleProgress.length > 0 ? (
            muscleProgress.map((m) => <MuscleProgressCard key={m.key} progress={m} formatLength={fmt.length} />)
          ) : (
            <div className="wk-card">
              <h2 className="wk-h1">Muscles</h2>
              <p className="wk-body" style={{ marginTop: fig(24) }}>
                Finish a workout to see each muscle's weekly sets, strength and size here.
              </p>
            </div>
          )
        ) : activeView === 'strength' ? (
          <>
            {strengthCharts.map((chart) => (
              <ProgressChartCard key={chart.id} chart={chart} />
            ))}
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
              aria-label="Filter composition metrics"
              className="grid grid-cols-3 gap-2"
            >
              {filterPill('all', 'All Metrics')}
              {filterPill('scale', 'Scale')}
              {filterPill('tape', 'Tape')}
            </div>

            {(bodyComposition.populatedScaleCount > 0 || bodyComposition.populatedTapeCount > 0) && (
              <div className="wk-card space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="wk-h2 text-white">Body Composition & Symmetry</h2>
                  <span className="text-xs font-bold text-[#00F19F]">
                    {bodyComposition.populatedScaleCount}/13 Scale · {bodyComposition.populatedTapeCount}/12 Tape
                  </span>
                </div>
                <p className="wk-body text-[#C6C6C6]">{bodyComposition.recompositionSummary}</p>

                {measuredSymmetryPairs.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {measuredSymmetryPairs.map((pair) => (
                      <div
                        key={pair.id}
                        className="rounded-xl p-2.5"
                        style={{ background: 'var(--wk-surface)' }}
                      >
                        <span className="block text-xs text-[#AAABAD] font-semibold">
                          {pair.label}
                        </span>
                        <span className="block text-sm font-bold text-white font-mono mt-0.5">
                          L {fmt.length(pair.leftCm!)} · R {fmt.length(pair.rightCm!)}
                        </span>
                        <span className="block text-xs text-[#00F19F] mt-0.5">
                          {pair.status === 'balanced'
                            ? 'Balanced'
                            : `${pair.dominantSide === 'right' ? 'Right' : 'Left'} +${fmt.length(
                                Math.abs(pair.diffCm ?? 0)
                              )}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {filteredCompositionCharts.map((chart) => (
              <ProgressChartCard
                key={chart.id}
                chart={chart}
                onOpen={() => openLogForChart(chart)}
              />
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
          athleteAge={profile.age}
          athleteGender={profile.gender}
          onSave={handleSaveAndShowComposition}
          onAutoCapture={handleSaveAndShowComposition}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
};
