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

const fig = (px: number) => `calc(${px} * var(--f))`;

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
      className="flex flex-col"
      style={{ marginTop: fig(36), gap: fig(22) }}
    >
      <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
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
          <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
            <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
              Athlete Profile &amp; Heart Rate
            </h3>
            <div className="flex items-center shrink-0" style={{ gap: fig(16) }}>
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

          <p
            style={{
              fontSize: `max(12px, ${fig(28)})`,
              lineHeight: 1.21,
              color: 'var(--wk-muted)',
              marginTop: fig(20),
            }}
          >
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
                      onClick={() => onUpdateProfile({ gender: g, sexEntered: true })}
                      className="wk-tap h-full font-bold uppercase transition-colors"
                      style={{
                        paddingLeft: fig(20),
                        paddingRight: fig(20),
                        borderRadius: fig(14),
                        fontSize: `max(12px, ${fig(22)})`,
                        background: isSelected ? 'var(--wk-pill)' : 'transparent',
                        color: isSelected ? 'var(--color-text-primary)' : 'var(--wk-muted)',
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
              <label htmlFor="athlete-age-input" className="wk-label">
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
                className="wk-field"
                style={{ width: fig(160) }}
              />
            </div>
            <p id="athlete-age-help" className="wk-body" style={{ marginTop: fig(-12) }}>
              Strength levels compare you with lifters of your sex, bodyweight and age group.
            </p>

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
                      className="wk-tap h-full font-bold uppercase transition-colors"
                      style={{
                        paddingLeft: fig(20),
                        paddingRight: fig(20),
                        borderRadius: fig(14),
                        fontSize: `max(12px, ${fig(22)})`,
                        background: isSelected ? 'var(--wk-pill)' : 'transparent',
                        color: isSelected ? 'var(--color-text-primary)' : 'var(--wk-muted)',
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
                      className="wk-tap h-full font-bold uppercase transition-colors"
                      style={{
                        paddingLeft: fig(16),
                        paddingRight: fig(16),
                        borderRadius: fig(14),
                        fontSize: `max(12px, ${fig(22)})`,
                        background: isSelected ? 'var(--wk-pill)' : 'transparent',
                        color: isSelected ? 'var(--color-text-primary)' : 'var(--wk-muted)',
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
                className="wk-field"
                style={{ width: fig(180) }}
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
          <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
            <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
              Wearable &amp; Recovery
            </h3>
            <div className="flex items-center shrink-0" style={{ gap: fig(16) }}>
              <span className="wk-pill">
                {isWatchConnected ? 'CONNECTED' : 'OFFLINE'}
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

          <p
            style={{
              fontSize: `max(12px, ${fig(28)})`,
              lineHeight: 1.21,
              color: 'var(--wk-muted)',
              marginTop: fig(20),
            }}
          >
            {activeWearableMeta
              ? `${activeWearableMeta.name} • Connected`
              : profile.healthConnectActivities
              ? 'Android Health Connect • Workouts on'
              : 'Connect Whoop or Health Connect'}
          </p>
        </button>

        {openSection === 'wearable' && (
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
                style={{ background: 'var(--wk-pill)', color: 'var(--color-text-primary)' }}
              >
                Manage Wearables &amp; Sync Recovery
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
          className="wk-button"
          style={{ background: 'var(--wk-card)', color: 'var(--color-text-primary)' }}
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
          <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
            <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
              Data Backup &amp; Privacy
            </h3>
            <div className="flex items-center shrink-0" style={{ gap: fig(16) }}>
              <span className="wk-pill">ON DEVICE</span>
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

          <p
            style={{
              fontSize: `max(12px, ${fig(28)})`,
              lineHeight: 1.21,
              color: 'var(--wk-muted)',
              marginTop: fig(20),
            }}
          >
            Stored privately on your device • Export or reset anytime
          </p>
        </button>

        {openSection === 'data' && (
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
                style={{ background: 'var(--wk-accent)', color: 'var(--color-text-on-accent)' }}
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
                  style={{ background: 'var(--wk-pill)', color: 'var(--color-text-primary)' }}
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
                    style={{ background: 'var(--wk-pill)', color: 'var(--color-text-primary)' }}
                  >
                    Restore Backup
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-2" style={{ gap: fig(16) }}>
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
                  className="wk-button"
                  style={{ background: 'var(--wk-raised)', color: 'var(--color-text-primary)' }}
                >
                  Load Sample Data
                </button>
              )}

              {onDeleteAllData && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('warning');
                    setConfirmDeleteOpen(!confirmDeleteOpen);
                  }}
                  className="wk-button"
                  style={{ background: 'var(--wk-raised)', color: 'var(--color-status-danger)' }}
                >
                  Delete All Data
                </button>
              )}
            </div>

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
                    style={{ background: 'var(--wk-pill)', color: 'var(--color-text-primary)' }}
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
                className="wk-tap w-full flex items-center justify-between wk-label"
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
                    <strong className="text-white">Privacy:</strong> Your workouts, bodyweight and recovery logs are stored on this device. When you connect Whoop, data passes through our server only to fetch it and is not stored there. Health data is never sold or shared.
                  </p>
                  <p style={{ marginTop: fig(12) }}>
                    <strong className="text-white">Fitness Disclaimer:</strong> Recovery scores and target weights are for informational fitness tracking only and are not medical advice.
                  </p>
                  <div
                    className="flex items-center font-bold"
                    style={{ marginTop: fig(16), gap: fig(24), color: 'var(--wk-accent)' }}
                  >
                    <a href="/privacy.html" target="_blank" rel="noreferrer" className="wk-tap hover:underline">
                      Full Privacy Policy &rarr;
                    </a>
                    <a href="/terms.html" target="_blank" rel="noreferrer" className="wk-tap hover:underline">
                      Terms of Service &rarr;
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
