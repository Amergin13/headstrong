/**
 * Privacy-Preserving Product Telemetry & Goals-Signals-Metrics (GSM) Client Service.
 *
 * Captures anonymous product usage signals locally (`treise_telemetry_v1` — evictable cache key,
 * wiped on `Delete All Data`, disabled immediately when `profile.telemetryOptOut` is true) and
 * batches aggregated low-cardinality samples to `/api/telemetry/ingest` (`@vercel/functions` `metric()`).
 *
 * Never stores or transmits personal identifiers, health readings, lift weights, or free-form text.
 */

import {
  HistogramAggregate,
  MAX_INGEST_BATCH_SIZE,
  PRODUCT_TELEMETRY_GOALS,
  TELEMETRY_METRIC_DEFINITIONS,
  TelemetryGoalsSummary,
  TelemetryMetricName,
  TelemetrySample,
  aggregateTelemetryBatch,
  canonicalTagsKey,
  computeTelemetryGoalsSummary,
  normalizeProgramTypeTag,
  validateTelemetrySample,
} from '../engine/telemetrySchema';
import { GoalPhase, ReadinessState } from '../engine/types';
import { Milestone } from '../engine/milestones';
import { getHealthConnectStatus } from './healthConnectBridge';
import { isIosPlatform } from './healthConnectService';

export const TELEMETRY_STORAGE_KEY = 'treise_telemetry_v1';
const MAX_RECENT_EVENTS = 150;
const MAX_PENDING_QUEUE = 120;
const MAX_STARTED_WORKOUT_IDS = 60;
const FLUSH_DEBOUNCE_MS = 4000;

export interface TelemetryStoreState {
  version: 1;
  optOut: boolean;
  counters: Record<string, number>;
  taggedCounters: Record<string, number>;
  histograms: Record<string, HistogramAggregate>;
  recentEvents: TelemetrySample[];
  pendingQueue: TelemetrySample[];
  startedWorkoutIds: string[];
  updatedAt: string;
}

function emptyStore(optOut = false): TelemetryStoreState {
  return {
    version: 1,
    optOut,
    counters: {},
    taggedCounters: {},
    histograms: {},
    recentEvents: [],
    pendingQueue: [],
    startedWorkoutIds: [],
    updatedAt: new Date().toISOString(),
  };
}

let memoryStore: TelemetryStoreState = emptyStore(false);
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;
let lifecycleListenersAttached = false;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

function loadStore(): TelemetryStoreState {
  if (!hasLocalStorage()) return memoryStore;
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) return emptyStore(memoryStore.optOut);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyStore(memoryStore.optOut);
    return {
      version: 1,
      optOut: Boolean(parsed.optOut),
      counters: parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : {},
      taggedCounters:
        parsed.taggedCounters && typeof parsed.taggedCounters === 'object' ? parsed.taggedCounters : {},
      histograms: parsed.histograms && typeof parsed.histograms === 'object' ? parsed.histograms : {},
      recentEvents: Array.isArray(parsed.recentEvents) ? parsed.recentEvents.slice(-MAX_RECENT_EVENTS) : [],
      pendingQueue: Array.isArray(parsed.pendingQueue) ? parsed.pendingQueue.slice(-MAX_PENDING_QUEUE) : [],
      startedWorkoutIds: Array.isArray(parsed.startedWorkoutIds)
        ? parsed.startedWorkoutIds.slice(-MAX_STARTED_WORKOUT_IDS)
        : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyStore(memoryStore.optOut);
  }
}

function saveStore(next: TelemetryStoreState): void {
  next.updatedAt = new Date().toISOString();
  memoryStore = next;
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Telemetry never blocks or throws on storage quota limits.
  }
}

export function detectTelemetryPlatform(): 'ios_app' | 'android_twa' | 'ios_web' | 'web' {
  try {
    const hc = getHealthConnectStatus();
    if (hc.provider === 'apple_health') return 'ios_app';
    if (hc.provider === 'health_connect' && hc.bridge) return 'android_twa';
    if (typeof window !== 'undefined' && (window as any).webkit?.messageHandlers?.treiseHealth) {
      return 'ios_app';
    }
    if (typeof document !== 'undefined' && document.referrer?.startsWith('android-app://')) {
      return 'android_twa';
    }
    if (isIosPlatform()) return 'ios_web';
  } catch {
    // Fallback to web
  }
  return 'web';
}

function isRealBrowserRuntime(): boolean {
  if (typeof process !== 'undefined' && process.versions?.node) return false;
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof window.addEventListener === 'function' &&
    typeof document.addEventListener === 'function'
  );
}

function attachBrowserLifecycleListeners(): void {
  if (lifecycleListenersAttached || !isRealBrowserRuntime()) {
    return;
  }
  lifecycleListenersAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushTelemetryQueue({ useBeacon: true });
    }
  });
  window.addEventListener('pagehide', () => {
    void flushTelemetryQueue({ useBeacon: true });
  });
  window.addEventListener('online', () => {
    scheduleTelemetryFlush(500);
  });
}

function scheduleTelemetryFlush(delayMs = FLUSH_DEBOUNCE_MS): void {
  if (!isRealBrowserRuntime()) return;
  attachBrowserLifecycleListeners();
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushTelemetryQueue();
  }, delayMs);
}

export function isTelemetryEnabled(): boolean {
  return !loadStore().optOut;
}

export function setTelemetryOptOut(optOut: boolean): void {
  const store = loadStore();
  if (store.optOut === optOut) return;
  store.optOut = optOut;
  if (optOut) {
    store.pendingQueue = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }
  saveStore(store);
}

/**
 * Records a validated anonymous metric locally and queues it for batched server ingestion.
 * Strictly no-ops when opted out or if the sample fails schema validation.
 */
export function trackMetric(
  name: TelemetryMetricName,
  value = 1,
  rawTags?: Record<string, string | number | boolean | undefined | null>
): TelemetrySample | null {
  const store = loadStore();
  if (store.optOut) return null;

  const mergedTags = {
    platform: detectTelemetryPlatform(),
    ...(rawTags ?? {}),
  };

  const valid = validateTelemetrySample({
    name,
    value,
    tags: mergedTags,
    at: new Date().toISOString(),
  });
  if (!valid) return null;

  const def = TELEMETRY_METRIC_DEFINITIONS[valid.name];
  if (def.kind === 'counter') {
    store.counters[valid.name] = (store.counters[valid.name] ?? 0) + valid.value;
    const tagKey = `${valid.name}|${canonicalTagsKey(valid.tags)}`;
    store.taggedCounters[tagKey] = (store.taggedCounters[tagKey] ?? 0) + valid.value;
  } else {
    const existing = store.histograms[valid.name];
    if (existing) {
      existing.count += 1;
      existing.sum = Math.round((existing.sum + valid.value) * 100) / 100;
      existing.min = Math.min(existing.min, valid.value);
      existing.max = Math.max(existing.max, valid.value);
    } else {
      store.histograms[valid.name] = {
        count: 1,
        sum: valid.value,
        min: valid.value,
        max: valid.value,
      };
    }
  }

  store.recentEvents = [...store.recentEvents, valid].slice(-MAX_RECENT_EVENTS);
  store.pendingQueue = [...store.pendingQueue, valid].slice(-MAX_PENDING_QUEUE);
  saveStore(store);
  scheduleTelemetryFlush();
  return valid;
}

/**
 * Marks a session ID as already underway on initial app load (when `completedSets > 0`)
 * without emitting a duplicate `workout.started` event.
 */
export function seedAlreadyStartedWorkout(workoutId: string): void {
  if (!workoutId) return;
  const store = loadStore();
  if (store.startedWorkoutIds.includes(workoutId)) return;
  store.startedWorkoutIds = [...store.startedWorkoutIds, workoutId].slice(-MAX_STARTED_WORKOUT_IDS);
  saveStore(store);
}

/**
 * Emits `workout.started` exactly once per unique `workoutId`, at the moment the athlete
 * logs their first completed set in that session.
 */
export function markWorkoutStartedIfFirstSet(params: {
  workoutId: string;
  programType?: string;
  goalPhase?: GoalPhase;
  location?: string;
  readiness?: ReadinessState;
  isFirstEverWorkout: boolean;
}): boolean {
  if (!params.workoutId) return false;
  const store = loadStore();
  if (store.optOut) return false;
  if (store.startedWorkoutIds.includes(params.workoutId)) return false;

  store.startedWorkoutIds = [...store.startedWorkoutIds, params.workoutId].slice(-MAX_STARTED_WORKOUT_IDS);
  saveStore(store);

  trackMetric('workout.started', 1, {
    program_type: normalizeProgramTypeTag(params.programType),
    goal_phase: params.goalPhase ?? 'Lean Bulk',
    location: params.location ?? 'gym',
    readiness: params.readiness ?? 'Normal',
    is_first_workout: params.isFirstEverWorkout ? 'true' : 'false',
  });
  return true;
}

/**
 * Records all completion, volume, duration, program week/block graduation, and strength-standard
 * advancement signals when an athlete finishes a workout, then flushes immediately.
 */
export function trackWorkoutCompletedMetrics(params: {
  workoutId: string;
  programType?: string;
  goalPhase?: GoalPhase;
  location?: string;
  readiness?: ReadinessState;
  isFirstEverWorkout: boolean;
  completedSetsCount: number;
  completedExercisesCount: number;
  durationMinutes?: number;
  strengthMilestone?: Milestone | null;
  weekMilestone?: Milestone | null;
  completedWeek?: number;
  isBlockCompleted?: boolean;
}): void {
  const store = loadStore();
  if (store.optOut) return;

  // Ensure workout.started was counted even if sets were batch-completed before finish
  if (params.workoutId && !store.startedWorkoutIds.includes(params.workoutId)) {
    markWorkoutStartedIfFirstSet({
      workoutId: params.workoutId,
      programType: params.programType,
      goalPhase: params.goalPhase,
      location: params.location,
      readiness: params.readiness,
      isFirstEverWorkout: params.isFirstEverWorkout,
    });
  }

  const progTag = normalizeProgramTypeTag(params.programType);
  const goalTag = params.goalPhase ?? 'Lean Bulk';
  const locTag = params.location ?? 'gym';
  const readinessTag = params.readiness ?? 'Normal';

  const milestoneTag = params.isBlockCompleted
    ? 'block'
    : params.weekMilestone
    ? 'week'
    : params.strengthMilestone
    ? 'strength'
    : 'none';

  trackMetric('workout.completed', 1, {
    program_type: progTag,
    goal_phase: goalTag,
    location: locTag,
    readiness: readinessTag,
    is_first_workout: params.isFirstEverWorkout ? 'true' : 'false',
    milestone: milestoneTag,
  });

  if (params.completedSetsCount > 0) {
    trackMetric('workout.sets_completed', params.completedSetsCount, {
      program_type: progTag,
      goal_phase: goalTag,
      location: locTag,
    });
  }

  if (params.completedExercisesCount > 0) {
    trackMetric('workout.exercises_completed', params.completedExercisesCount, {
      program_type: progTag,
      goal_phase: goalTag,
      location: locTag,
    });
  }

  if (typeof params.durationMinutes === 'number' && params.durationMinutes > 0) {
    trackMetric('workout.duration_min', params.durationMinutes, {
      program_type: progTag,
      goal_phase: goalTag,
      location: locTag,
      readiness: readinessTag,
    });
  }

  if (params.weekMilestone) {
    if (params.isBlockCompleted) {
      trackMetric('program.completed', 1, {
        program_type: progTag,
        goal_phase: goalTag,
      });
    } else {
      trackMetric('program.week_completed', 1, {
        program_type: progTag,
        goal_phase: goalTag,
        week: params.completedWeek ? String(params.completedWeek) : 'unknown',
      });
    }
  }

  if (params.strengthMilestone) {
    trackMetric('goal.strength_advanced', 1, {
      pillar: params.strengthMilestone.pillar ?? 'unknown',
      tier: params.strengthMilestone.tag ?? params.strengthMilestone.title ?? 'advanced',
    });
  }

  if (isRealBrowserRuntime()) {
    void flushTelemetryQueue();
  }
}

/**
 * Flushes pending telemetry samples to `/api/telemetry/ingest` in bounded aggregated batches.
 */
export async function flushTelemetryQueue(options?: {
  fetchImpl?: typeof fetch;
  useBeacon?: boolean;
}): Promise<{ sent: number; remaining: number }> {
  const store = loadStore();
  if (store.optOut || store.pendingQueue.length === 0) {
    return { sent: 0, remaining: 0 };
  }
  if (flushInFlight && !options?.useBeacon) {
    return { sent: 0, remaining: store.pendingQueue.length };
  }

  const fetchFn =
    options?.fetchImpl ?? (typeof window !== 'undefined' && typeof fetch === 'function' ? fetch : null);
  const canUseBeacon =
    Boolean(options?.useBeacon) &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function' &&
    typeof Blob !== 'undefined';

  if (!fetchFn && !canUseBeacon) {
    return { sent: 0, remaining: store.pendingQueue.length };
  }
  if (!options?.fetchImpl && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, remaining: store.pendingQueue.length };
  }

  // Pull up to 60 raw events so collapsing repeated counters yields <= 25 aggregated items
  const chunkRaw = store.pendingQueue.slice(0, 60);
  const batch = aggregateTelemetryBatch(chunkRaw, MAX_INGEST_BATCH_SIZE);
  if (batch.length === 0) {
    store.pendingQueue = store.pendingQueue.slice(chunkRaw.length);
    saveStore(store);
    return { sent: 0, remaining: store.pendingQueue.length };
  }

  const payload = JSON.stringify({ events: batch });

  if (canUseBeacon) {
    try {
      const ok = navigator.sendBeacon(
        '/api/telemetry/ingest',
        new Blob([payload], { type: 'application/json' })
      );
      if (ok) {
        const latest = loadStore();
        latest.pendingQueue = latest.pendingQueue.slice(chunkRaw.length);
        saveStore(latest);
        return { sent: batch.length, remaining: latest.pendingQueue.length };
      }
    } catch {
      // Fall through to fetch keepalive if beacon fails
    }
  }

  if (!fetchFn) {
    return { sent: 0, remaining: store.pendingQueue.length };
  }

  flushInFlight = true;
  try {
    const res = await fetchFn('/api/telemetry/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
    if (res && res.ok) {
      const latest = loadStore();
      latest.pendingQueue = latest.pendingQueue.slice(chunkRaw.length);
      saveStore(latest);
      return { sent: batch.length, remaining: latest.pendingQueue.length };
    }
    return { sent: 0, remaining: store.pendingQueue.length };
  } catch {
    return { sent: 0, remaining: store.pendingQueue.length };
  } finally {
    flushInFlight = false;
  }
}

export function getTelemetryStoreSnapshot(): TelemetryStoreState {
  return loadStore();
}

export function getTelemetryGoalsSummary(): TelemetryGoalsSummary {
  const store = loadStore();
  return computeTelemetryGoalsSummary({
    counters: store.counters,
    histograms: store.histograms,
    taggedCounters: store.taggedCounters,
  });
}

export function exportTelemetryReportJSON(): string {
  const store = loadStore();
  const summary = getTelemetryGoalsSummary();
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      telemetryEnabled: !store.optOut,
      goalsFramework: PRODUCT_TELEMETRY_GOALS,
      summary,
      counters: store.counters,
      histograms: store.histograms,
      recentEvents: store.recentEvents,
    },
    null,
    2
  );
}

export function clearTelemetryData(preserveOptOut = false): void {
  const prevOptOut = preserveOptOut ? loadStore().optOut : false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  memoryStore = emptyStore(prevOptOut);
  if (!hasLocalStorage()) return;
  try {
    if (preserveOptOut && prevOptOut) {
      localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(memoryStore));
    } else {
      localStorage.removeItem(TELEMETRY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage removal errors
  }
}
