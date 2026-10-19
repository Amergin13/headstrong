import React, { useState } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import { E1rmVsWeightChart } from './E1rmVsWeightChart';
import { WciChart } from './WciChart';
import { ActivityTracker } from './ActivityTracker';
import { WeightLogModal } from './WeightLogModal';
import { KnowledgeGraphCard } from './KnowledgeGraphCard';
import { triggerHaptic } from '../../utils/haptics';
import { BiometricArcSpeedometer } from '../common/BiometricArcSpeedometer';
import { BiometricCircularGauge } from '../common/BiometricCircularGauge';

interface AnalyticsTabProps {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  profile: UserProfile;
  bodyweightEmaKg: number;
  exerciseCatalog: ExerciseDefinition[];
  weeklyVolume: Record<string, number>;
  onSaveWeight: (weight: number) => void;
}

type ProgressView = 'strength' | 'recovery';

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  workouts,
  biometrics,
  profile,
  bodyweightEmaKg,
  exerciseCatalog,
  weeklyVolume,
  onSaveWeight,
}) => {
  const [activeView, setActiveView] = useState<ProgressView>('strength');
  const [showWeightModal, setShowWeightModal] = useState(false);
  const latestWeight = biometrics[biometrics.length - 1]?.bodyweightKg || 82;
  const latestLog = biometrics[biometrics.length - 1];

  // Compute stress score from resting HR and HRV
  const restingHr = latestLog?.restingHr ?? profile.restingHrBaseline ?? 58;
  const hrv = latestLog?.hrvRmssd ?? 55;
  const stressValue = Math.max(
    0.6,
    Math.min(2.7, Math.round(((restingHr / 58) * 1.5 - (hrv / 55) * 0.4) * 10) / 10)
  );
  const stressStatus = stressValue <= 1.2 ? 'LOW' : stressValue <= 1.8 ? 'MEDIUM' : 'HIGH';
  const stressColor = stressValue <= 1.2 ? 'recovery' : stressValue <= 1.8 ? 'amber' : 'rose';

  const todaySteps = latestLog?.steps ?? 0;

  return (
    <div className="space-y-3.5 pb-28">
      {/* Progress Overview Header & View Switcher */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight">
              Progress &amp; Body Trends
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Strength across all equipment, stamina &amp; joint recovery
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400 font-medium">7-Day Avg Weight</div>
            <div className="text-sm font-extrabold font-mono text-brand-recovery">
              {bodyweightEmaKg} kg
            </div>
          </div>
        </div>

        {/* Hero Biometric Dial Card: Stress Speedometer & Vitality Engine */}
        <div className="biometric-card p-4 border border-white/[0.08] flex flex-col sm:flex-row items-center justify-around gap-4">
          <BiometricArcSpeedometer
            value={stressValue}
            min={0.5}
            max={2.8}
            label="STRESS MONITOR"
            displayValue={`${stressValue} ${stressStatus}`}
            statusText={stressStatus}
            statusColor={stressColor}
            size="sm"
          />

          <div className="h-14 w-px bg-white/[0.08] hidden sm:block" />

          <BiometricCircularGauge
            value={todaySteps}
            max={8500}
            unit="steps"
            label="VITALITY ENGINE"
            sublabel="8,500 Daily Goal"
            variant="strain"
            size="sm"
          />
        </div>

        {/* 2-Way Segmented Switcher to Prevent Long Vertical Scroll */}
        <div
          role="group"
          aria-label="Progress category"
          className="grid grid-cols-2 gap-1 bg-[#08090C] p-1 rounded-2xl border border-white/[0.08]"
        >
          <button
            type="button"
            aria-pressed={activeView === 'strength'}
            onClick={() => {
              triggerHaptic('light');
              setActiveView('strength');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              activeView === 'strength'
                ? 'bg-brand-recovery text-black shadow-md glow-recovery'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Strength &amp; Stamina
          </button>
          <button
            type="button"
            aria-pressed={activeView === 'recovery'}
            onClick={() => {
              triggerHaptic('light');
              setActiveView('recovery');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              activeView === 'recovery'
                ? 'bg-brand-recovery text-black shadow-md glow-recovery'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Recovery, Joints &amp; Steps
          </button>
        </div>
      </div>

      {activeView === 'strength' ? (
        <div className="space-y-3.5">
          {/* Primary Focal Point: Unified Strength Progress vs Bodyweight */}
          <E1rmVsWeightChart
            workouts={workouts}
            biometrics={biometrics}
            onOpenWeightModal={() => setShowWeightModal(true)}
          />

          {/* Supporting Chart: Workout Stamina */}
          <WciChart
            workouts={workouts}
            restingHr={profile.restingHrBaseline}
            maxHr={profile.maxHr}
          />
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Primary Focal Point: Recovery & Joint Health Insights */}
          <KnowledgeGraphCard
            workouts={workouts}
            biometrics={biometrics}
            exerciseCatalog={exerciseCatalog}
            profile={profile}
            weeklyVolume={weeklyVolume}
          />

          {/* Supporting Chart: Daily Steps & Active Minutes */}
          <ActivityTracker biometrics={biometrics} />
        </div>
      )}

      {/* Daily Weight Log Modal */}
      {showWeightModal && (
        <WeightLogModal
          currentWeight={latestWeight}
          currentEma={bodyweightEmaKg}
          onSaveWeight={onSaveWeight}
          onClose={() => setShowWeightModal(false)}
        />
      )}
    </div>
  );
};
