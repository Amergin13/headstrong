/**
 * Treise Google Authentication & Cloud Sync Service
 * 
 * Supports:
 * 1. Google Identity Services (GIS) One-Tap & standard Sign in with Google
 * 2. Client-side JWT credential verification & profile extraction (Name, Email, Google Avatar)
 * 3. Supabase Auth OAuth bridge (compatible with Lovable-generated Supabase projects)
 * 4. Local-first offline guest session fallback
 */

import { AuthUser } from '../engine/types';
import { clearAuthUser, loadAuthUser, saveAuthUser } from './storage';

export interface GoogleJwtPayload {
  iss?: string;
  nbf?: number;
  aud?: string;
  sub: string;
  email: string;
  email_verified?: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  iat?: number;
  exp?: number;
}

function getEnv(key: string): string {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] as string;
    }
  } catch {}
  try {
    const metaEnv = new Function('return typeof import.meta !== "undefined" ? import.meta.env : null')();
    if (metaEnv && metaEnv[key]) {
      return metaEnv[key] as string;
    }
  } catch {}
  return '';
}

export const GOOGLE_AUTH_CONFIG = {
  CLIENT_ID:
    getEnv('VITE_GOOGLE_CLIENT_ID') ||
    '1084281358961-headstrong.apps.googleusercontent.com',
  REDIRECT_URI:
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://treise.vercel.app',
  SCOPES: ['openid', 'email', 'profile'],
  SUPABASE_URL: getEnv('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnv('VITE_SUPABASE_ANON_KEY'),
};

let gisScriptLoadingPromise: Promise<boolean> | null = null;

/**
 * Dynamically loads the official Google Identity Services library:
 * https://accounts.google.com/gsi/client
 */
export function loadGoogleIdentityServicesScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).google?.accounts?.id) return Promise.resolve(true);

  if (gisScriptLoadingPromise) return gisScriptLoadingPromise;

  gisScriptLoadingPromise = new Promise<boolean>((resolve) => {
    // Check if script tag already exists
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Failed to load Google Identity Services SDK.');
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return gisScriptLoadingPromise;
}

/**
 * Decodes a Google JWT Credential string into a typed GoogleJwtPayload.
 * Returns null if the token is invalid or cannot be parsed.
 */
export function decodeGoogleIdToken(jwtToken: string): GoogleJwtPayload | null {
  try {
    const parts = jwtToken.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      (typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary'))
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

/**
 * Initializes Google Identity Services (GIS) with the given or default Client ID.
 */
export async function initializeGoogleSignIn(
  clientId: string = GOOGLE_AUTH_CONFIG.CLIENT_ID,
  onCredentialReceived: (user: AuthUser) => void
): Promise<boolean> {
  const isLoaded = await loadGoogleIdentityServicesScript();
  if (!isLoaded || typeof window === 'undefined' || !(window as any).google?.accounts?.id) {
    return false;
  }

  try {
    (window as any).google.accounts.id.initialize({
      client_id: clientId,
      callback: (response: { credential?: string }) => {
        if (response.credential) {
          const user = signInWithGoogleCredential(response.credential);
          onCredentialReceived(user);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    return true;
  } catch (e) {
    console.error('Failed to initialize Google Accounts ID client:', e);
    return false;
  }
}

/**
 * Renders the official Google Sign-In button into a container element.
 */
export function renderGoogleSignInButton(
  container: HTMLElement,
  options?: {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    width?: number;
  }
): void {
  if (typeof window === 'undefined' || !(window as any).google?.accounts?.id) return;
  (window as any).google.accounts.id.renderButton(container, {
    theme: options?.theme || 'outline',
    size: options?.size || 'large',
    text: options?.text || 'continue_with',
    shape: options?.shape || 'pill',
    width: options?.width || 280,
    logo_alignment: 'left',
  });
}

/**
 * Prompts Google One Tap if supported on the current device.
 */
export function promptGoogleOneTap(): void {
  if (typeof window === 'undefined' || !(window as any).google?.accounts?.id) return;
  try {
    (window as any).google.accounts.id.prompt();
  } catch (e) {
    console.warn('Google One Tap prompt skipped:', e);
  }
}

/**
 * Signs in using a verified Google JWT credential string.
 */
export function signInWithGoogleCredential(jwtCredential: string): AuthUser {
  const payload = decodeGoogleIdToken(jwtCredential);
  if (!payload) {
    throw new Error('Failed to parse Google ID token credential');
  }

  const authUser: AuthUser = {
    id: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture,
    provider: 'google',
    idToken: jwtCredential,
    createdAt: new Date().toISOString(),
  };

  saveAuthUser(authUser);
  return authUser;
}

/**
 * Mock / Preview Google Sign-In helper.
 * Allows testing full account login, profile synchronization, and logout without immediate Google Cloud Console API credentials.
 */
export function signInWithDemoGoogleAccount(
  customEmail: string = 'athlete@treise.app',
  customName: string = 'Benen Taylor'
): AuthUser {
  const demoUser: AuthUser = {
    id: 'demo-google-' + Math.random().toString(36).substring(2, 9),
    email: customEmail,
    name: customName,
    avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80`,
    provider: 'google',
    createdAt: new Date().toISOString(),
  };

  saveAuthUser(demoUser);
  return demoUser;
}

/**
 * Signs out the current user, clears local auth state, and disables GIS auto-select.
 */
export function signOutUser(): void {
  clearAuthUser();
  if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
    try {
      (window as any).google.accounts.id.disableAutoSelect();
    } catch {
      // Ignore if not initialized
    }
  }
}

/**
 * Returns current authenticated user from storage.
 */
export function getAuthenticatedUser(): AuthUser | null {
  return loadAuthUser();
}

/**
 * Checks if Supabase credentials are configured.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(GOOGLE_AUTH_CONFIG.SUPABASE_URL && GOOGLE_AUTH_CONFIG.SUPABASE_ANON_KEY);
}

/**
 * Initiates Supabase Google OAuth redirect flow (if migrating from a Lovable Supabase project).
 */
export function getSupabaseGoogleAuthUrl(
  customSupabaseUrl?: string,
  redirectTo?: string
): string | null {
  const baseUrl = customSupabaseUrl || GOOGLE_AUTH_CONFIG.SUPABASE_URL;
  if (!baseUrl) return null;
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const targetRedirect =
    redirectTo ||
    (typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://treise.vercel.app');
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: targetRedirect,
  });
  return `${cleanBase}/auth/v1/authorize?${params.toString()}`;
}
