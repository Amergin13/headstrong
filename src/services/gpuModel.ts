/**
 * On-device coach model that runs on the phone's GPU through WebGPU (WebLLM).
 *
 * Used where Chrome doesn't expose Gemini Nano to web apps (Chrome on Android today). On Pixel
 * phones this runs on the Tensor chip's GPU. The model is downloaded once, only after the athlete
 * opts in, and stored on the device; prompts and answers never leave the phone.
 *
 * The heavy WebLLM library is loaded lazily, only when this feature is used.
 */
import type { MLCEngineInterface } from '@mlc-ai/web-llm';

/** Qwen2.5 1.5B Instruct (Apache-2.0). The f16 build needs the GPU's shader-f16 feature. */
const MODEL_IDS = {
  f16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
};
/** Rough one-time download size shown to the athlete before they opt in. */
export const GPU_MODEL_DOWNLOAD_LABEL = 'about 1 GB';

const ENABLED_KEY = 'treise_device_coach_enabled';
const DISMISSED_KEY = 'treise_device_coach_dismissed';

let modelIdPromise: Promise<string | null> | null = null;
let enginePromise: Promise<MLCEngineInterface> | null = null;

function storageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable
  }
}

/** The model build this device can run, or null when WebGPU isn't usable. */
export function getGpuModelId(): Promise<string | null> {
  if (!modelIdPromise) {
    modelIdPromise = (async () => {
      try {
        const gpu = typeof navigator !== 'undefined' ? (navigator as any).gpu : undefined;
        if (!gpu) return null;
        const adapter = await gpu.requestAdapter();
        if (!adapter) return null;
        // Phones with little memory can't hold the model alongside the app.
        const memoryGb = (navigator as any).deviceMemory;
        if (typeof memoryGb === 'number' && memoryGb < 4) return null;
        return adapter.features?.has?.('shader-f16') ? MODEL_IDS.f16 : MODEL_IDS.f32;
      } catch {
        return null;
      }
    })();
  }
  return modelIdPromise;
}

export function isGpuModelEnabled(): boolean {
  return storageGet(ENABLED_KEY) === '1';
}

export function isGpuModelOfferDismissed(): boolean {
  return storageGet(DISMISSED_KEY) === '1';
}

export function dismissGpuModelOffer(): void {
  storageSet(DISMISSED_KEY, '1');
}

/** True when the athlete opted in and the model files are on the device. */
export async function isGpuModelReady(): Promise<boolean> {
  if (!isGpuModelEnabled()) return false;
  const modelId = await getGpuModelId();
  if (!modelId) return false;
  try {
    const webllm = await import('@mlc-ai/web-llm');
    return await webllm.hasModelInCache(modelId);
  } catch {
    return false;
  }
}

/**
 * Downloads (first time) and loads the model. Reports progress 0-1. Call only after the athlete
 * chose to download. Resolves when the model is ready to answer.
 */
export function loadGpuModel(onProgress?: (fraction: number, text: string) => void): Promise<MLCEngineInterface> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const modelId = await getGpuModelId();
      if (!modelId) throw new Error('This phone cannot run the on-device coach.');
      const webllm = await import('@mlc-ai/web-llm');
      const worker = new Worker(new URL('../workers/coachModel.worker.ts', import.meta.url), { type: 'module' });
      const engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (report) => onProgress?.(report.progress, report.text),
      });
      storageSet(ENABLED_KEY, '1');
      return engine;
    })().catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * The conversation so far. When the next question uses the same system prompt, it is sent as a
 * continuation, so the model reuses what it has already read and only reads the new question
 * (a phone GPU reads roughly 30 tokens a second, so this is the difference between a ~15 s and a
 * ~2 s wait). Reset when the instructions change or the conversation gets long.
 */
let conversation: ChatTurn[] = [];
/** In-flight instruction pre-read; questions wait for it so the engine handles one request at a time. */
let primePromise: Promise<void> | null = null;
const MAX_REMEMBERED_EXCHANGES = 4;

/** The engine answers one request at a time; chat replies and exercise notes queue here. */
let requestQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = requestQueue.then(task, task);
  requestQueue = run.catch(() => undefined);
  return run;
}

export interface GpuPromptOptions {
  /** One-off request (e.g. an exercise note) that neither uses nor changes the chat conversation. */
  stateless?: boolean;
  maxTokens?: number;
}

/** Streams an answer from the GPU model. Returns null if it isn't ready or fails. */
export async function promptGpuModel(
  systemPrompt: string,
  userPrompt: string,
  onPartial?: (textSoFar: string) => void,
  options: GpuPromptOptions = {}
): Promise<string | null> {
  if (!(await isGpuModelReady())) return null;
  return enqueue(() => runGpuPrompt(systemPrompt, userPrompt, onPartial, options));
}

async function runGpuPrompt(
  systemPrompt: string,
  userPrompt: string,
  onPartial: ((textSoFar: string) => void) | undefined,
  options: GpuPromptOptions
): Promise<string | null> {
  try {
    const engine = await loadGpuModel();
    if (primePromise) await primePromise;
    if (options.stateless) {
      const reply = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: options.maxTokens ?? 120,
      });
      return reply.choices[0]?.message?.content?.trim() || null;
    }
    const sameInstructions = conversation[0]?.content === systemPrompt;
    const exchanges = (conversation.length - 1) / 2;
    if (!sameInstructions || exchanges >= MAX_REMEMBERED_EXCHANGES) {
      conversation = [{ role: 'system', content: systemPrompt }];
    }
    const messages: ChatTurn[] = [...conversation, { role: 'user', content: userPrompt }];
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.4,
      max_tokens: 200,
    });
    let text = '';
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content || '';
      onPartial?.(text);
    }
    const answer = text.trim();
    if (!answer) return null;
    conversation = [...messages, { role: 'assistant', content: answer }];
    return answer;
  } catch (err) {
    conversation = [];
    console.warn('On-device coach model failed:', err);
    return null;
  }
}

/**
 * Reads the coach instructions ahead of the first question (while the athlete is typing), so the
 * first answer starts quickly. Uses the same continuation mechanism as promptGpuModel.
 */
export function primeGpuModel(systemPrompt: string): Promise<void> {
  if (primePromise) return primePromise;
  primePromise = (async () => {
    if (!(await isGpuModelReady())) return;
    try {
      const engine = await loadGpuModel();
      if (conversation[0]?.content === systemPrompt) return;
      const messages: ChatTurn[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Ready?' },
      ];
      const reply = await engine.chat.completions.create({ messages, max_tokens: 4, temperature: 0 });
      conversation = [...messages, { role: 'assistant', content: reply.choices[0]?.message?.content?.trim() || 'Yes.' }];
    } catch {
      conversation = [];
    }
  })().finally(() => {
    primePromise = null;
  });
  return primePromise;
}

/** Removes the downloaded model to free space. */
export async function removeGpuModel(): Promise<void> {
  storageSet(ENABLED_KEY, null);
  const modelId = await getGpuModelId();
  try {
    const engine = enginePromise ? await enginePromise.catch(() => null) : null;
    await engine?.unload?.();
  } catch {
    // ignore
  }
  enginePromise = null;
  if (!modelId) return;
  try {
    const webllm = await import('@mlc-ai/web-llm');
    await webllm.deleteModelAllInfoInCache(modelId);
  } catch {
    // ignore
  }
}
