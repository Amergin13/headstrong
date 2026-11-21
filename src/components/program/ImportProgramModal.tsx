import React, { useMemo, useRef, useState } from 'react';
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
} from '../../services/competitorCsvImport';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

export type ImportModalMode = 'history' | 'spreadsheet';

interface ImportProgramModalProps {
  exerciseCatalog: ExerciseDefinition[];
  initialMode?: ImportModalMode;
  onImport?: (parsed: ParsedProgramImport, opts: { activateProgram: boolean; importHistory: boolean }) => void;
  onImportHistory?: (parsed: CompetitorCsvImportResult) => void;
  onClose: () => void;
}

const COMPETITOR_SOURCES: ReadonlyArray<{ id: CompetitorAppFormat; label: string; hint: string }> = [
  { id: 'hevy', label: 'Hevy CSV', hint: 'Export from Hevy → Settings → Export Data' },
  { id: 'strong', label: 'Strong CSV', hint: 'Export from Strong → Settings → Export Strong Data' },
  { id: 'fitnotes', label: 'FitNotes CSV', hint: 'Export from FitNotes → Settings → Spreadsheet Export' },
];

/** Modal allowing athletes to 1-click import workout history from Hevy, Strong, or FitNotes CSV, or import a spreadsheet program. */
export const ImportProgramModal: React.FC<ImportProgramModalProps> = ({
  exerciseCatalog,
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
  const [historyUnit, setHistoryUnit] = useState<'kg' | 'lb'>(units.unit);
  const [programName, setProgramName] = useState('Phase 1 BT');
  const [sheetText, setSheetText] = useState('');
  const [importHistory, setImportHistory] = useState(true);
  const [halveCombinedTwoHandDumbbells, setHalveCombinedTwoHandDumbbells] = useState(false);
  const [activateProgram, setActivateProgram] = useState(true);
  const [preferHistoricalStartDate, setPreferHistoricalStartDate] = useState(true);
  const [historicalStartDate, setHistoricalStartDate] = useState('2017-01-09');
  const [fileError, setFileError] = useState<string | null>(null);

  const historyParseResult = useMemo<{ parsed?: CompetitorCsvImportResult; error?: string }>(() => {
    if (!historyCsvText.trim()) return {};
    try {
      const detected = detectCompetitorCsvFormat(historyCsvText);
      const parsed = parseCompetitorCsv(historyCsvText, {
        format: detected ?? (selectedSource === 'auto' ? undefined : selectedSource),
        exerciseCatalog,
        defaultWeightUnit: historyUnit,
        halveCombinedTwoHandDumbbells,
      });
      return { parsed };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unable to parse workout CSV.' };
    }
  }, [historyCsvText, selectedSource, exerciseCatalog, historyUnit, halveCombinedTwoHandDumbbells]);

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
      const content = await file.text();
      // Auto-route Hevy, Strong, and FitNotes exports straight into the history importer when available.
      const detectedCompetitor = detectCompetitorCsvFormat(content);
      if (detectedCompetitor && canHistory) {
        setSelectedSource(detectedCompetitor);
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
    try {
      const content = await file.text();
      setHistoryCsvText(content);
      const detected = detectCompetitorCsvFormat(content);
      if (detected) setSelectedSource(detected);
    } catch {
      setFileError('Could not read the selected CSV file.');
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

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
    lineHeight: '16px',
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-canvas)',
    border: '1px solid var(--color-border-strong)',
    color: 'var(--color-text-primary)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 16,
    width: '100%',
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import program from spreadsheet"
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
              <h3 className="wk-h1 leading-tight">
                {mode === 'history' ? 'Import workout history' : 'Import spreadsheet program'}
              </h3>
              <p className="wk-body mt-1">
                {mode === 'history'
                  ? 'Bring your history from Hevy, Strong, or FitNotes on Day 1. Treise converts weights to kg and matches exercises automatically.'
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
              Hevy / Strong / FitNotes
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
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleHistoryFileChange}
              className="hidden"
              aria-label="Choose Hevy, Strong, or FitNotes CSV file"
            />
            <div className="flex flex-col gap-2">
              <span style={labelStyle}>1-click CSV import</span>
              <div className="grid grid-cols-3 gap-2">
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

            <textarea
              aria-label="Paste Hevy, Strong, or FitNotes CSV data"
              value={historyCsvText}
              onChange={(e) => setHistoryCsvText(e.target.value)}
              rows={5}
              placeholder={'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,...\nor choose a Hevy, Strong, or FitNotes CSV above'}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
            />

            <div className="flex items-center justify-between gap-2">
              <span style={labelStyle}>Default weight unit (if CSV omits kg/lb)</span>
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
              <span style={labelStyle}>Halve two-hand dumbbell loads (CSV logs combined pair total)</span>
            </label>

            {(fileError || historyParseResult.error) && (
              <div
                className="rounded-lg p-3 text-xs"
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
                className="rounded-xl p-3 flex flex-col gap-2 text-xs"
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
                  className="wk-btn-secondary self-start text-xs px-3 py-2"
                >
                  Divide two-hand dumbbell loads by 2
                </button>
              </div>
            )}

            {historyParseResult.parsed && (
              <div
                className="rounded-xl p-3"
                style={{
                  background: 'var(--color-bg-canvas)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div className="wk-label mb-2" style={{ color: 'var(--color-accent-primary)' }}>
                  {historyParseResult.parsed.summary.formatLabel} export detected ({historyParseResult.parsed.summary.detectedUnit})
                </div>
                <ul className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-primary)' }}>
                  <li>
                    <strong>{historyParseResult.parsed.summary.workoutsCount}</strong> workouts ·{' '}
                    <strong>{historyParseResult.parsed.summary.totalSetsCount}</strong> working sets ·{' '}
                    <strong>{units.format(historyParseResult.parsed.summary.totalVolumeKg)}</strong> volume
                  </li>
                  {historyParseResult.parsed.summary.dateRange && (
                    <li>
                      Dates: {historyParseResult.parsed.summary.dateRange[0]} to{' '}
                      {historyParseResult.parsed.summary.dateRange[1]}
                    </li>
                  )}
                  {historyParseResult.parsed.summary.heaviestLiftLabel && (
                    <li>Top logged set: {historyParseResult.parsed.summary.heaviestLiftLabel}</li>
                  )}
                  <li style={{ color: 'var(--wk-muted)' }}>
                    {historyParseResult.parsed.summary.matchedExercisesCount} matched to Treise catalog
                    {historyParseResult.parsed.summary.addedExerciseCount > 0
                      ? ` · +${historyParseResult.parsed.summary.addedExerciseCount} added to library`
                      : ''}
                  </li>
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
                Import history
              </button>
            </div>
          </>
        ) : (
          <>

        <div>
          <label
            htmlFor="import-program-name"
            className="block mb-1"
            style={labelStyle}
          >
            Program name
          </label>
          <input
            id="import-program-name"
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            placeholder="e.g. Phase 1 BT"
            style={inputStyle}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span style={labelStyle}>Spreadsheet CSV / TSV</span>
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
          style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
        />

        <div className="flex flex-col gap-2">
          <label className="flex items-center min-h-[44px] gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={importHistory}
              onChange={(e) => setImportHistory(e.target.checked)}
              className="w-5 h-5 accent-[var(--color-accent-primary)]"
            />
            <span style={labelStyle}>Also import logged sets as historical workouts</span>
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
                <span style={{ ...labelStyle, color: 'var(--wk-muted)' }}>
                  Anchor schedule chronologically from start date
                </span>
              </label>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="import-start-date" style={{ ...labelStyle, color: 'var(--wk-muted)' }}>
                  Historical start date
                </label>
                <input
                  id="import-start-date"
                  type="date"
                  value={historicalStartDate}
                  onChange={(e) => setHistoricalStartDate(e.target.value)}
                  style={{ ...inputStyle, width: 'auto' }}
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
            <span style={labelStyle}>Halve two-hand dumbbell loads (sheet logs combined pair total)</span>
          </label>

          <label className="flex items-center min-h-[44px] gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activateProgram}
              onChange={(e) => setActivateProgram(e.target.checked)}
              className="w-5 h-5 accent-[var(--color-accent-primary)]"
            />
            <span style={labelStyle}>Switch to this program after saving</span>
          </label>
        </div>

        {(fileError || parseResult.error) && (
          <div
            className="rounded-lg p-3 text-xs"
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
            className="rounded-xl p-3 flex flex-col gap-2 text-xs"
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
              className="wk-btn-secondary self-start text-xs px-3 py-2"
            >
              Divide two-hand dumbbell loads by 2
            </button>
          </div>
        )}

        {parseResult.parsed && (
          <div
            className="rounded-xl p-3"
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
              className="flex flex-col gap-1 text-xs"
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
