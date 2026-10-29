/**
 * Progress per muscle, from the athlete's own workouts and measurements. Three measures, because no
 * single number captures muscle growth:
 *
 * 1. Stimulus: hard sets per week (within 3 reps of failure), full credit to the main muscle and half
 *    to muscles that help (Schoenfeld et al., 2017; Baz-Valle et al., 2022; Pelland et al., 2024),
 *    against the athlete's personal weekly target from the knowledge graph.
 * 2. Performance: a strength index (start = 100). Each exercise is compared only with itself, so
 *    different exercises can be combined: every week, the index moves by the weighted average change
 *    in each trained exercise's best estimated max since its previous week (a chain-linked index, so
 *    swapping or adding exercises doesn't jump it). Sets above 15 reps are left out because the
 *    estimate is unreliable there.
 * 3. Outcome: tape measurements for the muscle (arm, chest, thigh, calf, hips, shoulders), when the
 *    athlete has logged them.
 */
import { calculateE1RM } from '../engine/e1rm';
import { AthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { MUSCLE_FRIENDLY_NAMES, getWorkoutCompletedAt } from '../engine/recovery';
import { BiometricLog, ExerciseDefinition, MuscleGroup, WorkoutSession, WorkoutSet } from '../engine/types';
import { localDateString } from '../utils/date';
import { muscleSetsBetween } from './storage';

/** A dated value on a chart. */
export interface TrendPoint {
  date: string;
  value: number;
}

const DAY = 24 * 60 * 60 * 1000;
const MAX_STRENGTH_REPS = 15;

/** Muscles shown, in head-to-toe order, as knowledge-graph keys. */
const MUSCLES: { key: string; group: MuscleGroup }[] = [
  { key: 'Chest', group: 'Chest' },
  { key: 'Back', group: 'Back' },
  { key: 'SideDelts', group: 'Side Delts' },
  { key: 'RearDelts', group: 'Rear Delts' },
  { key: 'FrontDelts', group: 'Front Delts' },
  { key: 'Biceps', group: 'Biceps' },
  { key: 'Triceps', group: 'Triceps' },
  { key: 'Core', group: 'Core' },
  { key: 'Quads', group: 'Quads' },
  { key: 'Hamstrings', group: 'Hamstrings' },
  { key: 'Glutes', group: 'Glutes' },
  { key: 'Calves', group: 'Calves' },
];

/** Which muscles an exercise's main and helper muscles count towards (same as weekly sets). */
function muscleKeysFor(group: MuscleGroup): string[] {
  if (group === 'Shoulders') return ['FrontDelts'];
  return MUSCLES.filter((m) => m.group === group).map((m) => m.key);
}

type MeasureField = keyof BiometricLog;
const TAPE: Record<string, { label: string; fields: MeasureField[][] }> = {
  Chest: { label: 'Chest', fields: [['chestCm']] },
  Biceps: { label: 'Arm', fields: [['bicepLeftCm', 'bicepRightCm'], ['armCm']] },
  Triceps: { label: 'Arm', fields: [['bicepLeftCm', 'bicepRightCm'], ['armCm']] },
  Quads: { label: 'Thigh', fields: [['thighLeftCm', 'thighRightCm'], ['thighCm']] },
  Hamstrings: { label: 'Thigh', fields: [['thighLeftCm', 'thighRightCm'], ['thighCm']] },
  Calves: { label: 'Calf', fields: [['calfLeftCm', 'calfRightCm'], ['calfCm']] },
  Glutes: { label: 'Hips', fields: [['hipsCm']] },
  SideDelts: { label: 'Shoulders', fields: [['shouldersCm']] },
  RearDelts: { label: 'Shoulders', fields: [['shouldersCm']] },
};

export interface WeeklySets {
  /** Last day of the 7-day window. */
  date: string;
  sets: number;
}

export interface MuscleProgress {
  key: string;
  label: string;
  /** Hard sets in the last 7 days (same count as the knowledge graph and exercise cards). */
  weeklySets: number;
  /** Personal weekly target from the knowledge graph, when it tracks this muscle. */
  target?: [number, number];
  /** Hard sets in each of the last 8 weeks, oldest first. */
  setsByWeek: WeeklySets[];
  /** Strength index per week the muscle was trained (100 = first week), oldest first. */
  strengthIndex: TrendPoint[];
  /** Exercises that fed the index, main-muscle exercises first. */
  exercises: string[];
  /** Tape measurement for the muscle, when logged. */
  measurement?: { label: string; points: TrendPoint[] };
  lastTrained?: string;
  summary: string;
}

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';

function bestE1rm(ex: WorkoutSession['exercises'][number], bodyweightKg: number): number {
  return ex.sets
    .filter((s) => s.completed && isWorking(s) && (s.actualReps ?? 0) > 0 && (s.actualReps ?? 0) <= MAX_STRENGTH_REPS)
    .reduce((best, s) => {
      const e = calculateE1RM(
        s.actualWeightKg ?? s.targetWeightKg ?? 0,
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

function measurementSeries(key: string, biometrics: BiometricLog[]): MuscleProgress['measurement'] {
  const tape = TAPE[key];
  if (!tape) return undefined;
  const points: TrendPoint[] = [];
  for (const b of [...biometrics].sort((a, c) => a.date.localeCompare(c.date))) {
    for (const group of tape.fields) {
      const values = group.map((f) => b[f]).filter((v): v is number => typeof v === 'number' && v > 0);
      if (values.length) {
        points.push({ date: b.date, value: Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 10) / 10 });
        break;
      }
    }
  }
  return points.length ? { label: tape.label, points } : undefined;
}

const fmtDate = (date: string) => {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};

export function buildMuscleProgress(input: {
  workouts: WorkoutSession[];
  exerciseCatalog: ExerciseDefinition[];
  biometrics: BiometricLog[];
  knowledgeGraph?: AthleteKnowledgeGraph;
  bodyweightKg: number;
  /** Formats centimetres in the athlete's unit. */
  formatLength?: (cm: number) => string;
  now?: number;
  weeks?: number;
}): MuscleProgress[] {
  const now = input.now ?? Date.now();
  const weeks = input.weeks ?? 8;
  const formatLength = input.formatLength ?? ((cm: number) => `${cm} cm`);
  const done = input.workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  const catalog = new Map(input.exerciseCatalog.map((e) => [e.id, e]));

  // 7-day windows ending today, matching the weekly count used everywhere else.
  const windows = Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * 7 * DAY;
    return { from: localDateString(new Date(end - 7 * DAY)), to: localDateString(new Date(end)) };
  });
  const setsPerWindow = windows.map((w) => muscleSetsBetween(done, input.exerciseCatalog, w.from, w.to));

  return MUSCLES.flatMap(({ key, group }) => {
    // Exercises that train this muscle, with their weight in the index.
    const weightOf = (exerciseId: string): number => {
      const def = catalog.get(exerciseId);
      if (!def) return 0;
      if (muscleKeysFor(def.primaryMuscle).includes(key)) return 1;
      if ((def.secondaryMuscles ?? []).some((m) => muscleKeysFor(m).includes(key))) return 0.5;
      return 0;
    };

    // Strength index, chain-linked week to week (non-overlapping 7-day windows over all history).
    const firstAt = done.length ? getWorkoutCompletedAt(done[0]) : now;
    const windowCount = Math.max(1, Math.ceil((now - firstAt) / (7 * DAY)) + 1);
    const latest = new Map<string, number>();
    const used = new Map<string, number>();
    const strengthIndex: TrendPoint[] = [];
    let index = 100;
    let lastTrained: string | undefined;
    for (let i = windowCount - 1; i >= 0; i--) {
      const end = now - i * 7 * DAY;
      const start = end - 7 * DAY;
      const inWindow = done.filter((w) => {
        const t = getWorkoutCompletedAt(w);
        return t > start && t <= end;
      });
      const best = new Map<string, number>();
      let lastDate: string | undefined;
      for (const w of inWindow) {
        for (const ex of w.exercises) {
          if (weightOf(ex.exerciseId) === 0 || ex.durationSeconds || ex.durationMinutesRange) continue;
          const e = bestE1rm(ex, input.bodyweightKg);
          if (e <= 0) continue;
          best.set(ex.exerciseId, Math.max(best.get(ex.exerciseId) ?? 0, e));
          lastDate = w.date;
        }
      }
      if (!best.size) continue;
      let weighted = 0;
      let weights = 0;
      for (const [id, e] of best) {
        const prev = latest.get(id);
        if (prev && prev > 0) {
          weighted += weightOf(id) * (e / prev);
          weights += weightOf(id);
        }
        latest.set(id, e);
        if (!used.has(id)) used.set(id, weightOf(id));
      }
      if (weights > 0) index = index * (weighted / weights);
      strengthIndex.push({ date: lastDate!, value: Math.round(index * 10) / 10 });
      lastTrained = lastDate;
    }

    const setsByWeek = windows.map((w, i) => ({ date: w.to, sets: setsPerWindow[i][key] ?? 0 }));
    const weeklySets = setsByWeek[setsByWeek.length - 1]?.sets ?? 0;
    const measurement = measurementSeries(key, input.biometrics);
    // Skip muscles with no real training: no strength data and under one set (stray helper credit).
    const totalSets = setsByWeek.reduce((a, w) => a + w.sets, 0);
    if (!strengthIndex.length && totalSets < 1 && !measurement) return [];

    const profile = input.knowledgeGraph?.muscleProfiles.find((m) => m.muscleKey === key);
    const target = profile?.personalizedMav;
    const label = profile?.displayName ?? (MUSCLE_FRIENDLY_NAMES[group] ?? group).replace(/\b\w/g, (c) => c.toUpperCase());
    const exercises = [...used.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => catalog.get(id)?.name ?? id);

    // Plain-English summary from the same numbers.
    const parts: string[] = [];
    const setsText = Number.isInteger(weeklySets) ? `${weeklySets}` : weeklySets.toFixed(1);
    if (target) {
      const status = weeklySets < target[0] ? 'below' : weeklySets > target[1] ? 'above' : 'within';
      parts.push(`${setsText} hard sets this week, ${status} your ${target[0]}–${target[1]} target.`);
    } else {
      parts.push(`${setsText} hard sets this week.`);
    }
    if (strengthIndex.length >= 2) {
      const change = Math.round(strengthIndex[strengthIndex.length - 1].value - 100);
      const from = fmtDate(strengthIndex[0].date);
      parts.push(
        change === 0
          ? `Strength has held steady since ${from}.`
          : `Strength is ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% since ${from}, across ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}.`
      );
    } else if (strengthIndex.length === 1) {
      parts.push('Strength starts here; your trend appears after another week of training it.');
    }
    if (measurement && measurement.points.length >= 2) {
      const first = measurement.points[0].value;
      const last = measurement.points[measurement.points.length - 1].value;
      const diff = Math.round((last - first) * 10) / 10;
      parts.push(
        diff === 0
          ? `${measurement.label} measurement unchanged at ${formatLength(last)}.`
          : `${measurement.label} measurement ${diff > 0 ? 'up' : 'down'} ${formatLength(Math.abs(diff))}.`
      );
    }

    return [
      {
        key,
        label,
        weeklySets,
        target,
        setsByWeek,
        strengthIndex,
        exercises,
        measurement,
        lastTrained,
        summary: parts.join(' '),
      },
    ];
  });
}
