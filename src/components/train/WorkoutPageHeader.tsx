import React from 'react';
import { Check } from 'lucide-react';
import { StripDay } from '../../services/sessionSchedule';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';
import { OverflowMenu, OverflowMenuItem } from '../common/Header';

interface WorkoutPageHeaderProps {
  title: string;
  days: StripDay[];
  /** Selected date in the week strip, when inspecting a day's overview. */
  selectedDate?: string | null;
  onSelectDay?: (day: StripDay) => void;
  /** Unified overflow menu items rendered from the canonical 44x44 header menu. */
  menuItems?: OverflowMenuItem[];
}

const STATUS_TEXT: Record<StripDay['status'], string> = {
  trained: 'completed workout',
  planned: 'upcoming workout',
  rest: 'rest day',
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

export const WorkoutPageHeader: React.FC<WorkoutPageHeaderProps> = ({ title, days, selectedDate, onSelectDay, menuItems }) => {
  return (
    <header className="relative pt-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="wk-page-title">{formatSentenceCase(title)}</h1>
        {menuItems && menuItems.length > 0 && (
          <OverflowMenu
            triggerAriaLabel="Workout options: location, customize workout page, rest day and last workout"
            menuAriaLabel="Workout options"
            items={menuItems}
          />
        )}
      </div>

      <ol
        className="grid grid-cols-7 mx-auto w-full mt-6"
        style={{ maxWidth: 460 }}
        aria-label="This week"
      >
        {days.map((day) => {
          const selected = selectedDate === day.date;
          // Only active (today), completed program workouts, and upcoming program sessions are selectable.
          const isSelectable = Boolean(
            onSelectDay &&
              (day.isToday ||
                day.status === 'trained' ||
                (day.status === 'planned' && Boolean(day.plannedSession)))
          );
          const label = `${day.label}${day.isToday ? ', today' : ''}: ${STATUS_TEXT[day.status]}`;
          return (
            <li
              key={day.date}
              className="flex flex-col items-center"
              aria-label={isSelectable ? undefined : label}
            >
              {isSelectable && onSelectDay ? (
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
                    className="wk-meta-title"
                    style={{
                      color: selected || day.isToday ? 'var(--color-text-primary)' : 'var(--wk-muted)',
                    }}
                  >
                    {day.label}
                  </span>
                  <DayCircle day={day} />
                </button>
              ) : (
                <div
                  className="flex flex-col items-center p-1 gap-3"
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    opacity: selectedDate ? 0.55 : 1,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="wk-meta-title"
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
