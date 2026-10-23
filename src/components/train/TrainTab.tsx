import React, { useState, useCallback, useMemo } from 'react';
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
import { PROGRAM_PHASES } from '../../engine/muscleBuildingProgram';
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
import { getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
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

  return (
    <div className="space-y-4 sm:space-y-5 pb-28">
      {/* UNIFIED HERO CARD: Opinionated Asynchronous Hypertrophy Queue & Session Goals */}
      <div className="biometric-card p-5 sm:p-6 space-y-4">
        {/* A. Compact Context Header + Location Dropdown Toggle */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenProgram?.();
            }}
            disabled={!onOpenProgram}
            aria-label={`${weekPillLabel}. Open your program`}
            className="px-3 min-h-[36px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <span>{weekPillLabel}</span>
            {onOpenProgram && <ChevronRight className="w-3.5 h-3.5 stroke-[2] text-slate-400" aria-hidden="true" />}
          </button>

          {/* Location Switcher Dropdown (defaults to onboarding setting) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowLocationDropdown(!showLocationDropdown);
              }}
              aria-expanded={showLocationDropdown}
              aria-haspopup="listbox"
              aria-label="Switch training location"
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-200 hover:text-white flex items-center space-x-1.5 shrink-0 transition-colors min-h-[36px]"
            >
              <span>{activeLocationOption.label}</span>
              {showLocationDropdown ? (
                <ChevronUp className="w-3.5 h-3.5 stroke-[2] text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 stroke-[2] text-slate-400" />
              )}
            </button>

            {showLocationDropdown && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowLocationDropdown(false)}
                />
                <div
                  role="listbox"
                  aria-label="Training location options"
                  className="absolute right-0 top-full mt-2 z-30 w-56 rounded-2xl bg-[#0E1219] border border-white/[0.08] shadow-2xl p-1.5 space-y-1"
                >
                  <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Location
                  </div>
                  {LOCATION_CONFIG.map((loc) => {
                    const isSelected = currentLoc === loc.id;
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          if (onSwitchLocation && loc.id !== currentLoc) {
                            triggerHaptic('medium');
                            onSwitchLocation(loc.id);
                          }
                          setShowLocationDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl min-h-[44px] flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-white/[0.12] text-white font-bold'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-bold block">{loc.label}</span>
                          <span className="text-xs text-slate-400 font-medium">{loc.detail}</span>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-brand-primary stroke-[2.5] shrink-0 ml-2" />
                        )}
                      </button>
                    );
                  })}

                  <div className="pt-1.5 border-t border-white/[0.06] space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onShiftWorkout();
                        setShowLocationDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] flex items-center space-x-2 transition-colors min-h-[44px]"
                    >
                      <Calendar className="w-3.5 h-3.5 stroke-[2]" />
                      <span>Log Rest Day</span>
                    </button>

                    {recentCompletedWorkouts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPastWorkout(recentCompletedWorkouts[0]);
                          setShowLocationDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] flex items-center space-x-2 transition-colors min-h-[44px]"
                      >
                        <History className="w-3.5 h-3.5 stroke-[2]" />
                        <span>Inspect Last Workout</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* B. Primary Focal Point: Clean Opinionated Workout Identity & Scope */}
        <div className="space-y-1">
          <h1 className="font-extrabold text-xl text-white tracking-tight">
            {activeWorkout.name}
          </h1>
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
            <span>{activeWorkout.exercises.length} exercises</span>
            <span>•</span>
            <span>{totalSets} sets</span>
          </div>
        </div>

        {/* C. Blended Recovery & How to Make Progress This Session Area */}
        <ReadinessBanner
          readiness={readiness}
          latestBiometrics={latestBiometrics}
          isConnected={hasWatchData}
          onOpenWatchSync={onOpenWatchSync}
          mesoWeek={mesoWeek}
          goalPhase={profile.goalPhase}
        >
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-brand-primary stroke-[2]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                How to Make Progress This Session
              </h2>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-normal">
              <strong className="text-white font-semibold">
                {sessionNarrative.stageHeadline}:{' '}
              </strong>
              {sessionNarrative.narrativeText}
            </p>
          </div>
        </ReadinessBanner>
      </div>

      {showRecoveryGate && (
        <section aria-label="Recovery before next workout" className="biometric-card p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 flex items-center justify-center text-sky-300 shrink-0">
              {recoveryGate.trainedToday ? (
                <BedDouble className="w-5 h-5 stroke-[2]" aria-hidden="true" />
              ) : (
                <Moon className="w-5 h-5 stroke-[2]" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-white">
                {recoveryGate.trainedToday ? 'Done for today. Time to recover.' : 'Your muscles are still recovering'}
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                {activeWorkout.name} will be ready{' '}
                <strong className="text-white">{formatReadyTime(recoveryGate.readyAt ?? Date.now())}</strong>.
                {lastWorkoutAgoHours !== null && recoveryGate.lastWorkoutName
                  ? ` You finished ${recoveryGate.lastWorkoutName} ${
                      lastWorkoutAgoHours < 1 ? 'less than an hour' : `${lastWorkoutAgoHours} hour${lastWorkoutAgoHours === 1 ? '' : 's'}`
                    } ago.`
                  : ''}
              </p>
            </div>
          </div>

          {recoveryGate.limitingMuscles.length > 0 && (
            <ul className="space-y-2" aria-label="Muscle recovery">
              {recoveryGate.limitingMuscles.slice(0, 4).map((m) => (
                <li key={m.muscle} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">{MUSCLE_FRIENDLY_NAMES[m.muscle]}</span>
                    <span className="text-slate-400">
                      {m.recoveryPct}% • ready {formatReadyTime(m.readyAt)}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={m.recoveryPct}
                    aria-label={`${MUSCLE_FRIENDLY_NAMES[m.muscle]} recovery`}
                  >
                    <div className="h-full bg-sky-400 rounded-full" style={{ width: `${m.recoveryPct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-slate-400">
            Muscles grow while they recover. Skipping ahead early means less growth from your next session, not more.
          </p>

          <div className="flex flex-col gap-2">
            {recoveredAlternative && onSwitchSplitDay && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onSwitchSplitDay(recoveredAlternative);
                }}
                className="w-full min-h-[48px] rounded-2xl bg-white text-slate-950 text-xs font-bold"
              >
                Train {recoveredAlternative} instead (fully recovered)
              </button>
            )}
            {onOpenProgram && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenProgram();
                }}
                className={`w-full min-h-[44px] rounded-2xl text-xs font-bold ${
                  recoveredAlternative ? 'bg-white/[0.06] text-slate-200' : 'bg-white text-slate-950'
                }`}
              >
                View my program
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('warning');
                onUpdateWorkout({ ...activeWorkout, recoveryOverride: true });
              }}
              className="w-full min-h-[44px] rounded-2xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Train anyway
            </button>
          </div>
        </section>
      )}

      {!showRecoveryGate && (<>
      {/* 3. Exercise Cards with Clear Step Numbers & "Target vs. Last Time" */}
      <div className="space-y-4 sm:space-y-5">
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
            />
          );
        })}
      </div>

      {/* Add Exercise to Active Workout Button */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setShowAddExerciseModal(true);
        }}
        className="w-full py-3.5 rounded-2xl bg-[#0E1219] hover:bg-[#141824] text-xs font-bold text-slate-300 hover:text-brand-primary flex items-center justify-center space-x-2 transition-all min-h-[44px]"
      >
        <Plus className="w-4 h-4 stroke-[2]" />
        <span>Add Exercise to Today&apos;s Session</span>
      </button>

      {/* Finish Workout Primary Action */}
      <button
        type="button"
        onClick={handleFinishWorkoutClick}
        disabled={completedSets === 0}
        className={`w-full py-4 rounded-2xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center space-x-2 min-h-[48px] ${
          completedSets > 0
            ? 'bg-white hover:bg-slate-100 text-slate-950 font-bold shadow-lg shadow-white/5 cursor-pointer'
            : 'bg-white/[0.06] text-slate-400 cursor-not-allowed'
        }`}
      >
        <CheckCircle2 className={`w-4 h-4 stroke-[2.2] ${completedSets > 0 ? 'text-emerald-600' : 'text-slate-500'}`} />
        <span>
          Finish Workout{completedSets > 0 ? ` (${completedSets} of ${totalSets} sets logged${liveTonnageKg > 0 ? ` • ${Math.round(units.toDisplay(liveTonnageKg)).toLocaleString()} ${units.unit}` : ''})` : ''}
        </span>
      </button>

      </>)}

      {/* Add Exercise Picker Modal */}
      {showAddExerciseModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-[#0E1219] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
              <div>
                <h3 className="font-bold text-base text-white">
                  Add Exercise
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Target weights and reps are pre-filled from your workout history
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddExerciseModal(false)}
                aria-label="Close add exercise modal"
                className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
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
                    className="w-full p-3.5 rounded-2xl bg-[#090C12] hover:bg-[#141824] flex items-center justify-between text-left transition-all"
                  >
                    <div>
                      <div className="font-bold text-sm text-white">
                        {def.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {def.primaryMuscle} • {equipLabel} • {def.defaultRepRange[0]}–{def.defaultRepRange[1]} reps
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-brand-primary shrink-0 stroke-[2]" />
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
          readinessState={readiness.state}
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
          <div className="w-full max-w-sm rounded-3xl bg-[#0E1219] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-white">
                Completed Workout ({previewPastWorkout.date})
              </h3>
              <button
                type="button"
                onClick={() => setPreviewPastWorkout(null)}
                className="text-xs font-bold text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="text-xs text-slate-400">
              {previewPastWorkout.name} •{' '}
              <span className="text-brand-primary font-mono font-bold">
                +{previewPastWorkout.xpEarned} XP
              </span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {previewPastWorkout.exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="p-3 rounded-xl bg-[#090C12] text-xs"
                >
                  <div className="font-bold text-white">{ex.name}</div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
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
