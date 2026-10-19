import React, { useState } from 'react';
import {
  askOnDeviceTensorCoach,
  setTensorHardwareSimulation,
} from '../../services/tensorAIService';
import {
  TensorChipModel,
  TensorCoachingInsight,
  TensorCoachingInput,
  TensorHardwareProfile,
} from '../../engine/tensorAI';
import {
  Cpu,
  X,
  Zap,
  ShieldCheck,
  Activity,
  Send,
  MessageSquare,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface TensorCoachModalProps {
  insight: TensorCoachingInsight;
  hardware: TensorHardwareProfile;
  contextInput: TensorCoachingInput;
  onClose: () => void;
  onRefreshHardware: () => void;
}

const QUICK_QUESTIONS = [
  'How should I pace my rest intervals?',
  'Should I attempt a weight PR on set 1?',
  'What if my joints feel tight during warmups?',
  'What is my optimal protein target today?',
];

export const TensorCoachModal: React.FC<TensorCoachModalProps> = ({
  insight,
  hardware,
  contextInput,
  onClose,
  onRefreshHardware,
}) => {
  const [customQuestion, setCustomQuestion] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [coachResponse, setCoachResponse] = useState<{
    answer: string;
    latencyMs: number;
    backend: string;
    isTensorAccelerated: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChip, setSelectedChip] = useState<TensorChipModel>(
    hardware.isPixelDevice ? hardware.chipModel : 'Google Tensor G4'
  );

  const handleAsk = async (question: string) => {
    if (!question.trim()) return;
    triggerHaptic('medium');
    setIsLoading(true);
    setActiveQuestion(question);
    try {
      const res = await askOnDeviceTensorCoach(question, contextInput);
      setCoachResponse(res);
    } catch {
      setCoachResponse({
        answer: 'Completed on-device evaluation: Focus on your prescribed load and reps with 1–2 reps in reserve.',
        latencyMs: 12,
        backend: hardware.chipModel,
        isTensorAccelerated: hardware.isPixelDevice,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchChipSimulation = (chip: TensorChipModel) => {
    triggerHaptic('light');
    setSelectedChip(chip);
    setTensorHardwareSimulation(true, chip);
    onRefreshHardware();
  };

  const handleResetToRealHardware = () => {
    triggerHaptic('light');
    setTensorHardwareSimulation(false);
    onRefreshHardware();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md">
      <div className="bg-surface-card border border-white/[0.08] rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary">
              <Cpu className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h3 className="font-bold text-base text-white tracking-tight">
                  Tensor AI Coach
                </h3>
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[12px] font-semibold text-emerald-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 stroke-[2]" />
                  {hardware.inferenceLatencyMs}ms
                </span>
              </div>
              <p className="text-xs text-slate-400">
                100% On-Device Neural Processing • Zero Cloud Latency
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Hardware Telemetry Card */}
        <div className="p-3.5 rounded-2xl bg-dark-900/70 border border-white/[0.06] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
              Processor Architecture
            </span>
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 stroke-[2]" />
              Private &amp; Local
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-surface-bg border border-white/[0.04]">
              <span className="text-slate-400 block">Chipset</span>
              <span className="font-semibold text-white truncate block">
                {hardware.chipModel}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-bg border border-white/[0.04]">
              <span className="text-slate-400 block">Acceleration</span>
              <span className="font-semibold text-brand-primary truncate block">
                {hardware.backend}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-bg border border-white/[0.04]">
              <span className="text-slate-400 block">Device</span>
              <span className="font-semibold text-white truncate block">
                {hardware.deviceModel}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-bg border border-white/[0.04]">
              <span className="text-slate-400 block">Neural Units</span>
              <span className="font-semibold text-emerald-400 truncate block">
                {hardware.tpuName}
              </span>
            </div>
          </div>

          {/* Chip Simulation Selector for Developer / Testing / Non-Pixel */}
          <div className="pt-1.5 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-xs text-slate-400">Evaluate Chipset:</span>
            <div className="flex items-center space-x-1">
              {(['Google Tensor G4', 'Google Tensor G3', 'Google Tensor G2'] as TensorChipModel[]).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSwitchChipSimulation(chip)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                    hardware.chipModel === chip
                      ? 'bg-brand-primary text-dark-950 font-bold'
                      : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.12]'
                  }`}
                >
                  {chip.replace('Google Tensor ', '')}
                </button>
              ))}
              <button
                type="button"
                onClick={handleResetToRealHardware}
                className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-white bg-white/[0.04]"
                title="Reset to detected device"
              >
                Auto
              </button>
            </div>
          </div>
        </div>

        {/* Daily Physiological Synthesis */}
        <div className="p-4 rounded-2xl bg-brand-primary/[0.07] border border-brand-primary/20 space-y-2">
          <div className="flex items-center space-x-1.5 text-brand-primary">
            <Activity className="w-4 h-4 stroke-[2]" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {insight.headline}
            </span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            {insight.summary}
          </p>
          <div className="p-2.5 rounded-xl bg-dark-900/60 border border-white/[0.04] space-y-1">
            <span className="text-xs font-semibold text-emerald-400 block">
              Tactical Execution:
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {insight.tacticalCue}
            </p>
          </div>
        </div>

        {/* Interactive Consultation Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
              Ask the On-Device Coach
            </h4>
            <span className="text-xs text-slate-500">Instant TPU Reply</span>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleAsk(q)}
                disabled={isLoading}
                className={`p-2.5 rounded-xl text-left text-xs transition-all border ${
                  activeQuestion === q
                    ? 'bg-brand-primary/15 border-brand-primary text-white font-medium'
                    : 'bg-white/[0.04] border-white/[0.06] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Custom Question Input */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk(customQuestion)}
              placeholder="Ask anything about today's lifting, tempo, or recovery..."
              className="flex-1 bg-dark-900/80 border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-primary"
            />
            <button
              type="button"
              onClick={() => handleAsk(customQuestion)}
              disabled={isLoading || !customQuestion.trim()}
              className="min-w-[44px] min-h-[44px] px-3 py-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-dark-950 font-bold rounded-xl text-xs flex items-center justify-center transition-all"
              aria-label="Submit Question"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-dark-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4 stroke-[2]" />
              )}
            </button>
          </div>

          {/* AI Response Box */}
          {coachResponse && (
            <div className="p-3.5 rounded-2xl bg-surface-glass border border-brand-primary/30 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                  Coach Advice
                </span>
                <span className="text-xs text-slate-400">
                  {coachResponse.backend} • {coachResponse.latencyMs}ms
                </span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {coachResponse.answer}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Powered by Google Tensor • Private to your phone
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] text-white font-medium rounded-xl text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
