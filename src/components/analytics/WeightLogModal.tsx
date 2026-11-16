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
  /** Asked once on the weight form; saved to the profile, never to the day's log. */
  ageYears?: number;
  sex?: Gender;
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
  /** Only an age the athlete entered (never the placeholder). */
  athleteAge?: number;
  /** Only a sex the athlete chose (never the default). */
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
  initialSite,
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

  const initialWeightInput = initialWeightKg > 0 ? `${units.toDisplayPrecise(initialWeightKg)}` : '';
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
  const [activeSite, setActiveSite] = useState<BodyMeasurementSite>(initialSite ?? 'waist');
  const [showAllSites, setShowAllSites] = useState(false);
  const [showLimbSites, setShowLimbSites] = useState(() =>
    Boolean(
      todayLog &&
        BODY_MEASUREMENT_SITES.some(
          (s) => !s.primary && typeof todayLog[s.field] === 'number' && (todayLog[s.field] as number) > 0
        )
    )
  );
  const [showTapeHelp, setShowTapeHelp] = useState(false);
  const singleSiteMode = mode === 'measurements' && Boolean(initialSite) && !showAllSites;
  const [bleDeviceKind, setBleDeviceKind] = useState<'scale' | 'tape' | null>(null);
  const [bleDeviceName, setBleDeviceName] = useState<string | null>(null);
  const [bleStatus, setBleStatus] = useState<string | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);
  const [liveScaleReading, setLiveScaleReading] = useState<RenphoScaleReading | null>(null);
  const [liveTapeReading, setLiveTapeReading] = useState<RenphoTapeReading | null>(null);
  const [autoSavedBanner, setAutoSavedBanner] = useState<string | null>(null);
  /** Where this weigh-in is: reading the weight, then measuring body composition, then finished. */
  const [capturePhase, setCapturePhase] = useState<'idle' | 'measuring' | 'analysing' | 'complete' | 'no-body-reading' | 'partial' | 'cut-short'>('idle');
  // The scale normally ends this by finishing or sleeping. If neither arrives, don't hold the form.
  useEffect(() => {
    if (capturePhase !== 'analysing') return;
    const timer = window.setTimeout(() => setCapturePhase('cut-short'), 30000);
    return () => window.clearTimeout(timer);
  }, [capturePhase]);
  /** A low reading the scale settled on (one foot, a hand), so its repeats can be told from a real step. */
  const partialKgRef = useRef<number | null>(null);
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
  const singleSiteModeRef = useRef(singleSiteMode);
  singleSiteModeRef.current = singleSiteMode;

  const typedHeightCm = useMemo(() => {
    const parsed = parseFloat(height);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    const cm = imperial ? parsed * CM_PER_IN : parsed;
    return cm >= 120 && cm <= 230 ? cm : undefined;
  }, [height, imperial]);

  const typedAgeRef = useRef<number | undefined>(undefined);
  const sexInputRef = useRef<Gender | undefined>(undefined);
  const [ageInput, setAgeInput] = useState('');
  const [sexInput, setSexInput] = useState<Gender | undefined>(undefined);
  const typedAge = useMemo(() => {
    const parsed = Math.round(parseFloat(ageInput));
    return parsed >= 16 && parsed <= 99 ? parsed : undefined;
  }, [ageInput]);

  const athleteContext = useMemo(
    () => ({
      measuredHeightCm: heightCm ?? typedHeightCm,
      age: athleteAge ?? typedAge,
      gender: athleteGender ?? sexInput,
      lastWeightKg: currentWeight > 0 ? currentWeight : undefined,
    }),
    [heightCm, typedHeightCm, athleteAge, typedAge, athleteGender, sexInput, currentWeight]
  );
  typedAgeRef.current = typedAge;
  sexInputRef.current = sexInput;
  /** Everything body metrics need. Without it the scale weighs only, and the form says why. */
  const canCaptureMetrics = Boolean(athleteContext.measuredHeightCm && athleteContext.age && athleteContext.gender);
  // The reading handler lives as long as the connection, so it reads the latest answers from here.
  const athleteContextRef = useRef(athleteContext);
  athleteContextRef.current = athleteContext;

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
    if (advance && !singleSiteModeRef.current) {
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
    } else if (advance) {
      setAutoSavedBanner(`Saved ${siteMeta?.label ?? targetSite} (${displayVal} ${lengthUnit}) to app.`);
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
    // The scale echoes a low reading it locked onto; only a real change means someone stepped on.
    if (partialKgRef.current !== null && Math.abs(reading.weightKg - partialKgRef.current) < 1) return;
    partialKgRef.current = null;
    if (!reading.stabilized) setCapturePhase('measuring');
    // A hand or one foot can hold a low weight steady long enough to look settled. Well under the
    // athlete's last weight, it's not a weigh-in: show it as measuring, but never save it.
    if (reading.stabilized && currentWeight > 0 && reading.weightKg < currentWeight * 0.6) {
      partialKgRef.current = reading.weightKg;
      setLiveScaleReading({ ...reading, stabilized: false });
      setCapturePhase('partial');
      return;
    }
    const fullMetrics = computeRenphoScaleMetrics(reading, athleteContextRef.current) ?? reading.metrics;
    const enrichedReading: RenphoScaleReading = fullMetrics
      ? { ...reading, ...fullMetrics, metrics: fullMetrics }
      : reading;
    setLiveScaleReading(enrichedReading);

    // Only a settled weight goes in the form: tapping Done mid-step must never save a partial reading.
    // The alert shows the live number meanwhile.
    if (enrichedReading.stabilized && enrichedReading.weightKg > 0) {
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
      // Only a 0x55AA scale says when it has finished; a weight that settled first is still in progress.
      // A final with no resistance: the scale finished, but its body reading found nothing.
      const { measuredHeightCm, age, gender } = athleteContextRef.current;
      const noBodyReading =
        enrichedReading.isFinal && !enrichedReading.impedanceOhms && Boolean(measuredHeightCm && age && gender);
      setCapturePhase(
        noBodyReading
          ? 'no-body-reading'
          : enrichedReading.isFinal || enrichedReading.sourceProtocol !== 'lefu_55aa'
            ? 'complete'
            : 'analysing'
      );
      // Scales repeat the locked packet several times; save each weigh-in once,
      // but allow a subsequent BIA packet (with impedance/body fat) to upgrade a weight-only lock.
      const hasBioComp = Boolean(
        (fullMetrics?.bodyFatPct && fullMetrics.bodyFatPct > 0) ||
          (enrichedReading.bodyFatPct && enrichedReading.bodyFatPct > 0) ||
          (enrichedReading.impedanceOhms && enrichedReading.impedanceOhms > 0)
      );
      const saveKey = `${Math.round(enrichedReading.weightKg * 10)}:${hasBioComp ? 1 : 0}`;
      if (lastScaleSaveKeyRef.current === saveKey) return;
      lastScaleSaveKeyRef.current = saveKey;
      const autoEntry: MeasurementEntry = {
        // Answers typed on this form belong with the reading they made possible.
        heightCm: !heightCm ? typedHeightCm : undefined,
        ageYears: !athleteAge ? typedAgeRef.current : undefined,
        sex: !athleteGender ? sexInputRef.current : undefined,
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
      const summary = `${units.formatPrecise(enrichedReading.weightKg)}${
        autoEntry.bodyFatPct ? ` · ${autoEntry.bodyFatPct}% BF` : ''
      }`;
      setSavedDevices(recordRenphoDeviceSync('scale', summary));
      const extraCount = RENPHO_SCALE_METRICS.filter(
        (m) => m.field !== 'bodyweightKg' && typeof autoEntry[m.field] === 'number'
      ).length;
      if (extraCount > 0) {
        setShowAdvancedScaleMetrics(true);
      }
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
            // The scale slept before settling: don't leave a partial reading ready to be saved.
            if (!weighInSavedRef.current) {
              setWeightInput(initialWeightInput);
              setCapturedForm(null);
              setCapturePhase('idle');
              partialKgRef.current = null;
            } else {
              setCapturePhase((phase) => (phase === 'analysing' ? 'cut-short' : phase));
            }
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
          getAthlete: () => athleteContextRef.current,
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

  const scopedSites = singleSiteMode
    ? BODY_MEASUREMENT_SITES.filter((s) => s.id === activeSite)
    : BODY_MEASUREMENT_SITES;
  const allSitesValid = scopedSites.every((site) =>
    lengthValid(siteValues[site.id], site.minCm, site.maxCm)
  );
  const hasAnySiteValue = scopedSites.some((site) => num(siteValues[site.id]) > 0);
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
    for (const site of scopedSites) {
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
      ageYears: !athleteAge ? typedAge : undefined,
      sex: !athleteGender ? sexInput : undefined,
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
      <span className="wk-meta-title">{label}</span>
      {hint && <span className="block wk-caption mt-1">{hint}</span>}
      <div className="relative mt-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={value}
          onFocus={onFocus}
          onChange={(e) => set(e.target.value)}
          aria-label={`${label}${UNIT_WORDS[unit] ? ` in ${UNIT_WORDS[unit]}` : ''}`}
          aria-invalid={!ok}
          className="wk-field w-full min-h-[48px] py-3 px-3 pr-10 tabular-nums focus:outline-none"
          style={ok ? undefined : { borderColor: 'var(--color-status-danger)' }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--wk-muted)] text-xs font-normal">
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
  } else if (capturePhase === 'partial' && liveScaleReading) {
    alertTitle = 'Step on with both feet';
    alertBody = `Your scale read ${units.formatPrecise(liveScaleReading.weightKg)}, which looks like a partial reading. Nothing was saved.`;
    alertTone = 'live';
  } else if (capturePhase === 'analysing') {
    alertTitle = `Weight saved: ${autoSavedBanner?.split(' ·')[0].split(' and ')[0] ?? ''}`;
    alertBody = canCaptureMetrics ? 'Stay on the scale. Measuring your body composition.' : 'Stay on for a moment while the scale finishes.';
    alertTone = 'live';
  } else if (capturePhase === 'no-body-reading' && autoSavedBanner) {
    alertTitle = 'Weight saved';
    alertBody = `${autoSavedBanner.split(' and ')[0]}. Your scale couldn't read your body composition. Next time, step on with bare, dry feet on the metal pads.`;
    alertTone = 'success';
  } else if (capturePhase === 'complete' && autoSavedBanner) {
    alertTitle = 'Measurement complete';
    alertBody = `${autoSavedBanner}. You can step off.`;
    alertTone = 'success';
  } else if (capturePhase === 'cut-short' && autoSavedBanner) {
    alertTitle = 'Weight saved';
    alertBody = canCaptureMetrics
      ? `${autoSavedBanner}. Body metrics weren't captured this time. Stay on until it says complete, about 15 seconds.`
      : `${autoSavedBanner}.`;
    alertTone = 'success';
  } else if (measuring) {
    alertTitle = `Measuring: ${units.formatPrecise(liveScaleReading!.weightKg)}`;
    alertBody = 'Stand still until it settles.';
    alertTone = 'live';
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
        background: alertTone === 'success' ? 'var(--color-status-positive-soft)' : 'var(--wk-raised)',
        border: alertTone === 'success' ? '1px solid var(--color-border-accent)' : '1px solid var(--color-border-subtle)',
      }}
    >
      <div className="flex items-center gap-3">
        {alertTone === 'success' ? (
          <Check className="w-5 h-5 text-[color:var(--wk-accent)] shrink-0 stroke-[2]" aria-hidden="true" />
        ) : alertTone === 'live' ? (
          <span className="w-2.5 h-2.5 mx-1 rounded-full shrink-0 animate-pulse motion-reduce:animate-none" style={{ background: 'var(--color-data-telemetry)' }} aria-hidden="true" />
        ) : (
          <Bluetooth className="w-5 h-5 shrink-0 stroke-[2]" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          {alertTitle && <span className="block wk-subhead">{alertTitle}</span>}
          <span className="block wk-caption leading-relaxed max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>{alertBody}</span>
        </div>
        {alertAction && (
          <button
            type="button"
            onClick={handleAlertAction}
            className="shrink-0 px-4 rounded-xl text-base font-semibold min-h-[44px] active:scale-[0.98] transition-transform"
            style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
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
                className="w-full px-3 rounded-xl text-base font-semibold text-left min-h-[44px]"
                style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
              >
                Pair {scale.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {capturePhase === 'complete' && !canCaptureMetrics && (
        <p className="text-xs text-[color:var(--wk-body)] leading-relaxed max-w-prose">Add your height, age and sex here and your next weigh-in includes body metrics.</p>
      )}
      <p className="wk-caption leading-relaxed max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
        Your scale measures body composition with a small electrical current. Don't use a scale like this if you're pregnant or have a pacemaker or other implant.
      </p>
      {bleError && <p className="text-xs font-medium" style={{ color: 'var(--color-status-danger)' }}>{bleError}</p>}
      {offerAllDevices && !scaleBusy && !nativeScanning && !scaleConnected && (
        <button
          type="button"
          onClick={() => (nativeScale ? startNativePairing(true) : handleConnectScale(true, false, true))}
          className="text-xs underline min-h-[44px]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Can't find your scale? Show all devices
        </button>
      )}
      {rememberedScale && !scaleBusy && !nativeScanning && (
        <button
          type="button"
          onClick={() => handleForgetDevice('scale')}
          className="text-xs underline min-h-[44px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Forget this scale
        </button>
      )}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === 'weight'
          ? 'Log weight'
          : singleSiteMode
          ? `Log ${activeSiteDef.label.toLowerCase()} measurement`
          : 'Log measurements'
      }
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-bg-scrim)' }}
    >
      <div className="wk-card w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {mode === 'weight' ? (
              <Scale className="w-5 h-5 stroke-[2] shrink-0" style={{ color: 'var(--color-text-primary)' }} />
            ) : (
              <Ruler className="w-5 h-5 stroke-[2] shrink-0" style={{ color: 'var(--color-text-primary)' }} />
            )}
            <h3 className="wk-h1 truncate">
              {mode === 'weight'
                ? 'Log weight'
                : singleSiteMode
                ? `Log ${activeSiteDef.label.toLowerCase()}`
                : 'Log measurements'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              disconnectBle();
              onClose();
            }}
            aria-label="Close modal"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-[var(--wk-raised)] hover:bg-[var(--wk-pill)] border flex items-center justify-center"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Auto-Saved Confirmation Banner */}
        {autoSavedBanner && mode === 'measurements' && (
          <div
            role="status"
            className="rounded-xl p-3 flex items-center gap-3"
            style={{
              background: 'var(--color-status-positive-soft)',
              border: '1px solid var(--color-border-accent)',
            }}
          >
            <Check className="w-5 h-5 text-[color:var(--wk-accent)] shrink-0 stroke-[2]" />
            <span className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{autoSavedBanner}</span>
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
                <p className="wk-caption tabular-nums">
                  New 7-day average: <strong style={{ color: 'var(--color-text-primary)' }}>{units.formatPrecise(previewEmaKg)}</strong>
                </p>
              )}
              {!heightCm &&
                field('Height', height, setHeight, lengthUnit, 'Asked once, for BMI and body metrics', lengthValid(height, 120, 230))}
              {!athleteAge && field('Age', ageInput, setAgeInput, 'yrs', 'Asked once, for body metrics', !ageInput || typedAge !== undefined)}
              {!athleteGender && (
                <div role="group" aria-label="Sex, asked once for body metrics">
                  <span className="wk-meta-title">Sex</span>
                  <span className="block wk-caption mt-1">Asked once, for body metrics</span>
                  <div className="wk-segments grid grid-cols-2 mt-2">
                    {(['male', 'female'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={sexInput === option}
                        onClick={() => setSexInput(option)}
                        className={`wk-segment capitalize text-center ${sexInput === option ? 'is-active' : ''}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {bluetoothAvailable && !(rememberedScale && scaleReachable === null) && scaleAlert}

              <button
                type="button"
                onClick={() => setShowAdvancedScaleMetrics((prev) => !prev)}
                aria-expanded={showAdvancedScaleMetrics}
                className="w-full flex items-center justify-between wk-meta-title min-h-[44px]"
              >
                <span>Add other readings</span>
                {showAdvancedScaleMetrics ? <ChevronUp className="w-4 h-4 stroke-[2]" /> : <ChevronDown className="w-4 h-4 stroke-[2]" />}
              </button>

              {showAdvancedScaleMetrics && (
                <div className="grid grid-cols-2 gap-3">
                  {RENPHO_SCALE_METRICS.filter((m) => !m.manualPrimary).map((m) => {
                    const rawMetricVal = capturedScaleMetrics[m.field as keyof RenphoScaleMetrics];
                    const displayVal =
                      rawMetricVal !== undefined && rawMetricVal > 0
                        ? m.unitKind === 'weight'
                          ? `${units.toDisplayPrecise(rawMetricVal)}`
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
          ) : singleSiteMode ? (
            <>
              {/* SINGLE-SITE MEASUREMENTS MODE (focused purely on the chosen body part) */}
              {(() => {
                const prevCm = latestSiteCmByField[activeSiteDef.id];
                const lastPart =
                  prevCm && prevCm > 0 ? ` · Last: ${fromCmToDisplay(prevCm)} ${lengthUnit}` : '';
                return field(
                  activeSiteDef.label,
                  siteValues[activeSiteDef.id],
                  (v) => setSiteValue(activeSiteDef.id, v),
                  lengthUnit,
                  `${activeSiteDef.hint}${lastPart}`,
                  lengthValid(siteValues[activeSiteDef.id], activeSiteDef.minCm, activeSiteDef.maxCm)
                );
              })()}

              {(bluetoothAvailable || Boolean(rememberedTape)) && (
                <div
                  className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                  style={{ background: 'var(--wk-raised)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Bluetooth className="w-4 h-4 stroke-[2] shrink-0" style={{ color: 'var(--color-data-telemetry)' }} />
                    <div className="min-w-0">
                      <span className="block wk-subhead truncate">
                        {liveTapeReading
                          ? `${fromCmToDisplay(liveTapeReading.lengthCm)} ${lengthUnit} ready`
                          : bleDeviceKind === 'tape'
                          ? `${bleDeviceName ?? 'Smart tape'} connected`
                          : rememberedTape
                          ? `${rememberedTape.name} ready`
                          : 'RENPHO Smart Tape'}
                      </span>
                      {(bleStatus || bleError) && (
                        <span
                          className="block wk-caption truncate"
                          style={{ color: bleError ? 'var(--color-status-danger)' : 'var(--color-text-secondary)' }}
                        >
                          {bleError ?? bleStatus}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {liveTapeReading ? (
                      <button
                        type="button"
                        onClick={() => applyTapeReadingToSite(liveTapeReading.lengthCm, activeSiteDef.id, true, true)}
                        className="wk-btn-secondary min-h-[44px]"
                        style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
                      >
                        Apply {fromCmToDisplay(liveTapeReading.lengthCm)} {lengthUnit}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleConnectTape(false, false)}
                        aria-label="Connect RENPHO Smart Tape"
                        className="wk-btn-secondary min-h-[44px]"
                      >
                        {bleDeviceKind === 'tape' ? 'Listening' : rememberedTape ? 'Reconnect' : 'Pair tape'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowAllSites(true)}
                className="wk-caption underline min-h-[44px] inline-flex items-center"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Measure other body parts
              </button>
            </>
          ) : (
            <>
              {/* GENERAL MEASUREMENTS MODE: manual-first with primary torso sites cleanly laid out */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {BODY_MEASUREMENT_SITES.filter((s) => s.primary).map((site) => {
                    const prevCm = latestSiteCmByField[site.id];
                    const prevHint =
                      prevCm && prevCm > 0 ? `Last: ${fromCmToDisplay(prevCm)} ${lengthUnit}` : undefined;
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

                <button
                  type="button"
                  onClick={() => setShowLimbSites((prev) => !prev)}
                  aria-expanded={showLimbSites}
                  className="w-full flex items-center justify-between wk-meta-title min-h-[44px]"
                >
                  <span>{showLimbSites ? 'Hide arms & legs' : 'Add arms & legs (6 sites)'}</span>
                  {showLimbSites ? <ChevronUp className="w-4 h-4 stroke-[2]" /> : <ChevronDown className="w-4 h-4 stroke-[2]" />}
                </button>

                {showLimbSites && (
                  <div className="grid grid-cols-2 gap-3">
                    {BODY_MEASUREMENT_SITES.filter((s) => !s.primary).map((site) => {
                      const prevCm = latestSiteCmByField[site.id];
                      const prevHint =
                        prevCm && prevCm > 0 ? `Last: ${fromCmToDisplay(prevCm)} ${lengthUnit}` : undefined;
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
                )}
              </div>

              {(bluetoothAvailable || Boolean(rememberedTape)) && (
                <div
                  className="rounded-xl p-3 space-y-2"
                  style={{ background: 'var(--wk-raised)', border: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bluetooth className="w-4 h-4 stroke-[2] shrink-0" style={{ color: 'var(--color-data-telemetry)' }} />
                      <div className="min-w-0">
                        <span className="block wk-subhead truncate">
                          {bleDeviceKind === 'tape'
                            ? `${bleDeviceName ?? 'Smart tape'} · ${activeSiteDef.label}`
                            : rememberedTape
                            ? `${rememberedTape.name} · Target: ${activeSiteDef.label}`
                            : 'RENPHO Smart Tape'}
                        </span>
                        <span className="block wk-caption" style={{ color: bleError ? 'var(--color-status-danger)' : 'var(--color-text-secondary)' }}>
                          {bleError ?? bleStatus ?? 'Tap a field above, then pull the tape to fill it.'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleConnectTape(false, false)}
                        aria-label="Connect RENPHO Smart Tape"
                        className="wk-btn-secondary min-h-[44px]"
                      >
                        <Ruler className="w-4 h-4 stroke-[2]" />
                        <span>{bleDeviceKind === 'tape' ? 'Listening' : rememberedTape ? 'Connect' : 'Pair tape'}</span>
                      </button>
                      {rememberedTape && (
                        <button
                          type="button"
                          onClick={() => handleForgetDevice('tape')}
                          className="wk-caption underline min-h-[44px] px-1"
                        >
                          Forget
                        </button>
                      )}
                    </div>
                  </div>

                  {liveTapeReading && (
                    <div
                      className="rounded-lg p-3 flex items-center justify-between gap-2 border"
                      style={{ background: 'var(--color-bg-canvas)', borderColor: 'var(--color-border-subtle)' }}
                    >
                      <div>
                        <span className="wk-caption block">
                          {liveTapeReading.stabilized ? 'Locked & auto-saved' : `Live → ${activeSiteDef.label}`}
                        </span>
                        <span className="wk-subhead tabular-nums">
                          {fromCmToDisplay(liveTapeReading.lengthCm)} {lengthUnit}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyTapeReadingToSite(liveTapeReading.lengthCm, activeSite, true, true)}
                        className="px-3 rounded-xl text-xs font-medium min-h-[44px]"
                        style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
                      >
                        Save to {activeSiteDef.shortLabel} &amp; next &rarr;
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowTapeHelp((v) => !v)}
                    className="wk-caption underline min-h-[44px] inline-flex items-center"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {showTapeHelp ? 'Hide tape steps' : 'How smart tape works'}
                  </button>

                  {showTapeHelp && (
                    <div
                      className="rounded-lg p-3 space-y-2 border"
                      style={{ background: 'var(--color-bg-canvas)', borderColor: 'var(--color-border-subtle)' }}
                    >
                      <span className="wk-meta-title block" style={{ color: 'var(--color-text-primary)' }}>
                        How tape measurements are pulled into the app:
                      </span>
                      <ol className="text-xs text-[color:var(--wk-body)] space-y-2 list-decimal list-inside max-w-prose">
                        <li>Focus the body site box you want to measure (currently {activeSiteDef.label}).</li>
                        <li>Wrap the RENPHO tape around that site to stream the live measurement.</li>
                        <li>Press confirm on the tape (or tap Save) to record it and advance to the next site.</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                disconnectBle();
                onClose();
              }}
              className="wk-btn-secondary w-full"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={(!valid && !autoSavedBanner) || capturePhase === 'analysing'}
              aria-label={
                mode === 'weight'
                  ? 'Save weight'
                  : singleSiteMode
                  ? `Save ${activeSiteDef.label.toLowerCase()}`
                  : 'Save measurements'
              }
              className="wk-button gap-2 whitespace-nowrap active:scale-[0.98] transition-transform"
              style={{
                background:
                  (!valid && !autoSavedBanner) || capturePhase === 'analysing'
                    ? 'var(--color-action-disabled-bg)'
                    : 'var(--color-action-primary-bg)',
                color:
                  (!valid && !autoSavedBanner) || capturePhase === 'analysing'
                    ? 'var(--color-action-disabled-fg)'
                    : 'var(--color-action-primary-fg)',
              }}
            >
              <Check className="w-4 h-4 stroke-[2]" />
              <span>
                {capturePhase === 'analysing'
                  ? 'Measuring…'
                  : autoSavedBanner && (mode === 'measurements' || capturedForm === formSnapshot)
                  ? 'Done'
                  : mode === 'weight'
                  ? 'Save weight'
                  : singleSiteMode
                  ? `Save ${activeSiteDef.label.toLowerCase()}`
                  : 'Save'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
