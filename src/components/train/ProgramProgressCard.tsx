import React from 'react';
import { ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ProgramProgressCardProps {
  /** e.g. "Phase 1" or "Week 2". */
  title: string;
  /** e.g. "Building foundations". */
  subtitle: string;
  /** e.g. "Today: Chest and Back" or "Next: Legs". */
  sessionLabel: string;
  /** Position in the program, e.g. 2 of 24. */
  current: number;
  total: number;
  onOpen?: () => void;
}

export const ProgramProgressCard: React.FC<ProgramProgressCardProps> = ({
  title,
  subtitle,
  sessionLabel,
  current,
  total,
  onOpen,
}) => {
  const pct = Math.max(0, Math.min(100, (current / Math.max(1, total)) * 100));
  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={() => {
        triggerHaptic('light');
        onOpen?.();
      }}
      aria-label={`${title}, ${subtitle}. ${sessionLabel}. Workout ${current} of ${total}. Open your program`}
      className="wk-card w-full text-left block"
    >
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          {title}
        </h2>
        {onOpen && <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />}
      </div>
      <p style={{ fontSize: fig(28), lineHeight: 1.21, color: 'var(--wk-muted)', marginTop: fig(20) }}>{subtitle}</p>
      <div className="flex items-end justify-between" style={{ marginTop: fig(60), gap: fig(20) }}>
        <span className="wk-label" style={{ lineHeight: 1.21 }}>
          {sessionLabel}
        </span>
        <span className="font-bold text-white shrink-0" style={{ fontSize: fig(40), lineHeight: 1 }}>
          {current}/{total}
        </span>
      </div>
      <div
        className="wk-bar"
        style={{ marginTop: fig(30) }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label="Program progress"
      >
        <div style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
};
