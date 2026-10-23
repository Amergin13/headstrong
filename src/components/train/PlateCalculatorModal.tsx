import React, { useState } from 'react';
import { X, Disc, Sliders } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

// Standard plate sets and bars, in the athlete's unit.
const PLATE_SETS = {
  kg: { plates: [25, 20, 15, 10, 5, 2.5, 1.25], bars: [20, 15] },
  lb: { plates: [45, 35, 25, 10, 5, 2.5], bars: [45, 35] },
} as const;

interface PlateCalculatorModalProps {
  initialWeightKg: number;
  onClose: () => void;
}

export const PlateCalculatorModal: React.FC<PlateCalculatorModalProps> = ({
  initialWeightKg,
  onClose,
}) => {
  const units = useUnits();
  const unit = units.unit;
  const plateSet = PLATE_SETS[unit];
  // All values below are in the athlete's unit (kg or lb).
  const [targetWeight, setTargetWeight] = useState(units.toDisplay(initialWeightKg));
  const [barWeight, setBarWeight] = useState<number>(plateSet.bars[0]);
  const availablePlates: number[] = [...plateSet.plates];

  // Color mapping for standard Olympic bumper / competition plates
  const plateColors: Record<number, { bg: string; border: string; text: string; height: string }> = {
    45: { bg: 'bg-blue-600', border: 'border-blue-400', text: 'text-white', height: 'h-24' },
    35: { bg: 'bg-amber-500', border: 'border-amber-300', text: 'text-black', height: 'h-20' },
    25: { bg: 'bg-rose-600', border: 'border-rose-400', text: 'text-white', height: 'h-24' },
    20: { bg: 'bg-blue-600', border: 'border-blue-400', text: 'text-white', height: 'h-24' },
    15: { bg: 'bg-amber-500', border: 'border-amber-300', text: 'text-black', height: 'h-20' },
    10: { bg: 'bg-emerald-600', border: 'border-emerald-400', text: 'text-white', height: 'h-18' },
    5: { bg: 'bg-slate-200', border: 'border-slate-400', text: 'text-black', height: 'h-14' },
    2.5: { bg: 'bg-slate-800', border: 'border-slate-600', text: 'text-white', height: 'h-12' },
    1.25: { bg: 'bg-slate-600', border: 'border-slate-400', text: 'text-white', height: 'h-10' },
  };

  // Calculate plates per side (Greedy algorithm)
  const calculatePlatesPerSide = (totalKg: number, barKg: number, platePool: number[]) => {
    if (totalKg <= barKg) return { platesPerSide: [], remainderKg: 0 };

    let weightNeededPerSide = (totalKg - barKg) / 2;
    const sortedPool = [...platePool].sort((a, b) => b - a);
    const result: number[] = [];

    for (const plate of sortedPool) {
      while (weightNeededPerSide >= plate) {
        result.push(plate);
        weightNeededPerSide = Math.round((weightNeededPerSide - plate) * 100) / 100;
      }
    }

    return { platesPerSide: result, remainderKg: weightNeededPerSide * 2 };
  };

  const { platesPerSide, remainderKg } = calculatePlatesPerSide(targetWeight, barWeight, availablePlates);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl bg-[#0E1219] p-5 sm:p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Disc className="w-5 h-5 text-brand-primary" />
            <h3 className="font-extrabold text-base text-white tracking-tight">
              Barbell Plate Calculator
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close plate calculator"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Target Weight & Bar Weight Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#090C12]">
            <div>
              <span className="text-xs uppercase font-bold text-slate-400 tracking-wider block">
                Total Bar Load
              </span>
              <div className="flex items-baseline space-x-1.5 mt-0.5">
                <input
                  type="number"
                  step="0.5"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(parseFloat(e.target.value) || barWeight)}
                  className="w-24 bg-transparent font-mono font-black text-xl text-white focus:outline-none"
                />
                <span className="text-xs font-bold text-slate-400">{unit}</span>
              </div>
            </div>

            {/* Bar weight toggle */}
            <div className="flex bg-[#141824] p-1 rounded-xl">
              {plateSet.bars.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setBarWeight(b);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    barWeight === b
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {b} {unit} bar
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Visual Barbell Collar & Plates */}
        <div className="p-4 rounded-2xl bg-[#090C12] flex flex-col items-center justify-center min-h-[140px]">
          <span className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2">
            Plates per side ({Math.max(0, (targetWeight - barWeight) / 2)} {unit} each side)
          </span>

          {platesPerSide.length === 0 ? (
            <span className="text-xs font-mono text-slate-400 py-6">Empty bar ({barWeight} {unit})</span>
          ) : (
            <div className="flex items-center space-x-1 py-2 overflow-x-auto max-w-full">
              {/* Barbell Sleeve */}
              <div className="w-5 h-8 bg-slate-700 rounded-l-md border-r-2 border-slate-900 shrink-0" />

              {/* Plates Loaded onto sleeve */}
              {platesPerSide.map((weight, idx) => {
                const conf = plateColors[weight] || {
                  bg: 'bg-slate-700',
                  border: 'border-slate-500',
                  text: 'text-white',
                  height: 'h-16',
                };
                return (
                  <div
                    key={`${weight}-${idx}`}
                    className={`w-7 ${conf.height} ${conf.bg} border ${conf.border} rounded-sm flex items-center justify-center shadow-lg transition-transform`}
                  >
                    <span className={`text-xs font-mono font-bold rotate-90 ${conf.text}`}>
                      {weight}
                    </span>
                  </div>
                );
              })}

              {/* Barbell Collar Clamp */}
              <div className="w-2.5 h-6 bg-amber-400 rounded-sm shrink-0 border border-amber-300" />
            </div>
          )}

          {remainderKg > 0 && (
            <span className="text-xs font-mono text-amber-400 mt-2">
              {remainderKg} {unit} can't be made with standard plates.
            </span>
          )}
        </div>

        {/* Plate Counts Summary Grid */}
        <div className="space-y-1.5">
          <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
            Plate Checklist Per Side:
          </span>

          <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
            {availablePlates.map((plate) => {
              const count = platesPerSide.filter((p) => p === plate).length;
              if (count === 0) return null;
              return (
                <div
                  key={plate}
                  className="p-2.5 rounded-xl bg-[#141824] text-center"
                >
                  <span className="text-slate-400 text-xs block">{plate} {unit}</span>
                  <span className="font-black text-brand-primary text-sm">× {count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Done Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="w-full py-3 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-white transition-all active:scale-98 min-h-[44px]"
        >
          Close Calculator
        </button>
      </div>
    </div>
  );
};
