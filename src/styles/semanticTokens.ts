/**
 * Semantic Colour & Tone Lookups for UI Components and Inline SVGs.
 *
 * Maps style-free engine tones ('positive' | 'info' | 'warning' | 'danger' | 'neutral')
 * and shared palette tokens directly to CSS custom properties defined in `src/styles/tokens.css`.
 */

export type SemanticTone = 'positive' | 'info' | 'warning' | 'danger' | 'neutral';

export const SEMANTIC_COLOR = {
  bgCanvas: 'var(--color-bg-canvas)',
  bgCanvasTop: 'var(--color-bg-canvas-top)',
  bgSurface: 'var(--color-bg-surface)',
  bgSurfaceRaised: 'var(--color-bg-surface-raised)',
  bgSurfaceControl: 'var(--color-bg-surface-control)',
  bgSurfaceSubtle: 'var(--color-bg-surface-subtle)',
  bgScrim: 'var(--color-bg-scrim)',

  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  textMuted: 'var(--color-text-muted)',
  textSubtle: 'var(--color-text-subtle)',
  textOnAccent: 'var(--color-text-on-accent)',
  textOnDanger: 'var(--color-text-on-danger)',

  borderSubtle: 'var(--color-border-subtle)',
  borderStrong: 'var(--color-border-strong)',
  borderTrack: 'var(--color-border-track)',

  accentPrimary: 'var(--color-accent-primary)',
  accentPrimarySoft: 'var(--color-accent-primary-soft)',

  actionPrimaryBg: 'var(--color-action-primary-bg)',
  actionPrimaryFg: 'var(--color-action-primary-fg)',
  actionSecondaryBg: 'var(--color-action-secondary-bg)',
  actionSecondaryFg: 'var(--color-action-secondary-fg)',
  actionDestructiveBg: 'var(--color-action-destructive-bg)',
  actionDestructiveFg: 'var(--color-action-destructive-fg)',
  actionDisabledBg: 'var(--color-action-disabled-bg)',
  actionDisabledFg: 'var(--color-action-disabled-fg)',

  statusPositive: 'var(--color-status-positive)',
  statusPositiveSoft: 'var(--color-status-positive-soft)',
  statusWarning: 'var(--color-status-warning)',
  statusWarningStrong: 'var(--color-status-warning-strong)',
  statusWarningSoft: 'var(--color-status-warning-soft)',
  statusDanger: 'var(--color-status-danger)',
  statusDangerFill: 'var(--color-status-danger-fill)',
  statusDangerSoft: 'var(--color-status-danger-soft)',
  statusDangerFg: 'var(--color-status-danger-fg)',
  statusInfo: 'var(--color-status-info)',
  statusInfoSoft: 'var(--color-status-info-soft)',
  statusNeutral: 'var(--color-status-neutral)',

  recoveryHigh: 'var(--color-recovery-high)',
  recoveryMid: 'var(--color-recovery-mid)',
  recoveryLow: 'var(--color-recovery-low)',

  coachBorder: 'var(--color-coach-border)',
  coachSurface: 'var(--color-coach-surface)',
  coachSurfaceBright: 'var(--color-coach-surface-bright)',
  coachInk: 'var(--color-coach-ink)',
  coachGlow: 'var(--color-coach-glow)',
  coachSparkle: 'var(--color-coach-sparkle)',
} as const;

export const SEMANTIC_TONE_COLOR: Record<SemanticTone, { text: string; bgSoft: string }> = {
  positive: { text: SEMANTIC_COLOR.statusPositive, bgSoft: SEMANTIC_COLOR.statusPositiveSoft },
  info: { text: SEMANTIC_COLOR.statusInfo, bgSoft: SEMANTIC_COLOR.statusInfoSoft },
  warning: { text: SEMANTIC_COLOR.statusWarning, bgSoft: SEMANTIC_COLOR.statusWarningSoft },
  danger: { text: SEMANTIC_COLOR.statusDanger, bgSoft: SEMANTIC_COLOR.statusDangerSoft },
  neutral: { text: SEMANTIC_COLOR.statusNeutral, bgSoft: 'rgba(255, 255, 255, 0.08)' },
};

export const VIZ_SERIES_COLORS = [
  'var(--color-viz-1)',
  'var(--color-viz-2)',
  'var(--color-viz-3)',
  'var(--color-viz-4)',
  'var(--color-viz-5)',
] as const;

export const PARTNER_COLORS = {
  whoop: 'var(--color-partner-whoop)',
  strava: 'var(--color-partner-strava)',
  fitbit: 'var(--color-partner-fitbit)',
  healthConnect: 'var(--color-partner-health-connect)',
} as const;

export const PLATE_COLORS = {
  blue: 'var(--color-plate-blue)',
  yellow: 'var(--color-plate-yellow)',
  red: 'var(--color-plate-red)',
  green: 'var(--color-plate-green)',
} as const;

/** Resolves a CSS custom property (e.g. '--color-phase-hypertrophy') for imperative Canvas 2D APIs. */
export function resolveCssToken(tokenName: string, fallback = 'currentColor'): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  return value || fallback;
}
