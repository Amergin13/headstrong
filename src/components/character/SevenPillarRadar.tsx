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
import { Heart } from 'lucide-react';

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

  const engineScore = pillarScores.find((p) => p.pillar === 'Engine / Vitality')?.score ?? 75;

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
    <div className="rounded-3xl surface-glass p-4 border border-white/[0.08] space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-white tracking-tight">
            Strength &amp; Fitness Balance
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            How your main lifts and cardio compare
          </p>
        </div>
        <span className="text-xs font-mono font-bold text-brand-primary px-2.5 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20">
          {overallBadgeText}
        </span>
      </div>

      {/* Radar Chart */}
      <div className="w-full h-56 -my-1">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={chartData}>
            <PolarGrid stroke="#202432" strokeDasharray="2 2" />
            <PolarAngleAxis
              dataKey="pillar"
              tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }}
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
              stroke="#00F59B"
              strokeWidth={2}
              fill="#00F59B"
              fillOpacity={0.2}
              dot={{ r: 3, fill: '#00F59B', stroke: '#060709', strokeWidth: 1.5 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="p-2.5 rounded-2xl bg-[#0C0E14] border border-white/[0.12] shadow-2xl text-xs space-y-0.5">
                      <div className="font-bold text-white">{data.fullName}</div>
                      <div className="text-brand-primary font-mono font-bold">
                        Score: {data.score}/100
                      </div>
                      <div className="text-xs text-slate-400">
                        Level: {data.tier} {data.subDivision || ''}
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

      {/* Cardio & Heart Health Summary Row */}
      <div className="p-3 rounded-2xl bg-black/40 border border-white/[0.05] flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <Heart className="w-4 h-4 text-brand-primary stroke-[2]" />
          <span className="font-semibold text-white">Cardio &amp; Recovery</span>
        </div>
        <div className="flex items-center space-x-2 font-mono text-slate-300">
          <span>Fitness {latestBiometrics?.vo2Max ?? 44.0}</span>
          <span>•</span>
          <span>Resting HR {latestBiometrics?.restingHr ?? 58} bpm</span>
          <span>•</span>
          <span className="font-bold text-brand-primary">{engineScore}/100</span>
        </div>
      </div>
    </div>
  );
};
