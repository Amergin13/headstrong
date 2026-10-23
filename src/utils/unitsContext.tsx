import React, { createContext, useContext, useMemo } from 'react';
import { formatWeight, kgToUnit, roundDisplayWeight, unitToKg, WeightUnit } from './units';

interface UnitsContextValue {
  unit: WeightUnit;
  /** kg → number in display unit (rounded). */
  toDisplay: (kg: number) => number;
  /** number in display unit → kg. */
  fromDisplay: (value: number) => number;
  /** kg → "92.5 kg" / "204 lb". */
  format: (kg: number, withUnit?: boolean) => string;
}

const UnitsContext = createContext<UnitsContextValue>({
  unit: 'kg',
  toDisplay: (kg) => roundDisplayWeight(kg),
  fromDisplay: (v) => v,
  format: (kg, withUnit = true) => formatWeight(kg, 'kg', withUnit),
});

export const UnitsProvider: React.FC<{ unit?: WeightUnit; children: React.ReactNode }> = ({
  unit = 'kg',
  children,
}) => {
  const value = useMemo<UnitsContextValue>(
    () => ({
      unit,
      toDisplay: (kg) => roundDisplayWeight(kgToUnit(kg, unit)),
      fromDisplay: (v) => unitToKg(v, unit),
      format: (kg, withUnit = true) => formatWeight(kg, unit, withUnit),
    }),
    [unit]
  );
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
};

export function useUnits(): UnitsContextValue {
  return useContext(UnitsContext);
}
