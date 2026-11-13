import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TrendChart } from '../common/TrendChart';
import {
  ChartTimeline,
  DEFAULT_CHART_TIMELINE,
  DeltaPolarity,
  ProgressChart,
  filterChartByTimeline,
} from '../../services/progressSeries';
import { parseLocalDate } from '../../utils/date';
import { triggerHaptic } from '../../utils/haptics';
import { TimelineToggle } from './TimelineToggle';

const fig = (px: number) => `calc(${px} * var(--f))`;

const fullDate = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
};

function deltaBadgeStyle(polarity: DeltaPolarity): React.CSSProperties {
  switch (polarity) {
    case 'positive':
      return {
        background: 'var(--color-status-positive-soft)',
        color: 'var(--color-status-positive)',
      };
    case 'warning':
      return {
        background: 'var(--color-status-warning-soft)',
        color: 'var(--color-status-warning-strong)',
      };
    case 'danger':
      return {
        background: 'var(--color-status-danger-soft)',
        color: 'var(--color-status-danger)',
      };
    default:
      return {
        background: 'var(--color-bg-surface-control)',
        color: 'var(--color-status-neutral)',
      };
  }
}

/** Progress chart in the Whoop Slate telemetry card layout: structured KPI header, compact
 * timeline toggle, period stepper, delta badge, and surface-integrated TrendChart. */
export const ProgressChartCard: React.FC<{
  chart: ProgressChart;
  onOpen?: () => void;
  openLabel?: string;
  timeline?: ChartTimeline;
  onTimelineChange?: (timeline: ChartTimeline) => void;
  hideTimelineToggle?: boolean;
}> = ({ chart, onOpen, openLabel, timeline, onTimelineChange, hideTimelineToggle = false }) => {
  const [localTimeline, setLocalTimeline] = useState<ChartTimeline>(DEFAULT_CHART_TIMELINE);
  const [periodOffset, setPeriodOffset] = useState(0);
  const activeTimeline = timeline ?? localTimeline;
  const handleTimelineChange = onTimelineChange ?? setLocalTimeline;

  useEffect(() => {
    setPeriodOffset(0);
  }, [activeTimeline, chart.id]);

  const visibleChart = filterChartByTimeline(chart, activeTimeline, undefined, periodOffset);
  const hasHistory = chart.points.length > 0;
  const delta = visibleChart.delta;
  const windowRange = visibleChart.windowRange;
  const deltaGlyph = delta?.direction === 'up' ? '▲' : delta?.direction === 'down' ? '▼' : '•';

  return (
    <section aria-label={chart.title} className="wk-card">
      <div className="flex items-start justify-between" style={{ gap: fig(16) }}>
        <div className="min-w-0 flex-1">
          <h2
            className="font-semibold tracking-tight truncate"
            style={{
              fontSize: `max(14px, ${fig(32)})`,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.2,
            }}
          >
            {chart.title}
          </h2>
          {visibleChart.headline ? (
            <div style={{ marginTop: fig(14) }}>
              <div
                className="uppercase font-semibold"
                style={{
                  fontSize: `max(12px, ${fig(21)})`,
                  color: 'var(--color-text-muted)',
                  letterSpacing: '0.07em',
                  lineHeight: 1.1,
                }}
              >
                {visibleChart.headline.eyebrow}
              </div>
              <div className="flex items-baseline gap-1.5" style={{ marginTop: fig(6) }}>
                <span
                  className="font-bold tracking-tight"
                  style={{
                    fontSize: `max(12px, ${fig(64)})`,
                    lineHeight: 1.02,
                    color: 'var(--color-text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {visibleChart.headline.valueText}
                </span>
                {visibleChart.headline.unitText && (
                  <span
                    className="font-medium"
                    style={{
                      fontSize: `max(13px, ${fig(30)})`,
                      lineHeight: 1,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {visibleChart.headline.unitText}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: `max(12px, ${fig(24)})`, color: 'var(--wk-muted)', marginTop: fig(10) }}>
              {chart.lastUpdated ? `Last updated ${fullDate(chart.lastUpdated)}` : 'No data yet'}
            </p>
          )}
        </div>

        <div className="flex items-center shrink-0" style={{ gap: fig(8) }}>
          {!hideTimelineToggle && (
            <TimelineToggle
              variant="header"
              value={activeTimeline}
              onChange={handleTimelineChange}
              ariaLabel={`${chart.title} timeline`}
            />
          )}
          {onOpen && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpen();
              }}
              aria-label={openLabel ?? `Update ${chart.title.toLowerCase()}`}
              className="flex items-center justify-center"
              style={{ minWidth: 44, minHeight: 44, marginRight: -10 }}
            >
              <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {(delta || (windowRange && hasHistory)) && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1" style={{ marginTop: fig(16) }}>
          {delta ? (
            <span
              className="inline-flex items-center gap-1 rounded-md font-semibold"
              style={{
                ...deltaBadgeStyle(delta.polarity),
                padding: '4px 8px',
                fontSize: `max(12px, ${fig(21)})`,
                lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span aria-hidden="true">{deltaGlyph}</span>
              <span>{delta.text}</span>
            </span>
          ) : (
            <span />
          )}

          {windowRange && hasHistory && (
            <div className="flex items-center ml-auto">
              <button
                type="button"
                disabled={!windowRange.canStepBack}
                onClick={() => {
                  triggerHaptic('light');
                  setPeriodOffset((prev) => prev + 1);
                }}
                aria-label={`Previous ${activeTimeline} window for ${chart.title}`}
                className="flex items-center justify-center transition-opacity"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  color: 'var(--color-text-secondary)',
                  opacity: windowRange.canStepBack ? 1 : 0.3,
                  cursor: windowRange.canStepBack ? 'pointer' : 'default',
                }}
              >
                <ChevronLeft size={16} strokeWidth={2.25} aria-hidden="true" />
              </button>
              <span
                className="uppercase font-semibold tracking-wider whitespace-nowrap"
                style={{
                  fontSize: `max(12px, ${fig(21)})`,
                  color: 'var(--color-text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.05em',
                }}
              >
                {windowRange.label}
              </span>
              <button
                type="button"
                disabled={!windowRange.canStepForward}
                onClick={() => {
                  triggerHaptic('light');
                  setPeriodOffset((prev) => Math.max(0, prev - 1));
                }}
                aria-label={`Next ${activeTimeline} window for ${chart.title}`}
                className="flex items-center justify-center transition-opacity"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  marginRight: -10,
                  color: 'var(--color-text-secondary)',
                  opacity: windowRange.canStepForward ? 1 : 0.3,
                  cursor: windowRange.canStepForward ? 'pointer' : 'default',
                }}
              >
                <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      <p className="wk-body" style={{ marginTop: fig(20) }}>
        {visibleChart.summary}
      </p>

      <div style={{ marginTop: fig(24) }}>
        <TrendChart
          points={visibleChart.points}
          secondary={visibleChart.secondary}
          format={visibleChart.format}
          tone={visibleChart.chartTone}
          typicalRange={visibleChart.typicalRange}
          windowRange={visibleChart.windowRange}
          label={
            visibleChart.points.length >= 2
              ? `${chart.title} from ${visibleChart.format(visibleChart.points[0].value)} to ${visibleChart.format(visibleChart.points[visibleChart.points.length - 1].value)}`
              : visibleChart.points.length === 1
              ? `${chart.title}: starting point ${visibleChart.format(visibleChart.points[0].value)}. The trend line starts after your next one.`
              : `Example chart. ${chart.title} appears here after your first one.`
          }
        />
      </div>
    </section>
  );
};
