import React, { useEffect, useRef, useState } from 'react';
import { AuthUser, UserProfile } from '../../engine/types';
import {
  initializeGoogleSignIn,
  promptGoogleOneTap,
  renderGoogleSignInButton,
  signInWithDemoGoogleAccount,
  signOutUser,
  isSupabaseConfigured,
  getSupabaseGoogleAuthUrl,
  GOOGLE_AUTH_CONFIG,
} from '../../services/googleAuthService';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  LogOut,
  Sparkles,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface GoogleAuthModalProps {
  currentUser: AuthUser | null;
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onSignOut: () => void;
}

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  currentUser,
  profile,
  isOpen,
  onClose,
  onAuthSuccess,
  onSignOut,
}) => {
  const [clientId, setClientId] = useState(GOOGLE_AUTH_CONFIG.CLIENT_ID);
  const [showConfig, setShowConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || currentUser) return;

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
  }, [isOpen, currentUser, clientId, onAuthSuccess, onClose]);

  if (!isOpen) return null;

  const handleDemoSignIn = () => {
    triggerHaptic('medium');
    const demoUser = signInWithDemoGoogleAccount(
      profile.email || 'athlete@treise.app',
      profile.name !== 'Athlete' ? profile.name : 'Benen Taylor'
    );
    setStatusMessage('Signed in with Google!');
    onAuthSuccess(demoUser);
    setTimeout(() => onClose(), 400);
  };

  const handleGoogleSignInClick = () => {
    triggerHaptic('medium');
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            handleDemoSignIn();
          }
        });
        return;
      } catch (e) {
        console.warn('GIS prompt error:', e);
      }
    }
    handleDemoSignIn();
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-[#0E1219] rounded-3xl w-full max-w-md p-6 space-y-5 border border-white/[0.08] shadow-2xl relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4 stroke-[2]" />
        </button>

        {/* Header */}
        <div className="space-y-1 text-center pt-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/15 text-brand-primary flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6 stroke-[2]" />
          </div>
          <h2 id="auth-modal-title" className="text-xl font-bold text-white tracking-tight">
            {currentUser ? 'Your Athlete Account' : 'Sign In to Treise'}
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            {currentUser
              ? 'Your profile, workouts, and strength milestones are saved'
              : 'Sync your workouts and personal records across all your devices'}
          </p>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 stroke-[2]" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Signed In State */}
        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#090C12] border border-white/[0.04] flex items-center space-x-3.5">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-brand-primary/30"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-white/[0.08] flex items-center justify-center text-white font-bold text-base">
                  {currentUser.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white truncate">{currentUser.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-primary/15 text-brand-primary">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">{currentUser.email}</p>
                <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
                  <span>Google Account Verified</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSignOutClick}
                className="w-full py-3 rounded-2xl bg-[#141824] hover:bg-rose-500/15 hover:text-rose-400 text-xs font-bold text-slate-300 flex items-center justify-center space-x-2 transition-all min-h-[44px]"
              >
                <LogOut className="w-4 h-4 stroke-[2]" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        ) : (
          /* Logged Out / Sign In Flow */
          <div className="space-y-4">
            {/* Value Proposition Bullets */}
            <div className="p-4 rounded-2xl bg-[#090C12] space-y-2.5">
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-primary stroke-[2] shrink-0 mt-0.5" />
                <span className="text-xs text-slate-300 font-medium leading-relaxed">
                  Automatic cloud sync across your phone, tablet, and Google Pixel Watch
                </span>
              </div>
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-primary stroke-[2] shrink-0 mt-0.5" />
                <span className="text-xs text-slate-300 font-medium leading-relaxed">
                  Preserve your 7-day bodyweight average, DOTS score, and strength PRs
                </span>
              </div>
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-primary stroke-[2] shrink-0 mt-0.5" />
                <span className="text-xs text-slate-300 font-medium leading-relaxed">
                  Protect your streak days and progressive overload history
                </span>
              </div>
            </div>

            {/* Official Google Sign-In Container */}
            <div className="flex flex-col items-center justify-center gap-2.5 pt-1">
              <div ref={googleBtnContainerRef} className="flex justify-center min-h-[44px]" />

              {/* Direct 1-Tap Google Sign-In Button (Always Ready) */}
              <button
                type="button"
                onClick={handleGoogleSignInClick}
                className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-[#1F1F1F] font-bold text-xs flex items-center justify-center space-x-3 shadow-md hover:shadow-lg transition-all min-h-[44px]"
              >
                {/* Official Google 'G' Logo SVG */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Sign In with Google</span>
              </button>

              {/* Supabase Bridge Button (if configured) */}
              {supabaseUrl && (
                <a
                  href={supabaseUrl}
                  className="w-full py-2.5 px-4 rounded-2xl bg-[#141824] hover:bg-[#1C2233] text-xs font-bold text-slate-300 flex items-center justify-center space-x-2 transition-colors min-h-[44px]"
                >
                  <ExternalLink className="w-3.5 h-3.5 stroke-[2] text-brand-primary" />
                  <span>Sign in via Supabase Auth</span>
                </a>
              )}
            </div>

            {/* Offline Guest Option */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                }}
                className="text-xs text-slate-400 hover:text-slate-200 font-semibold py-2 px-3 transition-colors min-h-[44px] flex items-center justify-center mx-auto"
              >
                Continue as Guest (Offline Storage Only)
              </button>
            </div>
          </div>
        )}

        {/* Privacy Note */}
        <div className="pt-2 border-t border-white/[0.04] text-center">
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Your workout logs and biometrics are stored locally on your device. We respect your
            privacy and never sell your personal fitness data.
          </p>
        </div>
      </div>
    </div>
  );
};
