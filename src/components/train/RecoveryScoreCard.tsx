import React from 'react';
import { Sparkles } from 'lucide-react';
import { ReadinessEvaluation, Set1RirConfirmation, displayRecoveryScore } from '../../engine/readiness';
import { formatReadyTime, MUSCLE_FRIENDLY_NAMES, SessionRecoveryGate } from '../../engine/recovery';
import { BiometricLog, WorkoutSession } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';
import { CardDrillInButton } from '../common/Header';
import { CircularRing } from '../common/BiometricCircularGauge';

interface RecoveryScoreCardProps {
  readiness: ReadinessEvaluation;
  latestBiometrics?: BiometricLog | null;
  isConnected: boolean;
  /** Unified local + systemic recovery status so local muscle status and Amber Shield never contradict. */
  recoveryGate?: SessionRecoveryGate;
  /** In-session Set-1 RIR check so actual bar performance overrides single-day wearable noise. */
  set1Confirmation?: Set1RirConfirmation;
  activeModulation?: WorkoutSession['recoveryModulation'];
  onModulateSession?: (mode: 'trim_sets' | 'conservative_rir' | 'both') => void;
  onRestoreModulation?: () => void;
  onOpen?: () => void;
  onAskCoach?: () => void;
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

export const RecoveryScoreCard: React.FC<RecoveryScoreCardProps> = ({
  readiness,
  latestBiometrics,
  isConnected,
  recoveryGate,
  set1Confirmation,
  activeModulation,
  onModulateSession,
  onRestoreModulation,
  onOpen,
  onAskCoach,
}) => {
  const provider = readiness.provider || latestBiometrics?.source;
  const hasData = isConnected && readiness.hasRecoveryData !== false;
  const score = hasData ? displayRecoveryScore(readiness, latestBiometrics ?? undefined) : null;
  const isRecoveringLocally = Boolean(recoveryGate && !recoveryGate.isReady && !recoveryGate.trainedToday);
  const isSingleDayDip =
    hasData && readiness.state === 'Amber Shield' && readiness.trendStatus === 'single_day_dip';
  const isSustainedLow =
    hasData && readiness.state === 'Amber Shield' && readiness.trendStatus === 'sustained_low';
  const showAdvisoryModulation = Boolean(
    onModulateSession && ((hasData && readiness.state === 'Amber Shield') || isRecoveringLocally)
  );

  let tag = provider ? PROVIDER_LABELS[provider] || provider : 'Recovery';
  let heading: string;
  let body: string;
  if (!isConnected) {
    tag = 'No watch';
    heading = 'Connect your watch';
    body = 'See overnight recovery alongside your planned workouts.';
  } else if (!hasData) {
    heading = isRecoveringLocally ? 'Muscles still recovering' : 'No recovery data today';
    body = isRecoveringLocally && recoveryGate
      ? recoveryGate.advisoryMessage
      : 'Your planned session is ready. Sync your watch to view overnight recovery.';
  } else if (isSingleDayDip) {
    heading = 'Single-day recovery dip';
    body = isRecoveringLocally && recoveryGate
      ? recoveryGate.advisoryMessage
      : 'One low morning rarely limits strength on its own. Judge by warm-ups and Set 1 RIR—your planned workout is ready.';
  } else if (isSustainedLow) {
    heading = `Sustained low recovery (${readiness.consecutiveLowDays || 4} days)`;
    body = isRecoveringLocally && recoveryGate
      ? recoveryGate.advisoryMessage
      : 'Recovery has stayed suppressed over several days. Your planned workout is still ready—optionally trim 1 set per lift or shift to 2–3 RIR.';
  } else if (readiness.state === 'Amber Shield') {
    heading = 'Low recovery today';
    body = isRecoveringLocally && recoveryGate
      ? recoveryGate.advisoryMessage
      : 'Your planned workout is ready. Optionally trim 1 set per lift or shift to 2–3 RIR.';
  } else if (isRecoveringLocally && recoveryGate) {
    heading = 'Muscles still recovering';
    body = recoveryGate.advisoryMessage;
  } else if (readiness.state === 'Primed') {
    heading = "You're ready to push it";
    body = 'Strong overnight recovery—your planned progression targets are ready.';
  } else {
    heading = 'Train as planned';
    body = 'Your workout follows your plan, adding weight or reps where you earned them last time.';
  }

  const showCoachTrigger = hasData && readiness.state === 'Amber Shield' && Boolean(onAskCoach);

  return (
    <section
      aria-label={`${tag}${score !== null ? ` recovery ${Math.round(score)}%` : ''}. ${heading}. ${body}`}
      className="wk-card flex flex-col gap-3"
    >
      <div className="w-full flex items-center gap-4">
        <CircularRing value={score} strokeColor={ringColor(score ?? 0)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="wk-pill">{tag}</span>
            {onOpen && (
              <CardDrillInButton
                onClick={onOpen}
                label={`${tag}${score !== null ? ` recovery ${Math.round(score)}%` : ''}. Open recovery details`}
              />
            )}
          </div>
          <h2 className="wk-title mt-3">
            {heading}
          </h2>
          <p className="wk-body mt-1">
            {body}
          </p>
        </div>
      </div>

      {isRecoveringLocally && recoveryGate && recoveryGate.limitingMuscles.length > 0 && (
        <ul className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border-subtle)' }} aria-label="Local muscle recovery">
          {recoveryGate.limitingMuscles.slice(0, 3).map((m) => (
            <li key={m.muscle} className="flex items-center justify-between gap-2 wk-caption tabular-nums">
              <span style={{ color: 'var(--color-text-secondary)' }}>{MUSCLE_FRIENDLY_NAMES[m.muscle]}</span>
              <span>
                {m.recoveryPct}% • ready {formatReadyTime(m.readyAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {readiness.state === 'Amber Shield' && set1Confirmation && set1Confirmation.status !== 'pending' && set1Confirmation.message && (
        <div
          className="wk-raised border flex items-center justify-between gap-2"
          style={{
            background:
              set1Confirmation.status === 'fatigue_confirmed'
                ? 'var(--color-status-warning-soft)'
                : 'var(--color-status-positive-soft)',
            borderColor: 'var(--color-border-subtle)',
          }}
        >
          <p className="wk-caption" style={{ color: 'var(--color-text-primary)' }}>
            {set1Confirmation.message}
          </p>
        </div>
      )}

      {showAdvisoryModulation && onModulateSession && (
        <div
          className="flex flex-col gap-2 pt-3 border-t"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="wk-label">Optional today</span>
            {activeModulation && (
              <span
                className="wk-pill"
                style={{ background: 'var(--color-status-warning-soft)', color: 'var(--color-status-warning)' }}
              >
                {activeModulation.mode === 'trim_sets'
                  ? '−1 set/lift'
                  : activeModulation.mode === 'conservative_rir'
                  ? '2–3 RIR'
                  : '−1 set & 2–3 RIR'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={activeModulation?.mode === 'trim_sets' || activeModulation?.mode === 'both'}
              onClick={() => {
                triggerHaptic('light');
                if (activeModulation?.mode === 'trim_sets') onRestoreModulation?.();
                else onModulateSession(activeModulation?.mode === 'conservative_rir' ? 'both' : 'trim_sets');
              }}
              className="wk-btn-secondary w-full min-h-[44px] justify-center"
            >
              Trim 1 set / lift
            </button>
            <button
              type="button"
              aria-pressed={activeModulation?.mode === 'conservative_rir' || activeModulation?.mode === 'both'}
              onClick={() => {
                triggerHaptic('light');
                if (activeModulation?.mode === 'conservative_rir') onRestoreModulation?.();
                else onModulateSession(activeModulation?.mode === 'trim_sets' ? 'both' : 'conservative_rir');
              }}
              className="wk-btn-secondary w-full min-h-[44px] justify-center"
            >
              Shift to 2–3 RIR
            </button>
          </div>
          {activeModulation && onRestoreModulation && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onRestoreModulation();
              }}
              className="wk-btn-secondary w-full min-h-[44px] justify-center"
            >
              Restore planned session
            </button>
          )}
        </div>
      )}

      {showCoachTrigger && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onAskCoach?.();
          }}
          className="wk-btn-secondary w-full min-h-[44px] justify-center gap-2"
          style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
        >
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--color-coach-accent)' }} strokeWidth={2.2} aria-hidden="true" />
          <span>Ask Treise about today’s recovery</span>
        </button>
      )}
    </section>
  );
};
