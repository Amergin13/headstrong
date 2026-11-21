import { DetectedActivity } from '../engine/activeDays';
import { BiometricLog } from '../engine/types';
import { formatPreciseWeight, WeightUnit } from '../utils/units';
import { toDetectedActivities } from './activitySources';
import {
  getHealthConnectStatus,
  HealthConnectBiometricDay,
  HealthConnectBiometricsResult,
  HealthConnectProfileData,
  readHealthConnectBiometricsWithProfile,
  readHealthConnectSessions,
  readHealthConnectSteps,
} from './healthConnectBridge';
import {
  extractHealthConnectDemographics,
  HealthConnectDemographics,
} from './healthConnectProfile';
import { parseHealthConnectExport } from './healthConnectService';
import { mergeDailySteps, mergeHealthConnectBiometrics } from './wearableSyncService';

export {
  computeAgeFromBirthDate,
  extractHealthConnectDemographics,
  mergeHealthConnectProfile,
  parseHeightCmValue,
  parseSexValue,
} from './healthConnectProfile';
export type { HealthConnectDemographics } from './healthConnectProfile';

export interface OnboardingHealthImportResult extends HealthConnectDemographics {
  source: 'health_connect_bridge' | 'health_connect_export';
  /** Normalized daily biometric/recovery/body/step logs ready to merge into app biometrics. */
  biometrics: BiometricLog[];
  /** Detected recent non-lifting/exercise sessions from Health Connect ready to merge into activities. */
  activities: DetectedActivity[];
  /** Latest real bodyweight found in the imported records (kg), if any. */
  latestBodyweightKg?: number;
  /** Latest resting heart rate found in the imported records (bpm), if any. */
  latestRestingHr?: number;
  /** Recent average sleep duration found in the imported records (hours), if any. */
  avgSleepHours?: number;
  /** Count of days with at least one recovery/body/step metric. */
  biometricDaysCount: number;
  /** Count of recent workout/activity sessions imported. */
  sessionsCount: number;
}

const DEFAULT_LOOKBACK_DAYS = 29;

function summarizeExtractedMetrics(
  biometrics: BiometricLog[],
  activities: DetectedActivity[],
  extra?: HealthConnectDemographics
): Omit<OnboardingHealthImportResult, 'source'> {
  const ordered = [...biometrics].sort((a, b) => a.date.localeCompare(b.date));
  let latestBodyweightKg: number | undefined;
  let latestRestingHr: number | undefined;
  const sleepSamples: number[] = [];

  for (const log of ordered) {
    if (log.bodyweightKg && log.bodyweightKg > 0) latestBodyweightKg = Math.round(log.bodyweightKg * 10) / 10;
    if (log.restingHr && log.restingHr > 0) latestRestingHr = Math.round(log.restingHr);
    if (log.sleepHours && log.sleepHours > 0) sleepSamples.push(log.sleepHours);
  }

  const avgSleepHours =
    sleepSamples.length > 0
      ? Math.round((sleepSamples.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, sleepSamples.length)) * 10) / 10
      : undefined;

  const biometricDaysCount = ordered.filter(
    (b) =>
      b.bodyweightKg > 0 ||
      b.sleepHours > 0 ||
      b.restingHr > 0 ||
      b.hrvRmssd > 0 ||
      b.steps > 0 ||
      Boolean(b.bodyFatPct && b.bodyFatPct > 0)
  ).length;

  return {
    biometrics: ordered,
    activities,
    latestBodyweightKg,
    latestHeightCm: extra?.latestHeightCm,
    latestRestingHr,
    avgSleepHours,
    gender: extra?.gender,
    age: extra?.age,
    biometricDaysCount,
    sessionsCount: activities.length,
  };
}

/**
 * Pulls real read-only history from Android Health Connect (when running in the Treise Android app
 * with at least one Health Connect permission granted). Never fabricates readings.
 */
export async function importFromHealthConnectBridge(
  lookbackDays = DEFAULT_LOOKBACK_DAYS
): Promise<OnboardingHealthImportResult> {
  const status = getHealthConnectStatus();
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [bioRes, stepsRes, sessRes] = await Promise.allSettled([
    status.biometricsGranted || status.heightGranted
      ? readHealthConnectBiometricsWithProfile(since)
      : Promise.resolve<HealthConnectBiometricsResult>({ days: [] }),
    status.stepsGranted ? readHealthConnectSteps(since) : Promise.resolve([]),
    status.granted ? readHealthConnectSessions(since) : Promise.resolve([]),
  ]);

  const rawBioResult: HealthConnectBiometricsResult =
    bioRes.status === 'fulfilled' ? bioRes.value : { days: [] };
  const rawBioDays: HealthConnectBiometricDay[] = rawBioResult.days;
  const bridgeProfile: HealthConnectProfileData | undefined = rawBioResult.profile;
  const rawSteps = stepsRes.status === 'fulfilled' ? stepsRes.value : [];
  const rawSessions = sessRes.status === 'fulfilled' ? sessRes.value : [];

  let mergedBiometrics = mergeHealthConnectBiometrics([], rawBioDays);
  if (rawSteps.length > 0) {
    mergedBiometrics = mergeDailySteps(mergedBiometrics, rawSteps, 'health_connect');
  }

  const demographics = extractHealthConnectDemographics({
    profile: bridgeProfile,
    days: rawBioDays,
  });

  const activities = rawSessions.length > 0 ? toDetectedActivities('health_connect', rawSessions) : [];

  return {
    source: 'health_connect_bridge',
    ...summarizeExtractedMetrics(mergedBiometrics, activities, demographics),
  };
}

/**
 * Parses a real user-provided Health Connect / health JSON export into onboarding baseline stats
 * and biometric history. Throws on invalid JSON; never invents missing values.
 */
export function importFromHealthConnectJson(
  rawJson: string,
  referenceDate: Date = new Date()
): OnboardingHealthImportResult {
  const parsedObj = JSON.parse(rawJson);
  const biometrics = parseHealthConnectExport(parsedObj);
  const demographics = extractHealthConnectDemographics(parsedObj, referenceDate);

  return {
    source: 'health_connect_export',
    ...summarizeExtractedMetrics(biometrics, [], demographics),
  };
}

/** Concise, truthful 1-line summary of what Health Connect actually imported. */
export function formatOnboardingHealthSummary(
  result: OnboardingHealthImportResult,
  weightUnit: WeightUnit
): string {
  const parts: string[] = [];
  if (result.gender) {
    parts.push(result.gender === 'male' ? 'Male' : 'Female');
  }
  if (result.age && result.age > 0) {
    parts.push(`${result.age} yrs`);
  }
  if (result.latestBodyweightKg && result.latestBodyweightKg > 0) {
    parts.push(formatPreciseWeight(result.latestBodyweightKg, weightUnit));
  }
  if (result.latestHeightCm && result.latestHeightCm > 0) {
    parts.push(`${result.latestHeightCm} cm`);
  }
  if (result.biometricDaysCount > 0) {
    parts.push(`${result.biometricDaysCount} ${result.biometricDaysCount === 1 ? 'day' : 'days'} of health history`);
  }
  if (result.sessionsCount > 0) {
    parts.push(`${result.sessionsCount} recent ${result.sessionsCount === 1 ? 'workout' : 'workouts'}`);
  }
  if (parts.length === 0) {
    return 'Connected — no recent Health Connect records found yet.';
  }
  return parts.join(' · ');
}
