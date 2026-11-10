/**
 * Coach answers about the athlete's own plan and data. Each figure comes from the same function the
 * app's pages use, so the coach never tells a different story from the screen:
 * - plan position: buildPlanOverview (Program page), with the plan from resolveActivePlan
 * - streak: computeTrainingStreak (header)
 * - whether to train today: evaluateSessionRecovery (Workout page rest card)
 * - rest times: planRestAfterSet (the rest timer)
 * - weekly sets and targets: the knowledge graph's muscle profiles (exercise cards, Progress)
 * - weight changes: the double progression rule (PROGRESSION_RULES), read from the logged sets
 */
import { ActivityLog, activeDayDates } from '../engine/activeDays';
import { AthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { buildPlanOverview, planWorkoutLabel } from '../engine/muscleBuildingProgram';
import { findLastCompletedExerciseSession } from '../engine/progression';
import { hadQualityEffort } from '../engine/progressionRules';
import { computeTrainingStreak, evaluateSessionRecovery, formatReadyTime, MUSCLE_FRIENDLY_NAMES } from '../engine/recovery';
import { resolveActivePlan } from '../engine/trainingPlans';
import {
  ExerciseDefinition,
  ExerciseSession,
  ReadinessState,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { formatWeight, WeightUnit } from '../utils/units';
import { planRestAfterSet } from './setCompletion';

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Where the athlete is in their plan, exactly as the Program page shows it. */
export function planPosition(profile: UserProfile, workouts: WorkoutSession[], activities: ActivityLog[] = []) {
  const plan = resolveActivePlan(profile);
  const overview = buildPlanOverview(workouts, plan, activities);
  const total = plan.templates.length;
  const next = plan.templates.find((t) => t.workoutNumber === overview.nextWorkoutNumber);
  const week = next?.week ?? Math.min(6, Math.ceil(overview.nextWorkoutNumber / plan.workoutsPerWeek));
  const phase = plan.phases.find((p) => p.phaseNumber === (next?.phase ?? overview.activePhase)) ?? plan.phases[0];
  return {
    plan,
    overview,
    total,
    week,
    phase,
    nextNumber: overview.nextWorkoutNumber,
    nextLabel: next ? planWorkoutLabel(next.title) : undefined,
    remaining: Math.max(0, total - overview.completedCount),
  };
}

export function answerPlanPosition(profile: UserProfile, workouts: WorkoutSession[], activities: ActivityLog[] = []): string {
  const p = planPosition(profile, workouts, activities);
  const done = p.overview.completedCount;
  const parts = [
    `You're in week ${p.week} of 6 of your ${p.plan.name}, in Phase ${p.phase.phaseNumber} (${p.phase.shortName.toLowerCase()}).`,
    `${done} of ${p.total} sessions are done, so ${plural(p.remaining, 'session')} ${p.remaining === 1 ? 'is' : 'are'} left.`,
  ];
  if (p.nextLabel) parts.push(`Next up is session ${p.nextNumber}: ${p.nextLabel}.`);
  parts.push(p.phase.planSummary);
  return parts.join(' ');
}

export function answerStreak(workouts: WorkoutSession[], activities: ActivityLog[] = [], now = Date.now()): string {
  const streak = computeTrainingStreak(workouts, now, activeDayDates(activities));
  if (streak === 0) {
    return "Your streak is at 0 right now. Your next workout or active day starts it again, and nothing you've built is lost.";
  }
  return `Your streak is ${plural(streak, 'day')}. Rest days of up to 4 days between sessions keep it going, so recovering never breaks it.`;
}

/** The same check as the Workout page: recovery of the muscles today's workout trains, then readiness. */
export function answerShouldTrain(
  activeWorkout: WorkoutSession,
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  readinessState: ReadinessState,
  now = Date.now()
): string {
  const gate = evaluateSessionRecovery(activeWorkout, workouts, exerciseCatalog, now);
  if (gate.trainedToday && !activeWorkout.exercises.some((ex) => ex.sets.some((s) => s.completed))) {
    const when = gate.readyAt ? formatReadyTime(gate.readyAt, now) : 'soon';
    return `You've already trained today, so today is for recovery. ${activeWorkout.name} will be ready ${when}.`;
  }
  if (!gate.isReady) {
    const slowest = gate.limitingMuscles
      .slice(0, 3)
      .map((m) => `${MUSCLE_FRIENDLY_NAMES[m.muscle] ?? m.muscle} ${Math.round(m.recoveryPct)}%`)
      .join(', ');
    const when = gate.readyAt ? formatReadyTime(gate.readyAt, now) : 'soon';
    return `Not yet. The muscles in ${activeWorkout.name} are still recovering (${slowest}), and it will be ready ${when}. Training them early means less growth, not more. If you want to move today, an active day like a ride or walk counts toward your plan.`;
  }
  if (readinessState === 'Amber Shield') {
    return `Yes, but go easier. Your muscles have recovered for ${activeWorkout.name}, but your recovery is low today, so your weights are held steady and you stop 2–3 reps short of failure.`;
  }
  if (readinessState === 'Primed') {
    return `Yes. Your muscles have recovered for ${activeWorkout.name} and your recovery is high, so it's a good day to push your first working sets.`;
  }
  return `Yes. Your muscles have recovered for ${activeWorkout.name}. Follow today's targets as planned.`;
}

/** Rest times for today's exercises, exactly what the rest timer will count. */
export function answerRestTimes(activeWorkout: WorkoutSession): string {
  const label = (s: number) => (s === 0 ? 'no rest (go straight to the next exercise)' : s % 60 === 0 ? plural(s / 60, 'minute') : s > 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} seconds`);
  const groups = new Map<number, string[]>();
  for (const ex of activeWorkout.exercises) {
    const firstSet = ex.sets.find(isWorking);
    if (!firstSet) continue;
    const seconds = planRestAfterSet(activeWorkout, ex, firstSet.id).seconds;
    groups.set(seconds, [...(groups.get(seconds) ?? []), ex.name]);
  }
  if (groups.size === 0) return 'There are no exercises in today\'s workout yet.';
  const lines = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([seconds, names]) => `• ${label(seconds)}: ${names.join(', ')}`);
  return `Rest times for ${activeWorkout.name}, the same ones your rest timer counts:\n${lines.join('\n')}\n\nLonger rests on the big lifts let you keep the weight and reps up; smaller muscles recover faster between sets.`;
}

/** Plain muscle words athletes use, mapped to the knowledge graph's muscles. */
const MUSCLE_WORDS: { re: RegExp; keys: string[]; specific?: boolean }[] = [
  { re: /\bchest|pecs?\b/, keys: ['Chest'] },
  { re: /\bback|lats?\b/, keys: ['Back'] },
  { re: /\bshoulders?|delts?\b/, keys: ['SideDelts', 'RearDelts', 'FrontDelts'] },
  { re: /\bside (shoulders?|delts?)\b/, keys: ['SideDelts'], specific: true },
  { re: /\brear (shoulders?|delts?)\b/, keys: ['RearDelts'], specific: true },
  { re: /\bquads?|front thighs?\b/, keys: ['Quads'] },
  { re: /\bhams?(trings?)?\b/, keys: ['Hamstrings'] },
  { re: /\bglutes?\b/, keys: ['Glutes'] },
  { re: /\bcalf|calves\b/, keys: ['Calves'] },
  { re: /\bbiceps?\b/, keys: ['Biceps'] },
  { re: /\btriceps?\b/, keys: ['Triceps'] },
  { re: /\barms?\b/, keys: ['Biceps', 'Triceps'] },
  { re: /\blegs?\b/, keys: ['Quads', 'Hamstrings', 'Glutes', 'Calves'] },
  { re: /\b(abs|core)\b/, keys: ['Core'] },
];

/** The muscles a message names, most specific first (so "rear delts" doesn't mean every shoulder). */
export function musclesNamed(lowerMsg: string): string[] {
  const specific = MUSCLE_WORDS.filter((m) => m.specific && m.re.test(lowerMsg)).flatMap((m) => m.keys);
  if (specific.length) return specific;
  return [...new Set(MUSCLE_WORDS.filter((m) => m.re.test(lowerMsg)).flatMap((m) => m.keys))];
}

/**
 * This week's hard sets against the knowledge graph's target, worded like the exercise cards
 * ("7 of 13–19 hard sets"). With no muscle named, the muscles furthest below target.
 */
export function answerWeeklySets(lowerMsg: string, kg: AthleteKnowledgeGraph): string {
  const named = musclesNamed(lowerMsg);
  const profiles = named.length
    ? kg.muscleProfiles.filter((m) => named.includes(m.muscleKey))
    : [...kg.muscleProfiles].sort((a, b) => a.weeklySets / a.personalizedMav[0] - b.weeklySets / b.personalizedMav[0]).slice(0, 3);
  if (profiles.length === 0) {
    return "Your plan doesn't set a weekly target for that muscle, so there's nothing to compare yet. Ask me about chest, back, shoulders, arms or legs.";
  }
  const lines = profiles.map((m) => {
    const [min, max] = m.personalizedMav;
    const status =
      m.weeklySets < min
        ? `below target, ${m.weeklySets === 0 ? `${min}` : `${Math.round((min - m.weeklySets) * 10) / 10}`} to go`
        : m.weeklySets > max
        ? 'above target, so ease off for the rest of the week'
        : 'on target';
    return `• ${m.displayName}: ${m.weeklySets} of ${min}–${max} hard sets this week (${status}).`;
  });
  const intro = named.length ? '' : 'The muscles furthest from this week\'s target:\n';
  return `${intro}${lines.join('\n')}\n\nA hard set is a working set taken within about 3 reps of failure; a muscle that only helps counts half. Your plan builds toward these targets across the 6 weeks.`;
}

/** True when a message asks about training volume rather than a joint or pain. */
export function asksAboutVolume(lowerMsg: string): boolean {
  return /\b(sets?|volume|enough|target|how much (training|work)|training (enough|my))\b/.test(lowerMsg) && musclesNamed(lowerMsg).length + (/\bsets?\b/.test(lowerMsg) ? 1 : 0) > 0;
}

/**
 * Why an exercise's weight or reps changed since last time, from the logged sets and the double
 * progression rule (the same reasoning that set today's targets).
 */
export function answerWeightChange(
  lowerMsg: string,
  activeWorkout: WorkoutSession,
  workouts: WorkoutSession[],
  readinessState: ReadinessState,
  unit: WeightUnit
): string {
  const words = (name: string) => name.toLowerCase().split(/[\s()-]+/).filter((w) => w.length > 3 && !['dumbbell', 'barbell', 'cable', 'seated', 'machine'].includes(w));
  // The exercise(s) the message names best: "incline press" is the incline press, not every press.
  const scored = activeWorkout.exercises.map((ex) => ({ ex, hits: words(ex.name).filter((w) => lowerMsg.includes(w.replace(/s$/, ''))).length }));
  const best = Math.max(0, ...scored.map((s) => s.hits));
  const named = best > 0 ? scored.filter((s) => s.hits === best).map((s) => s.ex) : [];
  const explain = (ex: ExerciseSession): string | null => {
    const today = ex.sets.filter(isWorking);
    if (!today.length) return null;
    const todayKg = today[0].targetWeightKg;
    const todayReps = today.map((s) => s.targetReps);
    const last = findLastCompletedExerciseSession(ex.exerciseId, workouts);
    if (!last) return `${ex.name}: first time, so today's ${formatWeight(todayKg, unit)} is a starting point worked out from your other lifts. Your first sets show where you really are.`;
    const done = last.session.sets.filter((s) => s.completed && isWorking(s));
    if (!done.length) return null;
    const lastKg = Math.max(...done.map((s) => s.actualWeightKg ?? s.targetWeightKg));
    const lastReps = done.map((s) => s.actualReps ?? s.targetReps);
    const top = last.session.maxReps;
    const allAtTop = done.length === last.session.sets.filter(isWorking).length && done.every((s) => (s.actualReps ?? s.targetReps) >= top && hadQualityEffort(s.actualRir, s.targetRir));
    const repsText = (r: number[]) => r.join(', ');
    if (readinessState === 'Amber Shield' && todayKg <= lastKg) {
      return `${ex.name}: held at ${formatWeight(todayKg, unit)} because your recovery is low today.`;
    }
    if (todayKg > lastKg + 0.01) {
      if (ex.minReps !== last.session.minReps || ex.maxReps !== last.session.maxReps) {
        return `${ex.name}: ${formatWeight(lastKg, unit)} → ${formatWeight(todayKg, unit)} because your rep range changed to ${ex.minReps}–${ex.maxReps}, and the weight was matched to what you lifted.`;
      }
      return allAtTop
        ? `${ex.name}: ${formatWeight(lastKg, unit)} → ${formatWeight(todayKg, unit)} because every set reached the top of ${top} reps last time (${repsText(lastReps)}). Reps go back to ${ex.minReps} and build up again.`
        : `${ex.name}: ${formatWeight(lastKg, unit)} → ${formatWeight(todayKg, unit)}, matched to how many reps you managed last time (${repsText(lastReps)}).`;
    }
    if (todayKg < lastKg - 0.01) {
      return `${ex.name}: ${formatWeight(lastKg, unit)} → ${formatWeight(todayKg, unit)} because your best set last time (${Math.max(...lastReps)} reps) was under the ${last.session.minReps}–${top} range, so the weight was matched to what you could lift.`;
    }
    const repsUp = todayReps.some((r, i) => r > (lastReps[i] ?? 0));
    return repsUp
      ? `${ex.name}: same ${formatWeight(todayKg, unit)}, aiming for ${repsText(todayReps)} reps (last time ${repsText(lastReps)}). The weight goes up once every set reaches ${ex.maxReps}.`
      : `${ex.name}: same ${formatWeight(todayKg, unit)} and reps as last time, so you can match them cleanly before adding more.`;
  };
  const targets = named.length ? named : activeWorkout.exercises;
  const lines = targets.map(explain).filter((l): l is string => Boolean(l));
  if (!lines.length) return "I couldn't find a logged session to compare with yet. Once you've done an exercise, I can tell you why its weight changes.";
  const rule = 'Weights rise only when every set reaches the top of the rep range with reps to spare; otherwise you add reps first.';
  return `${named.length ? '' : `Here's how today's ${activeWorkout.name} compares with last time:\n`}${lines.map((l) => `• ${l}`).join('\n')}\n\n${rule}`;
}
