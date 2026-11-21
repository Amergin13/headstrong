import React, { useState } from 'react';
import {
  EquipmentType,
  ExerciseDefinition,
  MuscleGroup,
  StrengthPillar,
} from '../../engine/types';
import { X, Check, Trash2 } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface CustomExerciseModalProps {
  existingExercise?: ExerciseDefinition;
  onAddExercise: (newEx: ExerciseDefinition) => void;
  onUpdateExercise?: (updatedEx: ExerciseDefinition) => void;
  onDeleteExercise?: (exerciseId: string) => void;
  onClose: () => void;
}

export const CustomExerciseModal: React.FC<CustomExerciseModalProps> = ({
  existingExercise,
  onAddExercise,
  onUpdateExercise,
  onDeleteExercise,
  onClose,
}) => {
  const isEditing = Boolean(existingExercise);
  const [name, setName] = useState(existingExercise?.name ?? '');
  const [pillar, setPillar] = useState<StrengthPillar>(existingExercise?.pillar ?? 'Horizontal Push');
  const [equipment, setEquipment] = useState<EquipmentType>(existingExercise?.equipment ?? 'barbell');
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>(existingExercise?.primaryMuscle ?? 'Chest');
  const [isRdl, setIsRdl] = useState(Boolean(existingExercise?.isRdl));
  const [isWeightedCalisthenic, setIsWeightedCalisthenic] = useState(
    Boolean(existingExercise?.isWeightedCalisthenic)
  );
  const [minReps, setMinReps] = useState(existingExercise?.defaultRepRange?.[0] ?? 8);
  const [maxReps, setMaxReps] = useState(existingExercise?.defaultRepRange?.[1] ?? 12);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    const safeMin = Math.max(1, Math.min(30, minReps || 8));
    const safeMax = Math.max(safeMin, Math.min(30, maxReps || 12));

    const exercisePayload: ExerciseDefinition = {
      ...(existingExercise ?? {}),
      id: existingExercise?.id ?? `custom-${Date.now()}`,
      name: name.trim(),
      pillar,
      equipment,
      primaryMuscle,
      isRdl,
      isWeightedCalisthenic: isWeightedCalisthenic || equipment === 'weighted_bodyweight',
      defaultRepRange: [safeMin, safeMax],
    };

    triggerHaptic('success');
    if (isEditing && onUpdateExercise) {
      onUpdateExercise(exercisePayload);
    } else {
      onAddExercise(exercisePayload);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Edit custom exercise' : 'Add custom exercise'}
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="wk-h1">{isEditing ? 'Edit custom exercise' : 'Add custom exercise'}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close custom exercise modal"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center shrink-0"
            style={{
              background: 'var(--wk-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="wk-meta-title block mb-2">Exercise name</label>
            <input
              type="text"
              required
              placeholder="e.g. Bulgarian Split Squat"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="wk-field"
            />
          </div>

          <div>
            <label className="wk-meta-title block mb-2">Movement group</label>
            <select
              value={pillar}
              onChange={(e) => setPillar(e.target.value as StrengthPillar)}
              className="wk-field"
            >
              {pillarOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="wk-meta-title block mb-2">Equipment</label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as EquipmentType)}
              className="wk-field"
            >
              {equipmentOptions.map((eq) => (
                <option key={eq.value} value={eq.value}>
                  {eq.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="wk-meta-title block mb-2">Main muscle worked</label>
            <select
              value={primaryMuscle}
              onChange={(e) => setPrimaryMuscle(e.target.value as MuscleGroup)}
              className="wk-field"
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
              <label className="wk-meta-title block mb-2">Min reps</label>
              <input
                type="number"
                min="1"
                max="30"
                value={minReps}
                onChange={(e) => setMinReps(parseInt(e.target.value, 10) || 8)}
                className="wk-input"
              />
            </div>
            <div>
              <label className="wk-meta-title block mb-2">Max reps</label>
              <input
                type="number"
                min="1"
                max="30"
                value={maxReps}
                onChange={(e) => setMaxReps(parseInt(e.target.value, 10) || 12)}
                className="wk-input"
              />
            </div>
          </div>

          {/* Exercise Options */}
          <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={isRdl}
                onChange={(e) => setIsRdl(e.target.checked)}
                className="rounded border-0 w-4 h-4 shrink-0"
                style={{ background: 'var(--wk-raised)', accentColor: 'var(--wk-accent)' }}
              />
              <span className="wk-body">
                Romanian Deadlift variation (adjusts target weight automatically)
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={isWeightedCalisthenic || equipment === 'weighted_bodyweight'}
                onChange={(e) => setIsWeightedCalisthenic(e.target.checked)}
                className="rounded border-0 w-4 h-4 shrink-0"
                style={{ background: 'var(--wk-raised)', accentColor: 'var(--wk-accent)' }}
              />
              <span className="wk-body">
                Bodyweight + extra weight (like weighted pull-ups or dips)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="wk-btn-secondary w-full min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="wk-button min-h-[44px] flex items-center justify-center gap-2 active:scale-95"
              style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
            >
              <Check className="w-4 h-4 stroke-[2]" />
              <span>{isEditing ? 'Save changes' : 'Save exercise'}</span>
            </button>
          </div>

          {isEditing && existingExercise && onDeleteExercise && (
            <div className="pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              {confirmingDelete ? (
                <div className="wk-raised flex flex-col gap-3">
                  <p className="wk-caption" style={{ color: 'var(--color-text-primary)' }}>
                    Delete {existingExercise.name} from your custom exercises? Past logged workouts remain intact.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="wk-btn-secondary min-h-[44px] w-full justify-center"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onDeleteExercise(existingExercise.id);
                        onClose();
                      }}
                      className="wk-button min-h-[44px] w-full flex items-center justify-center gap-1"
                      style={{
                        background: 'var(--color-status-danger-soft)',
                        color: 'var(--color-status-danger)',
                        border: '1px solid var(--color-status-danger)',
                      }}
                    >
                      <Trash2 className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                      <span>Confirm delete</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setConfirmingDelete(true);
                  }}
                  className="wk-btn-secondary min-h-[44px] w-full inline-flex items-center justify-center gap-2"
                  style={{ color: 'var(--color-status-danger)' }}
                >
                  <Trash2 className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                  <span>Delete exercise</span>
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
