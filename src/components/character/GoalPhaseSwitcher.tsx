import React from 'react';
import { GoalPhase } from '../../engine/types';
import { Shield } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface GoalPhaseSwitcherProps {
  currentPhase: GoalPhase;
  onSelectPhase: (phase: GoalPhase) => void;
}

export const GoalPhaseSwitcher: React.FC<GoalPhaseSwitcherProps> = ({
  currentPhase,
  onSelectPhase,
}) => {
  const phases: { id: GoalPhase; label: string; desc: string }[] = [
    {
      id: 'Lean Bulk',
      label: 'Build Muscle',
      desc: 'Caloric surplus fuels a progressive volume wave from base volume up to peak growth across the 6-week block.',
    },
    {
      id: 'Cut / Recomp',
      label: 'Lose Fat',
      desc: 'Caloric deficit activates Retention Shield. Volume is scaled to ~85% to match reduced recovery, while heavy mechanical tension signals your body to retain 100% of your muscle while burning fat.',
    },
    {
      id: 'Maingain',
      label: 'Stay Lean',
      desc: 'Caloric balance. Optimizes muscle density, stamina (Work Capacity Index), and post-set heart rate recovery without adding fat.',
    },
  ];

  const activePhase = phases.find((p) => p.id === currentPhase);

  const handleSelect = (phase: GoalPhase) => {
    triggerHaptic('light');
    onSelectPhase(phase);
  };

  return (
    <div className="rounded-3xl surface-glass p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">
          Training Goal
        </h3>
        {currentPhase === 'Cut / Recomp' && (
          <span className="flex items-center space-x-1 text-xs font-semibold text-brand-primary bg-brand-primary/15 px-3 py-1 rounded-full">
            <Shield className="w-3.5 h-3.5 stroke-[2]" />
            <span>Streak &amp; XP Protected</span>
          </span>
        )}
      </div>

      {/* Segmented Control */}
      <div className="grid grid-cols-3 bg-[#090C12] p-1.5 rounded-2xl">
        {phases.map((p) => {
          const isSelected = currentPhase === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p.id)}
              className={`py-2 rounded-xl text-xs font-bold transition-all duration-150 ${
                isSelected
                  ? 'bg-brand-primary text-black shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        {activePhase?.desc}
      </p>
    </div>
  );
};
