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
import { initiateFitbitOAuth } from '../../services/fitbitService';
import {
  initiateWhoopOAuth,
  getWhoopRedirectUri,
  WHOOP_CONFIG,
  parseWhoopCsvExport,
} from '../../services/whoopService';
import {
  openHealthConnectSettings,
  parseHealthConnectExport,
  isAndroidPlatform,
} from '../../services/healthConnectService';
import { X } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WatchSyncModalProps {
  profile: UserProfile;
  latestBiometrics: BiometricLog;
  onSyncCompleted: (newLog: BiometricLog, provider: WearableProvider) => void;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const fig = (px: number) => `calc(${px} * var(--f))`;

export const WatchSyncModal: React.FC<WatchSyncModalProps> = ({
  profile,
  latestBiometrics,
  onSyncCompleted,
  onUpdateProfile,
  onClose,
  isModal = false,
}) => {
  const currentActiveProvider = getActiveWearableProvider(profile) || 'fitbit';
  const [selectedProvider, setSelectedProvider] = useState<WearableProvider>(currentActiveProvider);
  const [syncProgress, setSyncProgress] = useState<WearableSyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const providerMeta = WEARABLE_PROVIDERS[selectedProvider];

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
          message: 'Connecting to Whoop 4.0...',
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
        setSyncProgress({
          stage: 'connecting',
          percent: 25,
          message: 'Connecting to Pixel Watch / Fitbit...',
          provider: 'fitbit',
        });
        const url = await initiateFitbitOAuth();
        if (typeof window !== 'undefined') {
          window.location.href = url;
        }
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
    setSyncProgress(null);
  };

  const handleHealthConnectSettings = () => {
    triggerHaptic('light');
    const result = openHealthConnectSettings();
    if (!result.launched) {
      setImportStatus('Health Connect is available on Android 14+ devices. You can also import data files below.');
    } else {
      if (onUpdateProfile) {
        onUpdateProfile({
          ...setActiveTracker('health_connect', profile),
          healthConnectConnected: true,
          healthConnectLastSync: new Date().toISOString(),
        });
      }
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isWhoopCsv =
      selectedProvider === 'whoop' ||
      file.name.toLowerCase().endsWith('.csv') ||
      file.name.toLowerCase().includes('cycles') ||
      file.name.toLowerCase().includes('sleep');

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

        const parsed = parseHealthConnectExport(text);
        if (parsed.length > 0) {
          const latest = parsed[parsed.length - 1];
          onSyncCompleted(latest, 'health_connect');
          if (onUpdateProfile) {
            onUpdateProfile({
              ...setActiveTracker('health_connect', profile),
              healthConnectConnected: true,
              healthConnectLastSync: new Date().toISOString(),
            });
          }
          setImportStatus(`Imported ${parsed.length} biometric records from Health Connect.`);
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
            whoop: 'Whoop 4.0',
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
                fontSize: fig(22),
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
        ) : (
          <span className="wk-pill shrink-0">NOT CONNECTED</span>
        )}
      </div>

      <div className="wk-bar" style={{ marginTop: fig(24) }}>
        <div style={{ width: isProviderConnected ? '100%' : '0%' }} />
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
            <span className="wk-pill">{latestBiometrics.hrvRmssd} ms</span>
          </div>
          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="wk-label">Resting Heart Rate</span>
            <span className="wk-pill">{latestBiometrics.restingHr} bpm</span>
          </div>
          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="wk-label">Sleep Duration</span>
            <span className="wk-pill">{latestBiometrics.sleepHours} hrs</span>
          </div>
          <div className="flex items-center justify-between" style={{ gap: fig(16) }}>
            <span className="wk-label">Daily Steps</span>
            <span className="wk-pill">{latestBiometrics.steps.toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <p className="wk-body" style={{ marginTop: fig(24) }}>
          {selectedProvider === 'whoop' &&
            'Sync your overnight recovery score, HRV, resting heart rate, and sleep duration automatically to calibrate your daily training volume and RIR targets.'}
          {selectedProvider === 'fitbit' &&
            'Sync your daily readiness score, resting heart rate, and sleep staging directly from your Google Pixel Watch or Fitbit tracker.'}
          {selectedProvider === 'health_connect' &&
            'Sync unified biometric records directly from Android Health Connect on your phone.'}
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
            <button
              type="button"
              onClick={handleHealthConnectSettings}
              className="wk-button min-h-[44px]"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              {isAndroidPlatform() ? 'Open Health Connect Settings' : 'Connect Android Health'}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="wk-button min-h-[44px]"
              style={{ background: 'var(--wk-pill)', color: '#fff' }}
            >
              Import Health Export (JSON)
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

            <button
              type="button"
              disabled={isSyncing}
              onClick={() => handleStartSync()}
              className="wk-button min-h-[44px] disabled:opacity-50"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              Sync {providerMeta.name} Now
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
        ) : (
          <button
            type="button"
            disabled={isSyncing}
            onClick={handleConnectProvider}
            className="wk-button min-h-[44px] disabled:opacity-50"
            style={{ background: 'var(--wk-accent)', color: '#13181C' }}
          >
            {isSyncing ? `Connecting to ${providerMeta.name}...` : `Connect ${providerMeta.name}`}
          </button>
        )}
      </div>

      <p className="wk-caption" style={{ marginTop: fig(24) }}>
        Wearable metrics are evaluated locally on your phone.
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
