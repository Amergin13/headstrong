import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Ruler, Check, Bluetooth, Scale, ChevronDown, ChevronUp } from 'lucide-react';
import { BiometricLog, BodyMeasurementSite, Gender } from '../../engine/types';
import {
  BODY_MEASUREMENT_SITES,
  computeRenphoScaleMetrics,
  connectRenphoScale,
  connectRenphoTape,
  forgetPairedRenphoDevice,
  isWebBluetoothSupported,
  loadSavedRenphoDevices,
  recordRenphoDeviceSync,
  resolveRememberedBleDevice,
  RENPHO_SCALE_METRICS,
  RenphoBleConnection,
  RenphoScaleMetrics,
  RenphoScaleReading,
  RenphoTapeReading,
  SavedRenphoDevices,
} from '../../services/renphoBluetooth';
import {
  getNativeScaleStatus,
  isNativeScaleAvailable,
  NativeScaleFound,
  NativeScaleStatus,
  openNativeScaleSettings,
  requestNativeScalePermission,
  startNativeScaleScan,
  stopNativeScale,
} from '../../services/nativeScale';
import { localDateString } from '../../utils/date';
import { useUnits } from '../../utils/unitsContext';
import { triggerHaptic } from '../../utils/haptics';

export type LogModalMode = 'weight' | 'measurements';

/** Unit words read out by screen readers ("Waist in inches", not "Waist in in"). */
const UNIT_WORDS: Record<string, string> = { kg: 'kilograms', lb: 'pounds', cm: 'centimetres', in: 'inches', '%': 'percent' };

export interface MeasurementEntry {
  // 13 RENPHO Scale metrics
  bodyweightKg?: number;
  bmi?: number;
  bodyFatPct?: number;
  fatFreeMassKg?: number;
  subcutaneousFatPct?: number;
  visceralFat?: number;
  bodyWaterPct?: number;
  skeletalMuscleMassKg?: number;
  muscleMassKg?: number;
  boneMassKg?: number;
  proteinMassKg?: number;
  bmrKcal?: number;
  metabolicAge?: number;
  impedanceOhms?: number;
  // 12 RENPHO Smart Tape Measure sites
  neckCm?: number;
  shouldersCm?: number;
  chestCm?: number;
  waistCm?: number;
  abdomenCm?: number;
  hipsCm?: number;
  bicepLeftCm?: number;
  bicepRightCm?: number;
  thighLeftCm?: number;
  thighRightCm?: number;
  calfLeftCm?: number;
  calfRightCm?: number;
  // Legacy optional aliases
  armCm?: number;
  forearmCm?: number;
  thighCm?: number;
  calfCm?: number;
  heightCm?: number;
}

interface WeightLogModalProps {
  currentWeight: number;
  currentEma: number;
  /** Optional full biometric history so today's logged fields are pre-filled and previous values are shown. */
  biometrics?: BiometricLog[];
  /** Which separated flow to open: 'weight' (manual weight or RENPHO scale) or 'measurements' (12 body tape sites). */
  initialMode?: LogModalMode;
  /** Optional starting body site when opening directly from a tape chart card. */
  initialSite?: BodyMeasurementSite;
  /** Height the athlete already entered (asked once). */
  heightCm?: number;
  athleteAge?: number;
  athleteGender?: Gender;
  onSave: (entry: MeasurementEntry) => void;
  /** Called automatically when a RENPHO Bluetooth scale or smart tape locks a reading so data is persisted immediately. */
  onAutoCapture?: (entry: MeasurementEntry) => void;
  onClose: () => void;
}

const CM_PER_IN = 2.54;

/**
 * Separated modal for logging either:
 * 1. Weight (`mode === 'weight'`): the manual fields, plus one inline alert for the Renpho scale
 *    (offer to pair → confirmed → listening each time; reconnect when the browser needs a tap).
 * 2. Body Measurements (`mode === 'measurements'`): Enter any of the 12 tape sites manually OR use the RENPHO smart tape.
 */
export const WeightLogModal: React.FC<WeightLogModalProps> = ({
  currentWeight,
  currentEma,
  biometrics = [],
  initialMode = 'weight',
  initialSite = 'waist',
  heightCm,
  athleteAge,
  athleteGender,
  onSave,
  onAutoCapture,
  onClose,
}) => {
  const units = useUnits();
  const imperial = units.unit === 'lb';
  const lengthUnit = imperial ? 'in' : 'cm';
  const toCm = (v: number) => (imperial ? v * CM_PER_IN : v);
  const fromCmToDisplay = (cm: number) =>
    Math.round((imperial ? cm / CM_PER_IN : cm) * 10) / 10;

  // The Progress tab's Weight / Measurements tab decides what this form logs.
  const mode: LogModalMode = initialMode;

  const todayStr = localDateString();
  const todayLog = useMemo(
    () => biometrics.find((b) => b.date === todayStr),
    [biometrics, todayStr]
  );

  // Find most recent logged value for each tape site across history (for helpful "Last: X cm" hints)
  const latestSiteCmByField = useMemo(() => {
    const map: Partial<Record<BodyMeasurementSite, number>> = {};
    for (let i = biometrics.length - 1; i >= 0; i--) {
      const log = biometrics[i];
      for (const site of BODY_MEASUREMENT_SITES) {
        if (map[site.id] !== undefined) continue;
        const val = log[site.field];
        const fallbackVal =
          val ??
          (site.id === 'bicep_right'
            ? log.armCm
            : site.id === 'thigh_right'
            ? log.thighCm
            : site.id === 'calf_right'
            ? log.calfCm
            : undefined);
        if (typeof fallbackVal === 'number' && fallbackVal > 0) {
          map[site.id] = fallbackVal;
        }
      }
    }
    return map;
  }, [biometrics]);

  const hasPrevious = currentWeight > 0;
  const initialWeightKg =
    todayLog?.bodyweightKg && todayLog.bodyweightKg > 0 ? todayLog.bodyweightKg : currentWeight;

  const initialWeightInput = initialWeightKg > 0 ? `${units.toDisplay(initialWeightKg)}` : '';
  const [weightInput, setWeightInput] = useState(initialWeightInput);
  const [bodyFat, setBodyFat] = useState(
    todayLog?.bodyFatPct && todayLog.bodyFatPct > 0 ? `${todayLog.bodyFatPct}` : ''
  );
  const [capturedScaleMetrics, setCapturedScaleMetrics] = useState<Partial<RenphoScaleMetrics>>(
    () => {
      if (!todayLog) return {};
      const m: Partial<RenphoScaleMetrics> = {};
      for (const def of RENPHO_SCALE_METRICS) {
        const val = todayLog[def.field];
        if (typeof val === 'number' && val > 0) {
          m[def.field] = val;
        }
      }
      return m;
    }
  );
  const [capturedImpedanceOhms, setCapturedImpedanceOhms] = useState<number | undefined>(
    todayLog?.impedanceOhms
  );
  const [showAdvancedScaleMetrics, setShowAdvancedScaleMetrics] = useState(false);

  const [siteValues, setSiteValues] = useState<Record<BodyMeasurementSite, string>>(() => {
    const initial: Record<BodyMeasurementSite, string> = {
      neck: '',
      shoulder: '',
      chest: '',
      waist: '',
      abdomen: '',
      hip: '',
      bicep_left: '',
      bicep_right: '',
      thigh_left: '',
      thigh_right: '',
      calf_left: '',
      calf_right: '',
    };
    if (todayLog) {
      for (const site of BODY_MEASUREMENT_SITES) {
        const cm = todayLog[site.field];
        if (typeof cm === 'number' && cm > 0) {
          initial[site.id] = `${fromCmToDisplay(cm)}`;
        }
      }
    }
    return initial;
  });

  const [height, setHeight] = useState('');

  // Remembered & Live RENPHO Bluetooth state
  const [savedDevices, setSavedDevices] = useState<SavedRenphoDevices>(() =>
    loadSavedRenphoDevices()
  );
  const [activeSite, setActiveSite] = useState<BodyMeasurementSite>(initialSite);
  const [bleDeviceKind, setBleDeviceKind] = useState<'scale' | 'tape' | null>(null);
  const [bleDeviceName, setBleDeviceName] = useState<string | null>(null);
  const [bleStatus, setBleStatus] = useState<string | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);
  const [liveScaleReading, setLiveScaleReading] = useState<RenphoScaleReading | null>(null);
  const [liveTapeReading, setLiveTapeReading] = useState<RenphoTapeReading | null>(null);
  const [autoSavedBanner, setAutoSavedBanner] = useState<string | null>(null);
  /** Can the page reach the paired scale without a tap? null until checked. */
  const [scaleReachable, setScaleReachable] = useState<boolean | null>(null);
  const [scaleBusy, setScaleBusy] = useState(false);
  const [justPaired, setJustPaired] = useState(false);
  const mountedRef = useRef(true);
  // In the Android app the app itself reaches the scale, so pairing happens once.
  const nativeScale = isNativeScaleAvailable();
  const [nativeScanning, setNativeScanning] = useState(false);
  const [nativeFound, setNativeFound] = useState<NativeScaleFound[]>([]);
  const [nativeIssue, setNativeIssue] = useState<'permission' | 'bluetooth-off' | null>(null);
  const stopNativeScanRef = useRef<(() => void) | null>(null);
  /** A pair attempt ended without a scale: offer the full device list. */
  const [offerAllDevices, setOfferAllDevices] = useState(false);
  /** The form as the scale left it, so "Done" doesn't re-save a rounded copy of the reading. */
  const [capturedForm, setCapturedForm] = useState<string | null>(null);
  /** A weigh-in was saved: ignore the falling readings as the athlete steps off. */
  const weighInSavedRef = useRef(false);

  const bleConnectionRef = useRef<RenphoBleConnection | null>(null);
  const lastScaleSaveKeyRef = useRef<string | null>(null);
  const bleConnectInFlightRef = useRef(false);
  const activeSiteRef = useRef<BodyMeasurementSite>(activeSite);
  activeSiteRef.current = activeSite;

  const athleteContext = useMemo(
    () => ({
      measuredHeightCm: heightCm,
      heightCm,
      age: athleteAge,
      gender: athleteGender,
    }),
    [heightCm, athleteAge, athleteGender]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopNativeScanRef.current?.();
      bleConnectionRef.current?.disconnect();
      bleConnectionRef.current = null;
      if (isNativeScaleAvailable()) stopNativeScale();
    };
  }, []);

  const setSiteValue = (site: BodyMeasurementSite, val: string) => {
    setSiteValues((prev) => ({ ...prev, [site]: val }));
  };

  const applyTapeReadingToSite = (
    lengthCm: number,
    targetSite: BodyMeasurementSite,
    advance = false,
    autoPersist = false
  ) => {
    const roundedCm = Math.round(lengthCm * 10) / 10;
    const displayVal = fromCmToDisplay(roundedCm);
    setSiteValue(targetSite, `${displayVal}`);
    const siteMeta = BODY_MEASUREMENT_SITES.find((s) => s.id === targetSite);
    if (siteMeta && autoPersist) {
      const autoEntry: MeasurementEntry = { [siteMeta.field]: roundedCm };
      if (targetSite === 'bicep_right') autoEntry.armCm = roundedCm;
      if (targetSite === 'thigh_right') autoEntry.thighCm = roundedCm;
      if (targetSite === 'calf_right') autoEntry.calfCm = roundedCm;
      (onAutoCapture ?? onSave)(autoEntry);
      const summary = `${siteMeta.label}: ${displayVal} ${lengthUnit}`;
      setSavedDevices(recordRenphoDeviceSync('tape', summary));
    }
    if (advance) {
      const idx = BODY_MEASUREMENT_SITES.findIndex((s) => s.id === targetSite);
      if (idx >= 0 && idx + 1 < BODY_MEASUREMENT_SITES.length) {
        const nextSite = BODY_MEASUREMENT_SITES[idx + 1];
        setActiveSite(nextSite.id);
        setAutoSavedBanner(
          `Saved ${siteMeta?.label ?? targetSite} (${displayVal} ${lengthUnit}) to app. Next site ready: ${nextSite.label}.`
        );
      } else {
        setAutoSavedBanner(
          `Saved ${siteMeta?.label ?? targetSite} (${displayVal} ${lengthUnit}) to app.`
        );
      }
    }
  };

  const disconnectBle = () => {
    bleConnectionRef.current?.disconnect();
    bleConnectionRef.current = null;
    setBleDeviceKind(null);
    setBleDeviceName(null);
  };

  const handleScaleReading = (reading: RenphoScaleReading) => {
    if (reading.weightKg < 20) {
      weighInSavedRef.current = false; // stepped off: the next weigh-in can start
      return;
    }
    if (!reading.stabilized && weighInSavedRef.current) return;
    const fullMetrics = reading.metrics ?? computeRenphoScaleMetrics(reading, athleteContext);
    const enrichedReading: RenphoScaleReading = fullMetrics
      ? { ...reading, ...fullMetrics, metrics: fullMetrics }
      : reading;
    setLiveScaleReading(enrichedReading);

    if (enrichedReading.weightKg > 0) {
      const displayWeight =
        Math.round(
          (imperial ? enrichedReading.weightKg * 2.2046226218 : enrichedReading.weightKg) * 10
        ) / 10;
      setWeightInput(`${displayWeight}`);
    }
    if (enrichedReading.bodyFatPct && enrichedReading.bodyFatPct > 0) {
      setBodyFat(`${enrichedReading.bodyFatPct}`);
    }
    if (enrichedReading.impedanceOhms) {
      setCapturedImpedanceOhms(enrichedReading.impedanceOhms);
    }
    if (fullMetrics) {
      setCapturedScaleMetrics(fullMetrics);
    }

    if (enrichedReading.stabilized && enrichedReading.weightKg > 0) {
      // Scales repeat the locked packet several times; save each weigh-in once.
      const saveKey = `${Math.round(enrichedReading.weightKg * 10)}`;
      if (lastScaleSaveKeyRef.current === saveKey) return;
      lastScaleSaveKeyRef.current = saveKey;
      const autoEntry: MeasurementEntry = {
        bodyweightKg: Math.round(enrichedReading.weightKg * 100) / 100,
        bmi: fullMetrics?.bmi ?? enrichedReading.bmi,
        bodyFatPct: fullMetrics?.bodyFatPct ?? enrichedReading.bodyFatPct,
        fatFreeMassKg: fullMetrics?.fatFreeMassKg ?? enrichedReading.fatFreeMassKg,
        subcutaneousFatPct:
          fullMetrics?.subcutaneousFatPct ?? enrichedReading.subcutaneousFatPct,
        visceralFat: fullMetrics?.visceralFat ?? enrichedReading.visceralFat,
        bodyWaterPct: fullMetrics?.bodyWaterPct ?? enrichedReading.bodyWaterPct,
        skeletalMuscleMassKg:
          fullMetrics?.skeletalMuscleMassKg ?? enrichedReading.skeletalMuscleMassKg,
        muscleMassKg: fullMetrics?.muscleMassKg ?? enrichedReading.muscleMassKg,
        boneMassKg: fullMetrics?.boneMassKg ?? enrichedReading.boneMassKg,
        proteinMassKg: fullMetrics?.proteinMassKg ?? enrichedReading.proteinMassKg,
        bmrKcal: fullMetrics?.bmrKcal ?? enrichedReading.bmrKcal,
        metabolicAge: fullMetrics?.metabolicAge ?? enrichedReading.metabolicAge,
        impedanceOhms: enrichedReading.impedanceOhms,
      };
      (onAutoCapture ?? onSave)(autoEntry);
      const summary = `${units.format(enrichedReading.weightKg)}${
        autoEntry.bodyFatPct ? ` · ${autoEntry.bodyFatPct}% BF` : ''
      }`;
      setSavedDevices(recordRenphoDeviceSync('scale', summary));
      const extraCount = RENPHO_SCALE_METRICS.filter(
        (m) => m.field !== 'bodyweightKg' && typeof autoEntry[m.field] === 'number'
      ).length;
      setAutoSavedBanner(
        `${summary}${extraCount > 0 ? ` and ${extraCount} more ${extraCount === 1 ? 'metric' : 'metrics'}` : ''}`
      );
      setJustPaired(false);
      weighInSavedRef.current = true;
      setCapturedForm('pending');
    }
  };

  const handleTapeReading = (reading: RenphoTapeReading) => {
    setLiveTapeReading(reading);
    const currentTarget = activeSiteRef.current;
    const targetDef =
      BODY_MEASUREMENT_SITES.find((s) => s.id === currentTarget) ?? BODY_MEASUREMENT_SITES[0];
    if (reading.stabilized) {
      applyTapeReadingToSite(reading.lengthCm, currentTarget, true, true);
      setBleStatus(
        `Locked & saved ${fromCmToDisplay(reading.lengthCm)} ${lengthUnit} for ${targetDef.label}.`
      );
    } else {
      setBleStatus(
        `Live tape reading for ${targetDef.label}: ${fromCmToDisplay(reading.lengthCm)} ${lengthUnit}. Press confirm on the tape or tap "Save to ${targetDef.shortLabel}" below.`
      );
    }
  };

  const noteNativeStatus = (status: NativeScaleStatus): boolean => {
    setNativeIssue(!status.granted ? 'permission' : !status.enabled ? 'bluetooth-off' : null);
    return status.granted && status.enabled;
  };

  /** Android app: ask for access if needed, then look for nearby scales to choose from. */
  const startNativePairing = async (showAll = false) => {
    setBleError(null);
    setOfferAllDevices(false);
    setNativeFound([]);
    let status = await getNativeScaleStatus();
    if (status.supported && !status.granted) status = await requestNativeScalePermission();
    if (!mountedRef.current) return;
    if (!status.supported) {
      setBleError("This phone doesn't support Bluetooth scales.");
      return;
    }
    if (!noteNativeStatus(status)) return;
    setNativeScanning(true);
    let found = 0;
    stopNativeScanRef.current = startNativeScaleScan(
      {
        onFound: (scale) => {
          found++;
          setNativeFound((prev) => (prev.some((d) => d.id === scale.id) ? prev : [...prev, scale]));
        },
        onEnded: () => {
          stopNativeScanRef.current = null;
          setNativeScanning(false);
          if (!found) {
            setBleError("Couldn't find a scale. Step on it to wake it, then try again.");
            setOfferAllDevices(true);
          }
        },
      },
      { showAll }
    );
  };

  const handleChooseNativeScale = (scale: NativeScaleFound) => {
    stopNativeScanRef.current?.();
    stopNativeScanRef.current = null;
    setNativeScanning(false);
    setNativeFound([]);
    handleConnectScale(false, false, false, scale);
  };

  const handleConnectScale = async (
    forceNewPairing = false,
    silentOnly = false,
    showAllDevices = false,
    chosenNativeScale?: NativeScaleFound
  ) => {
    const known = loadSavedRenphoDevices().scale;
    if (!silentOnly) {
      setBleError(null);
      setScaleBusy(true);
    }
    disconnectBle();
    lastScaleSaveKeyRef.current = null;
    try {
      const conn = await connectRenphoScale(
        {
          onReading: handleScaleReading,
          onDisconnect: () => {
            // The scale sleeps soon after a weigh-in; the loop below listens for it again.
            bleConnectionRef.current?.disconnect();
            bleConnectionRef.current = null;
            weighInSavedRef.current = false;
            setBleDeviceKind(null);
            setBleDeviceName(null);
            setLiveScaleReading(null);
          },
        },
        {
          acceptAllDevices: showAllDevices,
          unit: units.unit,
          athlete: athleteContext,
          forceNewPairing,
          silentOnly,
          // A nameless scale was saved under the fallback name, which no device advertises.
          onlyDeviceName: known?.name && known.name !== 'RENPHO Scale' ? known.name : undefined,
          nativeScale: chosenNativeScale,
        }
      );
      // The form closed while this was connecting: don't leave the scale connected.
      if (!mountedRef.current) {
        conn.disconnect();
        return;
      }
      bleConnectionRef.current = conn;
      setBleDeviceKind('scale');
      setBleDeviceName(conn.deviceName);
      setSavedDevices(loadSavedRenphoDevices());
      setScaleReachable(true);
      if (!silentOnly) {
        setJustPaired(!known);
        setOfferAllDevices(false);
      }
    } catch (err) {
      if (silentOnly || !mountedRef.current) return;
      setOfferAllDevices(true);
      const msg = err instanceof Error ? err.message : '';
      if (!/cancelled|canceled/i.test(msg)) {
        setBleError(
          /no scale weight stream/i.test(msg)
            ? msg
            : "Couldn't reach your scale. Step on it to wake it, then try again."
        );
      }
    } finally {
      if (!silentOnly && mountedRef.current) setScaleBusy(false);
    }
  };

  const handleConnectTape = async (forceNewPairing = false, silentOnly = false) => {
    if (!silentOnly) {
      setBleError(null);
    }
    disconnectBle();
    try {
      const conn = await connectRenphoTape(
        {
          onStatus: (msg) => setBleStatus(msg),
          onReading: handleTapeReading,
          onDisconnect: () => {
            bleConnectionRef.current?.disconnect();
            bleConnectionRef.current = null;
            setBleDeviceKind(null);
            setBleDeviceName(null);
            const remembered = loadSavedRenphoDevices().tape;
            setBleStatus(
              remembered
                ? `${remembered.name} is on standby. Pull the tape or press a button to wake it.`
                : 'Smart tape disconnected.'
            );
          },
        },
        {
          forceNewPairing,
          silentOnly,
        }
      );
      if (!mountedRef.current) {
        conn.disconnect();
        return;
      }
      bleConnectionRef.current = conn;
      setBleDeviceKind('tape');
      setBleDeviceName(conn.deviceName);
      setSavedDevices(loadSavedRenphoDevices());
    } catch (err) {
      if (silentOnly) return;
      const msg = err instanceof Error ? err.message : 'Could not connect to RENPHO smart tape.';
      if (!/cancelled|canceled|User cancelled/i.test(msg)) {
        setBleError(msg);
      } else {
        setBleStatus(null);
      }
    }
  };

  // Automatically attempt silent reconnection to a remembered RENPHO device when opening or switching modes,
  // and poll every 3s while in standby so waking the scale/tape by stepping on it connects automatically.
  useEffect(() => {
    if (!isWebBluetoothSupported() && !isNativeScaleAvailable()) return;
    let cancelled = false;
    const remembered = loadSavedRenphoDevices();

    // Only claim to be listening when the page really can reach the paired scale.
    if (mode === 'weight' && remembered.scale) {
      resolveRememberedBleDevice('scale').then((device) => {
        if (!cancelled) setScaleReachable(Boolean(device));
      });
    }

    const tryAutoConnect = async () => {
      // A reconnect to a sleeping device can take a while; never stack attempts.
      if (cancelled || bleConnectInFlightRef.current) return;
      bleConnectInFlightRef.current = true;
      try {
        if (mode === 'weight' && remembered.scale && bleDeviceKind !== 'scale') {
          await handleConnectScale(false, true);
        } else if (mode === 'measurements' && remembered.tape && bleDeviceKind !== 'tape') {
          await handleConnectTape(false, true);
        }
      } finally {
        bleConnectInFlightRef.current = false;
      }
    };

    const tick = async () => {
      if (bleConnectionRef.current) return;
      // Android app: Bluetooth may be off or its permission removed, even mid-wait. Never keep
      // saying "listening" then: stop, say why, and start again once it's sorted.
      if (mode === 'weight' && remembered.scale && isNativeScaleAvailable()) {
        const status = await getNativeScaleStatus();
        if (!mountedRef.current) return;
        if (!noteNativeStatus(status)) {
          stopNativeScale();
          return;
        }
      }
      tryAutoConnect();
    };

    tick();
    const timer = setInterval(tick, 3000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bleDeviceKind, savedDevices.scale?.id, savedDevices.tape?.id]);

  const handleForgetDevice = (kind: 'scale' | 'tape') => {
    if (bleDeviceKind === kind) {
      disconnectBle();
    }
    const updated = forgetPairedRenphoDevice(kind);
    setSavedDevices(updated);
    setBleStatus(null);
    setBleError(null);
    if (kind === 'scale') {
      if (isNativeScaleAvailable()) stopNativeScale();
      setNativeIssue(null);
      setScaleReachable(null);
      setJustPaired(false);
      setAutoSavedBanner(null);
      setLiveScaleReading(null);
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
  const hasAnyScaleMetric = Object.values(capturedScaleMetrics).some(
    (v) => typeof v === 'number' && v > 0
  );

  const valid =
    weightValid &&
    bfValid &&
    allSitesValid &&
    lengthValid(height, 120, 230) &&
    (weightKg > 0 ||
      num(bodyFat) > 0 ||
      hasAnySiteValue ||
      hasAnyScaleMetric ||
      num(height) > 0);
  const previewEmaKg =
    currentEma > 0 && hasPrevious && weightKg > 0
      ? weightKg * 0.25 + currentEma * 0.75
      : weightKg;

  const formSnapshot = JSON.stringify([weightInput, bodyFat, height, capturedScaleMetrics]);
  useEffect(() => {
    if (capturedForm === 'pending') setCapturedForm(formSnapshot);
  }, [capturedForm, formSnapshot]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      disconnectBle();
      onClose();
      return;
    }
    // The scale already saved this reading; "Done" only saves what the athlete changed afterwards.
    if (mode === 'weight' && capturedForm === formSnapshot) {
      disconnectBle();
      onClose();
      return;
    }
    const round = (v: number) => Math.round(v * 10) / 10;
    const sitePayload: Partial<MeasurementEntry> = {};
    for (const site of BODY_MEASUREMENT_SITES) {
      const val = num(siteValues[site.id]);
      if (val > 0) {
        const cmVal = round(toCm(val));
        sitePayload[site.field] = cmVal;
        if (site.id === 'bicep_right') sitePayload.armCm = cmVal;
        if (site.id === 'thigh_right') sitePayload.thighCm = cmVal;
        if (site.id === 'calf_right') sitePayload.calfCm = cmVal;
      }
    }
    // The weight is saved only when it's a real reading: typed or confirmed on the weight tab, or
    // sent by the scale. Saving measurements never re-saves a pre-filled weight, which would copy an
    // earlier weigh-in onto today and drift through kg/lb rounding.
    const prefilledUnchanged = weightInput === initialWeightInput;
    const sendWeight = weightKg > 0 && (mode === 'weight' || !prefilledUnchanged);
    const finalWeightKg = sendWeight
      ? prefilledUnchanged && initialWeightKg > 0
        ? initialWeightKg
        : Math.round(weightKg * 100) / 100
      : undefined;
    const finalBfPct = num(bodyFat) ? round(num(bodyFat)) : capturedScaleMetrics.bodyFatPct;
    const finalHeightCm = num(height) ? round(toCm(num(height))) : undefined;
    const effectiveHeightCm = finalHeightCm ?? heightCm;

    // If both weight and body fat are entered manually, also populate exact Fat-Free Mass, BMI (when height is known), and Katch-McArdle BMR
    const derivedFfm =
      capturedScaleMetrics.fatFreeMassKg ??
      (finalWeightKg && finalBfPct ? round(finalWeightKg * (1 - finalBfPct / 100)) : undefined);
    const derivedBmi =
      capturedScaleMetrics.bmi ??
      (finalWeightKg && effectiveHeightCm && effectiveHeightCm >= 100
        ? round(finalWeightKg / ((effectiveHeightCm / 100) * (effectiveHeightCm / 100)))
        : undefined);
    const derivedBmr =
      capturedScaleMetrics.bmrKcal ??
      (derivedFfm && derivedFfm > 15 ? Math.round(370 + 21.6 * derivedFfm) : undefined);

    disconnectBle();
    onSave({
      bodyweightKg: finalWeightKg,
      bmi: derivedBmi,
      bodyFatPct: finalBfPct,
      fatFreeMassKg: derivedFfm,
      subcutaneousFatPct: capturedScaleMetrics.subcutaneousFatPct,
      visceralFat: capturedScaleMetrics.visceralFat,
      bodyWaterPct: capturedScaleMetrics.bodyWaterPct,
      skeletalMuscleMassKg: capturedScaleMetrics.skeletalMuscleMassKg,
      muscleMassKg: capturedScaleMetrics.muscleMassKg,
      boneMassKg: capturedScaleMetrics.boneMassKg,
      proteinMassKg: capturedScaleMetrics.proteinMassKg,
      bmrKcal: derivedBmr,
      metabolicAge: capturedScaleMetrics.metabolicAge,
      impedanceOhms: capturedImpedanceOhms,
      ...sitePayload,
      heightCm: finalHeightCm,
    });
    onClose();
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    unit: string,
    hint?: string,
    ok = true,
    onFocus?: () => void
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
          onFocus={onFocus}
          onChange={(e) => set(e.target.value)}
          aria-label={`${label}${UNIT_WORDS[unit] ? ` in ${UNIT_WORDS[unit]}` : ''}`}
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

  const activeSiteDef =
    BODY_MEASUREMENT_SITES.find((s) => s.id === activeSite) ?? BODY_MEASUREMENT_SITES[0];
  const bluetoothAvailable = nativeScale || isWebBluetoothSupported();
  const rememberedScale = savedDevices.scale;
  const rememberedTape = savedDevices.tape;

  // The one place the scale appears: what's happening now, and at most one action.
  const measuring = bleDeviceKind === 'scale' && liveScaleReading && !liveScaleReading.stabilized && liveScaleReading.weightKg > 0;
  const scaleConnected = bleDeviceKind === 'scale';
  const needsReconnect = Boolean(rememberedScale) && !scaleConnected && scaleReachable === false;
  let alertTitle: string | null = null;
  let alertBody: string;
  let alertTone: 'info' | 'live' | 'success' = 'info';
  if (nativeIssue === 'permission') {
    alertTitle = 'Allow Bluetooth access';
    alertBody = 'Treise needs Nearby devices access to connect to your scale. Nothing else uses it.';
  } else if (nativeIssue === 'bluetooth-off') {
    alertTitle = 'Bluetooth is off';
    alertBody = 'Turn it on to capture from your scale. Or type your weight above.';
  } else if (nativeScanning) {
    alertTitle = 'Looking for your scale';
    alertBody = nativeFound.length ? 'Tap your scale to pair it.' : 'Step on your scale to wake it.';
    alertTone = 'live';
  } else if (scaleBusy) {
    alertTitle = nativeScale ? 'Connecting to your scale' : rememberedScale ? 'Reconnecting your scale' : 'Pairing your scale';
    alertBody = nativeScale ? 'Stay on the scale until it connects.' : 'Step on your scale to wake it, then choose it from the list.';
  } else if (measuring) {
    alertTitle = `Measuring: ${units.format(liveScaleReading!.weightKg)}`;
    alertBody = 'Stand still until it settles.';
    alertTone = 'live';
  } else if (autoSavedBanner) {
    alertTitle = 'Saved from your scale';
    alertBody = `${autoSavedBanner}. See it in Progress.`;
    alertTone = 'success';
  } else if (justPaired && scaleConnected) {
    alertTitle = 'Scale connected';
    alertBody = 'Step on it now and your weight and other metrics save automatically.';
    alertTone = 'success';
  } else if (needsReconnect) {
    alertTitle = 'Reconnect your scale';
    alertBody = 'Your browser asks again after the app restarts. Step on your scale, then tap Reconnect.';
  } else if (rememberedScale) {
    alertTitle = 'Listening for your scale';
    alertBody = 'Step on it and your weight and other metrics save automatically. Or type your weight above.';
    alertTone = 'live';
  } else {
    alertBody = 'Treise can connect to a Renpho scale to capture your weight and body metrics automatically over time.';
  }
  const alertAction =
    nativeIssue === 'permission'
      ? 'Allow'
      : nativeIssue === 'bluetooth-off' || nativeScanning || scaleBusy || (rememberedScale && !needsReconnect)
      ? null
      : rememberedScale
      ? 'Reconnect'
      : 'Pair';
  const handleAlertAction = async () => {
    triggerHaptic('light');
    if (nativeIssue === 'permission') {
      const status = await requestNativeScalePermission();
      if (!mountedRef.current) return;
      // Android stops showing its prompt after a refusal: the setting is the only way left.
      if (!status.granted) openNativeScaleSettings();
      noteNativeStatus(status);
    } else if (nativeScale) {
      startNativePairing();
    } else {
      handleConnectScale(false, false);
    }
  };

  const scaleAlert = (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl p-3 space-y-2"
      style={{
        background: alertTone === 'success' ? 'rgba(0, 241, 159, 0.14)' : 'var(--wk-raised)',
        border: alertTone === 'success' ? '1px solid rgba(0, 241, 159, 0.45)' : '1px solid transparent',
      }}
    >
      <div className="flex items-center gap-3">
        {alertTone === 'success' ? (
          <Check className="w-5 h-5 text-[#00F19F] shrink-0 stroke-[2]" aria-hidden="true" />
        ) : alertTone === 'live' ? (
          <span className="w-2.5 h-2.5 mx-1 rounded-full bg-[#00F19F] shrink-0 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Bluetooth className="w-5 h-5 text-[#C6C6C6] shrink-0 stroke-[2]" aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          {alertTitle && <span className="block text-xs font-bold text-white">{alertTitle}</span>}
          <span className="block text-xs text-[#C6C6C6]">{alertBody}</span>
        </div>
        {alertAction && (
          <button
            type="button"
            onClick={handleAlertAction}
            className="shrink-0 px-4 rounded-xl text-xs font-bold min-h-[44px]"
            style={{ background: 'var(--wk-accent)', color: '#13181C' }}
          >
            {alertAction}
          </button>
        )}
      </div>
      {nativeFound.length > 0 && (
        <ul className="space-y-2" aria-label="Scales nearby">
          {nativeFound.map((scale) => (
            <li key={scale.id}>
              <button
                type="button"
                onClick={() => handleChooseNativeScale(scale)}
                className="w-full px-3 rounded-xl text-xs font-bold text-left min-h-[44px]"
                style={{ background: 'var(--wk-accent)', color: '#13181C' }}
              >
                Pair {scale.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {bleError && <p className="text-xs text-rose-300">{bleError}</p>}
      {offerAllDevices && !scaleBusy && !nativeScanning && !scaleConnected && (
        <button
          type="button"
          onClick={() => (nativeScale ? startNativePairing(true) : handleConnectScale(true, false, true))}
          className="text-xs text-[#C6C6C6] hover:text-white underline min-h-[44px]"
        >
          Can't find your scale? Show all devices
        </button>
      )}
      {rememberedScale && !scaleBusy && !nativeScanning && (
        <button
          type="button"
          onClick={() => handleForgetDevice('scale')}
          className="text-xs text-[#AAABAD] hover:text-white underline min-h-[44px]"
        >
          Forget this scale
        </button>
      )}
    </div>
  );

  return (
    <div className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="wk-card w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'weight' ? (
              <Scale className="w-5 h-5 text-[#00F19F] stroke-[2]" />
            ) : (
              <Ruler className="w-5 h-5 text-[#00F19F] stroke-[2]" />
            )}
            <h3 className="wk-h1 text-white">
              {mode === 'weight' ? 'Log weight' : 'Log measurements'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              disconnectBle();
              onClose();
            }}
            aria-label="Close modal"
            className="w-11 h-11 rounded-full bg-[#3B4044] hover:bg-[#474D50] flex items-center justify-center text-[#C6C6C6] hover:text-white"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Auto-Saved Confirmation Banner */}
        {autoSavedBanner && mode === 'measurements' && (
          <div
            role="status"
            className="rounded-xl p-3 flex items-center gap-2.5"
            style={{
              background: 'rgba(0, 241, 159, 0.14)',
              border: '1px solid rgba(0, 241, 159, 0.45)',
            }}
          >
            <Check className="w-5 h-5 text-[#00F19F] shrink-0 stroke-[2.5]" />
            <span className="text-xs font-bold text-white">{autoSavedBanner}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'weight' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field("Today's weight", weightInput, setWeightInput, units.unit, 'Morning, before eating', weightValid)}
                {field('Body fat', bodyFat, setBodyFat, '%', 'Optional', bfValid)}
              </div>
              {weightKg > 0 && weightValid && (
                <p className="wk-caption">
                  New 7-day average: <strong className="text-white">{units.format(previewEmaKg)}</strong>
                </p>
              )}
              {!heightCm &&
                field('Height', height, setHeight, lengthUnit, 'Asked once, for BMI and lean mass', lengthValid(height, 120, 230))}

              {bluetoothAvailable && !(rememberedScale && scaleReachable === null) && scaleAlert}

              <button
                type="button"
                onClick={() => setShowAdvancedScaleMetrics((prev) => !prev)}
                aria-expanded={showAdvancedScaleMetrics}
                className="w-full flex items-center justify-between text-xs font-bold text-[#C6C6C6] hover:text-white min-h-[44px]"
              >
                <span>Add other readings</span>
                {showAdvancedScaleMetrics ? <ChevronUp className="w-4 h-4 stroke-[2]" /> : <ChevronDown className="w-4 h-4 stroke-[2]" />}
              </button>

              {showAdvancedScaleMetrics && (
                <div className="grid grid-cols-2 gap-2.5">
                  {RENPHO_SCALE_METRICS.filter((m) => !m.manualPrimary).map((m) => {
                    const rawMetricVal = capturedScaleMetrics[m.field as keyof RenphoScaleMetrics];
                    const displayVal =
                      rawMetricVal !== undefined && rawMetricVal > 0
                        ? m.unitKind === 'weight'
                          ? `${units.toDisplay(rawMetricVal)}`
                          : `${rawMetricVal}`
                        : '';
                    const unitLabel =
                      m.unitKind === 'weight' ? units.unit : m.unitKind === 'percent' ? '%' : m.unitKind === 'kcal' ? 'kcal' : m.unitKind === 'years' ? 'yrs' : '';
                    return (
                      <div key={m.id}>
                        {field(
                          m.label,
                          displayVal,
                          (v) => {
                            const parsed = parseFloat(v);
                            setCapturedScaleMetrics((prev) => ({
                              ...prev,
                              [m.field]:
                                Number.isFinite(parsed) && parsed > 0 ? (m.unitKind === 'weight' ? units.fromDisplay(parsed) : parsed) : undefined,
                            }));
                          },
                          unitLabel
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {/* MEASUREMENTS MODE: 12 Body Tape Sites (RENPHO Smart Tape or Manual) */}
              <div
                className="rounded-2xl p-3.5 space-y-3"
                style={{ background: 'var(--wk-surface)', border: '1px solid var(--wk-line)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bluetooth className="w-4 h-4 text-[#00F19F] stroke-[2]" />
                    <span className="wk-label text-white">
                      Option 1: Pull from RENPHO Smart Tape (12 Sites)
                    </span>
                  </div>
                  {rememberedTape && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#00F19F]">
                        {bleDeviceKind === 'tape'
                          ? `${bleDeviceName ?? rememberedTape.name} · Live`
                          : `${rememberedTape.name} · Paired`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleForgetDevice('tape')}
                        className="text-xs text-[#AAABAD] hover:text-white underline"
                      >
                        Forget
                      </button>
                    </div>
                  )}
                </div>

                {/* Clear 3-Step Instructions for the Smart Tape */}
                <div
                  className="rounded-xl p-3 space-y-1.5"
                  style={{ background: 'var(--wk-raised)' }}
                >
                  <span className="block text-xs font-bold text-white">
                    How tape measurements are pulled into the app:
                  </span>
                  <ol className="text-xs text-[#C6C6C6] space-y-1 list-decimal list-inside">
                    <li>
                      <strong className="text-white">Select body site:</strong> Tap the area you are
                      measuring below (currently <strong className="text-white">{activeSiteDef.label}</strong>).
                    </li>
                    <li>
                      <strong className="text-white">Wrap the tape:</strong> Pull the RENPHO tape
                      around that site — your live reading streams here.
                    </li>
                    <li>
                      <strong className="text-white">Lock & auto-advance:</strong> Press the confirm
                      button on the tape (or tap Save below) to save to the app and move to the next
                      site.
                    </li>
                  </ol>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleConnectTape(false, false)}
                    aria-label="Connect RENPHO Smart Tape"
                    className="wk-button flex-1 text-xs py-2.5 px-3 gap-1.5 min-h-[44px]"
                    style={{
                      background:
                        bleDeviceKind === 'tape' ? 'var(--wk-accent)' : 'var(--wk-raised)',
                      color: bleDeviceKind === 'tape' ? '#13181C' : '#fff',
                    }}
                  >
                    <Ruler className="w-4 h-4 stroke-[2]" />
                    <span>
                      {bleDeviceKind === 'tape'
                        ? `Connected to ${bleDeviceName ?? 'Smart Tape'}`
                        : rememberedTape
                        ? `Wake ${rememberedTape.name} & Tap to Connect`
                        : 'Pair RENPHO Smart Tape'}
                    </span>
                  </button>

                  {rememberedTape && (
                    <button
                      type="button"
                      onClick={() => handleConnectTape(true, false)}
                      className="px-3 py-2.5 rounded-xl text-xs font-semibold text-[#C6C6C6] hover:text-white min-h-[44px]"
                      style={{ background: 'var(--wk-raised)' }}
                    >
                      Switch tape
                    </button>
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <span className="block wk-caption text-white font-semibold">
                    Active body site for smart tape (tap to change):
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
                          onClick={() => setActiveSite(site.id)}
                          className="px-2.5 py-1.5 rounded-full text-xs font-bold transition-colors min-h-[36px]"
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
                    Measuring <strong className="text-white">{activeSiteDef.label}</strong> —{' '}
                    {activeSiteDef.hint}.
                  </p>
                </div>

                {liveTapeReading && (
                  <div
                    className="rounded-xl p-2.5 flex items-center justify-between gap-2"
                    style={{ background: 'var(--wk-raised)' }}
                  >
                    <div>
                      <span className="block text-xs text-[#AAABAD]">
                        {liveTapeReading.stabilized
                          ? 'Locked & auto-saved tape measurement'
                          : `Live tape → ${activeSiteDef.label}`}
                      </span>
                      <span className="text-base font-bold text-white">
                        {fromCmToDisplay(liveTapeReading.lengthCm)} {lengthUnit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        applyTapeReadingToSite(liveTapeReading.lengthCm, activeSite, true, true)
                      }
                      className="px-3 py-2 rounded-full text-xs font-bold min-h-[44px]"
                      style={{ background: 'var(--wk-accent)', color: '#13181C' }}
                    >
                      Save to {activeSiteDef.shortLabel} & Next →
                    </button>
                  </div>
                )}

                {bleStatus && <p className="wk-caption text-[#00F19F]">{bleStatus}</p>}
                {bleError && <p className="wk-caption text-rose-400">{bleError}</p>}
              </div>

              {/* OPTION 2: Manual 12-Site Tape Circumferences */}
              <div
                className="rounded-2xl p-3.5 space-y-3"
                style={{ background: 'var(--wk-surface)', border: '1px solid var(--wk-line)' }}
              >
                <div className="flex items-center justify-between">
                  <h4 className="wk-label text-white">
                    Option 2: Enter measurements manually ({lengthUnit})
                  </h4>
                  <span className="wk-caption">12 body sites</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {BODY_MEASUREMENT_SITES.map((site) => {
                    const prevCm = latestSiteCmByField[site.id];
                    const prevHint =
                      prevCm && prevCm > 0
                        ? `Last: ${fromCmToDisplay(prevCm)} ${lengthUnit}`
                        : undefined;
                    return (
                      <div key={site.id}>
                        {field(
                          site.label,
                          siteValues[site.id],
                          (v) => setSiteValue(site.id, v),
                          lengthUnit,
                          prevHint,
                          lengthValid(siteValues[site.id], site.minCm, site.maxCm),
                          () => setActiveSite(site.id)
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
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
              disabled={!valid && !autoSavedBanner}
              aria-label={mode === 'weight' ? 'Save weight' : 'Save measurements'}
              className="wk-button disabled:opacity-50 gap-1.5"
              style={{ background: 'var(--wk-accent)', color: '#13181C' }}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>
                {autoSavedBanner && (mode === 'measurements' || capturedForm === formSnapshot)
                  ? 'Done'
                  : mode === 'weight'
                  ? 'Save weight'
                  : 'Save measurements'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
