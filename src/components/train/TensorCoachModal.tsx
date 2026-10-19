import React, { useState } from 'react';
import {
  askOnDeviceTensorCoach,
} from '../../services/tensorAIService';
import {
  TensorCoachingInsight,
  TensorCoachingInput,
  TensorHardwareProfile,
} from '../../engine/tensorAI';
import {
  X,
  Activity,
  Send,
  MessageSquare,
  CheckCircle2,
  Sparkles,
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
  contextInput,
  onClose,
}) => {
  const [customQuestion, setCustomQuestion] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [coachResponse, setCoachResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAsk = async (question: string) => {
    if (!question.trim()) return;
    triggerHaptic('medium');
    setIsLoading(true);
    setActiveQuestion(question);
    try {
      const res = await askOnDeviceTensorCoach(question, contextInput);
      setCoachResponse(res.answer);
    } catch {
      setCoachResponse(
        'Focus on your prescribed load and reps with 1–2 reps in reserve. Prioritize controlled eccentrics on every set.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#0E1219] rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.04] pb-3.5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/15 flex items-center justify-center text-brand-primary">
              <Sparkles className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight">
                AI Coach
              </h3>
              <p className="text-xs text-slate-400">
                Personalized advice for today&apos;s workout &amp; recovery
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Daily Physiological Guidance */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#090C12] space-y-3">
          <div className="flex items-center space-x-2 text-brand-primary">
            <Activity className="w-4 h-4 stroke-[2]" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {insight.headline}
            </span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            {insight.summary}
          </p>
          <div className="p-3.5 rounded-xl bg-[#141824] space-y-1">
            <span className="text-xs font-semibold text-emerald-400 block">
              Tactical Execution:
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {insight.tacticalCue}
            </p>
          </div>
        </div>

        {/* Interactive Consultation Section */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
              Ask a Question
            </h4>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleAsk(q)}
                disabled={isLoading}
                className={`p-3 rounded-xl text-left text-xs transition-all ${
                  activeQuestion === q
                    ? 'bg-brand-primary/20 text-white font-medium'
                    : 'bg-[#090C12] text-slate-300 hover:bg-[#141824] hover:text-white'
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
              className="flex-1 bg-[#090C12] rounded-xl px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
            <button
              type="button"
              onClick={() => handleAsk(customQuestion)}
              disabled={isLoading || !customQuestion.trim()}
              className="min-w-[44px] min-h-[44px] px-3.5 py-2.5 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-black font-bold rounded-xl text-xs flex items-center justify-center transition-all"
              aria-label="Submit Question"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4 stroke-[2]" />
              )}
            </button>
          </div>

          {/* AI Response Box */}
          {coachResponse && (
            <div className="p-4 rounded-2xl bg-[#141824] space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                  Coach Advice
                </span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {coachResponse}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/[0.04] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 min-h-[44px] bg-[#141824] hover:bg-[#1C2233] text-white font-semibold rounded-xl text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
