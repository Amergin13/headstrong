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
      title: 'Week 1: Smooth start',
      shortEffort: '2–3 left',
      volume: 'Base sets',
      desc: 'Start the 6-week plan with a comfortable number of sets and 2–3 reps left in the tank to build momentum.',
    },
    {
      week: 2,
      title: 'Week 2: Building up',
      shortEffort: '2 left',
      volume: 'Adding sets',
      desc: 'Add a set to key exercises and aim to beat last week’s reps or add 2.5 kg with clean form.',
    },
    {
      week: 3,
      title: 'Week 3: Main growth zone',
      shortEffort: '1–2 left',
      volume: 'Target zone',
      desc: 'Your main muscle-building week. Push sets to 1–2 reps shy of failure while keeping your form strict.',
    },
    {
      week: 4,
      title: 'Week 4: High effort',
      shortEffort: '1 left',
      volume: 'High sets',
      desc: 'Higher weekly sets and harder effort. Focus on good sleep and nutrition to recover between workouts.',
    },
    {
      week: 5,
      title: 'Week 5: All-out week',
      shortEffort: '0–1 left',
      volume: 'Peak sets',
      desc: 'The hardest week of the plan before your recovery week. Push safely close to your limit on working sets.',
    },
    {
      week: 6,
      title: 'Week 6: Light recovery',
      shortEffort: 'Easy',
      volume: 'Light sets',
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
      <div className="flex items-start justify-between gap-3">
        <h2 className="wk-h1">
          {currentStage.title}
        </h2>
        <span className="wk-pill shrink-0">
          {currentStage.volume}
        </span>
      </div>

      <p className="wk-body mt-2">
        {currentStage.desc}
      </p>

      <div className="flex items-end justify-between gap-3 mt-5">
        <span className="wk-label">
          6-week training plan
        </span>
        <span className="wk-number shrink-0">
          {currentWeek}/{totalWeeks}
        </span>
      </div>

      <div className="wk-bar mt-3">
        <div style={{ width: `${Math.round((currentWeek / totalWeeks) * 100)}%` }} />
      </div>

      <div className="wk-segments grid-cols-6 mt-4">
        {mesocycleWeeks.map((m) => {
          const isSelected = currentWeek === m.week;
          const isScheduledTravel = scheduledWeekLocations?.[m.week] === 'travel';

          return (
            <button
              key={m.week}
              type="button"
              onClick={() => handleSelectWeek(m.week)}
              className={`wk-segment ${isSelected ? 'is-active' : ''}`}
            >
              <span>W{m.week}{isScheduledTravel ? '•' : ''}</span>
            </button>
          );
        })}
      </div>

      {scheduledWeekLocations?.[currentWeek] === 'travel' && (
        <div className="mt-3">
          <span className="wk-pill">
            Scheduled travel week (bodyweight hypertrophy)
          </span>
        </div>
      )}

      {currentWeek !== 6 && (
        <div
          className="flex items-center justify-between flex-wrap gap-2 mt-4 pt-3"
          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
        >
          <span className="wk-caption">
            Feeling sore or worn out?
          </span>
          <button
            type="button"
            onClick={handleDeloadClick}
            className="wk-btn-secondary"
          >
            Switch to light recovery week
          </button>
        </div>
      )}
    </div>
  );
};
