import { MAX_CUSTOM_GOALS, STEPS_GOAL_EXERCISE_ID, makeCustomGoal, ownGoalName } from './services/athleteGoals';
import type { CoachPlace } from './services/coachContext';
import {
  CoachIntervention,
  clearPlanProgramOverrides,
  dismissCoachIntervention,
  removeProgramOverride,
} from './services/coachInterventions';
import { applyCoachInterventionToState } from './services/coachTools';
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  AssistantChatMessage,
  BiometricLog,
  CustomPlanId,
  EnvironmentOverlay,
  ExerciseDefinition,
  ExerciseProgressionState,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  LeverageUpgradeNudge,
  ProgramSplitType,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
  AuthUser,
  CoachUndoSnapshot,
  getActiveWearableProvider,
} from './engine/types';
import {
  applyEnvironmentOverlayToSession,
  createOverlayForTrainingLocation,
  overlayToTrainingLocation,
  rebuildIsolatedProgressionStates,
  resolveActiveOverlay,
  updateExerciseProgressionStateDamped,
} from './engine/continuityEngine';
import {
  deleteCustomExerciseFromCatalog,
  deletePastWorkoutFromHistory,
  updateCustomExerciseInCatalog,
  updatePastWorkoutInHistory,
} from './services/workoutHistoryEdits';
import { resetFlashLiteConversation } from './services/geminiFlashLite';
import { resetOnDeviceConversation } from './services/onDeviceModel';
import { calculateDailyReadiness } from './engine/readiness';
import { getLatestBodyweightEma } from './engine/ema';
import { snapLoadKg } from './utils/units';
import { computeTrainingStreak, evaluateSessionRecovery } from './engine/recovery';
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
  DATA_CHANGED_EVENT,
  SAVE_FAILED_EVENT,
  requestPersistentStorage,
  saveExercises,
  saveActivities,
  saveProfile,
  saveWorkouts,
} from './services/storage';
import {
  cacheDriveSessionCredentials,
  clearDriveSessionCredentials,
  computeBackupContentHash,
  deleteEncryptedBackupFromDrive,
  getCachedDriveSessionCredentials,
  requestGoogleDriveBackupToken,
  restoreEncryptedDriveBackup,
  runEncryptedDriveBackup,
} from './services/encryptedBackup';
import {
  CompetitorCsvImportResult,
  mergeImportedWorkouts,
} from './services/competitorCsvImport';
import {
  adaptWorkoutSessionToLocation,
  generateSmartWorkoutSession,
  getFirstSplitDayForProgram,
  getNextSplitDay,
  SplitDayType,
} from './services/workoutGenerator';
import { WhoopWorkoutStrainSummary } from './services/whoopService';
import { clearAiGenerationCaches } from './services/aiGenerationCache';
import { clearKnowledgeGraphCache } from './engine/knowledgeGraph';
import { mergeWhoopWorkoutTelemetryLog } from './services/wearableSyncService';
import {
  generatePlanWorkout,
  getNextProgramWorkoutNumber,
  getSessionPlanId,
} from './engine/muscleBuildingProgram';
import {
  isPlanProgram,
  resolveActivePlan,
  canUseMusclePlan,
  isCustomPlanId,
} from './engine/trainingPlans';
import {
  ParsedProgramImport,
  PHASE_1_BT_SHEET_MARKER,
  applySpreadsheetImportToState,
  ensureOwnerPhase1BtSeeded,
} from './services/spreadsheetProgramImport';
import { ActivityLog, activeDayDates } from './engine/activeDays';
import { useActivitySync } from './hooks/useActivitySync';
import { startStravaConnect } from './services/activitySources';
import { requestHealthConnectPermission } from './services/healthConnectBridge';
import { prepareSessionForAthlete } from './services/sessionPreparation';
import { completeWorkout } from './services/workoutCompletion';
import { evaluateSetPersonalBest, planRestAfterSet } from './services/setCompletion';
import { Milestone } from './engine/milestones';
import { usePersistedState } from './hooks/usePersistedState';
import { useWearableSync } from './hooks/useWearableSync';
import { useLaunchLinks } from './hooks/useLaunchLinks';
import { useDialogKeyboard } from './hooks/useDialogKeyboard';
import { UnitsProvider } from './utils/unitsContext';
import { HeightUnit, resolveHeightUnit, WeightUnit } from './utils/units';
import { RestTimerContext } from './components/common/RestTimerModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/common/Header';
import { NavigationBar, TabId } from './components/common/NavigationBar';
import { RestTimerModal } from './components/common/RestTimerModal';
import { Toast } from './components/common/Toast';
import { TrainTab } from './components/train/TrainTab';
import type {
  OnboardingModalProps,
  OnboardingStep,
} from './components/onboarding/OnboardingModal';
import { mergeDetectedActivities } from './engine/activeDays';
import { loadDismissedActivityIds } from './services/storage';
import { localDateString } from './utils/date';

const ONBOARDING_LOCATION_STEP: OnboardingStep = 6;

// Secondary tabs and heavy modals load on demand, keeping the initial entry bundle lean.
import type { MeasurementEntry } from './components/analytics/WeightLogModal';
const AnalyticsTab = lazy(() => import('./components/analytics/AnalyticsTab').then((m) => ({ default: m.AnalyticsTab })));
const ProgramTab = lazy(() => import('./components/program/ProgramTab').then((m) => ({ default: m.ProgramTab })));
const AICoachChatModal = lazy(() => import('./components/assistant/AICoachChatModal').then((m) => ({ default: m.AICoachChatModal })));
const OnboardingModal = lazy(() => import('./components/onboarding/OnboardingModal').then((m) => ({ default: m.OnboardingModal })));
const GoogleAuthModal = lazy(() => import('./components/auth/GoogleAuthModal').then((m) => ({ default: m.GoogleAuthModal })));
const WatchSyncModal = lazy(() => import('./components/program/WatchSyncModal').then((m) => ({ default: m.WatchSyncModal })));
const ImportProgramModal = lazy(() => import('./components/program/ImportProgramModal').then((m) => ({ default: m.ImportProgramModal })));
const LogActivityModal = lazy(() => import('./components/activity/LogActivityModal').then((m) => ({ default: m.LogActivityModal })));
const ActivityConnectionsModal = lazy(() => import('./components/activity/ActivityConnectionsModal').then((m) => ({ default: m.ActivityConnectionsModal })));
const LocalTestDrawer =
  import.meta.env.VITE_LOCAL_TEST_COPY === 'true'
    ? lazy(() => import('./localTest/LocalTestDrawer').then((m) => ({ default: m.LocalTestDrawer })))
    : null;

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
  const [coachMessages, setCoachMessages] = useState<AssistantChatMessage[]>([]);
  const [coachRevertedIds, setCoachRevertedIds] = useState<Record<string, boolean>>({});
  const [coachLaunchRequest, setCoachLaunchRequest] = useState<{
    prompt?: string;
    place?: CoachPlace;
    nonce: number;
  } | null>(null);
  const resetCoachSession = () => {
    setCoachMessages([]);
    setCoachRevertedIds({});
    setCoachLaunchRequest(null);
    resetOnDeviceConversation();
    resetFlashLiteConversation();
  };
  const openCoach = (place?: CoachPlace, prompt?: string) => {
    setCoachLaunchRequest({ prompt, place, nonce: Date.now() });
    setAiCoachOpen(true);
  };
  const openCoachWithIntervention = (prompt: string, place?: CoachPlace) => {
    openCoach(place, prompt);
  };
  /** What is open on the Progress page (a goal, or one of its screens), for the coach's opening line. */
  const [progressContext, setProgressContext] = useState<Pick<CoachPlace, 'goalId' | 'detail'>>({});
  const [progressDetailRequest, setProgressDetailRequest] = useState<{
    detail?: string;
    goalId?: string;
    nonce: number;
  } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(loadAuthUser);
  const [onboardingOpen, setOnboardingOpen] = useState(!profile.onboardingCompleted);
  // Bumped by the "Log Weight" home-screen shortcut; the Progress tab opens its weigh-in form.
  const [logWeightRequest, setLogWeightRequest] = useState(0);
  const [openInsightsRequest, setOpenInsightsRequest] = useState<{ nonce: number; exerciseId?: string } | null>(null);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [activityAppsOpen, setActivityAppsOpen] = useState(false);
  const [competitorImportOpen, setCompetitorImportOpen] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<OnboardingStep>(1);
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

  const activitySync = useActivitySync({ profile, setProfile, activities, setActivities, setBiometrics, workouts, notify });
  const activeDates = activeDayDates(activities);

  useLaunchLinks({
    onOpenTab: (tab) => setActiveTab(tab),
    onOpenCoach: () => setAiCoachOpen(true),
    onOpenWatchSync: () => setWatchModalOpen(true),
    onOpenLogWeight: () => setLogWeightRequest((n) => n + 1),
    onOpenAuth: () => setAuthModalOpen(true),
    onAuthSuccess: handleAuthSuccess,
    onWearableOAuthFailed: (message) => notify(message, 'Not connected'),
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
  useDialogKeyboard();

  const pillarBestE1rm = calculateBestPillarE1rms(workouts, bodyweightEmaKg);
  // Saved workouts only, so every page (cards, Program, Progress, Athlete, knowledge graph) shows the same count.
  const weeklyVolume = calculateWeeklyMuscleVolume(workouts, exercises);

  /** Celebrates a personal best, strength level up or finished week. */
  const celebrate = (m: Milestone) => setToast({ title: m.title, message: m.description, tag: m.tag });

  const weightUnit: WeightUnit = profile.weightUnit || 'kg';
  const heightUnit: HeightUnit = resolveHeightUnit(profile);

  /** Personalizes weights and snaps loads for every generated session. */
  const prepareSession = (
    session: WorkoutSession,
    opts: {
      isProgramPlan?: boolean;
      history?: WorkoutSession[];
      exerciseCatalog?: ExerciseDefinition[];
      overrides?: Partial<Pick<UserProfile, 'experienceLevel' | 'gender' | 'weightUnit'>> & { bodyweightKg?: number };
      /** Plan workouts are written for the gym; away from it they get the same movements with the gear at hand. */
      location?: TrainingLocation;
      homeEquipment?: HomeEquipmentTag[];
    } = {}
  ): WorkoutSession => {
    const location = opts.location ?? profile.activeLocation ?? 'gym';
    // Same swap as the one-tap place switch on the Workout tab, before weights are personalized.
    // Amber Shield is advisory (opt-in modulation via 1-tap button), so planned progression targets
    // stay intact unless the athlete explicitly opts in.
    const effectiveReadiness = readiness.state === 'Amber Shield' ? 'Normal' : readiness.state;
    const placed =
      opts.isProgramPlan && location !== 'gym'
        ? adaptWorkoutSessionToLocation(
            session,
            location,
            opts.homeEquipment ?? profile.homeEquipment ?? [],
            opts.exerciseCatalog ?? exercises,
            opts.history ?? workouts,
            effectiveReadiness,
            opts.overrides?.bodyweightKg ?? bodyweightEmaKg
          )
        : session;
    const prepared = prepareSessionForAthlete(placed, {
      history: opts.history ?? workouts,
      bodyweightKg: opts.overrides?.bodyweightKg ?? bodyweightEmaKg,
      readinessState: effectiveReadiness,
      gender: opts.overrides?.gender ?? profile.gender,
      experienceLevel: opts.overrides?.experienceLevel ?? profile.experienceLevel,
      unit: opts.overrides?.weightUnit || weightUnit,
      isProgramPlan: opts.isProgramPlan,
    });
    return { ...prepared, readinessState: readiness.state };
  };

  /** Gives loaded exercises that have no weight yet (e.g. swapped in for a bodyweight move) a starting weight, while respecting EFFORT_ONLY machine/cable calibration. */
  const isWeightless = (ex: ExerciseSession) =>
    ex.calibrationSource !== 'EFFORT_ONLY' &&
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
        message: "This phone's storage is full. Export a backup in Profile → Settings, then free up some space.",
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

  // Opt-in automatic encrypted backup: whenever core local data changes and the athlete has an
  // active Google Drive backup session, debounce and upload an AES-256-GCM encrypted snapshot.
  const cloudBackupEnabled = Boolean(profile.cloudBackup?.enabled);
  const lastBackupHashRef = useRef(profile.cloudBackup?.lastBackupHash);
  lastBackupHashRef.current = profile.cloudBackup?.lastBackupHash;
  useEffect(() => {
    if (!cloudBackupEnabled || typeof window === 'undefined') return;
    let timer: number | undefined;
    const scheduleUpload = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const creds = getCachedDriveSessionCredentials();
        if (!creds?.accessToken || !creds.passphrase) return;
        const rawJson = exportAllUserDataJSON();
        const hash = computeBackupContentHash(rawJson);
        if (hash === lastBackupHashRef.current) return;
        try {
          const result = await runEncryptedDriveBackup({
            rawJson,
            passphrase: creds.passphrase,
            accessToken: creds.accessToken,
          });
          setProfile((prev) => ({
            ...prev,
            cloudBackup: {
              enabled: true,
              provider: 'google_drive',
              lastBackedUpAt: result.backedUpAt,
              lastBackupHash: result.contentHash,
              lastRestoredAt: prev.cloudBackup?.lastRestoredAt,
            },
          }));
        } catch (err) {
          console.warn('Automatic encrypted Google Drive backup skipped:', err);
        }
      }, 12_000);
    };
    window.addEventListener(DATA_CHANGED_EVENT, scheduleUpload);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, scheduleUpload);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [cloudBackupEnabled, setProfile]);

  // The streak always follows the saved workouts and active days (after imports, demo loads,
  // deletions or a long break).
  const activeDatesKey = activeDates.join(',');
  useEffect(() => {
    const streak = computeTrainingStreak(workouts, Date.now(), activeDates);
    if (streak !== profile.streakDays) setProfile((p) => ({ ...p, streakDays: streak }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts, activeDatesKey]);

  // Seed the owner's saved Phase 1 BT program and 2017 historical logs once on sign-in or launch.
  const importedSheetsKey = profile.importedSheetIds?.join(',') || '';
  useEffect(() => {
    if (!canUseMusclePlan(profile.email)) return;
    if (profile.importedSheetIds?.includes(PHASE_1_BT_SHEET_MARKER)) return;
    const seeded = ensureOwnerPhase1BtSeeded({
      profile,
      workouts,
      biometrics,
      exercises,
    });
    if (!seeded.didImport) return;
    setProfile(seeded.profile);
    setWorkouts(seeded.workouts);
    setBiometrics(seeded.biometrics);
    setExercises(seeded.exercises);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.email, importedSheetsKey]);

  // On the 6-week plan, today's session must be the plan's next workout (with the athlete's own
  // weights). A fresh install or cleared session otherwise starts on a generic split day.
  // An unstarted session that isn't the plan's next workout is out of date (e.g. from an older save),
  // so the Workout page always matches the Program page.
  useEffect(() => {
    if (!isPlanProgram(profile.programType)) return;
    if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
    const next = getNextProgramWorkoutNumber(workouts, activePlan, profile.planCycleStarts, profile.planStartWorkouts);
    if (activeWorkout.programWorkoutNumber === next && getSessionPlanId(activeWorkout) === activePlan.id) return;
    setActiveWorkout(prepareSession(generatePlanWorkout(activePlan, next), { isProgramPlan: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.programType, activePlan.id, workouts, profile.planCycleStarts, profile.planStartWorkouts]);

  // Keep the active unstarted session's advisory readinessState label synced without forcibly
  // cancelling progression (Amber Shield modulation is opt-in via the 1-tap advisory buttons).
  useEffect(() => {
    if (!isPlanProgram(profile.programType) || !activeWorkout.programWorkoutNumber) return;
    if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
    if (activeWorkout.readinessState === readiness.state) return;
    setActiveWorkout((prev) => ({ ...prev, readinessState: readiness.state }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness.state, activeWorkout.programWorkoutNumber]);

  // Auto-expire temporary environment overlays cleanly when opening a workout past expiresAtEpochMs
  // with zero confirmation modals, restoring master anchor exercises and clean Home-Gym re-entry cues.
  useEffect(() => {
    const check = resolveActiveOverlay(profile.activeEnvironmentOverlay, Date.now());
    if (!check.expired) return;
    setProfile((prev) => ({
      ...prev,
      activeEnvironmentOverlay: null,
      activeLocation: 'gym',
    }));
    if (!activeWorkout.completed && !activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) {
      const restored = applyEnvironmentOverlayToSession({
        session: activeWorkout,
        overlay: null,
        exerciseCatalog: exercises,
        historicalWorkouts: workouts,
        storedProgressionStates: profile.exerciseProgressionStates,
        userBodyweightKg: bodyweightEmaKg,
        unit: profile.weightUnit || 'kg',
      });
      setActiveWorkout(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.activeEnvironmentOverlay?.overlayId, profile.activeEnvironmentOverlay?.expiresAtEpochMs]);

  // Handler: a set was ticked off. Starts the labelled rest timer and celebrates a personal best once per set.
  const handleSetCompleted = (
    _exerciseName: string,
    _setNumber: number,
    completedSet?: WorkoutSet,
    exercise?: ExerciseSession,
    restMeta?: {
      recalibrationStatus?: string;
      leverageUpgradeNudge?: LeverageUpgradeNudge;
      onApplyLeverageUpgrade?: () => void;
    }
  ) => {
    if (!exercise || !completedSet) return;

    const rest = planRestAfterSet(activeWorkout, exercise, completedSet.id);
    if (rest.seconds === 0) {
      setRestTimerOpen(false);
    } else {
      setRestTimerSeconds(rest.seconds);
      setRestTimerContext({
        ...rest.context,
        ...(restMeta ?? {}),
      });
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

  // Handler: Apply AI Coach mutations (Equipment, Scheduled Location, Split, Workout, Biometrics, Activities)
  const handleApplyAssistantAction = (
    updatedProfile?: Partial<UserProfile>,
    updatedWorkout?: WorkoutSession,
    updatedBiometrics?: BiometricLog[],
    updatedActivities?: ActivityLog[]
  ) => {
    if (updatedProfile?.goalPhase && !updatedWorkout) {
      handleUpdateGoalPhase(updatedProfile.goalPhase);
    }
    if (updatedProfile) {
      setProfile((prev) => ({ ...prev, ...updatedProfile }));
    }
    if (updatedBiometrics) {
      saveBiometrics(updatedBiometrics);
      setBiometrics(updatedBiometrics);
    }
    if (updatedActivities) {
      saveActivities(updatedActivities);
      setActivities(updatedActivities);
    }
    if (updatedWorkout) {
      setActiveWorkout(fillWeightless(updatedWorkout));
    }
  };

  const handleUndoAssistantAction = (snapshot: CoachUndoSnapshot) => {
    if (snapshot.previousProfile) {
      const prevSnap = snapshot.previousProfile;
      setProfile((prev) => {
        const restoredProfile: UserProfile = {
          ...prev,
          ...prevSnap,
          ...('athleteMemories' in prevSnap ? { athleteMemories: prevSnap.athleteMemories } : {}),
          ...('planCycleStarts' in prevSnap ? { planCycleStarts: prevSnap.planCycleStarts } : {}),
          ...('planStartWorkouts' in prevSnap ? { planStartWorkouts: prevSnap.planStartWorkouts } : {}),
          ...('goalSettings' in prevSnap ? { goalSettings: prevSnap.goalSettings } : {}),
          ...('progressWidgets' in prevSnap ? { progressWidgets: prevSnap.progressWidgets } : {}),
          ...('workoutDisplay' in prevSnap ? { workoutDisplay: prevSnap.workoutDisplay } : {}),
          ...('programOverrides' in prevSnap ? { programOverrides: prevSnap.programOverrides } : {}),
          ...('dismissedInterventions' in prevSnap ? { dismissedInterventions: prevSnap.dismissedInterventions } : {}),
          ...('activeEnvironmentOverlay' in prevSnap
            ? { activeEnvironmentOverlay: prevSnap.activeEnvironmentOverlay }
            : {}),
        };
        saveProfile(restoredProfile);
        return restoredProfile;
      });
    }
    if (snapshot.previousWorkout) {
      saveActiveWorkout(snapshot.previousWorkout);
      setActiveWorkout(snapshot.previousWorkout);
    }
    if (snapshot.previousBiometrics) {
      saveBiometrics(snapshot.previousBiometrics);
      setBiometrics(snapshot.previousBiometrics);
    }
    if (snapshot.previousActivities) {
      saveActivities(snapshot.previousActivities);
      setActivities(snapshot.previousActivities);
    }
  };

  // Product-wide handler: Accept a suggested program adaptation immediately (persists overrides + syncs active workout)
  const handleAcceptIntervention = (intervention: CoachIntervention): void => {
    const result = applyCoachInterventionToState({
      intervention,
      profile,
      activeWorkout,
      workouts,
      biometrics,
      exerciseCatalog: exercises,
      bodyweightEmaKg,
      readinessState: readiness.state,
      trainingPlan: activePlan,
    });
    const nextProfile: UserProfile = { ...profile, ...result.updatedProfilePatch };
    saveProfile(nextProfile);
    setProfile(nextProfile);
    if (result.updatedActiveWorkout) {
      const synced = fillWeightless(result.updatedActiveWorkout);
      saveActiveWorkout(synced);
      setActiveWorkout(synced);
    }
  };

  // Product-wide handler: Dismiss a suggested program adaptation permanently across all surfaces
  const handleDismissIntervention = (intervention: CoachIntervention): void => {
    const planId = activePlan.id;
    const patch = dismissCoachIntervention(profile, intervention.id, planId);
    const nextProfile: UserProfile = { ...profile, ...patch };
    saveProfile(nextProfile);
    setProfile(nextProfile);
  };

  // Rebuild an unstarted queued plan workout cleanly after removing or resetting program overrides
  const syncUnstartedPlanWorkoutAfterOverrideChange = (nextProfile: UserProfile) => {
    if (
      activeWorkout.completed ||
      !activeWorkout.programWorkoutNumber ||
      activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))
    ) {
      return;
    }
    const nextPlan = resolveActivePlan(nextProfile);
    if ((activeWorkout.planId ?? nextPlan.id) !== nextPlan.id) return;
    const rebuilt = prepareSession(
      generatePlanWorkout(nextPlan, activeWorkout.programWorkoutNumber),
      { isProgramPlan: true, location: activeWorkout.location || nextProfile.activeLocation }
    );
    const hydrated = fillWeightless({ ...rebuilt, date: activeWorkout.date });
    saveActiveWorkout(hydrated);
    setActiveWorkout(hydrated);
  };

  const handleRemoveProgramOverride = (overrideId: string) => {
    const patch = removeProgramOverride(profile, overrideId);
    const nextProfile: UserProfile = { ...profile, ...patch };
    saveProfile(nextProfile);
    setProfile(nextProfile);
    syncUnstartedPlanWorkoutAfterOverrideChange(nextProfile);
  };

  const handleClearProgramOverrides = (planId: string) => {
    const patch = clearPlanProgramOverrides(profile, planId);
    const nextProfile: UserProfile = { ...profile, ...patch };
    saveProfile(nextProfile);
    setProfile(nextProfile);
    syncUnstartedPlanWorkoutAfterOverrideChange(nextProfile);
  };

  // Handler: Apply (or clear) a temporary Environment Overlay without mutating master program templates
  const handleApplyEnvironmentOverlay = (overlay: EnvironmentOverlay | null) => {
    const nowMs = Date.now();
    const resolved = resolveActiveOverlay(overlay, nowMs);
    const nextOverlay = resolved.active;
    const nextLocation = overlayToTrainingLocation(nextOverlay);

    setProfile((prev) => ({
      ...prev,
      activeEnvironmentOverlay: nextOverlay,
      activeLocation: nextLocation,
    }));

    // When returning to Full Gym on a plan workout that was originally generated outside the gym
    // (no anchorExerciseId stored on slots), restore unstarted exercises from the master plan first.
    let baseSession = activeWorkout;
    if (
      !nextOverlay &&
      activeWorkout.programWorkoutNumber &&
      !activeWorkout.exercises.some((ex) => Boolean(ex.anchorExerciseId))
    ) {
      const rebuilt = prepareSession(generatePlanWorkout(activePlan, activeWorkout.programWorkoutNumber), {
        isProgramPlan: true,
        location: 'gym',
      });
      const startedIds = new Set(
        activeWorkout.exercises.filter((ex) => ex.sets.some((s) => s.completed)).map((ex) => ex.exerciseId)
      );
      baseSession = {
        ...activeWorkout,
        location: 'gym',
        exercises: activeWorkout.exercises.map((ex, idx) => {
          const planned = rebuilt.exercises[idx];
          return ex.sets.some((s) => s.completed) || !planned || startedIds.has(planned.exerciseId) ? ex : planned;
        }),
      };
    }

    const overlaid = applyEnvironmentOverlayToSession({
      session: baseSession,
      overlay: nextOverlay,
      exerciseCatalog: exercises,
      historicalWorkouts: workouts,
      storedProgressionStates: profile.exerciseProgressionStates,
      userBodyweightKg: bodyweightEmaKg,
      nowMs,
      unit: profile.weightUnit || 'kg',
    });
    setActiveWorkout(overlaid);
  };

  // Handler: Switch Training Location ('gym' | 'home' | 'travel') in 1 tap from the 3-dots menu.
  // Persistent until changed back — Home uses equipment configured in onboarding or settings.
  const handleSwitchTrainingLocation = (location: TrainingLocation) => {
    const homeInv = profile.equipmentInventories?.home;
    const overlay = createOverlayForTrainingLocation(
      location,
      profile.homeEquipment,
      Date.now(),
      location === 'home'
        ? {
            maxDumbbellKg: homeInv?.dumbbellMaxKg ?? null,
            dumbbellStepKg: homeInv?.dumbbellStepKg ?? null,
          }
        : undefined
    );
    handleApplyEnvironmentOverlay(overlay);
  };

  // Handler: Update athlete profile (and sync Home overlay if home gear/inventory changes while in Home mode)
  const handleUpdateProfile = (up: Partial<UserProfile>) => {
    const nextHomeEquipment = up.homeEquipment ?? profile.homeEquipment;
    const nextHomeInv = up.equipmentInventories?.home ?? profile.equipmentInventories?.home;
    const updatedHomeSetup =
      (up.homeEquipment !== undefined || up.equipmentInventories !== undefined) &&
      profile.activeLocation === 'home';
    if (updatedHomeSetup) {
      const syncedOverlay = createOverlayForTrainingLocation('home', nextHomeEquipment, Date.now(), {
        maxDumbbellKg: nextHomeInv?.dumbbellMaxKg ?? null,
        dumbbellStepKg: nextHomeInv?.dumbbellStepKg ?? null,
      });
      setProfile((p) => ({ ...p, ...up, activeEnvironmentOverlay: syncedOverlay }));
      setActiveWorkout((prev) =>
        applyEnvironmentOverlayToSession({
          session: prev,
          overlay: syncedOverlay,
          exerciseCatalog: exercises,
          historicalWorkouts: workouts,
          storedProgressionStates: profile.exerciseProgressionStates,
          userBodyweightKg: bodyweightEmaKg,
          unit: profile.weightUnit || 'kg',
        })
      );
    } else {
      setProfile((p) => ({ ...p, ...up }));
    }
  };

  // Handler: Save inline edits to a completed past workout & keep streak + isolated progression states in sync
  const handleUpdatePastWorkout = (updated: WorkoutSession) => {
    const result = updatePastWorkoutInHistory({
      workouts,
      updatedWorkout: updated,
      activities,
      defaultBodyweightKg: bodyweightEmaKg,
    });
    setWorkouts(result.nextWorkouts);
    setProfile((prev) => ({
      ...prev,
      streakDays: result.streakDays,
      lastWorkoutDate: result.lastWorkoutDate,
      exerciseProgressionStates: result.exerciseProgressionStates,
    }));
    clearAiGenerationCaches();
    clearKnowledgeGraphCache();
    setToast({
      tag: 'Saved',
      message: 'Workout updated. Strength trends and progression targets recalculated.',
    });
  };

  // Handler: Delete a completed past workout & recalculate streak + isolated progression states
  const handleDeletePastWorkout = (workoutId: string) => {
    const result = deletePastWorkoutFromHistory({
      workouts,
      workoutId,
      activities,
      defaultBodyweightKg: bodyweightEmaKg,
    });
    setWorkouts(result.nextWorkouts);
    setProfile((prev) => ({
      ...prev,
      streakDays: result.streakDays,
      lastWorkoutDate: result.lastWorkoutDate,
      exerciseProgressionStates: result.exerciseProgressionStates,
    }));
    clearAiGenerationCaches();
    clearKnowledgeGraphCache();
    setToast({
      tag: 'Removed',
      message: 'Workout removed from history. Strength trends and streak updated.',
    });
  };

  // Handler: Edit a custom exercise definition in the catalog
  const handleUpdateCustomExercise = (updatedEx: ExerciseDefinition) => {
    setExercises((prev) => updateCustomExerciseInCatalog(prev, updatedEx));
    setToast({
      tag: 'Saved',
      message: `Updated ${updatedEx.name}.`,
    });
  };

  // Handler: Delete a custom exercise definition from the catalog (built-in lifts stay protected)
  const handleDeleteCustomExercise = (exerciseId: string) => {
    setExercises((prev) => deleteCustomExerciseFromCatalog(prev, exerciseId));
    setToast({
      tag: 'Removed',
      message: 'Custom exercise deleted. Past logged workouts remain intact.',
    });
  };

  // Handler: Complete Onboarding / Goals, Health Connect, Baseline Stats & Equipment Setup
  const handleCompleteOnboarding: OnboardingModalProps['onCompleteOnboarding'] = (setup) => {
    const athlete = setup.athlete;
    const startingBodyweight = athlete?.bodyweightKg && athlete.bodyweightKg > 0 ? athlete.bodyweightKg : undefined;
    const ownLiftDef = setup.ownGoal ? exercises.find((e) => e.id === setup.ownGoal!.exerciseId) : undefined;
    const ownGoalFromSetup = setup.ownGoal
      ? setup.ownGoal.metric === 'steps'
        ? makeCustomGoal(STEPS_GOAL_EXERCISE_ID, ownGoalName(STEPS_GOAL_EXERCISE_ID, 'Daily steps'), 'steps', setup.ownGoal.target, localDateString())
        : ownLiftDef
        ? makeCustomGoal(ownLiftDef.id, ownGoalName(ownLiftDef.id, ownLiftDef.name), setup.ownGoal.metric, setup.ownGoal.target, localDateString())
        : null
      : null;

    let nextProfile: UserProfile = {
      ...profile,
      goalPhase: setup.goalPhase,
      programType: setup.programType,
      activeLocation: setup.activeLocation,
      activeEnvironmentOverlay: createOverlayForTrainingLocation(
        setup.activeLocation,
        setup.homeEquipment,
        Date.now(),
        setup.activeLocation === 'home'
          ? {
              maxDumbbellKg: profile.equipmentInventories?.home?.dumbbellMaxKg ?? null,
              dumbbellStepKg: profile.equipmentInventories?.home?.dumbbellStepKg ?? null,
            }
          : undefined
      ),
      availableLocations: setup.availableLocations,
      homeEquipment: setup.homeEquipment,
      onboardingCompleted: true,
      ...(athlete
        ? {
            gender: athlete.gender,
            ...(athlete.sexEntered ? { sexEntered: true } : {}),
            ...(athlete.age && athlete.ageEntered ? { age: athlete.age, ageEntered: true } : {}),
            ...(athlete.measuredHeightCm ? { measuredHeightCm: athlete.measuredHeightCm, heightCm: athlete.measuredHeightCm } : {}),
            experienceLevel: athlete.experienceLevel,
            weightUnit: athlete.weightUnit,
            ...(athlete.heightUnit ? { heightUnit: athlete.heightUnit } : {}),
          }
        : {}),
      ...(setup.healthConnectConnected
        ? {
            healthConnectConnected: true,
            healthConnectActivities: true,
            wearableSource: profile.wearableSource ?? 'health_connect',
            healthConnectLastSync: new Date().toISOString(),
          }
        : {}),
      ...(setup.showRirTracking !== undefined
        ? {
            workoutDisplay: {
              ...(profile.workoutDisplay ?? {}),
              showRirTracking: setup.showRirTracking,
            },
          }
        : {}),
      ...(setup.habitAnchor !== undefined ? { habitAnchor: setup.habitAnchor } : {}),
      mesocycleWeek: profile.onboardingCompleted ? profile.mesocycleWeek : 1,
      // A goal of the athlete's own, set in onboarding, joins the plan's three.
      ...(ownGoalFromSetup ? { goalSettings: { ...profile.goalSettings, customGoals: [...(profile.goalSettings?.customGoals ?? []).filter((g) => g.id !== ownGoalFromSetup.id), ownGoalFromSetup].slice(-MAX_CUSTOM_GOALS) } } : {}),
    };
    let nextWorkouts: WorkoutSession[] = workouts;
    let nextBiometrics: BiometricLog[] = biometrics;
    let nextExercises: ExerciseDefinition[] = exercises;

    // Apply optional existing spreadsheet program + historical sets imported during onboarding.
    if (setup.importedSpreadsheet) {
      const mergedSheet = applySpreadsheetImportToState(
        {
          profile: nextProfile,
          workouts: nextWorkouts,
          biometrics: nextBiometrics,
          exercises: nextExercises,
        },
        setup.importedSpreadsheet.parsed,
        {
          activateProgram: setup.importedSpreadsheet.activateProgram,
          importHistory: setup.importedSpreadsheet.importHistory,
        }
      );
      nextProfile = mergedSheet.profile;
      nextWorkouts = mergedSheet.workouts;
      nextBiometrics = mergedSheet.biometrics;
      nextExercises = mergedSheet.exercises;
    }

    // Apply optional competitor CSV workout history (Hevy, Strong, FitNotes) imported during onboarding.
    if (setup.importedCompetitorHistory) {
      const { merged } = mergeImportedWorkouts(nextWorkouts, setup.importedCompetitorHistory.workouts);
      nextWorkouts = merged;
      if (setup.importedCompetitorHistory.addedExercises.length > 0) {
        const ids = new Set(nextExercises.map((e) => e.id));
        const fresh = setup.importedCompetitorHistory.addedExercises.filter((e) => !ids.has(e.id));
        if (fresh.length > 0) nextExercises = [...nextExercises, ...fresh];
      }
    }

    // Merge real historical biometrics from Health Connect AND/OR explicit manual baseline entries (never overwriting with 0).
    if ((setup.importedBiometrics && setup.importedBiometrics.length > 0) || setup.manualBaselineBiometric || startingBodyweight) {
      const todayStr = localDateString();
      const byDate = new Map<string, BiometricLog>();
      for (const item of nextBiometrics) byDate.set(item.date, { ...item });

      // 1. Merge real Health Connect history first (filling only missing/zero fields on existing days).
      for (const incoming of setup.importedBiometrics ?? []) {
        const existing = byDate.get(incoming.date);
        if (!existing) {
          byDate.set(incoming.date, { ...incoming });
        } else {
          byDate.set(incoming.date, {
            ...existing,
            bodyweightKg: existing.bodyweightKg > 0 ? existing.bodyweightKg : incoming.bodyweightKg,
            hrvRmssd: existing.hrvRmssd > 0 ? existing.hrvRmssd : incoming.hrvRmssd,
            restingHr: existing.restingHr > 0 ? existing.restingHr : incoming.restingHr,
            sleepHours: existing.sleepHours > 0 ? existing.sleepHours : incoming.sleepHours,
            steps: existing.steps > 0 ? existing.steps : incoming.steps,
            activeZoneMinutes: existing.activeZoneMinutes > 0 ? existing.activeZoneMinutes : incoming.activeZoneMinutes,
            vo2Max: (existing.vo2Max || 0) > 0 ? existing.vo2Max : incoming.vo2Max,
            bodyFatPct: existing.bodyFatPct && existing.bodyFatPct > 0 ? existing.bodyFatPct : incoming.bodyFatPct,
          });
        }
      }

      // 2. Apply explicit manual bodyweight onto today's record (only if the athlete actually entered one).
      const manual = setup.manualBaselineBiometric;
      const explicitTodayWeight = manual?.bodyweightKg ?? (!setup.importedBiometrics?.length ? startingBodyweight : undefined);
      if (explicitTodayWeight) {
        const existingToday = byDate.get(todayStr);
        if (existingToday) {
          byDate.set(todayStr, {
            ...existingToday,
            bodyweightKg: explicitTodayWeight,
          });
        } else {
          byDate.set(todayStr, {
            date: todayStr,
            bodyweightKg: explicitTodayWeight,
            hrvRmssd: 0,
            restingHr: 0,
            sleepHours: 0,
            steps: 0,
            activeZoneMinutes: 0,
            isManualEntry: true,
          });
        }
      }

      nextBiometrics = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    if (nextWorkouts.length > workouts.length) {
      nextProfile = {
        ...nextProfile,
        exerciseProgressionStates: rebuildIsolatedProgressionStates(
          nextWorkouts,
          startingBodyweight ?? bodyweightEmaKg
        ),
      };
    }

    setProfile(nextProfile);
    if (nextWorkouts !== workouts) setWorkouts(nextWorkouts);
    if (nextBiometrics !== biometrics) setBiometrics(nextBiometrics);
    if (nextExercises !== exercises) setExercises(nextExercises);

    // Merge recent workouts imported from Health Connect into active days cleanly.
    if (setup.importedActivities && setup.importedActivities.length > 0) {
      setActivities((prev) => mergeDetectedActivities(prev, setup.importedActivities!, loadDismissedActivityIds()).merged);
    }

    // Re-running setup (e.g. to edit equipment) must not throw away a workout in progress.
    const hasProgress = activeWorkout.exercises.some((ex) => ex.sets.some((st) => st.completed));
    // Editing from Settings stays in Settings; only finishing first-time setup goes to the workout.
    const isEditingSetup = Boolean(profile.onboardingCompleted);
    if (isEditingSetup) setToast({ message: 'Where you train is saved.', tag: 'Saved' });
    if (isEditingSetup && hasProgress) return;

    // Quickest path to value: Generate Day 1 workout for the chosen (or imported) plan and take user to Workout tab
    const effectiveProgramType = nextProfile.programType || setup.programType;
    const starterSplit = getFirstSplitDayForProgram(effectiveProgramType);
    const isPlan = isPlanProgram(effectiveProgramType);
    const setupPlan = resolveActivePlan(nextProfile);
    const starterSession = isPlan
      ? generatePlanWorkout(setupPlan, getNextProgramWorkoutNumber(nextWorkouts, setupPlan, nextProfile.planCycleStarts, nextProfile.planStartWorkouts))
      : generateSmartWorkoutSession(
          starterSplit,
          nextWorkouts,
          nextExercises,
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
        history: nextWorkouts,
        exerciseCatalog: nextExercises,
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
    const addedHistoricalCount = nextWorkouts.length - workouts.length;
    if (!isEditingSetup && (setup.importedSpreadsheet || addedHistoricalCount > 0)) {
      const planPart = setup.importedSpreadsheet?.parsed.savedPlan.name;
      setToast({
        tag: 'Imported',
        message:
          planPart && addedHistoricalCount > 0
            ? `Saved ${planPart} and imported ${addedHistoricalCount} past workouts. Day 1 is calibrated and ready.`
            : planPart
            ? `Saved ${planPart}. Your first workout is ready.`
            : `Imported ${addedHistoricalCount} past workouts. Day 1 weights are calibrated from your history.`,
      });
    }
    if (!isEditingSetup) setActiveTab('train');
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
      const session = generatePlanWorkout(plan, getNextProgramWorkoutNumber(workouts, plan, profile.planCycleStarts, profile.planStartWorkouts));
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

  // Handler: Import a program and optional historical workouts/biometrics from a spreadsheet
  const handleImportSpreadsheetProgram = (
    parsed: ParsedProgramImport,
    opts: { activateProgram: boolean; importHistory: boolean }
  ) => {
    const merged = applySpreadsheetImportToState(
      { profile, workouts, biometrics, exercises },
      parsed,
      {
        activateProgram: opts.activateProgram,
        importHistory: opts.importHistory,
      }
    );
    setProfile(merged.profile);
    setWorkouts(merged.workouts);
    setBiometrics(merged.biometrics);
    setExercises(merged.exercises);

    if (
      opts.activateProgram &&
      !activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))
    ) {
      const nextPlan = resolveActivePlan(merged.profile);
      const nextNum = getNextProgramWorkoutNumber(merged.workouts, nextPlan, merged.profile.planCycleStarts, merged.profile.planStartWorkouts);
      setActiveWorkout(prepareSession(generatePlanWorkout(nextPlan, nextNum), { isProgramPlan: true }));
    }

    const addedWorkouts = merged.workouts.length - workouts.length;
    setToast({
      tag: 'Program imported',
      message:
        addedWorkouts > 0
          ? `Saved ${parsed.savedPlan.name} (${parsed.savedPlan.templates.length} workouts) and added ${addedWorkouts} historical workouts.`
          : `Saved ${parsed.savedPlan.name} (${parsed.savedPlan.templates.length} workouts).`,
    });
  };

  // Handler: Remove a saved custom program (keeps all historical workouts intact)
  const handleDeleteCustomPlan = (planId: CustomPlanId) => {
    const fallbackType: ProgramSplitType =
      profile.programType === planId ? 'starter_6wk' : profile.programType || 'starter_6wk';
    const nextProfile: UserProfile = {
      ...profile,
      customPlans: (profile.customPlans ?? []).filter((p) => p.id !== planId),
      programType: fallbackType,
    };
    setProfile(nextProfile);
    if (
      profile.programType === planId &&
      !activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))
    ) {
      const nextPlan = resolveActivePlan(nextProfile);
      setActiveWorkout(
        prepareSession(
          generatePlanWorkout(nextPlan, getNextProgramWorkoutNumber(workouts, nextPlan, nextProfile.planCycleStarts, nextProfile.planStartWorkouts)),
          { isProgramPlan: true }
        )
      );
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
      setBiometrics((prev) => mergeWhoopWorkoutTelemetryLog(prev, todayStr, whoopTelemetry));
    }

    // Persist isolated per-exercise progression states (never merging dumbbell/bodyweight into barbell anchor)
    const nextProgressionStates: Record<string, ExerciseProgressionState> = {
      ...(profile.exerciseProgressionStates ?? {}),
    };
    const finishedAtMs = Date.now();
    for (const ex of completedSession.exercises) {
      const workingDone = ex.sets.filter(
        (s) => s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0
      );
      if (workingDone.length === 0) continue;
      const topSet = workingDone.reduce((best, s) => {
        const w = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const bw = best.actualWeightKg ?? best.targetWeightKg ?? 0;
        return w > bw || (w === bw && (s.actualReps ?? 0) > (best.actualReps ?? 0)) ? s : best;
      });
      const prevState = nextProgressionStates[ex.exerciseId] ?? null;
      const isBw = ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic;
      const weightForState = isBw
        ? Math.max(1, bodyweightEmaKg * (ex.bodyweightLoadPct ?? 0.65))
        : topSet.actualWeightKg ?? topSet.targetWeightKg ?? 0;
      nextProgressionStates[ex.exerciseId] = updateExerciseProgressionStateDamped(
        prevState,
        {
          exerciseId: ex.exerciseId,
          weightKg: weightForState,
          reps: topSet.actualReps ?? topSet.targetReps ?? 0,
          rir: topSet.actualRir ?? topSet.targetRir ?? 2,
          loggedAtMs: finishedAtMs,
        },
        {
          isFirstAnchorCalibration:
            ex.calibrationSource === 'ANCHOR_PRIOR' || ex.calibrationSource === 'EFFORT_ONLY',
          storeWeightAsNull: isBw,
        }
      );
    }

    // Location persists as chosen until the athlete changes it back (no auto-revert on finish).
    const currentOverlayCheck = resolveActiveOverlay(profile.activeEnvironmentOverlay, finishedAtMs);
    const homeInv = profile.equipmentInventories?.home;
    const remainingOverlay =
      currentOverlayCheck.active ??
      createOverlayForTrainingLocation(
        profile.activeLocation || 'gym',
        profile.homeEquipment,
        finishedAtMs,
        profile.activeLocation === 'home'
          ? {
              maxDumbbellKg: homeInv?.dumbbellMaxKg ?? null,
              dumbbellStepKg: homeInv?.dumbbellStepKg ?? null,
            }
          : undefined
      );
    const nextActiveLocation = remainingOverlay
      ? overlayToTrainingLocation(remainingOverlay)
      : 'gym';

    setWorkouts(nextHistory);
    setProfile((prev) => ({
      ...prev,
      streakDays: computeTrainingStreak(nextHistory, finishedAtMs, activeDates),
      lastWorkoutDate: todayStr,
      mesocycleWeek: nextMesocycleWeek,
      activeEnvironmentOverlay: remainingOverlay,
      activeLocation: nextActiveLocation,
      exerciseProgressionStates: nextProgressionStates,
    }));

    const baseNextSession =
      isPlanProgram(profile.programType)
        ? prepareSession(
            generatePlanWorkout(activePlan, getNextProgramWorkoutNumber(nextHistory, activePlan, profile.planCycleStarts, profile.planStartWorkouts)),
            { isProgramPlan: true, location: 'gym', history: nextHistory }
          )
        : prepareSession(
            generateSmartWorkoutSession(
              getNextSplitDay(activeWorkout.splitDay, profile.programType),
              nextHistory,
              exercises,
              readiness.state,
              nextMesocycleWeek,
              'gym',
              profile.homeEquipment || [],
              profile.goalPhase,
              bodyweightEmaKg,
              profile.scheduledWeekLocations
            ),
            { history: nextHistory }
          );
    const nextSession =
      remainingOverlay || profile.activeEnvironmentOverlay
        ? applyEnvironmentOverlayToSession({
            session: baseNextSession,
            overlay: remainingOverlay,
            exerciseCatalog: exercises,
            historicalWorkouts: nextHistory,
            storedProgressionStates: nextProgressionStates,
            userBodyweightKg: bodyweightEmaKg,
            nowMs: finishedAtMs,
            unit: profile.weightUnit || 'kg',
          })
        : baseNextSession;
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
    setActivities([]);
    resetCoachSession();
    clearAiGenerationCaches();
    clearKnowledgeGraphCache();
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
    a.download = `treise-backup-${todayStr}.json`;
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

  // Handler: 1-Click Competitor CSV Import (Hevy, Strong, FitNotes)
  const handleImportCompetitorHistory = (parsed: CompetitorCsvImportResult) => {
    const { merged, addedCount } = mergeImportedWorkouts(workouts, parsed.workouts);
    setWorkouts(merged);
    if (parsed.addedExercises.length > 0) {
      setExercises((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        const fresh = parsed.addedExercises.filter((e) => !ids.has(e.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    }
    setToast({
      title: `${parsed.summary.formatLabel} import complete`,
      message:
        addedCount > 0
          ? `Imported ${addedCount} workout${addedCount === 1 ? '' : 's'} (${parsed.summary.totalSetsCount} sets) into your training history.`
          : 'All workouts from this CSV were already in your history.',
      tag: 'History Imported',
    });
  };

  // Handlers: Opt-In Client-Side Encrypted Google Drive Backup
  const handleEnableDriveBackup = async (passphrase: string) => {
    const token = await requestGoogleDriveBackupToken();
    cacheDriveSessionCredentials(token, passphrase);
    const rawJson = exportAllUserDataJSON();
    const res = await runEncryptedDriveBackup({
      rawJson,
      passphrase,
      accessToken: token.accessToken,
    });
    setProfile((prev) => ({
      ...prev,
      cloudBackup: {
        enabled: true,
        provider: 'google_drive',
        lastBackedUpAt: res.backedUpAt,
        lastBackupHash: res.contentHash,
        lastRestoredAt: prev.cloudBackup?.lastRestoredAt,
      },
    }));
    setToast({
      title: 'Encrypted backup enabled',
      message: 'Your AES-256-GCM encrypted backup is saved in your private Google Drive app-data folder.',
      tag: 'Encrypted Backup',
    });
  };

  const handleRunDriveBackupNow = async (passphraseInput?: string) => {
    const cached = getCachedDriveSessionCredentials();
    const passphrase = passphraseInput || cached?.passphrase;
    if (!passphrase) {
      throw new Error('Enter your backup passphrase above to encrypt and upload now.');
    }
    const token = cached?.accessToken
      ? { accessToken: cached.accessToken, expiresAt: cached.expiresAt }
      : await requestGoogleDriveBackupToken(undefined, { prompt: '' }).catch(() =>
          requestGoogleDriveBackupToken(undefined, { prompt: 'consent' })
        );
    cacheDriveSessionCredentials(token, passphrase);
    const rawJson = exportAllUserDataJSON();
    const res = await runEncryptedDriveBackup({
      rawJson,
      passphrase,
      accessToken: token.accessToken,
    });
    setProfile((prev) => ({
      ...prev,
      cloudBackup: {
        enabled: true,
        provider: 'google_drive',
        lastBackedUpAt: res.backedUpAt,
        lastBackupHash: res.contentHash,
        lastRestoredAt: prev.cloudBackup?.lastRestoredAt,
      },
    }));
    setToast({
      message: 'Encrypted backup updated in your private Google Drive app-data folder.',
      tag: 'Backup Synced',
    });
  };

  const handleRestoreDriveBackup = async (passphrase: string) => {
    const cached = getCachedDriveSessionCredentials();
    const token = cached?.accessToken
      ? { accessToken: cached.accessToken, expiresAt: cached.expiresAt }
      : await requestGoogleDriveBackupToken(undefined, { prompt: 'consent' });
    cacheDriveSessionCredentials(token, passphrase);
    const downloaded = await restoreEncryptedDriveBackup({
      passphrase,
      accessToken: token.accessToken,
    });
    if (!downloaded) {
      throw new Error('No encrypted Treise backup was found in your Google Drive app-data folder.');
    }
    const restored = importUserDataJSON(downloaded.rawJson);
    const restoredAt = new Date().toISOString();
    const nextProfile: UserProfile = {
      ...restored.profile,
      cloudBackup: {
        enabled: true,
        provider: 'google_drive',
        lastBackedUpAt: downloaded.metadata.modifiedTime || downloaded.envelope.createdAt,
        lastBackupHash: computeBackupContentHash(downloaded.rawJson),
        lastRestoredAt: restoredAt,
      },
    };
    setProfile(nextProfile);
    setBiometrics(restored.biometrics);
    setWorkouts(restored.workouts);
    setActiveWorkout(restored.activeWorkout);
    setExercises(restored.exercises);
    setActivities(restored.activities || []);
    setToast({
      title: 'Encrypted backup restored',
      message: `Restored ${restored.workouts.length} workouts and your body metrics from Google Drive.`,
      tag: 'Restored',
    });
  };

  const handleDisableDriveBackup = async (deleteRemote: boolean) => {
    const cached = getCachedDriveSessionCredentials();
    if (deleteRemote && cached?.accessToken) {
      await deleteEncryptedBackupFromDrive(cached.accessToken);
    }
    clearDriveSessionCredentials();
    setProfile((prev) => ({
      ...prev,
      cloudBackup: undefined,
    }));
    setToast({
      message: 'Automatic encrypted Google Drive backup turned off. Local data stays on this device.',
      tag: 'Backup Off',
    });
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
    resetCoachSession();
    clearAiGenerationCaches();
    clearKnowledgeGraphCache();
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
    setToast({
      message: `${activeWorkout.name} will be ready tomorrow. Missing a day doesn't set your plan back.`,
      tag: 'Rest day',
    });
  };

  // Changing the goal (Settings or the Progress page) re-writes an unstarted workout to match it.
  const handleUpdateGoalPhase = (phase: GoalPhase) => {
              setProfile((p) => ({ ...p, goalPhase: phase }));
              // A session already under way keeps what's been logged.
              if (activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) return;
              if (isPlanProgram(profile.programType)) {
                // The starter plan's sets and reps follow the goal; fixed plans don't change.
                const plan = resolveActivePlan({ ...profile, goalPhase: phase });
                if (plan.id === 'muscle_building_6wk' || isCustomPlanId(plan.id)) return;
                setActiveWorkout(
                  prepareSession(generatePlanWorkout(plan, getNextProgramWorkoutNumber(workouts, plan, profile.planCycleStarts, profile.planStartWorkouts)), { isProgramPlan: true })
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
            };

  return (
    <UnitsProvider unit={weightUnit} heightUnit={heightUnit}>
    <div className="wk min-h-screen flex flex-col font-sans relative">
      <div id="page-top-gradient-host" className="pointer-events-none" />
      {/* App Header */}
      <Header
        profile={profile}
        readinessState={readiness.state}
        onOpenWatchSync={() => setWatchModalOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Main Mobile Container */}
      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 relative">
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
            onUpdateProfile={handleUpdateProfile}
            activities={activities}
            onLogActivity={() => setLogActivityOpen(true)}
            onOpenActivityApps={() => setActivityAppsOpen(true)}
            onRemoveActivity={activitySync.removeActivity}
            onOpenInsights={(exerciseId) => {
              setOpenInsightsRequest({ nonce: Date.now(), exerciseId });
              setActiveTab('analytics');
              window.scrollTo({ top: 0 });
            }}
            onSwitchSplitDay={
              isPlanProgram(profile.programType)
                ? undefined
                : (split) => handleSwitchSplitDay(split)
            }
            onOpenCoachIntervention={({ prompt, exerciseId }) =>
              openCoachWithIntervention(prompt, {
                tab: 'train',
                ...(exerciseId ? { exerciseId } : {}),
              })
            }
            onOpenCoach={(opts) =>
              openCoach(
                {
                  tab: 'train',
                  ...(opts?.exerciseId ? { exerciseId: opts.exerciseId } : {}),
                },
                opts?.prompt
              )
            }
            onAcceptIntervention={handleAcceptIntervention}
            onDismissIntervention={handleDismissIntervention}
            onUpdatePastWorkout={handleUpdatePastWorkout}
            onDeletePastWorkout={handleDeletePastWorkout}
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
            activities={activities}
            onUpdateProfile={handleUpdateProfile}
            onUpdateGoalPhase={handleUpdateGoalPhase}
            onContextChange={setProgressContext}
            onSaveMeasurements={handleSaveMeasurements}
            openLogWeightRequest={logWeightRequest}
            onLogWeightRequestHandled={() => setLogWeightRequest(0)}
            openInsightsRequest={openInsightsRequest}
            onInsightsRequestHandled={() => setOpenInsightsRequest(null)}
            openDetailRequest={progressDetailRequest}
            onDetailRequestHandled={() => setProgressDetailRequest(null)}
            readinessState={readiness.state}
            onOpenCoachIntervention={({ prompt, detail }) =>
              openCoachWithIntervention(prompt, {
                tab: 'analytics',
                ...progressContext,
                ...(detail ? { detail } : {}),
              })
            }
            onOpenCoach={(opts) =>
              openCoach(
                {
                  tab: 'analytics',
                  ...progressContext,
                  ...(opts?.detail ? { detail: opts.detail } : {}),
                  ...(opts?.goalId ? { goalId: opts.goalId } : {}),
                },
                opts?.prompt
              )
            }
            onAcceptIntervention={handleAcceptIntervention}
            onDismissIntervention={handleDismissIntervention}
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
            exerciseCatalog={exercises}
            activeSplitDay={activeWorkout.splitDay}
            onUpdateProfile={handleUpdateProfile}
            onSelectMesocycleWeek={handleSelectMesocycleWeek}
            onUpdateGoalPhase={handleUpdateGoalPhase}
            onLaunchSplitDay={(sp) => handleSwitchSplitDay(sp, true)}
            onLaunchWorkoutNumber={handleLaunchWorkoutNumber}
            onUpdateProgram={handleUpdateProgram}
            onImportProgram={handleImportSpreadsheetProgram}
            onImportHistory={handleImportCompetitorHistory}
            onDeleteCustomPlan={handleDeleteCustomPlan}
            onAddCustomExercise={(newEx) => setExercises((prev) => [...prev, newEx])}
            onUpdateCustomExercise={handleUpdateCustomExercise}
            onDeleteCustomExercise={handleDeleteCustomExercise}
            onUpdatePastWorkout={handleUpdatePastWorkout}
            onDeletePastWorkout={handleDeletePastWorkout}
            activities={activities}
            onLogActivity={() => setLogActivityOpen(true)}
            onOpenOnboarding={() => {
              setOnboardingInitialStep(ONBOARDING_LOCATION_STEP);
              setOnboardingOpen(true);
            }}
            activeWorkoutName={activeWorkout.name}
            activeProgramWorkoutNumber={activeWorkout.programWorkoutNumber}
            onBackToWorkout={() => {
              setActiveTab('train');
              window.scrollTo({ top: 0 });
            }}
            onOpenCoachIntervention={(prompt) =>
              openCoachWithIntervention(prompt, { tab: 'program' })
            }
            onOpenCoach={(prompt) => openCoach({ tab: 'program' }, prompt)}
            onAcceptIntervention={handleAcceptIntervention}
            onDismissIntervention={handleDismissIntervention}
            onRemoveProgramOverride={handleRemoveProgramOverride}
            onClearProgramOverrides={handleClearProgramOverrides}
          />
        )}
        </ErrorBoundary>
        </Suspense>
      </main>

      {logActivityOpen && (
        <Suspense fallback={null}>
          <LogActivityModal onLog={activitySync.logManualActivity} onClose={() => setLogActivityOpen(false)} />
        </Suspense>
      )}
      {activityAppsOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
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
          activities={activities}
          place={
            coachLaunchRequest?.place ?? {
              tab: activeTab === 'program' ? 'program' : activeTab === 'analytics' ? 'analytics' : 'train',
              ...(activeTab === 'analytics' ? progressContext : {}),
            }
          }
          initialPrompt={coachLaunchRequest?.prompt}
          persistedMessages={coachMessages}
          onMessagesChange={setCoachMessages}
          persistedRevertedIds={coachRevertedIds}
          onRevertedIdsChange={setCoachRevertedIds}
          onResetConversation={() => setCoachLaunchRequest(null)}
          onClose={() => {
            setAiCoachOpen(false);
            setCoachLaunchRequest(null);
          }}
          onApplyAction={handleApplyAssistantAction}
          onUndoAction={handleUndoAssistantAction}
          onNavigateTab={(tab, detail) => {
            setAiCoachOpen(false);
            setCoachLaunchRequest(null);
            setActiveTab(tab);
            if (tab === 'analytics' && (detail?.detail || detail?.goalId)) {
              setProgressDetailRequest({
                detail: detail.detail,
                goalId: detail.goalId,
                nonce: Date.now(),
              });
            }
            window.scrollTo({ top: 0 });
          }}
          onViewAllEquipment={() => {
            setAiCoachOpen(false);
            setCoachLaunchRequest(null);
            setOnboardingInitialStep(ONBOARDING_LOCATION_STEP);
            setOnboardingOpen(true);
          }}
        />
        </Suspense>
      )}

      {/* Onboarding & Equipment Context Setup Modal */}
      {onboardingOpen && (
        <Suspense fallback={null}>
          <OnboardingModal
            profile={profile}
            exerciseCatalog={exercises}
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
              setActivities([]);
              resetCoachSession();
              clearAiGenerationCaches();
              clearKnowledgeGraphCache();
              setOnboardingOpen(false);
              setToast({
                message: 'Sample 6-week workout and biometric history loaded.',
                tag: 'Demo Mode',
              });
            }}
          />
        </Suspense>
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

      {/* User Profile, Google Sign In & Settings Modal */}
      {authModalOpen && !onboardingOpen && (
        <Suspense fallback={null}>
          <GoogleAuthModal
            currentUser={authUser}
            profile={profile}
            latestBiometrics={latestBiometrics}
            canInstallPwa={Boolean(deferredInstallPrompt)}
            onTriggerInstallPwa={handleTriggerInstallPwa}
            isOpen={authModalOpen && !onboardingOpen}
            onClose={() => setAuthModalOpen(false)}
            onAuthSuccess={handleAuthSuccess}
            onSignOut={handleSignOut}
            onUpdateProfile={handleUpdateProfile}
            onOpenWatchSync={() => setWatchModalOpen(true)}
            onOpenActivityApps={() => setActivityAppsOpen(true)}
            onResetData={handleResetData}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onOpenCompetitorImport={() => {
              setAuthModalOpen(false);
              setCompetitorImportOpen(true);
            }}
            onEnableDriveBackup={handleEnableDriveBackup}
            onRunDriveBackupNow={handleRunDriveBackupNow}
            onRestoreDriveBackup={handleRestoreDriveBackup}
            onDisableDriveBackup={handleDisableDriveBackup}
            onDeleteAllData={handleDeleteAllData}
          />
        </Suspense>
      )}

      {competitorImportOpen && (
        <Suspense fallback={null}>
          <ImportProgramModal
            exerciseCatalog={exercises}
            initialMode="history"
            onImport={handleImportSpreadsheetProgram}
            onImportHistory={handleImportCompetitorHistory}
            onClose={() => setCompetitorImportOpen(false)}
          />
        </Suspense>
      )}

      {/* Wearable & Recovery Sync Dialog Modal */}
      {watchModalOpen && (
        <Suspense fallback={null}>
          <WatchSyncModal
            profile={profile}
            latestBiometrics={latestBiometrics}
            hcStatus={activitySync.hcStatus}
            onSetHealthConnect={(on) => setProfile((p) => ({ ...p, healthConnectActivities: on }))}
            onRequestHealthConnectPermission={requestHealthConnectPermission}
            onSyncCompleted={(log, provider) => {
              handleSyncCompleted(log, provider);
              setWatchModalOpen(false);
            }}
            onUpdateProfile={(up) => setProfile((prev) => ({ ...prev, ...up }))}
            onClose={() => setWatchModalOpen(false)}
            isModal={true}
          />
        </Suspense>
      )}

      {toast && (
        <Toast
          subtitle={toast.title ? (toast.tag ? `${toast.tag} · ${toast.title}` : toast.title) : toast.tag}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Bottom 4-tab navigation with dedicated chat */}
      <NavigationBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'chat') {
            setCoachLaunchRequest(null);
            setAiCoachOpen((prev) => !prev);
          } else {
            setActiveTab(tab);
            setAiCoachOpen(false);
            setCoachLaunchRequest(null);
            window.scrollTo({ top: 0 });
          }
        }}
        isChatOpen={aiCoachOpen}
        onOpenAICoach={() => {
          setCoachLaunchRequest(null);
          setAiCoachOpen((prev) => !prev);
        }}
      />

      {import.meta.env.VITE_LOCAL_TEST_COPY === 'true' && LocalTestDrawer && (
        <Suspense fallback={null}>
          <LocalTestDrawer
            profile={profile}
            biometrics={biometrics}
            workouts={workouts}
            activeWorkout={activeWorkout}
            activeTab={activeTab}
            activePlan={activePlan}
            nextWorkoutNumber={getNextProgramWorkoutNumber(workouts, activePlan, profile.planCycleStarts, profile.planStartWorkouts)}
            readinessState={readiness.state}
            bodyweightEmaKg={bodyweightEmaKg}
            recoveryReady={evaluateSessionRecovery(activeWorkout, workouts, exercises, Date.now(), readiness.state).isReady}
            streakDays={profile.streakDays || 0}
            onApplyScenario={(state) => {
              setAuthUser(null);
              setProfile(state.profile);
              setBiometrics(state.biometrics);
              setWorkouts(state.workouts);
              setActiveWorkout(state.activeWorkout);
              setExercises(state.exercises);
              setActivities(state.activities);
              setOnboardingInitialStep(1);
              setOnboardingOpen(state.onboardingOpen);
              setAiCoachOpen(false);
              resetCoachSession();
    clearAiGenerationCaches();
    clearKnowledgeGraphCache();
              setActiveTab(state.activeTab);
              setToast({
                title: state.meta.title,
                message: state.meta.summary,
                tag: 'Test Scenario',
              });
              window.scrollTo({ top: 0 });
            }}
            onUpdateBiometrics={(next) => setBiometrics(next)}
            onUpdateProfile={(up) => setProfile((prev) => ({ ...prev, ...up }))}
            onSwitchLocation={(loc) => handleSwitchTrainingLocation(loc)}
            onUpdateGoalPhase={(goal) => handleUpdateGoalPhase(goal)}
            onMarkAllActiveSetsDone={() => {
              const nowIso = new Date().toISOString();
              setActiveWorkout((prev) => ({
                ...prev,
                startedAt: prev.startedAt || new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                exercises: prev.exercises.map((ex) => ({
                  ...ex,
                  sets: ex.sets.map((s) => ({
                    ...s,
                    completed: true,
                    completedAt: nowIso,
                    actualWeightKg: s.actualWeightKg || s.targetWeightKg,
                    actualReps: s.actualReps || s.targetReps,
                    actualRir: s.actualRir ?? s.targetRir ?? 2,
                  })),
                })),
              }));
            }}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              setAiCoachOpen(false);
              window.scrollTo({ top: 0 });
            }}
            onOpenCoach={() => setAiCoachOpen(true)}
            onOpenOnboarding={() => {
              setOnboardingInitialStep(1);
              setOnboardingOpen(true);
            }}
            onOpenWeightLog={() => {
              setActiveTab('analytics');
              setLogWeightRequest((n) => n + 1);
            }}
            onOpenWatchSync={() => setWatchModalOpen(true)}
            onOpenLogActivity={() => setLogActivityOpen(true)}
          />
        </Suspense>
      )}
    </div>
    </UnitsProvider>
  );
};

export default App;
