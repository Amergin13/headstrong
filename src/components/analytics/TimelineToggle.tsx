import React from 'react';
import { CHART_TIMELINES, ChartTimeline } from '../../services/progressSeries';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface TimelineToggleProps {
  value: ChartTimeline;
  onChange: (timeline: ChartTimeline) => void;
  /** Compact variant sits inside a `.wk-card` over `--wk-card` rather than on `--wk-bg`. */
  compact?: boolean;
  /** Header variant renders a compact top-right segmented pill like Whoop's W/M/6M switcher. */
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
        className="inline-grid grid-cols-4 items-center shrink-0"
        role="tablist"
        aria-label={ariaLabel}
        style={{
          background: 'var(--color-bg-surface-subtle)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '10px',
          padding: '2px',
          gap: '2px',
        }}
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
              className="min-h-[44px] flex items-center justify-center rounded-[8px] transition-colors font-semibold uppercase tracking-wider"
              style={{
                paddingInline: fig(20),
                background: selected ? 'var(--color-bg-surface-raised)' : 'transparent',
                color: selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                border: selected ? '1px solid var(--color-border-subtle)' : '1px solid transparent',
                fontSize: 'max(12px, calc(24px * var(--f)))',
                lineHeight: 1,
              }}
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
              color: selected ? 'var(--color-text-primary)' : 'var(--wk-muted)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
