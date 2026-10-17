import React, { useState } from 'react';
import {
  EquipmentType,
  ExerciseDefinition,
  MuscleGroup,
  StrengthPillar,
} from '../../engine/types';
import { X, Check } from 'lucide-react';

interface CustomExerciseModalProps {
  onAddExercise: (newEx: ExerciseDefinition) => void;
  onClose: () => void;
}

export const CustomExerciseModal: React.FC<CustomExerciseModalProps> = ({
  onAddExercise,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [pillar, setPillar] = useState<StrengthPillar>('Horizontal Push');
  const [equipment, setEquipment] = useState<EquipmentType>('barbell');
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>('Chest');
  const [isRdl, setIsRdl] = useState(false);
  const [isWeightedCalisthenic, setIsWeightedCalisthenic] = useState(false);
  const [minReps, setMinReps] = useState(8);
  const [maxReps, setMaxReps] = useState(12);

  const pillarOptions: { value: StrengthPillar; label: string }[] = [
    { value: 'Horizontal Push', label: 'Chest Press' },
    { value: 'Vertical Push', label: 'Shoulder Press' },
    { value: 'Horizontal Pull', label: 'Back Row' },
    { value: 'Vertical Pull', label: 'Pull-Ups & Pulldown' },
    { value: 'Squat', label: 'Squat & Legs' },
    { value: 'Hinge', label: 'Deadlift & Hinge' },
  ];

  const equipmentOptions: { value: EquipmentType; label: string }[] = [
    { value: 'barbell', label: 'Barbell' },
    { value: 'dumbbell', label: 'Dumbbell' },
    { value: 'cable', label: 'Cable' },
    { value: 'machine', label: 'Machine' },
    { value: 'bodyweight', label: 'Bodyweight' },
    { value: 'weighted_bodyweight', label: 'Weighted Bodyweight' },
  ];

  const muscles: MuscleGroup[] = [
    'Chest',
    'Back',
    'Quads',
    'Hamstrings',
    'Glutes',
    'Shoulders',
    'Triceps',
    'Biceps',
    'Calves',
    'Core',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newEx: ExerciseDefinition = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      pillar,
      equipment,
      primaryMuscle,
      isRdl,
      isWeightedCalisthenic,
      defaultRepRange: [minReps, maxReps],
    };

    onAddExercise(newEx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl bg-surface-card border border-white/[0.12] p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-white">Add Custom Exercise</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="text-slate-300 font-semibold block mb-1">Exercise Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Bulgarian Split Squat"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl bg-surface-bg border border-white/[0.08] text-white font-medium focus:border-brand-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Movement Group</label>
            <select
              value={pillar}
              onChange={(e) => setPillar(e.target.value as StrengthPillar)}
              className="w-full py-2.5 px-3 rounded-xl bg-surface-bg border border-white/[0.08] text-white font-medium focus:border-brand-primary focus:outline-none"
            >
              {pillarOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Equipment</label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as EquipmentType)}
              className="w-full py-2.5 px-3 rounded-xl bg-surface-bg border border-white/[0.08] text-white font-medium focus:border-brand-primary focus:outline-none"
            >
              {equipmentOptions.map((eq) => (
                <option key={eq.value} value={eq.value}>
                  {eq.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Main Muscle Worked</label>
            <select
              value={primaryMuscle}
              onChange={(e) => setPrimaryMuscle(e.target.value as MuscleGroup)}
              className="w-full py-2.5 px-3 rounded-xl bg-surface-bg border border-white/[0.08] text-white font-medium focus:border-brand-primary focus:outline-none"
            >
              {muscles.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Min Reps</label>
              <input
                type="number"
                min="1"
                max="30"
                value={minReps}
                onChange={(e) => setMinReps(parseInt(e.target.value, 10) || 8)}
                className="w-full py-2.5 px-3 rounded-xl bg-surface-bg border border-white/[0.08] text-white font-mono font-bold focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Max Reps</label>
              <input
                type="number"
                min="1"
                max="30"
                value={maxReps}
                onChange={(e) => setMaxReps(parseInt(e.target.value, 10) || 12)}
                className="w-full py-2.5 px-3 rounded-xl bg-surface-bg border border-white/[0.08] text-white font-mono font-bold focus:border-brand-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Exercise Options */}
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRdl}
                onChange={(e) => setIsRdl(e.target.checked)}
                className="rounded bg-surface-bg border-white/[0.1] text-brand-primary focus:ring-0"
              />
              <span className="text-slate-300">
                Romanian Deadlift variation (adjusts target weight automatically)
              </span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isWeightedCalisthenic || equipment === 'weighted_bodyweight'}
                onChange={(e) => setIsWeightedCalisthenic(e.target.checked)}
                className="rounded bg-surface-bg border-white/[0.1] text-brand-primary focus:ring-0"
              />
              <span className="text-slate-300">
                Bodyweight + extra weight (like weighted pull-ups or dips)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 rounded-xl bg-surface-elevated text-slate-300 font-semibold text-xs hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="py-2.5 rounded-xl bg-brand-primary text-black font-bold text-xs hover:opacity-90 flex items-center justify-center space-x-1.5"
            >
              <Check className="w-4 h-4 stroke-[2]" />
              <span>Save Exercise</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
