import React, { useEffect, useId, useRef, useState } from 'react';
import { localDateOffset, parseLocalDate } from '../../utils/date';
import type { ChartTone, ChartTypicalRange } from '../../services/progressSeries';


export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number;
  /** Optional compact label shown directly above a sparse dot (e.g. "12×15"). */
  pointLabel?: string;
  /** Optional full human-readable label for single-point callout & footer latest readout (e.g. "12 kg/DB × 15"). */
  detailLabel?: string;
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
  /** Semantic accent color: cyan for telemetry biometrics, mint for positive progress. */
  tone?: ChartTone;
  /** Explicit override: true when the series represents positive progress toward a goal, false when informational. */
  positiveProgress?: boolean;
  /** Trailing 28-day typical range band (homeostatic daily biometrics only). */
  typicalRange?: ChartTypicalRange;
  /** Active calendar window for stepping & daily 1W X-axis ticks. */
  windowRange?: { start: string; end: string; isDailyCalendar?: boolean };
  /** Lightly shaded "Travel Bridge" date bands marking weeks where substitute tools kept volume moving. */
  bridgeBands?: { startDate: string; endDate: string; label?: string }[];
  /** Empty state title when `points` is empty. */
  emptyTitle?: string;
  /** Empty state message when `points` is empty. */
  emptyMessage?: string;
  /** Visual density mode: 'default' shows axes, gridlines, node labels, and date footer; 'minimal' shows only the trend line, gradient fill, and endpoint dot. */
  variant?: 'default' | 'minimal';
}

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
 * Time-series chart positioned directly on the card surface: clean Y-axis gutter,
 * optional 28-day typical-range band, soft vertical gradient fill, and hollow circle value nodes on
 * sparse windows (<= 10 logged points) with continuous curve + endpoint dot on longer ranges.
 * With 1 point it shows and animates the real starting point; with 0 points it shows an honest empty state.
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  points,
  secondary,
  format,
  label,
  height = 300,
  tone = 'strength',
  positiveProgress,
  typicalRange,
  windowRange,
  bridgeBands,
  emptyTitle = 'No data yet',
  emptyMessage = 'Log this exercise to establish your starting point.',
  variant = 'default',
}) => {
  const isMinimal = variant === 'minimal';
  const lineGradientId = useId();
  const areaGradientId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  const signature = points.map((p) => `${p.date}:${p.value}`).join('|');
  const prevSigRef = useRef(signature);
  const [animVersion, setAnimVersion] = useState(0);

  useEffect(() => {
    if (prevSigRef.current !== signature) {
      prevSigRef.current = signature;
      if (points.length > 0) {
        setPlay(true);
        setAnimVersion((v) => v + 1);
      }
    }
  }, [signature, points.length]);

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
  }, [play, points.length]);

  const plotHeight = isMinimal
    ? Math.max(56, Math.round((height * 0.35) / 4) * 4)
    : Math.round((height * 0.45) / 4) * 4;
  if (points.length === 0) {
    return (
      <div
        ref={boxRef}
        role="img"
        aria-label={label}
        className="relative flex flex-col items-center justify-center rounded-xl border border-dashed text-center px-4"
        style={{
          height: plotHeight,
          borderColor: 'var(--color-border-subtle)',
          background: 'rgb(var(--color-bg-raised-rgb, 28 32 38) / 0.35)',
        }}
      >
        <p className="wk-meta-title m-0" style={{ color: 'var(--color-text-secondary)' }}>
          {emptyTitle}
        </p>
        <p className="wk-caption m-0 mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  const single = points.length === 1;
  const showNodes = !isMinimal && !single && points.length <= 10;
  const padX = isMinimal ? 16 : showNodes || windowRange?.isDailyCalendar ? 52 : 24;
  const padTop = isMinimal ? 36 : PAD_TOP;
  const padBottom = isMinimal ? 36 : PAD_BOTTOM;

  const values = points.map((p) => p.value);
  const rangeExtras = !single && typicalRange ? [typicalRange.low, typicalRange.high] : [];
  const all = [...values, ...(secondary ?? []).map((p) => p.value), ...rangeExtras];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const { min, max, ticks } = niceAxisTicks(rawMin, rawMax, 4);

  const y = (v: number) => H - padBottom - ((v - min) / Math.max(1e-9, max - min)) * (H - padTop - padBottom);

  const calendarDays =
    !isMinimal && !single && windowRange?.isDailyCalendar
      ? buildCalendarDays(windowRange.start, windowRange.end)
      : [];

  const t0 =
    windowRange?.isDailyCalendar && calendarDays.length > 1
      ? parseLocalDate(windowRange.start).getTime()
      : parseLocalDate(points[0].date).getTime();
  const t1 =
    windowRange?.isDailyCalendar && calendarDays.length > 1
      ? parseLocalDate(windowRange.end).getTime()
      : parseLocalDate(points[points.length - 1].date).getTime();
  const span = Math.max(1, t1 - t0);
  const byIndex = t1 === t0 && values.length > 1;

  const xOf = (p: TrendPoint, i: number) =>
    single
      ? isMinimal
        ? W * 0.5
        : padX * 2.5
      : byIndex
      ? padX + (i / Math.max(1, values.length - 1)) * (W - padX * 2)
      : padX + ((parseLocalDate(p.date).getTime() - t0) / span) * (W - padX * 2);

  const main = points.map((p, i) => ({
    x: xOf(p, i),
    y: y(p.value),
    raw: p.value,
  }));

  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const areaPath =
    main.length > 1
      ? `${path(main)} L${main[main.length - 1].x.toFixed(1)},${(H - padBottom).toFixed(1)} L${main[0].x.toFixed(1)},${(H - padBottom).toFixed(1)} Z`
      : '';

  const secondaryPts =
    secondary && secondary.length > 1
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
  const isPositiveTrend =
    positiveProgress ??
    (tone === 'strength' && main.length >= 2 && main[main.length - 1].raw > main[0].raw);
  const accentColor = isPositiveTrend
    ? 'var(--color-accent-primary)'
    : tone === 'biometric'
    ? 'var(--color-data-telemetry)'
    : 'var(--color-text-primary)';

  // Decide which node labels render without horizontal overlap on sparse series.
  const visibleNodeLabels = new Set<number>();
  if (showNodes) {
    const hasWideLabel = points.some((p) => (p.pointLabel?.length ?? 0) >= 4);
    const minLabelGap = hasWideLabel ? W * 0.13 : W * 0.085;
    const minLastGap = hasWideLabel ? W * 0.11 : W * 0.065;
    let prevLabelX = -Infinity;
    main.forEach((pt, idx) => {
      if (pt.x - prevLabelX >= minLabelGap || idx === main.length - 1) {
        if (idx === main.length - 1 && idx > 0 && pt.x - prevLabelX < minLastGap) {
          visibleNodeLabels.delete(idx - 1);
        }
        visibleNodeLabels.add(idx);
        prevLabelX = pt.x;
      }
    });
  }

  const showTypicalBand = Boolean(typicalRange && !single);
  const bandTop = showTypicalBand && typicalRange ? y(typicalRange.high) : 0;
  const bandBottom = showTypicalBand && typicalRange ? y(typicalRange.low) : 0;
  const bandY = Math.min(bandTop, bandBottom);
  const bandH = Math.max(10, Math.abs(bandBottom - bandTop));

  const visibleBridgeRects =
    !single && !byIndex && bridgeBands && bridgeBands.length > 0
      ? bridgeBands
          .map((band) => {
            const bStart = parseLocalDate(band.startDate).getTime();
            const bEnd = parseLocalDate(band.endDate).getTime();
            if (bEnd < t0 || bStart > t1) return null;
            const clampedStart = Math.max(t0, bStart);
            const clampedEnd = Math.min(t1, bEnd);
            const xStart = padX + ((clampedStart - t0) / span) * (W - padX * 2);
            const xEnd = padX + ((clampedEnd - t0) / span) * (W - padX * 2);
            return {
              key: `${band.startDate}-${band.endDate}`,
              x: xStart,
              width: Math.max(24, xEnd - xStart),
              label: band.label || 'Travel Bridge',
            };
          })
          .filter((r): r is { key: string; x: number; width: number; label: string } => Boolean(r))
      : [];

  return (
    <div
      key={animVersion}
      ref={boxRef}
      className={play ? `wk-chart-play${single ? ' wk-chart-single' : ''}` : 'wk-chart-idle'}
    >
      {!isMinimal && ((showTypicalBand && typicalRange) || visibleBridgeRects.length > 0) ? (
        <div className="flex items-center justify-end gap-3 mb-2 flex-wrap" aria-hidden="true">
          {visibleBridgeRects.length > 0 && (
            <div className="flex items-center gap-2">
              <span
                className="inline-block rounded-[2px] border border-dashed"
                style={{
                  width: 10,
                  height: 10,
                  background: 'rgb(var(--color-accent-primary-rgb) / 0.14)',
                  borderColor: 'rgb(var(--color-accent-primary-rgb) / 0.45)',
                }}
              />
              <span className="wk-caption">
                Travel Bridge
              </span>
            </div>
          )}
          {showTypicalBand && typicalRange && (
            <div className="flex items-center gap-2">
              <span
                className="inline-block rounded-[2px]"
                style={{ width: 10, height: 10, background: 'var(--color-border-strong)' }}
              />
              <span className="wk-caption">
                {typicalRange.label}
              </span>
            </div>
          )}
        </div>
      ) : null}

      <div
        className="grid items-stretch"
        style={{
          gridTemplateColumns: isMinimal ? '1fr' : 'auto 1fr',
          columnGap: isMinimal ? 0 : 8,
        }}
      >
        {!isMinimal && (
          <div
            className="relative select-none"
            style={{ height: plotHeight, minWidth: 28 }}
            aria-hidden="true"
          >
            {ticks.map((tick) => {
              const tickY = y(tick);
              return (
                <span
                  key={tick}
                  className="wk-caption tabular-nums block text-right"
                  style={{
                    color: 'var(--color-text-muted)',
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

        <div className="relative w-full" style={{ height: plotHeight }}>
          {!isMinimal && (
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
                    stroke="var(--color-border-track)"
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
                  fill="var(--color-border-track)"
                />
              )}
              {visibleBridgeRects.map((band) => (
                <rect
                  key={band.key}
                  x={band.x}
                  y={PAD_TOP * 0.45}
                  width={band.width}
                  height={H - PAD_BOTTOM - PAD_TOP * 0.45}
                  rx={8}
                  fill="rgb(var(--color-accent-primary-rgb) / 0.12)"
                  stroke="rgb(var(--color-accent-primary-rgb) / 0.35)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{band.label}</title>
                </rect>
              ))}
              {secondaryPts.length > 1 && (
                <path
                  d={path(secondaryPts)}
                  fill="none"
                  stroke="var(--color-border-strong)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          )}

          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="wk-chart-line absolute inset-0 w-full h-full"
            role={isMinimal ? 'img' : undefined}
            aria-label={isMinimal ? label : undefined}
            aria-hidden={isMinimal ? undefined : 'true'}
          >
            <defs>
              <linearGradient id={lineGradientId} gradientUnits="userSpaceOnUse" x1={0} x2={W} y1={0} y2={0}>
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.65" />
                <stop offset="45%" stopColor={accentColor} stopOpacity="0.95" />
                <stop offset="100%" stopColor={accentColor} stopOpacity="1" />
              </linearGradient>
              <linearGradient id={areaGradientId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={padTop} y2={H - padBottom}>
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
                <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill={`url(#${areaGradientId})`} />}
            {!showNodes && !isMinimal && (
              <line
                x1={last.x}
                x2={last.x}
                y1={PAD_TOP * 0.45}
                y2={H - PAD_BOTTOM}
                stroke="var(--color-text-muted)"
                strokeOpacity={0.5}
                strokeWidth={1.5}
                strokeDasharray="3 5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={path(main)}
              fill="none"
              stroke={`url(#${lineGradientId})`}
              strokeOpacity={1}
              strokeWidth={showNodes ? 2.25 : 2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Hollow ring nodes + direct numeric labels for sparse windows (<= 10 points), with live dot pop on newest */}
          {showNodes &&
            main.map((pt, idx) => (
              <React.Fragment key={points[idx].date}>
                {idx === main.length - 1 ? (
                  <span
                    className="wk-chart-dot absolute rounded-full pointer-events-none"
                    style={{
                      width: 10,
                      height: 10,
                      left: `calc(${(pt.x / W) * 100}% - 5px)`,
                      top: `calc(${(pt.y / H) * 100}% - 5px)`,
                      background: accentColor,
                      boxShadow: '0 0 0 3px rgb(var(--color-bg-canvas-rgb) / 0.85)',
                    }}
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="wk-chart-fade absolute rounded-full pointer-events-none"
                    style={{
                      width: 8,
                      height: 8,
                      left: `${(pt.x / W) * 100}%`,
                      top: `${(pt.y / H) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      background: 'var(--color-bg-surface)',
                      border: `2px solid ${accentColor}`,
                    }}
                    aria-hidden="true"
                  />
                )}
                {visibleNodeLabels.has(idx) && (
                  <span
                    className={`wk-chart-fade absolute pointer-events-none select-none whitespace-nowrap tabular-numbers ${
                      idx === main.length - 1 ? 'wk-meta-title' : 'wk-caption'
                    }`}
                    style={{
                      left: `${(pt.x / W) * 100}%`,
                      top: `${(pt.y / H) * 100}%`,
                      transform: 'translate(-50%, calc(-100% - 8px))',
                      color: idx === main.length - 1 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    }}
                    aria-hidden="true"
                  >
                    {points[idx].pointLabel ?? stripTrailingUnit(format(points[idx].value))}
                  </span>
                )}
              </React.Fragment>
            ))}

          {/* Dense curves (>10 points), minimal trend-line mode, or lone starting point use the anchored endpoint dot */}
          {!showNodes && (
            <span
              className="wk-chart-dot absolute rounded-full pointer-events-none"
              style={{
                width: isMinimal ? 10 : 12,
                height: isMinimal ? 10 : 12,
                left: `calc(${(last.x / W) * 100}% - ${isMinimal ? 5 : 6}px)`,
                top: `calc(${(last.y / H) * 100}% - ${isMinimal ? 5 : 6}px)`,
                background: isMinimal ? accentColor : 'var(--color-text-primary)',
                boxShadow: '0 0 0 3px rgb(var(--color-bg-canvas-rgb) / 0.8)',
              }}
              aria-hidden="true"
            />
          )}

          {!isMinimal && single && (
            <span
              className="wk-chart-fade wk-subhead tabular-nums absolute"
              style={{
                color: 'var(--color-text-primary)',
                left: `calc(${(last.x / W) * 100}% + 12px)`,
                top: `calc(${(last.y / H) * 100}% - 20px)`,
              }}
              aria-hidden="true"
            >
              {points[0].detailLabel ?? format(points[0].value)}
            </span>
          )}
        </div>

        {/* X-axis footer aligned with the plot column (default full mode only) */}
        {!isMinimal && <div aria-hidden="true" />}

        {!isMinimal && single && (
          <div className="wk-chart-fade wk-caption tabular-nums flex justify-between mt-2" aria-hidden="true">
            <span>Starting point</span>
            <span>{dayMonth(points[0].date)}</span>
          </div>
        )}

        {!isMinimal && !single && calendarDays.length > 1 && (
          <div
            className="wk-chart-fade relative"
            style={{ height: 28, marginTop: 4 }}
            aria-hidden="true"
          >
            {calendarDays.map((day, idx) => {
              const x = padX + (idx / Math.max(1, calendarDays.length - 1)) * (W - padX * 2);
              return (
                <div
                  key={day.date}
                  className="wk-caption tabular-nums absolute text-center whitespace-nowrap"
                  style={{
                    left: `${(x / W) * 100}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {day.weekday}
                  </div>
                  <div className="wk-meta-title" style={{ color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {day.day}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isMinimal && !single && calendarDays.length <= 1 && (
          <div className="wk-chart-fade wk-caption tabular-nums flex justify-between mt-2" aria-hidden="true">
            <span>{dayMonth(points[0].date)}</span>
            <span>
              {dayMonth(points[points.length - 1].date)} · {points[points.length - 1].detailLabel ?? format(points[points.length - 1].value)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
