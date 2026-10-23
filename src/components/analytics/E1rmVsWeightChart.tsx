import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { BiometricLog, StrengthPillar, WorkoutSession } from '../../engine/types';
import { calculateEmaSeries } from '../../engine/ema';
import { calculateE1RM, calculateWeightNeededForTargetE1RM } from '../../engine/e1rm';
import { isPillarBenchmarkExercise } from '../../engine/strengthStandards';
import { useUnits } from '../../utils/unitsContext';
import { Plus, ArrowRightLeft } from 'lucide-react';

interface E1rmVsWeightChartProps {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  onOpenWeightModal: () => void;
}

const PILLAR_GROUPS: { pillar: StrengthPillar; label: string; subtitle: string }[] = [
  {
    pillar: 'Horizontal Push',
    label: 'Chest Press',
    subtitle: 'Combines Barbell Bench, Dumbbell Press & Cable Press progress',
  },
  {
    pillar: 'Squat',
    label: 'Squat & Legs',
    subtitle: 'Combines Barbell Back Squat & Leg Press progress',
  },
  {
    pillar: 'Hinge',
    label: 'Deadlift',
    subtitle: 'Combines Conventional & Romanian Deadlift progress',
  },
  {
    pillar: 'Vertical Pull',
    label: 'Pull-Ups & Lats',
    subtitle: 'Combines Weighted Pull-Ups & Lat Pulldown progress',
  },
  {
    pillar: 'Vertical Push',
    label: 'Shoulder Press',
    subtitle: 'Combines Barbell & Dumbbell Overhead Press progress',
  },
  {
    pillar: 'Horizontal Pull',
    label: 'Back Row',
    subtitle: 'Combines Barbell Row & Seated Cable Row progress',
  },
];

export const E1rmVsWeightChart: React.FC<E1rmVsWeightChartProps> = ({
  workouts,
  biometrics,
  onOpenWeightModal,
}) => {
  const [selectedPillar, setSelectedPillar] = useState<StrengthPillar>('Horizontal Push');

  const units = useUnits();
  const activeGroupMeta =
    PILLAR_GROUPS.find((p) => p.pillar === selectedPillar) || PILLAR_GROUPS[0];

  const emaData = calculateEmaSeries(
    [...biometrics].filter((b) => b.bodyweightKg > 0).sort((a, b) => a.date.localeCompare(b.date))
  );
  const latestBwEma = emaData[emaData.length - 1]?.ema;
  const emaOnOrBefore = (date: string): number | undefined => {
    let found: number | undefined;
    for (const d of emaData) {
      if (d.date <= date) found = d.ema;
      else break;
    }
    return found;
  };

  // Best estimated 1-rep max per workout date for this movement (any implement).
  const workoutMap = new Map<
    string,
    { canonicalE1rm: number; implementName: string; rawSetSummary: string; isSubstitutedImplement: boolean }
  >();

  for (const w of workouts) {
    if (!w.completed) continue;
    const bwEma = emaOnOrBefore(w.date) ?? latestBwEma ?? 80;

    for (const ex of w.exercises) {
      if (ex.pillar !== selectedPillar || !isPillarBenchmarkExercise(ex)) continue;
      let bestExE1rm = 0;
      let bestSetSummary = '';

      for (const s of ex.sets) {
        const reps = s.actualReps ?? s.targetReps;
        if (!s.completed || !reps || s.isWarmup || s.setType === 'warmup') continue;
        const weight = s.actualWeightKg ?? s.targetWeightKg;
        const e1rm = calculateE1RM(weight, reps, s.actualRir ?? 2, ex.equipment, ex.isRdl, ex.isWeightedCalisthenic, bwEma, ex.exerciseId, ex.pillar);
        if (e1rm > bestExE1rm) {
          bestExE1rm = e1rm;
          const label =
            ex.equipment === 'bodyweight' && weight === 0
              ? 'Bodyweight'
              : ex.equipment === 'dumbbell'
              ? `${units.format(weight / 2)} each`
              : units.format(weight);
          bestSetSummary = `${label} × ${reps} reps`;
        }
      }

      const existing = workoutMap.get(w.date);
      if (bestExE1rm > 0 && (!existing || bestExE1rm > existing.canonicalE1rm)) {
        workoutMap.set(w.date, {
          canonicalE1rm: Math.round(bestExE1rm * 10) / 10,
          implementName: ex.name,
          rawSetSummary: bestSetSummary,
          isSubstitutedImplement: ex.equipment !== 'barbell' || Boolean(ex.isRdl),
        });
      }
    }
  }

  // X-axis: every date with a workout for this movement or a weigh-in (last 60 points).
  const allDates = Array.from(new Set([...workoutMap.keys(), ...emaData.map((d) => d.date)])).sort().slice(-60);
  const chartPoints = allDates.map((date) => {
    const match = workoutMap.get(date);
    const bw = emaOnOrBefore(date);
    return {
      date,
      displayDate: date.substring(5),
      e1rm: match ? units.toDisplay(match.canonicalE1rm) : null,
      bodyweightEma: bw !== undefined ? units.toDisplay(bw) : null,
      implementName: match?.implementName,
      rawSetSummary: match?.rawSetSummary,
      isSubstitutedImplement: match?.isSubstitutedImplement,
    };
  });
  const hasStrengthData = workoutMap.size > 0;

  const currentPeakCanonicalE1rm = Array.from(workoutMap.values()).reduce(
    (max, v) => Math.max(max, v.canonicalE1rm),
    0
  );
  const bwForEquivalents = latestBwEma ?? 80;

  const eqBarbell10RM = calculateWeightNeededForTargetE1RM(currentPeakCanonicalE1rm, 10, 2, 'barbell', false, false, bwForEquivalents);
  const eqDumbbell10RM = calculateWeightNeededForTargetE1RM(currentPeakCanonicalE1rm, 10, 2, 'dumbbell', false, false, bwForEquivalents);
  const eqThird10RM =
    selectedPillar === 'Hinge'
      ? calculateWeightNeededForTargetE1RM(currentPeakCanonicalE1rm, 10, 2, 'barbell', true, false, bwForEquivalents)
      : calculateWeightNeededForTargetE1RM(currentPeakCanonicalE1rm, 10, 2, 'weighted_bodyweight', false, true, bwForEquivalents);

  return (
    <div className="rounded-3xl surface-glass p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-base text-white tracking-tight">
            Strength vs. Bodyweight
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeGroupMeta.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenWeightModal}
          className="px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center space-x-1 transition-colors shrink-0 min-h-[44px]"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>Log Weight</span>
        </button>
      </div>

      {/* Movement Selector Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {PILLAR_GROUPS.map((grp) => {
          const isSelected = grp.pillar === selectedPillar;
          return (
            <button
              key={grp.pillar}
              type="button"
              onClick={() => setSelectedPillar(grp.pillar)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[36px] flex items-center justify-center ${
                isSelected
                  ? 'bg-white text-slate-950 font-bold shadow-sm'
                  : 'bg-[#090C12] text-slate-400 hover:text-white'
              }`}
            >
              {grp.label}
            </button>
          );
        })}
      </div>

      {/* Dual Axis Chart */}
      {chartPoints.length === 0 || (!hasStrengthData && emaData.length < 2) ? (
        <div className="w-full h-44 rounded-2xl bg-[#090C12] flex flex-col items-center justify-center p-4 text-center space-y-1.5">
          <p className="text-xs font-semibold text-white">
            No {activeGroupMeta.label.toLowerCase()} sets logged yet
          </p>
          <p className="text-xs text-slate-400 max-w-xs">
            Finish a workout with this movement, or log your weight, and your trend will appear here.
          </p>
        </div>
      ) : (
        <div className="w-full h-52 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#1E222D" strokeDasharray="2 2" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fill: '#94A3B8', fontSize: 12 }}
                stroke="#262A36"
              />
            <YAxis
              yAxisId="left"
              domain={['auto', 'auto']}
              tick={{ fill: '#00F59B', fontSize: 12 }}
              stroke="#00F59B"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={['auto', 'auto']}
              tick={{ fill: '#06B6D4', fontSize: 12 }}
              stroke="#06B6D4"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const pt = payload[0]?.payload;
                  return (
                    <div className="p-3 rounded-2xl bg-[#090B10]/95 shadow-2xl text-xs space-y-1.5 max-w-[230px]">
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>{label}</span>
                        <span className="text-xs font-mono text-brand-primary">
                          {activeGroupMeta.label}
                        </span>
                      </div>
                      {pt?.implementName && (
                        <div className="text-xs text-slate-200 bg-white/[0.06] rounded-lg px-2 py-1">
                          <div className="font-bold text-white">{pt.implementName}</div>
                          <div className="font-mono text-xs text-slate-300">
                            {pt.rawSetSummary}
                          </div>
                        </div>
                      )}
                      {payload.map((entry: any) => (
                        <div key={entry.name} className="flex justify-between space-x-4">
                          <span style={{ color: entry.color }}>{entry.name}:</span>
                          <span className="font-mono font-bold text-white">{entry.value} {units.unit}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="e1rm"
              connectNulls
              name={`Est. 1-rep max (${units.unit})`}
              stroke="#00F59B"
              strokeWidth={2.5}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (!cx || !cy) return <g key={`empty-${cx}-${cy}`} />;
                const isSub = payload?.isSubstitutedImplement;
                return (
                  <circle
                    key={`dot-${payload?.date}`}
                    cx={cx}
                    cy={cy}
                    r={isSub ? 3.5 : 2.5}
                    fill={isSub ? '#06B6D4' : '#00F59B'}
                    stroke="#060709"
                    strokeWidth={1}
                  />
                );
              }}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="bodyweightEma"
              name={`7-day avg weight (${units.unit})`}
              connectNulls
              stroke="#06B6D4"
              strokeWidth={1.8}
              strokeDasharray="4 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Matched Weights Across Equipment (only once there is real data) */}
      {hasStrengthData && (
      <div className="p-4 rounded-2xl bg-[#090C12] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-brand-primary stroke-[2]" aria-hidden="true" />
            <span className="text-xs font-bold text-white">Matching weights for 10 reps</span>
          </div>
          <span className="text-xs font-mono text-brand-primary font-bold">
            Est. max: {units.format(currentPeakCanonicalE1rm)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-3 rounded-xl bg-[#141824]">
            <div className="text-xs text-slate-400 font-semibold">Barbell</div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">{units.format(eqBarbell10RM)}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#141824]">
            <div className="text-xs text-slate-400 font-semibold">Dumbbells</div>
            <div className="text-sm font-mono font-bold text-brand-primary mt-0.5">{units.format(eqDumbbell10RM / 2)}</div>
            <div className="text-xs text-slate-400">each</div>
          </div>
          <div className="p-3 rounded-xl bg-[#141824]">
            <div className="text-xs text-slate-400 font-semibold">
              {selectedPillar === 'Hinge' ? 'Romanian DL' : 'Bodyweight'}
            </div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">
              {selectedPillar === 'Hinge' ? units.format(eqThird10RM) : `+${units.format(eqThird10RM)}`}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
