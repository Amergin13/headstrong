import React, { useEffect, useId, useRef, useState } from 'react';
import { parseLocalDate } from '../../utils/date';

const fig = (px: number) => `calc(${px} * var(--f))`;

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  /** Faint line underneath (e.g. daily weigh-ins under the 7-day average). */
  secondary?: TrendPoint[];
  format: (value: number) => string;
  /** Screen-reader description. */
  label: string;
  /** Chart height in Figma px. */
  height?: number;
}

/** Shape-only sample series for charts with fewer than two real points. */
const EXAMPLE_SERIES = [100, 104, 101, 103, 99, 102, 106, 103, 109, 106, 111, 108, 113];
const W = 1000;
const H = 400;
const PAD_X = 24;
const PAD_Y = 36;

const dayMonth = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Line chart in the Workout/Progress card style: soft gridlines with their values, a gradient line,
 * a dotted marker and white dot on the latest point, and first/last dates underneath. With fewer
 * than two points it shows a dimmed shape labelled "Example".
 */
export const TrendChart: React.FC<TrendChartProps> = ({ points, secondary, format, label, height = 300 }) => {
  const gradientId = useId();
  // The line draws itself the first time the chart scrolls into view.
  const boxRef = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || play) return;
    if (typeof IntersectionObserver === 'undefined') {
      setPlay(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlay(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [play]);
  const example = points.length < 2;
  const values = example ? EXAMPLE_SERIES : points.map((p) => p.value);
  const all = example ? values : [...values, ...(secondary ?? []).map((p) => p.value)];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;
  const y = (v: number) => H - PAD_Y - ((v - min) / (max - min)) * (H - PAD_Y * 2);

  // X by date when real, by index for the example.
  const t0 = example ? 0 : parseLocalDate(points[0].date).getTime();
  const t1 = example ? 1 : parseLocalDate(points[points.length - 1].date).getTime();
  const span = Math.max(1, t1 - t0);
  const xOf = (p: TrendPoint | number, i: number) =>
    example
      ? PAD_X + (i / (values.length - 1)) * (W - PAD_X * 2)
      : PAD_X + ((parseLocalDate((p as TrendPoint).date).getTime() - t0) / span) * (W - PAD_X * 2);
  const main = (example ? values : points).map((p, i) => ({ x: xOf(p as TrendPoint | number, i), y: y(example ? (p as number) : (p as TrendPoint).value) }));
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const secondaryPts =
    !example && secondary && secondary.length > 1
      ? secondary.filter((p) => parseLocalDate(p.date).getTime() >= t0).map((p, i) => ({ x: xOf(p, i), y: y(p.value) }))
      : [];
  const last = main[main.length - 1];
  const grid = [0.25, 0.5, 0.75].map((f) => ({ y: PAD_Y + f * (H - PAD_Y * 2), value: max - pad - f * (max - min - pad * 2) }));
  const muted: React.CSSProperties = { fontSize: fig(20), color: 'rgba(255,255,255,0.45)', lineHeight: 1 };

  return (
    <div ref={boxRef} className={play ? 'wk-chart-play' : 'wk-chart-idle'}>
      <div
        className="relative w-full overflow-hidden"
        style={{
          height: fig(height),
          borderRadius: fig(12),
          background: 'linear-gradient(135deg, rgba(0,0,0,0.12), rgba(255,255,255,0.04))',
          opacity: example ? 0.45 : 1,
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="img" aria-label={label}>
          {grid.map((g) => (
            <line key={g.y} x1={0} x2={W} y1={g.y} y2={g.y} stroke="rgba(255,255,255,0.07)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
          {secondaryPts.length > 1 && (
            <path d={path(secondaryPts)} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="wk-chart-line absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#3FA7C9" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#4FC3D9" />
              <stop offset="100%" stopColor="#00F19F" />
            </linearGradient>
          </defs>
          <line x1={last.x} x2={last.x} y1={8} y2={H - 8} stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          <path d={path(main)} fill="none" stroke={`url(#${gradientId})`} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Latest point: kept round regardless of the chart's aspect ratio. */}
        <span
          className="wk-chart-dot absolute rounded-full bg-white"
          style={{
            width: fig(26),
            height: fig(26),
            left: `calc(${(last.x / W) * 100}% - ${fig(13)})`,
            top: `calc(${(last.y / H) * 100}% - ${fig(13)})`,
            boxShadow: `0 0 0 ${fig(8)} rgba(19,24,28,0.75)`,
          }}
          aria-hidden="true"
        />
        {!example &&
          grid.map((g) => (
            <span key={g.y} className="wk-chart-fade absolute" style={{ ...muted, left: fig(12), top: `calc(${(g.y / H) * 100}% - ${fig(24)})` }} aria-hidden="true">
              {format(g.value)}
            </span>
          ))}
        {example && (
          <span className="wk-pill absolute" style={{ top: fig(14), left: fig(14) }} aria-hidden="true">
            Example
          </span>
        )}
      </div>
      {!example && (
        <div className="wk-chart-fade flex justify-between" style={{ ...muted, marginTop: fig(12) }} aria-hidden="true">
          <span>{dayMonth(points[0].date)}</span>
          <span>
            {dayMonth(points[points.length - 1].date)} · {format(points[points.length - 1].value)}
          </span>
        </div>
      )}
    </div>
  );
};
