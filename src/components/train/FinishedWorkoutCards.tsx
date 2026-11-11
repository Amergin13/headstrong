import React from 'react';
import { formatReadyTime, MUSCLE_FRIENDLY_NAMES } from '../../engine/recovery';
import { MuscleGroup } from '../../engine/types';
import { CompletedExerciseSummary, WorkoutFinish } from '../../services/workoutFinish';
import { localDateString } from '../../utils/date';
import { triggerHaptic } from '../../utils/haptics';
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

/**
 * What comes next and when: the next workout waits until its muscles have recovered, with
 * "Train anyway" as the secondary choice.
 */
export const NextWorkoutCard: React.FC<{
  name: string;
  readyAt: number;
  limitingMuscles: { muscle: MuscleGroup; recoveryPct: number; readyAt: number }[];
  onTrainAnyway: () => void;
}> = ({ name, readyAt, limitingMuscles, onTrainAnyway }) => (
  <section className="wk-card" aria-labelledby="next-workout-title">
    <h2 id="next-workout-title" className="wk-label" style={{ lineHeight: 1.21 }}>
      Next: {name}
    </h2>
    <p className="wk-body" style={{ marginTop: fig(12) }}>
      Ready <strong className="text-white">{formatReadyTime(readyAt)}</strong>. Muscles grow while they recover.
    </p>
    {limitingMuscles.length > 0 && (
      <ul className="flex flex-col" style={{ gap: fig(28), marginTop: fig(40) }} aria-label="Muscle recovery">
        {limitingMuscles.slice(0, 4).map((m) => (
          <li key={m.muscle}>
            <div className="flex items-center justify-between" style={{ marginBottom: fig(12) }}>
              <span className="wk-label">{MUSCLE_FRIENDLY_NAMES[m.muscle]}</span>
              <span className="wk-caption">
                {m.recoveryPct}% • ready {formatReadyTime(m.readyAt)}
              </span>
            </div>
            <div
              className="wk-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={m.recoveryPct}
              aria-label={`${MUSCLE_FRIENDLY_NAMES[m.muscle]} recovery`}
            >
              <div style={{ width: `${m.recoveryPct}%`, background: '#8FD3FF' }} />
            </div>
          </li>
        ))}
      </ul>
    )}
    <button
      type="button"
      onClick={() => {
        triggerHaptic('warning');
        onTrainAnyway();
      }}
      className="wk-button"
      style={{ background: 'var(--wk-pill)', color: '#fff', marginTop: fig(40) }}
    >
      Train anyway
    </button>
  </section>
);
