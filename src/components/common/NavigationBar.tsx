import React from 'react';
import { Dumbbell, CalendarDays, TrendingUp, Shield } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

export type TabId = 'train' | 'character' | 'analytics' | 'program';

interface NavigationBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  activeTab,
  onTabChange,
}) => {
  const tabs = [
    { id: 'train', label: 'Workout', icon: Dumbbell },
    { id: 'program', label: 'Program', icon: CalendarDays },
    { id: 'analytics', label: 'Progress', icon: TrendingUp },
    { id: 'character', label: 'Athlete', icon: Shield },
  ] as const;

  return (
    <nav
      aria-label="Primary Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-bg/95 backdrop-blur-2xl border-t border-surface-border px-3 pt-2 pb-safe"
    >
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                triggerHaptic('light');
                onTabChange(tab.id);
              }}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 stroke-[2] transition-colors ${
                    isActive ? 'text-brand-primary' : 'text-slate-400'
                  }`}
                />
              </div>
              <span
                className={`text-xs mt-1 tracking-tight ${
                  isActive ? 'text-white font-bold' : 'text-slate-400 font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
