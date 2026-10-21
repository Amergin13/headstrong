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
import {
  Watch,
  X,
  ExternalLink,
  Cpu,
  RefreshCw,
  Upload,
  CheckCircle2,
  Unlink,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface WatchSyncModalProps {
  profile: UserProfile;
  latestBiometrics: BiometricLog;
  onSyncCompleted: (newLog: BiometricLog, provider: WearableProvider) => void;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onClose?: () => void;
  isModal?: boolean;
}

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

      const result = await syncWearableBiometrics(selectedProvider, {
        onProgress: (prog) => setSyncProgress(prog),
        forcedState: stateOverride,
        accessToken,
      });

      triggerHaptic('success');
      onSyncCompleted(result, selectedProvider);
    } catch {
      setSyncProgress({
        stage: 'error',
        percent: 0,
        message: `Could not sync data from ${providerMeta.name}. Please check your connection.`,
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
          healthConnectConnected: true,
          wearableSource: 'health_connect',
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
                whoopConnected: true,
                wearableSource: 'whoop',
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
              healthConnectConnected: true,
              wearableSource: 'health_connect',
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
    <div className="rounded-3xl bg-[#0E1219] p-5 sm:p-6 space-y-4 shadow-xl border border-white/[0.04]">
      {/* Header & Close */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-primary/15 flex items-center justify-center text-brand-primary">
            <Watch className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white tracking-tight">
              Wearable & Recovery Sync
            </h3>
            <p className="text-xs text-slate-400">
              Auto-regulate daily training loads with biometric telemetry
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close watch sync modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        )}
      </div>

      {/* Provider Selector Tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#090C12] border border-white/[0.04]">
        {(['fitbit', 'whoop', 'health_connect'] as const).map((prov) => {
          const isSelected = selectedProvider === prov;
          const isConnected =
            prov === 'fitbit'
              ? profile.fitbitConnected
              : prov === 'whoop'
              ? profile.whoopConnected
              : profile.healthConnectConnected;

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
              className={`py-2 px-1.5 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all min-h-[44px] ${
                isSelected
                  ? 'bg-white/[0.12] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="truncate">{shortLabels[prov]}</span>
              {isConnected && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Provider Card */}
      <div className="p-4 rounded-2xl bg-[#090C12] text-xs space-y-3 border border-white/[0.04]">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-bold text-white text-sm">{providerMeta.name}</div>
            <div className="text-slate-400 text-xs">{providerMeta.hardwareFocus}</div>
          </div>
          {isProviderConnected ? (
            <span className="flex items-center space-x-1.5 text-emerald-400 font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Connected & Active</span>
            </span>
          ) : (
            <span className="text-slate-400 text-xs px-2.5 py-1 rounded-full bg-white/[0.04]">
              Not Connected
            </span>
          )}
        </div>

        {/* Dynamic State: Connected Metrics vs Not-Connected Description */}
        {isProviderConnected ? (
          <div className="pt-2 border-t border-white/[0.04] space-y-2.5">
            {selectedProvider === 'whoop' && typeof latestBiometrics.recoveryScore === 'number' && (
              <div className="p-2.5 rounded-xl bg-black/30 flex items-center justify-between">
                <span className="text-slate-400 text-xs">Whoop Recovery Score</span>
                <span
                  className={`font-mono font-bold text-sm px-2 py-0.5 rounded-lg ${
                    latestBiometrics.recoveryScore >= 67
                      ? 'text-emerald-400 bg-emerald-500/15'
                      : latestBiometrics.recoveryScore >= 34
                      ? 'text-amber-400 bg-amber-500/15'
                      : 'text-rose-400 bg-rose-500/15'
                  }`}
                >
                  {latestBiometrics.recoveryScore}%
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-xl bg-black/30">
                <span className="text-slate-400 block text-xs">Last Night&apos;s HRV</span>
                <span className="font-mono text-white font-semibold text-sm">
                  {latestBiometrics.hrvRmssd} ms
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/30">
                <span className="text-slate-400 block text-xs">Resting Heart Rate</span>
                <span className="font-mono text-white font-semibold text-sm">
                  {latestBiometrics.restingHr} bpm
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/30">
                <span className="text-slate-400 block text-xs">Sleep Duration</span>
                <span className="font-mono text-white font-semibold text-sm">
                  {latestBiometrics.sleepHours} hrs
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/30">
                <span className="text-slate-400 block text-xs">Daily Steps</span>
                <span className="font-mono text-white font-semibold text-sm">
                  {latestBiometrics.steps.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-white/[0.04] space-y-2">
            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedProvider === 'whoop' &&
                'Sync your overnight recovery score, HRV, resting heart rate, and sleep duration automatically to calibrate your daily training volume and RIR targets.'}
              {selectedProvider === 'fitbit' &&
                'Sync your daily active zone minutes, resting heart rate, and sleep staging directly from your Google Pixel Watch or Fitbit tracker.'}
              {selectedProvider === 'health_connect' &&
                'Sync unified biometric records directly from Android Health Connect on your phone.'}
            </p>
            {selectedProvider === 'whoop' && (
              <p className="text-xs text-slate-400 bg-white/[0.02] p-2 rounded-xl border border-white/[0.04]">
                Note: If Whoop shows &ldquo;Request Header Or Cookie Too Large&rdquo;, clear cookies for whoop.com in your browser or connect using an Incognito tab.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sync Progress Bar */}
      {syncProgress && (
        <div className="p-3.5 rounded-2xl bg-[#090C12] text-xs space-y-2 border border-white/[0.04]">
          <div className="flex justify-between items-center">
            <span className="text-brand-primary font-medium">{syncProgress.message}</span>
            <span className="font-mono font-bold text-brand-primary">{syncProgress.percent}%</span>
          </div>
          <div className="w-full bg-white/[0.08] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-brand-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${syncProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={handleFileImport}
          className="hidden"
          aria-label="Upload biometric data export"
        />

        {importStatus && (
          <p className="text-xs text-slate-300 p-2.5 rounded-xl bg-[#090C12] border border-white/[0.04]">
            {importStatus}
          </p>
        )}

        {selectedProvider === 'health_connect' ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleHealthConnectSettings}
              className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-white/5 active:scale-95 transition-all min-h-[44px]"
            >
              <span>{isAndroidPlatform() ? 'Open Health Connect Settings' : 'Connect Android Health'}</span>
              <ExternalLink className="w-4 h-4 stroke-[2.2] text-slate-950" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 transition-colors min-h-[44px]"
            >
              <Upload className="w-3.5 h-3.5 stroke-[2] text-brand-primary" />
              <span>Import Health Export (JSON)</span>
            </button>
          </div>
        ) : isProviderConnected ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => handleStartSync()}
              className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-white/5 active:scale-95 transition-all min-h-[44px] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 stroke-[2.2] text-slate-950 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync {providerMeta.name} Now</span>
            </button>

            <button
              type="button"
              onClick={handleDisconnectProvider}
              className="w-full py-2.5 text-xs text-rose-400 hover:text-rose-300 flex items-center justify-center space-x-1.5 transition-colors min-h-[44px]"
            >
              <Unlink className="w-3.5 h-3.5 stroke-[2]" />
              <span>Disconnect {providerMeta.name}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleConnectProvider}
              className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-white/5 active:scale-95 transition-all min-h-[44px] disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 stroke-[2.2] text-slate-950 animate-spin" />
                  <span>Connecting to {providerMeta.name}...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 stroke-[2.2] text-emerald-600" />
                  <span>Connect {providerMeta.name}</span>
                </>
              )}
            </button>

            {selectedProvider === 'whoop' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const effectiveId = profile.whoopClientId || WHOOP_CONFIG.CLIENT_ID;
                    const effectiveUri = profile.whoopRedirectUri || getWhoopRedirectUri();
                    const url = await initiateWhoopOAuth(effectiveId, effectiveUri);
                    await navigator.clipboard.writeText(url);
                    setImportStatus('Copied Whoop sign-in link! You can paste it into an Incognito tab.');
                    setTimeout(() => setImportStatus(null), 5000);
                  } catch {
                    setImportStatus('Could not copy link to clipboard.');
                  }
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center space-x-1.5 transition-colors min-h-[44px]"
              >
                <span>Copy Sign-In Link (for Incognito tab)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Privacy Guarantee */}
      <div className="p-3.5 rounded-2xl bg-[#090C12] text-xs text-slate-400 flex items-center space-x-2 border border-white/[0.04]">
        <Cpu className="w-4 h-4 text-emerald-400 shrink-0 stroke-[2]" />
        <span>100% On-Device Privacy: Wearable metrics are evaluated locally on your phone.</span>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-sm">{content}</div>
      </div>
    );
  }

  return content;
};
