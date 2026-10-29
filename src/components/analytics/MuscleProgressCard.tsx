import React from 'react';
import { TrendChart } from '../common/TrendChart';
import { MuscleProgress } from '../../services/muscleProgress';

/** One Figma pixel (1344 px frame) in screen pixels; see .wk in index.css. */
const fig = (px: number) => `calc(${px} * var(--f))`;
const muted: React.CSSProperties = { fontSize: fig(20), color: 'rgba(255,255,255,0.45)', lineHeight: 1 };

const dayMonth = (date: string) => {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};

/** Weekly hard sets as bars, with the personal target shaded behind them. */
const WeeklySetsBars: React.FC<{ progress: MuscleProgress }> = ({ progress }) => {
  const { setsByWeek, target } = progress;
  const top = Math.max(target ? target[1] * 1.15 : 0, ...setsByWeek.map((w) => w.sets), 4);
  const pct = (v: number) => `${100 - (v / top) * 100}%`;
  const inBand = (v: number) => (target ? v >= target[0] && v <= target[1] : false);
  const label = target
    ? `Hard sets per week for the last ${setsByWeek.length} weeks, against a target of ${target[0]} to ${target[1]}: ${setsByWeek.map((w) => w.sets).join(', ')}`
    : `Hard sets per week for the last ${setsByWeek.length} weeks: ${setsByWeek.map((w) => w.sets).join(', ')}`;
  return (
    <div>
      <div
        className="relative w-full overflow-hidden wk-chart-play"
        style={{ height: fig(200), borderRadius: fig(12), background: 'linear-gradient(135deg, rgba(0,0,0,0.12), rgba(255,255,255,0.04))' }}
        role="img"
        aria-label={label}
      >
        {target && (
          <div
            className="absolute left-0 right-0"
            style={{ top: pct(target[1]), bottom: `${(target[0] / top) * 100}%`, background: 'rgba(0,241,159,0.08)', borderTop: '1px dashed rgba(0,241,159,0.35)', borderBottom: '1px dashed rgba(0,241,159,0.35)' }}
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 grid items-end" style={{ gridTemplateColumns: `repeat(${setsByWeek.length}, 1fr)`, gap: fig(14), padding: `${fig(14)} ${fig(18)} 0` }} aria-hidden="true">
          {setsByWeek.map((w, i) => (
            <div
              key={w.date}
              className="wk-chart-fade"
              style={{
                height: `${Math.max(w.sets > 0 ? 3 : 0, (w.sets / top) * 100)}%`,
                borderRadius: `${fig(8)} ${fig(8)} 0 0`,
                background: i === setsByWeek.length - 1 ? (inBand(w.sets) ? 'var(--wk-accent)' : '#4FC3D9') : 'rgba(255,255,255,0.22)',
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
        {target && (
          <span className="absolute" style={{ ...muted, right: fig(12), top: `calc(${pct(target[1])} + ${fig(6)})` }} aria-hidden="true">
            Target {target[0]}–{target[1]}
          </span>
        )}
      </div>
      <div className="flex justify-between" style={{ ...muted, marginTop: fig(12) }} aria-hidden="true">
        <span>{dayMonth(setsByWeek[0].date)}</span>
        <span>This week · {progress.weeklySets} sets</span>
      </div>
    </div>
  );
};

/** Progress for one muscle: what drove growth (sets), what it can do (strength), what changed (size). */
export const MuscleProgressCard: React.FC<{ progress: MuscleProgress; formatLength: (cm: number) => string }> = ({
  progress,
  formatLength,
}) => {
  const sectionTitle: React.CSSProperties = { marginTop: fig(40), marginBottom: fig(18) };
  return (
    <section aria-label={progress.label} className="wk-card">
      <h2 className="wk-h1">{progress.label}</h2>
      <p style={{ fontSize: fig(28), color: 'var(--wk-muted)', marginTop: fig(10) }}>
        {progress.lastTrained ? `Last trained ${dayMonth(progress.lastTrained)}` : 'Not trained yet'}
      </p>
      <p className="wk-body" style={{ marginTop: fig(40) }}>
        {progress.summary}
      </p>

      <h3 className="wk-label" style={sectionTitle}>
        Weekly hard sets
      </h3>
      <WeeklySetsBars progress={progress} />

      <h3 className="wk-label" style={sectionTitle}>
        Strength (start = 100)
      </h3>
      <TrendChart
        points={progress.strengthIndex}
        format={(v) => `${Math.round(v)}`}
        height={220}
        label={
          progress.strengthIndex.length >= 2
            ? `${progress.label} strength index from 100 to ${Math.round(progress.strengthIndex[progress.strengthIndex.length - 1].value)}`
            : progress.strengthIndex.length === 1
            ? `${progress.label} strength starts at 100. The trend appears after another week of training it.`
            : `Example chart. ${progress.label} strength appears here after you train it.`
        }
      />

      {progress.measurement && (
        <>
          <h3 className="wk-label" style={sectionTitle}>
            {progress.measurement.label} measurement
          </h3>
          <TrendChart
            points={progress.measurement.points}
            format={formatLength}
            height={200}
            label={`${progress.measurement.label} measurement: ${progress.measurement.points.map((p) => formatLength(p.value)).join(', ')}`}
          />
        </>
      )}

      {progress.exercises.length > 0 && (
        <p className="wk-body" style={{ marginTop: fig(32), color: 'var(--wk-muted)' }}>
          From: {progress.exercises.join(', ')}
        </p>
      )}
    </section>
  );
};
