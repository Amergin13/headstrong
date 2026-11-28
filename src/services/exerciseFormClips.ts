import { EquipmentType, ExerciseDefinition, ExerciseSession } from '../engine/types';

/**
 * Offline-cached, muted, looping biomechanical form clip descriptors for Treise's core catalog.
 *
 * Bundled directly with the PWA (precached by Workbox — works 100% offline in basement gyms
 * with zero YouTube embeds, zero external requests, and zero OS audio-focus interruption so
 * gym music keeps playing uninterrupted).
 */

export type FormClipPattern =
  | 'squat'
  | 'lunge_split'
  | 'hinge'
  | 'horizontal_press'
  | 'incline_press'
  | 'vertical_press'
  | 'vertical_pull'
  | 'horizontal_row'
  | 'lateral_raise'
  | 'bicep_curl'
  | 'tricep_extension'
  | 'leg_curl_extension'
  | 'calf_raise'
  | 'core_plank';

export interface JointPoint {
  x: number;
  y: number;
}

/** 2D side-view or front-view biomechanical posture keyframe in a 240×140 canvas. */
export interface FormPoseKeyframe {
  head: JointPoint;
  shoulder: JointPoint;
  elbow: JointPoint;
  wrist: JointPoint;
  hip: JointPoint;
  knee: JointPoint;
  ankle: JointPoint;
  /** Optional second limb or implement bar/dumbbell center for visual clarity. */
  implement?: JointPoint;
}

export interface ExerciseFormClip {
  id: string;
  pattern: FormClipPattern;
  title: string;
  /** Strictly muted & looping offline demonstration (never external YouTube). */
  muted: true;
  loop: true;
  offlineCached: true;
  /** Cycle duration in ms (eccentric -> pause -> concentric -> reset). */
  cycleMs: number;
  viewLabel: 'Side view' | 'Front view';
  phases: [string, string, string];
  /** Start/top pose and bottom/peak-contraction pose interpolated smoothly in real time. */
  startPose: FormPoseKeyframe;
  peakPose: FormPoseKeyframe;
  /** Optional static apparatus hint drawn in neutral surface stroke. */
  apparatus: 'floor' | 'flat_bench' | 'incline_bench' | 'pullup_bar' | 'cable_high' | 'cable_mid' | 'step';
  equipmentStyle: 'barbell' | 'dumbbell' | 'cable' | 'bodyweight';
  cueSummary: string;
}

const CLIPS: Record<FormClipPattern, Omit<ExerciseFormClip, 'id' | 'title' | 'equipmentStyle'>> = {
  squat: {
    pattern: 'squat',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3600,
    viewLabel: 'Side view',
    phases: ['Control down (2–3s)', 'Pause at depth', 'Drive hips up'],
    apparatus: 'floor',
    startPose: {
      head: { x: 122, y: 24 },
      shoulder: { x: 118, y: 40 },
      elbow: { x: 108, y: 54 },
      wrist: { x: 114, y: 39 },
      hip: { x: 114, y: 74 },
      knee: { x: 120, y: 102 },
      ankle: { x: 118, y: 128 },
      implement: { x: 114, y: 38 },
    },
    peakPose: {
      head: { x: 134, y: 56 },
      shoulder: { x: 124, y: 70 },
      elbow: { x: 112, y: 82 },
      wrist: { x: 120, y: 69 },
      hip: { x: 96, y: 98 },
      knee: { x: 136, y: 96 },
      ankle: { x: 118, y: 128 },
      implement: { x: 120, y: 68 },
    },
    cueSummary: 'Brace your torso, track knees over toes, and reach parallel before driving straight up.',
  },
  lunge_split: {
    pattern: 'lunge_split',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3600,
    viewLabel: 'Side view',
    phases: ['Lower straight down', 'Soft bottom pause', 'Push through front heel'],
    apparatus: 'floor',
    startPose: {
      head: { x: 120, y: 26 },
      shoulder: { x: 118, y: 42 },
      elbow: { x: 118, y: 64 },
      wrist: { x: 120, y: 84 },
      hip: { x: 114, y: 76 },
      knee: { x: 130, y: 102 },
      ankle: { x: 134, y: 128 },
      implement: { x: 120, y: 86 },
    },
    peakPose: {
      head: { x: 124, y: 50 },
      shoulder: { x: 120, y: 66 },
      elbow: { x: 120, y: 88 },
      wrist: { x: 122, y: 108 },
      hip: { x: 112, y: 98 },
      knee: { x: 142, y: 98 },
      ankle: { x: 136, y: 128 },
      implement: { x: 122, y: 110 },
    },
    cueSummary: 'Keep front shin stacked and torso tall; drive cleanly through the front mid-foot.',
  },
  hinge: {
    pattern: 'hinge',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3800,
    viewLabel: 'Side view',
    phases: ['Push hips back', 'Feel hamstring stretch', 'Snap hips forward'],
    apparatus: 'floor',
    startPose: {
      head: { x: 120, y: 24 },
      shoulder: { x: 118, y: 40 },
      elbow: { x: 122, y: 62 },
      wrist: { x: 124, y: 82 },
      hip: { x: 114, y: 74 },
      knee: { x: 118, y: 102 },
      ankle: { x: 118, y: 128 },
      implement: { x: 125, y: 84 },
    },
    peakPose: {
      head: { x: 158, y: 56 },
      shoulder: { x: 142, y: 64 },
      elbow: { x: 138, y: 86 },
      wrist: { x: 134, y: 108 },
      hip: { x: 96, y: 78 },
      knee: { x: 114, y: 104 },
      ankle: { x: 118, y: 128 },
      implement: { x: 134, y: 110 },
    },
    cueSummary: 'Keep the bar skimming your thighs and shins with a neutral spine as your hips travel back.',
  },
  horizontal_press: {
    pattern: 'horizontal_press',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3400,
    viewLabel: 'Side view',
    phases: ['Lower to mid-chest', 'Brief touch', 'Press up & back'],
    apparatus: 'flat_bench',
    startPose: {
      head: { x: 74, y: 86 },
      shoulder: { x: 96, y: 90 },
      elbow: { x: 98, y: 62 },
      wrist: { x: 100, y: 36 },
      hip: { x: 144, y: 92 },
      knee: { x: 168, y: 96 },
      ankle: { x: 168, y: 128 },
      implement: { x: 100, y: 34 },
    },
    peakPose: {
      head: { x: 74, y: 86 },
      shoulder: { x: 96, y: 90 },
      elbow: { x: 102, y: 104 },
      wrist: { x: 108, y: 76 },
      hip: { x: 144, y: 92 },
      knee: { x: 168, y: 96 },
      ankle: { x: 168, y: 128 },
      implement: { x: 108, y: 74 },
    },
    cueSummary: 'Pin shoulder blades into the bench, tuck elbows ~45°, and control the descent to your chest.',
  },
  incline_press: {
    pattern: 'incline_press',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3400,
    viewLabel: 'Side view',
    phases: ['Lower to upper chest', 'Deep stretch', 'Press smoothly up'],
    apparatus: 'incline_bench',
    startPose: {
      head: { x: 86, y: 56 },
      shoulder: { x: 102, y: 70 },
      elbow: { x: 108, y: 48 },
      wrist: { x: 112, y: 26 },
      hip: { x: 136, y: 98 },
      knee: { x: 164, y: 100 },
      ankle: { x: 164, y: 128 },
      implement: { x: 112, y: 24 },
    },
    peakPose: {
      head: { x: 86, y: 56 },
      shoulder: { x: 102, y: 70 },
      elbow: { x: 104, y: 90 },
      wrist: { x: 114, y: 66 },
      hip: { x: 136, y: 98 },
      knee: { x: 164, y: 100 },
      ankle: { x: 164, y: 128 },
      implement: { x: 114, y: 64 },
    },
    cueSummary: 'Set bench to ~30°, keep forearms vertical, and lower into a controlled upper-chest stretch.',
  },
  vertical_press: {
    pattern: 'vertical_press',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3400,
    viewLabel: 'Side view',
    phases: ['Brace & press overhead', 'Lock out over ears', 'Control to collarbone'],
    apparatus: 'floor',
    startPose: {
      head: { x: 118, y: 34 },
      shoulder: { x: 116, y: 50 },
      elbow: { x: 128, y: 66 },
      wrist: { x: 124, y: 48 },
      hip: { x: 116, y: 82 },
      knee: { x: 118, y: 106 },
      ankle: { x: 118, y: 128 },
      implement: { x: 124, y: 46 },
    },
    peakPose: {
      head: { x: 120, y: 34 },
      shoulder: { x: 116, y: 48 },
      elbow: { x: 118, y: 28 },
      wrist: { x: 118, y: 12 },
      hip: { x: 116, y: 82 },
      knee: { x: 118, y: 106 },
      ankle: { x: 118, y: 128 },
      implement: { x: 118, y: 10 },
    },
    cueSummary: 'Squeeze glutes and ribs down; press straight up and stack the load cleanly over mid-foot.',
  },
  vertical_pull: {
    pattern: 'vertical_pull',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3600,
    viewLabel: 'Front view',
    phases: ['Pull elbows to ribs', 'Chest to bar / chin', 'Full overhead stretch'],
    apparatus: 'pullup_bar',
    startPose: {
      head: { x: 120, y: 50 },
      shoulder: { x: 120, y: 64 },
      elbow: { x: 102, y: 42 },
      wrist: { x: 96, y: 20 },
      hip: { x: 120, y: 94 },
      knee: { x: 120, y: 112 },
      ankle: { x: 120, y: 128 },
      implement: { x: 120, y: 18 },
    },
    peakPose: {
      head: { x: 120, y: 24 },
      shoulder: { x: 120, y: 38 },
      elbow: { x: 94, y: 56 },
      wrist: { x: 96, y: 20 },
      hip: { x: 120, y: 68 },
      knee: { x: 120, y: 92 },
      ankle: { x: 120, y: 112 },
      implement: { x: 120, y: 18 },
    },
    cueSummary: 'Initiate by depressing shoulder blades, drive elbows down toward hips, and lower to a full stretch.',
  },
  horizontal_row: {
    pattern: 'horizontal_row',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3400,
    viewLabel: 'Side view',
    phases: ['Reach & protract', 'Drive elbows back', 'Squeeze shoulder blades'],
    apparatus: 'cable_mid',
    startPose: {
      head: { x: 138, y: 40 },
      shoulder: { x: 134, y: 56 },
      elbow: { x: 106, y: 66 },
      wrist: { x: 78, y: 72 },
      hip: { x: 138, y: 94 },
      knee: { x: 106, y: 98 },
      ankle: { x: 76, y: 112 },
      implement: { x: 76, y: 72 },
    },
    peakPose: {
      head: { x: 146, y: 38 },
      shoulder: { x: 142, y: 54 },
      elbow: { x: 162, y: 74 },
      wrist: { x: 136, y: 76 },
      hip: { x: 138, y: 94 },
      knee: { x: 106, y: 98 },
      ankle: { x: 76, y: 112 },
      implement: { x: 134, y: 76 },
    },
    cueSummary: 'Keep chest proud, pull elbows cleanly past your ribs without shrugging, and control the reach.',
  },
  lateral_raise: {
    pattern: 'lateral_raise',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3200,
    viewLabel: 'Front view',
    phases: ['Sweep out to shoulder height', 'Soft 1s control', 'Lower slowly (2–3s)'],
    apparatus: 'floor',
    startPose: {
      head: { x: 120, y: 26 },
      shoulder: { x: 106, y: 44 },
      elbow: { x: 100, y: 68 },
      wrist: { x: 98, y: 88 },
      hip: { x: 120, y: 80 },
      knee: { x: 114, y: 104 },
      ankle: { x: 112, y: 128 },
      implement: { x: 96, y: 90 },
    },
    peakPose: {
      head: { x: 120, y: 26 },
      shoulder: { x: 106, y: 44 },
      elbow: { x: 78, y: 46 },
      wrist: { x: 54, y: 48 },
      hip: { x: 120, y: 80 },
      knee: { x: 114, y: 104 },
      ankle: { x: 112, y: 128 },
      implement: { x: 52, y: 48 },
    },
    cueSummary: 'Lead with your elbows slightly forward of your torso, stop at shoulder height, and resist momentum.',
  },
  bicep_curl: {
    pattern: 'bicep_curl',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3200,
    viewLabel: 'Side view',
    phases: ['Curl smoothly up', 'Squeeze at top', 'Lower to full extension'],
    apparatus: 'floor',
    startPose: {
      head: { x: 118, y: 26 },
      shoulder: { x: 116, y: 42 },
      elbow: { x: 118, y: 68 },
      wrist: { x: 122, y: 92 },
      hip: { x: 116, y: 78 },
      knee: { x: 118, y: 104 },
      ankle: { x: 118, y: 128 },
      implement: { x: 123, y: 94 },
    },
    peakPose: {
      head: { x: 118, y: 26 },
      shoulder: { x: 116, y: 42 },
      elbow: { x: 120, y: 68 },
      wrist: { x: 132, y: 46 },
      hip: { x: 116, y: 78 },
      knee: { x: 118, y: 104 },
      ankle: { x: 118, y: 128 },
      implement: { x: 134, y: 44 },
    },
    cueSummary: 'Pin elbows gently at your sides, curl without swinging your torso, and lower all the way down.',
  },
  tricep_extension: {
    pattern: 'tricep_extension',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3200,
    viewLabel: 'Side view',
    phases: ['Lock elbows to ribs', 'Extend fully down', 'Control back to 90°+'],
    apparatus: 'cable_high',
    startPose: {
      head: { x: 128, y: 26 },
      shoulder: { x: 124, y: 42 },
      elbow: { x: 120, y: 68 },
      wrist: { x: 100, y: 54 },
      hip: { x: 126, y: 78 },
      knee: { x: 124, y: 104 },
      ankle: { x: 124, y: 128 },
      implement: { x: 98, y: 52 },
    },
    peakPose: {
      head: { x: 128, y: 26 },
      shoulder: { x: 124, y: 42 },
      elbow: { x: 120, y: 68 },
      wrist: { x: 112, y: 94 },
      hip: { x: 126, y: 78 },
      knee: { x: 124, y: 104 },
      ankle: { x: 124, y: 128 },
      implement: { x: 110, y: 96 },
    },
    cueSummary: 'Keep upper arms stationary and drive purely through elbow extension to a full lockout.',
  },
  leg_curl_extension: {
    pattern: 'leg_curl_extension',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3400,
    viewLabel: 'Side view',
    phases: ['Drive through full arc', 'Hold peak squeeze', 'Slow 2–3s return'],
    apparatus: 'flat_bench',
    startPose: {
      head: { x: 92, y: 44 },
      shoulder: { x: 94, y: 60 },
      elbow: { x: 96, y: 78 },
      wrist: { x: 106, y: 90 },
      hip: { x: 102, y: 90 },
      knee: { x: 136, y: 90 },
      ankle: { x: 138, y: 124 },
      implement: { x: 138, y: 120 },
    },
    peakPose: {
      head: { x: 92, y: 44 },
      shoulder: { x: 94, y: 60 },
      elbow: { x: 96, y: 78 },
      wrist: { x: 106, y: 90 },
      hip: { x: 102, y: 90 },
      knee: { x: 136, y: 90 },
      ankle: { x: 170, y: 90 },
      implement: { x: 168, y: 90 },
    },
    cueSummary: 'Keep hips anchored firmly in the pad and move smoothly through full knee range of motion.',
  },
  calf_raise: {
    pattern: 'calf_raise',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3400,
    viewLabel: 'Side view',
    phases: ['Pause in deep stretch', 'Drive high onto toes', 'Control down slowly'],
    apparatus: 'step',
    startPose: {
      head: { x: 120, y: 26 },
      shoulder: { x: 118, y: 42 },
      elbow: { x: 118, y: 64 },
      wrist: { x: 118, y: 84 },
      hip: { x: 118, y: 76 },
      knee: { x: 118, y: 102 },
      ankle: { x: 118, y: 126 },
      implement: { x: 118, y: 86 },
    },
    peakPose: {
      head: { x: 120, y: 16 },
      shoulder: { x: 118, y: 32 },
      elbow: { x: 118, y: 54 },
      wrist: { x: 118, y: 74 },
      hip: { x: 118, y: 66 },
      knee: { x: 118, y: 92 },
      ankle: { x: 118, y: 112 },
      implement: { x: 118, y: 76 },
    },
    cueSummary: 'Pause 1–2s at the bottom stretch (no bouncing) before driving all the way up onto your big toe.',
  },
  core_plank: {
    pattern: 'core_plank',
    muted: true,
    loop: true,
    offlineCached: true,
    cycleMs: 3600,
    viewLabel: 'Side view',
    phases: ['Tuck pelvis & brace', 'Exhale ribs down', 'Hold straight line'],
    apparatus: 'floor',
    startPose: {
      head: { x: 74, y: 88 },
      shoulder: { x: 92, y: 92 },
      elbow: { x: 90, y: 118 },
      wrist: { x: 74, y: 120 },
      hip: { x: 132, y: 96 },
      knee: { x: 162, y: 108 },
      ankle: { x: 186, y: 122 },
    },
    peakPose: {
      head: { x: 74, y: 86 },
      shoulder: { x: 92, y: 90 },
      elbow: { x: 90, y: 118 },
      wrist: { x: 74, y: 120 },
      hip: { x: 132, y: 92 },
      knee: { x: 162, y: 106 },
      ankle: { x: 186, y: 122 },
    },
    cueSummary: 'Squeeze glutes and brace your abs hard; avoid letting your lower back sag toward the floor.',
  },
};

function equipmentStyleOf(equipment?: EquipmentType): ExerciseFormClip['equipmentStyle'] {
  if (equipment === 'dumbbell') return 'dumbbell';
  if (equipment === 'cable' || equipment === 'machine') return 'cable';
  if (equipment === 'bodyweight' || equipment === 'weighted_bodyweight') return 'bodyweight';
  return 'barbell';
}

export function resolveFormClipPattern(
  ex: Pick<ExerciseSession, 'exerciseId' | 'name' | 'pillar'> | Pick<ExerciseDefinition, 'id' | 'name' | 'pillar'>
): FormClipPattern {
  const id = ('exerciseId' in ex ? ex.exerciseId : ex.id) || '';
  const s = `${id} ${ex.name || ''}`.toLowerCase();

  if (/(plank|crunch|ab wheel|leg raise|toes[- ]to[- ]bar|l[- ]sit|hollow[- ]body|core|dead bug|bird[- ]dog|pallof|woodchop|russian twist|carry|farmers walk|turkish)/.test(s)) return 'core_plank';
  if (/(calf|calves|tibialis|ankle.*mobilization)/.test(s)) return 'calf_raise';
  if (/(leg curl|leg extension|hamstring curl|quad ext|sissy squat|reverse nordic|nordic)/.test(s)) return 'leg_curl_extension';
  if (/(lateral raise|side delt|upright row|lu raise|y[- ]raise|wall slide|dislocates)/.test(s)) return 'lateral_raise';
  if (/(bicep|curl|hammer curl|preacher|zottman)/.test(s) && !/leg curl|hamstring|nordic/.test(s)) return 'bicep_curl';
  if (/(tricep|pushdown|skullcrusher|skull crusher|jm press|tate press|overhead.*ext|kickback|dip)/.test(s)) return 'tricep_extension';
  if (/(split squat|bulgarian|lunge|step[- ]?(up|down)|cossack|couch stretch|worlds greatest)/.test(s)) return 'lunge_split';
  if (/(incline.*press|incline.*bench|incline.*fly|low[- ]to[- ]high|landmine.*press)/.test(s)) return 'incline_press';
  if (/(deadlift|rdl|romanian|hip thrust|good morning|glute bridge|frog pump|pull[- ]through|glute kickback|reverse hyper|ghd|power clean|hang.*clean|snatch|high pull|kettlebell swing|kb swing|broad jump|hinge|back extension|90\/90)/.test(s)) return 'hinge';
  if (/(squat|leg press|hack squat|pendulum|belt squat|box jump|depth.*jump|hurdle hop|sled|airbike|wall sit)/.test(s)) return 'squat';
  if (/(pull[- ]?up|chin[- ]?up|pulldown|lat pull|lat prayer|pullover|skierg|med.*slam|dead hang)/.test(s)) return 'vertical_pull';
  if (/(row|shrug|face pull|rear delt|reverse fly|pec deck.*rear|reverse pec|pull[- ]?apart|external rotation|open book|thread[- ]the[- ]needle)/.test(s)) return 'horizontal_row';
  if (/(overhead press|shoulder press|ohp|push press|clean & jerk|clean and jerk|z[- ]press|bottoms[- ]up|halo|military|arnold|pike|handstand)/.test(s)) return 'vertical_press';
  if (/(bench|chest press|larsen|spoto|floor press|push[- ]?up|fly|pec deck|crossover|rotational.*toss)/.test(s)) return 'horizontal_press';

  if (ex.pillar === 'Squat') return 'squat';
  if (ex.pillar === 'Hinge') return 'hinge';
  if (ex.pillar === 'Vertical Pull') return 'vertical_pull';
  if (ex.pillar === 'Horizontal Pull') return 'horizontal_row';
  if (ex.pillar === 'Vertical Push') return 'vertical_press';
  return 'horizontal_press';
}

/** Returns the offline-cached, muted, looping form clip for any exercise in the catalog. */
export function getExerciseFormClip(
  ex: Pick<ExerciseSession, 'exerciseId' | 'name' | 'pillar' | 'equipment'> |
    Pick<ExerciseDefinition, 'id' | 'name' | 'pillar' | 'equipment'>
): ExerciseFormClip {
  const pattern = resolveFormClipPattern(ex);
  const base = CLIPS[pattern];
  const id = ('exerciseId' in ex ? ex.exerciseId : ex.id) || pattern;
  return {
    ...base,
    id: `clip-${pattern}-${id}`,
    title: ex.name || pattern,
    equipmentStyle: equipmentStyleOf(ex.equipment),
  };
}
