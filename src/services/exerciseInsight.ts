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
import { calculateE1RM, getBodyweightLoadRatio, isTimedExercise } from '../engine/e1rm';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { BiometricLog, ExerciseSession, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';
import { localDateString } from '../utils/date';

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
const durationOf = (ex: ExerciseSession, s: WorkoutSet) => {
  if (s.actualDurationSeconds && s.actualDurationSeconds > 0) return s.actualDurationSeconds;
  if (s.targetDurationSeconds && s.targetDurationSeconds > 0) return s.targetDurationSeconds;
  if ((s.actualReps ?? 0) > 5 && ex.repTargetType === 'duration') return s.actualReps as number;
  return ex.durationSeconds ?? 0;
};
const done = (s: WorkoutSet) => s.completed && isWorking(s) && (s.actualReps ?? 0) > 0;
const doneForExercise = (ex: ExerciseSession, s: WorkoutSet) =>
  done(s) || (s.completed && isWorking(s) && isTimedExercise(ex) && durationOf(ex, s) > 0);
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
    .map((w) => ({ w, ex: w.exercises.find((e) => e.exerciseId === exercise.exerciseId && e.sets.some((s) => doneForExercise(e, s))) }))
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

  // Timed holds and intervals are measured in hold seconds (or duration), not reps or E1RM.
  if (isTimedExercise(exercise)) {
    const history = past
      .map(({ w, ex }) => {
        const bestSec = ex.sets
          .filter((s) => s.completed && isWorking(s))
          .reduce((m, s) => Math.max(m, durationOf(ex, s)), 0);
        return { at: getWorkoutCompletedAt(w), e1rmKg: bestSec, value: bestSec };
      })
      .filter((h) => h.value > 0);

    const line1 =
      history.length === 0
        ? `First time on ${exercise.name}—sets your starting point.`
        : history.length === 1
        ? `Baseline hold: ${history[0].value}s from session 1.`
        : `Top hold across ${history.length} sessions: ${history[history.length - 1].value}s.`;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Low recovery today—holding steady protects stability.'
        : exercise.durationSeconds || isTimedExercise(exercise)
        ? 'Today targets isometric stability and muscular endurance.'
        : 'Today builds aerobic conditioning and work capacity.';
    return { metric: 'time', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  const bwRatio = isCalisthenic ? getBodyweightLoadRatio(exercise.exerciseId, exercise.pillar) : 0;
  const hasRealPastBw = past.length > 0 && past.every(({ w }) => bwForDate(w.date) > 0);
  const currentSessionBw = bwForDate(localDateString());
  const canCountBodyweight =
    isCalisthenic && bwRatio > 0 && (past.length > 0 ? hasRealPastBw : currentSessionBw > 0);

  // Unloaded bodyweight exercises (or bands/zero-BW moves) track best set reps ONLY when bodyweight is not logged or ratio is 0.
  if (isCalisthenic && !hasAddedLoad && !canCountBodyweight) {
    const history = past
      .map(({ w, ex }) => {
        const bestReps = ex.sets.filter(done).reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
        return { at: getWorkoutCompletedAt(w), e1rmKg: bestReps, value: bestReps };
      })
      .filter((h) => h.value > 0);

    if (past.length === 0 || history.length === 0) {
      const line1 = `First time on ${exercise.name}—sets your starting point.`;
      const line2 =
        readinessState === 'Amber Shield'
          ? 'Low recovery today—holding steady builds your groove cleanly.'
          : 'Today sets your hypertrophy baseline with clean mechanical tension.';
      return { metric: 'reps', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
    }

    let line1: string;
    if (history.length === 1) {
      line1 = `Baseline best set: ${history[0].value} per set from session 1.`;
    } else {
      const first = history[0].value;
      const last = history[history.length - 1].value;
      const delta = last - first;
      const n = history.length;
      if (delta > 0) {
        line1 = `Best set: ${last} (+${delta} over ${n} sessions).`;
      } else if (delta < 0) {
        line1 = `Best set: ${last} (-${Math.abs(delta)} over ${n} sessions).`;
      } else {
        line1 = `Best set steady at ${last} per set across ${n} sessions.`;
      }
    }

    const lastEx = past[past.length - 1].ex;
    const prevReps = lastEx.sets.filter(done).reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    const plannedReps = plannedSet?.targetReps ?? 0;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Low recovery today—holding target steady protects muscle.'
        : plannedReps > prevReps
        ? 'Expanding bodyweight output today drives hypertrophy.'
        : 'Matching bodyweight output deepens hypertrophy volume.';
    return { metric: 'reps', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  // Calisthenic exercise with added external weight, when any past session lacks a real bodyweight: track added load instead of guessing 80 kg or showing an artificial +80 kg jump.
  const hasRealBw = canCountBodyweight;
  if (isCalisthenic && !hasRealBw) {
    const history = past
      .map(({ w, ex }) => {
        const bestAdded = ex.sets.filter(done).reduce((m, s) => Math.max(m, weightOf(s)), 0);
        return { at: getWorkoutCompletedAt(w), e1rmKg: round1(bestAdded), value: round1(bestAdded) };
      })
      .filter((h) => h.value > 0);
    if (past.length === 0 || history.length === 0) {
      const line1 = `First time on ${exercise.name}—sets your starting point.`;
      const line2 =
        readinessState === 'Amber Shield'
          ? 'Low recovery today—holding steady builds your groove cleanly.'
          : 'Today sets your hypertrophy baseline with clean mechanical tension.';
      return { metric: 'added_kg', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
    }
    const first = history[0].value;
    const last = history[history.length - 1].value;
    const delta = round1(last - first);
    const n = history.length;
    const line1 =
      n === 1
        ? `Baseline added load: ${load(first)} from session 1.`
        : delta > 0
        ? `Added weight: ${load(last)} (+${load(delta)} over ${n} sessions).`
        : delta < 0
        ? `Added weight: ${load(last)} (-${load(Math.abs(delta))} over ${n} sessions).`
        : `Added weight steady at ${load(last)} across ${n} sessions.`;
    const lastEx = past[past.length - 1].ex;
    const lastSets = lastEx.sets.filter(done);
    const prevTop = lastSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
    const prevReps = lastSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    const plannedTop = plannedSet?.targetWeightKg ?? 0;
    const plannedReps = plannedSet?.targetReps ?? 0;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Low recovery today—holding weight preserves muscle.'
        : plannedTop > prevTop + 0.01
        ? 'Heavier load today drives progressive mechanical tension.'
        : plannedTop < prevTop - 0.01
        ? 'Lighter weight today keeps volume crisp and recoverable.'
        : plannedReps > prevReps
        ? 'Pushing volume at this load expands hypertrophy.'
        : 'Matching this load deepens hypertrophy volume.';
    return { metric: 'added_kg', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  const history = past
    .map(({ w, ex }) => {
      const e1rm = round1(bestE1rm(ex, bwForDate(w.date)));
      return { at: getWorkoutCompletedAt(w), e1rmKg: e1rm, value: e1rm };
    })
    .filter((h) => h.e1rmKg > 0);

  if (past.length === 0 || history.length === 0) {
    const line1 = `First time on ${exercise.name}—sets your starting point.`;
    const line2 =
      readinessState === 'Amber Shield'
        ? 'Low recovery today—holding steady builds your groove cleanly.'
        : 'Today sets your hypertrophy baseline with clean mechanical tension.';
    return { metric: 'e1rm', includesBodyweight: isCalisthenic, history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  const bwQualifier = isCalisthenic ? ' (bodyweight + added weight)' : '';
  let line1: string;
  if (history.length === 1) {
    line1 = `Baseline estimated max${bwQualifier}: ${load(history[0].e1rmKg)} from session 1.`;
  } else {
    const first = round1(history[0].e1rmKg);
    const last = round1(history[history.length - 1].e1rmKg);
    const delta = round1(last - first);
    const n = history.length;
    if (delta > 0) {
      line1 = `Estimated max${bwQualifier}: ${load(last)} (+${load(delta)} over ${n} sessions).`;
    } else if (delta < 0) {
      line1 = `Estimated max${bwQualifier}: ${load(last)} (-${load(Math.abs(delta))} over ${n} sessions).`;
    } else {
      line1 = `Estimated max${bwQualifier} steady at ${load(last)} across ${n} sessions.`;
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
    line2 = 'Low recovery today—holding weight preserves muscle.';
  } else if (plannedTop > prevTop + 0.01) {
    line2 = 'Heavier load today drives progressive mechanical tension.';
  } else if (plannedTop < prevTop - 0.01) {
    line2 = 'Lighter weight today keeps volume crisp and recoverable.';
  } else if (plannedReps > prevReps) {
    line2 = 'Pushing volume at this load expands hypertrophy.';
  } else {
    line2 = 'Matching this load deepens hypertrophy volume.';
  }

  return { metric: 'e1rm', includesBodyweight: isCalisthenic, history, lines: [line1, line2], summary: `${line1}\n${line2}` };
}

/** One set from last time, shown in the PREV column. */
export interface PreviousSet {
  weightKg: number;
  reps: number;
  durationSeconds?: number;
}

/** Working sets from the last completed session of this exact exercise (newest first by finish time). */
export function getPreviousWorkingSets(exerciseId: string, workouts: WorkoutSession[]): PreviousSet[] {
  const ordered = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
  for (const w of ordered) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    const doneSets = ex?.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup') || [];
    if (doneSets.length > 0 && ex) {
      const timed = isTimedExercise(ex);
      return doneSets.map((st) => ({
        weightKg: st.actualWeightKg ?? st.targetWeightKg,
        reps: st.actualReps ?? st.targetReps,
        ...(timed
          ? {
              durationSeconds:
                st.actualDurationSeconds ??
                st.targetDurationSeconds ??
                ((st.actualReps ?? 0) > 5 && ex.repTargetType === 'duration' ? st.actualReps : ex.durationSeconds),
            }
          : {}),
      }));
    }
  }
  return [];
}
