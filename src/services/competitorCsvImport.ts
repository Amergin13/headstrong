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
import { isAssistedExercise, isTimedExercise, toCombinedExternalLoadKg, usesOneDumbbell } from '../engine/e1rm';
import { getMovementFamilyLabel, getMovementVectorId } from '../engine/progression';
import { getExerciseBiomechanicalMeta } from '../engine/knowledgeGraph';
import { LB_PER_KG } from '../utils/units';
import { SEED_EXERCISES } from './seedData';

export type CompetitorAppFormat = 'hevy' | 'strong' | 'fitnotes';

export interface CompetitorCsvImportOptions {
  /** Explicit format, or auto-detected from header row when omitted. */
  format?: CompetitorAppFormat;
  exerciseCatalog?: ExerciseDefinition[];
  /** Fallback unit when a CSV header omits kg/lbs (common in Strong exports). */
  defaultWeightUnit?: 'kg' | 'lb';
  /** Halve two-hand dumbbell loads if the source log recorded combined pair weight. */
  halveCombinedTwoHandDumbbells?: boolean;
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
  dateRange?: [string, string];
  heaviestLiftLabel?: string;
}

export interface CompetitorCsvImportResult {
  format: CompetitorAppFormat;
  workouts: WorkoutSession[];
  addedExercises: ExerciseDefinition[];
  summary: CompetitorCsvImportSummary;
}

const FORMAT_LABELS: Record<CompetitorAppFormat, string> = {
  hevy: 'Hevy',
  strong: 'Strong',
  fitnotes: 'FitNotes',
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

/** RFC-4180 CSV parser supporting comma or semicolon delimiters, quoted fields, and CRLF. */
export function parseDelimitedRows(rawText: string): { rows: string[][]; delimiter: ',' | ';' } {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return { rows: [], delimiter: ',' };

  const firstLine = cleaned.split(/\r?\n/, 1)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter: ',' | ';' = semiCount > commaCount ? ';' : ',';

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

/** Auto-detects Hevy, Strong, or FitNotes CSV format from the header row. */
export function detectCompetitorCsvFormat(csvText: string): CompetitorAppFormat | null {
  const { rows } = parseDelimitedRows(csvText);
  if (rows.length < 2) return null;
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const has = (needle: string) => headers.some((h) => h === needle || h.includes(needle));

  if (has('exercise_title') && has('start_time')) {
    return 'hevy';
  }
  if (has('workout name') && has('exercise name') && (has('set order') || has('weight'))) {
    return 'strong';
  }
  if (has('date') && has('exercise') && has('category') && has('reps')) {
    return 'fitnotes';
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

/** Parses Hevy ("24 Oct 2024, 08:30"), Strong ("2024-10-24 08:30:00"), and FitNotes ("2024-10-24") dates into local YYYY-MM-DD + ISO timestamp. */
function parseExportDateTime(raw: string): { date: string; iso?: string } | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO / SQL: YYYY-MM-DD[T| HH:MM[:SS]]
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
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
    if (/chin|pull/.test(lower)) return pick('ex-assisted-chinup');
  }

  // Direct name match (skip parenthetical-stripped match when equipment disagrees)
  const exact = catalog.find(
    (e) =>
      e.name.toLowerCase() === lower ||
      (normalizeNameKey(e.name) === base && e.equipment === equip)
  );
  if (exact) return exact;
  if (/^(barbell )?back squat$|^squat$/.test(base) && equip === 'barbell') return pick('ex-barbell-squat');
  if (/bulgarian split squat|split squat/.test(base)) return pick('ex-bulgarian-split-squat');
  if (/leg press/.test(base)) return pick('ex-leg-press');
  if (/romanian deadlift|\brdl\b/.test(base)) return equip === 'dumbbell' ? pick('ex-db-rdl') : pick('ex-rdl');
  if (/^(conventional |barbell )?deadlift$/.test(base)) return pick('ex-deadlift');
  if (/incline.*(bench|chest) press/.test(base)) {
    return equip === 'dumbbell' ? pick('ex-db-bench-press') : pick('ex-bench-press');
  }
  if (/^(flat |barbell )?bench press$/.test(base)) {
    return equip === 'dumbbell' ? pick('ex-flat-db-press') : pick('ex-bench-press');
  }
  if (/^(overhead press|military press|standing.*press|shoulder press)$/.test(base)) {
    return equip === 'dumbbell' ? pick('ex-db-shoulder-press') : pick('ex-ohp');
  }
  if (/lat pulldown/.test(base)) return pick('ex-lat-pulldown');
  if (/weighted (chin|pull)[- ]?up/.test(base)) return pick('ex-weighted-pullup');
  if (/^(chin|pull)[- ]?up/.test(base)) return pick('ex-chinup');
  if (/seated.*cable row|cable row|seated row/.test(base)) return pick('ex-cable-row');
  if (/chest[- ]?supported.*row/.test(base)) return pick('ex-chest-supported-db-row');
  if (/lateral raise/.test(base)) return equip === 'cable' ? pick('ex-cable-lateral-raise') : pick('ex-db-lateral-raise');
  if (/face pull/.test(base)) return pick('ex-face-pull');
  if (/tricep.*pushdown|rope pushdown/.test(base)) return pick('ex-tricep-pushdown');
  if (/(seated|lying) leg curl|hamstring curl/.test(base)) return pick('ex-leg-curl');
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

/**
 * Parses a Hevy, Strong, or FitNotes CSV export into Treise WorkoutSessions + any new ExerciseDefinitions.
 */
export function parseCompetitorCsv(
  csvText: string,
  options: CompetitorCsvImportOptions = {}
): CompetitorCsvImportResult {
  const { rows } = parseDelimitedRows(csvText);
  if (rows.length < 2) {
    throw new Error('The CSV file is empty or missing workout rows.');
  }

  const format = options.format ?? detectCompetitorCsvFormat(csvText);
  if (!format) {
    throw new Error('Could not recognize this CSV format. Supported exports: Hevy, Strong, and FitNotes.');
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

  // Detect source weight unit from column headers (or fall back to option)
  let detectedUnit: 'kg' | 'lb' = options.defaultWeightUnit ?? 'kg';
  if (headers.some((h) => /weight.*lbs|weight_lbs|\(lbs\)/.test(h))) {
    detectedUnit = 'lb';
  } else if (headers.some((h) => /weight.*kg|weight_kg|\(kgs?\)/.test(h))) {
    detectedUnit = 'kg';
  }
  const toKg = (rawVal: string): number => {
    const n = Number(rawVal.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return detectedUnit === 'lb' ? round1(n / LB_PER_KG) : round1(n);
  };

  const normalized: NormalizedRow[] = [];

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
        weightKg: toKg(cellOf(r, iWeight)),
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
        weightKg: toKg(cellOf(r, iWeight)),
        reps: reps > 0 ? reps : 1,
        durationSeconds,
        rir: orderRaw === 'F' ? 0 : parseRpeToRir(cellOf(r, iRpe)),
      });
    }
  } else {
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
        weightKg: toKg(cellOf(r, iWeight)),
        reps: reps > 0 ? reps : 1,
        durationSeconds,
      });
    }
  }

  if (normalized.length === 0) {
    throw new Error(`No completed sets were found in this ${FORMAT_LABELS[format]} CSV.`);
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
        const rir = r.rir ?? 2;
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
      const minReps = workingReps.length > 0 ? Math.min(def.defaultRepRange[0], ...workingReps) : def.defaultRepRange[0];
      const maxReps = workingReps.length > 0 ? Math.max(def.defaultRepRange[1], ...workingReps) : def.defaultRepRange[1];
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

  return {
    format,
    workouts,
    addedExercises,
    summary: {
      format,
      formatLabel: FORMAT_LABELS[format],
      detectedUnit,
      workoutsCount: workouts.length,
      totalSetsCount,
      totalVolumeKg: Math.round(totalVolumeKg),
      matchedExercisesCount: matchedExerciseNames.size,
      addedExerciseCount: addedExercises.length,
      dateRange,
      heaviestLiftLabel: heaviestTracker.best
        ? `${heaviestTracker.best.name}: ${heaviestTracker.best.weightKg} kg × ${heaviestTracker.best.reps}`
        : undefined,
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
