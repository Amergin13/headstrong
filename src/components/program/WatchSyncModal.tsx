import React, { useState, useRef, useEffect } from 'react';
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
import {
  FitbitServerConfig,
  getFitbitConfig,
  initiateFitbitOAuth,
  parseFitbitExport,
} from '../../services/fitbitService';
import {
  initiateWhoopOAuth,
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

const fig = (px: number) => `calc(${px} * var(--f))`;

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
  const currentActiveProvider = getActiveWearableProvider(profile) || 'fitbit';
  const [selectedProvider, setSelectedProvider] = useState<WearableProvider>(currentActiveProvider);
  const [syncProgress, setSyncProgress] = useState<WearableSyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [fitbitConfig, setFitbitConfig] = useState<FitbitServerConfig | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getFitbitConfig().then((cfg) => {
      if (active) setFitbitConfig(cfg);
    });
    return () => {
      active = false;
    };
  }, []);

  const providerMeta = WEARABLE_PROVIDERS[selectedProvider];
  const hcBridgeAvailable = Boolean(hcStatus?.bridge && hcStatus?.available);
  const hcWorkoutsOn = Boolean(profile.healthConnectActivities && hcStatus?.granted);

  const isProviderConnected =
    selectedProvider === 'fitbit'
      ? Boolean(profile.fitbitConnected)
      : selectedProvider === 'whoop'
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
        setImportStatus('Health Connect is on. Pixel Watch and Fitbit workouts will count as active days.');
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
      const accessToken =
        selectedProvider === 'fitbit'
          ? profile.fitbitAccessToken
          : selectedProvider === 'whoop'
          ? profile.whoopAccessToken
          : undefined;

      const refreshToken =
        selectedProvider === 'whoop'
          ? profile.whoopRefreshToken
          : selectedProvider === 'fitbit'
          ? profile.fitbitRefreshToken
          : undefined;

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

    if (selectedProvider === 'fitbit') {
      try {
        const cfg = fitbitConfig ?? (await getFitbitConfig());
        setFitbitConfig(cfg);

        if (cfg.configured && cfg.clientId) {
          setSyncProgress({
            stage: 'connecting',
            percent: 25,
            message: 'Connecting to Pixel Watch / Fitbit...',
            provider: 'fitbit',
          });
          const url = await initiateFitbitOAuth(cfg.clientId, cfg.redirectUri);
          if (typeof window !== 'undefined') {
            window.location.href = url;
          }
          return;
        }

        // In the Android app, Pixel Watch and Fitbit sync on-device through Health Connect.
        if (hcBridgeAvailable && onSetHealthConnect) {
          onSetHealthConnect(true);
          const opened = !hcStatus?.granted && onRequestHealthConnectPermission ? onRequestHealthConnectPermission() : true;
          setSyncProgress(null);
          setImportStatus(
            opened === false
              ? UPDATE_APP_FOR_PERMISSION
              : hcStatus?.granted
              ? 'Health Connect is on. Your Pixel Watch and Fitbit workouts count as active days automatically.'
              : 'Allow Treise in Health Connect so your Pixel Watch and Fitbit workouts sync automatically.'
          );
          setIsSyncing(false);
          return;
        }

        // Otherwise open the Fitbit / Health Connect file import
        setSyncProgress(null);
        setIsSyncing(false);
        fileInputRef.current?.click();
      } catch (err) {
        console.error('Failed to initiate Fitbit OAuth:', err);
        setSyncProgress({
          stage: 'error',
          percent: 0,
          message: 'Could not connect to Fitbit. Please try again.',
          provider: 'fitbit',
        });
        setIsSyncing(false);
      }
      return;
    }

    if (selectedProvider === 'health_connect') {
      handleHealthConnectSettings();
      setIsSyncing(false);
      return;
    }
  };

  const handleDisconnectProvider = () => {
    triggerHaptic('light');
    if (onUpdateProfile) {
      const updates = disconnectWearable(selectedProvider, profile);
      onUpdateProfile(updates);
    }
    if ((selectedProvider === 'health_connect' || selectedProvider === 'fitbit') && hcWorkoutsOn && onSetHealthConnect) {
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

        if (selectedProvider === 'fitbit') {
          const parsed = parseFitbitExport(text);
          if (parsed.length > 0) {
            const latest = parsed[parsed.length - 1];
            // A file is a one-off: it doesn't connect Fitbit. Only the latest day is saved.
            onSyncCompleted(latest, 'fitbit');
            setImportStatus(`Saved your latest day from this file (${latest.date}).`);
            triggerHaptic('success');
            return;
          }
        }

        const parsed = parseHealthConnectExport(text);
        if (parsed.length > 0) {
          const latest = parsed[parsed.length - 1];
          const targetProvider: WearableProvider = selectedProvider === 'fitbit' ? 'fitbit' : 'health_connect';
          onSyncCompleted(latest, targetProvider);
          if (onUpdateProfile) {
            if (targetProvider === 'health_connect') {
              onUpdateProfile({
                ...setActiveTracker('health_connect', profile),
                healthConnectConnected: true,
                healthConnectLastSync: new Date().toISOString(),
              });
            }
          }
          setImportStatus(`Saved your latest day from this file (${latest.date}).`);
          triggerHaptic('success');
        } else {
          setImportStatus('No biometric records found in file.');
        }
      } catch {
        setImportStatus('Failed to read file. Please ensure it is a valid Fitbit, Whoop CSV, or Health Connect JSON export.');
      }
    };
    reader.readAsText(file);
  };

  const content = (
    <div className="wk-card w-full text-left block shadow-xl">
      {/* Header & Close */}
      <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
        <div>
          <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
            Wearable &amp; Recovery Sync
          </h3>
          <p
            style={{
              fontSize: fig(28),
              lineHeight: 1.21,
              color: 'var(--wk-muted)',
              marginTop: fig(16),
            }}
          >
            Auto-regulate daily training loads with biometric telemetry
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close watch sync modal"
            className="w-11 h-11 min-h-[44px] rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
            style={{ background: 'var(--wk-raised)' }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        )}
      </div>

      {/* Provider Selector Tabs */}
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
        {(['fitbit', 'whoop', 'health_connect'] as const).map((prov) => {
          const isSelected = selectedProvider === prov;
          const shortLabels: Record<WearableProvider, string> = {
            fitbit: 'Pixel / Fitbit',
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
              className="h-full flex items-center justify-center font-bold uppercase transition-colors px-1 min-h-[44px]"
              style={{
                borderRadius: fig(16),
                fontSize: `max(12px, ${fig(22)})`,
                letterSpacing: '0.02em',
                background: isSelected ? 'var(--wk-pill)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--wk-muted)',
              }}
            >
              <span className="truncate">{shortLabels[prov]}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Provider Summary */}
      <div
        className="flex items-end justify-between"
        style={{ marginTop: fig(44), gap: fig(20) }}
      >
        <span className="wk-label" style={{ lineHeight: 1.21 }}>
          {providerMeta.name}
        </span>
        {isCurrentActive ? (
          <span className="wk-pill shrink-0">ACTIVE TRACKER</span>
        ) : isProviderConnected ? (
          <button
            type="button"
            onClick={handleSetActiveTracker}
            className="wk-pill shrink-0 min-h-[44px]"
          >
            Set as Active
          </button>
        ) : (selectedProvider === 'fitbit' || selectedProvider === 'health_connect') && hcWorkoutsOn ? (
          <span className="wk-pill shrink-0">WORKOUTS ON</span>
        ) : (
          <span className="wk-pill shrink-0">NOT CONNECTED</span>
        )}
      </div>

      <div className="wk-bar" style={{ marginTop: fig(24) }}>
        <div
          style={{
            width:
              isProviderConnected || ((selectedProvider === 'fitbit' || selectedProvider === 'health_connect') && hcWorkoutsOn)
                ? '100%'
                : '0%',
          }}
        />
      </div>

      {isProviderConnected ? (
        <div
          className="flex flex-col"
          style={{
            marginTop: fig(28),
            paddingTop: fig(24),
            borderTop: '1px solid rgba(255,255,255,0.08)',
            gap: fig(18),
          }}
        >
          {selectedProvider === 'whoop' && typeof latestBiometrics.recoveryScore === 'number' && (
            <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
              <span className="wk-label">Whoop Recovery Score</span>
              <span className="wk-pill">{latestBiometrics.recoveryScore}%</span>
            </div>
          )}
          {selectedProvider === 'fitbit' &&
            (typeof latestBiometrics.fitbitReadinessScore === 'number' ||
              typeof latestBiometrics.readinessScore === 'number') && (
              <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
                <span className="wk-label">Daily Readiness</span>
                <span className="wk-pill">
                  {latestBiometrics.fitbitReadinessScore ?? latestBiometrics.readinessScore}
                </span>
              </div>
            )}
          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="wk-label">Last Night&apos;s HRV</span>
            <span className="wk-pill">{latestBiometrics.hrvRmssd > 0 ? `${latestBiometrics.hrvRmssd} ms` : '—'}</span>
          </div>
          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="wk-label">Resting Heart Rate</span>
            <span className="wk-pill">{latestBiometrics.restingHr > 0 ? `${latestBiometrics.restingHr} bpm` : '—'}</span>
          </div>
          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="wk-label">Sleep Duration</span>
            <span className="wk-pill">{latestBiometrics.sleepHours > 0 ? `${latestBiometrics.sleepHours} hrs` : '—'}</span>
          </div>
          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="wk-label">Daily Steps</span>
            <span className="wk-pill">{latestBiometrics.steps > 0 ? latestBiometrics.steps.toLocaleString() : '—'}</span>
          </div>
        </div>
      ) : (
        <p className="wk-body" style={{ marginTop: fig(24) }}>
          {selectedProvider === 'whoop' &&
            'Sync your overnight recovery score, HRV, resting heart rate, and sleep duration automatically to calibrate your daily training volume and RIR targets.'}
          {selectedProvider === 'fitbit' &&
            (fitbitConfig?.configured
              ? 'Sync your daily readiness score, resting heart rate, and sleep staging directly from your Google Pixel Watch or Fitbit tracker.'
              : hcBridgeAvailable
              ? 'On Android, the Fitbit app and Pixel Watch sync workouts through Health Connect on this phone. Turn on Health Connect below so your rides, runs and walks count as active days, or import a Fitbit / Health Connect file for recovery data.'
              : 'Sync your Pixel Watch or Fitbit workouts automatically in the Treise Android app through Health Connect, or import a Fitbit / Health Connect export file below.')}
          {selectedProvider === 'health_connect' &&
            (hcBridgeAvailable
              ? 'Allow Health Connect below so workouts from Fitbit, Pixel Watch, Samsung Health and Garmin count as active days automatically. You can also import a JSON export file for recovery metrics.'
              : "In the Treise app from Google Play, Health Connect workouts count as active days (turn it on in Activity apps). Recovery data from Health Connect isn't read yet; if you have a JSON export of it, import it here.")}
        </p>
      )}

      {/* Sync Progress Bar */}
      {syncProgress && (
        <div style={{ marginTop: fig(24) }}>
          <div className="flex justify-between items-center">
            <span className="wk-label">{syncProgress.message}</span>
            <span className="wk-pill">{syncProgress.percent}%</span>
          </div>
          <div className="wk-bar" style={{ marginTop: fig(16) }}>
            <div style={{ width: `${syncProgress.percent}%` }} />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col" style={{ marginTop: fig(28), gap: fig(16) }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={handleFileImport}
          className="hidden"
          aria-label="Upload biometric data export"
        />

        {importStatus && <p className="wk-body">{importStatus}</p>}

        {selectedProvider === 'health_connect' ? (
          <>
            {hcBridgeAvailable && onSetHealthConnect && (
              <button
                type="button"
                onClick={handleToggleHealthConnectWorkouts}
                className="wk-button min-h-[44px]"
                style={{
                  background: hcWorkoutsOn ? 'var(--wk-raised)' : 'var(--wk-accent)',
                  color: hcWorkoutsOn ? '#fff' : '#13181C',
                }}
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
              className="wk-button min-h-[44px]"
              style={{
                background: hcBridgeAvailable ? 'var(--wk-raised)' : 'var(--wk-accent)',
                color: hcBridgeAvailable ? '#fff' : '#13181C',
              }}
            >
              Import health data file (JSON)
            </button>
          </>
        ) : isProviderConnected ? (
          <>
            {!isCurrentActive && (
              <button
                type="button"
                onClick={handleSetActiveTracker}
                className="wk-button min-h-[44px]"
                style={{ background: 'var(--wk-accent)', color: '#13181C' }}
              >
                Use {providerMeta.name} as Active Tracker
              </button>
            )}

            {((selectedProvider === 'whoop' && profile.whoopAccessToken) ||
              (selectedProvider === 'fitbit' && profile.fitbitAccessToken)) && (
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => handleStartSync()}
                className="wk-button min-h-[44px] disabled:opacity-50"
                style={{ background: 'var(--wk-accent)', color: '#13181C' }}
              >
                Sync {providerMeta.name} Now
              </button>
            )}

            {selectedProvider === 'fitbit' && hcBridgeAvailable && onSetHealthConnect && (
              <button
                type="button"
                onClick={handleToggleHealthConnectWorkouts}
                className="wk-button min-h-[44px]"
                style={{ background: 'var(--wk-raised)', color: '#fff' }}
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
              className="wk-button min-h-[44px]"
              style={{ background: 'var(--wk-raised)', color: '#fff' }}
            >
              Import {selectedProvider === 'whoop' ? 'Whoop CSV' : 'Fitbit / Health Connect'} file
            </button>

            <button
              type="button"
              onClick={handleDisconnectProvider}
              className="wk-button min-h-[44px]"
              style={{ background: 'var(--wk-raised)', color: '#FF3B4E' }}
            >
              Disconnect {providerMeta.name}
            </button>
          </>
        ) : selectedProvider === 'fitbit' && fitbitConfig && !fitbitConfig.configured ? (
          <>
            {hcBridgeAvailable && onSetHealthConnect && (
              <button
                type="button"
                onClick={handleToggleHealthConnectWorkouts}
                className="wk-button min-h-[44px]"
                style={{
                  background: hcWorkoutsOn ? 'var(--wk-raised)' : 'var(--wk-accent)',
                  color: hcWorkoutsOn ? '#fff' : '#13181C',
                }}
              >
                {hcWorkoutsOn
                  ? 'Turn off Health Connect workouts'
                  : hcStatus?.granted
                  ? 'Turn on Health Connect workouts'
                  : 'Connect Pixel Watch / Fitbit via Health Connect'}
              </button>
            )}
            <button
              type="button"
              onClick={handleHealthConnectSettings}
              className="wk-button min-h-[44px]"
              style={{
                background: hcBridgeAvailable ? 'var(--wk-raised)' : 'var(--wk-accent)',
                color: hcBridgeAvailable ? '#fff' : '#13181C',
              }}
            >
              Import Fitbit or Health Connect file (.json / .csv)
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleConnectProvider}
              className="wk-button min-h-[44px] disabled:opacity-50"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              {isSyncing ? `Connecting to ${providerMeta.name}...` : `Connect ${providerMeta.name}`}
            </button>
            <button
              type="button"
              onClick={handleHealthConnectSettings}
              className="wk-button min-h-[44px]"
              style={{ background: 'var(--wk-raised)', color: '#fff' }}
            >
              Import {selectedProvider === 'whoop' ? 'Whoop CSV' : 'Fitbit / Health Connect'} file
            </button>
          </>
        )}
      </div>

      <p className="wk-caption" style={{ marginTop: fig(24) }}>
        Treise fetches your wearable data through its own server, which doesn&apos;t store it. Your history stays on this phone.
      </p>
    </div>
  );

  if (isModal) {
    return (
      <div className="wk fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md">{content}</div>
      </div>
    );
  }

  return content;
};
