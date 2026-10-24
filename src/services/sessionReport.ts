/**
 * Post-session progress report for the Workout tab: what the athlete just achieved, in the context
 * of their program, strength and muscle growth over time. Built only from logged sets and the
 * athlete's knowledge graph; anything not measured is left out rather than estimated.
 */
import { calculateE1RM } from '../engine/e1rm';
import { AthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { getProgramWorkoutNumber, WORKOUT_TEMPLATES_24 } from '../engine/muscleBuildingProgram';
import { getDaysUntilReady, getWorkoutCompletedAt } from '../engine/recovery';
import { evaluateStrengthStandard, isPillarBenchmarkExercise } from '../engine/strengthStandards';
import {
  ExerciseDefinition,
  ExerciseSession,
  Gender,
  StrengthPillar,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { calculateBestPillarE1rms } from './storage';

export interface SessionRecord {
  exerciseName: string;
  /**
   * 'heavier' = heaviest working set so far (added load for bodyweight moves);
   * 'stronger' = higher estimated max (loaded exercises); 'reps' = most reps in a set (bodyweight moves).
   */
  kind: 'stronger' | 'heavier' | 'reps';
  isBodyweight: boolean;
  newKg: number;
  previousKg: number;
}

export interface StrengthLevelChange {
  pillar: StrengthPillar;
  tier: string;
  subDivision: string;
  previousTier?: string;
  previousSubDivision?: string;
  rankedUp: boolean;
  /** 0-100 progress towards the next level. */
  progressPct: number;
}

export interface MuscleWeekProgress {
  muscleKey: string;
  name: string;
  setsThisSession: number;
  weeklySets: number;
  targetMin: number;
  targetMax: number;
  status: 'below' | 'on-track' | 'above';
}

export interface LiftTrend {
  exerciseName: string;
  sessions: number;
  firstE1rmKg: number;
  latestE1rmKg: number;
  changePct: number;
}

export interface SessionProgressReport {
  session: {
    name: string;
    completedAt: number;
    workingSets: number;
    exerciseCount: number;
    volumeKg: number;
    /** Change in total lifted weight vs the previous time this same session was done. */
    volumeChangePct?: number;
    durationMin?: number;
    whoopStrain?: number;
    avgHeartRate?: number;
  };
  next: { name: string; readyAt: number; daysUntil: number } | null;
  program:
    | { kind: 'plan'; workoutNumber: number; totalWorkouts: number; week: number; totalWeeks: number }
    | { kind: 'split'; sessionsLast7Days: number; totalSessions: number };
  records: SessionRecord[];
  firstTimeExercises: string[];
  strengthLevels: StrengthLevelChange[];
  muscles: MuscleWeekProgress[];
  trends: LiftTrend[];
}

const isWorkingSet = (s: WorkoutSet) => s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0;
const setWeight = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;

function bestE1rm(ex: ExerciseSession, bodyweightKg: number): number {
  let best = 0;
  for (const s of ex.sets) {
    if (!isWorkingSet(s)) continue;
    const e = calculateE1RM(
      setWeight(s),
      s.actualReps ?? 0,
      s.actualRir ?? s.targetRir ?? 2,
      ex.equipment,
      ex.isRdl,
      ex.isWeightedCalisthenic,
      bodyweightKg,
      ex.exerciseId,
      ex.pillar
    );
    if (e > best) best = e;
  }
  return best;
}

function heaviestSet(ex: ExerciseSession): number {
  return ex.sets.filter(isWorkingSet).reduce((max, s) => Math.max(max, setWeight(s)), 0);
}

function mostReps(ex: ExerciseSession): number {
  return ex.sets.filter(isWorkingSet).reduce((max, s) => Math.max(max, s.actualReps ?? 0), 0);
}

function sessionVolume(w: WorkoutSession): number {
  return w.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter(isWorkingSet).reduce((t, s) => t + setWeight(s) * (s.actualReps ?? 0), 0),
    0
  );
}

/** Catalog muscle names to the knowledge graph's muscle keys. */
export const MUSCLE_TO_GRAPH_KEY: Record<string, string> = {
  'Side Delts': 'SideDelts',
  'Rear Delts': 'RearDelts',
  Back: 'Back',
  Chest: 'Chest',
  Quads: 'Quads',
  Hamstrings: 'Hamstrings',
  Triceps: 'Triceps',
  Biceps: 'Biceps',
  Calves: 'Calves',
};

export function buildSessionProgressReport(input: {
  /** All workouts, including the one just finished. */
  workouts: WorkoutSession[];
  /** The next queued session and when its muscles are ready (from the recovery gate). */
  nextSession?: WorkoutSession;
  nextReadyAt?: number | null;
  exerciseCatalog: ExerciseDefinition[];
  knowledgeGraph: AthleteKnowledgeGraph;
  /** Smoothed bodyweight; omit when the athlete has never logged a weight. */
  bodyweightKg?: number;
  gender?: Gender;
  now?: number;
}): SessionProgressReport | null {
  const now = input.now ?? Date.now();
  const completed = input.workouts
    .filter((w) => w.completed)
    .sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  const session = completed[completed.length - 1];
  if (!session) return null;
  const earlier = completed.slice(0, -1);
  const bw = input.bodyweightKg && input.bodyweightKg > 0 ? input.bodyweightKg : 80;
  const catalog = new Map(input.exerciseCatalog.map((e) => [e.id, e]));
  const trained = session.exercises.filter((ex) => ex.sets.some(isWorkingSet));

  // Records against every earlier session of the same exercise.
  const records: SessionRecord[] = [];
  const firstTimeExercises: string[] = [];
  const trends: LiftTrend[] = [];
  for (const ex of trained) {
    const history = earlier
      .map((w) => w.exercises.find((e) => e.exerciseId === ex.exerciseId && e.sets.some(isWorkingSet)))
      .filter((e): e is ExerciseSession => Boolean(e));
    const nowE1rm = bestE1rm(ex, bw);
    if (history.length === 0) {
      firstTimeExercises.push(ex.name);
      continue;
    }
    // Bodyweight moves can't be compared as weights without a logged bodyweight.
    const canEstimate = ex.equipment !== 'bodyweight' || Boolean(input.bodyweightKg && input.bodyweightKg > 0);
    if (!canEstimate) continue;
    const isBodyweight = ex.equipment === 'bodyweight';
    const prevE1rm = Math.max(...history.map((e) => bestE1rm(e, bw)));
    const prevHeaviest = Math.max(...history.map(heaviestSet));
    const nowHeaviest = heaviestSet(ex);
    const prevReps = Math.max(...history.map(mostReps));
    const nowReps = mostReps(ex);
    if (nowHeaviest > prevHeaviest + 0.01 && nowHeaviest > 0) {
      records.push({ exerciseName: ex.name, kind: 'heavier', isBodyweight, newKg: nowHeaviest, previousKg: prevHeaviest });
    } else if (isBodyweight && nowHeaviest === prevHeaviest && nowReps > prevReps) {
      records.push({ exerciseName: ex.name, kind: 'reps', isBodyweight, newKg: nowReps, previousKg: prevReps });
    } else if (!isBodyweight && nowE1rm > prevE1rm + 0.25) {
      records.push({ exerciseName: ex.name, kind: 'stronger', isBodyweight, newKg: nowE1rm, previousKg: prevE1rm });
    }
    const firstE1rm = bestE1rm(history[0], bw);
    // Only lifts that actually changed; "0% stronger" is noise.
    if (firstE1rm > 0 && nowE1rm > 0 && Math.abs(nowE1rm - firstE1rm) / firstE1rm >= 0.005) {
      trends.push({
        exerciseName: ex.name,
        sessions: history.length + 1,
        firstE1rmKg: firstE1rm,
        latestE1rmKg: nowE1rm,
        changePct: Math.round(((nowE1rm - firstE1rm) / firstE1rm) * 1000) / 10,
      });
    }
  }

  // Strength levels for the movement patterns this session tested (needs a real bodyweight).
  const strengthLevels: StrengthLevelChange[] = [];
  if (input.bodyweightKg && input.bodyweightKg > 0) {
    const pillars = Array.from(
      new Set(trained.filter((ex) => isPillarBenchmarkExercise(ex) && ex.equipment !== 'bodyweight').map((ex) => ex.pillar))
    );
    const before = calculateBestPillarE1rms(earlier, input.bodyweightKg, { loadedLiftsOnly: true });
    const after = calculateBestPillarE1rms(completed, input.bodyweightKg, { loadedLiftsOnly: true });
    for (const pillar of pillars) {
      if (after[pillar] <= 0) continue;
      const nowLevel = evaluateStrengthStandard(pillar, after[pillar], input.bodyweightKg, input.gender);
      const prevLevel =
        before[pillar] > 0 ? evaluateStrengthStandard(pillar, before[pillar], input.bodyweightKg, input.gender) : undefined;
      strengthLevels.push({
        pillar,
        tier: nowLevel.tier,
        subDivision: nowLevel.subDivision,
        previousTier: prevLevel?.tier,
        previousSubDivision: prevLevel?.subDivision,
        rankedUp: Boolean(prevLevel) && (prevLevel!.tier !== nowLevel.tier || prevLevel!.subDivision !== nowLevel.subDivision),
        progressPct: Math.round(Math.max(0, Math.min(100, nowLevel.percentageProgress))),
      });
    }
  }

  // Muscle growth: this week's sets against the athlete's personal target range (knowledge graph).
  const setsByGraphKey = new Map<string, number>();
  for (const ex of trained) {
    const muscle = catalog.get(ex.exerciseId)?.primaryMuscle ?? (ex as { primaryMuscle?: string }).primaryMuscle;
    const key = muscle ? MUSCLE_TO_GRAPH_KEY[muscle] : undefined;
    if (!key) continue;
    setsByGraphKey.set(key, (setsByGraphKey.get(key) || 0) + ex.sets.filter(isWorkingSet).length);
  }
  const muscles: MuscleWeekProgress[] = input.knowledgeGraph.muscleProfiles
    .filter((m) => setsByGraphKey.has(m.muscleKey))
    .map((m) => {
      const [targetMin, targetMax] = m.personalizedMav;
      return {
        muscleKey: m.muscleKey,
        name: m.displayName,
        setsThisSession: setsByGraphKey.get(m.muscleKey) || 0,
        weeklySets: m.weeklySets,
        targetMin,
        targetMax,
        status: m.weeklySets < targetMin ? 'below' : m.weeklySets > targetMax ? 'above' : 'on-track',
      } as MuscleWeekProgress;
    });

  // Volume vs the previous time this same session (by name) was done.
  const volumeKg = Math.round(sessionVolume(session));
  const previousSame = [...earlier].reverse().find((w) => w.name === session.name);
  const previousVolume = previousSame ? sessionVolume(previousSame) : 0;

  const workoutNumber = getProgramWorkoutNumber(session);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const program: SessionProgressReport['program'] = workoutNumber
    ? {
        kind: 'plan',
        workoutNumber,
        totalWorkouts: WORKOUT_TEMPLATES_24.length,
        week: Math.ceil(workoutNumber / 4),
        totalWeeks: Math.ceil(WORKOUT_TEMPLATES_24.length / 4),
      }
    : {
        kind: 'split',
        sessionsLast7Days: completed.filter((w) => getWorkoutCompletedAt(w) >= sevenDaysAgo).length,
        totalSessions: completed.length,
      };

  const durationMin =
    session.startedAt && session.completedAt
      ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
      : undefined;

  return {
    session: {
      name: session.name,
      completedAt: getWorkoutCompletedAt(session),
      workingSets: trained.reduce((n, ex) => n + ex.sets.filter(isWorkingSet).length, 0),
      exerciseCount: trained.length,
      volumeKg,
      volumeChangePct:
        previousVolume > 0 ? Math.round(((volumeKg - previousVolume) / previousVolume) * 1000) / 10 : undefined,
      durationMin: durationMin && durationMin > 0 && durationMin < 300 ? durationMin : undefined,
      whoopStrain: session.whoopStrain && session.whoopStrain > 0 ? session.whoopStrain : undefined,
      avgHeartRate: session.hasMeasuredHeartRate && session.avgHeartRate ? session.avgHeartRate : undefined,
    },
    next:
      input.nextSession && input.nextReadyAt
        ? { name: input.nextSession.name, readyAt: input.nextReadyAt, daysUntil: getDaysUntilReady(input.nextReadyAt, now) }
        : null,
    program,
    records,
    firstTimeExercises,
    strengthLevels,
    muscles,
    trends: trends.sort((a, b) => b.changePct - a.changePct),
  };
}
