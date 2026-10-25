import React from 'react';
import { UserProfile, ReadinessState } from '../../engine/types';
import { Flame } from 'lucide-react';

interface HeaderProps {
  profile: UserProfile;
  readinessState?: ReadinessState;
  onOpenWatchSync?: () => void;
  onOpenAuth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenAuth,
}) => {
  const currentLevelXp = profile.currentXp % 500;
  const xpPercent = Math.min(100, Math.round((currentLevelXp / 500) * 100));

  return (
    <header className="sticky top-0 z-30 bg-[#13181C]/95 backdrop-blur-2xl border-b border-white/[0.06] px-4 py-2.5">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand & Level Progress */}
        <div>
          <div className="flex items-center space-x-2">
            <span className="wk-h1 tracking-tight">
              TREISE
            </span>
            <span className="wk-pill" style={{ color: 'var(--wk-accent)' }}>
              Lv.{profile.level}
            </span>
          </div>

          {/* Subtle XP progress bar */}
          <div className="flex items-center space-x-2 mt-1">
            <div className="wk-bar w-20">
              <div
                className="transition-all duration-300"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
            <span className="wk-caption tabular-numbers">
              {currentLevelXp}/500 XP
            </span>
          </div>
        </div>

        {/* Right Status Actions */}
        <div className="flex items-center space-x-2">
          {/* Streak Badge */}
          <div
            className="wk-pill gap-1.5"
            style={{ color: '#FFC83D' }}
            aria-label={`${profile.streakDays} day workout streak`}
          >
            <Flame className="w-3.5 h-3.5 fill-[#FFC83D] stroke-[2]" />
            <span className="tabular-numbers">{profile.streakDays}d</span>
          </div>

          {/* Google Account / Avatar Button */}
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
              style={{ background: 'var(--wk-card)' }}
              aria-label={profile.email ? `Account (${profile.email})` : 'Sign In with Google'}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <span className="wk-label">
                  {profile.name !== 'Athlete' ? profile.name.charAt(0) : 'G'}
                </span>
              )}
              {profile.email && (
                <span
                  className="absolute bottom-1 right-1 w-2 h-2 rounded-full ring-2 ring-[#13181C]"
                  style={{ background: 'var(--wk-accent)' }}
                />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};


