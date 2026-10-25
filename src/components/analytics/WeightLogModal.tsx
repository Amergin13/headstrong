import React, { useEffect, useRef, useState } from 'react';
import { X, Ruler, Check, Bluetooth, Scale, ChevronDown, ChevronUp } from 'lucide-react';
import { BodyMeasurementSite } from '../../engine/types';
import {
  BODY_MEASUREMENT_SITES,
  connectRenphoScale,
  connectRenphoTape,
  isWebBluetoothSupported,
  RenphoBleConnection,
  RenphoScaleReading,
  RenphoTapeReading,
} from '../../services/renphoBluetooth';
import { useUnits } from '../../utils/unitsContext';

export interface MeasurementEntry {
  bodyweightKg?: number;
  bodyFatPct?: number;
  waistCm?: number;
  chestCm?: number;
  shouldersCm?: number;
  armCm?: number;
  forearmCm?: number;
  neckCm?: number;
  hipsCm?: number;
  thighCm?: number;
  calfCm?: number;
  heightCm?: number;
}

interface WeightLogModalProps {
  currentWeight: number;
  currentEma: number;
  /** Height the athlete already entered (asked once). */
  heightCm?: number;
  onSave: (entry: MeasurementEntry) => void;
  onClose: () => void;
}

const CM_PER_IN = 2.54;

/** Logs today's weight, body fat, multi-site tape circumferences (cm/in), and connects to RENPHO Bluetooth scales & smart tapes. */
export const WeightLogModal: React.FC<WeightLogModalProps> = ({
  currentWeight,
  currentEma,
  heightCm,
  onSave,
  onClose,
}) => {
  const units = useUnits();
  const imperial = units.unit === 'lb';
  const lengthUnit = imperial ? 'in' : 'cm';
  const toCm = (v: number) => (imperial ? v * CM_PER_IN : v);
  const fromCmToDisplay = (cm: number) =>
    Math.round((imperial ? cm / CM_PER_IN : cm) * 10) / 10;

  const hasPrevious = currentWeight > 0;
  const [weightInput, setWeightInput] = useState(
    hasPrevious ? `${units.toDisplay(currentWeight)}` : ''
  );
  const [bodyFat, setBodyFat] = useState('');
  const [siteValues, setSiteValues] = useState<Record<BodyMeasurementSite, string>>({
    waist: '',
    chest: '',
    arm: '',
    shoulders: '',
    hips: '',
    thigh: '',
    calf: '',
    forearm: '',
    neck: '',
  });
  const [height, setHeight] = useState('');
  const [showAllSites, setShowAllSites] = useState(false);

  // RENPHO Bluetooth state
  const [activeSite, setActiveSite] = useState<BodyMeasurementSite>('waist');
  const [acceptAllBleDevices, setAcceptAllBleDevices] = useState(false);
  const [bleDeviceKind, setBleDeviceKind] = useState<'scale' | 'tape' | null>(null);
  const [bleDeviceName, setBleDeviceName] = useState<string | null>(null);
  const [bleStatus, setBleStatus] = useState<string | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);
  const [liveScaleReading, setLiveScaleReading] = useState<RenphoScaleReading | null>(null);
  const [liveTapeReading, setLiveTapeReading] = useState<RenphoTapeReading | null>(null);

  const bleConnectionRef = useRef<RenphoBleConnection | null>(null);
  const activeSiteRef = useRef<BodyMeasurementSite>(activeSite);
  activeSiteRef.current = activeSite;

  useEffect(() => {
    return () => {
      bleConnectionRef.current?.disconnect();
      bleConnectionRef.current = null;
    };
  }, []);

  const setSiteValue = (site: BodyMeasurementSite, val: string) => {
    setSiteValues((prev) => ({ ...prev, [site]: val }));
  };

  const applyTapeReadingToSite = (lengthCm: number, targetSite: BodyMeasurementSite, advance = false) => {
    const displayVal = fromCmToDisplay(lengthCm);
    setSiteValue(targetSite, `${displayVal}`);
    const siteMeta = BODY_MEASUREMENT_SITES.find((s) => s.id === targetSite);
    if (siteMeta && !siteMeta.primary) {
      setShowAllSites(true);
    }
    if (advance) {
      const idx = BODY_MEASUREMENT_SITES.findIndex((s) => s.id === targetSite);
      if (idx >= 0 && idx + 1 < BODY_MEASUREMENT_SITES.length) {
        const nextSite = BODY_MEASUREMENT_SITES[idx + 1];
        setActiveSite(nextSite.id);
        if (!nextSite.primary) setShowAllSites(true);
      }
    }
  };

  const disconnectBle = () => {
    bleConnectionRef.current?.disconnect();
    bleConnectionRef.current = null;
    setBleDeviceKind(null);
    setBleDeviceName(null);
    setBleStatus(null);
  };

  const handleConnectScale = async () => {
    setBleError(null);
    disconnectBle();
    try {
      const conn = await connectRenphoScale(
        {
          onStatus: (msg) => setBleStatus(msg),
          onReading: (reading) => {
            setLiveScaleReading(reading);
            if (reading.weightKg > 0) {
              const displayWeight =
                Math.round(
                  (imperial ? reading.weightKg * 2.2046226218 : reading.weightKg) * 10
                ) / 10;
              setWeightInput(`${displayWeight}`);
            }
            if (reading.bodyFatPct && reading.bodyFatPct > 0) {
              setBodyFat(`${reading.bodyFatPct}`);
            }
            setBleStatus(
              reading.stabilized
                ? `Locked weight from scale (${units.format(reading.weightKg)}).`
                : 'Measuring weight on scale… Hold still until it locks.'
            );
          },
          onDisconnect: () => {
            setBleDeviceKind(null);
            setBleDeviceName(null);
            setBleStatus('Scale disconnected.');
          },
        },
        { acceptAllDevices: acceptAllBleDevices, unit: units.unit }
      );
      bleConnectionRef.current = conn;
      setBleDeviceKind('scale');
      setBleDeviceName(conn.deviceName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not connect to RENPHO scale.';
      if (!/cancelled|canceled|User cancelled/i.test(msg)) {
        setBleError(msg);
      } else {
        setBleStatus(null);
      }
    }
  };

  const handleConnectTape = async () => {
    setBleError(null);
    disconnectBle();
    try {
      const conn = await connectRenphoTape(
        {
          onStatus: (msg) => setBleStatus(msg),
          onReading: (reading) => {
            setLiveTapeReading(reading);
            const currentTarget = activeSiteRef.current;
            const targetDef =
              BODY_MEASUREMENT_SITES.find((s) => s.id === currentTarget) ??
              BODY_MEASUREMENT_SITES[0];
            if (reading.stabilized) {
              applyTapeReadingToSite(reading.lengthCm, currentTarget, true);
              setBleStatus(
                `Saved ${fromCmToDisplay(reading.lengthCm)} ${lengthUnit} to ${targetDef.label}. Ready for next area.`
              );
            } else {
              setBleStatus(
                `Live tape reading for ${targetDef.label}. Press the confirm button on the tape to lock.`
              );
            }
          },
          onDisconnect: () => {
            setBleDeviceKind(null);
            setBleDeviceName(null);
            setBleStatus('Smart tape disconnected.');
          },
        },
        { acceptAllDevices: acceptAllBleDevices }
      );
      bleConnectionRef.current = conn;
      setBleDeviceKind('tape');
      setBleDeviceName(conn.deviceName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not connect to RENPHO smart tape.';
      if (!/cancelled|canceled|User cancelled/i.test(msg)) {
        setBleError(msg);
      } else {
        setBleStatus(null);
      }
    }
  };

  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const weightKg = num(weightInput) ? units.fromDisplay(num(weightInput)) : 0;
  const weightValid = weightKg === 0 || (weightKg > 30 && weightKg < 300);
  const bfValid = !bodyFat || (num(bodyFat) >= 3 && num(bodyFat) <= 60);
  const lengthValid = (s: string, min: number, max: number) =>
    !s || (toCm(num(s)) >= min && toCm(num(s)) <= max);

  const allSitesValid = BODY_MEASUREMENT_SITES.every((site) =>
    lengthValid(siteValues[site.id], site.minCm, site.maxCm)
  );
  const hasAnySiteValue = BODY_MEASUREMENT_SITES.some((site) => num(siteValues[site.id]) > 0);

  const valid =
    weightValid &&
    bfValid &&
    allSitesValid &&
    lengthValid(height, 120, 230) &&
    (weightKg > 0 || num(bodyFat) > 0 || hasAnySiteValue || num(height) > 0);
  const previewEmaKg =
    currentEma > 0 && hasPrevious && weightKg > 0
      ? weightKg * 0.25 + currentEma * 0.75
      : weightKg;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const round = (v: number) => Math.round(v * 10) / 10;
    const sitePayload: Partial<MeasurementEntry> = {};
    for (const site of BODY_MEASUREMENT_SITES) {
      const val = num(siteValues[site.id]);
      if (val > 0) {
        sitePayload[site.field] = round(toCm(val));
      }
    }
    disconnectBle();
    onSave({
      bodyweightKg: weightKg > 0 ? Math.round(weightKg * 100) / 100 : undefined,
      bodyFatPct: num(bodyFat) ? round(num(bodyFat)) : undefined,
      ...sitePayload,
      heightCm: num(height) ? round(toCm(num(height))) : undefined,
    });
    onClose();
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    unit: string,
    hint?: string,
    ok = true
  ) => (
    <label className="block">
      <span className="wk-label">{label}</span>
      {hint && <span className="block wk-caption mt-0.5">{hint}</span>}
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-label={`${label} in ${unit}`}
          aria-invalid={!ok}
          className={`wk-field w-full py-2.5 px-3 pr-12 font-bold text-base focus:outline-none ${
            ok ? '' : 'ring-1 ring-rose-400'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAABAD] text-sm font-semibold">
          {unit}
        </span>
      </div>
    </label>
  );

  const primarySites = BODY_MEASUREMENT_SITES.filter((s) => s.primary);
  const secondarySites = BODY_MEASUREMENT_SITES.filter((s) => !s.primary);
  const activeSiteDef =
    BODY_MEASUREMENT_SITES.find((s) => s.id === activeSite) ?? BODY_MEASUREMENT_SITES[0];
  const bluetoothAvailable = isWebBluetoothSupported();

  return (
    <div className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="wk-card w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-[#00F19F] stroke-[2]" />
            <h3 className="wk-h1 text-white">Log measurements</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              disconnectBle();
              onClose();
            }}
            aria-label="Close measurements"
            className="w-11 h-11 rounded-full bg-[#3B4044] hover:bg-[#474D50] flex items-center justify-center text-[#C6C6C6] hover:text-white"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* RENPHO Bluetooth Scale & Smart Tape Direct Integration */}
        <div
          className="rounded-2xl p-3.5 space-y-3"
          style={{ background: 'var(--wk-surface)', border: '1px solid var(--wk-line)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-[#00F19F] stroke-[2]" />
              <span className="wk-label text-white">RENPHO Bluetooth Scale & Smart Tape</span>
            </div>
            {bleDeviceName && (
              <button
                type="button"
                onClick={disconnectBle}
                className="text-xs font-semibold text-[#AAABAD] hover:text-white underline"
              >
                Disconnect
              </button>
            )}
          </div>
          <p className="wk-caption">
            Pair directly with your RENPHO scale or smart body tape measure over Bluetooth to fill
            in weight ({units.unit}) and body circumferences ({lengthUnit}) automatically.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleConnectScale}
              aria-label="Connect RENPHO Scale"
              className="wk-button text-xs py-2.5 px-3 gap-1.5"
              style={{
                background: bleDeviceKind === 'scale' ? 'var(--wk-accent)' : 'var(--wk-raised)',
                color: bleDeviceKind === 'scale' ? '#13181C' : '#fff',
              }}
            >
              <Scale className="w-4 h-4 stroke-[2]" />
              <span>{bleDeviceKind === 'scale' ? 'Scale Connected' : 'RENPHO Scale'}</span>
            </button>
            <button
              type="button"
              onClick={handleConnectTape}
              aria-label="Connect RENPHO Smart Tape"
              className="wk-button text-xs py-2.5 px-3 gap-1.5"
              style={{
                background: bleDeviceKind === 'tape' ? 'var(--wk-accent)' : 'var(--wk-raised)',
                color: bleDeviceKind === 'tape' ? '#13181C' : '#fff',
              }}
            >
              <Ruler className="w-4 h-4 stroke-[2]" />
              <span>{bleDeviceKind === 'tape' ? 'Tape Connected' : 'RENPHO Tape'}</span>
            </button>
          </div>

          {/* Target body site selector for Smart Tape */}
          <div className="space-y-1.5 pt-1">
            <span className="block wk-caption text-white font-semibold">
              Smart tape target area ({lengthUnit}):
            </span>
            <div
              role="group"
              aria-label="Body measurement area for smart tape"
              className="flex flex-wrap gap-1.5"
            >
              {BODY_MEASUREMENT_SITES.map((site) => {
                const isSelected = activeSite === site.id;
                const hasVal = num(siteValues[site.id]) > 0;
                return (
                  <button
                    key={site.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setActiveSite(site.id);
                      if (!site.primary) setShowAllSites(true);
                    }}
                    className="px-2.5 py-1.5 rounded-full text-xs font-bold transition-colors"
                    style={{
                      background: isSelected
                        ? 'var(--wk-accent)'
                        : hasVal
                        ? 'var(--wk-pill)'
                        : 'var(--wk-raised)',
                      color: isSelected ? '#13181C' : '#fff',
                    }}
                  >
                    {site.shortLabel}
                    {hasVal ? ` · ${siteValues[site.id]}${lengthUnit}` : ''}
                  </button>
                );
              })}
            </div>
            <p className="wk-caption">
              Measuring <strong className="text-white">{activeSiteDef.label}</strong>:{' '}
              {activeSiteDef.hint}.
            </p>
          </div>

          {liveScaleReading && bleDeviceKind === 'scale' && (
            <div
              className="rounded-xl p-2.5 flex items-center justify-between"
              style={{ background: 'var(--wk-raised)' }}
            >
              <div>
                <span className="block text-xs text-[#AAABAD]">
                  {liveScaleReading.stabilized ? 'Locked scale weight' : 'Live scale reading'}
                </span>
                <span className="text-base font-bold text-white">
                  {units.format(liveScaleReading.weightKg)}
                  {liveScaleReading.bodyFatPct ? ` · ${liveScaleReading.bodyFatPct}% BF` : ''}
                </span>
              </div>
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: liveScaleReading.stabilized ? 'var(--wk-accent)' : 'var(--wk-pill)',
                  color: liveScaleReading.stabilized ? '#13181C' : '#fff',
                }}
              >
                {liveScaleReading.stabilized ? 'Locked' : 'Measuring…'}
              </span>
            </div>
          )}

          {liveTapeReading && bleDeviceKind === 'tape' && (
            <div
              className="rounded-xl p-2.5 flex items-center justify-between gap-2"
              style={{ background: 'var(--wk-raised)' }}
            >
              <div>
                <span className="block text-xs text-[#AAABAD]">
                  {liveTapeReading.stabilized
                    ? 'Locked tape measurement'
                    : `Live tape → ${activeSiteDef.label}`}
                </span>
                <span className="text-base font-bold text-white">
                  {fromCmToDisplay(liveTapeReading.lengthCm)} {lengthUnit}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  applyTapeReadingToSite(liveTapeReading.lengthCm, activeSite, true)
                }
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: 'var(--wk-accent)', color: '#13181C' }}
              >
                Apply to {activeSiteDef.shortLabel}
              </button>
            </div>
          )}

          {bleStatus && <p className="wk-caption text-[#00F19F]">{bleStatus}</p>}
          {bleError && <p className="wk-caption text-rose-400">{bleError}</p>}

          {!bluetoothAvailable ? (
            <p className="wk-caption">
              Direct Bluetooth pairing is available in Chrome on Android and desktop. You can still
              enter any RENPHO scale or tape reading below.
            </p>
          ) : (
            <label className="flex items-center gap-2 text-xs text-[#AAABAD] cursor-pointer">
              <input
                type="checkbox"
                checked={acceptAllBleDevices}
                onChange={(e) => setAcceptAllBleDevices(e.target.checked)}
                className="rounded"
              />
              <span>Show all nearby Bluetooth devices if your RENPHO model isn&apos;t listed</span>
            </label>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {field(
            "Today's weight",
            weightInput,
            setWeightInput,
            units.unit,
            'Morning, after the toilet, before eating',
            weightValid
          )}
          {weightKg > 0 && weightValid && (
            <p className="wk-caption">
              New 7-day average: <strong className="text-white">{units.format(previewEmaKg)}</strong>
              . The average smooths out normal daily water changes.
            </p>
          )}
          {field(
            'Body fat',
            bodyFat,
            setBodyFat,
            '%',
            'Optional. Smart scale, calipers or scan, same method each time',
            bfValid
          )}

          {primarySites.map((site) =>
            field(
              site.label,
              siteValues[site.id],
              (v) => setSiteValue(site.id, v),
              lengthUnit,
              `Optional. ${site.hint}`,
              lengthValid(siteValues[site.id], site.minCm, site.maxCm)
            )
          )}

          <button
            type="button"
            onClick={() => setShowAllSites((prev) => !prev)}
            aria-expanded={showAllSites}
            className="w-full py-2.5 px-3 rounded-xl flex items-center justify-between text-xs font-bold text-white"
            style={{ background: 'var(--wk-raised)' }}
          >
            <span>
              More body areas (Shoulders, Hips, Thigh, Calf, Forearm, Neck) in {lengthUnit}
            </span>
            {showAllSites ? (
              <ChevronUp className="w-4 h-4 stroke-[2]" />
            ) : (
              <ChevronDown className="w-4 h-4 stroke-[2]" />
            )}
          </button>

          {showAllSites && (
            <div className="space-y-3 pt-1">
              {secondarySites.map((site) =>
                field(
                  site.label,
                  siteValues[site.id],
                  (v) => setSiteValue(site.id, v),
                  lengthUnit,
                  `Optional. ${site.hint}`,
                  lengthValid(siteValues[site.id], site.minCm, site.maxCm)
                )
              )}
            </div>
          )}

          {!heightCm &&
            field(
              'Height',
              height,
              setHeight,
              lengthUnit,
              'Asked once, for lean mass and waist ratios',
              lengthValid(height, 120, 230)
            )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                disconnectBle();
                onClose();
              }}
              className="wk-button"
              style={{ background: 'var(--wk-raised)', color: '#fff' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              aria-label="Save measurements"
              className="wk-button disabled:opacity-50 gap-1.5"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
