import React from 'react';
import { SetType, WorkoutSet } from '../../engine/types';
import { Check } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface SetRowProps {
  set: WorkoutSet;
  prevGhost?: string;
  isDumbbell?: boolean;
  displayBadge?: string;
  displayLabel?: string;
  onUpdate: (updated: Partial<WorkoutSet>) => void;
  onComplete: () => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  set,
  prevGhost,
  isDumbbell = false,
  displayBadge,
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
    const bwMatch = cleaned.match(/^BW×(\d+)/i);
    if (bwMatch) {
      triggerHaptic('light');
      const parsedR = parseInt(bwMatch[1], 10);
      if (!isNaN(parsedR)) {
        onUpdate({ actualWeightKg: 0, actualReps: parsedR });
      }
      return;
    }
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
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/15 text-amber-300 font-mono font-bold text-xs"
          title="Warmup Set"
        >
          {displayBadge || 'W'}
        </span>
      );
    }
    if (currentSetType === 'drop') {
      return (
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.1] text-white font-mono font-bold text-xs"
          title="Drop Set"
        >
          {displayBadge || 'D'}
        </span>
      );
    }
    if (currentSetType === 'myo') {
      return (
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-primary/20 text-brand-primary font-mono font-bold text-xs"
          title="Bonus Set"
        >
          {displayBadge || '+'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 font-mono font-bold text-xs">
        {displayBadge || set.setNumber}
      </span>
    );
  };

  // Clean display for previous set (strip @2R suffix and ≈ prefix so it fits cleanly and reads naturally)
  const cleanPrevDisplay = prevGhost
    ? prevGhost.replace(/^≈/, '').replace(/\s*@\d+R$/, '').trim()
    : '—';

  return (
    <div
      className={`grid grid-cols-12 gap-2 items-center py-2 px-3 rounded-2xl transition-all duration-200 ${
        set.completed
          ? 'bg-brand-primary/[0.12] text-white'
          : currentSetType === 'warmup'
          ? 'bg-white/[0.03]'
          : 'bg-[#151924] hover:bg-[#181E2C]'
      }`}
    >
      {/* 1. Set Number / Type Badge (col-span-1, Static Stable Indicator) */}
      <div className="col-span-1 flex justify-center">
        {renderSetBadge()}
      </div>

      {/* 2. Previous Session Reference (col-span-2) */}
      <div className="col-span-2 text-center">
        <button
          type="button"
          onClick={handleCopyPrevious}
          disabled={!prevGhost || prevGhost === '—'}
          className="text-xs font-mono text-slate-400 hover:text-white truncate max-w-full px-0.5 transition-colors disabled:pointer-events-none"
          title={prevGhost ? `Last time: ${cleanPrevDisplay} (tap to copy)` : 'First time logging this exercise'}
        >
          {cleanPrevDisplay}
        </button>
      </div>

      {/* 3. Weight Input (KG) (col-span-4) */}
      <div className="col-span-4 flex justify-center">
        <input
          type="number"
          step={weightStep}
          value={currentWeight}
          aria-label={`Set ${set.setNumber} weight in kilograms`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualWeightKg: parseFloat(e.target.value) || 0 })}
          className={`w-full py-2 px-1 bg-[#0B0E14] rounded-xl text-center font-mono text-sm font-extrabold tabular-numbers transition-colors ${
            set.completed ? 'text-brand-primary' : 'text-white'
          } focus:outline-none focus:ring-1 focus:ring-brand-primary/50`}
        />
      </div>

      {/* 4. Reps Input (col-span-3) */}
      <div className="col-span-3 flex justify-center">
        <input
          type="number"
          value={currentReps}
          aria-label={`Set ${set.setNumber} repetitions`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualReps: parseInt(e.target.value, 10) || 0 })}
          className={`w-full py-2 px-1 bg-[#0B0E14] rounded-xl text-center font-mono text-sm font-extrabold tabular-numbers transition-colors ${
            set.completed ? 'text-brand-primary' : 'text-white'
          } focus:outline-none focus:ring-1 focus:ring-brand-primary/50`}
        />
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
              ? 'bg-amber-500/20 text-amber-300 shadow-sm'
              : 'bg-[#0B0E14] hover:bg-white/[0.08] text-slate-200'
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
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${
            set.completed
              ? 'bg-brand-primary text-black font-extrabold shadow-sm'
              : 'bg-[#0B0E14] hover:bg-white/[0.08] text-slate-400 hover:text-white'
          }`}
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};
