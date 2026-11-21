/**
 * Shared economical caching and in-flight coalescing layer for all AI summary surfaces
 * (exercise notes, program identity message, workout finish summary, goals summary, and
 * body composition insight).
 *
 * Guarantees:
 * - In-memory LRU mirror avoids redundant JSON.parse(localStorage) on every render.
 * - Concurrent callers (e.g. WorkoutFinishScreen + TrainTab, React StrictMode double-effects,
 *   or fast tab remounts) share a single in-flight model request instead of burning duplicate tokens.
 * - Successful answers are persisted immediately when the shared request resolves, even if the
 *   initiating component unmounted mid-flight.
 */

const memoryCaches = new Map<string, { raw: string | null; store: Record<string, string> }>();
const inFlightRequests = new Map<string, Promise<string | null>>();

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function loadStore(storageKey: string): Record<string, string> {
  const raw = hasStorage() ? localStorage.getItem(storageKey) : null;
  const existing = memoryCaches.get(storageKey);
  if (existing && (!hasStorage() || existing.raw === raw)) {
    return existing.store;
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    const store: Record<string, string> =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    memoryCaches.set(storageKey, { raw, store });
    return store;
  } catch {
    const empty: Record<string, string> = {};
    memoryCaches.set(storageKey, { raw, store: empty });
    return empty;
  }
}

export function readCachedAiText(storageKey: string, entryKey: string): string | undefined {
  const hit = loadStore(storageKey)[entryKey];
  return typeof hit === 'string' ? hit : undefined;
}

export function writeCachedAiText(
  storageKey: string,
  entryKey: string,
  value: string,
  maxEntries: number
): void {
  const store = loadStore(storageKey);
  const entries = Object.entries(store).filter(([k]) => k !== entryKey);
  entries.push([entryKey, value]);
  const next = Object.fromEntries(entries.slice(-maxEntries));
  const serialized = JSON.stringify(next);
  try {
    if (hasStorage()) {
      localStorage.setItem(storageKey, serialized);
    }
    memoryCaches.set(storageKey, { raw: serialized, store: next });
  } catch {
    // Storage unavailable or full: in-memory cache still prevents repeat calls during this session.
    memoryCaches.set(storageKey, { raw: hasStorage() ? localStorage.getItem(storageKey) : null, store: next });
  }
}

/**
 * Coalesces concurrent model requests for the exact same dedupe key so at most one LLM call
 * runs at a time per unique fact payload, persisting successful results even if a caller unmounts.
 */
export function coalesceAiGeneration(
  dedupeKey: string,
  run: () => Promise<string | null>,
  onSuccess?: (text: string) => void
): Promise<string | null> {
  const active = inFlightRequests.get(dedupeKey);
  if (active) return active;

  let task: Promise<string | null> | null = null;
  task = (async () => {
    try {
      const result = await run();
      if (result && onSuccess) {
        onSuccess(result);
      }
      return result;
    } finally {
      if (inFlightRequests.get(dedupeKey) === task) {
        inFlightRequests.delete(dedupeKey);
      }
    }
  })();

  inFlightRequests.set(dedupeKey, task);
  return task;
}

/** Clears in-memory summary caches and in-flight trackers (used by tests and data erase). */
export function clearAiGenerationCaches(): void {
  memoryCaches.clear();
  inFlightRequests.clear();
}

export function getInFlightAiGenerationCount(): number {
  return inFlightRequests.size;
}
