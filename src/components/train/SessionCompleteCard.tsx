import React from 'react';
import { Check } from 'lucide-react';
import { SessionProgressReport } from '../../services/sessionReport';
import { formatReadyTime, MUSCLE_FRIENDLY_NAMES } from '../../engine/recovery';
import { MuscleGroup } from '../../engine/types';
import { useUnits } from '../../utils/unitsContext';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface SessionCompleteCardProps {
  report: SessionProgressReport;
  /** Muscles from the next session that are still recovering. */
  limitingMuscles: { muscle: MuscleGroup; recoveryPct: number; readyAt: number }[];
  onOpenProgram?: () => void;
  onTrainAnyway: () => void;
}

const PILLAR_NAMES: Record<string, string> = {
  Squat: 'Squat',
  Hinge: 'Hip hinge',
  'Horizontal Push': 'Pressing',
  'Vertical Push': 'Overhead pressing',
  'Horizontal Pull': 'Rowing',
  'Vertical Pull': 'Pulling down',
};

function nextSessionWhen(daysUntil: number): string {
  if (daysUntil <= 0) return 'later today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginTop: fig(48), paddingTop: fig(40), borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}>
    <h3 className="wk-label" style={{ color: 'var(--wk-muted)', marginBottom: fig(24) }}>
      {title}
    </h3>
    {children}
  </section>
);

/** Label on the left, value on the right, one line per item. */
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <li className="flex items-baseline justify-between" style={{ gap: fig(24) }}>
    <span className="font-semibold text-white" style={{ fontSize: fig(26) }}>
      {label}
    </span>
    <span className="text-right" style={{ fontSize: fig(26), color: 'var(--wk-body)' }}>
      {children}
    </span>
  </li>
);

const Bar: React.FC<{ pct: number; color?: string; label: string; max?: number; value?: number }> = ({ pct, color, label, max = 100, value }) => (
  <div
    className="wk-bar"
    style={{ marginTop: fig(12) }}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={value ?? Math.round(pct)}
    aria-label={label}
  >
    <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
  </div>
);

export const SessionCompleteCard: React.FC<SessionCompleteCardProps> = ({
  report,
  limitingMuscles,
  onOpenProgram,
  onTrainAnyway,
}) => {
  const units = useUnits();
  const { session, next, program, records, firstTimeExercises, strengthLevels, muscles, trends } = report;
  const accent = 'var(--wk-accent)';

  const stats: { label: string; value: string }[] = [
    { label: 'Working sets', value: String(session.workingSets) },
    { label: 'Exercises', value: String(session.exerciseCount) },
  ];
  if (session.volumeKg > 0) {
    stats.push({ label: 'Total lifted', value: `${Math.round(units.toDisplay(session.volumeKg)).toLocaleString()} ${units.unit}` });
  }
  if (session.durationMin) stats.push({ label: 'Time', value: `${session.durationMin} min` });
  if (session.whoopStrain) stats.push({ label: 'Whoop strain', value: session.whoopStrain.toFixed(1) });

  return (
    <article aria-labelledby="session-complete-title" className="wk-card">
      {/* 1. Lead: today is done, and when the next session is */}
      <header className="flex items-start" style={{ gap: fig(28) }}>
        <span
          className="rounded-full flex items-center justify-center shrink-0"
          style={{ width: fig(72), height: fig(72), background: accent }}
        >
          <Check style={{ width: fig(40), height: fig(40), color: '#13181C' }} strokeWidth={3.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="session-complete-title" className="wk-h1">
            Today's session is complete
          </h2>
          <p className="wk-body" style={{ marginTop: fig(12) }}>
            {next ? (
              <>
                Your next session is <strong className="text-white">{nextSessionWhen(next.daysUntil)}</strong>: {next.name},
                ready {formatReadyTime(next.readyAt)}.
              </>
            ) : (
              'Rest up. Your muscles grow while they recover.'
            )}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2" style={{ gap: fig(16), marginTop: fig(40) }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: 'var(--wk-raised)', borderRadius: fig(15), padding: `${fig(20)} ${fig(24)}` }}>
            <dt className="wk-caption">{s.label}</dt>
            <dd className="font-bold text-white" style={{ fontSize: fig(36), marginTop: fig(6) }}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      {session.volumeChangePct !== undefined && (
        <p className="wk-body" style={{ marginTop: fig(20) }}>
          {session.volumeChangePct >= 0 ? (
            <>
              You lifted <strong style={{ color: accent }}>{session.volumeChangePct}% more</strong> than last time you did this
              session.
            </>
          ) : (
            <>You lifted {Math.abs(session.volumeChangePct)}% less than last time you did this session.</>
          )}
        </p>
      )}

      {/* 2. Program context */}
      <Section title="Your program">
        {program.kind === 'plan' ? (
          <>
            <ul>
              <Row label={`Workout ${program.workoutNumber} of ${program.totalWorkouts} done`}>
                Week {program.week} of {program.totalWeeks}
              </Row>
            </ul>
            <Bar
              pct={(program.workoutNumber / program.totalWorkouts) * 100}
              label="Program progress"
              max={program.totalWorkouts}
              value={program.workoutNumber}
            />
          </>
        ) : (
          <p className="wk-body">
            {program.sessionsLast7Days} session{program.sessionsLast7Days === 1 ? '' : 's'} in the last 7 days •{' '}
            {program.totalSessions} in total
          </p>
        )}
      </Section>

      {/* 3. Strength */}
      <Section title="Strength">
        {records.length === 0 && firstTimeExercises.length === 0 && strengthLevels.length === 0 && (
          <p className="wk-body">You matched your previous bests. Next time, aim for one more rep or a little more weight.</p>
        )}
        {records.length > 0 && (
          <ul className="flex flex-col" style={{ gap: fig(16) }} aria-label="New personal bests">
            {records.map((r) => (
              <Row key={r.exerciseName} label={r.exerciseName}>
                <strong style={{ color: accent }}>
                  {r.kind === 'reps'
                    ? `Most reps yet: ${r.newKg}`
                    : r.kind === 'heavier' && r.isBodyweight
                    ? `Most added weight: +${units.format(r.newKg)}`
                    : `${r.kind === 'heavier' ? 'Heaviest yet' : 'Estimated max up'}: ${units.format(r.newKg)}`}
                </strong>{' '}
                (was{' '}
                {r.kind === 'reps'
                  ? r.previousKg
                  : r.isBodyweight
                  ? r.previousKg > 0
                    ? `+${units.format(r.previousKg)}`
                    : 'bodyweight only'
                  : units.format(r.previousKg)}
                )
              </Row>
            ))}
          </ul>
        )}
        {firstTimeExercises.length > 0 && (
          <p className="wk-body" style={{ marginTop: records.length > 0 ? fig(20) : 0 }}>
            First time logged: {firstTimeExercises.join(', ')}. These numbers are your starting point.
          </p>
        )}
        {strengthLevels.length > 0 && (
          <ul className="flex flex-col" style={{ gap: fig(24), marginTop: fig(24) }} aria-label="Strength levels">
            {strengthLevels.map((l) => (
              <li key={l.pillar}>
                <ul>
                  <Row label={PILLAR_NAMES[l.pillar] || l.pillar}>
                    <span style={l.rankedUp ? { color: accent, fontWeight: 700 } : undefined}>
                      {l.tier} {l.subDivision}
                      {l.rankedUp && l.previousTier ? ` (up from ${l.previousTier} ${l.previousSubDivision})` : ''}
                    </span>
                  </Row>
                </ul>
                <Bar pct={l.progressPct} label={`${PILLAR_NAMES[l.pillar] || l.pillar} progress to next level`} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 4. Muscle growth this week (knowledge graph targets) */}
      {muscles.length > 0 && (
        <Section title="Muscle growth this week">
          <ul className="flex flex-col" style={{ gap: fig(24) }} aria-label="Weekly sets per muscle">
            {muscles.map((m) => (
              <li key={m.muscleKey}>
                <ul>
                  <Row label={m.name}>
                    {m.weeklySets} of {m.targetMin}–{m.targetMax} sets (+{m.setsThisSession} today)
                    <span style={{ color: m.status === 'on-track' ? accent : '#FFC83D' }}>
                      {m.status === 'below' ? ' • building up' : m.status === 'above' ? ' • above target' : ' • on target'}
                    </span>
                  </Row>
                </ul>
                <Bar
                  pct={(m.weeklySets / Math.max(1, m.targetMax)) * 100}
                  color={m.status === 'on-track' ? undefined : '#FFC83D'}
                  label={`${m.name} weekly sets`}
                  max={m.targetMax}
                  value={m.weeklySets}
                />
              </li>
            ))}
          </ul>
          <p className="wk-caption" style={{ marginTop: fig(20) }}>
            Weekly targets are set for your goal and how each muscle recovers.
          </p>
        </Section>
      )}

      {/* 5. Over time */}
      {trends.length > 0 && (
        <Section title="Since you started">
          <ul className="flex flex-col" style={{ gap: fig(16) }} aria-label="Strength since your first session">
            {trends.slice(0, 5).map((t) => (
              <Row key={t.exerciseName} label={t.exerciseName}>
                <strong style={t.changePct > 0 ? { color: accent } : undefined}>
                  {t.changePct > 0 ? `+${t.changePct}% stronger` : `${t.changePct}% vs your first session`}
                </strong>{' '}
                over {t.sessions} sessions
              </Row>
            ))}
          </ul>
        </Section>
      )}

      {/* 6. Recovery before the next session */}
      {limitingMuscles.length > 0 && (
        <Section title="Recovering now">
          <ul className="flex flex-col" style={{ gap: fig(24) }} aria-label="Muscle recovery">
            {limitingMuscles.slice(0, 4).map((m) => (
              <li key={m.muscle}>
                <ul>
                  <Row label={MUSCLE_FRIENDLY_NAMES[m.muscle]}>
                    {m.recoveryPct}% • ready {formatReadyTime(m.readyAt)}
                  </Row>
                </ul>
                <Bar pct={m.recoveryPct} color="#8FD3FF" label={`${MUSCLE_FRIENDLY_NAMES[m.muscle]} recovery`} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex flex-col" style={{ gap: fig(16), marginTop: fig(48) }}>
        {onOpenProgram && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenProgram();
            }}
            className="wk-button"
            style={{ background: accent, color: '#13181C' }}
          >
            View my program
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('warning');
            onTrainAnyway();
          }}
          className="wk-button"
          style={{ background: 'var(--wk-pill)', color: '#fff' }}
        >
          Train anyway
        </button>
      </div>
    </article>
  );
};
