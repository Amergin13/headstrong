import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import type { CoachIntervention } from '../../services/coachInterventions';
import { MovementStandardsReport, SYMMETRY_FLAG_PCT } from '../../services/movementStandards';
import { formatSentenceCase } from '../../utils/typography';
import { triggerHaptic } from '../../utils/haptics';

export interface BalanceCardProps {
  report: MovementStandardsReport;
  intervention?: CoachIntervention;
  adaptationApplied?: boolean;
  /** True when the athlete explicitly dismissed the balance suggestion so we respect it here too. */
  adaptationDismissed?: boolean;
  onAcceptIntervention?: (intervention: CoachIntervention) => void;
  onDismissIntervention?: (intervention: CoachIntervention) => void;
  onFixImbalanceWithCoach?: (suggestedPrompt: string) => void;
  onSelectExercise?: (exerciseId: string) => void;
}

/**
 * Balance (Progress → Strength standards): imbalances between movements (Poliquin's chin-up to bench ratio,
 * and full-level gaps between lifts on the same Kilgore standards) and left/right differences on
 * single-arm and single-leg lifts logged per side (flagged under 90% symmetry). Built only from the
 * athlete's own logs; with too little data it says what it needs instead of guessing.
 */
export const BalanceCard: React.FC<BalanceCardProps> = ({
  report,
  intervention,
  adaptationApplied = false,
  adaptationDismissed = false,
  onAcceptIntervention,
  onDismissIntervention,
  onFixImbalanceWithCoach,
  onSelectExercise,
}) => {
  const { imbalances, sideDifferences, levels } = report;
  const loggedCount = levels.filter((l) => l.logged && l.source !== 'none').length;
  const findings = imbalances.length + sideDifferences.length;

  // Hold accepted/dismissed card briefly to signal Mint success in-place before auto-dismissing.
  const [resolving, setResolving] = useState<{
    item: CoachIntervention;
    phase: 'accepted' | 'exiting' | 'dismissing';
  } | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  const displayIntervention = resolving?.item ?? intervention;
  const isAccepted = resolving?.phase === 'accepted' || resolving?.phase === 'exiting';
  const isFadingOut = resolving?.phase === 'exiting' || resolving?.phase === 'dismissing';

  const handleAccept = (item: CoachIntervention) => {
    if (resolving || !onAcceptIntervention) return;
    triggerHaptic('success');
    setResolving({ item, phase: 'accepted' });
    onAcceptIntervention(item);
    schedule(() => setResolving((prev) => (prev ? { ...prev, phase: 'exiting' } : null)), 900);
    schedule(() => setResolving(null), 1120);
  };

  const handleDismiss = (item: CoachIntervention) => {
    if (resolving || !onDismissIntervention) return;
    triggerHaptic('light');
    setResolving({ item, phase: 'dismissing' });
    onDismissIntervention(item);
    schedule(() => setResolving(null), 180);
  };

  return (
    <section aria-labelledby="balance-title" className="wk-card w-full text-left block">
      <div className="flex items-start justify-between gap-3">
        <h2 id="balance-title" className="wk-h1 leading-tight">
          Balance
        </h2>
        {loggedCount >= 2 && (
          <span
            className="wk-pill shrink-0"
            style={
              findings === 0
                ? { background: 'var(--color-status-positive-soft)', color: 'var(--wk-accent)' }
                : { background: 'var(--color-status-warning-soft)', color: 'var(--color-status-warning)' }
            }
          >
            {findings === 0 ? 'Balanced' : `${findings} to work on`}
          </span>
        )}
      </div>

      {loggedCount < 2 && sideDifferences.length === 0 ? (
        <p className="wk-body mt-3 max-w-prose">
          Log at least two main lifts (for example squat and bench) to compare them. On single-arm and single-leg lifts, tap &quot;Log
          each side&quot; to check left against right.
        </p>
      ) : findings === 0 ? (
        <p className="wk-body mt-3 max-w-prose">
          Your lifts are in proportion with each other
          {levels.some((l) => l.pillar === 'Vertical Pull' && l.logged) && levels.some((l) => l.pillar === 'Horizontal Push' && l.logged)
            ? ', and your pulling keeps up with your pressing'
            : ''}
          . Left and right sides are within {100 - SYMMETRY_FLAG_PCT}% of each other where you&apos;ve logged them.
        </p>
      ) : (
        <ul className="flex flex-col mt-3 gap-3">
          {imbalances.map((i) => (
            <li key={i.id}>
              <p className="wk-body max-w-prose" style={{ color: 'var(--color-text-primary)' }}>{i.message}</p>
              <p className="wk-caption mt-1 max-w-prose">{i.advice}</p>
              {i.caveat && (
                <p className="wk-caption mt-1 max-w-prose" style={{ color: 'var(--wk-muted)' }}>
                  {i.caveat}
                </p>
              )}
            </li>
          ))}
          {sideDifferences.map((d) => (
            <li key={d.exerciseId}>
              {onSelectExercise ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectExercise(d.exerciseId);
                  }}
                  aria-label={`Open details for ${formatSentenceCase(d.exerciseName)}`}
                  className="w-full min-h-[44px] flex items-start justify-between gap-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="wk-body max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
                      {d.exerciseName}: your {d.weakerSide} side is doing {d.symmetryPct}% of your {d.weakerSide === 'left' ? 'right' : 'left'} (last{' '}
                      {d.sessions === 1 ? 'session' : `${d.sessions} sessions`}).
                    </p>
                    <p className="wk-caption mt-1 max-w-prose">
                      Start each set with your {d.weakerSide} side and match its reps on the other side until they even out.
                    </p>
                  </div>
                  <ChevronRight className="wk-chevron shrink-0 mt-1" strokeWidth={2} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <p className="wk-body max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
                    {d.exerciseName}: your {d.weakerSide} side is doing {d.symmetryPct}% of your {d.weakerSide === 'left' ? 'right' : 'left'} (last{' '}
                    {d.sessions === 1 ? 'session' : `${d.sessions} sessions`}).
                  </p>
                  <p className="wk-caption mt-1 max-w-prose">
                    Start each set with your {d.weakerSide} side and match its reps on the other side until they even out.
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {findings > 0 && adaptationApplied && !displayIntervention && (
        <div className="mt-3">
          <span
            className="wk-pill"
            style={{
              background: 'var(--color-status-positive-soft)',
              color: 'var(--wk-accent)',
            }}
          >
            Adapted in program
          </span>
        </div>
      )}

      {findings > 0 && displayIntervention && onAcceptIntervention && onDismissIntervention && (
        <div
          className={`wk-raised mt-3 flex flex-col gap-3 border transition-all duration-200 ${
            isFadingOut ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'
          }`}
          style={{
            borderColor: isAccepted
              ? 'rgb(var(--color-accent-primary-rgb) / 0.5)'
              : 'rgb(var(--color-coach-accent-rgb) / 0.35)',
          }}
        >
          <div className="flex items-start gap-2">
            <Sparkles
              className="w-4 h-4 shrink-0 mt-1"
              style={{ color: isAccepted ? 'var(--wk-accent)' : 'var(--color-coach-accent)' }}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="wk-subhead" style={{ color: 'var(--color-text-primary)' }}>
                {formatSentenceCase(displayIntervention.title)}
              </div>
              {displayIntervention.proposedChanges.length > 0 && (
                <p className="wk-caption mt-1 max-w-prose">
                  {displayIntervention.proposedChanges.map((c) => c.humanSummary).join(' · ')}
                </p>
              )}
            </div>
          </div>
          {isAccepted ? (
            <div
              aria-live="polite"
              className="min-h-[44px] rounded-xl px-4 py-2 flex items-center justify-center gap-2"
              style={{
                background: 'var(--color-status-positive-soft)',
                color: 'var(--wk-accent)',
              }}
            >
              <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
              <span className="text-base font-semibold">Applied to your plan</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={Boolean(resolving)}
                onClick={() => handleAccept(displayIntervention)}
                className="flex-1 min-h-[44px] rounded-xl px-4 py-2 text-base font-semibold inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                style={{
                  background: 'var(--color-action-primary-bg)',
                  color: 'var(--color-action-primary-fg)',
                }}
              >
                <Check className="w-4 h-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
                <span>Accept</span>
              </button>
              <button
                type="button"
                disabled={Boolean(resolving)}
                onClick={() => handleDismiss(displayIntervention)}
                className="wk-btn-secondary min-h-[44px] px-4 inline-flex items-center justify-center"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {findings > 0 &&
        !(displayIntervention && onAcceptIntervention && onDismissIntervention) &&
        (displayIntervention || (!adaptationApplied && !adaptationDismissed)) &&
        onFixImbalanceWithCoach &&
        (() => {
          const defaultPrompt =
            imbalances.length > 0
              ? 'Rebalance my program for my imbalances'
              : sideDifferences.length > 0
                ? `Rebalance my program for left-right symmetry on ${sideDifferences[0].exerciseName}`
                : 'Rebalance my program for balance';
          const prompt = intervention?.coachPrompt ?? defaultPrompt;
          const label = intervention?.ctaLabel ?? 'Adapt program with Treise';
          return (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => onFixImbalanceWithCoach(prompt)}
                className="wk-btn-secondary w-full min-h-[44px] inline-flex items-center justify-center gap-2 font-medium"
                style={{
                  borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <Sparkles
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--color-coach-accent)' }}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
                <span>{label}</span>
              </button>
            </div>
          );
        })()}

      <p className="wk-caption mt-4 max-w-prose">
        Pulling is compared with pressing using Charles Poliquin&apos;s strength ratios. Sides are flagged under {SYMMETRY_FLAG_PCT}%, the
        symmetry line used in sports medicine.
      </p>
    </section>
  );
};
