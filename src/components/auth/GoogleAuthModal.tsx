import React, { useEffect, useRef, useState } from 'react';
import { AuthUser, UserProfile } from '../../engine/types';
import {
  initializeGoogleSignIn,
  isGoogleClientConfigured,
  promptGoogleOneTap,
  renderGoogleSignInButton,
  signOutUser,
  isSupabaseConfigured,
  getSupabaseGoogleAuthUrl,
  GOOGLE_AUTH_CONFIG,
} from '../../services/googleAuthService';
import { X } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface GoogleAuthModalProps {
  currentUser: AuthUser | null;
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onSignOut: () => void;
}

const fig = (px: number) => `calc(${px} * var(--f))`;

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onAuthSuccess,
  onSignOut,
}) => {
  const [clientId, setClientId] = useState(GOOGLE_AUTH_CONFIG.CLIENT_ID);
  const [customClientIdInput, setCustomClientIdInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const isClientValid = isGoogleClientConfigured(clientId);

  useEffect(() => {
    if (!isOpen || currentUser || !isClientValid) return;

    let mounted = true;
    initializeGoogleSignIn(clientId, (user) => {
      if (!mounted) return;
      triggerHaptic('success');
      setStatusMessage('Signed in successfully!');
      onAuthSuccess(user);
      setTimeout(() => onClose(), 600);
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
  }, [isOpen, currentUser, clientId, isClientValid, onAuthSuccess, onClose]);

  if (!isOpen) return null;

  // Real Google sign-in only. If Google's sign-in can't be shown, say so; never fake an account.
  const handleGoogleSignInClick = () => {
    triggerHaptic('medium');
    if (isClientValid && typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setStatusMessage('Google sign-in was closed or blocked. Use the Google button above, or try again.');
          }
        });
        return;
      } catch (e) {
        console.warn('GIS prompt error:', e);
      }
    }
    setStatusMessage("Google sign-in isn't available right now. You can keep using Treise without an account.");
  };

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
    setTimeout(() => onClose(), 400);
  };

  const supabaseUrl = isSupabaseConfigured() ? getSupabaseGoogleAuthUrl() : null;

  return (
    <div
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="wk-card w-full max-w-md text-left block shadow-2xl">
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <div>
            <h2 id="auth-modal-title" className="wk-h1" style={{ lineHeight: 1.21 }}>
              {currentUser ? 'Your Athlete Account' : 'Sign In to Treise'}
            </h2>
            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(16),
              }}
            >
              {currentUser
                ? 'Your workouts are saved on this device'
                : 'Add your name and photo to your profile'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-11 h-11 min-h-[44px] rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
            style={{ background: 'var(--wk-raised)' }}
            aria-label="Close dialog"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
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
              Personalize your profile with your Google name and photo. Workouts stay on this device—use Export Backup in Program to keep a copy.
            </p>

            {isClientValid && (
              <div ref={googleBtnContainerRef} className="flex justify-center min-h-[44px]" />
            )}

            <button
              type="button"
              onClick={handleGoogleSignInClick}
              className="wk-button min-h-[44px]"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              {isClientValid ? 'Sign In with Google' : 'Sign In as Athlete'}
            </button>

            {supabaseUrl && (
              <a
                href={supabaseUrl}
                className="wk-button min-h-[44px]"
                style={{ background: 'var(--wk-pill)', color: '#fff' }}
              >
                Sign in via Supabase Auth
              </a>
            )}

            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="wk-caption hover:text-white min-h-[44px] flex items-center justify-center"
            >
              {showConfig ? 'Hide Cloud Config' : 'Link Google Cloud Client ID (Optional)'}
            </button>

            {showConfig && (
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

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              className="wk-button min-h-[44px]"
              style={{ background: 'var(--wk-raised)', color: '#fff' }}
            >
              Continue as Guest
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
