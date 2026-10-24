import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ReadinessEvaluation } from '../../engine/readiness';
import { BiometricLog } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

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

/** Whoop-style colour bands: green 67+, yellow 34–66, red below 34. */
function ringColor(score: number): string {
  if (score >= 67) return '#16EC06';
  if (score >= 34) return '#FFDE00';
  return '#FF3B4E';
}

const Ring: React.FC<{ value: number | null }> = ({ value }) => {
  const r = 93;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: fig(200), height: fig(200) }}>
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#474D50" strokeWidth="14" />
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
      <span className="absolute inset-0 flex items-center justify-center font-bold text-white">
        {value === null ? (
          <span style={{ fontSize: fig(48), color: 'var(--wk-muted)' }}>—</span>
        ) : (
          <>
            <span style={{ fontSize: fig(64), lineHeight: 1 }}>{Math.round(value)}</span>
            <span style={{ fontSize: fig(36), lineHeight: 1, alignSelf: 'flex-end', marginBottom: fig(62) }}>%</span>
          </>
        )}
      </span>
    </div>
  );
};

export const RecoveryScoreCard: React.FC<RecoveryScoreCardProps> = ({ readiness, latestBiometrics, isConnected, onOpen }) => {
  const provider = readiness.provider || latestBiometrics?.source;
  const hasData = isConnected && readiness.hasRecoveryData !== false;
  const providerScore =
    provider === 'whoop'
      ? latestBiometrics?.recoveryScore
      : provider === 'fitbit'
      ? latestBiometrics?.fitbitReadinessScore
      : undefined;
  // The wearable's own score when it has one; otherwise today's readiness against your baseline.
  const score = hasData
    ? providerScore ?? readiness.readinessScore ?? Math.max(1, Math.min(99, Math.round(60 + readiness.score * 20)))
    : null;

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
      className="wk-card w-full text-left flex items-center"
      style={{ gap: fig(52) }}
    >
      <Ring value={score} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between" style={{ gap: fig(16) }}>
          <span className="wk-pill">{tag}</span>
          {onOpen && <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />}
        </div>
        <h2 className="wk-label" style={{ marginTop: fig(28) }}>
          {heading}
        </h2>
        <p className="wk-body" style={{ marginTop: fig(12) }}>
          {body}
        </p>
      </div>
    </button>
  );
};
