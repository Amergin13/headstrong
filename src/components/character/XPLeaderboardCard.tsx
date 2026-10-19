import React, { useState } from 'react';
import { UserProfile } from '../../engine/types';
import {
  buildLeaderboardSummary,
  LeaderboardDivision,
  LeaderboardEntry,
} from '../../engine/leaderboard';
import {
  Trophy,
  ShieldCheck,
  Medal,
  Users,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface XPLeaderboardCardProps {
  profile: UserProfile;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
}

type LeaderboardFilter = 'all' | 'division' | 'surrounding';

export const XPLeaderboardCard: React.FC<XPLeaderboardCardProps> = ({
  profile,
  onUpdateProfile,
}) => {
  const [filter, setFilter] = useState<LeaderboardFilter>('all');
  const [customName, setCustomName] = useState(profile.leaderboardDisplayName || profile.name || 'Athlete');
  const [isEditingName, setIsEditingName] = useState(false);

  const summary = buildLeaderboardSummary(profile);
  const isOptedIn = summary.isOptedIn;

  const handleJoinLeaderboard = () => {
    triggerHaptic('success');
    onUpdateProfile({
      leaderboardOptIn: true,
      leaderboardDisplayName: customName.trim() || profile.name || 'Athlete',
    });
  };

  const handleLeaveLeaderboard = () => {
    triggerHaptic('light');
    onUpdateProfile({
      leaderboardOptIn: false,
    });
  };

  const handleSaveDisplayName = () => {
    triggerHaptic('light');
    onUpdateProfile({
      leaderboardDisplayName: customName.trim() || profile.name || 'Athlete',
    });
    setIsEditingName(false);
  };

  // Filter entries based on selected tab
  let displayedEntries = summary.entries;
  if (filter === 'division') {
    displayedEntries = summary.entries.filter((e) => e.division === summary.userDivision);
  } else if (filter === 'surrounding' && summary.userRank !== null) {
    const userIdx = summary.entries.findIndex((e) => e.isCurrentUser);
    if (userIdx >= 0) {
      const start = Math.max(0, userIdx - 3);
      const end = Math.min(summary.entries.length, userIdx + 4);
      displayedEntries = summary.entries.slice(start, end);
    }
  }

  return (
    <div className="rounded-3xl surface-glass border border-white/[0.08] p-4 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Trophy className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-base text-white tracking-tight">
                Community XP Leaderboard
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-slate-300">
                {summary.totalAthletes} Athletes
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Verified progress from completed workouts &amp; strength milestones
            </p>
          </div>
        </div>
      </div>

      {!isOptedIn ? (
        /* Opt-In State */
        <div className="p-4 rounded-2xl bg-dark-900/70 border border-white/[0.06] space-y-3.5">
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
              <Users className="w-4 h-4 stroke-[2]" />
              Opt In to Compete
            </span>
            <p className="text-xs text-slate-200 leading-relaxed">
              Earn XP strictly through genuine workout consistency, progressive overload, and strength standards breakthroughs. No XP is awarded for clicks or menu changes.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface-bg border border-white/[0.04] space-y-1">
            <div className="flex items-center space-x-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4 stroke-[2]" />
              <span className="text-xs font-bold">100% Privacy-Preserved</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Only your chosen display name and verified workout XP are shared. Your bodyweight, biometrics, and sleep data never leave your phone.
            </p>
          </div>

          {/* Display Name Input */}
          <div className="space-y-1">
            <label htmlFor="athlete-name-input" className="text-xs font-medium text-slate-300 block">
              Leaderboard Display Name:
            </label>
            <input
              id="athlete-name-input"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Alex Vance, HeavyLifter"
              className="w-full bg-dark-950 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-primary"
            />
          </div>

          <button
            type="button"
            onClick={handleJoinLeaderboard}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-dark-950 font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98]"
          >
            <UserCheck className="w-4 h-4 stroke-[2]" />
            <span>Join Community Leaderboard</span>
          </button>
        </div>
      ) : (
        /* Opted-In Active Leaderboard */
        <div className="space-y-3.5">
          {/* User Status Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-brand-primary/[0.12] to-amber-500/[0.08] border border-brand-primary/25 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-300">Your Standing:</span>
                <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-lg bg-brand-primary text-dark-950">
                  Rank #{summary.userRank}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-white/[0.08] text-white">
                  {summary.userDivision} Division
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {profile.currentXp.toLocaleString()} XP
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.06] text-xs">
              <div className="text-slate-300">
                {summary.xpToNextRank > 0 ? (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                    <strong className="text-white">+{summary.xpToNextRank} XP</strong> to rank up
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Medal className="w-3.5 h-3.5 stroke-[2]" />
                    Leaderboard Leader!
                  </span>
                )}
              </div>
              <div className="text-right text-slate-400">
                {summary.nextDivision ? (
                  <span>
                    <strong className="text-white">+{summary.xpToNextDivision} XP</strong> to {summary.nextDivision}
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold">Top Division Reached</span>
                )}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div
            role="group"
            aria-label="Filter leaderboard"
            className="grid grid-cols-3 gap-1 bg-black/50 p-1 rounded-2xl border border-white/[0.08]"
          >
            {(
              [
                { id: 'all', label: 'All Athletes' },
                { id: 'division', label: `${summary.userDivision}` },
                { id: 'surrounding', label: 'Near You' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={filter === t.id}
                onClick={() => {
                  triggerHaptic('light');
                  setFilter(t.id);
                }}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
                  filter === t.id
                    ? 'bg-brand-primary text-black shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Leaderboard Entries List */}
          <div className="space-y-1.5 max-h-80 overflow-y-auto no-scrollbar">
            {displayedEntries.map((athlete) => {
              const isUser = athlete.isCurrentUser;
              const isTop3 = athlete.rank <= 3;

              return (
                <div
                  key={athlete.athleteId}
                  className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between ${
                    isUser
                      ? 'bg-brand-primary/[0.15] border-brand-primary/40 shadow-sm'
                      : 'bg-dark-900/50 border-white/[0.05] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                        athlete.rank === 1
                          ? 'bg-amber-400 text-dark-950 shadow-sm'
                          : athlete.rank === 2
                          ? 'bg-slate-300 text-dark-950'
                          : athlete.rank === 3
                          ? 'bg-amber-700/60 text-amber-200'
                          : 'bg-white/[0.06] text-slate-400'
                      }`}
                    >
                      {athlete.rank}
                    </div>

                    <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {athlete.avatarInitial}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-xs font-bold truncate ${isUser ? 'text-brand-primary' : 'text-white'}`}>
                          {athlete.displayName} {isUser && '(You)'}
                        </span>
                        {isTop3 && <Medal className="w-3.5 h-3.5 text-amber-400 shrink-0 stroke-[2]" />}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-400">
                        <span>{athlete.division}</span>
                        <span>•</span>
                        <span>Lv.{athlete.level}</span>
                        <span>•</span>
                        <span>{athlete.streakDays}d streak</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-bold text-white block">
                      {athlete.xp.toLocaleString()} XP
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Display Name Edit & Opt-Out Footer */}
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
            {isEditingName ? (
              <div className="flex items-center space-x-1.5 w-full">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="flex-1 bg-dark-950 border border-white/[0.1] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-primary"
                />
                <button
                  type="button"
                  onClick={handleSaveDisplayName}
                  className="px-2.5 py-1 bg-brand-primary text-black font-bold rounded-lg text-xs"
                >
                  Save
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="text-slate-400 hover:text-white underline text-xs transition-colors"
                >
                  Edit Name ({profile.leaderboardDisplayName || profile.name})
                </button>

                <button
                  type="button"
                  onClick={handleLeaveLeaderboard}
                  className="text-slate-500 hover:text-red-400 text-xs transition-colors"
                >
                  Leave Leaderboard
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
