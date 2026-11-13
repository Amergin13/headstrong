import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { TrendChart } from '../common/TrendChart';
import {
  ChartTimeline,
  DEFAULT_CHART_TIMELINE,
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

/** Progress chart in the exercise card style: title, last updated, summary, timeline toggle, chart. */
export const ProgressChartCard: React.FC<{
  chart: ProgressChart;
  onOpen?: () => void;
  openLabel?: string;
  timeline?: ChartTimeline;
  onTimelineChange?: (timeline: ChartTimeline) => void;
  hideTimelineToggle?: boolean;
}> = ({ chart, onOpen, openLabel, timeline, onTimelineChange, hideTimelineToggle = false }) => {
  const [localTimeline, setLocalTimeline] = useState<ChartTimeline>(DEFAULT_CHART_TIMELINE);
  const activeTimeline = timeline ?? localTimeline;
  const handleTimelineChange = onTimelineChange ?? setLocalTimeline;
  const visibleChart = filterChartByTimeline(chart, activeTimeline);

  return (
    <section aria-label={chart.title} className="wk-card">
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <div className="min-w-0">
          <h2 className="wk-h1">{chart.title}</h2>
          <p style={{ fontSize: `max(12px, ${fig(28)})`, color: 'var(--wk-muted)', marginTop: fig(10) }}>
            {chart.lastUpdated ? `Last updated ${fullDate(chart.lastUpdated)}` : 'No data yet'}
          </p>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpen();
            }}
            aria-label={openLabel ?? `Update ${chart.title.toLowerCase()}`}
            className="flex items-center justify-center"
            style={{ width: 44, height: 44, margin: -12 }}
          >
            <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="wk-body" style={{ marginTop: fig(40) }}>
        {visibleChart.summary}
      </p>
      {!hideTimelineToggle && (
        <TimelineToggle
          compact
          value={activeTimeline}
          onChange={handleTimelineChange}
          ariaLabel={`${chart.title} timeline`}
        />
      )}
      <div style={{ marginTop: hideTimelineToggle ? fig(40) : fig(28) }}>
        <TrendChart
          points={visibleChart.points}
          secondary={visibleChart.secondary}
          format={visibleChart.format}
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
