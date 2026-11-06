import { applyCors } from '../_lib/cors.js';

function getConfiguredClientId(): string {
  return (
    process.env.GOOGLE_HEALTH_CLIENT_ID ||
    process.env.FITBIT_CLIENT_ID ||
    '23QW89'
  ).trim();
}

function getConfiguredClientSecret(): string | undefined {
  const s = (
    process.env.GOOGLE_HEALTH_CLIENT_SECRET ||
    process.env.FITBIT_CLIENT_SECRET ||
    ''
  ).trim();
  return s || undefined;
}

function isGoogleHealthTokenOrClient(token: string, apiMode?: string, clientId?: string): boolean {
  if (apiMode === 'google_health') return true;
  if (token.startsWith('ya29.')) return true;
  if (clientId && clientId.endsWith('.apps.googleusercontent.com')) return true;
  return false;
}

function matchesTargetDate(dateObj: any, isoTimestamp: string | undefined, targetDate: string): boolean {
  if (dateObj && typeof dateObj.year === 'number') {
    const y = String(dateObj.year).padStart(4, '0');
    const m = String(dateObj.month || 1).padStart(2, '0');
    const d = String(dateObj.day || 1).padStart(2, '0');
    return `${y}-${m}-${d}` === targetDate;
  }
  if (typeof isoTimestamp === 'string' && isoTimestamp.length >= 10) {
    return isoTimestamp.slice(0, 10) === targetDate;
  }
  return true;
}

/**
 * Vercel Serverless Function: Fitbit / Google Pixel Watch Biometrics Aggregator & Proxy
 * Supports both the Google Health API v4 (health.googleapis.com/v4, which replaced the legacy
 * Fitbit Web API on October 30, 2026) and the Fitbit Web API schema.
 */
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

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
  // The app sends the athlete's local date; the UTC fallback is only for direct calls.
  const targetDate = body.date || req.query?.date || new Date().toISOString().split('T')[0];

  if (!accessToken) {
    return res.status(400).json({
      error: 'Missing access token',
      message: 'Provide an access token via Authorization header or accessToken property',
    });
  }

  let currentToken = accessToken;
  let refreshedTokens: any = null;
  const clientId = getConfiguredClientId();
  const clientSecret = getConfiguredClientSecret();
  const useGoogleHealth = isGoogleHealthTokenOrClient(currentToken, body.apiMode, clientId);

  const tryTokenRefresh = async () => {
    if (!refreshToken) return null;
    try {
      const isGoogle = isGoogleHealthTokenOrClient(currentToken, body.apiMode, clientId);
      const refreshParams = new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: String(refreshToken).trim(),
      });
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      let tokenUrl = 'https://api.fitbit.com/oauth2/token';
      if (isGoogle) {
        tokenUrl = 'https://oauth2.googleapis.com/token';
        if (clientSecret) refreshParams.set('client_secret', clientSecret);
      } else if (clientSecret) {
        const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      }
      const refreshRes = await fetch(tokenUrl, {
        method: 'POST',
        headers,
        body: refreshParams.toString(),
      });
      if (refreshRes.ok) {
        return await refreshRes.json();
      }
    } catch {
      // Refresh failed
    }
    return null;
  };

  const fetchJson = async (url: string, token: string) => {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        return { ok: true, status: r.status, data: await r.json().catch(() => null) };
      }
      return { ok: false, status: r.status, data: await r.json().catch(() => null) };
    } catch (e: any) {
      return { ok: false, status: 500, error: e?.message || String(e) };
    }
  };

  // ---------------------------------------------------------------- Google Health API v4 path
  if (useGoogleHealth) {
    const ghBase = 'https://health.googleapis.com/v4/users/me/dataTypes';

    if (body.mode === 'sessions') {
      const afterDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.afterDate || '')) ? String(body.afterDate) : targetDate;
      const url = `${ghBase}/exercise/dataPoints:reconcile?pageSize=50`;
      try {
        let result = await fetchJson(url, currentToken);
        if (result.status === 401 && refreshToken) {
          const newTokens = await tryTokenRefresh();
          if (newTokens?.access_token) {
            currentToken = newTokens.access_token;
            refreshedTokens = {
              accessToken: newTokens.access_token,
              refreshToken: newTokens.refresh_token || refreshToken,
              expiresIn: newTokens.expires_in,
            };
            result = await fetchJson(url, currentToken);
          }
        }
        if (!result.ok) {
          return res.status(result.status || 502).json({
            success: false,
            error: 'Could not read Google Health / Fitbit exercise log',
            refreshedTokens,
          });
        }
        const points: any[] = Array.isArray(result.data?.dataPoints) ? result.data.dataPoints : [];
        const sessions = points
          .map((dp, idx) => {
            const ex = dp?.exercise || dp;
            const startTime = ex?.interval?.startTime || dp?.startTime;
            const endTime = ex?.interval?.endTime || dp?.endTime;
            if (!startTime) return null;
            const startIso = new Date(startTime).toISOString();
            if (startIso.slice(0, 10) < afterDate) return null;
            const activeMs = Number(ex?.activeDurationMillis ?? ex?.durationMillis ?? 0);
            const spanMs =
              activeMs > 0
                ? activeMs
                : endTime
                ? new Date(endTime).getTime() - new Date(startTime).getTime()
                : 0;
            const minutes = Math.round(spanMs / 60000);
            if (!(minutes > 0)) return null;
            const distMeters = Number(
              ex?.metrics?.distanceMeters ??
                ex?.metricsSummary?.distanceMeters ??
                ex?.distanceMeters ??
                0
            );
            const avgHr = Number(
              ex?.metrics?.averageHeartRateBeatsPerMinute ??
                ex?.metricsSummary?.averageHeartRateBpm ??
                ex?.averageHeartRateBeatsPerMinute ??
                ex?.averageHeartRateBpm ??
                0
            );
            const rawId = dp?.id || (dp?.name ? String(dp.name).split('/').pop() : `gh-${idx}-${startIso}`);
            return {
              externalId: String(rawId),
              name: ex?.title || ex?.exerciseType || undefined,
              sportType: ex?.exerciseType || undefined,
              startedAt: startIso,
              minutes,
              avgHeartRate: avgHr > 0 ? Math.round(avgHr) : undefined,
              distanceKm: distMeters > 0 ? Math.round((distMeters / 100) ) / 10 : undefined,
            };
          })
          .filter(Boolean);
        return res.status(200).json({ success: true, sessions, refreshedTokens, provider: 'fitbit' });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: error?.message || 'Google Health exercise log proxy error',
        });
      }
    }

    try {
      let rhrRes = await fetchJson(`${ghBase}/daily-resting-heart-rate/dataPoints:reconcile?pageSize=14`, currentToken);
      if (rhrRes.status === 401 && refreshToken) {
        const newTokens = await tryTokenRefresh();
        if (newTokens?.access_token) {
          currentToken = newTokens.access_token;
          refreshedTokens = {
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token || refreshToken,
            expiresIn: newTokens.expires_in,
          };
          rhrRes = await fetchJson(`${ghBase}/daily-resting-heart-rate/dataPoints:reconcile?pageSize=14`, currentToken);
        }
      }

      const [hrvRes, sleepRes, stepsRes, azmRes, weightRes] = await Promise.all([
        fetchJson(`${ghBase}/daily-heart-rate-variability/dataPoints:reconcile?pageSize=14`, currentToken),
        fetchJson(`${ghBase}/sleep/dataPoints:reconcile?pageSize=14`, currentToken),
        fetchJson(`${ghBase}/steps/dataPoints:reconcile?pageSize=100`, currentToken),
        fetchJson(`${ghBase}/active-zone-minutes/dataPoints:reconcile?pageSize=100`, currentToken),
        fetchJson(`${ghBase}/weight/dataPoints:reconcile?pageSize=14`, currentToken),
      ]);

      const biometrics: Record<string, any> = {
        date: targetDate,
        source: 'fitbit',
      };

      if (rhrRes.ok && Array.isArray(rhrRes.data?.dataPoints)) {
        const pts = rhrRes.data.dataPoints;
        const match =
          pts.find((p: any) => matchesTargetDate(p?.dailyRestingHeartRate?.date || p?.date, p?.startTime, targetDate)) ||
          pts[pts.length - 1];
        const bpm = Number(match?.dailyRestingHeartRate?.beatsPerMinute ?? match?.beatsPerMinute ?? 0);
        if (bpm > 0) biometrics.restingHr = Math.round(bpm);
      }

      if (hrvRes.ok && Array.isArray(hrvRes.data?.dataPoints)) {
        const pts = hrvRes.data.dataPoints;
        const match =
          pts.find((p: any) => matchesTargetDate(p?.dailyHeartRateVariability?.date || p?.date, p?.startTime, targetDate)) ||
          pts[pts.length - 1];
        const hrvObj = match?.dailyHeartRateVariability || match;
        const rmssd = Number(
          hrvObj?.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds ??
            hrvObj?.rootMeanSquareOfSuccessiveDifferencesMillis ??
            hrvObj?.averageHeartRateVariabilityMilliseconds ??
            0
        );
        if (rmssd > 0) biometrics.hrvRmssd = Math.round(rmssd);
      }

      if (sleepRes.ok && Array.isArray(sleepRes.data?.dataPoints)) {
        const pts = sleepRes.data.dataPoints;
        let asleepMs = 0;
        for (const p of pts) {
          const sl = p?.sleep || p;
          const endStr = sl?.interval?.endTime || p?.endTime;
          const startStr = sl?.interval?.startTime || p?.startTime;
          if (!startStr || !endStr) continue;
          if (String(endStr).slice(0, 10) !== targetDate && pts.length > 1) continue;
          const summaryMins = Number(sl?.summary?.totalSleepMinutes ?? p?.summary?.totalSleepMinutes ?? 0);
          const dur =
            Number(sl?.asleepDurationMillis ?? 0) ||
            (summaryMins > 0 ? summaryMins * 60000 : new Date(endStr).getTime() - new Date(startStr).getTime());
          if (dur > 0) asleepMs += dur;
        }
        if (asleepMs > 0) {
          biometrics.sleepHours = Math.round((asleepMs / 3600000) * 10) / 10;
        }
      }

      if (stepsRes.ok && Array.isArray(stepsRes.data?.dataPoints)) {
        let totalSteps = 0;
        for (const p of stepsRes.data.dataPoints) {
          const st = p?.steps || p;
          const endStr = st?.interval?.endTime || st?.interval?.startTime || p?.startTime;
          if (endStr && String(endStr).slice(0, 10) !== targetDate) continue;
          const c = Number(st?.count ?? 0);
          if (c > 0) totalSteps += c;
        }
        if (totalSteps > 0) biometrics.steps = Math.round(totalSteps);
      }

      if (azmRes.ok && Array.isArray(azmRes.data?.dataPoints)) {
        let totalAzm = 0;
        for (const p of azmRes.data.dataPoints) {
          const az = p?.activeZoneMinutes && typeof p.activeZoneMinutes === 'object' ? p.activeZoneMinutes : p;
          const endStr = az?.interval?.endTime || az?.interval?.startTime || p?.startTime;
          if (endStr && String(endStr).slice(0, 10) !== targetDate) continue;
          const m = Number(az?.activeZoneMinutes ?? az?.totalMinutes ?? 0);
          if (m > 0) totalAzm += m;
        }
        if (totalAzm > 0) biometrics.activeZoneMinutes = Math.round(totalAzm);
      }

      if (weightRes.ok && Array.isArray(weightRes.data?.dataPoints)) {
        const pts = weightRes.data.dataPoints;
        const match =
          pts.find((p: any) =>
            matchesTargetDate(undefined, p?.weight?.time || p?.weight?.interval?.startTime || p?.startTime, targetDate)
          ) || pts[pts.length - 1];
        const kg = Number(
          match?.weight?.weightKilograms ??
            match?.weight?.massKilograms ??
            match?.weightKilograms ??
            match?.massKilograms ??
            0
        );
        if (kg > 0) biometrics.bodyweightKg = Math.round(kg * 10) / 10;
      }

      const hasCoreMetrics = typeof biometrics.restingHr === 'number' || typeof biometrics.hrvRmssd === 'number';
      return res.status(200).json({
        success: true,
        hasCoreMetrics,
        biometrics,
        refreshedTokens,
        provider: 'fitbit',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Google Health biometrics proxy internal error',
      });
    }
  }

  // ---------------------------------------------------------------- Fitbit Web API path
  // Active days: the athlete's recent Fitbit / Pixel Watch exercise log (auto-recognised and
  // recorded workouts), for the app to count rides, runs and classes. Nothing is stored here.
  if (body.mode === 'sessions') {
    const afterDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.afterDate || '')) ? String(body.afterDate) : targetDate;
    const url = `https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${afterDate}&sort=asc&offset=0&limit=50`;
    try {
      let result = await fetchJson(url, currentToken);
      if (result.status === 401 && refreshToken) {
        const newTokens = await tryTokenRefresh();
        if (newTokens?.access_token) {
          currentToken = newTokens.access_token;
          refreshedTokens = {
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            expiresIn: newTokens.expires_in,
          };
          result = await fetchJson(url, currentToken);
        }
      }
      if (!result.ok) {
        return res.status(result.status || 502).json({ success: false, error: 'Could not read Fitbit exercise log', refreshedTokens });
      }
      const list: any[] = Array.isArray(result.data?.activities) ? result.data.activities : [];
      const sessions = list
        .filter((a) => a && a.startTime && (a.activeDuration || a.duration))
        .map((a) => {
          const distance = typeof a.distance === 'number' ? a.distance : undefined;
          const km = distance === undefined ? undefined : a.distanceUnit === 'Mile' ? distance * 1.609344 : distance;
          return {
            externalId: String(a.logId),
            name: a.activityName || undefined,
            startedAt: new Date(a.startTime).toISOString(),
            minutes: Math.round((a.activeDuration || a.duration) / 60000),
            avgHeartRate: typeof a.averageHeartRate === 'number' ? Math.round(a.averageHeartRate) : undefined,
            distanceKm: km === undefined ? undefined : Math.round(km * 10) / 10,
          };
        });
      return res.status(200).json({ success: true, sessions, refreshedTokens, provider: 'fitbit' });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || 'Fitbit exercise log proxy error' });
    }
  }

  try {
    // 1. Initial check with heart rate endpoint
    let heartRes = await fetchJson(
      `https://api.fitbit.com/1/user/-/activities/heart/date/${targetDate}/1d.json`,
      currentToken
    );

    // If unauthorized, attempt token refresh
    if (heartRes.status === 401 && refreshToken) {
      const newTokens = await tryTokenRefresh();
      if (newTokens?.access_token) {
        currentToken = newTokens.access_token;
        refreshedTokens = {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresIn: newTokens.expires_in,
        };
        heartRes = await fetchJson(
          `https://api.fitbit.com/1/user/-/activities/heart/date/${targetDate}/1d.json`,
          currentToken
        );
      }
    }

    // 2. Fetch HRV, Sleep, Activities, Weight, and Readiness in parallel
    const [hrvRes, sleepRes, actRes, weightRes, readinessRes] = await Promise.all([
      fetchJson(`https://api.fitbit.com/1/user/-/hrv/date/${targetDate}.json`, currentToken),
      fetchJson(`https://api.fitbit.com/1.2/user/-/sleep/date/${targetDate}.json`, currentToken),
      fetchJson(`https://api.fitbit.com/1/user/-/activities/date/${targetDate}.json`, currentToken),
      fetchJson(`https://api.fitbit.com/1/user/-/body/log/weight/date/${targetDate}.json`, currentToken),
      fetchJson(`https://api.fitbit.com/1/user/-/readiness/date/${targetDate}.json`, currentToken),
    ]);

    const biometrics: Record<string, any> = {
      date: targetDate,
      source: 'fitbit',
    };

    // Extract Resting Heart Rate & Workout Heart Rate
    if (heartRes.ok && heartRes.data) {
      const heartData = heartRes.data;
      const restingHr = heartData['activities-heart']?.[0]?.value?.restingHeartRate;
      if (typeof restingHr === 'number' && restingHr > 0) {
        biometrics.restingHr = Math.round(restingHr);
      }
      // Heart rate zone boundaries are not workout measurements, so no workout HR is derived here.
    }

    // Extract HRV
    if (hrvRes.ok && hrvRes.data) {
      const dailyRmssd = hrvRes.data?.hrv?.[0]?.value?.dailyRmssd;
      if (typeof dailyRmssd === 'number' && dailyRmssd > 0) {
        biometrics.hrvRmssd = Math.round(dailyRmssd);
      }
    }

    // Extract Sleep
    if (sleepRes.ok && sleepRes.data) {
      const totalMinutesAsleep = sleepRes.data?.summary?.totalMinutesAsleep;
      if (typeof totalMinutesAsleep === 'number' && totalMinutesAsleep > 0) {
        biometrics.sleepHours = Math.round((totalMinutesAsleep / 60) * 10) / 10;
      }
    }

    // Extract Activities (Steps & Active Zone Minutes)
    if (actRes.ok && actRes.data) {
      const steps = actRes.data?.summary?.steps;
      if (typeof steps === 'number') biometrics.steps = steps;
      const azm = actRes.data?.summary?.activeZoneMinutes?.totalMinutes;
      if (typeof azm === 'number') biometrics.activeZoneMinutes = azm;
      const cals = actRes.data?.summary?.caloriesOut;
      if (typeof cals === 'number') {
        biometrics.kilojoules = Math.round(cals * 4.184);
      }
    }

    // Extract Body Weight
    if (weightRes.ok && weightRes.data) {
      const weight = weightRes.data?.weight?.[0]?.weight;
      if (typeof weight === 'number' && weight > 0) {
        biometrics.bodyweightKg = Math.round(weight * 10) / 10;
      }
    }

    // Extract or calculate Fitbit / Pixel Watch Daily Readiness Score (1 - 100)
    let explicitScore: number | undefined;
    if (readinessRes.ok && readinessRes.data) {
      const rawScore =
        readinessRes.data?.readiness?.[0]?.value?.score ??
        readinessRes.data?.readiness?.[0]?.score ??
        readinessRes.data?.score;
      if (typeof rawScore === 'number' && !isNaN(rawScore) && rawScore > 0) {
        explicitScore = Math.round(rawScore);
      }
    }

    // Only Fitbit's own score is reported as Fitbit's. Without one, the app computes readiness
    // itself from HRV, resting HR and sleep against the athlete's 14-day baseline.
    if (explicitScore !== undefined) {
      biometrics.fitbitReadinessScore = explicitScore;
      biometrics.readinessScore = explicitScore;
    }

    const hasCoreMetrics = typeof biometrics.restingHr === 'number' || typeof biometrics.hrvRmssd === 'number';

    return res.status(200).json({
      success: true,
      hasCoreMetrics,
      biometrics,
      refreshedTokens,
      provider: 'fitbit',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Fitbit biometrics proxy internal error',
    });
  }
}
