import React from 'react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { BiometricLog } from '../../engine/types';
import { calculateEngineVitalityScore } from '../../engine/vitality';
import { MovementStandardsReport, levelLabel } from '../../services/movementStandards';

const fig = (px: number) => `calc(${px} * var(--f))`;

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

const muted: React.CSSProperties = { fontSize: `max(12px, ${fig(24)})`, color: 'var(--wk-muted)' };

/**
 * Strength levels (Progress → Strength). Each movement against published standards: Kilgore (ExRx)
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
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          Strength levels
        </h2>
        <p className="wk-body" style={{ marginTop: fig(24) }}>
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
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
          Strength levels
        </h2>
        {overall && <span className="wk-pill">{overall}</span>}
      </div>
      <p className="wk-body" style={{ marginTop: fig(20) }}>
        Your best estimated max on each lift, compared with standards for {report.tableLabel} at your bodyweight.
      </p>

      <div className="w-full h-56" style={{ marginTop: fig(28) }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
            <PolarGrid stroke="#474D50" strokeDasharray="2 2" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 700 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke="#00F19F" strokeWidth={2} fill="#00F19F" fillOpacity={0.2} dot={{ r: 3, fill: '#00F19F' }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-col" style={{ marginTop: fig(32), gap: fig(30) }} aria-label="Level for each movement">
        {rated.map((l) => (
          <li key={l.pillar}>
            <div className="flex items-baseline justify-between" style={{ gap: fig(16) }}>
              <span className="wk-label" style={{ lineHeight: 1.21 }}>
                {l.name}
              </span>
              <span className="font-bold shrink-0" style={{ fontSize: `max(12px, ${fig(26)})`, color: l.logged ? '#fff' : 'var(--wk-muted)' }}>
                {l.logged ? `${l.tier} ${l.subDivision}` : 'Not logged yet'}
              </span>
            </div>
            {l.logged && (
              <>
                <div
                  className="wk-bar"
                  style={{ marginTop: fig(14) }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={l.progress ?? 0}
                  aria-label={l.next ? `${l.name}: ${l.progress}% of the way to ${l.next}` : `${l.name}: top level`}
                >
                  <div style={{ width: `${l.next ? l.progress ?? 0 : 100}%` }} />
                </div>
                <div className="flex justify-between" style={{ ...muted, marginTop: fig(10), gap: fig(16) }}>
                  <span>{l.next ? `Next: ${l.next}` : 'Top level'}</span>
                  <span>{l.tested ? 'Tested' : 'Estimated'}</span>
                </div>
                {l.firstLevel && l.firstLoggedOn && (
                  <span className="block" style={{ ...muted, marginTop: fig(6) }}>
                    {l.firstLevel} when you started ({new Date(`${l.firstLoggedOn}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {rows?.logged && (
        <p style={{ ...muted, marginTop: fig(28) }}>
          Rows have no published strength standard, so they have no level.
        </p>
      )}

      <div className="flex items-end justify-between" style={{ marginTop: fig(40), gap: fig(20) }}>
        <span className="wk-label" style={{ lineHeight: 1.21 }}>
          Cardio &amp; recovery
          {cardio > 0 && (latestBiometrics?.restingHr || 0) > 0 ? ` • ${latestBiometrics.restingHr} bpm resting` : ''}
        </span>
        <span className="font-bold text-white shrink-0" style={{ fontSize: fig(40), lineHeight: 1 }}>
          {cardio > 0 ? `${cardio}/100` : '—'}
        </span>
      </div>
      <div className="wk-bar" style={{ marginTop: fig(30) }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={cardio} aria-label="Cardio and recovery score">
        <div style={{ width: `${Math.max(0, Math.min(100, cardio))}%` }} />
      </div>

      <p style={{ ...muted, marginTop: fig(32) }}>
        "Tested" means your best came from the standard lift (back squat, deadlift, bench press, standing press or chin-up) for 5 reps or fewer.
        Other lifts and higher reps give an estimate. Standards: Dr Lon Kilgore (ExRx); chin-ups from Charles Poliquin's strength ratios.
      </p>
    </section>
  );
};
