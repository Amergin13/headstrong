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
            <div className="text-sm font-extrabold font-mono text-brand-primary">
              {bodyweightEmaKg} kg
            </div>
          </div>
        </div>

        {/* 2-Way Segmented Switcher to Prevent Long Vertical Scroll */}
        <div
          role="group"
          aria-label="Progress category"
          className="grid grid-cols-2 gap-1 bg-[#090C12] p-1.5 rounded-2xl"
        >
          <button
            type="button"
            aria-pressed={activeView === 'strength'}
            onClick={() => {
              triggerHaptic('light');
              setActiveView('strength');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center justify-center ${
              activeView === 'strength'
                ? 'bg-brand-primary text-black shadow-sm'
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
            className={`py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center justify-center ${
              activeView === 'recovery'
                ? 'bg-brand-primary text-black shadow-sm'
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
