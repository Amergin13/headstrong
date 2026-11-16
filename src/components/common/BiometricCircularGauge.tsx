import React from 'react';
import { SEMANTIC_COLOR } from '../../styles/semanticTokens';

export type BiometricGaugeVariant =
  | 'positive'
  | 'info'
  | 'amber'
  | 'danger'
  | 'recovery'
  | 'strain'
  | 'sleep';

interface BiometricCircularGaugeProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  variant?: BiometricGaugeVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  subtitle?: string;
}

/**
 * Semantic ring variants only — never goal-specific or third-party hues:
 * - Positive (`--color-status-positive` Mint): recovery / readiness score, achieved target
 * - Info (`--color-status-info` Blue): informational, non-progress telemetry (Strain, Sleep)
 * - Amber (`--color-status-warning`): moderate readiness / caution
 * - Danger (`--color-status-danger-fill`): low readiness / overreaching warning
 */
const VARIANT_CONFIG: Record<
  BiometricGaugeVariant,
  { stroke: string; glow: string; valueColor: string; trackColor: string }
> = {
  positive: {
    stroke: SEMANTIC_COLOR.statusPositive,
    glow: 'drop-shadow(0 0 8px rgb(var(--color-accent-primary-rgb) / 0.3))',
    valueColor: SEMANTIC_COLOR.statusPositive,
    trackColor: 'var(--color-border-track)',
  },
  recovery: {
    stroke: SEMANTIC_COLOR.statusPositive,
    glow: 'drop-shadow(0 0 8px rgb(var(--color-accent-primary-rgb) / 0.3))',
    valueColor: SEMANTIC_COLOR.statusPositive,
    trackColor: 'var(--color-border-track)',
  },
  info: {
    stroke: SEMANTIC_COLOR.statusInfo,
    glow: 'drop-shadow(0 0 8px rgb(var(--color-status-info-rgb) / 0.25))',
    valueColor: SEMANTIC_COLOR.textPrimary,
    trackColor: 'var(--color-border-track)',
  },
  strain: {
    stroke: SEMANTIC_COLOR.statusInfo,
    glow: 'drop-shadow(0 0 8px rgb(var(--color-status-info-rgb) / 0.25))',
    valueColor: SEMANTIC_COLOR.textPrimary,
    trackColor: 'var(--color-border-track)',
  },
  sleep: {
    stroke: SEMANTIC_COLOR.statusInfo,
    glow: 'drop-shadow(0 0 8px rgb(var(--color-status-info-rgb) / 0.25))',
    valueColor: SEMANTIC_COLOR.textPrimary,
    trackColor: 'var(--color-border-track)',
  },
  amber: {
    stroke: SEMANTIC_COLOR.statusWarning,
    glow: 'drop-shadow(0 0 8px rgb(var(--color-status-warning-rgb) / 0.28))',
    valueColor: SEMANTIC_COLOR.statusWarning,
    trackColor: 'var(--color-border-track)',
  },
  danger: {
    stroke: SEMANTIC_COLOR.statusDangerFill,
    glow: 'drop-shadow(0 0 8px rgb(var(--color-status-danger-fill-rgb) / 0.28))',
    valueColor: SEMANTIC_COLOR.statusDanger,
    trackColor: 'var(--color-border-track)',
  },
};

/** Strictly on the 4px implicit grid (`112px` minimum diameter prevents long labels crossing the ring). */
const SIZE_CONFIG = {
  sm: { container: 112, strokeWidth: 8, textSize: 'text-base font-medium', labelSize: 'text-xs' },
  md: { container: 128, strokeWidth: 8, textSize: 'text-xl font-semibold', labelSize: 'text-xs' },
  lg: { container: 160, strokeWidth: 12, textSize: 'text-xl font-semibold', labelSize: 'text-xs' },
  xl: { container: 192, strokeWidth: 12, textSize: 'text-xl font-semibold', labelSize: 'text-xs' },
};

export const BiometricCircularGauge: React.FC<BiometricCircularGaugeProps> = ({
  value,
  max = 100,
  label,
  unit = '',
  variant = 'positive',
  size = 'md',
  subtitle,
}) => {
  const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.positive;
  const dims = SIZE_CONFIG[size] || SIZE_CONFIG.md;

  const radius = (dims.container - dims.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, Math.max(0, value / max));
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex items-center justify-center"
        style={{ width: dims.container, height: dims.container }}
      >
        <svg
          width={dims.container}
          height={dims.container}
          className="transform -rotate-90"
        >
          <circle
            cx={dims.container / 2}
            cy={dims.container / 2}
            r={radius}
            fill="transparent"
            stroke={cfg.trackColor}
            strokeWidth={dims.strokeWidth}
          />
          <circle
            cx={dims.container / 2}
            cy={dims.container / 2}
            r={radius}
            fill="transparent"
            stroke={cfg.stroke}
            strokeWidth={dims.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ filter: cfg.glow, transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <div className="flex items-baseline justify-center gap-1 tabular-nums" style={{ color: cfg.valueColor }}>
            <span className={dims.textSize}>
              {typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : Math.round(value)}
            </span>
            {unit && (
              <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
                {unit}
              </span>
            )}
          </div>
          <span
            className="wk-meta-title mt-1 max-w-full truncate"
          >
            {label}
          </span>
          {subtitle && (
            <span className="text-xs leading-tight" style={{ color: 'var(--color-text-muted)' }}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
