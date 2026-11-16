import React from 'react';
import { CHART_TIMELINES, ChartTimeline } from '../../services/progressSeries';
import { triggerHaptic } from '../../utils/haptics';

interface TimelineToggleProps {
  value: ChartTimeline;
  onChange: (timeline: ChartTimeline) => void;
  /** Compact variant sits inside a `.wk-card` over `--wk-card` rather than on `--wk-bg`. */
  compact?: boolean;
  /** Header variant renders a compact top-right segmented pill switcher. */
  variant?: 'default' | 'header';
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
  variant = 'default',
  ariaLabel = 'Timeline range',
}) => {
  if (variant === 'header') {
    return (
      <div
        className="wk-segments inline-grid grid-cols-4 items-center shrink-0"
        role="tablist"
        aria-label={ariaLabel}
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
              className={`wk-segment px-3 ${selected ? 'is-active' : ''}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="wk-segments grid-cols-4"
      role="tablist"
      aria-label={ariaLabel}
      style={
        compact
          ? { background: 'var(--wk-bg)', marginTop: 12 }
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
            className={`wk-segment ${selected ? 'is-active' : ''}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
