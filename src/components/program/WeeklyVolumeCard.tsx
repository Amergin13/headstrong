import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ExerciseDefinition, GoalPhase, WorkoutSession } from '../../engine/types';
import { buildProgramWeeklyMuscleVolumes, ExerciseWeeklyMuscleVolume } from '../../services/exerciseDetails';
import { GOAL_DISPLAY_NAME } from '../../utils/goalNames';
import { triggerHaptic } from '../../utils/haptics';

interface WeeklyVolumeCardProps {
  workouts: WorkoutSession[];
  exerciseCatalog: ExerciseDefinition[];
  goalPhase?: GoalPhase;
  className?: string;
}

const DEFAULT_EMPTY_KEYS = new Set(['Chest', 'Back', 'Quads', 'Hamstrings']);

export const WeeklyVolumeCard: React.FC<WeeklyVolumeCardProps> = ({
  workouts,
  exerciseCatalog,
  goalPhase = 'Lean Bulk',
  className = '',
}) => {
  const [cardOpen, setCardOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const allMuscles = useMemo(
    () => buildProgramWeeklyMuscleVolumes({ workouts, exerciseCatalog, goalPhase }),
    [workouts, exerciseCatalog, goalPhase]
  );

  const trainedMuscles = useMemo(
    () => allMuscles.filter((m) => m.total > 0).sort((a, b) => b.total - a.total),
    [allMuscles]
  );

  const visibleMuscles: ExerciseWeeklyMuscleVolume[] = useMemo(() => {
    if (showAll) return allMuscles;
    if (trainedMuscles.length > 0) return trainedMuscles.slice(0, 6);
    return allMuscles.filter((m) => DEFAULT_EMPTY_KEYS.has(m.muscleKey));
  }, [showAll, allMuscles, trainedMuscles]);

  const hiddenCount = allMuscles.length - visibleMuscles.length;
  const goalName = GOAL_DISPLAY_NAME[goalPhase] ?? 'Build Muscle';
  const summarySubtitle =
    trainedMuscles.length > 0
      ? `${goalName} · ${trainedMuscles.length}/${allMuscles.length} muscles active this week`
      : `${goalName} · 7-day rolling hard sets`;

  return (
    <section
      aria-labelledby="program-weekly-volume-title"
      className={`wk-card flex flex-col gap-3 ${className}`.trim()}
    >
      <button
        type="button"
        aria-expanded={cardOpen}
        onClick={() => {
          triggerHaptic('light');
          setCardOpen((prev) => !prev);
        }}
        className="w-full text-left flex items-center justify-between gap-3 min-h-[44px]"
      >
        <div className="min-w-0">
          <h2 id="program-weekly-volume-title" className="wk-h1">
            Muscle volume this week
          </h2>
          <p className="wk-caption mt-1">
            {summarySubtitle}
          </p>
        </div>
        {cardOpen ? (
          <ChevronUp className="w-5 h-5 shrink-0" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
        ) : (
          <ChevronDown className="w-5 h-5 shrink-0" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
        )}
      </button>

      {cardOpen && (
        <>
          <p className="wk-caption">
            7-day rolling hard sets (direct + fractional)
          </p>
          <ul className="flex flex-col gap-2">
            {visibleMuscles.map((item) => {
              const isExpanded = expandedKey === item.muscleKey;
              const pct = Math.min(100, Math.round((item.total / Math.max(1, item.targetMax)) * 100));
              const inTarget = item.total >= item.targetMin && item.total <= item.targetMax;
              return (
                <li key={item.muscleKey}>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={`${item.muscleName} this week: ${item.total} of ${item.targetMin} to ${item.targetMax} hard sets. Tap for direct and fractional breakdown.`}
                    onClick={() => {
                      triggerHaptic('light');
                      setExpandedKey((prev) => (prev === item.muscleKey ? null : item.muscleKey));
                    }}
                    className="w-full text-left rounded-xl px-3 py-2 border min-h-[44px] flex flex-col justify-center gap-2 transition-colors"
                    style={{
                      background: 'var(--wk-raised)',
                      borderColor: inTarget
                        ? 'rgb(var(--color-accent-primary-rgb) / 0.35)'
                        : 'var(--color-border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="wk-subhead" style={{ color: 'var(--color-text-primary)' }}>
                        {item.muscleName}
                      </span>
                      <span
                        className="wk-caption font-medium tabular-nums"
                        style={{
                          color: inTarget ? 'var(--color-status-positive)' : 'var(--color-text-primary)',
                        }}
                      >
                        {item.total} of {item.targetMin}–{item.targetMax} hard sets
                      </span>
                    </div>
                    <div className="wk-bar" aria-hidden="true">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    {isExpanded && (
                      <div
                        className="flex flex-col gap-1 pt-2 border-t"
                        style={{ borderColor: 'var(--color-border-subtle)' }}
                      >
                        <span className="wk-caption tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                          {item.direct} direct (1.0×) + {item.fractional} fractional (0.5×)
                        </span>
                        <span className="wk-caption" style={{ color: 'var(--wk-muted)' }}>
                          {item.goalLabel} ({item.targetMin}–{item.targetMax} sets/wk)
                          {item.frequencyCue ? ` · ${item.frequencyCue}` : ''}
                        </span>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {(hiddenCount > 0 || showAll) && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowAll((prev) => !prev);
              }}
              className="wk-btn-secondary w-full min-h-[44px] inline-flex items-center justify-center gap-2"
            >
              {showAll ? (
                <>
                  <span>Show fewer muscles</span>
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  <span>Show all {allMuscles.length} muscles</span>
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </button>
          )}
        </>
      )}
    </section>
  );
};
