import React, { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { GoalPhase, GoalSettings, StrengthPillar, UserProfile } from '../../engine/types';
import {
  AthleteGoal,
  CUSTOM_GOAL_PREFIX,
  MAX_CUSTOM_GOALS,
  MAX_GOALS,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  OWN_GOAL_OPTIONS,
  PLAN_GOAL_COUNT,
  describeGoalStanding,
  makeCustomGoal,
  sessionsPerWeekTarget,
} from '../../services/athleteGoals';
import { MOVEMENT_NAME, MOVEMENT_ORDER } from '../../services/movementStandards';
import { PILLAR_STANDARD_SOURCE } from '../../engine/strengthStandards';
import { GOAL_DISPLAY_NAME } from '../../utils/goalNames';
import { localDateString } from '../../utils/date';
import { triggerHaptic } from '../../utils/haptics';
import { unitToKg } from '../../utils/units';
import { useUnits } from '../../utils/unitsContext';

const GOAL_NOTE: Record<GoalPhase, string> = {
  'Lean Bulk': 'Your sets build across the 6 weeks, with extra sets on smaller muscles at the end.',
  'Cut / Recomp': 'The big lifts stay heavy with no extra sets, so you keep strength while eating less.',
  Maingain: 'A steady 3 sets per exercise to get stronger without wearing yourself down.',
};

/** One choice in a list: the selected one is ticked. */
const Choice: React.FC<{ selected: boolean; title: string; note?: string; tag?: string; onSelect: () => void }> = ({ selected, title, note, tag, onSelect }) => (
  <li style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        triggerHaptic('light');
        onSelect();
      }}
      className="w-full text-left flex items-center justify-between gap-3 py-3 min-h-[44px]"
    >
      <span className="min-w-0">
        <span className="flex items-center flex-wrap gap-2">
          <span className="wk-subhead">
            {title}
          </span>
          {tag && <span className="wk-pill">{tag}</span>}
        </span>
        {note && (
          <span className="wk-caption block mt-1 max-w-prose">
            {note}
          </span>
        )}
      </span>
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: selected ? 'var(--wk-accent)' : 'transparent',
          border: selected ? 'none' : '2px solid var(--color-border-strong)',
        }}
        aria-hidden="true"
      >
        {selected && <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-text-on-accent)' }} strokeWidth={3} />}
      </span>
    </button>
  </li>
);

interface GoalSettingsScreenProps {
  profile: UserProfile;
  goals: AthleteGoal[];
  onUpdateProfile: (update: Partial<UserProfile>) => void;
  onUpdateGoalPhase: (phase: GoalPhase) => void;
  onAskCoach?: (prompt?: string) => void;
}

/**
 * Change the goals shown on Progress. Each one starts as the plan sets it (marked "Your plan");
 * a change is saved as soon as it is made and can be put back with one tap.
 */
export const GoalSettingsScreen: React.FC<GoalSettingsScreenProps> = ({ profile, goals, onUpdateProfile, onUpdateGoalPhase, onAskCoach }) => {
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

  const [pickedOptionId, setPickedOptionId] = useState<string | null>(null);
  const [customTargetInput, setCustomTargetInput] = useState('');
  const pickedOption = OWN_GOAL_OPTIONS.find((o) => o.exerciseId === pickedOptionId);
  const rawNumber = Number(customTargetInput);
  const candidateGoal =
    pickedOption && customTargetInput.trim() !== '' && Number.isFinite(rawNumber) && rawNumber > 0
      ? makeCustomGoal(
          pickedOption.exerciseId,
          pickedOption.label,
          pickedOption.metric,
          pickedOption.metric === 'weight' ? unitToKg(rawNumber, units.unit) : rawNumber,
          localDateString()
        )
      : null;
  const candidateInvalid = Boolean(pickedOption) && customTargetInput.trim() !== '' && !candidateGoal;
  const existingCustomList = settings.customGoals ?? [];
  const replacingExisting = candidateGoal ? existingCustomList.some((g) => g.id === candidateGoal.id) : false;
  const customSlotsFull = ownGoals.length >= MAX_CUSTOM_GOALS && !replacingExisting;

  return (
    <>
      <section className="wk-card" aria-labelledby="goal-main">
        <h2 id="goal-main" className="wk-title">
          Your main goal
        </h2>
        <p className="wk-body mt-2 max-w-prose">
          This shapes your plan&apos;s sets and reps, and how your progress is judged.
        </p>
        <ul role="radiogroup" aria-labelledby="goal-main" className="flex flex-col mt-3">
          {(Object.keys(GOAL_DISPLAY_NAME) as GoalPhase[]).map((p) => (
            <Choice key={p} selected={phase === p} title={GOAL_DISPLAY_NAME[p]} note={GOAL_NOTE[p]} onSelect={() => phase !== p && onUpdateGoalPhase(p)} />
          ))}
        </ul>
      </section>

      <section className="wk-card" aria-labelledby="goal-sessions">
        <h2 id="goal-sessions" className="wk-title">
          Sessions a week
        </h2>
        <p className="wk-body mt-2 max-w-prose">
          Your plan is built on {planPerWeek} a week. Workouts and active days of 20 minutes or more both count.
        </p>
        <div
          role="radiogroup"
          aria-labelledby="goal-sessions"
          className="grid gap-2 mt-4"
          style={{ gridTemplateColumns: `repeat(${MAX_SESSIONS_PER_WEEK - MIN_SESSIONS_PER_WEEK + 1}, minmax(0, 1fr))` }}
        >
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
              className={`wk-subhead flex flex-col items-center justify-center tabular-numbers min-h-[48px] h-12 rounded-xl`}
              style={{
                background: perWeek === n ? 'var(--color-action-primary-bg)' : 'var(--wk-raised)',
                color: perWeek === n ? 'var(--color-action-primary-fg)' : 'var(--color-text-primary)',
                border: perWeek === n ? 'none' : '1px solid var(--color-border-subtle)',
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="wk-caption mt-3">
          {perWeek === planPerWeek ? `${planPerWeek} is your plan's number.` : `You've set ${perWeek}. Your plan's number is ${planPerWeek}. Earlier weeks are counted against ${perWeek} too.`}
        </p>
      </section>

      <section className="wk-card" aria-labelledby="goal-strength">
        <h2 id="goal-strength" className="wk-title">
          Strength level to follow
        </h2>
        <p className="wk-body mt-2 max-w-prose">
          The lift whose next level is one of your goals. Every lift&apos;s level is still tracked in Strength standards.
        </p>
        <ul role="radiogroup" aria-labelledby="goal-strength" className="flex flex-col mt-3">
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
        <div className="flex items-start justify-between gap-2">
          <h2 id="goal-own" className="wk-title">
            Goals of your own
          </h2>
          <span className="wk-pill">
            {goalCount} of {MAX_GOALS} goals
          </span>
        </div>
        <p className="wk-body mt-2 max-w-prose">
          You have 3 goals from your plan and can add up to {MAX_CUSTOM_GOALS} of your own. Pick one below or set one directly with Treise.
        </p>
        {onAskCoach && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onAskCoach();
            }}
            className="wk-btn-secondary w-full mt-3 min-h-[44px] inline-flex items-center justify-center gap-2"
            style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
          >
            <Sparkles
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--color-coach-accent)' }}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <span>Set or adjust goals with Treise</span>
          </button>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {OWN_GOAL_OPTIONS.map((opt) => {
            const active = pickedOptionId === opt.exerciseId;
            return (
              <button
                key={opt.exerciseId}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  triggerHaptic('light');
                  if (active) {
                    setPickedOptionId(null);
                    setCustomTargetInput('');
                  } else {
                    setPickedOptionId(opt.exerciseId);
                    setCustomTargetInput(opt.metric === 'steps' ? '10000' : '');
                  }
                }}
                className="wk-btn-secondary wk-tap"
                style={{
                  background: active ? 'var(--color-action-primary-bg)' : 'var(--wk-raised)',
                  color: active ? 'var(--color-action-primary-fg)' : 'var(--color-text-primary)',
                  border: active ? '1px solid var(--color-action-primary-bg)' : '1px solid var(--color-border-strong)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {pickedOption && (
          <div className="mt-3">
            <div className="flex items-center flex-wrap gap-2">
              <label htmlFor="custom-goal-target" className="wk-meta-title shrink-0">
                {pickedOption.metric === 'weight' ? 'Lift' : pickedOption.metric === 'steps' ? 'Reach' : 'Do'}
              </label>
              <input
                id="custom-goal-target"
                type="number"
                inputMode={pickedOption.metric === 'weight' ? 'decimal' : 'numeric'}
                min={pickedOption.metric === 'steps' ? 500 : 1}
                step={pickedOption.metric === 'steps' ? 500 : undefined}
                value={customTargetInput}
                onChange={(e) => setCustomTargetInput(e.target.value)}
                aria-invalid={candidateInvalid}
                className="wk-field tabular-numbers w-28"
              />
              <span className="wk-body">
                {pickedOption.metric === 'weight' ? units.unit : pickedOption.metric === 'steps' ? 'steps a day' : 'reps in one set'}
              </span>
            </div>
            {candidateInvalid && (
              <p className="wk-caption mt-2" style={{ color: 'var(--color-status-danger)' }}>
                {pickedOption.metric === 'steps'
                  ? 'Enter a daily step target between 500 and 100,000.'
                  : pickedOption.metric === 'weight'
                  ? 'Enter a weight target you could reach.'
                  : 'Enter a number of reps up to 100.'}
              </p>
            )}
            {customSlotsFull && (
              <p className="wk-caption mt-2">
                Remove one of your {MAX_CUSTOM_GOALS} goals below before adding another.
              </p>
            )}
            <button
              type="button"
              disabled={!candidateGoal || customSlotsFull}
              onClick={() => {
                if (!candidateGoal || customSlotsFull) return;
                triggerHaptic('medium');
                const others = existingCustomList.filter((g) => g.id !== candidateGoal.id);
                save({ ...settings, customGoals: [...others, candidateGoal] });
                setPickedOptionId(null);
                setCustomTargetInput('');
              }}
              className="wk-button mt-3"
              style={{
                background: candidateGoal && !customSlotsFull ? 'var(--color-action-primary-bg)' : 'var(--color-action-disabled-bg)',
                color: candidateGoal && !customSlotsFull ? 'var(--color-action-primary-fg)' : 'var(--color-action-disabled-fg)',
                cursor: candidateGoal && !customSlotsFull ? 'pointer' : 'not-allowed',
              }}
            >
              {replacingExisting ? `Update ${pickedOption.label} goal` : `Add ${pickedOption.label} goal`}
            </button>
          </div>
        )}

        {ownGoals.length > 0 && (
          <ul className="flex flex-col mt-3">
            {ownGoals.map((goal) => {
              const id = goal.id.slice(CUSTOM_GOAL_PREFIX.length);
              const name = goal.measure.type === 'target' ? goal.measure.exerciseName : goal.title;
              return (
                <li key={goal.id} className="flex items-center justify-between gap-3 py-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <span className="min-w-0">
                    <span className="wk-subhead block">
                      {name}
                    </span>
                    <span className="wk-caption block mt-1">
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
                    className="wk-btn-secondary wk-tap shrink-0"
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
          style={{
            background: 'var(--color-action-secondary-bg)',
            color: 'var(--color-action-secondary-fg)',
            border: '1px solid var(--color-border-strong)',
          }}
        >
          Use my plan&apos;s goals
        </button>
      )}
    </>
  );
};
