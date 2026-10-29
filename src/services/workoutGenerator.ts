import {
  ExerciseDefinition,
  ExerciseSession,
  HomeEquipmentTag,
  ProgramSplitType,
  ReadinessState,
  TrainingLocation,
  WorkoutSession,
  WorkoutSet,
  GoalPhase,
} from '../engine/types';
import {
  canPerformExerciseInLocation,
  getMovementFamilyLabel,
  getMovementVectorId,
  prescribeDoubleProgression,
} from '../engine/progression';
import {
  calculateE1RM,
  calculateHypertrophyBodyweightReps,
  translateWeightBetweenImplements,
} from '../engine/e1rm';
import { getExerciseBiomechanicalMeta } from '../engine/knowledgeGraph';
import { WORKOUT_TEMPLATES_24 } from '../engine/muscleBuildingProgram';
import {
  calculateWarmupPrescription,
  generateWarmupSets,
  isFirstCompoundForPillar,
} from '../engine/warmup';
import { localDateString } from '../utils/date';
import { SEED_EXERCISES } from './seedData';

export type SplitDayType = 'Push' | 'Pull' | 'Legs' | 'Upper';

const SPLIT_TEMPLATES: Record<
  SplitDayType,
  {
    sessionTitle: string;
    exercises: {
      exerciseId: string;
      defaultWeightKg: number;
      baseSets: number;
      highVolumeResponder?: boolean;
      notes: string;
    }[];
  }
> = {
  Push: {
    sessionTitle: 'Push Day — Chest, Shoulders & Triceps',
    exercises: [
      {
        exerciseId: 'ex-bench-press',
        defaultWeightKg: 92.5,
        baseSets: 3,
        notes: 'Lower the bar under control for 2 seconds, then press up smoothly.',
      },
      {
        exerciseId: 'ex-ohp',
        defaultWeightKg: 57.5,
        baseSets: 3,
        notes: 'Brace your core and glutes, and press to a full lockout overhead.',
      },
      {
        exerciseId: 'ex-db-bench-press',
        defaultWeightKg: 34,
        baseSets: 3,
        notes: 'Lower the dumbbells to a comfortable stretch at chest level.',
      },
      {
        exerciseId: 'ex-db-lateral-raise',
        defaultWeightKg: 14,
        baseSets: 4,
        highVolumeResponder: true,
        notes: 'Lean forward slightly and lead with your elbows to target the side shoulders.',
      },
      {
        exerciseId: 'ex-tricep-pushdown',
        defaultWeightKg: 32.5,
        baseSets: 3,
        notes: 'Keep your elbows tucked at your sides and lock out fully at the bottom.',
      },
    ],
  },
  Pull: {
    sessionTitle: 'Pull Day — Back, Rear Shoulders & Biceps',
    exercises: [
      {
        exerciseId: 'ex-weighted-pullup',
        defaultWeightKg: 17.5,
        baseSets: 3,
        notes: 'Start from a full hang at the bottom and pull your chest toward the bar.',
      },
      {
        exerciseId: 'ex-barbell-row',
        defaultWeightKg: 77.5,
        baseSets: 3,
        notes: 'Hinge forward with a flat back and drive your elbows back toward your hips.',
      },
      {
        exerciseId: 'ex-face-pull',
        defaultWeightKg: 27.5,
        baseSets: 4,
        highVolumeResponder: true,
        notes: 'Pull the rope toward your forehead with high elbows to work your rear shoulders.',
      },
      {
        exerciseId: 'ex-bicep-curl',
        defaultWeightKg: 14,
        baseSets: 3,
        notes: 'Let your arms stretch fully at the bottom of each rep on the incline bench.',
      },
    ],
  },
  Legs: {
    sessionTitle: 'Leg Day — Quads, Hamstrings & Calves',
    exercises: [
      {
        exerciseId: 'ex-barbell-squat',
        defaultWeightKg: 117.5,
        baseSets: 3,
        notes: 'Brace your core and squat to full depth with knees tracking over your toes.',
      },
      {
        exerciseId: 'ex-rdl',
        defaultWeightKg: 127.5,
        baseSets: 3,
        notes: 'Push your hips back with a flat spine and pause briefly at peak hamstring stretch.',
      },
      {
        exerciseId: 'ex-leg-curl',
        defaultWeightKg: 57.5,
        baseSets: 3,
        notes: 'Control the weight all the way back up for a full hamstring stretch.',
      },
      {
        exerciseId: 'ex-standing-calf-raise',
        defaultWeightKg: 87.5,
        baseSets: 4,
        highVolumeResponder: true,
        notes: 'Pause for 2 seconds in the deep stretch at the bottom of every rep.',
      },
    ],
  },
  Upper: {
    sessionTitle: 'Upper Body — Chest, Back & Shoulders',
    exercises: [
      {
        exerciseId: 'ex-bench-press',
        defaultWeightKg: 87.5,
        baseSets: 3,
        notes: 'Focus on smooth bar speed and steady chest control.',
      },
      {
        exerciseId: 'ex-cable-row',
        defaultWeightKg: 72.5,
        baseSets: 3,
        notes: 'Let your shoulder blades stretch forward slightly, then squeeze them back.',
      },
      {
        exerciseId: 'ex-cable-lateral-raise',
        defaultWeightKg: 10,
        baseSets: 4,
        highVolumeResponder: true,
        notes: 'Cross the cable in front of your hip for continuous tension on your side shoulders.',
      },
      {
        exerciseId: 'ex-seated-calf-raise',
        defaultWeightKg: 47.5,
        baseSets: 4,
        highVolumeResponder: true,
        notes: 'Pause for 2 seconds at the bottom stretch before pressing all the way up.',
      },
      {
        exerciseId: 'ex-bicep-curl',
        defaultWeightKg: 14,
        baseSets: 3,
        notes: 'Turn your palms up as you curl and squeeze at the top.',
      },
    ],
  },
};

/** Exercise IDs in the routine for a split day, in workout order. */
export function getSplitTemplateExerciseIds(split: SplitDayType): string[] {
  return (SPLIT_TEMPLATES[split] || SPLIT_TEMPLATES.Push).exercises.map((e) => e.exerciseId);
}

/**
 * Template working weight for an exercise, expressed for the experienced reference lifter.
 * Split templates are written for that lifter; the 6-week plan is written for an intermediate
 * lifter (factor 0.75), so its weights are scaled up to the same reference.
 */
export function getTemplateDefaultWeight(exerciseId: string): number | undefined {
  const direct = getDirectTemplateDefaultWeight(exerciseId);
  if (direct !== undefined) return direct;

  // Not in any template: borrow the default of a templated exercise with the same movement,
  // converted between implements (same equipment preferred).
  const def = SEED_EXERCISES.find((e) => e.id === exerciseId);
  if (!def || def.equipment === 'bodyweight' || def.isWeightedCalisthenic) return undefined;
  const vector = getMovementVectorId(def);
  const source = SEED_EXERCISES.filter(
    (e) => e.id !== exerciseId && e.equipment !== 'bodyweight' && !e.isWeightedCalisthenic && getMovementVectorId(e) === vector
  )
    .map((e) => ({ e, weight: getDirectTemplateDefaultWeight(e.id) }))
    .filter((x): x is { e: ExerciseDefinition; weight: number } => x.weight !== undefined)
    .sort((a, b) => Number(b.e.equipment === def.equipment) - Number(a.e.equipment === def.equipment))[0];
  if (!source) return undefined;
  const converted = translateWeightBetweenImplements(
    source.weight,
    { ...source.e, exerciseId: source.e.id },
    { ...def, exerciseId: def.id }
  );
  return converted > 0 ? converted : undefined;
}

function getDirectTemplateDefaultWeight(exerciseId: string): number | undefined {
  for (const tmpl of Object.values(SPLIT_TEMPLATES)) {
    const item = tmpl.exercises.find((e) => e.exerciseId === exerciseId);
    if (item && item.defaultWeightKg > 0) return item.defaultWeightKg;
  }
  for (const w of WORKOUT_TEMPLATES_24) {
    const item = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (item && (item.defaultWeightKg ?? 0) > 0) return (item.defaultWeightKg as number) / 0.75;
  }
  return undefined;
}

export function getNextSplitDay(
  current: string,
  programType: ProgramSplitType = 'ppl_upper'
): SplitDayType {
  let order: SplitDayType[] = ['Push', 'Pull', 'Legs', 'Upper'];

  if (programType === 'ppl') {
    order = ['Push', 'Pull', 'Legs'];
  } else if (programType === 'upper_lower' || programType === 'muscle_building_6wk') {
    order = ['Upper', 'Legs'];
  } else if (programType === 'full_body') {
    order = ['Push', 'Pull', 'Legs'];
  } else {
    order = ['Push', 'Pull', 'Legs', 'Upper'];
  }

  const idx = order.indexOf(current as SplitDayType);
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
}

export function getSplitDaysForProgram(
  programType: ProgramSplitType = 'ppl_upper'
): { id: SplitDayType; label: string; desc: string }[] {
  switch (programType) {
    case 'muscle_building_6wk':
      return [
        { id: 'Upper', label: 'Upper Body', desc: 'Chest, Back, Delts & Arms' },
        { id: 'Legs', label: 'Legs & Abs', desc: '10-set squats & core' },
      ];
    case 'ppl':
      return [
        { id: 'Push', label: 'Push', desc: 'Chest, Shoulders & Triceps' },
        { id: 'Pull', label: 'Pull', desc: 'Back, Rear Delts & Biceps' },
        { id: 'Legs', label: 'Legs', desc: 'Quads, Hamstrings & Calves' },
      ];
    case 'upper_lower':
      return [
        { id: 'Upper', label: 'Upper', desc: 'Chest, Back & Shoulders' },
        { id: 'Legs', label: 'Lower', desc: 'Quads, Hamstrings & Calves' },
      ];
    case 'full_body':
      return [
        { id: 'Push', label: 'Full Body A', desc: 'Squat & Chest Dominant' },
        { id: 'Pull', label: 'Full Body B', desc: 'Hinge & Back Dominant' },
        { id: 'Legs', label: 'Full Body C', desc: 'Unilateral & Posterior Chain' },
      ];
    case 'ppl_upper':
    default:
      return [
        { id: 'Push', label: 'Push', desc: 'Chest, Shoulders & Triceps' },
        { id: 'Pull', label: 'Pull', desc: 'Back, Rear Delts & Biceps' },
        { id: 'Legs', label: 'Legs', desc: 'Quads, Hamstrings & Calves' },
        { id: 'Upper', label: 'Upper', desc: 'Chest, Back & Arms' },
      ];
  }
}

export function getFirstSplitDayForProgram(programType?: ProgramSplitType): SplitDayType {
  switch (programType) {
    case 'upper_lower':
    case 'muscle_building_6wk':
      return 'Upper';
    case 'ppl':
    case 'ppl_upper':
    case 'full_body':
    default:
      return 'Push';
  }
}

export const FEATURED_PROGRAM_OPTIONS: ProgramSplitOption[] = [
  {
    id: 'muscle_building_6wk',
    title: '6-Week Muscle Building Plan',
    badge: 'High-Volume & High-Intensity',
    frequency: '4 sessions / week • 3 progressive 2-week phases',
    rotation: 'Chest & Back → Delts & Arms → Chest & Back → Legs (10-set squats)',
    detail:
      'An intensive 24-workout program structured into three 2-week meso-cycles: Phase 1 antagonist supersets, Phase 2 rest-pause & drop-sets, Phase 3 giant sets & tri-sets.',
    firstSession: 'Chest & Back (Antagonist Supersets)',
  },
];

export interface ProgramSplitOption {
  id: ProgramSplitType;
  title: string;
  badge: string;
  recommended?: boolean;
  frequency: string;
  rotation: string;
  detail: string;
  firstSession: string;
}

export const PROGRAM_OPTIONS: ProgramSplitOption[] = [
  {
    id: 'ppl_upper',
    title: 'Push / Pull / Legs + Upper (4-Day)',
    badge: 'Recommended for Hypertrophy',
    recommended: true,
    frequency: '4 sessions per rotation • ~2x/week per muscle',
    rotation: 'Push (Chest/Shoulders) → Pull (Back/Biceps) → Legs → Upper Body',
    detail: 'The gold standard for muscle growth. Combines focused movement planes with an Upper session for maximum hypertrophy without burnout.',
    firstSession: 'Push Day (Chest, Shoulders & Triceps)',
  },
  {
    id: 'ppl',
    title: 'Push / Pull / Legs (3-Day Classic)',
    badge: 'Classic Bodybuilding',
    frequency: '3 sessions per rotation • Dedicated planes',
    rotation: 'Push (Chest/Shoulders/Triceps) → Pull (Back/Biceps) → Legs (Quads/Hamstrings/Calves)',
    detail: 'Dedicated focus per movement plane with maximum joint and nervous system recovery between sessions.',
    firstSession: 'Push Day (Chest, Shoulders & Triceps)',
  },
  {
    id: 'upper_lower',
    title: 'Upper / Lower (4-Day Power & Mass)',
    badge: 'Strength & Hypertrophy',
    frequency: '4 sessions per rotation • Heavy compound stimulus',
    rotation: 'Upper Body A → Lower Body A → Upper Body B → Lower Body B',
    detail: 'Time-efficient compound split alternating upper body pressing and pulling with heavy squats and hinges.',
    firstSession: 'Upper Body (Chest, Back & Shoulders)',
  },
  {
    id: 'full_body',
    title: 'Full Body (3-Day High Frequency)',
    badge: 'Time Efficient',
    frequency: '3 sessions per rotation • Whole-body stimulus',
    rotation: 'Full Body A → Full Body B → Full Body C',
    detail: 'Stimulates major muscle groups 3 times per week with high recovery windows between sessions. Ideal for busy lifters.',
    firstSession: 'Full Body A (Squat & Chest)',
  },
];

export interface HypertrophyQueueRecommendation {
  activeSplit: SplitDayType;
  recommendedSplit: SplitDayType;
  nextInQueue: SplitDayType;
  targetMuscles: string;
  requiredRecoveryHours: number;
  hoursSinceLastTargetStimulus: number;
  daysSinceLastWorkoutOverall: number;
  recoveryPercentage: number;
  isSkippedDayAdapted: boolean;
  recoveryBadge: string;
  scienceRationale: string;
}

const SPLIT_RECOVERY_META: Record<
  SplitDayType,
  { targetMuscles: string; recoveryWindowHours: number }
> = {
  Push: {
    targetMuscles: 'Chest, Shoulders & Triceps',
    recoveryWindowHours: 60, // Chest 60h, Triceps 48h, Side Delts 24h (AGENTS.md 4.2)
  },
  Pull: {
    targetMuscles: 'Back, Rear Shoulders & Biceps',
    recoveryWindowHours: 48, // Back/Lats 48h, Rear Delts/Biceps 36h
  },
  Legs: {
    targetMuscles: 'Quads, Hamstrings & Calves',
    recoveryWindowHours: 72, // Hamstrings 72h, Quads 60h, Calves 24h
  },
  Upper: {
    targetMuscles: 'Chest, Back & Shoulders',
    recoveryWindowHours: 48, // Compound upper protein synthesis window 48h
  },
};

/**
 * Determines what the athlete should train next based on an Asynchronous Hypertrophy Queue
 * and muscle-specific recovery windows (24h–72h) rather than rigid calendar days.
 * Handles skipped days automatically without penalty.
 */
export function getHypertrophyQueueRecommendation(
  activeSplitInput: string,
  historicalWorkouts: WorkoutSession[],
  referenceDateStr?: string,
  programType: ProgramSplitType = 'ppl_upper',
  goalPhase: GoalPhase = 'Lean Bulk'
): HypertrophyQueueRecommendation {
  const activeSplit: SplitDayType = (
    ['Push', 'Pull', 'Legs', 'Upper'].includes(activeSplitInput)
      ? activeSplitInput
      : getFirstSplitDayForProgram(programType)
  ) as SplitDayType;

  const completed = [...historicalWorkouts]
    .filter((w) => w.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastOverall = completed[0];
  const recommendedSplit: SplitDayType = lastOverall
    ? getNextSplitDay(lastOverall.splitDay, programType)
    : getFirstSplitDayForProgram(programType);
  const nextInQueue = getNextSplitDay(activeSplit, programType);

  const meta = SPLIT_RECOVERY_META[activeSplit] || SPLIT_RECOVERY_META.Push;
  const refDate = referenceDateStr
    ? new Date(`${referenceDateStr}T12:00:00Z`)
    : new Date();

  let daysSinceLastWorkoutOverall = 1;
  if (lastOverall?.date) {
    const lastDate = new Date(`${lastOverall.date}T12:00:00Z`);
    const diffDays = Math.round(
      (refDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    daysSinceLastWorkoutOverall = Math.max(1, diffDays);
  }

  const lastSameSplit = completed.find((w) => w.splitDay === activeSplit);
  let hoursSinceLastTargetStimulus = meta.recoveryWindowHours + 12;
  if (lastSameSplit?.date) {
    const sameDate = new Date(`${lastSameSplit.date}T12:00:00Z`);
    const diffHours = Math.round(
      (refDate.getTime() - sameDate.getTime()) / (1000 * 60 * 60)
    );
    hoursSinceLastTargetStimulus = Math.max(24, diffHours);
  }

  const recoveryPercentage = Math.min(
    100,
    Math.round((hoursSinceLastTargetStimulus / meta.recoveryWindowHours) * 100)
  );
  const isSkippedDayAdapted = daysSinceLastWorkoutOverall >= 2;

  const recoveryBadge =
    recoveryPercentage >= 100
      ? `${meta.targetMuscles.split(',')[0]} & Synergists 100% Recovered`
      : `${recoveryPercentage}% Muscle Recovery (${hoursSinceLastTargetStimulus}h / ${meta.recoveryWindowHours}h)`;

  let scienceRationale: string;
  const targetLabel = meta.targetMuscles.toLowerCase();
  const lastSessionName = lastOverall?.splitDay || 'previous';

  if (goalPhase === 'Cut / Recomp') {
    scienceRationale = isSkippedDayAdapted
      ? `Retention Shield: Not tied to a calendar: after ${daysSinceLastWorkoutOverall} rest days since ${lastSessionName}, your ${targetLabel} are fully glycogen-replenished. In a caloric deficit, holding working weights at 1–2 RIR preserves 100% of your muscle mass.`
      : `Retention Shield: Up next after ${lastSessionName}. Your ${targetLabel} have rested ${hoursSinceLastTargetStimulus}h+ (${meta.recoveryWindowHours}h optimal window). In a caloric deficit, focus on high mechanical tension to protect muscle while burning fat.`;
  } else if (goalPhase === 'Maingain') {
    scienceRationale = isSkippedDayAdapted
      ? `Recomposition Focus: Not tied to a calendar: after ${daysSinceLastWorkoutOverall} rest days, your ${targetLabel} are ready to train. Focus on clean technique, density, and steady Work Capacity Index (WCI) progression.`
      : `Recomposition Focus: Up next after ${lastSessionName}. Your ${targetLabel} have had ${hoursSinceLastTargetStimulus}h+ of recovery (${meta.recoveryWindowHours}h target). Ready for steady progressive overload.`;
  } else {
    scienceRationale = isSkippedDayAdapted
      ? `Hypertrophy Wave: Not tied to a calendar: after ${daysSinceLastWorkoutOverall} rest days since ${lastSessionName}, your ${targetLabel} are 100% recharged. Full caloric surplus fuels progressive overload across your working sets.`
      : `Hypertrophy Wave: Up next after ${lastSessionName}. Your ${targetLabel} have had ${hoursSinceLastTargetStimulus}h+ of rest (${meta.recoveryWindowHours}h optimal window). Full caloric surplus fuels progressive overload and muscle growth.`;
  }

  return {
    activeSplit,
    recommendedSplit,
    nextInQueue,
    targetMuscles: meta.targetMuscles,
    requiredRecoveryHours: meta.recoveryWindowHours,
    hoursSinceLastTargetStimulus,
    daysSinceLastWorkoutOverall,
    recoveryPercentage,
    isSkippedDayAdapted,
    recoveryBadge,
    scienceRationale,
  };
}


/**
 * Adapts an active WorkoutSession to a target TrainingLocation ('gym' | 'home' | 'travel')
 * and available home equipment, substituting exercises within the exact same Biomechanical
 * Movement Family while carrying over longitudinal strength progression.
 */
export function adaptWorkoutSessionToLocation(
  session: WorkoutSession,
  location: TrainingLocation,
  homeEquipment: HomeEquipmentTag[] = ['bench', 'dumbbells', 'trx', 'pullup_bar'],
  exerciseCatalog: ExerciseDefinition[],
  historicalWorkouts: WorkoutSession[] = [],
  readinessState: ReadinessState = 'Normal',
  bodyweightEmaKg: number = 81.5
): WorkoutSession {
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const splitKey = (session.splitDay as SplitDayType) || 'Push';
  const gymTemplate = SPLIT_TEMPLATES[splitKey] || SPLIT_TEMPLATES.Push;
  const usedIds = new Set<string>();

  const adaptedExercises: ExerciseSession[] = session.exercises.map((ex, idx) => {
    const currentDef = exMap.get(ex.exerciseId);
    const movementVector = getMovementVectorId(currentDef || ex);
    const familyLabel = getMovementFamilyLabel(currentDef || ex);

    // Determine best candidate ExerciseDefinition for this slot & location
    let targetDef: ExerciseDefinition | undefined = currentDef;

    if (location === 'gym') {
      // If returning to Gym, prefer the canonical Gym template exercise for this slot if same movement family
      const templateItem = gymTemplate.exercises[idx];
      const templateDef = templateItem ? exMap.get(templateItem.exerciseId) : undefined;
      if (templateDef && getMovementVectorId(templateDef) === movementVector && !usedIds.has(templateDef.id)) {
        targetDef = templateDef;
      } else if (!currentDef || !canPerformExerciseInLocation(currentDef, 'gym', homeEquipment) || usedIds.has(currentDef.id)) {
        const gymCandidates = exerciseCatalog.filter(
          (d) =>
            getMovementVectorId(d) === movementVector &&
            canPerformExerciseInLocation(d, 'gym', homeEquipment)
        );
        targetDef = gymCandidates.find((d) => !usedIds.has(d.id)) || gymCandidates[0] || currentDef;
      }
    } else if (location === 'home') {
      const homeCandidates = exerciseCatalog.filter(
        (d) =>
          getMovementVectorId(d) === movementVector &&
          canPerformExerciseInLocation(d, 'home', homeEquipment)
      );
      // Prefer loaded home equipment (dumbbells / weighted_bodyweight / trx) before pure bodyweight
      const sortedHome = [...homeCandidates].sort((a, b) => {
        const aLoaded = (a.requiredHomeEquipment?.length || 0) > 0 ? 1 : 0;
        const bLoaded = (b.requiredHomeEquipment?.length || 0) > 0 ? 1 : 0;
        return bLoaded - aLoaded;
      });
      targetDef = sortedHome.find((d) => !usedIds.has(d.id)) || sortedHome[0] || currentDef;
    } else {
      // location === 'travel' — prioritize zero-equipment bodyweight movements first
      const travelCandidates = exerciseCatalog.filter(
        (d) =>
          getMovementVectorId(d) === movementVector &&
          canPerformExerciseInLocation(d, 'travel', homeEquipment)
      );
      const sortedTravel = [...travelCandidates].sort((a, b) => {
        const aPureBw = (!a.requiredHomeEquipment || a.requiredHomeEquipment.length === 0) ? 1 : 0;
        const bPureBw = (!b.requiredHomeEquipment || b.requiredHomeEquipment.length === 0) ? 1 : 0;
        return bPureBw - aPureBw;
      });
      targetDef = sortedTravel.find((d) => !usedIds.has(d.id)) || sortedTravel[0];
      if (!targetDef) {
        // Fallback within pillar if no exact vector match for travel
        const pillarTravelCandidates = exerciseCatalog.filter(
          (d) => d.pillar === ex.pillar && canPerformExerciseInLocation(d, 'travel', homeEquipment)
        );
        targetDef = pillarTravelCandidates.find((d) => !usedIds.has(d.id)) || pillarTravelCandidates[0];
      }
      if (!targetDef) {
        // Absolute fallback: any valid travel exercise in catalog
        const anyTravelCandidates = exerciseCatalog.filter((d) =>
          canPerformExerciseInLocation(d, 'travel', homeEquipment)
        );
        targetDef = anyTravelCandidates.find((d) => !usedIds.has(d.id)) || anyTravelCandidates[0];
      }
    }

    if (!targetDef) {
      return ex;
    }

    usedIds.add(targetDef.id);

    const isPureBw =
      (targetDef.equipment === 'bodyweight' && !targetDef.isWeightedCalisthenic) ||
      location === 'travel';

    // If exercise didn't change, ensure sets match travel bodyweight constraints
    if (targetDef.id === ex.exerciseId) {
      if (isPureBw) {
        return {
          ...ex,
          equipment: 'bodyweight',
          isWeightedCalisthenic: false,
          movementFamily: movementVector,
          movementFamilyLabel: familyLabel,
          sets: ex.sets
            .filter((s) => !s.isWarmup && s.setType !== 'warmup')
            .map((s, sIdx) => ({
              ...s,
              setNumber: sIdx + 1,
              targetWeightKg: 0,
              actualWeightKg: s.completed ? s.actualWeightKg : 0,
              isWarmup: false,
              setType: 'working',
            })),
        };
      }
      return {
        ...ex,
        movementFamily: movementVector,
        movementFamilyLabel: familyLabel,
      };
    }

    const meta = getExerciseBiomechanicalMeta(targetDef);
    const firstWorkingSet =
      ex.sets.find((s) => !s.isWarmup && s.setType !== 'warmup') ?? ex.sets[0];
    const sourceWeight = firstWorkingSet?.actualWeightKg ?? firstWorkingSet?.targetWeightKg ?? 40;

    const translatedWeight = isPureBw
      ? 0
      : translateWeightBetweenImplements(
          sourceWeight,
          {
            equipment: ex.equipment,
            isRdl: ex.isRdl,
            isWeightedCalisthenic: ex.isWeightedCalisthenic,
            exerciseId: ex.exerciseId,
            pillar: ex.pillar,
          },
          {
            equipment: targetDef.equipment,
            isRdl: targetDef.isRdl,
            isWeightedCalisthenic: targetDef.isWeightedCalisthenic,
            exerciseId: targetDef.id,
            pillar: targetDef.pillar,
          },
          bodyweightEmaKg
        );

    const candidateSession: ExerciseSession = {
      ...ex,
      exerciseId: targetDef.id,
      name: targetDef.name,
      pillar: targetDef.pillar,
      equipment: isPureBw ? 'bodyweight' : targetDef.equipment,
      isRdl: targetDef.isRdl,
      isWeightedCalisthenic: isPureBw ? false : targetDef.isWeightedCalisthenic,
      isIsolation: meta.isIsolation,
      movementFamily: movementVector,
      movementFamilyLabel: familyLabel,
      resistanceProfile: meta.resistanceProfile,
      sfrScore: meta.sfrScore,
      minReps: targetDef.defaultRepRange[0],
      maxReps: targetDef.defaultRepRange[1],
      notes: targetDef.whyItWorks || ex.notes,
      sets: ex.sets,
    };

    const prescription = prescribeDoubleProgression(
      candidateSession,
      readinessState,
      historicalWorkouts,
      bodyweightEmaKg
    );

    // Compute source E1RM from ex's working sets to carry over scheduled mechanical tension
    let sourceE1rm = 0;
    for (const s of ex.sets) {
      if (s.isWarmup || s.setType === 'warmup') continue;
      const w = s.actualWeightKg ?? s.targetWeightKg;
      const r = s.actualReps ?? s.targetReps;
      const rir = s.actualRir ?? s.targetRir ?? 2;
      const e1rm = calculateE1RM(
        w,
        r,
        rir,
        ex.equipment,
        ex.isRdl,
        ex.isWeightedCalisthenic,
        bodyweightEmaKg,
        ex.exerciseId,
        ex.pillar
      );
      if (e1rm > sourceE1rm) sourceE1rm = e1rm;
    }
    const effectiveE1rm = Math.max(sourceE1rm, prescription.canonicalE1rmKg || 0);

    let bwPrescription: ReturnType<typeof calculateHypertrophyBodyweightReps> | undefined;
    if (isPureBw) {
      bwPrescription = calculateHypertrophyBodyweightReps(
        effectiveE1rm,
        bodyweightEmaKg,
        targetDef.id,
        targetDef.pillar,
        targetDef.defaultRepRange[0],
        targetDef.defaultRepRange[1]
      );
    }

    let calibratedSets: WorkoutSet[];
    const workingSetsOnly = candidateSession.sets.filter(
      (s) => !s.isWarmup && s.setType !== 'warmup'
    );

    if (isPureBw) {
      // Pure bodyweight movements start directly with working sets (0 warmup sets)
      calibratedSets = workingSetsOnly.map((s, workingIdx) => {
        const nextReps = bwPrescription
          ? bwPrescription.targetReps
          : (prescription.nextTargetReps[workingIdx] ?? targetDef.defaultRepRange[0]);
        return {
          ...s,
          setNumber: workingIdx + 1,
          targetWeightKg: 0,
          actualWeightKg: s.completed ? s.actualWeightKg : 0,
          targetReps: nextReps,
          actualReps: s.completed ? s.actualReps : nextReps,
          isWarmup: false,
          setType: 'working',
        };
      });
    } else {
      // Loaded implements: generate appropriate warmup sets
      const isFirstCompound = isFirstCompoundForPillar(
        candidateSession,
        idx,
        session.exercises
      );
      let warmupSets: WorkoutSet[] = [];
      if (!meta.isIsolation) {
        const warmupPrescription = calculateWarmupPrescription(
          candidateSession,
          prescription.nextWeightKg,
          isFirstCompound
        );
        warmupSets = generateWarmupSets(candidateSession.exerciseId, warmupPrescription);
      }

      calibratedSets = [
        ...warmupSets,
        ...workingSetsOnly.map((s, workingIdx) => {
          const nextReps = prescription.nextTargetReps[workingIdx] ?? targetDef.defaultRepRange[0];
          return {
            ...s,
            setNumber: workingIdx + 1,
            targetWeightKg: prescription.nextWeightKg,
            actualWeightKg: s.completed ? s.actualWeightKg : prescription.nextWeightKg,
            targetReps: nextReps,
            actualReps: s.completed ? s.actualReps : nextReps,
          };
        }),
      ];
    }

    const calibratedNotes = isPureBw && bwPrescription
      ? `${bwPrescription.explanation}${bwPrescription.tempoCue ? ` (${bwPrescription.tempoCue})` : ''}`
      : isPureBw && prescription.reason
      ? prescription.reason
      : candidateSession.notes;

    return {
      ...candidateSession,
      notes: calibratedNotes,
      sets: calibratedSets,
    };
  });

  return {
    ...session,
    location,
    exercises: adaptedExercises,
  };
}

/**
 * Generates an evidence-based workout session dynamically calibrated to:
 * 1. The athlete's historical Double Progression performance for each lift
 * 2. The current Mesocycle Week (W1 MEV -> W5 MRV -> W6 Deload)
 * 3. Morning Pixel Watch Readiness state (Primed / Normal / Amber Shield)
 * 4. Active Training Location ('gym' | 'home' | 'travel') & Equipment Profile
 */
export function generateSmartWorkoutSession(
  splitDay: SplitDayType,
  historicalWorkouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  readinessState: ReadinessState = 'Normal',
  mesocycleWeek: number = 3,
  location: TrainingLocation = 'gym',
  homeEquipment: HomeEquipmentTag[] = ['bench', 'dumbbells', 'trx', 'pullup_bar'],
  goalPhase: GoalPhase = 'Lean Bulk',
  bodyweightEmaKg: number = 81.5,
  scheduledWeekLocations?: Record<number, TrainingLocation>,
  includeWarmups: boolean = true
): WorkoutSession {
  const template = SPLIT_TEMPLATES[splitDay] || SPLIT_TEMPLATES.Push;
  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const todayStr = localDateString();

  // Determine target RIR & set count modifier by Mesocycle Week (RP Periodization Wave)
  let baseRir = 2;
  let finalSetRir = 1;
  let setDelta = 0;

  if (mesocycleWeek === 1) {
    baseRir = 3;
    finalSetRir = 2;
    setDelta = -1; // MEV intro
  } else if (mesocycleWeek === 2) {
    baseRir = 2;
    finalSetRir = 2;
    setDelta = 0; // Early MAV
  } else if (mesocycleWeek === 3) {
    baseRir = 2;
    finalSetRir = 1;
    setDelta = 0; // Core MAV
  } else if (mesocycleWeek === 4) {
    baseRir = 1;
    finalSetRir = 1;
    setDelta = 1; // High MAV
  } else if (mesocycleWeek === 5) {
    baseRir = 1;
    finalSetRir = 0;
    setDelta = 1; // Near MRV overreaching
  } else if (mesocycleWeek === 6) {
    baseRir = 4;
    finalSetRir = 3;
    setDelta = -1; // Planned Deload (MV)
  }

  // Amber Shield overrides RIR to conservative 2-3 RIR
  if (readinessState === 'Amber Shield') {
    baseRir = Math.max(baseRir, 3);
    finalSetRir = Math.max(finalSetRir, 2);
  }

  const exercises: ExerciseSession[] = template.exercises.map((item, exIdx) => {
    const def = exMap.get(item.exerciseId);
    const minReps = def?.defaultRepRange[0] ?? 8;
    const maxReps = def?.defaultRepRange[1] ?? 12;
    const meta = def
      ? getExerciseBiomechanicalMeta(def)
      : {
          isIsolation: false,
          resistanceProfile: 'mid' as const,
          sfrScore: 8.0,
        };

    // Calibrate set count for this mesocycle week & goal phase
    // In Cut / Recomp, caloric deficit limits systemic recovery; volume is scaled to ~85% (Helms et al., 2014)
    let targetSetCount: number;
    if (mesocycleWeek === 6) {
      targetSetCount = 2; // Planned Deload at Maintenance Volume
    } else if (goalPhase === 'Cut / Recomp') {
      // Retention Shield: 2-3 working sets per exercise to maintain high mechanical tension without catabolic fatigue
      targetSetCount = item.highVolumeResponder && mesocycleWeek >= 3 ? 3 : 2;
    } else if (goalPhase === 'Maingain') {
      // Consistent MAV sweet spot
      targetSetCount = item.highVolumeResponder ? 4 : 3;
    } else {
      // Lean Bulk: Progressive volume wave from MEV (W1: 2-3 sets) -> MAV (W2-4: 3-4 sets) -> Peak MRV (W5: 4-5 sets)
      targetSetCount = Math.max(
        2,
        Math.min(
          item.highVolumeResponder ? 5 : 4,
          item.baseSets + (item.highVolumeResponder && mesocycleWeek >= 3 ? Math.max(0, setDelta) : Math.min(1, Math.max(0, setDelta)))
        )
      );
    }

    // Seed dummy session to query historical Double Progression
    const seedSets: WorkoutSet[] = Array.from({ length: targetSetCount }, (_, sIdx) => ({
      id: `set-${Date.now()}-${exIdx}-${sIdx}`,
      setNumber: sIdx + 1,
      targetWeightKg: item.defaultWeightKg,
      targetReps: minReps,
      targetRir: sIdx === targetSetCount - 1 ? finalSetRir : baseRir,
      completed: false,
      setType: 'working',
    }));

    const seedSession: ExerciseSession = {
      id: `active-ex-${exIdx + 1}-${Date.now()}`,
      exerciseId: item.exerciseId,
      name: def?.name || item.exerciseId,
      pillar: def?.pillar || 'Horizontal Push',
      equipment: def?.equipment || 'barbell',
      isRdl: def?.isRdl,
      isWeightedCalisthenic: def?.isWeightedCalisthenic,
      isIsolation: meta.isIsolation,
      movementFamily: def ? getMovementVectorId(def) : undefined,
      movementFamilyLabel: def ? getMovementFamilyLabel(def) : undefined,
      resistanceProfile: meta.resistanceProfile,
      sfrScore: meta.sfrScore,
      minReps,
      maxReps,
      // Controlled 2-second lowering on every lift (matches the coaching cues); powers the tempo guide.
      tempo: '2010',
      notes:
        goalPhase === 'Cut / Recomp'
          ? `${item.notes} • Retention Shield: Hold high tension at 1–2 RIR to signal muscle preservation.`
          : item.notes,
      sets: seedSets,
    };

    const prescription = prescribeDoubleProgression(
      seedSession,
      readinessState,
      historicalWorkouts,
      bodyweightEmaKg,
      goalPhase
    );

    // Deload week reduces working weight by ~10% on compounds to unload joints
    const deloadFactor = mesocycleWeek === 6 && !meta.isIsolation ? 0.9 : 1.0;
    const prescribedWeight =
      Math.round(((prescription.nextWeightKg || item.defaultWeightKg) * deloadFactor) / 2.5) * 2.5 ||
      prescription.nextWeightKg;

    const calibratedSets: WorkoutSet[] = seedSets.map((s, idx) => ({
      ...s,
      targetWeightKg: prescribedWeight,
      actualWeightKg: prescribedWeight,
      targetReps: prescription.nextTargetReps[idx] ?? minReps,
      actualReps: prescription.nextTargetReps[idx] ?? minReps,
      targetRir: idx === targetSetCount - 1 ? finalSetRir : baseRir,
    }));

    let warmupSets: WorkoutSet[] = [];
    if (includeWarmups && mesocycleWeek !== 6 && !seedSession.isIsolation) {
      const isFirstCompound = isFirstCompoundForPillar(
        seedSession,
        exIdx,
        template.exercises.map((t) => {
          const d = exMap.get(t.exerciseId);
          return {
            pillar: d?.pillar || 'Horizontal Push',
            isIsolation: d ? getExerciseBiomechanicalMeta(d).isIsolation : false,
            equipment: d?.equipment,
            isWeightedCalisthenic: d?.isWeightedCalisthenic,
            name: d?.name,
            exerciseId: t.exerciseId,
          };
        })
      );

      const warmupPrescription = calculateWarmupPrescription(
        seedSession,
        prescribedWeight,
        isFirstCompound
      );
      warmupSets = generateWarmupSets(seedSession.exerciseId, warmupPrescription);
    }

    return {
      ...seedSession,
      sets: [...warmupSets, ...calibratedSets],
    };
  });

  const baseSession: WorkoutSession = {
    id: `active-workout-${splitDay.toLowerCase()}-${Date.now()}`,
    date: todayStr,
    name: template.sessionTitle,
    splitDay,
    completed: false,
    readinessState,
    readinessZScore: readinessState === 'Primed' ? 1.15 : readinessState === 'Amber Shield' ? -1.1 : 0.25,
    location: 'gym',
    exercises,
  };

  const effectiveLocation =
    scheduledWeekLocations && scheduledWeekLocations[mesocycleWeek]
      ? scheduledWeekLocations[mesocycleWeek]
      : location;

  if (effectiveLocation !== 'gym') {
    return adaptWorkoutSessionToLocation(
      baseSession,
      effectiveLocation,
      homeEquipment,
      exerciseCatalog,
      historicalWorkouts,
      readinessState,
      bodyweightEmaKg
    );
  }

  return baseSession;
}
