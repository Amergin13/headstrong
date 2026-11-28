import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PageTopGradient } from '../common/PageTopGradient';
import {
  ActiveSetPrescription,
  BiometricLog,
  EquipmentInventory,
  ExerciseDefinition,
  ExerciseSession,
  LeverageUpgradeNudge,
  ProgramExerciseOverride,
  ProgramSlot,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
  MuscleGroup,
  WorkoutDisplaySettings,
  DEFAULT_WORKOUT_DISPLAY_SETTINGS,
  resolveWorkoutDisplaySettings,
  resolveRirTrackingEnabled,
  isWearableConnected,
  isWhoopConfigured,
} from '../../engine/types';
import {
  evaluateSingleExerciseContinuitySwap,
  recalibrateSetsAfterSet1,
  resolveActiveOverlay,
  resolveMovementPattern,
} from '../../engine/continuityEngine';
import { getActiveEquipmentInventory, snapWeightToInventory } from '../../engine/equipmentInventory';
import { ReadinessEvaluation, evaluateSet1RirConfirmation } from '../../engine/readiness';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseDetailModal } from './ExerciseDetailModal';
import { ExerciseSwapModal, ExerciseSwapScope } from './ExerciseSwapModal';
import { PlateCalculatorModal } from './PlateCalculatorModal';
import { WorkoutFinishScreen } from './WorkoutFinishScreen';
import { PastWorkoutModal } from '../program/PastWorkoutModal';
import { buildCompletedExerciseSummaries, buildWorkoutFinish } from '../../services/workoutFinish';
import {
  WhoopWorkoutStrainSummary,
  fetchWhoopWorkoutStrain,
} from '../../services/whoopService';
import {
  applyRecoveryModulation,
  clearRecoveryModulation,
  computeMuscleRecovery,
  evaluateSessionRecovery,
  formatReadyTime,
  MUSCLE_FRIENDLY_NAMES,
  READY_THRESHOLD, getWorkoutCompletedAt } from '../../engine/recovery';
import { TrainingPlan, getSessionPlanId, planWorkoutLabel } from '../../engine/muscleBuildingProgram';
import { ActivityLog, qualifiesAsActiveDay } from '../../engine/activeDays';
import { localDateOffset, localDateString, parseLocalDate } from '../../utils/date';
import { formatSentenceCase } from '../../utils/typography';
import { stepsOnDate } from '../../services/athleteGoals';
import { ActiveDayCard } from './ActiveDayCard';
import {
  buildSwappedSessionExercises,
  prepareSessionForAthlete,
  startingWeightForNewExercise,
} from '../../services/sessionPreparation';
import { useUnits } from '../../utils/unitsContext';
import {
  prescribeDoubleProgression,
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
  usesOneDumbbell,
} from '../../engine/e1rm';
import { buildAthleteKnowledgeGraph, getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import { calculateSessionTonnage } from '../../engine/wci';
import { CompletedExerciseCard, FinishedWorkoutSummaryCard, WhoopStrainCard } from './FinishedWorkoutCards';
import { WorkoutPageHeader } from './WorkoutPageHeader';
import { OverflowMenuItem } from '../common/Header';
import { CurrentSessionCard, ProgramProgressCard, StickySessionHeader } from './ProgramProgressCard';
import { RecoveryScoreCard } from './RecoveryScoreCard';
import { buildWeekStrip } from '../../services/sessionSchedule';
import { buildExerciseInsight, getPreviousWorkingSets } from '../../services/exerciseInsight';
import { buildInspectExerciseSession } from '../../services/exerciseDetails';
import {
  acceptExerciseNote,
  buildExerciseNoteFacts,
  cacheExerciseNote,
  generateExerciseNote,
  getCachedExerciseNote,
} from '../../services/exerciseCoachNote';
import { CoachIntervention, detectCoachInterventions } from '../../services/coachInterventions';
import { getActiveModelTier } from '../../services/onDeviceModel';
import { trackMetric } from '../../services/telemetry';
import '../../services/deviceModels';
import {
  calculateWarmupPrescription,
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
  Sparkles,
  Plus,
  Search,
  X,
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
    exercise?: ExerciseSession,
    restMeta?: {
      recalibrationStatus?: string;
      leverageUpgradeNudge?: LeverageUpgradeNudge;
      onApplyLeverageUpgrade?: () => void;
    }
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
  /** Opens Treise coach in Workout context (optionally scoped to an exercise or prompt). */
  onOpenCoach?: (opts?: { exerciseId?: string; prompt?: string }) => void;
  /** Directly executes and persists an accepted adaptation suggestion across the entire product. */
  onAcceptIntervention?: (intervention: CoachIntervention) => void;
  /** Dismisses an adaptation suggestion and persists dismissal across the entire product. */
  onDismissIntervention?: (intervention: CoachIntervention) => void;
  /** Saves inline edits to a completed past workout. */
  onUpdatePastWorkout?: (updated: WorkoutSession) => void;
  /** Deletes a completed past workout from history. */
  onDeletePastWorkout?: (workoutId: string) => void;
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
  onOpenCoach,
  onAcceptIntervention,
  onDismissIntervention,
  onUpdatePastWorkout,
  onDeletePastWorkout,
}) => {
  const units = useUnits();
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [swappingExercise, setSwappingExercise] = useState<ExerciseSession | null>(null);
  const [plateCalcWeight, setPlateCalcWeight] = useState<number | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [previewPastWorkout, setPreviewPastWorkout] = useState<WorkoutSession | null>(null);
  const [showWorkoutDisplayModal, setShowWorkoutDisplayModal] = useState(false);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [addExerciseQuery, setAddExerciseQuery] = useState('');
  const pendingRecalRef = useRef<{
    exerciseSessionId: string;
    recalibrationStatus?: string;
    leverageUpgradeNudge?: LeverageUpgradeNudge;
  } | null>(null);
  const [whoopStrainSummary, setWhoopStrainSummary] = useState<WhoopWorkoutStrainSummary | null>(null);
  const [isSyncingWhoopStrain, setIsSyncingWhoopStrain] = useState(false);
  const [selectedStripDate, setSelectedStripDate] = useState<string | null>(null);

  const workoutDisplay = useMemo(
    () => resolveWorkoutDisplaySettings(profile.workoutDisplay),
    [profile.workoutDisplay]
  );
  const showRir = resolveRirTrackingEnabled(profile);
  const activeLocationForInventory = activeWorkout.location || profile.activeLocation || 'gym';
  const activeInventory = useMemo(
    () => getActiveEquipmentInventory(profile, activeLocationForInventory),
    [profile, activeLocationForInventory]
  );
  const activeDisplayCount = [
    workoutDisplay.showProgramCard,
    workoutDisplay.showSessionCard,
    workoutDisplay.showRecoveryCard,
    workoutDisplay.showExerciseSummaries,
    workoutDisplay.showExerciseCharts,
    workoutDisplay.showStepsCard,
    showRir,
  ].filter(Boolean).length;
  const defaultRirForExperience = (profile.experienceLevel ?? 'intermediate') !== 'new';
  const isDefaultWorkoutDisplay =
    workoutDisplay.showProgramCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showProgramCard &&
    workoutDisplay.showSessionCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showSessionCard &&
    workoutDisplay.showRecoveryCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showRecoveryCard &&
    workoutDisplay.showExerciseSummaries === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showExerciseSummaries &&
    workoutDisplay.showExerciseCharts === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showExerciseCharts &&
    workoutDisplay.showStepsCard === DEFAULT_WORKOUT_DISPLAY_SETTINGS.showStepsCard &&
    showRir === defaultRirForExperience;

  const handleToggleWorkoutDisplay = (key: keyof WorkoutDisplaySettings) => {
    const currentValue = key === 'showRirTracking' ? showRir : Boolean(workoutDisplay[key]);
    const nextValue = !currentValue;
    trackMetric('workout.display_customized', 1, {
      toggle_key: key,
      enabled: String(nextValue),
    });
    const next: WorkoutDisplaySettings = {
      ...workoutDisplay,
      [key]: nextValue,
    };
    onUpdateProfile?.({ workoutDisplay: next });
  };

  const handleSaveEquipmentInventory = (nextInv: EquipmentInventory) => {
    const targetLoc: 'gym' | 'home' = activeLocationForInventory === 'home' ? 'home' : 'gym';
    onUpdateProfile?.({
      equipmentInventories: {
        ...(profile.equipmentInventories ?? {}),
        [targetLoc]: nextInv,
      },
    });
  };

  const handleResetWorkoutDisplay = () => {
    onUpdateProfile?.({ workoutDisplay: undefined });
  };

  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));

  const handleApplyLeverageUpgrade = (exerciseSessionId: string, nudge: LeverageUpgradeNudge) => {
    const nextExercises = activeWorkoutRef.current.exercises.map((ex) => {
      if (ex.id !== exerciseSessionId) return ex;
      const suggestedDef = nudge.suggestedExerciseId ? exMap.get(nudge.suggestedExerciseId) : undefined;
      return {
        ...ex,
        ...(suggestedDef ? { name: suggestedDef.name } : {}),
        setupLabel: nudge.suggestedSetupLabel,
        tempo: suggestedDef ? ex.tempo : '3210',
        sets: ex.sets.map((s) =>
          s.completed || s.isWarmup || s.setType === 'warmup'
            ? s
            : {
                ...s,
                setupLabel: nudge.suggestedSetupLabel,
                tempo: suggestedDef ? s.tempo : '3210',
              }
        ),
      };
    });
    onUpdateWorkout({ ...activeWorkoutRef.current, exercises: nextExercises });
  };

  const handleUpdateSet = (exerciseId: string, setId: string, updated: Partial<WorkoutSet>) => {
    const activeEnv = resolveActiveOverlay(profile.activeEnvironmentOverlay).active;
    let isolatedStatePatch: NonNullable<UserProfile['exerciseProgressionStates']> | null = null;

    const nextExercises = activeWorkout.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;

      const updatedSets = ex.sets.map((s) => (s.id === setId ? { ...s, ...updated } : s));

      if (updated.completed) {
        const completedIndex = updatedSets.findIndex((s) => s.id === setId);
        const sourceSet = updatedSets[completedIndex];
        if (sourceSet && sourceSet.setType !== 'warmup' && !sourceSet.isWarmup) {
          const workingIndices = updatedSets
            .map((s, idx) => (!s.isWarmup && s.setType !== 'warmup' ? idx : -1))
            .filter((idx) => idx >= 0);
          const isFirstWorkingSet = workingIndices[0] === completedIndex;
          const def = exMap.get(ex.exerciseId);
          const sourceWeight = sourceSet.actualWeightKg ?? sourceSet.targetWeightKg;
          const sourceReps = sourceSet.actualReps ?? sourceSet.targetReps;
          const sourceDuration = sourceSet.actualDurationSeconds ?? sourceSet.targetDurationSeconds;
          const sourceRir = sourceSet.actualRir ?? sourceSet.targetRir ?? 2;

          let handledBySet1Recalibration = false;
          if (isFirstWorkingSet && def && !isTimedExercise(ex) && workingIndices.length > 1) {
            const currentPrescriptions: ActiveSetPrescription[] = workingIndices.map((wIdx, k) => {
              const st = updatedSets[wIdx];
              return {
                setNumber: k + 1,
                suggestedWeightKg:
                  ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic
                    ? null
                    : st.targetWeightKg > 0
                    ? st.targetWeightKg
                    : null,
                isWeightEstimated: Boolean(st.isWeightEstimated),
                setupLabel: st.setupLabel ?? ex.setupLabel ?? null,
                targetRepsMin: st.targetReps || ex.minReps,
                targetRepsMax: Math.max(st.targetReps || ex.minReps, ex.maxReps),
                targetRir: st.targetRir ?? 2,
                calibrationSource: st.calibrationSource ?? ex.calibrationSource ?? 'OWN_HISTORY',
              };
            });
            const slot: ProgramSlot = {
              slotId: ex.slotId ?? ex.orderCode ?? 'A1',
              programId: activeWorkout.planId ?? 'default',
              workoutDayId: activeWorkout.splitDay,
              movementPattern: resolveMovementPattern(def),
              anchorExerciseId: ex.anchorExerciseId ?? ex.exerciseId,
              targetSets: workingIndices.length,
              targetRepMin: ex.minReps,
              targetRepMax: ex.maxReps,
              targetRirInitial: sourceSet.targetRir ?? 2,
              restSeconds: ex.restSeconds ?? (def.isIsolation ? 75 : 120),
            };
            const recal = recalibrateSetsAfterSet1({
              slot,
              targetDef: def,
              currentPrescriptions,
              loggedSet1: {
                weightKg: ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic ? null : sourceWeight,
                reps: sourceReps,
                rir: sourceRir,
              },
              previousTargetState: profile.exerciseProgressionStates?.[ex.exerciseId] ?? null,
              overlay: activeEnv,
              exerciseCatalog,
              userBodyweightKg: bodyweightEmaKg > 0 ? bodyweightEmaKg : 80,
              unit: units.unit,
            });

            if (recal.didRecalibrate || recal.leverageUpgradeNudge) {
              handledBySet1Recalibration = true;
              isolatedStatePatch = {
                ...(profile.exerciseProgressionStates ?? {}),
                [ex.exerciseId]: recal.updatedProgressionState,
              };
              pendingRecalRef.current = {
                exerciseSessionId: ex.id,
                recalibrationStatus: recal.restBarStatus,
                leverageUpgradeNudge: recal.leverageUpgradeNudge,
              };

              const firstWorkingIdx = workingIndices[0];
              if (firstWorkingIdx !== undefined && updatedSets[firstWorkingIdx]) {
                updatedSets[firstWorkingIdx] = {
                  ...updatedSets[firstWorkingIdx],
                  isWeightEstimated: false,
                  setupLabel:
                    ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic
                      ? updatedSets[firstWorkingIdx].setupLabel
                      : null,
                  calibrationSource: 'SET_1_RECALIBRATED',
                };
              }

              for (let k = 1; k < workingIndices.length; k++) {
                const wIdx = workingIndices[k];
                const presc = recal.prescriptions[k];
                if (!updatedSets[wIdx].completed && presc) {
                  const nextW = presc.suggestedWeightKg ?? 0;
                  updatedSets[wIdx] = {
                    ...updatedSets[wIdx],
                    targetWeightKg: nextW,
                    actualWeightKg: nextW,
                    targetReps: presc.targetRepsMin,
                    actualReps: presc.targetRepsMin,
                    targetRir: presc.targetRir,
                    actualRir: presc.targetRir,
                    isWeightEstimated: false,
                    setupLabel: presc.setupLabel,
                    calibrationSource: 'SET_1_RECALIBRATED',
                  };
                }
              }

              return {
                ...ex,
                anchorMinReps: recal.coarseJump?.expanded ? (ex.anchorMinReps ?? ex.minReps) : ex.anchorMinReps,
                anchorMaxReps: recal.coarseJump?.expanded ? (ex.anchorMaxReps ?? ex.maxReps) : ex.anchorMaxReps,
                maxReps: recal.coarseJump?.expanded ? recal.coarseJump.expandedRepMax : ex.maxReps,
                setupLabel:
                  ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic ? ex.setupLabel : undefined,
                calibrationSource: 'SET_1_RECALIBRATED' as const,
                continuityRationaleKind: recal.coarseJump?.expanded
                  ? 'COARSE_JUMP_EXPANDED'
                  : ex.continuityRationaleKind === 'EFFORT_ONLY'
                  ? undefined
                  : ex.continuityRationaleKind,
                coarseJumpPct: recal.coarseJump?.expanded ? recal.coarseJump.jumpPct : ex.coarseJumpPct,
                sets: updatedSets,
              };
            }
          }

          if (!handledBySet1Recalibration) {
            for (let i = completedIndex + 1; i < updatedSets.length; i++) {
              if (!updatedSets[i].completed && updatedSets[i].setType !== 'warmup') {
                // Carry adjusted working load & reps forward without flattening descending straight-set targetRir.
                const preservedTargetRir = Math.min(updatedSets[i].targetRir ?? sourceRir, sourceRir);
                updatedSets[i] = {
                  ...updatedSets[i],
                  targetWeightKg: sourceWeight,
                  actualWeightKg: sourceWeight,
                  targetReps: sourceReps,
                  actualReps: sourceReps,
                  ...(sourceDuration !== undefined
                    ? { targetDurationSeconds: sourceDuration, actualDurationSeconds: sourceDuration }
                    : {}),
                  targetRir: preservedTargetRir,
                  actualRir: preservedTargetRir,
                };
              }
            }
          }
        }
      }

      return {
        ...ex,
        sets: updatedSets,
      };
    });
    if (isolatedStatePatch) {
      onUpdateProfile?.({ exerciseProgressionStates: isolatedStatePatch });
    }
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
    trackMetric('workout.set_added', 1, {
      program_type: profile.programType,
      set_kind: isWarmup ? 'warmup' : 'working',
    });
  };

  const handleRemoveSet = (exerciseId: string) => {
    let didRemove = false;
    const nextExercises = activeWorkout.exercises.map((ex) => {
      if (ex.id !== exerciseId || ex.sets.length <= 1) return ex;
      let removeIndex = -1;
      for (let i = ex.sets.length - 1; i >= 0; i--) {
        if (!ex.sets[i].completed) {
          removeIndex = i;
          break;
        }
      }
      if (removeIndex === -1) return ex;
      didRemove = true;
      const remaining = ex.sets
        .filter((_, idx) => idx !== removeIndex)
        .map((s, idx) => ({ ...s, setNumber: idx + 1 }));
      return { ...ex, sets: remaining };
    });
    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
    if (didRemove) {
      trackMetric('workout.set_removed', 1, { program_type: profile.programType });
    }
  };

  const reindexPlainOrderCodes = (list: ExerciseSession[]): ExerciseSession[] =>
    list.map((item, idx) =>
      item.orderCode && /^\d+$/.test(item.orderCode)
        ? { ...item, orderCode: String(idx + 1) }
        : item
    );

  const handleMoveExerciseDown = (exerciseId: string) => {
    const idx = activeWorkout.exercises.findIndex((ex) => ex.id === exerciseId);
    if (idx < 0 || idx >= activeWorkout.exercises.length - 1) return;
    const copy = [...activeWorkout.exercises];
    const [moved] = copy.splice(idx, 1);
    copy.splice(idx + 1, 0, moved);
    onUpdateWorkout({ ...activeWorkout, exercises: reindexPlainOrderCodes(copy) });
    trackMetric('workout.exercise_reordered', 1, { program_type: profile.programType });
  };

  const handleSkipExerciseToday = (exerciseId: string) => {
    if (activeWorkout.exercises.length <= 1) return;
    const target = activeWorkout.exercises.find((ex) => ex.id === exerciseId);
    if (!target || target.sets.some((s) => s.completed)) return;
    const remaining = activeWorkout.exercises.filter((ex) => ex.id !== exerciseId);
    onUpdateWorkout({ ...activeWorkout, exercises: reindexPlainOrderCodes(remaining) });
    trackMetric('workout.exercise_skipped', 1, { program_type: profile.programType });
  };

  const buildBaseExerciseSession = (def: ExerciseDefinition): ExerciseSession => {
    const meta = getExerciseBiomechanicalMeta(def);
    const isPureBw = def.equipment === 'bodyweight' && !def.isWeightedCalisthenic;
    const timed = isTimedExercise(def);
    const holdSeconds = def.defaultDurationSeconds || 45;
    const defaultSeedWeight = isPureBw
      ? 0
      : def.equipment === 'dumbbell'
      ? usesOneDumbbell(def)
        ? 16
        : 12
      : 40;
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
    const baseEx = buildBaseExerciseSession(def);
    const unloaded: ExerciseSession = {
      ...baseEx,
      sets: baseEx.sets.map((s) => ({ ...s, targetWeightKg: 0, actualWeightKg: 0 })),
    };
    const prepared = prepareSessionForAthlete(
      { ...activeWorkout, exercises: [unloaded] },
      {
        history: workouts,
        bodyweightKg: bodyweightEmaKg,
        readinessState: readiness.state,
        gender: profile.gender,
        experienceLevel: profile.experienceLevel,
        unit: units.unit,
        isProgramPlan: Boolean(trainingPlan),
      }
    ).exercises[0];
    const nextExercises = reindexPlainOrderCodes([...activeWorkout.exercises, prepared]);
    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
    trackMetric('workout.exercise_added', 1, {
      program_type: profile.programType,
      equipment: def.equipment,
    });
    setShowAddExerciseModal(false);
    setAddExerciseQuery('');
  };

  const handleConfirmSwap = (
    newDef: ExerciseDefinition,
    convertedWeightKg: number,
    explicitPrescription?: SwapPrescription,
    scope: ExerciseSwapScope = 'today'
  ) => {
    if (!swappingExercise) return;
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

    const continuity = evaluateSingleExerciseContinuitySwap({
      currentExercise: swappingExercise,
      replacementDef: newDef,
      historicalWorkouts: workouts,
      exerciseCatalog,
      storedProgressionStates: profile.exerciseProgressionStates,
      activeOverlay: resolveActiveOverlay(profile.activeEnvironmentOverlay).active,
      userBodyweightKg: bodyweightEmaKg,
      unit: units.unit,
      planId: trainingPlan?.id ?? getSessionPlanId(activeWorkout) ?? 'default',
      splitDay: activeWorkout.splitDay,
    });

    const nextExercises = buildSwappedSessionExercises({
      exercises: activeWorkout.exercises,
      swappingExerciseId: swappingExercise.id,
      newDef,
      rx,
      continuity,
      scope,
      unit: units.unit,
      activeInventory,
    });

    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
    trackMetric('workout.exercise_swapped', 1, {
      program_type: profile.programType,
      goal_phase: profile.goalPhase,
      location: activeWorkout.location || profile.activeLocation || 'gym',
      scope,
      calibration: continuity.prescription.calibrationSource || 'STANDARD',
      source: 'swap_modal',
    });

    if (scope === 'permanent' && onUpdateProfile) {
      const targetPlanId = trainingPlan?.id ?? getSessionPlanId(activeWorkout) ?? 'starter_6wk';
      const newOverride: ProgramExerciseOverride = {
        id: `ov-swap-${swappingExercise.exerciseId}-${newDef.id}-${Date.now()}`,
        planId: targetPlanId,
        kind: 'swap_exercise',
        targetExerciseId: swappingExercise.exerciseId,
        targetExerciseName: swappingExercise.name,
        replacementExerciseId: newDef.id,
        replacementExerciseName: newDef.name,
        replacementPillar: newDef.pillar,
        replacementEquipment: newDef.equipment,
        replacementRepRange: [rx.minReps, rx.maxReps],
        ...(rx.isTimed ? { replacementIsTimed: true, replacementDurationSeconds: rx.targetDurationSeconds || 45 } : {}),
        reason: 'permanent gym-floor swap',
        createdAt: new Date().toISOString(),
      };
      const prevOverrides = (profile.programOverrides ?? []).filter(
        (ov) =>
          !(
            ov.planId === targetPlanId &&
            ov.kind === 'swap_exercise' &&
            ov.targetExerciseId === swappingExercise.exerciseId
          )
      );
      onUpdateProfile({ programOverrides: [...prevOverrides, newOverride] });
    }

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
      profile.goalPhase,
      units.unit
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

  // Unified advisory recovery status (combines local muscle recovery with systemic Amber Shield 1.2x multiplier).
  // Never hides today's queued workout behind a blocking rest card; only shows today's finished summary
  // after the athlete already completed a workout today.
  const recoveryGate = evaluateSessionRecovery(activeWorkout, workouts, exerciseCatalog, Date.now(), readiness.state);
  const showTrainedTodaySummary =
    recoveryGate.trainedToday && completedSets === 0 && !activeWorkout.recoveryOverride;
  const hasRecoveryAdvisory =
    !recoveryGate.trainedToday && (!recoveryGate.isReady || readiness.state === 'Amber Shield');
  const handleModulateSession = (mode: 'trim_sets' | 'conservative_rir' | 'both') => {
    trackMetric('recovery.modulation_applied', 1, {
      action: mode,
      readiness: readiness.state,
    });
    onUpdateWorkout(applyRecoveryModulation(activeWorkout, mode));
  };
  const handleRestoreModulation = () => {
    trackMetric('recovery.modulation_applied', 1, {
      action: 'restore',
      readiness: readiness.state,
    });
    onUpdateWorkout(clearRecoveryModulation(activeWorkout));
  };
  const recoveredAlternative: SplitDayType | null = (() => {
    if (!onSwitchSplitDay || recoveryGate.trainedToday) return null;
    const recovery = computeMuscleRecovery(workouts, exerciseCatalog, Date.now(), readiness.state);
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
    if (!showTrainedTodaySummary) return null;
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
  }, [showTrainedTodaySummary, workouts, biometrics, exerciseCatalog, profile, activities, bodyweightEmaKg, units.unit]);
  const sessionReport = todayFinished?.finish.report ?? null;

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

  const HOME_GEAR_LABELS: Record<string, string> = {
    dumbbells: 'Dumbbells',
    bench: 'Bench',
    pullup_bar: 'Pull-up bar',
    trx: 'TRX',
    bands: 'Bands',
  };
  const homeGearDetail =
    profile.homeEquipment && profile.homeEquipment.length > 0
      ? profile.homeEquipment.map((t) => HOME_GEAR_LABELS[t] || t).join(', ')
      : 'Configured in Settings';

  const LOCATION_CONFIG: Array<{ id: TrainingLocation; label: string; detail: string }> = [
    { id: 'gym', label: 'Gym', detail: 'Barbell, dumbbells & machines' },
    { id: 'home', label: 'Home', detail: homeGearDetail },
    { id: 'travel', label: 'Bodyweight / No equipment', detail: 'Zero-equipment variations' },
  ];

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
  // After an explicit rest day, an unfinished session is queued as next rather than today's.
  const isNextSession = !todayFinished && activeWorkout.date > localDateString();
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
        exerciseCatalog,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, activeWorkout.id, activeWorkout.date, activeWorkout.programWorkoutNumber, profile.programType, trainingPlan, exerciseCatalog]
  );

  // Exercise overviews: personal notes written from the athlete's knowledge graph (engine-memoized).
  const savedWeeklyVolume = useMemo(
    () => calculateWeeklyMuscleVolume(workouts, exerciseCatalog),
    [workouts, exerciseCatalog]
  );
  const knowledgeGraph = useMemo(
    () =>
      buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, savedWeeklyVolume, activities),
    [workouts, biometrics, exerciseCatalog, profile, savedWeeklyVolume, activities]
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
        const muscleLabel = def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined;
        return buildExerciseNoteFacts({
          exercise: ex,
          insight: buildExerciseInsight(ex, workouts, readiness.state, measuredBodyweightKg, 12, (kg) => units.formatPrecise(kg), biometrics, muscleLabel, profile.goalPhase),
          workouts,
          readinessState: readiness.state,
          knowledgeGraph,
          primaryMuscle: def?.primaryMuscle,
          muscleLabel,
          programLabel,
          goalPhase: profile.goalPhase,
          formatWeight: (kg) => units.formatPrecise(kg),
        });
      }),
    // Facts use planned targets and history only, so ticking sets doesn't rewrite the notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWorkout.id, activeWorkout.exercises.map((e) => `${e.id}:${e.exerciseId}:${e.sets.length}`).join('|'), workouts, readiness.state, knowledgeGraph, programLabel, profile.goalPhase, units.unit, measuredBodyweightKg, biometrics]
  );
  const [generatedNotes, setGeneratedNotes] = useState<Record<string, string>>({});
  const noteKeys = exerciseNotes.map((n) => n.key).join('|');
  useEffect(() => {
    if (showTrainedTodaySummary) return;
    let cancelled = false;
    const cached: Record<string, string> = {};
    for (const n of exerciseNotes) {
      const hit = acceptExerciseNote(getCachedExerciseNote(n.key) ?? null, n);
      if (hit) cached[n.key] = hit;
    }
    setGeneratedNotes(cached);
    const timer = setTimeout(() => {
      (async () => {
        // Economical AI budget: per-exercise card rewrites run automatically only on free local
        // on-device models (Gemini Nano). Over the cloud proxy, deterministic 2-line exercise briefs
        // already carry exact kg/lb history & stimulus without firing 6-8 background API calls per workout.
        if (cancelled || (await getActiveModelTier()) !== 'local') return;
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
  }, [noteKeys, showTrainedTodaySummary]);

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

  const workoutMenuItems: OverflowMenuItem[] = [
    ...LOCATION_CONFIG.map((loc, idx) => ({
      id: `loc-${loc.id}`,
      label: loc.label,
      detail: loc.detail,
      role: 'menuitemradio' as const,
      checked: currentLoc === loc.id,
      sectionLabel: idx === 0 ? 'Location' : undefined,
      onSelect: () => {
        if (onSwitchLocation && loc.id !== currentLoc) {
          triggerHaptic('medium');
          onSwitchLocation(loc.id);
        }
      },
    })),
    ...(!todayFinished
      ? [
          {
            id: 'add-exercise',
            label: 'Add exercise',
            icon: <Plus className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
            sectionBorderTop: true,
            onSelect: () => {
              triggerHaptic('light');
              setAddExerciseQuery('');
              setShowAddExerciseModal(true);
            },
          },
        ]
      : []),
    {
      id: 'customize-workout',
      label: 'Customize workout page',
      trailing: `${activeDisplayCount}/7`,
      icon: <SlidersHorizontal className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      sectionBorderTop: Boolean(todayFinished),
      onSelect: () => {
        triggerHaptic('light');
        setShowWorkoutDisplayModal(true);
      },
    },
    {
      id: 'log-rest-day',
      label: 'Log rest day',
      icon: <Calendar className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      onSelect: () => {
        triggerHaptic('medium');
        onShiftWorkout();
      },
    },
    ...(recentCompletedWorkouts.length > 0
      ? [
          {
            id: 'last-workout',
            label: 'Last workout',
            icon: <History className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
            onSelect: () => {
              setPreviewPastWorkout(recentCompletedWorkouts[0]);
            },
          },
        ]
      : []),
  ];

  const todayDateStr = localDateString();
  const todayStripDay = stripDays.find((d) => d.isToday);
  const isRestDayToday = activeWorkout.date > todayDateStr && completedSets === 0;
  // Recovery is advisory, never blocking: only an explicitly logged rest day hides today's exercises.
  const isNonTrainingToday = !todayFinished && isRestDayToday;
  const rawInspectedDay = selectedStripDate ? stripDays.find((d) => d.date === selectedStripDate) ?? null : null;
  const inspectedLiftingWorkout = useMemo(() => {
    if (!rawInspectedDay || rawInspectedDay.date > todayDateStr) return null;
    return (
      workouts
        .filter((w) => w.completed && localDateString(new Date(getWorkoutCompletedAt(w))) === rawInspectedDay.date)
        .sort((x, y) => getWorkoutCompletedAt(x) - getWorkoutCompletedAt(y))
        .pop() ?? null
    );
  }, [rawInspectedDay, todayDateStr, workouts]);
  // Only upcoming, active (today), and completed program sessions can be inspected from the week strip.
  // Past rest days (even with Health Connect steps/walks) never open as historical workouts.
  const inspectedDay = rawInspectedDay
    ? rawInspectedDay.isToday
      ? rawInspectedDay
      : rawInspectedDay.date < todayDateStr
      ? inspectedLiftingWorkout
        ? rawInspectedDay
        : null
      : rawInspectedDay.status === 'planned' && rawInspectedDay.plannedSession
      ? rawInspectedDay
      : null
    : null;
  const isPastInspected = Boolean(inspectedDay && inspectedDay.date < todayDateStr && inspectedLiftingWorkout);
  const isFutureInspected = Boolean(inspectedDay && inspectedDay.date > todayDateStr);
  const isNonTrainingView = inspectedDay
    ? inspectedDay.isToday
      ? isNonTrainingToday
      : isFutureInspected
      ? true
      : !inspectedLiftingWorkout
    : isNonTrainingToday;
  const showActiveExercises = !isNonTrainingView && (!inspectedDay || inspectedDay.isToday) && !todayFinished;

  // Never surface step count while an active workout is shown or when inspecting past/future days from the week strip.
  const overviewStepDay =
    !showActiveExercises && !isFutureInspected && !isPastInspected && isNonTrainingToday
      ? todayStripDay ?? { date: todayDateStr, label: 'TODAY', status: 'rest' as const, isToday: true }
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
        deps={[hasRecoveryAdvisory, sessionReport, isNonTrainingView]}
      />
      {workoutDisplay.showSessionCard && !isNonTrainingView && !isPastInspected && (
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
        selectedDate={inspectedDay?.date ?? null}
        onSelectDay={(day) => {
          if (day.isToday) {
            setSelectedStripDate(null);
            return;
          }
          setSelectedStripDate((prev) => (prev === day.date ? null : day.date));
        }}
        menuItems={workoutMenuItems}
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
              <CompletedExerciseCard
                key={ex.id}
                summary={ex}
                onOpenDetail={() => setDetailExerciseId(ex.exerciseId)}
              />
            ))}
          </>
        );
      })() : !isNonTrainingView && !isPastInspected ? (
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
          {workoutDisplay.showRecoveryCard && hasRecoveryMechanism && (
            <RecoveryScoreCard
              readiness={readiness}
              latestBiometrics={latestBiometrics}
              isConnected={isWearableConnected(profile)}
              recoveryGate={recoveryGate}
              set1Confirmation={evaluateSet1RirConfirmation(activeWorkout)}
              activeModulation={activeWorkout.recoveryModulation}
              onModulateSession={handleModulateSession}
              onRestoreModulation={handleRestoreModulation}
              onOpen={onOpenWatchSync}
              onAskCoach={onOpenCoach ? () => onOpenCoach() : undefined}
            />
          )}
        </>
      ) : null}

      {workoutDisplay.showStepsCard && overviewStepDay && !showActiveExercises && !isFutureInspected && !isPastInspected && isNonTrainingToday && (
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
          <p className="wk-display mt-3">
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
                  className="pt-2 border-t"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setDetailExerciseId(ex.exerciseId);
                    }}
                    aria-label={`Open details for ${formatSentenceCase(ex.name)}`}
                    className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
                  >
                    <span className="wk-subhead min-w-0 truncate">
                      {formatSentenceCase(ex.name)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="wk-caption tabular-nums">
                        {ex.setsCount} × {ex.targetLabel}
                      </span>
                      <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
                    </div>
                  </button>
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

      {isNonTrainingView && !isFutureInspected && !isPastInspected && (
        <ActiveDayCard
          thisWeek={thisWeekActiveDay}
          recent={recentActivities}
          onLog={onLogActivity}
          onRemove={onRemoveActivity}
          onOpenApps={onOpenActivityApps}
        />
      )}

      {isRestDayToday && (!inspectedDay || inspectedDay.isToday) && !todayFinished && (
        <section aria-label="Rest day status" className="wk-card">
          <h2 className="wk-h1">Rest day logged</h2>
          <p className="wk-body mt-2 max-w-prose">
            {activeWorkout.name} is queued for your next training day. Focus on steps, active recovery or rest today.
          </p>
          <div className="flex flex-col gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onUpdateWorkout({ ...activeWorkout, date: todayDateStr });
              }}
              className="wk-btn-secondary w-full"
            >
              Train today instead
            </button>
            {onOpenCoach && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenCoach();
                }}
                className="wk-btn-secondary w-full min-h-[44px] justify-center gap-2"
                style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
              >
                <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--color-coach-accent)' }} strokeWidth={2.2} aria-hidden="true" />
                <span>Ask Treise about today</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Calm, non-blocking recovery advisory indicator when no wearable card already shows it */}
      {showActiveExercises &&
        hasRecoveryAdvisory &&
        !(workoutDisplay.showRecoveryCard && hasRecoveryMechanism) && (
          <section aria-label="Recovery advisory" className="wk-card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="wk-subhead">
                  {readiness.state === 'Amber Shield' ? 'Low recovery today' : 'Muscles still recovering'}
                </h2>
                <p className="wk-body mt-1 max-w-prose">
                  {recoveryGate.advisoryMessage}
                </p>
              </div>
              <span
                className="wk-pill shrink-0"
                style={{ background: 'var(--color-status-warning-soft)', color: 'var(--color-status-warning)' }}
              >
                Advisory
              </span>
            </div>

            {recoveryGate.limitingMuscles.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Muscle recovery">
                {recoveryGate.limitingMuscles.slice(0, 3).map((m) => (
                  <li key={m.muscle}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                        {MUSCLE_FRIENDLY_NAMES[m.muscle]}
                      </span>
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

            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="wk-label">Optional modulation</span>
                {activeWorkout.recoveryModulation && (
                  <span
                    className="wk-pill"
                    style={{ background: 'var(--color-status-warning-soft)', color: 'var(--color-status-warning)' }}
                  >
                    {activeWorkout.recoveryModulation.mode === 'trim_sets'
                      ? '−1 set/lift'
                      : activeWorkout.recoveryModulation.mode === 'conservative_rir'
                      ? '2–3 RIR'
                      : '−1 set & 2–3 RIR'}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={
                    activeWorkout.recoveryModulation?.mode === 'trim_sets' ||
                    activeWorkout.recoveryModulation?.mode === 'both'
                  }
                  onClick={() => {
                    triggerHaptic('light');
                    if (activeWorkout.recoveryModulation?.mode === 'trim_sets') handleRestoreModulation();
                    else
                      handleModulateSession(
                        activeWorkout.recoveryModulation?.mode === 'conservative_rir' ? 'both' : 'trim_sets'
                      );
                  }}
                  className="wk-btn-secondary w-full min-h-[44px] justify-center"
                >
                  Trim 1 set / lift
                </button>
                <button
                  type="button"
                  aria-pressed={
                    activeWorkout.recoveryModulation?.mode === 'conservative_rir' ||
                    activeWorkout.recoveryModulation?.mode === 'both'
                  }
                  onClick={() => {
                    triggerHaptic('light');
                    if (activeWorkout.recoveryModulation?.mode === 'conservative_rir') handleRestoreModulation();
                    else
                      handleModulateSession(
                        activeWorkout.recoveryModulation?.mode === 'trim_sets' ? 'both' : 'conservative_rir'
                      );
                  }}
                  className="wk-btn-secondary w-full min-h-[44px] justify-center"
                >
                  Shift to 2–3 RIR
                </button>
              </div>
              {activeWorkout.recoveryModulation && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    handleRestoreModulation();
                  }}
                  className="wk-btn-secondary w-full min-h-[44px] justify-center"
                >
                  Restore planned session
                </button>
              )}
              {recoveredAlternative && onSwitchSplitDay && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onSwitchSplitDay(recoveredAlternative);
                  }}
                  className="wk-btn-secondary w-full min-h-[44px] justify-center"
                >
                  Switch to {recoveredAlternative} instead
                </button>
              )}
            </div>
          </section>
        )}

      {inspectedDay && !inspectedDay.isToday && inspectedLiftingWorkout && (() => {
        const doneSetsCount = inspectedLiftingWorkout.exercises.reduce(
          (acc, ex) => acc + ex.sets.filter((s) => s.completed && !s.isWarmup && s.setType !== 'warmup').length,
          0
        );
        return (
          <>
            <section aria-label="Completed training day" className="wk-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="wk-h1">
                      {formatSentenceCase(planWorkoutLabel(inspectedLiftingWorkout.name))}
                    </h2>
                    <span
                      className="wk-pill"
                      style={{ background: 'var(--color-status-positive-soft)', color: 'var(--wk-accent)' }}
                    >
                      Completed
                    </span>
                  </div>
                  <p className="wk-caption mt-1">
                    {inspectedDay.label} ({formatDayShort(inspectedDay.date)}) • {doneSetsCount} {doneSetsCount === 1 ? 'set' : 'sets'}
                    {inspectedLiftingWorkout.durationMinutes && inspectedLiftingWorkout.durationMinutes > 0
                      ? ` • ${Math.round(inspectedLiftingWorkout.durationMinutes)} min`
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
            </section>
            {buildCompletedExerciseSummaries({
              finished: inspectedLiftingWorkout,
              workouts,
              bodyweightKg: hasWeighIn ? bodyweightEmaKg : 0,
              biometrics,
              formatWeight: (kg) => units.formatPrecise(kg),
            }).map((ex) => (
              <CompletedExerciseCard
                key={ex.id}
                summary={ex}
                onOpenDetail={() => setDetailExerciseId(ex.exerciseId)}
              />
            ))}
          </>
        );
      })()}

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
            bodyweightEmaKg,
            ex.exerciseId,
            ex.pillar,
            ex.name
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
            },
            profile.weightUnit || 'kg',
            standardsAge(profile),
            ex.exerciseId,
            ex.name
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
              exerciseDef={def}
              exerciseCatalog={exerciseCatalog}
              workouts={liveInsightWorkouts}
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
                const pending =
                  pendingRecalRef.current && pendingRecalRef.current.exerciseSessionId === ex.id
                    ? pendingRecalRef.current
                    : null;
                if (pending) pendingRecalRef.current = null;
                onSetCompleted(
                  ex.name,
                  s?.setNumber || 1,
                  s,
                  ex,
                  pending
                    ? {
                        recalibrationStatus: pending.recalibrationStatus,
                        leverageUpgradeNudge: pending.leverageUpgradeNudge,
                        onApplyLeverageUpgrade: pending.leverageUpgradeNudge
                          ? () => handleApplyLeverageUpgrade(ex.id, pending.leverageUpgradeNudge!)
                          : undefined,
                      }
                    : undefined
                );
              }}
              onAddSet={(isWarmup) => handleAddSet(ex.id, isWarmup)}
              onRemoveSet={
                ex.sets.length > 1 && ex.sets.some((s) => !s.completed)
                  ? () => handleRemoveSet(ex.id)
                  : undefined
              }
              onMoveExerciseDown={
                !isBlockCompleted && index < activeWorkout.exercises.length - 1
                  ? () => handleMoveExerciseDown(ex.id)
                  : undefined
              }
              onSkipExerciseToday={
                activeWorkout.exercises.length > 1 && !ex.sets.some((s) => s.completed)
                  ? () => handleSkipExerciseToday(ex.id)
                  : undefined
              }
              onOpenDetail={() => setDetailExerciseId(ex.id)}
              onOpenSwap={() => setSwappingExercise(ex)}
              onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
              muscleLabel={def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined}
              previousSets={getPreviousWorkingSets(ex.exerciseId, workouts)}
              insight={buildExerciseInsight(ex, liveInsightWorkouts, readiness.state, measuredBodyweightKg, 12, (kg) => units.formatPrecise(kg), biometrics, def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined, profile.goalPhase)}
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
              showRir={showRir}
            />
          );
        })}
      </div>

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
          <span className="wk-caption block tabular-nums" style={{ opacity: 0.75 }}>
            {completedSets} of {totalSets} sets logged
            {liveTonnageKg > 0 ? ` • ${Math.round(units.toDisplay(liveTonnageKg)).toLocaleString()} ${units.unit}` : ''}
          </span>
        )}
      </button>
      </>)}
      </div>

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
                  {
                    key: 'showRirTracking' as const,
                    title: 'Track RIR (reps in reserve)',
                    description: 'Show RIR input column on every set. Off by default for new lifters.',
                  },
                ]
              ).map((item) => {
                const enabled = item.key === 'showRirTracking' ? showRir : Boolean(workoutDisplay[item.key]);
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

      {/* Exercise Drill-In Detail Modal (canonical single view for active, finished, past & upcoming exercises) */}
      {(() => {
        if (!detailExerciseId) return null;
        const entry = exercisePrescriptions.find(
          ({ ex }) => ex.id === detailExerciseId || ex.exerciseId === detailExerciseId
        );
        if (entry) {
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
              exerciseCatalog={exerciseCatalog}
              workouts={detailInsightWorkouts}
              activeWorkout={activeWorkout}
              biometrics={biometrics}
              insight={buildExerciseInsight(
                detailEx,
                detailInsightWorkouts,
                readiness.state,
                measuredBodyweightKg,
                12,
                (kg) => units.formatPrecise(kg),
                biometrics,
                detailDef ? MUSCLE_FRIENDLY_NAMES[detailDef.primaryMuscle] : undefined,
                profile.goalPhase
              )}
              bodyweightKg={measuredBodyweightKg}
              muscleLabel={detailDef ? MUSCLE_FRIENDLY_NAMES[detailDef.primaryMuscle] : undefined}
              goalPhase={profile.goalPhase}
              prescription={entry.prescription}
              readinessState={readiness.state}
              onAddSet={(isWarmup) => handleAddSet(detailEx.id, isWarmup)}
              onOpenSwap={() => setSwappingExercise(detailEx)}
              onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
              onOpenNotesHistory={onOpenInsights ? () => onOpenInsights(detailEx.exerciseId) : undefined}
              intervention={programInterventions.find((i) => i.exerciseId === detailEx.exerciseId)}
              onAcceptIntervention={onAcceptIntervention}
              onDismissIntervention={onDismissIntervention}
              onAskCoachToAdapt={
                onOpenCoachIntervention
                  ? (prompt, exerciseId) =>
                      onOpenCoachIntervention({
                        prompt,
                        exerciseId: exerciseId ?? detailEx.exerciseId,
                      })
                  : undefined
              }
              onAskCoach={
                onOpenCoach
                  ? (exerciseId) => onOpenCoach({ exerciseId })
                  : undefined
              }
              onClose={() => setDetailExerciseId(null)}
            />
          );
        }

        const inspected = buildInspectExerciseSession({
          exerciseId: detailExerciseId,
          exerciseCatalog,
          workouts,
        });
        if (!inspected) return null;
        return (
          <ExerciseDetailModal
            exercise={inspected.exercise}
            exerciseDef={inspected.exerciseDef}
            exerciseCatalog={exerciseCatalog}
            workouts={workouts}
            biometrics={biometrics}
            bodyweightKg={measuredBodyweightKg}
            muscleLabel={
              inspected.exerciseDef ? MUSCLE_FRIENDLY_NAMES[inspected.exerciseDef.primaryMuscle] : undefined
            }
            goalPhase={profile.goalPhase}
            readinessState={readiness.state}
            onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
            onOpenNotesHistory={onOpenInsights ? () => onOpenInsights(inspected.exercise.exerciseId) : undefined}
            intervention={programInterventions.find((i) => i.exerciseId === inspected.exercise.exerciseId)}
            onAcceptIntervention={onAcceptIntervention}
            onDismissIntervention={onDismissIntervention}
            onAskCoachToAdapt={
              onOpenCoachIntervention
                ? (prompt, exerciseId) =>
                    onOpenCoachIntervention({
                      prompt,
                      exerciseId: exerciseId ?? inspected.exercise.exerciseId,
                    })
                : undefined
            }
            onAskCoach={
              onOpenCoach
                ? (exerciseId) => onOpenCoach({ exerciseId })
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
          activeOverlay={profile.activeEnvironmentOverlay}
          storedProgressionStates={profile.exerciseProgressionStates}
          athleteMemories={profile.athleteMemories}
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
          location={activeLocationForInventory}
          inventory={activeInventory}
          onSaveInventory={handleSaveEquipmentInventory}
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
          onDebriefWithCoach={
            onOpenCoach
              ? () => {
                  handleCloseSummary();
                  onOpenCoach({ prompt: "What did I do last workout and what's next?" });
                }
              : undefined
          }
        />
      )}

      {/* Add Exercise to Today's Session Modal */}
      {showAddExerciseModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add exercise to workout"
          className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-md"
          style={{ background: 'var(--color-bg-scrim)' }}
          onClick={() => setShowAddExerciseModal(false)}
        >
          <div
            className="wk-card w-full sm:max-w-md rounded-b-none sm:rounded-2xl max-h-[85vh] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="wk-h1">Add exercise</h3>
                <p className="wk-caption mt-1">
                  Adds to today&apos;s session with your personalized starting weight
                </p>
              </div>
              <button
                type="button"
                aria-label="Close add exercise modal"
                onClick={() => setShowAddExerciseModal(false)}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--wk-raised)',
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            </div>

            <div className="relative">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-text-muted)' }}
                aria-hidden="true"
              />
              <input
                type="search"
                value={addExerciseQuery}
                onChange={(e) => setAddExerciseQuery(e.target.value)}
                placeholder="Search exercise, muscle, implement, or category…"
                aria-label="Search exercises"
                className="wk-field w-full pl-10"
              />
            </div>

            <div className="overflow-y-auto space-y-2 pr-1">
              {(() => {
                const existingIds = new Set(activeWorkout.exercises.map((e) => e.exerciseId));
                const q = addExerciseQuery.trim().toLowerCase();
                const candidates = exerciseCatalog
                  .filter((def) => !existingIds.has(def.id))
                  .filter((def) => {
                    if (!q) return true;
                    const friendlyMuscle = MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] ?? def.primaryMuscle;
                    return (
                      def.name.toLowerCase().includes(q) ||
                      friendlyMuscle.toLowerCase().includes(q) ||
                      def.equipment.toLowerCase().includes(q) ||
                      (def.implementLabel?.toLowerCase().includes(q) ?? false) ||
                      (def.category?.toLowerCase().includes(q) ?? false) ||
                      (def.movementFamilyLabel?.toLowerCase().includes(q) ?? false) ||
                      (def.aliases?.some((a) => a.toLowerCase().includes(q)) ?? false)
                    );
                  })
                  .slice(0, 50);

                if (candidates.length === 0) {
                  return (
                    <p className="wk-body text-center py-6" style={{ color: 'var(--color-text-secondary)' }}>
                      No matching exercises available to add.
                    </p>
                  );
                }

                return candidates.map((def) => {
                  const friendlyMuscle = MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] ?? def.primaryMuscle;
                  const implementDisplay = def.implementLabel || formatSentenceCase(def.equipment);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('success');
                        handleAddExerciseToSession(def);
                      }}
                      className="wk-raised w-full text-left flex items-center justify-between gap-3 min-h-[48px] active:scale-[0.99] transition-transform"
                    >
                      <span className="min-w-0">
                        <span className="wk-subhead block truncate">{formatSentenceCase(def.name)}</span>
                        <span className="wk-caption block mt-1">
                          {friendlyMuscle} • {implementDisplay}
                          {def.category && def.category !== 'Strength' ? ` • ${def.category}` : ''}
                        </span>
                      </span>
                      <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Past Workout Preview / Edit / Delete Modal */}
      {previewPastWorkout && (
        <PastWorkoutModal
          workoutNumber={previewPastWorkout.programWorkoutNumber}
          title={previewPastWorkout.name}
          session={workouts.find((w) => w.id === previewPastWorkout.id) ?? previewPastWorkout}
          onSelectExercise={(ex) => {
            setPreviewPastWorkout(null);
            setDetailExerciseId(ex.exerciseId);
          }}
          onSaveWorkout={onUpdatePastWorkout}
          onDeleteWorkout={onDeletePastWorkout}
          onClose={() => setPreviewPastWorkout(null)}
        />
      )}
    </div>
  );
};
