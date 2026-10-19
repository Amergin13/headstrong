import React, { useState } from 'react';
import {
  BiometricLog,
  GoalPhase,
  StrengthPillar,
  UserProfile,
} from '../../engine/types';
import { SevenPillarRadar } from './SevenPillarRadar';
import { VolumeTracker } from './VolumeTracker';
import { XPLeaderboardCard } from './XPLeaderboardCard';
import { calculateDotsScore } from '../../engine/dots';
import { Flame, Zap } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface CharacterTabProps {
  profile: UserProfile;
  pillarBestE1rm: Record<StrengthPillar, number>;
  bodyweightEmaKg: number;
  latestBiometrics: BiometricLog;
  weeklyVolume: Record<string, number>;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
}

const GOAL_FRIENDLY_NAME: Record<GoalPhase, string> = {
  'Lean Bulk': 'Build Muscle',
  'Cut / Recomp': 'Lose Fat',
  Maingain: 'Stay Lean',
};

type AthleteSubView = 'volume' | 'balance' | 'leaderboard';

export const CharacterTab: React.FC<CharacterTabProps> = ({
  profile,
  pillarBestE1rm,
  bodyweightEmaKg,
  latestBiometrics,
  weeklyVolume,
  onUpdateProfile,
}) => {
  const [subView, setSubView] = useState<AthleteSubView>('volume');

  const squat = pillarBestE1rm.Squat || Math.round(bodyweightEmaKg * 0.75 * 10) / 10;
  const bench =
    pillarBestE1rm['Horizontal Push'] || Math.round(bodyweightEmaKg * 0.6 * 10) / 10;
  const deadlift = pillarBestE1rm.Hinge || Math.round(bodyweightEmaKg * 0.95 * 10) / 10;
  const powerliftingTotalE1rm = Math.round((squat + bench + deadlift) * 10) / 10;

  const dotsScore = calculateDotsScore(
    powerliftingTotalE1rm,
    bodyweightEmaKg,
    profile.gender
  );

  const friendlyGoal = GOAL_FRIENDLY_NAME[profile.goalPhase] || profile.goalPhase;

  return (
    <div className="space-y-3.5 pb-28">
      {/* 1. Athlete Scorecard & Strength Benchmarks */}
      <div className="biometric-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-white/[0.08] flex items-center justify-center font-extrabold text-white text-base">
              {profile.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  {profile.name}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary font-bold">
                  Lv.{profile.level}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {bodyweightEmaKg} kg bodyweight (7-day average)
              </p>
            </div>
          </div>

          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/[0.08] text-slate-200">
            Goal: {friendlyGoal}
          </span>
        </div>

        {/* Key Strength Benchmarks (2-Column Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-4 rounded-2xl bg-[#141824] space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Strength-to-Weight Score
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white tabular-numbers tracking-tight">
                {dotsScore}
              </span>
              <span className="text-xs font-bold text-slate-400">pts</span>
            </div>
            <span className="text-xs text-slate-400 font-medium block mt-0.5">
              Adjusted for {bodyweightEmaKg} kg bodyweight
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#141824] space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Combined Big 3 Max
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-brand-primary tabular-numbers tracking-tight">
                {powerliftingTotalE1rm}
              </span>
              <span className="text-xs font-bold text-slate-300">
                kg ({Math.round((powerliftingTotalE1rm / bodyweightEmaKg) * 10) / 10}x BW)
              </span>
            </div>
            <div className="pt-2 flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Squat: <strong className="text-white font-mono">{squat}</strong></span>
              <span>•</span>
              <span>Bench: <strong className="text-white font-mono">{bench}</strong></span>
              <span>•</span>
              <span>Dead: <strong className="text-white font-mono">{deadlift}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Sub-View Switcher (Focused Hierarchy) */}
      <div
        role="group"
        aria-label="Athlete view"
        className="grid grid-cols-3 gap-1 bg-[#090C12] p-1.5 rounded-2xl"
      >
        <button
          type="button"
          aria-pressed={subView === 'volume'}
          onClick={() => {
            triggerHaptic('light');
            setSubView('volume');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center min-h-[44px] flex items-center justify-center ${
            subView === 'volume'
              ? 'bg-brand-primary text-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Weekly Sets
        </button>
        <button
          type="button"
          aria-pressed={subView === 'balance'}
          onClick={() => {
            triggerHaptic('light');
            setSubView('balance');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center min-h-[44px] flex items-center justify-center ${
            subView === 'balance'
              ? 'bg-brand-primary text-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Strength Radar
        </button>
        <button
          type="button"
          aria-pressed={subView === 'leaderboard'}
          onClick={() => {
            triggerHaptic('light');
            setSubView('leaderboard');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center min-h-[44px] flex items-center justify-center ${
            subView === 'leaderboard'
              ? 'bg-brand-primary text-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          XP Leaderboard
        </button>
      </div>

      {subView === 'volume' ? (
        /* Primary Focal Point: Weekly Sets by Muscle Tracker */
        <VolumeTracker weeklyVolume={weeklyVolume} />
      ) : subView === 'balance' ? (
        <div className="space-y-4">
          {/* Strength & Fitness Balance Radar */}
          <SevenPillarRadar
            pillarBestE1rm={pillarBestE1rm}
            bodyweightEmaKg={bodyweightEmaKg}
            latestBiometrics={latestBiometrics}
            gender={profile.gender}
          />

          {/* Active Bonuses */}
          <div className="rounded-3xl surface-glass p-5 sm:p-6 space-y-3">
            <h3 className="text-sm font-bold text-white">
              Active Bonuses
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-[#090C12] space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-amber-400">
                  <Flame className="w-4 h-4 stroke-[2]" />
                  <span>{profile.streakDays}-Day Streak Safe</span>
                </div>
                <p className="text-xs text-slate-400 leading-snug">
                  Your streak is automatically protected on recovery and rest days.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090C12] space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-brand-primary">
                  <Zap className="w-4 h-4 stroke-[2]" />
                  <span>1.25x Active Bonus</span>
                </div>
                <p className="text-xs text-slate-400 leading-snug">
                  Unlocked by hitting 30+ active minutes and 8,500+ steps today.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Sub-View C: Community XP Leaderboard */
        <XPLeaderboardCard
          profile={profile}
          onUpdateProfile={onUpdateProfile || (() => {})}
        />
      )}
    </div>
  );
};
