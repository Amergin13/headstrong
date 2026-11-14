import React from 'react';
import { ActivityLog, MIN_ACTIVE_MINUTES, SOURCE_LABELS, describeActivity } from '../../engine/activeDays';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ActiveDayCardProps {
  /** This week's active day: the activity that counted, or undefined while it's still to do. */
  thisWeek?: ActivityLog;
  /** Activities from the viewed day or last 7 days, newest first. */
  recent: ActivityLog[];
  onLog?: () => void;
  onRemove?: (id: string) => void;
  onOpenApps?: () => void;
}

/**
 * The plan's weekly active day: any ride, run, walk, swim or class of 20+ minutes. Found workouts
 * name their source and can be removed (and won't come back).
 */
export const ActiveDayCard: React.FC<ActiveDayCardProps> = ({ thisWeek, recent, onLog, onRemove, onOpenApps }) => (
  <section className="wk-card w-full text-left block" aria-labelledby="active-day-title">
    <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
      <h2 id="active-day-title" className="wk-h1" style={{ lineHeight: 1.21 }}>
        Activity
      </h2>
      <span className="wk-pill shrink-0" style={thisWeek ? { color: 'var(--wk-accent)' } : undefined}>
        {thisWeek ? 'Done this week' : 'Running, cycling & more'}
      </span>
    </div>
    <p className="wk-body" style={{ marginTop: fig(16) }}>
      {thisWeek
        ? `${describeActivity(thisWeek)[0].toUpperCase()}${describeActivity(thisWeek).slice(1)} counts as this week's active day.`
        : `Log a ${MIN_ACTIVE_MINUTES}+ minute run, bike ride, walk, swim or class, or sync automatically from your watch, Strava or Health Connect.`}
    </p>

    {recent.length > 0 && (
      <ul className="flex flex-col" style={{ marginTop: fig(24), gap: fig(14) }} aria-label="Recent activities">
        {recent.map((a) => (
          <li key={a.id} className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="min-w-0">
              <span className="block font-semibold text-white truncate" style={{ fontSize: `max(13px, ${fig(28)})` }}>
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
                      className="font-semibold underline"
                      style={{ color: 'var(--color-partner-strava)' }}
                    >
                      View on Strava
                    </a>
                  </>
                )}
              </span>
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onRemove(a.id);
                }}
                aria-label={`Remove ${describeActivity(a)}`}
                className="wk-btn-secondary shrink-0"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    )}

    {(onLog || onOpenApps) && (
      <div className="grid grid-cols-2" style={{ marginTop: fig(28), gap: fig(16) }}>
        {onLog && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onLog();
            }}
            className="wk-button"
            style={{
              background: thisWeek ? 'var(--color-action-secondary-bg)' : 'var(--color-action-primary-bg)',
              color: thisWeek ? 'var(--color-action-secondary-fg)' : 'var(--color-action-primary-fg)',
            }}
          >
            Log a session
          </button>
        )}
        {onOpenApps && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenApps();
            }}
            className="wk-button"
            style={{
              background: 'var(--color-action-secondary-bg)',
              color: 'var(--color-action-secondary-fg)',
            }}
          >
            Activity apps
          </button>
        )}
      </div>
    )}
  </section>
);
