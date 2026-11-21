import { OWN_GOAL_OPTIONS, makeCustomGoal } from '../../services/athleteGoals';
import { formatWeight, kgToUnit, unitToKg, WeightUnit } from '../../utils/units';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Activity, Check, ChevronDown, ChevronLeft, Upload, X } from 'lucide-react';
import {
  BiometricLog,
  CustomGoal,
  ExperienceLevel,
  Gender,
  GoalPhase,
  HabitAnchor,
  HomeEquipmentTag,
  PreferredTimeOfDay,
  ProgramSplitType,
  TrainingLocation,
  UserProfile,
  WeekdayShort,
  resolveRirTrackingEnabled,
} from '../../engine/types';
import { DetectedActivity } from '../../engine/activeDays';
import { triggerHaptic } from '../../utils/haptics';
import { canUseMusclePlan, resolveActivePlan } from '../../engine/trainingPlans';
import {
  getHealthConnectStatus,
  HealthConnectStatus,
  onHealthConnectStatus,
  requestHealthConnectPermission,
  startHealthConnectBridge,
} from '../../services/healthConnectBridge';
import {
  formatOnboardingHealthSummary,
  importFromHealthConnectBridge,
  importFromHealthConnectJson,
  OnboardingHealthImportResult,
} from '../../services/onboardingHealthImport';
import {
  BaselineStatsIllustration,
  HealthConnectIllustration,
  IdentityIllustration,
  RestartIllustration,
  SessionsIllustration,
} from './OnboardingIllustrations';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;
export const ONBOARDING_TOTAL_STEPS = 5;
/** Step index for the standalone "Where you train" editor opened from Settings/Program. */
export const ONBOARDING_LOCATION_STEP: OnboardingStep = 5;

export interface OnboardingModalProps {
  profile: UserProfile;
  /** Pass ONBOARDING_LOCATION_STEP (5) to open straight on the location choice (used to edit training location & home equipment later). */
  initialStep?: OnboardingStep;
  onCompleteOnboarding: (updated: {
    goalPhase: GoalPhase;
    programType: ProgramSplitType;
    activeLocation: TrainingLocation;
    availableLocations: TrainingLocation[];
    homeEquipment: HomeEquipmentTag[];
    athlete?: {
      gender: Gender;
      sexEntered?: boolean;
      age?: number;
      ageEntered?: boolean;
      measuredHeightCm?: number;
      experienceLevel: ExperienceLevel;
      weightUnit: WeightUnit;
      bodyweightKg?: number;
    };
    /** Optional manual bodyweight entered in the lean stats step (omitted when skipped). */
    manualBaselineBiometric?: {
      bodyweightKg?: number;
    };
    /** True when the athlete connected Android Health Connect during onboarding. */
    healthConnectConnected?: boolean;
    /** Historical biometric/recovery/body/step logs imported from Health Connect during onboarding. */
    importedBiometrics?: BiometricLog[];
    /** Recent workout/activity sessions imported from Health Connect during onboarding. */
    importedActivities?: DetectedActivity[];
    /** Progressive disclosure RIR preference (hidden by default for new lifters). */
    showRirTracking?: boolean;
    /** Optional habit anchor (preferred days/time/cue) with non-punitive asynchronous rollover. */
    habitAnchor?: HabitAnchor;
    /** A goal of the athlete's own, if they set one: a weight in kg, or reps in one set. */
    ownGoal?: { exerciseId: string; metric: CustomGoal['metric']; target: number };
  }) => void;
  onClose: () => void;
  onExploreDemo?: () => void;
  /** Render inline inside a Design System showcase specimen frame instead of a full-screen dialog. */
  inline?: boolean;
}

interface ScreenCopy {
  title: string;
  body: string[];
  Illustration: React.FC<{ weeks?: number; perWeek?: number }>;
}

const buildScreens = (total: number, perWeek: number): ScreenCopy[] => [
  {
    title: 'Identity',
    body: [
      "People who stay active for life don't rely on willpower—they build a simple rhythm that fits their week.",
    ],
    Illustration: IdentityIllustration,
  },
  {
    title: `${total} sessions`,
    body: [
      `Research with new gym members found exercising at least ${perWeek} times a week for 6 weeks built a lasting habit. Treise sets every weight and rep so you just show up.`,
    ],
    Illustration: SessionsIllustration,
  },
  {
    title: 'Connect Health Connect',
    body: [
      'Pull in your weight, height, sleep, recovery, steps, and recent workouts automatically—strictly read-only on your device.',
    ],
    Illustration: HealthConnectIllustration,
  },
  {
    title: 'Your baseline stats',
    body: [
      'Optional—helps calibrate starting loads and strength standards from day one. Skip anything you prefer not to add.',
    ],
    Illustration: BaselineStatsIllustration,
  },
  {
    title: 'Your superpower is restarting',
    body: [
      'Missing a workout never ruins your progress. Switch place in one tap whenever life gets busy.',
    ],
    Illustration: RestartIllustration,
  },
];

const LOCATIONS: { id: TrainingLocation; label: string; detail: string }[] = [
  { id: 'gym', label: 'Gym', detail: 'Full equipment' },
  { id: 'home', label: 'Home', detail: 'Your own gear' },
  { id: 'travel', label: 'Bodyweight / No equipment', detail: 'Zero-equipment variations' },
];

const HOME_EQUIPMENT_OPTIONS: { id: HomeEquipmentTag; label: string }[] = [
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'bench', label: 'Bench' },
  { id: 'pullup_bar', label: 'Pull-up bar' },
  { id: 'trx', label: 'TRX' },
  { id: 'bands', label: 'Bands' },
];

const WEEKDAYS: WeekdayShort[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_WINDOWS: { id: PreferredTimeOfDay; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'midday', label: 'Midday' },
  { id: 'evening', label: 'Evening' },
  { id: 'flexible', label: 'Flexible' },
];

const EXPERIENCE_CHOICES: { id: ExperienceLevel; label: string; detail: string }[] = [
  { id: 'new', label: 'New to lifting', detail: 'Simple weight & rep targets to start' },
  { id: 'intermediate', label: '1–3 years', detail: 'Calibrated starting loads & effort tracking' },
  { id: 'experienced', label: '3+ years', detail: 'Full effort & autoregulation controls' },
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
    detail: 'Lift 3 days, plus any ride, run, walk or class',
    recommended: true,
  },
  { id: 'starter_4day', label: '4 workouts', detail: 'Lift 4 days with shorter upper & lower sessions' },
  { id: 'muscle_building_6wk', label: 'Muscle plan', detail: '4 workouts a week: supersets, drop sets, giant sets', ownerOnly: true },
];

const SEX_CHOICES: { id: Gender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

/** Pounds where gyms use them; everyone else starts in kilograms (changeable in Settings). */
const defaultUnit = (): WeightUnit => {
  if (typeof navigator === 'undefined') return 'kg';
  return /^en-(US|LR)$|^my\b/i.test(navigator.language || '') ? 'lb' : 'kg';
};

const titleStyle: React.CSSProperties = {
  fontSize: 20,
  lineHeight: '24px',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  letterSpacing: '-0.02em',
};
const bodyStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: '24px',
  color: 'var(--wk-body)',
  maxWidth: '65ch',
};
const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  lineHeight: '16px',
  fontWeight: 500,
  color: 'var(--color-text-muted)',
  marginBottom: 8,
};
const optionText: React.CSSProperties = { fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: '20px' };
const optionDetail: React.CSSProperties = { fontSize: 12, color: 'var(--wk-muted)', lineHeight: '16px', marginTop: 4 };
const focusRingClass =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]';

/** A selectable row or tile: accent ring when chosen. */
const choiceStyle = (selected: boolean): React.CSSProperties => ({
  background: selected ? 'var(--color-status-positive-soft)' : 'var(--wk-card)',
  border: `1px solid ${selected ? 'var(--wk-accent)' : 'var(--color-border-subtle)'}`,
  borderRadius: 12,
  minHeight: 44,
  transition: 'background 150ms, border-color 150ms',
});

const disclosureButtonStyle: React.CSSProperties = {
  background: 'var(--wk-raised)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 12,
  minHeight: 44,
  padding: '12px 16px',
};

const leanFieldStyle: React.CSSProperties = {
  fontSize: 16,
  minHeight: 44,
  padding: '0 12px',
  color: 'var(--color-text-primary)',
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  profile,
  initialStep = 1,
  onCompleteOnboarding,
  onClose,
  onExploreDemo,
  inline = false,
}) => {
  const uid = useId();
  const titleId = inline ? `${uid}-onboarding-title` : 'onboarding-title';
  const targetInputId = inline ? `${uid}-own-goal-target` : 'own-goal-target';
  const targetHelpId = inline ? `${uid}-own-goal-help` : 'own-goal-help';
  const weightInputId = `${uid}-baseline-weight`;
  const heightInputId = `${uid}-baseline-height`;
  const ageInputId = `${uid}-baseline-age`;
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
  const SCREENS = buildScreens(plan.templates.length, plan.workoutsPerWeek);
  const [location, setLocation] = useState<TrainingLocation>(profile.activeLocation || 'gym');
  // Nothing ticked for new athletes: we never assume gear they may not own.
  const [homeEquipment, setHomeEquipment] = useState<HomeEquipmentTag[]>(returning ? profile.homeEquipment || [] : []);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    returning ? profile.experienceLevel || 'intermediate' : 'new'
  );
  const [showRirTracking, setShowRirTracking] = useState<boolean>(
    returning ? resolveRirTrackingEnabled(profile) : false
  );
  const [preferredDays, setPreferredDays] = useState<WeekdayShort[]>(
    returning ? profile.habitAnchor?.preferredDays || [] : []
  );
  const [preferredTime, setPreferredTime] = useState<PreferredTimeOfDay>(
    returning ? profile.habitAnchor?.preferredTime || 'flexible' : 'flexible'
  );
  const [habitCue, setHabitCue] = useState<string>(returning ? profile.habitAnchor?.cue || '' : '');
  // Progressive disclosure drawers: optional enhancements stay tucked away until tapped.
  const [showHabitAnchorDrawer, setShowHabitAnchorDrawer] = useState<boolean>(false);
  const [showFineTuneDrawer, setShowFineTuneDrawer] = useState<boolean>(false);
  // Optional: one goal of the athlete's own, on top of the plan's three.
  const [ownLift, setOwnLift] = useState<string | null>(null);
  const [ownTarget, setOwnTarget] = useState('');
  const [showHomeGearFallback, setShowHomeGearFallback] = useState(false);

  // Step 3 (Health Connect) + Step 4 (Lean skippable baseline stats) state
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => (returning ? profile.weightUnit || 'kg' : defaultUnit()));
  const [hcStatus, setHcStatus] = useState<HealthConnectStatus>(() => getHealthConnectStatus());
  const [hcSyncing, setHcSyncing] = useState(false);
  const [hcError, setHcError] = useState<string | null>(null);
  const [healthImport, setHealthImport] = useState<OnboardingHealthImportResult | null>(null);
  const [hcConnectedFlag, setHcConnectedFlag] = useState(false);

  // Manual baseline stats (strictly blank by default for new athletes so skipping never saves un-entered defaults)
  const [selectedSex, setSelectedSex] = useState<Gender | null>(returning && profile.sexEntered ? profile.gender : null);
  const [weightInput, setWeightInput] = useState<string>('');
  const [heightInput, setHeightInput] = useState<string>(
    returning && profile.measuredHeightCm ? String(profile.measuredHeightCm) : ''
  );
  const [ageInput, setAgeInput] = useState<string>(
    returning && profile.ageEntered ? String(profile.age) : ''
  );
  const [statsSkipped, setStatsSkipped] = useState<boolean>(false);

  const ownChoice = OWN_GOAL_OPTIONS.find((l) => l.exerciseId === ownLift);
  const ownNumber = Number(ownTarget);
  const ownGoal =
    ownChoice && ownTarget.trim() !== '' && Number.isFinite(ownNumber) && ownNumber > 0
      ? makeCustomGoal(
          ownChoice.exerciseId,
          ownChoice.label,
          ownChoice.metric,
          ownChoice.metric === 'weight' ? unitToKg(ownNumber, weightUnit) : ownNumber,
          ''
        )
      : null;
  const ownInvalid = Boolean(ownChoice) && ownTarget.trim() !== '' && !ownGoal;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const hcFileInputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);
  const autoPullAttemptedRef = useRef(false);

  // Opened from Settings to change gear: just where you train, no introduction (the goal has its own control in Settings).
  const editing = returning && initialStep === ONBOARDING_LOCATION_STEP;

  // Listen for live Android Health Connect bridge status updates (no-op on web browsers).
  useEffect(() => {
    if (inline) return;
    startHealthConnectBridge();
    return onHealthConnectStatus(setHcStatus);
  }, [inline]);

  const applyImportedHintsToLeanForm = (imported: OnboardingHealthImportResult) => {
    setHealthImport(imported);
    setStatsSkipped(false);
    if (imported.latestBodyweightKg && imported.latestBodyweightKg > 0 && !weightInput.trim()) {
      setWeightInput(String(Math.round(kgToUnit(imported.latestBodyweightKg, weightUnit) * 10) / 10));
    }
    if (imported.latestHeightCm && imported.latestHeightCm > 0 && !heightInput.trim()) {
      setHeightInput(String(imported.latestHeightCm));
    }
    if (imported.gender && !selectedSex) {
      setSelectedSex(imported.gender);
    }
    if (imported.age && !ageInput.trim()) {
      setAgeInput(String(imported.age));
    }
  };

  const pullFromHealthConnectNow = async () => {
    setHcSyncing(true);
    setHcError(null);
    try {
      const imported = await importFromHealthConnectBridge();
      setHcConnectedFlag(true);
      applyImportedHintsToLeanForm(imported);
      triggerHaptic('success');
    } catch {
      setHcError("Couldn't read Health Connect right now. You can enter stats manually or skip.");
    } finally {
      setHcSyncing(false);
    }
  };

  // When returning from the Android Health Connect permission screen with permissions granted, pull real history automatically.
  const hcHasAnyPermission = Boolean(hcStatus.granted || hcStatus.stepsGranted || hcStatus.biometricsGranted);
  useEffect(() => {
    if (inline || editing || step !== 3) return;
    if (hcStatus.bridge && hcStatus.available && hcHasAnyPermission && !healthImport && !hcSyncing && !autoPullAttemptedRef.current) {
      autoPullAttemptedRef.current = true;
      void pullFromHealthConnectNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, editing, step, hcStatus.bridge, hcStatus.available, hcHasAnyPermission]);

  const handleImportJsonFile = (file: File) => {
    setHcError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const imported = importFromHealthConnectJson(text);
        applyImportedHintsToLeanForm(imported);
        triggerHaptic('success');
      } catch {
        setHcError("That file wasn't a valid Health Connect JSON export. You can enter stats manually or skip.");
      }
    };
    reader.onerror = () => {
      setHcError("Couldn't read that file. You can enter stats manually or skip.");
    };
    reader.readAsText(file);
  };

  // Move focus to the new screen's heading so screen readers announce it (disabled in inline specimens).
  useEffect(() => {
    if (!inline) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [inline, step]);

  // Escape closes the returning location editor dialog.
  useEffect(() => {
    if (inline || !returning) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inline, onClose, returning]);

  const goTo = (next: OnboardingStep) => {
    triggerHaptic('light');
    setStep(next);
  };

  // Parse lean form inputs safely — blank fields stay undefined (never fabricated).
  const parsedWeightNum = weightInput.trim() !== '' ? Number(weightInput) : NaN;
  const parsedWeightKg =
    Number.isFinite(parsedWeightNum) && parsedWeightNum > 0
      ? Math.round(unitToKg(parsedWeightNum, weightUnit) * 10) / 10
      : undefined;
  const weightInvalid =
    weightInput.trim() !== '' &&
    (!Number.isFinite(parsedWeightNum) || parsedWeightKg === undefined || parsedWeightKg < 25 || parsedWeightKg > 300);

  const parsedHeightNum = heightInput.trim() !== '' ? Number(heightInput) : NaN;
  const parsedHeightCm =
    Number.isFinite(parsedHeightNum) && parsedHeightNum >= 100 && parsedHeightNum <= 250
      ? Math.round(parsedHeightNum)
      : undefined;
  const heightInvalid = heightInput.trim() !== '' && parsedHeightCm === undefined;

  const parsedAgeNum = ageInput.trim() !== '' ? Number(ageInput) : NaN;
  const parsedAge =
    Number.isFinite(parsedAgeNum) && parsedAgeNum >= 13 && parsedAgeNum <= 110
      ? Math.round(parsedAgeNum)
      : undefined;
  const ageInvalid = ageInput.trim() !== '' && parsedAge === undefined;

  const leanFormHasAnyInvalid = weightInvalid || heightInvalid || ageInvalid;
  const leanFormHasAnyInput = Boolean(
    selectedSex ||
      weightInput.trim() ||
      heightInput.trim() ||
      ageInput.trim()
  );

  const switchUnit = (nextUnit: WeightUnit) => {
    if (nextUnit === weightUnit) return;
    triggerHaptic('light');
    if (parsedWeightKg !== undefined && !weightInvalid) {
      setWeightInput(String(Math.round(kgToUnit(parsedWeightKg, nextUnit) * 10) / 10));
    }
    setWeightUnit(nextUnit);
  };

  const handleStep4Continue = () => {
    if (leanFormHasAnyInvalid) {
      triggerHaptic('warning');
      return;
    }
    setStatsSkipped(false);
    goTo(5);
  };

  const handleStep4Skip = () => {
    setStatsSkipped(true);
    goTo(5);
  };

  const finish = () => {
    if (!editing && ownInvalid) {
      triggerHaptic('warning');
      setShowFineTuneDrawer(true);
      ownInputRef.current?.focus();
      return;
    }
    triggerHaptic('success');
    const known: TrainingLocation[] = profile.availableLocations?.length ? profile.availableLocations : ['gym', 'home', 'travel'];
    const availableLocations = known.includes(location) ? known : [...known, location];
    const trimmedCue = habitCue.trim();
    const habitAnchor: HabitAnchor | undefined =
      preferredDays.length > 0 || preferredTime !== 'flexible' || trimmedCue
        ? {
            ...(preferredDays.length > 0 ? { preferredDays } : {}),
            ...(preferredTime !== 'flexible' ? { preferredTime } : {}),
            ...(trimmedCue ? { cue: trimmedCue } : {}),
          }
        : undefined;
    // Progressive disclosure hygiene: only persist home equipment when training at home (or explicitly edited as fallback).
    const resolvedHomeEquipment =
      location === 'home' || (editing && showHomeGearFallback) ? homeEquipment : editing ? profile.homeEquipment || [] : [];

    // Resolve optional baseline stats strictly from real user entries or Health Connect import (never fabricated).
    const effectiveWeightKg = !statsSkipped && !weightInvalid && parsedWeightKg
      ? parsedWeightKg
      : healthImport?.latestBodyweightKg;
    const effectiveHeightCm = !statsSkipped && !heightInvalid && parsedHeightCm
      ? parsedHeightCm
      : healthImport?.latestHeightCm;
    const effectiveSex = !statsSkipped && selectedSex ? selectedSex : healthImport?.gender;
    const effectiveAge = !statsSkipped && !ageInvalid && parsedAge ? parsedAge : healthImport?.age;

    // Only emit manualBaselineBiometric when the user explicitly typed a weight (not already covered by an identical Health Connect day).
    const hasManualBiometric =
      !editing &&
      !statsSkipped &&
      Boolean(!weightInvalid && parsedWeightKg && parsedWeightKg !== healthImport?.latestBodyweightKg);

    onCompleteOnboarding({
      goalPhase: editing ? profile.goalPhase || goal : goal,
      programType: program,
      activeLocation: location,
      availableLocations,
      homeEquipment: resolvedHomeEquipment,
      athlete: {
        gender: effectiveSex ?? profile.gender,
        ...(effectiveSex ? { sexEntered: true } : {}),
        ...(effectiveAge ? { age: effectiveAge, ageEntered: true } : {}),
        ...(effectiveHeightCm ? { measuredHeightCm: effectiveHeightCm } : {}),
        // New athletes start light; the first logged sets teach the app their real strength.
        experienceLevel: editing ? profile.experienceLevel || experienceLevel : experienceLevel,
        weightUnit,
        ...(effectiveWeightKg ? { bodyweightKg: effectiveWeightKg } : {}),
      },
      ...(hasManualBiometric
        ? {
            manualBaselineBiometric: {
              ...(!weightInvalid && parsedWeightKg ? { bodyweightKg: parsedWeightKg } : {}),
            },
          }
        : {}),
      ...(hcConnectedFlag ? { healthConnectConnected: true } : {}),
      ...(healthImport && healthImport.biometrics.length > 0 ? { importedBiometrics: healthImport.biometrics } : {}),
      ...(healthImport && healthImport.activities.length > 0 ? { importedActivities: healthImport.activities } : {}),
      showRirTracking: editing ? profile.workoutDisplay?.showRirTracking : showRirTracking,
      habitAnchor: editing ? profile.habitAnchor : habitAnchor,
      ownGoal: !editing && ownGoal ? { exerciseId: ownGoal.exerciseId, metric: ownGoal.metric, target: ownGoal.target } : undefined,
    });
    onClose();
    if (!inline) {
      window.scrollTo({ top: 0 });
    }
  };

  const screen = SCREENS[step - 1];
  const Illustration = screen.Illustration;
  const isLast = step === ONBOARDING_LOCATION_STEP;
  const HeadingTag = inline ? 'h4' : 'h1';

  const selectedGoalLabel = GOALS.find((g) => g.id === goal)?.label || 'Build Muscle';
  const selectedPlanLabel = PLAN_CHOICES.find((p) => p.id === program)?.label || '3 workouts + 1 active day';
  const selectedLocationLabel = LOCATIONS.find((l) => l.id === location)?.label || 'Gym';
  const habitAnchorSummary = [
    preferredDays.length > 0 ? preferredDays.join(', ') : null,
    preferredTime !== 'flexible' ? TIME_WINDOWS.find((t) => t.id === preferredTime)?.label : null,
    habitCue.trim() ? 'cue set' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const fineTuneSummary = [
    ownGoal ? ownChoice?.label : null,
    showRirTracking ? 'RIR on' : 'RIR off',
  ]
    .filter(Boolean)
    .join(' · ');

  const importedSummaryText = healthImport ? formatOnboardingHealthSummary(healthImport, weightUnit) : null;
  const baselineReadySummary = [
    hcConnectedFlag || healthImport ? 'Health Connect' : null,
    !statsSkipped && parsedWeightKg ? formatWeight(parsedWeightKg, weightUnit) : null,
    !statsSkipped && selectedSex ? (selectedSex === 'male' ? 'Male' : 'Female') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const isHealthBridgeReady = hcStatus.bridge && hcStatus.available;

  // Determine Step 3 & Step 4 primary CTA behavior cleanly
  const primaryAction = () => {
    if (isLast) {
      finish();
      return;
    }
    if (step === 3) {
      if (isHealthBridgeReady && !hcHasAnyPermission && !healthImport) {
        triggerHaptic('light');
        setHcError(null);
        requestHealthConnectPermission();
        return;
      }
      goTo(4);
      return;
    }
    if (step === 4) {
      if (!leanFormHasAnyInput && !healthImport) {
        handleStep4Skip();
        return;
      }
      handleStep4Continue();
      return;
    }
    goTo((step + 1) as OnboardingStep);
  };

  const ctaLabel = isLast
    ? returning
      ? 'Save changes'
      : 'Start my first workout'
    : step === 3
    ? isHealthBridgeReady && !hcHasAnyPermission && !healthImport
      ? 'Connect Health Connect'
      : hcSyncing
      ? 'Syncing Health Connect…'
      : healthImport
      ? 'Continue'
      : 'Enter stats manually'
    : step === 4
    ? leanFormHasAnyInput || healthImport
      ? 'Continue'
      : 'Skip for now'
    : 'Continue';

  const bodyContent = (
    <div
      className="mx-auto flex flex-col"
      style={
        inline
          ? { padding: '0 4px' }
          : { maxWidth: 448, minHeight: '100%', padding: 'max(12px, env(safe-area-inset-top)) 16px 0' }
      }
    >
      {/* Back · progress · skip */}
      <div className="flex items-center justify-between" style={{ height: 52 }}>
        <div style={{ width: 88 }}>
          {step > 1 && !editing && (
            <button
              type="button"
              onClick={() => goTo((step - 1) as OnboardingStep)}
              aria-label="Back"
              className={`w-11 h-11 min-h-[44px] min-w-[44px] -ml-2 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--wk-raised)] ${focusRingClass}`}
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <ChevronLeft className="w-6 h-6 stroke-[2]" />
            </button>
          )}
        </div>
        <div
          className={`flex items-center ${editing ? 'invisible' : ''}`}
          style={{ gap: 8 }}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={ONBOARDING_TOTAL_STEPS}
          aria-valuenow={step}
          aria-label={`Step ${step} of ${ONBOARDING_TOTAL_STEPS}`}
        >
          {[1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              aria-hidden="true"
              style={{
                width: s === step ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: s <= step ? 'var(--wk-accent)' : 'var(--color-border-strong)',
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
              className={`w-11 h-11 min-h-[44px] min-w-[44px] -mr-2 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--wk-raised)] ${focusRingClass}`}
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          ) : (
            !isLast && (
              <button
                type="button"
                onClick={() => {
                  if (step === 4) handleStep4Skip();
                  else goTo(ONBOARDING_LOCATION_STEP);
                }}
                className={`h-11 min-h-[44px] px-2 -mr-2 rounded-xl font-medium transition-colors hover:text-[var(--color-text-primary)] ${focusRingClass}`}
                style={{ fontSize: 16, color: 'var(--color-text-secondary)' }}
              >
                Skip
              </button>
            )
          )}
        </div>
      </div>

      <div key={step} className="ob-enter flex flex-col flex-1">
        {!editing && (
          <div style={{ height: isLast || step === 4 ? 104 : 132, marginTop: 8 }}>
            <Illustration weeks={6} perWeek={plan.workoutsPerWeek} />
          </div>
        )}

        <HeadingTag
          id={titleId}
          ref={headingRef}
          tabIndex={inline ? undefined : -1}
          className={isLast ? 'outline-none' : 'wk-page-title outline-none'}
          style={{ ...(isLast ? titleStyle : {}), marginTop: 12 }}
        >
          {editing ? 'Where you train' : screen.title}
        </HeadingTag>
        {!editing &&
          screen.body.map((p) => (
            <p key={p} style={{ ...bodyStyle, marginTop: 8 }}>
              {p}
            </p>
          ))}

        {/* STEP 1: Goal (1 essential decision paired with Identity framing) */}
        {step === 1 && !editing && (
          <fieldset style={{ marginTop: 20 }}>
            <legend style={sectionLabel}>What's your goal?</legend>
            <div className="flex flex-col" style={{ gap: 8 }}>
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={goal === g.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setGoal(g.id);
                  }}
                  className={`w-full text-left flex items-center ${focusRingClass}`}
                  style={{ ...choiceStyle(goal === g.id), padding: '12px 16px', gap: 12 }}
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
            <p style={{ ...optionDetail, marginTop: 8 }}>Your sets, reps, and targets adapt automatically for this goal.</p>
          </fieldset>
        )}

        {/* STEP 2: Weekly rhythm (1 essential decision + progressively disclosed optional habit anchor) */}
        {step === 2 && !editing && (
          <div style={{ marginTop: 20 }}>
            <fieldset>
              <legend style={sectionLabel}>How do you want to fit in 4 sessions a week?</legend>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {PLAN_CHOICES.filter((opt) => canUseMuscle || !opt.ownerOnly).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={program === opt.id}
                    onClick={() => {
                      triggerHaptic('light');
                      setProgram(opt.id);
                    }}
                    className={`w-full text-left flex items-center ${focusRingClass}`}
                    style={{ ...choiceStyle(program === opt.id), padding: '12px 16px', gap: 12 }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center flex-wrap" style={{ gap: 8 }}>
                        <span style={optionText}>{opt.label}</span>
                        {opt.recommended && (
                          <span
                            className="font-medium rounded-lg px-2 py-1"
                            style={{
                              fontSize: 12,
                              lineHeight: '16px',
                              color: 'var(--wk-accent)',
                              background: 'var(--color-bg-surface-control)',
                              border: '1px solid var(--color-border-accent)',
                            }}
                          >
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

            {/* Progressive disclosure: Optional habit anchor stays collapsed unless the athlete wants to set days/time */}
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                aria-expanded={showHabitAnchorDrawer}
                onClick={() => {
                  triggerHaptic('light');
                  setShowHabitAnchorDrawer((v) => !v);
                }}
                className={`w-full text-left flex items-center justify-between gap-3 ${focusRingClass}`}
                style={disclosureButtonStyle}
              >
                <span className="min-w-0">
                  <span className="block" style={optionText}>
                    Optional habit anchor
                  </span>
                  <span className="block" style={optionDetail}>
                    {habitAnchorSummary || 'Pick preferred days or a time cue (skip anytime)'}
                  </span>
                </span>
                <ChevronDown
                  className="w-5 h-5 shrink-0 transition-transform"
                  style={{
                    color: 'var(--color-text-secondary)',
                    transform: showHabitAnchorDrawer ? 'rotate(180deg)' : undefined,
                  }}
                  aria-hidden="true"
                />
              </button>

              {showHabitAnchorDrawer && (
                <fieldset
                  className="rounded-xl p-4 mt-2 border"
                  style={{ background: 'var(--wk-card)', borderColor: 'var(--color-border-subtle)' }}
                >
                  <legend className="sr-only">Optional habit anchor (skip anytime)</legend>
                  <p style={{ ...optionDetail, marginTop: 0, marginBottom: 12 }}>
                    Miss a preferred day? Your next session rolls forward automatically—never miss twice.
                  </p>
                  <div className="flex flex-wrap" style={{ gap: 8 }}>
                    {WEEKDAYS.map((day) => {
                      const on = preferredDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            triggerHaptic('light');
                            setPreferredDays((prev) => (on ? prev.filter((d) => d !== day) : [...prev, day]));
                          }}
                          className={`flex items-center justify-center font-medium ${focusRingClass}`}
                          style={{
                            ...choiceStyle(on),
                            borderRadius: 999,
                            padding: '0 12px',
                            minWidth: 48,
                            fontSize: 12,
                            color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 mt-3" style={{ gap: 8 }}>
                    {TIME_WINDOWS.map((tw) => {
                      const on = preferredTime === tw.id;
                      return (
                        <button
                          key={tw.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            triggerHaptic('light');
                            setPreferredTime(tw.id);
                          }}
                          className={`flex items-center justify-center font-medium ${focusRingClass}`}
                          style={{
                            ...choiceStyle(on),
                            padding: '8px 12px',
                            fontSize: 12,
                            color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          }}
                        >
                          {tw.label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="block mt-3">
                    <span className="sr-only">Optional habit cue</span>
                    <input
                      type="text"
                      value={habitCue}
                      onChange={(e) => setHabitCue(e.target.value)}
                      placeholder="Optional cue, e.g. After morning coffee"
                      maxLength={80}
                      className="wk-field w-full"
                      style={leanFieldStyle}
                    />
                  </label>
                </fieldset>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Dedicated Health Connect screen (real Android bridge or JSON export; honest fallback to lean form) */}
        {step === 3 && !editing && (
          <div className="flex flex-col gap-3" style={{ marginTop: 20 }}>
            <section
              aria-label="What Health Connect brings in"
              className="wk-card flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Activity
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--wk-accent)' }}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span className="wk-subhead">Health Connect</span>
                </div>
                <span
                  className="wk-pill shrink-0"
                  style={
                    healthImport || hcHasAnyPermission
                      ? {
                          background: 'var(--color-status-positive-soft)',
                          color: 'var(--wk-accent)',
                        }
                      : undefined
                  }
                >
                  {healthImport
                    ? 'Synced'
                    : isHealthBridgeReady
                    ? hcHasAnyPermission
                      ? 'Connected'
                      : 'Ready on this phone'
                    : 'Android app'}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                <li className="wk-caption" style={{ color: 'var(--color-text-primary)' }}>
                  Bodyweight &amp; height — calibrates starting loads and strength standards
                </li>
                <li className="wk-caption" style={{ color: 'var(--color-text-primary)' }}>
                  Sleep, resting HR &amp; HRV — unlocks daily recovery status from day one
                </li>
                <li className="wk-caption" style={{ color: 'var(--color-text-primary)' }}>
                  Steps &amp; recent workouts — carries over your last 30 days of activity
                </li>
              </ul>

              <p className="wk-caption">
                Read-only and kept on your device. Health Connect doesn&apos;t store sex or age—you can add those next or skip.
              </p>

              {!isHealthBridgeReady && !healthImport && (
                <div
                  className="wk-raised flex flex-col gap-2"
                >
                  <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                    Direct Health Connect sync runs inside the Treise Android app. In this browser you can import a Health Connect JSON export or enter quick stats on the next screen.
                  </p>
                  <input
                    ref={hcFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    aria-label="Import Health Connect JSON export"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportJsonFile(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      hcFileInputRef.current?.click();
                    }}
                    className={`wk-btn-secondary w-full ${focusRingClass}`}
                  >
                    <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Import Health Connect export (.json)</span>
                  </button>
                </div>
              )}

              {healthImport && importedSummaryText && (
                <div
                  role="status"
                  className="wk-raised flex items-start gap-2 border"
                  style={{ borderColor: 'rgb(var(--color-accent-primary-rgb) / 0.4)' }}
                >
                  <Check
                    className="w-4 h-4 shrink-0 mt-1"
                    style={{ color: 'var(--wk-accent)' }}
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <span className="wk-label block">Imported</span>
                    <p className="wk-caption mt-1" style={{ color: 'var(--color-text-primary)' }}>
                      {importedSummaryText}
                    </p>
                  </div>
                </div>
              )}

              {hcError && (
                <p role="alert" className="wk-caption" style={{ color: 'var(--color-status-danger)' }}>
                  {hcError}
                </p>
              )}
            </section>
          </div>
        )}

        {/* STEP 4: Lean, 100% skippable baseline stats form (sex, weight, height, age) */}
        {step === 4 && !editing && (
          <div className="flex flex-col gap-4" style={{ marginTop: 16 }}>
            {healthImport && importedSummaryText && (
              <div
                className="wk-raised flex items-start gap-2 border"
                style={{ borderColor: 'rgb(var(--color-accent-primary-rgb) / 0.35)' }}
              >
                <Check
                  className="w-4 h-4 shrink-0 mt-1"
                  style={{ color: 'var(--wk-accent)' }}
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="wk-label block">Synced from Health Connect</span>
                  <p className="wk-caption mt-1" style={{ color: 'var(--color-text-primary)' }}>
                    {importedSummaryText}
                  </p>
                </div>
              </div>
            )}

            {/* Sex (optional, for strength standards — never pre-selected for new athletes) */}
            <fieldset>
              <legend style={sectionLabel}>Sex (optional · for strength standards)</legend>
              <div className="grid grid-cols-2" style={{ gap: 8 }}>
                {SEX_CHOICES.map((opt) => {
                  const selected = selectedSex === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedSex(selected ? null : opt.id);
                      }}
                      className={`w-full flex items-center justify-between px-4 ${focusRingClass}`}
                      style={choiceStyle(selected)}
                    >
                      <span style={optionText}>{opt.label}</span>
                      <RadioDot selected={selected} />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Weight (full width with kg/lb unit toggle) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={weightInputId} style={{ ...sectionLabel, marginBottom: 0 }}>
                  Weight ({weightUnit})
                </label>
                <div className="flex items-center gap-1" role="group" aria-label="Weight unit">
                  {(['kg', 'lb'] as WeightUnit[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={weightUnit === u}
                      onClick={() => switchUnit(u)}
                      className={`px-3 rounded-lg font-medium ${focusRingClass}`}
                      style={{
                        minHeight: 32,
                        fontSize: 12,
                        background: weightUnit === u ? 'var(--color-action-secondary-bg)' : 'transparent',
                        color: weightUnit === u ? 'var(--color-text-primary)' : 'var(--wk-muted)',
                        border: `1px solid ${weightUnit === u ? 'var(--color-border-strong)' : 'var(--color-border-subtle)'}`,
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <input
                id={weightInputId}
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder={weightUnit === 'lb' ? 'e.g. 175' : 'e.g. 80'}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                aria-invalid={weightInvalid}
                className="wk-field w-full tabular-nums"
                style={{
                  ...leanFieldStyle,
                  border: `1px solid ${weightInvalid ? 'var(--color-status-danger-fill)' : 'var(--color-border-subtle)'}`,
                }}
              />
              {weightInvalid && (
                <span role="alert" className="wk-caption" style={{ color: 'var(--color-status-danger)' }}>
                  Enter a valid weight.
                </span>
              )}
            </div>

            {/* Height + Age (balanced 2-column row) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label htmlFor={heightInputId} style={{ ...sectionLabel, marginBottom: 0 }}>
                  Height (cm)
                </label>
                <input
                  id={heightInputId}
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 178"
                  value={heightInput}
                  onChange={(e) => setHeightInput(e.target.value)}
                  aria-invalid={heightInvalid}
                  className="wk-field w-full tabular-nums"
                  style={{
                    ...leanFieldStyle,
                    border: `1px solid ${heightInvalid ? 'var(--color-status-danger-fill)' : 'var(--color-border-subtle)'}`,
                  }}
                />
                {heightInvalid && (
                  <span role="alert" className="wk-caption" style={{ color: 'var(--color-status-danger)' }}>
                    100–250 cm.
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor={ageInputId} style={{ ...sectionLabel, marginBottom: 0 }}>
                  Age
                </label>
                <input
                  id={ageInputId}
                  type="number"
                  inputMode="numeric"
                  placeholder="Years"
                  value={ageInput}
                  onChange={(e) => setAgeInput(e.target.value)}
                  aria-invalid={ageInvalid}
                  className="wk-field w-full tabular-nums"
                  style={{
                    ...leanFieldStyle,
                    border: `1px solid ${ageInvalid ? 'var(--color-status-danger-fill)' : 'var(--color-border-subtle)'}`,
                  }}
                />
                {ageInvalid && (
                  <span role="alert" className="wk-caption" style={{ color: 'var(--color-status-danger)' }}>
                    13–110.
                  </span>
                )}
              </div>
            </div>

            <p style={{ ...optionDetail, marginTop: 0 }}>
              Every field is optional and stored only on your device. You can add or update these anytime in Profile or Progress.
            </p>
          </div>
        )}

        {/* STEP 5: Lean launchpad — Where you train (+ conditional Home gear ONLY if Home selected) + Experience + Optional Fine-Tune */}
        {isLast && (
          <div style={{ marginTop: editing ? 16 : 20 }}>
            <fieldset>
              <legend className={editing ? 'sr-only' : undefined} style={editing ? undefined : sectionLabel}>
                Where will you train?
              </legend>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {LOCATIONS.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    aria-pressed={location === loc.id}
                    onClick={() => {
                      triggerHaptic('light');
                      setLocation(loc.id);
                    }}
                    className={`w-full text-left flex items-center ${focusRingClass}`}
                    style={{ ...choiceStyle(location === loc.id), padding: '12px 16px', gap: 12 }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block" style={optionText}>
                        {loc.label}
                      </span>
                      <span className="block" style={optionDetail}>
                        {loc.detail}
                      </span>
                    </span>
                    <RadioDot selected={location === loc.id} />
                  </button>
                ))}
              </div>
              <p style={{ ...optionDetail, marginTop: 8 }}>You can switch place before any workout.</p>
            </fieldset>

            {editing && location !== 'home' && !showHomeGearFallback && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowHomeGearFallback(true);
                  }}
                  className={`min-h-[44px] font-medium underline underline-offset-4 ${focusRingClass}`}
                  style={{ fontSize: 16, color: 'var(--color-text-secondary)' }}
                >
                  Edit home fallback gear{homeEquipment.length > 0 ? ` (${homeEquipment.length})` : ''}
                </button>
              </div>
            )}

            {/* Home equipment is ONLY revealed when the athlete explicitly selects Home (or fallback gear in Settings editor) */}
            {(location === 'home' || (editing && showHomeGearFallback)) && (
              <fieldset style={{ marginTop: 16 }}>
                <legend style={sectionLabel}>
                  {location === 'home' ? 'What do you have at home?' : 'What do you have at home? (fallback gear)'}
                </legend>
                <div className="flex flex-wrap" style={{ gap: 8 }}>
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
                        className={`flex items-center font-medium ${focusRingClass}`}
                        style={{
                          ...choiceStyle(on),
                          borderRadius: 999,
                          padding: '0 16px',
                          gap: 8,
                          color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          fontSize: 16,
                        }}
                      >
                        {on && <Check className="w-4 h-4 stroke-[2]" style={{ color: 'var(--wk-accent)' }} aria-hidden="true" />}
                        {eq.label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ ...optionDetail, marginTop: 8 }}>Nothing at home? Bodyweight workouts still work.</p>
              </fieldset>
            )}

            {!editing && (
              <fieldset style={{ marginTop: 20 }}>
                <legend style={sectionLabel}>Lifting experience</legend>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  {EXPERIENCE_CHOICES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={experienceLevel === opt.id}
                      onClick={() => {
                        triggerHaptic('light');
                        setExperienceLevel(opt.id);
                        setShowRirTracking(opt.id !== 'new');
                      }}
                      className={`w-full text-left flex items-center ${focusRingClass}`}
                      style={{ ...choiceStyle(experienceLevel === opt.id), padding: '12px 16px', gap: 12 }}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block" style={optionText}>{opt.label}</span>
                        <span className="block" style={optionDetail}>{opt.detail}</span>
                      </span>
                      <RadioDot selected={experienceLevel === opt.id} />
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {/* Progressive disclosure: Personal goal & RIR toggle stay tucked cleanly until tapped */}
            {!editing && (
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  aria-expanded={showFineTuneDrawer}
                  onClick={() => {
                    triggerHaptic('light');
                    setShowFineTuneDrawer((v) => !v);
                  }}
                  className={`w-full text-left flex items-center justify-between gap-3 ${focusRingClass}`}
                  style={disclosureButtonStyle}
                >
                  <span className="min-w-0">
                    <span className="block" style={optionText}>
                      Fine-tune setup (optional)
                    </span>
                    <span className="block" style={optionDetail}>
                      Add a target goal or adjust RIR logging · {fineTuneSummary}
                    </span>
                  </span>
                  <ChevronDown
                    className="w-5 h-5 shrink-0 transition-transform"
                    style={{
                      color: 'var(--color-text-secondary)',
                      transform: showFineTuneDrawer ? 'rotate(180deg)' : undefined,
                    }}
                    aria-hidden="true"
                  />
                </button>

                {showFineTuneDrawer && (
                  <div
                    className="rounded-xl p-4 mt-2 border flex flex-col gap-5"
                    style={{ background: 'var(--wk-card)', borderColor: 'var(--color-border-subtle)' }}
                  >
                    <fieldset>
                      <legend style={sectionLabel}>A goal of your own (optional)</legend>
                      <div className="flex flex-wrap" style={{ gap: 8 }}>
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
                              className={`flex items-center font-medium ${focusRingClass}`}
                              style={{
                                ...choiceStyle(on),
                                borderRadius: 999,
                                padding: '0 16px',
                                gap: 8,
                                minHeight: 44,
                                fontSize: 16,
                                color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                              }}
                            >
                              {on && <Check className="w-4 h-4 stroke-[2]" style={{ color: 'var(--wk-accent)' }} aria-hidden="true" />}
                              {lift.label}
                            </button>
                          );
                        })}
                      </div>
                      {ownChoice && (
                        <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 12 }}>
                          <label htmlFor={targetInputId} style={{ ...optionText, flexShrink: 0 }}>
                            {ownChoice.metric === 'weight' ? 'Lift' : ownChoice.metric === 'steps' ? 'Reach' : 'Do'}
                          </label>
                          <input
                            ref={ownInputRef}
                            id={targetInputId}
                            type="number"
                            inputMode={ownChoice.metric === 'weight' ? 'decimal' : 'numeric'}
                            min={ownChoice.metric === 'steps' ? 500 : 1}
                            step={ownChoice.metric === 'steps' ? 500 : undefined}
                            value={ownTarget}
                            onChange={(e) => setOwnTarget(e.target.value)}
                            aria-invalid={ownInvalid}
                            aria-describedby={targetHelpId}
                            className="wk-field tabular-nums"
                            style={{
                              width: 96,
                              minHeight: 44,
                              padding: '0 12px',
                              fontSize: 16,
                              color: 'var(--color-text-primary)',
                              border: `1px solid ${ownInvalid ? 'var(--color-status-danger-fill)' : 'var(--color-border-subtle)'}`,
                            }}
                          />
                          <span style={optionText}>
                            {ownChoice.metric === 'weight' ? weightUnit : ownChoice.metric === 'steps' ? 'steps a day' : 'reps in one set'}
                          </span>
                          {ownInvalid && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                setOwnTarget('');
                                ownInputRef.current?.focus();
                              }}
                              className={`px-3 min-h-[44px] rounded-xl font-medium ${focusRingClass}`}
                              style={{ fontSize: 12, color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-strong)' }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                      <p
                        id={targetHelpId}
                        role={ownInvalid ? 'alert' : undefined}
                        style={{
                          ...optionDetail,
                          marginTop: 8,
                          maxWidth: '65ch',
                          color: ownInvalid ? 'var(--color-status-danger)' : optionDetail.color,
                        }}
                      >
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
                          : 'Your plan starts with three built-in goals. Add one of your own now or anytime later.'}
                      </p>
                    </fieldset>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={showRirTracking}
                      onClick={() => {
                        triggerHaptic('light');
                        setShowRirTracking((v) => !v);
                      }}
                      className={`w-full text-left flex items-center justify-between ${focusRingClass}`}
                      style={{ ...choiceStyle(showRirTracking), padding: '12px 16px', gap: 12 }}
                    >
                      <span className="min-w-0">
                        <span className="block" style={optionText}>Track RIR (reps in reserve) on sets</span>
                        <span className="block" style={optionDetail}>
                          {showRirTracking
                            ? 'RIR column shown on every set.'
                            : 'Hidden by default so you can focus cleanly on weight and reps.'}
                        </span>
                      </span>
                      <span className="wk-pill shrink-0">{showRirTracking ? 'On' : 'Off'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Clear 1-line plan summary right above the launch CTA */}
            {!editing && (
              <div
                className="rounded-xl px-4 py-3 mt-4 border flex items-center justify-between gap-2"
                style={{ background: 'var(--wk-raised)', borderColor: 'var(--color-border-subtle)' }}
              >
                <div className="min-w-0">
                  <span className="wk-label block">Ready to launch</span>
                  <span className="wk-caption block mt-1" style={{ color: 'var(--color-text-primary)' }}>
                    {selectedGoalLabel} · {selectedPlanLabel} · {selectedLocationLabel}
                    {location === 'home' && homeEquipment.length > 0 ? ` (${homeEquipment.length} gear)` : ''}
                    {baselineReadySummary ? ` · ${baselineReadySummary}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => goTo(1)}
                  className={`px-3 min-h-[44px] rounded-xl font-medium shrink-0 ${focusRingClass}`}
                  style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Primary action stays at the bottom of the screen */}
        <div
          className={inline ? 'pt-4' : 'sticky bottom-0'}
          style={
            inline
              ? undefined
              : {
                  padding: `${isLast ? 20 : 16}px 0 max(16px, env(safe-area-inset-bottom))`,
                  background: isLast
                    ? 'linear-gradient(180deg, rgb(var(--color-bg-canvas-rgb) / 0) 0%, rgb(var(--color-bg-canvas-rgb) / 0.92) 44%, var(--color-bg-canvas) 72%)'
                    : undefined,
                }
          }
        >
          <button
            type="button"
            disabled={step === 3 && hcSyncing}
            onClick={primaryAction}
            className={`wk-button w-full font-semibold active:scale-[0.98] transition-transform disabled:opacity-60 ${focusRingClass}`}
            style={{
              background: 'var(--color-action-primary-bg)',
              color: 'var(--color-action-primary-fg)',
              fontSize: 16,
            }}
          >
            {ctaLabel}
          </button>

          {step === 1 && !returning && onExploreDemo ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onExploreDemo();
              }}
              className={`w-full font-medium transition-colors rounded-xl ${focusRingClass}`}
              style={{ minHeight: 44, marginTop: 4, fontSize: 16, color: 'var(--color-text-muted)' }}
            >
              See a demo with sample data
            </button>
          ) : step === 3 && !editing ? (
            <button
              type="button"
              onClick={() => {
                if (isHealthBridgeReady && !hcHasAnyPermission && !healthImport) {
                  goTo(4);
                } else {
                  goTo(5);
                }
              }}
              className={`w-full font-medium transition-colors rounded-xl ${focusRingClass}`}
              style={{ minHeight: 44, marginTop: 4, fontSize: 16, color: 'var(--color-text-muted)' }}
            >
              {isHealthBridgeReady && !hcHasAnyPermission && !healthImport
                ? 'Enter stats manually instead'
                : healthImport
                ? 'Skip extra details'
                : 'Skip for now'}
            </button>
          ) : step === 4 && !editing && (leanFormHasAnyInput || healthImport) ? (
            <button
              type="button"
              onClick={handleStep4Skip}
              className={`w-full font-medium transition-colors rounded-xl ${focusRingClass}`}
              style={{ minHeight: 44, marginTop: 4, fontSize: 16, color: 'var(--color-text-muted)' }}
            >
              Skip for now
            </button>
          ) : !isLast && !returning && !inline ? (
            <div style={{ height: 48 }} aria-hidden="true" />
          ) : null}
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div
        className="wk w-full rounded-[var(--radius-card)] overflow-hidden"
        style={{
          backgroundColor: 'var(--color-bg-canvas)',
          backgroundImage: 'linear-gradient(180deg, rgb(var(--color-bg-surface-rgb) / 0.28) 0%, transparent 70%)',
        }}
      >
        {bodyContent}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="wk fixed inset-0 z-50 overflow-y-auto"
      style={{
        backgroundColor: 'var(--color-bg-canvas)',
        backgroundImage: 'linear-gradient(180deg, rgb(var(--color-bg-surface-rgb) / 0.28) 0%, transparent 70%)',
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (editing || touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) < 60) return;
        if (dx < 0 && step < ONBOARDING_LOCATION_STEP) goTo((step + 1) as OnboardingStep);
        if (dx > 0 && step > 1) goTo((step - 1) as OnboardingStep);
      }}
    >
      {bodyContent}
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
      border: `2px solid ${selected ? 'var(--wk-accent)' : 'var(--color-border-strong)'}`,
    }}
  >
    {selected && <span className="rounded-full" style={{ width: 12, height: 12, background: 'var(--wk-accent)' }} />}
  </span>
);
