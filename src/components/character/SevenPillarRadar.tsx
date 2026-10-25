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

const fig = (px: number) => `calc(${px} * var(--f))`;

interface SevenPillarRadarProps {
  pillarBestE1rm: Record<StrengthPillar, number>;
  bodyweightEmaKg: number;
  latestBiometrics: BiometricLog;
  gender?: 'male' | 'female';
}

export const SevenPillarRadar: React.FC<SevenPillarRadarProps> = ({
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
    };
  });

  const engineScore = pillarScores.find((p) => p.pillar === 'Engine / Vitality')?.score ?? 0;

  const strengthPillars = pillarScores.filter((p) => p.pillar !== 'Engine / Vitality');
  const avgStrengthScore =
    strengthPillars.reduce((acc, p) => acc + p.score, 0) / (strengthPillars.length || 1);
  let overallTierName = 'Untrained';
  if (avgStrengthScore >= 90) overallTierName = 'Elite';
  else if (avgStrengthScore >= 75) overallTierName = 'Advanced';
  else if (avgStrengthScore >= 50) overallTierName = 'Intermediate';
  else if (avgStrengthScore >= 25) overallTierName = 'Novice';

  const subDivisionIndex = Math.min(3, Math.floor(((avgStrengthScore % 25) / 25) * 4));
  const subDivisionLabel = ['I', 'II', 'III', 'IV'][subDivisionIndex] || 'I';
  const overallBadgeText = overallTierName === 'Elite' ? 'Elite' : `${overallTierName} ${subDivisionLabel}`;

  return (
    <section aria-label="Strength and Fitness Balance" className="wk-card w-full text-left block">
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          Strength &amp; Fitness Balance
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
        How your 6 movement pillars and cardio compare
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
