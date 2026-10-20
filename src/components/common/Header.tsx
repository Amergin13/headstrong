import React from 'react';
import { UserProfile, ReadinessState } from '../../engine/types';
import { Flame } from 'lucide-react';

interface HeaderProps {
  profile: UserProfile;
  readinessState?: ReadinessState;
  onOpenWatchSync?: () => void;
  onOpenAICoach?: () => void;
  onOpenAuth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenAuth,
}) => {
  const currentLevelXp = profile.currentXp % 500;
  const xpPercent = Math.min(100, Math.round((currentLevelXp / 500) * 100));

  return (
    <header className="sticky top-0 z-30 bg-[#08090C]/90 backdrop-blur-2xl border-b border-white/[0.04] px-4 py-2.5 shadow-sm">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand & Level Progress */}
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-sm tracking-tight text-white">
              HEADSTRONG
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/[0.08] text-brand-primary font-bold">
              Lv.{profile.level}
            </span>
          </div>

          {/* Subtle XP progress bar */}
          <div className="flex items-center space-x-2 mt-0.5">
            <div className="w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-primary rounded-full transition-all duration-300"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono font-medium text-slate-400">
              {currentLevelXp}/500 XP
            </span>
          </div>
        </div>

        {/* Right Status Actions */}
        <div className="flex items-center space-x-2">
          {/* Streak Badge */}
          <div
            className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/[0.15] text-amber-400 text-xs font-bold"
            aria-label={`${profile.streakDays} day workout streak`}
          >
            <Flame className="w-3.5 h-3.5 fill-amber-400 stroke-[2]" />
            <span className="font-mono">{profile.streakDays}d</span>
          </div>

          {/* Google Account / Avatar Button */}
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="relative w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
              aria-label={profile.email ? `Account (${profile.email})` : 'Sign In with Google'}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-white">
                  {profile.name !== 'Athlete' ? profile.name.charAt(0) : 'G'}
                </span>
              )}
              {profile.email && (
                <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#08090C]" />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

