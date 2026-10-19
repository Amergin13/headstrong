import React, { useState } from 'react';
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
  Target,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
  Disc,
  TrendingUp,
  CheckCircle2,
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

const EQUIPMENT_SHORT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  weighted_bodyweight: 'Weighted Bodyweight',
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
  const [showQuestInfo, setShowQuestInfo] = useState(false);

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
  const lastSessionTopSet = prescription.previousSetsSummary?.[0]?.replace(/\s*@\d+R$/, '');

  const friendlyMuscle = PILLAR_FRIENDLY_LABELS[exercise.pillar] || exercise.pillar;
  const equipLabel = EQUIPMENT_SHORT_LABELS[exercise.equipment] || exercise.equipment;
  const completedCount = exercise.sets.filter((s) => s.completed).length;
  const allSetsDone = completedCount === exercise.sets.length && exercise.sets.length > 0;

  const isPureBw =
    prescription.isPureBodyweight ||
    (exercise.equipment === 'bodyweight' && !exercise.isWeightedCalisthenic);

  // Determine the clear progression badge text
  const progressBadge =
    readinessState === 'Amber Shield'
      ? 'Hold Steady Today'
      : isPureBw
      ? prescription.repsChanged
        ? '+1–2 Rep Goal (Bodyweight)'
        : `Target: ${firstTargetReps} Reps (Bodyweight)`
      : prescription.weightChanged
      ? `+${exercise.equipment === 'dumbbell' ? '2.0' : '2.5'} kg Weight Increase`
      : prescription.repsChanged
      ? '+1 Rep Goal Today'
      : `Target: ${exercise.minReps}–${exercise.maxReps} Reps`;

  return (
    <section
      aria-label={exercise.name}
      className={`biometric-card p-4.5 border transition-all duration-300 space-y-3.5 ${
        allSetsDone
          ? 'border-brand-recovery/40 shadow-[0_8px_30px_rgba(0,245,155,0.08)]'
          : 'border-white/[0.08]'
      }`}
    >
      {/* 1. Card Header: Step Number, Muscle & Equipment Metadata, Exercise Name & Single Swap Action */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            {exerciseIndex !== undefined && totalExercises !== undefined && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-white/[0.08] text-white shrink-0 border border-white/10">
                {exerciseIndex}/{totalExercises}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-300 truncate">
              {friendlyMuscle} • {equipLabel} • {completedCount}/{exercise.sets.length} sets
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
                className="px-2.5 py-1.5 rounded-xl biometric-pill hover:bg-white/[0.12] text-slate-300 hover:text-white text-xs font-semibold flex items-center space-x-1 transition-all"
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
                className="px-2.5 py-1.5 rounded-xl biometric-pill hover:bg-white/[0.12] text-slate-200 hover:text-white text-xs font-semibold flex items-center space-x-1 transition-all"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 stroke-[2]" />
                <span>Change Exercise</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-base text-white tracking-tight">
            {exercise.name}
          </h3>
          {allSetsDone && (
            <span className="text-xs font-bold text-brand-recovery flex items-center space-x-1 glow-recovery">
              <CheckCircle2 className="w-4 h-4 stroke-[2]" />
              <span>Done</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. "What Do I Need To Do To Make Progress?" Callout Box */}
      <div
        className={`p-3 rounded-2xl border space-y-1.5 transition-colors ${
          readinessState === 'Amber Shield'
            ? 'bg-amber-500/10 border-amber-500/25'
            : 'bg-brand-recovery/[0.08] border-brand-recovery/25'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="flex items-center space-x-1.5">
            <TrendingUp
              className={`w-4 h-4 shrink-0 stroke-[2] ${
                readinessState === 'Amber Shield' ? 'text-amber-400' : 'text-brand-recovery'
              }`}
            />
            <span className="text-xs font-bold text-white">
              Target:{' '}
              <span className="font-mono text-sm">
                {formattedTargetWeight} × {firstTargetReps} reps
              </span>
            </span>
          </div>

          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              readinessState === 'Amber Shield'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-brand-recovery/20 text-brand-recovery border-brand-recovery/40'
            }`}
          >
            {progressBadge}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>{prescription.reason}</span>
          {lastSessionTopSet && (
            <span className="font-mono text-slate-400 shrink-0 ml-2">
              Last: {lastSessionTopSet}
            </span>
          )}
        </div>
      </div>

      {/* 3. Aligned 12-Column Set Logging Table */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-12 gap-1.5 px-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">
          <div className="col-span-1">Set</div>
          <div className="col-span-2">Last</div>
          <div className="col-span-4">Weight (kg)</div>
          <div className="col-span-3">Reps</div>
          <div className="col-span-1" title="Reps left before failure">
            Left
          </div>
          <div className="col-span-1">Done</div>
        </div>

        {exercise.sets.map((s, idx) => {
          const ghost =
            prescription.previousSetsSummary?.[idx] ??
            prescription.previousSetsSummary?.[prescription.previousSetsSummary.length - 1];

          return (
            <SetRow
              key={s.id}
              set={s}
              prevGhost={ghost}
              isDumbbell={exercise.equipment === 'dumbbell'}
              onUpdate={(updated) => onUpdateSet(s.id, updated)}
              onComplete={() => onCompleteSet(s.id)}
            />
          );
        })}
      </div>

      {/* 4. Secondary Milestone & Form Tip (De-emphasized Accordion) */}
      <div className="px-3.5 py-2.5 rounded-2xl bg-[#08090C]/80 border border-white/[0.06]">
        <button
          type="button"
          onClick={() => setShowQuestInfo(!showQuestInfo)}
          aria-expanded={showQuestInfo}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <Target className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[2]" />
            <span className="text-xs text-slate-300 truncate">
              Next milestone: <strong className="text-white font-medium">{quest.displayText}</strong>
            </span>
          </div>

          {showQuestInfo ? (
            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 ml-2 stroke-[2]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2 stroke-[2]" />
          )}
        </button>

        {showQuestInfo && (
          <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1 text-xs text-slate-400">
            {exercise.notes && (
              <p className="text-slate-300">
                <strong className="text-white">Form tip:</strong> {exercise.notes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 5. Balanced Set Management Footer */}
      <div className="grid grid-cols-3 gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => handleAddSetWithHaptic(true)}
          className="py-2.5 rounded-xl biometric-pill hover:bg-white/[0.1] text-xs font-bold text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>Warmup</span>
        </button>

        <button
          type="button"
          onClick={() => handleAddSetWithHaptic(false)}
          className="py-2.5 rounded-xl biometric-pill hover:bg-white/[0.1] text-xs font-bold text-slate-200 hover:text-white flex items-center justify-center space-x-1.5 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>Add Set</span>
        </button>

        <button
          type="button"
          onClick={handleRemoveLastSet}
          disabled={exercise.sets.length <= 1}
          className="py-2.5 rounded-xl biometric-pill hover:bg-rose-500/10 text-xs font-bold text-slate-400 hover:text-rose-300 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center space-x-1.5 transition-all active:scale-95"
        >
          <Minus className="w-3.5 h-3.5 stroke-[2]" />
          <span>Remove</span>
        </button>
      </div>
    </section>
  );
};
