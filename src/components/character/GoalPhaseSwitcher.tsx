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
      subtitle: 'Progressive volume wave',
      desc: 'Caloric surplus fuels a progressive volume wave from base volume up to peak growth across the 6-week block.',
    },
    {
      id: 'Cut / Recomp',
      label: 'Lose Fat',
      subtitle: 'Retention Shield active • 85% volume',
      desc: 'Caloric deficit activates Retention Shield. Volume is scaled to ~85% to match reduced recovery, while heavy mechanical tension signals your body to retain 100% of your muscle while burning fat.',
    },
    {
      id: 'Maingain',
      label: 'Stay Lean',
      subtitle: 'Density & work capacity focus',
      desc: 'Caloric balance. Optimizes muscle density, stamina (Work Capacity Index), and post-set heart rate recovery without adding fat.',
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
          fontSize: fig(28),
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
                fontSize: fig(22),
                background: isSelected ? 'var(--wk-pill)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--wk-muted)',
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
