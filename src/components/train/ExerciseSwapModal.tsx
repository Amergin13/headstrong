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
      <div className="wk-card w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--wk-raised)', color: 'var(--wk-accent)' }}
            >
              <ArrowRightLeft className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 id="change-exercise-title" className="wk-h1">
                Change Exercise
              </h3>
              <p className="wk-caption mt-0.5">
                Alternatives for <strong className="text-white">{familyLabel}</strong> • Target weight carries over
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
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Currently Selected Exercise */}
        <div className="wk-raised space-y-1">
          <div className="flex items-center justify-between">
            <span className="wk-caption uppercase">
              Replacing
            </span>
            <span className="wk-caption font-bold" style={{ color: 'var(--wk-accent)' }}>
              {familyLabel}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="wk-label normal-case">{currentExercise.name}</span>
            <span className="wk-label tabular-numbers">
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
          className="wk-segments grid-cols-3"
          style={{ background: 'var(--wk-raised)' }}
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
                className="wk-segment px-1 text-center"
                style={{
                  background: isSelected ? 'var(--wk-pill)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--wk-muted)',
                }}
              >
                <span>{loc.label}</span>
              </button>
            );
          })}
        </div>

        {/* Matched Alternatives */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="wk-label">
              Select Replacement Exercise
            </span>
            <span className="wk-caption">
              {alternatives.length} {alternatives.length === 1 ? 'option' : 'options'}
            </span>
          </div>

          {alternatives.length === 0 ? (
            <div className="wk-raised text-center space-y-1">
              <p className="wk-label normal-case">
                No {selectedLocation === 'travel' ? 'bodyweight' : selectedLocation === 'home' ? 'home' : 'gym'} exercises found
              </p>
              <p className="wk-caption">
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
                  className="wk-raised w-full text-left transition-all space-y-2 min-h-[44px] active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="wk-label normal-case">
                        {alt.name}
                      </div>
                      <div className="wk-caption mt-0.5">
                        {equipLabel} • {alt.defaultRepRange[0]}–{alt.defaultRepRange[1]} reps
                        {selectedLocation === 'travel' ? ' • Zero Equipment' : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className="wk-label tabular-numbers block"
                        style={{ color: 'var(--wk-accent)' }}
                      >
                        {isPureBw
                          ? 'Bodyweight'
                          : alt.isWeightedCalisthenic || alt.equipment === 'weighted_bodyweight'
                          ? `BW + ${units.format(convertedKg)}`
                          : alt.equipment === 'dumbbell'
                          ? `${units.format(convertedKg / 2)} each`
                          : units.format(convertedKg)}
                      </span>
                      <span className="wk-caption">
                        {isPureBw ? 'No added weight' : 'Matched to your strength'}
                      </span>
                    </div>
                  </div>

                  {alt.whyItWorks && (
                    <p className="wk-body pt-1">
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


