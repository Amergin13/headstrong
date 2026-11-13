/**
 * Chart series and plain-English summaries for the Progress tab. Every value comes from logged
 * workouts or measurements the athlete entered; one point shows that real starting value, and
 * only a chart with no points shows the labelled "Example" shape instead of numbers.
 */
import { calculateE1RM } from '../engine/e1rm';
import { buildBodyweightEmaLookup, calculateEmaSeries } from '../engine/ema';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { isPillarBenchmarkExercise } from '../engine/strengthStandards';
import { BiometricLog, ExerciseDefinition, GoalPhase, StrengthPillar, UserProfile, WorkoutSession } from '../engine/types';
import { calculateWci } from '../engine/wci';
import { daysBetweenLocalDates, localDateString, parseLocalDate } from '../utils/date';

export interface ProgressPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ProgressChart {
  id: string;
  title: string;
  category?: 'scale' | 'tape';
  /** Main line, oldest first. */
  points: ProgressPoint[];
  /** Faint line underneath, e.g. daily weigh-ins under the 7-day average. */
  secondary?: ProgressPoint[];
  lastUpdated?: string;
  summary: string;
  /** Formats a value for axis labels, e.g. "81.2 kg". */
  format: (value: number) => string;
}

export type ChartTimeline = '1W' | '1M' | '3M' | '1Y';

export const DEFAULT_CHART_TIMELINE: ChartTimeline = '1Y';

export interface ChartTimelineOption {
  id: ChartTimeline;
  label: string;
  ariaLabel: string;
  days: number;
  weeks: number;
  windowText: string;
}

export const CHART_TIMELINES: readonly ChartTimelineOption[] = [
  { id: '1W', label: '1W', ariaLabel: 'Last week', days: 7, weeks: 1, windowText: 'the last week' },
  { id: '1M', label: '1M', ariaLabel: 'Last month', days: 30, weeks: 4, windowText: 'the last month' },
  { id: '3M', label: '3M', ariaLabel: 'Last quarter', days: 90, weeks: 13, windowText: 'the last 3 months' },
  { id: '1Y', label: '1Y', ariaLabel: 'Last year', days: 365, weeks: 52, windowText: 'the last year' },
];

export function getTimelineMeta(timeline: ChartTimeline): ChartTimelineOption {
  return CHART_TIMELINES.find((t) => t.id === timeline) ?? CHART_TIMELINES[3];
}

/** Local YYYY-MM-DD cutoff (inclusive) for a timeline ending on `today`. */
export function timelineCutoffDate(timeline: ChartTimeline, today = localDateString()): string {
  const meta = getTimelineMeta(timeline);
  const start = parseLocalDate(today);
  start.setDate(start.getDate() - (meta.days - 1));
  return localDateString(start);
}

/** Filters a ProgressChart to the chosen timeline and updates its summary to match the window. */
export function filterChartByTimeline(
  chart: ProgressChart,
  timeline: ChartTimeline,
  today = localDateString(),
): ProgressChart {
  const cutoff = timelineCutoffDate(timeline, today);
  const points = chart.points.filter((p) => p.date >= cutoff);
  const secondary = chart.secondary?.filter((p) => p.date >= cutoff);
  const unchanged =
    points.length === chart.points.length &&
    (!chart.secondary || (secondary?.length ?? 0) === chart.secondary.length);
  if (chart.points.length === 0 || unchanged) {
    return chart;
  }

  const meta = getTimelineMeta(timeline);
  let summary: string;
  if (points.length === 0) {
    summary = `No ${chart.title.toLowerCase()} entries in ${meta.windowText}. Select a wider range to see earlier history.`;
  } else if (points.length === 1) {
    summary = `${chart.title} in ${meta.windowText}: ${chart.format(points[0].value)} on ${shortDate(points[0].date)}.`;
  } else {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(last.value - first.value) < 1e-9) {
      summary = `${chart.title} stayed at ${chart.format(last.value)} across ${points.length} entries in ${meta.windowText}.`;
    } else {
      summary = `${chart.title}: ${chart.format(first.value)} on ${shortDate(first.date)} to ${chart.format(last.value)} on ${shortDate(last.date)} across ${points.length} entries in ${meta.windowText}.`;
    }
  }

  return {
    ...chart,
    points,
    secondary,
    summary,
  };
}

/** Rebases a time-ordered index series so the first point inside a window starts at 100. */
export function rebaseIndexSeries(points: ProgressPoint[]): ProgressPoint[] {
  if (points.length < 2) return [];
  const base = points[0].value;
  if (!Number.isFinite(base) || base <= 0) return [];
  return points.map((p) => ({
    date: p.date,
    value: round1((p.value / base) * 100),
  }));
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

const measured = (logs: BiometricLog[], pick: (l: BiometricLog) => number | undefined): ProgressPoint[] => {
  const byDate = new Map<string, number>();
  for (const l of logs) {
    const v = pick(l) ?? 0;
    if (v > 0 && l.date) byDate.set(l.date, v);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/** Healthy weekly rate of weight change for each goal, as % of bodyweight (Helms et al.; Iraki et al., 2019). */
const GOAL_RATE: Record<GoalPhase, { min: number; max: number; label: string }> = {
  'Lean Bulk': { min: 0.25, max: 0.5, label: 'Build Muscle (gaining 0.25–0.5% a week)' },
  'Cut / Recomp': { min: -1, max: -0.5, label: 'Lose Fat (losing 0.5–1% a week)' },
  Maingain: { min: -0.25, max: 0.25, label: 'Stay Lean (within 0.25% a week)' },
};

export interface WeightPace {
  /** The latest 7-day average. */
  averageKg: number;
  perWeekKg: number;
  /** Weekly change as a share of bodyweight. */
  perWeekPct: number;
  direction: 'gaining' | 'losing' | 'steady';
  /** Against the pace that suits the athlete's goal. */
  pace: 'on' | 'faster' | 'slower';
  goalLabel: string;
}

/**
 * Weekly weight pace from the 7-day average over the last 2–4 weeks, against the athlete's goal.
 * Null until there is a week of weigh-ins (a pace from less is water, food and timing).
 */
export function weightPace(biometrics: BiometricLog[], goalPhase: GoalPhase | undefined): WeightPace | null {
  const points = calculateEmaSeries(biometrics).map((e) => ({ date: e.date, value: e.ema }));
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  if (daysBetweenLocalDates(points[0].date, last.date) < 7) return null;
  const ref = [...points].reverse().find((p) => daysBetweenLocalDates(p.date, last.date) >= 14) ?? points[0];
  const days = Math.max(1, daysBetweenLocalDates(ref.date, last.date));
  const perWeekKg = ((last.value - ref.value) / days) * 7;
  const perWeekPct = (perWeekKg / last.value) * 100;
  const goal = GOAL_RATE[goalPhase ?? 'Maingain'] ?? GOAL_RATE.Maingain;
  return {
    averageKg: last.value,
    perWeekKg,
    perWeekPct,
    direction: Math.abs(perWeekKg) < 0.05 ? 'steady' : perWeekKg > 0 ? 'gaining' : 'losing',
    pace: perWeekPct >= goal.min && perWeekPct <= goal.max ? 'on' : perWeekPct > goal.max ? 'faster' : 'slower',
    goalLabel: goal.label,
  };
}

export function buildCompositionCharts(input: {
  biometrics: BiometricLog[];
  profile: UserProfile;
  fmt: ProgressFormatters;
  now?: Date;
}): ProgressChart[] {
  const { biometrics, profile, fmt } = input;
  const charts: ProgressChart[] = [];
  const pct = (v: number) => `${round1(v)}%`;
  const heightM = profile.measuredHeightCm ? profile.measuredHeightCm / 100 : 0;

  // 1. Weight: 7-day average with daily weigh-ins underneath.
  const ema = calculateEmaSeries(biometrics);
  const emaPoints = ema.map((e) => ({ date: e.date, value: e.ema }));
  let weightSummary = 'Log your weight each morning, after the toilet and before eating, to start this chart.';
  if (emaPoints.length === 1) {
    weightSummary = `First weigh-in: ${fmt.weight(emaPoints[0].value)}. Weigh in each morning to see your 7-day average.`;
  } else if (emaPoints.length >= 2 && daysBetweenLocalDates(emaPoints[0].date, emaPoints[emaPoints.length - 1].date) < 7) {
    // A weekly pace from less than a week of weigh-ins is noise (water, food, timing).
    const last = emaPoints[emaPoints.length - 1];
    weightSummary = `Your 7-day average is ${fmt.weight(last.value)}. Keep weighing in each morning; your weekly pace appears after a week.`;
  } else if (emaPoints.length >= 2) {
    const pace = weightPace(biometrics, profile.goalPhase)!;
    const direction =
      pace.direction === 'steady' ? 'holding steady' : `${pace.perWeekKg > 0 ? 'up' : 'down'} ${(fmt.weightPrecise ?? fmt.weight)(Math.abs(pace.perWeekKg))} a week`;
    weightSummary =
      `Your 7-day average is ${fmt.weight(pace.averageKg)}, ${direction} (${round1(Math.abs(pace.perWeekPct))}% of your weight). ` +
      (pace.pace === 'on' ? `That's on pace for ${pace.goalLabel}.` : pace.pace === 'faster' ? `That's faster than ${pace.goalLabel}.` : `That's slower than ${pace.goalLabel}.`);
  }
  charts.push({
    id: 'bodyweight',
    title: 'Weight',
    category: 'scale',
    points: emaPoints,
    secondary: ema.map((e) => ({ date: e.date, value: e.weight })),
    lastUpdated: emaPoints[emaPoints.length - 1]?.date,
    summary: weightSummary,
    format: fmt.weight,
  });

  // 2. BMI (from RENPHO scale or calculated from weight + entered height)
  const bmiPoints = measured(biometrics, (l) => {
    if (l.bmi && l.bmi > 0) return round1(l.bmi);
    const entryHeightM = l.heightCm && l.heightCm > 0 ? l.heightCm / 100 : heightM;
    if (entryHeightM > 0 && l.bodyweightKg > 0) {
      return round1(l.bodyweightKg / (entryHeightM * entryHeightM));
    }
    return undefined;
  });
  charts.push({
    id: 'bmi',
    title: 'BMI',
    category: 'scale',
    points: bmiPoints,
    lastUpdated: bmiPoints[bmiPoints.length - 1]?.date,
    summary:
      changeSummary('BMI', bmiPoints, (v) => `${round1(v)}`, (d) => `${round1(d)}`) ||
      'Connect your RENPHO scale or enter your weight and height to track Body Mass Index (BMI) over time.',
    format: (v) => `${round1(v)}`,
  });

  // 3. Body fat percentage
  const bodyFat = measured(biometrics, (l) => l.bodyFatPct);
  charts.push({
    id: 'body-fat',
    title: 'Body fat',
    category: 'scale',
    points: bodyFat,
    lastUpdated: bodyFat[bodyFat.length - 1]?.date,
    summary:
      changeSummary('Body fat', bodyFat, pct, (d) => `${round1(d)} ${round1(d) === 1 ? 'point' : 'points'}`) ||
      'Log your body fat from a smart scale, calipers or a scan to start this chart. Use the same method each time.',
    format: pct,
  });

  // 4. Fat free mass (Lean mass)
  const lean = biometrics
    .filter((l) => (l.fatFreeMassKg ?? 0) > 0 || ((l.bodyFatPct ?? 0) > 0 && l.bodyweightKg > 0))
    .map((l) => ({
      date: l.date,
      value:
        (l.fatFreeMassKg ?? 0) > 0
          ? round1(l.fatFreeMassKg as number)
          : round1(l.bodyweightKg * (1 - (l.bodyFatPct as number) / 100)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  charts.push({
    id: 'lean-mass',
    title: 'Fat free mass',
    category: 'scale',
    points: lean,
    lastUpdated: lean[lean.length - 1]?.date,
    summary:
      changeSummary('Fat free mass (everything but fat)', lean, fmt.weight, fmt.weight) ||
      "Log your weight and body fat on the same day or step onto your RENPHO scale to see your fat-free mass: everything that isn't fat.",
    format: fmt.weight,
  });

  // Fat-free mass index: lean mass for your height (Kouri et al., 1995). Needs a real height.
  const ffmi = heightM > 0 ? lean.map((p) => ({ date: p.date, value: round1(p.value / (heightM * heightM) + 6.1 * (1.8 - heightM)) })) : [];
  const typical = profile.gender === 'female' ? 15 : 19;
  charts.push({
    id: 'ffmi',
    title: 'Muscle for your height',
    category: 'scale',
    points: ffmi,
    lastUpdated: ffmi[ffmi.length - 1]?.date,
    summary: !heightM
      ? 'Add your height when you log measurements to see how much muscle you carry for your height (FFMI).'
      : ffmi.length === 0
      ? 'Log your body fat to see how much muscle you carry for your height (FFMI).'
      : `${changeSummary('Your FFMI', ffmi, (v) => `${round1(v)}`, (d) => `${round1(d)}`)} For reference, untrained ${profile.gender === 'female' ? 'women' : 'men'} average about ${typical}.`,
    format: (v) => `${round1(v)}`,
  });

  // 5. Subcutaneous fat
  const subcutaneousFat = measured(biometrics, (l) => l.subcutaneousFatPct);
  charts.push({
    id: 'subcutaneous-fat',
    title: 'Subcutaneous fat',
    category: 'scale',
    points: subcutaneousFat,
    lastUpdated: subcutaneousFat[subcutaneousFat.length - 1]?.date,
    summary:
      changeSummary('Subcutaneous fat', subcutaneousFat, pct, (d) => `${round1(d)} ${round1(d) === 1 ? 'point' : 'points'}`) ||
      'Step onto your RENPHO scale or enter subcutaneous fat % to track fat stored directly beneath the skin.',
    format: pct,
  });

  // 6. Visceral fat
  const visceralFat = measured(biometrics, (l) => l.visceralFat);
  charts.push({
    id: 'visceral-fat',
    title: 'Visceral fat',
    category: 'scale',
    points: visceralFat,
    lastUpdated: visceralFat[visceralFat.length - 1]?.date,
    summary:
      changeSummary('Visceral fat index', visceralFat, (v) => `${round1(v)}`, (d) => `${round1(d)}`) ||
      'Step onto your RENPHO scale or enter your visceral fat rating (healthy range is 1–12) to track deep abdominal fat.',
    format: (v) => `${round1(v)}`,
  });

  // 7. Body water
  const bodyWater = measured(biometrics, (l) => l.bodyWaterPct);
  charts.push({
    id: 'body-water',
    title: 'Body water',
    category: 'scale',
    points: bodyWater,
    lastUpdated: bodyWater[bodyWater.length - 1]?.date,
    summary:
      changeSummary('Body water', bodyWater, pct, (d) => `${round1(d)} ${round1(d) === 1 ? 'point' : 'points'}`) ||
      'Step onto your RENPHO scale or enter body water % to track total cellular hydration over time.',
    format: pct,
  });

  // 8. Skeletal muscle mass
  const skeletalMuscle = measured(biometrics, (l) => l.skeletalMuscleMassKg);
  charts.push({
    id: 'skeletal-muscle-mass',
    title: 'Skeletal muscle mass',
    category: 'scale',
    points: skeletalMuscle,
    lastUpdated: skeletalMuscle[skeletalMuscle.length - 1]?.date,
    summary:
      changeSummary('Skeletal muscle mass', skeletalMuscle, fmt.weight, fmt.weight) ||
      'Step onto your RENPHO scale or log skeletal muscle mass to track contractile muscle tissue attached to your skeleton.',
    format: fmt.weight,
  });

  // 9. Muscle mass
  const muscleMass = measured(biometrics, (l) => l.muscleMassKg);
  charts.push({
    id: 'muscle-mass',
    title: 'Muscle mass',
    category: 'scale',
    points: muscleMass,
    lastUpdated: muscleMass[muscleMass.length - 1]?.date,
    summary:
      changeSummary('Total muscle mass', muscleMass, fmt.weight, fmt.weight) ||
      'Step onto your RENPHO scale or log total muscle mass (skeletal and smooth muscle combined) to track long-term growth.',
    format: fmt.weight,
  });

  // 10. Bone mass
  const boneMass = measured(biometrics, (l) => l.boneMassKg);
  charts.push({
    id: 'bone-mass',
    title: 'Bone mass',
    category: 'scale',
    points: boneMass,
    lastUpdated: boneMass[boneMass.length - 1]?.date,
    summary:
      changeSummary('Bone mass', boneMass, (fmt.weightPrecise ?? fmt.weight), (fmt.weightPrecise ?? fmt.weight)) ||
      'Step onto your RENPHO scale or log bone mineral mass to track skeletal mineral density over time.',
    format: fmt.weightPrecise ?? fmt.weight,
  });

  // 11. Protein mass
  const proteinMass = measured(biometrics, (l) => l.proteinMassKg);
  charts.push({
    id: 'protein-mass',
    title: 'Protein mass',
    category: 'scale',
    points: proteinMass,
    lastUpdated: proteinMass[proteinMass.length - 1]?.date,
    summary:
      changeSummary('Protein mass', proteinMass, fmt.weight, fmt.weight) ||
      'Step onto your RENPHO scale or log protein mass to track structural and contractile cellular protein.',
    format: fmt.weight,
  });

  // 12. Basal metabolic rate (BMR)
  const bmrPoints = measured(biometrics, (l) => l.bmrKcal);
  charts.push({
    id: 'bmr',
    title: 'Basal metabolic rate',
    category: 'scale',
    points: bmrPoints,
    lastUpdated: bmrPoints[bmrPoints.length - 1]?.date,
    summary:
      changeSummary('Basal metabolic rate', bmrPoints, (v) => `${Math.round(v)} kcal`, (d) => `${Math.round(d)} kcal`) ||
      'Step onto your RENPHO scale or log BMR to track daily resting energy expenditure in kcal/day.',
    format: (v) => `${Math.round(v)} kcal`,
  });

  // 13. Metabolic age
  const metabolicAge = measured(biometrics, (l) => l.metabolicAge);
  charts.push({
    id: 'metabolic-age',
    title: 'Metabolic age',
    category: 'scale',
    points: metabolicAge,
    lastUpdated: metabolicAge[metabolicAge.length - 1]?.date,
    summary:
      changeSummary('Metabolic age', metabolicAge, (v) => `${Math.round(v)} yrs`, (d) => `${Math.round(d)} yrs`) ||
      'Step onto your RENPHO scale or log metabolic age to compare your basal metabolic efficiency against age norms.',
    format: (v) => `${Math.round(v)} yrs`,
  });

  // 12 Tape Measure Sites (in canonical RENPHO order: neck, shoulder, chest, waist, abdomen, hip, bicep left/right, thigh left/right, calf left/right)
  const neck = measured(biometrics, (l) => l.neckCm);
  charts.push({
    id: 'neck',
    title: 'Neck',
    category: 'tape',
    points: neck,
    lastUpdated: neck[neck.length - 1]?.date,
    summary:
      changeSummary('Your neck', neck, fmt.length, fmt.length) ||
      'Measure just below the larynx with your shoulders relaxed to track neck circumference over time.',
    format: fmt.length,
  });

  const shoulders = measured(biometrics, (l) => l.shouldersCm);
  charts.push({
    id: 'shoulders',
    title: 'Shoulder',
    category: 'tape',
    points: shoulders,
    lastUpdated: shoulders[shoulders.length - 1]?.date,
    summary:
      changeSummary('Your shoulders', shoulders, fmt.length, fmt.length) ||
      'Measure around the widest point of both deltoids, relaxed, to track shoulder width over time.',
    format: fmt.length,
  });

  const chest = measured(biometrics, (l) => l.chestCm);
  charts.push({
    id: 'chest',
    title: 'Chest',
    category: 'tape',
    points: chest,
    lastUpdated: chest[chest.length - 1]?.date,
    summary: changeSummary('Your chest', chest, fmt.length, fmt.length) || 'Measure around the fullest part of your chest, relaxed, to track upper-body growth.',
    format: fmt.length,
  });

  const waist = measured(biometrics, (l) => l.waistCm);
  charts.push({
    id: 'waist',
    title: 'Waist',
    category: 'tape',
    points: waist,
    lastUpdated: waist[waist.length - 1]?.date,
    summary:
      changeSummary('Your waist', waist, fmt.length, fmt.length) ||
      "Measure your waist at the narrowest part of your torso, relaxed, after breathing out. A shrinking waist with steady weight means you're losing fat and building muscle.",
    format: fmt.length,
  });

  const whtr = heightM > 0 ? waist.map((p) => ({ date: p.date, value: Math.round((p.value / (heightM * 100)) * 100) / 100 })) : [];
  const lastWhtr = whtr[whtr.length - 1]?.value;
  charts.push({
    id: 'waist-to-height',
    title: 'Waist-to-height',
    category: 'tape',
    points: whtr,
    lastUpdated: whtr[whtr.length - 1]?.date,
    summary: !heightM
      ? 'Add your height when you log measurements to see your waist-to-height ratio. Under 0.5 is the healthy range.'
      : whtr.length === 0
      ? 'Log your waist to see your waist-to-height ratio. Under 0.5 is the healthy range.'
      : `Your waist is ${lastWhtr} of your height. ${lastWhtr !== undefined && lastWhtr < 0.5 ? "That's in the healthy range (under 0.5)." : 'The healthy range is under 0.5.'}`,
    format: (v) => v.toFixed(2),
  });

  const abdomen = measured(biometrics, (l) => l.abdomenCm);
  charts.push({
    id: 'abdomen',
    title: 'Abdomen',
    category: 'tape',
    points: abdomen,
    lastUpdated: abdomen[abdomen.length - 1]?.date,
    summary:
      changeSummary('Your abdomen', abdomen, fmt.length, fmt.length) ||
      'Measure horizontally across the navel (belly button), relaxed after exhaling, to track midsection reduction.',
    format: fmt.length,
  });

  const hips = measured(biometrics, (l) => l.hipsCm);
  charts.push({
    id: 'hips',
    title: 'Hip',
    category: 'tape',
    points: hips,
    lastUpdated: hips[hips.length - 1]?.date,
    summary:
      changeSummary('Your hips', hips, fmt.length, fmt.length) ||
      'Measure around the fullest part of your hips and glutes with your feet together to track lower-body changes.',
    format: fmt.length,
  });

  const bicepLeft = measured(biometrics, (l) => l.bicepLeftCm);
  charts.push({
    id: 'bicep-left',
    title: 'Bicep left',
    category: 'tape',
    points: bicepLeft,
    lastUpdated: bicepLeft[bicepLeft.length - 1]?.date,
    summary:
      changeSummary('Your left bicep', bicepLeft, fmt.length, fmt.length) ||
      'Measure around the peak of your flexed left bicep to track left upper-arm growth and left-right symmetry.',
    format: fmt.length,
  });

  const bicepRight = measured(biometrics, (l) => l.bicepRightCm ?? l.armCm);
  charts.push({
    id: 'bicep-right',
    title: 'Bicep right',
    category: 'tape',
    points: bicepRight,
    lastUpdated: bicepRight[bicepRight.length - 1]?.date,
    summary:
      changeSummary('Your right bicep', bicepRight, fmt.length, fmt.length) ||
      'Measure around the peak of your flexed right bicep to track right upper-arm growth and left-right symmetry.',
    format: fmt.length,
  });

  const thighLeft = measured(biometrics, (l) => l.thighLeftCm);
  charts.push({
    id: 'thigh-left',
    title: 'Thigh left',
    category: 'tape',
    points: thighLeft,
    lastUpdated: thighLeft[thighLeft.length - 1]?.date,
    summary:
      changeSummary('Your left thigh', thighLeft, fmt.length, fmt.length) ||
      'Measure midway between your left hip crease and kneecap while standing to track left quad and hamstring growth.',
    format: fmt.length,
  });

  const thighRight = measured(biometrics, (l) => l.thighRightCm ?? l.thighCm);
  charts.push({
    id: 'thigh-right',
    title: 'Thigh right',
    category: 'tape',
    points: thighRight,
    lastUpdated: thighRight[thighRight.length - 1]?.date,
    summary:
      changeSummary('Your right thigh', thighRight, fmt.length, fmt.length) ||
      'Measure midway between your right hip crease and kneecap while standing to track right quad and hamstring growth.',
    format: fmt.length,
  });

  const calfLeft = measured(biometrics, (l) => l.calfLeftCm);
  charts.push({
    id: 'calf-left',
    title: 'Calf left',
    category: 'tape',
    points: calfLeft,
    lastUpdated: calfLeft[calfLeft.length - 1]?.date,
    summary:
      changeSummary('Your left calf', calfLeft, fmt.length, fmt.length) ||
      'Measure around the widest point of your left calf while standing to track left lower-leg hypertrophy.',
    format: fmt.length,
  });

  const calfRight = measured(biometrics, (l) => l.calfRightCm ?? l.calfCm);
  charts.push({
    id: 'calf-right',
    title: 'Calf right',
    category: 'tape',
    points: calfRight,
    lastUpdated: calfRight[calfRight.length - 1]?.date,
    summary:
      changeSummary('Your right calf', calfRight, fmt.length, fmt.length) ||
      'Measure around the widest point of your right calf while standing to track right lower-leg hypertrophy.',
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
  biometrics?: BiometricLog[];
  fmt: ProgressFormatters;
}): ProgressChart[] {
  const { profile, bodyweightKg, biometrics, fmt } = input;
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  const done = input.workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  const charts: ProgressChart[] = [];

  // Estimated max per movement pattern (best benchmark lift each session).
  for (const { pillar, title } of PILLARS) {
    const byDate = new Map<string, number>();
    let usedBodyweight = false;
    for (const w of done) {
      const sessionBw = emaLookup ? emaLookup(w.date, 0) : bodyweightKg;
      for (const ex of w.exercises) {
        if (ex.pillar !== pillar || !isPillarBenchmarkExercise(ex)) continue;
        const usesBw =
          ex.equipment === 'bodyweight' || ex.equipment === 'weighted_bodyweight' || Boolean(ex.isWeightedCalisthenic);
        if (usesBw && sessionBw <= 0) continue;
        for (const s of ex.sets.filter(isWorkingDone)) {
          const e1rm = calculateE1RM(
            s.actualWeightKg ?? s.targetWeightKg,
            s.actualReps ?? 0,
            s.actualRir ?? s.targetRir ?? 2,
            ex.equipment,
            ex.isRdl,
            ex.isWeightedCalisthenic,
            sessionBw,
            ex.exerciseId,
            ex.pillar
          );
          if (e1rm > (byDate.get(w.date) ?? 0)) {
            byDate.set(w.date, Math.round(e1rm * 10) / 10);
            if (usesBw) usedBodyweight = true;
          }
        }
      }
    }
    const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    if (points.length === 0) continue;
    const last = points[points.length - 1];
    const first = points[0];
    const change = first.value > 0 ? Math.round(((last.value - first.value) / first.value) * 1000) / 10 : 0;
    const maxLabel = usedBodyweight ? 'estimated one-rep max (bodyweight + added weight)' : 'estimated one-rep max';
    charts.push({
      id: `strength-${pillar}`,
      title,
      points,
      lastUpdated: last.date,
      summary:
        points.length === 1
          ? `Your ${maxLabel} is ${fmt.weight(last.value)}. This is your starting point.`
          : `Your ${maxLabel} is ${fmt.weight(last.value)}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% since ${shortDate(first.date)} across ${points.length} sessions.`,
      format: fmt.weight,
    });
  }

  // Weekly hard sets: completed working sets within 3 reps of failure (Schoenfeld et al., 2017; matches countHardSets).
  const weekly = new Map<string, number>();
  for (const w of done) {
    const sets = w.exercises.reduce((n, ex) => n + ex.sets.filter((s) => isWorkingDone(s) && (s.actualRir ?? s.targetRir ?? 2) <= 3).length, 0);
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

/** Per-exercise progression chart for custom Progress widgets: E1RM for loaded/weighted lifts, best reps for unloaded bodyweight moves. */
export function buildExerciseProgressChart(input: {
  exercise: Pick<ExerciseDefinition, 'id' | 'name' | 'equipment' | 'isRdl' | 'isWeightedCalisthenic'>;
  workouts: WorkoutSession[];
  bodyweightKg: number;
  biometrics?: BiometricLog[];
  fmt: ProgressFormatters;
}): ProgressChart {
  const { exercise, workouts, bodyweightKg, biometrics, fmt } = input;
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  const done = workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  const timedEntry = done
    .flatMap((w) => w.exercises)
    .find((e) => e.exerciseId === exercise.id && (e.durationSeconds || e.durationMinutesRange));

  if (timedEntry) {
    const byDate = new Map<string, number>();
    for (const w of done) {
      const ex = w.exercises.find((e) => e.exerciseId === exercise.id && e.sets.some((s) => s.completed));
      if (!ex) continue;
      const secs = ex.sets.reduce(
        (m, s) => Math.max(m, s.actualReps && ex.repTargetType === 'duration' ? s.actualReps : ex.durationSeconds ?? 0),
        0
      );
      if (secs > 0) byDate.set(w.date, Math.max(byDate.get(w.date) ?? 0, secs));
    }
    const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    const formatSec = (v: number) => `${Math.round(v)}s`;
    const last = points[points.length - 1];
    return {
      id: exercise.id,
      title: exercise.name,
      points,
      lastUpdated: last?.date,
      summary:
        points.length === 0
          ? `Log ${exercise.name} in a workout to track your hold or duration over time.`
          : changeSummary(exercise.name, points, formatSec, formatSec),
      format: formatSec,
    };
  }

  const isCalisthenic =
    exercise.equipment === 'bodyweight' ||
    exercise.equipment === 'weighted_bodyweight' ||
    Boolean(exercise.isWeightedCalisthenic);
  let hasExternalLoad = false;
  const matchingEntries: { date: string; ex: WorkoutSession['exercises'][number] }[] = [];
  for (const w of done) {
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exercise.id) continue;
      const sets = ex.sets.filter(isWorkingDone);
      if (sets.length === 0) continue;
      if (sets.some((s) => (s.actualWeightKg ?? s.targetWeightKg ?? 0) > 0)) {
        hasExternalLoad = true;
      }
      matchingEntries.push({ date: w.date, ex });
    }
  }

  if (isCalisthenic && !hasExternalLoad) {
    const byDate = new Map<string, number>();
    for (const { date, ex } of matchingEntries) {
      for (const s of ex.sets.filter(isWorkingDone)) {
        const reps = s.actualReps ?? 0;
        if (reps > (byDate.get(date) ?? 0)) byDate.set(date, reps);
      }
    }
    const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    const last = points[points.length - 1];
    const first = points[0];
    const formatReps = (v: number) => `${Math.round(v)} reps`;
    return {
      id: exercise.id,
      title: exercise.name,
      points,
      lastUpdated: last?.date,
      summary:
        points.length === 0
          ? `Log ${exercise.name} in a workout to track your best set reps over time.`
          : points.length === 1
          ? `Best set is ${formatReps(last.value)}. This is your starting point.`
          : `Best set is ${formatReps(last.value)}, ${last.value >= first.value ? 'up' : 'down'} ${Math.abs(Math.round(last.value - first.value))} reps since ${shortDate(first.date)} across ${points.length} sessions.`,
      format: formatReps,
    };
  }

  // Calisthenic exercises with added external load but no logged bodyweight yet: chart added weight rather than fabricating an 80 kg bodyweight.
  const hasRealBw = emaLookup ? matchingEntries.some(({ date }) => emaLookup(date, 0) > 0) : bodyweightKg > 0;
  if (isCalisthenic && !hasRealBw) {
    const byDate = new Map<string, number>();
    for (const { date, ex } of matchingEntries) {
      for (const s of ex.sets.filter(isWorkingDone)) {
        const added = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        if (added > (byDate.get(date) ?? 0)) byDate.set(date, Math.round(added * 10) / 10);
      }
    }
    const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    const last = points[points.length - 1];
    const first = points[0];
    const delta = last && first ? Math.round((last.value - first.value) * 10) / 10 : 0;
    return {
      id: exercise.id,
      title: exercise.name,
      points,
      lastUpdated: last?.date,
      summary:
        points.length === 0
          ? `Log ${exercise.name} in a workout to track your progress over time.`
          : points.length === 1
          ? `Best added weight is ${fmt.weight(last.value)}. Log your bodyweight to see total estimated one-rep max.`
          : `Best added weight is ${fmt.weight(last.value)}, ${delta >= 0 ? 'up' : 'down'} ${(fmt.weightPrecise ?? fmt.weight)(Math.abs(delta))} since ${shortDate(first.date)}. Log your bodyweight to see total estimated one-rep max.`,
      format: fmt.weight,
    };
  }

  const byDate = new Map<string, number>();
  for (const { date, ex } of matchingEntries) {
    const sessionBw = emaLookup ? emaLookup(date, 0) : bodyweightKg;
    for (const s of ex.sets.filter(isWorkingDone)) {
      const e1rm = calculateE1RM(
        s.actualWeightKg ?? s.targetWeightKg,
        s.actualReps ?? 0,
        s.actualRir ?? s.targetRir ?? 2,
        ex.equipment,
        ex.isRdl,
        ex.isWeightedCalisthenic,
        sessionBw,
        ex.exerciseId,
        ex.pillar
      );
      if (e1rm > (byDate.get(date) ?? 0)) byDate.set(date, Math.round(e1rm * 10) / 10);
    }
  }
  const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? Math.round((last.value - first.value) * 10) / 10 : 0;
  const maxLabel = isCalisthenic ? 'Estimated one-rep max (bodyweight + added weight)' : 'Estimated one-rep max';
  return {
    id: exercise.id,
    title: exercise.name,
    points,
    lastUpdated: last?.date,
    summary:
      points.length === 0
        ? `Log ${exercise.name} in a workout to track your estimated one-rep max over time.`
        : points.length === 1
        ? `${maxLabel} is ${fmt.weight(last.value)}. This is your starting point.`
        : `${maxLabel} is ${fmt.weight(last.value)}, ${delta >= 0 ? 'up' : 'down'} ${(fmt.weightPrecise ?? fmt.weight)(Math.abs(delta))} since ${shortDate(first.date)} across ${points.length} sessions.`,
    format: fmt.weight,
  };
}

/** Average daily step count across logged days in the last `days` calendar days (or all logged if within window). */
export function averageRecentSteps(biometrics: BiometricLog[], days = 7, today: string = localDateString()): number | null {
  const cutoffMs = parseLocalDate(today).getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  const recent = biometrics.filter((b) => (b.steps || 0) > 0 && parseLocalDate(b.date).getTime() >= cutoffMs && b.date <= today);
  if (!recent.length) return null;
  const total = recent.reduce((sum, b) => sum + b.steps, 0);
  return Math.round(total / recent.length);
}

/** Daily steps progression chart built strictly from recorded biometric step entries. */
export function buildStepsChart(biometrics: BiometricLog[], today: string = localDateString()): ProgressChart {
  const points = measured(biometrics, (l) => l.steps);
  const last = points[points.length - 1];
  const avg7 = averageRecentSteps(biometrics, 7, today);
  const formatSteps = (v: number) => `${Math.round(v).toLocaleString()} steps`;
  return {
    id: 'steps',
    title: 'Daily steps',
    points,
    lastUpdated: last?.date,
    summary:
      points.length === 0
        ? 'No step counts recorded yet. Connect Health Connect in Settings or sync your watch to see your daily steps.'
        : points.length === 1
        ? `${Math.round(last.value).toLocaleString()} steps recorded on ${shortDate(last.date)}.`
        : `${Math.round(last.value).toLocaleString()} steps on ${shortDate(last.date)}${avg7 !== null ? ` • 7-day average ${avg7.toLocaleString()} steps` : ''}.`,
    format: formatSteps,
  };
}

export interface WhoopSnapshot {
  recoveryScore?: number;
  recoveryDate?: string;
  dayStrain?: number;
  dayStrainDate?: string;
  workoutStrain?: number;
  workoutStrainDate?: string;
  hrvRmssd?: number;
  restingHr?: number;
  sleepHours?: number;
  sleepPerformance?: number;
  sleepEfficiency?: number;
  respiratoryRate?: number;
  spo2?: number;
  skinTemp?: number;
  latestDate?: string;
}

function workoutStrainPoints(biometrics: BiometricLog[], workouts: WorkoutSession[]): ProgressPoint[] {
  const byDate = new Map<string, number>();
  for (const l of biometrics) {
    if (typeof l.workoutStrain === 'number' && l.workoutStrain > 0 && l.date) {
      byDate.set(l.date, Math.max(byDate.get(l.date) ?? 0, round1(l.workoutStrain)));
    }
  }
  for (const w of workouts) {
    if (!w.completed || typeof w.whoopStrain !== 'number' || w.whoopStrain <= 0 || !w.date) continue;
    byDate.set(w.date, Math.max(byDate.get(w.date) ?? 0, round1(w.whoopStrain)));
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Latest real Whoop measurements (shared by the Progress card and Whoop detail screen). */
export function buildWhoopSnapshot(biometrics: BiometricLog[], workouts: WorkoutSession[]): WhoopSnapshot {
  const recoveryPts = measured(biometrics, (l) => (typeof l.recoveryScore === 'number' && l.recoveryScore > 0 ? l.recoveryScore : undefined));
  const strainPts = measured(biometrics, (l) => (typeof l.strain === 'number' && l.strain > 0 ? round1(l.strain) : undefined));
  const wStrainPts = workoutStrainPoints(biometrics, workouts);
  const hrvPts = measured(biometrics, (l) => l.hrvRmssd);
  const rhrPts = measured(biometrics, (l) => l.restingHr);
  const sleepPts = measured(biometrics, (l) => (l.sleepHours > 0 ? round1(l.sleepHours) : undefined));
  const sleepPerfPts = measured(biometrics, (l) => (typeof l.sleepPerformance === 'number' && l.sleepPerformance > 0 ? l.sleepPerformance : undefined));
  const sleepEffPts = measured(biometrics, (l) => (typeof l.sleepEfficiency === 'number' && l.sleepEfficiency > 0 ? l.sleepEfficiency : undefined));
  const respPts = measured(biometrics, (l) => (typeof l.respiratoryRate === 'number' && l.respiratoryRate > 0 ? round1(l.respiratoryRate) : undefined));
  const spo2Pts = measured(biometrics, (l) => (typeof l.spo2 === 'number' && l.spo2 > 0 ? round1(l.spo2) : undefined));
  const skinPts = measured(biometrics, (l) => (typeof l.skinTemp === 'number' && l.skinTemp > 0 ? round1(l.skinTemp) : undefined));

  const lastOf = (pts: ProgressPoint[]) => (pts.length > 0 ? pts[pts.length - 1] : undefined);
  const rec = lastOf(recoveryPts);
  const day = lastOf(strainPts);
  const work = lastOf(wStrainPts);
  const allDates = [rec?.date, day?.date, work?.date, lastOf(hrvPts)?.date, lastOf(rhrPts)?.date, lastOf(sleepPts)?.date].filter(
    (d): d is string => Boolean(d)
  );
  allDates.sort();

  return {
    recoveryScore: rec !== undefined ? Math.round(rec.value) : undefined,
    recoveryDate: rec?.date,
    dayStrain: day?.value,
    dayStrainDate: day?.date,
    workoutStrain: work?.value,
    workoutStrainDate: work?.date,
    hrvRmssd: lastOf(hrvPts)?.value !== undefined ? Math.round(lastOf(hrvPts)!.value) : undefined,
    restingHr: lastOf(rhrPts)?.value !== undefined ? Math.round(lastOf(rhrPts)!.value) : undefined,
    sleepHours: lastOf(sleepPts)?.value,
    sleepPerformance: lastOf(sleepPerfPts)?.value !== undefined ? Math.round(lastOf(sleepPerfPts)!.value) : undefined,
    sleepEfficiency: lastOf(sleepEffPts)?.value !== undefined ? Math.round(lastOf(sleepEffPts)!.value) : undefined,
    respiratoryRate: lastOf(respPts)?.value,
    spo2: lastOf(spo2Pts)?.value,
    skinTemp: lastOf(skinPts)?.value,
    latestDate: allDates.length > 0 ? allDates[allDates.length - 1] : undefined,
  };
}

/** Optional Whoop metric trend charts built strictly from synced Whoop biometrics and workouts. */
export function buildWhoopCharts(input: { biometrics: BiometricLog[]; workouts: WorkoutSession[] }): ProgressChart[] {
  const { biometrics, workouts } = input;
  const pct = (v: number) => `${Math.round(v)}%`;
  const strainFmt = (v: number) => `${round1(v)}`;
  const hrvFmt = (v: number) => `${Math.round(v)} ms`;
  const rhrFmt = (v: number) => `${Math.round(v)} bpm`;
  const sleepFmt = (v: number) => `${round1(v)} h`;

  const recovery = measured(biometrics, (l) => (typeof l.recoveryScore === 'number' && l.recoveryScore > 0 ? Math.round(l.recoveryScore) : undefined));
  const dayStrain = measured(biometrics, (l) => (typeof l.strain === 'number' && l.strain > 0 ? round1(l.strain) : undefined));
  const workStrain = workoutStrainPoints(biometrics, workouts);
  const hrv = measured(biometrics, (l) => (l.hrvRmssd > 0 ? Math.round(l.hrvRmssd) : undefined));
  const rhr = measured(biometrics, (l) => (l.restingHr > 0 ? Math.round(l.restingHr) : undefined));
  const sleep = measured(biometrics, (l) => (l.sleepHours > 0 ? round1(l.sleepHours) : undefined));

  return [
    {
      id: 'whoop-recovery',
      title: 'Whoop recovery',
      points: recovery,
      lastUpdated: recovery[recovery.length - 1]?.date,
      summary:
        changeSummary('Recovery score', recovery, pct, (d) => `${Math.round(d)} ${Math.round(d) === 1 ? 'point' : 'points'}`) ||
        'Sync your Whoop to track overnight recovery percentage over time.',
      format: pct,
    },
    {
      id: 'whoop-strain',
      title: 'Whoop day strain',
      points: dayStrain,
      lastUpdated: dayStrain[dayStrain.length - 1]?.date,
      summary:
        changeSummary('Day strain', dayStrain, strainFmt, strainFmt) ||
        'Sync your Whoop to track daily cardiovascular strain (0–21) over time.',
      format: strainFmt,
    },
    {
      id: 'whoop-workout-strain',
      title: 'Whoop workout strain',
      points: workStrain,
      lastUpdated: workStrain[workStrain.length - 1]?.date,
      summary:
        changeSummary('Workout strain', workStrain, strainFmt, strainFmt) ||
        'Finish a training session with Whoop connected to track session strain over time.',
      format: strainFmt,
    },
    {
      id: 'whoop-hrv',
      title: 'Whoop HRV',
      points: hrv,
      lastUpdated: hrv[hrv.length - 1]?.date,
      summary:
        changeSummary('HRV (RMSSD)', hrv, hrvFmt, hrvFmt) ||
        'Sync your Whoop to track overnight heart rate variability over time.',
      format: hrvFmt,
    },
    {
      id: 'whoop-rhr',
      title: 'Whoop resting HR',
      points: rhr,
      lastUpdated: rhr[rhr.length - 1]?.date,
      summary:
        changeSummary('Resting heart rate', rhr, rhrFmt, rhrFmt) ||
        'Sync your Whoop to track resting heart rate over time.',
      format: rhrFmt,
    },
    {
      id: 'whoop-sleep',
      title: 'Whoop sleep',
      points: sleep,
      lastUpdated: sleep[sleep.length - 1]?.date,
      summary:
        changeSummary('Sleep duration', sleep, sleepFmt, sleepFmt) ||
        'Sync your Whoop to track nightly sleep duration over time.',
      format: sleepFmt,
    },
  ];
}
