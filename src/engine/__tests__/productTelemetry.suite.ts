import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MAX_INGEST_BATCH_SIZE,
  PRODUCT_TELEMETRY_GOALS,
  TELEMETRY_METRIC_DEFINITIONS,
  TelemetryMetricName,
  TelemetrySample,
  aggregateTelemetryBatch,
  computeTelemetryGoalsSummary,
  isTelemetryMetricName,
  sanitizeTelemetryTags,
  validateTelemetrySample,
} from '../telemetrySchema';
import {
  TELEMETRY_STORAGE_KEY,
  clearTelemetryData,
  exportTelemetryReportJSON,
  flushTelemetryQueue,
  getTelemetryGoalsSummary,
  getTelemetryStoreSnapshot,
  isTelemetryEnabled,
  markWorkoutStartedIfFirstSet,
  seedAlreadyStartedWorkout,
  setTelemetryOptOut,
  trackMetric,
  trackWorkoutCompletedMetrics,
} from '../../services/telemetry';
import { permanentlyEraseAllUserData } from '../../services/storage';

type AssertFn = (condition: boolean, message: string) => void;

export async function runProductTelemetrySuite(assert: AssertFn): Promise<void> {
  console.log('\n--- 81. Product Usage Telemetry & Goals-Signals-Metrics (GSM) Pipeline ---');
  const root = process.cwd();
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  // -------------------------------------------------------------------------
  // 1. Canonical GSM Schema Completeness & Non-Reserved Naming
  // -------------------------------------------------------------------------
  const allDefinedMetricNames = Object.keys(TELEMETRY_METRIC_DEFINITIONS) as TelemetryMetricName[];
  const mappedGoalMetrics = new Set<TelemetryMetricName>(
    PRODUCT_TELEMETRY_GOALS.flatMap((g) => g.metrics)
  );
  const unmappedMetrics = allDefinedMetricNames.filter((m) => !mappedGoalMetrics.has(m));
  const missingDefs = [...mappedGoalMetrics].filter((m) => !TELEMETRY_METRIC_DEFINITIONS[m]);
  const reservedNames = allDefinedMetricNames.filter((m) => m.startsWith('vercel.'));

  assert(
    PRODUCT_TELEMETRY_GOALS.length === 6 &&
      allDefinedMetricNames.length >= 30 &&
      unmappedMetrics.length === 0 &&
      missingDefs.length === 0 &&
      reservedNames.length === 0,
    `All ${allDefinedMetricNames.length} telemetry metrics map 1:1 across 6 product goals with zero reserved vercel.* prefixes`
  );

  // -------------------------------------------------------------------------
  // 2. Strict PII Scrubbing & Low-Cardinality Tag Validation
  // -------------------------------------------------------------------------
  assert(
    !isTelemetryMetricName('vercel.request.count') &&
      !isTelemetryMetricName('unknown.custom_event') &&
      validateTelemetrySample({ name: 'workout.started', value: 0 }) === null &&
      validateTelemetrySample({ name: 'workout.started', value: -3 }) === null &&
      validateTelemetrySample({ name: 'workout.started', value: NaN }) === null,
    'validateTelemetrySample rejects reserved vercel.* names, unknown metric names, and non-positive/NaN values'
  );

  const scrubbedTags = sanitizeTelemetryTags('workout.completed', {
    program_type: 'custom_plan_1764200000_secret_sheet',
    goal_phase: 'Lean Bulk',
    location: 'gym',
    readiness: 'Primed',
    is_first_workout: true,
    milestone: 'block',
    // Attempted PII & unlisted keys (must all be stripped!)
    name: 'Jordan Taylor',
    email: 'jordan@example.com',
    userId: 'usr_998877',
    bodyweightKg: 82.4,
    hrv: 68,
    weightKg: 100,
    prompt: 'My shoulder hurts',
  });
  assert(
    scrubbedTags.program_type === 'custom_plan' &&
      scrubbedTags.goal_phase === 'Lean Bulk' &&
      scrubbedTags.milestone === 'block' &&
      !('name' in scrubbedTags) &&
      !('email' in scrubbedTags) &&
      !('userId' in scrubbedTags) &&
      !('bodyweightKg' in scrubbedTags) &&
      !('hrv' in scrubbedTags) &&
      !('weightKg' in scrubbedTags) &&
      !('prompt' in scrubbedTags),
    'sanitizeTelemetryTags normalizes custom_plan IDs and strips all PII, health readings, lift weights, and prompt text'
  );

  const emailInAllowedField = sanitizeTelemetryTags('workout.completed', {
    location: 'user@example.com',
    readiness: 'https://evil.example/leak',
  });
  assert(
    !('location' in emailInAllowedField) && !('readiness' in emailInAllowedField),
    'sanitizeTelemetryTags strips email addresses and URLs even if passed inside an allowed tag key'
  );

  // -------------------------------------------------------------------------
  // 3. Batch Aggregation Collapses Repeated Counter Increments & Preserves Histograms
  // -------------------------------------------------------------------------
  const rawSamples: TelemetrySample[] = [
    ...Array.from({ length: 12 }, () => ({
      name: 'workout.set_completed' as const,
      value: 1,
      tags: { platform: 'ios_app', program_type: 'starter_6wk', set_type: 'working' },
    })),
    {
      name: 'workout.duration_min',
      value: 44,
      tags: { platform: 'ios_app', program_type: 'starter_6wk' },
    },
    {
      name: 'workout.duration_min',
      value: 52,
      tags: { platform: 'ios_app', program_type: 'starter_6wk' },
    },
  ];
  const aggregated = aggregateTelemetryBatch(rawSamples, MAX_INGEST_BATCH_SIZE);
  const setCounter = aggregated.find((s) => s.name === 'workout.set_completed');
  const durationSamples = aggregated.filter((s) => s.name === 'workout.duration_min');
  assert(
    aggregated.length === 3 &&
      setCounter?.value === 12 &&
      durationSamples.length === 2 &&
      durationSamples[0].value === 44 &&
      durationSamples[1].value === 52,
    'aggregateTelemetryBatch collapses 12 identical workout.set_completed taps into 1 sample (value=12) while keeping histogram durations distinct'
  );

  // -------------------------------------------------------------------------
  // 4. End-to-End Lifecycle: Onboarding -> Workout Start (Idempotent) -> Complete -> Program Change & Graduation
  // -------------------------------------------------------------------------
  clearTelemetryData(false);
  assert(isTelemetryEnabled(), 'Product telemetry is enabled by default on a clean state');

  trackMetric('onboarding.started', 1, { mode: 'initial' });
  trackMetric('onboarding.step_viewed', 1, { step: '1', mode: 'initial' });
  trackMetric('onboarding.duration_sec', 42, { mode: 'initial', health_connected: 'true' });
  trackMetric('onboarding.completed', 1, {
    mode: 'initial',
    program_type: 'starter_6wk',
    goal_phase: 'Lean Bulk',
    location: 'gym',
    health_connected: 'true',
  });

  // Session 1: Set 1 starts the workout once; Sets 2 & 3 do NOT re-fire workout.started!
  const startedFirst = markWorkoutStartedIfFirstSet({
    workoutId: 'session-day-1',
    programType: 'starter_6wk',
    goalPhase: 'Lean Bulk',
    location: 'gym',
    readiness: 'Normal',
    isFirstEverWorkout: true,
  });
  const startedDuplicate = markWorkoutStartedIfFirstSet({
    workoutId: 'session-day-1',
    programType: 'starter_6wk',
    goalPhase: 'Lean Bulk',
    location: 'gym',
    readiness: 'Normal',
    isFirstEverWorkout: true,
  });
  assert(
    startedFirst === true && startedDuplicate === false,
    'markWorkoutStartedIfFirstSet fires workout.started exactly once per unique workoutId'
  );

  // Mid-session reload seeding also prevents duplicate workout.started
  seedAlreadyStartedWorkout('session-resumed-2');
  const resumedDuplicate = markWorkoutStartedIfFirstSet({
    workoutId: 'session-resumed-2',
    programType: 'starter_6wk',
    goalPhase: 'Lean Bulk',
    location: 'gym',
    readiness: 'Normal',
    isFirstEverWorkout: false,
  });
  assert(
    resumedDuplicate === false,
    'seedAlreadyStartedWorkout prevents re-counting workout.started when resuming an in-progress workout'
  );

  for (let i = 0; i < 9; i++) {
    trackMetric('workout.set_completed', 1, {
      program_type: 'starter_6wk',
      goal_phase: 'Lean Bulk',
      location: 'gym',
      set_type: 'working',
    });
  }
  trackMetric('workout.exercise_swapped', 1, {
    program_type: 'starter_6wk',
    scope: 'permanent',
    calibration: 'ANCHOR_PRIOR',
    source: 'swap_modal',
  });

  trackWorkoutCompletedMetrics({
    workoutId: 'session-day-1',
    programType: 'starter_6wk',
    goalPhase: 'Lean Bulk',
    location: 'gym',
    readiness: 'Normal',
    isFirstEverWorkout: true,
    completedSetsCount: 9,
    completedExercisesCount: 3,
    durationMinutes: 46,
    weekMilestone: {
      tag: 'Block complete',
      title: 'Block complete',
      description: 'Finished all 6 weeks!',
    },
    isBlockCompleted: true,
    strengthMilestone: {
      tag: 'Intermediate I',
      title: 'Strength level up',
      description: 'Bench press moved up',
      pillar: 'Horizontal Push',
    },
  });

  // Program switch + Coach apply/undo signals
  trackMetric('program.changed', 1, {
    from_program: 'starter_6wk',
    to_program: 'starter_4day',
    goal_phase: 'Lean Bulk',
    source: 'picker',
  });
  trackMetric('coach.action_applied', 1, { tool_name: 'swap_exercise' });
  trackMetric('coach.action_applied', 1, { tool_name: 'adjust_sets' });
  trackMetric('coach.action_undone', 1, { tool_name: 'adjust_sets' });

  const summary = getTelemetryGoalsSummary();
  const dummySummaryCheck = computeTelemetryGoalsSummary({
    counters: getTelemetryStoreSnapshot().counters,
    histograms: getTelemetryStoreSnapshot().histograms,
    taggedCounters: getTelemetryStoreSnapshot().taggedCounters,
  });
  assert(
    summary.activation.onboardingsStarted === 1 &&
      summary.activation.onboardingsCompleted === 1 &&
      summary.activation.onboardingCompletionRatePct === 100 &&
      summary.activation.day1ActivationRatePct === 100 &&
      summary.workoutExecution.workoutsStarted === 1 &&
      summary.workoutExecution.workoutsCompleted === 1 &&
      summary.workoutExecution.workoutCompletionRatePct === 100 &&
      summary.workoutExecution.setsCompleted === 9 &&
      summary.workoutExecution.avgWorkoutDurationMin === 46 &&
      summary.workoutCustomization.exercisesSwapped === 1 &&
      summary.workoutCustomization.permanentSwaps === 1 &&
      summary.programAdherence.programsChanged === 1 &&
      summary.programAdherence.programsCompleted === 1 &&
      summary.goalAttainment.strengthStandardsAdvanced === 1 &&
      summary.coachAndEcosystem.coachActionsApplied === 2 &&
      summary.coachAndEcosystem.coachActionsUndone === 1 &&
      summary.coachAndEcosystem.coachActionRetentionRatePct === 50 &&
      JSON.stringify(summary) === JSON.stringify(dummySummaryCheck),
    `computeTelemetryGoalsSummary computes accurate conversion, completion, swap, graduation, and coach retention KPIs`
  );

  // -------------------------------------------------------------------------
  // 5. Network Batch Flush, Offline Retry, Opt-Out & Full Data Erasure
  // -------------------------------------------------------------------------
  const postedBatches: TelemetrySample[][] = [];
  // Simulate offline failure first -> queue stays intact
  const failedFlush = await flushTelemetryQueue({
    fetchImpl: (async () => ({ ok: false, status: 503 } as Response)) as typeof fetch,
  });
  assert(
    failedFlush.sent === 0 && failedFlush.remaining > 0,
    'Failed telemetry flush retains pending events for offline retry'
  );

  // Simulate online 202 ingestion -> queue drains and collapses 9 set_completed counters into 1 item
  const okFlush = await flushTelemetryQueue({
    fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body || '{}'));
      postedBatches.push(parsed.events || []);
      return { ok: true, status: 202 } as Response;
    }) as typeof fetch,
  });
  const flushedSetSample = postedBatches[0]?.find((e) => e.name === 'workout.set_completed');
  assert(
    okFlush.sent > 0 &&
      okFlush.remaining === 0 &&
      postedBatches.length === 1 &&
      flushedSetSample?.value === 9,
    'Successful telemetry flush sends aggregated batch to /api/telemetry/ingest and drains queue'
  );

  // Export JSON report contains schema + goals + summary without PII
  const exportedJson = exportTelemetryReportJSON();
  const exportedParsed = JSON.parse(exportedJson);
  assert(
    exportedParsed.schemaVersion === 1 &&
      exportedParsed.summary.workoutExecution.workoutsCompleted === 1 &&
      Array.isArray(exportedParsed.goalsFramework) &&
      exportedParsed.goalsFramework.length === 6,
    'exportTelemetryReportJSON exports structured GSM report cleanly'
  );

  // Opt-out immediately halts tracking and clears pending queue
  setTelemetryOptOut(true);
  assert(!isTelemetryEnabled(), 'setTelemetryOptOut(true) disables telemetry');
  const blockedEvent = trackMetric('workout.started', 1, { program_type: 'starter_6wk' });
  assert(
    blockedEvent === null && getTelemetryStoreSnapshot().pendingQueue.length === 0,
    'Opted-out state blocks new events and keeps pendingQueue empty'
  );
  setTelemetryOptOut(false);

  // Full account/data deletion wipes treise_telemetry_v1
  trackMetric('navigation.tab_viewed', 1, { tab: 'train' });
  permanentlyEraseAllUserData();
  clearTelemetryData(false);
  assert(
    (typeof localStorage === 'undefined' || localStorage.getItem(TELEMETRY_STORAGE_KEY) === null) &&
      getTelemetryGoalsSummary().workoutExecution.workoutsStarted === 0,
    'permanentlyEraseAllUserData + clearTelemetryData wipe all stored telemetry counters and events'
  );

  // -------------------------------------------------------------------------
  // 6. Static Wiring Verification Across App, TrainTab, Coach, Settings, API & Privacy Policy
  // -------------------------------------------------------------------------
  const appSrc = read('src/App.tsx');
  const trainSrc = read('src/components/train/TrainTab.tsx');
  const coachModalSrc = read('src/components/assistant/AICoachChatModal.tsx');
  const onboardingSrc = read('src/components/onboarding/OnboardingModal.tsx');
  const settingsSrc = read('src/components/auth/ProfileSettingsSections.tsx');
  const ingestApiSrc = read('api/telemetry/ingest.ts');
  const privacySrc = read('public/privacy.html');
  const privacyMirrorSrc = read('public/privacy/index.html');

  assert(
    appSrc.includes('markWorkoutStartedIfFirstSet') &&
      appSrc.includes('trackWorkoutCompletedMetrics') &&
      appSrc.includes("trackMetric('program.changed'") &&
      appSrc.includes("trackMetric('program.goal_changed'") &&
      trainSrc.includes("trackMetric('workout.exercise_swapped'") &&
      trainSrc.includes("trackMetric('recovery.modulation_applied'") &&
      coachModalSrc.includes("trackMetric('coach.action_applied'") &&
      coachModalSrc.includes("trackMetric('coach.action_undone'") &&
      onboardingSrc.includes("trackMetric('onboarding.started'") &&
      onboardingSrc.includes("trackMetric('onboarding.duration_sec'") &&
      settingsSrc.includes('aria-label="Anonymous product metrics"') &&
      settingsSrc.includes('exportTelemetryReportJSON') &&
      ingestApiSrc.includes('emitServerMetric') &&
      privacySrc === privacyMirrorSrc &&
      privacySrc.includes('/api/telemetry/ingest') &&
      privacySrc.includes('Anonymous product metrics'),
    'Core telemetry hooks, Settings opt-out + export, /api/telemetry/ingest, and privacy.html are wired end-to-end'
  );
}
