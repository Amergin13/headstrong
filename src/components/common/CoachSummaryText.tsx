import React from 'react';

interface CoachSummaryTextProps {
  /** Narrative text (newline-separated lines or multi-sentence summary). */
  text: string;
  /** Optional animation key override when swapping from fallback to model text. */
  swapKey?: string;
  /** Split mode: `'lines'` enforces newline lines (2-line card briefs); `'sentences'` splits Sentence 1 vs trailing sentences. */
  splitBy?: 'lines' | 'sentences';
  /** Optional left accent border cue for high-signal callout blocks. */
  accentRail?: boolean;
  className?: string;
}

function extractSummaryParts(text: string, splitBy: 'lines' | 'sentences'): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (splitBy === 'lines' || clean.includes('\n')) {
    return clean
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2);
  }
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return [clean];
  return [sentences[0], sentences.slice(1).join(' ')];
}

/**
 * Shared Shift Nudge 2-tier typographic renderer for AI-written & fallback coaching summaries.
 * Both tiers share the 16px Body role (Rule of Four) and differentiate via weight (500 vs 400)
 * and semantic ink contrast (--color-text-primary vs --color-text-secondary) inside 45-60ch.
 */
export const CoachSummaryText: React.FC<CoachSummaryTextProps> = ({
  text,
  swapKey,
  splitBy = 'sentences',
  accentRail = false,
  className = '',
}) => {
  const parts = extractSummaryParts(text, splitBy);
  if (parts.length === 0) return null;

  return (
    <div
      key={swapKey ?? text}
      className={`wk-text-swap flex flex-col gap-1 text-left ${
        accentRail ? 'pl-3 border-l-2' : ''
      } ${className}`.trim()}
      style={{
        maxWidth: '58ch',
        ...(accentRail ? { borderColor: 'var(--color-accent-primary)' } : {}),
      }}
      aria-live="polite"
    >
      <p
        className="wk-body font-medium m-0"
        style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}
      >
        {parts[0]}
      </p>
      {parts[1] && (
        <p
          className="wk-body m-0"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {parts[1]}
        </p>
      )}
    </div>
  );
};
