import { CoachPlace, buildCoachOpening } from '../../services/coachContext';
import type { ActivityLog } from '../../engine/activeDays';
import React, { useState, useRef, useEffect } from 'react';
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
  // The line and suggestions for the screen the coach was opened on, updated as changes are made.
  const opening = buildCoachOpening({ place, profile, activeWorkout, workouts, activities, biometrics, exerciseCatalog, readinessState, bodyweightEmaKg });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Starter greeting
  useEffect(() => {
    let isMounted = true;
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
      isMounted = false;
      resetOnDeviceConversation();
    };
  }, []);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

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

    try {
      const result = await processAssistantMessage({
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
        onPartial: (textSoFar) => setStreamingText(textSoFar),
      });

      setMessages((prev) => [...prev, result.message]);

      if (result.updatedProfile || result.updatedWorkout) {
        triggerHaptic('success');
        onApplyAction(result.updatedProfile, result.updatedWorkout);
      }
    } catch (err) {
      console.error('Failed to process message with AI Coach:', err);
      const errorMsg: AssistantChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: "Sorry, I couldn't answer that just now. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      setStreamingText(null);
      // Keep the message box ready for a follow-up (after it re-enables on the next render).
      setTimeout(() => inputRef.current?.focus(), 0);
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-coach-title"
      className="wk fixed inset-0 z-50 flex flex-col justify-end sm:items-center"
    >
      {/* Tapping the page behind closes the sheet. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 w-full h-full cursor-default ${expanded ? 'bg-black/90' : 'bg-black/45'}`}
      />
      <div
        className={`wk-sheet-up relative w-full sm:max-w-md bg-[var(--wk-bg)] border-t border-white/10 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden transition-[height,border-radius] duration-300 ${
          expanded ? 'h-full rounded-none' : 'rounded-t-[28px]'
        }`}
        style={expanded ? undefined : { height: conversationStarted ? 'min(72dvh, 620px)' : 'auto', maxHeight: '86dvh' }}
      >
        {/* Header: grab bar, title, expand and close */}
        <div className="relative px-[calc(38*var(--f))] pt-[calc(26*var(--f))] pb-[calc(16*var(--f))] flex items-center justify-between shrink-0">
          <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-white/25" />
          <div className="pt-[calc(16*var(--f))]">
            <h3 id="ai-coach-title" className="wk-label text-white">
              AI Coach
            </h3>
            <p className="wk-caption mt-[calc(4*var(--f))]">No chat history saved on any server</p>
          </div>
          <div className="flex items-center gap-[calc(8*var(--f))] pt-[calc(16*var(--f))]">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setExpanded((v) => !v);
              }}
              aria-label={expanded ? 'Shrink the coach to a sheet' : 'Expand the coach to full screen'}
              aria-pressed={expanded}
              className="w-11 h-11 min-h-[44px] rounded-full flex items-center justify-center text-[color:var(--wk-body)] hover:text-white transition-colors"
            >
              {expanded ? <Minimize2 className="w-5 h-5 stroke-[2]" /> : <Maximize2 className="w-5 h-5 stroke-[2]" />}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              aria-label="Close AI Coach"
              className="w-11 h-11 min-h-[44px] rounded-full flex items-center justify-center text-[color:var(--wk-body)] hover:text-white transition-colors"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className={`${expanded || conversationStarted ? 'flex-1' : ''} min-h-0 overflow-y-auto px-[calc(38*var(--f))] pt-[calc(8*var(--f))] pb-[calc(26*var(--f))] space-y-[calc(30*var(--f))] no-scrollbar overscroll-contain`}>
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            // Before anything is asked, the opening line stands on its own, large, like a headline.
            if (msg.id === 'msg-welcome' && !conversationStarted) {
              return (
                <p key={msg.id} className="text-white leading-snug px-[calc(8*var(--f))] pt-[calc(8*var(--f))]" style={{ fontSize: 'max(17px, calc(40 * var(--f)))' }}>
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
                  className={`max-w-[88%] rounded-[calc(30*var(--f))] p-[calc(38*var(--f))] text-[length:max(12px,calc(26*var(--f)))] leading-relaxed ${
                    isUser
                      ? 'bg-[var(--wk-raised)] text-white font-medium rounded-br-sm ring-1 ring-[#00F19F]/40'
                      : 'bg-[var(--wk-card)] text-[color:var(--wk-body)] rounded-bl-sm space-y-[calc(22*var(--f))]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{renderBold(msg.text)}</p>

                  {/* Assistant Action Badge if an action was taken */}
                  {!isUser && msg.actionApplied && (
                    <div className="mt-[calc(16*var(--f))] p-[calc(30*var(--f))] wk-raised space-y-[calc(16*var(--f))]">
                      <div className="flex items-start gap-[calc(16*var(--f))]">
                        <CheckCircle2 className="w-4 h-4 text-[color:var(--wk-accent)] stroke-[2] shrink-0 mt-[calc(4*var(--f))]" />
                        <div>
                          <div className="font-bold text-[length:max(12px,calc(26*var(--f)))] text-white">
                            {msg.actionApplied.type === 'UPDATE_GOALS' ? 'Goals updated' : 'Plan Updated'}
                          </div>
                          <div className="text-[length:max(12px,calc(26*var(--f)))] text-[color:var(--wk-accent)] font-medium mt-[calc(4*var(--f))]">
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
                          className="wk-button w-full mt-[calc(8*var(--f))] px-[calc(26*var(--f))] py-[calc(22*var(--f))] text-[length:max(12px,calc(26*var(--f)))] gap-[calc(12*var(--f))]"
                          style={{ background: 'var(--wk-accent)', color: '#13181C' }}
                        >
                          <Dumbbell className="w-3.5 h-3.5 stroke-[2]" />
                          <span>View All Equipment</span>
                          <ChevronRight className="w-3.5 h-3.5 stroke-[2]" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Scientific Principles & Academic Citations */}
                  {!isUser && msg.scientificPrinciplesCited && msg.scientificPrinciplesCited.length > 0 && (
                    <div className="pt-[calc(16*var(--f))] space-y-[calc(12*var(--f))]">
                      <span className="text-[length:max(12px,calc(26*var(--f)))] font-semibold text-[color:var(--wk-accent)] flex items-center gap-[calc(8*var(--f))]">
                        <FlaskConical className="w-3 h-3 text-[color:var(--wk-accent)] stroke-[2]" />
                        Scientific Rationale
                      </span>
                      <div className="space-y-[calc(8*var(--f))]">
                        {msg.scientificPrinciplesCited.map((sp) => (
                          <div
                            key={sp.id}
                            className="wk-raised p-[calc(26*var(--f))] text-[length:max(12px,calc(26*var(--f)))] space-y-[calc(8*var(--f))]"
                          >
                            <div className="font-bold text-white flex items-center justify-between">
                              <span>{sp.title}</span>
                              <span className="text-[length:max(12px,calc(26*var(--f)))] font-mono text-[color:var(--wk-accent)] font-normal">{sp.topic}</span>
                            </div>
                            {sp.formula && (
                              <div className="text-[color:var(--wk-accent)] font-mono text-[length:max(12px,calc(26*var(--f)))] overflow-x-auto no-scrollbar">
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
                    <div className="wk-caption pt-[calc(8*var(--f))]">
                      <span>{msg.timestamp}</span>
                    </div>
                  )}
                </div>

                {isUser && (
                  <span className="wk-caption mt-[calc(8*var(--f))] px-[calc(8*var(--f))]">
                    {msg.timestamp}
                  </span>
                )}
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex items-start">
              {streamingText ? (
                <div className="max-w-[85%] rounded-[calc(30*var(--f))] p-[calc(38*var(--f))] bg-[var(--wk-card)] text-[color:var(--wk-body)] rounded-bl-sm text-[length:max(12px,calc(26*var(--f)))] leading-relaxed whitespace-pre-wrap" aria-live="polite">
                  {renderBold(streamingText)}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-[calc(30*var(--f))] p-[calc(38*var(--f))] bg-[var(--wk-card)] text-[color:var(--wk-body)] rounded-bl-sm flex items-center space-x-[calc(22*var(--f))]" aria-live="polite">
                  <div className="w-2 h-2 rounded-full bg-[var(--wk-accent)] animate-ping" />
                  <span className="text-[length:max(12px,calc(26*var(--f)))] font-medium text-[color:var(--wk-body)]">
                    Thinking…
                  </span>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions for this screen */}
        <div className="px-[calc(38*var(--f))] pt-[calc(8*var(--f))] pb-[calc(26*var(--f))] overflow-x-auto no-scrollbar flex items-center gap-[calc(16*var(--f))] shrink-0" role="group" aria-label="Suggestions">
          {quickPrompts.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => useHook(q)}
              disabled={isProcessing}
              className="wk-pill shrink-0 min-h-[44px] transition-all active:scale-95 disabled:opacity-50"
              style={{ textTransform: 'none', color: '#fff' }}
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="px-[calc(30*var(--f))] pt-[calc(8*var(--f))] pb-[calc(30*var(--f))] sm:p-[calc(38*var(--f))] shrink-0 pb-safe sm:pb-[calc(38*var(--f))]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-[calc(16*var(--f))]"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              ref={inputRef}
              placeholder="Ask a question…"
              aria-label="Message your coach"
              disabled={isProcessing}
              autoComplete="off"
              autoCorrect="off"
              className="wk-field flex-1 min-h-[44px] px-[calc(38*var(--f))] py-[calc(22*var(--f))] text-[length:max(12px,calc(26*var(--f)))] placeholder-[#AAABAD]"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isProcessing}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-[calc(22*var(--f))] bg-[var(--wk-accent)] hover:opacity-90 disabled:opacity-30 text-[color:var(--wk-bg)] flex items-center justify-center transition-all active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
