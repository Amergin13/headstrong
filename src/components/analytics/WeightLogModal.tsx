import React, { useState } from 'react';
import { X, Scale, Check } from 'lucide-react';

interface WeightLogModalProps {
  currentWeight: number;
  currentEma: number;
  onSaveWeight: (weight: number) => void;
  onClose: () => void;
}

export const WeightLogModal: React.FC<WeightLogModalProps> = ({
  currentWeight,
  currentEma,
  onSaveWeight,
  onClose,
}) => {
  const [weightInput, setWeightInput] = useState(currentWeight.toString());
  const numWeight = parseFloat(weightInput) || currentWeight;
  const simulatedEma = Math.round((numWeight * 0.25 + currentEma * 0.75) * 100) / 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numWeight > 30 && numWeight < 300) {
      onSaveWeight(numWeight);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl bg-[#0E1219] p-5 sm:p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Scale className="w-5 h-5 text-brand-primary stroke-[2]" />
            <h3 className="font-bold text-base text-white">Log Today&apos;s Weight</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close weight log"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                autoFocus
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#090C12] text-white font-mono text-xl font-bold focus:ring-1 focus:ring-brand-primary focus:outline-none text-center"
              />
              <span className="absolute right-4 top-4 text-slate-400 font-bold text-sm">kg</span>
            </div>
          </div>

          {/* 7-Day Average preview */}
          <div className="p-4 rounded-2xl bg-[#090C12] text-xs space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Previous 7-Day Average</span>
              <span className="font-mono text-white font-semibold">{currentEma} kg</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>New 7-Day Average</span>
              <span className="font-mono font-bold text-brand-primary">{simulatedEma} kg</span>
            </div>
            <p className="text-xs text-slate-400 pt-1 leading-snug">
              We use a 7-day rolling average so normal daily water changes don&apos;t throw off your progress.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="py-3 min-h-[44px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="py-3 min-h-[44px] rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[2]" />
              <span>Save Weight</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
