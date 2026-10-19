import React from 'react';
import {
  ExerciseDefinition,
  ExerciseSession,
  ProgressionPrescription,
  ReadinessState,
  SubTierQuest,
  WorkoutSet,
} from '../../engine/types';
import { formatImplementWeightLabel } from '../../engine/e1rm';
import { SetRow } from './SetRow';
import {
  Plus,
  Minus,
  ArrowRightLeft,
  Disc,
  TrendingUp,
  CheckCircle2,
  Check,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface ExerciseCardProps {
  exerciseIndex?: number;
  totalExercises?: number;
  exercise: ExerciseSession;
  prescription: ProgressionPrescription;
  quest: SubTierQuest;
  readinessState: ReadinessState;
  onUpdateSet: (setId: string, updated: Partial<WorkoutSet>) => void;
  onCompleteSet: (setId: string) => void;
  onAddSet: (isWarmup?: boolean) => void;
  onDeleteSet: (setId: string) => void;
  onOpenSwap?: () => void;
  onOpenPlateCalc?: (weightKg: number) => void;
}

const PILLAR_FRIENDLY_LABELS: Record<string, string> = {
  'Horizontal Push': 'Chest',
  'Vertical Push': 'Shoulders',
  'Horizontal Pull': 'Back',
  'Vertical Pull': 'Lats & Upper Back',
  Squat: 'Quads & Glutes',
  Hinge: 'Hamstrings & Lower Back',
};

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exerciseIndex,
  totalExercises,
  exercise,
  prescription,
  quest,
  readinessState,
  onUpdateSet,
  onCompleteSet,
  onAddSet,
  onDeleteSet,
  onOpenSwap,
  onOpenPlateCalc,
}) => {
  const handleAddSetWithHaptic = (isWarmup = false) => {
    triggerHaptic('light');
    onAddSet(isWarmup);
  };

  const handleRemoveLastSet = () => {
    if (exercise.sets.length <= 1) return;
    triggerHaptic('light');
    const lastSet = exercise.sets[exercise.sets.length - 1];
    if (lastSet) {
      onDeleteSet(lastSet.id);
    }
  };

  const currentWeight =
    exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.targetWeightKg ??
    exercise.sets[0]?.targetWeightKg ??
    20;

  const formattedTargetWeight = formatImplementWeightLabel(
    prescription.nextWeightKg,
    exercise.equipment,
    exercise.isWeightedCalisthenic
  );

  const firstTargetReps = prescription.nextTargetReps?.[0] ?? exercise.minReps;
  const isAtMaxReps = firstTargetReps >= exercise.maxReps;
  const targetRepsDisplay =
    prescription.repsChanged && isAtMaxReps
      ? `${firstTargetReps}+ reps`
      : `${firstTargetReps} reps`;

  const friendlyMuscle = PILLAR_FRIENDLY_LABELS[exercise.pillar] || exercise.pillar;
  const completedCount = exercise.sets.filter((s) => s.completed).length;
  const allSetsDone = completedCount === exercise.sets.length && exercise.sets.length > 0;
  const warmupCount = exercise.sets.filter((s) => s.isWarmup || s.setType === 'warmup').length;

  // Only display a progression badge when there is an exceptional event (load increase, amber shield, or top of range)
  const progressBadge =
    readinessState === 'Amber Shield'
      ? 'Hold Steady'
      : prescription.weightChanged
      ? `+${exercise.equipment === 'dumbbell' ? '2.0' : '2.5'} kg Load`
      : isAtMaxReps
      ? 'Top of Range'
      : null;

  return (
    <section
      aria-label={exercise.name}
      className={`biometric-card p-5 sm:p-6 transition-all duration-300 space-y-4 ${
        allSetsDone ? 'bg-[#0E1513]' : 'bg-[#0E1219]'
      }`}
    >
      {/* 1. Card Header: Step Index, Target Muscle, Exercise Name, Status & Single Swap Action */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            {exerciseIndex !== undefined && totalExercises !== undefined && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-white/[0.08] text-white shrink-0">
                {exerciseIndex}/{totalExercises}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-300">
              {friendlyMuscle}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {onOpenPlateCalc && exercise.equipment === 'barbell' && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenPlateCalc(currentWeight);
                }}
                aria-label={`Open plate calculator for ${currentWeight} kg`}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition-all min-h-[44px]"
              >
                <Disc className="w-3.5 h-3.5 stroke-[2]" />
                <span>Plates</span>
              </button>
            )}

            {onOpenSwap && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenSwap();
                }}
                aria-label={`Change exercise from ${exercise.name}`}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition-all min-h-[44px]"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 stroke-[2]" />
                <span>Change Exercise</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <h3 className="font-extrabold text-base text-white tracking-tight">
            {exercise.name}
          </h3>
          <span className="text-xs font-mono text-slate-400 shrink-0">
            {allSetsDone ? (
              <span className="text-xs font-bold text-brand-primary flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4 stroke-[2]" />
                <span>Done</span>
              </span>
            ) : (
              `${completedCount}/${exercise.sets.length} sets`
            )}
          </span>
        </div>
      </div>

      {/* 2. Streamlined Target Progression Micro-Cue */}
      <div
        className={`px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 transition-colors ${
          readinessState === 'Amber Shield'
            ? 'bg-amber-500/10 text-amber-300'
            : 'bg-white/[0.04] text-slate-300'
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <TrendingUp
            className={`w-3.5 h-3.5 shrink-0 stroke-[2] ${
              readinessState === 'Amber Shield' ? 'text-amber-400' : 'text-brand-primary'
            }`}
          />
          <span className="text-xs font-semibold text-slate-300 truncate">
            Target:{' '}
            <strong className="text-white font-mono font-bold">
              {formattedTargetWeight} × {targetRepsDisplay}
            </strong>
          </span>
        </div>

        {progressBadge && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
              readinessState === 'Amber Shield'
                ? 'bg-amber-500/20 text-amber-300'
                : prescription.weightChanged
                ? 'bg-brand-primary/20 text-brand-primary'
                : 'bg-white/[0.08] text-slate-300'
            }`}
          >
            {progressBadge}
          </span>
        )}
      </div>

      {/* 3. Aligned 12-Column Set Logging Table */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-12 gap-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400 text-center items-center">
          <div className="col-span-1">Set</div>
          <div className="col-span-2">Prev</div>
          <div className="col-span-4">Weight (kg)</div>
          <div className="col-span-3">Reps</div>
          <div className="col-span-1 flex justify-center" title="Reps in reserve (RIR)">
            RIR
          </div>
          <div className="col-span-1 flex justify-center" title="Complete set">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
        </div>

        {(() => {
          let warmupIndex = 0;
          let workingIndex = 0;
          return exercise.sets.map((s) => {
            const isWarm = s.isWarmup || s.setType === 'warmup';
            let displayBadge: string;
            let displayLabel: string;
            if (isWarm) {
              warmupIndex++;
              displayBadge = warmupCount > 1 ? `W${warmupIndex}` : 'W';
              displayLabel = `Warmup Set ${warmupIndex}`;
            } else if (s.setType === 'drop') {
              displayBadge = 'D';
              displayLabel = 'Drop Set';
            } else if (s.setType === 'myo') {
              displayBadge = '+';
              displayLabel = 'Bonus Rest-Pause Set';
            } else {
              workingIndex++;
              displayBadge = `${workingIndex}`;
              displayLabel = `Working Set ${workingIndex}`;
            }

            const ghostIdx = isWarm ? undefined : workingIndex - 1;
            const ghost =
              ghostIdx !== undefined
                ? (prescription.previousSetsSummary?.[ghostIdx] ??
                   prescription.previousSetsSummary?.[prescription.previousSetsSummary.length - 1])
                : undefined;

            return (
              <SetRow
                key={s.id}
                set={s}
                displayBadge={displayBadge}
                displayLabel={displayLabel}
                prevGhost={ghost}
                isDumbbell={exercise.equipment === 'dumbbell'}
                onUpdate={(updated) => onUpdateSet(s.id, updated)}
                onComplete={() => onCompleteSet(s.id)}
              />
            );
          });
        })()}
      </div>

      {/* 4. Progressive Set Management (Discreet Secondary Action) */}
      <div className="flex items-center justify-between pt-1 px-1 text-xs">
        <button
          type="button"
          onClick={() => handleAddSetWithHaptic(false)}
          className="text-slate-500 hover:text-slate-300 flex items-center space-x-1.5 py-1.5 px-2 rounded-lg transition-colors min-h-[36px]"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>Add set</span>
        </button>

        {exercise.sets.length > 1 && (
          <button
            type="button"
            onClick={handleRemoveLastSet}
            aria-label={`Remove set ${exercise.sets.length} from ${exercise.name}`}
            className="text-slate-600 hover:text-rose-400 flex items-center space-x-1 py-1.5 px-2 rounded-lg transition-colors min-h-[36px]"
          >
            <Minus className="w-3.5 h-3.5 stroke-[2]" />
            <span>Remove set</span>
          </button>
        )}
      </div>
    </section>
  );
};
