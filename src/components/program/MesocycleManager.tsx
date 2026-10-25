import React from 'react';
import { triggerHaptic } from '../../utils/haptics';
import { TrainingLocation } from '../../engine/types';

interface MesocycleManagerProps {
  currentWeek: number;
  totalWeeks?: number;
  scheduledWeekLocations?: Record<number, TrainingLocation>;
  onSelectWeek: (week: number) => void;
  onTriggerDeload: () => void;
}

const fig = (px: number) => `calc(${px} * var(--f))`;

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
    <div className="wk-card w-full text-left block">
      <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          {currentStage.title}
        </h2>
        <span className="wk-pill shrink-0">
          {currentStage.volume}
        </span>
      </div>

      <p
        style={{
          fontSize: fig(28),
          lineHeight: 1.21,
          color: 'var(--wk-muted)',
          marginTop: fig(20),
        }}
      >
        {currentStage.desc}
      </p>

      <div
        className="flex items-end justify-between"
        style={{ marginTop: fig(60), gap: fig(20) }}
      >
        <span className="wk-label" style={{ lineHeight: 1.21 }}>
          6-WEEK TRAINING PLAN
        </span>
        <span
          className="font-bold text-white shrink-0"
          style={{ fontSize: fig(40), lineHeight: 1 }}
        >
          {currentWeek}/{totalWeeks}
        </span>
      </div>

      <div className="wk-bar" style={{ marginTop: fig(30) }}>
        <div style={{ width: `${Math.round((currentWeek / totalWeeks) * 100)}%` }} />
      </div>

      <div
        className="grid grid-cols-6 items-center"
        style={{
          marginTop: fig(30),
          height: fig(84),
          padding: fig(8),
          borderRadius: fig(22),
          background: 'var(--wk-raised)',
        }}
      >
        {mesocycleWeeks.map((m) => {
          const isSelected = currentWeek === m.week;
          const isScheduledTravel = scheduledWeekLocations?.[m.week] === 'travel';

          return (
            <button
              key={m.week}
              type="button"
              onClick={() => handleSelectWeek(m.week)}
              className="h-full flex flex-col items-center justify-center font-bold uppercase transition-colors"
              style={{
                borderRadius: fig(16),
                fontSize: fig(24),
                letterSpacing: '0.02em',
                background: isSelected ? 'var(--wk-pill)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--wk-muted)',
              }}
            >
              <span>W{m.week}{isScheduledTravel ? '•' : ''}</span>
            </button>
          );
        })}
      </div>

      {scheduledWeekLocations?.[currentWeek] === 'travel' && (
        <div style={{ marginTop: fig(24) }}>
          <span className="wk-pill">
            Scheduled Travel Week (Calibrated Bodyweight Hypertrophy)
          </span>
        </div>
      )}

      {currentWeek !== 6 && (
        <div
          className="flex items-center justify-between"
          style={{
            marginTop: fig(28),
            paddingTop: fig(24),
            borderTop: '1px solid rgba(255,255,255,0.08)',
            gap: fig(16),
          }}
        >
          <span className="wk-caption">
            Feeling sore or worn out?
          </span>
          <button
            type="button"
            onClick={handleDeloadClick}
            className="wk-pill"
          >
            Switch to Light Recovery Week
          </button>
        </div>
      )}
    </div>
  );
};
