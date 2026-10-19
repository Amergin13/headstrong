import React, { useState } from 'react';
import {
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  TrainingLocation,
  UserProfile,
} from '../../engine/types';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  Home,
  Plane,
  Target,
  TrendingUp,
  X,
  Clock,
  Sparkles,
  Layers,
  Shield,
  Zap,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

export interface OnboardingModalProps {
  profile: UserProfile;
  initialStep?: 1 | 2 | 3 | 4;
  onCompleteOnboarding: (updated: {
    goalPhase: GoalPhase;
    programType: ProgramSplitType;
    activeLocation: TrainingLocation;
    availableLocations: TrainingLocation[];
    homeEquipment: HomeEquipmentTag[];
  }) => void;
  onClose: () => void;
  onExploreDemo?: () => void;
}

import {
  PROGRAM_OPTIONS,
  ProgramSplitOption,
} from '../../services/workoutGenerator';

export { PROGRAM_OPTIONS };
export type { ProgramSplitOption };

const GOAL_OPTIONS: {
  phase: GoalPhase;
  title: string;
  badge: string;
  subtitle: string;
  sessionRule: string;
}[] = [
  {
    phase: 'Lean Bulk',
    title: 'Build Muscle & Strength',
    badge: 'Optimal Hypertrophy',
    subtitle: 'Maximize muscle growth and add weight or reps every week.',
    sessionRule: 'Beat last session by +1 rep, then add weight when you hit the top of your rep range.',
  },
  {
    phase: 'Cut / Recomp',
    title: 'Lose Fat & Keep Muscle',
    badge: 'Retention Shield Active',
    subtitle: 'Hold onto all your strength while leaning out in a calorie deficit.',
    sessionRule: 'Match your target weights at slightly lower weekly sets so you recover well in a calorie deficit.',
  },
  {
    phase: 'Maingain',
    title: 'Stay Lean & Build Stamina',
    badge: 'Work Capacity Focus',
    subtitle: 'Build strength and work capacity at your current bodyweight.',
    sessionRule: 'Progress reps steadily while keeping rest periods crisp and cardiovascular fitness high.',
  },
];

const HOME_EQUIPMENT_OPTIONS: {
  id: HomeEquipmentTag;
  label: string;
  detail: string;
}[] = [
  {
    id: 'bench',
    label: 'Workout Bench',
    detail: 'Flat or incline bench for presses, rows & split squats',
  },
  {
    id: 'dumbbells',
    label: 'Dumbbells',
    detail: 'Adjustable or fixed dumbbells for presses, rows, RDLs & curls',
  },
  {
    id: 'trx',
    label: 'TRX / Suspension Trainer',
    detail: 'Suspended chest presses, inverted rows, face pulls & leg curls',
  },
  {
    id: 'pullup_bar',
    label: 'Pull-Up Bar',
    detail: 'Doorway or wall bar for pull-ups, chin-ups & hanging leg raises',
  },
  {
    id: 'bands',
    label: 'Resistance Bands',
    detail: 'Extra tension for warmups and accessory work',
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  profile,
  initialStep = 1,
  onCompleteOnboarding,
  onClose,
  onExploreDemo,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);
  const [selectedProgram, setSelectedProgram] = useState<ProgramSplitType>(
    profile.programType || 'ppl_upper'
  );
  const [selectedGoal, setSelectedGoal] = useState<GoalPhase>(
    profile.goalPhase || 'Lean Bulk'
  );
  const [activeLocation, setActiveLocation] = useState<TrainingLocation>(
    profile.activeLocation || 'gym'
  );
  const [availableLocations, setAvailableLocations] = useState<TrainingLocation[]>(
    profile.availableLocations || ['gym', 'home', 'travel']
  );
  const [homeEquipment, setHomeEquipment] = useState<HomeEquipmentTag[]>(
    profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar']
  );

  const toggleHomeEquipment = (tag: HomeEquipmentTag) => {
    triggerHaptic('light');
    setHomeEquipment((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const toggleAvailableLocation = (loc: TrainingLocation) => {
    triggerHaptic('light');
    setAvailableLocations((prev) => {
      if (prev.includes(loc)) {
        if (prev.length === 1) return prev;
        return prev.filter((l) => l !== loc);
      }
      return [...prev, loc];
    });
  };

  const handleFinish = () => {
    triggerHaptic('success');
    onCompleteOnboarding({
      goalPhase: selectedGoal,
      programType: selectedProgram,
      activeLocation,
      availableLocations,
      homeEquipment,
    });
    onClose();
  };

  const handleDemoClick = () => {
    triggerHaptic('light');
    if (onExploreDemo) {
      onExploreDemo();
    } else {
      handleFinish();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
    >
      <div className="w-full max-w-lg rounded-3xl surface-glass border border-white/[0.12] p-5 shadow-2xl max-h-[92vh] overflow-y-auto space-y-4">
        {/* Top Header: Step Indicator & Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
              Step {step} of 4
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-medium text-slate-300">
              {step === 1
                ? 'Welcome & How It Works'
                : step === 2
                ? 'Choose Training Split'
                : step === 3
                ? 'Your Primary Goal'
                : 'Locations & Equipment'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {step === 1 && (
              <button
                type="button"
                onClick={handleDemoClick}
                className="text-xs font-semibold text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-colors"
              >
                Skip to Demo
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              aria-label="Close setup"
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* 4-Step Visual Progress Bar */}
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s <= step ? 'bg-brand-primary' : 'bg-white/[0.1]'
              }`}
            />
          ))}
        </div>

        {/* ==================================================================== */}
        {/* STEP 1: WELCOME & HOW HEADSTRONG WORKS                               */}
        {/* ==================================================================== */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-brand-primary/15 border border-brand-primary/30 text-brand-primary text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5 stroke-[2]" />
                <span>Evidence-Based Hypertrophy</span>
              </div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-xl text-white tracking-tight"
              >
                Welcome to HeadStrong
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                HeadStrong eliminates the guesswork from muscle building. Here is how we guarantee your progress:
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Feature 1: Asynchronous Hypertrophy Queue */}
              <div className="p-3.5 rounded-2xl bg-surface-elevated border border-white/[0.08] flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                  <Clock className="w-4 h-4 stroke-[2]" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-xs text-white">
                    1. Asynchronous Hypertrophy Queue
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Train when your muscles recover (24h–72h), not on rigid calendar days. If life happens and you skip a day, your next workout simply waits with full recovery and zero penalty.
                  </p>
                </div>
              </div>

              {/* Feature 2: Double Progression Engine */}
              <div className="p-3.5 rounded-2xl bg-surface-elevated border border-white/[0.08] flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <TrendingUp className="w-4 h-4 stroke-[2]" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-xs text-white">
                    2. Guaranteed Overload (We Do the Math)
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Every session tells you the exact weight and rep target to beat your last workout. When you hit the top of your rep range, we automatically increase the load.
                  </p>
                </div>
              </div>

              {/* Feature 3: Adaptive Locations & Gear */}
              <div className="p-3.5 rounded-2xl bg-surface-elevated border border-white/[0.08] flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                  <Layers className="w-4 h-4 stroke-[2]" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-xs text-white">
                    3. Adapts Across Any Gear (Gym, Home, Bodyweight)
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Can&apos;t make the gym? Switch to Home or Bodyweight in 1 tap. Exercises adapt with true biomechanical alternatives while your strength progress carries over seamlessly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 2: CHOOSE TRAINING SPLIT / PROGRAM TYPE                         */}
        {/* ==================================================================== */}
        {step === 2 && (
          <div className="space-y-3.5">
            <div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-lg text-white tracking-tight"
              >
                Choose your training split
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Select how you want your workouts grouped. You can switch this anytime in the Program tab.
              </p>
            </div>

            <div className="space-y-2.5">
              {PROGRAM_OPTIONS.map((opt) => {
                const isSelected = selectedProgram === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedProgram(opt.id);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all space-y-2 ${
                      isSelected
                        ? 'bg-brand-primary/15 border-brand-primary text-white shadow-lg shadow-brand-primary/10'
                        : 'bg-surface-elevated border-white/[0.08] text-slate-200 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-white">{opt.title}</span>
                          {opt.recommended && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                          {opt.frequency}
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-brand-primary text-black font-bold'
                            : 'border border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{opt.detail}</p>

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                      <span className="text-slate-400">Rotation:</span>
                      <span className="text-slate-200 font-medium">{opt.rotation}</span>
                    </div>

                    <div className="text-xs text-brand-primary font-semibold flex items-center space-x-1.5">
                      <span>Starter workout:</span>
                      <span className="text-white font-bold">{opt.firstSession}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 3: MAIN GOAL & PHASE                                            */}
        {/* ==================================================================== */}
        {step === 3 && (
          <div className="space-y-3.5">
            <div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-lg text-white tracking-tight"
              >
                What is your main goal right now?
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                HeadStrong calibrates your volume landmarks, rep targets, and recovery targets to match your training phase.
              </p>
            </div>

            <div className="space-y-2.5">
              {GOAL_OPTIONS.map((opt) => {
                const isSelected = selectedGoal === opt.phase;
                return (
                  <button
                    key={opt.phase}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedGoal(opt.phase);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all space-y-1.5 ${
                      isSelected
                        ? 'bg-brand-primary/15 border-brand-primary text-white'
                        : 'bg-surface-elevated border-white/[0.08] text-slate-200 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-white">{opt.title}</span>
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-300 text-xs">
                          {opt.badge}
                        </span>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                          isSelected
                            ? 'bg-brand-primary text-black font-bold'
                            : 'border border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{opt.subtitle}</p>
                    <div className="pt-1.5 border-t border-white/[0.06] text-xs text-brand-primary font-medium">
                      Session rule: {opt.sessionRule}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 4: LOCATIONS & HOME EQUIPMENT SETUP                             */}
        {/* ==================================================================== */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-lg text-white tracking-tight"
              >
                Where do you train &amp; what gear do you have?
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Can&apos;t make the gym or travelling? Switch locations in 1 tap on the Workout tab—exercises automatically adapt to your gear.
              </p>
            </div>

            {/* Training Environments */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                1. Your Training Places
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'gym' as TrainingLocation,
                      label: 'Full Gym',
                      sub: 'Barbells & Cables',
                      Icon: Dumbbell,
                    },
                    {
                      id: 'home' as TrainingLocation,
                      label: 'At Home',
                      sub: 'Custom Home Gear',
                      Icon: Home,
                    },
                    {
                      id: 'travel' as TrainingLocation,
                      label: 'Bodyweight',
                      sub: 'Zero Equipment',
                      Icon: Plane,
                    },
                  ]
                ).map(({ id, label, sub, Icon }) => {
                  const enabled = availableLocations.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={enabled}
                      onClick={() => toggleAvailableLocation(id)}
                      className={`p-2.5 rounded-2xl border text-left transition-all ${
                        enabled
                          ? 'bg-brand-primary/15 border-brand-primary text-white'
                          : 'bg-black/40 border-white/[0.08] text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Icon className="w-4 h-4 text-brand-primary stroke-[2]" />
                        {enabled && <Check className="w-3.5 h-3.5 text-brand-primary stroke-[2.5]" />}
                      </div>
                      <div className="font-bold text-xs text-white">{label}</div>
                      <div className="text-xs text-slate-400">{sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Home Equipment Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  2. What Equipment Do You Have at Home?
                </span>
                <span className="text-xs text-brand-primary font-semibold">
                  {homeEquipment.length} selected
                </span>
              </div>

              <div className="space-y-1.5">
                {HOME_EQUIPMENT_OPTIONS.map((eq) => {
                  const checked = homeEquipment.includes(eq.id);
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleHomeEquipment(eq.id)}
                      className={`w-full p-2.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        checked
                          ? 'bg-surface-elevated border-brand-primary/60 text-white'
                          : 'bg-black/40 border-white/[0.06] text-slate-400'
                      }`}
                    >
                      <div className="pr-2">
                        <div className="font-bold text-xs text-white">{eq.label}</div>
                        <div className="text-xs text-slate-400">{eq.detail}</div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-brand-primary text-black'
                            : 'border border-white/20 bg-black/40'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Location Today */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                3. Where Are You Training Today?
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'gym', label: 'Gym Today' },
                    { id: 'home', label: 'Home Today' },
                    { id: 'travel', label: 'Bodyweight' },
                  ] as const
                ).map((loc) => {
                  const isCurrent = activeLocation === loc.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      aria-pressed={isCurrent}
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveLocation(loc.id);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all ${
                        isCurrent
                          ? 'bg-brand-primary text-black border-brand-primary'
                          : 'bg-black/40 text-slate-300 border-white/[0.08]'
                      }`}
                    >
                      {loc.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* BOTTOM NAVIGATION ACTIONS                                           */}
        {/* ==================================================================== */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (initialStep === 4 && step === 4) {
                  onClose();
                } else {
                  setStep((prev) => (prev === 4 ? 3 : prev === 3 ? 2 : 1));
                }
              }}
              className="px-3.5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-200 flex items-center space-x-1"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2]" />
              <span>{initialStep === 4 && step === 4 ? 'Close' : 'Back'}</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStep((prev) => (prev === 1 ? 2 : prev === 2 ? 3 : 4));
              }}
              className="px-5 py-2.5 rounded-2xl bg-brand-primary text-black text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-brand-primary/20"
            >
              <span>{step === 1 ? 'Choose My Program' : 'Next'}</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-5 py-2.5 rounded-2xl bg-brand-primary text-black text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-brand-primary/20"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{initialStep === 4 ? 'Save Equipment' : 'Start Day 1 Workout'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
