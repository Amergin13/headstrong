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
      <div className="wk-card w-full max-w-sm shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Disc className="w-5 h-5" style={{ color: 'var(--wk-accent)' }} />
            <h3 className="wk-h1">
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
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Target Weight & Bar Weight Selector */}
        <div className="space-y-3">
          <div className="wk-raised flex items-center justify-between">
            <div>
              <span className="wk-caption uppercase block">
                Total Bar Load
              </span>
              <div className="flex items-baseline space-x-1.5 mt-0.5">
                <input
                  type="number"
                  step="0.5"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(parseFloat(e.target.value) || barWeight)}
                  className="w-24 bg-transparent tabular-numbers font-black text-xl text-white focus:outline-none"
                />
                <span className="wk-caption">{unit}</span>
              </div>
            </div>

            {/* Bar weight toggle */}
            <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--wk-card)' }}>
              {plateSet.bars.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setBarWeight(b);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs tabular-numbers font-bold transition-all"
                  style={{
                    background: barWeight === b ? 'var(--wk-pill)' : 'transparent',
                    color: barWeight === b ? '#fff' : 'var(--wk-muted)',
                  }}
                >
                  {b} {unit} bar
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Visual Barbell Collar & Plates */}
        <div className="wk-raised flex flex-col items-center justify-center min-h-[140px]">
          <span className="wk-caption uppercase mb-2">
            Plates per side ({Math.max(0, (targetWeight - barWeight) / 2)} {unit} each side)
          </span>

          {platesPerSide.length === 0 ? (
            <span className="wk-caption tabular-numbers py-6">Empty bar ({barWeight} {unit})</span>
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
            <span className="wk-caption mt-2" style={{ color: '#FFC83D' }}>
              {remainderKg} {unit} can't be made with standard plates.
            </span>
          )}
        </div>

        {/* Plate Counts Summary Grid */}
        <div className="space-y-2">
          <span className="wk-caption uppercase">
            Plate Checklist Per Side:
          </span>

          <div className="grid grid-cols-4 gap-2 text-xs">
            {availablePlates.map((plate) => {
              const count = platesPerSide.filter((p) => p === plate).length;
              if (count === 0) return null;
              return (
                <div
                  key={plate}
                  className="wk-raised text-center"
                >
                  <span className="wk-caption block">{plate} {unit}</span>
                  <span className="wk-label tabular-numbers block mt-0.5" style={{ color: 'var(--wk-accent)' }}>
                    × {count}
                  </span>
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
          className="wk-button transition-all active:scale-98"
          style={{ background: 'var(--wk-pill)', color: '#fff' }}
        >
          Close Calculator
        </button>
      </div>
    </div>
  );
};

