import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ProgramSplitType } from '../../engine/types';
import { FEATURED_PROGRAM_OPTIONS, PROGRAM_OPTIONS } from '../../services/workoutGenerator';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ProgramPickerModalProps {
  programType: ProgramSplitType;
  onChangeProgram?: (program: ProgramSplitType) => void;
  onClose: () => void;
}

/** Lets the athlete switch between the 6-Week plan and the standard splits. */
export const ProgramPickerModal: React.FC<ProgramPickerModalProps> = ({ programType, onChangeProgram, onClose }) =>
  createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select Training Program"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ display: 'flex', flexDirection: 'column', gap: fig(28) }}
      >
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <div>
            <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
              Select Training Program
            </h3>
            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(16),
              }}
            >
              Choose your hypertrophy split or periodized 6-week plan
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close program selector"
            className="w-11 h-11 rounded-full text-white/70 hover:text-white flex items-center justify-center transition-colors min-h-[44px] shrink-0"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        <div className="flex flex-col" style={{ gap: fig(22) }}>
          {[...FEATURED_PROGRAM_OPTIONS, ...PROGRAM_OPTIONS].map((opt) => {
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
                        fontSize: fig(26),
                        lineHeight: 1.21,
                        color: 'var(--wk-muted)',
                        marginTop: fig(8),
                      }}
                    >
                      {opt.frequency}
                    </p>
                  </div>
                  <span className="wk-pill shrink-0">
                    {isCurrent ? 'ACTIVE' : opt.badge || 'SPLIT'}
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
                    Switch to {opt.title}
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
