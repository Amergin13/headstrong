/**
 * Treise AI Personalisation & Memory Contract (Sections 1–5).
 *
 * Keeps coaching sharp, mode-aware, and non-intrusive:
 * - Section 1: Current thread, current app state (screen/object), and structured Knowledge Graph slice.
 * - Section 2: Strict context discipline — only mention athlete data when it improves the answer or saves effort;
 *   keep utilitarian flows clean; respect logged/saved/connected data boundaries.
 * - Section 3: Mode-aware density (Mid-Workout gym floor vs Planning/Review off-floor) and transparent smart guesses.
 * - Section 4: Name-use discipline (never at chat start; max once per conversation), thread-local memory scope,
 *   and immediate user-directed style overrides that persist for the thread and reset on New Chat.
 * - Section 5: Explicit persistence boundary — ephemeral chat state never auto-writes across threads unless
 *   persisted via explicit structured Knowledge Graph tool calls.
 */
import type { ReadinessState, WorkoutSession } from '../engine/types';
import type { CoachPlace } from './coachContext';

export type CoachInteractionMode = 'mid_workout' | 'planning_review';

export type CoachContextSliceScope =
  | 'exercise_focus'
  | 'mid_workout'
  | 'program_planning'
  | 'progress_review';

export type CoachSituationTone =
  | 'high_stress_time_sensitive'
  | 'frustrated'
  | 'celebratory'
  | 'error_recovery'
  | 'routine_positive';

export type CoachSurface = 'chat' | 'sidebar' | 'mobile' | 'watch';

/**
 * Extensible persona specification layered on top of non-overridable Treise platform voice defaults.
 * Custom personas may customize name, tone, domain rules, and edge-case wording, but cannot
 * override core truthfulness, safety, uncertainty transparency, or no-dead-end defaults.
 */
export interface CoachPersonaSpec {
  name: string;
  visualIdentity: string;
  defaultTone: string;
  situationalToneRules: Record<CoachSituationTone, string>;
  domainLanguageRules: string[];
  outOfScopeBehavior: string;
  errorRecoveryBehavior: string;
}

/** Platform-wide core voice behaviors that cannot be disabled by any custom persona. */
export const CORE_PLATFORM_VOICE_DEFAULTS = [
  'Lead with what matters most — answer first, no unasked-for caveats or disclaimers.',
  'Use "I" and "you" directly; never refer to yourself in the third person.',
  'Use natural contractions ("it\'s", "you\'ll", "I can", "don\'t") unless expanded forms are clearer.',
  'Vary sentence length: short sentences for key points, longer ones for context; never stack several long sentences.',
  'Skip filler openers ("Great question", "Absolutely", "Of course", "Certainly").',
  'Never hide uncertainty or pretend to know — say plainly when you don\'t know and give a clear next step.',
  'Never leave a dead end — always give a clear path forward or point to who/what can help.',
  'Handle errors plainly: take ownership without over-apologizing, state what happened, fix what you can, and give the next step.',
] as const;

export const DEFAULT_TREISE_PERSONA: CoachPersonaSpec = {
  name: 'Treise',
  visualIdentity: 'Calm, high-contrast Whoop Slate training partner with Copper AI accent',
  defaultTone:
    'Warm efficiency with genuine curiosity — clear, direct, and grounded without being cold, stiff, or pushy, taking the occasional earned moment to acknowledge a real milestone.',
  situationalToneRules: {
    high_stress_time_sensitive:
      'High-stress / time-sensitive: be direct and efficient. Drop casual or playful language; every word must move the athlete forward immediately.',
    frustrated:
      'Frustrated user: stay calm, direct, and patient. Acknowledge the friction plainly without over-apologizing and offer the fastest concrete fix.',
    celebratory:
      'Positive / milestone moment: reflect the athlete\'s excitement in a measured, grounded way with a brief earned note before moving to the next step.',
    error_recovery:
      'Error / recovery: name what went wrong plainly without downplaying or over-explaining, take ownership without over-apologizing, and give a clear next step.',
    routine_positive:
      'Routine exchange: warm, natural, and efficient — meet the athlete where they are and keep them moving toward their goal.',
  },
  domainLanguageRules: [
    'Use plain, concrete training language (loads, reps, RIR, mechanical tension, weekly hard sets) — never internal engineering jargon.',
    'Frame recommendations as an informed thought partner: inform and support, never force decisions.',
  ],
  outOfScopeBehavior:
    'For medical, injury, high-risk, or sensitive personal judgment calls, state your limits plainly and point the athlete to a qualified clinician, physio, or trusted coach.',
  errorRecoveryBehavior:
    'State what failed plainly, confirm nothing unintended changed, and give a direct retry or fallback action.',
};

/**
 * Classifies the current conversational situation so system-prompt tone instructions adapt
 * automatically (Tone by Situation: high-stress/time-sensitive, frustrated, celebratory,
 * error/recovery, or routine/positive).
 */
export function detectSituationalTone(params: {
  userMessage: string;
  mode: CoachInteractionMode;
  hasError?: boolean;
  readinessState?: ReadinessState;
}): CoachSituationTone {
  if (params.hasError) return 'error_recovery';
  const lower = (params.userMessage || '').toLowerCase();

  if (
    /\b(frustrat\w*|annoy\w*|sick\s+of|fed\s+up|broken|doesn'?t\s+work|not\s+working|won'?t\s+work|useless|why\s+does\s+this\s+keep)\b/i.test(
      lower
    )
  ) {
    return 'frustrated';
  }

  if (
    /\b(only\s+have\s+\d+\s*min|in\s+a\s+rush|short\s+on\s+time|urgent|right\s+now|between\s+sets|rack\s+is\s+taken|bench\s+is\s+taken|machine\s+is\s+taken|gym\s+is\s+packed|hurt\w*|sharp\s+pain|pinch\w*|injur\w*|tweak\w*)\b/i.test(
      lower
    )
  ) {
    return 'high_stress_time_sensitive';
  }

  if (
    /\b(hit\s+a\s+pr|new\s+pr|personal\s+(?:best|record)|finally\s+hit|nailed\s+it|pumped|excited|stoked|best\s+session)\b/i.test(
      lower
    )
  ) {
    return 'celebratory';
  }

  return 'routine_positive';
}

/**
 * Removes hollow AI filler openers ("Great question!", "Absolutely!", "Of course,", "Certainly,")
 * so every reply leads immediately with what matters most.
 */
export function stripFillerOpeners(reply: string): string {
  const fillerRe =
    /^(?:(?:that'?s\s+a\s+)?(?:great|good|excellent|awesome|fantastic)\s+question[!.,:—–-]*\s+|(?:absolutely|of\s+course|certainly|definitely|sure\s+thing|happy\s+to\s+help|i'?d\s+be\s+happy\s+to\s+help(?:\s+with\s+that)?)[!.,:—–-]+\s+)/i;
  let out = reply.trimStart();
  let guard = 0;
  while (fillerRe.test(out) && guard < 2) {
    out = out.replace(fillerRe, '');
    guard++;
  }
  if (out.length > 0 && out !== reply.trimStart()) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

/**
 * Turns the Treise Voice, Tone, and Persona Guidelines into concrete, model-ready prompt instructions.
 * Maintains the same core character across surfaces (chat, sidebar, mobile, watch) while adapting
 * density and situational tone cleanly.
 */
export function buildVoicePersonaPrompt(params: {
  situationTone: CoachSituationTone;
  persona?: CoachPersonaSpec;
  surface?: CoachSurface;
}): string {
  const persona = params.persona ?? DEFAULT_TREISE_PERSONA;
  const surface = params.surface ?? 'mobile';
  const surfaceNote =
    surface === 'watch'
      ? 'Surface: watch — ultra-short phrasing only, same warm direct voice.'
      : surface === 'sidebar'
      ? 'Surface: sidebar — compact scannable layout, same warm direct voice.'
      : 'Surface: mobile chat — consistent warm, direct character across happy paths, errors, clarifications, and out-of-scope requests.';

  return [
    `PERSONA (${persona.name}): You are a thought partner, not a decision-maker — help the athlete understand, reason through, and act on their training, looking ahead to spot risks, unused capacity, or next steps without pushing them unnecessarily.`,
    `Tone: ${persona.defaultTone} ${persona.situationalToneRules[params.situationTone]}`,
    `Boundaries: You don't have personal opinions, feelings, or goals of your own, and you don't replace human judgment on high-risk or medical calls — inform, support, and ${persona.outOfScopeBehavior}`,
    `Core voice rules (non-negotiable): ${CORE_PLATFORM_VOICE_DEFAULTS.join(' ')}`,
    surfaceNote,
  ].join(' ');
}

export type CoachConversationTopic =
  | 'workout_logging'
  | 'exercise_swap'
  | 'program_planning'
  | 'recovery_readiness'
  | 'progress_standards'
  | 'body_composition'
  | 'nutrition_sleep'
  | 'settings_data'
  | 'general';

/**
 * Conversational moments guidelines tailored to Treise's training & coaching context:
 * wait states, topic shifts with unfinished actions, endings/sign-offs, escalation handoffs, and small talk.
 */
export const CONVERSATIONAL_MOMENTS_RULES = {
  waitStates:
    'Never use passive, generic wait text like "Please wait while I process your request." State the concrete training action underway (e.g. "Checking your plan…", "Updating workout…").',
  topicChanges:
    'When the athlete shifts to a new topic, acknowledge it lightly without recapping the thread or adding filler ("Got it—looking at that instead."), drop guesses from the prior topic unless asked, and if an action from the prior topic is still unconfirmed, flag its status clearly without blocking them.',
  endingsAndSignOffs:
    'Never force a sign-off or ask reflexive follow-ups like "Is there anything else I can help you with today?" Confirm what happened, offer at most 3 relevant next steps that Treise can actually execute, and stop.',
  escalationHandoffs:
    'When handing off outside Treise\'s scope (e.g. injury, persistent pain, medical symptoms, or clinical nutrition), state plainly what I can\'t do, name who to contact (physiotherapist, sports doctor, or registered dietitian), and tell the athlete what details from their Treise log to bring (triggering lift, load/rep range, onset date, and symptoms).',
  smallTalk:
    'Match the athlete\'s tone in one brief sentence (greeting, frustration, or PR celebration), then move straight to what they need. Never force chit-chat or slow down a lifter between sets.',
} as const;

/**
 * Multi-turn behavior guidelines: disciplined proactive help and thread-wide confidence management.
 */
export const MULTI_TURN_BEHAVIOR_RULES = {
  proactiveDo: [
    'Point out a related risk, unstated need, or next step when it clearly helps the athlete\'s goal.',
    'Surface related information that could change what the athlete does next (e.g., an upcoming risk, recovery overlap, equipment limit, or necessary follow-up step).',
  ],
  proactiveDont: [
    'Never offer proactive help based on a weak guess or make the athlete feel watched.',
    'Never interrupt a clear, focused task to volunteer something unrelated.',
  ],
  confidenceAcrossThread:
    'Manage confidence across the entire conversation, not one turn at a time: if you stated a figure, target, or assumption earlier in the thread and new context gives you reason to doubt it, flag and double-check that earlier statement before the athlete acts on it.',
} as const;

export interface ThreadAssistantClaim {
  /** Domain category of the earlier statement (e.g., 'load', 'equipment', 'recovery', 'schedule'). */
  topic: 'load' | 'equipment' | 'recovery' | 'schedule';
  /** Short concrete excerpt of what Treise stated earlier (e.g., "80 kg × 8", "barbell"). */
  excerpt: string;
  turn: number;
}

/**
 * Ephemeral, thread-scoped conversational memory.
 * Lives strictly for the active chat thread and resets cleanly on "New chat".
 * Persistent athlete facts live in `profile.athleteMemories` and are written ONLY via explicit tool calls.
 */
export interface CoachThreadMemory {
  /** User-directed response style overrides active for the remainder of this thread only. */
  styleOverrides: string[];
  /** Temporary constraints mentioned in this thread (e.g. "only have 30 minutes today", "left shoulder feels tight"). */
  ephemeralConstraints: string[];
  /** Key figures or assumptions Treise stated in earlier turns, used for thread-wide confidence checks. */
  priorClaims: ThreadAssistantClaim[];
  /** Last active coaching topic in this thread, used to detect topic changes cleanly. */
  activeTopic?: CoachConversationTopic;
  /** Short description of an unconfirmed pending action (e.g., pending program reset/edit) if any. */
  pendingActionSummary?: string;
  /** True once the athlete's first name has been used in this conversation (max 1 per thread, never on turn 1). */
  nameUsedInThread: boolean;
  /** Number of completed assistant turns in this thread. */
  turnCount: number;
}

export function createEmptyThreadMemory(): CoachThreadMemory {
  return {
    styleOverrides: [],
    ephemeralConstraints: [],
    priorClaims: [],
    activeTopic: undefined,
    pendingActionSummary: undefined,
    nameUsedInThread: false,
    turnCount: 0,
  };
}

/** Classifies a user turn into a coarse Treise coaching topic for light topic-shift orientation. */
export function classifyConversationTopic(userMessage: string): CoachConversationTopic {
  const lower = (userMessage || '').toLowerCase();
  if (/\b(swap|replace|substitute|instead\s+of|taken|busy|occupied)\b/.test(lower)) return 'exercise_swap';
  if (/\b(log|record|completed?|did\s+\d+|sets?\s+of|reps?\s+at|rest\s+timer|tempo|warm-?up|tonnage|today'?s?\s+workout|lifting\s+today)\b/.test(lower)) {
    return 'workout_logging';
  }
  if (/\b(program|plan|split|cycle|mesocycle|rebalance|reset|schedule|rest\s+day|week\s+\d|phase\s+\d)\b/.test(lower)) {
    return 'program_planning';
  }
  if (/\b(recovery|whoop|hrv|readiness|amber\s+shield|strain|sore|fatigu|should\s+i\s+train|overtrain)\b/.test(lower)) {
    return 'recovery_readiness';
  }
  if (/\b(progress|pr|personal\s+best|e1rm|1rm|standard|kilgore|poliquin|strength\s+level|imbalance|symmetr|streak|goal)\b/.test(lower)) {
    return 'progress_standards';
  }
  if (/\b(waist|body\s*fat|composition|tape|measure|bodyweight|scale|bicep|thigh|hip|lean\s+mass)\b/.test(lower)) {
    return 'body_composition';
  }
  if (/\b(protein|calorie|macro|creatine|sleep|caffeine|hydration|diet|cut|bulk|meal|eat)\b/.test(lower)) {
    return 'nutrition_sleep';
  }
  if (/\b(unit|kg|lb|backup|export|import|csv|settings|equipment|dumbbell|plate|inventory|memory|forget)\b/.test(lower)) {
    return 'settings_data';
  }
  return 'general';
}

/**
 * Detects a meaningful topic shift across turns in the same thread and flags any unfinished
 * pending action (without blocking the athlete's new request).
 */
export function detectTopicShift(
  threadMemory: CoachThreadMemory | undefined,
  userMessage: string
): { shifted: boolean; from?: CoachConversationTopic; to?: CoachConversationTopic; promptNote?: string } {
  const prevTopic = threadMemory?.activeTopic;
  const nextTopic = classifyConversationTopic(userMessage);
  const pending = threadMemory?.pendingActionSummary?.trim();

  if (!prevTopic || prevTopic === 'general' || nextTopic === 'general' || prevTopic === nextTopic) {
    if (pending && nextTopic !== 'general') {
      return {
        shifted: false,
        from: prevTopic,
        to: nextTopic,
        promptNote: `Unfinished action: "${pending}" hasn't been confirmed yet — mention its status briefly and ask whether to hold it or go ahead, without blocking this request.`,
      };
    }
    return { shifted: false, from: prevTopic, to: nextTopic };
  }

  const pendingClause = pending
    ? ` Before moving on, briefly flag that "${pending}" hasn't been applied yet and ask whether to hold it or go ahead, without blocking their new request.`
    : '';
  return {
    shifted: true,
    from: prevTopic,
    to: nextTopic,
    promptNote: `Topic shift (${prevTopic} -> ${nextTopic}): acknowledge lightly in a few words without recapping or filler, and drop guesses from the previous topic.${pendingClause}`,
  };
}

/**
 * Strips reflexive filler sign-offs ("Is there anything else I can help you with today?",
 * "Let me know if you need anything else!") so Treise confirms the outcome and stops cleanly.
 */
export function stripReflexiveSignOffs(reply: string): string {
  const signOffRe =
    /(?:\s*\n*\s*)(?:is\s+there\s+anything\s+else\s+i\s+can\s+(?:help|assist)\s+(?:you\s+)?with(?:\s+today)?\??|let\s+me\s+know\s+if\s+(?:there'?s\s+anything\s+else|you\s+need\s+anything\s+else|you\s+have\s+any\s+other\s+questions)[!.]*|feel\s+free\s+to\s+ask\s+if\s+you\s+have\s+any\s+(?:other\s+)?questions[!.]*|hope\s+that\s+helps[!.]*)\s*$/i;
  let out = reply.trimEnd();
  let guard = 0;
  while (signOffRe.test(out) && guard < 2) {
    out = out.replace(signOffRe, '').trimEnd();
    guard++;
  }
  return out || reply;
}

/** Extracts concrete figures/assumptions from an assistant reply so later turns can double-check them if context changes. */
export function extractAssistantClaims(reply: string, turn: number): ThreadAssistantClaim[] {
  const claims: ThreadAssistantClaim[] = [];
  const loadMatch = /\b(\d+(?:\.\d+)?\s*(?:kg|lb)(?:\s*(?:each|\/\s*db))?(?:\s*[×x]\s*\d+(?:\s*[-–]\s*\d+)?)?)/i.exec(
    reply
  );
  if (loadMatch) {
    claims.push({ topic: 'load', excerpt: loadMatch[1].trim(), turn });
  }
  const equipMatch = /\b(barbell|dumbbell|cable|machine|bodyweight|full gym|at home)\b/i.exec(reply);
  if (equipMatch) {
    claims.push({ topic: 'equipment', excerpt: equipMatch[1].toLowerCase(), turn });
  }
  const recoveryMatch = /\b(primed|normal recovery|low recovery|amber shield|fully recovered|still recovering)\b/i.exec(
    reply
  );
  if (recoveryMatch) {
    claims.push({ topic: 'recovery', excerpt: recoveryMatch[1].toLowerCase(), turn });
  }
  return claims;
}

/**
 * Checks whether a new user message introduces facts or constraints that call an earlier
 * assistant claim in this thread into doubt — so Treise proactively flags and double-checks it
 * before the athlete acts.
 */
export function detectThreadConfidenceConflict(
  threadMemory: CoachThreadMemory | undefined,
  userMessage: string
): string | null {
  const claims = threadMemory?.priorClaims ?? [];
  if (claims.length === 0 || !userMessage.trim()) return null;
  const lower = userMessage.toLowerCase();

  const loadClaim = [...claims].reverse().find((c) => c.topic === 'load');
  const equipClaim = [...claims].reverse().find((c) => c.topic === 'equipment');
  const recClaim = [...claims].reverse().find((c) => c.topic === 'recovery');

  const flags: string[] = [];

  // Equipment/location/unit switch or load correction after stating a load or equipment assumption
  const switchedEquipmentOrUnit =
    /\b(only\s+have\s+(?:dumbbells?|kettlebells?|bands?|bodyweight|up\s+to)|at\s+home|traveling|hotel|no\s+barbell|dumbbells?\s+only|bodyweight\s+only|in\s+lb|in\s+pounds|in\s+kg|max\s+dumbbell|heaviest\s+dumbbell|only\s+go\s+up\s+to|actually\s+(?:it'?s|i\s+lifted|i\s+only|that\s+was))\b/i.test(
      lower
    );
  if (switchedEquipmentOrUnit && (loadClaim || equipClaim)) {
    const prior = loadClaim ? `earlier load "${loadClaim.excerpt}"` : `earlier equipment "${equipClaim!.excerpt}"`;
    flags.push(
      `Earlier in this thread you referenced ${prior}, and the athlete just changed equipment, units, or corrected a detail — explicitly flag and double-check that earlier figure before they act on it.`
    );
  }

  // Acute pain/fatigue/poor sleep reported after earlier positive/normal recovery claim
  const reportsFatigueOrPain =
    /\b(slept\s+(?:terribly|horribly|badly|[1-5]\s*h)|exhausted|wrecked|super\s+sore|feels?\s+(?:tight|tweaky|pain|sore|beat\s+up))\b/i.test(
      lower
    );
  if (reportsFatigueOrPain && recClaim && /primed|normal|recovered/i.test(recClaim.excerpt)) {
    flags.push(
      `Earlier in this thread you noted "${recClaim.excerpt}", and the athlete now reports fatigue or tightness — flag and re-evaluate that earlier readiness assumption before they load up.`
    );
  }

  return flags.length > 0 ? flags.join(' ') : null;
}

/**
 * Resolves Mid-Workout (gym floor) vs Planning & Review (off-floor) mode from the active screen
 * and workout completion state (Section 3 & Section 5.3).
 */
export function resolveCoachMode(
  place?: CoachPlace,
  activeWorkout?: WorkoutSession
): CoachInteractionMode {
  if (place?.tab === 'program' || place?.tab === 'analytics') {
    return 'planning_review';
  }
  if (activeWorkout?.completed) {
    return 'planning_review';
  }
  return 'mid_workout';
}

/**
 * Determines which slice of the Knowledge Graph should be prioritized for the current turn
 * (Section 5.2: Scoped Context Injection).
 */
export function resolveContextSliceScope(
  place?: CoachPlace,
  activeWorkout?: WorkoutSession
): CoachContextSliceScope {
  if (place?.exerciseId) return 'exercise_focus';
  if (place?.tab === 'program') return 'program_planning';
  if (place?.tab === 'analytics') return 'progress_review';
  if (activeWorkout?.completed) return 'progress_review';
  return 'mid_workout';
}

const STYLE_TAGS = {
  brief: 'Keep replies ultra-brief (1-2 short sentences, numbers and cues first).',
  detailed: 'Give fuller step-by-step explanations and progression rationale.',
  noBullets: 'Write in plain short paragraphs without bullet lists.',
  useBullets: 'Use concise, scannable bullet points for multi-part answers.',
  noName: 'Do not address the athlete by name.',
} as const;

/**
 * Detects user-directed style adjustments within a thread (Section 4: User-Directed Style Changes).
 * Returns `{ overrides, reset }` so contradictory requests replace prior overrides cleanly.
 */
export function detectStyleOverrideChanges(userMessage: string): {
  add: string[];
  remove: string[];
  resetAll: boolean;
} {
  const lower = userMessage.toLowerCase();
  if (/\b(reset|default|normal)\s+(?:your\s+)?(?:response\s+)?style\b|\bgo\s+back\s+to\s+normal\b/i.test(lower)) {
    return { add: [], remove: [], resetAll: true };
  }

  const add: string[] = [];
  const remove: string[] = [];

  if (
    /\b(be\s+(?:more\s+)?(?:brief|concise|short)|keep\s+(?:it|answers?|replies?|responses?)\s+(?:super\s+)?(?:short|brief|concise)|shorter\s+(?:answers?|replies?|responses?)|less\s+detail|tl;?dr)\b/i.test(
      lower
    )
  ) {
    add.push(STYLE_TAGS.brief);
    remove.push(STYLE_TAGS.detailed);
  } else if (
    /\b(more\s+detail|be\s+more\s+detailed|detailed\s+(?:answers?|explanations?|breakdown)|explain\s+(?:more\s+)?thoroughly|in\s+(?:more\s+)?depth|longer\s+(?:answers?|explanations?))\b/i.test(
      lower
    )
  ) {
    add.push(STYLE_TAGS.detailed);
    remove.push(STYLE_TAGS.brief);
  }

  if (/\b(no\s+bullets?|don'?t\s+use\s+bullets?|stop\s+using\s+bullets?|without\s+bullet|plain\s+(?:prose|paragraphs?|text))\b/i.test(lower)) {
    add.push(STYLE_TAGS.noBullets);
    remove.push(STYLE_TAGS.useBullets);
  } else if (/\b(use\s+bullets?|bullet\s+points?|bulleted\s+list|as\s+bullets?)\b/i.test(lower)) {
    add.push(STYLE_TAGS.useBullets);
    remove.push(STYLE_TAGS.noBullets);
  }

  if (/\b(don'?t|do\s+not|stop)\s+(?:use|using|say|saying|call(?:ing)?\s+me\s+by)\s+my\s+name\b/i.test(lower)) {
    add.push(STYLE_TAGS.noName);
  }

  return { add, remove, resetAll: false };
}

/**
 * Extracts temporary, thread-only constraints shared by the athlete (Section 1 & Section 4)
 * so Treise remembers them across turns in the current chat without writing them to permanent memory.
 */
export function extractEphemeralConstraints(userMessage: string): string[] {
  const found: string[] = [];
  const trimmed = userMessage.trim();
  if (!trimmed) return found;

  // Time cap today (e.g. "only have 30 minutes today", "got 25 mins right now", "short on time today")
  const timeMatch = /\b(?:only\s+have|have\s+only|got\s+(?:about\s+)?|limited\s+to)\s+(\d{1,3})\s*(?:min(?:ute)?s?|m)\b/i.exec(
    trimmed
  );
  if (timeMatch) {
    found.push(`Only ${timeMatch[1]} minutes available this session`);
  } else if (/\b(short\s+on\s+time|in\s+a\s+rush|quick\s+session)\s*(?:today|right\s+now)?\b/i.test(trimmed)) {
    found.push('Short on time for this session');
  }

  // Acute tightness / soreness / discomfort mentioned for today
  const tightMatch = /\b((?:left|right|both|my)?\s*(?:shoulder|knee|elbow|wrist|hip|lower\s+back|back|hamstring|quad|pec|chest|neck|ankle|groin)s?\s+(?:feels?|is|are|been)\s+(?:a\s+bit\s+|kind\s+of\s+|pretty\s+)?(?:tight|sore|stiff|fatigued|tender|tweaky|sore\s+today))\b/i.exec(
    trimmed
  );
  if (tightMatch) {
    const clean = tightMatch[1].replace(/\s+/g, ' ').trim();
    found.push(clean.charAt(0).toUpperCase() + clean.slice(1));
  }

  // Temporary equipment/gym constraint today (e.g. "rack is taken", "dumbbells only today", "gym is packed")
  const tempKitMatch = /\b((?:bench|rack|squat\s+rack|cable(?:s)?|smith\s+machine|machine)\s+(?:is|are)\s+(?:taken|busy|occupied|broken)|(?:dumbbells?|bodyweight)\s+only\s+today|gym\s+is\s+(?:packed|busy|crowded))\b/i.exec(
    trimmed
  );
  if (tempKitMatch) {
    const clean = tempKitMatch[1].replace(/\s+/g, ' ').trim();
    found.push(clean.charAt(0).toUpperCase() + clean.slice(1));
  }

  return found;
}

/**
 * Returns true ONLY when the athlete explicitly asks to persist a fact or style preference across
 * future threads (Section 4 & Section 5.4: Explicit Persistence Boundary).
 */
export function isExplicitPermanentMemoryRequest(userMessage: string): boolean {
  return /\b(remember\s+(?:that|this|for\s+future|going\s+forward|permanently)|save\s+(?:this|that)\s+(?:to\s+(?:my\s+)?memory|as\s+(?:a\s+)?(?:permanent\s+)?preference|permanently)|always\s+(?:remember|keep\s+in\s+mind|respond|reply|use)|permanently\s+(?:save|remember|set))\b/i.test(
    userMessage
  );
}

/** Checks whether an assistant reply mentions the athlete's first name as a standalone word. */
export function replyMentionsFirstName(reply: string, athleteFirstName?: string): boolean {
  const first = (athleteFirstName || '').trim();
  if (!first || first.toLowerCase() === 'athlete' || first.length < 2) return false;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(reply);
}

/**
 * Enforces Section 4 ("Name Use"):
 * - Never repeat the athlete's name at the start of a conversation (the app greeting already welcomes them).
 * - Use the athlete's name at most once per conversation.
 * - Never use the name when the athlete asked Treise not to.
 */
export function enforceNameUsePolicy(
  reply: string,
  athleteFirstName?: string,
  threadMemory?: CoachThreadMemory
): string {
  const first = (athleteFirstName || '').trim();
  if (!first || first.toLowerCase() === 'athlete' || first.length < 2) return reply;

  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forbidAllNameUse =
    Boolean(threadMemory?.nameUsedInThread) ||
    Boolean(threadMemory?.styleOverrides.includes(STYLE_TAGS.noName));
  const isFirstTurn = !threadMemory || threadMemory.turnCount === 0;

  let out = reply;

  // Strip scripted leading greetings with the name on turn 1 (or whenever name is disallowed)
  if (isFirstTurn || forbidAllNameUse) {
    const leadingGreetingRe = new RegExp(
      `^(?:(?:hi|hey|hello|welcome\\s+back|good\\s+(?:morning|afternoon|evening)),?\\s+)?${escaped}[,!.:—–-]+\\s*`,
      'i'
    );
    if (leadingGreetingRe.test(out)) {
      out = out.replace(leadingGreetingRe, '');
      if (out.length > 0) {
        out = out.charAt(0).toUpperCase() + out.slice(1);
      }
    }
  }

  // If the name was already used in an earlier turn (or explicitly disallowed), also strip trailing ", Name." vocatives
  if (forbidAllNameUse) {
    const trailingVocativeRe = new RegExp(`,\\s*${escaped}(?=[.!?](?:\\s|$))`, 'gi');
    out = out.replace(trailingVocativeRe, '');
  }

  return out;
}

/**
 * Updates ephemeral thread memory after a user turn (and optional assistant reply).
 * Never mutates persistent athlete profile state.
 */
export function updateThreadMemoryFromTurn(
  prev: CoachThreadMemory | undefined,
  userMessage: string,
  assistantReply?: string,
  athleteFirstName?: string,
  pendingActionSummary?: string
): CoachThreadMemory {
  const base = prev ?? createEmptyThreadMemory();
  const styleDiff = detectStyleOverrideChanges(userMessage);
  let nextStyles = styleDiff.resetAll ? [] : [...base.styleOverrides];
  if (styleDiff.remove.length > 0) {
    nextStyles = nextStyles.filter((s) => !styleDiff.remove.includes(s));
  }
  for (const s of styleDiff.add) {
    if (!nextStyles.includes(s)) nextStyles.push(s);
  }

  const newConstraints = extractEphemeralConstraints(userMessage);
  const nextConstraints = [...base.ephemeralConstraints];
  for (const c of newConstraints) {
    if (!nextConstraints.some((existing) => existing.toLowerCase() === c.toLowerCase())) {
      nextConstraints.push(c);
    }
  }

  const usedNameNow =
    Boolean(assistantReply) && replyMentionsFirstName(assistantReply!, athleteFirstName);
  const nextTurnCount = base.turnCount + (assistantReply !== undefined ? 1 : 0);
  const newClaims = assistantReply ? extractAssistantClaims(assistantReply, nextTurnCount) : [];
  const nextClaims = [...(base.priorClaims ?? []), ...newClaims].slice(-6);
  const detectedTopic = classifyConversationTopic(userMessage);
  const nextTopic = detectedTopic === 'general' ? base.activeTopic : detectedTopic;

  return {
    styleOverrides: nextStyles.slice(-4),
    ephemeralConstraints: nextConstraints.slice(-4),
    priorClaims: nextClaims,
    activeTopic: nextTopic,
    pendingActionSummary:
      pendingActionSummary !== undefined ? pendingActionSummary : base.pendingActionSummary,
    nameUsedInThread: base.nameUsedInThread || usedNameNow,
    turnCount: nextTurnCount,
  };
}

/**
 * Compact, high-signal system-prompt contract implementing Sections 1–5 of
 * Treise AI Personalisation & Memory Guidelines, Multi-turn Behaviour, and Conversational Moments.
 */
export function buildPersonalizationContractPrompt(params: {
  mode: CoachInteractionMode;
  scope: CoachContextSliceScope;
  threadMemory?: CoachThreadMemory;
  userMessage?: string;
}): string {
  const { mode, scope, threadMemory, userMessage = '' } = params;
  const modeRule =
    mode === 'mid_workout'
      ? 'MODE: Mid-Workout (gym floor) — ultra-brief, scannable, numbers and cues first (25-55 words max unless asked for detail). Keep utilitarian flows (swaps, rest intervals, set logs) clean without personal history.'
      : 'MODE: Planning & Review (off-floor) — structured summaries, clear progression rationale, and concrete next steps (45-90 words unless asked for detail).';

  const nameRule =
    threadMemory?.nameUsedInThread || threadMemory?.styleOverrides.includes(STYLE_TAGS.noName)
      ? 'Name use: do not use the athlete\'s name again in this thread.'
      : 'Name use: never open a chat with their name (the app greeting already welcomed them); use their name at most once per conversation, only if a real coach would.';

  const parts: string[] = [
    modeRule,
    `Context scope: ${scope}. Only mention athlete data when it improves the answer or saves effort; never surface unexpected background details or hidden system fields, and never infer unstated medical conditions.`,
    'Transparent assumptions: when inferring intent from context, state the assumption naturally and offer an easy correction.',
    `Multi-turn proactive behavior: DO ${MULTI_TURN_BEHAVIOR_RULES.proactiveDo.join(' ')} DON'T ${MULTI_TURN_BEHAVIOR_RULES.proactiveDont.join(' ')}`,
    `Confidence across a thread: ${MULTI_TURN_BEHAVIOR_RULES.confidenceAcrossThread}`,
    `Conversational moments: ${CONVERSATIONAL_MOMENTS_RULES.topicChanges} ${CONVERSATIONAL_MOMENTS_RULES.endingsAndSignOffs} ${CONVERSATIONAL_MOMENTS_RULES.escalationHandoffs} ${CONVERSATIONAL_MOMENTS_RULES.smallTalk}`,
    nameRule,
    'Memory boundary: remember choices, corrections, style tweaks, and temporary constraints within this thread without re-asking, but NEVER carry ephemeral thread details into permanent memory unless the athlete explicitly asks to save them via a structured tool call.',
  ];

  const topicShift = detectTopicShift(threadMemory, userMessage);
  if (topicShift.promptNote) {
    parts.push(topicShift.promptNote);
  }

  const confidenceConflict = detectThreadConfidenceConflict(threadMemory, userMessage);
  if (confidenceConflict) {
    parts.push(`Thread confidence re-check: ${confidenceConflict}`);
  }

  if (threadMemory?.styleOverrides.length) {
    parts.push(`Active thread style overrides (maintain for this thread): ${threadMemory.styleOverrides.join(' ')}`);
  }
  if (threadMemory?.ephemeralConstraints.length) {
    parts.push(
      `Temporary constraints in this thread only (do not save permanently unless asked): ${threadMemory.ephemeralConstraints.join('; ')}.`
    );
  }

  return parts.join(' ');
}

export type AiSummarySurface =
  | 'exercise_brief'
  | 'program_identity'
  | 'workout_summary'
  | 'goals_summary'
  | 'composition_insight';

/**
 * Compact, token-economical Treise AI guidelines shared across every non-chat summary surface
 * (exercise briefs, program identity, workout finish, goals carousel, and body composition).
 * Enforces the same Voice/Tone/Persona, Personalisation & Context discipline, and Conversational
 * Moments rules used in chat without inflating prompt tokens.
 */
export function buildSummaryVoiceGuidelines(surface: AiSummarySurface): string {
  const surfaceContext: Record<AiSummarySurface, string> = {
    exercise_brief:
      'Surface: gym-floor exercise card — ultra-scannable, lead with the metric and acute stimulus; for swapped lifts, explain plainly what it replaces and how it keeps target-muscle growth moving while protecting original progression (never "standing in for" or "covering").',
    program_identity: 'Surface: plan overview — calm, grounded identity reinforcement tied to concrete logged progress.',
    workout_summary: 'Surface: post-workout recap — earned, understated milestone tone with zero hype.',
    goals_summary: 'Surface: Progress goal card — concise standing plus one concrete next step.',
    composition_insight: 'Surface: body composition card — neutral, non-judgmental interpretation plus one clear focus.',
  };
  return (
    'Treise voice & context rules: warm, direct thought partner (never pushy or third-person); lead with what matters most; ' +
    'use natural contractions and plain workout/exercise language; use athlete data silently to be sharper—never say "I noticed", "based on your data", or "according to your profile"; ' +
    'never open with greetings, filler ("Great!", "Awesome!"), or the athlete\'s name; never end with sign-offs, exclamation marks, or questions. ' +
    surfaceContext[surface]
  );
}

/**
 * Applies Treise's shared voice hygiene (strips markdown, prefix labels, outer quotes,
 * filler openers, and reflexive sign-offs) to any non-chat AI summary before validation.
 */
export function normalizeSummaryVoice(
  raw: string,
  opts?: { preserveNewlines?: boolean; prefixPattern?: RegExp }
): string {
  const prefixRe = opts?.prefixPattern ?? /^\s*(?:summary|message|note|insight)\s*:\s*/i;
  let cleaned = raw
    .replace(/[*#_`]/g, '')
    .replace(prefixRe, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  cleaned = stripFillerOpeners(cleaned);
  cleaned = stripReflexiveSignOffs(cleaned);
  if (opts?.preserveNewlines) {
    return cleaned
      .split(/\n+/)
      .map((line) => stripFillerOpeners(line.replace(/\s+/g, ' ').trim()))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Deterministic cross-surface voice & personalisation gate applied to all 5 non-chat AI summary
 * surfaces so summaries obey the exact same guidelines as chat replies.
 * Returns a plain-English rejection reason when violated, or null when clean.
 */
export function checkSummaryVoiceGuidelines(text: string): string | null {
  if (/^(?:hi|hello|hey|welcome\s+back)\b/i.test(text.trim())) {
    return 'it opened with a greeting instead of leading with what matters most';
  }
  if (
    /\b(?:i\s+noticed|i\s+see\s+(?:that\s+)?you|according\s+to\s+your\s+(?:profile|data|records|log)|based\s+on\s+your\s+(?:data|history|profile|records)|looking\s+at\s+your\s+(?:data|profile|history))\b/i.test(
      text
    )
  ) {
    return 'it sounded like surveillance ("I noticed" / "based on your data"); state the training insight directly';
  }
  if (
    /\bTreise\s+(?:thinks|recommends|suggests|believes|wants|says|tailors|lets|tracks|adjusts)\b/i.test(text) ||
    /\blets\s+Treise\b/i.test(text)
  ) {
    return 'it referred to Treise in the third person';
  }
  if (/\?\s*$/.test(text.trim())) {
    return 'it ended with an unsolicited question instead of a crisp statement';
  }
  if (/!/.test(text)) {
    return 'it used an exclamation mark; keep the voice calm and grounded';
  }
  if (/\b(?:please\s+wait|processing\s+your\s+request|let\s+me\s+know\s+if\s+you\s+need\s+anything)\b/i.test(text)) {
    return 'it used generic filler or sign-off text';
  }
  return null;
}
