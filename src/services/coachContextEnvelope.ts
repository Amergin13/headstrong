/**
 * Strict OOUX Object Interfaces, JSON Schemas, and 3-Tier ContextEnvelope Builder
 * for the Treise Agentic AI Coach.
 *
 * Every coach request builds a lightweight ContextEnvelope combining:
 * 1. Working State: active app route, active Program (week/day, completion %), today's Workout, Goals
 * 2. Episodic Memory: last 5 workout summaries, recent PRs, stalled lifts, adherence streak
 * 3. Semantic Memory & Knowledge Graph Edges: persistent athlete attributes & injury/contraindication edges
 */
import { ActivityLog, activeDayDates, describeActivity } from '../engine/activeDays';
import { calculateE1RM, isTimedExercise } from '../engine/e1rm';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { AthleteKnowledgeGraph, buildAthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { buildPlanOverview, getNextProgramWorkoutNumber, planWorkoutLabel } from '../engine/muscleBuildingProgram';
import { computeTrainingStreak, getWorkoutCompletedAt } from '../engine/recovery';
import { resolveActivePlan } from '../engine/trainingPlans';
import { calculateSessionTonnage } from '../engine/wci';
import {
  AthleteMemoryCategory,
  AthleteMemoryFact,
  BiometricLog,
  ExerciseDefinition,
  GoalPhase,
  HomeEquipmentTag,
  ReadinessState,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { localDateString } from '../utils/date';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import { formatWeight } from '../utils/units';
import { buildAthleteGoals } from './athleteGoals';
import type { CoachPlace } from './coachContext';

// ============================================================================
// 1. STRICT OOUX DOMAIN OBJECTS
// ============================================================================

export interface OouxExercise {
  id: string;
  exercise_id: string;
  name: string;
  pillar: string;
  primary_muscle: string;
  equipment: string;
  is_timed: boolean;
  min_reps: number;
  max_reps: number;
  target_weight_kg: number;
  target_reps: number;
  target_duration_seconds: number | null;
  target_rir: number;
  completed_sets: number;
  total_sets: number;
  estimated_1rm_kg: number | null;
  athlete_notes: string | null;
  stalled: boolean;
}

export interface OouxWorkout {
  id: string;
  name: string;
  split_day: string;
  day_instance_kind: 'lifting_workout' | 'active_day' | 'rest_day';
  location: TrainingLocation;
  readiness_state: ReadinessState;
  program_workout_number: number | null;
  completed: boolean;
  completed_sets: number;
  total_sets: number;
  exercises: OouxExercise[];
}

export interface OouxActiveDay {
  id: string;
  date: string;
  activity_type: string;
  duration_minutes: number;
  distance_km: number | null;
  source: string;
  summary: string;
}

export interface OouxExerciseNote {
  exercise_id: string;
  exercise_name: string;
  date: string;
  note: string;
}

export interface OouxProgram {
  id: string;
  name: string;
  current_week: number;
  total_weeks: number;
  current_day_number: number;
  total_workouts: number;
  completed_workouts: number;
  completion_pct: number;
  phase_name: string;
  cycle_started_at: string | null;
}

export interface OouxGoal {
  id: string;
  kind: 'process' | 'outcome';
  title: string;
  metric: string;
  current: number;
  target: number;
  unit: string;
  progress_pct: number;
  achieved: boolean;
}

export interface AthleteExerciseEdge {
  from: 'Athlete';
  relation: 'CONTRAINDICATED_WITH' | 'AVOIDS' | 'HIGH_JOINT_STRAIN';
  to_exercise_id: string;
  to_exercise_name: string;
  reason: string;
  severity: 'caution' | 'avoid';
}

export interface OouxAthlete {
  id: string;
  name: string;
  weight_unit: 'kg' | 'lb';
  experience_level: string;
  age: number | null;
  goal_phase: GoalPhase;
  identity_goal: string;
  bodyweight_kg: number | null;
  training_maxes_kg: Record<string, number>;
  home_equipment: HomeEquipmentTag[];
  active_location: TrainingLocation;
  adherence_streak_days: number;
  memories: AthleteMemoryFact[];
  contraindications: AthleteExerciseEdge[];
}

export interface EpisodicWorkoutSummary {
  id: string;
  date: string;
  name: string;
  split_day: string;
  completed_sets: number;
  total_volume_kg: number;
  top_lift: string | null;
}

export interface EpisodicPrSummary {
  exercise_id: string;
  exercise_name: string;
  e1rm_kg: number;
  weight_kg: number;
  reps: number;
  date: string;
}

export interface EpisodicStallSummary {
  exercise_id: string;
  exercise_name: string;
  last_weight_kg: number;
  last_reps: number;
  sessions_flat: number;
}

export interface ContextEnvelope {
  schema_version: '1.0';
  working_state: {
    app_route: string;
    athlete: OouxAthlete;
    program: OouxProgram;
    today_workout: OouxWorkout;
    goals: OouxGoal[];
  };
  episodic_memory: {
    recent_workouts: EpisodicWorkoutSummary[];
    recent_active_days: OouxActiveDay[];
    exercise_notes: OouxExerciseNote[];
    recent_prs: EpisodicPrSummary[];
    stalled_lifts: EpisodicStallSummary[];
    adherence_streak_days: number;
  };
  semantic_memory: {
    athlete_attributes: {
      bodyweight_kg: number | null;
      training_maxes_kg: Record<string, number>;
      home_equipment: HomeEquipmentTag[];
      identity_goal: string;
      weight_unit: 'kg' | 'lb';
      age: number | null;
    };
    saved_memories: AthleteMemoryFact[];
    knowledge_graph_edges: Array<{
      from: string;
      relation: string;
      to: string;
      weight_or_severity: number | string;
      reason: string;
    }>;
  };
}

// ============================================================================
// 2. JSON SCHEMAS FOR CORE OOUX OBJECTS
// ============================================================================

export const OOUX_OBJECT_SCHEMAS = {
  Athlete: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'name', 'weight_unit', 'goal_phase', 'identity_goal', 'home_equipment', 'active_location', 'adherence_streak_days'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      weight_unit: { type: 'string', enum: ['kg', 'lb'] },
      experience_level: { type: 'string' },
      age: { type: ['number', 'null'] },
      goal_phase: { type: 'string', enum: ['Lean Bulk', 'Cut / Recomp', 'Maingain'] },
      identity_goal: { type: 'string' },
      bodyweight_kg: { type: ['number', 'null'] },
      training_maxes_kg: { type: 'object' },
      home_equipment: { type: 'array', items: { type: 'string' } },
      active_location: { type: 'string', enum: ['gym', 'home', 'travel'] },
      adherence_streak_days: { type: 'number' },
      memories: { type: 'array', items: { type: 'object' } },
      contraindications: { type: 'array', items: { type: 'object' } },
    },
  },
  Program: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'name', 'current_week', 'total_weeks', 'current_day_number', 'total_workouts', 'completed_workouts', 'completion_pct', 'phase_name'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      current_week: { type: 'number' },
      total_weeks: { type: 'number' },
      current_day_number: { type: 'number' },
      total_workouts: { type: 'number' },
      completed_workouts: { type: 'number' },
      completion_pct: { type: 'number', minimum: 0, maximum: 100 },
      phase_name: { type: 'string' },
      cycle_started_at: { type: ['string', 'null'] },
    },
  },
  Workout: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'name', 'split_day', 'day_instance_kind', 'location', 'readiness_state', 'completed', 'completed_sets', 'total_sets', 'exercises'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      split_day: { type: 'string' },
      day_instance_kind: { type: 'string', enum: ['lifting_workout', 'active_day', 'rest_day'] },
      location: { type: 'string', enum: ['gym', 'home', 'travel'] },
      readiness_state: { type: 'string', enum: ['Primed', 'Normal', 'Amber Shield'] },
      program_workout_number: { type: ['number', 'null'] },
      completed: { type: 'boolean' },
      completed_sets: { type: 'number' },
      total_sets: { type: 'number' },
      exercises: { type: 'array', items: { type: 'object' } },
    },
  },
  Exercise: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'exercise_id', 'name', 'pillar', 'primary_muscle', 'equipment', 'is_timed', 'min_reps', 'max_reps', 'target_weight_kg', 'target_reps', 'target_duration_seconds', 'target_rir', 'completed_sets', 'total_sets', 'stalled'],
    properties: {
      id: { type: 'string' },
      exercise_id: { type: 'string' },
      name: { type: 'string' },
      pillar: { type: 'string' },
      primary_muscle: { type: 'string' },
      equipment: { type: 'string' },
      is_timed: { type: 'boolean' },
      min_reps: { type: 'number' },
      max_reps: { type: 'number' },
      target_weight_kg: { type: 'number' },
      target_reps: { type: 'number' },
      target_duration_seconds: { type: ['number', 'null'] },
      target_rir: { type: 'number' },
      completed_sets: { type: 'number' },
      total_sets: { type: 'number' },
      estimated_1rm_kg: { type: ['number', 'null'] },
      athlete_notes: { type: ['string', 'null'] },
      stalled: { type: 'boolean' },
    },
  },
  Goal: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'kind', 'title', 'metric', 'current', 'target', 'unit', 'progress_pct', 'achieved'],
    properties: {
      id: { type: 'string' },
      kind: { type: 'string', enum: ['process', 'outcome'] },
      title: { type: 'string' },
      metric: { type: 'string' },
      current: { type: 'number' },
      target: { type: 'number' },
      unit: { type: 'string' },
      progress_pct: { type: 'number', minimum: 0, maximum: 100 },
      achieved: { type: 'boolean' },
    },
  },
  ActiveDay: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'date', 'activity_type', 'duration_minutes', 'source', 'summary'],
    properties: {
      id: { type: 'string' },
      date: { type: 'string' },
      activity_type: { type: 'string' },
      duration_minutes: { type: 'number' },
      distance_km: { type: ['number', 'null'] },
      source: { type: 'string' },
      summary: { type: 'string' },
    },
  },
  ExerciseNote: {
    type: 'object',
    additionalProperties: false,
    required: ['exercise_id', 'exercise_name', 'date', 'note'],
    properties: {
      exercise_id: { type: 'string' },
      exercise_name: { type: 'string' },
      date: { type: 'string' },
      note: { type: 'string' },
    },
  },
} as const;

// ============================================================================
// 3. CONTEXT ENVELOPE CONSTRUCTION
// ============================================================================

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const isDoneWorking = (s: WorkoutSet) => s.completed && isWorking(s);

function routeFromPlace(place?: CoachPlace): string {
  if (!place) return '/train';
  if (place.tab === 'program') return '/program';
  if (place.tab === 'analytics') {
    if (place.goalId) return `/progress/goals/${place.goalId}`;
    if (place.detail) return `/progress/${place.detail}`;
    return '/progress';
  }
  return '/train';
}

const CONTRAINDICATION_RULES: Array<{
  pattern: RegExp;
  label: string;
  matchesExercise: (def: ExerciseDefinition) => boolean;
}> = [
  {
    pattern: /\b(shoulder|rotator|impingement|ac joint)\b/i,
    label: 'Shoulder sensitivity noted in athlete memory',
    matchesExercise: (d) =>
      d.pillar === 'Vertical Push' ||
      d.primaryJoints?.includes('Shoulder Capsule') ||
      /overhead|upright row|dip/i.test(d.name),
  },
  {
    pattern: /\b(knee|patella|patellar|acl|meniscus)\b/i,
    label: 'Knee sensitivity noted in athlete memory',
    matchesExercise: (d) =>
      d.pillar === 'Squat' ||
      d.primaryJoints?.includes('Knee / Patellar') ||
      /squat|lunge|split squat|leg extension/i.test(d.name),
  },
  {
    pattern: /\b(lower back|lumbar|spine|disc|sciatica)\b/i,
    label: 'Lower back sensitivity noted in athlete memory',
    matchesExercise: (d) =>
      d.pillar === 'Hinge' ||
      d.primaryJoints?.includes('Lumbar Spine') ||
      /deadlift|rdl|barbell row|back squat/i.test(d.name),
  },
  {
    pattern: /\b(elbow|tendon|tendinitis|tennis elbow|golfer)\b/i,
    label: 'Elbow tendon sensitivity noted in athlete memory',
    matchesExercise: (d) =>
      d.primaryJoints?.includes('Elbow Tendons') ||
      /skullcrusher|extension|curl|chin-up|pull-up|dip/i.test(d.name),
  },
  {
    pattern: /\b(wrist|carpal)\b/i,
    label: 'Wrist sensitivity noted in athlete memory',
    matchesExercise: (d) => /front squat|bench press|push-up|curl/i.test(d.name),
  },
  {
    pattern: /\b(ankle|achilles)\b/i,
    label: 'Ankle sensitivity noted in athlete memory',
    matchesExercise: (d) => d.primaryJoints?.includes('Ankle / Achilles') || /calf|run|sprint/i.test(d.name),
  },
];

export function deriveContraindicationEdges(
  memories: AthleteMemoryFact[],
  exerciseCatalog: ExerciseDefinition[],
  kg?: AthleteKnowledgeGraph
): AthleteExerciseEdge[] {
  const edges: AthleteExerciseEdge[] = [];
  const seen = new Set<string>();

  for (const mem of memories) {
    if (mem.category !== 'injury' && mem.category !== 'contraindication' && mem.category !== 'preference') {
      continue;
    }
    const lowerVal = mem.value.toLowerCase();
    // Explicit exercise match from memory text or relatedExerciseIds
    for (const def of exerciseCatalog) {
      const explicitHit =
        mem.relatedExerciseIds?.includes(def.id) || lowerVal.includes(def.name.toLowerCase());
      const patternHit =
        (mem.category === 'injury' || mem.category === 'contraindication') &&
        CONTRAINDICATION_RULES.some((r) => r.pattern.test(lowerVal) && r.matchesExercise(def));

      if (!explicitHit && !patternHit) continue;
      const relation: AthleteExerciseEdge['relation'] =
        mem.category === 'preference' && /\b(avoid|hate|dislike|skip|no )\b/i.test(lowerVal)
          ? 'AVOIDS'
          : 'CONTRAINDICATED_WITH';
      if (mem.category === 'preference' && relation !== 'AVOIDS' && !explicitHit) continue;

      const key = `${relation}:${def.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: 'Athlete',
        relation,
        to_exercise_id: def.id,
        to_exercise_name: def.name,
        reason: mem.value,
        severity: mem.category === 'injury' || mem.category === 'contraindication' ? 'avoid' : 'caution',
      });
    }
  }

  // Also include elevated/overloaded joints from the Knowledge Graph as caution edges for active contributors
  if (kg) {
    for (const j of kg.joints) {
      if (j.status === 'Optimal') continue;
      for (const contributor of j.topContributors.slice(0, 2)) {
        const def = exerciseCatalog.find((d) => d.name.toLowerCase() === contributor.toLowerCase());
        if (!def) continue;
        const key = `HIGH_JOINT_STRAIN:${def.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          from: 'Athlete',
          relation: 'HIGH_JOINT_STRAIN',
          to_exercise_id: def.id,
          to_exercise_name: def.name,
          reason: `${j.joint} load ${j.strainScore}/100 (${j.status})`,
          severity: j.status === 'High Strain Alert' ? 'avoid' : 'caution',
        });
      }
    }
  }

  return edges;
}

export function buildContextEnvelope(input: {
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  weeklyVolume?: Record<string, number>;
  activities?: ActivityLog[];
  place?: CoachPlace;
  routeName?: 'train' | 'program' | 'analytics';
  knowledgeGraph?: AthleteKnowledgeGraph;
}): ContextEnvelope {
  const {
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume,
    activities = [],
    place,
  } = input;

  const kg =
    input.knowledgeGraph ??
    buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, weeklyVolume ?? {}, activities);
  const emaLookup = buildBodyweightEmaLookup(biometrics);
  const hasRealBw = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const completedWorkouts = workouts
    .filter((w) => w.completed)
    .sort((a, b) => getWorkoutCompletedAt(b) - getWorkoutCompletedAt(a));

  // Best E1RM per exercise across history + detect stalled lifts (>= 2 sessions with no top-set / E1RM improvement)
  const sessionsByEx = new Map<
    string,
    Array<{ name: string; date: string; e1rmKg: number; weightKg: number; reps: number }>
  >();

  for (const w of completedWorkouts) {
    const bw = hasRealBw ? emaLookup(w.date, bodyweightEmaKg) : 0;
    for (const ex of w.exercises) {
      if (isTimedExercise(ex)) continue;
      const sets = ex.sets.filter(isDoneWorking);
      if (sets.length === 0) continue;
      let topE1rm = 0;
      let topWeight = 0;
      let topReps = 0;
      for (const s of sets) {
        const wt = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const reps = s.actualReps ?? s.targetReps ?? 0;
        const e1 = calculateE1RM(
          wt,
          reps,
          s.actualRir ?? s.targetRir ?? 2,
          ex.equipment,
          ex.isRdl,
          ex.isWeightedCalisthenic,
          bw,
          ex.exerciseId,
          ex.pillar
        );
        if (e1 >= topE1rm) {
          topE1rm = Math.round(e1 * 10) / 10;
          topWeight = wt;
          topReps = reps;
        }
      }
      if (!sessionsByEx.has(ex.exerciseId)) sessionsByEx.set(ex.exerciseId, []);
      sessionsByEx.get(ex.exerciseId)!.push({
        name: ex.name,
        date: w.date,
        e1rmKg: topE1rm,
        weightKg: topWeight,
        reps: topReps,
      });
    }
  }

  const trainingMaxesKg: Record<string, number> = {};
  const recentPrs: EpisodicPrSummary[] = [];
  const stalledLifts: EpisodicStallSummary[] = [];
  const stalledIds = new Set<string>();

  for (const [exerciseId, hist] of sessionsByEx.entries()) {
    if (hist.length === 0) continue;
    const best = hist.reduce((a, b) => (b.e1rmKg > a.e1rmKg ? b : a));
    if (best.e1rmKg > 0) {
      trainingMaxesKg[exerciseId] = best.e1rmKg;
    }
    // Recent PR: latest session equals the all-time best E1RM (or within top 1% and strictly > prior best)
    if (hist.length >= 2) {
      const latest = hist[0];
      const priorBest = hist.slice(1).reduce((m, s) => Math.max(m, s.e1rmKg), 0);
      if (latest.e1rmKg > priorBest) {
        recentPrs.push({
          exercise_id: exerciseId,
          exercise_name: latest.name,
          e1rm_kg: latest.e1rmKg,
          weight_kg: latest.weightKg,
          reps: latest.reps,
          date: latest.date,
        });
      } else if (hist.length >= 3 && latest.e1rmKg <= hist[1].e1rmKg && hist[1].e1rmKg <= hist[2].e1rmKg) {
        stalledIds.add(exerciseId);
        stalledLifts.push({
          exercise_id: exerciseId,
          exercise_name: latest.name,
          last_weight_kg: latest.weightKg,
          last_reps: latest.reps,
          sessions_flat: 3,
        });
      }
    }
  }

  const unit = profile.weightUnit || 'kg';
  const recentWorkouts: EpisodicWorkoutSummary[] = completedWorkouts.slice(0, 5).map((w) => {
    const doneSets = w.exercises.flatMap((ex) => ex.sets.filter(isDoneWorking));
    const bwForDay = hasRealBw ? emaLookup(w.date, bodyweightEmaKg) : 0;
    const totalVolumeKg = Math.round(calculateSessionTonnage(w, bwForDay).tonnageKg);
    const heaviest = w.exercises
      .filter((ex) => !isTimedExercise(ex))
      .flatMap((ex) => ex.sets.filter(isDoneWorking).map((s) => ({ name: ex.name, w: s.actualWeightKg ?? s.targetWeightKg ?? 0, r: s.actualReps ?? s.targetReps ?? 0 })))
      .sort((a, b) => b.w - a.w)[0];
    return {
      id: w.id,
      date: w.date,
      name: planWorkoutLabel(w.name),
      split_day: w.splitDay,
      completed_sets: doneSets.length,
      total_volume_kg: totalVolumeKg,
      top_lift: heaviest ? `${heaviest.name} ${formatWeight(heaviest.w, unit)}×${heaviest.r}` : null,
    };
  });

  const recentActiveDays: OouxActiveDay[] = [...activities]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      date: a.date,
      activity_type: a.type,
      duration_minutes: a.minutes,
      distance_km: a.distanceKm ?? null,
      source: a.source,
      summary: describeActivity(a),
    }));

  const exerciseNotes: OouxExerciseNote[] = (kg.exerciseNotesHistory ?? []).slice(0, 6).map((n) => ({
    exercise_id: n.exerciseId,
    exercise_name: n.exerciseName,
    date: n.date,
    note: n.note,
  }));

  // Program state (1:1 with ProgramTab)
  const plan = resolveActivePlan(profile);
  const overview = buildPlanOverview(workouts, plan, activities, profile.planCycleStarts);
  const nextNum = getNextProgramWorkoutNumber(workouts, plan, profile.planCycleStarts);
  const totalWeeks = Math.max(1, ...plan.templates.map((t) => t.week));
  const totalWorkouts = plan.templates.length;
  const nextTemplate = plan.templates.find((t) => t.workoutNumber === nextNum);
  const currentWeek = nextTemplate?.week ?? 1;
  const currentPhase =
    plan.phases.find((p) => p.phaseNumber === overview.activePhase) ??
    plan.phases[0];
  const completionPct =
    totalWorkouts > 0 ? Math.min(100, Math.round((overview.completedCount / totalWorkouts) * 100)) : 0;

  const programObj: OouxProgram = {
    id: plan.id,
    name: plan.name,
    current_week: currentWeek,
    total_weeks: totalWeeks,
    current_day_number: nextNum,
    total_workouts: totalWorkouts,
    completed_workouts: overview.completedCount,
    completion_pct: completionPct,
    phase_name: currentPhase?.shortName ?? 'Current Phase',
    cycle_started_at: profile.planCycleStarts?.[plan.id] ?? null,
  };

  // Today's Workout OOUX object
  const exById = new Map(exerciseCatalog.map((d) => [d.id, d]));
  const oouxExercises: OouxExercise[] = activeWorkout.exercises.map((ex) => {
    const working = ex.sets.filter(isWorking);
    const done = working.filter((s) => s.completed);
    const first = working[0];
    const def = exById.get(ex.exerciseId);
    const timed = Boolean(isTimedExercise(ex) || (def && isTimedExercise(def)));
    const targetDur = timed
      ? first?.targetDurationSeconds ?? def?.defaultDurationSeconds ?? 45
      : null;
    return {
      id: ex.id,
      exercise_id: ex.exerciseId,
      name: ex.name,
      pillar: ex.pillar,
      primary_muscle: def?.primaryMuscle ?? ex.pillar,
      equipment: ex.equipment,
      is_timed: timed,
      min_reps: ex.minReps,
      max_reps: ex.maxReps,
      target_weight_kg: first?.targetWeightKg ?? 0,
      target_reps: first?.targetReps ?? ex.minReps,
      target_duration_seconds: targetDur,
      target_rir: first?.targetRir ?? 2,
      completed_sets: done.length,
      total_sets: working.length,
      estimated_1rm_kg: timed ? null : trainingMaxesKg[ex.exerciseId] ?? null,
      athlete_notes: ex.athleteNotes?.trim() ? ex.athleteNotes.trim() : null,
      stalled: stalledIds.has(ex.exerciseId),
    };
  });

  const todayDateStr = localDateString();
  const hasActiveDayToday = activities.some((a) => a.date === todayDateStr);
  const totalDoneSets = oouxExercises.reduce((sum, e) => sum + e.completed_sets, 0);
  const dayInstanceKind: OouxWorkout['day_instance_kind'] =
    activeWorkout.date > todayDateStr && totalDoneSets === 0
      ? hasActiveDayToday
        ? 'active_day'
        : 'rest_day'
      : 'lifting_workout';

  const todayWorkoutObj: OouxWorkout = {
    id: activeWorkout.id,
    name: planWorkoutLabel(activeWorkout.name),
    split_day: activeWorkout.splitDay,
    day_instance_kind: dayInstanceKind,
    location: activeWorkout.location ?? profile.activeLocation ?? 'gym',
    readiness_state: readinessState,
    program_workout_number: activeWorkout.programWorkoutNumber ?? null,
    completed: activeWorkout.completed,
    completed_sets: totalDoneSets,
    total_sets: oouxExercises.reduce((sum, e) => sum + e.total_sets, 0),
    exercises: oouxExercises,
  };

  // Goals OOUX objects
  const rawGoals = buildAthleteGoals({ profile, workouts, biometrics, activities });
  const goals: OouxGoal[] = rawGoals.map((g) => ({
    id: g.id,
    kind: g.kind,
    title: g.title,
    metric: g.measure.type,
    current: g.current,
    target: g.target,
    unit: g.unit,
    progress_pct: g.progressPct,
    achieved: g.achieved,
  }));

  const streakDays = computeTrainingStreak(workouts, Date.now(), activeDayDates(activities));
  const memories = profile.athleteMemories ?? [];
  const contraindications = deriveContraindicationEdges(memories, exerciseCatalog, kg);

  const athleteObj: OouxAthlete = {
    id: profile.authUserId || profile.email || 'local-athlete',
    name: profile.name || 'Athlete',
    weight_unit: profile.weightUnit || 'kg',
    experience_level: profile.experienceLevel || 'intermediate',
    age: profile.ageEntered ? profile.age : null,
    goal_phase: profile.goalPhase,
    identity_goal: GOAL_DISPLAY_NAME[profile.goalPhase] ?? profile.goalPhase,
    bodyweight_kg: hasRealBw ? Math.round(bodyweightEmaKg * 10) / 10 : null,
    training_maxes_kg: trainingMaxesKg,
    home_equipment: profile.homeEquipment || [],
    active_location: profile.activeLocation || 'gym',
    adherence_streak_days: streakDays,
    memories,
    contraindications,
  };

  const kgEdges = [
    ...contraindications.map((e) => ({
      from: e.from,
      relation: e.relation,
      to: e.to_exercise_name,
      weight_or_severity: e.severity,
      reason: e.reason,
    })),
    ...kg.edges.map((e) => ({
      from: e.source,
      relation: e.relation,
      to: e.target,
      weight_or_severity: e.weight,
      reason: e.label,
    })),
  ];

  return {
    schema_version: '1.0',
    working_state: {
      app_route: routeFromPlace(input.routeName ? { tab: input.routeName } : place),
      athlete: athleteObj,
      program: programObj,
      today_workout: todayWorkoutObj,
      goals,
    },
    episodic_memory: {
      recent_workouts: recentWorkouts,
      recent_active_days: recentActiveDays,
      exercise_notes: exerciseNotes,
      recent_prs: recentPrs.slice(0, 4),
      stalled_lifts: stalledLifts.slice(0, 4),
      adherence_streak_days: streakDays,
    },
    semantic_memory: {
      athlete_attributes: {
        bodyweight_kg: athleteObj.bodyweight_kg,
        training_maxes_kg: trainingMaxesKg,
        home_equipment: athleteObj.home_equipment,
        identity_goal: athleteObj.identity_goal,
        weight_unit: athleteObj.weight_unit,
        age: athleteObj.age,
      },
      saved_memories: memories,
      knowledge_graph_edges: kgEdges,
    },
  };
}

export function serializeContextEnvelopeForPrompt(env: ContextEnvelope): string {
  const { working_state: ws, episodic_memory: ep, semantic_memory: sm } = env;
  const unit = ws.athlete.weight_unit || 'kg';
  const recentText =
    ep.recent_workouts.length > 0
      ? ep.recent_workouts
          .slice(0, 5)
          .map((w) => `${w.date} ${w.name} (${w.completed_sets} sets${w.top_lift ? `, ${w.top_lift}` : ''})`)
          .join('; ')
      : 'none yet';
  const prsText =
    ep.recent_prs.length > 0
      ? ep.recent_prs.map((p) => `${p.exercise_name} E1RM ${formatWeight(p.e1rm_kg, unit)}`).join(', ')
      : 'none';
  const stallText =
    ep.stalled_lifts.length > 0
      ? ep.stalled_lifts.map((s) => `${s.exercise_name} (${formatWeight(s.last_weight_kg, unit)}×${s.last_reps})`).join(', ')
      : 'none';
  const memoriesText =
    sm.saved_memories.length > 0
      ? sm.saved_memories.map((m) => `[${m.category}] ${m.value}`).join(' | ')
      : 'none';
  const contraText =
    ws.athlete.contraindications.length > 0
      ? ws.athlete.contraindications
          .slice(0, 5)
          .map((c) => `${c.to_exercise_name} (${c.relation}: ${c.reason})`)
          .join('; ')
      : 'none';

  const activeDaysText =
    ep.recent_active_days.length > 0
      ? ep.recent_active_days.slice(0, 3).map((a) => `${a.date} ${a.summary}`).join('; ')
      : 'none';
  const notesText =
    ep.exercise_notes.length > 0
      ? ep.exercise_notes.slice(0, 4).map((n) => `${n.exercise_name} (${n.date}): "${n.note}"`).join('; ')
      : 'none';
  const timedToday = ws.today_workout.exercises
    .filter((e) => e.is_timed)
    .map((e) => `${e.name} (${e.target_duration_seconds ?? 45}s hold)`)
    .join(', ');

  return [
    `Route: ${ws.app_route} | Day mode: ${ws.today_workout.day_instance_kind} | Program completion: ${ws.program.completion_pct}% (${ws.program.completed_workouts}/${ws.program.total_workouts}, Wk ${ws.program.current_week}/${ws.program.total_weeks} Day ${ws.program.current_day_number}).`,
    `Streak: ${ep.adherence_streak_days}d. Recent 5: ${recentText}. Active days: ${activeDaysText}.`,
    `PRs: ${prsText}. Stalled: ${stallText}.${timedToday ? ` Timed holds today: ${timedToday}.` : ''}`,
    `Notes: ${notesText}. Memory: ${memoriesText}. Contraindications: ${contraText}.`,
  ].join('\n');
}

export function createMemoryFact(
  category: AthleteMemoryCategory,
  value: string,
  exerciseCatalog: ExerciseDefinition[]
): AthleteMemoryFact {
  const clean = value.trim();
  const lower = clean.toLowerCase();
  const relatedExerciseIds = exerciseCatalog
    .filter((d) => lower.includes(d.name.toLowerCase()))
    .map((d) => d.id);
  return {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    value: clean,
    createdAt: new Date().toISOString(),
    source: 'coach',
    ...(relatedExerciseIds.length > 0 ? { relatedExerciseIds } : {}),
  };
}
