import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, RotateCcw, Sparkles, X } from 'lucide-react';
import type { CoachIntervention } from '../../services/coachInterventions';
import { formatSentenceCase } from '../../utils/typography';
import { triggerHaptic } from '../../utils/haptics';

export interface InterventionActionReceipt {
  kind: 'accepted' | 'dismissed';
  message: string;
  undo?: () => void;
}

export interface ProgramAdaptationCarouselProps {
  /** Priority-ordered adaptation suggestions; each renders as its own standalone slide card. */
  interventions: CoachIntervention[];
  /** Executes the adaptation and persists it across the product; optionally returns an undo handler. */
  onAccept: (intervention: CoachIntervention) => InterventionActionReceipt | void;
  /** Dismisses the suggestion and persists dismissal across the product; optionally returns an undo handler. */
  onDismiss: (intervention: CoachIntervention) => InterventionActionReceipt | void;
  className?: string;
}

export const ProgramAdaptationCarousel: React.FC<ProgramAdaptationCarouselProps> = ({
  interventions,
  onAccept,
  onDismiss,
  className = '',
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [receipt, setReceipt] = useState<InterventionActionReceipt | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (interventions.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= interventions.length) {
      const clamped = Math.max(0, interventions.length - 1);
      setActiveIndex(clamped);
      const track = trackRef.current;
      const child = track?.children[clamped] as HTMLElement | undefined;
      if (track && child) {
        track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
      }
    }
  }, [activeIndex, interventions.length]);

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(interventions.length - 1, index));
    const track = trackRef.current;
    if (track) {
      const child = track.children[clamped] as HTMLElement | undefined;
      if (child) track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
    }
    setActiveIndex(clamped);
    triggerHaptic('light');
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || track.children.length === 0) return;
    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < track.children.length; i++) {
      const child = track.children[i] as HTMLElement;
      const dist = Math.abs(child.offsetLeft - track.scrollLeft);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    }
    if (nearest !== activeIndex) setActiveIndex(nearest);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' && activeIndex < interventions.length - 1) {
      e.preventDefault();
      goTo(activeIndex + 1);
    } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
      e.preventDefault();
      goTo(activeIndex - 1);
    }
  };

  const handleAccept = (item: CoachIntervention) => {
    triggerHaptic('medium');
    const result = onAccept(item);
    setReceipt(
      result ?? {
        kind: 'accepted',
        message: `Applied "${formatSentenceCase(item.title)}" across your program.`,
      }
    );
  };

  const handleDismiss = (item: CoachIntervention) => {
    triggerHaptic('light');
    const result = onDismiss(item);
    setReceipt(
      result ?? {
        kind: 'dismissed',
        message: `Dismissed "${formatSentenceCase(item.title)}".`,
      }
    );
  };

  if (interventions.length === 0 && !receipt) return null;

  return (
    <section
      aria-label="Suggested program adaptations"
      aria-roledescription={interventions.length > 0 ? 'carousel' : undefined}
      className={`flex flex-col gap-3 ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
      {receipt && (
        <div
          role="status"
          className="wk-card flex items-center justify-between gap-3 py-3"
          style={{
            borderColor:
              receipt.kind === 'accepted'
                ? 'rgb(var(--color-accent-primary-rgb) / 0.4)'
                : 'var(--color-border-strong)',
          }}
        >
          <p className="wk-caption max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
            {receipt.message}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {receipt.undo && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  receipt.undo?.();
                  setReceipt(null);
                }}
                className="wk-btn-secondary min-h-[44px] px-3 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Undo</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setReceipt(null);
              }}
              aria-label="Close confirmation"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {interventions.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-coach-accent)' }}
                strokeWidth={2.2}
                aria-hidden="true"
              />
              <h2 className="wk-label" style={{ color: 'var(--color-text-secondary)' }}>
                Suggested adaptations
              </h2>
            </div>

            {interventions.length > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className="wk-caption tabular-nums mr-1"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {activeIndex + 1} of {interventions.length}
                </span>
                <button
                  type="button"
                  onClick={() => goTo(activeIndex - 1)}
                  disabled={activeIndex === 0}
                  aria-label="Previous adaptation suggestion"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center disabled:opacity-40 transition-opacity"
                  style={{
                    background: 'var(--wk-card)',
                    borderColor: 'var(--color-border-subtle)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => goTo(activeIndex + 1)}
                  disabled={activeIndex >= interventions.length - 1}
                  aria-label="Next adaptation suggestion"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center disabled:opacity-40 transition-opacity"
                  style={{
                    background: 'var(--wk-card)',
                    borderColor: 'var(--color-border-subtle)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div
            ref={trackRef}
            onScroll={handleScroll}
            tabIndex={0}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar focus:outline-none"
          >
            {interventions.map((item, idx) => {
              const affectedCount = item.remainingAffectedCount || item.totalAffectedCount;
              return (
                <article
                  key={item.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Suggestion ${idx + 1} of ${interventions.length}: ${formatSentenceCase(item.title)}`}
                  className="wk-card shrink-0 w-full snap-center flex flex-col gap-3"
                  style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="wk-pill"
                      style={{
                        background: 'rgb(var(--color-coach-accent-rgb) / 0.12)',
                        color: 'var(--color-coach-accent)',
                      }}
                    >
                      {item.badgeLabel}
                    </span>
                    <span className="wk-caption shrink-0 tabular-nums">
                      {affectedCount} {affectedCount === 1 ? 'session' : 'sessions'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h3 className="wk-h1">{formatSentenceCase(item.title)}</h3>
                    <p className="wk-body max-w-prose">{item.rationale}</p>
                  </div>

                  {item.proposedChanges.length > 0 && (
                    <div className="wk-raised flex flex-col gap-1">
                      <span className="wk-label">What changes</span>
                      <ul className="flex flex-col gap-1 mt-1">
                        {item.proposedChanges.map((change, cIdx) => (
                          <li
                            key={`${item.id}-chg-${cIdx}`}
                            className="wk-caption max-w-prose"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {change.humanSummary}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleAccept(item)}
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
                      onClick={() => handleDismiss(item)}
                      className="wk-btn-secondary min-h-[44px] px-4 inline-flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {interventions.length > 1 && (
            <div
              className="flex items-center justify-center gap-1"
              role="tablist"
              aria-label="Choose a suggested adaptation"
            >
              {interventions.map((item, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={`Suggestion ${idx + 1}: ${formatSentenceCase(item.title)}`}
                    onClick={() => goTo(idx)}
                    className="min-w-[28px] min-h-[44px] flex items-center justify-center focus:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="transition-all"
                      style={{
                        width: isSelected ? 20 : 6,
                        height: 6,
                        borderRadius: 9999,
                        background: isSelected
                          ? 'var(--color-coach-accent)'
                          : 'var(--color-border-track)',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};
