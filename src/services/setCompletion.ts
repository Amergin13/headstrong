import { ExerciseSession, WorkoutSession, WorkoutSet } from '../engine/types';
import { evaluateExerciseProgressXp, XpAward } from '../engine/xp';
import { isPillarBenchmarkExercise } from '../engine/strengthStandards';

/** What the rest timer shows: the exercise just done, what's next, and why this rest length. */
export interface RestTimerContext {
  exerciseName: string;
  nextLabel: string;
  restReason?: string;
}

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';

export interface RestPlan {
  /** 0 = go straight to the next exercise (superset / giant set). */
  seconds: number;
  context: RestTimerContext;
}

/**
 * Rest after a completed set: the plan's own rest when it has one, otherwise 2–3 min for heavy
 * compound lifts and 60–90 s for smaller muscles. Labelled with the exercise and what's next.
 */
export function planRestAfterSet(
  workout: WorkoutSession,
  exercise: ExerciseSession,
  completedSetId: string
): RestPlan {
  const restSecs = exercise.restSeconds;
  const isCompound = isPillarBenchmarkExercise(exercise) && exercise.equipment !== 'bodyweight';
  const hasPlannedRest = restSecs !== undefined && restSecs > 0;
  const seconds = restSecs === 0 ? 0 : hasPlannedRest ? (restSecs as number) : isCompound ? 150 : 90;

  const workingSets = exercise.sets.filter(isWorking);
  const nextSet = exercise.sets.find((s) => !s.completed && s.id !== completedSetId);
  const exIdx = workout.exercises.findIndex((e) => e.id === exercise.id);
  const nextExercise = workout.exercises.slice(exIdx + 1).find((e) => e.sets.some((s) => !s.completed));

  const nextLabel = nextSet
    ? isWorking(nextSet)
      ? `set ${workingSets.indexOf(nextSet) + 1} of ${workingSets.length}`
      : 'next warm-up set'
    : nextExercise
    ? nextExercise.name
    : 'finish your workout';

  return {
    seconds,
    context: {
      exerciseName: exercise.name,
      nextLabel,
      restReason: hasPlannedRest ? 'planned rest' : isCompound ? 'heavy lift, 2–3 min' : 'smaller muscle, 60–90 s',
    },
  };
}

/**
 * Progress XP for a just-completed working set, compared with the best set of this exercise in
 * past workouts and earlier in this session. Each set can earn XP at most once.
 */
export function evaluateSetProgressAward(
  workout: WorkoutSession,
  history: WorkoutSession[],
  exercise: ExerciseSession,
  completedSet: WorkoutSet
): XpAward | null {
  if (!isWorking(completedSet)) return null;
  if ((workout.xpAwardedSetIds || []).includes(completedSet.id)) return null;

  const thisSession = workout.exercises.find((e) => e.id === exercise.id);
  const earlierThisSession = thisSession ? thisSession.sets.filter((s) => s.id !== completedSet.id) : [];
  const pastSets = history
    .filter((w) => w.completed)
    .flatMap((w) => w.exercises.filter((e) => e.exerciseId === exercise.exerciseId).flatMap((e) => e.sets));

  let bestWeight = 0;
  let bestReps = 0;
  for (const s of [...pastSets, ...earlierThisSession]) {
    if (!s.completed || !isWorking(s)) continue;
    const w = s.actualWeightKg ?? s.targetWeightKg ?? 0;
    const r = s.actualReps ?? s.targetReps ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      bestReps = r;
    } else if (w === bestWeight && r > bestReps) {
      bestReps = r;
    }
  }

  return evaluateExerciseProgressXp(
    exercise.name,
    completedSet.actualWeightKg ?? completedSet.targetWeightKg ?? 0,
    completedSet.actualReps ?? completedSet.targetReps ?? 0,
    bestWeight > 0 ? bestWeight : undefined,
    bestReps > 0 ? bestReps : undefined,
    exercise.maxReps || 12
  );
}
