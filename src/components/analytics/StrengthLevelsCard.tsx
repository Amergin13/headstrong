import React from 'react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { BiometricLog } from '../../engine/types';
import { calculateEngineVitalityScore } from '../../engine/vitality';
import { MovementStandardsReport, levelLabel } from '../../services/movementStandards';
import { formatSentenceCase } from '../../utils/typography';

const SHORT_NAME: Record<string, string> = {
  Squat: 'Squat',
  Hinge: 'Deadlift',
  'Horizontal Push': 'Bench',
  'Vertical Push': 'Press',
  'Vertical Pull': 'Chin-up',
};

interface StrengthLevelsCardProps {
  report: MovementStandardsReport;
  latestBiometrics: BiometricLog;
}

/**
 * Strength levels (Progress → Strength standards). Each movement against published standards: Kilgore (ExRx)
 * for squat, deadlift, bench and press by sex, bodyweight and age; Poliquin's chin-up ratio for
 * pulling. Rows have no published standard, so no level. A movement never logged shows
 * "Not logged yet", never a level. Built by buildMovementStandards (services/movementStandards.ts).
 */
export const StrengthLevelsCard: React.FC<StrengthLevelsCardProps> = ({ report, latestBiometrics }) => {
  const rated = report.levels.filter((l) => l.source !== 'none');
  const loggedRated = rated.filter((l) => l.logged && l.step !== undefined);

  if (!report.levels.some((l) => l.logged)) {
    return (
      <section aria-label="Strength levels" className="wk-card w-full text-left block">
        <h2 className="wk-h1 leading-tight">
          Strength levels
        </h2>
        <p className="wk-body mt-3 max-w-prose">
          Finish a workout to see your level on each movement, compared with lifters of your sex, bodyweight and age.
        </p>
      </section>
    );
  }

  const overall = loggedRated.length
    ? levelLabel(loggedRated.reduce((t, l) => t + (l.step ?? 0), 0) / loggedRated.length)
    : null;
  // Equal steps: each level is 20 points, each sub-level 5. Unlogged movements sit at 0.
  const radarData = rated.map((l) => ({
    axis: SHORT_NAME[l.pillar] ?? l.name,
    score: l.logged && l.step !== undefined ? Math.round(l.step * 5 + ((l.progress ?? 0) / 100) * 5) : 0,
  }));
  const cardio = calculateEngineVitalityScore(latestBiometrics);
  const rows = report.levels.find((l) => l.pillar === 'Horizontal Pull');

  return (
    <section aria-label="Strength levels" className="wk-card w-full text-left block">
      <div className="flex items-start justify-between gap-3">
        <h2 className="wk-h1 leading-tight">
          Strength levels
        </h2>
        {overall && <span className="wk-pill shrink-0">{overall}</span>}
      </div>
      <p className="wk-body mt-3 max-w-prose">
        Your best estimated max on each lift, compared with standards for {report.tableLabel} at your bodyweight.
      </p>

      <div className="w-full h-56 mt-4" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 340, height: 224 }}>
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
            <PolarGrid stroke="var(--color-bg-surface-control)" strokeDasharray="2 2" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke="var(--color-accent-primary)" strokeWidth={2} fill="var(--color-accent-primary)" fillOpacity={0.2} dot={{ r: 3, fill: 'var(--color-accent-primary)' }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-col mt-4 gap-4" aria-label="Level for each movement">
        {rated.map((l) => (
          <li key={l.pillar}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="wk-subhead leading-tight">
                {formatSentenceCase(l.name)}
              </span>
              <span
                className="text-xs shrink-0 tabular-nums"
                style={{
                  fontWeight: l.logged ? 500 : 400,
                  color: l.logged ? 'var(--color-text-secondary)' : 'var(--wk-muted)',
                }}
              >
                {l.logged ? `${l.tier} ${l.subDivision}` : 'Not logged yet'}
              </span>
            </div>
            {l.logged && (
              <>
                <div
                  className="wk-bar mt-2"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={l.progress ?? 0}
                  aria-label={l.next ? `${l.name}: ${l.progress}% of the way to ${l.next}` : `${l.name}: top level`}
                >
                  <div style={{ width: `${l.next ? l.progress ?? 0 : 100}%` }} />
                </div>
                <div className="wk-caption flex justify-between gap-2 mt-2">
                  <span>{l.next ? `Next: ${l.next}` : 'Top level'}</span>
                  <span>{l.tested ? 'Tested' : 'Estimated'}</span>
                </div>
                {l.firstLevel && l.firstLoggedOn && (
                  <span className="wk-caption block mt-1">
                    {l.firstLevel} when you started ({new Date(`${l.firstLoggedOn}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {rows?.logged && (
        <p className="wk-caption mt-4 max-w-prose">
          Rows have no published strength standard, so they have no level.
        </p>
      )}

      <div className="flex items-end justify-between gap-3 mt-5">
        <span className="wk-meta-title leading-tight">
          Cardio &amp; recovery
          {cardio > 0 && (latestBiometrics?.restingHr || 0) > 0 ? ` · ${latestBiometrics.restingHr} bpm resting` : ''}
        </span>
        <span className="wk-number shrink-0 leading-none">
          {cardio > 0 ? `${cardio}/100` : '—'}
        </span>
      </div>
      <div className="wk-bar mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={cardio} aria-label="Cardio and recovery score">
        <div style={{ width: `${Math.max(0, Math.min(100, cardio))}%` }} />
      </div>

      <p className="wk-caption mt-4 max-w-prose">
        &quot;Tested&quot; means your best came from the standard lift (back squat, deadlift, bench press, standing press or chin-up) for 5 reps or fewer.
        Other lifts and higher reps give an estimate. Standards: Dr Lon Kilgore (ExRx); chin-ups from Charles Poliquin&apos;s strength ratios.
      </p>
    </section>
  );
};
