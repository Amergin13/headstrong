import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { ExerciseDefinition } from '../../engine/types';
import {
  ParsedProgramImport,
  parseProgramSpreadsheet,
} from '../../services/spreadsheetProgramImport';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

interface ImportProgramModalProps {
  exerciseCatalog: ExerciseDefinition[];
  onImport: (parsed: ParsedProgramImport, opts: { activateProgram: boolean; importHistory: boolean }) => void;
  onClose: () => void;
}

/** Modal allowing athletes to upload a CSV/TSV file or paste spreadsheet cells to save a new program and optional workout history. */
export const ImportProgramModal: React.FC<ImportProgramModalProps> = ({
  exerciseCatalog,
  onImport,
  onClose,
}) => {
  const units = useUnits();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [programName, setProgramName] = useState('Phase 1 BT');
  const [sheetText, setSheetText] = useState('');
  const [importHistory, setImportHistory] = useState(true);
  const [doubleTwoHandDumbbells, setDoubleTwoHandDumbbells] = useState(true);
  const [activateProgram, setActivateProgram] = useState(true);
  const [preferHistoricalStartDate, setPreferHistoricalStartDate] = useState(true);
  const [historicalStartDate, setHistoricalStartDate] = useState('2017-01-09');
  const [fileError, setFileError] = useState<string | null>(null);

  const parseResult = useMemo<{ parsed?: ParsedProgramImport; error?: string }>(() => {
    if (!sheetText.trim()) return {};
    try {
      const parsed = parseProgramSpreadsheet(sheetText, {
        programName: programName.trim() || 'Imported Program',
        exerciseCatalog,
        importHistory,
        historicalStartDate,
        preferHistoricalStartDate,
        doubleTwoHandDumbbells,
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
    doubleTwoHandDumbbells,
  ]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    try {
      const content = await file.text();
      setSheetText(content);
      const baseName = file.name.replace(/\.(csv|tsv|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
      if (baseName) setProgramName(baseName);
    } catch {
      setFileError('Could not read the selected file.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parseResult.parsed) return;
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
      className="wk fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
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
                Import spreadsheet program
              </h3>
              <p className="wk-body mt-1">
                Upload a CSV / TSV export or paste your sheet. Treise builds your workout schedule and imports logged sets into your lifetime stats.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close spreadsheet importer"
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
              checked={doubleTwoHandDumbbells}
              onChange={(e) => setDoubleTwoHandDumbbells(e.target.checked)}
              className="w-5 h-5 accent-[var(--color-accent-primary)]"
            />
            <span style={labelStyle}>Double two-hand dumbbell loads (sheet logs per dumbbell)</span>
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
      </form>
    </div>,
    document.body
  );
};
