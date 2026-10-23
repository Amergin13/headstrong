import {
  AuthUser,
  BiometricLog,
  ExerciseDefinition,
  StrengthPillar,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import {
  NEW_USER_PROFILE,
  SAMPLE_DEMO_PROFILE,
  INITIAL_USER_PROFILE,
  SEED_EXERCISES,
  createTodaysActiveWorkout,
  generateSeedBiometrics,
  generateSeedWorkouts,
} from './seedData';
import { calculateE1RM } from '../engine/e1rm';
import { isPillarBenchmarkExercise } from '../engine/strengthStandards';
import { getLatestBodyweightEma } from '../engine/ema';
import { localDateString } from '../utils/date';

const KEYS = {
  PROFILE: 'treise_profile_v3',
  BIOMETRICS: 'treise_biometrics_v3',
  WORKOUTS: 'treise_workouts_v3',
  ACTIVE_WORKOUT: 'treise_active_workout_v3',
  EXERCISES: 'treise_exercises_v3',
  AUTH_USER: 'treise_auth_user_v1',
};

const LEGACY_KEYS = {
  PROFILE: 'headstrong_profile_v3',
  BIOMETRICS: 'headstrong_biometrics_v3',
  WORKOUTS: 'headstrong_workouts_v3',
  ACTIVE_WORKOUT: 'headstrong_active_workout_v3',
  EXERCISES: 'headstrong_exercises_v3',
  AUTH_USER: 'headstrong_auth_user_v1',
};

/**
 * Version of the saved-data format. Bump it and add a step to runStorageMigrations whenever
 * the shape of stored data changes, so existing athletes' history keeps loading.
 */
export const STORAGE_SCHEMA_VERSION = 4;
const SCHEMA_VERSION_KEY = 'treise_schema_version';

/**
 * Upgrades data saved by older versions. Safe to run on every launch.
 * v4: removes any Whoop client secret earlier builds stored on the device, and drops the
 *     stored profile copy of it.
 */
export function runStorageMigrations(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = parseInt(localStorage.getItem(SCHEMA_VERSION_KEY) || '0', 10) || 0;
    if (current < 4) {
      localStorage.removeItem('whoop_client_secret');
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('whoop_client_secret');
      const rawProfile = localStorage.getItem(KEYS.PROFILE) || localStorage.getItem(LEGACY_KEYS.PROFILE);
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile);
        delete parsed.whoopClientSecret;
        localStorage.setItem(KEYS.PROFILE, JSON.stringify(parsed));
      }
    }
    if (current < STORAGE_SCHEMA_VERSION) {
      localStorage.setItem(SCHEMA_VERSION_KEY, String(STORAGE_SCHEMA_VERSION));
    }
  } catch (e) {
    console.error('Saved data migration failed:', e);
  }
}

function getItemWithFallback(key: keyof typeof KEYS): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(KEYS[key]) || localStorage.getItem(LEGACY_KEYS[key]);
}

export function loadAuthUser(): AuthUser | null {
  try {
    const raw = getItemWithFallback('AUTH_USER');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load auth user:', e);
  }
  return null;
}

export function saveAuthUser(user: AuthUser | null): void {
  try {
    if (user) {
      localStorage.setItem(KEYS.AUTH_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEYS.AUTH_USER);
    }
  } catch (e) {
    console.error('Failed to save auth user:', e);
  }
}

export function clearAuthUser(): void {
  saveAuthUser(null);
}

export function loadProfile(): UserProfile {
  try {
    const raw = getItemWithFallback('PROFILE');
    if (raw) {
      const parsed = JSON.parse(raw) as UserProfile;
      return {
        ...NEW_USER_PROFILE,
        ...parsed,
        whoopClientId: parsed.whoopClientId || NEW_USER_PROFILE.whoopClientId,
        programType: parsed.programType || 'ppl_upper',
        activeLocation: parsed.activeLocation || 'gym',
        availableLocations: parsed.availableLocations || ['gym', 'home', 'travel'],
        homeEquipment: parsed.homeEquipment || [],
      };
    }
  } catch (e) {
    console.error('Failed to load profile:', e);
  }
  return {
    ...NEW_USER_PROFILE,
    onboardingCompleted: false,
  };
}

export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save profile:', e);
  }
}

export function loadBiometrics(): BiometricLog[] {
  try {
    const raw = getItemWithFallback('BIOMETRICS');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load biometrics:', e);
  }
  return [];
}

export function saveBiometrics(logs: BiometricLog[]): void {
  try {
    localStorage.setItem(KEYS.BIOMETRICS, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save biometrics:', e);
  }
}

export function loadWorkouts(): WorkoutSession[] {
  try {
    const raw = getItemWithFallback('WORKOUTS');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load workouts:', e);
  }
  return [];
}

export function saveWorkouts(workouts: WorkoutSession[]): void {
  try {
    localStorage.setItem(KEYS.WORKOUTS, JSON.stringify(workouts));
  } catch (e) {
    console.error('Failed to save workouts:', e);
  }
}

export function loadActiveWorkout(): WorkoutSession {
  try {
    const raw = getItemWithFallback('ACTIVE_WORKOUT');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load active workout:', e);
  }
  const fresh = createTodaysActiveWorkout();
  saveActiveWorkout(fresh);
  return fresh;
}

export function saveActiveWorkout(workout: WorkoutSession): void {
  try {
    localStorage.setItem(KEYS.ACTIVE_WORKOUT, JSON.stringify(workout));
  } catch (e) {
    console.error('Failed to save active workout:', e);
  }
}

export function loadExercises(): ExerciseDefinition[] {
  try {
    const raw = getItemWithFallback('EXERCISES');
    if (raw) {
      const stored = JSON.parse(raw) as ExerciseDefinition[];
      const seedMap = new Map(SEED_EXERCISES.map((s) => [s.id, s]));
      // Enrich stored exercises with latest SEED_EXERCISES metadata and append any new seed exercises
      const merged: ExerciseDefinition[] = stored.map((ex) => {
        const seed = seedMap.get(ex.id);
        return seed ? { ...ex, ...seed } : ex;
      });
      const existingIds = new Set(merged.map((m) => m.id));
      for (const seed of SEED_EXERCISES) {
        if (!existingIds.has(seed.id)) {
          merged.push(seed);
        }
      }
      saveExercises(merged);
      return merged;
    }
  } catch (e) {
    console.error('Failed to load exercises:', e);
  }
  saveExercises(SEED_EXERCISES);
  return SEED_EXERCISES;
}

export function saveExercises(exercises: ExerciseDefinition[]): void {
  try {
    localStorage.setItem(KEYS.EXERCISES, JSON.stringify(exercises));
  } catch (e) {
    console.error('Failed to save exercises:', e);
  }
}

export function resetAllToSeedData(): {
  profile: UserProfile;
  biometrics: BiometricLog[];
  workouts: WorkoutSession[];
  activeWorkout: WorkoutSession;
  exercises: ExerciseDefinition[];
} {
  localStorage.clear();
  const profile = SAMPLE_DEMO_PROFILE;
  const biometrics = generateSeedBiometrics();
  const workouts = generateSeedWorkouts();
  const activeWorkout = createTodaysActiveWorkout();
  const exercises = SEED_EXERCISES;

  saveProfile(profile);
  saveBiometrics(biometrics);
  saveWorkouts(workouts);
  saveActiveWorkout(activeWorkout);
  saveExercises(exercises);

  return { profile, biometrics, workouts, activeWorkout, exercises };
}

/**
 * Computes all-time best E1RM per strength pillar from completed workouts history
 * Strictly filters to compound benchmark pillar lifts and excludes warmup sets.
 */
export function calculateBestPillarE1rms(
  workouts: WorkoutSession[],
  bodyweightEmaKg: number,
  options: { loadedLiftsOnly?: boolean } = {}
): Record<StrengthPillar, number> {
  const best: Record<StrengthPillar, number> = {
    Squat: 0,
    Hinge: 0,
    'Horizontal Push': 0,
    'Vertical Push': 0,
    'Horizontal Pull': 0,
    'Vertical Pull': 0,
  };

  for (const w of workouts) {
    if (!w.completed) continue;
    for (const ex of w.exercises) {
      const isIsolation = !isPillarBenchmarkExercise(ex);

      if (isIsolation) continue;
      // "Big 3" style numbers should come from loaded lifts, not push-ups or chin-ups.
      if (options.loadedLiftsOnly && ex.equipment === 'bodyweight') continue;

      for (const s of ex.sets) {
        if (!s.completed || s.isWarmup || s.setType === 'warmup' || !s.actualReps || s.actualReps <= 0) {
          continue;
        }
        const weight = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const rir = s.actualRir ?? 2;
        const e1rm = calculateE1RM(
          weight,
          s.actualReps,
          rir,
          ex.equipment,
          ex.isRdl,
          ex.isWeightedCalisthenic,
          bodyweightEmaKg
        );
        if (e1rm > best[ex.pillar]) {
          best[ex.pillar] = e1rm;
        }
      }
    }
  }

  // Pillars with no logged sets stay at 0 ("no data"); never substitute estimates.
  return best;
}

/**
 * Calculates weekly muscle group volume (hard sets count) for current rolling 7-day window.
 * Accumulates exact 0.5 fractional synergist sets and excludes warmup sets.
 */
export function calculateWeeklyMuscleVolume(
  workouts: WorkoutSession[],
  exerciseCatalog: ExerciseDefinition[],
  activeWorkout?: WorkoutSession
): Record<string, number> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartStr = localDateString(weekStart);

  const exMap = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const volume: Record<string, number> = {
    SideDelts: 0,
    Calves: 0,
    RearDelts: 0,
    Back: 0,
    Chest: 0,
    Quads: 0,
    Hamstrings: 0,
    Triceps: 0,
    Biceps: 0,
    Glutes: 0,
    Core: 0,
    FrontDelts: 0,
    Shoulders: 0,
  };

  const sessionsToScan = activeWorkout ? [activeWorkout, ...workouts] : workouts;

  for (const w of sessionsToScan) {
    if (w.date < weekStartStr) continue;
    for (const ex of w.exercises) {
      const def = exMap.get(ex.exerciseId);
      const hardSets = ex.sets.filter(
        (s) =>
          s.completed &&
          !s.isWarmup &&
          s.setType !== 'warmup' &&
          (s.actualRir ?? 2) <= 3
      ).length;
      if (hardSets === 0) continue;

      if (def) {
        const primary = def.primaryMuscle;
        if (primary === 'Side Delts') {
          volume.SideDelts = (volume.SideDelts || 0) + hardSets;
          volume.Shoulders = (volume.Shoulders || 0) + hardSets;
        } else if (primary === 'Rear Delts') {
          volume.RearDelts = (volume.RearDelts || 0) + hardSets;
          volume.Shoulders = (volume.Shoulders || 0) + hardSets;
        } else if (primary === 'Front Delts') {
          volume.FrontDelts = (volume.FrontDelts || 0) + hardSets;
          volume.Shoulders = (volume.Shoulders || 0) + hardSets;
        } else if (primary === 'Shoulders') {
          volume.Shoulders = (volume.Shoulders || 0) + hardSets;
          volume.FrontDelts = (volume.FrontDelts || 0) + hardSets;
          volume.SideDelts = (volume.SideDelts || 0) + hardSets * 0.5;
        } else {
          volume[primary] = (volume[primary] || 0) + hardSets;
        }

        if (def.secondaryMuscles) {
          for (const sec of def.secondaryMuscles) {
            const secCredit = hardSets * 0.5;
            if (sec === 'Side Delts') {
              volume.SideDelts = (volume.SideDelts || 0) + secCredit;
            } else if (sec === 'Rear Delts') {
              volume.RearDelts = (volume.RearDelts || 0) + secCredit;
            } else if (sec === 'Shoulders') {
              volume.Shoulders = (volume.Shoulders || 0) + secCredit;
              volume.FrontDelts = (volume.FrontDelts || 0) + secCredit;
            } else {
              volume[sec] = (volume[sec] || 0) + secCredit;
            }
          }
        }
      } else {
        if (ex.pillar === 'Squat') volume.Quads += hardSets;
        if (ex.pillar === 'Hinge') volume.Hamstrings += hardSets;
        if (ex.pillar === 'Horizontal Push') volume.Chest += hardSets;
        if (ex.pillar === 'Vertical Push') {
          volume.Shoulders += hardSets;
          volume.SideDelts += hardSets;
        }
        if (ex.pillar === 'Horizontal Pull') volume.Back += hardSets;
        if (ex.pillar === 'Vertical Pull') volume.Back += hardSets;
      }
    }
  }

  // Round to nearest 0.5 set for clean presentation
  for (const key of Object.keys(volume)) {
    volume[key] = Math.round(volume[key] * 2) / 2;
  }

  return volume;
}

export interface TreiseDataBackup {
  appVersion: string;
  exportedAt: string;
  profile: UserProfile;
  biometrics: BiometricLog[];
  workouts: WorkoutSession[];
  activeWorkout: WorkoutSession;
  exercises: ExerciseDefinition[];
}

export type HeadStrongDataBackup = TreiseDataBackup;

/**
 * Exports all user data as a portable JSON backup (Google Play Data Portability)
 */
export function exportAllUserDataJSON(): string {
  const payload: TreiseDataBackup = {
    appVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    profile: loadProfile(),
    biometrics: loadBiometrics(),
    workouts: loadWorkouts(),
    activeWorkout: loadActiveWorkout(),
    exercises: loadExercises(),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Validates and restores a JSON backup
 */
export function importUserDataJSON(rawJson: string): TreiseDataBackup {
  const parsed = JSON.parse(rawJson) as Partial<TreiseDataBackup>;
  if (!parsed || !parsed.profile || !Array.isArray(parsed.workouts)) {
    throw new Error('Invalid Treise backup file format.');
  }

  const profile = parsed.profile;
  const biometrics = Array.isArray(parsed.biometrics) ? parsed.biometrics : loadBiometrics();
  const workouts = parsed.workouts;
  const activeWorkout = parsed.activeWorkout || createTodaysActiveWorkout();
  const exercises = Array.isArray(parsed.exercises) ? parsed.exercises : SEED_EXERCISES;

  saveProfile(profile);
  saveBiometrics(biometrics);
  saveWorkouts(workouts);
  saveActiveWorkout(activeWorkout);
  saveExercises(exercises);

  return {
    appVersion: parsed.appVersion || '1.0.0',
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    profile,
    biometrics,
    workouts,
    activeWorkout,
    exercises,
  };
}

/**
 * Permanently erases all personal, workout, biometric, and OAuth data from the device
 * (Mandatory for Google Play Store User Data & Account Deletion Policy compliance)
 */
export function permanentlyEraseAllUserData() {
  try {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    Object.values(LEGACY_KEYS).forEach((k) => localStorage.removeItem(k));
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('fitbit_code_verifier');
      sessionStorage.removeItem('fitbit_oauth_state');
      sessionStorage.removeItem('whoop_code_verifier');
      sessionStorage.removeItem('whoop_oauth_state');
    }
  } catch (e) {
    console.error('Failed to clear storage:', e);
  }

  const todayStr = localDateString();
  const cleanProfile: UserProfile = {
    name: 'Athlete',
    gender: 'male',
    age: 25,
    heightCm: 175,
    goalPhase: 'Lean Bulk',
    mesocycleWeek: 1,
    level: 1,
    currentXp: 0,
    streakDays: 0,
    lastWorkoutDate: todayStr,
    wearableSource: null,
    fitbitConnected: false,
    whoopConnected: false,
    healthConnectConnected: false,
    maxHr: 190,
    restingHrBaseline: 58,
  };

  const cleanBiometrics: BiometricLog[] = [
    {
      date: todayStr,
      bodyweightKg: 80.0,
      hrvRmssd: 58,
      restingHr: 58,
      sleepHours: 7.5,
      steps: 0,
      activeZoneMinutes: 0,
      vo2Max: 44.0,
    },
  ];

  const cleanWorkouts: WorkoutSession[] = [];
  const cleanActive = createTodaysActiveWorkout();

  saveProfile(cleanProfile);
  saveBiometrics(cleanBiometrics);
  saveWorkouts(cleanWorkouts);
  saveActiveWorkout(cleanActive);
  saveExercises(SEED_EXERCISES);

  return {
    profile: cleanProfile,
    biometrics: cleanBiometrics,
    workouts: cleanWorkouts,
    activeWorkout: cleanActive,
    exercises: SEED_EXERCISES,
  };
}

