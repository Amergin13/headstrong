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
import { snapLoadKg } from './utils/units';
import { computeTrainingStreak } from './engine/recovery';
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
  loadActivities,
  loadProfile,
  loadWorkouts,
  permanentlyEraseAllUserData,
  resetAllToSeedData,
  saveActiveWorkout,
  saveAuthUser,
  saveBiometrics,
  SAVE_FAILED_EVENT,
  requestPersistentStorage,
  saveExercises,
  saveActivities,
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
  generatePlanWorkout,
  getNextProgramWorkoutNumber,
  getSessionPlanId,
} from './engine/muscleBuildingProgram';
import { isPlanProgram, resolveActivePlan } from './engine/trainingPlans';
import { ActivityLog, activeDayDates } from './engine/activeDays';
import { useActivitySync } from './hooks/useActivitySync';
import { LogActivityModal } from './components/activity/LogActivityModal';
import { ActivityConnectionsModal } from './components/activity/ActivityConnectionsModal';
import { startStravaConnect } from './services/activitySources';
import { requestHealthConnectPermission } from './services/healthConnectBridge';
import { prepareSessionForAthlete } from './services/sessionPreparation';
import { completeWorkout } from './services/workoutCompletion';
import { evaluateSetPersonalBest, planRestAfterSet } from './services/setCompletion';
import { Milestone } from './engine/milestones';
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
import { Toast } from './components/common/Toast';
import { TrainTab } from './components/train/TrainTab';
import { WatchSyncModal } from './components/program/WatchSyncModal';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { GoogleAuthModal } from './components/auth/GoogleAuthModal';
import { localDateString } from './utils/date';

// Secondary tabs and the coach load on demand, keeping the first download small.
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
  // Active days (rides, runs, walks, classes), kept apart from lifting workouts.
  const [activities, setActivities] = usePersistedState<ActivityLog[]>(loadActivities, saveActivities);

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
  // Bumped by the "Log Weight" home-screen shortcut; the Progress tab opens its weigh-in form.
  const [logWeightRequest, setLogWeightRequest] = useState(0);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [activityAppsOpen, setActivityAppsOpen] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<1 | 2 | 3>(1);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [toast, setToast] = useState<{ title?: string; message: string; tag?: string } | null>(null);

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
    setToast({ message: `Welcome, ${user.name || 'Athlete'}! Account connected.`,
      tag: 'Google Account',
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
    setToast({ message: 'Signed out. Your workout history remains saved locally.',
      tag: 'Account',
    });
  };

  const notify = (message: string, tag: string) => setToast({ message, tag });

  const { handleSyncCompleted, completeWearableConnection } = useWearableSync({
    profile,
    setProfile,
    workouts,
    setWorkouts,
    setBiometrics,
    notify,
  });

  const activitySync = useActivitySync({ profile, setProfile, activities, setActivities, workouts, notify });
  const activeDates = activeDayDates(activities);

  useLaunchLinks({
    onOpenTab: (tab) => setActiveTab(tab),
    onOpenCoach: () => setAiCoachOpen(true),
    onOpenWatchSync: () => setWatchModalOpen(true),
    onOpenLogWeight: () => setLogWeightRequest((n) => n + 1),
    onOpenAuth: () => setAuthModalOpen(true),
    onAuthSuccess: handleAuthSuccess,
    onWearableOAuthCode: (code, provider) => {
      completeWearableConnection(code, provider);
    },
    onStravaOAuthCode: (code, scope) => {
      activitySync.completeStravaConnection(code, scope);
    },
  });

  // Derived calculations
  const bodyweightEmaKg = getLatestBodyweightEma(biometrics, 80.0);
  // The 80 kg fallback only seeds internal estimates (starting loads); it is never shown as the athlete's weight.
  const hasBodyweight = biometrics.some((b) => b.bodyweightKg > 0);
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
  // Everyone is on a 6-week plan: the starter plan for their goal, or the muscle plan on the owner's account.
  const activePlan = resolveActivePlan(profile);

  const pillarBestE1rm = calculateBestPillarE1rms(workouts, bodyweightEmaKg);
  // Saved workouts only, so every page (cards, Program, Progress, Athlete, knowledge graph) shows the same count.
  const weeklyVolume = calculateWeeklyMuscleVolume(workouts, exercises);

  /** Celebrates a personal best, strength level up or finished week. */
  const celebrate = (m: Milestone) => setToast({ title: m.title, message: m.description, tag: m.tag });

  const weightUnit: WeightUnit = profile.weightUnit || 'kg';

  /** Personalizes weights and snaps loads for every generated session. */
  const prepareSession = (
    session: WorkoutSession,
    opts: {
      isProgramPlan?: boolean;
      history?: WorkoutSession[];
      overrides?: Partial<Pick<UserProfile, 'experienceLevel' | 'gender' | 'weightUnit'>> & { bodyweightKg?: number };
      /** Plan workouts are written for the gym; away from it they get the same movements with the gear at hand. */
      location?: TrainingLocation;
      homeEquipment?: HomeEquipmentTag[];
    } = {}
  ): WorkoutSession => {
    const location = opts.location ?? profile.activeLocation ?? 'gym';
    // Same swap as the one-tap place switch on the Workout tab, before weights are personalized.
    const placed =
      opts.isProgramPlan && location !== 'gym'
        ? adaptWorkoutSessionToLocation(
            session,
            location,
            opts.homeEquipment ?? profile.homeEquipment ?? [],
            exercises,
            opts.history ?? workouts,
            readiness.state,
            opts.overrides?.bodyweightKg ?? bodyweightEmaKg
          )
        : session;
    return prepareSessionForAthlete(placed, {
      history: opts.history ?? workouts,
      bodyweightKg: opts.overrides?.bodyweightKg ?? bodyweightEmaKg,
      readinessState: readiness.state,
      gender: opts.overrides?.gender ?? profile.gender,
      experienceLevel: opts.overrides?.experienceLevel ?? profile.experienceLevel,
      unit: opts.overrides?.weightUnit || weightUnit,
      isProgramPlan: opts.isProgramPlan,
    });
  };

  /** Gives loaded exercises that have no weight yet (e.g. swapped in for a bodyweight move) a starting weight. */
  const isWeightless = (ex: ExerciseSession) =>
    !(ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic) &&
    !ex.sets.some((s) => s.completed) &&
    ex.sets.filter((s) => !s.isWarmup).every((s) => (s.targetWeightKg ?? 0) <= 0);
  const fillWeightless = (session: WorkoutSession): WorkoutSession => {
    const weightless = session.exercises.filter(isWeightless);
    if (weightless.length === 0) return session;
    const filled = prepareSession(
      { ...session, exercises: weightless },
      // Only fills in weights: 'gym' keeps the exercises exactly as they are.
      { isProgramPlan: Boolean(session.programWorkoutNumber), location: 'gym' }
    );
    const byId = new Map(filled.exercises.map((ex) => [ex.id, ex]));
    return { ...session, exercises: session.exercises.map((ex) => (isWeightless(ex) && byId.get(ex.id)) || ex) };
  };

  // Saved workouts from older versions can hold loaded exercises with no weight (e.g. after a swap).
  // Fill only those exercises once on open, so already-personalized weights aren't scaled twice.
  const repairedWeightlessRef = useRef(false);
  useEffect(() => {
    if (repairedWeightlessRef.current) return;
    repairedWeightlessRef.current = true;
    if (activeWorkout.completed || !activeWorkout.exercises.some(isWeightless)) return;
    setActiveWorkout((prev) => fillWeightless(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching kg/lb re-plans an unstarted session so its weights snap to real plates and dumbbells
  // in the new unit (not 26.5 lb converted from 12 kg).
  const unitRef = useRef(profile.weightUnit);
  useEffect(() => {
    if (unitRef.current === profile.weightUnit) return;
    unitRef.current = profile.weightUnit;
    if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
    const unit = profile.weightUnit || 'kg';
    setActiveWorkout((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((st) =>
          st.targetWeightKg > 0
            ? { ...st, targetWeightKg: snapLoadKg(st.targetWeightKg, unit, ex.equipment), actualWeightKg: snapLoadKg(st.targetWeightKg, unit, ex.equipment) }
            : st
        ),
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.weightUnit]);

  // If the phone's storage is full, say so instead of losing data silently.
  useEffect(() => {
    const onSaveFailed = () =>
      setToast({
        title: "Couldn't save",
        message: "This phone's storage is full. Export a backup in Program → Settings, then free up some space.",
        tag: 'Storage full',
      });
    window.addEventListener(SAVE_FAILED_EVENT, onSaveFailed);
    return () => window.removeEventListener(SAVE_FAILED_EVENT, onSaveFailed);
  }, []);

  // Once there's history worth keeping, ask the browser not to clear it when space is low or the
  // app hasn't been opened for a while.
  const hasHistory = workouts.length > 0 || biometrics.length > 0;
  useEffect(() => {
    if (hasHistory) void requestPersistentStorage();
  }, [hasHistory]);

  // The streak always follows the saved workouts and active days (after imports, demo loads,
  // deletions or a long break).
  const activeDatesKey = activeDates.join(',');
  useEffect(() => {
    const streak = computeTrainingStreak(workouts, Date.now(), activeDates);
    if (streak !== profile.streakDays) setProfile((p) => ({ ...p, streakDays: streak }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts, activeDatesKey]);

  // On the 6-week plan, today's session must be the plan's next workout (with the athlete's own
  // weights). A fresh install or cleared session otherwise starts on a generic split day.
  // An unstarted session that isn't the plan's next workout is out of date (e.g. from an older save),
  // so the Workout page always matches the Program page.
  useEffect(() => {
    if (!isPlanProgram(profile.programType)) return;
    if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
    const next = getNextProgramWorkoutNumber(workouts, activePlan);
    if (activeWorkout.programWorkoutNumber === next && getSessionPlanId(activeWorkout) === activePlan.id) return;
    setActiveWorkout(prepareSession(generatePlanWorkout(activePlan, next), { isProgramPlan: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.programType, activePlan.id, workouts]);

  // Handler: a set was ticked off. Starts the labelled rest timer and celebrates a personal best once per set.
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

    const best = evaluateSetPersonalBest(activeWorkout, workouts, exercise, completedSet);
    if (best) {
      setActiveWorkout((prev) => ({
        ...prev,
        celebratedSetIds: [...(prev.celebratedSetIds || []), completedSet.id],
      }));
      celebrate(best);
    }
  };

  // Handler: Switch Split Day dynamically
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

  // Handler: Switch Training Location ('gym' | 'home' | 'travel') in 1 tap
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
    setActiveWorkout(fillWeightless(adapted));
  };

  // Handler: Complete Onboarding / Goals & Equipment Setup
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
    const isPlan = isPlanProgram(setup.programType);
    const setupPlan = resolveActivePlan({ programType: setup.programType, goalPhase: setup.goalPhase, email: profile.email });
    const starterSession = isPlan
      ? generatePlanWorkout(setupPlan, getNextProgramWorkoutNumber(workouts, setupPlan))
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
        location: setup.activeLocation,
        homeEquipment: setup.homeEquipment,
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
    const session = prepareSession(generatePlanWorkout(activePlan, workoutNum), {
      isProgramPlan: true,
    });
    setActiveWorkout(session);
    setActiveTab('train');
    setToast({ message: `Loaded Workout #${workoutNum} (${session.name}). Ready to train!`,
      tag: 'Workout Loaded',
    });
  };

  // Handler: Switch Program Type (Standard Splits or 6-Week Muscle Building Plan)
  const handleUpdateProgram = (newProgramType: ProgramSplitType) => {
    setProfile((prev) => ({ ...prev, programType: newProgramType }));
    if (isPlanProgram(newProgramType)) {
      // A started session is kept; the plan switch applies from the next workout.
      if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
      const plan = resolveActivePlan({ ...profile, programType: newProgramType });
      const session = generatePlanWorkout(plan, getNextProgramWorkoutNumber(workouts, plan));
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

  // Handler: Change Mesocycle Week (1 to 6)
  const handleSelectMesocycleWeek = (week: number) => {
    // On a 6-week plan the week follows the workout number, and a started session is kept.
    if (isPlanProgram(profile.programType)) return;
    setProfile((prev) => ({ ...prev, mesocycleWeek: week }));
    if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
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

  // Handler: Complete the workout and advance the queue (see services/workoutCompletion.ts)
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
      streakDays: computeTrainingStreak(nextHistory, Date.now(), activeDates),
      lastWorkoutDate: todayStr,
      mesocycleWeek: nextMesocycleWeek,
    }));

    const nextSession =
      isPlanProgram(profile.programType)
        ? prepareSession(
            generatePlanWorkout(activePlan, getNextProgramWorkoutNumber(nextHistory, activePlan)),
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

    const { strengthMilestone, weekMilestone } = result;
    if (strengthMilestone) celebrate(strengthMilestone);
    if (weekMilestone) setTimeout(() => celebrate(weekMilestone), strengthMilestone ? 2600 : 0);
  };

  // Handler: today's weight and body measurements
  const handleSaveMeasurements = (entry: MeasurementEntry) => {
    if (entry.heightCm) {
      setProfile((prev) => ({ ...prev, measuredHeightCm: entry.heightCm, heightCm: entry.heightCm! }));
    }
    // Asked once on the weight form: these belong to the profile, not to the day's log.
    const { ageYears, sex, ...logFields } = entry;
    if (ageYears) setProfile((prev) => ({ ...prev, age: ageYears, ageEntered: true }));
    if (sex) setProfile((prev) => ({ ...prev, gender: sex, sexEntered: true }));
    const values = Object.fromEntries(Object.entries(logFields).filter(([, v]) => typeof v === 'number' && v > 0));
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
    setToast({ message: 'Restored 6-week sample workout and biometric history.',
      tag: 'Demo Loaded',
    });
  };

  // Handler: Export JSON Backup (Google Play Data Portability)
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

  // Handler: Import JSON Backup
  const handleImportData = (rawJson: string) => {
    try {
      const restored = importUserDataJSON(rawJson);
      setProfile(restored.profile);
      setBiometrics(restored.biometrics);
      setWorkouts(restored.workouts);
      setActiveWorkout(restored.activeWorkout);
      setExercises(restored.exercises);
      setActivities(restored.activities || []);
      setToast({ message: 'Workout and biometric backup restored successfully!',
        tag: 'Restored',
      });
    } catch (e) {
      setToast({ message: 'Could not restore backup: invalid JSON file.',
        tag: 'Import Error',
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
    setActivities([]);
    // Start over like a fresh install, so no unpersonalised template workout is shown.
    setOnboardingInitialStep(1);
    setOnboardingOpen(true);
    setToast({ message: 'All personal workout and biometric data permanently erased from device.',
      tag: 'Data Erased',
    });
  };

  // Handler: Trigger Native PWA Install Prompt
  const handleTriggerInstallPwa = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
  };

  // Handler: Shift Workout Date
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
    <div className="wk min-h-screen text-slate-100 flex flex-col font-sans">
      {/* App Header */}
      <Header
        profile={profile}
        readinessState={readiness.state}
        onOpenWatchSync={() => setWatchModalOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Main Mobile Container */}
      <main className="flex-1 max-w-md mx-auto w-full px-3.5 pt-3">
        <Suspense fallback={<div className="wk-card wk-body" role="status">Loading…</div>}>
        <ErrorBoundary key={activeTab} area={activeTab === 'train' ? 'Workout' : activeTab === 'analytics' ? 'Progress' : activeTab === 'program' ? 'Program' : 'Treise'}>
        {activeTab === 'train' && (
          <TrainTab
            trainingPlan={activePlan}
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
            activities={activities}
            onLogActivity={() => setLogActivityOpen(true)}
            onRemoveActivity={activitySync.removeActivity}
            onOpenActivityApps={() => setActivityAppsOpen(true)}
            onSwitchSplitDay={
              isPlanProgram(profile.programType)
                ? undefined
                : (split) => handleSwitchSplitDay(split)
            }
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            workouts={workouts}
            biometrics={biometrics}
            profile={profile}
            bodyweightEmaKg={bodyweightEmaKg}
            latestBiometrics={latestBiometrics}
            exerciseCatalog={exercises}
            weeklyVolume={weeklyVolume}
            onSaveMeasurements={handleSaveMeasurements}
            openLogWeightRequest={logWeightRequest}
            onLogWeightRequestHandled={() => setLogWeightRequest(0)}
          />
        )}

        {activeTab === 'program' && (
          <ProgramTab
            trainingPlan={activePlan}
            profile={profile}
            workouts={workouts}
            biometrics={biometrics}
            readinessState={readiness.state}
            bodyweightKg={bodyweightEmaKg}
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
              // A session already under way keeps what's been logged.
              if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
              if (isPlanProgram(profile.programType)) {
                // The starter plan's sets and reps follow the goal; the muscle plan's don't change.
                const plan = resolveActivePlan({ ...profile, goalPhase: phase });
                if (plan.id !== 'starter_6wk') return;
                setActiveWorkout(
                  prepareSession(generatePlanWorkout(plan, getNextProgramWorkoutNumber(workouts, plan)), { isProgramPlan: true })
                );
                return;
              }
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
            activities={activities}
            onOpenActivityApps={() => setActivityAppsOpen(true)}
            onLogActivity={() => setLogActivityOpen(true)}
            onOpenOnboarding={() => {
              setOnboardingInitialStep(3);
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

      {logActivityOpen && (
        <LogActivityModal onLog={activitySync.logManualActivity} onClose={() => setLogActivityOpen(false)} />
      )}
      {activityAppsOpen && (
        <ActivityConnectionsModal
          profile={profile}
          hcStatus={activitySync.hcStatus}
          onConnectStrava={startStravaConnect}
          onDisconnectStrava={activitySync.disconnectStrava}
          onSetHealthConnect={(on) => setProfile((p) => ({ ...p, healthConnectActivities: on }))}
          onRequestHealthConnectPermission={requestHealthConnectPermission}
          onOpenWatchSync={() => setWatchModalOpen(true)}
          onClose={() => setActivityAppsOpen(false)}
        />
      )}

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
            setOnboardingInitialStep(3);
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
            setToast({ message: 'Sample 6-week workout and biometric history loaded.',
              tag: 'Demo Mode',
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

      {toast && (
        <Toast
          title={toast.title}
          message={toast.message}
          tag={toast.tag}
          onClose={() => setToast(null)}
        />
      )}

      {/* Bottom 4-tab navigation with dedicated chat */}
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
