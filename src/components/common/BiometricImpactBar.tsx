import React from 'react';

interface BiometricImpactBarProps {
  label: string;
  current: number;
  target: number;
  deltaLabel?: string;
  deltaType?: 'positive' | 'negative' | 'neutral' | 'warning';
  subtext?: string;
  icon?: React.ReactNode;
  variant?: 'recovery' | 'strain' | 'amber' | 'purple';
  landmarks?: {
    mev?: number;
    mav?: number;
    mrv?: number;
  };
  className?: string;
}

const BAR_VARIANTS = {
  recovery: {
    bar: 'bg-brand-recovery',
    glow: 'shadow-[0_0_12px_rgba(0,245,155,0.4)]',
    badge: 'text-brand-recovery bg-brand-recovery/10 border-brand-recovery/30',
  },
  strain: {
    bar: 'bg-brand-strain',
    glow: 'shadow-[0_0_12px_rgba(0,178,255,0.4)]',
    badge: 'text-brand-strain bg-brand-strain/10 border-brand-strain/30',
  },
  amber: {
    bar: 'bg-amber-400',
    glow: 'shadow-[0_0_12px_rgba(255,184,0,0.4)]',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  purple: {
    bar: 'bg-purple-500',
    glow: 'shadow-[0_0_12px_rgba(168,85,247,0.4)]',
    badge: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  },
};

const DELTA_TYPE_MAP = {
  positive: 'text-brand-recovery bg-brand-recovery/10 border-brand-recovery/30',
  negative: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  neutral: 'text-slate-300 bg-white/5 border-white/10',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
};

export const BiometricImpactBar: React.FC<BiometricImpactBarProps> = ({
  label,
  current,
  target,
  deltaLabel,
  deltaType,
  subtext,
  icon,
  variant = 'recovery',
  landmarks,
  className = '',
}) => {
  const percentage = Math.max(0, Math.min(100, target > 0 ? (current / target) * 100 : 0));
  const variantCfg = BAR_VARIANTS[variant] || BAR_VARIANTS.recovery;

  const badgeClass = deltaType ? DELTA_TYPE_MAP[deltaType] : variantCfg.badge;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Header Row: Label + Icon + Delta Badge */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
          <span className="font-bold text-white tracking-wide truncate">{label}</span>
          {subtext && <span className="text-slate-400 truncate">({subtext})</span>}
        </div>
        {deltaLabel && (
          <span className={`px-2 py-0.5 rounded-full border text-xs font-bold tabular-numbers shrink-0 ${badgeClass}`}>
            {deltaLabel}
          </span>
        )}
      </div>

      {/* Bar Track: Diagonal Hatched Channel */}
      <div className="relative w-full h-3 rounded-full overflow-hidden biometric-track-hatched border border-white/5">
        {/* Active Fill Bar */}
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${variantCfg.bar} ${variantCfg.glow}`}
          style={{ width: `${percentage}%` }}
        />

        {/* Optional Landmark Target Ticks (e.g. MEV, MAV, MRV) */}
        {landmarks && target > 0 && (
          <>
            {landmarks.mev !== undefined && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-cyan-400/60 z-10"
                style={{ left: `${Math.min(100, (landmarks.mev / target) * 100)}%` }}
                title={`MEV: ${landmarks.mev}`}
              />
            )}
            {landmarks.mav !== undefined && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/80 z-10"
                style={{ left: `${Math.min(100, (landmarks.mav / target) * 100)}%` }}
                title={`MAV: ${landmarks.mav}`}
              />
            )}
            {landmarks.mrv !== undefined && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-400/80 z-10"
                style={{ left: `${Math.min(100, (landmarks.mrv / target) * 100)}%` }}
                title={`MRV: ${landmarks.mrv}`}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
