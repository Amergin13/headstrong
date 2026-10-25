import React from 'react';
import { ChevronRight } from 'lucide-react';
import { TrendChart } from '../common/TrendChart';
import { ProgressChart } from '../../services/progressSeries';
import { parseLocalDate } from '../../utils/date';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

const fullDate = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
};

/** Progress chart in the exercise card style: title, last updated, summary, chart. */
export const ProgressChartCard: React.FC<{ chart: ProgressChart; onOpen?: () => void; openLabel?: string }> = ({
  chart,
  onOpen,
  openLabel,
}) => (
  <section aria-label={chart.title} className="wk-card">
    <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
      <div className="min-w-0">
        <h2 className="wk-h1">{chart.title}</h2>
        <p style={{ fontSize: fig(28), color: 'var(--wk-muted)', marginTop: fig(10) }}>
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
      {chart.summary}
    </p>
    <div style={{ marginTop: fig(40) }}>
      <TrendChart
        points={chart.points}
        secondary={chart.secondary}
        format={chart.format}
        label={
          chart.points.length >= 2
            ? `${chart.title} from ${chart.format(chart.points[0].value)} to ${chart.format(chart.points[chart.points.length - 1].value)}`
            : `Example chart. ${chart.title} appears here after two measurements.`
        }
      />
    </div>
  </section>
);
