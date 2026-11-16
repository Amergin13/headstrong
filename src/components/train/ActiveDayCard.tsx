import React from 'react';
import { ActivityLog, MIN_ACTIVE_MINUTES, SOURCE_LABELS, describeActivity } from '../../engine/activeDays';
import { triggerHaptic } from '../../utils/haptics';

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
    <div className="flex items-start justify-between gap-3">
      <h2 id="active-day-title" className="wk-h1">
        Activity
      </h2>
      <span
        className="wk-pill shrink-0"
        style={thisWeek ? { background: 'var(--color-status-positive-soft)', color: 'var(--wk-accent)' } : undefined}
      >
        {thisWeek ? 'Done this week' : 'Running, cycling & more'}
      </span>
    </div>
    <p className="wk-body mt-2 max-w-prose">
      {thisWeek
        ? `${describeActivity(thisWeek)[0].toUpperCase()}${describeActivity(thisWeek).slice(1)} counts as this week's active day.`
        : `Log a ${MIN_ACTIVE_MINUTES}+ minute run, bike ride, walk, swim or class, or sync automatically from your watch, Strava or Health Connect.`}
    </p>

    {recent.length > 0 && (
      <ul className="flex flex-col mt-3 gap-2" aria-label="Recent activities">
        {recent.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="wk-subhead block truncate">
                {describeActivity(a)}
              </span>
              <span className="wk-caption block">
                {SOURCE_LABELS[a.source]}
                {a.source === 'strava' && a.externalId && (
                  <>
                    {' · '}
                    <a
                      href={`https://www.strava.com/activities/${a.externalId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                      style={{ color: 'var(--color-text-primary)' }}
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
      <div className="grid grid-cols-2 mt-4 gap-2">
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
              border: thisWeek ? '1px solid var(--color-border-strong)' : undefined,
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
              border: '1px solid var(--color-border-strong)',
            }}
          >
            Activity apps
          </button>
        )}
      </div>
    )}
  </section>
);
