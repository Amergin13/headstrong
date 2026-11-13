import React from 'react';
import { CHART_TIMELINES, ChartTimeline } from '../../services/progressSeries';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface TimelineToggleProps {
  value: ChartTimeline;
  onChange: (timeline: ChartTimeline) => void;
  /** Compact variant sits inside a `.wk-card` over `--wk-card` rather than on `--wk-bg`. */
  compact?: boolean;
  ariaLabel?: string;
}

/**
 * 4-option segmented timeline switch (1W / 1M / 3M / 1Y) for Progress visualizations.
 * Follows `.wk-segments` / `.wk-segment` (>= 44px touch targets, >= 12px type floor).
 */
export const TimelineToggle: React.FC<TimelineToggleProps> = ({
  value,
  onChange,
  compact = false,
  ariaLabel = 'Timeline range',
}) => (
  <div
    className="wk-segments grid-cols-4"
    role="tablist"
    aria-label={ariaLabel}
    style={
      compact
        ? { background: 'var(--wk-bg)', marginTop: fig(28) }
        : undefined
    }
  >
    {CHART_TIMELINES.map((option) => {
      const selected = value === option.id;
      return (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-label={option.ariaLabel}
          onClick={() => {
            if (selected) return;
            triggerHaptic('light');
            onChange(option.id);
          }}
          className="wk-segment"
          style={{
            background: selected ? 'var(--wk-raised)' : 'transparent',
            color: selected ? '#fff' : 'var(--wk-muted)',
          }}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
