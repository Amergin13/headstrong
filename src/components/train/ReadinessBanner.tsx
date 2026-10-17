import React, { useState } from 'react';
import { ReadinessState, BiometricLog } from '../../engine/types';
import { ReadinessEvaluation } from '../../engine/readiness';
import { ChevronDown, ChevronUp, HeartPulse } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface ReadinessBannerProps {
  readiness: ReadinessEvaluation;
  latestBiometrics: BiometricLog;
  onSelectState: (state: ReadinessState) => void;
}

export const ReadinessBanner: React.FC<ReadinessBannerProps> = ({
  readiness,
  latestBiometrics,
  onSelectState,
}) => {
  const [expanded, setExpanded] = useState(false);

  const isPrimed = readiness.state === 'Primed';
  const isAmber = readiness.state === 'Amber Shield';

  const handleStateChange = (st: ReadinessState) => {
    triggerHaptic(st === 'Amber Shield' ? 'warning' : 'medium');
    onSelectState(st);
  };

  return (
    <div
      className={`rounded-2xl surface-glass px-4 py-3 border transition-all duration-200 ${
        isPrimed
          ? 'border-brand-primary/25'
          : isAmber
          ? 'border-brand-amber/35'
          : 'border-white/[0.08]'
      }`}
    >
      {/* Compact Single-Line Summary (De-emphasized Secondary Element) */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setExpanded(!expanded);
        }}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <HeartPulse
            className={`w-4 h-4 shrink-0 stroke-[2] ${
              isPrimed
                ? 'text-brand-primary'
                : isAmber
                ? 'text-brand-amber'
                : 'text-cyan-400'
            }`}
          />
          <div className="truncate">
            <span className="text-xs font-bold text-white">
              Recovery:{' '}
              <span
                className={
                  isPrimed
                    ? 'text-brand-primary'
                    : isAmber
                    ? 'text-brand-amber'
                    : 'text-white'
                }
              >
                {isPrimed
                  ? 'Ready to Push (+15% XP)'
                  : isAmber
                  ? 'Light Recovery Mode'
                  : 'Well Rested'}
              </span>
            </span>
            <span className="text-xs text-slate-400 ml-2 hidden sm:inline">
              • {latestBiometrics.sleepHours}h sleep • {latestBiometrics.restingHr} bpm
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 ml-2">
          <span className="text-xs text-slate-400 font-mono">
            {latestBiometrics.sleepHours}h sleep
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400 stroke-[2]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 stroke-[2]" />
          )}
        </div>
      </button>

      {/* Expandable Watch Details & Mode Switcher */}
      {expanded && (
        <div className="pt-3 mt-3 border-t border-white/[0.08] space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            {isPrimed
              ? 'Your sleep and heart rate recovery are strong today. Push for +2.5 kg or +1 rep on your main lifts (+15% bonus XP).'
              : isAmber
              ? 'Your body shows signs of fatigue today. Target weights are held steady and your workout streak is protected.'
              : 'Your recovery is on track. Follow today’s target weights and reps below.'}
          </p>

          {/* 3 Watch Metrics */}
          <div className="grid grid-cols-3 gap-2 text-left">
            <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
              <span className="text-xs text-slate-400 block">
                Heart Recovery
              </span>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                {latestBiometrics.hrvRmssd} ms
              </div>
              <span
                className={`text-xs font-medium block mt-0.5 ${
                  readiness.hrvChangePercent >= 0 ? 'text-brand-primary' : 'text-brand-amber'
                }`}
              >
                {readiness.hrvChangePercent >= 0
                  ? `+${readiness.hrvChangePercent}% vs avg`
                  : `${readiness.hrvChangePercent}% vs avg`}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
              <span className="text-xs text-slate-400 block">
                Resting HR
              </span>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                {latestBiometrics.restingHr} bpm
              </div>
              <span
                className={`text-xs font-medium block mt-0.5 ${
                  readiness.rhrDeltaBpm <= 0 ? 'text-brand-primary' : 'text-brand-amber'
                }`}
              >
                {readiness.rhrDeltaBpm <= 0
                  ? `${readiness.rhrDeltaBpm} bpm vs avg`
                  : `+${readiness.rhrDeltaBpm} bpm vs avg`}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
              <span className="text-xs text-slate-400 block">
                Sleep
              </span>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                {latestBiometrics.sleepHours} hrs
              </div>
              <span className="text-xs text-slate-400 block mt-0.5">
                Goal: 7.5+ hrs
              </span>
            </div>
          </div>

          {/* Recovery Mode Switcher */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400 font-medium">
              Adjust today&apos;s intensity:
            </span>
            <div
              role="group"
              aria-label="Adjust today's recovery mode"
              className="flex bg-black/50 p-0.5 rounded-xl border border-white/[0.08]"
            >
              {(['Primed', 'Normal', 'Amber Shield'] as ReadinessState[]).map((st) => {
                const isSelected = readiness.state === st;
                const label =
                  st === 'Primed'
                    ? 'Push Hard'
                    : st === 'Amber Shield'
                    ? 'Light / Recovery'
                    : 'Normal';
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStateChange(st)}
                    aria-pressed={isSelected}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      isSelected
                        ? st === 'Primed'
                          ? 'bg-brand-primary text-black font-bold'
                          : st === 'Amber Shield'
                          ? 'bg-brand-amber text-black font-bold'
                          : 'bg-white text-black font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
