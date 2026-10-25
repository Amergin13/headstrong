import React, { useEffect } from 'react';
import { Zap } from 'lucide-react';

interface XPNotificationProps {
  amount: number;
  message: string;
  bonusTag?: string;
  onClose: () => void;
}

export const XPNotification: React.FC<XPNotificationProps> = ({
  amount,
  message,
  bonusTag,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2400);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-14 left-4 right-4 z-50 max-w-sm mx-auto pointer-events-none transition-all duration-300">
      <div className="wk-card shadow-2xl border border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--wk-raised)', color: 'var(--wk-accent)' }}
          >
            <Zap className="w-4 h-4 fill-[#00F19F]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="wk-h1 tabular-numbers">
                {amount > 0 ? `+${amount} XP` : 'TREISE'}
              </span>
              {bonusTag && (
                <span className="wk-pill">
                  {bonusTag}
                </span>
              )}
            </div>
            <p className="wk-body mt-0.5">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

