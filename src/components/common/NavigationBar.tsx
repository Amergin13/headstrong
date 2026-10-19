import React from 'react';
import { Dumbbell, CalendarDays, TrendingUp, Shield, MessageSquare } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

export type TabId = 'train' | 'program' | 'chat' | 'analytics' | 'character';

interface NavigationBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isChatOpen?: boolean;
  onOpenAICoach?: () => void;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  activeTab,
  onTabChange,
  isChatOpen = false,
  onOpenAICoach,
}) => {
  const tabs = [
    { id: 'train', label: 'Workout', icon: Dumbbell },
    { id: 'program', label: 'Program', icon: CalendarDays },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'analytics', label: 'Progress', icon: TrendingUp },
    { id: 'character', label: 'Athlete', icon: Shield },
  ] as const;

  return (
    <nav
      aria-label="Primary Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#060709]/95 backdrop-blur-2xl border-t border-white/[0.07] px-2 pt-1 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.7)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === 'chat' ? isChatOpen : (!isChatOpen && activeTab === tab.id);

          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              aria-label={`${tab.label} tab`}
              onClick={() => {
                triggerHaptic('light');
                if (tab.id === 'chat') {
                  if (onOpenAICoach) onOpenAICoach();
                  onTabChange('chat');
                } else {
                  onTabChange(tab.id);
                }
              }}
              className="flex flex-col items-center justify-center py-1 transition-colors group min-h-[44px]"
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-200 group-active:scale-90 ${
                  isActive ? 'text-brand-primary stroke-[2.2]' : 'text-slate-400 group-hover:text-slate-200 stroke-[1.8]'
                }`}
              />
              <span
                className={`text-xs mt-1 transition-colors ${
                  isActive
                    ? 'text-white font-bold'
                    : 'text-slate-400 font-medium group-hover:text-slate-200'
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
