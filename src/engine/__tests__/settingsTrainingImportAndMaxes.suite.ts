/**
 * Suite 84: Settings Multi-Source Training Data & Lift Maxes Import (TrainHeroic .zip / CSV / TSV / JSON, Hevy, Strong, FitNotes, 1RM Sheet)
 *
 * Verifies:
 * 1. Exact 1-rep max boundary condition (`1 rep @ 0 RIR === 1.00x`, zero Epley inflation).
 * 2. TrainHeroic set-by-set CSV parsing (ignores unperformed prescribed rows, converts units, maps 304-lift catalog).
 * 3. Client-side PKZIP unpacking (`extractTrainingFilesFromZip` & `parseTrainingImportArchiveOrText`) for TrainHeroic data-export `.zip` archives (deflate-raw + stored entries, skips messages/__MACOSX).
 * 4. TrainHeroic copy-pasted Analytics -> Lift History TSV, TrainHeroic JSON, and generic 1RM / Maxes sheet.
 * 5. End-to-end documentation of Best 1RM, Heaviest Set, and Best Estimated 1RM across `buildPersonalBests`, `buildExerciseDetailModel`, and `rebuildIsolatedProgressionStates`.
 * 6. First-class Settings UI wiring (`ProfileSettingsSections.tsx`, `GoogleAuthModal.tsx`, `ImportProgramModal.tsx`, `App.tsx`).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { calculateE1RM } from '../e1rm';
import { rebuildIsolatedProgressionStates } from '../continuityEngine';
import {
  detectCompetitorCsvFormat,
  extractTrainingFilesFromZip,
  mergeImportedWorkouts,
  parseCompetitorCsv,
  parseTrainingImportArchiveOrText,
} from '../../services/competitorCsvImport';
import { buildPersonalBests } from '../../services/progressOverview';
import {
  buildExerciseDetailModel,
  buildInspectExerciseSession,
} from '../../services/exerciseDetails';
import { SEED_EXERCISES } from '../../services/seedData';

type AssertFn = (condition: boolean, message: string) => void;

/** Builds a valid PKZIP archive buffer in memory (supports stored method 0 and deflate-raw method 8). */
function buildTestZipArchive(
  entries: Array<{ name: string; content: string; compress?: boolean }>
): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const rawBuf = Buffer.from(entry.content, 'utf8');
    const method = entry.compress ? 8 : 0;
    const dataBuf = entry.compress ? zlib.deflateRawSync(rawBuf) : rawBuf;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(0, 14); // crc32 (unused by reader)
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBuf, dataBuf);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, nameBuf);
    localOffset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const full = Buffer.concat([...localParts, centralDirBuf, eocd]);
  return new Uint8Array(full.buffer, full.byteOffset, full.byteLength);
}

export async function runSettingsTrainingImportAndMaxesSuite(assert: AssertFn): Promise<void> {
  console.log(
    '\n[Suite 84] Testing Settings Multi-Source Training Import (TrainHeroic .zip/CSV/TSV/JSON) & Per-Exercise 1RM Documentation...'
  );

  // 1. True 1RM exactness (`1 rep @ 0 RIR === 1.00x`, zero +3.3% Epley inflation)
  const squat1rmExact = calculateE1RM(
    160,
    1,
    0,
    'barbell',
    false,
    false,
    80,
    'ex-barbell-squat',
    'Squat',
    'Barbell Back Squat'
  );
  const squat1RepWithReserve = calculateE1RM(
    160,
    1,
    1,
    'barbell',
    false,
    false,
    80,
    'ex-barbell-squat',
    'Squat',
    'Barbell Back Squat'
  );
  const bench5rmEpley = calculateE1RM(
    100,
    5,
    0,
    'barbell',
    false,
    false,
    80,
    'ex-bench-press',
    'Horizontal Push',
    'Barbell Bench Press'
  );
  assert(
    squat1rmExact === 160 &&
      squat1RepWithReserve > 160 &&
      Math.abs(bench5rmEpley - 116.7) < 0.2,
    `True 1RM (1 rep @ 0 RIR) equals exact lifted weight (${squat1rmExact} kg === 160 kg) while 1 rep @ 1 RIR (${squat1RepWithReserve.toFixed(1)}) and 5RM (${bench5rmEpley.toFixed(1)}) apply Epley scaling`
  );

  // 2. TrainHeroic Set-by-Set CSV Export (prescribed vs performed, skips unperformed rows)
  const trainHeroicSetCsv = [
    'date,workout,block,exercise_name,set,prescribed_weight,prescribed_reps,performed_weight,performed_reps,rpe,athlete_notes',
    '2026-10-12,Lower Heavy,A,Barbell Back Squat,1,140,3,140,3,8,Smooth opener',
    '2026-10-12,Lower Heavy,A,Barbell Back Squat,2,160,1,165,1,10,New tested 1RM!',
    '2026-10-12,Lower Heavy,A,Barbell Back Squat,3,170,1,,, ,Skipped attempt',
    '2026-10-14,Upper Heavy,A,Barbell Bench Press,1,100,5,102.5,5,9,Strong drive',
    '2026-10-14,Upper Heavy,B,Trap Bar Deadlift,1,180,3,185,3,8.5,High handles',
  ].join('\n');

  assert(
    detectCompetitorCsvFormat(trainHeroicSetCsv) === 'trainheroic',
    'detectCompetitorCsvFormat auto-detects TrainHeroic set-by-set CSV exports'
  );

  const thParsed = parseCompetitorCsv(trainHeroicSetCsv, {
    exerciseCatalog: SEED_EXERCISES,
    defaultWeightUnit: 'kg',
    bodyweightKg: 82,
  });

  const squatMax = thParsed.exerciseMaxes.find((m) => m.exerciseId === 'ex-barbell-squat');
  const benchMax = thParsed.exerciseMaxes.find((m) => m.exerciseId === 'ex-bench-press');
  const trapDeadliftMax = thParsed.exerciseMaxes.find((m) => m.exerciseId === 'ex-trap-bar-deadlift');

  assert(
    thParsed.format === 'trainheroic' &&
      thParsed.summary.workoutsCount === 2 &&
      thParsed.summary.totalSetsCount === 4 && // unperformed 170 kg row strictly excluded!
      thParsed.summary.documentedMaxesCount === 3 &&
      thParsed.summary.testedOneRepMaxCount === 1 &&
      squatMax?.bestOneRepMaxKg === 165 &&
      squatMax?.bestEstimated1rmKg === 165 &&
      benchMax?.bestOneRepMaxKg === null &&
      benchMax?.heaviestSetWeightKg === 102.5 &&
      benchMax?.heaviestSetReps === 5 &&
      (benchMax?.bestEstimated1rmKg ?? 0) > 118 &&
      trapDeadliftMax?.matchedCatalog === true &&
      trapDeadliftMax?.heaviestSetWeightKg === 185,
    'TrainHeroic set-by-set CSV imports performed sets, never fabricates blank prescribed sets, matches specialty implements, and documents exact 1RM + multi-rep E1RMs'
  );

  // 3. TrainHeroic Data-Export .zip Archive (deflate-raw + stored + ignored non-workout files)
  const workingMaxesCsv = [
    'Exercise,Working Max (kg),Date',
    'Barbell Bench Press,122.5,10/20/2026',
    'Overhead Press,77.5,10/20/2026',
  ].join('\n');
  const ignoredMessagesCsv = 'message_id,sender,body\n1,Coach,Great block!';

  const zipBytes = buildTestZipArchive([
    { name: 'trainheroic-export/workout_history.csv', content: trainHeroicSetCsv, compress: true },
    { name: 'trainheroic-export/working_maxes.csv', content: workingMaxesCsv, compress: true },
    { name: 'trainheroic-export/messages.csv', content: ignoredMessagesCsv, compress: false },
    { name: '__MACOSX/._workout_history.csv', content: 'junk', compress: false },
  ]);

  const extractedFiles = await extractTrainingFilesFromZip(zipBytes);
  assert(
    extractedFiles.length === 2 &&
      extractedFiles.some((f) => f.fileName.endsWith('workout_history.csv')) &&
      extractedFiles.some((f) => f.fileName.endsWith('working_maxes.csv')),
    'extractTrainingFilesFromZip unpacks deflate-raw training CSVs and skips messages.csv and __MACOSX metadata'
  );

  const zipImported = await parseTrainingImportArchiveOrText(
    zipBytes,
    'trainheroic-data-export.zip',
    { exerciseCatalog: SEED_EXERCISES, defaultWeightUnit: 'kg', bodyweightKg: 82 }
  );

  const zipSquat = zipImported.exerciseMaxes.find((m) => m.exerciseId === 'ex-barbell-squat');
  const zipBench = zipImported.exerciseMaxes.find((m) => m.exerciseId === 'ex-bench-press');
  const zipOhp = zipImported.exerciseMaxes.find((m) => m.exerciseId === 'ex-ohp');

  assert(
    zipImported.format === 'trainheroic' &&
      zipImported.summary.sourceFilesParsed?.length === 2 &&
      zipSquat?.bestOneRepMaxKg === 165 &&
      zipBench?.bestOneRepMaxKg === 122.5 &&
      zipBench?.heaviestSetWeightKg === 122.5 &&
      zipOhp?.bestOneRepMaxKg === 77.5 &&
      zipImported.summary.testedOneRepMaxCount === 3,
    'parseTrainingImportArchiveOrText merges TrainHeroic workout logs + working maxes from a single .zip archive and documents all 3 best 1RMs'
  );

  // 4. TrainHeroic Analytics -> Lift History Copy-Pasted TSV, TrainHeroic JSON & Generic 1RM Sheet
  const pastedLiftHistoryTsv = [
    'Exercise\tWorking Max\tDate',
    'Safety Bar Squat\t315 lb\t11/02/2026',
    'Weighted Chin-Up\t90 lb\t11/02/2026',
  ].join('\n');

  const tsvParsed = parseCompetitorCsv(pastedLiftHistoryTsv, {
    exerciseCatalog: SEED_EXERCISES,
    defaultWeightUnit: 'lb',
    bodyweightKg: 82,
  });
  const ssbMax = tsvParsed.exerciseMaxes.find((m) => m.exerciseId === 'ex-ssb-squat');
  assert(
    tsvParsed.format === 'trainheroic' &&
      ssbMax !== undefined &&
      Math.abs((ssbMax.bestOneRepMaxKg ?? 0) - 142.9) < 0.2,
    'Copy-pasted TrainHeroic Lift History TSV converts lb working maxes to kg and maps Safety Bar Squat'
  );

  const thJson = JSON.stringify({
    workouts: [
      {
        date: '2026-11-10',
        title: 'Strength Block W4D1',
        exercises: [
          {
            name: 'Romanian Deadlift',
            sets: [
              { performedWeight: 150, performedReps: 6, rir: 1 },
            ],
          },
        ],
      },
    ],
    workingMaxes: [
      { exercise: 'Barbell Conventional Deadlift', oneRepMax: 210, date: '2026-11-05', unit: 'kg' },
    ],
  });
  const jsonParsed = parseCompetitorCsv(thJson, {
    exerciseCatalog: SEED_EXERCISES,
    defaultWeightUnit: 'kg',
    bodyweightKg: 82,
  });
  const dlJsonMax = jsonParsed.exerciseMaxes.find((m) => m.exerciseId === 'ex-deadlift');
  const rdlJsonMax = jsonParsed.exerciseMaxes.find((m) => m.exerciseId === 'ex-rdl');
  assert(
    jsonParsed.format === 'trainheroic' &&
      dlJsonMax?.bestOneRepMaxKg === 210 &&
      rdlJsonMax?.heaviestSetWeightKg === 150 &&
      rdlJsonMax?.heaviestSetReps === 6,
    'TrainHeroic JSON export imports both session sets and workingMaxes accurately'
  );

  const genericMaxesSheet = [
    'Date,Exercise,Best 1RM,Weight,Reps',
    '2026-11-15,Incline Barbell Bench Press,105,92.5,5',
  ].join('\n');
  const maxesSheetParsed = parseCompetitorCsv(genericMaxesSheet, {
    exerciseCatalog: SEED_EXERCISES,
    defaultWeightUnit: 'kg',
  });
  assert(
    maxesSheetParsed.format === 'maxes_sheet' &&
      maxesSheetParsed.exerciseMaxes[0]?.bestOneRepMaxKg === 105 &&
      maxesSheetParsed.exerciseMaxes[0]?.heaviestSetWeightKg === 105,
    'Generic 1RM / Maxes sheet documents both Best 1RM and multi-rep sets'
  );

  // 5. End-to-End Propagation into Personal Bests, ExerciseDetailModal & Progression States
  const merged = mergeImportedWorkouts([], zipImported.workouts);
  const personalBests = buildPersonalBests(merged.merged, 82);
  const benchPb = personalBests.find((p) => p.exerciseId === 'ex-bench-press');
  const squatPb = personalBests.find((p) => p.exerciseId === 'ex-barbell-squat');
  assert(
    benchPb?.bestOneRepMaxKg === 122.5 &&
      squatPb?.bestOneRepMaxKg === 165 &&
      squatPb?.bestOneRepMaxDate === '2026-10-12',
    'buildPersonalBests exposes exact bestOneRepMaxKg and bestOneRepMaxDate for Progress -> Personal bests'
  );

  const inspected = buildInspectExerciseSession({
    exerciseId: 'ex-bench-press',
    exerciseCatalog: SEED_EXERCISES,
    workouts: merged.merged,
  })!;
  const detailModel = buildExerciseDetailModel({
    exercise: inspected.exercise,
    exerciseDef: inspected.exerciseDef,
    workouts: merged.merged,
    bodyweightKg: 82,
    formatWeight: (kg) => `${Math.round(kg)} kg`,
    formatPreciseWeight: (kg) => `${kg} kg`,
  });
  assert(
    detailModel.bestOneRepMaxDisplay === '122.5 kg' &&
      Boolean(detailModel.heaviestSetDisplay?.includes('122.5 kg')),
    `ExerciseDetailModal model surfaces bestOneRepMaxDisplay ("${detailModel.bestOneRepMaxDisplay}") and heaviestSetDisplay ("${detailModel.heaviestSetDisplay}")`
  );

  const progStates = rebuildIsolatedProgressionStates(merged.merged, 82, {});
  assert(
    (progStates['ex-barbell-squat']?.lastWorkingWeightKg ?? 0) > 0 &&
      (progStates['ex-bench-press']?.estimated1rmKg ?? 0) >= 122.5,
    'rebuildIsolatedProgressionStates seeds personalized working loads & E1RMs from imported TrainHeroic history'
  );

  // 6. Static Wiring Across Settings, GoogleAuthModal, ImportProgramModal, AnalyticsTab & ExerciseDetailModal
  const repoRoot = process.cwd();
  const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  const settingsSrc = read('src/components/auth/ProfileSettingsSections.tsx');
  const authModalSrc = read('src/components/auth/GoogleAuthModal.tsx');
  const importModalSrc = read('src/components/program/ImportProgramModal.tsx');
  const analyticsSrc = read('src/components/analytics/AnalyticsTab.tsx');
  const detailModalSrc = read('src/components/train/ExerciseDetailModal.tsx');
  const appSrc = read('src/App.tsx');

  assert(
    settingsSrc.includes('Training data &amp; lift maxes') &&
      settingsSrc.includes('Import training history or maxes') &&
      settingsSrc.includes('Documented lift maxes') &&
      settingsSrc.includes('onViewPersonalBests') &&
      authModalSrc.includes('onViewPersonalBests={onViewPersonalBests}') &&
      importModalSrc.includes("id: 'trainheroic'") &&
      importModalSrc.includes('parseTrainingImportArchiveOrText') &&
      importModalSrc.includes('.zip') &&
      importModalSrc.includes('Documented exercise maxes') &&
      analyticsSrc.includes('bestOneRepMaxKg') &&
      detailModalSrc.includes('bestOneRepMaxDisplay') &&
      appSrc.includes("setProgressDetailRequest({ detail: 'bests'"),
    'Settings Training data & lift maxes card, TrainHeroic .zip/CSV importer modal, Progress personal bests, and ExerciseDetailModal are wired end-to-end'
  );
}
