import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { WorkoutSession } from '../../engine/types';
import { planWorkoutLabel } from '../../engine/muscleBuildingProgram';
import { useUnits } from '../../utils/unitsContext';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface PastWorkoutModalProps {
  workoutNumber: number;
  title: string;
  session: WorkoutSession;
  onClose: () => void;
}

function formatSessionDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Read-only record of a completed plan workout: the working sets the athlete logged. */
export const PastWorkoutModal: React.FC<PastWorkoutModalProps> = ({ workoutNumber, title, session, onClose }) => {
  const units = useUnits();
  // Close on a tap that starts on the backdrop, not on the tail of the tap that opened the sheet.
  const pressedBackdrop = useRef(false);
  const exercises = session.exercises
    .map((ex) => ({ ex, sets: ex.sets.filter((st) => st.completed && !st.isWarmup) }))
    .filter((e) => e.sets.length > 0);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Workout ${workoutNumber}, ${planWorkoutLabel(title)}`}
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="wk-card w-full max-w-lg max-h-[85vh] overflow-y-auto"
        style={{ display: 'flex', flexDirection: 'column', gap: fig(28) }}
      >
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <div>
            <h3 className="wk-h1 uppercase" style={{ lineHeight: 1.21 }}>
              {workoutNumber}. {planWorkoutLabel(title)}
            </h3>
            <p className="wk-body" style={{ marginTop: fig(10), color: 'var(--wk-muted)' }}>
              {formatSessionDate(session.date)}
              {session.durationMinutes ? ` • ${session.durationMinutes} min` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close workout"
            className="w-11 h-11 rounded-full text-white/70 hover:text-white flex items-center justify-center transition-colors shrink-0"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {exercises.length === 0 ? (
          <p className="wk-body">No working sets were logged in this workout.</p>
        ) : (
          exercises.map(({ ex, sets }) => (
            <div
              key={ex.id}
              style={{ paddingTop: fig(24), borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="wk-label" style={{ lineHeight: 1.21 }}>
                {ex.name}
              </div>
              <ol className="flex flex-col" style={{ marginTop: fig(14), gap: fig(8) }}>
                {sets.map((st, i) => {
                  const kg = st.actualWeightKg ?? st.targetWeightKg;
                  const reps = st.actualReps ?? st.targetReps;
                  return (
                    <li key={st.id} className="wk-body flex justify-between" style={{ gap: fig(16) }}>
                      <span style={{ color: 'var(--wk-muted)' }}>Set {i + 1}</span>
                      <span className="text-white">
                        {kg > 0 ? `${units.format(kg)} × ${reps}` : `${reps} reps`}
                        {st.actualRir !== undefined ? ` • ${st.actualRir} RIR` : ''}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  );
};
