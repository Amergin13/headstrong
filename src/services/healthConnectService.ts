import { BiometricLog, ReadinessState, WearableSyncProgress } from '../engine/types';
import { localDateString } from '../utils/date';
import type { RawSourceSession } from './activitySources';
import {
  computeAgeFromBirthDate,
  HealthConnectDemographics,
  parseHeightCmValue,
  parseSexValue,
} from './healthConnectProfile';

export const HEALTH_CONNECT_CONFIG = {
  PACKAGE_NAME: 'com.google.android.apps.healthdata',
  SETTINGS_ACTION: 'androidx.health.ACTION_HEALTH_CONNECT_SETTINGS',
  PERMISSIONS_ACTION: 'androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS',
  PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata',
  RECORD_TYPES: [
    'ExerciseSessionRecord',
    'HeartRateRecord',
    'HeartRateVariabilityRmssdRecord',
    'RestingHeartRateRecord',
    'SleepSessionRecord',
    'StepsRecord',
    'WeightRecord',
    'HeightRecord',
    'BodyFatRecord',
    'Vo2MaxRecord',
    'ActiveCaloriesBurnedRecord',
  ],
};

/**
 * Checks whether the current device is running on an Android platform
 * supporting Android Health Connect.
 */
export function isAndroidPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua);
}

/**
 * Checks whether the current device is running on iOS / iPadOS (supporting Apple HealthKit).
 */
export function isIosPlatform(userAgentOverride?: string, maxTouchPointsOverride?: number): boolean {
  const ua =
    userAgentOverride !== undefined
      ? userAgentOverride
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';
  const touchPoints =
    maxTouchPointsOverride !== undefined
      ? maxTouchPointsOverride
      : typeof navigator !== 'undefined'
      ? navigator.maxTouchPoints || 0
      : 0;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && touchPoints > 1) return true;
  return false;
}

/** Returns the native OS health hub name for the current device ('Apple Health' on iOS, 'Health Connect' on Android). */
export function resolveNativeHealthHubName(isIos = isIosPlatform()): 'Apple Health' | 'Health Connect' {
  return isIos ? 'Apple Health' : 'Health Connect';
}

/**
 * Attempts to launch Android Health Connect system settings or permission rationale.
 * Uses Android Intent URI when available, with a web fallback.
 */
export function openHealthConnectSettings(): { launched: boolean; method: string } {
  if (typeof window === 'undefined') {
    return { launched: false, method: 'none' };
  }

  const isAndroid = isAndroidPlatform();

  if (isAndroid) {
    try {
      // Android Intent scheme targeting Health Connect settings
      const intentUri = `intent:#Intent;action=${HEALTH_CONNECT_CONFIG.SETTINGS_ACTION};package=${HEALTH_CONNECT_CONFIG.PACKAGE_NAME};end`;
      window.location.href = intentUri;
      return { launched: true, method: 'android_intent' };
    } catch {
      // Fallback: open Play Store / Web settings
      window.open(HEALTH_CONNECT_CONFIG.PLAY_STORE_URL, '_blank');
      return { launched: true, method: 'play_store_fallback' };
    }
  }

  return { launched: false, method: 'non_android' };
}

/**
 * Parses raw JSON data exported from Android Health Connect, Google Takeout,
 * or Samsung Health export format into normalized BiometricLog records.
 */
export function parseHealthConnectExport(rawInput: string | Record<string, any>): BiometricLog[] {
  let data: any;

  if (typeof rawInput === 'string') {
    try {
      data = JSON.parse(rawInput);
    } catch {
      throw new Error('Invalid JSON string provided for Health Connect import.');
    }
  } else {
    data = rawInput;
  }

  const logsByDate = new Map<string, Partial<BiometricLog>>();

  const getOrCreate = (dateStr: string): Partial<BiometricLog> => {
    let entry = logsByDate.get(dateStr);
    if (!entry) {
      entry = {
        date: dateStr,
        // Not in the file = not measured (0), never a typical-looking default.
        bodyweightKg: 0,
        hrvRmssd: 0,
        restingHr: 0,
        sleepHours: 0,
        steps: 0,
        activeZoneMinutes: 0,
        vo2Max: 0,
      };
      logsByDate.set(dateStr, entry);
    }
    return entry;
  };

  // 1. Direct BiometricLog array format
  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (item && item.date) {
        const entry = getOrCreate(item.date);
        Object.assign(entry, item);
      }
    });
  }

  // 2. Health Connect Record Containers
  // Records could be organized under data.records or data.Data or top-level arrays
  const recordList = data.records || data.Data || (data.HeartRateVariabilityRmssdRecord ? [data] : []);

  if (Array.isArray(recordList)) {
    recordList.forEach((rec: any) => {
      const isSleep = rec.type === 'SleepSessionRecord' || rec.stage !== undefined;
      const timeStr = isSleep
        ? rec.endTime || rec.startTime || rec.time || rec.date
        : rec.time || rec.startTime || rec.endTime || rec.date;
      if (!timeStr) return;
      const raw = String(timeStr);
      const parsedTime = new Date(raw);
      const dateStr = raw.includes('T') && !Number.isNaN(parsedTime.getTime()) ? localDateString(parsedTime) : raw.slice(0, 10);
      const entry = getOrCreate(dateStr);

      // HRV RMSSD Record
      if (rec.type === 'HeartRateVariabilityRmssdRecord' || rec.heartRateVariabilityMillis !== undefined || rec.rmssd !== undefined) {
        const val = rec.heartRateVariabilityMillis || rec.rmssd || rec.value;
        if (typeof val === 'number') entry.hrvRmssd = Math.round(val);
      }

      // Resting Heart Rate Record
      if (rec.type === 'RestingHeartRateRecord' || rec.beatsPerMinute !== undefined || rec.restingHeartRate !== undefined) {
        const val = rec.beatsPerMinute || rec.restingHeartRate || rec.value;
        if (typeof val === 'number') entry.restingHr = Math.round(val);
      }

      // Sleep Session Record
      if (rec.type === 'SleepSessionRecord' || (rec.startTime && rec.endTime && rec.stage !== undefined)) {
        if (rec.startTime && rec.endTime) {
          const diffMs = new Date(rec.endTime).getTime() - new Date(rec.startTime).getTime();
          if (diffMs > 0) {
            entry.sleepHours = Math.round((diffMs / 3600000) * 10) / 10;
          }
        } else if (typeof rec.durationHours === 'number') {
          entry.sleepHours = rec.durationHours;
        }
      }

      // Steps Record
      if (rec.type === 'StepsRecord' || rec.count !== undefined || rec.steps !== undefined) {
        const val = rec.count ?? rec.steps;
        if (typeof val === 'number') entry.steps = (entry.steps || 0) + val;
      }

      // Weight Record
      if (rec.type === 'WeightRecord' || rec.weightKg !== undefined || rec.mass !== undefined) {
        const val = rec.weightKg ?? rec.mass?.inKilograms ?? rec.weight;
        if (typeof val === 'number') entry.bodyweightKg = Math.round(val * 10) / 10;
      }

      // Body Fat Record
      if (rec.type === 'BodyFatRecord' || rec.percentage !== undefined || rec.bodyFatPct !== undefined) {
        const val = rec.percentage ?? rec.bodyFatPct;
        if (typeof val === 'number' && val > 0 && val < 75) {
          entry.bodyFatPct = Math.round(val * 10) / 10;
        }
      }

      // Lean Body Mass Record
      if (rec.type === 'LeanBodyMassRecord' || rec.leanMassKg !== undefined || rec.fatFreeMassKg !== undefined) {
        const val = rec.leanMassKg ?? rec.fatFreeMassKg ?? rec.mass?.inKilograms;
        if (typeof val === 'number' && val > 10) {
          entry.fatFreeMassKg = Math.round(val * 10) / 10;
        }
      }

      // Bone Mass Record
      if (rec.type === 'BoneMassRecord' || rec.boneMassKg !== undefined) {
        const val = rec.boneMassKg ?? rec.mass?.inKilograms;
        if (typeof val === 'number' && val > 0.5) {
          entry.boneMassKg = Math.round(val * 100) / 100;
        }
      }

      // Basal Metabolic Rate Record
      if (rec.type === 'BasalMetabolicRateRecord' || rec.bmrKcal !== undefined || rec.basalMetabolicRate !== undefined) {
        const val = rec.bmrKcal ?? rec.basalMetabolicRate?.inKilocaloriesPerDay;
        if (typeof val === 'number' && val > 500) {
          entry.bmrKcal = Math.round(val);
        }
      }

      // VO2 Max Record
      if (rec.type === 'Vo2MaxRecord' || rec.vo2MillilitersPerMinuteKilogram !== undefined) {
        const val = rec.vo2MillilitersPerMinuteKilogram || rec.vo2Max;
        if (typeof val === 'number') entry.vo2Max = Math.round(val * 10) / 10;
      }
    });
  }

  const parsedLogs: BiometricLog[] = Array.from(logsByDate.values()).map((p) => ({
    ...p,
    date: p.date || localDateString(),
    bodyweightKg: p.bodyweightKg || 0,
    hrvRmssd: p.hrvRmssd || 0,
    restingHr: p.restingHr || 0,
    sleepHours: p.sleepHours || 0,
    steps: p.steps || 0,
    activeZoneMinutes: p.activeZoneMinutes || 0,
    vo2Max: p.vo2Max || 0,
  }));

  parsedLogs.sort((a, b) => a.date.localeCompare(b.date));
  return parsedLogs;
}

export interface AppleHealthXmlExportParsed {
  biometrics: BiometricLog[];
  sessions: RawSourceSession[];
  demographics: HealthConnectDemographics;
}

function readXmlAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}="([^"]*)"`, 'i');
  const m = re.exec(tag);
  return m ? m[1] : undefined;
}

function parseAppleHealthDateTime(raw: string | undefined): { date: string; ms: number; iso: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const datePart = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  // Apple Health timestamps look like "2026-11-20 07:32:10 +0000" — normalize first space + tz offset for Date.parse
  const isoCandidate = trimmed.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*([+-]\d{2})(\d{2})$/,
    '$1T$2$3:$4'
  );
  const parsed = new Date(isoCandidate);
  const ms = Number.isNaN(parsed.getTime()) ? new Date(`${datePart}T12:00:00Z`).getTime() : parsed.getTime();
  return { date: datePart, ms, iso: new Date(ms).toISOString() };
}

/**
 * Parses a real Apple Health (`export.xml`) export into normalized BiometricLog entries,
 * recent workout sessions, and optional profile demographics (`<Me .../>` + `Height`).
 * Strictly truthful: missing fields stay 0 / undefined (never fabricated).
 */
export function parseAppleHealthXmlExport(
  rawXml: string,
  referenceDate: Date = new Date()
): AppleHealthXmlExportParsed {
  if (typeof rawXml !== 'string' || !/<HealthData\b|<Record\b|<Workout\b|<Me\b/i.test(rawXml)) {
    throw new Error('Invalid Apple Health XML export.');
  }

  const logsByDate = new Map<string, Partial<BiometricLog>>();
  const getOrCreate = (dateStr: string): Partial<BiometricLog> => {
    let entry = logsByDate.get(dateStr);
    if (!entry) {
      entry = {
        date: dateStr,
        bodyweightKg: 0,
        hrvRmssd: 0,
        restingHr: 0,
        sleepHours: 0,
        steps: 0,
        activeZoneMinutes: 0,
        vo2Max: 0,
        source: 'health_connect',
      };
      logsByDate.set(dateStr, entry);
    }
    return entry;
  };

  let gender: 'male' | 'female' | undefined;
  let age: number | undefined;
  let latestHeightCm: number | undefined;

  const meMatch = /<Me\b[^>]*>/i.exec(rawXml);
  if (meMatch) {
    const meTag = meMatch[0];
    const rawSex = readXmlAttr(meTag, 'HKCharacteristicTypeIdentifierBiologicalSex');
    if (rawSex) {
      const cleanedSex = rawSex.replace(/^HKBiologicalSex/i, '');
      gender = parseSexValue(cleanedSex);
    }
    const rawDob = readXmlAttr(meTag, 'HKCharacteristicTypeIdentifierDateOfBirth');
    if (rawDob) {
      age = computeAgeFromBirthDate(rawDob, referenceDate);
    }
  }

  // Track sleep intervals per wakeup date to avoid double-counting overlapping Watch/iPhone stages
  const sleepIntervalsByDate = new Map<string, Array<[number, number]>>();
  // Track step intervals per date to avoid double-counting simultaneous iPhone + Apple Watch pedometer samples
  const stepIntervalsByDate = new Map<string, Array<{ start: number; end: number; steps: number }>>();

  const recordRegex = /<Record\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = recordRegex.exec(rawXml)) !== null) {
    const tag = match[0];
    const type = readXmlAttr(tag, 'type');
    if (!type) continue;
    const rawVal = readXmlAttr(tag, 'value');
    const unit = (readXmlAttr(tag, 'unit') || '').toLowerCase();
    const startInfo = parseAppleHealthDateTime(readXmlAttr(tag, 'startDate'));
    const endInfo = parseAppleHealthDateTime(readXmlAttr(tag, 'endDate')) ?? startInfo;
    if (!startInfo || !endInfo) continue;

    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      // Count only actual asleep stages (exclude InBed and Awake so time in bed is never inflated into sleep)
      if (rawVal && /Asleep/i.test(rawVal) && endInfo.ms > startInfo.ms) {
        const list = sleepIntervalsByDate.get(endInfo.date) ?? [];
        list.push([startInfo.ms, endInfo.ms]);
        sleepIntervalsByDate.set(endInfo.date, list);
      }
      continue;
    }

    const num = rawVal !== undefined ? Number(rawVal) : NaN;
    if (!Number.isFinite(num)) continue;

    if (type === 'HKQuantityTypeIdentifierHeight') {
      const cm =
        unit === 'in'
          ? num * 2.54
          : unit === 'ft'
          ? num * 30.48
          : unit === 'm'
          ? num * 100
          : parseHeightCmValue(num);
      if (cm && cm >= 100 && cm <= 250) {
        latestHeightCm = Math.round(cm);
      }
      continue;
    }

    const entry = getOrCreate(startInfo.date);

    switch (type) {
      case 'HKQuantityTypeIdentifierBodyMass': {
        const kg = unit.startsWith('lb') ? num / 2.2046226218 : unit === 'g' ? num / 1000 : num;
        if (kg >= 25 && kg <= 300) entry.bodyweightKg = Math.round(kg * 10) / 10;
        break;
      }
      case 'HKQuantityTypeIdentifierBodyFatPercentage': {
        const pct = num > 0 && num <= 1 ? num * 100 : num;
        if (pct > 1 && pct < 75) entry.bodyFatPct = Math.round(pct * 10) / 10;
        break;
      }
      case 'HKQuantityTypeIdentifierLeanBodyMass': {
        const kg = unit.startsWith('lb') ? num / 2.2046226218 : num;
        if (kg > 10 && kg < 200) entry.fatFreeMassKg = Math.round(kg * 10) / 10;
        break;
      }
      case 'HKQuantityTypeIdentifierRestingHeartRate': {
        if (num >= 30 && num <= 140) entry.restingHr = Math.round(num);
        break;
      }
      case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': {
        const msVal = unit === 's' ? num * 1000 : num;
        if (msVal > 0 && msVal < 400) entry.hrvRmssd = Math.round(msVal);
        break;
      }
      case 'HKQuantityTypeIdentifierStepCount': {
        if (num > 0) {
          const list = stepIntervalsByDate.get(startInfo.date) ?? [];
          list.push({ start: startInfo.ms, end: Math.max(startInfo.ms, endInfo.ms), steps: Math.round(num) });
          stepIntervalsByDate.set(startInfo.date, list);
        }
        break;
      }
      case 'HKQuantityTypeIdentifierAppleExerciseTime': {
        if (num > 0) entry.activeZoneMinutes = Math.round((entry.activeZoneMinutes || 0) + num);
        break;
      }
      case 'HKQuantityTypeIdentifierVO2Max': {
        if (num >= 10 && num <= 95) entry.vo2Max = Math.round(num * 10) / 10;
        break;
      }
      default:
        break;
    }
  }

  // Merge non-overlapping asleep intervals per date
  for (const [dateStr, intervals] of sleepIntervalsByDate.entries()) {
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    let totalMs = 0;
    let [curStart, curEnd] = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const [s, e] = sorted[i];
      if (s <= curEnd) curEnd = Math.max(curEnd, e);
      else {
        totalMs += curEnd - curStart;
        curStart = s;
        curEnd = e;
      }
    }
    totalMs += curEnd - curStart;
    if (totalMs > 0) {
      const entry = getOrCreate(dateStr);
      entry.sleepHours = Math.round((totalMs / 3_600_000) * 10) / 10;
    }
  }

  // Merge step intervals per date without double-counting overlapping Watch + iPhone samples
  for (const [dateStr, items] of stepIntervalsByDate.entries()) {
    const sorted = [...items].sort((a, b) => a.start - b.start || b.steps - a.steps);
    let totalSteps = 0;
    let latestEnd = -1;
    for (const it of sorted) {
      if (it.start >= latestEnd) {
        totalSteps += it.steps;
        latestEnd = it.end;
      } else if (it.end > latestEnd) {
        const span = Math.max(1, it.end - it.start);
        const nonOverlapRatio = (it.end - latestEnd) / span;
        totalSteps += Math.round(it.steps * nonOverlapRatio);
        latestEnd = it.end;
      }
    }
    if (totalSteps > 0) {
      const entry = getOrCreate(dateStr);
      entry.steps = totalSteps;
    }
  }

  const lookbackCutoffMs = referenceDate.getTime() - 29 * 86_400_000;
  const sessions: RawSourceSession[] = [];
  const workoutRegex = /<Workout\b[^>]*>/gi;
  let wIdx = 0;
  while ((match = workoutRegex.exec(rawXml)) !== null) {
    const tag = match[0];
    const hkType = readXmlAttr(tag, 'workoutActivityType') || '';
    const startInfo = parseAppleHealthDateTime(readXmlAttr(tag, 'startDate'));
    if (!startInfo || startInfo.ms < lookbackCutoffMs) continue;
    const endInfo = parseAppleHealthDateTime(readXmlAttr(tag, 'endDate'));
    const rawDuration = Number(readXmlAttr(tag, 'duration') || '0');
    const durationUnit = (readXmlAttr(tag, 'durationUnit') || 'min').toLowerCase();
    const minutes =
      rawDuration > 0
        ? durationUnit.startsWith('s')
          ? rawDuration / 60
          : durationUnit.startsWith('h')
          ? rawDuration * 60
          : rawDuration
        : endInfo && endInfo.ms > startInfo.ms
        ? (endInfo.ms - startInfo.ms) / 60_000
        : 0;
    if (!(minutes > 0)) continue;
    const sportName = hkType.replace(/^HKWorkoutActivityType/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const rawDist = Number(readXmlAttr(tag, 'totalDistance') || '0');
    const distUnit = (readXmlAttr(tag, 'totalDistanceUnit') || 'km').toLowerCase();
    const distanceKm =
      rawDist > 0
        ? distUnit.startsWith('mi')
          ? Math.round(rawDist * 1.60934 * 100) / 100
          : distUnit === 'm'
          ? Math.round((rawDist / 1000) * 100) / 100
          : Math.round(rawDist * 100) / 100
        : undefined;
    wIdx += 1;
    sessions.push({
      externalId: `hk-xml-${startInfo.ms}-${wIdx}`,
      sportType: sportName || 'Workout',
      name: sportName || 'Workout',
      startedAt: startInfo.iso,
      minutes: Math.round(minutes),
      ...(distanceKm ? { distanceKm } : {}),
    });
  }

  const biometrics: BiometricLog[] = Array.from(logsByDate.values())
    .map((p) => ({
      ...p,
      date: p.date || localDateString(referenceDate),
      bodyweightKg: p.bodyweightKg || 0,
      hrvRmssd: p.hrvRmssd || 0,
      restingHr: p.restingHr || 0,
      sleepHours: p.sleepHours || 0,
      steps: p.steps || 0,
      activeZoneMinutes: p.activeZoneMinutes || 0,
      vo2Max: p.vo2Max || 0,
      source: 'health_connect' as const,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    biometrics,
    sessions,
    demographics: {
      ...(latestHeightCm !== undefined ? { latestHeightCm } : {}),
      ...(gender !== undefined ? { gender } : {}),
      ...(age !== undefined ? { age } : {}),
    },
  };
}

/**
 * Live Android Health Connect Telemetry Simulator:
 * Seamlessly generates high-resolution biometric readings matching
 * Android Health Connect records (Wear OS, Samsung Galaxy Watch, Pixel Watch).
 */
export async function simulateHealthConnectSync(
  onProgress?: (progress: WearableSyncProgress) => void,
  forcedState?: ReadinessState
): Promise<BiometricLog> {
  const todayStr = localDateString();

  const update = (stage: WearableSyncProgress['stage'], percent: number, message: string) => {
    if (onProgress) onProgress({ stage, percent, message, provider: 'health_connect' });
  };

  update('connecting', 15, 'Connecting to Android Health Connect on-device hub...');
  await new Promise((r) => setTimeout(r, 380));

  update('hrv', 45, 'Reading HeartRateVariabilityRmssdRecord & RestingHeartRateRecord...');
  await new Promise((r) => setTimeout(r, 420));

  update('sleep', 75, 'Aggregating SleepSessionRecord from connected health sensors...');
  await new Promise((r) => setTimeout(r, 420));

  update('steps', 90, 'Syncing StepsRecord & ActiveMinutes metrics...');
  await new Promise((r) => setTimeout(r, 320));

  let hrv = 64;
  let rhr = 53;
  let sleep = 7.7;
  let azm = 44;
  let steps = 9950;

  if (forcedState === 'Amber Shield') {
    hrv = 40; // >15% drop
    rhr = 65; // elevated
    sleep = 5.3; // <6h
    azm = 15;
    steps = 6100;
  } else if (forcedState === 'Primed') {
    hrv = 71; // high HRV
    rhr = 50; // low RHR
    sleep = 8.2;
    azm = 58;
    steps = 11800;
  }

  const syncedLog: BiometricLog = {
    date: todayStr,
    bodyweightKg: 82.0,
    hrvRmssd: hrv,
    restingHr: rhr,
    sleepHours: sleep,
    steps,
    activeZoneMinutes: azm,
    vo2Max: 46.5,
    avgWorkoutHr: 143,
    workoutDurationMin: 62,
    source: 'health_connect',
  };

  update('complete', 100, 'Health Connect recovery data synced!');
  return syncedLog;
}
