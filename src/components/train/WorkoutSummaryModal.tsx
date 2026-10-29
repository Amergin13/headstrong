import React, { useMemo } from 'react';
import { WorkoutSession } from '../../engine/types';
import { WhoopWorkoutStrainSummary } from '../../services/whoopService';
import { calculateSessionTonnage } from '../../engine/wci';
import { useUnits } from '../../utils/unitsContext';
import { Trophy, ArrowRight, Activity, RefreshCw } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WorkoutSummaryModalProps {
  workout: WorkoutSession;
  onClose: () => void;
  whoopTelemetry?: WhoopWorkoutStrainSummary | null;
  isWhoopConnected?: boolean;
  isSyncingWhoop?: boolean;
  onRefreshWhoop?: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  workout,
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

  const handleDone = () => {
    triggerHaptic('success');
    onClose();
  };

  const hasWhoopData = isWhoopConnected || whoopTelemetry || workout.whoopStrain !== undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="wk-card w-full max-w-sm shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Trophy Header */}
        <div className="text-center space-y-2 pt-2">
          <div
            className="w-14 h-14 rounded-3xl mx-auto flex items-center justify-center"
            style={{ background: 'var(--wk-raised)', color: 'var(--wk-accent)' }}
          >
            <Trophy className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="wk-h1 text-lg">
              Session Completed!
            </h3>
            <p className="wk-caption mt-0.5">
              {workout.name} • {workout.splitDay} Split
            </p>
          </div>
        </div>

        {/* Core Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="wk-raised text-center">
            <span className="wk-caption uppercase block">
              Total Weight Lifted
            </span>
            <span className="text-xl font-bold tabular-numbers block mt-0.5" style={{ color: 'var(--wk-accent)' }}>
              {Math.round(units.toDisplay(tonnageKg)).toLocaleString()}
            </span>
            <span className="wk-caption">{units.unit}</span>
          </div>

          <div className="wk-raised text-center">
            <span className="wk-caption uppercase block">
              Sets Completed
            </span>
            <span className="text-xl font-bold tabular-numbers text-white block mt-0.5">
              {completedSetsCount}
            </span>
            <span className="wk-caption">working sets</span>
          </div>
        </div>

        {/* Whoop Workout Telemetry Card */}
        {hasWhoopData && (
          <div className="wk-raised text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="w-3.5 h-3.5 stroke-[2]" style={{ color: '#8FD3FF' }} />
                <span className="wk-label">
                  WHOOP Workout Telemetry
                </span>
              </div>
              <span className="tabular-numbers font-bold text-xs">
                {isSyncingWhoop ? (
                  <span className="inline-flex items-center space-x-1.5" style={{ color: '#8FD3FF' }}>
                    <RefreshCw className="w-3 h-3 animate-spin stroke-[2]" />
                    <span>Syncing...</span>
                  </span>
                ) : whoopTelemetry?.workoutStrain ? (
                  <span style={{ color: '#8FD3FF' }}>{whoopTelemetry.workoutStrain} Workout Strain</span>
                ) : workout.whoopStrain && !whoopTelemetry?.dayStrain ? (
                  <span style={{ color: '#8FD3FF' }}>{workout.whoopStrain} Workout Strain</span>
                ) : whoopTelemetry?.isPendingScore ? (
                  <span style={{ color: '#FFC83D' }}>Scoring Activity...</span>
                ) : whoopTelemetry?.dayStrain ? (
                  <span style={{ color: '#8FD3FF' }}>{whoopTelemetry.dayStrain} Day Strain</span>
                ) : (
                  <span className="wk-caption">Connected</span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-0.5">
              <div className="p-2 rounded-xl" style={{ background: 'var(--wk-card)' }}>
                <span className="wk-caption block">
                  {whoopTelemetry?.workoutStrain ? 'Workout Strain' : whoopTelemetry?.dayStrain ? 'Day Strain' : 'Strain'}
                </span>
                <span className="text-sm font-bold tabular-numbers block mt-0.5" style={{ color: '#8FD3FF' }}>
                  {whoopTelemetry?.workoutStrain ??
                    (whoopTelemetry?.isPendingScore
                      ? 'Scoring'
                      : whoopTelemetry?.dayStrain ?? workout.whoopStrain ?? '—')}
                </span>
              </div>
              <div className="p-2 rounded-xl" style={{ background: 'var(--wk-card)' }}>
                <span className="wk-caption block">
                  Peak HR
                </span>
                <span className="text-sm font-bold tabular-numbers text-white block mt-0.5">
                  {measuredPeakHr ? `${measuredPeakHr} bpm` : '—'}
                </span>
              </div>
              <div className="p-2 rounded-xl" style={{ background: 'var(--wk-card)' }}>
                <span className="wk-caption block">Active Burn</span>
                <span className="text-sm font-bold tabular-numbers text-white block mt-0.5">
                  {measuredKj ? `${measuredKj.toLocaleString()} kJ` : '—'}
                </span>
                {whoopTelemetry?.dayKilojoules && (
                  <span className="wk-caption block tabular-numbers">
                    ({whoopTelemetry.dayKilojoules.toLocaleString()} kJ day)
                  </span>
                )}
              </div>
            </div>

            {/* 1-Tap Sync Telemetry Button */}
            {onRefreshWhoop && (
              <div className="pt-1.5 flex items-center justify-between border-t border-white/[0.06]">
                <span className="wk-caption">
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
                  className="inline-flex items-center space-x-1 text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
                  style={{ color: '#8FD3FF' }}
                >
                  <RefreshCw className={`w-3 h-3 stroke-[2] ${isSyncingWhoop ? 'animate-spin' : ''}`} />
                  <span>{isSyncingWhoop ? 'Syncing...' : 'Sync WHOOP'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Heart rate & duration: measured values only */}
        {(measuredAvgHr || resolvedDurationMinutes) && (
          <div className="wk-raised text-xs space-y-1.5">
            {measuredAvgHr && (
              <div className="flex justify-between wk-body">
                <span>Average heart rate (Whoop)</span>
                <span className="tabular-numbers text-white font-bold">{measuredAvgHr} bpm</span>
              </div>
            )}
            {resolvedDurationMinutes && (
              <div className="flex justify-between wk-body">
                <span>Workout time</span>
                <span className="tabular-numbers text-white font-semibold">{resolvedDurationMinutes} min</span>
              </div>
            )}
          </div>
        )}

        {/* Done / Continue Button */}
        <button
          type="button"
          onClick={handleDone}
          className="wk-button transition-all flex items-center justify-center space-x-2 active:scale-95"
          style={{ background: 'var(--wk-accent)', color: '#13181C' }}
        >
          <span>Done</span>
          <ArrowRight className="w-4 h-4 stroke-[2]" />
        </button>
      </div>
    </div>
  );
};


