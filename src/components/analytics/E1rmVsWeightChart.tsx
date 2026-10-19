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
import {
  calculateE1RM,
  calculateWeightNeededForTargetE1RM,
  formatImplementWeightLabel,
} from '../../engine/e1rm';
import { getMovementVectorId } from '../../engine/progression';
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

  const activeGroupMeta =
    PILLAR_GROUPS.find((p) => p.pillar === selectedPillar) || PILLAR_GROUPS[0];
  const targetVectorId = `vector-pillar-${selectedPillar.toLowerCase().replace(/\s+/g, '-')}`;

  const emaData = calculateEmaSeries(biometrics);
  const emaMap = new Map(emaData.map((d) => [d.date, d.ema]));
  const latestBwEma = emaData[emaData.length - 1]?.ema || 81.5;

  const workoutMap = new Map<
    string,
    {
      canonicalE1rm: number;
      implementName: string;
      equipment: string;
      rawSetSummary: string;
      isSubstitutedImplement: boolean;
    }
  >();

  for (const w of workouts) {
    if (!w.completed) continue;
    const bwEma = emaMap.get(w.date) || latestBwEma;

    for (const ex of w.exercises) {
      if (getMovementVectorId(ex) === targetVectorId) {
        let bestExE1rm = 0;
        let bestSetSummary = '';

        for (const s of ex.sets) {
          if (s.completed && s.actualReps && !s.isWarmup && s.setType !== 'warmup') {
            const weight = s.actualWeightKg ?? s.targetWeightKg;
            const rir = s.actualRir ?? 2;
            const e1rm = calculateE1RM(
              weight,
              s.actualReps,
              rir,
              ex.equipment,
              ex.isRdl,
              ex.isWeightedCalisthenic,
              bwEma
            );
            if (e1rm > bestExE1rm) {
              bestExE1rm = e1rm;
              const formattedW = formatImplementWeightLabel(
                weight,
                ex.equipment,
                ex.isWeightedCalisthenic
              );
              bestSetSummary = `${formattedW} × ${s.actualReps} reps`;
            }
          }
        }

        const existing = workoutMap.get(w.date);
        if (bestExE1rm > 0 && (!existing || bestExE1rm > existing.canonicalE1rm)) {
          workoutMap.set(w.date, {
            canonicalE1rm: bestExE1rm,
            implementName: ex.name,
            equipment: ex.equipment,
            rawSetSummary: bestSetSummary,
            isSubstitutedImplement: ex.equipment !== 'barbell' || Boolean(ex.isRdl),
          });
        }
      }
    }
  }

  const sampledEma = emaData.slice(-24);
  const chartPoints: {
    date: string;
    displayDate: string;
    e1rm: number | null;
    bodyweightEma: number;
    implementName?: string;
    rawSetSummary?: string;
    isSubstitutedImplement?: boolean;
  }[] = [];

  let lastKnownE1rm: number | null = null;
  let lastImplementName: string | undefined;
  let lastSetSummary: string | undefined;
  let lastIsSub = false;

  sampledEma.forEach((point) => {
    const match = workoutMap.get(point.date);
    if (match !== undefined) {
      lastKnownE1rm = match.canonicalE1rm;
      lastImplementName = match.implementName;
      lastSetSummary = match.rawSetSummary;
      lastIsSub = match.isSubstitutedImplement;
    }

    const shortDate = point.date.substring(5);
    chartPoints.push({
      date: point.date,
      displayDate: shortDate,
      e1rm: lastKnownE1rm,
      bodyweightEma: point.ema,
      implementName: match ? match.implementName : lastImplementName,
      rawSetSummary: match ? match.rawSetSummary : lastSetSummary,
      isSubstitutedImplement: match ? match.isSubstitutedImplement : lastIsSub,
    });
  });

  const currentPeakCanonicalE1rm = lastKnownE1rm || 110;

  const eqBarbell10RM = calculateWeightNeededForTargetE1RM(
    currentPeakCanonicalE1rm,
    10,
    2,
    'barbell',
    false,
    false,
    latestBwEma
  );
  const eqDumbbell10RM = calculateWeightNeededForTargetE1RM(
    currentPeakCanonicalE1rm,
    10,
    2,
    'dumbbell',
    false,
    false,
    latestBwEma
  );
  const eqThird10RM =
    selectedPillar === 'Hinge'
      ? calculateWeightNeededForTargetE1RM(
          currentPeakCanonicalE1rm,
          10,
          2,
          'barbell',
          true,
          false,
          latestBwEma
        )
      : calculateWeightNeededForTargetE1RM(
          currentPeakCanonicalE1rm,
          10,
          2,
          'weighted_bodyweight',
          false,
          true,
          latestBwEma
        );

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
          className="px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center space-x-1 transition-colors shrink-0"
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                isSelected
                  ? 'bg-brand-primary text-black shadow-sm'
                  : 'bg-[#090C12] text-slate-300 hover:text-white'
              }`}
            >
              {grp.label}
            </button>
          );
        })}
      </div>

      {/* Dual Axis Chart */}
      {chartPoints.length === 0 ? (
        <div className="w-full h-44 rounded-2xl bg-[#090C12] flex flex-col items-center justify-center p-4 text-center space-y-1.5">
          <p className="text-xs font-semibold text-white">No workout history logged yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Complete your first session or log your bodyweight to chart your strength-to-weight trends.
          </p>
        </div>
      ) : (
        <div className="w-full h-52 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#1E222D" strokeDasharray="2 2" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fill: '#64748B', fontSize: 10 }}
                stroke="#262A36"
              />
            <YAxis
              yAxisId="left"
              domain={['auto', 'auto']}
              tick={{ fill: '#00F59B', fontSize: 10 }}
              stroke="#00F59B"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={['auto', 'auto']}
              tick={{ fill: '#06B6D4', fontSize: 10 }}
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
                          <span className="font-mono font-bold text-white">{entry.value} kg</span>
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
              name="Est. 1-Rep Max (kg)"
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
              name="7-Day Avg Weight (kg)"
              stroke="#06B6D4"
              strokeWidth={1.8}
              strokeDasharray="4 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Matched Weights Across Equipment */}
      <div className="p-4 rounded-2xl bg-[#090C12] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
            <span className="text-xs font-bold text-white">
              Matched Weights Across Equipment (10 reps)
            </span>
          </div>
          <span className="text-xs font-mono text-brand-primary font-bold">
            Est. Max: {currentPeakCanonicalE1rm} kg
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-3 rounded-xl bg-[#141824]">
            <div className="text-xs text-slate-400 font-semibold">
              Barbell
            </div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">
              {eqBarbell10RM} kg
            </div>
            <div className="text-xs text-slate-400">× 10 reps</div>
          </div>

          <div className="p-3 rounded-xl bg-[#141824]">
            <div className="text-xs text-slate-400 font-semibold">
              Dumbbells
            </div>
            <div className="text-sm font-mono font-bold text-brand-primary mt-0.5">
              {eqDumbbell10RM / 2} kg each
            </div>
            <div className="text-xs text-slate-400">{eqDumbbell10RM} kg total</div>
          </div>

          <div className="p-3 rounded-xl bg-[#141824]">
            <div className="text-xs text-slate-400 font-semibold">
              {selectedPillar === 'Hinge' ? 'Romanian DL' : 'Bodyweight'}
            </div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">
              {selectedPillar === 'Hinge' ? `${eqThird10RM} kg` : `+${eqThird10RM} kg`}
            </div>
            <div className="text-xs text-slate-400">× 10 reps</div>
          </div>
        </div>
      </div>
    </div>
  );
};
