import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, X, Plus, CheckCircle2, Timer, Bell, Volume2, VolumeX } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import type { RestTimerContext } from '../../services/setCompletion';
import {
  fireRestCompleteAlerts,
  getRestNotificationStatus,
  isRestChimeMuted,
  requestRestNotificationPermission,
  RestNotificationStatus,
  setRestChimeMuted,
} from '../../services/restAlerts';

export type { RestTimerContext };

interface RestTimerModalProps {
  initialSeconds?: number;
  context?: RestTimerContext;
  onDismiss: () => void;
}

/**
 * Rest timer between sets. It is labelled with the exercise and the next set so the athlete
 * always knows what the countdown is for. It uses wall-clock time (`endsAt`) + visibility
 * resync + Service Worker lock-screen notifications + haptics + a brief Web Audio chime that
 * closes its AudioContext immediately so background gym music keeps playing uninterrupted.
 */
export const RestTimerModal: React.FC<RestTimerModalProps> = ({
  initialSeconds = 90,
  context,
  onDismiss,
}) => {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [chimeMuted, setChimeMuted] = useState(() => isRestChimeMuted());
  const [notifStatus, setNotifStatus] = useState<RestNotificationStatus>(() => getRestNotificationStatus());
  const [leverageApplied, setLeverageApplied] = useState(false);
  const hasTriggeredDoneAlerts = useRef(false);

  const isRunning = pausedRemaining === null;
  const secondsRemaining = isRunning
    ? Math.max(0, Math.ceil((endsAt - now) / 1000))
    : pausedRemaining;
  const isDone = secondsRemaining === 0;

  useEffect(() => {
    if (!isRunning || isDone) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    // Schedule an exact deadline timeout + resync immediately when unlocking the phone
    const remainingMs = Math.max(0, endsAt - Date.now());
    const deadlineTimer = setTimeout(() => setNow(Date.now()), remainingMs + 50);
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setNow(Date.now());
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      clearInterval(interval);
      clearTimeout(deadlineTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [isRunning, isDone, endsAt]);

  useEffect(() => {
    if (isDone && !hasTriggeredDoneAlerts.current) {
      hasTriggeredDoneAlerts.current = true;
      void fireRestCompleteAlerts({
        exerciseName: context?.exerciseName,
        nextLabel: context?.nextLabel,
        muted: chimeMuted,
      });
    }
  }, [isDone, context?.exerciseName, context?.nextLabel, chimeMuted]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleAdd30s = () => {
    triggerHaptic('light');
    hasTriggeredDoneAlerts.current = false;
    if (isRunning) {
      setEndsAt((t) => Math.max(t, Date.now()) + 30_000);
      setNow(Date.now());
    } else {
      setPausedRemaining((s) => (s ?? 0) + 30);
    }
  };

  const handleTogglePause = () => {
    triggerHaptic('light');
    if (isRunning) {
      setPausedRemaining(secondsRemaining);
    } else {
      setEndsAt(Date.now() + (pausedRemaining ?? 0) * 1000);
      setNow(Date.now());
      setPausedRemaining(null);
    }
  };

  const handleToggleMute = () => {
    triggerHaptic('light');
    const next = !chimeMuted;
    setChimeMuted(next);
    setRestChimeMuted(next);
  };

  const handleEnableLockScreenAlerts = async () => {
    triggerHaptic('light');
    const result = await requestRestNotificationPermission();
    setNotifStatus(result);
  };

  return (
    <aside
      aria-label="Rest timer"
      className="fixed left-3 right-3 z-40 max-w-md mx-auto"
      style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        className="wk-card transition-all duration-300 shadow-2xl"
        style={{
          border: '1px solid var(--color-border-subtle)',
          ...(isDone ? { outline: '2px solid var(--wk-accent)' } : {}),
        }}
      >
        {context && (
          <div className="flex items-center justify-between gap-2 wk-caption mb-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Timer className="w-4 h-4 stroke-[2] shrink-0" aria-hidden="true" />
              <span className="truncate">
                Rest after <strong style={{ color: 'var(--color-text-primary)' }}>{context.exerciseName}</strong>
                {context.restReason ? ` • ${context.restReason}` : ''}
              </span>
            </div>
            {notifStatus === 'granted' && (
              <span className="wk-caption shrink-0" style={{ color: 'var(--wk-accent)' }}>
                Lock-screen on
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleTogglePause}
              aria-label={isRunning ? 'Pause rest timer' : 'Resume rest timer'}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl active:scale-95 flex items-center justify-center transition-all shrink-0"
              style={{ background: 'var(--wk-raised)', color: 'var(--color-text-primary)' }}
            >
              {isRunning ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current translate-x-[1px]" />
              )}
            </button>

            <div className="min-w-0">
              <div
                className="text-xl font-semibold tracking-tight tabular-nums leading-none"
                style={{ color: 'var(--color-text-primary)' }}
                aria-live="off"
              >
                {formatTime(secondsRemaining)}
              </div>
              <div className="wk-caption mt-1 truncate" aria-live="polite">
                {isDone ? (
                  <span className="font-medium" style={{ color: 'var(--wk-accent)' }}>
                    Ready{context ? ` for ${context.nextLabel}` : ''}
                  </span>
                ) : (
                  <span>
                    {context ? `Next: ${context.nextLabel}` : 'Resting'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={chimeMuted ? 'Unmute rest chime (haptics only)' : 'Mute rest chime (keeps music playing)'}
              aria-pressed={chimeMuted}
              title={chimeMuted ? 'Chime muted (haptics on)' : 'Gentle chime on (never pauses music)'}
              className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[var(--color-border-strong)] transition-colors"
              style={{ background: 'var(--wk-raised)', color: chimeMuted ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
            >
              {chimeMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {isDone ? (
              <span
                className="wk-pill gap-2"
                style={{ background: 'var(--wk-accent)', color: 'var(--color-text-on-accent)' }}
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                <span>Go</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleAdd30s}
                aria-label="Add 30 seconds"
                className="wk-btn-secondary min-h-[44px] gap-1 active:scale-95 transition-transform"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                <span>30s</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onDismiss();
              }}
              aria-label="Close rest timer"
              className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-[var(--color-border-strong)] transition-colors"
              style={{ background: 'var(--wk-raised)', color: 'var(--color-text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {context?.leverageUpgradeNudge && (
          <div
            className="mt-3 pt-3 flex flex-col gap-2 border-t"
            style={{ borderColor: 'var(--color-border-subtle)' }}
            aria-live="polite"
          >
            {leverageApplied ? (
              <span className="wk-caption" style={{ color: 'var(--wk-accent)' }}>
                Updated remaining sets to {context.leverageUpgradeNudge.suggestedName}.
              </span>
            ) : (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                  Too light?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    context.onApplyLeverageUpgrade?.();
                    setLeverageApplied(true);
                  }}
                  className="wk-btn-secondary min-h-[44px] px-3 wk-caption font-medium"
                  style={{
                    background: 'var(--color-status-positive-soft)',
                    borderColor: 'var(--wk-accent)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {context.leverageUpgradeNudge.chipLabel}
                </button>
              </div>
            )}
          </div>
        )}

        {context?.recalibrationStatus && !context.leverageUpgradeNudge && (
          <div
            className="mt-3 pt-2 border-t wk-caption"
            style={{
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--wk-accent)',
            }}
            aria-live="polite"
          >
            {context.recalibrationStatus}
          </div>
        )}

        {notifStatus === 'default' && !isDone && (
          <div
            className="mt-3 pt-2 flex items-center justify-between gap-2 border-t"
            style={{ borderColor: 'var(--color-border-subtle)' }}
          >
            <span className="wk-caption">Alert on locked screen without pausing music</span>
            <button
              type="button"
              onClick={handleEnableLockScreenAlerts}
              className="wk-btn-secondary min-h-[44px] gap-1 shrink-0"
            >
              <Bell className="w-4 h-4 stroke-[2]" aria-hidden="true" />
              <span>Allow alerts</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

