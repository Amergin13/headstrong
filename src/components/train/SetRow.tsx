import React, { useState } from 'react';
import { SetType, WorkoutSet } from '../../engine/types';
import { MAX_LOGGABLE_RIR } from '../../engine/e1rm';
import { evaluateWeightPokaYoke } from '../../engine/contentStrategy';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import type { PreviousSet } from '../../services/exerciseInsight';


/** SET | PREV | WEIGHT | REPS | RIR | DONE — shared by the header and every row (48px+ Android touch targets). */
export const SET_TABLE_COLUMNS = '44fr 84fr 122fr 92fr 82fr minmax(48px, 96fr)';
/** Progressive-disclosure layout when RIR tracking is hidden: SET | PREV | WEIGHT | REPS | DONE. */
export const SET_TABLE_COLUMNS_NO_RIR = '44fr 96fr 136fr 104fr minmax(48px, 96fr)';
export const SET_TABLE_GAP = '8px';

export type { PreviousSet } from '../../services/exerciseInsight';

interface SetRowProps {
  set: WorkoutSet;
  previous?: PreviousSet;
  isBodyweight?: boolean;
  isDumbbell?: boolean;
  isTwoDumbbell?: boolean;
  isTimed?: boolean;
  /** Progressive disclosure: hide granular RIR input for new lifters focusing on weight × reps. */
  showRir?: boolean;
  displayBadge?: string;
  displayLabel?: string;
  /** Single-arm / single-leg: show left and right reps under the row. */
  perSide?: boolean;
  /** Optional fallback reference shown in PREV/REF when this exercise has no own prior history (e.g. "BB 77.5×8", "Adapts on S1", "Wk 3: 77.5×8"). */
  prevOverride?: string;
  /** Optional setup label shown instead of 0 kg in bodyweight mode or effort-only machines (e.g. "Elevated (~74% BW)", "Pick moderate"). */
  setupLabelOverride?: string | null;
  /** True for uncalibrated variable machines/cables where Set 1 skips load guessing. */
  isEffortOnly?: boolean;
  onUpdate: (updated: Partial<WorkoutSet>) => void;
  onComplete: () => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  set,
  previous,
  isBodyweight = false,
  isDumbbell = false,
  isTwoDumbbell = false,
  isTimed = false,
  showRir = true,
  displayBadge,
  displayLabel,
  perSide = false,
  prevOverride,
  setupLabelOverride,
  isEffortOnly = false,
  onUpdate,
  onComplete,
}) => {
  const units = useUnits();
  const currentWeight = set.actualWeightKg ?? set.targetWeightKg;
  const displayWeight = units.toDisplay(currentWeight);
  const currentReps = set.actualReps ?? set.targetReps;
  const currentSeconds =
    set.actualDurationSeconds ??
    set.targetDurationSeconds ??
    (currentReps > 5 ? currentReps : 45);
  const currentRir = set.actualRir ?? set.targetRir ?? 2;
  const currentSetType: SetType = set.setType || (set.isWarmup ? 'warmup' : 'working');
  const weightStep = units.unit === 'lb' ? 5 : isDumbbell ? 1.0 : 2.5;
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
      actualReps: isTimed ? 1 : currentReps,
      ...(isTimed ? { actualDurationSeconds: currentSeconds } : {}),
      actualRir: currentRir,
      completed: nextCompleted,
      completedAt: nextCompleted ? new Date().toISOString() : undefined,
    });
    if (nextCompleted) onComplete();
  };

  // Tap the previous-session value to copy its weight & reps (or seconds) into this set
  const handleCopyPrevious = () => {
    if (!previous || set.completed) return;
    triggerHaptic('light');
    onUpdate({
      actualWeightKg: isBodyweight ? 0 : previous.weightKg,
      actualReps: isTimed ? 1 : previous.reps,
      ...(isTimed && previous.durationSeconds ? { actualDurationSeconds: previous.durationSeconds } : {}),
    });
  };

  const prevDisplay = previous
    ? isTimed && previous.durationSeconds
      ? `${isBodyweight || previous.weightKg === 0 ? 'BW' : units.format(previous.weightKg, false)}×${previous.durationSeconds}s`
      : `${isBodyweight || previous.weightKg === 0 ? 'BW' : units.format(previous.weightKg, false)}×${previous.reps}`
    : prevOverride || '—';
  const badge =
    displayBadge || (currentSetType === 'warmup' ? 'W' : currentSetType === 'drop' ? 'D' : currentSetType === 'myo' ? '+' : `${set.setNumber}`);
  const greyText: React.CSSProperties = {
    fontSize: 12,
    lineHeight: '16px',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--wk-muted)',
  };

  // Per side: the set's reps are what both sides managed (the weaker side).
  const updateSide = (side: 'left' | 'right', reps: number) => {
    const left = side === 'left' ? reps : set.actualRepsLeft ?? currentReps;
    const right = side === 'right' ? reps : set.actualRepsRight ?? currentReps;
    onUpdate({ actualRepsLeft: left, actualRepsRight: right, actualReps: Math.min(left, right) });
  };
  const sideInput = (side: 'left' | 'right') => (
    <label className="flex items-center gap-2">
      <span style={greyText}>{side === 'left' ? 'Left' : 'Right'}</span>
      <input
        type="number"
        inputMode={set.completed ? 'none' : 'numeric'}
        readOnly={set.completed}
        aria-readonly={set.completed}
        tabIndex={set.completed ? -1 : undefined}
        value={(side === 'left' ? set.actualRepsLeft : set.actualRepsRight) ?? currentReps}
        aria-label={`${label} ${side} side repetitions`}
        onFocus={(e) => {
          if (!set.completed) e.target.select();
        }}
        onChange={(e) => {
          if (!set.completed) updateSide(side, Math.max(0, parseInt(e.target.value, 10) || 0));
        }}
        className={`wk-input tabular-numbers outline-none block transition-colors ${
          set.completed ? 'wk-input-readonly pointer-events-none' : ''
        }`}
        style={{ width: 52, color: set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
    <div
      className="grid items-center relative"
      style={{ gridTemplateColumns: showRir ? SET_TABLE_COLUMNS : SET_TABLE_COLUMNS_NO_RIR, columnGap: SET_TABLE_GAP }}
      aria-label={label}
    >
      {celebration > 0 && set.completed && (
        <span key={`flash-${celebration}`} className="wk-row-flash" aria-hidden="true" />
      )}
      <span
        className="text-center tabular-numbers"
        style={{ ...greyText, color: currentSetType === 'warmup' ? 'var(--color-set-warmup)' : greyText.color }}
        title={label}
      >
        {badge}
      </span>

      <button
        type="button"
        onClick={handleCopyPrevious}
        disabled={!previous || set.completed}
        aria-label={previous ? `Last time ${prevDisplay}. Tap to copy` : 'No previous set for this exercise'}
        className="wk-tap text-center truncate tabular-numbers disabled:pointer-events-none"
        style={greyText}
      >
        {prevDisplay}
      </button>

      <label
        className={`wk-tap wk-input tabular-numbers flex items-center justify-center transition-colors ${
          set.completed ? 'wk-input-readonly' : 'cursor-text'
        }`}
      >
        {(() => {
          const effectiveSetup = set.setupLabel ?? setupLabelOverride ?? null;
          const showEffortPrompt = isEffortOnly && displayWeight === 0 && !set.completed;
          const showBwSetup = isBodyweight && displayWeight === 0 && Boolean(effectiveSetup);
          const showBwToken = (isBodyweight || isTimed) && displayWeight === 0;
          const showEstimatedTilde = Boolean(set.isWeightEstimated && !set.completed && displayWeight > 0 && !isBodyweight);
          if (showBwSetup && effectiveSetup) {
            return (
              <span
                className="wk-caption text-center truncate px-1"
                style={{ color: set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
                title={effectiveSetup}
              >
                {effectiveSetup.replace(' (~', ' · ~').replace(')', '')}
              </span>
            );
          }
          if (showEffortPrompt) {
            return (
              <input
                type="number"
                step={weightStep}
                inputMode="decimal"
                value=""
                placeholder="Pick moderate"
                aria-label={`${label} weight in ${units.unit === 'lb' ? 'pounds' : 'kilograms'} (pick moderate)`}
                onChange={(e) => {
                  onUpdate({
                    actualWeightKg: units.fromDisplay(parseFloat(e.target.value) || 0),
                    isWeightEstimated: false,
                  });
                }}
                className="bg-transparent font-semibold tabular-numbers outline-none p-0 text-center w-full"
                style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
              />
            );
          }
          return (
            <>
              {showEstimatedTilde && (
                <span
                  aria-hidden="true"
                  title="Estimated from anchor lift"
                  style={{ fontSize: 12, fontWeight: 500, marginRight: '0.1em', color: 'var(--wk-muted)' }}
                >
                  ~
                </span>
              )}
              <input
                type="number"
                step={weightStep}
                inputMode={set.completed ? 'none' : 'decimal'}
                readOnly={set.completed}
                aria-readonly={set.completed}
                tabIndex={set.completed ? -1 : undefined}
                value={showBwToken ? '' : displayWeight}
                placeholder={showBwToken ? 'BW' : undefined}
                aria-label={`${label} ${isTwoDumbbell ? 'weight per dumbbell' : 'weight'} in ${units.unit === 'lb' ? 'pounds' : 'kilograms'}${showEstimatedTilde ? ' (estimated)' : ''}`}
                onFocus={(e) => {
                  if (!set.completed) e.target.select();
                }}
                onChange={(e) => {
                  if (!set.completed) onUpdate({ actualWeightKg: units.fromDisplay(parseFloat(e.target.value) || 0), isWeightEstimated: false });
                }}
                className={`bg-transparent font-semibold tabular-numbers outline-none p-0 ${showBwToken ? 'text-center' : 'text-right'} ${
                  set.completed ? 'pointer-events-none' : ''
                }`}
                style={{
                  width: `${Math.max(showBwToken ? 3 : 1, String(showBwToken ? 'BW' : displayWeight).length)}ch`,
                  fontSize: 'inherit',
                  color: set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
              />
              {displayWeight > 0 && (
                <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 500, marginLeft: '0.12em', color: 'var(--wk-muted)' }}>
                  {units.unit}
                </span>
              )}
            </>
          );
        })()}
      </label>

      {isTimed ? (
        <label
          className={`wk-tap wk-input tabular-numbers flex items-center justify-center transition-colors ${
            set.completed ? 'wk-input-readonly' : 'cursor-text'
          }`}
        >
          <input
            type="number"
            inputMode={set.completed ? 'none' : 'numeric'}
            readOnly={set.completed}
            aria-readonly={set.completed}
            tabIndex={set.completed ? -1 : undefined}
            value={currentSeconds}
            aria-label={`${label} duration in seconds`}
            onFocus={(e) => {
              if (!set.completed) e.target.select();
            }}
            onChange={(e) => {
              if (!set.completed) onUpdate({ actualDurationSeconds: Math.max(0, parseInt(e.target.value, 10) || 0) });
            }}
            className={`bg-transparent text-right font-semibold tabular-numbers outline-none p-0 ${
              set.completed ? 'pointer-events-none' : ''
            }`}
            style={{
              width: `${Math.max(1, String(currentSeconds).length)}ch`,
              fontSize: 'inherit',
              color: set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          />
          <span
            aria-hidden="true"
            style={{ fontSize: 12, fontWeight: 500, marginLeft: '0.12em', color: 'var(--wk-muted)' }}
          >
            s
          </span>
        </label>
      ) : (
        <label className="wk-tap block relative">
          <input
            type="number"
            inputMode={set.completed ? 'none' : 'numeric'}
            readOnly={set.completed}
            aria-readonly={set.completed}
            tabIndex={set.completed ? -1 : undefined}
            value={currentReps}
            aria-label={`${label} repetitions`}
            onFocus={(e) => {
              if (!set.completed) e.target.select();
            }}
            onChange={(e) => {
              if (!set.completed) onUpdate({ actualReps: parseInt(e.target.value, 10) || 0 });
            }}
            className={`wk-input tabular-numbers outline-none block transition-colors ${
              set.completed ? 'wk-input-readonly pointer-events-none' : ''
            }`}
            style={{ color: set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
          />
          {(set.isFormFailure || set.repDisplay === 'F*') && (
            <span
              className="absolute rounded pointer-events-none font-medium"
              style={{ top: -4, right: -4, fontSize: 12, padding: '0 4px', background: 'var(--color-set-failure-bg)', color: 'var(--color-set-failure-fg)' }}
              title="Do as many reps as you can with good form"
            >
              F*
            </span>
          )}
        </label>
      )}

      {showRir && (
        <label
          className={`wk-tap wk-input tabular-numbers flex items-center justify-center transition-colors ${
            set.completed ? 'wk-input-readonly' : 'cursor-text'
          }`}
        >
          <input
            type="number"
            inputMode={set.completed ? 'none' : 'numeric'}
            readOnly={set.completed}
            aria-readonly={set.completed}
            tabIndex={set.completed ? -1 : undefined}
            min={0}
            max={MAX_LOGGABLE_RIR}
            value={Math.min(MAX_LOGGABLE_RIR, Math.max(0, currentRir))}
            aria-label={`${label} reps in reserve (0 to ${MAX_LOGGABLE_RIR}+)`}
            onFocus={(e) => {
              if (!set.completed) e.target.select();
            }}
            onChange={(e) => {
              if (!set.completed) {
                onUpdate({
                  actualRir: Math.max(0, Math.min(MAX_LOGGABLE_RIR, parseInt(e.target.value, 10) || 0)),
                });
              }
            }}
            className={`bg-transparent text-center font-semibold tabular-numbers outline-none p-0 ${
              set.completed ? 'pointer-events-none' : ''
            }`}
            style={{
              width: `${Math.max(1, String(Math.min(MAX_LOGGABLE_RIR, Math.max(0, currentRir))).length)}ch`,
              fontSize: 'inherit',
              color: set.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          />
          {currentRir >= MAX_LOGGABLE_RIR && (
            <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 500, color: 'var(--wk-muted)' }}>
              +
            </span>
          )}
        </label>
      )}

      <button
        type="button"
        onClick={handleToggleComplete}
        aria-label={set.completed ? `Mark ${label.toLowerCase()} not done` : `Complete ${label.toLowerCase()}`}
        title={set.completed ? `${label} logged` : `Log ${label.toLowerCase()}`}
        aria-pressed={set.completed}
        className={`wk-tap flex items-center justify-center transition-all active:scale-[0.98] ${
          celebration > 0 && set.completed ? 'wk-tick-pop' : ''
        }`}
        style={{
          minHeight: 48,
          minWidth: 48,
          height: 48,
          borderRadius: 8,
          background: set.completed ? 'var(--color-status-positive)' : 'var(--color-action-secondary-bg)',
          border: set.completed ? '1px solid transparent' : '1px solid var(--color-border-strong)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          style={{ width: 20, height: 20 }}
          fill="none"
          stroke={set.completed ? 'var(--color-text-on-accent)' : 'var(--color-text-secondary)'}
          strokeWidth={set.completed ? 3 : 2.2}
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
      <div className="flex justify-end gap-3" role="group" aria-label={`${label} reps for each side`}>
        {sideInput('left')}
        {sideInput('right')}
      </div>
    )}
    {showPokaYoke && pokaYoke?.message && pokaYoke.actionLabel && (
      <div
        role="status"
        aria-live="polite"
        className="wk-raised flex items-center justify-between flex-wrap gap-2"
        style={{ fontSize: 12 }}
      >
        <span style={{ color: 'var(--color-text-primary)' }}>{pokaYoke.message}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onUpdate({ actualWeightKg: pokaYoke.referenceWeightKg });
              setDismissedPokaYokeKg(null);
            }}
            className="wk-btn-secondary min-h-[44px]"
            style={{
              background: 'var(--color-action-primary-bg)',
              color: 'var(--color-action-primary-fg)',
              borderColor: 'var(--color-action-primary-bg)',
            }}
          >
            {pokaYoke.actionLabel}
          </button>
          <button
            type="button"
            onClick={() => setDismissedPokaYokeKg(currentWeight)}
            className="wk-btn-secondary min-h-[44px]"
          >
            Keep {pokaYoke.enteredDisplay}
          </button>
        </div>
      </div>
    )}
    </div>
  );
};
