/**
 * Goal changes made by talking to the coach. Like every plan change, these are worked out from the
 * message itself, never by the model: sessions a week, which lift's level to follow, the athlete's
 * own targets ("set a goal of 12 chin-ups", "my goal is a 100 kg bench"), and going back to the
 * plan's goals. A question never changes anything.
 */
import { CustomGoal, ExerciseDefinition, GoalSettings, StrengthPillar, UserProfile, WorkoutSession } from '../engine/types';
import { localDateString } from '../utils/date';
import { WeightUnit, formatWeight, unitToKg } from '../utils/units';
import {
  MAX_CUSTOM_GOALS,
  MAX_GOALS,
  MAX_CUSTOM_REPS,
  MAX_CUSTOM_STEPS,
  MAX_CUSTOM_WEIGHT_KG,
  MAX_SESSIONS_PER_WEEK,
  MIN_CUSTOM_STEPS,
  MIN_SESSIONS_PER_WEEK,
  STEPS_GOAL_EXERCISE_ID,
  bestOnExercise,
  ownGoalName,
  sessionsPerWeekTarget,
} from './athleteGoals';
import { findExerciseNamed } from './coachAnswers';
import { MOVEMENT_NAME } from './movementStandards';

export interface GoalChange {
  /** The goal settings to save; undefined puts the plan's goals back. Absent when nothing changes. */
  goalSettings?: GoalSettings | undefined;
  changed: boolean;
  reply: string;
  /** Short line for the "Plan updated" note. */
  summary?: string;
}

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** The lifts people name in a word, and the exercise each one is counted on. */
const LIFT_ALIASES: { re: RegExp; exerciseId: string; pillar?: StrengthPillar }[] = [
  { re: /\b(?<!incline |flat dumbbell |flat db )bench( press)?\b/, exerciseId: 'ex-bench-press', pillar: 'Horizontal Push' },
  { re: /\b(?<!split |goblet |single-leg |paused |bodyweight )(back )?squats?\b/, exerciseId: 'ex-barbell-squat', pillar: 'Squat' },
  { re: /\b(?<!romanian |single-leg )deadlifts?\b/, exerciseId: 'ex-deadlift', pillar: 'Hinge' },
  { re: /\b(overhead press|ohp|(?<!dumbbell |db |seated |seated db )shoulder press|military press)\b/, exerciseId: 'ex-ohp', pillar: 'Vertical Push' },
  { re: /\b(chin[\s-]?ups?|pull[\s-]?ups?|chins)\b/, exerciseId: 'ex-chinup', pillar: 'Vertical Pull' },
  { re: /\b(push[\s-]?ups?|press[\s-]?ups?)\b/, exerciseId: 'ex-pushup' },
];

const isQuestion = (msg: string) => /\?\s*$/.test(msg) || /^(how|should|can|could|what|what's|whats|which|is|are|why|when|do|does|did|will|would)\b/.test(msg);

function cleaned(settings: GoalSettings): GoalSettings | undefined {
  const next: GoalSettings = {
    sessionsPerWeek: settings.sessionsPerWeek,
    strengthFocus: settings.strengthFocus,
    customGoals: settings.customGoals?.length ? settings.customGoals : undefined,
  };
  return Object.values(next).some((v) => v !== undefined) ? next : undefined;
}

/** The exercise a goal message names: a common lift by its everyday name, else anything in the library. */
function exerciseFor(msg: string, activeWorkout: WorkoutSession, catalog: ExerciseDefinition[]): { def: ExerciseDefinition; pillar?: StrengthPillar } | null {
  // An exercise named in full ("incline dumbbell press") is that exercise; otherwise an everyday
  // name ("bench", "chin-ups") is the standard lift; otherwise whatever the library recognises.
  const inFull = [...activeWorkout.exercises.map((e) => catalog.find((d) => d.id === e.exerciseId)), ...catalog]
    .filter((d): d is ExerciseDefinition => Boolean(d))
    .find((d) => msg.includes(d.name.toLowerCase()));
  if (inFull) return { def: inFull, pillar: LIFT_ALIASES.find((a) => a.exerciseId === inFull.id)?.pillar };
  const alias = LIFT_ALIASES.find((a) => a.re.test(msg));
  const aliasDef = alias ? catalog.find((d) => d.id === alias.exerciseId) : undefined;
  if (aliasDef) return { def: aliasDef, pillar: alias!.pillar };
  const named = findExerciseNamed(msg, activeWorkout, catalog);
  return named?.def ? { def: named.def } : null;
}

/**
 * A change to the athlete's goals asked for in a message, or null when the message isn't one.
 * `changed: false` means the message was about goals but nothing could be set (the reply says why).
 */
export function detectGoalChange(
  lowerMsg: string,
  profile: UserProfile,
  activeWorkout: WorkoutSession,
  workouts: WorkoutSession[],
  catalog: ExerciseDefinition[]
): GoalChange | null {
  const msg = lowerMsg.trim();
  if (isQuestion(msg)) return null;
  const settings: GoalSettings = profile.goalSettings ?? {};
  const unit: WeightUnit = profile.weightUnit || 'kg';
  const { planPerWeek } = sessionsPerWeekTarget(profile);

  // Back to the plan's goals.
  if (/\b(reset|restore|clear)\b.*\bgoals?\b|\b(use|go back to|back to)\b.*\b(plan'?s?|default)\b.*\bgoals?\b/.test(msg)) {
    return profile.goalSettings
      ? { goalSettings: undefined, changed: true, reply: `Done. Your goals are back to your plan's: ${planPerWeek} sessions a week and the strength level closest to being reached.`, summary: "Goals set back to your plan's" }
      : { changed: false, reply: `Your goals are already your plan's: ${planPerWeek} sessions a week and the strength level closest to being reached.` };
  }

  // Sessions a week.
  const perWeek = /\b(\d|two|three|four|five|six|seven)\s*(x|times|sessions|days|workouts)\s*(a|per|each|every)\s*week\b/.exec(msg);
  if (perWeek && /\b(goal|aim|target|want|change|set|make|switch|i'?ll|going to|plan to|let'?s|instead)\b/.test(msg)) {
    const n = NUMBER_WORDS[perWeek[1]] ?? Number(perWeek[1]);
    if (!(n >= MIN_SESSIONS_PER_WEEK && n <= MAX_SESSIONS_PER_WEEK)) {
      return { changed: false, reply: `I can set your weekly goal anywhere from ${MIN_SESSIONS_PER_WEEK} to ${MAX_SESSIONS_PER_WEEK} sessions. Your plan is built on ${planPerWeek}.` };
    }
    return {
      goalSettings: cleaned({ ...settings, sessionsPerWeek: n === planPerWeek ? undefined : n }),
      changed: true,
      reply:
        n === planPerWeek
          ? `Done. Your weekly goal is ${n} sessions, which is what your plan is built on.`
          : `Done. Your weekly goal is now ${n} sessions. Your plan is still built on ${planPerWeek}, so its workouts don't change; workouts and active days of 20 minutes or more both count.`,
      summary: `Weekly goal: ${n} sessions`,
    };
  }

  const mentionsGoal = /\b(goals?|targets?|aim(ing)?( for| to)?)\b/.test(msg);
  const mentionsSteps = /\b(daily\s+)?steps?\b/.test(msg);
  const lift = mentionsSteps ? null : exerciseFor(msg, activeWorkout, catalog);

  // Remove one of the athlete's own goals.
  if (/\b(remove|delete|drop|cancel|scrap)\b/.test(msg) && mentionsGoal) {
    const own = settings.customGoals ?? [];
    const match = mentionsSteps
      ? own.filter((g) => g.metric === 'steps' || g.exerciseId === STEPS_GOAL_EXERCISE_ID)
      : lift
      ? own.filter((g) => g.exerciseId === lift.def.id)
      : own.length === 1
      ? own
      : [];
    if (!match.length) return { changed: false, reply: own.length ? `Which goal? You have: ${own.map((g) => g.exerciseName).join(', ')}.` : "You haven't set a goal of your own to remove." };
    const left = own.filter((g) => !match.includes(g));
    return {
      goalSettings: cleaned({ ...settings, customGoals: left }),
      changed: true,
      reply: `Done. I've removed your ${match.map((g) => g.exerciseName).join(' and ')} goal.`,
      summary: 'Goal removed',
    };
  }

  // Daily step target ("my goal is 10,000 steps", "set a steps goal of 8000").
  const stepsMatch = /(\d[\d,]*)\s*(?:daily\s+)?steps?\b|\b(?:daily\s+)?steps?\s*(?:goal|target)?\s*(?:of|to|at|:)?\s*(\d[\d,]*)\b/.exec(msg);
  const wantsTo = /\b(i want to|i'?d like to|my goal is|goal of|aim(ing)? (for|to)|target (of|is)|set a(?: [\w-]+)? goal|working towards?)\b/.test(msg);
  if ((mentionsGoal || wantsTo) && mentionsSteps && stepsMatch) {
    const rawCount = (stepsMatch[1] ?? stepsMatch[2] ?? '').replace(/,/g, '');
    const target = Math.round(Number(rawCount));
    if (!Number.isFinite(target) || target < MIN_CUSTOM_STEPS || target > MAX_CUSTOM_STEPS) {
      return {
        changed: false,
        reply: `Pick a daily step goal between ${MIN_CUSTOM_STEPS.toLocaleString()} and ${MAX_CUSTOM_STEPS.toLocaleString()} steps, for example "set a goal of 10,000 steps".`,
      };
    }
    const id = `${STEPS_GOAL_EXERCISE_ID}-steps`;
    const others = (settings.customGoals ?? []).filter((g) => g.id !== id);
    if (others.length >= MAX_CUSTOM_GOALS) {
      return {
        changed: false,
        reply: `You have ${MAX_GOALS} goals, which is the most you can keep in view: 3 from your plan and ${MAX_CUSTOM_GOALS} of your own (${others.map((g) => g.exerciseName).join(' and ')}). Tell me which of yours to remove and I'll add this one.`,
      };
    }
    const goal: CustomGoal = {
      id,
      exerciseId: STEPS_GOAL_EXERCISE_ID,
      exerciseName: 'Daily steps',
      metric: 'steps',
      target,
      createdOn: localDateString(new Date()),
    };
    const formatted = target.toLocaleString();
    return {
      goalSettings: cleaned({ ...settings, customGoals: [...others, goal] }),
      changed: true,
      reply: `Done. Your goal is ${formatted} steps a day, tracked from Health Connect or your watch. It has its own ring on your Progress page.`,
      summary: `Goal set: ${formatted} steps a day`,
    };
  }

  // The athlete's own target on a lift: a weight, or reps in one set.
  const weight = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|lbs?|pounds?)\b/.exec(msg);
  const reps = /(\d+)\s*(reps?|chin[\s-]?ups?|pull[\s-]?ups?|push[\s-]?ups?|press[\s-]?ups?|dips?)\b/.exec(msg);
  if ((mentionsGoal || wantsTo) && (weight || reps)) {
    if (!lift) return { changed: false, reply: 'Which exercise is that goal for? For example: "set a goal of 100 kg on bench press" or "my goal is 12 chin-ups".' };
    const metric: CustomGoal['metric'] = weight ? 'weight' : 'reps';
    const liftName = ownGoalName(lift.def.id, lift.def.name);
    const target = weight ? Math.round(unitToKg(Number(weight[1]), /^(lb|pound)/.test(weight[2]) ? 'lb' : /^k/.test(weight[2]) ? 'kg' : unit) * 100) / 100 : Number(reps![1]);
    const say = (n: number) => (metric === 'weight' ? formatWeight(n, unit) : `${n} reps`);
    if (!(target > 0) || target > (metric === 'weight' ? MAX_CUSTOM_WEIGHT_KG : MAX_CUSTOM_REPS)) {
      return { changed: false, reply: `That's outside what I can track as a goal. Give me a ${metric === 'weight' ? 'weight' : 'number of reps'} you could reach on ${liftName}.` };
    }
    if (metric === 'weight' && lift.def.equipment === 'bodyweight' && !lift.def.isWeightedCalisthenic) {
      return { changed: false, reply: `${liftName} has no weight to add, so set it in reps instead: for example "my goal is 12 reps on ${liftName.toLowerCase()}".` };
    }
    const best = bestOnExercise(workouts, lift.def.id);
    const current = metric === 'weight' ? best.weightKg : best.reps;
    if (current >= target) {
      return { changed: false, reply: `You've already done ${say(current)} on ${liftName}, so that goal is behind you. Set one above it and I'll track it.` };
    }
    const id = `${lift.def.id}-${metric}`;
    const others = (settings.customGoals ?? []).filter((g) => g.id !== id);
    if (others.length >= MAX_CUSTOM_GOALS) {
      return { changed: false, reply: `You have ${MAX_GOALS} goals, which is the most you can keep in view: 3 from your plan and ${MAX_CUSTOM_GOALS} of your own (${others.map((g) => g.exerciseName).join(' and ')}). Tell me which of yours to remove and I'll add this one.` };
    }
    const goal: CustomGoal = { id, exerciseId: lift.def.id, exerciseName: liftName, metric, target, createdOn: localDateString(new Date()) };
    return {
      goalSettings: cleaned({ ...settings, customGoals: [...others, goal] }),
      changed: true,
      reply: `Done. Your goal is ${say(target)} on ${liftName}, counted by ${metric === 'weight' ? 'your heaviest logged set' : 'the most reps you log in one set'}. ${
        current > 0 ? `Your best so far is ${say(current)}.` : "You haven't logged it yet, so it starts counting with your first set."
      } It has its own ring on your Progress page.`,
      summary: `Goal set: ${say(target)} on ${liftName}`,
    };
  }

  // Which lift's strength level leads the Progress page.
  if (/\b(follow|focus on|track|lead with|prioriti[sz]e)\b/.test(msg) && lift?.pillar && (mentionsGoal || /\b(level|strength|progress)\b/.test(msg) || /^(follow|focus on|track)\b/.test(msg))) {
    const logged = workouts.some((w) => w.completed && w.exercises.some((e) => e.pillar === lift.pillar && e.sets.some((s) => s.completed && !s.isWarmup && (s.actualReps ?? 0) > 0)));
    return {
      goalSettings: cleaned({ ...settings, strengthFocus: lift.pillar }),
      changed: true,
      reply: logged
        ? `Done. ${MOVEMENT_NAME[lift.pillar]} now leads your Progress page. Its next strength level is counted in reps at the weight of your best set; every other lift's level is still tracked.`
        : `Done. ${MOVEMENT_NAME[lift.pillar]} will lead your Progress page once you've logged it and your weight; until then your closest logged lift is shown.`,
      summary: `Following ${MOVEMENT_NAME[lift.pillar]}`,
    };
  }

  return null;
}
