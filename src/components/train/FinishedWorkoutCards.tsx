import React from 'react';
import { CompletedExerciseSummary, WorkoutFinish } from '../../services/workoutFinish';
import { localDateString } from '../../utils/date';
import { formatSentenceCase } from '../../utils/typography';
import { useUnits } from '../../utils/unitsContext';
import { TrendChart } from '../common/TrendChart';
import { useWorkoutSummaryText } from './useWorkoutSummaryText';

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="wk-label" style={{ color: 'var(--wk-muted)' }}>
      {label}
    </dt>
    <dd className="wk-display leading-none mt-1">
      {value}
    </dd>
  </div>
);

/** "Today's workout finished": the same summary as the finish screen, with volume and sets. */
export const FinishedWorkoutSummaryCard: React.FC<{ finish: WorkoutFinish }> = ({ finish }) => {
  const units = useUnits();
  const summary = useWorkoutSummaryText(finish);
  const { session } = finish.report;
  return (
    <section className="wk-card" aria-labelledby="finished-workout-title">
      <h2 id="finished-workout-title" className="wk-title">
        Today&apos;s workout finished
      </h2>
      <p className="wk-body mt-2 max-w-prose" aria-live="polite">
        <span key={summary} className="wk-text-swap">
          {summary}
        </span>
      </p>
      <dl className="flex flex-wrap gap-12 mt-5">
        <Stat label={`Volume (${units.unit})`} value={Math.round(units.toDisplay(session.volumeKg)).toLocaleString()} />
        <Stat label="Sets" value={`${session.workingSets}`} />
      </dl>
    </section>
  );
};

export interface WhoopStrainCardProps {
  workoutStrain?: number;
  dayStrain?: number;
  avgHr?: number;
  maxHr?: number;
  isSyncing?: boolean;
  isPendingScore?: boolean;
  hasLiveConnection?: boolean;
  onRetry?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/** Cardio strain card shown on workout completion when external telemetry is configured. */
export const WhoopStrainCard: React.FC<WhoopStrainCardProps> = ({
  workoutStrain,
  dayStrain,
  avgHr,
  maxHr,
  isSyncing = false,
  isPendingScore = false,
  hasLiveConnection = false,
  onRetry,
  className = '',
  style,
}) => {
  const hasWorkoutStrain = typeof workoutStrain === 'number' && workoutStrain > 0;
  const hasDayStrain = typeof dayStrain === 'number' && dayStrain > 0;
  const hasAvgHr = typeof avgHr === 'number' && avgHr > 0;
  const hasMaxHr = typeof maxHr === 'number' && maxHr > 0;

  let note = 'Whoop strain from your imported export will appear here once recorded for this session.';
  if (isSyncing) {
    note = 'Checking Whoop for this workout’s cardiovascular strain…';
  } else if (hasWorkoutStrain) {
    note = 'Recorded from your Whoop band for this workout.';
  } else if (isPendingScore) {
    note = 'Whoop is still scoring this workout. Treise will pick it up automatically once scored.';
  } else if (hasLiveConnection) {
    note = 'Waiting on Whoop workout telemetry. Treise checks in the background for up to 12 hours.';
  }

  return (
    <section className={`wk-card ${className}`.trim()} style={style} aria-label="Whoop strain summary">
      <div className="flex items-center justify-between gap-3">
        <h3 className="wk-title">
          Whoop strain
        </h3>
        {isSyncing ? (
          <span className="wk-pill" style={{ background: 'var(--color-status-positive-soft)', color: 'var(--wk-accent)' }}>
            Syncing…
          </span>
        ) : hasLiveConnection && onRetry && !hasWorkoutStrain ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Refresh Whoop workout strain"
            className="wk-btn-secondary wk-tap"
            style={{ minHeight: 44 }}
          >
            Refresh
          </button>
        ) : hasWorkoutStrain ? (
          <span className="wk-pill" style={{ background: 'var(--color-status-positive-soft)', color: 'var(--wk-accent)' }}>
            Whoop
          </span>
        ) : null}
      </div>

      <dl className="flex flex-wrap gap-8 mt-5">
        <div>
          <dt className="wk-label" style={{ color: 'var(--wk-muted)' }}>
            Workout strain
          </dt>
          <dd className="wk-display leading-none mt-1">
            {hasWorkoutStrain ? workoutStrain.toFixed(1) : '—'}
            {hasWorkoutStrain && (
              <span className="wk-caption ml-2" style={{ color: 'var(--wk-muted)' }}>
                / 21
              </span>
            )}
          </dd>
        </div>
        {hasDayStrain && (
          <Stat label="Day strain" value={dayStrain.toFixed(1)} />
        )}
      </dl>

      {(hasAvgHr || hasMaxHr) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {hasAvgHr && (
            <span className="wk-pill">
              Avg HR {Math.round(avgHr)} bpm
            </span>
          )}
          {hasMaxHr && (
            <span className="wk-pill">
              Peak HR {Math.round(maxHr)} bpm
            </span>
          )}
        </div>
      )}

      <p className="wk-caption mt-3">
        {note}
      </p>
    </section>
  );
};

/** One exercise from today's finished workout: what it did, and its progress over time. */
export const CompletedExerciseCard: React.FC<{ summary: CompletedExerciseSummary }> = ({ summary }) => {
  const units = useUnits();
  const { history } = summary;
  return (
    <section aria-label={`${summary.exerciseName}${summary.isPersonalBest ? ', personal best' : ''}`} className="wk-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="wk-h1 min-w-0">{formatSentenceCase(summary.exerciseName)}</h3>
        {summary.isPersonalBest && (
          <span
            className="wk-pill shrink-0"
            style={{ background: 'var(--color-status-positive-soft)', color: 'var(--wk-accent)' }}
          >
            Personal best
          </span>
        )}
      </div>
      {summary.chip && (
        <div className="mt-2">
          <span className="wk-pill">{summary.chip}</span>
        </div>
      )}
      <div className="wk-body flex flex-col gap-1 mt-4 max-w-prose">
        {summary.lines.map((line, i) => (
          <p key={i} className="m-0">
            {line}
          </p>
        ))}
      </div>
      {summary.athleteNotes && (
        <p className="wk-caption mt-3 max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
          Session note: {summary.athleteNotes}
        </p>
      )}
        <div className="mt-3">
          <TrendChart
            points={history.map((h) => ({ date: localDateString(new Date(h.at)), value: h.value ?? h.e1rmKg }))}
            format={(v) => (summary.timed ? `${Math.round(v)}s` : units.formatPrecise(v))}
            height={240}
            emptyTitle="No history yet"
            emptyMessage="Your progress appears here once sessions are saved."
            label={
              history.length >= 2
                ? `${summary.timed ? 'Hold time' : 'Estimated one-rep max'} over your last ${history.length} sessions, ending today: ${
                    summary.timed ? `${Math.round(history[0].value ?? history[0].e1rmKg)}s` : units.formatPrecise(history[0].e1rmKg)
                  } to ${
                    summary.timed
                      ? `${Math.round(history[history.length - 1].value ?? history[history.length - 1].e1rmKg)}s`
                      : units.formatPrecise(history[history.length - 1].e1rmKg)
                  }`
                : history.length === 1
                ? `Starting point set today: ${
                    summary.timed ? `${Math.round(history[0].value ?? history[0].e1rmKg)}s` : units.formatPrecise(history[0].e1rmKg)
                  }. The trend line starts after your next session.`
                : 'Empty chart. Your progress for this exercise appears here after your first session.'
            }
          />
        </div>
    </section>
  );
};
