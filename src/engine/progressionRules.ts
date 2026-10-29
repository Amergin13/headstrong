/**
 * The double progression rule, in one place. The knowledge graph's `sp-double-progression`
 * principle is written from these values, and both the split progression (`progression.ts`) and the
 * 6-week plan's load carry-over (`loadPersonalization.ts`) apply them, so the app always does what
 * the knowledge graph says (Helms, Morgan & Valdez, 2019; Israetel, Feather & Helms, 2020).
 */
export const PROGRESSION_RULES = {
  /** Load step when every working set reached the top of the rep range. */
  barbellIncrementKg: 2.5,
  dumbbellIncrementKg: 2,
  /** Machines and cables use the smallest common plate step. */
  otherIncrementKg: 2.5,
  /** Reps added on the first sets when the athlete is inside the range. */
  repStep: 1,
  /** Sets this many reps or more short of failure count as quality reps (not ground out). */
  minRirForProgress: 1,
  /** Largest jump allowed from one session to the next. */
  maxSessionIncreaseFraction: 0.1,
} as const;

export function loadIncrementFor(equipment: string): number {
  if (equipment === 'dumbbell') return PROGRESSION_RULES.dumbbellIncrementKg;
  if (equipment === 'barbell') return PROGRESSION_RULES.barbellIncrementKg;
  return PROGRESSION_RULES.otherIncrementKg;
}

/**
 * Whether a set was done with enough reps in reserve to progress from. A set the plan deliberately
 * takes to failure (target 0 RIR) counts when it reaches failure on the target reps; otherwise at
 * least 1 rep must be left in reserve, so ground-out reps never raise the weight.
 */
export function hadQualityEffort(actualRir: number | undefined, targetRir: number | undefined): boolean {
  const required = Math.min(targetRir ?? PROGRESSION_RULES.minRirForProgress, PROGRESSION_RULES.minRirForProgress);
  return (actualRir ?? targetRir ?? 2) >= required;
}
