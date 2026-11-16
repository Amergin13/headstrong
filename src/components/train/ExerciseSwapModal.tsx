import React, { useState } from 'react';
import {
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ReadinessState,
  TrainingLocation,
  WorkoutSession,
} from '../../engine/types';
import {
  formatImplementWeightLabel,
  usesOneDumbbell,
} from '../../engine/e1rm';
import {
  canPerformExerciseInLocation,
  getMovementFamilyLabel,
  getMovementVectorId,
  getRelatedSwapAlternatives,
  prescribeExerciseSwap,
  SwapPrescription,
} from '../../engine/progression';
import { X, ArrowRightLeft } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';
import { useUnits } from '../../utils/unitsContext';
import { WeightUnit } from '../../utils/units';

interface ExerciseSwapModalProps {
  currentExercise: ExerciseSession;
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  activeLocation?: TrainingLocation;
  homeEquipment?: HomeEquipmentTag[];
  workouts?: WorkoutSession[];
  readinessState?: ReadinessState;
  goalPhase?: GoalPhase;
  unit?: WeightUnit;
  resolveFallbackWeight?: (def: ExerciseDefinition) => number | undefined;
  onConfirmSwap: (
    newExerciseDef: ExerciseDefinition,
    convertedWeightKg: number,
    prescription?: SwapPrescription
  ) => void;
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
  workouts = [],
  readinessState = 'Normal',
  goalPhase = 'Lean Bulk',
  unit,
  resolveFallbackWeight,
  onConfirmSwap,
  onClose,
  excludeExerciseIds = [],
}) => {
  const units = useUnits();
  const activeUnit = unit ?? units.unit;
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
      const aLoaded = a.equipment !== 'bodyweight' ? 1 : 0;
      const bLoaded = b.equipment !== 'bodyweight' ? 1 : 0;
      if (aLoaded !== bLoaded) return bLoaded - aLoaded;
      const aPureBw = !a.requiredHomeEquipment || a.requiredHomeEquipment.length === 0 ? 1 : 0;
      const bPureBw = !b.requiredHomeEquipment || b.requiredHomeEquipment.length === 0 ? 1 : 0;
      return bPureBw - aPureBw;
    });

  // Secondary related substitutes sharing the primary prime mover (e.g. DB RDL for Leg Curl at home)
  const relatedAlternatives = getRelatedSwapAlternatives(
    currentDef || currentExercise,
    exerciseCatalog,
    selectedLocation,
    homeEquipment,
    [currentExercise.exerciseId, ...excludeExerciseIds, ...alternatives.map((a) => a.id)]
  );

  const computeSwapPrescription = (targetDef: ExerciseDefinition): SwapPrescription =>
    prescribeExerciseSwap({
      sourceExercise: currentExercise,
      targetDef,
      workouts,
      readinessState,
      goalPhase,
      bodyweightEmaKg,
      location: selectedLocation,
      unit: activeUnit,
      fallbackTargetWeightKg: resolveFallbackWeight?.(targetDef),
    });

  const handleSelectAlternative = (alt: ExerciseDefinition, prescription: SwapPrescription) => {
    triggerHaptic('success');
    onConfirmSwap(alt, prescription.targetWeightKg, prescription);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-exercise-title"
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg border flex items-center justify-center shrink-0"
              style={{
                background: 'var(--wk-raised)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-subtle)',
              }}
            >
              <ArrowRightLeft className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 id="change-exercise-title" className="wk-h1">
                Change exercise
              </h3>
              <p className="wk-caption mt-1">
                Alternatives for <strong style={{ color: 'var(--color-text-primary)' }}>{familyLabel}</strong> • Target weight carries over
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
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-colors shrink-0"
            style={{
              background: 'var(--wk-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Currently Selected Exercise */}
        <div className="wk-raised space-y-1">
          <div className="flex items-center justify-between">
            <span className="wk-label" style={{ color: 'var(--wk-muted)' }}>
              Replacing
            </span>
            <span className="wk-caption font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {familyLabel}
            </span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="wk-subhead">{formatSentenceCase(currentExercise.name)}</span>
            <span className="wk-subhead tabular-nums">
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
                className={`wk-segment px-2 text-center ${isSelected ? 'is-active' : ''}`}
              >
                <span>{loc.label}</span>
              </button>
            );
          })}
        </div>

        {/* Matched Alternatives */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="wk-label">
              Select replacement exercise
            </span>
            <span className="wk-caption">
              {alternatives.length + relatedAlternatives.length}{' '}
              {alternatives.length + relatedAlternatives.length === 1 ? 'option' : 'options'}
            </span>
          </div>

          {alternatives.length === 0 && relatedAlternatives.length === 0 ? (
            <div className="wk-raised text-center space-y-1">
              <p className="wk-subhead">
                No {selectedLocation === 'travel' ? 'bodyweight' : selectedLocation === 'home' ? 'home' : 'gym'} exercises found
              </p>
              <p className="wk-caption">
                Switch environment tabs above to view loaded alternatives with target weight carry-over.
              </p>
            </div>
          ) : (
            (() => {
              const renderOption = (alt: ExerciseDefinition) => {
              const prescription = computeSwapPrescription(alt);
              const convertedKg = prescription.targetWeightKg;
              const equipLabel =
                alt.requiredHomeEquipment && alt.requiredHomeEquipment.length > 0
                  ? alt.requiredHomeEquipment.map((t) => HOME_TAG_LABELS[t] || t).join(' + ')
                  : EQUIPMENT_LABELS[alt.equipment] || alt.equipment;
              const isPureBw = prescription.isPureBodyweight;
              const targetLine = prescription.isTimed
                ? `${prescription.targetDurationSeconds}s hold`
                : `${prescription.minReps}–${prescription.maxReps} reps • Start ${prescription.targetReps}`;
              const rightDetail = prescription.usedOwnHistory
                ? 'Your last target'
                : prescription.isTimed
                ? 'Timed hold'
                : `${prescription.targetReps} reps @ ${prescription.targetRir} RIR`;

              return (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => handleSelectAlternative(alt, prescription)}
                  className="wk-raised w-full text-left transition-all space-y-2 min-h-[44px] active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="wk-subhead">
                        {formatSentenceCase(alt.name)}
                      </div>
                      <div className="wk-caption mt-1">
                        {equipLabel} • {targetLine}
                        {selectedLocation === 'travel' ? ' • Zero equipment' : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className="wk-subhead tabular-numbers block"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {isPureBw
                          ? 'Bodyweight'
                          : alt.isWeightedCalisthenic || alt.equipment === 'weighted_bodyweight'
                          ? `BW + ${units.format(convertedKg)}`
                          : alt.equipment === 'dumbbell' && !usesOneDumbbell(alt)
                          ? `${units.format(convertedKg / 2)} each`
                          : units.format(convertedKg)}
                      </span>
                      <span className="wk-caption">{rightDetail}</span>
                    </div>
                  </div>

                  <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                    {prescription.rationale}
                  </p>

                  {alt.whyItWorks && (
                    <p className="wk-body pt-1 max-w-prose">
                      {alt.whyItWorks}
                    </p>
                  )}
                </button>
              );
              };

              return (
                <>
                  {alternatives.map(renderOption)}
                  {relatedAlternatives.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <div className="px-1">
                        <span className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                          Same muscle • Alternative pattern
                        </span>
                      </div>
                      {relatedAlternatives.map(renderOption)}
                    </div>
                  )}
                </>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
};


