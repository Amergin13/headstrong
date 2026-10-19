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
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#08090C]/90 backdrop-blur-3xl border-t border-white/[0.08] px-3 pt-2 pb-safe shadow-[0_-8px_32px_rgba(0,0,0,0.8)]"
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
              className="flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 group"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-recovery/15 border border-brand-recovery/35 text-brand-recovery glow-recovery shadow-[0_0_12px_rgba(0,245,155,0.2)]'
                    : 'text-slate-400 group-hover:text-white'
                }`}
              >
                <Icon className="w-4.5 h-4.5 stroke-[2]" />
              </div>
              <span
                className={`text-xs mt-1 tracking-tight transition-colors ${
                  isActive ? 'text-white font-extrabold' : 'text-slate-400 font-medium group-hover:text-slate-200'
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
