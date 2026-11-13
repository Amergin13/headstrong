/**
 * What the coach says first, and the suggestions under it, depending on where it was opened: in a
 * workout, on the Program page, on Progress, or on a goal. Built only from the athlete's plan and
 * log, with the same functions the pages use, so the opening line never disagrees with the screen.
 * Each suggestion either sends a message the coach answers from data, or starts one for the
 * athlete to finish ("Set a goal of …").
 */
import { ActivityLog } from '../engine/activeDays';
import { evaluateSessionRecovery, formatReadyTime, getWorkoutCompletedAt } from '../engine/recovery';
import { BiometricLog, ExerciseDefinition, ExerciseSession, ReadinessState, UserProfile, WorkoutSession, WorkoutSet } from '../engine/types';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import { WeightUnit, formatPreciseWeight, formatWeight } from '../utils/units';
import { AthleteGoal, CHOSEN_GOAL_ID, WEEKLY_GOAL_ID, buildAthleteGoals, describeGoalStanding } from './athleteGoals';
import { planPosition } from './coachAnswers';
import { closestStrengthGoal } from './progressOverview';
import { PROGRESS_WIDGETS, resolveProgressWidgets } from './progressWidgets';

/** Where the coach was opened. */
export interface CoachPlace {
  tab: 'train' | 'program' | 'analytics';
  /** On Progress: the goal whose detail is open, or the screen that is open. */
  goalId?: string;
  detail?: 'bests' | 'lifetime' | 'recent' | 'steps' | 'weight' | 'measurements' | 'standards' | 'goals' | 'widgets';
}

export interface CoachHook {
  label: string;
  text: string;
  /** Puts the text in the message box for the athlete to finish, instead of sending it. */
  fill?: boolean;
}

export interface CoachOpening {
  /** Which situation this is, e.g. 'workout-active', 'goal-weekly'. */
  id: string;
  line: string;
  hooks: CoachHook[];
}

export interface CoachOpeningInput {
  place: CoachPlace;
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  activities?: ActivityLog[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  readinessState: ReadinessState;
  bodyweightEmaKg: number;
  now?: number;
}

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const KIT_WORD: Record<string, string> = { barbell: 'barbell is', dumbbell: 'dumbbells are', cable: 'cables are', machine: 'machine is' };
const KIT_LABEL: Record<string, string> = { barbell: 'Barbell taken', dumbbell: 'Dumbbells taken', cable: 'Cables taken', machine: 'Machine taken' };

function workoutOpening(input: CoachOpeningInput, unit: WeightUnit): CoachOpening {
  const { activeWorkout, workouts, exerciseCatalog } = input;
  const now = input.now ?? Date.now();
  const working = activeWorkout.exercises.flatMap((ex) => ex.sets.filter(isWorking));
  const done = working.filter((s) => s.completed).length;
  const load = (ex: ExerciseSession, set: WorkoutSet) => (set.targetWeightKg > 0 ? `${set.targetReps} reps at ${formatWeight(set.targetWeightKg, unit)}` : `${set.targetReps} reps`);

  if (done > 0) {
    // In a session: the exercise the athlete is on.
    const current = activeWorkout.exercises.find((ex) => ex.sets.some((s) => isWorking(s) && !s.completed));
    if (!current) {
      return {
        id: 'workout-all-sets-done',
        line: `Every set of ${activeWorkout.name} is ticked. Finish the workout when you're ready.`,
        hooks: [
          { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
          { label: "What's next?", text: "What's next?" },
        ],
      };
    }
    const nextSet = current.sets.find((s) => isWorking(s) && !s.completed)!;
    const hooks: CoachHook[] = [{ label: 'Swap this exercise', text: `I want to swap ${current.name}` }];
    if (KIT_WORD[current.equipment]) hooks.push({ label: KIT_LABEL[current.equipment], text: `The ${KIT_WORD[current.equipment]} taken` });
    hooks.push({ label: 'Short on time', text: "I'm short on time today" }, { label: 'How do I do it?', text: `How do I do the ${current.name.toLowerCase()}?` }, { label: 'Rest times', text: 'How long should I rest?' });
    return {
      id: 'workout-active',
      line: `You're ${done} of ${working.length} sets into ${activeWorkout.name}. Next is ${current.name}: ${load(current, nextSet)}.`,
      hooks,
    };
  }

  const gate = evaluateSessionRecovery(activeWorkout, workouts, exerciseCatalog, now);
  const when = gate.readyAt ? formatReadyTime(gate.readyAt, now) : 'soon';
  if (gate.trainedToday) {
    const last = workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b)).pop();
    return {
      id: 'workout-finished',
      line: `${last?.name ?? "Today's workout"} is logged for today. ${activeWorkout.name} will be ready ${when}.`,
      hooks: [
        { label: 'How did today go?', text: 'What did I do last workout?' },
        { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
        { label: "What's next?", text: "What's next?" },
        { label: 'How am I doing?', text: 'How am I doing?' },
      ],
    };
  }
  if (!gate.isReady && !activeWorkout.recoveryOverride) {
    return {
      id: 'workout-resting',
      line: `${activeWorkout.name} is still recovering and will be ready ${when}.`,
      hooks: [
        { label: 'Should I train today?', text: 'Should I train today?' },
        { label: 'Can I do cardio?', text: 'Should I do cardio today?' },
        { label: "What's next?", text: "What's next?" },
        { label: 'How am I doing?', text: 'How am I doing?' },
      ],
    };
  }
  const first = activeWorkout.exercises[0];
  const kit = activeWorkout.exercises.map((ex) => ex.equipment).find((e) => KIT_WORD[e]);
  const hooks: CoachHook[] = [{ label: "Today's briefing", text: "Give me a briefing for today's workout and targets" }, { label: 'Warm-up', text: 'How should I warm up today?' }];
  if (kit) hooks.push({ label: `No ${kit === 'dumbbell' ? 'dumbbells' : kit === 'cable' ? 'cables' : kit} today`, text: `I don't have ${kit === 'dumbbell' ? 'dumbbells' : kit === 'cable' ? 'cables' : `a ${kit}`} today` });
  hooks.push({ label: 'Short on time', text: "I'm short on time today" }, { label: 'Swap an exercise', text: 'I want to swap an exercise' });
  return {
    id: 'workout-ready',
    line: `${activeWorkout.name} is ready: ${activeWorkout.exercises.length} exercises${first ? `, starting with ${first.name}` : ''}.`,
    hooks,
  };
}

function goalOpening(goal: AthleteGoal, input: CoachOpeningInput, unit: WeightUnit): CoachOpening {
  const precise = (kg: number) => formatPreciseWeight(kg, unit);
  const standing = describeGoalStanding(goal, precise);
  const m = goal.measure;
  if (m.type === 'frequency') {
    const other = m.perWeek === 3 ? 4 : 3;
    const hooks: CoachHook[] = [
      { label: `Make it ${other} a week`, text: `Change my goal to ${other} times a week` },
      { label: 'What counts?', text: 'What counts as a session?' },
      { label: 'I missed a week', text: 'I missed a week, what now?' },
    ];
    if (!goal.fromPlan) hooks.push({ label: "Use my plan's goals", text: "Use my plan's goals" });
    return {
      id: 'goal-weekly',
      line: `${goal.title}: ${standing}${m.streakWeeks > 0 ? `, and ${m.streakWeeks} ${m.streakWeeks === 1 ? 'week' : 'weeks'} in a row` : ''}. Tell me if you want a different number.`,
      hooks,
    };
  }
  if (m.type === 'body') {
    const direction = m.phase === 'Cut / Recomp' ? 'Am I losing weight?' : 'Am I gaining weight?';
    return {
      id: 'goal-chosen',
      line: `${goal.title}: ${m.signsMeasured > 0 ? `${m.signsMet} of ${m.signsMeasured} measured signs are showing` : 'nothing is measured yet'}. ${m.nextStep || m.evidenceLabel}`,
      hooks: [
        { label: direction, text: direction },
        { label: 'How much protein?', text: 'How much protein do I need?' },
        { label: 'How many calories?', text: 'How many calories should I eat?' },
        { label: 'Change my goal', text: 'Change my goal to ', fill: true },
      ],
    };
  }
  if (m.type === 'target') {
    const name = m.exerciseName.toLowerCase();
    return {
      id: 'goal-custom',
      line: `Your goal on ${m.exerciseName}: ${standing}. Tell me a new target to change it.`,
      hooks: [
        { label: 'Change the target', text: `My goal on ${name} is `, fill: true },
        { label: 'How do I do it?', text: `How do I do the ${name}?` },
        { label: 'Remove this goal', text: `Remove my ${name} goal` },
      ],
    };
  }
  const name = m.exerciseName.toLowerCase();
  const hooks: CoachHook[] = [
    { label: 'How do I do it?', text: `How do I do the ${name}?` },
    { label: 'Set my own target', text: `My goal on ${name} is `, fill: true },
    { label: "What's my weakest lift?", text: "What's my weakest lift?" },
  ];
  if (!goal.featured && goal.pillar) hooks.push({ label: 'Follow this lift', text: `Follow my ${goal.title.split(': ')[0].toLowerCase().split(' & ')[0]} strength level` });
  return { id: 'goal-strength', line: `${goal.title}: ${standing} on ${m.exerciseName}.`, hooks };
}

/** The coach's first line and suggestions for where it was opened. */
export function buildCoachOpening(input: CoachOpeningInput): CoachOpening {
  const { place, profile, workouts, biometrics } = input;
  const unit: WeightUnit = profile.weightUnit || 'kg';
  if (place.tab === 'train') return workoutOpening(input, unit);

  if (place.tab === 'program') {
    const p = planPosition(profile, workouts, input.activities ?? []);
    return {
      id: 'program',
      line: `You're in week ${p.week} of 6 of your ${p.plan.name}: ${p.overview.completedCount} of ${p.total} sessions done${p.nextLabel ? `, next is ${p.nextLabel}` : ''}.`,
      hooks: [
        { label: 'What is this phase for?', text: 'What phase am I in?' },
        { label: "I'm away next week", text: "I'll be away travelling next week" },
        { label: 'I missed a week', text: 'I missed a week, what now?' },
        { label: 'Change my goal', text: 'Change my goal to ', fill: true },
      ],
    };
  }

  const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const goals = buildAthleteGoals({ profile, workouts, activities: input.activities, biometrics, bodyweightKg: hasWeighIn ? input.bodyweightEmaKg : undefined, now: input.now });
  const open = place.goalId ? goals.find((g) => g.id === place.goalId) : undefined;
  if (open) return goalOpening(open, input, unit);

  const weekly = goals.find((g) => g.id === WEEKLY_GOAL_ID);
  const chosen = goals.find((g) => g.id === CHOSEN_GOAL_ID);
  const strength = closestStrengthGoal(goals);
  const precise = (kg: number) => formatPreciseWeight(kg, unit);
  const ownGoal: CoachHook = { label: 'Set my own goal', text: 'Set a goal of ', fill: true };

  if (place.detail === 'widgets') {
    const activeCount = resolveProgressWidgets(profile.progressWidgets).length;
    return {
      id: 'progress-widgets',
      line: `You have ${activeCount} of ${PROGRESS_WIDGETS.length} widgets on Progress. Tell me what to add or remove, like "add balance to progress" or "remove measurements widget".`,
      hooks: [
        { label: 'What widgets can I add?', text: 'What widgets can I add to progress?' },
        { label: 'Add balance widget', text: 'Add balance widget to progress' },
        { label: 'Reset to default', text: 'Reset my progress widgets' },
      ],
    };
  }
  if (place.detail === 'goals') {
    const customised = Boolean(profile.goalSettings);
    const hooks: CoachHook[] = [ownGoal, { label: 'Train 3 times a week', text: 'Change my goal to 3 times a week' }, { label: 'Follow my bench', text: 'Follow my bench press strength level' }];
    if (customised) hooks.push({ label: "Use my plan's goals", text: "Use my plan's goals" });
    return {
      id: 'goals-settings',
      line: `Tell me a goal and I'll set it, like "12 chin-ups" or "100 kg bench press". Your plan's goals are the defaults${customised ? ', and you can go back to them any time' : ''}.`,
      hooks,
    };
  }
  if (place.detail === 'weight' || place.detail === 'measurements') {
    const direction = profile.goalPhase === 'Cut / Recomp' ? 'Am I losing weight?' : 'Am I gaining weight?';
    return {
      id: `progress-${place.detail}`,
      line: hasWeighIn
        ? `Your 7-day average is ${precise(input.bodyweightEmaKg)}. For ${GOAL_DISPLAY_NAME[profile.goalPhase || 'Lean Bulk']}, I can tell you which way it's moving.`
        : 'Log your weight here and I can tell you which way it is moving against your goal.',
      hooks: [
        { label: direction, text: direction },
        { label: 'How much protein?', text: 'How much protein do I need?' },
        { label: 'How many calories?', text: 'How many calories should I eat?' },
      ],
    };
  }
  if (place.detail === 'standards') {
    return {
      id: 'progress-standards',
      line: strength ? `Your closest strength level is ${strength.title}: ${describeGoalStanding(strength, precise)}.` : 'Strength levels compare your lifts with your bodyweight. Log your weight to see them.',
      hooks: [
        { label: "What's my weakest lift?", text: "What's my weakest lift?" },
        { label: 'How are levels worked out?', text: 'How are strength levels worked out?' },
        ownGoal,
      ],
    };
  }
  if (place.detail) {
    return {
      id: `progress-${place.detail}`,
      line: `You've finished ${workouts.filter((w) => w.completed).length} workouts. Ask me how any lift has moved.`,
      hooks: [
        { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
        { label: 'How am I doing?', text: 'How am I doing?' },
        ownGoal,
      ],
    };
  }
  return {
    id: 'progress',
    line: `${weekly ? `${describeGoalStanding(weekly, precise)}. ` : ''}${chosen && chosen.measure.type === 'body' && chosen.measure.signsMeasured > 0 ? `${chosen.title}: ${chosen.measure.signsMet} of ${chosen.measure.signsMeasured} measured signs showing.` : ''}`.trim() || 'Your goals fill in as you train.',
    hooks: [
      { label: 'How am I doing?', text: 'How am I doing?' },
      { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
      { label: "What's my weakest lift?", text: "What's my weakest lift?" },
      ownGoal,
    ],
  };
}
