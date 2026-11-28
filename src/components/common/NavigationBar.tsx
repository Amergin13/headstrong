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

/**
 * Shift Nudge unified optical-grammar Treise "T" icon (20x20 on 24x24 Lucide keyline grid,
 * matching the 1.85–2.1px rounded stroke weight of the nav tabs) with a crisp 4-point
 * copper AI spark tucked cleanly into the lower-right negative space.
 */
const TreiseCoachMark: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 24 24"
    className="w-5 h-5 transition-transform duration-200 group-active:scale-90"
    fill="none"
    aria-hidden="true"
  >
    {/* Geometric Treise "T" aligned to Lucide 24x24 keyline grid */}
    <path
      d="M5 5.5H19M12 5.5V19"
      stroke={active ? 'var(--color-text-primary)' : 'var(--color-coach-surface)'}
      strokeWidth={active ? 2.15 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Crisp 4-point AI spark in the bottom-right negative space (no blurry filter) */}
    <path
      d="M17.5 12.75L18.35 15.15L20.75 16L18.35 16.85L17.5 19.25L16.65 16.85L14.25 16L16.65 15.15L17.5 12.75Z"
      fill="var(--color-coach-accent)"
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
        background: 'linear-gradient(to top, rgb(var(--color-bg-canvas-rgb) / 0.94) 0%, rgb(var(--color-bg-canvas-rgb) / 0.72) 55%, rgb(var(--color-bg-canvas-rgb) / 0) 100%)',
      }}
    >
      <div className="max-w-md mx-auto flex items-center gap-2 pointer-events-auto">
        {/* Connected segmented menu for primary app destinations */}
        <div
          className="flex-1 h-16 grid grid-cols-3 px-1 rounded-full overflow-hidden backdrop-blur-2xl"
          style={{
            background: 'linear-gradient(180deg, rgb(var(--color-bg-surface-rgb) / 0.92) 0%, rgb(var(--color-bg-canvas-rgb) / 0.96) 100%)',
            border: '1px solid var(--color-border-strong)',
            boxShadow: 'inset 0 1px 0 var(--color-glass-rim), var(--shadow-floating-bar)',
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
                          'radial-gradient(ellipse 78% 64% at 50% 104%, var(--color-glass-glow-strong) 0%, var(--color-glass-glow-soft) 55%, transparent 78%)',
                      }
                    : undefined
                }
              >
                <Icon
                  className={`w-5 h-5 transition-all duration-200 group-active:scale-90 ${
                    isActive ? 'stroke-[2.1]' : 'stroke-[1.85]'
                  }`}
                  style={{
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                />
                <span
                  className={`${isActive ? 'wk-meta-title' : 'wk-caption'} mt-1 transition-colors`}
                  style={{
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Separate right-aligned pill button for Treise AI coach — balanced pill radius & baseline with nav bank */}
        <button
          type="button"
          onClick={handleOpenTreise}
          aria-label={isChatOpen ? 'Close Treise AI coach' : 'Open Treise AI coach'}
          aria-haspopup="dialog"
          aria-expanded={isChatOpen}
          title="Treise AI coach"
          className="relative shrink-0 h-16 min-h-[44px] min-w-[80px] px-4 flex flex-col items-center justify-center rounded-full backdrop-blur-2xl transition-all duration-200 group active:scale-95 overflow-hidden"
          style={{
            background: isChatOpen
              ? 'radial-gradient(circle at 50% 50%, rgb(var(--color-coach-accent-rgb) / 0.28) 0%, rgb(var(--color-bg-canvas-rgb) / 0.96) 72%)'
              : 'radial-gradient(circle at 55% 40%, rgb(var(--color-coach-accent-rgb) / 0.14) 0%, rgb(var(--color-bg-surface-rgb) / 0.92) 60%, rgb(var(--color-bg-canvas-rgb) / 0.96) 100%)',
            border: isChatOpen
              ? '1px solid var(--color-coach-accent)'
              : '1px solid var(--color-border-strong)',
            boxShadow: isChatOpen
              ? 'inset 0 1px 0 rgb(var(--color-coach-surface-rgb) / 0.24), 0 0 24px rgb(var(--color-coach-accent-rgb) / 0.30), var(--shadow-floating-bar)'
              : 'inset 0 1px 0 var(--color-glass-rim), var(--shadow-floating-bar)',
          }}
        >
          <TreiseCoachMark active={isChatOpen} />
          <span
            className={`${isChatOpen ? 'wk-meta-title' : 'wk-caption'} mt-1 whitespace-nowrap transition-colors`}
            style={{
              color: isChatOpen ? 'var(--color-text-primary)' : 'var(--color-coach-accent)',
            }}
          >
            AI coach
          </span>
        </button>
      </div>
    </nav>
  );
};
