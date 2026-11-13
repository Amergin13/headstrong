import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CustomPlanId, ProgramSplitType, SavedTrainingPlan } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ProgramPickerModalProps {
  programType: ProgramSplitType;
  /** Show the 24-workout muscle plan (owner's account only). */
  includeMusclePlan?: boolean;
  /** User-imported or saved custom programs. */
  customPlans?: SavedTrainingPlan[];
  onChangeProgram?: (program: ProgramSplitType) => void;
  onDeleteCustomPlan?: (planId: CustomPlanId) => void;
  onClose: () => void;
}

/** Built-in Treise plans. Everyone: the two starter layouts. The owner's account: the muscle plan too. */
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

/** Lets the athlete change between Treise plans and any imported spreadsheet programs. */
export const ProgramPickerModal: React.FC<ProgramPickerModalProps> = ({
  programType,
  includeMusclePlan = false,
  customPlans = [],
  onChangeProgram,
  onDeleteCustomPlan,
  onClose,
}) => {
  const customOptions = customPlans.map((p) => ({
    id: p.id as ProgramSplitType,
    customId: p.id,
    title: p.name,
    frequency: `${p.workoutsPerWeek} workouts a week • ${p.templates.length} workouts`,
    detail:
      p.phases.length > 0
        ? `${p.phases.map((ph) => ph.name).join(' · ')}. Imported from spreadsheet.`
        : p.subtitle || 'Saved custom program.',
    sessionCount: p.templates.length,
    isCustom: true,
  }));

  const builtInOptions = PLAN_OPTIONS.filter(
    (opt) => includeMusclePlan || !opt.ownerOnly || programType === opt.id
  ).map((opt) => ({
    ...opt,
    sessionCount: 24,
    isCustom: false,
    customId: undefined as CustomPlanId | undefined,
  }));

  const allOptions = [...customOptions, ...builtInOptions];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Change program"
      className="fixed inset-0 z-50 flex items-center justify-center p-[calc(38*var(--f))] bg-black/80 backdrop-blur-sm"
    >
      <div
        className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ display: 'flex', flexDirection: 'column', gap: fig(28) }}
      >
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <div>
            <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
              Change program
            </h3>
            <p
              style={{
                fontSize: `max(12px, ${fig(28)})`,
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(16),
              }}
            >
              Each program keeps its own place. Your training history always stays with you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close program picker"
            className="w-11 h-11 rounded-full text-white/70 hover:text-white flex items-center justify-center transition-colors min-h-[44px] shrink-0"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        <div className="flex flex-col" style={{ gap: fig(22) }}>
          {allOptions.map((opt) => {
            const isCurrent = programType === opt.id;
            return (
              <div
                key={opt.id}
                style={{
                  paddingTop: fig(24),
                  borderTop: '1px solid var(--color-border-subtle)',
                }}
              >
                <div className="flex items-start justify-between" style={{ gap: fig(16) }}>
                  <div className="min-w-0">
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
                  <span
                    className="wk-pill shrink-0"
                    style={
                      isCurrent
                        ? {
                            background: 'var(--color-status-positive-soft)',
                            color: 'var(--color-status-positive)',
                          }
                        : undefined
                    }
                  >
                    {isCurrent ? 'Current' : `${opt.sessionCount} sessions`}
                  </span>
                </div>

                <p className="wk-body" style={{ marginTop: fig(16) }}>
                  {opt.detail}
                </p>

                <div className="flex flex-wrap items-center" style={{ gap: fig(14), marginTop: fig(20) }}>
                  {!isCurrent && onChangeProgram && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onChangeProgram(opt.id);
                        onClose();
                      }}
                      className="wk-button flex-1"
                      style={{
                        background: 'var(--wk-accent)',
                        color: 'var(--color-text-on-accent)',
                      }}
                    >
                      Switch to {opt.title}
                    </button>
                  )}
                  {opt.isCustom && opt.customId && !isCurrent && onDeleteCustomPlan && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onDeleteCustomPlan(opt.customId!);
                      }}
                      className="wk-button"
                      style={{
                        background: 'var(--color-bg-surface-control)',
                        color: 'var(--color-text-secondary)',
                        paddingLeft: fig(28),
                        paddingRight: fig(28),
                        fontSize: `max(12px, ${fig(24)})`,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};
