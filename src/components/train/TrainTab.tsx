import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PageTopGradient } from '../common/PageTopGradient';
import {
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
  MuscleGroup,
  WorkoutDisplaySettings,
  DEFAULT_WORKOUT_DISPLAY_SETTINGS,
  resolveWorkoutDisplaySettings,
  isWearableConnected,
  isWhoopConfigured,
} from '../../engine/types';
import { ReadinessEvaluation } from '../../engine/readiness';
import { ReadinessBanner } from './ReadinessBanner';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseDetailModal } from './ExerciseDetailModal';
import { ExerciseSwapModal } from './ExerciseSwapModal';
import { PlateCalculatorModal } from './PlateCalculatorModal';
import { WorkoutFinishScreen } from './WorkoutFinishScreen';
import { buildCompletedExerciseSummaries, buildWorkoutFinish } from '../../services/workoutFinish';
import {
  WhoopWorkoutStrainSummary,
  fetchWhoopWorkoutStrain,
} from '../../services/whoopService';
import {
  computeMuscleRecovery,
  evaluateSessionRecovery,
  formatReadyTime,
  MUSCLE_FRIENDLY_NAMES,
  READY_THRESHOLD, getWorkoutCompletedAt } from '../../engine/recovery';
import { TrainingPlan, getSessionPlanId, planWorkoutLabel } from '../../engine/muscleBuildingProgram';
import { ActivityLog, activeDayDates, qualifiesAsActiveDay } from '../../engine/activeDays';
import { localDateOffset, localDateString, parseLocalDate } from '../../utils/date';
import { formatSentenceCase } from '../../utils/typography';
import { stepsOnDate } from '../../services/athleteGoals';
import { ActiveDayCard } from './ActiveDayCard';
import { startingWeightForNewExercise } from '../../services/sessionPreparation';
import { useUnits } from '../../utils/unitsContext';
import {
  prescribeDoubleProgression,
  findLastCompletedExerciseSession,
  getMovementFamilyLabel,
  getMovementVectorId,
  getSessionProgressNarrative,
  prescribeExerciseSwap,
  SwapPrescription,
} from '../../engine/progression';
import { calculateSubTierQuest, standardsAge } from '../../engine/strengthStandards';
import {
  calculateE1RM,
  isTimedExercise,
} from '../../engine/e1rm';
import { buildAthleteKnowledgeGraph, getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import { calculateSessionTonnage } from '../../engine/wci';
import { CompletedExerciseCard, FinishedWorkoutSummaryCard, WhoopStrainCard } from './FinishedWorkoutCards';
import { WorkoutPageHeader } from './WorkoutPageHeader';
import { CurrentSessionCard, ProgramProgressCard, StickySessionHeader } from './ProgramProgressCard';
import { RecoveryScoreCard } from './RecoveryScoreCard';
import { buildWeekStrip } from '../../services/sessionSchedule';
import { buildExerciseInsight, getPreviousWorkingSets } from '../../services/exerciseInsight';
import {
  acceptExerciseNote,
  buildExerciseNoteFacts,
  cacheExerciseNote,
  generateExerciseNote,
  getCachedExerciseNote,
} from '../../services/exerciseCoachNote';
import { detectCoachInterventions } from '../../services/coachInterventions';
import { isOnDeviceModelReady } from '../../services/onDeviceModel';
import '../../services/deviceModels';
import {
  calculateWarmupPrescription,
  ensureWarmupSetsOnExercise,
  generateWarmupSets,
  isFirstCompoundForPillar,
} from '../../engine/warmup';
import {
  getSplitDaysForProgram,
  SplitDayType,
} from '../../services/workoutGenerator';
import {
  CheckCircle2,
  Check,
  Plus,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Calendar,
  History,
  ChevronRight,
  Footprints,
  Moon,
  BedDouble,
  SlidersHorizontal,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface TrainTabProps {
  /** The athlete's 6-week plan (see resolveActivePlan). */
  trainingPlan: TrainingPlan;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  readiness: ReadinessEvaluation;
  latestBiometrics: BiometricLog;
  /** Full biometric history, used for the athlete's knowledge graph. */
  biometrics?: BiometricLog[];
  bodyweightEmaKg: number;
  profile: UserProfile;
  exerciseCatalog: ExerciseDefinition[];
  onUpdateWorkout: (updated: WorkoutSession) => void;
  onSetCompleted: (
    exerciseName: string,
    setNumber: number,
    completedSet?: WorkoutSet,
    exercise?: ExerciseSession
  ) => void;
  onFinishWorkout: (whoopTelemetry?: WhoopWorkoutStrainSummary) => void;
  onShiftWorkout: () => void;
  onSwitchLocation?: (location: TrainingLocation) => void;
  onOpenWatchSync?: () => void;
  /** Opens the Program tab (plan overview, weeks, splits). */
  onOpenProgram?: () => void;
  /** Swap today's queued session for another split day (standard splits only). */
  onSwitchSplitDay?: (split: SplitDayType) => void;
  /** Saves personal defaults (e.g. Workout page layout settings) to the athlete's profile. */
  onUpdateProfile?: (update: Partial<UserProfile>) => void;
  /** Active days (rides, runs, walks, classes), kept alongside lifting workouts. */
  activities?: ActivityLog[];
  /** Opens the manual activity logger (running, cycling, walking, swimming, etc.). */
  onLogActivity?: () => void;
  /** Opens the Activity apps connections modal (Strava, Health Connect, Watch). */
  onOpenActivityApps?: () => void;
  /** Removes a logged activity by ID. */
  onRemoveActivity?: (id: string) => void;
  /** Opens Progress -> Training insights (optionally focused on an exercise's notes history). */
  onOpenInsights?: (exerciseId?: string) => void;
  /** Opens Treise coach with a pre-filled OOUX HITL intervention prompt. */
  onOpenCoachIntervention?: (opts: { prompt: string; exerciseId?: string }) => void;
}

/** Primary muscles each split day trains, used to suggest a recovered alternative. */
const SPLIT_TARGET_MUSCLES: Record<SplitDayType, MuscleGroup[]> = {
  Push: ['Chest', 'Shoulders', 'Triceps', 'Side Delts'],
  Pull: ['Back', 'Rear Delts', 'Biceps'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  Upper: ['Chest', 'Back', 'Side Delts', 'Biceps'],
};

const PROGRAM_TITLES: Record<string, string> = {
  ppl_upper: 'Push / Pull / Legs + Upper',
  ppl: 'Push / Pull / Legs',
  upper_lower: 'Upper / Lower',
  full_body: 'Full Body',
};

const MESO_WEEK_PHASE_NAMES: Record<number, { name: string; rule: string; description: string }> = {
  1: { name: 'Smooth start', rule: 'Base sets • Leave 2–3 reps in the tank', description: 'Base sets across your lifts, leaving 2–3 reps in the tank to build momentum.' },
  2: { name: 'Building up', rule: 'Adding sets • Leave 2 reps in the tank', description: 'Adding steady volume across movements while keeping 2 reps in reserve.' },
  3: { name: 'Main growth phase', rule: 'Target zone • Leave 1–2 reps in the tank', description: 'Training in your main growth zone with 1–2 reps in reserve on working sets.' },
  4: { name: 'High effort phase', rule: 'High sets • Leave 1 rep in the tank', description: 'Higher weekly sets and heavier effort, stopping about 1 rep short of failure.' },
  5: { name: 'Peak week', rule: 'Peak sets • Leave 0–1 reps in the tank', description: 'Peak training volume and intensity before next week’s recovery deload.' },
  6: { name: 'Light recovery week', rule: 'Half sets • Leave 3–4 easy reps in the tank', description: 'Reduced sets and lighter effort to shed fatigue and lock in progress.' },
};

export const TrainTab: React.FC<TrainTabProps> = ({
  trainingPlan,
  activities = [],
  activeWorkout,
  workouts,
  readiness,
  latestBiometrics,
  biometrics = [],
  bodyweightEmaKg,
  profile,
  exerciseCatalog,
  onUpdateWorkout,
  onSetCompleted,
  onFinishWorkout,
  onShiftWorkout,
  onSwitchLocation,
  onOpenWatchSync,
  onOpenProgram,
  onSwitchSplitDay,
  onUpdateProfile,
  onLogActivity,
  onOpenActivityApps,
  onRemoveActivity,
  onOpenInsights,
  onOpenCoachIntervention,
}) => {
  const units = useUnits();
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [swappingExercise, setSwappingExercise] = useState<ExerciseSession | null>(null);
  const [plateCalcWeight, setPlateCalcWeight] = useState<number | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [previewPastWorkout, setPreviewPastWorkout] = useState<WorkoutSession | null>(null);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [showWorkoutDisplayModal, setShowWorkoutDisplayModal] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [whoopStrainSummary, setWhoopStrainSummary] = useState<WhoopWorkoutStrainSummary | null>(null);
  const [isSyncingWhoopStrain, setIsSyncingWhoopStrain] = useState(false);
  const [selectedStripDate, setSelectedStripDate] = useState<string | null>(null);

  const workoutDisplay = useMemo(
    () => resolveWorkoutDisplaySettings(profile.workoutDisplay),
    [profile.workoutDisplay]
  );
  const activeDisplayCount = [
    workoutDisplay.showProgramCard,
    workoutDisplay.showSessionCard,
    workoutDisplay.showRecoveryCard,
    workoutDisplay.showExerciseSummaries,
    workoutDisplay.showExerciseCharts,
    workoutDisplay.showStepsCard,
  ].filter(Boolean).length;
  const isDefaultWorkoutDisplay =
    workoutDisplay.showProgramCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showProgramCard &&
    workoutDisplay.showSessionCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showSessionCard &&
    workoutDisplay.showRecoveryCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showRecoveryCard &&
    workoutDisplay.showExerciseSummaries === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showExerciseSummaries &&
    workoutDisplay.showExerciseCharts === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showExerciseCharts &&
    workoutDisplay.showStepsCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showStepsCard;

  const handleToggleWorkoutDisplay = (key: keyof WorkoutDisplaySettings) => {
    const next: WorkoutDisplaySettings = {
      ...workoutDisplay,
      [key]: !workoutDisplay[key],
    };
    onUpdateProfile?.({ workoutDisplay: next });
  };

  const handleResetWorkoutDisplay = () => {
    onUpdateProfile?.({ workoutDisplay: undefined });
  };

  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));

  const handleUpdateSet = (exerciseId: string, setId: string, updated: Partial<WorkoutSet>) => {
    const nextExercises = activeWorkout.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;

      const updatedSets = ex.sets.map((s) => (s.id === setId ? { ...s, ...updated } : s));

      if (updated.completed) {
        const completedIndex = updatedSets.findIndex((s) => s.id === setId);
        const sourceSet = updatedSets[completedIndex];
        if (sourceSet && sourceSet.setType !== 'warmup' && !sourceSet.isWarmup) {
          const sourceWeight = sourceSet.actualWeightKg ?? sourceSet.targetWeightKg;
          const sourceReps = sourceSet.actualReps ?? sourceSet.targetReps;
          const sourceDuration = sourceSet.actualDurationSeconds ?? sourceSet.targetDurationSeconds;
          const sourceRir = sourceSet.actualRir ?? sourceSet.targetRir ?? 2;

          for (let i = completedIndex + 1; i < updatedSets.length; i++) {
            if (!updatedSets[i].completed && updatedSets[i].setType !== 'warmup') {
              updatedSets[i] = {
                ...updatedSets[i],
                targetWeightKg: sourceWeight,
                actualWeightKg: sourceWeight,
                targetReps: sourceReps,
                actualReps: sourceReps,
                ...(sourceDuration !== undefined
                  ? { targetDurationSeconds: sourceDuration, actualDurationSeconds: sourceDuration }
                  : {}),
                targetRir: sourceRir,
                actualRir: sourceRir,
              };
            }
          }
        }
      }

      return {
        ...ex,
        sets: updatedSets,
      };
    });
    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
  };

  const handleUpdateExerciseNotes = (exerciseId: string, athleteNotes: string) => {
    const nextExercises = activeWorkout.exercises.map((ex) =>
      ex.id === exerciseId ? { ...ex, athleteNotes } : ex
    );
    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
  };

  const handleAddSet = (exerciseId: string, isWarmup = false) => {
    const nextExercises = activeWorkout.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;
      const workingSets = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
      const firstWorkingSet = workingSets[0] ?? ex.sets[0];
      const baseWeight = firstWorkingSet?.actualWeightKg ?? firstWorkingSet?.targetWeightKg ?? 20;

      if (isWarmup) {
        const isDumbbell = ex.equipment === 'dumbbell';
        const isPureBw = ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic;
        const prescription = calculateWarmupPrescription(ex, baseWeight, false);
        const suggested = prescription.sets[0];
        const warmupWeight = isPureBw
          ? 0
          : suggested?.weightKg ?? Math.max(isDumbbell ? 8 : 20, Math.round((baseWeight * 0.6) / 2.5) * 2.5);
        const warmupReps = suggested?.reps ?? 6;
        const warmupRir = suggested?.rir ?? 3;

        const warmupSet: WorkoutSet = {
          id: `set-warmup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          setNumber: 1,
          targetWeightKg: warmupWeight,
          actualWeightKg: warmupWeight,
          targetReps: warmupReps,
          actualReps: warmupReps,
          targetRir: warmupRir,
          actualRir: warmupRir,
          completed: false,
          isWarmup: true,
          setType: 'warmup',
        };
        const combined = [warmupSet, ...ex.sets].map((s, idx) => ({
          ...s,
          setNumber: idx + 1,
        }));
        return {
          ...ex,
          sets: combined,
        };
      }

      const lastWorkingSet = workingSets[workingSets.length - 1] ?? ex.sets[ex.sets.length - 1];
      const newWeight = lastWorkingSet?.actualWeightKg ?? lastWorkingSet?.targetWeightKg ?? baseWeight;
      const newReps = lastWorkingSet?.actualReps ?? lastWorkingSet?.targetReps ?? ex.minReps;
      const timed = isTimedExercise(ex);
      const holdSecs =
        lastWorkingSet?.actualDurationSeconds ??
        lastWorkingSet?.targetDurationSeconds ??
        ex.durationSeconds ??
        45;
      const newSet: WorkoutSet = {
        id: `set-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        setNumber: ex.sets.length + 1,
        targetWeightKg: newWeight,
        actualWeightKg: newWeight,
        targetReps: timed ? 1 : newReps,
        actualReps: timed ? 1 : newReps,
        ...(timed ? { targetDurationSeconds: holdSecs, actualDurationSeconds: holdSecs } : {}),
        targetRir: 2,
        actualRir: 2,
        completed: false,
        setType: 'working',
      };
      return {
        ...ex,
        sets: [...ex.sets, newSet],
      };
    });
    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
  };

  const buildBaseExerciseSession = (def: ExerciseDefinition): ExerciseSession => {
    const meta = getExerciseBiomechanicalMeta(def);
    const isPureBw = def.equipment === 'bodyweight' && !def.isWeightedCalisthenic;
    const timed = isTimedExercise(def);
    const holdSeconds = def.defaultDurationSeconds || 45;
    const defaultSeedWeight = isPureBw ? 0 : def.equipment === 'dumbbell' ? 16 : 40;
    return {
      id: `active-ex-${Date.now()}`,
      exerciseId: def.id,
      name: def.name,
      pillar: def.pillar,
      equipment: def.equipment,
      isRdl: def.isRdl,
      isWeightedCalisthenic: def.isWeightedCalisthenic,
      isIsolation: meta.isIsolation,
      movementFamily: getMovementVectorId(def),
      movementFamilyLabel: getMovementFamilyLabel(def),
      resistanceProfile: meta.resistanceProfile,
      sfrScore: meta.sfrScore,
      minReps: timed ? 1 : def.defaultRepRange[0],
      maxReps: timed ? 1 : def.defaultRepRange[1],
      ...(timed
        ? {
            repTargetType: 'duration' as const,
            durationSeconds: holdSeconds,
            tempo: `${holdSeconds}sec`,
          }
        : {}),
      notes: timed
        ? `Hold with controlled tension for ${holdSeconds}s per set.`
        : meta.resistanceProfile === 'lengthened'
        ? 'Focus on a controlled stretch at the bottom of each rep.'
        : 'Keep a steady, controlled pace on every rep.',
      sets: [1, 2, 3].map((n) => ({
        id: `s-${Date.now()}-${n}`,
        setNumber: n,
        targetWeightKg: defaultSeedWeight,
        targetReps: timed ? 1 : def.defaultRepRange[0],
        targetRir: n === 3 ? 1 : 2,
        ...(timed
          ? { targetDurationSeconds: holdSeconds, actualDurationSeconds: holdSeconds }
          : {}),
        completed: false,
        setType: 'working' as const,
      })),
    };
  };

  const resolveNewExerciseFallbackWeight = (def: ExerciseDefinition): number | undefined => {
    const isPureBw = def.equipment === 'bodyweight' && !def.isWeightedCalisthenic;
    if (isPureBw) return 0;
    const seedEx = buildBaseExerciseSession(def);
    return (
      startingWeightForNewExercise(activeWorkout, seedEx, {
        history: workouts,
        bodyweightKg: bodyweightEmaKg,
        readinessState: readiness.state,
        gender: profile.gender,
        experienceLevel: profile.experienceLevel,
        unit: units.unit,
      }) ?? undefined
    );
  };

  const handleAddExerciseToSession = (def: ExerciseDefinition) => {
    triggerHaptic('medium');
    const isPureBw = def.equipment === 'bodyweight' && !def.isWeightedCalisthenic;
    const timed = isTimedExercise(def);
    const seedEx = buildBaseExerciseSession(def);

    const prescription = prescribeDoubleProgression(
      seedEx,
      readiness.state,
      workouts,
      bodyweightEmaKg,
      profile.goalPhase
    );
    // Never done before: its own default scaled to the athlete, not a number from a similar movement.
    const ownHistory = findLastCompletedExerciseSession(def.id, workouts);
    const startingWeight = ownHistory
      ? null
      : resolveNewExerciseFallbackWeight(def);
    const nextWeight = isPureBw ? 0 : startingWeight ?? prescription.nextWeightKg;
    const timedHoldSecs = def.defaultDurationSeconds || 45;
    const baseHydratedEx: ExerciseSession = {
      ...seedEx,
      sets: seedEx.sets.map((s, idx) => ({
        ...s,
        targetWeightKg: nextWeight,
        actualWeightKg: nextWeight,
        targetReps: timed ? 1 : (prescription.nextTargetReps[idx] ?? def.defaultRepRange[0]),
        actualReps: timed ? 1 : (prescription.nextTargetReps[idx] ?? def.defaultRepRange[0]),
        ...(timed
          ? { targetDurationSeconds: timedHoldSecs, actualDurationSeconds: timedHoldSecs }
          : {}),
      })),
    };

    const isFirstCompound = isFirstCompoundForPillar(
      baseHydratedEx,
      activeWorkout.exercises.length,
      [...activeWorkout.exercises, baseHydratedEx]
    );

    const hydratedEx = timed ? baseHydratedEx : ensureWarmupSetsOnExercise(baseHydratedEx, isFirstCompound);

    onUpdateWorkout({
      ...activeWorkout,
      exercises: [...activeWorkout.exercises, hydratedEx],
    });
    setShowAddExerciseModal(false);
  };

  const handleConfirmSwap = (
    newDef: ExerciseDefinition,
    convertedWeightKg: number,
    explicitPrescription?: SwapPrescription
  ) => {
    if (!swappingExercise) return;
    const meta = getExerciseBiomechanicalMeta(newDef);
    const rx =
      explicitPrescription ??
      prescribeExerciseSwap({
        sourceExercise: swappingExercise,
        targetDef: newDef,
        workouts,
        readinessState: readiness.state,
        goalPhase: profile.goalPhase,
        bodyweightEmaKg,
        location: activeWorkout.location || profile.activeLocation || 'gym',
        unit: units.unit,
        fallbackTargetWeightKg: convertedWeightKg > 0 ? convertedWeightKg : resolveNewExerciseFallbackWeight(newDef),
      });

    const isPureBw = rx.isPureBodyweight;
    const effectiveTargetWeight = isPureBw ? 0 : rx.targetWeightKg;
    const defaultTargetReps = rx.targetReps;
    const timed = rx.isTimed;

    const customNotes = timed
      ? rx.rationale
      : rx.tempoCue
      ? `${rx.tempoCue}. ${rx.rationale}.`
      : meta.resistanceProfile === 'lengthened'
      ? `${rx.rationale}. Focus on a controlled stretch at the bottom of each rep.`
      : `${rx.rationale}. Keep a steady, controlled pace on every rep.`;

    const nextExercises = activeWorkout.exercises.flatMap((ex, exIdx) => {
      if (ex.id !== swappingExercise.id) return [ex];

      // Logged sets stay on the exercise that was done; only the sets still to do move to the new one.
      const loggedSets = ex.sets.filter((s) => s.completed);
      const setsToDo = ex.sets.filter((s) => !s.completed);
      const workingSetsOnly = setsToDo.filter((s) => !s.isWarmup && s.setType !== 'warmup');
      if (workingSetsOnly.length === 0) return [ex];

      const calibratedWorkingSets: WorkoutSet[] = workingSetsOnly.map((s, sIdx) => ({
        ...s,
        setNumber: sIdx + 1,
        targetWeightKg: effectiveTargetWeight,
        actualWeightKg: effectiveTargetWeight,
        targetReps: timed ? 1 : defaultTargetReps,
        actualReps: timed ? 1 : defaultTargetReps,
        targetRir: rx.targetRir,
        actualRir: rx.targetRir,
        ...(timed
          ? {
              targetDurationSeconds: rx.targetDurationSeconds || 45,
              actualDurationSeconds: rx.targetDurationSeconds || 45,
            }
          : {
              targetDurationSeconds: undefined,
              actualDurationSeconds: undefined,
            }),
        isWarmup: false,
        setType: 'working' as const,
      }));

      // Keep the same structure as before the swap: only re-create warm-ups if the original
      // exercise had them, and never add more than it had.
      const originalWarmupCount = setsToDo.filter((st) => st.isWarmup || st.setType === 'warmup').length;
      let calibratedSets: WorkoutSet[] = calibratedWorkingSets;
      if (originalWarmupCount > 0 && !isPureBw && !meta.isIsolation && !timed) {
        const isFirstCompound = isFirstCompoundForPillar(
          {
            pillar: newDef.pillar,
            isIsolation: meta.isIsolation,
            equipment: newDef.equipment,
            isWeightedCalisthenic: newDef.isWeightedCalisthenic,
            name: newDef.name,
            exerciseId: newDef.id,
          },
          exIdx,
          activeWorkout.exercises
        );
        const warmupPrescription = calculateWarmupPrescription(
          {
            pillar: newDef.pillar,
            equipment: newDef.equipment,
            isIsolation: meta.isIsolation,
            isWeightedCalisthenic: newDef.isWeightedCalisthenic,
            name: newDef.name,
            exerciseId: newDef.id,
          },
          effectiveTargetWeight,
          isFirstCompound
        );
        const warmupSets = generateWarmupSets(newDef.id, warmupPrescription).slice(-originalWarmupCount);
        calibratedSets = [...warmupSets, ...calibratedWorkingSets].map((st, i) => ({ ...st, setNumber: i + 1 }));
      }

      const replacement: ExerciseSession = {
        ...ex,
        exerciseId: newDef.id,
        name: newDef.name,
        pillar: newDef.pillar,
        equipment: isPureBw ? 'bodyweight' : newDef.equipment,
        isRdl: newDef.isRdl,
        isWeightedCalisthenic: isPureBw ? false : newDef.isWeightedCalisthenic,
        isIsolation: meta.isIsolation,
        movementFamily: getMovementVectorId(newDef),
        movementFamilyLabel: getMovementFamilyLabel(newDef),
        resistanceProfile: meta.resistanceProfile,
        sfrScore: meta.sfrScore,
        minReps: rx.minReps,
        maxReps: rx.maxReps,
        repTargetType: timed ? 'duration' : 'reps',
        durationSeconds: timed ? rx.targetDurationSeconds : undefined,
        tempo: timed && rx.targetDurationSeconds ? `${rx.targetDurationSeconds}sec` : undefined,
        notes: customNotes,
        athleteNotes: ex.athleteNotes,
        sets: calibratedSets,
      };
      if (loggedSets.length === 0) return [replacement];
      return [{ ...ex, sets: loggedSets }, { ...replacement, id: `${ex.id}-swap-${Date.now()}` }];
    });

    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
    setSwappingExercise(null);
  };

  const totalSets = activeWorkout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  const completedSets = activeWorkout.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0
  );

  const bwForTonnage = biometrics.some((b) => (b.bodyweightKg || 0) > 0) ? bodyweightEmaKg : 0;
  const liveTonnageKg = Math.round(calculateSessionTonnage(activeWorkout, bwForTonnage).tonnageKg);

  // Prescriptions look only at past sessions; sets ticked today must not change the target or PREV.
  const exercisePrescriptions = activeWorkout.exercises.map((ex) => {
    const prescription = prescribeDoubleProgression(
      { ...ex, sets: ex.sets.map((st) => ({ ...st, completed: false })) },
      readiness.state,
      workouts,
      bodyweightEmaKg,
      profile.goalPhase
    );
    return { ex, prescription };
  });

  const mesoWeek = profile.mesocycleWeek || 1;
  const sessionNarrative = useMemo(
    () =>
      getSessionProgressNarrative(
        mesoWeek,
        profile.goalPhase || 'Lean Bulk',
        readiness.state
      ),
    [mesoWeek, profile.goalPhase, readiness.state]
  );

  const activeWorkoutRef = useRef(activeWorkout);
  activeWorkoutRef.current = activeWorkout;
  const whoopConfigured = isWhoopConfigured(profile);

  const syncWhoopWorkoutTelemetry = useCallback(() => {
    if (!profile.whoopAccessToken) return;
    setIsSyncingWhoopStrain(true);
    const setTimes = activeWorkoutRef.current.exercises
      .flatMap((ex) => ex.sets)
      .filter((st) => st.completed && st.completedAt)
      .map((st) => new Date(st.completedAt as string).getTime())
      .filter((t) => !Number.isNaN(t));
    const end = new Date().toISOString();
    const start = new Date(setTimes.length > 0 ? Math.min(...setTimes) : Date.now() - 60 * 60 * 1000).toISOString();
    fetchWhoopWorkoutStrain(profile.whoopAccessToken, profile.whoopRefreshToken, { start, end })
      .then((summary) => {
        setWhoopStrainSummary(summary);
      })
      .catch((err) => {
        console.warn('Could not auto-fetch live Whoop workout strain:', err);
      })
      .finally(() => {
        setIsSyncingWhoopStrain(false);
      });
  }, [profile.whoopAccessToken, profile.whoopRefreshToken]);

  const handleFinishWorkoutClick = () => {
    triggerHaptic('success');
    setWhoopStrainSummary(null);
    setShowSummaryModal(true);

    if (whoopConfigured && profile.whoopAccessToken) {
      syncWhoopWorkoutTelemetry();
    }
  };

  const handleCloseSummary = () => {
    setShowSummaryModal(false);
    const syncedTelemetry = whoopStrainSummary || undefined;
    setWhoopStrainSummary(null);
    onFinishWorkout(syncedTelemetry);
  };

  // What the finish screen shows, built once when it opens (the workout is saved when it closes).
  const workoutFinish = useMemo(
    () =>
      showSummaryModal
        ? buildWorkoutFinish({
            profile,
            workouts,
            finished: activeWorkout,
            activities,
            biometrics,
            exerciseCatalog,
            bodyweightKg: biometrics.some((b) => (b.bodyweightKg || 0) > 0) ? bodyweightEmaKg : undefined,
            formatWeight: (kg) => units.formatPrecise(kg),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showSummaryModal]
  );

  const phaseMeta = MESO_WEEK_PHASE_NAMES[mesoWeek] || MESO_WEEK_PHASE_NAMES[3];
  const recentCompletedWorkouts = workouts.filter((w) => w.completed).slice(0, 4);
  const currentLoc = activeWorkout.location || profile.activeLocation || 'gym';

  // Recovery gate: after a workout, the next queued session waits until its muscles recover.
  const recoveryGate = evaluateSessionRecovery(activeWorkout, workouts, exerciseCatalog);
  const showRecoveryGate =
    !recoveryGate.isReady && completedSets === 0 && !activeWorkout.recoveryOverride;
  const recoveredAlternative: SplitDayType | null = (() => {
    if (!onSwitchSplitDay || recoveryGate.trainedToday) return null;
    const recovery = computeMuscleRecovery(workouts, exerciseCatalog);
    const options = getSplitDaysForProgram(profile.programType).map((o) => o.id);
    return (
      options.find(
        (split) =>
          split !== activeWorkout.splitDay &&
          SPLIT_TARGET_MUSCLES[split].every((m) => {
            const r = recovery[m];
            return !r || r.recoveryPct >= READY_THRESHOLD * 100;
          })
      ) || null
    );
  })();
  // After today's workout: its summary and each exercise done, from the saved session (the same
  // data and words as the finish screen).
  const todayFinished = useMemo(() => {
    if (!showRecoveryGate || !recoveryGate.trainedToday) return null;
    const finished = workouts
      .filter((w) => w.completed)
      .sort((x, y) => getWorkoutCompletedAt(x) - getWorkoutCompletedAt(y))
      .pop();
    if (!finished) return null;
    const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
    const finish = buildWorkoutFinish({
      profile,
      workouts,
      finished,
      activities,
      biometrics,
      exerciseCatalog,
      bodyweightKg: hasWeighIn ? bodyweightEmaKg : undefined,
      formatWeight: (kg) => units.formatPrecise(kg),
    });
    if (!finish) return null;
    return {
      workout: finished,
      finish,
      exercises: buildCompletedExerciseSummaries({
        finished,
        workouts,
        bodyweightKg: hasWeighIn ? bodyweightEmaKg : 0,
        biometrics,
        formatWeight: (kg) => units.formatPrecise(kg),
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecoveryGate, recoveryGate.trainedToday, workouts, biometrics, exerciseCatalog, profile, activities, bodyweightEmaKg, units.unit]);
  const sessionReport = todayFinished?.finish.report ?? null;

  const lastWorkoutAgoHours = recoveryGate.lastWorkoutAt
    ? Math.max(0, Math.round((Date.now() - recoveryGate.lastWorkoutAt) / (60 * 60 * 1000)))
    : null;

  // 6-Week plan sessions show their own week and phase.
  const planWorkoutNumber =
    getSessionPlanId(activeWorkout) === trainingPlan.id ? activeWorkout.programWorkoutNumber : undefined;
  const planWeek = planWorkoutNumber ? Math.ceil(planWorkoutNumber / trainingPlan.workoutsPerWeek) : undefined;
  const planPhase = planWeek
    ? trainingPlan.phases.find((p) => planWeek >= p.weeks[0] && planWeek <= p.weeks[1])
    : undefined;
  const weekPillLabel = planWeek
    ? `Week ${planWeek} of 6 • Phase ${planPhase?.phaseNumber ?? 1}`
    : `Week ${mesoWeek} of 6 • ${phaseMeta.name}`;

  const LOCATION_CONFIG: Array<{ id: TrainingLocation; label: string; detail: string }> = [
    { id: 'gym', label: 'Full Gym', detail: 'Barbell, dumbbells & machines' },
    { id: 'home', label: 'At Home', detail: 'Dumbbells, pull-up bar & bands' },
    { id: 'travel', label: 'Bodyweight', detail: 'No equipment, anywhere' },
  ];
  const activeLocationOption =
    LOCATION_CONFIG.find((l) => l.id === currentLoc) || LOCATION_CONFIG[0];

  const hasRecoveryMechanism = Boolean(
    isWearableConnected(profile) || profile.whoopAccessToken || profile.fitbitAccessToken
  );
  const hasWatchData = Boolean(
    hasRecoveryMechanism &&
      latestBiometrics &&
      (latestBiometrics.hrvRmssd !== undefined || latestBiometrics.restingHr !== undefined)
  );

  // Program card: plan phase and position, or the mesocycle week for standard splits.
  // The count in the workout card and sticky header tracks the sets in this workout.
  const planTemplate = planWorkoutNumber ? trainingPlan.templates.find((t) => t.workoutNumber === planWorkoutNumber) : undefined;
  const sessionSetsTotal = todayFinished
    ? todayFinished.workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0)
    : totalSets;
  const sessionSetsCurrent = todayFinished
    ? todayFinished.workout.exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.completed).length, 0)
    : completedSets;
  // After a logged rest day (or when holding for recovery) an unfinished session is queued as next rather than today's.
  const isNextSession = !todayFinished && (showRecoveryGate || activeWorkout.date > localDateString());
  const rawSessionName = todayFinished
    ? getSessionPlanId(todayFinished.workout) === trainingPlan.id
      ? planWorkoutLabel(todayFinished.workout.name)
      : todayFinished.workout.name.split(' — ')[0]
    : planWorkoutNumber
      ? planTemplate
        ? planWorkoutLabel(planTemplate.title)
        : activeWorkout.name
      : activeWorkout.name.split(' — ')[0];
  const sessionLabel = isNextSession ? `Next: ${rawSessionName}` : rawSessionName;
  const programCard = planWorkoutNumber
    ? {
        title: `Phase ${planPhase?.phaseNumber ?? 1}`,
        description: planPhase?.planSummary || planPhase?.description || planPhase?.shortName || '',
        sessionLabel,
        current: sessionSetsCurrent,
        total: sessionSetsTotal,
      }
    : {
        title: `Week ${mesoWeek}: ${phaseMeta.name}`,
        description: phaseMeta.description,
        sessionLabel,
        current: sessionSetsCurrent,
        total: sessionSetsTotal,
      };
  const pageTitle = planWorkoutNumber ? trainingPlan.name : PROGRAM_TITLES[profile.programType || 'starter_6wk'] || 'Your Program';

  const stripDays = useMemo(
    () =>
      buildWeekStrip({
        workouts,
        nextSession: activeWorkout,
        programType: profile.programType,
        plan: trainingPlan,
        activeDates: activeDayDates(activities),
        exerciseCatalog,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, activeWorkout.id, activeWorkout.date, activeWorkout.programWorkoutNumber, profile.programType, trainingPlan, exerciseCatalog, activities]
  );

  // Exercise overviews: personal notes written on the device from the athlete's knowledge graph.
  const knowledgeGraph = useMemo(
    () =>
      buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, calculateWeeklyMuscleVolume(workouts, exerciseCatalog), activities),
    [workouts, biometrics, exerciseCatalog, profile]
  );
  const planTotalWeeks = Math.max(1, ...trainingPlan.templates.map((t) => t.week));
  const programLabel = planWorkoutNumber
    ? `Phase ${planPhase?.phaseNumber ?? 1} (${planPhase?.shortName ?? ''}), week ${planWeek} of ${planTotalWeeks}`
    : `week ${mesoWeek} of 6 (${phaseMeta.name})`;
  const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const measuredBodyweightKg = hasWeighIn ? bodyweightEmaKg : 0;
  const programInterventions = useMemo(
    () =>
      detectCoachInterventions({
        profile,
        activeWorkout,
        workouts,
        biometrics,
        exerciseCatalog,
        bodyweightEmaKg: measuredBodyweightKg,
        readinessState: readiness.state,
        activities,
        knowledgeGraph,
        trainingPlan,
      }),
    [profile, activeWorkout, workouts, biometrics, exerciseCatalog, measuredBodyweightKg, readiness.state, activities, knowledgeGraph, trainingPlan]
  );
  const exerciseNotes = useMemo(
    () =>
      activeWorkout.exercises.map((ex) => {
        const def = exMap.get(ex.exerciseId);
        return buildExerciseNoteFacts({
          exercise: ex,
          insight: buildExerciseInsight(ex, workouts, readiness.state, measuredBodyweightKg, 12, (kg) => units.formatPrecise(kg), biometrics),
          workouts,
          readinessState: readiness.state,
          knowledgeGraph,
          primaryMuscle: def?.primaryMuscle,
          muscleLabel: def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined,
          programLabel,
          formatWeight: (kg) => units.formatPrecise(kg),
        });
      }),
    // Facts use planned targets and history only, so ticking sets doesn't rewrite the notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWorkout.id, activeWorkout.exercises.map((e) => `${e.id}:${e.exerciseId}:${e.sets.length}`).join('|'), workouts, readiness.state, knowledgeGraph, programLabel, units.unit, measuredBodyweightKg, biometrics]
  );
  const [generatedNotes, setGeneratedNotes] = useState<Record<string, string>>({});
  const noteKeys = exerciseNotes.map((n) => n.key).join('|');
  useEffect(() => {
    if (showRecoveryGate) return;
    let cancelled = false;
    const cached: Record<string, string> = {};
    for (const n of exerciseNotes) {
      const hit = acceptExerciseNote(getCachedExerciseNote(n.key) ?? null, n);
      if (hit) cached[n.key] = hit;
    }
    setGeneratedNotes(cached);
    const timer = setTimeout(() => {
      (async () => {
        if (cancelled || !(await isOnDeviceModelReady())) return;
        // One at a time, top to bottom: the model answers one request at a time.
        // First-time exercises (hasHistory === false) already have an exact 2-line baseline fallback.
        for (const n of exerciseNotes) {
          if (cancelled) return;
          if (cached[n.key] || !n.hasHistory) continue;
          const note = await generateExerciseNote(n);
          if (cancelled || !note) continue;
          cacheExerciseNote(n.key, note);
          setGeneratedNotes((prev) => ({ ...prev, [n.key]: note }));
        }
        // Any failure leaves the fact-based summaries in place.
      })().catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKeys, showRecoveryGate]);

  // Page background: canvas top tint fading to canvas base exactly where the first workout card starts.
  const cardsTopRef = useRef<HTMLDivElement>(null);
  const exercisesTopRef = useRef<HTMLDivElement>(null);
  const sessionBlockRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const stickyMeasureRef = useRef<HTMLDivElement>(null);
  const [sessionDocked, setSessionDocked] = useState(false);

  useEffect(() => {
    const MORPH_PX = 32;
    const update = () => {
      const sessionEl = sessionBlockRef.current;
      const stickyEl = stickyHeaderRef.current;
      const measureEl = stickyMeasureRef.current;
      if (!sessionEl || !stickyEl || !measureEl) {
        setSessionDocked(false);
        return;
      }
      // Read both rects before writing styles so the hand-off locks to the exact top pixel of the session row.
      const dockOffset = measureEl.getBoundingClientRect().top - sessionEl.getBoundingClientRect().top;
      const isDocked = dockOffset >= 0;
      const t = isDocked ? Math.min(1, dockOffset / MORPH_PX) : 0;

      stickyEl.style.setProperty('--dock-active', isDocked ? '1' : '0');
      stickyEl.style.setProperty('--dock-pe', isDocked ? 'auto' : 'none');
      stickyEl.style.setProperty('--dock-t', t.toFixed(4));
      sessionEl.style.opacity = isDocked ? '0' : '1';
      setSessionDocked((prev) => (prev === isDocked ? prev : isDocked));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [todayFinished, workoutDisplay.showProgramCard, workoutDisplay.showSessionCard]);

  const renderOptionsMenu = (close: () => void) => (
    <div
      role="menu"
      aria-label="Workout options"
      className="w-60 rounded-2xl shadow-2xl p-2 space-y-1 text-left border"
      style={{ background: 'var(--wk-card)', borderColor: 'var(--color-border-subtle)' }}
    >
      <div className="px-3 py-2 wk-label">Location</div>
      {LOCATION_CONFIG.map((loc) => {
        const isSelected = currentLoc === loc.id;
        return (
          <button
            key={loc.id}
            type="button"
            role="menuitemradio"
            aria-checked={isSelected}
            onClick={() => {
              if (onSwitchLocation && loc.id !== currentLoc) {
                triggerHaptic('medium');
                onSwitchLocation(loc.id);
              }
              close();
            }}
            className="w-full text-left px-3 py-2 rounded-xl min-h-[44px] flex items-center justify-between transition-colors"
            style={{
              background: isSelected ? 'var(--wk-raised)' : 'transparent',
              color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            <div>
              <span className="text-base font-medium block">{loc.label}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{loc.detail}</span>
            </div>
            {isSelected && <Check className="w-4 h-4 stroke-[2.5] shrink-0 ml-2" style={{ color: 'var(--color-text-primary)' }} />}
          </button>
        );
      })}
      <div className="pt-2 space-y-1" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            triggerHaptic('light');
            setShowWorkoutDisplayModal(true);
            close();
          }}
          className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center justify-between gap-2 min-h-[44px]"
          style={{ color: 'var(--color-text-primary)' }}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 stroke-[2] shrink-0" />
            <span>Customize workout page</span>
          </span>
          <span className="text-xs font-normal tabular-numbers" style={{ color: 'var(--color-text-muted)' }}>
            {activeDisplayCount}/6
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            triggerHaptic('medium');
            onShiftWorkout();
            close();
          }}
          className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center gap-2 min-h-[44px]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <Calendar className="w-4 h-4 stroke-[2]" />
          <span>Log rest day</span>
        </button>
        {recentCompletedWorkouts.length > 0 && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPreviewPastWorkout(recentCompletedWorkouts[0]);
              close();
            }}
            className="w-full text-left px-3 py-2 rounded-xl text-base font-medium hover:bg-[var(--wk-raised)] flex items-center gap-2 min-h-[44px]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <History className="w-4 h-4 stroke-[2]" />
            <span>Last workout</span>
          </button>
        )}
      </div>
    </div>
  );

  const todayDateStr = localDateString();
  const todayStripDay = stripDays.find((d) => d.isToday);
  const isRestDayToday = activeWorkout.date > todayDateStr && completedSets === 0;
  const isNonTrainingToday =
    !todayFinished &&
    (showRecoveryGate ||
      isRestDayToday ||
      (todayStripDay?.status === 'rest' && completedSets === 0 && !activeWorkout.recoveryOverride));
  const inspectedDay = selectedStripDate ? stripDays.find((d) => d.date === selectedStripDate) ?? null : null;
  const isPastInspected = Boolean(inspectedDay && inspectedDay.date < todayDateStr);
  const isFutureInspected = Boolean(inspectedDay && inspectedDay.date > todayDateStr);
  const inspectedLiftingWorkout = useMemo(() => {
    if (!inspectedDay || inspectedDay.date > todayDateStr) return null;
    return (
      workouts
        .filter((w) => w.completed && localDateString(new Date(getWorkoutCompletedAt(w))) === inspectedDay.date)
        .sort((x, y) => getWorkoutCompletedAt(x) - getWorkoutCompletedAt(y))
        .pop() ?? null
    );
  }, [inspectedDay, todayDateStr, workouts]);
  const isNonTrainingView = inspectedDay
    ? inspectedDay.isToday
      ? isNonTrainingToday
      : isFutureInspected
      ? true
      : !inspectedLiftingWorkout
    : isNonTrainingToday;
  const showActiveExercises = !isNonTrainingView && (!inspectedDay || inspectedDay.isToday) && !todayFinished;

  // Never surface step count while an active workout is shown or when inspecting future days.
  const overviewStepDay =
    !showActiveExercises && !isFutureInspected
      ? inspectedDay ??
        (isNonTrainingToday
          ? todayStripDay ?? { date: todayDateStr, label: 'TODAY', status: 'rest' as const, isToday: true }
          : null)
      : null;
  const overviewSteps = overviewStepDay ? stepsOnDate(biometrics, overviewStepDay.date) : 0;
  const dailyStepsGoal = profile.goalSettings?.customGoals?.find((g) => g.metric === 'steps')?.target;
  const sevenDaysAgoStr = localDateOffset(-6, parseLocalDate(todayDateStr));
  const recentActivities = useMemo(() => {
    const targetDate = inspectedDay?.date;
    const filtered = targetDate
      ? activities.filter((a) => a.date === targetDate)
      : activities.filter((a) => a.date >= sevenDaysAgoStr);
    const list = filtered.length > 0 ? filtered : activities.filter((a) => a.date >= sevenDaysAgoStr);
    return [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [activities, inspectedDay, sevenDaysAgoStr]);
  const thisWeekActiveDay = useMemo(
    () =>
      [...activities]
        .filter((a) => a.date >= sevenDaysAgoStr && qualifiesAsActiveDay(a))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0],
    [activities, sevenDaysAgoStr]
  );
  const formatDayShort = (date: string) => {
    const d = parseLocalDate(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div className="wk -mx-4 px-4 pb-28">
      <PageTopGradient
        markerRef={exercisesTopRef}
        fallbackRef={cardsTopRef}
        observeRef={cardsTopRef}
        deps={[showRecoveryGate, sessionReport, isNonTrainingView]}
      />
      {workoutDisplay.showSessionCard && !isNonTrainingView && (
        <StickySessionHeader
          sessionLabel={programCard.sessionLabel}
          current={programCard.current}
          total={programCard.total}
          docked={sessionDocked}
          headerRef={stickyHeaderRef}
          measureRef={stickyMeasureRef}
        />
      )}
      <WorkoutPageHeader
        title={pageTitle}
        days={stripDays}
        selectedDate={selectedStripDate}
        onSelectDay={(day) => setSelectedStripDate((prev) => (prev === day.date ? null : day.date))}
        renderMenu={renderOptionsMenu}
      />

      <div ref={cardsTopRef} className="flex flex-col gap-3 mt-6">
      {/* After today's session: lead with "complete" and the progress breakdown. */}
      {todayFinished && (!inspectedDay || inspectedDay.isToday) ? (() => {
        const finishedDayBio = biometrics.find((b) => b.date === todayFinished.workout.date);
        const dayStrainValue = finishedDayBio?.strain ?? (latestBiometrics.date === todayFinished.workout.date ? latestBiometrics.strain : undefined);
        const finishedWorkoutStrain = todayFinished.workout.whoopStrain ?? finishedDayBio?.workoutStrain;
        const finishedAvgHr = todayFinished.workout.avgHeartRate ?? finishedDayBio?.avgWorkoutHr;
        const finishedMaxHr = todayFinished.workout.maxHeartRate ?? finishedDayBio?.maxWorkoutHr;
        return (
          <>
            {workoutDisplay.showProgramCard && (
              <ProgramProgressCard
                title={programCard.title}
                description={programCard.description}
                onOpen={onOpenProgram}
              />
            )}
            {workoutDisplay.showSessionCard && (
              <CurrentSessionCard
                sessionLabel={programCard.sessionLabel}
                current={programCard.current}
                total={programCard.total}
                sessionRef={sessionBlockRef}
              />
            )}
            <FinishedWorkoutSummaryCard finish={todayFinished.finish} />
            {whoopConfigured && (
              <WhoopStrainCard
                workoutStrain={finishedWorkoutStrain}
                dayStrain={dayStrainValue}
                avgHr={finishedAvgHr}
                maxHr={finishedMaxHr}
                hasLiveConnection={Boolean(profile.whoopAccessToken)}
              />
            )}
            {todayFinished.exercises.map((ex) => (
              <CompletedExerciseCard key={ex.id} summary={ex} />
            ))}
          </>
        );
      })() : !isNonTrainingView ? (
        <>
          {workoutDisplay.showProgramCard && (
            <ProgramProgressCard
              title={programCard.title}
              description={programCard.description}
              onOpen={onOpenProgram}
            />
          )}
          {workoutDisplay.showSessionCard && (
            <CurrentSessionCard
              sessionLabel={programCard.sessionLabel}
              current={programCard.current}
              total={programCard.total}
              sessionRef={sessionBlockRef}
            />
          )}
          {!showRecoveryGate && workoutDisplay.showRecoveryCard && hasRecoveryMechanism && (
            <RecoveryScoreCard
              readiness={readiness}
              latestBiometrics={latestBiometrics}
              isConnected={isWearableConnected(profile)}
              onOpen={onOpenWatchSync}
            />
          )}
        </>
      ) : null}

      {workoutDisplay.showStepsCard && overviewStepDay && !showActiveExercises && !isFutureInspected && (isNonTrainingView || isPastInspected || overviewStepDay.status !== 'trained') && (
        <section
          aria-label={overviewStepDay.isToday ? "Today's steps" : `${overviewStepDay.label} steps`}
          className="wk-card"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="wk-title flex items-center gap-2">
                <Footprints className="w-4 h-4 shrink-0" style={{ color: 'var(--color-data-telemetry)' }} strokeWidth={2.2} aria-hidden="true" />
                <span>
                  {overviewStepDay.isToday
                    ? "Today's steps"
                    : `${overviewStepDay.label} (${formatDayShort(overviewStepDay.date)})`}
                </span>
              </h2>
              <p className="wk-caption mt-1">
                {!isNonTrainingView && overviewStepDay.status === 'trained'
                  ? 'Training day'
                  : 'Rest day'}
              </p>
            </div>
            {inspectedDay && (
              <button
                type="button"
                onClick={() => setSelectedStripDate(null)}
                className="wk-btn-secondary wk-tap"
              >
                Close
              </button>
            )}
          </div>
          <p className="wk-display leading-none mt-3">
            {overviewSteps > 0 ? overviewSteps.toLocaleString() : '—'}
            {overviewSteps > 0 && (
              <span
                className="wk-caption ml-2"
                style={{ color: 'var(--wk-muted)' }}
              >
                steps
              </span>
            )}
          </p>
          {dailyStepsGoal && (
            <>
              <div
                className="wk-bar mt-3"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={dailyStepsGoal}
                aria-valuenow={overviewSteps}
                aria-label={`${overviewSteps.toLocaleString()} of ${dailyStepsGoal.toLocaleString()} steps`}
              >
                <div style={{ width: `${Math.min(100, (overviewSteps / dailyStepsGoal) * 100)}%` }} />
              </div>
              <p className="wk-caption mt-2">
                {overviewSteps >= dailyStepsGoal
                  ? `Daily goal reached (${dailyStepsGoal.toLocaleString()} steps)`
                  : `${overviewSteps.toLocaleString()} of ${dailyStepsGoal.toLocaleString()} daily step goal`}
              </p>
            </>
          )}
          {overviewSteps === 0 && (
            <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
              <p className="wk-body">
                No steps recorded {overviewStepDay.isToday ? 'today' : 'for this day'} yet.
              </p>
              {!profile.healthConnectActivities && !isWearableConnected(profile) && onOpenWatchSync && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenWatchSync();
                  }}
                  className="wk-btn-secondary wk-tap"
                >
                  Sync Health Connect
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {isFutureInspected && inspectedDay && (
        inspectedDay.status === 'planned' && inspectedDay.plannedSession ? (
          <section aria-label="Upcoming training day" className="wk-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center flex-wrap gap-2">
                  <h2 className="wk-h1">
                    {formatSentenceCase(inspectedDay.plannedSession.name)}
                  </h2>
                  <span
                    className="wk-pill"
                    style={{ background: 'var(--color-status-positive-soft)', color: 'var(--wk-accent)' }}
                  >
                    Upcoming
                  </span>
                </div>
                <p className="wk-caption mt-1">
                  {inspectedDay.label} ({formatDayShort(inspectedDay.date)}) • Upcoming training day
                  {inspectedDay.plannedSession.programWorkoutNumber && inspectedDay.plannedSession.totalProgramWorkouts
                    ? ` • Workout ${inspectedDay.plannedSession.programWorkoutNumber} of ${inspectedDay.plannedSession.totalProgramWorkouts}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStripDate(null)}
                className="wk-btn-secondary wk-tap shrink-0"
              >
                Back to today
              </button>
            </div>

            <ul className="mt-4 space-y-2">
              {inspectedDay.plannedSession.exercises.map((ex, i) => (
                <li
                  key={`${ex.exerciseId}-${i}`}
                  className="pt-2 border-t flex items-center justify-between gap-3"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                >
                  <span className="wk-subhead min-w-0 truncate">
                    {formatSentenceCase(ex.name)}
                  </span>
                  <span className="wk-caption tabular-nums shrink-0">
                    {ex.setsCount} × {ex.targetLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section aria-label="Planned rest day" className="wk-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="wk-h1">Planned rest day</h2>
                <p className="wk-caption mt-1">
                  {inspectedDay.label} ({formatDayShort(inspectedDay.date)}) • Scheduled recovery day
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStripDate(null)}
                className="wk-btn-secondary wk-tap shrink-0"
              >
                Back to today
              </button>
            </div>
            <p className="wk-body mt-3 max-w-prose">
              Your target muscle groups are scheduled to recover on this day before your next lifting session.
            </p>
          </section>
        )
      )}

      {isNonTrainingView && !isFutureInspected && (
        <ActiveDayCard
          thisWeek={thisWeekActiveDay}
          recent={recentActivities}
          onLog={onLogActivity}
          onRemove={onRemoveActivity}
          onOpenApps={onOpenActivityApps}
        />
      )}

      {isRestDayToday && (!inspectedDay || inspectedDay.isToday) && !showRecoveryGate && (
        <section aria-label="Rest day status" className="wk-card">
          <h2 className="wk-h1">Rest day logged</h2>
          <p className="wk-body mt-2 max-w-prose">
            {activeWorkout.name} is queued for your next training day. Focus on steps, active recovery or rest today.
          </p>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onUpdateWorkout({ ...activeWorkout, date: todayDateStr });
            }}
            className="wk-btn-secondary w-full mt-3"
          >
            Train today instead
          </button>
        </section>
      )}

      {showRecoveryGate && (!inspectedDay || inspectedDay.isToday) && !sessionReport && (
        <section aria-label="Recovery before next workout" className="wk-card">
          <h2 className="wk-h1">Your muscles are still recovering</h2>
          <p className="wk-body mt-2 max-w-prose">
            {activeWorkout.name} will be ready{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>{formatReadyTime(recoveryGate.readyAt ?? Date.now())}</strong>.
            {lastWorkoutAgoHours !== null && recoveryGate.lastWorkoutName
              ? ` You finished ${recoveryGate.lastWorkoutName} ${
                  lastWorkoutAgoHours < 1 ? 'less than an hour' : `${lastWorkoutAgoHours} hour${lastWorkoutAgoHours === 1 ? '' : 's'}`
                } ago.`
              : ''}
          </p>

          {recoveryGate.limitingMuscles.length > 0 && (
            <ul className="flex flex-col gap-3 mt-5" aria-label="Muscle recovery">
              {recoveryGate.limitingMuscles.slice(0, 4).map((m) => (
                <li key={m.muscle}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="wk-subhead">{MUSCLE_FRIENDLY_NAMES[m.muscle]}</span>
                    <span className="wk-caption tabular-nums">
                      {m.recoveryPct}% • ready {formatReadyTime(m.readyAt)}
                    </span>
                  </div>
                  <div
                    className="wk-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={m.recoveryPct}
                    aria-label={`${MUSCLE_FRIENDLY_NAMES[m.muscle]} recovery`}
                  >
                    <div
                      style={{
                        width: `${m.recoveryPct}%`,
                        background:
                          m.recoveryPct >= 67
                            ? 'var(--color-status-positive)'
                            : m.recoveryPct >= 34
                            ? 'var(--color-status-warning)'
                            : 'var(--color-status-danger)',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="wk-body mt-5 max-w-prose">
            Muscles grow while they recover. Training them again early means less growth, not more.
          </p>

          <div className="flex flex-col gap-2 mt-5">
            {recoveredAlternative && onSwitchSplitDay && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onSwitchSplitDay(recoveredAlternative);
                }}
                className="wk-button"
                style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
              >
                Train {recoveredAlternative} instead
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('warning');
                onUpdateWorkout({ ...activeWorkout, recoveryOverride: true });
              }}
              className="wk-btn-secondary w-full"
            >
              Train anyway
            </button>
          </div>
        </section>
      )}

      {inspectedDay && !inspectedDay.isToday && inspectedLiftingWorkout && (
        <>
          {buildCompletedExerciseSummaries({
            finished: inspectedLiftingWorkout,
            workouts,
            bodyweightKg: hasWeighIn ? bodyweightEmaKg : 0,
            biometrics,
            formatWeight: (kg) => units.formatPrecise(kg),
          }).map((ex) => (
            <CompletedExerciseCard key={ex.id} summary={ex} />
          ))}
        </>
      )}

      {showActiveExercises && (<>
      {/* Exercise cards (the page gradient ends where the first one starts) */}
      <div ref={exercisesTopRef} className="flex flex-col gap-3">
        {exercisePrescriptions.map(({ ex, prescription }, index) => {
          const def = exMap.get(ex.exerciseId);
          const meta = def
            ? getExerciseBiomechanicalMeta(def)
            : {
                isIsolation: ex.isIsolation ?? false,
                resistanceProfile: ex.resistanceProfile ?? ('mid' as const),
                sfrScore: ex.sfrScore ?? 8.2,
              };

          const currentWorkingWeight =
            ex.sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.actualWeightKg ??
            ex.sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.targetWeightKg ??
            prescription.nextWeightKg ??
            20;

          const currentBestE1rm = calculateE1RM(
            currentWorkingWeight,
            ex.minReps,
            2,
            ex.equipment,
            ex.isRdl,
            ex.isWeightedCalisthenic,
            bodyweightEmaKg
          );

          const quest = calculateSubTierQuest(
            ex.pillar,
            currentBestE1rm,
            bodyweightEmaKg,
            currentWorkingWeight,
            ex.minReps,
            ex.equipment,
            ex.isRdl,
            ex.isWeightedCalisthenic,
            profile.gender,
            {
              isIsolation: meta.isIsolation,
              maxReps: ex.maxReps,
              sfrScore: meta.sfrScore,
              resistanceProfile: meta.resistanceProfile,
            }
          );

          const exWorkingSets = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
          const isBlockCompleted = exWorkingSets.length > 0 && exWorkingSets.every((s) => s.completed);
          const liveInsightWorkouts = isBlockCompleted
            ? [
                ...workouts.filter((w) => w.id !== activeWorkout.id),
                {
                  ...activeWorkout,
                  completed: true,
                  completedAt: new Date().toISOString(),
                  exercises: [ex],
                },
              ]
            : workouts;

          const lastAthleteNote = (() => {
            const ordered = workouts
              .filter((w) => w.completed)
              .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
            for (const w of ordered) {
              const found = w.exercises.find((e) => e.exerciseId === ex.exerciseId && e.athleteNotes?.trim());
              if (found?.athleteNotes?.trim()) {
                return { date: w.date, text: found.athleteNotes.trim() };
              }
            }
            return undefined;
          })();

          return (
            <ExerciseCard
              key={ex.id}
              exerciseIndex={index + 1}
              totalExercises={activeWorkout.exercises.length}
              exercise={ex}
              prescription={prescription}
              quest={quest}
              readinessState={readiness.state}
              bodyweightKg={measuredBodyweightKg}
              lastAthleteNote={lastAthleteNote}
              onUpdateNotes={(notes) => handleUpdateExerciseNotes(ex.id, notes)}
              onOpenNotesHistory={onOpenInsights ? () => onOpenInsights(ex.exerciseId) : undefined}
              onUpdateSet={(setId, updated) => handleUpdateSet(ex.id, setId, updated)}
              onCompleteSet={(setId) => {
                const s = ex.sets.find((item) => item.id === setId);
                onSetCompleted(ex.name, s?.setNumber || 1, s, ex);
              }}
              onAddSet={(isWarmup) => handleAddSet(ex.id, isWarmup)}
              onOpenDetail={() => setDetailExerciseId(ex.id)}
              onOpenSwap={() => setSwappingExercise(ex)}
              onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
              muscleLabel={def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined}
              previousSets={getPreviousWorkingSets(ex.exerciseId, workouts)}
              insight={buildExerciseInsight(ex, liveInsightWorkouts, readiness.state, measuredBodyweightKg, 12, (kg) => units.formatPrecise(kg), biometrics)}
              note={
                isBlockCompleted
                  ? undefined
                  : (() => {
                      const n = exerciseNotes[index];
                      return n ? generatedNotes[n.key] ?? n.fallback : undefined;
                    })()
              }
              showSummary={workoutDisplay.showExerciseSummaries}
              showChart={workoutDisplay.showExerciseCharts}
            />
          );
        })}
      </div>

      {/* Add an exercise (secondary action) */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setShowAddExerciseModal(true);
        }}
        className="wk-btn-secondary w-full flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
        <span>Add exercise</span>
      </button>

      {/* Finish (primary action CTA) */}
      <button
        type="button"
        onClick={handleFinishWorkoutClick}
        disabled={completedSets === 0}
        className="wk-button transition-transform active:scale-[0.98]"
        style={
          completedSets > 0
            ? { background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }
            : { background: 'var(--color-action-disabled-bg)', color: 'var(--color-action-disabled-fg)', cursor: 'not-allowed' }
        }
      >
        Finish workout
        {completedSets > 0 && (
          <span className="block normal-case font-normal text-xs tabular-nums" style={{ opacity: 0.75 }}>
            {completedSets} of {totalSets} sets logged
            {liveTonnageKg > 0 ? ` • ${Math.round(units.toDisplay(liveTonnageKg)).toLocaleString()} ${units.unit}` : ''}
          </span>
        )}
      </button>
      </>)}
      </div>

      {/* Add Exercise Picker Modal */}
      {showAddExerciseModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add exercise"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-md"
          style={{ background: 'var(--color-bg-scrim)' }}
        >
          <div className="wk-card w-full max-w-md shadow-2xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="wk-h1">
                  Add exercise
                </h3>
                <p className="wk-caption mt-1">
                  Target weights and reps are pre-filled from your workout history
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddExerciseModal(false)}
                aria-label="Close add exercise modal"
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center text-xs font-medium transition-colors shrink-0"
                style={{
                  background: 'var(--color-action-secondary-bg)',
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto no-scrollbar pr-1">
              {exerciseCatalog.map((def) => {
                const equipLabel =
                  def.equipment === 'barbell'
                    ? 'Barbell'
                    : def.equipment === 'dumbbell'
                    ? 'Dumbbell'
                    : def.equipment === 'cable'
                    ? 'Cable'
                    : def.equipment === 'machine'
                    ? 'Machine'
                    : def.equipment === 'weighted_bodyweight'
                    ? 'Weighted Bodyweight'
                    : 'Bodyweight';
                const targetSummary = def.isTimed
                  ? `${def.defaultDurationSeconds ?? 45}s hold`
                  : `${def.defaultRepRange[0]}–${def.defaultRepRange[1]} reps`;
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => handleAddExerciseToSession(def)}
                    className="wk-raised w-full flex items-center justify-between text-left transition-all active:scale-[0.99]"
                  >
                    <div>
                      <div className="wk-subhead">
                        {def.name}
                      </div>
                      <div className="wk-caption mt-1">
                        {def.primaryMuscle} • {equipLabel} • {targetSummary}
                      </div>
                    </div>
                    <Plus className="w-4 h-4 shrink-0 stroke-[2]" style={{ color: 'var(--color-text-secondary)' }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Customize Workout Page Defaults Modal */}
      {showWorkoutDisplayModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Customize workout page"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-md"
          style={{ background: 'var(--color-bg-scrim)' }}
        >
          <div className="wk-card w-full max-w-md shadow-2xl flex flex-col gap-3" style={{ maxHeight: '85vh' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="wk-h1">Workout page defaults</h3>
                <p className="wk-caption mt-1">
                  Choose which cards, summaries and charts appear on your Workout screen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWorkoutDisplayModal(false)}
                aria-label="Close workout page settings"
                className="wk-btn-secondary min-h-[44px]"
              >
                Close
              </button>
            </div>

            <ul className="flex flex-col overflow-y-auto no-scrollbar" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              {(
                [
                  {
                    key: 'showProgramCard' as const,
                    title: 'Program & phase card',
                    description: 'Show the current phase summary and link to your Program.',
                  },
                  {
                    key: 'showSessionCard' as const,
                    title: 'Current session card',
                    description: "Show today's workout title and completed sets progress bar.",
                  },
                  {
                    key: 'showRecoveryCard' as const,
                    title: 'Recovery score card',
                    description: 'Daily readiness from Whoop or your smart watch when connected.',
                  },
                  {
                    key: 'showExerciseSummaries' as const,
                    title: 'Exercise written summaries',
                    description: '2-line weight history and session focus on each exercise card.',
                  },
                  {
                    key: 'showExerciseCharts' as const,
                    title: 'Exercise trend charts',
                    description: 'Estimated 1-rep max or best-set chart inside each exercise card.',
                  },
                  {
                    key: 'showStepsCard' as const,
                    title: 'Daily steps card',
                    description: 'Step count overview on rest days and selected week-strip days.',
                  },
                ]
              ).map((item) => {
                const enabled = workoutDisplay[item.key];
                return (
                  <li key={item.key} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      onClick={() => {
                        triggerHaptic('light');
                        handleToggleWorkoutDisplay(item.key);
                      }}
                      className="w-full text-left flex items-center justify-between gap-3 py-3"
                      style={{ minHeight: 44 }}
                    >
                      <span className="min-w-0">
                        <span className="wk-subhead block">{item.title}</span>
                        <span className="wk-caption block mt-1">
                          {item.description}
                        </span>
                      </span>
                      <span
                        className="rounded-full flex items-center justify-center shrink-0 w-6 h-6"
                        style={{
                          background: enabled ? 'var(--wk-accent)' : 'transparent',
                          border: enabled ? 'none' : '1.5px solid var(--color-border-strong)',
                        }}
                        aria-hidden="true"
                      >
                        {enabled && (
                          <Check
                            className="w-3.5 h-3.5"
                            style={{ color: 'var(--color-text-on-accent)' }}
                            strokeWidth={3}
                          />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2">
              {!isDefaultWorkoutDisplay && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    handleResetWorkoutDisplay();
                  }}
                  className="wk-btn-secondary w-full"
                >
                  Reset to defaults
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowWorkoutDisplayModal(false)}
                className="wk-button"
                style={{
                  background: 'var(--color-action-primary-bg)',
                  color: 'var(--color-action-primary-fg)',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exercise Drill-In Detail Modal */}
      {(() => {
        const entry = detailExerciseId
          ? exercisePrescriptions.find(({ ex }) => ex.id === detailExerciseId)
          : undefined;
        if (!entry) return null;
        const detailEx = entry.ex;
        const detailDef = exMap.get(detailEx.exerciseId);
        const detailWorkingSets = detailEx.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
        const detailBlockDone = detailWorkingSets.length > 0 && detailWorkingSets.every((s) => s.completed);
        const detailInsightWorkouts = detailBlockDone
          ? [
              ...workouts.filter((w) => w.id !== activeWorkout.id),
              {
                ...activeWorkout,
                completed: true,
                completedAt: new Date().toISOString(),
                exercises: [detailEx],
              },
            ]
          : workouts;
        return (
          <ExerciseDetailModal
            exercise={detailEx}
            exerciseDef={detailDef}
            workouts={detailInsightWorkouts}
            biometrics={biometrics}
            insight={buildExerciseInsight(
              detailEx,
              detailInsightWorkouts,
              readiness.state,
              measuredBodyweightKg,
              12,
              (kg) => units.formatPrecise(kg),
              biometrics
            )}
            bodyweightKg={measuredBodyweightKg}
            muscleLabel={detailDef ? MUSCLE_FRIENDLY_NAMES[detailDef.primaryMuscle] : undefined}
            prescription={entry.prescription}
            readinessState={readiness.state}
            onAddSet={(isWarmup) => handleAddSet(detailEx.id, isWarmup)}
            onOpenSwap={() => setSwappingExercise(detailEx)}
            onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
            onOpenNotesHistory={onOpenInsights ? () => onOpenInsights(detailEx.exerciseId) : undefined}
            intervention={programInterventions.find((i) => i.exerciseId === detailEx.exerciseId)}
            onAskCoachToAdapt={
              onOpenCoachIntervention
                ? (prompt, exerciseId) =>
                    onOpenCoachIntervention({
                      prompt,
                      exerciseId: exerciseId ?? detailEx.exerciseId,
                    })
                : undefined
            }
            onClose={() => setDetailExerciseId(null)}
          />
        );
      })()}

      {/* Smart Equipment Swap Modal */}
      {swappingExercise && (
        <ExerciseSwapModal
          currentExercise={swappingExercise}
          exerciseCatalog={exerciseCatalog}
          bodyweightEmaKg={bodyweightEmaKg}
          activeLocation={activeWorkout.location || profile.activeLocation}
          homeEquipment={profile.homeEquipment}
          workouts={workouts}
          readinessState={readiness.state}
          goalPhase={profile.goalPhase}
          unit={units.unit}
          resolveFallbackWeight={resolveNewExerciseFallbackWeight}
          onConfirmSwap={handleConfirmSwap}
          onClose={() => setSwappingExercise(null)}
          excludeExerciseIds={activeWorkout.exercises.map((e) => e.exerciseId)}
        />
      )}

      {/* Barbell Plate Calculator Modal */}
      {plateCalcWeight !== null && (
        <PlateCalculatorModal
          initialWeightKg={plateCalcWeight}
          onClose={() => setPlateCalcWeight(null)}
        />
      )}

      {/* Workout finished: summary, personal bests and goals moved */}
      {showSummaryModal && workoutFinish && (
        <WorkoutFinishScreen
          finish={workoutFinish}
          onDone={handleCloseSummary}
          whoopConfigured={whoopConfigured}
          whoopTelemetry={whoopStrainSummary}
          dayStrain={latestBiometrics.strain}
          hasLiveWhoopConnection={Boolean(profile.whoopAccessToken)}
          isSyncingWhoop={isSyncingWhoopStrain}
          onRefreshWhoop={profile.whoopAccessToken ? syncWhoopWorkoutTelemetry : undefined}
        />
      )}

      {/* Past Workout Preview Modal */}
      {previewPastWorkout && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Last workout"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
          style={{ background: 'var(--color-bg-scrim)' }}
        >
          <div className="wk-card w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="wk-h1">
                Completed workout ({previewPastWorkout.date})
              </h3>
              <button
                type="button"
                onClick={() => setPreviewPastWorkout(null)}
                className="wk-btn-secondary min-h-[44px]"
              >
                Close
              </button>
            </div>
            <div className="wk-body">{formatSentenceCase(previewPastWorkout.name)}</div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {previewPastWorkout.exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="wk-raised"
                >
                  <div className="wk-subhead">{formatSentenceCase(ex.name)}</div>
                  <div className="wk-caption tabular-nums mt-1">
                    {ex.sets
                      .filter((s) => s.completed)
                      .map(
                        (s) =>
                          `${units.format(s.actualWeightKg ?? s.targetWeightKg)} × ${
                            s.actualReps ?? s.targetReps
                          }`
                      )
                      .join('  |  ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
