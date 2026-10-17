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
      <div className="p-3 rounded-2xl bg-surface-card/95 backdrop-blur-2xl border border-white/[0.12] shadow-2xl flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary">
            <Zap className="w-4 h-4 fill-brand-primary" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm text-white font-mono">
                +{amount} XP
              </span>
              {bonusTag && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 font-medium">
                  {bonusTag}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-normal">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
