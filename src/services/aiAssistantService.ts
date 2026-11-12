import { buildMovementStandards, buildStandardsAnswer } from './movementStandards';
import { standardsAge } from '../engine/strengthStandards';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import {
  AssistantActionPayload,
  AssistantChatMessage,
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  ReadinessState,
  ScientificPrinciple,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import {
  AthleteKnowledgeGraph,
  buildAthleteKnowledgeGraph,
  EXERCISE_SCIENCE_KNOWLEDGE_BASE,
  queryDesignSystemComponents,
  queryExerciseScienceKnowledgeBase,
} from '../engine/knowledgeGraph';
import { forgetOnDeviceExchange, isOnDeviceModelReady, promptOnDeviceModel } from './onDeviceModel';
import {
  adaptWorkoutSessionToLocation,
  generateSmartWorkoutSession,
  getFirstSplitDayForProgram,
} from './workoutGenerator';
import { localDateString } from '../utils/date';
import { formatPreciseWeight, formatWeight, snapLoadKg } from '../utils/units';
import { calculateE1RM } from '../engine/e1rm';
import { runReadAloudQaGate, VOICE_TONE_MATRIX } from '../engine/contentStrategy';
import { buildExerciseInsight } from './exerciseInsight';
import { spelledNumberNotInFacts } from './factChecks';
import { buildExerciseNoteFacts } from './exerciseCoachNote';
import { MUSCLE_FRIENDLY_NAMES } from '../engine/recovery';
import { findLastCompletedExerciseSession } from '../engine/progression';
import { ActivityLog, activeDayDates } from '../engine/activeDays';
import { computeTrainingStreak } from '../engine/recovery';
import { MUSCLE_TO_GRAPH_KEY } from './sessionReport';
import {
  answerEverydayQuestion,
  answerPlanPosition,
  answerRestTimes,
  answerShouldTrain,
  answerStreak,
  answerSwap,
  findExerciseNamed,
  answerSwapWithOptions,
  answerWeeklySets,
  answerWeightChange,
  asksAboutVolume,
  exerciseNamedIn,
  planPosition,
} from './coachAnswers';

export { exerciseNamedIn };

export interface AssistantProcessInput {
  userMessage: string;
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  weeklyVolume?: Record<string, number>;
  /** Logged active days, so plan position and streak match the Program page and header. */
  activities?: ActivityLog[];
  /** Streams the on-device model's answer as it is generated. */
  onPartial?: (textSoFar: string) => void;
  /** Reports first-time model download progress (0-1). */
  onDownloadProgress?: (fraction: number) => void;
}

export interface AssistantProcessResult {
  message: AssistantChatMessage;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
  actionTaken?: AssistantActionPayload;
}

/**
 * Maps home equipment tags to natural user-facing names
 */
const EQUIPMENT_NAMES: Record<HomeEquipmentTag, string> = {
  pullup_bar: 'Pull-Up Bar',
  dumbbells: 'Dumbbells',
  bench: 'Exercise Bench',
  trx: 'TRX Suspension Trainer',
  bands: 'Resistance Bands',
};

/**
 * Core On-Device AI Assistant Service:
 * Synthesizes athlete intent, queries the Athlete Knowledge Graph, executes state mutations,
 * and formulates direct tactical coaching responses accelerated by Google Tensor on Pixel devices.
 */
export async function processAssistantMessage(
  input: AssistantProcessInput
): Promise<AssistantProcessResult> {
  // Safety first: pain, injury and warning symptoms always get a fixed, conservative answer.
  const safety = buildSafetyResponse(input.userMessage, input.activeWorkout);
  if (safety) {
    return {
      message: {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: 'assistant',
        text: safety,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    };
  }
  return processAssistantMessageCore(input);
}

const URGENT_SYMPTOMS =
  /\b(chest\s*pain|chest\s*tight|pressure\s*in\s*(my\s*)?chest|faint(ed|ing)?|pass(ed)?\s*out|dizz(y|iness)|can'?t\s*breathe|short(ness)?\s*of\s*breath|heart\s*(is\s*)?racing|palpitations?|numb(ness)?\s*(in\s*)?(my\s*)?(arm|face|jaw))\b/i;
const PAIN_WORDS =
  /\b(pain(ful)?|hurts?|hurting|hurt|injur(y|ed|ies)|ach(e|es|ing)|sharp|stabbing|tweak(ed)?|pulled\s+(a|my)|sprain(ed)?|strained|swollen|swelling|numb|tingl(e|ing)|popped|torn)\b/i;

const BODY_PART_EXERCISE_HINTS: { part: RegExp; label: string; matches: (ex: ExerciseSession) => boolean }[] = [
  {
    part: /\bshoulders?\b|\brotator\b/i,
    label: 'shoulder',
    matches: (ex) => ['Horizontal Push', 'Vertical Push'].includes(ex.pillar) || /raise|press|dip|fly/i.test(ex.name),
  },
  { part: /\belbows?\b|\bforearms?\b/i, label: 'elbow', matches: (ex) => /curl|extension|pushdown|dip|press|chin|pull/i.test(ex.name) },
  { part: /\bwrists?\b/i, label: 'wrist', matches: (ex) => /press|curl|push-?up|front squat/i.test(ex.name) },
  { part: /\bknees?\b/i, label: 'knee', matches: (ex) => ex.pillar === 'Squat' || /lunge|leg ext|split squat|sprint/i.test(ex.name) },
  {
    part: /\b(lower\s*)?back\b|\bspine\b|\bhips?\b/i,
    label: 'back',
    matches: (ex) => ex.pillar === 'Hinge' || ex.pillar === 'Squat' || /row|deadlift|rdl|good morning/i.test(ex.name),
  },
  { part: /\bneck\b/i, label: 'neck', matches: (ex) => /behind-the-neck|shrug|upright row|overhead/i.test(ex.name) },
  { part: /\bchest\b|\bpec/i, label: 'chest', matches: (ex) => ex.pillar === 'Horizontal Push' },
];

/**
 * Fixed, conservative replies for pain, injury and warning symptoms. Never generated by a model.
 */
export function buildSafetyResponse(message: string, activeWorkout?: WorkoutSession): string | null {
  if (URGENT_SYMPTOMS.test(message)) {
    return (
      'Stop training now. Chest pain, fainting, dizziness, trouble breathing or a racing heart can be ' +
      'signs of a medical problem. Sit down, and if it doesn\'t settle quickly or feels severe, call your local ' +
      'emergency number. Please get checked by a doctor before your next workout.'
    );
  }
  if (!PAIN_WORDS.test(message)) return null;
  // "Sore" alone (normal muscle soreness) is handled by the regular coach.
  const hint = BODY_PART_EXERCISE_HINTS.find((h) => h.part.test(message));
  const affected = hint && activeWorkout ? activeWorkout.exercises.filter(hint.matches).map((e) => e.name) : [];
  const exerciseLine =
    affected.length > 0
      ? `In today's workout that means ${affected.slice(0, 3).join(', ')}. Tap "Change Exercise" on any of them to swap to a variation that doesn't hurt, or skip it today.`
      : 'Skip any exercise that causes it, or tap "Change Exercise" to try a variation that is pain-free.';
  return (
    `Don't train through ${hint ? `${hint.label} ` : ''}pain. Normal muscle burn and next-day soreness are fine, ` +
    'but sharp, pinching or joint pain is a signal to stop that movement.\n\n' +
    `${exerciseLine}\n\n` +
    'If the pain is sharp, lasts more than a few days, or comes with swelling, numbness or weakness, see a doctor ' +
    'or physiotherapist before loading it again. I can\'t diagnose injuries.'
  );
}

/**
 * The on-device coach's instructions. Short on purpose (phone GPUs read ~30 tokens/s) and stable
 * for a whole chat, so follow-up questions can reuse it. Question-specific facts go in the question.
 */
export function buildCoachSystemPrompt(input: AssistantProcessInput): string {
  const { profile, activeWorkout, workouts, biometrics, exerciseCatalog, bodyweightEmaKg, readinessState, weeklyVolume = {} } = input;
  const kg = buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, weeklyVolume, input.activities ?? []);
  const latestBio = biometrics[biometrics.length - 1];
  const unit = profile.weightUnit || 'kg';
  const exercisesDesc = (activeWorkout?.exercises || [])
    .map((e) => {
      const working = e.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup');
      // Today's own rep targets (what the workout card shows), then the range they progress through.
      const range = e.minReps === e.maxReps ? '' : ` (range ${e.minReps}-${e.maxReps})`;
      return `${e.name} ${working.length} sets aiming for ${working[0]?.targetReps ?? e.minReps} reps${range} @ ${formatWeight(working[0]?.targetWeightKg ?? 0, unit)}`;
    })
    .join('; ');
  // The muscles today's exercises train, with the same status the exercise cards show.
  const todaysMuscleKeys = [
    ...new Set(
      (activeWorkout?.exercises || [])
        .map((e) => exerciseCatalog.find((d) => d.id === e.exerciseId)?.primaryMuscle)
        .map((m) => (m ? MUSCLE_TO_GRAPH_KEY[m] : undefined))
        .filter((k): k is string => Boolean(k))
    ),
  ];
  const musclesDesc = (todaysMuscleKeys.length ? kg.muscleProfiles.filter((m) => todaysMuscleKeys.includes(m.muscleKey)) : kg.muscleProfiles.slice(0, 3))
    .map((m) => `${m.displayName} ${m.weeklySets} of ${m.personalizedMav[0]}-${m.personalizedMav[1]} (${muscleTargetStatus(m)})`)
    .join(', ');
  const athleteName = profile.name && profile.name !== 'Athlete' ? profile.name.split(' ')[0] : '';
  const goalLabel =
    profile.goalPhase === 'Cut / Recomp' ? 'lose fat, keep muscle' : profile.goalPhase === 'Maingain' ? 'stay lean' : 'build muscle';
  const recovery = readinessState === 'Amber Shield' ? 'low' : readinessState === 'Primed' ? 'high' : 'normal';
  // Bodyweight is only given once the athlete has logged one (never the starting-load placeholder).
  const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);

  // Voice from the content strategy: pragmatic and observant, grounded in logged facts, no hype.
  return `You are ${VOICE_TONE_MATRIX.steadyVoice.replace(/^The /, 'the ').replace(/\.$/, '')}, speaking to ${athleteName || 'the athlete'} as "you". Answer the question directly in 2-4 short plain sentences, no greeting. For anything about their plan, weights, sets or progress, use only the facts below. For general training questions (timing, motivation, habits, technique, food), give practical, widely accepted advice in your own words, without numbers. Never say the plan or the facts don't cover something. Never call a muscle's sets enough unless it is on target. High recovery means today's targets stand. Don't praise effort the facts don't show. You don't know how past sessions went. The plan sets weights and raises them itself when every set reaches the top of the range; never tell them to change the weight. No hype, cheerleading or percentages; say why something works in one plain clause.
Athlete: ${hasWeighIn ? `${formatWeight(bodyweightEmaKg, unit)}, ` : ''}goal ${goalLabel}, week ${planPosition(profile, workouts, input.activities ?? []).week}/6, recovery ${recovery}${
    latestBio && latestBio.hrvRmssd > 0 ? `, slept ${latestBio.sleepHours} h` : ''
  }.
Today's plan (not done yet): ${activeWorkout?.name || 'rest'}: ${exercisesDesc || 'nothing planned'}.
Weekly hard sets (done of target): ${musclesDesc || 'none yet'}.`;
}

/**
 * The model is given today's plan but no history, so anything it says about how past sessions went
 * is invented. Questions about history are answered from the logged sessions instead.
 */
/** An answer that calls an exercise by the wrong kit ("lift the dumbbells" for a cable raise). */
export function misnamesEquipment(answer: string, exercises: { name: string; equipment: string }[]): boolean {
  const text = answer.toLowerCase();
  const said = new Set<string>();
  if (/\bdumbbells?\b/.test(text)) said.add('dumbbell');
  if (/\b(barbells?|the bar|a bar)\b/.test(text)) said.add('barbell');
  if (/\bcables?\b/.test(text)) said.add('cable');
  if (/\bmachines?\b/.test(text)) said.add('machine');
  if (!said.size) return false;
  const mentioned = exercises.filter((ex) => exerciseNamedIn(text, ex.name));
  if (!mentioned.length) return false;
  return [...said].some((k) => !mentioned.some((ex) => ex.equipment === k));
}

/** The plan sets every weight (double progression), so the coach never tells the athlete to change it. */
export function changesPlanWeight(answer: string): boolean {
  if (/\b(adjust\w*|chang\w*|pick|choose|select|use|start with|begin with|go with|find) (a |the |your )?(\w+ )?(weight|load)\b/i.test(answer)) return true;
  return /\b(increas\w*|rais\w*|add\w*|bump\w*|lower\w*|reduc\w*|decreas\w*|drop\w*|go up in|go heavier|go lighter)\b[^.!?]{0,20}\b(the |your )?(weight|load|kg)\b|\b(heavier|lighter) weight\b/i.test(answer);
}

/** Advice must agree with today's recovery: no "you need more rest" on a good day, no "push hard" on a low one. */
export function contradictsRecovery(answer: string, readinessState: ReadinessState): boolean {
  const saysRest = /\b(need(s)? (more )?rest|take (it )?easy|take a rest|skip (today|the workout)|back off|go easy|rest instead|too hard|don'?t push|not push(ing)? (yourself )?(too )?hard|ease off|hold back)\b/i.test(answer);
  const saysPush = /\b(push (hard|harder|it)|go heavy|max out|all out)\b/i.test(answer) && !/\bnot\b[^.!?]{0,15}\bpush/i.test(answer);
  if (readinessState === 'Amber Shield') return saysPush;
  return saysRest;
}

/**
 * "Aim for 8–12 reps per set" with no exercise named, when today's exercises have different targets,
 * contradicts the workout card. A rep target has to belong to a named exercise.
 */
export function genericRepTarget(answer: string, exercises: { name: string; minReps: number; maxReps: number }[]): boolean {
  for (const sentence of answer.toLowerCase().split(/(?<=[.!?])\s+/)) {
    const range = /\b(\d+)\s*(?:-|–|to)\s*(\d+)\s*reps?\b/.exec(sentence) || /\b(\d+)\s*reps?\b/.exec(sentence);
    if (!range) continue;
    const namesOne = exercises.some((ex) => exerciseNamedIn(sentence, ex.name));
    if (namesOne) continue;
    const lo = Number(range[1]);
    const hi = Number(range[2] ?? range[1]);
    const fitsAll = exercises.every((ex) => lo >= ex.minReps && hi <= ex.maxReps);
    if (!fitsAll) return true;
  }
  return false;
}

/** The plan is 4 sessions a week with recovery between them, so "train every day" contradicts it. */
export function contradictsPlanSchedule(answer: string): boolean {
  return /\b(train\w*|lift\w*|work ?outs?|exercis\w*|gym)\b[^.!?]{0,40}\b(every|each) (single )?day\b|\b(every|each) day\b[^.!?]{0,40}\b(train\w*|lift\w*|work ?outs?)\b|\bdaily (training|workouts?|lifting)\b/i.test(answer);
}

export function claimsPastResults(answer: string): boolean {
  return /\b(you(?:'re| are) new|if you'?re new|new to (the|this)|you(?:'ve| have)? (performed|did|done|completed|managed|reached|missed|failed|lifted|logged|hit)|you did not|you didn'?t (reach|hit|manage|complete)|last (time|session|week)|previous(ly)? (session|workout))\b/i.test(answer);
}

function muscleTargetStatus(m: { weeklySets: number; personalizedMav: [number, number] | number[] }): 'below target' | 'on target' | 'above target' {
  return m.weeklySets < m.personalizedMav[0] ? 'below target' : m.weeklySets > m.personalizedMav[1] ? 'above target' : 'on target';
}

/**
 * Rejects a model answer that says a muscle (or an exercise for it) has enough, a good amount or too
 * much training when the knowledge graph says otherwise.
 */
export function contradictsMuscleTargets(
  answer: string,
  muscles: { names: string[]; status: 'below target' | 'on target' | 'above target' }[]
): boolean {
  const sentences = answer.toLowerCase().split(/(?<=[.!?])\s+/);
  const saysEnough = /\b(good amount|enough|plenty|solid (amount|volume)|on (track|target)|hitting (your|the) target|great volume)\b/;
  const saysTooMuch = /\b(too (much|many)|over (your|the) target|above (your|the) target|back off|cut back)\b/;
  const saysTooLittle = /\b(below|under|short of|behind|not enough|more sets)\b/;
  for (const sentence of sentences) {
    for (const m of muscles) {
      if (!m.names.some((n) => sentence.includes(n))) continue;
      if (saysEnough.test(sentence) && m.status !== 'on target') return true;
      if (saysTooMuch.test(sentence) && m.status !== 'above target') return true;
      if (saysTooLittle.test(sentence) && !/\bnot (below|behind)\b/.test(sentence) && m.status !== 'below target' && /\bsets?|volume|training\b/.test(sentence)) return true;
    }
  }
  return false;
}

/**
 * Plain-English progress summary from completed workouts: how many sessions, and how each
 * repeated exercise's best working set has changed. Never estimates or invents numbers.
 */
export function buildProgressSummary(workouts: WorkoutSession[], unit: 'kg' | 'lb'): string {
  const completed = workouts
    .filter((w) => w.completed)
    .sort((a, b) => (a.completedAt || a.date).localeCompare(b.completedAt || b.date));
  if (completed.length === 0) {
    return "You haven't finished a workout yet. Once you do, I'll track every lift and show you how it's moving.";
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const lastWeek = completed.filter((w) => new Date(w.completedAt || w.date).getTime() >= weekAgo).length;

  // Best working set per exercise per session, in time order.
  const history = new Map<string, { name: string; sets: { weightKg: number; reps: number }[] }>();
  for (const w of completed) {
    for (const ex of w.exercises) {
      const done = ex.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup');
      if (done.length === 0) continue;
      const best = done.reduce((a, b) => {
        const aw = a.actualWeightKg ?? a.targetWeightKg;
        const bw = b.actualWeightKg ?? b.targetWeightKg;
        return bw > aw || (bw === aw && (b.actualReps ?? b.targetReps) > (a.actualReps ?? a.targetReps)) ? b : a;
      });
      const entry = history.get(ex.exerciseId) || { name: ex.name, sets: [] };
      entry.sets.push({ weightKg: best.actualWeightKg ?? best.targetWeightKg, reps: best.actualReps ?? best.targetReps });
      history.set(ex.exerciseId, entry);
    }
  }

  const changes: string[] = [];
  for (const { name, sets } of history.values()) {
    if (sets.length < 2) continue;
    const first = sets[0];
    const last = sets[sets.length - 1];
    // Bodyweight lifts read "bodyweight" (and "bodyweight + 2.5 kg" once loaded), never "0 kg".
    const load = (kg: number) => (kg > 0 ? formatWeight(kg, unit) : 'bodyweight');
    if (last.weightKg > first.weightKg) {
      changes.push(
        first.weightKg > 0
          ? `${name}: ${load(first.weightKg)} → ${load(last.weightKg)}`
          : `${name}: bodyweight → bodyweight + ${formatWeight(last.weightKg, unit)}`
      );
    } else if (last.weightKg === first.weightKg && last.reps > first.reps) {
      changes.push(`${name}: ${first.reps} → ${last.reps} reps at ${last.weightKg > 0 ? formatWeight(last.weightKg, unit) : 'bodyweight'}`);
    }
  }

  const sessions = `You've finished ${completed.length} workout${completed.length === 1 ? '' : 's'} in total${
    lastWeek > 0 ? ` (${lastWeek} in the last 7 days)` : ''
  }.`;
  if (changes.length > 0) {
    return `${sessions} Lifts that have gone up:\n${changes.slice(0, 4).map((c) => `• ${c}`).join('\n')}\n\nThe Progress tab shows the full trend.`;
  }
  const repeated = [...history.values()].some((h) => h.sets.length >= 2);
  return repeated
    ? `${sessions} Your repeated lifts are holding steady so far. Aim to beat last time by one rep or a small weight jump.`
    : `${sessions} Each exercise has only been done once so far, so there's nothing to compare yet. Your next sessions will show your gains here and on the Progress tab.`;
}

const EQUIPMENT_KEYWORDS: { tag: HomeEquipmentTag; pattern: string; name: string }[] = [
  { tag: 'pullup_bar', pattern: 'pull[\\s-]?up\\s*bar|chin[\\s-]?up\\s*bar', name: 'Pull-Up Bar' },
  { tag: 'dumbbells', pattern: 'dumbbells?|dbs?', name: 'Dumbbells' },
  { tag: 'bench', pattern: 'bench', name: 'Exercise Bench' },
  { tag: 'trx', pattern: 'trx|suspension\\s*trainer|(?:gymnastic\\s*)?rings', name: 'TRX Suspension Trainer' },
  { tag: 'bands', pattern: '(?:resistance\\s*)?bands?', name: 'Resistance Bands' },
];
/** Only these words may sit between the verb and the gear, so "got 8 reps on bench" isn't a purchase. */
const EQUIPMENT_FILLER =
  '(?:\\s+(?:a|an|some|new|the|my|me|myself|our|this|that|adjustable|flat|incline|workout|home|pair|set|of|second|spare|old|own))*';
/** "Bench" is also a lift: "got a new bench PR" and "have bench today" are about training, not gear. */
const NOT_EQUIPMENT_AFTER =
  '(?!\\s+(?:press|presses|pressing|row|rows|curl|curls|fly|flies|flyes|squat|squats|raise|raises|extension|extensions|lunge|lunges|rdl|deadlift|deadlifts|pull|pulls|pr|prs|pb|pbs|max|1rm|e1rm|record|best|rep|reps|set|sets|today|tonight|tomorrow|day|session|workout|next)\\b)';
const EQUIPMENT_ADD_VERBS = 'bought|got|have|has|own|new|add|added|purchased|acquired|picked\\s*up|equipped\\s*with|can\\s*use';
const EQUIPMENT_REMOVE_VERBS =
  'remove|removed|delete|deleted|lost|sold|don[\'’]?t\\s*have|do\\s*not\\s*have|no\\s*longer\\s*(?:have|own|use)|got\\s*rid\\s*of';

/**
 * A change to the athlete's gear, only when the message says so directly ("I got a pull-up bar",
 * "I sold my dumbbells"). Mentioning gear, or a lift named after it, never changes anything, and
 * neither does a question.
 */
function detectEquipmentChange(
  lowerMsg: string
): { equipment: (typeof EQUIPMENT_KEYWORDS)[number]; action: 'add' | 'remove' } | null {
  if (/\?\s*$/.test(lowerMsg) || /^(do|does|did|can|could|should|would|will|what|what['’]?s|whats|which|how|why|when|where|is|are)\b/.test(lowerMsg)) {
    return null;
  }
  const mentions = (verbs: string, pattern: string) =>
    new RegExp(`\\b(?:${verbs})${EQUIPMENT_FILLER}\\s+(?:${pattern})\\b${NOT_EQUIPMENT_AFTER}`, 'i').test(lowerMsg);
  for (const equipment of EQUIPMENT_KEYWORDS) {
    if (mentions(EQUIPMENT_REMOVE_VERBS, equipment.pattern)) return { equipment, action: 'remove' };
  }
  for (const equipment of EQUIPMENT_KEYWORDS) {
    if (mentions(EQUIPMENT_ADD_VERBS, equipment.pattern)) return { equipment, action: 'add' };
  }
  return null;
}

/**
 * A small model invents numbers, so a chat answer is only shown if every weight, percentage or larger
 * number in it came from what the model was given. Otherwise the rule-based coach answers.
 */
export function acceptCoachAnswer(answer: string, grounding: string): boolean {
  if (/\b(as an ai|language model)\b/i.test(answer)) return false;
  // A number written as a word ("twelve reps") is held to the same rule as digits; up to three is general talk.
  if (spelledNumberNotInFacts(answer, [grounding, '0 1 2 3'])) return false;
  const known = new Set(grounding.match(/\d+(?:\.\d+)?/g) || []);
  for (const m of answer.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?|%)?/gi)) {
    const value = m[1];
    if (m[2]) {
      // A weight or percentage has to appear as that same figure, not just as any matching number.
      const unit = m[2].toLowerCase().startsWith('kilo') ? 'kg' : m[2].toLowerCase().startsWith('p') ? 'lb' : m[2].toLowerCase().replace(/^lbs$/, 'lb');
      if (!new RegExp(`(^|[^\\d.])${value.replace('.', '\\.')}\\s*${unit === '%' ? '%' : `${unit}s?\\b`}`, 'i').test(grounding)) return false;
    } else if (!known.has(value) && parseFloat(value) > 3) {
      return false;
    }
  }
  return true;
}

/** A rejected chat answer is retried only when the first one came back this quickly. */
const RETRY_IF_FASTER_THAN_MS = 6000;

const LIFT_WORDS = ['bench', 'squat', 'deadlift', 'rdl', 'overhead', 'shoulder press', 'pulldown', 'pull-up', 'pull up', 'chin', 'row', 'curl', 'leg press'];

/** The best estimated max logged for the lift named in the message, from the same formula as Progress. */
function buildEstimatedMaxAnswer(lowerMsg: string, workouts: WorkoutSession[], bodyweightKg: number, unit: 'kg' | 'lb'): string {
  const lift = LIFT_WORDS.find((word) => lowerMsg.includes(word));
  if (!lift) return 'Which lift do you mean? Ask me for your bench, squat or deadlift, for example.';
  const spelled = lift.replace(' ', '-');
  let best: { name: string; kg: number } | null = null;
  for (const w of workouts.filter((session) => session.completed)) {
    for (const ex of w.exercises) {
      const name = ex.name.toLowerCase();
      if (!name.includes(lift) && !name.includes(spelled)) continue;
      for (const st of ex.sets) {
        if (!st.completed || st.isWarmup || st.setType === 'warmup') continue;
        const kg = calculateE1RM(
          st.actualWeightKg ?? st.targetWeightKg,
          st.actualReps ?? st.targetReps,
          st.actualRir ?? st.targetRir ?? 2,
          ex.equipment,
          ex.isRdl,
          ex.isWeightedCalisthenic,
          bodyweightKg,
          ex.exerciseId,
          ex.pillar
        );
        if (!best || kg > best.kg) best = { name: ex.name, kg };
      }
    }
  }
  if (!best) return `You haven't logged a ${lift} yet, so there's no estimated max to give. Your first session will set your starting point.`;
  return `Your best estimated one-rep max is ${formatPreciseWeight(best.kg, unit)} on ${best.name}. It's worked out from your best logged set, not a tested max.`;
}

/** The athlete's real recovery readings for a sentence, e.g. ", with HRV 58 ms, 7 h sleep"; empty without any. */
function recoveryReadingsClause(log?: BiometricLog): string {
  const readings = [
    log?.hrvRmssd ? `HRV ${log.hrvRmssd} ms` : '',
    log?.sleepHours ? `${log.sleepHours} h sleep` : '',
    log?.restingHr ? `resting heart rate ${log.restingHr} bpm` : '',
  ].filter(Boolean);
  return readings.length ? `, with ${readings.join(', ')}` : '';
}

async function processAssistantMessageCore(
  input: AssistantProcessInput
): Promise<AssistantProcessResult> {
  const {
    userMessage,
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume = {},
  } = input;

  const lowerMsg = userMessage.toLowerCase().trim();

  // Build current Knowledge Graph for deep context
  const kg: AthleteKnowledgeGraph = buildAthleteKnowledgeGraph(
    workouts,
    biometrics,
    exerciseCatalog,
    profile,
    weeklyVolume,
    input.activities ?? []
  );

  let answerText = '';
  let actionTaken: AssistantActionPayload | undefined;
  let updatedProfile: Partial<UserProfile> | undefined;
  let updatedWorkout: WorkoutSession | undefined;
  const citations: { label: string; metric: string; value: string }[] = [];
  const scientificPrinciplesCited: ScientificPrinciple[] = [];
  const strengthLevelsAnswer = () =>
    buildStandardsAnswer(
      buildMovementStandards({
        workouts,
        biometrics,
        bodyweightKg: bodyweightEmaKg,
        gender: profile.gender,
        age: standardsAge(profile),
      }),
      biometrics.some((b) => (b.bodyweightKg || 0) > 0)
    );

  // ============================================================================
  // 1. INTENT: UPDATE HOME EQUIPMENT (e.g. "I got a pull up bar", "I bought dumbbells")
  // ============================================================================
  // The exercise card's own two lines (built exactly as the Workout page builds them), so the coach
  // and the card never word the same thing differently.
  const cardLines = (ex: ExerciseSession): [string, string] => {
    const precise = (kgValue: number) => formatPreciseWeight(kgValue, profile.weightUnit || 'kg');
    const def = exerciseCatalog.find((d) => d.id === ex.exerciseId);
    return buildExerciseNoteFacts({
      exercise: ex,
      insight: buildExerciseInsight(ex, workouts, readinessState, bodyweightEmaKg, 12, precise),
      workouts,
      readinessState,
      knowledgeGraph: kg,
      primaryMuscle: def?.primaryMuscle,
      muscleLabel: def ? MUSCLE_FRIENDLY_NAMES[def.primaryMuscle] : undefined,
      formatWeight: precise,
    }).lines;
  };

  // Everyday questions answered from the athlete's plan and log ("I only have 30 minutes").
  const everydayAnswer = answerEverydayQuestion({
    lowerMsg,
    profile,
    activeWorkout,
    workouts,
    activities: input.activities,
    biometrics,
    exerciseCatalog,
    readinessState,
    bodyweightEmaKg,
    progressSummary: () => buildProgressSummary(workouts, profile.weightUnit || 'kg'),
    strengthLevels: strengthLevelsAnswer,
    weeklySets: (message) => answerWeeklySets(message, kg),
  });

  const detectedEquipmentChange = detectEquipmentChange(lowerMsg);
  // At the gym, "I don't have dumbbells" is about today's workout, not the gear kept at home:
  // it gets swap options and never deletes home equipment. "I sold my dumbbells" still does.
  const kitMissingToday =
    detectedEquipmentChange?.action === 'remove' &&
    (activeWorkout.location ?? 'gym') === 'gym' &&
    /\b(don['’]?t|do not) have\b/.test(lowerMsg) &&
    !/\b(any ?more|any longer|at home)\b/.test(lowerMsg);
  const equipmentChange = kitMissingToday ? null : detectedEquipmentChange;
  const matchedEquip = equipmentChange?.equipment;

  if (matchedEquip) {
    const currentList = new Set<HomeEquipmentTag>(profile.homeEquipment || []);

    if (equipmentChange.action === 'remove') {
      currentList.delete(matchedEquip.tag);
      const nextEquip = Array.from(currentList);
      updatedProfile = { homeEquipment: nextEquip };
      actionTaken = {
        type: 'UPDATE_EQUIPMENT',
        summary: `Removed ${matchedEquip.name} from Home Equipment`,
        details: { equipment: nextEquip, removed: matchedEquip.tag },
      };
      answerText = `Done. I've removed the ${matchedEquip.name} from your home equipment, so your home workouts and swap options won't use it.`;
    } else {
      currentList.add(matchedEquip.tag);
      const nextEquip = Array.from(currentList);
      updatedProfile = { homeEquipment: nextEquip };
      actionTaken = {
        type: 'UPDATE_EQUIPMENT',
        summary: `Added ${matchedEquip.name} to Home Equipment`,
        details: { equipment: nextEquip, added: matchedEquip.tag },
      };

      if (matchedEquip.tag === 'pullup_bar') {
        answerText = `Nice addition. I've added the Pull-Up Bar to your home equipment, so your home workouts can now include pull-ups and chin-ups.`;
      } else if (matchedEquip.tag === 'dumbbells') {
        answerText = `Great. I've added Dumbbells to your home equipment, so your home workouts can now include dumbbell presses, rows and Romanian deadlifts.`;
      } else if (matchedEquip.tag === 'bench') {
        answerText = `Added an Exercise Bench to your home equipment. Your home workouts can now include flat and incline presses with proper back support.`;
      } else if (matchedEquip.tag === 'trx') {
        answerText = `Added the TRX Suspension Trainer to your home equipment. Your home workouts can now include TRX rows, push-ups and single-leg squats.`;
      } else {
        answerText = `Added ${matchedEquip.name} to your home equipment. Your home workouts and swap options can now use it.`;
      }
    }

    // If current workout is at home, adapt it to immediately leverage new equipment
    if (activeWorkout.location === 'home') {
      const adapted = adaptWorkoutSessionToLocation(
        activeWorkout,
        'home',
        updatedProfile.homeEquipment,
        exerciseCatalog,
        workouts,
        readinessState,
        bodyweightEmaKg
      );
      updatedWorkout = adapted;
    }

    citations.push({
      label: 'Home Equipment',
      metric: 'Available Tools',
      value: (updatedProfile.homeEquipment || []).map((t) => EQUIPMENT_NAMES[t] || t).join(', '),
    });
  }

  // ============================================================================
  // 2. INTENT: SCHEDULE TRAVEL / LOCATION FOR FUTURE MESOCYCLE WEEK (e.g. "away in week 5")
  // ============================================================================
  else if (
    /\b(away|travel|travelling|traveling|trip|holiday|vacation|hotel|work\s*trip)\b/i.test(lowerMsg) &&
    /\b(week\s*[1-6]|next\s*week)\b/i.test(lowerMsg)
  ) {
    // Extract week number
    let targetWeek = profile.mesocycleWeek || 1;
    const weekMatch = lowerMsg.match(/week\s*([1-6])/i);
    if (weekMatch) {
      targetWeek = parseInt(weekMatch[1], 10);
    } else if (/next\s*week/i.test(lowerMsg)) {
      targetWeek = Math.min(6, (profile.mesocycleWeek || 1) + 1);
    }

    const currentSchedule = { ...(profile.scheduledWeekLocations || {}) };
    currentSchedule[targetWeek] = 'travel';

    updatedProfile = {
      scheduledWeekLocations: currentSchedule,
    };

    actionTaken = {
      type: 'SCHEDULE_LOCATION_WEEK',
      summary: `Scheduled Week ${targetWeek} for Bodyweight (0 kg External Load)`,
      details: { week: targetWeek, location: 'travel' },
    };

    answerText = `Done. Week ${targetWeek} of your plan is set to bodyweight training. When you reach it, each workout switches to exercises that need no equipment, like push-ups, split squats and inverted rows, with reps matched to your strength. Back early? Switch to the gym from the Workout tab.`;

    // If athlete is already in that week, adapt current workout too
    if ((profile.mesocycleWeek || 1) === targetWeek && activeWorkout.location !== 'travel') {
      const adapted = adaptWorkoutSessionToLocation(
        activeWorkout,
        'travel',
        profile.homeEquipment || [],
        exerciseCatalog,
        workouts,
        readinessState,
        bodyweightEmaKg
      );
      updatedWorkout = adapted;
      updatedProfile.activeLocation = 'travel';
    }

    citations.push({
      label: `Week ${targetWeek} Plan`,
      metric: 'Location Override',
      value: 'Bodyweight (0 kg external load)',
    });
  }

  // ============================================================================
  // 3. INTENT: SWITCH CURRENT WORKOUT LOCATION (e.g. "switch today to bodyweight", "train at home")
  // ============================================================================
  else if (
    /\b(switch|change|set|turn)\b.*\b(travel|bodyweight|home|gym)\b/i.test(lowerMsg) ||
    /\b(train\s*at\s*home|at\s*home\s*today|in\s*a\s*hotel|no\s*weights?\s*today|bodyweight\s*today|back\s*(?:to|at|in)\s*(?:the\s*)?gym|at\s*the\s*gym\s*today|train\s*at\s*the\s*gym)\b/i.test(lowerMsg)
  ) {
    let targetLoc: TrainingLocation = 'travel';
    if (/\b(home|house)\b/i.test(lowerMsg)) targetLoc = 'home';
    else if (/\b(gym|full\s*gym)\b/i.test(lowerMsg)) targetLoc = 'gym';

    const adapted = adaptWorkoutSessionToLocation(
      activeWorkout,
      targetLoc,
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
      exerciseCatalog,
      workouts,
      readinessState,
      bodyweightEmaKg
    );

    updatedWorkout = adapted;
    updatedProfile = { activeLocation: targetLoc };
    actionTaken = {
      type: 'SWITCH_LOCATION',
      summary: `Switched today's session to ${targetLoc === 'travel' ? 'Bodyweight' : targetLoc === 'home' ? 'At Home' : 'Full Gym'}`,
      details: { location: targetLoc },
    };

    if (targetLoc === 'travel') {
      answerText = `Switched today's workout to bodyweight. Every exercise now needs no equipment, with reps matched to your strength.`;
    } else if (targetLoc === 'home') {
      answerText = `Switched today's workout to home. It now uses ${(profile.homeEquipment || []).map((t) => EQUIPMENT_NAMES[t] || t).join(', ') || 'your bodyweight'}.`;
    } else {
      answerText = `Switched today's workout back to the gym, with barbells, cables and machines available again.`;
    }

    citations.push({
      label: 'Active Session',
      metric: 'Location',
      value: targetLoc,
    });
  }

  // ============================================================================
  // 4. INTENT: SWITCH PROGRAM SPLIT (e.g. "switch me to Upper / Lower", "switch to PPL")
  // ============================================================================
  else if (
    /\b(switch|change|set)\b.*\b(program|split|ppl|upper\s*lower|full\s*body)\b/i.test(lowerMsg) ||
    /\b(upper\s*lower\s*split|push\s*pull\s*legs)\b/i.test(lowerMsg)
  ) {
    // One plan, shaped by the goal: there are no splits to switch between.
    actionTaken = {
      type: 'SWITCH_PROGRAM_SPLIT',
      summary: 'Explained that the plan follows your goal',
      details: { programType: profile.programType },
    };
    answerText =
      "Your 6-week plan is set for your goal, so there's no split to pick. Tell me if your goal changes (build muscle, lose fat or stay lean) and your sets and reps will change with it. Can't make the gym? Switch to home or bodyweight from the Workout tab.";
  }

  // ============================================================================
  // 5. INTENT: SWITCH GOAL PHASE (e.g. "switch my goal to Cut / Recomp", "start a bulk")
  // ============================================================================
  else if (
    /\b(cut|cutting|recomp|lose\s*fat|lean\s*bulk|bulk|bulking|build\s*muscle|maingain|stay\s*lean)\b/i.test(lowerMsg) &&
    /\b(goal|phase|switch|change|want\s*to|start)\b/i.test(lowerMsg)
  ) {
    let targetGoal: GoalPhase = 'Cut / Recomp';
    if (/\b(bulk|bulking|build\s*muscle|lean\s*bulk)\b/i.test(lowerMsg)) {
      targetGoal = 'Lean Bulk';
    } else if (/\b(maingain|stay\s*lean|maintain)\b/i.test(lowerMsg)) {
      targetGoal = 'Maingain';
    }

    updatedProfile = { goalPhase: targetGoal };
    actionTaken = {
      type: 'SWITCH_GOAL_PHASE',
      summary: `Switched goal to ${GOAL_DISPLAY_NAME[targetGoal]}`,
      details: { goalPhase: targetGoal },
    };

    if (targetGoal === 'Cut / Recomp') {
      answerText = `Your goal is now ${GOAL_DISPLAY_NAME[targetGoal]}. From your next workout the big lifts stay heavy, with no extra sets, so you keep your strength and muscle while you eat a little less.`;
    } else if (targetGoal === 'Lean Bulk') {
      answerText = `Your goal is now ${GOAL_DISPLAY_NAME[targetGoal]}. From your next workout your sets build across the 6 weeks, with an extra set on smaller muscles in the last two weeks.`;
    } else {
      answerText = `Your goal is now ${GOAL_DISPLAY_NAME[targetGoal]}. From your next workout you'll keep a steady 3 sets per exercise to get stronger without wearing yourself down.`;
    }

    citations.push({
      label: 'Training Goal',
      metric: 'Goal',
      value: GOAL_DISPLAY_NAME[targetGoal],
    });
  }

  // ============================================================================
  // 6. INTENT: LOG REST DAY / SHIFT WORKOUT (e.g. "I can't train today", "take a rest day")
  // ============================================================================
  else if (
    /\b(rest\s*day|can['’]?t\s*train|skip\s*today|shift\s*(workout|session|today)|day\s*off)\b/i.test(lowerMsg) &&
    (/\?\s*$/.test(lowerMsg) || /^(should|can|could|do|does|is|would|what|when|how|why)\b/.test(lowerMsg)) &&
    !/\b(log|take|make|give me|i need|i want|i'?m taking)\b/.test(lowerMsg)
  ) {
    // "Should I skip today?" is a question: answer it from recovery and change nothing.
    const check = answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState);
    const lead = /^Not yet\. /.test(check) ? 'Yes, rest today. ' : /^Yes\. /.test(check) ? "You don't need to. " : '';
    answerText = `${lead}${check.replace(/^(Not yet|Yes)\. /, '')} ${lead.startsWith('Yes') ? 'Say' : "If you'd rather rest, say"} "take a rest day" and ${activeWorkout.name} moves to tomorrow; missing a day doesn't set your plan back.`;
  } else if (
    /\b(rest\s*day|can['’]?t\s*train|skip\s*today|shift\s*(workout|session|today)|day\s*off)\b/i.test(lowerMsg)
  ) {
    const today = new Date();
    // The header's streak (saved workouts and active days), never a stored counter.
    const restDayStreak = computeTrainingStreak(workouts, Date.now(), activeDayDates(input.activities ?? []));
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = localDateString(tomorrow);

    updatedWorkout = {
      ...activeWorkout,
      date: tomorrowStr,
    };

    actionTaken = {
      type: 'SHIFT_WORKOUT',
      summary: `Logged Rest Day: ${activeWorkout.name} held for tomorrow`,
      details: { date: tomorrowStr },
    };

    answerText = `Rest day logged. ${activeWorkout.name} will be waiting for you tomorrow. Missing a day doesn't set your plan back${restDayStreak > 0 ? `, and your ${restDayStreak}-day streak is safe` : ''}.`;

    citations.push({
      label: 'Schedule',
      metric: 'Next Session',
      value: `Tomorrow (${activeWorkout.name})`,
    });
  }

  // ============================================================================
  // 6b. INTENTS ABOUT THE ATHLETE'S OWN PLAN AND DATA (same figures as the pages)
  // ============================================================================
  else if (/\bstreak\b/.test(lowerMsg)) {
    answerText = answerStreak(workouts, input.activities ?? []);
  } else if (
    kitMissingToday ||
    /\b(no|without) (a |an |the |any )?(free )?(barbells?|dumbbells?|cables?|machines?)\b|\b(barbells?|dumbbells?|cables?|machines?) (is|are|were|was) (all )?(taken|busy|in use|broken|full|occupied)\b/.test(lowerMsg)
  ) {
    answerText = `${answerSwap(lowerMsg, activeWorkout, exerciseCatalog)}${kitMissingToday ? `\n\nIf you meant your home equipment, say "remove the ${detectedEquipmentChange!.equipment.name.toLowerCase()}".` : ''}`;
  } else if (everydayAnswer) {
    answerText = everydayAnswer;
  } else if (
    /\b(what|which) week\b|\bweek am i\b|\b(sessions?|workouts?) (are )?left\b|\bhow far (am i|through)\b|\bwhere am i in\b|\bwhat'?s next\b|\bwhat is next\b|\bnext workout\b|\bafter this (workout|session)\b|\bwhich phase\b|\bwhat phase\b/.test(lowerMsg)
  ) {
    answerText = answerPlanPosition(profile, workouts, input.activities ?? []);
  } else if (
    /\bshould i (train|work ?out|lift|go to the gym|skip)\b(?! (to|till|until) failure)|\b(am i|are my muscles) (ready|recovered)\b|\b(ok|okay|fine) to train\b|\bcan i train\b/.test(lowerMsg)
  ) {
    answerText = answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState);
  } else if (
    /\bwhy\b.*\b(weights?|heavier|lighter|reps?|load)\b/.test(lowerMsg) &&
    /\b(go|goes|went|gone|change[ds]?|up|down|drop(ped)?|increase[ds]?|same|heavier|lighter|more|less|higher|lower)\b/.test(lowerMsg)
  ) {
    answerText = answerWeightChange(lowerMsg, activeWorkout, workouts, readinessState, profile.weightUnit || 'kg');
  } else if (/\b(how long|how much|how many (minutes|seconds))\b.*\brest\b|\brest (times?|between|periods?)\b/.test(lowerMsg)) {
    answerText = answerRestTimes(activeWorkout);
  } else if (asksAboutVolume(lowerMsg)) {
    answerText = answerWeeklySets(lowerMsg, kg);
  }

  // ============================================================================
  // 7. INTENT: KNOWLEDGE GRAPH QUERIES (Joints, Recovery, Muscles, Science)
  // ============================================================================
  // 7. INTENT: KNOWLEDGE GRAPH QUERIES (Joints, Science, Recovery, Muscles)
  // ============================================================================
  else {
    // Internal design-system documentation is not exposed in the athlete-facing coach.
    const isDesignQuery = false;

    const dsMatches = isDesignQuery ? queryDesignSystemComponents(lowerMsg) : [];

    // A. Joint Strain & Health Query
    const jointQuery = kg.joints.find((j) => {
      const lowerJ = j.joint.toLowerCase();
      return (
        lowerMsg.includes(lowerJ.split(' ')[0]) ||
        (lowerMsg.includes('shoulder') && lowerJ.includes('shoulder')) ||
        (lowerMsg.includes('elbow') && lowerJ.includes('elbow')) ||
        (lowerMsg.includes('back') && lowerJ.includes('lumbar')) ||
        (lowerMsg.includes('knee') && lowerJ.includes('knee')) ||
        (lowerMsg.includes('ankle') && lowerJ.includes('ankle'))
      );
    });

    if (jointQuery || lowerMsg.includes('joint') || lowerMsg.includes('joint strain')) {
      const targetJoint = jointQuery || kg.joints.sort((a, b) => b.strainScore - a.strainScore)[0];
      answerText = `Your ${targetJoint.joint} is currently at ${targetJoint.strainScore}/100 load (${targetJoint.status}). Most of the recent stress came from ${targetJoint.topContributors.slice(0, 2).join(' and ') || 'recent pressing movements'}. ${targetJoint.biomechanicalAdvice}`;

      citations.push({
        label: targetJoint.joint,
        metric: 'Strain Score',
        value: `${targetJoint.strainScore}/100 (${targetJoint.status})`,
      });
      citations.push({
        label: 'Lower Back Load',
        metric: 'Axial Load',
        value: `${kg.systemicAxialLoadScore}%`,
      });
    }

    // B. Grounded Design System Component Query (Anatomy, Logic Invariants, Tailwind Tokens)
    else if (isDesignQuery && dsMatches.length > 0) {
      const comp = dsMatches[0];
      answerText = `Component Specification: ${comp.name} (${comp.category})\n\nRationale:\n${comp.rationale}\n\nComponent Anatomy:\n- Typography: ${comp.anatomy.typography}\n- Container: ${comp.anatomy.container}\n- Touch Target: ${comp.anatomy.touchTarget}\n- Colors & States: ${comp.anatomy.colors}\n\nKey Invariant Rules:\n${comp.logic.rules.map((r) => `• ${r}`).join('\n')}\n\nTailwind Tokens:\n${comp.tailwindTokens}`;

      citations.push({
        label: comp.name,
        metric: 'Component ID',
        value: comp.id,
      });
      citations.push({
        label: 'Touch Target',
        metric: 'Accessibility',
        value: comp.anatomy.touchTarget,
      });
    }

    // C. Grounded Exercise Science Knowledge Base Query (Exact Formulas & Physiological Rationale)
    else {
      // Prioritize active exercise targets over theoretical science when athlete asks about today's weights/reps
      const isTacticalWorkoutQuery =
        (lowerMsg.includes('weight') ||
          lowerMsg.includes('rep') ||
          lowerMsg.includes('set') ||
          lowerMsg.includes('target') ||
          lowerMsg.includes('today') ||
          lowerMsg.includes('prescribed') ||
          lowerMsg.includes('how much') ||
          lowerMsg.includes('how many') ||
          lowerMsg.includes('swap') ||
          lowerMsg.includes('substitute') ||
          lowerMsg.includes('replace') ||
          lowerMsg.includes('alternative') ||
          lowerMsg.includes('instead of') ||
          lowerMsg.includes('briefing') ||
          lowerMsg.includes('warm') ||
          lowerMsg.includes('tempo')) &&
        !lowerMsg.includes('why') &&
        !lowerMsg.includes('formula') &&
        !lowerMsg.includes('multiplier') &&
        !lowerMsg.includes('citation') &&
        !lowerMsg.includes('academic') &&
        !lowerMsg.includes('retention shield') &&
        !lowerMsg.includes('scale') &&
        !lowerMsg.includes('diary') &&
        !lowerMsg.includes('measure') &&
        !lowerMsg.includes('recomp') &&
        !lowerMsg.includes('shirt off') &&
        !lowerMsg.includes('progress') &&
        !lowerMsg.includes('app do') &&
        !lowerMsg.includes('plan for me') &&
        !lowerMsg.includes('just show up') &&
        !lowerMsg.includes('how does the app') &&
        !lowerMsg.includes('science');
      const isPersonalTelemetryQuery =
        (lowerMsg.includes('my') ||
          lowerMsg.includes('today') ||
          lowerMsg.includes('current') ||
          lowerMsg.includes('score') ||
          lowerMsg.includes('what was') ||
          lowerMsg.includes('what is') ||
          lowerMsg.includes('how was') ||
          lowerMsg.includes('how much')) &&
        (lowerMsg.includes('recovery') ||
          lowerMsg.includes('strain') ||
          lowerMsg.includes('hrv') ||
          lowerMsg.includes('sleep') ||
          lowerMsg.includes('whoop') ||
          lowerMsg.includes('fitbit') ||
          lowerMsg.includes('readiness'));

      // Explicit "why / how does / formula" questions get the full science card. Other open
      // questions go to the on-device model when it's available (grounded in the same facts).
      const isExplicitScienceQuestion =
        /\b(why|how does|how do|formula|what is|what's|explain|science|research|studies|study|calculat\w*|worked out|measured|citation)\b/.test(lowerMsg);
      const modelReady = await isOnDeviceModelReady();
      // "How is my progress?" is about the athlete's own data, not a science card.
      const isOwnProgressQuestion = /\b(progress|progressing|improv\w*|stronger|getting better|gains?|prs?|personal (best|record)s?)\b/i.test(lowerMsg);
      const scientificPrinciple =
        !isTacticalWorkoutQuery &&
        !isPersonalTelemetryQuery &&
        (isExplicitScienceQuestion || (!modelReady && !isOwnProgressQuestion))
          ? queryExerciseScienceKnowledgeBase(lowerMsg)
          : null;

      // Levels, balance and left/right questions about the athlete's own lifts: answered from their
      // data (movement standards), never by the model. "Why / how is it worked out" still gets the card.
      const isStandardsQuestion =
        /\b(my level|levels?|strength standards?|how strong|imbalanc\w*|balanced?|asymmetr\w*|weaker side|weak side|left side|right side|one side|weak link|lagging|(weakest|strongest|best|worst) (lift|lifts|exercise|movement)|weak points?)\b/i.test(lowerMsg);
      // "What's my bench 1RM?" and "what's my DOTS score?" ask for the athlete's own number, not a formula.
      const asksHowItWorks = /\b(why|how|formula|explain|science|research|calculat\w*|worked out)\b/.test(lowerMsg);
      const asksForOwnMax = /\bmy\b.*\b(e?1\s?rm|one[\s-]rep\s*max|estimated\s*max)\b/.test(lowerMsg) && !asksHowItWorks;
      const asksForOwnScore = /\bmy\b.*\b(dots|strength\s*score)\b/.test(lowerMsg) && !asksHowItWorks;
      if (asksForOwnMax) {
        answerText = buildEstimatedMaxAnswer(lowerMsg, workouts, bodyweightEmaKg, profile.weightUnit || 'kg');
      } else if (asksForOwnScore) {
        answerText = `Treise compares each lift with published strength standards instead of giving one score.\n\n${strengthLevelsAnswer()}`;
      } else if (isStandardsQuestion && !isExplicitScienceQuestion && !isTacticalWorkoutQuery) {
        answerText = strengthLevelsAnswer();
      } else if (scientificPrinciple) {
        scientificPrinciplesCited.push(scientificPrinciple);
        answerText = `${scientificPrinciple.title}\n\n${scientificPrinciple.scientificRationale}\n\n`;
        if (scientificPrinciple.formula) {
          answerText += `Scientific Formula:\n${scientificPrinciple.formula}\n\n`;
        }
        answerText += `How Treise applies this:\n${scientificPrinciple.practicalApplication}\n\nAcademic Citation:\n${scientificPrinciple.academicCitation}`;

        citations.push({
          label: scientificPrinciple.title,
          metric: 'Scientific Grounding',
          value: scientificPrinciple.academicCitation,
        });
        if (scientificPrinciple.formula) {
          citations.push({
            label: 'Formula Model',
            metric: 'Calculation',
            value: scientificPrinciple.formula,
          });
        }
      }

      // C. Recovery, Strain & Autonomic Telemetry Query
      else if (
        lowerMsg.includes('recovery') ||
        lowerMsg.includes('strain') ||
        lowerMsg.includes('hrv') ||
        lowerMsg.includes('sleep') ||
        lowerMsg.includes('readiness') ||
        lowerMsg.includes('pulse') ||
        lowerMsg.includes('heart') ||
        lowerMsg.includes('whoop') ||
        lowerMsg.includes('fitbit') ||
        lowerMsg.includes('health connect') ||
        lowerMsg.includes('wearable') ||
        lowerMsg.includes('watch')
      ) {
        const latest = biometrics[biometrics.length - 1];
        const readings = recoveryReadingsClause(latest);
        // The same score as the recovery card on the Workout page.
        const scoreText = kg.recoveryEfficiencyScore > 0 ? ` (recovery score ${kg.recoveryEfficiencyScore}%)` : '';
        const recScore = latest?.recoveryScore;
        const workoutStrain = latest?.workoutStrain;
        const dayStrain = latest?.strain;
        const kilojoules = latest?.kilojoules;

        const isWhoop = profile.whoopConnected || recScore !== undefined || workoutStrain !== undefined;
        const zoneLabel =
          typeof recScore === 'number'
            ? recScore >= 67
              ? 'Green'
              : recScore >= 34
              ? 'Yellow'
              : 'Red'
            : readinessState === 'Primed'
            ? 'Green'
            : readinessState === 'Amber Shield'
            ? 'Red'
            : 'Yellow';

        if (lowerMsg.includes('strain')) {
          if (workoutStrain !== undefined) {
            answerText = `Your Whoop workout strain is ${workoutStrain}${dayStrain ? ` (Day Strain: ${dayStrain})` : ''}${kilojoules ? ` with ${kilojoules} kJ burned` : ''}. Combined with your ${recScore !== undefined ? `${recScore}% ${zoneLabel}` : 'current'} recovery, your stimulus-to-fatigue ratio is balanced. Standard progressive double progression applies.`;
          } else if (dayStrain !== undefined) {
            answerText = `Your Whoop day strain is ${dayStrain}${kilojoules ? ` with ${kilojoules} kJ energy burned` : ''}. Combined with your ${recScore !== undefined ? `${recScore}% ${zoneLabel}` : 'current'} recovery, your recovery capacity matches today's prescribed training volume.`;
          } else {
            answerText = `Your daily strain is currently balanced with your recovery. Complete today's session to capture your full cardiovascular and muscular workout strain.`;
          }
        } else if (recScore !== undefined) {
          if (recScore >= 67) {
            answerText = `Your Whoop recovery is at ${recScore}% (${zoneLabel} zone)${readings}. You're well recovered, so it's a good day to push the weight on your working sets.`;
          } else if (recScore >= 34) {
            answerText = `Your Whoop recovery is at ${recScore}% (${zoneLabel} zone)${readings}. Your autonomic nervous system is in a balanced baseline. Follow your standard 1–2 RIR double progression targets.`;
          } else {
            answerText = `Your Whoop recovery is at ${recScore}% (${zoneLabel} zone, Amber Shield active)${readings}. Systemic fatigue has accumulated. Working weights are held steady with 2–3 reps left in reserve to prevent joint burnout and protect your streak.`;
          }
        } else if (readinessState === 'Primed') {
          answerText = `Your recovery is high today${scoreText}${readings}. You're well recovered, so it's a good day to push the weight on your first working sets.`;
        } else if (readinessState === 'Amber Shield') {
          answerText = `Your recovery is low today${scoreText}${readings}. Your central nervous system needs lighter effort today. Working weights are held steady with 2–3 reps left in reserve to prevent joint burnout and protect your streak.`;
        } else if (kg.recoveryEfficiencyScore > 0) {
          answerText = `Your recovery looks normal${scoreText}${readings}. Follow today's targets as planned.`;
        } else {
          answerText = `I don't have any recovery data from a watch yet, so your plan runs at normal effort. Connect a Pixel Watch, Fitbit or Whoop in Program → Wearable & Recovery and I'll adjust each day to your sleep and heart rate. Meanwhile, your workout page shows when each muscle group has recovered from your last session.`;
        }

        citations.push({
          label: isWhoop ? 'Whoop Recovery' : 'Daily Readiness',
          metric: 'Status',
          value: recScore !== undefined ? `${recScore}% (${zoneLabel})` : readinessState,
        });
        if (workoutStrain !== undefined) {
          citations.push({
            label: 'Workout Strain',
            metric: 'Strain Score',
            value: `${workoutStrain} (Whoop)`,
          });
        }
        if (kg.recoveryEfficiencyScore > 0) {
          citations.push({
            label: 'Recovery Score',
            metric: 'Today',
            value: `${kg.recoveryEfficiencyScore}%`,
          });
        }
      }

      // D. Hypertrophy Muscle Volume Query
      else if (/\b(volume|sets|mav)\b/.test(lowerMsg)) {
        const matchedMuscle = kg.muscleProfiles.find((m) =>
          lowerMsg.includes(m.displayName.toLowerCase()) || lowerMsg.includes(m.muscleKey.toLowerCase())
        ) || kg.muscleProfiles[0];
        if (!matchedMuscle) {
          answerText = answerWeeklySets(lowerMsg, kg);
        } else {

        answerText = answerWeeklySets(lowerMsg, kg);

        citations.push({
          label: matchedMuscle.displayName,
          metric: 'This week',
          value: `${matchedMuscle.weeklySets} of ${matchedMuscle.personalizedMav[0]}–${matchedMuscle.personalizedMav[1]} hard sets`,
        });
        citations.push({
          label: 'Full Stretch Stimulus',
          metric: 'Lengthened Ratio',
          value: `${kg.lengthenedStimulusRatio}% of sets`,
        });
        }
      } else if (/\b(protein|eat|eating|ate|meals?|diet|nutrition|food|snack)\b/.test(lowerMsg)) {
        const isPreWorkout = /\b(before|pre[\s-]?workout|pre[\s-]?training|prior to)\b/.test(lowerMsg);
        const isPostWorkout = /\b(after|post[\s-]?workout|post[\s-]?training)\b/.test(lowerMsg);
        // A gram figure needs a logged bodyweight; without one, only the per-kg guidance is given.
        const hasWeighIn = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
        const dailyProtein = Math.round(bodyweightEmaKg * (profile.goalPhase === 'Cut / Recomp' ? 2.2 : 2.0));
        const gramsNote = hasWeighIn ? ` (about ${dailyProtein} g)` : '';
        if (isPreWorkout) {
          answerText =
            '1–2 hours before training, eat a normal meal with carbs and some protein, like rice and chicken, oats with yogurt, or a sandwich. ' +
            'If you only have 30–60 minutes, keep it small and easy to digest, like a banana or toast. Go light on fat and fibre right before so your stomach feels settled.';
        } else if (isPostWorkout) {
          answerText = `After training, have a meal with 20–40 g of protein and some carbs within a few hours, like eggs on toast or a chicken and rice bowl. Your total for the day matters most: ${hasWeighIn ? `about ${dailyProtein} g of protein` : 'about 2 g of protein per kg of bodyweight (log your weight in Progress for a figure in grams)'}.`;
        } else {
          answerText =
            profile.goalPhase === 'Cut / Recomp'
              ? `While losing fat, aim for about 2.0–2.4 g of protein per kg of bodyweight a day${gramsNote} to keep your muscle.`
              : `To build muscle, aim for about 1.8–2.2 g of protein per kg of bodyweight a day${gramsNote}, with carbs around your workouts.`;
        }
      } else if (
        /\b(scale\s*weight|scale\s*flat|scale\s*not\s*moving|why\s*isn'?t\s*(my|the)\s*scale|measure\s*progress|weigh\s*myself|weigh\s*in|take\s*measurements|body\s*recomp|recomposition|shirt\s*off|measuring\s*progress)\b/i.test(
          lowerMsg
        )
      ) {
        const recompPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find(
          (p) => p.id === 'sp-scale-weight-measurements'
        );
        if (recompPrinciple) {
          scientificPrinciplesCited.push(recompPrinciple);
          citations.push({
            label: recompPrinciple.title,
            metric: 'Scientific Grounding',
            value: recompPrinciple.academicCitation,
          });
        }
        answerText =
          `When you are resistance training, **scale weight tells only part of the story**.\n\n` +
          `Muscle tissue is ~18% denser than fat (~1.06 g/mL vs ~0.90 g/mL). If you are building lean muscle while losing body fat (body recomposition), total scale weight may stay completely flat or even fluctuate—yet you will look radically different with your shirt off!\n\n` +
          `**How to accurately track your progress:**\n` +
          `1. **Morning Weigh-Ins:** Weigh yourself first thing in the morning on the same scale under consistent conditions (after using the bathroom, before food or water). Treise tracks a 7-day rolling average to filter out normal water and glycogen swings.\n` +
          `2. **Circumference Measurements:** Take tape measurements (waist, chest, arms). A narrowing waist alongside steady or growing arms confirms real muscle gain and visceral fat reduction.\n` +
          `3. **Progressive Overload in the App:** If your workout weights and reps are advancing from week to week, you are unequivocally building new contractile muscle tissue.`;
      } else if (
        /\b(training\s*diary|paper\s*diary|gym\s*notebook|what\s*(does\s*)?(the\s*)?app\s*(do|does)|plan(ning)?\s*(for\s*me|from\s*week\s*to\s*week)|just\s*show\s*up|paper\s*log|track(s)?\s*(my|your)?\s*weights)\b/i.test(
          lowerMsg
        )
      ) {
        const diaryPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find(
          (p) => p.id === 'sp-progress-tracking-diary'
        );
        if (diaryPrinciple) {
          scientificPrinciplesCited.push(diaryPrinciple);
          citations.push({
            label: diaryPrinciple.title,
            metric: 'Scientific Grounding',
            value: diaryPrinciple.academicCitation,
          });
        }
        answerText =
          `Treise completely replaces the traditional paper training diary!\n\n` +
          `**What Treise does for you:**\n` +
          `• **Automated Tracking:** Automatically logs your weights, sets, reps, tempo, and rest intervals.\n` +
          `• **Weekly Overload Planning:** Calculates your exact double progression from week to week (+1 rep or +2.5 kg load) so you never have to guess or manually calculate next week's weights.\n` +
          `• **Life-Proof Schedule:** An asynchronous queue means missed workouts wait without guilt or streak penalties, adapting to your location in 1 tap.\n\n` +
          `You don't need to carry a gym notebook or calculate progression math—**you just need to show up and lift.**`;
      } else if (
        /\b(smart\s*scale|smart\s*scales|measuring\s*devices?|smart\s*measuring|smart\s*tape|renpho|friction\s*free\s*track)\b/i.test(
          lowerMsg
        )
      ) {
        const smartPrinciple = EXERCISE_SCIENCE_KNOWLEDGE_BASE.find(
          (p) => p.id === 'sp-smart-device-integration'
        );
        if (smartPrinciple) {
          scientificPrinciplesCited.push(smartPrinciple);
          citations.push({
            label: smartPrinciple.title,
            metric: 'Scientific Grounding',
            value: smartPrinciple.academicCitation,
          });
        }
        answerText =
          `Treise is built to make progress tracking completely friction-free—with or without smart hardware!\n\n` +
          `• **RENPHO Health Scale (13 Metrics):** Connect over Bluetooth in **Progress → Measurements → Log measurements** to automatically capture Weight, BMI, Body Fat %, Fat-Free Mass, Subcutaneous Fat, Visceral Fat, Body Water, Skeletal Muscle Mass, Muscle Mass, Bone Mass, Protein Mass, Basal Metabolic Rate (BMR), and Metabolic Age.\n` +
          `• **RENPHO Smart Tape Measure (12 Sites):** Stream and lock Neck, Shoulder, Chest, Waist, Abdomen, Hip, Bicep Left, Bicep Right, Thigh Left, Thigh Right, Calf Left, and Calf Right circumferences.\n` +
          `• **Manual Entry Anytime:** You can also type body weight, body fat %, or any of the 12 tape measurements manually at any time with zero reliance on owning the devices.\n` +
          `• **Wearable Telemetry:** Integrates with Google Pixel Watch, Fitbit, Whoop, and Android Health Connect to feed your 7-day average weight and daily recovery readiness directly into your training plan.`;
      } else if (
        /^(hi|hello|hey|heya|howdy|greetings|good\s*(morning|afternoon|evening)|help|who\s*are\s*you|what\s*can\s*you\s*do)\b/i.test(
          lowerMsg
        ) && lowerMsg.split(/\s+/).length <= 6
      ) {
        // Conversational Welcome & Capabilities Intent
        const firstName = profile.name?.trim().split(/\s+/)[0] || 'Athlete';
        const workoutNameForGreeting = (activeWorkout?.exercises[0]?.name ?? 'a squat').toLowerCase();
        answerText = `Hey ${firstName}! I'm your coach. I know your plan, your logged workouts and your recovery.\n\nThings you can ask me:\n• "What am I doing today?"\n• "Should I train today?"\n• "How do I do ${workoutNameForGreeting}?"\n• "I only have 30 minutes"\n• "Am I getting stronger?"\n• "I don't have a barbell" or "Switch to bodyweight today"\n• "How much protein do I need?"\n\nWhat would you like to know?`;
      } else {
        // ============================================================================
        // 8. ATHLETIC COACHING & TACTICAL GUIDANCE (TENSOR TPU + KNOWLEDGE GRAPH)
        // ============================================================================
        let nanoHandled = false;
        const workoutExercises = activeWorkout?.exercises || [];

        // Questions about the athlete's own plan or progress are answered from their data, never by
        // a small model that can misread or invent numbers.
        const isProgressQuery = /\b(progress|progressing|improv\w*|stronger|getting better|gains?|prs?|personal (best|record)s?)\b/i.test(lowerMsg);
        if (isProgressQuery) {
          answerText = buildProgressSummary(workouts, profile.weightUnit || 'kg');
          nanoHandled = true;
        }

        // A. On-device model (Gemini Nano where Chrome exposes it, else the downloaded GPU model)
        //    for open coaching questions only.
        if (!nanoHandled && !isTacticalWorkoutQuery) {

          const groundingPrinciple = queryExerciseScienceKnowledgeBase(userMessage);
          const groundingFacts = groundingPrinciple
            ? `- ${groundingPrinciple.title}: ${groundingPrinciple.practicalApplication}`
            : '';

          const systemPrompt = buildCoachSystemPrompt(input);
          // When the question names one of today's exercises, give the model that exercise's own cue,
          // so technique advice comes from the exercise library rather than the model's guess.
          const namedToday = findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.session;
          const namedDef = namedToday ? exerciseCatalog.find((d) => d.id === namedToday.exerciseId) : undefined;
          const cue = namedToday ? [namedDef?.whyItWorks, namedToday.notes].filter(Boolean).join(' ').slice(0, 220) : '';
          const factsForQuestion = [groundingFacts.replace(/^- /, ''), cue ? `${namedToday!.name} (${namedToday!.equipment}): ${cue}` : '']
            .filter(Boolean)
            .join(' ');
          const questionWithFacts = factsForQuestion ? `${userMessage}\n(Useful fact: ${factsForQuestion})` : userMessage;

          // Each muscle trained today, named by itself and by today's exercises for it.
          const muscleClaims = kg.muscleProfiles.map((m) => ({
            status: muscleTargetStatus(m),
            names: [
              m.displayName.toLowerCase(),
              ...workoutExercises
                .filter((e) => {
                  const pm = exerciseCatalog.find((d) => d.id === e.exerciseId)?.primaryMuscle;
                  return pm ? MUSCLE_TO_GRAPH_KEY[pm] === m.muscleKey : false;
                })
                .flatMap((e) => [e.name.toLowerCase(), e.name.toLowerCase().replace(/^(dumbbell|db|cable|barbell|machine|seated)\s+/, '').replace(/s$/, '')]),
            ],
          }));
          // Why an answer can't be shown, in words the model can act on.
          const problemWith = (answer: string): string | null =>
            !runReadAloudQaGate(answer).passed
              ? 'it used hype, a cliché or judgmental wording; write like a pragmatic coach'
              : !acceptCoachAnswer(answer, `${systemPrompt} ${questionWithFacts}`)
              ? 'it used a number, weight or percentage that is not in the facts'
              : contradictsMuscleTargets(answer, muscleClaims)
              ? "it described a muscle's weekly sets differently from the status given"
              : claimsPastResults(answer)
              ? 'it said how past sessions went, which is not known'
              : misnamesEquipment(answer, workoutExercises)
              ? 'it named the wrong equipment for an exercise'
              : changesPlanWeight(answer)
              ? 'it told the athlete to choose or change a weight, but the plan sets every weight'
              : contradictsRecovery(answer, readinessState)
              ? `it went against today's recovery, which is ${readinessState === 'Amber Shield' ? 'low' : readinessState === 'Primed' ? 'high' : 'normal'}`
              : genericRepTarget(answer, workoutExercises)
              ? 'it gave a rep target without naming the exercise it belongs to'
              : contradictsPlanSchedule(answer)
              ? 'it suggested training every day, but the plan is 4 sessions a week'
              : null;
          // The answer is shown as it is written, but only while it still passes the checks: the
          // moment it stops passing, the stream is withdrawn (an empty partial) and "Thinking…" shows
          // until the checked answer, or the data-based one, is ready.
          let streamWithdrawn = false;
          const showWhileSound = (textSoFar: string) => {
            if (streamWithdrawn) return;
            if (problemWith(textSoFar)) {
              streamWithdrawn = true;
              input.onPartial?.('');
              return;
            }
            input.onPartial?.(textSoFar);
          };
          const startedAt = Date.now();
          let nanoAnswer = await promptOnDeviceModel(systemPrompt, questionWithFacts, {
            onPartial: showWhileSound,
            onDownloadProgress: input.onDownloadProgress,
          });
          let problem = nanoAnswer ? problemWith(nanoAnswer) : null;
          if (nanoAnswer && problem) {
            // A rejected answer is never remembered. A fast model gets one more try, told what was
            // wrong; a slow one (a phone GPU) goes straight to the data-based answer.
            forgetOnDeviceExchange();
            input.onPartial?.('');
            streamWithdrawn = false;
            if (Date.now() - startedAt < RETRY_IF_FASTER_THAN_MS) {
              nanoAnswer = await promptOnDeviceModel(
                systemPrompt,
                `${questionWithFacts}\n(Your last answer could not be used because ${problem}. Answer again in 2-4 short sentences, using only the facts given.)`,
                { onPartial: showWhileSound }
              );
              problem = nanoAnswer ? problemWith(nanoAnswer) : null;
              if (nanoAnswer && problem) {
                forgetOnDeviceExchange();
                input.onPartial?.('');
              }
            }
          }
          if (nanoAnswer && !problem) {
            answerText = nanoAnswer;
            nanoHandled = true;

            // Attach Knowledge Graph citations if an exercise or joint was discussed
            for (const ex of workoutExercises) {
              if (
                lowerMsg.includes(ex.name.toLowerCase()) ||
                nanoAnswer.toLowerCase().includes(ex.name.toLowerCase())
              ) {
                citations.push({
                  label: ex.name,
                  metric: 'Target Load & Reps',
                  value: `${formatWeight(ex.sets.find((st) => !st.isWarmup && st.setType !== 'warmup')?.targetWeightKg ?? 0, profile.weightUnit || 'kg')} × ${ex.minReps}–${ex.maxReps} reps`,
                });
                break;
              }
            }
          }
        }

        // B0. Open questions the model couldn't answer well: a fact-based answer on the same topic,
        // rather than the general briefing.
        if (!nanoHandled && !isTacticalWorkoutQuery) {
          const named = findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.session;
          if (named) {
            const working = named.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup');
            const def = exerciseCatalog.find((d) => d.id === named.exerciseId);
            const first = working[0];
            const rir = readinessState === 'Amber Shield' ? '2–3' : `${first?.targetRir ?? 2}`;
            const namedBrief = cardLines(named);
            answerText = first
              ? `For ${named.name} today: ${working.length} sets of ${first.targetReps} reps at ${formatWeight(first.targetWeightKg, profile.weightUnit || 'kg')}, stopping with ${rir} reps to spare. ${namedBrief[1]} ${def?.whyItWorks ?? ''} The weight goes up by itself once every set reaches ${named.maxReps} reps.`.replace(/\s+/g, ' ').trim()
              : `${named.name} is in today's workout. ${def?.whyItWorks ?? ''}`.trim();
            nanoHandled = true;
          } else if (/\b(flat|tired|exhausted|drained|no energy|low energy|push (hard|it)|go hard|sluggish)\b/.test(lowerMsg)) {
            answerText = `${answerShouldTrain(activeWorkout, workouts, exerciseCatalog, readinessState)} If you feel off once you start, keep the planned weight and stop with an extra rep or two to spare; the plan adjusts from what you log.`;
            nanoHandled = true;
          } else if (/\b(motivat\w*|consisten\w*|habit|keep going|stick with)\b/.test(lowerMsg)) {
            answerText = `${answerStreak(workouts, input.activities ?? [])} ${answerPlanPosition(profile, workouts, input.activities ?? [])}`;
            nanoHandled = true;
          }
        }

        // B. On-Device Semantic Athletic Engine Fallback (Zero Latency, 100% Deterministic)
        if (!nanoHandled) {
          // B1. Exercise-Specific Targets & Progression Rules
          // "my chest press" names Cable Chest Press: match on the name without the kit.
          // The exercise named most exactly ("chest press" is the chest press, not the first press).
          const matchedWorkoutEx = findExerciseNamed(lowerMsg, activeWorkout, exerciseCatalog)?.session ?? workoutExercises.find((e) =>
            lowerMsg.includes(e.name.toLowerCase()) ||
            exerciseNamedIn(lowerMsg, e.name) ||
            (lowerMsg.includes('bench') && e.name.toLowerCase().includes('bench')) ||
            (lowerMsg.includes('incline') && e.name.toLowerCase().includes('incline')) ||
            (lowerMsg.includes('squat') && e.name.toLowerCase().includes('squat')) ||
            (lowerMsg.includes('deadlift') && e.name.toLowerCase().includes('deadlift')) ||
            (lowerMsg.includes('rdl') && (e.name.toLowerCase().includes('rdl') || e.isRdl)) ||
            (lowerMsg.includes('overhead') && e.name.toLowerCase().includes('overhead')) ||
            (lowerMsg.includes('ohp') && (e.name.toLowerCase().includes('press') || e.pillar === 'Vertical Push')) ||
            (lowerMsg.includes('pull up') && (e.name.toLowerCase().includes('pull-up') || e.name.toLowerCase().includes('chin'))) ||
            (lowerMsg.includes('pulldown') && e.name.toLowerCase().includes('pulldown')) ||
            (lowerMsg.includes('row') && e.name.toLowerCase().includes('row')) ||
            (lowerMsg.includes('lateral raise') && e.name.toLowerCase().includes('lateral')) ||
            (lowerMsg.includes('curl') && e.name.toLowerCase().includes('curl')) ||
            (lowerMsg.includes('tricep') && e.name.toLowerCase().includes('tricep')) ||
            (lowerMsg.includes('pushdown') && e.name.toLowerCase().includes('pushdown')) ||
            (lowerMsg.includes('leg press') && e.name.toLowerCase().includes('leg press')) ||
            (lowerMsg.includes('leg curl') && e.name.toLowerCase().includes('leg curl')) ||
            (lowerMsg.includes('extension') && e.name.toLowerCase().includes('extension')) ||
            (lowerMsg.includes('calf') && e.name.toLowerCase().includes('calf'))
          );

          const matchedCatalogEx = !matchedWorkoutEx
            ? exerciseCatalog.find((e) =>
                lowerMsg.includes(e.name.toLowerCase()) ||
                (lowerMsg.includes('bench') && e.name.toLowerCase().includes('bench')) ||
                (lowerMsg.includes('squat') && e.name.toLowerCase().includes('squat')) ||
                (lowerMsg.includes('deadlift') && e.name.toLowerCase().includes('deadlift'))
              )
            : null;

          const targetEx = matchedWorkoutEx || matchedCatalogEx;

          const isExerciseQuery =
            Boolean(targetEx) &&
            (lowerMsg.includes('weight') ||
              lowerMsg.includes('rep') ||
              lowerMsg.includes('set') ||
              lowerMsg.includes('target') ||
              lowerMsg.includes('how much') ||
              lowerMsg.includes('how many') ||
              lowerMsg.includes('load') ||
              lowerMsg.includes('should i') ||
              lowerMsg.includes('progress') ||
              // "How should I approach my chest press today?" is about that exercise's targets.
              (Boolean(matchedWorkoutEx) && /\b(approach|today|do for|go about|tips?|advice|get more|better|improve|help)\b/.test(lowerMsg)) ||
              !matchedWorkoutEx);

          const isSwapQuery =
            lowerMsg.includes('swap') ||
            lowerMsg.includes('substitute') ||
            lowerMsg.includes('replace') ||
            lowerMsg.includes('alternative') ||
            lowerMsg.includes('instead of') ||
            lowerMsg.includes("don't have") ||
            lowerMsg.includes('dont have');

          const isWarmupQuery =
            lowerMsg.includes('warm') ||
            lowerMsg.includes('ramp up') ||
            lowerMsg.includes('warm-up') ||
            lowerMsg.includes('warmup');

          const isRestQuery =
            lowerMsg.includes('rest') ||
            lowerMsg.includes('interval') ||
            lowerMsg.includes('pace') ||
            lowerMsg.includes('time between') ||
            lowerMsg.includes('how long');

          const isStrengthLevelQuery =
            lowerMsg.includes('dots') ||
            lowerMsg.includes('tier') ||
            lowerMsg.includes('level up') ||
            lowerMsg.includes('1rm') ||
            lowerMsg.includes('e1rm') ||
            lowerMsg.includes('standard') ||
            lowerMsg.includes('strength ratio') ||
            lowerMsg.includes('strength score');

          const isTempoQuery =
            lowerMsg.includes('tempo') ||
            lowerMsg.includes('cadence') ||
            lowerMsg.includes('speed') ||
            lowerMsg.includes('eccentric') ||
            lowerMsg.includes('form') ||
            lowerMsg.includes('technique');

          if (isSwapQuery) {
            // From today's workout: never an exercise that isn't in it, never kit the athlete lacks.
            const swap = answerSwapWithOptions(lowerMsg, activeWorkout, exerciseCatalog);
            answerText = swap.text;
            for (const option of swap.options.slice(0, 3)) {
              citations.push({ label: option.name, metric: 'Swap Option', value: `${option.defaultRepRange[0]}–${option.defaultRepRange[1]} reps` });
            }
          } else if (isWarmupQuery) {
            // Ramp-Up Warm-Up Protocol
            const primaryEx = workoutExercises[0];
            const unit = profile.weightUnit || 'kg';
            const targetWeight =
              primaryEx?.sets.find((st) => !st.isWarmup && st.setType !== 'warmup')?.targetWeightKg ?? 0;
            const w50 = formatWeight(snapLoadKg(targetWeight * 0.5, unit, primaryEx?.equipment), unit);
            const w75 = formatWeight(snapLoadKg(targetWeight * 0.75, unit, primaryEx?.equipment), unit);

            answerText = `Warm-Up Protocol for **${primaryEx ? primaryEx.name : "today's primary compound lift"}**:\n\n1. **Set 1:** Empty bar or light weight × 10 reps.\n2. **Set 2:** ${w50} (about half your working weight) × 5 reps.\n3. **Set 3:** ${w75} (about three-quarters) × 2–3 easy reps.\n\nRest 2 minutes before starting your first heavy working set.`;

            citations.push({
              label: primaryEx ? primaryEx.name : 'Warmup Pyramid',
              metric: 'Ramp-Up Targets',
              value: `10 reps @ bar → 5 reps @ ${w50} → 2 reps @ ${w75}`,
            });
          } else if (isRestQuery) {
            // The same rest the timer counts for each of today's exercises.
            answerText = answerRestTimes(activeWorkout);
          } else if (isStrengthLevelQuery) {
            // From the athlete's own lifts and bodyweight, never a stock score.
            answerText = strengthLevelsAnswer();
          } else if (isTempoQuery) {
            // Hypertrophy Lifting Cadence
            answerText = `Optimal hypertrophy tempo for today's workout:\n\n• **Eccentric (Lowering):** 2–3 seconds controlled descent under active tension.\n• **Paused Stretch:** 1 full second at the lengthened position to maximize stretch-mediated hypertrophy.\n• **Concentric (Lifting):** Explosive intent while maintaining strict path.\n• **Lockout:** 0.5 second squeeze without resting on joints.`;

            citations.push({
              label: 'Rep Cadence',
              metric: 'Prescribed Tempo',
              value: '2-1-1-0 (2s eccentric, 1s stretch pause)',
            });
          } else if (isExerciseQuery && targetEx) {
            // Exact Exercise Target Load, Reps & Double Progression
            const isWorkoutEx = 'sets' in targetEx;
            const unit = profile.weightUnit || 'kg';
            if (!isWorkoutEx) {
              // Not in today's workout, so there's no target to give: say so, with what was last lifted.
              const last = findLastCompletedExerciseSession(targetEx.id, workouts);
              const lastSets = last?.session.sets.filter((st) => st.completed && !st.isWarmup && st.setType !== 'warmup') ?? [];
              const bestSet = lastSets.reduce<WorkoutSet | undefined>(
                (best, st) => (!best || (st.actualWeightKg ?? 0) > (best.actualWeightKg ?? 0) ? st : best),
                undefined
              );
              answerText = `**${targetEx.name}** isn't in today's workout (${activeWorkout.name}). ${
                bestSet
                  ? `Last time you did ${formatWeight(bestSet.actualWeightKg ?? bestSet.targetWeightKg, unit)} × ${bestSet.actualReps ?? bestSet.targetReps}.`
                  : "You haven't logged it yet, so the first session will set your starting point."
              } Your plan sets the weight when it comes up.`;
              return {
                message: {
                  id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                  sender: 'assistant',
                  text: answerText,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              };
            }
            const workingSets = isWorkoutEx
              ? (targetEx as ExerciseSession).sets.filter((st) => !st.isWarmup && st.setType !== 'warmup')
              : [];
            const targetWeightLabel = workingSets[0]
              ? targetEx.equipment === 'bodyweight' && workingSets[0].targetWeightKg === 0
                ? 'bodyweight'
                : formatWeight(workingSets[0].targetWeightKg, unit)
              : 'a weight you can lift with 1–2 reps to spare';
            const minReps = isWorkoutEx
              ? (targetEx as ExerciseSession).minReps
              : (targetEx as ExerciseDefinition).defaultRepRange[0];
            const maxReps = isWorkoutEx
              ? (targetEx as ExerciseSession).maxReps
              : (targetEx as ExerciseDefinition).defaultRepRange[1];
            const setCount = isWorkoutEx ? workingSets.length : 3;
            // The same effort the workout card shows for this exercise.
            const plannedRir = workingSets[0]?.targetRir;
            const targetRir =
              readinessState === 'Amber Shield'
                ? '2–3 reps in reserve'
                : plannedRir === undefined
                ? '1–2 reps in reserve'
                : plannedRir === 1
                ? '1 rep in reserve'
                : `${plannedRir} reps in reserve`;
            const todayReps = workingSets[0]?.targetReps;
            const repLabel =
              minReps === maxReps ? `${minReps}` : todayReps ? `${todayReps} (range ${minReps}–${maxReps})` : `${minReps}–${maxReps}`;
            const inc = unit === 'lb' ? '5 lb' : targetEx.equipment === 'dumbbell' ? '2 kg' : '2.5 kg';

            // The exercise card's own two lines (where this lift has been, what today is for), so the
            // coach and the card say the same thing.
            const brief = cardLines(targetEx as ExerciseSession);
            answerText = `For **${targetEx.name}** today, your target is **${targetWeightLabel}** for **${setCount} working sets** of **${repLabel}** reps, leaving **${targetRir}**.\n\n${brief[0]}\n${brief[1]}\n\nOnce all ${setCount} sets reach ${maxReps} reps, the weight goes up by ${inc} next session.`;

            citations.push({
              label: targetEx.name,
              metric: 'Target Load & Reps',
              value: `${targetWeightLabel} × ${setCount} sets (${minReps}–${maxReps} reps)`,
            });
          } else {
            // The briefing answers questions about today's workout. Anything else gets an honest
            // "here's what I can help with", not a workout list that ignores the question.
            const asksAboutToday = /\b(today|tonight|workout|session|briefing|plan|training|train|exercises?|doing|lifting|gym)\b/.test(lowerMsg);
            if (!asksAboutToday) {
              answerText = `I don't have a good answer to that one. I can help with today's workout and targets, how to do an exercise, whether to train today, your progress and plan, rest times, swapping an exercise, and food basics. Next up is ${activeWorkout?.name || 'your next workout'}.`;
            } else {
            // Dynamic Tactical Session Briefing for Today's Workout
            const plannedList = workoutExercises.length > 0
              ? workoutExercises
                  .map(
                    (e, idx) =>
                      `${idx + 1}. **${e.name}** — ${e.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup').length} sets × ${e.minReps === e.maxReps ? e.minReps : `${e.minReps}–${e.maxReps}`} reps @ ${(() => { const w = e.sets.find((st) => !st.isWarmup && st.setType !== 'warmup')?.targetWeightKg ?? 0; return w > 0 ? formatWeight(w, profile.weightUnit || 'kg') : 'bodyweight'; })()}`
                  )
                  .join('\n')
              : '  No movements scheduled.';

            const latestBio = biometrics[biometrics.length - 1];
            // Today's planned reps to spare, as the workout cards show them.
            const plannedRirs = [...new Set(workoutExercises.flatMap((e) => e.sets.filter((st) => !st.isWarmup && st.setType !== 'warmup').map((st) => st.targetRir)).filter((r): r is number => typeof r === 'number'))].sort((a, b) => a - b);
            const effortForBriefing = plannedRirs.length === 0 ? '1–2 reps to spare' : plannedRirs.length === 1 ? `${plannedRirs[0]} ${plannedRirs[0] === 1 ? 'rep' : 'reps'} to spare` : `${plannedRirs[0]}–${plannedRirs[plannedRirs.length - 1]} reps to spare`;

            answerText = `Today's session is **${activeWorkout?.name || 'Workout'}**${activeWorkout?.programWorkoutNumber ? '' : ` (**${activeWorkout?.splitDay || 'Scheduled'} Day**)`} in **Week ${planPosition(profile, workouts, input.activities ?? []).week} of 6** (${activeWorkout?.location === 'travel' ? 'Bodyweight' : activeWorkout?.location === 'home' ? 'At Home' : 'Full Gym'} mode).\n\nPlanned Movements:\n${plannedList}\n\n${
              readinessState === 'Primed'
                ? `Your recovery is high today${recoveryReadingsClause(latestBio)}, so it's a good day to push your first working sets.`
                : readinessState === 'Amber Shield'
                ? `Your recovery is low today${recoveryReadingsClause(latestBio)}. Keep the planned weights and stop each set with 2–3 reps to spare.`
                : `${kg.recoveryEfficiencyScore > 0 ? `Recovery looks normal (${kg.recoveryEfficiencyScore}/100). ` : ''}Lower each rep under control and stop each set with ${effortForBriefing}.`
            }\n\nAsk me about any exercise's targets, warm-up sets, rest times or swaps.`;

            citations.push({
              label: activeWorkout?.name || 'Session Briefing',
              metric: 'Today\'s Session',
              value: `${workoutExercises.length} Exercises Planned`,
            });
            }
          }
        }
      }
    }
  }

  const message: AssistantChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    sender: 'assistant',
    text: answerText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    actionApplied: actionTaken,
    knowledgeGraphCitations: citations.length > 0 ? citations : undefined,
    scientificPrinciplesCited:
      scientificPrinciplesCited.length > 0 ? scientificPrinciplesCited : undefined,
  };

  return {
    message,
    updatedProfile,
    updatedWorkout,
    actionTaken,
  };
}
