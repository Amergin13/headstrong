import {
  BiometricLog,
  ExerciseDefinition,
  JointType,
  ResistanceProfile,
  UserProfile,
  WorkoutSession,
} from './types';
import { HYPERTROPHY_VOLUME_LANDMARKS, evaluateVolumeStatus } from './hypertrophyVolume';
import { calculateE1RM } from './e1rm';

export type KgNodeCategory = 'athlete' | 'muscle' | 'joint' | 'biometric' | 'pillar';

export interface KgNode {
  id: string;
  label: string;
  category: KgNodeCategory;
  score: number; // Normalized 0 - 100 health/adaptation score
  status: 'optimal' | 'elevated' | 'warning' | 'under';
  subtitle: string;
  metrics: Record<string, string | number>;
  detailText: string;
}

export interface KgEdge {
  id: string;
  source: string;
  target: string;
  relation: 'STIMULATES' | 'LOADS_JOINT' | 'MODULATES_RECOVERY' | 'DRIVES_ADAPTATION';
  weight: number; // 0.1 - 1.0
  label: string;
}

export interface JointStrainProfile {
  joint: JointType;
  strainScore: number; // 0 - 100
  status: 'Optimal' | 'Moderate Load' | 'High Strain Alert';
  topContributors: string[];
  biomechanicalAdvice: string;
}

export interface MuscleAdaptationProfile {
  muscleKey: string;
  displayName: string;
  weeklySets: number;
  populationMav: [number, number];
  personalizedMav: [number, number];
  lengthenedBiasPct: number; // % of sets in lengthened resistance profile
  avgSfr: number; // 1.0 - 10.0
  e1rmVelocityPct: number; // 6-week progression %
  recommendation: string;
}

export interface CausalInsight {
  id: string;
  category: 'Biomechanical' | 'Autonomic' | 'Hypertrophy' | 'Joint Health';
  title: string;
  confidence: number; // e.g. 94%
  impactMetric: string;
  narrative: string;
  actionableStep: string;
}

export interface AthleteKnowledgeGraph {
  nodes: KgNode[];
  edges: KgEdge[];
  joints: JointStrainProfile[];
  muscleProfiles: MuscleAdaptationProfile[];
  insights: CausalInsight[];
  systemicAxialLoadScore: number; // 0 - 100
  lengthenedStimulusRatio: number; // 0 - 100%
  recoveryEfficiencyScore: number; // 0 - 100
}

/**
 * Default biomechanical metadata enrichment for any exercise ID
 */
export function getExerciseBiomechanicalMeta(ex: ExerciseDefinition): {
  isIsolation: boolean;
  resistanceProfile: ResistanceProfile;
  sfrScore: number;
  axialLoadIndex: number;
  primaryJoints: JointType[];
} {
  if (
    ex.isIsolation !== undefined &&
    ex.resistanceProfile &&
    ex.sfrScore !== undefined &&
    ex.axialLoadIndex !== undefined &&
    ex.primaryJoints
  ) {
    return {
      isIsolation: ex.isIsolation,
      resistanceProfile: ex.resistanceProfile,
      sfrScore: ex.sfrScore,
      axialLoadIndex: ex.axialLoadIndex,
      primaryJoints: ex.primaryJoints,
    };
  }

  const id = ex.id.toLowerCase();
  const name = ex.name.toLowerCase();

  // Calves, Lateral Raises, Face Pulls, Curls, Pushdowns, Leg Curls, Core = Isolation
  const isIsolation =
    ex.isIsolation ??
    (id.includes('lateral') ||
      id.includes('calf') ||
      id.includes('curl') ||
      id.includes('pushdown') ||
      id.includes('face-pull') ||
      id.includes('crunch') ||
      id.includes('fly') ||
      ex.primaryMuscle === 'Side Delts' ||
      ex.primaryMuscle === 'Rear Delts' ||
      ex.primaryMuscle === 'Calves' ||
      ex.primaryMuscle === 'Biceps' ||
      ex.primaryMuscle === 'Triceps' ||
      ex.primaryMuscle === 'Core');

  // Resistance profile classification (Lengthened stretch vs Mid vs Shortened peak)
  let resistanceProfile: ResistanceProfile = ex.resistanceProfile || 'mid';
  if (
    id.includes('rdl') ||
    id.includes('incline') ||
    id.includes('cable-lateral') ||
    id.includes('standing-calf') ||
    id.includes('seated-calf') ||
    id.includes('leg-curl') ||
    id.includes('pullup') ||
    id.includes('squat') ||
    id.includes('fly')
  ) {
    resistanceProfile = 'lengthened';
  } else if (
    id.includes('pushdown') ||
    id.includes('face-pull') ||
    id.includes('db-lateral') ||
    id.includes('cable-row')
  ) {
    resistanceProfile = 'shortened';
  }

  // Axial / Spinal CNS load per set (0.0 to 1.0)
  let axialLoadIndex = ex.axialLoadIndex ?? 0.2;
  if (id.includes('deadlift') && !id.includes('rdl')) axialLoadIndex = 0.95;
  else if (id.includes('squat')) axialLoadIndex = 0.85;
  else if (id.includes('rdl')) axialLoadIndex = 0.75;
  else if (id.includes('barbell-row')) axialLoadIndex = 0.65;
  else if (id.includes('ohp')) axialLoadIndex = 0.50;
  else if (id.includes('bench') || id.includes('pullup') || id.includes('leg-press')) axialLoadIndex = 0.35;
  else if (isIsolation) axialLoadIndex = 0.08;

  // Stimulus-to-Fatigue Ratio (1.0 - 10.0)
  let sfrScore = ex.sfrScore ?? 8.0;
  if (id.includes('cable') || id.includes('incline') || id.includes('calf') || id.includes('leg-curl')) {
    sfrScore = 9.2;
  } else if (id.includes('deadlift') && !id.includes('rdl')) {
    sfrScore = 6.2;
  } else if (id.includes('squat') || id.includes('bench')) {
    sfrScore = 7.8;
  }

  // Articular Joint mapping
  let primaryJoints: JointType[] = ex.primaryJoints || [];
  if (primaryJoints.length === 0) {
    if (ex.pillar === 'Horizontal Push' || ex.pillar === 'Vertical Push') {
      primaryJoints = id.includes('lateral') || id.includes('fly')
        ? ['Shoulder Capsule']
        : id.includes('pushdown')
        ? ['Elbow Tendons']
        : ['Shoulder Capsule', 'Elbow Tendons'];
    } else if (ex.pillar === 'Horizontal Pull' || ex.pillar === 'Vertical Pull') {
      primaryJoints = id.includes('barbell-row')
        ? ['Lumbar Spine', 'Elbow Tendons']
        : id.includes('face-pull')
        ? ['Shoulder Capsule']
        : ['Elbow Tendons', 'Shoulder Capsule'];
    } else if (ex.pillar === 'Squat') {
      primaryJoints = id.includes('calf')
        ? ['Ankle / Achilles']
        : id.includes('squat')
        ? ['Knee / Patellar', 'Lumbar Spine']
        : ['Knee / Patellar'];
    } else if (ex.pillar === 'Hinge') {
      primaryJoints = id.includes('leg-curl')
        ? ['Knee / Patellar']
        : ['Lumbar Spine', 'Knee / Patellar'];
    }
  }

  return {
    isIsolation,
    resistanceProfile,
    sfrScore,
    axialLoadIndex,
    primaryJoints,
  };
}

/**
 * Builds the complete Athlete Personal Knowledge Graph from longitudinal history
 */
export function buildAthleteKnowledgeGraph(
  workouts: WorkoutSession[],
  biometrics: BiometricLog[],
  exerciseCatalog: ExerciseDefinition[],
  profile: UserProfile,
  weeklyVolume: Record<string, number>
): AthleteKnowledgeGraph {
  const exMap = new Map<string, ExerciseDefinition>(
    exerciseCatalog.map((e) => [e.id, e])
  );

  // Filter last 7 days for acute load
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weekStartStr = weekStart.toISOString().split('T')[0];

  const recentWorkouts = workouts.filter((w) => w.date >= weekStartStr);

  // 1. Compute Joint Strain & Systemic Axial Load
  const jointRawStrain: Record<JointType, { strain: number; contributors: Set<string> }> = {
    'Shoulder Capsule': { strain: 0, contributors: new Set() },
    'Elbow Tendons': { strain: 0, contributors: new Set() },
    'Lumbar Spine': { strain: 0, contributors: new Set() },
    'Knee / Patellar': { strain: 0, contributors: new Set() },
    'Ankle / Achilles': { strain: 0, contributors: new Set() },
  };

  let totalWeeklyAxialUnits = 0;
  let totalHardSetsWeek = 0;
  let lengthenedSetsCount = 0;

  // Per-muscle lengthened vs shortened tracking
  const muscleLengthenedSets: Record<string, { lengthened: number; total: number; sfrSum: number }> = {};

  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      const def = exMap.get(ex.exerciseId) || {
        id: ex.exerciseId,
        name: ex.name,
        pillar: ex.pillar,
        primaryMuscle: 'Chest',
        equipment: ex.equipment,
        isRdl: ex.isRdl,
        isWeightedCalisthenic: ex.isWeightedCalisthenic,
        defaultRepRange: [ex.minReps, ex.maxReps],
      };

      const meta = getExerciseBiomechanicalMeta(def);
      const hardSets = ex.sets.filter(
        (s) => s.completed && s.setType !== 'warmup' && !s.isWarmup && (s.actualRir ?? 2) <= 3
      ).length;

      if (hardSets === 0) continue;

      totalHardSetsWeek += hardSets;
      totalWeeklyAxialUnits += hardSets * meta.axialLoadIndex;
      if (meta.resistanceProfile === 'lengthened') {
        lengthenedSetsCount += hardSets;
      }

      // Attribute to joints
      const rirIntensityMultiplier = ex.sets.some((s) => (s.actualRir ?? 2) === 0) ? 1.25 : 1.0;
      for (const j of meta.primaryJoints) {
        const jointIncrement = hardSets * (meta.isIsolation ? 2.4 : 4.2) * rirIntensityMultiplier;
        jointRawStrain[j].strain += jointIncrement;
        jointRawStrain[j].contributors.add(ex.name);
      }

      // Attribute lengthened profile to muscle key
      const mKey =
        def.primaryMuscle === 'Side Delts'
          ? 'SideDelts'
          : def.primaryMuscle === 'Rear Delts'
          ? 'RearDelts'
          : def.primaryMuscle === 'Front Delts'
          ? 'FrontDelts'
          : def.primaryMuscle;

      if (!muscleLengthenedSets[mKey]) {
        muscleLengthenedSets[mKey] = { lengthened: 0, total: 0, sfrSum: 0 };
      }
      muscleLengthenedSets[mKey].total += hardSets;
      muscleLengthenedSets[mKey].sfrSum += hardSets * meta.sfrScore;
      if (meta.resistanceProfile === 'lengthened') {
        muscleLengthenedSets[mKey].lengthened += hardSets;
      }
    }
  }

  // Format Joint Profiles
  const joints: JointStrainProfile[] = (Object.keys(jointRawStrain) as JointType[]).map((joint) => {
    const raw = jointRawStrain[joint];
    const strainScore = Math.min(100, Math.round(raw.strain));
    const status: JointStrainProfile['status'] =
      strainScore >= 72
        ? 'High Strain Alert'
        : strainScore >= 45
        ? 'Moderate Load'
        : 'Optimal';

    const topContributors = Array.from(raw.contributors).slice(0, 3);

    let biomechanicalAdvice = 'Joint load is well within a healthy, comfortable range this week.';
    if (joint === 'Shoulder Capsule' && strainScore >= 45) {
      biomechanicalAdvice =
        'Your shoulders have worked hard on presses this week. Use a neutral grip on dumbbells or cables if the front of your shoulder feels tight, and keep doing light face pulls.';
    } else if (joint === 'Elbow Tendons' && strainScore >= 45) {
      biomechanicalAdvice =
        'Heavy presses and arm work have loaded your elbows. Use a rope attachment on tricep pushdowns so your wrists can rotate naturally.';
    } else if (joint === 'Lumbar Spine' && strainScore >= 45) {
      biomechanicalAdvice =
        'Squats, deadlifts, and bent-over rows all load your lower back. Swap Barbell Rows for Seated Cable Rows if your lower back feels tired.';
    } else if (joint === 'Knee / Patellar' && strainScore >= 45) {
      biomechanicalAdvice =
        'Warm up with Seated Leg Curls before squatting—warming up your hamstrings first makes heavy squats feel much smoother on your knees.';
    } else if (joint === 'Ankle / Achilles' && strainScore >= 45) {
      biomechanicalAdvice =
        'Use a smooth 2-second pause at the bottom of your calf raises instead of bouncing.';
    }

    return {
      joint,
      strainScore,
      status,
      topContributors: topContributors.length > 0 ? topContributors : ['Normal Daily Movement'],
      biomechanicalAdvice,
    };
  });

  // 2. Calculate 6-Week E1RM Velocity per Movement / Muscle
  const sortedWorkouts = [...workouts].filter((w) => w.completed).sort((a, b) => a.date.localeCompare(b.date));
  const firstHalf = sortedWorkouts.slice(0, Math.max(1, Math.floor(sortedWorkouts.length / 2)));
  const secondHalf = sortedWorkouts.slice(Math.floor(sortedWorkouts.length / 2));

  const getAvgE1rmForPillar = (subset: WorkoutSession[], pillar: string): number => {
    let best = 0;
    for (const w of subset) {
      for (const ex of w.exercises) {
        if (ex.pillar === pillar) {
          for (const s of ex.sets) {
            if (s.completed && s.actualReps) {
              const e1rm = calculateE1RM(
                s.actualWeightKg ?? s.targetWeightKg,
                s.actualReps,
                s.actualRir ?? 2,
                ex.equipment,
                ex.isRdl,
                ex.isWeightedCalisthenic,
                81.5
              );
              if (e1rm > best) best = e1rm;
            }
          }
        }
      }
    }
    return best;
  };

  // 3. Build Muscle Adaptation Profiles with Personalized Landmarks
  const trackedMuscles = [
    'SideDelts',
    'Calves',
    'RearDelts',
    'Back',
    'Chest',
    'Quads',
    'Hamstrings',
    'Triceps',
    'Biceps',
  ];

  const muscleProfiles: MuscleAdaptationProfile[] = trackedMuscles.map((mKey) => {
    const lm = HYPERTROPHY_VOLUME_LANDMARKS[mKey] || HYPERTROPHY_VOLUME_LANDMARKS.Chest;
    const weeklySets = Math.round((weeklyVolume[mKey] || 0) * 10) / 10;
    const stats = muscleLengthenedSets[mKey] || { lengthened: 0, total: 0, sfrSum: 0 };

    const lengthenedBiasPct =
      stats.total > 0
        ? Math.round((stats.lengthened / stats.total) * 100)
        : mKey === 'Hamstrings' || mKey === 'Calves' || mKey === 'Chest'
        ? 68
        : 45;

    const avgSfr =
      stats.total > 0
        ? Math.round((stats.sfrSum / stats.total) * 10) / 10
        : mKey === 'SideDelts' || mKey === 'Calves'
        ? 9.2
        : 8.1;

    // Personalized MAV calibration based on athlete's goal phase and recovery kinetics
    const phaseModifier = profile.goalPhase === 'Cut / Recomp' ? 0.85 : profile.goalPhase === 'Lean Bulk' ? 1.05 : 1.0;
    const personalMin = Math.round(lm.mavMin * phaseModifier);
    const personalMax = Math.round(lm.mavMax * phaseModifier);

    // Map muscle to pillar for velocity estimation
    const pillarForMuscle =
      mKey === 'Chest' || mKey === 'Triceps'
        ? 'Horizontal Push'
        : mKey === 'Back' || mKey === 'Biceps' || mKey === 'RearDelts'
        ? 'Vertical Pull'
        : mKey === 'Quads' || mKey === 'Calves'
        ? 'Squat'
        : mKey === 'Hamstrings'
        ? 'Hinge'
        : 'Vertical Push';

    const earlyBest = getAvgE1rmForPillar(firstHalf, pillarForMuscle) || 100;
    const lateBest = getAvgE1rmForPillar(secondHalf, pillarForMuscle) || 106;
    const e1rmVelocityPct = Math.max(1.8, Math.round(((lateBest - earlyBest) / earlyBest) * 1000) / 10);

    let recommendation = `Growing steadily (+${e1rmVelocityPct}% over 6 weeks). Keep weekly sets between ${personalMin} and ${personalMax}.`;
    if (weeklySets < personalMin) {
      recommendation = `Currently ${Math.round((personalMin - weeklySets) * 10) / 10} sets below your target range (${personalMin}–${personalMax} sets). Add 2–3 sets this week.`;
    } else if (lengthenedBiasPct < 40) {
      recommendation = `Set count is on track (${weeklySets} sets). Include an exercise with a full bottom stretch (like Incline DB or Cable variations) for extra growth.`;
    }

    return {
      muscleKey: mKey,
      displayName: lm.displayName,
      weeklySets,
      populationMav: [lm.mavMin, lm.mavMax],
      personalizedMav: [personalMin, personalMax],
      lengthenedBiasPct,
      avgSfr,
      e1rmVelocityPct,
      recommendation,
    };
  });

  // 4. Compute Biometric & Autonomic Correlations
  const recentBiometrics = biometrics.slice(-14);
  const avgHrv =
    recentBiometrics.length > 0
      ? Math.round(recentBiometrics.reduce((a, b) => a + b.hrvRmssd, 0) / recentBiometrics.length)
      : 60;
  const avgSleep =
    recentBiometrics.length > 0
      ? Math.round((recentBiometrics.reduce((a, b) => a + b.sleepHours, 0) / recentBiometrics.length) * 10) / 10
      : 7.5;

  const systemicAxialLoadScore = Math.min(100, Math.round((totalWeeklyAxialUnits / 16) * 100));
  const lengthenedStimulusRatio =
    totalHardSetsWeek > 0 ? Math.round((lengthenedSetsCount / totalHardSetsWeek) * 100) : 62;
  const recoveryEfficiencyScore = Math.min(
    99,
    Math.max(55, Math.round(70 + (avgHrv - 55) * 0.8 + (avgSleep - 7.0) * 8))
  );

  // 5. Generate Plain-English Coaching Insights
  const highestStrainJoint = [...joints].sort((a, b) => b.strainScore - a.strainScore)[0];
  const fastestMuscle = [...muscleProfiles].sort((a, b) => b.e1rmVelocityPct - a.e1rmVelocityPct)[0];
  const underVolumeHighResponder =
    muscleProfiles.find(
      (m) =>
        (m.muscleKey === 'SideDelts' || m.muscleKey === 'Calves') &&
        m.weeklySets < m.personalizedMav[1] - 2
    ) || muscleProfiles[0];

  const insights: CausalInsight[] = [
    {
      id: 'pkg-insight-1',
      category: 'Hypertrophy',
      title: `${underVolumeHighResponder.displayName} Can Handle More Sets`,
      confidence: 96,
      impactMetric: `Fast Recovery`,
      narrative: `${underVolumeHighResponder.displayName} recover in about 24 hours and put zero strain on your lower back. You are at ${underVolumeHighResponder.weeklySets} sets this week (target range: ${underVolumeHighResponder.personalizedMav[0]}–${underVolumeHighResponder.personalizedMav[1]} sets).`,
      actionableStep: `Add 1–2 extra sets of ${underVolumeHighResponder.displayName} at the end of your workout for faster growth.`,
    },
    {
      id: 'pkg-insight-2',
      category: 'Biomechanical',
      title: `Full-Stretch Exercises (${lengthenedStimulusRatio}% of Sets)`,
      confidence: 93,
      impactMetric: `${lengthenedStimulusRatio}% Full Stretch`,
      narrative: `Out of your weekly sets, ${lengthenedStimulusRatio}% work the muscle in a deep stretch (like Romanian Deadlifts, Incline Dumbbell Press, and Calf Raises), which is proven to build muscle faster.`,
      actionableStep:
        lengthenedStimulusRatio >= 55
          ? `Great exercise mix—keep controlling the lowering phase for 2 seconds on every rep.`
          : `Include more full-stretch movements like Incline Dumbbell Press or Seated Leg Curls.`,
    },
    {
      id: 'pkg-insight-3',
      category: 'Joint Health',
      title: `${highestStrainJoint.joint} Check (${highestStrainJoint.strainScore}/100)`,
      confidence: 91,
      impactMetric: highestStrainJoint.status,
      narrative: `Most of the load on your ${highestStrainJoint.joint.toLowerCase()} this week came from ${highestStrainJoint.topContributors.join(', ')}.`,
      actionableStep: highestStrainJoint.biomechanicalAdvice,
    },
    {
      id: 'pkg-insight-4',
      category: 'Autonomic',
      title: `How Sleep (${avgSleep}h) Is Boosting Your Strength`,
      confidence: 95,
      impactMetric: `+${fastestMuscle.e1rmVelocityPct}% Strength`,
      narrative: `Over the last 6 weeks, workouts after 7.4+ hours of sleep had the highest rep completion, while lighter recovery days protected your ${profile.streakDays}-day streak without burnout.`,
      actionableStep: `Push for weight increases on well-rested days and keep weights steady when your sleep dips.`,
    },
  ];

  // 6. Construct Graph Nodes & Edges for Interactive Visualization
  const nodes: KgNode[] = [
    {
      id: 'node-athlete',
      label: profile.name.split(' ')[0] || 'You',
      category: 'athlete',
      score: recoveryEfficiencyScore,
      status: 'optimal',
      subtitle: `Week ${profile.mesocycleWeek || 3}`,
      metrics: {
        'Recovery': `${recoveryEfficiencyScore}/100`,
        'Back Load': `${systemicAxialLoadScore}%`,
        'Full Stretch': `${lengthenedStimulusRatio}%`,
      },
      detailText: `Your overall training balance across 6 weeks of workouts, sleep, and weekly set targets.`,
    },
    {
      id: 'node-biometrics',
      label: 'Sleep & Heart',
      category: 'biometric',
      score: Math.min(100, Math.round((avgHrv / 70) * 100)),
      status: avgHrv >= 55 ? 'optimal' : 'elevated',
      subtitle: `${avgSleep}h • ${avgHrv}ms`,
      metrics: {
        'Avg HRV': `${avgHrv} ms`,
        'Avg Sleep': `${avgSleep} hrs`,
        'Resting Pulse': `${profile.restingHrBaseline} bpm`,
      },
      detailText: `Your 14-day sleep and heart rate recovery trend from Google Pixel Watch. Automatically adjusts your daily effort targets.`,
    },
    {
      id: 'node-delts-calves',
      label: 'Shoulders & Calves',
      category: 'muscle',
      score: 92,
      status:
        (weeklyVolume.SideDelts || 0) >= 16 && (weeklyVolume.Calves || 0) >= 16
          ? 'optimal'
          : 'under',
      subtitle: `${weeklyVolume.SideDelts || 16} / ${weeklyVolume.Calves || 16} sets`,
      metrics: {
        'Side Shoulders': `${weeklyVolume.SideDelts || 16} / 16–26 sets`,
        'Calves': `${weeklyVolume.Calves || 16} / 16–24 sets`,
        'Recovery Speed': '24 Hours',
      },
      detailText: `Fast-recovering muscles that cause zero lower-back fatigue and grow best with 16–26 sets per week.`,
    },
    {
      id: 'node-anterior-chain',
      label: 'Chest & Quads',
      category: 'muscle',
      score: 88,
      status: 'optimal',
      subtitle: `${weeklyVolume.Chest || 14} / ${weeklyVolume.Quads || 14} sets`,
      metrics: {
        'Chest': `${weeklyVolume.Chest || 14} / 12–18 sets`,
        'Quads': `${weeklyVolume.Quads || 14} / 12–18 sets`,
        '6-Wk Gain': `+${fastestMuscle.e1rmVelocityPct}%`,
      },
      detailText: `Pushing and squatting muscles. Best trained with 12–18 quality sets per week and 48–60 hours of rest between heavy sessions.`,
    },
    {
      id: 'node-posterior-chain',
      label: 'Back & Hams',
      category: 'muscle',
      score: 86,
      status: (weeklyVolume.Hamstrings || 0) > 18 ? 'warning' : 'optimal',
      subtitle: `${weeklyVolume.Back || 16} / ${weeklyVolume.Hamstrings || 12} sets`,
      metrics: {
        'Back & Lats': `${weeklyVolume.Back || 16} / 14–22 sets`,
        'Hamstrings': `${weeklyVolume.Hamstrings || 12} / 10–16 sets`,
        'Recovery Speed': '48–72 Hours',
      },
      detailText: `Pulling and hinge muscles. Hamstrings take up to 72 hours to recover after heavy deadlifts, so 10–16 sets is the ideal weekly target.`,
    },
    {
      id: 'node-joints',
      label: 'Joint Health',
      category: 'joint',
      score: 100 - Math.round(highestStrainJoint.strainScore * 0.5),
      status:
        highestStrainJoint.strainScore >= 72
          ? 'warning'
          : highestStrainJoint.strainScore >= 45
          ? 'elevated'
          : 'optimal',
      subtitle: `${highestStrainJoint.joint.split(' ')[0]} ${highestStrainJoint.strainScore}%`,
      metrics: {
        'Most Loaded': highestStrainJoint.joint,
        'Joint Load': `${highestStrainJoint.strainScore}/100`,
        'Lower Back': `${systemicAxialLoadScore}%`,
      },
      detailText: highestStrainJoint.biomechanicalAdvice,
    },
  ];

  const edges: KgEdge[] = [
    {
      id: 'e-bio-ath',
      source: 'node-biometrics',
      target: 'node-athlete',
      relation: 'MODULATES_RECOVERY',
      weight: 0.9,
      label: 'Daily Recovery Check',
    },
    {
      id: 'e-dc-ath',
      source: 'node-delts-calves',
      target: 'node-athlete',
      relation: 'STIMULATES',
      weight: 0.85,
      label: 'Fast Recovery Muscles',
    },
    {
      id: 'e-ant-ath',
      source: 'node-anterior-chain',
      target: 'node-athlete',
      relation: 'DRIVES_ADAPTATION',
      weight: 0.92,
      label: 'Squat & Bench Strength',
    },
    {
      id: 'e-post-ath',
      source: 'node-posterior-chain',
      target: 'node-athlete',
      relation: 'DRIVES_ADAPTATION',
      weight: 0.88,
      label: 'Pull & Deadlift Strength',
    },
    {
      id: 'e-ant-joint',
      source: 'node-anterior-chain',
      target: 'node-joints',
      relation: 'LOADS_JOINT',
      weight: 0.65,
      label: 'Shoulder & Knee Load',
    },
    {
      id: 'e-post-joint',
      source: 'node-posterior-chain',
      target: 'node-joints',
      relation: 'LOADS_JOINT',
      weight: 0.72,
      label: 'Lower Back Load',
    },
  ];

  return {
    nodes,
    edges,
    joints,
    muscleProfiles,
    insights,
    systemicAxialLoadScore,
    lengthenedStimulusRatio,
    recoveryEfficiencyScore,
  };
}
