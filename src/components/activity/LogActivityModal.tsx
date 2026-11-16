import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ACTIVITY_LABELS, ActivityType, MIN_ACTIVE_MINUTES } from '../../engine/activeDays';
import { triggerHaptic } from '../../utils/haptics';

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
    padding: '0 16px',
    borderRadius: 9999,
    fontWeight: 500,
    fontSize: 16,
    background: selected ? 'var(--color-action-primary-bg)' : 'var(--wk-raised)',
    border: `1px solid ${selected ? 'var(--color-action-primary-bg)' : 'var(--color-border-strong)'}`,
    color: selected ? 'var(--color-action-primary-fg)' : 'var(--color-text-primary)',
  });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-activity-title"
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="log-activity-title" className="wk-h1 leading-tight">
              Log active session
            </h3>
            <p className="wk-body mt-2">
              {MIN_ACTIVE_MINUTES} minutes or more counts as an active day.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center shrink-0"
            style={{
              background: 'var(--wk-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="wk-label mb-2">
            What did you do?
          </legend>
          <div className="flex flex-wrap gap-2">
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

        <fieldset className="mt-5">
          <legend className="wk-label mb-2">
            How long?
          </legend>
          <div className="flex flex-wrap items-center gap-2">
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
            <label className="flex items-center gap-2">
              <span className="sr-only">Other number of minutes</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                placeholder="Other"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="text-center outline-none tabular-nums"
                style={{
                  width: 88,
                  minHeight: 44,
                  borderRadius: 9999,
                  background: 'var(--wk-raised)',
                  border: `1px solid ${custom ? 'var(--color-text-primary)' : 'var(--color-border-strong)'}`,
                  color: 'var(--color-text-primary)',
                  fontSize: 16,
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
          className="wk-button mt-5"
          style={{
            background: valid ? 'var(--color-action-primary-bg)' : 'var(--color-action-disabled-bg)',
            color: valid ? 'var(--color-action-primary-fg)' : 'var(--color-action-disabled-fg)',
          }}
        >
          Save
        </button>
      </div>
    </div>,
    document.body
  );
};
