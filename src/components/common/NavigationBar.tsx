import React from 'react';
import { Dumbbell, CalendarDays, TrendingUp } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

export type TabId = 'train' | 'program' | 'chat' | 'analytics';

interface NavigationBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isChatOpen?: boolean;
  onOpenAICoach?: () => void;
}

/** Treise geometric "T" paired with brand-orange AI sparkles (#DC8748 / #FF9E6D). */
const TreiseCoachMark: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 36 36"
    className="w-10 h-10 transition-transform duration-200 group-active:scale-90"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="treise-coach-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF9E6D" />
        <stop offset="100%" stopColor="#DC8748" />
      </linearGradient>
    </defs>
    {/* Subtle outer emblem ring */}
    <circle
      cx="18"
      cy="18"
      r="16.25"
      fill="rgba(16, 20, 25, 0.72)"
      stroke={active ? 'rgba(220, 135, 72, 0.85)' : 'rgba(255, 255, 255, 0.24)'}
      strokeWidth={active ? '1.5' : '1.15'}
    />
    {/* Crisp geometric Treise "T" */}
    <path
      d="M10 12.6H21.6V15.1H17.1V25.8H14.5V15.1H10V12.6Z"
      fill="#F3EEE3"
    />
    {/* Primary brand-orange 4-point AI sparkle */}
    <path
      d="M25.2 7.2L26.02 9.58L28.4 10.4L26.02 11.22L25.2 13.6L24.38 11.22L22 10.4L24.38 9.58L25.2 7.2Z"
      fill="url(#treise-coach-sparkle-grad)"
    />
    {/* Secondary smaller brand-orange AI sparkle */}
    <path
      d="M28.1 14.2L28.56 15.54L29.9 16L28.56 16.46L28.1 17.8L27.64 16.46L26.3 16L27.64 15.54L28.1 14.2Z"
      fill="#DC8748"
    />
  </svg>
);

export const NavigationBar: React.FC<NavigationBarProps> = ({
  activeTab,
  onTabChange,
  isChatOpen = false,
  onOpenAICoach,
}) => {
  const tabs = [
    { id: 'train', label: 'Workout', icon: Dumbbell },
    { id: 'program', label: 'Program', icon: CalendarDays },
    { id: 'analytics', label: 'Progress', icon: TrendingUp },
  ] as const;

  const handleOpenTreise = () => {
    triggerHaptic('light');
    if (onOpenAICoach) {
      onOpenAICoach();
    } else {
      onTabChange('chat');
    }
  };

  return (
    <nav
      aria-label="Primary Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none px-3 pt-2"
      style={{
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, rgba(19, 24, 28, 0.92) 0%, rgba(19, 24, 28, 0.55) 55%, rgba(19, 24, 28, 0) 100%)',
      }}
    >
      <div className="max-w-md mx-auto flex items-center gap-2.5 pointer-events-auto">
        {/* Connected segmented menu for primary app destinations */}
        <div
          className="flex-1 h-16 grid grid-cols-3 px-1 overflow-hidden backdrop-blur-2xl"
          style={{
            borderRadius: 60,
            background: 'linear-gradient(180deg, rgba(35, 41, 48, 0.90) 0%, rgba(22, 26, 31, 0.94) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.11)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.58)',
          }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = !isChatOpen && activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                aria-label={`${tab.label} tab`}
                onClick={() => {
                  triggerHaptic('light');
                  onTabChange(tab.id);
                }}
                className="relative flex flex-col items-center justify-center h-full min-h-[44px] rounded-full transition-colors group"
                style={
                  isActive
                    ? {
                        background:
                          'radial-gradient(ellipse 78% 64% at 50% 104%, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.04) 55%, transparent 78%)',
                      }
                    : undefined
                }
              >
                <Icon
                  className={`w-[21px] h-[21px] transition-all duration-200 group-active:scale-90 ${
                    isActive ? 'text-white stroke-[2.1]' : 'text-white/55 group-hover:text-white/80 stroke-[1.85]'
                  }`}
                />
                <span
                  className={`text-xs mt-1 tracking-tight transition-colors ${
                    isActive ? 'text-white font-semibold' : 'text-white/55 group-hover:text-white/80 font-medium'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Separate right-aligned invoked layer button for Treise AI */}
        <button
          type="button"
          onClick={handleOpenTreise}
          aria-label={isChatOpen ? 'Close Treise' : 'Open Treise'}
          aria-haspopup="dialog"
          aria-expanded={isChatOpen}
          title="Treise"
          className="relative shrink-0 w-16 h-16 min-h-[44px] min-w-[44px] flex items-center justify-center backdrop-blur-2xl transition-all duration-200 group active:scale-95 overflow-hidden"
          style={{
            borderRadius: 60,
            background: isChatOpen
              ? 'radial-gradient(circle at 60% 35%, rgba(220, 135, 72, 0.24) 0%, rgba(26, 31, 37, 0.96) 72%)'
              : 'radial-gradient(circle at 62% 32%, rgba(220, 135, 72, 0.14) 0%, rgba(33, 39, 46, 0.92) 55%, rgba(22, 26, 31, 0.95) 100%)',
            border: isChatOpen
              ? '1px solid rgba(220, 135, 72, 0.65)'
              : '1px solid rgba(255, 255, 255, 0.13)',
            boxShadow: isChatOpen
              ? 'inset 0 1px 0 rgba(255, 190, 140, 0.28), 0 0 22px rgba(220, 135, 72, 0.28), 0 12px 32px rgba(0, 0, 0, 0.58)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 12px 32px rgba(0, 0, 0, 0.58)',
          }}
        >
          <TreiseCoachMark active={isChatOpen} />
        </button>
      </div>
    </nav>
  );
};

