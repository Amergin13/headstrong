import type {
  WebBluetoothCharacteristic,
  WebBluetoothDevice,
  WebBluetoothGattServer,
  WebBluetoothService,
} from './renphoBluetooth';
import { getAppBridgeVersion, onAppMessage, sendAppMessage } from './healthConnectBridge';

/**
 * The Renpho scale through the Treise Android app.
 *
 * Web Bluetooth forgets a device when the app restarts (getDevices() is behind a flag on stable
 * Chrome), so inside the Android app the scale is reached natively: pair once, then listening needs
 * no prompt. The app only moves bytes (ScaleBridge.kt). This file wraps it as a Web Bluetooth device,
 * so packet decoding and weigh-in logic in renphoBluetooth.ts are the same on both paths. The paired
 * scale is remembered in the page's saved devices, like any other device.
 *
 * Messages (JSON, on the app's message channel):
 *   page -> app  {type:'ble-status'}                 app -> page {type:'ble-status', supported, granted, enabled}
 *   page -> app  {type:'ble-request-permission'}     Android's Nearby devices prompt; a ble-status follows
 *   page -> app  {type:'ble-open-settings'}          Treise's Android settings page
 *   page -> app  {type:'ble-scan-start', all?}       app -> page {type:'ble-found', id, name} …, {type:'ble-scan-ended', error?}
 *   page -> app  {type:'ble-scan-stop'}
 *   page -> app  {type:'ble-listen', id}             waits for the scale to wake, then
 *                                                    app -> page {type:'ble-connected', id, name, services} or {type:'ble-listen-failed'}
 *   page -> app  {type:'ble-stop'}                   stops listening and disconnects
 *   page -> app  {type:'ble-notify', requestId, service, char}
 *   page -> app  {type:'ble-write', requestId, service, char, hex, withResponse}
 *                                                    app -> page {type:'ble-op', requestId, ok}
 *   app -> page  {type:'ble-value', service, char, hex}, {type:'ble-disconnected'}
 */

export interface NativeScaleStatus {
  supported: boolean;
  /** Android's Nearby devices permission. */
  granted: boolean;
  /** Bluetooth is switched on. */
  enabled: boolean;
}

export interface NativeScaleFound {
  id: string;
  name: string;
}

/** Only app versions that announce it can reach the scale; older installs keep using Web Bluetooth. */
export function isNativeScaleAvailable(): boolean {
  return getAppBridgeVersion() >= 2;
}

function nextMessage<T>(type: string, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const off = onAppMessage((msg) => {
      if (msg.type !== type) return;
      off();
      clearTimeout(timer);
      resolve(msg as T);
    });
    const timer = setTimeout(() => {
      off();
      resolve(fallback);
    }, timeoutMs);
  });
}

const NO_STATUS: NativeScaleStatus = { supported: false, granted: false, enabled: false };

export function getNativeScaleStatus(): Promise<NativeScaleStatus> {
  const answer = nextMessage('ble-status', 3000, NO_STATUS);
  sendAppMessage({ type: 'ble-status' });
  return answer;
}

/** Shows Android's permission prompt and resolves with the status after the athlete answers. */
export function requestNativeScalePermission(): Promise<NativeScaleStatus> {
  const answer = nextMessage('ble-status', 120000, NO_STATUS);
  sendAppMessage({ type: 'ble-request-permission' });
  return answer;
}

export function openNativeScaleSettings(): void {
  sendAppMessage({ type: 'ble-open-settings' });
}

/** Looks for nearby scales. Returns a function that stops looking. */
export function startNativeScaleScan(
  callbacks: { onFound: (scale: NativeScaleFound) => void; onEnded: (failed: boolean) => void },
  options: { showAll?: boolean } = {}
): () => void {
  const off = onAppMessage((msg) => {
    if (msg.type === 'ble-found') {
      callbacks.onFound({ id: String(msg.id), name: String(msg.name) });
    } else if (msg.type === 'ble-scan-ended') {
      off();
      callbacks.onEnded(Boolean(msg.error));
    }
  });
  sendAppMessage({ type: 'ble-scan-start', all: Boolean(options.showAll) });
  return () => {
    off();
    sendAppMessage({ type: 'ble-scan-stop' });
  };
}

/** A connect still waiting for the scale. Only one may wait: the app listens for one scale at a time. */
let cancelWaitingConnect: (() => void) | null = null;

/** Stops listening and disconnects (the form closed, or the scale was forgotten). */
export function stopNativeScale(): void {
  cancelWaitingConnect?.();
  sendAppMessage({ type: 'ble-stop' });
}

function toHex(payload: Uint8Array | BufferSource): string {
  const bytes =
    payload instanceof Uint8Array
      ? payload
      : ArrayBuffer.isView(payload)
      ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
      : new Uint8Array(payload as ArrayBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToDataView(hex: string): DataView {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new DataView(bytes.buffer);
}

let opCounter = 0;
function runOp(message: Record<string, unknown>): Promise<boolean> {
  const requestId = `ble-${++opCounter}`;
  return new Promise((resolve) => {
    const off = onAppMessage((msg) => {
      if (msg.type !== 'ble-op' || msg.requestId !== requestId) return;
      off();
      clearTimeout(timer);
      resolve(Boolean(msg.ok));
    });
    // The app answers within its own 5 s limit; this only covers a lost channel.
    const timer = setTimeout(() => {
      off();
      resolve(false);
    }, 10000);
    sendAppMessage({ ...message, requestId });
  });
}

/** A Web Bluetooth device whose connection is the Android app's. */
export function createNativeScaleDevice(id: string, name?: string): WebBluetoothDevice {
  const events = new EventTarget();
  let services: WebBluetoothService[] = [];
  const chars = new Map<string, WebBluetoothCharacteristic & EventTarget>();
  let offValues: (() => void) | null = null;
  let deviceName = name;

  const server: WebBluetoothGattServer = {
    connected: false,
    connect: () =>
      new Promise<WebBluetoothGattServer>((resolve, reject) => {
        cancelWaitingConnect?.();
        const finish = () => {
          off();
          cancelWaitingConnect = null;
        };
        cancelWaitingConnect = () => {
          finish();
          reject(new Error('Stopped listening for the scale.'));
        };
        const off = onAppMessage((msg) => {
          if (msg.type === 'ble-connected') {
            finish();
            server.connected = true;
            if (msg.name) {
              deviceName = String(msg.name);
              device.name = deviceName;
            }
            services = (msg.services || []).map((sv: any) => buildService(sv));
            startForwarding();
            resolve(server);
          } else if (msg.type === 'ble-listen-failed' || msg.type === 'ble-disconnected') {
            finish();
            reject(new Error('The scale could not be reached.'));
          }
        });
        sendAppMessage({ type: 'ble-listen', id });
      }),
    disconnect: () => {
      server.connected = false;
      offValues?.();
      offValues = null;
      sendAppMessage({ type: 'ble-stop' });
    },
    getPrimaryServices: async () => services,
    getPrimaryService: async (uuid) => {
      const found = services.find((sv) => sv.uuid === String(uuid));
      if (!found) throw new Error('Service not found');
      return found;
    },
  };

  const buildService = (sv: any): WebBluetoothService => {
    const serviceUuid = String(sv.uuid);
    const built = (sv.chars || []).map((c: any) => {
      const target = new EventTarget() as WebBluetoothCharacteristic & EventTarget;
      const charUuid = String(c.uuid);
      target.uuid = charUuid;
      target.properties = {
        notify: Boolean(c.notify),
        indicate: Boolean(c.indicate),
        write: Boolean(c.write),
        writeWithoutResponse: Boolean(c.writeWithoutResponse),
      };
      target.startNotifications = async () => {
        const ok = await runOp({ type: 'ble-notify', service: serviceUuid, char: charUuid });
        if (!ok) throw new Error('Could not subscribe');
        return target;
      };
      const write = (withResponse: boolean) => async (payload: Uint8Array | BufferSource) => {
        const ok = await runOp({ type: 'ble-write', service: serviceUuid, char: charUuid, hex: toHex(payload), withResponse });
        if (!ok) throw new Error('Write failed');
      };
      target.writeValueWithResponse = write(true);
      target.writeValueWithoutResponse = write(false);
      chars.set(`${serviceUuid}|${charUuid}`, target);
      return target;
    });
    return {
      uuid: serviceUuid,
      getCharacteristics: async () => built,
      getCharacteristic: async (uuid) => {
        const found = built.find((c: WebBluetoothCharacteristic) => c.uuid === String(uuid));
        if (!found) throw new Error('Characteristic not found');
        return found;
      },
    };
  };

  const startForwarding = () => {
    offValues?.();
    offValues = onAppMessage((msg) => {
      if (msg.type === 'ble-value') {
        const target = chars.get(`${msg.service}|${msg.char}`);
        if (!target) return;
        target.value = hexToDataView(String(msg.hex));
        target.dispatchEvent(new Event('characteristicvaluechanged'));
      } else if (msg.type === 'ble-disconnected') {
        server.connected = false;
        offValues?.();
        offValues = null;
        events.dispatchEvent(new Event('gattserverdisconnected'));
      }
    });
  };

  const device: WebBluetoothDevice = {
    id,
    name: deviceName,
    gatt: server,
    addEventListener: (type, listener) => events.addEventListener(type, listener),
    removeEventListener: (type, listener) => events.removeEventListener(type, listener),
  };
  return device;
}
