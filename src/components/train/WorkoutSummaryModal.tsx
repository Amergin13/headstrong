import React from 'react';
import { WorkoutSession, ReadinessState } from '../../engine/types';
import { calculateSessionTonnage } from '../../engine/wci';
import { Trophy, Zap, Target, CheckCircle2, ArrowRight } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WorkoutSummaryModalProps {
  workout: WorkoutSession;
  readinessState: ReadinessState;
  onClose: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  workout,
  readinessState,
  onClose,
}) => {
  const { tonnageKg, completedSetsCount } = calculateSessionTonnage(workout);

  const handleDone = () => {
    triggerHaptic('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl surface-glass p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Trophy Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-14 h-14 rounded-3xl bg-brand-primary/15 mx-auto flex items-center justify-center text-brand-primary shadow-lg shadow-brand-primary/20">
            <Trophy className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-black text-xl text-white tracking-tight">
              Session Completed!
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {workout.name} • {workout.splitDay} Split
            </p>
          </div>
        </div>

        {/* Core Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="p-3.5 rounded-2xl bg-[#090C12] text-center">
            <span className="text-xs font-semibold text-slate-400 block">
              Total Weight Lifted
            </span>
            <span className="text-xl font-bold font-mono text-brand-primary block mt-0.5">
              {tonnageKg.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">kg</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#090C12] text-center">
            <span className="text-xs font-semibold text-slate-400 block">
              Sets Completed
            </span>
            <span className="text-xl font-bold font-mono text-white block mt-0.5">
              {completedSetsCount}
            </span>
            <span className="text-xs text-slate-400">working sets</span>
          </div>
        </div>

        {/* Heart Rate & Duration Strip */}
        <div className="p-3.5 rounded-2xl bg-[#141824] text-xs space-y-1.5">
          <div className="flex justify-between text-slate-300">
            <span>Average Heart Rate</span>
            <span className="font-mono text-white font-bold">
              {workout.avgHeartRate || 142} bpm
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Workout Time</span>
            <span className="font-mono text-slate-200 font-semibold">{workout.durationMinutes || 62} min</span>
          </div>
        </div>

        {/* Gamified XP Earned */}
        <div className="p-3.5 rounded-2xl bg-brand-primary/15 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Zap className="w-5 h-5 text-brand-primary stroke-[2]" />
            <div>
              <span className="text-sm font-bold text-white block">
                +{workout.xpEarned || 460} XP Earned
              </span>
              <span className="text-xs text-brand-primary font-medium">
                {readinessState === 'Primed' ? 'Includes +15% Recovery Bonus' : 'Streak & Progress Saved'}
              </span>
            </div>
          </div>
        </div>

        {/* Done / Continue Button */}
        <button
          type="button"
          onClick={handleDone}
          className="w-full py-3 min-h-[44px] rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-sm transition-all flex items-center justify-center space-x-2 shadow-lg shadow-white/5 active:scale-95"
        >
          <span>Done</span>
          <ArrowRight className="w-4 h-4 stroke-[2]" />
        </button>
      </div>
    </div>
  );
};
