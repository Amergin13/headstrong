import React from 'react';
import { UserProfile, ReadinessState } from '../../engine/types';
import { Flame, Watch, Cpu } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface HeaderProps {
  profile: UserProfile;
  readinessState: ReadinessState;
  onOpenWatchSync: () => void;
  onOpenAICoach?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  readinessState,
  onOpenWatchSync,
  onOpenAICoach,
}) => {
  const currentLevelXp = profile.currentXp % 500;
  const xpPercent = Math.min(100, Math.round((currentLevelXp / 500) * 100));

  return (
    <header className="sticky top-0 z-30 bg-surface-bg/90 backdrop-blur-xl border-b border-surface-border px-4 py-2.5">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand & Level Progress */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center font-bold text-white text-xs tracking-wider">
            HS
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm tracking-tight text-white">
                HEADSTRONG
              </span>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-slate-300 font-semibold border border-white/[0.08]">
                Lv.{profile.level}
              </span>
            </div>

            {/* Subtle XP progress bar */}
            <div className="flex items-center space-x-2 mt-0.5">
              <div className="w-20 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-primary rounded-full transition-all duration-300"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
              <span className="text-xs font-mono text-slate-400">
                {currentLevelXp}/500 XP
              </span>
            </div>
          </div>
        </div>

        {/* Right Status Actions */}
        <div className="flex items-center space-x-2">
          {/* Streak Badge */}
          <div
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-500/[0.1] border border-amber-500/20 text-amber-400 text-xs font-semibold"
            aria-label={`${profile.streakDays} day workout streak`}
          >
            <Flame className="w-3.5 h-3.5 fill-amber-400 stroke-[2]" />
            <span className="font-mono">{profile.streakDays}d</span>
          </div>

          {/* On-Device AI Coach Entry Point */}
          {onOpenAICoach && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenAICoach();
              }}
              aria-label="Open On-Device AI Coach"
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-brand-primary/30 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-all active:scale-95"
              title="On-Device AI Coach"
            >
              <Cpu className="w-3.5 h-3.5 stroke-[2]" />
              <span>AI</span>
            </button>
          )}

          {/* Single Canonical Watch Sync Entry Point */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenWatchSync();
            }}
            aria-label="Open Google Pixel Watch Recovery and Sync"
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
              readinessState === 'Primed'
                ? 'bg-brand-primary/[0.1] border-brand-primary/30 text-brand-primary'
                : readinessState === 'Amber Shield'
                ? 'bg-amber-500/[0.1] border-amber-500/30 text-amber-400'
                : 'bg-white/[0.06] border-white/[0.1] text-slate-200'
            }`}
            title="Google Pixel Watch Sync"
          >
            <Watch className="w-3.5 h-3.5 stroke-[2]" />
            <span>Watch</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                readinessState === 'Primed'
                  ? 'bg-brand-primary animate-pulse'
                  : readinessState === 'Amber Shield'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-cyan-400'
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
};

