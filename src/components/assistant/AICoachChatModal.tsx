import { CoachPlace, buildCoachOpening } from '../../services/coachContext';
import type { ActivityLog } from '../../engine/activeDays';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  AssistantChatMessage,
  BiometricLog,
  CoachPendingConfirmation,
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
import { formatStateDiffText } from '../../services/coachTools';
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
  onNavigateTab?: (tab: 'train' | 'program' | 'analytics') => void;
  onViewAllEquipment?: () => void;
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
    /\b(program|plan|cycle|day\s*(1|one)|workout\s*1|beginning|scratch|over)\b/.test(lower)
  ) {
    return 'Resetting program…';
  }
  if (/\b(switch|change)\b.*\b(program|phase\s*1|muscle|starter|day)\b/.test(lower)) {
    return 'Switching program…';
  }
  if (
    /\b(rebalance|imbalance|asymmetry|symmetr|pull.*push|push.*pull|all sessions|whole program|every session|program-wide|permanently)\b/.test(
      lower
    )
  ) {
    return 'Reviewing program…';
  }
  if (/\b(goal|target)\b/.test(lower) && /\b(set|change|update|make|add)\b/.test(lower)) {
    return 'Updating goals…';
  }
  if (/\b(rest\s*day|can['’]?t\s*train|skip\s*today|shift)\b/.test(lower)) {
    return 'Updating schedule…';
  }
  if (/\b(bought|got|sold|remove|equipment|travel|away|home|gym|bodyweight)\b/.test(lower)) {
    return 'Updating workout…';
  }
  if (/\b(recovery|whoop|hrv|strain|sleep|joint|shoulder|knee|back|elbow|strength|level|steps)\b/.test(lower)) {
    return 'Reviewing your data…';
  }
  return 'Thinking…';
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

  const [inputMessage, setInputMessage] = useState(initialInputValue);
  const [isProcessing, setIsProcessing] = useState(Boolean(initialPendingStatus));
  const [pendingStatus, setPendingStatus] = useState<string>(initialPendingStatus || 'Thinking…');
  const [revertedMessageIds, setRevertedMessageIds] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<AssistantChatMessage[]>(
    () =>
      initialMessages ?? [
        {
          id: 'msg-welcome',
          sender: 'assistant',
          text: opening.line,
          timestamp: '09:41',
        },
      ]
  );
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

  // Starter greeting + warm-up
  useEffect(() => {
    if (embedded) return;
    warmUpOnDeviceModel().catch(() => undefined);
    if (!initialMessages) {
      const starterMessage: AssistantChatMessage = {
        id: 'msg-welcome',
        sender: 'assistant',
        text: opening.line,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([starterMessage]);
    }
    return () => {
      resetOnDeviceConversation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

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

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isProcessing) return;

    stopReveal();
    triggerHaptic('light');

    const userMsg: AssistantChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
      const errorMsg: AssistantChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: "Sorry, I couldn't answer that just now. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.pendingConfirmation
          ? { ...m, pendingConfirmation: { ...m.pendingConfirmation, status: 'confirmed' } }
          : m
      )
    );
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
      startProgressiveReveal(result.message.id, result.message.text, '');
    } catch (err) {
      console.error('Failed to confirm pending coach action:', err);
      if (!isMountedRef.current) return;
      setIsProcessing(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-confirm-${Date.now()}`,
          sender: 'assistant',
          text: "Sorry, I couldn't complete that confirmed change just now. Nothing was changed — please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
    const isProgramAdaptation =
      toolName === 'modify_program' || toolName === 'rebalance_program';
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === messageId && m.pendingConfirmation
          ? { ...m, pendingConfirmation: { ...m.pendingConfirmation, status: 'cancelled' as const } }
          : m
      ),
      {
        id: `cancel-${Date.now()}`,
        sender: 'assistant',
        text: isProgramAdaptation
          ? 'Kept your current program unchanged.'
          : 'Reset cancelled — your current program progress stays untouched.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    scrollThreadToBottom('smooth');
  };

  useEffect(() => {
    if (!initialPrompt || initialMessages) return;
    if (initialPromptHandledRef.current === initialPrompt) return;
    initialPromptHandledRef.current = initialPrompt;
    void handleSendMessage(initialPrompt);
  }, [initialPrompt, initialMessages]);

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
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    scrollThreadToBottom('smooth');
  };

  const latestSuggestedActions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const item = messages[i];
      if (item.sender === 'assistant' && item.suggestedActions?.length) {
        return item.suggestedActions.slice(0, 3);
      }
    }
    return null;
  }, [messages]);

  const latestUndoableMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const item = messages[i];
      if (item.sender === 'assistant' && item.undoSnapshot) {
        return item.id;
      }
    }
    return null;
  }, [messages]);

  const quickPrompts = opening.hooks;
  const useHook = (hook: (typeof quickPrompts)[number]) => {
    if (!hook.fill) {
      handleSendMessage(hook.text);
      return;
    }
    triggerHaptic('light');
    setInputMessage(hook.text);
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(hook.text.length, hook.text.length);
    }, 0);
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
          <div>
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
            <p className="wk-caption mt-1">
              No chat history saved on any server
            </p>
          </div>
          <div className="flex items-center gap-2">
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
                              className="wk-button min-h-[44px] w-full flex-1 font-semibold whitespace-nowrap disabled:opacity-50"
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
                                  onNavigateTab(msg.navigateTarget!);
                                }}
                                className="wk-button min-h-[44px] flex-1 gap-2 font-semibold"
                                style={{
                                  background: 'var(--color-action-primary-bg)',
                                  color: 'var(--color-action-primary-fg)',
                                }}
                              >
                                <span>{msg.navigateLabel || 'View'}</span>
                                <ChevronRight className="w-4 h-4 stroke-[2]" />
                              </button>
                            )}

                            {msg.undoSnapshot && onUndoAction && (
                              <button
                                type="button"
                                disabled={Boolean(revertedMessageIds[msg.id]) || msg.id !== latestUndoableMessageId}
                                onClick={() => handleUndoMutation(msg.id, msg.undoSnapshot!)}
                                className="wk-btn-secondary px-3 gap-2 disabled:opacity-50"
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
                                className="wk-button min-h-[44px] gap-2"
                                style={{
                                  background: 'var(--color-action-primary-bg)',
                                  color: 'var(--color-action-primary-fg)',
                                }}
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

        {/* Single-row horizontal quick-reply chips (44px min touch target) */}
        <div
          className="overflow-x-auto no-scrollbar flex flex-nowrap items-center shrink-0 px-4 pt-1 pb-2 gap-2"
          role="group"
          aria-label="Suggestions"
        >
          {latestSuggestedActions
            ? latestSuggestedActions.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleSendMessage(chip.prompt)}
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
              placeholder="Ask Treise…"
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
