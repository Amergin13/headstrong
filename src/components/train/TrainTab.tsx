import React, { useState } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  ReadinessState,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../../engine/types';
import { ReadinessEvaluation } from '../../engine/readiness';
import { ReadinessBanner } from './ReadinessBanner';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseSwapModal } from './ExerciseSwapModal';
import { PlateCalculatorModal } from './PlateCalculatorModal';
import { WorkoutSummaryModal } from './WorkoutSummaryModal';
import { prescribeDoubleProgression } from '../../engine/progression';
import { calculateSubTierQuest } from '../../engine/strengthStandards';
import {
  calculateE1RM,
  formatImplementWeightLabel,
} from '../../engine/e1rm';
import { getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import {
  getHypertrophyQueueRecommendation,
} from '../../services/workoutGenerator';
import {
  CheckCircle2,
  Plus,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Calendar,
  History,
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
  onSelectReadinessState: (state: ReadinessState) => void;
  onSetCompleted: (exerciseName: string, setNumber: number) => void;
  onFinishWorkout: () => void;
  onShiftWorkout: () => void;
  onSwitchLocation?: (location: TrainingLocation) => void;
}

const MESO_WEEK_PHASE_NAMES: Record<number, { name: string; rule: string }> = {
  1: { name: 'Smooth Start', rule: 'Base sets • Leave 2–3 reps in the tank' },
  2: { name: 'Building Up', rule: 'Adding sets • Leave 2 reps in the tank' },
  3: { name: 'Main Growth Phase', rule: 'Target zone • Leave 1–2 reps in the tank' },
  4: { name: 'High Effort Phase', rule: 'High sets • Leave 1 rep in the tank' },
  5: { name: 'Peak Week', rule: 'Peak sets • Leave 0–1 reps in the tank' },
  6: { name: 'Light Recovery Week', rule: 'Half sets • Leave 3–4 easy reps in the tank' },
};

const GOAL_FRIENDLY_NAME: Record<GoalPhase, string> = {
  'Lean Bulk': 'Build Muscle',
  'Cut / Recomp': 'Lose Fat',
  Maingain: 'Stay Lean',
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
  onSelectReadinessState,
  onSetCompleted,
  onFinishWorkout,
  onShiftWorkout,
  onSwitchLocation,
}) => {
  const [swappingExercise, setSwappingExercise] = useState<ExerciseSession | null>(null);
  const [plateCalcWeight, setPlateCalcWeight] = useState<number | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [previewPastWorkout, setPreviewPastWorkout] = useState<WorkoutSession | null>(null);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);
  const [deletedSetBackup, setDeletedSetBackup] = useState<{
    exerciseId: string;
    exerciseName: string;
    set: WorkoutSet;
  } | null>(null);

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
      const lastSet = ex.sets[ex.sets.length - 1];
      const baseWeight = lastSet?.actualWeightKg ?? lastSet?.targetWeightKg ?? 20;
      const warmupWeight = Math.max(10, Math.round((baseWeight * 0.6) / 2.5) * 2.5);

      if (isWarmup) {
        const warmupSet: WorkoutSet = {
          id: `set-warmup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          setNumber: 1,
          targetWeightKg: warmupWeight,
          actualWeightKg: warmupWeight,
          targetReps: 8,
          actualReps: 8,
          targetRir: 3,
          actualRir: 3,
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

      const newSet: WorkoutSet = {
        id: `set-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        setNumber: ex.sets.length + 1,
        targetWeightKg: baseWeight,
        targetReps: lastSet?.actualReps ?? lastSet?.targetReps ?? ex.minReps,
        targetRir: 2,
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
    const targetEx = activeWorkout.exercises.find((e) => e.id === exerciseId);
    const removedSet = targetEx?.sets.find((s) => s.id === setId);
    if (targetEx && removedSet) {
      setDeletedSetBackup({
        exerciseId,
        exerciseName: targetEx.name,
        set: removedSet,
      });
    }

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

  const handleUndoDeleteSet = () => {
    if (!deletedSetBackup) return;
    triggerHaptic('light');
    const nextExercises = activeWorkout.exercises.map((ex) => {
      if (ex.id !== deletedSetBackup.exerciseId) return ex;
      const restored = [...ex.sets, deletedSetBackup.set].map((s, idx) => ({
        ...s,
        setNumber: idx + 1,
      }));
      return {
        ...ex,
        sets: restored,
      };
    });
    onUpdateWorkout({ ...activeWorkout, exercises: nextExercises });
    setDeletedSetBackup(null);
  };

  const handleAddExerciseToSession = (def: ExerciseDefinition) => {
    triggerHaptic('medium');
    const meta = getExerciseBiomechanicalMeta(def);
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
          targetWeightKg: def.equipment === 'dumbbell' ? 16 : 40,
          targetReps: def.defaultRepRange[0],
          targetRir: 2,
          completed: false,
          setType: 'working',
        },
        {
          id: `s-${Date.now()}-2`,
          setNumber: 2,
          targetWeightKg: def.equipment === 'dumbbell' ? 16 : 40,
          targetReps: def.defaultRepRange[0],
          targetRir: 2,
          completed: false,
          setType: 'working',
        },
        {
          id: `s-${Date.now()}-3`,
          setNumber: 3,
          targetWeightKg: def.equipment === 'dumbbell' ? 16 : 40,
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
      bodyweightEmaKg
    );
    const hydratedEx: ExerciseSession = {
      ...seedEx,
      sets: seedEx.sets.map((s, idx) => ({
        ...s,
        targetWeightKg: prescription.nextWeightKg,
        targetReps: prescription.nextTargetReps[idx] ?? def.defaultRepRange[0],
      })),
    };

    onUpdateWorkout({
      ...activeWorkout,
      exercises: [...activeWorkout.exercises, hydratedEx],
    });
    setShowAddExerciseModal(false);
  };

  const handleConfirmSwap = (newDef: ExerciseDefinition, convertedWeightKg: number) => {
    if (!swappingExercise) return;
    const meta = getExerciseBiomechanicalMeta(newDef);

    const nextExercises = activeWorkout.exercises.map((ex) => {
      if (ex.id !== swappingExercise.id) return ex;
      return {
        ...ex,
        exerciseId: newDef.id,
        name: newDef.name,
        equipment: newDef.equipment,
        isRdl: newDef.isRdl,
        isWeightedCalisthenic: newDef.isWeightedCalisthenic,
        isIsolation: meta.isIsolation,
        resistanceProfile: meta.resistanceProfile,
        sfrScore: meta.sfrScore,
        minReps: newDef.defaultRepRange[0],
        maxReps: newDef.defaultRepRange[1],
        sets: ex.sets.map((s) => ({
          ...s,
          targetWeightKg:
            s.isWarmup || s.setType === 'warmup'
              ? Math.max(8, Math.round((convertedWeightKg * 0.6) / 2) * 2)
              : convertedWeightKg,
          actualWeightKg:
            s.isWarmup || s.setType === 'warmup'
              ? Math.max(8, Math.round((convertedWeightKg * 0.6) / 2) * 2)
              : convertedWeightKg,
          targetReps: newDef.defaultRepRange[0],
          actualReps: newDef.defaultRepRange[0],
        })),
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

  const exercisePrescriptions = activeWorkout.exercises.map((ex) => {
    const prescription = prescribeDoubleProgression(
      ex,
      readiness.state,
      workouts,
      bodyweightEmaKg
    );
    return { ex, prescription };
  });

  const weightJumpItems = exercisePrescriptions.filter(
    (item) => item.prescription.weightChanged && readiness.state !== 'Amber Shield'
  );
  const repJumpItems = exercisePrescriptions.filter(
    (item) =>
      item.prescription.repsChanged &&
      !item.prescription.weightChanged &&
      readiness.state !== 'Amber Shield'
  );

  const handleFinishWorkoutClick = () => {
    triggerHaptic('success');
    setShowSummaryModal(true);
  };

  const handleCloseSummary = () => {
    setShowSummaryModal(false);
    onFinishWorkout();
  };

  const mesoWeek = profile.mesocycleWeek || 3;
  const phaseMeta = MESO_WEEK_PHASE_NAMES[mesoWeek] || MESO_WEEK_PHASE_NAMES[3];
  const friendlyGoal = GOAL_FRIENDLY_NAME[profile.goalPhase] || profile.goalPhase;
  const recentCompletedWorkouts = workouts.filter((w) => w.completed).slice(0, 4);
  const currentLoc = activeWorkout.location || profile.activeLocation || 'gym';
  const queueRec = getHypertrophyQueueRecommendation(
    activeWorkout.splitDay,
    workouts,
    activeWorkout.date
  );

  return (
    <div className="space-y-3.5 pb-28">
      {/* 1. UNIFIED HERO CARD: Opinionated Asynchronous Hypertrophy Queue & Session Goals */}
      <div className="rounded-3xl surface-glass border border-white/[0.1] p-4 space-y-3">
        {/* A. Compact Context Header + Rest / History Toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary border border-brand-primary/30 text-xs font-bold uppercase tracking-wider">
              Up Next
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-slate-200 border border-white/[0.08] text-xs font-semibold">
              Week {mesoWeek} of 6 • {phaseMeta.name}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowScheduleOptions(!showScheduleOptions);
            }}
            aria-expanded={showScheduleOptions}
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-slate-200 hover:text-white flex items-center space-x-1 shrink-0 transition-colors"
          >
            <span>Rest / History</span>
            {showScheduleOptions ? (
              <ChevronUp className="w-3.5 h-3.5 stroke-[2]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 stroke-[2]" />
            )}
          </button>
        </div>

        {/* B. Primary Focal Point: Single Opinionated Workout Recommendation & Recovery Window */}
        <div className="space-y-1.5">
          <h1 className="font-bold text-lg text-white tracking-tight">
            {activeWorkout.name}
          </h1>
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
              <span>✓ {queueRec.recoveryBadge}</span>
            </span>
            <span className="text-xs text-slate-300">
              {activeWorkout.exercises.length} exercises • {totalSets} sets • {friendlyGoal}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {queueRec.scienceRationale}
          </p>
        </div>

        {/* C. Single Canonical Equipment Location Switcher (Full Gym | At Home | Travel) */}
        <div
          role="group"
          aria-label="Select training location and equipment"
          className="grid grid-cols-3 gap-1 bg-black/50 p-1 rounded-2xl border border-white/[0.08]"
        >
          {(
            [
              { id: 'gym', label: 'Full Gym' },
              { id: 'home', label: 'At Home' },
              { id: 'travel', label: 'Travel' },
            ] as const
          ).map((loc) => {
            const isSelected = currentLoc === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  if (onSwitchLocation && loc.id !== currentLoc) {
                    triggerHaptic('medium');
                    onSwitchLocation(loc.id);
                  }
                }}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-brand-primary text-black shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {loc.label}
              </button>
            );
          })}
        </div>

        {/* Expandable Panel: Log a Rest Day or Inspect Recent Completed Sessions */}
        {showScheduleOptions && (
          <div className="p-3.5 rounded-2xl bg-black/60 border border-white/[0.1] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-white block">
                  Skipping today? Zero calendar penalty
                </span>
                <span className="text-xs text-slate-400">
                  Holds {activeWorkout.splitDay} Day at the front of your queue and protects your streak
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onShiftWorkout();
                  setShowScheduleOptions(false);
                }}
                className="px-3 py-2 rounded-xl bg-brand-primary text-black text-xs font-bold shrink-0 flex items-center space-x-1.5"
              >
                <Calendar className="w-3.5 h-3.5 stroke-[2]" />
                <span>Log Rest Day</span>
              </button>
            </div>

            {recentCompletedWorkouts.length > 0 && (
              <div className="pt-2.5 border-t border-white/[0.08] space-y-1.5">
                <span className="text-xs font-semibold text-slate-400 flex items-center space-x-1">
                  <History className="w-3.5 h-3.5 stroke-[2]" />
                  <span>Recent Completed Sessions (tap to inspect):</span>
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {recentCompletedWorkouts.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setPreviewPastWorkout(w)}
                      className="px-2.5 py-1.5 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-white/[0.08] text-xs text-slate-200 shrink-0 font-medium"
                    >
                      {w.date.substring(5)} • {w.splitDay} ✓
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* D. "What do I need to do to make progress?" Action Checklist */}
        <div className="p-3.5 rounded-2xl bg-black/45 border border-white/[0.08] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <TrendingUp className="w-4 h-4 text-brand-primary stroke-[2]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                How to Make Progress This Session
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-brand-primary">
              {completedSets}/{totalSets} sets done
            </span>
          </div>

          {readiness.state === 'Amber Shield' ? (
            <p className="text-xs text-amber-300 leading-relaxed">
              <strong>Light Recovery Day:</strong> Your body needs extra recovery today. Hold your weights steady, stop 2–3 reps shy of failure, and complete your sets to keep your streak alive.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs text-slate-200">
              {weightJumpItems.slice(0, 2).map(({ ex, prescription }) => {
                const formattedW = formatImplementWeightLabel(
                  prescription.nextWeightKg,
                  ex.equipment,
                  ex.isWeightedCalisthenic
                );
                const targetReps = prescription.nextTargetReps[0] ?? ex.minReps;
                return (
                  <li key={ex.id} className="flex items-start space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-1.5 shrink-0" />
                    <span>
                      <strong className="text-brand-primary">Add Weight:</strong> Lift{' '}
                      <strong className="text-white font-mono">
                        {formattedW} × {targetReps} reps
                      </strong>{' '}
                      on <strong className="text-white">{ex.name}</strong> (you hit {ex.maxReps} reps last time)
                    </span>
                  </li>
                );
              })}

              {repJumpItems.slice(0, 2).map(({ ex, prescription }) => {
                const formattedW = formatImplementWeightLabel(
                  prescription.nextWeightKg,
                  ex.equipment,
                  ex.isWeightedCalisthenic
                );
                const targetReps = prescription.nextTargetReps[0] ?? ex.minReps;
                return (
                  <li key={ex.id} className="flex items-start space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                    <span>
                      <strong className="text-cyan-300">Add +1 Rep:</strong> Hit{' '}
                      <strong className="text-white font-mono">
                        {formattedW} × {targetReps} reps
                      </strong>{' '}
                      on <strong className="text-white">{ex.name}</strong> to beat last session
                    </span>
                  </li>
                );
              })}

              {weightJumpItems.length === 0 && repJumpItems.length === 0 && (
                <li className="flex items-start space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-1.5 shrink-0" />
                  <span>
                    Hit the target weight and reps listed on each exercise card below with 1–2 reps left in the tank.
                  </span>
                </li>
              )}
            </ul>
          )}

          {/* Live Session Progress Bar & Finish Button */}
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div
                role="progressbar"
                aria-valuenow={totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Workout set completion progress"
                className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden"
              >
                <div
                  className="h-full bg-brand-primary rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${
                      totalSets > 0
                        ? Math.min(100, Math.round((completedSets / totalSets) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {completedSets === 0
                    ? 'Tap ✓ on Set 1 below to start logging'
                    : `${completedSets} of ${totalSets} sets logged`}
                </span>
                {liveTonnageKg > 0 && (
                  <span className="font-mono text-slate-300 font-semibold">
                    {liveTonnageKg.toLocaleString()} kg lifted
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinishWorkoutClick}
              disabled={completedSets === 0}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all active:scale-95 flex items-center space-x-1.5 shrink-0 ${
                completedSets > 0
                  ? 'bg-brand-primary text-black shadow-md shadow-brand-primary/20 hover:opacity-90'
                  : 'bg-white/[0.06] text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2]" />
              <span>Finish Workout</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Sleek Collapsible Recovery Status Bar */}
      <ReadinessBanner
        readiness={readiness}
        latestBiometrics={latestBiometrics}
        onSelectState={onSelectReadinessState}
      />

      {/* Undo Set Deletion Guardrail Banner */}
      {deletedSetBackup && (
        <div className="px-3.5 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs">
          <span className="text-slate-200">
            Removed set from <strong className="text-white">{deletedSetBackup.exerciseName}</strong>
          </span>
          <button
            type="button"
            onClick={handleUndoDeleteSet}
            className="px-2.5 py-1 rounded-lg bg-amber-400 text-black font-bold flex items-center space-x-1 hover:bg-amber-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3 stroke-[2]" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {/* 3. Exercise Cards with Clear Step Numbers & "Target vs. Last Time" */}
      <div className="space-y-3.5">
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
                onSetCompleted(ex.name, s?.setNumber || 1);
              }}
              onAddSet={(isWarmup) => handleAddSet(ex.id, isWarmup)}
              onDeleteSet={(setId) => handleDeleteSet(ex.id, setId)}
              onOpenSwap={() => setSwappingExercise(ex)}
              onOpenPlateCalc={(kg) => setPlateCalcWeight(kg)}
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
        className="w-full py-3 rounded-3xl border border-dashed border-white/[0.15] hover:border-brand-primary/50 bg-white/[0.02] hover:bg-brand-primary/[0.05] text-xs font-bold text-slate-300 hover:text-brand-primary flex items-center justify-center space-x-2 transition-all"
      >
        <Plus className="w-4 h-4 stroke-[2]" />
        <span>Add Exercise to Today&apos;s Session</span>
      </button>

      {/* Add Exercise Picker Modal */}
      {showAddExerciseModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl surface-glass border border-white/[0.12] p-5 shadow-2xl space-y-3 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
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
                className="w-8 h-8 rounded-full bg-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 overflow-y-auto no-scrollbar pr-1">
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
                    className="w-full p-3 rounded-2xl bg-black/50 hover:bg-surface-elevated border border-white/[0.06] flex items-center justify-between text-left transition-all"
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
        />
      )}

      {/* Past Workout Preview Modal */}
      {previewPastWorkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl surface-glass border border-white/[0.12] p-5 shadow-2xl space-y-3">
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
                  className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] text-xs"
                >
                  <div className="font-bold text-white">{ex.name}</div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    {ex.sets
                      .filter((s) => s.completed)
                      .map(
                        (s) =>
                          `${s.actualWeightKg ?? s.targetWeightKg} kg × ${
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
