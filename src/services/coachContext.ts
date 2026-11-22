/**
 * What the coach says first, and the suggestions under it, depending on where it was opened: in a
 * workout, on the Program page, on Progress, or on a goal. Built only from the athlete's plan and
 * log, with the same functions the pages use, so the opening line never disagrees with the screen.
 * Each suggestion either sends a message the coach answers from data, or starts one for the
 * athlete to finish ("Set a goal of …").
 */
import { ActivityLog } from '../engine/activeDays';
import { evaluateSessionRecovery, formatReadyTime, getWorkoutCompletedAt } from '../engine/recovery';
import { isTimedExercise, usesOneDumbbell } from '../engine/e1rm';
import { BiometricLog, ExerciseDefinition, ExerciseSession, ReadinessState, UserProfile, WorkoutSession, WorkoutSet, isWhoopConfigured } from '../engine/types';
import { calculateSessionTonnage } from '../engine/wci';
import { localDateString } from '../utils/date';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import { WeightUnit, formatPreciseWeight, formatWeight } from '../utils/units';
import { AthleteGoal, CHOSEN_GOAL_ID, WEEKLY_GOAL_ID, buildAthleteGoals, describeGoalStanding } from './athleteGoals';
import { buildStepsCoachingSummary, buildWhoopCoachingSummary, planPosition } from './coachAnswers';
import { closestStrengthGoal } from './progressOverview';
import { availableProgressWidgets, resolveVisibleProgressWidgets } from './progressWidgets';
import { BODY_MEASUREMENT_SITES } from './renphoBluetooth';
import { detectCoachInterventions } from './coachInterventions';

/** Where the coach was opened. */
export interface CoachPlace {
  tab: 'train' | 'program' | 'analytics';
  /** On Progress: the goal whose detail is open, or the screen that is open. */
  goalId?: string;
  detail?:
    | 'bests'
    | 'lifetime'
    | 'recent'
    | 'steps'
    | 'whoop'
    | 'weight'
    | 'measurements'
    | 'composition'
    | 'insights'
    | 'standards'
    | 'goals'
    | 'widgets';
  /** Optional exercise currently inspected (e.g. from ExerciseDetailModal). */
  exerciseId?: string;
}

/** Human-readable context pill label + tailored composer placeholder for the chat header & input. */
export function describeCoachPlace(
  place: CoachPlace | undefined,
  activeWorkout?: WorkoutSession,
  exerciseCatalog: ExerciseDefinition[] = []
): { label: string; placeholder: string } {
  if (!place || place.tab === 'train') {
    if (place?.exerciseId) {
      const ex =
        activeWorkout?.exercises.find((e) => e.exerciseId === place.exerciseId || e.id === place.exerciseId) ??
        exerciseCatalog.find((d) => d.id === place.exerciseId);
      const shortName = ex ? ex.name : 'Exercise';
      return {
        label: `Workout · ${shortName}`,
        placeholder: `Ask about ${shortName}, log a set, or swap…`,
      };
    }
    return {
      label: activeWorkout?.name ? `Workout · ${activeWorkout.name}` : 'Workout',
      placeholder: 'Log a set, swap an exercise, or ask why…',
    };
  }
  if (place.tab === 'program') {
    return {
      label: 'Program',
      placeholder: 'Swap across program, schedule a week, or rebalance…',
    };
  }
  if (place.goalId) {
    return {
      label: 'Progress · Goal',
      placeholder: 'Change this target, add a goal, or check pace…',
    };
  }
  const detailLabels: Record<NonNullable<CoachPlace['detail']>, { label: string; placeholder: string }> = {
    composition: { label: 'Progress · Composition', placeholder: 'Ask about fat vs lean mass, or log weight/BF%…' },
    measurements: { label: 'Progress · Measurements', placeholder: 'Log a tape site (e.g. "Log waist 82 cm") or check trends…' },
    weight: { label: 'Progress · Body Weight', placeholder: 'Log today’s weight or check your weekly trend…' },
    standards: { label: 'Progress · Strength', placeholder: 'Ask about strength tiers, balance, or rebalance plan…' },
    goals: { label: 'Progress · Goals', placeholder: 'Set a lift, steps, or weekly sessions goal…' },
    widgets: { label: 'Tracking cards', placeholder: 'Add or remove a tracking card…' },
    steps: { label: 'Progress · Steps', placeholder: 'Log steps, check your average, or set a target…' },
    whoop: { label: 'Progress · Recovery', placeholder: 'Ask about HRV, strain, or today’s readiness…' },
    insights: { label: 'Progress · Insights', placeholder: 'Ask about weekly muscle sets, joints, or recovery…' },
    bests: { label: 'Progress · Bests', placeholder: 'Ask about your best lifts or estimated maxes…' },
    recent: { label: 'Progress · Recent', placeholder: 'Ask about your last session, tonnage, or progression…' },
    lifetime: { label: 'Progress · Lifetime', placeholder: 'Ask about your total sessions, volume, or streak…' },
  };
  if (place.detail && detailLabels[place.detail]) {
    return detailLabels[place.detail];
  }
  return {
    label: 'Progress',
    placeholder: 'Ask about strength, composition, goals, or log data…',
  };
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
  /** Warm, human coach greeting opening the conversation. */
  greeting?: string;
  /** Proactive coaching question inviting the highest-likelihood next action. */
  nextActionPrompt?: string;
  /** Complete opening message shown by the coach when the chat opens. */
  line: string;
  /** High-likelihood contextual next-action hooks surfaced in the chat. */
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

function composeCoachOpening(params: {
  id: string;
  greeting: string;
  context: string;
  nextActionPrompt: string;
  hooks: CoachHook[];
}): CoachOpening {
  const { id, greeting, context, nextActionPrompt, hooks } = params;
  return {
    id,
    greeting,
    nextActionPrompt,
    line: [greeting.trim(), context.trim(), nextActionPrompt.trim()].filter(Boolean).join(' '),
    hooks: hooks.slice(0, 3),
  };
}

function workoutOpening(input: CoachOpeningInput, unit: WeightUnit): CoachOpening {
  const { activeWorkout, workouts, exerciseCatalog, place, readinessState } = input;
  const now = input.now ?? Date.now();
  const todayStr = localDateString(new Date(now));

  const formatSetTarget = (ex: ExerciseSession, set: WorkoutSet) => {
    if (isTimedExercise(ex)) {
      const secs = set.targetDurationSeconds ?? ex.durationSeconds ?? 45;
      return set.targetWeightKg > 0
        ? `${secs}s hold at ${formatWeight(set.targetWeightKg, unit)}${ex.equipment === 'dumbbell' && !usesOneDumbbell(ex) ? ' each' : ''}`
        : `${secs}s hold`;
    }
    return set.targetWeightKg > 0
      ? `${set.targetReps} reps at ${formatWeight(set.targetWeightKg, unit)}${ex.equipment === 'dumbbell' && !usesOneDumbbell(ex) ? ' each' : ''}`
      : `${set.targetReps} reps`;
  };

  if (place.exerciseId) {
    const target = activeWorkout.exercises.find((e) => e.exerciseId === place.exerciseId || e.id === place.exerciseId);
    if (target) {
      const workingEx = target.sets.filter(isWorking);
      const firstWorking = workingEx[0];
      const nextUnfinished = workingEx.find((s) => !s.completed) ?? firstWorking;
      const targetLine = firstWorking
        ? `${workingEx.length} sets × ${formatSetTarget(target, firstWorking)}`
        : `${target.sets.length} sets`;
      const prefilledSetLog =
        nextUnfinished && !isTimedExercise(target) && nextUnfinished.targetWeightKg > 0
          ? `Log ${formatWeight(nextUnfinished.targetWeightKg, unit)} x ${nextUnfinished.targetReps} @ ${nextUnfinished.targetRir ?? 2} RIR on ${target.name}`
          : `Log `;
      const hooks: CoachHook[] = [
        { label: 'How do I do it?', text: `How do I do the ${target.name.toLowerCase()}?` },
        { label: 'Why this weight?', text: `Why is my ${target.name.toLowerCase()} weight set to this?` },
        { label: 'Swap today only', text: `I want to swap ${target.name}` },
        { label: 'Swap in program', text: `Swap ${target.name} across my whole program` },
        { label: 'Log a set', text: prefilledSetLog, fill: true },
      ];
      const interventions = detectCoachInterventions({
        profile: input.profile,
        activeWorkout,
        workouts,
        biometrics: input.biometrics,
        exerciseCatalog,
        bodyweightEmaKg: input.bodyweightEmaKg,
        readinessState,
        activities: input.activities,
      });
      const matching = interventions.find((i) => i.exerciseId === target.exerciseId || i.pillar === target.pillar);
      if (matching) {
        hooks.unshift({ label: matching.ctaLabel, text: matching.coachPrompt });
      }
      return composeCoachOpening({
        id: 'workout-exercise',
        greeting: `Hey — let's dial in ${target.name}.`,
        context: `Today's prescription is ${targetLine}.`,
        nextActionPrompt: 'Want form cues, why the weight moved, to log a set, or to swap it today or across your program?',
        hooks,
      });
    }
  }

  const working = activeWorkout.exercises.flatMap((ex) => ex.sets.filter(isWorking));
  const done = working.filter((s) => s.completed).length;

  if (done > 0) {
    // In a session: the exercise the athlete is on.
    const current = activeWorkout.exercises.find((ex) => ex.sets.some((s) => isWorking(s) && !s.completed));
    if (!current) {
      return composeCoachOpening({
        id: 'workout-all-sets-done',
        greeting: 'Nice work finishing every set —',
        context: `every set of ${activeWorkout.name} is ticked.`,
        nextActionPrompt: "Finish the workout when you're ready, or want to check how your strength moved today and what's queued next?",
        hooks: [
          { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
          { label: "What's next?", text: "What's next?" },
          { label: 'Last session tonnage', text: 'What was my tonnage last workout?' },
          { label: "Log today's weight", text: 'Log weight ', fill: true },
        ],
      });
    }
    const nextSet = current.sets.find((s) => isWorking(s) && !s.completed)!;
    const prefilledActiveSet =
      !isTimedExercise(current) && nextSet.targetWeightKg > 0
        ? `Log ${formatWeight(nextSet.targetWeightKg, unit)} x ${nextSet.targetReps} @ ${nextSet.targetRir ?? 2} RIR on ${current.name}`
        : `Log `;
    const hooks: CoachHook[] = [{ label: 'Swap this exercise', text: `I want to swap ${current.name}` }];
    if (KIT_WORD[current.equipment]) hooks.push({ label: KIT_LABEL[current.equipment], text: `The ${KIT_WORD[current.equipment]} taken` });
    hooks.push(
      { label: 'Log this set', text: prefilledActiveSet, fill: true },
      { label: 'Short on time', text: "I'm short on time today" },
      { label: 'How do I do it?', text: `How do I do the ${current.name.toLowerCase()}?` },
      { label: 'Rest times', text: 'How long should I rest?' }
    );
    return composeCoachOpening({
      id: 'workout-active',
      greeting: 'Hey — strong pace so far.',
      context: `You're ${done} of ${working.length} sets into ${activeWorkout.name}. Next is ${current.name}: ${formatSetTarget(current, nextSet)}.`,
      nextActionPrompt: 'Want to log this set, swap if equipment is busy, check form cues, or trim the remaining sets if you are short on time?',
      hooks,
    });
  }

  // Rest day explicitly logged (queued workout moved to tomorrow or later)
  if (activeWorkout.date && activeWorkout.date > todayStr && !activeWorkout.completed) {
    return composeCoachOpening({
      id: 'workout-rest-day',
      greeting: 'Hey — enjoy the recovery day.',
      context: `Rest day logged for today. ${activeWorkout.name} is queued for ${activeWorkout.date} and your streak is protected.`,
      nextActionPrompt: `Want to log an active day walk or cardio session, preview ${activeWorkout.name}, or check your progress?`,
      hooks: [
        { label: 'Can I do cardio?', text: 'Should I do cardio today?' },
        { label: 'Log an active day', text: 'Log 30 min ', fill: true },
        { label: "What's next?", text: "What's next?" },
        { label: 'How am I doing?', text: 'How am I doing?' },
      ],
    });
  }

  const gate = evaluateSessionRecovery(activeWorkout, workouts, exerciseCatalog, now, readinessState);
  const when = gate.readyAt ? formatReadyTime(gate.readyAt, now) : 'soon';
  if (gate.trainedToday) {
    const last = workouts.filter((w) => w.completed).sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b)).pop();
    return composeCoachOpening({
      id: 'workout-finished',
      greeting: "Great work getting today's session done —",
      context: `${last?.name ?? "Today's workout"} is logged for today. ${activeWorkout.name} will be ready ${when}.`,
      nextActionPrompt: "Want a recap of today's tonnage and top sets, or to check what's coming up next?",
      hooks: [
        { label: 'How did today go?', text: 'What did I do last workout?' },
        { label: 'Last session tonnage', text: 'What was my tonnage last workout?' },
        { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
        { label: "What's next?", text: "What's next?" },
        { label: "Log today's weight", text: 'Log weight ', fill: true },
      ],
    });
  }
  if (!gate.isReady && !activeWorkout.recoveryOverride) {
    return composeCoachOpening({
      id: 'workout-resting',
      greeting: 'Hey — checking in on your muscle recovery.',
      context: `${activeWorkout.name} is still recovering and will be ready ${when}.`,
      nextActionPrompt: 'Want to check if you should train lighter today, log an active day, or unlock the session anyway?',
      hooks: [
        { label: 'Should I train today?', text: 'Should I train today?' },
        { label: 'Can I do cardio?', text: 'Should I do cardio today?' },
        { label: 'Log an active day', text: 'Log 30 min ', fill: true },
        { label: 'Train anyway', text: 'Train anyway today' },
      ],
    });
  }
  const first = activeWorkout.exercises[0];
  const kit = activeWorkout.exercises.map((ex) => ex.equipment).find((e) => KIT_WORD[e]);
  const isAmber = readinessState === 'Amber Shield';
  const highInterventions = detectCoachInterventions({
    profile: input.profile,
    activeWorkout,
    workouts,
    biometrics: input.biometrics,
    exerciseCatalog,
    bodyweightEmaKg: input.bodyweightEmaKg,
    readinessState,
    activities: input.activities,
  }).filter((i) => i.priority === 'high');

  const hooks: CoachHook[] = [];
  if (highInterventions[0]) {
    hooks.push({ label: highInterventions[0].ctaLabel, text: highInterventions[0].coachPrompt });
  }
  if (isAmber) {
    hooks.push({ label: 'Why recovery is low', text: 'How is my recovery today?' });
    hooks.push({ label: 'Trim 1 set per lift', text: "Trim 1 working set per exercise in today's workout" });
    hooks.push({ label: 'Take a rest day', text: 'Take a rest day today' });
  } else {
    hooks.push({ label: "Today's briefing", text: "Give me a briefing for today's workout and targets" });
    hooks.push({ label: 'Short on time', text: "I'm short on time today" });
    if (kit) {
      hooks.push({
        label: `No ${kit === 'dumbbell' ? 'dumbbells' : kit === 'cable' ? 'cables' : kit} today`,
        text: `I don't have ${kit === 'dumbbell' ? 'dumbbells' : kit === 'cable' ? 'cables' : `a ${kit}`} today`,
      });
    } else {
      hooks.push({ label: 'Swap an exercise', text: 'I want to swap an exercise' });
    }
    hooks.push({ label: 'Warm-up', text: 'How should I warm up today?' });
  }
  return composeCoachOpening({
    id: 'workout-ready',
    greeting: isAmber ? "Hey — I'm right here with you for today's session." : "Hey — ready to get after today's workout?",
    context: isAmber
      ? `${activeWorkout.name} is ready, but recovery is low today — weights hold steady with 2–3 reps in reserve.`
      : `${activeWorkout.name} is ready: ${activeWorkout.exercises.length} exercises${first ? `, starting with ${first.name}` : ''}.`,
    nextActionPrompt: isAmber
      ? 'Want to check why recovery is low, trim a set per lift for a lighter session, or move today to a rest day?'
      : `Want a quick briefing on today's targets, a warm-up ramp${first ? ` for ${first.name}` : ''}, or to swap any busy equipment before Set 1?`,
    hooks,
  });
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
    return composeCoachOpening({
      id: 'goal-weekly',
      greeting: "Hey — here's where your weekly consistency stands.",
      context: `${goal.title}: ${standing}${m.streakWeeks > 0 ? `, and ${m.streakWeeks} ${m.streakWeeks === 1 ? 'week' : 'weeks'} in a row` : ''}.`,
      nextActionPrompt: 'Want to adjust your weekly session target, check what counts toward a session, or plan around a busy week?',
      hooks,
    });
  }
  if (m.type === 'body') {
    const direction =
      m.phase === 'Cut / Recomp'
        ? 'Am I losing weight?'
        : m.phase === 'Maingain'
          ? 'How is my body composition trending?'
          : 'Am I gaining weight?';
    return composeCoachOpening({
      id: 'goal-chosen',
      greeting: `Hey — let's check your pace toward ${goal.title}.`,
      context: `${goal.title}: ${m.signsMeasured > 0 ? `${m.signsMet} of ${m.signsMeasured} measured signs are showing` : 'nothing is measured yet'}. ${m.nextStep || m.evidenceLabel}`,
      nextActionPrompt: "Want to check your weight trend, dial in your daily protein target, or log today's weight?",
      hooks: [
        { label: direction, text: direction },
        { label: 'How much protein?', text: 'How much protein do I need?' },
        { label: 'How many calories?', text: 'How many calories should I eat?' },
        { label: "Log today's weight", text: 'Log weight ', fill: true },
        { label: 'Change my goal', text: 'Change my goal to ', fill: true },
      ],
    });
  }
  if (m.type === 'target') {
    if (m.metric === 'steps') {
      const stepsInfo = buildStepsCoachingSummary(input.biometrics, input.profile, input.now);
      return composeCoachOpening({
        id: 'goal-steps',
        greeting: "Hey — let's check your daily step pace.",
        context: `${goal.title}: ${stepsInfo.progressText}`,
        nextActionPrompt: "Want simple ways to raise your daily average without hurting leg recovery, or to log today's steps?",
        hooks: [
          { label: 'How can I improve my steps?', text: 'How can I increase my daily steps?' },
          { label: 'How are my steps trending?', text: 'How have my steps progressed over time?' },
          { label: 'Log steps today', text: 'Log ', fill: true },
          { label: 'Change step target', text: 'Set a goal of ', fill: true },
          { label: 'Remove step goal', text: 'Remove my steps goal' },
        ],
      });
    }
    const name = m.exerciseName.toLowerCase();
    return composeCoachOpening({
      id: 'goal-custom',
      greeting: `Hey — checking in on your ${m.exerciseName} target.`,
      context: `Your goal on ${m.exerciseName}: ${standing}.`,
      nextActionPrompt: 'Want to update this target, check form cues to keep progressing, or remove this goal?',
      hooks: [
        { label: 'Change the target', text: `My goal on ${name} is `, fill: true },
        { label: 'How do I do it?', text: `How do I do the ${name}?` },
        { label: 'Remove this goal', text: `Remove my ${name} goal` },
      ],
    });
  }
  const name = m.exerciseName.toLowerCase();
  const hooks: CoachHook[] = [
    { label: 'How do I do it?', text: `How do I do the ${name}?` },
    { label: 'Set my own target', text: `My goal on ${name} is `, fill: true },
    { label: "What's my weakest lift?", text: "What's my weakest lift?" },
  ];
  if (!goal.featured && goal.pillar) hooks.push({ label: 'Follow this lift', text: `Follow my ${goal.title.split(': ')[0].toLowerCase().split(' & ')[0]} strength level` });
  return composeCoachOpening({
    id: 'goal-strength',
    greeting: `Hey — let's look at your ${m.exerciseName} strength tier.`,
    context: `${goal.title}: ${standing} on ${m.exerciseName}.`,
    nextActionPrompt: `Want form cues for ${name}, to set a custom target, or to check your weakest lift?`,
    hooks,
  });
}

/** The coach's first line and suggestions for where it was opened. */
export function buildCoachOpening(input: CoachOpeningInput): CoachOpening {
  const { place, profile, workouts, biometrics } = input;
  const unit: WeightUnit = profile.weightUnit || 'kg';
  if (place.tab === 'train') return workoutOpening(input, unit);

  if (place.tab === 'program') {
    const p = planPosition(profile, workouts, input.activities ?? []);
    const interventions = detectCoachInterventions({
      profile,
      activeWorkout: input.activeWorkout,
      workouts,
      biometrics,
      exerciseCatalog: input.exerciseCatalog,
      bodyweightEmaKg: input.bodyweightEmaKg,
      readinessState: input.readinessState,
      activities: input.activities,
      trainingPlan: p.plan,
    });
    const topIntervention = interventions[0];
    const activeEditCount = (profile.programOverrides ?? []).filter((o) => o.planId === p.plan.id).length;
    const baseHooks: CoachHook[] = [
      ...(topIntervention ? [{ label: topIntervention.ctaLabel, text: topIntervention.coachPrompt }] : []),
      { label: 'What is this phase for?', text: 'What phase am I in?' },
      { label: "I'm away next week", text: "I'll be away travelling next week" },
      ...(activeEditCount > 0
        ? [
            { label: 'List custom edits', text: 'What custom changes are on my program?' },
            { label: 'Reset program edits', text: 'Clear my program customizations' },
          ]
        : [
            { label: 'Weekly schedule', text: 'How does the weekly schedule work?' },
            { label: 'Change my goal', text: 'Change my goal to ', fill: true },
          ]),
    ];
    return composeCoachOpening({
      id: 'program',
      greeting: "Hey — let's look at your training plan.",
      context: `You're in week ${p.week} of ${p.totalWeeks} of your ${p.plan.name}: ${p.overview.completedCount} of ${p.total} sessions done${p.nextLabel ? `, next is ${p.nextLabel}` : ''}${activeEditCount > 0 ? ` (${activeEditCount} custom adaptation${activeEditCount === 1 ? '' : 's'})` : ''}.`,
      nextActionPrompt: topIntervention
        ? `Want to review ${topIntervention.title.toLowerCase()}, check this phase's focus, or schedule an away week?`
        : "Want to check this phase's focus, swap an exercise across your program, or schedule an away week?",
      hooks: baseHooks,
    });
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
    const visibleWidgets = resolveVisibleProgressWidgets(profile.progressWidgets, profile);
    const activeCount = visibleWidgets.length;
    const totalAvailable = availableProgressWidgets(profile).length;
    const hooks: CoachHook[] = [{ label: 'What widgets can I add?', text: 'What widgets can I add to progress?' }];
    if (!visibleWidgets.includes('composition')) {
      hooks.push({ label: 'Add composition card', text: 'Add composition widget to progress' });
    } else if (!visibleWidgets.includes('balance')) {
      hooks.push({ label: 'Add balance widget', text: 'Add balance widget to progress' });
    }
    if (isWhoopConfigured(profile) && !visibleWidgets.includes('whoop-summary')) {
      hooks.push({ label: 'Add Whoop widget', text: 'Add whoop metrics to progress' });
    }
    hooks.push({ label: 'Reset to default', text: 'Reset my progress widgets' });
    return composeCoachOpening({
      id: 'progress-widgets',
      greeting: "Hey — let's tailor what you track here.",
      context: `You have ${activeCount} of ${totalAvailable} tracking cards turned on.`,
      nextActionPrompt: 'Want me to add Body Composition, Strength Balance, or Measurements, or reset your layout to default?',
      hooks,
    });
  }
  if (place.detail === 'steps') {
    const stepsInfo = buildStepsCoachingSummary(biometrics, profile, input.now);
    return composeCoachOpening({
      id: 'progress-steps',
      greeting: "Hey — here's your step activity check-in.",
      context: stepsInfo.progressText,
      nextActionPrompt: "Want simple ways to add 1,000 steps a day without adding leg fatigue, or to log today's steps?",
      hooks: [
        { label: 'How can I improve my steps?', text: 'How can I increase my daily steps?' },
        { label: 'Log steps today', text: 'Log ', fill: true },
        { label: 'Do steps count as workouts?', text: 'Do steps count toward workouts?' },
        ...(stepsInfo.goalTarget ? [] : [{ label: 'Set a step goal', text: 'Set a goal of 8000 daily steps' }]),
      ],
    });
  }
  if (place.detail === 'whoop') {
    const visibleWidgets = resolveVisibleProgressWidgets(profile.progressWidgets, profile);
    const hooks: CoachHook[] = [
      { label: 'Should I train today?', text: 'Should I train today?' },
      { label: 'How is readiness calculated?', text: 'How is my readiness score calculated?' },
      { label: 'How can I improve recovery?', text: 'How can I improve my Whoop recovery?' },
    ];
    if (!visibleWidgets.includes('whoop-summary')) {
      hooks.push({ label: 'Add Whoop widget', text: 'Add whoop metrics to progress' });
    }
    return composeCoachOpening({
      id: 'progress-whoop',
      greeting: "Hey — here's how your recovery telemetry looks.",
      context: buildWhoopCoachingSummary(biometrics, workouts, profile),
      nextActionPrompt: 'Want to check if you should push or hold today, or how readiness adjusts your working sets?',
      hooks,
    });
  }
  if (place.detail === 'goals') {
    const customised = Boolean(profile.goalSettings);
    const currentPerWeek = profile.goalSettings?.sessionsPerWeek ?? planPosition(profile, workouts, input.activities ?? []).plan.workoutsPerWeek;
    const altPerWeek = currentPerWeek === 3 ? 4 : 3;
    const followLift =
      profile.goalSettings?.strengthFocus === 'Horizontal Push'
        ? { label: 'Follow my squat', text: 'Follow my squat strength level' }
        : { label: 'Follow my bench', text: 'Follow my bench press strength level' };
    const hooks: CoachHook[] = [
      ownGoal,
      { label: `Train ${altPerWeek} times a week`, text: `Change my goal to ${altPerWeek} times a week` },
      followLift,
      { label: 'What are my goals?', text: 'What are my goals?' },
    ];
    if (customised) hooks.push({ label: "Use my plan's goals", text: "Use my plan's goals" });
    return composeCoachOpening({
      id: 'goals-settings',
      greeting: "Hey — let's set up targets that keep you moving.",
      context: `Tell me a goal and I'll set it right here, like "12 chin-ups" or "100 kg bench press". Your plan's goals are the defaults${customised ? ', and you can go back to them any time' : ''}.`,
      nextActionPrompt: 'Which target would you like to set or adjust first?',
      hooks,
    });
  }
  if (place.detail === 'composition') {
    const sortedBio = [...biometrics].sort((a, b) => a.date.localeCompare(b.date));
    const latestComp = [...sortedBio].reverse().find((b) => (b.bodyweightKg || 0) > 0 && typeof b.bodyFatPct === 'number' && b.bodyFatPct > 0);
    const compLine = latestComp
      ? `Latest composition: ${precise(latestComp.bodyweightKg)} at ${latestComp.bodyFatPct}% body fat (${precise(Math.round(latestComp.bodyweightKg * (1 - latestComp.bodyFatPct! / 100) * 10) / 10)} lean mass).`
      : hasWeighIn
        ? `Your 7-day average weight is ${precise(input.bodyweightEmaKg)}. Log a body fat % reading to track lean body mass alongside weight.`
        : 'Log your weight and body fat % to track weight, body fat, and lean body mass together.';
    return composeCoachOpening({
      id: 'progress-composition',
      greeting: "Hey — let's review your body composition.",
      context: compLine,
      nextActionPrompt: 'Want to check your lean mass trend, log a new weight or body fat reading, or see why scale weight can hold flat during recomposition?',
      hooks: [
        { label: 'Composition trend', text: 'How is my body composition trending?' },
        { label: 'Log weight', text: `Log weight `, fill: true },
        { label: 'Log body fat %', text: 'Log body fat ', fill: true },
        { label: 'How does recomp work?', text: 'Why is scale weight flat during body recomposition?' },
      ],
    });
  }
  if (place.detail === 'measurements') {
    const sortedBio = [...biometrics].sort((a, b) => a.date.localeCompare(b.date));
    const loggedSites = BODY_MEASUREMENT_SITES.filter((site) =>
      sortedBio.some((b) => typeof b[site.field] === 'number' && (b[site.field] as number) > 0)
    );
    const latestWaist = [...sortedBio].reverse().find((b) => typeof b.waistCm === 'number' && b.waistCm > 0)?.waistCm;
    const fmtLen = (cm: number) => (unit === 'lb' ? `${Math.round((cm / 2.54) * 10) / 10} in` : `${cm} cm`);
    return composeCoachOpening({
      id: 'progress-measurements',
      greeting: "Hey — let's check your tape measurements.",
      context:
        loggedSites.length > 0
          ? `You've tracked ${loggedSites.length} of 12 body tape sites${latestWaist ? ` (latest waist ${fmtLen(latestWaist)})` : ''}.`
          : 'You can track any of the 12 tape measurement sites (waist, chest, neck, arms, thighs, calves) right here or in the form.',
      nextActionPrompt: 'Want to log a new waist or arm measurement right here, or review your latest site trends?',
      hooks: [
        { label: 'Show my measurements', text: 'What are my latest body measurements?' },
        { label: 'Log waist', text: 'Log waist ', fill: true },
        { label: 'Log a tape site', text: 'Log left bicep ', fill: true },
        { label: 'Why measure waist?', text: 'Why is scale weight flat during body recomposition?' },
      ],
    });
  }
  if (place.detail === 'weight') {
    const direction =
      profile.goalPhase === 'Cut / Recomp'
        ? 'Am I losing weight?'
        : profile.goalPhase === 'Maingain'
          ? 'How is my body composition trending?'
          : 'Am I gaining weight?';
    return composeCoachOpening({
      id: 'progress-weight',
      greeting: "Hey — let's check your bodyweight trend.",
      context: hasWeighIn
        ? `Your 7-day average is ${precise(input.bodyweightEmaKg)}. For ${GOAL_DISPLAY_NAME[profile.goalPhase || 'Lean Bulk']}, I can tell you which way it's moving.`
        : "You haven't logged a weigh-in yet, so log your weight here and I can track how it moves against your goal.",
      nextActionPrompt: "Want to check your weekly rate of change, log today's morning weight, or dial in your daily protein target?",
      hooks: [
        { label: direction, text: direction },
        { label: 'Log weight', text: 'Log weight ', fill: true },
        { label: 'How much protein?', text: 'How much protein do I need?' },
        { label: 'How does 7-day EMA work?', text: 'How is my 7-day bodyweight average calculated?' },
      ],
    });
  }
  if (place.detail === 'insights') {
    const completedCount = workouts.filter((w) => w.completed).length;
    return composeCoachOpening({
      id: 'progress-insights',
      greeting: "Hey — here's your training and recovery check-in.",
      context:
        completedCount > 0
          ? `I'm tracking your weekly muscle sets, joint load, recovery readiness, and session notes across ${completedCount} finished workout${completedCount === 1 ? '' : 's'}.`
          : 'I track your weekly muscle sets, joint load, recovery readiness, and session notes as you log workouts.',
      nextActionPrompt: 'Want to see which muscles need more sets this week, check your joint strain, or review your recovery status?',
      hooks: [
        { label: 'Which muscles need sets?', text: 'Which muscles need more sets this week?' },
        { label: 'How am I recovering?', text: 'How am I recovering?' },
        { label: 'Joint strain check', text: 'How is my joint strain?' },
        ownGoal,
      ],
    });
  }
  if (place.detail === 'standards') {
    const balInterventions = detectCoachInterventions({
      profile,
      activeWorkout: input.activeWorkout,
      workouts,
      biometrics,
      exerciseCatalog: input.exerciseCatalog,
      bodyweightEmaKg: input.bodyweightEmaKg,
      readinessState: input.readinessState,
      activities: input.activities,
    }).filter((it) => it.kind === 'pull_push_imbalance' || it.kind === 'unilateral_asymmetry' || it.kind === 'strength_level_gap');
    const topBal = balInterventions[0];
    return composeCoachOpening({
      id: 'progress-standards',
      greeting: "Hey — let's check your strength standards and balance.",
      context: topBal
        ? `${topBal.title}: ${topBal.rationale}`
        : strength
        ? `Your closest strength level is ${strength.title}: ${describeGoalStanding(strength, precise)}.`
        : 'Strength levels compare your lifts with your bodyweight — log your weight to see where each lift stands.',
      nextActionPrompt: topBal
        ? 'Want me to rebalance your program for this, or check your weakest lift?'
        : 'Want to check your weakest lift, see how strength tiers are worked out, or set a personal lift goal?',
      hooks: [
        ...(topBal ? [{ label: topBal.ctaLabel, text: topBal.coachPrompt }] : []),
        { label: "What's my weakest lift?", text: "What's my weakest lift?" },
        { label: 'How are levels worked out?', text: 'How are strength levels worked out?' },
        ownGoal,
      ],
    });
  }
  if (place.detail === 'recent') {
    const completed = workouts
      .filter((w) => w.completed)
      .sort((a, b) => getWorkoutCompletedAt(a) - getWorkoutCompletedAt(b));
    const last = completed[completed.length - 1];
    const lastTonnage = last ? calculateSessionTonnage(last, hasWeighIn ? input.bodyweightEmaKg : 0).tonnageKg : 0;
    return composeCoachOpening({
      id: 'progress-recent',
      greeting: "Hey — let's review your recent sessions.",
      context: last
        ? `Your last session was ${last.name} (${last.date}${lastTonnage > 0 ? `, ${formatWeight(lastTonnage, unit)} tonnage` : ''}).`
        : 'Once you finish your first workout, your recent sessions and set history will appear here.',
      nextActionPrompt: 'Want a full recap of your last workout, your tonnage trend, or how your lifts are progressing?',
      hooks: [
        { label: 'Last workout recap', text: 'What did I do last workout?' },
        { label: 'Last session tonnage', text: 'What was my tonnage last workout?' },
        { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
      ],
    });
  }
  if (place.detail === 'bests') {
    const completedCount = workouts.filter((w) => w.completed).length;
    return composeCoachOpening({
      id: 'progress-bests',
      greeting: "Hey — let's look at your personal bests.",
      context:
        completedCount > 0
          ? `Your Trophy Cabinet tracks personal bests across ${completedCount} finished workout${completedCount === 1 ? '' : 's'}.`
          : 'Complete your first workout to start logging personal bests and estimated maxes.',
      nextActionPrompt: 'Want to check your strength levels, see how estimated 1RM is calculated, or review which lifts have climbed the most?',
      hooks: [
        { label: 'My strength levels', text: 'What are my strength standards?' },
        { label: 'How is E1RM calculated?', text: 'How is estimated 1RM calculated?' },
        { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
        ownGoal,
      ],
    });
  }
  if (place.detail === 'lifetime') {
    const completedCount = workouts.filter((w) => w.completed).length;
    return composeCoachOpening({
      id: 'progress-lifetime',
      greeting: "Hey — here's your big-picture training progress.",
      context: `You've logged ${completedCount} finished workout${completedCount === 1 ? '' : 's'} in total.`,
      nextActionPrompt: 'Want to check your training streak, review your overall strength gains, or see where your weekly volume stands?',
      hooks: [
        { label: 'My training streak', text: 'What is my training streak?' },
        { label: 'How am I doing?', text: 'How am I doing?' },
        { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
      ],
    });
  }
  const standingSummary =
    `${weekly ? `${describeGoalStanding(weekly, precise)}. ` : ''}${chosen && chosen.measure.type === 'body' && chosen.measure.signsMeasured > 0 ? `${chosen.title}: ${chosen.measure.signsMet} of ${chosen.measure.signsMeasured} measured signs showing.` : ''}`.trim() ||
    'Your goals fill in as you train.';
  return composeCoachOpening({
    id: 'progress',
    greeting: "Hey — let's check how your training is progressing.",
    context: standingSummary,
    nextActionPrompt: "Want a check-in on your strength gains, your weakest lift, or to log today's weight or a new goal?",
    hooks: [
      { label: 'How am I doing?', text: 'How am I doing?' },
      { label: 'Am I getting stronger?', text: 'Am I getting stronger?' },
      { label: "What's my weakest lift?", text: "What's my weakest lift?" },
      ownGoal,
      { label: "Log today's weight", text: 'Log weight ', fill: true },
    ],
  });
}
