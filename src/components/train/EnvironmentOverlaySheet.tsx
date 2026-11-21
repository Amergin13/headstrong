import React, { useState } from 'react';
import { X, MapPin, Dumbbell, Footprints, Clock, Home, Lock, Check, Sparkles } from 'lucide-react';
import {
  EnvironmentOverlay,
  EnvironmentProfileType,
  HomeEquipmentTag,
  OverlayScope,
} from '../../engine/types';
import {
  computeOverlayExpiryMs,
  createPresetOverlay,
  resolveActiveOverlay,
} from '../../engine/continuityEngine';
import { parseEnvironmentConstraintLocally } from '../../services/environmentOverlayParser';
import { localDateString } from '../../utils/date';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

interface EnvironmentOverlaySheetProps {
  activeOverlay?: EnvironmentOverlay | null;
  currentWeekNumber?: number;
  homeEquipment?: HomeEquipmentTag[];
  onApplyOverlay: (overlay: EnvironmentOverlay | null) => void;
  onClose: () => void;
}

const PRESET_OPTIONS: {
  type: EnvironmentProfileType;
  title: string;
  subtitle: string;
  icon: 'gym' | 'hotel' | 'bw' | 'time' | 'home';
}[] = [
  {
    type: 'HOME_GYM',
    title: 'Home Gym',
    subtitle: 'Full master program — barbell, dumbbells, cables & machines',
    icon: 'gym',
  },
  {
    type: 'HOTEL_DUMBBELLS',
    title: 'Hotel / Dumbbells Only',
    subtitle: 'Swaps barbell lifts to dumbbells with anchor-derived starting weights',
    icon: 'hotel',
  },
  {
    type: 'BODYWEIGHT',
    title: 'Bodyweight / No Equipment',
    subtitle: 'Picks matching leverage tier and tightens effort to 0–1 RIR',
    icon: 'bw',
  },
  {
    type: 'TIME_CONSTRAINED',
    title: 'Short on time',
    subtitle: 'Keeps core movement slots and trims working sets for ~30 min',
    icon: 'time',
  },
  {
    type: 'CUSTOM',
    title: 'At Home',
    subtitle: 'Adapts to your saved home equipment setup',
    icon: 'home',
  },
];

const DB_CAP_PRESETS_KG: Array<{ label: string; value: number | null }> = [
  { label: 'No cap', value: null },
  { label: '26', value: 26 },
  { label: '30', value: 30 },
  { label: '36', value: 36 },
];

export const EnvironmentOverlaySheet: React.FC<EnvironmentOverlaySheetProps> = ({
  activeOverlay,
  currentWeekNumber = 1,
  homeEquipment = ['bench', 'dumbbells', 'trx', 'pullup_bar'],
  onApplyOverlay,
  onClose,
}) => {
  const units = useUnits();
  const resolved = resolveActiveOverlay(activeOverlay);
  const initialType: EnvironmentProfileType = resolved.active?.activeProfileType ?? 'HOME_GYM';
  const [selectedType, setSelectedType] = useState<EnvironmentProfileType>(initialType);
  const [scope, setScope] = useState<OverlayScope>(resolved.active?.scope ?? 'WEEK_OVERRIDE');
  const [maxDumbbellKg, setMaxDumbbellKg] = useState<number | null>(
    resolved.active?.maxDumbbellKg ?? null
  );
  const [customUntilDate, setCustomUntilDate] = useState<string>(() => {
    if (resolved.active?.expiresAtEpochMs) {
      return localDateString(new Date(resolved.active.expiresAtEpochMs));
    }
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return localDateString(d);
  });
  const [freeText, setFreeText] = useState<string>(resolved.active?.sourcePrompt ?? '');
  const [isParsing, setIsParsing] = useState(false);

  const renderIcon = (kind: (typeof PRESET_OPTIONS)[number]['icon'], active: boolean) => {
    const color = active ? 'var(--wk-accent)' : 'var(--color-text-secondary)';
    if (kind === 'gym') return <MapPin className="w-4 h-4 shrink-0" style={{ color }} strokeWidth={2} aria-hidden="true" />;
    if (kind === 'hotel') return <Dumbbell className="w-4 h-4 shrink-0" style={{ color }} strokeWidth={2} aria-hidden="true" />;
    if (kind === 'bw') return <Footprints className="w-4 h-4 shrink-0" style={{ color }} strokeWidth={2} aria-hidden="true" />;
    if (kind === 'time') return <Clock className="w-4 h-4 shrink-0" style={{ color }} strokeWidth={2} aria-hidden="true" />;
    return <Home className="w-4 h-4 shrink-0" style={{ color }} strokeWidth={2} aria-hidden="true" />;
  };

  const handleApplyFreeText = async () => {
    if (!freeText.trim()) return;
    triggerHaptic('medium');
    setIsParsing(true);
    try {
      const parsed = await parseEnvironmentConstraintLocally(freeText.trim(), {
        defaultScope: scope,
      });
      onApplyOverlay(parsed.activeProfileType === 'HOME_GYM' ? null : parsed);
      onClose();
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = async () => {
    triggerHaptic('medium');
    if (freeText.trim().length > 0 && freeText.trim() !== (resolved.active?.sourcePrompt ?? '')) {
      await handleApplyFreeText();
      return;
    }

    if (selectedType === 'HOME_GYM') {
      onApplyOverlay(null);
      onClose();
      return;
    }

    const customEpoch =
      scope === 'CUSTOM_UNTIL_DATE' && customUntilDate
        ? new Date(`${customUntilDate}T23:59:59`).getTime()
        : null;
    const expiresAtEpochMs = computeOverlayExpiryMs(scope, Date.now(), customEpoch);
    const nextOverlay = createPresetOverlay(selectedType, scope, {
      maxDumbbellKg: selectedType === 'HOTEL_DUMBBELLS' ? maxDumbbellKg : null,
      expiresAtEpochMs,
      homeEquipment,
    });
    onApplyOverlay(nextOverlay);
    onClose();
  };

  const ctaLabel =
    selectedType === 'HOME_GYM' && !freeText.trim()
      ? 'Return to Home Gym'
      : scope === 'TODAY_ONLY'
      ? "Adapt Today's Workout"
      : "Adapt This Week's Plan";

  const expiryPreview = resolved.active?.expiresAtEpochMs
    ? `Auto-reverts ${localDateString(new Date(resolved.active.expiresAtEpochMs))}`
    : 'Master program active';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'var(--color-bg-overlay)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Training environment"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="wk w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 pb-6 border max-h-[90vh] overflow-y-auto flex flex-col gap-4"
        style={{
          background: 'var(--wk-card)',
          borderColor: 'var(--color-border-subtle)',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="wk-title">Training environment</h2>
            <p className="wk-caption mt-1">
              Temporary switch · {expiryPreview}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close environment selector"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border border-[var(--color-border-strong)] flex items-center justify-center shrink-0"
            style={{ background: 'var(--wk-raised)', color: 'var(--color-text-secondary)' }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* 1-Tap Presets */}
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Environment presets">
          {PRESET_OPTIONS.map((opt) => {
            const isSelected = selectedType === opt.type && !freeText.trim();
            return (
              <button
                key={opt.type}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedType(opt.type);
                  setFreeText('');
                }}
                className="w-full text-left p-3 rounded-2xl border min-h-[44px] flex items-start justify-between gap-3 transition-colors"
                style={{
                  background: isSelected ? 'var(--color-status-positive-soft)' : 'var(--wk-raised)',
                  borderColor: isSelected ? 'var(--wk-accent)' : 'var(--color-border-subtle)',
                }}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-1">{renderIcon(opt.icon, isSelected)}</div>
                  <div className="min-w-0">
                    <span className="wk-subhead block">{opt.title}</span>
                    <span className="wk-caption block mt-1">{opt.subtitle}</span>
                  </div>
                </div>
                {isSelected && (
                  <Check
                    className="w-4 h-4 shrink-0 mt-1"
                    style={{ color: 'var(--wk-accent)' }}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Optional Max Dumbbell Cap when Hotel / Dumbbells Only is chosen */}
        {selectedType === 'HOTEL_DUMBBELLS' && !freeText.trim() && (
          <div className="flex flex-col gap-2">
            <span className="wk-label">Heaviest dumbbell available</span>
            <div className="grid grid-cols-4 gap-2">
              {DB_CAP_PRESETS_KG.map((cap) => {
                const active = maxDumbbellKg === cap.value;
                const display =
                  cap.value == null ? 'No cap' : `≤${units.format(cap.value)}`;
                return (
                  <button
                    key={cap.label}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setMaxDumbbellKg(cap.value);
                    }}
                    aria-pressed={active}
                    className="rounded-xl border min-h-[44px] px-2 wk-caption font-medium transition-colors"
                    style={{
                      background: active ? 'var(--color-status-positive-soft)' : 'var(--wk-raised)',
                      borderColor: active ? 'var(--wk-accent)' : 'var(--color-border-subtle)',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {display}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* On-device private free-text constraint parser */}
        <div
          className="rounded-2xl p-3 border flex flex-col gap-2"
          style={{ background: 'var(--wk-raised)', borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="env-constraint-input" className="wk-label flex items-center gap-2">
              <Sparkles className="w-3 h-3" style={{ color: 'var(--color-coach-accent)' }} aria-hidden="true" />
              <span>Describe your setup</span>
            </label>
            <span className="wk-caption flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
              <Lock className="w-3 h-3" aria-hidden="true" />
              <span>Private · stays on this phone</span>
            </span>
          </div>
          <textarea
            id="env-constraint-input"
            rows={2}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="e.g., Hotel dumbbells only up to 30 kg for the next 5 days"
            className="wk-textarea resize-none"
          />
        </div>

        {/* Scope Selector (always temporary by default) */}
        {(selectedType !== 'HOME_GYM' || freeText.trim().length > 0) && (
          <div className="flex flex-col gap-2">
            <span className="wk-label">How long?</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'TODAY_ONLY' as OverlayScope, label: 'Today only' },
                  { id: 'WEEK_OVERRIDE' as OverlayScope, label: `All Week ${currentWeekNumber}` },
                  { id: 'CUSTOM_UNTIL_DATE' as OverlayScope, label: 'Until date' },
                ] as const
              ).map((item) => {
                const active = scope === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      triggerHaptic('light');
                      setScope(item.id);
                    }}
                    className="rounded-xl border min-h-[44px] px-2 wk-caption font-medium transition-colors"
                    style={{
                      background: active ? 'var(--color-status-positive-soft)' : 'var(--wk-raised)',
                      borderColor: active ? 'var(--wk-accent)' : 'var(--color-border-subtle)',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {scope === 'CUSTOM_UNTIL_DATE' && (
              <input
                type="date"
                value={customUntilDate}
                min={localDateString()}
                onChange={(e) => setCustomUntilDate(e.target.value)}
                aria-label="Auto-revert date"
                className="wk-input w-full text-left px-3"
              />
            )}
            <p className="wk-caption">
              Your master program stays untouched and restores automatically when this expires.
            </p>
          </div>
        )}

        {/* Primary CTA */}
        <button
          type="button"
          disabled={isParsing}
          onClick={() => {
            void handleConfirm();
          }}
          className="w-full rounded-xl min-h-[44px] px-4 py-3 text-base font-semibold transition-transform active:scale-[0.98]"
          style={{
            background: 'var(--color-action-primary-bg)',
            color: 'var(--color-action-primary-fg)',
          }}
        >
          {isParsing ? 'Adapting…' : ctaLabel}
        </button>
      </div>
    </div>
  );
};
