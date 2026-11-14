import { CoachPlace, buildCoachOpening } from '../../services/coachContext';
import type { ActivityLog } from '../../engine/activeDays';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  AssistantChatMessage,
  BiometricLog,
  ExerciseDefinition,
  ReadinessState,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import { processAssistantMessage } from '../../services/aiAssistantService';
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
  ShieldCheck,
  Maximize2,
  Minimize2,
  X,
  Send,
  Sparkles,
  CheckCircle2,
  Plane,
  Dumbbell,
  Calendar,
  Layers,
  ChevronRight,
  FlaskConical,
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
  onViewAllEquipment?: () => void;
}

/** Renders **bold** segments as <strong> (React text nodes only, never raw HTML). */
const fig = (px: number) => `calc(${px} * var(--f))`;

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
  onViewAllEquipment,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  /** A fly-up sheet for quick questions; expanded, it is a full-screen conversation. */
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const requestClose = useCallback(() => {
    if (closing) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 240);
  }, [closing, onClose]);

  useEffect(() => {
    isMountedRef.current = true;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('keydown', onKeyDown);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [requestClose]);

  // Starter greeting
  useEffect(() => {
    // Load the on-device model while the athlete reads the greeting (no-op if unsupported).
    warmUpOnDeviceModel().catch(() => undefined);

    // The opening line is about the screen the coach was opened on.
    const welcomeText = opening.line;

    const starterMessage: AssistantChatMessage = {
      id: 'msg-welcome',
      sender: 'assistant',
      text: welcomeText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([starterMessage]);

    return () => {
      resetOnDeviceConversation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll only the message thread container (never scroll the outer document viewport on mobile).
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages.length, streamingText, isProcessing]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isProcessing) return;

    triggerHaptic('light');

    const userMsg: AssistantChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessing(true);
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
          onPartial: (textSoFar) => {
            if (isMountedRef.current) setStreamingText(textSoFar);
          },
        }),
        new Promise<never>((_, reject) => {
          failsafeTimer = window.setTimeout(() => reject(new Error('Coach response timed out')), 18_000);
        }),
      ]);

      if (!isMountedRef.current) return;
      setMessages((prev) => [...prev, result.message]);

      if (result.updatedProfile || result.updatedWorkout) {
        triggerHaptic('success');
        onApplyAction(result.updatedProfile, result.updatedWorkout);
      }
    } catch (err) {
      console.error('Failed to process message with AI Coach:', err);
      if (!isMountedRef.current) return;
      const errorMsg: AssistantChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: "Sorry, I couldn't answer that just now. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (failsafeTimer !== null) window.clearTimeout(failsafeTimer);
      if (isMountedRef.current) {
        setIsProcessing(false);
        setStreamingText(null);
      }
    }
  };

  // Suggestions for the screen the coach was opened on. One that needs finishing ("Set a goal of …")
  // goes into the message box instead of being sent.
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
  const conversationStarted = messages.length > 1 || isProcessing;

  const toggleExpanded = () => {
    triggerHaptic('light');
    setExpanded((v) => !v);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-coach-title"
      className={`wk fixed inset-0 z-50 flex flex-col justify-end sm:items-center ${
        closing ? 'pointer-events-none' : ''
      }`}
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
        className={`${closing ? 'wk-sheet-down' : 'wk-sheet-up'} relative w-full sm:max-w-md border-t border-white/[0.11] flex flex-col overflow-hidden transition-[height,max-height,border-radius] duration-300 ease-out ${
          expanded ? 'h-full' : conversationStarted ? 'h-[min(72dvh,620px)] max-h-[86dvh]' : 'max-h-[86dvh]'
        }`}
        style={{
          background: 'linear-gradient(180deg, var(--color-bg-canvas-top) 0%, var(--color-bg-canvas) 180px)',
          borderTopLeftRadius: expanded ? 0 : 30,
          borderTopRightRadius: expanded ? 0 : 30,
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 -12px 40px rgba(0, 0, 0, 0.58)',
        }}
      >
        {/* Header: grab bar, Treise title, expand and close */}
        <div
          className="relative flex items-center justify-between shrink-0"
          style={{
            paddingLeft: fig(38),
            paddingRight: fig(38),
            paddingTop: fig(44),
            paddingBottom: fig(20),
          }}
        >
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              top: fig(14),
              width: fig(72),
              height: fig(8),
              background: 'rgba(255, 255, 255, 0.22)',
            }}
          />
          <div>
            <h3
              id="ai-coach-title"
              className="wk-h1 flex items-center"
              style={{ gap: fig(12), color: 'var(--color-coach-surface)', textTransform: 'none', fontWeight: 800, letterSpacing: '-0.02em' }}
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

        {/* Message Thread */}
        <div
          ref={threadRef}
          className={`${expanded || conversationStarted ? 'flex-1' : ''} min-h-0 overflow-y-auto no-scrollbar overscroll-contain flex flex-col`}
          style={{
            paddingLeft: fig(38),
            paddingRight: fig(38),
            paddingTop: fig(8),
            paddingBottom: fig(28),
            gap: fig(22),
          }}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
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
                  {renderBold(msg.text)}
                </p>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={isUser ? 'wk-body text-white font-medium' : 'wk-card wk-body flex flex-col'}
                  style={
                    isUser
                      ? {
                          maxWidth: '88%',
                          background: 'var(--wk-raised)',
                          border: '1px solid rgba(0, 241, 159, 0.35)',
                          borderRadius: fig(30),
                          padding: `${fig(24)} ${fig(32)}`,
                        }
                      : {
                          maxWidth: '92%',
                          padding: `${fig(32)} ${fig(38)}`,
                          gap: fig(20),
                        }
                  }
                >
                  <p className="whitespace-pre-wrap">{renderBold(msg.text)}</p>

                  {/* Assistant Action Badge if an action was taken */}
                  {!isUser && msg.actionApplied && (
                    <div className="wk-raised flex flex-col" style={{ gap: fig(16) }}>
                      <div className="flex items-start" style={{ gap: fig(16) }}>
                        <CheckCircle2
                          className="w-4 h-4 shrink-0"
                          style={{ color: 'var(--wk-accent)', marginTop: fig(4) }}
                          strokeWidth={2}
                        />
                        <div>
                          <div className="wk-label">
                            {msg.actionApplied.type === 'UPDATE_GOALS'
                              ? 'Goals updated'
                              : msg.actionApplied.type === 'UPDATE_PROGRESS_WIDGETS'
                                ? 'Progress updated'
                                : msg.actionApplied.type === 'RESET_PROGRAM'
                                  ? 'Program reset'
                                  : 'Plan updated'}
                          </div>
                          <div className="wk-body font-medium" style={{ color: 'var(--wk-accent)', marginTop: fig(6) }}>
                            {msg.actionApplied.summary}
                          </div>
                        </div>
                      </div>

                      {/* Actionable CTA when equipment is added or updated */}
                      {/* Only an equipment change offers the equipment screen ("Barbell Bench Press" in a goal is not one). */}
                      {msg.actionApplied.type === 'UPDATE_EQUIPMENT' && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            if (onViewAllEquipment) {
                              onViewAllEquipment();
                            }
                          }}
                          className="wk-button"
                          style={{ background: 'var(--wk-accent)', color: 'var(--color-text-on-accent)', gap: fig(12) }}
                        >
                          <Dumbbell className="w-4 h-4 stroke-[2]" />
                          <span>View All Equipment</span>
                          <ChevronRight className="w-4 h-4 stroke-[2]" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Scientific Principles & Academic Citations */}
                  {!isUser && msg.scientificPrinciplesCited && msg.scientificPrinciplesCited.length > 0 && (
                    <div className="flex flex-col" style={{ paddingTop: fig(12), gap: fig(12) }}>
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
                            <div className="wk-caption italic">
                              {sp.academicCitation}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isUser && (
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
                  className="wk-card wk-body whitespace-pre-wrap"
                  style={{ maxWidth: '90%', padding: `${fig(32)} ${fig(38)}` }}
                  aria-live="polite"
                >
                  {renderBold(streamingText)}
                </div>
              ) : (
                <div
                  className="wk-card wk-body flex items-center"
                  style={{ maxWidth: '90%', padding: `${fig(32)} ${fig(38)}`, gap: fig(20) }}
                  aria-live="polite"
                >
                  <div
                    className="w-2 h-2 rounded-full animate-ping"
                    style={{ background: 'var(--wk-accent)' }}
                  />
                  <span className="wk-body font-medium">
                    Thinking…
                  </span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Suggestions for this screen */}
        <div
          className="overflow-x-auto no-scrollbar flex items-center shrink-0"
          style={{
            paddingLeft: fig(38),
            paddingRight: fig(38),
            paddingTop: fig(6),
            paddingBottom: fig(24),
            gap: fig(14),
          }}
          role="group"
          aria-label="Suggestions"
        >
          {quickPrompts.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => useHook(q)}
              disabled={isProcessing}
              className="shrink-0 min-h-[44px] font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
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

        {/* Input Bar */}
        <div
          className="shrink-0"
          style={{
            paddingLeft: fig(38),
            paddingRight: fig(38),
            paddingTop: fig(4),
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center"
            style={{
              borderRadius: 60,
              background: 'var(--wk-card)',
              border: '1px solid rgba(255, 255, 255, 0.11)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              padding: `${fig(8)} ${fig(8)} ${fig(8)} ${fig(32)}`,
              gap: fig(12),
            }}
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              ref={inputRef}
              placeholder="Ask Treise…"
              aria-label="Message your coach"
              readOnly={isProcessing}
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 bg-transparent outline-none wk-body text-white placeholder:text-white/45 min-h-[44px]"
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
