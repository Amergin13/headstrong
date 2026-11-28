import { applyCors, isTrustedOriginOrSameSite } from '../_lib/cors.js';
import { emitServerMetric } from '../_lib/metrics.js';
import {
  MAX_INGEST_BATCH_SIZE,
  TELEMETRY_METRIC_DEFINITIONS,
  TelemetrySample,
  aggregateTelemetryBatch,
  validateTelemetrySample,
} from '../../src/engine/telemetrySchema.js';

/**
 * Stateless Product Telemetry Ingestion Endpoint (`/api/telemetry/ingest`).
 *
 * Accepts bounded, anonymous client telemetry batches (from `fetch` or `navigator.sendBeacon`),
 * enforces strict schema + PII tag scrubbing via `telemetrySchema.ts`, collapses identical
 * counter increments, and emits Vercel Custom Metrics via `@vercel/functions` `metric()`.
 *
 * Zero database or user-level storage: only aggregated low-cardinality numeric metrics are emitted.
 */

const MAX_RAW_EVENTS_PER_REQUEST = 100;

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, 'GET,POST,OPTIONS')) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      maxBatchSize: MAX_INGEST_BATCH_SIZE,
      metricsCount: Object.keys(TELEMETRY_METRIC_DEFINITIONS).length,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isTrustedOriginOrSameSite(req)) {
    emitServerMetric('telemetry.batch_ingested', 1, { outcome: 'forbidden_origin' });
    return res.status(403).json({ error: 'Untrusted origin' });
  }

  const body = parseBody(req.body);
  const rawList: unknown[] = Array.isArray(body.events)
    ? body.events.slice(0, MAX_RAW_EVENTS_PER_REQUEST)
    : body.name
    ? [body]
    : [];

  if (rawList.length === 0) {
    return res.status(400).json({ error: 'Expected a non-empty events array.' });
  }

  const validSamples: TelemetrySample[] = [];
  let rejected = 0;

  for (const item of rawList) {
    const valid = validateTelemetrySample(item);
    if (valid) {
      validSamples.push(valid);
    } else {
      rejected += 1;
    }
  }

  if (validSamples.length === 0) {
    emitServerMetric('telemetry.batch_ingested', 1, { outcome: 'all_rejected' });
    return res.status(400).json({ accepted: 0, rejected, error: 'No valid telemetry metrics in payload.' });
  }

  // Collapse repeated counter increments so each POST calls metric() <= 26 times (well under Vercel's 100/invocation cap)
  const aggregated = aggregateTelemetryBatch(validSamples, MAX_INGEST_BATCH_SIZE);
  for (const sample of aggregated) {
    emitServerMetric(sample.name, sample.value, sample.tags);
  }

  emitServerMetric('telemetry.batch_ingested', aggregated.length, {
    outcome: rejected > 0 ? 'partial' : 'success',
  });

  return res.status(202).json({
    accepted: aggregated.length,
    rawAccepted: validSamples.length,
    rejected,
  });
}
