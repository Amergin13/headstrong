import { ExerciseSession, ReadinessState, UserProfile, WorkoutSession } from '../engine/types';
import { personalizeSessionLoads } from '../engine/loadPersonalization';
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
