import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Layers, MoreHorizontal } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ProgramHeaderMenuProps {
  onOpenImportSpreadsheet: () => void;
  onOpenChangeProgram: () => void;
}

/**
 * 3-dots overflow menu for the Program page header (matches Workout & Progress headers):
 * opens actions to import a program from a spreadsheet or switch between Treise and saved programs.
 */
export const ProgramHeaderMenu: React.FC<ProgramHeaderMenuProps> = ({
  onOpenImportSpreadsheet,
  onOpenChangeProgram,
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
        <MoreHorizontal style={{ width: fig(48), height: fig(48) }} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 z-30">
            <div
              role="menu"
              aria-label="Program options"
              className="w-60 rounded-2xl bg-surface-card border border-white/[0.08] shadow-2xl p-1.5 space-y-1 text-left"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  triggerHaptic('light');
                  setOpen(false);
                  onOpenImportSpreadsheet();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-white/85 hover:text-white hover:bg-white/[0.06] flex items-center gap-2.5 min-h-[44px]"
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
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-white/85 hover:text-white hover:bg-white/[0.06] flex items-center gap-2.5 min-h-[44px]"
              >
                <Layers className="w-4 h-4 stroke-[2] shrink-0" aria-hidden="true" />
                <span>Change program</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};
