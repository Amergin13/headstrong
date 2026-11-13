import React, { useState, useRef } from 'react';
import { PageTopGradient } from '../common/PageTopGradient';
import {
  BiometricLog,
  ExerciseDefinition,
  ReadinessState,
  WorkoutSession,
  GoalPhase,
  ProgramSplitType,
  UserProfile,
} from '../../engine/types';
import { SplitDayType } from '../../services/workoutGenerator';
import { SplitEditor } from './SplitEditor';
import { ProgramPlanView } from './ProgramPlanView';
import { TrainingPlan } from '../../engine/muscleBuildingProgram';
import { isPlanProgram } from '../../engine/trainingPlans';
import { ActivityLog } from '../../engine/activeDays';
import { CustomExerciseModal } from './CustomExerciseModal';
import { MesocycleManager } from './MesocycleManager';
import { GoalPhaseSwitcher } from './GoalPhaseSwitcher';
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
  onAddCustomExercise: (newEx: ExerciseDefinition) => void;
  onOpenOnboarding?: () => void;
  /** Name of the queued workout, shown on the "Back to workout" link. */
  activeWorkoutName?: string;
  activeProgramWorkoutNumber?: number;
  onBackToWorkout?: () => void;
}

const HOME_EQUIP_LABELS: Record<string, string> = {
  bench: 'Bench',
  dumbbells: 'Dumbbells',
  trx: 'TRX',
  pullup_bar: 'Pull-Up Bar',
  bands: 'Bands',
};

const fig = (px: number) => `calc(${px} * var(--f))`;

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
  onAddCustomExercise,
  onOpenOnboarding,
  activeWorkoutName,
  activeProgramWorkoutNumber,
  onBackToWorkout,
}) => {
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const isPlan = isPlanProgram(profile.programType);
  const changeProgram = (newProg: ProgramSplitType) => {
    if (onUpdateProgram) {
      onUpdateProgram(newProg);
    } else {
      onUpdateProfile({ programType: newProg });
    }
  };
  const programCardsTopRef = useRef<HTMLDivElement>(null);

  const homeEquipItems = profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'];
  const homeEquipList =
    homeEquipItems.map((item) => HOME_EQUIP_LABELS[item] || item).join(', ') || 'Bodyweight';

  return (
    <div
      className="wk -mx-3.5"
      style={{ paddingLeft: fig(38), paddingRight: fig(38), paddingBottom: 120 }}
    >
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
        />
      )}
      {!isPlan && (
        <>
          <header style={{ paddingTop: fig(20) }}>
            <h1 className="wk-page-title">Program</h1>
          </header>

          <div ref={programCardsTopRef} className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
            {onBackToWorkout && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onBackToWorkout();
                }}
                className="wk-pill self-start"
              >
                Back to workout{activeWorkoutName ? `: ${activeWorkoutName}` : ''}
              </button>
            )}

            {/* 1. Training Locations & Equipment Summary Card */}
            <div className="wk-card w-full text-left block">
              <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
                <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                  Training Locations &amp; Equipment
                </h2>
                {onOpenOnboarding && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenOnboarding();
                    }}
                    className="wk-pill shrink-0"
                  >
                    Edit Equipment
                  </button>
                )}
              </div>

              <p
                style={{
                  fontSize: `max(12px, ${fig(28)})`,
                  lineHeight: 1.21,
                  color: 'var(--wk-muted)',
                  marginTop: fig(20),
                }}
              >
                Exercises adapt automatically when you switch location on the Workout tab
              </p>

              <div
                className="flex items-end justify-between"
                style={{ marginTop: fig(60), gap: fig(20) }}
              >
                <span className="wk-label" style={{ lineHeight: 1.21 }}>
                  HOME SETUP • {homeEquipItems.length} ITEMS
                </span>
                <span
                  className="font-bold text-white shrink-0"
                  style={{ fontSize: `max(12px, ${fig(40)})`, lineHeight: 1 }}
                >
                  3 LOCATIONS
                </span>
              </div>

              <div className="wk-bar" style={{ marginTop: fig(30) }}>
                <div style={{ width: '100%' }} />
              </div>

              <div
                className="flex flex-col"
                style={{
                  marginTop: fig(28),
                  paddingTop: fig(24),
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  gap: fig(18),
                }}
              >
                <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                  <span className="wk-label">Full Gym</span>
                  <span className="wk-pill">Barbells, Cables &amp; Machines</span>
                </div>
                <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                  <span className="wk-label">At Home</span>
                  <span className="wk-pill">{homeEquipList}</span>
                </div>
                <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                  <span className="wk-label">Bodyweight</span>
                  <span className="wk-pill">Zero-Equipment Variations</span>
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

            {/* 3. 6-Week Training Plan (Mesocycle Periodization) */}
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
    </div>
  );
};
