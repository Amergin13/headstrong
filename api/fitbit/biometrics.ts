import { applyCors } from '../_lib/cors.js';
/**
 * Vercel Serverless Function: Fitbit / Google Pixel Watch Biometrics Aggregator & Proxy
 * Eliminates browser CORS restrictions and aggregates heart rate, HRV, sleep,
 * active zone minutes, and Daily Readiness Score server-side.
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

  const tryTokenRefresh = async () => {
    if (!refreshToken) return null;
    try {
      const clientId = process.env.FITBIT_CLIENT_ID || '23QW89';
      const clientSecret = process.env.FITBIT_CLIENT_SECRET;
      const refreshParams = new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: String(refreshToken).trim(),
      });
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      if (clientSecret) {
        const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      }
      const refreshRes = await fetch('https://api.fitbit.com/oauth2/token', {
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

  const fetchFitbit = async (url: string, token: string) => {
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

  try {
    // 1. Initial check with heart rate endpoint
    let heartRes = await fetchFitbit(
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
        heartRes = await fetchFitbit(
          `https://api.fitbit.com/1/user/-/activities/heart/date/${targetDate}/1d.json`,
          currentToken
        );
      }
    }

    // 2. Fetch HRV, Sleep, Activities, Weight, and Readiness in parallel
    const [hrvRes, sleepRes, actRes, weightRes, readinessRes] = await Promise.all([
      fetchFitbit(`https://api.fitbit.com/1/user/-/hrv/date/${targetDate}.json`, currentToken),
      fetchFitbit(`https://api.fitbit.com/1.2/user/-/sleep/date/${targetDate}.json`, currentToken),
      fetchFitbit(`https://api.fitbit.com/1/user/-/activities/date/${targetDate}.json`, currentToken),
      fetchFitbit(`https://api.fitbit.com/1/user/-/body/log/weight/date/${targetDate}.json`, currentToken),
      fetchFitbit(`https://api.fitbit.com/1/user/-/readiness/date/${targetDate}.json`, currentToken),
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
