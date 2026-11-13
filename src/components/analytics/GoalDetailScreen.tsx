import React from 'react';
import { Check, Minus } from 'lucide-react';
import { AthleteGoal, BodyMeasure, FrequencyMeasure, describeGoalStanding, repsAt } from '../../services/athleteGoals';
import { HABIT_WEEKS } from '../../services/progressOverview';
import { ProgressChart, ProgressPoint } from '../../services/progressSeries';
import { parseLocalDate } from '../../utils/date';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import { TrendChart } from '../common/TrendChart';
import { ProgressChartCard } from './ProgressChartCard';

const fig = (px: number) => `calc(${px} * var(--f))`;
const text = (px: number) => `max(12px, ${fig(px)})`;
const dayMonth = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const Big: React.FC<{ value: string; unit: string }> = ({ value, unit }) => (
  <p className="font-bold text-white tabular-numbers" style={{ fontSize: text(84), lineHeight: 1, marginTop: fig(28) }}>
    {value}
    <span className="font-semibold" style={{ fontSize: text(26), color: 'var(--wk-muted)', marginLeft: fig(14) }}>
      {unit}
    </span>
  </p>
);

const Method: React.FC<{ goal: AthleteGoal }> = ({ goal }) => (
  <section className="wk-card" aria-label="How this goal is measured">
    <h2 className="wk-label">How it's measured</h2>
    <p className="wk-body" style={{ marginTop: fig(12) }}>
      {goal.method}
    </p>
  </section>
);

/** One dot per thing counted (a session, a rep): filled when done. */
const Dots: React.FC<{ filled: number; total: number; label: string }> = ({ filled, total, label }) => (
  <div className="flex flex-wrap" style={{ gap: fig(14), marginTop: fig(36) }} role="img" aria-label={label}>
    {Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        className="rounded-full"
        style={{ width: fig(34), height: fig(34), background: i < filled ? 'var(--wk-accent)' : 'var(--wk-pill)' }}
      />
    ))}
  </div>
);

/** The weekly goal: this week (days), the weeks in the month, and the months in the year. */
const FrequencyDetail: React.FC<{ goal: AthleteGoal; measure: FrequencyMeasure }> = ({ goal, measure }) => {
  const tallest = Math.max(measure.perWeek, ...measure.weeks.map((w) => w.sessions));
  const monthlyTarget = measure.perWeek * 4;
  const tallestMonth = Math.max(monthlyTarget, ...measure.months.map((m) => m.sessions));
  const toHabit = Math.max(0, HABIT_WEEKS - measure.streakWeeks);
  return (
    <>
      <section className="wk-card" aria-label="This week">
        <h2 className="wk-label">This week</h2>
        <Big value={`${measure.thisWeek}/${measure.perWeek}`} unit="sessions" />
        <Dots filled={Math.min(measure.thisWeek, measure.perWeek)} total={measure.perWeek} label={`${measure.thisWeek} of ${measure.perWeek} sessions done this week`} />
        <p className="wk-body" style={{ marginTop: fig(36) }}>
          {measure.thisWeek >= measure.perWeek
            ? 'This week is done. Anything more is a bonus.'
            : `${measure.perWeek - measure.thisWeek} to go before Sunday night.`}
        </p>
      </section>

      <section className="wk-card" aria-label="Week by week">
        <h2 className="wk-label">Week by week</h2>
        <dl className="grid grid-cols-3" style={{ gap: fig(24), marginTop: fig(36) }}>
          {[
            { label: 'In a row', value: measure.streakWeeks },
            { label: `Weeks at ${measure.perWeek}`, value: measure.weeksHit },
            { label: 'Weeks training', value: measure.weeksTracked },
          ].map((s) => (
            <div key={s.label}>
              <dt className="uppercase" style={{ fontSize: text(24), lineHeight: 1.21, color: 'var(--wk-muted)' }}>
                {s.label}
              </dt>
              <dd className="font-bold text-white tabular-numbers" style={{ fontSize: text(56), lineHeight: 1.05, marginTop: fig(10) }}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        {/* Sessions in each week against the target line. */}
        <div
          className="relative flex items-end"
          style={{ gap: fig(10), height: fig(260), marginTop: fig(48) }}
          role="img"
          aria-label={`Sessions in each of the last ${measure.weeks.length} weeks: ${measure.weeks.map((w) => w.sessions).join(', ')}. The target is ${measure.perWeek}.`}
        >
          <div
            className="absolute left-0 right-0"
            style={{ bottom: `${(measure.perWeek / tallest) * 100}%`, borderTop: `${fig(2)} dashed rgba(255,255,255,0.35)` }}
            aria-hidden="true"
          />
          {measure.weeks.map((w) => (
            <div key={w.start} className="flex-1 flex flex-col justify-end h-full" aria-hidden="true">
              <div
                style={{
                  height: `${Math.max(w.sessions > 0 ? 6 : 2, (w.sessions / tallest) * 100)}%`,
                  borderRadius: fig(8),
                  background: w.hit ? 'var(--wk-accent)' : w.current ? '#8FD3FF' : 'var(--wk-pill)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between wk-caption" style={{ marginTop: fig(12) }} aria-hidden="true">
          <span>Week of {dayMonth(measure.weeks[0].start)}</span>
          <span>This week</span>
        </div>
        <p className="wk-body" style={{ marginTop: fig(36) }}>
          {measure.streakWeeks >= HABIT_WEEKS
            ? `${measure.streakWeeks} weeks in a row. Research with new gym members found ${HABIT_WEEKS} weeks at ${measure.perWeek} sessions was what it took to build the habit; from here the goal is to keep it going.`
            : measure.streakWeeks > 0
            ? `${measure.streakWeeks} of ${HABIT_WEEKS} weeks in a row. Research with new gym members found ${HABIT_WEEKS} weeks at ${measure.perWeek} sessions was what it took to build the habit: ${toHabit} to go.`
            : `Research with new gym members found ${HABIT_WEEKS} weeks in a row at ${measure.perWeek} sessions was what it took to build the habit. A missed week doesn't undo the ones before it: the count starts again with your next full week.`}
        </p>
      </section>

      <section className="wk-card" aria-label="Month by month">
        <h2 className="wk-label">Month by month</h2>
        <dl className="grid grid-cols-3" style={{ gap: fig(24), marginTop: fig(36) }}>
          {[
            { label: `Months at ${monthlyTarget}`, value: measure.monthsHit },
            { label: 'Months training', value: measure.monthsTracked },
            { label: 'Monthly target', value: monthlyTarget },
          ].map((s) => (
            <div key={s.label}>
              <dt className="uppercase" style={{ fontSize: text(24), lineHeight: 1.21, color: 'var(--wk-muted)' }}>
                {s.label}
              </dt>
              <dd className="font-bold text-white tabular-numbers" style={{ fontSize: text(56), lineHeight: 1.05, marginTop: fig(10) }}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        <div
          className="relative flex items-end"
          style={{ gap: fig(10), height: fig(220), marginTop: fig(48) }}
          role="img"
          aria-label={`Sessions in each of the last ${measure.months.length} months: ${measure.months.map((m) => m.sessions).join(', ')}. The monthly target is ${monthlyTarget}.`}
        >
          <div
            className="absolute left-0 right-0"
            style={{ bottom: `${(monthlyTarget / tallestMonth) * 100}%`, borderTop: `${fig(2)} dashed rgba(255,255,255,0.35)` }}
            aria-hidden="true"
          />
          {measure.months.map((mo) => (
            <div key={mo.month} className="flex-1 flex flex-col justify-end h-full" aria-hidden="true">
              <div
                style={{
                  height: `${Math.max(mo.sessions > 0 ? 6 : 2, (mo.sessions / tallestMonth) * 100)}%`,
                  borderRadius: fig(8),
                  background: mo.hit ? 'var(--wk-accent)' : mo.current ? '#8FD3FF' : 'var(--wk-pill)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between wk-caption" style={{ marginTop: fig(12) }} aria-hidden="true">
          <span>{measure.months[0].month}</span>
          <span>This month</span>
        </div>
      </section>
      <Method goal={goal} />
    </>
  );
};

/** A strength level, counted in reps at a set weight (or by estimated max when reps aren't a sensible target). */
const StrengthDetail: React.FC<{ goal: AthleteGoal; others: AthleteGoal[]; onOpenGoal: (id: string) => void }> = ({ goal, others, onOpenGoal }) => {
  const units = useUnits();
  const precise = (kg: number) => units.formatPrecise(kg);
  const m = goal.measure;
  if (m.type !== 'reps' && m.type !== 'load') return null;
  return (
    <>
      <section className="wk-card" aria-label={goal.title}>
        <h2 className="wk-label">{m.exerciseName}</h2>
        {m.type === 'reps' ? (
          <>
            <Big value={`${m.currentReps}/${m.targetReps}`} unit={`reps ${repsAt(m, (kg) => units.format(kg))}`} />
            <Dots filled={m.currentReps} total={m.targetReps} label={`${m.currentReps} of ${m.targetReps} reps`} />
            <p className="wk-body" style={{ marginTop: fig(36) }}>
              {m.targetReps} reps {repsAt(m, (kg) => units.format(kg))} reaches {m.level}. Your best set is {m.currentReps}, so{' '}
              {m.targetReps - m.currentReps === 1 ? 'one more rep does it' : `${m.targetReps - m.currentReps} more reps do it`}. You're {m.currentLevel} now.
            </p>
          </>
        ) : (
          <>
            <Big value={precise(Math.max(0, m.targetE1rmKg - m.e1rmKg)).split(' ')[0]} unit={`${units.unit} to go on your estimated max`} />
            <p className="wk-body" style={{ marginTop: fig(36) }}>
              {m.level} needs an estimated max of {precise(m.targetE1rmKg)}; yours is {precise(m.e1rmKg)}. You're {m.currentLevel} now.
            </p>
          </>
        )}
        <p className="wk-caption" style={{ marginTop: fig(20) }}>
          Estimated max {precise(m.e1rmKg)} of {precise(m.targetE1rmKg)}
        </p>
      </section>
      <Method goal={goal} />
      {others.length > 0 && (
        <section className="wk-card" aria-label="Your other strength levels">
          <h2 className="wk-label">Your other strength levels</h2>
          <ul className="flex flex-col" style={{ marginTop: fig(12) }}>
            {others.map((g) => (
              <li key={g.id} style={{ borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenGoal(g.id);
                  }}
                  className="w-full text-left flex items-center justify-between"
                  style={{ gap: fig(24), padding: `${fig(26)} 0`, minHeight: 44 }}
                >
                  <span className="wk-label min-w-0" style={{ lineHeight: 1.21 }}>
                    {g.title}
                  </span>
                  <span className="wk-caption shrink-0 text-right">{describeGoalStanding(g, precise)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

/** A target the athlete set themselves (on one exercise or daily steps). */
const TargetDetail: React.FC<{ goal: AthleteGoal }> = ({ goal }) => {
  const units = useUnits();
  const m = goal.measure;
  if (m.type !== 'target') return null;
  if (m.metric === 'steps') {
    const remaining = Math.max(0, m.target - m.best);
    return (
      <>
        <section className="wk-card" aria-label={goal.title}>
          <h2 className="wk-label">{m.exerciseName}</h2>
          <Big value={`${m.best.toLocaleString()}/${m.target.toLocaleString()}`} unit="steps today" />
          <div
            className="wk-bar"
            style={{ marginTop: fig(36) }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={m.target}
            aria-valuenow={m.best}
            aria-label={`${m.best.toLocaleString()} of ${m.target.toLocaleString()} steps`}
          >
            <div style={{ width: `${Math.min(100, (m.best / m.target) * 100)}%` }} />
          </div>
          <p className="wk-body" style={{ marginTop: fig(36) }}>
            {goal.achieved
              ? `You've reached today's target of ${m.target.toLocaleString()} steps.`
              : m.best > 0
              ? `${m.best.toLocaleString()} steps recorded today: ${remaining.toLocaleString()} to go.`
              : 'No steps recorded today yet. Connect Health Connect or sync your watch to track your daily steps.'}
          </p>
          <p className="wk-caption" style={{ marginTop: fig(20) }}>
            Set on {dayMonth(m.createdOn)}
          </p>
        </section>
        <Method goal={goal} />
      </>
    );
  }
  const byWeight = m.metric === 'weight';
  const best = byWeight ? units.format(m.best) : `${m.best}`;
  const target = byWeight ? units.format(m.target) : `${m.target}`;
  const left = byWeight ? units.format(Math.max(0, m.target - m.best)) : `${Math.max(0, m.target - m.best)} ${m.target - m.best === 1 ? 'rep' : 'reps'}`;
  return (
    <>
      <section className="wk-card" aria-label={goal.title}>
        <h2 className="wk-label">{m.exerciseName}</h2>
        <Big value={`${byWeight ? best.split(' ')[0] : best}/${byWeight ? target.split(' ')[0] : target}`} unit={byWeight ? units.unit : 'reps in one set'} />
        {!byWeight && m.target <= 30 && <Dots filled={Math.min(m.best, m.target)} total={m.target} label={`${m.best} of ${m.target} reps`} />}
        {byWeight && (
          <div className="wk-bar" style={{ marginTop: fig(36) }} role="progressbar" aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={m.best} aria-label={`${best} of ${target}`}>
            <div style={{ width: `${Math.min(100, (m.best / m.target) * 100)}%` }} />
          </div>
        )}
        <p className="wk-body" style={{ marginTop: fig(36) }}>
          {goal.achieved
            ? `You've reached it: ${byWeight ? best : `${best} reps`}${m.bestOn ? ` on ${dayMonth(m.bestOn)}` : ''}. Tell Treise a new target to keep going.`
            : m.best > 0
            ? `Your best is ${byWeight ? best : `${best} reps`}${m.bestOn ? `, on ${dayMonth(m.bestOn)}` : ''}: ${left} to go.`
            : "You haven't logged this exercise yet. It starts counting with your first set."}
        </p>
        <p className="wk-caption" style={{ marginTop: fig(20) }}>
          Set on {dayMonth(m.createdOn)}
        </p>
      </section>
      <Method goal={goal} />
    </>
  );
};

/** The chosen goal: its three signs, how good the evidence is, and weight against strength over time. */
const BodyDetail: React.FC<{
  goal: AthleteGoal;
  measure: BodyMeasure;
  strengthIndex: ProgressPoint[];
  weightIndex: ProgressPoint[];
  supporting: ProgressChart[];
  onLogWeight: () => void;
  onLogMeasurements: () => void;
}> = ({ goal, measure, strengthIndex, weightIndex, supporting, onLogWeight, onLogMeasurements }) => (
  <>
    <section className="wk-card" aria-label={goal.title}>
      <h2 className="wk-label">Signs it's working</h2>
      <Big value={measure.signsMeasured > 0 ? `${measure.signsMet}/${measure.signs.length}` : '—'} unit={measure.signsMeasured > 0 ? 'signs showing' : 'nothing measured yet'} />
      <ul className="flex flex-col" style={{ gap: fig(30), marginTop: fig(44) }}>
        {measure.signs.map((sign) => (
          <li key={sign.id} className="flex items-start" style={{ gap: fig(24) }}>
            <span
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: fig(52),
                height: fig(52),
                marginTop: fig(2),
                background: sign.met === true ? 'var(--wk-accent)' : 'var(--wk-pill)',
                opacity: sign.met === null ? 0.6 : 1,
              }}
              aria-hidden="true"
            >
              {sign.met === true ? (
                <Check style={{ width: fig(30), height: fig(30), color: '#13181C' }} strokeWidth={3} />
              ) : sign.met === false ? (
                <Minus style={{ width: fig(30), height: fig(30), color: '#fff' }} strokeWidth={3} />
              ) : null}
            </span>
            <div className="min-w-0">
              <p className="wk-label" style={{ lineHeight: 1.21 }}>
                {sign.label}
                <span className="sr-only">: {sign.met === true ? 'showing' : sign.met === false ? 'not showing yet' : 'not measured yet'}</span>
              </p>
              <p className="wk-body" style={{ marginTop: fig(8) }}>
                {sign.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>

    <section className="wk-card" aria-label="How sure this is">
      <h2 className="wk-label">How sure this is</h2>
      <p className="wk-body" style={{ marginTop: fig(12) }}>
        {measure.evidenceLabel}
        {measure.nextStep ? ` ${measure.nextStep}` : ''}
      </p>
      {measure.nextStep && (
        <div className="grid grid-cols-2" style={{ gap: fig(16), marginTop: fig(32) }}>
          <button type="button" onClick={onLogWeight} className="wk-button" style={{ background: 'var(--wk-raised)', color: '#fff' }}>
            Log weight
          </button>
          <button type="button" onClick={onLogMeasurements} className="wk-button" style={{ background: 'var(--wk-raised)', color: '#fff' }}>
            Log measurements
          </button>
        </div>
      )}
    </section>

    <section className="wk-card" aria-label="Weight against strength">
      <h2 className="wk-label">Weight against strength</h2>
      <p className="wk-body" style={{ marginTop: fig(12) }}>
        {strengthIndex.length >= 2 && weightIndex.length >= 2
          ? measure.phase === 'Lean Bulk'
            ? 'Both start at 100. Strength rising faster than weight is the pattern of muscle being built; weight rising faster than strength points to fat.'
            : measure.phase === 'Cut / Recomp'
            ? 'Both start at 100. Weight falling while strength holds is the pattern of fat being lost and muscle kept.'
            : 'Both start at 100. Weight level while strength rises is the pattern of staying lean and getting stronger.'
          : strengthIndex.length >= 2
          ? 'Your strength so far, starting at 100. Log your weight to see the two together.'
          : 'This fills in as you repeat workouts and log your weight.'}
      </p>
      <div style={{ marginTop: fig(36) }}>
        <TrendChart
          points={strengthIndex}
          secondary={weightIndex.length >= 2 ? weightIndex : undefined}
          format={(v) => `${Math.round(v)}`}
          height={280}
          label={
            strengthIndex.length >= 2
              ? `Strength index from 100 to ${Math.round(strengthIndex[strengthIndex.length - 1].value)}${
                  weightIndex.length >= 2 ? `; bodyweight index from 100 to ${Math.round(weightIndex[weightIndex.length - 1].value)}` : ''
                }`
              : 'Example chart. Your strength and bodyweight appear here once you have repeated a workout.'
          }
        />
      </div>
      {strengthIndex.length >= 2 && (
        <div className="flex flex-wrap wk-caption" style={{ gap: fig(32), marginTop: fig(20) }} aria-hidden="true">
          <span className="flex items-center" style={{ gap: fig(12) }}>
            <span style={{ width: fig(36), height: fig(6), borderRadius: fig(6), background: 'var(--wk-accent)' }} />
            Strength
          </span>
          {weightIndex.length >= 2 && (
            <span className="flex items-center" style={{ gap: fig(12) }}>
              <span style={{ width: fig(36), height: fig(4), borderRadius: fig(4), background: 'rgba(255,255,255,0.35)' }} />
              Bodyweight
            </span>
          )}
        </div>
      )}
    </section>

    {supporting.map((chart) => (
      <ProgressChartCard key={chart.id} chart={chart} />
    ))}
    <Method goal={goal} />
  </>
);

export interface GoalDetailProps {
  goal: AthleteGoal;
  /** Every goal, for the list of other strength levels. */
  goals: AthleteGoal[];
  strengthIndex: ProgressPoint[];
  weightIndex: ProgressPoint[];
  /** Charts that back the chosen goal when they have data (fat-free mass, waist). */
  supporting: ProgressChart[];
  onOpenGoal: (id: string) => void;
  onLogWeight: () => void;
  onLogMeasurements: () => void;
}

/** The detail behind a goal ring: where it stands, how it is tracked over time, and how it is measured. */
export const GoalDetailScreen: React.FC<GoalDetailProps> = ({ goal, goals, strengthIndex, weightIndex, supporting, onOpenGoal, onLogWeight, onLogMeasurements }) => {
  const m = goal.measure;
  return (
    <>
      <p className="wk-caption text-center uppercase" style={{ letterSpacing: '0.04em' }}>
        {goal.kind === 'process' ? 'Process goal: something you do' : 'Outcome goal: a result'}
      </p>
      {m.type === 'frequency' && <FrequencyDetail goal={goal} measure={m} />}
      {(m.type === 'reps' || m.type === 'load') && (
        <StrengthDetail goal={goal} others={goals.filter((g) => g.id.startsWith('strength-') && g.id !== goal.id)} onOpenGoal={onOpenGoal} />
      )}
      {m.type === 'target' && <TargetDetail goal={goal} />}
      {m.type === 'body' && (
        <BodyDetail goal={goal} measure={m} strengthIndex={strengthIndex} weightIndex={weightIndex} supporting={supporting} onLogWeight={onLogWeight} onLogMeasurements={onLogMeasurements} />
      )}
    </>
  );
};
