import React, { useEffect, useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import { StripDay } from '../../services/sessionSchedule';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';

interface WorkoutPageHeaderProps {
  title: string;
  days: StripDay[];
  /** Selected date in the week strip, when inspecting a day's overview. */
  selectedDate?: string | null;
  onSelectDay?: (day: StripDay) => void;
  /** Secondary actions (location, rest day, last workout), shown from the "more" button. */
  renderMenu?: (close: () => void) => React.ReactNode;
}

const STATUS_TEXT: Record<StripDay['status'], string> = {
  trained: 'trained',
  planned: 'next session expected',
  rest: 'rest',
};

const DayCircle: React.FC<{ day: StripDay }> = ({ day }) => {
  const size = 24;
  if (day.status === 'trained') {
    return (
      <span
        className={`rounded-full flex items-center justify-center ${day.isToday ? 'wk-today' : ''}`}
        style={{
          width: size,
          height: size,
          background: 'var(--color-status-positive)',
          boxShadow: day.isToday ? '0 0 0 2px var(--color-bg-canvas), 0 0 0 4px var(--color-text-primary)' : undefined,
        }}
      >
        <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-text-on-accent)' }} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (day.isToday) {
    return (
      <span
        className="wk-today rounded-full flex items-center justify-center"
        style={{ width: size, height: size, border: '2px solid var(--color-text-primary)' }}
      >
        {day.status === 'planned' && (
          <span className="rounded-full w-3.5 h-3.5" style={{ background: 'var(--color-text-secondary)' }} />
        )}
      </span>
    );
  }
  if (day.status === 'planned') {
    return (
      <span
        className="rounded-full"
        style={{ width: size, height: size, background: 'var(--color-bg-surface-control)', border: '1.5px solid var(--color-text-muted)' }}
      />
    );
  }
  return <span className="rounded-full" style={{ width: size, height: size, border: '1.5px solid var(--color-border-strong)' }} />;
};

export const WorkoutPageHeader: React.FC<WorkoutPageHeaderProps> = ({ title, days, selectedDate, onSelectDay, renderMenu }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="relative pt-2">
      <div className="relative flex items-center justify-start pr-12">
        <h1 className="wk-page-title">{formatSentenceCase(title)}</h1>
        {renderMenu && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setMenuOpen((o) => !o);
            }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Workout options: location, customize workout page, rest day and last workout"
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, color: 'var(--wk-muted)' }}
          >
            <MoreHorizontal className="w-6 h-6" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        {menuOpen && renderMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={close} aria-hidden="true" />
            <div className="absolute right-0 top-full mt-2 z-30">{renderMenu(close)}</div>
          </>
        )}
      </div>

      <ol
        className="grid grid-cols-7 mx-auto w-full mt-6"
        style={{ maxWidth: 460 }}
        aria-label="This week"
      >
        {days.map((day) => {
          const selected = selectedDate === day.date;
          const label = `${day.label}${day.isToday ? ', today' : ''}: ${STATUS_TEXT[day.status]}`;
          return (
            <li
              key={day.date}
              className="flex flex-col items-center"
              aria-label={onSelectDay ? undefined : label}
            >
              {onSelectDay ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectDay(day);
                  }}
                  aria-label={label}
                  aria-pressed={selected}
                  className="flex flex-col items-center rounded-xl transition-opacity p-1 gap-3"
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    opacity: selectedDate && !selected ? 0.65 : 1,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="text-xs font-medium"
                    style={{
                      color: selected || day.isToday ? 'var(--color-text-primary)' : 'var(--wk-muted)',
                    }}
                  >
                    {day.label}
                  </span>
                  <DayCircle day={day} />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="text-xs font-medium"
                    style={{
                      color: day.isToday ? 'var(--color-text-primary)' : 'var(--wk-muted)',
                    }}
                  >
                    {day.label}
                  </span>
                  <DayCircle day={day} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </header>
  );
};
