import React from 'react';
import { Check } from 'lucide-react';
import { GoalPhase, GoalSettings, StrengthPillar, UserProfile } from '../../engine/types';
import {
  AthleteGoal,
  CUSTOM_GOAL_PREFIX,
  MAX_CUSTOM_GOALS,
  MAX_GOALS,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  PLAN_GOAL_COUNT,
  describeGoalStanding,
  sessionsPerWeekTarget,
} from '../../services/athleteGoals';
import { MOVEMENT_NAME, MOVEMENT_ORDER } from '../../services/movementStandards';
import { PILLAR_STANDARD_SOURCE } from '../../engine/strengthStandards';
import { GOAL_DISPLAY_NAME } from '../../utils/goalNames';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

const fig = (px: number) => `calc(${px} * var(--f))`;
const text = (px: number) => `max(12px, ${fig(px)})`;

const GOAL_NOTE: Record<GoalPhase, string> = {
  'Lean Bulk': 'Your sets build across the 6 weeks, with extra sets on smaller muscles at the end.',
  'Cut / Recomp': 'The big lifts stay heavy with no extra sets, so you keep strength while eating less.',
  Maingain: 'A steady 3 sets per exercise to get stronger without wearing yourself down.',
};

/** One choice in a list: the selected one is ticked. */
const Choice: React.FC<{ selected: boolean; title: string; note?: string; tag?: string; onSelect: () => void }> = ({ selected, title, note, tag, onSelect }) => (
  <li style={{ borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}>
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        triggerHaptic('light');
        onSelect();
      }}
      className="w-full text-left flex items-center justify-between"
      style={{ gap: fig(24), padding: `${fig(26)} 0`, minHeight: 44 }}
    >
      <span className="min-w-0">
        <span className="flex items-center flex-wrap" style={{ gap: fig(14) }}>
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            {title}
          </span>
          {tag && <span className="wk-pill">{tag}</span>}
        </span>
        {note && (
          <span className="wk-caption block" style={{ marginTop: fig(8) }}>
            {note}
          </span>
        )}
      </span>
      <span
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: fig(52), height: fig(52), background: selected ? 'var(--wk-accent)' : 'transparent', border: selected ? 'none' : `${fig(3)} solid var(--wk-pill)` }}
        aria-hidden="true"
      >
        {selected && <Check style={{ width: fig(30), height: fig(30), color: '#13181C' }} strokeWidth={3} />}
      </span>
    </button>
  </li>
);

interface GoalSettingsScreenProps {
  profile: UserProfile;
  goals: AthleteGoal[];
  onUpdateProfile: (update: Partial<UserProfile>) => void;
  onUpdateGoalPhase: (phase: GoalPhase) => void;
}

/**
 * Change the goals shown on Progress. Each one starts as the plan sets it (marked "Your plan");
 * a change is saved as soon as it is made and can be put back with one tap.
 */
export const GoalSettingsScreen: React.FC<GoalSettingsScreenProps> = ({ profile, goals, onUpdateProfile, onUpdateGoalPhase }) => {
  const units = useUnits();
  const { perWeek, planPerWeek } = sessionsPerWeekTarget(profile);
  const settings: GoalSettings = profile.goalSettings ?? {};
  const save = (next: GoalSettings) => {
    // Nothing kept that equals the plan's own value, so a later plan change is followed.
    const cleaned: GoalSettings = {
      sessionsPerWeek: next.sessionsPerWeek === planPerWeek ? undefined : next.sessionsPerWeek,
      strengthFocus: next.strengthFocus,
      customGoals: next.customGoals?.length ? next.customGoals : undefined,
    };
    onUpdateProfile({ goalSettings: Object.values(cleaned).some((v) => v !== undefined) ? cleaned : undefined });
  };
  const customised = Boolean(profile.goalSettings);
  const ownGoals = goals.filter((g) => g.id.startsWith(CUSTOM_GOAL_PREFIX));
  const goalCount = PLAN_GOAL_COUNT + ownGoals.length;
  const strengthGoal = (pillar: StrengthPillar) => goals.find((g) => g.pillar === pillar && g.id.startsWith('strength-'));
  const movements = MOVEMENT_ORDER.filter((p) => PILLAR_STANDARD_SOURCE[p] !== 'none');
  const phase = profile.goalPhase || 'Lean Bulk';

  return (
    <>
      <section className="wk-card" aria-labelledby="goal-main">
        <h2 id="goal-main" className="wk-label">
          Your main goal
        </h2>
        <p className="wk-body" style={{ marginTop: fig(12) }}>
          This shapes your plan's sets and reps, and how your progress is judged.
        </p>
        <ul role="radiogroup" aria-labelledby="goal-main" className="flex flex-col" style={{ marginTop: fig(20) }}>
          {(Object.keys(GOAL_DISPLAY_NAME) as GoalPhase[]).map((p) => (
            <Choice key={p} selected={phase === p} title={GOAL_DISPLAY_NAME[p]} note={GOAL_NOTE[p]} onSelect={() => phase !== p && onUpdateGoalPhase(p)} />
          ))}
        </ul>
      </section>

      <section className="wk-card" aria-labelledby="goal-sessions">
        <h2 id="goal-sessions" className="wk-label">
          Sessions a week
        </h2>
        <p className="wk-body" style={{ marginTop: fig(12) }}>
          Your plan is built on {planPerWeek} a week. Workouts and active days of 20 minutes or more both count.
        </p>
        <div role="radiogroup" aria-labelledby="goal-sessions" className="grid" style={{ gridTemplateColumns: `repeat(${MAX_SESSIONS_PER_WEEK - MIN_SESSIONS_PER_WEEK + 1}, minmax(0, 1fr))`, gap: fig(12), marginTop: fig(32) }}>
          {Array.from({ length: MAX_SESSIONS_PER_WEEK - MIN_SESSIONS_PER_WEEK + 1 }, (_, i) => i + MIN_SESSIONS_PER_WEEK).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={perWeek === n}
              aria-label={`${n} sessions a week${n === planPerWeek ? ', your plan' : ''}`}
              onClick={() => {
                triggerHaptic('light');
                save({ ...settings, sessionsPerWeek: n });
              }}
              className="flex flex-col items-center justify-center font-bold tabular-numbers"
              style={{
                minHeight: 48,
                height: fig(130),
                borderRadius: fig(22),
                fontSize: text(36),
                background: perWeek === n ? 'var(--wk-accent)' : 'var(--wk-raised)',
                color: perWeek === n ? '#13181C' : '#fff',
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="wk-caption" style={{ marginTop: fig(20) }}>
          {perWeek === planPerWeek ? `${planPerWeek} is your plan's number.` : `You've set ${perWeek}. Your plan's number is ${planPerWeek}. Earlier weeks are counted against ${perWeek} too.`}
        </p>
      </section>

      <section className="wk-card" aria-labelledby="goal-strength">
        <h2 id="goal-strength" className="wk-label">
          Strength level to follow
        </h2>
        <p className="wk-body" style={{ marginTop: fig(12) }}>
          The lift whose next level is one of your goals. Every lift's level is still tracked in Strength standards.
        </p>
        <ul role="radiogroup" aria-labelledby="goal-strength" className="flex flex-col" style={{ marginTop: fig(20) }}>
          <Choice
            selected={settings.strengthFocus === undefined}
            title="Closest to the next level"
            tag="Your plan"
            note="Follows whichever lift is nearest its next level."
            onSelect={() => save({ ...settings, strengthFocus: undefined })}
          />
          {movements.map((pillar) => {
            const goal = strengthGoal(pillar);
            return (
              <Choice
                key={pillar}
                selected={settings.strengthFocus === pillar}
                title={MOVEMENT_NAME[pillar]}
                note={goal ? `${goal.title.split(': ')[1]}: ${describeGoalStanding(goal, (kg) => units.format(kg))}` : 'Not logged yet. It leads once you have logged it and your weight.'}
                onSelect={() => save({ ...settings, strengthFocus: pillar })}
              />
            );
          })}
        </ul>
      </section>

      <section className="wk-card" aria-labelledby="goal-own">
        <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
          <h2 id="goal-own" className="wk-label">
            Goals of your own
          </h2>
          <span className="wk-pill">
            {goalCount} of {MAX_GOALS} goals
          </span>
        </div>
        <p className="wk-body" style={{ marginTop: fig(12) }}>
          You have 3 goals from your plan and can add up to {MAX_CUSTOM_GOALS} of your own. To add one, open AI Coach and say it, for example "my goal is 12 chin-ups" or "set a goal of 100 kg on bench press".
        </p>
        {ownGoals.length > 0 && (
          <ul className="flex flex-col" style={{ marginTop: fig(20) }}>
            {ownGoals.map((goal) => {
              const id = goal.id.slice(CUSTOM_GOAL_PREFIX.length);
              const name = goal.measure.type === 'target' ? goal.measure.exerciseName : goal.title;
              return (
                <li key={goal.id} className="flex items-center justify-between" style={{ gap: fig(24), padding: `${fig(26)} 0`, borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}>
                  <span className="min-w-0">
                    <span className="wk-label block" style={{ lineHeight: 1.21 }}>
                      {name}
                    </span>
                    <span className="wk-caption block" style={{ marginTop: fig(8) }}>
                      {describeGoalStanding(goal, (kg) => units.format(kg))}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove your ${name} goal`}
                    onClick={() => {
                      triggerHaptic('medium');
                      save({ ...settings, customGoals: (settings.customGoals ?? []).filter((g) => g.id !== id) });
                    }}
                    className="wk-pill wk-tap shrink-0"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {customised && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onUpdateProfile({ goalSettings: undefined });
          }}
          className="wk-button"
          style={{ background: 'var(--wk-raised)', color: '#fff' }}
        >
          Use my plan's goals
        </button>
      )}
    </>
  );
};
