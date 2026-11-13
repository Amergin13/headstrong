import React from 'react';
import { ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface SessionCountProps {
  /** e.g. "Today: Chest and Back" or "Next: Legs". */
  sessionLabel: string;
  /** Position in the program, e.g. 2 of 24. */
  current: number;
  total: number;
}

interface ProgramProgressCardProps extends SessionCountProps {
  /** e.g. "Phase 1" or "Week 2". */
  title: string;
  /** e.g. "Building foundations". */
  subtitle: string;
  onOpen?: () => void;
}

const SessionCountBar: React.FC<SessionCountProps & { topMargin: string; barMargin: string }> = ({
  sessionLabel,
  current,
  total,
  topMargin,
  barMargin,
}) => {
  const pct = Math.max(0, Math.min(100, (current / Math.max(1, total)) * 100));
  return (
    <>
      <div className="flex items-end justify-between" style={{ marginTop: topMargin, gap: fig(20) }}>
        <span className="wk-label truncate" style={{ lineHeight: 1.21 }}>
          {sessionLabel}
        </span>
        <span className="font-bold text-white shrink-0 tabular-numbers" style={{ fontSize: `max(12px, ${fig(40)})`, lineHeight: 1 }}>
          {current}/{total}
        </span>
      </div>
      <div
        className="wk-bar"
        style={{ marginTop: barMargin }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label="Program progress"
      >
        <div style={{ width: `${pct}%` }} />
      </div>
    </>
  );
};

export const ProgramProgressCard: React.FC<ProgramProgressCardProps> = ({
  title,
  subtitle,
  sessionLabel,
  current,
  total,
  onOpen,
}) => {
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
      <p style={{ fontSize: `max(12px, ${fig(28)})`, lineHeight: 1.21, color: 'var(--wk-muted)', marginTop: fig(20) }}>{subtitle}</p>
      <SessionCountBar sessionLabel={sessionLabel} current={current} total={total} topMargin={fig(60)} barMargin={fig(30)} />
    </button>
  );
};

/** Lean sticky session bar shown at the top of the Workout tab once the program card scrolls out of view. */
export const StickySessionHeader: React.FC<SessionCountProps & { onOpen?: () => void }> = ({
  sessionLabel,
  current,
  total,
  onOpen,
}) => (
  <div
    className="wk fixed top-0 left-0 right-0 z-30 border-b border-white/[0.06]"
    style={{
      background: 'rgba(19, 24, 28, 0.94)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      paddingTop: 'env(safe-area-inset-top)',
    }}
  >
    <div className="max-w-md mx-auto">
      <button
        type="button"
        disabled={!onOpen}
        onClick={() => {
          triggerHaptic('light');
          onOpen?.();
        }}
        aria-label={`${sessionLabel}. Workout ${current} of ${total}. Open your program`}
        className="w-full text-left block"
        style={{
          paddingLeft: fig(76),
          paddingRight: fig(76),
          paddingTop: fig(26),
          paddingBottom: fig(24),
        }}
      >
        <SessionCountBar sessionLabel={sessionLabel} current={current} total={total} topMargin="0px" barMargin={fig(20)} />
      </button>
    </div>
  </div>
);
