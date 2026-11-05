import { RawSourceSession } from './activitySources';

/**
 * Health Connect, through the Treise Android app.
 *
 * A web page can't read Health Connect, so the Play Store app reads it natively and passes the
 * workouts to the page over Chrome's Trusted Web Activity message channel (Chrome 115+). The app
 * starts the conversation: its first message carries a MessagePort, which the page keeps and uses
 * for requests. In a normal browser no port ever arrives and Health Connect simply isn't offered.
 *
 * Messages (JSON strings):
 *   app -> page  {type:'hello', version}                      bridge is ready (older installed apps send 1)
 *   page -> app  {type:'status'}                              ask for availability and permission
 *   app -> page  {type:'status', available, granted}
 *   page -> app  {type:'request-permission'}                  show Health Connect's permission screen
 *   page -> app  {type:'read-sessions', requestId, since}     read ExerciseSessionRecords since ISO time
 *   app -> page  {type:'sessions', requestId, sessions|error}
 * Scale messages (type 'ble-…') share this channel; see nativeScale.ts.
 */

export interface HealthConnectStatus {
  /** The Treise Android app is running this page and can reach Health Connect. */
  bridge: boolean;
  /** Health Connect is installed and usable on this phone. */
  available: boolean;
  /** The athlete allowed Treise to read exercise sessions. */
  granted: boolean;
}

type StatusListener = (status: HealthConnectStatus) => void;

let port: MessagePort | null = null;
let appVersion = 0;
let status: HealthConnectStatus = { bridge: false, available: false, granted: false };
const statusListeners = new Set<StatusListener>();
const pending = new Map<string, { resolve: (s: RawSourceSession[]) => void; reject: (e: Error) => void }>();
let started = false;

function setStatus(next: Partial<HealthConnectStatus>) {
  status = { ...status, ...next };
  statusListeners.forEach((l) => l(status));
}

function send(message: Record<string, unknown>) {
  port?.postMessage(JSON.stringify(message));
}

type AppMessageListener = (msg: any) => void;
const appMessageListeners = new Set<AppMessageListener>();

/** Sends a message to the Android app. Does nothing outside the app. */
export const sendAppMessage = send;

/** Every message from the Android app (other features share this channel). */
export function onAppMessage(listener: AppMessageListener): () => void {
  appMessageListeners.add(listener);
  return () => {
    appMessageListeners.delete(listener);
  };
}

/** True when this page is running in the Treise Android app and can talk to it. */
export function isAppBridgeReady(): boolean {
  return port !== null;
}

/** The bridge version the installed app announced: 1 = Health Connect, 2 = also the scale. */
export function getAppBridgeVersion(): number {
  return port ? appVersion : 0;
}

/** Takes the channel the app opened. Exported so engine tests can stand in for the app. */
export function attachAppPort(appPort: MessagePort, version = 1): void {
  port = appPort;
  appVersion = version;
  port.onmessage = (e) => handleAppMessage(e.data);
  setStatus({ bridge: true });
  send({ type: 'status' });
}

function handleAppMessage(data: unknown) {
  let msg: any;
  try {
    msg = typeof data === 'string' ? JSON.parse(data) : data;
  } catch {
    return;
  }
  if (!msg || typeof msg.type !== 'string') return;
  appMessageListeners.forEach((l) => l(msg));
  if (msg.type === 'status') {
    setStatus({ bridge: true, available: Boolean(msg.available), granted: Boolean(msg.granted) });
  } else if (msg.type === 'sessions' && typeof msg.requestId === 'string') {
    const p = pending.get(msg.requestId);
    if (!p) return;
    pending.delete(msg.requestId);
    if (msg.error) p.reject(new Error(String(msg.error)));
    else p.resolve(Array.isArray(msg.sessions) ? msg.sessions : []);
  }
}

/** Starts listening for the Android app's first message. Safe to call more than once. */
export function startHealthConnectBridge(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('message', (event: MessageEvent) => {
    // The app uses this site's own origin (verified by Digital Asset Links), so other senders are ignored.
    if (event.origin !== window.location.origin || port) return;
    const p = event.ports?.[0];
    if (!p) return;
    let hello: any;
    try {
      hello = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (hello?.type !== 'hello') return;
    attachAppPort(p, Number(hello.version) || 1);
  });
}

export function getHealthConnectStatus(): HealthConnectStatus {
  return status;
}

export function onHealthConnectStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** Opens Health Connect's own permission screen (the athlete chooses there). */
export function requestHealthConnectPermission(): void {
  send({ type: 'request-permission' });
}

/** Exercise sessions since `since`, as the app read them from Health Connect. */
export function readHealthConnectSessions(since: Date, timeoutMs = 20000): Promise<RawSourceSession[]> {
  if (!port || !status.granted) return Promise.resolve([]);
  const requestId = `hc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    send({ type: 'read-sessions', requestId, since: since.toISOString() });
    setTimeout(() => {
      if (pending.delete(requestId)) reject(new Error('Health Connect did not answer'));
    }, timeoutMs);
  });
}
