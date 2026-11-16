import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ReadinessEvaluation, displayRecoveryScore } from '../../engine/readiness';
import { BiometricLog } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';

interface RecoveryScoreCardProps {
  readiness: ReadinessEvaluation;
  latestBiometrics?: BiometricLog | null;
  isConnected: boolean;
  onOpen?: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  whoop: 'Whoop',
  fitbit: 'Fitbit',
  health_connect: 'Health Connect',
};

/** Readiness bands: positive 67+, moderate caution 34–66, danger below 34. */
function ringColor(score: number): string {
  if (score >= 67) return 'var(--color-status-positive)';
  if (score >= 34) return 'var(--color-status-warning)';
  return 'var(--color-status-danger-fill)';
}

const Ring: React.FC<{ value: number | null }> = ({ value }) => {
  const r = 93;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--color-border-track)" strokeWidth="14" />
        {value !== null && (
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={ringColor(value)}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center tabular-numbers"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {value === null ? (
          <span className="text-xl" style={{ color: 'var(--wk-muted)' }}>—</span>
        ) : (
          <span className="flex items-baseline gap-1">
            <span className="wk-display leading-none">{Math.round(value)}</span>
            <span className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>%</span>
          </span>
        )}
      </span>
    </div>
  );
};

export const RecoveryScoreCard: React.FC<RecoveryScoreCardProps> = ({ readiness, latestBiometrics, isConnected, onOpen }) => {
  const provider = readiness.provider || latestBiometrics?.source;
  const hasData = isConnected && readiness.hasRecoveryData !== false;
  const score = hasData ? displayRecoveryScore(readiness, latestBiometrics ?? undefined) : null;

  let tag = provider ? PROVIDER_LABELS[provider] || provider : 'Recovery';
  let heading: string;
  let body: string;
  if (!isConnected) {
    tag = 'No watch';
    heading = 'Connect your watch';
    body = 'Treise can adjust each workout to how well you recovered overnight.';
  } else if (!hasData) {
    heading = 'No recovery data today';
    body = 'Your plan runs at normal effort. Sync your watch to adjust today to your recovery.';
  } else if (readiness.state === 'Amber Shield') {
    heading = 'Take it easier today';
    body = 'Treise is holding your weights steady and keeping 2–3 reps in reserve so you can recover.';
  } else if (readiness.state === 'Primed') {
    heading = "You're ready to push it";
    body = 'Treise has adjusted your workout to maximise progress through progressive overload.';
  } else {
    heading = 'Train as planned';
    body = 'Your workout follows your plan, adding weight or reps where you earned them last time.';
  }

  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={() => {
        triggerHaptic('light');
        onOpen?.();
      }}
      aria-label={`${tag}${score !== null ? ` recovery ${Math.round(score)}%` : ''}. ${heading}. ${body}`}
      className="wk-card w-full text-left flex items-center gap-6"
    >
      <Ring value={score} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="wk-pill">{tag}</span>
          {onOpen && <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />}
        </div>
        <h2 className="wk-title mt-3">
          {heading}
        </h2>
        <p className="wk-body mt-1 max-w-prose">
          {body}
        </p>
      </div>
    </button>
  );
};
