import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Layers, MoreHorizontal, Plus } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface ProgramHeaderMenuProps {
  onOpenImportSpreadsheet: () => void;
  onOpenChangeProgram: () => void;
  onOpenCreateExercise?: () => void;
}

/**
 * 3-dots overflow menu for the Program page header (matches Workout & Progress headers):
 * opens actions to import a program from a spreadsheet, switch programs, or add a custom exercise.
 */
export const ProgramHeaderMenu: React.FC<ProgramHeaderMenuProps> = ({
  onOpenImportSpreadsheet,
  onOpenChangeProgram,
  onOpenCreateExercise,
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setOpen((o) => !o);
        }}
        aria-label="Program options: import from spreadsheet and change program"
        aria-haspopup="menu"
        aria-expanded={open}
        className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
        style={{ width: 44, height: 44, color: 'var(--wk-muted)' }}
      >
        <MoreHorizontal className="w-6 h-6" strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 z-30">
            <div
              role="menu"
              aria-label="Program options"
              className="w-60 rounded-2xl bg-surface-card border shadow-2xl p-2 space-y-1 text-left"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  triggerHaptic('light');
                  setOpen(false);
                  onOpenImportSpreadsheet();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center gap-2 min-h-[44px]"
                style={{ color: 'var(--color-text-primary)' }}
              >
                <FileSpreadsheet className="w-4 h-4 stroke-[2] shrink-0" aria-hidden="true" />
                <span>Import from spreadsheet</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  triggerHaptic('light');
                  setOpen(false);
                  onOpenChangeProgram();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center gap-2 min-h-[44px]"
                style={{ color: 'var(--color-text-primary)' }}
              >
                <Layers className="w-4 h-4 stroke-[2] shrink-0" aria-hidden="true" />
                <span>Change program</span>
              </button>

              {onOpenCreateExercise && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    triggerHaptic('light');
                    setOpen(false);
                    onOpenCreateExercise();
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center gap-2 min-h-[44px]"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  <Plus className="w-4 h-4 stroke-[2] shrink-0" aria-hidden="true" />
                  <span>Add custom exercise</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
