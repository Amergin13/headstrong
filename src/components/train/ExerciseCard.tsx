import React, { useState } from 'react';
import {
  ExerciseDefinition,
  ExerciseSession,
  ProgressionPrescription,
  ReadinessState,
  SubTierQuest,
  WorkoutSet,
} from '../../engine/types';
import { calculate5StepWarmupRamp } from '../../engine/muscleBuildingProgram';
import { SetRow, PreviousSet } from './SetRow';
import { TempoPacer } from './TempoPacer';
import { useUnits } from '../../utils/unitsContext';
import {
  Plus,
  Minus,
  ArrowRightLeft,
  Disc,
  TrendingUp,
  CheckCircle2,
  Check,
  Clock,
  Flame,
  ChevronDown,
  ChevronUp,
  Sparkles,
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
  /** Plain-English primary muscle, e.g. "Triceps". */
  muscleLabel?: string;
  /** Working sets from the last time this exact exercise was completed. */
  previousSets?: PreviousSet[];
}

const PILLAR_FRIENDLY_LABELS: Record<string, string> = {
  'Horizontal Push': 'Chest',
  'Vertical Push': 'Shoulders',
  'Horizontal Pull': 'Back',
  'Vertical Pull': 'Lats & Upper Back',
  Squat: 'Quads & Glutes',
  Hinge: 'Hamstrings & Lower Back',
};

function formatTempoLabel(tempo?: string): { pill: string; explanation?: string } | null {
  if (!tempo) return null;
  if (/^\d{4}$/.test(tempo)) {
    const [ecc, pauseBottom, con, pauseTop] = tempo.split('');
    return {
      pill: `Tempo ${tempo}`,
      explanation: `${ecc}s lower • ${pauseBottom}s pause • ${con}s lift • ${pauseTop}s top`,
    };
  }
  if (tempo.includes('sec')) {
    return { pill: `Hold ${tempo}`, explanation: 'Isometric hold duration' };
  }
  if (tempo.includes('min')) {
    return { pill: `Cardio ${tempo}`, explanation: 'High-intensity interval duration' };
  }
  return { pill: tempo };
}

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
  muscleLabel,
  previousSets = [],
}) => {
  const units = useUnits();
  const [showWarmupRamp, setShowWarmupRamp] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

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

  // The target shown is what this session actually prescribes (the first working set),
  // so it always matches the pre-filled set rows.
  const firstWorkingSet = exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup');
  // Moves done holding one dumbbell (crunches, goblet squats, two-hand overhead extensions).
  const isSingleDumbbell = /crunch|goblet|single|one-arm|overhead dumbbell tricep|overhead-db/i.test(
    `${exercise.name} ${exercise.exerciseId}`
  );
  const plannedWeightKg = firstWorkingSet?.targetWeightKg ?? 0;
  const isBodyweightOnly =
    exercise.equipment === 'bodyweight' && (!exercise.isWeightedCalisthenic || plannedWeightKg === 0);
  const formattedTargetWeight = isBodyweightOnly
    ? 'Bodyweight'
    : exercise.isWeightedCalisthenic || exercise.equipment === 'weighted_bodyweight'
    ? `BW + ${units.format(plannedWeightKg)}`
    : exercise.equipment === 'dumbbell' && !isSingleDumbbell
    ? `${units.format(plannedWeightKg / 2)} each`
    : units.format(plannedWeightKg);

  const firstTargetReps = firstWorkingSet?.targetReps ?? prescription.nextTargetReps?.[0] ?? exercise.minReps;
  const isAtMaxReps = firstTargetReps >= exercise.maxReps;
  const targetRepsDisplay =
    exercise.repTargetType === 'wave' && exercise.sets.length >= 2
      ? `${exercise.sets[0]?.targetReps}/${exercise.sets[1]?.targetReps} wave`
      : exercise.repTargetType === 'form_failure'
      ? 'F* (Form Failure)'
      : `${firstTargetReps} reps`;

  const friendlyMuscle = muscleLabel || PILLAR_FRIENDLY_LABELS[exercise.pillar] || exercise.pillar;
  const previousTopKg = previousSets.reduce((max, p) => Math.max(max, p.weightKg), 0);
  const loadIncreaseKg = previousTopKg > 0 && !isBodyweightOnly ? plannedWeightKg - previousTopKg : 0;
  const completedCount = exercise.sets.filter((s) => s.completed).length;
  const allSetsDone = completedCount === exercise.sets.length && exercise.sets.length > 0;
  const warmupCount = exercise.sets.filter((s) => s.isWarmup || s.setType === 'warmup').length;

  // Only display a progression badge when there is an exceptional event (load increase, amber shield, or top of range)
  const progressBadge =
    readinessState === 'Amber Shield'
      ? 'Hold Steady'
      : loadIncreaseKg > 0.1
      ? `+${units.format(loadIncreaseKg)}`
      : isAtMaxReps && exercise.maxReps > exercise.minReps
      ? 'Top of Range'
      : null;

  const tempoData = formatTempoLabel(exercise.tempo);
  const warmupSteps = exercise.useWarmupProtocol ? calculate5StepWarmupRamp(currentWeight) : [];

  return (
    <section
      aria-label={exercise.name}
      className={`biometric-card p-5 sm:p-6 transition-all duration-300 space-y-4 ${
        allSetsDone ? 'bg-[#0E1513]' : 'bg-[#0E1219]'
      }`}
    >
      {/* 1. Card Header: Step Index, Group Code (A1/A2), Target Muscle, Exercise Name, Status & Actions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0 flex-wrap gap-y-1">
            {exerciseIndex !== undefined && totalExercises !== undefined && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-white/[0.08] text-white shrink-0">
                {exerciseIndex}/{totalExercises}
              </span>
            )}
            {exercise.orderCode && (
              <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-lg bg-brand-primary/20 text-brand-primary border border-brand-primary/30 shrink-0">
                {exercise.orderCode}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-300 truncate">
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
                aria-label={`Open plate calculator for ${units.format(currentWeight)}`}
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

      {/* 2. Target Progression & Tempo Micro-Cue */}
      <div
        className={`px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 transition-colors flex-wrap sm:flex-nowrap ${
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

        <div className="flex items-center space-x-2">
          {tempoData && (
            <span
              className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-white/[0.08] text-slate-300 shrink-0"
              title={tempoData.explanation}
            >
              {tempoData.pill}
            </span>
          )}

          {progressBadge && (
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                readinessState === 'Amber Shield'
                  ? 'bg-amber-500/20 text-amber-300'
                  : loadIncreaseKg > 0.1
                  ? 'bg-brand-primary/20 text-brand-primary'
                  : 'bg-white/[0.08] text-slate-300'
              }`}
            >
              {progressBadge}
            </span>
          )}
        </div>
      </div>

      {/* 2.4 Optional haptic tempo guide */}
      {exercise.tempo && /^[\dXx]{4}$/.test(exercise.tempo) && <TempoPacer tempo={exercise.tempo} />}

      {/* 2.5 Intensity Protocol Finisher Callout (Rest-Pause, Triple Drop-Set, Iso-Hold Partials) */}
      {exercise.intensityProtocol && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-amber-500/10 border border-rose-500/25 space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-extrabold font-mono px-2 py-0.5 rounded-md bg-rose-500/25 text-rose-300">
              {exercise.intensityProtocol.symbol}
            </span>
            <span className="text-xs font-extrabold text-white">
              {exercise.intensityProtocol.name}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {exercise.intensityProtocol.instruction}
          </p>
        </div>
      )}

      {/* 2.6 First-Compound 5-Step Warmup Ramp Calculator */}
      {exercise.useWarmupProtocol && warmupSteps.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400 stroke-[2]" />
              <span className="text-xs font-bold text-amber-300">
                5-Step Warmup Ramp ({units.format(currentWeight)} work weight)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWarmupRamp(!showWarmupRamp);
              }}
              className="text-xs font-bold text-white px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] transition-colors min-h-[36px] flex items-center space-x-1"
            >
              <span>{showWarmupRamp ? 'Hide Ramp' : 'View Ramp'}</span>
              {showWarmupRamp ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {showWarmupRamp && (
            <div className="space-y-2 pt-1 border-t border-amber-500/15">
              <p className="text-xs text-slate-300">
                Do these 5 lighter sets before your first working set:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {warmupSteps.map((step) => (
                  <div
                    key={step.setNumber}
                    className="p-2 rounded-xl bg-black/40 border border-white/[0.06] text-center space-y-0.5"
                  >
                    <div className="font-mono font-bold text-white text-xs">
                      Set {step.setNumber}: {units.format(step.targetWeightKg)}
                    </div>
                    <div className="text-slate-400 font-mono text-xs">
                      {step.percentage}% • {step.reps} reps
                    </div>
                    <div className="text-amber-400 text-xs truncate">
                      {step.restLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2.7 Exercise Execution Cues / Notes */}
      {exercise.exerciseNotes && exercise.exerciseNotes.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowNotes(!showNotes);
            }}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 transition-colors py-1"
          >
            <span>Technique &amp; Execution Cues</span>
            {showNotes ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {showNotes && (
            <ul className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1 text-xs text-slate-300 list-disc list-inside">
              {exercise.exerciseNotes.map((note, nIdx) => (
                <li key={nIdx} className="leading-relaxed">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 3. Aligned 12-Column Set Logging Table */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-12 gap-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400 text-center items-center">
          <div className="col-span-1">Set</div>
          <div className="col-span-2">Prev</div>
          <div className="col-span-4">Weight ({units.unit})</div>
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

            // PREV is the matching set from the last time this exact exercise was completed.
            const previous = isWarm ? undefined : previousSets[workingIndex - 1];

            return (
              <SetRow
                key={s.id}
                set={s}
                displayBadge={displayBadge}
                displayLabel={displayLabel}
                previous={previous}
                isBodyweight={isBodyweightOnly}
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
