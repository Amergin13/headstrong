import React, { useState } from 'react';
import { ReadinessState, BiometricLog } from '../../engine/types';
import { ReadinessEvaluation } from '../../engine/readiness';
import { ChevronDown, ChevronUp, HeartPulse } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { BiometricCircularGauge } from '../common/BiometricCircularGauge';

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

  // Calculate biometric recovery percentage (e.g. 85% for primed, 55% for amber)
  const recoveryPercent = isAmber
    ? Math.max(35, Math.min(65, Math.round(55 + (readiness.score + 0.8) * 12)))
    : isPrimed
    ? Math.min(99, Math.max(82, Math.round(85 + (readiness.score - 0.8) * 10)))
    : Math.min(80, Math.max(68, Math.round(72 + readiness.score * 8)));

  const handleStateChange = (st: ReadinessState) => {
    triggerHaptic(st === 'Amber Shield' ? 'warning' : 'medium');
    onSelectState(st);
  };

  return (
    <div
      className={`biometric-card p-4 transition-all duration-300 border ${
        isPrimed
          ? 'border-brand-recovery/30 shadow-[0_8px_30px_rgba(0,245,155,0.08)]'
          : isAmber
          ? 'border-brand-amber/35 shadow-[0_8px_30px_rgba(255,184,0,0.08)]'
          : 'border-white/[0.08]'
      }`}
    >
      {/* Interactive Bar: Header & Summary */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setExpanded(!expanded);
        }}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between text-left group"
      >
        <div className="flex items-center space-x-3 min-w-0">
          {/* Mini Biometric Recovery Badge */}
          <div
            className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border ${
              isPrimed
                ? 'bg-brand-recovery/15 border-brand-recovery/35 text-brand-recovery'
                : isAmber
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                : 'bg-brand-strain/15 border-brand-strain/35 text-brand-strain'
            }`}
          >
            <HeartPulse className="w-5 h-5 stroke-[2]" />
          </div>

          <div className="truncate">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Recovery:
              </span>
              <span
                className={`text-xs font-extrabold ${
                  isPrimed
                    ? 'text-brand-recovery'
                    : isAmber
                    ? 'text-amber-400'
                    : 'text-white'
                }`}
              >
                {isPrimed
                  ? 'Ready to Push (+15% XP)'
                  : isAmber
                  ? 'Light Recovery Mode'
                  : 'Well Rested'}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-medium mt-0.5 truncate">
              {recoveryPercent}% Score • {latestBiometrics.sleepHours}h sleep • {latestBiometrics.restingHr} bpm
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 ml-2">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
              isPrimed
                ? 'bg-brand-recovery/10 text-brand-recovery border-brand-recovery/30'
                : isAmber
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-white/5 text-slate-300 border-white/10'
            }`}
          >
            {recoveryPercent}%
          </span>
          <div className="w-7 h-7 rounded-full bg-white/[0.04] flex items-center justify-center border border-white/[0.08] group-hover:border-white/20 transition-colors">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-slate-300 stroke-[2]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-300 stroke-[2]" />
            )}
          </div>
        </div>
      </button>

      {/* Expandable Whoop-Style Biometric Deep-Dive */}
      {expanded && (
        <div className="pt-4 mt-4 border-t border-white/[0.08] space-y-4">
          {/* Hero Recovery Ring & Guidance */}
          <div className="flex flex-col sm:flex-row items-center justify-around gap-4 p-3 rounded-2xl bg-[#08090C]/80 border border-white/[0.06]">
            <BiometricCircularGauge
              value={recoveryPercent}
              max={100}
              unit="%"
              label="RECOVERY"
              variant={isPrimed ? 'recovery' : isAmber ? 'amber' : 'strain'}
              size="md"
            />

            <div className="flex-1 space-y-2 text-center sm:text-left">
              <span className="text-xs font-bold tracking-widest uppercase text-slate-400 block">
                DAILY READINESS STATUS
              </span>
              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                {isPrimed
                  ? 'Your sleep and heart rate recovery are strong today. Push for +2.5 kg or +1 rep on your main lifts (+15% bonus XP).'
                  : isAmber
                  ? 'Your body shows signs of fatigue today. Target weights are held steady and your workout streak is protected.'
                  : 'Your recovery is on track. Follow today’s target weights and reps below.'}
              </p>
            </div>
          </div>

          {/* 3 Horological Telemetry Tiles */}
          <div className="grid grid-cols-3 gap-2.5 text-left">
            <div className="p-3 rounded-2xl bg-[#11141B] border border-white/[0.08] space-y-1">
              <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block">
                Heart Recovery
              </span>
              <div className="text-base font-extrabold font-mono text-white tracking-tight">
                {latestBiometrics.hrvRmssd} <span className="text-xs text-slate-400 font-normal">ms</span>
              </div>
              <span
                className={`text-xs font-semibold block ${
                  readiness.hrvChangePercent >= 0 ? 'text-brand-recovery' : 'text-amber-400'
                }`}
              >
                {readiness.hrvChangePercent >= 0
                  ? `+${readiness.hrvChangePercent}% vs avg`
                  : `${readiness.hrvChangePercent}% vs avg`}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#11141B] border border-white/[0.08] space-y-1">
              <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block">
                Resting HR
              </span>
              <div className="text-base font-extrabold font-mono text-white tracking-tight">
                {latestBiometrics.restingHr} <span className="text-xs text-slate-400 font-normal">bpm</span>
              </div>
              <span
                className={`text-xs font-semibold block ${
                  readiness.rhrDeltaBpm <= 0 ? 'text-brand-recovery' : 'text-amber-400'
                }`}
              >
                {readiness.rhrDeltaBpm <= 0
                  ? `${readiness.rhrDeltaBpm} bpm vs avg`
                  : `+${readiness.rhrDeltaBpm} bpm vs avg`}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#11141B] border border-white/[0.08] space-y-1">
              <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block">
                Sleep
              </span>
              <div className="text-base font-extrabold font-mono text-white tracking-tight">
                {latestBiometrics.sleepHours} <span className="text-xs text-slate-400 font-normal">hrs</span>
              </div>
              <span className="text-xs text-slate-400 font-medium block">
                Goal: 7.5+ hrs
              </span>
            </div>
          </div>

          {/* Recovery Mode Switcher */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
            <span className="text-xs text-slate-400 font-semibold tracking-wide">
              Adjust today&apos;s intensity:
            </span>
            <div
              role="group"
              aria-label="Adjust today's recovery mode"
              className="flex bg-black/60 p-1 rounded-2xl border border-white/[0.08] w-full sm:w-auto"
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
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? st === 'Primed'
                          ? 'bg-brand-recovery text-black shadow-md'
                          : st === 'Amber Shield'
                          ? 'bg-amber-400 text-black shadow-md'
                          : 'bg-white text-black shadow-md'
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
