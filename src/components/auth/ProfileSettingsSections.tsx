import React, { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  BiometricLog,
  UserProfile,
  getActiveWearableProvider,
  isWearableConnected,
} from '../../engine/types';
import { WEARABLE_PROVIDERS } from '../../services/wearableSyncService';
import { triggerHaptic } from '../../utils/haptics';


/** Starting values until the athlete enters their own (used only with measured heart-rate data). */
const PLACEHOLDER_MAX_HR = 190;
const PLACEHOLDER_RESTING_HR = 60;

export interface ProfileSettingsSectionsProps {
  profile: UserProfile;
  latestBiometrics?: BiometricLog;
  canInstallPwa?: boolean;
  onTriggerInstallPwa?: () => void;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onOpenWatchSync?: () => void;
  onOpenActivityApps?: () => void;
  onResetData?: () => void;
  onExportData?: () => void;
  onImportData?: (rawJson: string) => void;
  onDeleteAllData?: () => void;
}

/**
 * Athlete Settings accessed from User Profile (Profile, Wearable & Recovery,
 * Activity apps, and Data Backup & Privacy). Plan switching, training locations/equipment,
 * and training goal live elsewhere in the app and are intentionally excluded from Settings.
 */
export const ProfileSettingsSections: React.FC<ProfileSettingsSectionsProps> = ({
  profile,
  latestBiometrics,
  canInstallPwa = false,
  onTriggerInstallPwa,
  onUpdateProfile,
  onOpenWatchSync,
  onOpenActivityApps,
  onResetData,
  onExportData,
  onImportData,
  onDeleteAllData,
}) => {
  const [openSection, setOpenSection] = useState<'profile' | 'wearable' | 'data' | null>(null);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const maxHrKnown = profile.maxHrEntered ?? profile.maxHr !== PLACEHOLDER_MAX_HR;
  const restingHrKnown = profile.restingHrEntered ?? profile.restingHrBaseline !== PLACEHOLDER_RESTING_HR;

  const activeWearableKey = getActiveWearableProvider(profile);
  const activeWearableMeta = activeWearableKey ? WEARABLE_PROVIDERS[activeWearableKey] : null;
  const isWatchConnected = isWearableConnected(profile);

  const toggleSection = (sec: 'profile' | 'wearable' | 'data') => {
    triggerHaptic('light');
    setOpenSection(openSection === sec ? null : sec);
  };

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

  return (
    <section
      aria-label="Settings"
      className="flex flex-col mt-6 gap-3"
    >
      <h2 className="wk-h1 leading-tight">
        Settings
      </h2>

      {/* 1. Athlete Profile & Heart Rate Card */}
      <div className="wk-card w-full text-left block">
        <button
          type="button"
          onClick={() => toggleSection('profile')}
          aria-expanded={openSection === 'profile'}
          className="w-full text-left block"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="wk-subhead leading-tight">
              Athlete profile &amp; heart rate
            </h3>
            <div className="flex items-center shrink-0 gap-2">
              <span className="wk-pill">
                {(profile.weightUnit || 'kg').toUpperCase()}
              </span>
              <ChevronRight
                className="wk-chevron transition-transform"
                style={{
                  transform: openSection === 'profile' ? 'rotate(90deg)' : undefined,
                }}
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
          </div>

          <p className="wk-caption mt-2">
            {[
              profile.name,
              maxHrKnown && `Max HR ${profile.maxHr} bpm`,
              restingHrKnown && `Resting ${profile.restingHrBaseline} bpm`,
            ]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </button>

        {openSection === 'profile' && (
          <div className="flex flex-col mt-4 pt-4 gap-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="athlete-name-input" className="wk-meta-title">
                Name
              </label>
              <input
                id="athlete-name-input"
                type="text"
                value={profile.name}
                onChange={(e) => onUpdateProfile({ name: e.target.value })}
                className="wk-field text-base w-40"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="wk-meta-title">Strength standard category</span>
              <div className="wk-segments grid grid-cols-2 shrink-0">
                {(['male', 'female'] as const).map((g) => {
                  const isSelected = profile.gender === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onUpdateProfile({ gender: g, sexEntered: true })}
                      className={`wk-segment px-3 capitalize ${isSelected ? 'is-active' : ''}`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="athlete-age-input" className="wk-meta-title">
                Age
              </label>
              <input
                id="athlete-age-input"
                type="number"
                inputMode="numeric"
                min={16}
                max={99}
                value={profile.ageEntered ? profile.age : ''}
                placeholder="—"
                aria-describedby="athlete-age-help"
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (!e.target.value) onUpdateProfile({ ageEntered: false });
                  else if (v >= 16 && v <= 99) onUpdateProfile({ age: v, ageEntered: true });
                }}
                className="wk-field text-base tabular-nums w-20"
              />
            </div>
            <p id="athlete-age-help" className="wk-body -mt-2 max-w-prose">
              Strength levels compare you with lifters of your sex, bodyweight and age group.
            </p>

            <div className="flex items-center justify-between gap-3">
              <span className="wk-meta-title">Weight units</span>
              <div
                className="wk-segments grid grid-cols-2 shrink-0"
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
                      className={`wk-segment px-4 ${isSelected ? 'is-active' : ''}`}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="wk-meta-title">Training experience</span>
              <div
                className="wk-segments grid grid-cols-3 shrink-0"
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
                      className={`wk-segment px-2 ${isSelected ? 'is-active' : ''}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="max-hr-input" className="wk-meta-title">
                Max heart rate (bpm)
              </label>
              <input
                id="max-hr-input"
                type="number"
                value={maxHrKnown ? profile.maxHr : ''}
                placeholder="—"
                onChange={(e) => {
                  const bpm = parseInt(e.target.value, 10);
                  onUpdateProfile(
                    bpm > 0
                      ? { maxHr: bpm, maxHrEntered: true }
                      : { maxHr: PLACEHOLDER_MAX_HR, maxHrEntered: false }
                  );
                }}
                className="wk-field text-base tabular-nums w-24"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="resting-hr-input" className="wk-meta-title">
                Normal resting HR (bpm)
              </label>
              <input
                id="resting-hr-input"
                type="number"
                value={restingHrKnown ? profile.restingHrBaseline : ''}
                placeholder="—"
                onChange={(e) => {
                  const bpm = parseInt(e.target.value, 10);
                  onUpdateProfile(
                    bpm > 0
                      ? { restingHrBaseline: bpm, restingHrEntered: true }
                      : { restingHrBaseline: PLACEHOLDER_RESTING_HR, restingHrEntered: false }
                  );
                }}
                className="wk-field text-base tabular-nums w-24"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Wearable & Recovery Card */}
      <div className="wk-card w-full text-left block">
        <button
          type="button"
          onClick={() => toggleSection('wearable')}
          aria-expanded={openSection === 'wearable'}
          className="w-full text-left block"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="wk-subhead leading-tight">
              Wearable &amp; recovery
            </h3>
            <div className="flex items-center shrink-0 gap-2">
              <span className="wk-pill">
                {isWatchConnected ? 'Connected' : 'Offline'}
              </span>
              <ChevronRight
                className="wk-chevron transition-transform"
                style={{
                  transform: openSection === 'wearable' ? 'rotate(90deg)' : undefined,
                }}
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
          </div>

          <p className="wk-caption mt-2">
            {activeWearableMeta
              ? `${activeWearableMeta.name} • Connected`
              : profile.healthConnectActivities
              ? 'Android Health Connect • Workouts on'
              : 'Connect Whoop or Health Connect'}
          </p>
        </button>

        {openSection === 'wearable' && (
          <div className="flex flex-col mt-4 pt-4 gap-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="wk-meta-title">Connected device</span>
              <span className="wk-pill">{activeWearableMeta?.name || 'None'}</span>
            </div>
            {latestBiometrics && latestBiometrics.hrvRmssd > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="wk-meta-title">Recent recovery</span>
                <span className="wk-pill tabular-nums">
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
                className="wk-btn-secondary w-full mt-1"
              >
                Manage wearables &amp; sync recovery
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. Activity Apps */}
      {onOpenActivityApps && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onOpenActivityApps();
          }}
          className="wk-btn-secondary w-full"
        >
          Activity apps
        </button>
      )}

      {/* 4. Data Backup & Privacy Card */}
      <div className="wk-card w-full text-left block">
        <button
          type="button"
          onClick={() => toggleSection('data')}
          aria-expanded={openSection === 'data'}
          className="w-full text-left block"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="wk-subhead leading-tight">
              Data backup &amp; privacy
            </h3>
            <div className="flex items-center shrink-0 gap-2">
              <span className="wk-pill">On device</span>
              <ChevronRight
                className="wk-chevron transition-transform"
                style={{
                  transform: openSection === 'data' ? 'rotate(90deg)' : undefined,
                }}
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
          </div>

          <p className="wk-caption mt-2">
            Stored privately on your device • Export or reset anytime
          </p>
        </button>

        {openSection === 'data' && (
          <div className="flex flex-col mt-4 pt-4 gap-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            {canInstallPwa && onTriggerInstallPwa && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onTriggerInstallPwa();
                }}
                className="wk-button active:scale-[0.98] transition-transform"
                style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
              >
                Install app to home screen
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
                  className="wk-btn-secondary w-full"
                >
                  Export backup
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
                    className="wk-btn-secondary w-full"
                  >
                    Restore backup
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {onResetData && (
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
                  className="wk-btn-secondary w-full"
                >
                  Load sample data
                </button>
              )}

              {onDeleteAllData && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('warning');
                    setConfirmDeleteOpen(!confirmDeleteOpen);
                  }}
                  className="wk-btn-secondary w-full"
                  style={{ color: 'var(--color-status-danger)' }}
                >
                  Delete all data
                </button>
              )}
            </div>

            {confirmDeleteOpen && onDeleteAllData && (
              <div className="pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <div className="wk-subhead">
                  Permanently erase all workout &amp; recovery data?
                </div>
                <p className="wk-body mt-2 max-w-prose">
                  This will wipe all workout history, bodyweight logs, custom exercises, and watch settings from this device.
                </p>
                <div className="grid grid-cols-2 mt-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="wk-btn-secondary w-full"
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
                    style={{ background: 'var(--color-action-destructive-bg)', color: 'var(--color-action-destructive-fg)' }}
                  >
                    Confirm erase
                  </button>
                </div>
              </div>
            )}

            <div className="pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <button
                type="button"
                onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                aria-expanded={showPrivacyDetails}
                className="min-h-[44px] w-full flex items-center justify-between wk-meta-title"
              >
                <span>Privacy policy &amp; fitness disclaimer</span>
                <ChevronRight
                  className="wk-chevron transition-transform"
                  style={{ transform: showPrivacyDetails ? 'rotate(90deg)' : undefined }}
                  strokeWidth={2}
                />
              </button>

              {showPrivacyDetails && (
                <div className="wk-body mt-2 max-w-prose space-y-2">
                  <p>
                    <strong style={{ color: 'var(--color-text-primary)' }}>Privacy:</strong> Your workouts, bodyweight and recovery logs are stored on this device. When you connect Whoop, data passes through our server only to fetch it and is not stored there. Health data is never sold or shared.
                  </p>
                  <p>
                    <strong style={{ color: 'var(--color-text-primary)' }}>Fitness disclaimer:</strong> Recovery scores and target weights are for informational fitness tracking only and are not medical advice.
                  </p>
                  <div
                    className="flex flex-wrap items-center font-medium gap-4 pt-1"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    <a href="/privacy.html" target="_blank" rel="noreferrer" className="min-h-[44px] inline-flex items-center hover:underline">
                      Full privacy policy &rarr;
                    </a>
                    <a href="/terms.html" target="_blank" rel="noreferrer" className="min-h-[44px] inline-flex items-center hover:underline">
                      Terms of service &rarr;
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
