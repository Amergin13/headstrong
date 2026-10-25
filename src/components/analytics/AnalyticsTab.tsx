import React, { useMemo, useState } from 'react';
import { BiometricLog, ExerciseDefinition, UserProfile, WorkoutSession } from '../../engine/types';
import { MeasurementEntry, WeightLogModal } from './WeightLogModal';
import { KnowledgeGraphCard } from './KnowledgeGraphCard';
import { ProgressChartCard } from './ProgressChartCard';
import { buildCompositionCharts, buildStrengthCharts, ProgressFormatters } from '../../services/progressSeries';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import { kgToUnit } from '../../utils/units';

/** One Figma pixel (1344 px frame) in screen pixels; see .wk in index.css. */
const fig = (px: number) => `calc(${px} * var(--f))`;
const PAGE_GUTTER = 38;

interface AnalyticsTabProps {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  profile: UserProfile;
  bodyweightEmaKg: number;
  exerciseCatalog: ExerciseDefinition[];
  weeklyVolume: Record<string, number>;
  onSaveMeasurements: (entry: MeasurementEntry) => void;
}

type ProgressView = 'strength' | 'composition';

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
  const [showLogModal, setShowLogModal] = useState(false);
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
  const openLog = () => setShowLogModal(true);

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

  return (
    <div className="wk -mx-3.5" style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 112 }}>
      <header style={{ paddingTop: fig(20) }}>
        <h1 className="font-bold text-white uppercase text-center" style={{ fontSize: fig(26), letterSpacing: '0.02em' }}>
          Progress
        </h1>
        <div
          role="group"
          aria-label="Progress category"
          className="grid grid-cols-2"
          style={{ marginTop: fig(40), padding: fig(8), gap: fig(8), borderRadius: fig(30), background: 'var(--wk-card)' }}
        >
          {segment('strength', 'Strength')}
          {segment('composition', 'Composition')}
        </div>
      </header>

      <div className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
        {activeView === 'strength' ? (
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
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                openLog();
              }}
              className="wk-button"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              Log measurements
            </button>
            {compositionCharts.map((chart) => (
              <ProgressChartCard key={chart.id} chart={chart} onOpen={openLog} />
            ))}
          </>
        )}
      </div>

      {showLogModal && (
        <WeightLogModal
          currentWeight={latestWeight}
          currentEma={bodyweightEmaKg}
          heightCm={profile.measuredHeightCm}
          onSave={onSaveMeasurements}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
};
