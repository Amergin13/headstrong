import { ReadinessState, UserProfile, WorkoutSession } from '../engine/types';
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
  if (unit !== 'lb') return personalized;
  return {
    ...personalized,
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
