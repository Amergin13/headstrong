import React, { useState, useRef } from 'react';
import {
  BiometricLog,
  ReadinessState,
  UserProfile,
  WearableProvider,
  WearableSyncProgress,
  getActiveWearableProvider,
} from '../../engine/types';
import {
  WEARABLE_PROVIDERS,
  syncWearableBiometrics,
  disconnectWearable,
  setActiveTracker,
} from '../../services/wearableSyncService';
import { parseFitbitExport } from '../../services/fitbitService';
import {
  initiateWhoopOAuth,
  WhoopReconnectNeededError,
  getWhoopRedirectUri,
  WHOOP_CONFIG,
  parseWhoopCsvExport,
} from '../../services/whoopService';
import { parseHealthConnectExport } from '../../services/healthConnectService';
import { HealthConnectStatus } from '../../services/healthConnectBridge';
import { X } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WatchSyncModalProps {
  profile: UserProfile;
  latestBiometrics: BiometricLog;
  onSyncCompleted: (newLog: BiometricLog, provider: WearableProvider) => void;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  hcStatus?: HealthConnectStatus;
  onSetHealthConnect?: (on: boolean) => void;
  /** False when the installed app is too old to open the permission screen. */
  onRequestHealthConnectPermission?: () => boolean | void;
  onClose?: () => void;
  isModal?: boolean;
}


const UPDATE_APP_FOR_PERMISSION =
  'Update Treise from Google Play to allow this here. Or open Android Settings, then Health Connect, then App permissions, and allow Treise.';

export const WatchSyncModal: React.FC<WatchSyncModalProps> = ({
  profile,
  latestBiometrics,
  onSyncCompleted,
  onUpdateProfile,
  hcStatus,
  onSetHealthConnect,
  onRequestHealthConnectPermission,
  onClose,
  isModal = false,
}) => {
  const activeProv = getActiveWearableProvider(profile);
  const initialProvider: 'whoop' | 'health_connect' =
    activeProv === 'health_connect' || (!profile.whoopConnected && profile.healthConnectActivities)
      ? 'health_connect'
      : 'whoop';
  const [selectedProvider, setSelectedProvider] = useState<'whoop' | 'health_connect'>(initialProvider);
  const [syncProgress, setSyncProgress] = useState<WearableSyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [whoopReconnectNeeded, setWhoopReconnectNeeded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const providerMeta = WEARABLE_PROVIDERS[selectedProvider];
  const hcBridgeAvailable = Boolean(hcStatus?.bridge && hcStatus?.available);
  const hcWorkoutsOn = Boolean(profile.healthConnectActivities && hcStatus?.granted);

  const isProviderConnected =
    selectedProvider === 'whoop'
      ? Boolean(profile.whoopConnected)
      : Boolean(profile.healthConnectConnected);

  const isCurrentActive = profile.wearableSource === selectedProvider;

  const handleSetActiveTracker = () => {
    triggerHaptic('success');
    if (onUpdateProfile) {
      const updates = setActiveTracker(selectedProvider, profile);
      onUpdateProfile(updates);
      setImportStatus(`${providerMeta.name} is now your active tracker.`);
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  const handleToggleHealthConnectWorkouts = () => {
    triggerHaptic('medium');
    if (!onSetHealthConnect) return;
    if (hcWorkoutsOn) {
      onSetHealthConnect(false);
      setImportStatus('Health Connect workout sync turned off.');
    } else {
      // Health Connect only adds workouts here, so the recovery tracker (and its connection) stays as it is.
      onSetHealthConnect(true);
      if (!hcStatus?.granted && onRequestHealthConnectPermission) {
        if (onRequestHealthConnectPermission() === false) setImportStatus(UPDATE_APP_FOR_PERMISSION);
      } else {
        setImportStatus('Health Connect is on. Pixel Watch, Fitbit and other watch workouts and daily steps will sync automatically.');
      }
    }
  };

  const handleStartSync = async (stateOverride?: ReadinessState) => {
    setIsSyncing(true);
    triggerHaptic('medium');
    setSyncProgress({
      stage: 'connecting',
      percent: 20,
      message: `Syncing with ${providerMeta.name}...`,
      provider: selectedProvider,
    });

    try {
      const accessToken = selectedProvider === 'whoop' ? profile.whoopAccessToken : undefined;
      const refreshToken = selectedProvider === 'whoop' ? profile.whoopRefreshToken : undefined;

      const result = await syncWearableBiometrics(selectedProvider, {
        onProgress: (prog) => setSyncProgress(prog),
        forcedState: stateOverride,
        accessToken,
        refreshToken,
      });

      triggerHaptic('success');
      onSyncCompleted(result, selectedProvider);
      if (onUpdateProfile) {
        onUpdateProfile(setActiveTracker(selectedProvider, profile));
      }
    } catch (err: any) {
      if (err instanceof WhoopReconnectNeededError) setWhoopReconnectNeeded(true);
      setSyncProgress({
        stage: 'error',
        percent: 0,
        message: err?.message || `Could not sync data from ${providerMeta.name}. Please check your connection.`,
        provider: selectedProvider,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnectProvider = async () => {
    triggerHaptic('medium');
    setIsSyncing(true);

    if (selectedProvider === 'whoop') {
      try {
        setSyncProgress({
          stage: 'connecting',
          percent: 25,
          message: 'Connecting to Whoop...',
          provider: 'whoop',
        });
        const effectiveId = profile.whoopClientId || WHOOP_CONFIG.CLIENT_ID;
        const effectiveUri = profile.whoopRedirectUri || getWhoopRedirectUri();
        const url = await initiateWhoopOAuth(effectiveId, effectiveUri);
        if (typeof window !== 'undefined') {
          window.location.href = url;
        }
      } catch (err) {
        console.error('Failed to initiate Whoop OAuth:', err);
        setSyncProgress({
          stage: 'error',
          percent: 0,
          message: 'Could not connect to Whoop. Please try again.',
          provider: 'whoop',
        });
        setIsSyncing(false);
      }
      return;
    }

    handleHealthConnectSettings();
    setIsSyncing(false);
  };

  const handleDisconnectProvider = () => {
    triggerHaptic('light');
    if (onUpdateProfile) {
      const updates = disconnectWearable(selectedProvider, profile);
      onUpdateProfile(updates);
    }
    if (selectedProvider === 'health_connect' && hcWorkoutsOn && onSetHealthConnect) {
      onSetHealthConnect(false);
    }
    setSyncProgress(null);
  };

  const handleHealthConnectSettings = () => {
    triggerHaptic('light');
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isWhoopCsv =
      selectedProvider === 'whoop' ||
      lowerName.includes('cycles') ||
      lowerName.includes('whoop');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;

        if (isWhoopCsv) {
          const parsed = parseWhoopCsvExport(text);
          if (parsed.length > 0) {
            const latest = parsed[parsed.length - 1];
            onSyncCompleted(latest, 'whoop');
            if (onUpdateProfile) {
              onUpdateProfile({
                ...setActiveTracker('whoop', profile),
                whoopConnected: true,
              });
            }
            setImportStatus(`Imported ${parsed.length} daily recovery records from Whoop CSV export.`);
            triggerHaptic('success');
            return;
          }
        }

        const parsedHc = parseHealthConnectExport(text);
        const parsed = parsedHc.length > 0 ? parsedHc : parseFitbitExport(text);
        if (parsed.length > 0) {
          const latest = { ...parsed[parsed.length - 1], source: 'health_connect' as const };
          onSyncCompleted(latest, 'health_connect');
          if (onUpdateProfile) {
            onUpdateProfile({
              ...setActiveTracker('health_connect', profile),
              healthConnectConnected: true,
              healthConnectLastSync: new Date().toISOString(),
            });
          }
          setImportStatus(`Saved your latest day from this file (${latest.date}).`);
          triggerHaptic('success');
        } else {
          setImportStatus('No biometric records found in file.');
        }
      } catch {
        setImportStatus('Failed to read file. Please ensure it is a valid Whoop CSV or Health Connect JSON export.');
      }
    };
    reader.readAsText(file);
  };

  const content = (
    <div className="wk-card w-full text-left block shadow-xl">
      {/* Header & Close */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="wk-h1 leading-tight">
            Wearable &amp; recovery sync
          </h3>
          <p className="wk-body mt-2 max-w-prose">
            Auto-regulate daily training loads with biometric telemetry
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close watch sync modal"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-colors shrink-0"
            style={{
              background: 'var(--wk-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        )}
      </div>

      {/* Provider Selector Tabs */}
      <div className="wk-segments grid grid-cols-2 mt-4">
        {(['whoop', 'health_connect'] as const).map((prov) => {
          const isSelected = selectedProvider === prov;
          const shortLabels: Record<'whoop' | 'health_connect', string> = {
            whoop: 'Whoop',
            health_connect: 'Health Connect',
          };

          return (
            <button
              key={prov}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedProvider(prov);
                setImportStatus(null);
                setSyncProgress(null);
              }}
              className={`wk-segment text-center ${isSelected ? 'is-active' : ''}`}
            >
              <span className="truncate">{shortLabels[prov]}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Provider Summary */}
      <div className="mt-5 flex items-end justify-between gap-2">
        <span className="wk-subhead leading-tight">
          {providerMeta.name}
        </span>
        {isCurrentActive ? (
          <span className="wk-pill shrink-0">Active tracker</span>
        ) : isProviderConnected ? (
          <button
            type="button"
            onClick={handleSetActiveTracker}
            className="wk-btn-secondary shrink-0 min-h-[44px]"
          >
            Set as active
          </button>
        ) : selectedProvider === 'health_connect' && hcWorkoutsOn ? (
          <span className="wk-pill shrink-0">Workouts on</span>
        ) : (
          <span className="wk-pill shrink-0">Not connected</span>
        )}
      </div>

      <div className="wk-bar mt-3">
        <div
          style={{
            width:
              isProviderConnected || (selectedProvider === 'health_connect' && hcWorkoutsOn)
                ? '100%'
                : '0%',
          }}
        />
      </div>

      {isProviderConnected ? (
        <div className="flex flex-col mt-4 pt-4 gap-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          {selectedProvider === 'whoop' && typeof latestBiometrics.recoveryScore === 'number' && (
            <div className="flex items-center justify-between gap-2">
              <span className="wk-meta-title">Whoop recovery score</span>
              <span className="wk-pill tabular-nums">{latestBiometrics.recoveryScore}%</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="wk-meta-title">Last night&apos;s HRV</span>
            <span className="wk-pill tabular-nums">{latestBiometrics.hrvRmssd > 0 ? `${latestBiometrics.hrvRmssd} ms` : '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="wk-meta-title">Resting heart rate</span>
            <span className="wk-pill tabular-nums">{latestBiometrics.restingHr > 0 ? `${latestBiometrics.restingHr} bpm` : '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="wk-meta-title">Sleep duration</span>
            <span className="wk-pill tabular-nums">{latestBiometrics.sleepHours > 0 ? `${latestBiometrics.sleepHours} hrs` : '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="wk-meta-title">Daily steps</span>
            <span className="wk-pill tabular-nums">{latestBiometrics.steps > 0 ? latestBiometrics.steps.toLocaleString() : '—'}</span>
          </div>
        </div>
      ) : (
        <p className="wk-body mt-4 max-w-prose">
          {selectedProvider === 'whoop' &&
            'Sync your overnight recovery score, HRV, resting heart rate, and sleep duration automatically to calibrate your daily training volume and RIR targets.'}
          {selectedProvider === 'health_connect' &&
            (hcBridgeAvailable
              ? 'Allow Health Connect below so sleep, heart rate, HRV, weight, body fat, workouts, and daily steps from Google Pixel Watch, Fitbit, Samsung Health, Garmin and Wear OS sync automatically.'
              : "In the Treise app from Google Play, Android Health Connect syncs sleep, heart rate, HRV, weight, body fat, workouts, and daily steps from Pixel Watch, Fitbit, Samsung Health and Garmin automatically. You can also import an export file below.")}
        </p>
      )}

      {/* Sync Progress Bar */}
      {syncProgress && (
        <div className="mt-4">
          <div className="flex justify-between items-center gap-2">
            <span className="wk-meta-title">{syncProgress.message}</span>
            <span className="wk-pill tabular-nums">{syncProgress.percent}%</span>
          </div>
          <div className="wk-bar mt-2">
            <div style={{ width: `${syncProgress.percent}%` }} />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col mt-4 gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={handleFileImport}
          className="hidden"
          aria-label="Upload biometric data export"
        />

        {importStatus && <p className="wk-body max-w-prose">{importStatus}</p>}

        {selectedProvider === 'health_connect' ? (
          <>
            {hcBridgeAvailable && onSetHealthConnect && (
              <button
                type="button"
                onClick={handleToggleHealthConnectWorkouts}
                className={hcWorkoutsOn ? 'wk-btn-secondary w-full' : 'wk-button active:scale-[0.98] transition-transform'}
                style={
                  hcWorkoutsOn
                    ? undefined
                    : { background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }
                }
              >
                {hcWorkoutsOn
                  ? 'Turn off Health Connect workouts'
                  : hcStatus?.granted
                  ? 'Turn on Health Connect workouts'
                  : 'Allow access in Health Connect'}
              </button>
            )}
            <button
              type="button"
              onClick={handleHealthConnectSettings}
              className={hcBridgeAvailable ? 'wk-btn-secondary w-full' : 'wk-button active:scale-[0.98] transition-transform'}
              style={
                hcBridgeAvailable
                  ? undefined
                  : { background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }
              }
            >
              Import health data file (.json / .csv)
            </button>
            {isProviderConnected && (
              <button
                type="button"
                onClick={handleDisconnectProvider}
                className="wk-btn-secondary w-full"
                style={{ color: 'var(--color-status-danger)' }}
              >
                Disconnect {providerMeta.name}
              </button>
            )}
          </>
        ) : isProviderConnected ? (
          <>
            {!isCurrentActive && (
              <button
                type="button"
                onClick={handleSetActiveTracker}
                className="wk-button active:scale-[0.98] transition-transform"
                style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
              >
                Use {providerMeta.name} as active tracker
              </button>
            )}

            {profile.whoopAccessToken && (
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => (whoopReconnectNeeded ? handleConnectProvider() : handleStartSync())}
                className="wk-button active:scale-[0.98] transition-transform"
                style={{
                  background: isSyncing ? 'var(--color-action-disabled-bg)' : 'var(--color-action-primary-bg)',
                  color: isSyncing ? 'var(--color-action-disabled-fg)' : 'var(--color-action-primary-fg)',
                }}
              >
                {whoopReconnectNeeded ? 'Reconnect Whoop' : `Sync ${providerMeta.name} now`}
              </button>
            )}

            <button
              type="button"
              onClick={handleHealthConnectSettings}
              className="wk-btn-secondary w-full"
            >
              Import Whoop CSV file
            </button>

            <button
              type="button"
              onClick={handleDisconnectProvider}
              className="wk-btn-secondary w-full justify-center min-h-[48px]"
              style={{ color: 'var(--color-status-danger)' }}
            >
              Disconnect {providerMeta.name}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleConnectProvider}
              className="wk-button active:scale-[0.98] transition-transform"
              style={{
                background: isSyncing ? 'var(--color-action-disabled-bg)' : 'var(--color-action-primary-bg)',
                color: isSyncing ? 'var(--color-action-disabled-fg)' : 'var(--color-action-primary-fg)',
              }}
            >
              {isSyncing ? `Connecting to ${providerMeta.name}...` : `Connect ${providerMeta.name}`}
            </button>
            <button
              type="button"
              onClick={handleHealthConnectSettings}
              className="wk-btn-secondary w-full"
            >
              Import Whoop CSV file
            </button>
          </>
        )}
      </div>

      <p className="wk-caption mt-4 max-w-prose">
        Treise fetches your wearable data through its own server, which doesn&apos;t store it. Your history stays on this phone.
      </p>
    </div>
  );

  if (isModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Wearable and recovery sync"
        className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
        style={{ background: 'var(--color-bg-scrim)' }}
      >
        <div className="w-full max-w-md">{content}</div>
      </div>
    );
  }

  return content;
};

