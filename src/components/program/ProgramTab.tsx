import React, { useState, useRef } from 'react';
import {
  ExerciseDefinition,
  GoalPhase,
  UserProfile,
} from '../../engine/types';
import { SplitDayType } from '../../services/workoutGenerator';
import { SplitEditor } from './SplitEditor';
import { CustomExerciseModal } from './CustomExerciseModal';
import { MesocycleManager } from './MesocycleManager';
import { ProductGovernanceModal } from './ProductGovernanceModal';
import { GoalPhaseSwitcher } from '../character/GoalPhaseSwitcher';
import {
  RotateCcw,
  ShieldCheck,
  Download,
  Upload,
  Trash2,
  Smartphone,
  FileText,
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface ProgramTabProps {
  profile: UserProfile;
  exerciseCatalog: ExerciseDefinition[];
  activeSplitDay?: string;
  canInstallPwa?: boolean;
  onTriggerInstallPwa?: () => void;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onUpdateGoalPhase?: (phase: GoalPhase) => void;
  onSelectMesocycleWeek: (week: number) => void;
  onLaunchSplitDay: (split: SplitDayType) => void;
  onAddCustomExercise: (newEx: ExerciseDefinition) => void;
  onResetData: () => void;
  onExportData?: () => void;
  onImportData?: (rawJson: string) => void;
  onDeleteAllData?: () => void;
  onOpenOnboarding?: () => void;
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
  exerciseCatalog,
  activeSplitDay,
  canInstallPwa = false,
  onTriggerInstallPwa,
  onUpdateProfile,
  onUpdateGoalPhase,
  onSelectMesocycleWeek,
  onLaunchSplitDay,
  onAddCustomExercise,
  onResetData,
  onExportData,
  onImportData,
  onDeleteAllData,
  onOpenOnboarding,
}) => {
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [showGovernanceModal, setShowGovernanceModal] = useState(false);
  const [openSettingsSection, setOpenSettingsSection] = useState<'profile' | 'data' | null>(null);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const toggleSection = (sec: 'profile' | 'data') => {
    triggerHaptic('light');
    setOpenSettingsSection(openSettingsSection === sec ? null : sec);
  };

  const homeEquipList =
    (profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'])
      .map((item) => HOME_EQUIP_LABELS[item] || item)
      .join(', ') || 'Bodyweight';

  return (
    <div className="space-y-4 pb-28">
      {/* 1. Primary Section Header */}
      <div className="px-1 py-0.5">
        <h2 className="text-base font-bold text-white tracking-tight">
          Training Program &amp; Setup
        </h2>
        <p className="text-xs text-slate-400">
          Your goal phase, equipment locations, and 6-week plan
        </p>
      </div>

      {/* 1.5 Training Locations & Equipment Summary Card (Single Canonical Setup Entry Point) */}
      <div className="rounded-3xl surface-glass border border-white/[0.08] p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              Training Locations &amp; Equipment
            </h3>
            <p className="text-xs text-slate-400">
              Exercises adapt automatically when you switch location on the Workout tab
            </p>
          </div>
          {onOpenOnboarding && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenOnboarding();
              }}
              className="px-3 py-1.5 rounded-xl bg-brand-primary text-black text-xs font-bold shrink-0"
            >
              Edit Equipment
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.06]">
            <div className="font-bold text-white">Full Gym</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Barbells, Cables &amp; Machines
            </div>
          </div>
          <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.06]">
            <div className="font-bold text-white">At Home</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {homeEquipList}
            </div>
          </div>
          <div className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.06]">
            <div className="font-bold text-white">Bodyweight</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Zero-Equipment Variations
            </div>
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
        currentWeek={profile.mesocycleWeek || 3}
        totalWeeks={6}
        scheduledWeekLocations={profile.scheduledWeekLocations}
        onSelectWeek={onSelectMesocycleWeek}
        onTriggerDeload={() => onSelectMesocycleWeek(6)}
      />

      {/* 4. Workout Split & Exercises */}
      <SplitEditor
        exerciseCatalog={exerciseCatalog}
        activeSplitDay={activeSplitDay}
        programType={profile.programType}
        onOpenCreateExercise={() => setShowCreateExercise(true)}
        onLaunchSplitDay={onLaunchSplitDay}
      />

      {/* 5. Secondary Section: Profile & Data Settings (Collapsible Accordions) */}
      <div className="pt-2 space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
          Profile &amp; Data Settings
        </h3>

        {/* A. Athlete Profile & Heart Rate Zones Accordion */}
        <div className="rounded-3xl surface-glass border border-white/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('profile')}
            aria-expanded={openSettingsSection === 'profile'}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-white">
                <User className="w-4 h-4 stroke-[2]" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">
                  Athlete Profile &amp; Heart Rate
                </div>
                <div className="text-xs text-slate-400">
                  {profile.name} • Max HR {profile.maxHr} bpm • Resting {profile.restingHrBaseline} bpm
                </div>
              </div>
            </div>
            {openSettingsSection === 'profile' ? (
              <ChevronUp className="w-4 h-4 text-slate-400 stroke-[2]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 stroke-[2]" />
            )}
          </button>

          {openSettingsSection === 'profile' && (
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-white/[0.06]">
                <label htmlFor="athlete-name-input" className="text-slate-300 font-medium">
                  Name
                </label>
                <input
                  id="athlete-name-input"
                  type="text"
                  value={profile.name}
                  onChange={(e) => onUpdateProfile({ name: e.target.value })}
                  className="w-36 py-1.5 px-2.5 rounded-lg bg-surface-bg border border-white/[0.1] text-right font-bold text-white text-xs"
                />
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.06]">
                <span className="text-slate-300 font-medium">Strength Standard Category</span>
                <div className="flex bg-surface-bg p-0.5 rounded-xl border border-white/[0.08]">
                  {(['male', 'female'] as const).map((g) => {
                    const isSelected = profile.gender === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onUpdateProfile({ gender: g })}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                          isSelected
                            ? 'bg-brand-primary text-black font-bold shadow-sm'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.06]">
                <label htmlFor="max-hr-input" className="text-slate-300 font-medium">
                  Max Heart Rate
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    id="max-hr-input"
                    type="number"
                    value={profile.maxHr}
                    onChange={(e) =>
                      onUpdateProfile({ maxHr: parseInt(e.target.value, 10) || 190 })
                    }
                    className="w-16 py-1.5 px-2 rounded-lg bg-surface-bg border border-white/[0.1] font-mono text-center font-bold text-white text-xs"
                  />
                  <span className="text-slate-400">bpm</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-1">
                <label htmlFor="resting-hr-input" className="text-slate-300 font-medium">
                  Normal Resting Heart Rate
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    id="resting-hr-input"
                    type="number"
                    value={profile.restingHrBaseline}
                    onChange={(e) =>
                      onUpdateProfile({ restingHrBaseline: parseInt(e.target.value, 10) || 56 })
                    }
                    className="w-16 py-1.5 px-2 rounded-lg bg-surface-bg border border-white/[0.1] font-mono text-center font-bold text-white text-xs"
                  />
                  <span className="text-slate-400">bpm</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* C. Data Backup, Privacy & Reset Accordion */}
        <div className="rounded-3xl surface-glass border border-white/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('data')}
            aria-expanded={openSettingsSection === 'data'}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-brand-primary">
                <ShieldCheck className="w-4 h-4 stroke-[2]" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">
                  Data Backup &amp; Privacy
                </div>
                <div className="text-xs text-slate-400">
                  Stored privately on your device • Export or reset anytime
                </div>
              </div>
            </div>
            {openSettingsSection === 'data' ? (
              <ChevronUp className="w-4 h-4 text-slate-400 stroke-[2]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 stroke-[2]" />
            )}
          </button>

          {openSettingsSection === 'data' && (
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-3">
              {canInstallPwa && onTriggerInstallPwa && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onTriggerInstallPwa();
                  }}
                  className="w-full py-2.5 rounded-2xl bg-brand-primary text-black font-bold text-xs flex items-center justify-center space-x-2 shadow-md shadow-brand-primary/20"
                >
                  <Smartphone className="w-4 h-4 stroke-[2]" />
                  <span>Install App to Home Screen</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {onExportData && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onExportData();
                    }}
                    className="py-2.5 px-3 rounded-2xl bg-surface-elevated hover:bg-surface-hover border border-white/[0.08] text-xs font-semibold text-white flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
                    <span>Export Backup</span>
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
                      className="py-2.5 px-3 rounded-2xl bg-surface-elevated hover:bg-surface-hover border border-white/[0.08] text-xs font-semibold text-white flex items-center justify-center space-x-1.5 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-cyan-400 stroke-[2]" />
                      <span>Restore Backup</span>
                    </button>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onResetData();
                  }}
                  className="py-2.5 px-2.5 rounded-2xl bg-surface-bg hover:bg-surface-elevated border border-white/[0.08] text-xs font-semibold text-slate-200 flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />
                  <span>Load 6-Wk Sample</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('warning');
                    setConfirmDeleteOpen(!confirmDeleteOpen);
                  }}
                  className="py-2.5 px-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-semibold text-rose-300 flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400 stroke-[2]" />
                  <span>Delete All Data</span>
                </button>
              </div>

              {confirmDeleteOpen && onDeleteAllData && (
                <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-xs space-y-2">
                  <div className="font-bold text-white">
                    Permanently erase all workout &amp; recovery data?
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    This will wipe all workout history, bodyweight logs, custom exercises, and watch settings from this device.
                  </p>
                  <div className="flex space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="flex-1 py-2 rounded-xl bg-surface-elevated text-slate-200 font-semibold"
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
                      className="flex-1 py-2 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-400"
                    >
                      Confirm Erase
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                  aria-expanded={showPrivacyDetails}
                  className="w-full flex items-center justify-between text-xs text-slate-300 hover:text-white py-1"
                >
                  <span className="flex items-center space-x-1.5 font-semibold">
                    <FileText className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
                    <span>Privacy Policy &amp; Fitness Disclaimer</span>
                  </span>
                  {showPrivacyDetails ? (
                    <ChevronUp className="w-4 h-4 stroke-[2]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 stroke-[2]" />
                  )}
                </button>

                {showPrivacyDetails && (
                  <div className="mt-2 p-3 rounded-2xl bg-black/40 border border-white/[0.06] text-xs text-slate-300 space-y-2 leading-relaxed">
                    <p>
                      <strong className="text-white">On-Device Privacy:</strong> Your workout sets, bodyweight history, and watch sleep/heart rate logs are stored locally on your device. No health data is sold or shared.
                    </p>
                    <p>
                      <strong className="text-white">Fitness Disclaimer:</strong> Recovery scores and target weights are for informational fitness tracking only and are not medical advice.
                    </p>
                    <div className="flex items-center space-x-4 pt-1 font-semibold text-brand-primary">
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

        {/* D. Product Governance & Competitor Comparison Matrix */}
        <div className="rounded-3xl surface-glass border border-white/[0.08] p-4 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary shrink-0">
              <ShieldCheck className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                Product Governance &amp; Competitor Matrix
              </div>
              <div className="text-xs text-slate-400">
                Review Locked vs. Progressing features, rationale &amp; competitor benchmarks
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowGovernanceModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-brand-primary text-black text-xs font-bold shrink-0"
          >
            Open Matrix
          </button>
        </div>
      </div>

      {/* Custom Exercise Modal */}
      {showCreateExercise && (
        <CustomExerciseModal
          onAddExercise={onAddCustomExercise}
          onClose={() => setShowCreateExercise(false)}
        />
      )}

      {/* Product Governance & Competitor Matrix Modal */}
      {showGovernanceModal && (
        <ProductGovernanceModal onClose={() => setShowGovernanceModal(false)} />
      )}
    </div>
  );
};
