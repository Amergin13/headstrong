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
