/**
 * The Progress page's overview, built only from logged data: the goals shown as rings and their
 * summary, personal bests, lifetime and recent training totals, and the lean weight and
 * measurement views. Every figure comes from the function the detail screens use, so the overview
 * and the drill-ins agree.
 */
import { runReadAloudQaGate } from '../engine/contentStrategy';
import { calculateE1RM, getBodyweightLoadRatio, isTimedExercise } from '../engine/e1rm';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { calculateSessionTonnage } from '../engine/wci';
import { BiometricLog, WorkoutSession, WorkoutSet } from '../engine/types';
import { AthleteGoal, CHOSEN_GOAL_ID, WEEKLY_GOAL_ID, activeGoals, repsAt } from './athleteGoals';
import { promptOnDeviceModel } from './onDeviceModel';
import {
  buildSummaryVoiceGuidelines,
  checkSummaryVoiceGuidelines,
  normalizeSummaryVoice,
} from './coachPersonalization';
import { coalesceAiGeneration, readCachedAiText, writeCachedAiText } from './aiGenerationCache';
import { mislabelledFigure, mismatchedWeightUnit, markPromptRejected, spelledNumberNotInFacts, wasPromptRejected } from './factChecks';
import { ProgressChart } from './progressSeries';
import { STANDARD_TEST_EXERCISE } from './storage';
import { localDateString } from '../utils/date';

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
  /** Heaviest completed single-rep (1RM) working set logged on this exercise, when tested/imported. */
  bestOneRepMaxKg?: number;
  /** Date when `bestOneRepMaxKg` was logged (YYYY-MM-DD). */
  bestOneRepMaxDate?: string;
  /** True when `e1rmKg` includes bodyweight (weighted calisthenics). */
  includesBodyweight?: boolean;
  sessions: number;
}

/**
 * Each exercise's personal best: its heaviest logged working set (most reps at that weight), or the
 * most reps in a set for bodyweight-only work. Timed work (planks, carries, conditioning) has none.
 */
export function buildPersonalBests(
  workouts: WorkoutSession[],
  bodyweightKg?: number,
  biometrics?: BiometricLog[]
): PersonalBest[] {
  const bests = new Map<string, PersonalBest>();
  const ordered = workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  const fallbackBw = bodyweightKg ?? 0;
  for (const w of ordered) {
    const sessionBw = emaLookup ? emaLookup(w.date, fallbackBw) : fallbackBw;
    for (const ex of w.exercises) {
      if (isTimedExercise(ex)) continue;
      const sets = ex.sets.filter(done);
      if (!sets.length) continue;
      const isCalisthenic =
        ex.equipment === 'bodyweight' || ex.equipment === 'weighted_bodyweight' || Boolean(ex.isWeightedCalisthenic);
      const entry: PersonalBest = bests.get(ex.exerciseId) ?? {
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        weightKg: 0,
        reps: 0,
        isBodyweight: true,
        date: w.date,
        e1rmKg: 0,
        ...(isCalisthenic ? { includesBodyweight: true } : {}),
        sessions: 0,
      };
      entry.sessions += 1;
      entry.exerciseName = ex.name;
      for (const s of sets) {
        const kg = weightOf(s);
        const reps = s.actualReps ?? 0;
        const setDate = w.completedAt ? localDateString(new Date(w.completedAt)) : w.date;
        if (kg > entry.weightKg || (kg === entry.weightKg && reps > entry.reps)) {
          entry.weightKg = kg;
          entry.reps = reps;
          entry.date = setDate;
        }
        if (reps === 1 && kg > 0 && kg > (entry.bestOneRepMaxKg ?? 0)) {
          entry.bestOneRepMaxKg = kg;
          entry.bestOneRepMaxDate = setDate;
        }
        const bwRatio = isCalisthenic ? getBodyweightLoadRatio(ex.exerciseId, ex.pillar) : 0;
        // Count bodyweight for calisthenics whenever real bodyweight is logged and the movement loads bodyweight.
        if (
          (kg > 0 || (isCalisthenic && sessionBw > 0 && bwRatio > 0)) &&
          (!isCalisthenic || (sessionBw > 0 && (kg > 0 || bwRatio > 0)))
        ) {
          const e = calculateE1RM(
            kg,
            reps,
            s.actualRir ?? s.targetRir ?? 2,
            ex.equipment,
            ex.isRdl,
            ex.isWeightedCalisthenic,
            sessionBw,
            ex.exerciseId,
            ex.pillar
          );
          if (e > entry.e1rmKg) entry.e1rmKg = e;
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
export function buildTrainingTotals(
  workouts: WorkoutSession[],
  days?: number,
  now = Date.now(),
  bodyweightKg: number = 0,
  biometrics?: BiometricLog[]
): TrainingTotals {
  const since = days ? now - days * 24 * 60 * 60 * 1000 : -Infinity;
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  const bwLookup = (date: string) => (emaLookup ? emaLookup(date, bodyweightKg) : bodyweightKg);
  const totals: TrainingTotals = { volumeKg: 0, reps: 0, workouts: 0 };
  for (const w of workouts) {
    if (!w.completed || getWorkoutCompletedAt(w) < since) continue;
    totals.workouts += 1;
    totals.volumeKg += calculateSessionTonnage(w, bwLookup).tonnageKg;
    totals.reps += w.exercises.reduce(
      (n, ex) =>
        isTimedExercise(ex)
          ? n
          : n + ex.sets.filter(done).reduce((r, s) => r + (s.actualReps ?? 0), 0),
      0
    );
  }
  totals.volumeKg = Math.round(totals.volumeKg);
  return totals;
}

// ---------------------------------------------------------------------------------------------
// Goals: the three rings and their summary
// ---------------------------------------------------------------------------------------------

export type RingSegment = 'on' | 'off' | 'unknown';

export interface GoalRing {
  id: string;
  title: string;
  /** What the ring's centre shows: a count against its target ("3/4", "8/10"), never a percentage. */
  value: string;
  /** What the count is of, under the title: "reps at 80 kg", "5 weeks in a row". */
  caption: string;
  /** Outer ring: sessions in this week (or metric segments), one segment each ('unknown' = not measured yet). */
  segments: RingSegment[];
  /** Middle ring on the weekly goal: 4 segments representing the weeks in the month. */
  inner?: RingSegment[];
  /** Innermost ring on the weekly goal: 12 segments representing the months in the year. */
  innermost?: RingSegment[];
  /** Nothing logged for this goal yet: the ring is drawn dimmed. */
  empty: boolean;
  detail: string;
}

/** A count drawn as segments reads well up to about this many; beyond it, segments stand for equal shares. */
const MAX_SEGMENTS = 20;
/** Habit-formation benchmark referenced in the goal detail copy. */
export const HABIT_WEEKS = 6;
/** Middle ring on the weekly goal: the 4 weeks in the month. */
export const MONTH_WEEKS = 4;
/** Innermost ring on the weekly goal: the 12 months in the year. */
export const YEAR_MONTHS = 12;

function countSegments(current: number, target: number): RingSegment[] {
  const total = Math.max(1, Math.min(MAX_SEGMENTS, Math.round(target)));
  const raw = Math.round((current / Math.max(1, target)) * total);
  const filled = current >= target ? total : Math.max(0, Math.min(total - 1, raw));
  return Array.from({ length: total }, (_, i) => (i < filled ? 'on' : 'off'));
}

/** The strength level among the athlete's goals: the lift they follow, else the one nearest its next level. */
export function closestStrengthGoal(goals: AthleteGoal[]): AthleteGoal | undefined {
  return activeGoals(goals).find((g) => g.id.startsWith('strength-'));
}

const compactSteps = (steps: number): string => {
  if (steps <= 0) return '0';
  if (steps < 1000) return `${Math.round(steps)}`;
  return `${Math.round(steps / 100) / 10}k`.replace(/\.0k$/, 'k');
};

/** One goal as a ring: a count against its target in the centre, and what it counts beneath. */
function ringFor(goal: AthleteGoal, formatWeight: (kg: number) => string): GoalRing {
  const m = goal.measure;
  const base = { id: goal.id, title: goal.title, detail: goal.detail, empty: false };
  if (m.type === 'frequency') {
    const recentWeeks = m.weeks.slice(-MONTH_WEEKS);
    const recentMonths = m.months.slice(-YEAR_MONTHS);
    return {
      ...base,
      value: `${m.thisWeek}/${m.perWeek}`,
      caption: m.streakWeeks > 0 ? `${m.streakWeeks} ${m.streakWeeks === 1 ? 'week' : 'weeks'} in a row` : 'this week',
      segments: countSegments(m.thisWeek, m.perWeek),
      // Outer ring varies by goal (days/sessions in the week); the two inside it stay fixed at 4 weeks and 12 months.
      inner: [
        ...Array.from({ length: MONTH_WEEKS - recentWeeks.length }, () => 'unknown' as RingSegment),
        ...recentWeeks.map((w): RingSegment => (w.hit ? 'on' : 'off')),
      ],
      innermost: [
        ...Array.from({ length: YEAR_MONTHS - recentMonths.length }, () => 'unknown' as RingSegment),
        ...recentMonths.map((mo): RingSegment => (mo.hit ? 'on' : 'off')),
      ],
    };
  }
  if (m.type === 'reps') {
    return { ...base, value: `${m.currentReps}/${m.targetReps}`, caption: `reps ${repsAt(m, formatWeight)}`, segments: countSegments(m.currentReps, m.targetReps) };
  }
  if (m.type === 'load') {
    const [value, unit] = formatWeight(Math.max(0, m.targetE1rmKg - m.e1rmKg)).split(' ');
    // Ten equal shares of the way from the level held to the level being chased.
    return { ...base, value, caption: `${unit ?? 'kg'} to go on your estimated max`, segments: countSegments(goal.achieved ? 10 : Math.min(9.4, goal.progressPct / 10), 10) };
  }
  if (m.type === 'target') {
    if (m.metric === 'steps') {
      return {
        ...base,
        value: `${compactSteps(m.best)}/${compactSteps(m.target)}`,
        caption: m.best > 0 ? 'steps today' : 'steps today, none yet',
        segments: countSegments(m.best >= m.target ? 10 : Math.min(9.4, (m.best / m.target) * 10), 10),
      };
    }
    const byWeight = m.metric === 'weight';
    const [targetValue, unit] = byWeight ? formatWeight(m.target).split(' ') : [`${m.target}`, 'reps'];
    return {
      ...base,
      value: `${byWeight ? formatWeight(m.best).split(' ')[0] : m.best}/${targetValue}`,
      caption: m.best > 0 ? `${byWeight ? unit ?? 'kg' : 'reps'}, your goal` : 'your goal, not logged yet',
      segments: byWeight ? countSegments(m.best >= m.target ? 10 : Math.min(9.4, (m.best / m.target) * 10), 10) : countSegments(m.best, m.target),
    };
  }
  return {
    ...base,
    value: m.signsMeasured > 0 ? `${m.signsMet}/${m.signs.length}` : '—',
    caption: m.signsMeasured > 0 ? 'signs showing' : 'nothing measured yet',
    segments: m.signs.map((sign): RingSegment => (sign.met === null ? 'unknown' : sign.met ? 'on' : 'off')),
    empty: m.signsMeasured === 0,
  };
}

/**
 * The snapshot rings, one for each of the athlete's 3 to 5 goals (`activeGoals`): sessions a week
 * (this week outside, the last six weeks inside), a strength level, the chosen goal, then any goals
 * of their own. Before a strength level can be worked out, its place holds an empty ring that says
 * what to log, never a made-up figure.
 */
export function buildGoalRings(goals: AthleteGoal[], formatWeight: (kg: number) => string = (kg) => `${kg} kg`): GoalRing[] {
  const active = activeGoals(goals);
  const rings = active.map((g) => ringFor(g, formatWeight));
  if (!active.some((g) => g.id.startsWith('strength-'))) {
    rings.splice(Math.min(1, rings.length), 0, { id: 'strength-none', title: 'Next strength level', value: '—', caption: 'log your weight to start', segments: countSegments(0, 10), empty: true, detail: 'Log your weight and a standard lift to see this' });
  }
  return rings;
}

export interface GoalsSummary {
  facts: string[];
  /** Built directly from the facts; shown until (or instead of) the model's version. */
  fallback: string;
  /**
   * Nothing has been logged to summarise yet. The fact-based text is the whole message, and the
   * model is not asked: with nothing to report it fills the gap with judgments the facts don't support.
   */
  sparse: boolean;
  /** Optional prompt override when summarizing a single goal card instead of all goals together. */
  systemPrompt?: string;
}

export interface SingleGoalSummary extends GoalsSummary {
  goalId: string;
  /** Short category eyebrow for the carousel card ('Habit', 'Strength level', 'Main goal', 'Personal goal'). */
  categoryLabel: string;
  /** Concise 1-line visual context shown beneath the hero ring caption (never a percentage). */
  visContext?: string;
  /** Structured signal statuses for body outcome goals (clockwise across the 3 arcs). */
  signStatuses?: { label: string; state: 'on' | 'off' | 'unknown' }[];
  /** Loop decode labels for the 3 concentric weekly/monthly/yearly habit rings. */
  loopLabels?: string[];
}

export const GOALS_SUMMARY_SYSTEM_PROMPT =
  "You are the pragmatic, observant strength coach in the athlete's pocket. Synthesize into two crisp sentences (under 200 characters total) " +
  'speaking as "you", using only the facts given: first, weekly pace plus primary goal standing; second, the single clearest action that moves the closest goal forward. ' +
  'Never list every ring or repeat daily step counts one by one. No hype, greetings, lists, or technical jargon. Never praise, judge, or say how they felt. ' +
  'Do not use any number that is not in the facts. ' +
  buildSummaryVoiceGuidelines('goals_summary');

export const SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT =
  "You are the pragmatic, observant strength coach in the athlete's pocket. In two concise sentences (under 200 characters total), speak as \"you\" " +
  'using only the facts for this single goal: first, what the logged figures show about current standing; second, the clearest next step to move this goal forward. ' +
  'No hype, greetings, lists, percentages, or technical jargon. Never praise, judge, or say how the athlete felt. Do not use any number that is not in the facts. ' +
  buildSummaryVoiceGuidelines('goals_summary');

const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Focused coaching facts and deterministic summary for a single goal slide in the Progress carousel. */
export function buildSingleGoalSummary(
  goal: AthleteGoal | undefined,
  ring: GoalRing,
  formatWeight: (kg: number) => string
): SingleGoalSummary {
  if (!goal || ring.id === 'strength-none') {
    const facts = ['Strength standards compare lifts against your bodyweight; no bodyweight has been logged yet.'];
    return {
      goalId: ring.id,
      categoryLabel: 'Strength standard',
      visContext: 'Kilgore & Poliquin levels',
      facts,
      fallback: 'Strength standards scale to bodyweight. Log one weigh-in on Progress to unlock your movement targets.',
      sparse: true,
      systemPrompt: SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT,
    };
  }

  const m = goal.measure;
  if (m.type === 'frequency') {
    const left = Math.max(0, m.perWeek - m.thisWeek);
    const facts = [
      `Goal: ${goal.title} (${m.thisWeek} of ${m.perWeek} sessions done this week${left > 0 ? `, ${left} to go` : ''}).`,
      `Run: ${m.streakWeeks} weeks in a row at target; ${HABIT_WEEKS} weeks in a row builds the habit.`,
    ];
    if (m.weeksTracked > 0) facts.push(`History: ${m.weeksHit} of ${m.weeksTracked} weeks hit the ${m.perWeek}-session target.`);
    let fallback: string;
    const sparse = m.thisWeek === 0 && m.weeksTracked <= 1 && m.streakWeeks === 0;
    if (sparse) {
      fallback = `Log your first session to open your ${m.perWeek}-session weekly habit target. Both workouts and 20-minute active sessions count.`;
      facts.push('Each logged workout or 20-minute active day counts toward your week.');
    } else if (m.thisWeek >= m.perWeek) {
      fallback = `All ${m.perWeek} sessions finished this week${m.streakWeeks >= 2 ? `, extending your run to ${m.streakWeeks} weeks in a row` : ''}. Space any extra sessions cleanly so muscle recovery stays ahead.`;
    } else {
      const weeksNote =
        m.streakWeeks > 0
          ? `${m.streakWeeks} ${m.streakWeeks === 1 ? 'week' : 'weeks'} in a row`
          : `${m.weeksHit} of ${m.weeksTracked} weeks hit`;
      fallback = `${left} ${left === 1 ? 'session' : 'sessions'} left before Sunday for your ${m.perWeek}-session target (${weeksNote}). ${
        m.streakWeeks >= HABIT_WEEKS
          ? 'Keep weekly spacing steady to maintain the habit.'
          : `Hitting ${HABIT_WEEKS} weeks in a row builds the training habit.`
      }`;
    }
    return {
      goalId: goal.id,
      categoryLabel: 'Process habit',
      loopLabels: ['Outer: this week', 'Mid: 4 wks', 'Inner: 12 mos'],
      facts,
      fallback,
      sparse,
      systemPrompt: SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT,
    };
  }

  if (m.type === 'reps') {
    const [movement] = goal.title.split(': ');
    const at = repsAt(m, formatWeight);
    const repDiff = Math.max(1, m.targetReps - m.currentReps);
    const pullNote = goal.pillar === 'Vertical Pull' ? ' (bodyweight + added weight)' : '';
    const facts = [
      `Goal: ${movement} reaches ${m.level} (currently ${m.currentLevel}).`,
      `Best set: ${m.currentReps} reps ${at} on ${m.exerciseName}; ${m.targetReps} reps unlocks ${m.level} (${repDiff} away).`,
      `Estimated max${pullNote}: ${formatWeight(m.e1rmKg)} of ${formatWeight(m.targetE1rmKg)}.`,
    ];
    return {
      goalId: goal.id,
      categoryLabel: 'Strength standard',
      visContext: `${m.currentLevel} → ${m.level}`,
      facts,
      fallback: `Hit ${m.targetReps} reps ${at} on ${m.exerciseName} to reach ${m.level} (${repDiff} away from your ${m.currentReps}-rep best). Currently ${m.currentLevel} at a ${formatWeight(m.e1rmKg)} estimated max.`,
      sparse: false,
      systemPrompt: SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT,
    };
  }

  if (m.type === 'load') {
    const [movement] = goal.title.split(': ');
    const gap = Math.max(0, Math.round((m.targetE1rmKg - m.e1rmKg) * 10) / 10);
    const pullNote = goal.pillar === 'Vertical Pull' ? ' (bodyweight + added weight)' : '';
    const facts = [
      `Goal: ${movement} reaches ${m.level} (currently ${m.currentLevel}).`,
      `Estimated max on ${m.exerciseName}${pullNote}: ${formatWeight(m.e1rmKg)} of ${formatWeight(m.targetE1rmKg)} (${formatWeight(gap)} needed).`,
    ];
    return {
      goalId: goal.id,
      categoryLabel: 'Strength standard',
      visContext: `${m.currentLevel} → ${m.level}`,
      facts,
      fallback: `Build ${formatWeight(gap)} on your ${m.exerciseName} estimated max to reach ${m.level} (${formatWeight(m.e1rmKg)} of ${formatWeight(m.targetE1rmKg)}). Currently ${m.currentLevel} at your bodyweight.`,
      sparse: false,
      systemPrompt: SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT,
    };
  }

  if (m.type === 'target') {
    if (m.metric === 'steps') {
      const remaining = Math.max(0, m.target - m.best);
      const facts = [
        `Goal: ${m.target} steps a day.`,
        m.best > 0 ? `Steps today: ${m.best} steps (${remaining} remaining).` : 'No steps recorded today yet.',
      ];
      let fallback: string;
      const sparse = m.best <= 0;
      if (goal.achieved) {
        fallback = `Today's ${m.target.toLocaleString('en-US')}-step target is reached with ${m.best.toLocaleString('en-US')} steps logged. Daily walking supports recovery between lifting sessions.`;
      } else if (m.best > 0) {
        fallback = `${remaining.toLocaleString('en-US')} steps left today to reach ${m.target.toLocaleString('en-US')} (${m.best.toLocaleString('en-US')} logged). Steady walking adds daily output without lifting fatigue.`;
      } else {
        fallback = `No steps recorded today yet against your ${m.target.toLocaleString('en-US')}-step goal. Connect Health Connect or your watch to sync daily movement.`;
      }
      return {
        goalId: goal.id,
        categoryLabel: 'Personal goal',
        visContext: 'Updated daily from watch or Health Connect',
        facts,
        fallback,
        sparse,
        systemPrompt: SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT,
      };
    }

    const byWeight = m.metric === 'weight';
    const gapVal = Math.max(0, Math.round((m.target - m.best) * 10) / 10);
    const goalText = byWeight ? formatWeight(m.target) : `${m.target} reps`;
    const bestText = byWeight ? formatWeight(m.best) : `${m.best} reps`;
    const gapText = byWeight ? formatWeight(gapVal) : `${gapVal} ${gapVal === 1 ? 'rep' : 'reps'}`;
    const facts = [
      `Goal: ${goalText} on ${m.exerciseName}.`,
      m.best > 0 ? `Best logged set: ${bestText} (${gapText} short).` : 'It has not been logged yet.',
    ];
    let fallback: string;
    const sparse = m.best <= 0;
    if (goal.achieved) {
      fallback = `${m.exerciseName} reached your ${goalText} target (best set ${bestText}). Set a higher target from Progress options or AI Coach when ready.`;
    } else if (m.best > 0) {
      fallback = `Best logged set is ${bestText}—${gapText} short of your ${goalText} goal on ${m.exerciseName}. Add quality reps across working sets before increasing weight.`;
    } else {
      fallback = `No sets logged yet on ${m.exerciseName} toward your ${goalText} goal. Your first logged working set puts a marker on this target.`;
    }
    return {
      goalId: goal.id,
      categoryLabel: 'Personal goal',
      visContext: byWeight ? 'Heaviest logged working set' : 'Most reps in a single set',
      facts,
      fallback,
      sparse,
      systemPrompt: SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT,
    };
  }

  // Chosen outcome goal ('Build Muscle', 'Lose Fat', 'Stay Lean')
  const signStatuses = m.signs.map((s) => ({
    label: s.id === 'strength' ? 'Strength' : s.id === 'weight' ? 'Weight' : 'Size',
    state: (s.met === true ? 'on' : s.met === false ? 'off' : 'unknown') as 'on' | 'off' | 'unknown',
  }));
  const facts: string[] = [
    `${goal.title}: ${m.signsMet} of ${m.signsMeasured} measured signs are showing.`,
    ...m.signs.map((s) => `${s.label}: ${s.met === true ? 'showing' : s.met === false ? 'not showing yet' : 'not measured yet'} (${s.detail}).`),
    `Evidence level: ${m.evidenceLabel}`,
  ];
  if (m.nextStep) facts.push(`Next step: ${m.nextStep}`);

  const sparse = m.signsMeasured === 0;
  let fallback: string;
  if (sparse) {
    fallback = `${goal.title} watches lift strength, weight pace, and body size. Repeat lifts and log weekly weigh-ins to start tracking.`;
  } else {
    const metList = m.signs.filter((s) => s.met === true).map((s) => s.label.toLowerCase());
    const missedSign = m.signs.find((s) => s.met === false);
    const unmeasured = m.signs.find((s) => s.met === null);
    const ratio = `(${m.signsMet} of ${m.signsMeasured} measured)`;
    let lead: string;
    if (metList.length > 0 && missedSign) {
      lead = `${capFirst(metList.join(' and '))} ${metList.length === 1 ? 'matches' : 'match'} ${goal.title} ${ratio}; ${missedSign.label.toLowerCase()} is not showing yet.`;
    } else if (metList.length > 0) {
      lead = `${capFirst(metList.join(' and '))} ${metList.length === 1 ? 'supports' : 'support'} ${goal.title} across ${m.signsMet} of ${m.signsMeasured} measured signs.`;
    } else if (missedSign) {
      lead = `${missedSign.label} is not showing yet for ${goal.title} ${ratio}.`;
    } else {
      lead = `${goal.title} tracks ${m.signsMeasured} measured sign so far.`;
    }
    const step = m.nextStep
      ? m.nextStep
      : unmeasured
      ? `Log ${unmeasured.label.toLowerCase()} to track all three signs.`
      : m.evidence === 'tape'
      ? 'Tracked with 7-day average weight, main-lift strength, and tape measurements.'
      : 'Keep repeating workouts and logging morning weight and optional waist tape to verify progress.';
    fallback = `${lead} ${step}`;
  }

  return {
    goalId: goal.id,
    categoryLabel: 'Main goal',
    signStatuses,
    facts,
    fallback,
    sparse,
    systemPrompt: SINGLE_GOAL_SUMMARY_SYSTEM_PROMPT,
  };
}

/** Builds per-slide coaching summaries aligned 1:1 with `buildGoalRings`. */
export function buildGoalCardSummaries(
  goals: AthleteGoal[],
  rings: GoalRing[],
  formatWeight: (kg: number) => string = (kg) => `${kg} kg`
): SingleGoalSummary[] {
  const byId = new Map(activeGoals(goals).map((g) => [g.id, g]));
  return rings.map((ring) => buildSingleGoalSummary(byId.get(ring.id), ring, formatWeight));
}

/** Where the goals stand, synthesized cleanly rather than narrating every ring. */
export function buildGoalsSummary(goals: AthleteGoal[], formatWeight: (kg: number) => string): GoalsSummary {
  const facts: string[] = [];
  const weekly = goals.find((g) => g.id === WEEKLY_GOAL_ID);
  const frequency = weekly?.measure.type === 'frequency' ? weekly.measure : undefined;
  let weeklyLead = '';
  if (weekly && frequency) {
    const left = frequency.perWeek - frequency.thisWeek;
    facts.push(
      `${weekly.title}: ${frequency.thisWeek} of ${frequency.perWeek} sessions done this week${frequency.thisWeek > 0 && left > 0 ? `, ${left} to go` : ''}.`
    );
    if (frequency.streakWeeks > 0) facts.push(`Weeks in a row at ${frequency.perWeek} sessions: ${frequency.streakWeeks}.`);
    const streakClause =
      frequency.streakWeeks > 0
        ? ` (${frequency.streakWeeks} ${frequency.streakWeeks === 1 ? 'week' : 'weeks'} running)`
        : '';
    weeklyLead =
      frequency.thisWeek >= frequency.perWeek
        ? `All ${frequency.perWeek} sessions done this week${streakClause}`
        : frequency.thisWeek === 0
        ? `This week's ${frequency.perWeek} sessions are ahead`
        : `${frequency.thisWeek} of ${frequency.perWeek} sessions done this week`;
  }

  const chosen = goals.find((g) => g.id === CHOSEN_GOAL_ID);
  const body = chosen?.measure.type === 'body' ? chosen.measure : undefined;
  let chosenClause = '';
  if (chosen && body) {
    if (body.signsMeasured > 0) {
      const showing = body.signs.filter((sign) => sign.met === true).map((sign) => sign.label.toLowerCase());
      const missing = body.signs.filter((sign) => sign.met === false).map((sign) => sign.label.toLowerCase());
      facts.push(`${chosen.title}: ${body.signsMet} of ${body.signsMeasured} measured signs are showing${showing.length ? ` (${showing.join('; ')})` : ''}.`);
      if (missing.length) facts.push(`${chosen.title}, not showing yet: ${missing.join('; ')}.`);
      facts.push(`How ${chosen.title} is judged: ${body.evidenceLabel}`);
      chosenClause = `${chosen.title} shows ${body.signsMet} of ${body.signsMeasured} ${body.signsMeasured === 1 ? 'sign' : 'signs'}`;
    } else {
      facts.push(`${chosen.title}: nothing has been measured for it yet.`);
      chosenClause = `${chosen.title} tracks once lifts repeat and weigh-ins start`;
    }
  }

  let leadSentence = '';
  if (weeklyLead && chosenClause) leadSentence = `${weeklyLead}; ${chosenClause}.`;
  else if (weeklyLead) leadSentence = `${weeklyLead}.`;
  else if (chosenClause) leadSentence = `${chosenClause}.`;

  let actionSentence = '';
  const strength = closestStrengthGoal(goals);
  let strengthAction = '';
  if (strength && strength.measure.type === 'reps') {
    const m = strength.measure;
    const [movement] = strength.title.split(': ');
    const at = repsAt(m, formatWeight);
    facts.push(`Closest strength level: ${movement} reaches ${m.level} with ${m.targetReps} reps ${at} on ${m.exerciseName}; the best so far is ${m.currentReps} reps.`);
    strengthAction = `${movement}: ${m.targetReps} reps ${at} reaches ${m.level} (best ${m.currentReps}).`;
  } else if (strength && strength.measure.type === 'load') {
    const m = strength.measure;
    const [movement] = strength.title.split(': ');
    const gap = Math.max(0, Math.round((m.targetE1rmKg - m.e1rmKg) * 10) / 10);
    facts.push(`Closest strength level: ${movement} needs ${formatWeight(gap)} more on its estimated max (${formatWeight(m.e1rmKg)} of ${formatWeight(m.targetE1rmKg)}) to reach ${m.level}.`);
    strengthAction = `${movement}: ${formatWeight(gap)} more estimated max reaches ${m.level}.`;
  } else {
    facts.push('Strength levels need a logged bodyweight and a logged standard lift; neither is available yet.');
  }

  let ownAchievedAction = '';
  let ownLiftAction = '';
  for (const own of activeGoals(goals).filter((g) => g.measure.type === 'target')) {
    const m = own.measure as Extract<AthleteGoal['measure'], { type: 'target' }>;
    if (m.metric === 'steps') {
      facts.push(
        `Your own goal: ${m.target} steps a day. ${m.best > 0 ? `Steps today: ${m.best} steps.` : 'No steps recorded today yet.'}`
      );
      if (own.achieved && !ownAchievedAction) {
        ownAchievedAction = `Daily ${m.target}-step goal reached today.`;
      }
      continue;
    }
    const goalText = m.metric === 'weight' ? formatWeight(m.target) : `${m.target} reps`;
    const bestText = m.metric === 'weight' ? formatWeight(m.best) : `${m.best} reps`;
    facts.push(`Your own goal: ${goalText} on ${m.exerciseName}. ${m.best > 0 ? `Best so far: ${bestText}.` : 'It has not been logged yet.'}`);
    if (own.achieved && !ownAchievedAction) {
      ownAchievedAction = `Goal reached: ${goalText} on ${m.exerciseName}.`;
    } else if (!ownLiftAction) {
      ownLiftAction =
        m.best > 0
          ? `${m.exerciseName}: ${goalText} goal (best ${bestText}).`
          : `${m.exerciseName}: log a set to start toward ${goalText}.`;
    }
  }

  if (ownAchievedAction) actionSentence = ownAchievedAction;
  else if (strengthAction) actionSentence = strengthAction;
  else if (ownLiftAction) actionSentence = ownLiftAction;
  else if (body?.nextStep) actionSentence = body.nextStep;
  else if (!strength) actionSentence = 'Log your weight to unlock strength level targets.';

  const sentences = [leadSentence, actionSentence].filter(Boolean);
  const hasActiveOwnProgress = activeGoals(goals).some(
    (g) => g.measure.type === 'target' && (g.achieved || (g.measure as Extract<AthleteGoal['measure'], { type: 'target' }>).best > 0)
  );
  const sparse =
    (frequency?.thisWeek ?? 0) === 0 &&
    (frequency?.streakWeeks ?? 0) === 0 &&
    (body?.signsMeasured ?? 0) === 0 &&
    !strength &&
    !hasActiveOwnProgress;
  return { facts, fallback: sentences.join(' '), sparse };
}

const NUMBER = /\d+(?:\.\d+)?/g;
const stripCommas = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, '$1');

/** The cleaned summary, or why it can't be shown (in words the model can act on in a second try). */
export function checkGoalsSummary(answer: string | null, summary: Pick<GoalsSummary, 'facts'>): { text: string; problem?: undefined } | { text?: undefined; problem: string } {
  if (!answer) return { problem: 'it was empty' };
  const text = normalizeSummaryVoice(answer, {
    prefixPattern: /^\s*(summary|message|note)\s*:\s*/i,
  });
  if (text.length < 40) return { problem: 'it was too short' };
  if (text.length > 250) return { problem: 'it was too long; write two concise sentences under 250 characters' };
  if ((text.match(/[.!?](\s|$)/g) || []).length > 3) return { problem: 'it had too many sentences; write two' };
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return { problem: 'it talked about itself or "the facts"' };
  const qa = runReadAloudQaGate(text);
  if (!qa.passed) {
    return { problem: `it failed the coaching voice gate (${(qa.violations[0] || 'hype, cliché, or judgmental wording').toLowerCase()})` };
  }
  const voiceProblem = checkSummaryVoiceGuidelines(text);
  if (voiceProblem) return { problem: voiceProblem };
  if (/\b(felt|feel|feeling|enjoy(ed)?|loved)\b/i.test(text)) return { problem: 'it said how the athlete felt, which is not known' };
  if (/\b(significant\w*|dramatic\w*|huge|massive|incredibl\w*|amazing|awesome)\b/i.test(text)) return { problem: 'it used a size or hype word the facts do not support' };
  if (/\b(consistent\w*|dedicat\w*|progressing well|going well|great|excellent|impressive|solid|strong (work|effort|progress)|(good|nice) (work|job|session)|well done|keep it up|(on|staying on) (schedule|track))\b/i.test(text)) return { problem: 'it praised consistency or quality that the facts do not show; state the figures plainly' };
  if (/\b(cannot be|can't be|unable to) (assessed|measured|determined|evaluated)\b|\binsufficient\b|\bno data\b/i.test(text)) return { problem: 'it said something cannot be assessed; say what to do next instead' };
  const allowed = new Set(stripCommas(summary.facts.join(' ')).match(NUMBER) || []);
  const strange = (stripCommas(text).match(NUMBER) || []).find((n) => !allowed.has(n));
  if (strange) return { problem: `it used the number ${strange}, which is not in the facts` };
  const spelled = spelledNumberNotInFacts(text, summary.facts);
  if (spelled) return { problem: `it used the number "${spelled}", which is not in the facts` };
  const wrongUnit = mismatchedWeightUnit(text, summary.facts);
  if (wrongUnit) return { problem: `it used the weight unit "${wrongUnit}", which does not match the facts` };
  const mislabelled = mislabelledFigure(text, summary.facts);
  if (mislabelled) return { problem: `it said "${mislabelled}", but the facts count that figure in something else` };
  return { text };
}

/** Asks the on-device model for the goals summary. Null when no model is ready or its answers fail the checks. */
export async function generateGoalsSummary(
  summary: Pick<GoalsSummary, 'facts' | 'systemPrompt'> & Partial<Pick<GoalsSummary, 'sparse'>>,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  if (summary.sparse) return null;
  const isLive = prompt === promptOnDeviceModel;
  const rejectKey = `goals:${goalsKey(summary)}`;
  if (isLive) {
    const cached = getCachedGoalsSummary(summary);
    if (cached) return cached;
    if (wasPromptRejected(rejectKey)) return null;
  }

  const run = async (): Promise<string | null> => {
    let problem: string | undefined;
    let sawModelAnswer = false;
    const systemPrompt = summary.systemPrompt ?? GOALS_SUMMARY_SYSTEM_PROMPT;
    const base = `Facts:\n${summary.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the summary.`;
    // A model that throws is the same as no model: the fact-based text stays.
    try {
      for (let i = 0; i < attempts; i++) {
        const request = problem ? `${base}\n(Your last summary could not be used because ${problem}. Write it again.)` : base;
        const answer = await prompt(systemPrompt, request, { stateless: true, maxTokens: 120, timeoutMs: 30_000 });
        if (answer === null) return null;
        sawModelAnswer = true;
        const checked = checkGoalsSummary(answer, summary);
        if (checked.problem === undefined) return checked.text;
        problem = checked.problem;
      }
      if (isLive && sawModelAnswer) markPromptRejected(rejectKey);
    } catch {
      return null;
    }
    return null;
  };

  if (isLive) {
    return coalesceAiGeneration(rejectKey, run, (text) => cacheGoalsSummary(summary, text));
  }
  return run();
}

const GOALS_CACHE_KEY = 'treise_goals_summary_v1';

function goalsKey(summary: Pick<GoalsSummary, 'facts' | 'systemPrompt'>): string {
  const systemPrompt = summary.systemPrompt ?? GOALS_SUMMARY_SYSTEM_PROMPT;
  const text = `${systemPrompt}\n${summary.facts.join('\n')}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The written summary saved for these facts, if it still passes the checks. */
export function getCachedGoalsSummary(summary: Pick<GoalsSummary, 'facts' | 'systemPrompt'>): string | null {
  const hit = readCachedAiText(GOALS_CACHE_KEY, goalsKey(summary));
  const checked = typeof hit === 'string' ? checkGoalsSummary(hit, summary) : null;
  return checked && checked.problem === undefined ? checked.text : null;
}

export function cacheGoalsSummary(summary: Pick<GoalsSummary, 'facts' | 'systemPrompt'>, text: string): void {
  writeCachedAiText(GOALS_CACHE_KEY, goalsKey(summary), text, 16);
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
