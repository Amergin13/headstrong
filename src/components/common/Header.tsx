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
  return (
    <header
      className="relative py-3"
      style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
    >
      <div
        className="max-w-md mx-auto flex items-center justify-between"
        style={{ paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-4)' }}
      >
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            color: 'var(--color-coach-surface)',
          }}
        >
          Treise<span style={{ color: 'var(--color-coach-accent)' }}>.</span>
        </span>

        {/* Right Status Actions */}
        <div className="flex items-center gap-2">
          {/* Streak Badge */}
          <div
            className="wk-pill gap-1"
            style={{ color: 'var(--color-text-primary)' }}
            aria-label={`${profile.streakDays} day workout streak`}
          >
            <Flame className="w-3.5 h-3.5 fill-current stroke-[2]" />
            <span className="tabular-numbers">{profile.streakDays}d</span>
          </div>

          {/* Google Account / Avatar Button */}
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="relative w-11 h-11 rounded-full flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
              style={{ background: 'var(--wk-card)' }}
              aria-label={profile.email ? `Profile and settings (${profile.email})` : 'Profile and settings'}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-8 h-8 rounded-full object-cover"
                  style={{ border: '1px solid var(--color-border-strong)' }}
                />
              ) : (
                <span className="wk-label">
                  {profile.name !== 'Athlete' ? profile.name.charAt(0) : 'G'}
                </span>
              )}
              {profile.email && (
                <span
                  className="absolute bottom-1 right-1 w-2 h-2 rounded-full ring-2 ring-surface-canvas"
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


