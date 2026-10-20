export type GovernanceStatus = 'locked' | 'progressing' | 'under_review';

export type GovernanceCategory =
  | 'Session Coaching & Progression'
  | 'Exercise Database & Swaps'
  | 'Equipment & Location Context'
  | 'Hypertrophy Science Engine'
  | 'UX & Information Architecture'
  | 'Biometrics & Wearables'
  | 'Biometrics & Gamification';

export interface GovernanceChangeItem {
  id: string;
  title: string;
  category: GovernanceCategory;
  status: GovernanceStatus;
  versionIntroduced: string;
  rationale: string;
  whatWorkedWell: string;
  critiqueAndRisks: string;
  lockedInvariant: string;
  files: string[];
  userNote?: string;
}

export type CompetitorRating = 'leader' | 'partial' | 'none';

export interface CompetitorMatrixRow {
  id: string;
  feature: string;
  category: GovernanceCategory;
  governanceStatus: GovernanceStatus;
  userValueProposition: string;
  headstrong: {
    rating: CompetitorRating;
    summary: string;
  };
  rpHypertrophy: {
    rating: CompetitorRating;
    summary: string;
  };
  fitbod: {
    rating: CompetitorRating;
    summary: string;
  };
  hevyStrong: {
    rating: CompetitorRating;
    summary: string;
  };
  whoopAthlytic: {
    rating: CompetitorRating;
    summary: string;
  };
}

export const INITIAL_GOVERNANCE_ITEMS: GovernanceChangeItem[] = [
  {
    id: 'gov-13-movement-families',
    title: '13-Family Biomechanical Exercise Database & Strict Swap Matching',
    category: 'Exercise Database & Swaps',
    status: 'locked',
    versionIntroduced: 'v1.4',
    rationale:
      'Prevent invalid exercise substitutions (such as swapping Barbell Bench Press for Cable Kneeling Crunch or Tricep Pushdown) by matching strictly on 13 biomechanical movement families rather than broad 6-pillar tags.',
    whatWorkedWell:
      'Eliminated cross-contaminating compounds with core/isolation exercises. Every exercise now maps to real Gym, Home (DB/Bench/TRX/Bar), and Travel (Bodyweight) equivalents.',
    critiqueAndRisks:
      'Earlier implementation relied on broad 6-pillar tags, which caused Cable Crunch and Tricep Pushdown to appear as Bench Press swaps. Must remain strictly locked to movementFamily.',
    lockedInvariant:
      'getVectorImplementOptions(ex) must only return exercises sharing the exact movementFamily ID and never mix compound presses with core or elbow isolations.',
    files: [
      'src/services/seedData.ts',
      'src/engine/progression.ts',
      'src/components/train/ExerciseSwapModal.tsx',
    ],
  },
  {
    id: 'gov-cross-implement-continuity',
    title: 'Cross-Equipment Strength Continuity (Barbell ↔ Dumbbell ↔ Bodyweight)',
    category: 'Session Coaching & Progression',
    status: 'locked',
    versionIntroduced: 'v1.2',
    rationale:
      'Traditional trackers (Hevy, Strong) track per-exercise silos—swapping from Barbell Bench to Dumbbell Bench resets history to zero. Treise normalizes load via 1.18x Dumbbell and 1.20x RDL multipliers so progress continues seamlessly.',
    whatWorkedWell:
      'Translates working weights accurately between barbell, dumbbells, and weighted calisthenics while preserving longitudinal E1RM and rep targets.',
    critiqueAndRisks:
      'Pure bodyweight movements (0 kg external weight) should progress via reps and tempo rather than suggesting +2.5 kg barbell increments.',
    lockedInvariant:
      'translateWeightBetweenImplements(90kg Barbell) must equal 76kg combined Dumbbell (38kg/DB) and preserve canonical E1RM.',
    files: ['src/engine/e1rm.ts', 'src/engine/progression.ts'],
  },
  {
    id: 'gov-rp-volume-landmarks',
    title: 'Per-Muscle Hypertrophy Volume Landmarks & 6-Week Wave',
    category: 'Hypertrophy Science Engine',
    status: 'locked',
    versionIntroduced: 'v1.1',
    rationale:
      'A flat "20 sets per bodypart" rule ignores muscle physiology. Fast-recovering, low-axial-fatigue muscles (Side Delts 16–26 sets, Calves 16–24 sets) need high volume, whereas high-damage fast-twitch Hamstrings (10–16 sets) require lower volume.',
    whatWorkedWell:
      'Accurately models MV, MEV, MAV, and MRV across 12 muscle groups, credits 0.5 fractional sets for compound synergists, and excludes warmup sets.',
    critiqueAndRisks:
      'Academic terms (MEV/MAV/MRV/SFR) were initially exposed in the UI and caused cognitive overload. Keep the math locked in the engine while using plain English ("Target Weekly Sets") in the UI.',
    lockedInvariant:
      'Side Delts MAV (16–26) and Calves MAV (16–24) must exceed Hamstrings MAV (10–16); warmup sets must contribute 0 volume.',
    files: ['src/engine/hypertrophyVolume.ts', 'src/services/storage.ts'],
  },
  {
    id: 'gov-plain-english-design-heuristics',
    title: 'Zero Internal Jargon & 3-Tier Typography Hierarchy',
    category: 'UX & Information Architecture',
    status: 'locked',
    versionIntroduced: 'v1.3',
    rationale:
      'Early versions leaked internal UX and engineering methods ("OOUX Movement Swap", "Personal Knowledge Graph", "Canonical Vector") into user-facing screens and used sub-11px micro-badges.',
    whatWorkedWell:
      'Replaced all internal method names with clear consumer language ("Switch Exercise", "Training Insights", "How to Make Progress Today") and enforced readable 12px+ typography.',
    critiqueAndRisks:
      'Must be guarded continuously so new features never introduce internal framework terminology.',
    lockedInvariant:
      'Zero occurrences of "OOUX", "PKG", "Canonical Vector", or "SFR" in user-facing component labels.',
    files: [
      'src/components/train/TrainTab.tsx',
      'src/components/train/ExerciseCard.tsx',
      'src/components/analytics/AnalyticsTab.tsx',
    ],
  },
  {
    id: 'gov-session-to-session-checklist',
    title: '"How to Make Progress Today" Session-to-Session Action Checklist',
    category: 'Session Coaching & Progression',
    status: 'progressing',
    versionIntroduced: 'v1.3',
    rationale:
      'Core value proposition: immediately answer "what am I training today, and what do I need to do to make progress" at the top of the Workout screen.',
    whatWorkedWell:
      'Clearly highlights which exercises are due for a weight increase (+2.5kg / +2kg) and which exercises need +1 rep to beat last session.',
    critiqueAndRisks:
      'Currently static during the workout; progressing toward checking off each goal dynamically as the user completes the target sets.',
    lockedInvariant:
      'Workout screen must display the active program week, today’s split, and specific weight/rep progression targets.',
    files: ['src/components/train/TrainTab.tsx', 'src/engine/progression.ts'],
  },
  {
    id: 'gov-location-equipment-onboarding',
    title: 'Multi-Location Equipment Profiles (Full Gym / At Home / Travel)',
    category: 'Equipment & Location Context',
    status: 'progressing',
    versionIntroduced: 'v1.4',
    rationale:
      'Users often have a gym membership, a home setup (Bench, Dumbbells, TRX, Pull-Up Bar), and travel days (Bodyweight). Switching locations in 1 tap adapts the session without losing progression.',
    whatWorkedWell:
      '1-tap switcher on the Workout tab and 3-step Onboarding wizard let users configure exact home equipment and adapt any workout immediately.',
    critiqueAndRisks:
      'Bodyweight and TRX movements need rep-target progression rather than external weight increments when external load is 0 kg.',
    lockedInvariant:
      'adaptWorkoutSessionToLocation("home") must only select exercises matching the user’s checked homeEquipment.',
    files: [
      'src/components/onboarding/OnboardingModal.tsx',
      'src/services/workoutGenerator.ts',
      'src/components/train/TrainTab.tsx',
    ],
  },
  {
    id: 'gov-hero-card-vertical-density',
    title: 'Asynchronous Hypertrophy Queue & Single-Focus Workout Hero Card',
    category: 'UX & Information Architecture',
    status: 'locked',
    versionIntroduced: 'v1.5',
    rationale:
      'Showing 6 unlabeled green segments above 4 competing session tabs ("1. Push TODAY", "2. Pull", "3. Legs", "4. Upper") violated Visual Simplicity, Hierarchy, and Opinionated Tone. Hypertrophy progression is an asynchronous rotation based on muscle recovery windows (48h–72h), not a rigid calendar.',
    whatWorkedWell:
      'Replaced the 6 unlabeled segments and 4 competing tabs with a single, opinionated "Up Next" session recommendation, muscle recovery window badge ("Chest & Synergists 100% Recovered"), and skipped-day continuity rationale.',
    critiqueAndRisks:
      'Never re-introduce unlabeled progress bars or competing multi-tab split switchers into the primary Workout hero view.',
    lockedInvariant:
      'getHypertrophyQueueRecommendation() must drive a single opinionated session header with muscle recovery hours (48h–72h) and zero calendar penalty when a day is skipped.',
    files: ['src/components/train/TrainTab.tsx', 'src/services/workoutGenerator.ts'],
  },
  {
    id: 'gov-single-entry-point-cohesion',
    title: 'Single Canonical Entry Point Per Job (1 Equipment Switcher, 1 Exercise Changer)',
    category: 'UX & Information Architecture',
    status: 'locked',
    versionIntroduced: 'v1.5',
    rationale:
      'Earlier iterations duplicated entry points across screens: ExerciseCard had both a "Switch Equipment" button and an inline "Equipment: [Barbell] [Dumbbell] [Dumbbell]..." carousel (which mapped alternative exercises to duplicate equipment labels), while TrainTab and ProgramTab duplicated onboarding, split switching, and Watch sync controls.',
    whatWorkedWell:
      'Eliminated the duplicate Equipment carousel on ExerciseCard, unified exercise swapping into a single "Change Exercise" button + modal, unified session equipment switching into a single 3-segment Location bar ("Full Gym | At Home | Travel"), and removed duplicate header/settings buttons.',
    critiqueAndRisks:
      'Every user job must have exactly 1 canonical UI entry point. Never add inline equipment carousels on ExerciseCard or duplicate Program tab controls inside the Workout tab.',
    lockedInvariant:
      '1 method for switching session equipment (Full Gym | At Home | Travel on TrainTab) and 1 method for changing an exercise ("Change Exercise" button -> ExerciseSwapModal).',
    files: [
      'src/components/train/ExerciseCard.tsx',
      'src/components/train/ExerciseSwapModal.tsx',
      'src/components/train/TrainTab.tsx',
      'src/components/program/ProgramTab.tsx',
      'src/components/common/Header.tsx',
    ],
  },
  {
    id: 'gov-wearable-readiness-autoregulation',
    title: 'Pixel Watch / Fitbit Z-Score Readiness & Recovery Shield',
    category: 'Biometrics & Wearables',
    status: 'progressing',
    versionIntroduced: 'v1.0',
    rationale:
      'Uses 14-day rolling HRV, RHR, and Sleep Z-scores to auto-regulate daily effort—holding weights steady and protecting streaks on poor-recovery days ("Amber Shield").',
    whatWorkedWell:
      'Prevents CNS burnout and streak anxiety when sleep or HRV drops, while boosting XP (+15%) on Primed days.',
    critiqueAndRisks:
      'Readiness simulator pill was previously too prominent on the main screen; now tucked cleanly into a collapsible status bar.',
    lockedInvariant:
      'Amber Shield state (Z <= -0.8 or sleep < 6h) must hold weight static, shift target RIR to 2–3, and protect workout streaks.',
    files: ['src/engine/readiness.ts', 'src/components/train/ReadinessBanner.tsx'],
  },
  {
    id: 'gov-onboarding-first-time-to-value',
    title: '4-Step Onboarding & Immediate First-Time-To-Value Delivery',
    category: 'UX & Information Architecture',
    status: 'locked',
    versionIntroduced: 'v1.6',
    rationale:
      'New users must be introduced to the app, understand how it works (Asynchronous Hypertrophy Queue & Double Progression), pick their program split, and configure their equipment before immediately landing on their Day 1 session.',
    whatWorkedWell:
      'Combines a 4-step wizard with smart defaults so users can complete onboarding in under 60 seconds and immediately see Day 1 loaded with target weights ready to train in 1 tap.',
    critiqueAndRisks:
      'Earlier iterations hid onboarding behind the Character tab and never introduced the app value proposition or allowed program split selection on first launch.',
    lockedInvariant:
      'New users without onboardingCompleted must see OnboardingModal on launch; completing onboarding must set programType, generate Day 1 workout, and navigate directly to the Workout tab.',
    files: [
      'src/components/onboarding/OnboardingModal.tsx',
      'src/App.tsx',
      'src/services/storage.ts',
    ],
  },
  {
    id: 'gov-19-design-heuristics-framework',
    title: 'Authoritative 19-Point Design Heuristics Governance Gate',
    category: 'UX & Information Architecture',
    status: 'locked',
    versionIntroduced: 'v1.6',
    rationale:
      'Codifies all 19 heuristics (6 Visual, 6 Content, 7 Interaction) from the product design standards into continuous CI and architectural reviews.',
    whatWorkedWell:
      'Enforces strict 12px font floor, zero forbidden jargon (OOUX, PKG, Canonical Vector, SFR, MEV/MRV), single-entry-point cohesion, and responsive touch targets >=44px.',
    critiqueAndRisks:
      'Prevent future feature additions or agent modifications from re-introducing duplicate buttons, micro-text, or calendar-bound day tabs.',
    lockedInvariant:
      'All UI code must pass Suite 16 and Suite 17 assertions: 12px font minimum floor, zero forbidden jargon, 1 equipment switcher, 1 exercise changer, and 19-point heuristics adherence.',
    files: [
      'PRODUCT_GOVERNANCE.md',
      'AGENTS.md',
      'src/engine/governance.ts',
      'src/engine/__tests__/verifyEngine.ts',
    ],
  },
  {
    id: 'gov-ia-master-template-and-prs',
    title: 'Information Architecture Master Template & Product Requirements Spec',
    category: 'UX & Information Architecture',
    status: 'locked',
    versionIntroduced: 'v1.7',
    rationale:
      'Customer needs dictate zero-guesswork progression and cross-environment continuity. The Interaction Design Master Template (INTERACTION_DESIGN_MASTER_TEMPLATE.md) and Product Requirements Spec (PRODUCT_REQUIREMENTS_SPEC.md) codify the exact page layouts, focal points, and section hierarchies.',
    whatWorkedWell:
      'Provides an immutable structural contract for the 4 primary tabs (Workout, Program, Progress, Athlete) and all modal flows. Prevents regressions, duplicate controls, or calendar-bound day tabs.',
    critiqueAndRisks:
      'Sessions must not iterate on, rearrange, or redesign what has been agreed as complete and final.',
    lockedInvariant:
      'The 4 main tabs and their exact section hierarchies, 1-tap entry points, and 2-way view switchers are locked and final; all code must adhere to INTERACTION_DESIGN_MASTER_TEMPLATE.md.',
    files: [
      'PRODUCT_REQUIREMENTS_SPEC.md',
      'INTERACTION_DESIGN_MASTER_TEMPLATE.md',
      'AGENTS.md',
      'PRODUCT_GOVERNANCE.md',
      'src/components/train/TrainTab.tsx',
      'src/components/program/ProgramTab.tsx',
      'src/components/analytics/AnalyticsTab.tsx',
      'src/components/character/CharacterTab.tsx',
    ],
  },
  {
    id: 'gov-clean-slate-and-legitimate-xp-leaderboard',
    title: 'Clean Slate for New Users, Authoritative XP Economy & Opt-In Leaderboard',
    category: 'Biometrics & Gamification',
    status: 'locked',
    versionIntroduced: 'v1.8',
    rationale:
      'New lifters must never be seeded with dummy workouts, 42 days of someone else’s biometrics, or pre-filled Level 14 / 4,850 XP. Furthermore, UI actions (switching splits, changing locations, switching mesocycles, exporting/importing data, syncing watch) must never grant illegitimate XP points. XP is awarded strictly on completing full workouts, program milestones, progressive overload breakthroughs, and international strength standards rank-ups.',
    whatWorkedWell:
      'Clean NEW_USER_PROFILE starts at Level 1, 0 XP, 0 streak, and fresh starter workout. Forbidden XP action list strictly prevents UI click-farming. Opt-in Community XP Leaderboard provides privacy-preserving competition across 6 tiers.',
    critiqueAndRisks:
      'Never re-introduce automatic dummy data generation in storage loaders or award XP for non-workout actions.',
    lockedInvariant:
      'loadProfile() starts new users at Level 1 / 0 XP / 0 workouts; XP is awarded strictly for workouts, progressive overload PRs, and strength standard advances; leaderboard is 100% opt-in.',
    files: [
      'src/engine/xp.ts',
      'src/engine/leaderboard.ts',
      'src/components/character/XPLeaderboardCard.tsx',
      'src/services/seedData.ts',
      'src/services/storage.ts',
      'src/App.tsx',
    ],
  },
  {
    id: 'gov-exercise-science-knowledge-base',
    title: 'Codified Exercise Science Knowledge Base & Zero-Hallucination AI Grounding',
    category: 'Hypertrophy Science Engine',
    status: 'locked',
    versionIntroduced: 'v1.9',
    rationale:
      'Athletes and the AI Coach require deterministic, peer-reviewed exercise science models to explain why weights, rep targets, stabilization multipliers (1.18x DB, 1.20x RDL), volume landmarks (Israetel), deficit scaling (85% volume cap, Helms 2014), and relative strength standards (DOTS polynomial) are calculated the way they are. Relying on ungrounded LLM inference risks hallucinations, inconsistent equations, or unscientific advice.',
    whatWorkedWell:
      'Codified 18 authoritative ScientificPrinciple models directly inside knowledgeGraph.ts. Grounded aiAssistantService.ts with queryExerciseScienceKnowledgeBase to provide exact LaTeX/KaTeX formulas, physiological rationale, and academic citations without hallucination. Created searchable "Science & Logic" tab in KnowledgeGraphCard.tsx.',
    critiqueAndRisks:
      'Never allow the AI assistant to guess or approximate exercise science formulas when authoritative deterministic models exist.',
    lockedInvariant:
      'EXERCISE_SCIENCE_KNOWLEDGE_BASE must contain >= 18 verified principles; queryExerciseScienceKnowledgeBase must ground AI responses with exact formulas and academic citations.',
    files: [
      'src/engine/knowledgeGraph.ts',
      'src/services/aiAssistantService.ts',
      'src/components/analytics/KnowledgeGraphCard.tsx',
      'src/components/assistant/AICoachChatModal.tsx',
    ],
  },
];

export interface DesignHeuristicRule {
  id: string;
  pillar: 'Visual Design' | 'Content Design' | 'Interaction Design';
  principle: string;
  rule: string;
}

export const CODIFIED_DESIGN_HEURISTICS: DesignHeuristicRule[] = [
  {
    id: 'vd-1',
    pillar: 'Visual Design',
    principle: 'Simplicity',
    rule: 'Achieve a clean aesthetic by stripping away non-essential elements (no unlabeled progress bars or competing session tabs).',
  },
  {
    id: 'vd-2',
    pillar: 'Visual Design',
    principle: 'Hierarchy',
    rule: 'Guide attention through size, color, and placement—1 primary focal point per screen.',
  },
  {
    id: 'vd-3',
    pillar: 'Visual Design',
    principle: 'Consistency',
    rule: 'Maintain uniform visual styles, 3-tier typography (min 12px), and 1.5px–2px stroke icons.',
  },
  {
    id: 'vd-4',
    pillar: 'Visual Design',
    principle: 'Negative Space',
    rule: 'Use generous padding and dark-glass contrast to prevent clutter and elevate Exercise #1 above the fold.',
  },
  {
    id: 'vd-5',
    pillar: 'Visual Design',
    principle: 'Emotional Resonance',
    rule: 'Evoke trust and athletic authority through semantic colors (#10B981 Primed, #22D3EE Vector, #F59E0B Recovery Shield).',
  },
  {
    id: 'vd-6',
    pillar: 'Visual Design',
    principle: 'Context & Relevance',
    rule: 'Always surface only the context relevant to the active workout and available equipment.',
  },
  {
    id: 'cd-1',
    pillar: 'Content Design',
    principle: 'Clarity & Conciseness',
    rule: 'Use plain, direct consumer English so users immediately know what to train and what to lift.',
  },
  {
    id: 'cd-2',
    pillar: 'Content Design',
    principle: 'Scannability',
    rule: 'Structure session goals with concise bullet checklists and tabular monospace numbers.',
  },
  {
    id: 'cd-3',
    pillar: 'Content Design',
    principle: 'User-Centric Language',
    rule: 'Zero internal UX or academic jargon (never expose OOUX, PKG, Canonical Vector, or SFR).',
  },
  {
    id: 'cd-4',
    pillar: 'Content Design',
    principle: 'Consistent Tone & Voice',
    rule: 'Authoritative, encouraging coach voice grounded in exercise physiology.',
  },
  {
    id: 'cd-5',
    pillar: 'Content Design',
    principle: 'Contextual Help',
    rule: 'Deliver microcopy (e.g., muscle recovery hours, why an exercise swap works) right where decisions happen.',
  },
  {
    id: 'cd-6',
    pillar: 'Content Design',
    principle: 'Opinionated',
    rule: 'Tell the user exactly what session is Up Next and what weight/reps to hit—never dump a menu of competing workouts.',
  },
  {
    id: 'id-1',
    pillar: 'Interaction Design',
    principle: 'Intuitiveness',
    rule: 'Align interactions with existing mental models and single-tap gym-floor ergonomics.',
  },
  {
    id: 'id-2',
    pillar: 'Interaction Design',
    principle: 'Responsiveness & Feedback',
    rule: 'Provide immediate visual and haptic feedback on set completion, PRs, and equipment switches.',
  },
  {
    id: 'id-3',
    pillar: 'Interaction Design',
    principle: 'Forgiveness & Error Prevention',
    rule: 'Include undo toasts for set deletion, safe rest-day logging without calendar penalties, and biomechanical swap guardrails.',
  },
  {
    id: 'id-4',
    pillar: 'Interaction Design',
    principle: 'Efficiency',
    rule: 'Auto-propagate working weight/reps to subsequent sets and tuck secondary controls into a single drawer.',
  },
  {
    id: 'id-5',
    pillar: 'Interaction Design',
    principle: 'Accessibility',
    rule: 'Enforce >=44px touch targets, ARIA roles, and WCAG AA contrast.',
  },
  {
    id: 'id-6',
    pillar: 'Interaction Design',
    principle: 'Adaptability',
    rule: 'Adapt seamlessly to skipped days (Asynchronous Hypertrophy Queue) and changing locations (Gym, Home, Travel).',
  },
  {
    id: 'id-7',
    pillar: 'Interaction Design',
    principle: 'Progressive Disclosure',
    rule: 'Show only the Up Next session and progress checklist by default; reveal gear/split overrides on demand.',
  },
];

export const COMPETITOR_COMPARISON_MATRIX: CompetitorMatrixRow[] = [
  {
    id: 'cmp-session-guidance',
    feature: 'Session-to-Session Actionable Targets ("What to Lift Today")',
    category: 'Session Coaching & Progression',
    governanceStatus: 'locked',
    userValueProposition:
      'Tells you the exact weight and reps needed on every set today to beat last session.',
    headstrong: {
      rating: 'leader',
      summary:
        'Explicit "How to Make Progress Today" checklist + per-exercise Double Progression (+1 rep or +2.5kg/+2kg).',
    },
    rpHypertrophy: {
      rating: 'leader',
      summary: 'Prescribes weight/rep targets based on post-set RIR & pump ratings ($35/mo).',
    },
    fitbod: {
      rating: 'partial',
      summary: 'Generates weights algorithmically, but often fluctuates unpredictably session to session.',
    },
    hevyStrong: {
      rating: 'none',
      summary: 'Passive digital notebook—shows last time’s numbers, but never tells you what to aim for today.',
    },
    whoopAthlytic: {
      rating: 'none',
      summary: 'Tracks cardiovascular strain and recovery only; no set/rep progression.',
    },
  },
  {
    id: 'cmp-cross-implement',
    feature: 'Cross-Equipment Progress Continuity (Barbell ↔ Dumbbell ↔ TRX/BW)',
    category: 'Session Coaching & Progression',
    governanceStatus: 'locked',
    userValueProposition:
      'Swapping a Barbell Bench Press for Dumbbells or TRX keeps your strength curve and targets unified.',
    headstrong: {
      rating: 'leader',
      summary:
        'Unified 13-family movement vectors with 1.18x DB & 1.20x RDL biomechanical load conversion.',
    },
    rpHypertrophy: {
      rating: 'none',
      summary: 'Swapping an exercise mid-mesocycle resets weight/rep history for the new movement.',
    },
    fitbod: {
      rating: 'partial',
      summary: 'Estimates starting weights from general muscle strength, but tracks history per exercise.',
    },
    hevyStrong: {
      rating: 'none',
      summary: 'Strict per-exercise silos—switching equipment breaks your progress chart.',
    },
    whoopAthlytic: {
      rating: 'none',
      summary: 'No exercise progression tracking.',
    },
  },
  {
    id: 'cmp-location-switching',
    feature: '1-Tap Gym ↔ Home (DB, Bench, TRX, Bar) ↔ Travel (Bodyweight) Adaptation',
    category: 'Equipment & Location Context',
    governanceStatus: 'progressing',
    userValueProposition:
      'Can’t make the gym? Tap "At Home" or "Travel" to convert today’s workout to your available gear.',
    headstrong: {
      rating: 'leader',
      summary:
        '1-tap location bar converts today’s entire session to matched Home (DB/Bench/TRX/Bar) or Travel movements.',
    },
    rpHypertrophy: {
      rating: 'none',
      summary: 'Requires manually rebuilding a separate mesocycle template for home or travel.',
    },
    fitbod: {
      rating: 'leader',
      summary: 'Supports multiple gym profiles, though swaps sometimes alter the intended split structure.',
    },
    hevyStrong: {
      rating: 'none',
      summary: 'Requires manually swapping every exercise one by one or maintaining duplicate routines.',
    },
    whoopAthlytic: {
      rating: 'none',
      summary: 'Not applicable.',
    },
  },
  {
    id: 'cmp-biomechanical-swaps',
    feature: 'Biomechanical Movement Family Swap Guardrails',
    category: 'Exercise Database & Swaps',
    governanceStatus: 'locked',
    userValueProposition:
      'Guarantees a Chest Press only swaps with real Chest Press alternatives (never crunches or pushdowns).',
    headstrong: {
      rating: 'leader',
      summary:
        '13 movement families with plain-English "Why It Works" rationale and location filter pills.',
    },
    rpHypertrophy: {
      rating: 'leader',
      summary: 'Curated muscle-group exercise slots per mesocycle.',
    },
    fitbod: {
      rating: 'partial',
      summary: 'Sometimes suggests mismatched accessory movements when filtering by broad muscle group.',
    },
    hevyStrong: {
      rating: 'partial',
      summary: 'Filters by broad muscle group (e.g., "Chest" mixes compound presses and flyes).',
    },
    whoopAthlytic: {
      rating: 'none',
      summary: 'Not applicable.',
    },
  },
  {
    id: 'cmp-volume-landmarks',
    feature: 'Muscle-Specific Hypertrophy Volume Landmarks (Delts/Calves vs. Hams)',
    category: 'Hypertrophy Science Engine',
    governanceStatus: 'locked',
    userValueProposition:
      'Prescribes 16–26 weekly sets for fast-recovering Side Delts/Calves and 10–16 sets for high-fatigue Hamstrings.',
    headstrong: {
      rating: 'leader',
      summary:
        'Built-in Israetel/Schoenfeld MV/MEV/MAV/MRV landmarks across 12 muscles + 0.5x compound synergist credit.',
    },
    rpHypertrophy: {
      rating: 'leader',
      summary: 'Pioneered MEV-to-MRV volume progression, though synergist sets are not always explicitly totaled.',
    },
    fitbod: {
      rating: 'none',
      summary: 'Uses opaque muscle recovery percentages rather than evidence-based weekly set landmarks.',
    },
    hevyStrong: {
      rating: 'partial',
      summary: 'Counts weekly sets per muscle, but uses generic flat targets without recovery landmarks.',
    },
    whoopAthlytic: {
      rating: 'none',
      summary: 'No hypertrophy set volume tracking.',
    },
  },
  {
    id: 'cmp-wearable-autoregulation',
    feature: 'Wearable Sleep/HRV Auto-Regulation & Streak Protection',
    category: 'Biometrics & Wearables',
    governanceStatus: 'progressing',
    userValueProposition:
      'Automatically holds weights steady and protects your streak when sleep or HRV drops.',
    headstrong: {
      rating: 'leader',
      summary:
        '14-day HRV/RHR/Sleep Z-score triggers Recovery Shield (holds load, 2–3 RIR, streak safe) or +15% Primed XP.',
    },
    rpHypertrophy: {
      rating: 'partial',
      summary: 'Relies on manual subjective soreness/recovery questions rather than automatic wearable sync.',
    },
    fitbod: {
      rating: 'partial',
      summary: 'Syncs Apple Health calories/workouts, but does not auto-regulate RIR or protect streaks from HRV.',
    },
    hevyStrong: {
      rating: 'none',
      summary: 'No biometric readiness or auto-regulation.',
    },
    whoopAthlytic: {
      rating: 'leader',
      summary: 'Best-in-class HRV/Sleep recovery scoring, but disconnected from gym weight/rep prescriptions.',
    },
  },
  {
    id: 'cmp-strength-standards',
    feature: 'Bodyweight-Adjusted Strength Standards (DOTS & 6-Pillar Radar)',
    category: 'Hypertrophy Science Engine',
    governanceStatus: 'locked',
    userValueProposition:
      'Benchmarks your Squat, Hinge, Push, Pull, and Cardio Engine against international bodyweight ratios.',
    headstrong: {
      rating: 'leader',
      summary:
        'Official DOTS polynomial + 7-day EMA bodyweight + exact reps needed at current weight to rank up.',
    },
    rpHypertrophy: {
      rating: 'none',
      summary: 'Focuses strictly on hypertrophy mesocycles; no relative strength standards or DOTS.',
    },
    fitbod: {
      rating: 'partial',
      summary: 'Shows proprietary muscle strength scores, not official powerlifting/bodyweight standards.',
    },
    hevyStrong: {
      rating: 'partial',
      summary: 'Shows basic 1RM estimates per lift without DOTS or 7-day bodyweight EMA smoothing.',
    },
    whoopAthlytic: {
      rating: 'partial',
      summary: 'Tracks VO2Max and RHR only.',
    },
  },
];

const GOVERNANCE_STORAGE_KEY = 'treise_governance_v1';
const LEGACY_GOVERNANCE_STORAGE_KEY = 'headstrong_governance_v1';

export function loadGovernanceItems(): GovernanceChangeItem[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw =
        localStorage.getItem(GOVERNANCE_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_GOVERNANCE_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as GovernanceChangeItem[];
        const savedMap = new Map(saved.map((item) => [item.id, item]));
        return INITIAL_GOVERNANCE_ITEMS.map((init) => {
          const override = savedMap.get(init.id);
          return override
            ? {
                ...init,
                status: override.status,
                userNote: override.userNote,
              }
            : init;
        });
      }
    }
  } catch (e) {
    console.error('Failed to load governance state:', e);
  }
  return INITIAL_GOVERNANCE_ITEMS;
}

export function saveGovernanceItems(items: GovernanceChangeItem[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GOVERNANCE_STORAGE_KEY, JSON.stringify(items));
    }
  } catch (e) {
    console.error('Failed to save governance state:', e);
  }
}
