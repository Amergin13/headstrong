/**
 * Pure domain builders for the Exercise Detail drill-in modal (`ExerciseDetailModal`)
 * and shared TrendChart specification used on both `ExerciseCard` and `ExerciseDetailModal`.
 *
 * All performance numbers come strictly from `workouts` and `buildExerciseInsight`
 * (zero fabricated metrics). Form guidance prefers `exercise.exerciseNotes` when supplied
 * by a program template and falls back cleanly to exercise-specific or movement-family cues.
 */
import { calculateE1RM, isTimedExercise } from '../engine/e1rm';
import { calculate5StepWarmupRamp } from '../engine/muscleBuildingProgram';
import { getMovementFamilyLabel, getMovementVectorId } from '../engine/progression';
import { MUSCLE_FRIENDLY_NAMES, getWorkoutCompletedAt } from '../engine/recovery';
import {
  BiometricLog,
  EquipmentType,
  ExerciseDefinition,
  ExerciseSession,
  IntensityProtocol,
  ProgressionPrescription,
  ReadinessState,
  ResistanceProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { buildBodyweightEmaLookup } from '../engine/ema';
import { buildExerciseInsight, ExerciseInsight } from './exerciseInsight';

const EQUIPMENT_DISPLAY: Record<EquipmentType, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  weighted_bodyweight: 'Weighted bodyweight',
};

const RESISTANCE_DISPLAY: Record<ResistanceProfile, string> = {
  lengthened: 'Stretch-biased',
  mid: 'Mid-range load',
  shortened: 'Peak contraction',
};

const JOINT_DISPLAY: Record<string, string> = {
  shoulders: 'Shoulders',
  elbows: 'Elbows',
  wrists: 'Wrists',
  spine: 'Lower back',
  hips: 'Hips',
  knees: 'Knees',
};

/**
 * Concise, biomechanically accurate 3-step form fundamentals for core exercises
 * whose template omits multi-step `exerciseNotes`.
 */
const FORM_STEPS_BY_ID: Record<string, string[]> = {
  'ex-barbell-squat': [
    'Set feet shoulder-width with toes turned slightly out, brace your ribs down before descending.',
    'Sit hips down and back so knees track in line with toes until crease of hip passes top of thigh.',
    'Drive evenly through mid-foot and keep chest angled together with your hips back to lockout.',
  ],
  'ex-leg-press': [
    'Place feet around shoulder-width on the sled and press lower back and hips flat against the pad.',
    'Lower the sled smoothly until knees reach deep flexion without lifting your tailbone off the seat.',
    'Press through heels and mid-foot to just shy of hard knee lockout.',
  ],
  'ex-bench-press': [
    'Set shoulder blades tucked back and down into the bench with feet planted firmly on the floor.',
    'Lower the bar under control to your lower sternum with forearms vertical and elbows ~45° from sides.',
    'Touch lightly without bouncing and press up and slightly back toward shoulder line.',
  ],
  'ex-db-bench-press': [
    'Set the bench at 20–30° incline, retract shoulder blades, and plant feet firmly.',
    'Lower the dumbbells outside your upper chest until you feel a clean stretch with wrists stacked over elbows.',
    'Press smoothly upward along a slight inward arc without clanking bells together.',
  ],
  'ex-flat-db-press': [
    'Pull shoulder blades down and together into the flat bench with feet planted solidly.',
    'Lower both dumbbells beside your mid-chest under 2–3s control until a full pec stretch.',
    'Press up cleanly while keeping shoulders anchored to the bench.',
  ],
  'ex-lat-pulldown': [
    'Grip the bar just outside shoulder width and lock thighs snugly under the pad.',
    'Initiate by depressing shoulder blades down, then drive elbows toward your hips to bring bar to upper chest.',
    'Control the return overhead until lats reach a full lengthened stretch at the top.',
  ],
  'ex-weighted-pullup': [
    'Start from a dead hang with shoulders active (pulled away from ears) and ribs braced.',
    'Drive elbows down and back until your chin clears the bar without swinging the legs.',
    'Lower under control all the way to full arm extension on every rep.',
  ],
  'ex-chinup': [
    'Take an underhand shoulder-width grip from a controlled hang with core braced.',
    'Pull chest toward the bar while driving elbows down beside your ribs.',
    'Lower steadily for 2–3 seconds down to straight arms.',
  ],
  'ex-rdl': [
    'Unlock knees slightly at the top, keep lats tight, and shave the bar smoothly down your thighs.',
    'Push hips straight back while keeping spine neutral until hamstrings hit peak tension around mid-shin.',
    'Drive hips forward powerfully with glutes without over-arching at lockout.',
  ],
  'ex-deadlift': [
    'Set bar over mid-foot, take the slack out of the bar, and flatten your back before lifting.',
    'Push the floor away smoothly with legs while keeping the bar tight against shins and thighs.',
    'Lock hips and knees together upright, then hinge back first before bending knees on the descent.',
  ],
  'ex-db-rdl': [
    'Hold dumbbells in front of thighs with shoulders packed down and a soft bend in the knees.',
    'Hinge hips back cleanly while keeping weights skimming close to your legs until deep hamstring tension.',
    'Squeeze glutes to bring hips back through to tall standing.',
  ],
  'ex-db-lateral-raise': [
    'Hinge slightly forward with dumbbells just ahead of thighs and elbows softly unlocked.',
    'Sweep arms outward in the scapular plane (~30° forward) to shoulder height, leading with elbows.',
    'Lower slowly without letting weights drop or torso heave.',
  ],
  'ex-tricep-pushdown': [
    'Pin upper arms comfortably beside your ribs with torso angled slightly toward the cable stack.',
    'Extend elbows cleanly down to full lockout while keeping shoulders quiet.',
    'Control the handle up past 90° elbow bend for a full triceps stretch without elbows flaring.',
  ],
  'ex-db-shoulder-press': [
    'Set bench upright or high-incline, brace core against back pad, and keep wrists stacked over forearms.',
    'Lower dumbbells smoothly until handles reach ear/chin level with elbows slightly forward of torso.',
    'Drive straight overhead to smooth lockout without shrugging shoulders toward ears.',
  ],
  'ex-ohp': [
    'Grip just outside shoulder width, squeeze glutes and brace abs hard before pressing.',
    'Tuck chin slightly back as bar travels straight overhead, then push torso slightly under at lockout.',
    'Lower under control straight back to upper chest with elbows stacked underneath.',
  ],
  'ex-cable-row': [
    'Sit tall with knees softly bent, torso vertical, and arms fully extended into a clean mid-back stretch.',
    'Pull handle toward your navel while drawing shoulder blades smoothly together and keeping traps down.',
    'Hold briefly at the torso, then allow arms and shoulder blades to glide forward under control.',
  ],
  'ex-leg-curl': [
    'Align knee joint with machine pivot point and anchor hips down firmly against the seat.',
    'Curl smoothly through full range toward the seat until hamstrings contract hard.',
    'Control the eccentric return slowly without letting the stack slam.',
  ],
  'ex-bicep-curl': [
    'Set bench to ~45–60° incline, let upper arms hang straight down perpendicular to the floor.',
    'Curl both dumbbells up while pinning elbows behind torso without swinging shoulders forward.',
    'Lower all the way to full elbow extension to load the biceps in the lengthened stretch.',
  ],
  'ex-forearm-plank': [
    'Stack elbows directly under shoulders with forearms parallel and feet hip-width apart.',
    'Tuck pelvis slightly under, squeeze glutes and brace abs so lower back stays flat.',
    'Breathe steadily through tension without letting hips sag or pike upward.',
  ],
  'ex-side-plank': [
    'Stack elbow directly under bottom shoulder and align ears, hips, and ankles in one straight line.',
    'Drive bottom hip away from the floor cleanly by engaging side obliques and glutes.',
    'Hold steady without torso twisting forward.',
  ],
  'ex-dead-hang': [
    'Grip bar shoulder-width with straight arms and let ribcage lengthen cleanly without breath-holding.',
    'Choose either relaxed shoulder stretch or slightly depressed scapulae depending on comfort.',
    'Step down gently rather than dropping off a fatigued grip.',
  ],
};

const FORM_STEPS_BY_FAMILY: Record<string, string[]> = {
  'vector-pillar-horizontal-push': [
    'Anchor shoulder blades down and back against the bench or floor so your chest leads every rep.',
    'Lower under 2–3s control until a clear stretch across the chest with elbows ~45° from torso.',
    'Press cleanly without losing shoulder position or bouncing out of the bottom.',
  ],
  'vector-pillar-vertical-push': [
    'Stack wrists over elbows, brace glutes and abs, and keep ribs tucked down.',
    'Press cleanly overhead without leaning back excessively or shrugging shoulders up.',
    'Lower slowly under control back to shoulder/chin level.',
  ],
  'vector-pillar-horizontal-pull': [
    'Initiate each rep by letting shoulder blades glide forward cleanly without rounding your lower back.',
    'Lead with elbows back toward hips/ribs rather than curling excessively with biceps.',
    'Control the return back to full mid-back stretch.',
  ],
  'vector-pillar-vertical-pull': [
    'Begin from full overhead arm extension with shoulders pulled away from ears.',
    'Drive elbows down toward your sides while lifting chest slightly toward the bar/handle.',
    'Pause briefly at peak squeeze, then stretch all the way back overhead.',
  ],
  'vector-pillar-squat': [
    'Keep pressure spread evenly across heel, big toe, and little toe throughout the rep.',
    'Brace torso before descending and let knees track smoothly over toes to full comfortable depth.',
    'Stand smoothly out of the bottom while maintaining trunk angle.',
  ],
  'vector-pillar-hinge': [
    'Keep a flat spine and brace core before pushing hips straight backward.',
    'Load the stretch across hamstrings and glutes cleanly without rounding the lower back.',
    'Drive hips forward into standing lockout by squeezing glutes.',
  ],
  'vector-iso-sidedelts': [
    'Softly unlock elbows and sweep weights slightly forward of pure side in the scapular plane.',
    'Stop near shoulder level rather than shrugging traps upward.',
    'Control the lowering phase all the way down.',
  ],
  'vector-iso-reardelts': [
    'Keep torso braced and shoulder blades relaxed so rear shoulders do the work instead of mid-traps.',
    'Sweep elbows outward cleanly under constant tension.',
    'Pause briefly at full contraction and resist gravity on the return.',
  ],
  'vector-iso-triceps': [
    'Keep upper arms steady beside torso or overhead without swinging from the shoulders.',
    'Move strictly through elbow extension to full contraction, then flex deep on the return.',
  ],
  'vector-iso-biceps': [
    'Pin upper arms calmly at your sides without heaving torso backward.',
    'Curl smoothly through full elbow flexion and lower all the way down to straight arms.',
  ],
  'vector-iso-hamstrings': [
    'Keep hips pressed down flat so lumbar spine stays quiet.',
    'Flex knees smoothly and control the slow return to near-full stretch.',
  ],
  'vector-iso-quads': [
    'Anchor back and hips into the seat pad before extending.',
    'Control the lowering phase deeply rather than kicking up with momentum.',
  ],
  'vector-iso-calves': [
    'Pause for 1–2 seconds in the full bottom stretch on every rep to remove Achilles bounce.',
    'Drive high onto the balls of feet and squeeze briefly at peak plantarflexion.',
  ],
  'vector-iso-core': [
    'Brace ribs down toward pelvis before moving and avoid cranking the lower back.',
    'Control every rep or hold with steady breathing instead of momentum.',
  ],
};

export interface ExerciseLoggedSessionEntry {
  workoutId: string;
  workoutName: string;
  date: string;
  completedAtMs: number;
  bestE1rmKg: number;
  sets: {
    weightKg: number;
    reps: number;
    rir?: number;
    durationSeconds?: number;
    perSide?: boolean;
    repsLeft?: number;
    repsRight?: number;
  }[];
  athleteNote?: string;
}

export interface ExerciseDetailModel {
  title: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  movementPattern: string;
  equipmentLabel: string;
  resistanceLabel?: string;
  joints: string[];
  overviewText?: string;
  biomechanicalCue?: string;
  formSteps: string[];
  formStepsSource: 'program' | 'library' | 'pattern';
  hasTempoPacer: boolean;
  customTempoText: string | null;
  tempoBreakdown: string | null;
  restLabel: string | null;
  targetSummary: string;
  readinessNote: string | null;
  intensityProtocol?: IntensityProtocol;
  warmupSteps: ReturnType<typeof calculate5StepWarmupRamp>;
  loggedSessions: ExerciseLoggedSessionEntry[];
  sessionCount: number;
  latestDisplay: string;
  bestDisplay: string;
  metricTitle: string;
}

export interface ExerciseTrendSpec {
  points: { date: string; value: number }[];
  format: (v: number) => string;
  label: string;
  emptyTitle: string;
  emptyMessage: string;
}

export function buildExerciseTrendSpec(
  insight: ExerciseInsight | undefined,
  isTimed: boolean,
  formatPreciseWeight: (kg: number) => string,
  toLocalDate: (d: Date) => string
): ExerciseTrendSpec {
  const history = insight?.history ?? [];
  const fmtVal = (v: number) =>
    insight?.metric === 'time'
      ? `${Math.round(v)}s`
      : insight?.metric === 'reps'
      ? `${Math.round(v)} reps`
      : formatPreciseWeight(v);

  const metricName =
    insight?.metric === 'time'
      ? 'hold duration'
      : insight?.metric === 'reps'
      ? 'best set'
      : insight?.metric === 'added_kg'
      ? 'top added weight'
      : insight?.includesBodyweight
      ? 'estimated one-rep max (bodyweight + added weight)'
      : 'estimated one-rep max';

  const firstVal = history[0] ? fmtVal(history[0].value ?? history[0].e1rmKg) : '';
  const lastVal = history[history.length - 1]
    ? fmtVal(history[history.length - 1].value ?? history[history.length - 1].e1rmKg)
    : '';

  const label =
    history.length >= 2
      ? `${metricName.charAt(0).toUpperCase() + metricName.slice(1)} over your last ${history.length} sessions: ${firstVal} to ${lastVal}`
      : history.length === 1
      ? `Starting point: ${metricName} ${firstVal}. The trend line starts after your next session.`
      : `No sessions logged yet. Your ${metricName} for this exercise appears here after your first session.`;

  return {
    points: history.map((h) => ({
      date: toLocalDate(new Date(h.at)),
      value: h.value ?? h.e1rmKg,
    })),
    format: fmtVal,
    label,
    emptyTitle: 'No history yet',
    emptyMessage: isTimed
      ? 'Complete all hold sets to establish your starting hold time.'
      : 'Complete all working sets to establish your starting estimated max.',
  };
}

function formatRestDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${seconds} s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${mins} min ${rem} s` : `${mins} min`;
}

function formatTempoCode(tempo?: string): string | null {
  if (!tempo || !/^[\dXx]{4}$/.test(tempo)) return null;
  const [lower, pauseBottom, lift, pauseTop] = tempo.split('');
  const step = (ch: string) => (ch.toUpperCase() === 'X' ? 'explosive' : `${ch}s`);
  const parts = [
    `Lower ${step(lower)}`,
    pauseBottom !== '0' ? `Pause ${step(pauseBottom)}` : null,
    `Lift ${step(lift)}`,
    pauseTop !== '0' ? `Squeeze ${step(pauseTop)}` : null,
  ].filter(Boolean);
  return `${tempo} (${parts.join(' · ')})`;
}

const isWorkingSet = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';

export function buildExerciseDetailModel(params: {
  exercise: ExerciseSession;
  exerciseDef?: ExerciseDefinition;
  workouts?: WorkoutSession[];
  biometrics?: BiometricLog[];
  insight?: ExerciseInsight;
  bodyweightKg?: number;
  muscleLabel?: string;
  prescription?: ProgressionPrescription;
  readinessState?: ReadinessState;
  formatWeight: (kg: number) => string;
  formatPreciseWeight: (kg: number) => string;
}): ExerciseDetailModel {
  const {
    exercise,
    exerciseDef,
    workouts = [],
    biometrics,
    insight,
    bodyweightKg = 0,
    muscleLabel,
    prescription,
    readinessState = 'Normal',
    formatWeight,
    formatPreciseWeight,
  } = params;

  const timed = isTimedExercise(exercise);
  const workingSets = exercise.sets.filter(isWorkingSet);
  const firstWorking = workingSets[0] ?? exercise.sets[0];
  const currentWeight = firstWorking?.targetWeightKg ?? 20;

  const primaryMuscle =
    muscleLabel ??
    (exerciseDef?.primaryMuscle ? MUSCLE_FRIENDLY_NAMES[exerciseDef.primaryMuscle] : exercise.pillar);
  const secondaryMuscles = (exerciseDef?.secondaryMuscles ?? []).map(
    (m) => MUSCLE_FRIENDLY_NAMES[m] ?? m
  );
  const movementPattern = getMovementFamilyLabel(exerciseDef ?? exercise);
  const equipmentLabel = EQUIPMENT_DISPLAY[exercise.equipment] ?? exercise.equipment;
  const resProf = exerciseDef?.resistanceProfile ?? exercise.resistanceProfile;
  const resistanceLabel = resProf ? RESISTANCE_DISPLAY[resProf] : undefined;
  const joints = (exerciseDef?.primaryJoints ?? []).map((j) => JOINT_DISPLAY[j] ?? j);

  const hasProgramSteps = Boolean(exercise.exerciseNotes && exercise.exerciseNotes.length > 0);
  const idSteps = FORM_STEPS_BY_ID[exercise.exerciseId];
  const familySteps = FORM_STEPS_BY_FAMILY[getMovementVectorId(exerciseDef ?? exercise)];
  const formSteps = hasProgramSteps
    ? exercise.exerciseNotes!
    : idSteps ?? familySteps ?? [
        'Establish a stable stance or brace before lifting the weight.',
        'Lower under steady 2–3s control through full comfortable range of motion.',
        'Stop each set with clean technique rather than sacrificing form on the last rep.',
      ];
  const formStepsSource: 'program' | 'library' | 'pattern' = hasProgramSteps
    ? 'program'
    : idSteps
    ? 'library'
    : 'pattern';

  // Prefer the plain rationale on the catalog entry, falling back cleanly to plan notes when distinct.
  const overviewText =
    exerciseDef?.whyItWorks ||
    (!hasProgramSteps && exercise.notes ? exercise.notes : undefined);

  const hasTempoPacer = Boolean(exercise.tempo && /^[\dXx]{4}$/.test(exercise.tempo));
  const customTempoText = !hasTempoPacer && exercise.tempo ? exercise.tempo : null;
  const tempoBreakdown = formatTempoCode(exercise.tempo);
  const restLabel = formatRestDuration(exercise.restSeconds);

  // Today's target summary in the athlete's display unit
  const isBwZero =
    exercise.equipment === 'bodyweight' &&
    (!exercise.isWeightedCalisthenic || (firstWorking?.targetWeightKg ?? 0) === 0);
  const repStr = timed
    ? `${firstWorking?.targetDurationSeconds ?? exercise.durationSeconds ?? 45}s hold`
    : exercise.minReps === exercise.maxReps
    ? `${exercise.minReps} reps`
    : `${exercise.minReps}–${exercise.maxReps} reps`;
  const loadStr = isBwZero
    ? 'Bodyweight'
    : firstWorking && firstWorking.targetWeightKg > 0
    ? formatWeight(firstWorking.targetWeightKg)
    : undefined;
  const rirVal = firstWorking?.targetRir;
  const targetParts = [
    `${workingSets.length} ${workingSets.length === 1 ? 'working set' : 'working sets'}`,
    loadStr ? `${loadStr} × ${repStr}` : repStr,
    rirVal !== undefined ? `${rirVal} RIR` : undefined,
  ].filter(Boolean);
  const targetSummary = targetParts.join(' · ');

  const readinessNote =
    readinessState === 'Amber Shield'
      ? prescription?.reason || 'Recovery buffer active today — hold weight steady and leave 2–3 reps in reserve.'
      : null;

  const warmupSteps = exercise.useWarmupProtocol ? calculate5StepWarmupRamp(currentWeight) : [];

  // Reverse-chronological completed workouts containing this exercise
  const emaLookup = biometrics ? buildBodyweightEmaLookup(biometrics) : undefined;
  const bwOnDate = (date: string) => (emaLookup ? emaLookup(date, bodyweightKg) : bodyweightKg);

  const loggedSessions: ExerciseLoggedSessionEntry[] = workouts
    .filter((w) => w.completed)
    .map((w) => {
      const match = w.exercises.find(
        (e) =>
          e.exerciseId === exercise.exerciseId &&
          e.sets.some((s) => s.completed && isWorkingSet(s))
      );
      if (!match) return null;
      const doneSets = match.sets
        .filter((s) => s.completed && isWorkingSet(s))
        .map((s) => {
          const perSide =
            s.actualRepsLeft !== undefined &&
            s.actualRepsRight !== undefined &&
            (s.actualRepsLeft > 0 || s.actualRepsRight > 0);
          return {
            weightKg: s.actualWeightKg ?? s.targetWeightKg ?? 0,
            reps: s.actualReps ?? s.targetReps ?? 0,
            rir: s.actualRir,
            durationSeconds: s.actualDurationSeconds ?? s.targetDurationSeconds,
            perSide,
            repsLeft: s.actualRepsLeft,
            repsRight: s.actualRepsRight,
          };
        });
      const bw = bwOnDate(w.date);
      const bestE1rmKg = timed
        ? Math.max(...doneSets.map((s) => s.durationSeconds ?? 0), 0)
        : doneSets.reduce((best, s) => {
            if (s.reps <= 0) return best;
            const e1rm = calculateE1RM(
              s.weightKg,
              s.reps,
              s.rir ?? 2,
              match.equipment,
              match.isRdl,
              match.isWeightedCalisthenic,
              bw,
              match.exerciseId,
              match.pillar
            );
            return Math.max(best, e1rm);
          }, 0);
      return {
        workoutId: w.id,
        workoutName: w.name,
        date: w.date,
        completedAtMs: getWorkoutCompletedAt(w),
        bestE1rmKg,
        sets: doneSets,
        athleteNote: match.athleteNotes?.trim() || undefined,
      } as ExerciseLoggedSessionEntry;
    })
    .filter((x): x is ExerciseLoggedSessionEntry => Boolean(x))
    .sort((a, b) => b.completedAtMs - a.completedAtMs);

  // Full-history single-source insight for consistent Latest / All-time best display
  const fullInsight =
    workouts.length > 0
      ? buildExerciseInsight(
          exercise,
          workouts,
          readinessState,
          bodyweightKg,
          Math.max(12, workouts.length),
          formatPreciseWeight,
          biometrics
        )
      : insight;
  const activeInsight = fullInsight ?? insight;
  const metricValues = (activeInsight?.history ?? []).map((h) => h.value ?? h.e1rmKg);
  const fmtMetric = (v: number) =>
    activeInsight?.metric === 'time'
      ? `${Math.round(v)}s`
      : activeInsight?.metric === 'reps'
      ? `${Math.round(v)} reps`
      : formatPreciseWeight(v);

  const metricTitle =
    activeInsight?.metric === 'time'
      ? 'Hold duration'
      : activeInsight?.metric === 'reps'
      ? 'Best set reps'
      : activeInsight?.metric === 'added_kg'
      ? 'Added weight'
      : 'Est. 1RM';

  const latestVal = metricValues.length > 0 ? metricValues[metricValues.length - 1] : 0;
  const bestVal = metricValues.length > 0 ? Math.max(...metricValues) : 0;

  return {
    title: exercise.name,
    primaryMuscle,
    secondaryMuscles,
    movementPattern,
    equipmentLabel,
    resistanceLabel,
    joints,
    overviewText,
    biomechanicalCue: exerciseDef?.biomechanicalCue,
    formSteps,
    formStepsSource,
    hasTempoPacer,
    customTempoText,
    tempoBreakdown,
    restLabel,
    targetSummary,
    readinessNote,
    intensityProtocol: exercise.intensityProtocol,
    warmupSteps,
    loggedSessions,
    sessionCount: Math.max(loggedSessions.length, activeInsight?.history.length ?? 0),
    latestDisplay: latestVal > 0 ? fmtMetric(latestVal) : '—',
    bestDisplay: bestVal > 0 ? fmtMetric(bestVal) : '—',
    metricTitle,
  };
}
