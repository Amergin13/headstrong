import { BiometricLog, BodyMeasurementSite } from '../engine/types';

export interface BodySiteDefinition {
  id: BodyMeasurementSite;
  field: keyof Pick<
    BiometricLog,
    | 'waistCm'
    | 'chestCm'
    | 'shouldersCm'
    | 'armCm'
    | 'forearmCm'
    | 'neckCm'
    | 'hipsCm'
    | 'thighCm'
    | 'calfCm'
  >;
  label: string;
  shortLabel: string;
  hint: string;
  minCm: number;
  maxCm: number;
  primary: boolean;
}

export const BODY_MEASUREMENT_SITES: readonly BodySiteDefinition[] = [
  {
    id: 'waist',
    field: 'waistCm',
    label: 'Waist',
    shortLabel: 'Waist',
    hint: 'Around the navel, relaxed exhale',
    minCm: 40,
    maxCm: 200,
    primary: true,
  },
  {
    id: 'chest',
    field: 'chestCm',
    label: 'Chest',
    shortLabel: 'Chest',
    hint: 'Across the fullest part of the chest, relaxed',
    minCm: 50,
    maxCm: 200,
    primary: true,
  },
  {
    id: 'arm',
    field: 'armCm',
    label: 'Upper arm (biceps)',
    shortLabel: 'Arm',
    hint: 'Peak of the flexed biceps on your dominant side',
    minCm: 15,
    maxCm: 80,
    primary: true,
  },
  {
    id: 'shoulders',
    field: 'shouldersCm',
    label: 'Shoulders',
    shortLabel: 'Shoulders',
    hint: 'Around the widest point of both deltoids',
    minCm: 70,
    maxCm: 220,
    primary: false,
  },
  {
    id: 'hips',
    field: 'hipsCm',
    label: 'Hips / Glutes',
    shortLabel: 'Hips',
    hint: 'Around the widest part of the glutes, feet together',
    minCm: 50,
    maxCm: 200,
    primary: false,
  },
  {
    id: 'thigh',
    field: 'thighCm',
    label: 'Thigh (quads)',
    shortLabel: 'Thigh',
    hint: 'Midpoint between the hip crease and kneecap',
    minCm: 30,
    maxCm: 120,
    primary: false,
  },
  {
    id: 'calf',
    field: 'calfCm',
    label: 'Calf',
    shortLabel: 'Calf',
    hint: 'Widest point of the gastrocnemius, standing',
    minCm: 20,
    maxCm: 80,
    primary: false,
  },
  {
    id: 'forearm',
    field: 'forearmCm',
    label: 'Forearm',
    shortLabel: 'Forearm',
    hint: 'Thickest part below the elbow, fist clenched',
    minCm: 15,
    maxCm: 65,
    primary: false,
  },
  {
    id: 'neck',
    field: 'neckCm',
    label: 'Neck',
    shortLabel: 'Neck',
    hint: 'Just below the larynx, shoulders relaxed',
    minCm: 20,
    maxCm: 75,
    primary: false,
  },
] as const;

export interface RenphoScaleReading {
  weightKg: number;
  bodyFatPct?: number;
  impedanceOhms?: number;
  stabilized: boolean;
  sourceProtocol: 'qn_scale' | 'icomon_scale' | 'ble_weight_scale' | 'ble_body_composition';
}

export interface RenphoTapeReading {
  lengthCm: number;
  stabilized: boolean;
  deviceUnit: 'cm' | 'in';
  sourceProtocol: 'renpho_ascii_tape' | 'renpho_binary_tape';
}

export interface RenphoBleConnection {
  deviceName: string;
  disconnect: () => void;
}

// GATT Service & Characteristic UUIDs for RENPHO Smart Scales & Tape Measures
export const RENPHO_SCALE_UUIDS = {
  // Yolanda / QN-Scale service & characteristics (ES-26M, ES-CS20M, ES-30M, etc.)
  QN_SERVICE_FFE0: 0xffe0,
  QN_NOTIFY_FFE1: 0xffe1,
  QN_NOTIFY_FFE2: 0xffe2,
  QN_WRITE_CONFIG_FFE3: 0xffe3,
  QN_WRITE_TIME_FFE4: 0xffe4,
  // Alternate QN / iCOMON services
  QN_SERVICE_FFF0: 0xfff0,
  QN_NOTIFY_FFF1: 0xfff1,
  QN_WRITE_FFF2: 0xfff2,
  ICOMON_SERVICE_FFB0: 0xffb0,
  ICOMON_NOTIFY_FFB2: 0xffb2,
  // Bluetooth SIG Standard Weight Scale & Body Composition
  BLE_WEIGHT_SCALE_SERVICE: 0x181d,
  BLE_WEIGHT_MEASUREMENT_CHAR: 0x2a9d,
  BLE_BODY_COMPOSITION_SERVICE: 0x181b,
  BLE_BODY_COMPOSITION_CHAR: 0x2a9c,
} as const;

export const RENPHO_TAPE_UUIDS = {
  // RENPHO Smart Body Tape Measure (RF-BMF01 / R-Y001 / R-Y002 / ES-T091 / ES_TAPE)
  TAPE_SERVICE: '0783b03e-8535-b5a0-7140-a304d2495cb7',
  TAPE_NOTIFY_CHAR: '0783b03e-8535-b5a0-7140-a304d2495cb8',
  TAPE_WRITE_CHAR: '0783b03e-8535-b5a0-7140-a304d2495cba',
  // Fallback UART-style services used by some smart tape firmware revisions
  FALLBACK_SERVICE_FFE0: 0xffe0,
  FALLBACK_NOTIFY_FFE1: 0xffe1,
  FALLBACK_SERVICE_FFF0: 0xfff0,
  FALLBACK_NOTIFY_FFF1: 0xfff1,
} as const;

const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;

function toUint8Array(data: Uint8Array | DataView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Builds the 9-byte QN-Scale configuration payload written to 0xFFE3 upon connection
 * so the RENPHO scale streams live & locked weight notifications on 0xFFE1/0xFFE2.
 */
export function buildQnScaleConfigPayload(unit: 'kg' | 'lb' = 'kg'): Uint8Array {
  const unitByte = unit === 'lb' ? 0x02 : 0x01;
  const payload = new Uint8Array([0x13, 0x09, 0x15, unitByte, 0x10, 0x00, 0x00, 0x00, 0x00]);
  let checksum = 0;
  for (let i = 0; i < payload.length - 1; i++) {
    checksum = (checksum + payload[i]) & 0xff;
  }
  payload[payload.length - 1] = checksum;
  return payload;
}

/**
 * Builds the 5-byte QN-Scale timestamp sync payload written to 0xFFE4 upon connection.
 * Epoch offset is seconds since 2000-01-01T00:00:00Z (946702800).
 */
export function buildQnScaleTimePayload(nowMs: number = Date.now()): Uint8Array {
  const QN_EPOCH_OFFSET = 946702800;
  const seconds = Math.max(0, Math.floor(nowMs / 1000) - QN_EPOCH_OFFSET);
  return new Uint8Array([
    0x02,
    seconds & 0xff,
    (seconds >> 8) & 0xff,
    (seconds >> 16) & 0xff,
    (seconds >> 24) & 0xff,
  ]);
}

/**
 * Decodes a GATT notification payload from a RENPHO Bluetooth scale.
 * Supports:
 * 1. QN-Scale / Yolanda (`0xFFE1` / `0xFFE2`) `0x10` & `0x14` packets
 * 2. iCOMON / RENPHO (`0xFFB2` / `0xFFF1`) `0xCF` / `0xFE` packets
 * 3. Standard Bluetooth SIG Weight Measurement (`0x2A9D`) SI & Imperial packets
 * 4. Standard Bluetooth SIG Body Composition Measurement (`0x2A9C`) packets
 */
export function decodeRenphoScalePacket(
  input: Uint8Array | DataView,
  characteristicUuid?: number | string
): RenphoScaleReading | null {
  const bytes = toUint8Array(input);
  if (bytes.length < 3) return null;

  const uuidStr = typeof characteristicUuid === 'string' ? characteristicUuid.toLowerCase() : '';
  const isStandardWeightChar =
    characteristicUuid === RENPHO_SCALE_UUIDS.BLE_WEIGHT_MEASUREMENT_CHAR ||
    uuidStr.includes('2a9d');
  const isStandardBodyCompChar =
    characteristicUuid === RENPHO_SCALE_UUIDS.BLE_BODY_COMPOSITION_CHAR ||
    uuidStr.includes('2a9c');

  // 1. Standard Bluetooth SIG Body Composition Measurement (0x2A9C)
  if (isStandardBodyCompChar && bytes.length >= 4) {
    const flags = bytes[0] | (bytes[1] << 8);
    const isImperial = (flags & 0x0001) !== 0;
    const rawBf = bytes[2] | (bytes[3] << 8);
    const bodyFatPct = Math.round(rawBf * 0.1 * 10) / 10;
    if (bodyFatPct <= 0 || bodyFatPct > 75) return null;

    // Optional weight field if bit 11 (0x0800) or trailing mass present
    let weightKg = 0;
    if (bytes.length >= 6) {
      const rawWeight = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
      const candidateKg = isImperial ? rawWeight * 0.01 * LB_TO_KG : rawWeight * 0.005;
      if (candidateKg >= 10 && candidateKg <= 300) {
        weightKg = Math.round(candidateKg * 100) / 100;
      }
    }
    return {
      weightKg,
      bodyFatPct,
      stabilized: true,
      sourceProtocol: 'ble_body_composition',
    };
  }

  // 2. Standard Bluetooth SIG Weight Scale Measurement (0x2A9D)
  if (isStandardWeightChar && bytes.length >= 3) {
    const flags = bytes[0];
    const isImperial = (flags & 0x01) !== 0;
    const raw = bytes[1] | (bytes[2] << 8);
    if (raw === 0 || raw === 0xffff) return null;
    const weightKg = isImperial ? raw * 0.01 * LB_TO_KG : raw * 0.005;
    if (weightKg < 5 || weightKg > 350) return null;
    return {
      weightKg: Math.round(weightKg * 100) / 100,
      stabilized: true,
      sourceProtocol: 'ble_weight_scale',
    };
  }

  // 3. QN-Scale / Yolanda protocol (0x10 or 0x14 header on 0xFFE1 / 0xFFE2)
  if ((bytes[0] === 0x10 || bytes[0] === 0x14) && bytes.length >= 6) {
    const scaleDivisor = bytes[2] === 0x01 ? 10 : 100;
    const rawWeight = ((bytes[3] & 0xff) << 8) | (bytes[4] & 0xff);
    if (rawWeight === 0) return null;
    const weightKg = rawWeight / scaleDivisor;
    if (weightKg < 5 || weightKg > 350) return null;

    const stateByte = bytes[5];
    const stabilized = stateByte === 0x01 || stateByte === 0x02;
    let impedanceOhms: number | undefined;
    if (bytes.length >= 8) {
      const rawImpedance = ((bytes[6] & 0xff) << 8) | (bytes[7] & 0xff);
      if (rawImpedance > 50 && rawImpedance < 3000) {
        impedanceOhms = rawImpedance;
      }
    }
    return {
      weightKg: Math.round(weightKg * 100) / 100,
      impedanceOhms,
      stabilized,
      sourceProtocol: 'qn_scale',
    };
  }

  // 4. iCOMON / alternate RENPHO scale frame (0xCF or 0xFE header, 16-bit weight at bytes[4..5] or [2..3])
  if ((bytes[0] === 0xcf || bytes[0] === 0xfe) && bytes.length >= 8) {
    const rawLe = bytes[4] | (bytes[5] << 8);
    const weightKg = rawLe / 100;
    if (weightKg >= 5 && weightKg <= 350) {
      const stabilized = bytes[1] === 0x00 || bytes[7] === 0x01;
      return {
        weightKg: Math.round(weightKg * 100) / 100,
        stabilized,
        sourceProtocol: 'icomon_scale',
      };
    }
  }

  // 5. Fallback: if no characteristic UUID was supplied and packet is 3 bytes matching 0x2A9D
  if (!characteristicUuid && bytes.length === 3 && (bytes[0] & 0xfe) === 0) {
    const isImperial = (bytes[0] & 0x01) !== 0;
    const raw = bytes[1] | (bytes[2] << 8);
    const weightKg = isImperial ? raw * 0.01 * LB_TO_KG : raw * 0.005;
    if (weightKg >= 10 && weightKg <= 300) {
      return {
        weightKg: Math.round(weightKg * 100) / 100,
        stabilized: true,
        sourceProtocol: 'ble_weight_scale',
      };
    }
  }

  return null;
}

/**
 * Decodes a GATT notification payload from a RENPHO Smart Body Tape Measure
 * (`RF-BMF01` / `R-Y001` / `R-Y002` / `ES-T091` / `ES_TAPE`).
 *
 * Supports:
 * 1. Official 20-byte ASCII frame on `0783b03e-8535-b5a0-7140-a304d2495cb8`:
 *    `*AAAAA;BBBBB;CCCC[P|S][M|I]\n`
 *    - `AAAAA` (bytes 1..5): integer in hundredths of a cm (e.g. `08510` = `85.10 cm`)
 *    - Byte 17: `'S'` (`0x53`) when locked via the physical confirm button on the tape,
 *               `'P'` (`0x50`) while actively pulling/retracting the tape.
 *    - Byte 18: `'M'` (`0x4D`) when the tape screen is in metric (`cm`),
 *               `'I'` (`0x49`) when the tape screen is in imperial (`in`).
 * 2. Flexible ASCII strings emitted by alternate tape firmware (e.g. `"85.1cm"`, `"33.5in"`).
 * 3. Binary millimeter frames (`[0xAA/0x55, ...]` with uint16 mm payload).
 */
export function decodeRenphoTapePacket(input: Uint8Array | DataView): RenphoTapeReading | null {
  const bytes = toUint8Array(input);
  if (bytes.length < 3) return null;

  // 1. RENPHO Smart Tape 20-byte ASCII frame starting with '*' (0x2A)
  if (bytes[0] === 0x2a && bytes.length >= 18) {
    // Parse bytes 1..5 as decimal digits (hundredths of a centimeter, or tenths of a millimeter)
    let rawHundredthsCm = 0;
    let validDigits = true;
    for (let i = 1; i <= 5; i++) {
      const b = bytes[i];
      if (b < 0x30 || b > 0x39) {
        validDigits = false;
        break;
      }
      rawHundredthsCm = rawHundredthsCm * 10 + (b - 0x30);
    }

    if (validDigits && rawHundredthsCm > 0) {
      const lengthCm = Math.round((rawHundredthsCm / 100) * 10) / 10;
      if (lengthCm < 1 || lengthCm > 300) return null;

      // Byte 17 is 'S' (0x53, bit 0 === 1) for locked/saved or 'P' (0x50, bit 0 === 0) for live preview
      const statusByte = bytes[17];
      const stabilized = statusByte === 0x53 || (statusByte & 0x01) === 1;
      const unitByte = bytes.length > 18 ? bytes[18] : 0x4d;
      const deviceUnit: 'cm' | 'in' = unitByte === 0x49 ? 'in' : 'cm';

      return {
        lengthCm,
        stabilized,
        deviceUnit,
        sourceProtocol: 'renpho_ascii_tape',
      };
    }
  }

  // 2. Check if packet is printable ASCII (e.g. "*08510..." or "85.2 cm S")
  let isPrintableAscii = true;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== 0x0a && b !== 0x0d && b !== 0x00 && (b < 0x20 || b > 0x7e)) {
      isPrintableAscii = false;
      break;
    }
  }

  if (isPrintableAscii) {
    const text = new TextDecoder('ascii').decode(bytes).trim();
    const starMatch = text.match(/^\*(\d{5});\d+;\d+([PS])([MI])?/i);
    if (starMatch) {
      const raw = parseInt(starMatch[1], 10);
      const lengthCm = Math.round((raw / 100) * 10) / 10;
      if (lengthCm >= 1 && lengthCm <= 300) {
        const stabilized = starMatch[2].toUpperCase() === 'S';
        const deviceUnit: 'cm' | 'in' =
          starMatch[3] && starMatch[3].toUpperCase() === 'I' ? 'in' : 'cm';
        return {
          lengthCm,
          stabilized,
          deviceUnit,
          sourceProtocol: 'renpho_ascii_tape',
        };
      }
    }

    const explicitUnitMatch = text.match(/(\d+(?:\.\d+)?)\s*(cm|mm|in|inch)/i);
    if (explicitUnitMatch) {
      const val = parseFloat(explicitUnitMatch[1]);
      const unitToken = explicitUnitMatch[2].toLowerCase();
      const lengthCm =
        unitToken === 'mm'
          ? val / 10
          : unitToken.startsWith('in')
          ? val * IN_TO_CM
          : val;
      if (lengthCm >= 1 && lengthCm <= 300) {
        return {
          lengthCm: Math.round(lengthCm * 10) / 10,
          stabilized: /\b(S|OK|LOCK)\b/i.test(text) || !/\bP\b/.test(text),
          deviceUnit: unitToken.startsWith('in') ? 'in' : 'cm',
          sourceProtocol: 'renpho_ascii_tape',
        };
      }
    }
  }

  // 3. Binary millimeter frame: [0xAA | 0x55 | 0xA5, cmd, mmHigh, mmLow, statusByte, unitByte?]
  if (
    (bytes[0] === 0xaa || bytes[0] === 0x55 || bytes[0] === 0xa5) &&
    bytes.length >= 5
  ) {
    const rawMm = ((bytes[2] & 0xff) << 8) | (bytes[3] & 0xff);
    const lengthCm = Math.round((rawMm / 10) * 10) / 10;
    if (lengthCm >= 1 && lengthCm <= 300) {
      const stabilized = bytes[4] === 0x01 || bytes[4] === 0x53;
      const deviceUnit: 'cm' | 'in' = bytes.length > 5 && bytes[5] === 0x01 ? 'in' : 'cm';
      return {
        lengthCm,
        stabilized,
        deviceUnit,
        sourceProtocol: 'renpho_binary_tape',
      };
    }
  }

  return null;
}

// Minimal Web Bluetooth navigator typings so we don't require external @types/web-bluetooth
interface WebBluetoothCharacteristic {
  uuid: string;
  properties?: {
    notify?: boolean;
    indicate?: boolean;
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  startNotifications: () => Promise<WebBluetoothCharacteristic>;
  stopNotifications?: () => Promise<WebBluetoothCharacteristic>;
  writeValue?: (value: Uint8Array | BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: Uint8Array | BufferSource) => Promise<void>;
  addEventListener: (type: string, listener: (ev: Event) => void) => void;
  value?: DataView;
}

interface WebBluetoothService {
  uuid: string;
  getCharacteristics: () => Promise<WebBluetoothCharacteristic[]>;
  getCharacteristic: (uuid: number | string) => Promise<WebBluetoothCharacteristic>;
}

interface WebBluetoothGattServer {
  connected: boolean;
  connect: () => Promise<WebBluetoothGattServer>;
  disconnect: () => void;
  getPrimaryServices: () => Promise<WebBluetoothService[]>;
  getPrimaryService: (uuid: number | string) => Promise<WebBluetoothService>;
}

interface WebBluetoothDevice {
  id: string;
  name?: string;
  gatt?: WebBluetoothGattServer;
  addEventListener: (type: string, listener: (ev: Event) => void) => void;
}

interface NavigatorWithBluetooth {
  bluetooth?: {
    requestDevice: (options: Record<string, unknown>) => Promise<WebBluetoothDevice>;
  };
}

export function isWebBluetoothSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as unknown as NavigatorWithBluetooth;
  return Boolean(nav.bluetooth && typeof nav.bluetooth.requestDevice === 'function');
}

async function safeWriteCharacteristic(
  characteristic: WebBluetoothCharacteristic,
  payload: Uint8Array
): Promise<void> {
  try {
    if (typeof characteristic.writeValueWithoutResponse === 'function') {
      await characteristic.writeValueWithoutResponse(payload);
      return;
    }
    if (typeof characteristic.writeValue === 'function') {
      await characteristic.writeValue(payload);
    }
  } catch {
    // Ignore optional init write errors on scales that auto-stream without handshake
  }
}

/**
 * Connects directly to a RENPHO Bluetooth scale via Web Bluetooth, subscribes to live and
 * locked weight notifications, and sends the QN-Scale wake/config handshake.
 */
export async function connectRenphoScale(
  callbacks: {
    onReading: (reading: RenphoScaleReading) => void;
    onStatus?: (status: string) => void;
    onDisconnect?: () => void;
  },
  options?: { acceptAllDevices?: boolean; unit?: 'kg' | 'lb' }
): Promise<RenphoBleConnection> {
  if (!isWebBluetoothSupported()) {
    throw new Error(
      'Web Bluetooth is not supported in this browser. Open Treise in Chrome on Android or desktop.'
    );
  }

  const nav = navigator as unknown as NavigatorWithBluetooth;
  const optionalServices: Array<number | string> = [
    RENPHO_SCALE_UUIDS.QN_SERVICE_FFE0,
    RENPHO_SCALE_UUIDS.QN_SERVICE_FFF0,
    RENPHO_SCALE_UUIDS.ICOMON_SERVICE_FFB0,
    RENPHO_SCALE_UUIDS.BLE_WEIGHT_SCALE_SERVICE,
    RENPHO_SCALE_UUIDS.BLE_BODY_COMPOSITION_SERVICE,
  ];

  const requestOptions: Record<string, unknown> = options?.acceptAllDevices
    ? {
        acceptAllDevices: true,
        optionalServices,
      }
    : {
        filters: [
          { namePrefix: 'QN-Scale' },
          { namePrefix: 'RENPHO' },
          { namePrefix: 'ES-' },
          { namePrefix: 'R-' },
          { services: [RENPHO_SCALE_UUIDS.QN_SERVICE_FFE0] },
          { services: [RENPHO_SCALE_UUIDS.BLE_WEIGHT_SCALE_SERVICE] },
          { services: [RENPHO_SCALE_UUIDS.BLE_BODY_COMPOSITION_SERVICE] },
        ],
        optionalServices,
      };

  callbacks.onStatus?.('Select your RENPHO scale in the Bluetooth prompt…');
  const device = await nav.bluetooth!.requestDevice(requestOptions);
  const deviceName = device.name || 'RENPHO Scale';

  device.addEventListener('gattserverdisconnected', () => {
    callbacks.onDisconnect?.();
  });

  if (!device.gatt) {
    throw new Error('Selected Bluetooth device does not expose a GATT server.');
  }

  callbacks.onStatus?.(`Connecting to ${deviceName}… Step onto the scale to wake it.`);
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  let subscribedCount = 0;
  for (const service of services) {
    let chars: WebBluetoothCharacteristic[] = [];
    try {
      chars = await service.getCharacteristics();
    } catch {
      continue;
    }

    for (const char of chars) {
      const uuidLower = char.uuid.toLowerCase();
      const canNotify =
        char.properties?.notify ||
        char.properties?.indicate ||
        uuidLower.includes('ffe1') ||
        uuidLower.includes('ffe2') ||
        uuidLower.includes('fff1') ||
        uuidLower.includes('ffb2') ||
        uuidLower.includes('2a9d') ||
        uuidLower.includes('2a9c');

      if (canNotify) {
        try {
          await char.startNotifications();
          char.addEventListener('characteristicvaluechanged', (event: Event) => {
            const target = event.target as unknown as WebBluetoothCharacteristic;
            if (!target?.value) return;
            const reading = decodeRenphoScalePacket(target.value, char.uuid);
            if (reading) {
              callbacks.onReading(reading);
            }
          });
          subscribedCount++;
        } catch {
          // Continue checking other characteristics
        }
      }

      // Send QN-Scale config and timestamp packets if write characteristics are present
      if (uuidLower.includes('ffe3') || uuidLower.includes('fff2')) {
        await safeWriteCharacteristic(char, buildQnScaleConfigPayload(options?.unit ?? 'kg'));
      } else if (uuidLower.includes('ffe4')) {
        await safeWriteCharacteristic(char, buildQnScaleTimePayload());
      }
    }
  }

  if (subscribedCount === 0) {
    server.disconnect();
    throw new Error(
      `Connected to ${deviceName}, but no scale weight stream was found. Step onto the scale so its display turns on and try again.`
    );
  }

  callbacks.onStatus?.(`Connected to ${deviceName}. Step onto the scale until the weight locks.`);

  return {
    deviceName,
    disconnect: () => {
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    },
  };
}

/**
 * Connects directly to a RENPHO Smart Body Tape Measure (`RF-BMF01`, `R-Y001`, `ES-T091`, `ES_TAPE`)
 * via Web Bluetooth and streams live + button-locked circumference readings in real time.
 */
export async function connectRenphoTape(
  callbacks: {
    onReading: (reading: RenphoTapeReading) => void;
    onStatus?: (status: string) => void;
    onDisconnect?: () => void;
  },
  options?: { acceptAllDevices?: boolean }
): Promise<RenphoBleConnection> {
  if (!isWebBluetoothSupported()) {
    throw new Error(
      'Web Bluetooth is not supported in this browser. Open Treise in Chrome on Android or desktop.'
    );
  }

  const nav = navigator as unknown as NavigatorWithBluetooth;
  const optionalServices: Array<number | string> = [
    RENPHO_TAPE_UUIDS.TAPE_SERVICE,
    RENPHO_TAPE_UUIDS.FALLBACK_SERVICE_FFE0,
    RENPHO_TAPE_UUIDS.FALLBACK_SERVICE_FFF0,
  ];

  const requestOptions: Record<string, unknown> = options?.acceptAllDevices
    ? {
        acceptAllDevices: true,
        optionalServices,
      }
    : {
        filters: [
          { services: [RENPHO_TAPE_UUIDS.TAPE_SERVICE] },
          { namePrefix: 'ES_TAPE' },
          { namePrefix: 'ES-T' },
          { namePrefix: 'RF-BMF' },
          { namePrefix: 'R-Y00' },
          { namePrefix: 'RENPHO' },
        ],
        optionalServices,
      };

  callbacks.onStatus?.('Select your RENPHO smart tape in the Bluetooth prompt…');
  const device = await nav.bluetooth!.requestDevice(requestOptions);
  const deviceName = device.name || 'RENPHO Smart Tape';

  device.addEventListener('gattserverdisconnected', () => {
    callbacks.onDisconnect?.();
  });

  if (!device.gatt) {
    throw new Error('Selected Bluetooth device does not expose a GATT server.');
  }

  callbacks.onStatus?.(`Connecting to ${deviceName}…`);
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  let subscribedCount = 0;
  for (const service of services) {
    let chars: WebBluetoothCharacteristic[] = [];
    try {
      chars = await service.getCharacteristics();
    } catch {
      continue;
    }

    for (const char of chars) {
      const uuidLower = char.uuid.toLowerCase();
      const canNotify =
        char.properties?.notify ||
        char.properties?.indicate ||
        uuidLower === RENPHO_TAPE_UUIDS.TAPE_NOTIFY_CHAR ||
        uuidLower.includes('5cb8') ||
        uuidLower.includes('ffe1') ||
        uuidLower.includes('fff1');

      if (canNotify) {
        try {
          await char.startNotifications();
          char.addEventListener('characteristicvaluechanged', (event: Event) => {
            const target = event.target as unknown as WebBluetoothCharacteristic;
            if (!target?.value) return;
            const reading = decodeRenphoTapePacket(target.value);
            if (reading) {
              callbacks.onReading(reading);
            }
          });
          subscribedCount++;
        } catch {
          // Try next characteristic
        }
      }
    }
  }

  if (subscribedCount === 0) {
    server.disconnect();
    throw new Error(
      `Connected to ${deviceName}, but no tape measurement stream was found. Press a button on the tape measure to wake it and try again.`
    );
  }

  callbacks.onStatus?.(
    `Connected to ${deviceName}. Pull the tape around the selected body area and press the confirm button on the tape.`
  );

  return {
    deviceName,
    disconnect: () => {
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    },
  };
}
