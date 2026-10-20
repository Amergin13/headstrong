import {
  EquipmentType,
  ExerciseDefinition,
  ExerciseSession,
  StrengthPillar,
  WorkoutSet,
} from './types';

/**
 * Treise Evidence-Based Warmup Set Protocol
 *
 * Grounded in exercise physiology:
 * 1. Warmup sets elevate muscle temperature, lubricate joint capsules with synovial fluid,
 *    and potentiate the central nervous system (post-activation potentiation) without inducing
 *    metabolic fatigue or muscle microtrauma.
 * 2. Crucially, warmup sets DO NOT count toward hypertrophy weekly volume landmarks (MV/MEV/MAV/MRV).
 * 3. Primary compound lifts (e.g., Barbell Bench Press, Back Squat, Deadlift, Barbell Row)
 *    utilize a 2-stage ramping warmup:
 *      - Stage 1 (General Ramp): ~50% of working weight for 8 reps (RIR 4+).
 *      - Stage 2 (Neural Potentiation): ~70–75% of working weight for 4 reps (RIR 3).
 * 4. Secondary compound lifts (e.g., Incline DB Press or OHP following Bench Press) utilize
 *    a 1-stage acclimation warmup:
 *      - Stage 1 (Acclimation): ~60% of working weight for 5 reps (RIR 3–4).
 * 5. Weighted calisthenics (e.g. weighted pull-ups or weighted dips with external load):
 *    Warmup set uses bodyweight only (+0 kg external load) for 5 reps.
 * 6. Isolation exercises (e.g., Lateral Raises, Curls, Triceps Pushdowns, Calf Raises, Face Pulls):
 *    0 warmup sets (muscles are already warm from compounds, and zero axial fatigue is generated).
 * 7. Pure bodyweight travel exercises (0 kg external load):
 *    0 warmup sets.
 */

export interface WarmupPrescription {
  count: number;
  sets: Array<{
    weightKg: number;
    reps: number;
    rir: number;
    label: string;
  }>;
  rationale: string;
}

/**
 * Checks if an exercise is an isolation movement (minimal axial strain, single-joint).
 */
export function isIsolationMovement(exercise: {
  pillar?: StrengthPillar;
  isIsolation?: boolean;
  name?: string;
  exerciseId?: string;
}): boolean {
  if (exercise.isIsolation) return true;

  const name = (exercise.name || exercise.exerciseId || '').toLowerCase();
  const isolationKeywords = [
    'raise',
    'fly',
    'flye',
    'curl',
    'pushdown',
    'extension',
    'kickback',
    'calf',
    'crunch',
    'plank',
    'face pull',
    'shrug',
  ];

  return isolationKeywords.some((keyword) => name.includes(keyword));
}

/**
 * Checks if an exercise is a primary or secondary compound movement.
 */
export function isCompoundMovement(exercise: {
  pillar?: StrengthPillar;
  isIsolation?: boolean;
  equipment?: EquipmentType;
  isWeightedCalisthenic?: boolean;
  name?: string;
  exerciseId?: string;
}): boolean {
  return !isIsolationMovement(exercise);
}

/**
 * Rounds weight to implement-specific plate/dumbbell increments.
 */
function roundToImplementIncrement(weightKg: number, equipment: EquipmentType): number {
  if (weightKg <= 0) return 0;
  if (equipment === 'dumbbell') {
    // 2.0 kg dumbbell jumps
    return Math.max(2, Math.round(weightKg / 2) * 2);
  }
  // Standard 2.5 kg barbell / machine jumps
  return Math.max(2.5, Math.round(weightKg / 2.5) * 2.5);
}

/**
 * Calculates the exact warmup prescription (loads and reps) for an exercise.
 */
export function calculateWarmupPrescription(
  exercise: {
    pillar?: StrengthPillar;
    equipment?: EquipmentType;
    isIsolation?: boolean;
    isWeightedCalisthenic?: boolean;
    name?: string;
    exerciseId?: string;
  },
  workingWeightKg: number,
  isFirstCompoundForMuscleOrPillar: boolean = false
): WarmupPrescription {
  const equip = exercise.equipment || 'barbell';
  const isPureBw = equip === 'bodyweight' && !exercise.isWeightedCalisthenic;

  // 1. Pure bodyweight exercises with no external load -> 0 warmup sets
  if (isPureBw || workingWeightKg <= 0) {
    if (exercise.isWeightedCalisthenic && workingWeightKg > 0) {
      // Handled below in calisthenics
    } else {
      return {
        count: 0,
        sets: [],
        rationale: 'Bodyweight exercise: start directly with your working sets.',
      };
    }
  }

  // 2. Pure isolation movements -> 0 warmup sets
  if (isIsolationMovement(exercise)) {
    return {
      count: 0,
      sets: [],
      rationale: 'Isolation movement: target muscle is already warm from earlier compound pressing/pulling.',
    };
  }

  // 3. Weighted Calisthenics (e.g. Weighted Pull-Ups, Weighted Dips)
  if (exercise.isWeightedCalisthenic && workingWeightKg > 0) {
    return {
      count: 1,
      sets: [
        {
          weightKg: 0,
          reps: 5,
          rir: 4,
          label: 'Bodyweight Prep Set (+0 kg)',
        },
      ],
      rationale: 'Bodyweight warmup set prepares connective tissue before strapping on external load.',
    };
  }

  // 4. Very light external load (< 20 kg on barbell/machine, < 8 kg on dumbbell) -> 0 warmup sets
  const isDumbbell = equip === 'dumbbell';
  const minThresholdKg = isDumbbell ? 10 : 25;
  if (workingWeightKg < minThresholdKg) {
    return {
      count: 0,
      sets: [],
      rationale: 'Light working load: no dedicated warmup sets required.',
    };
  }

  // 5. Primary Compound Movement (First exercise for pillar / muscle group in session)
  if (isFirstCompoundForMuscleOrPillar) {
    const heavyThresholdKg = isDumbbell ? 18 : 40;

    if (workingWeightKg >= heavyThresholdKg) {
      // 2-stage Ramp: 50% and 72% of working load
      let rawW1 = workingWeightKg * 0.5;
      if (equip === 'barbell') {
        rawW1 = Math.max(20, rawW1); // At least empty 20kg bar
      }
      const w1 = roundToImplementIncrement(rawW1, equip);

      const rawW2 = workingWeightKg * 0.72;
      const step = isDumbbell ? 2.0 : 2.5;
      let w2 = roundToImplementIncrement(rawW2, equip);
      if (w2 <= w1) {
        w2 = w1 + step;
      }
      if (w2 >= workingWeightKg) {
        w2 = Math.max(w1, workingWeightKg - step);
      }

      return {
        count: 2,
        sets: [
          {
            weightKg: w1,
            reps: 8,
            rir: 4,
            label: 'Stage 1 General Ramp (50%)',
          },
          {
            weightKg: w2,
            reps: 4,
            rir: 3,
            label: 'Stage 2 Neural Potentiation (72%)',
          },
        ],
        rationale:
          'Primary compound lift: 2-stage warmup ramps neural potentiation and lubricates joints without fatigue.',
      };
    }

    // Moderate compound (between 25kg and 40kg): 1 warmup set at ~60%
    const rawW1 = Math.max(equip === 'barbell' ? 20 : 6, workingWeightKg * 0.6);
    const w1 = roundToImplementIncrement(rawW1, equip);
    return {
      count: 1,
      sets: [
        {
          weightKg: Math.min(w1, workingWeightKg - (isDumbbell ? 2 : 2.5)),
          reps: 6,
          rir: 3,
          label: 'Acclimation Set (60%)',
        },
      ],
      rationale: 'Moderate compound lift: 1 acclimation warmup set to groove movement mechanics.',
    };
  }

  // 6. Secondary Compound Movement (e.g. Incline DB Press after Bench Press)
  // Muscles are already warm; only motor angle acclimation is needed: 1 warmup set at ~60%
  const step = isDumbbell ? 2.0 : 2.5;
  const rawW = Math.max(isDumbbell ? 8 : 20, workingWeightKg * 0.6);
  const w = roundToImplementIncrement(rawW, equip);
  const finalW = Math.min(w, Math.max(isDumbbell ? 6 : 20, workingWeightKg - step));

  return {
    count: 1,
    sets: [
      {
        weightKg: finalW,
        reps: 5,
        rir: 3,
        label: 'Angle Acclimation Set (60%)',
      },
    ],
    rationale:
      'Secondary compound lift: single acclimation set grooves joint trajectory without stealing work capacity.',
  };
}

/**
 * Builds pre-filled WorkoutSet objects for the calculated warmup prescription.
 */
export function generateWarmupSets(
  exerciseId: string,
  prescription: WarmupPrescription
): WorkoutSet[] {
  if (prescription.count === 0 || prescription.sets.length === 0) {
    return [];
  }

  return prescription.sets.map((item, idx) => ({
    id: `set-warmup-${Date.now()}-${exerciseId}-${idx + 1}`,
    setNumber: idx + 1,
    targetWeightKg: item.weightKg,
    actualWeightKg: item.weightKg,
    targetReps: item.reps,
    actualReps: item.reps,
    targetRir: item.rir,
    actualRir: item.rir,
    completed: false,
    isWarmup: true,
    setType: 'warmup',
  }));
}

/**
 * Helper to determine if an exercise is the first compound lift in a workout
 * for its movement pillar or primary muscle group.
 */
export function isFirstCompoundForPillar(
  currentEx: {
    pillar?: StrengthPillar;
    isIsolation?: boolean;
    name?: string;
    exerciseId?: string;
    equipment?: EquipmentType;
    isWeightedCalisthenic?: boolean;
  },
  currentIndex: number,
  allExercises: Array<{
    pillar?: StrengthPillar;
    isIsolation?: boolean;
    name?: string;
    exerciseId?: string;
    equipment?: EquipmentType;
    isWeightedCalisthenic?: boolean;
  }>
): boolean {
  if (isIsolationMovement(currentEx)) return false;

  const pillar = currentEx.pillar;
  for (let i = 0; i < currentIndex; i++) {
    const prior = allExercises[i];
    if (prior.pillar === pillar && isCompoundMovement(prior)) {
      return false;
    }
  }

  return true;
}

/**
 * Adds appropriate pre-filled warmup sets to an ExerciseSession if it doesn't already have warmup sets.
 */
export function ensureWarmupSetsOnExercise(
  exercise: ExerciseSession,
  isFirstCompound: boolean
): ExerciseSession {
  // If the exercise already has warmup sets, retain them
  const hasExistingWarmups = exercise.sets.some(
    (s) => s.isWarmup || s.setType === 'warmup'
  );
  if (hasExistingWarmups) {
    return exercise;
  }

  // Find the primary working set weight to anchor the warmup loads
  const firstWorkingSet =
    exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup') ??
    exercise.sets[0];
  const workingWeightKg =
    firstWorkingSet?.actualWeightKg ?? firstWorkingSet?.targetWeightKg ?? 20;

  const prescription = calculateWarmupPrescription(
    exercise,
    workingWeightKg,
    isFirstCompound
  );

  if (prescription.count === 0) {
    return exercise;
  }

  const warmupSets = generateWarmupSets(exercise.exerciseId, prescription);

  // Preserve working sets with renumbered sequential indices
  const workingSets = exercise.sets
    .filter((s) => !s.isWarmup && s.setType !== 'warmup')
    .map((s, idx) => ({
      ...s,
      setNumber: idx + 1,
      setType: s.setType || 'working',
    }));

  return {
    ...exercise,
    sets: [...warmupSets, ...workingSets],
  };
}
