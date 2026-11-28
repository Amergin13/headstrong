import React, { useMemo, useState } from 'react';
import {
  AthleteMemoryFact,
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
import { usesOneDumbbell } from '../../engine/e1rm';
import {
  getMovementFamilyLabel,
  SwapPrescription,
} from '../../engine/progression';
import {
  RankedSwapCandidate,
  rankSwapRecommendations,
} from '../../services/swapRecommendations';
import { X, ArrowRightLeft, ChevronDown, ChevronUp, Sparkles, Search } from 'lucide-react';
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
  athleteMemories?: AthleteMemoryFact[];
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
  athleteMemories = [],
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
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [swapSearchQuery, setSwapSearchQuery] = useState('');

  const currentWeight =
    currentExercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup')?.targetWeightKg ??
    currentExercise.sets[0]?.targetWeightKg ??
    20;

  const currentDef = exerciseCatalog.find((e) => e.id === currentExercise.exerciseId);
  const familyLabel = getMovementFamilyLabel(currentDef || currentExercise);

  const currentLoadText =
    currentExercise.equipment === 'bodyweight' && !currentExercise.isWeightedCalisthenic
      ? 'Bodyweight'
      : currentExercise.isWeightedCalisthenic || currentExercise.equipment === 'weighted_bodyweight'
      ? currentWeight > 0
        ? `BW + ${units.format(currentWeight)}`
        : 'Bodyweight'
      : currentExercise.equipment === 'dumbbell' && !usesOneDumbbell(currentExercise)
      ? `${units.format(currentWeight)} each`
      : units.format(currentWeight);

  // Rank candidates using shared biomechanical, continuity, readiness, and memory-safety engine
  // (powered by Continuity Engine's evaluateSingleExerciseContinuitySwap priors).
  const { recommended, otherOptions } = useMemo(() => {
    void evaluateSingleExerciseContinuitySwap;
    return rankSwapRecommendations({
      currentExercise,
      exerciseCatalog,
      bodyweightEmaKg,
      location: selectedLocation,
      homeEquipment,
      workouts,
      activeOverlay,
      storedProgressionStates,
      athleteMemories,
      readinessState,
      goalPhase,
      unit: activeUnit,
      excludeExerciseIds,
      resolveFallbackWeight,
    });
  }, [
    currentExercise,
    exerciseCatalog,
    bodyweightEmaKg,
    selectedLocation,
    homeEquipment,
    workouts,
    activeOverlay,
    storedProgressionStates,
    athleteMemories,
    readinessState,
    goalPhase,
    activeUnit,
    excludeExerciseIds,
    resolveFallbackWeight,
  ]);

  const handleSelectAlternative = (
    alt: ExerciseDefinition,
    prescription: SwapPrescription,
    scope: ExerciseSwapScope = 'today'
  ) => {
    triggerHaptic('success');
    onConfirmSwap(alt, prescription.targetWeightKg, prescription, scope);
    onClose();
  };

  const formatCandidatePresentation = (cand: RankedSwapCandidate) => {
    const { exercise: alt, prescription, continuity } = cand;
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
      alt.implementLabel ||
      (alt.requiredHomeEquipment && alt.requiredHomeEquipment.length > 0
        ? alt.requiredHomeEquipment.map((t) => HOME_TAG_LABELS[t] || t).join(' + ')
        : EQUIPMENT_LABELS[alt.equipment] || alt.equipment);
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
    const primaryLoadText = isEffortMachine
      ? 'Pick moderate'
      : isPureBw
      ? 'Bodyweight'
      : alt.isWeightedCalisthenic || alt.equipment === 'weighted_bodyweight'
      ? `BW + ${units.format(convertedKg)}`
      : alt.equipment === 'dumbbell' && !usesOneDumbbell(alt)
      ? `${isAnchorEstimate ? '~' : ''}${units.format(convertedKg)} each`
      : `${isAnchorEstimate ? '~' : ''}${units.format(convertedKg)}`;

    return { equipLabel, targetLine, rightDetail, primaryLoadText };
  };

  const renderOtherOption = (cand: RankedSwapCandidate) => {
    const { exercise: alt, prescription } = cand;
    const { equipLabel, targetLine, rightDetail, primaryLoadText } = formatCandidatePresentation(cand);
    const shortLogic = cand.reasons[0] || prescription.rationale;

    return (
      <div
        key={alt.id}
        className="wk-raised w-full text-left space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="wk-subhead">
                {formatSentenceCase(alt.name)}
              </div>
              {cand.isContraindicated && (
                <span
                  className="wk-pill"
                  style={{
                    background: 'var(--color-status-warning-soft)',
                    color: 'var(--color-status-warning)',
                  }}
                >
                  Flagged in notes
                </span>
              )}
            </div>
            <div className="wk-caption mt-1">
              {equipLabel} • {targetLine}
              {selectedLocation === 'travel' ? ' • Zero equipment' : ''}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className="wk-subhead tabular-nums block"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {primaryLoadText}
            </span>
            <span className="wk-caption">{rightDetail}</span>
          </div>
        </div>

        <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
          {shortLogic}
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleSelectAlternative(alt, prescription, 'today')}
            className="wk-btn-secondary min-h-[44px] justify-center text-center active:scale-[0.98] transition-transform"
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

  const normalizedSwapQuery = swapSearchQuery.trim().toLowerCase();
  const matchesSwapSearch = (cand: RankedSwapCandidate) => {
    if (!normalizedSwapQuery) return true;
    const alt = cand.exercise;
    return (
      alt.name.toLowerCase().includes(normalizedSwapQuery) ||
      alt.equipment.toLowerCase().includes(normalizedSwapQuery) ||
      (alt.implementLabel?.toLowerCase().includes(normalizedSwapQuery) ?? false) ||
      (alt.category?.toLowerCase().includes(normalizedSwapQuery) ?? false) ||
      (alt.aliases?.some((a) => a.toLowerCase().includes(normalizedSwapQuery)) ?? false)
    );
  };
  const sameFamilyOthers = otherOptions.filter((o) => !o.isRelatedPattern && matchesSwapSearch(o));
  const relatedOthers = otherOptions.filter((o) => o.isRelatedPattern && matchesSwapSearch(o));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="swap-exercise-title"
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
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
              <h3 id="swap-exercise-title" className="wk-h1">
                Swap exercise
              </h3>
              <p className="wk-caption mt-1">
                Best match for <strong style={{ color: 'var(--color-text-primary)' }}>{familyLabel}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close swap exercise dialog"
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
            <span className="wk-meta-title" style={{ color: 'var(--color-text-primary)' }}>
              {familyLabel}
            </span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="wk-subhead">{formatSentenceCase(currentExercise.name)}</span>
            <span className="wk-subhead tabular-nums">{currentLoadText}</span>
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
              { id: 'travel', label: 'Bodyweight / No equipment' },
              { id: 'home', label: 'Home' },
              { id: 'gym', label: 'Gym' },
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
                  setShowAllOptions(false);
                }}
                className={`wk-segment px-2 text-center ${isSelected ? 'is-active' : ''}`}
              >
                <span>{loc.label}</span>
              </button>
            );
          })}
        </div>

        {/* Recommended Swap Hero Card + Progressive Disclosure for Other Options */}
        {!recommended ? (
          <div className="wk-raised text-center space-y-1">
            <p className="wk-subhead">
              No {selectedLocation === 'travel' ? 'bodyweight' : selectedLocation === 'home' ? 'home' : 'gym'} exercises found
            </p>
            <p className="wk-caption">
              Switch environment tabs above to see matched alternatives with load carry-over.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              const { equipLabel, targetLine, rightDetail, primaryLoadText } =
                formatCandidatePresentation(recommended);
              return (
                <section
                  aria-label="Recommended swap"
                  className="wk-raised w-full text-left space-y-3"
                  style={{
                    borderColor: 'var(--color-border-accent)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className="wk-pill inline-flex items-center gap-1"
                      style={{
                        background: 'var(--color-status-positive-soft)',
                        color: 'var(--color-accent-primary)',
                      }}
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      {recommended.badgeLabel}
                    </span>
                    {recommended.highlightTag && (
                      <span className="wk-pill">{recommended.highlightTag}</span>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="wk-subhead">
                        {formatSentenceCase(recommended.exercise.name)}
                      </div>
                      <div className="wk-caption mt-1">
                        {equipLabel} • {targetLine}
                        {selectedLocation === 'travel' ? ' • Zero equipment' : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className="wk-subhead tabular-nums block"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {primaryLoadText}
                      </span>
                      <span className="wk-caption">{rightDetail}</span>
                    </div>
                  </div>

                  {/* Clear coaching logic explaining WHY this swap is recommended */}
                  <div
                    className="rounded-lg p-3 space-y-2 border"
                    style={{
                      background: 'var(--wk-card)',
                      borderColor: 'var(--color-border-subtle)',
                    }}
                  >
                    <div className="wk-label" style={{ color: 'var(--color-text-secondary)' }}>
                      Why this swap
                    </div>
                    <ul className="space-y-1">
                      {recommended.reasons.map((reason, idx) => (
                        <li
                          key={idx}
                          className="wk-caption flex items-start gap-2"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          <span
                            className="inline-block rounded-full shrink-0 mt-1"
                            style={{
                              width: 4,
                              height: 4,
                              background: 'var(--color-accent-primary)',
                            }}
                            aria-hidden="true"
                          />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectAlternative(recommended.exercise, recommended.prescription, 'today')
                      }
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
                      onClick={() =>
                        handleSelectAlternative(recommended.exercise, recommended.prescription, 'permanent')
                      }
                      className="wk-btn-secondary min-h-[44px] justify-center text-center active:scale-[0.98] transition-transform"
                    >
                      Swap permanently in plan
                    </button>
                  </div>
                </section>
              );
            })()}

            {otherOptions.length > 0 && (
              <div className="space-y-3">
                <button
                  type="button"
                  aria-expanded={showAllOptions}
                  onClick={() => {
                    triggerHaptic('light');
                    setShowAllOptions((prev) => !prev);
                  }}
                  className="wk-btn-secondary w-full min-h-[44px] justify-between px-4"
                >
                  <span>
                    {showAllOptions
                      ? 'Hide other options'
                      : `See ${otherOptions.length} other ${otherOptions.length === 1 ? 'option' : 'options'}`}
                  </span>
                  {showAllOptions ? (
                    <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </button>

                {showAllOptions && (
                  <div className="space-y-2">
                    {otherOptions.length > 5 && (
                      <div className="relative">
                        <Search
                          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                          style={{ color: 'var(--color-text-muted)' }}
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={swapSearchQuery}
                          onChange={(e) => setSwapSearchQuery(e.target.value)}
                          placeholder="Filter by implement or name…"
                          aria-label="Filter other swap options"
                          className="wk-field w-full pl-10"
                        />
                      </div>
                    )}
                    {sameFamilyOthers.map(renderOtherOption)}
                    {relatedOthers.length > 0 && (
                      <div className="pt-2 space-y-2">
                        <div className="px-1">
                          <span className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                            Same muscle • Alternative pattern
                          </span>
                        </div>
                        {relatedOthers.map(renderOtherOption)}
                      </div>
                    )}
                    {sameFamilyOthers.length === 0 && relatedOthers.length === 0 && (
                      <p className="wk-caption text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>
                        No options match that filter.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
