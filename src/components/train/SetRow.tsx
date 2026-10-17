import React from 'react';
import { SetType, WorkoutSet } from '../../engine/types';
import { Check, Plus, Minus } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface SetRowProps {
  set: WorkoutSet;
  prevGhost?: string;
  isDumbbell?: boolean;
  onUpdate: (updated: Partial<WorkoutSet>) => void;
  onComplete: () => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  set,
  prevGhost,
  isDumbbell = false,
  onUpdate,
  onComplete,
}) => {
  const currentWeight = set.actualWeightKg ?? set.targetWeightKg;
  const currentReps = set.actualReps ?? set.targetReps;
  const currentRir = set.actualRir ?? set.targetRir ?? 2;
  const currentSetType: SetType = set.setType || (set.isWarmup ? 'warmup' : 'working');

  const weightStep = isDumbbell ? 2.0 : 2.5;

  const handleToggleComplete = () => {
    const nextCompleted = !set.completed;
    if (nextCompleted) {
      triggerHaptic('success');
    } else {
      triggerHaptic('light');
    }

    onUpdate({
      actualWeightKg: currentWeight,
      actualReps: currentReps,
      actualRir: currentRir,
      completed: nextCompleted,
      completedAt: nextCompleted ? new Date().toISOString() : undefined,
    });

    if (nextCompleted) {
      onComplete();
    }
  };

  // 1-Tap Set Type Cycler: Working (#) -> Warmup (W) -> Drop (D) -> Extra (M)
  const handleCycleSetType = () => {
    triggerHaptic('light');
    const order: SetType[] = ['working', 'warmup', 'drop', 'myo'];
    const nextType = order[(order.indexOf(currentSetType) + 1) % order.length];
    onUpdate({
      setType: nextType,
      isWarmup: nextType === 'warmup',
    });
  };

  const handleStepWeight = (delta: number) => {
    triggerHaptic('light');
    const nextW = Math.max(0, Math.round((currentWeight + delta) * 10) / 10);
    onUpdate({ actualWeightKg: nextW });
  };

  const handleStepReps = (delta: number) => {
    triggerHaptic('light');
    const nextR = Math.max(1, currentReps + delta);
    onUpdate({ actualReps: nextR });
  };

  // 1-Tap Effort (Reps Left) cycler: 2 -> 1 -> 0 -> 3 -> 2
  const handleCycleRir = () => {
    triggerHaptic('light');
    const rirCycle = [2, 1, 0, 3];
    const currentIndex = rirCycle.indexOf(currentRir);
    const nextRir = rirCycle[(currentIndex + 1) % rirCycle.length];
    onUpdate({ actualRir: nextRir });
  };

  // Tap previous session reference to copy weight & reps into current set
  const handleCopyPrevious = () => {
    if (!prevGhost || prevGhost === '—') return;
    const cleaned = prevGhost.replace(/^≈/, '');
    const match = cleaned.match(/^([\d.]+)×(\d+)/);
    if (match) {
      triggerHaptic('light');
      const parsedW = parseFloat(match[1]);
      const parsedR = parseInt(match[2], 10);
      if (!isNaN(parsedW) && !isNaN(parsedR)) {
        onUpdate({ actualWeightKg: parsedW, actualReps: parsedR });
      }
    }
  };

  const renderSetBadge = () => {
    if (currentSetType === 'warmup') {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-bold text-xs">
          W
        </span>
      );
    }
    if (currentSetType === 'drop') {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.1] text-white border border-white/[0.2] font-mono font-bold text-xs">
          D
        </span>
      );
    }
    if (currentSetType === 'myo') {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-mono font-bold text-xs">
          +
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-mono font-bold text-xs">
        {set.setNumber}
      </span>
    );
  };

  const setTypeLabel =
    currentSetType === 'warmup'
      ? 'Warmup Set'
      : currentSetType === 'drop'
      ? 'Drop Set'
      : currentSetType === 'myo'
      ? 'Bonus Rest-Pause Set'
      : `Working Set ${set.setNumber}`;

  // Clean display for previous set (strip @2R suffix so it fits cleanly and reads naturally)
  const cleanPrevDisplay = prevGhost ? prevGhost.replace(/\s*@\d+R$/, '') : '—';

  return (
    <div
      className={`grid grid-cols-12 gap-1.5 items-center py-2 px-2.5 rounded-2xl transition-all duration-150 ${
        set.completed
          ? 'bg-brand-primary/[0.1] border border-brand-primary/30 text-white'
          : currentSetType === 'warmup'
          ? 'bg-white/[0.03] border border-white/[0.06]'
          : 'bg-surface-elevated border border-white/[0.08]'
      }`}
    >
      {/* 1. Set Number / Type Badge (col-span-1) */}
      <div className="col-span-1 flex justify-center">
        <button
          type="button"
          onClick={handleCycleSetType}
          aria-label={`${setTypeLabel}. Tap to change set type`}
          title="Tap to switch between Working (#), Warmup (W), or Drop Set (D)"
          className="transition-transform active:scale-90"
        >
          {renderSetBadge()}
        </button>
      </div>

      {/* 2. Previous Session Reference (col-span-2) */}
      <div className="col-span-2 text-center">
        <button
          type="button"
          onClick={handleCopyPrevious}
          disabled={!prevGhost || prevGhost === '—'}
          className="text-xs font-mono text-slate-300 hover:text-white truncate max-w-full px-0.5"
          title={prevGhost ? `Last time: ${prevGhost} (tap to copy)` : 'First time logging this exercise'}
        >
          {cleanPrevDisplay}
        </button>
      </div>

      {/* 3. Weight Input (KG) with Steppers (col-span-4) */}
      <div className="col-span-4 flex items-center bg-black/50 rounded-xl border border-white/[0.1] p-0.5">
        <button
          type="button"
          onClick={() => handleStepWeight(-weightStep)}
          aria-label={`Decrease weight by ${weightStep} kg`}
          className="w-6 h-7 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-transform"
        >
          <Minus className="w-3.5 h-3.5 stroke-[2]" />
        </button>

        <input
          type="number"
          step={weightStep}
          value={currentWeight}
          aria-label={`Set ${set.setNumber} weight in kilograms`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualWeightKg: parseFloat(e.target.value) || 0 })}
          className={`flex-1 min-w-0 bg-transparent text-center font-mono text-sm font-bold tabular-numbers ${
            set.completed ? 'text-brand-primary' : 'text-white'
          } focus:outline-none`}
        />

        <button
          type="button"
          onClick={() => handleStepWeight(weightStep)}
          aria-label={`Increase weight by ${weightStep} kg`}
          className="w-6 h-7 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-transform"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
        </button>
      </div>

      {/* 4. Reps Input with Steppers (col-span-3) */}
      <div className="col-span-3 flex items-center bg-black/50 rounded-xl border border-white/[0.1] p-0.5">
        <button
          type="button"
          onClick={() => handleStepReps(-1)}
          aria-label="Decrease reps by 1"
          className="w-6 h-7 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-transform"
        >
          <Minus className="w-3.5 h-3.5 stroke-[2]" />
        </button>

        <input
          type="number"
          value={currentReps}
          aria-label={`Set ${set.setNumber} repetitions`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualReps: parseInt(e.target.value, 10) || 0 })}
          className={`flex-1 min-w-0 bg-transparent text-center font-mono text-sm font-bold tabular-numbers ${
            set.completed ? 'text-brand-primary' : 'text-white'
          } focus:outline-none`}
        />

        <button
          type="button"
          onClick={() => handleStepReps(1)}
          aria-label="Increase reps by 1"
          className="w-6 h-7 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-transform"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
        </button>
      </div>

      {/* 5. Effort / Reps Left Pill (col-span-1) */}
      <div className="col-span-1 flex justify-center">
        <button
          type="button"
          onClick={handleCycleRir}
          aria-label={`${currentRir} reps left before failure. Tap to change`}
          title={`${currentRir} reps left before failure (tap to change)`}
          className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center ${
            currentRir === 0
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.1]'
          }`}
        >
          {currentRir}
        </button>
      </div>

      {/* 6. Complete Set Checkmark (col-span-1) */}
      <div className="col-span-1 flex justify-center">
        <button
          type="button"
          onClick={handleToggleComplete}
          aria-label={set.completed ? `Mark set ${set.setNumber} incomplete` : `Complete set ${set.setNumber}`}
          aria-pressed={set.completed}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 ${
            set.completed
              ? 'bg-brand-primary text-black shadow-sm'
              : 'bg-black/60 hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/[0.14]'
          }`}
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};
