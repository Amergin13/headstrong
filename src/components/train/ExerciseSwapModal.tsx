import React, { useState } from 'react';
import {
  EnvironmentOverlay,
  ExerciseDefinition,
  ExerciseProgressionState,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ReadinessState,
  TrainingLocation,
  WorkoutSession,
} from '../../engine/types';
import { evaluateSingleExerciseContinuitySwap } from '../../engine/continuityEngine';
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

export type ExerciseSwapScope = 'today' | 'permanent';

interface ExerciseSwapModalProps {
  currentExercise: ExerciseSession;
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  activeLocation?: TrainingLocation;
  homeEquipment?: HomeEquipmentTag[];
  workouts?: WorkoutSession[];
  activeOverlay?: EnvironmentOverlay | null;
  storedProgressionStates?: Record<string, ExerciseProgressionState>;
  readinessState?: ReadinessState;
  goalPhase?: GoalPhase;
  unit?: WeightUnit;
  resolveFallbackWeight?: (def: ExerciseDefinition) => number | undefined;
  onConfirmSwap: (
    newExerciseDef: ExerciseDefinition,
    convertedWeightKg: number,
    prescription?: SwapPrescription,
    scope?: ExerciseSwapScope
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
  activeOverlay = null,
  storedProgressionStates,
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

  const handleSelectAlternative = (
    alt: ExerciseDefinition,
    prescription: SwapPrescription,
    scope: ExerciseSwapScope = 'today'
  ) => {
    triggerHaptic('success');
    onConfirmSwap(alt, prescription.targetWeightKg, prescription, scope);
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
                Swap exercise
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
                currentExercise.isWeightedCalisthenic,
                currentExercise
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
              const continuity = evaluateSingleExerciseContinuitySwap({
                currentExercise,
                replacementDef: alt,
                historicalWorkouts: workouts,
                exerciseCatalog,
                storedProgressionStates,
                activeOverlay,
                userBodyweightKg: bodyweightEmaKg,
                unit: activeUnit,
              });
              const continuitySet1 = continuity.prescription.sets[0];
              const isEffortMachine =
                !prescription.isTimed &&
                continuity.prescription.calibrationSource === 'EFFORT_ONLY' &&
                continuity.targetMetadata.equipmentClass === 'VARIABLE_MACHINE_OR_CABLE';
              const isAnchorEstimate =
                !prescription.isTimed &&
                continuity.prescription.calibrationSource === 'ANCHOR_PRIOR' &&
                continuity.targetMetadata.equipmentClass === 'STANDARDIZED_FREE_WEIGHT' &&
                continuitySet1?.suggestedWeightKg != null &&
                continuitySet1.suggestedWeightKg > 0;
              const convertedKg = isEffortMachine
                ? 0
                : isAnchorEstimate
                ? continuitySet1!.suggestedWeightKg!
                : continuity.prescription.calibrationSource === 'OWN_HISTORY' &&
                  continuitySet1?.suggestedWeightKg != null &&
                  continuitySet1.suggestedWeightKg > 0
                ? continuitySet1.suggestedWeightKg
                : prescription.targetWeightKg;
              const equipLabel =
                alt.requiredHomeEquipment && alt.requiredHomeEquipment.length > 0
                  ? alt.requiredHomeEquipment.map((t) => HOME_TAG_LABELS[t] || t).join(' + ')
                  : EQUIPMENT_LABELS[alt.equipment] || alt.equipment;
              const isPureBw = prescription.isPureBodyweight;
              const targetLine = prescription.isTimed
                ? `${prescription.targetDurationSeconds}s hold`
                : `${prescription.minReps}–${prescription.maxReps} reps • Start ${
                    continuitySet1?.targetRepsMin ?? prescription.targetReps
                  }`;
              const rightDetail = prescription.isTimed
                ? 'Timed hold'
                : isEffortMachine
                ? 'Set 1 calibrates'
                : isAnchorEstimate
                ? 'Est. · Set 1 calibrates'
                : isPureBw && continuity.prescription.setupLabel
                ? continuity.prescription.setupLabel
                : prescription.usedOwnHistory || continuity.prescription.calibrationSource === 'OWN_HISTORY'
                ? 'Your last target'
                : `${continuitySet1?.targetRepsMin ?? prescription.targetReps} reps @ ${
                    continuitySet1?.targetRir ?? prescription.targetRir
                  } RIR`;
              const rationaleText =
                !prescription.isTimed && continuity.prescription.copy?.tier1
                  ? continuity.prescription.copy.tier1
                  : prescription.rationale;
              const primaryLoadText = isEffortMachine
                ? 'Pick moderate'
                : isPureBw
                ? 'Bodyweight'
                : alt.isWeightedCalisthenic || alt.equipment === 'weighted_bodyweight'
                ? `BW + ${units.format(convertedKg)}`
                : alt.equipment === 'dumbbell' && !usesOneDumbbell(alt)
                ? `${isAnchorEstimate ? '~' : ''}${units.format(convertedKg)} each`
                : `${isAnchorEstimate ? '~' : ''}${units.format(convertedKg)}`;

              return (
                <div
                  key={alt.id}
                  className="wk-raised w-full text-left space-y-3"
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
                        {primaryLoadText}
                      </span>
                      <span className="wk-caption">{rightDetail}</span>
                    </div>
                  </div>

                  <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                    {rationaleText}
                  </p>

                  {alt.whyItWorks && (
                    <p className="wk-body max-w-prose">
                      {alt.whyItWorks}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSelectAlternative(alt, prescription, 'today')}
                      className="wk-btn-secondary min-h-[44px] justify-center text-center active:scale-[0.98] transition-transform"
                      style={{
                        background: 'var(--color-action-primary-bg)',
                        color: 'var(--color-action-primary-fg)',
                        borderColor: 'var(--color-action-primary-bg)',
                      }}
                    >
                      Swap for today only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAlternative(alt, prescription, 'permanent')}
                      className="wk-btn-secondary min-h-[44px] justify-center text-center active:scale-[0.98] transition-transform"
                    >
                      Swap permanently in plan
                    </button>
                  </div>
                </div>
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


