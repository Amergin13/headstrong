import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CustomPlanId, ProgramSplitType, SavedTrainingPlan } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';

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
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="wk-h1 leading-tight">
              Change program
            </h3>
            <p className="wk-body mt-2">
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

        <div className="flex flex-col gap-3">
          {allOptions.map((opt) => {
            const isCurrent = programType === opt.id;
            return (
              <div
                key={opt.id}
                className="pt-3"
                style={{ borderTop: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="wk-subhead leading-tight">
                      {formatSentenceCase(opt.title)}
                    </div>
                    <p className="wk-caption mt-1">
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

                <p className="wk-body mt-2 max-w-prose">
                  {opt.detail}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-3">
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
                        background: 'var(--color-action-primary-bg)',
                        color: 'var(--color-action-primary-fg)',
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
                      className="wk-btn-secondary"
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
