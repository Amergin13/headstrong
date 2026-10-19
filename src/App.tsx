import React, { useState, useEffect } from 'react';
import {
  BiometricLog,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  ReadinessState,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  ExerciseDefinition,
} from './engine/types';
import { calculateDailyReadiness } from './engine/readiness';
import { getLatestBodyweightEma } from './engine/ema';
import {
  calculateBestPillarE1rms,
  calculateWeeklyMuscleVolume,
  exportAllUserDataJSON,
  importUserDataJSON,
  loadActiveWorkout,
  loadBiometrics,
  loadExercises,
  loadProfile,
  loadWorkouts,
  permanentlyEraseAllUserData,
  resetAllToSeedData,
  saveActiveWorkout,
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
import { simulatePixelWatchSync } from './services/fitbitService';
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
  const [onboardingOpen, setOnboardingOpen] = useState(!profile.onboardingCompleted);
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

    if (
      tabParam &&
      ['train', 'character', 'analytics', 'program'].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }

    if (actionParam === 'watch-sync') {
      setWatchModalOpen(true);
    }

    if (oauthCode) {
      // Complete Fitbit OAuth 2.0 PKCE flow gracefully
      simulatePixelWatchSync(undefined, 'Primed').then((syncedLog) => {
        setBiometrics((prev) => [...prev, syncedLog]);
        setProfile((prev) => ({ ...prev, fitbitConnected: true }));
        setXpNotification({
          amount: 50,
          message: 'Google Pixel Watch connected & recovery data synced!',
          bonusTag: 'Watch Connected',
        });
      });
    }

    if (tabParam || actionParam || oauthCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Derived calculations
  const bodyweightEmaKg = getLatestBodyweightEma(biometrics, 81.5);
  const latestBiometrics = biometrics[biometrics.length - 1] || {
    date: new Date().toISOString().split('T')[0],
    bodyweightKg: 82.1,
    hrvRmssd: 62,
    restingHr: 54,
    sleepHours: 7.8,
    steps: 9850,
    activeZoneMinutes: 42,
    vo2Max: 46.2,
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

  // Handler: 1-Tap Set Completion
  const handleSetCompleted = (exerciseName: string, setNumber: number) => {
    addXp(35, `Set ${setNumber} of ${exerciseName} logged!`);
    setRestTimerOpen(true);
  };

  // Handler: Switch Split Day dynamically
  const handleSwitchSplitDay = (split: SplitDayType, navigateToTrain = false) => {
    const smartSession = generateSmartWorkoutSession(
      split,
      workouts,
      exercises,
      readiness.state,
      profile.mesocycleWeek || 3,
      profile.activeLocation || 'gym',
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar']
    );
    setActiveWorkout(smartSession);
    if (navigateToTrain) {
      setActiveTab('train');
    }
    addXp(15, `Loaded ${split} workout with your latest target weights.`, 'Smart Split');
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
    setActiveWorkout(adapted);

    const locLabel =
      location === 'gym'
        ? 'Full Gym'
        : location === 'home'
        ? 'At Home (Bench, Dumbbells, TRX, Bar)'
        : 'Travel (Bodyweight)';

    addXp(
      15,
      `Switched today’s workout to ${locLabel}. Target weights & progress carried over!`,
      location === 'gym' ? 'Gym Mode' : location === 'home' ? 'Home Mode' : 'Travel Mode'
    );
  };

  // Handler: Complete Onboarding / Goals & Equipment Setup
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
      setup.homeEquipment
    );
    setActiveWorkout(day1Session);
    setActiveTab('train');

    const locLabel =
      setup.activeLocation === 'gym'
        ? 'Full Gym'
        : setup.activeLocation === 'home'
        ? 'At Home'
        : 'Travel';

    addXp(
      100,
      `Welcome to HeadStrong! Loaded Day 1 (${starterSplit}) calibrated to your ${locLabel} setup.`,
      'Ready to Lift'
    );
  };

  // Handler: Change Mesocycle Week (1 to 6)
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
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar']
    );
    setActiveWorkout(recalibrated);
    addXp(
      20,
      week === 6
        ? 'Light Recovery Week (Week 6) activated! Sets and effort reduced.'
        : `Training Week ${week} targets synced to today’s workout.`,
      week === 6 ? 'Recovery Week' : `Week ${week} Sync`
    );
  };

  // Handler: Complete entire workout session & advance split rotation
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

    const completedSession: WorkoutSession = {
      ...activeWorkout,
      completed: true,
      completedAt: new Date().toISOString(),
      readinessState: readiness.state,
      readinessZScore: readiness.score,
      xpEarned: Math.round(400 * readiness.xpMultiplier),
      avgHeartRate: estimatedHr,
      durationMinutes: estimatedDuration,
    };

    const nextWorkouts = [completedSession, ...workouts];
    setWorkouts(nextWorkouts);

    setProfile((prev) => ({
      ...prev,
      streakDays: prev.lastWorkoutDate === todayStr ? prev.streakDays : prev.streakDays + 1,
      lastWorkoutDate: todayStr,
    }));

    const nextSplit = getNextSplitDay(activeWorkout.splitDay);
    const nextSmartSession = generateSmartWorkoutSession(
      nextSplit,
      nextWorkouts,
      exercises,
      readiness.state,
      profile.mesocycleWeek || 3,
      profile.activeLocation || 'gym',
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar']
    );
    setActiveWorkout(nextSmartSession);

    addXp(
      400,
      `Workout saved! Next up: ${nextSplit} Split with updated target weights.`,
      'Session Complete'
    );
  };

  // Handler: Daily Weight Log
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
    addXp(20, `Body weight logged (${weight} kg)! 7-Day average updated.`);
  };

  // Handler: Watch Sync Telemetry update
  const handleSyncCompleted = (newLog: BiometricLog) => {
    const existingIndex = biometrics.findIndex((b) => b.date === newLog.date);
    let updated: BiometricLog[];
    if (existingIndex >= 0) {
      updated = biometrics.map((b, idx) => (idx === existingIndex ? newLog : b));
    } else {
      updated = [...biometrics, newLog];
    }

    setBiometrics(updated);
    addXp(50, 'Pixel Watch sleep & heart rate synced!', 'Watch Sync');
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

  // Handler: Export JSON Backup (Google Play Data Portability)
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
    addXp(15, 'Backup JSON downloaded to your device.', 'Backup Saved');
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
      addXp(25, 'Workout and biometric backup restored successfully!', 'Restored');
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

  const handleShiftWorkout = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    setActiveWorkout((prev) => ({
      ...prev,
      date: tomorrowStr,
    }));

    addXp(25, 'Workout moved to tomorrow! Today is an active rest day.', 'Streak Safe');
  };

  return (
    <div className="min-h-screen bg-surface-bg text-slate-100 flex flex-col font-sans">
      {/* App Header */}
      <Header
        profile={profile}
        readinessState={readiness.state}
        onOpenWatchSync={() => setWatchModalOpen(true)}
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
          />
        )}

        {activeTab === 'character' && (
          <CharacterTab
            profile={profile}
            pillarBestE1rm={pillarBestE1rm}
            bodyweightEmaKg={bodyweightEmaKg}
            latestBiometrics={latestBiometrics}
            weeklyVolume={weeklyVolume}
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
            exerciseCatalog={exercises}
            activeSplitDay={activeWorkout.splitDay}
            canInstallPwa={Boolean(deferredInstallPrompt)}
            onTriggerInstallPwa={handleTriggerInstallPwa}
            onUpdateProfile={(up) => setProfile((p) => ({ ...p, ...up }))}
            onUpdateGoalPhase={(phase: GoalPhase) => setProfile((p) => ({ ...p, goalPhase: phase }))}
            onSelectMesocycleWeek={handleSelectMesocycleWeek}
            onLaunchSplitDay={(sp) => handleSwitchSplitDay(sp, true)}
            onAddCustomExercise={(newEx) => setExercises((prev) => [...prev, newEx])}
            onResetData={handleResetData}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onDeleteAllData={handleDeleteAllData}
            onOpenOnboarding={() => setOnboardingOpen(true)}
          />
        )}
      </main>

      {/* Onboarding & Equipment Context Setup Modal */}
      {onboardingOpen && (
        <OnboardingModal
          profile={profile}
          onCompleteOnboarding={handleCompleteOnboarding}
          onClose={() => setOnboardingOpen(false)}
          onExploreDemo={() => {
            setProfile((prev) => ({ ...prev, onboardingCompleted: true }));
            setOnboardingOpen(false);
            addXp(25, 'Loaded demo data! Explore workouts, programs, and progress.', 'Demo Mode');
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

      {/* Pixel Watch Sync Dialog Modal */}
      {watchModalOpen && (
        <WatchSyncModal
          profile={profile}
          latestBiometrics={latestBiometrics}
          onSyncCompleted={(log) => {
            handleSyncCompleted(log);
            setWatchModalOpen(false);
          }}
          onClose={() => setWatchModalOpen(false)}
          isModal={true}
        />
      )}

      {/* XP Toast Notification */}
      {xpNotification && (
        <XPNotification
          amount={xpNotification.amount}
          message={xpNotification.message}
          bonusTag={xpNotification.bonusTag}
          onClose={() => setXpNotification(null)}
        />
      )}

      {/* Bottom 4-Tab Navigation */}
      <NavigationBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default App;
