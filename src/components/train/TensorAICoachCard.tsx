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
}

export const TensorAICoachCard: React.FC<TensorAICoachCardProps> = ({
  insight,
  hardware,
  contextInput,
  onRefreshHardware,
}) => {
  const [showModal, setShowModal] = useState(false);

  const handleOpen = () => {
    triggerHaptic('light');
    setShowModal(true);
  };

  return (
    <>
      <div className="rounded-2xl bg-surface-card border border-white/[0.08] p-3.5 space-y-2.5 transition-all hover:border-brand-primary/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary">
              <Cpu className="w-3.5 h-3.5 stroke-[2]" />
            </div>
            <span className="text-xs font-bold text-white tracking-tight">
              On-Device AI Coach
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                hardware.isPixelDevice
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'bg-white/[0.06] border border-white/[0.1] text-slate-300'
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
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
            {insight.summary}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80 stroke-[2]" />
            {hardware.inferenceLatencyMs}ms • 100% On-Device
          </span>

          <button
            type="button"
            onClick={handleOpen}
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
            Consult AI Coach
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
