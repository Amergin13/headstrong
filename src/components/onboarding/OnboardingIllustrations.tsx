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

/** The plan's sessions: each week's workouts fill in one by one toward completion. */
export const SessionsIllustration: React.FC<{ weeks?: number; perWeek?: number }> = ({ weeks = 6, perWeek = 4 }) => {
  const cols = weeks;
  const rows = perWeek;
  const gapX = 44;
  const gapY = 40;
  const x0 = 160 - ((cols - 1) * gapX) / 2;
  const y0 = 112 - ((rows - 1) * gapY) / 2;
  return (
    <svg viewBox="0 0 320 224" className="w-full h-full" role="img" aria-label={`${cols} weeks of ${rows} workouts filling in one by one`}>
      {Array.from({ length: cols }, (_, week) =>
        Array.from({ length: rows }, (_, session) => {
          const n = week * rows + session;
          const x = x0 + week * gapX;
          const y = y0 + session * gapY;
          const isLast = week === cols - 1 && session === rows - 1;
          return (
            <g key={n}>
              <circle cx={x} cy={y} r={13} fill="none" stroke="var(--color-border-track)" strokeWidth="2" />
              <circle
                className="ob-pop"
                cx={x}
                cy={y}
                r={13}
                fill={isLast ? 'var(--color-accent-primary)' : 'var(--color-status-neutral)'}
                fillOpacity={0.35 + (n / (cols * rows - 1)) * 0.65}
                style={{ animationDelay: `${150 + n * 55}ms` }}
              />
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
        style={{ animationDelay: `${150 + cols * rows * 55}ms` }}
      />
    </svg>
  );
};

/** Restarting: progress climbs, dips through a missed week, then bounces back higher. */
export const RestartIllustration: React.FC = () => (
  <svg viewBox="0 0 320 224" className="w-full h-full" role="img" aria-label="A progress line that dips during a missed week and climbs back higher">
    <defs>
      <linearGradient id="ob-rs-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--color-status-neutral)" />
        <stop offset="55%" stopColor="var(--color-text-primary)" />
        <stop offset="100%" stopColor="var(--color-accent-primary)" />
      </linearGradient>
    </defs>
    {[64, 112, 160].map((y) => (
      <line key={y} x1="24" x2="296" y1={y} y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" />
    ))}
    <path
      className="ob-draw"
      d="M28 172 C 60 160, 82 140, 112 126"
      fill="none"
      stroke="url(#ob-rs-line)"
      strokeWidth="4"
      strokeLinecap="round"
      pathLength={1}
      style={{ animationDelay: '150ms' }}
    />
    <path
      d="M112 126 C 130 120, 140 150, 158 152"
      fill="none"
      stroke="var(--color-text-muted)"
      strokeOpacity="0.6"
      strokeWidth="3"
      strokeLinecap="round"
      strokeDasharray="2 8"
    />
    <circle className="ob-pop" cx="158" cy="152" r="7" fill="var(--color-bg-canvas)" stroke="var(--color-text-muted)" strokeWidth="2.5" style={{ animationDelay: '700ms' }} />
    <path
      className="ob-draw"
      d="M158 152 C 196 152, 214 100, 246 82 S 284 52, 296 46"
      fill="none"
      stroke="url(#ob-rs-line)"
      strokeWidth="4"
      strokeLinecap="round"
      pathLength={1}
      style={{ animationDelay: '900ms' }}
    />
    <circle className="ob-glow" cx="296" cy="46" r="18" fill="var(--color-accent-primary)" fillOpacity="0.18" />
    <circle className="ob-pop" cx="296" cy="46" r="7" fill="var(--color-accent-primary)" style={{ animationDelay: '1700ms' }} />
  </svg>
);
