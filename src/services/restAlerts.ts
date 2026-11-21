import { triggerHaptic } from '../utils/haptics';

/**
 * Reliable gym-floor rest alerts for locked or silent phones that NEVER permanently
 * interrupt background gym music (Spotify, YouTube Music, Apple Music).
 *
 * Design principles:
 * - Never mounts an `<audio>` / `<video>` element or grabs `navigator.mediaSession`,
 *   which would steal OS audio focus and leave gym music paused.
 * - Uses a short Web Audio oscillator chime (~380 ms total) at modest gain (0.18),
 *   ramped cleanly to zero and immediately suspended/closed so OS audio ducking releases.
 * - Combines multi-pulse vibration (`navigator.vibrate`) with Service Worker / Web
 *   Notifications (`tag: 'treise-rest-done'`) so alerts surface on lock screens.
 */

export const REST_CHIME_MUTE_STORAGE_KEY = 'treise_rest_chime_muted_v1';

export type RestNotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function getRestNotificationStatus(): RestNotificationStatus {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission as RestNotificationStatus;
}

export async function requestRestNotificationPermission(): Promise<RestNotificationStatus> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result as RestNotificationStatus;
  } catch {
    return getRestNotificationStatus();
  }
}

export function isRestChimeMuted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(REST_CHIME_MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRestChimeMuted(muted: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REST_CHIME_MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore private-mode storage errors
  }
}

/**
 * Multi-pulse haptic cue that cuts through pocket carry on silent phones.
 */
export function triggerRestDoneHaptics(): boolean {
  triggerHaptic('success');
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      return navigator.vibrate([220, 100, 220, 100, 320]);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Plays a short, pleasant two-tone Web Audio chime (~380 ms) and immediately closes the
 * AudioContext afterwards so mobile OSes do not hold audio focus or pause background music.
 */
export async function playGentleRestChime(muted: boolean = isRestChimeMuted()): Promise<boolean> {
  if (muted || typeof window === 'undefined') return false;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return false;

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, duration: 0.14 },
      { freq: 1174.66, start: 0.16, duration: 0.2 },
    ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
    const closingCtx = ctx;
    setTimeout(() => {
      closingCtx.close().catch(() => {});
    }, 450);
    return true;
  } catch {
    if (ctx) {
      ctx.close().catch(() => {});
    }
    return false;
  }
}

/**
 * Delivers a lock-screen notification via the active Service Worker when permitted,
 * falling back to `new Notification` in standard browser tabs.
 */
export async function showLockScreenRestNotification(params: {
  exerciseName?: string;
  nextLabel?: string;
}): Promise<boolean> {
  if (getRestNotificationStatus() !== 'granted') return false;
  const title = 'Rest complete — ready to lift';
  const body = params.nextLabel
    ? `Next up: ${params.nextLabel}${params.exerciseName ? ` (${params.exerciseName})` : ''}`
    : params.exerciseName
    ? `Next set of ${params.exerciseName} is ready.`
    : 'Your rest timer is done.';

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'treise-rest-done',
    renotify: true,
    silent: false,
    vibrate: [220, 100, 220, 100, 320],
  };

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fall through to standard Notification constructor
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/** Fires the complete non-intrusive rest-complete alert bundle (haptic + gentle chime + lock-screen notification). */
export async function fireRestCompleteAlerts(params: {
  exerciseName?: string;
  nextLabel?: string;
  muted?: boolean;
}): Promise<{ haptics: boolean; chime: boolean; notification: boolean }> {
  const haptics = triggerRestDoneHaptics();
  const [chime, notification] = await Promise.all([
    playGentleRestChime(params.muted ?? isRestChimeMuted()),
    showLockScreenRestNotification({
      exerciseName: params.exerciseName,
      nextLabel: params.nextLabel,
    }),
  ]);
  return { haptics, chime, notification };
}
