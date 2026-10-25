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
} from '../../services/gpuModel';

// Where Chrome doesn't expose Gemini Nano (Chrome on Android), the coach can use a model that
// runs on the phone's GPU once the athlete has chosen to download it.
import '../../services/deviceModels';

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
    },
    ...(firstLoadedExercise
      ? [
          {
            label: `${firstLoadedExercise.split(' ').slice(0, 2).join(' ')} target`,
            text: `What is my target weight and reps on ${firstLoadedExercise} today?`,
          },
        ]
      : []),
    {
      label: 'Warm-up plan',
      text: 'How should I warm up today?',
    },
    {
      label: "I'm travelling",
      text: "I'll be away travelling next week",
    },
    {
      label: 'Got a pull-up bar',
      text: 'I got a new pull-up bar for my home setup',
    },
    {
      label: 'How is my recovery?',
      text: 'How is my recovery looking?',
    },
    {
      label: 'Take a rest day',
      text: "I can't train today, take a rest day",
    },
    {
      label: 'Why 1.18x DB Multiplier?',
      text: 'Why does Treise use a 1.18x Dumbbell Multiplier?',
    },
    {
      label: 'How Does DOTS Work?',
      text: 'How does the official DOTS formula work?',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-coach-title"
      className="wk fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4 bg-black/90 sm:backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full sm:max-w-md h-full sm:h-[92vh] sm:max-h-[820px] rounded-none sm:rounded-3xl bg-[#13181C] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-[#2C3034] flex items-start justify-between">
          <div>
            <h3 id="ai-coach-title" className="wk-h1 text-white">
              AI Coach
            </h3>
            <p className="wk-caption mt-1">
              Your chats stay on this phone
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close AI Coach modal"
            className="w-11 h-11 min-h-[44px] rounded-full bg-[#3B4044] hover:bg-[#474D50] flex items-center justify-center text-[#C6C6C6] hover:text-white transition-colors"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Quick Suggestion Chips Carousel */}
        <div className="px-4 py-3 bg-[#13181C] border-b border-white/[0.06] overflow-x-auto no-scrollbar flex items-center gap-2">
          {quickPrompts.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => handleSendMessage(q.text)}
              disabled={isProcessing}
              className="wk-pill shrink-0 min-h-[44px] transition-all disabled:opacity-50"
            >
              <span>{q.label}</span>
            </button>
          ))}
        </div>

        {/* Message Thread */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 no-scrollbar overscroll-contain">
          {deviceCoach !== 'hidden' && (
            <div className="wk-card space-y-2.5" aria-live="polite">
              {deviceCoach === 'offer' && (
                <>
                  <p className="wk-h1 text-white">Get smarter answers on this phone</p>
                  <p className="wk-body leading-relaxed">
                    A one-time download ({GPU_MODEL_DOWNLOAD_LABEL}) lets your coach write full answers right on your
                    phone, even offline. Your chats never leave it. Use Wi-Fi.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadDeviceCoach}
                      className="wk-button flex-1 text-xs"
                      style={{ background: 'var(--wk-accent)', color: '#13181C' }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dismissGpuModelOffer();
                        setDeviceCoach('hidden');
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-[#3B4044] text-[#C6C6C6] text-xs font-semibold"
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
                    className="wk-bar bg-[#3B4044]"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(deviceCoachProgress * 100)}
                    aria-label="Coach download progress"
                  >
                    <span style={{ width: `${Math.round(deviceCoachProgress * 100)}%` }} />
                  </div>
                  <p className="wk-caption">You can keep chatting while this finishes.</p>
                </>
              )}
              {deviceCoach === 'ready' && (
                <p className="text-xs text-[#00F19F] font-semibold">Done. Your coach now answers fully on this phone.</p>
              )}
              {deviceCoach === 'error' && (
                <div className="flex items-center justify-between gap-2">
                  <p className="wk-body">The download didn't finish. Check your connection and try again.</p>
                  <button
                    type="button"
                    onClick={handleDownloadDeviceCoach}
                    className="min-h-[44px] px-3 rounded-xl bg-[#3B4044] text-white text-xs font-bold shrink-0"
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
                      ? 'bg-[#3B4044] text-white font-medium rounded-br-sm ring-1 ring-[#00F19F]/40'
                      : 'bg-[#2C3034] text-[#C6C6C6] rounded-bl-sm space-y-2.5'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{renderBold(msg.text)}</p>

                  {/* Assistant Action Badge if an action was taken */}
                  {!isUser && msg.actionApplied && (
                    <div className="mt-2 p-3.5 wk-raised space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#00F19F] stroke-[2] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-xs text-white">
                            Plan Updated
                          </div>
                          <div className="text-xs text-[#00F19F] font-medium mt-0.5">
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
                          className="wk-button w-full mt-1 px-3 py-2.5 text-xs gap-1.5"
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
                    <div className="pt-2 space-y-1.5">
                      <span className="text-xs font-semibold text-[#00F19F] flex items-center gap-1">
                        <FlaskConical className="w-3 h-3 text-[#00F19F] stroke-[2]" />
                        Scientific Rationale
                      </span>
                      <div className="space-y-1">
                        {msg.scientificPrinciplesCited.map((sp) => (
                          <div
                            key={sp.id}
                            className="wk-raised p-3 text-xs space-y-1"
                          >
                            <div className="font-bold text-white flex items-center justify-between">
                              <span>{sp.title}</span>
                              <span className="text-xs font-mono text-[#00F19F] font-normal">{sp.topic}</span>
                            </div>
                            {sp.formula && (
                              <div className="text-[#00F19F] font-mono text-xs overflow-x-auto no-scrollbar">
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
                    <div className="wk-caption pt-1">
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
                <div className="max-w-[85%] rounded-2xl p-4 bg-[#2C3034] text-[#C6C6C6] rounded-bl-sm text-xs leading-relaxed whitespace-pre-wrap" aria-live="polite">
                  {renderBold(streamingText)}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl p-4 bg-[#2C3034] text-[#C6C6C6] rounded-bl-sm flex items-center space-x-2.5" aria-live="polite">
                  <div className="w-2 h-2 rounded-full bg-[#00F19F] animate-ping" />
                  <span className="text-xs font-medium text-[#C6C6C6]">
                    Thinking…
                  </span>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 sm:p-4 bg-[#2C3034] border-t border-white/[0.06] shrink-0 pb-safe sm:pb-4">
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
              className="wk-field flex-1 min-h-[44px] px-4 py-2.5 text-xs placeholder-[#AAABAD]"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isProcessing}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-xl bg-[#00F19F] hover:opacity-90 disabled:opacity-30 text-[#13181C] flex items-center justify-center transition-all active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
