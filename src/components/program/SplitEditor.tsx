import React, { useState, useEffect } from 'react';
import { ExerciseDefinition, ProgramSplitType } from '../../engine/types';
import { getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import { SplitDayType, getSplitDaysForProgram } from '../../services/workoutGenerator';
import { Plus, Play } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface SplitEditorProps {
  exerciseCatalog: ExerciseDefinition[];
  activeSplitDay?: string;
  programType?: ProgramSplitType;
  onOpenCreateExercise: () => void;
  onLaunchSplitDay?: (split: SplitDayType) => void;
}

export const SplitEditor: React.FC<SplitEditorProps> = ({
  exerciseCatalog,
  activeSplitDay = 'Push',
  programType = 'ppl_upper',
  onOpenCreateExercise,
  onLaunchSplitDay,
}) => {
  const days = getSplitDaysForProgram(programType);
  const [activeDay, setActiveDay] = useState<SplitDayType>(
    days.some((d) => d.id === activeSplitDay) ? (activeSplitDay as SplitDayType) : days[0].id
  );

  useEffect(() => {
    if (!days.some((d) => d.id === activeDay)) {
      setActiveDay(days[0].id);
    }
  }, [programType]);

  const filteredExercises = exerciseCatalog.filter((ex) => {
    if (activeDay === 'Push') {
      return (
        ex.pillar === 'Horizontal Push' ||
        ex.pillar === 'Vertical Push' ||
        ex.primaryMuscle === 'Triceps' ||
        ex.primaryMuscle === 'Side Delts'
      );
    }
    if (activeDay === 'Pull') {
      return (
        ex.pillar === 'Horizontal Pull' ||
        ex.pillar === 'Vertical Pull' ||
        ex.primaryMuscle === 'Biceps' ||
        ex.primaryMuscle === 'Rear Delts'
      );
    }
    if (activeDay === 'Legs') {
      return (
        ex.pillar === 'Squat' ||
        ex.pillar === 'Hinge' ||
        ex.primaryMuscle === 'Calves' ||
        ex.primaryMuscle === 'Hamstrings' ||
        ex.primaryMuscle === 'Quads'
      );
    }
    return (
      ex.pillar === 'Horizontal Push' ||
      ex.pillar === 'Horizontal Pull' ||
      ex.pillar === 'Vertical Push' ||
      ex.primaryMuscle === 'Side Delts' ||
      ex.primaryMuscle === 'Rear Delts' ||
      ex.primaryMuscle === 'Triceps' ||
      ex.primaryMuscle === 'Biceps'
    );
  });

  return (
    <div className="rounded-3xl surface-glass border border-white/[0.08] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-white tracking-tight">
            Workout Splits &amp; Exercises
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Browse exercises by workout day or add your own
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCreateExercise}
          className="px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-xs font-semibold text-white border border-white/[0.1] flex items-center space-x-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>Add Exercise</span>
        </button>
      </div>

      {/* Segmented Control */}
      <div
        className={`grid gap-1 bg-black/50 p-1 rounded-xl border border-white/[0.06] ${
          days.length === 2 ? 'grid-cols-2' : days.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {days.map((d) => {
          const isSelected = activeDay === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveDay(d.id);
              }}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                isSelected
                  ? 'bg-brand-primary text-black shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {/* Start Selected Split Workout */}
      {onLaunchSplitDay && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onLaunchSplitDay(activeDay);
          }}
          className="w-full py-2.5 rounded-xl bg-brand-primary/15 hover:bg-brand-primary/25 border border-brand-primary/30 text-brand-primary font-bold text-xs flex items-center justify-center space-x-1.5 transition-all"
        >
          <Play className="w-3.5 h-3.5 fill-brand-primary stroke-[2]" />
          <span>Start {activeDay} Workout</span>
        </button>
      )}

      {/* Exercise Items */}
      <div className="space-y-1.5">
        {filteredExercises.map((ex) => {
          const meta = getExerciseBiomechanicalMeta(ex);
          const equipLabel =
            ex.equipment === 'barbell'
              ? 'Barbell'
              : ex.equipment === 'dumbbell'
              ? 'Dumbbell'
              : ex.equipment === 'cable'
              ? 'Cable'
              : ex.equipment === 'machine'
              ? 'Machine'
              : 'Bodyweight';

          return (
            <div
              key={ex.id}
              className="p-3 rounded-2xl bg-black/40 border border-white/[0.05] flex items-center justify-between text-xs"
            >
              <div>
                <div className="font-bold text-sm text-white">
                  {ex.name}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {ex.primaryMuscle} • {equipLabel} • {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} reps
                </div>
              </div>

              <span className="text-xs font-mono text-slate-300 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.06]">
                {meta.isIsolation ? '3–4 Sets' : '3 Sets'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
