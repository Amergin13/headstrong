import { BiometricLog, BodyMeasurementSite, Gender } from '../engine/types';
import { localDateString } from '../utils/date';

export type TapeMeasurementField = keyof Pick<
  BiometricLog,
  | 'neckCm'
  | 'shouldersCm'
  | 'chestCm'
  | 'waistCm'
  | 'abdomenCm'
  | 'hipsCm'
  | 'bicepLeftCm'
  | 'bicepRightCm'
  | 'thighLeftCm'
  | 'thighRightCm'
  | 'calfLeftCm'
  | 'calfRightCm'
>;

export interface BodySiteDefinition {
  id: BodyMeasurementSite;
  field: TapeMeasurementField;
  label: string;
  shortLabel: string;
  hint: string;
  minCm: number;
  maxCm: number;
  primary: boolean;
}

/**
 * All 12 circumference sites captured by the RENPHO Smart Body Tape Measure,
 * also available for manual entry at any time.
 */
export const BODY_MEASUREMENT_SITES: readonly BodySiteDefinition[] = [
  {
    id: 'neck',
    field: 'neckCm',
    label: 'Neck',
    shortLabel: 'Neck',
    hint: 'Just below the larynx, shoulders relaxed',
    minCm: 20,
    maxCm: 75,
    primary: true,
  },
  {
    id: 'shoulder',
    field: 'shouldersCm',
    label: 'Shoulder',
    shortLabel: 'Shoulder',
    hint: 'Around the widest point of both deltoids',
    minCm: 70,
    maxCm: 220,
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
    id: 'waist',
    field: 'waistCm',
    label: 'Waist',
    shortLabel: 'Waist',
    hint: 'Around the narrowest part of the natural waist, relaxed exhale',
    minCm: 40,
    maxCm: 200,
    primary: true,
  },
  {
    id: 'abdomen',
    field: 'abdomenCm',
    label: 'Abdomen',
    shortLabel: 'Abdomen',
    hint: 'Around the navel at the fullest part of the abdomen, relaxed',
    minCm: 40,
    maxCm: 210,
    primary: true,
  },
  {
    id: 'hip',
    field: 'hipsCm',
    label: 'Hip',
    shortLabel: 'Hip',
    hint: 'Around the widest part of the hips and glutes, feet together',
    minCm: 50,
    maxCm: 200,
    primary: true,
  },
  {
    id: 'bicep_left',
    field: 'bicepLeftCm',
    label: 'Bicep left',
    shortLabel: 'Bicep L',
    hint: 'Peak of the flexed left biceps',
    minCm: 15,
    maxCm: 80,
    primary: false,
  },
  {
    id: 'bicep_right',
    field: 'bicepRightCm',
    label: 'Bicep right',
    shortLabel: 'Bicep R',
    hint: 'Peak of the flexed right biceps',
    minCm: 15,
    maxCm: 80,
    primary: false,
  },
  {
    id: 'thigh_left',
    field: 'thighLeftCm',
    label: 'Thigh left',
    shortLabel: 'Thigh L',
    hint: 'Midpoint between the left hip crease and kneecap',
    minCm: 30,
    maxCm: 120,
    primary: false,
  },
  {
    id: 'thigh_right',
    field: 'thighRightCm',
    label: 'Thigh right',
    shortLabel: 'Thigh R',
    hint: 'Midpoint between the right hip crease and kneecap',
    minCm: 30,
    maxCm: 120,
    primary: false,
  },
  {
    id: 'calf_left',
    field: 'calfLeftCm',
    label: 'Calf left',
    shortLabel: 'Calf L',
    hint: 'Widest point of the left calf, standing',
    minCm: 20,
    maxCm: 80,
    primary: false,
  },
  {
    id: 'calf_right',
    field: 'calfRightCm',
    label: 'Calf right',
    shortLabel: 'Calf R',
    hint: 'Widest point of the right calf, standing',
    minCm: 20,
    maxCm: 80,
    primary: false,
  },
] as const;

export type RenphoScaleMetricId =
  | 'weight'
  | 'bmi'
  | 'body_fat'
  | 'fat_free_mass'
  | 'subcutaneous_fat'
  | 'visceral_fat'
  | 'body_water'
  | 'skeletal_muscle_mass'
  | 'muscle_mass'
  | 'bone_mass'
  | 'protein_mass'
  | 'bmr'
  | 'metabolic_age';

export type RenphoScaleMetricField =
  | 'bodyweightKg'
  | 'bmi'
  | 'bodyFatPct'
  | 'fatFreeMassKg'
  | 'subcutaneousFatPct'
  | 'visceralFat'
  | 'bodyWaterPct'
  | 'skeletalMuscleMassKg'
  | 'muscleMassKg'
  | 'boneMassKg'
  | 'proteinMassKg'
  | 'bmrKcal'
  | 'metabolicAge';

export type RenphoScaleMetricUnitKind = 'weight' | 'bmi' | 'percent' | 'index' | 'kcal' | 'years';

export interface RenphoScaleMetricDefinition {
  id: RenphoScaleMetricId;
  field: RenphoScaleMetricField;
  label: string;
  shortLabel: string;
  unitKind: RenphoScaleMetricUnitKind;
  min: number;
  max: number;
  manualPrimary: boolean;
  description: string;
}

/**
 * All 13 body composition metrics measured by RENPHO Health Scales.
 * Weight and Body Fat % are also highlighted for standalone manual entry without the scale.
 */
export const RENPHO_SCALE_METRICS: readonly RenphoScaleMetricDefinition[] = [
  {
    id: 'weight',
    field: 'bodyweightKg',
    label: 'Weight',
    shortLabel: 'Weight',
    unitKind: 'weight',
    min: 20,
    max: 300,
    manualPrimary: true,
    description: 'Total body mass smoothed by a 7-day Exponential Moving Average (EMA).',
  },
  {
    id: 'bmi',
    field: 'bmi',
    label: 'BMI',
    shortLabel: 'BMI',
    unitKind: 'bmi',
    min: 10,
    max: 65,
    manualPrimary: false,
    description: 'Body Mass Index (weight in kg divided by height in meters squared).',
  },
  {
    id: 'body_fat',
    field: 'bodyFatPct',
    label: 'Body fat percentage',
    shortLabel: 'Body fat',
    unitKind: 'percent',
    min: 3,
    max: 65,
    manualPrimary: true,
    description: 'Proportion of total body mass composed of adipose tissue.',
  },
  {
    id: 'fat_free_mass',
    field: 'fatFreeMassKg',
    label: 'Fat free mass',
    shortLabel: 'Fat-free mass',
    unitKind: 'weight',
    min: 15,
    max: 220,
    manualPrimary: false,
    description: 'Total lean mass excluding fat (skeletal muscle, organs, body water, and bone).',
  },
  {
    id: 'subcutaneous_fat',
    field: 'subcutaneousFatPct',
    label: 'Subcutaneous fat',
    shortLabel: 'Subcut. fat',
    unitKind: 'percent',
    min: 2,
    max: 55,
    manualPrimary: false,
    description: 'Adipose tissue stored directly beneath the skin surface.',
  },
  {
    id: 'visceral_fat',
    field: 'visceralFat',
    label: 'Visceral fat',
    shortLabel: 'Visceral fat',
    unitKind: 'index',
    min: 1,
    max: 30,
    manualPrimary: false,
    description: 'Visceral fat rating around internal organs (1–9 healthy range).',
  },
  {
    id: 'body_water',
    field: 'bodyWaterPct',
    label: 'Body water',
    shortLabel: 'Body water',
    unitKind: 'percent',
    min: 30,
    max: 80,
    manualPrimary: false,
    description: 'Total body water as a percentage of body weight (intracellular + extracellular hydration).',
  },
  {
    id: 'skeletal_muscle_mass',
    field: 'skeletalMuscleMassKg',
    label: 'Skeletal muscle mass',
    shortLabel: 'Skeletal muscle',
    unitKind: 'weight',
    min: 10,
    max: 150,
    manualPrimary: false,
    description: 'Striated contractile muscle attached to the skeleton driving strength and hypertrophy.',
  },
  {
    id: 'muscle_mass',
    field: 'muscleMassKg',
    label: 'Muscle mass',
    shortLabel: 'Muscle mass',
    unitKind: 'weight',
    min: 15,
    max: 200,
    manualPrimary: false,
    description: 'Total soft lean tissue mass (skeletal muscle, smooth muscle, and cellular water).',
  },
  {
    id: 'bone_mass',
    field: 'boneMassKg',
    label: 'Bone mass',
    shortLabel: 'Bone mass',
    unitKind: 'weight',
    min: 1,
    max: 10,
    manualPrimary: false,
    description: 'Estimated skeletal bone mineral mass.',
  },
  {
    id: 'protein_mass',
    field: 'proteinMassKg',
    label: 'Protein mass',
    shortLabel: 'Protein mass',
    unitKind: 'weight',
    min: 3,
    max: 60,
    manualPrimary: false,
    description: 'Total structural and contractile cellular protein mass.',
  },
  {
    id: 'bmr',
    field: 'bmrKcal',
    label: 'Basal metabolic rate',
    shortLabel: 'BMR',
    unitKind: 'kcal',
    min: 800,
    max: 5000,
    manualPrimary: false,
    description: 'Daily resting energy expenditure (kcal/day) driven by fat-free mass.',
  },
  {
    id: 'metabolic_age',
    field: 'metabolicAge',
    label: 'Metabolic age',
    shortLabel: 'Metabolic age',
    unitKind: 'years',
    min: 12,
    max: 90,
    manualPrimary: false,
    description: 'Comparison of your basal metabolic efficiency and lean mass ratio against age norms.',
  },
] as const;

export interface RenphoScaleMetrics {
  bodyweightKg: number;
  bmi?: number;
  bodyFatPct?: number;
  fatFreeMassKg?: number;
  subcutaneousFatPct?: number;
  visceralFat?: number;
  bodyWaterPct?: number;
  skeletalMuscleMassKg?: number;
  muscleMassKg?: number;
  boneMassKg?: number;
  proteinMassKg?: number;
  bmrKcal?: number;
  metabolicAge?: number;
}

export interface RenphoScaleReading {
  weightKg: number;
  bodyFatPct?: number;
  impedanceOhms?: number;
  bmi?: number;
  fatFreeMassKg?: number;
  subcutaneousFatPct?: number;
  visceralFat?: number;
  bodyWaterPct?: number;
  skeletalMuscleMassKg?: number;
  muscleMassKg?: number;
  boneMassKg?: number;
  proteinMassKg?: number;
  bmrKcal?: number;
  metabolicAge?: number;
  metrics?: RenphoScaleMetrics;
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
  deviceId: string;
  deviceName: string;
  reconnectedFromMemory: boolean;
  disconnect: () => void;
}

export interface SavedRenphoDeviceInfo {
  id: string;
  name: string;
  kind: 'scale' | 'tape';
  pairedAt: string;
  lastSyncedAt?: string;
  lastSummary?: string;
}

export interface SavedRenphoDevices {
  scale?: SavedRenphoDeviceInfo;
  tape?: SavedRenphoDeviceInfo;
}

export const SAVED_RENPHO_DEVICES_KEY = 'treise_renpho_devices_v1';

export function loadSavedRenphoDevices(): SavedRenphoDevices {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SAVED_RENPHO_DEVICES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedRenphoDevices;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function savePairedRenphoDevice(info: SavedRenphoDeviceInfo): SavedRenphoDevices {
  const current = loadSavedRenphoDevices();
  const next: SavedRenphoDevices = {
    ...current,
    [info.kind]: {
      ...current[info.kind],
      ...info,
    },
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SAVED_RENPHO_DEVICES_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

export function recordRenphoDeviceSync(
  kind: 'scale' | 'tape',
  summary: string
): SavedRenphoDevices {
  const current = loadSavedRenphoDevices();
  const existing = current[kind];
  const next: SavedRenphoDevices = {
    ...current,
    [kind]: {
      id: existing?.id || kind,
      name: existing?.name || (kind === 'scale' ? 'RENPHO Scale' : 'RENPHO Smart Tape'),
      kind,
      pairedAt: existing?.pairedAt || localDateString(),
      lastSyncedAt: localDateString(),
      lastSummary: summary,
    },
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SAVED_RENPHO_DEVICES_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

export function forgetPairedRenphoDevice(kind: 'scale' | 'tape'): SavedRenphoDevices {
  if (kind === 'scale') {
    if (cachedScaleDevice?.gatt?.connected) {
      cachedScaleDevice.gatt.disconnect();
    }
    cachedScaleDevice = null;
  } else {
    if (cachedTapeDevice?.gatt?.connected) {
      cachedTapeDevice.gatt.disconnect();
    }
    cachedTapeDevice = null;
  }
  const current = loadSavedRenphoDevices();
  const next: SavedRenphoDevices = { ...current };
  delete next[kind];
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SAVED_RENPHO_DEVICES_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

export function clearSavedRenphoDevices(): void {
  if (cachedScaleDevice?.gatt?.connected) cachedScaleDevice.gatt.disconnect();
  if (cachedTapeDevice?.gatt?.connected) cachedTapeDevice.gatt.disconnect();
  cachedScaleDevice = null;
  cachedTapeDevice = null;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(SAVED_RENPHO_DEVICES_KEY);
    } catch {
      // Ignore errors
    }
  }
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

export interface RenphoAthleteContext {
  heightCm?: number;
  measuredHeightCm?: number;
  age?: number;
  gender?: 'male' | 'female';
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Collects the body composition values a RENPHO scale reading actually contains.
 *
 * Only measured values are returned: weight, anything the scale itself sent (body fat,
 * water, muscle, …), fat-free mass when weight and body fat are both measured, and BMI
 * when the athlete entered their height. Nothing is estimated from placeholder age, sex
 * or height, and metrics the scale did not send stay undefined (shown as "—").
 */
export function computeRenphoScaleMetrics(
  reading: Pick<
    RenphoScaleReading,
    | 'weightKg'
    | 'bodyFatPct'
    | 'bmi'
    | 'fatFreeMassKg'
    | 'subcutaneousFatPct'
    | 'visceralFat'
    | 'bodyWaterPct'
    | 'skeletalMuscleMassKg'
    | 'muscleMassKg'
    | 'boneMassKg'
    | 'proteinMassKg'
    | 'bmrKcal'
    | 'metabolicAge'
  >,
  athlete?: RenphoAthleteContext
): RenphoScaleMetrics | undefined {
  const weightKg = reading.weightKg;
  if (!Number.isFinite(weightKg) || weightKg < 5 || weightKg > 350) {
    return undefined;
  }
  const inRange = (val: number | undefined, min: number, max: number) =>
    typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max ? val : undefined;

  const heightCm = inRange(athlete?.measuredHeightCm, 100, 250);
  const bodyFatPct = inRange(reading.bodyFatPct, 2, 70);
  const sentBmi = inRange(reading.bmi, 8, 80);
  const bmi =
    sentBmi !== undefined
      ? round1(sentBmi)
      : heightCm !== undefined
      ? round1(weightKg / (heightCm / 100) ** 2)
      : undefined;
  const sentFfm = inRange(reading.fatFreeMassKg, 15, 300);
  const fatFreeMassKg =
    sentFfm !== undefined
      ? round1(sentFfm)
      : bodyFatPct !== undefined
      ? round1(weightKg * (1 - bodyFatPct / 100))
      : undefined;
  const opt1 = (val: number | undefined, min: number, max: number) => {
    const v = inRange(val, min, max);
    return v === undefined ? undefined : round1(v);
  };
  const boneMass = inRange(reading.boneMassKg, 1, 10);
  const bmr = inRange(reading.bmrKcal, 700, 6000);
  const metabolicAge = inRange(reading.metabolicAge, 12, 100);

  return {
    bodyweightKg: round1(weightKg),
    bmi,
    bodyFatPct: bodyFatPct === undefined ? undefined : round1(bodyFatPct),
    fatFreeMassKg,
    subcutaneousFatPct: opt1(reading.subcutaneousFatPct, 1, 70),
    visceralFat: opt1(reading.visceralFat, 1, 60),
    bodyWaterPct: opt1(reading.bodyWaterPct, 25, 80),
    skeletalMuscleMassKg: opt1(reading.skeletalMuscleMassKg, 8, 150),
    muscleMassKg: opt1(reading.muscleMassKg, 10, 200),
    boneMassKg: boneMass === undefined ? undefined : round2(boneMass),
    proteinMassKg: opt1(reading.proteinMassKg, 2, 60),
    bmrKcal: bmr === undefined ? undefined : Math.round(bmr),
    metabolicAge: metabolicAge === undefined ? undefined : Math.round(metabolicAge),
  };
}

function withScaleMetrics(
  reading: RenphoScaleReading,
  athlete?: RenphoAthleteContext
): RenphoScaleReading {
  if (reading.weightKg <= 0) return reading;
  const metrics = computeRenphoScaleMetrics(reading, athlete);
  if (!metrics) return reading;
  return {
    ...reading,
    bmi: reading.bmi ?? metrics.bmi,
    fatFreeMassKg: reading.fatFreeMassKg ?? metrics.fatFreeMassKg,
    metrics,
  };
}

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
  characteristicUuid?: number | string,
  athlete?: RenphoAthleteContext
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
    const baseReading: RenphoScaleReading = {
      weightKg,
      bodyFatPct,
      stabilized: true,
      sourceProtocol: 'ble_body_composition',
    };
    return withScaleMetrics(baseReading, athlete);
  }

  // 2. Standard Bluetooth SIG Weight Scale Measurement (0x2A9D)
  if (isStandardWeightChar && bytes.length >= 3) {
    const flags = bytes[0];
    const isImperial = (flags & 0x01) !== 0;
    const raw = bytes[1] | (bytes[2] << 8);
    if (raw === 0 || raw === 0xffff) return null;
    const weightKg = isImperial ? raw * 0.01 * LB_TO_KG : raw * 0.005;
    if (weightKg < 5 || weightKg > 350) return null;
    return withScaleMetrics(
      {
        weightKg: Math.round(weightKg * 100) / 100,
        stabilized: true,
        sourceProtocol: 'ble_weight_scale',
      },
      athlete
    );
  }

  // 3. QN-Scale / Yolanda protocol (0x10, 0x12, 0x14, 0x21 headers on 0xFFE1 / 0xFFE2 / 0xFFF1)
  if (
    (bytes[0] === 0x10 || bytes[0] === 0x12 || bytes[0] === 0x14 || bytes[0] === 0x21) &&
    bytes.length >= 6
  ) {
    const scaleDivisor = bytes[2] === 0x01 ? 10 : 100;
    const rawWeight = ((bytes[3] & 0xff) << 8) | (bytes[4] & 0xff);
    if (rawWeight === 0) return null;
    let weightKg = rawWeight / scaleDivisor;
    // Handle scales that report tenths despite bytes[2] !== 0x01 or hundredths despite bytes[2] === 0x01
    if (weightKg < 10 && rawWeight >= 200 && rawWeight <= 3000) {
      weightKg = rawWeight / 10;
    } else if (weightKg > 350 && rawWeight >= 3500 && rawWeight <= 35000) {
      weightKg = rawWeight / 100;
    }
    if (weightKg < 5 || weightKg > 350) return null;

    const stateByte = bytes[5];
    const stabilized = bytes[0] === 0x12 || stateByte !== 0x00;
    let impedanceOhms: number | undefined;
    if (bytes.length >= 8) {
      const rawImpedance = ((bytes[6] & 0xff) << 8) | (bytes[7] & 0xff);
      if (rawImpedance > 50 && rawImpedance < 3000) {
        impedanceOhms = rawImpedance;
      }
    }
    return withScaleMetrics(
      {
        weightKg: Math.round(weightKg * 100) / 100,
        impedanceOhms,
        stabilized,
        sourceProtocol: 'qn_scale',
      },
      athlete
    );
  }

  // 4. iCOMON / alternate RENPHO scale frame (0xCF, 0xFE, 0xFD, 0xAC, 0xA5, 0xAA, 0x55 header)
  if (
    (bytes[0] === 0xcf ||
      bytes[0] === 0xfe ||
      bytes[0] === 0xfd ||
      bytes[0] === 0xac ||
      bytes[0] === 0xa5 ||
      bytes[0] === 0xaa ||
      bytes[0] === 0x55) &&
    bytes.length >= 6
  ) {
    const rawLe45 = bytes.length >= 6 ? bytes[4] | (bytes[5] << 8) : 0;
    const rawBe34 = ((bytes[3] & 0xff) << 8) | (bytes[4] & 0xff);
    const rawBe23 = ((bytes[2] & 0xff) << 8) | (bytes[3] & 0xff);
    const candidateKg =
      rawLe45 >= 1000 && rawLe45 <= 30000
        ? rawLe45 / 100
        : rawBe34 >= 1000 && rawBe34 <= 30000
        ? rawBe34 / 100
        : rawBe23 >= 1000 && rawBe23 <= 30000
        ? rawBe23 / 100
        : 0;
    if (candidateKg >= 5 && candidateKg <= 350) {
      const stabilized =
        bytes[1] === 0x00 ||
        bytes[1] === 0x01 ||
        (bytes.length > 7 && bytes[7] === 0x01) ||
        bytes[5] === 0x01;
      const rawImpedance = bytes[2] | (bytes[3] << 8);
      const impedanceOhms =
        rawImpedance > 50 && rawImpedance < 3000 ? rawImpedance : undefined;
      return withScaleMetrics(
        {
          weightKg: Math.round(candidateKg * 100) / 100,
          impedanceOhms,
          stabilized,
          sourceProtocol: 'icomon_scale',
        },
        athlete
      );
    }
  }

  // 5. Fallback: if no characteristic UUID was supplied and packet is 3 bytes matching 0x2A9D
  if (!characteristicUuid && bytes.length === 3 && (bytes[0] & 0xfe) === 0) {
    const isImperial = (bytes[0] & 0x01) !== 0;
    const raw = bytes[1] | (bytes[2] << 8);
    const weightKg = isImperial ? raw * 0.01 * LB_TO_KG : raw * 0.005;
    if (weightKg >= 10 && weightKg <= 300) {
      return withScaleMetrics(
        {
          weightKg: Math.round(weightKg * 100) / 100,
          stabilized: true,
          sourceProtocol: 'ble_weight_scale',
        },
        athlete
      );
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
  writeValueWithResponse?: (value: Uint8Array | BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: Uint8Array | BufferSource) => Promise<void>;
  addEventListener: (type: string, listener: (ev: Event) => void) => void;
  removeEventListener?: (type: string, listener: (ev: Event) => void) => void;
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
  watchAdvertisements?: (options?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener: (type: string, listener: (ev: Event) => void) => void;
  removeEventListener?: (type: string, listener: (ev: Event) => void) => void;
}

interface NavigatorWithBluetooth {
  bluetooth?: {
    requestDevice: (options: Record<string, unknown>) => Promise<WebBluetoothDevice>;
    getDevices?: () => Promise<WebBluetoothDevice[]>;
  };
}


/**
 * Raw Bluetooth logging for checking device protocols. On for local development, or anywhere
 * with localStorage.treise_ble_debug = '1'. Logs service/characteristic IDs and packet bytes only.
 */
function bleDebugEnabled(): boolean {
  try {
    if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('treise_ble_debug') === '1';
  } catch {
    return false;
  }
}
function bleDebug(...args: unknown[]): void {
  if (!bleDebugEnabled()) return;
  console.info('[treise-ble]', ...args);
  // Keep the last packets on the page too, so a capture can be read after the fact.
  const w = globalThis as unknown as { __treiseBleLog?: string[] };
  w.__treiseBleLog = [...(w.__treiseBleLog ?? []), `${new Date().toISOString().slice(11, 23)} ${args.join(' ')}`].slice(-400);
}
function describeProps(char: { properties?: Record<string, boolean | undefined> }): string {
  const p = char.properties;
  if (!p) return '-';
  return ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter((k) => p[k]).join(',');
}
function toHex(view: DataView): string {
  return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

let cachedScaleDevice: WebBluetoothDevice | null = null;
let cachedTapeDevice: WebBluetoothDevice | null = null;

export function isWebBluetoothSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as unknown as NavigatorWithBluetooth;
  return Boolean(nav.bluetooth && typeof nav.bluetooth.requestDevice === 'function');
}

function matchesDeviceKind(device: WebBluetoothDevice, kind: 'scale' | 'tape', saved?: SavedRenphoDeviceInfo): boolean {
  if (saved) {
    if (device.id && saved.id && device.id === saved.id) return true;
    if (device.name && saved.name && device.name === saved.name) return true;
  }
  const name = (device.name || '').toUpperCase();
  if (!name) return false;
  if (kind === 'tape') {
    return (
      name.includes('TAPE') ||
      name.startsWith('ES-T') ||
      name.startsWith('RF-BMF') ||
      name.startsWith('R-Y00')
    );
  }
  return (
    name.startsWith('QN-SCALE') ||
    name.startsWith('ES-') ||
    (name.includes('RENPHO') && !name.includes('TAPE'))
  );
}

/**
 * Resolves a previously paired WebBluetoothDevice from in-memory session cache or
 * the browser's `navigator.bluetooth.getDevices()` permission store without opening
 * the manual pairing picker dialog.
 */
export async function resolveRememberedBleDevice(
  kind: 'scale' | 'tape'
): Promise<WebBluetoothDevice | null> {
  const cached = kind === 'scale' ? cachedScaleDevice : cachedTapeDevice;
  if (cached && cached.gatt) {
    return cached;
  }
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as NavigatorWithBluetooth;
  if (!nav.bluetooth || typeof nav.bluetooth.getDevices !== 'function') {
    return null;
  }
  try {
    const saved = loadSavedRenphoDevices()[kind];
    const permitted = await nav.bluetooth.getDevices();
    if (!Array.isArray(permitted) || permitted.length === 0) return null;
    const match =
      permitted.find((d) => saved && d.id === saved.id) ||
      permitted.find((d) => matchesDeviceKind(d, kind, saved));
    if (match && match.gatt) {
      if (kind === 'scale') cachedScaleDevice = match;
      else cachedTapeDevice = match;
      return match;
    }
  } catch {
    // getDevices may be disabled by permissions policy or browser flags
  }
  return null;
}

async function safeWriteCharacteristic(
  characteristic: WebBluetoothCharacteristic,
  payload: Uint8Array
): Promise<void> {
  try {
    // QN-protocol scales ignore commands sent without response, so use a
    // response write whenever the characteristic supports one.
    const props = characteristic.properties;
    if (props?.write !== false && typeof characteristic.writeValueWithResponse === 'function') {
      await characteristic.writeValueWithResponse(payload);
      return;
    }
    if (props?.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function') {
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

async function openScaleGattStream(
  device: WebBluetoothDevice,
  callbacks: {
    onReading: (reading: RenphoScaleReading) => void;
    onStatus?: (status: string) => void;
    onDisconnect?: () => void;
  },
  options: { unit?: 'kg' | 'lb'; athlete?: RenphoAthleteContext } | undefined,
  reconnectedFromMemory: boolean
): Promise<RenphoBleConnection> {
  const deviceName = device.name || loadSavedRenphoDevices().scale?.name || 'RENPHO Scale';
  const deviceId = device.id || deviceName;

  if (!device.gatt) {
    throw new Error('Selected Bluetooth device does not expose a GATT server.');
  }

  let active = true;
  let lastLiveReading: RenphoScaleReading | null = null;
  let steadySinceMs = 0;
  let steadyAnchorKg = 0;
  let lockedKg = 0;
  let hasLockedReading = false;
  const cleanupListeners: Array<() => void> = [];

  const handleDisconnected = () => {
    if (!active) return;
    // An unlocked reading is never saved: the scale switched off before it settled.
    callbacks.onDisconnect?.();
  };
  device.addEventListener('gattserverdisconnected', handleDisconnected);
  cleanupListeners.push(() => {
    device.removeEventListener?.('gattserverdisconnected', handleDisconnected);
  });

  if (typeof device.watchAdvertisements === 'function') {
    device.watchAdvertisements().catch(() => undefined);
  }

  callbacks.onStatus?.(
    reconnectedFromMemory
      ? `Reconnecting to ${deviceName}… Step onto the scale to wake it.`
      : `Connecting to ${deviceName}… Step onto the scale to wake it.`
  );

  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const services = await server.getPrimaryServices();
  bleDebug('connected', device.name, device.id, 'services', services.map((sv) => sv.uuid));

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
      bleDebug('characteristic', service.uuid, char.uuid, describeProps(char));
      const canNotify =
        char.properties?.notify ||
        char.properties?.indicate ||
        uuidLower.includes('ffe1') ||
        uuidLower.includes('ffe2') ||
        uuidLower.includes('fff1') ||
        uuidLower.includes('ffb2') ||
        uuidLower.includes('ae02') ||
        uuidLower.includes('2a9d') ||
        uuidLower.includes('2a9c');

      if (canNotify) {
        try {
          await char.startNotifications();
          const onValueChange = (event: Event) => {
            if (!active) return;
            const target = event.target as unknown as WebBluetoothCharacteristic;
            if (!target?.value) return;
            const reading = decodeRenphoScalePacket(target.value, char.uuid, options?.athlete);
            bleDebug('scale packet', char.uuid, toHex(target.value), reading ? `-> ${reading.weightKg} kg stabilized=${reading.stabilized} imp=${reading.impedanceOhms ?? '-'}` : '-> (not decoded)');
            if (!reading) return;

            // If the weight moves well away from a saved lock (the athlete was still
            // stepping on), allow a new lock so the settled weight replaces it.
            if (hasLockedReading && Math.abs(reading.weightKg - lockedKg) > 0.3) {
              hasLockedReading = false;
            }

            if (reading.stabilized) {
              if (hasLockedReading) return;
              hasLockedReading = true;
              lockedKg = reading.weightKg;
              lastLiveReading = reading;
              callbacks.onReading(reading);
              return;
            }

            // Scales send several packets a second, so judge "settled" by time,
            // not packet count: the weight must hold within 0.1 kg for 2.5 s.
            const now = Date.now();
            if (Math.abs(reading.weightKg - steadyAnchorKg) > 0.1 || reading.weightKg < 20) {
              steadySinceMs = now;
              steadyAnchorKg = reading.weightKg;
            }
            lastLiveReading = reading;

            if (!hasLockedReading && reading.weightKg >= 20 && now - steadySinceMs >= 2500) {
              hasLockedReading = true;
              lockedKg = reading.weightKg;
              callbacks.onReading({
                ...reading,
                stabilized: true,
              });
            } else {
              callbacks.onReading(reading);
            }
          };
          char.addEventListener('characteristicvaluechanged', onValueChange);
          cleanupListeners.push(() => {
            char.removeEventListener?.('characteristicvaluechanged', onValueChange);
          });
          subscribedCount++;
        } catch {
          // Continue checking other characteristics
        }
      }

      // Send QN-Scale config and timestamp packets if write characteristics are present
      if (uuidLower.includes('ffe3') || uuidLower.includes('fff2') || uuidLower.includes('ae01')) {
        await safeWriteCharacteristic(char, buildQnScaleConfigPayload(options?.unit ?? 'kg'));
      } else if (uuidLower.includes('ffe4')) {
        await safeWriteCharacteristic(char, buildQnScaleTimePayload());
      }
    }
  }

  if (subscribedCount === 0) {
    cleanupListeners.forEach((fn) => fn());
    server.disconnect();
    throw new Error(
      `Connected to ${deviceName}, but no scale weight stream was found. Step onto the scale so its display turns on and try again.`
    );
  }

  cachedScaleDevice = device;
  savePairedRenphoDevice({
    id: deviceId,
    name: deviceName,
    kind: 'scale',
    pairedAt: loadSavedRenphoDevices().scale?.pairedAt || localDateString(),
  });

  callbacks.onStatus?.(`Connected to ${deviceName}. Step barefoot onto the scale until the weight locks.`);

  return {
    deviceId,
    deviceName,
    reconnectedFromMemory,
    disconnect: () => {
      active = false;
      cleanupListeners.forEach((fn) => fn());
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    },
  };
}

/**
 * Connects directly to a RENPHO Bluetooth scale via Web Bluetooth, subscribes to live and
 * locked weight notifications, and sends the QN-Scale wake/config handshake.
 * Automatically reuses a previously paired scale in memory or `navigator.bluetooth.getDevices()`
 * before falling back to the browser pairing prompt.
 */
export async function connectRenphoScale(
  callbacks: {
    onReading: (reading: RenphoScaleReading) => void;
    onStatus?: (status: string) => void;
    onDisconnect?: () => void;
  },
  options?: {
    acceptAllDevices?: boolean;
    unit?: 'kg' | 'lb';
    athlete?: RenphoAthleteContext;
    forceNewPairing?: boolean;
    silentOnly?: boolean;
  }
): Promise<RenphoBleConnection> {
  if (!isWebBluetoothSupported()) {
    throw new Error(
      'Web Bluetooth is not supported in this browser. Open Treise in Chrome on Android or desktop.'
    );
  }

  if (!options?.forceNewPairing) {
    const remembered = await resolveRememberedBleDevice('scale');
    if (remembered) {
      try {
        return await openScaleGattStream(remembered, callbacks, options, true);
      } catch (err) {
        if (options?.silentOnly) {
          throw err;
        }
        // If user clicked connect and silent GATT failed because browser requires fresh selection, continue to requestDevice
      }
    } else if (options?.silentOnly) {
      throw new Error('No remembered RENPHO scale session available for silent reconnect.');
    }
  }

  const nav = navigator as unknown as NavigatorWithBluetooth;
  const optionalServices: Array<number | string> = [
    RENPHO_SCALE_UUIDS.QN_SERVICE_FFE0,
    RENPHO_SCALE_UUIDS.QN_SERVICE_FFF0,
    RENPHO_SCALE_UUIDS.ICOMON_SERVICE_FFB0,
    0xffa0,
    0xffd0,
    0xae00,
    0x1a10,
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
          { namePrefix: 'qn-scale' },
          { namePrefix: 'RENPHO' },
          { namePrefix: 'Renpho' },
          { namePrefix: 'renpho' },
          { namePrefix: 'ES-' },
          { namePrefix: 'ES_' },
          { namePrefix: 'R-' },
          { namePrefix: 'Yolanda' },
          { services: [RENPHO_SCALE_UUIDS.QN_SERVICE_FFE0] },
          { services: [RENPHO_SCALE_UUIDS.QN_SERVICE_FFF0] },
          { services: [RENPHO_SCALE_UUIDS.ICOMON_SERVICE_FFB0] },
          { services: [RENPHO_SCALE_UUIDS.BLE_WEIGHT_SCALE_SERVICE] },
          { services: [RENPHO_SCALE_UUIDS.BLE_BODY_COMPOSITION_SERVICE] },
        ],
        optionalServices,
      };

  callbacks.onStatus?.('Step onto your RENPHO scale to wake it, then select it in the Bluetooth prompt…');
  const device = await nav.bluetooth!.requestDevice(requestOptions);
  return openScaleGattStream(device, callbacks, options, false);
}

async function openTapeGattStream(
  device: WebBluetoothDevice,
  callbacks: {
    onReading: (reading: RenphoTapeReading) => void;
    onStatus?: (status: string) => void;
    onDisconnect?: () => void;
  },
  reconnectedFromMemory: boolean
): Promise<RenphoBleConnection> {
  const deviceName = device.name || loadSavedRenphoDevices().tape?.name || 'RENPHO Smart Tape';
  const deviceId = device.id || deviceName;

  if (!device.gatt) {
    throw new Error('Selected Bluetooth device does not expose a GATT server.');
  }

  let active = true;
  const cleanupListeners: Array<() => void> = [];

  const handleDisconnected = () => {
    if (!active) return;
    callbacks.onDisconnect?.();
  };
  device.addEventListener('gattserverdisconnected', handleDisconnected);
  cleanupListeners.push(() => {
    device.removeEventListener?.('gattserverdisconnected', handleDisconnected);
  });

  if (typeof device.watchAdvertisements === 'function') {
    device.watchAdvertisements().catch(() => undefined);
  }

  callbacks.onStatus?.(
    reconnectedFromMemory ? `Reconnecting to ${deviceName}…` : `Connecting to ${deviceName}…`
  );

  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const services = await server.getPrimaryServices();
  bleDebug('connected', device.name, device.id, 'services', services.map((sv) => sv.uuid));

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
      bleDebug('characteristic', service.uuid, char.uuid, describeProps(char));
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
          const onValueChange = (event: Event) => {
            if (!active) return;
            const target = event.target as unknown as WebBluetoothCharacteristic;
            if (!target?.value) return;
            const reading = decodeRenphoTapePacket(target.value);
            bleDebug('tape packet', char.uuid, toHex(target.value), JSON.stringify(Array.from(new Uint8Array(target.value.buffer)).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')), reading ? `-> ${reading.lengthCm} cm stabilized=${reading.stabilized}` : '-> (not decoded)');
            if (reading) {
              callbacks.onReading(reading);
            }
          };
          char.addEventListener('characteristicvaluechanged', onValueChange);
          cleanupListeners.push(() => {
            char.removeEventListener?.('characteristicvaluechanged', onValueChange);
          });
          subscribedCount++;
        } catch {
          // Try next characteristic
        }
      }
    }
  }

  if (subscribedCount === 0) {
    cleanupListeners.forEach((fn) => fn());
    server.disconnect();
    throw new Error(
      `Connected to ${deviceName}, but no tape measurement stream was found. Press a button on the tape measure to wake it and try again.`
    );
  }

  cachedTapeDevice = device;
  savePairedRenphoDevice({
    id: deviceId,
    name: deviceName,
    kind: 'tape',
    pairedAt: loadSavedRenphoDevices().tape?.pairedAt || localDateString(),
  });

  callbacks.onStatus?.(
    `Connected to ${deviceName}. Pull the tape around the selected body area and press the confirm button on the tape.`
  );

  return {
    deviceId,
    deviceName,
    reconnectedFromMemory,
    disconnect: () => {
      active = false;
      cleanupListeners.forEach((fn) => fn());
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    },
  };
}

/**
 * Connects directly to a RENPHO Smart Body Tape Measure (`RF-BMF01`, `R-Y001`, `ES-T091`, `ES_TAPE`)
 * via Web Bluetooth and streams live + button-locked circumference readings in real time.
 * Automatically reuses a previously paired smart tape in memory or `navigator.bluetooth.getDevices()`
 * before falling back to the browser pairing prompt.
 */
export async function connectRenphoTape(
  callbacks: {
    onReading: (reading: RenphoTapeReading) => void;
    onStatus?: (status: string) => void;
    onDisconnect?: () => void;
  },
  options?: {
    acceptAllDevices?: boolean;
    forceNewPairing?: boolean;
    silentOnly?: boolean;
  }
): Promise<RenphoBleConnection> {
  if (!isWebBluetoothSupported()) {
    throw new Error(
      'Web Bluetooth is not supported in this browser. Open Treise in Chrome on Android or desktop.'
    );
  }

  if (!options?.forceNewPairing) {
    const remembered = await resolveRememberedBleDevice('tape');
    if (remembered) {
      try {
        return await openTapeGattStream(remembered, callbacks, true);
      } catch (err) {
        if (options?.silentOnly) {
          throw err;
        }
      }
    } else if (options?.silentOnly) {
      throw new Error('No remembered RENPHO smart tape session available for silent reconnect.');
    }
  }

  const nav = navigator as unknown as NavigatorWithBluetooth;
  const optionalServices: Array<number | string> = [
    RENPHO_TAPE_UUIDS.TAPE_SERVICE,
    RENPHO_TAPE_UUIDS.FALLBACK_SERVICE_FFE0,
    RENPHO_TAPE_UUIDS.FALLBACK_SERVICE_FFF0,
    0xffb0,
    0xae00,
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
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
          { namePrefix: 'Renpho' },
          { namePrefix: 'renpho' },
        ],
        optionalServices,
      };

  callbacks.onStatus?.('Wake your RENPHO smart tape, then select it in the Bluetooth prompt…');
  const device = await nav.bluetooth!.requestDevice(requestOptions);
  return openTapeGattStream(device, callbacks, false);
}
