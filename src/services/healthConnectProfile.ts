import { Gender, UserProfile } from '../engine/types';

export interface HealthConnectDemographics {
  /** Latest real height found (cm), 100–250, if available. */
  latestHeightCm?: number;
  /** Biological sex / gender if explicitly present in Health Connect profile/export/FHIR Patient data. */
  gender?: Gender;
  /** Age in years (13–110) if explicitly present or computed from birthDate/dateOfBirth/birthYear. */
  age?: number;
}

const MIN_AGE_YEARS = 13;
const MAX_AGE_YEARS = 110;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;

/** Normalizes explicit sex/gender values from Health Connect exports or FHIR Patient resources. Never guesses. */
export function parseSexValue(raw: unknown): Gender | undefined {
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.toLowerCase().trim();
  if (normalized === 'male' || normalized === 'm' || normalized === 'man' || normalized === 'biological_male') {
    return 'male';
  }
  if (normalized === 'female' || normalized === 'f' || normalized === 'woman' || normalized === 'biological_female') {
    return 'female';
  }
  return undefined;
}

/**
 * Computes completed age in years from a date-of-birth string or 4-digit birth year using local calendar date.
 * Returns undefined for invalid or out-of-range values (never fabricates).
 */
export function computeAgeFromBirthDate(raw: unknown, referenceDate: Date = new Date()): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1900 && raw <= refYear) {
    const age = refYear - raw;
    return age >= MIN_AGE_YEARS && age <= MAX_AGE_YEARS ? age : undefined;
  }

  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Pure 4-digit birth year (e.g. "1992")
  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    const age = refYear - year;
    return age >= MIN_AGE_YEARS && age <= MAX_AGE_YEARS ? age : undefined;
  }

  // ISO / slash date ("1992-05-14", "1992-05-14T00:00:00Z", "1992/05/14", "1992-05")
  const ymd = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/.exec(trimmed);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = ymd[3] !== undefined ? Number(ymd[3]) : undefined;
    if (month < 1 || month > 12) return undefined;
    if (day !== undefined && (day < 1 || day > 31)) return undefined;
    let age = refYear - year;
    if (month > refMonth || (month === refMonth && day !== undefined && day > refDay)) {
      age -= 1;
    }
    return age >= MIN_AGE_YEARS && age <= MAX_AGE_YEARS ? age : undefined;
  }

  return undefined;
}

/** Extracts a valid height in whole centimeters (100–250) from common Health Connect / export shapes. */
export function parseHeightCmValue(obj: any): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;

  const clampCm = (val: unknown): number | undefined => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < MIN_HEIGHT_CM || n > MAX_HEIGHT_CM) return undefined;
    return Math.round(n);
  };

  // Explicit centimeter fields
  const directCm = clampCm(obj.heightCm ?? obj.measuredHeightCm ?? obj.height_cm ?? obj.height?.inCentimeters ?? obj.height?.cm);
  if (directCm !== undefined) return directCm;

  // Explicit meter fields (Health Connect HeightRecord stores meters)
  const rawMeters = Number(obj.height?.inMeters ?? obj.heightMeters ?? obj.height_m);
  if (Number.isFinite(rawMeters) && rawMeters >= 1.0 && rawMeters <= 2.5) {
    return clampCm(rawMeters * 100);
  }

  // Explicit inch / feet fields
  const rawInches = Number(obj.height?.inInches ?? obj.heightInches ?? obj.height_in);
  if (Number.isFinite(rawInches) && rawInches >= 39 && rawInches <= 99) {
    return clampCm(rawInches * 2.54);
  }
  const rawFeet = Number(obj.height?.inFeet ?? obj.heightFeet);
  if (Number.isFinite(rawFeet) && rawFeet >= 3.3 && rawFeet <= 8.2) {
    return clampCm(rawFeet * 30.48);
  }

  // Structured { value, unit } object on obj.height
  if (obj.height && typeof obj.height === 'object' && obj.height.value !== undefined) {
    const val = Number(obj.height.value);
    const unit = String(obj.height.unit ?? '').toLowerCase().trim();
    if (Number.isFinite(val)) {
      if ((unit === 'cm' || unit === 'centimeter' || unit === 'centimeters') && val >= MIN_HEIGHT_CM && val <= MAX_HEIGHT_CM) {
        return Math.round(val);
      }
      if ((unit === 'm' || unit === 'meter' || unit === 'meters') && val >= 1.0 && val <= 2.5) {
        return clampCm(val * 100);
      }
      if ((unit === 'in' || unit === 'inch' || unit === 'inches') && val >= 39 && val <= 99) {
        return clampCm(val * 2.54);
      }
      if ((unit === 'ft' || unit === 'foot' || unit === 'feet') && val >= 3.3 && val <= 8.2) {
        return clampCm(val * 30.48);
      }
    }
  }

  // Direct numeric `height` field on HeightRecord or profile objects
  if (typeof obj.height === 'number' && Number.isFinite(obj.height)) {
    if (obj.height >= 1.0 && obj.height <= 2.5) return clampCm(obj.height * 100);
    if (obj.height >= MIN_HEIGHT_CM && obj.height <= MAX_HEIGHT_CM) return Math.round(obj.height);
  }

  return undefined;
}

function recordSortKey(rec: any): string {
  if (!rec || typeof rec !== 'object') return '';
  return String(rec.time ?? rec.endTime ?? rec.startTime ?? rec.date ?? '');
}

/**
 * Pure extractor for sex, age, and height across native Health Connect bridge responses,
 * Health Connect / Takeout / Samsung Health / Fitbit JSON exports, and FHIR Patient resources.
 * Never fabricates missing fields.
 */
export function extractHealthConnectDemographics(
  input: unknown,
  referenceDate: Date = new Date()
): HealthConnectDemographics {
  let latestHeightCm: number | undefined;
  let gender: Gender | undefined;
  let age: number | undefined;

  const inspectObject = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;

    // Handle stringified FHIR resource payloads (Android Health Connect MedicalResource / FHIR Patient)
    if (typeof obj.fhirResource?.data === 'string') {
      try {
        inspectObject(JSON.parse(obj.fhirResource.data));
      } catch {
        // Ignore malformed embedded FHIR string
      }
    }

    const parsedSex = parseSexValue(
      obj.gender ?? obj.sex ?? obj.biologicalSex ?? obj.administrativeGender
    );
    if (parsedSex) gender = parsedSex;

    const rawAge = Number(obj.age);
    if (Number.isFinite(rawAge) && rawAge >= MIN_AGE_YEARS && rawAge <= MAX_AGE_YEARS) {
      age = Math.round(rawAge);
    } else {
      const dobAge = computeAgeFromBirthDate(
        obj.birthDate ?? obj.dateOfBirth ?? obj.dob ?? obj.birthdate ?? obj.birth_date ?? obj.birthYear ?? obj.yearOfBirth,
        referenceDate
      );
      if (dobAge !== undefined) age = dobAge;
    }

    const parsedHeight = parseHeightCmValue(obj);
    if (parsedHeight !== undefined) latestHeightCm = parsedHeight;
  };

  if (!input || typeof input !== 'object') return {};
  const root = input as any;

  // 1. Inspect top-level & common demographic containers
  inspectObject(root);
  for (const key of ['profile', 'user', 'athlete', 'demographics', 'patient', 'personalInfo', 'subject']) {
    if (root[key] && typeof root[key] === 'object') {
      inspectObject(root[key]);
    }
  }

  // 2. Inspect FHIR Bundle entries & MedicalResource lists (Patient resource carries gender + birthDate)
  const fhirContainers = [
    ...(Array.isArray(root.entry) ? root.entry.map((e: any) => e?.resource ?? e) : []),
    ...(Array.isArray(root.medicalResources) ? root.medicalResources : []),
  ];
  for (const item of fhirContainers) {
    if (!item || typeof item !== 'object') continue;
    if (item.resourceType === 'Patient' || item.fhirResource?.data || item.gender || item.birthDate) {
      inspectObject(item);
    }
  }

  // 3. Inspect biometric day arrays or chronological records (latest HeightRecord wins)
  const recordList = Array.isArray(root)
    ? root
    : Array.isArray(root.days)
    ? root.days
    : Array.isArray(root.records)
    ? root.records
    : Array.isArray(root.Data)
    ? root.Data
    : [];

  if (recordList.length > 0) {
    const ordered = [...recordList].sort((a, b) => recordSortKey(a).localeCompare(recordSortKey(b)));
    for (const rec of ordered) {
      if (!rec || typeof rec !== 'object') continue;
      if (
        rec.type === 'HeightRecord' ||
        rec.resourceType === 'Patient' ||
        rec.fhirResource?.data !== undefined ||
        rec.heightCm !== undefined ||
        rec.measuredHeightCm !== undefined ||
        rec.height !== undefined ||
        rec.heightMeters !== undefined ||
        rec.heightInches !== undefined ||
        rec.gender !== undefined ||
        rec.sex !== undefined ||
        rec.age !== undefined ||
        rec.birthDate !== undefined ||
        rec.dateOfBirth !== undefined
      ) {
        inspectObject(rec);
      }
    }
  }

  return {
    ...(latestHeightCm !== undefined ? { latestHeightCm } : {}),
    ...(gender !== undefined ? { gender } : {}),
    ...(age !== undefined ? { age } : {}),
  };
}

/**
 * Computes a minimal UserProfile patch from extracted Health Connect demographics.
 * During background sync (`overwriteExplicit: false`), never clobbers sex/age explicitly entered by the athlete.
 * Returns an empty object when nothing actually changed.
 */
export function mergeHealthConnectProfile(
  current: UserProfile,
  extracted: HealthConnectDemographics,
  options?: { overwriteExplicit?: boolean }
): Partial<UserProfile> {
  const overwrite = Boolean(options?.overwriteExplicit);
  const patch: Partial<UserProfile> = {};

  if (
    extracted.latestHeightCm !== undefined &&
    extracted.latestHeightCm >= MIN_HEIGHT_CM &&
    extracted.latestHeightCm <= MAX_HEIGHT_CM &&
    (current.measuredHeightCm !== extracted.latestHeightCm || current.heightCm !== extracted.latestHeightCm)
  ) {
    patch.measuredHeightCm = extracted.latestHeightCm;
    patch.heightCm = extracted.latestHeightCm;
  }

  if (
    extracted.gender &&
    (overwrite || !current.sexEntered) &&
    (current.gender !== extracted.gender || !current.sexEntered)
  ) {
    patch.gender = extracted.gender;
    patch.sexEntered = true;
  }

  if (
    extracted.age !== undefined &&
    extracted.age >= MIN_AGE_YEARS &&
    extracted.age <= MAX_AGE_YEARS &&
    (overwrite || !current.ageEntered) &&
    (current.age !== extracted.age || !current.ageEntered)
  ) {
    patch.age = extracted.age;
    patch.ageEntered = true;
  }

  return patch;
}
