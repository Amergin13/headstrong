import {
  EnvironmentOverlay,
  EnvironmentProfileType,
  EquipmentAvailabilityToken,
  OverlayScope,
} from '../engine/types';
import { computeOverlayExpiryMs, createPresetOverlay } from '../engine/continuityEngine';
import { LB_PER_KG } from '../utils/units';

export interface ParsedOverlayOptions {
  nowMs?: number;
  defaultScope?: OverlayScope;
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Pure, deterministic, offline parser turning natural-language training environment descriptions
 * (e.g. "Hotel dumbbells only up to 30 kg for the next 5 days") into a structured EnvironmentOverlay.
 *
 * Strictly local — never makes network calls and never computes loads or e1RMs.
 */
export function parseEnvironmentConstraintText(
  rawText: string,
  options?: ParsedOverlayOptions
): EnvironmentOverlay {
  const nowMs = options?.nowMs ?? Date.now();
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();

  if (!text) {
    return createPresetOverlay('HOME_GYM', 'TODAY_ONLY', { nowMs });
  }

  // 1) Parse duration / scope & expiration
  let scope: OverlayScope = options?.defaultScope ?? 'TODAY_ONLY';
  let expiresAtEpochMs: number | null = computeOverlayExpiryMs(scope, nowMs);

  const daysMatch = lower.match(/(?:for\s+(?:the\s+next\s+)?|next\s+)(\d{1,2})\s*days?\b/);
  const weeksMatch = lower.match(/(?:for\s+(?:the\s+next\s+)?|next\s+)(\d{1,2})\s*weeks?\b/);
  const untilWeekdayMatch = lower.match(/\buntil\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);

  if (daysMatch) {
    const days = Math.max(1, Math.min(30, parseInt(daysMatch[1], 10)));
    scope = 'CUSTOM_UNTIL_DATE';
    expiresAtEpochMs = nowMs + days * 24 * 60 * 60 * 1000;
  } else if (weeksMatch) {
    const weeks = Math.max(1, Math.min(6, parseInt(weeksMatch[1], 10)));
    scope = weeks === 1 ? 'WEEK_OVERRIDE' : 'CUSTOM_UNTIL_DATE';
    expiresAtEpochMs = nowMs + weeks * 7 * 24 * 60 * 60 * 1000;
  } else if (untilWeekdayMatch) {
    const targetDay = WEEKDAY_NAMES.indexOf(untilWeekdayMatch[1]);
    const d = new Date(nowMs);
    let delta = targetDay - d.getDay();
    if (delta <= 0) delta += 7;
    d.setDate(d.getDate() + delta);
    d.setHours(23, 59, 59, 999);
    scope = 'CUSTOM_UNTIL_DATE';
    expiresAtEpochMs = d.getTime();
  } else if (/\b(this week|all week|whole week|for the week|for a week)\b/.test(lower)) {
    scope = 'WEEK_OVERRIDE';
    expiresAtEpochMs = computeOverlayExpiryMs('WEEK_OVERRIDE', nowMs);
  } else if (/\b(today|just today|this session|tonight|this morning)\b/.test(lower)) {
    scope = 'TODAY_ONLY';
    expiresAtEpochMs = computeOverlayExpiryMs('TODAY_ONLY', nowMs);
  }

  // 2) Parse max dumbbell cap (kg or lb)
  let maxDumbbellKg: number | null = null;
  const weightCapMatch = lower.match(
    /(?:up\s*to|max(?:imum)?|capped?\s*at|under|<=|≤|to)\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|lb|lbs|pounds?)\b/
  );
  if (weightCapMatch) {
    const val = parseFloat(weightCapMatch[1]);
    const unitRaw = weightCapMatch[2];
    if (Number.isFinite(val) && val > 0) {
      maxDumbbellKg = unitRaw.startsWith('lb') || unitRaw.startsWith('pound')
        ? Math.round((val / LB_PER_KG) * 2) / 2
        : Math.round(val * 2) / 2;
    }
  }

  // 3) Parse session duration cap (minutes)
  let maxSessionMinutes: number | null = null;
  const minsMatch = lower.match(/\b(\d{2,3})\s*(?:min|mins|minutes?)\b/);
  if (minsMatch) {
    const mins = parseInt(minsMatch[1], 10);
    if (Number.isFinite(mins) && mins >= 10 && mins <= 120) {
      maxSessionMinutes = mins;
    }
  } else if (/\b(short on time|quick|express|rush|rushed|half hour)\b/.test(lower)) {
    maxSessionMinutes = 30;
  }

  // 4) Parse equipment availability & profile type
  const mentionsNoEquipment = /\b(bodyweight|no equipment|no gear|no weights?|calisthenics|zero equipment|nothing)\b/.test(lower);
  const mentionsDumbbells =
    (/\b(dumbbells?|dbs?|hotel gym)\b/.test(lower) || (/\bhotel\b/.test(lower) && !mentionsNoEquipment)) &&
    !/\bno dumbbells?\b/.test(lower);
  const mentionsBarbell = /\b(barbell|full gym|back at the gym|home gym|commercial gym)\b/.test(lower) && !/\bno barbell\b/.test(lower) && !/\bdumbbells?\s+only\b/.test(lower);
  const mentionsNoBench = /\b(no bench|without a? ?bench|floor only)\b/.test(lower);
  const mentionsCable = /\b(cables?|pulley)\b/.test(lower) && !/\bno cables?\b/.test(lower);
  const mentionsMachine = /\b(machines?|pin[- ]?loaded|smith)\b/.test(lower) && !/\bno machines?\b/.test(lower);
  const mentionsPullupBar = /\b(pull[- ]?up bar|chin[- ]?up bar)\b/.test(lower);
  const mentionsTrx = /\b(trx|rings|suspension)\b/.test(lower);
  const mentionsBands = /\b(bands?|resistance band)\b/.test(lower);

  const equipment = new Set<EquipmentAvailabilityToken>(['NONE']);
  let activeProfileType: EnvironmentProfileType = 'CUSTOM';

  if (mentionsNoEquipment && !mentionsDumbbells && !mentionsBarbell && !mentionsMachine && !mentionsCable) {
    activeProfileType = 'BODYWEIGHT';
    if (mentionsPullupBar) equipment.add('PULLUP_BAR');
    if (mentionsTrx) equipment.add('TRX');
    if (mentionsBands) equipment.add('BANDS');
  } else if (mentionsDumbbells && !mentionsBarbell) {
    activeProfileType = 'HOTEL_DUMBBELLS';
    equipment.add('DUMBBELLS');
    if (!mentionsNoBench) equipment.add('BENCH');
    if (mentionsCable) equipment.add('CABLE');
    if (mentionsMachine) equipment.add('MACHINE');
    if (mentionsPullupBar) equipment.add('PULLUP_BAR');
    if (mentionsTrx) equipment.add('TRX');
    if (mentionsBands) equipment.add('BANDS');
  } else if (mentionsBarbell && !maxSessionMinutes) {
    return createPresetOverlay('HOME_GYM', 'TODAY_ONLY', { nowMs });
  } else if (maxSessionMinutes != null && !mentionsDumbbells && !mentionsNoEquipment && !mentionsMachine && !mentionsCable) {
    return createPresetOverlay('TIME_CONSTRAINED', scope, {
      nowMs,
      maxSessionMinutes,
      expiresAtEpochMs,
      sourcePrompt: text,
    });
  } else {
    // Custom equipment list
    if (mentionsBarbell) equipment.add('BARBELL');
    if (mentionsDumbbells) equipment.add('DUMBBELLS');
    if (!mentionsNoBench && (mentionsBarbell || mentionsDumbbells || /\bbench\b/.test(lower))) {
      equipment.add('BENCH');
    }
    if (mentionsCable) equipment.add('CABLE');
    if (mentionsMachine) equipment.add('MACHINE');
    if (mentionsPullupBar) equipment.add('PULLUP_BAR');
    if (mentionsTrx) equipment.add('TRX');
    if (mentionsBands) equipment.add('BANDS');
    if (equipment.size === 1) {
      activeProfileType = 'BODYWEIGHT';
    }
  }

  let label: string;
  if (activeProfileType === 'HOTEL_DUMBBELLS') {
    label = maxDumbbellKg ? `Hotel Dumbbells (≤${maxDumbbellKg} kg)` : 'Hotel Dumbbells';
  } else if (activeProfileType === 'BODYWEIGHT') {
    label = 'Bodyweight Only';
  } else {
    label = maxDumbbellKg ? `Custom Gym (≤${maxDumbbellKg} kg)` : 'Custom Gym';
  }

  return {
    overlayId: `overlay-parsed-${nowMs}`,
    activeProfileType,
    label,
    availableEquipment: Array.from(equipment),
    maxDumbbellKg,
    dumbbellStepKg: equipment.has('DUMBBELLS') ? 2 : null,
    maxSessionMinutes,
    scope,
    expiresAtEpochMs,
    sourcePrompt: text,
    createdAtEpochMs: nowMs,
  };
}

/**
 * Local-only constraint parser. Attempts strictly on-device Chrome `LanguageModel` (Gemini Nano)
 * structured JSON parsing when available locally (never calling any remote API), then validates
 * and normalizes with the deterministic parser so invalid model output can never break scheduling.
 */
export async function parseEnvironmentConstraintLocally(
  rawText: string,
  options?: ParsedOverlayOptions
): Promise<EnvironmentOverlay> {
  const deterministic = parseEnvironmentConstraintText(rawText, options);
  const nowMs = options?.nowMs ?? Date.now();

  // Strictly local-only check: only use browser's built-in LanguageModel if available on-device.
  if (typeof window === 'undefined') return deterministic;
  const w = window as unknown as { LanguageModel?: { availability?: () => Promise<string>; create?: (opts: unknown) => Promise<{ prompt: (q: string) => Promise<string>; destroy?: () => void }> } };
  const api = w.LanguageModel;
  if (!api || typeof api.availability !== 'function' || typeof api.create !== 'function') {
    return deterministic;
  }

  try {
    const status = await api.availability();
    if (status !== 'available') return deterministic;

    const session = await api.create({
      systemPrompt:
        'Extract gym constraints as JSON only with keys: available_equipment (array of BARBELL, DUMBBELLS, BENCH, CABLE, MACHINE, PULLUP_BAR, TRX, BANDS, NONE), max_dumbbell_kg (number or null), max_session_minutes (number or null), duration_days (number or null). Never compute weights or 1RMs.',
    });
    try {
      const raw = await session.prompt(rawText);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return deterministic;
      const parsed = JSON.parse(match[0]) as {
        available_equipment?: unknown;
        max_dumbbell_kg?: unknown;
        max_session_minutes?: unknown;
        duration_days?: unknown;
      };

      const allowed = new Set<EquipmentAvailabilityToken>([
        'BARBELL',
        'DUMBBELLS',
        'BENCH',
        'CABLE',
        'MACHINE',
        'PULLUP_BAR',
        'TRX',
        'BANDS',
        'NONE',
      ]);
      const parsedEquip = Array.isArray(parsed.available_equipment)
        ? (parsed.available_equipment
            .map((x) => String(x).toUpperCase())
            .filter((x): x is EquipmentAvailabilityToken => allowed.has(x as EquipmentAvailabilityToken)))
        : [];

      const maxDb =
        typeof parsed.max_dumbbell_kg === 'number' && Number.isFinite(parsed.max_dumbbell_kg) && parsed.max_dumbbell_kg > 0
          ? Math.round(parsed.max_dumbbell_kg * 2) / 2
          : deterministic.maxDumbbellKg;
      const maxMin =
        typeof parsed.max_session_minutes === 'number' && Number.isFinite(parsed.max_session_minutes) && parsed.max_session_minutes >= 10
          ? Math.round(parsed.max_session_minutes)
          : deterministic.maxSessionMinutes;
      const days =
        typeof parsed.duration_days === 'number' && Number.isFinite(parsed.duration_days) && parsed.duration_days >= 1
          ? Math.min(30, Math.round(parsed.duration_days))
          : null;

      return {
        ...deterministic,
        availableEquipment: parsedEquip.length > 0 ? Array.from(new Set([...parsedEquip, 'NONE'])) : deterministic.availableEquipment,
        maxDumbbellKg: maxDb,
        maxSessionMinutes: maxMin,
        scope: days ? 'CUSTOM_UNTIL_DATE' : deterministic.scope,
        expiresAtEpochMs: days ? nowMs + days * 24 * 60 * 60 * 1000 : deterministic.expiresAtEpochMs,
      };
    } finally {
      session.destroy?.();
    }
  } catch {
    return deterministic;
  }
}
