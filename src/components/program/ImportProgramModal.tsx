import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { ExerciseDefinition } from '../../engine/types';
import {
  ParsedProgramImport,
  parseProgramSpreadsheet,
} from '../../services/spreadsheetProgramImport';
import {
  CompetitorAppFormat,
  CompetitorCsvImportResult,
  detectCompetitorCsvFormat,
  parseCompetitorCsv,
  parseTrainingImportArchiveOrText,
} from '../../services/competitorCsvImport';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

export type ImportModalMode = 'history' | 'spreadsheet';

interface ImportProgramModalProps {
  exerciseCatalog: ExerciseDefinition[];
  bodyweightKg?: number;
  initialMode?: ImportModalMode;
  onImport?: (parsed: ParsedProgramImport, opts: { activateProgram: boolean; importHistory: boolean }) => void;
  onImportHistory?: (parsed: CompetitorCsvImportResult) => void;
  onClose: () => void;
}

const COMPETITOR_SOURCES: ReadonlyArray<{ id: CompetitorAppFormat; label: string; hint: string }> = [
  {
    id: 'trainheroic',
    label: 'TrainHeroic',
    hint: 'Upload .zip from account.trainheroic.com/data-export, CSV/JSON, or paste Lift History',
  },
  { id: 'hevy', label: 'Hevy CSV', hint: 'Export from Hevy → Settings → Export Data' },
  { id: 'strong', label: 'Strong CSV', hint: 'Export from Strong → Settings → Export Strong Data' },
  { id: 'fitnotes', label: 'FitNotes CSV', hint: 'Export from FitNotes → Settings → Spreadsheet Export' },
  {
    id: 'maxes_sheet',
    label: '1RM / Maxes',
    hint: 'Any CSV, TSV, or pasted table with Exercise and Best 1RM or Weight × Reps',
  },
];

/** Modal allowing athletes to import training history & lift maxes from TrainHeroic (.zip/CSV/JSON), Hevy, Strong, FitNotes, or a 1RM sheet, or import a spreadsheet program. */
export const ImportProgramModal: React.FC<ImportProgramModalProps> = ({
  exerciseCatalog,
  bodyweightKg,
  initialMode,
  onImport,
  onImportHistory,
  onClose,
}) => {
  const units = useUnits();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyFileInputRef = useRef<HTMLInputElement>(null);
  const canSpreadsheet = Boolean(onImport);
  const canHistory = Boolean(onImportHistory);
  const [mode, setMode] = useState<ImportModalMode>(
    initialMode ?? (canHistory && !canSpreadsheet ? 'history' : 'spreadsheet')
  );
  const [selectedSource, setSelectedSource] = useState<CompetitorAppFormat | 'auto'>('auto');
  const [historyCsvText, setHistoryCsvText] = useState('');
  const [zipArchive, setZipArchive] = useState<{ bytes: Uint8Array; fileName: string } | null>(null);
  const [zipParseResult, setZipParseResult] = useState<{ parsed?: CompetitorCsvImportResult; error?: string }>({});
  const [showAllMaxes, setShowAllMaxes] = useState(false);
  const [historyUnit, setHistoryUnit] = useState<'kg' | 'lb'>(units.unit);
  const [programName, setProgramName] = useState('Phase 1 BT');
  const [sheetText, setSheetText] = useState('');
  const [importHistory, setImportHistory] = useState(true);
  const [halveCombinedTwoHandDumbbells, setHalveCombinedTwoHandDumbbells] = useState(false);
  const [activateProgram, setActivateProgram] = useState(true);
  const [preferHistoricalStartDate, setPreferHistoricalStartDate] = useState(true);
  const [historicalStartDate, setHistoricalStartDate] = useState('2017-01-09');
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!zipArchive) {
      setZipParseResult({});
      return;
    }
    let cancelled = false;
    parseTrainingImportArchiveOrText(zipArchive.bytes, zipArchive.fileName, {
      format: selectedSource === 'auto' ? undefined : selectedSource,
      exerciseCatalog,
      bodyweightKg,
      defaultWeightUnit: historyUnit,
      halveCombinedTwoHandDumbbells,
    })
      .then((parsed) => {
        if (!cancelled) setZipParseResult({ parsed });
      })
      .catch((err) => {
        if (!cancelled) {
          setZipParseResult({
            error: err instanceof Error ? err.message : 'Unable to unpack training archive.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [zipArchive, selectedSource, exerciseCatalog, bodyweightKg, historyUnit, halveCombinedTwoHandDumbbells]);

  const textHistoryParseResult = useMemo<{ parsed?: CompetitorCsvImportResult; error?: string }>(() => {
    if (zipArchive || !historyCsvText.trim()) return {};
    try {
      const detected = detectCompetitorCsvFormat(historyCsvText);
      const parsed = parseCompetitorCsv(historyCsvText, {
        format: detected ?? (selectedSource === 'auto' ? undefined : selectedSource),
        exerciseCatalog,
        bodyweightKg,
        defaultWeightUnit: historyUnit,
        halveCombinedTwoHandDumbbells,
      });
      return { parsed };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unable to parse training export.' };
    }
  }, [
    zipArchive,
    historyCsvText,
    selectedSource,
    exerciseCatalog,
    bodyweightKg,
    historyUnit,
    halveCombinedTwoHandDumbbells,
  ]);

  const historyParseResult = zipArchive ? zipParseResult : textHistoryParseResult;

  const parseResult = useMemo<{ parsed?: ParsedProgramImport; error?: string }>(() => {
    if (!sheetText.trim()) return {};
    try {
      const parsed = parseProgramSpreadsheet(sheetText, {
        programName: programName.trim() || 'Imported Program',
        exerciseCatalog,
        importHistory,
        historicalStartDate,
        preferHistoricalStartDate,
        halveCombinedTwoHandDumbbells,
      });
      return { parsed };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unable to parse spreadsheet.' };
    }
  }, [
    sheetText,
    programName,
    exerciseCatalog,
    importHistory,
    historicalStartDate,
    preferHistoricalStartDate,
    halveCombinedTwoHandDumbbells,
  ]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    try {
      if (file.name.toLowerCase().endsWith('.zip') && canHistory) {
        const buf = await file.arrayBuffer();
        setHistoryCsvText('');
        setZipArchive({ bytes: new Uint8Array(buf), fileName: file.name });
        setMode('history');
        return;
      }
      const content = await file.text();
      // Auto-route TrainHeroic, Hevy, Strong, and FitNotes exports straight into the history importer when available.
      const detectedCompetitor = detectCompetitorCsvFormat(content);
      if (detectedCompetitor && canHistory && detectedCompetitor !== 'maxes_sheet') {
        setSelectedSource(detectedCompetitor);
        setZipArchive(null);
        setHistoryCsvText(content);
        setMode('history');
        return;
      }
      setSheetText(content);
      const baseName = file.name.replace(/\.(csv|tsv|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
      if (baseName) setProgramName(baseName);
    } catch {
      setFileError('Could not read the selected file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleHistoryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setShowAllMaxes(false);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        setHistoryCsvText('');
        setZipArchive({ bytes: new Uint8Array(buf), fileName: file.name });
        return;
      }
      const content = await file.text();
      setZipArchive(null);
      setHistoryCsvText(content);
      const detected = detectCompetitorCsvFormat(content);
      if (detected) setSelectedSource(detected);
    } catch {
      setFileError('Could not read the selected training file.');
    } finally {
      e.target.value = '';
    }
  };

  const triggerOneClickSource = (source: CompetitorAppFormat) => {
    triggerHaptic('light');
    setFileError(null);
    setSelectedSource(source);
    historyFileInputRef.current?.click();
  };

  const handleInsertMaxesHeader = () => {
    triggerHaptic('light');
    setZipArchive(null);
    setSelectedSource('maxes_sheet');
    if (!historyCsvText.trim()) {
      setHistoryCsvText('Date,Exercise,Best 1RM,Weight,Reps\n');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'history') {
      if (!historyParseResult.parsed || !onImportHistory) return;
      triggerHaptic('medium');
      onImportHistory(historyParseResult.parsed);
      onClose();
      return;
    }
    if (!parseResult.parsed || !onImport) return;
    triggerHaptic('medium');
    onImport(parseResult.parsed, { activateProgram, importHistory });
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'history' ? 'Import training data and lift maxes' : 'Import program from spreadsheet'}
      className="wk fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <div
              className="w-10 h-10 flex items-center justify-center shrink-0 rounded-lg"
              style={{
                background: 'var(--wk-pill)',
                color: 'var(--color-status-neutral)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="wk-h1">
                {mode === 'history' ? 'Import training data & maxes' : 'Import spreadsheet program'}
              </h3>
              <p className="wk-body mt-1">
                {mode === 'history'
                  ? 'Upload your TrainHeroic data-export .zip, CSV or JSON from Hevy, Strong, or FitNotes, or paste lift maxes. Treise normalizes units and documents your best 1RM and heaviest sets per lift.'
                  : 'Upload a CSV / TSV export or paste your sheet. Treise builds your workout schedule and imports logged sets into your lifetime stats.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close importer"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border flex items-center justify-center transition-colors shrink-0"
            style={{
              background: 'var(--wk-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {canHistory && canSpreadsheet && (
          <div className="wk-segments grid grid-cols-2" role="tablist" aria-label="Import type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'history'}
              onClick={() => {
                triggerHaptic('light');
                setFileError(null);
                setMode('history');
              }}
              className={`wk-segment ${mode === 'history' ? 'is-active' : ''}`}
            >
              History &amp; maxes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'spreadsheet'}
              onClick={() => {
                triggerHaptic('light');
                setFileError(null);
                setMode('spreadsheet');
              }}
              className={`wk-segment ${mode === 'spreadsheet' ? 'is-active' : ''}`}
            >
              Spreadsheet plan
            </button>
          </div>
        )}

        {mode === 'history' ? (
          <>
            <input
              ref={historyFileInputRef}
              type="file"
              accept=".zip,.csv,.tsv,.txt,.json,application/zip,text/csv,text/tab-separated-values,application/json,text/plain"
              onChange={handleHistoryFileChange}
              className="hidden"
              aria-label="Choose TrainHeroic .zip, CSV, TSV, or JSON training export"
            />
            <div className="flex flex-col gap-2">
              <span className="wk-meta-title">Select source to upload (.zip, CSV, TSV, or JSON)</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {COMPETITOR_SOURCES.map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => triggerOneClickSource(src.id)}
                    title={src.hint}
                    className="wk-btn-secondary w-full min-h-[44px] justify-center px-2"
                    style={
                      selectedSource === src.id
                        ? { borderColor: 'var(--wk-accent)', color: 'var(--color-text-primary)' }
                        : undefined
                    }
                  >
                    {src.label}
                  </button>
                ))}
              </div>
            </div>

            {(selectedSource === 'trainheroic' || selectedSource === 'auto') && (
              <div
                className="wk-raised wk-caption"
                style={{
                  background: 'var(--wk-raised)',
                  border: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <strong style={{ color: 'var(--color-text-primary)' }}>TrainHeroic exports:</strong> Upload the{' '}
                <code>.zip</code> archive from <code>account.trainheroic.com/data-export</code> directly (unpacked privately on this device), or paste your{' '}
                <em>Analytics → Lift History</em> working maxes below.
              </div>
            )}

            {zipArchive ? (
              <div
                className="wk-raised flex items-center justify-between gap-2"
                style={{
                  background: 'var(--wk-raised)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div className="min-w-0">
                  <div className="wk-meta-title truncate">{zipArchive.fileName}</div>
                  {historyParseResult.parsed?.summary.sourceFilesParsed &&
                    historyParseResult.parsed.summary.sourceFilesParsed.length > 0 && (
                      <div className="wk-caption truncate" style={{ color: 'var(--wk-muted)' }}>
                        Unpacked: {historyParseResult.parsed.summary.sourceFilesParsed.join(', ')}
                      </div>
                    )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setZipArchive(null);
                  }}
                  className="wk-btn-secondary shrink-0 px-3"
                >
                  Clear file
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="wk-meta-title">Or paste CSV, TSV, JSON, or lift maxes</span>
                  {!historyCsvText.trim() && (
                    <button
                      type="button"
                      onClick={handleInsertMaxesHeader}
                      className="wk-caption hover:underline"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      Insert 1RM columns
                    </button>
                  )}
                </div>
                <textarea
                  aria-label="Paste TrainHeroic, Hevy, Strong, FitNotes, or lift maxes data"
                  value={historyCsvText}
                  onChange={(e) => {
                    setZipArchive(null);
                    setShowAllMaxes(false);
                    setHistoryCsvText(e.target.value);
                  }}
                  rows={5}
                  placeholder={
                    'Date,Exercise,Best 1RM,Weight,Reps\n— or upload your TrainHeroic .zip / Hevy / Strong / FitNotes CSV above'
                  }
                  className="wk-textarea"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="wk-meta-title">Default weight unit (if file omits kg/lb)</span>
              <div className="wk-segments grid grid-cols-2 shrink-0" role="group" aria-label="CSV default weight unit">
                {(['kg', 'lb'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={historyUnit === u}
                    onClick={() => setHistoryUnit(u)}
                    className={`wk-segment px-3 ${historyUnit === u ? 'is-active' : ''}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center min-h-[44px] gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={halveCombinedTwoHandDumbbells}
                onChange={(e) => setHalveCombinedTwoHandDumbbells(e.target.checked)}
                className="w-5 h-5 accent-[var(--color-accent-primary)]"
              />
              <span className="wk-meta-title">Halve two-hand dumbbell loads (file logs combined pair total)</span>
            </label>

            {(fileError || historyParseResult.error) && (
              <div
                className="wk-raised wk-caption"
                style={{
                  background: 'var(--color-status-danger-soft)',
                  color: 'var(--color-status-danger)',
                }}
              >
                {fileError || historyParseResult.error}
              </div>
            )}

            {historyParseResult.parsed?.summary.combinedDumbbellWarning && !halveCombinedTwoHandDumbbells && (
              <div
                className="wk-raised wk-caption flex flex-col gap-2"
                style={{
                  background: 'var(--color-status-warning-soft)',
                  border: '1px solid var(--color-status-warning)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <div>
                  <strong>Check dumbbell weights:</strong> {historyParseResult.parsed.summary.combinedDumbbellWarning.exerciseName} is logged at{' '}
                  <strong>{units.format(historyParseResult.parsed.summary.combinedDumbbellWarning.exampleWeightKg)}</strong>. Treise stores weight <em>per dumbbell</em> — if your file logs both dumbbells combined, divide by 2.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setHalveCombinedTwoHandDumbbells(true);
                  }}
                  className="wk-btn-secondary wk-meta-title self-start px-3 py-2"
                >
                  Divide two-hand dumbbell loads by 2
                </button>
              </div>
            )}

            {historyParseResult.parsed && (
              <div
                className="wk-raised flex flex-col gap-3"
                style={{
                  background: 'var(--color-bg-canvas)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  <div className="wk-label mb-2" style={{ color: 'var(--color-accent-primary)' }}>
                    {historyParseResult.parsed.summary.formatLabel} export detected ({historyParseResult.parsed.summary.detectedUnit})
                  </div>
                  <ul className="wk-caption flex flex-col gap-1" style={{ color: 'var(--color-text-primary)' }}>
                    <li>
                      <strong>{historyParseResult.parsed.summary.workoutsCount}</strong> workouts ·{' '}
                      <strong>{historyParseResult.parsed.summary.totalSetsCount}</strong> working sets ·{' '}
                      <strong>{historyParseResult.parsed.summary.documentedMaxesCount}</strong> lift maxes
                      {historyParseResult.parsed.summary.testedOneRepMaxCount > 0
                        ? ` (${historyParseResult.parsed.summary.testedOneRepMaxCount} best 1RMs)`
                        : ''}
                    </li>
                    {historyParseResult.parsed.summary.dateRange && (
                      <li>
                        Dates: {historyParseResult.parsed.summary.dateRange[0]} to{' '}
                        {historyParseResult.parsed.summary.dateRange[1]}
                      </li>
                    )}
                    <li style={{ color: 'var(--wk-muted)' }}>
                      {historyParseResult.parsed.summary.matchedExercisesCount} matched to Treise catalog
                      {historyParseResult.parsed.summary.addedExerciseCount > 0
                        ? ` · +${historyParseResult.parsed.summary.addedExerciseCount} added to library`
                        : ''}
                    </li>
                  </ul>
                </div>

                {historyParseResult.parsed.exerciseMaxes.length > 0 && (
                  <div
                    className="pt-3 flex flex-col gap-2"
                    style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="wk-label">Documented exercise maxes</span>
                      {historyParseResult.parsed.exerciseMaxes.length > 6 && (
                        <button
                          type="button"
                          onClick={() => setShowAllMaxes((v) => !v)}
                          className="wk-caption hover:underline"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {showAllMaxes
                            ? 'Show top 6'
                            : `Show all ${historyParseResult.parsed.exerciseMaxes.length}`}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                      {(showAllMaxes
                        ? historyParseResult.parsed.exerciseMaxes
                        : historyParseResult.parsed.exerciseMaxes.slice(0, 6)
                      ).map((mx) => (
                        <div
                          key={mx.exerciseId}
                          className="flex items-baseline justify-between gap-2 py-1"
                          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                        >
                          <div className="wk-caption truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {mx.exerciseName}
                            {mx.isTwoDumbbell ? ' (per DB)' : ''}
                          </div>
                          <div className="wk-caption tabular-nums shrink-0 text-right">
                            {mx.bestOneRepMaxKg !== null && mx.bestOneRepMaxKg > 0 ? (
                              <span style={{ color: 'var(--color-accent-primary)' }}>
                                1RM {units.formatPrecise(mx.bestOneRepMaxKg)}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-text-primary)' }}>
                                {units.formatPrecise(mx.heaviestSetWeightKg)} × {mx.heaviestSetReps}
                              </span>
                            )}
                            {mx.bestOneRepMaxKg !== null &&
                              mx.heaviestSetReps > 1 &&
                              mx.heaviestSetWeightKg > 0 && (
                                <span style={{ color: 'var(--wk-muted)' }}>
                                  {' · '}
                                  {units.formatPrecise(mx.heaviestSetWeightKg)} × {mx.heaviestSetReps}
                                </span>
                              )}
                            {mx.bestEstimated1rmKg > 0 &&
                              (mx.bestOneRepMaxKg === null ||
                                Math.round(mx.bestEstimated1rmKg) > Math.round(mx.bestOneRepMaxKg)) && (
                                <span style={{ color: 'var(--wk-muted)' }}>
                                  {' · est '}
                                  {units.format(mx.bestEstimated1rmKg)}
                                </span>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                }}
                className="wk-btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!historyParseResult.parsed}
                className="wk-button flex-1"
                style={{
                  background: historyParseResult.parsed
                    ? 'var(--color-action-primary-bg)'
                    : 'var(--color-action-disabled-bg)',
                  color: historyParseResult.parsed
                    ? 'var(--color-action-primary-fg)'
                    : 'var(--color-action-disabled-fg)',
                  border: historyParseResult.parsed
                    ? '1px solid transparent'
                    : '1px solid var(--color-border-subtle)',
                }}
              >
                Import history &amp; maxes
              </button>
            </div>
          </>
        ) : (
          <>

        <div>
          <label
            htmlFor="import-program-name"
            className="wk-meta-title block mb-1"
          >
            Program name
          </label>
          <input
            id="import-program-name"
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            placeholder="e.g. Phase 1 BT"
            className="wk-field"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="wk-meta-title">Spreadsheet CSV / TSV</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              fileInputRef.current?.click();
            }}
            className="wk-btn-secondary inline-flex items-center gap-2 px-3"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Choose CSV file
          </button>
        </div>

        <textarea
          aria-label="Paste spreadsheet CSV or TSV data"
          value={sheetText}
          onChange={(e) => setSheetText(e.target.value)}
          rows={5}
          placeholder={'WORKOUT 1: LOWER BODY\nExercise,,Date,Workout,Sets,Reps,Tempo,Rest,Notes,Set 1,...'}
          className="wk-textarea"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
        />

        <div className="flex flex-col gap-2">
          <label className="flex items-center min-h-[44px] gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={importHistory}
              onChange={(e) => setImportHistory(e.target.checked)}
              className="w-5 h-5 accent-[var(--color-accent-primary)]"
            />
            <span className="wk-meta-title">Also import logged sets as historical workouts</span>
          </label>

          {importHistory && (
            <div className="flex flex-col gap-2 pl-5">
              <label className="flex items-center min-h-[44px] gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferHistoricalStartDate}
                  onChange={(e) => setPreferHistoricalStartDate(e.target.checked)}
                  className="w-5 h-5 accent-[var(--color-accent-primary)]"
                />
                <span className="wk-meta-title" style={{ color: 'var(--wk-muted)' }}>
                  Anchor schedule chronologically from start date
                </span>
              </label>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="import-start-date" className="wk-meta-title" style={{ color: 'var(--wk-muted)' }}>
                  Historical start date
                </label>
                <input
                  id="import-start-date"
                  type="date"
                  value={historicalStartDate}
                  onChange={(e) => setHistoricalStartDate(e.target.value)}
                  className="wk-field w-auto"
                />
              </div>
            </div>
          )}

          <label className="flex items-center min-h-[44px] gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={halveCombinedTwoHandDumbbells}
              onChange={(e) => setHalveCombinedTwoHandDumbbells(e.target.checked)}
              className="w-5 h-5 accent-[var(--color-accent-primary)]"
            />
            <span className="wk-meta-title">Halve two-hand dumbbell loads (sheet logs combined pair total)</span>
          </label>

          <label className="flex items-center min-h-[44px] gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activateProgram}
              onChange={(e) => setActivateProgram(e.target.checked)}
              className="w-5 h-5 accent-[var(--color-accent-primary)]"
            />
            <span className="wk-meta-title">Switch to this program after saving</span>
          </label>
        </div>

        {(fileError || parseResult.error) && (
          <div
            className="wk-raised wk-caption"
            style={{
              background: 'var(--color-status-danger-soft)',
              color: 'var(--color-status-danger)',
            }}
          >
            {fileError || parseResult.error}
          </div>
        )}

        {parseResult.parsed?.summary.combinedDumbbellWarning && !halveCombinedTwoHandDumbbells && (
          <div
            className="wk-raised wk-caption flex flex-col gap-2"
            style={{
              background: 'var(--color-status-warning-soft)',
              border: '1px solid var(--color-status-warning)',
              color: 'var(--color-text-primary)',
            }}
          >
            <div>
              <strong>Check dumbbell weights:</strong> {parseResult.parsed.summary.combinedDumbbellWarning.exerciseName} is logged at{' '}
              <strong>{units.format(parseResult.parsed.summary.combinedDumbbellWarning.exampleWeightKg)}</strong>. Treise stores weight <em>per dumbbell</em> — if your sheet logs both dumbbells combined, divide by 2.
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setHalveCombinedTwoHandDumbbells(true);
              }}
              className="wk-btn-secondary wk-meta-title self-start px-3 py-2"
            >
              Divide two-hand dumbbell loads by 2
            </button>
          </div>
        )}

        {parseResult.parsed && (
          <div
            className="wk-raised"
            style={{
              background: 'var(--color-bg-canvas)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              className="wk-label mb-2"
              style={{ color: 'var(--color-accent-primary)' }}
            >
              Ready to import
            </div>
            <ul
              className="wk-caption flex flex-col gap-1"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <li>
                <strong>{parseResult.parsed.summary.templateCount}</strong> workouts across{' '}
                <strong>{parseResult.parsed.summary.phasesCount}</strong>{' '}
                {parseResult.parsed.summary.phasesCount === 1 ? 'phase' : 'phases'} ({parseResult.parsed.summary.weeksCount} weeks)
              </li>
              {importHistory && parseResult.parsed.summary.loggedWorkoutsCount > 0 && (
                <li>
                  <strong>{parseResult.parsed.summary.loggedWorkoutsCount}</strong> completed sessions ·{' '}
                  <strong>{parseResult.parsed.summary.totalSetsCount}</strong> sets ·{' '}
                  <strong>{units.format(parseResult.parsed.summary.totalVolumeKg)}</strong> volume
                </li>
              )}
              {parseResult.parsed.summary.heaviestLiftLabel && (
                <li>Top logged lift: {parseResult.parsed.summary.heaviestLiftLabel}</li>
              )}
              {parseResult.parsed.summary.addedExerciseCount > 0 && (
                <li style={{ color: 'var(--wk-muted)' }}>
                  +{parseResult.parsed.summary.addedExerciseCount} new exercises added to library
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="wk-btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!parseResult.parsed}
            className="wk-button flex-1"
            style={{
              background: parseResult.parsed ? 'var(--color-action-primary-bg)' : 'var(--color-action-disabled-bg)',
              color: parseResult.parsed ? 'var(--color-action-primary-fg)' : 'var(--color-action-disabled-fg)',
              border: parseResult.parsed ? '1px solid transparent' : '1px solid var(--color-border-subtle)',
            }}
          >
            Save program
          </button>
        </div>
          </>
        )}
      </form>
    </div>,
    document.body
  );
};
