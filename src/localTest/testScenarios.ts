import { ActivityLog } from '../engine/activeDays';
import { getPlanById } from '../engine/trainingPlans';
import { generatePlanWorkout, TrainingPlan } from '../engine/muscleBuildingProgram';
import {
  BiometricLog,
  ExerciseDefinition,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  ReadinessState,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import { makeCustomGoal } from '../services/athleteGoals';
import { prepareSessionForAthlete } from '../services/sessionPreparation';
import {
  generateSeedBiometrics,
  NEW_USER_PROFILE,
  SAMPLE_DEMO_PROFILE,
  SEED_EXERCISES,
} from '../services/seedData';
import {
  clearAuthUser,
  permanentlyEraseAllUserData,
  saveActivities,
  saveActiveWorkout,
  saveBiometrics,
  saveExercises,
  saveProfile,
  saveWorkouts,
} from '../services/storage';
import { adaptWorkoutSessionToLocation } from '../services/workoutGenerator';
import { localDateString } from '../utils/date';
import { TabId } from '../components/common/NavigationBar';

export type LocalScenarioId =
  | 'fresh-onboarding'
  | 'starter-day1-calibrated'
  | 'mid-plan-normal'
  | 'recovery-gate-blocked'
  | 'amber-shield'
  | 'primed-progression'
  | 'today-finished'
  | 'returning-cycle-2'
  | 'home-gym'
  | 'travel-bodyweight'
  | 'imperial-lb'
  | 'strength-imbalances-female'
  | 'active-days-wearables';

export interface LocalScenarioMeta {
  id: LocalScenarioId;
  category: 'Onboarding & Plan' | 'Recovery & Readiness' | 'Location & Units' | 'Standards & Cardio';
  title: string;
  summary: string;
  defaultTab: TabId;
}

export interface AppliedScenarioState {
  meta: LocalScenarioMeta;
  profile: UserProfile;
  biometrics: BiometricLog[];
  workouts: WorkoutSession[];
  activeWorkout: WorkoutSession;
  exercises: ExerciseDefinition[];
  activities: ActivityLog[];
  onboardingOpen: boolean;
  activeTab: TabId;
}

export const SCENARIO_LIST: LocalScenarioMeta[] = [
  {
    id: 'fresh-onboarding',
    category: 'Onboarding & Plan',
    title: 'Fresh Install (Onboarding)',
    summary: 'Zero history; launches 3-step onboarding from scratch.',
    defaultTab: 'train',
  },
  {
    id: 'starter-day1-calibrated',
    category: 'Onboarding & Plan',
    title: 'Day 1 Calibrated (No History)',
    summary: 'Post-onboarding 6-Week Starter Plan with 1 weigh-in and calibrated opening loads.',
    defaultTab: 'train',
  },
  {
    id: 'mid-plan-normal',
    category: 'Onboarding & Plan',
    title: 'Mid-Plan Progressing (Wk 3)',
    summary: '4-day Upper/Lower mid-cycle (10/24 done), 6-week weigh-ins & charts.',
    defaultTab: 'train',
  },
  {
    id: 'returning-cycle-2',
    category: 'Onboarding & Plan',
    title: 'Cycle Complete -> Cycle 2',
    summary: 'All 18 lifts + 6 active days finished; begins Cycle 2 with carry-over PRs.',
    defaultTab: 'program',
  },
  {
    id: 'recovery-gate-blocked',
    category: 'Recovery & Readiness',
    title: 'Recovery Gate (Muscles Resting)',
    summary: 'Trained yesterday evening; Workout tab blocks early repeat and offers Train anyway.',
    defaultTab: 'train',
  },
  {
    id: 'amber-shield',
    category: 'Recovery & Readiness',
    title: 'Amber Shield Low Readiness',
    summary: 'Low HRV & short sleep; conservative 2-3 RIR targets and held weights.',
    defaultTab: 'train',
  },
  {
    id: 'primed-progression',
    category: 'Recovery & Readiness',
    title: 'Primed + Double Progression',
    summary: 'High readiness + prior sets topped out -> auto weight step-up & rep reset.',
    defaultTab: 'train',
  },
  {
    id: 'today-finished',
    category: 'Recovery & Readiness',
    title: 'Today Finished (Summary)',
    summary: 'Session completed today; shows duration, volume summary & next recovery countdown.',
    defaultTab: 'train',
  },
  {
    id: 'home-gym',
    category: 'Location & Units',
    title: 'Home Gym (Dumbbells + Bench)',
    summary: 'Commercial-gym history adapted to home kit with dumbbell load conversion.',
    defaultTab: 'train',
  },
  {
    id: 'travel-bodyweight',
    category: 'Location & Units',
    title: 'Travel (Bodyweight Only)',
    summary: 'All exercises swapped to bodyweight hotel variations without losing progress.',
    defaultTab: 'train',
  },
  {
    id: 'imperial-lb',
    category: 'Location & Units',
    title: 'Imperial Pounds (lb) Mode',
    summary: 'All displayed weights, charts, plates & unstarted targets snapped to lb increments.',
    defaultTab: 'train',
  },
  {
    id: 'strength-imbalances-female',
    category: 'Standards & Cardio',
    title: 'Female 40+ Standards & Asymmetry',
    summary: 'Kilgore 40-49 female tables, Tested <=5 rep PRs, Poliquin chin-up lag & L/R imbalance.',
    defaultTab: 'analytics',
  },
  {
    id: 'active-days-wearables',
    category: 'Standards & Cardio',
    title: 'Active Days + Watch/Strava',
    summary: '3-4 day lift gaps kept alive by cardio activities + Pixel Watch Vitality score.',
    defaultTab: 'analytics',
  },
];

const LOCAL_SCENARIO_STORAGE_KEY = 'treise_local_active_scenario_v1';
export const LOCAL_PENDING_TAB_KEY = 'treise_local_pending_tab_v1';

function daysAgoDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return localDateString(d);
}

function localTimestampOnDaysAgo(daysAgo: number, hour = 18, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  if (daysAgo === 0 && d.getTime() > Date.now()) {
    const safe = new Date(Math.max(Date.now() - 45 * 60 * 1000, new Date().setHours(0, 5, 0, 0)));
    return safe.toISOString();
  }
  return d.toISOString();
}

function steadyBiometrics(
  days = 42,
  opts: {
    startWeight?: number;
    endWeight?: number;
    todayPreset?: ReadinessState;
    todayWeightKg?: number;
    source?: BiometricLog['source'];
  } = {}
): BiometricLog[] {
  const startW = opts.startWeight ?? 81.4;
  const endW = opts.endWeight ?? 82.8;
  const logs: BiometricLog[] = [];
  for (let i = 0; i <= days; i++) {
    const dAgo = days - i;
    const date = daysAgoDateStr(dAgo);
    const frac = days > 0 ? i / days : 1;
    const w = Math.round((startW + (endW - startW) * frac + Math.sin(i * 1.4) * 0.25) * 10) / 10;
    const isToday = dAgo === 0;
    let hrv = 61 + Math.round(Math.sin(i * 0.7) * 5);
    let rhr = 55 + Math.round(Math.cos(i * 0.5) * 2);
    let sleep = Math.round((7.4 + Math.sin(i * 0.4) * 0.4) * 10) / 10;
    if (isToday && opts.todayPreset === 'Primed') {
      hrv = 86;
      rhr = 48;
      sleep = 8.7;
    } else if (isToday && opts.todayPreset === 'Amber Shield') {
      hrv = 32;
      rhr = 70;
      sleep = 4.7;
    } else if (isToday && opts.todayPreset === 'Normal') {
      hrv = 62;
      rhr = 55;
      sleep = 7.5;
    }
    logs.push({
      date,
      bodyweightKg: isToday && opts.todayWeightKg ? opts.todayWeightKg : w,
      hrvRmssd: hrv,
      restingHr: rhr,
      sleepHours: sleep,
      steps: 8600 + (i % 4) * 900,
      activeZoneMinutes: 34 + (i % 3) * 10,
      vo2Max: Math.round((45.2 + frac * 1.5) * 10) / 10,
      source: opts.source === undefined ? 'fitbit' : opts.source,
      isManualEntry: i % 7 === 0 || isToday,
    });
  }
  return logs;
}

export function applyReadinessPresetToBiometrics(
  logs: BiometricLog[],
  preset: ReadinessState,
  fallbackBodyweightKg = 82
): BiometricLog[] {
  const today = localDateString();
  const base = logs.length > 0 ? [...logs] : steadyBiometrics(14, { startWeight: fallbackBodyweightKg, endWeight: fallbackBodyweightKg });
  const lastBw = base[base.length - 1]?.bodyweightKg || fallbackBodyweightKg;
  const values =
    preset === 'Primed'
      ? { hrvRmssd: 86, restingHr: 48, sleepHours: 8.7, readinessScore: 91 }
      : preset === 'Amber Shield'
      ? { hrvRmssd: 32, restingHr: 70, sleepHours: 4.7, readinessScore: 31 }
      : { hrvRmssd: 62, restingHr: 55, sleepHours: 7.5, readinessScore: 72 };
  const idx = base.findIndex((b) => b.date === today);
  if (idx >= 0) {
    base[idx] = { ...base[idx], ...values };
  } else {
    base.push({
      date: today,
      bodyweightKg: lastBw,
      steps: 8400,
      activeZoneMinutes: 35,
      vo2Max: 46,
      source: 'fitbit',
      isManualEntry: true,
      ...values,
    });
  }
  return base;
}

function buildCompletedPlanWorkouts(params: {
  plan: TrainingPlan;
  liftCount: number;
  dayOffsets: number[];
  profile: UserProfile;
  bodyweightKg: number;
  readiness?: ReadinessState;
  hitTopOfRangeOnLast?: boolean;
  includeLastAsToday?: boolean;
}): WorkoutSession[] {
  const liftTemplates = params.plan.templates.filter((t) => t.kind !== 'active');
  const count = Math.min(params.liftCount, liftTemplates.length);
  const completed: WorkoutSession[] = [];

  for (let i = 0; i < count; i++) {
    const tmpl = liftTemplates[i];
    const daysAgo = params.dayOffsets[i] ?? Math.max(2, (count - i) * 2);
    const isLast = i === count - 1;
    const endHour = isLast && params.includeLastAsToday ? Math.max(0, new Date().getHours() - 1) : 18;
    const completedAt = localTimestampOnDaysAgo(daysAgo, endHour, 15);
    const startMs = new Date(completedAt).getTime() - 46 * 60 * 1000;
    const date = localDateString(new Date(completedAt));

    const generated = generatePlanWorkout(params.plan, tmpl.workoutNumber);
    const prepared = prepareSessionForAthlete(generated, {
      history: completed,
      bodyweightKg: params.bodyweightKg,
      readinessState: params.readiness || 'Normal',
      gender: params.profile.gender,
      experienceLevel: params.profile.experienceLevel || 'intermediate',
      unit: params.profile.weightUnit || 'kg',
      isProgramPlan: true,
    });

    completed.push({
      ...prepared,
      id: `local-w-${params.plan.id}-${tmpl.workoutNumber}-${i}`,
      date,
      completed: true,
      startedAt: new Date(startMs).toISOString(),
      completedAt,
      durationMinutes: 46,
      location: params.profile.activeLocation || 'gym',
      readinessState: params.readiness || 'Normal',
      exercises: prepared.exercises.map((ex) => {
        const range = tmpl.exercises.find((te) => te.exerciseId === ex.exerciseId)?.reps;
        const topMatch = range?.match(/(\d+)-(\d+)/);
        const topReps = topMatch ? parseInt(topMatch[2], 10) : 10;
        return {
          ...ex,
          sets: ex.sets.map((s) => ({
            ...s,
            completed: true,
            completedAt,
            actualWeightKg: s.targetWeightKg,
            actualReps: params.hitTopOfRangeOnLast && i >= count - 2 ? topReps : s.targetReps,
            actualRir: params.hitTopOfRangeOnLast && i >= count - 2 ? 1 : s.targetRir ?? 2,
          })),
        };
      }),
    });
  }
  return completed;
}

function buildNextPreparedWorkout(params: {
  plan: TrainingPlan;
  workoutNumber: number;
  history: WorkoutSession[];
  profile: UserProfile;
  bodyweightKg: number;
  readiness: ReadinessState;
}): WorkoutSession {
  const base = generatePlanWorkout(params.plan, params.workoutNumber);
  const location: TrainingLocation = params.profile.activeLocation || 'gym';
  const placed =
    location !== 'gym'
      ? adaptWorkoutSessionToLocation(
          base,
          location,
          params.profile.homeEquipment || [],
          SEED_EXERCISES,
          params.history,
          params.readiness,
          params.bodyweightKg
        )
      : base;
  return prepareSessionForAthlete(placed, {
    history: params.history,
    bodyweightKg: params.bodyweightKg,
    readinessState: params.readiness,
    gender: params.profile.gender,
    experienceLevel: params.profile.experienceLevel || 'intermediate',
    unit: params.profile.weightUnit || 'kg',
    isProgramPlan: true,
  });
}

function persistScenarioState(state: AppliedScenarioState): AppliedScenarioState {
  clearAuthUser();
  saveProfile(state.profile);
  saveBiometrics(state.biometrics);
  saveWorkouts(state.workouts);
  saveActiveWorkout(state.activeWorkout);
  saveExercises(state.exercises);
  saveActivities(state.activities);
  try {
    localStorage.setItem(LOCAL_SCENARIO_STORAGE_KEY, state.meta.id);
  } catch {
    // ignore storage errors in restricted environments
  }
  return state;
}

export function getActiveLocalScenarioId(): LocalScenarioId | null {
  try {
    const val = localStorage.getItem(LOCAL_SCENARIO_STORAGE_KEY) as LocalScenarioId | null;
    if (val && SCENARIO_LIST.some((s) => s.id === val)) return val;
  } catch {
    // ignore
  }
  return null;
}

export function buildScenarioState(scenarioId: LocalScenarioId): AppliedScenarioState {
  const meta = SCENARIO_LIST.find((s) => s.id === scenarioId) || SCENARIO_LIST[2];
  const baseGymProfile: UserProfile = {
    ...SAMPLE_DEMO_PROFILE,
    name: 'Alex Vance',
    programType: 'starter_6wk',
    goalPhase: 'Lean Bulk' as GoalPhase,
    experienceLevel: 'intermediate',
    age: 29,
    ageEntered: true,
    weightUnit: 'kg',
    activeLocation: 'gym',
    homeEquipment: ['bench', 'dumbbells', 'pullup_bar'] as HomeEquipmentTag[],
    onboardingCompleted: true,
  };

  if (scenarioId === 'fresh-onboarding') {
    const wiped = permanentlyEraseAllUserData();
    const profile: UserProfile = { ...NEW_USER_PROFILE, onboardingCompleted: false };
    return {
      meta,
      profile,
      biometrics: [],
      workouts: [],
      activeWorkout: wiped.activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: true,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'starter-day1-calibrated') {
    const profile: UserProfile = {
      ...NEW_USER_PROFILE,
      name: 'Samira Patel',
      gender: 'female',
      age: 27,
      ageEntered: true,
      heightCm: 168,
      goalPhase: 'Lean Bulk',
      programType: 'starter_6wk',
      experienceLevel: 'new',
      weightUnit: 'kg',
      onboardingCompleted: true,
      lastWorkoutDate: undefined,
    };
    const bw = 64;
    const biometrics: BiometricLog[] = [
      {
        date: localDateString(),
        bodyweightKg: bw,
        hrvRmssd: 0,
        restingHr: 0,
        sleepHours: 0,
        steps: 0,
        activeZoneMinutes: 0,
        isManualEntry: true,
      },
    ];
    const plan = getPlanById('starter_6wk', profile.goalPhase);
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: 1,
      history: [],
      profile,
      bodyweightKg: bw,
      readiness: 'Normal',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts: [],
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'mid-plan-normal') {
    const profile: UserProfile = {
      ...baseGymProfile,
      programType: 'starter_4day' as ProgramSplitType,
      mesocycleWeek: 3,
      lastWorkoutDate: daysAgoDateStr(2),
    };
    const biometrics = steadyBiometrics(42, { todayPreset: 'Normal' });
    const plan = getPlanById('starter_4day', profile.goalPhase);
    const offsets = [26, 24, 21, 19, 17, 14, 12, 9, 6, 3];
    const workouts = buildCompletedPlanWorkouts({
      plan,
      liftCount: 10,
      dayOffsets: offsets,
      profile,
      bodyweightKg: 82.5,
      readiness: 'Normal',
    });
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: 11,
      history: workouts,
      profile,
      bodyweightKg: 82.5,
      readiness: 'Normal',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'recovery-gate-blocked') {
    const profile: UserProfile = {
      ...baseGymProfile,
      programType: 'starter_6wk',
      mesocycleWeek: 1,
      lastWorkoutDate: daysAgoDateStr(1),
    };
    const biometrics = steadyBiometrics(14, { todayPreset: 'Normal' });
    const plan = getPlanById('starter_6wk', profile.goalPhase);
    // Completed Full Body A yesterday -> Chest & Quads still recovering today (< 54h), trainedToday === false
    const workouts = buildCompletedPlanWorkouts({
      plan,
      liftCount: 1,
      dayOffsets: [1],
      profile,
      bodyweightKg: 82,
      readiness: 'Normal',
    });
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: 2,
      history: workouts,
      profile,
      bodyweightKg: 82,
      readiness: 'Normal',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'amber-shield') {
    const profile: UserProfile = {
      ...baseGymProfile,
      programType: 'starter_4day',
      mesocycleWeek: 2,
      lastWorkoutDate: daysAgoDateStr(4),
    };
    const biometrics = steadyBiometrics(21, { todayPreset: 'Amber Shield' });
    const plan = getPlanById('starter_4day', profile.goalPhase);
    // 6 workouts done, last one 4 days ago so muscles are ready -> Amber Shield governs workout loads cleanly
    const workouts = buildCompletedPlanWorkouts({
      plan,
      liftCount: 6,
      dayOffsets: [16, 14, 11, 9, 6, 4],
      profile,
      bodyweightKg: 82.2,
      readiness: 'Normal',
    });
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: 7,
      history: workouts,
      profile,
      bodyweightKg: 82.2,
      readiness: 'Amber Shield',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'primed-progression') {
    const profile: UserProfile = {
      ...baseGymProfile,
      programType: 'starter_6wk',
      mesocycleWeek: 2,
      lastWorkoutDate: daysAgoDateStr(4),
    };
    const biometrics = steadyBiometrics(21, { todayPreset: 'Primed' });
    const plan = getPlanById('starter_6wk', profile.goalPhase);
    // 4 completed workouts (A, B, A, B), ending 4 days ago so muscles are fully recovered;
    // the next lift (#6) is Full Body A, stepping up from #3's top-of-range sets.
    const workouts = buildCompletedPlanWorkouts({
      plan,
      liftCount: 4,
      dayOffsets: [13, 10, 7, 4],
      profile,
      bodyweightKg: 82.4,
      readiness: 'Primed',
      hitTopOfRangeOnLast: true,
    });
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: 6,
      history: workouts,
      profile,
      bodyweightKg: 82.4,
      readiness: 'Primed',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'today-finished') {
    const profile: UserProfile = {
      ...baseGymProfile,
      programType: 'starter_6wk',
      mesocycleWeek: 2,
      lastWorkoutDate: localDateString(),
    };
    const biometrics = steadyBiometrics(21, { todayPreset: 'Primed' });
    const plan = getPlanById('starter_6wk', profile.goalPhase);
    const workouts = buildCompletedPlanWorkouts({
      plan,
      liftCount: 5,
      dayOffsets: [12, 9, 6, 3, 0],
      profile,
      bodyweightKg: 82.4,
      readiness: 'Primed',
      includeLastAsToday: true,
    });
    const nextNum = 6;
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: nextNum,
      history: workouts,
      profile,
      bodyweightKg: 82.4,
      readiness: 'Primed',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'returning-cycle-2') {
    const profile: UserProfile = {
      ...baseGymProfile,
      programType: 'starter_6wk',
      mesocycleWeek: 6,
      lastWorkoutDate: daysAgoDateStr(4),
    };
    const biometrics = steadyBiometrics(45, { startWeight: 80.2, endWeight: 82.9, todayPreset: 'Normal' });
    const plan = getPlanById('starter_6wk', profile.goalPhase);
    const offsets = Array.from({ length: 18 }, (_, idx) => 43 - Math.round((idx * 39) / 17));
    const workouts = buildCompletedPlanWorkouts({
      plan,
      liftCount: 18,
      dayOffsets: offsets,
      profile,
      bodyweightKg: 82.9,
      readiness: 'Normal',
    });
    const activities: ActivityLog[] = [0, 1, 2, 3, 4, 5].map((wk) => {
      const d = daysAgoDateStr(38 - wk * 7);
      return {
        id: `local-act-c1-${wk}`,
        date: d,
        startedAt: `${d}T09:00:00.000Z`,
        minutes: 35,
        type: wk % 2 === 0 ? 'run' : 'cycle',
        source: 'manual',
        name: wk % 2 === 0 ? 'Steady Recovery Run' : 'Zone 2 Bike Ride',
      };
    });
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: 1,
      history: workouts,
      profile,
      bodyweightKg: 82.9,
      readiness: 'Normal',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities,
      onboardingOpen: false,
      activeTab: 'program',
    };
  }

  if (scenarioId === 'home-gym' || scenarioId === 'travel-bodyweight' || scenarioId === 'imperial-lb') {
    const isTravel = scenarioId === 'travel-bodyweight';
    const isLb = scenarioId === 'imperial-lb';
    const profile: UserProfile = {
      ...baseGymProfile,
      programType: isTravel ? 'starter_6wk' : 'starter_4day',
      mesocycleWeek: 2,
      activeLocation: isTravel ? 'travel' : isLb ? 'gym' : 'home',
      homeEquipment: ['bench', 'dumbbells', 'pullup_bar'],
      weightUnit: isLb ? 'lb' : 'kg',
      lastWorkoutDate: daysAgoDateStr(3),
    };
    const biometrics = steadyBiometrics(21, { todayPreset: 'Normal' });
    const plan = getPlanById(profile.programType === 'starter_4day' ? 'starter_4day' : 'starter_6wk', profile.goalPhase);
    const workouts = buildCompletedPlanWorkouts({
      plan,
      liftCount: 5,
      dayOffsets: [16, 13, 10, 7, 3],
      profile: { ...profile, activeLocation: 'gym' },
      bodyweightKg: 82,
      readiness: 'Normal',
    });
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: profile.programType === 'starter_4day' ? 6 : 7,
      history: workouts,
      profile,
      bodyweightKg: 82,
      readiness: 'Normal',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'train',
    };
  }

  if (scenarioId === 'strength-imbalances-female') {
    const bw = 62;
    const goalBench = makeCustomGoal('ex-bench-press', 'Barbell Bench Press', 'weight', 65, daysAgoDateStr(21));
    const goalSquat = makeCustomGoal('ex-barbell-squat', 'Barbell Back Squat', 'weight', 100, daysAgoDateStr(21));
    const profile: UserProfile = {
      ...baseGymProfile,
      name: 'Claire Morgan',
      gender: 'female',
      age: 42,
      ageEntered: true,
      heightCm: 165,
      programType: 'starter_4day',
      goalPhase: 'Cut / Recomp',
      mesocycleWeek: 3,
      goalSettings: {
        customGoals: [goalBench, goalSquat].filter((g): g is NonNullable<typeof g> => Boolean(g)),
      },
      lastWorkoutDate: daysAgoDateStr(3),
    };
    const biometrics = steadyBiometrics(28, { startWeight: 63.8, endWeight: bw, todayWeightKg: bw, todayPreset: 'Normal' });
    const makeTestSession = (id: string, daysAgo: number, exSessions: WorkoutSession['exercises']): WorkoutSession => {
      const completedAt = localTimestampOnDaysAgo(daysAgo, 17, 30);
      return {
        id,
        name: 'Strength & Balance Check',
        splitDay: 'Upper',
        date: localDateString(new Date(completedAt)),
        completed: true,
        startedAt: new Date(new Date(completedAt).getTime() - 45 * 60 * 1000).toISOString(),
        completedAt,
        durationMinutes: 45,
        readinessState: 'Normal',
        readinessZScore: 0,
        location: 'gym',
        planId: 'starter_4day',
        programWorkoutNumber: Math.max(1, 7 - Math.floor(daysAgo / 3)),
        exercises: exSessions,
      };
    };

    const asymmetricBlock = (daysAgo: number): WorkoutSession =>
      makeTestSession(`local-asym-${daysAgo}`, daysAgo, [
        {
          id: `ex-sq-${daysAgo}`,
          exerciseId: 'ex-barbell-squat',
          name: 'Barbell Back Squat',
          pillar: 'Squat',
          equipment: 'barbell',
          minReps: 3,
          maxReps: 5,
          sets: [{ id: `s1-${daysAgo}`, setNumber: 1, targetWeightKg: 85, targetReps: 4, targetRir: 1, actualWeightKg: 85, actualReps: 4, actualRir: 1, completed: true }],
        },
        {
          id: `ex-bp-${daysAgo}`,
          exerciseId: 'ex-bench-press',
          name: 'Barbell Bench Press',
          pillar: 'Horizontal Push',
          equipment: 'barbell',
          minReps: 3,
          maxReps: 5,
          sets: [{ id: `b1-${daysAgo}`, setNumber: 1, targetWeightKg: 57.5, targetReps: 4, targetRir: 1, actualWeightKg: 57.5, actualReps: 4, actualRir: 1, completed: true }],
        },
        {
          id: `ex-dl-${daysAgo}`,
          exerciseId: 'ex-deadlift',
          name: 'Conventional Deadlift',
          pillar: 'Hinge',
          equipment: 'barbell',
          minReps: 3,
          maxReps: 5,
          sets: [{ id: `d1-${daysAgo}`, setNumber: 1, targetWeightKg: 105, targetReps: 3, targetRir: 1, actualWeightKg: 105, actualReps: 3, actualRir: 1, completed: true }],
        },
        {
          id: `ex-ohp-${daysAgo}`,
          exerciseId: 'ex-ohp',
          name: 'Overhead Press',
          pillar: 'Vertical Push',
          equipment: 'barbell',
          minReps: 3,
          maxReps: 5,
          sets: [{ id: `o1-${daysAgo}`, setNumber: 1, targetWeightKg: 37.5, targetReps: 4, targetRir: 1, actualWeightKg: 37.5, actualReps: 4, actualRir: 1, completed: true }],
        },
        {
          id: `ex-cu-${daysAgo}`,
          exerciseId: 'ex-chinup',
          name: 'Chin-Ups',
          pillar: 'Vertical Pull',
          equipment: 'weighted_bodyweight',
          isWeightedCalisthenic: true,
          minReps: 3,
          maxReps: 8,
          sets: [{ id: `c1-${daysAgo}`, setNumber: 1, targetWeightKg: 0, targetReps: 3, targetRir: 1, actualWeightKg: 0, actualReps: 2, actualRir: 1, completed: true }],
        },
        {
          id: `ex-bss-${daysAgo}`,
          exerciseId: 'ex-bulgarian-split-squat',
          name: 'Dumbbell Bulgarian Split Squat',
          pillar: 'Squat',
          equipment: 'dumbbell',
          minReps: 8,
          maxReps: 12,
          sets: [
            {
              id: `u1-${daysAgo}`,
              setNumber: 1,
              targetWeightKg: 24,
              targetReps: 10,
              targetRir: 1,
              actualWeightKg: 24,
              actualReps: 6,
              actualRepsLeft: 6,
              actualRepsRight: 10,
              actualRir: 1,
              completed: true,
            },
          ],
        },
      ]);

    const workouts = [asymmetricBlock(12), asymmetricBlock(7), asymmetricBlock(3)];
    const plan = getPlanById('starter_4day', profile.goalPhase);
    const activeWorkout = buildNextPreparedWorkout({
      plan,
      workoutNumber: 6,
      history: workouts,
      profile,
      bodyweightKg: bw,
      readiness: 'Normal',
    });
    return {
      meta,
      profile,
      biometrics,
      workouts,
      activeWorkout,
      exercises: SEED_EXERCISES,
      activities: [],
      onboardingOpen: false,
      activeTab: 'analytics',
    };
  }

  // Fallback / active-days-wearables
  const activeProfile: UserProfile = {
    ...baseGymProfile,
    programType: 'starter_6wk',
    goalPhase: 'Maingain',
    mesocycleWeek: 3,
    wearableSource: 'fitbit',
    fitbitConnected: true,
    stravaConnected: true,
    lastWorkoutDate: daysAgoDateStr(3),
  };
  const biometrics = generateSeedBiometrics();
  const plan = getPlanById('starter_6wk', activeProfile.goalPhase);
  const workouts = buildCompletedPlanWorkouts({
    plan,
    liftCount: 6,
    dayOffsets: [21, 17, 14, 10, 6, 3],
    profile: activeProfile,
    bodyweightKg: 82.4,
    readiness: 'Primed',
  });
  const activities: ActivityLog[] = [
    { id: 'act-1', date: daysAgoDateStr(19), startedAt: `${daysAgoDateStr(19)}T07:30:00Z`, minutes: 34, type: 'run', source: 'strava', name: 'Easy 5K Tempo', distanceKm: 5.2, avgHeartRate: 146 },
    { id: 'act-2', date: daysAgoDateStr(12), startedAt: `${daysAgoDateStr(12)}T08:00:00Z`, minutes: 42, type: 'cycle', source: 'health_connect', name: 'Zone 2 Spin', distanceKm: 16.4, avgHeartRate: 132 },
    { id: 'act-3', date: daysAgoDateStr(5), startedAt: `${daysAgoDateStr(5)}T18:10:00Z`, minutes: 38, type: 'walk', source: 'manual', name: 'Brisk Evening Walk', distanceKm: 3.1 },
    { id: 'act-4', date: daysAgoDateStr(1), startedAt: `${daysAgoDateStr(1)}T07:45:00Z`, minutes: 28, type: 'run', source: 'strava', name: 'Morning Flush Run', distanceKm: 4.5, avgHeartRate: 141 },
  ];
  const activeWorkout = buildNextPreparedWorkout({
    plan,
    workoutNumber: 9,
    history: workouts,
    profile: activeProfile,
    bodyweightKg: 82.4,
    readiness: 'Primed',
  });
  return {
    meta,
    profile: activeProfile,
    biometrics,
    workouts,
    activeWorkout,
    exercises: SEED_EXERCISES,
    activities,
    onboardingOpen: false,
    activeTab: 'analytics',
  };
}

export function applyLocalTestScenario(scenarioId: LocalScenarioId): AppliedScenarioState {
  return persistScenarioState(buildScenarioState(scenarioId));
}

export function maybeApplyScenarioFromUrl(): AppliedScenarioState | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('scenario') as LocalScenarioId | null;
  if (!requested) return null;
  if (!SCENARIO_LIST.some((s) => s.id === requested)) return null;
  const applied = applyLocalTestScenario(requested);
  if (!params.has('tab') && applied.activeTab !== 'train') {
    try {
      sessionStorage.setItem(LOCAL_PENDING_TAB_KEY, applied.activeTab);
    } catch {
      // ignore
    }
  }
  return applied;
}
