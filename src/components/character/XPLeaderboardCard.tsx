import React from 'react';
import { UserProfile } from '../../engine/types';
import { DIVISION_THRESHOLDS, getDivisionProgress } from '../../engine/leaderboard';
import { Trophy, Check, Dumbbell, TrendingUp, Award } from 'lucide-react';

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
 * XP divisions: the athlete's own standing. Community rankings are not live yet, so this card
 * never shows other athletes or claims anything is shared.
 */
export const XPLeaderboardCard: React.FC<XPLeaderboardCardProps> = ({ profile }) => {
  const progress = getDivisionProgress(profile.currentXp);
  const ladder = [...DIVISION_THRESHOLDS].reverse();

  return (
    <div className="rounded-3xl surface-glass p-5 sm:p-6 space-y-5 shadow-xl">
      <div className="flex items-center space-x-2.5">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400">
          <Trophy className="w-5 h-5 stroke-[2]" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-bold text-base text-white tracking-tight">Your XP Division</h3>
          <p className="text-xs text-slate-400">Earned only from real training progress</p>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-[#141824] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-white">{progress.division}</span>
          <span className="text-xs font-mono font-bold text-white">
            {profile.currentXp.toLocaleString()} XP
          </span>
        </div>
        <div
          className="h-2 rounded-full bg-white/[0.06] overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.progressPercent}
          aria-label={`Progress through ${progress.division} division`}
        >
          <div
            className="h-full bg-brand-primary rounded-full transition-all"
            style={{ width: `${progress.progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-slate-300">
          {progress.nextDivision ? (
            <>
              <strong className="text-white">{progress.xpToNextDivision.toLocaleString()} XP</strong> to{' '}
              {progress.nextDivision}
            </>
          ) : (
            <span className="text-emerald-400 font-semibold">Top division reached</span>
          )}
        </p>
      </div>

      <ol className="space-y-1.5" aria-label="XP divisions">
        {ladder.map((d) => {
          const reached = profile.currentXp >= d.minXp;
          const isCurrent = d.division === progress.division;
          return (
            <li
              key={d.division}
              className={`px-3 py-2.5 rounded-xl flex items-center justify-between text-xs ${
                isCurrent ? 'bg-brand-primary/[0.12] text-white' : 'bg-[#0B0E14] text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2 font-bold">
                {reached ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" aria-hidden="true" />
                ) : (
                  <Award className="w-3.5 h-3.5 text-slate-500 stroke-[2]" aria-hidden="true" />
                )}
                {d.division}
                {isCurrent && <span className="text-brand-primary">• You</span>}
              </span>
              <span className="font-mono">{d.minXp.toLocaleString()}+ XP</span>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
          How to earn XP
        </h4>
        <ul className="space-y-1.5">
          {XP_SOURCES.map((src) => (
            <li key={src.label} className="flex items-start gap-2 text-xs">
              <Dumbbell className="w-3.5 h-3.5 mt-0.5 text-brand-primary stroke-[2] shrink-0" aria-hidden="true" />
              <span className="text-slate-300">
                <strong className="text-white">{src.label}:</strong> {src.detail}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 pt-1">
          Community rankings are coming soon. Nothing about you is shared today.
        </p>
      </div>
    </div>
  );
};
