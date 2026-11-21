import React from 'react';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';

interface SessionCountProps {
  /** e.g. "Chest and Back" or "Next: Legs". */
  sessionLabel: string;
  /** Completed sets in the workout, e.g. 4 of 16. */
  current: number;
  /** Total sets in the workout, e.g. 16. */
  total: number;
}

interface ProgramProgressCardProps {
  /** Phase heading, e.g. "Phase 1" or "Week 2". */
  title: string;
  /** Full description of the current phase. */
  description: string;
  /** Navigates to the Program screen when the arrow button is pressed. */
  onOpen?: () => void;
}

interface CurrentSessionCardProps extends SessionCountProps {
  /** Ref attached to the session count block for seamless scroll-linked docking. */
  sessionRef?: React.RefObject<HTMLDivElement>;
  /** Active training environment label (e.g. "Home Gym", "Hotel Dumbbells (≤30 kg)"). */
  environmentLabel?: string;
  /** True when a temporary environment overlay is currently active. */
  isTemporaryOverlay?: boolean;
  /** Opens the Environment Overlay Bottom Sheet. */
  onOpenEnvironment?: () => void;
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
      <div className="flex items-end justify-between gap-3" style={{ marginTop: topMargin }}>
        <span className="wk-subhead truncate leading-tight">
          {formatSentenceCase(sessionLabel)}
        </span>
        <span className="wk-number shrink-0 tabular-nums leading-none">
          {current}/{total}{' '}
          <span className="wk-caption">
            sets
          </span>
        </span>
      </div>
      <div
        className="wk-bar"
        style={{ marginTop: barMargin }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label="Workout sets completed"
      >
        <div style={{ width: `${pct}%` }} />
      </div>
    </>
  );
};

export const ProgramProgressCard: React.FC<ProgramProgressCardProps> = ({
  title,
  description,
  onOpen,
}) => {
  const formattedTitle = formatSentenceCase(title);
  return (
    <section
      aria-label={`${formattedTitle}. ${description}`}
      className="wk-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="wk-h1 leading-tight pt-1">
          {formattedTitle}
        </h2>
        {onOpen && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpen();
            }}
            aria-label={`Open program (${formattedTitle})`}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border-strong)] flex items-center justify-center shrink-0 transition-colors"
            style={{ background: 'var(--color-action-secondary-bg)', color: 'var(--color-action-secondary-fg)' }}
          >
            <ChevronRight
              className="wk-chevron"
              style={{ color: 'var(--color-action-secondary-fg)' }}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      <p className="wk-body mt-2 max-w-prose">{description}</p>
    </section>
  );
};

/** Standalone current workout session card showing today's workout title and completed sets bar. */
export const CurrentSessionCard: React.FC<CurrentSessionCardProps> = ({
  sessionLabel,
  current,
  total,
  sessionRef,
  environmentLabel,
  isTemporaryOverlay = false,
  onOpenEnvironment,
}) => (
  <section
    aria-label={`${formatSentenceCase(sessionLabel)}. ${current} of ${total} sets completed`}
    className="wk-card"
  >
    <div ref={sessionRef}>
      <SessionCountBar
        sessionLabel={sessionLabel}
        current={current}
        total={total}
        topMargin="0px"
        barMargin="12px"
      />
    </div>
    {onOpenEnvironment && environmentLabel && (
      <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <span className="wk-caption">
          {isTemporaryOverlay ? 'Temporary environment' : 'Training environment'}
        </span>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onOpenEnvironment();
          }}
          aria-label={`Change training environment (currently ${environmentLabel})`}
          className="wk-btn-secondary min-h-[44px] px-3 gap-2 shrink-0"
          style={
            isTemporaryOverlay
              ? {
                  background: 'var(--color-status-positive-soft)',
                  borderColor: 'var(--wk-accent)',
                  color: 'var(--color-text-primary)',
                }
              : undefined
          }
        >
          <MapPin
            className="w-4 h-4 shrink-0"
            style={{ color: isTemporaryOverlay ? 'var(--wk-accent)' : 'var(--color-text-secondary)' }}
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="wk-caption font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {environmentLabel}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
        </button>
      </div>
    )}
  </section>
);

interface StickySessionHeaderProps extends SessionCountProps {
  onOpen?: () => void;
  docked: boolean;
  headerRef: React.RefObject<HTMLDivElement>;
  measureRef: React.RefObject<HTMLDivElement>;
}

/** Lean sticky session bar shown seamlessly at the top of the Workout tab when scrolled past the session card. */
export const StickySessionHeader: React.FC<StickySessionHeaderProps> = ({
  sessionLabel,
  current,
  total,
  onOpen,
  docked,
  headerRef,
  measureRef,
}) => (
  <div
    ref={headerRef}
    aria-hidden={!docked}
    className="wk wk-sticky-dock fixed top-0 left-0 right-0 z-30"
    style={{ paddingTop: 'env(safe-area-inset-top)' }}
  >
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        borderBottom: '1px solid var(--color-border-subtle)',
        opacity: 'var(--dock-t, 0)' as unknown as number,
        background: 'rgb(var(--color-bg-canvas-rgb) / 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    />
    <div className="relative max-w-md mx-auto">
      {onOpen ? (
        <button
          type="button"
          tabIndex={docked ? 0 : -1}
          onClick={() => {
            triggerHaptic('light');
            onOpen();
          }}
          aria-label={`${formatSentenceCase(sessionLabel)}. ${current} of ${total} sets completed`}
          className="w-full text-left block px-4 pt-3"
          style={{
            paddingBottom: 'calc(16px - 4px * var(--dock-t, 0))',
          }}
        >
          <div ref={measureRef}>
            <SessionCountBar
              sessionLabel={sessionLabel}
              current={current}
              total={total}
              topMargin="0px"
              barMargin="calc(12px - 4px * var(--dock-t, 0))"
            />
          </div>
        </button>
      ) : (
        <div
          className="w-full text-left px-4 pt-3"
          style={{
            paddingBottom: 'calc(16px - 4px * var(--dock-t, 0))',
          }}
        >
          <div ref={measureRef}>
            <SessionCountBar
              sessionLabel={sessionLabel}
              current={current}
              total={total}
              topMargin="0px"
              barMargin="calc(12px - 4px * var(--dock-t, 0))"
            />
          </div>
        </div>
      )}
    </div>
  </div>
);
