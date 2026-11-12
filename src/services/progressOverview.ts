/**
 * The Progress page's overview, built only from logged data: the goals shown as rings and their
 * summary, personal bests, lifetime and recent training totals, and the lean weight and
 * measurement views. Every figure comes from the function the detail screens use, so the overview
 * and the drill-ins agree.
 */
import { runReadAloudQaGate } from '../engine/contentStrategy';
import { calculateE1RM } from '../engine/e1rm';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { calculateSessionTonnage } from '../engine/wci';
import { WorkoutSession, WorkoutSet } from '../engine/types';
import { AthleteGoal, CHOSEN_GOAL_ID } from './athleteGoals';
import { promptOnDeviceModel } from './onDeviceModel';
import { mislabelledFigure, spelledNumberNotInFacts } from './factChecks';
import { ProgressChart } from './progressSeries';
import { STANDARD_TEST_EXERCISE } from './storage';

const done = (s: WorkoutSet) => s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------------------------
// Personal bests
// ---------------------------------------------------------------------------------------------

export interface PersonalBest {
  exerciseId: string;
  exerciseName: string;
  /** Heaviest working set logged (0 for bodyweight-only work). */
  weightKg: number;
  /** Reps in that set; for bodyweight-only work, the most reps in a set. */
  reps: number;
  isBodyweight: boolean;
  /** When that set was logged (YYYY-MM-DD). */
  date: string;
  /** Best estimated one-rep max on this exercise; 0 for bodyweight-only work without a logged weight. */
  e1rmKg: number;
  sessions: number;
}

/**
 * Each exercise's personal best: its heaviest logged working set (most reps at that weight), or the
 * most reps in a set for bodyweight-only work. Timed work (planks, carries, conditioning) has none.
 */
export function buildPersonalBests(workouts: WorkoutSession[], bodyweightKg?: number): PersonalBest[] {
  const bests = new Map<string, PersonalBest>();
  const ordered = workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  for (const w of ordered) {
    for (const ex of w.exercises) {
      if (ex.durationSeconds || ex.durationMinutesRange) continue;
      const sets = ex.sets.filter(done);
      if (!sets.length) continue;
      const entry: PersonalBest = bests.get(ex.exerciseId) ?? {
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        weightKg: 0,
        reps: 0,
        isBodyweight: true,
        date: w.date,
        e1rmKg: 0,
        sessions: 0,
      };
      entry.sessions += 1;
      entry.exerciseName = ex.name;
      for (const s of sets) {
        const kg = weightOf(s);
        const reps = s.actualReps ?? 0;
        if (kg > entry.weightKg || (kg === entry.weightKg && reps > entry.reps)) {
          entry.weightKg = kg;
          entry.reps = reps;
          entry.date = (w.completedAt || w.date).slice(0, 10);
        }
        // A bodyweight move needs a logged bodyweight before it can be compared as a weight.
        if (kg > 0 || (bodyweightKg ?? 0) > 0) {
          const e = calculateE1RM(kg, reps, s.actualRir ?? s.targetRir ?? 2, ex.equipment, ex.isRdl, ex.isWeightedCalisthenic, bodyweightKg ?? 80, ex.exerciseId, ex.pillar);
          if (kg > 0 && e > entry.e1rmKg) entry.e1rmKg = e;
        }
      }
      entry.isBodyweight = entry.weightKg <= 0;
      bests.set(ex.exerciseId, entry);
    }
  }
  return [...bests.values()].sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps || a.exerciseName.localeCompare(b.exerciseName));
}

/**
 * Three bests for the card: the standard bench, squat and deadlift when the athlete has logged
 * them, then their heaviest other lifts. Never a combined total.
 */
export function trophyCase(bests: PersonalBest[]): PersonalBest[] {
  const standardIds = [STANDARD_TEST_EXERCISE['Horizontal Push'], STANDARD_TEST_EXERCISE.Squat, STANDARD_TEST_EXERCISE.Hinge].filter(Boolean) as string[];
  const loaded = bests.filter((b) => !b.isBodyweight);
  const picked = standardIds.map((id) => loaded.find((b) => b.exerciseId === id)).filter((b): b is PersonalBest => Boolean(b));
  for (const b of loaded) {
    if (picked.length >= 3) break;
    if (!picked.includes(b)) picked.push(b);
  }
  for (const b of bests) {
    if (picked.length >= 3) break;
    if (!picked.includes(b)) picked.push(b);
  }
  return picked.slice(0, 3);
}

// ---------------------------------------------------------------------------------------------
// Lifetime and recent totals
// ---------------------------------------------------------------------------------------------

export const RECENT_DAYS = 30;

export interface TrainingTotals {
  /** Weight × reps over every completed working set (the same sum as each workout's volume). */
  volumeKg: number;
  reps: number;
  workouts: number;
}

/** Totals over all saved workouts, or only those finished in the last `days`. */
export function buildTrainingTotals(workouts: WorkoutSession[], days?: number, now = Date.now()): TrainingTotals {
  const since = days ? now - days * 24 * 60 * 60 * 1000 : -Infinity;
  const totals: TrainingTotals = { volumeKg: 0, reps: 0, workouts: 0 };
  for (const w of workouts) {
    if (!w.completed || getWorkoutCompletedAt(w) < since) continue;
    totals.workouts += 1;
    totals.volumeKg += calculateSessionTonnage(w).tonnageKg;
    totals.reps += w.exercises.reduce((n, ex) => n + ex.sets.filter(done).reduce((r, s) => r + (s.actualReps ?? 0), 0), 0);
  }
  totals.volumeKg = Math.round(totals.volumeKg);
  return totals;
}

// ---------------------------------------------------------------------------------------------
// Goals: the three rings and their summary
// ---------------------------------------------------------------------------------------------

export interface GoalRing {
  id: string;
  title: string;
  /** What the ring's centre shows, e.g. "3/4", "86%", "11/21"; "—" when there is nothing to show yet. */
  value: string;
  /** 0–100 of the ring filled. */
  progressPct: number;
  /** When the goal counts whole things (sessions), the ring is drawn in that many segments. */
  segments?: number;
  detail: string;
  /** Nothing logged for this goal yet: the ring is drawn dimmed. */
  empty: boolean;
}

/**
 * The hero rings: the weekly sessions goal, the strength level closest to being reached, and the
 * athlete's chosen goal. A goal with nothing logged shows an empty ring and what to do, never a
 * made-up figure.
 */
export function buildGoalRings(goals: AthleteGoal[]): GoalRing[] {
  const rings: GoalRing[] = [];
  const process = goals.find((g) => g.kind === 'process');
  if (process) {
    rings.push({
      id: process.id,
      title: process.title,
      value: `${process.current}/${process.target}`,
      progressPct: process.progressPct,
      segments: process.target,
      detail: process.detail,
      empty: false,
    });
  }
  const strength = goals.filter((g) => g.id.startsWith('strength-')).sort((a, b) => b.progressPct - a.progressPct)[0];
  rings.push(
    strength
      ? { id: strength.id, title: strength.title, value: `${strength.progressPct}%`, progressPct: strength.progressPct, detail: strength.detail, empty: false }
      : { id: 'strength-none', title: 'Next strength level', value: '—', progressPct: 0, detail: 'Log your weight and a standard lift to see this', empty: true }
  );
  const chosen = goals.find((g) => g.id === CHOSEN_GOAL_ID);
  if (chosen) {
    rings.push({
      id: chosen.id,
      title: chosen.title,
      value: chosen.target > 0 ? `${chosen.current}/${chosen.target}` : '—',
      progressPct: chosen.progressPct,
      detail: chosen.detail,
      empty: chosen.target === 0,
    });
  }
  return rings;
}

export interface GoalsSummary {
  facts: string[];
  /** Built directly from the facts; shown until (or instead of) the model's version. */
  fallback: string;
  /**
   * Nothing has been logged to summarise yet (no session this week and no repeated lift). The
   * fact-based text is the whole message, and the model is not asked: with nothing to report it
   * fills the gap with judgments the facts don't support.
   */
  sparse: boolean;
}

export const GOALS_SUMMARY_SYSTEM_PROMPT =
  "You are the pragmatic, observant strength coach in the athlete's pocket. Write two or three short sentences to them as \"you\" about " +
  'where their goals stand, using only the facts given: what is on track first, then the one thing that would move a goal forward. ' +
  'No hype, no greetings, no lists, no technical terms. Do not praise or judge: state the figures plainly. Never say how they felt. ' +
  'Do not use any number that is not in the facts.';

/** Where the goals stand, in the same order as the rings. */
export function buildGoalsSummary(goals: AthleteGoal[], formatWeight: (kg: number) => string): GoalsSummary {
  const facts: string[] = [];
  const sentences: string[] = [];
  const process = goals.find((g) => g.kind === 'process');
  if (process) {
    facts.push(`${process.title}: ${process.current} of ${process.target} sessions done in week ${process.week ?? 1} of the plan.`);
    const left = process.target - process.current;
    sentences.push(
      process.achieved
        ? `You've done all ${process.target} sessions this week.`
        : process.current === 0
        ? `This week's ${process.target} sessions are still ahead of you.`
        : `You've done ${process.current} of ${process.target} sessions this week, with ${left} to go.`
    );
  }
  const chosen = goals.find((g) => g.id === CHOSEN_GOAL_ID);
  if (chosen) {
    if (chosen.target > 0) {
      const what = /held/.test(chosen.detail) ? 'have held or gained strength' : 'are stronger than when you first logged them';
      facts.push(`${chosen.title}: ${chosen.current} of ${chosen.target} repeated lifts ${what}.`);
      sentences.push(`For ${chosen.title}, ${chosen.current} of your ${plural(chosen.target, 'repeated lift')} ${what}.`);
    } else {
      facts.push(`${chosen.title}: no lift has been done twice yet, so there is nothing to compare.`);
      sentences.push(`${chosen.title} is measured by your lifts getting stronger, which shows once you repeat a workout.`);
    }
  }
  const strength = goals.filter((g) => g.id.startsWith('strength-')).sort((a, b) => b.progressPct - a.progressPct)[0];
  if (strength) {
    const [movement, level] = strength.title.split(': ');
    const gap = Math.max(0, Math.round((strength.target - strength.current) * 10) / 10);
    facts.push(`Closest strength level: ${movement} needs ${formatWeight(gap)} more on its estimated max (${formatWeight(strength.current)} of ${formatWeight(strength.target)}) to reach ${level}.`);
    sentences.push(`Your closest strength level is ${movement}: ${formatWeight(gap)} more on your estimated max reaches ${level}.`);
  } else {
    facts.push('Strength levels need a logged bodyweight and a logged standard lift; neither is available yet.');
    sentences.push('Log your weight to see how your lifts compare with strength standards.');
  }
  const sparse = (process?.current ?? 0) === 0 && (chosen?.target ?? 0) === 0 && !strength;
  return { facts, fallback: sentences.join(' '), sparse };
}

const NUMBER = /\d+(?:\.\d+)?/g;

/** The cleaned summary, or why it can't be shown (in words the model can act on in a second try). */
export function checkGoalsSummary(answer: string | null, summary: Pick<GoalsSummary, 'facts'>): { text: string; problem?: undefined } | { text?: undefined; problem: string } {
  if (!answer) return { problem: 'it was empty' };
  const text = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(summary|message|note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 40) return { problem: 'it was too short' };
  if (text.length > 380) return { problem: 'it was too long; write two or three short sentences' };
  if ((text.match(/[.!?](\s|$)/g) || []).length > 4) return { problem: 'it had too many sentences; write two or three' };
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return { problem: 'it talked about itself or "the facts"' };
  if (!runReadAloudQaGate(text).passed) return { problem: 'it used hype, a cliché or judgmental wording' };
  if (/\b(felt|feel|feeling|enjoy(ed)?|loved)\b/i.test(text)) return { problem: 'it said how the athlete felt, which is not known' };
  if (/\b(significant\w*|dramatic\w*|huge|massive|incredibl\w*|amazing|awesome)\b/i.test(text)) return { problem: 'it used a size or hype word the facts do not support' };
  if (/\b(consistent\w*|dedicat\w*|progressing well|going well|great|excellent|impressive|solid|strong (work|effort|progress)|(good|nice) (work|job|session)|well done|keep it up|(on|staying on) (schedule|track))\b/i.test(text)) return { problem: 'it praised consistency or quality that the facts do not show; state the figures plainly' };
  if (/\b(cannot be|can't be|unable to) (assessed|measured|determined|evaluated)\b|\binsufficient\b|\bno data\b/i.test(text)) return { problem: 'it said something cannot be assessed; say what to do next instead' };
  const allowed = new Set(summary.facts.join(' ').match(NUMBER) || []);
  const strange = (text.match(NUMBER) || []).find((n) => !allowed.has(n));
  if (strange) return { problem: `it used the number ${strange}, which is not in the facts` };
  const spelled = spelledNumberNotInFacts(text, summary.facts);
  if (spelled) return { problem: `it used the number "${spelled}", which is not in the facts` };
  const mislabelled = mislabelledFigure(text, summary.facts);
  if (mislabelled) return { problem: `it said "${mislabelled}", but the facts count that figure in something else` };
  return { text };
}

/** Asks the on-device model for the goals summary. Null when no model is ready or its answers fail the checks. */
export async function generateGoalsSummary(
  summary: Pick<GoalsSummary, 'facts'> & Partial<Pick<GoalsSummary, 'sparse'>>,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  if (summary.sparse) return null;
  let problem: string | undefined;
  const base = `Facts:\n${summary.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the summary.`;
  // A model that throws is the same as no model: the fact-based text stays.
  try {
    for (let i = 0; i < attempts; i++) {
      const request = problem ? `${base}\n(Your last summary could not be used because ${problem}. Write it again.)` : base;
      const answer = await prompt(GOALS_SUMMARY_SYSTEM_PROMPT, request, { stateless: true, timeoutMs: 30_000 });
      if (answer === null) return null;
      const checked = checkGoalsSummary(answer, summary);
      if (checked.problem === undefined) return checked.text;
      problem = checked.problem;
    }
  } catch {
    return null;
  }
  return null;
}

const GOALS_CACHE_KEY = 'treise_goals_summary_v1';

function goalsKey(summary: Pick<GoalsSummary, 'facts'>): string {
  const text = `${GOALS_SUMMARY_SYSTEM_PROMPT}\n${summary.facts.join('\n')}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The written summary saved for these facts, if it still passes the checks. */
export function getCachedGoalsSummary(summary: Pick<GoalsSummary, 'facts'>): string | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GOALS_CACHE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    const hit = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[goalsKey(summary)] : undefined;
    const checked = typeof hit === 'string' ? checkGoalsSummary(hit, summary) : null;
    return checked && checked.problem === undefined ? checked.text : null;
  } catch {
    return null;
  }
}

export function cacheGoalsSummary(summary: Pick<GoalsSummary, 'facts'>, text: string): void {
  try {
    const raw = localStorage.getItem(GOALS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const saved: Record<string, string> = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const entries = Object.entries(saved).filter(([k]) => k !== goalsKey(summary));
    entries.push([goalsKey(summary), text]);
    localStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-6))));
  } catch {
    // Storage unavailable: the summary is simply written again next time.
  }
}

// ---------------------------------------------------------------------------------------------
// Lean measurement view
// ---------------------------------------------------------------------------------------------

export interface MeasurementHighlight {
  id: string;
  label: string;
  /** Latest reading. */
  value: number;
  /** Change since the first reading; undefined with only one. */
  change?: number;
  date: string;
}

/** Waist first (the measurement that says most about fitness), then chest, arms, hips and thighs. */
const MEASUREMENT_ORDER: { ids: string[]; label: string }[] = [
  { ids: ['waist'], label: 'Waist' },
  { ids: ['chest'], label: 'Chest' },
  { ids: ['bicep-right', 'bicep-left'], label: 'Arm' },
  { ids: ['hips'], label: 'Hips' },
  { ids: ['thigh-right', 'thigh-left'], label: 'Thigh' },
];

/** Up to `max` tape measurements for the overview card, waist always first when it has been logged. */
export function measurementHighlights(charts: ProgressChart[], max = 3): MeasurementHighlight[] {
  const highlights: MeasurementHighlight[] = [];
  for (const site of MEASUREMENT_ORDER) {
    const chart = site.ids.map((id) => charts.find((c) => c.id === id && c.points.length > 0)).find(Boolean);
    if (!chart) continue;
    const last = chart.points[chart.points.length - 1];
    highlights.push({
      id: chart.id,
      label: site.label,
      value: last.value,
      change: chart.points.length >= 2 ? Math.round((last.value - chart.points[0].value) * 10) / 10 : undefined,
      date: last.date,
    });
    if (highlights.length >= max) break;
  }
  return highlights;
}
