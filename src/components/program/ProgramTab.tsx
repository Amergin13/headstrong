import React, { useState, useRef, useEffect } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  WorkoutSession,
  GoalPhase,
  ProgramSplitType,
  UserProfile,
  getActiveWearableProvider,
  isWearableConnected,
} from '../../engine/types';
import { SplitDayType } from '../../services/workoutGenerator';
import { WEARABLE_PROVIDERS } from '../../services/wearableSyncService';
import { SplitEditor } from './SplitEditor';
import { ProgramPlanView } from './ProgramPlanView';
import { ProgramPickerModal } from './ProgramPickerModal';
import { CustomExerciseModal } from './CustomExerciseModal';
import { MesocycleManager } from './MesocycleManager';
import { ProductGovernanceModal } from './ProductGovernanceModal';
import { GoalPhaseSwitcher } from '../character/GoalPhaseSwitcher';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { GPU_MODEL_DOWNLOAD_LABEL, isGpuModelReady, removeGpuModel } from '../../services/gpuModel';

interface ProgramTabProps {
  profile: UserProfile;
  /** Completed and saved sessions, newest first. */
  workouts: WorkoutSession[];
  latestBiometrics?: BiometricLog;
  exerciseCatalog: ExerciseDefinition[];
  activeSplitDay?: string;
  canInstallPwa?: boolean;
  onTriggerInstallPwa?: () => void;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onOpenWatchSync?: () => void;
  onOpenAuth?: () => void;
  onUpdateGoalPhase?: (phase: GoalPhase) => void;
  onSelectMesocycleWeek: (week: number) => void;
  onLaunchSplitDay: (split: SplitDayType) => void;
  onLaunchWorkoutNumber?: (workoutNumber: number) => void;
  onUpdateProgram?: (program: ProgramSplitType) => void;
  onAddCustomExercise: (newEx: ExerciseDefinition) => void;
  onResetData: () => void;
  onExportData?: () => void;
  onImportData?: (rawJson: string) => void;
  onDeleteAllData?: () => void;
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
  workouts,
  latestBiometrics,
  exerciseCatalog,
  activeSplitDay,
  canInstallPwa = false,
  onTriggerInstallPwa,
  onUpdateProfile,
  onOpenWatchSync,
  onOpenAuth,
  onUpdateGoalPhase,
  onSelectMesocycleWeek,
  onLaunchSplitDay,
  onLaunchWorkoutNumber,
  onUpdateProgram,
  onAddCustomExercise,
  onResetData,
  onExportData,
  onImportData,
  onDeleteAllData,
  onOpenOnboarding,
  activeWorkoutName,
  activeProgramWorkoutNumber,
  onBackToWorkout,
}) => {
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [showGovernanceModal, setShowGovernanceModal] = useState(false);
  const [openSettingsSection, setOpenSettingsSection] = useState<'account' | 'profile' | 'wearable' | 'data' | null>(null);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deviceCoachReady, setDeviceCoachReady] = useState(false);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const openSettings = (open: boolean) => {
    triggerHaptic('light');
    setShowSettings(open);
    window.scrollTo({ top: 0 });
  };
  const isPlan = profile.programType === 'muscle_building_6wk';
  const changeProgram = (newProg: ProgramSplitType) => {
    if (onUpdateProgram) {
      onUpdateProgram(newProg);
    } else {
      onUpdateProfile({ programType: newProg });
    }
  };

  useEffect(() => {
    isGpuModelReady().then(setDeviceCoachReady).catch(() => setDeviceCoachReady(false));
  }, []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeWearableKey = getActiveWearableProvider(profile);
  const activeWearableMeta = activeWearableKey ? WEARABLE_PROVIDERS[activeWearableKey] : null;
  const isWatchConnected = isWearableConnected(profile);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportData) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportData(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleSection = (sec: 'account' | 'profile' | 'wearable' | 'data') => {
    triggerHaptic('light');
    setOpenSettingsSection(openSettingsSection === sec ? null : sec);
  };

  const homeEquipItems = profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'];
  const homeEquipList =
    homeEquipItems.map((item) => HOME_EQUIP_LABELS[item] || item).join(', ') || 'Bodyweight';

  return (
    <div
      className="wk -mx-3.5"
      style={{ paddingLeft: fig(38), paddingRight: fig(38), paddingBottom: 112 }}
    >
      {isPlan && !showSettings && (
        <>
          <ProgramPlanView
            workouts={workouts}
            activeProgramWorkoutNumber={activeProgramWorkoutNumber}
            onLaunchWorkoutNumber={onLaunchWorkoutNumber}
            onBackToWorkout={onBackToWorkout}
          />
          <button
            type="button"
            onClick={() => openSettings(true)}
            className="wk-button flex items-center justify-between"
            style={{ marginTop: fig(120), background: 'var(--wk-card)', color: '#fff', paddingLeft: fig(38), paddingRight: fig(31) }}
          >
            <span>Settings</span>
            <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
          </button>
        </>
      )}
      {isPlan && showSettings && (
        <header className="relative flex items-center justify-center" style={{ paddingTop: fig(20) }}>
          <button
            type="button"
            onClick={() => openSettings(false)}
            aria-label="Back to your program"
            className="absolute left-0 flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: 'var(--wk-card)' }}
          >
            <ChevronLeft className="text-white" style={{ width: 20, height: 20 }} strokeWidth={2} aria-hidden="true" />
          </button>
          <h1 className="wk-page-title">Settings</h1>
        </header>
      )}
      {!isPlan && (
        <header style={{ paddingTop: fig(20) }}>
          <h1 className="wk-page-title">Program</h1>
        </header>
      )}

      {(!isPlan || showSettings) && (
      <div className="flex flex-col" style={{ gap: fig(22), marginTop: fig(40) }}>
        {!isPlan && onBackToWorkout && (
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
              fontSize: fig(28),
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
              style={{ fontSize: fig(40), lineHeight: 1 }}
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

        {isPlan && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowProgramPicker(true);
            }}
            className="wk-button"
            style={{ background: 'var(--wk-card)', color: '#fff' }}
          >
            Change program
          </button>
        )}

        {/* 3. 6-Week Training Plan (Mesocycle Periodization) */}
        {!isPlan && <MesocycleManager
          currentWeek={profile.mesocycleWeek || 1}
          totalWeeks={6}
          scheduledWeekLocations={profile.scheduledWeekLocations}
          onSelectWeek={onSelectMesocycleWeek}
          onTriggerDeload={() => onSelectMesocycleWeek(6)}
        />}

        {/* 4. Workout Split & Exercises */}
        {!isPlan && (
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
        )}

        {/* 5. Account & Sync Card */}
        <div className="wk-card w-full text-left block">
          <button
            type="button"
            onClick={() => toggleSection('account')}
            aria-expanded={openSettingsSection === 'account'}
            className="w-full text-left block"
          >
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                Account &amp; Sync
              </h2>
              <div className="flex items-center shrink-0" style={{ gap: fig(16) }}>
                <span className="wk-pill">
                  {profile.email ? 'SIGNED IN' : 'LOCAL ONLY'}
                </span>
                <ChevronRight
                  className="wk-chevron transition-transform"
                  style={{
                    transform: openSettingsSection === 'account' ? 'rotate(90deg)' : undefined,
                  }}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
            </div>

            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              {profile.email
                ? `${profile.email} • Signed in`
                : 'Guest • Your data stays on this device'}
            </p>
          </button>

          {openSettingsSection === 'account' && (
            <div
              className="flex flex-col"
              style={{
                marginTop: fig(28),
                paddingTop: fig(24),
                borderTop: '1px solid rgba(255,255,255,0.08)',
                gap: fig(20),
              }}
            >
              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <span className="wk-label">Account Status</span>
                <span className="wk-pill">
                  {profile.email ? 'Google Account' : 'Guest (Local Only)'}
                </span>
              </div>
              {profile.email && (
                <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                  <span className="wk-label">Email</span>
                  <span className="wk-body">{profile.email}</span>
                </div>
              )}
              <p className="wk-body">
                Workouts are saved on this device only. Cloud sync isn&apos;t available yet, so use Export
                Backup below to keep a copy.
              </p>

              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenAuth();
                  }}
                  className="wk-button"
                  style={{ background: 'var(--wk-pill)', color: '#fff' }}
                >
                  {profile.email ? 'Manage Account & Sign Out' : 'Sign In with Google'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 6. Athlete Profile & Heart Rate Card */}
        <div className="wk-card w-full text-left block">
          <button
            type="button"
            onClick={() => toggleSection('profile')}
            aria-expanded={openSettingsSection === 'profile'}
            className="w-full text-left block"
          >
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                Athlete Profile &amp; Heart Rate
              </h2>
              <div className="flex items-center shrink-0" style={{ gap: fig(16) }}>
                <span className="wk-pill">
                  {(profile.weightUnit || 'kg').toUpperCase()}
                </span>
                <ChevronRight
                  className="wk-chevron transition-transform"
                  style={{
                    transform: openSettingsSection === 'profile' ? 'rotate(90deg)' : undefined,
                  }}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
            </div>

            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              {profile.name} • Max HR {profile.maxHr} bpm • Resting {profile.restingHrBaseline} bpm
            </p>
          </button>

          {openSettingsSection === 'profile' && (
            <div
              className="flex flex-col"
              style={{
                marginTop: fig(28),
                paddingTop: fig(24),
                borderTop: '1px solid rgba(255,255,255,0.08)',
                gap: fig(22),
              }}
            >
              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <label htmlFor="athlete-name-input" className="wk-label">
                  Name
                </label>
                <input
                  id="athlete-name-input"
                  type="text"
                  value={profile.name}
                  onChange={(e) => onUpdateProfile({ name: e.target.value })}
                  className="wk-field"
                  style={{ width: fig(320) }}
                />
              </div>

              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <span className="wk-label">Strength Standard Category</span>
                <div
                  className="grid grid-cols-2 items-center"
                  style={{
                    height: fig(76),
                    padding: fig(6),
                    borderRadius: fig(18),
                    background: 'var(--wk-raised)',
                  }}
                >
                  {(['male', 'female'] as const).map((g) => {
                    const isSelected = profile.gender === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onUpdateProfile({ gender: g })}
                        className="h-full px-3 font-bold uppercase transition-colors"
                        style={{
                          borderRadius: fig(14),
                          fontSize: fig(22),
                          background: isSelected ? 'var(--wk-pill)' : 'transparent',
                          color: isSelected ? '#fff' : 'var(--wk-muted)',
                        }}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <span className="wk-label">Weight Units</span>
                <div
                  className="grid grid-cols-2 items-center"
                  style={{
                    height: fig(76),
                    padding: fig(6),
                    borderRadius: fig(18),
                    background: 'var(--wk-raised)',
                  }}
                  role="group"
                  aria-label="Weight units"
                >
                  {(['kg', 'lb'] as const).map((u) => {
                    const isSelected = (profile.weightUnit || 'kg') === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onUpdateProfile({ weightUnit: u })}
                        className="h-full px-3 font-bold uppercase transition-colors"
                        style={{
                          borderRadius: fig(14),
                          fontSize: fig(22),
                          background: isSelected ? 'var(--wk-pill)' : 'transparent',
                          color: isSelected ? '#fff' : 'var(--wk-muted)',
                        }}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <span className="wk-label">Training Experience</span>
                <div
                  className="grid grid-cols-3 items-center"
                  style={{
                    height: fig(76),
                    padding: fig(6),
                    borderRadius: fig(18),
                    background: 'var(--wk-raised)',
                  }}
                  role="group"
                  aria-label="Training experience"
                >
                  {([
                    { id: 'new', label: 'New' },
                    { id: 'intermediate', label: '1–3 yrs' },
                    { id: 'experienced', label: '3+ yrs' },
                  ] as const).map((opt) => {
                    const isSelected = (profile.experienceLevel || 'intermediate') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onUpdateProfile({ experienceLevel: opt.id })}
                        className="h-full px-2.5 font-bold uppercase transition-colors"
                        style={{
                          borderRadius: fig(14),
                          fontSize: fig(22),
                          background: isSelected ? 'var(--wk-pill)' : 'transparent',
                          color: isSelected ? '#fff' : 'var(--wk-muted)',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <label htmlFor="max-hr-input" className="wk-label">
                  Max Heart Rate (bpm)
                </label>
                <input
                  id="max-hr-input"
                  type="number"
                  value={profile.maxHr}
                  onChange={(e) =>
                    onUpdateProfile({ maxHr: parseInt(e.target.value, 10) || 190 })
                  }
                  className="wk-field"
                  style={{ width: fig(180) }}
                />
              </div>

              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <label htmlFor="resting-hr-input" className="wk-label">
                  Normal Resting HR (bpm)
                </label>
                <input
                  id="resting-hr-input"
                  type="number"
                  value={profile.restingHrBaseline}
                  onChange={(e) =>
                    onUpdateProfile({ restingHrBaseline: parseInt(e.target.value, 10) || 56 })
                  }
                  className="wk-field"
                  style={{ width: fig(180) }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 7. Wearable & Recovery Card */}
        <div className="wk-card w-full text-left block">
          <button
            type="button"
            onClick={() => toggleSection('wearable')}
            aria-expanded={openSettingsSection === 'wearable'}
            className="w-full text-left block"
          >
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                Wearable &amp; Recovery
              </h2>
              <div className="flex items-center shrink-0" style={{ gap: fig(16) }}>
                <span className="wk-pill">
                  {isWatchConnected ? 'CONNECTED' : 'OFFLINE'}
                </span>
                <ChevronRight
                  className="wk-chevron transition-transform"
                  style={{
                    transform: openSettingsSection === 'wearable' ? 'rotate(90deg)' : undefined,
                  }}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
            </div>

            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              {activeWearableMeta
                ? `${activeWearableMeta.name} • Connected`
                : 'Connect Fitbit, Whoop, or Health Connect'}
            </p>
          </button>

          {openSettingsSection === 'wearable' && (
            <div
              className="flex flex-col"
              style={{
                marginTop: fig(28),
                paddingTop: fig(24),
                borderTop: '1px solid rgba(255,255,255,0.08)',
                gap: fig(20),
              }}
            >
              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <span className="wk-label">Connected Device</span>
                <span className="wk-pill">{activeWearableMeta?.name || 'None'}</span>
              </div>
              {latestBiometrics && latestBiometrics.hrvRmssd > 0 && (
                <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                  <span className="wk-label">Recent Recovery</span>
                  <span className="wk-pill">
                    HRV {latestBiometrics.hrvRmssd} ms • RHR {latestBiometrics.restingHr} bpm
                  </span>
                </div>
              )}

              {onOpenWatchSync && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenWatchSync();
                  }}
                  className="wk-button"
                  style={{ background: 'var(--wk-pill)', color: '#fff' }}
                >
                  Manage Wearables &amp; Sync Recovery
                </button>
              )}
            </div>
          )}
        </div>

        {/* 8. Data Backup & Privacy Card */}
        <div className="wk-card w-full text-left block">
          <button
            type="button"
            onClick={() => toggleSection('data')}
            aria-expanded={openSettingsSection === 'data'}
            className="w-full text-left block"
          >
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                Data Backup &amp; Privacy
              </h2>
              <div className="flex items-center shrink-0" style={{ gap: fig(16) }}>
                <span className="wk-pill">ON DEVICE</span>
                <ChevronRight
                  className="wk-chevron transition-transform"
                  style={{
                    transform: openSettingsSection === 'data' ? 'rotate(90deg)' : undefined,
                  }}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
            </div>

            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              Stored privately on your device • Export or reset anytime
            </p>
          </button>

          {openSettingsSection === 'data' && (
            <div
              className="flex flex-col"
              style={{
                marginTop: fig(28),
                paddingTop: fig(24),
                borderTop: '1px solid rgba(255,255,255,0.08)',
                gap: fig(20),
              }}
            >
              {canInstallPwa && onTriggerInstallPwa && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onTriggerInstallPwa();
                  }}
                  className="wk-button"
                  style={{ background: 'var(--wk-accent)', color: '#13181C' }}
                >
                  Install App to Home Screen
                </button>
              )}

              <div className="grid grid-cols-2" style={{ gap: fig(16) }}>
                {onExportData && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onExportData();
                    }}
                    className="wk-button"
                    style={{ background: 'var(--wk-pill)', color: '#fff' }}
                  >
                    Export Backup
                  </button>
                )}

                {onImportData && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json"
                      onChange={handleFileUpload}
                      className="hidden"
                      aria-label="Import JSON backup file"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        fileInputRef.current?.click();
                      }}
                      className="wk-button"
                      style={{ background: 'var(--wk-pill)', color: '#fff' }}
                    >
                      Restore Backup
                    </button>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2" style={{ gap: fig(16) }}>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    if (
                      window.confirm(
                        'Load sample data? This replaces your own workouts and history on this device. Export a backup first if you want to keep them.'
                      )
                    ) {
                      onResetData();
                    }
                  }}
                  className="wk-button"
                  style={{ background: 'var(--wk-raised)', color: '#fff' }}
                >
                  Load Sample Data
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('warning');
                    setConfirmDeleteOpen(!confirmDeleteOpen);
                  }}
                  className="wk-button"
                  style={{ background: 'var(--wk-raised)', color: '#FF3B4E' }}
                >
                  Delete All Data
                </button>
              </div>

              {deviceCoachReady && (
                <button
                  type="button"
                  onClick={async () => {
                    triggerHaptic('light');
                    await removeGpuModel();
                    setDeviceCoachReady(false);
                  }}
                  className="wk-button"
                  style={{ background: 'var(--wk-raised)', color: '#fff' }}
                >
                  Remove on-phone coach download (frees {GPU_MODEL_DOWNLOAD_LABEL})
                </button>
              )}

              {confirmDeleteOpen && onDeleteAllData && (
                <div
                  style={{
                    paddingTop: fig(20),
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="wk-label">
                    Permanently erase all workout &amp; recovery data?
                  </div>
                  <p className="wk-body" style={{ marginTop: fig(12) }}>
                    This will wipe all workout history, bodyweight logs, custom exercises, and watch settings from this device.
                  </p>
                  <div className="grid grid-cols-2" style={{ marginTop: fig(20), gap: fig(16) }}>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="wk-button"
                      style={{ background: 'var(--wk-pill)', color: '#fff' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('warning');
                        onDeleteAllData();
                        setConfirmDeleteOpen(false);
                      }}
                      className="wk-button"
                      style={{ background: '#FF3B4E', color: '#fff' }}
                    >
                      Confirm Erase
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  paddingTop: fig(20),
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                  aria-expanded={showPrivacyDetails}
                  className="w-full flex items-center justify-between wk-label"
                >
                  <span>Privacy Policy &amp; Fitness Disclaimer</span>
                  <ChevronRight
                    className="wk-chevron transition-transform"
                    style={{ transform: showPrivacyDetails ? 'rotate(90deg)' : undefined }}
                    strokeWidth={2}
                  />
                </button>

                {showPrivacyDetails && (
                  <div className="wk-body" style={{ marginTop: fig(16) }}>
                    <p>
                      <strong className="text-white">Privacy:</strong> Your workouts, bodyweight and recovery logs are stored on this device. When you connect Fitbit or Whoop, their data passes through our server only to fetch it and is not stored there. Health data is never sold or shared.
                    </p>
                    <p style={{ marginTop: fig(12) }}>
                      <strong className="text-white">Fitness Disclaimer:</strong> Recovery scores and target weights are for informational fitness tracking only and are not medical advice.
                    </p>
                    <div
                      className="flex items-center font-bold"
                      style={{ marginTop: fig(16), gap: fig(24), color: 'var(--wk-accent)' }}
                    >
                      <a href="/privacy.html" target="_blank" rel="noreferrer" className="hover:underline">
                        Full Privacy Policy &rarr;
                      </a>
                      <a href="/terms.html" target="_blank" rel="noreferrer" className="hover:underline">
                        Terms of Service &rarr;
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* D. Product Governance & Competitor Comparison Matrix (internal tool: development builds only) */}
        {import.meta.env.DEV && (
          <div className="wk-card w-full text-left block">
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                Product Governance &amp; Competitor Matrix
              </h2>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setShowGovernanceModal(true);
                }}
                className="wk-pill shrink-0"
              >
                Open Matrix
              </button>
            </div>
            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              Review Locked vs. Progressing features, rationale &amp; competitor benchmarks
            </p>
          </div>
        )}
      </div>
      )}

      {/* Custom Exercise Modal */}
      {showCreateExercise && (
        <CustomExerciseModal
          onAddExercise={onAddCustomExercise}
          onClose={() => setShowCreateExercise(false)}
        />
      )}

      {/* Product Governance & Competitor Matrix Modal */}
      {showProgramPicker && (
        <ProgramPickerModal
          programType={profile.programType || 'ppl_upper'}
          onChangeProgram={changeProgram}
          onClose={() => setShowProgramPicker(false)}
        />
      )}

      {showGovernanceModal && (
        <ProductGovernanceModal onClose={() => setShowGovernanceModal(false)} />
      )}
    </div>
  );
};
