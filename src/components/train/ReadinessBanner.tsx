import React from 'react';
import { ReadinessEvaluation } from '../../engine/readiness';
import { BiometricLog, GoalPhase } from '../../engine/types';
import { Watch } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { BiometricCircularGauge } from '../common/BiometricCircularGauge';

export interface ReadinessBannerProps {
  readiness: ReadinessEvaluation;
  latestBiometrics?: BiometricLog | null;
  isConnected?: boolean;
  onOpenWatchSync?: () => void;
  mesoWeek?: number;
  goalPhase?: GoalPhase;
  children?: React.ReactNode;
}

export const ReadinessBanner: React.FC<ReadinessBannerProps> = ({
  readiness,
  latestBiometrics,
  isConnected,
  onOpenWatchSync,
  mesoWeek = 1,
  children,
}) => {
  const hasWatchData =
    isConnected !== undefined
      ? isConnected
      : Boolean(
          latestBiometrics &&
            (latestBiometrics.hrvRmssd !== undefined || latestBiometrics.restingHr !== undefined)
        );

  const isPrimed = readiness.state === 'Primed';
  const isAmber = readiness.state === 'Amber Shield';

  // Determine active wearable provider
  const activeProvider =
    readiness.provider ||
    latestBiometrics?.source ||
    (typeof latestBiometrics?.fitbitReadinessScore === 'number'
      ? 'fitbit'
      : typeof latestBiometrics?.recoveryScore === 'number'
      ? 'whoop'
      : undefined);

  const isFitbit = activeProvider === 'fitbit' || typeof latestBiometrics?.fitbitReadinessScore === 'number';
  const isWhoop = activeProvider === 'whoop' || typeof latestBiometrics?.recoveryScore === 'number';

  const gaugeLabel = isFitbit ? 'READINESS' : isWhoop ? 'RECOVERY' : (readiness.scoreLabel?.toUpperCase() || 'READINESS');
  const gaugeUnit = isFitbit ? '' : '%';

  // Show the wearable's own score when it exists; otherwise derive one from today's z-score.
  // Never substitute a made-up number.
  const derivedScore = Math.max(1, Math.min(99, Math.round(60 + readiness.score * 20)));
  const displayScore = isFitbit
    ? latestBiometrics?.fitbitReadinessScore ?? readiness.readinessScore ?? derivedScore
    : isWhoop
    ? latestBiometrics?.recoveryScore ?? readiness.readinessScore ?? derivedScore
    : readiness.readinessScore ?? derivedScore;

  const gaugeVariant = isFitbit
    ? (displayScore >= 65 ? 'emerald' : 'amber')
    : (displayScore >= 67 ? 'recovery' : 'amber');

  const summary =
    readiness.reason ||
    (isPrimed
      ? `Week ${mesoWeek} Accumulation: Peak parasympathetic recovery detected. You have full capacity to drive progressive overload on your working sets.`
      : isAmber
      ? 'Systemic fatigue is accumulated. Working loads are held steady and your streak is protected today.'
      : `Mesocycle Week ${mesoWeek}: Balanced physiological state for hypertrophy stimulus. Standard progressive double progression applies.`);

  // Parse summary for optional prefix bolding (e.g. "Week 1 Accumulation:")
  const colonIndex = summary.indexOf(':');
  const hasPrefix = colonIndex > 0 && colonIndex < 35;
  const prefix = hasPrefix ? summary.slice(0, colonIndex + 1) : null;
  const bodyText = hasPrefix ? summary.slice(colonIndex + 1) : summary;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[#141824] border border-white/[0.04] space-y-3.5">
      {/* 1. Recovery Telemetry Row (Image 1) */}
      {hasWatchData ? (
        <div className="flex items-center gap-4 sm:gap-5">
          {/* Recovery Value (Circular Gauge matching Image 1); hidden when nothing was measured today */}
          {readiness.hasRecoveryData !== false ? (
            <div className="shrink-0">
              <BiometricCircularGauge
                value={displayScore}
                max={100}
                unit={gaugeUnit}
                label={gaugeLabel}
                variant={gaugeVariant}
                size="sm"
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0 text-slate-400">
              <Watch className="w-4 h-4 stroke-[2]" aria-hidden="true" />
            </div>
          )}

          {/* Description Text matching Image 1 */}
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
              {prefix && <strong className="text-white font-bold">{prefix} </strong>}
              {bodyText}
            </p>
            {((latestBiometrics?.restingHr || 0) > 0 || (latestBiometrics?.hrvRmssd || 0) > 0) && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {(latestBiometrics?.restingHr || 0) > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.06] text-xs font-semibold text-slate-300">
                    {latestBiometrics?.restingHr} bpm resting HR
                  </span>
                )}
                {(latestBiometrics?.hrvRmssd || 0) > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.06] text-xs font-semibold text-slate-300">
                    {latestBiometrics?.hrvRmssd} ms HRV
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0 text-slate-400">
              <Watch className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">No Watch Connected</p>
              <p className="text-xs text-slate-400">
                Connect your watch to auto-adjust daily training intensity based on recovery.
              </p>
            </div>
          </div>
          {onOpenWatchSync && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenWatchSync();
              }}
              className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-bold text-white shrink-0 min-h-[36px] flex items-center space-x-1.5 transition-colors"
            >
              <Watch className="w-3.5 h-3.5 stroke-[2]" />
              <span>Connect</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Tactical Progression Checklist (Image 2) */}
      {children && (
        <div className="pt-3.5 border-t border-white/[0.06]">
          {children}
        </div>
      )}
    </div>
  );
};


