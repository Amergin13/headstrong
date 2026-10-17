import React, { useState } from 'react';
import {
  BiometricLog,
  GoalPhase,
  StrengthPillar,
  UserProfile,
} from '../../engine/types';
import { SevenPillarRadar } from './SevenPillarRadar';
import { VolumeTracker } from './VolumeTracker';
import { calculateDotsScore } from '../../engine/dots';
import { Flame, Zap } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface CharacterTabProps {
  profile: UserProfile;
  pillarBestE1rm: Record<StrengthPillar, number>;
  bodyweightEmaKg: number;
  latestBiometrics: BiometricLog;
  weeklyVolume: Record<string, number>;
}

const GOAL_FRIENDLY_NAME: Record<GoalPhase, string> = {
  'Lean Bulk': 'Build Muscle',
  'Cut / Recomp': 'Lose Fat',
  Maingain: 'Stay Lean',
};

type AthleteSubView = 'volume' | 'balance';

export const CharacterTab: React.FC<CharacterTabProps> = ({
  profile,
  pillarBestE1rm,
  bodyweightEmaKg,
  latestBiometrics,
  weeklyVolume,
}) => {
  const [subView, setSubView] = useState<AthleteSubView>('volume');

  const squat = pillarBestE1rm.Squat || 135;
  const bench = pillarBestE1rm['Horizontal Push'] || 112.5;
  const deadlift = pillarBestE1rm.Hinge || 165;
  const powerliftingTotalE1rm = squat + bench + deadlift;

  const dotsScore = calculateDotsScore(
    powerliftingTotalE1rm,
    bodyweightEmaKg,
    profile.gender
  );

  const friendlyGoal = GOAL_FRIENDLY_NAME[profile.goalPhase] || profile.goalPhase;

  return (
    <div className="space-y-3.5 pb-28">
      {/* 1. Athlete Scorecard & Strength Benchmarks */}
      <div className="rounded-3xl surface-glass p-4 border border-white/[0.08] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center font-bold text-brand-primary text-base">
              {profile.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {profile.name}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/[0.08] text-brand-primary font-bold">
                  Lv.{profile.level}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {bodyweightEmaKg} kg bodyweight (7-day average)
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/25">
            Goal: {friendlyGoal}
          </span>
        </div>

        {/* Key Strength Benchmarks */}
        <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-white/[0.06]">
          <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.05]">
            <span className="text-xs font-semibold text-slate-400 block">
              Strength-to-Weight Score
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-2xl font-bold font-mono text-white tabular-numbers">
                {dotsScore}
              </span>
              <span className="text-xs text-slate-400">pts</span>
            </div>
            <span className="text-xs text-slate-400 block mt-0.5">
              Adjusted for {bodyweightEmaKg} kg weight
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.05]">
            <span className="text-xs font-semibold text-slate-400 block">
              Combined Big 3 Max
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-2xl font-bold font-mono text-brand-primary tabular-numbers">
                {powerliftingTotalE1rm}
              </span>
              <span className="text-xs text-slate-400">
                kg ({Math.round((powerliftingTotalE1rm / bodyweightEmaKg) * 10) / 10}x BW)
              </span>
            </div>
            <span className="text-xs text-slate-400 block mt-0.5">
              Squat {squat} • Bench {bench} • Dead {deadlift}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Sub-View Switcher (Focused Hierarchy) */}
      <div
        role="group"
        aria-label="Athlete view"
        className="grid grid-cols-2 gap-1 bg-black/50 p-1 rounded-2xl border border-white/[0.08]"
      >
        <button
          type="button"
          aria-pressed={subView === 'volume'}
          onClick={() => {
            triggerHaptic('light');
            setSubView('volume');
          }}
          className={`py-2 rounded-xl text-xs font-bold transition-all ${
            subView === 'volume'
              ? 'bg-brand-primary text-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Weekly Muscle Sets
        </button>
        <button
          type="button"
          aria-pressed={subView === 'balance'}
          onClick={() => {
            triggerHaptic('light');
            setSubView('balance');
          }}
          className={`py-2 rounded-xl text-xs font-bold transition-all ${
            subView === 'balance'
              ? 'bg-brand-primary text-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Strength Balance &amp; Bonuses
        </button>
      </div>

      {subView === 'volume' ? (
        /* Primary Focal Point: Weekly Sets by Muscle Tracker */
        <VolumeTracker weeklyVolume={weeklyVolume} />
      ) : (
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
      )}
    </div>
  );
};
