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
import { BiometricLog } from '../engine/types';
import { isActiveSlot } from '../engine/muscleBuildingProgram';
import { formatPreciseWeight, formatWeight, WeightUnit } from '../utils/units';
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

const KIT_NAME_WORDS = /\b(dumbbells?|dbs?|barbells?|cables?|machines?|seated|standing|heels-elevated)\b/g;
/** A plural "s" off the end, but never the "ss" of "press". */
const singular = (word: string) => word.replace(/(?<!s)s$/, '');

/** The exercise's name without its kit, e.g. "Cable Chest Press" → "chest press". */
function exerciseCore(name: string): string {
  return singular(name.toLowerCase().replace(/\([^)]*\)/g, '').replace(KIT_NAME_WORDS, '').replace(/\s+/g, ' ').trim());
}

/**
 * True when a message names this exercise: its last two words ("chest press", also inside
 * "cable chest press") or its last word ("rows").
 */
export function exerciseNamedIn(text: string, name: string): boolean {
  const words = exerciseCore(name).split(' ').filter(Boolean);
  if (!words.length) return false;
  const plain = text.replace(KIT_NAME_WORDS, '').replace(/\s+/g, ' ');
  if (words.length >= 2 && plain.includes(words.slice(-2).join(' '))) return true;
  const last = singular(words[words.length - 1]).replace(/[^a-z]/g, '');
  return last.length >= 3 && new RegExp(`\\b${last}(es|s)?\\b`).test(text);
}

/**
 * The exercise a message names: one of today's first, else the library exercise whose name
 * (without its kit) appears in the message, longest name first so "incline press" beats "press".
 */
export function findExerciseNamed(
  lowerMsg: string,
  activeWorkout: WorkoutSession,
  exerciseCatalog: ExerciseDefinition[]
): { session?: ExerciseSession; def?: ExerciseDefinition } | null {
  const text = lowerMsg
    .replace(/\brdls?\b/g, 'romanian deadlift')
    .replace(/\bohp\b/g, 'overhead press')
    .replace(/\bincline (?:dumbbell |db |barbell )?bench press\b/g, 'incline press')
    .replace(/\bpull ?ups?\b/g, 'pull-up')
    .replace(/\bpush ?ups?\b/g, 'push-up');
  const plain = text.replace(KIT_NAME_WORDS, '').replace(/\s+/g, ' ');
  // The full name first, so "incline press" or "leg press" finds that exercise and not a generic "press" in today's list.
  const activeMatch = activeWorkout.exercises
    .map((e) => ({ e, core: exerciseCore(e.name) }))
    .filter(({ core }) => core.length >= 4 && plain.includes(core))
    .sort((a, b) => b.core.length - a.core.length)[0];
  const kitNamed = (d: ExerciseDefinition) =>
    (d.equipment === 'dumbbell' && /\b(dumbbells?|dbs?)\b/.test(text)) ||
    (d.equipment === 'cable' && /\bcables?\b/.test(text)) ||
    (d.equipment === 'barbell' && /\bbarbells?\b/.test(text)) ||
    (d.equipment === 'machine' && /\bmachines?\b/.test(text));
  const catalogMatch = exerciseCatalog
    .map((d) => ({ d, core: exerciseCore(d.name) }))
    .filter(({ core }) => core.length >= 4 && plain.includes(core))
    .sort((a, b) => b.core.length - a.core.length || Number(kitNamed(b.d)) - Number(kitNamed(a.d)) || (a.d.equipment === 'barbell' ? -1 : 1))[0];
  if (activeMatch && activeMatch.core.length >= (catalogMatch?.core.length ?? 0)) {
    return { session: activeMatch.e, def: exerciseCatalog.find((d) => d.id === activeMatch.e.exerciseId) };
  }
  if (catalogMatch) {
    const inSession = activeWorkout.exercises.find((e) => e.exerciseId === catalogMatch.d.id);
    return { session: inSession, def: catalogMatch.d };
  }
  const session = activeWorkout.exercises.find((e) => exerciseNamedIn(text, e.name));
  if (session) return { session, def: exerciseCatalog.find((d) => d.id === session.exerciseId) };
  // A distinctive last word on its own ("lunges", "pulldowns"), but not one shared by many lifts.
  const byWord = exerciseCatalog.find((d) => {
    const last = exerciseCore(d.name).split(' ').pop() ?? '';
    return last.length >= 5 && !/^(press|raise|curl|extension|squat|deadlift|crunch|bridge|thrust)$/.test(last) && exerciseNamedIn(text, last);
  });
  return byWord ? { def: byWord } : null;
}

const KIT_WORDS: { re: RegExp; kit: string; label: string }[] = [
  { re: /\bbarbells?\b|\bbar\b/, kit: 'barbell', label: 'a barbell' },
  { re: /\bdumbbells?\b|\bdbs?\b/, kit: 'dumbbell', label: 'dumbbells' },
  { re: /\bcables?\b/, kit: 'cable', label: 'a cable machine' },
  { re: /\bmachines?\b/, kit: 'machine', label: 'a machine' },
];

/**
 * Swap questions, answered from today's workout. Never suggests swapping an exercise that isn't in
 * today's workout, and never suggests kit the athlete just said they don't have.
 */
export function answerSwap(lowerMsg: string, activeWorkout: WorkoutSession, exerciseCatalog: ExerciseDefinition[]): string {
  return answerSwapWithOptions(lowerMsg, activeWorkout, exerciseCatalog).text;
}

/** The swap answer plus the exercises it suggests (for the chat's option chips). */
export function answerSwapWithOptions(
  lowerMsg: string,
  activeWorkout: WorkoutSession,
  exerciseCatalog: ExerciseDefinition[]
): { text: string; options: ExerciseDefinition[] } {
  const options: ExerciseDefinition[] = [];
  const text = buildSwapAnswer(lowerMsg, activeWorkout, exerciseCatalog, options);
  return { text, options };
}

function buildSwapAnswer(lowerMsg: string, activeWorkout: WorkoutSession, exerciseCatalog: ExerciseDefinition[], suggested: ExerciseDefinition[]): string {
  const today = activeWorkout.exercises;
  const list = today.map((e) => e.name).join(', ');
  const where = activeWorkout.location ?? 'gym';
  const lacking = /\b(don['’]?t have|do not have|no|without|isn'?t free|taken|busy|in use|broken|full|occupied)\b/.test(lowerMsg)
    ? KIT_WORDS.find((k) => k.re.test(lowerMsg))
    : undefined;
  const optionFor = (ex: ExerciseSession, avoidKit?: string): ExerciseDefinition | undefined => {
    const def = exerciseCatalog.find((d) => d.id === ex.exerciseId);
    const fits = (d: ExerciseDefinition) =>
      d.id !== ex.exerciseId && d.equipment !== avoidKit && (!d.environments || d.environments.includes(where)) && !today.some((t) => t.exerciseId === d.id);
    // Closest match first: same movement family, then the most words in common ("incline"), then the same kit.
    const words = exerciseCore(ex.name).split(' ');
    const score = (d: ExerciseDefinition) =>
      (def?.movementFamily && d.movementFamily === def.movementFamily ? 4 : 0) +
      2 * exerciseCore(d.name).split(' ').filter((w) => words.includes(w)).length +
      (d.equipment === ex.equipment ? 1 : 0) +
      // The athlete asked for it by name, or by its kit ("swap bench for dumbbell bench").
      (lowerMsg.includes(d.name.toLowerCase()) ? 8 : 0) +
      (d.equipment !== ex.equipment && KIT_WORDS.some((k) => k.kit === d.equipment && k.re.test(lowerMsg.replace(ex.name.toLowerCase(), ''))) ? 5 : 0);
    const picked = exerciseCatalog
      .filter((d) => fits(d) && d.pillar === ex.pillar && d.primaryMuscle === def?.primaryMuscle)
      .map((d, i) => ({ d, i, s: score(d) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)[0]?.d;
    if (picked) suggested.push(picked);
    return picked;
  };
  const how = 'Tap the swap button on the exercise in your workout to see every option; sets you have logged stay as they are.';
  const named = findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog);

  if (named?.session) {
    const ex = named.session;
    const option = optionFor(ex, lacking?.kit);
    const wanted = !lacking ? KIT_WORDS.find((k) => k.kit !== ex.equipment && k.re.test(lowerMsg.replace(ex.name.toLowerCase(), ''))) : undefined;
    if (option && wanted && option.equipment !== wanted.kit) {
      return `I don't have a like-for-like option for **${ex.name}** on ${wanted.label}. The closest swap is **${option.name}**: it trains the same muscles (${MUSCLE_FRIENDLY_NAMES[option.primaryMuscle] ?? option.primaryMuscle}). ${how}`;
    }
    return option
      ? `You can swap **${ex.name}** for **${option.name}**: it trains the same muscles (${MUSCLE_FRIENDLY_NAMES[option.primaryMuscle] ?? option.primaryMuscle}). ${how}`
      : `${how} I couldn't find a like-for-like option for ${ex.name} where you're training today.`;
  }
  if (named?.def && !lacking) {
    return `${named.def.name} isn't in today's workout (${activeWorkout.name}), so there's nothing to swap today. Today's exercises are: ${list}. Tell me which of those you want to change.`;
  }
  if (lacking) {
    const affected = today.filter((e) => e.equipment === lacking.kit);
    if (!affected.length) {
      return `None of today's exercises need ${lacking.label}, so you can do ${activeWorkout.name} as planned: ${list}.`;
    }
    const lines = affected.map((ex) => {
      const option = optionFor(ex, lacking.kit);
      return option ? `• ${ex.name} → ${option.name}` : `• ${ex.name}: tap its swap button to see what's available`;
    });
    return `Without ${lacking.label}, these exercises in today's workout need a swap:\n${lines.join('\n')}\n\n${how}`;
  }
  return `Which exercise do you want to change? Today's are: ${list}. ${how}`;
}

export interface EverydayContext {
  lowerMsg: string;
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  activities?: ActivityLog[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  readinessState: ReadinessState;
  /** 7-day average bodyweight; only shown when the athlete has logged a weigh-in. */
  bodyweightEmaKg: number;
  /** The strength-levels answer (Progress → Strength standards), for "what's my weakest lift". */
  strengthLevels: () => string;
  /** This week's hard sets against target for the muscles a message names (the exercise cards' count). */
  weeklySets?: (message: string) => string;
  /** The same progress summary the coach gives for "am I getting stronger". */
  progressSummary: () => string;
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const friendly = (m: string) => (MUSCLE_FRIENDLY_NAMES[m as keyof typeof MUSCLE_FRIENDLY_NAMES] ?? m).toLowerCase();
const listAnd = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const daysAgoText = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);

function completedByTime(workouts: WorkoutSession[]): WorkoutSession[] {
  return workouts.filter((w) => w.completed).sort((a, b) => (a.completedAt || a.date).localeCompare(b.completedAt || b.date));
}

/** Today's effort target in plain words, from the plan's own reps in reserve. */
function effortToday(activeWorkout: WorkoutSession, readinessState: ReadinessState): string {
  if (readinessState === 'Amber Shield') return '2–3 reps to spare (your recovery is low today)';
  const rirs = [...new Set(activeWorkout.exercises.flatMap((e) => e.sets.filter(isWorking).map((s) => s.targetRir)).filter((r): r is number => typeof r === 'number'))].sort((a, b) => a - b);
  if (!rirs.length) return '1–2 reps to spare';
  if (rirs.length === 1) return rirs[0] === 0 ? 'no reps to spare (all-out sets)' : `${plural(rirs[0], 'rep')} to spare`;
  return `${rirs[0]}–${rirs[rirs.length - 1]} reps to spare, depending on the exercise`;
}

/**
 * Everyday questions athletes actually ask ("I only have 30 minutes", "should I train to failure",
 * "I missed a week"), answered from their plan and logged data. Returns null when the message isn't
 * one of these, so the rest of the coach can answer. Nothing here is estimated: a figure that hasn't
 * been logged is said to be missing.
 */
export function answerEverydayQuestion(ctx: EverydayContext): string | null {
  const { lowerMsg: msg, profile, activeWorkout, workouts, exerciseCatalog, readinessState, biometrics } = ctx;
  const activities = ctx.activities ?? [];
  const now = ctx.now ?? Date.now();
  const unit = profile.weightUnit || 'kg';
  // Formula and research questions belong to the science cards.
  if (/\b(formula|citation|research|stud(y|ies)|multiplier|calculat\w*|worked out)\b/.test(msg)) return null;
  const today = activeWorkout.exercises;
  // The Workout page's own check, without its leading "Yes." / "Not yet." so it reads on after another sentence.
  const shouldTrain = () => answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState, now).replace(/^(Yes|Not yet)\. /, '');
  const readyToTrain = () => /^Yes/.test(answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState, now));
  const done = completedByTime(workouts);
  const words = msg.split(/\s+/).length;

  // Thanks.
  if (/^(thanks|thank you|thankyou|thx|cheers|ta|ok thanks|great thanks|perfect|awesome|nice one|got it|ok|okay|cool)\b/.test(msg) && words <= 4) {
    return `Any time. Next up is ${activeWorkout.name}.`;
  }

  // How hard to push: reps in reserve and failure, from today's plan.
  if (/\b(to failure|till failure|until failure|failure|rir|reps? in reserve|reps? to spare|left in the tank|how hard (should|do) i)\b/.test(msg) && !/\be?1rm\b/.test(msg)) {
    return `Reps in reserve (RIR) is how many more good reps you could have done when you stop a set. Today's plan asks you to stop with ${effortToday(activeWorkout, readinessState)}. Stopping just short of failure builds muscle about as well as going all the way, with much less fatigue, so you recover in time for your next workout. Going to failure on every set mostly costs you reps on the sets that follow.`;
  }

  // More than the plan: twice a day, every day.
  if (/\b(twice|two (workouts|sessions)|2 (workouts|sessions)|double session|(another|second|extra) (workout|session))\b/.test(msg) || /\b(train|lift|work ?out)\w* (every ?day|daily|7 days)\b/.test(msg)) {
    return `Stick to one workout a day. Muscle is built while you recover, so a second session on the same day takes away from your next one instead of adding to it. Your plan is 4 sessions a week. If you want to do more today, an easy walk, ride or swim of 20 minutes or more counts as an active day.`;
  }

  // Short on time.
  if (/\b(short on time|in a (rush|hurry)|not much time|pressed for time|running late|limited time|quick (workout|session)|shorter (workout|session))\b/.test(msg) || (/\b\d+ ?(min|mins|minutes)\b/.test(msg) && /\b(only|just|have|got)\b/.test(msg) && !/\brest\b/.test(msg))) {
    const first = today.slice(0, 3).map((e) => e.name);
    if (!first.length) return "There's nothing planned in today's workout to shorten.";
    return `Short on time: do today's exercises in order and stop when your time is up. The ones to keep are the first in the list: ${listAnd(first)}. Keep the planned rest on those so the weight and reps hold. Every set you log counts, and your plan carries on from what you logged.`;
  }

  // How long the workout takes: only from measured times.
  if (/\bhow long\b.*\b(take|workout|session|today|last)\b|\bhow much time\b/.test(msg) && !/\brest\b/.test(msg)) {
    const working = today.reduce((n, e) => n + e.sets.filter(isWorking).length, 0);
    const timed = done.filter((w) => (w.durationMinutes ?? 0) > 0);
    const same = timed.filter((w) => w.name === activeWorkout.name).slice(-3);
    const pool = same.length ? same : timed.slice(-5);
    if (!pool.length) {
      return `I don't have a measured time for you yet. Today is ${plural(today.length, 'exercise')} and ${plural(working, 'working set')}; once you finish a workout, I'll know how long yours take (first logged set to finish).`;
    }
    const mins = pool.map((w) => Math.round(w.durationMinutes!));
    const lo = Math.min(...mins);
    const hi = Math.max(...mins);
    const span = lo === hi ? `${lo} minutes` : `${lo}–${hi} minutes`;
    return `${same.length ? `Your last ${same.length === 1 ? '' : `${same.length} `}${activeWorkout.name} ${same.length === 1 ? 'workout' : 'workouts'}` : `Your last ${plural(pool.length, 'workout')}`} took ${span}, measured from your first logged set to finish. Today is ${plural(today.length, 'exercise')} and ${plural(working, 'working set')}.`;
  }

  // Missed sessions and restarting.
  if (/\b(missed|miss(ing)?|fell off|off track|haven'?t (trained|been)|been away|been (ill|sick)|took (a|some) (week|weeks|time|break)|time off|start(ing)? again|restart\w*|get(ting)? back (into|to)|skip(ped|ping)?)\b/.test(msg)) {
    const p = planPosition(profile, workouts, activities);
    const last = done[done.length - 1];
    const gap = last ? Math.floor((now - new Date(last.completedAt || last.date).getTime()) / DAY_MS) : 0;
    const next = p.nextLabel ? `Your next session is still ${p.nextLabel} (${p.nextNumber} of ${p.total})` : `Your next session is ${activeWorkout.name}`;
    if (/\bskip\b/.test(msg) && !/\b(skipped|missed)\b/.test(msg)) {
      return `You can leave a workout for another day and it waits for you, but the plan doesn't drop it: each session trains muscles that need their sets that week. ${next}. If something about it is the problem (time, kit, or an exercise you don't like), tell me which and I'll help you change that instead.`;
    }
    return `Missing a workout, or a week, doesn't undo what you've built, and there's nothing to make up. ${next}, exactly where you left it.${gap >= 10 ? ` It's been ${gap} days since your last workout, so the first one back may feel harder than you remember. Log what you manage and your plan sets the next weights from that.` : ''} Restarting is the skill that matters most.`;
  }

  // Normal muscle soreness (pain goes to the safety reply before this runs).
  if (/\b(sore|soreness|doms|stiff|aching|achy)\b/.test(msg)) {
    return `Muscle soreness for a day or two after training is normal, especially with new exercises. It isn't damage, and it isn't a measure of a good workout. ${shouldTrain()} Sharp pain or pain in a joint is different: stop that movement and tell me.`;
  }

  // Bad night, or feeling good.
  if (/\b(slept|sleep) (badly|bad|poorly|terribly|awful)\b|\bbad(ly)? (night|sleep)\b|\b(didn'?t|did not|hardly|barely|couldn'?t) sleep\b|\bno sleep\b|\bup all night\b/.test(msg)) {
    return readyToTrain()
      ? `One bad night rarely spoils a workout. ${shouldTrain()} If you feel off once you start, keep the planned weight and stop each set with an extra rep or two to spare; your plan adjusts from what you log.`
      : `${shouldTrain()} So rest is the right call after a bad night anyway.`;
  }
  if (/\bhow (much|many hours( of)?) sleep\b/.test(msg)) {
    const latest = [...biometrics].reverse().find((b) => b.sleepHours > 0);
    return `Most adults need 7–9 hours a night, and sleep is when most recovery from training happens.${latest ? ` Your latest recorded night was ${latest.sleepHours} hours.` : ''} A regular bedtime helps more than catching up at the weekend.`;
  }
  if (/\b(feel|feeling)s? (great|good|strong|amazing|fresh|energi[sz]ed|fantastic)\b/.test(msg)) {
    return readyToTrain()
      ? `Good. ${shouldTrain()} Use it to reach the top of today's rep targets with clean reps; the weight goes up by itself once every set gets there.`
      : `Good to hear. ${shouldTrain()}`;
  }

  // What counts toward the weekly sessions goal.
  if (/\bwhat counts\b|\bcounts? as (a|an) (session|active day|workout)\b|\bdoes (a |an |my )?[a-z ]+ count\b/.test(msg)) {
    return 'A session is a day with a finished workout, or an active day: 20 minutes or more of something you set out to do, like a ride, run, walk, swim, class or sport. Two workouts on one day count once, and steps on their own don\'t count. Weeks run Monday to Sunday.';
  }

  // Cardio and active days.
  if (/\b(cardio|running|runs?|ran|jog\w*|cycling|cycled?|rode|bike|swim\w*|swam|walk(s|ed|ing)?|hik(e|ed|ing)|hiit|conditioning|steps|active days?)\b/.test(msg) && !/\b(lunge|carry|treadmill desk)\b/.test(msg)) {
    // Reporting a session already done: how it gets counted.
    if (/\b(i|we) (just )?(walked|ran|rode|cycled|swam|hiked|did|went)\b/.test(msg) && !/\b(should|can|could)\b/.test(msg)) {
      return `Nice. A session you set out to do of 20 minutes or more counts as an active day and keeps your streak. If your watch recorded it, it's added by itself; otherwise add it on the Workout tab with "Log a session".`;
    }
    const plan = resolveActivePlan(profile);
    const hasActiveDay = plan.templates.some(isActiveSlot);
    const steps = /\bsteps\b/.test(msg) ? ' Steps on their own don\'t count: it has to be a session you set out to do.' : '';
    return hasActiveDay
      ? `Yes. Your plan has one active day each week: 20 minutes or more of anything that gets you moving, like a ride, run, walk, swim, class or sport. Log it on the Workout tab, or let your watch add it.${steps} It counts toward your 4 sessions a week and keeps your streak.`
      : `Yes, cardio fits alongside your plan. Your 4 workouts come first; an easy session of 20 minutes or more on another day is saved as an active day and keeps your streak.${steps} Hard cardio just before a leg workout costs you reps, so do it after lifting or on a different day.`;
  }

  // Growing a particular muscle: this week's sets for it against its target.
  if (ctx.weeklySets && musclesNamed(msg).length > 0 && /\b(bigger|grow\w*|build|size|lagging|bring up|more muscle|fill out)\b/.test(msg)) {
    return `A muscle grows from enough hard sets each week, taken close to failure, with reps or weight going up over time. Your plan sets all three; here is where you are this week.\n\n${ctx.weeklySets(msg)}`;
  }

  // An easier week.
  if (/\bdeload\w*\b|\b(easy|easier|light|lighter|recovery) week\b|\bweek off\b/.test(msg)) {
    const plan = resolveActivePlan(profile);
    if (!plan.id.startsWith('starter')) return null;
    return `Your 6-week plan doesn't need a separate easy week. It starts with fewer sets and more reps to spare, then builds up, and on a low-recovery day your weights hold and you stop each set earlier. If you feel run down for several days, take the rest you need: your next workout waits for you.`;
  }

  // What an exercise trains, and how to do it.
  const asksMuscles = /\b(what|which) muscles?\b|\bwhat (does|do)\b.*\b(work|train|target|hit)\b|\bwhat (is|are)\b.*\bgood for\b/.test(msg) && !/\b(weight|reps?|sets?|today)\b.*\btarget\b|\btarget (weight|reps?)\b/.test(msg);
  const asksHow = /\bhow (do|should|can) (i|you|we) (do|perform|set up)\b|\bhow to (do|perform)\b|\b(form|technique) (for|on)\b|\b(properly|correctly|right way)\b/.test(msg);
  if (asksMuscles || asksHow) {
    const named = findExerciseNamed(msg, activeWorkout, exerciseCatalog);
    if (named?.def) {
      const def = named.def;
      const helpers = (def.secondaryMuscles ?? []).map(friendly);
      const muscles = `${def.name} mainly trains your ${friendly(def.primaryMuscle)}${helpers.length ? `, with help from your ${listAnd(helpers)}` : ''}.`;
      if (asksMuscles && !asksHow) return muscles;
      const cue = [def.whyItWorks, named.session?.notes].filter(Boolean).join(' ');
      const working = named.session?.sets.filter(isWorking) ?? [];
      const target = working[0]
        ? ` Today it's ${plural(working.length, 'set')} of ${working[0].targetReps} reps at ${working[0].targetWeightKg > 0 ? formatWeight(working[0].targetWeightKg, unit) : 'bodyweight'}. The weight goes up by itself once every set reaches ${named.session!.maxReps} reps.`
        : ` It isn't in today's workout (${activeWorkout.name}).`;
      return `${muscles} ${cue ? `${cue} ` : ''}Lower each rep under control for about 2 seconds, and stop the set when your form starts to change.${target}`.replace(/\s+/g, ' ');
    }
    if (asksMuscles && /\b(today|this workout|this session)\b/.test(msg)) {
      const muscles = [...new Set(today.map((e) => exerciseCatalog.find((d) => d.id === e.exerciseId)?.primaryMuscle).filter((m): m is NonNullable<typeof m> => Boolean(m)))].map(friendly);
      if (muscles.length) return `${activeWorkout.name} mainly trains your ${listAnd(muscles)}.`;
    }
  }

  // Disliking an exercise.
  if (/\b(hate|don'?t like|dislike|can'?t stand|not a fan of|boring|don'?t enjoy)\b/.test(msg)) {
    const named = findExerciseNamed(msg, activeWorkout, exerciseCatalog);
    if (named?.session) return answerSwap(msg, activeWorkout, exerciseCatalog);
    if (named?.def) return `${named.def.name} isn't in today's workout. When it comes up, tap the swap button on it and pick another exercise that trains the same muscles (${friendly(named.def.primaryMuscle)}); your plan carries on with the one you choose.`;
    if (/\b(exercise|move|movement|lift|this|that|it|these|those)\b/.test(msg) || words <= 4) {
      return `You don't have to do an exercise you dislike. Which one is it? Today's are: ${today.map((e) => e.name).join(', ')}. Tap its swap button to pick another that trains the same muscles.`;
    }
  }

  // The last workout, from the log.
  if (!/\bwhy\b/.test(msg) && /\bwhat did i do\b|\b(my|the) (last|previous) (workout|session)\b|\blast workout\b|\byesterday'?s (workout|session)\b/.test(msg)) {
    const last = done[done.length - 1];
    if (!last) return "You haven't finished a workout yet. Your first one is ready on the Workout tab.";
    const days = Math.floor((now - new Date(last.completedAt || last.date).getTime()) / DAY_MS);
    const lines = last.exercises
      .map((ex) => {
        const sets = ex.sets.filter((s) => s.completed && isWorking(s));
        if (!sets.length) return null;
        const best = sets.reduce((a, b) => ((b.actualWeightKg ?? b.targetWeightKg) > (a.actualWeightKg ?? a.targetWeightKg) ? b : a));
        const kg = best.actualWeightKg ?? best.targetWeightKg;
        return `• ${ex.name}: ${plural(sets.length, 'set')}, best ${kg > 0 ? formatWeight(kg, unit) : 'bodyweight'} × ${best.actualReps ?? best.targetReps}`;
      })
      .filter((l): l is string => Boolean(l));
    const time = (last.durationMinutes ?? 0) > 0 ? `, ${Math.round(last.durationMinutes!)} minutes` : '';
    return `Your last workout was ${last.name}, ${daysAgoText(days)}${time}:\n${lines.join('\n')}`;
  }

  // How many workouts so far.
  if (/\bhow many (workouts|sessions)\b.*\b(done|finished|completed|logged|so far|did)\b|\b(workouts|sessions) (have i|i'?ve) (done|finished|completed)\b/.test(msg)) {
    const p = planPosition(profile, workouts, activities);
    return `You've finished ${plural(done.length, 'workout')} in total. In your ${p.plan.name}, ${p.overview.completedCount} of ${p.total} sessions are done and ${p.remaining} ${p.remaining === 1 ? 'is' : 'are'} left.`;
  }

  // Strongest and weakest lifts, from the strength levels.
  if (/\b(weakest|strongest|best|worst) (lift|lifts|exercise|movement)\b|\bweak points?\b/.test(msg)) {
    return ctx.strengthLevels();
  }

  // How am I doing.
  if (/\bhow am i (doing|getting on|going)\b|\bhow'?s (it|my training) going\b/.test(msg)) {
    if (!done.length) return `You're just getting started: your first workout, ${activeWorkout.name}, is ready on the Workout tab. Once you've logged it, I'll track every lift and show you how it's moving.`;
    const p = planPosition(profile, workouts, activities);
    return `${p.overview.completedCount} of ${p.total} sessions done in your ${p.plan.name} (week ${p.week} of 6). ${answerStreak(workouts, activities, now)}\n\n${ctx.progressSummary()}`;
  }

  // What to focus on.
  if (/\b(focus on|priorit\w*|most important|concentrate on|work on most)\b/.test(msg)) {
    const p = planPosition(profile, workouts, activities);
    const recovery = readinessState === 'Amber Shield' ? ' Your recovery is low today, so sleep and an easier session come first.' : '';
    return `Two things move you forward, in this order:\n1. Turning up. ${p.overview.completedCount} of ${p.total} sessions are done${p.nextLabel ? `; next is ${p.nextLabel}` : ''}.\n2. Beating last time by one rep on your first sets, with clean form. The weight goes up by itself once every set reaches the top of its range.${recovery}`;
  }

  // Bodyweight and its trend: only from weigh-ins the athlete logged.
  const weighIns = biometrics.filter((b) => (b.bodyweightKg || 0) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const asksOwnWeight = /\b(what'?s|what is|how much is)\b.*\bmy (body ?weight|weight)\b|\b(do i|i) weigh\b/.test(msg) && !/\b(for|on|lift|bench|squat|press|curl|row)\b/.test(msg);
  const asksTrend = /\b(losing|lose|lost|gaining|gain|gained|putting on|dropping)\b.*\b(fat|weight|muscle|mass|size)\b/.test(msg) && !/\b(scale|recomp\w*|measure\w*)\b/.test(msg);
  if (asksOwnWeight || asksTrend) {
    if (!weighIns.length) {
      return `You haven't logged a weigh-in yet, so I can't tell you. Log your weight in Progress → Body weight, ideally each morning; after a week I can show you which way it's moving.`;
    }
    const latest = weighIns[weighIns.length - 1];
    const current = `Your latest weigh-in was ${formatPreciseWeight(latest.bodyweightKg, unit)} (${daysAgoText(Math.max(0, Math.floor((now - new Date(`${latest.date}T12:00:00`).getTime()) / DAY_MS)))}), and your 7-day average is ${formatPreciseWeight(ctx.bodyweightEmaKg, unit)}.`;
    if (asksOwnWeight && !asksTrend) return current;
    const weekAgo = weighIns.filter((b) => new Date(latest.date).getTime() - new Date(b.date).getTime() >= 7 * DAY_MS);
    if (weighIns.length < 4 || !weekAgo.length) {
      return `${current} I need at least a week of weigh-ins to show a trend, so keep logging each morning.`;
    }
    const mean = (xs: BiometricLog[]) => xs.reduce((n, b) => n + b.bodyweightKg, 0) / xs.length;
    const recent = weighIns.filter((b) => new Date(latest.date).getTime() - new Date(b.date).getTime() < 7 * DAY_MS);
    const before = weekAgo.slice(-7);
    const change = mean(recent) - mean(before);
    const moved = Math.abs(change) < 0.15 ? 'about the same as' : `${formatPreciseWeight(Math.abs(change), unit)} ${change > 0 ? 'higher than' : 'lower than'}`;
    const goal =
      profile.goalPhase === 'Cut / Recomp'
        ? 'For losing fat you want a slow, steady drop while your lifts hold.'
        : profile.goalPhase === 'Maingain'
        ? 'For staying lean you want it roughly level while your lifts go up.'
        : 'For building muscle you want a slow rise; if it stays level for two or three weeks, eating a little more is the usual fix.';
    return `${current} This week's average is ${moved} the week before. ${goal} The scale can't tell fat from muscle: a waist measurement and your lifts going up tell you the rest.`;
  }

  // Calories and supplements: fixed guidance, no invented figures.
  if (/\b(calories?|kcal|macros?|deficit|surplus|how much (should|do) i eat)\b/.test(msg)) {
    const goal =
      profile.goalPhase === 'Cut / Recomp'
        ? 'To lose fat, eat a little less than you burn and keep protein high so you hold on to muscle.'
        : profile.goalPhase === 'Maingain'
        ? 'To stay lean, eat about what you burn, with enough protein.'
        : 'To build muscle, eat a little more than you burn, with enough protein.';
    return `I don't track food, so I can't give you a calorie number. ${goal} Your weekly average weight is the check: log it in Progress → Body weight and adjust your portions by how it moves over two or three weeks. Ask me about protein for a daily target.`;
  }
  if (/\b(creatine|supplements?|bcaas?|pre-?workout (powder|drink|supplement))\b/.test(msg)) {
    return `Creatine monohydrate is the one supplement with strong evidence for strength and muscle: 3–5 g a day, at any time, every day. It's considered safe for healthy adults; check with your doctor first if you have a kidney condition or take regular medication. Everything else matters far less than training, protein and sleep.`;
  }

  return null;
}
