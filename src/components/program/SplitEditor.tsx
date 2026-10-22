import React, { useState, useEffect } from 'react';
import { ExerciseDefinition, ProgramSplitType } from '../../engine/types';
import { getExerciseBiomechanicalMeta } from '../../engine/knowledgeGraph';
import {
  SplitDayType,
  getSplitDaysForProgram,
  PROGRAM_OPTIONS,
  FEATURED_PROGRAM_OPTIONS,
} from '../../services/workoutGenerator';
import {
  WORKOUT_TEMPLATES_24,
  PROGRAM_PHASES,
  MUSCLE_BUILDING_PROGRAM_META,
} from '../../engine/muscleBuildingProgram';
import { Plus, Play, Flame, Layers, Zap, Dumbbell, ChevronDown, ChevronUp, X, Check } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface SplitEditorProps {
  exerciseCatalog: ExerciseDefinition[];
  activeSplitDay?: string;
  programType?: ProgramSplitType;
  onOpenCreateExercise: () => void;
  onLaunchSplitDay?: (split: SplitDayType) => void;
  onLaunchWorkoutNumber?: (workoutNumber: number) => void;
  onChangeProgram?: (program: ProgramSplitType) => void;
}

export const SplitEditor: React.FC<SplitEditorProps> = ({
  exerciseCatalog,
  activeSplitDay = 'Push',
  programType = 'ppl_upper',
  onOpenCreateExercise,
  onLaunchSplitDay,
  onLaunchWorkoutNumber,
  onChangeProgram,
}) => {
  const is6WkProgram = programType === 'muscle_building_6wk';
  const [selectedPhase, setSelectedPhase] = useState<number>(1);
  const [expandedWorkoutNum, setExpandedWorkoutNum] = useState<number | null>(1);
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

  const programPickerModal = showProgramPicker && (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select Training Program"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg bg-[#0F1420] border border-white/[0.08] rounded-3xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Select Training Program
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose your hypertrophy split or periodized 6-week plan
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowProgramPicker(false);
            }}
            aria-label="Close program selector"
            className="w-11 h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white flex items-center justify-center transition-colors min-h-[44px]"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Featured Periodized Block */}
        <div className="space-y-2 pt-1">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400/90 px-1">
            Periodized Program
          </div>
          {FEATURED_PROGRAM_OPTIONS.map((opt) => {
            const isCurrent = programType === opt.id;
            return (
              <div
                key={opt.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-amber-500/[0.08] border-amber-500/30'
                    : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-white">
                        {opt.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-extrabold text-xs">
                        {opt.badge}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      {opt.frequency}
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold flex items-center space-x-1 shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[2]" />
                      <span>Active</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {opt.detail}
                </p>

                {!isCurrent && onChangeProgram && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onChangeProgram(opt.id);
                      setShowProgramPicker(false);
                    }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors min-h-[44px] flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <span>Switch to {opt.title}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Standard Splits */}
        <div className="space-y-2 pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Standard Hypertrophy Splits
          </div>
          {PROGRAM_OPTIONS.map((opt) => {
            const isCurrent = programType === opt.id;
            return (
              <div
                key={opt.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-brand-primary/[0.08] border-brand-primary/30'
                    : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-white">
                        {opt.title}
                      </span>
                      {opt.badge && (
                        <span className="px-2 py-0.5 rounded-md bg-brand-primary/20 text-brand-primary font-bold text-xs">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      {opt.frequency}
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="px-2.5 py-1 rounded-xl bg-brand-primary/20 text-brand-primary text-xs font-bold flex items-center space-x-1 shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[2]" />
                      <span>Active</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {opt.detail}
                </p>

                {!isCurrent && onChangeProgram && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onChangeProgram(opt.id);
                      setShowProgramPicker(false);
                    }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs transition-colors min-h-[44px] flex items-center justify-center space-x-1.5"
                  >
                    <span>Switch to {opt.title}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (is6WkProgram) {
    const activePhaseData = PROGRAM_PHASES.find((p) => p.phaseNumber === selectedPhase) || PROGRAM_PHASES[0];
    const phaseWorkouts = WORKOUT_TEMPLATES_24.filter((w) => w.phase === selectedPhase);

    return (
      <>
        <div className="biometric-card p-5 sm:p-6 space-y-4">
          {/* Program Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-extrabold text-xs">
                  6-Week Mesocycle
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  24 Workouts Total
                </span>
              </div>
              <h3 className="font-extrabold text-base text-white tracking-tight">
                {MUSCLE_BUILDING_PROGRAM_META.name}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {MUSCLE_BUILDING_PROGRAM_META.subtitle}
              </p>
            </div>

            {onChangeProgram && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setShowProgramPicker(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white transition-all shrink-0 min-h-[44px]"
              >
                Change Split
              </button>
            )}
          </div>

          {/* Phase Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-[#090C12] p-1.5 rounded-2xl">
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
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition-all min-h-[44px] flex flex-col items-center justify-center text-center ${
                    isSelected
                      ? 'bg-white/[0.14] text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Phase {p.phaseNumber}</span>
                  <span className="text-xs font-mono text-slate-400">
                    Wk {p.weeks[0]}–{p.weeks[1]}
                  </span>
                </button>
              );
            })}
          </div>

        {/* Active Phase Description */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1">
          <div className="font-bold text-xs text-white">
            {activePhaseData.name}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {activePhaseData.description}
          </p>
          <div className="text-xs text-amber-300/90 font-medium pt-1">
            Focus: {activePhaseData.intensityFocus}
          </div>
        </div>

        {/* Phase Workouts List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider px-1">
            <span>Workouts ({phaseWorkouts.length})</span>
            <span>Tap to View Details</span>
          </div>

          {phaseWorkouts.map((workout) => {
            const isExpanded = expandedWorkoutNum === workout.workoutNumber;
            return (
              <div
                key={workout.workoutNumber}
                className="rounded-2xl bg-[#090C12] border border-white/[0.04] overflow-hidden transition-all"
              >
                {/* Workout Summary Header */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setExpandedWorkoutNum(isExpanded ? null : workout.workoutNumber);
                  }}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-white/[0.08] text-white">
                        #{workout.workoutNumber}
                      </span>
                      <span className="text-xs text-slate-400">
                        Week {workout.week} • {workout.dayOfWeek}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-white">
                      {workout.title}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-slate-400">
                      {workout.exercises.length} exercises
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Workout Exercises & Start Button */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3">
                    <div className="space-y-1.5">
                      {workout.exercises.map((ex, exIdx) => (
                        <div
                          key={exIdx}
                          className="p-2.5 rounded-xl bg-white/[0.03] flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="font-mono font-extrabold text-xs px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary shrink-0">
                              {ex.order}
                            </span>
                            <div className="truncate">
                              <span className="font-bold text-white truncate">
                                {ex.name}
                              </span>
                              {ex.intensityProtocol && (
                                <span className="ml-1.5 font-mono text-rose-300 font-bold">
                                  {ex.intensityProtocol.symbol}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0 font-mono text-xs">
                            <span className="text-white font-bold">
                              {ex.sets} × {ex.reps}
                            </span>
                            <span className="text-slate-400">
                              {ex.tempo}
                            </span>
                          </div>
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
                        className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all min-h-[44px] shadow-sm active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-slate-950 stroke-[2]" />
                        <span>Start Workout #{workout.workoutNumber}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {programPickerModal}
    </>
  );
}

  return (
    <>
      <div className="biometric-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-base text-white tracking-tight">
              Workout Splits &amp; Exercises
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Browse exercises by workout day or add your own
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {onChangeProgram && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setShowProgramPicker(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-bold transition-all min-h-[44px]"
              >
                Change Split
              </button>
            )}
            <button
              type="button"
              onClick={onOpenCreateExercise}
              className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white transition-all flex items-center space-x-1 min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2]" />
              <span>Add Exercise</span>
            </button>
          </div>
        </div>

      {/* Segmented Control */}
      <div
        className={`grid gap-1 bg-[#090C12] p-1.5 rounded-2xl ${
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
              className={`py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center justify-center ${
                isSelected
                  ? 'bg-white/[0.14] text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {/* Start Selected Split Workout */}
      {onLaunchSplitDay && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onLaunchSplitDay(activeDay);
          }}
          className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all min-h-[44px] shadow-sm active:scale-95"
        >
          <Play className="w-3.5 h-3.5 fill-slate-950 stroke-[2]" />
          <span>Start {activeDay} Workout</span>
        </button>
      )}

      {/* Exercise Items */}
      <div className="space-y-2">
        {filteredExercises.map((ex) => {
          const meta = getExerciseBiomechanicalMeta(ex);
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
              className="p-3.5 rounded-2xl bg-[#090C12] flex items-center justify-between text-xs"
            >
              <div>
                <div className="font-bold text-sm text-white">
                  {ex.name}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {ex.primaryMuscle} • {equipLabel} • {ex.defaultRepRange[0]}–{ex.defaultRepRange[1]} reps
                </div>
              </div>

              <span className="text-xs font-mono text-slate-300 px-2.5 py-1 rounded-lg bg-white/[0.08]">
                {meta.isIsolation ? '3–4 Sets' : '3 Sets'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
    {programPickerModal}
  </>
  );
};
