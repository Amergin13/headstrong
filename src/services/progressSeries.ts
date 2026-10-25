/**
 * Chart series and plain-English summaries for the Progress tab. Every value comes from logged
 * workouts or measurements the athlete entered; a chart with fewer than two points shows the
 * labelled "Example" shape instead of numbers.
 */
import { calculateE1RM } from '../engine/e1rm';
import { calculateEmaSeries } from '../engine/ema';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { isPillarBenchmarkExercise } from '../engine/strengthStandards';
import { BiometricLog, GoalPhase, StrengthPillar, UserProfile, WorkoutSession } from '../engine/types';
import { calculateWci } from '../engine/wci';
import { daysBetweenLocalDates, localDateString, parseLocalDate } from '../utils/date';

export interface ProgressPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ProgressChart {
  id: string;
  title: string;
  /** Main line, oldest first. */
  points: ProgressPoint[];
  /** Faint line underneath, e.g. daily weigh-ins under the 7-day average. */
  secondary?: ProgressPoint[];
  lastUpdated?: string;
  summary: string;
  /** Formats a value for axis labels, e.g. "81.2 kg". */
  format: (value: number) => string;
}

export interface ProgressFormatters {
  weight: (kg: number) => string;
  /** Small changes such as weekly pace, e.g. "0.25 kg". Falls back to weight. */
  weightPrecise?: (kg: number) => string;
  length: (cm: number) => string;
}

const shortDate = (date: string) => {
  const d = parseLocalDate(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const round1 = (v: number) => Math.round(v * 10) / 10;

/** "now X, up Y since 13/10 (4 measurements)" for any measured series. */
function changeSummary(label: string, points: ProgressPoint[], format: (v: number) => string, delta: (v: number) => string): string {
  if (points.length === 0) return '';
  const last = points[points.length - 1];
  if (points.length === 1) return `${label}: ${format(last.value)}. Log it again in a week or two to see your trend.`;
  const first = points[0];
  const diff = last.value - first.value;
  const direction = Math.abs(diff) < 1e-9 ? 'unchanged' : diff > 0 ? `up ${delta(diff)}` : `down ${delta(-diff)}`;
  return `${label} is ${format(last.value)}, ${direction} since ${shortDate(first.date)} across ${points.length} measurements.`;
}

const measured = (logs: BiometricLog[], pick: (l: BiometricLog) => number | undefined): ProgressPoint[] =>
  logs
    .map((l) => ({ date: l.date, value: pick(l) ?? 0 }))
    .filter((p) => p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

/** Healthy weekly rate of weight change for each goal, as % of bodyweight (Helms et al.; Iraki et al., 2019). */
const GOAL_RATE: Record<GoalPhase, { min: number; max: number; label: string }> = {
  'Lean Bulk': { min: 0.25, max: 0.5, label: 'a lean bulk (gaining 0.25–0.5% a week)' },
  'Cut / Recomp': { min: -1, max: -0.5, label: 'a cut (losing 0.5–1% a week)' },
  Maingain: { min: -0.25, max: 0.25, label: 'maintaining (within 0.25% a week)' },
};

export function buildCompositionCharts(input: {
  biometrics: BiometricLog[];
  profile: UserProfile;
  fmt: ProgressFormatters;
  now?: Date;
}): ProgressChart[] {
  const { biometrics, profile, fmt } = input;
  const charts: ProgressChart[] = [];
  const pct = (v: number) => `${round1(v)}%`;

  // Bodyweight: 7-day average with daily weigh-ins underneath.
  const ema = calculateEmaSeries(biometrics);
  const emaPoints = ema.map((e) => ({ date: e.date, value: e.ema }));
  let weightSummary = 'Log your weight each morning, after the toilet and before eating, to start this chart.';
  if (emaPoints.length === 1) {
    weightSummary = `First weigh-in: ${fmt.weight(emaPoints[0].value)}. Weigh in each morning to see your 7-day average.`;
  } else if (emaPoints.length >= 2) {
    const last = emaPoints[emaPoints.length - 1];
    // Rate over the last 2–4 weeks of averages.
    const ref = [...emaPoints].reverse().find((p) => daysBetweenLocalDates(p.date, last.date) >= 14) ?? emaPoints[0];
    const days = Math.max(1, daysBetweenLocalDates(ref.date, last.date));
    const perWeekKg = ((last.value - ref.value) / days) * 7;
    const perWeekPct = (perWeekKg / last.value) * 100;
    const goal = GOAL_RATE[profile.goalPhase] ?? GOAL_RATE.Maingain;
    const direction = Math.abs(perWeekKg) < 0.05 ? 'holding steady' : `${perWeekKg > 0 ? 'up' : 'down'} ${(fmt.weightPrecise ?? fmt.weight)(Math.abs(perWeekKg))} a week`;
    const onPace = perWeekPct >= goal.min && perWeekPct <= goal.max;
    weightSummary =
      `Your 7-day average is ${fmt.weight(round1(last.value))}, ${direction} (${round1(Math.abs(perWeekPct))}% of your weight). ` +
      (onPace
        ? `That's on pace for ${goal.label}.`
        : perWeekPct > goal.max
        ? `That's faster than ${goal.label}.`
        : `That's slower than ${goal.label}.`);
  }
  charts.push({
    id: 'bodyweight',
    title: 'Bodyweight',
    points: emaPoints,
    secondary: ema.map((e) => ({ date: e.date, value: e.weight })),
    lastUpdated: emaPoints[emaPoints.length - 1]?.date,
    summary: weightSummary,
    format: fmt.weight,
  });

  // Body fat and the lean mass it implies.
  const bodyFat = measured(biometrics, (l) => l.bodyFatPct);
  charts.push({
    id: 'body-fat',
    title: 'Body fat',
    points: bodyFat,
    lastUpdated: bodyFat[bodyFat.length - 1]?.date,
    summary:
      changeSummary('Body fat', bodyFat, pct, (d) => `${round1(d)} ${round1(d) === 1 ? 'point' : 'points'}`) ||
      'Log your body fat from a smart scale, calipers or a scan to start this chart. Use the same method each time.',
    format: pct,
  });

  const lean = biometrics
    .filter((l) => (l.bodyFatPct ?? 0) > 0 && l.bodyweightKg > 0)
    .map((l) => ({ date: l.date, value: round1(l.bodyweightKg * (1 - (l.bodyFatPct as number) / 100)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  charts.push({
    id: 'lean-mass',
    title: 'Lean mass',
    points: lean,
    lastUpdated: lean[lean.length - 1]?.date,
    summary:
      changeSummary('Lean mass (everything but fat)', lean, fmt.weight, fmt.weight) ||
      'Log your weight and body fat on the same day to see your lean mass: everything that isn\'t fat, mostly muscle and water.',
    format: fmt.weight,
  });

  // Fat-free mass index: lean mass for your height (Kouri et al., 1995). Needs a real height.
  const heightM = profile.measuredHeightCm ? profile.measuredHeightCm / 100 : 0;
  const ffmi = heightM > 0 ? lean.map((p) => ({ date: p.date, value: round1(p.value / (heightM * heightM) + 6.1 * (1.8 - heightM)) })) : [];
  const typical = profile.gender === 'female' ? 15 : 19;
  charts.push({
    id: 'ffmi',
    title: 'Muscle for your height',
    points: ffmi,
    lastUpdated: ffmi[ffmi.length - 1]?.date,
    summary: !heightM
      ? 'Add your height when you log measurements to see how much muscle you carry for your height (FFMI).'
      : ffmi.length === 0
      ? 'Log your body fat to see how much muscle you carry for your height (FFMI).'
      : `${changeSummary('Your FFMI', ffmi, (v) => `${round1(v)}`, (d) => `${round1(d)}`)} For reference, untrained ${profile.gender === 'female' ? 'women' : 'men'} average about ${typical}.`,
    format: (v) => `${round1(v)}`,
  });

  // Tape measurements.
  const waist = measured(biometrics, (l) => l.waistCm);
  charts.push({
    id: 'waist',
    title: 'Waist',
    points: waist,
    lastUpdated: waist[waist.length - 1]?.date,
    summary:
      changeSummary('Your waist', waist, fmt.length, fmt.length) ||
      'Measure your waist at the belly button, relaxed, after breathing out. A shrinking waist with steady weight means you\'re losing fat and building muscle.',
    format: fmt.length,
  });

  const whtr = heightM > 0 ? waist.map((p) => ({ date: p.date, value: Math.round((p.value / (heightM * 100)) * 100) / 100 })) : [];
  const lastWhtr = whtr[whtr.length - 1]?.value;
  charts.push({
    id: 'waist-to-height',
    title: 'Waist-to-height',
    points: whtr,
    lastUpdated: whtr[whtr.length - 1]?.date,
    summary: !heightM
      ? 'Add your height when you log measurements to see your waist-to-height ratio. Under 0.5 is the healthy range.'
      : whtr.length === 0
      ? 'Log your waist to see your waist-to-height ratio. Under 0.5 is the healthy range.'
      : `Your waist is ${lastWhtr} of your height. ${lastWhtr !== undefined && lastWhtr < 0.5 ? "That's in the healthy range (under 0.5)." : 'The healthy range is under 0.5.'}`,
    format: (v) => v.toFixed(2),
  });

  const chest = measured(biometrics, (l) => l.chestCm);
  charts.push({
    id: 'chest',
    title: 'Chest',
    points: chest,
    lastUpdated: chest[chest.length - 1]?.date,
    summary: changeSummary('Your chest', chest, fmt.length, fmt.length) || 'Measure around the fullest part of your chest, relaxed, to track upper-body growth.',
    format: fmt.length,
  });

  const arms = measured(biometrics, (l) => l.armCm);
  charts.push({
    id: 'arms',
    title: 'Arms',
    points: arms,
    lastUpdated: arms[arms.length - 1]?.date,
    summary: changeSummary('Your arm', arms, fmt.length, fmt.length) || 'Measure your upper arm at its widest, flexed, to track arm growth.',
    format: fmt.length,
  });

  return charts;
}

const PILLARS: { pillar: StrengthPillar; title: string }[] = [
  { pillar: 'Squat', title: 'Squat strength' },
  { pillar: 'Hinge', title: 'Hip hinge strength' },
  { pillar: 'Horizontal Push', title: 'Pressing strength' },
  { pillar: 'Vertical Push', title: 'Overhead pressing strength' },
  { pillar: 'Horizontal Pull', title: 'Rowing strength' },
  { pillar: 'Vertical Pull', title: 'Pulling strength' },
];

const isWorkingDone = (s: { completed: boolean; isWarmup?: boolean; setType?: string; actualReps?: number }) =>
  s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0;

/** Monday of the week containing a date. */
function weekStart(date: string): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateString(d);
}

export function buildStrengthCharts(input: {
  workouts: WorkoutSession[];
  profile: UserProfile;
  bodyweightKg: number;
  fmt: ProgressFormatters;
}): ProgressChart[] {
  const { profile, bodyweightKg, fmt } = input;
  const done = input.workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  const charts: ProgressChart[] = [];

  // Estimated max per movement pattern (best benchmark lift each session).
  for (const { pillar, title } of PILLARS) {
    const byDate = new Map<string, number>();
    for (const w of done) {
      for (const ex of w.exercises) {
        if (ex.pillar !== pillar || !isPillarBenchmarkExercise(ex)) continue;
        for (const s of ex.sets.filter(isWorkingDone)) {
          const e1rm = calculateE1RM(
            s.actualWeightKg ?? s.targetWeightKg,
            s.actualReps ?? 0,
            s.actualRir ?? 2,
            ex.equipment,
            ex.isRdl,
            ex.isWeightedCalisthenic,
            bodyweightKg,
            ex.exerciseId,
            ex.pillar
          );
          if (e1rm > (byDate.get(w.date) ?? 0)) byDate.set(w.date, Math.round(e1rm * 10) / 10);
        }
      }
    }
    const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    if (points.length === 0) continue;
    const last = points[points.length - 1];
    const first = points[0];
    const change = first.value > 0 ? Math.round(((last.value - first.value) / first.value) * 1000) / 10 : 0;
    charts.push({
      id: `strength-${pillar}`,
      title,
      points,
      lastUpdated: last.date,
      summary:
        points.length === 1
          ? `Your estimated one-rep max is ${fmt.weight(last.value)}. This is your starting point.`
          : `Your estimated one-rep max is ${fmt.weight(last.value)}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% since ${shortDate(first.date)} across ${points.length} sessions.`,
      format: fmt.weight,
    });
  }

  // Weekly hard sets: the main driver of muscle growth (Schoenfeld et al., 2017).
  const weekly = new Map<string, number>();
  for (const w of done) {
    const sets = w.exercises.reduce((n, ex) => n + ex.sets.filter((s) => isWorkingDone(s) && (s.actualRir ?? s.targetRir ?? 2) <= 4).length, 0);
    weekly.set(weekStart(w.date), (weekly.get(weekStart(w.date)) ?? 0) + sets);
  }
  const weeklyPoints = [...weekly.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const lastWeek = weeklyPoints[weeklyPoints.length - 1];
  charts.push({
    id: 'weekly-sets',
    title: 'Weekly hard sets',
    points: weeklyPoints,
    lastUpdated: lastWeek?.date,
    summary: !lastWeek
      ? 'Finish a workout to start tracking how many hard sets you do each week, the main driver of muscle growth.'
      : `${lastWeek.value} hard sets in the week of ${shortDate(lastWeek.date)}. Your plan raises this gradually, then eases off so you can recover.`,
    format: (v) => `${Math.round(v)}`,
  });

  // Work capacity: only sessions with measured heart rate.
  const restHr = profile.restingHrBaseline;
  const maxHr = profile.maxHr;
  const wci = done
    .filter((w) => w.hasMeasuredHeartRate && (w.avgHeartRate ?? 0) > 0 && (w.durationMinutes ?? 0) > 0)
    .map((w) => ({ date: w.date, value: Math.round(calculateWci(w, restHr, maxHr)) }))
    .filter((p) => Number.isFinite(p.value) && p.value > 0);
  if (wci.length > 0) {
    charts.push({
      id: 'work-capacity',
      title: 'Work capacity',
      points: wci,
      lastUpdated: wci[wci.length - 1].date,
      summary: changeSummary('Work done per heartbeat effort', wci, (v) => `${v}`, (d) => `${Math.round(d)}`),
      format: (v) => `${Math.round(v)}`,
    });
  }
  return charts;
}
