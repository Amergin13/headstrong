import { applyCors } from '../_lib/cors.js';

/**
 * Stateless serverless proxy for the AI Coach (Gemini 2.5 Flash-Lite).
 *
 * Keeps GEMINI_API_KEY on the server only (never in client code or query strings), enforces
 * strict input and output token bounds, and stores no user data or conversation history.
 */

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
    return res.status(200).json({
      configured: Boolean(apiKey),
      model: GEMINI_MODEL,
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
  const timeout = controller ? setTimeout(() => controller.abort(), 15_000) : null;

  try {
    const upstream = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream model returned ${upstream.status}` });
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

    return res.status(200).json({ text, model: GEMINI_MODEL });
  } catch {
    return res.status(502).json({ error: 'Failed to reach the coach model.' });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
