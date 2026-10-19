import React from 'react';
import { BiometricLog } from '../../engine/types';
import { Zap } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface ActivityTrackerProps {
  biometrics: BiometricLog[];
}

export const ActivityTracker: React.FC<ActivityTrackerProps> = ({ biometrics }) => {
  const last14 = biometrics.slice(-14);
  const today = last14[last14.length - 1];

  const STEP_GOAL = 8500;
  const AZM_GOAL = 30;

  const currentSteps = today?.steps ?? 0;
  const currentAzm = today?.activeZoneMinutes ?? 0;
  const hasMetMomentum = currentSteps >= STEP_GOAL && currentAzm >= AZM_GOAL;

  const chartData = last14.map((b) => ({
    date: b.date.substring(5),
    steps: b.steps,
    azm: b.activeZoneMinutes,
  }));

  return (
    <div className="biometric-card p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-base text-white tracking-tight">
            Daily Steps &amp; Active Minutes
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Synced from your watch
          </p>
        </div>

        {hasMetMomentum ? (
          <div className="px-3 py-1 rounded-full bg-brand-primary/15 text-brand-primary text-xs font-extrabold flex items-center space-x-1">
            <Zap className="w-3.5 h-3.5 stroke-[2]" />
            <span>1.25x XP Bonus</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400 font-medium">
            Goal: 8,500 steps &amp; 30 min
          </span>
        )}
      </div>

      {/* Dual Activity Tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-[#141824] space-y-1">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
            Steps Today
          </span>
          <div className="text-xl font-extrabold font-mono text-white tracking-tight">
            {currentSteps.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Goal: {STEP_GOAL.toLocaleString()} ({Math.round((currentSteps / STEP_GOAL) * 100)}%)
          </div>
          <div className="w-full bg-[#090C12] h-2.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-brand-strain h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, (currentSteps / STEP_GOAL) * 100)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#141824] space-y-1">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
            Active Minutes
          </span>
          <div className="text-xl font-extrabold font-mono text-white tracking-tight">
            {currentAzm} <span className="text-xs text-slate-400 font-normal">min</span>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Goal: {AZM_GOAL} min ({Math.round((currentAzm / AZM_GOAL) * 100)}%)
          </div>
          <div className="w-full bg-[#090C12] h-2.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-brand-primary h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, (currentAzm / AZM_GOAL) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps 14-Day Bar Chart */}
      <div className="w-full h-36 -ml-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#1E222D" strokeDasharray="2 2" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 12 }} stroke="#262A36" />
            <YAxis tick={{ fill: '#64748B', fontSize: 12 }} stroke="#262A36" />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-[#0C0E14] shadow-2xl text-xs space-y-0.5">
                      <div className="font-semibold text-slate-300">{d.date}</div>
                      <div className="text-cyan-400 font-mono">Steps: {d.steps.toLocaleString()}</div>
                      <div className="text-brand-primary font-mono">Active: {d.azm} min</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="steps" fill="#06B6D4" radius={[3, 3, 0, 0]} opacity={0.75} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
