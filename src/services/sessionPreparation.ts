import {
  EquipmentInventory,
  ExerciseDefinition,
  ExerciseSession,
  ReadinessState,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { SingleExerciseSwapPreview } from '../engine/continuityEngine';
import { snapWeightToInventory } from '../engine/equipmentInventory';
import { getExerciseBiomechanicalMeta } from '../engine/knowledgeGraph';
import { personalizeSessionLoads } from '../engine/loadPersonalization';
import { getMovementFamilyLabel, getMovementVectorId, SwapPrescription } from '../engine/progression';
import { calculateWarmupPrescription, generateWarmupSets, isFirstCompoundForPillar } from '../engine/warmup';
import { getTemplateDefaultWeight } from './workoutGenerator';
import { snapLoadKg, WeightUnit } from '../utils/units';

export interface SessionPreparationContext {
  history: WorkoutSession[];
  bodyweightKg: number;
  readinessState: ReadinessState;
  gender?: UserProfile['gender'];
  experienceLevel?: UserProfile['experienceLevel'];
  unit?: WeightUnit;
  /** True for 6-Week Muscle Building Plan sessions (template weights ignore history). */
  isProgramPlan?: boolean;
}

/**
 * Final step for every generated session: personalize weights to this athlete (carry-over from
 * history, learned strength ratios, onboarding calibration) and snap loads to real plates.
 */
export function prepareSessionForAthlete(session: WorkoutSession, ctx: SessionPreparationContext): WorkoutSession {
  const unit = ctx.unit || 'kg';
  const personalized = personalizeSessionLoads(session, {
    history: ctx.history,
    bodyweightKg: ctx.bodyweightKg,
    gender: ctx.gender,
    experienceLevel: ctx.experienceLevel,
    readinessState: ctx.readinessState,
    unit,
    templateDefaultFor: getTemplateDefaultWeight,
    templateReferenceLevel: ctx.isProgramPlan ? 'intermediate' : 'experienced',
    carryOverExactHistory: Boolean(ctx.isProgramPlan),
  });
  // What the weights were prepared for, so a later change in recovery can be noticed.
  const prepared = { ...personalized, readinessState: ctx.readinessState };
  if (unit !== 'lb') return prepared;
  return {
    ...prepared,
    exercises: personalized.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) =>
        s.completed || s.targetWeightKg <= 0
          ? s
          : {
              ...s,
              targetWeightKg: snapLoadKg(s.targetWeightKg, 'lb', ex.equipment),
              actualWeightKg: snapLoadKg(s.actualWeightKg ?? s.targetWeightKg, 'lb', ex.equipment),
            }
      ),
    })),
  };
}

/**
 * Starting weight for an exercise the athlete has never done, added to a session by hand. It comes
 * from the exercise's own default scaled by what the athlete lifts relative to the defaults (like
 * every generated session), never from another exercise's number. Null when the exercise has no
 * known default (a custom exercise or a weighted bodyweight move).
 */
export function startingWeightForNewExercise(
  session: WorkoutSession,
  exercise: ExerciseSession,
  ctx: SessionPreparationContext
): number | null {
  const unloaded = {
    ...exercise,
    sets: exercise.sets.map((s) => ({ ...s, targetWeightKg: 0, actualWeightKg: 0 })),
  };
  const prepared = prepareSessionForAthlete({ ...session, exercises: [unloaded] }, { ...ctx, isProgramPlan: true });
  const weight = prepared.exercises[0].sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.targetWeightKg ?? 0;
  return weight > 0 ? weight : null;
}

/**
 * Pure session-exercise builder for confirming an exercise swap (`ExerciseSwapModal`).
 * Preserves already-logged sets on the original exercise, calibrates remaining working sets
 * (including `EFFORT_ONLY`, `ANCHOR_PRIOR`, `OWN_HISTORY`, and timed holds), re-creates warmups
 * only when the replaced exercise had them, and preserves anchor metadata on `'today'` swaps.
 */
export function buildSwappedSessionExercises(params: {
  exercises: ExerciseSession[];
  swappingExerciseId: string;
  newDef: ExerciseDefinition;
  rx: SwapPrescription;
  continuity: SingleExerciseSwapPreview;
  scope: 'today' | 'permanent';
  unit: WeightUnit;
  activeInventory?: EquipmentInventory;
  nowMs?: number;
}): ExerciseSession[] {
  const {
    exercises,
    swappingExerciseId,
    newDef,
    rx,
    continuity,
    scope,
    unit,
    activeInventory,
    nowMs = Date.now(),
  } = params;
  const meta = getExerciseBiomechanicalMeta(newDef);
  const isPureBw = rx.isPureBodyweight;
  const timed = rx.isTimed;
  const isEffortMachine =
    !timed &&
    continuity.prescription.calibrationSource === 'EFFORT_ONLY' &&
    continuity.targetMetadata.equipmentClass === 'VARIABLE_MACHINE_OR_CABLE';
  const continuitySet1Weight = continuity.prescription.sets[0]?.suggestedWeightKg ?? null;
  const rawTargetWeight =
    isPureBw || isEffortMachine
      ? 0
      : continuitySet1Weight != null && continuitySet1Weight > 0
      ? continuitySet1Weight
      : rx.targetWeightKg;
  const effectiveTargetWeight =
    rawTargetWeight > 0
      ? snapWeightToInventory(rawTargetWeight, newDef.equipment, unit, activeInventory)
      : 0;
  const defaultTargetReps = rx.targetReps;

  const customNotes = timed
    ? rx.rationale
    : continuity.prescription.copy?.tier1
    ? continuity.prescription.copy.tier1
    : rx.tempoCue
    ? `${rx.tempoCue}. ${rx.rationale}.`
    : meta.resistanceProfile === 'lengthened'
    ? `${rx.rationale}. Focus on a controlled stretch at the bottom of each rep.`
    : `${rx.rationale}. Keep a steady, controlled pace on every rep.`;

  return exercises.flatMap((ex, exIdx) => {
    if (ex.id !== swappingExerciseId) return [ex];

    // Logged sets stay on the exercise that was done; only the sets still to do move to the new one.
    const loggedSets = ex.sets.filter((s) => s.completed);
    const setsToDo = ex.sets.filter((s) => !s.completed);
    const workingSetsOnly = setsToDo.filter((s) => !s.isWarmup && s.setType !== 'warmup');
    if (workingSetsOnly.length === 0) return [ex];

    const calibratedWorkingSets: WorkoutSet[] = workingSetsOnly.map((s, sIdx) => {
      const contSet =
        continuity.prescription.sets[sIdx] ??
        continuity.prescription.sets[continuity.prescription.sets.length - 1];
      const setWeight =
        isPureBw || isEffortMachine
          ? 0
          : contSet?.suggestedWeightKg != null && contSet.suggestedWeightKg > 0
          ? snapWeightToInventory(contSet.suggestedWeightKg, newDef.equipment, unit, activeInventory)
          : effectiveTargetWeight;
      const setReps = timed ? 1 : (contSet?.targetRepsMin ?? defaultTargetReps);
      const setRir = timed ? rx.targetRir : (contSet?.targetRir ?? rx.targetRir);
      return {
        ...s,
        setNumber: sIdx + 1,
        targetWeightKg: setWeight,
        actualWeightKg: setWeight,
        targetReps: setReps,
        actualReps: setReps,
        targetRir: setRir,
        actualRir: setRir,
        isWeightEstimated: !timed && Boolean(contSet?.isWeightEstimated) && setWeight > 0,
        setupLabel: timed ? null : (contSet?.setupLabel ?? null),
        calibrationSource: timed ? undefined : (contSet?.calibrationSource ?? continuity.prescription.calibrationSource),
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
      };
    });

    const originalWarmupCount = setsToDo.filter((st) => st.isWarmup || st.setType === 'warmup').length;
    let calibratedSets: WorkoutSet[] = calibratedWorkingSets;
    if (originalWarmupCount > 0 && !isPureBw && !isEffortMachine && effectiveTargetWeight > 0 && !meta.isIsolation && !timed) {
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
        exercises
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

    const isNewLoadedCompound =
      !timed && !isPureBw && !meta.isIsolation && newDef.equipment !== 'bodyweight' && newDef.equipment !== 'weighted_bodyweight';
    const rawMaxAcrossSets = timed
      ? rx.maxReps
      : Math.max(rx.maxReps, ...continuity.prescription.sets.map((p) => p.targetRepsMax));
    const maxRepAcrossSets =
      isNewLoadedCompound &&
      continuity.prescription.rationaleKind !== 'COARSE_JUMP_EXPANDED' &&
      rawMaxAcrossSets > 15 &&
      newDef.defaultRepRange[1] <= 15
        ? Math.max(rx.minReps, newDef.defaultRepRange[1])
        : rawMaxAcrossSets;
    const keepAnchorMeta = scope === 'today' && continuity.anchorDef && continuity.anchorDef.id !== newDef.id;
    const preservedAnchorMin = keepAnchorMeta ? (ex.anchorMinReps ?? continuity.anchorDef?.defaultRepRange[0] ?? ex.minReps) : undefined;
    const preservedAnchorMax = keepAnchorMeta ? (ex.anchorMaxReps ?? continuity.anchorDef?.defaultRepRange[1] ?? ex.maxReps) : undefined;

    const replacement: ExerciseSession = {
      ...ex,
      exerciseId: newDef.id,
      name: newDef.name,
      pillar: newDef.pillar,
      equipment: isPureBw ? 'bodyweight' : newDef.equipment,
      isRdl: newDef.isRdl,
      isWeightedCalisthenic: isPureBw ? false : newDef.isWeightedCalisthenic,
      isAssisted: newDef.isAssisted,
      isIsolation: meta.isIsolation,
      movementFamily: getMovementVectorId(newDef),
      movementFamilyLabel: getMovementFamilyLabel(newDef),
      resistanceProfile: meta.resistanceProfile,
      sfrScore: meta.sfrScore,
      minReps: rx.minReps,
      maxReps: maxRepAcrossSets,
      repTargetType: timed ? 'duration' : 'reps',
      durationSeconds: timed ? rx.targetDurationSeconds : undefined,
      tempo: timed && rx.targetDurationSeconds ? `${rx.targetDurationSeconds}sec` : undefined,
      notes: customNotes,
      athleteNotes: ex.athleteNotes,
      slotId: ex.slotId ?? ex.orderCode ?? ex.id,
      anchorExerciseId: keepAnchorMeta ? continuity.anchorDef!.id : undefined,
      anchorExerciseName: keepAnchorMeta ? continuity.anchorDef!.name : undefined,
      anchorMinReps: preservedAnchorMin,
      anchorMaxReps: preservedAnchorMax,
      anchorReferenceLabel: keepAnchorMeta ? continuity.anchorReferenceLabel : undefined,
      calibrationSource: timed ? undefined : continuity.prescription.calibrationSource,
      continuityRationaleKind: timed ? undefined : continuity.prescription.rationaleKind,
      coarseJumpPct: timed ? undefined : continuity.prescription.coarseJumpPct,
      setupLabel: timed ? undefined : continuity.prescription.setupLabel,
      bodyweightLoadPct: timed ? undefined : continuity.prescription.bodyweightLoadPct,
      leverageTier: timed ? undefined : continuity.targetMetadata.leverageTier,
      isBridgeReentry: false,
      reentryFromLabel: undefined,
      sets: calibratedSets,
    };
    if (loggedSets.length === 0) return [replacement];
    return [{ ...ex, sets: loggedSets }, { ...replacement, id: `${ex.id}-swap-${nowMs}` }];
  });
}
