import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  BiometricLog,
  GoalPhase,
  StrengthPillar,
  UserProfile,
} from '../../engine/types';
import { SevenPillarRadar } from './SevenPillarRadar';
import { VolumeTracker } from './VolumeTracker';
import { calculateDotsScore } from '../../engine/dots';
import { useUnits } from '../../utils/unitsContext';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;
const PAGE_GUTTER = 38;

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

type AthleteSubView = 'volume' | 'balance';

/** Score ring matching RecoveryScoreCard on the Workout page. */
const ScoreRing: React.FC<{ value: number | null; max?: number; avatarUrl?: string; name?: string }> = ({
  value,
  max = 500,
  avatarUrl,
  name,
}) => {
  const r = 93;
  const c = 2 * Math.PI * r;
  const pct = value === null || value <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative shrink-0" style={{ width: fig(200), height: fig(200) }}>
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#474D50" strokeWidth="14" />
        {pct > 0 && (
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="#00F19F"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center font-bold text-white">
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt={name || 'Athlete'}
            className="rounded-full object-cover mb-1"
            style={{ width: fig(44), height: fig(44) }}
          />
        )}
        {value === null || value <= 0 ? (
          <span style={{ fontSize: fig(48), color: 'var(--wk-muted)' }}>—</span>
        ) : (
          <span style={{ fontSize: fig(52), lineHeight: 1 }}>{Math.round(value)}</span>
        )}
      </span>
    </div>
  );
};

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
  const bwMultiple =
    hasBig3Data && bodyweightEmaKg > 0
      ? Math.round((powerliftingTotalE1rm / bodyweightEmaKg) * 10) / 10
      : 0;

  const segment = (view: AthleteSubView, label: string) => (
    <button
      type="button"
      aria-pressed={subView === view}
      onClick={() => {
        triggerHaptic('light');
        setSubView(view);
      }}
      className="flex items-center justify-center font-bold uppercase transition-colors"
      style={{
        minHeight: 44,
        height: fig(96),
        borderRadius: fig(22),
        fontSize: fig(24),
        background: subView === view ? 'var(--wk-pill)' : 'transparent',
        color: subView === view ? '#fff' : 'var(--wk-muted)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="wk -mx-3.5"
      style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 112 }}
    >
      <header style={{ paddingTop: fig(20) }}>
        <h1
          className="font-bold text-white uppercase text-center"
          style={{ fontSize: fig(26), letterSpacing: '0.02em' }}
        >
          Athlete
        </h1>
        <div
          role="group"
          aria-label="Athlete view"
          className="grid grid-cols-2"
          style={{
            marginTop: fig(40),
            padding: fig(8),
            gap: fig(8),
            borderRadius: fig(30),
            background: 'var(--wk-card)',
          }}
        >
          {segment('volume', 'Weekly Sets')}
          {segment('balance', 'Strength')}
        </div>
      </header>

      <div className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
        {/* Athlete Overview Card — RecoveryScoreCard anatomy */}
        <button
          type="button"
          disabled={!onOpenAuth}
          onClick={() => {
            triggerHaptic('light');
            onOpenAuth?.();
          }}
          aria-label={`${profile.name}, Goal ${friendlyGoal}. ${
            hasBig3Data ? `DOTS score ${dotsScore}.` : 'Log a squat, bench or deadlift to score.'
          }`}
          className="wk-card w-full text-left flex items-center"
          style={{ gap: fig(52) }}
        >
          <ScoreRing
            value={hasBig3Data ? dotsScore : null}
            max={500}
            avatarUrl={profile.avatarUrl}
            name={profile.name}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between" style={{ gap: fig(16) }}>
              <span className="wk-pill">
                {friendlyGoal}
              </span>
              {onOpenAuth && (
                <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
              )}
            </div>
            <h2 className="wk-label" style={{ marginTop: fig(28) }}>
              {profile.name}
            </h2>
            <p className="wk-body" style={{ marginTop: fig(12) }}>
              {hasBig3Data
                ? `Strength-to-weight score ${dotsScore} pts at ${units.format(bodyweightEmaKg)} (7-day average).`
                : `${units.format(bodyweightEmaKg)} 7-day average. Log a squat, bench or deadlift to calculate your strength score.`}
            </p>
          </div>
        </button>

        {/* Combined Big 3 Max Card — ProgramProgressCard anatomy */}
        <div className="wk-card w-full text-left block">
          <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
            <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
              Combined Big 3 Max
            </h2>
            {bwMultiple > 0 && <span className="wk-pill">{bwMultiple}x BW</span>}
          </div>
          <p
            style={{
              fontSize: fig(28),
              lineHeight: 1.21,
              color: 'var(--wk-muted)',
              marginTop: fig(20),
            }}
          >
            Squat {squat ? units.format(squat) : '—'} • Bench {bench ? units.format(bench) : '—'} •
            Deadlift {deadlift ? units.format(deadlift) : '—'}
          </p>
          <div
            className="flex items-end justify-between"
            style={{ marginTop: fig(60), gap: fig(20) }}
          >
            <span className="wk-label" style={{ lineHeight: 1.21 }}>
              ESTIMATED TOTAL
            </span>
            <span
              className="font-bold text-white shrink-0"
              style={{ fontSize: fig(40), lineHeight: 1 }}
            >
              {hasBig3Data ? units.format(powerliftingTotalE1rm) : '—'}
            </span>
          </div>
          <div
            className="wk-bar"
            style={{ marginTop: fig(30) }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={600}
            aria-valuenow={Math.round(powerliftingTotalE1rm)}
            aria-label="Combined Big 3 total progress"
          >
            <div
              style={{
                width: `${Math.min(100, Math.round((powerliftingTotalE1rm / 500) * 100))}%`,
              }}
            />
          </div>
        </div>

        {subView === 'volume' ? (
          <VolumeTracker
            weeklyVolume={weeklyVolume}
            mesoWeek={profile.mesocycleWeek || 1}
            goalPhase={profile.goalPhase}
          />
        ) : (
          <>
            <SevenPillarRadar
              pillarBestE1rm={pillarBestE1rm}
              bodyweightEmaKg={bodyweightEmaKg}
              latestBiometrics={latestBiometrics}
              gender={profile.gender}
            />

            {/* Consistency & Activity Card — ProgramProgressCard anatomy */}
            <div className="wk-card w-full text-left block">
              <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
                <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                  Consistency &amp; Activity
                </h2>
                <span className="wk-pill">
                  {profile.streakDays} {profile.streakDays === 1 ? 'DAY' : 'DAYS'}
                </span>
              </div>
              <p
                style={{
                  fontSize: fig(28),
                  lineHeight: 1.21,
                  color: 'var(--wk-muted)',
                  marginTop: fig(20),
                }}
              >
                Rest days never reset your training count
              </p>
              <div
                className="flex items-end justify-between"
                style={{ marginTop: fig(60), gap: fig(20) }}
              >
                <span className="wk-label" style={{ lineHeight: 1.21 }}>
                  TODAY: {(latestBiometrics.steps || 0).toLocaleString()} STEPS
                </span>
                <span
                  className="font-bold text-white shrink-0"
                  style={{ fontSize: fig(40), lineHeight: 1 }}
                >
                  {latestBiometrics.activeZoneMinutes || 0} min
                </span>
              </div>
              <div
                className="wk-bar"
                style={{ marginTop: fig(30) }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={10000}
                aria-valuenow={latestBiometrics.steps || 0}
                aria-label="Daily step progress"
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.round(((latestBiometrics.steps || 0) / 10000) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
