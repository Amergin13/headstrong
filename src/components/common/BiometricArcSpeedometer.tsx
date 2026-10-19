import React from 'react';

interface BiometricArcSpeedometerProps {
  value: number;
  min?: number;
  max?: number;
  label: string;
  displayValue?: string | number;
  statusText?: string;
  statusColor?: 'recovery' | 'strain' | 'amber' | 'rose' | 'slate';
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const STATUS_COLOR_MAP = {
  recovery: 'text-brand-recovery bg-brand-recovery/10 border-brand-recovery/30',
  strain: 'text-brand-strain bg-brand-strain/10 border-brand-strain/30',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  rose: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  slate: 'text-slate-300 bg-white/5 border-white/10',
};

export const BiometricArcSpeedometer: React.FC<BiometricArcSpeedometerProps> = ({
  value,
  min = 0,
  max = 3.0,
  label,
  displayValue,
  statusText,
  statusColor = 'recovery',
  sublabel,
  size = 'md',
  className = '',
}) => {
  // Dimensions
  const dim = size === 'sm' ? { w: 140, h: 80, r: 50, stroke: 8 } :
              size === 'lg' ? { w: 220, h: 120, r: 85, stroke: 12 } :
              { w: 180, h: 100, r: 68, stroke: 10 };

  const cx = dim.w / 2;
  const cy = dim.h;
  const radius = dim.r;

  // Clamped ratio from 0 to 1
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));

  // Half circumference for a 180 degree semi-circle:
  // Angle goes from 180deg (left) to 0deg (right)
  const angleDeg = 180 - ratio * 180;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Pointer position along arc
  const px = cx + radius * Math.cos(angleRad);
  const py = cy - radius * Math.sin(angleRad);

  // Gradient ID unique per component instance
  const gradientId = `arc-grad-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const renderedValue = displayValue !== undefined ? displayValue : (Number.isInteger(value) ? value : value.toFixed(1));
  const badgeStyle = STATUS_COLOR_MAP[statusColor] || STATUS_COLOR_MAP.recovery;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Label above the arc */}
      <span className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-1 text-center">
        {label}
      </span>

      <div className="relative" style={{ width: dim.w, height: dim.h }}>
        <svg width={dim.w} height={dim.h} viewBox={`0 0 ${dim.w} ${dim.h}`} className="overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00B2FF" />     {/* Cyan / Low */}
              <stop offset="35%" stopColor="#00F59B" />    {/* Electric Emerald / Optimal */}
              <stop offset="70%" stopColor="#FFB800" />    {/* Amber / Moderate */}
              <stop offset="100%" stopColor="#FF4D4D" />   {/* Rose / High */}
            </linearGradient>
          </defs>

          {/* Background dark channel track */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="#181E27"
            strokeWidth={dim.stroke}
            strokeLinecap="round"
          />

          {/* Multi-color Gradient Active Track */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={dim.stroke}
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Indicator Tick / Needle Circle */}
          <circle
            cx={px}
            cy={py}
            r={dim.stroke / 2 + 2}
            fill="#FFFFFF"
            className="transition-all duration-500 ease-out shadow-lg"
          />
          <circle
            cx={px}
            cy={py}
            r={dim.stroke / 2 - 1}
            fill="#08090C"
          />
        </svg>

        {/* Value overlay positioned inside the semi-circle */}
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold text-white tabular-numbers tracking-tight">
            {renderedValue}
          </span>
        </div>
      </div>

      {statusText && (
        <div className="mt-1 flex items-center justify-center">
          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeStyle}`}>
            {statusText}
          </span>
        </div>
      )}

      {sublabel && (
        <span className="mt-1 text-xs font-medium text-slate-400 text-center">
          {sublabel}
        </span>
      )}
    </div>
  );
};
