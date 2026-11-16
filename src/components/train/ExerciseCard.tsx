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
import { getBodyweightLoadRatio, isTimedExercise } from '../../engine/e1rm';
import { formatSentenceCase } from '../../utils/typography';
import { isUnilateralExercise } from '../../services/movementStandards';

interface ExerciseCardProps {
  exerciseIndex?: number;
  totalExercises?: number;
  exercise: ExerciseSession;
  prescription: ProgressionPrescription;
  quest: SubTierQuest;
  readinessState: ReadinessState;
  bodyweightKg?: number;
  lastAthleteNote?: { date: string; text: string };
  onUpdateNotes?: (notes: string) => void;
  onOpenNotesHistory?: () => void;
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
  /** Whether to display the 2-line written summary (default: true). */
  showSummary?: boolean;
  /** Whether to display the inline history TrendChart (default: true). */
  showChart?: boolean;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exerciseIndex,
  exercise,
  readinessState,
  bodyweightKg = 0,
  lastAthleteNote,
  onUpdateNotes,
  onOpenNotesHistory,
  onUpdateSet,
  onCompleteSet,
  onAddSet,
  onOpenSwap,
  onOpenPlateCalc,
  muscleLabel,
  previousSets = [],
  insight,
  note,
  showSummary = true,
  showChart = true,
}) => {
  const units = useUnits();
  const [showDetails, setShowDetails] = useState(false);
  const isTimed = isTimedExercise(exercise);
  const workingSets = exercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  const isBlockCompleted = workingSets.length > 0 && workingSets.every((s) => s.completed);
  const unilateral = !isTimed && isUnilateralExercise(exercise);
  const [perSide, setPerSide] = useState(() => exercise.sets.some((s) => s.actualRepsLeft !== undefined));
  const detailsId = useId();
  const notesId = useId();

  const firstWorkingSet = exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup');
  const currentWeight = firstWorkingSet?.targetWeightKg ?? exercise.sets[0]?.targetWeightKg ?? 20;
  const plannedWeightKg = firstWorkingSet?.targetWeightKg ?? 0;
  const isBodyweightOnly =
    exercise.equipment === 'bodyweight' && (!exercise.isWeightedCalisthenic || plannedWeightKg === 0);
  const isCalisthenic =
    exercise.equipment === 'bodyweight' ||
    exercise.equipment === 'weighted_bodyweight' ||
    Boolean(exercise.isWeightedCalisthenic);
  const bwRatio = isCalisthenic ? getBodyweightLoadRatio(exercise.exerciseId, exercise.pillar) : 0;
  const countedBodyweightKg =
    !isTimed && isCalisthenic && bwRatio > 0 && bodyweightKg > 0
      ? Math.round(bodyweightKg * bwRatio * 10) / 10
      : 0;
  const warmupCount = exercise.sets.filter((s) => s.isWarmup || s.setType === 'warmup').length;
  const hasTempoPacer = Boolean(exercise.tempo && /^[\dXx]{4}$/.test(exercise.tempo));
  const customTempoText = !hasTempoPacer && exercise.tempo ? exercise.tempo : null;
  const warmupSteps = exercise.useWarmupProtocol ? calculate5StepWarmupRamp(currentWeight) : [];
  const chip = exercise.orderCode || (exerciseIndex !== undefined ? String(exerciseIndex) : null);
  const history = insight?.history ?? [];

  const secondaryButton =
    'wk-btn-secondary justify-center normal-case min-h-[44px] active:scale-95 transition-transform';

  return (
    <section aria-label={exercise.name} className="wk-card">
      {/* Title, swap button, details toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center min-w-0 flex-wrap gap-2">
          <h3 className="wk-h1">{formatSentenceCase(exercise.name)}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenSwap && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenSwap();
              }}
              aria-label={`Swap exercise from ${exercise.name}`}
              title={`Swap ${formatSentenceCase(exercise.name)}`}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border-strong)] flex items-center justify-center shrink-0 transition-colors"
              style={{ background: 'var(--color-action-secondary-bg)', color: 'var(--color-action-secondary-fg)' }}
            >
              <ArrowRightLeft className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowDetails((v) => !v);
            }}
            aria-expanded={showDetails}
            aria-controls={detailsId}
            aria-label={`${showDetails ? 'Hide' : 'Show'} tempo, warm-up and set options for ${exercise.name}`}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border-strong)] flex items-center justify-center shrink-0 transition-colors"
            style={{ background: 'var(--color-action-secondary-bg)', color: 'var(--color-action-secondary-fg)' }}
          >
            <ChevronRight
              className="wk-chevron transition-transform"
              style={{ transform: showDetails ? 'rotate(90deg)' : undefined, color: 'var(--color-action-secondary-fg)' }}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {(chip || exercise.intensityProtocol || countedBodyweightKg > 0 || isBlockCompleted) && (
        <div className="flex items-center flex-wrap gap-2 mt-2">
          {chip && <span className="wk-pill">{chip}</span>}
          {isBlockCompleted && (
            <span
              className="wk-pill"
              style={{
                background: 'var(--color-status-positive-soft)',
                color: 'var(--wk-accent)',
              }}
            >
              Completed
            </span>
          )}
          {exercise.intensityProtocol && <span className="wk-pill">{exercise.intensityProtocol.name}</span>}
          {countedBodyweightKg > 0 && (
            <span className="wk-pill tabular-nums">
              {units.format(countedBodyweightKg)} bodyweight counted
            </span>
          )}
        </div>
      )}

      {/* 2-line dynamic summary (Line 1: Historical Trajectory Anchor, Line 2: Session Stimulus Directive) and history chart */}
      {insight && (showSummary || showChart) && (
        <div className="flex flex-col gap-3 mt-4">
          {showSummary && (
            <div className="wk-body max-w-prose" aria-live="polite">
              {/* Re-keyed on change so a written note replacing its placeholder fades in. */}
              <div key={note ?? insight.summary} className="wk-text-swap flex flex-col gap-1">
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
          )}
          {showChart && (
            <TrendChart
              points={history.map((h) => ({ date: localDateString(new Date(h.at)), value: h.value ?? h.e1rmKg }))}
              format={(v) =>
                insight.metric === 'time'
                  ? `${Math.round(v)}s`
                  : insight.metric === 'reps'
                  ? `${Math.round(v)} reps`
                  : units.formatPrecise(v)
              }
              height={240}
              label={(() => {
                const fmtVal = (v: number) =>
                  insight.metric === 'time'
                    ? `${Math.round(v)}s`
                    : insight.metric === 'reps'
                    ? `${Math.round(v)} reps`
                    : units.formatPrecise(v);
                const metricName =
                  insight.metric === 'time'
                    ? 'hold duration'
                    : insight.metric === 'reps'
                    ? 'best set'
                    : insight.metric === 'added_kg'
                    ? 'top added weight'
                    : insight.includesBodyweight
                    ? 'estimated one-rep max (bodyweight + added weight)'
                    : 'estimated one-rep max';
                const firstVal = history[0] ? fmtVal(history[0].value ?? history[0].e1rmKg) : '';
                const lastVal = history[history.length - 1]
                  ? fmtVal(history[history.length - 1].value ?? history[history.length - 1].e1rmKg)
                  : '';
                if (history.length >= 2) {
                  return `${metricName.charAt(0).toUpperCase() + metricName.slice(1)} over your last ${history.length} sessions: ${firstVal} to ${lastVal}`;
                }
                if (history.length === 1) {
                  return `Starting point: ${metricName} ${firstVal}. The trend line starts after your next session.`;
                }
                return `No sessions logged yet. Your ${metricName} for this exercise appears here after your first session.`;
              })()}
              emptyTitle="No history yet"
              emptyMessage={
                isTimed
                  ? 'Complete all hold sets to establish your starting hold time.'
                  : 'Complete all working sets to establish your starting estimated max.'
              }
            />
          )}
        </div>
      )}

      {/* Details: tempo, warm-up ramp, technique, set options */}
      {showDetails && (
        <div id={detailsId} className="space-y-3 mt-4">
          {(muscleLabel || customTempoText || readinessState === 'Amber Shield') && (
            <p className="wk-body max-w-prose">
              {muscleLabel && (
                <strong className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {muscleLabel}.{' '}
                </strong>
              )}
              {customTempoText}
              {readinessState === 'Amber Shield' ? ' Holding weight steady today.' : ''}
            </p>
          )}
          {hasTempoPacer && exercise.tempo && <TempoPacer tempo={exercise.tempo} />}
          {exercise.intensityProtocol && <p className="wk-body max-w-prose">{exercise.intensityProtocol.instruction}</p>}
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
          <div className="flex flex-wrap gap-2">
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
      <div role="table" aria-label={`${exercise.name} sets`} className="mt-6">
        <div
          role="row"
          className="wk-label grid items-center text-center mb-3"
          style={{
            gridTemplateColumns: SET_TABLE_COLUMNS,
            columnGap: SET_TABLE_GAP,
            color: 'var(--color-text-secondary)',
          }}
        >
          <span role="columnheader">SET</span>
          <span role="columnheader">PREV</span>
          <span role="columnheader">WEIGHT</span>
          <span role="columnheader">{isTimed ? 'TIME' : 'REPS'}</span>
          <span role="columnheader" title="Reps in reserve">RIR</span>
          <span role="columnheader">DONE</span>
        </div>
        {/* At least 12 px apart between 48 px rows so touch areas never overlap. */}
        <div className="flex flex-col gap-3">
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
                  isTimed={isTimed}
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
            className={`${secondaryButton} mt-3`}
          >
            {perSide ? 'Log both sides together' : 'Log each side'}
          </button>
        )}
      </div>

      {/* Open session notes for cues, setup, pain/discomfort, and longitudinal Knowledge Graph insights */}
      <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label htmlFor={notesId} className="wk-label" style={{ color: 'var(--wk-muted)' }}>
            Session notes
          </label>
          {lastAthleteNote &&
            (onOpenNotesHistory ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenNotesHistory();
                }}
                title={`${lastAthleteNote.text} — open Training insights notes timeline`}
                className="wk-caption inline-flex items-center gap-1 min-h-[44px] max-w-[68%] truncate underline decoration-dotted underline-offset-2"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <span className="truncate">
                  Last ({lastAthleteNote.date}): &ldquo;{lastAthleteNote.text}&rdquo;
                </span>
              </button>
            ) : (
              <span className="wk-caption truncate max-w-[65%]" title={lastAthleteNote.text}>
                Last ({lastAthleteNote.date}): &ldquo;{lastAthleteNote.text}&rdquo;
              </span>
            ))}
        </div>
        <textarea
          id={notesId}
          rows={2}
          value={exercise.athleteNotes ?? ''}
          onChange={(e) => onUpdateNotes?.(e.target.value)}
          placeholder="Add cues, seat/pin setup, tightness, or how this felt…"
          className="wk-field w-full resize-none"
          style={{ fontSize: 16, minHeight: 56 }}
        />
      </div>
    </section>
  );
};
