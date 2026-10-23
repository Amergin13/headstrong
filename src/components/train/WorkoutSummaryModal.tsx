import React, { useMemo } from 'react';
import { WorkoutSession, ReadinessState } from '../../engine/types';
import { WhoopWorkoutStrainSummary } from '../../services/whoopService';
import { calculateSessionTonnage } from '../../engine/wci';
import { calculateWorkoutCompletionXp } from '../../engine/xp';
import { useUnits } from '../../utils/unitsContext';
import { Trophy, Zap, ArrowRight, Activity, RefreshCw } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WorkoutSummaryModalProps {
  workout: WorkoutSession;
  readinessState: ReadinessState;
  onClose: () => void;
  whoopTelemetry?: WhoopWorkoutStrainSummary | null;
  isWhoopConnected?: boolean;
  isSyncingWhoop?: boolean;
  onRefreshWhoop?: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  workout,
  readinessState,
  onClose,
  whoopTelemetry,
  isWhoopConnected = false,
  isSyncingWhoop = false,
  onRefreshWhoop,
}) => {
  const { tonnageKg, completedSetsCount } = calculateSessionTonnage(workout);

  const units = useUnits();

  // Real duration only: Whoop's measured workout, or first logged set → now (+5 min warm-up).
  const resolvedDurationMinutes = useMemo(() => {
    if (whoopTelemetry?.workoutDurationMin && whoopTelemetry.workoutDurationMin > 5) {
      return whoopTelemetry.workoutDurationMin;
    }
    const timestamps = workout.exercises
      .flatMap((ex) => ex.sets.filter((s) => s.completed && s.completedAt))
      .map((s) => new Date(s.completedAt as string).getTime())
      .filter((t) => !Number.isNaN(t));
    if (timestamps.length === 0) return undefined;
    const elapsed = Math.round((Date.now() - Math.min(...timestamps)) / 60000) + 5;
    return elapsed <= 240 ? elapsed : undefined;
  }, [whoopTelemetry?.workoutDurationMin, workout]);

  // Heart rate and energy are only shown when Whoop measured them.
  const measuredAvgHr = whoopTelemetry?.avgHeartRate;
  const measuredPeakHr = whoopTelemetry?.maxHeartRate;
  const measuredKj =
    whoopTelemetry?.kilojoules && whoopTelemetry.kilojoules < 3500 ? whoopTelemetry.kilojoules : undefined;

  const completionXp = calculateWorkoutCompletionXp(
    workout,
    readinessState,
    readinessState === 'Primed' ? 1.15 : 1
  ).amount;

  const handleDone = () => {
    triggerHaptic('success');
    onClose();
  };

  const hasWhoopData = isWhoopConnected || whoopTelemetry || workout.whoopStrain !== undefined;

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
              {Math.round(units.toDisplay(tonnageKg)).toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">{units.unit}</span>
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

        {/* Whoop Workout Telemetry Card */}
        {hasWhoopData && (
          <div className="p-3.5 rounded-2xl bg-[#0E1524] border border-cyan-500/20 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400 stroke-[2.2]" />
                <span className="font-bold text-white text-xs">
                  WHOOP Workout Telemetry
                </span>
              </div>
              <span className="font-mono font-bold text-xs">
                {isSyncingWhoop ? (
                  <span className="inline-flex items-center space-x-1.5 text-cyan-400">
                    <RefreshCw className="w-3 h-3 animate-spin stroke-[2]" />
                    <span>Syncing...</span>
                  </span>
                ) : whoopTelemetry?.workoutStrain ? (
                  <span className="text-cyan-400">{whoopTelemetry.workoutStrain} Workout Strain</span>
                ) : workout.whoopStrain && !whoopTelemetry?.dayStrain ? (
                  <span className="text-cyan-400">{workout.whoopStrain} Workout Strain</span>
                ) : whoopTelemetry?.isPendingScore ? (
                  <span className="text-amber-400">Scoring Activity...</span>
                ) : whoopTelemetry?.dayStrain ? (
                  <span className="text-cyan-400">{whoopTelemetry.dayStrain} Day Strain</span>
                ) : (
                  <span className="text-slate-400">Connected</span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-0.5">
              <div className="p-2 rounded-xl bg-black/40">
                <span className="text-xs text-slate-400 block font-medium">
                  {whoopTelemetry?.workoutStrain ? 'Workout Strain' : whoopTelemetry?.dayStrain ? 'Day Strain' : 'Strain'}
                </span>
                <span className="text-sm font-bold font-mono text-cyan-400 block mt-0.5">
                  {whoopTelemetry?.workoutStrain ??
                    (whoopTelemetry?.isPendingScore
                      ? 'Scoring'
                      : whoopTelemetry?.dayStrain ?? workout.whoopStrain ?? '—')}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-black/40">
                <span className="text-xs text-slate-400 block font-medium">
                  {whoopTelemetry?.maxHeartRate ? 'Peak HR' : 'Peak HR'}
                </span>
                <span className="text-sm font-bold font-mono text-white block mt-0.5">
                  {measuredPeakHr ? `${measuredPeakHr} bpm` : '—'}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-black/40">
                <span className="text-xs text-slate-400 block font-medium">Active Burn</span>
                <span className="text-sm font-bold font-mono text-white block mt-0.5">
                  {measuredKj ? `${measuredKj.toLocaleString()} kJ` : '—'}
                </span>
                {whoopTelemetry?.dayKilojoules && (
                  <span className="text-xs text-slate-400 block font-mono">
                    ({whoopTelemetry.dayKilojoules.toLocaleString()} kJ day)
                  </span>
                )}
              </div>
            </div>

            {/* 1-Tap Sync Telemetry Button */}
            {onRefreshWhoop && (
              <div className="pt-1.5 flex items-center justify-between border-t border-cyan-500/10">
                <span className="text-xs text-slate-400">
                  {whoopTelemetry?.workoutStrain
                    ? 'Captured from WHOOP strap'
                    : whoopTelemetry?.isPendingScore
                    ? "Whoop is still scoring this. We'll add strain automatically."
                    : "Not on Whoop yet. We'll keep checking for a few hours."}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onRefreshWhoop();
                  }}
                  disabled={isSyncingWhoop}
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 active:scale-95 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 stroke-[2.2] ${isSyncingWhoop ? 'animate-spin' : ''}`} />
                  <span>{isSyncingWhoop ? 'Syncing...' : 'Sync WHOOP'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Heart rate & duration: measured values only */}
        {(measuredAvgHr || resolvedDurationMinutes) && (
          <div className="p-3.5 rounded-2xl bg-[#141824] text-xs space-y-1.5">
            {measuredAvgHr && (
              <div className="flex justify-between text-slate-300">
                <span>Average heart rate (Whoop)</span>
                <span className="font-mono text-white font-bold">{measuredAvgHr} bpm</span>
              </div>
            )}
            {resolvedDurationMinutes && (
              <div className="flex justify-between text-slate-400">
                <span>Workout time</span>
                <span className="font-mono text-slate-200 font-semibold">{resolvedDurationMinutes} min</span>
              </div>
            )}
          </div>
        )}

        {/* Gamified XP Earned */}
        <div className="p-3.5 rounded-2xl bg-brand-primary/15 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Zap className="w-5 h-5 text-brand-primary stroke-[2]" />
            <div>
              <span className="text-sm font-bold text-white block">
                +{completionXp} XP for finishing
              </span>
              <span className="text-xs text-brand-primary font-medium">
                {readinessState === 'Primed' ? 'Includes +15% recovery bonus' : 'Progress saved'}
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

