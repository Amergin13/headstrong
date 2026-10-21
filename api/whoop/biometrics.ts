const WHOOP_CLIENT_ID = '8bcb0a0d-b6ff-42e0-82b7-c3508e18c9f8';
const WHOOP_CLIENT_SECRET =
  process.env.WHOOP_CLIENT_SECRET || 'f3f985af0e1113b650b43fe977eb2f22ffb0f008c98e90e5d60ad669d4c365ea';

/**
 * Vercel Serverless Function: Whoop Biometrics Aggregator & Proxy
 * Completely eliminates browser CORS restrictions by executing all Whoop Developer API
 * telemetry requests server-side.
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  if (!accessToken) {
    return res.status(400).json({
      error: 'Missing access token',
      message: 'Provide an access token via Authorization header or accessToken property',
    });
  }

  const fetchWithFallback = async (token: string, urlV2: string, urlV1: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res2 = await fetch(urlV2, { headers });
      if (res2.ok) {
        return { ok: true, status: res2.status, data: await res2.json().catch(() => null) };
      }
      // If v2 fails (and not 401 unauthorized), try v1 fallback
      if (res2.status !== 401) {
        const res1 = await fetch(urlV1, { headers });
        if (res1.ok) {
          return { ok: true, status: res1.status, data: await res1.json().catch(() => null) };
        }
      }
      return { ok: false, status: res2.status, data: await res2.json().catch(() => null) };
    } catch (e: any) {
      try {
        const res1 = await fetch(urlV1, { headers });
        return { ok: res1.ok, status: res1.status, data: await res1.json().catch(() => null) };
      } catch (err: any) {
        return { ok: false, status: 500, error: err?.message || String(err) };
      }
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
      const timeA = new Date(a.created_at || a.updated_at || a.start || 0).getTime();
      const timeB = new Date(b.created_at || b.updated_at || b.start || 0).getTime();
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
        client_secret: WHOOP_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: String(refreshToken).trim(),
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
    // 1. Initial attempt to fetch recovery (prioritizing v2)
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

    // 2. Fetch Sleep, Cycle, Body, Workout in parallel (prioritizing v2)
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
      if (typeof s.resting_heart_rate === 'number' && !isNaN(s.resting_heart_rate)) {
        biometrics.restingHr = Math.round(s.resting_heart_rate);
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
      const strain = typeof latestCycle.score?.strain === 'number' ? latestCycle.score.strain : 0;
      biometrics.strain = Math.round(strain * 10) / 10;
      biometrics.steps =
        typeof latestCycle.step_count === 'number'
          ? latestCycle.step_count
          : Math.round(strain * 650);
      biometrics.activeZoneMinutes = Math.round(strain * 3.5);
      if (typeof latestCycle.score?.kilojoule === 'number') {
        // Daily cumulative energy expenditure (e.g. 4,372 kJ)
        biometrics.kilojoules = Math.round(latestCycle.score.kilojoule);
        biometrics.dayKilojoules = Math.round(latestCycle.score.kilojoule);
      }
      if (typeof latestCycle.score?.average_heart_rate === 'number') {
        biometrics.cycleAvgHr = Math.round(latestCycle.score.average_heart_rate);
      }
      if (typeof latestCycle.score?.max_heart_rate === 'number') {
        biometrics.cycleMaxHr = Math.round(latestCycle.score.max_heart_rate);
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
    // Sort all workouts descending by start/created_at
    const sortedWorkouts = [...workoutRecords].filter(Boolean).sort((a: any, b: any) => {
      const timeA = new Date(a.start || a.created_at || 0).getTime();
      const timeB = new Date(b.start || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    // A workout is considered "recent" if it started within the last 12 hours
    const recentWorkout = sortedWorkouts.find((w: any) => {
      const startTime = new Date(w.start || w.created_at || 0).getTime();
      const hoursAgo = (now - startTime) / (1000 * 60 * 60);
      return hoursAgo >= -1 && hoursAgo <= 12;
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
          biometrics.workoutAvgHr = Math.round(ws.average_heart_rate);
        }
        if (typeof ws.max_heart_rate === 'number') {
          biometrics.workoutMaxHr = Math.round(ws.max_heart_rate);
        }
        if (typeof ws.kilojoule === 'number') {
          biometrics.workoutKilojoules = Math.round(ws.kilojoule);
        }
        biometrics.isPendingScore = false;
      } else if (recentWorkout.score_state === 'PENDING_SCORE') {
        biometrics.isPendingScore = true;
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
