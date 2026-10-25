import React, { useState } from 'react';
import {
  ExperienceLevel,
  Gender,
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
  Scale,
  Ruler,
  Smartphone,
  BookOpen,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { unitToKg, WeightUnit } from '../../utils/units';

export interface OnboardingModalProps {
  profile: UserProfile;
  initialStep?: 1 | 2 | 3 | 4;
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

import {
  PROGRAM_OPTIONS,
  FEATURED_PROGRAM_OPTIONS,
  ProgramSplitOption,
} from '../../services/workoutGenerator';

export { PROGRAM_OPTIONS, FEATURED_PROGRAM_OPTIONS };
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
    badge: 'Most popular',
    subtitle: 'Maximize muscle growth and add weight or reps every week.',
    sessionRule: 'Beat last session by +1 rep, then add weight when you hit the top of your rep range.',
  },
  {
    phase: 'Cut / Recomp',
    title: 'Lose Fat & Keep Muscle',
    badge: 'Keeps your strength',
    subtitle: 'Hold onto all your strength while leaning out in a calorie deficit.',
    sessionRule: 'Match your target weights at slightly lower weekly sets so you recover well in a calorie deficit.',
  },
  {
    phase: 'Maingain',
    title: 'Stay Lean & Build Stamina',
    badge: 'Fitness focus',
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
  // New athletes start with nothing ticked: we never assume home gear they may not own.
  const [homeEquipment, setHomeEquipment] = useState<HomeEquipmentTag[]>(
    profile.onboardingCompleted ? profile.homeEquipment || [] : []
  );
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(profile.weightUnit || 'kg');
  const [gender, setGender] = useState<Gender>(profile.gender || 'male');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    profile.experienceLevel || 'intermediate'
  );
  const [bodyweightInput, setBodyweightInput] = useState('');

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
      athlete: {
        gender,
        experienceLevel,
        weightUnit,
        bodyweightKg: (() => {
          const v = parseFloat(bodyweightInput);
          if (!Number.isFinite(v) || v <= 0) return undefined;
          const kg = unitToKg(v, weightUnit);
          return kg >= 30 && kg <= 300 ? Math.round(kg * 10) / 10 : undefined;
        })(),
      },
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
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
    >
      <div className="wk-card w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto space-y-5">
        {/* Top Header: Step Indicator & Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="wk-label text-[#00F19F]">
              Step {step} of 4
            </span>
            <span className="wk-caption">•</span>
            <span className="wk-caption text-white">
              {step === 1
                ? 'Welcome & How It Works'
                : step === 2
                ? 'Your Primary Goal'
                : step === 3
                ? 'Choose Training Split'
                : 'Locations & Equipment'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {step === 1 && (
              <button
                type="button"
                onClick={handleDemoClick}
                className="wk-pill text-xs font-semibold text-[#C6C6C6] hover:text-white px-3 py-2 min-h-[44px] transition-colors flex items-center"
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
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-[#3B4044] hover:bg-[#474D50] flex items-center justify-center text-[#C6C6C6] hover:text-white transition-colors"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* 4-Step Visual Progress Bar */}
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s <= step ? 'bg-[#00F19F]' : 'bg-[#3B4044]'
              }`}
            />
          ))}
        </div>

        {/* ==================================================================== */}
        {/* STEP 1: WELCOME & HOW TREISE WORKS                                   */}
        {/* ==================================================================== */}
        {step === 1 && (
          <div className="space-y-3.5">
            <div>
              <div className="wk-pill inline-flex items-center space-x-1.5 px-2.5 py-1 text-[#00F19F] text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5 stroke-[2]" />
                <span>Evidence-Based Hypertrophy</span>
              </div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-xl text-white tracking-tight"
              >
                Welcome to Treise
              </h2>
              <p className="wk-body mt-1 leading-relaxed">
                Your plan, your weights and your progress in one place. Just show up and lift.
              </p>
            </div>

            <ul className="space-y-2.5">
              {[
                {
                  icon: <BookOpen className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
                  tone: 'bg-[#13181C] text-[#00F19F]',
                  title: 'Guaranteed Overload: we do the math',
                  body: 'Log your sets and Treise tells you exactly what to lift next time: one more rep, or a little more weight.',
                },
                {
                  icon: <Clock className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
                  tone: 'bg-[#13181C] text-amber-400',
                  title: "Train when you're recovered",
                  body: 'Your next workout waits until your muscles are ready, with no missed-day guilt. Adapts Across Any Gear: gym, home or travel in one tap.',
                },
                {
                  icon: <Scale className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
                  tone: 'bg-[#13181C] text-[#00F19F]',
                  title: 'Track real progress',
                  body: "Weigh in each morning and we'll use a 7-day average. When you build muscle and lose fat together, the scale can barely move while your waist shrinks. That's still progress.",
                },
              ].map((item) => (
                <li key={item.title} className="wk-raised p-3.5 flex gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.tone}`}>
                    {item.icon}
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs text-white">{item.title}</div>
                    <p className="wk-body leading-relaxed">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="wk-caption">
              You can connect a Pixel Watch, Fitbit or Whoop later to adjust training to your recovery.
            </p>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 2: MAIN GOAL & PHASE                                            */}
        {/* ==================================================================== */}
        {step === 2 && (
          <div className="space-y-3.5">
            <div>
              <div className="wk-pill inline-flex items-center space-x-1.5 px-2.5 py-1 text-[#00F19F] text-xs font-bold mb-2">
                <Target className="w-3.5 h-3.5 stroke-[2]" />
                <span>Intent &amp; Recovery Strategy</span>
              </div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-xl text-white tracking-tight"
              >
                What is your main goal right now?
              </h2>
              <p className="wk-body mt-1 leading-relaxed">
                Your sets, reps and recovery targets are tuned to this goal. You can change it any time.
              </p>
            </div>

            <section aria-label="About you" className="wk-raised p-4 space-y-3">
              <div>
                <h3 className="wk-h1 text-white">About you</h3>
                <p className="wk-caption">Sets your starting weights so day one isn't a guess.</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="wk-body">Units</span>
                <div className="wk-segments grid grid-cols-2" role="group" aria-label="Weight units">
                  {(['kg', 'lb'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={weightUnit === u}
                      onClick={() => setWeightUnit(u)}
                      className="wk-segment px-4"
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="onboarding-bodyweight" className="wk-body">
                  Bodyweight
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="onboarding-bodyweight"
                    type="number"
                    inputMode="decimal"
                    placeholder={weightUnit === 'lb' ? '175' : '80'}
                    value={bodyweightInput}
                    onChange={(e) => setBodyweightInput(e.target.value)}
                    className="wk-input w-20 min-h-[40px] px-2 text-center font-mono font-bold text-white text-xs focus:outline-none"
                  />
                  <span className="wk-caption w-5">{weightUnit}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="wk-body">Strength standards</span>
                <div className="wk-segments grid grid-cols-2" role="group" aria-label="Strength standards">
                  {([
                    { id: 'male', label: 'Male' },
                    { id: 'female', label: 'Female' },
                  ] as const).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={gender === g.id}
                      onClick={() => setGender(g.id)}
                      className="wk-segment px-3"
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="wk-body">How long have you been lifting?</span>
                <div className="wk-segments grid grid-cols-3" role="group" aria-label="Training experience">
                  {([
                    { id: 'new', label: 'New' },
                    { id: 'intermediate', label: '1–3 years' },
                    { id: 'experienced', label: '3+ years' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={experienceLevel === opt.id}
                      onClick={() => setExperienceLevel(opt.id)}
                      className="wk-segment"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <div className="space-y-3">
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
                    className={`wk-raised w-full p-4 text-left transition-all space-y-2 ${
                      isSelected
                        ? 'ring-2 ring-[#00F19F] text-white'
                        : 'text-[#C6C6C6] hover:bg-[#474D50]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-white">{opt.title}</span>
                        <span className="wk-pill px-2.5 py-0.5 text-white text-xs font-semibold">
                          {opt.badge}
                        </span>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                          isSelected
                            ? 'bg-[#00F19F] text-[#13181C] font-bold'
                            : 'bg-[#13181C]'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                    </div>
                    <p className="wk-body">{opt.subtitle}</p>
                    <div className="pt-1.5 border-t border-white/[0.06] text-xs text-[#00F19F] font-medium">
                      Session rule: {opt.sessionRule}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 3: CHOOSE TRAINING SPLIT / PROGRAM TYPE                         */}
        {/* ==================================================================== */}
        {step === 3 && (
          <div className="space-y-3.5">
            <div>
              <div className="wk-pill inline-flex items-center space-x-1.5 px-3 py-1 text-[#C6C6C6] text-xs font-semibold mb-2">
                <Target className="w-3.5 h-3.5 text-[#00F19F] stroke-[2]" />
                <span>Selected Goal:</span>
                <span className="text-[#00F19F] font-bold">{selectedGoal}</span>
              </div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-xl text-white tracking-tight"
              >
                Choose your training split
              </h2>
              <p className="wk-body mt-1 leading-relaxed">
                Select how you want your workouts grouped. You can switch this anytime in the Program tab.
              </p>
            </div>

            <div className="space-y-3">
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
                    className={`wk-raised w-full p-4 text-left transition-all space-y-2.5 ${
                      isSelected
                        ? 'ring-2 ring-[#00F19F] text-white'
                        : 'text-[#C6C6C6] hover:bg-[#474D50]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-white">{opt.title}</span>
                          {opt.recommended && (
                            <span className="wk-pill px-2 py-0.5 text-[#00F19F] text-xs font-bold">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="wk-caption">
                          {opt.frequency}
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-[#00F19F] text-[#13181C] font-bold'
                            : 'bg-[#13181C]'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                    </div>

                    <p className="wk-body leading-relaxed">{opt.detail}</p>

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                      <span className="text-[#AAABAD]">Rotation:</span>
                      <span className="text-white font-medium">{opt.rotation}</span>
                    </div>

                    <div className="text-xs text-[#00F19F] font-semibold flex items-center space-x-1.5">
                      <span>Starter workout:</span>
                      <span className="text-white font-bold">{opt.firstSession}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Featured Periodized 6-Week Program Option */}
            <div className="pt-2 space-y-2">
              <div className="wk-label px-1">
                Featured 6-Week Periodized Block
              </div>
              {FEATURED_PROGRAM_OPTIONS.map((opt) => {
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
                    className={`wk-raised w-full p-4 text-left transition-all space-y-2.5 ${
                      isSelected
                        ? 'ring-2 ring-[#00F19F] text-white'
                        : 'text-[#C6C6C6] hover:bg-[#474D50]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-white">{opt.title}</span>
                          <span className="wk-pill px-2 py-0.5 text-amber-300 text-xs font-bold">
                            {opt.badge}
                          </span>
                        </div>
                        <div className="wk-caption">
                          {opt.frequency}
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-[#00F19F] text-[#13181C] font-bold'
                            : 'bg-[#13181C]'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                    </div>

                    <p className="wk-body leading-relaxed">{opt.detail}</p>

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                      <span className="text-[#AAABAD]">Rotation:</span>
                      <span className="text-white font-medium">{opt.rotation}</span>
                    </div>

                    <div className="text-xs text-[#00F19F] font-semibold flex items-center space-x-1.5">
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
        {/* STEP 4: LOCATIONS & HOME EQUIPMENT SETUP                             */}
        {/* ==================================================================== */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2
                id="onboarding-modal-title"
                className="font-bold text-xl text-white tracking-tight"
              >
                Where do you train &amp; what gear do you have?
              </h2>
              <p className="wk-body mt-1 leading-relaxed">
                Can&apos;t make the gym or travelling? Switch locations in 1 tap on the Workout tab—exercises automatically adapt to your gear.
              </p>
            </div>

            {/* Training Environments */}
            <div className="space-y-2">
              <span className="wk-label block">
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
                      className={`wk-raised p-3 text-left transition-all ${
                        enabled
                          ? 'ring-1 ring-[#00F19F] text-white'
                          : 'opacity-70 text-[#AAABAD]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Icon className="w-4 h-4 text-[#00F19F] stroke-[2]" />
                        {enabled && <Check className="w-3.5 h-3.5 text-[#00F19F] stroke-[2.5]" />}
                      </div>
                      <div className="font-bold text-xs text-white">{label}</div>
                      <div className="wk-caption">{sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Home Equipment Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="wk-label">
                  2. What Equipment Do You Have at Home?
                </span>
                <span className="text-xs text-[#00F19F] font-semibold">
                  {homeEquipment.length} selected
                </span>
              </div>

              <div className="space-y-2">
                {HOME_EQUIPMENT_OPTIONS.map((eq) => {
                  const checked = homeEquipment.includes(eq.id);
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleHomeEquipment(eq.id)}
                      className={`wk-raised w-full p-3 text-left transition-all flex items-center justify-between ${
                        checked
                          ? 'ring-1 ring-[#00F19F] text-white'
                          : 'text-[#AAABAD]'
                      }`}
                    >
                      <div className="pr-2">
                        <div className="font-bold text-xs text-white">{eq.label}</div>
                        <div className="wk-caption">{eq.detail}</div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-[#00F19F] text-[#13181C]'
                            : 'bg-[#13181C]'
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
              <span className="wk-label block">
                3. Where Are You Training Today?
              </span>
              <div className="wk-segments grid grid-cols-3">
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
                      className="wk-segment"
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
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
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
              className="px-4 py-2.5 min-h-[44px] rounded-2xl bg-[#3B4044] hover:bg-[#474D50] text-xs font-semibold text-white flex items-center space-x-1"
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
              className="px-5 py-2.5 min-h-[44px] rounded-2xl bg-[#00F19F] hover:opacity-90 text-[#13181C] text-xs font-bold flex items-center space-x-1.5 active:scale-95"
            >
              <span>
                {step === 1
                  ? 'Choose My Goal'
                  : step === 2
                  ? 'Continue to Split'
                  : 'Set Up Equipment'}
              </span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-5 py-2.5 min-h-[44px] rounded-2xl bg-[#00F19F] hover:opacity-90 text-[#13181C] text-xs font-bold flex items-center space-x-1.5 active:scale-95"
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
