import React, { useState, useRef, useEffect } from 'react';
import {
  AssistantChatMessage,
  BiometricLog,
  ExerciseDefinition,
  ReadinessState,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import { buildCoachSystemPrompt, processAssistantMessage } from '../../services/aiAssistantService';
import {
  getOnDeviceModelStatus,
  prepareOnDeviceModel,
  registerFallbackOnDeviceModel,
  warmUpOnDeviceModel,
} from '../../services/onDeviceModel';
import {
  dismissGpuModelOffer,
  getGpuModelId,
  GPU_MODEL_DOWNLOAD_LABEL,
  isGpuModelOfferDismissed,
  isGpuModelReady,
  loadGpuModel,
  primeGpuModel,
  promptGpuModel,
} from '../../services/gpuModel';

// Where Chrome doesn't expose Gemini Nano (Chrome on Android), the coach can use a model that
// runs on the phone's GPU once the athlete has chosen to download it.
registerFallbackOnDeviceModel({ isReady: isGpuModelReady, prompt: promptGpuModel });

type DeviceCoachOffer = 'hidden' | 'offer' | 'downloading' | 'ready' | 'error';
import { triggerHaptic } from '../../utils/haptics';
import {
  ShieldCheck,
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
  onClose,
  onApplyAction,
  onViewAllEquipment,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [deviceCoach, setDeviceCoach] = useState<DeviceCoachOffer>('hidden');
  const coachContext = () => ({
    userMessage: '',
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume,
  });
  const [deviceCoachProgress, setDeviceCoachProgress] = useState(0);

  // Offer the on-device GPU model only where Gemini Nano isn't available and the phone can run it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if ((await getOnDeviceModelStatus()) === 'available') return;
      if (await isGpuModelReady()) {
        // Load the model and read the coach instructions while the athlete reads and types.
        loadGpuModel()
          .then(() => primeGpuModel(buildCoachSystemPrompt(coachContext())))
          .catch(() => undefined);
        return;
      }
      if (isGpuModelOfferDismissed() || !(await getGpuModelId())) return;
      if (!cancelled) setDeviceCoach('offer');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownloadDeviceCoach = () => {
    triggerHaptic('medium');
    setDeviceCoach('downloading');
    setDeviceCoachProgress(0);
    loadGpuModel((fraction) => setDeviceCoachProgress(fraction))
      .then(() => {
        setDeviceCoach('ready');
        triggerHaptic('success');
        primeGpuModel(buildCoachSystemPrompt(coachContext())).catch(() => undefined);
      })
      .catch((err) => {
        console.warn('On-device coach download failed:', err);
        setDeviceCoach('error');
      });
  };

  // Starter greeting
  useEffect(() => {
    let isMounted = true;
    // Load the on-device model while the athlete reads the greeting (no-op if unsupported).
    warmUpOnDeviceModel().catch(() => undefined);

    // Initial contextual welcome message
    const welcomeText = `Hey! I'm your AI Coach. You're on week ${
      profile.mesocycleWeek || 1
    } of 6, and up next is ${activeWorkout?.name || 'your workout'} (${
      activeWorkout?.location === 'travel'
        ? 'Bodyweight mode'
        : activeWorkout?.location === 'home'
        ? 'At Home'
        : 'gym'
    }). Ask me about today's weights, swapping an exercise, travelling, new home equipment, or how your recovery looks.`;

    const starterMessage: AssistantChatMessage = {
      id: 'msg-welcome',
      sender: 'assistant',
      text: welcomeText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([starterMessage]);

    return () => {
      isMounted = false;
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

  // Athlete-focused shortcuts, built from today's actual workout.
  const firstLoadedExercise = activeWorkout?.exercises.find((e) => e.equipment !== 'bodyweight')?.name;
  const quickPrompts = [
    {
      label: "Today's briefing",
      text: "Give me a briefing for today's workout and targets",
      icon: Sparkles,
    },
    ...(firstLoadedExercise
      ? [
          {
            label: `${firstLoadedExercise.split(' ').slice(0, 2).join(' ')} target`,
            text: `What is my target weight and reps on ${firstLoadedExercise} today?`,
            icon: Dumbbell,
          },
        ]
      : []),
    {
      label: 'Warm-up plan',
      text: 'How should I warm up today?',
      icon: Dumbbell,
    },
    {
      label: "I'm travelling",
      text: "I'll be away travelling next week",
      icon: Plane,
    },
    {
      label: 'Got a pull-up bar',
      text: 'I got a new pull-up bar for my home setup',
      icon: Dumbbell,
    },
    {
      label: 'How is my recovery?',
      text: 'How is my recovery looking?',
      icon: ShieldCheck,
    },
    {
      label: 'Take a rest day',
      text: "I can't train today, take a rest day",
      icon: Layers,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-coach-title"
      className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4 bg-black/90 sm:backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full sm:max-w-md h-full sm:h-[92vh] sm:max-h-[820px] rounded-none sm:rounded-3xl bg-[#0E1219] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#141824] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-brand-primary/15 text-brand-primary">
              <Sparkles className="w-5 h-5 stroke-[2]" aria-hidden="true" />
            </div>
            <div>
              <h3 id="ai-coach-title" className="font-bold text-sm text-white tracking-tight">
                AI Coach
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" aria-hidden="true" />
                <span>Your chats stay on this phone</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close AI Coach modal"
            className="w-11 h-11 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Quick Suggestion Chips Carousel */}
        <div className="px-4 py-3 bg-[#090C12] overflow-x-auto no-scrollbar flex items-center gap-2">
          {quickPrompts.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => handleSendMessage(q.text)}
                disabled={isProcessing}
                className="shrink-0 min-h-[44px] px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Icon className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
                <span>{q.label}</span>
              </button>
            );
          })}
        </div>

        {/* Message Thread */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 no-scrollbar overscroll-contain">
          {deviceCoach !== 'hidden' && (
            <div className="p-4 rounded-2xl bg-[#141824] border border-brand-primary/20 space-y-2.5" aria-live="polite">
              {deviceCoach === 'offer' && (
                <>
                  <p className="text-xs font-bold text-white">Get smarter answers on this phone</p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    A one-time download ({GPU_MODEL_DOWNLOAD_LABEL}) lets your coach write full answers right on your
                    phone, even offline. Your chats never leave it. Use Wi-Fi.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadDeviceCoach}
                      className="flex-1 min-h-[44px] rounded-xl bg-white text-slate-950 text-xs font-bold"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dismissGpuModelOffer();
                        setDeviceCoach('hidden');
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-white/[0.06] text-slate-300 text-xs font-semibold"
                    >
                      Not now
                    </button>
                  </div>
                </>
              )}
              {deviceCoach === 'downloading' && (
                <>
                  <p className="text-xs font-bold text-white">
                    Downloading… {Math.round(deviceCoachProgress * 100)}%
                  </p>
                  <div
                    className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(deviceCoachProgress * 100)}
                    aria-label="Coach download progress"
                  >
                    <div className="h-full bg-brand-primary rounded-full" style={{ width: `${Math.round(deviceCoachProgress * 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400">You can keep chatting while this finishes.</p>
                </>
              )}
              {deviceCoach === 'ready' && (
                <p className="text-xs text-brand-primary font-semibold">Done. Your coach now answers fully on this phone.</p>
              )}
              {deviceCoach === 'error' && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-300">The download didn't finish. Check your connection and try again.</p>
                  <button
                    type="button"
                    onClick={handleDownloadDeviceCoach}
                    className="min-h-[44px] px-3 rounded-xl bg-white/[0.08] text-white text-xs font-bold shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-4 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-white/[0.14] text-white font-medium rounded-br-sm shadow-md'
                      : 'bg-[#141824] text-slate-200 rounded-bl-sm space-y-2.5'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{renderBold(msg.text)}</p>

                  {/* Assistant Action Badge if an action was taken */}
                  {!isUser && msg.actionApplied && (
                    <div className="mt-2 p-3.5 rounded-2xl bg-emerald-500/15 text-emerald-300 space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[2] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-xs text-white">
                            Plan Updated
                          </div>
                          <div className="text-xs text-emerald-300 font-medium mt-0.5">
                            {msg.actionApplied.summary}
                          </div>
                        </div>
                      </div>

                      {/* Actionable CTA when equipment is added or updated */}
                      {(msg.actionApplied.type === 'UPDATE_EQUIPMENT' ||
                        msg.actionApplied.summary?.toLowerCase().includes('equipment') ||
                        msg.actionApplied.summary?.toLowerCase().includes('bar') ||
                        msg.actionApplied.summary?.toLowerCase().includes('pullup') ||
                        msg.actionApplied.summary?.toLowerCase().includes('pull_up')) && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            if (onViewAllEquipment) {
                              onViewAllEquipment();
                            }
                          }}
                          className="w-full mt-1 px-3 py-2.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 text-white text-xs font-bold min-h-[44px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                        >
                          <Dumbbell className="w-3.5 h-3.5 text-emerald-300 stroke-[2]" />
                          <span>View All Equipment</span>
                          <ChevronRight className="w-3.5 h-3.5 text-emerald-200 stroke-[2]" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Scientific Principles & Academic Citations */}
                  {!isUser && msg.scientificPrinciplesCited && msg.scientificPrinciplesCited.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <span className="text-xs font-semibold text-brand-primary flex items-center gap-1">
                        <FlaskConical className="w-3 h-3 text-brand-primary stroke-[2]" />
                        Scientific Rationale
                      </span>
                      <div className="space-y-1">
                        {msg.scientificPrinciplesCited.map((sp) => (
                          <div
                            key={sp.id}
                            className="p-3 rounded-xl bg-[#090C12] text-xs space-y-1"
                          >
                            <div className="font-bold text-white flex items-center justify-between">
                              <span>{sp.title}</span>
                              <span className="text-xs font-mono text-brand-primary font-normal">{sp.topic}</span>
                            </div>
                            {sp.formula && (
                              <div className="text-brand-primary font-mono text-xs overflow-x-auto no-scrollbar">
                                {sp.formula}
                              </div>
                            )}
                            <div className="text-slate-400 text-xs italic">
                              {sp.academicCitation}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isUser && (
                    <div className="text-xs text-slate-400 pt-1">
                      <span>{msg.timestamp}</span>
                    </div>
                  )}
                </div>

                {isUser && (
                  <span className="text-xs text-slate-400 mt-1 px-1">
                    {msg.timestamp}
                  </span>
                )}
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex items-start">
              {streamingText ? (
                <div className="max-w-[85%] rounded-2xl p-4 bg-[#141824] text-slate-200 rounded-bl-sm text-xs leading-relaxed whitespace-pre-wrap" aria-live="polite">
                  {renderBold(streamingText)}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl p-4 bg-[#141824] text-slate-300 rounded-bl-sm flex items-center space-x-2.5" aria-live="polite">
                  <div className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
                  <span className="text-xs font-medium text-slate-300">
                    Thinking…
                  </span>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 sm:p-4 bg-[#141824] border-t border-white/[0.06] shrink-0 pb-safe sm:pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              ref={inputRef}
              placeholder="Ask anything or modify your plan..."
              disabled={isProcessing}
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#090C12] text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-primary transition-colors"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isProcessing}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-950 flex items-center justify-center transition-all active:scale-95 shrink-0 shadow-sm"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
