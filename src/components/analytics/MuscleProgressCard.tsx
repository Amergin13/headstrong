import React from 'react';
import { TrendChart } from '../common/TrendChart';
import { MuscleProgress, filterMuscleProgressByTimeline } from '../../services/muscleProgress';
import { ChartTimeline } from '../../services/progressSeries';

const dayMonth = (date: string) => {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};

/** Weekly hard sets as bars (stacked by tool when mixed across Barbell, Dumbbell, Bodyweight & Machine), with the personal target shaded behind them. */
const TOOL_SEGMENTS: { key: 'barbell' | 'dumbbell' | 'bodyweight' | 'machineCable'; label: string; color: string }[] = [
  { key: 'barbell', label: 'Barbell', color: 'var(--wk-accent)' },
  { key: 'dumbbell', label: 'Dumbbell', color: 'var(--color-text-primary)' },
  { key: 'bodyweight', label: 'Bodyweight', color: 'var(--color-text-secondary)' },
  { key: 'machineCable', label: 'Machine / Cable', color: 'var(--color-border-strong)' },
];

const WeeklySetsBars: React.FC<{ progress: MuscleProgress }> = ({ progress }) => {
  const { setsByWeek, target } = progress;
  const top = Math.max(target ? target[1] * 1.15 : 0, ...setsByWeek.map((w) => w.sets), 4);
  const pct = (v: number) => `${100 - (v / top) * 100}%`;
  const inBand = (v: number) => (target ? v >= target[0] && v <= target[1] : false);
  const barGap = setsByWeek.length > 24 ? 2 : setsByWeek.length > 10 ? 4 : 8;
  const windowLabel = setsByWeek.length === 1 ? 'this week' : `the last ${setsByWeek.length} weeks`;
  const label = target
    ? `Hard sets per week for ${windowLabel}, against a target of ${target[0]} to ${target[1]}: ${setsByWeek.map((w) => w.sets).join(', ')}`
    : `Hard sets per week for ${windowLabel}: ${setsByWeek.map((w) => w.sets).join(', ')}`;

  const usedTools = TOOL_SEGMENTS.filter((seg) =>
    setsByWeek.some((w) => (w.byTool?.[seg.key] ?? 0) > 0)
  );
  const showStackedTools = usedTools.length >= 2;

  return (
    <div>
      <div
        className="relative w-full overflow-hidden wk-chart-play rounded-lg"
        style={{ height: 96, background: 'var(--color-bg-canvas)' }}
        role="img"
        aria-label={label}
      >
        {target && (
          <div
            className="absolute left-0 right-0"
            style={{
              top: pct(target[1]),
              bottom: `${(target[0] / top) * 100}%`,
              background: 'var(--color-status-positive-soft)',
              borderTop: '1px dashed rgb(var(--color-accent-primary-rgb) / 0.35)',
              borderBottom: '1px dashed rgb(var(--color-accent-primary-rgb) / 0.35)',
            }}
            aria-hidden="true"
          />
        )}
        <div
          className="absolute inset-0 grid items-end px-2 pt-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, setsByWeek.length)}, 1fr)`, gap: barGap }}
          aria-hidden="true"
        >
          {setsByWeek.map((w, i) => {
            const totalHeightPct = Math.max(w.sets > 0 ? 3 : 0, (w.sets / top) * 100);
            if (showStackedTools && w.byTool && w.sets > 0) {
              const toolSum =
                w.byTool.barbell + w.byTool.dumbbell + w.byTool.bodyweight + w.byTool.machineCable;
              const denom = toolSum > 0 ? toolSum : w.sets;
              return (
                <div
                  key={w.date}
                  className="wk-chart-fade flex flex-col-reverse overflow-hidden"
                  style={{
                    height: `${totalHeightPct}%`,
                    borderRadius: '4px 4px 0 0',
                    animationDelay: `${Math.min(i, 12) * 35}ms`,
                  }}
                >
                  {TOOL_SEGMENTS.map((seg) => {
                    const val = w.byTool?.[seg.key] ?? 0;
                    if (val <= 0) return null;
                    return (
                      <div
                        key={seg.key}
                        style={{
                          height: `${(val / denom) * 100}%`,
                          background: seg.color,
                        }}
                      />
                    );
                  })}
                </div>
              );
            }
            return (
              <div
                key={w.date}
                className="wk-chart-fade"
                style={{
                  height: `${totalHeightPct}%`,
                  borderRadius: '4px 4px 0 0',
                  background:
                    i === setsByWeek.length - 1
                      ? inBand(w.sets)
                        ? 'var(--wk-accent)'
                        : 'var(--color-text-primary)'
                      : 'var(--color-border-track)',
                  animationDelay: `${Math.min(i, 12) * 35}ms`,
                }}
              />
            );
          })}
        </div>
        {target && (
          <span
            className="wk-caption tabular-nums absolute right-2"
            style={{ top: `calc(${pct(target[1])} + 4px)` }}
            aria-hidden="true"
          >
            Target {target[0]}–{target[1]}
          </span>
        )}
      </div>
      <div className="wk-caption flex justify-between mt-2 tabular-nums" aria-hidden="true">
        <span>{setsByWeek.length > 0 ? dayMonth(setsByWeek[0].date) : '—'}</span>
        <span>This week · {progress.weeklySets} sets</span>
      </div>
      {showStackedTools && (
        <div className="flex items-center flex-wrap gap-3 mt-2" aria-hidden="true">
          {usedTools.map((seg) => (
            <span key={seg.key} className="wk-caption inline-flex items-center gap-1">
              <span
                className="inline-block rounded-sm"
                style={{ width: 8, height: 8, background: seg.color }}
              />
              <span>{seg.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/** Progress for one muscle: what drove growth (sets), what it can do (strength), what changed (size). */
export const MuscleProgressCard: React.FC<{
  progress: MuscleProgress;
  formatLength: (cm: number) => string;
  timeline?: ChartTimeline;
}> = ({
  progress,
  formatLength,
  timeline,
}) => {
  const view = timeline ? filterMuscleProgressByTimeline(progress, timeline, formatLength) : progress;
  return (
    <section aria-label={view.label} className="wk-card">
      <h2 className="wk-h1">{view.label}</h2>
      <p className="wk-caption mt-1">
        {view.lastTrained ? `Last trained ${dayMonth(view.lastTrained)}` : 'Not trained yet'}
      </p>
      <p className="wk-body mt-4 max-w-prose">
        {view.summary}
      </p>

      <h3 className="wk-subhead mt-5 mb-2">
        Weekly hard sets
      </h3>
      <WeeklySetsBars progress={view} />

      <h3 className="wk-subhead mt-5 mb-2">
        Strength (start = 100)
      </h3>
      <TrendChart
        points={view.strengthIndex}
        bridgeBands={view.bridgeBands}
        format={(v) => `${Math.round(v)}`}
        height={220}
        emptyTitle="No strength index yet"
        emptyMessage={`Train ${view.label.toLowerCase()} across sessions to build this strength curve.`}
        label={
          view.strengthIndex.length >= 2
            ? `${view.label} strength index from 100 to ${Math.round(view.strengthIndex[view.strengthIndex.length - 1].value)}`
            : view.strengthIndex.length === 1
            ? `${view.label} strength starts at 100. The trend appears after another week of training it.`
            : `No strength data yet. ${view.label} strength appears here after you train it.`
        }
      />

      {view.measurement && (
        <>
          <h3 className="wk-subhead mt-5 mb-2">
            {view.measurement.label} measurement
          </h3>
          <TrendChart
            points={view.measurement.points}
            format={formatLength}
            tone="body"
            height={200}
            emptyTitle="No measurements yet"
            emptyMessage={`Log ${view.measurement.label.toLowerCase()} measurements to track changes here.`}
            label={
              view.measurement.points.length > 0
                ? `${view.measurement.label} measurement: ${view.measurement.points.map((p) => formatLength(p.value)).join(', ')}`
                : `No measurements yet. ${view.measurement.label} measurements in this range appear here.`
            }
          />
        </>
      )}

      {view.exercises.length > 0 && (
        <p className="wk-caption mt-4 max-w-prose">
          From: {view.exercises.join(', ')}
        </p>
      )}
    </section>
  );
};
