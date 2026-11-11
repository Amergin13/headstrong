/**
 * Treise Content Strategy & COPE (Create Once, Publish Everywhere) Domain Content Model
 *
 * Combines:
 * 1. Kristina Halvorson's Content Strategy Quad & Colleen Jones's Playing to Win Aspiration
 * 2. Daniel Eizans & Erin Kissane's Personal-Behavioral Context + Erika Hall / Paul Grice / Robin Lakoff Conversational Design
 * 3. Margot Bloomstein's Message Architecture & Kate Kiefer Lee's Voice/Tone Matrix
 * 4. Sara Wachter-Boettcher's Content Everywhere & Mike Atherton / Carrie Hane's Domain-Driven Content Modeling (OOUX)
 * 5. UI Microcopy, Action-Oriented Controls, Poka-Yoke Input Validation & Graceful Empty States
 * 6. Colleen Jones's Content Lifespiral Evaluation Matrix, Erika Hall's Read-Aloud QA Gate & ROT Audit
 */
import { ExerciseSession, Gender, ReadinessState, StrengthPillar, WorkoutSession, WorkoutSet } from './types';
import { formatWeight, kgToUnit, roundDisplayWeight, WeightUnit } from '../utils/units';

// ============================================================================
// 1. Core Content Vision & Winning Aspiration
// ============================================================================

export type ContentStrategyQuadPillar = 'Substance' | 'Structure' | 'Workflow' | 'Governance';

export interface CoreContentVision {
  coreStrategyStatement: string;
  quadPillars: ContentStrategyQuadPillar[];
  winningAspiration: {
    achieve: string;
    be: string;
    do: string;
  };
}

export const CORE_CONTENT_VISION: CoreContentVision = {
  coreStrategyStatement:
    'Translate empirical training data into concise, identity-affirming coaching that guides athletes from effort to mastery.',
  quadPillars: ['Substance', 'Structure', 'Workflow', 'Governance'],
  winningAspiration: {
    achieve:
      'Drive long-term retention and habit formation by anchoring user motivation in measurable physical progression rather than fleeting willpower or gamified streaks.',
    be: 'The pragmatic, authoritative strength coach in the athlete’s pocket—delivering high-signal guidance that respects the physical and cognitive realities of the gym floor.',
    do: 'Separate operational logging data from narrative coaching through strict object-oriented content modeling, ensuring zero UI redundancy and effortless multi-device scalability across PWA, Android, and Pixel Watch.',
  },
};

// ============================================================================
// 2. User Context & Conversational Design Principles
// ============================================================================

export type WorkoutLifecyclePhaseId = 'pre_session' | 'intra_session' | 'post_session';

export type GriceanMaxim = 'Quantity' | 'Quality' | 'Relation' | 'Manner' | 'Politeness';

export interface WorkoutLifecycleContextSpec {
  id: WorkoutLifecyclePhaseId;
  phaseLabel: string;
  doing: string;
  feeling: string;
  learningCapacity: 'full' | 'constrained' | 'recovering';
  contentRole: string;
  griceanMaxims: GriceanMaxim[];
  executionRule: string;
}

export const WORKOUT_LIFECYCLE_CONTEXT_MATRIX: WorkoutLifecycleContextSpec[] = [
  {
    id: 'pre_session',
    phaseLabel: '1. Pre-Session (Planning & Onboarding)',
    doing: 'Stationary, normal heart rate, full screen attention.',
    feeling: 'Anticipatory, evaluating readiness and time constraints.',
    learningCapacity: 'full',
    contentRole: 'Orientation & Framing',
    griceanMaxims: ['Relation', 'Quality', 'Politeness'],
    executionRule:
      "Set clear expectations for the session's stimulus (e.g., hypertrophy vs. peak strength) and time commitment.",
  },
  {
    id: 'intra_session',
    phaseLabel: '2. Active Intra-Session (Between Sets)',
    doing: 'Elevated heart rate, physical fatigue, sweaty hands, glancing at mobile or watch screen.',
    feeling: 'Focused, low patience for friction.',
    learningCapacity: 'constrained',
    contentRole: 'Action & Manner',
    griceanMaxims: ['Quantity', 'Manner', 'Politeness'],
    executionRule:
      "Maximum brevity and zero ambiguity. Strip all conversational filler. Use the 2-line exercise brief to validate past progress and state today's stimulus without duplicating table inputs.",
  },
  {
    id: 'post_session',
    phaseLabel: '3. Post-Session (Reflection)',
    doing: 'Cooling down, cognitive bandwidth returning.',
    feeling: 'Accomplished or fatigued; seeking validation of effort.',
    learningCapacity: 'recovering',
    contentRole: 'Closure & Habit Loop',
    griceanMaxims: ['Quality', 'Relation'],
    executionRule:
      "Reinforce the athlete's identity. Highlight concrete milestones achieved (+kg added to e1RM or total volume accumulated) to close the habit reward loop.",
  },
];

// ============================================================================
// 3. Message Architecture & Voice/Tone Matrix
// ============================================================================

export interface MessageArchitecturePillar {
  priority: 1 | 2 | 3;
  id: 'empirical_verifiable' | 'intentional_disciplined' | 'economical_respectful';
  title: string;
  principle: string;
  examples: { allowed: string[]; banned: string[] };
}

export const TREISE_MESSAGE_ARCHITECTURE: MessageArchitecturePillar[] = [
  {
    priority: 1,
    id: 'empirical_verifiable',
    title: 'Empirical & Verifiable (Primary)',
    principle:
      'Ground every claim in the athlete’s actual logged history. Use concrete physical increments (+12.9 kg e1RM, 68 kg × 12), never hollow hype or abstract percentages.',
    examples: {
      allowed: ['+12.9 kg e1RM', '68 kg × 12'],
      banned: ['+19% strength', 'Unicorns high-fiving T-Rexes'],
    },
  },
  {
    priority: 2,
    id: 'intentional_disciplined',
    title: 'Intentional & Disciplined',
    principle:
      'Every set, rep, and RIR target has a physiological purpose. Explain why the session is structured this way (e.g., volume accumulation vs. peak load) so the athlete trains with discernment.',
    examples: {
      allowed: [
        'Today builds volume accumulation at your current load to expand hypertrophy capacity.',
        'Today increases the weight to drive progressive mechanical tension for hypertrophy.',
      ],
      banned: ['Just do 3 sets of 10.', 'Lift heavy today!'],
    },
  },
  {
    priority: 3,
    id: 'economical_respectful',
    title: 'Economical & Respectful',
    principle:
      'Respect the lifter’s depleted attention. Never repeat data in prose that is already visible in the UI, and strip out avoidably ugly words and generic cheerleading.',
    examples: {
      allowed: ['New 8RM baseline established.'],
      banned: ['Make every set count!', 'Today do 3 sets of 8 reps at 70 kg with 2 RIR.'],
    },
  },
];

export type LifecycleToneContext =
  | 'onboarding_and_goals'
  | 'in_workout_briefs'
  | 'deloads_plateaus_missed'
  | 'prs_and_milestones';

export interface ToneRule {
  context: LifecycleToneContext;
  label: string;
  toneAttributes: string[];
  directive: string;
  sampleCopy: string;
}

export const VOICE_TONE_MATRIX: {
  steadyVoice: string;
  tones: Record<LifecycleToneContext, ToneRule>;
} = {
  steadyVoice: 'The pragmatic, observant strength coach in the athlete’s pocket.',
  tones: {
    onboarding_and_goals: {
      context: 'onboarding_and_goals',
      label: 'Onboarding & Goal Setting',
      toneAttributes: ['Grounded', 'Encouraging', 'Clear'],
      directive: 'Avoids intimidation while establishing key concepts like auto-regulation and RIR.',
      sampleCopy: 'Establishing your baseline strength on this lift today.',
    },
    in_workout_briefs: {
      context: 'in_workout_briefs',
      label: 'In-Workout Exercise Briefs',
      toneAttributes: ['Terse', 'Direct', 'High-signal'],
      directive: 'Two lines maximum: Line 1 anchors historical progress; Line 2 states the session stimulus.',
      sampleCopy:
        'Strength on this lift is rising, up +12.9 kg across 4 sessions to a 108.4 kg estimated max.\nToday consolidates volume accumulation at your current load to deepen chest hypertrophy.',
    },
    deloads_plateaus_missed: {
      context: 'deloads_plateaus_missed',
      label: 'Deloads, Plateaus, or Missed Lifts',
      toneAttributes: ['Objective', 'Constructive', 'Non-judgmental'],
      directive:
        'Frames deloads and auto-regulated load reductions as strategic recovery necessary for long-term adaptation—never as failure.',
      sampleCopy: 'Recovery is low, so today holds the weight steady to preserve muscle while managing fatigue.',
    },
    prs_and_milestones: {
      context: 'prs_and_milestones',
      label: 'PRs & Milestones',
      toneAttributes: ['Earned', 'Understated pride'],
      directive:
        'Celebrates the work with hard facts ("New 8RM baseline established"), avoiding infantile confetti or hyperbole.',
      sampleCopy: 'New 8RM baseline established.',
    },
  },
};

// ============================================================================
// 4. Domain & Structured Content Model (COPE Architecture)
// ============================================================================

export interface CopeDomainRelationship {
  from: 'Athlete' | 'Program' | 'Workout' | 'Exercise' | 'Goal';
  to: 'Athlete' | 'Program' | 'Workout' | 'Exercise' | 'Goal';
  cardinality: '1:many' | 'many:many';
}

export const COPE_DOMAIN_RELATIONSHIPS: CopeDomainRelationship[] = [
  { from: 'Athlete', to: 'Goal', cardinality: '1:many' },
  { from: 'Athlete', to: 'Program', cardinality: '1:many' },
  { from: 'Program', to: 'Workout', cardinality: '1:many' },
  { from: 'Workout', to: 'Exercise', cardinality: 'many:many' },
];

export interface CopeProgramChunk {
  Program_Title: string;
  Block_Stimulus: 'Hypertrophy' | 'Strength';
  Duration_Weeks: number;
  Weekly_Volume_Landmarks: {
    muscleLabel: string;
    currentSets: number;
    mevMrvRange: [number, number];
    formattedBarLabel: string;
  };
}

export interface CopeWorkoutChunk {
  Workout_ID: string;
  Session_Focus: string;
  Estimated_Duration: number;
  Readiness_Adjustment_Note: string | null;
}

export interface CopeSetMatrixRow {
  setNumber: number;
  Weight: number;
  Reps: number;
  RIR: number;
}

export interface CopeExerciseChunk {
  Exercise_Name: string;
  Movement_Pattern: StrengthPillar;
  Superset_Group: string | null;
  Historical_Delta_kg: number | null;
  Prev_Best_Set: { weightKg: number; reps: number; formatted: string } | null;
  Session_Stimulus_Rule: string;
  Tempo_Cue: string | null;
  Rest_Seconds: number;
  Set_Matrix: CopeSetMatrixRow[];
}

export interface CopeGoalChunk {
  Target_Metric: 'e1RM_kg' | 'volume_kg';
  Baseline_Value: number;
  Current_Value: number;
  Target_Value: number;
  Session_Count: number;
  Historical_Delta_kg: number;
}

export interface CopeAthleteChunk {
  Bodyweight_kg: number;
  Experience_Tier: 'beginner' | 'intermediate' | 'advanced';
  Unit_Preference: WeightUnit;
  Watch_Sync_State: 'connected' | 'disconnected';
  Gender?: Gender;
}

export interface MobileWorkoutCardView {
  header: {
    exerciseName: string;
    supersetGroup: string | null;
  };
  twoLineBrief: [string, string];
  executionBar: {
    tempoCue: string | null;
    restSeconds: number;
    restActionLabel: string;
  };
  table: {
    setMatrix: CopeSetMatrixRow[];
    prevBestSet: string;
  };
  weeklyVolumeProgressBar: {
    visible: true;
    label: string;
  } | null;
}

export interface PixelWatchCompanionView {
  launchScreen: {
    sessionFocus: string;
  };
  activeSetScreen: {
    exerciseName: string;
    currentSetRow: string;
    tempoCue: string | null;
    weeklyVolumeVisible: false;
  };
  restScreen: {
    restSeconds: number;
    restActionLabel: string;
    nextSetTarget: string;
  };
  postSetHapticMilestoneAlert: boolean;
}

/** Formats a tempo string like "2010" into a compact execution cue ("2s ecc") for the Execution Bar / Watch. */
export function formatCompactTempoCue(tempo?: string): string | null {
  if (!tempo) return null;
  if (/^\d{4}$/.test(tempo)) {
    return `${tempo[0]}s ecc`;
  }
  return tempo;
}

/** Builds a structured COPE Goal chunk and computes Historical_Delta_kg (Current_Value - Baseline_Value). */
export function buildCopeGoalChunk(input: {
  targetMetric?: 'e1RM_kg' | 'volume_kg';
  baselineValue: number;
  currentValue: number;
  targetValue: number;
  sessionCount: number;
}): CopeGoalChunk {
  const delta = Math.round((input.currentValue - input.baselineValue) * 10) / 10;
  return {
    Target_Metric: input.targetMetric ?? 'e1RM_kg',
    Baseline_Value: Math.round(input.baselineValue * 10) / 10,
    Current_Value: Math.round(input.currentValue * 10) / 10,
    Target_Value: Math.round(input.targetValue * 10) / 10,
    Session_Count: input.sessionCount,
    Historical_Delta_kg: delta,
  };
}

/** Builds a presentation-independent COPE Exercise chunk from an ExerciseSession and Goal/history context. */
export function buildCopeExerciseChunk(input: {
  exercise: ExerciseSession;
  goal?: CopeGoalChunk;
  prevBestSet?: { weightKg: number; reps: number } | null;
  sessionStimulusRule: string;
  unit?: WeightUnit;
}): CopeExerciseChunk {
  const { exercise, goal, prevBestSet, sessionStimulusRule, unit = 'kg' } = input;
  const workingSets = exercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  const matrix: CopeSetMatrixRow[] = workingSets.map((s, idx) => ({
    setNumber: idx + 1,
    Weight: s.actualWeightKg ?? s.targetWeightKg ?? 0,
    Reps: s.actualReps ?? s.targetReps ?? 0,
    RIR: s.actualRir ?? s.targetRir ?? 2,
  }));

  return {
    Exercise_Name: exercise.name,
    Movement_Pattern: exercise.pillar,
    Superset_Group: exercise.orderCode ?? null,
    Historical_Delta_kg: goal && goal.Session_Count >= 2 ? goal.Historical_Delta_kg : null,
    Prev_Best_Set: prevBestSet
      ? {
          weightKg: prevBestSet.weightKg,
          reps: prevBestSet.reps,
          formatted: `${formatWeight(prevBestSet.weightKg, unit, false)}×${prevBestSet.reps}`,
        }
      : null,
    Session_Stimulus_Rule: sessionStimulusRule,
    Tempo_Cue: formatCompactTempoCue(exercise.tempo),
    Rest_Seconds: exercise.restSeconds ?? 90,
    Set_Matrix: matrix,
  };
}

/**
 * Projects a COPE Exercise chunk (+ optional Program/Goal chunks) to the Mobile / PWA Workout Card view.
 * Enforces the Strict Zero-Duplication Law between the 2-Line Brief, Execution Bar, Table, and Volume Bar.
 */
export function projectExerciseToMobileCard(input: {
  exerciseChunk: CopeExerciseChunk;
  goalChunk?: CopeGoalChunk;
  programChunk?: CopeProgramChunk;
  unit?: WeightUnit;
}): MobileWorkoutCardView {
  const { exerciseChunk, goalChunk, programChunk, unit = 'kg' } = input;
  const sessionCount = goalChunk?.Session_Count ?? 0;

  let line1: string;
  let line2: string;
  if (sessionCount < 2 || exerciseChunk.Historical_Delta_kg === null) {
    const baseline = buildGracefulBaselineBrief();
    line1 = baseline[0];
    line2 = exerciseChunk.Session_Stimulus_Rule || baseline[1];
  } else {
    const deltaVal = Math.round(kgToUnit(Math.abs(exerciseChunk.Historical_Delta_kg), unit) * 10) / 10;
    const currentVal = goalChunk ? Math.round(kgToUnit(goalChunk.Current_Value, unit) * 10) / 10 : 0;
    const sign = exerciseChunk.Historical_Delta_kg >= 0 ? '+' : '-';
    line1 =
      exerciseChunk.Historical_Delta_kg === 0
        ? `Strength on this lift has held steady at a ${currentVal} ${unit} estimated max across ${sessionCount} sessions.`
        : `Strength on this lift is rising, up ${sign}${deltaVal} ${unit} across ${sessionCount} sessions to a ${currentVal} ${unit} estimated max.`;
    line2 = exerciseChunk.Session_Stimulus_Rule;
  }

  return {
    header: {
      exerciseName: exerciseChunk.Exercise_Name,
      supersetGroup: exerciseChunk.Superset_Group,
    },
    twoLineBrief: [line1, line2],
    executionBar: {
      tempoCue: exerciseChunk.Tempo_Cue,
      restSeconds: exerciseChunk.Rest_Seconds,
      restActionLabel: formatRestActionLabel(exerciseChunk.Rest_Seconds),
    },
    table: {
      setMatrix: exerciseChunk.Set_Matrix,
      prevBestSet: exerciseChunk.Prev_Best_Set?.formatted ?? '—',
    },
    weeklyVolumeProgressBar: programChunk
      ? {
          visible: true,
          label: programChunk.Weekly_Volume_Landmarks.formattedBarLabel,
        }
      : null,
  };
}

/**
 * Projects a COPE Exercise chunk (+ Workout/Goal chunks) to the constrained Pixel Watch Companion view.
 * Weekly_Volume_Landmarks is strictly hidden during active sets on the watch.
 */
export function projectExerciseToPixelWatch(input: {
  workoutChunk: CopeWorkoutChunk;
  exerciseChunk: CopeExerciseChunk;
  goalChunk?: CopeGoalChunk;
  activeSetIndex?: number;
  unit?: WeightUnit;
}): PixelWatchCompanionView {
  const { workoutChunk, exerciseChunk, goalChunk, activeSetIndex = 0, unit = 'kg' } = input;
  const rows = exerciseChunk.Set_Matrix;
  const current = rows[activeSetIndex] ?? rows[0] ?? { setNumber: 1, Weight: 0, Reps: 8, RIR: 2 };
  const next = rows[Math.min(rows.length - 1, activeSetIndex + 1)] ?? current;

  const formatRow = (row: CopeSetMatrixRow) => {
    const w = roundDisplayWeight(kgToUnit(row.Weight, unit));
    return `${w} ${unit.toUpperCase()} × ${row.Reps} @ ${row.RIR} RIR`;
  };

  const milestoneTriggered = Boolean(goalChunk && goalChunk.Current_Value > goalChunk.Target_Value);

  return {
    launchScreen: {
      sessionFocus: workoutChunk.Session_Focus,
    },
    activeSetScreen: {
      exerciseName: exerciseChunk.Exercise_Name,
      currentSetRow: formatRow(current),
      tempoCue: exerciseChunk.Tempo_Cue,
      weeklyVolumeVisible: false,
    },
    restScreen: {
      restSeconds: exerciseChunk.Rest_Seconds,
      restActionLabel: formatRestActionLabel(exerciseChunk.Rest_Seconds),
      nextSetTarget: formatRow(next),
    },
    postSetHapticMilestoneAlert: milestoneTriggered,
  };
}

// ============================================================================
// 5. UI Microcopy, Action-Oriented Controls & Poka-Yoke Guardrails
// ============================================================================

export const CONTENT_SCHEMA_DICTIONARY = {
  controls: {
    logSet: 'Log Set',
    swapExercise: 'Swap Exercise',
    startRestPrefix: 'Start',
    bannedGenericLabels: ['Submit', 'Done', 'OK'] as const,
  },
  emptyStateBaseline: {
    line1: 'Establishing your baseline strength on this lift today.',
    line2: 'Leave 2 reps in reserve on your final set to calibrate your starting e1RM.',
  },
  milestoneTemplates: {
    newRmBaseline: (reps: number) => `New ${reps}RM baseline established.`,
    e1rmGain: (deltaFormatted: string) => `+${deltaFormatted} e1RM`,
  },
} as const;

/** Formats a rest duration into an explicit action-oriented button label, e.g., "Start 2:00 Rest". */
export function formatRestActionLabel(restSeconds: number): string {
  const safe = Math.max(0, Math.round(restSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `Start ${mins}:${secs.toString().padStart(2, '0')} Rest`;
}

/**
 * Graceful Empty & Fallback State for when an athlete logs an exercise for the first time (n < 2 sessions).
 */
export function buildGracefulBaselineBrief(targetRir = 2): [string, string] {
  const line1 = CONTENT_SCHEMA_DICTIONARY.emptyStateBaseline.line1;
  const line2 =
    targetRir === 2
      ? CONTENT_SCHEMA_DICTIONARY.emptyStateBaseline.line2
      : `Leave ${targetRir} ${targetRir === 1 ? 'rep' : 'reps'} in reserve on your final set to calibrate your starting e1RM.`;
  return [line1, line2];
}

export interface WeightPokaYokeResult {
  isSuspiciousJump: boolean;
  enteredWeightKg: number;
  referenceWeightKg: number;
  jumpDisplay: string;
  enteredDisplay: string;
  referenceDisplay: string;
  message: string | null;
  actionLabel: string | null;
}

/**
 * Poka-Yoke Input Validation (Mistake-Proofing):
 * Intercepts fat-finger typos (e.g., typing 700 kg when the previous top set was 70 kg)
 * with a polite, friction-free inline confirmation:
 * "700 kg is a 630 kg jump from your last set. Did you mean 70 kg?" + "Change to 70 kg".
 */
export function evaluateWeightPokaYoke(
  enteredWeightKg: number,
  referenceWeightKg: number | undefined | null,
  unit: WeightUnit = 'kg'
): WeightPokaYokeResult {
  const refKg = referenceWeightKg ?? 0;
  const enteredDispVal = roundDisplayWeight(kgToUnit(enteredWeightKg, unit));
  const refDispVal = roundDisplayWeight(kgToUnit(refKg, unit));
  const jumpDispVal = roundDisplayWeight(enteredDispVal - refDispVal);

  const fmt = (val: number) => `${Number.isInteger(val) ? val : val.toFixed(1)} ${unit}`;
  const enteredDisplay = fmt(enteredDispVal);
  const referenceDisplay = fmt(refDispVal);
  const jumpDisplay = fmt(Math.max(0, jumpDispVal));

  // Trigger poka-yoke when reference > 0 and user enters an implausible jump (>= 2.5x reference and >= 40 kg / 88 lb jump).
  const jumpKg = enteredWeightKg - refKg;
  const isSuspicious = refKg > 0 && enteredWeightKg >= refKg * 2.5 && jumpKg >= 40;

  if (!isSuspicious) {
    return {
      isSuspiciousJump: false,
      enteredWeightKg,
      referenceWeightKg: refKg,
      jumpDisplay,
      enteredDisplay,
      referenceDisplay,
      message: null,
      actionLabel: null,
    };
  }

  return {
    isSuspiciousJump: true,
    enteredWeightKg,
    referenceWeightKg: refKg,
    jumpDisplay,
    enteredDisplay,
    referenceDisplay,
    message: `${enteredDisplay} is a ${jumpDisplay} jump from your last set. Did you mean ${referenceDisplay}?`,
    actionLabel: `Change to ${referenceDisplay}`,
  };
}

// ============================================================================
// 6. Content Intelligence, Evaluation & Governance (Lifespiral, Read-Aloud & ROT)
// ============================================================================

export interface ContentEvaluationDimension {
  id: 'comprehension' | 'actionability_and_influence' | 'findability_and_efficiency';
  dimension: string;
  evaluationQuestion: string;
  behavioralMetric: string;
  perceptionMetric: string;
}

export const CONTENT_EVALUATION_MATRIX: ContentEvaluationDimension[] = [
  {
    id: 'comprehension',
    dimension: 'Comprehension',
    evaluationQuestion: 'Do lifters understand RIR, tempo cues, and volume targets without leaving the workout flow?',
    behavioralMetric: 'Rate of inline tooltip expansions; frequency of unadjusted default RIR values.',
    perceptionMetric: 'Cloze tests or 1-question post-workout prompt: "Was today\'s session focus clear?"',
  },
  {
    id: 'actionability_and_influence',
    dimension: 'Actionability & Influence',
    evaluationQuestion:
      'Does the 2-line exercise brief help lifters execute the intended stimulus (e.g., hitting volume vs. ego-lifting)?',
    behavioralMetric: 'Adherence rate to prescribed rep/RIR ranges during hypertrophy blocks vs. strength blocks.',
    perceptionMetric: 'Post-block survey: "Did the exercise summaries help you pace your effort across sets?"',
  },
  {
    id: 'findability_and_efficiency',
    dimension: 'Findability & Efficiency',
    evaluationQuestion: 'Can lifters log a set and check their previous benchmark in under 3 seconds?',
    behavioralMetric:
      'Time-to-log per set; drop-off rate mid-workout; frequency of screen-switching during active rest timers.',
    perceptionMetric: 'Usability observation of lifters using the UI under actual gym conditions.',
  },
];

export interface ReadAloudQaResult {
  passed: boolean;
  violations: string[];
}

const BANNED_CHEERLEADING_AND_JARGON: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(?:NaN|undefined|null|\[object Object\]|SQL|SyntaxError|TypeError)\b/, reason: 'Database/runtime error leak' },
  { pattern: /\bmake every set count\b/i, reason: 'Generic cheerleading cliché ("make every set count")' },
  { pattern: /\bunicorns high-fiving t-rexes\b/i, reason: 'Infantile hyperbole' },
  { pattern: /\b(?:crush it|beast mode|no pain no gain|smash this workout)\b/i, reason: 'Hollow hype/cheerleading' },
  { pattern: /\b(?:you failed|failure to hit|failed set)\b/i, reason: 'Judgmental failure framing' },
  { pattern: /\b(?:OOUX|Canonical Vector|SFR)\b/, reason: 'Internal architectural jargon leak' },
];

/**
 * Erika Hall's "Read Aloud" QA Gate:
 * Rejects any dynamic string or error message that sounds like a raw database error,
 * internal engineering jargon, or pushy cheerleading rather than a grounded strength coach.
 */
export function runReadAloudQaGate(text: string): ReadAloudQaResult {
  const violations: string[] = [];
  if (!text || !text.trim()) {
    violations.push('Empty content string');
  }
  for (const rule of BANNED_CHEERLEADING_AND_JARGON) {
    if (rule.pattern.test(text)) {
      violations.push(rule.reason);
    }
  }
  return {
    passed: violations.length === 0,
    violations,
  };
}

export interface RotAuditResult {
  passed: boolean;
  redundant: string[];
  outdated: string[];
  trivial: string[];
}

/**
 * Quarterly Rolling Audit against the ROT criteria (Redundant, Outdated, Trivial):
 * - Redundant: Duplicates table inputs (sets, reps, target weight, RIR) or weekly muscle volume bars.
 * - Outdated: Uses abstract strength percentages (+19%) instead of concrete absolute load (+12.9 kg).
 * - Trivial: Generic filler, section header prefixes (Progress:, Goal:), or fails the Read-Aloud QA gate.
 */
export function runRotContentAudit(summaries: { exerciseName: string; summary: string }[]): RotAuditResult {
  const redundant: string[] = [];
  const outdated: string[] = [];
  const trivial: string[] = [];

  for (const { exerciseName, summary } of summaries) {
    const lines = summary
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // Redundant checks (table or weekly volume bar duplication)
    if (
      /\b\d+\s*(?:working\s+|hard\s+)?sets?\b/i.test(summary) ||
      /\b\d+\s*reps?\b/i.test(summary) ||
      /\b\d+\s+of\s+\d+\s*[–-]\s*\d+/i.test(summary) ||
      /\b(?:rir|reps?\s+in\s+reserve|reps?\s+to\s+spare)\b/i.test(summary)
    ) {
      redundant.push(`${exerciseName}: duplicates table mechanics or weekly volume bar`);
    }

    // Outdated checks (abstract percentages or section headers)
    if (/\d+(?:\.\d+)?\s*%|\bpercent(?:age)?\b/i.test(summary)) {
      outdated.push(`${exerciseName}: uses abstract percentage instead of concrete load`);
    }
    if (/(?:^|\n)\s*(?:progress|goal|summary|focus)\s*:/i.test(summary)) {
      outdated.push(`${exerciseName}: contains banned section header prefix`);
    }

    // Trivial checks (line count != 2 or Read-Aloud failure)
    const qa = runReadAloudQaGate(summary);
    if (lines.length !== 2 || !qa.passed) {
      trivial.push(`${exerciseName}: ${lines.length !== 2 ? `expected 2 lines, got ${lines.length}` : qa.violations.join('; ')}`);
    }
  }

  return {
    passed: redundant.length === 0 && outdated.length === 0 && trivial.length === 0,
    redundant,
    outdated,
    trivial,
  };
}
