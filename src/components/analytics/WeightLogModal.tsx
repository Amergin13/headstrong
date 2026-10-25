import React, { useState } from 'react';
import { X, Ruler, Check } from 'lucide-react';
import { useUnits } from '../../utils/unitsContext';

export interface MeasurementEntry {
  bodyweightKg?: number;
  bodyFatPct?: number;
  waistCm?: number;
  chestCm?: number;
  armCm?: number;
  heightCm?: number;
}

interface WeightLogModalProps {
  currentWeight: number;
  currentEma: number;
  /** Height the athlete already entered (asked once). */
  heightCm?: number;
  onSave: (entry: MeasurementEntry) => void;
  onClose: () => void;
}

const CM_PER_IN = 2.54;

/** Logs today's weight and, optionally, body fat, tape measurements and height. */
export const WeightLogModal: React.FC<WeightLogModalProps> = ({ currentWeight, currentEma, heightCm, onSave, onClose }) => {
  const units = useUnits();
  const imperial = units.unit === 'lb';
  const lengthUnit = imperial ? 'in' : 'cm';
  const toCm = (v: number) => (imperial ? v * CM_PER_IN : v);
  const hasPrevious = currentWeight > 0;
  const [weightInput, setWeightInput] = useState(hasPrevious ? `${units.toDisplay(currentWeight)}` : '');
  const [bodyFat, setBodyFat] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [arm, setArm] = useState('');
  const [height, setHeight] = useState('');

  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const weightKg = num(weightInput) ? units.fromDisplay(num(weightInput)) : 0;
  const weightValid = weightKg === 0 || (weightKg > 30 && weightKg < 300);
  const bfValid = !bodyFat || (num(bodyFat) >= 3 && num(bodyFat) <= 60);
  const lengthValid = (s: string, min: number, max: number) => !s || (toCm(num(s)) >= min && toCm(num(s)) <= max);
  const valid =
    weightValid &&
    bfValid &&
    lengthValid(waist, 40, 200) &&
    lengthValid(chest, 50, 200) &&
    lengthValid(arm, 15, 70) &&
    lengthValid(height, 120, 230) &&
    (weightKg > 0 || num(bodyFat) > 0 || num(waist) > 0 || num(chest) > 0 || num(arm) > 0 || num(height) > 0);
  const previewEmaKg = currentEma > 0 && hasPrevious && weightKg > 0 ? weightKg * 0.25 + currentEma * 0.75 : weightKg;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const round = (v: number) => Math.round(v * 10) / 10;
    onSave({
      bodyweightKg: weightKg > 0 ? Math.round(weightKg * 100) / 100 : undefined,
      bodyFatPct: num(bodyFat) ? round(num(bodyFat)) : undefined,
      waistCm: num(waist) ? round(toCm(num(waist))) : undefined,
      chestCm: num(chest) ? round(toCm(num(chest))) : undefined,
      armCm: num(arm) ? round(toCm(num(arm))) : undefined,
      heightCm: num(height) ? round(toCm(num(height))) : undefined,
    });
    onClose();
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    unit: string,
    hint?: string,
    ok = true
  ) => (
    <label className="block">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-label={`${label} in ${unit}`}
          aria-invalid={!ok}
          className={`w-full py-2.5 px-3 pr-12 rounded-xl bg-[#13181C] text-white font-bold text-base focus:outline-none focus:ring-1 ${
            ok ? 'focus:ring-[#00F19F]' : 'ring-1 ring-rose-400'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">{unit}</span>
      </div>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl bg-[#2C3034] p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-[#00F19F] stroke-[2]" />
            <h3 className="font-bold text-base text-white">Log measurements</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close measurements"
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {field("Today's weight", weightInput, setWeightInput, units.unit, 'Morning, after the toilet, before eating', weightValid)}
          {weightKg > 0 && weightValid && (
            <p className="text-xs text-slate-400">
              New 7-day average: <strong className="text-white">{units.format(previewEmaKg)}</strong>. The average smooths out
              normal daily water changes.
            </p>
          )}
          {field('Body fat', bodyFat, setBodyFat, '%', 'Optional. Smart scale, calipers or scan, same method each time', bfValid)}
          {field('Waist', waist, setWaist, lengthUnit, 'Optional. At the belly button, relaxed, after breathing out', lengthValid(waist, 40, 200))}
          {field('Chest', chest, setChest, lengthUnit, 'Optional. Fullest part, relaxed', lengthValid(chest, 50, 200))}
          {field('Upper arm', arm, setArm, lengthUnit, 'Optional. Widest part, flexed', lengthValid(arm, 15, 70))}
          {!heightCm && field('Height', height, setHeight, lengthUnit, 'Asked once, for lean mass and waist ratios', lengthValid(height, 120, 230))}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="py-3 min-h-[44px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              aria-label="Save measurements"
              className="disabled:opacity-50 py-3 min-h-[44px] rounded-xl bg-[#00F19F] text-[#13181C] font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
