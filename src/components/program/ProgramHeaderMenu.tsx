import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Layers, MoreVertical } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ProgramHeaderMenuProps {
  onOpenImportSpreadsheet: () => void;
  onOpenChangeProgram: () => void;
}

/**
 * 3-dots overflow menu for the Program page header: opens actions to import a program from a
 * spreadsheet or switch between Treise's built-in and saved programs.
 */
export const ProgramHeaderMenu: React.FC<ProgramHeaderMenuProps> = ({
  onOpenImportSpreadsheet,
  onOpenChangeProgram,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const itemStyle: React.CSSProperties = {
    fontSize: `max(13px, ${fig(26)})`,
    color: 'var(--color-text-primary)',
    lineHeight: 1.25,
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setOpen((prev) => !prev);
        }}
        aria-label="Program options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors"
        style={{
          background: open ? 'var(--color-bg-surface-raised)' : 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
        }}
      >
        <MoreVertical className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Program options"
          className="absolute right-0 z-40 overflow-hidden shadow-2xl"
          style={{
            marginTop: fig(12),
            minWidth: 'min(82vw, 272px)',
            background: 'var(--color-bg-surface-elevated)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: fig(28),
            padding: fig(10),
            display: 'flex',
            flexDirection: 'column',
            gap: fig(4),
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              triggerHaptic('light');
              setOpen(false);
              onOpenImportSpreadsheet();
            }}
            className="w-full min-h-[44px] flex items-center text-left transition-colors hover:bg-white/5"
            style={{
              ...itemStyle,
              gap: fig(18),
              padding: `${fig(16)} ${fig(20)}`,
              borderRadius: fig(20),
            }}
          >
            <FileSpreadsheet
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--color-status-info)' }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Import program from spreadsheet</span>
              <span
                className="block"
                style={{ fontSize: `max(12px, ${fig(21)})`, color: 'var(--wk-muted)', marginTop: fig(4) }}
              >
                Upload CSV or paste sheet data
              </span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              triggerHaptic('light');
              setOpen(false);
              onOpenChangeProgram();
            }}
            className="w-full min-h-[44px] flex items-center text-left transition-colors hover:bg-white/5"
            style={{
              ...itemStyle,
              gap: fig(18),
              padding: `${fig(16)} ${fig(20)}`,
              borderRadius: fig(20),
            }}
          >
            <Layers
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--color-accent-primary)' }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Change program</span>
              <span
                className="block"
                style={{ fontSize: `max(12px, ${fig(21)})`, color: 'var(--wk-muted)', marginTop: fig(4) }}
              >
                Switch between Treise &amp; saved plans
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
