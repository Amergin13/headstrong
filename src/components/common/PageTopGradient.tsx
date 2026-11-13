import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PageTopGradientProps {
  /** Element whose top edge marks where #283339 finishes fading into #13181C. */
  markerRef: React.RefObject<HTMLElement | null>;
  /** Optional fallback element when markerRef is not currently mounted. */
  fallbackRef?: React.RefObject<HTMLElement | null>;
  /** Optional element to watch with ResizeObserver for dynamic height changes. */
  observeRef?: React.RefObject<HTMLElement | null>;
  /** Re-measure whenever view state affecting layout changes. */
  deps?: readonly unknown[];
}

const MIN_GRADIENT_HEIGHT = 180;

/** Shared top atmospheric background gradient used on Workout, Program, and Progress screens. */
export const PageTopGradient: React.FC<PageTopGradientProps> = ({
  markerRef,
  fallbackRef,
  observeRef,
  deps = [],
}) => {
  const [gradientEnd, setGradientEnd] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const marker = markerRef.current ?? fallbackRef?.current;
      if (!marker) {
        setGradientEnd(null);
        return;
      }
      const measured = Math.round(marker.getBoundingClientRect().top + window.scrollY);
      setGradientEnd(Math.max(MIN_GRADIENT_HEIGHT, measured));
    };

    measure();
    const rafId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(measure) : 0;
    const targetToObserve = markerRef.current ?? fallbackRef?.current;
    const resizeTarget = observeRef?.current ?? targetToObserve?.parentElement ?? targetToObserve;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && resizeTarget) observer.observe(resizeTarget);
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure).catch(() => undefined);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (gradientEnd === null || typeof document === 'undefined') return null;

  const host = document.getElementById('page-top-gradient-host');

  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: gradientEnd,
        background: 'linear-gradient(180deg, #283339 0%, #13181C 100%)',
        zIndex: host ? undefined : -1,
        pointerEvents: 'none',
      }}
    />,
    host ?? document.body
  );
};
