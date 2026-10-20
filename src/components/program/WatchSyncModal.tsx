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
import {
  initiateFitbitOAuth,
} from '../../services/fitbitService';
import {
  initiateWhoopOAuth,
  getWhoopRedirectUri,
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
  Zap,
  Activity,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  Upload,
  CheckCircle2,
  Unlink,
  Copy,
  Check,
  Info,
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
  const [showAdvancedOAuth, setShowAdvancedOAuth] = useState(false);
  const [clientId, setClientId] = useState(
    currentActiveProvider === 'whoop' ? profile.whoopClientId || '' : ''
  );
  const [clientSecret, setClientSecret] = useState(profile.whoopClientSecret || '');
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const providerMeta = WEARABLE_PROVIDERS[selectedProvider];

  const isProviderConnected =
    selectedProvider === 'fitbit'
      ? profile.fitbitConnected
      : selectedProvider === 'whoop'
      ? profile.whoopConnected
      : profile.healthConnectConnected;

  const handleStartSync = async (stateOverride?: ReadinessState) => {
    setIsSyncing(true);
    triggerHaptic('medium');
    setSyncProgress({
      stage: 'connecting',
      percent: 15,
      message: `Connecting to ${providerMeta.name}...`,
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
        message: `Could not sync data from ${providerMeta.name}.`,
        provider: selectedProvider,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnectProvider = () => {
    triggerHaptic('light');
    if (onUpdateProfile) {
      if (selectedProvider === 'fitbit') {
        onUpdateProfile({ fitbitConnected: true, wearableSource: 'fitbit' });
      } else if (selectedProvider === 'whoop') {
        onUpdateProfile({ whoopConnected: true, wearableSource: 'whoop' });
      } else if (selectedProvider === 'health_connect') {
        onUpdateProfile({
          healthConnectConnected: true,
          wearableSource: 'health_connect',
          healthConnectLastSync: new Date().toISOString(),
        });
      }
    }
    // Also trigger initial sync
    handleStartSync('Normal');
  };

  const handleDisconnectProvider = () => {
    triggerHaptic('light');
    if (onUpdateProfile) {
      const updates = disconnectWearable(selectedProvider, profile);
      onUpdateProfile(updates);
    }
  };

  const handleCopyRedirectUri = async () => {
    triggerHaptic('light');
    const uri = getWhoopRedirectUri();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(uri);
        setCopiedRedirectUri(true);
        setTimeout(() => setCopiedRedirectUri(false), 2200);
      }
    } catch (e) {
      console.warn('Could not copy to clipboard:', e);
    }
  };

  const handleGenerateOauth = async () => {
    triggerHaptic('light');
    if (selectedProvider === 'fitbit') {
      const url = await initiateFitbitOAuth(clientId || undefined);
      setOauthUrl(url);
    } else if (selectedProvider === 'whoop') {
      if (onUpdateProfile) {
        onUpdateProfile({
          whoopClientId: clientId.trim() || undefined,
          whoopClientSecret: clientSecret.trim() || undefined,
        });
      }
      const url = await initiateWhoopOAuth(clientId.trim() || undefined);
      setOauthUrl(url);
      if (typeof window !== 'undefined') {
        window.open(url, '_blank');
      }
    }
  };

  const handleHealthConnectSettings = () => {
    triggerHaptic('light');
    const result = openHealthConnectSettings();
    if (!result.launched) {
      setImportStatus('Health Connect is available on Android 14+ devices. You can also import data files below.');
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseHealthConnectExport(text);
        if (parsed.length > 0) {
          const latest = parsed[parsed.length - 1];
          onSyncCompleted(latest, 'health_connect');
          setImportStatus(`Successfully imported ${parsed.length} Health Connect records!`);
          triggerHaptic('success');
        } else {
          setImportStatus('No valid biometric records found in file.');
        }
      } catch {
        setImportStatus('Failed to parse file. Please upload valid JSON.');
      }
    };
    reader.readAsText(file);
  };

  const content = (
    <div className="rounded-3xl bg-[#0E1219] p-5 sm:p-6 space-y-4 shadow-xl">
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
              Drive daily training intensity and recovery scores
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
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#090C12]">
        {(['fitbit', 'whoop', 'health_connect'] as const).map((prov) => {
          const meta = WEARABLE_PROVIDERS[prov];
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
                setOauthUrl(null);
                setImportStatus(null);
                if (prov === 'whoop') {
                  setClientId(profile.whoopClientId || '');
                  setClientSecret(profile.whoopClientSecret || '');
                } else {
                  setClientId('');
                  setClientSecret('');
                }
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
      <div className="p-4 rounded-2xl bg-[#090C12] text-xs space-y-2.5">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-bold text-white text-sm">{providerMeta.name}</div>
            <div className="text-slate-400 text-xs">{providerMeta.hardwareFocus}</div>
          </div>
          {isProviderConnected ? (
            <span className="flex items-center space-x-1.5 text-emerald-400 font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Connected</span>
            </span>
          ) : (
            <span className="text-slate-400 px-2.5 py-1 rounded-full bg-white/[0.04]">
              Not Connected
            </span>
          )}
        </div>

        <div className="pt-2 border-t border-white/[0.04] grid grid-cols-2 gap-2">
          <div>
            <span className="text-slate-400 block">Last Night&apos;s HRV</span>
            <span className="font-mono text-white font-semibold">
              {latestBiometrics.hrvRmssd} ms
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Resting Heart Rate</span>
            <span className="font-mono text-white font-semibold">
              {latestBiometrics.restingHr} bpm
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Sleep Duration</span>
            <span className="font-mono text-white font-semibold">
              {latestBiometrics.sleepHours} hrs
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Daily Steps</span>
            <span className="font-mono text-white font-semibold">
              {latestBiometrics.steps.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      {isProviderConnected ? (
        <button
          type="button"
          disabled={isSyncing}
          onClick={() => handleStartSync()}
          className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-white/5 active:scale-95 transition-all min-h-[44px] disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 stroke-[2.2] text-slate-950 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Sync {providerMeta.name} Now</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConnectProvider}
          className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-white/5 active:scale-95 transition-all min-h-[44px]"
        >
          <CheckCircle2 className="w-4 h-4 stroke-[2.2] text-emerald-600" />
          <span>Connect {providerMeta.name}</span>
        </button>
      )}

      {/* Sync Progress Bar */}
      {syncProgress && (
        <div className="p-4 rounded-2xl bg-[#090C12] text-xs space-y-2">
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

      {/* Preview Recovery Modes */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-300 block">
          Test Recovery Telemetry
        </span>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => handleStartSync('Primed')}
            className="py-3 px-2 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-brand-primary flex flex-col items-center justify-center transition-all disabled:opacity-50 min-h-[44px]"
          >
            <Zap className="w-4 h-4 mb-1 stroke-[2]" />
            <span>Primed (+15%)</span>
          </button>

          <button
            type="button"
            disabled={isSyncing}
            onClick={() => handleStartSync('Normal')}
            className="py-3 px-2 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-white flex flex-col items-center justify-center transition-all disabled:opacity-50 min-h-[44px]"
          >
            <Activity className="w-4 h-4 mb-1 stroke-[2]" />
            <span>Normal</span>
          </button>

          <button
            type="button"
            disabled={isSyncing}
            onClick={() => handleStartSync('Amber Shield')}
            className="py-3 px-2 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-amber-400 flex flex-col items-center justify-center transition-all disabled:opacity-50 min-h-[44px]"
          >
            <ShieldAlert className="w-4 h-4 mb-1 stroke-[2]" />
            <span>Recovery Mode</span>
          </button>
        </div>
      </div>

      {/* Provider Details & Configuration */}
      <div className="pt-2 border-t border-white/[0.04] space-y-2">
        {selectedProvider === 'health_connect' ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleHealthConnectSettings}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#141824] hover:bg-[#1C2233] text-xs font-semibold text-white flex items-center justify-center space-x-1.5 transition-colors min-h-[44px]"
              >
                <span>{isAndroidPlatform() ? 'Health Connect Settings' : 'Android App Details'}</span>
                <ExternalLink className="w-3.5 h-3.5 stroke-[2] text-cyan-400" />
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-3 rounded-xl bg-[#141824] hover:bg-[#1C2233] text-xs font-semibold text-white flex items-center justify-center space-x-1.5 transition-colors min-h-[44px]"
              >
                <Upload className="w-3.5 h-3.5 stroke-[2] text-cyan-400" />
                <span>Import JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleFileImport}
                className="hidden"
                aria-label="Upload Health Connect JSON export"
              />
            </div>
            {importStatus && (
              <p className="text-xs text-slate-300 p-2.5 rounded-xl bg-[#090C12]">
                {importStatus}
              </p>
            )}
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedOAuth(!showAdvancedOAuth)}
              aria-expanded={showAdvancedOAuth}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white py-1"
            >
              <span className="font-semibold">
                Connect Live {selectedProvider === 'fitbit' ? 'Fitbit' : 'Whoop'} API
              </span>
              {showAdvancedOAuth ? (
                <ChevronUp className="w-4 h-4 stroke-[2]" />
              ) : (
                <ChevronDown className="w-4 h-4 stroke-[2]" />
              )}
            </button>

            {showAdvancedOAuth && (
              <div className="mt-2 space-y-2.5">
                {selectedProvider === 'whoop' ? (
                  <div className="p-3 rounded-xl bg-[#090C12] border border-white/[0.04] space-y-2 text-xs">
                    <div className="flex items-start space-x-2 text-slate-300">
                      <Info className="w-4 h-4 text-brand-primary shrink-0 mt-0.5 stroke-[2]" />
                      <div className="space-y-1">
                        <span className="font-semibold text-white block">
                          WHOOP Developer Portal Setup
                        </span>
                        <p className="text-slate-400 text-xs leading-relaxed">
                          <strong className="text-white">Webhooks are optional:</strong> You do{' '}
                          <em>not</em> need a webhook to connect WHOOP. Leave the Webhooks section
                          blank in the WHOOP portal and tap{' '}
                          <span className="text-emerald-400 font-medium">[CREATE APP]</span>.
                        </p>
                      </div>
                    </div>

                    {/* Redirect URI Row */}
                    <div className="pt-2 border-t border-white/[0.04] space-y-1">
                      <span className="text-slate-400 block font-medium">Redirect URI:</span>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="text"
                          readOnly
                          value={getWhoopRedirectUri()}
                          aria-label="WHOOP Redirect URI"
                          className="flex-1 py-2 px-2.5 rounded-lg bg-black/40 text-slate-300 font-mono text-xs border border-white/[0.04] select-all focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCopyRedirectUri}
                          className="px-2.5 py-2 min-h-[38px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center space-x-1 transition-colors"
                          title="Copy Redirect URI to clipboard"
                        >
                          {copiedRedirectUri ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.2]" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 stroke-[2]" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Client Credentials Inputs */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-slate-400 block font-medium">WHOOP Client ID:</span>
                      <input
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Paste your WHOOP Client ID"
                        aria-label="WHOOP Client ID"
                        className="w-full py-2.5 px-3 rounded-xl bg-black/40 text-white font-mono text-xs border border-white/[0.04] focus:ring-1 focus:ring-brand-primary focus:outline-none"
                      />

                      <span className="text-slate-400 block font-medium pt-1">
                        WHOOP Client Secret (Optional):
                      </span>
                      <input
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Paste Client Secret if provided"
                        aria-label="WHOOP Client Secret"
                        className="w-full py-2.5 px-3 rounded-xl bg-black/40 text-white font-mono text-xs border border-white/[0.04] focus:ring-1 focus:ring-brand-primary focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateOauth}
                      className="w-full py-2.5 min-h-[44px] rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-sm"
                    >
                      <span>Authorize WHOOP 4.0</span>
                      <ExternalLink className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>
                ) : (
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Fitbit Client ID"
                      aria-label="Fitbit Client ID"
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#090C12] text-white font-mono text-xs focus:ring-1 focus:ring-brand-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateOauth}
                      className="px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                    >
                      <span>Authorize</span>
                      <ExternalLink className="w-3.5 h-3.5 stroke-[2]" />
                    </button>
                  </div>
                )}

                {oauthUrl && (
                  <div className="p-3 rounded-xl bg-[#090C12] text-xs break-all text-slate-300">
                    <span className="text-brand-primary font-semibold block mb-0.5">
                      Authorization Link:
                    </span>
                    <a
                      href={oauthUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 underline font-mono flex items-center space-x-1"
                    >
                      <span>Open {selectedProvider === 'fitbit' ? 'Fitbit' : 'Whoop'} Authorization</span>
                      <ExternalLink className="w-3 h-3 stroke-[2]" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Disconnect Provider Action */}
        {isProviderConnected && (
          <button
            type="button"
            onClick={handleDisconnectProvider}
            className="w-full py-2.5 text-xs text-rose-400 hover:text-rose-300 flex items-center justify-center space-x-1.5 transition-colors"
          >
            <Unlink className="w-3.5 h-3.5 stroke-[2]" />
            <span>Disconnect {providerMeta.name}</span>
          </button>
        )}
      </div>

      {/* Privacy Guarantee */}
      <div className="p-3.5 rounded-2xl bg-[#090C12] text-xs text-slate-400 flex items-center space-x-2">
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
