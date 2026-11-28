/**
 * Semantic token map for dynamic React styling (non-CSS-class contexts and Chart/SVG props).
 * Mirrors `src/styles/tokens.css` Tier 2 semantic variables.
 */

export type SemanticTone = 'positive' | 'info' | 'warning' | 'danger' | 'neutral';

export const SEMANTIC_COLOR = {
  bgCanvas: 'var(--color-bg-canvas)',
  bgSurface: 'var(--color-bg-surface)',
  bgSurfaceRaised: 'var(--color-bg-surface-raised)',
  bgSurfaceControl: 'var(--color-bg-surface-control)',
  bgScrim: 'var(--color-bg-scrim)',

  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  textMuted: 'var(--color-text-muted)',
  textOnAccent: 'var(--color-text-on-accent)',
  textOnDanger: 'var(--color-text-on-danger)',

  borderSubtle: 'var(--color-border-subtle)',
  borderStrong: 'var(--color-border-strong)',
  borderAccent: 'var(--color-border-accent)',
  borderTrack: 'var(--color-border-track)',
  borderFocus: 'var(--color-border-focus)',
  rimHighlight: 'var(--color-rim-highlight)',

  glassRim: 'var(--color-glass-rim)',
  glassGlowStrong: 'var(--color-glass-glow-strong)',
  glassGlowSoft: 'var(--color-glass-glow-soft)',
  handleBar: 'var(--color-handle-bar)',
  shadowFloatingBar: 'var(--shadow-floating-bar)',
  shadowSheet: 'var(--shadow-sheet)',

  accentPrimary: 'var(--color-accent-primary)',

  actionPrimaryBg: 'var(--color-action-primary-bg)',
  actionPrimaryFg: 'var(--color-action-primary-fg)',
  actionSecondaryBg: 'var(--color-action-secondary-bg)',
  actionSecondaryBgRgb: 'var(--color-action-secondary-bg-rgb)',
  actionSecondaryFg: 'var(--color-action-secondary-fg)',
  actionDestructiveBg: 'var(--color-action-destructive-bg)',
  actionDestructiveFg: 'var(--color-action-destructive-fg)',
  actionDisabledBg: 'var(--color-action-disabled-bg)',
  actionDisabledFg: 'var(--color-action-disabled-fg)',

  statusPositive: 'var(--color-status-positive)',
  statusPositiveSoft: 'var(--color-status-positive-soft)',
  statusInfo: 'var(--color-status-info)',
  statusInfoSoft: 'var(--color-status-info-soft)',
  statusWarning: 'var(--color-status-warning)',
  statusWarningSoft: 'var(--color-status-warning-soft)',
  statusDanger: 'var(--color-status-danger)',
  statusDangerFill: 'var(--color-status-danger-fill)',
  statusDangerSoft: 'var(--color-status-danger-soft)',
  statusDangerFg: 'var(--color-status-danger-fg)',
  statusNeutral: 'var(--color-status-neutral)',

  dataTelemetry: 'var(--color-data-telemetry)',

  coachAccent: 'var(--color-coach-accent)',
  coachSurface: 'var(--color-coach-surface)',

  setWarmup: 'var(--color-set-warmup)',
  setFailureBg: 'var(--color-set-failure-bg)',
  setFailureFg: 'var(--color-set-failure-fg)',
} as const;

export const SEMANTIC_TONE_COLOR: Record<SemanticTone, string> = {
  positive: SEMANTIC_COLOR.statusPositive,
  info: SEMANTIC_COLOR.statusInfo,
  warning: SEMANTIC_COLOR.statusWarning,
  danger: SEMANTIC_COLOR.statusDanger,
  neutral: SEMANTIC_COLOR.statusNeutral,
};

/** Resolves a CSS custom property (e.g. '--color-status-positive') for imperative Canvas 2D APIs. */
export function resolveCssToken(tokenName: string, fallback = 'currentColor'): string {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  return val || fallback;
}
