import {
  ExerciseSession,
  ProgramExerciseOverride,
  WorkoutSession,
} from './types';
import {
  ProgramExerciseTemplate,
  ProgramWorkoutTemplate,
  TrainingPlan,
  isActiveSlot,
} from './muscleBuildingProgram';

function matchesTarget(
  ex: Pick<ProgramExerciseTemplate, 'exerciseId' | 'name'>,
  targetId?: string,
  targetName?: string
): boolean {
  if (targetId && ex.exerciseId === targetId) return true;
  if (targetName && ex.name.toLowerCase() === targetName.toLowerCase()) return true;
  return false;
}

export function matchesWorkoutTemplateFilter(tmpl: ProgramWorkoutTemplate, filter?: string): boolean {
  if (isActiveSlot(tmpl)) return false;
  const f = (filter || '').trim().toLowerCase();
  if (!f || f === 'all') return true;
  const title = tmpl.title.toLowerCase();
  const split = tmpl.splitDay.toLowerCase();
  if (f === 'upper_or_full') {
    return split !== 'legs' && !/legs/.test(title);
  }
  if (f === 'lower_or_full') {
    return split === 'legs' || /full\s*body|legs/.test(title);
  }
  const weekMatch = f.match(/^week\s*(\d+)$/i);
  if (weekMatch) return tmpl.week === parseInt(weekMatch[1], 10);
  if (f === 'upper') return split === 'upper' || /upper|chest|back|shoulder|arm|delt|push|pull|full/.test(title);
  if (f === 'lower' || f === 'legs') return split === 'legs' || /lower|legs|full/.test(title);
  return title.includes(f) || split.includes(f);
}

function defaultRepStringForOverride(
  override: ProgramExerciseOverride,
  existing?: ProgramExerciseTemplate
): { reps: string; tempo: string; durationSeconds?: number } {
  if (override.replacementIsTimed) {
    const secs = override.replacementDurationSeconds || 45;
    return { reps: '1', tempo: `${secs}sec`, durationSeconds: secs };
  }
  if (override.replacementRepRange && override.replacementRepRange.length === 2) {
    return {
      reps: `${override.replacementRepRange[0]}-${override.replacementRepRange[1]}`,
      tempo: existing && !existing.tempo.includes('sec') && !existing.tempo.includes('min') ? existing.tempo : '2010',
    };
  }
  return {
    reps: existing?.reps && !existing.tempo.includes('sec') ? existing.reps : '8-12',
    tempo: existing?.tempo && !existing.tempo.includes('sec') ? existing.tempo : '2010',
  };
}

function tidyLetterOrders(exercises: ProgramExerciseTemplate[]): ProgramExerciseTemplate[] {
  const simpleLetters = exercises.every((e) => /^[A-Z]$/.test(e.order));
  if (!simpleLetters) return exercises;
  return exercises.map((e, i) => ({ ...e, order: String.fromCharCode(65 + i) }));
}

function applySingleOverrideToTemplate(
  tmpl: ProgramWorkoutTemplate,
  override: ProgramExerciseOverride
): { template: ProgramWorkoutTemplate; changed: boolean } {
  if (!matchesWorkoutTemplateFilter(tmpl, override.workoutFilter)) {
    return { template: tmpl, changed: false };
  }

  let changed = false;
  let nextExercises = tmpl.exercises.map((e) => ({ ...e }));

  if (override.kind === 'swap_exercise' && override.replacementExerciseId && override.replacementExerciseName) {
    const hasReplacementAlready = nextExercises.some(
      (e) => e.exerciseId === override.replacementExerciseId
    );
    const updated: ProgramExerciseTemplate[] = [];
    for (const ex of nextExercises) {
      if (matchesTarget(ex, override.targetExerciseId, override.targetExerciseName)) {
        changed = true;
        if (hasReplacementAlready && ex.exerciseId !== override.replacementExerciseId) {
          // Avoid duplicating the replacement lift in the same workout template.
          continue;
        }
        const repInfo = defaultRepStringForOverride(override, ex);
        updated.push({
          ...ex,
          exerciseId: override.replacementExerciseId,
          name: override.replacementExerciseName,
          pillar: override.replacementPillar ?? ex.pillar,
          equipment: override.replacementEquipment ?? ex.equipment,
          reps: repInfo.reps,
          tempo: repInfo.tempo,
          ...(repInfo.durationSeconds !== undefined
            ? { durationSeconds: repInfo.durationSeconds }
            : { durationSeconds: undefined }),
          // Clear hardcoded default load so athlete calibration scales the new movement cleanly.
          defaultWeightKg: undefined,
          notes: override.reason ? `Program adaptation (${override.reason}).` : ex.notes,
        });
      } else {
        updated.push(ex);
      }
    }
    nextExercises = tidyLetterOrders(updated);
  } else if (
    override.kind === 'add_exercise' &&
    override.replacementExerciseId &&
    override.replacementExerciseName
  ) {
    const alreadyPresent = nextExercises.some(
      (e) =>
        e.exerciseId === override.replacementExerciseId ||
        e.name.toLowerCase() === override.replacementExerciseName!.toLowerCase()
    );
    if (!alreadyPresent) {
      changed = true;
      const repInfo = defaultRepStringForOverride(override);
      const lastOrder = nextExercises[nextExercises.length - 1]?.order || 'A';
      const nextLetter = /^[A-Z]/.test(lastOrder)
        ? String.fromCharCode(Math.min(90, lastOrder.charCodeAt(0) + 1))
        : String.fromCharCode(65 + Math.min(25, nextExercises.length));
      nextExercises.push({
        order: nextLetter,
        name: override.replacementExerciseName,
        exerciseId: override.replacementExerciseId,
        pillar: (override.replacementPillar ?? 'Horizontal Push') as ExerciseSession['pillar'],
        equipment: (override.replacementEquipment ?? 'dumbbell') as ExerciseSession['equipment'],
        sets: Math.max(1, Math.min(8, Math.round(override.sets ?? 3))),
        reps: repInfo.reps,
        tempo: repInfo.tempo,
        ...(repInfo.durationSeconds !== undefined ? { durationSeconds: repInfo.durationSeconds } : {}),
        restSeconds: override.replacementIsTimed ? 60 : 90,
        ...(override.reason ? { notes: `Added for ${override.reason}.` } : {}),
      });
      nextExercises = tidyLetterOrders(nextExercises);
    }
  } else if (override.kind === 'remove_exercise') {
    const filtered = nextExercises.filter(
      (e) => !matchesTarget(e, override.targetExerciseId, override.targetExerciseName)
    );
    if (filtered.length !== nextExercises.length && filtered.length >= 1) {
      changed = true;
      nextExercises = tidyLetterOrders(filtered);
    }
  } else if (override.kind === 'adjust_sets') {
    nextExercises = nextExercises.map((e) => {
      if (!matchesTarget(e, override.targetExerciseId, override.targetExerciseName)) return e;
      const targetSets =
        typeof override.sets === 'number'
          ? Math.max(1, Math.min(10, Math.round(override.sets)))
          : Math.max(1, Math.min(10, e.sets + Math.round(override.setDelta ?? 1)));
      if (targetSets !== e.sets) changed = true;
      return { ...e, sets: targetSets };
    });
  } else if (override.kind === 'adjust_rep_range' && override.repRange && override.repRange.length === 2) {
    const [minR, maxR] = override.repRange;
    const cleanMin = Math.max(1, Math.min(30, Math.round(Math.min(minR, maxR))));
    const cleanMax = Math.max(cleanMin, Math.min(35, Math.round(Math.max(minR, maxR))));
    const repStr = cleanMin === cleanMax ? `${cleanMin}` : `${cleanMin}-${cleanMax}`;
    nextExercises = nextExercises.map((e) => {
      if (!matchesTarget(e, override.targetExerciseId, override.targetExerciseName)) return e;
      if (e.reps !== repStr) changed = true;
      return { ...e, reps: repStr };
    });
  } else if (override.kind === 'prioritize_first') {
    const idx = nextExercises.findIndex((e) =>
      matchesTarget(e, override.targetExerciseId, override.targetExerciseName)
    );
    if (idx > 0) {
      changed = true;
      const [promoted] = nextExercises.splice(idx, 1);
      const nextList = [{ ...promoted, useWarmupProtocol: true }, ...nextExercises];
      nextExercises = tidyLetterOrders(nextList);
    }
  }

  return changed ? { template: { ...tmpl, exercises: nextExercises }, changed: true } : { template: tmpl, changed: false };
}

/**
 * Returns a non-mutated copy of `plan` with all matching `ProgramExerciseOverride` rules applied
 * in order. Cached plan templates stay pure and immutable.
 */
export function applyProgramOverridesToPlan(
  plan: TrainingPlan,
  overrides?: ProgramExerciseOverride[]
): TrainingPlan {
  if (!overrides || overrides.length === 0) return plan;
  const relevant = overrides.filter((o) => o.planId === plan.id);
  if (relevant.length === 0) return plan;

  const templates = plan.templates.map((tmpl) => {
    let current = tmpl;
    for (const ov of relevant) {
      const res = applySingleOverrideToTemplate(current, ov);
      if (res.changed) current = res.template;
    }
    return current;
  });

  return { ...plan, templates };
}

export interface ProgramOverridePreview {
  affectedWorkoutNumbers: number[];
  affectedTitles: string[];
  remainingAffectedCount: number;
  totalAffectedCount: number;
  modifiedPlan: TrainingPlan;
}

/**
 * Simulates applying one or more candidate overrides to `plan` and reports exact affected session numbers.
 */
export function previewProgramOverrides(
  plan: TrainingPlan,
  candidates: ProgramExerciseOverride[],
  completedWorkouts: WorkoutSession[] = [],
  planCycleStarts?: Record<string, string>
): ProgramOverridePreview {
  const modifiedPlan = applyProgramOverridesToPlan(plan, [
    // Treat candidates as standalone preview against the current resolved plan
    ...candidates,
  ]);
  const cycleStart = planCycleStarts?.[plan.id];
  const completedNumbers = new Set(
    completedWorkouts
      .filter((w) => {
        if (!w.completed || w.planId !== plan.id || !w.programWorkoutNumber) return false;
        if (!cycleStart) return true;
        const stamp = w.completedAt || `${w.date}T23:59:59.999Z`;
        return stamp >= cycleStart;
      })
      .map((w) => w.programWorkoutNumber!)
  );

  const affectedWorkoutNumbers: number[] = [];
  const affectedTitleSet = new Set<string>();

  for (let i = 0; i < plan.templates.length; i++) {
    const before = plan.templates[i];
    const after = modifiedPlan.templates[i];
    if (isActiveSlot(before)) continue;
    const serializedBefore = JSON.stringify(before.exercises);
    const serializedAfter = JSON.stringify(after.exercises);
    if (serializedBefore !== serializedAfter) {
      affectedWorkoutNumbers.push(after.workoutNumber);
      affectedTitleSet.add(after.title.replace(/\s*\(.*\)\s*$/, ''));
    }
  }

  const remainingAffectedCount = affectedWorkoutNumbers.filter((n) => !completedNumbers.has(n)).length;

  return {
    affectedWorkoutNumbers,
    affectedTitles: Array.from(affectedTitleSet),
    remainingAffectedCount,
    totalAffectedCount: affectedWorkoutNumbers.length,
    modifiedPlan,
  };
}
