import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UserProfile, WorkoutSession } from '../engine/types';
import {
  ActivityLog,
  ActivityType,
  DetectedActivity,
  SOURCE_LABELS,
  createManualActivity,
  describeActivity,
  mergeDetectedActivities,
  overlapsLifting,
  qualifiesAsActiveDay,
} from '../engine/activeDays';
import {
  LOOKBACK_DAYS,
  exchangeStravaCode,
  fetchFitbitActivities,
  fetchStravaActivities,
  fetchWhoopActivities,
  onStravaTokensRefreshed,
  toDetectedActivities,
} from '../services/activitySources';
import {
  HealthConnectStatus,
  getHealthConnectStatus,
  onHealthConnectStatus,
  readHealthConnectSessions,
  startHealthConnectBridge,
} from '../services/healthConnectBridge';
import { loadDismissedActivityIds, saveDismissedActivityIds } from '../services/storage';

const RESYNC_MS = 10 * 60 * 1000;
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

interface ActivitySyncDeps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  activities: ActivityLog[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityLog[]>>;
  workouts: WorkoutSession[];
  notify: (message: string, tag: string) => void;
}

/**
 * Active days: manual logging, plus workouts found automatically on Fitbit / Pixel Watch, Whoop,
 * Strava and Health Connect. Runs when the app opens and when it comes back to the foreground.
 */
export function useActivitySync({ profile, setProfile, activities, setActivities, workouts, notify }: ActivitySyncDeps) {
  const [hcStatus, setHcStatus] = useState<HealthConnectStatus>(getHealthConnectStatus());
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = useRef(0);
  const latest = useRef({ profile, workouts, activities });
  latest.current = { profile, workouts, activities };

  useEffect(() => {
    startHealthConnectBridge();
    return onHealthConnectStatus(setHcStatus);
  }, []);

  // Strava rotates refresh tokens; save the newest pair straight away.
  useEffect(
    () =>
      onStravaTokensRefreshed((t) =>
        setProfile((prev) => ({
          ...prev,
          stravaAccessToken: t.accessToken,
          stravaRefreshToken: t.refreshToken || prev.stravaRefreshToken,
          stravaTokenExpiresAt: t.expiresAt || prev.stravaTokenExpiresAt,
        }))
      ),
    [setProfile]
  );

  const syncActivities = useCallback(
    async (force = false) => {
      if (!force && Date.now() - lastSyncRef.current < RESYNC_MS) return;
      lastSyncRef.current = Date.now();
      const { profile: p, workouts: w } = latest.current;
      const hc = getHealthConnectStatus();
      const jobs: Promise<DetectedActivity[]>[] = [
        fetchFitbitActivities(p),
        fetchWhoopActivities(p),
        fetchStravaActivities(p),
        p.healthConnectActivities && hc.granted
          ? readHealthConnectSessions(new Date(Date.now() - LOOKBACK_MS)).then((raw) => toDetectedActivities('health_connect', raw))
          : Promise.resolve([]),
      ];
      setSyncing(true);
      const results = await Promise.allSettled(jobs);
      setSyncing(false);
      const detected = results
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((a) => !overlapsLifting(a, w));
      results.forEach((r) => {
        if (r.status === 'rejected') console.warn('Activity sync skipped a source:', r.reason);
      });
      if (!detected.length) return;
      const { merged, added } = mergeDetectedActivities(latest.current.activities, detected, loadDismissedActivityIds());
      if (!added.length) return;
      setActivities(merged);
      const counted = added.filter(qualifiesAsActiveDay);
      if (counted.length === 1) {
        notify(`Found a ${describeActivity(counted[0])} (${SOURCE_LABELS[counted[0].source].replace('From ', '')}). It counts as an active day.`, 'Active day');
      } else if (counted.length > 1) {
        notify(`Found ${counted.length} workouts from your apps. They count as active days.`, 'Active days');
      }
    },
    [setActivities, notify]
  );

  // On launch, when Health Connect becomes readable, and whenever the app comes back to the front.
  useEffect(() => {
    syncActivities(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncActivities();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncActivities]);
  useEffect(() => {
    if (hcStatus.granted && profile.healthConnectActivities) syncActivities(true);
  }, [hcStatus.granted, profile.healthConnectActivities, syncActivities]);

  const logManualActivity = useCallback(
    (type: ActivityType, minutes: number) => {
      const log = createManualActivity(type, minutes);
      setActivities((prev) => [...prev, log].sort((a, b) => a.startedAt.localeCompare(b.startedAt)));
      notify(
        qualifiesAsActiveDay(log) ? `${describeActivity(log)} logged. It counts as an active day.` : `${describeActivity(log)} logged.`,
        'Active day'
      );
    },
    [setActivities, notify]
  );

  /** Removes an activity. A found one is remembered so it isn't imported again. */
  const removeActivity = useCallback(
    (id: string) => {
      const target = latest.current.activities.find((a) => a.id === id);
      if (!target) return;
      if (target.externalId) {
        saveDismissedActivityIds([...loadDismissedActivityIds(), `${target.source}:${target.externalId}`]);
      }
      setActivities((prev) => prev.filter((a) => a.id !== id));
    },
    [setActivities]
  );

  /** Finishes the Strava sign-in redirect, then looks for activities. */
  const completeStravaConnection = useCallback(
    async (code: string, scope: string | null) => {
      try {
        const tokens = await exchangeStravaCode(code, scope);
        setProfile((prev) => ({
          ...prev,
          stravaConnected: true,
          stravaAccessToken: tokens.accessToken,
          stravaRefreshToken: tokens.refreshToken,
          stravaTokenExpiresAt: tokens.expiresAt,
          stravaAthleteFirstName: tokens.athleteFirstName,
        }));
        latest.current.profile = {
          ...latest.current.profile,
          stravaConnected: true,
          stravaAccessToken: tokens.accessToken,
          stravaRefreshToken: tokens.refreshToken,
          stravaTokenExpiresAt: tokens.expiresAt,
        };
        notify('Strava connected. Your rides, runs and walks will count as active days.', 'Strava');
        syncActivities(true);
      } catch (err: any) {
        notify(err?.message || 'Could not connect to Strava. Please try again.', 'Strava');
      }
    },
    [setProfile, notify, syncActivities]
  );

  const disconnectStrava = useCallback(() => {
    setProfile((prev) => ({
      ...prev,
      stravaConnected: false,
      stravaAccessToken: undefined,
      stravaRefreshToken: undefined,
      stravaTokenExpiresAt: undefined,
      stravaAthleteFirstName: undefined,
    }));
  }, [setProfile]);

  return {
    hcStatus,
    syncing,
    syncActivities,
    logManualActivity,
    removeActivity,
    completeStravaConnection,
    disconnectStrava,
  };
}
