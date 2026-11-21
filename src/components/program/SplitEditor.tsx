import React, { useState, useEffect } from 'react';
import { ExerciseDefinition, ProgramSplitType } from '../../engine/types';
import { getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import {
  SplitDayType,
  getSplitDaysForProgram,
  PROGRAM_OPTIONS,
  FEATURED_PROGRAM_OPTIONS,
  getSplitTemplateExerciseIds,
} from '../../services/workoutGenerator';
import {
  WORKOUT_TEMPLATES_24,
  PROGRAM_PHASES,
  MUSCLE_BUILDING_PROGRAM_META,
} from '../../engine/muscleBuildingProgram';
import { ChevronRight } from 'lucide-react';
import { ProgramPickerModal } from './ProgramPickerModal';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';

interface SplitEditorProps {
  /** 6-week plan position of the queued workout, so the plan opens there. */
  activeProgramWorkoutNumber?: number;
  exerciseCatalog: ExerciseDefinition[];
  activeSplitDay?: string;
  programType?: ProgramSplitType;
  onOpenCreateExercise: () => void;
  onLaunchSplitDay?: (split: SplitDayType) => void;
  onLaunchWorkoutNumber?: (workoutNumber: number) => void;
  onChangeProgram?: (program: ProgramSplitType) => void;
  onInspectExercise?: (exerciseId: string) => void;
}


export const SplitEditor: React.FC<SplitEditorProps> = ({
  exerciseCatalog,
  activeProgramWorkoutNumber,
  activeSplitDay = 'Push',
  programType = 'ppl_upper',
  onOpenCreateExercise,
  onLaunchSplitDay,
  onLaunchWorkoutNumber,
  onChangeProgram,
  onInspectExercise,
}) => {
  const is6WkProgram = programType === 'muscle_building_6wk';
  const startWorkoutNum = activeProgramWorkoutNumber || 1;
  const [selectedPhase, setSelectedPhase] = useState<number>(
    WORKOUT_TEMPLATES_24.find((w) => w.workoutNumber === startWorkoutNum)?.phase || 1
  );
  const [expandedWorkoutNum, setExpandedWorkoutNum] = useState<number | null>(startWorkoutNum);
  const [showProgramPicker, setShowProgramPicker] = useState<boolean>(false);
  const days = getSplitDaysForProgram(programType);
  const [activeDay, setActiveDay] = useState<SplitDayType>(
    days.some((d) => d.id === activeSplitDay) ? (activeSplitDay as SplitDayType) : days[0].id
  );

  useEffect(() => {
    if (!days.some((d) => d.id === activeDay)) {
      setActiveDay(days[0].id);
    }
  }, [programType]);

  const [showAlternatives, setShowAlternatives] = useState(false);
  const routineIds = getSplitTemplateExerciseIds(activeDay);
  const catalogById = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const routineExercises = routineIds
    .map((id) => catalogById.get(id))
    .filter((e): e is ExerciseDefinition => Boolean(e));
  const filteredExercises = exerciseCatalog.filter((ex) => {
    if (activeDay === 'Push') {
      return (
        ex.pillar === 'Horizontal Push' ||
        ex.pillar === 'Vertical Push' ||
        ex.primaryMuscle === 'Triceps' ||
        ex.primaryMuscle === 'Side Delts'
      );
    }
    if (activeDay === 'Pull') {
      return (
        ex.pillar === 'Horizontal Pull' ||
        ex.pillar === 'Vertical Pull' ||
        ex.primaryMuscle === 'Biceps' ||
        ex.primaryMuscle === 'Rear Delts'
      );
    }
    if (activeDay === 'Legs') {
      return (
        ex.pillar === 'Squat' ||
        ex.pillar === 'Hinge' ||
        ex.primaryMuscle === 'Calves' ||
        ex.primaryMuscle === 'Hamstrings' ||
        ex.primaryMuscle === 'Quads'
      );
    }
    return (
      ex.pillar === 'Horizontal Push' ||
      ex.pillar === 'Horizontal Pull' ||
      ex.pillar === 'Vertical Push' ||
      ex.primaryMuscle === 'Side Delts' ||
      ex.primaryMuscle === 'Rear Delts' ||
      ex.primaryMuscle === 'Triceps' ||
      ex.primaryMuscle === 'Biceps'
    );
  });

  const alternativeExercises = filteredExercises.filter((ex) => !routineIds.includes(ex.id));

  const programPickerModal = showProgramPicker && (
    <ProgramPickerModal
      programType={programType}
      onChangeProgram={onChangeProgram}
      onClose={() => setShowProgramPicker(false)}
    />
  );

  if (is6WkProgram) {
    const activePhaseData = PROGRAM_PHASES.find((p) => p.phaseNumber === selectedPhase) || PROGRAM_PHASES[0];
    const phaseWorkouts = WORKOUT_TEMPLATES_24.filter((w) => w.phase === selectedPhase);

    return (
      <>
        <div className="flex flex-col gap-3">
          {/* Program Header Card */}
          <div className="wk-card w-full text-left block">
            <div className="flex items-start justify-between gap-3">
              <h2 className="wk-h1 leading-tight">
                {MUSCLE_BUILDING_PROGRAM_META.name}
              </h2>
              {onChangeProgram && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowProgramPicker(true);
                  }}
                  className="wk-btn-secondary shrink-0"
                >
                  Change split
                </button>
              )}
            </div>

            <p className="wk-body mt-2 max-w-prose">
              {activePhaseData.description}
            </p>

            <div className="mt-5 flex items-end justify-between gap-2">
              <span className="wk-label leading-tight">
                {activePhaseData.name}
              </span>
              <span className="wk-subhead tabular-nums shrink-0 leading-none">
                Phase {selectedPhase}/3
              </span>
            </div>

            <div className="wk-bar mt-3">
              <div style={{ width: `${Math.round((selectedPhase / 3) * 100)}%` }} />
            </div>

            {/* Phase Switcher Tabs */}
            <div className="wk-segments grid grid-cols-3 mt-4">
              {PROGRAM_PHASES.map((p) => {
                const isSelected = selectedPhase === p.phaseNumber;
                return (
                  <button
                    key={p.phaseNumber}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedPhase(p.phaseNumber);
                      const firstW = WORKOUT_TEMPLATES_24.find((w) => w.phase === p.phaseNumber);
                      if (firstW) setExpandedWorkoutNum(firstW.workoutNumber);
                    }}
                    className={`wk-segment text-center ${isSelected ? 'is-active' : ''}`}
                  >
                    Phase {p.phaseNumber} (W{p.weeks[0]}–{p.weeks[1]})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phase Workouts as ProgramProgressCard Cards */}
          {phaseWorkouts.map((workout) => {
            const isExpanded = expandedWorkoutNum === workout.workoutNumber;
            const progressPct = Math.round((workout.workoutNumber / 24) * 100);
            return (
              <div key={workout.workoutNumber} className="wk-card w-full text-left block">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setExpandedWorkoutNum(isExpanded ? null : workout.workoutNumber);
                  }}
                  aria-expanded={isExpanded}
                  className="w-full text-left block"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="wk-h1 leading-tight">
                      {workout.title}
                    </h3>
                    <ChevronRight
                      className="wk-chevron shrink-0 mt-1 transition-transform"
                      style={{
                        transform: isExpanded ? 'rotate(90deg)' : undefined,
                      }}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </div>

                  <p className="wk-caption mt-2">
                    Week {workout.week} • Session {((workout.workoutNumber - 1) % 4) + 1} of 4
                  </p>

                  <div className="mt-5 flex items-end justify-between gap-2">
                    <span className="wk-meta-title leading-tight tabular-nums">
                      Workout #{workout.workoutNumber} · {workout.exercises.length} exercises
                    </span>
                    <span className="wk-number shrink-0 leading-none">
                      {workout.workoutNumber}/24
                    </span>
                  </div>

                  <div className="wk-bar mt-3">
                    <div style={{ width: `${progressPct}%` }} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <div className="flex flex-col gap-3">
                      {workout.exercises.map((ex, exIdx) => (
                        <div
                          key={exIdx}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center min-w-0 gap-2">
                            <span className="wk-pill shrink-0 tabular-nums">
                              {ex.order}
                            </span>
                            <span className="wk-subhead truncate">
                              {ex.name}
                            </span>
                          </div>
                          <span className="wk-pill shrink-0 tabular-nums">
                            {ex.sets} × {ex.reps}
                          </span>
                        </div>
                      ))}
                    </div>

                    {onLaunchWorkoutNumber && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('medium');
                          onLaunchWorkoutNumber(workout.workoutNumber);
                        }}
                        className="wk-button mt-4 transition-all active:scale-[0.98]"
                        style={{
                          background: 'var(--color-action-primary-bg)',
                          color: 'var(--color-action-primary-fg)',
                        }}
                      >
                        Start workout #{workout.workoutNumber}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {programPickerModal}
      </>
    );
  }

  return (
    <>
      <div className="wk-card w-full text-left block">
        <div className="flex items-start justify-between gap-3">
          <h2 className="wk-h1 leading-tight">
            Workout splits &amp; exercises
          </h2>
          {onChangeProgram && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowProgramPicker(true);
              }}
              className="wk-btn-secondary shrink-0"
            >
              Change split
            </button>
          )}
        </div>

        <p className="wk-body mt-2 max-w-prose">
          Browse exercises by workout day or add your own custom movement
        </p>

        <div className="mt-5 flex items-end justify-between gap-2">
          <span className="wk-meta-title leading-tight">
            {activeDay} workout routine
          </span>
          <span className="wk-subhead tabular-numbers shrink-0 leading-none">
            {routineExercises.length} exercises
          </span>
        </div>

        <div className="wk-bar mt-3">
          <div style={{ width: '100%' }} />
        </div>

        {/* Segmented Control */}
        <div
          className={`wk-segments grid mt-4 ${
            days.length === 2 ? 'grid-cols-2' : days.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
          }`}
        >
          {days.map((d) => {
            const isSelected = activeDay === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveDay(d.id);
                }}
                className={`wk-segment text-center ${isSelected ? 'is-active' : ''}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Routine Exercises */}
        <div className="flex flex-col mt-4 pt-4 gap-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          {routineExercises.map((ex, idx) => {
            const equipLabel =
              ex.equipment === 'barbell'
                ? 'Barbell'
                : ex.equipment === 'dumbbell'
                ? 'Dumbbell'
                : ex.equipment === 'cable'
                ? 'Cable'
                : ex.equipment === 'machine'
                ? 'Machine'
                : 'Bodyweight';
            return onInspectExercise ? (
              <button
                key={ex.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onInspectExercise(ex.id);
                }}
                aria-label={`Open details for ${formatSentenceCase(ex.name)}`}
                className="w-full text-left flex items-center justify-between gap-2 min-h-[44px]"
              >
                <div className="min-w-0">
                  <div className="wk-subhead">{idx + 1}. {formatSentenceCase(ex.name)}</div>
                  <div className="wk-caption mt-1">
                    {ex.primaryMuscle} • {equipLabel}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="wk-pill tabular-numbers">
                    {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} reps
                  </span>
                  <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
                </div>
              </button>
            ) : (
              <div
                key={ex.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="wk-subhead">{idx + 1}. {formatSentenceCase(ex.name)}</div>
                  <div className="wk-caption mt-1">
                    {ex.primaryMuscle} • {equipLabel}
                  </div>
                </div>
                <span className="wk-pill shrink-0 tabular-numbers">
                  {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} reps
                </span>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col mt-4 gap-2">
          {onLaunchSplitDay && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onLaunchSplitDay(activeDay);
              }}
              className="wk-button transition-all active:scale-[0.98]"
              style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
            >
              Start {activeDay} Workout
            </button>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowAlternatives((v) => !v)}
              aria-expanded={showAlternatives}
              className="wk-btn-secondary flex-1 justify-center"
            >
              {showAlternatives ? 'Hide' : 'Show'} {alternativeExercises.length} alternatives
            </button>
            <button
              type="button"
              onClick={onOpenCreateExercise}
              className="wk-btn-secondary flex-1 justify-center"
            >
              + Add exercise
            </button>
          </div>
        </div>

        {showAlternatives && (
          <div className="flex flex-col mt-4 pt-4 gap-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            {alternativeExercises.map((ex) => {
              const meta = getExerciseBiomechanicalMeta(ex);
              return onInspectExercise ? (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onInspectExercise(ex.id);
                  }}
                  aria-label={`Open details for ${formatSentenceCase(ex.name)}`}
                  className="w-full text-left flex items-center justify-between gap-2 min-h-[44px]"
                >
                  <div className="min-w-0">
                    <div className="wk-subhead">{formatSentenceCase(ex.name)}</div>
                    <div className="wk-caption mt-1 tabular-nums">
                      {ex.primaryMuscle} • {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} reps
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="wk-pill tabular-numbers">
                      {meta.isIsolation ? '3–4 sets' : '3 sets'}
                    </span>
                    <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
                  </div>
                </button>
              ) : (
                <div
                  key={ex.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="wk-subhead">{formatSentenceCase(ex.name)}</div>
                    <div className="wk-caption mt-1 tabular-nums">
                      {ex.primaryMuscle} • {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} reps
                    </div>
                  </div>
                  <span className="wk-pill shrink-0 tabular-nums">
                    {meta.isIsolation ? '3–4 sets' : '3 sets'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {programPickerModal}
    </>
  );
};
