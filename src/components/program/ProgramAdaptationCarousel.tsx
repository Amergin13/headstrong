import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { CoachIntervention } from '../../services/coachInterventions';
import { formatSentenceCase } from '../../utils/typography';
import { triggerHaptic } from '../../utils/haptics';

type ResolvingPhase = 'accepted' | 'exiting' | 'dismissing';

interface ResolvingEntry {
  item: CoachIntervention;
  index: number;
  phase: ResolvingPhase;
}

const ACCEPT_HOLD_MS = 900;
const ACCEPT_EXIT_MS = 220;
const DISMISS_EXIT_MS = 180;

export interface ProgramAdaptationCarouselProps {
  /** Priority-ordered adaptation suggestions; each renders as its own standalone slide card. */
  interventions: CoachIntervention[];
  /** Executes the adaptation and persists it across the product. */
  onAccept: (intervention: CoachIntervention) => void;
  /** Dismisses the suggestion and persists dismissal across the product. */
  onDismiss: (intervention: CoachIntervention) => void;
  className?: string;
}

export const ProgramAdaptationCarousel: React.FC<ProgramAdaptationCarouselProps> = ({
  interventions,
  onAccept,
  onDismiss,
  className = '',
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [resolving, setResolving] = useState<Record<string, ResolvingEntry>>({});
  const trackRef = useRef<HTMLDivElement>(null);
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

  // Merge active suggestions with any briefly-resolving slides so Accept shows in-card Mint
  // confirmation before smoothly auto-dismissing (zero separate receipt/undo components).
  const slides = useMemo(() => {
    const list: { item: CoachIntervention; phase?: ResolvingPhase }[] = interventions.map((item) => ({
      item,
      phase: resolving[item.id]?.phase,
    }));
    const presentIds = new Set(list.map((s) => s.item.id));
    const detached = Object.values(resolving)
      .filter((entry) => !presentIds.has(entry.item.id))
      .sort((a, b) => a.index - b.index);
    for (const entry of detached) {
      const insertAt = Math.max(0, Math.min(list.length, entry.index));
      list.splice(insertAt, 0, { item: entry.item, phase: entry.phase });
    }
    return list;
  }, [interventions, resolving]);

  useEffect(() => {
    if (slides.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= slides.length) {
      const clamped = Math.max(0, slides.length - 1);
      setActiveIndex(clamped);
      const track = trackRef.current;
      const child = track?.children[clamped] as HTMLElement | undefined;
      if (track && child) {
        track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
      }
    }
  }, [activeIndex, slides.length]);

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
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
    if (e.key === 'ArrowRight' && activeIndex < slides.length - 1) {
      e.preventDefault();
      goTo(activeIndex + 1);
    } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
      e.preventDefault();
      goTo(activeIndex - 1);
    }
  };

  const handleAccept = (item: CoachIntervention, idx: number) => {
    if (resolving[item.id]) return;
    triggerHaptic('success');
    setResolving((prev) => ({
      ...prev,
      [item.id]: { item, index: idx, phase: 'accepted' },
    }));
    onAccept(item);
    schedule(() => {
      setResolving((prev) =>
        prev[item.id] ? { ...prev, [item.id]: { ...prev[item.id], phase: 'exiting' } } : prev
      );
    }, ACCEPT_HOLD_MS);
    schedule(() => {
      setResolving((prev) => {
        if (!prev[item.id]) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, ACCEPT_HOLD_MS + ACCEPT_EXIT_MS);
  };

  const handleDismiss = (item: CoachIntervention, idx: number) => {
    if (resolving[item.id]) return;
    triggerHaptic('light');
    setResolving((prev) => ({
      ...prev,
      [item.id]: { item, index: idx, phase: 'dismissing' },
    }));
    onDismiss(item);
    schedule(() => {
      setResolving((prev) => {
        if (!prev[item.id]) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, DISMISS_EXIT_MS);
  };

  if (slides.length === 0) return null;

  const isMulti = slides.length > 1;

  return (
    <section
      aria-label="Suggested program adaptations"
      aria-roledescription="carousel"
      className={`flex flex-col gap-3 ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
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

        {isMulti && (
          <span
            className="wk-caption tabular-nums shrink-0"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {Math.min(activeIndex + 1, slides.length)} of {slides.length}
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        onScroll={handleScroll}
        tabIndex={0}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar focus:outline-none"
      >
        {slides.map(({ item, phase }, idx) => {
          const affectedCount = item.remainingAffectedCount || item.totalAffectedCount;
          const isAccepted = phase === 'accepted' || phase === 'exiting';
          const isFadingOut = phase === 'exiting' || phase === 'dismissing';

          return (
            <article
              key={item.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`Suggestion ${idx + 1} of ${slides.length}: ${formatSentenceCase(item.title)}`}
              className={`wk-card shrink-0 snap-start flex flex-col gap-3 transition-all duration-200 ${
                isMulti ? 'w-[92%]' : 'w-full'
              } ${isFadingOut ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'}`}
              style={{
                borderColor: isAccepted
                  ? 'rgb(var(--color-accent-primary-rgb) / 0.5)'
                  : 'rgb(var(--color-coach-accent-rgb) / 0.35)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="wk-pill"
                  style={
                    isAccepted
                      ? {
                          background: 'var(--color-status-positive-soft)',
                          color: 'var(--wk-accent)',
                        }
                      : {
                          background: 'rgb(var(--color-coach-accent-rgb) / 0.12)',
                          color: 'var(--color-coach-accent)',
                        }
                  }
                >
                  {isAccepted ? 'Applied' : item.badgeLabel}
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
                <ul
                  className="flex flex-col gap-1 pl-3 border-l-2"
                  style={{
                    borderColor: isAccepted
                      ? 'var(--wk-accent)'
                      : 'rgb(var(--color-coach-accent-rgb) / 0.45)',
                  }}
                >
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
              )}

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
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={Boolean(phase)}
                    onClick={() => handleAccept(item, idx)}
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
                    disabled={Boolean(phase)}
                    onClick={() => handleDismiss(item, idx)}
                    className="wk-btn-secondary min-h-[44px] px-4 inline-flex items-center justify-center"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {isMulti && (
        <div
          className="flex items-center justify-center gap-1"
          role="tablist"
          aria-label="Choose a suggested adaptation"
        >
          {slides.map(({ item }, idx) => {
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
    </section>
  );
};
