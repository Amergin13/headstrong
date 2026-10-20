import { BiometricLog, ReadinessState, WearableSyncProgress } from '../engine/types';

export const HEALTH_CONNECT_CONFIG = {
  PACKAGE_NAME: 'com.google.android.apps.healthdata',
  SETTINGS_ACTION: 'androidx.health.ACTION_HEALTH_CONNECT_SETTINGS',
  PERMISSIONS_ACTION: 'androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS',
  PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata',
  RECORD_TYPES: [
    'HeartRateVariabilityRmssdRecord',
    'RestingHeartRateRecord',
    'SleepSessionRecord',
    'StepsRecord',
    'WeightRecord',
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
        bodyweightKg: 80.0,
        hrvRmssd: 58,
        restingHr: 58,
        sleepHours: 7.5,
        steps: 0,
        activeZoneMinutes: 0,
        vo2Max: 45.0,
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
        if (typeof item.bodyweightKg === 'number') entry.bodyweightKg = item.bodyweightKg;
        if (typeof item.hrvRmssd === 'number') entry.hrvRmssd = item.hrvRmssd;
        if (typeof item.restingHr === 'number') entry.restingHr = item.restingHr;
        if (typeof item.sleepHours === 'number') entry.sleepHours = item.sleepHours;
        if (typeof item.steps === 'number') entry.steps = item.steps;
        if (typeof item.activeZoneMinutes === 'number') entry.activeZoneMinutes = item.activeZoneMinutes;
        if (typeof item.vo2Max === 'number') entry.vo2Max = item.vo2Max;
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
      const dateStr = String(timeStr).split('T')[0];
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

      // VO2 Max Record
      if (rec.type === 'Vo2MaxRecord' || rec.vo2MillilitersPerMinuteKilogram !== undefined) {
        const val = rec.vo2MillilitersPerMinuteKilogram || rec.vo2Max;
        if (typeof val === 'number') entry.vo2Max = Math.round(val * 10) / 10;
      }
    });
  }

  const parsedLogs: BiometricLog[] = Array.from(logsByDate.values()).map((p) => ({
    date: p.date || new Date().toISOString().split('T')[0],
    bodyweightKg: p.bodyweightKg || 80.0,
    hrvRmssd: p.hrvRmssd || 58,
    restingHr: p.restingHr || 58,
    sleepHours: p.sleepHours || 7.5,
    steps: p.steps || 8500,
    activeZoneMinutes: p.activeZoneMinutes || 40,
    vo2Max: p.vo2Max || 45.0,
  }));

  parsedLogs.sort((a, b) => a.date.localeCompare(b.date));
  return parsedLogs;
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
  const todayStr = new Date().toISOString().split('T')[0];

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
  };

  update('complete', 100, 'Health Connect recovery data synced!');
  return syncedLog;
}
