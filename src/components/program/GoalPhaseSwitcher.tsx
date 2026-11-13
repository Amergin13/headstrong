import React from 'react';
import { GoalPhase } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

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
    <section aria-label="Training Goal" className="wk-card w-full text-left block">
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          Training Goal
        </h2>
        <span className="wk-pill">{activePhase.label}</span>
      </div>
      <p
        style={{
          fontSize: `max(12px, ${fig(28)})`,
          lineHeight: 1.21,
          color: 'var(--wk-muted)',
          marginTop: fig(20),
        }}
      >
        {activePhase.subtitle}
      </p>

      {/* Segmented Control */}
      <div
        role="group"
        aria-label="Select training goal"
        className="grid grid-cols-3"
        style={{
          marginTop: fig(40),
          padding: fig(8),
          gap: fig(8),
          borderRadius: fig(24),
          background: 'var(--wk-raised)',
        }}
      >
        {phases.map((p) => {
          const isSelected = currentPhase === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleSelect(p.id)}
              className="flex items-center justify-center font-bold uppercase transition-colors"
              style={{
                minHeight: 44,
                height: fig(84),
                borderRadius: fig(18),
                fontSize: `max(12px, ${fig(22)})`,
                background: isSelected ? 'var(--wk-pill)' : 'transparent',
                color: isSelected ? 'var(--color-text-primary)' : 'var(--wk-muted)',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <p className="wk-body" style={{ marginTop: fig(32) }}>
        {activePhase.desc}
      </p>
    </section>
  );
};
