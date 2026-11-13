import { GoalPhase, PlanId, ProgramSplitType, SavedTrainingPlan, UserProfile, WorkoutSession } from './types';
import { MUSCLE_BUILDING_PLAN, TrainingPlan, getSessionPlanId } from './muscleBuildingProgram';
import { STARTER_SESSIONS_PER_WEEK, STARTER_WORKOUT_COUNT, buildStarterPlan } from './starterPlan';

/**
 * Which plan an athlete is on.
 *
 * Everyone gets the goal-based starter plan, plus any programs imported into `profile.customPlans`.
 * The 24-workout muscle plan is shown only to the owner's signed-in account. The email is compared by
 * hash so the address itself isn't in the app's code.
 */
const MUSCLE_PLAN_ACCOUNT_HASHES = ['2eu9ah3d4rj'];

/** Short non-reversible hash (cyrb53) of an email address, lower-cased and trimmed. */
export function hashAccountEmail(email: string): string {
  const str = email.trim().toLowerCase();
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** True when the signed-in account may use the 24-workout muscle plan. */
export function canUseMusclePlan(email?: string): boolean {
  return Boolean(email) && MUSCLE_PLAN_ACCOUNT_HASHES.includes(hashAccountEmail(email as string));
}

export function isCustomPlanId(id?: string): id is `custom:${string}` {
  return typeof id === 'string' && id.startsWith('custom:');
}

/** Built-in 6-week plans and any saved custom spreadsheet plan. */
export function isPlanProgram(programType?: ProgramSplitType): boolean {
  return (
    programType === 'muscle_building_6wk' ||
    programType === 'starter_6wk' ||
    programType === 'starter_4day' ||
    isCustomPlanId(programType)
  );
}

export function savedPlanToTrainingPlan(saved: SavedTrainingPlan): TrainingPlan {
  return {
    id: saved.id,
    name: saved.name,
    workoutsPerWeek: saved.workoutsPerWeek,
    phases: saved.phases,
    templates: saved.templates,
    targetRirForPhase: (phase) => (phase === 2 ? 1 : 2),
  };
}

/**
 * The plan to show. A saved custom plan when chosen and present on the profile; the muscle plan
 * only when it's chosen and the owner is signed in; otherwise the starter plan for the athlete's goal.
 */
export function resolveActivePlan(
  profile: Pick<UserProfile, 'programType' | 'goalPhase' | 'email' | 'customPlans'>
): TrainingPlan {
  if (isCustomPlanId(profile.programType)) {
    const custom = profile.customPlans?.find((p) => p.id === profile.programType);
    if (custom) return savedPlanToTrainingPlan(custom);
  }
  if (profile.programType === 'muscle_building_6wk' && canUseMusclePlan(profile.email)) return MUSCLE_BUILDING_PLAN;
  return buildStarterPlan(profile.goalPhase || 'Lean Bulk', profile.programType === 'starter_4day' ? 'lift4' : 'lift3_active1');
}

/** A plan by id (including custom saved plans when supplied). */
export function getPlanById(
  id: PlanId,
  goal: GoalPhase = 'Lean Bulk',
  customPlans?: SavedTrainingPlan[]
): TrainingPlan {
  if (isCustomPlanId(id)) {
    const custom = customPlans?.find((p) => p.id === id);
    if (custom) return savedPlanToTrainingPlan(custom);
  }
  if (id === 'muscle_building_6wk') return MUSCLE_BUILDING_PLAN;
  return buildStarterPlan(goal, id === 'starter_4day' ? 'lift4' : 'lift3_active1');
}

/** Workouts in the plan a session belongs to, and how many per week (for "Workout 3 of 18"). */
export function getSessionPlanShape(
  w: WorkoutSession,
  customPlans?: SavedTrainingPlan[]
): { total: number; perWeek: number } | undefined {
  const id = getSessionPlanId(w);
  if (!id) return undefined;
  if (isCustomPlanId(id)) {
    const custom = customPlans?.find((p) => p.id === id);
    if (custom) return { total: custom.templates.length, perWeek: custom.workoutsPerWeek };
    return undefined;
  }
  return id === 'muscle_building_6wk'
    ? { total: MUSCLE_BUILDING_PLAN.templates.length, perWeek: MUSCLE_BUILDING_PLAN.workoutsPerWeek }
    : { total: STARTER_WORKOUT_COUNT, perWeek: STARTER_SESSIONS_PER_WEEK };
}
