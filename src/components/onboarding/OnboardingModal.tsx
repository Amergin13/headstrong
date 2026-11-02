import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, X } from 'lucide-react';
import {
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
import { PROGRAM_OPTIONS, FEATURED_PROGRAM_OPTIONS, ProgramSplitOption } from '../../services/workoutGenerator';
import { IdentityIllustration, RestartIllustration, SessionsIllustration } from './OnboardingIllustrations';

export { PROGRAM_OPTIONS, FEATURED_PROGRAM_OPTIONS };
export type { ProgramSplitOption };

export type OnboardingStep = 1 | 2 | 3;

export interface OnboardingModalProps {
  profile: UserProfile;
  /** 3 opens straight on the plan and place choice (used to edit equipment later). */
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
  }) => void;
  onClose: () => void;
  onExploreDemo?: () => void;
}

/** One Figma pixel (1344 px frame) in screen pixels; see .wk in index.css. */
const fig = (px: number) => `calc(${px} * var(--f))`;

const SCREENS: { title: string; body: string[]; Illustration: React.FC }[] = [
  {
    title: 'Identity',
    body: [
      "People who stay active for life don't rely on willpower. They build an identity where movement is a fundamental part of who they are.",
    ],
    Illustration: IdentityIllustration,
  },
  {
    title: '24 sessions',
    body: [
      'Repeating something is how it becomes part of who you are. Our 6-week plan gives you 24 sessions, 4 a week, to build the start of your journey.',
      'We set your weights and reps for every session, so you just show up and lift.',
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

const PLAN_ID: ProgramSplitType = 'muscle_building_6wk';

/** Pounds where gyms use them; everyone else starts in kilograms (changeable in Settings). */
const defaultUnit = (): WeightUnit => {
  if (typeof navigator === 'undefined') return 'kg';
  return /^en-(US|LR)$|^my\b/i.test(navigator.language || '') ? 'lb' : 'kg';
};

const titleStyle: React.CSSProperties = {
  fontSize: `max(22px, ${fig(60)})`,
  lineHeight: 1.15,
  fontWeight: 700,
  color: '#fff',
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
  color: '#fff',
  marginBottom: fig(16),
};
const optionText: React.CSSProperties = { fontSize: `max(14px, ${fig(30)})`, fontWeight: 700, color: '#fff', lineHeight: 1.25 };
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
  // New athletes are pointed at the 6-week plan: it is what the three screens describe.
  const [program, setProgram] = useState<ProgramSplitType>(returning ? profile.programType || PLAN_ID : PLAN_ID);
  const [showOtherPrograms, setShowOtherPrograms] = useState(returning && profile.programType !== PLAN_ID);
  const [location, setLocation] = useState<TrainingLocation>(profile.activeLocation || 'gym');
  // Nothing ticked for new athletes: we never assume gear they may not own.
  const [homeEquipment, setHomeEquipment] = useState<HomeEquipmentTag[]>(returning ? profile.homeEquipment || [] : []);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Move focus to the new screen's heading so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const goTo = (next: OnboardingStep) => {
    triggerHaptic('light');
    setStep(next);
  };

  const finish = () => {
    triggerHaptic('success');
    const known: TrainingLocation[] = profile.availableLocations?.length ? profile.availableLocations : ['gym', 'home', 'travel'];
    const availableLocations = known.includes(location) ? known : [...known, location];
    onCompleteOnboarding({
      goalPhase: profile.goalPhase || 'Lean Bulk',
      programType: program,
      activeLocation: location,
      availableLocations,
      homeEquipment,
      athlete: {
        gender: profile.gender,
        // New athletes start light; the first logged sets teach the app their real strength.
        experienceLevel: returning ? profile.experienceLevel || 'intermediate' : 'new',
        weightUnit: returning ? profile.weightUnit || 'kg' : defaultUnit(),
      },
    });
    onClose();
    window.scrollTo({ top: 0 });
  };

  const screen = SCREENS[step - 1];
  const Illustration = screen.Illustration;
  const isLast = step === 3;
  // Opened from Settings to change plan or gear: just the choices, no introduction.
  const editing = returning && initialStep === 3;
  const ctaLabel = !isLast ? 'Continue' : returning ? 'Save changes' : 'Start my first workout';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="wk fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'linear-gradient(180deg, #283339 0%, #13181C 70%)' }}
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
                className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-white/70 hover:text-white"
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
                className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-white/70 hover:text-white"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            ) : (
              !isLast && (
                <button
                  type="button"
                  onClick={() => goTo(3)}
                  className="h-11 px-2 -mr-2 font-semibold text-white/70 hover:text-white"
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
              <Illustration />
            </div>
          )}

          <h1
            id="onboarding-title"
            ref={headingRef}
            tabIndex={-1}
            className="outline-none"
            style={{ ...titleStyle, marginTop: fig(isLast ? 24 : 56) }}
          >
            {editing ? 'Your plan and gear' : screen.title}
          </h1>
          {!editing &&
            screen.body.map((p) => (
              <p key={p} style={{ ...bodyStyle, marginTop: fig(24) }}>
                {p}
              </p>
            ))}

          {isLast && (
            <div style={{ marginTop: fig(editing ? 40 : 56) }}>
              <fieldset>
                <legend style={sectionLabel}>Choose your plan</legend>
                <button
                  type="button"
                  aria-pressed={program === PLAN_ID}
                  onClick={() => {
                    triggerHaptic('light');
                    setProgram(PLAN_ID);
                  }}
                  className="w-full text-left flex items-center"
                  style={{ ...choiceStyle(program === PLAN_ID), padding: fig(30), gap: fig(24) }}
                >
                  <span className="flex-1">
                    <span className="flex items-center flex-wrap" style={{ gap: fig(14) }}>
                      <span style={optionText}>6-week plan</span>
                      <span className="wk-pill" style={{ color: 'var(--wk-accent)', background: 'rgba(0,241,159,0.12)' }}>
                        Recommended
                      </span>
                    </span>
                    <span className="block" style={optionDetail}>
                      24 workouts, 4 a week, in three 2-week phases that build muscle.
                    </span>
                  </span>
                  <RadioDot selected={program === PLAN_ID} />
                </button>

                <button
                  type="button"
                  aria-expanded={showOtherPrograms}
                  onClick={() => setShowOtherPrograms((v) => !v)}
                  className="w-full flex items-center justify-between font-semibold text-white/70 hover:text-white"
                  style={{ minHeight: 44, marginTop: fig(12), fontSize: `max(13px, ${fig(28)})` }}
                >
                  Other programs
                  <ChevronDown className={`w-5 h-5 stroke-[2] transition-transform ${showOtherPrograms ? 'rotate-180' : ''}`} />
                </button>
                {showOtherPrograms && (
                  <div className="flex flex-col" style={{ gap: fig(14), marginTop: fig(8) }}>
                    {PROGRAM_OPTIONS.map((opt) => (
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
                          <span className="block" style={optionText}>
                            {opt.title}
                          </span>
                          <span className="block" style={optionDetail}>
                            {opt.frequency}
                          </span>
                        </span>
                        <RadioDot selected={program === opt.id} />
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>

              <fieldset style={{ marginTop: fig(48) }}>
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
                            color: on ? '#fff' : 'rgba(255,255,255,0.75)',
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
              background: isLast ? 'linear-gradient(180deg, rgba(19,24,28,0) 0%, #13181C 35%)' : undefined,
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
                color: '#13181C',
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
    {selected && <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: '#13181C' }} />}
  </span>
);
