import { metric } from '@vercel/functions';

export interface EmittedMetricRecord {
  name: string;
  value: number;
  tags?: Record<string, string>;
}

type MetricSink = (name: string, value: number, tags?: Record<string, string>) => void;

let testSink: MetricSink | null = null;

/** Test-only hook allowing `npm run test:api` to inspect emitted Vercel Custom Metrics. */
export function setMetricSinkForTests(sink: MetricSink | null): void {
  testSink = sink;
}

/**
 * Emits a synchronous, low-cardinality Vercel Custom Metric (`@vercel/functions` `metric()`).
 * Safe no-op outside Vercel's runtime or if inputs are non-finite.
 */
export function emitServerMetric(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  if (!name || name.startsWith('vercel.') || !Number.isFinite(value)) return;
  const rounded = Math.round(value * 100) / 100;
  const cleanTags =
    tags && Object.keys(tags).length > 0 ? tags : undefined;

  if (testSink) {
    testSink(name, rounded, cleanTags);
  }
  try {
    metric(name, rounded, cleanTags);
  } catch {
    // Never fail an API request if metric emission throws in a non-Vercel environment.
  }
}
