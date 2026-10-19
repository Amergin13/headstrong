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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl bg-[#0E1219] p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-white">Add Custom Exercise</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close custom exercise modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-slate-300 font-semibold block mb-1">Exercise Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Bulgarian Split Squat"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full py-3 px-3.5 rounded-xl bg-[#090C12] text-white font-medium focus:ring-1 focus:ring-brand-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Movement Group</label>
            <select
              value={pillar}
              onChange={(e) => setPillar(e.target.value as StrengthPillar)}
              className="w-full py-3 px-3.5 rounded-xl bg-[#090C12] text-white font-medium focus:ring-1 focus:ring-brand-primary focus:outline-none"
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
              className="w-full py-3 px-3.5 rounded-xl bg-[#090C12] text-white font-medium focus:ring-1 focus:ring-brand-primary focus:outline-none"
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
              className="w-full py-3 px-3.5 rounded-xl bg-[#090C12] text-white font-medium focus:ring-1 focus:ring-brand-primary focus:outline-none"
            >
              {muscles.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Min Reps</label>
              <input
                type="number"
                min="1"
                max="30"
                value={minReps}
                onChange={(e) => setMinReps(parseInt(e.target.value, 10) || 8)}
                className="w-full py-3 px-3.5 rounded-xl bg-[#090C12] text-white font-mono font-bold focus:ring-1 focus:ring-brand-primary focus:outline-none"
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
                className="w-full py-3 px-3.5 rounded-xl bg-[#090C12] text-white font-mono font-bold focus:ring-1 focus:ring-brand-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Exercise Options */}
          <div className="space-y-2.5 pt-2 border-t border-white/[0.04]">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isRdl}
                onChange={(e) => setIsRdl(e.target.checked)}
                className="rounded bg-[#090C12] border-0 text-brand-primary focus:ring-0 w-4 h-4"
              />
              <span className="text-slate-300">
                Romanian Deadlift variation (adjusts target weight automatically)
              </span>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isWeightedCalisthenic || equipment === 'weighted_bodyweight'}
                onChange={(e) => setIsWeightedCalisthenic(e.target.checked)}
                className="rounded bg-[#090C12] border-0 text-brand-primary focus:ring-0 w-4 h-4"
              />
              <span className="text-slate-300">
                Bodyweight + extra weight (like weighted pull-ups or dips)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-3 min-h-[44px] rounded-xl bg-[#141824] text-slate-300 font-semibold text-xs hover:bg-[#1C2233]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="py-3 min-h-[44px] rounded-xl bg-brand-primary text-black font-bold text-xs hover:opacity-90 flex items-center justify-center space-x-1.5"
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
