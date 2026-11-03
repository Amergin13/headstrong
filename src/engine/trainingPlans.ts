import { GoalPhase, PlanId, ProgramSplitType, UserProfile, WorkoutSession } from './types';
import { MUSCLE_BUILDING_PLAN, TrainingPlan, getSessionPlanId } from './muscleBuildingProgram';
import { STARTER_WORKOUT_COUNT, STARTER_WORKOUTS_PER_WEEK, buildStarterPlan } from './starterPlan';

/**
 * Which 6-week plan an athlete is on.
 *
 * Everyone gets the goal-based starter plan. The 24-workout muscle plan is shown only to the owner's
 * signed-in account. The email is compared by hash so the address itself isn't in the app's code.
 * This only controls what the app shows: it isn't security (sign-in is checked on the device).
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

/** Both plans are 6-week plans; the older split programs are no longer offered. */
export function isPlanProgram(programType?: ProgramSplitType): boolean {
  return programType === 'muscle_building_6wk' || programType === 'starter_6wk';
}

/**
 * The plan to show. The muscle plan only when it's chosen and the owner is signed in; otherwise
 * the starter plan for the athlete's goal (so signing out keeps the muscle-plan history but shows
 * the starter plan, and signing back in brings the muscle plan back).
 */
export function resolveActivePlan(profile: Pick<UserProfile, 'programType' | 'goalPhase' | 'email'>): TrainingPlan {
  if (profile.programType === 'muscle_building_6wk' && canUseMusclePlan(profile.email)) return MUSCLE_BUILDING_PLAN;
  return buildStarterPlan(profile.goalPhase || 'Lean Bulk');
}

/** A plan by id (the starter plan's workout names and counts don't depend on the goal). */
export function getPlanById(id: PlanId, goal: GoalPhase = 'Lean Bulk'): TrainingPlan {
  return id === 'muscle_building_6wk' ? MUSCLE_BUILDING_PLAN : buildStarterPlan(goal);
}

/** Workouts in the plan a session belongs to, and how many per week (for "Workout 3 of 18"). */
export function getSessionPlanShape(w: WorkoutSession): { total: number; perWeek: number } | undefined {
  const id = getSessionPlanId(w);
  if (!id) return undefined;
  return id === 'muscle_building_6wk'
    ? { total: MUSCLE_BUILDING_PLAN.templates.length, perWeek: MUSCLE_BUILDING_PLAN.workoutsPerWeek }
    : { total: STARTER_WORKOUT_COUNT, perWeek: STARTER_WORKOUTS_PER_WEEK };
}
