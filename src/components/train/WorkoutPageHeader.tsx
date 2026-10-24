import React, { useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import { StripDay } from '../../services/sessionSchedule';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface WorkoutPageHeaderProps {
  title: string;
  days: StripDay[];
  /** Secondary actions (location, rest day, last workout), shown from the "more" button. */
  renderMenu?: (close: () => void) => React.ReactNode;
}

const STATUS_TEXT: Record<StripDay['status'], string> = {
  trained: 'trained',
  planned: 'next session expected',
  rest: 'rest',
};

const DayCircle: React.FC<{ day: StripDay }> = ({ day }) => {
  const size = fig(48);
  const stroke = fig(3);
  if (day.status === 'trained') {
    return (
      <span
        className="rounded-full flex items-center justify-center"
        style={{
          width: size,
          height: size,
          background: 'var(--wk-accent)',
          boxShadow: day.isToday ? `0 0 0 ${fig(4)} #13181C, 0 0 0 ${fig(7)} #fff` : undefined,
        }}
      >
        <Check style={{ width: fig(28), height: fig(28), color: '#13181C' }} strokeWidth={3.5} aria-hidden="true" />
      </span>
    );
  }
  if (day.isToday) {
    return (
      <span
        className="rounded-full flex items-center justify-center"
        style={{ width: size, height: size, border: `${stroke} solid #fff` }}
      >
        {day.status === 'planned' && (
          <span className="rounded-full" style={{ width: fig(30), height: fig(30), background: '#8D9397' }} />
        )}
      </span>
    );
  }
  if (day.status === 'planned') {
    return (
      <span
        className="rounded-full"
        style={{ width: size, height: size, background: '#5A6064', border: `${stroke} solid #7C8286` }}
      />
    );
  }
  return <span className="rounded-full" style={{ width: size, height: size, border: `${stroke} solid rgba(255,255,255,0.45)` }} />;
};

export const WorkoutPageHeader: React.FC<WorkoutPageHeaderProps> = ({ title, days, renderMenu }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <header className="relative" style={{ paddingTop: fig(20) }}>
      <div className="relative flex items-center justify-center">
        <h1 className="font-bold text-white uppercase text-center" style={{ fontSize: fig(26), letterSpacing: '0.02em' }}>
          {title}
        </h1>
        {renderMenu && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setMenuOpen((o) => !o);
            }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Workout options: location, rest day and last workout"
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, color: 'var(--wk-muted)' }}
          >
            <MoreHorizontal style={{ width: fig(48), height: fig(48) }} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        {menuOpen && renderMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={close} />
            <div className="absolute right-0 top-full mt-2 z-30">{renderMenu(close)}</div>
          </>
        )}
      </div>

      <ol
        className="grid grid-cols-7 mx-auto"
        style={{ width: `min(${fig(7 * 131)}, 100%)`, marginTop: fig(52) }}
        aria-label="This week"
      >
        {days.map((day) => (
          <li
            key={day.date}
            className="flex flex-col items-center"
            style={{ gap: fig(26) }}
            aria-label={`${day.label}${day.isToday ? ', today' : ''}: ${STATUS_TEXT[day.status]}`}
          >
            <span
              aria-hidden="true"
              style={{
                fontSize: fig(22),
                fontWeight: day.isToday ? 700 : 600,
                color: day.isToday ? '#fff' : 'var(--wk-muted)',
              }}
            >
              {day.label}
            </span>
            <DayCircle day={day} />
          </li>
        ))}
      </ol>
    </header>
  );
};
