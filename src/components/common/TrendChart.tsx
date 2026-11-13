import React, { useEffect, useId, useRef, useState } from 'react';
import { localDateOffset, parseLocalDate } from '../../utils/date';
import type { ChartTone, ChartTypicalRange } from '../../services/progressSeries';

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
  /** Semantic accent color: cyan for telemetry biometrics, mint for strength & body. */
  tone?: ChartTone;
  /** Trailing 28-day typical range band (homeostatic daily biometrics only). */
  typicalRange?: ChartTypicalRange;
  /** Active calendar window for stepping & daily 1W X-axis ticks. */
  windowRange?: { start: string; end: string; isDailyCalendar?: boolean };
}

/** Shape-only sample series for charts with fewer than two real points. */
const EXAMPLE_SERIES = [100, 104, 101, 103, 99, 102, 106, 103, 109, 106, 111, 108, 113];
const W = 1000;
const H = 400;
const PAD_TOP = 64;
const PAD_BOTTOM = 28;
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayMonth = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const stripTrailingUnit = (formatted: string): string =>
  formatted.replace(/\s+(bpm|ms|kg|lb|lbs|cm|in|h|hr|hrs|sets?|steps?)$/i, '');

function niceAxisTicks(rawMin: number, rawMax: number, count = 4): { min: number; max: number; ticks: number[] } {
  let lo = rawMin;
  let hi = rawMax;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, ticks: [1, 0.67, 0.33, 0] };
  if (hi - lo < 1e-6) {
    const pad = Math.max(1, Math.abs(hi) * 0.08);
    lo -= pad;
    hi += pad;
  }

  const pickStep = (span: number) => {
    const rough = span / Math.max(1, count - 1);
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return niceNorm * pow;
  };

  let step = pickStep((hi - lo) * 1.18);
  let tickMin = Math.floor((lo - step * 0.15) / step) * step;
  let tickMax = tickMin + step * (count - 1);
  if (tickMax < hi + step * 0.08) {
    step = pickStep((hi - lo) * 1.45);
    tickMin = Math.floor((lo - step * 0.15) / step) * step;
    tickMax = tickMin + step * (count - 1);
  }
  // Never show negative axis ticks when every underlying value is >= 0 (steps, weights, HR, E1RM).
  if (lo >= 0 && tickMin < 0) {
    tickMin = 0;
    step = pickStep(Math.max(1, hi * 1.15));
    tickMax = step * (count - 1);
  }

  const ticks: number[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    ticks.push(Number((tickMin + i * step).toFixed(4)));
  }
  return { min: ticks[ticks.length - 1], max: ticks[0], ticks };
}

function buildCalendarDays(start: string, end: string): { date: string; weekday: string; day: number }[] {
  const days: { date: string; weekday: string; day: number }[] = [];
  let cursor = start;
  for (let i = 0; i < 14; i += 1) {
    const d = parseLocalDate(cursor);
    days.push({ date: cursor, weekday: SHORT_WEEKDAYS[d.getDay()], day: d.getDate() });
    if (cursor >= end) break;
    cursor = localDateOffset(1, d);
  }
  return days;
}

/**
 * Whoop-inspired time-series chart positioned directly on the card surface: clean Y-axis gutter,
 * optional 28-day typical-range band, soft vertical gradient fill, and hollow circle value nodes on
 * sparse windows (<= 10 logged points) with continuous curve + endpoint dot on longer ranges.
 * With 1 point it shows the real starting point; only with 0 points does it show a dimmed "Example".
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  points,
  secondary,
  format,
  label,
  height = 300,
  tone = 'strength',
  typicalRange,
  windowRange,
}) => {
  const lineGradientId = useId();
  const areaGradientId = useId();
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

  const example = points.length === 0;
  const single = points.length === 1;
  const showNodes = !example && !single && points.length <= 10;
  const padX = showNodes || windowRange?.isDailyCalendar ? 52 : 24;

  const values = example ? EXAMPLE_SERIES : points.map((p) => p.value);
  const rangeExtras = !example && !single && typicalRange ? [typicalRange.low, typicalRange.high] : [];
  const all = example ? values : [...values, ...(secondary ?? []).map((p) => p.value), ...rangeExtras];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const { min, max, ticks } = niceAxisTicks(rawMin, rawMax, 4);

  const y = (v: number) => H - PAD_BOTTOM - ((v - min) / Math.max(1e-9, max - min)) * (H - PAD_TOP - PAD_BOTTOM);

  const calendarDays =
    !example && !single && windowRange?.isDailyCalendar
      ? buildCalendarDays(windowRange.start, windowRange.end)
      : [];

  const t0 = example
    ? 0
    : windowRange?.isDailyCalendar && calendarDays.length > 1
    ? parseLocalDate(windowRange.start).getTime()
    : parseLocalDate(points[0].date).getTime();
  const t1 = example
    ? 1
    : windowRange?.isDailyCalendar && calendarDays.length > 1
    ? parseLocalDate(windowRange.end).getTime()
    : parseLocalDate(points[points.length - 1].date).getTime();
  const span = Math.max(1, t1 - t0);
  const byIndex = example || (t1 === t0 && values.length > 1);

  const xOf = (p: TrendPoint | number, i: number) =>
    single
      ? padX * 2.5
      : byIndex
      ? padX + (i / Math.max(1, values.length - 1)) * (W - padX * 2)
      : padX + ((parseLocalDate((p as TrendPoint).date).getTime() - t0) / span) * (W - padX * 2);

  const main = (example ? values : points).map((p, i) => ({
    x: xOf(p as TrendPoint | number, i),
    y: y(example ? (p as number) : (p as TrendPoint).value),
    raw: example ? (p as number) : (p as TrendPoint).value,
  }));

  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const areaPath =
    main.length > 1
      ? `${path(main)} L${main[main.length - 1].x.toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} L${main[0].x.toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} Z`
      : '';

  const secondaryPts =
    !example && secondary && secondary.length > 1
      ? byIndex
        ? secondary.map((p, i) => ({
            x: padX + (i / Math.max(1, secondary.length - 1)) * (W - padX * 2),
            y: y(p.value),
          }))
        : secondary
            .filter((p) => {
              const t = parseLocalDate(p.date).getTime();
              return t >= t0 && t <= t1;
            })
            .map((p, i) => ({ x: xOf(p, i), y: y(p.value) }))
      : [];

  const last = main[main.length - 1];
  const accentColor = tone === 'biometric' ? 'var(--color-status-info)' : 'var(--color-accent-primary)';
  const mutedStyle: React.CSSProperties = {
    fontSize: `max(12px, ${fig(22)})`,
    color: 'var(--color-text-muted)',
    lineHeight: 1.15,
    fontVariantNumeric: 'tabular-nums',
  };

  // Decide which node labels render without horizontal overlap on sparse series.
  const visibleNodeLabels = new Set<number>();
  if (showNodes) {
    let prevLabelX = -Infinity;
    main.forEach((pt, idx) => {
      if (pt.x - prevLabelX >= W * 0.085 || idx === main.length - 1) {
        if (idx === main.length - 1 && idx > 0 && pt.x - prevLabelX < W * 0.065) {
          visibleNodeLabels.delete(idx - 1);
        }
        visibleNodeLabels.add(idx);
        prevLabelX = pt.x;
      }
    });
  }

  const showTypicalBand = Boolean(typicalRange && !example && !single);
  const bandTop = showTypicalBand && typicalRange ? y(typicalRange.high) : 0;
  const bandBottom = showTypicalBand && typicalRange ? y(typicalRange.low) : 0;
  const bandY = Math.min(bandTop, bandBottom);
  const bandH = Math.max(10, Math.abs(bandBottom - bandTop));

  return (
    <div ref={boxRef} className={play ? 'wk-chart-play' : 'wk-chart-idle'}>
      {showTypicalBand && typicalRange && (
        <div className="flex items-center justify-end gap-1.5 mb-2" aria-hidden="true">
          <span
            className="inline-block rounded-[2px]"
            style={{ width: 10, height: 10, background: 'rgba(255, 255, 255, 0.16)' }}
          />
          <span
            className="uppercase font-semibold"
            style={{
              fontSize: `max(12px, ${fig(20)})`,
              color: 'var(--color-text-secondary)',
              letterSpacing: '0.07em',
              lineHeight: 1,
            }}
          >
            {typicalRange.label}
          </span>
        </div>
      )}

      <div
        className="grid items-stretch"
        style={{
          gridTemplateColumns: example ? '1fr' : 'auto 1fr',
          columnGap: example ? 0 : fig(16),
          opacity: example ? 0.5 : 1,
        }}
      >
        {!example && (
          <div className="relative select-none" style={{ height: fig(height), minWidth: fig(58) }} aria-hidden="true">
            {ticks.map((tick) => {
              const tickY = y(tick);
              return (
                <span
                  key={tick}
                  className="block text-right"
                  style={{
                    ...mutedStyle,
                    position: 'absolute',
                    right: 0,
                    top: `${(tickY / H) * 100}%`,
                    transform: 'translateY(-50%)',
                  }}
                >
                  {stripTrailingUnit(format(tick))}
                </span>
              );
            })}
          </div>
        )}

        <div className="relative w-full" style={{ height: fig(height) }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            role="img"
            aria-label={label}
          >
            {ticks.map((tick) => {
              const tickY = y(tick);
              return (
                <line
                  key={tick}
                  x1={0}
                  x2={W}
                  y1={tickY}
                  y2={tickY}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {showTypicalBand && (
              <rect
                x={0}
                y={bandY}
                width={W}
                height={bandH}
                rx={10}
                fill="rgba(255,255,255,0.08)"
              />
            )}
            {secondaryPts.length > 1 && (
              <path
                d={path(secondaryPts)}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="wk-chart-line absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={lineGradientId} gradientUnits="userSpaceOnUse" x1={0} x2={W} y1={0} y2={0}>
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.65" />
                <stop offset="45%" stopColor={accentColor} stopOpacity="0.95" />
                <stop offset="100%" stopColor={accentColor} stopOpacity="1" />
              </linearGradient>
              <linearGradient id={areaGradientId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={PAD_TOP} y2={H - PAD_BOTTOM}>
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
                <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill={`url(#${areaGradientId})`} />}
            {!showNodes && (
              <line
                x1={last.x}
                x2={last.x}
                y1={PAD_TOP * 0.45}
                y2={H - PAD_BOTTOM}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1.5}
                strokeDasharray="3 5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={path(main)}
              fill="none"
              stroke={`url(#${lineGradientId})`}
              strokeWidth={showNodes ? 2.25 : 3}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Hollow ring nodes + direct numeric labels for sparse windows (<= 10 points) */}
          {showNodes &&
            main.map((pt, idx) => (
              <React.Fragment key={points[idx].date}>
                <span
                  className="wk-chart-fade absolute rounded-full pointer-events-none"
                  style={{
                    width: fig(18),
                    height: fig(18),
                    left: `${(pt.x / W) * 100}%`,
                    top: `${(pt.y / H) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    background: 'var(--color-bg-surface)',
                    border: `2.5px solid ${accentColor}`,
                  }}
                  aria-hidden="true"
                />
                {visibleNodeLabels.has(idx) && (
                  <span
                    className="wk-chart-fade absolute font-bold pointer-events-none select-none whitespace-nowrap"
                    style={{
                      left: `${(pt.x / W) * 100}%`,
                      top: `${(pt.y / H) * 100}%`,
                      transform: 'translate(-50%, calc(-100% - 8px))',
                      color: accentColor,
                      fontSize: `max(12px, ${fig(24)})`,
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    aria-hidden="true"
                  >
                    {stripTrailingUnit(format(points[idx].value))}
                  </span>
                )}
              </React.Fragment>
            ))}

          {/* Dense curves (>10 points) or lone starting point use the anchored endpoint dot */}
          {!showNodes && (
            <span
              className="wk-chart-dot absolute rounded-full"
              style={{
                width: fig(22),
                height: fig(22),
                left: `calc(${(last.x / W) * 100}% - ${fig(11)})`,
                top: `calc(${(last.y / H) * 100}% - ${fig(11)})`,
                background: 'var(--color-text-primary)',
                boxShadow: `0 0 0 ${fig(7)} rgba(16,21,28,0.8)`,
              }}
              aria-hidden="true"
            />
          )}

          {single && (
            <span
              className="wk-chart-fade absolute font-bold"
              style={{
                color: 'var(--color-text-primary)',
                fontSize: `max(12px, ${fig(38)})`,
                lineHeight: 1,
                left: `calc(${(last.x / W) * 100}% + ${fig(26)})`,
                top: `calc(${(last.y / H) * 100}% - ${fig(46)})`,
              }}
              aria-hidden="true"
            >
              {format(points[0].value)}
            </span>
          )}

          {example && (
            <span className="wk-pill absolute" style={{ top: fig(14), left: fig(14) }} aria-hidden="true">
              Example
            </span>
          )}
        </div>

        {/* X-axis footer aligned with the plot column */}
        {!example && <div aria-hidden="true" />}

        {single && (
          <div className="wk-chart-fade flex justify-between" style={{ ...mutedStyle, marginTop: fig(12) }} aria-hidden="true">
            <span>Starting point</span>
            <span>{dayMonth(points[0].date)}</span>
          </div>
        )}

        {!example && !single && calendarDays.length > 1 && (
          <div
            className="wk-chart-fade relative"
            style={{ height: fig(58), marginTop: fig(10) }}
            aria-hidden="true"
          >
            {calendarDays.map((day, idx) => {
              const x = padX + (idx / Math.max(1, calendarDays.length - 1)) * (W - padX * 2);
              return (
                <div
                  key={day.date}
                  className="absolute text-center whitespace-nowrap"
                  style={{
                    left: `${(x / W) * 100}%`,
                    transform: 'translateX(-50%)',
                    ...mutedStyle,
                  }}
                >
                  <div className="font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    {day.weekday}
                  </div>
                  <div className="font-semibold" style={{ color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {day.day}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!example && !single && calendarDays.length <= 1 && (
          <div className="wk-chart-fade flex justify-between" style={{ ...mutedStyle, marginTop: fig(12) }} aria-hidden="true">
            <span>{dayMonth(points[0].date)}</span>
            <span>
              {dayMonth(points[points.length - 1].date)} · {format(points[points.length - 1].value)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
