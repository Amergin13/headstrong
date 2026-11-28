import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { ArrowDown, ArrowRightLeft, FileText, Flame, Info, Minus, Plus, X } from 'lucide-react';
import { OverflowMenu, OverflowMenuItem } from '../common/Header';
import { triggerHaptic } from '../../utils/haptics';
import { CoachSummaryText } from '../common/CoachSummaryText';
import { ExerciseInsight, isIsolationOrSmallExercise } from '../../services/exerciseInsight';
import { buildExerciseTrendSpec } from '../../services/exerciseDetails';
import { isAssistedExercise, isTimedExercise, usesOneDumbbell } from '../../engine/e1rm';
import { buildExerciseBridgeBands } from '../../engine/continuityEngine';
import { TrendChart } from '../common/TrendChart';
import { localDateString } from '../../utils/date';
import { formatSentenceCase } from '../../utils/typography';
import { isUnilateralExercise } from '../../services/movementStandards';

interface ExerciseCardProps {
  exerciseIndex?: number;
  totalExercises?: number;
  exercise: ExerciseSession;
  exerciseDef?: ExerciseDefinition;
  exerciseCatalog?: ExerciseDefinition[];
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
  onRemoveSet?: () => void;
  onMoveExerciseDown?: () => void;
  onSkipExerciseToday?: () => void;
  onOpenDetail?: () => void;
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
  /** Progressive disclosure: whether to show the per-set RIR column (default: true). */
  showRir?: boolean;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exerciseIndex,
  exercise,
  exerciseDef,
  exerciseCatalog = [],
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
  onRemoveSet,
  onMoveExerciseDown,
  onSkipExerciseToday,
  onOpenDetail,
  onOpenSwap,
  onOpenPlateCalc,
  muscleLabel,
  previousSets = [],
  insight,
  note,
  showSummary = true,
  showChart = true,
  showRir = true,
}) => {
  const units = useUnits();
  const [detailOpen, setDetailOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(() => Boolean(exercise.athleteNotes?.trim()));
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isTimed = isTimedExercise(exercise);
  const isAssisted = isAssistedExercise(exercise);
  const isIsolationView = !isTimed && isIsolationOrSmallExercise(exercise, exerciseDef);
  const unilateral = !isTimed && isUnilateralExercise(exercise);
  const [perSide, setPerSide] = useState(() => exercise.sets.some((s) => s.actualRepsLeft !== undefined));
  const notesId = useId();

  const bridgeBands = useMemo(
    () => (isTimed ? [] : buildExerciseBridgeBands(exercise.exerciseId, workouts, exerciseCatalog)),
    [isTimed, exercise.exerciseId, workouts, exerciseCatalog]
  );

  const firstWorkingSet = exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup');
  const plannedWeightKg = firstWorkingSet?.targetWeightKg ?? 0;
  const isBodyweightOnly =
    exercise.equipment === 'bodyweight' && (!exercise.isWeightedCalisthenic || plannedWeightKg === 0);
  const warmupCount = exercise.sets.filter((s) => s.isWarmup || s.setType === 'warmup').length;
  const isTwoDb = exercise.equipment === 'dumbbell' && !usesOneDumbbell(exercise);
  const chip = exercise.orderCode || (exerciseIndex !== undefined ? String(exerciseIndex) : null);
  const hasBestSetHistory = Boolean(insight?.bestSetHistory && insight.bestSetHistory.length > 0);
  const hasSavedNote = Boolean(exercise.athleteNotes?.trim());
  const showNotesSection = notesOpen || hasSavedNote;
  const trendSpec = useMemo(
    () =>
      buildExerciseTrendSpec(
        insight,
        isTimed,
        (kg) => units.formatPrecise(kg),
        localDateString,
        {
          isIsolation: isIsolationView,
          isTwoDumbbell: isTwoDb,
          formatWeight: (kg) => units.format(kg),
        }
      ),
    [insight, isTimed, units, isIsolationView, isTwoDb]
  );
  const chartAriaLabel =
    isIsolationView && hasBestSetHistory ? `Best set: ${trendSpec.label}` : trendSpec.label;

  const secondaryButton =
    'wk-btn-secondary justify-center normal-case min-h-[44px] active:scale-95 transition-transform';

  const exerciseMenuItems: OverflowMenuItem[] = [
    {
      id: 'details',
      label: 'Exercise details',
      ariaLabel: `Open exercise details, form and history for ${exercise.name}`,
      icon: <Info className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      onSelect: () => {
        triggerHaptic('light');
        if (onOpenDetail) onOpenDetail();
        else setDetailOpen(true);
      },
    },
    ...(onOpenSwap
      ? [
          {
            id: 'swap',
            label: 'Swap exercise',
            title: `Swap ${formatSentenceCase(exercise.name)}`,
            icon: <ArrowRightLeft className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
            onSelect: () => {
              triggerHaptic('light');
              onOpenSwap();
            },
          },
        ]
      : []),
    {
      id: 'note',
      label: hasSavedNote ? 'Edit note' : 'Add note',
      icon: <FileText className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      onSelect: () => {
        triggerHaptic('light');
        setNotesOpen(true);
        setTimeout(() => notesTextareaRef.current?.focus(), 0);
      },
    },
    {
      id: 'add-set',
      label: 'Add set',
      sectionBorderTop: true,
      icon: <Plus className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      onSelect: () => {
        triggerHaptic('light');
        onAddSet(false);
      },
    },
    ...(!isTimed
      ? [
          {
            id: 'add-warmup-set',
            label: 'Add warm-up set',
            icon: <Flame className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
            onSelect: () => {
              triggerHaptic('light');
              onAddSet(true);
            },
          },
        ]
      : []),
    ...(onRemoveSet && exercise.sets.length > 1 && exercise.sets.some((s) => !s.completed)
      ? [
          {
            id: 'remove-last-set',
            label: 'Remove last set',
            icon: <Minus className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
            onSelect: () => {
              triggerHaptic('light');
              onRemoveSet();
            },
          },
        ]
      : []),
    ...(onMoveExerciseDown
      ? [
          {
            id: 'move-down',
            label: 'Move down',
            sectionBorderTop: true,
            icon: <ArrowDown className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
            onSelect: () => {
              triggerHaptic('light');
              onMoveExerciseDown();
            },
          },
        ]
      : []),
    ...(onSkipExerciseToday
      ? [
          {
            id: 'skip-today',
            label: 'Skip today',
            sectionBorderTop: !onMoveExerciseDown,
            icon: <X className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
            onSelect: () => {
              triggerHaptic('light');
              onSkipExerciseToday();
            },
          },
        ]
      : []),
  ];

  return (
    <section aria-label={exercise.name} className="wk-card">
      {/* Title & 3-dot exercise options menu (details, swap, notes) */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center min-w-0 flex-wrap gap-2 pt-1">
          {chip && <span className="wk-pill shrink-0">{chip}</span>}
          <h3 className="wk-h1">{formatSentenceCase(exercise.name)}</h3>
        </div>
        <OverflowMenu
          triggerAriaLabel={`More options for ${exercise.name}`}
          triggerTitle={`Options for ${formatSentenceCase(exercise.name)}`}
          menuAriaLabel={`${formatSentenceCase(exercise.name)} options`}
          items={exerciseMenuItems}
        />
      </div>

      {/* 2-line dynamic summary (Line 1: Historical Trajectory Anchor, Line 2: Session Stimulus Directive) and minimal trend-line chart */}
      {insight && (showSummary || showChart) && (
        <div className="flex flex-col gap-3 mt-4">
          {showSummary && (
            <CoachSummaryText
              text={note ?? insight.summary}
              splitBy="lines"
            />
          )}
          {showChart && (
            <TrendChart
              points={trendSpec.points}
              format={trendSpec.format}
              positiveProgress={trendSpec.positiveProgress}
              bridgeBands={bridgeBands.length > 0 ? bridgeBands : undefined}
              height={180}
              variant="minimal"
              label={chartAriaLabel}
              emptyTitle={trendSpec.emptyTitle}
              emptyMessage={trendSpec.emptyMessage}
            />
          )}
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
                : isTwoDb
                ? 'Weight per dumbbell'
                : undefined
            }
          >
            WEIGHT
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
              // PREV is strictly the matching set from the last time this exact exercise was completed.
              const previous = isWarm ? undefined : previousSets[workingIndex - 1];
              return (
                <SetRow
                  key={s.id}
                  set={s}
                  displayBadge={displayBadge}
                  displayLabel={displayLabel}
                  previous={previous}
                  isEffortOnly={s.calibrationSource === 'EFFORT_ONLY' && !s.completed}
                  isBodyweight={isBodyweightOnly}
                  isDumbbell={exercise.equipment === 'dumbbell'}
                  isTwoDumbbell={isTwoDb}
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

      {/* Exercise notes drawer: hidden by default until opened from the 3-dot menu or when a note is present */}
      {showNotesSection && (
        <div className="mt-4 pt-3 border-t flex flex-col gap-2" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={notesId} className="wk-label" style={{ color: 'var(--wk-muted)' }}>
              Exercise notes
            </label>
            {!hasSavedNote && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setNotesOpen(false);
                }}
                className="wk-meta-title min-h-[44px] px-2 -my-2 flex items-center"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Hide
              </button>
            )}
          </div>
          <textarea
            ref={notesTextareaRef}
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
      )}

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
