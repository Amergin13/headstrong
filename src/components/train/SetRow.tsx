import React, { useState } from 'react';
import { SetType, WorkoutSet } from '../../engine/types';
import { evaluateWeightPokaYoke } from '../../engine/contentStrategy';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import type { PreviousSet } from '../../services/exerciseInsight';

const fig = (px: number) => `calc(${px} * var(--f))`;

/** SET | PREV | WEIGHT | REPS | RIR | DONE — shared by the header and every row (48px+ Android touch targets). */
export const SET_TABLE_COLUMNS = '44fr 84fr 122fr 92fr 82fr minmax(48px, 96fr)';
export const SET_TABLE_GAP = fig(16);

export type { PreviousSet } from '../../services/exerciseInsight';

interface SetRowProps {
  set: WorkoutSet;
  previous?: PreviousSet;
  isBodyweight?: boolean;
  isDumbbell?: boolean;
  displayBadge?: string;
  displayLabel?: string;
  /** True for the first uncompleted set in the exercise so the athlete knows which set is up next. */
  isNextSet?: boolean;
  /** Single-arm / single-leg: show left and right reps under the row. */
  perSide?: boolean;
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
  isNextSet = false,
  perSide = false,
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

  // Bumped each time the athlete ticks the set, to replay the completion animation (not on load).
  const [celebration, setCelebration] = useState(0);
  const [dismissedPokaYokeKg, setDismissedPokaYokeKg] = useState<number | null>(null);

  const referenceWeightKg = previous && previous.weightKg > 0 ? previous.weightKg : set.targetWeightKg;
  const pokaYoke =
    !isBodyweight && !set.completed ? evaluateWeightPokaYoke(currentWeight, referenceWeightKg, units.unit) : null;
  const showPokaYoke = Boolean(pokaYoke?.isSuspiciousJump && dismissedPokaYokeKg !== currentWeight);

  const handleToggleComplete = () => {
    const nextCompleted = !set.completed;
    if (nextCompleted) setCelebration((n) => n + 1);
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
  const greyText: React.CSSProperties = { fontSize: `max(12px, ${fig(26)})`, fontWeight: 600, color: 'var(--wk-muted)' };

  // Per side: the set's reps are what both sides managed (the weaker side).
  const updateSide = (side: 'left' | 'right', reps: number) => {
    const left = side === 'left' ? reps : set.actualRepsLeft ?? currentReps;
    const right = side === 'right' ? reps : set.actualRepsRight ?? currentReps;
    onUpdate({ actualRepsLeft: left, actualRepsRight: right, actualReps: Math.min(left, right) });
  };
  const sideInput = (side: 'left' | 'right') => (
    <label className="flex items-center" style={{ gap: fig(12) }}>
      <span style={greyText}>{side === 'left' ? 'Left' : 'Right'}</span>
      <input
        type="number"
        inputMode="numeric"
        value={(side === 'left' ? set.actualRepsLeft : set.actualRepsRight) ?? currentReps}
        aria-label={`${label} ${side} side repetitions`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => updateSide(side, Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="wk-input outline-none block"
        style={{ width: fig(110) }}
      />
    </label>
  );

  const activeNext = isNextSet && !set.completed;

  return (
    <div className="flex flex-col" style={{ gap: fig(14) }}>
    <div
      className="grid items-center relative transition-colors"
      data-next-set={activeNext ? 'true' : undefined}
      aria-current={activeNext ? 'step' : undefined}
      style={{
        gridTemplateColumns: SET_TABLE_COLUMNS,
        columnGap: SET_TABLE_GAP,
        borderRadius: fig(20),
        padding: `${fig(8)} ${fig(10)}`,
        marginLeft: `calc(-1 * ${fig(10)})`,
        marginRight: `calc(-1 * ${fig(10)})`,
        background: activeNext ? 'rgba(0, 241, 159, 0.06)' : 'transparent',
        boxShadow: activeNext ? 'inset 0 0 0 1px rgba(0, 241, 159, 0.28)' : 'none',
        opacity: set.completed ? 0.86 : 1,
      }}
      aria-label={activeNext ? `${label} (next set)` : label}
    >
      {celebration > 0 && set.completed && (
        <span key={`flash-${celebration}`} className="wk-row-flash" aria-hidden="true" />
      )}
      <span
        className="flex flex-col items-center justify-center text-center leading-tight"
        style={{
          ...greyText,
          color: activeNext
            ? 'var(--wk-accent)'
            : currentSetType === 'warmup'
            ? 'var(--color-set-warmup)'
            : greyText.color,
          fontWeight: activeNext ? 800 : 600,
        }}
        title={activeNext ? `${label} — Next set` : label}
      >
        <span>{badge}</span>
        {activeNext && (
          <span
            className="uppercase tracking-wider font-extrabold"
            style={{ fontSize: `max(12px, ${fig(18)})`, color: 'var(--wk-accent)', lineHeight: 1.05 }}
          >
            Next
          </span>
        )}
      </span>

      <button
        type="button"
        onClick={handleCopyPrevious}
        disabled={!previous}
        aria-label={previous ? `Last time ${prevDisplay}. Tap to copy` : 'No previous set for this exercise'}
        className="wk-tap text-center truncate disabled:pointer-events-none"
        style={greyText}
      >
        {prevDisplay}
      </button>

      <label
        className="wk-tap wk-input flex items-center justify-center cursor-text"
        style={
          activeNext
            ? { boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)' }
            : !set.completed
            ? { color: 'var(--color-text-secondary)' }
            : undefined
        }
      >
        <input
          type="number"
          step={weightStep}
          inputMode="decimal"
          value={displayWeight}
          aria-label={`${label} weight in ${units.unit === 'lb' ? 'pounds' : 'kilograms'}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualWeightKg: units.fromDisplay(parseFloat(e.target.value) || 0) })}
          className="bg-transparent text-right font-bold outline-none p-0"
          style={{
            width: `${Math.max(1, String(displayWeight).length)}ch`,
            fontSize: 'inherit',
            color: activeNext || set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          }}
        />
        {displayWeight > 0 && (
          <span aria-hidden="true" style={{ fontSize: 'max(12px, 0.8em)', marginLeft: '0.1em' }}>
            {units.unit.toUpperCase()}
          </span>
        )}
      </label>

      <label className="wk-tap block relative">
        <input
          type="number"
          inputMode="numeric"
          value={currentReps}
          aria-label={`${label} repetitions`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onUpdate({ actualReps: parseInt(e.target.value, 10) || 0 })}
          className="wk-input outline-none block"
          style={{
            color: activeNext || set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            boxShadow: activeNext ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)' : undefined,
          }}
        />
        {(set.isFormFailure || set.repDisplay === 'F*') && (
          <span
            className="absolute rounded pointer-events-none font-bold"
            style={{ top: fig(-12), right: fig(-6), fontSize: `max(12px, ${fig(18)})`, padding: `0 ${fig(6)}`, background: 'var(--color-set-failure-bg)', color: 'var(--color-set-failure-fg)' }}
            title="Do as many reps as you can with good form"
          >
            F*
          </span>
        )}
      </label>

      <label className="wk-tap block">
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
          style={{
            color: activeNext || set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            boxShadow: activeNext ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)' : undefined,
          }}
        />
      </label>

      <button
        type="button"
        onClick={handleToggleComplete}
        aria-label={
          set.completed
            ? `Mark ${label.toLowerCase()} not done`
            : activeNext
            ? `Complete ${label.toLowerCase()} (next set)`
            : `Complete ${label.toLowerCase()}`
        }
        title={set.completed ? `${label} logged` : `Log ${label.toLowerCase()}`}
        aria-pressed={set.completed}
        className={`wk-tap flex items-center justify-center transition-colors active:scale-95 ${
          celebration > 0 && set.completed ? 'wk-tick-pop' : ''
        }`}
        style={{
          minHeight: 48,
          minWidth: 48,
          height: `max(48px, ${fig(106)})`,
          borderRadius: fig(15),
          background: set.completed
            ? 'var(--wk-accent)'
            : activeNext
            ? 'var(--color-status-positive-soft)'
            : 'var(--color-action-secondary-bg)',
          border: set.completed
            ? 'none'
            : activeNext
            ? '1.5px solid var(--wk-accent)'
            : '1px solid var(--color-border-subtle)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          style={{ width: `max(18px, ${fig(38)})`, height: `max(18px, ${fig(38)})` }}
          fill="none"
          stroke={
            set.completed
              ? 'var(--color-text-on-accent)'
              : activeNext
              ? 'var(--wk-accent)'
              : 'var(--wk-muted)'
          }
          strokeWidth={set.completed ? 3 : activeNext ? 2.75 : 2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className={celebration > 0 && set.completed ? 'wk-check-draw' : undefined} />
        </svg>
        {celebration > 0 && set.completed && <span className="wk-tick-ripple" aria-hidden="true" />}
      </button>
    </div>
    {perSide && (
      <div className="flex justify-end" style={{ gap: fig(28) }} role="group" aria-label={`${label} reps for each side`}>
        {sideInput('left')}
        {sideInput('right')}
      </div>
    )}
    {showPokaYoke && pokaYoke?.message && pokaYoke.actionLabel && (
      <div
        role="status"
        aria-live="polite"
        className="wk-raised flex items-center justify-between flex-wrap"
        style={{ gap: fig(16), fontSize: `max(12px, ${fig(22)})` }}
      >
        <span className="text-white/90">{pokaYoke.message}</span>
        <div className="flex items-center" style={{ gap: fig(12) }}>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onUpdate({ actualWeightKg: pokaYoke.referenceWeightKg });
              setDismissedPokaYokeKg(null);
            }}
            className="wk-btn-secondary min-h-[44px] font-semibold"
            style={{ background: 'var(--wk-accent)', color: 'var(--color-text-on-accent)' }}
          >
            {pokaYoke.actionLabel}
          </button>
          <button
            type="button"
            onClick={() => setDismissedPokaYokeKg(currentWeight)}
            className="wk-btn-secondary min-h-[44px] text-white/70"
          >
            Keep {pokaYoke.enteredDisplay}
          </button>
        </div>
      </div>
    )}
    </div>
  );
};
