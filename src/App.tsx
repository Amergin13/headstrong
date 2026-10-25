import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
  AuthUser,
  getActiveWearableProvider,
} from './engine/types';
import { calculateDailyReadiness } from './engine/readiness';
import { getLatestBodyweightEma } from './engine/ema';
import {
  calculateBestPillarE1rms,
  calculateWeeklyMuscleVolume,
  clearAuthUser,
  exportAllUserDataJSON,
  importUserDataJSON,
  loadActiveWorkout,
  loadAuthUser,
  loadBiometrics,
  loadExercises,
  loadProfile,
  loadWorkouts,
  permanentlyEraseAllUserData,
  resetAllToSeedData,
  saveActiveWorkout,
  saveAuthUser,
  saveBiometrics,
  saveExercises,
  saveProfile,
  saveWorkouts,
} from './services/storage';
import {
  adaptWorkoutSessionToLocation,
  generateSmartWorkoutSession,
  getFirstSplitDayForProgram,
  getNextSplitDay,
  SplitDayType,
} from './services/workoutGenerator';
import { WhoopWorkoutStrainSummary } from './services/whoopService';
import {
  generate6WeekMuscleBuildingWorkout,
  getNextProgramWorkoutNumber,
} from './engine/muscleBuildingProgram';
import { prepareSessionForAthlete } from './services/sessionPreparation';
import { completeWorkout } from './services/workoutCompletion';
import { evaluateSetProgressAward, planRestAfterSet } from './services/setCompletion';
import { usePersistedState } from './hooks/usePersistedState';
import { useWearableSync } from './hooks/useWearableSync';
import { useLaunchLinks } from './hooks/useLaunchLinks';
import { UnitsProvider } from './utils/unitsContext';
import { WeightUnit } from './utils/units';
import { RestTimerContext } from './components/common/RestTimerModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/common/Header';
import { NavigationBar, TabId } from './components/common/NavigationBar';
import { RestTimerModal } from './components/common/RestTimerModal';
import { XPNotification } from './components/common/XPNotification';
import { TrainTab } from './components/train/TrainTab';
import { WatchSyncModal } from './components/program/WatchSyncModal';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { GoogleAuthModal } from './components/auth/GoogleAuthModal';
import { localDateString } from './utils/date';

// Secondary tabs and the coach load on demand, keeping the first download small.
const CharacterTab = lazy(() => import('./components/character/CharacterTab').then((m) => ({ default: m.CharacterTab })));
import type { MeasurementEntry } from './components/analytics/WeightLogModal';
const AnalyticsTab = lazy(() => import('./components/analytics/AnalyticsTab').then((m) => ({ default: m.AnalyticsTab })));
const ProgramTab = lazy(() => import('./components/program/ProgramTab').then((m) => ({ default: m.ProgramTab })));
const AICoachChatModal = lazy(() => import('./components/assistant/AICoachChatModal').then((m) => ({ default: m.AICoachChatModal })));

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('train');
  // Saved on every change.
  const [profile, setProfile] = usePersistedState<UserProfile>(loadProfile, saveProfile);
  const [biometrics, setBiometrics] = usePersistedState<BiometricLog[]>(loadBiometrics, saveBiometrics);
  const [workouts, setWorkouts] = usePersistedState<WorkoutSession[]>(loadWorkouts, saveWorkouts);
  const [activeWorkout, setActiveWorkout] = usePersistedState<WorkoutSession>(loadActiveWorkout, saveActiveWorkout);
  const [exercises, setExercises] = usePersistedState<ExerciseDefinition[]>(loadExercises, saveExercises);

  // Modals & Floating Overlays
  const [restTimerOpen, setRestTimerOpen] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const [restTimerKey, setRestTimerKey] = useState(0);
  const [restTimerContext, setRestTimerContext] = useState<RestTimerContext | undefined>(undefined);
  const [watchModalOpen, setWatchModalOpen] = useState(false);
  const [aiCoachOpen, setAiCoachOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(loadAuthUser);
  const [onboardingOpen, setOnboardingOpen] = useState(!profile.onboardingCompleted);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<1 | 2 | 3 | 4>(1);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [xpNotification, setXpNotification] = useState<{
    amount: number;
    message: string;
    bonusTag?: string;
  } | null>(null);

  // Listen for PWA beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Handler: Google / Supabase Auth Success
  const handleAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    saveAuthUser(user);
    setProfile((prev) => {
      const updated: UserProfile = {
        ...prev,
        name: user.name && user.name !== 'Athlete' ? user.name : prev.name,
        email: user.email || prev.email,
        avatarUrl: user.avatarUrl || prev.avatarUrl,
        authUserId: user.id,
        authProvider: user.provider,
        lastLoginAt: new Date().toISOString(),
      };
      return updated;
    });
    setXpNotification({
      amount: 0,
      message: `Welcome, ${user.name || 'Athlete'}! Account connected.`,
      bonusTag: 'Google Account',
    });
  };

  // Handler: Sign Out
  const handleSignOut = () => {
    clearAuthUser();
    setAuthUser(null);
    setProfile((prev) => {
      const updated: UserProfile = {
        ...prev,
        email: undefined,
        avatarUrl: undefined,
        authUserId: undefined,
        authProvider: 'guest',
      };
      return updated;
    });
    setXpNotification({
      amount: 0,
      message: 'Signed out. Your workout history remains saved locally.',
      bonusTag: 'Account',
    });
  };

  const notify = (message: string, bonusTag: string) => setXpNotification({ amount: 0, message, bonusTag });

  const { handleSyncCompleted, completeWearableConnection } = useWearableSync({
    profile,
    setProfile,
    workouts,
    setWorkouts,
    setBiometrics,
    notify,
  });

  useLaunchLinks({
    onOpenTab: (tab) => setActiveTab(tab),
    onOpenCoach: () => setAiCoachOpen(true),
    onOpenWatchSync: () => setWatchModalOpen(true),
    onOpenAuth: () => setAuthModalOpen(true),
    onAuthSuccess: handleAuthSuccess,
    onWearableOAuthCode: (code, provider) => {
      completeWearableConnection(code, provider);
    },
  });

  // Derived calculations
  const bodyweightEmaKg = getLatestBodyweightEma(biometrics, 80.0);
  // Zeros mean "no data" — never fabricate recovery metrics for athletes without a wearable.
  const latestBiometrics: BiometricLog = biometrics[biometrics.length - 1] || {
    date: localDateString(),
    bodyweightKg: bodyweightEmaKg,
    hrvRmssd: 0,
    restingHr: 0,
    sleepHours: 0,
    steps: 0,
    activeZoneMinutes: 0,
  };

  const activeWearable = getActiveWearableProvider(profile);

  const readiness = calculateDailyReadiness(latestBiometrics, biometrics, activeWearable);

  const pillarBestE1rm = calculateBestPillarE1rms(workouts, bodyweightEmaKg);
  const weeklyVolume = calculateWeeklyMuscleVolume(workouts, exercises, activeWorkout);

  // Handler: Award XP & update level
  // Amounts arrive final (the Primed bonus is applied only to workout completion, inside
  // calculateWorkoutCompletionXp). Uses a functional update so delayed awards never overwrite
  // each other with a stale XP total.
  const addXp = (amount: number, message: string, bonusTag?: string) => {
    const finalAmount = Math.round(amount);
    setProfile((prev) => {
      const newTotalXp = prev.currentXp + finalAmount;
      return {
        ...prev,
        currentXp: newTotalXp,
        level: Math.floor(newTotalXp / 500) + 1,
      };
    });

    setXpNotification({
      amount: finalAmount,
      message,
      bonusTag,
    });
  };

  const weightUnit: WeightUnit = profile.weightUnit || 'kg';

  /** Personalizes weights and snaps loads for every generated session. */
  const prepareSession = (
    session: WorkoutSession,
    opts: {
      isProgramPlan?: boolean;
      history?: WorkoutSession[];
      overrides?: Partial<Pick<UserProfile, 'experienceLevel' | 'gender' | 'weightUnit'>> & { bodyweightKg?: number };
    } = {}
  ): WorkoutSession =>
    prepareSessionForAthlete(session, {
      history: opts.history ?? workouts,
      bodyweightKg: opts.overrides?.bodyweightKg ?? bodyweightEmaKg,
      readinessState: readiness.state,
      gender: opts.overrides?.gender ?? profile.gender,
      experienceLevel: opts.overrides?.experienceLevel ?? profile.experienceLevel,
      unit: opts.overrides?.weightUnit || weightUnit,
      isProgramPlan: opts.isProgramPlan,
    });

  // Saved workouts from older versions can hold loaded exercises with no weight (e.g. after a swap).
  // Fill only those exercises once on open, so already-personalized weights aren't scaled twice.
  const repairedWeightlessRef = useRef(false);
  useEffect(() => {
    if (repairedWeightlessRef.current) return;
    repairedWeightlessRef.current = true;
    if (activeWorkout.completed) return;
    const isWeightless = (ex: ExerciseSession) =>
      !(ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic) &&
      !ex.sets.some((s) => s.completed) &&
      ex.sets.filter((s) => !s.isWarmup).every((s) => (s.targetWeightKg ?? 0) <= 0);
    const weightless = activeWorkout.exercises.filter(isWeightless);
    if (weightless.length === 0) return;
    const repaired = prepareSession(
      { ...activeWorkout, exercises: weightless },
      { isProgramPlan: Boolean(activeWorkout.programWorkoutNumber) }
    );
    const byId = new Map(repaired.exercises.map((ex) => [ex.id, ex]));
    setActiveWorkout((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) => (isWeightless(ex) && byId.has(ex.id) ? byId.get(ex.id)! : ex)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler: a set was ticked off. Starts the labelled rest timer and awards progress XP once per set.
  const handleSetCompleted = (
    _exerciseName: string,
    _setNumber: number,
    completedSet?: WorkoutSet,
    exercise?: ExerciseSession
  ) => {
    if (!exercise || !completedSet) return;

    const rest = planRestAfterSet(activeWorkout, exercise, completedSet.id);
    if (rest.seconds === 0) {
      setRestTimerOpen(false);
    } else {
      setRestTimerSeconds(rest.seconds);
      setRestTimerContext(rest.context);
      setRestTimerKey((k) => k + 1);
      setRestTimerOpen(true);
    }

    const award = evaluateSetProgressAward(activeWorkout, workouts, exercise, completedSet);
    if (award) {
      setActiveWorkout((prev) => ({
        ...prev,
        xpAwardedSetIds: [...(prev.xpAwardedSetIds || []), completedSet.id],
      }));
      addXp(award.amount, award.description, award.bonusTag);
    }
  };

  // Handler: Switch Split Day dynamically (No illegitimate XP)
  const handleSwitchSplitDay = (split: SplitDayType, navigateToTrain = false) => {
    const smartSession = generateSmartWorkoutSession(
      split,
      workouts,
      exercises,
      readiness.state,
      profile.mesocycleWeek || 1,
      profile.activeLocation || 'gym',
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
      profile.goalPhase,
      bodyweightEmaKg,
      profile.scheduledWeekLocations
    );
    setActiveWorkout(prepareSession(smartSession));
    if (navigateToTrain) {
      setActiveTab('train');
    }
  };

  // Handler: Apply AI Coach mutations (Equipment, Scheduled Location, Split, Workout updates)
  const handleApplyAssistantAction = (
    updatedProfile?: Partial<UserProfile>,
    updatedWorkout?: WorkoutSession
  ) => {
    if (updatedProfile) {
      setProfile((prev) => ({ ...prev, ...updatedProfile }));
    }
    if (updatedWorkout) {
      setActiveWorkout(updatedWorkout);
    }
  };

  // Handler: Switch Training Location ('gym' | 'home' | 'travel') in 1 tap (No illegitimate XP)
  const handleSwitchTrainingLocation = (location: TrainingLocation) => {
    setProfile((prev) => ({
      ...prev,
      activeLocation: location,
    }));

    const adapted = adaptWorkoutSessionToLocation(
      activeWorkout,
      location,
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
      exercises,
      workouts,
      readiness.state,
      bodyweightEmaKg
    );
    setActiveWorkout(adapted);
  };

  // Handler: Complete Onboarding / Goals & Equipment Setup (No illegitimate XP)
  const handleCompleteOnboarding = (setup: {
    goalPhase: GoalPhase;
    programType: ProgramSplitType;
    activeLocation: TrainingLocation;
    availableLocations: TrainingLocation[];
    homeEquipment: HomeEquipmentTag[];
    athlete?: {
      gender: UserProfile['gender'];
      experienceLevel: NonNullable<UserProfile['experienceLevel']>;
      weightUnit: NonNullable<UserProfile['weightUnit']>;
      bodyweightKg?: number;
    };
  }) => {
    const athlete = setup.athlete;
    const startingBodyweight = athlete?.bodyweightKg && athlete.bodyweightKg > 0 ? athlete.bodyweightKg : undefined;

    setProfile((prev) => ({
      ...prev,
      goalPhase: setup.goalPhase,
      programType: setup.programType,
      activeLocation: setup.activeLocation,
      availableLocations: setup.availableLocations,
      homeEquipment: setup.homeEquipment,
      onboardingCompleted: true,
      ...(athlete
        ? {
            gender: athlete.gender,
            experienceLevel: athlete.experienceLevel,
            weightUnit: athlete.weightUnit,
          }
        : {}),
      mesocycleWeek: prev.onboardingCompleted ? prev.mesocycleWeek : 1,
    }));

    // Record the starting bodyweight so DOTS and calibration use the real number from day one.
    if (startingBodyweight) {
      const todayStr = localDateString();
      setBiometrics((prev) => {
        const idx = prev.findIndex((b) => b.date === todayStr);
        if (idx >= 0) {
          return prev.map((b, i) => (i === idx ? { ...b, bodyweightKg: startingBodyweight } : b));
        }
        return [
          ...prev,
          {
            date: todayStr,
            bodyweightKg: startingBodyweight,
            hrvRmssd: 0,
            restingHr: 0,
            sleepHours: 0,
            steps: 0,
            activeZoneMinutes: 0,
            isManualEntry: true,
          } as BiometricLog,
        ];
      });
    }

    // Re-running setup (e.g. to edit equipment) must not throw away a workout in progress.
    const hasProgress = activeWorkout.exercises.some((ex) => ex.sets.some((st) => st.completed));
    if (profile.onboardingCompleted && hasProgress) {
      setActiveTab('train');
      return;
    }

    // Quickest path to value: Generate Day 1 workout for the chosen split and take user to Workout tab
    const starterSplit = getFirstSplitDayForProgram(setup.programType);
    const isPlan = setup.programType === 'muscle_building_6wk';
    const starterSession = isPlan
      ? generate6WeekMuscleBuildingWorkout(getNextProgramWorkoutNumber(workouts), bodyweightEmaKg)
      : generateSmartWorkoutSession(
          starterSplit,
          workouts,
          exercises,
          readiness.state,
          profile.onboardingCompleted ? profile.mesocycleWeek || 1 : 1,
          setup.activeLocation,
          setup.homeEquipment,
          setup.goalPhase,
          startingBodyweight ?? bodyweightEmaKg
        );
    setActiveWorkout(
      prepareSession(starterSession, {
        isProgramPlan: isPlan,
        overrides: athlete
          ? {
              experienceLevel: athlete.experienceLevel,
              gender: athlete.gender,
              weightUnit: athlete.weightUnit,
              bodyweightKg: startingBodyweight,
            }
          : undefined,
      })
    );
    setActiveTab('train');
  };

  // Handler: Launch specific workout number from 6-Week Muscle Building Plan
  const handleLaunchWorkoutNumber = (workoutNum: number) => {
    const session = prepareSession(generate6WeekMuscleBuildingWorkout(workoutNum, bodyweightEmaKg), {
      isProgramPlan: true,
    });
    setActiveWorkout(session);
    setActiveTab('train');
    setXpNotification({
      amount: 0,
      message: `Loaded Workout #${workoutNum} (${session.name}). Ready to train!`,
      bonusTag: 'Workout Loaded',
    });
  };

  // Handler: Switch Program Type (Standard Splits or 6-Week Muscle Building Plan)
  const handleUpdateProgram = (newProgramType: ProgramSplitType) => {
    setProfile((prev) => ({ ...prev, programType: newProgramType }));
    if (newProgramType === 'muscle_building_6wk') {
      const session = generate6WeekMuscleBuildingWorkout(getNextProgramWorkoutNumber(workouts), bodyweightEmaKg);
      setActiveWorkout(prepareSession(session, { isProgramPlan: true }));
    } else {
      const starterSplit = getFirstSplitDayForProgram(newProgramType);
      const session = generateSmartWorkoutSession(
        starterSplit,
        workouts,
        exercises,
        readiness.state,
        profile.mesocycleWeek || 1,
        profile.activeLocation || 'gym',
        profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
        profile.goalPhase,
        bodyweightEmaKg,
        profile.scheduledWeekLocations
      );
      setActiveWorkout(prepareSession(session));
    }
  };

  // Handler: Change Mesocycle Week (1 to 6) (No illegitimate XP)
  const handleSelectMesocycleWeek = (week: number) => {
    setProfile((prev) => ({ ...prev, mesocycleWeek: week }));
    const currentSplit = (activeWorkout.splitDay as SplitDayType) || 'Push';
    const recalibrated = generateSmartWorkoutSession(
      currentSplit,
      workouts,
      exercises,
      readiness.state,
      week,
      profile.activeLocation || 'gym',
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
      profile.goalPhase,
      bodyweightEmaKg,
      profile.scheduledWeekLocations
    );
    setActiveWorkout(prepareSession(recalibrated));
  };

  // Handler: Complete the workout, advance the queue, award XP (see services/workoutCompletion.ts)
  const handleFinishWorkout = (whoopTelemetry?: WhoopWorkoutStrainSummary) => {
    const result = completeWorkout({
      activeWorkout,
      history: workouts,
      profile,
      readiness,
      bodyweightKg: bodyweightEmaKg,
      whoopTelemetry,
    });
    const { completedSession, nextHistory, nextMesocycleWeek } = result;
    const todayStr = completedSession.date;

    if (whoopTelemetry) {
      setBiometrics((prev) => {
        const idx = prev.findIndex((b) => b.date === todayStr);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          workoutStrain: whoopTelemetry.workoutStrain ?? updated[idx].workoutStrain,
          strain: whoopTelemetry.dayStrain ?? updated[idx].strain,
          avgWorkoutHr: whoopTelemetry.avgHeartRate ?? updated[idx].avgWorkoutHr,
          maxWorkoutHr: whoopTelemetry.maxHeartRate ?? updated[idx].maxWorkoutHr,
          recoveryScore: whoopTelemetry.recoveryScore ?? updated[idx].recoveryScore,
        };
        return updated;
      });
    }

    setWorkouts(nextHistory);
    setProfile((prev) => ({
      ...prev,
      streakDays: prev.lastWorkoutDate === todayStr ? prev.streakDays : prev.streakDays + 1,
      lastWorkoutDate: todayStr,
      mesocycleWeek: nextMesocycleWeek,
    }));

    const nextSession =
      profile.programType === 'muscle_building_6wk'
        ? prepareSession(
            generate6WeekMuscleBuildingWorkout(getNextProgramWorkoutNumber(nextHistory), bodyweightEmaKg),
            { isProgramPlan: true, history: nextHistory }
          )
        : prepareSession(
            generateSmartWorkoutSession(
              getNextSplitDay(activeWorkout.splitDay, profile.programType),
              nextHistory,
              exercises,
              readiness.state,
              nextMesocycleWeek,
              profile.activeLocation || 'gym',
              profile.homeEquipment || [],
              profile.goalPhase,
              bodyweightEmaKg,
              profile.scheduledWeekLocations
            ),
            { history: nextHistory }
          );
    setActiveWorkout(nextSession);
    setRestTimerOpen(false);
    setActiveTab('train');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });

    // addXp uses functional updates, so these never overwrite each other.
    const { completionAward, strengthAdvanceAward, milestoneAward } = result;
    addXp(completionAward.amount, completionAward.description, completionAward.bonusTag);
    if (strengthAdvanceAward) {
      setTimeout(() => addXp(strengthAdvanceAward.amount, strengthAdvanceAward.description, strengthAdvanceAward.bonusTag), 1500);
    }
    if (milestoneAward) {
      setTimeout(() => addXp(milestoneAward.amount, milestoneAward.description, milestoneAward.bonusTag), 3000);
    }
  };

  // Handler: today's weight and body measurements (No illegitimate XP)
  const handleSaveMeasurements = (entry: MeasurementEntry) => {
    const { heightCm, ...measures } = entry;
    if (heightCm) setProfile((prev) => ({ ...prev, measuredHeightCm: heightCm, heightCm }));
    const values = Object.fromEntries(Object.entries(measures).filter(([, v]) => typeof v === 'number' && v > 0));
    if (Object.keys(values).length === 0) return;
    const todayStr = localDateString();
    setBiometrics((prev) => {
      const existingIndex = prev.findIndex((b) => b.date === todayStr);
      if (existingIndex >= 0) {
        return prev.map((b, idx) => (idx === existingIndex ? { ...b, ...values } : b));
      }
      // A new day's entry must not copy yesterday's recovery numbers.
      return [
        ...prev,
        {
          date: todayStr,
          bodyweightKg: 0,
          hrvRmssd: 0,
          restingHr: 0,
          sleepHours: 0,
          steps: 0,
          activeZoneMinutes: 0,
          ...values,
        },
      ];
    });
  };

  // Handler: Reset demo seed data
  const handleResetData = () => {
    const reset = resetAllToSeedData();
    setProfile(reset.profile);
    setBiometrics(reset.biometrics);
    setWorkouts(reset.workouts);
    setActiveWorkout(reset.activeWorkout);
    setExercises(reset.exercises);
    setXpNotification({
      amount: 0,
      message: 'Restored 6-week sample workout and biometric history.',
      bonusTag: 'Demo Loaded',
    });
  };

  // Handler: Export JSON Backup (Google Play Data Portability - No illegitimate XP)
  const handleExportData = () => {
    const json = exportAllUserDataJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const todayStr = localDateString();
    a.href = url;
    a.download = `headstrong-backup-${todayStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handler: Import JSON Backup (No illegitimate XP)
  const handleImportData = (rawJson: string) => {
    try {
      const restored = importUserDataJSON(rawJson);
      setProfile(restored.profile);
      setBiometrics(restored.biometrics);
      setWorkouts(restored.workouts);
      setActiveWorkout(restored.activeWorkout);
      setExercises(restored.exercises);
      setXpNotification({
        amount: 0,
        message: 'Workout and biometric backup restored successfully!',
        bonusTag: 'Restored',
      });
    } catch (e) {
      setXpNotification({
        amount: 0,
        message: 'Could not restore backup: invalid JSON file.',
        bonusTag: 'Import Error',
      });
    }
  };

  // Handler: Permanently Delete All User Data (Google Play User Data Policy Compliance)
  const handleDeleteAllData = () => {
    const wiped = permanentlyEraseAllUserData();
    setProfile(wiped.profile);
    setBiometrics(wiped.biometrics);
    setWorkouts(wiped.workouts);
    setActiveWorkout(wiped.activeWorkout);
    setExercises(wiped.exercises);
    setXpNotification({
      amount: 0,
      message: 'All personal workout and biometric data permanently erased from device.',
      bonusTag: 'Data Erased',
    });
  };

  // Handler: Trigger Native PWA Install Prompt
  const handleTriggerInstallPwa = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
  };

  // Handler: Shift Workout Date (No illegitimate XP)
  const handleShiftWorkout = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = localDateString(tomorrow);

    setActiveWorkout((prev) => ({
      ...prev,
      date: tomorrowStr,
    }));
  };

  return (
    <UnitsProvider unit={weightUnit}>
    <div className="min-h-screen text-slate-100 flex flex-col font-sans">
      {/* App Header */}
      <Header
        profile={profile}
        readinessState={readiness.state}
        onOpenWatchSync={() => setWatchModalOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Main Mobile Container */}
      <main className="flex-1 max-w-md mx-auto w-full px-3.5 pt-3">
        <Suspense fallback={<div className="biometric-card p-6 text-xs text-slate-400" role="status">Loading…</div>}>
        <ErrorBoundary key={activeTab} area={activeTab === 'train' ? 'Workout' : activeTab === 'analytics' ? 'Progress' : activeTab === 'program' ? 'Program' : 'Athlete'}>
        {activeTab === 'train' && (
          <TrainTab
            activeWorkout={activeWorkout}
            workouts={workouts}
            readiness={readiness}
            latestBiometrics={latestBiometrics}
            biometrics={biometrics}
            bodyweightEmaKg={bodyweightEmaKg}
            profile={profile}
            exerciseCatalog={exercises}
            onUpdateWorkout={setActiveWorkout}
            onSetCompleted={handleSetCompleted}
            onFinishWorkout={handleFinishWorkout}
            onShiftWorkout={handleShiftWorkout}
            onSwitchLocation={handleSwitchTrainingLocation}
            onOpenWatchSync={() => setWatchModalOpen(true)}
            onOpenProgram={() => {
              setActiveTab('program');
              window.scrollTo({ top: 0 });
            }}
            onSwitchSplitDay={
              profile.programType === 'muscle_building_6wk'
                ? undefined
                : (split) => handleSwitchSplitDay(split)
            }
          />
        )}

        {activeTab === 'character' && (
          <CharacterTab
            profile={profile}
            pillarBestE1rm={pillarBestE1rm}
            big3BestE1rm={calculateBestPillarE1rms(workouts, bodyweightEmaKg, { loadedLiftsOnly: true })}
            bodyweightEmaKg={bodyweightEmaKg}
            latestBiometrics={latestBiometrics}
            weeklyVolume={weeklyVolume}
            onUpdateProfile={(up) => setProfile((p) => ({ ...p, ...up }))}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            workouts={workouts}
            biometrics={biometrics}
            profile={profile}
            bodyweightEmaKg={bodyweightEmaKg}
            exerciseCatalog={exercises}
            weeklyVolume={weeklyVolume}
            onSaveMeasurements={handleSaveMeasurements}
          />
        )}

        {activeTab === 'program' && (
          <ProgramTab
            profile={profile}
            latestBiometrics={latestBiometrics}
            exerciseCatalog={exercises}
            activeSplitDay={activeWorkout.splitDay}
            canInstallPwa={Boolean(deferredInstallPrompt)}
            onTriggerInstallPwa={handleTriggerInstallPwa}
            onUpdateProfile={(up) => setProfile((p) => ({ ...p, ...up }))}
            onOpenWatchSync={() => setWatchModalOpen(true)}
            onOpenAuth={() => setAuthModalOpen(true)}
            onSelectMesocycleWeek={handleSelectMesocycleWeek}
            onUpdateGoalPhase={(phase: GoalPhase) => {
              setProfile((p) => ({ ...p, goalPhase: phase }));
              const currentSplit = (activeWorkout.splitDay as SplitDayType) || 'Push';
              const recalibrated = generateSmartWorkoutSession(
                currentSplit,
                workouts,
                exercises,
                readiness.state,
                profile.mesocycleWeek || 1,
                profile.activeLocation || 'gym',
                profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
                phase,
                bodyweightEmaKg,
                profile.scheduledWeekLocations
              );
              setActiveWorkout(prepareSession(recalibrated));
            }}
            onLaunchSplitDay={(sp) => handleSwitchSplitDay(sp, true)}
            onLaunchWorkoutNumber={handleLaunchWorkoutNumber}
            onUpdateProgram={handleUpdateProgram}
            onAddCustomExercise={(newEx) => setExercises((prev) => [...prev, newEx])}
            onResetData={handleResetData}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onDeleteAllData={handleDeleteAllData}
            onOpenOnboarding={() => {
              setOnboardingInitialStep(4);
              setOnboardingOpen(true);
            }}
            activeWorkoutName={activeWorkout.name}
            activeProgramWorkoutNumber={activeWorkout.programWorkoutNumber}
            onBackToWorkout={() => {
              setActiveTab('train');
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        </ErrorBoundary>
        </Suspense>
      </main>

      {/* AI Assistant Conversational Chat Modal */}
      {aiCoachOpen && (
        <Suspense fallback={null}>
        <AICoachChatModal
          profile={profile}
          activeWorkout={activeWorkout}
          workouts={workouts}
          biometrics={biometrics}
          exerciseCatalog={exercises}
          bodyweightEmaKg={bodyweightEmaKg}
          readinessState={readiness.state}
          weeklyVolume={weeklyVolume}
          onClose={() => setAiCoachOpen(false)}
          onApplyAction={handleApplyAssistantAction}
          onViewAllEquipment={() => {
            setAiCoachOpen(false);
            setOnboardingInitialStep(4);
            setOnboardingOpen(true);
          }}
        />
        </Suspense>
      )}

      {/* Onboarding & Equipment Context Setup Modal */}
      {onboardingOpen && (
        <OnboardingModal
          profile={profile}
          initialStep={onboardingInitialStep}
          onCompleteOnboarding={handleCompleteOnboarding}
          onClose={() => {
            setOnboardingOpen(false);
            setOnboardingInitialStep(1);
          }}
          onExploreDemo={() => {
            const reset = resetAllToSeedData();
            setProfile(reset.profile);
            setBiometrics(reset.biometrics);
            setWorkouts(reset.workouts);
            setActiveWorkout(reset.activeWorkout);
            setExercises(reset.exercises);
            setOnboardingOpen(false);
            setXpNotification({
              amount: 0,
              message: 'Sample 6-week workout and biometric history loaded.',
              bonusTag: 'Demo Mode',
            });
          }}
        />
      )}

      {/* Floating rest timer, labelled with the exercise and next set (hidden behind the coach chat) */}
      {restTimerOpen && !aiCoachOpen && (
        <RestTimerModal
          key={`rest-${restTimerKey}`}
          initialSeconds={restTimerSeconds}
          context={restTimerContext}
          onDismiss={() => setRestTimerOpen(false)}
        />
      )}

      {/* Wearable & Recovery Sync Dialog Modal */}
      {watchModalOpen && (
        <WatchSyncModal
          profile={profile}
          latestBiometrics={latestBiometrics}
          onSyncCompleted={(log, provider) => {
            handleSyncCompleted(log, provider);
            setWatchModalOpen(false);
          }}
          onUpdateProfile={(up) => setProfile((prev) => ({ ...prev, ...up }))}
          onClose={() => setWatchModalOpen(false)}
          isModal={true}
        />
      )}

      {/* Google Sign In & Account Modal */}
      <GoogleAuthModal
        currentUser={authUser}
        profile={profile}
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        onSignOut={handleSignOut}
      />

      {/* XP Toast Notification */}
      {xpNotification && (
        <XPNotification
          amount={xpNotification.amount}
          message={xpNotification.message}
          bonusTag={xpNotification.bonusTag}
          onClose={() => setXpNotification(null)}
        />
      )}

      {/* Bottom 5-Tab Navigation with Dedicated Chat */}
      <NavigationBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'chat') {
            setAiCoachOpen((prev) => !prev);
          } else {
            setActiveTab(tab);
            setAiCoachOpen(false);
          }
        }}
        isChatOpen={aiCoachOpen}
        onOpenAICoach={() => setAiCoachOpen((prev) => !prev)}
      />
    </div>
    </UnitsProvider>
  );
};

export default App;
