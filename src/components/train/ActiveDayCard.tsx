import React from 'react';
import { ActivityLog, MIN_ACTIVE_MINUTES, SOURCE_LABELS, describeActivity } from '../../engine/activeDays';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ActiveDayCardProps {
  /** This week's active day: the activity that counted, or undefined while it's still to do. */
  thisWeek?: ActivityLog;
  /** Activities from the last 7 days, newest first. */
  recent: ActivityLog[];
  onLog: () => void;
  onRemove: (id: string) => void;
  onOpenApps: () => void;
}

/**
 * The plan's weekly active day: any ride, run, walk, swim or class of 20+ minutes. Found workouts
 * name their source and can be removed (and won't come back).
 */
export const ActiveDayCard: React.FC<ActiveDayCardProps> = ({ thisWeek, recent, onLog, onRemove, onOpenApps }) => (
  <section className="wk-card w-full text-left block" aria-labelledby="active-day-title">
    <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
      <h2 id="active-day-title" className="wk-h1" style={{ lineHeight: 1.21 }}>
        Active day
      </h2>
      <span className="wk-pill shrink-0" style={thisWeek ? { color: 'var(--wk-accent)' } : undefined}>
        {thisWeek ? 'Done this week' : 'To do this week'}
      </span>
    </div>
    <p className="wk-body" style={{ marginTop: fig(16) }}>
      {thisWeek
        ? `${describeActivity(thisWeek)[0].toUpperCase()}${describeActivity(thisWeek).slice(1)} counts as this week's active day.`
        : `One ${MIN_ACTIVE_MINUTES}+ minute ride, run, walk, swim or class each week. Your watch or Health Connect can add it for you.`}
    </p>

    {recent.length > 0 && (
      <ul className="flex flex-col" style={{ marginTop: fig(24), gap: fig(14) }} aria-label="Recent activities">
        {recent.map((a) => (
          <li key={a.id} className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="min-w-0">
              <span className="block font-bold text-white truncate" style={{ fontSize: `max(13px, ${fig(28)})` }}>
                {describeActivity(a)}
              </span>
              <span className="block" style={{ fontSize: `max(12px, ${fig(24)})`, color: 'var(--wk-muted)' }}>
                {SOURCE_LABELS[a.source]}
                {a.source === 'strava' && a.externalId && (
                  <>
                    {' · '}
                    <a
                      href={`https://www.strava.com/activities/${a.externalId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline"
                      style={{ color: '#FC5200' }}
                    >
                      View on Strava
                    </a>
                  </>
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onRemove(a.id);
              }}
              aria-label={`Remove ${describeActivity(a)}`}
              className="shrink-0 font-semibold text-white/70 hover:text-white"
              style={{ minHeight: 44, padding: `0 ${fig(16)}`, fontSize: `max(12px, ${fig(26)})` }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    )}

    <div className="grid grid-cols-2" style={{ marginTop: fig(28), gap: fig(16) }}>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onLog();
        }}
        className="wk-button"
        style={{ background: thisWeek ? 'var(--wk-raised)' : 'var(--wk-accent)', color: thisWeek ? '#fff' : '#13181C' }}
      >
        Log a session
      </button>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onOpenApps();
        }}
        className="wk-button"
        style={{ background: 'var(--wk-raised)', color: '#fff' }}
      >
        Activity apps
      </button>
    </div>
  </section>
);
