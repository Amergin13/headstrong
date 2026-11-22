/**
 * Per-exercise progress history and the strict 2-line dynamic summary shown on each exercise card.
 *
 * Follows `EXERCISE_BRIEF_BLUEPRINT` (`src/engine/contentStrategy.ts`):
 * - Line 1: Overall Progress Against Goals (plain trajectory verdict backed by concrete load/rep
 *   figures in kg/lb rounded to 0.1, or anchor-lift movement-pattern progression on a one-off swap;
 *   never bare KPI label dumps or percentages).
 * - Line 2: Today's Session Action -> Goal Outcome (what today's load, rep range, or swap is doing
 *   and how that reaches the athlete's goal, without duplicating set/rep/weight/RIR table cells,
 *   tempo/rest/RIR execution cues, or weekly muscle set benchmarks).
 *
 * Progress is tracked as the best set's estimated one-rep max per session (RIR-adjusted Epley,
 * the app's E1RM formula). Built only from completed sets.
 */
import { calculateE1RM, getBodyweightLoadRatio, isAssistedExercise, isTimedExercise, usesTwoDumbbells } from '../engine/e1rm';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { isPillarBenchmarkExercise } from '../engine/strengthStandards';
import {
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  ReadinessState,
  StrengthPillar,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { localDateString } from '../utils/date';

/**
 * Formats an exercise's prescribed rep range (e.g., "8–12 reps") when it spans a range.
 * Returns null for timed holds, form-failure sets, or fixed single-rep prescriptions.
 */
export function getExerciseRepRangeLabel(
  exercise: Pick<
    ExerciseSession,
    'minReps' | 'maxReps' | 'repTargetType' | 'durationSeconds' | 'durationMinutesRange' | 'exerciseId' | 'name'
  >
): string | null {
  if (isTimedExercise(exercise) || exercise.repTargetType === 'form_failure') return null;
  if (exercise.minReps > 0 && exercise.maxReps > 0 && exercise.minReps < exercise.maxReps) {
    return `${exercise.minReps}–${exercise.maxReps} reps`;
  }
  return null;
}

/** Strips percentage parentheticals (e.g. "Feet elevated (~70% BW)" -> "feet elevated") for clean 2-line briefs. */
export function cleanLeverageSetupCue(setupLabel?: string | null): string | undefined {
  if (!setupLabel) return undefined;
  const stripped = setupLabel
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*·.*$/g, '')
    .replace(/[.!?]/g, '')
    .trim()
    .toLowerCase();
  if (!stripped || stripped === 'standard') return undefined;
  return stripped;
}

/** Plain-English movement-pattern word used in goal/progression sentences (e.g. "push", "pull", "squat", "hinge"). */
export function patternLabelForPillar(pillar?: StrengthPillar): string {
  switch (pillar) {
    case 'Horizontal Push':
    case 'Vertical Push':
      return 'push';
    case 'Horizontal Pull':
    case 'Vertical Pull':
      return 'pull';
    case 'Squat':
      return 'squat';
    case 'Hinge':
      return 'hinge';
    default:
      return 'strength';
  }
}

export interface AnchorLiftProgress {
  anchorName: string;
  sessions: number;
  firstE1rmKg: number;
  latestE1rmKg: number;
  deltaKg: number;
}

/** Goal-aligned hypertrophy/retention verb phrase for Line 2 (e.g. "stimulates muscle growth in your chest"). */
export function goalHypertrophyOutcome(goalPhase: GoalPhase | undefined, muscle?: string): string {
  const inMuscle = muscle ? ` in your ${muscle}` : '';
  if (goalPhase === 'Cut / Recomp') return `preserves muscle${inMuscle}`;
  if (goalPhase === 'Maingain') return `builds lean muscle${inMuscle}`;
  return `stimulates muscle growth${inMuscle}`;
}

/** Short goal-aligned noun phrase for Line 2 (e.g. "muscle growth", "muscle retention", "lean muscle"). */
export function goalGrowthNoun(goalPhase: GoalPhase | undefined): string {
  if (goalPhase === 'Cut / Recomp') return 'muscle retention';
  if (goalPhase === 'Maingain') return 'lean muscle';
  return 'muscle growth';
}

/**
 * Single source of truth for swapped/replaced exercise 2-line briefs and AI note facts.
 * - Line 1 anchors to the replaced lift's empirical movement-pattern strength progress when logged,
 *   or states the swap baseline + opening-set calibration/setup context cleanly.
 * - Line 2 states what today's load & rep range do to advance the athlete's goal while protecting
 *   their saved progression — never vague idioms like "standing in for" or "covering".
 */
export function buildSwappedExerciseCopy(params: {
  anchorName: string;
  pillar?: StrengthPillar;
  muscleLabel?: string;
  repRange?: string | null;
  readinessState: ReadinessState;
  hasOwnHistory: boolean;
  isTimed?: boolean;
  calibrationMode?: 'ANCHOR_PRIOR' | 'EFFORT_ONLY' | 'BODYWEIGHT';
  setupLabel?: string | null;
  goalPhase?: GoalPhase;
  anchorProgress?: AnchorLiftProgress | null;
  formatLoad?: (kg: number) => string;
}): { firstSessionLine1: string; line2: string; factLine1: string; factLine2: string } {
  const {
    anchorName,
    pillar,
    muscleLabel,
    repRange,
    readinessState,
    hasOwnHistory,
    isTimed,
    calibrationMode,
    setupLabel,
    goalPhase,
    anchorProgress,
    formatLoad = (kg) => `${round1(kg)} kg`,
  } = params;
  const muscle = muscleLabel ? muscleLabel.toLowerCase() : undefined;
  const inMuscle = muscle ? ` in your ${muscle}` : '';
  const muscleTarget = muscle ? `your ${muscle}` : 'the same muscles';
  const forRange = repRange ? ` for ${repRange}` : '';
  const setupCue = cleanLeverageSetupCue(setupLabel);
  const pattern = patternLabelForPillar(pillar);
  const hypertrophyOutcome = goalHypertrophyOutcome(goalPhase, muscle);
  const growthNoun = goalGrowthNoun(goalPhase);

  let firstSessionLine1: string;
  let factLine1: string;
  if (!hasOwnHistory && !isTimed && anchorProgress && anchorProgress.sessions >= 2 && anchorProgress.deltaKg > 0) {
    const up = formatLoad(anchorProgress.deltaKg);
    const latest = formatLoad(anchorProgress.latestE1rmKg);
    firstSessionLine1 = `Your ${pattern} strength is rising—${anchorName} estimated max is up +${up} to ${latest}.`;
    factLine1 = `Anchor lift ${anchorName} estimated max has risen by +${up} to ${latest} across ${anchorProgress.sessions} sessions (${pattern} strength progression); today's lift replaces ${anchorName}${setupCue ? ` using ${setupCue}` : ''}.`;
  } else if (!hasOwnHistory && !isTimed && anchorProgress && anchorProgress.sessions >= 2 && anchorProgress.deltaKg === 0) {
    const latest = formatLoad(anchorProgress.latestE1rmKg);
    firstSessionLine1 = `Your ${pattern} strength is holding steady—${anchorName} estimated max sits at ${latest}.`;
    factLine1 = `Anchor lift ${anchorName} estimated max has held steady at ${latest} across ${anchorProgress.sessions} sessions (${pattern} strength progression); today's lift replaces ${anchorName}${setupCue ? ` using ${setupCue}` : ''}.`;
  } else if (!hasOwnHistory && !isTimed && anchorProgress && anchorProgress.sessions >= 2 && anchorProgress.deltaKg < 0) {
    const latest = formatLoad(anchorProgress.latestE1rmKg);
    firstSessionLine1 = `Replaces ${anchorName} (${latest} estimated max) to keep your ${pattern} strength moving.`;
    factLine1 = `Anchor lift ${anchorName} estimated max sits at ${latest}; today's lift replaces ${anchorName}${setupCue ? ` using ${setupCue}` : ''} to keep ${pattern} strength moving.`;
  } else if (!hasOwnHistory && !isTimed && anchorProgress && anchorProgress.sessions === 1) {
    const latest = formatLoad(anchorProgress.latestE1rmKg);
    firstSessionLine1 = `Your ${pattern} baseline on ${anchorName} sits at a ${latest} estimated max.`;
    factLine1 = `Anchor lift ${anchorName} baseline estimated max is ${latest}; today's lift replaces ${anchorName}${setupCue ? ` using ${setupCue}` : ''}.`;
  } else if (isTimed) {
    firstSessionLine1 = `Replaces ${anchorName} today and sets your starting hold baseline.`;
    factLine1 = `Replaces ${anchorName} today so stability work stays moving while your saved progression stays intact.`;
  } else if (calibrationMode === 'EFFORT_ONLY') {
    firstSessionLine1 = `Replaces ${anchorName} today—pick a moderate opening weight to dial in this machine.`;
    factLine1 = `Replaces ${anchorName} today on an uncalibrated machine—pick a moderate opening weight to dial in this machine while ${muscleTarget} keep growing and your saved ${anchorName} progression stays intact.`;
  } else if (setupCue) {
    firstSessionLine1 = `Replaces ${anchorName} today using ${setupCue} to set your starting baseline.`;
    factLine1 = `Replaces ${anchorName} today using ${setupCue} leverage so ${muscleTarget} keep growing while your saved ${anchorName} progression stays intact.`;
  } else if (calibrationMode === 'ANCHOR_PRIOR') {
    firstSessionLine1 = `Replaces ${anchorName} today—estimated starting weight dials in after your opening set.`;
    factLine1 = `Replaces ${anchorName} today with an estimated starting weight that dials in after your opening set so ${muscleTarget} keep growing while your saved ${anchorName} progression stays intact.`;
  } else {
    firstSessionLine1 = `Replaces ${anchorName} today and sets your starting strength baseline.`;
    factLine1 = `Replaces ${anchorName} today so ${muscleTarget} keep growing while your saved ${anchorName} progression stays intact.`;
  }

  let line2: string;
  let factLine2: string;
  if (readinessState === 'Amber Shield') {
    if (isTimed) {
      line2 = 'Low recovery today—steady holds preserve stability while your saved progression holds.';
      factLine2 = `Recovery today is low; replacing ${anchorName} with steady holds preserves stability without extra fatigue while your saved progression holds.`;
    } else if (!hasOwnHistory && !anchorProgress) {
      line2 = `Low recovery today—steady work${forRange} preserves muscle${inMuscle} without extra fatigue.`;
      factLine2 = `Recovery today is low; replacing ${anchorName}${forRange} at steady effort preserves muscle${inMuscle} without extra fatigue while your saved progression holds.`;
    } else {
      line2 = `Low recovery today—replacing ${anchorName}${setupCue ? ` using ${setupCue}` : ''}${forRange} at steady effort preserves muscle${inMuscle}.`;
      factLine2 = `Recovery today is low; replacing ${anchorName}${setupCue ? ` using ${setupCue}` : ''}${forRange} at steady effort preserves muscle${inMuscle} without extra fatigue while your saved progression holds.`;
    }
  } else if (isTimed) {
    line2 = hasOwnHistory
      ? `Replacing ${anchorName} today builds core stability and endurance while your saved progression holds.`
      : 'Holding steady today builds isometric stability and endurance while your saved progression stays intact.';
    factLine2 = `Today replaces ${anchorName} to build isometric stability and endurance while your saved ${anchorName} progression stays intact.`;
  } else if (!hasOwnHistory) {
    if (calibrationMode === 'EFFORT_ONLY') {
      line2 = `Picking a moderate opening weight${forRange} dials in this machine and ${hypertrophyOutcome}.`;
      factLine2 = `Today's session action: pick a moderate opening weight${forRange} to dial in this machine so it ${hypertrophyOutcome} while your ${pattern} progression stays intact.`;
    } else if (setupCue) {
      line2 = `Using ${setupCue}${forRange} ${hypertrophyOutcome} based on your ${pattern} progression.`;
      factLine2 = `Today's session action: use ${setupCue}${forRange} so it ${hypertrophyOutcome} based on your ${pattern} progression while your saved ${anchorName} progression stays intact.`;
    } else if (calibrationMode === 'ANCHOR_PRIOR' || anchorProgress) {
      line2 = `Today's estimated load${forRange} ${hypertrophyOutcome} based on your ${pattern} progression.`;
      factLine2 = `Today's session action: working at the estimated load${forRange} ${hypertrophyOutcome} based on your ${pattern} progression while your saved ${anchorName} progression stays intact.`;
    } else {
      line2 = `Today's load${forRange} ${hypertrophyOutcome} while your saved ${pattern} progression stays intact.`;
      factLine2 = `Today's session action: working${forRange} in place of ${anchorName} ${hypertrophyOutcome} while your saved ${pattern} progression stays intact.`;
    }
  } else {
    line2 = `Replacing ${anchorName}${setupCue ? ` using ${setupCue}` : ''}${forRange} keeps ${growthNoun}${inMuscle} moving while your ${pattern} progression holds.`;
    factLine2 = `Today replaces ${anchorName}${setupCue ? ` using ${setupCue}` : ''}${forRange} to keep ${growthNoun}${inMuscle} moving while your ${pattern} progression holds.`;
  }

  return { firstSessionLine1, line2, factLine1, factLine2 };
}

/**
 * Single source of truth for non-swapped Line 2 (Today's Session Action -> Goal Outcome),
 * shared identically by `buildExerciseInsight` and `buildExerciseNoteFacts`.
 */
export function buildGoalDrivenLine2(params: {
  readinessState: ReadinessState;
  isTimed: boolean;
  isIsometricTimed?: boolean;
  hasOwnHistory: boolean;
  isReentry: boolean;
  metric: 'e1rm' | 'reps' | 'added_kg' | 'time';
  isAssisted: boolean;
  repRange: string | null;
  muscleLabel?: string;
  goalPhase?: GoalPhase;
  plannedTop: number;
  prevTop: number;
  plannedReps: number;
  prevReps: number;
  maxReps: number;
  lastMaxReps?: number;
}): { line2: string; factLine2: string } {
  const {
    readinessState,
    isTimed,
    isIsometricTimed,
    hasOwnHistory,
    isReentry,
    metric,
    isAssisted,
    repRange,
    muscleLabel,
    goalPhase,
    plannedTop,
    prevTop,
    plannedReps,
    prevReps,
    maxReps,
    lastMaxReps = 0,
  } = params;
  const muscle = muscleLabel ? muscleLabel.toLowerCase() : undefined;
  const inMuscle = muscle ? ` in your ${muscle}` : '';
  const forMuscle = muscle ? ` for your ${muscle}` : '';
  const forRange = repRange ? ` for ${repRange}` : '';
  const hypertrophyOutcome = goalHypertrophyOutcome(goalPhase, muscle);

  if (readinessState === 'Amber Shield') {
    if (isTimed) {
      return {
        line2: 'Low recovery today—holding steady preserves stability without extra fatigue.',
        factLine2: 'Recovery today is low, so holding steady preserves stability without extra fatigue.',
      };
    }
    if (isReentry) {
      return {
        line2: `Low recovery back at the gym—holding your last gym load${forRange} preserves muscle${inMuscle}.`,
        factLine2: `Recovery today is low back at the gym, so holding your last gym load${forRange} preserves muscle${inMuscle} without extra fatigue.`,
      };
    }
    return {
      line2: `Low recovery today—keeping the same weight${forRange} preserves muscle${inMuscle} without extra fatigue.`,
      factLine2: `Recovery today is low, so keeping the same weight${forRange} preserves muscle${inMuscle} without extra fatigue.`,
    };
  }

  if (isTimed) {
    if (isIsometricTimed) {
      return {
        line2: 'Holding steady today builds isometric trunk stability and muscular endurance.',
        factLine2: 'Today builds isometric trunk stability and muscular endurance.',
      };
    }
    return {
      line2: 'Steady work today builds aerobic conditioning and sustained work capacity.',
      factLine2: 'Today builds aerobic conditioning and sustained work capacity.',
    };
  }

  if (!hasOwnHistory) {
    return {
      line2: `Working${forRange || ' steadily today'} ${hypertrophyOutcome} and calibrates your next targets.`,
      factLine2: `Today's session action: working${forRange || ' steadily'} ${hypertrophyOutcome} and calibrates your next targets.`,
    };
  }

  if (isReentry) {
    return {
      line2: `Back at the gym—matching your last gym load${forRange} confirms readiness before adding weight.`,
      factLine2: `Back at the gym: matching your last gym load${forRange} confirms readiness before adding weight${forMuscle}.`,
    };
  }

  if (metric === 'reps') {
    if (plannedReps > prevReps) {
      return {
        line2: `Adding bodyweight reps${forRange} ${hypertrophyOutcome}.`,
        factLine2: `Today's session action: adding bodyweight reps${forRange} ${hypertrophyOutcome}.`,
      };
    }
    return {
      line2: `Keeping steady bodyweight reps${forRange} ${hypertrophyOutcome}.`,
      factLine2: `Today's session action: keeping steady bodyweight reps${forRange} ${hypertrophyOutcome}.`,
    };
  }

  if (isAssisted && plannedTop < prevTop - 0.01) {
    return {
      line2: `Using less assistance${forRange} builds pulling strength${inMuscle}.`,
      factLine2: `Today's session action: using less counterweight assistance${forRange} builds pulling strength${inMuscle}.`,
    };
  }

  if (plannedTop > prevTop + 0.01) {
    const fewerReps = plannedReps > 0 && prevReps > 0 && plannedReps < prevReps;
    const strengthShift = (maxReps > 0 && maxReps <= 6) || (lastMaxReps > 0 && maxReps > 0 && maxReps < lastMaxReps);
    if (fewerReps && strengthShift) {
      return {
        line2: `Increasing the weight with fewer reps${forRange} builds overall strength${forMuscle}.`,
        factLine2: `Today's session action: increasing the weight with fewer reps${forRange} builds overall strength${forMuscle}.`,
      };
    }
    if (fewerReps) {
      return {
        line2: `Increasing the weight with fewer reps${forRange} builds overall strength and muscle${inMuscle}.`,
        factLine2: `Today's session action: increasing the weight with fewer reps${forRange} builds overall strength and muscle${inMuscle}.`,
      };
    }
    return {
      line2: `Increasing the weight${forRange} builds progressive strength and muscle${inMuscle}.`,
      factLine2: `Today's session action: increasing the weight${forRange} builds progressive strength and muscle${inMuscle}.`,
    };
  }

  if (plannedTop < prevTop - 0.01) {
    if (plannedReps > prevReps) {
      return {
        line2: `Using lighter weight with higher reps${forRange} ${hypertrophyOutcome} with less joint fatigue.`,
        factLine2: `Today's session action: using lighter weight with higher reps${forRange} ${hypertrophyOutcome} with less joint fatigue.`,
      };
    }
    return {
      line2: `Lowering the weight${forRange} keeps form sharp and ${hypertrophyOutcome}.`,
      factLine2: `Today's session action: lowering the weight${forRange} keeps form sharp and ${hypertrophyOutcome}.`,
    };
  }

  if (plannedReps > prevReps) {
    return {
      line2: `Keeping the same weight and adding reps${forRange} ${hypertrophyOutcome}.`,
      factLine2: `Today's session action: keeping the same weight and adding reps${forRange} ${hypertrophyOutcome}.`,
    };
  }

  return {
    line2: `Keeping the same weight${forRange} ${hypertrophyOutcome} before the next jump.`,
    factLine2: `Today's session action: keeping the same weight${forRange} ${hypertrophyOutcome} before the next jump.`,
  };
}

/** Resolves any active first-session calibration mode for a substituted lift. */
export function resolveSwapCalibrationMode(
  exercise: Pick<ExerciseSession, 'continuityRationaleKind' | 'sets' | 'setupLabel'>
): 'ANCHOR_PRIOR' | 'EFFORT_ONLY' | 'BODYWEIGHT' | undefined {
  const working = exercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  if (
    exercise.continuityRationaleKind === 'EFFORT_ONLY' ||
    working.some((s) => s.calibrationSource === 'EFFORT_ONLY')
  ) {
    return 'EFFORT_ONLY';
  }
  if (exercise.continuityRationaleKind === 'BODYWEIGHT' || Boolean(exercise.setupLabel)) {
    return 'BODYWEIGHT';
  }
  if (
    exercise.continuityRationaleKind === 'ANCHOR_PRIOR' ||
    working.some((s) => s.calibrationSource === 'ANCHOR_PRIOR' || s.isWeightEstimated)
  ) {
    return 'ANCHOR_PRIOR';
  }
  return undefined;
}

/**
 * True for isolation and small-muscle exercises (lateral raises, tricep pushdowns, curls, calves,
 * leg curls/extensions, crunches, face pulls, etc.) where a Best Set / reps-at-weight progression
 * view is more meaningful than an estimated 1RM sparkline.
 */
export function isIsolationOrSmallExercise(
  ex: {
    id?: string;
    exerciseId?: string;
    name?: string;
    isIsolation?: boolean;
    durationSeconds?: number;
    durationMinutesRange?: [number, number];
    repTargetType?: string;
  },
  exerciseDef?: Pick<ExerciseDefinition, 'isIsolation'>
): boolean {
  if (isTimedExercise(ex)) return false;
  if (ex.isIsolation || exerciseDef?.isIsolation) return true;
  const exerciseId = ex.exerciseId || ex.id || '';
  return !isPillarBenchmarkExercise({
    exerciseId,
    isIsolation: ex.isIsolation,
    durationSeconds: ex.durationSeconds,
    durationMinutesRange: ex.durationMinutesRange,
    repTargetType: ex.repTargetType,
  });
}

export interface BestSetSessionPoint {
  at: number;
  date: string;
  weightKg: number;
  reps: number;
  rir?: number;
}

export interface ExerciseInsight {
  /** What the chart points and trajectory line track: estimated 1RM (kg), reps (unloaded bodyweight), added weight (kg), or time. */
  metric: 'e1rm' | 'reps' | 'added_kg' | 'time';
  /** True when `e1rm` includes bodyweight (weighted calisthenics). */
  includesBodyweight?: boolean;
  /** True for isolation/small exercises that show a Best Set / reps-at-weight progression view instead of an E1RM sparkline. */
  isIsolation?: boolean;
  /** Best set per past session, oldest first (`value` is kg for load metrics or reps for `reps`). */
  history: { at: number; e1rmKg: number; value?: number }[];
  /** Best working set (highest weight, breaking ties by most reps) per past session, oldest first. */
  bestSetHistory?: BestSetSessionPoint[];
  /** Empirical E1RM progress of the replaced anchor lift when this exercise is a one-off swap. */
  anchorProgress?: AnchorLiftProgress;
  /** Strict 2-line summary (Line 1 + '\n' + Line 2) with zero section headers. */
  summary: string;
  /** [Line 1: Overall Progress Against Goals, Line 2: Today's Session Action -> Goal Outcome]. */
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
      ex.pillar,
      ex.name
    );
    return Math.max(best, e);
  }, 0);
}

function bestWorkingSet(ex: ExerciseSession): { weightKg: number; reps: number; rir?: number } | null {
  const completed = ex.sets.filter(done);
  if (completed.length === 0) return null;
  let best = completed[0];
  for (const s of completed.slice(1)) {
    const w = weightOf(s);
    const bw = weightOf(best);
    const r = s.actualReps ?? 0;
    const br = best.actualReps ?? 0;
    if (w > bw + 0.05 || (Math.abs(w - bw) <= 0.05 && r > br)) {
      best = s;
    }
  }
  return {
    weightKg: round1(weightOf(best)),
    reps: best.actualReps ?? 0,
    rir: best.actualRir ?? best.targetRir,
  };
}

function computeAnchorLiftProgress(
  anchorExerciseId: string | undefined,
  anchorName: string | undefined,
  workouts: WorkoutSession[],
  bwForDate: (date: string) => number,
  maxSessions: number
): AnchorLiftProgress | undefined {
  if (!anchorExerciseId || !anchorName) return undefined;
  const anchorPast = workouts
    .filter((w) => w.completed)
    .map((w) => ({
      w,
      ex: w.exercises.find((e) => e.exerciseId === anchorExerciseId && e.sets.some(done)),
    }))
    .filter((x): x is { w: WorkoutSession; ex: ExerciseSession } => Boolean(x.ex))
    .sort((a, b) => getWorkoutCompletedAt(a.w) - getWorkoutCompletedAt(b.w))
    .slice(-maxSessions);
  const series = anchorPast
    .map(({ w, ex }) => round1(bestE1rm(ex, bwForDate(w.date))))
    .filter((v) => v > 0);
  if (series.length === 0) return undefined;
  const firstE1rmKg = series[0];
  const latestE1rmKg = series[series.length - 1];
  return {
    anchorName,
    sessions: series.length,
    firstE1rmKg,
    latestE1rmKg,
    deltaKg: round1(latestE1rmKg - firstE1rmKg),
  };
}

export function buildExerciseInsight(
  exercise: ExerciseSession,
  workouts: WorkoutSession[],
  readinessState: ReadinessState,
  bodyweightKg = 80,
  maxSessions = 12,
  formatLoad: (kg: number) => string = (kg) => `${round1(kg)} kg`,
  biometrics?: BiometricLog[],
  muscleLabel?: string,
  goalPhase?: GoalPhase
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
  const isIsolation = isIsolationOrSmallExercise(exercise);
  const bestSetHistory: BestSetSessionPoint[] = past
    .map(({ w, ex }): BestSetSessionPoint | null => {
      const best = bestWorkingSet(ex);
      if (!best) return null;
      return {
        at: getWorkoutCompletedAt(w),
        date: w.date,
        weightKg: best.weightKg,
        reps: best.reps,
        rir: best.rir,
      };
    })
    .filter((pt): pt is BestSetSessionPoint => pt !== null);

  const bridgedAnchor =
    exercise.anchorExerciseId &&
    exercise.anchorExerciseId !== exercise.exerciseId &&
    exercise.anchorExerciseName
      ? exercise.anchorExerciseName.replace(/[.!?]/g, '').trim()
      : undefined;
  const anchorProgress = bridgedAnchor
    ? computeAnchorLiftProgress(exercise.anchorExerciseId, bridgedAnchor, workouts, bwForDate, maxSessions)
    : undefined;
  const isReentry = Boolean(exercise.isBridgeReentry);
  const swapCalibrationMode = bridgedAnchor ? resolveSwapCalibrationMode(exercise) : undefined;
  const isTwoDb = usesTwoDumbbells(exercise);

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

    const swappedTimed = bridgedAnchor
      ? buildSwappedExerciseCopy({
          anchorName: bridgedAnchor,
          pillar: exercise.pillar,
          muscleLabel,
          repRange: null,
          readinessState,
          hasOwnHistory: history.length > 0,
          isTimed: true,
          goalPhase,
          formatLoad: load,
        })
      : null;

    const line1 =
      history.length === 0
        ? swappedTimed
          ? swappedTimed.firstSessionLine1
          : `First time on ${exercise.name}—sets your starting hold baseline.`
        : history.length === 1
        ? `Your starting hold baseline is set at ${history[0].value}s from session 1.`
        : `Your hold endurance sits at ${history[history.length - 1].value}s across ${history.length} sessions.`;
    const line2 = swappedTimed
      ? swappedTimed.line2
      : buildGoalDrivenLine2({
          readinessState,
          isTimed: true,
          isIsometricTimed: Boolean(exercise.durationSeconds || isTimedExercise(exercise)),
          hasOwnHistory: history.length > 0,
          isReentry,
          metric: 'time',
          isAssisted: false,
          repRange: null,
          muscleLabel,
          goalPhase,
          plannedTop: 0,
          prevTop: 0,
          plannedReps: 0,
          prevReps: 0,
          maxReps: 0,
        }).line2;
    return { metric: 'time', history, lines: [line1, line2], summary: `${line1}\n${line2}` };
  }

  const isAssisted = isAssistedExercise(exercise);
  const repRange = getExerciseRepRangeLabel(exercise);
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

    const hasHistory = past.length > 0 && history.length > 0;
    const swappedBw = bridgedAnchor
      ? buildSwappedExerciseCopy({
          anchorName: bridgedAnchor,
          pillar: exercise.pillar,
          muscleLabel,
          repRange,
          readinessState,
          hasOwnHistory: hasHistory,
          calibrationMode: swapCalibrationMode,
          setupLabel: exercise.setupLabel,
          goalPhase,
          anchorProgress,
          formatLoad: load,
        })
      : null;

    if (!hasHistory) {
      const line1 = swappedBw
        ? swappedBw.firstSessionLine1
        : `First time on ${exercise.name}—sets your starting strength baseline.`;
      const line2 = swappedBw
        ? swappedBw.line2
        : buildGoalDrivenLine2({
            readinessState,
            isTimed: false,
            hasOwnHistory: false,
            isReentry,
            metric: 'reps',
            isAssisted,
            repRange,
            muscleLabel,
            goalPhase,
            plannedTop: 0,
            prevTop: 0,
            plannedReps: plannedSet?.targetReps ?? 0,
            prevReps: 0,
            maxReps: exercise.maxReps,
          }).line2;
      return {
        metric: 'reps',
        history,
        ...(anchorProgress ? { anchorProgress } : {}),
        lines: [line1, line2],
        summary: `${line1}\n${line2}`,
      };
    }

    let line1: string;
    if (history.length === 1) {
      line1 = `Your starting baseline is set at ${history[0].value} per set from session 1.`;
    } else {
      const first = history[0].value;
      const last = history[history.length - 1].value;
      const delta = last - first;
      const n = history.length;
      if (delta > 0) {
        line1 = `Your bodyweight strength is rising—best set is up +${delta} over ${n} sessions to ${last}.`;
      } else if (delta < 0) {
        line1 = `Your best set sits at ${last} (-${Math.abs(delta)} over ${n} sessions) as you rebuild capacity.`;
      } else {
        line1 = `Your bodyweight strength is holding steady at ${last} per set across ${n} sessions.`;
      }
    }

    const lastEx = past[past.length - 1].ex;
    const prevReps = lastEx.sets.filter(done).reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    const plannedReps = plannedSet?.targetReps ?? 0;
    const line2 = swappedBw
      ? swappedBw.line2
      : buildGoalDrivenLine2({
          readinessState,
          isTimed: false,
          hasOwnHistory: true,
          isReentry,
          metric: 'reps',
          isAssisted,
          repRange,
          muscleLabel,
          goalPhase,
          plannedTop: 0,
          prevTop: 0,
          plannedReps,
          prevReps,
          maxReps: exercise.maxReps,
          lastMaxReps: lastEx.maxReps,
        }).line2;
    return {
      metric: 'reps',
      history,
      ...(anchorProgress ? { anchorProgress } : {}),
      lines: [line1, line2],
      summary: `${line1}\n${line2}`,
    };
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
    const hasHistory = past.length > 0 && history.length > 0;
    const swappedAdded = bridgedAnchor
      ? buildSwappedExerciseCopy({
          anchorName: bridgedAnchor,
          pillar: exercise.pillar,
          muscleLabel,
          repRange,
          readinessState,
          hasOwnHistory: hasHistory,
          calibrationMode: swapCalibrationMode,
          setupLabel: exercise.setupLabel,
          goalPhase,
          anchorProgress,
          formatLoad: load,
        })
      : null;
    if (!hasHistory) {
      const line1 = swappedAdded
        ? swappedAdded.firstSessionLine1
        : `First time on ${exercise.name}—sets your starting strength baseline.`;
      const line2 = swappedAdded
        ? swappedAdded.line2
        : buildGoalDrivenLine2({
            readinessState,
            isTimed: false,
            hasOwnHistory: false,
            isReentry,
            metric: 'added_kg',
            isAssisted,
            repRange,
            muscleLabel,
            goalPhase,
            plannedTop: plannedSet?.targetWeightKg ?? 0,
            prevTop: 0,
            plannedReps: plannedSet?.targetReps ?? 0,
            prevReps: 0,
            maxReps: exercise.maxReps,
          }).line2;
      return {
        metric: 'added_kg',
        history,
        ...(anchorProgress ? { anchorProgress } : {}),
        lines: [line1, line2],
        summary: `${line1}\n${line2}`,
      };
    }
    const first = history[0].value;
    const last = history[history.length - 1].value;
    const delta = round1(last - first);
    const n = history.length;
    const line1 =
      n === 1
        ? `Your starting added weight is set at ${load(first)} from session 1.`
        : delta > 0
        ? `Your added-weight strength is rising—up +${load(delta)} over ${n} sessions to ${load(last)}.`
        : delta < 0
        ? `Your added weight sits at ${load(last)} (-${load(Math.abs(delta))} over ${n} sessions) as you rebuild momentum.`
        : `Your added weight is holding steady at ${load(last)} across ${n} sessions.`;
    const lastEx = past[past.length - 1].ex;
    const lastSets = lastEx.sets.filter(done);
    const prevTop = lastSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
    const prevReps = lastSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
    const plannedTop = plannedSet?.targetWeightKg ?? 0;
    const plannedReps = plannedSet?.targetReps ?? 0;
    const line2 = swappedAdded
      ? swappedAdded.line2
      : buildGoalDrivenLine2({
          readinessState,
          isTimed: false,
          hasOwnHistory: true,
          isReentry,
          metric: 'added_kg',
          isAssisted,
          repRange,
          muscleLabel,
          goalPhase,
          plannedTop,
          prevTop,
          plannedReps,
          prevReps,
          maxReps: exercise.maxReps,
          lastMaxReps: lastEx.maxReps,
        }).line2;
    return {
      metric: 'added_kg',
      history,
      ...(anchorProgress ? { anchorProgress } : {}),
      lines: [line1, line2],
      summary: `${line1}\n${line2}`,
    };
  }

  const history = past
    .map(({ w, ex }) => {
      const e1rm = round1(bestE1rm(ex, bwForDate(w.date)));
      return { at: getWorkoutCompletedAt(w), e1rmKg: e1rm, value: e1rm };
    })
    .filter((h) => h.e1rmKg > 0);

  const hasHistory = past.length > 0 && history.length > 0;
  const swappedMain = bridgedAnchor
    ? buildSwappedExerciseCopy({
        anchorName: bridgedAnchor,
        pillar: exercise.pillar,
        muscleLabel,
        repRange,
        readinessState,
        hasOwnHistory: hasHistory,
        calibrationMode: swapCalibrationMode,
        setupLabel: exercise.setupLabel,
        goalPhase,
        anchorProgress,
        formatLoad: load,
      })
    : null;

  if (!hasHistory) {
    const line1 = swappedMain
      ? swappedMain.firstSessionLine1
      : isAssisted
      ? `First time on ${exercise.name}—sets your starting baseline (less assistance is harder).`
      : isTwoDb
      ? `First time on ${exercise.name}—sets your starting baseline (log weight per dumbbell).`
      : isCalisthenic && exercise.equipment === 'bodyweight' && !exercise.isWeightedCalisthenic && !hasAddedLoad
      ? `First time on ${exercise.name}—sets your starting baseline using your bodyweight.`
      : `First time on ${exercise.name}—sets your starting strength baseline.`;
    const line2 = swappedMain
      ? swappedMain.line2
      : buildGoalDrivenLine2({
          readinessState,
          isTimed: false,
          hasOwnHistory: false,
          isReentry,
          metric: 'e1rm',
          isAssisted,
          repRange,
          muscleLabel,
          goalPhase,
          plannedTop: plannedSet?.targetWeightKg ?? 0,
          prevTop: 0,
          plannedReps: plannedSet?.targetReps ?? 0,
          prevReps: 0,
          maxReps: exercise.maxReps,
        }).line2;
    return {
      metric: 'e1rm',
      includesBodyweight: isCalisthenic,
      isIsolation,
      history,
      bestSetHistory,
      ...(anchorProgress ? { anchorProgress } : {}),
      lines: [line1, line2],
      summary: `${line1}\n${line2}`,
    };
  }

  const isPureBodyweight =
    isCalisthenic && !isAssisted && exercise.equipment === 'bodyweight' && !exercise.isWeightedCalisthenic && !hasAddedLoad;
  const bwQualifier = isAssisted
    ? ''
    : isPureBodyweight
    ? ' (including bodyweight)'
    : isCalisthenic
    ? ' (bodyweight + added weight)'
    : '';
  let line1: string;
  if (history.length === 1) {
    line1 = `Your starting strength is set at a ${load(history[0].e1rmKg)} estimated max${bwQualifier} from session 1.`;
  } else {
    const first = round1(history[0].e1rmKg);
    const last = round1(history[history.length - 1].e1rmKg);
    const delta = round1(last - first);
    const n = history.length;
    if (delta > 0) {
      line1 = `Your strength is rising—estimated max${bwQualifier} is up +${load(delta)} over ${n} sessions to ${load(last)}.`;
    } else if (delta < 0) {
      line1 = `Your estimated max${bwQualifier} sits at ${load(last)} (-${load(Math.abs(delta))} over ${n} sessions) as you rebuild momentum.`;
    } else {
      line1 = `Your strength is holding steady at a ${load(last)} estimated max${bwQualifier} across ${n} sessions.`;
    }
  }

  const lastEx = past[past.length - 1].ex;
  const lastSets = lastEx.sets.filter(done);
  const prevTop = lastSets.reduce((m, s) => Math.max(m, weightOf(s)), 0);
  const prevReps = lastSets.reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
  const plannedTop = plannedSet?.targetWeightKg ?? 0;
  const plannedReps = plannedSet?.targetReps ?? 0;

  const line2 = swappedMain
    ? swappedMain.line2
    : buildGoalDrivenLine2({
        readinessState,
        isTimed: false,
        hasOwnHistory: true,
        isReentry,
        metric: 'e1rm',
        isAssisted,
        repRange,
        muscleLabel,
        goalPhase,
        plannedTop,
        prevTop,
        plannedReps,
        prevReps,
        maxReps: exercise.maxReps,
        lastMaxReps: lastEx.maxReps,
      }).line2;

  return {
    metric: 'e1rm',
    includesBodyweight: isCalisthenic,
    isIsolation,
    history,
    bestSetHistory,
    ...(anchorProgress ? { anchorProgress } : {}),
    lines: [line1, line2],
    summary: `${line1}\n${line2}`,
  };
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
