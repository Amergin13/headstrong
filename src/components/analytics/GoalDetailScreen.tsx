import React, { useState } from 'react';
import { AthleteGoal, BodyMeasure, FrequencyMeasure, describeGoalStanding, repsAt } from '../../services/athleteGoals';
import { HABIT_WEEKS } from '../../services/progressOverview';
import {
  ChartTimeline,
  DEFAULT_CHART_TIMELINE,
  ProgressChart,
  ProgressPoint,
  rebaseIndexSeries,
  timelineCutoffDate,
} from '../../services/progressSeries';
import { parseLocalDate } from '../../utils/date';
import { formatSentenceCase } from '../../utils/typography';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import { TrendChart } from '../common/TrendChart';
import { ProgressChartCard } from './ProgressChartCard';
import { TimelineToggle } from './TimelineToggle';
import { Check, Minus, Sparkles } from 'lucide-react';

const dayMonth = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const Big: React.FC<{ value: string; unit: string }> = ({ value, unit }) => (
  <p className="wk-display leading-none mt-3">
    {value}
    <span className="wk-caption ml-2">
      {unit}
    </span>
  </p>
);

const Method: React.FC<{ goal: AthleteGoal }> = ({ goal }) => (
  <section className="wk-card" aria-label="How this goal is measured">
    <h2 className="wk-title">How it&apos;s measured</h2>
    <p className="wk-body mt-2 max-w-prose">
      {goal.method}
    </p>
  </section>
);

const Dots: React.FC<{ filled: number; total: number; label: string }> = ({ filled, total, label }) => (
  <div className="flex flex-wrap gap-2 mt-4" role="img" aria-label={label}>
    {Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        className="w-4 h-4 rounded-full"
        style={{ background: i < filled ? 'var(--wk-accent)' : 'var(--wk-pill)' }}
      />
    ))}
  </div>
);

const FrequencyDetail: React.FC<{ goal: AthleteGoal; measure: FrequencyMeasure }> = ({ goal, measure }) => {
  const tallest = Math.max(measure.perWeek, ...measure.weeks.map((w) => w.sessions));
  const monthlyTarget = measure.perWeek * 4;
  const tallestMonth = Math.max(monthlyTarget, ...measure.months.map((m) => m.sessions));
  const toHabit = Math.max(0, HABIT_WEEKS - measure.streakWeeks);
  return (
    <>
      <section className="wk-card" aria-label="This week">
        <h2 className="wk-title">This week</h2>
        <Big value={`${measure.thisWeek}/${measure.perWeek}`} unit="sessions" />
        <Dots filled={Math.min(measure.thisWeek, measure.perWeek)} total={measure.perWeek} label={`${measure.thisWeek} of ${measure.perWeek} sessions done this week`} />
        <p className="wk-body mt-4 max-w-prose">
          {measure.thisWeek >= measure.perWeek
            ? 'This week is done. Anything more is a bonus.'
            : `${measure.perWeek - measure.thisWeek} to go before Sunday night.`}
        </p>
      </section>

      <section className="wk-card" aria-label="Week by week">
        <h2 className="wk-title">Week by week</h2>
        <dl className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'In a row', value: measure.streakWeeks },
            { label: `Weeks at ${measure.perWeek}`, value: measure.weeksHit },
            { label: 'Weeks training', value: measure.weeksTracked },
          ].map((s) => (
            <div key={s.label}>
              <dt className="wk-label">
                {s.label}
              </dt>
              <dd className="wk-number mt-1">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        {/* Sessions in each week against the target line (current unfinished week in Info Blue). */}
        <div
          className="relative flex items-end gap-1 mt-6"
          style={{ height: 116 }}
          role="img"
          aria-label={`Sessions in each of the last ${measure.weeks.length} weeks: ${measure.weeks.map((w) => w.sessions).join(', ')}. The target is ${measure.perWeek}.`}
        >
          <div
            className="absolute left-0 right-0"
            style={{ bottom: `${(measure.perWeek / tallest) * 100}%`, borderTop: '1px dashed var(--color-border-strong)' }}
            aria-hidden="true"
          />
          {measure.weeks.map((w) => (
            <div key={w.start} className="flex-1 flex flex-col justify-end h-full" aria-hidden="true">
              <div
                className="rounded"
                style={{
                  height: `${Math.max(w.sessions > 0 ? 6 : 2, (w.sessions / tallest) * 100)}%`,
                  background: w.hit ? 'var(--wk-accent)' : w.current ? 'var(--color-text-primary)' : 'var(--wk-pill)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between wk-caption mt-2" aria-hidden="true">
          <span>Week of {dayMonth(measure.weeks[0].start)}</span>
          <span>This week</span>
        </div>
        <p className="wk-body mt-4 max-w-prose">
          {measure.streakWeeks >= HABIT_WEEKS
            ? `${measure.streakWeeks} weeks in a row. Research with new gym members found ${HABIT_WEEKS} weeks at ${measure.perWeek} sessions was what it took to build the habit; from here the goal is to keep it going.`
            : measure.streakWeeks > 0
            ? `${measure.streakWeeks} of ${HABIT_WEEKS} weeks in a row. Research with new gym members found ${HABIT_WEEKS} weeks at ${measure.perWeek} sessions was what it took to build the habit: ${toHabit} to go.`
            : `Research with new gym members found ${HABIT_WEEKS} weeks in a row at ${measure.perWeek} sessions was what it took to build the habit. A missed week doesn't undo the ones before it: the count starts again with your next full week.`}
        </p>
      </section>

      <section className="wk-card" aria-label="Month by month">
        <h2 className="wk-title">Month by month</h2>
        <dl className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: `Months at ${monthlyTarget}`, value: measure.monthsHit },
            { label: 'Months training', value: measure.monthsTracked },
            { label: 'Monthly target', value: monthlyTarget },
          ].map((s) => (
            <div key={s.label}>
              <dt className="wk-label">
                {s.label}
              </dt>
              <dd className="wk-number mt-1">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        <div
          className="relative flex items-end gap-1 mt-6"
          style={{ height: 100 }}
          role="img"
          aria-label={`Sessions in each of the last ${measure.months.length} months: ${measure.months.map((m) => m.sessions).join(', ')}. The monthly target is ${monthlyTarget}.`}
        >
          <div
            className="absolute left-0 right-0"
            style={{ bottom: `${(monthlyTarget / tallestMonth) * 100}%`, borderTop: '1px dashed var(--color-border-strong)' }}
            aria-hidden="true"
          />
          {measure.months.map((mo) => (
            <div key={mo.month} className="flex-1 flex flex-col justify-end h-full" aria-hidden="true">
              <div
                className="rounded"
                style={{
                  height: `${Math.max(mo.sessions > 0 ? 6 : 2, (mo.sessions / tallestMonth) * 100)}%`,
                  background: mo.hit ? 'var(--wk-accent)' : mo.current ? 'var(--color-text-primary)' : 'var(--wk-pill)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between wk-caption mt-2" aria-hidden="true">
          <span>{measure.months[0].month}</span>
          <span>This month</span>
        </div>
      </section>
      <Method goal={goal} />
    </>
  );
};

const StrengthDetail: React.FC<{ goal: AthleteGoal; others: AthleteGoal[]; onOpenGoal: (id: string) => void }> = ({ goal, others, onOpenGoal }) => {
  const units = useUnits();
  const precise = (kg: number) => units.formatPrecise(kg);
  const m = goal.measure;
  if (m.type !== 'reps' && m.type !== 'load') return null;
  return (
    <>
      <section className="wk-card" aria-label={goal.title}>
        <h2 className="wk-title">{m.exerciseName}</h2>
        {m.type === 'reps' ? (
          <>
            <Big value={`${m.currentReps}/${m.targetReps}`} unit={`reps ${repsAt(m, (kg) => units.format(kg))}`} />
            <Dots filled={m.currentReps} total={m.targetReps} label={`${m.currentReps} of ${m.targetReps} reps`} />
            <p className="wk-body mt-4 max-w-prose">
              {m.targetReps} reps {repsAt(m, (kg) => units.format(kg))} reaches {m.level}. Your best set is {m.currentReps}, so{' '}
              {m.targetReps - m.currentReps === 1 ? 'one more rep does it' : `${m.targetReps - m.currentReps} more reps do it`}. You&apos;re {m.currentLevel} now.
            </p>
          </>
        ) : (
          <>
            <Big
              value={precise(Math.max(0, m.targetE1rmKg - m.e1rmKg)).split(' ')[0]}
              unit={`${units.unit} to go on your estimated max`}
            />
            <p className="wk-body mt-4 max-w-prose">
              {m.level} needs an estimated max{goal.pillar === 'Vertical Pull' ? ' (bodyweight + added weight)' : ''} of{' '}
              {precise(m.targetE1rmKg)}; yours is {precise(m.e1rmKg)}. You&apos;re {m.currentLevel} now.
            </p>
          </>
        )}
        <p className="wk-caption mt-3">
          Estimated max{goal.pillar === 'Vertical Pull' ? ' (bodyweight + added weight)' : ''} {precise(m.e1rmKg)} of {precise(m.targetE1rmKg)}
        </p>
      </section>
      <Method goal={goal} />
      {others.length > 0 && (
        <section className="wk-card" aria-label="Your other strength levels">
          <h2 className="wk-title">Your other strength levels</h2>
          <ul className="flex flex-col mt-2">
            {others.map((g) => (
              <li key={g.id} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenGoal(g.id);
                  }}
                  className="w-full text-left flex items-center justify-between gap-3 py-3 min-h-[44px]"
                >
                  <span className="wk-subhead min-w-0">
                    {formatSentenceCase(g.title)}
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

const TargetDetail: React.FC<{ goal: AthleteGoal }> = ({ goal }) => {
  const units = useUnits();
  const m = goal.measure;
  if (m.type !== 'target') return null;
  if (m.metric === 'steps') {
    const remaining = Math.max(0, m.target - m.best);
    return (
      <>
        <section className="wk-card" aria-label={goal.title}>
          <h2 className="wk-title">{m.exerciseName}</h2>
          <Big value={`${m.best.toLocaleString()}/${m.target.toLocaleString()}`} unit="steps today" />
          <div
            className="wk-bar mt-4"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={m.target}
            aria-valuenow={m.best}
            aria-label={`${m.best.toLocaleString()} of ${m.target.toLocaleString()} steps`}
          >
            <div style={{ width: `${Math.min(100, (m.best / m.target) * 100)}%` }} />
          </div>
          <p className="wk-body mt-4 max-w-prose">
            {goal.achieved
              ? `You've reached today's target of ${m.target.toLocaleString()} steps.`
              : m.best > 0
              ? `${m.best.toLocaleString()} steps recorded today: ${remaining.toLocaleString()} to go.`
              : 'No steps recorded today yet. Connect Health Connect or sync your watch to track your daily steps.'}
          </p>
          <p className="wk-caption mt-3">
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
        <h2 className="wk-title">{m.exerciseName}</h2>
        <Big value={`${byWeight ? best.split(' ')[0] : best}/${byWeight ? target.split(' ')[0] : target}`} unit={byWeight ? units.unit : 'reps in one set'} />
        {!byWeight && m.target <= 30 && <Dots filled={Math.min(m.best, m.target)} total={m.target} label={`${m.best} of ${m.target} reps`} />}
        {byWeight && (
          <div className="wk-bar mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={m.best} aria-label={`${best} of ${target}`}>
            <div style={{ width: `${Math.min(100, (m.best / m.target) * 100)}%` }} />
          </div>
        )}
        <p className="wk-body mt-4 max-w-prose">
          {goal.achieved
            ? `You've reached it: ${byWeight ? best : `${best} reps`}${m.bestOn ? ` on ${dayMonth(m.bestOn)}` : ''}. Set a new target below to keep building.`
            : m.best > 0
            ? `Your best is ${byWeight ? best : `${best} reps`}${m.bestOn ? `, on ${dayMonth(m.bestOn)}` : ''}: ${left} to go.`
            : "You haven't logged this exercise yet. It starts counting with your first set."}
        </p>
        <p className="wk-caption mt-3">
          Set on {dayMonth(m.createdOn)}
        </p>
      </section>
      <Method goal={goal} />
    </>
  );
};

const BodyDetail: React.FC<{
  goal: AthleteGoal;
  measure: BodyMeasure;
  strengthIndex: ProgressPoint[];
  weightIndex: ProgressPoint[];
  supporting: ProgressChart[];
  onLogWeight: () => void;
  onLogMeasurements: () => void;
}> = ({ goal, measure, strengthIndex, weightIndex, supporting, onLogWeight, onLogMeasurements }) => {
  const [timeline, setTimeline] = useState<ChartTimeline>(DEFAULT_CHART_TIMELINE);
  const cutoff = timelineCutoffDate(timeline);
  const visibleStrength = rebaseIndexSeries(strengthIndex.filter((p) => p.date >= cutoff));
  const visibleWeight = rebaseIndexSeries(weightIndex.filter((p) => p.date >= cutoff));

  return (
    <>
      <section className="wk-card" aria-label={goal.title}>
        <h2 className="wk-title">Signs it&apos;s working</h2>
        <Big value={measure.signsMeasured > 0 ? `${measure.signsMet}/${measure.signs.length}` : '—'} unit={measure.signsMeasured > 0 ? 'signs showing' : 'nothing measured yet'} />
        <ul className="flex flex-col gap-4 mt-5">
          {measure.signs.map((sign) => (
            <li key={sign.id} className="flex items-start gap-3">
              <span
                className="w-6 h-6 mt-1 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: sign.met === true ? 'var(--wk-accent)' : 'var(--wk-pill)',
                  opacity: sign.met === null ? 0.6 : 1,
                }}
                aria-hidden="true"
              >
                {sign.met === true ? (
                  <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-text-on-accent)' }} strokeWidth={3} />
                ) : sign.met === false ? (
                  <Minus className="w-3.5 h-3.5" style={{ color: 'var(--color-text-primary)' }} strokeWidth={3} />
                ) : null}
              </span>
              <div className="min-w-0">
                <p className="wk-subhead">
                  {formatSentenceCase(sign.label)}
                  <span className="sr-only">: {sign.met === true ? 'showing' : sign.met === false ? 'not showing yet' : 'not measured yet'}</span>
                </p>
                <p className="wk-body mt-1 max-w-prose">
                  {sign.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="wk-card" aria-label="How sure this is">
        <h2 className="wk-title">How sure this is</h2>
        <p className="wk-body mt-2 max-w-prose">
          {measure.evidenceLabel}
          {measure.nextStep ? ` ${measure.nextStep}` : ''}
        </p>
        {measure.nextStep && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={onLogWeight}
              className="wk-btn-secondary w-full"
            >
              Log weight
            </button>
            <button
              type="button"
              onClick={onLogMeasurements}
              className="wk-btn-secondary w-full"
            >
              Log measurements
            </button>
          </div>
        )}
      </section>

      {measure.biaOverlay && (
        <section className="wk-card" aria-label="Secondary smart-scale directional overlay">
          <div className="flex items-start justify-between gap-2">
            <h2 className="wk-title">Smart-scale BIA overlay</h2>
            <span className="wk-pill shrink-0">
              {measure.biaOverlay.isDirectionalReady ? '12+ wk directional' : 'Secondary'}
            </span>
          </div>
          <p className="wk-body mt-2 max-w-prose">
            {measure.biaOverlay.summary}
          </p>
          <p className="wk-caption mt-2 max-w-prose">
            {measure.biaOverlay.fastedWeighInPrompt}
          </p>
        </section>
      )}

      <section className="wk-card" aria-label="Weight against strength">
        <h2 className="wk-title">Weight against strength</h2>
        <p className="wk-body mt-2 max-w-prose">
          {visibleStrength.length >= 2 && visibleWeight.length >= 2
            ? measure.phase === 'Lean Bulk'
              ? 'Both start at 100. Strength rising faster than weight is the pattern of muscle being built; weight rising faster than strength points to fat.'
              : measure.phase === 'Cut / Recomp'
              ? 'Both start at 100. Weight falling while strength holds is the pattern of fat being lost and muscle kept.'
              : 'Both start at 100. Weight level while strength rises is the pattern of staying lean and getting stronger.'
            : visibleStrength.length >= 2
            ? 'Your strength so far, starting at 100. Log your weight to see the two together.'
            : strengthIndex.length >= 2
            ? 'Not enough sessions in this range to show a trend. Select a wider range to see earlier history.'
            : 'This fills in as you repeat workouts and log your weight.'}
        </p>
        <TimelineToggle
          compact
          value={timeline}
          onChange={setTimeline}
          ariaLabel="Weight against strength timeline"
        />
        <div className="mt-4">
          <TrendChart
            points={visibleStrength}
            secondary={visibleWeight.length >= 2 ? visibleWeight : undefined}
            format={(v) => `${Math.round(v)}`}
            height={280}
            emptyTitle="No comparison yet"
            emptyMessage="Repeat a workout and log bodyweight to see both trends together."
            label={
              visibleStrength.length >= 2
                ? `Strength index from 100 to ${Math.round(visibleStrength[visibleStrength.length - 1].value)}${
                    visibleWeight.length >= 2 ? `; bodyweight index from 100 to ${Math.round(visibleWeight[visibleWeight.length - 1].value)}` : ''
                  }`
                : 'No comparison yet. Your strength and bodyweight appear here once you have repeated a workout.'
            }
          />
        </div>
        {visibleStrength.length >= 2 && (
          <div className="flex flex-wrap wk-caption gap-4 mt-3" aria-hidden="true">
            <span className="flex items-center gap-2">
              <span className="w-4 h-1 rounded-full" style={{ background: 'var(--wk-accent)' }} />
              Strength
            </span>
            {visibleWeight.length >= 2 && (
              <span className="flex items-center gap-2">
                <span className="w-4 h-0.5 rounded-full" style={{ background: 'var(--color-border-strong)' }} />
                Bodyweight
              </span>
            )}
          </div>
        )}
      </section>

      {supporting.map((chart) => (
        <ProgressChartCard key={chart.id} chart={chart} timeline={timeline} hideTimelineToggle />
      ))}
      <Method goal={goal} />
    </>
  );
};

export interface GoalDetailProps {
  goal: AthleteGoal;
  goals: AthleteGoal[];
  strengthIndex: ProgressPoint[];
  weightIndex: ProgressPoint[];
  supporting: ProgressChart[];
  onOpenGoal: (id: string) => void;
  onLogWeight: () => void;
  onLogMeasurements: () => void;
  onAskCoach?: (prompt?: string) => void;
}

export const GoalDetailScreen: React.FC<GoalDetailProps> = ({ goal, goals, strengthIndex, weightIndex, supporting, onOpenGoal, onLogWeight, onLogMeasurements, onAskCoach }) => {
  const m = goal.measure;
  return (
    <>
      <p className="wk-caption text-center">
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
      {onAskCoach && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onAskCoach();
          }}
          className="wk-btn-secondary w-full min-h-[48px] inline-flex items-center justify-center gap-2"
          style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
        >
          <Sparkles
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--color-coach-accent)' }}
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <span>{goal.achieved ? 'Set a new target with Treise' : 'Ask Treise about this goal'}</span>
        </button>
      )}
    </>
  );
};
