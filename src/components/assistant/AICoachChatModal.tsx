import { CoachPlace, buildCoachOpening, describeCoachPlace } from '../../services/coachContext';
import type { ActivityLog } from '../../engine/activeDays';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  AssistantChatMessage,
  BiometricLog,
  CoachPendingConfirmation,
  CoachSuggestedAction,
  CoachUndoSnapshot,
  ExerciseDefinition,
  ReadinessState,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import {
  confirmAssistantPendingAction,
  processAssistantMessage,
} from '../../services/aiAssistantService';
import {
  CoachThreadMemory,
  createEmptyThreadMemory,
} from '../../services/coachPersonalization';
import { formatStateDiffText } from '../../services/coachTools';
import { resetFlashLiteConversation } from '../../services/geminiFlashLite';
import {
  prepareOnDeviceModel,
  resetOnDeviceConversation,
  warmUpOnDeviceModel,
} from '../../services/onDeviceModel';

// Where Chrome doesn't expose Gemini Nano (e.g. Chrome on Android), the coach uses the
// stateless Gemini 2.5 Flash-Lite proxy (/api/coach/generate) with zero download required.
import '../../services/deviceModels';

import { triggerHaptic } from '../../utils/haptics';
import {
  Maximize2,
  Minimize2,
  X,
  Send,
  CheckCircle2,
  Dumbbell,
  ChevronRight,
  ChevronDown,
  FlaskConical,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  SquarePen,
} from 'lucide-react';

interface AICoachChatModalProps {
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  weeklyVolume?: Record<string, number>;
  /** Logged active days, so the coach's plan position and streak match the app. */
  activities?: ActivityLog[];
  /** Where the coach was opened, so its first line and suggestions fit what is on screen. */
  place: CoachPlace;
  onClose: () => void;
  onApplyAction: (
    updatedProfile?: Partial<UserProfile>,
    updatedWorkout?: WorkoutSession,
    updatedBiometrics?: BiometricLog[],
    updatedActivities?: ActivityLog[]
  ) => void;
  onUndoAction?: (snapshot: CoachUndoSnapshot) => void;
  onNavigateTab?: (
    tab: 'train' | 'program' | 'analytics',
    detail?: AssistantChatMessage['navigateDetail']
  ) => void;
  onViewAllEquipment?: () => void;
  /** Optional lifted session messages so closing or deep-linking preserves thread & Undo. */
  persistedMessages?: AssistantChatMessage[];
  onMessagesChange?: React.Dispatch<React.SetStateAction<AssistantChatMessage[]>>;
  persistedRevertedIds?: Record<string, boolean>;
  onRevertedIdsChange?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onResetConversation?: () => void;
  /** Render inline inside a showcase container instead of a fixed viewport overlay. */
  embedded?: boolean;
  /** Explicit height when `embedded` is true. */
  embeddedHeight?: number | string;
  /** Pre-populated messages for static / Design System previews. */
  initialMessages?: AssistantChatMessage[];
  /** Show the typing/processing status indicator immediately. */
  initialPendingStatus?: string | null;
  /** Show the floating "New message" scroll pill immediately. */
  initialShowNewMsgPill?: boolean;
  /** Seeded composer value for previewing active typing state. */
  initialInputValue?: string;
  /** Optional contextual prompt to submit once automatically on launch (HITL intervention flow). */
  initialPrompt?: string;
}

const WORD_REVEAL_INTERVAL_MS = 16;
const COMPOSER_MAX_HEIGHT_PX = 96;

function liveClockTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Renders **bold** segments as <strong> (React text nodes only, never raw HTML). */
function renderBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

/** Infers a compact native status pill while waiting on a tool action or Knowledge Graph lookup. */
function inferPendingStatus(message: string): string {
  const lower = message.toLowerCase();
  if (
    /\b(reset|restart|re-start|start\s+over)\b/.test(lower) &&
    /\b(program|plan|cycle|day\s*(?:\d+|one)|workout\s*\d+|week\s*\d+|beginning|scratch|over)\b/.test(lower)
  ) {
    return 'Resetting program…';
  }
  if (/\b(switch|change)\b.*\b(program|phase\s*1|muscle|starter|day|upper|lower|full\s*body)\b/.test(lower)) {
    return 'Switching program…';
  }
  if (
    /\b(rebalance|imbalance|asymmetry|symmetr|pull.*push|push.*pull|all sessions|whole program|every session|program-wide|permanently)\b/.test(
      lower
    )
  ) {
    return 'Reviewing program…';
  }
  if (/\b(log|record|save)\b.*\b(set|reps|kg|lb|weight|waist|bicep|thigh|calf|neck|chest|hip|body\s*fat|steps|min)\b/.test(lower)) {
    return 'Logging entry…';
  }
  if (/\b(forget|remember|memory|memories)\b/.test(lower)) {
    return 'Updating memory…';
  }
  if (/\b(units?|kg|lb|age|gender|hide|show)\b/.test(lower) && /\b(switch|change|set|use|hide|show)\b/.test(lower)) {
    return 'Updating settings…';
  }
  if (/\b(goal|target)\b/.test(lower) && /\b(set|change|update|make|add|remove)\b/.test(lower)) {
    return 'Updating goals…';
  }
  if (/\b(rest\s*day|can['’]?t\s*train|skip\s*today|shift|train\s+anyway|unlock)\b/.test(lower)) {
    return 'Updating schedule…';
  }
  if (/\b(bought|got|sold|remove|equipment|travel|away|home|gym|bodyweight|move|reorder|note|swap|replace)\b/.test(lower)) {
    return 'Updating workout…';
  }
  if (/\b(recovery|whoop|hrv|strain|sleep|joint|shoulder|knee|back|elbow|strength|level|steps|composition|tonnage)\b/.test(lower)) {
    return 'Reviewing your data…';
  }
  return 'Checking your plan…';
}

export const AICoachChatModal: React.FC<AICoachChatModalProps> = ({
  profile,
  activeWorkout,
  workouts,
  biometrics,
  exerciseCatalog,
  bodyweightEmaKg,
  readinessState,
  weeklyVolume,
  activities,
  place,
  onClose,
  onApplyAction,
  onUndoAction,
  onNavigateTab,
  onViewAllEquipment,
  persistedMessages,
  onMessagesChange,
  persistedRevertedIds,
  onRevertedIdsChange,
  onResetConversation,
  embedded = false,
  embeddedHeight,
  initialMessages,
  initialPendingStatus = null,
  initialShowNewMsgPill = false,
  initialInputValue = '',
  initialPrompt,
}) => {
  // The line and suggestions for the screen the coach was opened on, memoized so typing never recomputes KG/history.
  const opening = useMemo(
    () =>
      buildCoachOpening({
        place,
        profile,
        activeWorkout,
        workouts,
        activities,
        biometrics,
        exerciseCatalog,
        readinessState,
        bodyweightEmaKg,
      }),
    [place, profile, activeWorkout, workouts, activities, biometrics, exerciseCatalog, readinessState, bodyweightEmaKg]
  );

  const placeMeta = useMemo(
    () => describeCoachPlace(place, activeWorkout, exerciseCatalog),
    [place, activeWorkout, exerciseCatalog]
  );

  const [inputMessage, setInputMessage] = useState(initialInputValue);
  const [isProcessing, setIsProcessing] = useState(Boolean(initialPendingStatus));
  const [pendingStatus, setPendingStatus] = useState<string>(initialPendingStatus || 'Thinking…');
  const [localRevertedIds, setLocalRevertedIds] = useState<Record<string, boolean>>({});
  const [failedPromptsByMsgId, setFailedPromptsByMsgId] = useState<Record<string, string>>({});
  const [localMessages, setLocalMessages] = useState<AssistantChatMessage[]>(
    () =>
      initialMessages ?? [
        {
          id: 'msg-welcome',
          sender: 'assistant',
          text: opening.line,
          timestamp: liveClockTime(),
        },
      ]
  );

  const isControlledMessages = Boolean(!embedded && !initialMessages && persistedMessages && onMessagesChange);
  const messages = isControlledMessages
    ? persistedMessages!.length > 0
      ? persistedMessages!
      : [
          {
            id: 'msg-welcome',
            sender: 'assistant' as const,
            text: opening.line,
            timestamp: liveClockTime(),
          },
        ]
    : localMessages;
  const setMessages: React.Dispatch<React.SetStateAction<AssistantChatMessage[]>> = isControlledMessages
    ? onMessagesChange!
    : setLocalMessages;

  const revertedMessageIds =
    !embedded && persistedRevertedIds && onRevertedIdsChange ? persistedRevertedIds : localRevertedIds;
  const setRevertedMessageIds =
    !embedded && persistedRevertedIds && onRevertedIdsChange ? onRevertedIdsChange : setLocalRevertedIds;

  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<{
    messageId: string;
    fullText: string;
    visibleText: string;
  } | null>(null);
  const [showNewMsgPill, setShowNewMsgPill] = useState(Boolean(initialShowNewMsgPill));

  /** A fly-up sheet for quick questions; expanded, it is a full-screen conversation. */
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [viewportMetrics, setViewportMetrics] = useState<{
    height: number | null;
    keyboardOpen: boolean;
  }>({ height: null, keyboardOpen: false });

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const revealRafRef = useRef<number | null>(null);
  const autoScrollLockedRef = useRef(true);
  const touchStartYRef = useRef<number | null>(null);
  const latestStreamingRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const initialPromptHandledRef = useRef<string | undefined>(undefined);
  /** Thread-local ephemeral memory (style overrides, temporary constraints, name-use cap). Wiped on New Chat. */
  const threadMemoryRef = useRef<CoachThreadMemory>(createEmptyThreadMemory());

  const stopReveal = useCallback(() => {
    if (revealRafRef.current !== null) {
      cancelAnimationFrame(revealRafRef.current);
      revealRafRef.current = null;
    }
    setRevealing(null);
  }, []);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (!threadRef.current) return;
    requestAnimationFrame(() => {
      if (!autoScrollLockedRef.current) return;
      const el = threadRef.current;
      if (!el) return;
      if (behavior === 'smooth' && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    inputRef.current?.blur();
    stopReveal();
    if (embedded || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 240);
  }, [closing, embedded, onClose, stopReveal]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (revealRafRef.current !== null) cancelAnimationFrame(revealRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (embedded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [embedded, requestClose]);

  // Track visualViewport height so opening Android/iOS soft keyboards resizes cleanly inside 100dvh.
  useEffect(() => {
    if (embedded || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const baselineHeight = Math.max(window.innerHeight, vv.height);
    let wasKeyboardOpen = false;

    const syncViewport = () => {
      const currentHeight = Math.round(vv.height);
      const keyboardOpen = baselineHeight - currentHeight > 120;
      setViewportMetrics({ height: currentHeight, keyboardOpen });
      if (keyboardOpen && !wasKeyboardOpen && autoScrollLockedRef.current) {
        scrollThreadToBottom('smooth');
      }
      wasKeyboardOpen = keyboardOpen;
    };

    syncViewport();
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    return () => {
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
    };
  }, [embedded, scrollThreadToBottom]);

  // Warm up on-device model when opened; keep welcome headline synced to current screen before conversation starts.
  useEffect(() => {
    if (embedded) return;
    warmUpOnDeviceModel().catch(() => undefined);
    // Only reset on-device conversation when unmounted WITHOUT lifted persistence.
    return () => {
      if (!isControlledMessages) {
        resetOnDeviceConversation();
      }
    };
  }, [embedded, isControlledMessages]);

  useEffect(() => {
    if (embedded || initialMessages) return;
    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ id: 'msg-welcome', sender: 'assistant', text: opening.line, timestamp: liveClockTime() }];
      }
      if (prev.length === 1 && prev[0].id === 'msg-welcome' && prev[0].text !== opening.line) {
        return [{ ...prev[0], text: opening.line, timestamp: liveClockTime() }];
      }
      return prev;
    });
  }, [embedded, initialMessages, opening.line, setMessages]);

  // Auto-grow multiline composer up to 4 lines cleanly.
  const resizeComposer = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
    el.style.height = `${Math.max(44, nextHeight)}px`;
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [inputMessage, resizeComposer]);

  // Maintain auto-scroll inside thread when locked; offer "New message" pill if user scrolled up mid-stream.
  const prevLenRef = useRef(messages.length);
  useEffect(() => {
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (embedded && !grew) return;
    if (autoScrollLockedRef.current) {
      scrollThreadToBottom('auto');
      setShowNewMsgPill(false);
    } else if (isProcessing || revealing !== null) {
      setShowNewMsgPill(true);
    }
  }, [embedded, messages.length, streamingText, revealing?.visibleText, isProcessing, revealing, scrollThreadToBottom]);

  // Progressive 60fps word-by-word reveal for arriving assistant replies.
  const startProgressiveReveal = useCallback(
    (messageId: string, fullText: string, alreadyShownPrefix: string) => {
      if (revealRafRef.current !== null) {
        cancelAnimationFrame(revealRafRef.current);
        revealRafRef.current = null;
      }

      const prefersReducedMotion =
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion || !fullText) {
        setRevealing(null);
        return;
      }

      const tokens = fullText.match(/\S+\s*/g) ?? [fullText];
      if (tokens.length <= 2) {
        setRevealing(null);
        return;
      }

      let index = 0;
      if (alreadyShownPrefix && fullText.startsWith(alreadyShownPrefix)) {
        let len = 0;
        while (index < tokens.length && len + tokens[index].length <= alreadyShownPrefix.length) {
          len += tokens[index].length;
          index += 1;
        }
      }

      if (index === 0) {
        index = 1;
      }

      if (index >= tokens.length) {
        setRevealing(null);
        return;
      }

      const initialVisible = tokens.slice(0, index).join('');
      setRevealing({ messageId, fullText, visibleText: initialVisible });

      let lastTick = performance.now();
      const step = (now: number) => {
        if (!isMountedRef.current) return;
        const elapsed = now - lastTick;
        if (elapsed + 1 >= WORD_REVEAL_INTERVAL_MS) {
          const wordsToAdvance = Math.max(1, Math.min(4, Math.floor((elapsed + 1) / WORD_REVEAL_INTERVAL_MS)));
          index = Math.min(tokens.length, index + wordsToAdvance);
          lastTick = now - (elapsed % WORD_REVEAL_INTERVAL_MS);

          if (index >= tokens.length) {
            revealRafRef.current = null;
            setRevealing(null);
            return;
          }
          setRevealing({
            messageId,
            fullText,
            visibleText: tokens.slice(0, index).join(''),
          });
        }
        revealRafRef.current = requestAnimationFrame(step);
      };

      revealRafRef.current = requestAnimationFrame(step);
    },
    []
  );

  const handleThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= 28;
    autoScrollLockedRef.current = atBottom;
    if (atBottom) {
      setShowNewMsgPill(false);
    } else if (isProcessing || revealing !== null) {
      setShowNewMsgPill(true);
    }
  };

  const releaseAutoScrollOnUserGesture = () => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 12) {
      autoScrollLockedRef.current = false;
    }
  };

  const activePendingMessage = useMemo(() => {
    const last = messages[messages.length - 1];
    if (last && last.sender === 'assistant' && last.pendingConfirmation?.status === 'pending') {
      return last;
    }
    return null;
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isProcessing) return;

    // Natural-language confirmation / cancellation when a HITL confirmation card is active.
    if (activePendingMessage?.pendingConfirmation) {
      const lower = text.toLowerCase().replace(/[!.?]+$/, '').trim();
      if (/^(yes|yeah|yep|yup|confirm|apply|apply it|do it|go ahead|sounds good|ok|okay|sure|proceed)$/.test(lower)) {
        setInputMessage('');
        await handleConfirmPendingAction(activePendingMessage.id, activePendingMessage.pendingConfirmation);
        return;
      }
      if (/^(no|nope|nah|cancel|never mind|nevermind|keep|keep it|keep current|skip|don't|dont|stop)$/.test(lower)) {
        setInputMessage('');
        handleCancelPendingAction(activePendingMessage.id, activePendingMessage.pendingConfirmation.tool_name);
        return;
      }
    }

    stopReveal();
    triggerHaptic('light');

    const userMsg: AssistantChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: liveClockTime(),
    };

    autoScrollLockedRef.current = true;
    setShowNewMsgPill(false);
    setPendingStatus(inferPendingStatus(text));
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessing(true);
    latestStreamingRef.current = null;
    setStreamingText(null);
    scrollThreadToBottom('smooth');

    // On Pixel phones, quietly get the on-device model ready for future answers.
    prepareOnDeviceModel().catch(() => undefined);

    let failsafeTimer: number | null = null;
    try {
      const result = await Promise.race([
        processAssistantMessage({
          userMessage: text,
          profile,
          activeWorkout,
          workouts,
          biometrics,
          exerciseCatalog,
          bodyweightEmaKg,
          readinessState,
          weeklyVolume,
          activities,
          place,
          routeName: place.tab,
          threadMemory: {
            ...threadMemoryRef.current,
            pendingActionSummary: activePendingMessage?.pendingConfirmation?.summary || undefined,
          },
          onPartial: (textSoFar) => {
            if (!isMountedRef.current) return;
            latestStreamingRef.current = textSoFar || null;
            setStreamingText(textSoFar || null);
          },
        }),
        new Promise<never>((_, reject) => {
          failsafeTimer = window.setTimeout(() => reject(new Error('Coach response timed out')), 26_000);
        }),
      ]);

      if (!isMountedRef.current) return;
      if (result.updatedThreadMemory) {
        threadMemoryRef.current = result.updatedThreadMemory;
      }
      const streamedPrefix = latestStreamingRef.current ?? '';
      latestStreamingRef.current = null;
      setStreamingText(null);
      setIsProcessing(false);
      setMessages((prev) => [...prev, result.message]);

      if (
        result.updatedProfile ||
        result.updatedWorkout ||
        result.updatedBiometrics ||
        result.updatedActivities
      ) {
        triggerHaptic('success');
        onApplyAction(
          result.updatedProfile,
          result.updatedWorkout,
          result.updatedBiometrics,
          result.updatedActivities
        );
      }

      startProgressiveReveal(result.message.id, result.message.text, streamedPrefix);
    } catch (err) {
      console.error('Failed to process message with AI Coach:', err);
      if (!isMountedRef.current) return;
      latestStreamingRef.current = null;
      setStreamingText(null);
      setIsProcessing(false);
      const errId = `err-${Date.now()}`;
      setFailedPromptsByMsgId((prev) => ({ ...prev, [errId]: text }));
      const errorMsg: AssistantChatMessage = {
        id: errId,
        sender: 'assistant',
        text: "I ran into an error answering that and couldn't finish the reply. Tap Retry, rephrase it, or pick a quick check below.",
        timestamp: liveClockTime(),
        mutationStatus: 'error',
        suggestedActions: [
          { label: 'Today workout brief', prompt: 'What am I lifting today?' },
          { label: 'How am I doing?', prompt: 'How am I doing?' },
        ],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (failsafeTimer !== null) window.clearTimeout(failsafeTimer);
    }
  };

  const handleConfirmPendingAction = async (
    messageId: string,
    pending: CoachPendingConfirmation
  ) => {
    if (isProcessing) return;
    triggerHaptic('medium');
    setIsProcessing(true);
    setPendingStatus('Applying confirmed change…');
    try {
      const result = await confirmAssistantPendingAction(pending, {
        profile,
        activeWorkout,
        workouts,
        biometrics,
        exerciseCatalog,
        bodyweightEmaKg,
        readinessState,
        weeklyVolume,
        activities,
        place,
        routeName: place.tab,
      });
      if (!isMountedRef.current) return;
      setIsProcessing(false);
      const succeeded = result.message.mutationStatus === 'success';
      setMessages((prev) => [
        ...prev.map((m) =>
          m.id === messageId && m.pendingConfirmation && succeeded
            ? { ...m, pendingConfirmation: { ...m.pendingConfirmation, status: 'confirmed' as const } }
            : m
        ),
        result.message,
      ]);
      if (
        result.updatedProfile ||
        result.updatedWorkout ||
        result.updatedBiometrics ||
        result.updatedActivities
      ) {
        triggerHaptic('success');
        onApplyAction(
          result.updatedProfile,
          result.updatedWorkout,
          result.updatedBiometrics,
          result.updatedActivities
        );
      }
      startProgressiveReveal(result.message.id, result.message.text, '');
    } catch (err) {
      console.error('Failed to confirm pending coach action:', err);
      if (!isMountedRef.current) return;
      setIsProcessing(false);
      // Keep the confirmation card pending so the athlete can tap Confirm again.
      setMessages((prev) => [
        ...prev,
        {
          id: `err-confirm-${Date.now()}`,
          sender: 'assistant',
          text: "I couldn't apply that confirmed change just now, so your plan wasn't modified. Tap Confirm again to retry.",
          timestamp: liveClockTime(),
          mutationStatus: 'error',
        },
      ]);
      scrollThreadToBottom('smooth');
    }
  };

  const handleCancelPendingAction = (
    messageId: string,
    toolName?: CoachPendingConfirmation['tool_name']
  ) => {
    triggerHaptic('light');
    const cancelText =
      toolName === 'modify_program' || toolName === 'rebalance_program'
        ? 'Kept your current program unchanged.'
        : toolName === 'override_recovery_gate'
          ? 'Good call — respecting muscle recovery today. Your session stays queued until muscles recover.'
          : toolName === 'delete_athlete_memory'
            ? 'Kept your saved coaching memories untouched.'
            : 'Reset cancelled — your current program progress stays untouched.';
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === messageId && m.pendingConfirmation
          ? { ...m, pendingConfirmation: { ...m.pendingConfirmation, status: 'cancelled' as const } }
          : m
      ),
      {
        id: `cancel-${Date.now()}`,
        sender: 'assistant',
        text: cancelText,
        timestamp: liveClockTime(),
        suggestedActions: [
          { label: 'Today workout brief', prompt: 'What am I lifting today?' },
          { label: 'Should I train today?', prompt: 'Should I train today?' },
        ],
      },
    ]);
    scrollThreadToBottom('smooth');
  };

  const contextNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPrompt || initialMessages) return;
    if (initialPromptHandledRef.current === initialPrompt) return;
    initialPromptHandledRef.current = initialPrompt;
    void handleSendMessage(initialPrompt);
  }, [initialPrompt, initialMessages]);

  // When opened from an explicit object trigger (ExerciseDetailModal, CompositionCard,
  // StrengthLevelsCard, GoalDetailScreen, etc.) while a prior conversation exists, append a
  // fresh contextual opening + chips for that object so prior history/Undo stay scrollable above
  // and the new object's context greets the athlete immediately.
  useEffect(() => {
    if (embedded || initialMessages || initialPrompt) return;
    const isSpecificObjectTrigger = Boolean(place?.exerciseId || place?.detail || place?.goalId);
    if (!isSpecificObjectTrigger) return;
    const ctxKey = `${place?.tab || ''}:${place?.exerciseId || ''}:${place?.detail || ''}:${place?.goalId || ''}:${opening.id}`;
    if (contextNoticeRef.current === ctxKey) return;
    contextNoticeRef.current = ctxKey;
    if (messages.length <= 1 && messages[0]?.id === 'msg-welcome') return;
    const last = messages[messages.length - 1];
    if (last?.sender === 'assistant' && last.text === opening.line) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-ctx-${opening.id}-${Date.now()}`,
        sender: 'assistant',
        text: opening.line,
        timestamp: liveClockTime(),
        suggestedActions: opening.hooks.slice(0, 3).map((h) => ({
          label: h.label,
          prompt: h.text,
          ...(h.fill ? { fill: true } : {}),
        })),
      },
    ]);
    requestAnimationFrame(() => scrollThreadToBottom('auto'));
  }, [embedded, initialMessages, initialPrompt, place?.tab, place?.exerciseId, place?.detail, place?.goalId, opening.id]);

  const handleUndoMutation = (messageId: string, snapshot: CoachUndoSnapshot) => {
    if (revertedMessageIds[messageId] || !onUndoAction) return;
    triggerHaptic('medium');
    onUndoAction(snapshot);
    setRevertedMessageIds((prev) => ({ ...prev, [messageId]: true }));
    setMessages((prev) => [
      ...prev,
      {
        id: `undo-${Date.now()}`,
        sender: 'assistant',
        text: `Reverted "${snapshot.label}". Your previous workout and profile state are restored.`,
        timestamp: liveClockTime(),
        suggestedActions: [
          { label: 'Today workout brief', prompt: 'What am I lifting today?' },
          { label: 'Where am I in my plan?', prompt: 'Where am I in my program?' },
        ],
      },
    ]);
    scrollThreadToBottom('smooth');
  };

  const handleStartNewChat = () => {
    if (isProcessing) return;
    triggerHaptic('light');
    stopReveal();
    resetOnDeviceConversation();
    resetFlashLiteConversation();
    threadMemoryRef.current = createEmptyThreadMemory();
    setFailedPromptsByMsgId({});
    setRevertedMessageIds({});
    setInputMessage('');
    setStreamingText(null);
    setShowNewMsgPill(false);
    setMessages([
      {
        id: 'msg-welcome',
        sender: 'assistant',
        text: opening.line,
        timestamp: liveClockTime(),
      },
    ]);
    onResetConversation?.();
  };

  // Only show suggested actions from the LATEST assistant message so stale chips from earlier turns never linger.
  const latestSuggestedActions = useMemo(() => {
    const last = messages[messages.length - 1];
    if (last && last.sender === 'assistant' && last.suggestedActions?.length) {
      return last.suggestedActions.slice(0, 3);
    }
    return null;
  }, [messages]);

  // Skip already-reverted actions so undoing action #2 reveals Undo on action #1 cleanly.
  const latestUndoableMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const item = messages[i];
      if (item.sender === 'assistant' && item.undoSnapshot && !revertedMessageIds[item.id]) {
        return item.id;
      }
    }
    return null;
  }, [messages, revertedMessageIds]);

  const quickPrompts = opening.hooks;
  const fillComposerWith = (text: string) => {
    triggerHaptic('light');
    setInputMessage(text);
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(text.length, text.length);
    }, 0);
  };
  const useHook = (hook: (typeof quickPrompts)[number]) => {
    if (!hook.fill) {
      handleSendMessage(hook.text);
      return;
    }
    fillComposerWith(hook.text);
  };
  const useSuggestedChip = (chip: CoachSuggestedAction) => {
    if (chip.fill) {
      fillComposerWith(chip.prompt);
      return;
    }
    handleSendMessage(chip.prompt);
  };

  const conversationStarted = messages.length > 1 || isProcessing || revealing !== null;

  const toggleExpanded = () => {
    triggerHaptic('light');
    setExpanded((v) => !v);
  };

  const actionCardLabel = (type?: NonNullable<AssistantChatMessage['actionApplied']>['type']): string => {
    switch (type) {
      case 'RESET_PROGRAM':
        return 'Program reset';
      case 'SWAP_EXERCISE':
        return 'Exercise swapped';
      case 'ADD_EXERCISE':
        return 'Exercise added';
      case 'REMOVE_EXERCISE':
        return 'Exercise removed';
      case 'ADJUST_WORKOUT_VOLUME':
        return 'Workout volume adjusted';
      case 'SAVE_ATHLETE_MEMORY':
        return 'Memory updated';
      case 'DELETE_ATHLETE_MEMORY':
        return 'Memory removed';
      case 'SWITCH_LOCATION':
        return 'Location switched';
      case 'SCHEDULE_LOCATION_WEEK':
        return 'Week scheduled';
      case 'SWITCH_PROGRAM_SPLIT':
        return 'Program updated';
      case 'MODIFY_PROGRAM':
        return 'Program adapted';
      case 'UPDATE_GOALS':
        return 'Goals updated';
      case 'UPDATE_PROGRESS_WIDGETS':
        return 'Progress updated';
      case 'SHIFT_WORKOUT':
        return 'Rest day logged';
      case 'UPDATE_EQUIPMENT':
        return 'Equipment updated';
      case 'SWITCH_GOAL_PHASE':
        return 'Goal updated';
      case 'LOG_BIOMETRIC':
        return 'Measurement logged';
      case 'LOG_ACTIVE_DAY':
        return 'Activity logged';
      case 'LOG_WORKOUT_SET':
        return 'Set logged';
      case 'REORDER_WORKOUT':
        return 'Workout reordered';
      case 'UPDATE_EXERCISE_NOTE':
        return 'Note saved';
      case 'OVERRIDE_RECOVERY':
        return 'Workout unlocked';
      case 'UPDATE_PROFILE':
        return 'Profile updated';
      default:
        return 'Plan updated';
    }
  };

  // Compute responsive viewport height using 100dvh capped by live visualViewport so keyboard never clips header or bar.
  const vvHeightPx = viewportMetrics.height;
  const sheetHeightStyle: React.CSSProperties = expanded
    ? {
        height: vvHeightPx ? `${vvHeightPx}px` : '100dvh',
        maxHeight: '100dvh',
      }
    : conversationStarted
      ? {
          height: vvHeightPx
            ? viewportMetrics.keyboardOpen
              ? `${Math.round(vvHeightPx * 0.96)}px`
              : `min(74dvh, ${Math.round(vvHeightPx * 0.88)}px, 640px)`
            : 'min(74dvh, 640px)',
          maxHeight: vvHeightPx ? `${Math.round(vvHeightPx * 0.96)}px` : '88dvh',
        }
      : {
          maxHeight: vvHeightPx ? `${Math.round(vvHeightPx * 0.92)}px` : '88dvh',
        };

  const sheetInner = (
    <div
      className={`${embedded ? 'relative w-full border flex flex-col overflow-hidden' : `${closing ? 'wk-sheet-down' : 'wk-sheet-up'} relative w-full sm:max-w-md border-t flex flex-col overflow-hidden transition-[height,max-height,border-radius] duration-300 ease-out`}`}
      style={{
        borderColor: 'var(--color-border-strong)',
        background: 'linear-gradient(180deg, var(--color-bg-surface) 0%, var(--color-bg-canvas) 180px)',
        borderTopLeftRadius: embedded ? 24 : expanded ? 0 : 24,
        borderTopRightRadius: embedded ? 24 : expanded ? 0 : 24,
        ...(embedded ? { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 } : {}),
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 -12px 40px rgba(0, 0, 0, 0.58)',
        ...(embedded && embeddedHeight
          ? { height: embeddedHeight, maxHeight: embeddedHeight }
          : embedded
            ? {}
            : sheetHeightStyle),
      }}
    >
        {/* Header: safe-area top inset when full-screen, grab bar, Treise title, expand & close */}
        <div
          className="relative flex items-center justify-between shrink-0 px-4 pb-3"
          style={{
            paddingTop: expanded ? 'calc(20px + env(safe-area-inset-top, 0px))' : '20px',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              top: expanded ? 'calc(8px + env(safe-area-inset-top, 0px))' : '8px',
              width: 36,
              height: 4,
              background: 'rgba(255, 255, 255, 0.22)',
            }}
          />
          <div className="min-w-0 flex-1 pr-2">
            <h3
              id={embedded ? undefined : 'ai-coach-title'}
              className="wk-h1 flex items-center gap-2"
              style={{
                color: 'var(--color-text-primary)',
                textTransform: 'none',
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              <span>
                Treise<span style={{ color: 'var(--color-coach-accent)' }}>.</span>
              </span>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                <path
                  d="M7.5 1.5L8.75 5.25L12.5 6.5L8.75 7.75L7.5 11.5L6.25 7.75L2.5 6.5L6.25 5.25L7.5 1.5Z"
                  fill="var(--color-coach-accent)"
                />
                <path
                  d="M12.5 10.5L13.1 12.15L14.75 12.75L13.1 13.35L12.5 15L11.9 13.35L10.25 12.75L11.9 12.15L12.5 10.5Z"
                  fill="var(--color-text-primary)"
                />
              </svg>
            </h3>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <span
                data-coach-context-pill="true"
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium truncate max-w-full"
                style={{
                  background: 'rgb(var(--color-coach-accent-rgb) / 0.12)',
                  color: 'var(--color-coach-accent)',
                  border: '1px solid rgb(var(--color-coach-accent-rgb) / 0.28)',
                }}
              >
                {placeMeta.label}
              </span>
              <span className="wk-caption truncate hidden sm:inline">Private · not stored on server</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {conversationStarted && !embedded && (
              <button
                type="button"
                onClick={handleStartNewChat}
                disabled={isProcessing}
                aria-label="Start new chat"
                title="New chat"
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-all duration-200 active:scale-90 disabled:opacity-40"
                style={{
                  background: 'var(--wk-card)',
                  borderColor: 'var(--color-border-subtle)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <SquarePen className="w-[18px] h-[18px] stroke-[2]" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Shrink Treise to a sheet' : 'Expand Treise to full screen'}
              aria-pressed={expanded}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-all duration-200 active:scale-90"
              style={{
                background: 'var(--wk-card)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {expanded ? <Minimize2 className="w-5 h-5 stroke-[2]" /> : <Maximize2 className="w-5 h-5 stroke-[2]" />}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                requestClose();
              }}
              aria-label="Close Treise"
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-colors"
              style={{
                background: 'var(--wk-card)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Message Thread (wraps relative container so floating "New message" pill anchors cleanly) */}
        <div className={`relative ${expanded || conversationStarted ? 'flex-1' : ''} min-h-0 flex flex-col`}>
          <div
            ref={threadRef}
            onScroll={handleThreadScroll}
            onTouchStart={(e) => {
              touchStartYRef.current = e.touches[0]?.clientY ?? null;
              releaseAutoScrollOnUserGesture();
            }}
            onTouchMove={(e) => {
              const startY = touchStartYRef.current;
              const currentY = e.touches[0]?.clientY;
              if (startY !== null && currentY !== undefined) {
                if (currentY > startY + 6) {
                  autoScrollLockedRef.current = false;
                  if (isProcessing || revealing !== null) {
                    setShowNewMsgPill(true);
                  }
                }
                if (Math.abs(currentY - startY) > 8) {
                  inputRef.current?.blur();
                }
              }
            }}
            onWheel={(e) => {
              if (e.deltaY < 0) autoScrollLockedRef.current = false;
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (!target.closest('button') && !target.closest('[data-streaming-bubble="true"]')) {
                inputRef.current?.blur();
              }
            }}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar overscroll-contain flex flex-col px-4 pt-1 gap-3"
            style={{
              touchAction: 'pan-y',
              paddingBottom: showNewMsgPill ? 64 : 16,
            }}
          >
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              const isBeingRevealed = revealing?.messageId === msg.id;
              const displayText = isBeingRevealed ? revealing.visibleText : msg.text;

              // Before anything is asked, the opening line stands on its own, large, like a headline.
              if (msg.id === 'msg-welcome' && !conversationStarted) {
                return (
                  <p
                    key={msg.id}
                    className="wk-h1 py-1"
                  >
                    {renderBold(displayText)}
                  </p>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    data-streaming-bubble={isBeingRevealed ? 'true' : undefined}
                    onClick={
                      isBeingRevealed
                        ? () => {
                            triggerHaptic('light');
                            stopReveal();
                          }
                        : undefined
                    }
                    title={isBeingRevealed ? 'Tap to show full reply' : undefined}
                    className={`${isUser ? 'wk-body font-medium' : 'wk-card wk-body flex flex-col'} ${
                      isBeingRevealed ? 'cursor-pointer' : ''
                    }`}
                    style={
                      isUser
                        ? {
                            maxWidth: '82%',
                            background: 'var(--wk-raised)',
                            border: '1px solid var(--color-border-strong)',
                            borderRadius: 16,
                            padding: '12px 16px',
                          }
                        : {
                            maxWidth: '82%',
                            padding: '12px 16px',
                            gap: 8,
                          }
                    }
                  >
                    {/* Saved to Athlete Memory pill */}
                    {!isUser && msg.memorySaved && (
                      <div
                        className="inline-flex items-center self-start font-medium rounded-full gap-2 px-3 py-1 text-xs"
                        style={{
                          background: 'var(--color-status-positive-soft)',
                          border: '1px solid var(--color-border-accent)',
                          color: 'var(--wk-accent)',
                        }}
                      >
                        <Sparkles className="w-3 h-3 shrink-0" strokeWidth={2.2} />
                        <span>Saved to Athlete Memory</span>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{renderBold(displayText)}</p>

                    {/* 1-tap Retry button when a send failed */}
                    {!isUser && !isBeingRevealed && failedPromptsByMsgId[msg.id] && (
                      <button
                        type="button"
                        onClick={() => {
                          const retryText = failedPromptsByMsgId[msg.id];
                          setFailedPromptsByMsgId((prev) => {
                            const next = { ...prev };
                            delete next[msg.id];
                            return next;
                          });
                          void handleSendMessage(retryText);
                        }}
                        disabled={isProcessing}
                        className="wk-btn-secondary self-start min-h-[44px] px-4 gap-2 text-xs font-medium disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5 stroke-[2]" />
                        <span>Retry</span>
                      </button>
                    )}

                    {/* Human-in-the-loop Confirmation Card (Program adaptations & destructive actions) */}
                    {!isUser && !isBeingRevealed && msg.pendingConfirmation && (() => {
                      const isProgramAdaptation =
                        msg.pendingConfirmation.tool_name === 'modify_program' ||
                        msg.pendingConfirmation.tool_name === 'rebalance_program';
                      const accentColor = isProgramAdaptation
                        ? 'var(--color-coach-accent)'
                        : 'var(--color-status-warning)';
                      const borderColor = isProgramAdaptation
                        ? 'rgb(var(--color-coach-accent-rgb) / 0.35)'
                        : 'rgb(var(--color-status-warning-rgb) / 0.35)';
                      return (
                      <div
                        className="wk-raised flex flex-col gap-2"
                        style={{ borderColor }}
                      >
                        <div className="flex items-start gap-2">
                          {isProgramAdaptation ? (
                            <Sparkles
                              className="w-4 h-4 shrink-0 mt-1"
                              style={{ color: accentColor }}
                              strokeWidth={2.2}
                            />
                          ) : (
                            <AlertTriangle
                              className="w-4 h-4 shrink-0 mt-1"
                              style={{ color: accentColor }}
                              strokeWidth={2.2}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="wk-subhead" style={{ color: accentColor }}>
                              {msg.pendingConfirmation.title}
                            </div>
                            <p className="wk-body mt-1" style={{ color: 'var(--wk-muted)' }}>
                              {msg.pendingConfirmation.warning}
                            </p>
                            {msg.stateDiff && (
                              <div className="wk-body font-medium mt-1" style={{ color: 'var(--color-text-primary)' }}>
                                {formatStateDiffText(msg.stateDiff)}
                              </div>
                            )}
                          </div>
                        </div>

                        {msg.pendingConfirmation.status === 'pending' ? (
                          <div
                            className={
                              msg.pendingConfirmation.confirm_label.length +
                                msg.pendingConfirmation.cancel_label.length >
                              22
                                ? 'flex flex-col gap-2'
                                : 'flex items-center gap-2'
                            }
                          >
                            <button
                              type="button"
                              onClick={() => handleConfirmPendingAction(msg.id, msg.pendingConfirmation!)}
                              disabled={isProcessing}
                              className="wk-button min-h-[44px] w-full flex-1 font-semibold leading-snug py-2 px-3 text-center disabled:opacity-50"
                              style={{
                                background: 'var(--color-action-primary-bg)',
                                color: 'var(--color-action-primary-fg)',
                              }}
                            >
                              {msg.pendingConfirmation.confirm_label}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleCancelPendingAction(msg.id, msg.pendingConfirmation!.tool_name)
                              }
                              disabled={isProcessing}
                              className={
                                msg.pendingConfirmation.confirm_label.length +
                                  msg.pendingConfirmation.cancel_label.length >
                                22
                                  ? 'wk-btn-secondary w-full min-h-[44px] px-4 disabled:opacity-50'
                                  : 'wk-btn-secondary flex-none px-4 disabled:opacity-50'
                              }
                            >
                              {msg.pendingConfirmation.cancel_label}
                            </button>
                          </div>
                        ) : (
                          <div className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                            {msg.pendingConfirmation.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                          </div>
                        )}
                      </div>
                      );
                    })()}

                    {/* Inline OOUX Mutation Receipt Card */}
                    {!isUser && !isBeingRevealed && msg.actionApplied && (
                      <div className="wk-raised flex flex-col gap-2">
                        <div className="flex items-start gap-2">
                          <CheckCircle2
                            className="w-4 h-4 shrink-0 mt-1"
                            style={{ color: 'var(--wk-accent)' }}
                            strokeWidth={2}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="wk-label">
                              {msg.stateDiff?.label || actionCardLabel(msg.actionApplied.type)}
                            </div>
                            <div
                              className="wk-body font-medium mt-1"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {msg.stateDiff
                                ? formatStateDiffText(msg.stateDiff)
                                : msg.actionApplied.summary}
                            </div>
                          </div>
                        </div>

                        {(msg.navigateTarget || msg.undoSnapshot || msg.actionApplied.type === 'UPDATE_EQUIPMENT') && (
                          <div className="flex flex-wrap items-center gap-2">
                            {msg.navigateTarget && onNavigateTab && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  onNavigateTab(msg.navigateTarget!, msg.navigateDetail);
                                }}
                                className="wk-button min-h-[44px] flex-1 gap-2 px-3 whitespace-nowrap font-semibold"
                                style={{
                                  background: 'var(--color-action-primary-bg)',
                                  color: 'var(--color-action-primary-fg)',
                                }}
                              >
                                <span>{msg.navigateLabel || 'View'}</span>
                                <ChevronRight className="w-4 h-4 stroke-[2] shrink-0" />
                              </button>
                            )}

                            {msg.undoSnapshot && onUndoAction && (
                              <button
                                type="button"
                                disabled={Boolean(revertedMessageIds[msg.id]) || msg.id !== latestUndoableMessageId}
                                onClick={() => handleUndoMutation(msg.id, msg.undoSnapshot!)}
                                className="wk-btn-secondary px-3 gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                                <span>
                                  {revertedMessageIds[msg.id]
                                    ? 'Reverted'
                                    : msg.id !== latestUndoableMessageId
                                      ? 'Superseded'
                                      : 'Undo'}
                                </span>
                              </button>
                            )}

                            {msg.actionApplied.type === 'UPDATE_EQUIPMENT' && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  onViewAllEquipment?.();
                                }}
                                className={
                                  msg.navigateTarget
                                    ? 'wk-btn-secondary min-h-[44px] px-3 gap-2'
                                    : 'wk-button min-h-[44px] gap-2'
                                }
                                style={
                                  msg.navigateTarget
                                    ? undefined
                                    : {
                                        background: 'var(--color-action-primary-bg)',
                                        color: 'var(--color-action-primary-fg)',
                                      }
                                }
                              >
                                <Dumbbell className="w-4 h-4 stroke-[2]" />
                                <span>View all equipment</span>
                                <ChevronRight className="w-4 h-4 stroke-[2]" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Scientific Principles & Academic Citations */}
                    {!isUser && !isBeingRevealed && msg.scientificPrinciplesCited && msg.scientificPrinciplesCited.length > 0 && (
                      <div className="flex flex-col pt-1 gap-2">
                        <span
                          className="wk-label flex items-center gap-2"
                          style={{ color: 'var(--wk-accent)' }}
                        >
                          <FlaskConical className="w-3.5 h-3.5 stroke-[2]" style={{ color: 'var(--wk-accent)' }} />
                          <span>Scientific rationale</span>
                        </span>
                        <div className="flex flex-col gap-2">
                          {msg.scientificPrinciplesCited.map((sp) => (
                            <div
                              key={sp.id}
                              className="wk-raised flex flex-col gap-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="wk-subhead">{sp.title}</span>
                                <span className="wk-pill shrink-0">{sp.topic}</span>
                              </div>
                              {sp.formula && (
                                <div
                                  className="tabular-numbers overflow-x-auto no-scrollbar text-xs"
                                  style={{ color: 'var(--wk-accent)' }}
                                >
                                  {sp.formula}
                                </div>
                              )}
                              <div className="wk-caption italic">{sp.academicCitation}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isUser && !isBeingRevealed && (
                      <div className="wk-caption">
                        <span>{msg.timestamp}</span>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <span className="wk-caption mt-1 px-1">
                      {msg.timestamp}
                    </span>
                  )}
                </div>
              );
            })}

            {isProcessing && (
              <div className="flex items-start">
                {streamingText ? (
                  <div
                    data-streaming-bubble="true"
                    className="wk-card wk-body whitespace-pre-wrap"
                    style={{ maxWidth: '82%', padding: '12px 16px' }}
                    aria-live="polite"
                  >
                    {renderBold(streamingText)}
                  </div>
                ) : (
                  <div
                    className="wk-card wk-body flex items-center gap-2"
                    style={{ maxWidth: '82%', padding: '12px 16px' }}
                    aria-live="polite"
                  >
                    <div className="flex items-center shrink-0 gap-2" aria-hidden="true">
                      <span
                        className="w-2 h-2 rounded-full wk-typing-dot"
                        style={{ background: 'var(--wk-accent)', animationDelay: '0ms' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full wk-typing-dot"
                        style={{ background: 'var(--wk-accent)', animationDelay: '160ms' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full wk-typing-dot"
                        style={{ background: 'var(--wk-accent)', animationDelay: '320ms' }}
                      />
                    </div>
                    <span className="wk-caption font-medium">{pendingStatus}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {showNewMsgPill && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                autoScrollLockedRef.current = true;
                setShowNewMsgPill(false);
                scrollThreadToBottom('smooth');
              }}
              aria-label="Scroll to new message"
              className="absolute right-4 bottom-2 min-h-[44px] flex items-center rounded-full px-3 gap-1 text-xs font-medium shadow-lg transition-transform active:scale-95"
              style={{
                background: 'var(--wk-raised)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-strong)',
              }}
            >
              <ChevronDown className="w-4 h-4 stroke-[2.2]" />
              <span>New message</span>
            </button>
          )}
        </div>

        {/* Single-row horizontal quick-reply chips (44px min touch target) with subtle right-edge scroll fade */}
        <div className="relative shrink-0">
          <div
            className="overflow-x-auto no-scrollbar flex flex-nowrap items-center px-4 pr-8 pt-1 pb-2 gap-2"
            role="group"
            aria-label="Suggestions"
          >
            {latestSuggestedActions
              ? latestSuggestedActions.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => useSuggestedChip(chip)}
                    disabled={isProcessing}
                    className="shrink-0 min-h-[44px] whitespace-nowrap rounded-full px-4 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      background: 'var(--wk-card)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border-strong)',
                    }}
                  >
                    {chip.label}
                  </button>
                ))
              : quickPrompts.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => useHook(q)}
                    disabled={isProcessing}
                    className="shrink-0 min-h-[44px] whitespace-nowrap rounded-full px-4 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      background: 'var(--wk-card)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border-strong)',
                    }}
                  >
                    {q.label}
                  </button>
                ))}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, var(--color-bg-canvas) 100%)',
            }}
          />
        </div>

        {/* Multiline Input Bar pinned cleanly above soft keyboard / gesture bar */}
        <div
          className="shrink-0 px-4 pt-1"
          style={{
            paddingBottom: viewportMetrics.keyboardOpen
              ? '12px'
              : 'calc(16px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end rounded-3xl pl-4 pr-2 py-2 gap-2"
            style={{
              background: 'var(--wk-card)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              onFocus={() => {
                if (autoScrollLockedRef.current) scrollThreadToBottom('smooth');
              }}
              placeholder={placeMeta.placeholder}
              aria-label="Message your coach"
              enterKeyHint="send"
              readOnly={isProcessing}
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 bg-transparent outline-none font-normal text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-muted)] min-h-[44px] py-3 resize-none overflow-y-auto no-scrollbar text-base"
              style={{
                fontSize: '16px',
                lineHeight: '24px',
                maxHeight: `${COMPOSER_MAX_HEIGHT_PX}px`,
              }}
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isProcessing}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Send message"
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 shrink-0"
              style={{
                background: 'var(--color-action-primary-bg)',
                color: 'var(--color-action-primary-fg)',
              }}
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
        </div>
    </div>
  );

  if (embedded) {
    return <div className="wk relative w-full flex flex-col justify-end">{sheetInner}</div>;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-coach-title"
      className={`wk fixed inset-0 z-50 flex flex-col justify-end sm:items-center ${
        closing ? 'pointer-events-none' : ''
      }`}
      style={{
        height: vvHeightPx ? `${vvHeightPx}px` : '100dvh',
      }}
    >
      {/* Tapping the page behind closes the sheet. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={requestClose}
        className={`wk-backdrop-in absolute inset-0 w-full h-full cursor-default transition-[background-color,opacity] duration-300 ease-out ${
          closing ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ background: expanded ? 'var(--color-bg-scrim)' : 'rgb(var(--color-bg-canvas-rgb) / 0.5)' }}
      />
      {sheetInner}
    </div>
  );
};
