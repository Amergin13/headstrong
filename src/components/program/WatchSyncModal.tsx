import React, { useState } from 'react';
import {
  BiometricLog,
  ReadinessState,
  UserProfile,
} from '../../engine/types';
import {
  WatchSyncProgress,
  initiateFitbitOAuth,
  simulatePixelWatchSync,
} from '../../services/fitbitService';
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
} from 'lucide-react';

interface WatchSyncModalProps {
  profile: UserProfile;
  latestBiometrics: BiometricLog;
  onSyncCompleted: (newLog: BiometricLog) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const WatchSyncModal: React.FC<WatchSyncModalProps> = ({
  latestBiometrics,
  onSyncCompleted,
  onClose,
  isModal = false,
}) => {
  const [syncProgress, setSyncProgress] = useState<WatchSyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdvancedOAuth, setShowAdvancedOAuth] = useState(false);
  const [clientId, setClientId] = useState('23QW89');
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  const handleStartDemoSync = async (stateOverride: ReadinessState) => {
    setIsSyncing(true);
    setSyncProgress({
      stage: 'connecting',
      percent: 15,
      message: 'Connecting to Google Pixel Watch...',
    });

    try {
      const result = await simulatePixelWatchSync(
        (prog) => setSyncProgress(prog),
        stateOverride
      );
      onSyncCompleted(result);
    } catch (e) {
      setSyncProgress({
        stage: 'error',
        percent: 0,
        message: 'Could not sync with watch.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateOauth = async () => {
    const url = await initiateFitbitOAuth(clientId);
    setOauthUrl(url);
  };

  const content = (
    <div className="rounded-3xl bg-[#0E1219] p-5 sm:p-6 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-primary/15 flex items-center justify-center text-brand-primary">
            <Watch className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white tracking-tight">
              Google Pixel Watch
            </h3>
            <p className="text-xs text-slate-400">
              Syncs sleep, heart rate &amp; daily steps
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close watch sync modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        )}
      </div>

      {/* Device Status */}
      <div className="p-4 rounded-2xl bg-[#090C12] text-xs space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Status</span>
          <span className="flex items-center space-x-1.5 text-brand-primary font-semibold">
            <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
            <span>Connected</span>
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Watch Battery</span>
          <span className="font-mono text-slate-200 font-semibold">86%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Last Night&apos;s Recovery</span>
          <span className="font-mono text-white font-semibold">
            HRV {latestBiometrics.hrvRmssd} ms • Resting HR {latestBiometrics.restingHr} bpm
          </span>
        </div>
      </div>

      {/* Recovery Intelligence Card */}
      <div className="p-4 rounded-2xl bg-[#090C12] text-xs space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 flex items-center gap-1.5 font-medium">
            <Cpu className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
            Recovery Intelligence
          </span>
          <span className="font-semibold text-emerald-400 flex items-center gap-1">
            <Zap className="w-3 h-3 stroke-[2]" />
            Private &amp; Instant
          </span>
        </div>
        <p className="text-slate-300 leading-relaxed">
          Watch biometrics and sleep logs are evaluated instantly on your phone with complete privacy to calibrate your daily training readiness.
        </p>
      </div>

      {/* Live Sync Progress Bar */}
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
          Sync &amp; Preview Recovery Mode
        </span>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => handleStartDemoSync('Primed')}
            className="py-3 px-2 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-brand-primary flex flex-col items-center justify-center transition-all disabled:opacity-50 min-h-[44px]"
          >
            <Zap className="w-4 h-4 mb-1 stroke-[2]" />
            <span>Primed (+15%)</span>
          </button>

          <button
            type="button"
            disabled={isSyncing}
            onClick={() => handleStartDemoSync('Normal')}
            className="py-3 px-2 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-white flex flex-col items-center justify-center transition-all disabled:opacity-50 min-h-[44px]"
          >
            <Activity className="w-4 h-4 mb-1 stroke-[2]" />
            <span>Normal</span>
          </button>

          <button
            type="button"
            disabled={isSyncing}
            onClick={() => handleStartDemoSync('Amber Shield')}
            className="py-3 px-2 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-amber-400 flex flex-col items-center justify-center transition-all disabled:opacity-50 min-h-[44px]"
          >
            <ShieldAlert className="w-4 h-4 mb-1 stroke-[2]" />
            <span>Recovery Mode</span>
          </button>
        </div>
      </div>

      {/* Expandable Fitbit Account Link */}
      <div className="pt-2 border-t border-white/[0.04]">
        <button
          type="button"
          onClick={() => setShowAdvancedOAuth(!showAdvancedOAuth)}
          aria-expanded={showAdvancedOAuth}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white py-1"
        >
          <span className="font-semibold">Connect Live Fitbit Account</span>
          {showAdvancedOAuth ? (
            <ChevronUp className="w-4 h-4 stroke-[2]" />
          ) : (
            <ChevronDown className="w-4 h-4 stroke-[2]" />
          )}
        </button>

        {showAdvancedOAuth && (
          <div className="mt-2 space-y-2">
            <div className="flex space-x-2">
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Fitbit App ID"
                aria-label="Fitbit App ID"
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#090C12] text-white font-mono text-xs focus:ring-1 focus:ring-brand-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={handleGenerateOauth}
                className="px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <span>Connect</span>
                <ExternalLink className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            </div>

            {oauthUrl && (
              <div className="p-3 rounded-xl bg-[#090C12] text-xs break-all text-slate-300">
                <span className="text-brand-primary font-semibold block mb-0.5">
                  Fitbit Sign-In Link:
                </span>
                <a
                  href={oauthUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline font-mono"
                >
                  Open Fitbit Authorization &rarr;
                </a>
              </div>
            )}
          </div>
        )}
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
