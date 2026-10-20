import React, { useState, useEffect } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  ReadinessState,
  StrengthPillar,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
  WearableProvider,
  AuthUser,
} from './engine/types';
import { calculateDailyReadiness } from './engine/readiness';
import { getLatestBodyweightEma } from './engine/ema';
import {
  calculateProgramMilestoneXp,
  calculateWorkoutCompletionXp,
  evaluateExerciseProgressXp,
  evaluateStrengthStandardAdvanceXp,
} from './engine/xp';
import { evaluateStrengthStandard } from './engine/strengthStandards';
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
import { syncWearableBiometrics } from './services/wearableSyncService';
import { Header } from './components/common/Header';
import { NavigationBar, TabId } from './components/common/NavigationBar';
import { RestTimerModal } from './components/common/RestTimerModal';
import { XPNotification } from './components/common/XPNotification';
import { TrainTab } from './components/train/TrainTab';
import { CharacterTab } from './components/character/CharacterTab';
import { AnalyticsTab } from './components/analytics/AnalyticsTab';
import { ProgramTab } from './components/program/ProgramTab';
import { WatchSyncModal } from './components/program/WatchSyncModal';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { AICoachChatModal } from './components/assistant/AICoachChatModal';
import { GoogleAuthModal } from './components/auth/GoogleAuthModal';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('train');
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [biometrics, setBiometrics] = useState<BiometricLog[]>(loadBiometrics);
  const [workouts, setWorkouts] = useState<WorkoutSession[]>(loadWorkouts);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutSession>(loadActiveWorkout);
  const [exercises, setExercises] = useState<ExerciseDefinition[]>(loadExercises);

  // Auto-regulation interactive tester state
  const [readinessOverride, setReadinessOverride] = useState<ReadinessState | null>(null);

  // Modals & Floating Overlays
  const [restTimerOpen, setRestTimerOpen] = useState(false);
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

  // Save to localStorage when state changes
  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    saveBiometrics(biometrics);
  }, [biometrics]);

  useEffect(() => {
    saveWorkouts(workouts);
  }, [workouts]);

  useEffect(() => {
    saveActiveWorkout(activeWorkout);
  }, [activeWorkout]);

  useEffect(() => {
    saveExercises(exercises);
  }, [exercises]);

  // Listen for PWA beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Handle Android App Shortcut Deep Links & Fitbit OAuth 2.0 PKCE Callback on Launch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as TabId | null;
    const actionParam = params.get('action');
    const oauthCode = params.get('code');

    if (tabParam === 'chat') {
      setAiCoachOpen(true);
    } else if (
      tabParam &&
      ['train', 'character', 'analytics', 'program'].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }

    if (actionParam === 'watch-sync') {
      setWatchModalOpen(true);
    }

    if (oauthCode) {
      const stateParam = params.get('state') || '';
      const isWhoop = stateParam.startsWith('whoop_') || window.location.pathname.includes('/whoop');
      const provider: WearableProvider = isWhoop ? 'whoop' : 'fitbit';

      syncWearableBiometrics(provider, { forcedState: 'Primed' }).then((syncedLog) => {
        handleSyncCompleted(syncedLog, provider);
        const deviceName = provider === 'whoop' ? 'Whoop 4.0' : 'Google Pixel Watch';
        setXpNotification({
          amount: 0,
          message: `${deviceName} connected & recovery data synced!`,
          bonusTag: 'Wearable Connected',
        });
      });
    }

    if (tabParam || actionParam || oauthCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Derived calculations
  const bodyweightEmaKg = getLatestBodyweightEma(biometrics, 80.0);
  const latestBiometrics: BiometricLog = biometrics[biometrics.length - 1] || {
    date: new Date().toISOString().split('T')[0],
    bodyweightKg: 80.0,
    hrvRmssd: 58,
    restingHr: 58,
    sleepHours: 7.5,
    steps: 0,
    activeZoneMinutes: 0,
    vo2Max: 44.0,
  };

  const calculatedReadiness = calculateDailyReadiness(latestBiometrics, biometrics);

  const readiness = readinessOverride
    ? {
        ...calculatedReadiness,
        state: readinessOverride,
        score:
          readinessOverride === 'Primed'
            ? 1.25
            : readinessOverride === 'Amber Shield'
            ? -1.15
            : 0.2,
        xpMultiplier: readinessOverride === 'Primed' ? 1.15 : 1.0,
        streakProtected: readinessOverride === 'Amber Shield',
        reason:
          readinessOverride === 'Primed'
            ? 'Ready to push hard (+15% XP Bonus).'
            : readinessOverride === 'Amber Shield'
            ? 'Recovery mode active (weights held steady, streak protected).'
            : 'Normal recovery baseline.',
      }
    : calculatedReadiness;

  const pillarBestE1rm = calculateBestPillarE1rms(workouts, bodyweightEmaKg);
  const weeklyVolume = calculateWeeklyMuscleVolume(workouts, exercises, activeWorkout);

  // Handler: Award XP & update level
  const addXp = (amount: number, message: string, bonusTag?: string) => {
    const finalAmount = Math.round(amount * readiness.xpMultiplier);
    const newTotalXp = profile.currentXp + finalAmount;
    const newLevel = Math.floor(newTotalXp / 500) + 1;

    setProfile((prev) => ({
      ...prev,
      currentXp: newTotalXp,
      level: newLevel,
    }));

    setXpNotification({
      amount: finalAmount,
      message,
      bonusTag: bonusTag ?? (readiness.state === 'Primed' ? '+15% Primed' : undefined),
    });
  };

  // Handler: 1-Tap Set Completion (Evaluates progressive overload)
  const handleSetCompleted = (
    exerciseName: string,
    setNumber: number,
    completedSet?: WorkoutSet,
    exercise?: ExerciseSession
  ) => {
    setRestTimerOpen(true);

    if (completedSet && exercise && !completedSet.isWarmup && completedSet.setType !== 'warmup') {
      const currentWeight = completedSet.actualWeightKg ?? completedSet.targetWeightKg ?? 0;
      const currentReps = completedSet.actualReps ?? completedSet.targetReps ?? 0;

      // Find historical best weight and reps for this exercise
      let prevBestWeight = 0;
      let prevBestReps = 0;

      for (const w of workouts) {
        if (!w.completed) continue;
        const matchingEx = w.exercises.find((e) => e.exerciseId === exercise.exerciseId);
        if (!matchingEx) continue;
        for (const s of matchingEx.sets) {
          if (!s.completed || s.isWarmup || s.setType === 'warmup') continue;
          const wKg = s.actualWeightKg ?? s.targetWeightKg ?? 0;
          const reps = s.actualReps ?? s.targetReps ?? 0;
          if (wKg > prevBestWeight) {
            prevBestWeight = wKg;
            prevBestReps = reps;
          } else if (wKg === prevBestWeight && reps > prevBestReps) {
            prevBestReps = reps;
          }
        }
      }

      const progressAward = evaluateExerciseProgressXp(
        exerciseName,
        currentWeight,
        currentReps,
        prevBestWeight > 0 ? prevBestWeight : undefined,
        prevBestReps > 0 ? prevBestReps : undefined,
        exercise.maxReps || 12
      );

      if (progressAward) {
        addXp(progressAward.amount, progressAward.description, progressAward.bonusTag);
      }
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
    setActiveWorkout(smartSession);
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
  }) => {
    setProfile((prev) => ({
      ...prev,
      goalPhase: setup.goalPhase,
      programType: setup.programType,
      activeLocation: setup.activeLocation,
      availableLocations: setup.availableLocations,
      homeEquipment: setup.homeEquipment,
      onboardingCompleted: true,
    }));

    // Quickest path to value: Generate Day 1 workout for the chosen split and take user to Workout tab
    const starterSplit = getFirstSplitDayForProgram(setup.programType);
    const day1Session = generateSmartWorkoutSession(
      starterSplit,
      workouts,
      exercises,
      readiness.state,
      1,
      setup.activeLocation,
      setup.homeEquipment,
      setup.goalPhase,
      bodyweightEmaKg
    );
    setActiveWorkout(day1Session);
    setActiveTab('train');
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
    setActiveWorkout(recalibrated);
  };

  // Handler: Complete entire workout session & advance split rotation (Legitimate XP)
  const handleFinishWorkout = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const completedSetCount = activeWorkout.exercises.reduce(
      (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
      0
    );
    const estimatedDuration = Math.max(35, completedSetCount * 3 + 12);
    const estimatedHr =
      activeWorkout.splitDay === 'Legs'
        ? 149
        : activeWorkout.splitDay === 'Pull'
        ? 141
        : 138;

    const completionAward = calculateWorkoutCompletionXp(
      activeWorkout,
      readiness.state,
      readiness.xpMultiplier
    );

    const completedSession: WorkoutSession = {
      ...activeWorkout,
      completed: true,
      completedAt: new Date().toISOString(),
      readinessState: readiness.state,
      readinessZScore: readiness.score,
      xpEarned: completionAward.amount,
      avgHeartRate: estimatedHr,
      durationMinutes: estimatedDuration,
    };

    // Evaluate strength standards advances
    const prevPillars = calculateBestPillarE1rms(workouts, bodyweightEmaKg);
    const nextWorkouts = [completedSession, ...workouts];
    const nextPillars = calculateBestPillarE1rms(nextWorkouts, bodyweightEmaKg);

    const pillarsToCheck: StrengthPillar[] = [
      'Squat',
      'Hinge',
      'Horizontal Push',
      'Vertical Push',
      'Horizontal Pull',
      'Vertical Pull',
    ];

    let strengthAdvanceAward: ReturnType<typeof evaluateStrengthStandardAdvanceXp> = null;
    for (const p of pillarsToCheck) {
      const oldStd = evaluateStrengthStandard(p, prevPillars[p], bodyweightEmaKg, profile.gender);
      const newStd = evaluateStrengthStandard(p, nextPillars[p], bodyweightEmaKg, profile.gender);
      const adv = evaluateStrengthStandardAdvanceXp(
        p,
        oldStd.tier,
        oldStd.subDivision,
        newStd.tier,
        newStd.subDivision
      );
      if (adv) {
        strengthAdvanceAward = adv;
        break;
      }
    }

    // Check if completing this workout completes a Program Milestone (training week or 6-week mesocycle)
    const sessionsPerWeekMap: Record<ProgramSplitType, number> = {
      ppl_upper: 4,
      ppl: 3,
      upper_lower: 4,
      full_body: 3,
    };
    const sessionsPerWeek = sessionsPerWeekMap[profile.programType || 'ppl_upper'] || 4;
    const isWeekMilestone = nextWorkouts.length > 0 && nextWorkouts.length % sessionsPerWeek === 0;

    let milestoneAward: ReturnType<typeof calculateProgramMilestoneXp> | null = null;
    let nextMesocycleWeek = profile.mesocycleWeek || 1;

    if (isWeekMilestone) {
      const completedWeek = profile.mesocycleWeek || 1;
      const programLabels: Record<ProgramSplitType, string> = {
        ppl_upper: 'PPL + Upper',
        ppl: 'PPL Classic',
        upper_lower: 'Upper / Lower',
        full_body: 'Full Body',
      };
      const progName = programLabels[profile.programType || 'ppl_upper'] || 'Hypertrophy Split';
      milestoneAward = calculateProgramMilestoneXp(completedWeek, progName);
      nextMesocycleWeek = completedWeek >= 6 ? 1 : completedWeek + 1;
    }

    setWorkouts(nextWorkouts);

    setProfile((prev) => ({
      ...prev,
      streakDays: prev.lastWorkoutDate === todayStr ? prev.streakDays : prev.streakDays + 1,
      lastWorkoutDate: todayStr,
      mesocycleWeek: nextMesocycleWeek,
    }));

    const nextSplit = getNextSplitDay(activeWorkout.splitDay, profile.programType);
    const nextSmartSession = generateSmartWorkoutSession(
      nextSplit,
      nextWorkouts,
      exercises,
      readiness.state,
      nextMesocycleWeek,
      profile.activeLocation || 'gym',
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
      profile.goalPhase,
      bodyweightEmaKg,
      profile.scheduledWeekLocations
    );
    setActiveWorkout(nextSmartSession);

    // Award completion XP
    addXp(
      completionAward.amount,
      `${completionAward.description} Next up: ${nextSplit} Split.`,
      completionAward.bonusTag
    );

    // If strength standard advanced, award it too
    if (strengthAdvanceAward) {
      setTimeout(() => {
        addXp(
          strengthAdvanceAward!.amount,
          strengthAdvanceAward!.description,
          strengthAdvanceAward!.bonusTag
        );
      }, 1500);
    }

    // If completing the week/mesocycle, award program milestone XP
    if (milestoneAward) {
      setTimeout(() => {
        addXp(
          milestoneAward!.amount,
          milestoneAward!.description,
          milestoneAward!.bonusTag
        );
      }, 3000);
    }
  };

  // Handler: Daily Weight Log (No illegitimate XP)
  const handleSaveWeight = (weight: number) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const existingIndex = biometrics.findIndex((b) => b.date === todayStr);

    let updatedBiometrics: BiometricLog[];
    if (existingIndex >= 0) {
      updatedBiometrics = biometrics.map((b, idx) =>
        idx === existingIndex ? { ...b, bodyweightKg: weight } : b
      );
    } else {
      updatedBiometrics = [
        ...biometrics,
        {
          ...latestBiometrics,
          date: todayStr,
          bodyweightKg: weight,
        },
      ];
    }

    setBiometrics(updatedBiometrics);
  };

  // Handler: Watch Sync Telemetry update (No illegitimate XP)
  const handleSyncCompleted = (newLog: BiometricLog, provider?: WearableProvider) => {
    const existingIndex = biometrics.findIndex((b) => b.date === newLog.date);
    let updated: BiometricLog[];
    if (existingIndex >= 0) {
      updated = biometrics.map((b, idx) => (idx === existingIndex ? newLog : b));
    } else {
      updated = [...biometrics, newLog];
    }

    setBiometrics(updated);

    if (provider) {
      setProfile((prev) => ({
        ...prev,
        wearableSource: provider,
        fitbitConnected: provider === 'fitbit' ? true : prev.fitbitConnected,
        whoopConnected: provider === 'whoop' ? true : prev.whoopConnected,
        healthConnectConnected: provider === 'health_connect' ? true : prev.healthConnectConnected,
        healthConnectLastSync:
          provider === 'health_connect' ? new Date().toISOString() : prev.healthConnectLastSync,
      }));
    }
  };

  // Handler: Reset demo seed data
  const handleResetData = () => {
    const reset = resetAllToSeedData();
    setProfile(reset.profile);
    setBiometrics(reset.biometrics);
    setWorkouts(reset.workouts);
    setActiveWorkout(reset.activeWorkout);
    setExercises(reset.exercises);
    setReadinessOverride(null);
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
    const todayStr = new Date().toISOString().split('T')[0];
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
    setReadinessOverride(null);
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
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    setActiveWorkout((prev) => ({
      ...prev,
      date: tomorrowStr,
    }));
  };

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

  return (
    <div className="min-h-screen bg-surface-bg text-slate-100 flex flex-col font-sans">
      {/* App Header */}
      <Header
        profile={profile}
        readinessState={readiness.state}
        onOpenWatchSync={() => setWatchModalOpen(true)}
        onOpenAICoach={() => setAiCoachOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Main Mobile Container */}
      <main className="flex-1 max-w-md mx-auto w-full px-3.5 pt-3">
        {activeTab === 'train' && (
          <TrainTab
            activeWorkout={activeWorkout}
            workouts={workouts}
            readiness={readiness}
            latestBiometrics={latestBiometrics}
            bodyweightEmaKg={bodyweightEmaKg}
            profile={profile}
            exerciseCatalog={exercises}
            onUpdateWorkout={setActiveWorkout}
            onSelectReadinessState={(st) => setReadinessOverride(st)}
            onSetCompleted={handleSetCompleted}
            onFinishWorkout={handleFinishWorkout}
            onShiftWorkout={handleShiftWorkout}
            onSwitchLocation={handleSwitchTrainingLocation}
            onOpenAICoach={() => setAiCoachOpen(true)}
            onOpenWatchSync={() => setWatchModalOpen(true)}
          />
        )}

        {activeTab === 'character' && (
          <CharacterTab
            profile={profile}
            pillarBestE1rm={pillarBestE1rm}
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
            onSaveWeight={handleSaveWeight}
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
              setActiveWorkout(recalibrated);
            }}
            onLaunchSplitDay={(sp) => handleSwitchSplitDay(sp, true)}
            onAddCustomExercise={(newEx) => setExercises((prev) => [...prev, newEx])}
            onResetData={handleResetData}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onDeleteAllData={handleDeleteAllData}
            onOpenOnboarding={() => {
              setOnboardingInitialStep(4);
              setOnboardingOpen(true);
            }}
          />
        )}
      </main>

      {/* AI Assistant Conversational Chat Modal */}
      {aiCoachOpen && (
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

      {/* Floating Rest Timer with Simulated 60% Max HR Ready Indicator */}
      {restTimerOpen && (
        <RestTimerModal
          initialSeconds={90}
          maxHr={profile.maxHr}
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
            setAiCoachOpen(true);
          } else {
            setActiveTab(tab);
            setAiCoachOpen(false);
          }
        }}
        isChatOpen={aiCoachOpen}
        onOpenAICoach={() => setAiCoachOpen(true)}
      />
    </div>
  );
};

export default App;
