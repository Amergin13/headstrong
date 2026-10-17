/**
 * Authoritative Hypertrophy Volume Landmarks Engine
 * Based on peer-reviewed exercise science & physiology:
 * - Dr. Mike Israetel (Renaissance Periodization Volume Landmarks)
 * - Dr. Brad Schoenfeld (Science and Development of Muscle Hypertrophy)
 * - Dr. Eric Helms (Muscle and Strength Training Pyramids)
 * 
 * Replaces simplistic blanket volume recommendations with physiological,
 * muscle-specific Volume Landmarks:
 * - MV:  Maintenance Volume (preserve mass)
 * - MEV: Minimum Effective Volume (initiate adaptation)
 * - MAV: Maximum Adaptive Volume (optimal hypertrophic sweet spot)
 * - MRV: Maximum Recoverable Volume (fatigue ceiling / overreaching threshold)
 */

export interface MuscleVolumeLandmark {
  key: string;
  displayName: string;
  mv: number;        // Maintenance Volume (sets/week)
  mev: number;       // Minimum Effective Volume (sets/week)
  mavMin: number;    // Maximum Adaptive Volume lower boundary (sets/week)
  mavMax: number;    // Maximum Adaptive Volume upper boundary (sets/week)
  mrv: number;       // Maximum Recoverable Volume (sets/week)
  frequencyMin: number; // Minimum optimal frequency (days/week)
  frequencyMax: number; // Maximum optimal frequency (days/week)
  category: 'High Volume Responder' | 'Moderate Tolerance' | 'Fatigue / Damage Sensitive' | 'High Compound Crossover';
  recoveryKineticsHours: number; // Typical localized recovery window
  fiberProfile: string;
  scientificRationale: string;
  recommendedRepRanges: string;
}

export type VolumeStatus = 
  | 'below_mv'     // Under-stimulating, risk of atrophy
  | 'maintenance'  // Preserving existing tissue
  | 'effective'    // Above MEV, stimulating modest growth
  | 'optimal_mav'  // In the physiological sweet spot
  | 'near_mrv'     // High strain, approaching overreaching
  | 'above_mrv';   // Exceeded recovery capacity (negative returns / injury risk)

/**
 * Authoritative science-backed volume landmarks for every major muscle group
 */
export const HYPERTROPHY_VOLUME_LANDMARKS: Record<string, MuscleVolumeLandmark> = {
  SideDelts: {
    key: 'SideDelts',
    displayName: 'Side Shoulders',
    mv: 6,
    mev: 8,
    mavMin: 16,
    mavMax: 26,
    mrv: 30,
    frequencyMin: 3,
    frequencyMax: 5,
    category: 'High Volume Responder',
    recoveryKineticsHours: 24,
    fiberProfile: 'Endurance-friendly (recovers in ~24 hrs)',
    scientificRationale: 'Side shoulders put zero strain on your lower back and barely get worked during bench press. Because they recover within 24 hours, they grow best with higher weekly sets (16–26) across 3–5 workouts.',
    recommendedRepRanges: '12–20 reps (cable or dumbbell lateral raises)',
  },
  Calves: {
    key: 'Calves',
    displayName: 'Calves',
    mv: 6,
    mev: 8,
    mavMin: 16,
    mavMax: 24,
    mrv: 28,
    frequencyMin: 3,
    frequencyMax: 5,
    category: 'High Volume Responder',
    recoveryKineticsHours: 24,
    fiberProfile: 'High endurance (recovers in ~24 hrs)',
    scientificRationale: 'Your calves carry your body weight for thousands of steps every day. To make them grow, they need higher weekly volume (16–24 sets) and a 2-second pause in the bottom stretch on every rep.',
    recommendedRepRanges: '10–15 reps (standing), 12–20 reps (seated)',
  },
  RearDelts: {
    key: 'RearDelts',
    displayName: 'Rear Shoulders',
    mv: 6,
    mev: 8,
    mavMin: 14,
    mavMax: 22,
    mrv: 26,
    frequencyMin: 3,
    frequencyMax: 4,
    category: 'High Volume Responder',
    recoveryKineticsHours: 36,
    fiberProfile: 'Fast recovery (~36 hrs)',
    scientificRationale: 'Small posture muscles that recover quickly and keep your shoulder joints healthy. Direct face pulls and reverse flyes build balanced 3D shoulders.',
    recommendedRepRanges: '12–20 reps (face pulls, reverse flyes)',
  },
  Back: {
    key: 'Back',
    displayName: 'Back & Lats',
    mv: 8,
    mev: 10,
    mavMin: 14,
    mavMax: 22,
    mrv: 25,
    frequencyMin: 2,
    frequencyMax: 4,
    category: 'Moderate Tolerance',
    recoveryKineticsHours: 48,
    fiberProfile: 'Balanced (~48 hr recovery)',
    scientificRationale: 'Your upper back and lats are a large muscle group that handles a strong mix of vertical pull-ups/pulldowns and horizontal rows.',
    recommendedRepRanges: '6–12 reps (pull-ups & barbell rows), 10–15 reps (cable rows)',
  },
  Chest: {
    key: 'Chest',
    displayName: 'Chest',
    mv: 4,
    mev: 8,
    mavMin: 12,
    mavMax: 18,
    mrv: 20,
    frequencyMin: 1.5,
    frequencyMax: 3,
    category: 'Fatigue / Damage Sensitive',
    recoveryKineticsHours: 60,
    fiberProfile: 'Power-focused (needs ~60 hrs rest)',
    scientificRationale: 'Heavy pressing stretches the chest deeply under load. Doing more than 18 sets per week usually causes sore shoulders and slower recovery rather than extra growth.',
    recommendedRepRanges: '6–10 reps (barbell press), 8–12 reps (dumbbell or cable press)',
  },
  Quads: {
    key: 'Quads',
    displayName: 'Quads (Front Thighs)',
    mv: 4,
    mev: 6,
    mavMin: 12,
    mavMax: 18,
    mrv: 20,
    frequencyMin: 1.5,
    frequencyMax: 3,
    category: 'Fatigue / Damage Sensitive',
    recoveryKineticsHours: 60,
    fiberProfile: 'High effort (needs ~60 hrs rest)',
    scientificRationale: 'Heavy squats and leg presses are very demanding on your whole body. A focused 12–18 quality sets per week builds maximum leg size without burning you out.',
    recommendedRepRanges: '6–10 reps (squats), 10–15 reps (leg press or leg extensions)',
  },
  Hamstrings: {
    key: 'Hamstrings',
    displayName: 'Hamstrings',
    mv: 4,
    mev: 6,
    mavMin: 10,
    mavMax: 16,
    mrv: 18,
    frequencyMin: 1.5,
    frequencyMax: 2.5,
    category: 'Fatigue / Damage Sensitive',
    recoveryKineticsHours: 72,
    fiberProfile: 'Slowest recovery (~72 hrs rest)',
    scientificRationale: 'Romanian deadlifts and leg curls create a deep stretch that takes up to 3 days to fully repair. Keep hamstrings in a focused 10–16 set window for best results.',
    recommendedRepRanges: '8–10 reps (Romanian deadlifts), 10–15 reps (seated leg curls)',
  },
  Triceps: {
    key: 'Triceps',
    displayName: 'Triceps',
    mv: 4,
    mev: 6,
    mavMin: 10,
    mavMax: 16,
    mrv: 18,
    frequencyMin: 2,
    frequencyMax: 3,
    category: 'High Compound Crossover',
    recoveryKineticsHours: 48,
    fiberProfile: 'Power-focused (~48 hr recovery)',
    scientificRationale: 'Your triceps already work hard on every bench press and shoulder press. 10–16 total weekly sets (including press credit) is plenty to grow without elbow soreness.',
    recommendedRepRanges: '10–15 reps (cable pushdowns, overhead extensions)',
  },
  Biceps: {
    key: 'Biceps',
    displayName: 'Biceps',
    mv: 4,
    mev: 6,
    mavMin: 12,
    mavMax: 18,
    mrv: 22,
    frequencyMin: 2,
    frequencyMax: 4,
    category: 'Moderate Tolerance',
    recoveryKineticsHours: 36,
    fiberProfile: 'Fast recovery (~36 hrs)',
    scientificRationale: 'Biceps recover fairly quickly after back workouts and respond well to controlled curls with a full stretch at the bottom.',
    recommendedRepRanges: '8–12 reps (dumbbell curls), 10–15 reps (incline or cable curls)',
  },
  Glutes: {
    key: 'Glutes',
    displayName: 'Glutes',
    mv: 2,
    mev: 4,
    mavMin: 10,
    mavMax: 16,
    mrv: 20,
    frequencyMin: 2,
    frequencyMax: 3,
    category: 'Moderate Tolerance',
    recoveryKineticsHours: 48,
    fiberProfile: 'Balanced (~48 hr recovery)',
    scientificRationale: 'Heavily worked during deep squats and deadlifts. Direct hip thrusts or split squats add targeted growth with low back strain.',
    recommendedRepRanges: '8–12 reps (squats, deadlifts, hip thrusts)',
  },
  FrontDelts: {
    key: 'FrontDelts',
    displayName: 'Front Shoulders',
    mv: 0,
    mev: 0,
    mavMin: 4,
    mavMax: 8,
    mrv: 12,
    frequencyMin: 1,
    frequencyMax: 2,
    category: 'High Compound Crossover',
    recoveryKineticsHours: 48,
    fiberProfile: 'Balanced (~48 hr recovery)',
    scientificRationale: 'Already heavily worked during flat bench, incline press, and overhead press. Extra front raises are rarely needed.',
    recommendedRepRanges: '6–10 reps (overhead press, incline press)',
  },
  Core: {
    key: 'Core',
    displayName: 'Core & Abs',
    mv: 0,
    mev: 4,
    mavMin: 8,
    mavMax: 16,
    mrv: 20,
    frequencyMin: 2,
    frequencyMax: 4,
    category: 'Moderate Tolerance',
    recoveryKineticsHours: 36,
    fiberProfile: 'Fast recovery (~36 hrs)',
    scientificRationale: 'Braces your body on heavy lifts, and grows best with 8–16 controlled sets of cable crunches or leg raises.',
    recommendedRepRanges: '12–20 reps (cable crunches, hanging leg raises)',
  },
};

/**
 * Evaluates the current weekly set volume against scientific landmarks for a given muscle
 */
export function evaluateVolumeStatus(
  muscleKey: string,
  weeklySets: number
): {
  status: VolumeStatus;
  landmark: MuscleVolumeLandmark;
  statusLabel: string;
  statusColor: string;
  advice: string;
  percentageOfMavMax: number;
} {
  const landmark = HYPERTROPHY_VOLUME_LANDMARKS[muscleKey] || {
    key: muscleKey,
    displayName: muscleKey,
    mv: 4,
    mev: 6,
    mavMin: 10,
    mavMax: 16,
    mrv: 20,
    frequencyMin: 2,
    frequencyMax: 3,
    category: 'Moderate Tolerance' as const,
    recoveryKineticsHours: 48,
    fiberProfile: 'Balanced',
    scientificRationale: 'Balanced weekly set target.',
    recommendedRepRanges: '8–15 reps',
  };

  const percentageOfMavMax = Math.min(125, Math.round((weeklySets / landmark.mavMax) * 100));

  if (weeklySets < landmark.mv) {
    return {
      status: 'below_mv',
      landmark,
      statusLabel: 'Needs More Sets',
      statusColor: 'text-rose-400',
      advice: `You have logged ${weeklySets} sets this week. Aim for at least ${landmark.mev} sets to start building muscle.`,
      percentageOfMavMax,
    };
  }

  if (weeklySets < landmark.mev) {
    return {
      status: 'maintenance',
      landmark,
      statusLabel: 'Maintaining',
      statusColor: 'text-slate-400',
      advice: `Enough to maintain your current size, but add ${landmark.mev - weeklySets} more sets to trigger new growth.`,
      percentageOfMavMax,
    };
  }

  if (weeklySets < landmark.mavMin) {
    return {
      status: 'effective',
      landmark,
      statusLabel: 'Building',
      statusColor: 'text-cyan-400',
      advice: `Making steady progress. Add ${landmark.mavMin - weeklySets} sets to reach the ideal ${landmark.mavMin}–${landmark.mavMax} set growth zone.`,
      percentageOfMavMax,
    };
  }

  if (weeklySets <= landmark.mavMax) {
    return {
      status: 'optimal_mav',
      landmark,
      statusLabel: 'In Target Zone',
      statusColor: 'text-brand-primary',
      advice: `Right in the sweet spot (${landmark.mavMin}–${landmark.mavMax} sets) for maximum growth and healthy recovery.`,
      percentageOfMavMax,
    };
  }

  if (weeklySets <= landmark.mrv) {
    return {
      status: 'near_mrv',
      landmark,
      statusLabel: 'Near Weekly Limit',
      statusColor: 'text-amber-400',
      advice: `Approaching your weekly recovery limit (${landmark.mrv} sets). Avoid adding extra sets this week.`,
      percentageOfMavMax,
    };
  }

  return {
    status: 'above_mrv',
    landmark,
    statusLabel: 'Over Weekly Limit',
    statusColor: 'text-rose-400',
    advice: `Current volume (${weeklySets} sets) is above your safe recovery limit (${landmark.mrv} sets). Take extra rest so your joints can recover.`,
    percentageOfMavMax,
  };
}

/**
 * Calculates targeted weekly sets for a given muscle group based on mesocycle week
 * and goal phase (Lean Bulk vs Cut vs Maingain)
 */
export function getRecommendedSetsForWeek(
  muscleKey: string,
  mesoWeek: number, // 1 to 6
  goalPhase: 'Lean Bulk' | 'Cut / Recomp' | 'Maingain' = 'Lean Bulk'
): { targetSets: number; rirTarget: string; phaseNote: string } {
  const landmark = HYPERTROPHY_VOLUME_LANDMARKS[muscleKey] || HYPERTROPHY_VOLUME_LANDMARKS.Back;

  // During a Cut, recovery capacity is reduced by ~15-20% due to caloric deficit
  const volumeMultiplier = goalPhase === 'Cut / Recomp' ? 0.85 : 1.0;

  switch (mesoWeek) {
    case 1: // Intro week at MEV
      return {
        targetSets: Math.round(landmark.mev * volumeMultiplier),
        rirTarget: '2–3 RIR',
        phaseNote: 'Intro week: Establish mind-muscle connection at Minimum Effective Volume.',
      };
    case 2: // Early MAV
      return {
        targetSets: Math.round(landmark.mavMin * volumeMultiplier),
        rirTarget: '2 RIR',
        phaseNote: 'Entering Maximum Adaptive Volume sweet spot.',
      };
    case 3: // Mid MAV
      return {
        targetSets: Math.round(((landmark.mavMin + landmark.mavMax) / 2) * volumeMultiplier),
        rirTarget: '1–2 RIR',
        phaseNote: 'Prime hypertrophy zone. High mechanical tension & volume balance.',
      };
    case 4: // Upper MAV
      return {
        targetSets: Math.round((landmark.mavMax * 0.95) * volumeMultiplier),
        rirTarget: '1 RIR',
        phaseNote: 'Peak stimulus accumulation. Heavy metabolic and mechanical load.',
      };
    case 5: // Overreaching near MRV
      return {
        targetSets: Math.round(landmark.mrv * 0.95 * volumeMultiplier),
        rirTarget: '0–1 RIR',
        phaseNote: 'Functional overreaching week near Maximum Recoverable Volume.',
      };
    case 6: // Planned Deload
    default:
      return {
        targetSets: Math.round(landmark.mv * (goalPhase === 'Cut / Recomp' ? 0.9 : 1.0)),
        rirTarget: '3–4 RIR',
        phaseNote: 'Consolidation deload at Maintenance Volume to dissipate systemic fatigue.',
      };
  }
}
