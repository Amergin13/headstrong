import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, X, Plus, CheckCircle2, Timer } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import type { RestTimerContext } from '../../services/setCompletion';

export type { RestTimerContext };

interface RestTimerModalProps {
  initialSeconds?: number;
  context?: RestTimerContext;
  onDismiss: () => void;
}

/**
 * Rest timer between sets. It is labelled with the exercise and the next set so the athlete
 * always knows what the countdown is for. It is based on wall-clock time, so it stays accurate
 * when the phone is locked or the app is in the background. Heart rate is not shown because
 * no live heart-rate stream is available in the app.
 */
export const RestTimerModal: React.FC<RestTimerModalProps> = ({
  initialSeconds = 90,
  context,
  onDismiss,
}) => {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const hasTriggeredDoneHaptic = useRef(false);

  const isRunning = pausedRemaining === null;
  const secondsRemaining = isRunning
    ? Math.max(0, Math.ceil((endsAt - now) / 1000))
    : pausedRemaining;
  const isDone = secondsRemaining === 0;

  useEffect(() => {
    if (!isRunning || isDone) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [isRunning, isDone]);

  useEffect(() => {
    if (isDone && !hasTriggeredDoneHaptic.current) {
      hasTriggeredDoneHaptic.current = true;
      triggerHaptic('success');
    }
  }, [isDone]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleAdd30s = () => {
    triggerHaptic('light');
    hasTriggeredDoneHaptic.current = false;
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

  return (
    <aside aria-label="Rest timer" className="fixed bottom-20 left-3 right-3 z-40 max-w-md mx-auto">
      <div
        className="wk-card transition-all duration-300 shadow-2xl border border-white/[0.08]"
        style={isDone ? { outline: '2px solid var(--wk-accent)' } : undefined}
      >
        {context && (
          <div className="flex items-center gap-1.5 wk-caption mb-2 min-w-0">
            <Timer className="w-3.5 h-3.5 stroke-[2] shrink-0" aria-hidden="true" />
            <span className="truncate">
              Rest after <strong className="text-white">{context.exerciseName}</strong>
              {context.restReason ? ` • ${context.restReason}` : ''}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <button
              type="button"
              onClick={handleTogglePause}
              aria-label={isRunning ? 'Pause rest timer' : 'Resume rest timer'}
              className="w-11 h-11 rounded-2xl active:scale-95 flex items-center justify-center text-white transition-all shrink-0"
              style={{ background: 'var(--wk-raised)' }}
            >
              {isRunning ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" />
              )}
            </button>

            <div className="min-w-0">
              <div
                className="text-xl font-extrabold tracking-tight text-white tabular-numbers leading-none"
                aria-live="off"
              >
                {formatTime(secondsRemaining)}
              </div>
              <div className="wk-caption mt-1 truncate" aria-live="polite">
                {isDone ? (
                  <span className="font-bold" style={{ color: 'var(--wk-accent)' }}>
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

          <div className="flex items-center space-x-2 shrink-0">
            {isDone ? (
              <span
                className="wk-pill gap-1"
                style={{ background: 'var(--wk-accent)', color: '#13181C' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                <span>Go</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleAdd30s}
                aria-label="Add 30 seconds"
                className="wk-pill min-h-[44px] gap-1 text-white active:scale-95 transition-transform"
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
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/60 hover:text-white transition-colors"
              style={{ background: 'var(--wk-raised)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

