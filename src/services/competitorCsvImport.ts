/**
 * 1-Click Competitor CSV Importer for Hevy, Strong, and FitNotes.
 *
 * Allows experienced lifters to migrate multi-year training history into Treise on Day 1
 * with accurate kg normalization, exercise catalog matching (including Assisted Chin-Ups),
 * RPE -> RIR conversion, warm-up/drop set preservation, and idempotent deduplication.
 */
import {
  EquipmentType,
  ExerciseDefinition,
  ExerciseSession,
  MuscleGroup,
  StrengthPillar,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import {
  calculateE1RM,
  CombinedDumbbellWarning,
  detectLikelyCombinedTwoDumbbellImport,
  isAssistedExercise,
  isTimedExercise,
  toCombinedExternalLoadKg,
  usesOneDumbbell,
} from '../engine/e1rm';
import { getMovementFamilyLabel, getMovementVectorId } from '../engine/progression';
import { getExerciseBiomechanicalMeta } from '../engine/knowledgeGraph';
import { localDateString } from '../utils/date';
import { LB_PER_KG } from '../utils/units';
import { SEED_EXERCISES } from './seedData';

export type CompetitorAppFormat =
  | 'trainheroic'
  | 'hevy'
  | 'strong'
  | 'fitnotes'
  | 'maxes_sheet';

export interface CompetitorCsvImportOptions {
  /** Explicit format, or auto-detected from header row / JSON structure when omitted. */
  format?: CompetitorAppFormat;
  exerciseCatalog?: ExerciseDefinition[];
  /** Athlete's bodyweight (kg) for weighted-calisthenic E1RM estimation during import preview. */
  bodyweightKg?: number;
  /** Fallback unit when a CSV header omits kg/lbs (common in TrainHeroic & Strong exports). */
  defaultWeightUnit?: 'kg' | 'lb';
  /** Halve two-hand dumbbell loads if the source log recorded combined pair weight. */
  halveCombinedTwoHandDumbbells?: boolean;
}

export interface ImportedExerciseMaxSummary {
  exerciseId: string;
  exerciseName: string;
  equipment: EquipmentType;
  isTwoDumbbell: boolean;
  matchedCatalog: boolean;
  sessionsCount: number;
  setsCount: number;
  /** Heaviest completed single-rep (1RM) set logged or imported from a Working Max / 1RM column. */
  bestOneRepMaxKg: number | null;
  bestOneRepMaxDate: string | null;
  /** Heaviest working set logged across any rep count. */
  heaviestSetWeightKg: number;
  heaviestSetReps: number;
  heaviestSetDate: string;
  /** Highest canonical estimated 1RM (via calculateE1RM) across imported working sets. */
  bestEstimated1rmKg: number;
  bestEstimated1rmDate: string;
}

export interface CompetitorCsvImportSummary {
  format: CompetitorAppFormat;
  formatLabel: string;
  detectedUnit: 'kg' | 'lb';
  workoutsCount: number;
  totalSetsCount: number;
  totalVolumeKg: number;
  matchedExercisesCount: number;
  addedExerciseCount: number;
  documentedMaxesCount: number;
  testedOneRepMaxCount: number;
  sourceFilesParsed?: string[];
  dateRange?: [string, string];
  heaviestLiftLabel?: string;
  /** Set when imported paired two-dumbbell weights look like combined pair totals rather than per-dumbbell weights. */
  combinedDumbbellWarning?: CombinedDumbbellWarning;
}

export interface CompetitorCsvImportResult {
  format: CompetitorAppFormat;
  workouts: WorkoutSession[];
  addedExercises: ExerciseDefinition[];
  /** Per-exercise documented maxes (Best 1RM, Heaviest Set, and Best Estimated 1RM) sorted by load. */
  exerciseMaxes: ImportedExerciseMaxSummary[];
  summary: CompetitorCsvImportSummary;
}

const FORMAT_LABELS: Record<CompetitorAppFormat, string> = {
  trainheroic: 'TrainHeroic',
  hevy: 'Hevy',
  strong: 'Strong',
  fitnotes: 'FitNotes',
  maxes_sheet: 'Lift Maxes / Log Sheet',
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundHalf = (n: number) => Math.round(n * 2) / 2;

function toSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'exercise'
  );
}

/** RFC-4180 CSV/TSV parser supporting comma, semicolon, or tab delimiters, quoted fields, and CRLF. */
export function parseDelimitedRows(rawText: string): { rows: string[][]; delimiter: ',' | ';' | '\t' } {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return { rows: [], delimiter: ',' };

  const firstLine = cleaned.split(/\r?\n/, 1)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const delimiter: ',' | ';' | '\t' =
    tabCount > commaCount && tabCount > semiCount
      ? '\t'
      : semiCount > commaCount
      ? ';'
      : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && cleaned[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);

  return { rows, delimiter };
}

/** Auto-detects TrainHeroic, Hevy, Strong, FitNotes, or Lift Maxes / Generic Log CSV/TSV/JSON format. */
export function detectCompetitorCsvFormat(csvText: string): CompetitorAppFormat | null {
  const trimmed = csvText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const obj = Array.isArray(parsed) ? { workouts: parsed } : (parsed as Record<string, unknown>);
        if (
          Array.isArray(obj.workouts) ||
          Array.isArray(obj.sessions) ||
          Array.isArray(obj.workingMaxes) ||
          Array.isArray(obj.working_maxes) ||
          Array.isArray(obj.personalRecords) ||
          Array.isArray(obj.lifts)
        ) {
          return 'trainheroic';
        }
      }
    } catch {
      return null;
    }
  }

  const { rows } = parseDelimitedRows(trimmed);
  if (rows.length < 2) return null;
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const has = (needle: string) => headers.some((h) => h === needle || h.includes(needle));
  const hasExact = (...needles: string[]) => headers.some((h) => needles.includes(h));

  if (has('exercise_title') && has('start_time')) {
    return 'hevy';
  }
  if (has('workout name') && has('exercise name') && (has('set order') || has('weight'))) {
    return 'strong';
  }
  if (
    has('prescribed_reps') ||
    has('performed_reps') ||
    has('prescribed_weight') ||
    has('performed_weight') ||
    has('prescribed reps') ||
    has('performed reps') ||
    has('working_max') ||
    has('working max') ||
    ((has('block') || has('team') || has('session_name') || has('program')) &&
      (has('exercise') || has('movement')))
  ) {
    return 'trainheroic';
  }
  if (has('date') && hasExact('exercise') && has('category') && has('reps')) {
    return 'fitnotes';
  }
  if (
    (has('exercise') || has('lift') || has('movement')) &&
    (has('1rm') ||
      has('one rep max') ||
      has('max') ||
      has('weight') ||
      has('load') ||
      has('kg') ||
      has('lb'))
  ) {
    return 'maxes_sheet';
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parses ISO, TrainHeroic slash dates ("10/24/2026" or "24/10/2026"), Hevy ("24 Oct 2024, 08:30"), Strong, and FitNotes dates. */
function parseExportDateTime(raw: string): { date: string; iso?: string } | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO / SQL: YYYY-MM-DD[T| HH:MM[:SS]]
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const mo = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const hh = isoMatch[4] ? Number(isoMatch[4]) : 12;
    const mm = isoMatch[5] ? Number(isoMatch[5]) : 0;
    const ss = isoMatch[6] ? Number(isoMatch[6]) : 0;
    const date = `${y}-${pad2(mo)}-${pad2(d)}`;
    const dt = new Date(y, mo - 1, d, hh, mm, ss);
    return { date, iso: Number.isNaN(dt.getTime()) ? undefined : dt.toISOString() };
  }

  // Slash dates: MM/DD/YYYY or DD/MM/YYYY (common in TrainHeroic & spreadsheet exports)
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const rawYear = Number(slashMatch[3]);
    const y = rawYear < 100 ? 2000 + rawYear : rawYear;
    const mo = first > 12 ? second : first;
    const d = first > 12 ? first : second;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const hh = slashMatch[4] ? Number(slashMatch[4]) : 12;
      const mm = slashMatch[5] ? Number(slashMatch[5]) : 0;
      const date = `${y}-${pad2(mo)}-${pad2(d)}`;
      const dt = new Date(y, mo - 1, d, hh, mm, 0);
      return { date, iso: Number.isNaN(dt.getTime()) ? undefined : dt.toISOString() };
    }
  }

  // Hevy human format: "24 Oct 2024, 08:30" or "Oct 24, 2024, 08:30"
  const hevyDmy = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (hevyDmy) {
    const d = Number(hevyDmy[1]);
    const mo = MONTHS[hevyDmy[2].slice(0, 3).toLowerCase()];
    const y = Number(hevyDmy[3]);
    if (mo) {
      const hh = hevyDmy[4] ? Number(hevyDmy[4]) : 12;
      const mm = hevyDmy[5] ? Number(hevyDmy[5]) : 0;
      const date = `${y}-${pad2(mo)}-${pad2(d)}`;
      const dt = new Date(y, mo - 1, d, hh, mm, 0);
      return { date, iso: Number.isNaN(dt.getTime()) ? undefined : dt.toISOString() };
    }
  }

  const hevyMdy = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (hevyMdy) {
    const mo = MONTHS[hevyMdy[1].slice(0, 3).toLowerCase()];
    const d = Number(hevyMdy[2]);
    const y = Number(hevyMdy[3]);
    if (mo) {
      const hh = hevyMdy[4] ? Number(hevyMdy[4]) : 12;
      const mm = hevyMdy[5] ? Number(hevyMdy[5]) : 0;
      const date = `${y}-${pad2(mo)}-${pad2(d)}`;
      const dt = new Date(y, mo - 1, d, hh, mm, 0);
      return { date, iso: Number.isNaN(dt.getTime()) ? undefined : dt.toISOString() };
    }
  }

  // Fallback native Date parse
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const date = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
    return { date, iso: parsed.toISOString() };
  }
  return null;
}

/** Parses Strong duration strings ("52m", "1h 12m", "3120s") or FitNotes time ("00:45:00") into seconds/minutes. */
function parseDurationMinutes(raw: string): number | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  let totalMin = 0;
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const sec = s.match(/(\d+(?:\.\d+)?)\s*s/);
  if (h || m || sec) {
    if (h) totalMin += Number(h[1]) * 60;
    if (m) totalMin += Number(m[1]);
    if (sec) totalMin += Number(sec[1]) / 60;
    return totalMin > 0 ? Math.round(totalMin) : undefined;
  }
  const num = Number(s);
  if (Number.isFinite(num) && num > 0) {
    // Strong v2 sometimes exports Duration in seconds (e.g. 3600)
    return Math.round(num > 300 ? num / 60 : num);
  }
  return undefined;
}

function parseSetDurationSeconds(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const hms = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    if (hms[3] !== undefined) {
      return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
    }
    return Number(hms[1]) * 60 + Number(hms[2]);
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function parseRpeToRir(raw: string): number | undefined {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0 || n > 10) return undefined;
  return Math.max(0, Math.min(5, Math.round(10 - n)));
}

function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function inferEquipmentFromName(rawName: string): EquipmentType {
  const s = rawName.toLowerCase();
  if (/(assisted.*(chin|pull|dip)|(chin|pull|dip).*assisted)/.test(s)) return 'machine';
  if (/(dumbbell|\bdb\b)/.test(s)) return 'dumbbell';
  if (/(cable|pulldown|pushdown|face pull|rope)/.test(s)) return 'cable';
  if (/(machine|leg press|hack squat|leg curl|leg extension|pec deck|smith|seated calf|standing calf)/.test(s)) return 'machine';
  if (/(weighted pull|weighted chin|weighted dip)/.test(s)) return 'weighted_bodyweight';
  if (/(bodyweight|push[- ]?up|pull[- ]?up|chin[- ]?up|dip|plank|hanging leg raise)/.test(s)) return 'bodyweight';
  if (/(barbell|\bbb\b|ez[- ]?bar|trap bar|squat|deadlift|bench press|overhead press|military press)/.test(s)) return 'barbell';
  return 'barbell';
}

function inferMuscleAndPillar(
  rawName: string,
  category?: string
): { pillar: StrengthPillar; primaryMuscle: MuscleGroup; secondaryMuscles: MuscleGroup[]; isIsolation: boolean } {
  const s = `${rawName} ${category || ''}`.toLowerCase();
  if (/(lateral raise|side delt)/.test(s)) {
    return { pillar: 'Vertical Push', primaryMuscle: 'Side Delts', secondaryMuscles: ['Shoulders'], isIsolation: true };
  }
  if (/(face pull|rear delt|reverse fly|reverse pec)/.test(s)) {
    return { pillar: 'Horizontal Pull', primaryMuscle: 'Rear Delts', secondaryMuscles: ['Back'], isIsolation: true };
  }
  if (/(calf|calves)/.test(s)) {
    return { pillar: 'Squat', primaryMuscle: 'Calves', secondaryMuscles: [], isIsolation: true };
  }
  if (/(tricep|pushdown|skullcrusher|skull crusher|overhead extension|kickback)/.test(s)) {
    return { pillar: 'Horizontal Push', primaryMuscle: 'Triceps', secondaryMuscles: [], isIsolation: true };
  }
  if (/(bicep|curl)/.test(s) && !/leg curl|hamstring|nordic/.test(s)) {
    return { pillar: 'Horizontal Pull', primaryMuscle: 'Biceps', secondaryMuscles: [], isIsolation: true };
  }
  if (/(leg curl|hamstring curl|nordic)/.test(s)) {
    return { pillar: 'Hinge', primaryMuscle: 'Hamstrings', secondaryMuscles: [], isIsolation: true };
  }
  if (/(leg extension|quad ext)/.test(s)) {
    return { pillar: 'Squat', primaryMuscle: 'Quads', secondaryMuscles: [], isIsolation: true };
  }
  if (/(crunch|plank|ab wheel|leg raise|sit[- ]?up|abs|core)/.test(s)) {
    return { pillar: 'Horizontal Push', primaryMuscle: 'Core', secondaryMuscles: [], isIsolation: true };
  }
  if (/(fly|flye|pec deck|cable crossover)/.test(s)) {
    return { pillar: 'Horizontal Push', primaryMuscle: 'Chest', secondaryMuscles: ['Front Delts'], isIsolation: true };
  }
  if (/(pull[- ]?up|chin[- ]?up|pulldown)/.test(s)) {
    return { pillar: 'Vertical Pull', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Rear Delts'], isIsolation: false };
  }
  if (/(row)/.test(s)) {
    return { pillar: 'Horizontal Pull', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Rear Delts'], isIsolation: false };
  }
  if (/(deadlift|\brdl\b|hip thrust|good morning|back extension|hinge|glute)/.test(s)) {
    return { pillar: 'Hinge', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], isIsolation: false };
  }
  if (/(squat|leg press|lunge|split squat|step[- ]?up|quad|legs)/.test(s)) {
    return { pillar: 'Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], isIsolation: false };
  }
  if (/(overhead press|\bohp\b|shoulder press|military press|arnold press|shoulder)/.test(s)) {
    return { pillar: 'Vertical Push', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps', 'Front Delts'], isIsolation: false };
  }
  if (/(bench|chest press|push[- ]?up|dip|chest)/.test(s)) {
    return { pillar: 'Horizontal Push', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Front Delts'], isIsolation: false };
  }
  if (/(back|lat)/.test(s)) {
    return { pillar: 'Horizontal Pull', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], isIsolation: false };
  }
  return { pillar: 'Horizontal Push', primaryMuscle: 'Chest', secondaryMuscles: [], isIsolation: false };
}

/** Curated aliases mapping popular Hevy, Strong, and FitNotes exercise names to Treise catalog IDs. */
function matchCatalogExercise(
  rawName: string,
  catalog: ExerciseDefinition[],
  category?: string
): ExerciseDefinition | null {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const lower = rawName.toLowerCase().trim();
  const base = normalizeNameKey(rawName);
  const equip = inferEquipmentFromName(rawName);

  // High-confidence canonical aliases for Hevy / Strong / FitNotes exports
  const pick = (id: string) => byId.get(id) ?? null;

  // Check assisted calisthenics before stripping parenthetical tags like "(Assisted)"
  if (isAssistedExercise({ name: rawName })) {
    if (/dip/.test(lower)) return pick('ex-assisted-dip') ?? null;
    if (/chin|pull/.test(lower)) return pick('ex-assisted-chinup');
  }

  // Direct name or alias match (skip parenthetical-stripped match when equipment disagrees)
  const exact = catalog.find(
    (e) =>
      e.name.toLowerCase() === lower ||
      e.aliases?.some((a) => a.toLowerCase() === lower) ||
      ((normalizeNameKey(e.name) === base || e.aliases?.some((a) => normalizeNameKey(a) === base)) &&
        e.equipment === equip)
  );
  if (exact) return exact;
  if (/^(barbell )?back squat$|^squat$/.test(base) && equip === 'barbell') return pick('ex-barbell-squat');
  if (/front squat/.test(base)) return equip === 'dumbbell' ? pick('ex-db-front-squat') : pick('ex-front-squat') ?? pick('ex-barbell-squat');
  if (/safety (squat|bar.*squat)|\bssb\b.*squat/.test(base)) return pick('ex-ssb-squat');
  if (/hack squat/.test(base)) return pick('ex-hack-squat');
  if (/pendulum squat/.test(base)) return pick('ex-pendulum-squat');
  if (/bulgarian split squat|split squat/.test(base)) return pick('ex-bulgarian-split-squat');
  if (/leg press/.test(base)) return pick('ex-leg-press');
  if (/trap bar deadlift|hex bar deadlift/.test(base)) return pick('ex-trap-bar-deadlift') ?? pick('ex-deadlift');
  if (/sumo deadlift/.test(base)) return pick('ex-sumo-deadlift') ?? pick('ex-deadlift');
  if (/romanian deadlift|\brdl\b/.test(base)) return equip === 'dumbbell' ? pick('ex-db-rdl') : pick('ex-rdl');
  if (/^(barbell )?(conventional )?deadlift$|^conventional barbell deadlift$/.test(base)) {
    return pick('ex-deadlift');
  }
  if (/incline.*(bench|chest) press/.test(base)) {
    if (equip === 'dumbbell') return pick('ex-db-bench-press');
    if (equip === 'machine') return pick('ex-plate-incline-press') ?? pick('ex-smith-incline-press');
    return pick('ex-incline-barbell-bench') ?? pick('ex-bench-press');
  }
  if (/close[- ]?grip.*bench/.test(base)) return pick('ex-close-grip-bench') ?? pick('ex-bench-press');
  if (/^(flat |barbell )?bench press$/.test(base)) {
    return equip === 'dumbbell' ? pick('ex-flat-db-press') : pick('ex-bench-press');
  }
  if (/^(overhead press|military press|standing.*press|shoulder press)$/.test(base)) {
    return equip === 'dumbbell' ? pick('ex-db-shoulder-press') : pick('ex-ohp');
  }
  if (/push press/.test(base)) return pick('ex-push-press') ?? pick('ex-ohp');
  if (/power clean/.test(base)) return /hang/.test(base) ? pick('ex-hang-power-clean') : pick('ex-power-clean');
  if (/kettlebell swing|\bkb\b swing/.test(base)) return pick('ex-kb-swing');
  if (/lat pulldown/.test(base)) return pick('ex-lat-pulldown');
  if (/weighted (chin|pull)[- ]?up/.test(base)) return pick('ex-weighted-pullup');
  if (/^(chin|pull)[- ]?up/.test(base)) return pick('ex-chinup');
  if (/pendlay row/.test(base)) return pick('ex-pendlay-row') ?? pick('ex-barbell-row');
  if (/t[- ]?bar row/.test(base)) return equip === 'machine' ? pick('ex-chest-supported-tbar-row') : pick('ex-t-bar-row');
  if (/seated.*cable row|cable row|seated row/.test(base)) return pick('ex-cable-row');
  if (/chest[- ]?supported.*row/.test(base)) return pick('ex-chest-supported-db-row');
  if (/lateral raise/.test(base)) return equip === 'cable' ? pick('ex-cable-lateral-raise') : pick('ex-db-lateral-raise');
  if (/face pull/.test(base)) return pick('ex-face-pull');
  if (/tricep.*pushdown|rope pushdown/.test(base)) return pick('ex-tricep-pushdown');
  if (/lying leg curl|prone leg curl/.test(base)) return pick('ex-lying-leg-curl') ?? pick('ex-leg-curl');
  if (/seated leg curl|hamstring curl/.test(base)) return pick('ex-leg-curl');
  if (/preacher curl/.test(base)) return equip === 'machine' ? pick('ex-machine-preacher-curl') : pick('ex-ez-preacher-curl');
  if (/incline.*curl/.test(base)) return pick('ex-bicep-curl');
  if (/standing calf raise/.test(base)) return pick('ex-standing-calf-raise');
  if (/seated calf raise/.test(base)) return pick('ex-seated-calf-raise');
  if (/cable.*crunch|kneeling crunch/.test(base)) return pick('ex-cable-crunch');
  if (/plank/.test(base)) return /side/.test(base) ? pick('ex-side-plank') : pick('ex-forearm-plank');

  // Avoid silent mismatches if equipment differs materially (e.g. dumbbell vs barbell)
  void category;
  return null;
}

interface NormalizedRow {
  workoutKey: string;
  workoutName: string;
  date: string;
  startedAt?: string;
  completedAt?: string;
  durationMinutes?: number;
  exerciseName: string;
  category?: string;
  exerciseNotes?: string;
  setType: 'working' | 'warmup' | 'drop';
  weightKg: number;
  reps: number;
  durationSeconds?: number;
  rir?: number;
}

function inferSplitDay(exercises: ExerciseSession[], name: string): WorkoutSession['splitDay'] {
  const n = name.toLowerCase();
  if (/\bpush\b/.test(n)) return 'Push';
  if (/\bpull\b/.test(n)) return 'Pull';
  if (/\blegs?\b|\blower\b/.test(n)) return 'Legs';
  if (/\bupper\b/.test(n)) return 'Upper';
  if (/\bfull\b/.test(n)) return 'Full Body';

  const pillars = new Set(exercises.map((e) => e.pillar));
  const hasLower = pillars.has('Squat') || pillars.has('Hinge');
  const hasPush = pillars.has('Horizontal Push') || pillars.has('Vertical Push');
  const hasPull = pillars.has('Horizontal Pull') || pillars.has('Vertical Pull');
  if (hasLower && (hasPush || hasPull)) return 'Full Body';
  if (hasLower) return 'Legs';
  if (hasPush && hasPull) return 'Upper';
  if (hasPull) return 'Pull';
  return 'Push';
}

function parseWeightCellToKg(rawVal: string, fallbackUnit: 'kg' | 'lb'): number {
  const s = rawVal.trim().toLowerCase();
  if (!s) return 0;
  const inlineLb = /\b(lbs?|pounds?)\b/.test(s);
  const inlineKg = /\b(kgs?|kilos?)\b/.test(s);
  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return 0;
  const n = Number(numMatch[0]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const unit = inlineLb ? 'lb' : inlineKg ? 'kg' : fallbackUnit;
  return unit === 'lb' ? round1(n / LB_PER_KG) : round1(n);
}

function parseTrainHeroicJsonRows(
  rawJsonText: string,
  defaultUnit: 'kg' | 'lb'
): { rows: NormalizedRow[]; detectedUnit: 'kg' | 'lb' } {
  const parsed = JSON.parse(rawJsonText);
  const root = Array.isArray(parsed) ? { workouts: parsed } : (parsed as Record<string, unknown>);
  const unitRaw = String(root.unit ?? root.weightUnit ?? root.weight_unit ?? '').toLowerCase();
  const detectedUnit: 'kg' | 'lb' = unitRaw.includes('lb')
    ? 'lb'
    : unitRaw.includes('kg')
    ? 'kg'
    : defaultUnit;
  const rows: NormalizedRow[] = [];
  const fallbackToday = localDateString();

  const workoutsList = (
    Array.isArray(root.workouts)
      ? root.workouts
      : Array.isArray(root.sessions)
      ? root.sessions
      : []
  ) as Array<Record<string, unknown>>;

  workoutsList.forEach((wo, wIdx) => {
    const rawDate = String(wo.date ?? wo.completedAt ?? wo.scheduledDate ?? wo.start_time ?? fallbackToday);
    const dt = parseExportDateTime(rawDate) ?? { date: fallbackToday };
    const workoutName = String(wo.title ?? wo.name ?? wo.workoutName ?? wo.session_name ?? 'TrainHeroic Session');
    const blocks = Array.isArray(wo.blocks) ? (wo.blocks as Array<Record<string, unknown>>) : null;
    const rawExercises: Array<Record<string, unknown>> = blocks
      ? blocks.flatMap((b) => (Array.isArray(b.exercises) ? (b.exercises as Array<Record<string, unknown>>) : []))
      : Array.isArray(wo.exercises)
      ? (wo.exercises as Array<Record<string, unknown>>)
      : [];

    rawExercises.forEach((ex) => {
      const exerciseName = String(ex.name ?? ex.exercise ?? ex.exerciseName ?? ex.title ?? '').trim();
      if (!exerciseName) return;
      const sets = Array.isArray(ex.sets) ? (ex.sets as Array<Record<string, unknown>>) : [];
      sets.forEach((st) => {
        if (st.completed === false) return;
        const wRaw = String(
          st.performed_weight ?? st.performedWeight ?? st.actualWeight ?? st.weight ?? st.load ?? '0'
        );
        const rRaw = Number(
          st.performed_reps ?? st.performedReps ?? st.actualReps ?? st.reps ?? 0
        );
        const durSec = parseSetDurationSeconds(String(st.durationSeconds ?? st.seconds ?? st.time ?? ''));
        if (rRaw <= 0 && !durSec) return;
        const rirVal =
          typeof st.rir === 'number'
            ? Math.max(0, Math.min(6, Math.round(st.rir)))
            : st.rpe !== undefined
            ? parseRpeToRir(String(st.rpe))
            : rRaw === 1
            ? 0
            : undefined;
        rows.push({
          workoutKey: `${dt.date}::th-json-${wIdx}::${workoutName}`,
          workoutName,
          date: dt.date,
          startedAt: dt.iso,
          completedAt: dt.iso,
          exerciseName,
          exerciseNotes: typeof ex.notes === 'string' ? ex.notes : undefined,
          setType: st.isWarmup || String(st.type ?? '').toLowerCase() === 'warmup' ? 'warmup' : 'working',
          weightKg: parseWeightCellToKg(wRaw, detectedUnit),
          reps: rRaw > 0 ? Math.round(rRaw) : 1,
          durationSeconds: durSec,
          rir: rirVal,
        });
      });
    });
  });

  const maxesList = (
    Array.isArray(root.workingMaxes)
      ? root.workingMaxes
      : Array.isArray(root.working_maxes)
      ? root.working_maxes
      : Array.isArray(root.personalRecords)
      ? root.personalRecords
      : Array.isArray(root.lifts)
      ? root.lifts
      : []
  ) as Array<Record<string, unknown>>;

  maxesList.forEach((mx) => {
    const exerciseName = String(mx.exercise ?? mx.exerciseName ?? mx.name ?? mx.lift ?? '').trim();
    if (!exerciseName) return;
    const rawDate = String(mx.date ?? mx.recordedAt ?? mx.updatedAt ?? fallbackToday);
    const dt = parseExportDateTime(rawDate) ?? { date: fallbackToday };
    const wRaw = String(mx.workingMax ?? mx.working_max ?? mx.oneRepMax ?? mx.max ?? mx.weight ?? '');
    const weightKg = parseWeightCellToKg(wRaw, detectedUnit);
    const reps = Math.max(1, Math.round(Number(mx.reps ?? 1) || 1));
    if (weightKg <= 0) return;
    rows.push({
      workoutKey: `${dt.date}::th-maxes`,
      workoutName: 'TrainHeroic Lift Maxes',
      date: dt.date,
      startedAt: dt.iso,
      completedAt: dt.iso,
      exerciseName,
      setType: 'working',
      weightKg,
      reps,
      rir: reps === 1 ? 0 : 1,
    });
  });

  return { rows, detectedUnit };
}

/** Computes documented per-exercise maxes (Best 1RM, Heaviest Set, and Best Estimated 1RM) over imported workouts. */
export function computeImportedExerciseMaxes(
  workouts: WorkoutSession[],
  catalog: ExerciseDefinition[],
  bodyweightKg: number = 80
): ImportedExerciseMaxSummary[] {
  const catalogIds = new Set(catalog.map((c) => c.id));
  const byEx = new Map<
    string,
    ImportedExerciseMaxSummary & { sessionDates: Set<string> }
  >();

  const ordered = [...workouts]
    .filter((w) => w.completed)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const w of ordered) {
    for (const ex of w.exercises) {
      if (isTimedExercise(ex)) continue;
      const working = ex.sets.filter(
        (s) => s.completed && !s.isWarmup && s.setType !== 'warmup' && (s.actualReps ?? 0) > 0
      );
      if (working.length === 0) continue;

      const isTwoDumbbell = ex.equipment === 'dumbbell' && !usesOneDumbbell(ex);
      let entry = byEx.get(ex.exerciseId);
      if (!entry) {
        entry = {
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          equipment: ex.equipment,
          isTwoDumbbell,
          matchedCatalog: catalogIds.has(ex.exerciseId) && !ex.exerciseId.startsWith('ex-import-'),
          sessionsCount: 0,
          setsCount: 0,
          bestOneRepMaxKg: null,
          bestOneRepMaxDate: null,
          heaviestSetWeightKg: 0,
          heaviestSetReps: 0,
          heaviestSetDate: w.date,
          bestEstimated1rmKg: 0,
          bestEstimated1rmDate: w.date,
          sessionDates: new Set<string>(),
        };
        byEx.set(ex.exerciseId, entry);
      }
      entry.sessionDates.add(`${w.id}::${w.date}`);
      entry.sessionsCount = entry.sessionDates.size;

      for (const s of working) {
        entry.setsCount += 1;
        const kg = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const reps = s.actualReps ?? s.targetReps ?? 0;
        const rir = s.actualRir ?? s.targetRir ?? 2;

        if (
          kg > entry.heaviestSetWeightKg ||
          (kg === entry.heaviestSetWeightKg && reps > entry.heaviestSetReps)
        ) {
          entry.heaviestSetWeightKg = kg;
          entry.heaviestSetReps = reps;
          entry.heaviestSetDate = w.date;
        }

        if (reps === 1 && kg > 0 && kg > (entry.bestOneRepMaxKg ?? 0)) {
          entry.bestOneRepMaxKg = kg;
          entry.bestOneRepMaxDate = w.date;
        }

        if (kg > 0 || ex.equipment === 'bodyweight' || ex.equipment === 'weighted_bodyweight') {
          const e1rm = calculateE1RM(
            kg,
            reps,
            rir,
            ex.equipment,
            ex.isRdl,
            ex.isWeightedCalisthenic,
            bodyweightKg,
            ex.exerciseId,
            ex.pillar,
            ex.name
          );
          if (e1rm > entry.bestEstimated1rmKg) {
            entry.bestEstimated1rmKg = e1rm;
            entry.bestEstimated1rmDate = w.date;
          }
        }
      }
    }
  }

  return [...byEx.values()]
    .map(({ sessionDates: _ignored, ...rest }) => rest)
    .sort(
      (a, b) =>
        b.bestEstimated1rmKg - a.bestEstimated1rmKg ||
        b.heaviestSetWeightKg - a.heaviestSetWeightKg ||
        a.exerciseName.localeCompare(b.exerciseName)
    );
}

/**
 * Parses a TrainHeroic, Hevy, Strong, FitNotes, or Lift Maxes CSV/TSV/JSON export
 * into Treise WorkoutSessions, ExerciseDefinitions, and documented per-exercise maxes.
 */
export function parseCompetitorCsv(
  csvText: string,
  options: CompetitorCsvImportOptions = {}
): CompetitorCsvImportResult {
  const trimmed = csvText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    throw new Error('The import file is empty or missing workout rows.');
  }

  const format = options.format ?? detectCompetitorCsvFormat(trimmed);
  if (!format) {
    throw new Error(
      'Could not recognize this file format. Supported sources: TrainHeroic (.zip, CSV, JSON), Hevy, Strong, FitNotes, or any table with Exercise and Weight / 1RM columns.'
    );
  }

  let detectedUnit: 'kg' | 'lb' = options.defaultWeightUnit ?? 'kg';
  const normalized: NormalizedRow[] = [];

  if (format === 'trainheroic' && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    const jsonParsed = parseTrainHeroicJsonRows(trimmed, detectedUnit);
    detectedUnit = jsonParsed.detectedUnit;
    normalized.push(...jsonParsed.rows);
  } else {
    const { rows } = parseDelimitedRows(trimmed);
    if (rows.length < 2) {
      throw new Error('The CSV file is empty or missing workout rows.');
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const col = (...candidates: string[]): number => {
      for (const c of candidates) {
        const idx = headers.findIndex((h) => h === c);
        if (idx >= 0) return idx;
      }
      for (const c of candidates) {
        const idx = headers.findIndex((h) => h.includes(c));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const cellOf = (r: string[], idx: number) => (idx >= 0 && idx < r.length ? r[idx].trim() : '');

    // Detect source weight unit from column headers or explicit unit column
    const iUnitCol = col('unit', 'weight_unit', 'weight unit', 'units');
    if (headers.some((h) => /(weight|load|max|1rm).*lbs?|_lbs?|\(lbs?\)/.test(h))) {
      detectedUnit = 'lb';
    } else if (headers.some((h) => /(weight|load|max|1rm).*kgs?|_kgs?|\(kgs?\)/.test(h))) {
      detectedUnit = 'kg';
    } else if (iUnitCol >= 0) {
      const sampleUnit = rows
        .slice(1, 8)
        .map((r) => cellOf(r, iUnitCol).toLowerCase())
        .find((u) => u.includes('lb') || u.includes('kg'));
      if (sampleUnit?.includes('lb')) detectedUnit = 'lb';
      else if (sampleUnit?.includes('kg')) detectedUnit = 'kg';
    }

    const rowUnitOf = (r: string[]): 'kg' | 'lb' => {
      if (iUnitCol >= 0) {
        const u = cellOf(r, iUnitCol).toLowerCase();
        if (u.includes('lb')) return 'lb';
        if (u.includes('kg')) return 'kg';
      }
      return detectedUnit;
    };
    const toKg = (rawVal: string, r?: string[]): number =>
      parseWeightCellToKg(rawVal, r ? rowUnitOf(r) : detectedUnit);

    if (format === 'hevy') {
      const iTitle = col('title');
      const iStart = col('start_time');
      const iEnd = col('end_time');
      const iExercise = col('exercise_title');
      const iNotes = col('exercise_notes');
      const iSetType = col('set_type');
      const iWeight = col('weight_kg', 'weight_lbs', 'weight');
      const iReps = col('reps');
      const iDuration = col('duration_seconds');
      const iRpe = col('rpe');

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const r = rows[rIdx];
        const exerciseName = cellOf(r, iExercise);
        if (!exerciseName) continue;
        const startParsed = parseExportDateTime(cellOf(r, iStart));
        if (!startParsed) continue;
        const endParsed = parseExportDateTime(cellOf(r, iEnd));
        const workoutName = cellOf(r, iTitle) || 'Imported Workout';
        const setTypeRaw = cellOf(r, iSetType).toLowerCase();
        const setType: NormalizedRow['setType'] =
          setTypeRaw === 'warmup' ? 'warmup' : setTypeRaw === 'dropset' || setTypeRaw === 'drop' ? 'drop' : 'working';
        const reps = Math.max(0, Math.round(Number(cellOf(r, iReps)) || 0));
        const durationSeconds = parseSetDurationSeconds(cellOf(r, iDuration));
        if (reps <= 0 && !durationSeconds) continue;

        let durationMinutes: number | undefined;
        if (startParsed.iso && endParsed?.iso) {
          const mins = Math.round(
            (new Date(endParsed.iso).getTime() - new Date(startParsed.iso).getTime()) / 60000
          );
          if (mins > 0 && mins < 480) durationMinutes = mins;
        }

        normalized.push({
          workoutKey: `${startParsed.date}::${cellOf(r, iStart)}::${workoutName}`,
          workoutName,
          date: startParsed.date,
          startedAt: startParsed.iso,
          completedAt: endParsed?.iso ?? startParsed.iso,
          durationMinutes,
          exerciseName,
          exerciseNotes: cellOf(r, iNotes) || undefined,
          setType,
          weightKg: toKg(cellOf(r, iWeight), r),
          reps: reps > 0 ? reps : 1,
          durationSeconds,
          rir: setTypeRaw === 'failure' ? 0 : parseRpeToRir(cellOf(r, iRpe)),
        });
      }
    } else if (format === 'strong') {
      const iDate = col('date');
      const iWorkout = col('workout name');
      const iDuration = col('duration', 'workout duration');
      const iExercise = col('exercise name');
      const iSetOrder = col('set order');
      const iWeight = col('weight (kg)', 'weight (lbs)', 'weight');
      const iReps = col('reps');
      const iSeconds = col('seconds');
      const iNotes = col('notes');
      const iRpe = col('rpe');

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const r = rows[rIdx];
        const exerciseName = cellOf(r, iExercise);
        if (!exerciseName) continue;
        const dateParsed = parseExportDateTime(cellOf(r, iDate));
        if (!dateParsed) continue;
        const workoutName = cellOf(r, iWorkout) || 'Imported Workout';
        const orderRaw = cellOf(r, iSetOrder).toUpperCase();
        if (orderRaw === 'REST TIMER' || orderRaw === 'NOTE') continue;
        const setType: NormalizedRow['setType'] =
          orderRaw === 'W' ? 'warmup' : orderRaw === 'D' ? 'drop' : 'working';
        const reps = Math.max(0, Math.round(Number(cellOf(r, iReps)) || 0));
        const durationSeconds = parseSetDurationSeconds(cellOf(r, iSeconds));
        if (reps <= 0 && !durationSeconds) continue;

        normalized.push({
          workoutKey: `${dateParsed.date}::${cellOf(r, iDate)}::${workoutName}`,
          workoutName,
          date: dateParsed.date,
          startedAt: dateParsed.iso,
          completedAt: dateParsed.iso,
          durationMinutes: parseDurationMinutes(cellOf(r, iDuration)),
          exerciseName,
          exerciseNotes: cellOf(r, iNotes) || undefined,
          setType,
          weightKg: toKg(cellOf(r, iWeight), r),
          reps: reps > 0 ? reps : 1,
          durationSeconds,
          rir: orderRaw === 'F' ? 0 : parseRpeToRir(cellOf(r, iRpe)),
        });
      }
    } else if (format === 'trainheroic') {
      // TrainHeroic Athlete Data Export (set-by-set workout logs AND Lift History / Working Max exports)
      const iDate = col('date', 'completed_at', 'session_date', 'workout_date', 'recorded_at', 'updated_at');
      const iWorkout = col('workout', 'session_name', 'workout_title', 'workout_name', 'session', 'program');
      const iExercise = col('exercise_name', 'exercise', 'movement', 'lift');
      const iPerfWeight = col('performed_weight', 'actual_weight', 'logged_weight', 'weight_performed');
      const iPrescWeight = col('prescribed_weight', 'target_weight');
      const iGenericWeight = col('weight (kg)', 'weight (lbs)', 'weight', 'load');
      const iWorkingMax = col('working_max', 'working max', 'tested_1rm', '1rm', 'one_rep_max');
      const iPerfReps = col('performed_reps', 'actual_reps', 'logged_reps', 'reps_performed');
      const iPrescReps = col('prescribed_reps', 'target_reps');
      const iGenericReps = col('reps', 'repetitions');
      const iCompleted = col('completed', 'status', 'is_completed');
      const iSetType = col('set_type', 'block_type');
      const iDuration = col('performed_time', 'duration_seconds', 'seconds', 'time');
      const iRpe = col('rpe', 'performed_rpe');
      const iRir = col('rir', 'reps_in_reserve');
      const iNotes = col('athlete_notes', 'exercise_notes', 'notes', 'comment');
      const fallbackToday = localDateString();
      const recordedWorkingMaxes = new Set<string>();

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const r = rows[rIdx];
        const exerciseName = cellOf(r, iExercise);
        if (!exerciseName) continue;

        if (iCompleted >= 0) {
          const compVal = cellOf(r, iCompleted).toLowerCase();
          if (compVal === 'false' || compVal === '0' || compVal === 'skipped' || compVal === 'missed') {
            continue;
          }
        }

        const dateRaw = iDate >= 0 ? cellOf(r, iDate) : '';
        const dateParsed = parseExportDateTime(dateRaw) ?? (dateRaw ? null : { date: fallbackToday });
        if (!dateParsed) continue;

        const workoutName = cellOf(r, iWorkout) || 'TrainHeroic Session';
        const setTypeRaw = cellOf(r, iSetType).toLowerCase();
        const setType: NormalizedRow['setType'] =
          setTypeRaw.includes('warm') ? 'warmup' : setTypeRaw.includes('drop') ? 'drop' : 'working';

        // Prefer performed metrics; never fabricate unperformed prescribed rows when performed columns exist and are blank.
        let rawWeight = '';
        if (iPerfWeight >= 0) {
          rawWeight = cellOf(r, iPerfWeight);
        } else if (iGenericWeight >= 0) {
          rawWeight = cellOf(r, iGenericWeight);
        } else if (iCompleted >= 0 && iPrescWeight >= 0) {
          rawWeight = cellOf(r, iPrescWeight);
        }

        let rawReps = '';
        if (iPerfReps >= 0) {
          rawReps = cellOf(r, iPerfReps);
        } else if (iGenericReps >= 0) {
          rawReps = cellOf(r, iGenericReps);
        } else if (iCompleted >= 0 && iPrescReps >= 0) {
          rawReps = cellOf(r, iPrescReps);
        }

        const durationSeconds = parseSetDurationSeconds(cellOf(r, iDuration));
        const repsNum = Math.max(0, Math.round(Number(rawReps.replace(/[^\d.]/g, '')) || 0));
        const weightKg = toKg(rawWeight, r);
        const workingMaxKg = iWorkingMax >= 0 ? toKg(cellOf(r, iWorkingMax), r) : 0;

        if (repsNum > 0 || durationSeconds) {
          const explicitRir =
            iRir >= 0 && cellOf(r, iRir) !== ''
              ? Math.max(0, Math.min(6, Math.round(Number(cellOf(r, iRir)))))
              : parseRpeToRir(cellOf(r, iRpe));
          normalized.push({
            workoutKey: `${dateParsed.date}::th::${workoutName}`,
            workoutName,
            date: dateParsed.date,
            startedAt: dateParsed.iso,
            completedAt: dateParsed.iso,
            exerciseName,
            exerciseNotes: cellOf(r, iNotes) || undefined,
            setType,
            weightKg,
            reps: repsNum > 0 ? repsNum : 1,
            durationSeconds,
            rir: explicitRir ?? (repsNum === 1 && weightKg > 0 ? 0 : undefined),
          });
        } else if (workingMaxKg > 0) {
          // Dedicated TrainHeroic Working Max / Lift History row
          const dedupKey = `${dateParsed.date}::${exerciseName.toLowerCase()}::${workingMaxKg}`;
          if (!recordedWorkingMaxes.has(dedupKey)) {
            recordedWorkingMaxes.add(dedupKey);
            normalized.push({
              workoutKey: `${dateParsed.date}::th-working-maxes`,
              workoutName: 'TrainHeroic Lift Maxes',
              date: dateParsed.date,
              startedAt: dateParsed.iso,
              completedAt: dateParsed.iso,
              exerciseName,
              exerciseNotes: cellOf(r, iNotes) || 'Imported TrainHeroic Working Max / 1RM',
              setType: 'working',
              weightKg: workingMaxKg,
              reps: 1,
              rir: 0,
            });
          }
        }
      }
    } else if (format === 'fitnotes') {
      // FitNotes: Date, Exercise, Category, Weight (kgs|lbs), Reps, Distance, Distance Unit, Time
      const iDate = col('date');
      const iExercise = col('exercise');
      const iCategory = col('category');
      const iWeight = col('weight (kgs)', 'weight (lbs)', 'weight');
      const iReps = col('reps');
      const iTime = col('time');

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const r = rows[rIdx];
        const exerciseName = cellOf(r, iExercise);
        if (!exerciseName) continue;
        const dateParsed = parseExportDateTime(cellOf(r, iDate));
        if (!dateParsed) continue;
        const reps = Math.max(0, Math.round(Number(cellOf(r, iReps)) || 0));
        const durationSeconds = parseSetDurationSeconds(cellOf(r, iTime));
        if (reps <= 0 && !durationSeconds) continue;
        const category = cellOf(r, iCategory) || undefined;

        normalized.push({
          workoutKey: `${dateParsed.date}::fitnotes`,
          workoutName: '',
          date: dateParsed.date,
          startedAt: dateParsed.iso,
          completedAt: dateParsed.iso,
          exerciseName,
          category,
          setType: 'working',
          weightKg: toKg(cellOf(r, iWeight), r),
          reps: reps > 0 ? reps : 1,
          durationSeconds,
        });
      }
    } else {
      // Universal Maxes / 1RM / Workout Log Sheet (copy-pasted from TrainHeroic Analytics, Sheets, Excel, or generic CSV)
      const iDate = col('date', 'recorded', 'day');
      const iWorkout = col('workout', 'session', 'title');
      const iExercise = col('exercise name', 'exercise', 'lift', 'movement');
      const iOneRm = col('best 1rm', 'tested 1rm', '1rm', 'one rep max', 'working max', 'working_max', 'max');
      const iWeight = col('weight (kg)', 'weight (lbs)', 'best weight', 'weight', 'load', 'kg', 'lb');
      const iReps = col('reps', 'repetitions');
      const iRpe = col('rpe');
      const iRir = col('rir');
      const iNotes = col('notes', 'comment');
      const fallbackToday = localDateString();

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const r = rows[rIdx];
        const exerciseName = cellOf(r, iExercise);
        if (!exerciseName) continue;
        const dateRaw = iDate >= 0 ? cellOf(r, iDate) : '';
        const dateParsed = parseExportDateTime(dateRaw) ?? { date: fallbackToday };
        const workoutName = cellOf(r, iWorkout) || 'Imported Lift Maxes';

        const oneRmKg = iOneRm >= 0 ? toKg(cellOf(r, iOneRm), r) : 0;
        const setWeightKg = iWeight >= 0 && iWeight !== iOneRm ? toKg(cellOf(r, iWeight), r) : 0;
        const rawReps = iReps >= 0 ? Math.round(Number(cellOf(r, iReps).replace(/[^\d.]/g, '')) || 0) : 0;
        const explicitRir =
          iRir >= 0 && cellOf(r, iRir) !== ''
            ? Math.max(0, Math.min(6, Math.round(Number(cellOf(r, iRir)))))
            : parseRpeToRir(cellOf(r, iRpe));

        if (oneRmKg > 0 && (setWeightKg <= 0 || rawReps <= 1)) {
          normalized.push({
            workoutKey: `${dateParsed.date}::maxes::${workoutName}`,
            workoutName,
            date: dateParsed.date,
            startedAt: dateParsed.iso,
            completedAt: dateParsed.iso,
            exerciseName,
            exerciseNotes: cellOf(r, iNotes) || undefined,
            setType: 'working',
            weightKg: oneRmKg,
            reps: rawReps > 1 && setWeightKg <= 0 && iWeight === -1 ? rawReps : 1,
            rir: rawReps > 1 ? explicitRir ?? 0 : 0,
          });
        } else {
          if (oneRmKg > 0) {
            normalized.push({
              workoutKey: `${dateParsed.date}::maxes::${workoutName}`,
              workoutName,
              date: dateParsed.date,
              startedAt: dateParsed.iso,
              completedAt: dateParsed.iso,
              exerciseName,
              setType: 'working',
              weightKg: oneRmKg,
              reps: 1,
              rir: 0,
            });
          }
          if (setWeightKg > 0 && rawReps > 0) {
            normalized.push({
              workoutKey: `${dateParsed.date}::maxes::${workoutName}`,
              workoutName,
              date: dateParsed.date,
              startedAt: dateParsed.iso,
              completedAt: dateParsed.iso,
              exerciseName,
              exerciseNotes: cellOf(r, iNotes) || undefined,
              setType: 'working',
              weightKg: setWeightKg,
              reps: rawReps,
              rir: explicitRir ?? (rawReps === 1 ? 0 : 1),
            });
          } else if (setWeightKg > 0 && iReps === -1) {
            // Single weight column with no reps column defaults to a 1RM entry
            normalized.push({
              workoutKey: `${dateParsed.date}::maxes::${workoutName}`,
              workoutName,
              date: dateParsed.date,
              startedAt: dateParsed.iso,
              completedAt: dateParsed.iso,
              exerciseName,
              exerciseNotes: cellOf(r, iNotes) || undefined,
              setType: 'working',
              weightKg: setWeightKg,
              reps: 1,
              rir: 0,
            });
          }
        }
      }
    }
  }

  if (normalized.length === 0) {
    throw new Error(`No completed sets or lift maxes were found in this ${FORMAT_LABELS[format]} file.`);
  }

  const catalog = options.exerciseCatalog && options.exerciseCatalog.length > 0 ? options.exerciseCatalog : SEED_EXERCISES;
  const matchedExerciseNames = new Set<string>();
  const addedExercisesMap = new Map<string, ExerciseDefinition>();

  const resolveExercise = (name: string, category?: string): ExerciseDefinition => {
    const found = matchCatalogExercise(name, catalog, category);
    if (found) {
      matchedExerciseNames.add(found.id);
      return found;
    }
    const id = `ex-import-${toSlug(name)}`;
    const existingCustom = addedExercisesMap.get(id) ?? catalog.find((e) => e.id === id);
    if (existingCustom) return existingCustom;

    const equipment = inferEquipmentFromName(name);
    const { pillar, primaryMuscle, secondaryMuscles, isIsolation } = inferMuscleAndPillar(name, category);
    const isAssisted = isAssistedExercise({ id, name });
    const timed = isTimedExercise({ id });
    const created: ExerciseDefinition = {
      id,
      name,
      pillar,
      primaryMuscle,
      secondaryMuscles,
      equipment,
      isRdl: /\brdl\b|romanian deadlift/i.test(name) || undefined,
      isWeightedCalisthenic: equipment === 'weighted_bodyweight' || undefined,
      isAssisted: isAssisted || undefined,
      isIsolation,
      isTimed: timed || undefined,
      movementFamily: getMovementVectorId({ id, pillar, isIsolation, primaryMuscle }),
      movementFamilyLabel: getMovementFamilyLabel({ id, pillar, isIsolation, primaryMuscle }),
      environments: equipment === 'bodyweight' ? ['gym', 'home', 'travel'] : ['gym'],
      defaultRepRange: isIsolation ? [10, 15] : [6, 10],
    };
    addedExercisesMap.set(id, created);
    return created;
  };

  // Group normalized rows into workouts -> exercises -> sets
  const byWorkout = new Map<string, NormalizedRow[]>();
  for (const row of normalized) {
    const list = byWorkout.get(row.workoutKey) ?? [];
    list.push(row);
    byWorkout.set(row.workoutKey, list);
  }

  const workouts: WorkoutSession[] = [];
  let totalSetsCount = 0;
  let totalVolumeKg = 0;
  const heaviestTracker: { best: { weightKg: number; reps: number; name: string } | null } = {
    best: null,
  };

  for (const [key, wRows] of byWorkout.entries()) {
    const first = wRows[0];
    const byExerciseOrder: Array<{ def: ExerciseDefinition; rows: NormalizedRow[] }> = [];
    const exLookup = new Map<string, { def: ExerciseDefinition; rows: NormalizedRow[] }>();

    for (const r of wRows) {
      const def = resolveExercise(r.exerciseName, r.category);
      let bucket = exLookup.get(def.id);
      if (!bucket) {
        bucket = { def, rows: [] };
        exLookup.set(def.id, bucket);
        byExerciseOrder.push(bucket);
      }
      bucket.rows.push(r);
    }

    const exercises: ExerciseSession[] = byExerciseOrder.map(({ def, rows: exRows }, exIdx) => {
      const meta = getExerciseBiomechanicalMeta(def);
      const isTwoDb = def.equipment === 'dumbbell' && !usesOneDumbbell(def);
      const timed = Boolean(def.isTimed) || exRows.every((r) => Boolean(r.durationSeconds) && r.weightKg === 0);

      const sets: WorkoutSet[] = exRows.map((r, sIdx) => {
        const storedWeightKg =
          options.halveCombinedTwoHandDumbbells && isTwoDb && r.weightKg > 0
            ? Math.max(1, roundHalf(r.weightKg / 2))
            : r.weightKg;
        const rir = r.rir ?? (r.reps === 1 && storedWeightKg > 0 ? 0 : 2);
        if (r.setType !== 'warmup') {
          totalSetsCount++;
          const combinedKg = toCombinedExternalLoadKg(storedWeightKg, def);
          if (!timed && combinedKg > 0) {
            totalVolumeKg += combinedKg * r.reps;
            if (!heaviestTracker.best || storedWeightKg > heaviestTracker.best.weightKg) {
              heaviestTracker.best = { weightKg: storedWeightKg, reps: r.reps, name: def.name };
            }
          }
        }
        return {
          id: `imp-${format}-${first.date}-${exIdx}-${sIdx}`,
          setNumber: sIdx + 1,
          targetWeightKg: storedWeightKg,
          actualWeightKg: storedWeightKg,
          targetReps: timed ? 1 : r.reps,
          actualReps: timed ? 1 : r.reps,
          targetRir: rir,
          actualRir: rir,
          completed: true,
          completedAt: first.completedAt,
          isWarmup: r.setType === 'warmup' || undefined,
          setType: r.setType,
          ...(r.durationSeconds
            ? { targetDurationSeconds: r.durationSeconds, actualDurationSeconds: r.durationSeconds }
            : {}),
        };
      });

      const workingReps = sets.filter((s) => !s.isWarmup).map((s) => s.actualReps ?? def.defaultRepRange[0]);
      const isLoadedCompound =
        !meta.isIsolation && def.equipment !== 'bodyweight' && def.equipment !== 'weighted_bodyweight';
      const [defMinReps, defMaxReps] = def.defaultRepRange;
      const boundedWorkingReps = isLoadedCompound
        ? workingReps.filter((r) => r >= 1 && r <= 15)
        : workingReps.filter((r) => r >= 1);
      const minReps = boundedWorkingReps.length > 0 ? Math.min(defMinReps, ...boundedWorkingReps) : defMinReps;
      // Never let a stray 20-rep pump or warm-up set stretch a loaded compound lift's rep ceiling past 15.
      const maxReps = isLoadedCompound
        ? Math.min(15, Math.max(defMaxReps, ...(boundedWorkingReps.length > 0 ? boundedWorkingReps : [defMaxReps])))
        : workingReps.length > 0
        ? Math.max(defMaxReps, ...workingReps)
        : defMaxReps;
      const noteText = exRows.map((r) => r.exerciseNotes).filter(Boolean).join(' · ');

      return {
        id: `imp-ex-${format}-${first.date}-${exIdx}`,
        exerciseId: def.id,
        name: def.name,
        pillar: def.pillar,
        equipment: def.equipment,
        isRdl: def.isRdl,
        isWeightedCalisthenic: def.isWeightedCalisthenic,
        isAssisted: def.isAssisted,
        isIsolation: meta.isIsolation,
        movementFamily: getMovementVectorId(def),
        movementFamilyLabel: getMovementFamilyLabel(def),
        resistanceProfile: meta.resistanceProfile,
        sfrScore: meta.sfrScore,
        minReps: timed ? 1 : Math.max(1, minReps),
        maxReps: timed ? 1 : Math.max(minReps, maxReps),
        repTargetType: timed ? 'duration' : 'reps',
        ...(timed ? { durationSeconds: exRows[0]?.durationSeconds ?? 45 } : {}),
        ...(noteText ? { athleteNotes: noteText } : {}),
        sets,
      };
    });

    // Build clean FitNotes workout title from trained categories when FitNotes has no workout title column
    let workoutName = first.workoutName;
    if (!workoutName) {
      const cats = [...new Set(wRows.map((r) => r.category).filter((c): c is string => Boolean(c)))];
      workoutName = cats.length > 0 ? cats.slice(0, 2).join(' & ') : 'Imported Workout';
    }

    workouts.push({
      id: `import-${format}-${first.date}-${toSlug(key)}`,
      date: first.date,
      name: workoutName,
      splitDay: inferSplitDay(exercises, workoutName),
      exercises,
      completed: true,
      startedAt: first.startedAt,
      completedAt: first.completedAt,
      durationMinutes: first.durationMinutes,
      readinessState: 'Normal',
      readinessZScore: 0,
      location: 'gym',
    });
  }

  workouts.sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
  const dates = workouts.map((w) => w.date).sort();
  const dateRange: [string, string] | undefined =
    dates.length > 0 ? [dates[0], dates[dates.length - 1]] : undefined;
  const addedExercises = [...addedExercisesMap.values()];
  const fullCatalog = [...catalog, ...addedExercises];
  const exerciseMaxes = computeImportedExerciseMaxes(
    workouts,
    fullCatalog,
    options.bodyweightKg ?? 80
  );
  const testedOneRepMaxCount = exerciseMaxes.filter(
    (m) => m.bestOneRepMaxKg !== null && m.bestOneRepMaxKg > 0
  ).length;
  const combinedDumbbellWarning = options.halveCombinedTwoHandDumbbells
    ? undefined
    : detectLikelyCombinedTwoDumbbellImport(workouts) ?? undefined;

  return {
    format,
    workouts,
    addedExercises,
    exerciseMaxes,
    summary: {
      format,
      formatLabel: FORMAT_LABELS[format],
      detectedUnit,
      workoutsCount: workouts.length,
      totalSetsCount,
      totalVolumeKg: Math.round(totalVolumeKg),
      matchedExercisesCount: matchedExerciseNames.size,
      addedExerciseCount: addedExercises.length,
      documentedMaxesCount: exerciseMaxes.length,
      testedOneRepMaxCount,
      dateRange,
      heaviestLiftLabel: heaviestTracker.best
        ? `${heaviestTracker.best.name}: ${heaviestTracker.best.weightKg} kg × ${heaviestTracker.best.reps}`
        : undefined,
      combinedDumbbellWarning,
    },
  };
}

async function inflateDeflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support .zip decompression; please extract the CSV files first.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  await writer.write(compressed as unknown as BufferSource);
  await writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return merged;
}

/**
 * Unpacks CSV, TSV, and JSON training files from a client-side .zip archive
 * (such as TrainHeroic's account.trainheroic.com/data-export download) with zero server upload.
 */
export async function extractTrainingFilesFromZip(
  zipBuffer: ArrayBuffer | Uint8Array
): Promise<Array<{ fileName: string; content: string }>> {
  const bytes = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer);
  if (bytes.byteLength < 22) {
    throw new Error('The selected .zip archive is invalid or empty.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Locate PKZIP End of Central Directory record (0x06054b50) scanning backward from end
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.byteLength - 65557);
  for (let i = bytes.byteLength - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Could not read .zip directory—please check that the file is a valid .zip archive.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const extracted: Array<{ fileName: string; content: string }> = [];

  let ptr = centralDirOffset;
  for (let idx = 0; idx < totalEntries && ptr + 46 <= bytes.byteLength; idx++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    const lowerName = fileName.toLowerCase();
    const baseName = lowerName.split('/').pop() || lowerName;
    if (
      fileName.endsWith('/') ||
      lowerName.includes('__macosx/') ||
      baseName.startsWith('.') ||
      !/\.(csv|tsv|json)$/i.test(baseName) ||
      /^(messages|chat|conversations|notifications|profile|account|readiness_survey|survey)/.test(baseName)
    ) {
      continue;
    }

    if (localHeaderOffset + 30 > bytes.byteLength) continue;
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compressedSize > bytes.byteLength) continue;

    const rawSlice = bytes.subarray(dataStart, dataStart + compressedSize);
    let uncompressed: Uint8Array;
    if (compressionMethod === 0) {
      uncompressed = rawSlice;
    } else if (compressionMethod === 8) {
      uncompressed = await inflateDeflateRawBytes(rawSlice);
    } else {
      continue;
    }

    const text = decoder.decode(uncompressed).trim();
    if (text.length > 0) {
      extracted.push({ fileName, content: text });
    }
  }

  return extracted;
}

/**
 * High-level multi-file / archive parser supporting TrainHeroic .zip archives,
 * CSV, TSV, and JSON training exports in a single call.
 */
export async function parseTrainingImportArchiveOrText(
  input: ArrayBuffer | Uint8Array | string,
  fileName: string,
  options: CompetitorCsvImportOptions = {}
): Promise<CompetitorCsvImportResult> {
  if (typeof input === 'string') {
    return parseCompetitorCsv(input, options);
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const isZip =
    fileName.toLowerCase().endsWith('.zip') ||
    (bytes.byteLength >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04);

  if (!isZip) {
    const text = new TextDecoder('utf-8').decode(bytes);
    return parseCompetitorCsv(text, options);
  }

  const files = await extractTrainingFilesFromZip(bytes);
  if (files.length === 0) {
    throw new Error('No CSV, TSV, or JSON workout files were found inside this .zip archive.');
  }

  const catalog =
    options.exerciseCatalog && options.exerciseCatalog.length > 0
      ? [...options.exerciseCatalog]
      : [...SEED_EXERCISES];

  let mergedWorkouts: WorkoutSession[] = [];
  const addedMap = new Map<string, ExerciseDefinition>();
  const matchedCountIds = new Set<string>();
  const parsedFileNames: string[] = [];
  let detectedUnit: 'kg' | 'lb' = options.defaultWeightUnit ?? 'kg';
  let primaryFormat: CompetitorAppFormat = options.format ?? 'trainheroic';
  let lockedSpecificAppFormat = false;

  for (const entry of files) {
    try {
      const entryFormat = detectCompetitorCsvFormat(entry.content) ?? options.format;
      const res = parseCompetitorCsv(entry.content, {
        ...options,
        format: entryFormat,
        exerciseCatalog: [...catalog, ...addedMap.values()],
      });
      if (!lockedSpecificAppFormat) {
        primaryFormat = res.format;
        if (res.format !== 'maxes_sheet') {
          lockedSpecificAppFormat = true;
        }
      }
      detectedUnit = res.summary.detectedUnit;
      parsedFileNames.push(entry.fileName.split('/').pop() || entry.fileName);
      for (const add of res.addedExercises) {
        addedMap.set(add.id, add);
      }
      for (const mx of res.exerciseMaxes) {
        if (mx.matchedCatalog) matchedCountIds.add(mx.exerciseId);
      }
      mergedWorkouts = mergeImportedWorkouts(mergedWorkouts, res.workouts).merged;
    } catch {
      // Skip non-workout CSVs inside a multi-table export zip (e.g. readiness or profile tables)
    }
  }

  if (mergedWorkouts.length === 0) {
    throw new Error(
      'No completed training sets or lift maxes were found in the CSV/JSON files inside this .zip archive.'
    );
  }

  const addedExercises = [...addedMap.values()];
  const fullCatalog = [...catalog, ...addedExercises];
  const exerciseMaxes = computeImportedExerciseMaxes(
    mergedWorkouts,
    fullCatalog,
    options.bodyweightKg ?? 80
  );

  let totalSetsCount = 0;
  let totalVolumeKg = 0;
  let bestSet: { weightKg: number; reps: number; name: string } | null = null;
  for (const w of mergedWorkouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!s.completed || s.isWarmup || s.setType === 'warmup') continue;
        totalSetsCount++;
        const kg = s.actualWeightKg ?? s.targetWeightKg ?? 0;
        const reps = s.actualReps ?? s.targetReps ?? 0;
        if (!isTimedExercise(ex) && kg > 0) {
          totalVolumeKg += toCombinedExternalLoadKg(kg, ex) * reps;
          if (!bestSet || kg > bestSet.weightKg) {
            bestSet = { weightKg: kg, reps, name: ex.name };
          }
        }
      }
    }
  }

  const dates = mergedWorkouts.map((w) => w.date).sort();
  const dateRange: [string, string] | undefined =
    dates.length > 0 ? [dates[0], dates[dates.length - 1]] : undefined;
  const testedOneRepMaxCount = exerciseMaxes.filter(
    (m) => m.bestOneRepMaxKg !== null && m.bestOneRepMaxKg > 0
  ).length;
  const combinedDumbbellWarning = options.halveCombinedTwoHandDumbbells
    ? undefined
    : detectLikelyCombinedTwoDumbbellImport(mergedWorkouts) ?? undefined;

  return {
    format: primaryFormat,
    workouts: mergedWorkouts,
    addedExercises,
    exerciseMaxes,
    summary: {
      format: primaryFormat,
      formatLabel: FORMAT_LABELS[primaryFormat],
      detectedUnit,
      workoutsCount: mergedWorkouts.length,
      totalSetsCount,
      totalVolumeKg: Math.round(totalVolumeKg),
      matchedExercisesCount: matchedCountIds.size,
      addedExerciseCount: addedExercises.length,
      documentedMaxesCount: exerciseMaxes.length,
      testedOneRepMaxCount,
      sourceFilesParsed: parsedFileNames,
      dateRange,
      heaviestLiftLabel: bestSet
        ? `${bestSet.name}: ${bestSet.weightKg} kg × ${bestSet.reps}`
        : undefined,
      combinedDumbbellWarning,
    },
  };
}

/** Merges imported historical workouts with existing workouts idempotently without duplicating sessions. */
export function mergeImportedWorkouts(
  existing: WorkoutSession[],
  imported: WorkoutSession[]
): { merged: WorkoutSession[]; addedCount: number } {
  const existingIds = new Set(existing.map((w) => w.id));
  const fingerprint = (w: WorkoutSession) =>
    `${w.date}::${w.exercises.map((e) => `${e.exerciseId}:${e.sets.length}`).join('|')}`;
  const existingFingerprints = new Set(existing.map(fingerprint));

  const toAdd = imported.filter((w) => !existingIds.has(w.id) && !existingFingerprints.has(fingerprint(w)));
  const merged = [...existing, ...toAdd].sort((a, b) =>
    (b.completedAt || b.date).localeCompare(a.completedAt || a.date)
  );
  return { merged, addedCount: toAdd.length };
}
