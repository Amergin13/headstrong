import React, { useState } from 'react';
import {
  ExerciseDefinition,
  ExerciseSession,
  HomeEquipmentTag,
  TrainingLocation,
} from '../../engine/types';
import {
  translateWeightBetweenImplements,
  formatImplementWeightLabel,
} from '../../engine/e1rm';
import {
  canPerformExerciseInLocation,
  getMovementFamilyLabel,
  getMovementVectorId,
} from '../../engine/progression';
import { X, ArrowRightLeft } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

interface ExerciseSwapModalProps {
  currentExercise: ExerciseSession;
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  activeLocation?: TrainingLocation;
  homeEquipment?: HomeEquipmentTag[];
  onConfirmSwap: (newExerciseDef: ExerciseDefinition, convertedWeightKg: number) => void;
  onClose: () => void;
  /** Exercise IDs already in today's workout (not offered again). */
  excludeExerciseIds?: string[];
}

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  weighted_bodyweight: 'Weighted Bodyweight',
};

const HOME_TAG_LABELS: Record<HomeEquipmentTag, string> = {
  bench: 'Bench',
  dumbbells: 'Dumbbells',
  trx: 'TRX',
  pullup_bar: 'Pull-Up Bar',
  bands: 'Bands',
};

export const ExerciseSwapModal: React.FC<ExerciseSwapModalProps> = ({
  currentExercise,
  exerciseCatalog,
  bodyweightEmaKg,
  activeLocation = 'gym',
  homeEquipment = ['bench', 'dumbbells', 'trx', 'pullup_bar'],
  onConfirmSwap,
  onClose,
  excludeExerciseIds = [],
}) => {
  const units = useUnits();
  const [selectedLocation, setSelectedLocation] = useState<TrainingLocation>(activeLocation);

  const currentWeight =
    currentExercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.targetWeightKg ??
    currentExercise.sets[0]?.targetWeightKg ??
    20;

  const currentDef = exerciseCatalog.find((e) => e.id === currentExercise.exerciseId);
  const targetVectorId = getMovementVectorId(currentDef || currentExercise);
  const familyLabel = getMovementFamilyLabel(currentDef || currentExercise);

  // Strictly match exercises in the exact same Biomechanical Movement Family (never mix compounds with core/isolations)
  // Strictly filter by selected training environment so gym barbell/cables NEVER appear in Travel
  const alternatives = exerciseCatalog
    .filter((ex) => {
      if (ex.id === currentExercise.exerciseId || excludeExerciseIds.includes(ex.id)) return false;
      if (getMovementVectorId(ex) !== targetVectorId) return false;
      return canPerformExerciseInLocation(ex, selectedLocation, homeEquipment);
    })
    .sort((a, b) => {
      const aPureBw = (!a.requiredHomeEquipment || a.requiredHomeEquipment.length === 0) ? 1 : 0;
      const bPureBw = (!b.requiredHomeEquipment || b.requiredHomeEquipment.length === 0) ? 1 : 0;
      return bPureBw - aPureBw;
    });

  const computeConvertedWeight = (targetDef: ExerciseDefinition): number => {
    const isPureBw =
      selectedLocation === 'travel' ||
      (targetDef.equipment === 'bodyweight' && !targetDef.isWeightedCalisthenic);
    if (isPureBw) return 0;

    return translateWeightBetweenImplements(
      currentWeight,
      {
        equipment: currentExercise.equipment,
        isRdl: currentExercise.isRdl,
        isWeightedCalisthenic: currentExercise.isWeightedCalisthenic,
        exerciseId: currentExercise.exerciseId,
        pillar: currentExercise.pillar,
      },
      {
        equipment: targetDef.equipment,
        isRdl: targetDef.isRdl,
        isWeightedCalisthenic: targetDef.isWeightedCalisthenic,
        exerciseId: targetDef.id,
        pillar: targetDef.pillar,
      },
      bodyweightEmaKg
    );
  };

  const handleSelectAlternative = (alt: ExerciseDefinition) => {
    triggerHaptic('success');
    const converted = computeConvertedWeight(alt);
    onConfirmSwap(alt, converted);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-exercise-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
    >
      <div className="w-full max-w-sm rounded-3xl surface-glass p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-brand-primary/15 flex items-center justify-center text-brand-primary shrink-0">
              <ArrowRightLeft className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 id="change-exercise-title" className="font-bold text-base text-white tracking-tight">
                Change Exercise
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Alternatives for <strong className="text-slate-200">{familyLabel}</strong> • Target weight carries over
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close change exercise dialog"
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Currently Selected Exercise */}
        <div className="p-3.5 rounded-2xl bg-[#090C12] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Replacing
            </span>
            <span className="text-xs font-semibold text-brand-primary">
              {familyLabel}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold text-white text-sm">{currentExercise.name}</span>
            <span className="font-mono font-bold text-sm text-white">
              {formatImplementWeightLabel(
                currentWeight,
                currentExercise.equipment,
                currentExercise.isWeightedCalisthenic
              )}
            </span>
          </div>
        </div>

        {/* Environment Filter Tabs: Strict Equipment Guardrail */}
        <div
          role="group"
          aria-label="Filter replacement exercises by environment"
          className="grid grid-cols-3 gap-1 bg-[#090C12] p-1.5 rounded-2xl"
        >
          {(
            [
              { id: 'travel', label: 'Bodyweight' },
              { id: 'home', label: 'At Home' },
              { id: 'gym', label: 'Full Gym' },
            ] as const
          ).map((loc) => {
            const isSelected = selectedLocation === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedLocation(loc.id);
                }}
                className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center justify-center space-x-1 ${
                  isSelected
                    ? 'bg-white/[0.14] text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>{loc.label}</span>
                {loc.id === activeLocation && (
                  <span className="text-xs font-normal opacity-80">
                    (Active)
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Matched Alternatives */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold text-slate-300">
              Select Replacement Exercise
            </span>
            <span className="text-xs text-slate-400">
              {alternatives.length} {alternatives.length === 1 ? 'option' : 'options'}
            </span>
          </div>

          {alternatives.length === 0 ? (
            <div className="p-4 rounded-2xl bg-[#141824] text-center space-y-1">
              <p className="text-xs font-bold text-white">
                No {selectedLocation === 'travel' ? 'bodyweight' : selectedLocation === 'home' ? 'home' : 'gym'} exercises found
              </p>
              <p className="text-xs text-slate-400">
                Switch environment tabs above to view loaded alternatives with target weight carry-over.
              </p>
            </div>
          ) : (
            alternatives.map((alt) => {
              const convertedKg = computeConvertedWeight(alt);
              const equipLabel =
                alt.requiredHomeEquipment && alt.requiredHomeEquipment.length > 0
                  ? alt.requiredHomeEquipment.map((t) => HOME_TAG_LABELS[t] || t).join(' + ')
                  : EQUIPMENT_LABELS[alt.equipment] || alt.equipment;
              const isPureBw =
                selectedLocation === 'travel' ||
                (alt.equipment === 'bodyweight' && !alt.isWeightedCalisthenic);

              return (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => handleSelectAlternative(alt)}
                  className="w-full p-4 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-left transition-all space-y-2 min-h-[44px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm">
                        {alt.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {equipLabel} • {alt.defaultRepRange[0]}–{alt.defaultRepRange[1]} reps
                        {selectedLocation === 'travel' ? ' • Zero Equipment' : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-brand-primary text-sm block">
                        {isPureBw
                          ? 'Bodyweight'
                          : alt.isWeightedCalisthenic || alt.equipment === 'weighted_bodyweight'
                          ? `BW + ${units.format(convertedKg)}`
                          : alt.equipment === 'dumbbell'
                          ? `${units.format(convertedKg / 2)} each`
                          : units.format(convertedKg)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {isPureBw ? 'No added weight' : 'Matched to your strength'}
                      </span>
                    </div>
                  </div>

                  {alt.whyItWorks && (
                    <p className="text-xs text-slate-300 leading-relaxed pt-1">
                      {alt.whyItWorks}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

