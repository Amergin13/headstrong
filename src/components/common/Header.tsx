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
    <header className="sticky top-0 z-30 bg-[#08090C]/90 backdrop-blur-2xl border-b border-white/[0.08] px-4 py-2.5 shadow-sm">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand & Level Progress */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1C2331] to-[#0E1116] border border-white/[0.12] flex items-center justify-center font-extrabold text-white text-xs tracking-wider shadow-sm">
            HS
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm tracking-tight text-white">
                HEADSTRONG
              </span>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-brand-recovery font-bold border border-white/[0.08]">
                Lv.{profile.level}
              </span>
            </div>

            {/* Subtle XP progress bar */}
            <div className="flex items-center space-x-2 mt-0.5">
              <div className="w-20 h-1.5 bg-[#181E27] rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-recovery rounded-full shadow-[0_0_8px_rgba(0,245,155,0.4)] transition-all duration-300"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
              <span className="text-xs font-mono font-medium text-slate-400">
                {currentLevelXp}/500 XP
              </span>
            </div>
          </div>
        </div>

        {/* Right Status Actions */}
        <div className="flex items-center space-x-2">
          {/* Streak Badge */}
          <div
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-500/[0.1] border border-amber-500/30 text-amber-400 text-xs font-bold"
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
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-brand-strain/30 bg-brand-strain/10 text-brand-strain hover:bg-brand-strain/20 transition-all active:scale-95"
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
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all active:scale-95 ${
              readinessState === 'Primed'
                ? 'bg-brand-recovery/[0.1] border-brand-recovery/35 text-brand-recovery glow-recovery'
                : readinessState === 'Amber Shield'
                ? 'bg-amber-500/[0.1] border-amber-500/35 text-amber-400 glow-amber'
                : 'biometric-pill text-slate-200 hover:text-white'
            }`}
            title="Google Pixel Watch Sync"
          >
            <Watch className="w-3.5 h-3.5 stroke-[2]" />
            <span>Watch</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                readinessState === 'Primed'
                  ? 'bg-brand-recovery animate-pulse'
                  : readinessState === 'Amber Shield'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-brand-strain'
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
};

