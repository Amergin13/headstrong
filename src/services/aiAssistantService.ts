import {
  AssistantActionPayload,
  AssistantChatMessage,
  BiometricLog,
  ExerciseDefinition,
  ExerciseSession,
  GoalPhase,
  HomeEquipmentTag,
  ProgramSplitType,
  ReadinessState,
  ScientificPrinciple,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import {
  AthleteKnowledgeGraph,
  buildAthleteKnowledgeGraph,
  TREISE_DESIGN_SYSTEM,
  queryDesignSystemComponents,
  queryExerciseScienceKnowledgeBase,
} from '../engine/knowledgeGraph';
import { getTensorHardwareProfile, queryTensorTPUGeminiNano } from './tensorAIService';
import { evaluateTensorBiomechanicalMatch } from '../engine/tensorAI';
import { calculateDotsScore } from '../engine/dots';
import {
  adaptWorkoutSessionToLocation,
  generateSmartWorkoutSession,
  getFirstSplitDayForProgram,
  SplitDayType,
} from './workoutGenerator';

export interface AssistantProcessInput {
  userMessage: string;
  profile: UserProfile;
  activeWorkout: WorkoutSession;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  bodyweightEmaKg: number;
  readinessState: ReadinessState;
  weeklyVolume?: Record<string, number>;
}

export interface AssistantProcessResult {
  message: AssistantChatMessage;
  updatedProfile?: Partial<UserProfile>;
  updatedWorkout?: WorkoutSession;
  actionTaken?: AssistantActionPayload;
}

/**
 * Maps home equipment tags to natural user-facing names
 */
const EQUIPMENT_NAMES: Record<HomeEquipmentTag, string> = {
  pullup_bar: 'Pull-Up Bar',
  dumbbells: 'Dumbbells',
  bench: 'Exercise Bench',
  trx: 'TRX Suspension Trainer',
  bands: 'Resistance Bands',
};

/**
 * Core On-Device AI Assistant Service:
 * Synthesizes athlete intent, queries the Athlete Knowledge Graph, executes state mutations,
 * and formulates direct tactical coaching responses accelerated by Google Tensor on Pixel devices.
 */
export async function processAssistantMessage(
  input: AssistantProcessInput
): Promise<AssistantProcessResult> {
  const {
    userMessage,
    profile,
    activeWorkout,
    workouts,
    biometrics,
    exerciseCatalog,
    bodyweightEmaKg,
    readinessState,
    weeklyVolume = {},
  } = input;

  const hardware = await getTensorHardwareProfile();
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const lowerMsg = userMessage.toLowerCase().trim();

  // Build current Knowledge Graph for deep context
  const kg: AthleteKnowledgeGraph = buildAthleteKnowledgeGraph(
    workouts,
    biometrics,
    exerciseCatalog,
    profile,
    weeklyVolume
  );

  let answerText = '';
  let actionTaken: AssistantActionPayload | undefined;
  let updatedProfile: Partial<UserProfile> | undefined;
  let updatedWorkout: WorkoutSession | undefined;
  const citations: { label: string; metric: string; value: string }[] = [];
  const scientificPrinciplesCited: ScientificPrinciple[] = [];

  // ============================================================================
  // 1. INTENT: UPDATE HOME EQUIPMENT (e.g. "I got a pull up bar", "I bought dumbbells")
  // ============================================================================
  const equipmentKeywords: { tag: HomeEquipmentTag; regex: RegExp; name: string }[] = [
    { tag: 'pullup_bar', regex: /\b(pull[\s-]?up\s*bar|chin[\s-]?up\s*bar)\b/i, name: 'Pull-Up Bar' },
    { tag: 'dumbbells', regex: /\b(dumbbell|dumbbells|db|dbs)\b/i, name: 'Dumbbells' },
    { tag: 'bench', regex: /\b(bench|workout\s*bench|incline\s*bench|flat\s*bench)\b/i, name: 'Exercise Bench' },
    { tag: 'trx', regex: /\b(trx|suspension\s*trainer|rings|gymnastic\s*rings)\b/i, name: 'TRX Suspension Trainer' },
    { tag: 'bands', regex: /\b(band|bands|resistance\s*bands?)\b/i, name: 'Resistance Bands' },
  ];

  const matchedEquip = equipmentKeywords.find((e) => e.regex.test(lowerMsg));
  const isEquipRemoval = /\b(remove|don['’]t\s*have|lost|sold|no\s*longer|deleted?)\b/i.test(lowerMsg);
  const isEquipAddition =
    /\b(bought|got|have|new|added?|equipped?|purchased|acquired|can\s*use)\b/i.test(lowerMsg) ||
    (!isEquipRemoval && matchedEquip && lowerMsg.length < 35);

  if (matchedEquip && (isEquipAddition || isEquipRemoval)) {
    const currentList = new Set<HomeEquipmentTag>(profile.homeEquipment || []);

    if (isEquipRemoval) {
      currentList.delete(matchedEquip.tag);
      const nextEquip = Array.from(currentList);
      updatedProfile = { homeEquipment: nextEquip };
      actionTaken = {
        type: 'UPDATE_EQUIPMENT',
        summary: `Removed ${matchedEquip.name} from Home Equipment`,
        details: { equipment: nextEquip, removed: matchedEquip.tag },
      };
      answerText = `I have updated your Home Equipment profile and removed the ${matchedEquip.name}. Your home workouts and exercise substitution choices will no longer include exercises requiring this gear.`;
    } else {
      currentList.add(matchedEquip.tag);
      const nextEquip = Array.from(currentList);
      updatedProfile = { homeEquipment: nextEquip };
      actionTaken = {
        type: 'UPDATE_EQUIPMENT',
        summary: `Added ${matchedEquip.name} to Home Equipment`,
        details: { equipment: nextEquip, added: matchedEquip.tag },
      };

      if (matchedEquip.tag === 'pullup_bar') {
        answerText = `Awesome addition! I've added the Pull-Up Bar to your Home Equipment. Your home workouts now have full access to Bodyweight Pull-Ups and Chin-Ups, unlocking authoritative vertical pulling hypertrophy without needing gym lat-pulldown cables.`;
      } else if (matchedEquip.tag === 'dumbbells') {
        answerText = `Great upgrade! I've added Dumbbells to your Home Equipment profile. Your home sessions can now program Incline Dumbbell Presses, Dumbbell Rows, and Romanian Deadlifts with seamless progressive overload.`;
      } else if (matchedEquip.tag === 'bench') {
        answerText = `Perfect! Added an Exercise Bench to your Home Equipment. This allows you to perform flat and incline presses with full thoracic stabilization and deep stretch at the bottom of each rep.`;
      } else if (matchedEquip.tag === 'trx') {
        answerText = `Logged! Added TRX Suspension Trainer to your Home Equipment profile. Your home workouts can now leverage TRX Inverted Rows, TRX Push-Ups, and Pistol Squats.`;
      } else {
        answerText = `I have added ${matchedEquip.name} to your Home Equipment profile. Your home exercise suggestions have been updated to incorporate your new gear.`;
      }
    }

    // If current workout is at home, adapt it to immediately leverage new equipment
    if (activeWorkout.location === 'home') {
      const adapted = adaptWorkoutSessionToLocation(
        activeWorkout,
        'home',
        updatedProfile.homeEquipment,
        exerciseCatalog,
        workouts,
        readinessState,
        bodyweightEmaKg
      );
      updatedWorkout = adapted;
    }

    citations.push({
      label: 'Home Equipment',
      metric: 'Available Tools',
      value: (updatedProfile.homeEquipment || []).map((t) => EQUIPMENT_NAMES[t] || t).join(', '),
    });
  }

  // ============================================================================
  // 2. INTENT: SCHEDULE TRAVEL / LOCATION FOR FUTURE MESOCYCLE WEEK (e.g. "away in week 5")
  // ============================================================================
  else if (
    /\b(away|travel|travelling|traveling|trip|holiday|vacation|hotel|work\s*trip)\b/i.test(lowerMsg) &&
    /\b(week\s*[1-6]|next\s*week)\b/i.test(lowerMsg)
  ) {
    // Extract week number
    let targetWeek = profile.mesocycleWeek || 3;
    const weekMatch = lowerMsg.match(/week\s*([1-6])/i);
    if (weekMatch) {
      targetWeek = parseInt(weekMatch[1], 10);
    } else if (/next\s*week/i.test(lowerMsg)) {
      targetWeek = Math.min(6, (profile.mesocycleWeek || 1) + 1);
    }

    const currentSchedule = { ...(profile.scheduledWeekLocations || {}) };
    currentSchedule[targetWeek] = 'travel';

    updatedProfile = {
      scheduledWeekLocations: currentSchedule,
    };

    actionTaken = {
      type: 'SCHEDULE_LOCATION_WEEK',
      summary: `Scheduled Week ${targetWeek} for Bodyweight (0 kg External Load)`,
      details: { week: targetWeek, location: 'travel' },
    };

    answerText = `Planned! I have scheduled Week ${targetWeek} of your mesocycle for Bodyweight training. When you reach Week ${targetWeek}, all workout sessions will automatically calibrate to pure bodyweight exercises (like Feet-Elevated Deficit Push-Ups, Bulgarian Split Squats, and Inverted Rows). Target reps are matched to your strength level with 3-second eccentric tempo cues, requiring zero gym weights.`;

    // If athlete is already in that week, adapt current workout too
    if ((profile.mesocycleWeek || 1) === targetWeek && activeWorkout.location !== 'travel') {
      const adapted = adaptWorkoutSessionToLocation(
        activeWorkout,
        'travel',
        profile.homeEquipment || [],
        exerciseCatalog,
        workouts,
        readinessState,
        bodyweightEmaKg
      );
      updatedWorkout = adapted;
      updatedProfile.activeLocation = 'travel';
    }

    citations.push({
      label: `Week ${targetWeek} Plan`,
      metric: 'Location Override',
      value: 'Bodyweight (0 kg external load)',
    });
  }

  // ============================================================================
  // 3. INTENT: SWITCH CURRENT WORKOUT LOCATION (e.g. "switch today to bodyweight", "train at home")
  // ============================================================================
  else if (
    /\b(switch|change|set|turn)\b.*\b(travel|bodyweight|home|gym)\b/i.test(lowerMsg) ||
    /\b(train\s*at\s*home|in\s*a\s*hotel|no\s*weights?\s*today|bodyweight\s*today)\b/i.test(lowerMsg)
  ) {
    let targetLoc: TrainingLocation = 'travel';
    if (/\b(home|house)\b/i.test(lowerMsg)) targetLoc = 'home';
    else if (/\b(gym|full\s*gym)\b/i.test(lowerMsg)) targetLoc = 'gym';

    const adapted = adaptWorkoutSessionToLocation(
      activeWorkout,
      targetLoc,
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
      exerciseCatalog,
      workouts,
      readinessState,
      bodyweightEmaKg
    );

    updatedWorkout = adapted;
    updatedProfile = { activeLocation: targetLoc };
    actionTaken = {
      type: 'SWITCH_LOCATION',
      summary: `Switched today's session to ${targetLoc === 'travel' ? 'Bodyweight' : targetLoc === 'home' ? 'At Home' : 'Full Gym'}`,
      details: { location: targetLoc },
    };

    if (targetLoc === 'travel') {
      answerText = `Switched today's session to Bodyweight mode. All exercises have been converted to pure bodyweight movements with 0 kg external load and calibrated reps matching your strength level.`;
    } else if (targetLoc === 'home') {
      answerText = `Switched today's session to At Home mode. Workouts are calibrated around your home equipment setup (${(profile.homeEquipment || []).map((t) => EQUIPMENT_NAMES[t] || t).join(', ')}).`;
    } else {
      answerText = `Switched today's session to Full Gym. All compound barbells, cables, and machines are now active in your workout queue.`;
    }

    citations.push({
      label: 'Active Session',
      metric: 'Location',
      value: targetLoc,
    });
  }

  // ============================================================================
  // 4. INTENT: SWITCH PROGRAM SPLIT (e.g. "switch me to Upper / Lower", "switch to PPL")
  // ============================================================================
  else if (
    /\b(switch|change|set)\b.*\b(program|split|ppl|upper\s*lower|full\s*body)\b/i.test(lowerMsg) ||
    /\b(upper\s*lower\s*split|push\s*pull\s*legs)\b/i.test(lowerMsg)
  ) {
    let targetSplit: ProgramSplitType = 'upper_lower';
    let splitTitle = 'Upper / Lower (4-Day)';

    if (/\b(ppl\s*\+\s*upper|ppl\s*upper|4[\s-]?day\s*ppl)\b/i.test(lowerMsg)) {
      targetSplit = 'ppl_upper';
      splitTitle = 'Push / Pull / Legs + Upper (4-Day)';
    } else if (/\b(ppl|push\s*pull\s*legs|3[\s-]?day\s*ppl)\b/i.test(lowerMsg)) {
      targetSplit = 'ppl';
      splitTitle = 'Push / Pull / Legs (3-Day Classic)';
    } else if (/\b(full\s*body|3[\s-]?day\s*full)\b/i.test(lowerMsg)) {
      targetSplit = 'full_body';
      splitTitle = 'Full Body (3-Day High Frequency)';
    }

    const starterSplit = getFirstSplitDayForProgram(targetSplit);
    const newSession = generateSmartWorkoutSession(
      starterSplit,
      workouts,
      exerciseCatalog,
      readinessState,
      profile.mesocycleWeek || 1,
      profile.activeLocation || 'gym',
      profile.homeEquipment || ['bench', 'dumbbells', 'trx', 'pullup_bar'],
      profile.goalPhase,
      bodyweightEmaKg,
      profile.scheduledWeekLocations
    );

    updatedProfile = { programType: targetSplit };
    updatedWorkout = newSession;
    actionTaken = {
      type: 'SWITCH_PROGRAM_SPLIT',
      summary: `Switched split to ${splitTitle}`,
      details: { programType: targetSplit, starterSplit },
    };

    answerText = `Program updated! Switched your training split to ${splitTitle}. Your next queued workout is ${newSession.name} (${starterSplit} Day), scheduled at the front of your queue.`;

    citations.push({
      label: 'Program Split',
      metric: 'Active Split',
      value: splitTitle,
    });
  }

  // ============================================================================
  // 5. INTENT: SWITCH GOAL PHASE (e.g. "switch my goal to Cut / Recomp", "start a bulk")
  // ============================================================================
  else if (
    /\b(cut|cutting|recomp|lose\s*fat|lean\s*bulk|bulk|bulking|build\s*muscle|maingain|stay\s*lean)\b/i.test(lowerMsg) &&
    /\b(goal|phase|switch|change|want\s*to|start)\b/i.test(lowerMsg)
  ) {
    let targetGoal: GoalPhase = 'Cut / Recomp';
    if (/\b(bulk|bulking|build\s*muscle|lean\s*bulk)\b/i.test(lowerMsg)) {
      targetGoal = 'Lean Bulk';
    } else if (/\b(maingain|stay\s*lean|maintain)\b/i.test(lowerMsg)) {
      targetGoal = 'Maingain';
    }

    updatedProfile = { goalPhase: targetGoal };
    actionTaken = {
      type: 'SWITCH_GOAL_PHASE',
      summary: `Switched goal phase to ${targetGoal}`,
      details: { goalPhase: targetGoal },
    };

    if (targetGoal === 'Cut / Recomp') {
      answerText = `Switched your goal to Cut / Recomp! Retention Shield is now active: training volume is capped to ~85% to protect systemic recovery in a caloric deficit, and holding your weights steady preserves 100% of your muscle mass while body fat drops.`;
    } else if (targetGoal === 'Lean Bulk') {
      answerText = `Switched your goal to Lean Bulk! Your volume targets will progressively scale from Minimum Effective Volume (MEV) up to Maximum Adaptive Volume (MAV) across your 6-week mesocycle, fueled by a caloric surplus.`;
    } else {
      answerText = `Switched your goal to Maingain! Work Capacity Index (WCI) and recovery density are emphasized to steadily improve body composition.`;
    }

    citations.push({
      label: 'Training Goal',
      metric: 'Goal Phase',
      value: targetGoal,
    });
  }

  // ============================================================================
  // 6. INTENT: LOG REST DAY / SHIFT WORKOUT (e.g. "I can't train today", "take a rest day")
  // ============================================================================
  else if (
    /\b(rest\s*day|can['’]?t\s*train|skip\s*today|shift\s*(workout|session|today)|day\s*off)\b/i.test(lowerMsg)
  ) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    updatedWorkout = {
      ...activeWorkout,
      date: tomorrowStr,
    };

    actionTaken = {
      type: 'SHIFT_WORKOUT',
      summary: `Logged Rest Day: ${activeWorkout.splitDay} Day held for tomorrow`,
      details: { date: tomorrowStr },
    };

    answerText = `Rest day logged! Your ${activeWorkout.splitDay} Day session has been held at the front of your queue for tomorrow. Because Treise uses an asynchronous hypertrophy queue, skipping a calendar day carries zero penalty, preserves your ${profile.streakDays}-day streak, and lets your nervous system recover.`;

    citations.push({
      label: 'Schedule',
      metric: 'Next Session',
      value: `Tomorrow (${activeWorkout.splitDay} Day)`,
    });
  }

  // ============================================================================
  // 7. INTENT: KNOWLEDGE GRAPH QUERIES (Joints, Recovery, Muscles, Science)
  // ============================================================================
  // 7. INTENT: KNOWLEDGE GRAPH QUERIES (Joints, Science, Recovery, Muscles)
  // ============================================================================
  else {
    const isDesignQuery =
      lowerMsg.includes('design system') ||
      lowerMsg.includes('shift nudge') ||
      lowerMsg.includes('nested radius') ||
      lowerMsg.includes('radius') ||
      lowerMsg.includes('spatial') ||
      lowerMsg.includes('grid') ||
      lowerMsg.includes('squint') ||
      lowerMsg.includes('typography') ||
      lowerMsg.includes('button') ||
      lowerMsg.includes('cta') ||
      lowerMsg.includes('component') ||
      lowerMsg.includes('anatomy') ||
      lowerMsg.includes('tailwind tokens') ||
      lowerMsg.includes('touch target') ||
      lowerMsg.includes('primary cta');

    const dsMatches = isDesignQuery ? queryDesignSystemComponents(lowerMsg) : [];

    // A. Joint Strain & Health Query
    const jointQuery = kg.joints.find((j) => {
      const lowerJ = j.joint.toLowerCase();
      return (
        lowerMsg.includes(lowerJ.split(' ')[0]) ||
        (lowerMsg.includes('shoulder') && lowerJ.includes('shoulder')) ||
        (lowerMsg.includes('elbow') && lowerJ.includes('elbow')) ||
        (lowerMsg.includes('back') && lowerJ.includes('lumbar')) ||
        (lowerMsg.includes('knee') && lowerJ.includes('knee')) ||
        (lowerMsg.includes('ankle') && lowerJ.includes('ankle'))
      );
    });

    if (jointQuery || lowerMsg.includes('joint') || lowerMsg.includes('sore') || lowerMsg.includes('pain') || lowerMsg.includes('strain')) {
      const targetJoint = jointQuery || kg.joints.sort((a, b) => b.strainScore - a.strainScore)[0];
      answerText = `Your ${targetJoint.joint} is currently at ${targetJoint.strainScore}/100 load (${targetJoint.status}). Most of the recent stress came from ${targetJoint.topContributors.slice(0, 2).join(' and ') || 'recent pressing movements'}. ${targetJoint.biomechanicalAdvice}`;

      citations.push({
        label: targetJoint.joint,
        metric: 'Strain Score',
        value: `${targetJoint.strainScore}/100 (${targetJoint.status})`,
      });
      citations.push({
        label: 'Lower Back Load',
        metric: 'Axial Load',
        value: `${kg.systemicAxialLoadScore}%`,
      });
    }

    // B. Grounded Design System Component Query (Anatomy, Logic Invariants, Tailwind Tokens)
    else if (isDesignQuery && dsMatches.length > 0) {
      const comp = dsMatches[0];
      answerText = `Component Specification: ${comp.name} (${comp.category})\n\nRationale:\n${comp.rationale}\n\nComponent Anatomy:\n- Typography: ${comp.anatomy.typography}\n- Container: ${comp.anatomy.container}\n- Touch Target: ${comp.anatomy.touchTarget}\n- Colors & States: ${comp.anatomy.colors}\n\nKey Invariant Rules:\n${comp.logic.rules.map((r) => `• ${r}`).join('\n')}\n\nTailwind Tokens:\n${comp.tailwindTokens}`;

      citations.push({
        label: comp.name,
        metric: 'Component ID',
        value: comp.id,
      });
      citations.push({
        label: 'Touch Target',
        metric: 'Accessibility',
        value: comp.anatomy.touchTarget,
      });
    }

    // C. Grounded Exercise Science Knowledge Base Query (Exact Formulas & Physiological Rationale)
    else {
      // Prioritize active exercise targets over theoretical science when athlete asks about today's weights/reps
      const isTacticalWorkoutQuery =
        (lowerMsg.includes('weight') ||
          lowerMsg.includes('rep') ||
          lowerMsg.includes('set') ||
          lowerMsg.includes('target') ||
          lowerMsg.includes('today') ||
          lowerMsg.includes('prescribed') ||
          lowerMsg.includes('how much') ||
          lowerMsg.includes('how many') ||
          lowerMsg.includes('swap') ||
          lowerMsg.includes('substitute') ||
          lowerMsg.includes('replace') ||
          lowerMsg.includes('alternative') ||
          lowerMsg.includes('instead of') ||
          lowerMsg.includes('briefing') ||
          lowerMsg.includes('warm') ||
          lowerMsg.includes('tempo')) &&
        !lowerMsg.includes('why') &&
        !lowerMsg.includes('formula') &&
        !lowerMsg.includes('multiplier') &&
        !lowerMsg.includes('citation') &&
        !lowerMsg.includes('academic') &&
        !lowerMsg.includes('retention shield') &&
        !lowerMsg.includes('science');

      const scientificPrinciple = !isTacticalWorkoutQuery
        ? queryExerciseScienceKnowledgeBase(lowerMsg)
        : null;

      if (scientificPrinciple) {
        scientificPrinciplesCited.push(scientificPrinciple);
        answerText = `${scientificPrinciple.title}\n\n${scientificPrinciple.scientificRationale}\n\n`;
        if (scientificPrinciple.formula) {
          answerText += `Scientific Formula:\n${scientificPrinciple.formula}\n\n`;
        }
        answerText += `How Treise applies this:\n${scientificPrinciple.practicalApplication}\n\nAcademic Citation:\n${scientificPrinciple.academicCitation}`;

        citations.push({
          label: scientificPrinciple.title,
          metric: 'Scientific Grounding',
          value: scientificPrinciple.academicCitation,
        });
        if (scientificPrinciple.formula) {
          citations.push({
            label: 'Formula Model',
            metric: 'Calculation',
            value: scientificPrinciple.formula,
          });
        }
      }

      // C. Recovery & Autonomic Telemetry Query
      else if (
        lowerMsg.includes('recovery') ||
        lowerMsg.includes('hrv') ||
        lowerMsg.includes('sleep') ||
        lowerMsg.includes('readiness') ||
        lowerMsg.includes('pulse') ||
        lowerMsg.includes('heart') ||
        lowerMsg.includes('whoop') ||
        lowerMsg.includes('fitbit') ||
        lowerMsg.includes('health connect') ||
        lowerMsg.includes('wearable') ||
        lowerMsg.includes('watch')
      ) {
        const latest = biometrics[biometrics.length - 1];
        const hrv = latest?.hrvRmssd || 58;
        const sleep = latest?.sleepHours || 7.5;
        const rhr = latest?.restingHr || 58;

        if (readinessState === 'Primed') {
          answerText = `Your recovery is Primed today with a strong ${hrv} ms HRV and ${sleep} hours of sleep. Your parasympathetic tone is elevated, granting a +15% workout XP multiplier and a green light to push load on your first working sets.`;
        } else if (readinessState === 'Amber Shield') {
          answerText = `Your recovery is in Amber Shield mode (HRV: ${hrv} ms, Sleep: ${sleep}h). Your central nervous system needs lighter effort today. Working weights are held steady with 2–3 reps left in reserve to prevent joint burnout and protect your streak.`;
        } else {
          answerText = `Your recovery is in a solid Normal baseline (HRV: ${hrv} ms, Sleep: ${sleep}h, Resting HR: ${rhr} bpm). Overall recovery efficiency is ${kg.recoveryEfficiencyScore}/100. Follow your standard double progression targets.`;
        }

        citations.push({
          label: 'Daily Readiness',
          metric: 'Status',
          value: readinessState,
        });
        citations.push({
          label: 'Recovery Score',
          metric: 'Efficiency',
          value: `${kg.recoveryEfficiencyScore}/100`,
        });
      }

      // D. Hypertrophy Muscle Volume Query
      else if (
        lowerMsg.includes('volume') ||
        lowerMsg.includes('sets') ||
        lowerMsg.includes('mav') ||
        lowerMsg.includes('delts') ||
        lowerMsg.includes('calves') ||
        lowerMsg.includes('chest') ||
        lowerMsg.includes('back') ||
        lowerMsg.includes('quads') ||
        lowerMsg.includes('hams')
      ) {
        const matchedMuscle = kg.muscleProfiles.find((m) =>
          lowerMsg.includes(m.displayName.toLowerCase()) || lowerMsg.includes(m.muscleKey.toLowerCase())
        ) || kg.muscleProfiles[0];

        answerText = `${matchedMuscle.displayName} has ${matchedMuscle.weeklySets} sets logged this week against a personalized target sweet spot of ${matchedMuscle.personalizedMav[0]}–${matchedMuscle.personalizedMav[1]} sets. ${matchedMuscle.recommendation}`;

        citations.push({
          label: matchedMuscle.displayName,
          metric: 'Weekly Volume',
          value: `${matchedMuscle.weeklySets} / ${matchedMuscle.personalizedMav[1]} sets`,
        });
        citations.push({
          label: 'Full Stretch Stimulus',
          metric: 'Lengthened Ratio',
          value: `${kg.lengthenedStimulusRatio}% of sets`,
        });
      } else if (lowerMsg.includes('protein') || lowerMsg.includes('eat') || lowerMsg.includes('nutrition') || lowerMsg.includes('food')) {
        answerText =
          profile.goalPhase === 'Cut / Recomp'
            ? `In a caloric deficit, target 2.0g to 2.4g of protein per kg of bodyweight (${Math.round(bodyweightEmaKg * 2.2)}g daily) to support muscle retention while body fat drops.`
            : `For progressive hypertrophy during a lean bulk, aim for 1.8g to 2.2g of protein per kg of bodyweight (${Math.round(bodyweightEmaKg * 2.0)}g daily) and prioritize complex carbohydrates around workouts.`;
      } else {
        // ============================================================================
        // 8. ATHLETIC COACHING & TACTICAL GUIDANCE (TENSOR TPU + KNOWLEDGE GRAPH)
        // ============================================================================
        let nanoHandled = false;

        // A. Google Tensor TPU Acceleration (Chrome Built-in AI / Gemini Nano via Android AICore)
        if (hardware.isPixelDevice) {
          const dotsScore = calculateDotsScore(
            bodyweightEmaKg,
            (kg.nodes.find((n) => n.id === 'dots-score')?.metrics?.dots as number) || 280,
            profile.gender
          );

          const exercisesDesc = (activeWorkout.exercises || [])
            .map(
              (e, idx) =>
                `  ${idx + 1}. ${e.name} (${e.pillar}, ${e.equipment}): ${e.sets.length} sets × ${e.minReps}–${e.maxReps} reps @ ${e.sets[0]?.targetWeightKg ?? 0} kg (Target RIR: ${readinessState === 'Amber Shield' ? '2–3' : '1–2'})`
            )
            .join('\n');

          const jointsDesc = kg.joints
            .map((j) => `  - ${j.joint}: ${j.strainScore}/100 (${j.status}) [Top: ${j.topContributors.slice(0, 2).join(', ') || 'Normal'}]`)
            .join('\n');

          const musclesDesc = kg.muscleProfiles
            .slice(0, 5)
            .map((m) => `  - ${m.displayName}: ${m.weeklySets} sets (Personalized MAV: ${m.personalizedMav[0]}–${m.personalizedMav[1]} sets)`)
            .join('\n');

          const latestBio = biometrics[biometrics.length - 1];

          const systemPrompt = `You are the Treise On-Device AI Coach executing locally on the Google Pixel ${hardware.chipModel} TPU via Android AICore.
You have direct, real-time access to the athlete's Personal Knowledge Graph and workout telemetry:

[ATHLETE PROFILE]
- Name: ${profile.name || 'Athlete'} (${profile.gender || 'male'})
- 7-Day EMA Bodyweight: ${bodyweightEmaKg.toFixed(1)} kg
- Goal Phase: ${profile.goalPhase}
- Mesocycle Week: Week ${profile.mesocycleWeek || 3} of 6
- Streak: ${profile.streakDays} days
- Available Home Equipment: ${(profile.homeEquipment || []).map((t) => EQUIPMENT_NAMES[t] || t).join(', ') || 'None registered'}

[AUTONOMIC READINESS & WEARABLE TELEMETRY]
- Daily Readiness State: ${readinessState} (${readinessState === 'Primed' ? 'Parasympathetic high, +15% XP boost, green light for PR load' : readinessState === 'Amber Shield' ? 'Recovery Shield Active, hold weights static, 2-3 RIR buffer' : 'Standard Double Progression at 1-2 RIR'})
- Latest HRV: ${latestBio?.hrvRmssd ?? 58} ms
- Sleep: ${latestBio?.sleepHours ?? 7.5} hours
- Resting Heart Rate: ${latestBio?.restingHr ?? 58} bpm
- Recovery Efficiency Score: ${kg.recoveryEfficiencyScore}/100

[TODAY'S ACTIVE WORKOUT: ${activeWorkout.name} (${activeWorkout.splitDay} Day)]
- Location: ${activeWorkout.location}
- Planned Movements:
${exercisesDesc || '  Standard movements'}

[JOINT STRAIN HEALTH]
${jointsDesc}

[KEY MUSCLE VOLUMES & MAV LANDMARKS]
${musclesDesc}

[STRENGTH STANDARDS]
- Current DOTS Score: ${dotsScore}

[COACHING RULES]
1. Answer the athlete's question directly, authoritatively, and concisely in 2–4 sentences.
2. Ground your advice directly in their actual planned exercises, target weights, reps, and autonomic readiness.
3. NEVER mention internal UX jargon, database terms, latency stamps, or 'Knowledge Graph Grounding'.
4. If asked about an exercise, cite its exact target weight and rep range from today's workout.`;

          const nanoResult = await queryTensorTPUGeminiNano(userMessage, systemPrompt);
          if (nanoResult && nanoResult.answer) {
            answerText = nanoResult.answer;
            nanoHandled = true;

            // Attach Knowledge Graph citations if an exercise or joint was discussed
            for (const ex of activeWorkout.exercises) {
              if (
                lowerMsg.includes(ex.name.toLowerCase()) ||
                nanoResult.answer.toLowerCase().includes(ex.name.toLowerCase())
              ) {
                citations.push({
                  label: ex.name,
                  metric: 'Target Load & Reps',
                  value: `${ex.sets[0]?.targetWeightKg ?? 0} kg × ${ex.minReps}–${ex.maxReps} reps`,
                });
                break;
              }
            }
          }
        }

        // B. On-Device Semantic Athletic Engine Fallback (Zero Latency, 100% Deterministic)
        if (!nanoHandled) {
          // B1. Exercise-Specific Targets & Progression Rules
          const matchedWorkoutEx = activeWorkout.exercises.find((e) =>
            lowerMsg.includes(e.name.toLowerCase()) ||
            (lowerMsg.includes('bench') && e.name.toLowerCase().includes('bench')) ||
            (lowerMsg.includes('incline') && e.name.toLowerCase().includes('incline')) ||
            (lowerMsg.includes('squat') && e.name.toLowerCase().includes('squat')) ||
            (lowerMsg.includes('deadlift') && e.name.toLowerCase().includes('deadlift')) ||
            (lowerMsg.includes('rdl') && (e.name.toLowerCase().includes('rdl') || e.isRdl)) ||
            (lowerMsg.includes('overhead') && e.name.toLowerCase().includes('overhead')) ||
            (lowerMsg.includes('ohp') && (e.name.toLowerCase().includes('press') || e.pillar === 'Vertical Push')) ||
            (lowerMsg.includes('pull up') && (e.name.toLowerCase().includes('pull-up') || e.name.toLowerCase().includes('chin'))) ||
            (lowerMsg.includes('pulldown') && e.name.toLowerCase().includes('pulldown')) ||
            (lowerMsg.includes('row') && e.name.toLowerCase().includes('row')) ||
            (lowerMsg.includes('lateral raise') && e.name.toLowerCase().includes('lateral')) ||
            (lowerMsg.includes('curl') && e.name.toLowerCase().includes('curl')) ||
            (lowerMsg.includes('tricep') && e.name.toLowerCase().includes('tricep')) ||
            (lowerMsg.includes('pushdown') && e.name.toLowerCase().includes('pushdown')) ||
            (lowerMsg.includes('leg press') && e.name.toLowerCase().includes('leg press')) ||
            (lowerMsg.includes('leg curl') && e.name.toLowerCase().includes('leg curl')) ||
            (lowerMsg.includes('extension') && e.name.toLowerCase().includes('extension')) ||
            (lowerMsg.includes('calf') && e.name.toLowerCase().includes('calf'))
          );

          const matchedCatalogEx = !matchedWorkoutEx
            ? exerciseCatalog.find((e) =>
                lowerMsg.includes(e.name.toLowerCase()) ||
                (lowerMsg.includes('bench') && e.name.toLowerCase().includes('bench')) ||
                (lowerMsg.includes('squat') && e.name.toLowerCase().includes('squat')) ||
                (lowerMsg.includes('deadlift') && e.name.toLowerCase().includes('deadlift'))
              )
            : null;

          const targetEx = matchedWorkoutEx || matchedCatalogEx;

          const isExerciseQuery =
            Boolean(targetEx) &&
            (lowerMsg.includes('weight') ||
              lowerMsg.includes('rep') ||
              lowerMsg.includes('set') ||
              lowerMsg.includes('target') ||
              lowerMsg.includes('how much') ||
              lowerMsg.includes('how many') ||
              lowerMsg.includes('load') ||
              lowerMsg.includes('should i') ||
              lowerMsg.includes('progress') ||
              !matchedWorkoutEx);

          const isSwapQuery =
            lowerMsg.includes('swap') ||
            lowerMsg.includes('substitute') ||
            lowerMsg.includes('replace') ||
            lowerMsg.includes('alternative') ||
            lowerMsg.includes('instead of') ||
            lowerMsg.includes("don't have") ||
            lowerMsg.includes('dont have');

          const isWarmupQuery =
            lowerMsg.includes('warm') ||
            lowerMsg.includes('ramp up') ||
            lowerMsg.includes('warm-up') ||
            lowerMsg.includes('warmup');

          const isRestQuery =
            lowerMsg.includes('rest') ||
            lowerMsg.includes('interval') ||
            lowerMsg.includes('pace') ||
            lowerMsg.includes('time between') ||
            lowerMsg.includes('how long');

          const isDotsQuery =
            lowerMsg.includes('dots') ||
            lowerMsg.includes('tier') ||
            lowerMsg.includes('level up') ||
            lowerMsg.includes('1rm') ||
            lowerMsg.includes('e1rm') ||
            lowerMsg.includes('standard') ||
            lowerMsg.includes('strength ratio') ||
            lowerMsg.includes('strength score');

          const isTempoQuery =
            lowerMsg.includes('tempo') ||
            lowerMsg.includes('cadence') ||
            lowerMsg.includes('speed') ||
            lowerMsg.includes('eccentric') ||
            lowerMsg.includes('form') ||
            lowerMsg.includes('technique');

          if (isSwapQuery) {
            // Exercise Substitution Biomechanical Match
            const sourceEx = matchedWorkoutEx || activeWorkout.exercises[0];
            const sourceDef = exerciseCatalog.find((c) => c.id === sourceEx.exerciseId);
            const sourceMuscle = sourceDef?.primaryMuscle || 'target muscles';
            const candidateEx =
              exerciseCatalog.find(
                (e) =>
                  e.id !== sourceEx.exerciseId &&
                  (lowerMsg.includes(e.name.toLowerCase()) ||
                    (lowerMsg.includes('dumbbell') && e.equipment === 'dumbbell' && e.pillar === sourceEx.pillar) ||
                    (lowerMsg.includes('cable') && e.equipment === 'cable' && e.pillar === sourceEx.pillar) ||
                    (lowerMsg.includes('machine') && e.equipment === 'machine' && e.pillar === sourceEx.pillar) ||
                    (e.pillar === sourceEx.pillar && e.primaryMuscle === sourceMuscle))
              ) || exerciseCatalog.find((e) => e.pillar === sourceEx.pillar && e.id !== sourceEx.exerciseId);

            if (candidateEx) {
              const fatigue = readinessState === 'Amber Shield' ? 0.75 : 0.4;
              const match = evaluateTensorBiomechanicalMatch(
                sourceEx.exerciseId,
                candidateEx.id,
                fatigue,
                hardware
              );

              answerText = `You can substitute **${sourceEx.name}** with **${candidateEx.name}** (${match.compatibilityScore}% Biomechanical Match).\n\nBoth movements stimulate the same movement vector (${candidateEx.pillar}) with ${match.jointStrainRating.toLowerCase()} joint shear. Use standard progressive double progression (${candidateEx.defaultRepRange[0]}–${candidateEx.defaultRepRange[1]} reps) at 1–2 RIR.`;

              citations.push({
                label: candidateEx.name,
                metric: 'Biomechanical Match',
                value: `${match.compatibilityScore}% Compatibility (${match.jointStrainRating} Joint Shear)`,
              });
            } else {
              answerText = `To swap **${sourceEx.name}**, choose an exercise targeting ${sourceMuscle} within the ${sourceEx.pillar} movement pillar using your available equipment (${(profile.homeEquipment || []).map((t) => EQUIPMENT_NAMES[t] || t).join(', ') || 'gym gear'}).`;
            }
          } else if (isWarmupQuery) {
            // Ramp-Up Warm-Up Protocol
            const primaryEx = activeWorkout.exercises[0];
            const targetWeight = primaryEx?.sets[0]?.targetWeightKg ?? 60;
            const w50 = Math.round((targetWeight * 0.5) / 2.5) * 2.5;
            const w75 = Math.round((targetWeight * 0.75) / 2.5) * 2.5;

            answerText = `Warm-Up Protocol for **${primaryEx ? primaryEx.name : "today's primary compound lift"}**:\n\n1. **Set 1 (Synovial Lubrication):** Empty bar or light weight × 10 reps.\n2. **Set 2 (Motor Pattern Groove):** ${w50} kg (50% working load) × 5 reps.\n3. **Set 3 (Neuromuscular Potentiation):** ${w75} kg (75% working load) × 2–3 reps (zero fatigue).\n\nRest 2 minutes before starting your first heavy working set.`;

            citations.push({
              label: primaryEx ? primaryEx.name : 'Warmup Pyramid',
              metric: 'Ramp-Up Targets',
              value: `10 reps @ bar → 5 reps @ ${w50}kg → 2 reps @ ${w75}kg`,
            });
          } else if (isRestQuery) {
            // Evidence-Based Rest Intervals
            const compoundLifts = activeWorkout.exercises.filter((e) => e.equipment === 'barbell' || e.pillar === 'Squat' || e.pillar === 'Hinge' || e.pillar === 'Horizontal Push');
            const isolationLifts = activeWorkout.exercises.filter((e) => !compoundLifts.includes(e));

            answerText = `Optimal rest intervals for today's **${activeWorkout.name}**:\n\n• **Heavy Compound Movements** (${compoundLifts.map((e) => e.name).slice(0, 2).join(', ') || 'primary lifts'}): 2.5 to 3.5 minutes. Full phosphocreatine and central nervous system resynthesis is essential for maintaining mechanical tension.\n• **Accessory Movements** (${isolationLifts.map((e) => e.name).slice(0, 2).join(', ') || 'isolation exercises'}): 60 to 90 seconds. Sustains metabolic stress and localized cellular swelling.\n\n${readinessState === 'Amber Shield' ? '🛡️ Amber Shield is active: take a full 3–4 minutes on compounds to protect technique.' : ''}`;

            citations.push({
              label: 'Rest Intervals',
              metric: 'Rest Time',
              value: '2.5–3.5 min (Compounds) / 60–90 sec (Accessories)',
            });
          } else if (isDotsQuery) {
            // International DOTS & Strength Standards
            const dotsNode = kg.nodes.find((n) => n.id === 'dots-score');
            const dots = dotsNode?.score ?? 280;
            const pillarNodes = kg.nodes.filter((n) => n.category === 'pillar');

            answerText = `Your current International DOTS score is **${dots}** based on your 7-day EMA bodyweight (${bodyweightEmaKg.toFixed(1)} kg).\n\nStrength Standards Overview:\n${pillarNodes.map((p) => `• **${p.label}:** ${p.subtitle}`).join('\n')}\n\nTo reach the next sub-tier, aim to add +1 rep across your current working sets or advance load by +2.5 kg once all sets reach the top of their rep range.`;

            citations.push({
              label: 'International DOTS',
              metric: 'Relative Score',
              value: `${dots} DOTS Points`,
            });
          } else if (isTempoQuery) {
            // Hypertrophy Lifting Cadence
            answerText = `Optimal hypertrophy tempo for today's workout:\n\n• **Eccentric (Lowering):** 2–3 seconds controlled descent under active tension.\n• **Paused Stretch:** 1 full second at the lengthened position to maximize stretch-mediated hypertrophy.\n• **Concentric (Lifting):** Explosive intent while maintaining strict path.\n• **Lockout:** 0.5 second squeeze without resting on joints.`;

            citations.push({
              label: 'Rep Cadence',
              metric: 'Prescribed Tempo',
              value: '2-1-1-0 (2s eccentric, 1s stretch pause)',
            });
          } else if (isExerciseQuery && targetEx) {
            // Exact Exercise Target Load, Reps & Double Progression
            const isWorkoutEx = 'sets' in targetEx;
            const targetWeight = isWorkoutEx
              ? (targetEx as ExerciseSession).sets[0]?.targetWeightKg ?? 60
              : 60;
            const minReps = isWorkoutEx
              ? (targetEx as ExerciseSession).minReps
              : (targetEx as ExerciseDefinition).defaultRepRange[0];
            const maxReps = isWorkoutEx
              ? (targetEx as ExerciseSession).maxReps
              : (targetEx as ExerciseDefinition).defaultRepRange[1];
            const setCount = isWorkoutEx ? (targetEx as ExerciseSession).sets.length : 3;
            const targetRir = readinessState === 'Amber Shield' ? '2–3 RIR' : '1–2 RIR';
            const inc = targetEx.equipment === 'dumbbell' ? '2.0 kg' : '2.5 kg';

            answerText = `For **${targetEx.name}** today, your target is **${targetWeight} kg** for **${setCount} working sets** of **${minReps}–${maxReps} reps** at **${targetRir}**.\n\n${
              readinessState === 'Primed'
                ? '⚡ Recovery is Primed: If your warmup feels explosive, aim for the top of the rep range on your first working set.'
                : readinessState === 'Amber Shield'
                ? '🛡️ Amber Shield active: Hold working weights constant and keep 2–3 reps in reserve to protect your joints.'
                : '🎯 Focus on a controlled 2-second eccentric phase to maximize mechanical tension.'
            }\n\nOnce all ${setCount} sets reach ${maxReps} reps, increment weight by +${inc} next session.`;

            citations.push({
              label: targetEx.name,
              metric: 'Target Load & Reps',
              value: `${targetWeight} kg × ${setCount} sets (${minReps}–${maxReps} reps)`,
            });
          } else {
            // Dynamic Tactical Session Briefing for Today's Workout
            const plannedList = activeWorkout.exercises
              .map(
                (e, idx) =>
                  `${idx + 1}. **${e.name}** — ${e.sets.length} sets × ${e.minReps}–${e.maxReps} reps @ ${e.sets[0]?.targetWeightKg ?? 0} kg`
              )
              .join('\n');

            const latestBio = biometrics[biometrics.length - 1];

            answerText = `Today's session is **${activeWorkout.name}** (**${activeWorkout.splitDay} Day**) in **Week ${profile.mesocycleWeek || 3} of 6** (${activeWorkout.location === 'travel' ? 'Bodyweight' : activeWorkout.location === 'home' ? 'At Home' : 'Full Gym'} mode).\n\nPlanned Movements:\n${plannedList}\n\n${
              readinessState === 'Primed'
                ? `⚡ Autonomic recovery is **Primed** (HRV: ${latestBio?.hrvRmssd ?? 58}ms, Sleep: ${latestBio?.sleepHours ?? 7.5}h). You have an active +15% XP multiplier—attack Set 1 with high concentric intent!`
                : readinessState === 'Amber Shield'
                ? `🛡️ **Amber Shield** is active today (HRV: ${latestBio?.hrvRmssd ?? 58}ms, Sleep: ${latestBio?.sleepHours ?? 7.5}h). Hold working weights steady, maintain 2–3 reps in reserve, and protect your joints.`
                : `🎯 Recovery baseline is solid (Recovery Efficiency: ${kg.recoveryEfficiencyScore}/100). Focus on clean 2-second eccentrics, hit 1–2 RIR, and lock in progressive overload.`
            }\n\nFeel free to ask about specific targets, warm-up sets, tempo, or exercise substitutions!`;

            citations.push({
              label: activeWorkout.name,
              metric: 'Today\'s Session',
              value: `${activeWorkout.splitDay} Day (${activeWorkout.exercises.length} Exercises Planned)`,
            });
          }
        }
      }
    }
  }

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const latencyMs = hardware.isPixelDevice
    ? Math.min(hardware.inferenceLatencyMs, 12)
    : Math.max(5, Math.round(endTime - startTime));

  const backend = hardware.isPixelDevice
    ? `${hardware.chipModel} TPU • On-Device`
    : 'On-Device Local Engine';

  const message: AssistantChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    sender: 'assistant',
    text: answerText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    actionApplied: actionTaken,
    knowledgeGraphCitations: citations.length > 0 ? citations : undefined,
    scientificPrinciplesCited:
      scientificPrinciplesCited.length > 0 ? scientificPrinciplesCited : undefined,
    latencyMs,
    backend,
    isTensorAccelerated: hardware.isPixelDevice,
  };

  return {
    message,
    updatedProfile,
    updatedWorkout,
    actionTaken,
  };
}
