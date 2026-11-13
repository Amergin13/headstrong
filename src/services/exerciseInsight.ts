/**
 * Per-exercise progress history and the strict 2-line dynamic summary shown on each exercise card.
 *
 * Line 1: Historical Trajectory Anchor (validates long-term capability and identity using concrete
 * absolute load metrics in kg/lb rounded to 0.1, never abstract percentages).
 * Line 2: Session Stimulus Directive (frames the acute training goal without duplicating set/rep/weight/RIR
 * table mechanics, movement execution cues like tempo/rest/RIR, or weekly muscle volume benchmarks).
 *
 * Progress is tracked as the best set's estimated one-rep max per session (RIR-adjusted Epley,
 * the app's E1RM formula). Built only from completed sets.
 */
import { calculateE1RM } from '../engine/e1rm';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { BiometricLog, ExerciseSession, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';

export interface ExerciseInsight {
  /** What the chart points and trajectory line track: estimated 1RM (kg), reps (unloaded bodyweight), added weight (kg), or time. */
  metric: 'e1rm' | 'reps' | 'added_kg' | 'time';
  /** True when `e1rm` includes bodyweight (weighted calisthenics). */
  includesBodyweight?: boolean;
  /** Best set per past session, oldest first (`value` is kg for load metrics or reps for `reps`). */
  history: { at: number; e1rmKg: number; value?: number }[];
  /** Strict 2-line summary (Line 1 + '\n' + Line 2) with zero section headers. */
  summary: string;
  /** [Line 1: Historical Trajectory Anchor, Line 2: Session Stimulus Directive]. */
  lines: [string, string];
}

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const done = (s: WorkoutSet) => s.completed && isWorking(s) && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

function bestE1rm(ex: ExerciseSession, bodyweightKg: number): number {
  return ex.sets.filter(done).reduce((best, s) => {
    const e = calculateE1RM(
      weightOf(s),
      s.actualReps ?? 0,
      s.actualRir ?? s.targetRir ?? 2,
      ex.equipment,
      ex.isRdl,
      ex.isWeightedCalisthenic,
      bodyweightKg,
      ex.exerciseId,
      ex.pillar
    );
    return Math.max(best, e);
  }, 0);
}

export function buildExerciseInsight(
  exercise: ExerciseSession,
  workouts: WorkoutSession[],
  readinessState: ReadinessState,
  bodyweightKg = 80,
  maxSessions = 12,
  formatLoad: (kg: number) => string = (kg) => `${round1(kg)} kg`,
  biometrics?: BiometricLog[]
): ExerciseInsight {
  const past = workouts
    .filter((w) => w.completed)
    .map((w) => ({ w, ex: w.exercises.find((e) => e.exerciseId === exercise.exerciseId && e.sets.some(done)) }))
    .filter((x): x is { w: WorkoutSession; ex: ExerciseSession } => Boolean(x.ex))
    .sort((a, b) => getWorkoutCompletedAt(a.w) - getWorkoutCompletedAt(b.w))
    .slice(-maxSessions);
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  const bwForDate = (date: string) => (emaLookup ? emaLookup(date, 0) : bodyweightKg);
  const isCalisthenic =
    exercise.equipment === 'bodyweight' ||
    exercise.equipment === 'weighted_bodyweight' ||
    Boolean(exercise.isWeightedCalisthenic);
  const hasAddedLoad =
    past.some(({ ex }) => ex.sets.filter(done).some((s) => weightOf(s) > 0)) ||
    exercise.sets.filter(isWorking).some((s) => (s.targetWeightKg ?? 0) > 0);

  const load = (kg: number) => formatLoad(round1(kg));
  const plannedSet = exercise.sets.find(isWorking);

  // Timed holds and intervals are measured in time, not load.
  if (exercise.durationSeconds || exercise.durationMinutesRange) {
    const line1 =
      past.length === 0
        ? `First time on ${exercise.name}—today sets your starting point.`
        : past.length === 1
        ? `Baseline endurance established from your first session on ${exercise.name}.`
        : `Endurance capacity is rising across ${past.length} logged sessions on ${exercise.name}.`;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Recovery is low, so today holds the weight steady to maintain stability without excess fatigue.'
        : exercise.durationSeconds
        ? 'Today targets sustained isometric trunk stability and muscular endurance.'
        : 'Today builds aerobic conditioning and sustained work capacity.';
    return { metric: 'time', history: [], lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  // Unloaded bodyweight exercises (0 added weight) are measured in best set reps, never phantom 100+ kg E1RM.
  if (isCalisthenic && !hasAddedLoad) {
    const history = past
      .map(({ w, ex }) => {
        const bestReps = ex.sets.filter(done).reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
        return { at: getWorkoutCompletedAt(w), e1rmKg: bestReps, value: bestReps };
      })
      .filter((h) => h.value > 0);

    if (past.length === 0 || history.length === 0) {
      const line1 = `First time on ${exercise.name}—today sets your starting point.`;
      const line2 =
        readinessState === 'Amber Shield'
          ? 'Recovery is low, so today holds steady while establishing your baseline groove.'
          : 'Today focuses on clean mechanical tension to establish your baseline hypertrophy stimulus.';
      return { metric: 'reps', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
    }

    let line1: string;
    if (history.length === 1) {
      line1 = `Baseline bodyweight strength established at ${history[0].value} per set from your first session.`;
    } else {
      const first = history[0].value;
      const last = history[history.length - 1].value;
      const delta = last - first;
      const n = history.length;
      if (delta > 0) {
        line1 = `Bodyweight strength on this lift is rising, up +${delta} per set across ${n} sessions to a best of ${last}.`;
      } else if (delta < 0) {
        line1 = `Best set on this bodyweight lift shifted -${Math.abs(delta)} across ${n} sessions and currently stands at ${last}.`;
      } else {
        line1 = `Bodyweight strength on this lift has held steady at ${last} per set across ${n} sessions.`;
      }
    }

    const lastEx = past[past.length - 1].ex;
    const prevReps = lastEx.sets.filter(done).reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    const plannedReps = plannedSet?.targetReps ?? 0;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Recovery is low, so today holds the target steady to preserve muscle while managing fatigue.'
        : plannedReps > prevReps
        ? 'Today expands volume accumulation with additional bodyweight output for hypertrophy.'
        : 'Today consolidates volume accumulation at your bodyweight load to deepen hypertrophy.';
    return { metric: 'reps', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  // Calisthenic exercise with added external weight, when no bodyweight is logged yet: track added load instead of guessing 80 kg.
  const hasRealBw = past.some(({ w }) => bwForDate(w.date) > 0);
  if (isCalisthenic && !hasRealBw) {
    const history = past
      .map(({ w, ex }) => {
        const bestAdded = ex.sets.filter(done).reduce((m, s) => Math.max(m, weightOf(s)), 0);
        return { at: getWorkoutCompletedAt(w), e1rmKg: round1(bestAdded), value: round1(bestAdded) };
      })
      .filter((h) => h.value > 0);
    if (past.length === 0 || history.length === 0) {
      const line1 = `First time on ${exercise.name}—today sets your starting point.`;
      const line2 =
        readinessState === 'Amber Shield'
          ? 'Recovery is low, so today holds the weight steady while establishing your baseline groove.'
          : 'Today focuses on clean mechanical tension to establish your baseline hypertrophy stimulus.';
      return { metric: 'added_kg', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
    }
    const first = history[0].value;
    const last = history[history.length - 1].value;
    const delta = round1(last - first);
    const n = history.length;
    const line1 =
      n === 1
        ? `Baseline added weight established at ${load(first)} from your first session.`
        : delta > 0
        ? `Added weight on this lift is rising, up +${load(delta)} across ${n} sessions to ${load(last)}.`
        : delta < 0
        ? `Added weight on this lift shifted -${load(Math.abs(delta))} across ${n} sessions and sits at ${load(last)}.`
        : `Added weight on this lift has held steady at ${load(last)} across ${n} sessions.`;
    const lastEx = past[past.length - 1].ex;
    const lastSets = lastEx.sets.filter(done);
    const prevTop = lastSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
    const prevReps = lastSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    const plannedTop = plannedSet?.targetWeightKg ?? 0;
    const plannedReps = plannedSet?.targetReps ?? 0;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Recovery is low, so today holds the weight steady to preserve muscle while managing fatigue.'
        : plannedTop > prevTop + 0.01
        ? 'Today increases the weight to drive progressive mechanical tension for hypertrophy.'
        : plannedTop < prevTop - 0.01
        ? 'Today lightens the weight to prioritize clean volume accumulation for hypertrophy.'
        : plannedReps > prevReps
        ? 'Today builds volume accumulation at your current load to expand hypertrophy capacity.'
        : 'Today consolidates volume accumulation at your current load to deepen hypertrophy.';
    return { metric: 'added_kg', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  const history = past
    .map(({ w, ex }) => {
      const e1rm = round1(bestE1rm(ex, bwForDate(w.date)));
      return { at: getWorkoutCompletedAt(w), e1rmKg: e1rm, value: e1rm };
    })
    .filter((h) => h.e1rmKg > 0);

  if (past.length === 0 || history.length === 0) {
    const line1 = `First time on ${exercise.name}—today sets your starting point.`;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Recovery is low, so today holds the weight steady while establishing your baseline groove.'
        : 'Today focuses on clean mechanical tension to establish your baseline hypertrophy stimulus.';
    return { metric: 'e1rm', includesBodyweight: isCalisthenic, history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  const bwQualifier = isCalisthenic ? ' (bodyweight + added weight)' : '';
  let line1: string;
  if (history.length === 1) {
    line1 = `Baseline strength${bwQualifier} established at a ${load(history[0].e1rmKg)} estimated max from your first session.`;
  } else {
    const first = round1(history[0].e1rmKg);
    const last = round1(history[history.length - 1].e1rmKg);
    const delta = round1(last - first);
    const n = history.length;
    if (delta > 0) {
      line1 = `Strength on this lift${bwQualifier} is rising, up +${load(delta)} across ${n} sessions to a ${load(last)} estimated max.`;
    } else if (delta < 0) {
      line1 = `Estimated max${bwQualifier} on this lift shifted -${load(Math.abs(delta))} across ${n} sessions and currently stands at ${load(last)}.`;
    } else {
      line1 = `Strength on this lift${bwQualifier} has held steady at a ${load(last)} estimated max across ${n} sessions.`;
    }
  }

  const lastEx = past[past.length - 1].ex;
  const lastSets = lastEx.sets.filter(done);
  const prevTop = lastSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
  const prevReps = lastSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
  const plannedTop = plannedSet?.targetWeightKg ?? 0;
  const plannedReps = plannedSet?.targetReps ?? 0;

  let line2: string;
  if (readinessState === 'Amber Shield') {
    line2 = 'Recovery is low, so today holds the weight steady to preserve muscle while managing fatigue.';
  } else if (plannedTop > prevTop + 0.01) {
    line2 = "Today increases the weight to drive progressive mechanical tension for hypertrophy.";
  } else if (plannedTop < prevTop - 0.01) {
    line2 = "Today lightens the weight to prioritize clean volume accumulation for hypertrophy.";
  } else if (plannedReps > prevReps) {
    line2 = "Today builds volume accumulation at your current load to expand hypertrophy capacity.";
  } else {
    line2 = "Today consolidates volume accumulation at your current load to deepen hypertrophy.";
  }

  return { metric: 'e1rm', includesBodyweight: isCalisthenic, history, lines: [line1, line2], summary: `${line1}\n${line2}` };
}

/** One set from last time, shown in the PREV column. */
export interface PreviousSet {
  weightKg: number;
  reps: number;
}

/** Working sets from the last completed session of this exact exercise (newest first by finish time). */
export function getPreviousWorkingSets(exerciseId: string, workouts: WorkoutSession[]): PreviousSet[] {
  const ordered = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
  for (const w of ordered) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    const doneSets = ex?.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup') || [];
    if (doneSets.length > 0) {
      return doneSets.map((st) => ({
        weightKg: st.actualWeightKg ?? st.targetWeightKg,
        reps: st.actualReps ?? st.targetReps,
      }));
    }
  }
  return [];
}
