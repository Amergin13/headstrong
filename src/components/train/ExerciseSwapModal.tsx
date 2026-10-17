import React from 'react';
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

interface ExerciseSwapModalProps {
  currentExercise: ExerciseSession;
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  activeLocation?: TrainingLocation;
  homeEquipment?: HomeEquipmentTag[];
  onConfirmSwap: (newExerciseDef: ExerciseDefinition, convertedWeightKg: number) => void;
  onClose: () => void;
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
}) => {
  const currentWeight =
    currentExercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.targetWeightKg ??
    currentExercise.sets[0]?.targetWeightKg ??
    20;

  const currentDef = exerciseCatalog.find((e) => e.id === currentExercise.exerciseId);
  const targetVectorId = getMovementVectorId(currentDef || currentExercise);
  const familyLabel = getMovementFamilyLabel(currentDef || currentExercise);

  // Strictly match exercises in the exact same Biomechanical Movement Family (never mix compounds with core/isolations)
  // Sort options that match the user's current training location to the top
  const alternatives = exerciseCatalog
    .filter(
      (ex) => getMovementVectorId(ex) === targetVectorId && ex.id !== currentExercise.exerciseId
    )
    .sort((a, b) => {
      const aFits = canPerformExerciseInLocation(a, activeLocation, homeEquipment) ? 1 : 0;
      const bFits = canPerformExerciseInLocation(b, activeLocation, homeEquipment) ? 1 : 0;
      return bFits - aFits;
    });

  const computeConvertedWeight = (targetDef: ExerciseDefinition): number => {
    return translateWeightBetweenImplements(
      currentWeight,
      {
        equipment: currentExercise.equipment,
        isRdl: currentExercise.isRdl,
        isWeightedCalisthenic: currentExercise.isWeightedCalisthenic,
      },
      {
        equipment: targetDef.equipment,
        isRdl: targetDef.isRdl,
        isWeightedCalisthenic: targetDef.isWeightedCalisthenic,
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
      <div className="w-full max-w-sm rounded-3xl surface-glass border border-white/[0.12] p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary shrink-0">
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
        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06] space-y-1">
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

          {alternatives.map((alt) => {
            const convertedKg = computeConvertedWeight(alt);
            const equipLabel =
              alt.requiredHomeEquipment && alt.requiredHomeEquipment.length > 0
                ? alt.requiredHomeEquipment.map((t) => HOME_TAG_LABELS[t] || t).join(' + ')
                : EQUIPMENT_LABELS[alt.equipment] || alt.equipment;
            const fitsCurrentLoc = canPerformExerciseInLocation(
              alt,
              activeLocation,
              homeEquipment
            );

            return (
              <button
                key={alt.id}
                type="button"
                onClick={() => handleSelectAlternative(alt)}
                className="w-full p-3.5 rounded-2xl bg-surface-elevated hover:bg-surface-hover border border-white/[0.08] hover:border-brand-primary/40 text-left transition-all space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-white text-sm">
                      {alt.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {equipLabel} • {alt.defaultRepRange[0]}–{alt.defaultRepRange[1]} reps
                      {fitsCurrentLoc && activeLocation !== 'gym' ? ' • Fits your setup' : ''}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-brand-primary text-sm block">
                      {formatImplementWeightLabel(
                        convertedKg,
                        alt.equipment,
                        alt.isWeightedCalisthenic
                      )}
                    </span>
                    <span className="text-xs text-slate-400">
                      Matched target
                    </span>
                  </div>
                </div>

                {alt.whyItWorks && (
                  <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-white/[0.06]">
                    {alt.whyItWorks}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

