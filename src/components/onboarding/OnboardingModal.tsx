import React, { useState } from 'react';
import {
  GoalPhase,
  HomeEquipmentTag,
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
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface OnboardingModalProps {
  profile: UserProfile;
  onCompleteOnboarding: (updated: {
    goalPhase: GoalPhase;
    activeLocation: TrainingLocation;
    availableLocations: TrainingLocation[];
    homeEquipment: HomeEquipmentTag[];
  }) => void;
  onClose: () => void;
}

const GOAL_OPTIONS: {
  phase: GoalPhase;
  title: string;
  subtitle: string;
  sessionRule: string;
}[] = [
  {
    phase: 'Lean Bulk',
    title: 'Build Muscle & Strength',
    subtitle: 'Maximize muscle growth and add weight or reps every week.',
    sessionRule: 'Beat last session by +1 rep, then add weight when you hit the top of your rep range.',
  },
  {
    phase: 'Cut / Recomp',
    title: 'Lose Fat & Keep Muscle',
    subtitle: 'Hold onto all your strength while leaning out.',
    sessionRule: 'Match your target weights at slightly lower weekly sets so you recover well in a calorie deficit.',
  },
  {
    phase: 'Maingain',
    title: 'Stay Lean & Build Stamina',
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
  onCompleteOnboarding,
  onClose,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedGoal, setSelectedGoal] = useState<GoalPhase>(profile.goalPhase || 'Lean Bulk');
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
      activeLocation,
      availableLocations,
      homeEquipment,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
    >
      <div className="w-full max-w-md rounded-3xl surface-glass border border-white/[0.12] p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        {/* Top Bar: Step Indicator & Close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
              Step {step} of 3
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-medium text-slate-300">
              {step === 1
                ? 'Your Main Goal'
                : step === 2
                ? 'Locations & Equipment'
                : 'Your Session Gameplan'}
            </span>
          </div>

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

        {/* 3-Step Progress Bar */}
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s <= step ? 'bg-brand-primary' : 'bg-white/[0.1]'
              }`}
            />
          ))}
        </div>

        {/* STEP 1: MAIN GOAL */}
        {step === 1 && (
          <div className="space-y-3.5">
            <div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-lg text-white tracking-tight"
              >
                What is your main goal right now?
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                HeadStrong tells you exactly what weight and reps to hit from session to session based on your goal.
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
                      <span className="font-bold text-sm text-white">{opt.title}</span>
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
                      Session target: {opt.sessionRule}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: TRAINING LOCATIONS & HOME EQUIPMENT */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-lg text-white tracking-tight"
              >
                Where do you train &amp; what gear do you have?
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Can&apos;t make the gym or travelling? Switch locations in 1 tap—your exercises adapt to your gear and your strength progress carries over.
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
                      label: 'Travel',
                      sub: 'Bodyweight',
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
                    { id: 'travel', label: 'Travel Today' },
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

        {/* STEP 3: SESSION-TO-SESSION GAMEPLAN PREVIEW */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-lg text-white tracking-tight"
              >
                Your Session-to-Session Gameplan
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Every time you open the app, you will immediately see what you are training today and the exact weight or rep targets needed to progress.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/50 border border-white/[0.08] space-y-3">
              <div className="flex items-start space-x-2.5">
                <div className="w-7 h-7 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary shrink-0 mt-0.5">
                  <TrendingUp className="w-4 h-4 stroke-[2]" />
                </div>
                <div>
                  <div className="font-bold text-xs text-white">
                    Clear Targets Every Session
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    Your workout card lists the exact weight and rep target to beat last session (e.g., add +1 rep, or add +2.5kg once you hit the top of your rep range).
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 pt-2.5 border-t border-white/[0.06]">
                <div className="w-7 h-7 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                  <Target className="w-4 h-4 stroke-[2]" />
                </div>
                <div>
                  <div className="font-bold text-xs text-white">
                    Real Movement Alternatives Across Locations
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    Exercises are matched by real movement biomechanics—so a Chest Press only swaps with true Chest Press variations:
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-200">
                    <li>
                      • <strong className="text-white">Full Gym:</strong> Barbell Bench Press, Cable Row, Back Squat
                    </li>
                    <li>
                      • <strong className="text-white">At Home:</strong>{' '}
                      {homeEquipment.includes('dumbbells') && homeEquipment.includes('bench')
                        ? 'Flat/Incline Dumbbell Press, Chest-Supported DB Row, Bulgarian Split Squat'
                        : homeEquipment.includes('trx')
                        ? 'TRX Suspended Chest Press, TRX Inverted Row, TRX Single-Leg Squat'
                        : 'Matched Home Variations'}
                    </li>
                    <li>
                      • <strong className="text-white">Travel:</strong> Feet-Elevated Deficit Push-Up, Inverted Row, Slow-Tempo Split Squat
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Navigation Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStep((prev) => (prev === 3 ? 2 : 1));
              }}
              className="px-3.5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-200 flex items-center space-x-1"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2]" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStep((prev) => (prev === 1 ? 2 : 3));
              }}
              className="px-5 py-2.5 rounded-2xl bg-brand-primary text-black text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-brand-primary/20"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-5 py-2.5 rounded-2xl bg-brand-primary text-black text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-brand-primary/20"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Save Setup &amp; Update Workout</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
