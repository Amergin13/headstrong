import React from 'react';
import { MovementStandardsReport, SYMMETRY_FLAG_PCT } from '../../services/movementStandards';

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
            </li>
          ))}
          {sideDifferences.map((d) => (
            <li key={d.exerciseId}>
              <p className="wk-body max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
                {d.exerciseName}: your {d.weakerSide} side is doing {d.symmetryPct}% of your {d.weakerSide === 'left' ? 'right' : 'left'} (last{' '}
                {d.sessions === 1 ? 'session' : `${d.sessions} sessions`}).
              </p>
              <p className="wk-caption mt-1 max-w-prose">
                Start each set with your {d.weakerSide} side and match its reps on the other side until they even out.
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="wk-caption mt-4 max-w-prose">
        Pulling is compared with pressing using Charles Poliquin&apos;s strength ratios. Sides are flagged under {SYMMETRY_FLAG_PCT}%, the
        symmetry line used in sports medicine.
      </p>
    </section>
  );
};
