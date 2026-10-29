import React, { useState, useCallback, useMemo, useLayoutEffect, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { WorkoutSummaryModal } from './WorkoutSummaryModal';
import {
  WhoopWorkoutStrainSummary,
  fetchWhoopWorkoutStrain,
} from '../../services/whoopService';
import {
  computeMuscleRecovery,
  evaluateSessionRecovery,
  formatReadyTime,
  MUSCLE_FRIENDLY_NAMES,
  READY_THRESHOLD,
} from '../../engine/recovery';
import { PROGRAM_PHASES, WORKOUT_TEMPLATES_24 } from '../../engine/muscleBuildingProgram';
import { useUnits } from '../../utils/unitsContext';
import { PreviousSet } from './SetRow';
import {
  prescribeDoubleProgression,
  getSessionProgressNarrative,
} from '../../engine/progression';
import { calculateSubTierQuest } from '../../engine/strengthStandards';
import {
  calculateE1RM,
  calculateHypertrophyBodyweightReps,
} from '../../engine/e1rm';
import { buildAthleteKnowledgeGraph, getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import { buildSessionProgressReport } from '../../services/sessionReport';
import { SessionCompleteCard } from './SessionCompleteCard';
import { WorkoutPageHeader } from './WorkoutPageHeader';
import { ProgramProgressCard } from './ProgramProgressCard';
import { RecoveryScoreCard } from './RecoveryScoreCard';
import { buildWeekStrip } from '../../services/sessionSchedule';
import { buildExerciseInsight } from '../../services/exerciseInsight';
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
  Moon,
  BedDouble,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface TrainTabProps {
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
}

/** Primary muscles each split day trains, used to suggest a recovered alternative. */
const SPLIT_TARGET_MUSCLES: Record<SplitDayType, MuscleGroup[]> = {
  Push: ['Chest', 'Shoulders', 'Triceps', 'Side Delts'],
  Pull: ['Back', 'Rear Delts', 'Biceps'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  Upper: ['Chest', 'Back', 'Side Delts', 'Biceps'],
};

/** Working sets from the last completed session of this exact exercise (newest first by finish time). */
function getPreviousWorkingSets(exerciseId: string, workouts: WorkoutSession[]): PreviousSet[] {
  const ordered = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
  for (const w of ordered) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    const done = ex?.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup') || [];
    if (done.length > 0) {
      return done.map((st) => ({
        weightKg: st.actualWeightKg ?? st.targetWeightKg,
        reps: st.actualReps ?? st.targetReps,
      }));
    }
  }
  return [];
}

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

  const handleDeleteSet = (exerciseId: string, setId: string) => {
    const nextExercises = activeWorkout.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;
      const filtered = ex.sets.filter((s) => s.id !== setId);
      const renumbered = filtered.map((s, idx) => ({ ...s, setNumber: idx + 1 }));
      return {
        ...ex,
        sets: renumbered,
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
    const nextWeight = isPureBw ? 0 : prescription.nextWeightKg;
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

    const nextExercises = activeWorkout.exercises.map((ex, exIdx) => {
      if (ex.id !== swappingExercise.id) return ex;

      const workingSetsOnly = ex.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
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
      const originalWarmupCount = ex.sets.filter((st) => st.isWarmup || st.setType === 'warmup').length;
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

      return {
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
  // Progress report for a session finished today, grounded in the athlete's knowledge graph.
  const sessionReport = useMemo(() => {
    if (!showRecoveryGate || !recoveryGate.trainedToday) return null;
    const knowledgeGraph = buildAthleteKnowledgeGraph(
      workouts,
      biometrics,
      exerciseCatalog,
      profile,
      calculateWeeklyMuscleVolume(workouts, exerciseCatalog)
    );
    return buildSessionProgressReport({
      workouts,
      nextSession: activeWorkout,
      nextReadyAt: recoveryGate.readyAt,
      exerciseCatalog,
      knowledgeGraph,
      bodyweightKg: biometrics.some((b) => (b.bodyweightKg || 0) > 0) ? bodyweightEmaKg : undefined,
      gender: profile.gender,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecoveryGate, recoveryGate.trainedToday, recoveryGate.readyAt, workouts, biometrics, exerciseCatalog, profile, activeWorkout, bodyweightEmaKg]);

  const lastWorkoutAgoHours = recoveryGate.lastWorkoutAt
    ? Math.max(0, Math.round((Date.now() - recoveryGate.lastWorkoutAt) / (60 * 60 * 1000)))
    : null;

  // 6-Week plan sessions show their own week and phase.
  const planWorkoutNumber = activeWorkout.programWorkoutNumber;
  const planWeek = planWorkoutNumber ? Math.ceil(planWorkoutNumber / 4) : undefined;
  const planPhase = planWeek ? PROGRAM_PHASES.find((p) => planWeek >= p.weeks[0] && planWeek <= p.weeks[1]) : undefined;
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
  const planTemplate = planWorkoutNumber ? WORKOUT_TEMPLATES_24.find((t) => t.workoutNumber === planWorkoutNumber) : undefined;
  const sessionWord = showRecoveryGate ? 'Next' : 'Today';
  const programCard = planWorkoutNumber
    ? {
        title: `Phase ${planPhase?.phaseNumber ?? 1}`,
        subtitle: planPhase?.shortName ?? '',
        sessionLabel: `${sessionWord}: ${planTemplate?.title ?? activeWorkout.name}`,
        current: planWorkoutNumber,
        total: WORKOUT_TEMPLATES_24.length,
      }
    : {
        title: `Week ${mesoWeek}`,
        subtitle: phaseMeta.name,
        sessionLabel: `${sessionWord}: ${activeWorkout.name.split(' — ')[0]}`,
        current: mesoWeek,
        total: 6,
      };
  const pageTitle = planWorkoutNumber ? '6 Week Muscle Plan' : PROGRAM_TITLES[profile.programType || 'ppl_upper'] || 'Your Program';

  const stripDays = useMemo(
    () =>
      buildWeekStrip({
        workouts,
        nextSession: activeWorkout,
        programType: profile.programType,
        exerciseCatalog,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, activeWorkout.id, activeWorkout.programWorkoutNumber, profile.programType, exerciseCatalog]
  );

  // Exercise overviews: personal notes written on the device from the athlete's knowledge graph.
  const knowledgeGraph = useMemo(
    () =>
      buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, calculateWeeklyMuscleVolume(workouts, exerciseCatalog)),
    [workouts, biometrics, exerciseCatalog, profile]
  );
  const programLabel = planWorkoutNumber
    ? `Phase ${planPhase?.phaseNumber ?? 1} (${planPhase?.shortName ?? ''}), week ${planWeek} of 6`
    : `week ${mesoWeek} of 6 (${phaseMeta.name})`;
  const exerciseNotes = useMemo(
    () =>
      activeWorkout.exercises.map((ex) => {
        const def = exMap.get(ex.exerciseId);
        return buildExerciseNoteFacts({
          exercise: ex,
          insight: buildExerciseInsight(ex, workouts, readiness.state, bodyweightEmaKg),
          workouts,
          readinessState: readiness.state,
          knowledgeGraph,
          primaryMuscle: def?.primaryMuscle,
          muscleLabel: def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined,
          programLabel,
          formatWeight: (kg) => units.format(kg),
        });
      }),
    // Facts use planned targets and history only, so ticking sets doesn't rewrite the notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWorkout.id, activeWorkout.exercises.map((e) => `${e.id}:${e.exerciseId}:${e.sets.length}`).join('|'), workouts, readiness.state, knowledgeGraph, programLabel, units.unit, bodyweightEmaKg]
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
      for (const n of exerciseNotes) {
        if (cancelled) return;
        if (cached[n.key]) continue;
        const note = await generateExerciseNote(n);
        if (cancelled || !note) continue;
        cacheExerciseNote(n.key, note);
        setGeneratedNotes((prev) => ({ ...prev, [n.key]: note }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKeys, showRecoveryGate]);

  // Page background: #283339 at the top fading to #13181C exactly where the first workout card starts.
  const cardsTopRef = useRef<HTMLDivElement>(null);
  const exercisesTopRef = useRef<HTMLDivElement>(null);
  const [gradientEnd, setGradientEnd] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const marker = exercisesTopRef.current ?? cardsTopRef.current;
      if (!marker) return;
      setGradientEnd(Math.round(marker.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && cardsTopRef.current) observer.observe(cardsTopRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [showRecoveryGate, sessionReport]);

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

  return (
    <div className="wk -mx-3.5" style={{ paddingLeft: fig(PAGE_GUTTER), paddingRight: fig(PAGE_GUTTER), paddingBottom: 112 }}>
      {gradientEnd !== null &&
        createPortal(
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: gradientEnd,
              background: 'linear-gradient(180deg, #283339 0%, #13181C 100%)',
              zIndex: -1,
              pointerEvents: 'none',
            }}
          />,
          document.body
        )}
      <WorkoutPageHeader title={pageTitle} days={stripDays} renderMenu={renderOptionsMenu} />

      <div ref={cardsTopRef} className="flex flex-col" style={{ gap: fig(22), marginTop: fig(64) }}>
      {/* After today's session: lead with "complete" and the progress breakdown. */}
      {sessionReport ? (
        <SessionCompleteCard
          report={sessionReport}
          limitingMuscles={recoveryGate.limitingMuscles}
          onOpenProgram={onOpenProgram}
          onTrainAnyway={() => onUpdateWorkout({ ...activeWorkout, recoveryOverride: true })}
        />
      ) : (
        <>
          <ProgramProgressCard {...programCard} onOpen={onOpenProgram} />
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
              onDeleteSet={(setId) => handleDeleteSet(ex.id, setId)}
              onOpenSwap={() => setSwappingExercise(ex)}
              onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
              muscleLabel={def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined}
              previousSets={getPreviousWorkingSets(ex.exerciseId, workouts)}
              insight={buildExerciseInsight(ex, workouts, readiness.state, bodyweightEmaKg)}
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
          <span className="block normal-case font-semibold" style={{ fontSize: fig(22), opacity: 0.75 }}>
            {completedSets} of {totalSets} sets logged
            {liveTonnageKg > 0 ? ` • ${Math.round(units.toDisplay(liveTonnageKg)).toLocaleString()} ${units.unit}` : ''}
          </span>
        )}
      </button>

      </>)}
      </div>

      {/* Add Exercise Picker Modal */}
      {showAddExerciseModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-md">
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

      {/* Post-Workout Summary Modal */}
      {showSummaryModal && (
        <WorkoutSummaryModal
          workout={activeWorkout}
          onClose={handleCloseSummary}
          whoopTelemetry={whoopStrainSummary}
          isWhoopConnected={Boolean(profile.whoopConnected)}
          isSyncingWhoop={isSyncingWhoopStrain}
          onRefreshWhoop={syncWhoopWorkoutTelemetry}
        />
      )}

      {/* Past Workout Preview Modal */}
      {previewPastWorkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
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
