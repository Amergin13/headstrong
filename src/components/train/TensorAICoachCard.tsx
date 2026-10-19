import React, { useState } from 'react';
import {
  TensorCoachingInsight,
  TensorCoachingInput,
  TensorHardwareProfile,
} from '../../engine/tensorAI';
import { TensorCoachModal } from './TensorCoachModal';
import { Cpu, Zap, MessageSquare, ShieldCheck, ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface TensorAICoachCardProps {
  insight: TensorCoachingInsight;
  hardware: TensorHardwareProfile;
  contextInput: TensorCoachingInput;
  onRefreshHardware: () => void;
  onOpenChat?: () => void;
}

export const TensorAICoachCard: React.FC<TensorAICoachCardProps> = ({
  insight,
  hardware,
  contextInput,
  onRefreshHardware,
  onOpenChat,
}) => {
  const [showModal, setShowModal] = useState(false);

  const handleOpen = () => {
    triggerHaptic('light');
    setShowModal(true);
  };

  return (
    <>
      <div className="biometric-card p-4 border border-white/[0.07] space-y-3 transition-all hover:border-brand-primary/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-strain/15 border border-brand-strain/35 flex items-center justify-center text-brand-strain">
              <Cpu className="w-4 h-4 stroke-[2]" />
            </div>
            <span className="text-xs font-extrabold text-white tracking-tight">
              On-Device AI Coach
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border ${
                hardware.isPixelDevice
                  ? 'bg-brand-primary/15 border-brand-primary/35 text-brand-primary'
                  : 'bg-white/[0.06] border-white/[0.1] text-slate-300'
              }`}
            >
              <Zap className="w-3 h-3 stroke-[2]" />
              {hardware.isPixelDevice ? `${hardware.chipModel.replace('Google ', '')} TPU` : 'On-Device Engine'}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-200">
            {insight.headline}
          </h4>
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-medium">
            {insight.summary}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
            {hardware.inferenceLatencyMs}ms • 100% On-Device
          </span>

          <button
            type="button"
            onClick={onOpenChat ? () => { triggerHaptic('light'); onOpenChat(); } : handleOpen}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl biometric-pill hover:bg-white/[0.12] text-xs font-bold text-slate-200 hover:text-white flex items-center gap-1.5 transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5 text-brand-strain stroke-[2]" />
            <span>Chat with AI Coach</span>
            <ChevronRight className="w-3 h-3 stroke-[2] text-slate-400" />
          </button>
        </div>
      </div>

      {showModal && (
        <TensorCoachModal
          insight={insight}
          hardware={hardware}
          contextInput={contextInput}
          onClose={() => setShowModal(false)}
          onRefreshHardware={onRefreshHardware}
        />
      )}
    </>
  );
};
