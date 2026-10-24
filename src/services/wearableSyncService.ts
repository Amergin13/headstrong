import {
  BiometricLog,
  ReadinessState,
  UserProfile,
  WearableProvider,
  WearableSyncProgress,
} from '../engine/types';
import {
  fetchFitbitDailyBiometrics,
  simulatePixelWatchSync,
} from './fitbitService';
import {
  fetchWhoopDailyBiometrics,
  simulateWhoopSync,
} from './whoopService';
import {
  simulateHealthConnectSync,
} from './healthConnectService';
import { localDateString } from '../utils/date';

export interface WearableProviderMeta {
  id: WearableProvider;
  name: string;
  tagline: string;
  description: string;
  hardwareFocus: string;
  accentColor: string;
}

export const WEARABLE_PROVIDERS: Record<WearableProvider, WearableProviderMeta> = {
  fitbit: {
    id: 'fitbit',
    name: 'Google Pixel Watch / Fitbit',
    tagline: 'Fitbit Web API & Pixel Watch Telemetry',
    description: 'Syncs overnight heart rate recovery, resting pulse, sleep stages, and active zone minutes.',
    hardwareFocus: 'Google Pixel Watch 1, 2, 3 & Fitbit Sense/Charge',
    accentColor: '#10B981', // Emerald
  },
  whoop: {
    id: 'whoop',
    name: 'Whoop 4.0',
    tagline: 'Whoop Developer Platform API v1',
    description: 'Syncs Whoop recovery score (Green/Yellow/Red), HRV RMSSD, sleep performance, and day strain.',
    hardwareFocus: 'Whoop 4.0 Strap & Bicep Band',
    accentColor: '#E2F952', // Brand Primary Volt
  },
  health_connect: {
    id: 'health_connect',
    name: 'Android Health Connect',
    tagline: 'Android 14+ Unified Health Ecosystem',
    description: 'On-device health hub aggregating HeartRateVariability, RestingHeartRate, Sleep, and Steps.',
    hardwareFocus: 'Samsung Galaxy Watch, Wear OS, Pixel Watch & Garmin',
    accentColor: '#38BDF8', // Cyan
  },
};

/**
 * Universal Wearable Biometrics Synchronizer:
 * Seamlessly drives Treise recovery feature from either Fitbit, Whoop, or Android Health Connect.
 */
export async function syncWearableBiometrics(
  provider: WearableProvider,
  options?: {
    onProgress?: (progress: WearableSyncProgress) => void;
    forcedState?: ReadinessState;
    accessToken?: string;
    refreshToken?: string;
    /** Only for the explicit sample-data demo. Real syncs never fabricate readings. */
    allowSimulation?: boolean;
  }
): Promise<BiometricLog> {
  const onProg = (p: WearableSyncProgress) => {
    if (options?.onProgress) {
      options.onProgress({ ...p, provider });
    }
  };

  if (options?.allowSimulation) {
    if (provider === 'whoop') return simulateWhoopSync(onProg, options.forcedState);
    if (provider === 'health_connect') return simulateHealthConnectSync(onProg, options.forcedState);
    return simulatePixelWatchSync((prog) => onProg({ ...prog, provider: 'fitbit' }), options.forcedState);
  }

  // Missing values are stored as 0 ("not measured"), never as typical-looking defaults.
  switch (provider) {
    case 'whoop': {
      if (!options?.accessToken) {
        throw new Error('Connect Whoop first, then sync.');
      }
      onProg({ stage: 'connecting', percent: 20, message: 'Connecting to Whoop...', provider: 'whoop' });
      const liveData = await fetchWhoopDailyBiometrics(options.accessToken, undefined, options.refreshToken);
      if (!(liveData.hrvRmssd || liveData.restingHr || liveData.recoveryScore)) {
        throw new Error(
          "Whoop is connected, but today's recovery isn't ready yet. Open the Whoop app to finish syncing your strap, then try again."
        );
      }
      onProg({ stage: 'complete', percent: 100, message: 'Whoop synced', provider: 'whoop' });
      return {
        date: liveData.date || localDateString(),
        bodyweightKg: liveData.bodyweightKg || 0,
        hrvRmssd: liveData.hrvRmssd || 0,
        restingHr: liveData.restingHr || 0,
        sleepHours: liveData.sleepHours || 0,
        steps: liveData.steps || 0,
        activeZoneMinutes: liveData.activeZoneMinutes || 0,
        vo2Max: liveData.vo2Max,
        recoveryScore: liveData.recoveryScore,
        workoutStrain: liveData.workoutStrain,
        strain: liveData.strain,
        kilojoules: liveData.kilojoules,
        workoutKilojoules: liveData.workoutKilojoules,
        // Workout heart rate only from a Whoop workout; the all-day average is not a workout.
        avgWorkoutHr: liveData.avgWorkoutHr ?? (liveData as any).workoutAvgHr,
        maxWorkoutHr: liveData.maxWorkoutHr ?? (liveData as any).workoutMaxHr,
        source: 'whoop',
      };
    }

    case 'health_connect': {
      throw new Error('Health Connect data is added by importing an export file (Import Data below).');
    }

    case 'fitbit':
    default: {
      if (!options?.accessToken) {
        throw new Error('Connect your Pixel Watch or Fitbit first, then sync.');
      }
      onProg({ stage: 'connecting', percent: 20, message: 'Connecting to Fitbit...', provider: 'fitbit' });
      const liveData = await fetchFitbitDailyBiometrics(options.accessToken, undefined, options.refreshToken);
      if (!(liveData.hrvRmssd || liveData.restingHr || liveData.fitbitReadinessScore)) {
        throw new Error(
          "Fitbit is connected, but today's sleep and heart data aren't ready yet. Sync your watch in the Fitbit app, then try again."
        );
      }
      onProg({ stage: 'complete', percent: 100, message: 'Fitbit synced', provider: 'fitbit' });
      return {
        date: liveData.date || localDateString(),
        bodyweightKg: liveData.bodyweightKg || 0,
        hrvRmssd: liveData.hrvRmssd || 0,
        restingHr: liveData.restingHr || 0,
        sleepHours: liveData.sleepHours || 0,
        steps: liveData.steps || 0,
        activeZoneMinutes: liveData.activeZoneMinutes || 0,
        vo2Max: liveData.vo2Max,
        fitbitReadinessScore: liveData.fitbitReadinessScore,
        readinessScore: liveData.readinessScore || liveData.fitbitReadinessScore,
        kilojoules: liveData.kilojoules,
        avgWorkoutHr: liveData.avgWorkoutHr,
        maxWorkoutHr: liveData.maxWorkoutHr,
        source: 'fitbit',
      };
    }
  }
}

/**
 * Enforces single tracker exclusivity:
 * Only ONE wearable tracker can be active at a time.
 * Activating one tracker marks it as active and deactivates the others,
 * preventing cross-tracker contamination of readiness and scoring pipelines.
 */
export function setActiveTracker(
  provider: WearableProvider | null,
  currentProfile: UserProfile
): Partial<UserProfile> {
  if (!provider) {
    return {
      wearableSource: null,
      fitbitConnected: false,
      whoopConnected: false,
      healthConnectConnected: false,
    };
  }

  return {
    wearableSource: provider,
    fitbitConnected: provider === 'fitbit',
    whoopConnected: provider === 'whoop',
    healthConnectConnected: provider === 'health_connect',
    healthConnectLastSync:
      provider === 'health_connect'
        ? new Date().toISOString()
        : currentProfile.healthConnectLastSync,
  };
}

/**
 * Cleanly disconnects a wearable provider and clears its authentication tokens.
 */
export function disconnectWearable(
  provider: WearableProvider,
  currentProfile: UserProfile
): Partial<UserProfile> {
  const updates: Partial<UserProfile> = {};

  if (provider === 'fitbit') {
    updates.fitbitConnected = false;
    updates.fitbitAccessToken = undefined;
    updates.fitbitRefreshToken = undefined;
    updates.fitbitTokenExpiresAt = undefined;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('fitbit_code_verifier');
      sessionStorage.removeItem('fitbit_oauth_state');
    }
  } else if (provider === 'whoop') {
    updates.whoopConnected = false;
    updates.whoopAccessToken = undefined;
    updates.whoopRefreshToken = undefined;
    updates.whoopTokenExpiresAt = undefined;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('whoop_code_verifier');
      sessionStorage.removeItem('whoop_oauth_state');
    }
  } else if (provider === 'health_connect') {
    updates.healthConnectConnected = false;
    updates.healthConnectLastSync = undefined;
  }

  // If the active source is the one being disconnected, clear wearableSource
  if (currentProfile.wearableSource === provider) {
    updates.wearableSource = null;
  }

  return updates;
}
