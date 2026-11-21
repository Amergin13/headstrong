import React, { useId, useMemo, useState } from 'react';
import {
  ExerciseDefinition,
  ExerciseSession,
  ProgressionPrescription,
  ReadinessState,
  SubTierQuest,
  WorkoutSession,
  WorkoutSet,
} from '../../engine/types';
import { SetRow, PreviousSet, SET_TABLE_COLUMNS, SET_TABLE_COLUMNS_NO_RIR, SET_TABLE_GAP } from './SetRow';
import { ExerciseDetailModal } from './ExerciseDetailModal';
import { useUnits } from '../../utils/unitsContext';
import { ArrowRightLeft, ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { CoachSummaryText } from '../common/CoachSummaryText';
import { ExerciseInsight, isIsolationOrSmallExercise } from '../../services/exerciseInsight';
import { buildExerciseTrendSpec } from '../../services/exerciseDetails';
import { isAssistedExercise, usesOneDumbbell } from '../../engine/e1rm';
import { TrendChart } from '../common/TrendChart';
import { localDateString, parseLocalDate } from '../../utils/date';
import { getBodyweightLoadRatio, isTimedExercise } from '../../engine/e1rm';
import { formatSentenceCase } from '../../utils/typography';
import { isUnilateralExercise } from '../../services/movementStandards';

interface ExerciseCardProps {
  exerciseIndex?: number;
  totalExercises?: number;
  exercise: ExerciseSession;
  exerciseDef?: ExerciseDefinition;
  workouts?: WorkoutSession[];
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
  onOpenDetail?: () => void;
  onOpenSwap?: () => void;
  onOpenPlateCalc?: (weightKg: number) => void;
  /** Plain-English primary muscle, e.g. "Triceps". */
  muscleLabel?: string;
  /** Live intra-workout weekly hard-set volume for this lift's primary muscle (direct 1.0× + fractional 0.5×). */
  weeklyMuscleVolume?: {
    muscleName: string;
    total: number;
    direct: number;
    fractional: number;
    targetMin: number;
    targetMax: number;
    goalLabel: string;
    frequencyCue?: string;
  };
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
  /** Progressive disclosure: whether to show the per-set RIR column (default: true). */
  showRir?: boolean;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exerciseIndex,
  exercise,
  exerciseDef,
  workouts = [],
  prescription,
  readinessState,
  bodyweightKg = 0,
  lastAthleteNote,
  onUpdateNotes,
  onOpenNotesHistory,
  onUpdateSet,
  onCompleteSet,
  onAddSet,
  onOpenDetail,
  onOpenSwap,
  onOpenPlateCalc,
  muscleLabel,
  weeklyMuscleVolume,
  previousSets = [],
  insight,
  note,
  showSummary = true,
  showChart = true,
  showRir = true,
}) => {
  const units = useUnits();
  const [detailOpen, setDetailOpen] = useState(false);
  const [volumeExpanded, setVolumeExpanded] = useState(false);
  const isTimed = isTimedExercise(exercise);
  const isAssisted = isAssistedExercise(exercise);
  const isIsolationView = !isTimed && isIsolationOrSmallExercise(exercise, exerciseDef);
  const workingSets = exercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  const isBlockCompleted = workingSets.length > 0 && workingSets.every((s) => s.completed);
  const unilateral = !isTimed && isUnilateralExercise(exercise);
  const [perSide, setPerSide] = useState(() => exercise.sets.some((s) => s.actualRepsLeft !== undefined));
  const notesId = useId();

  const firstWorkingSet = exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup');
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
  const chip = exercise.orderCode || (exerciseIndex !== undefined ? String(exerciseIndex) : null);
  const trendSpec = useMemo(
    () => buildExerciseTrendSpec(insight, isTimed, (kg) => units.formatPrecise(kg), localDateString),
    [insight, isTimed, units]
  );

  const secondaryButton =
    'wk-btn-secondary justify-center normal-case min-h-[44px] active:scale-95 transition-transform';

  return (
    <section aria-label={exercise.name} className="wk-card">
      {/* Title, swap button, drill-in detail arrow */}
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
              if (onOpenDetail) onOpenDetail();
              else setDetailOpen(true);
            }}
            aria-label={`Open exercise details, form and history for ${exercise.name}`}
            title="Exercise info, form & history"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border-strong)] flex items-center justify-center shrink-0 transition-colors"
            style={{ background: 'var(--color-action-secondary-bg)', color: 'var(--color-action-secondary-fg)' }}
          >
            <ChevronRight
              className="wk-chevron"
              style={{ color: 'var(--color-action-secondary-fg)' }}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {(chip ||
        (!isTimed &&
          exercise.repTargetType !== 'form_failure' &&
          exercise.minReps > 0 &&
          exercise.maxReps > 0 &&
          exercise.minReps < exercise.maxReps) ||
        exercise.intensityProtocol ||
        countedBodyweightKg > 0 ||
        isBlockCompleted) && (
        <div className="flex items-center flex-wrap gap-2 mt-2">
          {chip && <span className="wk-pill">{chip}</span>}
          {!isTimed &&
            exercise.repTargetType !== 'form_failure' &&
            exercise.minReps > 0 &&
            exercise.maxReps > 0 &&
            exercise.minReps < exercise.maxReps && (
              <span className="wk-pill tabular-nums">
                {exercise.minReps}–{exercise.maxReps} reps
              </span>
            )}
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
          {isAssisted && (
            <span className="wk-pill">Assisted (lower = harder)</span>
          )}
          {countedBodyweightKg > 0 && !isAssisted && (
            <span className="wk-pill tabular-nums">
              {units.format(countedBodyweightKg)} bodyweight counted
            </span>
          )}
        </div>
      )}

      {prescription.repCeilingExplanation && (
        <p className="wk-caption mt-2 max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
          {prescription.repCeilingExplanation}
        </p>
      )}

      {weeklyMuscleVolume && (
        <div className="mt-3">
          <button
            type="button"
            aria-pressed={volumeExpanded}
            aria-label={`${weeklyMuscleVolume.muscleName} weekly volume: ${weeklyMuscleVolume.total} of ${weeklyMuscleVolume.targetMin} to ${weeklyMuscleVolume.targetMax} hard sets. Tap to toggle direct and fractional breakdown.`}
            onClick={() => {
              triggerHaptic('light');
              setVolumeExpanded((prev) => !prev);
            }}
            className="w-full text-left rounded-xl px-3 py-2 border min-h-[44px] flex flex-col justify-center gap-2 transition-colors"
            style={{ background: 'var(--wk-raised)', borderColor: 'var(--color-border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                {weeklyMuscleVolume.muscleName} this week
              </span>
              <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {weeklyMuscleVolume.total} of {weeklyMuscleVolume.targetMin}–{weeklyMuscleVolume.targetMax} hard sets
              </span>
            </div>
            <div className="wk-bar" aria-hidden="true">
              <div
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((weeklyMuscleVolume.total / Math.max(1, weeklyMuscleVolume.targetMax)) * 100)
                  )}%`,
                }}
              />
            </div>
            {volumeExpanded && (
              <div className="flex flex-col gap-1 pt-1 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <span className="wk-caption tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                  {weeklyMuscleVolume.direct} direct (1.0×) + {weeklyMuscleVolume.fractional} fractional (0.5×)
                </span>
                <span className="wk-caption" style={{ color: 'var(--wk-muted)' }}>
                  {weeklyMuscleVolume.goalLabel} ({weeklyMuscleVolume.targetMin}–{weeklyMuscleVolume.targetMax} sets/wk)
                  {weeklyMuscleVolume.frequencyCue ? ` · ${weeklyMuscleVolume.frequencyCue}` : ''}
                </span>
              </div>
            )}
          </button>
        </div>
      )}

      {/* 2-line dynamic summary (Line 1: Historical Trajectory Anchor, Line 2: Session Stimulus Directive) and history chart */}
      {insight && (showSummary || showChart) && (
        <div className="flex flex-col gap-3 mt-4">
          {showSummary && (
            <CoachSummaryText
              text={note ?? insight.summary}
              splitBy="lines"
            />
          )}
          {showChart && isIsolationView ? (
            (() => {
              const sessions = (insight.bestSetHistory ?? []).slice(-6);
              const latest = sessions[sessions.length - 1];
              const targetMaxReps = Math.max(1, exercise.maxReps || 15);
              const repPct = latest ? Math.min(100, Math.round((latest.reps / targetMaxReps) * 100)) : 0;
              const shortDate = (date: string) => {
                const d = parseLocalDate(date);
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
              };
              const isTwoDb = exercise.equipment === 'dumbbell' && !usesOneDumbbell(exercise);
              const fmtSet = (w: number, r: number) =>
                w > 0 ? `${units.formatPrecise(w)}${isTwoDb ? '/DB' : ''} × ${r}` : `${r} reps`;
              return (
                <div
                  role="region"
                  aria-label={`${exercise.name} best set progression`}
                  className="rounded-xl p-3 border flex flex-col gap-3"
                  style={{ background: 'var(--wk-raised)', borderColor: 'var(--color-border-subtle)' }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="wk-label">Best set · reps at weight</span>
                    {latest && (
                      <span className="wk-subhead tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                        {fmtSet(latest.weightKg, latest.reps)}
                      </span>
                    )}
                  </div>
                  {sessions.length === 0 ? (
                    <p className="wk-caption">
                      No history yet. Complete working sets to record your starting best set.
                    </p>
                  ) : (
                    <>
                      {latest && (
                        <div>
                          <div className="flex items-center justify-between wk-caption mb-1 tabular-nums">
                            <span>
                              {latest.weightKg > 0 ? `At ${units.formatPrecise(latest.weightKg)}${isTwoDb ? '/DB' : ''}` : 'Bodyweight'}
                            </span>
                            <span>
                              {latest.reps} / {targetMaxReps} reps
                            </span>
                          </div>
                          <div
                            className="wk-bar"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={targetMaxReps}
                            aria-valuenow={latest.reps}
                            aria-label={`${latest.reps} of ${targetMaxReps} target reps`}
                          >
                            <div style={{ width: `${repPct}%` }} />
                          </div>
                        </div>
                      )}
                      <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {sessions.map((pt, i) => {
                          const isLatest = i === sessions.length - 1;
                          return (
                            <li
                              key={`${pt.date}-${i}`}
                              className="rounded-lg px-3 py-2 border flex flex-col gap-1"
                              style={{
                                background: isLatest ? 'var(--color-status-positive-soft)' : 'var(--wk-card)',
                                borderColor: isLatest ? 'var(--wk-accent)' : 'var(--color-border-subtle)',
                              }}
                            >
                              <span className="wk-caption tabular-nums">{shortDate(pt.date)}</span>
                              <span
                                className="text-xs font-semibold tabular-nums"
                                style={{ color: isLatest ? 'var(--wk-accent)' : 'var(--color-text-primary)' }}
                              >
                                {fmtSet(pt.weightKg, pt.reps)}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  )}
                </div>
              );
            })()
          ) : showChart ? (
            <TrendChart
              points={trendSpec.points}
              format={trendSpec.format}
              height={240}
              label={trendSpec.label}
              emptyTitle={trendSpec.emptyTitle}
              emptyMessage={trendSpec.emptyMessage}
            />
          ) : null}
        </div>
      )}

      {/* Set table */}
      <div role="table" aria-label={`${exercise.name} sets`} className="mt-6">
        <div
          role="row"
          className="wk-label grid items-center text-center mb-3"
          style={{
            gridTemplateColumns: showRir ? SET_TABLE_COLUMNS : SET_TABLE_COLUMNS_NO_RIR,
            columnGap: SET_TABLE_GAP,
            color: 'var(--color-text-secondary)',
          }}
        >
          <span role="columnheader">SET</span>
          <span role="columnheader">PREV</span>
          <span
            role="columnheader"
            title={
              isAssisted
                ? 'Counterweight assistance (lower = harder)'
                : exercise.equipment === 'dumbbell' && !usesOneDumbbell(exercise)
                ? 'Weight per dumbbell'
                : undefined
            }
          >
            {isAssisted ? 'ASSIST' : exercise.equipment === 'dumbbell' && !usesOneDumbbell(exercise) ? 'PER DB' : 'WEIGHT'}
          </span>
          <span role="columnheader">{isTimed ? 'TIME' : 'REPS'}</span>
          {showRir && <span role="columnheader" title="Reps in reserve">RIR</span>}
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
                  isTwoDumbbell={exercise.equipment === 'dumbbell' && !usesOneDumbbell(exercise)}
                  isTimed={isTimed}
                  showRir={showRir}
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

      {/* Open exercise notes for cues, setup, pain/discomfort, and longitudinal Knowledge Graph insights */}
      <div className="mt-4 pt-3 border-t flex flex-col gap-2" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <label htmlFor={notesId} className="wk-label" style={{ color: 'var(--wk-muted)' }}>
          Exercise notes
        </label>
        <textarea
          id={notesId}
          rows={2}
          value={exercise.athleteNotes ?? ''}
          onChange={(e) => onUpdateNotes?.(e.target.value)}
          placeholder="Add cues, seat/pin setup, tightness, or how this felt…"
          className="wk-textarea resize-none"
        />
        {lastAthleteNote &&
          (onOpenNotesHistory ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenNotesHistory();
              }}
              title={`${lastAthleteNote.text} — open exercise notes history`}
              className="wk-caption w-full text-left flex items-center gap-1 min-h-[44px] underline decoration-dotted underline-offset-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <span className="truncate">
                Last note ({lastAthleteNote.date}): &ldquo;{lastAthleteNote.text}&rdquo;
              </span>
            </button>
          ) : (
            <p className="wk-caption truncate" title={lastAthleteNote.text}>
              Last note ({lastAthleteNote.date}): &ldquo;{lastAthleteNote.text}&rdquo;
            </p>
          ))}
      </div>

      {detailOpen && !onOpenDetail && (
        <ExerciseDetailModal
          exercise={exercise}
          exerciseDef={exerciseDef}
          workouts={workouts}
          insight={insight}
          bodyweightKg={bodyweightKg}
          muscleLabel={muscleLabel}
          prescription={prescription}
          readinessState={readinessState}
          onAddSet={onAddSet}
          onOpenSwap={onOpenSwap}
          onOpenPlateCalc={onOpenPlateCalc}
          onOpenNotesHistory={onOpenNotesHistory}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </section>
  );
};
