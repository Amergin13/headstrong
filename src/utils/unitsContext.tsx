import React, { createContext, useContext, useMemo } from 'react';
import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  formatPreciseWeight,
  formatWeight,
  HeightUnit,
  kgToUnit,
  roundDisplayWeight,
  unitToKg,
  WeightUnit,
} from './units';

interface UnitsContextValue {
  unit: WeightUnit;
  heightUnit: HeightUnit;
  /** kg → number in display unit (rounded). */
  toDisplay: (kg: number) => number;
  /** number in display unit → kg. */
  fromDisplay: (value: number) => number;
  /** kg → "92.5 kg" / "204 lb". */
  format: (kg: number, withUnit?: boolean) => string;
  /** Calculated values such as an estimated max, to 0.1: the same figure on every page. */
  formatPrecise: (kg: number) => string;
  /** A measured value (a weigh-in) in the athlete's unit, to 0.1. */
  toDisplayPrecise: (kg: number) => number;
  /** cm → "178 cm" or "5'10\"". */
  formatHeight: (cm: number) => string;
  cmToFeetInches: (cm: number) => { feet: number; inches: number };
  feetInchesToCm: (feet: number, inches: number) => number;
}

const UnitsContext = createContext<UnitsContextValue>({
  unit: 'kg',
  heightUnit: 'cm',
  toDisplay: (kg) => roundDisplayWeight(kg),
  fromDisplay: (v) => v,
  format: (kg, withUnit = true) => formatWeight(kg, 'kg', withUnit),
  formatPrecise: (kg) => formatPreciseWeight(kg, 'kg'),
  toDisplayPrecise: (kg) => Math.round(kg * 10) / 10,
  formatHeight: (cm) => formatHeight(cm, 'cm'),
  cmToFeetInches,
  feetInchesToCm,
});

export const UnitsProvider: React.FC<{
  unit?: WeightUnit;
  heightUnit?: HeightUnit;
  children: React.ReactNode;
}> = ({ unit = 'kg', heightUnit, children }) => {
  const effectiveHeightUnit: HeightUnit = heightUnit ?? (unit === 'lb' ? 'ft_in' : 'cm');
  const value = useMemo<UnitsContextValue>(
    () => ({
      unit,
      heightUnit: effectiveHeightUnit,
      toDisplay: (kg) => roundDisplayWeight(kgToUnit(kg, unit)),
      fromDisplay: (v) => unitToKg(v, unit),
      format: (kg, withUnit = true) => formatWeight(kg, unit, withUnit),
      formatPrecise: (kg) => formatPreciseWeight(kg, unit),
      toDisplayPrecise: (kg) => Math.round(kgToUnit(kg, unit) * 10) / 10,
      formatHeight: (cm) => formatHeight(cm, effectiveHeightUnit),
      cmToFeetInches,
      feetInchesToCm,
    }),
    [unit, effectiveHeightUnit]
  );
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
};

export function useUnits(): UnitsContextValue {
  return useContext(UnitsContext);
}
