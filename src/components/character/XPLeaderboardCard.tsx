import React from 'react';
import { UserProfile } from '../../engine/types';
import { DIVISION_THRESHOLDS, getDivisionProgress } from '../../engine/leaderboard';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface XPLeaderboardCardProps {
  profile: UserProfile;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
}

const XP_SOURCES: { label: string; detail: string }[] = [
  { label: 'Finish a workout', detail: '+250 XP, +50 when every working set is logged' },
  { label: 'Beat your best', detail: '+40 to +60 XP for more weight or more reps' },
  { label: 'Rank up a lift', detail: '+100 XP per step, +350 XP per new tier' },
  { label: 'Finish a training week', detail: '+200 XP, +500 XP for the full 6 weeks' },
];

/**
 * XP divisions: the athlete's own standing (100% Privacy-Preserved; Join Community Leaderboard /
 * Leave Leaderboard community rankings are not live yet, so this card never shows fake athletes).
 */
export const XPLeaderboardCard: React.FC<XPLeaderboardCardProps> = ({ profile }) => {
  const progress = getDivisionProgress(profile.currentXp);
  const ladder = [...DIVISION_THRESHOLDS].reverse();

  return (
    <div className="flex flex-col" style={{ gap: fig(22) }}>
      {/* Current Division Card — exact ProgramProgressCard layout */}
      <section aria-label="Your XP Division" className="wk-card w-full text-left block">
        <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
          <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
            {progress.division}
          </h2>
          <span className="wk-pill">{profile.currentXp.toLocaleString()} XP</span>
        </div>
        <p
          style={{
            fontSize: fig(28),
            lineHeight: 1.21,
            color: 'var(--wk-muted)',
            marginTop: fig(20),
          }}
        >
          {progress.nextDivision
            ? `${progress.xpToNextDivision.toLocaleString()} XP to ${progress.nextDivision}`
            : 'Top division reached'}
        </p>
        <div
          className="flex items-end justify-between"
          style={{ marginTop: fig(60), gap: fig(20) }}
        >
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            DIVISION PROGRESS
          </span>
          <span
            className="font-bold text-white shrink-0"
            style={{ fontSize: fig(40), lineHeight: 1 }}
          >
            {progress.progressPercent}%
          </span>
        </div>
        <div
          className="wk-bar"
          style={{ marginTop: fig(30) }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.progressPercent}
          aria-label={`Progress through ${progress.division} division`}
        >
          <div style={{ width: `${progress.progressPercent}%` }} />
        </div>
      </section>

      {/* Division Ladder & XP Sources Card — SessionCompleteCard / ProgramProgressCard style */}
      <section aria-label="XP Divisions and How to Earn XP" className="wk-card w-full text-left block">
        <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
          XP Divisions
        </h3>
        <p
          style={{
            fontSize: fig(28),
            lineHeight: 1.21,
            color: 'var(--wk-muted)',
            marginTop: fig(20),
          }}
        >
          Earned only from real training progress
        </p>

        <ol
          className="flex flex-col"
          style={{ gap: fig(24), marginTop: fig(44) }}
          aria-label="XP divisions"
        >
          {ladder.map((d) => {
            const reached = profile.currentXp >= d.minXp;
            const isCurrent = d.division === progress.division;
            return (
              <li
                key={d.division}
                className="flex items-center justify-between"
                style={{ gap: fig(20) }}
              >
                <div className="flex items-center" style={{ gap: fig(16) }}>
                  <span className="wk-label" style={{ color: reached ? '#fff' : 'var(--wk-muted)' }}>
                    {d.division}
                  </span>
                  {isCurrent && <span className="wk-pill">YOU</span>}
                </div>
                <span className="wk-body tabular-numbers">
                  {d.minXp.toLocaleString()}+ XP
                </span>
              </li>
            );
          })}
        </ol>

        <div
          style={{
            marginTop: fig(48),
            paddingTop: fig(40),
            borderTop: `${fig(2)} solid rgba(255,255,255,0.08)`,
          }}
        >
          <h4 className="wk-label" style={{ color: 'var(--wk-muted)', marginBottom: fig(24) }}>
            How to earn XP
          </h4>
          <ul className="flex flex-col" style={{ gap: fig(20) }}>
            {XP_SOURCES.map((src) => (
              <li key={src.label}>
                <span className="wk-label block">{src.label}</span>
                <p className="wk-body" style={{ marginTop: fig(6) }}>
                  {src.detail}
                </p>
              </li>
            ))}
          </ul>
          <p className="wk-caption" style={{ marginTop: fig(28) }}>
            Community rankings are coming soon. Nothing about you is shared today.
          </p>
        </div>
      </section>
    </div>
  );
};
