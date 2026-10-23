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
import { useUnits } from '../../utils/unitsContext';

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
  const units = useUnits();
  // Oldest to newest, so the chart reads left to right.
  const completedWorkouts = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (a.completedAt || a.date).localeCompare(b.completedAt || b.date));

  // Stamina needs a measured workout heart rate (e.g. from Whoop). Without one, show volume instead.
  const withHeartRate = completedWorkouts.filter((w) => (w.avgHeartRate || 0) > 0);
  const showStamina = withHeartRate.length >= 1;
  const source = showStamina ? withHeartRate : completedWorkouts;

  const chartData = source.slice(-30).map((w) => {
    const { tonnageKg, completedSetsCount } = calculateSessionTonnage(w);
    return {
      date: w.date.substring(5),
      fullDate: w.date,
      name: w.name,
      value: showStamina
        ? calculateWci(w, restingHr, maxHr)
        : Math.round(units.toDisplay(tonnageKg)),
      tonnage: tonnageKg,
      sets: completedSetsCount,
      duration: w.durationMinutes,
    };
  });

  const latest = chartData[chartData.length - 1]?.value || 0;
  const first = chartData[0]?.value || 0;
  const changePct = chartData.length > 1 && first > 0 ? Math.round(((latest - first) / first) * 100) : null;

  return (
    <div className="rounded-3xl surface-glass p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-white tracking-tight">
            {showStamina ? 'Workout Stamina' : 'Workout Volume'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {showStamina
              ? 'Weight lifted relative to workout heart rate and time'
              : 'Total weight lifted per workout (weight × reps)'}
          </p>
        </div>

        <div className="text-right">
          <div className="text-base font-bold font-mono text-brand-primary">
            {latest.toLocaleString()} {showStamina ? 'pts' : units.unit}
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {changePct !== null
              ? `${changePct >= 0 ? '+' : ''}${changePct}% since ${chartData[0].fullDate.substring(5)}`
              : 'Latest workout'}
          </span>
        </div>
      </div>

      {/* Stamina Area Chart */}
      {!showStamina && completedWorkouts.length > 0 && (
        <p className="text-xs text-slate-400">
          Connect Whoop to see stamina. It needs your heart rate during workouts.
        </p>
      )}

      {chartData.length === 0 ? (
        <div className="w-full h-40 rounded-2xl bg-[#090C12] flex flex-col items-center justify-center p-4 text-center space-y-1.5">
          <p className="text-xs font-semibold text-white">No completed workouts yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Finish your first workout to start this chart.
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
                tick={{ fill: '#94A3B8', fontSize: 12 }}
                stroke="#262A36"
              />
              <YAxis
                tick={{ fill: '#94A3B8', fontSize: 12 }}
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
                          {showStamina ? `Stamina: ${data.value} pts` : `Volume: ${data.value.toLocaleString()} ${units.unit}`}
                        </div>
                        <div className="text-xs text-slate-400">
                          {data.sets} sets{data.duration ? ` • ${data.duration} min` : ''}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
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
