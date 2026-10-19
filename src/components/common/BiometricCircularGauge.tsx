import React from 'react';

export type BiometricGaugeVariant = 'recovery' | 'strain' | 'sleep' | 'amber' | 'purple' | 'emerald';

interface BiometricCircularGaugeProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  sublabel?: string;
  variant?: BiometricGaugeVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  strokeWidth?: number;
}

const VARIANT_CONFIG: Record<
  BiometricGaugeVariant,
  {
    stroke: string;
    textClass: string;
    badgeBg: string;
  }
> = {
  recovery: {
    stroke: '#00F59B',
    textClass: 'text-brand-primary',
    badgeBg: 'bg-brand-primary/15 text-brand-primary',
  },
  emerald: {
    stroke: '#10B981',
    textClass: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/15 text-emerald-400',
  },
  strain: {
    stroke: '#00B4D8',
    textClass: 'text-brand-strain',
    badgeBg: 'bg-brand-strain/15 text-brand-strain',
  },
  sleep: {
    stroke: '#00E5FF',
    textClass: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/15 text-cyan-400',
  },
  amber: {
    stroke: '#FFB800',
    textClass: 'text-amber-400',
    badgeBg: 'bg-amber-500/15 text-amber-400',
  },
  purple: {
    stroke: '#A855F7',
    textClass: 'text-purple-400',
    badgeBg: 'bg-purple-500/15 text-purple-400',
  },
};

const SIZE_CONFIG = {
  sm: { dim: 96, stroke: 8, valueText: 'text-xl', labelText: 'text-xs' },
  md: { dim: 128, stroke: 10, valueText: 'text-xl', labelText: 'text-xs' },
  lg: { dim: 164, stroke: 12, valueText: 'text-xl', labelText: 'text-xs' },
  xl: { dim: 196, stroke: 14, valueText: 'text-xl', labelText: 'text-xs' },
};

export const BiometricCircularGauge: React.FC<BiometricCircularGaugeProps> = ({
  value,
  max = 100,
  label,
  unit = '',
  sublabel,
  variant = 'recovery',
  size = 'md',
  className = '',
  strokeWidth: customStrokeWidth,
}) => {
  const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.recovery;
  const sizeCfg = SIZE_CONFIG[size] || SIZE_CONFIG.md;

  const dim = sizeCfg.dim;
  const strokeWidth = customStrokeWidth ?? sizeCfg.stroke;
  const radius = (dim - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Clamped percentage
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Format value (e.g. decimals if non-integer)
  const formattedValue = Number.isInteger(value) ? value : value.toFixed(1);

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: dim, height: dim }}>
        <svg
          width={dim}
          height={dim}
          viewBox={`0 0 ${dim} ${dim}`}
          className="transform -rotate-90"
          aria-hidden="true"
        >
          {/* Outer dark track channel */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            fill="none"
            stroke="#181E27"
            strokeWidth={strokeWidth}
          />
          {/* Active progress arc */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            fill="none"
            stroke={cfg.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Centered Metric Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          <div className="flex items-baseline justify-center">
            <span className={`${sizeCfg.valueText} font-extrabold text-white tabular-numbers tracking-tight`}>
              {formattedValue}
            </span>
            {unit && (
              <span className="text-xs font-bold text-slate-400 ml-0.5">
                {unit}
              </span>
            )}
          </div>
          <span className="text-xs font-bold tracking-widest uppercase text-slate-400 mt-0.5">
            {label}
          </span>
        </div>
      </div>

      {sublabel && (
        <span className="mt-2 text-xs font-medium text-slate-400 text-center">
          {sublabel}
        </span>
      )}
    </div>
  );
};
