import { applyCors } from '../_lib/cors.js';
const WHOOP_CLIENT_ID = '8bcb0a0d-b6ff-42e0-82b7-c3508e18c9f8';
// Must be configured as a Vercel environment variable. Never hardcode it.
// Read per request so a newly set variable takes effect without a code change.
const getWhoopClientSecret = (): string => process.env.WHOOP_CLIENT_SECRET || '';

/**
 * Vercel Serverless Function: Whoop Biometrics Aggregator & Proxy
 * Completely eliminates browser CORS restrictions by executing all Whoop Developer API
 * telemetry requests server-side.
 */
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  // Extract access token from Authorization header or body/query
  let accessToken = '';
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7).trim();
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      const parsed = new URLSearchParams(body);
      body = Object.fromEntries(parsed.entries());
    }
  }

  if (!accessToken && body.accessToken) {
    accessToken = String(body.accessToken).trim();
  }
  if (!accessToken && req.query?.accessToken) {
    accessToken = String(req.query.accessToken).trim();
  }

  const refreshToken = body.refreshToken || req.query?.refreshToken;
  // Optional time window (ISO strings) of the Treise session, used to pick the matching Whoop workout.
  const windowStartMs = body.workoutWindowStart ? new Date(body.workoutWindowStart).getTime() : NaN;
  const windowEndMs = body.workoutWindowEnd ? new Date(body.workoutWindowEnd).getTime() : NaN;
  const hasWindow = Number.isFinite(windowStartMs) && Number.isFinite(windowEndMs);

  if (!accessToken) {
    return res.status(400).json({
      error: 'Missing access token',
      message: 'Provide an access token via Authorization header or accessToken property',
    });
  }

  const fetchWithFallback = async (token: string, urlV1: string, urlV2?: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res1 = await fetch(urlV1, { headers });
      if (res1.ok) {
        return { ok: true, status: res1.status, data: await res1.json().catch(() => null) };
      }
      // If v1 fails with 404 or non-401 error and v2 exists, try v2
      if (urlV2 && res1.status !== 401) {
        const res2 = await fetch(urlV2, { headers });
        if (res2.ok) {
          return { ok: true, status: res2.status, data: await res2.json().catch(() => null) };
        }
      }
      return { ok: false, status: res1.status, data: await res1.json().catch(() => null) };
    } catch (e: any) {
      if (urlV2) {
        try {
          const res2 = await fetch(urlV2, { headers });
          return { ok: res2.ok, status: res2.status, data: await res2.json().catch(() => null) };
        } catch (err: any) {
          return { ok: false, status: 500, error: err?.message || String(err) };
        }
      }
      return { ok: false, status: 500, error: e?.message || String(e) };
    }
  };

  const getLatestScoredRecord = (recordsData: any) => {
    if (!recordsData) return null;
    const records = Array.isArray(recordsData.records)
      ? recordsData.records
      : Array.isArray(recordsData)
      ? recordsData
      : [recordsData];
    if (records.length === 0) return null;

    // Filter to scored or valid records first
    const scored = records.filter(
      (r: any) => r && (r.score || r.score_state === 'SCORED')
    );
    const candidateList = scored.length > 0 ? scored : records;

    return [...candidateList].sort((a: any, b: any) => {
      const timeA = new Date(a.updated_at || a.created_at || a.end || a.start || a.timestamp || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || b.end || b.start || b.timestamp || 0).getTime();
      return timeB - timeA;
    })[0];
  };

  // Helper to refresh token if expired
  let currentToken = accessToken;
  let refreshedTokens: any = null;

  const tryTokenRefresh = async () => {
    if (!refreshToken) return null;
    try {
      const refreshParams = new URLSearchParams({
        client_id: WHOOP_CLIENT_ID,
        client_secret: getWhoopClientSecret(),
        grant_type: 'refresh_token',
        refresh_token: String(refreshToken).trim(),
        scope: 'offline',
      });
      const refreshRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });
      if (refreshRes.ok) {
        const tokenData = await refreshRes.json();
        return tokenData;
      }
    } catch {
      // Refresh failed
    }
    return null;
  };

  try {
    // 1. Initial attempt to fetch recovery (prioritizing official v1)
    let recResult = await fetchWithFallback(
      currentToken,
      'https://api.prod.whoop.com/developer/v2/recovery?limit=10',
      'https://api.prod.whoop.com/developer/v1/recovery?limit=10'
    );

    // If unauthorized and refresh token is available, refresh and retry
    if (recResult.status === 401 && refreshToken) {
      const newTokens = await tryTokenRefresh();
      if (newTokens?.access_token) {
        currentToken = newTokens.access_token;
        refreshedTokens = {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresIn: newTokens.expires_in,
        };
        recResult = await fetchWithFallback(
          currentToken,
          'https://api.prod.whoop.com/developer/v2/recovery?limit=10',
          'https://api.prod.whoop.com/developer/v1/recovery?limit=10'
        );
      }
    }

    // 2. Fetch Sleep, Cycle, Body, Workout in parallel (prioritizing official v1)
    const [sleepResult, cycleResult, bodyResult, workoutResult] = await Promise.all([
      fetchWithFallback(
        currentToken,
        'https://api.prod.whoop.com/developer/v2/activity/sleep?limit=10',
        'https://api.prod.whoop.com/developer/v1/activity/sleep?limit=10'
      ),
      fetchWithFallback(
        currentToken,
        'https://api.prod.whoop.com/developer/v2/cycle?limit=10',
        'https://api.prod.whoop.com/developer/v1/cycle?limit=10'
      ),
      fetchWithFallback(
        currentToken,
        'https://api.prod.whoop.com/developer/v2/user/measurement/body',
        'https://api.prod.whoop.com/developer/v1/user/measurement/body'
      ),
      fetchWithFallback(
        currentToken,
        'https://api.prod.whoop.com/developer/v2/activity/workout?limit=10',
        'https://api.prod.whoop.com/developer/v1/activity/workout?limit=10'
      ),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    const biometrics: Record<string, any> = {
      date: todayStr,
      source: 'whoop',
    };

    // Extract Recovery
    const latestRecovery = getLatestScoredRecord(recResult.data);
    if (latestRecovery?.score) {
      const s = latestRecovery.score;
      const rawHrv =
        typeof s.hrv_rmssd_milli === 'number'
          ? s.hrv_rmssd_milli
          : typeof s.heart_rate_variability_milli === 'number'
          ? s.heart_rate_variability_milli
          : typeof s.heart_rate_variability_rmssd === 'number'
          ? s.heart_rate_variability_rmssd
          : s.hrv;

      if (typeof rawHrv === 'number' && !isNaN(rawHrv)) {
        biometrics.hrvRmssd = Math.round(rawHrv);
      }
      const rawRhr =
        typeof s.resting_heart_rate === 'number'
          ? s.resting_heart_rate
          : typeof s.resting_hr === 'number'
          ? s.resting_hr
          : typeof s.rhr === 'number'
          ? s.rhr
          : s.resting_heart_rate_bpm;
      if (typeof rawRhr === 'number' && !isNaN(rawRhr) && rawRhr > 0) {
        biometrics.restingHr = Math.round(rawRhr);
      }
      if (typeof s.recovery_score === 'number' && !isNaN(s.recovery_score)) {
        biometrics.recoveryScore = Math.round(s.recovery_score);
      }
      if (typeof s.spo2_percentage === 'number') {
        biometrics.spo2 = Math.round(s.spo2_percentage * 10) / 10;
      }
      if (typeof s.skin_temp_celsius === 'number') {
        biometrics.skinTemp = Math.round(s.skin_temp_celsius * 10) / 10;
      }
    }

    // Extract Sleep
    const latestSleep = getLatestScoredRecord(sleepResult.data);
    if (latestSleep?.score) {
      if (biometrics.restingHr === undefined) {
        const sleepRhr =
          typeof latestSleep.score.resting_heart_rate === 'number'
            ? latestSleep.score.resting_heart_rate
            : typeof latestSleep.score.resting_hr === 'number'
            ? latestSleep.score.resting_hr
            : latestSleep.score.rhr;
        if (typeof sleepRhr === 'number' && !isNaN(sleepRhr) && sleepRhr > 0) {
          biometrics.restingHr = Math.round(sleepRhr);
        }
      }
      const stages = latestSleep.score.stage_summary;
      if (stages) {
        const totalInBed = stages.total_in_bed_time_milli || 0;
        const totalAwake = stages.total_awake_time_milli || 0;
        const asleepMs = Math.max(0, totalInBed - totalAwake);
        if (asleepMs > 0) {
          biometrics.sleepHours = Math.round((asleepMs / 3600000) * 10) / 10;
        } else {
          const sumMs =
            (stages.total_light_sleep_time_milli || 0) +
            (stages.total_slow_wave_sleep_time_milli || 0) +
            (stages.total_rem_sleep_time_milli || 0);
          if (sumMs > 0) {
            biometrics.sleepHours = Math.round((sumMs / 3600000) * 10) / 10;
          }
        }
      } else if (latestSleep.start && latestSleep.end) {
        const diffMs = new Date(latestSleep.end).getTime() - new Date(latestSleep.start).getTime();
        if (diffMs > 0) {
          biometrics.sleepHours = Math.round((diffMs / 3600000) * 10) / 10;
        }
      }

      if (typeof latestSleep.score.sleep_performance_percentage === 'number') {
        biometrics.sleepPerformance = Math.round(latestSleep.score.sleep_performance_percentage);
      }
      if (typeof latestSleep.score.sleep_efficiency_percentage === 'number') {
        biometrics.sleepEfficiency = Math.round(latestSleep.score.sleep_efficiency_percentage);
      }
      if (typeof latestSleep.score.respiratory_rate === 'number') {
        biometrics.respiratoryRate = Math.round(latestSleep.score.respiratory_rate * 10) / 10;
      }
    }

    // Extract Cycle (Daily baseline and cumulative expenditure)
    const latestCycle = getLatestScoredRecord(cycleResult.data);
    if (latestCycle) {
      if (biometrics.restingHr === undefined && typeof latestCycle.score?.resting_heart_rate === 'number') {
        biometrics.restingHr = Math.round(latestCycle.score.resting_heart_rate);
      }
      const strain = typeof latestCycle.score?.strain === 'number' ? latestCycle.score.strain : 0;
      biometrics.strain = Math.round(strain * 10) / 10;
      // Use Whoop's own step count when present; never derive steps or active minutes from strain.
      if (typeof latestCycle.step_count === 'number') biometrics.steps = latestCycle.step_count;
      if (typeof latestCycle.score?.kilojoule === 'number') {
        // Daily cumulative energy expenditure (e.g. 4,372 kJ)
        biometrics.kilojoules = Math.round(latestCycle.score.kilojoule);
        biometrics.dayKilojoules = Math.round(latestCycle.score.kilojoule);
      }
      if (typeof latestCycle.score?.average_heart_rate === 'number') {
        const cAvg = Math.round(latestCycle.score.average_heart_rate);
        biometrics.cycleAvgHr = cAvg;
      }
      if (typeof latestCycle.score?.max_heart_rate === 'number') {
        const cMax = Math.round(latestCycle.score.max_heart_rate);
        biometrics.cycleMaxHr = cMax;
      }
    }

    // Extract Workout Activity (for post-workout strain & session energy capture)
    const workoutRecords = Array.isArray(workoutResult.data?.records)
      ? workoutResult.data.records
      : Array.isArray(workoutResult.data)
      ? workoutResult.data
      : workoutResult.data
      ? [workoutResult.data]
      : [];

    const now = Date.now();
    // Sort all workouts descending by end/start/created_at
    const sortedWorkouts = [...workoutRecords].filter(Boolean).sort((a: any, b: any) => {
      const timeA = new Date(a.end || a.start || a.created_at || 0).getTime();
      const timeB = new Date(b.end || b.start || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    // When the app sends its session window, pick the Whoop workout that overlaps it the most
    // (with 30 minutes of slack either side). Otherwise fall back to the latest workout in 24h.
    const SLACK_MS = 30 * 60 * 1000;
    const overlapMs = (w: any) => {
      const start = new Date(w.start || w.created_at || 0).getTime();
      const end = w.end ? new Date(w.end).getTime() : now;
      return Math.min(end, windowEndMs + SLACK_MS) - Math.max(start, windowStartMs - SLACK_MS);
    };
    const recentWorkout = hasWindow
      ? sortedWorkouts
          .filter((w: any) => overlapMs(w) > 0)
          .sort((a: any, b: any) => overlapMs(b) - overlapMs(a))[0]
      : sortedWorkouts.find((w: any) => {
          const startTime = new Date(w.start || w.created_at || 0).getTime();
          const hoursAgo = (now - startTime) / (1000 * 60 * 60);
          return hoursAgo >= -1 && hoursAgo <= 24;
        });

    if (recentWorkout) {
      biometrics.hasRecentWorkout = true;
      if (recentWorkout.sport_name) {
        biometrics.workoutSportName = recentWorkout.sport_name;
      }
      if (recentWorkout.start) {
        biometrics.workoutStartTime = recentWorkout.start;
      }
      if (recentWorkout.end) {
        biometrics.workoutEndTime = recentWorkout.end;
      }
      if (recentWorkout.start && recentWorkout.end) {
        const durMin = Math.round(
          (new Date(recentWorkout.end).getTime() - new Date(recentWorkout.start).getTime()) / 60000
        );
        if (durMin > 0) {
          biometrics.workoutDurationMin = durMin;
        }
      }

      if (recentWorkout.score && (recentWorkout.score_state === 'SCORED' || !recentWorkout.score_state)) {
        const ws = recentWorkout.score;
        if (typeof ws.strain === 'number') {
          biometrics.workoutStrain = Math.round(ws.strain * 10) / 10;
        }
        if (typeof ws.average_heart_rate === 'number') {
          const avg = Math.round(ws.average_heart_rate);
          biometrics.workoutAvgHr = avg;
          biometrics.avgWorkoutHr = avg;
          biometrics.avgHeartRate = avg;
        }
        if (typeof ws.max_heart_rate === 'number') {
          const max = Math.round(ws.max_heart_rate);
          biometrics.workoutMaxHr = max;
          biometrics.maxWorkoutHr = max;
          biometrics.maxHeartRate = max;
        }
        if (typeof ws.kilojoule === 'number') {
          biometrics.workoutKilojoules = Math.round(ws.kilojoule);
        }
        biometrics.isPendingScore = false;
      } else {
        // PENDING_SCORE or UNSCORABLE: Whoop has the workout but no strain yet.
        biometrics.isPendingScore = recentWorkout.score_state !== 'UNSCORABLE';
      }
    } else {
      biometrics.hasRecentWorkout = false;
      biometrics.isPendingScore = false;
    }

    // Extract Body
    if (bodyResult.ok && bodyResult.data) {
      const body = bodyResult.data;
      if (typeof body.weight_kilogram === 'number' && body.weight_kilogram > 0) {
        biometrics.bodyweightKg = Math.round(body.weight_kilogram * 10) / 10;
      }
    }

    const hasCoreMetrics = typeof biometrics.hrvRmssd === 'number' && typeof biometrics.restingHr === 'number';

    return res.status(200).json({
      success: true,
      hasCoreMetrics,
      biometrics,
      refreshedTokens,
      debug: {
        recoveryStatus: recResult.status,
        sleepStatus: sleepResult.status,
        cycleStatus: cycleResult.status,
        bodyStatus: bodyResult.status,
        workoutStatus: workoutResult.status,
      },
    });
  } catch (error: any) {
    console.error('Whoop biometrics aggregation proxy error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Whoop biometrics proxy internal error',
    });
  }
}
