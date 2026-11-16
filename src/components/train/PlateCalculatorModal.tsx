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
  const plateColors: Record<number, { bg: string; border: string; text: string; height: number }> = {
    45: { bg: 'var(--color-bg-surface-control)', border: 'var(--color-border-strong)', text: 'var(--color-text-primary)', height: 96 },
    35: { bg: 'var(--color-bg-surface-raised)', border: 'var(--color-border-strong)', text: 'var(--color-text-primary)', height: 84 },
    25: { bg: 'var(--color-bg-surface-control)', border: 'var(--color-border-strong)', text: 'var(--color-text-primary)', height: 96 },
    20: { bg: 'var(--color-bg-surface-raised)', border: 'var(--color-border-strong)', text: 'var(--color-text-primary)', height: 96 },
    15: { bg: 'var(--color-bg-surface-raised)', border: 'var(--color-border-strong)', text: 'var(--color-text-primary)', height: 80 },
    10: { bg: 'var(--color-bg-surface)', border: 'var(--color-border-strong)', text: 'var(--color-text-primary)', height: 68 },
    5: { bg: 'var(--color-bg-surface-control)', border: 'var(--color-border-subtle)', text: 'var(--color-text-secondary)', height: 56 },
    2.5: { bg: 'var(--color-bg-surface-raised)', border: 'var(--color-border-subtle)', text: 'var(--color-text-secondary)', height: 48 },
    1.25: { bg: 'var(--color-bg-surface)', border: 'var(--color-border-subtle)', text: 'var(--color-text-muted)', height: 40 },
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Plate calculator"
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-sm shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Disc className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
            <h3 className="wk-h1">
              Barbell plate calculator
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close plate calculator"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors border border-[var(--color-border-strong)]"
            style={{ background: 'var(--wk-raised)', color: 'var(--color-text-secondary)' }}
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Target Weight & Bar Weight Selector */}
        <div className="space-y-3">
          <div className="wk-raised flex items-center justify-between gap-3">
            <div>
              <span className="wk-label block">
                Total bar load
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <input
                  type="number"
                  step="0.5"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(parseFloat(e.target.value) || barWeight)}
                  className="w-24 bg-transparent tabular-numbers font-semibold text-xl focus:outline-none"
                  style={{ color: 'var(--color-text-primary)' }}
                />
                <span className="wk-caption">{unit}</span>
              </div>
            </div>

            {/* Bar weight toggle */}
            <div className="wk-segments grid-cols-2">
              {plateSet.bars.map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={barWeight === b}
                  onClick={() => {
                    triggerHaptic('light');
                    setBarWeight(b);
                  }}
                  className={`wk-segment tabular-numbers ${barWeight === b ? 'is-active' : ''}`}
                >
                  {b} {unit} bar
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Visual Barbell Collar & Plates (Neutral Treise Slate + 4px steps) */}
        <div className="wk-raised flex flex-col items-center justify-center min-h-[144px]">
          <span className="wk-label mb-2">
            Plates per side ({Math.max(0, (targetWeight - barWeight) / 2)} {unit} each side)
          </span>

          {platesPerSide.length === 0 ? (
            <span className="wk-caption tabular-numbers py-6">Empty bar ({barWeight} {unit})</span>
          ) : (
            <div className="flex items-center gap-1 py-2 overflow-x-auto max-w-full">
              {/* Barbell Sleeve */}
              <div
                className="w-5 h-8 rounded-l shrink-0"
                style={{ background: 'var(--color-bg-surface-control)', borderRight: '2px solid var(--color-bg-canvas)' }}
              />

              {/* Plates Loaded onto sleeve */}
              {platesPerSide.map((weight, idx) => {
                const conf = plateColors[weight] || {
                  bg: 'var(--color-bg-surface-control)',
                  border: 'var(--color-border-strong)',
                  text: 'var(--color-text-primary)',
                  height: 64,
                };
                return (
                  <div
                    key={`${weight}-${idx}`}
                    className="w-7 rounded flex items-center justify-center shadow-lg transition-transform border"
                    style={{ height: conf.height, background: conf.bg, borderColor: conf.border, color: conf.text }}
                  >
                    <span className="text-xs tabular-numbers font-semibold rotate-90">
                      {weight}
                    </span>
                  </div>
                );
              })}

              {/* Barbell Collar Clamp */}
              <div
                className="w-3 h-6 rounded shrink-0 border"
                style={{ background: 'var(--color-bg-surface-control)', borderColor: 'var(--color-text-secondary)' }}
              />
            </div>
          )}

          {remainderKg > 0 && (
            <span className="wk-caption mt-2" style={{ color: 'var(--color-status-warning)' }}>
              {remainderKg} {unit} can&apos;t be made with standard plates.
            </span>
          )}
        </div>

        {/* Plate Counts Summary Grid */}
        <div className="space-y-2">
          <span className="wk-label">
            Plate checklist per side
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
                  <span className="wk-label tabular-numbers block mt-1" style={{ color: 'var(--color-text-primary)' }}>
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
          className="wk-button transition-all active:scale-[0.98]"
          style={{
            background: 'var(--color-action-secondary-bg)',
            color: 'var(--color-action-secondary-fg)',
            border: '1px solid var(--color-border-strong)',
          }}
        >
          Close calculator
        </button>
      </div>
    </div>
  );
};

