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

/** Treise geometric "T" sized and weighted to balance the nav segments, with a warm glow around the letter and bottom-right AI sparkles. */
const TreiseCoachMark: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 48 48"
    className="w-12 h-12 transition-transform duration-200 group-active:scale-90 overflow-visible"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="treise-coach-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFD7B8" />
        <stop offset="50%" stopColor="#FF9B54" />
        <stop offset="100%" stopColor="#E47E38" />
      </linearGradient>
      <filter id="treise-t-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceAlpha" stdDeviation={active ? '3.0' : '2.4'} result="blurOuter" />
        <feFlood floodColor="#E97D32" floodOpacity={active ? '0.85' : '0.55'} result="colorOuter" />
        <feComposite in="colorOuter" in2="blurOuter" operator="in" result="glowOuter" />
        <feMerge>
          <feMergeNode in="glowOuter" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Centered geometric Treise "T" (~16.5x18px, 2.4px stroke) matching the visual weight of the nav segments */}
    <path
      d="M15.75 15H32.25V17.4H25.2V33H22.8V17.4H15.75V15Z"
      fill={active ? '#FBF7EE' : '#DCD9D2'}
      filter="url(#treise-t-glow)"
    />
    {/* Crisp primary 4-point AI sparkle tucked cleanly at bottom right of the T */}
    <path
      d="M30.5 26.2L31.46 28.84L34.1 29.8L31.46 30.76L30.5 33.4L29.54 30.76L26.9 29.8L29.54 28.84L30.5 26.2Z"
      fill="url(#treise-coach-sparkle-grad)"
      filter="url(#treise-t-glow)"
    />
    {/* Crisp secondary AI sparkle */}
    <path
      d="M34.2 22.8L34.74 24.26L36.2 24.8L34.74 25.34L34.2 26.8L33.66 25.34L32.2 24.8L33.66 24.26L34.2 22.8Z"
      fill={active ? '#FFD7B8' : '#FFA668'}
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
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to top, rgba(19, 24, 28, 0.94) 0%, rgba(19, 24, 28, 0.72) 55%, rgba(19, 24, 28, 0) 100%)',
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
            borderRadius: 18,
            background: isChatOpen
              ? 'radial-gradient(circle at 50% 50%, rgba(235, 132, 62, 0.30) 0%, rgba(28, 33, 39, 0.96) 72%)'
              : 'radial-gradient(circle at 55% 55%, rgba(235, 132, 62, 0.14) 0%, rgba(35, 41, 48, 0.90) 60%, rgba(22, 26, 31, 0.95) 100%)',
            border: isChatOpen
              ? '1px solid rgba(255, 158, 109, 0.65)'
              : '1px solid rgba(255, 255, 255, 0.11)',
            boxShadow: isChatOpen
              ? 'inset 0 1px 0 rgba(255, 196, 150, 0.28), 0 0 22px rgba(235, 132, 62, 0.32), 0 12px 32px rgba(0, 0, 0, 0.58)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.58)',
          }}
        >
          <TreiseCoachMark active={isChatOpen} />
        </button>
      </div>
    </nav>
  );
};

