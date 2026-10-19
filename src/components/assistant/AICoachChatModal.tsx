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
import { getTensorHardwareProfile } from '../../services/tensorAIService';
import { TensorHardwareProfile } from '../../engine/tensorAI';
import { triggerHaptic } from '../../utils/haptics';
import {
  Cpu,
  Zap,
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
  const [hardware, setHardware] = useState<TensorHardwareProfile>({
    isPixelDevice: false,
    chipModel: 'Generic / Standard',
    backend: 'WASM SIMD Neural Engine',
    deviceModel: 'Local Device',
    inferenceLatencyMs: 8,
    isHardwareAccelerated: false,
    isOnDevicePrivate: true,
    tpuCores: 0,
    tpuName: 'CPU Engine',
    architectureDetails: 'Standard on-device local computation (Privacy Preserved)',
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize hardware profile & starter greeting
  useEffect(() => {
    let isMounted = true;
    getTensorHardwareProfile().then((hw) => {
      if (isMounted) setHardware(hw);
    });

    // Initial contextual welcome message
    const welcomeText = `Hey! I'm your AI Coach. You're currently on Week ${
      profile.mesocycleWeek || 3
    } training ${activeWorkout.splitDay} Day (${activeWorkout.name}) in ${
      activeWorkout.location === 'travel'
        ? 'Bodyweight mode'
        : activeWorkout.location === 'home'
        ? 'At Home'
        : 'Gym'
    }. You can ask me to adapt your plan for upcoming travel, register new home equipment, switch your split, or analyze your joints and recovery.`;

    const starterMessage: AssistantChatMessage = {
      id: 'msg-welcome',
      sender: 'assistant',
      text: welcomeText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      backend: 'On-Device Engine',
      latencyMs: 4,
      isTensorAccelerated: false,
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
        text: 'Sorry, I encountered an issue analyzing that request locally. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const quickPrompts = [
    {
      label: 'Away in Week 5',
      text: "I'll be away with work during week 5 of my program",
      icon: Plane,
    },
    {
      label: 'Got a Pull-Up Bar',
      text: 'I got a new pull-up bar for my home setup',
      icon: Dumbbell,
    },
    {
      label: 'Check Shoulder Strain',
      text: 'How is my shoulder recovery and joint load looking?',
      icon: ShieldCheck,
    },
    {
      label: 'Why 1.18x DB Multiplier?',
      text: 'Why does dumbbell bench press use a 1.18x multiplier?',
      icon: FlaskConical,
    },
    {
      label: 'How Does DOTS Work?',
      text: 'What is the formula and rationale for the DOTS score?',
      icon: FlaskConical,
    },
    {
      label: 'Switch to Upper/Lower',
      text: 'Switch my program split to Upper / Lower',
      icon: Layers,
    },
    {
      label: 'Take a Rest Day',
      text: "I can't train today, log a rest day and shift my workout",
      icon: Calendar,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-coach-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md h-[92vh] max-h-[820px] rounded-3xl bg-[#0E1219] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#141824] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/15 flex items-center justify-center text-brand-primary">
              <Cpu className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 id="ai-coach-title" className="font-bold text-sm text-white tracking-tight">
                  AI Coach
                </h3>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                <span>Private &amp; Personalized</span>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar">
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
                  <p className="whitespace-pre-wrap">{msg.text}</p>

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

                  {/* Message Timestamp */}
                  {!isUser && (
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
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
              <div className="max-w-[85%] rounded-2xl p-4 bg-[#141824] text-slate-300 rounded-bl-sm flex items-center space-x-2.5">
                <div className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
                <span className="text-xs font-medium text-slate-300">
                  Thinking...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-[#141824]">
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
              placeholder="Ask anything or modify your plan..."
              disabled={isProcessing}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#090C12] text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-primary transition-colors"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isProcessing}
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
