import React from 'react';
import { Shield, Plane } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { TrainingLocation } from '../../engine/types';

interface MesocycleManagerProps {
  currentWeek: number;
  totalWeeks?: number;
  scheduledWeekLocations?: Record<number, TrainingLocation>;
  onSelectWeek: (week: number) => void;
  onTriggerDeload: () => void;
}

export const MesocycleManager: React.FC<MesocycleManagerProps> = ({
  currentWeek = 3,
  totalWeeks = 6,
  scheduledWeekLocations,
  onSelectWeek,
  onTriggerDeload,
}) => {
  const mesocycleWeeks = [
    {
      week: 1,
      title: 'Week 1: Smooth Start',
      shortEffort: '2–3 left',
      volume: 'Base Sets',
      desc: 'Start the 6-week plan with a comfortable number of sets and 2–3 reps left in the tank to build momentum.',
    },
    {
      week: 2,
      title: 'Week 2: Building Up',
      shortEffort: '2 left',
      volume: 'Adding Sets',
      desc: 'Add a set to key exercises and aim to beat last week’s reps or add 2.5 kg with clean form.',
    },
    {
      week: 3,
      title: 'Week 3: Main Growth Zone',
      shortEffort: '1–2 left',
      volume: 'Target Zone',
      desc: 'Your main muscle-building week. Push sets to 1–2 reps shy of failure while keeping your form strict.',
    },
    {
      week: 4,
      title: 'Week 4: High Effort',
      shortEffort: '1 left',
      volume: 'High Sets',
      desc: 'Higher weekly sets and harder effort. Focus on good sleep and nutrition to recover between workouts.',
    },
    {
      week: 5,
      title: 'Week 5: All-Out Week',
      shortEffort: '0–1 left',
      volume: 'Peak Sets',
      desc: 'The hardest week of the plan before your recovery week. Push safely close to your limit on working sets.',
    },
    {
      week: 6,
      title: 'Week 6: Light Recovery',
      shortEffort: 'Easy',
      volume: 'Light Sets',
      desc: 'Cut your sets in half and leave 3–4 easy reps in the tank so your muscles and joints come back stronger.',
    },
  ];

  const currentStage = mesocycleWeeks[currentWeek - 1] || mesocycleWeeks[2];

  const handleSelectWeek = (w: number) => {
    triggerHaptic('light');
    onSelectWeek(w);
  };

  const handleDeloadClick = () => {
    triggerHaptic('warning');
    onTriggerDeload();
  };

  return (
    <div className="biometric-card p-4.5 border border-white/[0.08] space-y-3.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-base text-white tracking-tight">
            6-Week Training Plan
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Automatically adjusts your sets and effort each week
          </p>
        </div>

        <span className="text-xs font-mono font-bold text-brand-recovery px-2.5 py-1 rounded-full bg-brand-recovery/10 border border-brand-recovery/30">
          Week {currentWeek} of {totalWeeks}
        </span>
      </div>

      {/* Week Timeline Pills */}
      <div className="grid grid-cols-6 gap-1.5 bg-[#08090C] p-1.5 rounded-2xl border border-white/[0.08]">
        {mesocycleWeeks.map((m) => {
          const isSelected = currentWeek === m.week;
          const isDeload = m.week === 6;
          const isScheduledTravel = scheduledWeekLocations?.[m.week] === 'travel';

          return (
            <button
              key={m.week}
              type="button"
              onClick={() => handleSelectWeek(m.week)}
              className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center transition-all ${
                isSelected
                  ? isDeload
                    ? 'bg-amber-400 text-black font-extrabold shadow-md glow-amber'
                    : 'bg-brand-recovery text-black font-extrabold shadow-md glow-recovery'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-xs font-extrabold">W{m.week}</span>
              {isScheduledTravel && (
                <Plane className={`w-3 h-3 mt-0.5 stroke-[2] ${isSelected ? 'text-black' : 'text-cyan-400'}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Current Stage Card */}
      <div className="p-3.5 rounded-2xl bg-[#0D1015] border border-white/[0.08] text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-white text-sm">
            {currentStage.title}
          </span>
          <span className="text-xs font-mono font-bold text-brand-recovery">
            {currentStage.volume}
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed font-medium">
          {currentStage.desc}
        </p>

        {scheduledWeekLocations?.[currentWeek] === 'travel' && (
          <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center gap-1.5 text-cyan-300 font-medium">
            <Plane className="w-3.5 h-3.5 text-cyan-400 stroke-[2]" />
            <span>Scheduled Travel Week (Calibrated Bodyweight Hypertrophy)</span>
          </div>
        )}
      </div>

      {/* Light Recovery Week Shortcut */}
      {currentWeek !== 6 && (
        <div className="pt-1 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Feeling sore or worn out?
          </span>
          <button
            type="button"
            onClick={handleDeloadClick}
            className="text-amber-400 hover:text-amber-300 font-bold text-xs flex items-center space-x-1"
          >
            <Shield className="w-3.5 h-3.5 stroke-[2]" />
            <span>Switch to Light Recovery Week</span>
          </button>
        </div>
      )}
    </div>
  );
};
