import React from 'react';

interface BiometricParticleOrbProps {
  value: string | number;
  label: string;
  sublabel?: string;
  badge?: string;
  variant?: 'emerald' | 'cyan' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ORB_SIZES = {
  sm: { dim: 110, valueSize: 'text-2xl' },
  md: { dim: 150, valueSize: 'text-3xl' },
  lg: { dim: 180, valueSize: 'text-4xl' },
};

const ORB_COLORS = {
  emerald: {
    aura: 'rgba(0, 245, 155, 0.18)',
    particle: '#00F59B',
    badge: 'text-brand-recovery bg-brand-recovery/10 border-brand-recovery/30',
  },
  cyan: {
    aura: 'rgba(0, 178, 255, 0.18)',
    particle: '#00B2FF',
    badge: 'text-brand-strain bg-brand-strain/10 border-brand-strain/30',
  },
  amber: {
    aura: 'rgba(255, 184, 0, 0.18)',
    particle: '#FFB800',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
};

// Deterministic particles generated around outer orbital shell
const PARTICLES = [
  { cx: 75, cy: 18, r: 2.2, opacity: 0.9 },
  { cx: 112, cy: 30, r: 1.8, opacity: 0.7 },
  { cx: 132, cy: 55, r: 2.5, opacity: 0.85 },
  { cx: 138, cy: 88, r: 2.0, opacity: 0.75 },
  { cx: 125, cy: 118, r: 2.3, opacity: 0.95 },
  { cx: 95, cy: 136, r: 1.7, opacity: 0.65 },
  { cx: 58, cy: 138, r: 2.4, opacity: 0.8 },
  { cx: 28, cy: 120, r: 1.9, opacity: 0.7 },
  { cx: 15, cy: 85, r: 2.5, opacity: 0.9 },
  { cx: 22, cy: 50, r: 1.8, opacity: 0.6 },
  { cx: 45, cy: 26, r: 2.1, opacity: 0.85 },
  // Inner satellite particles
  { cx: 90, cy: 28, r: 1.4, opacity: 0.5 },
  { cx: 120, cy: 75, r: 1.5, opacity: 0.55 },
  { cx: 110, cy: 110, r: 1.3, opacity: 0.45 },
  { cx: 40, cy: 105, r: 1.4, opacity: 0.5 },
  { cx: 35, cy: 68, r: 1.2, opacity: 0.4 },
];

export const BiometricParticleOrb: React.FC<BiometricParticleOrbProps> = ({
  value,
  label,
  sublabel,
  badge,
  variant = 'emerald',
  size = 'md',
  className = '',
}) => {
  const sizeCfg = ORB_SIZES[size] || ORB_SIZES.md;
  const colorCfg = ORB_COLORS[variant] || ORB_COLORS.emerald;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: sizeCfg.dim, height: sizeCfg.dim }}
      >
        {/* Ambient Radial Aura */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none blur-xl"
          style={{ background: colorCfg.aura }}
        />

        {/* Particle Vector Canvas (Normalized 150x150) */}
        <svg
          viewBox="0 0 150 150"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* Subtle outer orbit ring */}
          <circle
            cx="75"
            cy="75"
            r="64"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          {/* Concentric particle points */}
          {PARTICLES.map((p, idx) => (
            <circle
              key={idx}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={colorCfg.particle}
              opacity={p.opacity}
            />
          ))}
        </svg>

        {/* Deep Obsidian Inner Core */}
        <div
          className="relative rounded-full flex flex-col items-center justify-center text-center shadow-2xl border border-white/10"
          style={{
            width: sizeCfg.dim * 0.76,
            height: sizeCfg.dim * 0.76,
            background: 'radial-gradient(circle, #151921 0%, #08090C 100%)',
          }}
        >
          <span className={`${sizeCfg.valueSize} font-extrabold text-white tabular-numbers tracking-tight leading-none`}>
            {value}
          </span>
          <span className="text-xs font-bold tracking-widest uppercase text-slate-400 mt-1">
            {label}
          </span>
        </div>
      </div>

      {badge && (
        <span className={`mt-2 text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${colorCfg.badge}`}>
          {badge}
        </span>
      )}

      {sublabel && (
        <span className="mt-1 text-xs font-medium text-slate-400 text-center">
          {sublabel}
        </span>
      )}
    </div>
  );
};
