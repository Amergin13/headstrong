import React from 'react';

/**
 * Onboarding illustrations using strictly Treise Slate (`--color-status-neutral` / `--color-text-primary`)
 * for structural maps and Positive Mint (`--color-accent-primary`) for progression milestones.
 * Info Blue (`--color-status-info`) remains reserved strictly for non-progress wearable telemetry.
 * Motion is in index.css (ob-draw, ob-pop, ob-glow) and collapses to the final frame with reduced motion.
 */

/** Identity: rings of a sphere appear from the equator outwards, like the Program page's identity sphere. */
export const IdentityIllustration: React.FC = () => {
  const cx = 160;
  const cy = 112;
  const r = 84;
  const tilt = 0.32;
  const latitudes = [0, 18, -18, 36, -36, 54, -54, 70, -70];
  return (
    <svg viewBox="0 0 320 224" className="w-full h-full" role="img" aria-label="A sphere of light forming ring by ring">
      <defs>
        <radialGradient id="ob-id-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-accent-primary)" stopOpacity="0.22" />
          <stop offset="60%" stopColor="var(--color-text-primary)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--color-bg-canvas)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ob-id-body" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="var(--color-text-primary)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--color-text-primary)" stopOpacity="0.02" />
        </radialGradient>
      </defs>
      <circle className="ob-glow" cx={cx} cy={cy} r={110} fill="url(#ob-id-glow)" />
      <circle cx={cx} cy={cy} r={r} fill="url(#ob-id-body)" stroke="var(--color-border-strong)" strokeWidth="1" />
      {latitudes.map((lat, i) => {
        const rad = (lat * Math.PI) / 180;
        const rx = r * Math.cos(rad);
        const y = cy - r * Math.sin(rad) * Math.cos(Math.asin(tilt));
        const colour = lat === 0 ? 'var(--color-accent-primary)' : i % 2 === 0 ? 'var(--color-status-neutral)' : 'var(--color-text-primary)';
        return (
          <ellipse
            key={lat}
            className="ob-draw"
            cx={cx}
            cy={y}
            rx={rx}
            ry={rx * tilt}
            fill="none"
            stroke={colour}
            strokeWidth={lat === 0 ? 3 : 2.2}
            strokeOpacity={1 - Math.abs(lat) / 130}
            pathLength={1}
            style={{ animationDelay: `${200 + i * 140}ms` }}
          />
        );
      })}
      <circle className="ob-pop" cx={cx} cy={cy} r={5} fill="var(--color-accent-primary)" style={{ animationDelay: '1500ms' }} />
    </svg>
  );
};

/** The plan's sessions: Day 1 ready to start, building across 6 weeks toward completion. */
export const SessionsIllustration: React.FC<{ weeks?: number; perWeek?: number }> = ({ weeks = 6, perWeek = 4 }) => {
  const cols = weeks;
  const rows = perWeek;
  const gapX = 44;
  const gapY = 40;
  const x0 = 160 - ((cols - 1) * gapX) / 2;
  const y0 = 112 - ((rows - 1) * gapY) / 2;
  const total = cols * rows;
  return (
    <svg viewBox="0 0 320 224" className="w-full h-full" role="img" aria-label={`${cols} weeks of ${rows} planned sessions leading to session ${total}`}>
      {Array.from({ length: cols }, (_, week) =>
        Array.from({ length: rows }, (_, session) => {
          const n = week * rows + session;
          const x = x0 + week * gapX;
          const y = y0 + session * gapY;
          const isFirst = n === 0;
          const isLast = week === cols - 1 && session === rows - 1;
          return (
            <g key={n}>
              <circle
                cx={x}
                cy={y}
                r={13}
                fill={isFirst ? 'var(--color-status-positive-soft)' : 'none'}
                stroke={isFirst ? 'var(--color-accent-primary)' : 'var(--color-border-strong)'}
                strokeOpacity={isFirst ? 0.9 : 0.45 + (n / Math.max(1, total - 1)) * 0.55}
                strokeWidth="2"
              />
              {(isFirst || isLast) && (
                <circle
                  className="ob-pop"
                  cx={x}
                  cy={y}
                  r={isLast ? 7 : 5}
                  fill="var(--color-accent-primary)"
                  fillOpacity={isFirst ? 1 : 0.9}
                  style={{ animationDelay: `${isFirst ? 120 : 120 + total * 24}ms` }}
                />
              )}
              {!isFirst && !isLast && (
                <circle
                  className="ob-pop"
                  cx={x}
                  cy={y}
                  r={3.5}
                  fill="var(--color-status-neutral)"
                  fillOpacity={0.28 + (n / Math.max(1, total - 1)) * 0.42}
                  style={{ animationDelay: `${100 + n * 24}ms` }}
                />
              )}
            </g>
          );
        })
      )}
      <circle
        className="ob-pop"
        cx={x0 + (cols - 1) * gapX}
        cy={y0 + (rows - 1) * gapY}
        r={19}
        fill="none"
        stroke="var(--color-accent-primary)"
        strokeWidth="2.5"
        style={{ animationDelay: `${140 + total * 24}ms` }}
      />
    </svg>
  );
};

/** Restarting: progress climbs, dips through a missed week, then bounces back higher. */
export const RestartIllustration: React.FC = () => (
  <svg viewBox="0 0 360 120" className="w-full h-full" role="img" aria-label="A progress line that dips during a missed week and climbs back higher">
    <defs>
      <linearGradient id="ob-rs-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--color-status-neutral)" />
        <stop offset="55%" stopColor="var(--color-text-primary)" />
        <stop offset="100%" stopColor="var(--color-accent-primary)" />
      </linearGradient>
    </defs>
    {[24, 60, 96].map((y) => (
      <line key={y} x1="12" x2="348" y1={y} y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" />
    ))}
    <path
      className="ob-draw"
      d="M16 102 C 52 94, 84 74, 120 62"
      fill="none"
      stroke="url(#ob-rs-line)"
      strokeWidth="3.5"
      strokeLinecap="round"
      pathLength={1}
      style={{ animationDelay: '60ms', animationDuration: '450ms' }}
    />
    <path
      d="M120 62 C 142 56, 154 84, 178 86"
      fill="none"
      stroke="var(--color-text-muted)"
      strokeOpacity="0.65"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="2 7"
    />
    <circle className="ob-pop" cx="178" cy="86" r="6" fill="var(--color-bg-canvas)" stroke="var(--color-text-muted)" strokeWidth="2.5" style={{ animationDelay: '280ms' }} />
    <path
      className="ob-draw"
      d="M178 86 C 224 86, 250 48, 286 34 S 328 20, 344 16"
      fill="none"
      stroke="url(#ob-rs-line)"
      strokeWidth="3.5"
      strokeLinecap="round"
      pathLength={1}
      style={{ animationDelay: '340ms', animationDuration: '520ms' }}
    />
    <circle className="ob-glow" cx="344" cy="16" r="14" fill="var(--color-accent-primary)" fillOpacity="0.18" />
    <circle className="ob-pop" cx="344" cy="16" r="6" fill="var(--color-accent-primary)" style={{ animationDelay: '720ms' }} />
  </svg>
);
