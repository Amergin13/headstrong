import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { WorkoutSession } from '../../engine/types';
import { calculateWci, calculateSessionTonnage } from '../../engine/wci';

interface WciChartProps {
  workouts: WorkoutSession[];
  restingHr?: number;
  maxHr?: number;
}

export const WciChart: React.FC<WciChartProps> = ({
  workouts,
  restingHr = 56,
  maxHr = 192,
}) => {
  const completedWorkouts = workouts.filter((w) => w.completed);

  const chartData = completedWorkouts.map((w) => {
    const wci = calculateWci(w, restingHr, maxHr);
    const { tonnageKg, completedSetsCount } = calculateSessionTonnage(w);
    const shortDate = w.date.substring(5);

    return {
      date: shortDate,
      fullDate: w.date,
      name: w.name,
      split: w.splitDay,
      wci,
      tonnage: tonnageKg,
      sets: completedSetsCount,
      avgHr: w.avgHeartRate || 140,
      duration: w.durationMinutes || 60,
    };
  });

  const latestWci = chartData[chartData.length - 1]?.wci || 0;
  const firstWci = chartData[0]?.wci || 0;
  const wciImprovementPct = firstWci > 0 ? Math.round(((latestWci - firstWci) / firstWci) * 100) : 0;

  return (
    <div className="rounded-3xl surface-glass p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-white tracking-tight">
            Workout Stamina
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            How much weight you lift relative to heart rate and workout time
          </p>
        </div>

        <div className="text-right">
          <div className="text-base font-bold font-mono text-brand-primary">
            {latestWci} pts
          </div>
          <span className="text-xs text-brand-primary font-medium">
            {completedWorkouts.length > 0
              ? `${wciImprovementPct >= 0 ? `+${wciImprovementPct}%` : `${wciImprovementPct}%`} (6 wks)`
              : 'Starting Baseline'}
          </span>
        </div>
      </div>

      {/* Stamina Area Chart */}
      {chartData.length === 0 ? (
        <div className="w-full h-40 rounded-2xl bg-[#090C12] flex flex-col items-center justify-center p-4 text-center space-y-1.5">
          <p className="text-xs font-semibold text-white">No completed workouts yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            As you log sessions, your workout stamina score will track your tonnage density and cardiovascular recovery.
          </p>
        </div>
      ) : (
        <div className="w-full h-48 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="wciGradientClean" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E222D" strokeDasharray="2 2" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748B', fontSize: 10 }}
                stroke="#262A36"
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 10 }}
                stroke="#262A36"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-3 rounded-xl bg-[#0C0E14] shadow-2xl text-xs space-y-1">
                        <div className="font-bold text-white">{data.name} ({data.fullDate})</div>
                        <div className="text-brand-primary font-mono font-bold">
                          Stamina Score: {data.wci} pts
                        </div>
                        <div className="text-xs text-slate-400">
                          {data.tonnage.toLocaleString()} kg • {data.sets} sets • {data.duration} min
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="wci"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#wciGradientClean)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
