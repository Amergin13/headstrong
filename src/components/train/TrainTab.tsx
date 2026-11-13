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
  isWearableConnected,
} from '../../engine/types';
import { ReadinessEvaluation } from '../../engine/readiness';
import { ReadinessBanner } from './ReadinessBanner';
import { ExerciseCard } from './ExerciseCard';
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
import { ActivityLog, activeDayDates } from '../../engine/activeDays';
import { localDateString, parseLocalDate } from '../../utils/date';
import { stepsOnDate } from '../../services/athleteGoals';
import { startingWeightForNewExercise } from '../../services/sessionPreparation';
import { useUnits } from '../../utils/unitsContext';
import {
  prescribeDoubleProgression,
  findLastCompletedExerciseSession,
  getSessionProgressNarrative,
} from '../../engine/progression';
import { calculateSubTierQuest, standardsAge } from '../../engine/strengthStandards';
import {
  calculateE1RM,
  calculateHypertrophyBodyweightReps,
} from '../../engine/e1rm';
import { buildAthleteKnowledgeGraph, getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import { CompletedExerciseCard, FinishedWorkoutSummaryCard } from './FinishedWorkoutCards';
import { WorkoutPageHeader } from './WorkoutPageHeader';
import { ProgramProgressCard, StickySessionHeader } from './ProgramProgressCard';
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
  /** Active days (rides, runs, walks, classes), kept alongside lifting workouts. */
  activities?: ActivityLog[];
}

/** Primary muscles each split day trains, used to suggest a recovered alternative. */
const SPLIT_TARGET_MUSCLES: Record<SplitDayType, MuscleGroup[]> = {
  Push: ['Chest', 'Shoulders', 'Triceps', 'Side Delts'],
  Pull: ['Back', 'Rear Delts', 'Biceps'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  Upper: ['Chest', 'Back', 'Side Delts', 'Biceps'],
};

/** One Figma pixel (1344 px wide frame) in screen pixels; see .wk in index.css. */
const fig = (px: number) => `calc(${px} * var(--f))`;
/** Side margin of the Workout page in the Figma frame. */
const PAGE_GUTTER = 38;

const PROGRAM_TITLES: Record<string, string> = {
  ppl_upper: 'Push / Pull / Legs + Upper',
  ppl: 'Push / Pull / Legs',
  upper_lower: 'Upper / Lower',
  full_body: 'Full Body',
};

const MESO_WEEK_PHASE_NAMES: Record<number, { name: string; rule: string }> = {
  1: { name: 'Smooth Start', rule: 'Base sets • Leave 2–3 reps in the tank' },
  2: { name: 'Building Up', rule: 'Adding sets • Leave 2 reps in the tank' },
  3: { name: 'Main Growth Phase', rule: 'Target zone • Leave 1–2 reps in the tank' },
  4: { name: 'High Effort Phase', rule: 'High sets • Leave 1 rep in the tank' },
  5: { name: 'Peak Week', rule: 'Peak sets • Leave 0–1 reps in the tank' },
  6: { name: 'Light Recovery Week', rule: 'Half sets • Leave 3–4 easy reps in the tank' },
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
}) => {
  const units = useUnits();
  const [swappingExercise, setSwappingExercise] = useState<ExerciseSession | null>(null);
  const [plateCalcWeight, setPlateCalcWeight] = useState<number | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [previewPastWorkout, setPreviewPastWorkout] = useState<WorkoutSession | null>(null);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [whoopStrainSummary, setWhoopStrainSummary] = useState<WhoopWorkoutStrainSummary | null>(null);
  const [isSyncingWhoopStrain, setIsSyncingWhoopStrain] = useState(false);
  const [selectedStripDate, setSelectedStripDate] = useState<string | null>(null);

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
          const sourceRir = sourceSet.actualRir ?? sourceSet.targetRir ?? 2;

          for (let i = completedIndex + 1; i < updatedSets.length; i++) {
            if (!updatedSets[i].completed && updatedSets[i].setType !== 'warmup') {
              updatedSets[i] = {
                ...updatedSets[i],
                targetWeightKg: sourceWeight,
                actualWeightKg: sourceWeight,
                targetReps: sourceReps,
                actualReps: sourceReps,
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
      const newSet: WorkoutSet = {
        id: `set-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        setNumber: ex.sets.length + 1,
        targetWeightKg: newWeight,
        actualWeightKg: newWeight,
        targetReps: newReps,
        actualReps: newReps,
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

  const handleAddExerciseToSession = (def: ExerciseDefinition) => {
    triggerHaptic('medium');
    const meta = getExerciseBiomechanicalMeta(def);
    const isPureBw = def.equipment === 'bodyweight' && !def.isWeightedCalisthenic;
    const defaultSeedWeight = isPureBw ? 0 : def.equipment === 'dumbbell' ? 16 : 40;

    const seedEx: ExerciseSession = {
      id: `active-ex-${Date.now()}`,
      exerciseId: def.id,
      name: def.name,
      pillar: def.pillar,
      equipment: def.equipment,
      isRdl: def.isRdl,
      isWeightedCalisthenic: def.isWeightedCalisthenic,
      isIsolation: meta.isIsolation,
      resistanceProfile: meta.resistanceProfile,
      sfrScore: meta.sfrScore,
      minReps: def.defaultRepRange[0],
      maxReps: def.defaultRepRange[1],
      notes:
        meta.resistanceProfile === 'lengthened'
          ? 'Focus on a controlled stretch at the bottom of each rep.'
          : 'Keep a steady, controlled pace on every rep.',
      sets: [
        {
          id: `s-${Date.now()}-1`,
          setNumber: 1,
          targetWeightKg: defaultSeedWeight,
          targetReps: def.defaultRepRange[0],
          targetRir: 2,
          completed: false,
          setType: 'working',
        },
        {
          id: `s-${Date.now()}-2`,
          setNumber: 2,
          targetWeightKg: defaultSeedWeight,
          targetReps: def.defaultRepRange[0],
          targetRir: 2,
          completed: false,
          setType: 'working',
        },
        {
          id: `s-${Date.now()}-3`,
          setNumber: 3,
          targetWeightKg: defaultSeedWeight,
          targetReps: def.defaultRepRange[0],
          targetRir: 1,
          completed: false,
          setType: 'working',
        },
      ],
    };

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
      : startingWeightForNewExercise(activeWorkout, seedEx, {
          history: workouts,
          bodyweightKg: bodyweightEmaKg,
          readinessState: readiness.state,
          gender: profile.gender,
          experienceLevel: profile.experienceLevel,
          unit: units.unit,
        });
    const nextWeight = isPureBw ? 0 : startingWeight ?? prescription.nextWeightKg;
    const baseHydratedEx: ExerciseSession = {
      ...seedEx,
      sets: seedEx.sets.map((s, idx) => ({
        ...s,
        targetWeightKg: nextWeight,
        actualWeightKg: nextWeight,
        targetReps: prescription.nextTargetReps[idx] ?? def.defaultRepRange[0],
        actualReps: prescription.nextTargetReps[idx] ?? def.defaultRepRange[0],
      })),
    };

    const isFirstCompound = isFirstCompoundForPillar(
      baseHydratedEx,
      activeWorkout.exercises.length,
      [...activeWorkout.exercises, baseHydratedEx]
    );

    const hydratedEx = ensureWarmupSetsOnExercise(baseHydratedEx, isFirstCompound);

    onUpdateWorkout({
      ...activeWorkout,
      exercises: [...activeWorkout.exercises, hydratedEx],
    });
    setShowAddExerciseModal(false);
  };

  const handleConfirmSwap = (newDef: ExerciseDefinition, convertedWeightKg: number) => {
    if (!swappingExercise) return;
    const meta = getExerciseBiomechanicalMeta(newDef);
    const isPureBw =
      (newDef.equipment === 'bodyweight' && !newDef.isWeightedCalisthenic) ||
      activeWorkout.location === 'travel';
    const effectiveTargetWeight = isPureBw ? 0 : convertedWeightKg;

    // Compute canonical E1RM from the exercise being swapped
    let sourceE1rm = 0;
    for (const s of swappingExercise.sets) {
      const w = s.actualWeightKg ?? s.targetWeightKg;
      const r = s.actualReps ?? s.targetReps;
      const rir = s.actualRir ?? s.targetRir ?? 2;
      const e1rm = calculateE1RM(
        w,
        r,
        rir,
        swappingExercise.equipment,
        swappingExercise.isRdl,
        swappingExercise.isWeightedCalisthenic,
        bodyweightEmaKg,
        swappingExercise.exerciseId,
        swappingExercise.pillar
      );
      if (e1rm > sourceE1rm) sourceE1rm = e1rm;
    }

    let defaultTargetReps = newDef.defaultRepRange[0];
    let customNotes =
      meta.resistanceProfile === 'lengthened'
        ? 'Focus on a controlled stretch at the bottom of each rep.'
        : 'Keep a steady, controlled pace on every rep.';

    if (isPureBw) {
      const bwPrescription = calculateHypertrophyBodyweightReps(
        sourceE1rm,
        bodyweightEmaKg,
        newDef.id,
        newDef.pillar,
        newDef.defaultRepRange[0],
        newDef.defaultRepRange[1]
      );
      defaultTargetReps = bwPrescription.targetReps;
      if (bwPrescription.tempoCue) {
        customNotes = `${bwPrescription.tempoCue}. Focus on full muscle stretch.`;
      }
    }

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
        targetReps: defaultTargetReps,
        actualReps: defaultTargetReps,
        isWarmup: false,
        setType: 'working' as const,
      }));

      // Keep the same structure as before the swap: only re-create warm-ups if the original
      // exercise had them, and never add more than it had.
      const originalWarmupCount = setsToDo.filter((st) => st.isWarmup || st.setType === 'warmup').length;
      let calibratedSets: WorkoutSet[] = calibratedWorkingSets;
      if (originalWarmupCount > 0 && !isPureBw && !meta.isIsolation) {
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
        equipment: isPureBw ? 'bodyweight' : newDef.equipment,
        isRdl: newDef.isRdl,
        isWeightedCalisthenic: isPureBw ? false : newDef.isWeightedCalisthenic,
        isIsolation: meta.isIsolation,
        resistanceProfile: meta.resistanceProfile,
        sfrScore: meta.sfrScore,
        minReps: newDef.defaultRepRange[0],
        maxReps: newDef.defaultRepRange[1],
        notes: customNotes,
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

  const liveTonnageKg = Math.round(
    activeWorkout.exercises.reduce((acc, ex) => {
      return (
        acc +
        ex.sets
          .filter((s) => s.completed)
          .reduce(
            (sAcc, s) =>
              sAcc + (s.actualWeightKg ?? s.targetWeightKg) * (s.actualReps ?? s.targetReps),
            0
          )
      );
    }, 0)
  );

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

  const syncWhoopWorkoutTelemetry = useCallback(() => {
    if (!profile.whoopAccessToken) return;
    setIsSyncingWhoopStrain(true);
    const setTimes = activeWorkout.exercises
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.whoopAccessToken, profile.whoopRefreshToken, activeWorkout.id]);

  const handleFinishWorkoutClick = () => {
    triggerHaptic('success');
    setShowSummaryModal(true);

    if (profile.whoopConnected && profile.whoopAccessToken) {
      syncWhoopWorkoutTelemetry();
    }
  };

  const handleCloseSummary = () => {
    setShowSummaryModal(false);
    onFinishWorkout(whoopStrainSummary || undefined);
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
    { id: 'travel', label: 'Travel', detail: 'Bodyweight only' },
  ];
  const activeLocationOption =
    LOCATION_CONFIG.find((l) => l.id === currentLoc) || LOCATION_CONFIG[0];

  const hasWatchData = Boolean(
    isWearableConnected(profile) &&
      latestBiometrics &&
      (latestBiometrics.hrvRmssd !== undefined || latestBiometrics.restingHr !== undefined)
  );

  // Program card: plan phase and position, or the mesocycle week for standard splits.
  const planTemplate = planWorkoutNumber ? trainingPlan.templates.find((t) => t.workoutNumber === planWorkoutNumber) : undefined;
  // After a logged rest day the session is held for tomorrow, so it isn't today's.
  const sessionWord = showRecoveryGate || activeWorkout.date > localDateString() ? 'Next' : 'Today';
  const programCard = planWorkoutNumber
    ? {
        title: `Phase ${planPhase?.phaseNumber ?? 1}`,
        subtitle: planPhase?.shortName ?? '',
        sessionLabel: `${sessionWord}: ${planTemplate ? planWorkoutLabel(planTemplate.title) : activeWorkout.name}`,
        current: planWorkoutNumber,
        total: trainingPlan.templates.length,
      }
    : {
        title: `Week ${mesoWeek}`,
        subtitle: phaseMeta.name,
        sessionLabel: `${sessionWord}: ${activeWorkout.name.split(' — ')[0]}`,
        current: mesoWeek,
        total: 6,
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
    [workouts, activeWorkout.id, activeWorkout.programWorkoutNumber, profile.programType, trainingPlan, exerciseCatalog, activities]
  );

  // Exercise overviews: personal notes written on the device from the athlete's knowledge graph.
  const knowledgeGraph = useMemo(
    () =>
      buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, calculateWeeklyMuscleVolume(workouts, exerciseCatalog), activities),
    [workouts, biometrics, exerciseCatalog, profile]
  );
  const programLabel = planWorkoutNumber
    ? `Phase ${planPhase?.phaseNumber ?? 1} (${planPhase?.shortName ?? ''}), week ${planWeek} of 6`
    : `week ${mesoWeek} of 6 (${phaseMeta.name})`;
  const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const measuredBodyweightKg = hasWeighIn ? bodyweightEmaKg : 0;
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
    (async () => {
      if (!(await isOnDeviceModelReady())) return;
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKeys, showRecoveryGate]);

  // Page background: #283339 at the top fading to #13181C exactly where the first workout card starts.
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
  }, [todayFinished]);

  const renderOptionsMenu = (close: () => void) => (
    <div
      role="menu"
      aria-label="Workout options"
      className="w-60 rounded-2xl bg-[#2C3034] border border-white/[0.08] shadow-2xl p-1.5 space-y-1 text-left"
    >
      <div className="px-3 py-1.5 text-xs font-bold text-white/60 uppercase tracking-wider">Location</div>
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
            className={`w-full text-left px-3 py-2 rounded-xl min-h-[44px] flex items-center justify-between transition-colors ${
              isSelected ? 'bg-white/[0.10] text-white' : 'text-white/80 hover:bg-white/[0.06]'
            }`}
          >
            <div>
              <span className="text-sm font-bold block">{loc.label}</span>
              <span className="text-xs text-white/60">{loc.detail}</span>
            </div>
            {isSelected && <Check className="w-4 h-4 text-[#00F19F] stroke-[2.5] shrink-0 ml-2" />}
          </button>
        );
      })}
      <div className="pt-1.5 border-t border-white/[0.08] space-y-1">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            triggerHaptic('medium');
            onShiftWorkout();
            close();
          }}
          className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.06] flex items-center gap-2 min-h-[44px]"
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
            className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.06] flex items-center gap-2 min-h-[44px]"
          >
            <History className="w-4 h-4 stroke-[2]" />
            <span>Last workout</span>
          </button>
        )}
      </div>
    </div>
  );

  const todayDateStr = localDateString();
  const isRestDayToday = activeWorkout.date > todayDateStr && completedSets === 0;
  const isNonTrainingToday = !todayFinished && (showRecoveryGate || isRestDayToday);
  const inspectedDay = selectedStripDate ? stripDays.find((d) => d.date === selectedStripDate) ?? null : null;
  const overviewStepDay = inspectedDay ?? (isNonTrainingToday ? stripDays.find((d) => d.isToday) ?? { date: todayDateStr, label: 'TODAY', status: 'rest' as const, isToday: true } : null);
  const overviewSteps = overviewStepDay ? stepsOnDate(biometrics, overviewStepDay.date) : 0;
  const dailyStepsGoal = profile.goalSettings?.customGoals?.find((g) => g.metric === 'steps')?.target;
  const formatDayShort = (date: string) => {
    const d = parseLocalDate(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div className="wk -mx-3.5" style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 120 }}>
      <PageTopGradient
        markerRef={exercisesTopRef}
        fallbackRef={cardsTopRef}
        observeRef={cardsTopRef}
        deps={[showRecoveryGate, sessionReport]}
      />
      <StickySessionHeader
        sessionLabel={programCard.sessionLabel}
        current={programCard.current}
        total={programCard.total}
        onOpen={onOpenProgram}
        docked={sessionDocked}
        headerRef={stickyHeaderRef}
        measureRef={stickyMeasureRef}
      />
      <WorkoutPageHeader
        title={pageTitle}
        days={stripDays}
        selectedDate={selectedStripDate}
        onSelectDay={(day) => setSelectedStripDate((prev) => (prev === day.date ? null : day.date))}
        renderMenu={renderOptionsMenu}
      />

      <div ref={cardsTopRef} className="flex flex-col" style={{ gap: fig(22), marginTop: fig(64) }}>
      {/* After today's session: lead with "complete" and the progress breakdown. */}
      {todayFinished ? (
        <>
          <ProgramProgressCard {...programCard} onOpen={onOpenProgram} sessionRef={sessionBlockRef} />
          <FinishedWorkoutSummaryCard finish={todayFinished.finish} />
          {todayFinished.exercises.map((ex) => (
            <CompletedExerciseCard key={ex.id} summary={ex} />
          ))}
        </>
      ) : (
        <>
          <ProgramProgressCard {...programCard} onOpen={onOpenProgram} sessionRef={sessionBlockRef} />
          {!showRecoveryGate && (
            <RecoveryScoreCard
              readiness={readiness}
              latestBiometrics={latestBiometrics}
              isConnected={isWearableConnected(profile)}
              onOpen={onOpenWatchSync}
            />
          )}
        </>
      )}

      {overviewStepDay && (inspectedDay || overviewStepDay.status !== 'trained') && (
        <section
          aria-label={overviewStepDay.isToday ? "Today's steps" : `${overviewStepDay.label} steps`}
          className="wk-card"
        >
          <div className="flex items-start justify-between" style={{ gap: fig(16) }}>
            <div>
              <h2 className="wk-label flex items-center" style={{ gap: fig(10) }}>
                <Footprints style={{ width: fig(30), height: fig(30), color: 'var(--wk-accent)' }} strokeWidth={2.2} aria-hidden="true" />
                <span>
                  {overviewStepDay.isToday
                    ? "Today's steps"
                    : `${overviewStepDay.label} (${formatDayShort(overviewStepDay.date)})`}
                </span>
              </h2>
              <p className="wk-caption" style={{ marginTop: fig(6) }}>
                {overviewStepDay.status === 'trained'
                  ? 'Training day'
                  : isRestDayToday && overviewStepDay.isToday
                  ? 'Rest day'
                  : 'Non-training day'}
              </p>
            </div>
            {inspectedDay && (
              <button
                type="button"
                onClick={() => setSelectedStripDate(null)}
                className="wk-pill wk-tap"
              >
                Close
              </button>
            )}
          </div>
          <p
            className="font-bold text-white tabular-numbers"
            style={{ fontSize: `max(12px, ${fig(68)})`, lineHeight: 1.05, marginTop: fig(28) }}
          >
            {overviewSteps > 0 ? overviewSteps.toLocaleString() : '—'}
            {overviewSteps > 0 && (
              <span
                className="font-semibold"
                style={{ fontSize: `max(12px, ${fig(24)})`, color: 'var(--wk-muted)', marginLeft: fig(12) }}
              >
                steps
              </span>
            )}
          </p>
          {dailyStepsGoal && (
            <>
              <div
                className="wk-bar"
                style={{ marginTop: fig(24) }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={dailyStepsGoal}
                aria-valuenow={overviewSteps}
                aria-label={`${overviewSteps.toLocaleString()} of ${dailyStepsGoal.toLocaleString()} steps`}
              >
                <div style={{ width: `${Math.min(100, (overviewSteps / dailyStepsGoal) * 100)}%` }} />
              </div>
              <p className="wk-caption" style={{ marginTop: fig(12) }}>
                {overviewSteps >= dailyStepsGoal
                  ? `Daily goal reached (${dailyStepsGoal.toLocaleString()} steps)`
                  : `${overviewSteps.toLocaleString()} of ${dailyStepsGoal.toLocaleString()} daily step goal`}
              </p>
            </>
          )}
          {overviewSteps === 0 && (
            <div className="flex items-center justify-between flex-wrap" style={{ gap: fig(16), marginTop: fig(18) }}>
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
                  className="wk-pill wk-tap"
                  style={{ color: 'var(--wk-accent)' }}
                >
                  Sync Health Connect
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {showRecoveryGate && !sessionReport && (
        <section aria-label="Recovery before next workout" className="wk-card">
          <h2 className="wk-h1">Your muscles are still recovering</h2>
          <p className="wk-body" style={{ marginTop: fig(20) }}>
            {activeWorkout.name} will be ready{' '}
            <strong className="text-white">{formatReadyTime(recoveryGate.readyAt ?? Date.now())}</strong>.
            {lastWorkoutAgoHours !== null && recoveryGate.lastWorkoutName
              ? ` You finished ${recoveryGate.lastWorkoutName} ${
                  lastWorkoutAgoHours < 1 ? 'less than an hour' : `${lastWorkoutAgoHours} hour${lastWorkoutAgoHours === 1 ? '' : 's'}`
                } ago.`
              : ''}
          </p>

          {recoveryGate.limitingMuscles.length > 0 && (
            <ul className="flex flex-col" style={{ gap: fig(28), marginTop: fig(40) }} aria-label="Muscle recovery">
              {recoveryGate.limitingMuscles.slice(0, 4).map((m) => (
                <li key={m.muscle}>
                  <div className="flex items-center justify-between" style={{ marginBottom: fig(12) }}>
                    <span className="wk-label">{MUSCLE_FRIENDLY_NAMES[m.muscle]}</span>
                    <span className="wk-caption">
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
                    <div style={{ width: `${m.recoveryPct}%`, background: '#8FD3FF' }} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="wk-body" style={{ marginTop: fig(40) }}>
            Muscles grow while they recover. Training them again early means less growth, not more.
          </p>

          <div className="flex flex-col" style={{ gap: fig(16), marginTop: fig(40) }}>
            {recoveredAlternative && onSwitchSplitDay && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onSwitchSplitDay(recoveredAlternative);
                }}
                className="wk-button"
                style={{ background: 'var(--wk-accent)', color: '#13181C' }}
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
              className="wk-button"
              style={{ background: 'var(--wk-pill)', color: '#fff' }}
            >
              Train anyway
            </button>
          </div>
        </section>
      )}

      {!showRecoveryGate && (<>
      {/* Exercise cards (the page gradient ends where the first one starts) */}
      <div ref={exercisesTopRef} className="flex flex-col" style={{ gap: fig(22) }}>
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

          return (
            <ExerciseCard
              key={ex.id}
              exerciseIndex={index + 1}
              totalExercises={activeWorkout.exercises.length}
              exercise={ex}
              prescription={prescription}
              quest={quest}
              readinessState={readiness.state}
              onUpdateSet={(setId, updated) => handleUpdateSet(ex.id, setId, updated)}
              onCompleteSet={(setId) => {
                const s = ex.sets.find((item) => item.id === setId);
                onSetCompleted(ex.name, s?.setNumber || 1, s, ex);
              }}
              onAddSet={(isWarmup) => handleAddSet(ex.id, isWarmup)}
              onOpenSwap={() => setSwappingExercise(ex)}
              onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
              muscleLabel={def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined}
              previousSets={getPreviousWorkingSets(ex.exerciseId, workouts)}
              insight={buildExerciseInsight(ex, workouts, readiness.state, measuredBodyweightKg, 12, (kg) => units.formatPrecise(kg), biometrics)}
              note={(() => {
                const n = exerciseNotes[index];
                return n ? generatedNotes[n.key] ?? n.fallback : undefined;
              })()}
            />
          );
        })}
      </div>

      {/* Add an exercise */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setShowAddExerciseModal(true);
        }}
        className="wk-button flex items-center justify-center"
        style={{ border: `${fig(3)} dashed rgba(255,255,255,0.25)`, color: 'var(--wk-muted)', gap: fig(12) }}
      >
        <Plus style={{ width: fig(32), height: fig(32) }} strokeWidth={2.5} aria-hidden="true" />
        <span>Add exercise</span>
      </button>

      {/* Finish */}
      <button
        type="button"
        onClick={handleFinishWorkoutClick}
        disabled={completedSets === 0}
        className="wk-button transition-transform active:scale-[0.98]"
        style={
          completedSets > 0
            ? { background: 'var(--wk-accent)', color: '#13181C' }
            : { background: 'var(--wk-pill)', color: 'rgba(255,255,255,0.5)', cursor: 'not-allowed' }
        }
      >
        Finish workout
        {completedSets > 0 && (
          <span className="block normal-case font-semibold" style={{ fontSize: `max(12px, ${fig(22)})`, opacity: 0.75 }}>
            {completedSets} of {totalSets} sets logged
            {liveTonnageKg > 0 ? ` • ${Math.round(units.toDisplay(liveTonnageKg)).toLocaleString()} ${units.unit}` : ''}
          </span>
        )}
      </button>
      </>)}
      </div>

      {/* Add Exercise Picker Modal */}
      {showAddExerciseModal && (
        <div role="dialog" aria-modal="true" aria-label="Add exercise" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="wk-card w-full max-w-md shadow-2xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="wk-h1">
                  Add Exercise
                </h3>
                <p className="wk-caption mt-1">
                  Target weights and reps are pre-filled from your workout history
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddExerciseModal(false)}
                aria-label="Close add exercise modal"
                className="w-10 h-10 rounded-full text-white/60 hover:text-white flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                style={{ background: 'var(--wk-raised)' }}
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
                    : 'Bodyweight';
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => handleAddExerciseToSession(def)}
                    className="wk-raised w-full flex items-center justify-between text-left transition-all active:scale-[0.99]"
                  >
                    <div>
                      <div className="wk-label normal-case">
                        {def.name}
                      </div>
                      <div className="wk-caption mt-1">
                        {def.primaryMuscle} • {equipLabel} • {def.defaultRepRange[0]}–{def.defaultRepRange[1]} reps
                      </div>
                    </div>
                    <Plus className="w-4 h-4 shrink-0 stroke-[2]" style={{ color: 'var(--wk-accent)' }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Smart Equipment Swap Modal */}
      {swappingExercise && (
        <ExerciseSwapModal
          currentExercise={swappingExercise}
          exerciseCatalog={exerciseCatalog}
          bodyweightEmaKg={bodyweightEmaKg}
          activeLocation={activeWorkout.location || profile.activeLocation}
          homeEquipment={profile.homeEquipment}
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
      {showSummaryModal && workoutFinish && <WorkoutFinishScreen finish={workoutFinish} onDone={handleCloseSummary} />}

      {/* Past Workout Preview Modal */}
      {previewPastWorkout && (
        <div role="dialog" aria-modal="true" aria-label="Last workout" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="wk-card w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="wk-h1">
                Completed Workout ({previewPastWorkout.date})
              </h3>
              <button
                type="button"
                onClick={() => setPreviewPastWorkout(null)}
                className="wk-pill min-h-[36px] text-white"
              >
                Close
              </button>
            </div>
            <div className="wk-body">{previewPastWorkout.name}</div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {previewPastWorkout.exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="wk-raised"
                >
                  <div className="wk-label normal-case">{ex.name}</div>
                  <div className="wk-caption tabular-numbers mt-1">
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
