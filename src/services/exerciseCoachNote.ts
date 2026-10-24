/**
 * Personal coaching note for each exercise card, written by the on-device model (Gemini Nano, or
 * the downloaded phone-GPU model) from facts in the athlete's knowledge graph and history.
 *
 * The model only rewrites facts it is given: every number in its answer must appear in those
 * facts, otherwise the note is rejected and the fact-based fallback is shown instead. Prompts and
 * answers never leave the device.
 */
import { AthleteKnowledgeGraph } from '../engine/knowledgeGraph';
import { getWorkoutCompletedAt } from '../engine/recovery';
import { ExerciseSession, ReadinessState, WorkoutSession, WorkoutSet } from '../engine/types';
import { ExerciseInsight } from './exerciseInsight';
import { promptOnDeviceModel } from './onDeviceModel';
import { MUSCLE_TO_GRAPH_KEY } from './sessionReport';

export interface ExerciseNoteInput {
  exercise: ExerciseSession;
  insight: ExerciseInsight;
  workouts: WorkoutSession[];
  readinessState: ReadinessState;
  knowledgeGraph: AthleteKnowledgeGraph;
  /** Catalog primary muscle, e.g. "Side Delts". */
  primaryMuscle?: string;
  /** Plain-English muscle, e.g. "side shoulders". */
  muscleLabel?: string;
  /** e.g. "Phase 1 (Building foundations), week 1 of 6". */
  programLabel?: string;
  /** Formats kilograms in the athlete's unit, e.g. "10 kg". */
  formatWeight: (kg: number) => string;
}

export interface ExerciseNoteFacts {
  exerciseId: string;
  /** Changes whenever any fact changes; used to cache the generated note. */
  key: string;
  facts: string[];
  /** Personalised note built directly from the facts, shown until (or instead of) the model's. */
  fallback: string;
}

export const EXERCISE_NOTE_SYSTEM_PROMPT =
  "You write a short coaching note about one exercise in the athlete's workout today. Use only the facts given. " +
  "Write exactly two sentences, speaking to the athlete as \"you\": the first says what their recent progress or " +
  'this week\'s training on this muscle shows (mention the weekly set target if the muscle is below or above it); ' +
  'the second tells them exactly how to approach today\'s sets. ' +
  'Plain English, no lists, no greetings, no headings. Do not use any number that is not in the facts.';

const isWorking = (s: WorkoutSet) => !s.isWarmup && s.setType !== 'warmup';
const done = (s: WorkoutSet) => s.completed && isWorking(s) && (s.actualReps ?? 0) > 0;
const weightOf = (s: WorkoutSet) => s.actualWeightKg ?? s.targetWeightKg ?? 0;

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildExerciseNoteFacts(input: ExerciseNoteInput): ExerciseNoteFacts {
  const { exercise, insight, workouts, readinessState, knowledgeGraph, formatWeight } = input;
  const facts: string[] = [];
  const muscle = input.muscleLabel ? input.muscleLabel.toLowerCase() : undefined;
  facts.push(`Exercise: ${exercise.name}${muscle ? ` (trains your ${muscle})` : ''}.`);

  // Knowledge graph: this week's sets for the muscle against the athlete's personal target.
  const graphKey = input.primaryMuscle ? MUSCLE_TO_GRAPH_KEY[input.primaryMuscle] : undefined;
  const profile = graphKey ? input.knowledgeGraph.muscleProfiles.find((m) => m.muscleKey === graphKey) : undefined;
  let weekSentence = '';
  if (profile) {
    const [min, max] = profile.personalizedMav;
    const status = profile.weeklySets < min ? 'below target' : profile.weeklySets > max ? 'above target' : 'on target';
    facts.push(`${profile.displayName} this week: ${profile.weeklySets} hard sets against a target of ${min}–${max} (${status}).`);
    weekSentence =
      status === 'below target'
        ? ` You're at ${profile.weeklySets} of ${min}–${max} sets for ${profile.displayName.toLowerCase()} this week, so make every set count.`
        : status === 'above target'
        ? ` You're already above this week's set target for ${profile.displayName.toLowerCase()}, so keep the effort crisp rather than adding sets.`
        : ` ${profile.displayName} is on target for the week.`;
  }

  // History on this exact exercise.
  const lastSession = workouts
    .filter((w) => w.completed)
    .sort((a, b) => getWorkoutCompletedAt(b) - getWorkoutCompletedAt(a))
    .map((w) => w.exercises.find((e) => e.exerciseId === exercise.exerciseId && e.sets.some(done)))
    .find(Boolean);
  const isBodyweight = exercise.equipment === 'bodyweight' && !exercise.isWeightedCalisthenic;
  const load = (kg: number) => (kg > 0 ? formatWeight(kg) : isBodyweight ? 'bodyweight' : formatWeight(0));
  if (!lastSession) {
    facts.push('This is the first time you have logged this exercise.');
  } else {
    const sets = lastSession.sets.filter(done);
    const best = sets.reduce((b, s) => (weightOf(s) > weightOf(b) || (weightOf(s) === weightOf(b) && (s.actualReps ?? 0) > (b.actualReps ?? 0)) ? s : b), sets[0]);
    facts.push(
      `Last time: ${sets.length} sets, best set ${load(weightOf(best))} for ${best.actualReps} reps with ${best.actualRir ?? best.targetRir ?? 2} reps in reserve.`
    );
    if (insight.history.length >= 2) {
      const first = insight.history[0].e1rmKg;
      const last = insight.history[insight.history.length - 1].e1rmKg;
      const pct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
      facts.push(
        pct === 0
          ? `Estimated strength on this exercise has held steady over ${insight.history.length} sessions.`
          : `Estimated strength on this exercise has ${pct > 0 ? 'risen' : 'fallen'} ${Math.abs(pct)}% over ${insight.history.length} sessions.`
      );
    }
  }

  // Today's plan.
  const working = exercise.sets.filter(isWorking);
  const planned = working[0];
  if (planned) {
    const tempo = exercise.tempo && /^\d{4}$/.test(exercise.tempo) ? `, taking ${exercise.tempo[0]} seconds to lower each rep` : '';
    facts.push(
      `Today's plan: ${working.length} sets of ${planned.targetReps} reps at ${load(planned.targetWeightKg)}, leaving ${planned.targetRir ?? 2} reps in reserve${tempo}.`
    );
    if (lastSession) {
      const prevTop = lastSession.sets.filter(done).reduce((m, s) => Math.max(m, weightOf(s)), 0);
      const prevReps = lastSession.sets.filter(done).reduce((m, s) => Math.max(m, s.actualReps ?? 0), 0);
      if (planned.targetWeightKg > prevTop + 0.01) facts.push('Today is heavier than last time.');
      else if (planned.targetWeightKg < prevTop - 0.01) facts.push('Today is lighter than last time.');
      else if (planned.targetReps > prevReps) facts.push('Today keeps the same weight and adds reps.');
      else facts.push('Today repeats last time\'s weight and reps.');
    }
  }
  if (exercise.intensityProtocol) facts.push(`Technique today: ${exercise.intensityProtocol.name}.`);

  // Recovery today.
  facts.push(
    readinessState === 'Amber Shield'
      ? 'Recovery today is low, so the plan holds the weight steady.'
      : readinessState === 'Primed'
      ? 'Recovery today is high.'
      : 'Recovery today is normal.'
  );

  // Knowledge graph: joints this exercise has been loading hard.
  const joint = knowledgeGraph.joints.find((j) => j.status !== 'Optimal' && j.topContributors.includes(exercise.name));
  if (joint) facts.push(`${joint.joint} load this week: ${joint.status.toLowerCase()}, partly from this exercise.`);
  if (input.programLabel) facts.push(`Program: ${input.programLabel}.`);

  return {
    exerciseId: exercise.id,
    key: hash(`${EXERCISE_NOTE_SYSTEM_PROMPT}\n${facts.join('\n')}`),
    facts,
    fallback: `${insight.summary}${weekSentence}`,
  };
}

export function buildExerciseNotePrompt(facts: ExerciseNoteFacts): string {
  return `Facts:\n${facts.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the note.`;
}

const NUMBER = /\d+(?:\.\d+)?/g;

/**
 * Cleans a model answer and accepts it only if it reads as a short note and every number in it
 * comes from the facts. Returns null to use the fallback.
 */
export function acceptExerciseNote(answer: string | null, facts: ExerciseNoteFacts): string | null {
  if (!answer) return null;
  const text = answer
    .replace(/[*#_`]/g, '')
    .replace(/^\s*(note|coaching note)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 40 || text.length > 360) return null;
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) return null;
  if ((text.match(/[.!?](\s|$)/g) || []).length > 3) return null;
  const allFacts = facts.facts.join(' ');
  const allowed = new Set(allFacts.match(NUMBER) || []);
  const used = text.match(NUMBER) || [];
  if (used.some((n) => !allowed.has(n))) return null;
  // A weekly target may only be mentioned when the facts include one, and described the same way.
  const targetStatus = /\((below target|on target|above target)\)/.exec(allFacts)?.[1];
  if (/\btarget\b/i.test(text)) {
    if (!targetStatus) return null;
    const claims = {
      'below target': /\b(below|under|short of|behind)\b/i.test(text),
      'above target': /\b(above|over|beyond|exceed)/i.test(text),
      'on target': /\b(on target|on track|within|hit(ting)? (the|your) target|meeting)\b/i.test(text),
    } as Record<string, boolean>;
    if (Object.entries(claims).some(([status, said]) => said && status !== targetStatus)) return null;
  }
  return text;
}

/** Asks the on-device model for the note. Null when no model is ready or its answer fails the checks. */
export async function generateExerciseNote(
  facts: ExerciseNoteFacts,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const answer = await prompt(EXERCISE_NOTE_SYSTEM_PROMPT, buildExerciseNotePrompt(facts), {
      stateless: true,
      timeoutMs: 45_000,
    });
    if (answer === null) return null; // no model, or it failed: don't retry
    const accepted = acceptExerciseNote(answer, facts);
    if (accepted) return accepted;
  }
  return null;
}

// Generated notes are kept on the device, keyed by their facts, so each is written once.
const CACHE_KEY = 'treise_exercise_notes_v1';
const MAX_CACHED = 80;

function readCache(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCachedExerciseNote(key: string): string | undefined {
  return readCache()[key];
}

export function cacheExerciseNote(key: string, note: string): void {
  try {
    const entries = Object.entries(readCache()).filter(([k]) => k !== key);
    entries.push([key, note]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_CACHED))));
  } catch {
    // Storage unavailable: the note is simply generated again next time.
  }
}
