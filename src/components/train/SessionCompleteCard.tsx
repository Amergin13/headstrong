import React from 'react';
import { CheckCircle2, Dumbbell, TrendingUp, CalendarDays, Activity, Moon } from 'lucide-react';
import { SessionProgressReport } from '../../services/sessionReport';
import { formatReadyTime, MUSCLE_FRIENDLY_NAMES } from '../../engine/recovery';
import { MuscleGroup } from '../../engine/types';
import { useUnits } from '../../utils/unitsContext';
import { triggerHaptic } from '../../utils/haptics';

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

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="space-y-2.5 pt-4 border-t border-white/[0.06]">
    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
      {icon}
      {title}
    </h3>
    {children}
  </section>
);

export const SessionCompleteCard: React.FC<SessionCompleteCardProps> = ({
  report,
  limitingMuscles,
  onOpenProgram,
  onTrainAnyway,
}) => {
  const units = useUnits();
  const { session, next, program, records, firstTimeExercises, strengthLevels, muscles, trends } = report;
  const iconClass = 'w-4 h-4 stroke-[2]';

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
    <article aria-labelledby="session-complete-title" className="biometric-card p-5 sm:p-6 space-y-4">
      {/* 1. Lead: today is done, and when the next session is */}
      <header className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
          <CheckCircle2 className="w-6 h-6 stroke-[2]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="session-complete-title" className="text-lg font-extrabold text-white leading-tight">
            Today's session is complete
          </h2>
          {next ? (
            <p className="text-sm text-slate-300 mt-1">
              Your next session is <strong className="text-white">{nextSessionWhen(next.daysUntil)}</strong>:{' '}
              {next.name}, ready {formatReadyTime(next.readyAt)}.
            </p>
          ) : (
            <p className="text-sm text-slate-300 mt-1">Rest up. Your muscles grow while they recover.</p>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-white/[0.04] px-3 py-2">
            <dt className="text-xs text-slate-400">{s.label}</dt>
            <dd className="text-base font-bold text-white">{s.value}</dd>
          </div>
        ))}
      </dl>
      {session.volumeChangePct !== undefined && (
        <p className="text-xs text-slate-300">
          {session.volumeChangePct >= 0 ? (
            <>
              You lifted <strong className="text-emerald-400">{session.volumeChangePct}% more</strong> than last time you did
              this session.
            </>
          ) : (
            <>You lifted {Math.abs(session.volumeChangePct)}% less than last time you did this session.</>
          )}
        </p>
      )}

      {/* 2. Program context */}
      <Section title="Your program" icon={<CalendarDays className={iconClass} aria-hidden="true" />}>
        {program.kind === 'plan' ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-200">
                Workout {program.workoutNumber} of {program.totalWorkouts} done
              </span>
              <span className="text-slate-400">
                Week {program.week} of {program.totalWeeks}
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-white/[0.06] overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={program.totalWorkouts}
              aria-valuenow={program.workoutNumber}
              aria-label="Program progress"
            >
              <div
                className="h-full bg-emerald-400 rounded-full"
                style={{ width: `${(program.workoutNumber / program.totalWorkouts) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-300">
            {program.sessionsLast7Days} session{program.sessionsLast7Days === 1 ? '' : 's'} in the last 7 days •{' '}
            {program.totalSessions} in total
          </p>
        )}
      </Section>

      {/* 3. Strength */}
      <Section title="Strength" icon={<Dumbbell className={iconClass} aria-hidden="true" />}>
        {records.length === 0 && firstTimeExercises.length === 0 && strengthLevels.length === 0 && (
          <p className="text-xs text-slate-300">
            You matched your previous bests. Next time, aim for one more rep or a little more weight.
          </p>
        )}
        {records.length > 0 && (
          <ul className="space-y-1.5" aria-label="New personal bests">
            {records.map((r) => (
              <li key={r.exerciseName} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-200">{r.exerciseName}</span>
                <span className="text-emerald-400 font-bold text-right">
                  {r.kind === 'reps' ? (
                    <>
                      Most reps yet: {r.newKg}
                      <span className="text-slate-400 font-medium"> (was {r.previousKg})</span>
                    </>
                  ) : r.kind === 'heavier' && r.isBodyweight ? (
                    <>
                      Most added weight: +{units.format(r.newKg)}
                      <span className="text-slate-400 font-medium">
                        {' '}
                        (was {r.previousKg > 0 ? `+${units.format(r.previousKg)}` : 'bodyweight only'})
                      </span>
                    </>
                  ) : (
                    <>
                      {r.kind === 'heavier' ? 'Heaviest yet' : 'Estimated max up'}: {units.format(r.newKg)}
                      <span className="text-slate-400 font-medium"> (was {units.format(r.previousKg)})</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {firstTimeExercises.length > 0 && (
          <p className="text-xs text-slate-300">
            First time logged: {firstTimeExercises.join(', ')}. These numbers are your starting point.
          </p>
        )}
        {strengthLevels.length > 0 && (
          <ul className="space-y-2" aria-label="Strength levels">
            {strengthLevels.map((l) => (
              <li key={l.pillar} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-200">{PILLAR_NAMES[l.pillar] || l.pillar}</span>
                  <span className={l.rankedUp ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                    {l.tier} {l.subDivision}
                    {l.rankedUp && l.previousTier ? ` (up from ${l.previousTier} ${l.previousSubDivision})` : ''}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={l.progressPct}
                  aria-label={`${PILLAR_NAMES[l.pillar] || l.pillar} progress to next level`}
                >
                  <div className="h-full bg-brand-primary rounded-full" style={{ width: `${l.progressPct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 4. Muscle growth this week (knowledge graph targets) */}
      {muscles.length > 0 && (
        <Section title="Muscle growth this week" icon={<Activity className={iconClass} aria-hidden="true" />}>
          <ul className="space-y-2" aria-label="Weekly sets per muscle">
            {muscles.map((m) => {
              const pct = Math.min(100, (m.weeklySets / Math.max(1, m.targetMax)) * 100);
              return (
                <li key={m.muscleKey} className="space-y-1">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-200">{m.name}</span>
                    <span className="text-slate-300 text-right">
                      {m.weeklySets} of {m.targetMin}–{m.targetMax} sets (+{m.setsThisSession} today)
                      <span className={m.status === 'on-track' ? 'text-emerald-400' : 'text-amber-400'}>
                        {m.status === 'below' ? ' • building up' : m.status === 'above' ? ' • above target' : ' • on target'}
                      </span>
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={m.targetMax}
                    aria-valuenow={m.weeklySets}
                    aria-label={`${m.name} weekly sets`}
                  >
                    <div
                      className={`h-full rounded-full ${m.status === 'on-track' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-400">Weekly targets are set for your goal and how each muscle recovers.</p>
        </Section>
      )}

      {/* 5. Over time */}
      {trends.length > 0 && (
        <Section title="Since you started" icon={<TrendingUp className={iconClass} aria-hidden="true" />}>
          <ul className="space-y-1.5" aria-label="Strength since your first session">
            {trends.slice(0, 5).map((t) => (
              <li key={t.exerciseName} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-200">{t.exerciseName}</span>
                <span className={t.changePct > 0 ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                  {t.changePct > 0 ? `+${t.changePct}% stronger` : `${t.changePct}% vs your first session`}
                  <span className="text-slate-400 font-medium"> over {t.sessions} sessions</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 6. Recovery before the next session */}
      {limitingMuscles.length > 0 && (
        <Section title="Recovering now" icon={<Moon className={iconClass} aria-hidden="true" />}>
          <ul className="space-y-2" aria-label="Muscle recovery">
            {limitingMuscles.slice(0, 4).map((m) => (
              <li key={m.muscle} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{MUSCLE_FRIENDLY_NAMES[m.muscle]}</span>
                  <span className="text-slate-400">
                    {m.recoveryPct}% • ready {formatReadyTime(m.readyAt)}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={m.recoveryPct}
                  aria-label={`${MUSCLE_FRIENDLY_NAMES[m.muscle]} recovery`}
                >
                  <div className="h-full bg-sky-400 rounded-full" style={{ width: `${m.recoveryPct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex flex-col gap-2 pt-1">
        {onOpenProgram && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenProgram();
            }}
            className="w-full min-h-[48px] rounded-2xl bg-white text-slate-950 text-sm font-bold"
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
          className="w-full min-h-[44px] rounded-2xl text-xs font-semibold text-slate-400 hover:text-white"
        >
          Train anyway
        </button>
      </div>
    </article>
  );
};
