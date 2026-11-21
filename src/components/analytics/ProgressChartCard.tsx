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
        color: 'var(--color-status-warning)',
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

/** Progress chart in the Treise Slate telemetry card layout: structured KPI header, compact
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
      <div className="flex items-center justify-between gap-2">
        <h2 className="wk-h1 normal-case tracking-tight min-w-0">
          {chart.title}
        </h2>
        {onOpen && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpen();
            }}
            aria-label={openLabel ?? `Update ${chart.title.toLowerCase()}`}
            className="flex items-center justify-center shrink-0"
            style={{ minWidth: 44, minHeight: 44, marginRight: -8 }}
          >
            <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      {!hideTimelineToggle && (
        <TimelineToggle
          compact
          value={activeTimeline}
          onChange={handleTimelineChange}
          ariaLabel={`${chart.title} timeline`}
        />
      )}

      {visibleChart.headline ? (
        <div className="mt-4">
          <div className="wk-label">
            {visibleChart.headline.eyebrow}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="wk-display">
              {visibleChart.headline.valueText}
            </span>
            {visibleChart.headline.unitText && (
              <span
                className="wk-caption"
                style={{
                  lineHeight: 1,
                }}
              >
                {visibleChart.headline.unitText}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="wk-caption mt-3">
          {chart.lastUpdated ? `Last updated ${fullDate(chart.lastUpdated)}` : 'No data yet'}
        </p>
      )}

      {(delta || (windowRange && hasHistory)) && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2">
          {delta ? (
            <span
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium tabular-nums"
              style={{
                ...deltaBadgeStyle(delta.polarity),
                lineHeight: 1.15,
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
                className="wk-meta-title whitespace-nowrap tabular-nums"
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
                  marginRight: -8,
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

      <div className="mt-4">
        <TrendChart
          points={visibleChart.points}
          secondary={visibleChart.secondary}
          format={visibleChart.format}
          tone={visibleChart.chartTone}
          positiveProgress={delta ? delta.polarity === 'positive' : undefined}
          typicalRange={visibleChart.typicalRange}
          windowRange={visibleChart.windowRange}
          bridgeBands={visibleChart.bridgeBands}
          emptyTitle="No data yet"
          emptyMessage={`Log ${chart.title.toLowerCase()} to start building this trend.`}
          label={
            visibleChart.points.length >= 2
              ? `${chart.title} from ${visibleChart.format(visibleChart.points[0].value)} to ${visibleChart.format(visibleChart.points[visibleChart.points.length - 1].value)}`
              : visibleChart.points.length === 1
              ? `${chart.title}: starting point ${visibleChart.format(visibleChart.points[0].value)}. The trend line starts after your next one.`
              : `No data yet. ${chart.title} appears here after your first entry.`
          }
        />
      </div>

      <p className="wk-body mt-4 max-w-prose">
        {visibleChart.summary}
      </p>
    </section>
  );
};
