/**
 * Overlaid body composition time-series and AI insight builder for the optional
 * `composition` Progress widget.
 *
 * Formulas match `buildCompositionCharts` and `buildBodyCompositionKnowledgeGraph`:
 * - Weight: logged scale weight (kg stored internally, formatted in the athlete's display unit)
 * - Body fat %: measured `bodyFatPct`
 * - Lean body mass (fat-free mass): measured `fatFreeMassKg`, or `weight * (1 - bodyFatPct / 100)`
 *
 * Zero fabricated points: unlogged series stay empty/undefined and are shown honestly.
 */
import { runReadAloudQaGate } from '../engine/contentStrategy';
import { BiometricLog, GoalPhase } from '../engine/types';
import { GOAL_DISPLAY_NAME } from '../utils/goalNames';
import { localDateString } from '../utils/date';
import { markPromptRejected, mismatchedWeightUnit, spelledNumberNotInFacts, wasPromptRejected } from './factChecks';
import { promptOnDeviceModel } from './onDeviceModel';
import { ChartTimeline, timelineCutoffDate } from './progressSeries';
import {
  buildSummaryVoiceGuidelines,
  checkSummaryVoiceGuidelines,
  normalizeSummaryVoice,
} from './coachPersonalization';
import { coalesceAiGeneration, readCachedAiText, writeCachedAiText } from './aiGenerationCache';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface CompositionPoint {
  date: string; // YYYY-MM-DD
  weightKg?: number;
  bodyFatPct?: number;
  leanMassKg?: number;
}

export interface CompositionMetricStat {
  latest?: number;
  first?: number;
  delta?: number;
  count: number;
}

export interface CompositionOverviewModel {
  timeline: ChartTimeline;
  allPoints: CompositionPoint[];
  points: CompositionPoint[];
  hasAllTimeData: boolean;
  weight: CompositionMetricStat;
  bodyFat: CompositionMetricStat;
  leanMass: CompositionMetricStat;
  summary: CompositionInsightSummary;
}

export interface CompositionInsightSummary {
  facts: string[];
  fallback: string;
  sparse: boolean;
  systemPrompt: string;
}

export const COMPOSITION_SYSTEM_PROMPT =
  'You write a concise 2-line body composition insight for a strength training app card showing overlaid Weight, Body fat %, and Lean body mass over time. ' +
  'Use only the facts given. Line 1: state how weight, lean mass, and body fat shifted in concrete figures (kg/lb/% points). ' +
  'Line 2: explain what that tissue partitioning means for the athlete’s goal and one clear next focus. ' +
  'Plain, grounded, non-judgmental coach voice—no headings, bullets, clichés, AI self-references, or ungiven numbers. Under 240 characters total. ' +
  buildSummaryVoiceGuidelines('composition_insight');

function extractPoint(log: BiometricLog): CompositionPoint | null {
  const weightKg = log.bodyweightKg > 0 ? round1(log.bodyweightKg) : undefined;
  const bodyFatPct =
    log.bodyFatPct && log.bodyFatPct > 0 && log.bodyFatPct < 70
      ? round1(log.bodyFatPct)
      : undefined;
  const leanMassKg =
    log.fatFreeMassKg && log.fatFreeMassKg > 0
      ? round1(log.fatFreeMassKg)
      : weightKg !== undefined && bodyFatPct !== undefined
      ? round1(weightKg * (1 - bodyFatPct / 100))
      : undefined;

  if (weightKg === undefined && bodyFatPct === undefined && leanMassKg === undefined) {
    return null;
  }
  return { date: log.date, weightKg, bodyFatPct, leanMassKg };
}

function summarizeMetric(
  points: CompositionPoint[],
  pick: (p: CompositionPoint) => number | undefined
): CompositionMetricStat {
  const values = points.map(pick).filter((v): v is number => v !== undefined);
  if (values.length === 0) return { count: 0 };
  const first = values[0];
  const latest = values[values.length - 1];
  const delta = values.length >= 2 ? round1(latest - first) : undefined;
  return { first, latest, delta, count: values.length };
}

function signedPrecise(delta: number, formatWeight: (kg: number) => string): string {
  const abs = formatWeight(Math.abs(delta));
  if (Math.abs(delta) < 0.05) return `no change (${abs})`;
  return `${delta > 0 ? '+' : '-'}${abs}`;
}

function signedPctPoints(delta: number): string {
  const abs = `${round1(Math.abs(delta))}%`;
  if (Math.abs(delta) < 0.05) return '0%';
  return `${delta > 0 ? '+' : '-'}${abs}`;
}

export function buildCompositionOverview(input: {
  biometrics: BiometricLog[];
  goalPhase: GoalPhase;
  timeline: ChartTimeline;
  formatWeight: (kg: number) => string;
  formatPreciseWeight?: (kg: number) => string;
  today?: string;
}): CompositionOverviewModel {
  const {
    biometrics,
    goalPhase,
    timeline,
    formatWeight,
    formatPreciseWeight = formatWeight,
    today = localDateString(),
  } = input;

  // Merge chronological entries by local date (latest sample on a given date wins per field).
  const byDate = new Map<string, CompositionPoint>();
  const sorted = [...biometrics].sort((a, b) => a.date.localeCompare(b.date));
  for (const b of sorted) {
    const pt = extractPoint(b);
    if (!pt) continue;
    const prev = byDate.get(pt.date);
    byDate.set(pt.date, {
      date: pt.date,
      weightKg: pt.weightKg ?? prev?.weightKg,
      bodyFatPct: pt.bodyFatPct ?? prev?.bodyFatPct,
      leanMassKg: pt.leanMassKg ?? prev?.leanMassKg,
    });
  }

  const allPoints = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = timelineCutoffDate(timeline, today);
  const points = allPoints.filter((p) => p.date >= cutoff);

  const weight = summarizeMetric(points, (p) => p.weightKg);
  const bodyFat = summarizeMetric(points, (p) => p.bodyFatPct);
  const leanMass = summarizeMetric(points, (p) => p.leanMassKg);

  const goalLabel = GOAL_DISPLAY_NAME[goalPhase] ?? 'Build Muscle';
  const windowLabel =
    timeline === '1W' ? 'last 7 days' : timeline === '1M' ? 'last 30 days' : timeline === '3M' ? 'last 3 months' : 'last year';

  const facts: string[] = [
    `Goal: ${goalLabel}.`,
    `Window: ${windowLabel} (${points.length} ${points.length === 1 ? 'check-in' : 'check-ins'}).`,
  ];

  if (weight.latest !== undefined) {
    if (weight.first !== undefined && weight.delta !== undefined) {
      facts.push(
        `Weight: ${formatPreciseWeight(weight.first)} to ${formatPreciseWeight(weight.latest)} (${signedPrecise(weight.delta, formatPreciseWeight)}).`
      );
    } else {
      facts.push(`Weight: ${formatPreciseWeight(weight.latest)}.`);
    }
  }
  if (leanMass.latest !== undefined) {
    if (leanMass.first !== undefined && leanMass.delta !== undefined) {
      facts.push(
        `Lean body mass: ${formatPreciseWeight(leanMass.first)} to ${formatPreciseWeight(leanMass.latest)} (${signedPrecise(leanMass.delta, formatPreciseWeight)}).`
      );
    } else {
      facts.push(`Lean body mass: ${formatPreciseWeight(leanMass.latest)}.`);
    }
  }
  if (bodyFat.latest !== undefined) {
    if (bodyFat.first !== undefined && bodyFat.delta !== undefined) {
      facts.push(
        `Body fat: ${round1(bodyFat.first)}% to ${round1(bodyFat.latest)}% (${signedPctPoints(bodyFat.delta)}, ${round1(Math.abs(bodyFat.delta))} points).`
      );
    } else {
      facts.push(`Body fat: ${round1(bodyFat.latest)}%.`);
    }
  }

  let fallback: string;
  let sparse = false;

  if (allPoints.length === 0) {
    sparse = true;
    fallback =
      'No weight or body fat logs yet.\nLog morning weigh-ins and body fat % to track muscle vs. fat over time.';
  } else if (points.length === 0) {
    sparse = true;
    fallback =
      `No entries logged in the ${windowLabel}.\nSelect a wider range or log today’s weigh-in to refresh the trend.`;
  } else if (leanMass.count >= 2 && bodyFat.count >= 2 && leanMass.delta !== undefined && bodyFat.delta !== undefined) {
    const lDelta = leanMass.delta;
    const bfDelta = bodyFat.delta;
    const wDelta = weight.delta ?? 0;
    const bfNow = `${round1(bodyFat.latest!)}%`;
    const leanNow = formatPreciseWeight(leanMass.latest!);

    if (lDelta >= 2.0 && bfDelta <= -2.0) {
      fallback =
        `BIA lean mass shifted ${signedPrecise(lDelta, formatPreciseWeight)} to ${leanNow} and body fat fell ${round1(Math.abs(bfDelta))} points (${bfNow}).\n` +
        `Directional recomposition signal—confirm with fasted morning weight, anchor-lift strength, and waist tape.`;
    } else if (lDelta >= 2.0 && bfDelta <= 0.8) {
      const bfPhrase =
        Math.abs(bfDelta) < 0.1
          ? `body fat held at ${bfNow}`
          : `body fat shifted ${signedPctPoints(bfDelta)} to ${bfNow}`;
      fallback =
        `BIA lean mass rose ${signedPrecise(lDelta, formatPreciseWeight)} to ${leanNow} while ${bfPhrase}.\n` +
        `Directional lean-gain trend for ${goalLabel}—weigh in fasted mornings and track over 12+ weeks.`;
    } else if (bfDelta <= -2.0 && lDelta >= -1.0) {
      fallback =
        `BIA body fat dropped ${round1(Math.abs(bfDelta))} points to ${bfNow} while lean mass held near ${leanNow}.\n` +
        `Directional fat-loss signal—confirm with 7-day average weight, waist tape, and steady main lifts.`;
    } else if (bfDelta > 2.0 && lDelta < Math.max(0.5, wDelta * 0.4)) {
      fallback =
        `BIA body fat climbed ${round1(bfDelta)} points to ${bfNow} with weight ${signedPrecise(wDelta, formatPreciseWeight)}.\n` +
        `Check 7-day average weight pace and waist tape to keep gain steady.`;
    } else if (lDelta <= -2.0 && wDelta <= -2.0) {
      fallback =
        `Weight dropped ${formatPreciseWeight(Math.abs(wDelta))} and BIA lean mass dipped ${formatPreciseWeight(Math.abs(lDelta))} to ${leanNow}.\n` +
        `Confirm with anchor-lift strength and waist tape; BIA readings fluctuate with hydration.`;
    } else {
      fallback =
        `Weight (${weight.latest !== undefined ? formatPreciseWeight(weight.latest) : '—'}), BIA lean mass (${leanNow}), and body fat (${bfNow}) are within normal scale noise.\n` +
        `Weigh in fasted mornings and evaluate BIA lean mass as a 12+ week directional overlay.`;
    }
  } else if (weight.count >= 2 && weight.delta !== undefined) {
    sparse = bodyFat.count === 0;
    const bfExtra =
      bodyFat.latest !== undefined ? ` Latest body fat: ${round1(bodyFat.latest)}%.` : '';
    fallback =
      `Weight shifted ${signedPrecise(weight.delta, formatPreciseWeight)} to ${formatPreciseWeight(weight.latest!)}.${bfExtra}\n` +
      'Log body fat % alongside weigh-ins on two or more days to separate lean mass from fat.';
  } else {
    sparse = true;
    const parts: string[] = [];
    if (weight.latest !== undefined) parts.push(`weight ${formatPreciseWeight(weight.latest)}`);
    if (leanMass.latest !== undefined) parts.push(`lean mass ${formatPreciseWeight(leanMass.latest)}`);
    if (bodyFat.latest !== undefined) parts.push(`body fat ${round1(bodyFat.latest)}%`);
    fallback =
      `Starting composition logged (${parts.join(', ')}).\n` +
      'Log one more morning check-in with weight and body fat % to trace trends.';
  }

  return {
    timeline,
    allPoints,
    points,
    hasAllTimeData: allPoints.length > 0,
    weight,
    bodyFat,
    leanMass,
    summary: {
      facts,
      fallback,
      sparse,
      systemPrompt: COMPOSITION_SYSTEM_PROMPT,
    },
  };
}

const NUMBER = /\d+(?:\.\d+)?/g;
const stripCommas = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, '$1');

export function checkCompositionInsight(
  answer: string | null,
  summary: Pick<CompositionInsightSummary, 'facts'>
): { text: string; problem?: undefined } | { text?: undefined; problem: string } {
  if (!answer) return { problem: 'it was empty' };
  const text = normalizeSummaryVoice(answer, {
    preserveNewlines: true,
    prefixPattern: /^\s*(summary|insight|composition insight)\s*:\s*/i,
  });

  if (text.length < 36) return { problem: 'it was too short' };
  if (text.length > 260) return { problem: 'it exceeded 260 characters; keep it to two brief lines' };
  if ((text.match(/[.!?](\s|$)/g) || []).length > 3) return { problem: 'it used more than two sentences' };
  if (/\b(as an ai|language model|the facts|facts provided|i am an?|i'm an?)\b/i.test(text)) {
    return { problem: 'it referred to itself or the facts' };
  }
  if (!runReadAloudQaGate(text).passed) {
    return { problem: 'it used hype, clichés or judgmental wording' };
  }
  const voiceProblem = checkSummaryVoiceGuidelines(text);
  if (voiceProblem) {
    return { problem: voiceProblem };
  }
  if (/\b(felt|feel|feeling|enjoy(ed)?|loved)\b/i.test(text)) {
    return { problem: 'it claimed how the athlete felt' };
  }
  if (/\b(significant\w*|dramatic\w*|huge|massive|incredibl\w*|amazing|awesome)\b/i.test(text)) {
    return { problem: 'it used exaggerated words' };
  }
  if (/\b(cannot be|can't be|unable to) (assessed|measured|determined|evaluated)\b|\binsufficient\b|\bno data\b/i.test(text)) {
    return { problem: 'it said data cannot be assessed instead of stating what is logged' };
  }

  const allowed = new Set(stripCommas(summary.facts.join(' ')).match(NUMBER) || []);
  const strange = (stripCommas(text).match(NUMBER) || []).find((n) => !allowed.has(n));
  if (strange) return { problem: `it invented the number ${strange}, which is not in the facts` };

  const spelled = spelledNumberNotInFacts(text, summary.facts);
  if (spelled) return { problem: `it spelled out "${spelled}", which is not in the facts` };

  const wrongUnit = mismatchedWeightUnit(text, summary.facts);
  if (wrongUnit) return { problem: `it used ${wrongUnit}, which does not match the facts' weight unit` };

  return { text };
}

const COMPOSITION_CACHE_KEY = 'treise_composition_insight_v1';

function compositionHash(summary: Pick<CompositionInsightSummary, 'facts' | 'systemPrompt'>): string {
  const raw = `${summary.systemPrompt}\n${summary.facts.join('\n')}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function getCachedCompositionInsight(
  summary: Pick<CompositionInsightSummary, 'facts' | 'systemPrompt'>
): string | null {
  const hit = readCachedAiText(COMPOSITION_CACHE_KEY, compositionHash(summary));
  const checked = typeof hit === 'string' ? checkCompositionInsight(hit, summary) : null;
  return checked && checked.problem === undefined ? checked.text : null;
}

export function cacheCompositionInsight(
  summary: Pick<CompositionInsightSummary, 'facts' | 'systemPrompt'>,
  text: string
): void {
  writeCachedAiText(COMPOSITION_CACHE_KEY, compositionHash(summary), text, 12);
}

export async function generateCompositionInsight(
  summary: CompositionInsightSummary,
  prompt: typeof promptOnDeviceModel = promptOnDeviceModel,
  attempts = 2
): Promise<string | null> {
  if (summary.sparse) return null;
  const isLive = prompt === promptOnDeviceModel;
  const rejectKey = `composition:${compositionHash(summary)}`;
  if (isLive) {
    const cached = getCachedCompositionInsight(summary);
    if (cached) return cached;
    if (wasPromptRejected(rejectKey)) return null;
  }

  const run = async (): Promise<string | null> => {
    let problem: string | undefined;
    let sawModelAnswer = false;
    const base = `Facts:\n${summary.facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the 2-line insight.`;

    try {
      for (let i = 0; i < attempts; i++) {
        const request = problem
          ? `${base}\n(Your previous draft failed because ${problem}. Rewrite it cleanly.)`
          : base;
        const answer = await prompt(summary.systemPrompt, request, {
          stateless: true,
          maxTokens: 110,
          timeoutMs: 30_000,
        });
        if (answer === null) return null;
        sawModelAnswer = true;
        const checked = checkCompositionInsight(answer, summary);
        if (checked.problem === undefined) return checked.text;
        problem = checked.problem;
      }
      if (isLive && sawModelAnswer) markPromptRejected(rejectKey);
    } catch {
      return null;
    }
    return null;
  };

  if (isLive) {
    return coalesceAiGeneration(rejectKey, run, (text) => cacheCompositionInsight(summary, text));
  }
  return run();
}
