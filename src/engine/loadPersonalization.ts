import { PROGRESSION_RULES, hadQualityEffort, loadIncrementFor } from './progressionRules';
import {
  ExerciseSession,
  ExperienceLevel,
  Gender,
  ReadinessState,
  StrengthPillar,
  WorkoutSession,
  WorkoutSet,
} from './types';
import { findLastCompletedExerciseSession } from './progression';
import { snapLoadKg, WeightUnit } from '../utils/units';

/**
 * Personalizes the working weights of a generated session so they reflect the athlete, not
 * the template's reference lifter.
 *
 * 1. Same exercise done before → carry the last real working weight forward, adjusted for the
 *    new rep target (Epley) and stepped up when every set hit its target last time.
 * 2. Never done before → scale the template weight by what the athlete has actually lifted
 *    relative to the templates on other exercises (same movement pillar first, then overall).
 * 3. No history at all → scale by onboarding calibration (experience, bodyweight, sex).
 */

/** Template weights were written for an experienced ~80 kg male lifter. */
const REFERENCE_BODYWEIGHT_KG = 80;

const EXPERIENCE_FACTORS: Record<ExperienceLevel, number> = {
  new: 0.5,
  intermediate: 0.75,
  experienced: 1.0,
};

const UPPER_BODY_PILLARS: StrengthPillar[] = [
  'Horizontal Push',
  'Vertical Push',
  'Horizontal Pull',
  'Vertical Pull',
];

export interface LoadPersonalizationContext {
  history: WorkoutSession[];
  bodyweightKg: number;
  gender?: Gender;
  experienceLevel?: ExperienceLevel;
  readinessState?: ReadinessState;
  unit?: WeightUnit;
  /**
   * Template default working weight for an exercise, expressed for the experienced reference
   * lifter (used to learn the athlete's strength ratio across exercises).
   */
  templateDefaultFor: (exerciseId: string) => number | undefined;
  /** The experience level the session's template weights already assume. */
  templateReferenceLevel?: ExperienceLevel;
  /**
   * When true, exercises with exact history are re-prescribed here (the generator ignored history).
   * When false, exercises with any history are left as the generator prescribed them.
   */
  carryOverExactHistory?: boolean;
}

function isWorking(s: WorkoutSet): boolean {
  return !s.isWarmup && s.setType !== 'warmup';
}

function isPureBodyweight(ex: ExerciseSession): boolean {
  return ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic;
}

/** Calibration factor from onboarding answers, relative to the experienced reference lifter. */
export function getStarterStrengthFactor(
  pillar: StrengthPillar | undefined,
  bodyweightKg: number,
  experienceLevel: ExperienceLevel = 'intermediate',
  gender: Gender = 'male'
): number {
  const experience = EXPERIENCE_FACTORS[experienceLevel] ?? 0.75;
  // Strength scales with roughly bodyweight^(2/3) (allometric scaling).
  const bwFactor = Math.max(0.7, Math.min(1.3, Math.pow(Math.max(40, bodyweightKg) / REFERENCE_BODYWEIGHT_KG, 0.67)));
  const isUpper = pillar ? UPPER_BODY_PILLARS.includes(pillar) : false;
  const sexFactor = gender === 'female' ? (isUpper ? 0.6 : 0.75) : 1;
  return experience * bwFactor * sexFactor;
}

/**
 * Learns how the athlete compares to template weights from exercises they have logged.
 * Returns a ratio per pillar plus an overall median, or nulls when there is no usable history.
 */
export function learnStrengthRatios(
  history: WorkoutSession[],
  templateDefaultFor: (exerciseId: string) => number | undefined
): { byPillar: Partial<Record<StrengthPillar, number>>; overall: number | null } {
  const samples: { pillar: StrengthPillar; ratio: number }[] = [];
  const seen = new Set<string>();
  const ordered = history
    .filter((w) => w.completed)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));

  for (const w of ordered) {
    for (const ex of w.exercises) {
      if (seen.has(ex.exerciseId) || isPureBodyweight(ex)) continue;
      const def = templateDefaultFor(ex.exerciseId);
      if (!def || def <= 0) continue;
      const done = ex.sets.filter((s) => s.completed && isWorking(s));
      if (done.length === 0) continue;
      const top = Math.max(...done.map((s) => s.actualWeightKg ?? s.targetWeightKg ?? 0));
      if (top <= 0) continue;
      seen.add(ex.exerciseId);
      samples.push({ pillar: ex.pillar, ratio: top / def });
    }
  }

  const median = (vals: number[]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const byPillar: Partial<Record<StrengthPillar, number>> = {};
  const pillars = new Set(samples.map((s) => s.pillar));
  for (const p of pillars) {
    byPillar[p] = median(samples.filter((s) => s.pillar === p).map((s) => s.ratio));
  }
  return { byPillar, overall: samples.length > 0 ? median(samples.map((s) => s.ratio)) : null };
}

/** Epley-based weight for a new rep/RIR target from a previous set. */
function equivalentWeight(prevWeight: number, prevReps: number, prevRir: number, newReps: number, newRir: number): number {
  const e1rm = prevWeight * (1 + (prevReps + prevRir) / 30);
  return e1rm / (1 + (newReps + newRir) / 30);
}

function loadIncrementKg(ex: ExerciseSession, unit: WeightUnit): number {
  if (unit === 'lb') return 5 / 2.2046226218;
  return loadIncrementFor(ex.equipment);
}

/** Carry-over weight for an exercise the athlete has done before (exact same exercise only). */
function carryOverWeight(
  ex: ExerciseSession,
  previous: ExerciseSession,
  readinessState: ReadinessState,
  unit: WeightUnit
): number | null {
  const done = previous.sets.filter((s) => s.completed && isWorking(s));
  if (done.length === 0) return null;

  // Use the heaviest completed working set as the anchor.
  const anchor = done.reduce((best, s) =>
    (s.actualWeightKg ?? s.targetWeightKg) > (best.actualWeightKg ?? best.targetWeightKg) ? s : best
  );
  const prevWeight = anchor.actualWeightKg ?? anchor.targetWeightKg;
  if (prevWeight <= 0) return null;
  const prevReps = anchor.actualReps ?? anchor.targetReps;
  const prevRir = anchor.actualRir ?? anchor.targetRir ?? 2;

  const firstWorking = ex.sets.find(isWorking);
  const newReps = firstWorking?.targetReps ?? prevReps;
  const newRir = firstWorking?.targetRir ?? prevRir;

  let weight = equivalentWeight(prevWeight, prevReps, prevRir, newReps, newRir);

  // Double progression (knowledge graph `sp-double-progression`): plan sessions prescribe a fixed rep
  // target, which is the top of the range. Every set reaching it with quality reps → one load step.
  // Missed reps or ground-out sets → the weight that matches what was actually lifted (no increase).
  const hitAllTargets = done.every(
    (s) => (s.actualReps ?? s.targetReps) >= s.targetReps && hadQualityEffort(s.actualRir, s.targetRir)
  );
  if (hitAllTargets && readinessState !== 'Amber Shield' && newReps >= prevReps) {
    weight = Math.max(weight, prevWeight) + loadIncrementKg(ex, unit);
  } else if (readinessState === 'Amber Shield' || newReps >= prevReps) {
    // Low recovery, or the same/higher rep target: never heavier than last time.
    weight = Math.min(weight, prevWeight);
  }
  // Never prescribe a big jump from one session to the next, including after rounding to the
  // weights that exist (e.g. dumbbells in 2 kg steps).
  const cap = prevWeight * (1 + PROGRESSION_RULES.maxSessionIncreaseFraction) + loadIncrementKg(ex, unit);
  let snapped = snapLoadKg(Math.min(weight, cap), unit, ex.equipment);
  while (snapped > cap + 1e-9 && snapped > prevWeight) {
    snapped = snapLoadKg(snapped - loadIncrementKg(ex, unit), unit, ex.equipment);
  }
  return snapped;
}

function applyWeightToExercise(
  ex: ExerciseSession,
  newWorkingKg: number,
  unit: WeightUnit
): ExerciseSession {
  const working = ex.sets.find(isWorking);
  const oldWorking = working?.targetWeightKg ?? 0;
  const snapped = snapLoadKg(newWorkingKg, unit, ex.equipment);
  const ratio = oldWorking > 0 ? snapped / oldWorking : 1;

  return {
    ...ex,
    sets: ex.sets.map((s) => {
      if (s.completed) return s;
      if (isWorking(s)) {
        return { ...s, targetWeightKg: snapped, actualWeightKg: snapped };
      }
      // Warm-ups scale with the new working weight.
      const warm = s.targetWeightKg > 0 ? snapLoadKg(s.targetWeightKg * ratio, unit, ex.equipment) : 0;
      return { ...s, targetWeightKg: warm, actualWeightKg: warm };
    }),
  };
}

export function personalizeSessionLoads(
  session: WorkoutSession,
  ctx: LoadPersonalizationContext
): WorkoutSession {
  const unit = ctx.unit || 'kg';
  const readiness = ctx.readinessState || 'Normal';
  const referenceFactor = EXPERIENCE_FACTORS[ctx.templateReferenceLevel || 'experienced'];
  const learned = learnStrengthRatios(ctx.history, ctx.templateDefaultFor);

  const exercises = session.exercises.map((ex) => {
    if (isPureBodyweight(ex)) return ex;
    const working = ex.sets.find(isWorking);
    const sessionWeight = working?.targetWeightKg ?? 0;
    // A loaded exercise with no weight (e.g. swapped in from a bodyweight move) starts from its
    // known default, which is stated at the experienced reference level.
    const fallbackDefault = sessionWeight > 0 || ex.isWeightedCalisthenic ? undefined : ctx.templateDefaultFor(ex.exerciseId);
    const templateWeight = sessionWeight > 0 ? sessionWeight : fallbackDefault ?? 0;
    const exerciseReferenceFactor = fallbackDefault !== undefined ? EXPERIENCE_FACTORS.experienced : referenceFactor;
    if (templateWeight <= 0 && !ex.isWeightedCalisthenic) return ex;
    // Never rewrite an exercise the athlete has already started logging.
    if (ex.sets.some((s) => s.completed)) return ex;

    const previous = findLastCompletedExerciseSession(ex.exerciseId, ctx.history, ex);
    if (previous) {
      if (!ctx.carryOverExactHistory) return ex;
      if (!previous.isCrossImplementTransfer) {
        const carried = carryOverWeight(ex, previous.session, readiness, unit);
        if (carried !== null) return applyWeightToExercise(ex, carried, unit);
      }
    }

    if (templateWeight <= 0) return ex;
    const athleteFactor =
      learned.byPillar[ex.pillar] ??
      learned.overall ??
      getStarterStrengthFactor(ex.pillar, ctx.bodyweightKg, ctx.experienceLevel, ctx.gender);
    return applyWeightToExercise(ex, (templateWeight / exerciseReferenceFactor) * athleteFactor, unit);
  });

  return { ...session, exercises };
}
