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
}

const fig = (px: number) => `calc(${px} * var(--f))`;

export const SplitEditor: React.FC<SplitEditorProps> = ({
  exerciseCatalog,
  activeProgramWorkoutNumber,
  activeSplitDay = 'Push',
  programType = 'ppl_upper',
  onOpenCreateExercise,
  onLaunchSplitDay,
  onLaunchWorkoutNumber,
  onChangeProgram,
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
        <div className="flex flex-col" style={{ gap: fig(22) }}>
          {/* Program Header Card */}
          <div className="wk-card w-full text-left block">
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                {MUSCLE_BUILDING_PROGRAM_META.name}
              </h2>
              {onChangeProgram && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowProgramPicker(true);
                  }}
                  className="wk-pill shrink-0"
                >
                  Change Split
                </button>
              )}
            </div>

            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              {activePhaseData.description}
            </p>

            <div
              className="flex items-end justify-between"
              style={{ marginTop: fig(60), gap: fig(20) }}
            >
              <span className="wk-label" style={{ lineHeight: 1.21 }}>
                {activePhaseData.name}
              </span>
              <span
                className="font-bold text-white shrink-0"
                style={{ fontSize: fig(40), lineHeight: 1 }}
              >
                Phase {selectedPhase}/3
              </span>
            </div>

            <div className="wk-bar" style={{ marginTop: fig(30) }}>
              <div style={{ width: `${Math.round((selectedPhase / 3) * 100)}%` }} />
            </div>

            {/* Phase Switcher Tabs */}
            <div
              className="grid grid-cols-3 items-center"
              style={{
                marginTop: fig(30),
                height: fig(84),
                padding: fig(8),
                borderRadius: fig(22),
                background: 'var(--wk-raised)',
              }}
            >
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
                    className="h-full flex items-center justify-center font-bold uppercase transition-colors"
                    style={{
                      borderRadius: fig(16),
                      fontSize: fig(24),
                      letterSpacing: '0.02em',
                      background: isSelected ? 'var(--wk-pill)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--wk-muted)',
                    }}
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
                  <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
                    <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
                      {workout.title}
                    </h3>
                    <ChevronRight
                      className="wk-chevron shrink-0 transition-transform"
                      style={{
                        marginTop: fig(4),
                        transform: isExpanded ? 'rotate(90deg)' : undefined,
                      }}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </div>

                  <p
                    style={{
                      fontSize: fig(28),
                      lineHeight: 1.21,
                      color: 'var(--wk-muted)',
                      marginTop: fig(20),
                    }}
                  >
                    Week {workout.week} • Session {((workout.workoutNumber - 1) % 4) + 1} of 4
                  </p>

                  <div
                    className="flex items-end justify-between"
                    style={{ marginTop: fig(60), gap: fig(20) }}
                  >
                    <span className="wk-label" style={{ lineHeight: 1.21 }}>
                      WORKOUT #{workout.workoutNumber} • {workout.exercises.length} EXERCISES
                    </span>
                    <span
                      className="font-bold text-white shrink-0"
                      style={{ fontSize: fig(40), lineHeight: 1 }}
                    >
                      {workout.workoutNumber}/24
                    </span>
                  </div>

                  <div className="wk-bar" style={{ marginTop: fig(30) }}>
                    <div style={{ width: `${progressPct}%` }} />
                  </div>
                </button>

                {isExpanded && (
                  <div
                    style={{
                      marginTop: fig(28),
                      paddingTop: fig(24),
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="flex flex-col" style={{ gap: fig(18) }}>
                      {workout.exercises.map((ex, exIdx) => (
                        <div
                          key={exIdx}
                          className="flex items-center justify-between"
                          style={{ gap: fig(16) }}
                        >
                          <div className="flex items-center min-w-0" style={{ gap: fig(16) }}>
                            <span className="wk-pill shrink-0">
                              {ex.order}
                            </span>
                            <span className="wk-label truncate">
                              {ex.name}
                            </span>
                          </div>
                          <span className="wk-pill shrink-0">
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
                        className="wk-button transition-all active:scale-95"
                        style={{
                          marginTop: fig(28),
                          background: 'var(--wk-accent)',
                          color: '#13181C',
                        }}
                      >
                        Start Workout #{workout.workoutNumber}
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
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
            Workout Splits &amp; Exercises
          </h2>
          {onChangeProgram && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowProgramPicker(true);
              }}
              className="wk-pill shrink-0"
            >
              Change Split
            </button>
          )}
        </div>

        <p
          style={{
            fontSize: fig(28),
            lineHeight: 1.21,
            color: 'var(--wk-muted)',
            marginTop: fig(20),
          }}
        >
          Browse exercises by workout day or add your own custom movement
        </p>

        <div
          className="flex items-end justify-between"
          style={{ marginTop: fig(60), gap: fig(20) }}
        >
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            {activeDay} WORKOUT ROUTINE
          </span>
          <span
            className="font-bold text-white shrink-0"
            style={{ fontSize: fig(40), lineHeight: 1 }}
          >
            {routineExercises.length} EXERCISES
          </span>
        </div>

        <div className="wk-bar" style={{ marginTop: fig(30) }}>
          <div style={{ width: '100%' }} />
        </div>

        {/* Segmented Control */}
        <div
          className={`grid items-center ${
            days.length === 2 ? 'grid-cols-2' : days.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
          }`}
          style={{
            marginTop: fig(30),
            height: fig(84),
            padding: fig(8),
            borderRadius: fig(22),
            background: 'var(--wk-raised)',
          }}
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
                className="h-full flex items-center justify-center font-bold uppercase transition-colors"
                style={{
                  borderRadius: fig(16),
                  fontSize: fig(24),
                  letterSpacing: '0.02em',
                  background: isSelected ? 'var(--wk-pill)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--wk-muted)',
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Routine Exercises */}
        <div
          className="flex flex-col"
          style={{
            marginTop: fig(28),
            paddingTop: fig(24),
            borderTop: '1px solid rgba(255,255,255,0.08)',
            gap: fig(20),
          }}
        >
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
            return (
              <div
                key={ex.id}
                className="flex items-center justify-between"
                style={{ gap: fig(16) }}
              >
                <div className="min-w-0">
                  <div className="wk-label">{idx + 1}. {ex.name}</div>
                  <div className="wk-caption" style={{ marginTop: fig(6) }}>
                    {ex.primaryMuscle} • {equipLabel}
                  </div>
                </div>
                <span className="wk-pill shrink-0">
                  {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} REPS
                </span>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col" style={{ marginTop: fig(28), gap: fig(16) }}>
          {onLaunchSplitDay && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onLaunchSplitDay(activeDay);
              }}
              className="wk-button transition-all active:scale-95"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              Start {activeDay} Workout
            </button>
          )}

          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <button
              type="button"
              onClick={() => setShowAlternatives((v) => !v)}
              aria-expanded={showAlternatives}
              className="wk-pill"
            >
              {showAlternatives ? 'Hide' : 'Show'} {alternativeExercises.length} Alternatives
            </button>
            <button
              type="button"
              onClick={onOpenCreateExercise}
              className="wk-pill"
            >
              + Add Exercise
            </button>
          </div>
        </div>

        {showAlternatives && (
          <div
            className="flex flex-col"
            style={{
              marginTop: fig(24),
              paddingTop: fig(24),
              borderTop: '1px solid rgba(255,255,255,0.08)',
              gap: fig(18),
            }}
          >
            {alternativeExercises.map((ex) => {
              const meta = getExerciseBiomechanicalMeta(ex);
              return (
                <div
                  key={ex.id}
                  className="flex items-center justify-between"
                  style={{ gap: fig(16) }}
                >
                  <div>
                    <div className="wk-label">{ex.name}</div>
                    <div className="wk-caption" style={{ marginTop: fig(6) }}>
                      {ex.primaryMuscle} • {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} reps
                    </div>
                  </div>
                  <span className="wk-pill shrink-0">
                    {meta.isIsolation ? '3–4 SETS' : '3 SETS'}
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
