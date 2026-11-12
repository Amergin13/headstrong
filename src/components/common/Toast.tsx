import React, { useEffect } from 'react';
import { Zap } from 'lucide-react';

interface ToastProps {
  /** Short headline, e.g. "Weight PR". Defaults to the app name. */
  title?: string;
  message: string;
  tag?: string;
  onClose: () => void;
}

/** Brief confirmation or celebration at the top of the screen. */
export const Toast: React.FC<ToastProps> = ({ title, message, tag, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2400);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role="status"
      className="fixed top-14 left-4 right-4 z-50 max-w-sm mx-auto pointer-events-none transition-all duration-300"
    >
      <div className="wk-card shadow-2xl border border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center space-x-[calc(26*var(--f))]">
          <div
            className="w-9 h-9 rounded-[calc(22*var(--f))] flex items-center justify-center shrink-0"
            style={{ background: 'var(--wk-raised)', color: 'var(--wk-accent)' }}
          >
            <Zap className="w-4 h-4 fill-[var(--wk-accent)]" />
          </div>
          <div>
            <div className="flex items-center space-x-[calc(16*var(--f))]">
              <span className="wk-h1">{title || 'TREISE'}</span>
              {tag && <span className="wk-pill">{tag}</span>}
            </div>
            <p className="wk-body mt-[calc(4*var(--f))]">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
