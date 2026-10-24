import React from 'react';
import { SetType, WorkoutSet } from '../../engine/types';
import { Check } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

const fig = (px: number) => `calc(${px} * var(--f))`;

/** SET | PREV | WEIGHT | REPS | RIR | ✓ — shared by the header and every row (Figma column widths). */
export const SET_TABLE_COLUMNS = '36fr 92fr 130fr 100fr 90fr 74fr';
export const SET_TABLE_GAP = fig(20);

/** A working set from the last time this exact exercise was completed. */
export interface PreviousSet {
  weightKg: number;
  reps: number;
}

interface SetRowProps {
  set: WorkoutSet;
  previous?: PreviousSet;
  isBodyweight?: boolean;
  isDumbbell?: boolean;
  displayBadge?: string;
  displayLabel?: string;
  onUpdate: (updated: Partial<WorkoutSet>) => void;
  onComplete: () => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  set,
  previous,
  isBodyweight = false,
  isDumbbell = false,
  displayBadge,
  displayLabel,
  onUpdate,
  onComplete,
}) => {
  const units = useUnits();
  const currentWeight = set.actualWeightKg ?? set.targetWeightKg;
  const displayWeight = units.toDisplay(currentWeight);
  const currentReps = set.actualReps ?? set.targetReps;
  const currentRir = set.actualRir ?? set.targetRir ?? 2;
  const currentSetType: SetType = set.setType || (set.isWarmup ? 'warmup' : 'working');
  const weightStep = units.unit === 'lb' ? 5 : isDumbbell ? 2.0 : 2.5;
  const label = displayLabel || `Set ${set.setNumber}`;

  const handleToggleComplete = () => {
    const nextCompleted = !set.completed;
    triggerHaptic(nextCompleted ? 'success' : 'light');
    onUpdate({
      actualWeightKg: currentWeight,
      actualReps: currentReps,
      actualRir: currentRir,
      completed: nextCompleted,
      completedAt: nextCompleted ? new Date().toISOString() : undefined,
    });
    if (nextCompleted) onComplete();
  };

  // Tap the previous-session value to copy its weight & reps into this set
  const handleCopyPrevious = () => {
    if (!previous || set.completed) return;
    triggerHaptic('light');
    onUpdate({ actualWeightKg: isBodyweight ? 0 : previous.weightKg, actualReps: previous.reps });
  };

  const prevDisplay = previous
    ? `${isBodyweight || previous.weightKg === 0 ? 'BW' : units.format(previous.weightKg, false)}×${previous.reps}`
    : '—';
  const badge =
    displayBadge || (currentSetType === 'warmup' ? 'W' : currentSetType === 'drop' ? 'D' : currentSetType === 'myo' ? '+' : `${set.setNumber}`);
  const greyText: React.CSSProperties = { fontSize: fig(26), fontWeight: 600, color: '#A7ACAF' };

  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: SET_TABLE_COLUMNS, columnGap: SET_TABLE_GAP }}
      aria-label={label}
    >
      <span className="text-center" style={{ ...greyText, color: currentSetType === 'warmup' ? '#F5B94A' : greyText.color }} title={label}>
        {badge}
      </span>

      <button
        type="button"
        onClick={handleCopyPrevious}
        disabled={!previous}
        aria-label={previous ? `Last time ${prevDisplay}. Tap to copy` : 'No previous set for this exercise'}
        className="text-center truncate disabled:pointer-events-none"
        style={greyText}
      >
        {prevDisplay}
      </button>

      <label className="wk-input flex items-center justify-center cursor-text">
        <input
          type="number"
          step={weightStep}
          inputMode="decimal"
          value={displayWeight}
          aria-label={`${label} weight in ${units.unit === 'lb' ? 'pounds' : 'kilograms'}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualWeightKg: units.fromDisplay(parseFloat(e.target.value) || 0) })}
          className="bg-transparent text-right font-bold text-white outline-none p-0"
          style={{ width: `${Math.max(1, String(displayWeight).length)}ch`, fontSize: 'inherit' }}
        />
        {displayWeight > 0 && (
          <span aria-hidden="true" style={{ fontSize: '0.8em', marginLeft: '0.1em' }}>
            {units.unit.toUpperCase()}
          </span>
        )}
      </label>

      <span className="relative block">
        <input
          type="number"
          inputMode="numeric"
          value={currentReps}
          aria-label={`${label} repetitions`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualReps: parseInt(e.target.value, 10) || 0 })}
          className="wk-input outline-none block"
        />
        {(set.isFormFailure || set.repDisplay === 'F*') && (
          <span
            className="absolute rounded pointer-events-none font-bold"
            style={{ top: fig(-12), right: fig(-6), fontSize: fig(18), padding: `0 ${fig(6)}`, background: '#5B2A33', color: '#FFB3BF' }}
            title="Do as many reps as you can with good form"
          >
            F*
          </span>
        )}
      </span>

      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={5}
        value={currentRir}
        aria-label={`${label} reps in reserve`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onUpdate({ actualRir: Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0)) })}
        className="wk-input outline-none block"
      />

      <button
        type="button"
        onClick={handleToggleComplete}
        aria-label={set.completed ? `Mark ${label.toLowerCase()} not done` : `Complete ${label.toLowerCase()}`}
        aria-pressed={set.completed}
        className="flex items-center justify-center transition-colors active:scale-95"
        style={{
          height: fig(74),
          borderRadius: fig(15),
          background: set.completed ? 'var(--wk-accent)' : 'var(--wk-pill)',
        }}
      >
        {set.completed && <Check style={{ width: fig(34), height: fig(34), color: '#13181C' }} strokeWidth={3} aria-hidden="true" />}
      </button>
    </div>
  );
};
