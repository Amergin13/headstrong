import {
  ExerciseSession,
  IntensityProtocol,
  WarmupProtocol,
  WorkoutSession,
  WorkoutSet,
} from './types';
import { localDateString } from '../utils/date';

export const WARMUP_PROTOCOL: WarmupProtocol = {
  description:
    'Perform before the first compound exercise of the workout based on your target work-set weight (example shown for 100kg work-set weight):',
  sets: [
    {
      setNumber: 1,
      reps: 8,
      percentageOfWorkWeight: 30,
      exampleWeightKg: 30,
      restSecondsMin: 0,
      restSecondsMax: 15,
      restLabel: 'Minimal rest',
    },
    {
      setNumber: 2,
      reps: 5,
      percentageOfWorkWeight: 50,
      exampleWeightKg: 50,
      restSecondsMin: 30,
      restSecondsMax: 60,
      restLabel: '30–60 seconds rest',
    },
    {
      setNumber: 3,
      reps: 3,
      percentageOfWorkWeight: 70,
      exampleWeightKg: 70,
      restSecondsMin: 45,
      restSecondsMax: 75,
      restLabel: '45–75 seconds rest',
    },
    {
      setNumber: 4,
      reps: 2,
      percentageOfWorkWeight: 85,
      exampleWeightKg: 85,
      restSecondsMin: 60,
      restSecondsMax: 75,
      restLabel: '60–75 seconds rest',
    },
    {
      setNumber: 5,
      reps: 1,
      percentageOfWorkWeight: 95,
      exampleWeightKg: 95,
      restSecondsMin: 60,
      restSecondsMax: 75,
      restLabel: '60–75 seconds rest',
    },
  ],
};

export const INTENSITY_PROTOCOLS: Record<string, IntensityProtocol> = {
  double_rest_pause: {
    id: 'double_rest_pause',
    symbol: '●',
    name: 'Double Rest-Pause (Start Position)',
    instruction:
      'Once you have completed the final set, pause and rest in the start position, then perform as many reps as you can. Upon reaching failure, stay in the start position, pause and rest again, then perform as many reps until you reach failure at which point the set is over.',
  },
  triple_drop_set: {
    id: 'triple_drop_set',
    symbol: '●●',
    name: 'Triple Drop-Set',
    instruction:
      'Once you have completed the final set, immediately lower the weight then perform as many reps as you can until you reach failure. When you do, drop the weight again and lift until failure, then reduce the weight one final time and lift until failure again at which point the set is over.',
  },
  triple_rest_pause: {
    id: 'triple_rest_pause',
    symbol: '●●●',
    name: 'Triple Rest-Pause (Start Position)',
    instruction:
      'Once you have completed the final set, pause and rest in the start position, then perform as many reps as you can. Upon failure, stay in the start position, pause and rest again, then perform as many reps as possible. Repeat for a third time until you reach failure at which point the set is over.',
  },
  delts_12_8_double_drop: {
    id: 'delts_12_8_double_drop',
    symbol: '●',
    name: '12/8 Wave + Double Drop-Set',
    instruction:
      'Perform 12 reps in the first set, then 8 in the second. Once you have completed the second set, reduce the weight and lift to failure. Once you do, reduce the weight again and lift to failure, at which point the set is over.',
  },
  delts_triple_drop_iso_laterals: {
    id: 'delts_triple_drop_iso_laterals',
    symbol: '●●',
    name: 'Triple Drop-Set + Double-Weight Locked-Arm Iso Holds',
    instruction:
      'Perform 12 reps in both sets, then reduce the weight and lift to failure. Do this a total of three times. After reaching failure on the second set, take a dumbbell in each hand double that of your starting weight. With arms locked, raise the weights out as far to the sides as you can and hold for 2sec then return to the start. Repeat 10 times.',
  },
  delts_12_6_partials_drop: {
    id: 'delts_12_6_partials_drop',
    symbol: '●●●',
    name: '12/6 Wave + Partials & Drop-Set',
    instruction:
      'Perform 12 reps in the first set, then do 10 partial reps. For the second set pick a weight that allows you to do 6 reps with perfect form, then reduce the weight and perform additional reps to failure.',
  },
  biceps_preacher_finisher: {
    id: 'biceps_preacher_finisher',
    symbol: '🔴',
    name: 'Preacher Curl Final-Set Finisher',
    instruction:
      'On the final set, perform your target reps with strict 4010 tempo, then apply a rest-pause or drop-set finisher to complete muscular failure.',
  },
  biceps_hammer_finisher: {
    id: 'biceps_hammer_finisher',
    symbol: '🔴🔴',
    name: 'Incline Hammer Curl Final-Set Finisher',
    instruction:
      'On the final set, perform your target reps with strict 4010 tempo, then extend the set past failure with partial reps or a drop-set.',
  },
  form_failure: {
    id: 'form_failure',
    symbol: 'F*',
    name: 'Technical Form Failure',
    instruction:
      'Do as many reps as you can until you can no longer do any more with proper form.',
  },
};

export interface ProgramPhaseMeta {
  phaseNumber: number;
  name: string;
  weeks: [number, number];
  description: string;
  intensityFocus: string;
}

export const PROGRAM_PHASES: ProgramPhaseMeta[] = [
  {
    phaseNumber: 1,
    name: 'Phase 1: Antagonist Supersets & Volume Foundation',
    weeks: [1, 2],
    description:
      'High-volume 4-set antagonist supersets for Chest/Back and straight sets + arm supersets for Delts/Arms, paired with 10x10 and 10x9 squat leg days.',
    intensityFocus: 'Volume accumulation, controlled eccentric tempo (3–4s), and structural work capacity.',
  },
  {
    phaseNumber: 2,
    name: 'Phase 2: High-Intensity Overload (Rest-Pause & Drop-Sets)',
    weeks: [3, 4],
    description:
      'Low-volume (2 working sets) taken beyond mechanical failure using double/triple rest-pause sets, triple drop-sets, and heavy partial iso-holds, paired with 10x8 squat leg days.',
    intensityFocus: 'High mechanical tension, motor unit recruitment past technical failure, and 10x8 squats.',
  },
  {
    phaseNumber: 3,
    name: 'Phase 3: High-Density Giant Sets & Tri-Sets',
    weeks: [5, 6],
    description:
      'Zero-rest 4-exercise Giant Sets and 3-exercise Tri-Sets to maximize metabolic stress and muscular density, paired with heavy 10x6 squat leg days.',
    intensityFocus: 'Muscular density, zero-rest intra-group transitions, peak lactate tolerance, and 10x6 heavy squats.',
  },
];

export interface ProgramExerciseTemplate {
  order: string;
  name: string;
  exerciseId: string;
  pillar: ExerciseSession['pillar'];
  equipment: ExerciseSession['equipment'];
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  useWarmupProtocol?: boolean;
  durationSeconds?: number;
  durationMinutesRange?: [number, number];
  intensityProtocol?: IntensityProtocol;
  notes?: string;
  defaultWeightKg?: number;
}

export interface ProgramWorkoutTemplate {
  workoutNumber: number;
  week: number;
  dayOfWeek: 'Monday' | 'Wednesday' | 'Friday' | 'Saturday';
  phase: number;
  title: string;
  splitDay: ExerciseSession['pillar'] extends any ? 'Push' | 'Pull' | 'Legs' | 'Upper' : never;
  exercises: ProgramExerciseTemplate[];
}

export const MUSCLE_BUILDING_PROGRAM_META = {
  id: '6-week-muscle-building-plan',
  name: '6-Week Muscle Building Plan',
  subtitle: 'High-Volume Hypertrophy, High-Intensity Failure & Giant-Set Density',
  description:
    'An intensive 6-week, 24-workout hypertrophy program structured into three 2-week meso-cycles: Phase 1 builds volume through antagonist supersets; Phase 2 drives mechanical and metabolic failure via low-volume rest-pause and triple drop-sets; Phase 3 maximizes muscular density with 3- and 4-exercise tri-sets and giant sets. Each weekly leg day anchors lower-body development with a 10-set Squat linear intensification progression (10x10 down to 10x6) paired with core work and HIIT sprints.',
  durationWeeks: 6,
  daysPerWeek: 4,
  scheduleDays: ['Monday', 'Wednesday', 'Friday', 'Saturday'],
  goal: 'Hypertrophy & Body Recomposition',
};

// ============================================================================
// ALL 24 WORKOUT TEMPLATES ACROSS PHASES 1, 2, AND 3
// ============================================================================

export const WORKOUT_TEMPLATES_24: ProgramWorkoutTemplate[] = [
  // --------------------------------------------------------------------------
  // WEEK 1 (PHASE 1)
  // --------------------------------------------------------------------------
  {
    workoutNumber: 1,
    week: 1,
    dayOfWeek: 'Monday',
    phase: 1,
    title: 'Chest and Back',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 4, reps: '12', tempo: '3110', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'B1', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 60 },
      { order: 'B2', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 4, reps: '12', tempo: '2012', restSeconds: 60, defaultWeightKg: 65 },
      { order: 'C', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2012', restSeconds: 60, defaultWeightKg: 10 },
    ],
  },
  {
    workoutNumber: 2,
    week: 1,
    dayOfWeek: 'Wednesday',
    phase: 1,
    title: 'Delts and Arms',
    splitDay: 'Upper',
    exercises: [
      { order: 'A', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2010', restSeconds: 60, defaultWeightKg: 10 },
      { order: 'B', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 45 },
      { order: 'C', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2010', restSeconds: 60, defaultWeightKg: 16 },
      { order: 'D1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 12 },
      { order: 'D2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 4, reps: '15', tempo: '4010', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'E1', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 4, reps: '10', tempo: '3010', restSeconds: 45, defaultWeightKg: 12 },
      { order: 'E2', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 4, reps: '15', tempo: '3010', restSeconds: 45, defaultWeightKg: 25 },
    ],
  },
  {
    workoutNumber: 3,
    week: 1,
    dayOfWeek: 'Friday',
    phase: 1,
    title: 'Chest and Back',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 4, reps: '12', tempo: '3110', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'B1', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 60 },
      { order: 'B2', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 4, reps: '12', tempo: '2012', restSeconds: 60, defaultWeightKg: 65 },
      { order: 'C', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2012', restSeconds: 60, defaultWeightKg: 10 },
    ],
  },
  {
    workoutNumber: 4,
    week: 1,
    dayOfWeek: 'Saturday',
    phase: 1,
    title: 'Legs and Abs',
    splitDay: 'Legs',
    exercises: [
      { order: 'A', name: 'Squat', exerciseId: 'ex-barbell-squat', pillar: 'Squat', equipment: 'barbell', sets: 10, reps: '10', tempo: '4010', restSeconds: 90, useWarmupProtocol: true, defaultWeightKg: 85 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2012', restSeconds: 60, defaultWeightKg: 10 },
      { order: 'C', name: 'Decline gym ball plank', exerciseId: 'ex-decline-gymball-plank', pillar: 'Squat', equipment: 'bodyweight', sets: 4, reps: '1', tempo: '60sec', durationSeconds: 60, restSeconds: 60, defaultWeightKg: 0 },
      { order: 'D', name: 'High-intensity interval sprints', exerciseId: 'ex-hiit-sprints', pillar: 'Squat', equipment: 'bodyweight', sets: 1, reps: '1', tempo: '15-30min', durationMinutesRange: [15, 30], restSeconds: 0, defaultWeightKg: 0 },
    ],
  },

  // --------------------------------------------------------------------------
  // WEEK 2 (PHASE 1)
  // --------------------------------------------------------------------------
  {
    workoutNumber: 5,
    week: 2,
    dayOfWeek: 'Monday',
    phase: 1,
    title: 'Delts and Arms',
    splitDay: 'Upper',
    exercises: [
      { order: 'A', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2010', restSeconds: 60, defaultWeightKg: 10 },
      { order: 'B', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 45 },
      { order: 'C', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 3, reps: '15', tempo: '2010', restSeconds: 60, defaultWeightKg: 16 },
      { order: 'D1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 12 },
      { order: 'D2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 4, reps: '12', tempo: '4010', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'E1', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 4, reps: '10', tempo: '4010', restSeconds: 45, defaultWeightKg: 12 },
      { order: 'E2', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 4, reps: '15', tempo: '3010', restSeconds: 45, defaultWeightKg: 25 },
    ],
  },
  {
    workoutNumber: 6,
    week: 2,
    dayOfWeek: 'Wednesday',
    phase: 1,
    title: 'Chest and Back',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 4, reps: '12', tempo: '3110', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'B1', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 62.5 },
      { order: 'B2', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 4, reps: '12', tempo: '2012', restSeconds: 60, defaultWeightKg: 67.5 },
      { order: 'C', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2012', restSeconds: 60, defaultWeightKg: 10 },
    ],
  },
  {
    workoutNumber: 7,
    week: 2,
    dayOfWeek: 'Friday',
    phase: 1,
    title: 'Delts and Arms',
    splitDay: 'Upper',
    exercises: [
      { order: 'A', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2010', restSeconds: 60, defaultWeightKg: 10 },
      { order: 'B', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 45 },
      { order: 'C', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2010', restSeconds: 60, defaultWeightKg: 16 },
      { order: 'D1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 4, reps: '12', tempo: '3010', restSeconds: 60, defaultWeightKg: 12 },
      { order: 'D2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 4, reps: '15', tempo: '4010', restSeconds: 60, defaultWeightKg: 0 },
      { order: 'E1', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 4, reps: '10', tempo: '3010', restSeconds: 45, defaultWeightKg: 12 },
      { order: 'E2', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 4, reps: '15', tempo: '3010', restSeconds: 45, defaultWeightKg: 25 },
    ],
  },
  {
    workoutNumber: 8,
    week: 2,
    dayOfWeek: 'Saturday',
    phase: 1,
    title: 'Legs and Abs',
    splitDay: 'Legs',
    exercises: [
      { order: 'A', name: 'Squat', exerciseId: 'ex-barbell-squat', pillar: 'Squat', equipment: 'barbell', sets: 10, reps: '9', tempo: '4010', restSeconds: 90, useWarmupProtocol: true, defaultWeightKg: 87.5 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 4, reps: '15', tempo: '2012', restSeconds: 60, defaultWeightKg: 10 },
      { order: 'C', name: 'Decline gym ball plank', exerciseId: 'ex-decline-gymball-plank', pillar: 'Squat', equipment: 'bodyweight', sets: 4, reps: '1', tempo: '60sec', durationSeconds: 60, restSeconds: 60, defaultWeightKg: 0 },
      { order: 'D', name: 'High-intensity interval sprints', exerciseId: 'ex-hiit-sprints', pillar: 'Squat', equipment: 'bodyweight', sets: 1, reps: '1', tempo: '15-30min', durationMinutesRange: [15, 30], restSeconds: 0, defaultWeightKg: 0 },
    ],
  },

  // --------------------------------------------------------------------------
  // WEEK 3 (PHASE 2 - HIGH INTENSITY REST-PAUSE & DROP SETS)
  // --------------------------------------------------------------------------
  {
    workoutNumber: 9,
    week: 3,
    dayOfWeek: 'Monday',
    phase: 2,
    title: 'Chest and Back',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '3110', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.double_rest_pause, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.double_rest_pause, defaultWeightKg: 0 },
      { order: 'B1', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 65 },
      { order: 'B2', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 2, reps: '12', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 70 },
      { order: 'C', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: 'F*', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 12 },
    ],
  },
  {
    workoutNumber: 10,
    week: 3,
    dayOfWeek: 'Wednesday',
    phase: 2,
    title: 'Delts and Arms',
    splitDay: 'Upper',
    exercises: [
      { order: 'A', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 2, reps: '12/8', tempo: '2010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.delts_12_8_double_drop, defaultWeightKg: 12 },
      { order: 'B', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.double_rest_pause, defaultWeightKg: 47.5 },
      { order: 'C', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '2010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 18 },
      { order: 'D1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.biceps_preacher_finisher, defaultWeightKg: 14 },
      { order: 'D2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '4010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_rest_pause, defaultWeightKg: 0 },
      { order: 'E1', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 2, reps: '10', tempo: '4010', restSeconds: 45, intensityProtocol: INTENSITY_PROTOCOLS.biceps_hammer_finisher, defaultWeightKg: 14 },
      { order: 'E2', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 2, reps: '12', tempo: '3010', restSeconds: 45, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 27.5 },
    ],
  },
  {
    workoutNumber: 11,
    week: 3,
    dayOfWeek: 'Friday',
    phase: 2,
    title: 'Chest and Back',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '3110', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.double_rest_pause, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.double_rest_pause, defaultWeightKg: 0 },
      { order: 'B1', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 65 },
      { order: 'B2', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 2, reps: '12', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 70 },
      { order: 'C', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: 'F*', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 12 },
    ],
  },
  {
    workoutNumber: 12,
    week: 3,
    dayOfWeek: 'Saturday',
    phase: 2,
    title: 'Legs and Abs',
    splitDay: 'Legs',
    exercises: [
      { order: 'A', name: 'Squat', exerciseId: 'ex-barbell-squat', pillar: 'Squat', equipment: 'barbell', sets: 10, reps: '8', tempo: '4010', restSeconds: 90, useWarmupProtocol: true, defaultWeightKg: 90 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: 'F*', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 12 },
      { order: 'C', name: 'Decline gym ball plank', exerciseId: 'ex-decline-gymball-plank', pillar: 'Squat', equipment: 'bodyweight', sets: 3, reps: '1', tempo: '60sec', durationSeconds: 60, restSeconds: 60, defaultWeightKg: 0 },
      { order: 'D', name: 'High-intensity interval sprints', exerciseId: 'ex-hiit-sprints', pillar: 'Squat', equipment: 'bodyweight', sets: 1, reps: '1', tempo: '15-30min', durationMinutesRange: [15, 30], restSeconds: 0, defaultWeightKg: 0 },
    ],
  },

  // --------------------------------------------------------------------------
  // WEEK 4 (PHASE 2)
  // --------------------------------------------------------------------------
  {
    workoutNumber: 13,
    week: 4,
    dayOfWeek: 'Monday',
    phase: 2,
    title: 'Delts and Arms',
    splitDay: 'Upper',
    exercises: [
      { order: 'A', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '2010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.delts_triple_drop_iso_laterals, defaultWeightKg: 12 },
      { order: 'B', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 2, reps: '12/6', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.delts_12_6_partials_drop, defaultWeightKg: 50 },
      { order: 'C', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '2010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 18 },
      { order: 'D1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.biceps_preacher_finisher, defaultWeightKg: 14 },
      { order: 'D2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '4010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_rest_pause, defaultWeightKg: 0 },
      { order: 'E1', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 2, reps: '10', tempo: '4010', restSeconds: 45, intensityProtocol: INTENSITY_PROTOCOLS.biceps_hammer_finisher, defaultWeightKg: 14 },
      { order: 'E2', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 2, reps: '12', tempo: '3010', restSeconds: 45, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 30 },
    ],
  },
  {
    workoutNumber: 14,
    week: 4,
    dayOfWeek: 'Wednesday',
    phase: 2,
    title: 'Chest and Back',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '3110', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_rest_pause, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_rest_pause, defaultWeightKg: 0 },
      { order: 'B1', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 67.5 },
      { order: 'B2', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 2, reps: '12', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 72.5 },
      { order: 'C', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: 'F*', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 14 },
    ],
  },
  {
    workoutNumber: 15,
    week: 4,
    dayOfWeek: 'Friday',
    phase: 2,
    title: 'Delts and Arms',
    splitDay: 'Upper',
    exercises: [
      { order: 'A', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '2010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.delts_triple_drop_iso_laterals, defaultWeightKg: 12 },
      { order: 'B', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 2, reps: '12/6', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.delts_12_6_partials_drop, defaultWeightKg: 50 },
      { order: 'C', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '2010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 18 },
      { order: 'D1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 2, reps: '12', tempo: '3010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.biceps_preacher_finisher, defaultWeightKg: 14 },
      { order: 'D2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 2, reps: '12', tempo: '4010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.triple_rest_pause, defaultWeightKg: 0 },
      { order: 'E1', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 2, reps: '10', tempo: '4010', restSeconds: 45, intensityProtocol: INTENSITY_PROTOCOLS.biceps_hammer_finisher, defaultWeightKg: 14 },
      { order: 'E2', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 2, reps: '12', tempo: '3010', restSeconds: 45, intensityProtocol: INTENSITY_PROTOCOLS.triple_drop_set, defaultWeightKg: 30 },
    ],
  },
  {
    workoutNumber: 16,
    week: 4,
    dayOfWeek: 'Saturday',
    phase: 2,
    title: 'Legs and Abs',
    splitDay: 'Legs',
    exercises: [
      { order: 'A', name: 'Squat', exerciseId: 'ex-barbell-squat', pillar: 'Squat', equipment: 'barbell', sets: 10, reps: '8', tempo: '4010', restSeconds: 90, useWarmupProtocol: true, defaultWeightKg: 92.5 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: 'F*', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 14 },
      { order: 'C', name: 'Decline gym ball plank', exerciseId: 'ex-decline-gymball-plank', pillar: 'Squat', equipment: 'bodyweight', sets: 3, reps: '1', tempo: '60sec', durationSeconds: 60, restSeconds: 60, defaultWeightKg: 0 },
      { order: 'D', name: 'High-intensity interval sprints', exerciseId: 'ex-hiit-sprints', pillar: 'Squat', equipment: 'bodyweight', sets: 1, reps: '1', tempo: '15-30min', durationMinutesRange: [15, 30], restSeconds: 0, defaultWeightKg: 0 },
    ],
  },

  // --------------------------------------------------------------------------
  // WEEK 5 (PHASE 3 - GIANT SETS & TRI-SETS)
  // --------------------------------------------------------------------------
  {
    workoutNumber: 17,
    week: 5,
    dayOfWeek: 'Monday',
    phase: 3,
    title: 'Chest and Back (Giant Sets)',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 3, reps: '10', tempo: '3110', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'A3', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 62.5 },
      { order: 'A4', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 3, reps: '10', tempo: '2012', restSeconds: 90, defaultWeightKg: 67.5 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: '15', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 14 },
    ],
  },
  {
    workoutNumber: 18,
    week: 5,
    dayOfWeek: 'Wednesday',
    phase: 3,
    title: 'Delts and Arms (Tri-Sets)',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 3, reps: '12', tempo: '2010', restSeconds: 0, defaultWeightKg: 10 },
      { order: 'A2', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 45 },
      { order: 'A3', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 3, reps: '12', tempo: '2010', restSeconds: 90, defaultWeightKg: 16 },
      { order: 'B1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 12 },
      { order: 'B2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 3, reps: '12', tempo: '4010', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'B3', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 3, reps: '12', tempo: '3010', restSeconds: 90, defaultWeightKg: 25 },
      { order: 'C', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 3, reps: '10', tempo: '4010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 12 },
    ],
  },
  {
    workoutNumber: 19,
    week: 5,
    dayOfWeek: 'Friday',
    phase: 3,
    title: 'Chest and Back (Giant Sets)',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 3, reps: '10', tempo: '3110', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'A3', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 62.5 },
      { order: 'A4', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 3, reps: '10', tempo: '2012', restSeconds: 90, defaultWeightKg: 67.5 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: '15', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 14 },
    ],
  },
  {
    workoutNumber: 20,
    week: 5,
    dayOfWeek: 'Saturday',
    phase: 3,
    title: 'Legs and Abs',
    splitDay: 'Legs',
    exercises: [
      { order: 'A', name: 'Squat', exerciseId: 'ex-barbell-squat', pillar: 'Squat', equipment: 'barbell', sets: 10, reps: '6', tempo: '4010', restSeconds: 90, useWarmupProtocol: true, defaultWeightKg: 97.5 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: '15', tempo: '2012', restSeconds: 60, defaultWeightKg: 14 },
      { order: 'C', name: 'Decline gym ball plank', exerciseId: 'ex-decline-gymball-plank', pillar: 'Squat', equipment: 'bodyweight', sets: 3, reps: '1', tempo: '60sec', durationSeconds: 60, restSeconds: 60, defaultWeightKg: 0 },
      { order: 'D', name: 'High-intensity interval sprints', exerciseId: 'ex-hiit-sprints', pillar: 'Squat', equipment: 'bodyweight', sets: 1, reps: '1', tempo: '15-30min', durationMinutesRange: [15, 30], restSeconds: 0, defaultWeightKg: 0 },
    ],
  },

  // --------------------------------------------------------------------------
  // WEEK 6 (PHASE 3)
  // --------------------------------------------------------------------------
  {
    workoutNumber: 21,
    week: 6,
    dayOfWeek: 'Monday',
    phase: 3,
    title: 'Delts and Arms (Tri-Sets)',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 3, reps: '12', tempo: '2010', restSeconds: 0, defaultWeightKg: 11 },
      { order: 'A2', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 47.5 },
      { order: 'A3', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 3, reps: '12', tempo: '2010', restSeconds: 90, defaultWeightKg: 17 },
      { order: 'B1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 13 },
      { order: 'B2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 3, reps: '12', tempo: '4010', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'B3', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 3, reps: '12', tempo: '3010', restSeconds: 90, defaultWeightKg: 27.5 },
      { order: 'C', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 3, reps: '10', tempo: '4010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 13 },
    ],
  },
  {
    workoutNumber: 22,
    week: 6,
    dayOfWeek: 'Wednesday',
    phase: 3,
    title: 'Chest and Back (Giant Sets)',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Ring press-up', exerciseId: 'ex-ring-pressup', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 3, reps: '10', tempo: '3110', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'A2', name: 'Hammer-grip chin-up', exerciseId: 'ex-hammer-chinup', pillar: 'Vertical Pull', equipment: 'bodyweight', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'A3', name: 'Guillotine press', exerciseId: 'ex-guillotine-press', pillar: 'Horizontal Push', equipment: 'barbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 65 },
      { order: 'A4', name: 'Reverse-grip bent-over row', exerciseId: 'ex-reverse-bb-row', pillar: 'Horizontal Pull', equipment: 'barbell', sets: 3, reps: '10', tempo: '2012', restSeconds: 90, defaultWeightKg: 70 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: '15', tempo: '2012', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 15 },
    ],
  },
  {
    workoutNumber: 23,
    week: 6,
    dayOfWeek: 'Friday',
    phase: 3,
    title: 'Delts and Arms (Tri-Sets)',
    splitDay: 'Upper',
    exercises: [
      { order: 'A1', name: 'Seated lateral raise', exerciseId: 'ex-seated-lateral-raise', pillar: 'Vertical Push', equipment: 'dumbbell', sets: 3, reps: '12', tempo: '2010', restSeconds: 0, defaultWeightKg: 11 },
      { order: 'A2', name: 'Seated barbell behind-the-neck press', exerciseId: 'ex-btn-press', pillar: 'Vertical Push', equipment: 'barbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 47.5 },
      { order: 'A3', name: 'Dumbbell upright row', exerciseId: 'ex-db-upright-row', pillar: 'Vertical Pull', equipment: 'dumbbell', sets: 3, reps: '12', tempo: '2010', restSeconds: 90, defaultWeightKg: 17 },
      { order: 'B1', name: 'Dumbbell hammer preacher curl', exerciseId: 'ex-hammer-preacher-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 3, reps: '10', tempo: '3010', restSeconds: 0, defaultWeightKg: 13 },
      { order: 'B2', name: 'Triceps dip', exerciseId: 'ex-triceps-dip', pillar: 'Horizontal Push', equipment: 'bodyweight', sets: 3, reps: '12', tempo: '4010', restSeconds: 0, defaultWeightKg: 0 },
      { order: 'B3', name: 'Kneeling overhead cable triceps extension', exerciseId: 'ex-kneeling-overhead-tricep-ext', pillar: 'Horizontal Push', equipment: 'cable', sets: 3, reps: '12', tempo: '3010', restSeconds: 90, defaultWeightKg: 27.5 },
      { order: 'C', name: 'Incline dumbbell biceps curl', exerciseId: 'ex-incline-db-curl', pillar: 'Horizontal Pull', equipment: 'dumbbell', sets: 3, reps: '10', tempo: '4010', restSeconds: 60, intensityProtocol: INTENSITY_PROTOCOLS.form_failure, defaultWeightKg: 13 },
    ],
  },
  {
    workoutNumber: 24,
    week: 6,
    dayOfWeek: 'Saturday',
    phase: 3,
    title: 'Legs and Abs',
    splitDay: 'Legs',
    exercises: [
      { order: 'A', name: 'Squat', exerciseId: 'ex-barbell-squat', pillar: 'Squat', equipment: 'barbell', sets: 10, reps: '6', tempo: '4010', restSeconds: 90, useWarmupProtocol: true, defaultWeightKg: 100 },
      { order: 'B', name: 'Weighted gym ball crunch', exerciseId: 'ex-gymball-crunch', pillar: 'Squat', equipment: 'dumbbell', sets: 3, reps: '15', tempo: '2012', restSeconds: 60, defaultWeightKg: 15 },
      { order: 'C', name: 'Decline gym ball plank', exerciseId: 'ex-decline-gymball-plank', pillar: 'Squat', equipment: 'bodyweight', sets: 3, reps: '1', tempo: '60sec', durationSeconds: 60, restSeconds: 60, defaultWeightKg: 0 },
      { order: 'D', name: 'High-intensity interval sprints', exerciseId: 'ex-hiit-sprints', pillar: 'Squat', equipment: 'bodyweight', sets: 1, reps: '1', tempo: '15-30min', durationMinutesRange: [15, 30], restSeconds: 0, defaultWeightKg: 0 },
    ],
  },
];

export const EXERCISE_NOTES_MAP: Record<string, string[]> = {
  'Ring press-up': [
    'Assume a press-up position with toes on the floor and holding a gymnastic ring in each hand.',
    'Keeping your core braced and shoulders engaged, lower your chest down between the rings.',
    'Press forcefully back to the starting lockout, stabilizing the rings throughout.',
  ],
  'Hammer-grip chin-up': [
    'Grip parallel handles with palms facing each other (neutral hammer grip).',
    'Start from a full dead hang, retract your scapulae, and pull until your chin clears the bar.',
    'Lower under strict 3010 tempo to a complete hang before initiating the next rep.',
  ],
  'Guillotine press': [
    'Lie flat on the bench with feet planted under knees and upper back firmly braced.',
    'Take a shoulder-width overhand grip and unrack the barbell under complete control.',
    'Lower the bar slowly toward your clavicle/neck area with elbows flared at ~90 degrees.',
    'Drive through the pectorals back to the starting lockout.',
  ],
  'Reverse-grip bent-over row': [
    'Hinge forward at the hips to ~45 degrees with a flat spine, holding the barbell with an underhand (supinated) grip.',
    'Pull the bar smoothly back toward your lower sternum/umbilicus, driving elbows behind your torso.',
    'Pause for 2 seconds at peak contraction before lowering under control.',
  ],
  'Weighted gym ball crunch': [
    'Lie back on an exercise ball with lower back supported and feet planted firmly on the floor.',
    'Hold a dumbbell or plate against your chest.',
    'Contract your abdominals to curl your ribcage toward your pelvis, pausing at the top.',
  ],
  'Seated lateral raise': [
    'Sit on the edge of a bench with dumbbells held at your sides.',
    'Lead with your elbows and raise the weights out to shoulder level without swinging.',
    'Lower under control for 2 seconds to maintain constant lateral delt tension.',
  ],
  'Seated barbell behind-the-neck press': [
    'Sit tall with core engaged and grip the barbell slightly wider than shoulder width.',
    'Lower the bar with strict control just behind the crown of your head to upper-ear level.',
    'Press smoothly back up to lockout overhead.',
  ],
  'Dumbbell upright row': [
    'Hold dumbbells in front of thighs with palms facing you.',
    'Pull the dumbbells vertically up towards your mid-chest, leading with your elbows high and wide.',
    'Lower under control without leaning backward.',
  ],
  'Dumbbell hammer preacher curl': [
    'Rest your upper arms flat against the preacher bench pad, holding dumbbells with a neutral hammer grip.',
    'Curl the weights upward while keeping your elbows stationary on the pad.',
    'Lower slowly under 3010 tempo to a full stretch at the bottom.',
  ],
  'Triceps dip': [
    'Grip parallel dip bars with arms locked and body upright to emphasize the triceps.',
    'Lower your body until elbows reach 90 degrees under strict 4010 eccentric tempo.',
    'Press forcefully through palms to return to full lockout.',
  ],
  'Incline dumbbell biceps curl': [
    'Lie back on an incline bench set to 45–60 degrees with arms hanging straight down.',
    'Curl the dumbbells with palms supinating outward at the top for maximum biceps peak.',
    'Lower slowly under strict control to feel the deep stretch at the bottom.',
  ],
  'Kneeling overhead cable triceps extension': [
    'Kneel facing away from a high pulley holding a rope attachment behind your head.',
    'Keep your upper arms stationary beside your ears and extend your forearms forward.',
    'Squeeze your triceps at lockout, then control the eccentric stretch.',
  ],
  Squat: [
    'Set feet shoulder-width apart with toes flared slightly out and barbell across upper traps.',
    'Inhale, brace your core 360 degrees, and descend under a strict 4-second eccentric count.',
    'Reach parallel or below, drive feet hard through the floor, and return to standing.',
  ],
  'Decline gym ball plank': [
    'Place your shins and feet on an exercise ball with forearms on the floor in plank position.',
    'Brace your core, glutes, and shoulders to maintain a straight line from heels to crown.',
    'Hold for the target duration without letting your lower back sag.',
  ],
  'High-intensity interval sprints': [
    'Perform high-intensity interval bursts (e.g., 20s sprint / 40s walk on treadmill or track).',
    'Preserves lean muscle mass while driving high metabolic rate and cardiovascular capacity.',
  ],
};

/**
 * Calculates the 5-step warmup ramp from a target working weight.
 */
export function calculate5StepWarmupRamp(targetWorkingWeightKg: number) {
  const roundTo2_5 = (val: number) => Math.max(20, Math.round(val / 2.5) * 2.5);
  return WARMUP_PROTOCOL.sets.map((step) => {
    const rawWeight = targetWorkingWeightKg * (step.percentageOfWorkWeight / 100);
    const calculatedWeight = roundTo2_5(rawWeight);
    return {
      setNumber: step.setNumber,
      reps: step.reps,
      percentage: step.percentageOfWorkWeight,
      targetWeightKg: calculatedWeight,
      restMin: step.restSecondsMin,
      restMax: step.restSecondsMax,
      restLabel: step.restLabel,
    };
  });
}

/**
 * Hydrates a WorkoutSession from a 6-Week Muscle Building Program workout template.
 */
export function generate6WeekMuscleBuildingWorkout(
  workoutNumber: number,
  bodyweightEmaKg: number = 80
): WorkoutSession {
  const tmpl =
    WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === workoutNumber) ||
    WORKOUT_TEMPLATES_24[0];

  const today = localDateString();

  const exercises: ExerciseSession[] = tmpl.exercises.map((e, idx) => {
    const notesArray = EXERCISE_NOTES_MAP[e.name] || [];
    const exerciseNotesCombined = e.notes || notesArray.join(' ');

    const isTimed = e.durationSeconds !== undefined || e.tempo.includes('sec') || e.tempo.includes('min');
    let repTargetType: 'reps' | 'wave' | 'form_failure' | 'duration' = 'reps';
    if (isTimed) {
      repTargetType = 'duration';
    } else if (e.reps.includes('/')) {
      repTargetType = 'wave';
    } else if (e.reps === 'F*') {
      repTargetType = 'form_failure';
    }

    const sets: WorkoutSet[] = Array.from({ length: e.sets }).map((_, sIdx) => {
      let targetReps = 10;
      let repDisplay = e.reps;

      if (e.reps === '12/8') {
        targetReps = sIdx === 0 ? 12 : 8;
        repDisplay = sIdx === 0 ? '12' : '8';
      } else if (e.reps === '12/6') {
        targetReps = sIdx === 0 ? 12 : 6;
        repDisplay = sIdx === 0 ? '12' : '6';
      } else if (e.reps === 'F*') {
        targetReps = 15;
        repDisplay = 'F*';
      } else if (isTimed) {
        targetReps = 1;
        repDisplay = e.tempo;
      } else {
        const parsed = parseInt(e.reps, 10);
        targetReps = Number.isNaN(parsed) ? 10 : parsed;
        repDisplay = `${targetReps}`;
      }

      return {
        id: `set-${tmpl.workoutNumber}-${idx}-${sIdx + 1}`,
        setNumber: sIdx + 1,
        targetWeightKg: e.defaultWeightKg ?? 20,
        actualWeightKg: e.defaultWeightKg ?? 20,
        targetReps,
        actualReps: targetReps,
        targetRir: tmpl.phase === 1 ? 2 : tmpl.phase === 2 ? 0 : 1,
        completed: false,
        isWarmup: false,
        setType: 'working',
        tempo: e.tempo,
        isFormFailure: repTargetType === 'form_failure',
        repDisplay,
      };
    });

    const currentLetter = e.order.charAt(0);
    const hasNextInGroup =
      tmpl.exercises[idx + 1] &&
      tmpl.exercises[idx + 1].order.length > 1 &&
      tmpl.exercises[idx + 1].order.startsWith(currentLetter);
    const effectiveRestSeconds = hasNextInGroup ? 0 : e.restSeconds;

    return {
      id: `ex-sess-${tmpl.workoutNumber}-${idx}`,
      exerciseId: e.exerciseId,
      name: e.name,
      pillar: e.pillar,
      equipment: e.equipment,
      minReps: repTargetType === 'wave' ? 6 : repTargetType === 'form_failure' ? 15 : sets[0].targetReps,
      maxReps: repTargetType === 'wave' ? 12 : repTargetType === 'form_failure' ? 25 : sets[0].targetReps,
      sets,
      notes: exerciseNotesCombined,
      orderCode: e.order,
      tempo: e.tempo,
      restSeconds: effectiveRestSeconds,
      durationSeconds: e.durationSeconds,
      durationMinutesRange: e.durationMinutesRange,
      intensityProtocol: e.intensityProtocol,
      useWarmupProtocol: e.useWarmupProtocol,
      repTargetType,
      exerciseNotes: notesArray,
    };
  });

  return {
    id: `workout-6wk-${tmpl.workoutNumber}-${today}`,
    date: today,
    name: `W${tmpl.week}D${((tmpl.workoutNumber - 1) % 4) + 1} • ${tmpl.title} (Phase ${tmpl.phase})`,
    splitDay: tmpl.splitDay,
    exercises,
    completed: false,
    readinessState: 'Normal',
    readinessZScore: 0.2,
    xpEarned: 0,
    location: 'gym',
    programWorkoutNumber: tmpl.workoutNumber,
  };
}

/** Plan position of a session (1-24), including sessions saved before the field existed. */
export function getProgramWorkoutNumber(w: WorkoutSession): number | undefined {
  if (w.programWorkoutNumber) return w.programWorkoutNumber;
  const match = /^workout-6wk-(\d+)-/.exec(w.id);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Next workout in the 6-Week plan: the one after the most recently completed plan workout,
 * wrapping back to Workout 1 after Workout 24. Non-plan sessions are ignored.
 */
export function getNextProgramWorkoutNumber(workouts: WorkoutSession[]): number {
  const done = workouts
    .filter((w) => w.completed && getProgramWorkoutNumber(w) !== undefined)
    .sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
  const last = done[0] ? getProgramWorkoutNumber(done[0]) : undefined;
  if (!last) return 1;
  return last >= WORKOUT_TEMPLATES_24.length ? 1 : last + 1;
}
