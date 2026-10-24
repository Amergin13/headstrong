/**
 * On-device language model access through Chrome's built-in Prompt API (Gemini Nano).
 *
 * On Pixel phones Chrome runs Gemini Nano through Android AICore on the Tensor chip; on desktop
 * Chrome it runs on the local GPU/CPU. Either way the prompt and answer never leave the device.
 * When the API or model is unavailable, callers fall back to the rule-based coach.
 *
 * Supports both the current global `LanguageModel` API (availability/create/prompt/promptStreaming)
 * and the older `window.ai.languageModel` shape (capabilities/create).
 */

export type OnDeviceModelStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

const MODEL_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

function getLanguageModelApi(): any | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.LanguageModel || w.ai?.languageModel || null;
}

let cachedStatus: { value: OnDeviceModelStatus; at: number } | null = null;
/** In-flight model warm-up, so a question asked meanwhile doesn't load the model a second time. */
let warmUpPromise: Promise<void> | null = null;

export async function getOnDeviceModelStatus(force = false): Promise<OnDeviceModelStatus> {
  const api = getLanguageModelApi();
  if (!api) {
    cachedStatus = null;
    return 'unavailable';
  }
  if (!force && cachedStatus && Date.now() - cachedStatus.at < 30_000) return cachedStatus.value;
  let value: OnDeviceModelStatus = 'unavailable';
  try {
    if (api && typeof api.availability === 'function') {
      const raw = await api.availability(MODEL_OPTIONS);
      value = raw === 'available' || raw === 'downloadable' || raw === 'downloading' ? raw : 'unavailable';
    } else if (api && typeof api.capabilities === 'function') {
      const caps = await api.capabilities();
      value =
        caps?.available === 'readily'
          ? 'available'
          : caps?.available === 'after-download'
          ? 'downloadable'
          : 'unavailable';
    }
  } catch {
    value = 'unavailable';
  }
  // Only cache positive answers; "unavailable" is re-checked so a model that finishes
  // downloading in the background is picked up right away.
  cachedStatus = value === 'unavailable' ? null : { value, at: Date.now() };
  return value;
}

/** True on Google Pixel phones (where Gemini Nano runs on the Tensor chip via AICore). */
export async function isPixelPhone(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as any).userAgentData;
  try {
    if (uaData?.getHighEntropyValues) {
      const { model } = await uaData.getHighEntropyValues(['model']);
      if (typeof model === 'string' && /pixel/i.test(model)) return true;
    }
  } catch {
    // High-entropy hints unavailable
  }
  return /Pixel/i.test(navigator.userAgent || '');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * Rejects answers that aren't real model output: Chromium builds without Gemini Nano ship a stub
 * that reports "available" but echoes the prompt back, and any reply repeating our instructions
 * is unusable.
 */
export function isUsableModelAnswer(answer: string, systemPrompt: string, userPrompt: string): boolean {
  const text = answer.trim();
  if (text.length < 2) return false;
  if (/on-device model is not available|just echoing back the input/i.test(text)) return false;
  const promptHead = systemPrompt.trim().slice(0, 60);
  if (promptHead && text.includes(promptHead)) return false;
  if (text === userPrompt.trim()) return false;
  return true;
}

export interface OnDevicePromptOptions {
  /** Called with the full answer so far while it streams. */
  onPartial?: (textSoFar: string) => void;
  /** Called with 0-1 while the model downloads for the first time. */
  onDownloadProgress?: (fraction: number) => void;
  /** Overall time limit for creating the session and answering. */
  timeoutMs?: number;
  /** A one-off request that must not join an ongoing chat conversation. */
  stateless?: boolean;
}

async function createSession(systemPrompt: string, onDownloadProgress?: (f: number) => void): Promise<any | null> {
  const api = getLanguageModelApi();
  if (!api || typeof api.create !== 'function') return null;
  const monitor = onDownloadProgress
    ? (m: any) =>
        m.addEventListener?.('downloadprogress', (e: any) => {
          const loaded = typeof e.loaded === 'number' ? e.loaded : 0;
          const total = typeof e.total === 'number' && e.total > 0 ? e.total : 1;
          onDownloadProgress(Math.min(1, loaded / total));
        })
    : undefined;
  try {
    if (typeof api.availability === 'function') {
      return await api.create({
        ...MODEL_OPTIONS,
        initialPrompts: [{ role: 'system', content: systemPrompt }],
        monitor,
      });
    }
    // Older API shape
    return await api.create({ systemPrompt, monitor });
  } catch (err) {
    console.warn('On-device model session could not be created:', err);
    return null;
  }
}

/**
 * Answers a prompt with the on-device model. Returns null when the model is unavailable,
 * errors, or runs past the time limit, so the caller can fall back.
 */
/**
 * A second on-device model used when Chrome's Gemini Nano isn't exposed (e.g. Chrome on Android).
 * Registered by the UI (services/gpuModel.ts runs a model on the phone's GPU via WebGPU), so this
 * module stays free of browser-only worker code.
 */
interface FallbackModel {
  isReady: () => Promise<boolean>;
  prompt: (
    systemPrompt: string,
    userPrompt: string,
    onPartial?: (t: string) => void,
    options?: { stateless?: boolean }
  ) => Promise<string | null>;
}
let fallbackModel: FallbackModel | null = null;
export function registerFallbackOnDeviceModel(model: FallbackModel | null): void {
  fallbackModel = model;
}

/** True when some on-device model (Gemini Nano, or the downloaded GPU model) can answer now. */
export async function isOnDeviceModelReady(): Promise<boolean> {
  if ((await getOnDeviceModelStatus()) === 'available') return true;
  try {
    return fallbackModel ? await fallbackModel.isReady() : false;
  } catch {
    return false;
  }
}

export async function promptOnDeviceModel(
  systemPrompt: string,
  userPrompt: string,
  options: OnDevicePromptOptions = {}
): Promise<string | null> {
  // Only answer with a model that is already on the device. Downloading happens separately
  // (prepareOnDeviceModel, or the athlete's opt-in for the GPU model) and never blocks a reply.
  const status = await getOnDeviceModelStatus();
  if (status !== 'available') {
    if (!fallbackModel) return null;
    try {
      let shown = false;
      const answer = await withTimeout(
        fallbackModel.prompt(
          systemPrompt,
          userPrompt,
          (text) => {
            if (shown || (text.length > 40 && isUsableModelAnswer(text, systemPrompt, userPrompt))) {
              shown = true;
              options.onPartial?.(text);
            }
          },
          { stateless: options.stateless }
        ),
        options.timeoutMs ?? 60_000
      );
      return answer && isUsableModelAnswer(answer, systemPrompt, userPrompt) ? answer.trim() : null;
    } catch {
      return null;
    }
  }

  const run = async (): Promise<string | null> => {
    if (warmUpPromise) await warmUpPromise;
    const session = await createSession(systemPrompt, options.onDownloadProgress);
    if (!session) return null;
    try {
      if (typeof session.promptStreaming === 'function') {
        let text = '';
        let shown = false;
        const stream = session.promptStreaming(userPrompt);
        for await (const chunk of stream as AsyncIterable<string>) {
          // Older Chrome builds stream the cumulative text; newer builds stream deltas.
          text = chunk.startsWith(text) ? chunk : text + chunk;
          // Only start showing once the opening text looks like a genuine answer.
          if (shown || (text.length > 40 && isUsableModelAnswer(text, systemPrompt, userPrompt))) {
            shown = true;
            options.onPartial?.(text);
          }
        }
        return isUsableModelAnswer(text, systemPrompt, userPrompt) ? text.trim() : null;
      }
      const answer = await session.prompt(userPrompt);
      return typeof answer === 'string' && isUsableModelAnswer(answer, systemPrompt, userPrompt) ? answer.trim() : null;
    } finally {
      try {
        session.destroy?.();
      } catch {
        // ignore
      }
    }
  };

  const limit = options.timeoutMs ?? 30_000;
  try {
    return await withTimeout(run(), limit);
  } catch (err) {
    console.warn('On-device model prompt failed:', err);
    return null;
  }
}

let prepareStarted = false;

/**
 * On Pixel phones, starts the one-time on-device model download in the background (Android
 * AICore manages it on the Tensor chip). Must be called from a user gesture, e.g. sending a chat
 * message. On other devices nothing is downloaded automatically. Never throws.
 */
export async function prepareOnDeviceModel(onDownloadProgress?: (fraction: number) => void): Promise<void> {
  if (prepareStarted) return;
  try {
    const status = await getOnDeviceModelStatus();
    if (status !== 'downloadable' || !(await isPixelPhone())) return;
    prepareStarted = true;
    const session = await createSession('You are a helpful assistant.', onDownloadProgress);
    session?.destroy?.();
    cachedStatus = null; // re-check availability on the next question
  } catch {
    prepareStarted = false;
  }
}


/**
 * Loads the on-device model into memory ahead of the first question (the first session can take
 * several seconds to create). Only runs when the model is already on the device. Never throws.
 */
export function warmUpOnDeviceModel(): Promise<void> {
  if (!warmUpPromise) {
    warmUpPromise = (async () => {
      try {
        if ((await getOnDeviceModelStatus()) !== 'available') return;
        const session = await createSession('You are a helpful assistant.');
        session?.destroy?.();
      } catch {
        // Model not usable; questions will fall back to the rule-based coach.
      }
    })();
  }
  return warmUpPromise;
}
