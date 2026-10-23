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
import { useUnits } from '../../utils/unitsContext';
import { triggerHaptic } from '../../utils/haptics';

interface CharacterTabProps {
  profile: UserProfile;
  pillarBestE1rm: Record<StrengthPillar, number>;
  /** Best maxes from loaded lifts only (barbell, dumbbell, cable, machine) for the Big 3 card. */
  big3BestE1rm?: Record<StrengthPillar, number>;
  bodyweightEmaKg: number;
  latestBiometrics: BiometricLog;
  weeklyVolume: Record<string, number>;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onOpenAuth?: () => void;
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
  big3BestE1rm,
  bodyweightEmaKg,
  latestBiometrics,
  weeklyVolume,
  onUpdateProfile,
  onOpenAuth,
}) => {
  const [subView, setSubView] = useState<AthleteSubView>('volume');
  const units = useUnits();
  // Only real logged lifts count. No placeholder estimates for lifts the athlete hasn't done.
  const squat = big3BestE1rm?.Squat ?? pillarBestE1rm.Squat ?? 0;
  const bench = big3BestE1rm?.['Horizontal Push'] ?? pillarBestE1rm['Horizontal Push'] ?? 0;
  const deadlift = big3BestE1rm?.Hinge ?? pillarBestE1rm.Hinge ?? 0;
  const powerliftingTotalE1rm = Math.round((squat + bench + deadlift) * 10) / 10;
  const hasBig3Data = powerliftingTotalE1rm > 0;

  const dotsScore = hasBig3Data
    ? calculateDotsScore(powerliftingTotalE1rm, bodyweightEmaKg, profile.gender)
    : 0;

  const friendlyGoal = GOAL_FRIENDLY_NAME[profile.goalPhase] || profile.goalPhase;

  return (
    <div className="space-y-3.5 pb-28">
      {/* 1. Athlete Scorecard & Strength Benchmarks */}
      <div className="biometric-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onOpenAuth}
              disabled={!onOpenAuth}
              className="relative w-12 h-12 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center font-extrabold text-white text-base overflow-hidden transition-colors min-h-[44px] min-w-[44px]"
              aria-label={profile.email ? `Account (${profile.email})` : 'Sign In with Google'}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                profile.name.charAt(0)
              )}
              {profile.email && (
                <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#08090C]" />
              )}
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  {profile.name}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary font-bold">
                  Lv.{profile.level}
                </span>
              </div>
              <div className="flex items-center space-x-2 mt-0.5">
                <p className="text-xs text-slate-400 font-medium">
                  {units.format(bodyweightEmaKg)} bodyweight (7-day average)
                </p>
                {onOpenAuth && (
                  <>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onOpenAuth();
                      }}
                      className="text-xs text-brand-primary hover:underline font-semibold"
                    >
                      {profile.email ? 'Account' : 'Sign in'}
                    </button>
                  </>
                )}
              </div>
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
              <span className="text-xl font-extrabold font-mono text-white tabular-numbers tracking-tight">
                {hasBig3Data ? dotsScore : '—'}
              </span>
              <span className="text-xs font-bold text-slate-400">pts</span>
            </div>
            <span className="text-xs text-slate-400 font-medium block mt-0.5">
              {hasBig3Data ? `Adjusted for ${units.format(bodyweightEmaKg)} bodyweight` : 'Log a squat, bench or deadlift to see this'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#141824] space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Combined Big 3 Max
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-xl font-extrabold font-mono text-brand-primary tabular-numbers tracking-tight">
                {hasBig3Data ? units.format(powerliftingTotalE1rm, false) : '—'}
              </span>
              {hasBig3Data && (
                <span className="text-xs font-bold text-slate-300">
                  {units.unit} ({Math.round((powerliftingTotalE1rm / bodyweightEmaKg) * 10) / 10}x bodyweight)
                </span>
              )}
            </div>
            <div className="pt-2 flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Squat: <strong className="text-white font-mono">{squat ? units.format(squat, false) : '—'}</strong></span>
              <span>•</span>
              <span>Bench: <strong className="text-white font-mono">{bench ? units.format(bench, false) : '—'}</strong></span>
              <span>•</span>
              <span>Dead: <strong className="text-white font-mono">{deadlift ? units.format(deadlift, false) : '—'}</strong></span>
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
              ? 'bg-white/[0.14] text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
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
              ? 'bg-white/[0.14] text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
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
              ? 'bg-white/[0.14] text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          XP Division
        </button>
      </div>

      {subView === 'volume' ? (
        /* Primary Focal Point: Weekly Sets by Muscle Tracker */
        <VolumeTracker
          weeklyVolume={weeklyVolume}
          mesoWeek={profile.mesocycleWeek || 1}
          goalPhase={profile.goalPhase}
        />
      ) : subView === 'balance' ? (
        <div className="space-y-4">
          {/* Strength & Fitness Balance Radar */}
          <SevenPillarRadar
            pillarBestE1rm={pillarBestE1rm}
            bodyweightEmaKg={bodyweightEmaKg}
            latestBiometrics={latestBiometrics}
            gender={profile.gender}
          />

          {/* Consistency & Activity (real values only) */}
          <div className="rounded-3xl surface-glass p-5 sm:p-6 space-y-3">
            <h3 className="text-sm font-bold text-white">Consistency & Activity</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-[#090C12] space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-amber-400">
                  <Flame className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                  <span>{profile.streakDays} training {profile.streakDays === 1 ? 'day' : 'days'}</span>
                </div>
                <p className="text-xs text-slate-400 leading-snug">
                  Rest days never reset this count.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090C12] space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-brand-primary">
                  <Zap className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                  <span>
                    {(latestBiometrics.steps || 0).toLocaleString()} steps
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-snug">
                  {latestBiometrics.activeZoneMinutes || 0} active minutes today
                  {latestBiometrics.steps ? '' : ' • connect a watch to track'}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Sub-View C: Personal XP Division */
        <XPLeaderboardCard
          profile={profile}
          onUpdateProfile={onUpdateProfile || (() => {})}
        />
      )}
    </div>
  );
};
