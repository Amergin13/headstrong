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
    const welcomeText = `Hey! I'm your On-Device AI Coach, running 100% locally on your phone. You're currently on Week ${
      profile.mesocycleWeek || 3
    } training ${activeWorkout.splitDay} Day (${activeWorkout.name}) in ${
      activeWorkout.location === 'travel'
        ? 'Travel mode'
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
      <div className="w-full max-w-md h-[92vh] max-h-[820px] rounded-3xl bg-surface-card border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] bg-surface-elevated/70 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary">
              <Cpu className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 id="ai-coach-title" className="font-bold text-sm text-white tracking-tight">
                  On-Device AI Coach
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                    hardware.isPixelDevice
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                      : 'bg-white/[0.06] border border-white/[0.1] text-slate-300'
                  }`}
                >
                  <Zap className="w-3 h-3 stroke-[2]" />
                  {hardware.isPixelDevice
                    ? `${hardware.chipModel.replace('Google ', '')} TPU`
                    : 'Local Engine'}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                <span>Zero Cloud APIs • 100% Private &amp; Local</span>
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
            className="w-11 h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Quick Suggestion Chips Carousel */}
        <div className="px-3.5 py-2.5 bg-black/30 border-b border-white/[0.04] overflow-x-auto no-scrollbar flex items-center gap-2">
          {quickPrompts.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => handleSendMessage(q.text)}
                disabled={isProcessing}
                className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-full bg-surface-elevated hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 transition-all disabled:opacity-50"
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
                  className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-brand-primary text-black font-medium rounded-br-sm shadow-md'
                      : 'bg-surface-elevated text-slate-200 border border-white/[0.08] rounded-bl-sm space-y-2.5'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Assistant Action Badge if an action was taken */}
                  {!isUser && msg.actionApplied && (
                    <div className="mt-2 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-start gap-2">
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
                  )}

                  {/* Knowledge Graph Citations */}
                  {!isUser && msg.knowledgeGraphCitations && msg.knowledgeGraphCitations.length > 0 && (
                    <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-brand-primary stroke-[2]" />
                        Knowledge Graph Grounding
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.knowledgeGraphCitations.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-xs text-slate-300 font-mono"
                          >
                            <span className="text-slate-400 font-sans">{c.label}:</span>
                            <span className="font-bold text-white">{c.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scientific Principles & Academic Citations */}
                  {!isUser && msg.scientificPrinciplesCited && msg.scientificPrinciplesCited.length > 0 && (
                    <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                      <span className="text-xs font-semibold text-brand-primary flex items-center gap-1">
                        <FlaskConical className="w-3 h-3 text-brand-primary stroke-[2]" />
                        Peer-Reviewed Science Grounding
                      </span>
                      <div className="space-y-1">
                        {msg.scientificPrinciplesCited.map((sp) => (
                          <div
                            key={sp.id}
                            className="p-2 rounded-xl bg-black/40 border border-brand-primary/20 text-xs space-y-1"
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

                  {/* Telemetry Footer for Assistant message */}
                  {!isUser && (
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                      <span>{msg.timestamp}</span>
                      {msg.latencyMs !== undefined && (
                        <span className="font-mono text-xs text-slate-400 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-emerald-400 stroke-[2]" />
                          {msg.latencyMs}ms • {msg.backend || 'Local'}
                        </span>
                      )}
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
              <div className="max-w-[85%] rounded-2xl p-3.5 bg-surface-elevated text-slate-300 border border-white/[0.08] rounded-bl-sm flex items-center space-x-2.5">
                <div className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
                <span className="text-xs font-medium text-slate-300">
                  Synthesizing on {hardware.isPixelDevice ? hardware.chipModel : 'device'}...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 border-t border-white/[0.08] bg-surface-elevated/70">
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
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-surface-bg border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-primary/60 transition-colors"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isProcessing}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-xl bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-40 text-black flex items-center justify-center transition-all active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4 stroke-[2]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
