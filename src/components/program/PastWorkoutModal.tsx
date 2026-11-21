import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import { ExerciseSession, WorkoutSession } from '../../engine/types';
import { clampRir } from '../../engine/continuityEngine';
import { isTimedExercise } from '../../engine/e1rm';
import { planWorkoutLabel } from '../../engine/muscleBuildingProgram';
import { useUnits } from '../../utils/unitsContext';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';

interface PastWorkoutModalProps {
  workoutNumber?: number;
  title: string;
  session: WorkoutSession;
  onSelectExercise?: (exercise: ExerciseSession) => void;
  onSaveWorkout?: (updated: WorkoutSession) => void;
  onDeleteWorkout?: (workoutId: string) => void;
  onClose: () => void;
}

interface SetDraft {
  weight: string;
  reps: string;
  rir: string;
  duration: string;
}

function formatSessionDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Record of a completed workout with optional inline editing and 2-step delete. */
export const PastWorkoutModal: React.FC<PastWorkoutModalProps> = ({
  workoutNumber,
  title,
  session,
  onSelectExercise,
  onSaveWorkout,
  onDeleteWorkout,
  onClose,
}) => {
  const units = useUnits();
  // Close on a tap that starts on the backdrop, not on the tail of the tap that opened the sheet.
  const pressedBackdrop = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [setDrafts, setSetDrafts] = useState<Record<string, SetDraft>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setIsEditing(false);
    setConfirmingDelete(false);
  }, [session.id]);

  const exercises = session.exercises
    .map((ex) => ({ ex, sets: ex.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup') }))
    .filter((e) => e.sets.length > 0);

  const enterEditMode = () => {
    triggerHaptic('light');
    const nextSets: Record<string, SetDraft> = {};
    const nextNotes: Record<string, string> = {};
    for (const { ex, sets } of exercises) {
      nextNotes[ex.id] = ex.athleteNotes ?? '';
      for (const st of sets) {
        const kg = st.actualWeightKg ?? st.targetWeightKg ?? 0;
        const reps = st.actualReps ?? st.targetReps ?? 0;
        const rir = st.actualRir ?? st.targetRir ?? 2;
        const secs = st.actualDurationSeconds ?? st.targetDurationSeconds ?? 0;
        nextSets[st.id] = {
          weight: kg > 0 ? String(units.toDisplay(kg)) : '0',
          reps: String(reps),
          rir: String(clampRir(rir)),
          duration: secs > 0 ? String(secs) : '',
        };
      }
    }
    setSetDrafts(nextSets);
    setNoteDrafts(nextNotes);
    setConfirmingDelete(false);
    setIsEditing(true);
  };

  const handleSaveEdits = () => {
    if (!onSaveWorkout) return;
    triggerHaptic('success');
    const updatedExercises: ExerciseSession[] = session.exercises.map((ex) => {
      const hasDraftNote = ex.id in noteDrafts;
      const trimmedNote = hasDraftNote ? noteDrafts[ex.id].trim() : ex.athleteNotes;
      return {
        ...ex,
        athleteNotes: trimmedNote || undefined,
        sets: ex.sets.map((st) => {
          const draft = setDrafts[st.id];
          if (!draft) return st;
          const parsedDisplayWeight = parseFloat(draft.weight);
          const nextKg =
            Number.isFinite(parsedDisplayWeight) && parsedDisplayWeight >= 0
              ? Math.round(units.fromDisplay(parsedDisplayWeight) * 100) / 100
              : st.actualWeightKg ?? st.targetWeightKg ?? 0;
          const parsedReps = parseInt(draft.reps, 10);
          const nextReps =
            Number.isFinite(parsedReps) && parsedReps > 0
              ? parsedReps
              : st.actualReps ?? st.targetReps ?? 1;
          const parsedRir = parseInt(draft.rir, 10);
          const nextRir = Number.isFinite(parsedRir)
            ? clampRir(parsedRir)
            : st.actualRir ?? st.targetRir ?? 2;
          const parsedDur = parseInt(draft.duration, 10);
          const hasDur = Boolean(st.actualDurationSeconds || st.targetDurationSeconds || isTimedExercise(ex));

          return {
            ...st,
            actualWeightKg: nextKg,
            actualReps: nextReps,
            actualRir: nextRir,
            ...(hasDur && Number.isFinite(parsedDur) && parsedDur > 0
              ? { actualDurationSeconds: parsedDur }
              : {}),
          };
        }),
      };
    });

    onSaveWorkout({
      ...session,
      exercises: updatedExercises,
    });
    setIsEditing(false);
  };

  const headingText =
    workoutNumber != null
      ? `${workoutNumber}. ${formatSentenceCase(planWorkoutLabel(title))}`
      : formatSentenceCase(planWorkoutLabel(title));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        workoutNumber != null
          ? `Workout ${workoutNumber}, ${planWorkoutLabel(title)}`
          : planWorkoutLabel(title)
      }
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'var(--color-bg-scrim)' }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wk-card w-full max-w-lg max-h-[85vh] overflow-y-auto flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="wk-h1">{headingText}</h3>
            <p className="wk-caption mt-1">
              {formatSessionDate(session.date)}
              {session.durationMinutes ? ` • ${session.durationMinutes} min` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onSaveWorkout && !isEditing && exercises.length > 0 && (
              <button
                type="button"
                onClick={enterEditMode}
                aria-label="Edit logged workout"
                className="wk-btn-secondary min-h-[44px] px-3 inline-flex items-center gap-1"
              >
                <Pencil className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              aria-label="Close workout"
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-colors shrink-0"
              style={{
                background: 'var(--wk-raised)',
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>

        {exercises.length === 0 ? (
          <p className="wk-body">No working sets were logged in this workout.</p>
        ) : (
          exercises.map(({ ex, sets }) => {
            const timed = isTimedExercise(ex);
            const isPureBw = ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic;
            return (
              <div
                key={ex.id}
                className="pt-3"
                style={{ borderTop: '1px solid var(--color-border-subtle)' }}
              >
                {onSelectExercise && !isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectExercise(ex);
                    }}
                    aria-label={`Open details for ${formatSentenceCase(ex.name)}`}
                    className="w-full text-left flex items-center justify-between gap-2 min-h-[44px]"
                  >
                    <span className="wk-subhead">{formatSentenceCase(ex.name)}</span>
                    <ChevronRight className="wk-chevron shrink-0" strokeWidth={2} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="wk-subhead">{formatSentenceCase(ex.name)}</div>
                )}

                {isEditing ? (
                  <div className="flex flex-col gap-2 mt-2">
                    <div
                      className="grid gap-2 wk-caption"
                      style={{
                        gridTemplateColumns: isPureBw
                          ? '44px 1fr 1fr'
                          : '44px 1fr 1fr 64px',
                        color: 'var(--wk-muted)',
                      }}
                    >
                      <span>Set</span>
                      {!isPureBw && <span>{units.unit.toUpperCase()}</span>}
                      <span>{timed ? 'Sec' : 'Reps'}</span>
                      <span>RIR</span>
                    </div>
                    {sets.map((st, i) => {
                      const draft = setDrafts[st.id] ?? { weight: '0', reps: '0', rir: '2', duration: '' };
                      return (
                        <div
                          key={st.id}
                          className="grid gap-2 items-center"
                          style={{
                            gridTemplateColumns: isPureBw
                              ? '44px 1fr 1fr'
                              : '44px 1fr 1fr 64px',
                          }}
                        >
                          <span className="wk-caption tabular-nums" style={{ color: 'var(--wk-muted)' }}>
                            #{i + 1}
                          </span>
                          {!isPureBw && (
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              aria-label={`${ex.name} set ${i + 1} weight in ${units.unit}`}
                              value={draft.weight}
                              onChange={(e) =>
                                setSetDrafts((prev) => ({
                                  ...prev,
                                  [st.id]: { ...draft, weight: e.target.value },
                                }))
                              }
                              className="wk-input min-h-[44px] tabular-nums"
                            />
                          )}
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            aria-label={`${ex.name} set ${i + 1} ${timed ? 'seconds' : 'reps'}`}
                            value={timed ? draft.duration : draft.reps}
                            onChange={(e) =>
                              setSetDrafts((prev) => ({
                                ...prev,
                                [st.id]: timed
                                  ? { ...draft, duration: e.target.value }
                                  : { ...draft, reps: e.target.value },
                              }))
                            }
                            className="wk-input min-h-[44px] tabular-nums"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="6"
                            aria-label={`${ex.name} set ${i + 1} RIR`}
                            value={draft.rir}
                            onChange={(e) =>
                              setSetDrafts((prev) => ({
                                ...prev,
                                [st.id]: { ...draft, rir: e.target.value },
                              }))
                            }
                            className="wk-input min-h-[44px] tabular-nums"
                          />
                        </div>
                      );
                    })}
                    <input
                      type="text"
                      placeholder="Session note (optional)"
                      aria-label={`${ex.name} note`}
                      value={noteDrafts[ex.id] ?? ''}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [ex.id]: e.target.value }))
                      }
                      className="wk-field min-h-[44px] mt-1"
                    />
                  </div>
                ) : (
                  <>
                    <ol className="flex flex-col mt-2 gap-1">
                      {sets.map((st, i) => {
                        const kg = st.actualWeightKg ?? st.targetWeightKg;
                        const reps = st.actualReps ?? st.targetReps;
                        const secs = st.actualDurationSeconds ?? st.targetDurationSeconds;
                        return (
                          <li key={st.id} className="wk-body flex justify-between gap-2">
                            <span style={{ color: 'var(--wk-muted)' }}>Set {i + 1}</span>
                            <span className="tabular-numbers" style={{ color: 'var(--color-text-primary)' }}>
                              {secs && secs > 0
                                ? kg > 0
                                  ? `${units.format(kg)} × ${secs}s`
                                  : `${secs}s hold`
                                : kg > 0
                                ? `${units.format(kg)} × ${reps}`
                                : `${reps} reps`}
                              {st.actualRir !== undefined ? ` • ${st.actualRir} RIR` : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    {ex.athleteNotes?.trim() && (
                      <p className="wk-caption mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                        Note: {ex.athleteNotes.trim()}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}

        {isEditing && (
          <div
            className="grid grid-cols-2 gap-3 pt-3"
            style={{ borderTop: '1px solid var(--color-border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsEditing(false);
              }}
              className="wk-btn-secondary min-h-[44px] w-full justify-center"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdits}
              className="wk-button min-h-[44px] w-full flex items-center justify-center gap-2"
              style={{
                background: 'var(--color-action-primary-bg)',
                color: 'var(--color-action-primary-fg)',
              }}
            >
              <Check className="w-4 h-4 stroke-[2]" aria-hidden="true" />
              <span>Save changes</span>
            </button>
          </div>
        )}

        {!isEditing && onDeleteWorkout && (
          <div
            className="pt-3"
            style={{ borderTop: '1px solid var(--color-border-subtle)' }}
          >
            {confirmingDelete ? (
              <div className="wk-raised flex flex-col gap-3">
                <p className="wk-caption" style={{ color: 'var(--color-text-primary)' }}>
                  Remove this workout from history? Strength trends and your streak will recalculate.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setConfirmingDelete(false);
                    }}
                    className="wk-btn-secondary min-h-[44px] w-full justify-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onDeleteWorkout(session.id);
                      onClose();
                    }}
                    className="wk-button min-h-[44px] w-full flex items-center justify-center gap-1"
                    style={{
                      background: 'var(--color-status-danger-soft)',
                      color: 'var(--color-status-danger)',
                      border: '1px solid var(--color-status-danger)',
                    }}
                  >
                    <Trash2 className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                    <span>Confirm delete</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setConfirmingDelete(true);
                }}
                className="wk-btn-secondary min-h-[44px] w-full inline-flex items-center justify-center gap-2"
                style={{ color: 'var(--color-status-danger)' }}
              >
                <Trash2 className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                <span>Delete workout</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
