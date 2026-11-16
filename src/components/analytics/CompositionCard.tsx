import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { BiometricLog, GoalPhase } from '../../engine/types';
import { parseLocalDate } from '../../utils/date';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import { kgToUnit } from '../../utils/units';
import { CoachSummaryText } from '../common/CoachSummaryText';
import { TimelineToggle } from './TimelineToggle';
import {
  buildCompositionOverview,
  cacheCompositionInsight,
  CompositionInsightSummary,
  CompositionPoint,
  generateCompositionInsight,
  getCachedCompositionInsight,
} from '../../services/compositionOverview';
import { ChartTimeline, DEFAULT_CHART_TIMELINE } from '../../services/progressSeries';

const W = 1000;
const H = 360;
const PAD_TOP = 36;
const PAD_BOTTOM = 24;
const PAD_X = 18;

const round1 = (n: number) => Math.round(n * 10) / 10;

const shortDate = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function computeTicks(values: number[], count = 4): { min: number; max: number; ticks: number[] } {
  if (values.length === 0) return { min: 0, max: 100, ticks: [100, 67, 33, 0] };
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 0.8) {
    const pad = Math.max(1, hi * 0.06);
    lo = Math.max(0, lo - pad);
    hi += pad;
  }
  const pickStep = (span: number) => {
    const rough = span / Math.max(1, count - 1);
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(0.1, rough))));
    const norm = rough / pow;
    const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return niceNorm * pow;
  };
  let step = pickStep((hi - lo) * 1.18);
  let tickMin = Math.max(0, Math.floor((lo - step * 0.15) / step) * step);
  let tickMax = tickMin + step * (count - 1);
  if (tickMax < hi + step * 0.08) {
    step = pickStep((hi - lo) * 1.48);
    tickMin = Math.max(0, Math.floor((lo - step * 0.15) / step) * step);
    tickMax = tickMin + step * (count - 1);
  }
  const ticks: number[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    ticks.push(Number((tickMin + i * step).toFixed(2)));
  }
  return { min: ticks[ticks.length - 1], max: ticks[0], ticks };
}

function buildSegmentedPath(
  pts: { x: number; y: number }[],
  curve = true
): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return '';
  if (!curve || pts.length < 3) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }
  // Smooth monotone-friendly Catmull-Rom spline keeping segments gentle.
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function useCompositionSummaryText(summary: CompositionInsightSummary): string {
  const key = summary.facts.join('|');
  const [written, setWritten] = useState<string | null>(() => getCachedCompositionInsight(summary));

  useEffect(() => {
    const cached = getCachedCompositionInsight(summary);
    setWritten(cached);
    if (cached || summary.sparse) return;
    let cancelled = false;
    generateCompositionInsight(summary)
      .then((answer) => {
        if (!answer) return;
        cacheCompositionInsight(summary, answer);
        if (!cancelled) setWritten(answer);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return written ?? summary.fallback;
}

interface CompositionCardProps {
  biometrics: BiometricLog[];
  goalPhase: GoalPhase;
  onOpenLog?: () => void;
}

export const CompositionCard: React.FC<CompositionCardProps> = ({
  biometrics,
  goalPhase,
  onOpenLog,
}) => {
  const units = useUnits();
  const [timeline, setTimeline] = useState<ChartTimeline>(DEFAULT_CHART_TIMELINE);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  const overview = useMemo(
    () =>
      buildCompositionOverview({
        biometrics,
        goalPhase,
        timeline,
        formatWeight: (kg) => units.format(kg),
        formatPreciseWeight: (kg) => units.formatPrecise(kg),
      }),
    [biometrics, goalPhase, timeline, units]
  );

  const summaryText = useCompositionSummaryText(overview.summary);
  const points = overview.points;

  useEffect(() => {
    setActiveIndex(null);
  }, [timeline, points.length]);

  // Display values (left mass axis uses unquantized continuous unit values so scale ticks & deltas agree)
  const massDisplayValues = useMemo(() => {
    const vals: number[] = [];
    for (const p of points) {
      if (p.weightKg !== undefined) vals.push(kgToUnit(p.weightKg, units.unit));
      if (p.leanMassKg !== undefined) vals.push(kgToUnit(p.leanMassKg, units.unit));
    }
    return vals;
  }, [points, units.unit]);

  const bfDisplayValues = useMemo(
    () => points.map((p) => p.bodyFatPct).filter((v): v is number => v !== undefined),
    [points]
  );

  const massScale = useMemo(() => computeTicks(massDisplayValues, 4), [massDisplayValues]);
  const bfScale = useMemo(() => computeTicks(bfDisplayValues, 4), [bfDisplayValues]);
  const hasMassSeries = massDisplayValues.length > 0;
  const hasBodyFatSeries = bfDisplayValues.length > 0;

  const t0 = points[0] ? parseLocalDate(points[0].date).getTime() : 0;
  const t1 = points[points.length - 1] ? parseLocalDate(points[points.length - 1].date).getTime() : 0;
  const tSpan = t1 - t0;

  const xOfDate = (date: string, index: number) => {
    if (points.length <= 1) return W / 2;
    if (tSpan <= 0) return PAD_X + (index / Math.max(1, points.length - 1)) * (W - PAD_X * 2);
    const t = parseLocalDate(date).getTime();
    return PAD_X + ((t - t0) / tSpan) * (W - PAD_X * 2);
  };

  const yMass = (kg: number) => {
    const disp = kgToUnit(kg, units.unit);
    const span = Math.max(0.1, massScale.max - massScale.min);
    return H - PAD_BOTTOM - ((disp - massScale.min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  };

  const yBf = (pct: number) => {
    const span = Math.max(0.1, bfScale.max - bfScale.min);
    return H - PAD_BOTTOM - ((pct - bfScale.min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  };

  const plotted = useMemo(() => {
    const weightPts: { x: number; y: number; date: string; val: number; idx: number }[] = [];
    const leanPts: { x: number; y: number; date: string; val: number; idx: number }[] = [];
    const bfPts: { x: number; y: number; date: string; val: number; idx: number }[] = [];

    points.forEach((p, idx) => {
      const x = xOfDate(p.date, idx);
      if (p.weightKg !== undefined) {
        weightPts.push({ x, y: yMass(p.weightKg), date: p.date, val: p.weightKg, idx });
      }
      if (p.leanMassKg !== undefined) {
        leanPts.push({ x, y: yMass(p.leanMassKg), date: p.date, val: p.leanMassKg, idx });
      }
      if (p.bodyFatPct !== undefined) {
        bfPts.push({ x, y: yBf(p.bodyFatPct), date: p.date, val: p.bodyFatPct, idx });
      }
    });
    return { weightPts, leanPts, bfPts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, massScale, bfScale, units]);

  const leanPath = buildSegmentedPath(plotted.leanPts);
  const weightPath = buildSegmentedPath(plotted.weightPts);
  const bfPath = buildSegmentedPath(plotted.bfPts);
  const leanArea =
    plotted.leanPts.length >= 2
      ? `${leanPath} L${plotted.leanPts[plotted.leanPts.length - 1].x.toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} L${plotted.leanPts[0].x.toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} Z`
      : '';

  const handleScrub = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = Math.max(0, Math.min(W, ((clientX - rect.left) / Math.max(1, rect.width)) * W));
    let bestIdx = 0;
    let bestDist = Infinity;
    points.forEach((p, idx) => {
      const dist = Math.abs(xOfDate(p.date, idx) - relX);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    setActiveIndex(bestIdx);
  };

  const inspected: CompositionPoint | undefined =
    activeIndex !== null ? points[activeIndex] : points[points.length - 1];
  const inspectedX =
    activeIndex !== null && points[activeIndex]
      ? xOfDate(points[activeIndex].date, activeIndex)
      : null;

  const formatDelta = (delta: number | undefined, mode: 'weight' | 'pct') => {
    if (delta === undefined) return undefined;
    if (Math.abs(delta) < 0.05) return '0';
    if (mode === 'pct') return `${delta > 0 ? '+' : '-'}${round1(Math.abs(delta))}%`;
    return `${delta > 0 ? '+' : '-'}${units.formatPrecise(Math.abs(delta))}`;
  };

  const kpis = [
    {
      label: 'Weight',
      color: 'var(--color-text-primary)',
      value:
        overview.weight.latest !== undefined ? units.formatPrecise(overview.weight.latest) : '—',
      delta: formatDelta(overview.weight.delta, 'weight'),
    },
    {
      label: 'Lean mass',
      color: 'var(--color-accent-primary)',
      value:
        overview.leanMass.latest !== undefined ? units.formatPrecise(overview.leanMass.latest) : '—',
      delta: formatDelta(overview.leanMass.delta, 'weight'),
    },
    {
      label: 'Body fat',
      color: 'var(--color-data-telemetry)',
      value:
        overview.bodyFat.latest !== undefined ? `${round1(overview.bodyFat.latest)}%` : '—',
      delta: formatDelta(overview.bodyFat.delta, 'pct'),
    },
  ];

  const chartHeight = 196;

  return (
    <section aria-label="Body composition over time" className="wk-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="wk-h1 normal-case tracking-tight min-w-0">Composition</h2>
        {onOpenLog && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenLog();
            }}
            aria-label="Log weight and body composition"
            className="flex items-center justify-center shrink-0"
            style={{ minWidth: 44, minHeight: 44, marginRight: -8 }}
          >
            <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      <TimelineToggle
        compact
        value={timeline}
        onChange={setTimeline}
        ariaLabel="Composition timeline"
      />

      {/* 3-metric legend & current values */}
      <dl className="grid grid-cols-3 gap-2 mt-4">
        {kpis.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="wk-label flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              <span className="truncate">{item.label}</span>
            </dt>
            <dd
              className="wk-title tabular-nums whitespace-nowrap mt-1"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {item.value}
            </dd>
            {item.delta && (
              <div className="wk-caption tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {item.delta}
              </div>
            )}
          </div>
        ))}
      </dl>

      {/* Overlaid dual-axis chart or clean empty state */}
      <div className="mt-4">
        {points.length === 0 ? (
          <div
            className="rounded-xl p-4 text-center space-y-2 border border-dashed"
            style={{ borderColor: 'var(--color-border-strong)', background: 'var(--wk-raised)' }}
          >
            <p className="wk-subhead">
              {overview.hasAllTimeData ? 'No readings in this window' : 'No composition logs yet'}
            </p>
            <p className="wk-caption max-w-prose mx-auto">
              {overview.hasAllTimeData
                ? 'Choose a wider timeframe or log today’s weigh-in.'
                : 'Log morning weight and body fat % to overlay weight, body fat, and lean body mass.'}
            </p>
            {onOpenLog && !overview.hasAllTimeData && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenLog();
                  }}
                  className="wk-btn-secondary"
                >
                  Log weight &amp; body fat
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div
              className="grid items-stretch"
              style={{
                gridTemplateColumns: hasBodyFatSeries ? 'auto 1fr auto' : 'auto 1fr',
                columnGap: 6,
              }}
            >
              {/* Left Y-axis (Weight & Lean body mass in kg/lb) */}
              <div
                className="relative select-none"
                style={{ height: chartHeight, minWidth: 32 }}
                aria-hidden="true"
              >
                {hasMassSeries &&
                  massScale.ticks.map((tick) => {
                    const ratio =
                      (tick - massScale.min) / Math.max(0.1, massScale.max - massScale.min);
                    const yPx = H - PAD_BOTTOM - ratio * (H - PAD_TOP - PAD_BOTTOM);
                    return (
                      <span
                        key={tick}
                        className="wk-caption block text-right tabular-nums"
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: `${(yPx / H) * 100}%`,
                          transform: 'translateY(-50%)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {Math.round(tick * 10) / 10}
                      </span>
                    );
                  })}
              </div>

              {/* Plot SVG */}
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Composition chart: ${points.length} check-ins overlaid for weight, lean mass, and body fat`}
                className="w-full touch-pan-y select-none"
                style={{ height: chartHeight }}
                onPointerDown={(e) => handleScrub(e.clientX)}
                onPointerMove={(e) => {
                  if (e.buttons > 0 || e.pointerType === 'mouse') handleScrub(e.clientX);
                }}
                onPointerLeave={() => setActiveIndex(null)}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent-primary)" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="var(--color-accent-primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Horizontal gridlines matching left mass scale */}
                {massScale.ticks.map((tick) => {
                  const ratio =
                    (tick - massScale.min) / Math.max(0.1, massScale.max - massScale.min);
                  const gridY = H - PAD_BOTTOM - ratio * (H - PAD_TOP - PAD_BOTTOM);
                  return (
                    <line
                      key={tick}
                      x1={0}
                      y1={gridY}
                      x2={W}
                      y2={gridY}
                      stroke="var(--color-border-subtle)"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}

                {/* Lean Body Mass area & stroke (Precision Mint) */}
                {leanArea && <path d={leanArea} fill={`url(#${gradientId})`} />}
                {leanPath && (
                  <path
                    d={leanPath}
                    fill="none"
                    stroke="var(--color-accent-primary)"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Weight reference line (Cool Off-White dashed) */}
                {weightPath && (
                  <path
                    d={weightPath}
                    fill="none"
                    stroke="var(--color-text-primary)"
                    strokeOpacity={0.78}
                    strokeWidth={1.8}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Body Fat % line (Telemetry Blue on right %) */}
                {bfPath && (
                  <path
                    d={bfPath}
                    fill="none"
                    stroke="var(--color-data-telemetry)"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Single-point or scrubbed crosshair highlight */}
                {inspectedX !== null && (
                  <line
                    x1={inspectedX}
                    y1={PAD_TOP}
                    x2={inspectedX}
                    y2={H - PAD_BOTTOM}
                    stroke="var(--color-border-strong)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {plotted.weightPts
                  .filter((pt) => points.length === 1 || pt.idx === activeIndex || (activeIndex === null && pt.idx === points.length - 1))
                  .map((pt) => (
                    <circle
                      key={`w-${pt.date}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={5}
                      fill="var(--color-bg-surface)"
                      stroke="var(--color-text-primary)"
                      strokeWidth={2.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}

                {plotted.leanPts
                  .filter((pt) => points.length === 1 || pt.idx === activeIndex || (activeIndex === null && pt.idx === points.length - 1))
                  .map((pt) => (
                    <circle
                      key={`l-${pt.date}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={5}
                      fill="var(--color-accent-primary)"
                      stroke="var(--color-bg-surface)"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}

                {plotted.bfPts
                  .filter((pt) => points.length === 1 || pt.idx === activeIndex || (activeIndex === null && pt.idx === points.length - 1))
                  .map((pt) => (
                    <circle
                      key={`bf-${pt.date}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={5}
                      fill="var(--color-data-telemetry)"
                      stroke="var(--color-bg-surface)"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
              </svg>

              {/* Right Y-axis (Body fat % when logged) */}
              {hasBodyFatSeries && (
                <div
                  className="relative select-none"
                  style={{ height: chartHeight, minWidth: 32 }}
                  aria-hidden="true"
                >
                  {bfScale.ticks.map((tick) => {
                    const ratio =
                      (tick - bfScale.min) / Math.max(0.1, bfScale.max - bfScale.min);
                    const yPx = H - PAD_BOTTOM - ratio * (H - PAD_TOP - PAD_BOTTOM);
                    return (
                      <span
                        key={tick}
                        className="wk-caption block text-left tabular-nums"
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: `${(yPx / H) * 100}%`,
                          transform: 'translateY(-50%)',
                          color: 'var(--color-data-telemetry)',
                        }}
                      >
                        {round1(tick)}%
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* X-axis range / scrubbed date readout */}
            <div className="flex items-center justify-between gap-2 mt-2 wk-caption tabular-nums">
              {activeIndex !== null && inspected ? (
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {shortDate(inspected.date)}
                  {inspected.weightKg !== undefined ? ` · Weight ${units.formatPrecise(inspected.weightKg)}` : ''}
                  {inspected.leanMassKg !== undefined ? ` · Lean ${units.formatPrecise(inspected.leanMassKg)}` : ''}
                  {inspected.bodyFatPct !== undefined ? ` · ${round1(inspected.bodyFatPct)}%` : ''}
                </span>
              ) : (
                <>
                  <span>{points[0] ? shortDate(points[0].date) : ''}</span>
                  <span>
                    {points.length > 1 && points[points.length - 1]
                      ? `${shortDate(points[points.length - 1].date)} (${units.unit}${hasBodyFatSeries ? ' · %' : ''})`
                      : points.length === 1
                      ? `${shortDate(points[0].date)} · starting point`
                      : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Concise 2-line AI summary of body composition insight */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <span className="wk-label block mb-1">Composition insight</span>
        <CoachSummaryText
          text={summaryText}
          splitBy="lines"
          swapKey={`${timeline}:${summaryText}`}
        />
      </div>
    </section>
  );
};
