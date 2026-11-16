import React from 'react';
import { GoalPhase } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';

interface GoalPhaseSwitcherProps {
  currentPhase: GoalPhase;
  onSelectPhase: (phase: GoalPhase) => void;
}

export const GoalPhaseSwitcher: React.FC<GoalPhaseSwitcherProps> = ({
  currentPhase,
  onSelectPhase,
}) => {
  const phases: { id: GoalPhase; label: string; subtitle: string; desc: string }[] = [
    {
      id: 'Lean Bulk',
      label: 'Build Muscle',
      subtitle: 'Sets build across the 6 weeks',
      desc: 'Your sets build from 2 to 3 per exercise, with an extra set on smaller muscles in the last two weeks. Eating a little more than you burn helps you grow.',
    },
    {
      id: 'Cut / Recomp',
      label: 'Lose Fat',
      subtitle: 'Heavy lifts, no extra sets',
      desc: 'The big lifts stay heavy (5–8 reps) and the number of sets stays steady, so you keep your strength and muscle while eating a little less.',
    },
    {
      id: 'Maingain',
      label: 'Stay Lean',
      subtitle: 'Steady sets, a little in reserve',
      desc: 'A steady 3 sets per exercise, stopping about 2 reps short, so you get stronger at the weight you are without wearing yourself down.',
    },
  ];

  const activePhase = phases.find((p) => p.id === currentPhase) ?? phases[0];

  const handleSelect = (phase: GoalPhase) => {
    triggerHaptic('light');
    onSelectPhase(phase);
  };

  return (
    <section aria-label="Training goal" className="wk-card w-full text-left block">
      <div className="flex items-start justify-between gap-3">
        <h2 className="wk-h1 leading-tight">
          Training goal
        </h2>
        <span className="wk-pill shrink-0">{activePhase.label}</span>
      </div>
      <p className="wk-body mt-2 leading-tight">
        {activePhase.subtitle}
      </p>

      {/* Segmented Control */}
      <div
        role="group"
        aria-label="Select training goal"
        className="wk-segments grid-cols-3 mt-5"
      >
        {phases.map((p) => {
          const isSelected = currentPhase === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleSelect(p.id)}
              className={`wk-segment ${isSelected ? 'is-active' : ''}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <p className="wk-body mt-4 max-w-prose">
        {activePhase.desc}
      </p>
    </section>
  );
};
