import React, { useEffect, useRef, useState } from 'react';
import {
  AuthUser,
  BiometricLog,
  ExerciseDefinition,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import {
  initializeGoogleSignIn,
  isGoogleClientConfigured,
  promptGoogleOneTap,
  renderGoogleSignInButton,
  signOutUser,
  isSupabaseConfigured,
  getSupabaseGoogleAuthUrl,
  GOOGLE_AUTH_CONFIG,
  markLinkSignInStarted,
} from '../../services/googleAuthService';
import { X } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { ProfileSettingsSections } from './ProfileSettingsSections';

interface GoogleAuthModalProps {
  currentUser: AuthUser | null;
  profile: UserProfile;
  latestBiometrics?: BiometricLog;
  workouts?: WorkoutSession[];
  exerciseCatalog?: ExerciseDefinition[];
  bodyweightKg?: number;
  canInstallPwa?: boolean;
  onTriggerInstallPwa?: () => void;
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onSignOut: () => void;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onOpenWatchSync?: () => void;
  onOpenActivityApps?: () => void;
  onResetData?: () => void;
  onExportData?: () => void;
  onImportData?: (rawJson: string) => void;
  onOpenCompetitorImport?: () => void;
  onViewPersonalBests?: () => void;
  onEnableDriveBackup?: (passphrase: string) => Promise<void>;
  onRunDriveBackupNow?: (passphrase?: string) => Promise<void>;
  onRestoreDriveBackup?: (passphrase: string) => Promise<void>;
  onDisableDriveBackup?: (deleteRemote: boolean) => Promise<void>;
  onDeleteAllData?: () => void;
}


export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  currentUser,
  profile,
  latestBiometrics,
  workouts,
  exerciseCatalog,
  bodyweightKg,
  canInstallPwa = false,
  onTriggerInstallPwa,
  isOpen,
  onClose,
  onAuthSuccess,
  onSignOut,
  onUpdateProfile,
  onOpenWatchSync,
  onOpenActivityApps,
  onResetData,
  onExportData,
  onImportData,
  onOpenCompetitorImport,
  onViewPersonalBests,
  onEnableDriveBackup,
  onRunDriveBackupNow,
  onRestoreDriveBackup,
  onDisableDriveBackup,
  onDeleteAllData,
}) => {
  const [clientId, setClientId] = useState(GOOGLE_AUTH_CONFIG.CLIENT_ID);
  const [customClientIdInput, setCustomClientIdInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const isClientValid = isGoogleClientConfigured(clientId);
  const isLocalDevelopment =
    typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

  useEffect(() => {
    if (!isOpen || currentUser || !isClientValid) return;

    let mounted = true;
    initializeGoogleSignIn(clientId, (user) => {
      if (!mounted) return;
      triggerHaptic('success');
      setStatusMessage('Signed in successfully!');
      onAuthSuccess(user);
      setTimeout(() => {
        if (mounted) setStatusMessage(null);
      }, 2500);
    }).then((success) => {
      if (mounted && success && googleBtnContainerRef.current) {
        renderGoogleSignInButton(googleBtnContainerRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 280,
        });
        promptGoogleOneTap();
      }
    });

    return () => {
      mounted = false;
    };
  }, [isOpen, currentUser, clientId, isClientValid, onAuthSuccess]);

  if (!isOpen) return null;

  // Real Google sign-in only. If Google's sign-in can't be shown, say so; never fake an account.
  const handleApplyCustomClient = () => {
    if (!customClientIdInput.trim()) return;
    setClientId(customClientIdInput.trim());
    setStatusMessage('Updated Client ID. Retrying Google Sign-In...');
  };

  const handleSignOutClick = () => {
    triggerHaptic('light');
    signOutUser();
    onSignOut();
    setStatusMessage('Signed out.');
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const supabaseUrl = isSupabaseConfigured() ? getSupabaseGoogleAuthUrl() : null;

  return (
    <div
      className="wk fixed inset-0 z-50 overflow-y-auto"
      style={{
        backgroundColor: 'var(--color-bg-canvas)',
        backgroundImage: 'linear-gradient(180deg, rgb(var(--color-bg-surface-rgb) / 0.28) 0%, transparent 180px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="max-w-md mx-auto px-4 pt-4 pb-20">
        <header className="flex items-center justify-between gap-3">
          <h1 id="auth-modal-title" className="wk-page-title">
            Profile
          </h1>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center transition-colors shrink-0"
            style={{
              background: 'var(--wk-card)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
            aria-label="Close profile"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </header>

        <div className="flex flex-col mt-5 gap-3">
          {/* Account & Sign-In Card */}
          <div className="wk-card w-full text-left block">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="rounded-full flex items-center justify-center shrink-0 overflow-hidden w-12 h-12 border"
                  style={{
                    background: 'var(--wk-raised)',
                    borderColor: 'var(--color-border-subtle)',
                  }}
                >
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="wk-h1">
                      {profile.name !== 'Athlete' ? profile.name.charAt(0).toUpperCase() : 'G'}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="wk-h1">
                    {currentUser ? 'Your athlete account' : 'Sign in to Treise'}
                  </h2>
                  <p className="wk-body mt-1">
                    {currentUser
                      ? 'Your workouts are saved on this device'
                      : 'Add your name and photo to your profile'}
                  </p>
                </div>
              </div>
              <span className="wk-pill shrink-0">
                {currentUser ? 'Signed in' : 'Local only'}
              </span>
            </div>

            {statusMessage && (
              <p className="wk-body mt-3">
                {statusMessage}
              </p>
            )}

            {currentUser ? (
              <div
                className="flex flex-col mt-4 pt-3 gap-3"
                style={{ borderTop: '1px solid var(--color-border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-meta-title">{currentUser.name}</span>
                  <span className="wk-pill">Active</span>
                </div>
                <p className="wk-body">{currentUser.email}</p>

                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="wk-button"
                  style={{
                    background: 'var(--wk-raised)',
                    color: 'var(--color-status-danger)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div
                className="flex flex-col mt-4 pt-3 gap-3"
                style={{ borderTop: '1px solid var(--color-border-subtle)' }}
              >
                <p className="wk-body">
                  Personalize your profile with your Google name and photo. Workouts stay on this device—use Export backup below to keep a copy.
                </p>

                {isClientValid && (
                  <div ref={googleBtnContainerRef} className="flex justify-center min-h-[44px]" />
                )}

                {!isClientValid && (
                  <p className="wk-body">
                    Google sign-in isn&apos;t available right now. You can keep using Treise without an account.
                  </p>
                )}

                {supabaseUrl && (
                  <a
                    href={supabaseUrl}
                    onClick={markLinkSignInStarted}
                    className="wk-button min-h-[48px]"
                    style={{ background: 'var(--wk-pill)', color: 'var(--color-text-primary)' }}
                  >
                    Sign in via Supabase Auth
                  </a>
                )}

                {/* Developer setting: only on a local build, never shown to athletes. */}
                {isLocalDevelopment && (
                    <button
                      type="button"
                      onClick={() => setShowConfig(!showConfig)}
                      className="wk-caption hover:underline min-h-[44px] flex items-center justify-center"
                    >
                      {showConfig ? 'Hide cloud config' : 'Link Google Cloud Client ID (optional)'}
                    </button>
                )}

                {isLocalDevelopment && showConfig && (
                  <div className="flex flex-col gap-2">
                    <label className="wk-meta-title block">Google OAuth client ID</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customClientIdInput}
                        onChange={(e) => setCustomClientIdInput(e.target.value)}
                        placeholder="123456...apps.googleusercontent.com"
                        className="wk-field flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCustomClient}
                        className="wk-btn-secondary shrink-0 min-h-[44px]"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {onUpdateProfile && (
            <ProfileSettingsSections
              profile={profile}
              latestBiometrics={latestBiometrics}
              workouts={workouts}
              exerciseCatalog={exerciseCatalog}
              bodyweightKg={bodyweightKg}
              canInstallPwa={canInstallPwa}
              onTriggerInstallPwa={onTriggerInstallPwa}
              onUpdateProfile={onUpdateProfile}
              onOpenWatchSync={onOpenWatchSync}
              onOpenActivityApps={onOpenActivityApps}
              onResetData={onResetData}
              onExportData={onExportData}
              onImportData={onImportData}
              onOpenCompetitorImport={onOpenCompetitorImport}
              onViewPersonalBests={onViewPersonalBests}
              onEnableDriveBackup={onEnableDriveBackup}
              onRunDriveBackupNow={onRunDriveBackupNow}
              onRestoreDriveBackup={onRestoreDriveBackup}
              onDisableDriveBackup={onDisableDriveBackup}
              onDeleteAllData={onDeleteAllData}
            />
          )}
        </div>
      </div>
    </div>
  );
};
