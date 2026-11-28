import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, Disc, Plus, Sparkles, X } from 'lucide-react';
import { InterventionActionBar } from '../common/Header';
import type { CoachIntervention } from '../../services/coachInterventions';
import {
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  ProgressionPrescription,
  ReadinessState,
  WorkoutSession,
} from '../../engine/types';
import { isTimedExercise, usesOneDumbbell } from '../../engine/e1rm';
import { buildExerciseBridgeBands } from '../../engine/continuityEngine';
import { buildExerciseInsight, ExerciseInsight, isIsolationOrSmallExercise } from '../../services/exerciseInsight';
import {
  buildExerciseDetailModel,
  buildExerciseTrendSpec,
  buildExerciseWeeklyVolume,
  ExerciseWeeklyMuscleVolume,
} from '../../services/exerciseDetails';
import { formatSentenceCase } from '../../utils/typography';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';
import { localDateString, parseLocalDate } from '../../utils/date';
import { TrendChart } from '../common/TrendChart';
import { TempoPacer } from './TempoPacer';
import { getExerciseFormClip } from '../../services/exerciseFormClips';
import { ExerciseFormClipPlayer } from './ExerciseFormClipPlayer';

export type ExerciseDetailTab = 'overview' | 'form' | 'history';

const TABS: { id: ExerciseDetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'form', label: 'Form' },
  { id: 'history', label: 'History' },
];

export interface ExerciseDetailModalProps {
  exercise: ExerciseSession;
  exerciseDef?: ExerciseDefinition;
  exerciseCatalog?: ExerciseDefinition[];
  workouts?: WorkoutSession[];
  activeWorkout?: WorkoutSession;
  biometrics?: BiometricLog[];
  insight?: ExerciseInsight;
  bodyweightKg?: number;
  muscleLabel?: string;
  goalPhase?: GoalPhase;
  /** Optional pre-computed weekly volume for this exercise's primary muscle (computed automatically if omitted). */
  weeklyMuscleVolume?: ExerciseWeeklyMuscleVolume;
  prescription?: ProgressionPrescription;
  readinessState?: ReadinessState;
  /** Optional starting tab; defaults to Overview for a consistent view from every entry point. */
  initialTab?: ExerciseDetailTab;
  onAddSet?: (isWarmup?: boolean) => void;
  onOpenSwap?: () => void;
  onOpenPlateCalc?: (weightKg: number) => void;
  onOpenNotesHistory?: () => void;
  /** Contextual OOUX HITL intervention surfaced for this movement, when applicable. */
  intervention?: CoachIntervention;
  /** Directly accepts the surfaced intervention and persists changes across the product. */
  onAcceptIntervention?: (intervention: CoachIntervention) => void;
  /** Directly dismisses the surfaced intervention and persists dismissal across the product. */
  onDismissIntervention?: (intervention: CoachIntervention) => void;
  /** Launches Treise coach with a contextual HITL adaptation prompt for this movement. */
  onAskCoachToAdapt?: (prompt: string, exerciseId?: string) => void;
  /** Opens Treise coach focused on this exercise without auto-submitting a mutation. */
  onAskCoach?: (exerciseId: string) => void;
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
  exerciseCatalog,
  workouts = [],
  activeWorkout,
  biometrics,
  insight,
  bodyweightKg = 0,
  muscleLabel,
  goalPhase = 'Lean Bulk',
  weeklyMuscleVolume,
  prescription,
  readinessState = 'Normal',
  initialTab = 'overview',
  onAddSet,
  onOpenSwap,
  onOpenPlateCalc,
  onOpenNotesHistory,
  intervention,
  onAcceptIntervention,
  onDismissIntervention,
  onAskCoachToAdapt,
  onAskCoach,
  onClose,
}) => {
  const units = useUnits();
  const uid = useId();
  const pressedBackdrop = useRef(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ExerciseDetailTab>(initialTab);
  const [setAddedNotice, setSetAddedNotice] = useState<string | null>(null);
  const [resolvingIntervention, setResolvingIntervention] = useState<{
    item: CoachIntervention;
    phase: 'accepted' | 'exiting' | 'dismissing';
  } | null>(null);
  const interventionTimersRef = useRef<number[]>([]);
  const isTimed = isTimedExercise(exercise);

  useEffect(() => {
    return () => {
      interventionTimersRef.current.forEach((id) => window.clearTimeout(id));
      interventionTimersRef.current = [];
    };
  }, []);

  const scheduleIntervention = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    interventionTimersRef.current.push(id);
  };

  const displayIntervention = resolvingIntervention?.item ?? intervention;
  const isInterventionAccepted =
    resolvingIntervention?.phase === 'accepted' || resolvingIntervention?.phase === 'exiting';
  const isInterventionFading =
    resolvingIntervention?.phase === 'exiting' || resolvingIntervention?.phase === 'dismissing';

  const handleAcceptDetailIntervention = (item: CoachIntervention) => {
    if (resolvingIntervention || !onAcceptIntervention) return;
    triggerHaptic('success');
    setResolvingIntervention({ item, phase: 'accepted' });
    onAcceptIntervention(item);
    scheduleIntervention(
      () => setResolvingIntervention((prev) => (prev ? { ...prev, phase: 'exiting' } : null)),
      900
    );
    scheduleIntervention(() => setResolvingIntervention(null), 1120);
  };

  const handleDismissDetailIntervention = (item: CoachIntervention) => {
    if (resolvingIntervention || !onDismissIntervention) return;
    triggerHaptic('light');
    setResolvingIntervention({ item, phase: 'dismissing' });
    onDismissIntervention(item);
    scheduleIntervention(() => setResolvingIntervention(null), 180);
  };

  useEffect(() => {
    setActiveTab(initialTab);
    setSetAddedNotice(null);
  }, [exercise.exerciseId, initialTab]);

  useEffect(() => {
    scrollBodyRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

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

  const workingSets = exercise.sets.filter((s) => !s.isWarmup && s.setType !== 'warmup');
  const hasActiveTarget = workingSets.length > 0;
  const firstWorkingSet = workingSets[0];
  const currentWeight = firstWorkingSet?.targetWeightKg ?? exercise.sets[0]?.targetWeightKg ?? 20;
  const plannedWeightKg = firstWorkingSet?.targetWeightKg ?? 0;
  const isBodyweightOnly =
    exercise.equipment === 'bodyweight' && (!exercise.isWeightedCalisthenic || plannedWeightKg === 0);
  const isCompleted = hasActiveTarget && workingSets.every((s) => s.completed);

  const resolvedInsight = useMemo(() => {
    if (insight) return insight;
    return buildExerciseInsight(
      exercise,
      workouts,
      readinessState,
      bodyweightKg,
      Math.max(12, workouts.length),
      (kg) => units.formatPrecise(kg),
      biometrics,
      muscleLabel,
      goalPhase
    );
  }, [insight, exercise, workouts, readinessState, bodyweightKg, units, biometrics, muscleLabel, goalPhase]);

  const detail = useMemo(
    () =>
      buildExerciseDetailModel({
        exercise,
        exerciseDef,
        workouts,
        biometrics,
        insight: resolvedInsight,
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
      resolvedInsight,
      bodyweightKg,
      muscleLabel,
      prescription,
      readinessState,
      units,
    ]
  );

  const isIsolationView = !isTimed && isIsolationOrSmallExercise(exercise, exerciseDef);
  const isTwoDb = exercise.equipment === 'dumbbell' && !usesOneDumbbell(exercise);
  const trendSpec = useMemo(
    () =>
      buildExerciseTrendSpec(
        resolvedInsight,
        isTimed,
        (kg) => units.formatPrecise(kg),
        localDateString,
        {
          isIsolation: isIsolationView,
          isTwoDumbbell: isTwoDb,
          formatWeight: (kg) => units.format(kg),
        }
      ),
    [resolvedInsight, isTimed, units, isIsolationView, isTwoDb]
  );

  const formClip = useMemo(
    () => getExerciseFormClip(exerciseDef ?? exercise),
    [exerciseDef, exercise]
  );

  const resolvedWeeklyVolume = useMemo(
    () =>
      weeklyMuscleVolume ??
      buildExerciseWeeklyVolume({
        exercise,
        exerciseDef,
        workouts,
        activeWorkout,
        exerciseCatalog,
        goalPhase,
      }),
    [weeklyMuscleVolume, exercise, exerciseDef, workouts, activeWorkout, exerciseCatalog, goalPhase]
  );

  const secondaryButton =
    'wk-btn-secondary justify-center normal-case min-h-[44px] active:scale-95 transition-transform';

  const hasQuickActions = Boolean(
    onAddSet || onOpenPlateCalc || onOpenSwap || onAskCoach || (!isCompleted && onAskCoachToAdapt)
  );

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length;
    triggerHaptic('light');
    setActiveTab(TABS[nextIdx].id);
  };

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
      <div className="wk-card w-full max-w-lg max-h-[88vh] shadow-2xl flex flex-col overflow-hidden p-0">
        {/* Persistent Header + 3-Tab Segmented Navigation */}
        <div
          className="px-4 pt-4 pb-3 border-b shrink-0 flex flex-col gap-3"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="wk-caption block" style={{ color: 'var(--color-text-secondary)' }}>
                {detail.equipmentLabel} · {detail.primaryMuscle}
              </span>
              <div className="flex items-center flex-wrap gap-2 mt-1">
                {exercise.orderCode && <span className="wk-pill shrink-0">{exercise.orderCode}</span>}
                <h2 className="wk-h1">{formatSentenceCase(detail.title)}</h2>
              </div>
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

          <div
            role="tablist"
            aria-label="Exercise sections"
            className="wk-segments grid-cols-3"
          >
            {TABS.map((tab, idx) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`${uid}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${uid}-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveTab(tab.id);
                  }}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={`wk-segment ${selected ? 'is-active' : ''}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Panel Scroll Body */}
        <div
          ref={scrollBodyRef}
          className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
        >
          {/* TAB 1: OVERVIEW — Immediate target, progression, quick workout tools & anatomy */}
          {activeTab === 'overview' && (
            <div
              id={`${uid}-panel-overview`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-overview`}
              className="flex flex-col gap-4"
            >
              {displayIntervention && (onAcceptIntervention || onAskCoachToAdapt) && (
                <section
                  aria-label="Suggested coaching adjustment"
                  className={`wk-raised flex flex-col gap-3 border transition-all duration-200 ${
                    isInterventionFading ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'
                  }`}
                  style={{
                    borderColor: isInterventionAccepted
                      ? 'rgb(var(--color-accent-primary-rgb) / 0.5)'
                      : 'rgb(var(--color-coach-accent-rgb) / 0.35)',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <Sparkles
                      className="w-4 h-4 shrink-0 mt-1"
                      style={{
                        color: isInterventionAccepted ? 'var(--wk-accent)' : 'var(--color-coach-accent)',
                      }}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div
                        className="wk-subhead"
                        style={{
                          color: isInterventionAccepted ? 'var(--wk-accent)' : 'var(--color-coach-accent)',
                        }}
                      >
                        {formatSentenceCase(displayIntervention.title)}
                      </div>
                      <p className="wk-caption mt-1 max-w-prose">
                        {displayIntervention.rationale}
                      </p>
                    </div>
                  </div>
                  {onAcceptIntervention && onDismissIntervention ? (
                    <InterventionActionBar
                      applied={isInterventionAccepted}
                      onAccept={() => handleAcceptDetailIntervention(displayIntervention)}
                      onDismiss={() => handleDismissDetailIntervention(displayIntervention)}
                      disabled={Boolean(resolvingIntervention)}
                      acceptLabel="Accept"
                      dismissLabel="Dismiss"
                      appliedLabel="Applied to your plan"
                    />
                  ) : (
                    onAskCoachToAdapt && (
                      <button
                        type="button"
                        className={secondaryButton}
                        style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
                        onClick={() => {
                          triggerHaptic('light');
                          onClose();
                          onAskCoachToAdapt(displayIntervention.coachPrompt, exercise.exerciseId);
                        }}
                      >
                        <Sparkles
                          className="w-4 h-4 shrink-0"
                          style={{ color: 'var(--color-coach-accent)' }}
                          strokeWidth={2.2}
                          aria-hidden="true"
                        />
                        <span>{displayIntervention.ctaLabel}</span>
                      </button>
                    )
                  )}
                </section>
              )}

              {/* Primary Focus Card: Today's Target (in workout) OR Performance Snapshot (outside workout) */}
              <section aria-label="Exercise overview and target" className="wk-raised flex flex-col gap-3">
                {hasActiveTarget ? (
                  <div>
                    <span className="wk-label block">Today&apos;s target</span>
                    <p className="wk-subhead tabular-nums mt-1" style={{ color: 'var(--color-text-primary)' }}>
                      {detail.targetSummary}
                      {detail.restLabel ? ` · ${detail.restLabel} rest` : ''}
                    </p>
                    {prescription?.reason && (
                      <p className="wk-caption mt-1 max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
                        {prescription.reason}
                      </p>
                    )}
                  </div>
                ) : (
                  <dl className="grid grid-cols-3 gap-2">
                    <div className="min-w-0">
                      <dt className="wk-label">Sessions</dt>
                      <dd className="wk-title tabular-nums whitespace-nowrap mt-1">{detail.sessionCount}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="wk-label">Latest</dt>
                      <dd className="wk-title tabular-nums whitespace-nowrap mt-1">{detail.latestDisplay}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="wk-label">Best</dt>
                      <dd
                        className="wk-title tabular-nums whitespace-nowrap mt-1"
                        style={{
                          color: detail.bestDisplay !== '—' ? 'var(--color-status-positive)' : 'var(--color-text-primary)',
                        }}
                      >
                        {detail.bestDisplay}
                      </dd>
                    </div>
                  </dl>
                )}

                {detail.loadExplanation && (
                  <p
                    className="wk-caption pt-2 border-t max-w-prose"
                    style={{
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {detail.loadExplanation}
                  </p>
                )}

                {detail.intensityProtocol && (
                  <p
                    className="wk-caption pt-2 border-t max-w-prose"
                    style={{
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <span className="wk-meta-title" style={{ color: 'var(--color-text-primary)' }}>
                      {detail.intensityProtocol.name}:
                    </span>{' '}
                    {detail.intensityProtocol.instruction}
                  </p>
                )}

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

                {detail.overviewText && (
                  <p
                    className="wk-body max-w-prose pt-2 border-t"
                    style={{
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {detail.overviewText}
                  </p>
                )}
              </section>

              {/* Weekly Muscle Volume for this exercise's primary muscle */}
              {resolvedWeeklyVolume && (
                <section
                  aria-label={`${resolvedWeeklyVolume.muscleName} weekly volume`}
                  className="wk-raised flex flex-col gap-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="wk-label">{resolvedWeeklyVolume.muscleName} this week</span>
                    <span className="wk-subhead tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {resolvedWeeklyVolume.total} of {resolvedWeeklyVolume.targetMin}–{resolvedWeeklyVolume.targetMax} hard sets
                    </span>
                  </div>
                  <div
                    className="wk-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={resolvedWeeklyVolume.targetMax}
                    aria-valuenow={Math.min(resolvedWeeklyVolume.total, resolvedWeeklyVolume.targetMax)}
                    aria-label={`${resolvedWeeklyVolume.muscleName} weekly volume: ${resolvedWeeklyVolume.total} of ${resolvedWeeklyVolume.targetMin} to ${resolvedWeeklyVolume.targetMax} hard sets`}
                  >
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((resolvedWeeklyVolume.total / Math.max(1, resolvedWeeklyVolume.targetMax)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="wk-caption tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {resolvedWeeklyVolume.direct} direct (1.0×) + {resolvedWeeklyVolume.fractional} fractional (0.5×)
                    </span>
                    <span className="wk-caption" style={{ color: 'var(--wk-muted)' }}>
                      {resolvedWeeklyVolume.goalLabel} ({resolvedWeeklyVolume.targetMin}–{resolvedWeeklyVolume.targetMax} sets/wk)
                      {resolvedWeeklyVolume.frequencyCue ? ` · ${resolvedWeeklyVolume.frequencyCue}` : ''}
                    </span>
                  </div>
                </section>
              )}

              {/* Quick Actions */}
              {hasQuickActions && (
                <section aria-label="Quick actions" className="flex flex-col gap-2">
                  <h3 className="wk-label">Quick actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {onAskCoach && (
                      <button
                        type="button"
                        className={secondaryButton}
                        style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
                        onClick={() => {
                          triggerHaptic('light');
                          onClose();
                          onAskCoach(exercise.exerciseId);
                        }}
                      >
                        <Sparkles
                          className="w-4 h-4 shrink-0"
                          style={{ color: 'var(--color-coach-accent)' }}
                          strokeWidth={2.2}
                          aria-hidden="true"
                        />
                        <span>Ask Treise</span>
                      </button>
                    )}
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
                        style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
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
                </section>
              )}

              {/* Anatomy & Mechanics */}
              <section aria-label="Muscles and mechanics" className="wk-raised">
                <dl className="grid grid-cols-2 gap-3">
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
                    <dt className="wk-label">Movement</dt>
                    <dd className="wk-body mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      {detail.movementPattern}
                      {detail.resistanceLabel ? ` · ${detail.resistanceLabel}` : ''}
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
                </dl>
              </section>
            </div>
          )}

          {/* TAB 2: FORM — Demonstration clip, execution cues, pacing & warm-up prep */}
          {activeTab === 'form' && (
            <div
              id={`${uid}-panel-form`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-form`}
              className="flex flex-col gap-4"
            >
              <ExerciseFormClipPlayer clip={formClip} />

              <section aria-label="Form and execution" className="wk-raised flex flex-col gap-3">
                <h3 className="wk-label">Form &amp; execution</h3>
                {detail.biomechanicalCue && (
                  <p className="wk-body max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
                    {detail.biomechanicalCue}
                  </p>
                )}
                <ol className="flex flex-col gap-2">
                  {detail.formSteps.map((step, idx) => (
                    <li key={idx} className="wk-body flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0 tabular-nums wk-caption"
                        style={{
                          background: 'var(--wk-card)',
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
              </section>

              {detail.intensityProtocol && (
                <section aria-label="Intensity protocol" className="wk-raised">
                  <span className="wk-label block mb-1">{detail.intensityProtocol.name}</span>
                  <p className="wk-body max-w-prose">{detail.intensityProtocol.instruction}</p>
                </section>
              )}

              {detail.hasTempoPacer && exercise.tempo && <TempoPacer tempo={exercise.tempo} />}

              {!detail.hasTempoPacer && detail.customTempoText && (
                <p className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                  Tempo / duration target: {detail.customTempoText}
                </p>
              )}

              {detail.warmupSteps.length > 0 && (
                <section aria-label="Warm-up ramp" className="wk-raised flex flex-col gap-2">
                  <span className="wk-label block">Warm-up ramp</span>
                  <ul className="flex flex-col gap-1">
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
                </section>
              )}
            </div>
          )}

          {/* TAB 3: HISTORY — KPIs, TrendChart & logged sessions */}
          {activeTab === 'history' && (
            <div
              id={`${uid}-panel-history`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-history`}
              className="flex flex-col gap-4"
            >
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
                    style={{
                      color: detail.bestDisplay !== '—' ? 'var(--color-status-positive)' : 'var(--color-text-primary)',
                    }}
                  >
                    {detail.bestDisplay}
                  </dd>
                </div>
              </dl>

              {(detail.bestOneRepMaxDisplay || detail.heaviestSetDisplay) && (
                <div
                  className="wk-raised flex flex-wrap items-center justify-between gap-2"
                  aria-label="Documented lift maxes"
                >
                  {detail.bestOneRepMaxDisplay && (
                    <span className="wk-caption tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Best 1RM: </span>
                      <strong>{detail.bestOneRepMaxDisplay}</strong>
                    </span>
                  )}
                  {detail.heaviestSetDisplay && (
                    <span className="wk-caption tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Heaviest set: </span>
                      <strong>{detail.heaviestSetDisplay}</strong>
                    </span>
                  )}
                </div>
              )}

              <TrendChart
                points={trendSpec.points}
                format={trendSpec.format}
                positiveProgress={trendSpec.positiveProgress}
                bridgeBands={
                  !isTimed
                    ? buildExerciseBridgeBands(exercise.exerciseId, workouts, exerciseCatalog ?? [])
                    : undefined
                }
                height={200}
                label={trendSpec.label}
                emptyTitle={trendSpec.emptyTitle}
                emptyMessage={trendSpec.emptyMessage}
              />

              <section aria-label="History and performance" className="flex flex-col gap-3">
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
                      All exercise notes
                    </button>
                  )}
                </div>

                {detail.loggedSessions.length === 0 ? (
                  <p className="wk-body">
                    No completed sessions logged for {formatSentenceCase(exercise.name)} yet. Finished working sets will appear here.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {detail.loggedSessions.slice(0, 8).map((entry) => (
                      <li
                        key={entry.workoutId}
                        className="wk-raised flex flex-col gap-2"
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
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
