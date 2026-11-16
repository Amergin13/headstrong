import React, { useEffect } from 'react';
import { Zap, X } from 'lucide-react';

interface ToastProps {
  message: string;
  subtitle?: string;
  onDismiss: () => void;
  duration?: number;
  /** Render inline inside a specimen frame instead of a viewport-fixed portal bar. */
  inline?: boolean;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  subtitle = 'Recovery telemetry updated',
  onDismiss,
  duration = 5000,
  inline = false,
}) => {
  useEffect(() => {
    if (inline) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, inline, onDismiss]);

  return (
    <div
      className={
        inline
          ? 'wk w-full pointer-events-auto'
          : 'wk fixed top-14 inset-x-0 z-50 px-4 max-w-md mx-auto animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto'
      }
    >
      <div className="wk-card flex items-center justify-between gap-3 border border-[var(--color-border-strong)] shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--wk-raised)', color: 'var(--wk-accent)' }}
          >
            <Zap className="w-4 h-4 fill-[var(--wk-accent)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="wk-label whitespace-nowrap" style={{ color: 'var(--wk-accent)' }}>
                {subtitle}
              </span>
            </div>
            <p className="wk-body mt-1">{message}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shrink-0 transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
