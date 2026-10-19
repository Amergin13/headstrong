import {
  ExerciseDefinition,
  ExerciseSession,
  HomeEquipmentTag,
  ProgressionPrescription,
  ReadinessState,
  TrainingLocation,
  WorkoutSession,
} from './types';
import {
  calculateE1RM,
  translateWeightBetweenImplements,
} from './e1rm';

const MOVEMENT_FAMILY_LABELS: Record<string, string> = {
  'vector-pillar-horizontal-push': 'Horizontal Chest Press',
  'vector-pillar-vertical-push': 'Overhead Shoulder Press',
  'vector-pillar-horizontal-pull': 'Horizontal Back Row',
  'vector-pillar-vertical-pull': 'Vertical Lats Pull',
  'vector-pillar-squat': 'Squat & Knee Flexion',
  'vector-pillar-hinge': 'Deadlift & Hip Hinge',
  'vector-iso-sidedelts': 'Side Shoulder Isolation',
  'vector-iso-reardelts': 'Rear Shoulder Isolation',
  'vector-iso-triceps': 'Triceps Extension',
  'vector-iso-biceps': 'Biceps Curl',
  'vector-iso-hamstrings': 'Hamstring Leg Curl',
  'vector-iso-calves': 'Calf Raise',
  'vector-iso-core': 'Core & Abs',
};

/**
 * Maps any ExerciseSession or ExerciseDefinition to its Canonical Movement Family ID.
 * This ensures that substituting equipment (e.g., Barbell Bench <-> Dumbbell Press <-> Push-Up,
 * Back Squat <-> Goblet Squat <-> Split Squat, Pull-Up <-> Lat Pulldown)
 * tracks unified longitudinal progress rather than fragmenting into per-exercise silos,
 * and NEVER confuses compound presses with core crunches or tricep pushdowns.
 */
export function getMovementVectorId(ex: {
  exerciseId?: string;
  id?: string;
  movementFamily?: string;
  pillar: string;
  isIsolation?: boolean;
  primaryMuscle?: string;
}): string {
  if (ex.movementFamily) {
    return ex.movementFamily;
  }

  const rawId = (ex.exerciseId || ex.id || '').toLowerCase();

  if (
    rawId.includes('lateral') ||
    rawId.includes('y-fly') ||
    rawId.includes('side-plank-abduction') ||
    ex.primaryMuscle === 'Side Delts'
  ) {
    return 'vector-iso-sidedelts';
  }
  if (rawId.includes('calf') || ex.primaryMuscle === 'Calves') {
    return 'vector-iso-calves';
  }
  if (
    rawId.includes('face-pull') ||
    rawId.includes('rear-delt') ||
    rawId.includes('w-raise') ||
    ex.primaryMuscle === 'Rear Delts'
  ) {
    return 'vector-iso-reardelts';
  }
  if (
    rawId.includes('bicep') ||
    rawId.includes('incline-curl') ||
    rawId.includes('cable-curl') ||
    ex.primaryMuscle === 'Biceps'
  ) {
    return 'vector-iso-biceps';
  }
  if (
    rawId.includes('tricep') ||
    rawId.includes('pushdown') ||
    rawId.includes('overhead-db-extension') ||
    rawId.includes('diamond-pushup') ||
    ex.primaryMuscle === 'Triceps'
  ) {
    return 'vector-iso-triceps';
  }
  if (rawId.includes('leg-curl') || rawId.includes('hamstring-curl')) {
    return 'vector-iso-hamstrings';
  }
  if (
    rawId.includes('crunch') ||
    rawId.includes('hanging-leg-raise') ||
    rawId.includes('trx-pike') ||
    rawId.includes('hollow-body') ||
    ex.primaryMuscle === 'Core'
  ) {
    return 'vector-iso-core';
  }

  if (ex.isIsolation && ex.primaryMuscle) {
    return `vector-iso-${ex.primaryMuscle.toLowerCase().replace(/\s+/g, '')}`;
  }

  // Canonical 6 Compound Strength Vectors
  return `vector-pillar-${ex.pillar.toLowerCase().replace(/\s+/g, '-')}`;
}

export function getMovementFamilyLabel(exOrVectorId: string | {
  exerciseId?: string;
  id?: string;
  movementFamily?: string;
  movementFamilyLabel?: string;
  pillar: string;
  isIsolation?: boolean;
  primaryMuscle?: string;
}): string {
  if (typeof exOrVectorId === 'string') {
    return MOVEMENT_FAMILY_LABELS[exOrVectorId] || 'Matched Movement';
  }
  if (exOrVectorId.movementFamilyLabel) {
    return exOrVectorId.movementFamilyLabel;
  }
  const vecId = getMovementVectorId(exOrVectorId);
  return MOVEMENT_FAMILY_LABELS[vecId] || exOrVectorId.pillar;
}

/**
 * Checks whether an exercise can be performed in the given TrainingLocation
 * given the user's available home equipment.
 */
export function canPerformExerciseInLocation(
  def: ExerciseDefinition,
  location: TrainingLocation,
  homeEquipment: HomeEquipmentTag[] = ['bench', 'dumbbells', 'trx', 'pullup_bar']
): boolean {
  if (location === 'gym') {
    return def.environments ? def.environments.includes('gym') : true;
  }

  if (location === 'travel') {
    if (def.environments?.includes('travel')) {
      if (!def.requiredHomeEquipment || def.requiredHomeEquipment.length === 0) {
        return true;
      }
      // If a travel movement optionally uses TRX/bands, check if user has it
      return def.requiredHomeEquipment.every((eq) => homeEquipment.includes(eq));
    }
    return def.equipment === 'bodyweight' && (!def.requiredHomeEquipment || def.requiredHomeEquipment.length === 0);
  }

  // location === 'home'
  const allowedInHome =
    def.environments?.includes('home') ||
    def.environments?.includes('travel') ||
    def.equipment === 'dumbbell' ||
    def.equipment === 'bodyweight' ||
    def.equipment === 'weighted_bodyweight';

  if (!allowedInHome) return false;

  if (def.requiredHomeEquipment && def.requiredHomeEquipment.length > 0) {
    return def.requiredHomeEquipment.every((req) => homeEquipment.includes(req));
  }

  return true;
}

/**
 * Returns all exercises in the catalog that express the same Canonical Movement Family
 * (used by ExerciseSwapModal and inline 1-tap implement switcher Pills on ExerciseCard).
 */
export function getVectorImplementOptions(
  currentEx: {
    exerciseId?: string;
    id?: string;
    movementFamily?: string;
    pillar: string;
    isIsolation?: boolean;
    primaryMuscle?: string;
  },
  exerciseCatalog: ExerciseDefinition[],
  locationFilter?: TrainingLocation,
  homeEquipment?: HomeEquipmentTag[]
): ExerciseDefinition[] {
  const targetVector = getMovementVectorId(currentEx);
  const familyMatches = exerciseCatalog.filter(
    (def) => getMovementVectorId(def) === targetVector
  );

  if (!locationFilter) {
    return familyMatches;
  }

  const locationMatches = familyMatches.filter((def) =>
    canPerformExerciseInLocation(def, locationFilter, homeEquipment)
  );

  return locationMatches.length > 0 ? locationMatches : familyMatches;
}

/**
 * Finds the most recent completed ExerciseSession for a given exerciseId OR its Canonical Movement Vector
 */
export function findLastCompletedExerciseSession(
  exerciseId: string,
  workouts: WorkoutSession[],
  targetSessionForVectorLookup?: ExerciseSession
): { session: ExerciseSession; date: string; isCrossImplementTransfer: boolean } | null {
  const completedWorkouts = workouts
    .filter((w) => w.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  const targetVector = targetSessionForVectorLookup
    ? getMovementVectorId(targetSessionForVectorLookup)
    : null;

  for (const w of completedWorkouts) {
    // 1. Prefer exact exercise match in that workout if present
    const exactMatch = w.exercises.find(
      (ex) =>
        ex.exerciseId === exerciseId &&
        ex.sets.some((s) => s.completed && !s.isWarmup && s.setType !== 'warmup')
    );
    if (exactMatch) {
      return { session: exactMatch, date: w.date, isCrossImplementTransfer: false };
    }

    // 2. Otherwise match any completed exercise expressing the same Canonical Movement Vector!
    if (targetVector) {
      const vectorMatch = w.exercises.find(
        (ex) =>
          getMovementVectorId(ex) === targetVector &&
          ex.sets.some((s) => s.completed && !s.isWarmup && s.setType !== 'warmup')
      );
      if (vectorMatch) {
        return {
          session: vectorMatch,
          date: w.date,
          isCrossImplementTransfer: vectorMatch.exerciseId !== exerciseId,
        };
      }
    }
  }
  return null;
}

/**
 * Formats a completed set into a concise Hevy/TrainHeroic ghost reference string (e.g. "90×10 @2R")
 */
export function formatPreviousSetGhost(
  weightKg: number | undefined,
  reps: number | undefined,
  rir: number | undefined,
  isTranslated = false
): string {
  if (weightKg === undefined || reps === undefined) return '—';
  const prefix = isTranslated ? '≈' : '';
  const rirSuffix = rir !== undefined ? ` @${rir}R` : '';
  return `${prefix}${weightKg}×${reps}${rirSuffix}`;
}

/**
 * Evaluates exercise performance across the Canonical Movement Vector and prescribes
 * next session's target load and reps with seamless Cross-Implement Equivalence:
 *
 * Double Progression Rule:
 * 1. If Amber Shield is active:
 *    - Hold load static (translated to current implement if switched).
 *    - Shift target effort to 2–3 RIR.
 *    - Protect user's streak and XP.
 *
 * 2. If all completed working sets hit the top of the rep range (e.g. 12/12/12) at 1–2 RIR:
 *    - Barbell: +2.5 kg.
 *    - Dumbbell: +2.0 kg.
 *    - Other (Cable/Machine): +2.5 kg or smallest increment.
 *    - Reset target reps to bottom of rep range (e.g. 8 reps).
 *
 * 3. If within rep range at 1–2 RIR:
 *    - Hold weight static (or translated equivalent).
 *    - Prescribe +1 rep on the first two sets for next session (capped at max reps).
 */
export function prescribeDoubleProgression(
  session: ExerciseSession,
  readinessState: ReadinessState = 'Normal',
  historicalWorkouts?: WorkoutSession[],
  bodyweightEmaKg: number = 81.5
): ProgressionPrescription {
  let sourceSession = session;
  let lastSessionDate: string | undefined;
  let isCrossImplement = false;

  const workingCompletedInCurrent = session.sets.filter(
    (s) => s.completed && !s.isWarmup && s.setType !== 'warmup'
  );

  if (workingCompletedInCurrent.length === 0 && historicalWorkouts && historicalWorkouts.length > 0) {
    const historicalMatch = findLastCompletedExerciseSession(
      session.exerciseId,
      historicalWorkouts,
      session
    );
    if (historicalMatch) {
      sourceSession = historicalMatch.session;
      lastSessionDate = historicalMatch.date;
      isCrossImplement = historicalMatch.isCrossImplementTransfer;
    }
  }

  const sets = sourceSession.sets.filter(
    (s) => s.completed && !s.isWarmup && s.setType !== 'warmup'
  );
  const minReps = session.minReps || sourceSession.minReps || 8;
  const maxReps = session.maxReps || sourceSession.maxReps || 12;
  const sourceMaxReps = sourceSession.maxReps || maxReps;
  const sourceMinReps = sourceSession.minReps || minReps;

  const rawSourceWeight =
    sets[0]?.actualWeightKg ??
    sets[0]?.targetWeightKg ??
    session.sets[0]?.targetWeightKg ??
    20;

  // Translate weight into today's implement if the last session was on a different exercise/equipment!
  const currentWeight = isCrossImplement
    ? translateWeightBetweenImplements(
        rawSourceWeight,
        {
          equipment: sourceSession.equipment,
          isRdl: sourceSession.isRdl,
          isWeightedCalisthenic: sourceSession.isWeightedCalisthenic,
        },
        {
          equipment: session.equipment,
          isRdl: session.isRdl,
          isWeightedCalisthenic: session.isWeightedCalisthenic,
        },
        bodyweightEmaKg
      )
    : rawSourceWeight;

  // Compute Canonical Pillar E1RM from the source session's best set
  let canonicalE1rmKg = 0;
  for (const s of sets) {
    const w = s.actualWeightKg ?? s.targetWeightKg;
    const r = s.actualReps ?? s.targetReps;
    const rir = s.actualRir ?? s.targetRir ?? 2;
    const e1rm = calculateE1RM(
      w,
      r,
      rir,
      sourceSession.equipment,
      sourceSession.isRdl,
      sourceSession.isWeightedCalisthenic,
      bodyweightEmaKg
    );
    if (e1rm > canonicalE1rmKg) canonicalE1rmKg = e1rm;
  }

  const previousSetsSummary = sets.map((s) => {
    const rawW = s.actualWeightKg ?? s.targetWeightKg;
    const displayW = isCrossImplement
      ? translateWeightBetweenImplements(
          rawW,
          {
            equipment: sourceSession.equipment,
            isRdl: sourceSession.isRdl,
            isWeightedCalisthenic: sourceSession.isWeightedCalisthenic,
          },
          {
            equipment: session.equipment,
            isRdl: session.isRdl,
            isWeightedCalisthenic: session.isWeightedCalisthenic,
          },
          bodyweightEmaKg
        )
      : rawW;

    return formatPreviousSetGhost(
      displayW,
      s.actualReps ?? s.targetReps,
      s.actualRir ?? s.targetRir,
      isCrossImplement
    );
  });

  const transferredFromExerciseName = isCrossImplement ? sourceSession.name : undefined;
  const transferPrefix = isCrossImplement
    ? `Matched from ${sourceSession.name}: `
    : '';

  // Amber Shield override:
  if (readinessState === 'Amber Shield') {
    return {
      exerciseId: session.exerciseId,
      nextWeightKg: currentWeight,
      nextTargetReps: session.sets.map((s, idx) => sets[idx]?.actualReps || s.targetReps || minReps),
      reason: `${transferPrefix}Recovery mode is active. Weight stays at ${currentWeight} kg with 2–3 reps left in reserve so your joints and muscles can recover.`,
      weightChanged: false,
      repsChanged: false,
      isAmberShieldBuffer: true,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
    };
  }

  // If no sets completed anywhere, return current defaults
  if (sets.length === 0) {
    return {
      exerciseId: session.exerciseId,
      nextWeightKg: currentWeight,
      nextTargetReps: session.sets.map((s) => s.targetReps || minReps),
      reason: 'Starting target based on your current training plan.',
      weightChanged: false,
      repsChanged: false,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary: [],
      transferredFromExerciseName,
      canonicalE1rmKg,
    };
  }

  // Check if all working sets hit top of rep range at 1–2 RIR:
  const allHitTopWithGoodRir = sets.every((s) => {
    const reps = s.actualReps ?? 0;
    const rir = s.actualRir ?? 2;
    return reps >= sourceMaxReps && rir >= 1 && rir <= 2;
  });

  if (allHitTopWithGoodRir) {
    const isPureBodyweight =
      (session.equipment === 'bodyweight' && !session.isWeightedCalisthenic) || currentWeight === 0;

    if (isPureBodyweight) {
      const nextReps = session.sets.map((s, idx) =>
        Math.min(30, (sets[idx]?.actualReps || sourceMaxReps) + 2)
      );
      return {
        exerciseId: session.exerciseId,
        nextWeightKg: 0,
        nextTargetReps: nextReps,
        reason: `${transferPrefix}You hit ${sourceMaxReps} reps on all bodyweight sets! Increasing target by +2 reps (or pause 2 seconds in the stretch) to continue progressive overload.`,
        weightChanged: false,
        repsChanged: true,
        isAmberShieldBuffer: false,
        lastSessionDate,
        previousSetsSummary,
        transferredFromExerciseName,
        canonicalE1rmKg,
      };
    }

    const isDumbbell = session.equipment === 'dumbbell';
    const increment = isDumbbell ? 2.0 : 2.5;
    const nextWeight = Math.round((currentWeight + increment) * 10) / 10;

    return {
      exerciseId: session.exerciseId,
      nextWeightKg: nextWeight,
      nextTargetReps: session.sets.map(() => minReps),
      reason: `${transferPrefix}You hit ${sourceMaxReps} reps on all sets last time! Moving weight up by +${increment} kg and resetting target to ${minReps} reps.`,
      weightChanged: true,
      repsChanged: true,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
    };
  }

  // Check if within rep range at 1–2 RIR:
  const goodQualitySets = sets.filter((s) => {
    const reps = s.actualReps ?? 0;
    const rir = s.actualRir ?? 2;
    return reps >= sourceMinReps && rir >= 1 && rir <= 2;
  });

  if (goodQualitySets.length > 0) {
    const nextReps = session.sets.map((s, idx) => {
      const baseReps = Math.min(maxReps, Math.max(minReps, sets[idx]?.actualReps ?? s.targetReps ?? minReps));
      if (idx < 2) {
        return Math.min(maxReps, baseReps + 1);
      }
      return baseReps;
    });

    return {
      exerciseId: session.exerciseId,
      nextWeightKg: currentWeight,
      nextTargetReps: nextReps,
      reason: `${transferPrefix}Strong sets last session${lastSessionDate ? ` (${lastSessionDate})` : ''}. Keeping weight at ${currentWeight} kg and aiming for +1 rep on your first two sets.`,
      weightChanged: false,
      repsChanged: true,
      isAmberShieldBuffer: false,
      lastSessionDate,
      previousSetsSummary,
      transferredFromExerciseName,
      canonicalE1rmKg,
    };
  }

  // Sub-par performance or high fatigue (0 RIR or below min reps): hold everything
  return {
    exerciseId: session.exerciseId,
    nextWeightKg: currentWeight,
    nextTargetReps: session.sets.map((s, idx) => sets[idx]?.actualReps || s.targetReps || minReps),
    reason: `${transferPrefix}Keeping weight at ${currentWeight} kg today so you can build clean, consistent reps.`,
    weightChanged: false,
    repsChanged: false,
    isAmberShieldBuffer: false,
    lastSessionDate,
    previousSetsSummary,
    transferredFromExerciseName,
    canonicalE1rmKg,
  };
}
