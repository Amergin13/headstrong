import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { BiometricLog, StrengthPillar } from '../../engine/types';
import { generate7PillarRadarData } from '../../engine/vitality';
import { evaluateStrengthStandard } from '../../engine/strengthStandards';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface StrengthLevelsCardProps {
  pillarBestE1rm: Record<StrengthPillar, number>;
  bodyweightEmaKg: number;
  latestBiometrics: BiometricLog;
  gender?: 'male' | 'female';
}

/**
 * Strength levels (Progress → Strength): each of the 6 movement patterns compared with bodyweight
 * (international strength standards, AGENTS.md §1.4), plus cardio from real watch data. A movement
 * the athlete hasn't logged shows "Not logged yet", never a level.
 */
export const StrengthLevelsCard: React.FC<StrengthLevelsCardProps> = ({
  pillarBestE1rm,
  bodyweightEmaKg,
  latestBiometrics,
  gender = 'male',
}) => {
  const pillarScores = generate7PillarRadarData(
    pillarBestE1rm,
    bodyweightEmaKg,
    latestBiometrics,
    gender
  );

  const chartData = pillarScores.map((ps) => {
    let shortLabel: string = ps.pillar;
    let friendlyName: string = ps.pillar;
    if (ps.pillar === 'Horizontal Push') {
      shortLabel = 'Chest';
      friendlyName = 'Chest Press';
    }
    if (ps.pillar === 'Vertical Push') {
      shortLabel = 'Shoulders';
      friendlyName = 'Shoulder Press';
    }
    if (ps.pillar === 'Horizontal Pull') {
      shortLabel = 'Row';
      friendlyName = 'Back Row';
    }
    if (ps.pillar === 'Vertical Pull') {
      shortLabel = 'Pull-Up';
      friendlyName = 'Pull-Ups & Pulldowns';
    }
    if (ps.pillar === 'Hinge') {
      shortLabel = 'Deadlift';
      friendlyName = 'Deadlift & Hinge';
    }
    if (ps.pillar === 'Engine / Vitality') {
      shortLabel = 'Cardio';
      friendlyName = 'Cardio & Recovery';
    }

    return {
      pillar: shortLabel,
      fullName: friendlyName,
      score: ps.score,
      tier: ps.tier,
      subDivision: ps.subDivision,
      fullMark: 100,
      key: ps.pillar,
      logged: ps.pillar === 'Engine / Vitality' ? ps.score > 0 : (pillarBestE1rm[ps.pillar as StrengthPillar] || 0) > 0,
    };
  });
  const movementRows = chartData
    .filter((d) => d.pillar !== 'Cardio')
    .map((d) => {
      const pillar = d.key as StrengthPillar;
      const std = evaluateStrengthStandard(pillar, pillarBestE1rm[pillar] || 0, bodyweightEmaKg, gender);
      return {
        ...d,
        progress: std.percentageProgress,
        next: std.tier === 'Elite' && std.nextTier === 'Elite' ? null : `${std.nextTier} ${std.nextSubDivision}`,
      };
    });

  const engineScore = pillarScores.find((p) => p.pillar === 'Engine / Vitality')?.score ?? 0;

  // Overall level: the average of the movements actually logged, on the same tier and
  // sub-division scale as each row (never counts an unlogged movement as a low level).
  const LEVELS = ['Untrained', 'Novice', 'Intermediate', 'Advanced', 'Elite'] as const;
  const loggedRows = movementRows.filter((r) => r.logged);
  const overallStep = loggedRows.length
    ? Math.round(
        loggedRows.reduce((acc, r) => acc + LEVELS.indexOf(r.tier as (typeof LEVELS)[number]) * 4 + ['I', 'II', 'III', 'IV'].indexOf(r.subDivision ?? 'I'), 0) /
          loggedRows.length
      )
    : 0;
  const overallBadgeText = `${LEVELS[Math.floor(overallStep / 4)]} ${['I', 'II', 'III', 'IV'][overallStep % 4]}`;

  // No lifts logged: no level to show yet (never a placeholder rank).
  if (!Object.values(pillarBestE1rm).some((v) => v > 0)) {
    return (
      <section aria-label="Strength levels" className="wk-card w-full text-left block">
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          Strength levels
        </h2>
        <p className="wk-body" style={{ marginTop: fig(24) }}>
          Finish a workout to see your strength level for each movement, compared with your bodyweight.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Strength levels" className="wk-card w-full text-left block">
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          Strength levels
        </h2>
        <span className="wk-pill">{overallBadgeText}</span>
      </div>
      <p
        style={{
          fontSize: fig(28),
          lineHeight: 1.21,
          color: 'var(--wk-muted)',
          marginTop: fig(20),
        }}
      >
        Your best estimated max on each movement, compared with your bodyweight
      </p>

      {/* Radar Chart */}
      <div className="w-full h-56" style={{ marginTop: fig(28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={chartData}>
            <PolarGrid stroke="#474D50" strokeDasharray="2 2" />
            <PolarAngleAxis
              dataKey="pillar"
              tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 700 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="Strength & Fitness"
              dataKey="score"
              stroke="#00F19F"
              strokeWidth={2}
              fill="#00F19F"
              fillOpacity={0.2}
              dot={{ r: 3, fill: '#00F19F', stroke: '#2C3034', strokeWidth: 1.5 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div
                      className="wk-card shadow-2xl"
                      style={{ padding: fig(24), borderRadius: fig(20) }}
                    >
                      <div className="wk-label">{data.fullName}</div>
                      <div className="wk-body" style={{ marginTop: fig(8) }}>
                        Score: <strong className="text-white">{data.score}/100</strong> • {data.tier}{' '}
                        {data.subDivision || ''}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* One row per movement: its level and how close the next one is. */}
      <ul className="flex flex-col" style={{ marginTop: fig(32), gap: fig(28) }} aria-label="Level for each movement">
        {movementRows.map((row) => (
          <li key={row.pillar}>
            <div className="flex items-baseline justify-between" style={{ gap: fig(16) }}>
              <span className="wk-label" style={{ lineHeight: 1.21 }}>
                {row.fullName}
              </span>
              <span className="font-bold shrink-0" style={{ fontSize: `max(12px, ${fig(26)})`, color: row.logged ? '#fff' : 'var(--wk-muted)' }}>
                {row.logged ? `${row.tier} ${row.subDivision}` : 'Not logged yet'}
              </span>
            </div>
            {row.logged && (
              <>
                <div
                  className="wk-bar"
                  style={{ marginTop: fig(14) }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={row.progress}
                  aria-label={row.next ? `${row.fullName}: ${row.progress}% of the way to ${row.next}` : `${row.fullName}: top level`}
                >
                  <div style={{ width: `${row.next ? row.progress : 100}%` }} />
                </div>
                {row.next && (
                  <span className="block" style={{ marginTop: fig(10), fontSize: `max(12px, ${fig(24)})`, color: 'var(--wk-muted)' }}>
                    Next: {row.next}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Cardio & Recovery Bar Row — ProgramProgressCard anatomy */}
      <div
        className="flex items-end justify-between"
        style={{ marginTop: fig(40), gap: fig(20) }}
      >
        <span className="wk-label" style={{ lineHeight: 1.21 }}>
          CARDIO &amp; RECOVERY
          {engineScore > 0 && (latestBiometrics?.restingHr || 0) > 0
            ? ` • ${latestBiometrics.restingHr} BPM RHR`
            : ''}
        </span>
        <span
          className="font-bold text-white shrink-0"
          style={{ fontSize: fig(40), lineHeight: 1 }}
        >
          {engineScore > 0 ? `${engineScore}/100` : '—'}
        </span>
      </div>
      <div
        className="wk-bar"
        style={{ marginTop: fig(30) }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={engineScore}
        aria-label="Cardio and recovery score"
      >
        <div style={{ width: `${Math.max(0, Math.min(100, engineScore))}%` }} />
      </div>
    </section>
  );
};
