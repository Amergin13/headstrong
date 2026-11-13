import React, { useId, useState } from 'react';
import { ExerciseSession, ProgressionPrescription, ReadinessState, SubTierQuest, WorkoutSet } from '../../engine/types';
import { calculate5StepWarmupRamp } from '../../engine/muscleBuildingProgram';
import { SetRow, PreviousSet, SET_TABLE_COLUMNS, SET_TABLE_GAP } from './SetRow';
import { TempoPacer } from './TempoPacer';
import { useUnits } from '../../utils/unitsContext';
import { ArrowRightLeft, ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { ExerciseInsight } from '../../services/exerciseInsight';
import { TrendChart } from '../common/TrendChart';
import { localDateString } from '../../utils/date';
import { isUnilateralExercise } from '../../services/movementStandards';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface ExerciseCardProps {
  exerciseIndex?: number;
  totalExercises?: number;
  exercise: ExerciseSession;
  prescription: ProgressionPrescription;
  quest: SubTierQuest;
  readinessState: ReadinessState;
  onUpdateSet: (setId: string, updated: Partial<WorkoutSet>) => void;
  onCompleteSet: (setId: string) => void;
  onAddSet: (isWarmup?: boolean) => void;
  onOpenSwap?: () => void;
  onOpenPlateCalc?: (weightKg: number) => void;
  /** Plain-English primary muscle, e.g. "Triceps". */
  muscleLabel?: string;
  /** Working sets from the last time this exact exercise was completed. */
  previousSets?: PreviousSet[];
  /** Past sessions of this exercise and the progress summary. */
  insight?: ExerciseInsight;
  /** Personal overview for today (written on the device); replaces the plain summary. */
  note?: string;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exerciseIndex,
  exercise,
  readinessState,
  onUpdateSet,
  onCompleteSet,
  onAddSet,
  onOpenSwap,
  onOpenPlateCalc,
  muscleLabel,
  previousSets = [],
  insight,
  note,
}) => {
  const units = useUnits();
  const [showDetails, setShowDetails] = useState(false);
  const unilateral = isUnilateralExercise(exercise);
  const [perSide, setPerSide] = useState(() => exercise.sets.some((s) => s.actualRepsLeft !== undefined));
  const detailsId = useId();

  const firstWorkingSet = exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup');
  const currentWeight = firstWorkingSet?.targetWeightKg ?? exercise.sets[0]?.targetWeightKg ?? 20;
  const plannedWeightKg = firstWorkingSet?.targetWeightKg ?? 0;
  const isBodyweightOnly =
    exercise.equipment === 'bodyweight' && (!exercise.isWeightedCalisthenic || plannedWeightKg === 0);
  const warmupCount = exercise.sets.filter((s) => s.isWarmup || s.setType === 'warmup').length;
  const hasTempoPacer = Boolean(exercise.tempo && /^[\dXx]{4}$/.test(exercise.tempo));
  const customTempoText = !hasTempoPacer && exercise.tempo ? exercise.tempo : null;
  const warmupSteps = exercise.useWarmupProtocol ? calculate5StepWarmupRamp(currentWeight) : [];
  const chip = exercise.orderCode || (exerciseIndex !== undefined ? String(exerciseIndex) : null);
  const history = insight?.history ?? [];

  const secondaryButton =
    'wk-pill justify-center normal-case min-h-[44px] active:scale-95 transition-transform';

  return (
    <section aria-label={exercise.name} className="wk-card">
      {/* Title, swap button, details toggle */}
      <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
        <div className="flex items-center min-w-0 flex-wrap" style={{ columnGap: fig(16), rowGap: fig(8) }}>
          <h3 className="wk-h1">{exercise.name}</h3>
          {onOpenSwap && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenSwap();
              }}
              aria-label={`Change exercise from ${exercise.name}`}
              className="flex items-center justify-center"
              style={{ width: 44, height: 44, margin: -14, color: 'var(--wk-muted)' }}
            >
              <ArrowRightLeft style={{ width: fig(32), height: fig(32) }} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setShowDetails((v) => !v);
          }}
          aria-expanded={showDetails}
          aria-controls={detailsId}
          aria-label={`${showDetails ? 'Hide' : 'Show'} tempo, warm-up and set options for ${exercise.name}`}
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, margin: -14 }}
        >
          <ChevronRight
            className="wk-chevron transition-transform"
            style={{ transform: showDetails ? 'rotate(90deg)' : undefined }}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </div>

      {(chip || exercise.intensityProtocol) && (
        <div className="flex items-center flex-wrap" style={{ gap: fig(12), marginTop: fig(16) }}>
          {chip && <span className="wk-pill">{chip}</span>}
          {exercise.intensityProtocol && <span className="wk-pill">{exercise.intensityProtocol.name}</span>}
        </div>
      )}

      {/* 2-line dynamic summary (Line 1: Historical Trajectory Anchor, Line 2: Session Stimulus Directive) and history chart */}
      {insight && (
        <div className="flex flex-col" style={{ gap: fig(28), marginTop: fig(36) }}>
          <div className="wk-body" aria-live="polite">
            {/* Re-keyed on change so a written note replacing its placeholder fades in. */}
            <div key={note ?? insight.summary} className="wk-text-swap flex flex-col" style={{ gap: fig(6) }}>
              {(note ?? insight.summary)
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 2)
                .map((line, lineIdx) => (
                  <p key={lineIdx} className="m-0">
                    {line}
                  </p>
                ))}
            </div>
          </div>
          {!(exercise.durationSeconds || exercise.durationMinutesRange) && (
            <TrendChart
              points={history.map((h) => ({ date: localDateString(new Date(h.at)), value: h.e1rmKg }))}
              format={(kg) => units.formatPrecise(kg)}
              height={240}
              label={
                history.length >= 2
                  ? `Estimated one-rep max over your last ${history.length} sessions: ${units.formatPrecise(history[0].e1rmKg)} to ${units.formatPrecise(history[history.length - 1].e1rmKg)}`
                  : history.length === 1
                  ? `Starting point: estimated one-rep max ${units.formatPrecise(history[0].e1rmKg)}. The trend line starts after your next session.`
                  : 'Example chart. Your estimated one-rep max for this exercise appears here after your first session.'
              }
            />
          )}
        </div>
      )}

      {/* Details: tempo, warm-up ramp, technique, set options */}
      {showDetails && (
        <div id={detailsId} className="space-y-3" style={{ marginTop: fig(40) }}>
          {(muscleLabel || customTempoText || readinessState === 'Amber Shield') && (
            <p className="wk-body">
              {muscleLabel && <strong className="text-white font-semibold">{muscleLabel}. </strong>}
              {customTempoText}
              {readinessState === 'Amber Shield' ? ' Holding weight steady today.' : ''}
            </p>
          )}
          {hasTempoPacer && exercise.tempo && <TempoPacer tempo={exercise.tempo} />}
          {exercise.intensityProtocol && <p className="wk-body">{exercise.intensityProtocol.instruction}</p>}
          {warmupSteps.length > 0 && (
            <div className="space-y-1">
              <p className="wk-label">Warm-up ramp</p>
              <ul className="wk-body">
                {warmupSteps.map((step) => (
                  <li key={step.setNumber}>
                    {units.format(step.targetWeightKg)} × {step.reps} ({step.percentage}%) · {step.restLabel}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {exercise.exerciseNotes && exercise.exerciseNotes.length > 0 && (
            <ul className="wk-body list-disc pl-4">
              {exercise.exerciseNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap" style={{ gap: fig(16) }}>
            {onOpenPlateCalc && exercise.equipment === 'barbell' && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  triggerHaptic('light');
                  onOpenPlateCalc(currentWeight);
                }}
              >
                Plates
              </button>
            )}
            {!isBodyweightOnly && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  triggerHaptic('light');
                  onAddSet(true);
                }}
              >
                + Warm-up set
              </button>
            )}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                triggerHaptic('light');
                onAddSet(false);
              }}
            >
              + Add set
            </button>
          </div>
        </div>
      )}

      {/* Set table */}
      <div role="table" aria-label={`${exercise.name} sets`} style={{ marginTop: fig(60) }}>
        <div
          role="row"
          className="grid items-center text-center"
          style={{
            gridTemplateColumns: SET_TABLE_COLUMNS,
            columnGap: SET_TABLE_GAP,
            fontSize: `max(12px, ${fig(24)})`,
            fontWeight: 600,
            color: 'var(--wk-muted)',
            marginBottom: fig(30),
          }}
        >
          <span role="columnheader">SET</span>
          <span role="columnheader">PREV</span>
          <span role="columnheader">WEIGHT</span>
          <span role="columnheader">REPS</span>
          <span role="columnheader" title="Reps in reserve">RIR</span>
          <span role="columnheader" className="sr-only">Done</span>
        </div>
        {/* At least 16 px apart, so the 44 px touch areas of neighbouring rows don't overlap. */}
        <div className="flex flex-col" style={{ gap: `max(${fig(27)}, 16px)` }}>
          {(() => {
            let warmupIndex = 0;
            let workingIndex = 0;
            return exercise.sets.map((s) => {
              const isWarm = s.isWarmup || s.setType === 'warmup';
              let displayBadge: string;
              let displayLabel: string;
              if (isWarm) {
                warmupIndex++;
                displayBadge = warmupCount > 1 ? `W${warmupIndex}` : 'W';
                displayLabel = `Warm-up set ${warmupIndex}`;
              } else if (s.setType === 'drop') {
                displayBadge = 'D';
                displayLabel = 'Drop set';
              } else if (s.setType === 'myo') {
                displayBadge = '+';
                displayLabel = 'Bonus rest-pause set';
              } else {
                workingIndex++;
                displayBadge = `${workingIndex}`;
                displayLabel = `Set ${workingIndex}`;
              }
              // PREV is the matching set from the last time this exact exercise was completed.
              const previous = isWarm ? undefined : previousSets[workingIndex - 1];
              return (
                <SetRow
                  key={s.id}
                  set={s}
                  displayBadge={displayBadge}
                  displayLabel={displayLabel}
                  previous={previous}
                  isBodyweight={isBodyweightOnly}
                  isDumbbell={exercise.equipment === 'dumbbell'}
                  perSide={unilateral && perSide && !isWarm}
                  onUpdate={(updated) => onUpdateSet(s.id, updated)}
                  onComplete={() => onCompleteSet(s.id)}
                />
              );
            });
          })()}
        </div>
        {unilateral && (
          <button
            type="button"
            aria-pressed={perSide}
            onClick={() => {
              triggerHaptic('light');
              setPerSide((v) => !v);
            }}
            className={secondaryButton}
            style={{ marginTop: fig(28) }}
          >
            {perSide ? 'Log both sides together' : 'Log each side'}
          </button>
        )}
      </div>
    </section>
  );
};
