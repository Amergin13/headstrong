import { OWN_GOAL_OPTIONS, makeCustomGoal } from '../../services/athleteGoals';
import { unitToKg } from '../../utils/units';
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, X } from 'lucide-react';
import {
  CustomGoal,
  ExperienceLevel,
  Gender,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  TrainingLocation,
  UserProfile,
} from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';
import { WeightUnit } from '../../utils/units';
import { canUseMusclePlan, resolveActivePlan } from '../../engine/trainingPlans';
import { IdentityIllustration, RestartIllustration, SessionsIllustration } from './OnboardingIllustrations';

export type OnboardingStep = 1 | 2 | 3;

export interface OnboardingModalProps {
  profile: UserProfile;
  /** 3 opens straight on the goal and place choice (used to edit equipment later). */
  initialStep?: OnboardingStep;
  onCompleteOnboarding: (updated: {
    goalPhase: GoalPhase;
    programType: ProgramSplitType;
    activeLocation: TrainingLocation;
    availableLocations: TrainingLocation[];
    homeEquipment: HomeEquipmentTag[];
    athlete?: {
      gender: Gender;
      experienceLevel: ExperienceLevel;
      weightUnit: WeightUnit;
      bodyweightKg?: number;
    };
    /** A goal of the athlete's own, if they set one: a weight in kg, or reps in one set. */
    ownGoal?: { exerciseId: string; metric: CustomGoal['metric']; target: number };
  }) => void;
  onClose: () => void;
  onExploreDemo?: () => void;
}

/** One Figma pixel (1344 px frame) in screen pixels; see .wk in index.css. */
const fig = (px: number) => `calc(${px} * var(--f))`;

interface ScreenCopy {
  title: string;
  body: string[];
  Illustration: React.FC<{ weeks?: number; perWeek?: number }>;
}

/** Screen copy; screen 2 states the athlete's own plan (18 workouts, 3 a week, or 24, 4 a week). */
const WEEK_DETAIL: Record<string, string> = {
  starter_6wk: 'Each week is 3 workouts we set for you, plus 1 active day of anything you enjoy: a ride, run, walk or class.',
  starter_4day: 'Each week is 4 workouts. We set your weights and reps, so you just show up and lift.',
  muscle_building_6wk: 'Each week is 4 workouts. We set your weights and reps, so you just show up and lift.',
};

const buildScreens = (total: number, perWeek: number, program: ProgramSplitType): ScreenCopy[] => [
  {
    title: 'Identity',
    body: [
      "People who stay active for life don't rely on willpower. They build an identity where movement is a fundamental part of who they are.",
    ],
    Illustration: IdentityIllustration,
  },
  {
    title: `${total} sessions`,
    body: [
      `Research with new gym members found that exercising at least ${perWeek} times a week for 6 weeks was what it took to build the habit. Your plan gives you ${total} sessions to get there.`,
      WEEK_DETAIL[program] ?? WEEK_DETAIL.starter_4day,
    ],
    Illustration: SessionsIllustration,
  },
  {
    title: 'Your superpower is restarting',
    body: [
      "Most programs fall apart when life gets busy. Missing a workout doesn't ruin your progress. Don't aim for perfection, aim for bouncing back.",
      "Each workout matches how recovered you are and where you are. Can't make the gym? Switch to a home workout in one tap.",
    ],
    Illustration: RestartIllustration,
  },
];

const LOCATIONS: { id: TrainingLocation; label: string; detail: string }[] = [
  { id: 'gym', label: 'Gym', detail: 'Full equipment' },
  { id: 'home', label: 'Home', detail: 'Your own gear' },
  { id: 'travel', label: 'Bodyweight', detail: 'No equipment, anywhere' },
];

const HOME_EQUIPMENT_OPTIONS: { id: HomeEquipmentTag; label: string }[] = [
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'bench', label: 'Bench' },
  { id: 'pullup_bar', label: 'Pull-up bar' },
  { id: 'trx', label: 'TRX' },
  { id: 'bands', label: 'Bands' },
];

/** The goal shapes the plan's sets, reps and effort (see starterPlan.ts). Names match GOAL_DISPLAY_NAME. */
const GOALS: { id: GoalPhase; label: string; detail: string }[] = [
  { id: 'Lean Bulk', label: 'Build Muscle', detail: 'Add size and strength' },
  { id: 'Cut / Recomp', label: 'Lose Fat', detail: 'Keep your muscle while you lean out' },
  { id: 'Maingain', label: 'Stay Lean', detail: 'Get stronger at the weight you are' },
];

/** How to fit in 4 sessions a week. The muscle plan is shown only on the owner's account. */
const PLAN_CHOICES: { id: ProgramSplitType; label: string; detail: string; recommended?: boolean; ownerOnly?: boolean }[] = [
  {
    id: 'starter_6wk',
    label: '3 workouts + 1 active day',
    detail: 'Lift 3 days, and do any ride, run, walk or class on a 4th',
    recommended: true,
  },
  { id: 'starter_4day', label: '4 workouts', detail: 'Lift 4 days, with shorter upper and lower body workouts' },
  { id: 'muscle_building_6wk', label: 'Muscle plan', detail: '4 workouts a week: supersets, drop sets, giant sets', ownerOnly: true },
];

/** Pounds where gyms use them; everyone else starts in kilograms (changeable in Settings). */
const defaultUnit = (): WeightUnit => {
  if (typeof navigator === 'undefined') return 'kg';
  return /^en-(US|LR)$|^my\b/i.test(navigator.language || '') ? 'lb' : 'kg';
};

const titleStyle: React.CSSProperties = {
  fontSize: `max(22px, ${fig(60)})`,
  lineHeight: 1.15,
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  letterSpacing: '-0.01em',
};
const bodyStyle: React.CSSProperties = {
  fontSize: `max(14px, ${fig(32)})`,
  lineHeight: 1.5,
  color: 'var(--wk-body)',
};
const sectionLabel: React.CSSProperties = {
  fontSize: `max(12px, ${fig(26)})`,
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  marginBottom: fig(16),
};
const optionText: React.CSSProperties = { fontSize: `max(14px, ${fig(30)})`, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.25 };
const optionDetail: React.CSSProperties = { fontSize: `max(12px, ${fig(26)})`, color: 'var(--wk-muted)', lineHeight: 1.35, marginTop: fig(4) };

/** A selectable row or tile: accent ring when chosen. */
const choiceStyle = (selected: boolean): React.CSSProperties => ({
  background: selected ? 'rgba(0,241,159,0.08)' : 'var(--wk-card)',
  border: `2px solid ${selected ? 'var(--wk-accent)' : 'transparent'}`,
  borderRadius: fig(24),
  minHeight: 44,
  transition: 'background 150ms, border-color 150ms',
});

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  profile,
  initialStep = 1,
  onCompleteOnboarding,
  onClose,
  onExploreDemo,
}) => {
  const returning = !!profile.onboardingCompleted;
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const canUseMuscle = canUseMusclePlan(profile.email);
  const [program, setProgram] = useState<ProgramSplitType>(
    profile.programType === 'starter_4day' || (profile.programType === 'muscle_building_6wk' && canUseMuscle)
      ? profile.programType
      : 'starter_6wk'
  );
  const [goal, setGoal] = useState<GoalPhase>(profile.goalPhase || 'Lean Bulk');
  const plan = resolveActivePlan({ programType: program, goalPhase: goal, email: profile.email });
  const SCREENS = buildScreens(plan.templates.length, plan.workoutsPerWeek, program);
  const [location, setLocation] = useState<TrainingLocation>(profile.activeLocation || 'gym');
  // Nothing ticked for new athletes: we never assume gear they may not own.
  const [homeEquipment, setHomeEquipment] = useState<HomeEquipmentTag[]>(returning ? profile.homeEquipment || [] : []);
  // Optional: one goal of the athlete's own, on top of the plan's three.
  const [ownLift, setOwnLift] = useState<string | null>(null);
  const [ownTarget, setOwnTarget] = useState('');
  const unit: WeightUnit = returning ? profile.weightUnit || 'kg' : defaultUnit();
  const ownChoice = OWN_GOAL_OPTIONS.find((l) => l.exerciseId === ownLift);
  const ownNumber = Number(ownTarget);
  const ownGoal =
    ownChoice && ownTarget.trim() !== '' && Number.isFinite(ownNumber) && ownNumber > 0
      ? makeCustomGoal(ownChoice.exerciseId, ownChoice.label, ownChoice.metric, ownChoice.metric === 'weight' ? unitToKg(ownNumber, unit) : ownNumber, '')
      : null;
  const ownInvalid = Boolean(ownChoice) && ownTarget.trim() !== '' && !ownGoal;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Move focus to the new screen's heading so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Opened from Settings to change gear: just where you train, no introduction (the goal has its own control in Settings).
  const editing = returning && initialStep === 3;

  const goTo = (next: OnboardingStep) => {
    triggerHaptic('light');
    setStep(next);
  };

  const finish = () => {
    triggerHaptic('success');
    const known: TrainingLocation[] = profile.availableLocations?.length ? profile.availableLocations : ['gym', 'home', 'travel'];
    const availableLocations = known.includes(location) ? known : [...known, location];
    onCompleteOnboarding({
      goalPhase: editing ? profile.goalPhase || goal : goal,
      programType: program,
      activeLocation: location,
      availableLocations,
      homeEquipment,
      athlete: {
        gender: profile.gender,
        // New athletes start light; the first logged sets teach the app their real strength.
        experienceLevel: returning ? profile.experienceLevel || 'intermediate' : 'new',
        weightUnit: unit,
      },
      ownGoal: !editing && ownGoal ? { exerciseId: ownGoal.exerciseId, metric: ownGoal.metric, target: ownGoal.target } : undefined,
    });
    onClose();
    window.scrollTo({ top: 0 });
  };

  const screen = SCREENS[step - 1];
  const Illustration = screen.Illustration;
  const isLast = step === 3;
  const ctaLabel = !isLast ? 'Continue' : returning ? 'Save changes' : 'Start my first workout';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="wk fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'linear-gradient(180deg, var(--color-bg-canvas-top) 0%, var(--color-bg-canvas) 70%)' }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) < 60) return;
        if (dx < 0 && step < 3) goTo((step + 1) as OnboardingStep);
        if (dx > 0 && step > 1) goTo((step - 1) as OnboardingStep);
      }}
    >
      <div
        className="mx-auto flex flex-col"
        style={{ maxWidth: 448, minHeight: '100%', padding: `max(12px, env(safe-area-inset-top)) ${fig(56)} 0` }}
      >
        {/* Back · progress · skip */}
        <div className="flex items-center justify-between" style={{ height: 52 }}>
          <div style={{ width: 88 }}>
            {step > 1 && !editing && (
              <button
                type="button"
                onClick={() => goTo((step - 1) as OnboardingStep)}
                aria-label="Back"
                className="w-11 h-11 -ml-[calc(16*var(--f))] rounded-full flex items-center justify-center text-white/70 hover:text-white"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2]" />
              </button>
            )}
          </div>
          <div className={`flex items-center ${editing ? 'invisible' : ''}`} style={{ gap: 6 }} role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                aria-hidden="true"
                style={{
                  width: s === step ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: s <= step ? 'var(--wk-accent)' : 'rgba(255,255,255,0.2)',
                  transition: 'width 250ms, background 250ms',
                }}
              />
            ))}
          </div>
          <div className="flex justify-end" style={{ width: 88 }}>
            {returning ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                }}
                aria-label="Close"
                className="w-11 h-11 -mr-[calc(16*var(--f))] rounded-full flex items-center justify-center text-white/70 hover:text-white"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            ) : (
              !isLast && (
                <button
                  type="button"
                  onClick={() => goTo(3)}
                  className="h-11 px-[calc(16*var(--f))] -mr-[calc(16*var(--f))] font-semibold text-white/70 hover:text-white"
                  style={{ fontSize: `max(14px, ${fig(30)})` }}
                >
                  Skip
                </button>
              )
            )}
          </div>
        </div>

        <div key={step} className="ob-enter flex flex-col flex-1">
          {!editing && (
            <div style={{ height: isLast ? fig(330) : fig(620), marginTop: fig(isLast ? 8 : 60) }}>
              <Illustration weeks={6} perWeek={plan.workoutsPerWeek} />
            </div>
          )}

          <h1
            id="onboarding-title"
            ref={headingRef}
            tabIndex={-1}
            className="outline-none"
            style={{ ...titleStyle, marginTop: fig(isLast ? 24 : 56) }}
          >
            {editing ? 'Where you train' : screen.title}
          </h1>
          {!editing &&
            screen.body.map((p) => (
              <p key={p} style={{ ...bodyStyle, marginTop: fig(24) }}>
                {p}
              </p>
            ))}

          {isLast && (
            <div style={{ marginTop: fig(editing ? 40 : 56) }}>
              {!editing && (
                <fieldset>
                  <legend style={sectionLabel}>What's your goal?</legend>
                  <div className="flex flex-col" style={{ gap: fig(14) }}>
                    {GOALS.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={goal === g.id}
                        onClick={() => {
                          triggerHaptic('light');
                          setGoal(g.id);
                        }}
                        className="w-full text-left flex items-center"
                        style={{ ...choiceStyle(goal === g.id), padding: `${fig(22)} ${fig(30)}`, gap: fig(24) }}
                      >
                        <span className="flex-1">
                          <span className="block" style={optionText}>
                            {g.label}
                          </span>
                          <span className="block" style={optionDetail}>
                            {g.detail}
                          </span>
                        </span>
                        <RadioDot selected={goal === g.id} />
                      </button>
                    ))}
                  </div>
                  <p style={{ ...optionDetail, marginTop: fig(16) }}>Your plan's sets and reps are set for this goal.</p>
                </fieldset>
              )}

              {!editing && (
                <fieldset style={{ marginTop: fig(48) }}>
                  <legend style={sectionLabel}>A goal of your own (optional)</legend>
                  <div className="flex flex-wrap" style={{ gap: fig(14) }}>
                    {OWN_GOAL_OPTIONS.map((lift) => {
                      const on = ownLift === lift.exerciseId;
                      return (
                        <button
                          key={lift.exerciseId}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            triggerHaptic('light');
                            setOwnLift(on ? null : lift.exerciseId);
                            setOwnTarget(on ? '' : lift.metric === 'steps' ? '10000' : '');
                          }}
                          className="flex items-center font-semibold"
                          style={{ ...choiceStyle(on), borderRadius: 999, padding: `0 ${fig(30)}`, minHeight: 44, fontSize: `max(12px, ${fig(26)})`, color: 'var(--color-text-primary)' }}
                        >
                          {lift.label}
                        </button>
                      );
                    })}
                  </div>
                  {ownChoice && (
                    <div className="flex items-center" style={{ gap: fig(16), marginTop: fig(20) }}>
                      <label htmlFor="own-goal-target" style={{ ...optionText, flexShrink: 0 }}>
                        {ownChoice.metric === 'weight' ? 'Lift' : ownChoice.metric === 'steps' ? 'Reach' : 'Do'}
                      </label>
                      <input
                        id="own-goal-target"
                        type="number"
                        inputMode={ownChoice.metric === 'weight' ? 'decimal' : 'numeric'}
                        min={ownChoice.metric === 'steps' ? 500 : 1}
                        step={ownChoice.metric === 'steps' ? 500 : undefined}
                        value={ownTarget}
                        onChange={(e) => setOwnTarget(e.target.value)}
                        aria-invalid={ownInvalid}
                        aria-describedby="own-goal-help"
                        className="wk-field tabular-numbers"
                        style={{ width: fig(220), minHeight: 44, padding: `0 ${fig(24)}`, fontSize: `max(16px, ${fig(34)})`, color: 'var(--color-text-primary)' }}
                      />
                      <span style={optionText}>
                        {ownChoice.metric === 'weight' ? unit : ownChoice.metric === 'steps' ? 'steps a day' : 'reps in one set'}
                      </span>
                    </div>
                  )}
                  <p id="own-goal-help" style={{ ...optionDetail, marginTop: fig(16) }}>
                    {ownInvalid
                      ? `Enter ${
                          ownChoice!.metric === 'weight'
                            ? 'a weight'
                            : ownChoice!.metric === 'steps'
                            ? 'between 500 and 100,000 steps'
                            : 'a number of reps'
                        } you could reach.`
                      : ownChoice
                      ? ownChoice.metric === 'weight'
                        ? 'Counted by your heaviest logged set, whatever the reps.'
                        : ownChoice.metric === 'steps'
                        ? 'Counted from Health Connect or your watch each day.'
                        : 'Counted by the most reps you log in one set.'
                      : 'Your plan gives you three goals. Add one of your own if you have a number in mind; you can add or change it later.'}
                  </p>
                </fieldset>
              )}

              {!editing && (
                <fieldset style={{ marginTop: fig(48) }}>
                  <legend style={sectionLabel}>How do you want to fit in 4 sessions a week?</legend>
                  <div className="flex flex-col" style={{ gap: fig(14) }}>
                    {PLAN_CHOICES.filter((opt) => canUseMuscle || !opt.ownerOnly).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={program === opt.id}
                        onClick={() => {
                          triggerHaptic('light');
                          setProgram(opt.id);
                        }}
                        className="w-full text-left flex items-center"
                        style={{ ...choiceStyle(program === opt.id), padding: `${fig(22)} ${fig(30)}`, gap: fig(24) }}
                      >
                        <span className="flex-1">
                          <span className="flex items-center flex-wrap" style={{ gap: fig(14) }}>
                            <span style={optionText}>{opt.label}</span>
                            {opt.recommended && (
                              <span className="wk-pill" style={{ color: 'var(--wk-accent)', background: 'rgba(0,241,159,0.12)' }}>
                                Recommended
                              </span>
                            )}
                          </span>
                          <span className="block" style={optionDetail}>
                            {opt.detail}
                          </span>
                        </span>
                        <RadioDot selected={program === opt.id} />
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset style={{ marginTop: editing ? 0 : fig(48) }}>
                <legend style={sectionLabel}>Where will you train?</legend>
                <div className="grid grid-cols-3" style={{ gap: fig(14) }}>
                  {LOCATIONS.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      aria-pressed={location === loc.id}
                      onClick={() => {
                        triggerHaptic('light');
                        setLocation(loc.id);
                      }}
                      className="text-center flex flex-col items-center justify-center"
                      style={{ ...choiceStyle(location === loc.id), padding: `${fig(26)} ${fig(10)}` }}
                    >
                      <span style={optionText}>{loc.label}</span>
                      <span style={optionDetail}>{loc.detail}</span>
                    </button>
                  ))}
                </div>
                <p style={{ ...optionDetail, marginTop: fig(16) }}>You can switch place before any workout.</p>
              </fieldset>

              {(location === 'home' || initialStep === 3) && (
                <fieldset style={{ marginTop: fig(40) }}>
                  <legend style={sectionLabel}>What do you have at home?</legend>
                  <div className="flex flex-wrap" style={{ gap: fig(14) }}>
                    {HOME_EQUIPMENT_OPTIONS.map((eq) => {
                      const on = homeEquipment.includes(eq.id);
                      return (
                        <button
                          key={eq.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            triggerHaptic('light');
                            setHomeEquipment((prev) => (on ? prev.filter((t) => t !== eq.id) : [...prev, eq.id]));
                          }}
                          className="flex items-center font-semibold"
                          style={{
                            ...choiceStyle(on),
                            borderRadius: 999,
                            padding: `0 ${fig(30)}`,
                            gap: fig(10),
                            color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            fontSize: `max(13px, ${fig(28)})`,
                          }}
                        >
                          {on && <Check className="w-4 h-4 stroke-[2]" style={{ color: 'var(--wk-accent)' }} aria-hidden="true" />}
                          {eq.label}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ ...optionDetail, marginTop: fig(16) }}>Nothing at home? Bodyweight workouts still work.</p>
                </fieldset>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Primary action stays at the bottom of the screen */}
          <div
            className="sticky bottom-0"
            style={{
              padding: `${fig(40)} 0 max(${fig(40)}, env(safe-area-inset-bottom))`,
              background: isLast ? 'linear-gradient(180deg, rgb(var(--color-bg-canvas-rgb) / 0) 0%, var(--color-bg-canvas) 35%)' : undefined,
            }}
          >
            <button
              type="button"
              onClick={() => (isLast ? finish() : goTo((step + 1) as OnboardingStep))}
              className="w-full font-bold active:scale-[0.98] transition-transform"
              style={{
                height: 54,
                borderRadius: 999,
                background: 'var(--wk-accent)',
                color: 'var(--color-text-on-accent)',
                fontSize: `max(15px, ${fig(32)})`,
              }}
            >
              {ctaLabel}
            </button>
            {step === 1 && !returning && onExploreDemo && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onExploreDemo();
                }}
                className="w-full font-semibold text-white/60 hover:text-white"
                style={{ minHeight: 44, marginTop: fig(12), fontSize: `max(13px, ${fig(28)})` }}
              >
                See a demo with sample data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const RadioDot: React.FC<{ selected: boolean }> = ({ selected }) => (
  <span
    aria-hidden="true"
    className="shrink-0 rounded-full flex items-center justify-center"
    style={{
      width: 24,
      height: 24,
      border: `2px solid ${selected ? 'var(--wk-accent)' : 'rgba(255,255,255,0.3)'}`,
      background: selected ? 'var(--wk-accent)' : 'transparent',
    }}
  >
    {selected && <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: 'var(--color-text-on-accent)' }} />}
  </span>
);
