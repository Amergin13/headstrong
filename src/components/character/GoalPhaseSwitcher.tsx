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
      desc: 'Focus on adding muscle and strength. Earn +25 bonus XP when you hit your weekly set targets.',
    },
    {
      id: 'Cut / Recomp',
      label: 'Lose Fat',
      desc: 'Keep your strength while losing weight. No XP penalty for holding weights steady as your bodyweight drops.',
    },
    {
      id: 'Maingain',
      label: 'Stay Lean',
      desc: 'Build strength and stamina at your current weight. Earn bonus XP for faster heart rate recovery between sets.',
    },
  ];

  const activePhase = phases.find((p) => p.id === currentPhase);

  const handleSelect = (phase: GoalPhase) => {
    triggerHaptic('light');
    onSelectPhase(phase);
  };

  return (
    <div className="rounded-3xl surface-glass p-4 border border-white/[0.08] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">
          Training Goal
        </h3>
        {currentPhase === 'Cut / Recomp' && (
          <span className="flex items-center space-x-1 text-xs font-semibold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-0.5 rounded-full">
            <Shield className="w-3.5 h-3.5 stroke-[2]" />
            <span>Streak &amp; XP Protected</span>
          </span>
        )}
      </div>

      {/* Segmented Control */}
      <div className="grid grid-cols-3 bg-black/40 p-1 rounded-2xl border border-white/[0.06]">
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
