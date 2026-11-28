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
 *   app -> page  {type:'status', available, granted, stepsGranted, biometricsGranted}
 *   page -> app  {type:'request-permission'}                  show Health Connect's permission screen
 *   page -> app  {type:'read-sessions', requestId, since}     read ExerciseSessionRecords since ISO time
 *   app -> page  {type:'sessions', requestId, sessions|error}
 *   page -> app  {type:'read-steps', requestId, since}        read daily StepsRecord totals since ISO time
 *   app -> page  {type:'steps', requestId, days|error}
 *   page -> app  {type:'read-biometrics', requestId, since}   read daily sleep/HR/HRV/weight/bodyFat since ISO time
 *   app -> page  {type:'biometrics', requestId, days|error}
 * Scale messages (type 'ble-…') share this channel; see nativeScale.ts.
 */

export interface DailyStepRecord {
  date: string;
  steps: number;
}

export interface HealthConnectProfileData {
  heightCm?: number;
  gender?: 'male' | 'female';
  sex?: string;
  age?: number;
  birthDate?: string;
}

export interface HealthConnectBiometricDay {
  date: string;
  sleepHours?: number;
  restingHr?: number;
  hrvRmssd?: number;
  bodyweightKg?: number;
  heightCm?: number;
  bodyFatPct?: number;
  steps?: number;
  avgDailyHr?: number;
  maxDailyHr?: number;
  gender?: 'male' | 'female';
  sex?: string;
  age?: number;
  birthDate?: string;
}

export interface HealthConnectBiometricsResult {
  days: HealthConnectBiometricDay[];
  profile?: HealthConnectProfileData;
}

export type NativeHealthPlatform = 'health_connect' | 'apple_health';

export interface IosWebKitHealthHandler {
  postMessage: (message: string) => void;
}

export interface HealthConnectStatus {
  /** The Treise native app (Android TWA or iOS WKWebView) is running this page and can reach the OS health store. */
  bridge: boolean;
  /** Health Connect (Android) or Apple HealthKit (iOS) is usable on this phone. */
  available: boolean;
  /** The athlete allowed Treise to read exercise/workout sessions. */
  granted: boolean;
  /** The athlete allowed Treise to read daily step counts. */
  stepsGranted?: boolean;
  /** The athlete allowed at least one recovery/body metric (sleep, HR, HRV, weight, height, body fat). */
  biometricsGranted?: boolean;
  /** The athlete allowed Treise to read height records. */
  heightGranted?: boolean;
  /** Underlying OS health hub when known ('apple_health' on iOS HealthKit, 'health_connect' on Android). */
  provider?: NativeHealthPlatform;
}

type StatusListener = (status: HealthConnectStatus) => void;

let port: MessagePort | null = null;
let iosHandler: IosWebKitHealthHandler | null = null;
let appVersion = 0;
let status: HealthConnectStatus = {
  bridge: false,
  available: false,
  granted: false,
  stepsGranted: false,
  biometricsGranted: false,
};
const statusListeners = new Set<StatusListener>();
const pending = new Map<string, { resolve: (s: RawSourceSession[]) => void; reject: (e: Error) => void }>();
const pendingSteps = new Map<string, { resolve: (days: DailyStepRecord[]) => void; reject: (e: Error) => void }>();
const pendingBiometrics = new Map<
  string,
  { resolve: (result: HealthConnectBiometricsResult) => void; reject: (e: Error) => void }
>();
let started = false;

function setStatus(next: Partial<HealthConnectStatus>) {
  status = { ...status, ...next };
  statusListeners.forEach((l) => l(status));
}

function send(message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  if (port) {
    port.postMessage(payload);
    return;
  }
  iosHandler?.postMessage(payload);
}

type AppMessageListener = (msg: any) => void;
const appMessageListeners = new Set<AppMessageListener>();

/** Sends a message to the native Android or iOS app. Does nothing outside the app. */
export const sendAppMessage = send;

/** Every message from the native app (other features share this channel). */
export function onAppMessage(listener: AppMessageListener): () => void {
  appMessageListeners.add(listener);
  return () => {
    appMessageListeners.delete(listener);
  };
}

/** True when this page is running in the Treise Android or iOS app and can talk to it. */
export function isAppBridgeReady(): boolean {
  return port !== null || iosHandler !== null;
}

/** The bridge version the installed app announced: 1 = Health Connect, 2 = also the scale, 5 = full biometrics/HealthKit. */
export function getAppBridgeVersion(): number {
  return port || iosHandler ? appVersion : 0;
}

/** Takes the channel the Android app opened. Exported so engine tests can stand in for the app. */
export function attachAppPort(appPort: MessagePort, version = 1): void {
  port = appPort;
  iosHandler = null;
  appVersion = version;
  port.onmessage = (e) => handleAppMessage(e.data);
  setStatus({ bridge: true, provider: 'health_connect' });
  send({ type: 'status' });
}

/**
 * Attaches (or detaches when `null`) an iOS WKWebView `webkit.messageHandlers.treiseHealth` bridge
 * speaking the identical read-only JSON protocol backed by Apple HealthKit (`HKHealthStore`).
 */
export function attachIosHealthHandler(handler: IosWebKitHealthHandler | null, version = 5): void {
  iosHandler = handler;
  if (typeof window !== 'undefined') {
    (window as any).__treiseReceiveNativeMessage = (payload: unknown) => {
      handleAppMessage(payload);
    };
  }
  if (!handler) {
    if (!port) {
      appVersion = 0;
      setStatus({
        bridge: false,
        available: false,
        granted: false,
        stepsGranted: false,
        biometricsGranted: false,
        heightGranted: false,
        provider: undefined,
      });
    }
    return;
  }
  port = null;
  appVersion = version;
  setStatus({ bridge: true, provider: 'apple_health' });
  send({ type: 'status' });
}

/** Receives a JSON message pushed from the iOS WKWebView HealthKit bridge (`window.__treiseReceiveNativeMessage`). */
export function receiveNativeBridgeMessage(data: unknown): void {
  handleAppMessage(data);
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
  if (msg.type === 'hello') {
    appVersion = Math.max(appVersion, Number(msg.version) || 5);
    setStatus({
      bridge: true,
      ...(msg.provider === 'apple_health' ? { provider: 'apple_health' } : {}),
    });
    send({ type: 'status' });
    return;
  }
  if (msg.type === 'status') {
    setStatus({
      bridge: true,
      available: Boolean(msg.available),
      granted: Boolean(msg.granted),
      stepsGranted: Boolean(msg.stepsGranted),
      biometricsGranted: Boolean(msg.biometricsGranted),
      heightGranted: Boolean(msg.heightGranted),
      ...(msg.provider === 'apple_health' || msg.provider === 'health_connect'
        ? { provider: msg.provider }
        : iosHandler
        ? { provider: 'apple_health' }
        : {}),
    });
  } else if (msg.type === 'sessions' && typeof msg.requestId === 'string') {
    const p = pending.get(msg.requestId);
    if (!p) return;
    pending.delete(msg.requestId);
    if (msg.error) p.reject(new Error(String(msg.error)));
    else p.resolve(Array.isArray(msg.sessions) ? msg.sessions : []);
  } else if (msg.type === 'steps' && typeof msg.requestId === 'string') {
    const p = pendingSteps.get(msg.requestId);
    if (!p) return;
    pendingSteps.delete(msg.requestId);
    if (msg.error) p.reject(new Error(String(msg.error)));
    else p.resolve(Array.isArray(msg.days) ? msg.days : []);
  } else if (msg.type === 'biometrics' && typeof msg.requestId === 'string') {
    const p = pendingBiometrics.get(msg.requestId);
    if (!p) return;
    pendingBiometrics.delete(msg.requestId);
    if (msg.error) {
      p.reject(new Error(String(msg.error)));
    } else {
      const days: HealthConnectBiometricDay[] = Array.isArray(msg.days) ? msg.days : [];
      const rawProfile = msg.profile && typeof msg.profile === 'object' ? msg.profile : {};
      const profile: HealthConnectProfileData = {
        ...(rawProfile.heightCm !== undefined ? { heightCm: Number(rawProfile.heightCm) } : {}),
        ...(msg.latestHeightCm !== undefined && rawProfile.heightCm === undefined ? { heightCm: Number(msg.latestHeightCm) } : {}),
        ...(msg.heightCm !== undefined && rawProfile.heightCm === undefined && msg.latestHeightCm === undefined ? { heightCm: Number(msg.heightCm) } : {}),
        ...(rawProfile.gender !== undefined ? { gender: rawProfile.gender } : msg.gender !== undefined ? { gender: msg.gender } : {}),
        ...(rawProfile.sex !== undefined ? { sex: String(rawProfile.sex) } : msg.sex !== undefined ? { sex: String(msg.sex) } : {}),
        ...(rawProfile.age !== undefined ? { age: Number(rawProfile.age) } : msg.age !== undefined ? { age: Number(msg.age) } : {}),
        ...(rawProfile.birthDate !== undefined
          ? { birthDate: String(rawProfile.birthDate) }
          : msg.birthDate !== undefined
          ? { birthDate: String(msg.birthDate) }
          : {}),
      };
      p.resolve({
        days,
        profile: Object.keys(profile).length > 0 ? profile : undefined,
      });
    }
  }
}

/**
 * Takes the channel Chrome hands the page. Chrome sends it in a window message with empty data, from
 * `android-app://<site>` once Digital Asset Links has verified the app; the app's hello then arrives
 * on the channel itself. Other senders are ignored. Returns whether the channel was accepted.
 */
export function receiveAppChannel(
  event: Pick<MessageEvent, 'origin' | 'data' | 'ports'>,
  pageOrigin: string,
  pageHost: string
): boolean {
  if (event.origin !== pageOrigin && event.origin !== `android-app://${pageHost}`) return false;
  const channel = event.ports?.[0];
  if (!channel) return false;
  const readHello = (data: unknown): boolean => {
    let hello: any;
    try {
      hello = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      return false;
    }
    if (hello?.type !== 'hello') return false;
    attachAppPort(channel, Number(hello.version) || 1);
    return true;
  };
  if (!readHello(event.data)) channel.onmessage = (e) => void readHello(e.data);
  return true;
}

/** Starts listening for the Android TWA or iOS WKWebView HealthKit bridge. Safe to call more than once. */
export function startHealthConnectBridge(): void {
  if (typeof window === 'undefined') return;
  const wkHandler = (window as any).webkit?.messageHandlers?.treiseHealth as IosWebKitHealthHandler | undefined;
  if (wkHandler && typeof wkHandler.postMessage === 'function' && iosHandler !== wkHandler) {
    attachIosHealthHandler(wkHandler, 5);
  }
  if (started) return;
  started = true;
  (window as any).__treiseReceiveNativeMessage = (payload: unknown) => {
    handleAppMessage(payload);
  };
  window.addEventListener('message', (event: MessageEvent) => {
    receiveAppChannel(event, window.location.origin, window.location.hostname);
  });
  const refreshStatus = () => {
    if (isAppBridgeReady()) send({ type: 'status' });
  };
  window.addEventListener('focus', refreshStatus);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshStatus();
    });
  }
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

/** Opens the OS health permission sheet (HealthKit on iOS, Health Connect on Android). */
export function requestHealthConnectPermission(): boolean {
  if (iosHandler) {
    send({ type: 'request-permission' });
    return true;
  }
  if (!canOpenAppScreens()) {
    send({ type: 'request-permission' });
    return false;
  }
  openAppScreen('health');
  return true;
}

/** Bridge version 3 and up (or any iOS HealthKit bridge): the page opens the app's permission screens itself. */
export function canOpenAppScreens(): boolean {
  return iosHandler !== null || getAppBridgeVersion() >= 3;
}

/**
 * Opens one of the app's screens from a tap on the page. Android blocks the app from opening its
 * own screen while Chrome is in front ("background activity launch"), but Chrome may open one for
 * the page, so these go through the browser.
 */
export function openAppScreen(screen: 'health' | 'nearby' | 'app-settings'): void {
  if (iosHandler) {
    send({ type: screen === 'health' ? 'request-permission' : screen });
    return;
  }
  window.location.href = `intent://${screen}#Intent;scheme=treise;package=com.headstrong.app;end`;
}

/** Exercise sessions since `since`, as the app read them from Health Connect or Apple HealthKit. */
export function readHealthConnectSessions(since: Date, timeoutMs = 20000): Promise<RawSourceSession[]> {
  if (!isAppBridgeReady() || !status.granted) return Promise.resolve([]);
  const requestId = `hc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    send({ type: 'read-sessions', requestId, since: since.toISOString() });
    setTimeout(() => {
      if (pending.delete(requestId)) reject(new Error('Health bridge did not answer'));
    }, timeoutMs);
  });
}

/** Daily step counts since `since`, aggregated per local calendar day by Health Connect or Apple HealthKit. */
export function readHealthConnectSteps(since: Date, timeoutMs = 20000): Promise<DailyStepRecord[]> {
  if (!isAppBridgeReady() || (!iosHandler && appVersion < 4) || !status.stepsGranted) return Promise.resolve([]);
  const requestId = `hc-steps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pendingSteps.set(requestId, { resolve, reject });
    send({ type: 'read-steps', requestId, since: since.toISOString() });
    setTimeout(() => {
      if (pendingSteps.delete(requestId)) reject(new Error('Health bridge did not answer'));
    }, timeoutMs);
  });
}

/**
 * Daily biometric metrics (sleep, resting HR, HRV, weight, height, body fat) plus any
 * available profile demographics (height, sex, age/birthDate) read natively from Android Health
 * Connect or iOS Apple HealthKit (bridge v5+ on Android, all versions on iOS).
 */
export function readHealthConnectBiometricsWithProfile(
  since: Date,
  timeoutMs = 20000
): Promise<HealthConnectBiometricsResult> {
  if (!isAppBridgeReady() || (!iosHandler && appVersion < 5) || !(status.biometricsGranted || status.heightGranted)) {
    return Promise.resolve({ days: [] });
  }
  const requestId = `hc-bio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pendingBiometrics.set(requestId, { resolve, reject });
    send({ type: 'read-biometrics', requestId, since: since.toISOString() });
    setTimeout(() => {
      if (pendingBiometrics.delete(requestId)) reject(new Error('Health bridge did not answer'));
    }, timeoutMs);
  });
}

/**
 * Daily biometric metrics (sleep, resting HR, HRV RMSSD, weight, height, body fat) since `since`,
 * read natively from Android Health Connect (bridge v5+) so Fitbit and Pixel Watch data flows
 * through the OS hub automatically.
 */
export function readHealthConnectBiometrics(
  since: Date,
  timeoutMs = 20000
): Promise<HealthConnectBiometricDay[]> {
  return readHealthConnectBiometricsWithProfile(since, timeoutMs).then((res) => res.days);
}
