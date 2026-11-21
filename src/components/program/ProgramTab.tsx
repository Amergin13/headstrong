import React, { useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PageTopGradient } from '../common/PageTopGradient';
import {
  BiometricLog,
  CustomPlanId,
  ExerciseDefinition,
  ReadinessState,
  WorkoutSession,
  GoalPhase,
  ProgramSplitType,
  UserProfile,
} from '../../engine/types';
import { SplitDayType } from '../../services/workoutGenerator';
import { SplitEditor } from './SplitEditor';
import { ExerciseDetailModal } from '../train/ExerciseDetailModal';
import { buildInspectExerciseSession } from '../../services/exerciseDetails';
import { ProgramPlanView } from './ProgramPlanView';
import { ProgramHeaderMenu } from './ProgramHeaderMenu';
import { ProgramPickerModal } from './ProgramPickerModal';
import { ImportProgramModal } from './ImportProgramModal';
import { TrainingPlan } from '../../engine/muscleBuildingProgram';
import { isPlanProgram, canUseMusclePlan } from '../../engine/trainingPlans';
import { ParsedProgramImport } from '../../services/spreadsheetProgramImport';
import { CompetitorCsvImportResult } from '../../services/competitorCsvImport';
import { ActivityLog } from '../../engine/activeDays';
import { CustomExerciseModal } from './CustomExerciseModal';
import { MesocycleManager } from './MesocycleManager';
import { GoalPhaseSwitcher } from './GoalPhaseSwitcher';
import { WeeklyVolumeCard } from './WeeklyVolumeCard';
import { InterventionActionReceipt, ProgramAdaptationCarousel } from './ProgramAdaptationCarousel';
import { CoachIntervention, detectCoachInterventions } from '../../services/coachInterventions';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import { triggerHaptic } from '../../utils/haptics';
import '../../services/deviceModels';

interface ProgramTabProps {
  profile: UserProfile;
  /** The athlete's 6-week plan (see resolveActivePlan). */
  trainingPlan: TrainingPlan;
  /** Active days (rides, runs, walks, classes) for the plan's weekly active day. */
  activities?: ActivityLog[];
  onLogActivity?: () => void;
  /** Completed and saved sessions, newest first. */
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  readinessState: ReadinessState;
  bodyweightKg: number;
  exerciseCatalog: ExerciseDefinition[];
  activeSplitDay?: string;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onUpdateGoalPhase?: (phase: GoalPhase) => void;
  onSelectMesocycleWeek: (week: number) => void;
  onLaunchSplitDay: (split: SplitDayType) => void;
  onLaunchWorkoutNumber?: (workoutNumber: number) => void;
  onUpdateProgram?: (program: ProgramSplitType) => void;
  onImportProgram?: (
    parsed: ParsedProgramImport,
    opts: { activateProgram: boolean; importHistory: boolean }
  ) => void;
  onImportHistory?: (parsed: CompetitorCsvImportResult) => void;
  onDeleteCustomPlan?: (planId: CustomPlanId) => void;
  onAddCustomExercise: (newEx: ExerciseDefinition) => void;
  onOpenOnboarding?: () => void;
  /** Name of the queued workout, shown on the "Back to workout" link. */
  activeWorkoutName?: string;
  activeProgramWorkoutNumber?: number;
  onBackToWorkout?: () => void;
  /** Opens Treise coach with a pre-filled HITL program adaptation prompt. */
  onOpenCoachIntervention?: (prompt: string) => void;
  /** Opens Treise coach in the Program context (optional pre-filled prompt). */
  onOpenCoach?: (prompt?: string) => void;
  /** Directly executes and persists an accepted adaptation suggestion across the entire product. */
  onAcceptIntervention?: (intervention: CoachIntervention) => InterventionActionReceipt | void;
  /** Dismisses an adaptation suggestion and persists dismissal across the entire product. */
  onDismissIntervention?: (intervention: CoachIntervention) => InterventionActionReceipt | void;
  /** Removes a single accepted program override cleanly. */
  onRemoveProgramOverride?: (overrideId: string) => void;
  /** Clears all accepted program overrides for the current plan. */
  onClearProgramOverrides?: (planId: string) => void;
}

const HOME_EQUIP_LABELS: Record<string, string> = {
  bench: 'Bench',
  dumbbells: 'Dumbbells',
  trx: 'TRX',
  pullup_bar: 'Pull-Up Bar',
  bands: 'Bands',
};

export const ProgramTab: React.FC<ProgramTabProps> = ({
  profile,
  trainingPlan,
  activities = [],
  onLogActivity,
  workouts,
  biometrics,
  readinessState,
  bodyweightKg,
  exerciseCatalog,
  activeSplitDay,
  onUpdateProfile,
  onUpdateGoalPhase,
  onSelectMesocycleWeek,
  onLaunchSplitDay,
  onLaunchWorkoutNumber,
  onUpdateProgram,
  onImportProgram,
  onImportHistory,
  onDeleteCustomPlan,
  onAddCustomExercise,
  onOpenOnboarding,
  activeWorkoutName,
  activeProgramWorkoutNumber,
  onBackToWorkout,
  onOpenCoachIntervention,
  onOpenCoach,
  onAcceptIntervention,
  onDismissIntervention,
  onRemoveProgramOverride,
  onClearProgramOverrides,
}) => {
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [showImportSpreadsheet, setShowImportSpreadsheet] = useState(false);
  const [inspectedExerciseId, setInspectedExerciseId] = useState<string | null>(null);
  const inspectedExercise = useMemo(() => {
    if (!inspectedExerciseId) return null;
    return buildInspectExerciseSession({
      exerciseId: inspectedExerciseId,
      exerciseCatalog,
      workouts,
    });
  }, [inspectedExerciseId, exerciseCatalog, workouts]);
  const isPlan = isPlanProgram(profile.programType);
  const splitInterventions = useMemo(() => {
    if (isPlan) return [];
    const weeklyVolume = calculateWeeklyMuscleVolume(workouts, exerciseCatalog);
    return detectCoachInterventions({
      profile,
      workouts,
      biometrics,
      exerciseCatalog,
      bodyweightEmaKg: bodyweightKg,
      readinessState,
      weeklyVolume,
      activities,
      trainingPlan,
    });
  }, [isPlan, profile, workouts, biometrics, exerciseCatalog, bodyweightKg, readinessState, activities, trainingPlan]);
  const changeProgram = (newProg: ProgramSplitType) => {
    if (onUpdateProgram) {
      onUpdateProgram(newProg);
    } else {
      onUpdateProfile({ programType: newProg });
    }
  };
  const programCardsTopRef = useRef<HTMLDivElement>(null);

  const headerMenu = (
    <ProgramHeaderMenu
      onOpenImportSpreadsheet={() => setShowImportSpreadsheet(true)}
      onOpenChangeProgram={() => setShowProgramPicker(true)}
    />
  );

  const homeEquipItems = profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'];
  const homeEquipList =
    homeEquipItems.map((item) => HOME_EQUIP_LABELS[item] || item).join(', ') || 'Bodyweight';

  return (
    <div className="wk -mx-4 px-4 pb-28">
      {!isPlan && (
        <PageTopGradient markerRef={programCardsTopRef} deps={[isPlan]} />
      )}
      {isPlan && (
        <ProgramPlanView
          trainingPlan={trainingPlan}
          activities={activities}
          onLogActivity={onLogActivity}
          workouts={workouts}
          biometrics={biometrics}
          profile={profile}
          exerciseCatalog={exerciseCatalog}
          readinessState={readinessState}
          bodyweightKg={bodyweightKg}
          activeProgramWorkoutNumber={activeProgramWorkoutNumber}
          onLaunchWorkoutNumber={onLaunchWorkoutNumber}
          onBackToWorkout={onBackToWorkout}
          onOpenCoachIntervention={onOpenCoachIntervention}
          onOpenCoach={onOpenCoach}
          onAcceptIntervention={onAcceptIntervention}
          onDismissIntervention={onDismissIntervention}
          onRemoveProgramOverride={onRemoveProgramOverride}
          onClearProgramOverrides={onClearProgramOverrides}
          headerAction={headerMenu}
        />
      )}
      {!isPlan && (
        <>
          <header className="relative pt-2">
            <div className="relative flex items-center justify-start pr-12">
              <h1 className="wk-page-title">Program</h1>
              {headerMenu}
            </div>
          </header>

          <div ref={programCardsTopRef} className="flex flex-col gap-3 mt-5">
            {(onBackToWorkout || onOpenCoach) && (
              <div className="flex flex-wrap items-center gap-2">
                {onBackToWorkout && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onBackToWorkout();
                    }}
                    className="wk-btn-secondary"
                  >
                    Back to workout{activeWorkoutName ? `: ${activeWorkoutName}` : ''}
                  </button>
                )}
                {onOpenCoach && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenCoach();
                    }}
                    className="wk-btn-secondary min-h-[44px] inline-flex items-center gap-2"
                    style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
                  >
                    <Sparkles
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--color-coach-accent)' }}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                    <span>Adapt plan with Treise</span>
                  </button>
                )}
              </div>
            )}

            {onAcceptIntervention && onDismissIntervention && (
              <ProgramAdaptationCarousel
                interventions={splitInterventions}
                onAccept={onAcceptIntervention}
                onDismiss={onDismissIntervention}
              />
            )}

            {/* 1. Training Locations & Equipment Summary Card */}
            <div className="wk-card w-full text-left block">
              <div className="flex items-start justify-between gap-3">
                <h2 className="wk-h1 leading-tight">
                  Training locations &amp; equipment
                </h2>
                {onOpenOnboarding && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenOnboarding();
                    }}
                    className="wk-btn-secondary shrink-0"
                  >
                    Edit equipment
                  </button>
                )}
              </div>

              <p className="wk-body mt-2 leading-tight">
                Exercises adapt automatically when you switch location on the Workout tab
              </p>

              <div className="flex items-end justify-between gap-2 mt-6">
                <span className="wk-meta-title leading-tight">
                  Home setup · {homeEquipItems.length} items
                </span>
                <span className="wk-subhead shrink-0 leading-none">
                  3 locations
                </span>
              </div>

              <div className="wk-bar mt-3">
                <div style={{ width: '100%' }} />
              </div>

              <div
                className="flex flex-col mt-4 pt-3 gap-2"
                style={{ borderTop: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-meta-title">Full gym</span>
                  <span className="wk-pill">Barbells, cables &amp; machines</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-meta-title">At home</span>
                  <span className="wk-pill">{homeEquipList}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-meta-title">Bodyweight</span>
                  <span className="wk-pill">Zero-equipment variations</span>
                </div>
              </div>
            </div>

            {/* 2. Training Goal Phase (Build Muscle / Lose Fat / Stay Lean) */}
            <GoalPhaseSwitcher
              currentPhase={profile.goalPhase}
              onSelectPhase={(phase) => {
                if (onUpdateGoalPhase) {
                  onUpdateGoalPhase(phase);
                } else {
                  onUpdateProfile({ goalPhase: phase });
                }
              }}
            />

            {/* 3. Weekly Muscle Volume */}
            <WeeklyVolumeCard
              workouts={workouts}
              exerciseCatalog={exerciseCatalog}
              goalPhase={profile.goalPhase}
            />

            {/* 4. 6-Week Training Plan (Mesocycle Periodization) */}
            <MesocycleManager
              currentWeek={profile.mesocycleWeek || 1}
              totalWeeks={6}
              scheduledWeekLocations={profile.scheduledWeekLocations}
              onSelectWeek={onSelectMesocycleWeek}
              onTriggerDeload={() => onSelectMesocycleWeek(6)}
            />

            {/* 4. Workout Split & Exercises */}
            <SplitEditor
              exerciseCatalog={exerciseCatalog}
              activeSplitDay={activeSplitDay}
              activeProgramWorkoutNumber={activeProgramWorkoutNumber}
              programType={profile.programType}
              onOpenCreateExercise={() => setShowCreateExercise(true)}
              onLaunchSplitDay={onLaunchSplitDay}
              onLaunchWorkoutNumber={onLaunchWorkoutNumber}
              onChangeProgram={changeProgram}
              onInspectExercise={(id) => setInspectedExerciseId(id)}
            />
          </div>
        </>
      )}

      {/* Custom Exercise Modal */}
      {showCreateExercise && (
        <CustomExerciseModal
          onAddExercise={onAddCustomExercise}
          onClose={() => setShowCreateExercise(false)}
        />
      )}

      {/* Switch Program Modal */}
      {showProgramPicker && (
        <ProgramPickerModal
          programType={profile.programType || 'starter_6wk'}
          includeMusclePlan={canUseMusclePlan(profile.email) || profile.programType === 'muscle_building_6wk'}
          customPlans={profile.customPlans}
          onChangeProgram={changeProgram}
          onDeleteCustomPlan={onDeleteCustomPlan}
          onClose={() => setShowProgramPicker(false)}
        />
      )}

      {/* Import Program / Competitor History CSV Modal */}
      {showImportSpreadsheet && (onImportProgram || onImportHistory) && (
        <ImportProgramModal
          exerciseCatalog={exerciseCatalog}
          onImport={onImportProgram}
          onImportHistory={onImportHistory}
          onClose={() => setShowImportSpreadsheet(false)}
        />
      )}

      {inspectedExercise && (
        <ExerciseDetailModal
          exercise={inspectedExercise.exercise}
          exerciseDef={inspectedExercise.exerciseDef}
          exerciseCatalog={exerciseCatalog}
          workouts={workouts}
          biometrics={biometrics}
          bodyweightKg={bodyweightKg}
          goalPhase={profile.goalPhase}
          readinessState={readinessState}
          intervention={splitInterventions.find((i) => i.exerciseId === inspectedExercise.exercise.exerciseId)}
          onAcceptIntervention={onAcceptIntervention}
          onDismissIntervention={onDismissIntervention}
          onAskCoach={
            onOpenCoachIntervention
              ? () =>
                  onOpenCoachIntervention(
                    `Review my progress and form cues for ${inspectedExercise.exercise.name}`
                  )
              : undefined
          }
          onClose={() => setInspectedExerciseId(null)}
        />
      )}
    </div>
  );
};
