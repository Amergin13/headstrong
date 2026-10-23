import { useEffect } from 'react';
import { AuthUser, WearableProvider } from '../engine/types';
import { signInWithGoogleCredential } from '../services/googleAuthService';
import type { TabId } from '../components/common/NavigationBar';

interface LaunchLinkHandlers {
  onOpenTab: (tab: TabId) => void;
  onOpenCoach: () => void;
  onOpenWatchSync: () => void;
  onOpenAuth: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onWearableOAuthCode: (code: string, provider: WearableProvider) => void;
}

/**
 * Handles URLs the app is opened with: Android shortcuts (`?tab=` / `?action=`), Google sign-in
 * redirects (`#id_token=`), and Whoop / Fitbit OAuth callbacks (`?code=`). Runs once, then
 * cleans the URL so a refresh doesn't repeat the action.
 */
export function useLaunchLinks(handlers: LaunchLinkHandlers) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);

    const tabParam = params.get('tab');
    const actionParam = params.get('action');
    const oauthCode = params.get('code');
    const idToken = hashParams.get('id_token') || params.get('id_token');

    if (idToken) {
      try {
        handlers.onAuthSuccess(signInWithGoogleCredential(idToken));
      } catch (err) {
        console.warn('Could not sign in with id_token:', err);
      }
    }

    if (tabParam === 'chat') {
      handlers.onOpenCoach();
    } else if (tabParam && ['train', 'character', 'analytics', 'program'].includes(tabParam)) {
      handlers.onOpenTab(tabParam as TabId);
    }

    if (actionParam === 'watch-sync') {
      handlers.onOpenWatchSync();
    } else if (actionParam === 'auth' || actionParam === 'signin' || tabParam === 'auth') {
      handlers.onOpenAuth();
    } else if (actionParam === 'log-weight') {
      handlers.onOpenTab('analytics');
    }

    if (oauthCode) {
      const stateParam = params.get('state') || '';
      const isWhoop = stateParam.startsWith('whoop_') || window.location.pathname.includes('/whoop');
      handlers.onWearableOAuthCode(oauthCode, isWhoop ? 'whoop' : 'fitbit');
    }

    if (tabParam || actionParam || oauthCode || idToken || hash || window.location.pathname.includes('/oauth')) {
      const cleanPath = window.location.pathname.includes('/oauth') ? '/' : window.location.pathname;
      window.history.replaceState({}, document.title, cleanPath);
    }
    // Runs once on launch by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
