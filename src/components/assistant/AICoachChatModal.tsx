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
  onApplyAction: (updatedProfile?: Partial<UserProfile>, updatedWorkout?: WorkoutSession) => void;
  onUndoAction?: (snapshot: CoachUndoSnapshot) => void;
  onNavigateTab?: (tab: 'train' | 'program' | 'analytics') => void;
  onViewAllEquipment?: () => void;
}

const fig = (px: number) => `calc(${px} * var(--f))`;
const WORD_REVEAL_INTERVAL_MS = 16;
const COMPOSER_MAX_HEIGHT_PX = 96;

/** Renders **bold** segments as <strong> (React text nodes only, never raw HTML). */
function renderBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="text-white font-semibold">
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
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>('Thinking…');
  const [revertedMessageIds, setRevertedMessageIds] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<{
    messageId: string;
    fullText: string;
    visibleText: string;
  } | null>(null);
  const [showNewMsgPill, setShowNewMsgPill] = useState(false);

  /** A fly-up sheet for quick questions; expanded, it is a full-screen conversation. */
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [viewportMetrics, setViewportMetrics] = useState<{
    height: number | null;
    keyboardOpen: boolean;
  }>({ height: null, keyboardOpen: false });

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

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const revealRafRef = useRef<number | null>(null);
  const autoScrollLockedRef = useRef(true);
  const touchStartYRef = useRef<number | null>(null);
  const latestStreamingRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

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
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 240);
  }, [closing, onClose, stopReveal]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (revealRafRef.current !== null) cancelAnimationFrame(revealRafRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [requestClose]);

  // Track visualViewport height so opening Android/iOS soft keyboards resizes cleanly inside 100dvh.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
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
  }, [scrollThreadToBottom]);

  // Starter greeting + warm-up
  useEffect(() => {
    warmUpOnDeviceModel().catch(() => undefined);
    const starterMessage: AssistantChatMessage = {
      id: 'msg-welcome',
      sender: 'assistant',
      text: opening.line,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([starterMessage]);
    return () => {
      resetOnDeviceConversation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  useEffect(() => {
    if (autoScrollLockedRef.current) {
      scrollThreadToBottom('auto');
      setShowNewMsgPill(false);
    } else if (isProcessing || revealing !== null) {
      setShowNewMsgPill(true);
    }
  }, [messages.length, streamingText, revealing?.visibleText, isProcessing, revealing, scrollThreadToBottom]);

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
          failsafeTimer = window.setTimeout(() => reject(new Error('Coach response timed out')), 18_000);
        }),
      ]);

      if (!isMountedRef.current) return;
      const streamedPrefix = latestStreamingRef.current ?? '';
      latestStreamingRef.current = null;
      setStreamingText(null);
      setIsProcessing(false);
      setMessages((prev) => [...prev, result.message]);

      if (result.updatedProfile || result.updatedWorkout) {
        triggerHaptic('success');
        onApplyAction(result.updatedProfile, result.updatedWorkout);
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
      if (result.updatedProfile || result.updatedWorkout) {
        triggerHaptic('success');
        onApplyAction(result.updatedProfile, result.updatedWorkout);
      }
      startProgressiveReveal(result.message.id, result.message.text, '');
    } catch {
      if (!isMountedRef.current) return;
      setIsProcessing(false);
    }
  };

  const handleCancelPendingAction = (messageId: string) => {
    triggerHaptic('light');
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === messageId && m.pendingConfirmation
          ? { ...m, pendingConfirmation: { ...m.pendingConfirmation, status: 'cancelled' as const } }
          : m
      ),
      {
        id: `cancel-${Date.now()}`,
        sender: 'assistant',
        text: 'Reset cancelled — your current program progress stays untouched.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    scrollThreadToBottom('smooth');
  };

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
      case 'ADJUST_WORKOUT_VOLUME':
        return 'Workout volume adjusted';
      case 'SAVE_ATHLETE_MEMORY':
        return 'Memory updated';
      case 'SWITCH_PROGRAM_SPLIT':
        return 'Program updated';
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
          closing ? 'bg-black/45 opacity-0' : expanded ? 'bg-black/90 opacity-100' : 'bg-black/45 opacity-100'
        }`}
      />
      <div
        className={`${closing ? 'wk-sheet-down' : 'wk-sheet-up'} relative w-full sm:max-w-md border-t border-white/[0.11] flex flex-col overflow-hidden transition-[height,max-height,border-radius] duration-300 ease-out`}
        style={{
          background: 'linear-gradient(180deg, var(--color-bg-canvas-top) 0%, var(--color-bg-canvas) 180px)',
          borderTopLeftRadius: expanded ? 0 : 30,
          borderTopRightRadius: expanded ? 0 : 30,
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 -12px 40px rgba(0, 0, 0, 0.58)',
          ...sheetHeightStyle,
        }}
      >
        {/* Header: safe-area top inset when full-screen, grab bar, Treise title, expand & close */}
        <div
          className="relative flex items-center justify-between shrink-0"
          style={{
            paddingLeft: fig(38),
            paddingRight: fig(38),
            paddingTop: expanded ? `calc(${fig(44)} + env(safe-area-inset-top, 0px))` : fig(44),
            paddingBottom: fig(20),
          }}
        >
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              top: expanded ? `calc(${fig(14)} + env(safe-area-inset-top, 0px))` : fig(14),
              width: fig(72),
              height: fig(8),
              background: 'rgba(255, 255, 255, 0.22)',
            }}
          />
          <div>
            <h3
              id="ai-coach-title"
              className="wk-h1 flex items-center"
              style={{
                gap: fig(12),
                color: 'var(--color-coach-surface)',
                textTransform: 'none',
                fontWeight: 800,
                letterSpacing: '-0.02em',
              }}
            >
              <span>
                Treise<span style={{ color: 'var(--color-coach-border)' }}>.</span>
              </span>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                <path
                  d="M7.5 1.5L8.75 5.25L12.5 6.5L8.75 7.75L7.5 11.5L6.25 7.75L2.5 6.5L6.25 5.25L7.5 1.5Z"
                  fill="var(--color-coach-glow)"
                />
                <path
                  d="M12.5 10.5L13.1 12.15L14.75 12.75L13.1 13.35L12.5 15L11.9 13.35L10.25 12.75L11.9 12.15L12.5 10.5Z"
                  fill="var(--color-coach-border)"
                />
              </svg>
            </h3>
            <p className="wk-caption" style={{ marginTop: fig(6) }}>
              No chat history saved on any server
            </p>
          </div>
          <div className="flex items-center" style={{ gap: fig(12) }}>
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Shrink Treise to a sheet' : 'Expand Treise to full screen'}
              aria-pressed={expanded}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all duration-200 active:scale-90"
              style={{ background: 'var(--wk-card)' }}
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
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
              style={{ background: 'var(--wk-card)' }}
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
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar overscroll-contain flex flex-col"
            style={{
              touchAction: 'pan-y',
              paddingLeft: fig(38),
              paddingRight: fig(38),
              paddingTop: fig(8),
              paddingBottom: fig(28),
              gap: fig(22),
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
                    className="text-white font-semibold"
                    style={{
                      fontSize: `max(16px, ${fig(36)})`,
                      lineHeight: 1.32,
                      paddingTop: fig(8),
                      paddingBottom: fig(8),
                    }}
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
                    className={`${isUser ? 'wk-body text-white font-medium' : 'wk-card wk-body flex flex-col'} ${
                      isBeingRevealed ? 'cursor-pointer' : ''
                    }`}
                    style={
                      isUser
                        ? {
                            maxWidth: '82%',
                            background: 'var(--wk-raised)',
                            border: '1px solid rgba(0, 241, 159, 0.35)',
                            borderRadius: fig(30),
                            padding: `${fig(22)} ${fig(30)}`,
                          }
                        : {
                            maxWidth: '82%',
                            padding: `${fig(28)} ${fig(34)}`,
                            gap: fig(18),
                          }
                    }
                  >
                    {/* Saved to Athlete Memory pill */}
                    {!isUser && msg.memorySaved && (
                      <div
                        className="inline-flex items-center self-start font-semibold"
                        style={{
                          borderRadius: 60,
                          gap: fig(8),
                          padding: `${fig(8)} ${fig(18)}`,
                          background: 'rgba(0, 241, 159, 0.12)',
                          border: '1px solid rgba(0, 241, 159, 0.28)',
                          color: 'var(--wk-accent)',
                          fontSize: `max(11px, ${fig(21)})`,
                        }}
                      >
                        <Sparkles className="w-3 h-3 shrink-0" strokeWidth={2.2} />
                        <span>Saved to Athlete Memory</span>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{renderBold(displayText)}</p>

                    {/* Destructive Action Confirmation Card */}
                    {!isUser && !isBeingRevealed && msg.pendingConfirmation && (
                      <div
                        className="wk-raised flex flex-col"
                        style={{
                          gap: fig(14),
                          borderColor: 'rgba(245, 158, 11, 0.35)',
                        }}
                      >
                        <div className="flex items-start" style={{ gap: fig(12) }}>
                          <AlertTriangle
                            className="w-4 h-4 shrink-0"
                            style={{ color: 'var(--color-status-warning)', marginTop: fig(3) }}
                            strokeWidth={2.2}
                          />
                          <div className="min-w-0">
                            <div className="wk-label" style={{ color: 'var(--color-status-warning)' }}>
                              {msg.pendingConfirmation.title}
                            </div>
                            <p
                              className="wk-body"
                              style={{ color: 'var(--wk-muted)', marginTop: fig(6) }}
                            >
                              {msg.pendingConfirmation.warning}
                            </p>
                            {msg.stateDiff && (
                              <div
                                className="wk-body font-medium text-white"
                                style={{ marginTop: fig(8) }}
                              >
                                {formatStateDiffText(msg.stateDiff)}
                              </div>
                            )}
                          </div>
                        </div>

                        {msg.pendingConfirmation.status === 'pending' ? (
                          <div className="flex items-center" style={{ gap: fig(12) }}>
                            <button
                              type="button"
                              onClick={() => handleConfirmPendingAction(msg.id, msg.pendingConfirmation!)}
                              disabled={isProcessing}
                              className="wk-button min-h-[44px] flex-1 font-semibold disabled:opacity-50"
                              style={{
                                background: 'var(--wk-accent)',
                                color: 'var(--color-text-on-accent)',
                              }}
                            >
                              {msg.pendingConfirmation.confirm_label}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelPendingAction(msg.id)}
                              disabled={isProcessing}
                              className="wk-button min-h-[44px] font-medium disabled:opacity-50"
                              style={{
                                paddingLeft: fig(28),
                                paddingRight: fig(28),
                                background: 'var(--wk-pill)',
                                color: 'var(--wk-muted)',
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}
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
                    )}

                    {/* Inline OOUX Mutation Receipt Card */}
                    {!isUser && !isBeingRevealed && msg.actionApplied && (
                      <div className="wk-raised flex flex-col" style={{ gap: fig(14) }}>
                        <div className="flex items-start" style={{ gap: fig(14) }}>
                          <CheckCircle2
                            className="w-4 h-4 shrink-0"
                            style={{ color: 'var(--wk-accent)', marginTop: fig(4) }}
                            strokeWidth={2}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="wk-label">
                              {msg.stateDiff?.label || actionCardLabel(msg.actionApplied.type)}
                            </div>
                            <div
                              className="wk-body font-medium"
                              style={{ color: 'var(--wk-accent)', marginTop: fig(6) }}
                            >
                              {msg.stateDiff
                                ? formatStateDiffText(msg.stateDiff)
                                : msg.actionApplied.summary}
                            </div>
                          </div>
                        </div>

                        {(msg.navigateTarget || msg.undoSnapshot || msg.actionApplied.type === 'UPDATE_EQUIPMENT') && (
                          <div className="flex flex-wrap items-center" style={{ gap: fig(12) }}>
                            {msg.navigateTarget && onNavigateTab && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  onNavigateTab(msg.navigateTarget!);
                                }}
                                className="wk-button min-h-[44px] flex-1 font-semibold"
                                style={{
                                  background: 'var(--wk-accent)',
                                  color: 'var(--color-text-on-accent)',
                                  gap: fig(10),
                                }}
                              >
                                <span>{msg.navigateLabel || 'View'}</span>
                                <ChevronRight className="w-4 h-4 stroke-[2]" />
                              </button>
                            )}

                            {msg.undoSnapshot && onUndoAction && (
                              <button
                                type="button"
                                disabled={Boolean(revertedMessageIds[msg.id])}
                                onClick={() => handleUndoMutation(msg.id, msg.undoSnapshot!)}
                                className="wk-button min-h-[44px] font-medium text-white disabled:opacity-50"
                                style={{
                                  paddingLeft: fig(26),
                                  paddingRight: fig(26),
                                  background: 'var(--wk-pill)',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  gap: fig(8),
                                }}
                              >
                                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                                <span>{revertedMessageIds[msg.id] ? 'Reverted' : 'Undo'}</span>
                              </button>
                            )}

                            {msg.actionApplied.type === 'UPDATE_EQUIPMENT' && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  onViewAllEquipment?.();
                                }}
                                className="wk-button min-h-[44px]"
                                style={{
                                  background: 'var(--wk-accent)',
                                  color: 'var(--color-text-on-accent)',
                                  gap: fig(12),
                                }}
                              >
                                <Dumbbell className="w-4 h-4 stroke-[2]" />
                                <span>View All Equipment</span>
                                <ChevronRight className="w-4 h-4 stroke-[2]" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Scientific Principles & Academic Citations */}
                    {!isUser && !isBeingRevealed && msg.scientificPrinciplesCited && msg.scientificPrinciplesCited.length > 0 && (
                      <div className="flex flex-col" style={{ paddingTop: fig(8), gap: fig(12) }}>
                        <span
                          className="wk-label flex items-center"
                          style={{ color: 'var(--wk-accent)', gap: fig(8) }}
                        >
                          <FlaskConical className="w-3.5 h-3.5 stroke-[2]" style={{ color: 'var(--wk-accent)' }} />
                          <span>Scientific Rationale</span>
                        </span>
                        <div className="flex flex-col" style={{ gap: fig(12) }}>
                          {msg.scientificPrinciplesCited.map((sp) => (
                            <div
                              key={sp.id}
                              className="wk-raised flex flex-col"
                              style={{ gap: fig(10) }}
                            >
                              <div className="flex items-center justify-between" style={{ gap: fig(12) }}>
                                <span className="wk-label">{sp.title}</span>
                                <span className="wk-pill shrink-0">{sp.topic}</span>
                              </div>
                              {sp.formula && (
                                <div
                                  className="font-mono overflow-x-auto no-scrollbar"
                                  style={{ color: 'var(--wk-accent)', fontSize: `max(12px, ${fig(24)})` }}
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
                    <span className="wk-caption" style={{ marginTop: fig(8), paddingLeft: fig(8), paddingRight: fig(8) }}>
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
                    style={{ maxWidth: '82%', padding: `${fig(28)} ${fig(34)}` }}
                    aria-live="polite"
                  >
                    {renderBold(streamingText)}
                  </div>
                ) : (
                  <div
                    className="wk-card wk-body flex items-center"
                    style={{ maxWidth: '82%', padding: `${fig(26)} ${fig(32)}`, gap: fig(18) }}
                    aria-live="polite"
                  >
                    <div className="flex items-center shrink-0" style={{ gap: fig(10) }} aria-hidden="true">
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
                    <span className="wk-caption font-semibold">{pendingStatus}</span>
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
              className="absolute right-0 bottom-0 min-h-[44px] flex items-center rounded-full font-semibold shadow-lg transition-transform active:scale-95"
              style={{
                right: fig(28),
                bottom: fig(16),
                background: 'var(--wk-raised)',
                color: 'var(--wk-accent)',
                border: '1px solid rgba(0, 241, 159, 0.35)',
                paddingLeft: fig(24),
                paddingRight: fig(24),
                gap: fig(8),
                fontSize: `max(12px, ${fig(24)})`,
              }}
            >
              <ChevronDown className="w-4 h-4 stroke-[2.2]" />
              <span>New message</span>
            </button>
          )}
        </div>

        {/* Single-row horizontal quick-reply chips (44px min touch target) */}
        <div
          className="overflow-x-auto no-scrollbar flex flex-nowrap items-center shrink-0"
          style={{
            paddingLeft: fig(38),
            paddingRight: fig(38),
            paddingTop: fig(6),
            paddingBottom: fig(18),
            gap: fig(14),
          }}
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
                  className="shrink-0 min-h-[44px] whitespace-nowrap font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    borderRadius: 60,
                    background: 'var(--wk-card)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingLeft: fig(28),
                    paddingRight: fig(28),
                    fontSize: `max(12px, ${fig(24)})`,
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
                  className="shrink-0 min-h-[44px] whitespace-nowrap font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    borderRadius: 60,
                    background: 'var(--wk-card)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingLeft: fig(28),
                    paddingRight: fig(28),
                    fontSize: `max(12px, ${fig(24)})`,
                  }}
                >
                  {q.label}
                </button>
              ))}
        </div>

        {/* Multiline Input Bar pinned cleanly above soft keyboard / gesture bar */}
        <div
          className="shrink-0"
          style={{
            paddingLeft: fig(38),
            paddingRight: fig(38),
            paddingTop: fig(4),
            paddingBottom: viewportMetrics.keyboardOpen
              ? '12px'
              : 'calc(18px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end"
            style={{
              borderRadius: fig(44),
              background: 'var(--wk-card)',
              border: '1px solid rgba(255, 255, 255, 0.11)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              padding: `${fig(8)} ${fig(8)} ${fig(8)} ${fig(32)}`,
              gap: fig(12),
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
              className="flex-1 bg-transparent outline-none wk-body text-white placeholder:text-white/45 min-h-[44px] resize-none overflow-y-auto no-scrollbar"
              style={{
                fontSize: `max(16px, ${fig(28)})`,
                lineHeight: '22px',
                paddingTop: '11px',
                paddingBottom: '11px',
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
                borderRadius: 60,
                background: 'var(--wk-accent)',
                color: 'var(--color-text-on-accent)',
              }}
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
