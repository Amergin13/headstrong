import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, X, Plus, Heart, CheckCircle2 } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface RestTimerModalProps {
  initialSeconds?: number;
  maxHr?: number;
  onDismiss: () => void;
}

export const RestTimerModal: React.FC<RestTimerModalProps> = ({
  initialSeconds = 90,
  maxHr = 192,
  onDismiss,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(true);
  const hasTriggeredRecoveryHaptic = useRef(false);

  // Recovery HR threshold: 60% of Max HR (e.g. 115 bpm)
  const targetRecoveryHr = Math.round(maxHr * 0.60);

  // Smoothly simulates HR dropping during the rest interval
  const progressRatio = Math.max(0, Math.min(1, 1 - secondsRemaining / initialSeconds));
  const currentSimulatedHr = Math.round(155 - progressRatio * 43); // 155 down to 112 bpm
  const isRecovered = currentSimulatedHr <= targetRecoveryHr || secondsRemaining === 0;

  useEffect(() => {
    if (isRecovered && !hasTriggeredRecoveryHaptic.current) {
      hasTriggeredRecoveryHaptic.current = true;
      triggerHaptic('success');
    }
  }, [isRecovered]);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleAdd30s = () => {
    triggerHaptic('light');
    setSecondsRemaining((s) => s + 30);
  };

  return (
    <aside aria-label="Rest timer" className="fixed bottom-20 left-3 right-3 z-50 max-w-md mx-auto">
      <div
        className={`px-5 py-3.5 rounded-3xl bg-[#0E1219]/95 backdrop-blur-2xl transition-all duration-300 shadow-2xl ${
          isRecovered
            ? 'shadow-brand-primary/15'
            : ''
        }`}
      >
        <div className="flex items-center justify-between">
          {/* Chronometer & Heart Rate */}
          <div className="flex items-center space-x-3.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsRunning(!isRunning);
              }}
              className="w-10 h-10 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] active:scale-95 flex items-center justify-center text-white transition-all"
            >
              {isRunning ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" />
              )}
            </button>

            <div>
              <div className="text-xl font-mono font-extrabold tracking-tight text-white tabular-numbers leading-none">
                {formatTime(secondsRemaining)}
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center space-x-1.5">
                <Heart
                  className={`w-3.5 h-3.5 stroke-[2] ${
                    isRecovered
                      ? 'text-brand-primary fill-brand-primary'
                      : 'text-rose-400 animate-pulse'
                  }`}
                />
                <span className="font-mono">{currentSimulatedHr} bpm</span>
                <span>•</span>
                <span className={isRecovered ? 'text-brand-primary font-semibold' : 'text-slate-400'}>
                  {isRecovered ? 'Heart rate recovered' : 'Catching your breath'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2">
            {isRecovered ? (
              <span className="px-3 py-1.5 rounded-full bg-brand-primary/15 text-brand-primary text-xs font-bold flex items-center space-x-1 animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Ready</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleAdd30s}
                className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-mono font-bold transition-colors flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>30s</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onDismiss();
              }}
              className="p-2 rounded-full text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
