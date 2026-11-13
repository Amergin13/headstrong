import React from 'react';
import { CompletedExerciseSummary, WorkoutFinish } from '../../services/workoutFinish';
import { localDateString } from '../../utils/date';
import { useUnits } from '../../utils/unitsContext';
import { TrendChart } from '../common/TrendChart';
import { useWorkoutSummaryText } from './useWorkoutSummaryText';

const fig = (px: number) => `calc(${px} * var(--f))`;
const text = (px: number) => `max(12px, ${fig(px)})`;

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="uppercase" style={{ fontSize: text(26), lineHeight: 1.21, color: 'var(--wk-muted)' }}>
      {label}
    </dt>
    <dd className="font-bold text-white tabular-numbers" style={{ fontSize: text(64), lineHeight: 1, marginTop: fig(12) }}>
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
      <h2 id="finished-workout-title" className="wk-label" style={{ lineHeight: 1.21 }}>
        Today's workout finished
      </h2>
      <p className="wk-body" style={{ marginTop: fig(12) }} aria-live="polite">
        <span key={summary} className="wk-text-swap">
          {summary}
        </span>
      </p>
      <dl className="flex" style={{ gap: fig(126), marginTop: fig(60) }}>
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

/** Whoop cardiovascular strain card shown on workout completion when Whoop is configured. */
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
      <div className="flex items-center justify-between" style={{ gap: fig(20) }}>
        <h3 className="wk-label" style={{ lineHeight: 1.21 }}>
          Whoop strain
        </h3>
        {isSyncing ? (
          <span className="wk-pill" style={{ background: 'rgba(0,241,159,0.16)', color: 'var(--wk-accent)' }}>
            Syncing…
          </span>
        ) : hasLiveConnection && onRetry && !hasWorkoutStrain ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Refresh Whoop workout strain"
            className="wk-pill wk-tap"
            style={{ minHeight: 44, background: 'rgba(255,255,255,0.08)', color: '#FFFFFF' }}
          >
            Refresh
          </button>
        ) : hasWorkoutStrain ? (
          <span className="wk-pill" style={{ background: 'rgba(0,241,159,0.16)', color: 'var(--wk-accent)' }}>
            Whoop
          </span>
        ) : null}
      </div>

      <dl className="flex flex-wrap" style={{ gap: fig(96), marginTop: fig(48) }}>
        <div>
          <dt className="uppercase" style={{ fontSize: text(26), lineHeight: 1.21, color: 'var(--wk-muted)' }}>
            Workout strain
          </dt>
          <dd className="font-bold text-white tabular-numbers" style={{ fontSize: text(64), lineHeight: 1, marginTop: fig(12) }}>
            {hasWorkoutStrain ? workoutStrain.toFixed(1) : '—'}
            {hasWorkoutStrain && (
              <span className="font-semibold" style={{ fontSize: text(26), color: 'var(--wk-muted)', marginLeft: fig(10) }}>
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
        <div className="flex flex-wrap" style={{ gap: fig(12), marginTop: fig(28) }}>
          {hasAvgHr && (
            <span className="wk-pill" style={{ textTransform: 'none' }}>
              Avg HR {Math.round(avgHr)} bpm
            </span>
          )}
          {hasMaxHr && (
            <span className="wk-pill" style={{ textTransform: 'none' }}>
              Peak HR {Math.round(maxHr)} bpm
            </span>
          )}
        </div>
      )}

      <p className="wk-caption" style={{ marginTop: fig(24) }}>
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
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <h3 className="wk-h1 min-w-0">{summary.exerciseName}</h3>
        {summary.isPersonalBest && (
          <span className="wk-pill shrink-0" style={{ background: 'var(--wk-accent)', color: '#13181C' }}>
            Personal best
          </span>
        )}
      </div>
      {summary.chip && (
        <div style={{ marginTop: fig(16) }}>
          <span className="wk-pill">{summary.chip}</span>
        </div>
      )}
      <div className="wk-body flex flex-col" style={{ gap: fig(6), marginTop: fig(36) }}>
        {summary.lines.map((line, i) => (
          <p key={i} className="m-0">
            {line}
          </p>
        ))}
      </div>
      {!summary.timed && (
        <div style={{ marginTop: fig(28) }}>
          <TrendChart
            points={history.map((h) => ({ date: localDateString(new Date(h.at)), value: h.e1rmKg }))}
            format={(kg) => units.formatPrecise(kg)}
            height={240}
            label={
              history.length >= 2
                ? `Estimated one-rep max over your last ${history.length} sessions, ending today: ${units.formatPrecise(history[0].e1rmKg)} to ${units.formatPrecise(history[history.length - 1].e1rmKg)}`
                : history.length === 1
                ? `Starting point set today: estimated one-rep max ${units.formatPrecise(history[0].e1rmKg)}. The trend line starts after your next session.`
                : 'Example chart. Your estimated one-rep max for this exercise appears here after your first session.'
            }
          />
        </div>
      )}
    </section>
  );
};
