/**
 * Stateless Gemini 2.5 Flash-Lite client via `/api/coach/generate`.
 *
 * Used wherever Chrome does not expose a built-in on-device `LanguageModel` (Gemini Nano),
 * replacing the old 1 GB WebGPU download with a zero-download serverless call. The API key lives
 * only on the server (`GEMINI_API_KEY`); when the athlete is offline or the server is not
 * configured, `isFlashLiteReady()` returns false and every screen uses its deterministic
 * fact-based text immediately.
 */
import { CoachSuggestedAction, CoachToolName } from '../engine/types';
import { GeminiFunctionDeclaration } from './coachTools';
import { withoutLastExchange } from './onDeviceModel';

export interface FlashLiteFunctionCall {
  name: CoachToolName;
  args: Record<string, unknown>;
}

export interface FlashLiteStructuredResult {
  text: string;
  functionCall?: FlashLiteFunctionCall;
  suggestedActions?: CoachSuggestedAction[];
}

type ChatTurn = { role: 'user' | 'assistant'; content: string };

const STATUS_TTL_MS = 5 * 60 * 1000;
const FAILURE_STATUS_TTL_MS = 15 * 1000;
const STATUS_TIMEOUT_MS = 1800;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REMEMBERED_EXCHANGES = 4;

let cachedStatus: { configured: boolean; at: number; ttlMs: number } | null = null;
let inFlightStatus: Promise<boolean> | null = null;
const inFlightStateless = new Map<string, Promise<string | null>>();
let lastSystemPrompt = '';
let conversation: ChatTurn[] = [];

function isJsonResponse(res: Response): boolean {
  const ct = res.headers?.get?.('content-type') ?? '';
  return !ct || ct.includes('application/json');
}

async function fetchWithTimeout(input: string, init: RequestInit, ms: number): Promise<Response | null> {
  if (typeof AbortController === 'undefined') {
    return Promise.race([fetch(input, init), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True when the browser is online and `/api/coach/generate` has `GEMINI_API_KEY` configured. */
export async function isFlashLiteReady(force = false): Promise<boolean> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!force && cachedStatus && Date.now() - cachedStatus.at < cachedStatus.ttlMs) {
    return cachedStatus.configured;
  }
  if (!force && inFlightStatus) return inFlightStatus;
  let check: Promise<boolean> | null = null;
  check = (async () => {
    try {
      const res = await fetchWithTimeout('/api/coach/generate', { method: 'GET' }, STATUS_TIMEOUT_MS);
      if (!res || !res.ok || !isJsonResponse(res)) {
        cachedStatus = { configured: false, at: Date.now(), ttlMs: FAILURE_STATUS_TTL_MS };
        return false;
      }
      const body: any = await res.json();
      const configured = Boolean(body?.configured);
      cachedStatus = { configured, at: Date.now(), ttlMs: STATUS_TTL_MS };
      return configured;
    } catch {
      cachedStatus = { configured: false, at: Date.now(), ttlMs: FAILURE_STATUS_TTL_MS };
      return false;
    } finally {
      if (inFlightStatus === check) inFlightStatus = null;
    }
  })();
  inFlightStatus = check;
  return check;
}

export interface FlashLitePromptOptions {
  /** One-off request (exercise note, identity message, goals/workout summary) outside chat memory. */
  stateless?: boolean;
  maxTokens?: number;
}

/** Asks Gemini 2.5 Flash-Lite via the stateless serverless proxy. Returns null if unavailable or on error. */
export async function promptFlashLite(
  systemPrompt: string,
  userPrompt: string,
  onPartial?: (textSoFar: string) => void,
  options: FlashLitePromptOptions = {}
): Promise<string | null> {
  if (!(await isFlashLiteReady())) return null;

  try {
    if (options.stateless) {
      const maxOutputTokens = options.maxTokens ?? 140;
      const dedupeKey = `${maxOutputTokens}\n${systemPrompt}\n${userPrompt}`;
      const existing = inFlightStateless.get(dedupeKey);
      if (existing) {
        const reused = await existing;
        if (reused) onPartial?.(reused);
        return reused;
      }
      let reqPromise: Promise<string | null> | null = null;
      reqPromise = (async (): Promise<string | null> => {
        try {
          const res = await fetchWithTimeout(
            '/api/coach/generate',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemPrompt,
                userPrompt,
                maxOutputTokens,
                temperature: 0.25,
              }),
            },
            REQUEST_TIMEOUT_MS
          );
          if (!res) return null;
          if (res.status === 503) {
            cachedStatus = { configured: false, at: Date.now(), ttlMs: STATUS_TTL_MS };
            return null;
          }
          if (!res.ok || !isJsonResponse(res)) return null;
          const data: any = await res.json();
          const text = typeof data?.text === 'string' ? data.text.trim() : '';
          return text || null;
        } catch {
          return null;
        } finally {
          if (inFlightStateless.get(dedupeKey) === reqPromise) inFlightStateless.delete(dedupeKey);
        }
      })();
      inFlightStateless.set(dedupeKey, reqPromise);
      const text = await reqPromise;
      if (!text) return null;
      onPartial?.(text);
      return text;
    }

    const exchanges = conversation.length / 2;
    if (lastSystemPrompt !== systemPrompt) {
      lastSystemPrompt = systemPrompt;
      if (conversation.length > 4) {
        conversation = conversation.slice(-4);
      }
    }
    if (exchanges >= MAX_REMEMBERED_EXCHANGES) {
      conversation = conversation.slice(-(MAX_REMEMBERED_EXCHANGES - 1) * 2);
    }

    const messages: ChatTurn[] = [...conversation, { role: 'user', content: userPrompt }];
    const res = await fetchWithTimeout(
      '/api/coach/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          messages,
          maxOutputTokens: options.maxTokens ?? 200,
          temperature: 0.35,
        }),
      },
      REQUEST_TIMEOUT_MS
    );
    if (!res) return null;
    if (res.status === 503) {
      cachedStatus = { configured: false, at: Date.now(), ttlMs: STATUS_TTL_MS };
      return null;
    }
    if (!res.ok || !isJsonResponse(res)) return null;
    const data: any = await res.json();
    const answer = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!answer) return null;
    onPartial?.(answer);
    conversation = [...messages, { role: 'assistant', content: answer }];
    return answer;
  } catch {
    conversation = [];
    return null;
  }
}

export interface FlashLiteStructuredOptions {
  systemPrompt?: string;
  tools?: GeminiFunctionDeclaration[];
  maxTokens?: number;
  temperature?: number;
  responseSchema?: Record<string, unknown>;
}

const VALID_TOOLS = new Set<string>([
  'reset_program',
  'swap_exercise',
  'adjust_workout_volume',
  'save_athlete_memory',
]);

/**
 * Structured Gemini Flash-Lite request with optional tool declarations and JSON reply parsing.
 */
export async function promptFlashLiteStructured(
  userPrompt: string,
  options: FlashLiteStructuredOptions = {}
): Promise<FlashLiteStructuredResult | null> {
  if (!(await isFlashLiteReady())) return null;
  const systemPrompt = options.systemPrompt?.trim() || '';
  const exchanges = conversation.length / 2;
  if (lastSystemPrompt !== systemPrompt) {
    lastSystemPrompt = systemPrompt;
    if (conversation.length > 4) {
      conversation = conversation.slice(-4);
    }
  }
  if (exchanges >= MAX_REMEMBERED_EXCHANGES) {
    conversation = conversation.slice(-(MAX_REMEMBERED_EXCHANGES - 1) * 2);
  }

  try {
    const messages: ChatTurn[] = [...conversation, { role: 'user', content: userPrompt }];
    const res = await fetchWithTimeout(
      '/api/coach/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          messages,
          maxOutputTokens: options.maxTokens ?? 320,
          temperature: options.temperature ?? 0.25,
          ...(options.tools?.length ? { tools: options.tools } : {}),
          ...(options.responseSchema && !options.tools?.length
            ? { responseMimeType: 'application/json', responseSchema: options.responseSchema }
            : {}),
        }),
      },
      REQUEST_TIMEOUT_MS
    );
    if (!res || !res.ok || !isJsonResponse(res)) {
      if (res?.status === 503) cachedStatus = { configured: false, at: Date.now(), ttlMs: FAILURE_STATUS_TTL_MS };
      return null;
    }

    const data: any = await res.json();
    const rawFc = data?.functionCall;
    const functionCall: FlashLiteFunctionCall | undefined =
      rawFc && typeof rawFc.name === 'string' && VALID_TOOLS.has(rawFc.name)
        ? {
            name: rawFc.name as CoachToolName,
            args: rawFc.args && typeof rawFc.args === 'object' ? rawFc.args : {},
          }
        : undefined;

    const rawText = typeof data?.text === 'string' ? data.text.trim() : '';
    let text = rawText;
    let suggestedActions: CoachSuggestedAction[] | undefined;

    // Gracefully unwrap JSON payloads shaped like { reply, suggested_actions }.
    if (rawText.startsWith('{') && rawText.endsWith('}')) {
      try {
        const parsed: any = JSON.parse(rawText);
        if (typeof parsed?.reply === 'string' && parsed.reply.trim()) {
          text = parsed.reply.trim();
        }
        if (Array.isArray(parsed?.suggested_actions)) {
          suggestedActions = parsed.suggested_actions
            .filter((s: any) => typeof s?.label === 'string' && typeof s?.prompt === 'string')
            .slice(0, 3);
        }
      } catch {
        // Keep raw text as-is when not JSON
      }
    }

    if (!text && !functionCall) return null;
    if (text && !functionCall) {
      conversation = [...messages, { role: 'assistant', content: text }];
    }
    return { text, functionCall, suggestedActions };
  } catch {
    conversation = [];
    return null;
  }
}

/** Drops the last question and answer from chat memory when the answer was rejected by fact checks. */
export function forgetLastFlashLiteExchange(): void {
  conversation = withoutLastExchange([{ role: 'system' as const, content: lastSystemPrompt }, ...conversation]).slice(1) as ChatTurn[];
}

/** Clears chat conversation memory while keeping cached server status. */
export function resetFlashLiteConversation(): void {
  conversation = [];
  lastSystemPrompt = '';
}

/** Resets conversation memory and cached server status (for tests or when closing the coach). */
export function resetFlashLiteState(): void {
  resetFlashLiteConversation();
  cachedStatus = null;
  inFlightStatus = null;
  inFlightStateless.clear();
}
