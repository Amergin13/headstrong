import { ExerciseSession, GoalPhase } from './types';
import { ProgramExerciseTemplate, ProgramPhaseMeta, ProgramWorkoutTemplate, TrainingPlan } from './muscleBuildingProgram';

/**
 * The 6-week starter plan everyone gets: one plan, written for the athlete's goal.
 *
 * Evidence it follows (knowledge graph principle `sp-starter-plan`):
 * - Full body, 3 days a week, so each muscle is trained about twice a week. Novices do best on
 *   2–3 full-body days (ACSM progression models, 2009), and training a muscle twice a week grows
 *   it more than once (Schoenfeld, Ogborn & Krieger, 2016).
 * - About 9–12 hard sets per muscle per week by the end: more sets give more growth up to a point
 *   (Schoenfeld, Ogborn & Krieger, 2017), and beginners grow well at the lower end.
 * - 6–15 reps (6–20 on small muscles), stopping 1–3 reps short of failure: loads across this range
 *   build muscle when sets are hard (Schoenfeld et al., 2017; Refalo et al., 2023).
 * - Longer rests on the big lifts (Schoenfeld et al., 2016).
 * - Effort builds over three 2-week phases: learn the lifts, build up, then push.
 * - Losing fat: keep the weights heavy and the sets hard but don't add volume, so strength and
 *   muscle are kept while eating less (Helms et al., 2014; Murphy & Koehler, 2022).
 */

type Role = 'main' | 'compound' | 'isolation' | 'small';

interface StarterExercise {
  name: string;
  exerciseId: string;
  pillar: ExerciseSession['pillar'];
  equipment: ExerciseSession['equipment'];
  role: Role;
  /**
   * Starting weight for the plan's intermediate reference lifter, only where no other template has
   * one to borrow; it is scaled to each athlete like every plan weight.
   */
  defaultWeightKg?: number;
}

/** Workout A: squat, horizontal press, vertical pull, hinge, side shoulders, triceps. */
const WORKOUT_A: StarterExercise[] = [
  { name: 'Barbell Back Squat', exerciseId: 'ex-barbell-squat', pillar: 'Squat', equipment: 'barbell', role: 'main' },
  { name: 'Barbell Bench Press', exerciseId: 'ex-bench-press', pillar: 'Horizontal Push', equipment: 'barbell', role: 'main' },
  { name: 'Lat Pulldown', exerciseId: 'ex-lat-pulldown', pillar: 'Vertical Pull', equipment: 'cable', role: 'compound', defaultWeightKg: 55 },
  { name: 'Romanian Deadlift (RDL)', exerciseId: 'ex-rdl', pillar: 'Hinge', equipment: 'barbell', role: 'compound' },
  { name: 'DB Lateral Raise', exerciseId: 'ex-db-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', role: 'small' },
  { name: 'Cable Tricep Pushdown', exerciseId: 'ex-tricep-pushdown', pillar: 'Horizontal Push', equipment: 'cable', role: 'isolation' },
];

/** Workout B: leg press, overhead press, row, incline press, hamstring curl, biceps. */
const WORKOUT_B: StarterExercise[] = [
  { name: 'Leg Press', exerciseId: 'ex-leg-press', pillar: 'Squat', equipment: 'machine', role: 'compound' },
  { name: 'Seated DB Shoulder Press', exerciseId: 'ex-db-shoulder-press', pillar: 'Vertical Push', equipment: 'dumbbell', role: 'compound' },
  { name: 'Seated Cable Row', exerciseId: 'ex-cable-row', pillar: 'Horizontal Pull', equipment: 'cable', role: 'compound' },
  { name: 'Incline Dumbbell Press', exerciseId: 'ex-db-bench-press', pillar: 'Horizontal Push', equipment: 'dumbbell', role: 'compound' },
  { name: 'Seated Leg Curl', exerciseId: 'ex-leg-curl', pillar: 'Hinge', equipment: 'machine', role: 'isolation' },
  { name: 'Dumbbell Incline Curl', exerciseId: 'ex-bicep-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', role: 'isolation' },
];

interface GoalPrescription {
  /** Working sets per exercise in phases 1, 2 and 3. */
  sets: [number, number, number];
  /** Extra set on isolation and small-muscle exercises in phase 3. */
  phase3IsolationBonus: number;
  reps: Record<Role, string>;
  /** Reps in reserve in phases 1, 2 and 3. */
  rir: [number, number, number];
}

const PRESCRIPTIONS: Record<GoalPhase, GoalPrescription> = {
  // Build muscle: sets climb across the block, with an extra set on the smaller muscles at the end.
  'Lean Bulk': {
    sets: [2, 3, 3],
    phase3IsolationBonus: 1,
    reps: { main: '6-10', compound: '8-12', isolation: '10-15', small: '12-20' },
    rir: [3, 2, 1],
  },
  // Lose fat: heavier reps on the big lifts and no extra volume, to keep strength and muscle.
  'Cut / Recomp': {
    sets: [2, 3, 3],
    phase3IsolationBonus: 0,
    reps: { main: '5-8', compound: '6-10', isolation: '10-15', small: '12-20' },
    rir: [3, 2, 1],
  },
  // Stay lean: steady, moderate volume that keeps muscle and strength without adding fatigue.
  Maingain: {
    sets: [2, 3, 3],
    phase3IsolationBonus: 0,
    reps: { main: '6-10', compound: '8-12', isolation: '10-15', small: '12-20' },
    rir: [3, 2, 2],
  },
};

const REST_SECONDS: Record<Role, number> = { main: 150, compound: 120, isolation: 75, small: 60 };

export const STARTER_WORKOUTS_PER_WEEK = 3;
export const STARTER_WEEKS = 6;
export const STARTER_WORKOUT_COUNT = STARTER_WORKOUTS_PER_WEEK * STARTER_WEEKS;

const GOAL_PHASE3_SUMMARY: Record<GoalPhase, string> = {
  'Lean Bulk': 'Two weeks of your hardest sets, stopping about 1 rep short, with an extra set on the smaller muscles.',
  'Cut / Recomp': 'Two weeks of heavy, hard sets, stopping about 1 rep short, to keep your strength while you lose fat.',
  Maingain: 'Two weeks at 3 sets per exercise, stopping about 2 reps short, to keep building without wearing you down.',
};

function starterPhases(goal: GoalPhase): ProgramPhaseMeta[] {
  const rx = PRESCRIPTIONS[goal];
  return [
    {
      phaseNumber: 1,
      shortName: 'Learning the lifts',
      planSummary: `Two weeks to learn each lift: ${rx.sets[0]} sets per exercise, stopping about ${rx.rir[0]} reps short of failure.`,
      name: 'Phase 1: Learning the lifts',
      weeks: [1, 2],
      description: 'Full-body workouts three times a week with easier sets while you learn each movement.',
      intensityFocus: 'Technique and a steady starting point.',
    },
    {
      phaseNumber: 2,
      shortName: 'Building up',
      planSummary: `Two weeks at ${rx.sets[1]} sets per exercise, stopping about ${rx.rir[1]} reps short. When you hit the top of the rep range, the weight goes up.`,
      name: 'Phase 2: Building up',
      weeks: [3, 4],
      description: 'More sets per exercise and harder sets, adding reps or weight each time.',
      intensityFocus: 'More sets and steady progress.',
    },
    {
      phaseNumber: 3,
      shortName: 'Pushing on',
      planSummary: GOAL_PHASE3_SUMMARY[goal],
      name: 'Phase 3: Pushing on',
      weeks: [5, 6],
      description: 'The hardest two weeks of the block.',
      intensityFocus: 'Hard sets close to failure.',
    },
  ];
}

function toTemplate(ex: StarterExercise, index: number, phase: number, rx: GoalPrescription): ProgramExerciseTemplate {
  const isSmall = ex.role === 'isolation' || ex.role === 'small';
  return {
    order: String.fromCharCode(65 + index),
    name: ex.name,
    exerciseId: ex.exerciseId,
    pillar: ex.pillar,
    equipment: ex.equipment,
    sets: rx.sets[phase - 1] + (phase === 3 && isSmall ? rx.phase3IsolationBonus : 0),
    reps: rx.reps[ex.role],
    tempo: '2010',
    restSeconds: REST_SECONDS[ex.role],
    defaultWeightKg: ex.defaultWeightKg,
  };
}

const DAYS: ProgramWorkoutTemplate['dayOfWeek'][] = ['Monday', 'Wednesday', 'Friday'];

/** The 18 workouts for a goal: A and B alternate (A B A, then B A B), so nothing is trained two days running. */
export function buildStarterTemplates(goal: GoalPhase): ProgramWorkoutTemplate[] {
  const rx = PRESCRIPTIONS[goal] ?? PRESCRIPTIONS['Lean Bulk'];
  return Array.from({ length: STARTER_WORKOUT_COUNT }, (_, i) => {
    const workoutNumber = i + 1;
    const week = Math.floor(i / STARTER_WORKOUTS_PER_WEEK) + 1;
    const phase = Math.ceil(week / 2);
    const isA = i % 2 === 0;
    return {
      workoutNumber,
      week,
      dayOfWeek: DAYS[i % STARTER_WORKOUTS_PER_WEEK],
      phase,
      title: isA ? 'Full Body A' : 'Full Body B',
      // Not used for full-body sessions; recovery follows each exercise's muscles.
      splitDay: isA ? 'Push' : 'Pull',
      exercises: (isA ? WORKOUT_A : WORKOUT_B).map((ex, idx) => toTemplate(ex, idx, phase, rx)),
    };
  });
}

const planCache = new Map<GoalPhase, TrainingPlan>();

/** The starter plan written for the athlete's goal (one shared object per goal). */
export function buildStarterPlan(goal: GoalPhase): TrainingPlan {
  const cached = planCache.get(goal);
  if (cached) return cached;
  const rx = PRESCRIPTIONS[goal] ?? PRESCRIPTIONS['Lean Bulk'];
  const plan: TrainingPlan = {
    id: 'starter_6wk',
    name: '6 Week Starter Plan',
    workoutsPerWeek: STARTER_WORKOUTS_PER_WEEK,
    templates: buildStarterTemplates(goal),
    phases: starterPhases(goal),
    targetRirForPhase: (phase) => rx.rir[Math.min(3, Math.max(1, phase)) - 1],
  };
  planCache.set(goal, plan);
  return plan;
}
