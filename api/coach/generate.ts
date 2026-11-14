import { applyCors } from '../_lib/cors.js';

/**
 * Stateless serverless proxy for the AI Coach (Gemini Flash-Lite).
 *
 * Keeps GEMINI_API_KEY on the server only (never in client code or query strings), enforces
 * strict input and output token bounds, and stores no user data or conversation history.
 */

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
] as const;

let cachedWorkingModel: string | null = null;

function geminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function getCandidateModels(preferCached = false): string[] {
  const configuredModel = (process.env.GEMINI_MODEL || '').trim();
  const base = configuredModel ? [configuredModel, ...FALLBACK_GEMINI_MODELS] : [...FALLBACK_GEMINI_MODELS];
  const list = preferCached && cachedWorkingModel && !configuredModel ? [cachedWorkingModel, ...base] : base;
  return [...new Set(list)];
}

const MAX_SYSTEM_CHARS = 4000;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TURNS = 10;

interface IncomingTurn {
  role?: string;
  content?: string;
}

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

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (req.method === 'GET') {
    const models = getCandidateModels();
    return res.status(200).json({
      configured: Boolean(apiKey),
      model: models[0] || DEFAULT_GEMINI_MODEL,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!apiKey) {
    return res.status(503).json({
      error: 'Coach model is not configured on this server (missing GEMINI_API_KEY).',
    });
  }

  const body = parseBody(req.body);
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim().slice(0, MAX_SYSTEM_CHARS) : '';
  const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.trim().slice(0, MAX_MESSAGE_CHARS) : '';
  const rawTurns = Array.isArray(body.messages) ? (body.messages as IncomingTurn[]) : [];

  const contents =
    rawTurns.length > 0
      ? rawTurns
          .filter((t) => t && (t.role === 'user' || t.role === 'assistant' || t.role === 'model') && typeof t.content === 'string' && t.content.trim().length > 0)
          .slice(-MAX_TURNS)
          .map((t) => ({
            role: t.role === 'assistant' || t.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(t.content).trim().slice(0, MAX_MESSAGE_CHARS) }],
          }))
      : userPrompt
      ? [{ role: 'user', parts: [{ text: userPrompt }] }]
      : [];

  if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'A user prompt is required.' });
  }

  const rawMaxTokens = Number(body.maxOutputTokens);
  const maxOutputTokens = Number.isFinite(rawMaxTokens) ? Math.max(16, Math.min(250, Math.round(rawMaxTokens))) : 180;
  const rawTemp = Number(body.temperature);
  const temperature = Number.isFinite(rawTemp) ? Math.max(0, Math.min(0.7, rawTemp)) : 0.3;

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };
  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 14_000) : null;

  try {
    const candidateModels = getCandidateModels(true);
    let activeModel = candidateModels[0] || DEFAULT_GEMINI_MODEL;
    let upstream: Response | null = null;

    for (let i = 0; i < candidateModels.length; i += 1) {
      activeModel = candidateModels[i];
      const attemptController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const attemptTimer = attemptController ? setTimeout(() => attemptController.abort(), 5500) : null;
      const onOuterAbort = () => attemptController?.abort();
      if (controller && attemptController) {
        if (controller.signal.aborted) attemptController.abort();
        else controller.signal.addEventListener('abort', onOuterAbort, { once: true });
      }
      try {
        upstream = await fetch(geminiEndpoint(activeModel), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(payload),
          ...(attemptController ? { signal: attemptController.signal } : {}),
        });
      } catch (err) {
        if (attemptTimer) clearTimeout(attemptTimer);
        if (controller && attemptController) controller.signal.removeEventListener('abort', onOuterAbort);
        if (controller?.signal.aborted || i === candidateModels.length - 1) throw err;
        continue;
      }
      if (attemptTimer) clearTimeout(attemptTimer);
      if (controller && attemptController) controller.signal.removeEventListener('abort', onOuterAbort);
      if (upstream.status === 404) {
        if (cachedWorkingModel === activeModel) cachedWorkingModel = null;
        if (i === candidateModels.length - 1) break;
        continue;
      }
      break;
    }

    if (!upstream || !upstream.ok) {
      return res.status(502).json({ error: `Upstream model returned ${upstream ? upstream.status : 'error'}` });
    }

    const data: any = await upstream.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts
          .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
          .join('')
          .trim()
      : '';

    if (!text) {
      return res.status(502).json({ error: 'Model returned an empty answer.' });
    }

    cachedWorkingModel = activeModel;
    return res.status(200).json({ text, model: activeModel });
  } catch {
    return res.status(502).json({ error: 'Failed to reach the coach model.' });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
