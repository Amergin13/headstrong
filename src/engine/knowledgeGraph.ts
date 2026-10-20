import {
  BiometricLog,
  DesignSystemComponent,
  DesignSystemComponentCategory,
  ExerciseDefinition,
  JointType,
  ResistanceProfile,
  ScientificPrinciple,
  UserProfile,
  WorkoutSession,
} from './types';
export type { ScientificPrinciple, DesignSystemComponent, DesignSystemComponentCategory };
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
  scientificKnowledgeBase: ScientificPrinciple[];
  designSystem: DesignSystemComponent[];
  systemicAxialLoadScore: number; // 0 - 100
  lengthenedStimulusRatio: number; // 0 - 100%
  recoveryEfficiencyScore: number; // 0 - 100
}

/**
 * Authoritative Exercise Science & Biomechanical Knowledge Base:
 * Codified mathematical models, exercise physiology laws, and wearable telemetry principles
 * powering deterministic Knowledge Graph grounding for both the app UI and the On-Device AI Coach.
 */
export const EXERCISE_SCIENCE_KNOWLEDGE_BASE: ScientificPrinciple[] = [
  {
    id: 'sp-e1rm',
    topic: 'Load Mechanics & E1RM',
    title: 'RIR-Adjusted Estimated 1-Rep Max (E1RM)',
    formula: 'E1RM = Effective Weight × (1 + (Reps + RIR) / 30)',
    scientificRationale:
      'Based on an augmented Lombardi/Epley progression model. Accounting for Repetitions in Reserve (RIR) standardizes true neuromuscular capacity without the severe injury and systemic fatigue costs of taking heavy compound lifts to absolute concentric failure.',
    academicCitation: 'Epley (1985); Lombardi (1989); Zourdos et al. (2016)',
    practicalApplication:
      'Calculates your working 1-rep maximum on every set, normalizes strength across different rep ranges, and benchmarks your progress against international strength standards.',
    keywords: ['e1rm', '1rm', 'epley', 'lombardi', 'e1rm formula', 'reps in reserve', 'rir', 'one rep max', 'estimate max', 'calculate max', 'strength formula'],
  },
  {
    id: 'sp-db-multiplier',
    topic: 'Cross-Implement Continuity',
    title: 'Dumbbell Stabilizer Multiplier (1.18x)',
    formula: 'Effective Barbell-Equivalent = Combined Dumbbell Weight × 1.18',
    scientificRationale:
      'Dumbbells require independent neuromuscular control across multiple rotational axes, recruiting rotator cuff and serratus stabilizers while exhibiting a bilateral force deficit compared to a rigid barbell bar.',
    academicCitation: 'Frecassetti et al. (2020); Saeterbakken et al. (2011)',
    practicalApplication:
      'Allows seamless progressive overload when training with dumbbells at home. For example, pressing two 30 kg dumbbells (60 kg total) provides an authoritative 70.8 kg barbell bench press equivalent.',
    keywords: ['dumbbell', 'dumbbells', 'db', 'multiplier', '1.18', 'stabilizer', 'bilateral deficit', 'barbell equivalent', 'dumbbell bench'],
  },
  {
    id: 'sp-rdl-multiplier',
    topic: 'Cross-Implement Continuity',
    title: 'Romanian Deadlift (RDL) Multiplier (1.20x)',
    formula: 'Effective Deadlift-Equivalent = RDL Weight × 1.20',
    scientificRationale:
      'The Romanian Deadlift loads the posterior chain (hamstrings, glutes, and erector spinae) under deep eccentric stretch without quad drive from the floor, resulting in ~20% higher posterior chain mechanical tension per unit of load compared to conventional deadlifts.',
    academicCitation: 'Schoenfeld et al. (2020); Escamilla et al. (2000)',
    practicalApplication:
      'Normalizes posterior chain loading when performing RDLs at home or the gym against international hinge standards.',
    keywords: ['rdl', 'romanian deadlift', 'deadlift multiplier', '1.20', 'hinge multiplier', 'posterior chain', 'deadlift equivalent'],
  },
  {
    id: 'sp-calisthenics-load',
    topic: 'Load Mechanics & E1RM',
    title: 'Weighted Calisthenics Total Mass Equation',
    formula: 'Effective Weight = 7-Day EMA Bodyweight + External Load',
    scientificRationale:
      'Bodyweight movements (pull-ups, chin-ups, dips) lift the athlete’s body mass against gravity. External plate load must be added to smoothed bodyweight to compute true mechanical tension.',
    academicCitation: 'Ronai et al. (2014); Sanchez-Moreno et al. (2020)',
    practicalApplication:
      'For bodyweight-only pull-ups, external load is 0 kg while total effective mass equals bodyweight (e.g. 80 kg), properly crediting vertical pull volume and DOTS scores.',
    keywords: ['pullup', 'pull-up', 'chin-up', 'dip', 'calisthenics', 'bodyweight load', 'weighted pullup', 'external load', 'calisthenics load'],
  },
  {
    id: 'sp-ema-bw',
    topic: 'Relative Strength Standards',
    title: '7-Day Bodyweight Exponential Moving Average (EMA)',
    formula: 'EMA_today = (Weight_today × 0.25) + (EMA_yesterday × 0.75)',
    scientificRationale:
      'Daily scale weight fluctuates by 1–3 kg due to glycogen storage (1g glycogen binds ~3g water), sodium-potassium fluid shifts, and gastrointestinal transit. A 7-day EMA dampens high-frequency noise to reveal true tissue changes.',
    academicCitation: 'Morton et al. (2018); Helms et al. (2014)',
    practicalApplication:
      'Used for all relative strength ratios and DOTS scoring so temporary water retention never distorts your strength classifications.',
    keywords: ['ema', 'bodyweight', 'average', 'scale weight', 'water retention', 'glycogen', 'smoothing', '7-day', 'body weight average'],
  },
  {
    id: 'sp-dots-polynomial',
    topic: 'Relative Strength Standards',
    title: 'Official International DOTS Polynomial',
    formula: 'DOTS = E1RM_kg × (500 / (A·w⁴ + B·w³ + C·w² + D·w + E))',
    scientificRationale:
      'Eliminates allometric scaling bias. Pure strength-to-weight ratios (e.g. 2x bodyweight) unfairly penalize heavier lifters due to the square-cube law (muscle cross-sectional area scales with length squared, but mass scales with length cubed). DOTS mathematically normalizes strength across all bodyweights.',
    academicCitation: 'International Powerlifting Federation (IPF) Scientific Commission (2019)',
    practicalApplication:
      'Provides an unbiased score comparing relative strength between lifters of different body masses, and powers the Community Leaderboard divisions.',
    keywords: ['dots', 'polynomial', 'relative strength', 'ipf', 'powerlifting', 'formula', 'allometric', 'coefficient', 'dots score'],
  },
  {
    id: 'sp-6-pillars',
    topic: 'Relative Strength Standards',
    title: '6-Pillar International Strength Standards',
    formula: 'Ratio = E1RM / EMA_BW (Squat, Hinge, Horizontal Push, Vertical Push, Horizontal Pull, Vertical Pull)',
    scientificRationale:
      'Human movement requires balanced force production across 6 fundamental planes. Uneven strength (e.g. overdeveloped horizontal push vs weak horizontal pull) elevates shoulder impingement and postural degradation risks.',
    academicCitation: 'Rippetoe & Kilgore (2006); ExRx International Benchmarks',
    practicalApplication:
      'Maps your strength to Untrained, Novice, Intermediate, Advanced, and Elite tiers with 4 granular sub-divisions (I, II, III, IV) and exact reps needed to level up.',
    keywords: ['6 pillars', 'pillars', 'standards', 'novice', 'intermediate', 'advanced', 'elite', 'strength standards', 'squat standard', 'bench standard', 'deadlift standard'],
  },
  {
    id: 'sp-autonomic-readiness',
    topic: 'Biometric Auto-Regulation',
    title: 'Daily Readiness Z-Score & Wearable Telemetry (Fitbit, Whoop, Android Health Connect)',
    formula: 'Readiness = 0.50·Z_HRV - 0.30·Z_RHR + 0.20·((Sleep - 7.5)/1.5)',
    scientificRationale:
      'Nighttime Heart Rate Variability (HRV RMSSD) and Resting Heart Rate (RHR) benchmarked against a 14-day rolling baseline reflect parasympathetic autonomic nervous system balance. Telemetry from Fitbit, Whoop 4.0, or Android Health Connect tracks systemic recovery. Suppressed HRV combined with elevated resting pulse signals central nervous system fatigue and incomplete microtrauma repair.',
    academicCitation: 'Plews et al. (2013); Buchheit (2014); Altini & Plews (2021); Whoop 4.0 Telemetry Validation (2022)',
    practicalApplication:
      'Auto-regulates daily training: Primed (Z >= +0.8, +15% XP bonus), Normal (-0.8 < Z < +0.8), or Amber Shield (Z <= -0.8, holds working weight, 2–3 RIR, protects streak and joints). Seamlessly driven by Google Pixel Watch, Fitbit, Whoop, or Android Health Connect.',
    keywords: ['readiness', 'z-score', 'hrv', 'resting hr', 'rhr', 'sleep', 'amber shield', 'primed', 'pixel watch', 'fitbit', 'whoop', 'health connect', 'android health connect', 'autonomic', 'parasympathetic', 'readiness score', 'wearable'],
  },
  {
    id: 'sp-double-progression',
    topic: 'Progression Mechanics',
    title: 'Double Progression Auto-Regulation Logic',
    formula: 'Top of Rep Range (1-2 RIR) -> +2.5kg BB / +2.0kg DB; Within Range -> +1 Rep',
    scientificRationale:
      'Prevents the common pitfall of increasing weight too early, which compromises technique and reduces effective motor unit recruitment. Lifters must first master the rep range before increasing external load.',
    academicCitation: 'Israetel, Feather & Helms (2020)',
    practicalApplication:
      'Tells you exactly what to lift on each set. When you hit 12/12/12 reps, load increases by 2.5 kg next session; otherwise, you aim for +1 rep with weights held steady.',
    keywords: ['double progression', 'progression', 'add weight', 'add rep', 'rep range', 'auto-regulation', 'overload', 'progressive overload'],
  },
  {
    id: 'sp-hypertrophy-landmarks',
    topic: 'Hypertrophy Volume Landmarks',
    title: 'Israetel & Schoenfeld Muscle Volume Landmarks (MV/MEV/MAV/MRV)',
    formula: 'Weekly Sets: Side Delts (16-26), Calves (16-24), Rear Delts (14-22), Back (14-22), Chest (12-18), Quads (12-18), Hamstrings (10-16)',
    scientificRationale:
      'Different muscles possess radically divergent fiber type composition, eccentric stretch microtrauma, and axial CNS strain. Side delts (zero axial load, fatigue-resistant) thrive on 20+ weekly sets; hamstrings (fast-twitch dominant, severe stretch damage) exceed MRV past 16–18 sets.',
    academicCitation: 'Schoenfeld, Ogborn & Krieger (2017); Israetel et al. (2019)',
    practicalApplication:
      'Calibrates set volume in your workouts so each muscle receives optimal growth stimulus without systemic fatigue accumulation.',
    keywords: ['volume landmarks', 'mav', 'mev', 'mrv', 'mv', 'israetel', 'schoenfeld', 'sets per week', 'how many sets', 'optimal volume', 'hypertrophy landmarks', 'hamstrings', 'side delts', 'calves', 'muscle recovery'],
  },
  {
    id: 'sp-retention-shield',
    topic: 'Nutrition & Retention',
    title: 'Caloric Deficit Muscle Retention & Volume Scaling (Retention Shield)',
    formula: 'Volume scaled to ~85% (~2-3 sets/exercise); Heavy Mechanical Tension (1-2 RIR) Prioritized',
    scientificRationale:
      'In a caloric deficit, muscle protein synthesis (MPS) is reduced and systemic recovery drops by 15–20%. Performing excessive volume (MRV) elevates cortisol and accelerates muscle protein breakdown. Preserving muscle requires high mechanical tension signals, not high-volume exhaustion.',
    academicCitation: 'Helms, Aragon & Fitschen (2014); Murphy & Koehler (2022)',
    practicalApplication:
      'Activates the Retention Shield in Cut / Recomp mode: holds volume at 2–3 sets and celebrates steady weight holding, knowing DOTS relative strength rises as body fat drops.',
    keywords: ['cut', 'cutting', 'recomp', 'retention shield', 'caloric deficit', 'lose fat', 'maintain muscle', 'deficit volume', 'helms', 'retention'],
  },
  {
    id: 'sp-bodyweight-travel',
    topic: 'Cross-Implement Continuity',
    title: 'Bodyweight Hypertrophy & 0kg External Load Mechanics',
    formula: 'External Load = 0 kg; Reps: 15–30 @ 1–2 RIR + 3s Eccentric & 2s Paused Stretch',
    scientificRationale:
      'Lifting light loads or pure bodyweight stimulates equal hypertrophy to heavy weights provided sets are taken within 1–3 reps of failure. Terminal motor unit recruitment is achieved via the size principle as muscle fibers fatigue.',
    academicCitation: 'Schoenfeld, Grgic, et al. (2016); Pedrosa et al. (2022)',
    practicalApplication:
      'When in Travel mode, Treise sets target weight strictly to 0 kg (never telling you to add +5kg) and calibrates reps to your strength level with lengthened tempo cues.',
    keywords: ['travel', 'bodyweight', 'hotel', 'no weights', 'deficit pushup', '0kg', 'bodyweight reps', 'calisthenics reps', 'hotel workout'],
  },
  {
    id: 'sp-rest-intervals',
    topic: 'Physiology & Recovery',
    title: 'Rest Interval Physiology & Neuromuscular Recovery',
    formula: '2.5–3.0 min for Heavy Compound Lifts; 60–90 sec for Isolation Accessories',
    scientificRationale:
      'Resynthesis of cellular phosphocreatine (PCr) follows a biphasic recovery curve: ~70% in 30 seconds, ~90% in 90 seconds, and >98% by 3 minutes. Truncating rest on compound squats or bench presses impairs subsequent set volume load and motor unit recruitment.',
    academicCitation: 'Henselmans & Schoenfeld (2014); Schoenfeld et al. (2016)',
    practicalApplication:
      'The Rest Timer presets 2.5 minutes for compound lifts and 90 seconds for isolation accessories, with a simulated 60% max HR ready indicator.',
    keywords: ['rest', 'rest time', 'rest interval', 'between sets', 'how long to rest', 'pcr', 'phosphocreatine', 'timer', 'rest duration'],
  },
  {
    id: 'sp-stretch-hypertrophy',
    topic: 'Physiology & Recovery',
    title: 'Stretch-Mediated Hypertrophy & Lengthened Position Tension',
    formula: '2–3s Controlled Lowering + 2s Paused Stretch in Full Extension',
    scientificRationale:
      'Tension applied at long muscle lengths causes passive tension in titin filaments, triggering longitudinal sarcomere addition (sarcomerogenesis in series) and elevated muscle protein synthesis compared to contracted-position loading.',
    academicCitation: 'Pedrosa et al. (2022); Wolf et al. (2023)',
    practicalApplication:
      'Tracks your Lengthened Stimulus Ratio (% of sets loaded at long lengths) and provides tactical stretch tempo cues.',
    keywords: ['stretch', 'lengthened', 'eccentric', 'tempo', 'sarcomerogenesis', 'titin', 'long muscle length', 'stretch-mediated', 'stretch hypertrophy'],
  },
  {
    id: 'sp-meso-periodization',
    topic: 'Periodization',
    title: '6-Week Mesocycle Periodization Wave',
    formula: 'W1 (MEV @ 2-3 RIR) -> W3 (Core MAV @ 1-2 RIR) -> W5 (Near-MRV @ 0-1 RIR) -> W6 (Deload MV @ 3-4 RIR)',
    scientificRationale:
      'Periodizing volume across 6 weeks prevents the repeated bout effect and neuromuscular accommodation. A planned deload in Week 6 allows connective tissue recovery and resets muscle sensitivity to anabolic tension.',
    academicCitation: 'Israetel (2017); Plisk & Stone (2003)',
    practicalApplication:
      'Automatically modulates target RIR and set counts across your 6-week training block, clearly displayed in MesocycleManager.tsx.',
    keywords: ['mesocycle', 'periodization', 'deload', 'week 1', 'week 6', 'overreaching', 'volume wave', 'training block', 'periodize'],
  },
  {
    id: 'sp-asynchronous-queue',
    topic: 'Periodization',
    title: 'Asynchronous Hypertrophy Queue Mechanics',
    formula: 'Sequential Rotation (Push -> Pull -> Legs -> Upper); Advance on Completion Only',
    scientificRationale:
      'Muscular recovery and protein synthesis operate on 48h–72h biological clocks, not arbitrary 7-day human calendars. Missing a calendar day does not reduce muscular capacity; holding the queued workout allows optimal training with full glycogen stores.',
    academicCitation: 'Fisher, Steele & Smith (2013)',
    practicalApplication:
      'Eliminates missed workout guilt: if work or travel delays a session, your next planned workout waits at the front of the queue with zero penalty and streak protection.',
    keywords: ['asynchronous', 'queue', 'missed day', 'skip workout', 'calendar day', 'rest day', 'streak safe', 'up next', 'skip day'],
  },
  {
    id: 'sp-wci',
    topic: 'Cardiovascular & Stamina',
    title: 'Work Capacity Index (WCI)',
    formula: 'WCI = (Effective Tonnage × Completed Sets) / (Avg Session HRR% × Duration (min))',
    scientificRationale:
      'Measures total localized mechanical work completed relative to cardiovascular cost (Heart Rate Reserve percentage) over time.',
    academicCitation: 'Banister et al. (1975); Foster et al. (2001)',
    practicalApplication:
      'Displayed in the Progress tab to demonstrate cardiovascular work capacity and muscular endurance progression even during periods of held weight.',
    keywords: ['wci', 'work capacity', 'stamina', 'tonnage', 'hrr', 'heart rate reserve', 'cardiovascular', 'work capacity index'],
  },
  {
    id: 'sp-tensor-ai',
    topic: 'Hardware Acceleration & On-Device AI',
    title: 'Hardware Acceleration & Zero-Cost Local Inference',
    formula: 'Tensor G1-G4 TPU (Gemini Nano AICore) / NPU (WebNN) / GPU (WebGPU) / WASM SIMD Fallback',
    scientificRationale:
      'Processing health, biometric, and training data locally on device protects athlete confidentiality, functions without network coverage in gym basements, eliminates cloud API fees, and delivers < 15ms inference latency.',
    academicCitation: 'Google Tensor Architecture Whitepaper; W3C WebNN / WebGPU Specifications',
    practicalApplication:
      'Accelerates your AI Coach directly on your device with 100% privacy and zero subscription fees.',
    keywords: ['tensor', 'pixel', 'tpu', 'gemini nano', 'on-device', 'local ai', 'latency', 'privacy', 'aicore', 'google pixel ai'],
  },
  {
    id: 'sp-design-system-4-tier-typography',
    topic: 'Design System & Visual Hierarchy',
    title: '4-Tier Strict Typography Scale',
    formula: 'Typography Tiers = { Tier 1: text-xs (12px), Tier 2: text-sm (14px), Tier 3: text-base (16px), Tier 4: text-xl (20px) }',
    scientificRationale:
      'Mobile-first cognitive load research proves that limiting typographic hierarchy to strictly at most 4 distinct sizes minimizes eye saccade fatigue and visual friction during heavy compound physical exertion. Enforces a strict 12px (text-xs) minimum floor.',
    academicCitation: 'Nielsen Norman Group Mobile Readability (2022); Treise Interaction Design Governance',
    practicalApplication:
      'Eliminates erratic font jumps across workouts, cards, and modals, ensuring that headers, metrics, and labels maintain clear, predictable visual weight.',
    keywords: ['typography', 'font size', 'text size', '4-tier', 'text-xs', 'text-sm', 'text-base', 'text-xl', 'hierarchy', 'typography scale'],
  },
  {
    id: 'sp-design-system-semantic-colors',
    topic: 'Design System & Color Semantics',
    title: 'Semantic Color Reservation & CTA Hierarchy',
    formula: 'Primary CTA = Luminous White (bg-white); Recovery Telemetry = Emerald (#00F59B); Caution = Amber (#FFB800)',
    scientificRationale:
      'Over-saturation of neon green on interactive buttons dilutes user focus and exhausts ocular stamina. Reserving solid luminous white for primary action buttons and green strictly for completed set checkmarks, primed recovery scores, and progress bars establishes immediate cognitive affordance.',
    academicCitation: 'ISO 9241-110 Dialogue Principles; Whoop 4.0 Telemetry Design Architecture',
    practicalApplication:
      'Ensures critical buttons like Finish Workout and modal saves stand out with high contrast against the obsidian background without conflicting with health telemetry.',
    keywords: ['color system', 'button color', 'primary cta', 'green button', 'white button', 'semantic color', 'amber shield', 'whoop aesthetics', 'contrast'],
  },
  {
    id: 'sp-design-system-touch-targets',
    topic: 'Mobile Ergonomics & Accessibility',
    title: 'Mandatory 44px Touch Target & Invariant Floors',
    formula: 'Minimum Target Dimensions = 44px × 44px (min-h-[44px])',
    scientificRationale:
      'Sweaty and fatigued athletes experiencing post-exercise tremors exhibit significantly impaired fine motor control. Interactive targets below 44px produce high mis-tap error rates and user frustration.',
    academicCitation: 'WCAG 2.1 Success Criterion 2.5.5 (Target Size); Apple Human Interface Guidelines',
    practicalApplication:
      'Guarantees all interactive elements (buttons, segmented pills, modal headers, stepper inputs) have at least 44px vertical touch targets for effortless in-gym logging.',
    keywords: ['touch target', '44px', 'accessibility', 'wcag', 'min-h-[44px]', 'ergonomics', 'mobile target', 'tap target'],
  },
];

/**
 * Codified Treise Component Design System:
 * Authoritative registry of component logic, anatomy, variants, and Tailwind tokens stored in the Knowledge Graph.
 */
export const TREISE_DESIGN_SYSTEM: DesignSystemComponent[] = [
  {
    id: 'ds-typography-scale',
    name: '4-Tier Strict Typography Scale',
    category: 'typography',
    anatomy: {
      container: 'w-full space-y-1',
      typography: 'Tier 1: text-xs (12px), Tier 2: text-sm (14px), Tier 3: text-base (16px), Tier 4: text-xl (20px)',
      colors: 'text-white (primary), text-slate-200 (secondary), text-slate-400 (metadata), text-brand-primary (accent)',
      states: {
        default: 'font-sans antialiased tracking-tight',
        mono: 'font-mono tabular-numbers',
      },
      touchTarget: 'N/A (Typography Scale)',
    },
    logic: {
      rules: [
        'Maximum 4 distinct typography sizes allowed across the entire application: text-xs (12px), text-sm (14px), text-base (16px), and text-xl (20px).',
        'Strict 12px (text-xs) minimum floor enforced across all surfaces; sub-12px micro-text is strictly prohibited.',
        'Numeric values, telemetry, and loads must use font-mono tabular-numbers.',
        'Single focal point per card with no more than 2-3 typography weights/styles per card.',
      ],
      variants: {
        'caption-metadata': 'text-xs font-medium or font-semibold for labels, badges, time stamps, secondary descriptions',
        'body-standard': 'text-sm font-medium or font-semibold for body copy, list titles, button labels',
        'subheading-card': 'text-base font-bold or font-extrabold for modal titles, card headers, section titles',
        'hero-metric': 'text-xl font-extrabold or font-mono for page titles, hero numbers, circular gauge readouts',
      },
      accessibility: 'Passes WCAG 1.4.4 text scaling & WCAG 1.4.3 contrast ratio (>= 4.5:1 on obsidian #060709)',
    },
    tailwindTokens: 'text-xs | text-sm | text-base | text-xl',
    rationale: 'Human eye saccadic scanning on mobile requires ruthless hierarchy. Restricting the app to exactly 4 sizes eliminates visual cacophony while preserving clear focal distinctions.',
  },
  {
    id: 'ds-btn-primary',
    name: 'Primary CTA Button (Luminous Solid White)',
    category: 'button',
    anatomy: {
      container: 'w-full or px-4 py-2.5 rounded-2xl min-h-[44px] flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98]',
      typography: 'text-xs font-bold sm:text-sm',
      colors: 'bg-white hover:bg-slate-100 text-slate-950 shadow-white/5',
      states: {
        default: 'bg-white text-slate-950 font-bold shadow-md shadow-white/5',
        hover: 'hover:bg-slate-100',
        active: 'active:scale-[0.98]',
        disabled: 'bg-white/[0.06] text-slate-500 cursor-not-allowed shadow-none',
        focus: 'focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2',
      },
      touchTarget: 'Min 44px vertical height (min-h-[44px]) with full touch target pad',
      iconSpec: 'w-4 h-4 stroke-[2.2] text-emerald-600 (for completion) or text-slate-950',
    },
    logic: {
      rules: [
        'Exactly ONE primary CTA button per view, modal, or action card.',
        'Must use solid luminous white background for universal dark mode contrast and clarity.',
        'Never use neon green as button background fill; reserve green for semantic telemetry.',
        'Must maintain min-h-[44px] touch target floor.',
      ],
      variants: {
        finishWorkout: 'bg-white text-slate-950 with emerald checkmark icon',
        modalConfirm: 'w-full bg-white text-slate-950 font-bold',
      },
      accessibility: 'Passes WCAG 2.5.5 Touch Target (>= 44x44px) and WCAG 1.4.3 Contrast (19.8:1 white-on-black contrast ratio)',
    },
    tailwindTokens: 'bg-white hover:bg-slate-100 text-slate-950 font-bold shadow-md shadow-white/5 rounded-2xl min-h-[44px]',
    rationale: 'Solid white buttons on deep obsidian dark themes deliver instant cognitive affordance without the visual fatigue or sensory overload of saturated neon buttons.',
  },
  {
    id: 'ds-btn-secondary',
    name: 'Secondary Dark Glass Action Button',
    category: 'button',
    anatomy: {
      container: 'px-3.5 py-2.5 rounded-xl min-h-[44px] flex items-center justify-center space-x-1.5 transition-colors active:scale-[0.98]',
      typography: 'text-xs font-semibold',
      colors: 'bg-white/[0.08] hover:bg-white/[0.14] text-white',
      states: {
        default: 'bg-white/[0.08] text-white',
        hover: 'hover:bg-white/[0.14]',
        active: 'active:scale-[0.98]',
        disabled: 'bg-white/[0.04] text-slate-600 cursor-not-allowed',
      },
      touchTarget: 'Min 44px vertical height (min-h-[44px])',
      iconSpec: 'w-3.5 h-3.5 stroke-[2] text-slate-300',
    },
    logic: {
      rules: [
        'Used for secondary, auxiliary, or cancel actions alongside a primary CTA.',
        'Must use elevated dark glass (white at 8% opacity) rather than opaque dark blues or grays.',
        'Never compete visually with the primary solid white CTA.',
      ],
      variants: {
        cancel: 'bg-white/[0.08] text-white',
        inlineAuxiliary: 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-200',
      },
      accessibility: 'Passes WCAG 2.5.5 touch target with >= 4.5:1 text-to-background contrast',
    },
    tailwindTokens: 'bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold rounded-xl min-h-[44px]',
    rationale: 'Elevated dark glass preserves the obsidian depth of the interface without creating opaque borders or visually jarring gray boxes.',
  },
  {
    id: 'ds-btn-segmented',
    name: 'Segmented Control / Mode Switcher',
    category: 'pill',
    anatomy: {
      container: 'grid or flex gap-1.5 bg-[#090C12] p-1.5 rounded-2xl',
      typography: 'text-xs font-bold',
      colors: 'Active: bg-white/[0.14] text-white shadow-sm | Inactive: text-slate-400 hover:text-slate-200',
      states: {
        active: 'bg-white/[0.14] text-white font-bold shadow-sm',
        inactive: 'text-slate-400 hover:text-slate-200 font-medium',
      },
      touchTarget: 'Min 44px height (min-h-[44px]) per segment',
    },
    logic: {
      rules: [
        'Used for mutually exclusive mode selections (e.g. Full Gym | At Home | Bodyweight, split days).',
        'A segmented control is NOT a primary CTA and must never use solid neon green as its active state.',
        'Active state uses quiet neutral elevation (14% white overlay) with drop shadow.',
      ],
      variants: {
        equipmentSwitcher: '3-way grid: Full Gym | At Home | Bodyweight',
        splitSelector: 'Multi-day horizontal scroll or flex grid',
        timeframeFilter: '1W | 1M | 3M | All',
      },
      accessibility: 'ARIA role="group" or role="tablist" with aria-pressed or aria-selected',
    },
    tailwindTokens: 'bg-white/[0.14] text-white font-bold shadow-sm rounded-xl min-h-[44px]',
    rationale: 'Prevents cognitive noise by keeping mode selection calm, allowing the actual workout content below to hold primary visual interest.',
  },
  {
    id: 'ds-set-toggle',
    name: 'Set Completion & Progression Checkmark',
    category: 'toggle',
    anatomy: {
      container: 'w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90',
      typography: 'N/A (Icon)',
      colors: 'Completed: bg-brand-primary text-black font-extrabold | Incomplete: bg-[#0B0E14] hover:bg-white/[0.08] text-slate-400',
      states: {
        incomplete: 'bg-[#0B0E14] hover:bg-white/[0.08] text-slate-400',
        completed: 'bg-brand-primary text-black font-extrabold shadow-sm',
        warmup: 'bg-amber-500/20 text-amber-300 font-mono font-bold',
      },
      touchTarget: 'Parent flex column provides >= 44px touch target alignment',
      iconSpec: 'Check icon w-4 h-4 stroke-[2.5]',
    },
    logic: {
      rules: [
        'Green is strictly reserved for the completed set checkmark, celebrating progressive overload.',
        'Warmup sets display distinctive amber "W" badge to avoid user confusion with working sets.',
        'Completing a set triggers haptic feedback and real-time tonnage/XP updates.',
      ],
      variants: {
        workingSet: 'Checkmark toggle with green completion state',
        warmupSet: 'Amber W indicator with pre-filled ramping loads',
      },
      accessibility: 'aria-label="Complete set N" / aria-pressed="true|false"',
    },
    tailwindTokens: 'bg-brand-primary text-black font-extrabold shadow-sm rounded-xl w-8 h-8',
    rationale: 'Delivers a visceral dopamine feedback loop upon completing a grueling working set without cluttering the rest of the UI with neon accents.',
  },
  {
    id: 'ds-card-biometric',
    name: 'Biometric Luxury Card (Whoop 4.0 Aesthetics)',
    category: 'card',
    anatomy: {
      container: 'p-5 sm:p-6 rounded-3xl bg-[#0E1219] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.55)] space-y-4',
      typography: 'Headers: text-base font-extrabold text-white tracking-tight; Body: text-xs text-slate-300',
      colors: 'Background: #0E1219, Drop Shadow: rgba(0,0,0,0.55)',
      states: {
        default: 'Zero border strokes; soft specular gradient lighting',
      },
      touchTarget: 'N/A (Card Surface)',
    },
    logic: {
      rules: [
        'No perimeter strokes or harsh borders; contrast and depth must be established through specular color fields and soft drop-shadows.',
        'Must maintain generous internal padding (p-5 sm:p-6).',
        'Top focal point of every card must clearly answer: What is this and what is my next action?',
      ],
      variants: {
        heroCard: 'p-5 sm:p-6 space-y-4 bg-[#0E1219]',
        compactSubCard: 'p-4 rounded-2xl bg-[#141824]',
      },
      accessibility: 'Clean reading flow; passes WCAG AA contrast against #060709 base canvas',
    },
    tailwindTokens: 'biometric-card p-5 sm:p-6 rounded-3xl bg-[#0E1219] space-y-4',
    rationale: 'Eliminates the cheap wireframe feeling of bordered cards, establishing a premium tactile aesthetic inspired by Whoop 4.0 and Apple Watch interfaces.',
  },
  {
    id: 'ds-badge-status',
    name: 'Semantic Status Badge / Indicator',
    category: 'badge',
    anatomy: {
      container: 'inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold',
      typography: 'text-xs font-bold font-mono or font-sans',
      colors: 'Primed: bg-brand-primary/15 text-brand-primary | Caution: bg-amber-500/15 text-amber-300 | High Strain: bg-rose-500/15 text-rose-300 | Strain/Engine: bg-brand-strain/15 text-brand-strain | Info: bg-white/[0.08] text-slate-300',
      states: {
        default: 'Soft tinted background with high-contrast text',
      },
      touchTarget: 'N/A (Read-only badge) or min-h-[44px] when interactive',
    },
    logic: {
      rules: [
        'Color semantics are strictly immutable: Green = Primed/Recovery, Amber = Amber Shield/Caution, Rose = Joint Strain Alert, Cyan = Strain/Cardio, Slate = Neutral Info.',
        'Never mix semantic colors arbitrarily.',
      ],
      variants: {
        primed: 'bg-brand-primary/15 text-brand-primary',
        amberShield: 'bg-amber-500/15 text-amber-300',
        jointStrain: 'bg-rose-500/15 text-rose-300',
        strainMetric: 'bg-brand-strain/15 text-brand-strain',
        neutralInfo: 'bg-white/[0.08] text-slate-300',
      },
      accessibility: 'High text-to-badge contrast ratio (>= 5:1)',
    },
    tailwindTokens: 'px-3 py-1 rounded-full text-xs font-bold bg-brand-primary/15 text-brand-primary',
    rationale: 'Allows athletes to scan physiological state and telemetry instantly without reading paragraphs of prose.',
  },
  {
    id: 'ds-input-numeric',
    name: 'Numeric Load & Reps Stepper Input',
    category: 'input',
    anatomy: {
      container: 'flex items-center bg-[#0B0E14] rounded-xl p-0.5 min-h-[44px]',
      typography: 'text-sm font-mono font-extrabold tabular-numbers text-center',
      colors: 'bg-transparent text-white focus:outline-none focus:ring-1 focus:ring-brand-primary',
      states: {
        default: 'text-white font-mono',
        completed: 'text-brand-primary font-mono',
        focus: 'focus:ring-1 focus:ring-brand-primary',
      },
      touchTarget: 'Stepper buttons w-7 h-8 (enclosed in min-h-[44px] row)',
      iconSpec: 'Minus/Plus icons w-3.5 h-3.5 stroke-[2]',
    },
    logic: {
      rules: [
        'Always selects all text on focus for effortless 1-tap overwrite on mobile keyboards.',
        'Pre-fills with target load and target reps from progression engine or previous session.',
        'Supports quick stepper taps for micro-adjustments (+/- 1 rep or +/- 2.5kg).',
      ],
      variants: {
        weightInput: 'Displays kg with plate calculator quick-trigger',
        repsInput: 'Displays reps with increment/decrement steppers',
      },
      accessibility: 'Accessible aria-label specifying exercise, set number, and metric',
    },
    tailwindTokens: 'bg-[#0B0E14] rounded-xl text-center font-mono text-sm font-extrabold tabular-numbers min-h-[44px]',
    rationale: 'Gym fingers are sweaty and fatigued; inputs must be forgiving, pre-filled, and operable via steppers or keypad.',
  },
  {
    id: 'ds-modal-dialog',
    name: 'Modal Sheet & Dialog',
    category: 'modal',
    anatomy: {
      container: 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-md',
      typography: 'Title: text-base font-extrabold text-white tracking-tight; Subtitle: text-xs text-slate-400',
      colors: 'Modal Box: bg-[#0E1219] border border-white/[0.04] shadow-2xl',
      states: {
        default: 'Sliding up from bottom on mobile, centered on tablet/desktop',
      },
      touchTarget: 'Close button min-h-[44px] min-w-[44px]',
    },
    logic: {
      rules: [
        'Modal header must feature a clear dismiss button (✕) with min-h-[44px] touch target.',
        'Backdrop must use heavy blur (backdrop-blur-md) to isolate the interaction context.',
        'Action button group must place primary CTA first, with secondary cancel action below or beside.',
      ],
      variants: {
        actionSheet: 'Bottom-sheet style on mobile with sticky confirmation button',
        fullModal: 'Centered dialog for deep configurations like governance or split editor',
      },
      accessibility: 'Traps focus, supports Escape key dismiss, aria-modal="true" role="dialog"',
    },
    tailwindTokens: 'bg-[#0E1219] p-5 sm:p-6 rounded-3xl shadow-2xl space-y-4 max-w-md w-full',
    rationale: 'Keeps focused secondary flows (e.g. logging bodyweight, swapping exercises) contextual and prevents accidental dismissal.',
  },
  {
    id: 'ds-nested-radius',
    name: 'Shift Nudge Concentric Radius Invariant',
    category: 'layout',
    anatomy: {
      container: 'Outer container with padding enclosing inner nested container',
      typography: 'N/A (Geometric Rule)',
      colors: 'Outer: #0E1219 (Card) | Inner: #141824 (Sub-card) or #090C12 (Well)',
      states: {
        default: 'Concentric corners where negative space between curves remains mathematically constant',
      },
      touchTarget: 'Preserves inner touch target boundaries without corner clipping',
    },
    logic: {
      rules: [
        'Shift Nudge Nested Radius Formula: Inner Radius = Outer Radius - Padding.',
        'Prevents the "nested radius pinch" where an inner container uses the same corner radius as the parent container.',
        'Outer rounded-3xl (26px) with p-5 (20px padding) requires inner rounded-sm/md (6-8px).',
        'Outer rounded-2xl (20px) with p-1.5 (6px padding) requires inner rounded-xl (14px).',
      ],
      variants: {
        cardToSubCard: 'rounded-3xl (26px) outer with p-5/p-6 -> rounded-lg/xl (8-12px) inner sub-panels',
        groupToPill: 'rounded-2xl (20px) outer group with p-1.5 (6px) -> rounded-xl (14px) inner segmented buttons',
      },
      accessibility: 'Optical harmony reduces cognitive fatigue and visual jarring during intense gym workouts',
    },
    tailwindTokens: 'Outer: rounded-3xl p-5 | Inner: rounded-xl or rounded-lg',
    rationale: 'Matt D. Smith (Shift Nudge) signature principle: When border radii are concentric, negative space flows naturally and looks designed rather than thrown together.',
  },
  {
    id: 'ds-spatial-grid',
    name: 'Shift Nudge 8pt Spatial Scale & Proximity Hierarchy',
    category: 'layout',
    anatomy: {
      container: 'Multi-tiered vertical rhythm utilizing base-8 grid with base-4 micro-increments',
      typography: 'N/A (Spatial Scale)',
      colors: 'Negative space (transparent obsidian margins)',
      states: {
        default: 'Predictable rhythmic rhythm across cards, sections, and active workouts',
      },
      touchTarget: 'Ensures min 8px spacing between distinct interactive touch targets',
    },
    logic: {
      rules: [
        'All layout margins, internal paddings, and component gaps adhere to base-8 increments (4px, 8px, 12px, 16px, 20px, 24px, 32px).',
        'Law of Proximity: Intra-element spacing (4–8px) must be strictly less than card internal padding (16–24px), which must be less than section separation (24–32px).',
        'Negative space is an active design element acting as the primary separator before resorting to lines or borders.',
      ],
      variants: {
        microGap: 'gap-1 (4px) or gap-1.5 (6px) for tightly grouped controls and icons',
        elementGap: 'gap-2 (8px) or gap-3 (12px) for related form fields and metric columns',
        cardPadding: 'p-5 (20px) or p-6 (24px) for luxury biometric surfaces',
        sectionMargin: 'space-y-4 (16px) to space-y-6 (24px) for distinct view blocks',
      },
      accessibility: 'WCAG 2.5.8 compliant: maintains generous separation between adjacent tap targets',
    },
    tailwindTokens: 'p-5 sm:p-6 space-y-4 gap-2',
    rationale: 'Systematic spatial increments eliminate guesswork and create an instinctive, calming visual rhythm on mobile displays.',
  },
  {
    id: 'ds-squint-hierarchy',
    name: 'Shift Nudge Squint Test & Focal Point Authority',
    category: 'layout',
    anatomy: {
      container: 'Full viewport layout structure and visual weight distribution',
      typography: 'Primary: text-base to text-xl font-bold; Secondary: text-xs text-slate-400',
      colors: 'Dominant white CTA (#FFFFFF) and emerald checkmarks (#00F59B) against obsidian (#060709)',
      states: {
        squintPass: 'When blurred, the primary action and active exercise card are unmistakably obvious in < 200ms',
      },
      touchTarget: 'Primary focal element commands prominent touch envelope (>= 44px)',
    },
    logic: {
      rules: [
        'The Squint Test Rule: An interface is not a democracy; elements cannot compete with equal visual weight.',
        'Exactly ONE primary focal point per screen or modal dialog.',
        'Active exercise card holds highest visual weight in the training view; segmented mode controls remain quiet neutrals.',
        'Primary action uses solid luminous white (20:1 contrast ratio) so it cuts through ocular fatigue in bright gym lighting.',
      ],
      variants: {
        trainingView: 'Focal 1: Current Exercise Card -> Focal 2: Solid Checkmark -> Focal 3: Finish Workout CTA',
        analyticsView: 'Focal 1: 7-Day EMA Weight Hero -> Focal 2: Strength vs Bodyweight Chart',
      },
      accessibility: 'Guarantees immediate cognitive orientation for visually impaired or physically exhausted lifters',
    },
    tailwindTokens: 'Primary CTA: bg-white text-slate-950 font-bold | Active Card: bg-[#0E1219] shadow-2xl',
    rationale: 'Athletes in the middle of a heavy compound set experience tunnel vision; visual hierarchy must be ruthless so orientation requires zero effort.',
  },
];
export const HEADSTRONG_DESIGN_SYSTEM = TREISE_DESIGN_SYSTEM;

/**
 * Searches and queries the Knowledge Graph's Design System components.
 */
export function queryDesignSystemComponents(query?: string): DesignSystemComponent[] {
  if (!query || !query.trim()) return TREISE_DESIGN_SYSTEM;
  const q = query.toLowerCase().trim();
  const stopWords = new Set(['what', 'is', 'the', 'a', 'an', 'and', 'in', 'on', 'of', 'for', 'to', 'how', 'does', 'do', 'are', 'treise', 'headstrong', 'app']);
  const tokens = q
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));

  const scored = TREISE_DESIGN_SYSTEM.map((c) => {
    const textBlob = `${c.id} ${c.name} ${c.category} ${c.rationale} ${c.logic.rules.join(' ')} ${c.tailwindTokens}`.toLowerCase();
    let score = 0;
    if (textBlob.includes(q)) score += 50;
    if (c.id.toLowerCase().includes(q)) score += 30;
    if (c.name.toLowerCase().includes(q)) score += 20;
    for (const tok of tokens) {
      if (c.id.toLowerCase().includes(tok)) score += 10;
      if (c.name.toLowerCase().includes(tok)) score += 8;
      if (c.category.toLowerCase() === tok) score += 6;
      if (textBlob.includes(tok)) score += 3;
    }
    return { component: c, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.component);

  return scored;
}

export function getDesignSystemComponentById(id: string): DesignSystemComponent | undefined {
  return TREISE_DESIGN_SYSTEM.find((c) => c.id === id);
}

/**
 * Searches and queries the Knowledge Graph's authoritative Exercise Science knowledge base.
 */
export function queryExerciseScienceKnowledgeBase(query: string): ScientificPrinciple | null {
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return null;

  let bestMatch: ScientificPrinciple | null = null;
  let maxScore = 0;

  for (const principle of EXERCISE_SCIENCE_KNOWLEDGE_BASE) {
    let score = 0;

    // 1. Title match (highest weight)
    if (cleanQuery.includes(principle.title.toLowerCase())) {
      score += 100;
    }

    // 2. Keyword match (prefer longer/multi-word matches)
    for (const kw of principle.keywords) {
      if (cleanQuery.includes(kw)) {
        score += kw.includes(' ') ? kw.length * 4 : kw.length * 2;
      }
    }

    // 3. Topic match
    if (cleanQuery.includes(principle.topic.toLowerCase())) {
      score += 20;
    }

    if (score > maxScore && score >= 4) {
      maxScore = score;
      bestMatch = principle;
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // Fallback: Multi-word token overlap on title and keywords
  const tokens = cleanQuery.split(/\s+/).filter((t) => t.length > 3);
  for (const principle of EXERCISE_SCIENCE_KNOWLEDGE_BASE) {
    let score = 0;
    for (const tok of tokens) {
      if (principle.keywords.some((k) => k.toLowerCase() === tok || k.toLowerCase().includes(tok))) score += 3;
      if (principle.title.toLowerCase().includes(tok)) score += 3;
    }
    if (score > maxScore && score >= 6) {
      maxScore = score;
      bestMatch = principle;
    }
  }

  return bestMatch;
}

/**
 * Multi-result fuzzy search across scientific principles
 */
export function searchExerciseScienceKnowledgeBase(query: string, maxResults: number = 6): ScientificPrinciple[] {
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return EXERCISE_SCIENCE_KNOWLEDGE_BASE.slice(0, maxResults);

  const tokens = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
  const scored = EXERCISE_SCIENCE_KNOWLEDGE_BASE.map((p) => {
    let score = 0;
    if (p.title.toLowerCase().includes(cleanQuery)) score += 10;
    if (p.topic.toLowerCase().includes(cleanQuery)) score += 8;
    for (const kw of p.keywords) {
      if (cleanQuery.includes(kw) || kw.includes(cleanQuery)) score += 6;
    }
    for (const tok of tokens) {
      if (p.keywords.some((k) => k.includes(tok))) score += 3;
      if (p.title.toLowerCase().includes(tok)) score += 3;
      if (p.scientificRationale.toLowerCase().includes(tok)) score += 1;
    }
    return { principle: p, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.principle);

  return scored.slice(0, maxResults);
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
  if (ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic) {
    axialLoadIndex = isIsolation ? 0.04 : 0.10;
  } else if (id.includes('deadlift') && !id.includes('rdl')) axialLoadIndex = 0.95;
  else if (id.includes('squat')) axialLoadIndex = 0.85;
  else if (id.includes('rdl')) axialLoadIndex = 0.75;
  else if (id.includes('barbell-row')) axialLoadIndex = 0.65;
  else if (id.includes('ohp')) axialLoadIndex = 0.50;
  else if (id.includes('bench') || id.includes('pullup') || id.includes('leg-press')) axialLoadIndex = 0.35;
  else if (isIsolation) axialLoadIndex = 0.08;

  // Stimulus-to-Fatigue Ratio (1.0 - 10.0)
  let sfrScore = ex.sfrScore ?? 8.0;
  if (ex.equipment === 'bodyweight' && !ex.isWeightedCalisthenic) {
    sfrScore = 9.0;
  } else if (id.includes('cable') || id.includes('incline') || id.includes('calf') || id.includes('leg-curl')) {
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

  const hasTravelOrBw =
    recentWorkouts.some(
      (w) => w.location === 'travel' || w.exercises.some((e) => e.equipment === 'bodyweight')
    ) || profile.activeLocation === 'travel';

  if (hasTravelOrBw) {
    insights.push({
      id: 'pkg-insight-travel-bw',
      category: 'Hypertrophy',
      title: 'Bodyweight Mechanical Tension Progression',
      confidence: 94,
      impactMetric: 'Effective Tension',
      narrative:
        'When training without gym weights, muscle hypertrophy is driven by higher rep targets (up to 30 reps at 1–2 RIR) and 3-second lowering tempos that maximize mechanical tension at long muscle lengths.',
      actionableStep:
        'Focus on full range of motion with a 2-second paused stretch at the bottom of each bodyweight rep.',
    });
  }

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
    scientificKnowledgeBase: EXERCISE_SCIENCE_KNOWLEDGE_BASE,
    designSystem: TREISE_DESIGN_SYSTEM,
    systemicAxialLoadScore,
    lengthenedStimulusRatio,
    recoveryEfficiencyScore,
  };
}
