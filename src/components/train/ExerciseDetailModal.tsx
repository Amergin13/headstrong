import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, Disc, Plus, Sparkles, X } from 'lucide-react';
import type { CoachIntervention } from '../../services/coachInterventions';
import {
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  ProgressionPrescription,
  ReadinessState,
  WorkoutSession,
} from '../../engine/types';
import { isTimedExercise } from '../../engine/e1rm';
import { ExerciseInsight } from '../../services/exerciseInsight';
import { buildExerciseDetailModel, buildExerciseTrendSpec } from '../../services/exerciseDetails';
import { formatSentenceCase } from '../../utils/typography';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import { localDateString, parseLocalDate } from '../../utils/date';
import { TrendChart } from '../common/TrendChart';
import { TempoPacer } from './TempoPacer';

interface ExerciseDetailModalProps {
  exercise: ExerciseSession;
  exerciseDef?: ExerciseDefinition;
  workouts?: WorkoutSession[];
  biometrics?: BiometricLog[];
  insight?: ExerciseInsight;
  bodyweightKg?: number;
  muscleLabel?: string;
  prescription?: ProgressionPrescription;
  readinessState?: ReadinessState;
  onAddSet?: (isWarmup?: boolean) => void;
  onOpenSwap?: () => void;
  onOpenPlateCalc?: (weightKg: number) => void;
  onOpenNotesHistory?: () => void;
  /** Contextual OOUX HITL intervention surfaced for this movement, when applicable. */
  intervention?: CoachIntervention;
  /** Launches Treise coach with a contextual HITL adaptation prompt for this movement. */
  onAskCoachToAdapt?: (prompt: string, exerciseId?: string) => void;
  onClose: () => void;
}

function formatSessionDate(dateStr: string): string {
  const parsed = parseLocalDate(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export const ExerciseDetailModal: React.FC<ExerciseDetailModalProps> = ({
  exercise,
  exerciseDef,
  workouts = [],
  biometrics,
  insight,
  bodyweightKg = 0,
  muscleLabel,
  prescription,
  readinessState = 'Normal',
  onAddSet,
  onOpenSwap,
  onOpenPlateCalc,
  onOpenNotesHistory,
  intervention,
  onAskCoachToAdapt,
  onClose,
}) => {
  const units = useUnits();
  const pressedBackdrop = useRef(false);
  const [setAddedNotice, setSetAddedNotice] = useState<string | null>(null);
  const isTimed = isTimedExercise(exercise);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerHaptic('light');
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const firstWorkingSet = exercise.sets.find((s) => !s.isWarmup && s.setType !== 'warmup');
  const currentWeight = firstWorkingSet?.targetWeightKg ?? exercise.sets[0]?.targetWeightKg ?? 20;
  const plannedWeightKg = firstWorkingSet?.targetWeightKg ?? 0;
  const isBodyweightOnly =
    exercise.equipment === 'bodyweight' && (!exercise.isWeightedCalisthenic || plannedWeightKg === 0);
  const workingSets = exercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  const isCompleted = workingSets.length > 0 && workingSets.every((s) => s.completed);

  const detail = useMemo(
    () =>
      buildExerciseDetailModel({
        exercise,
        exerciseDef,
        workouts,
        biometrics,
        insight,
        bodyweightKg,
        muscleLabel,
        prescription,
        readinessState,
        formatWeight: (kg) => units.format(kg),
        formatPreciseWeight: (kg) => units.formatPrecise(kg),
      }),
    [
      exercise,
      exerciseDef,
      workouts,
      biometrics,
      insight,
      bodyweightKg,
      muscleLabel,
      prescription,
      readinessState,
      units,
    ]
  );

  const trendSpec = useMemo(
    () => buildExerciseTrendSpec(insight, isTimed, (kg) => units.formatPrecise(kg), localDateString),
    [insight, isTimed, units]
  );

  const secondaryButton =
    'wk-btn-secondary justify-center normal-case min-h-[44px] active:scale-95 transition-transform';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${formatSentenceCase(exercise.name)} details, form and history`}
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-bg-scrim)' }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) {
          triggerHaptic('light');
          onClose();
        }
      }}
    >
      <div className="wk-card w-full max-w-lg max-h-[88vh] overflow-y-auto shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-2">
              {exercise.orderCode && <span className="wk-pill">{exercise.orderCode}</span>}
              <span className="wk-pill">{detail.equipmentLabel}</span>
              <span className="wk-pill">{detail.primaryMuscle}</span>
            </div>
            <h2 className="wk-h1">{formatSentenceCase(detail.title)}</h2>
            <p className="wk-caption mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {detail.movementPattern}
              {detail.resistanceLabel ? ` · ${detail.resistanceLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label={`Close details for ${exercise.name}`}
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-colors shrink-0"
            style={{
              background: 'var(--wk-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X className="w-5 h-5 stroke-[2]" aria-hidden="true" />
          </button>
        </div>

        {/* Overview, Muscles & Target */}
        <section aria-label="Exercise overview and target" className="wk-raised space-y-3">
          {detail.overviewText && (
            <p className="wk-body max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
              {detail.overviewText}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <dt className="wk-label">Muscles worked</dt>
              <dd className="wk-body mt-1" style={{ color: 'var(--color-text-primary)' }}>
                {detail.primaryMuscle}
                {detail.secondaryMuscles.length > 0 && (
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {` · ${detail.secondaryMuscles.join(', ')}`}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="wk-label">Today&apos;s target</dt>
              <dd className="wk-body mt-1 tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {detail.targetSummary}
                {detail.restLabel ? ` · ${detail.restLabel} rest` : ''}
              </dd>
            </div>
            {detail.joints.length > 0 && (
              <div>
                <dt className="wk-label">Joint focus</dt>
                <dd className="wk-body mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {detail.joints.join(', ')}
                </dd>
              </div>
            )}
            {detail.tempoBreakdown && (
              <div>
                <dt className="wk-label">Tempo</dt>
                <dd className="wk-body mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {detail.tempoBreakdown}
                </dd>
              </div>
            )}
            {prescription?.reason && (
              <div className={detail.joints.length > 0 && !detail.tempoBreakdown ? '' : 'col-span-2'}>
                <dt className="wk-label">Load progression</dt>
                <dd className="wk-body mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {prescription.reason}
                </dd>
              </div>
            )}
          </dl>
          {detail.readinessNote && (
            <p
              className="wk-caption pt-2 border-t"
              style={{
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-status-warning)',
              }}
            >
              {detail.readinessNote}
            </p>
          )}
          {intervention && onAskCoachToAdapt && (
            <div
              className="wk-raised flex flex-col gap-2 mt-2"
              style={{
                borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)',
              }}
            >
              <div className="flex items-start gap-2">
                <Sparkles
                  className="w-4 h-4 shrink-0 mt-1"
                  style={{ color: 'var(--color-coach-accent)' }}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="wk-subhead" style={{ color: 'var(--color-coach-accent)' }}>
                    {intervention.title}
                  </div>
                  <p className="wk-caption mt-1 max-w-prose">
                    {intervention.rationale}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={secondaryButton}
                style={{
                  borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)',
                }}
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                  onAskCoachToAdapt(intervention.coachPrompt, exercise.exerciseId);
                }}
              >
                <Sparkles
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--color-coach-accent)' }}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
                <span>{intervention.ctaLabel}</span>
              </button>
            </div>
          )}
        </section>

        {/* Form & Execution */}
        <section aria-label="Form and execution" className="space-y-3">
          <h3 className="wk-label">Form &amp; execution</h3>
          {detail.biomechanicalCue && (
            <p className="wk-body max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
              {detail.biomechanicalCue}
            </p>
          )}
          <ol className="space-y-2">
            {detail.formSteps.map((step, idx) => (
              <li key={idx} className="wk-body flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0 tabular-nums wk-caption"
                  style={{
                    background: 'var(--wk-raised)',
                    border: '1px solid var(--color-border-subtle)',
                    color: 'var(--color-text-secondary)',
                    marginTop: 2,
                  }}
                >
                  {idx + 1}
                </span>
                <span className="max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
                  {step}
                </span>
              </li>
            ))}
          </ol>

          {detail.intensityProtocol && (
            <div className="wk-raised">
              <span className="wk-label block mb-1">{detail.intensityProtocol.name}</span>
              <p className="wk-body max-w-prose">{detail.intensityProtocol.instruction}</p>
            </div>
          )}

          {detail.hasTempoPacer && exercise.tempo && <TempoPacer tempo={exercise.tempo} />}

          {!detail.hasTempoPacer && detail.customTempoText && (
            <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
              Tempo / duration target: {detail.customTempoText}
            </p>
          )}

          {detail.warmupSteps.length > 0 && (
            <div className="wk-raised space-y-2">
              <span className="wk-label block">Warm-up ramp</span>
              <ul className="space-y-1">
                {detail.warmupSteps.map((step) => (
                  <li
                    key={step.setNumber}
                    className="wk-body flex items-center justify-between gap-2 tabular-nums"
                  >
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {units.format(step.targetWeightKg)} × {step.reps}
                    </span>
                    <span className="wk-caption">
                      {step.percentage}% · {step.restLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(onAddSet || onOpenPlateCalc || onOpenSwap || (!isCompleted && onAskCoachToAdapt)) && (
            <div className="pt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                {onOpenSwap && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      triggerHaptic('light');
                      onClose();
                      onOpenSwap();
                    }}
                  >
                    <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Swap exercise</span>
                  </button>
                )}
                {!isCompleted && onAskCoachToAdapt && (
                  <button
                    type="button"
                    className={secondaryButton}
                    style={{
                      borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)',
                    }}
                    onClick={() => {
                      triggerHaptic('light');
                      onClose();
                      onAskCoachToAdapt(
                        `Swap ${exercise.name} across my whole program`,
                        exercise.exerciseId
                      );
                    }}
                  >
                    <Sparkles
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--color-coach-accent)' }}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                    <span>Swap in program</span>
                  </button>
                )}
                {onOpenPlateCalc && exercise.equipment === 'barbell' && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      triggerHaptic('light');
                      onClose();
                      onOpenPlateCalc(currentWeight);
                    }}
                  >
                    <Disc className="w-4 h-4" aria-hidden="true" />
                    <span>Plates</span>
                  </button>
                )}
                {onAddSet && !isBodyweightOnly && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      triggerHaptic('light');
                      onAddSet(true);
                      setSetAddedNotice('Warm-up set added to today’s table.');
                    }}
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Warm-up set</span>
                  </button>
                )}
                {onAddSet && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      triggerHaptic('light');
                      onAddSet(false);
                      setSetAddedNotice('Working set added to today’s table.');
                    }}
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Add set</span>
                  </button>
                )}
              </div>
              {setAddedNotice && (
                <p
                  role="status"
                  className="wk-caption"
                  style={{ color: 'var(--color-status-positive)' }}
                >
                  {setAddedNotice}
                </p>
              )}
            </div>
          )}
        </section>

        {/* History & Performance */}
        <section
          aria-label="History and performance"
          className="space-y-4 pt-4 border-t"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="wk-label">History &amp; performance</h3>
            {onOpenNotesHistory && detail.loggedSessions.some((s) => Boolean(s.athleteNote)) && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                  onOpenNotesHistory();
                }}
                className="wk-caption min-h-[44px] inline-flex items-center underline decoration-dotted underline-offset-2"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                All session notes
              </button>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-2">
            <div className="wk-raised min-w-0">
              <dt className="wk-label">Sessions</dt>
              <dd className="wk-title tabular-nums whitespace-nowrap mt-1">{detail.sessionCount}</dd>
            </div>
            <div className="wk-raised min-w-0">
              <dt className="wk-label">Latest</dt>
              <dd className="wk-title tabular-nums whitespace-nowrap mt-1">{detail.latestDisplay}</dd>
            </div>
            <div className="wk-raised min-w-0">
              <dt className="wk-label">Best</dt>
              <dd
                className="wk-title tabular-nums whitespace-nowrap mt-1"
                style={{ color: detail.bestDisplay !== '—' ? 'var(--color-status-positive)' : 'var(--color-text-primary)' }}
              >
                {detail.bestDisplay}
              </dd>
            </div>
          </dl>

          {insight && (
            <TrendChart
              points={trendSpec.points}
              format={trendSpec.format}
              height={200}
              label={trendSpec.label}
              emptyTitle={trendSpec.emptyTitle}
              emptyMessage={trendSpec.emptyMessage}
            />
          )}

          {detail.loggedSessions.length === 0 ? (
            <p className="wk-body">
              No completed sessions logged for {formatSentenceCase(exercise.name)} yet. Finished working sets will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {detail.loggedSessions.slice(0, 8).map((entry) => (
                <li
                  key={entry.workoutId}
                  className="wk-raised space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="wk-subhead">{formatSessionDate(entry.date)}</span>
                    {entry.bestE1rmKg > 0 && (
                      <span className="wk-caption tabular-nums">
                        {isTimed
                          ? `${Math.round(entry.bestE1rmKg)}s top`
                          : `${units.formatPrecise(entry.bestE1rmKg)} E1RM`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {entry.sets.map((st, idx) => (
                      <span
                        key={idx}
                        className="wk-pill tabular-nums"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {st.durationSeconds && st.durationSeconds > 0
                          ? st.weightKg > 0
                            ? `${units.format(st.weightKg)} × ${st.durationSeconds}s`
                            : `${st.durationSeconds}s`
                          : st.perSide && st.repsLeft !== undefined && st.repsRight !== undefined
                          ? `${st.weightKg > 0 ? `${units.format(st.weightKg)} × ` : ''}${st.repsLeft}/${st.repsRight}`
                          : st.weightKg > 0
                          ? `${units.format(st.weightKg)} × ${st.reps}`
                          : `${st.reps} reps`}
                        {st.rir !== undefined ? ` @${st.rir}R` : ''}
                      </span>
                    ))}
                  </div>
                  {entry.athleteNote && (
                    <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                      &ldquo;{entry.athleteNote}&rdquo;
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>,
    document.body
  );
};
