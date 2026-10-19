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
import { BiometricParticleOrb } from '../common/BiometricParticleOrb';

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
      {/* 1. Athlete Scorecard & Strength Benchmarks with Luminous Particle Bio-Orb */}
      <div className="biometric-card p-4.5 space-y-4 border border-white/[0.08]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-recovery/15 border border-brand-recovery/35 flex items-center justify-center font-extrabold text-brand-recovery text-base shadow-[0_0_12px_rgba(0,245,155,0.2)]">
              {profile.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  {profile.name}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/[0.08] text-brand-recovery font-bold border border-white/10">
                  Lv.{profile.level}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {bodyweightEmaKg} kg bodyweight (7-day average)
              </p>
            </div>
          </div>

          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-brand-recovery/10 text-brand-recovery border border-brand-recovery/30">
            Goal: {friendlyGoal}
          </span>
        </div>

        {/* Hero Bio-Orb & Combined Max Grid */}
        <div className="flex flex-col sm:flex-row items-center justify-around gap-4 p-3.5 rounded-2xl bg-[#08090C]/80 border border-white/[0.06]">
          {/* Luminous Bio-Orb */}
          <BiometricParticleOrb
            value={dotsScore}
            label="DOTS SCORE"
            badge="RELATIVE STRENGTH"
            sublabel={`Adjusted for ${bodyweightEmaKg} kg BW`}
            variant="emerald"
            size="md"
          />

          {/* Big 3 Max Card */}
          <div className="flex-1 w-full sm:w-auto p-3.5 rounded-2xl bg-[#11141B] border border-white/[0.08] space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Combined Big 3 Max
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-brand-recovery tabular-numbers tracking-tight">
                {powerliftingTotalE1rm}
              </span>
              <span className="text-xs font-bold text-slate-300">
                kg ({Math.round((powerliftingTotalE1rm / bodyweightEmaKg) * 10) / 10}x BW)
              </span>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400 font-medium">
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
        className="grid grid-cols-3 gap-1 bg-[#08090C] p-1 rounded-2xl border border-white/[0.08]"
      >
        <button
          type="button"
          aria-pressed={subView === 'volume'}
          onClick={() => {
            triggerHaptic('light');
            setSubView('volume');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center ${
            subView === 'volume'
              ? 'bg-brand-recovery text-black shadow-md glow-recovery'
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
          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center ${
            subView === 'balance'
              ? 'bg-brand-recovery text-black shadow-md glow-recovery'
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
          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center ${
            subView === 'leaderboard'
              ? 'bg-brand-recovery text-black shadow-md glow-recovery'
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
        <div className="space-y-3.5">
          {/* Strength & Fitness Balance Radar */}
          <SevenPillarRadar
            pillarBestE1rm={pillarBestE1rm}
            bodyweightEmaKg={bodyweightEmaKg}
            latestBiometrics={latestBiometrics}
            gender={profile.gender}
          />

          {/* Active Bonuses */}
          <div className="rounded-3xl surface-glass p-4 border border-white/[0.08] space-y-2.5">
            <h3 className="text-sm font-bold text-white">
              Active Bonuses
            </h3>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.05] space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-amber-400">
                  <Flame className="w-4 h-4 stroke-[2]" />
                  <span>{profile.streakDays}-Day Streak Safe</span>
                </div>
                <p className="text-xs text-slate-400 leading-snug">
                  Your streak is automatically protected on recovery and rest days.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.05] space-y-1">
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
