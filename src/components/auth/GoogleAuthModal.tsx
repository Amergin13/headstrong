import React, { useEffect, useRef, useState } from 'react';
import { AuthUser, BiometricLog, UserProfile } from '../../engine/types';
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
  onDeleteAllData?: () => void;
}

const fig = (px: number) => `calc(${px} * var(--f))`;

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  currentUser,
  profile,
  latestBiometrics,
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
      style={{ background: 'linear-gradient(180deg, #283339 0%, #13181C 70%)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="max-w-md mx-auto"
        style={{
          paddingLeft: fig(38),
          paddingRight: fig(38),
          paddingTop: fig(38),
          paddingBottom: fig(120),
        }}
      >
        <header className="flex items-center justify-between" style={{ gap: fig(20) }}>
          <h1 id="auth-modal-title" className="wk-page-title">
            Profile
          </h1>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-11 h-11 min-h-[44px] rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
            style={{ background: 'var(--wk-card)' }}
            aria-label="Close profile"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </header>

        <div className="flex flex-col" style={{ marginTop: fig(40), gap: fig(22) }}>
          {/* Account & Sign-In Card */}
          <div className="wk-card w-full text-left block">
            <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
              <div className="flex items-center" style={{ gap: fig(20) }}>
                <div
                  className="rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                  style={{
                    width: fig(84),
                    height: fig(84),
                    background: 'var(--wk-raised)',
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
                  <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                    {currentUser ? 'Your Athlete Account' : 'Sign In to Treise'}
                  </h2>
                  <p
                    style={{
                      fontSize: `max(12px, ${fig(28)})`,
                      lineHeight: 1.21,
                      color: 'var(--wk-muted)',
                      marginTop: fig(10),
                    }}
                  >
                    {currentUser
                      ? 'Your workouts are saved on this device'
                      : 'Add your name and photo to your profile'}
                  </p>
                </div>
              </div>
              <span className="wk-pill shrink-0">
                {currentUser ? 'SIGNED IN' : 'LOCAL ONLY'}
              </span>
            </div>

            {statusMessage && (
              <p className="wk-body" style={{ marginTop: fig(24) }}>
                {statusMessage}
              </p>
            )}

            {currentUser ? (
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
                  <span className="wk-label">{currentUser.name}</span>
                  <span className="wk-pill">ACTIVE</span>
                </div>
                <p className="wk-body">{currentUser.email}</p>

                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="wk-button min-h-[44px]"
                  style={{ background: 'var(--wk-raised)', color: '#FF3B4E' }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div
                className="flex flex-col"
                style={{
                  marginTop: fig(28),
                  paddingTop: fig(24),
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  gap: fig(20),
                }}
              >
                <p className="wk-body">
                  Personalize your profile with your Google name and photo. Workouts stay on this device—use Export Backup below to keep a copy.
                </p>

                {isClientValid && (
                  <div ref={googleBtnContainerRef} className="flex justify-center min-h-[44px]" />
                )}

                {!isClientValid && (
                  <p className="wk-body" style={{ color: 'var(--wk-muted)' }}>
                    Google sign-in isn&apos;t available right now. You can keep using Treise without an account.
                  </p>
                )}

                {supabaseUrl && (
                  <a
                    href={supabaseUrl}
                    onClick={markLinkSignInStarted}
                    className="wk-button min-h-[44px]"
                    style={{ background: 'var(--wk-pill)', color: '#fff' }}
                  >
                    Sign in via Supabase Auth
                  </a>
                )}

                {/* Developer setting: only on a local build, never shown to athletes. */}
                {isLocalDevelopment && (
                  <button
                    type="button"
                    onClick={() => setShowConfig(!showConfig)}
                    className="wk-caption hover:text-white min-h-[44px] flex items-center justify-center"
                  >
                    {showConfig ? 'Hide Cloud Config' : 'Link Google Cloud Client ID (Optional)'}
                  </button>
                )}

                {isLocalDevelopment && showConfig && (
                  <div className="flex flex-col" style={{ gap: fig(16) }}>
                    <label className="wk-label block">Google OAuth Web Client ID</label>
                    <div className="flex" style={{ gap: fig(12) }}>
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
                        className="wk-pill shrink-0 min-h-[44px]"
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
              canInstallPwa={canInstallPwa}
              onTriggerInstallPwa={onTriggerInstallPwa}
              onUpdateProfile={onUpdateProfile}
              onOpenWatchSync={onOpenWatchSync}
              onOpenActivityApps={onOpenActivityApps}
              onResetData={onResetData}
              onExportData={onExportData}
              onImportData={onImportData}
              onDeleteAllData={onDeleteAllData}
            />
          )}
        </div>
      </div>
    </div>
  );
};
