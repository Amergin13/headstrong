import React, { useState } from 'react';
import { X, Disc, Sliders } from 'lucide-react';
import { EquipmentInventory, TrainingLocation } from '../../engine/types';
import {
  STANDARD_BARS_BY_UNIT,
  STANDARD_PLATES_BY_UNIT,
  calculateBarbellPlatesForInventory,
  createDefaultEquipmentInventory,
} from '../../engine/equipmentInventory';
import { triggerHaptic } from '../../utils/haptics';
import { LB_PER_KG } from '../../utils/units';
import { useUnits } from '../../utils/unitsContext';

interface PlateCalculatorModalProps {
  initialWeightKg: number;
  location?: TrainingLocation;
  inventory?: EquipmentInventory;
  onSaveInventory?: (next: EquipmentInventory) => void;
  onClose: () => void;
}

export const PlateCalculatorModal: React.FC<PlateCalculatorModalProps> = ({
  initialWeightKg,
  location = 'gym',
  inventory,
  onSaveInventory,
  onClose,
}) => {
  const units = useUnits();
  const unit = units.unit;
  const standardPlates = STANDARD_PLATES_BY_UNIT[unit];
  const standardBars = STANDARD_BARS_BY_UNIT[unit];
  const effectiveLocation: 'gym' | 'home' = location === 'home' ? 'home' : 'gym';
  const baseInv =
    inventory && inventory.plateUnit === unit
      ? inventory
      : createDefaultEquipmentInventory(effectiveLocation, unit);

  const initialBarDisplay =
    Math.round((unit === 'lb' ? baseInv.barWeightKg * LB_PER_KG : baseInv.barWeightKg) * 2) / 2;

  // All values below are in the athlete's unit (kg or lb).
  const [targetWeight, setTargetWeight] = useState(units.toDisplay(initialWeightKg));
  const [barWeight, setBarWeight] = useState<number>(
    standardBars.includes(initialBarDisplay) ? initialBarDisplay : standardBars[0]
  );
  const [platePairs, setPlatePairs] = useState<Record<string, number>>(() => ({ ...baseInv.platePairs }));
  const [editingInventory, setEditingInventory] = useState(false);

  const availablePlates: number[] = [...standardPlates];

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

  const solved = calculateBarbellPlatesForInventory(targetWeight, barWeight, platePairs);
  const { platesPerSide, achievedTotal, remainderTotal, maxLoadableTotal } = solved;

  const persistInventory = (nextBar: number, nextPairs: Record<string, number>) => {
    if (!onSaveInventory) return;
    onSaveInventory({
      ...baseInv,
      barWeightKg: unit === 'lb' ? nextBar / LB_PER_KG : nextBar,
      plateUnit: unit,
      platePairs: nextPairs,
    });
  };

  const adjustPairCount = (plate: number, delta: number) => {
    triggerHaptic('light');
    const key = String(plate);
    const nextVal = Math.max(0, Math.min(12, (platePairs[key] ?? 0) + delta));
    const nextPairs = { ...platePairs, [key]: nextVal };
    setPlatePairs(nextPairs);
    persistInventory(barWeight, nextPairs);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Plate calculator"
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-sm max-h-[88vh] overflow-y-auto shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Disc className="w-5 h-5 shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
            <div className="min-w-0">
              <h3 className="wk-h1 truncate">Barbell plate calculator</h3>
              <p className="wk-caption">{effectiveLocation === 'home' ? 'Home' : 'Gym'} plate inventory · Max {maxLoadableTotal} {unit}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close plate calculator"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors border border-[var(--color-border-strong)] shrink-0"
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
              {standardBars.map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={barWeight === b}
                  onClick={() => {
                    triggerHaptic('light');
                    setBarWeight(b);
                    persistInventory(b, platePairs);
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
          <span className="wk-label mb-2 tabular-nums">
            Plates per side ({Math.max(0, Math.round(((achievedTotal - barWeight) / 2) * 100) / 100)} {unit} each side)
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

          {remainderTotal > 0 && (
            <span className="wk-caption mt-2 text-center tabular-nums" style={{ color: 'var(--color-status-warning)' }}>
              Closest loadable with your plates: {achievedTotal} {unit} (Δ {remainderTotal} {unit}).
            </span>
          )}
        </div>

        {/* Plate Counts Summary Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="wk-label">Plate checklist per side</span>
            {onSaveInventory && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setEditingInventory((v) => !v);
                }}
                aria-expanded={editingInventory}
                className="wk-btn-secondary min-h-[44px] gap-1"
              >
                <Sliders className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                <span>{editingInventory ? 'Done editing' : 'Edit my plates'}</span>
              </button>
            )}
          </div>

          {!editingInventory ? (
            <div className="grid grid-cols-4 gap-2 text-xs">
              {availablePlates.map((plate) => {
                const count = platesPerSide.filter((p) => p === plate).length;
                if (count === 0) return null;
                return (
                  <div key={plate} className="wk-raised text-center">
                    <span className="wk-caption block">{plate} {unit}</span>
                    <span className="wk-label tabular-numbers block mt-1" style={{ color: 'var(--color-text-primary)' }}>
                      × {count}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="wk-caption">
                Set how many pairs of each plate you have at {effectiveLocation === 'home' ? 'home' : 'the gym'}.
              </p>
              <div className="space-y-2">
                {availablePlates.map((plate) => {
                  const pairs = platePairs[String(plate)] ?? 0;
                  return (
                    <div key={plate} className="wk-raised flex items-center justify-between gap-2">
                      <span className="wk-subhead tabular-nums">
                        {plate} {unit}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustPairCount(plate, -1)}
                          aria-label={`Remove a pair of ${plate} ${unit} plates`}
                          className="wk-btn-secondary min-h-[44px] min-w-[44px] justify-center"
                        >
                          −
                        </button>
                        <span className="wk-subhead tabular-nums w-16 text-center">
                          {pairs} {pairs === 1 ? 'pair' : 'pairs'}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustPairCount(plate, 1)}
                          aria-label={`Add a pair of ${plate} ${unit} plates`}
                          className="wk-btn-secondary min-h-[44px] min-w-[44px] justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

