import React from 'react';
import { MovementStandardsReport, SYMMETRY_FLAG_PCT } from '../../services/movementStandards';

const fig = (px: number) => `calc(${px} * var(--f))`;
const muted: React.CSSProperties = { fontSize: `max(12px, ${fig(24)})`, color: 'var(--wk-muted)' };

/**
 * Balance (Progress → Strength standards): imbalances between movements (Poliquin's chin-up to bench ratio,
 * and full-level gaps between lifts on the same Kilgore standards) and left/right differences on
 * single-arm and single-leg lifts logged per side (flagged under 90% symmetry). Built only from the
 * athlete's own logs; with too little data it says what it needs instead of guessing.
 */
export const BalanceCard: React.FC<{ report: MovementStandardsReport }> = ({ report }) => {
  const { imbalances, sideDifferences, levels } = report;
  const loggedCount = levels.filter((l) => l.logged && l.source !== 'none').length;
  const findings = imbalances.length + sideDifferences.length;

  return (
    <section aria-labelledby="balance-title" className="wk-card w-full text-left block">
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <h2 id="balance-title" className="wk-h1" style={{ lineHeight: 1.21 }}>
          Balance
        </h2>
        {loggedCount >= 2 && (
          <span className="wk-pill" style={findings === 0 ? { color: 'var(--wk-accent)' } : { color: '#F5B94A' }}>
            {findings === 0 ? 'Balanced' : `${findings} to work on`}
          </span>
        )}
      </div>

      {loggedCount < 2 && sideDifferences.length === 0 ? (
        <p className="wk-body" style={{ marginTop: fig(20) }}>
          Log at least two main lifts (for example squat and bench) to compare them. On single-arm and single-leg lifts, tap "Log
          each side" to check left against right.
        </p>
      ) : findings === 0 ? (
        <p className="wk-body" style={{ marginTop: fig(20) }}>
          Your lifts are in proportion with each other
          {levels.some((l) => l.pillar === 'Vertical Pull' && l.logged) && levels.some((l) => l.pillar === 'Horizontal Push' && l.logged)
            ? ', and your pulling keeps up with your pressing'
            : ''}
          . Left and right sides are within {100 - SYMMETRY_FLAG_PCT}% of each other where you've logged them.
        </p>
      ) : (
        <ul className="flex flex-col" style={{ marginTop: fig(24), gap: fig(28) }}>
          {imbalances.map((i) => (
            <li key={i.id}>
              <p className="wk-body text-white">{i.message}</p>
              <p style={{ ...muted, marginTop: fig(8) }}>{i.advice}</p>
            </li>
          ))}
          {sideDifferences.map((d) => (
            <li key={d.exerciseId}>
              <p className="wk-body text-white">
                {d.exerciseName}: your {d.weakerSide} side is doing {d.symmetryPct}% of your {d.weakerSide === 'left' ? 'right' : 'left'} (last{' '}
                {d.sessions === 1 ? 'session' : `${d.sessions} sessions`}).
              </p>
              <p style={{ ...muted, marginTop: fig(8) }}>
                Start each set with your {d.weakerSide} side and match its reps on the other side until they even out.
              </p>
            </li>
          ))}
        </ul>
      )}

      <p style={{ ...muted, marginTop: fig(28) }}>
        Pulling is compared with pressing using Charles Poliquin's strength ratios. Sides are flagged under {SYMMETRY_FLAG_PCT}%, the
        symmetry line used in sports medicine.
      </p>
    </section>
  );
};
