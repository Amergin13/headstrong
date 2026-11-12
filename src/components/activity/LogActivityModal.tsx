import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ACTIVITY_LABELS, ActivityType, MIN_ACTIVE_MINUTES } from '../../engine/activeDays';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

const TYPES: ActivityType[] = ['walk', 'run', 'cycle', 'swim', 'class', 'sport', 'row', 'elliptical', 'hike', 'strength', 'other'];
const MINUTES = [20, 30, 45, 60];

interface LogActivityModalProps {
  onLog: (type: ActivityType, minutes: number) => void;
  onClose: () => void;
}

/** Log an active-day session by hand: what it was and how long. */
export const LogActivityModal: React.FC<LogActivityModalProps> = ({ onLog, onClose }) => {
  const [type, setType] = useState<ActivityType>('walk');
  const [minutes, setMinutes] = useState<number>(30);
  const [custom, setCustom] = useState('');
  const effectiveMinutes = custom ? parseInt(custom, 10) || 0 : minutes;
  const valid = effectiveMinutes > 0 && effectiveMinutes <= 600;

  const chip = (selected: boolean): React.CSSProperties => ({
    minHeight: 44,
    padding: `0 ${fig(30)}`,
    borderRadius: 999,
    fontWeight: 700,
    fontSize: `max(13px, ${fig(28)})`,
    background: selected ? 'rgba(0,241,159,0.12)' : 'var(--wk-raised)',
    border: `2px solid ${selected ? 'var(--wk-accent)' : 'transparent'}`,
    color: '#fff',
  });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-activity-title"
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-[calc(38*var(--f))] bg-black/80 backdrop-blur-sm"
    >
      <div className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <div>
            <h3 id="log-activity-title" className="wk-h1" style={{ lineHeight: 1.21 }}>
              Log active session
            </h3>
            <p className="wk-body" style={{ marginTop: fig(12) }}>
              {MIN_ACTIVE_MINUTES} minutes or more counts as an active day.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white shrink-0"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        <fieldset style={{ marginTop: fig(36) }}>
          <legend className="wk-label" style={{ marginBottom: fig(16) }}>
            What did you do?
          </legend>
          <div className="flex flex-wrap" style={{ gap: fig(14) }}>
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => {
                  triggerHaptic('light');
                  setType(t);
                }}
                style={chip(type === t)}
              >
                {ACTIVITY_LABELS[t]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ marginTop: fig(36) }}>
          <legend className="wk-label" style={{ marginBottom: fig(16) }}>
            How long?
          </legend>
          <div className="flex flex-wrap items-center" style={{ gap: fig(14) }}>
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={!custom && minutes === m}
                onClick={() => {
                  triggerHaptic('light');
                  setCustom('');
                  setMinutes(m);
                }}
                style={chip(!custom && minutes === m)}
              >
                {m} min
              </button>
            ))}
            <label className="flex items-center" style={{ gap: fig(10) }}>
              <span className="sr-only">Other number of minutes</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                placeholder="Other"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="text-white text-center outline-none"
                style={{
                  width: 88,
                  minHeight: 44,
                  borderRadius: 999,
                  background: 'var(--wk-raised)',
                  border: `2px solid ${custom ? 'var(--wk-accent)' : 'transparent'}`,
                  fontSize: `max(14px, ${fig(28)})`,
                }}
              />
              <span className="wk-body">min</span>
            </label>
          </div>
        </fieldset>

        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            triggerHaptic('success');
            onLog(type, effectiveMinutes);
            onClose();
          }}
          className="wk-button"
          style={{
            marginTop: fig(40),
            background: valid ? 'var(--wk-accent)' : 'var(--wk-raised)',
            color: valid ? '#13181C' : 'var(--wk-muted)',
          }}
        >
          Save
        </button>
      </div>
    </div>,
    document.body
  );
};
