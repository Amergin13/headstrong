import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ProgramSplitType } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ProgramPickerModalProps {
  programType: ProgramSplitType;
  /** Show the 24-workout muscle plan (owner's account only). */
  includeMusclePlan?: boolean;
  onChangeProgram?: (program: ProgramSplitType) => void;
  onClose: () => void;
}

/** The plans to choose from. Everyone: the two starter layouts. The owner's account: the muscle plan too. */
const PLAN_OPTIONS: { id: ProgramSplitType; title: string; frequency: string; detail: string; ownerOnly?: boolean }[] = [
  {
    id: 'starter_6wk',
    title: 'Lift 3 days + 1 active day',
    frequency: '3 full-body workouts and 1 ride, run, walk or class a week',
    detail: 'Sets, reps and effort are set for your goal and build over three 2-week phases.',
  },
  {
    id: 'starter_4day',
    title: 'Lift 4 days',
    frequency: '4 shorter upper and lower body workouts a week',
    detail: 'The same weekly sets for each muscle, spread over 4 shorter workouts.',
  },
  {
    id: 'muscle_building_6wk',
    title: '6-week muscle plan',
    frequency: '4 workouts a week • 24 workouts',
    detail: 'Supersets, then rest-pause and drop sets, then giant sets, with a weekly leg day.',
    ownerOnly: true,
  },
];

/** Lets the athlete change how they run their 6-week plan. */
export const ProgramPickerModal: React.FC<ProgramPickerModalProps> = ({ programType, includeMusclePlan = false, onChangeProgram, onClose }) =>
  createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Change plan"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ display: 'flex', flexDirection: 'column', gap: fig(28) }}
      >
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <div>
            <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
              Change plan
            </h3>
            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(16),
              }}
            >
              Each way keeps its own place in the plan. Your history stays with you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close plan picker"
            className="w-11 h-11 rounded-full text-white/70 hover:text-white flex items-center justify-center transition-colors min-h-[44px] shrink-0"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        <div className="flex flex-col" style={{ gap: fig(22) }}>
          {PLAN_OPTIONS.filter((opt) => includeMusclePlan || !opt.ownerOnly).map((opt) => {
            const isCurrent = programType === opt.id;
            return (
              <div
                key={opt.id}
                style={{
                  paddingTop: fig(24),
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-start justify-between" style={{ gap: fig(16) }}>
                  <div>
                    <div className="wk-label" style={{ lineHeight: 1.21 }}>
                      {opt.title}
                    </div>
                    <p
                      style={{
                        fontSize: `max(12px, ${fig(26)})`,
                        lineHeight: 1.21,
                        color: 'var(--wk-muted)',
                        marginTop: fig(8),
                      }}
                    >
                      {opt.frequency}
                    </p>
                  </div>
                  <span className="wk-pill shrink-0">
                    {isCurrent ? 'Current' : '24 sessions'}
                  </span>
                </div>

                <p className="wk-body" style={{ marginTop: fig(16) }}>
                  {opt.detail}
                </p>

                {!isCurrent && onChangeProgram && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onChangeProgram(opt.id);
                      onClose();
                    }}
                    className="wk-button"
                    style={{
                      marginTop: fig(20),
                      background: 'var(--wk-accent)',
                      color: '#13181C',
                    }}
                  >
                    Switch to {opt.title.toLowerCase()}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  ,
    document.body
  );
