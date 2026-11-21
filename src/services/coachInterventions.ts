import { ActivityLog } from '../engine/activeDays';
import { AthleteKnowledgeGraph, buildAthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { isActiveSlot, TrainingPlan } from '../engine/muscleBuildingProgram';
import { previewProgramOverrides } from '../engine/programOverrides';
import { standardsAge } from '../engine/strengthStandards';
import { resolveActivePlan } from '../engine/trainingPlans';
import {
  BiometricLog,
  DismissedCoachIntervention,
  ExerciseDefinition,
  ProgramExerciseOverride,
  ReadinessState,
  StrengthPillar,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import { MUSCLE_FRIENDLY_NAMES } from '../engine/recovery';
import { deriveContraindicationEdges, detectStalledExerciseIds } from './coachContextEnvelope';
import { MOVEMENT_NAME, buildMovementStandards } from './movementStandards';
import { MUSCLE_TO_GRAPH_KEY } from './sessionReport';

export type CoachInterventionKind =
  | 'contraindication_conflict'
  | 'pull_push_imbalance'
  | 'unilateral_asymmetry'
  | 'strength_level_gap'
  | 'exercise_plateau'
  | 'volume_gap';

export interface ProposedProgramChange {
  kind: ProgramExerciseOverride['kind'];
  targetExerciseId?: string;
  targetExerciseName?: string;
  replacementExerciseId?: string;
  replacementExerciseName?: string;
  replacementPillar?: ExerciseDefinition['pillar'];
  replacementEquipment?: ExerciseDefinition['equipment'];
  replacementRepRange?: [number, number];
  replacementIsTimed?: boolean;
  replacementDurationSeconds?: number;
  sets?: number;
  setDelta?: number;
  workoutFilter?: string;
  reason?: string;
  humanSummary: string;
}

export interface CoachIntervention {
  id: string;
  kind: CoachInterventionKind;
  priority: 'high' | 'medium';
  surface: 'balance' | 'exercise' | 'program' | 'workout';
  badgeLabel: string;
  title: string;
  rationale: string;
  ctaLabel: string;
  coachPrompt: string;
  exerciseId?: string;
  pillar?: StrengthPillar;
  remainingAffectedCount: number;
  totalAffectedCount: number;
  affectedTitles: string[];
  proposedChanges: ProposedProgramChange[];
}

export interface DetectCoachInterventionsInput {
  profile: UserProfile;
  activeWorkout?: WorkoutSession;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  weeklyVolume?: Record<string, number>;
  activities?: ActivityLog[];
  knowledgeGraph?: AthleteKnowledgeGraph;
  trainingPlan?: TrainingPlan;
  /** When true, includes suggestions the athlete previously dismissed (default: false). */
  includeDismissed?: boolean;
}

/** True when a deterministic intervention id was dismissed for this plan (or globally). */
export function isInterventionDismissed(
  dismissed: DismissedCoachIntervention[] | undefined,
  interventionId: string,
  planId: string
): boolean {
  if (!dismissed || dismissed.length === 0) return false;
  return dismissed.some((d) => d.id === interventionId && (!d.planId || d.planId === planId));
}

/**
 * Converts a suggested CoachIntervention into concrete persistent ProgramExerciseOverride objects
 * ready to save on UserProfile and apply across the active plan and queued workout.
 */
export function buildOverridesForIntervention(
  intervention: CoachIntervention,
  planId: TrainingPlan['id'],
  now: Date = new Date()
): ProgramExerciseOverride[] {
  const stamp = now.toISOString();
  const baseId = `ov-accept-${intervention.id}-${now.getTime()}`;
  return intervention.proposedChanges.map((c, idx) => ({
    id: `${baseId}-${idx}`,
    planId,
    kind: c.kind,
    targetExerciseId: c.targetExerciseId,
    targetExerciseName: c.targetExerciseName,
    replacementExerciseId: c.replacementExerciseId,
    replacementExerciseName: c.replacementExerciseName,
    replacementPillar: c.replacementPillar,
    replacementEquipment: c.replacementEquipment,
    replacementRepRange: c.replacementRepRange,
    replacementIsTimed: c.replacementIsTimed,
    replacementDurationSeconds: c.replacementDurationSeconds,
    sets: c.sets,
    setDelta: c.setDelta,
    workoutFilter: c.workoutFilter,
    reason: c.reason,
    createdAt: stamp,
  }));
}

/** Returns a profile patch that persists dismissing a suggestion for the active plan across all surfaces. */
export function dismissCoachIntervention(
  profile: Pick<UserProfile, 'dismissedInterventions'>,
  interventionId: string,
  planId: string,
  now: Date = new Date()
): Pick<UserProfile, 'dismissedInterventions'> {
  const existing = profile.dismissedInterventions ?? [];
  if (isInterventionDismissed(existing, interventionId, planId)) {
    return { dismissedInterventions: existing };
  }
  return {
    dismissedInterventions: [
      ...existing,
      {
        id: interventionId,
        planId,
        dismissedAt: now.toISOString(),
      },
    ],
  };
}

/** Restores a previously dismissed suggestion (used by 1-tap Undo after dismissal). */
export function undismissCoachIntervention(
  profile: Pick<UserProfile, 'dismissedInterventions'>,
  interventionId: string,
  planId?: string
): Pick<UserProfile, 'dismissedInterventions'> {
  const next = (profile.dismissedInterventions ?? []).filter(
    (d) => !(d.id === interventionId && (!planId || !d.planId || d.planId === planId))
  );
  return {
    dismissedInterventions: next.length > 0 ? next : undefined,
  };
}

/** Removes a single accepted program override cleanly. */
export function removeProgramOverride(
  profile: Pick<UserProfile, 'programOverrides'>,
  overrideId: string
): Pick<UserProfile, 'programOverrides'> {
  const next = (profile.programOverrides ?? []).filter((ov) => ov.id !== overrideId);
  return {
    programOverrides: next.length > 0 ? next : undefined,
  };
}

/** Clears all accepted program overrides for the given plan while preserving overrides on other plans. */
export function clearPlanProgramOverrides(
  profile: Pick<UserProfile, 'programOverrides'>,
  planId: string
): Pick<UserProfile, 'programOverrides'> {
  const next = (profile.programOverrides ?? []).filter((ov) => ov.planId && ov.planId !== planId);
  return {
    programOverrides: next.length > 0 ? next : undefined,
  };
}

const BILATERAL_TO_UNILATERAL_FALLBACKS: Record<string, string[]> = {
  'ex-bench-press': ['ex-flat-db-press', 'ex-db-bench-press'],
  'ex-guillotine-press': ['ex-db-bench-press', 'ex-flat-db-press'],
  'ex-barbell-row': ['ex-single-arm-db-row', 'ex-chest-supported-db-row'],
  'ex-reverse-bb-row': ['ex-single-arm-db-row', 'ex-chest-supported-db-row'],
  'ex-barbell-squat': ['ex-bulgarian-split-squat', 'ex-db-step-up'],
  'ex-leg-press': ['ex-bulgarian-split-squat', 'ex-db-step-up'],
  'ex-rdl': ['ex-single-leg-db-rdl', 'ex-db-rdl'],
  'ex-deadlift': ['ex-single-leg-db-rdl', 'ex-db-rdl'],
  'ex-ohp': ['ex-arnold-press', 'ex-db-shoulder-press'],
};

function fitsEnvironment(def: ExerciseDefinition, profile: UserProfile): boolean {
  const loc = profile.activeLocation ?? 'gym';
  if (def.environments && !def.environments.includes(loc)) return false;
  if (loc === 'home' && def.requiredHomeEquipment?.length) {
    const equip = profile.homeEquipment ?? [];
    return def.requiredHomeEquipment.every((req) => equip.includes(req));
  }
  return true;
}

function toCandidateOverrides(planId: TrainingPlan['id'], changes: ProposedProgramChange[]): ProgramExerciseOverride[] {
  const now = new Date().toISOString();
  return changes.map((c, idx) => ({
    id: `preview-${planId}-${idx}`,
    planId,
    kind: c.kind,
    targetExerciseId: c.targetExerciseId,
    targetExerciseName: c.targetExerciseName,
    replacementExerciseId: c.replacementExerciseId,
    replacementExerciseName: c.replacementExerciseName,
    replacementPillar: c.replacementPillar,
    replacementEquipment: c.replacementEquipment,
    replacementRepRange: c.replacementRepRange,
    replacementIsTimed: c.replacementIsTimed,
    replacementDurationSeconds: c.replacementDurationSeconds,
    sets: c.sets,
    setDelta: c.setDelta,
    workoutFilter: c.workoutFilter,
    reason: c.reason,
    createdAt: now,
  }));
}

function findSafeReplacement(
  targetId: string,
  targetPillar: StrengthPillar,
  catalog: ExerciseDefinition[],
  profile: UserProfile,
  avoidIds: Set<string>,
  preferSameMuscle?: string,
  preferIsolation?: boolean
): ExerciseDefinition | undefined {
  return (
    catalog.find(
      (d) =>
        d.id !== targetId &&
        !avoidIds.has(d.id) &&
        fitsEnvironment(d, profile) &&
        d.pillar === targetPillar &&
        (!preferSameMuscle || d.primaryMuscle === preferSameMuscle)
    ) ??
    catalog.find(
      (d) =>
        d.id !== targetId &&
        !avoidIds.has(d.id) &&
        fitsEnvironment(d, profile) &&
        d.pillar === targetPillar
    ) ??
    // When an entire movement pillar is marked contraindicated (e.g., overhead shoulder, squat knee, lumbar hinge),
    // fall back to a non-avoided movement targeting adjacent/joint-friendly stimulus in the athlete's environment.
    catalog.find(
      (d) =>
        d.id !== targetId &&
        !avoidIds.has(d.id) &&
        fitsEnvironment(d, profile) &&
        ((preferSameMuscle && d.primaryMuscle === preferSameMuscle) ||
          (targetPillar === 'Vertical Push' &&
            (preferIsolation
              ? d.id === 'ex-face-pull' || d.primaryMuscle === 'Rear Delts'
              : d.id === 'ex-db-floor-press' || d.id === 'ex-face-pull' || d.primaryMuscle === 'Rear Delts')) ||
          (targetPillar === 'Squat' && (d.id === 'ex-glute-bridge' || (d.pillar === 'Hinge' && !d.isRdl))) ||
          (targetPillar === 'Hinge' && d.id === 'ex-leg-curl'))
    )
  );
}

/**
 * Computes deterministic, science-grounded human-in-the-loop (HITL) program interventions across
 * OOUX surfaces (Program, Balance, Exercise Detail, Coach Chat). Returns [] when there is no
 * real signal — zero fabricated recommendations or clutter.
 */
export function detectCoachInterventions(input: DetectCoachInterventionsInput): CoachIntervention[] {
  const { profile, workouts, biometrics, exerciseCatalog, bodyweightEmaKg, weeklyVolume = {}, activities = [] } = input;
  const plan = input.trainingPlan ?? resolveActivePlan(profile);
  const kg =
    input.knowledgeGraph ??
    buildAthleteKnowledgeGraph(workouts, biometrics, exerciseCatalog, profile, weeklyVolume, activities);

  const hasBw = biometrics.some((b) => (b.bodyweightKg || 0) > 0);
  const planOverrides = (profile.programOverrides ?? []).filter(
    (ov) => !ov.planId || ov.planId === plan.id
  );
  const verticalPullIds = new Set(
    exerciseCatalog.filter((d) => d.pillar === 'Vertical Pull').map((d) => d.id)
  );
  const stdReport = buildMovementStandards({
    workouts,
    biometrics,
    bodyweightKg: bodyweightEmaKg,
    gender: profile.gender,
    age: standardsAge(profile),
  });

  const liftingTemplates = plan.templates.filter((t) => !isActiveSlot(t));
  const planExerciseIds = new Set(liftingTemplates.flatMap((t) => t.exercises.map((e) => e.exerciseId)));
  const contraEdges = deriveContraindicationEdges(profile.athleteMemories ?? [], exerciseCatalog, kg);
  const avoidIds = new Set(contraEdges.filter((e) => e.severity === 'avoid').map((e) => e.to_exercise_id));

  const interventions: CoachIntervention[] = [];

  const registerIfEffective = (item: Omit<CoachIntervention, 'remainingAffectedCount' | 'totalAffectedCount' | 'affectedTitles'>) => {
    if (!input.includeDismissed && isInterventionDismissed(profile.dismissedInterventions, item.id, plan.id)) {
      return;
    }
    const preview = previewProgramOverrides(
      plan,
      toCandidateOverrides(plan.id, item.proposedChanges),
      workouts,
      profile.planCycleStarts
    );
    if (preview.totalAffectedCount === 0) return;
    interventions.push({
      ...item,
      remainingAffectedCount: preview.remainingAffectedCount,
      totalAffectedCount: preview.totalAffectedCount,
      affectedTitles: preview.affectedTitles,
    });
  };

  // 1. Saved injury/contraindication memory conflicting with upcoming program exercises
  for (const edge of contraEdges) {
    if (edge.severity !== 'avoid' || !planExerciseIds.has(edge.to_exercise_id)) continue;
    const def = exerciseCatalog.find((d) => d.id === edge.to_exercise_id);
    if (!def) continue;
    const replacement = findSafeReplacement(
      def.id,
      def.pillar,
      exerciseCatalog,
      profile,
      avoidIds,
      def.primaryMuscle,
      def.isIsolation
    );
    if (!replacement) continue;
    registerIfEffective({
      id: `contra-${def.id}`,
      kind: 'contraindication_conflict',
      priority: 'high',
      surface: 'program',
      badgeLabel: 'Safety fit',
      title: `Swap ${def.name} across ${plan.name}`,
      rationale: `${edge.reason}. Replacing it with ${replacement.name} keeps the same ${def.primaryMuscle.toLowerCase()} focus without aggravating the joint.`,
      ctaLabel: `Swap ${def.name} in program`,
      coachPrompt: `Swap ${def.name} for ${replacement.name} across my whole program because of ${edge.reason.toLowerCase()}`,
      exerciseId: def.id,
      pillar: def.pillar,
      proposedChanges: [
        {
          kind: 'swap_exercise',
          targetExerciseId: def.id,
          targetExerciseName: def.name,
          replacementExerciseId: replacement.id,
          replacementExerciseName: replacement.name,
          replacementPillar: replacement.pillar,
          replacementEquipment: replacement.equipment,
          replacementRepRange: replacement.defaultRepRange,
          replacementIsTimed: replacement.isTimed,
          replacementDurationSeconds: replacement.defaultDurationSeconds,
          reason: edge.reason,
          humanSummary: `${def.name} → ${replacement.name} (${edge.reason})`,
        },
      ],
    });
  }

  // 2. Poliquin Vertical Pull vs Bench imbalance
  const pullImb = stdReport.imbalances.find((i) => i.kind === 'pull-vs-push');
  const pullBalanceAlreadyAdapted = planOverrides.some(
    (ov) =>
      /pull/i.test(ov.reason || '') ||
      (ov.targetExerciseId &&
        verticalPullIds.has(ov.targetExerciseId) &&
        (ov.kind === 'adjust_sets' || ov.kind === 'prioritize_first')) ||
      (ov.replacementExerciseId &&
        verticalPullIds.has(ov.replacementExerciseId) &&
        ov.kind === 'add_exercise')
  );
  if (hasBw && pullImb && !pullBalanceAlreadyAdapted) {
    const pullPriorityTarget = liftingTemplates
      .flatMap((t) => t.exercises.slice(1))
      .find((e) => e.pillar === 'Vertical Pull');
    const latPulldownDef = exerciseCatalog.find((d) => d.id === 'ex-lat-pulldown');
    const chinupDef = exerciseCatalog.find((d) => d.id === 'ex-chinup');
    const bestPullDef =
      (latPulldownDef && fitsEnvironment(latPulldownDef, profile) && !avoidIds.has(latPulldownDef.id) ? latPulldownDef : undefined) ||
      (chinupDef && fitsEnvironment(chinupDef, profile) && !avoidIds.has(chinupDef.id) ? chinupDef : undefined) ||
      exerciseCatalog.find((d) => d.pillar === 'Vertical Pull' && fitsEnvironment(d, profile) && !avoidIds.has(d.id));

    const changes: ProposedProgramChange[] = [];
    if (pullPriorityTarget) {
      changes.push({
        kind: 'prioritize_first',
        targetExerciseId: pullPriorityTarget.exerciseId,
        targetExerciseName: pullPriorityTarget.name,
        reason: 'Poliquin pulling balance',
        humanSummary: `Move ${pullPriorityTarget.name} first when fresh`,
      });
      changes.push({
        kind: 'adjust_sets',
        targetExerciseId: pullPriorityTarget.exerciseId,
        targetExerciseName: pullPriorityTarget.name,
        setDelta: 1,
        reason: 'Poliquin pulling balance',
        humanSummary: `+1 set on ${pullPriorityTarget.name} across sessions`,
      });
    } else if (bestPullDef) {
      const existingPullInPlan = liftingTemplates
        .flatMap((t) => t.exercises)
        .find((e) => e.pillar === 'Vertical Pull');
      if (existingPullInPlan) {
        changes.push({
          kind: 'adjust_sets',
          targetExerciseId: existingPullInPlan.exerciseId,
          targetExerciseName: existingPullInPlan.name,
          setDelta: 1,
          reason: 'Poliquin pulling balance',
          humanSummary: `+1 set on ${existingPullInPlan.name}`,
        });
      }
      changes.push({
        kind: 'add_exercise',
        replacementExerciseId: bestPullDef.id,
        replacementExerciseName: bestPullDef.name,
        replacementPillar: bestPullDef.pillar,
        replacementEquipment: bestPullDef.equipment,
        replacementRepRange: bestPullDef.defaultRepRange,
        sets: 3,
        workoutFilter: 'upper_or_full',
        reason: 'Poliquin pulling balance',
        humanSummary: `Add ${bestPullDef.name} (3 sets) to upper/full-body workouts`,
      });
    }

    if (changes.length > 0) {
      registerIfEffective({
        id: 'imbalance-pull-vs-push',
        kind: 'pull_push_imbalance',
        priority: 'high',
        surface: 'balance',
        badgeLabel: 'Strength balance',
        title: 'Build vertical pulling across your program',
        rationale: `${pullImb.message} ${pullImb.advice}`,
        ctaLabel: 'Fix imbalance in program',
        coachPrompt: 'Rebalance my program for my pulling imbalance',
        pillar: 'Vertical Pull',
        proposedChanges: changes,
      });
    }
  }

  // 3. Left/Right unilateral asymmetry (< 90% LSI)
  for (const diff of stdReport.sideDifferences) {
    const loggedDef = exerciseCatalog.find((d) => d.id === diff.exerciseId);
    const targetPillar: StrengthPillar = loggedDef?.pillar ?? 'Horizontal Push';
    const matchingPlanEx = liftingTemplates
      .flatMap((t) => t.exercises)
      .find(
        (e) =>
          e.exerciseId === diff.exerciseId ||
          (e.pillar === targetPillar && Boolean(BILATERAL_TO_UNILATERAL_FALLBACKS[e.exerciseId]))
      );
    const symmetryAlreadyAdapted = planOverrides.some(
      (ov) =>
        /symmetry/i.test(ov.reason || '') &&
        (ov.targetExerciseId === (matchingPlanEx?.exerciseId ?? diff.exerciseId) ||
          ov.replacementExerciseId === (matchingPlanEx?.exerciseId ?? diff.exerciseId) ||
          ov.targetExerciseName === diff.exerciseName)
    );
    if (symmetryAlreadyAdapted) continue;
    const changes: ProposedProgramChange[] = [];
    if (matchingPlanEx && BILATERAL_TO_UNILATERAL_FALLBACKS[matchingPlanEx.exerciseId]) {
      const uniId = BILATERAL_TO_UNILATERAL_FALLBACKS[matchingPlanEx.exerciseId].find((candId) => {
        const candDef = exerciseCatalog.find((d) => d.id === candId);
        return candDef && !avoidIds.has(candDef.id) && fitsEnvironment(candDef, profile);
      });
      const uniDef = uniId ? exerciseCatalog.find((d) => d.id === uniId) : undefined;
      if (uniDef) {
        changes.push({
          kind: 'swap_exercise',
          targetExerciseId: matchingPlanEx.exerciseId,
          targetExerciseName: matchingPlanEx.name,
          replacementExerciseId: uniDef.id,
          replacementExerciseName: uniDef.name,
          replacementPillar: uniDef.pillar,
          replacementEquipment: uniDef.equipment,
          replacementRepRange: uniDef.defaultRepRange,
          reason: `${diff.weakerSide}-side ${diff.symmetryPct}% symmetry`,
          humanSummary: `${matchingPlanEx.name} → ${uniDef.name} so your ${diff.weakerSide} side sets the reps`,
        });
      }
    } else if (matchingPlanEx) {
      changes.push({
        kind: 'prioritize_first',
        targetExerciseId: matchingPlanEx.exerciseId,
        targetExerciseName: matchingPlanEx.name,
        reason: `${diff.weakerSide}-side symmetry (${diff.symmetryPct}%)`,
        humanSummary: `Move ${matchingPlanEx.name} earlier to lead with your ${diff.weakerSide} side`,
      });
    }

    if (changes.length > 0) {
      registerIfEffective({
        id: `symmetry-${diff.exerciseId}`,
        kind: 'unilateral_asymmetry',
        priority: 'medium',
        surface: 'balance',
        badgeLabel: 'Symmetry',
        title: `Address ${diff.weakerSide}-side ${diff.exerciseName} asymmetry`,
        rationale: `Your ${diff.weakerSide} side is at ${diff.symmetryPct}% of the stronger side. Unilateral or lead-side program placement helps both sides equalize cleanly.`,
        ctaLabel: 'Even out sides in program',
        coachPrompt: `Adapt my program to even out my ${diff.weakerSide}-side ${diff.exerciseName} asymmetry`,
        exerciseId: matchingPlanEx?.exerciseId ?? diff.exerciseId,
        pillar: targetPillar,
        proposedChanges: changes,
      });
    }
  }

  // 4. Kilgore full-level gap between movements
  for (const gap of stdReport.imbalances.filter((i) => i.kind === 'level-gap')) {
    const laterInWorkout = liftingTemplates
      .flatMap((t) => t.exercises.slice(1))
      .find((e) => e.pillar === gap.weaker);
    const anyInPillar = laterInWorkout ?? liftingTemplates.flatMap((t) => t.exercises).find((e) => e.pillar === gap.weaker);
    if (!anyInPillar) continue;
    const gapAlreadyAdapted = planOverrides.some(
      (ov) =>
        (/strength gap|behind/i.test(ov.reason || '') || ov.kind === 'adjust_sets' || ov.kind === 'prioritize_first') &&
        (ov.targetExerciseId === anyInPillar.exerciseId || ov.replacementExerciseId === anyInPillar.exerciseId)
    );
    if (gapAlreadyAdapted) continue;
    const changes: ProposedProgramChange[] = [];
    if (laterInWorkout) {
      changes.push({
        kind: 'prioritize_first',
        targetExerciseId: laterInWorkout.exerciseId,
        targetExerciseName: laterInWorkout.name,
        reason: `${MOVEMENT_NAME[gap.weaker]} behind ${MOVEMENT_NAME[gap.stronger].toLowerCase()}`,
        humanSummary: `Move ${laterInWorkout.name} to exercise #1 while fresh`,
      });
    } else {
      changes.push({
        kind: 'adjust_sets',
        targetExerciseId: anyInPillar.exerciseId,
        targetExerciseName: anyInPillar.name,
        setDelta: 1,
        reason: `Close ${MOVEMENT_NAME[gap.weaker].toLowerCase()} strength gap`,
        humanSummary: `+1 set on ${anyInPillar.name} across sessions`,
      });
    }
    registerIfEffective({
      id: `gap-${gap.weaker}`,
      kind: 'strength_level_gap',
      priority: 'medium',
      surface: 'balance',
      badgeLabel: 'Level gap',
      title: `Bring up ${MOVEMENT_NAME[gap.weaker].toLowerCase()} in ${plan.name}`,
      rationale: `${gap.message} ${gap.advice}`,
      ctaLabel: `Prioritize ${MOVEMENT_NAME[gap.weaker].split(' ')[0]} in program`,
      coachPrompt: `Adjust my program to bring up my ${MOVEMENT_NAME[gap.weaker].toLowerCase()} strength gap`,
      exerciseId: anyInPillar.exerciseId,
      pillar: gap.weaker,
      proposedChanges: changes,
    });
  }

  // 5. Plateaued exercises scheduled in the active program (3+ flat sessions)
  const stalledIds = detectStalledExerciseIds(workouts, biometrics, bodyweightEmaKg);
  for (const stalledId of stalledIds) {
    if (!planExerciseIds.has(stalledId)) continue;
    const def = exerciseCatalog.find((d) => d.id === stalledId);
    if (!def) continue;
    const freshVariation = findSafeReplacement(def.id, def.pillar, exerciseCatalog, profile, avoidIds, def.primaryMuscle);
    if (!freshVariation) continue;
    registerIfEffective({
      id: `plateau-${def.id}`,
      kind: 'exercise_plateau',
      priority: 'medium',
      surface: 'exercise',
      badgeLabel: 'Plateau',
      title: `Refresh stalled ${def.name} across ${plan.name}`,
      rationale: `${def.name} has been flat across your last 3 sessions. Switching to ${freshVariation.name} across remaining weeks adds a fresh ${def.primaryMuscle.toLowerCase()} stimulus.`,
      ctaLabel: `Rotate ${def.name} in program`,
      coachPrompt: `Swap stalled ${def.name} for ${freshVariation.name} across my whole program`,
      exerciseId: def.id,
      pillar: def.pillar,
      proposedChanges: [
        {
          kind: 'swap_exercise',
          targetExerciseId: def.id,
          targetExerciseName: def.name,
          replacementExerciseId: freshVariation.id,
          replacementExerciseName: freshVariation.name,
          replacementPillar: freshVariation.pillar,
          replacementEquipment: freshVariation.equipment,
          replacementRepRange: freshVariation.defaultRepRange,
          reason: 'break 3-session plateau',
          humanSummary: `${def.name} → ${freshVariation.name} across program`,
        },
      ],
    });
  }

  // 6. Chronic low weekly muscle sets (only once athlete has >= 3 recent completed sessions)
  const cutoff14d = Date.now() - 14 * 86400000;
  const recentCompletedCount = workouts.filter(
    (w) => w.completed && new Date(w.completedAt || w.date).getTime() >= cutoff14d
  ).length;
  if (recentCompletedCount >= 3) {
    const lowMuscle = kg.muscleProfiles
      .filter((m) => m.personalizedMav[0] >= 6 && m.weeklySets < Math.round(m.personalizedMav[0] * 0.5))
      .sort((a, b) => a.weeklySets / a.personalizedMav[0] - b.weeklySets / b.personalizedMav[0])[0];
    if (lowMuscle) {
      const planMatch = liftingTemplates
        .flatMap((t) => t.exercises)
        .find((e) => {
          const def = exerciseCatalog.find((d) => d.id === e.exerciseId);
          return def?.primaryMuscle && MUSCLE_TO_GRAPH_KEY[def.primaryMuscle] === lowMuscle.muscleKey;
        });
      if (planMatch) {
        const volumeAlreadyAdapted = planOverrides.some(
          (ov) =>
            ov.targetExerciseId === planMatch.exerciseId &&
            ov.kind === 'adjust_sets' &&
            (ov.setDelta ?? 0) > 0
        );
        if (!volumeAlreadyAdapted) {
          const def = exerciseCatalog.find((d) => d.id === planMatch.exerciseId);
          const label = (def?.primaryMuscle && MUSCLE_FRIENDLY_NAMES[def.primaryMuscle]) || lowMuscle.displayName;
          registerIfEffective({
            id: `volume-${lowMuscle.muscleKey}`,
            kind: 'volume_gap',
            priority: 'medium',
            surface: 'program',
            badgeLabel: 'Weekly volume',
            title: `Add ${label.toLowerCase()} sets across ${plan.name}`,
            rationale: `${lowMuscle.displayName} is at ${lowMuscle.weeklySets} of ${lowMuscle.personalizedMav[0]}–${lowMuscle.personalizedMav[1]} hard sets this week. Adding a set per session raises weekly stimulus cleanly.`,
            ctaLabel: `Add ${label.toLowerCase()} volume in program`,
            coachPrompt: `Adjust my program to add a working set on ${planMatch.name} across all sessions`,
            exerciseId: planMatch.exerciseId,
            pillar: planMatch.pillar,
            proposedChanges: [
              {
                kind: 'adjust_sets',
                targetExerciseId: planMatch.exerciseId,
                targetExerciseName: planMatch.name,
                setDelta: 1,
                reason: `raise ${lowMuscle.displayName.toLowerCase()} weekly sets toward MEV`,
                humanSummary: `+1 working set on ${planMatch.name} across sessions`,
              },
            ],
          });
        }
      }
    }
  }

  return interventions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return b.remainingAffectedCount - a.remainingAffectedCount;
  });
}
