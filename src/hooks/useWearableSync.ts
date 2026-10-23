import React, { useCallback, useEffect } from 'react';
import {
  BiometricLog,
  UserProfile,
  WearableProvider,
  WorkoutSession,
  getActiveWearableProvider,
} from '../engine/types';
import { setActiveTracker, syncWearableBiometrics } from '../services/wearableSyncService';
import {
  exchangeWhoopCodeForToken,
  fetchWhoopWorkoutStrain,
  WhoopWorkoutStrainSummary,
  WHOOP_CONFIG,
} from '../services/whoopService';
import { exchangeFitbitCodeForToken } from '../services/fitbitService';
import { onWearableTokensRefreshed } from '../services/wearableTokens';

type Notify = (message: string, tag: string) => void;

interface WearableSyncDeps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  workouts: WorkoutSession[];
  setWorkouts: React.Dispatch<React.SetStateAction<WorkoutSession[]>>;
  setBiometrics: React.Dispatch<React.SetStateAction<BiometricLog[]>>;
  notify: Notify;
}

/** How long after a workout we keep asking Whoop for its strain score. */
const WHOOP_STRAIN_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const WHOOP_STRAIN_POLL_MS = 5 * 60 * 1000;

/**
 * Everything to do with wearables: merging synced days, saving rotated OAuth tokens,
 * syncing on launch, finishing OAuth connections, and back-filling Whoop workout strain.
 */
export function useWearableSync({ profile, setProfile, workouts, setWorkouts, setBiometrics, notify }: WearableSyncDeps) {
  // Merge a synced day into the log. 0 / undefined mean "not measured" and never overwrite data.
  const handleSyncCompleted = useCallback(
    (newLog: BiometricLog, provider?: WearableProvider) => {
      setBiometrics((prev) => {
        const idx = prev.findIndex((b) => b.date === newLog.date);
        if (idx < 0) return [...prev, newLog];
        const measured = Object.fromEntries(
          Object.entries(newLog).filter(([, v]) => v !== undefined && v !== 0)
        ) as Partial<BiometricLog>;
        const updated = [...prev];
        updated[idx] = { ...prev[idx], ...measured };
        return updated;
      });
      if (provider) {
        setProfile((prev) => ({ ...prev, ...setActiveTracker(provider, prev) }));
      }
    },
    [setBiometrics, setProfile]
  );

  // Whoop and Fitbit rotate refresh tokens; save new pairs as soon as a proxy refreshes them.
  useEffect(
    () =>
      onWearableTokensRefreshed((update) => {
        const expiresAt = update.expiresIn ? Date.now() + update.expiresIn * 1000 : undefined;
        setProfile((prev) =>
          update.provider === 'whoop'
            ? {
                ...prev,
                whoopAccessToken: update.accessToken,
                whoopRefreshToken: update.refreshToken ?? prev.whoopRefreshToken,
                whoopTokenExpiresAt: expiresAt ?? prev.whoopTokenExpiresAt,
              }
            : {
                ...prev,
                fitbitAccessToken: update.accessToken,
                fitbitRefreshToken: update.refreshToken ?? prev.fitbitRefreshToken,
                fitbitTokenExpiresAt: expiresAt ?? prev.fitbitTokenExpiresAt,
              }
        );
      }),
    [setProfile]
  );

  // Sync the active tracker once on launch.
  useEffect(() => {
    const provider = getActiveWearableProvider(profile);
    const accessToken = provider === 'whoop' ? profile.whoopAccessToken : provider === 'fitbit' ? profile.fitbitAccessToken : undefined;
    const refreshToken = provider === 'whoop' ? profile.whoopRefreshToken : provider === 'fitbit' ? profile.fitbitRefreshToken : undefined;
    if (!provider || !accessToken) return;
    syncWearableBiometrics(provider, { accessToken, refreshToken })
      .then((log) => handleSyncCompleted(log, provider))
      .catch((err) => console.warn(`Background ${provider} sync skipped:`, err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Finishes an OAuth redirect (`?code=...`) for Whoop or Fitbit, then syncs today. */
  const completeWearableConnection = useCallback(
    async (oauthCode: string, provider: WearableProvider) => {
      let accessToken: string | undefined;
      let refreshToken: string | undefined;
      try {
        if (provider === 'whoop') {
          const tokenRes = await exchangeWhoopCodeForToken(
            oauthCode,
            profile.whoopClientId || WHOOP_CONFIG.CLIENT_ID,
            undefined,
            profile.whoopRedirectUri
          );
          accessToken = tokenRes.accessToken;
          refreshToken = tokenRes.refreshToken;
          setProfile((prev) => ({
            ...prev,
            ...setActiveTracker('whoop', prev),
            whoopAccessToken: tokenRes.accessToken,
            whoopRefreshToken: tokenRes.refreshToken,
            whoopTokenExpiresAt: Date.now() + tokenRes.expiresIn * 1000,
          }));
        } else {
          const tokenRes = await exchangeFitbitCodeForToken(oauthCode);
          accessToken = tokenRes.accessToken;
          refreshToken = tokenRes.refreshToken;
          setProfile((prev) => ({
            ...prev,
            ...setActiveTracker('fitbit', prev),
            fitbitAccessToken: tokenRes.accessToken,
            fitbitRefreshToken: tokenRes.refreshToken,
            fitbitTokenExpiresAt: Date.now() + tokenRes.expiresIn * 1000,
          }));
        }
      } catch (err) {
        console.error(`${provider} connection error:`, err);
        notify(`Could not connect to ${provider === 'whoop' ? 'Whoop' : 'Fitbit'}. Please try again.`, 'Connection Failed');
        return;
      }

      const deviceName = provider === 'whoop' ? 'Whoop' : 'Pixel Watch / Fitbit';
      try {
        const syncedLog = await syncWearableBiometrics(provider, { accessToken, refreshToken });
        handleSyncCompleted(syncedLog, provider);
        notify(`${deviceName} connected and today's recovery synced.`, 'Connected');
      } catch (syncErr: any) {
        notify(syncErr?.message || `${deviceName} connected. Sync again once your device has uploaded.`, 'Connected');
      }
    },
    [profile.whoopClientId, profile.whoopRedirectUri, setProfile, handleSyncCompleted, notify]
  );

  /** Merges Whoop workout telemetry into a completed workout and that day's log. Returns true if strain was found. */
  const applyWhoopTelemetry = useCallback(
    (workoutId: string, workoutDate: string, telemetry: WhoopWorkoutStrainSummary): boolean => {
      const strain = telemetry.workoutStrain;
      if (strain === undefined && telemetry.avgHeartRate === undefined) return false;
      setWorkouts((prev) =>
        prev.map((w) =>
          w.id === workoutId
            ? {
                ...w,
                whoopStrain: strain ?? w.whoopStrain,
                avgHeartRate: telemetry.avgHeartRate ?? w.avgHeartRate,
                maxHeartRate: telemetry.maxHeartRate ?? w.maxHeartRate,
                durationMinutes: telemetry.workoutDurationMin ?? w.durationMinutes,
                kilojoules: telemetry.kilojoules && telemetry.kilojoules < 3500 ? telemetry.kilojoules : w.kilojoules,
                hasMeasuredHeartRate: telemetry.avgHeartRate !== undefined || w.hasMeasuredHeartRate,
                wearableSource: 'whoop',
              }
            : w
        )
      );
      setBiometrics((prev) => {
        const idx = prev.findIndex((b) => b.date === workoutDate);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          workoutStrain: strain ?? updated[idx].workoutStrain,
          strain: telemetry.dayStrain ?? updated[idx].strain,
          avgWorkoutHr: telemetry.avgHeartRate ?? updated[idx].avgWorkoutHr,
          maxWorkoutHr: telemetry.maxHeartRate ?? updated[idx].maxWorkoutHr,
          recoveryScore: telemetry.recoveryScore ?? updated[idx].recoveryScore,
        };
        return updated;
      });
      return strain !== undefined;
    },
    [setWorkouts, setBiometrics]
  );

  // Whoop scores a workout minutes after the strap uploads it, so strain is rarely ready when
  // the athlete taps Finish. Keep checking recent workouts that still lack strain.
  const whoopConnected = Boolean(profile.whoopConnected && profile.whoopAccessToken);
  const pendingWhoopWorkouts = whoopConnected
    ? workouts.filter(
        (w) =>
          w.completed &&
          w.whoopStrain === undefined &&
          Date.now() - new Date(w.completedAt || w.date).getTime() < WHOOP_STRAIN_LOOKBACK_MS
      )
    : [];
  const pendingWhoopKey = pendingWhoopWorkouts.map((w) => w.id).join(',');

  useEffect(() => {
    if (!pendingWhoopKey || !profile.whoopAccessToken) return;
    let cancelled = false;
    const check = async () => {
      for (const w of pendingWhoopWorkouts) {
        const end = w.completedAt || new Date().toISOString();
        const start =
          w.startedAt || new Date(new Date(end).getTime() - (w.durationMinutes || 60) * 60 * 1000).toISOString();
        try {
          const telemetry = await fetchWhoopWorkoutStrain(profile.whoopAccessToken as string, profile.whoopRefreshToken, {
            start,
            end,
          });
          if (cancelled) return;
          if (applyWhoopTelemetry(w.id, w.date, telemetry)) {
            notify(`Whoop strain ${telemetry.workoutStrain} added to ${w.name}.`, 'Whoop');
          }
        } catch {
          // Try again on the next interval
        }
      }
    };
    check();
    const timer = setInterval(check, WHOOP_STRAIN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWhoopKey, profile.whoopAccessToken]);

  return { handleSyncCompleted, completeWearableConnection };
}
