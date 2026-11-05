import { BiometricLog, Gender, StrengthPillar, StrengthTier, SubDivision, WorkoutSession } from '../engine/types';
import {
  POLIQUIN_CHIN_UP_TO_BENCH,
  PILLAR_STANDARD_SOURCE,
  StandardSource,
  evaluateStrengthStandard,
} from '../engine/strengthStandards';
import { kilgoreAgeGroup } from '../engine/kilgoreStandards';
import { calculateBestPillarDetails, isTestedBest } from './storage';
import { localDateString } from '../utils/date';

/**
 * Movement standards: each movement's level (Kilgore / Poliquin, see strengthStandards.ts), how it
 * changed over time, imbalances between movements and left/right differences.
 *
 * Sources:
 * - Kilgore L. Strength performance standards, ExRx.net (squat, deadlift, bench, press by sex,
 *   bodyweight and age group).
 * - Poliquin C. Achieving Structural Balance. T-Nation, 1999: supinated chin-up 81% of the
 *   close-grip bench 1RM (elite male athletes in upper-body sports).
 * - Grindem H et al. Br J Sports Med 2016;50:804–808 and the Delaware-Oslo return-to-sport
 *   criteria: a limb symmetry index of 90% or more. Used here as the line for flagging a weaker side.
 */

export const MOVEMENT_ORDER: StrengthPillar[] = ['Squat', 'Hinge', 'Horizontal Push', 'Vertical Push', 'Horizontal Pull', 'Vertical Pull'];

export const MOVEMENT_NAME: Record<StrengthPillar, string> = {
  Squat: 'Squat',
  Hinge: 'Deadlift & hinge',
  'Horizontal Push': 'Bench & chest press',
  'Vertical Push': 'Overhead press',
  'Horizontal Pull': 'Rows',
  'Vertical Pull': 'Chin-ups & pull-ups',
};

const LEVELS: StrengthTier[] = ['Untrained', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const SUBS: SubDivision[] = ['I', 'II', 'III', 'IV'];

/** 0–19: tier × 4 + sub-division, so levels can be compared and averaged. */
export function levelStep(tier: StrengthTier, sub: SubDivision): number {
  return LEVELS.indexOf(tier) * 4 + SUBS.indexOf(sub);
}
export function levelLabel(step: number): string {
  const s = Math.max(0, Math.min(19, Math.round(step)));
  return `${LEVELS[Math.floor(s / 4)]} ${SUBS[s % 4]}`;
}

export interface MovementLevel {
  pillar: StrengthPillar;
  name: string;
  source: StandardSource;
  logged: boolean;
  e1rmKg: number;
  /** Set on the standard lift itself, 5 reps or fewer; otherwise estimated from a similar lift. */
  tested: boolean;
  /** The exercise the best came from, e.g. "DB Romanian Deadlift". */
  bestFrom?: string;
  tier?: StrengthTier;
  subDivision?: SubDivision;
  step?: number;
  /** % of the way to the next sub-level. */
  progress?: number;
  next?: string | null;
  /** Level when this movement was first logged, and that date (only when it has changed since). */
  firstLevel?: string;
  firstLoggedOn?: string;
}

export interface Imbalance {
  id: string;
  kind: 'pull-vs-push' | 'level-gap';
  /** Plain-English finding, built only from the athlete's numbers. */
  message: string;
  /** What to do about it. */
  advice: string;
  weaker: StrengthPillar;
  stronger: StrengthPillar;
}

export interface SideDifference {
  exerciseId: string;
  exerciseName: string;
  weakerSide: 'left' | 'right';
  /** Weaker side ÷ stronger side, %. */
  symmetryPct: number;
  sessions: number;
  lastLoggedOn: string;
}

export interface MovementStandardsReport {
  /** "men, 18–39": which table the levels use. */
  tableLabel: string;
  levels: MovementLevel[];
  imbalances: Imbalance[];
  sideDifferences: SideDifference[];
}

/** The bodyweight on or before a date (the latest logged), else the fallback. */
function bodyweightOn(biometrics: BiometricLog[], date: string, fallback: number): number {
  let bw = 0;
  for (const b of biometrics) {
    if (b.bodyweightKg > 0 && b.date <= date) bw = b.bodyweightKg;
  }
  return bw || fallback;
}

export const SYMMETRY_FLAG_PCT = 90;

/** Single-arm or single-leg exercises, where each side can be logged. */
export function isUnilateralExercise(ex: { exerciseId: string; name?: string }): boolean {
  const s = `${ex.exerciseId} ${ex.name || ''}`.toLowerCase();
  return /(single[- ]?(arm|leg)|one[- ]arm|1[- ]arm|\bsa[- ]|split[- ]squat|bulgarian|lunge|pistol|step[- ]?up|unilateral|copenhagen|suitcase)/.test(s);
}
/** Poliquin's chin-up ratio is flagged when the athlete is more than 10% below it. */
const RATIO_FLAG_FRACTION = 0.9;

export function buildMovementStandards(input: {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  bodyweightKg: number;
  gender: Gender;
  age?: number;
}): MovementStandardsReport {
  const { workouts, biometrics, bodyweightKg, gender, age } = input;
  const best = calculateBestPillarDetails(workouts, bodyweightKg);
  const sexLabel = gender === 'female' ? 'women' : 'men';
  const tableLabel = `${sexLabel}, ${kilgoreAgeGroup(age).replace('-', '–')}`;

  const levels: MovementLevel[] = MOVEMENT_ORDER.map((pillar) => {
    const b = best[pillar];
    const source = PILLAR_STANDARD_SOURCE[pillar];
    const base: MovementLevel = {
      pillar,
      name: MOVEMENT_NAME[pillar],
      source,
      logged: b.e1rmKg > 0,
      e1rmKg: b.e1rmKg,
      tested: isTestedBest(pillar, b),
      bestFrom: b.exerciseName,
    };
    if (!base.logged || source === 'none') return base;
    const std = evaluateStrengthStandard(pillar, b.e1rmKg, bodyweightKg, gender, age);
    const step = levelStep(std.tier, std.subDivision);
    const topped = std.tier === 'Elite' && std.subDivision === 'IV';
    const level: MovementLevel = {
      ...base,
      tier: std.tier,
      subDivision: std.subDivision,
      step,
      progress: std.percentageProgress,
      next: topped ? null : `${std.nextTier} ${std.nextSubDivision}`,
    };

    // Over time: the level from the first week this movement was logged, at that week's bodyweight.
    const dated = workouts
      .filter((w) => w.completed && w.exercises.some((e) => e.pillar === pillar))
      .map((w) => w.completedAt || w.date)
      .filter(Boolean)
      .sort();
    if (dated.length) {
      const firstDay = dated[0].slice(0, 10);
      const weekLater = new Date(new Date(firstDay).getTime() + 7 * 86400000).toISOString();
      const early = calculateBestPillarDetails(workouts, bodyweightKg, { before: weekLater })[pillar];
      if (early.e1rmKg > 0) {
        const bwThen = bodyweightOn(biometrics, firstDay, bodyweightKg);
        const then = evaluateStrengthStandard(pillar, early.e1rmKg, bwThen, gender, age);
        if (levelStep(then.tier, then.subDivision) !== step) {
          level.firstLevel = `${then.tier} ${then.subDivision}`;
          level.firstLoggedOn = localDateString(new Date(dated[0]));
        }
      }
    }
    return level;
  });

  const byPillar = new Map(levels.map((l) => [l.pillar, l]));
  const imbalances: Imbalance[] = [];

  // Poliquin: chin-up (bodyweight included) should be about 81% of the bench.
  const bench = byPillar.get('Horizontal Push');
  const chin = byPillar.get('Vertical Pull');
  if (bench?.logged && chin?.logged && bench.e1rmKg > 0) {
    const ratio = chin.e1rmKg / bench.e1rmKg;
    if (ratio < POLIQUIN_CHIN_UP_TO_BENCH * RATIO_FLAG_FRACTION) {
      imbalances.push({
        id: 'pull-vs-push',
        kind: 'pull-vs-push',
        weaker: 'Vertical Pull',
        stronger: 'Horizontal Push',
        message: `Your chin-up max (with bodyweight) is ${Math.round(ratio * 100)}% of your bench. Balanced lifters reach about ${Math.round(
          POLIQUIN_CHIN_UP_TO_BENCH * 100
        )}%.`,
        advice: 'Pulling is behind pushing. Keep chin-ups or pulldowns in every week and push them as hard as your presses.',
      });
    }
  }

  // Level gaps between movements measured on the same standards (one full level or more).
  const ranked = levels.filter((l) => l.source === 'kilgore' && l.logged && l.step !== undefined);
  if (ranked.length >= 2) {
    const strongest = ranked.reduce((a, b) => ((b.step ?? 0) > (a.step ?? 0) ? b : a));
    for (const l of ranked) {
      if (l === strongest) continue;
      if ((strongest.step ?? 0) - (l.step ?? 0) >= 4) {
        imbalances.push({
          id: `gap-${l.pillar}`,
          kind: 'level-gap',
          weaker: l.pillar,
          stronger: strongest.pillar,
          message: `${l.name} (${l.tier} ${l.subDivision}${!l.tested && l.bestFrom ? `, estimated from ${l.bestFrom}` : ''}) is a full level behind ${strongest.name.toLowerCase()} (${strongest.tier} ${strongest.subDivision}).`,
          advice: l.tested
            ? `Give ${l.name.toLowerCase()} your freshest sets: train it first in the workout until the gap closes.`
            : `This is an estimate from a lighter lift. A few heavy sets of the standard lift will show where you really are; if the gap stays, train it first in the workout.`,
        });
      }
    }
  }

  return { tableLabel, levels, imbalances, sideDifferences: buildSideDifferences(workouts) };
}

/**
 * Left/right differences from single-arm and single-leg sets logged per side. Uses the last 3
 * sessions of each exercise; flags a side under 90% of the other (limb symmetry index).
 */
export function buildSideDifferences(workouts: WorkoutSession[]): SideDifference[] {
  const perExercise = new Map<string, { name: string; sessions: { at: string; left: number; right: number }[] }>();
  for (const w of workouts) {
    if (!w.completed) continue;
    const at = w.completedAt || w.date;
    for (const ex of w.exercises) {
      let left = 0;
      let right = 0;
      for (const s of ex.sets) {
        if (!s.completed || s.isWarmup || s.setType === 'warmup') continue;
        if (!(s.actualRepsLeft && s.actualRepsLeft > 0 && s.actualRepsRight && s.actualRepsRight > 0)) continue;
        const kg = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        // Same load both sides, so reps compare directly; weight scales the volume when it varies.
        left += s.actualRepsLeft * Math.max(1, kg);
        right += s.actualRepsRight * Math.max(1, kg);
      }
      if (!left || !right) continue;
      const entry = perExercise.get(ex.exerciseId) ?? { name: ex.name, sessions: [] };
      entry.sessions.push({ at, left, right });
      perExercise.set(ex.exerciseId, entry);
    }
  }
  const out: SideDifference[] = [];
  for (const [exerciseId, { name, sessions }] of perExercise) {
    const recent = sessions.sort((a, b) => a.at.localeCompare(b.at)).slice(-3);
    const left = recent.reduce((t, s) => t + s.left, 0);
    const right = recent.reduce((t, s) => t + s.right, 0);
    const pct = Math.round((Math.min(left, right) / Math.max(left, right)) * 100);
    if (pct < SYMMETRY_FLAG_PCT) {
      out.push({
        exerciseId,
        exerciseName: name,
        weakerSide: left < right ? 'left' : 'right',
        symmetryPct: pct,
        sessions: recent.length,
        lastLoggedOn: localDateString(new Date(recent[recent.length - 1].at)),
      });
    }
  }
  return out;
}

/**
 * The coach's answer to "what's my level / am I balanced / is one side weaker", built only from
 * the report (never by the model, which can misread numbers).
 */
export function buildStandardsAnswer(report: MovementStandardsReport, hasBodyweight: boolean): string {
  const logged = report.levels.filter((l) => l.logged && l.source !== 'none' && l.tier);
  const parts: string[] = [];
  if (!hasBodyweight) {
    parts.push('Strength levels compare what you lift with your bodyweight, so log your weight first (Progress → Composition → Weight).');
  } else if (!logged.length) {
    parts.push('Finish a workout with a squat, deadlift, bench, overhead press or chin-up and I can tell you your level on each.');
  } else {
    parts.push(`Your levels (compared with ${report.tableLabel} at your bodyweight):`);
    for (const l of logged) {
      const since = l.firstLevel ? `, up from ${l.firstLevel} when you started` : '';
      parts.push(`• ${l.name}: ${l.tier} ${l.subDivision} (${l.tested ? 'tested' : `estimated${l.bestFrom ? ` from ${l.bestFrom}` : ''}`})${since}.${l.next ? ` Next: ${l.next}.` : ''}`);
    }
  }
  if (report.imbalances.length || report.sideDifferences.length) {
    parts.push('', 'What to work on:');
    for (const i of report.imbalances) parts.push(`• ${i.message} ${i.advice}`);
    for (const d of report.sideDifferences) {
      parts.push(
        `• ${d.exerciseName}: your ${d.weakerSide} side is doing ${d.symmetryPct}% of the other. Start each set with your ${d.weakerSide} side and match its reps on the other side.`
      );
    }
  } else if (logged.length >= 2) {
    parts.push('', 'No imbalances: your lifts are in proportion with each other.');
  }
  parts.push('', 'Levels use Dr Lon Kilgore\'s strength standards; pulling against pressing uses Charles Poliquin\'s ratios. Log single-arm and single-leg sets with "Log each side" to check left against right.');
  return parts.join('\n');
}
