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
  }
): Promise<BiometricLog> {
  const onProg = (p: WearableSyncProgress) => {
    if (options?.onProgress) {
      options.onProgress({ ...p, provider });
    }
  };

  switch (provider) {
    case 'whoop': {
      if (options?.accessToken) {
        try {
          onProg({ stage: 'connecting', percent: 20, message: 'Connecting to Whoop API...', provider: 'whoop' });
          const liveData = await fetchWhoopDailyBiometrics(options.accessToken);
          if (liveData.hrvRmssd && liveData.restingHr) {
            onProg({ stage: 'complete', percent: 100, message: 'Whoop live biometrics synced!', provider: 'whoop' });
            return {
              date: liveData.date || new Date().toISOString().split('T')[0],
              bodyweightKg: liveData.bodyweightKg || 80.0,
              hrvRmssd: liveData.hrvRmssd,
              restingHr: liveData.restingHr,
              sleepHours: liveData.sleepHours || 7.5,
              steps: liveData.steps || 9000,
              activeZoneMinutes: liveData.activeZoneMinutes || 45,
              vo2Max: liveData.vo2Max || 46.0,
            };
          }
        } catch {
          // Fall through to high-fidelity simulator on network failure
        }
      }
      return simulateWhoopSync(onProg, options?.forcedState);
    }

    case 'health_connect': {
      return simulateHealthConnectSync(onProg, options?.forcedState);
    }

    case 'fitbit':
    default: {
      if (options?.accessToken) {
        try {
          onProg({ stage: 'connecting', percent: 20, message: 'Connecting to Fitbit API...', provider: 'fitbit' });
          const liveData = await fetchFitbitDailyBiometrics(options.accessToken);
          if (liveData.hrvRmssd && liveData.restingHr) {
            onProg({ stage: 'complete', percent: 100, message: 'Fitbit live biometrics synced!', provider: 'fitbit' });
            return {
              date: liveData.date || new Date().toISOString().split('T')[0],
              bodyweightKg: liveData.bodyweightKg || 80.0,
              hrvRmssd: liveData.hrvRmssd,
              restingHr: liveData.restingHr,
              sleepHours: liveData.sleepHours || 7.5,
              steps: liveData.steps || 9000,
              activeZoneMinutes: liveData.activeZoneMinutes || 45,
              vo2Max: liveData.vo2Max || 46.0,
            };
          }
        } catch {
          // Fall through to simulator
        }
      }
      return simulatePixelWatchSync(
        (prog) => onProg({ ...prog, provider: 'fitbit' }),
        options?.forcedState
      );
    }
  }
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

  // If the active source is the one being disconnected, update wearableSource to another connected source or null
  if (currentProfile.wearableSource === provider) {
    if (provider !== 'fitbit' && currentProfile.fitbitConnected) {
      updates.wearableSource = 'fitbit';
    } else if (provider !== 'whoop' && currentProfile.whoopConnected) {
      updates.wearableSource = 'whoop';
    } else if (provider !== 'health_connect' && currentProfile.healthConnectConnected) {
      updates.wearableSource = 'health_connect';
    } else {
      updates.wearableSource = null;
    }
  }

  return updates;
}
