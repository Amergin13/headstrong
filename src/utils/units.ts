/**
 * Weight & height units. All data is stored in metric (kilograms & centimeters);
 * pounds and feet/inches are a display/input layer only.
 */
export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ft_in';

export const LB_PER_KG = 2.2046226218;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

export function resolveHeightUnit(profile?: { heightUnit?: HeightUnit; weightUnit?: WeightUnit }): HeightUnit {
  if (profile?.heightUnit === 'cm' || profile?.heightUnit === 'ft_in') {
    return profile.heightUnit;
  }
  return profile?.weightUnit === 'lb' ? 'ft_in' : 'cm';
}

/** Converts centimeters to rounded whole feet + inches (handling 12-inch rollover cleanly). */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.max(0, Math.round(cm / CM_PER_INCH));
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
}

/** Converts feet + inches to whole centimeters. */
export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH);
}

/** Formats a stored height in cm for display, e.g. "178 cm" or "5'10\"". */
export function formatHeight(cm: number, unit: HeightUnit): string {
  if (unit === 'ft_in') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg;
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value / LB_PER_KG : value;
}

/** Rounds a value already in the display unit to a sensible display precision (0.5 kg / 0.5 lb). */
export function roundDisplayWeight(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Formats a stored kg value for display, e.g. "92.5 kg" or "204 lb". */
export function formatWeight(kg: number, unit: WeightUnit, withUnit = true): string {
  const v = roundDisplayWeight(kgToUnit(kg, unit));
  const text = Number.isInteger(v) ? `${v}` : v.toFixed(1);
  return withUnit ? `${text} ${unit}` : text;
}

/** A calculated value to 0.1, e.g. an estimated max of "63.3 kg": never rounded to plate sizes. */
export function formatPreciseWeight(kg: number, unit: WeightUnit): string {
  return `${Math.round(kgToUnit(kg, unit) * 10) / 10} ${unit}`;
}

/**
 * Snaps a kg load to the nearest loadable increment in the athlete's unit so prescriptions
 * match real plates and dumbbells (2.5 kg / 5 lb for barbells & cables, 1 kg / 5 lb per dumbbell).
 */
export function snapLoadKg(kg: number, unit: WeightUnit, equipment?: string): number {
  if (kg <= 0) return 0;
  if (unit === 'lb') {
    const stepLb = 5;
    const lb = Math.max(stepLb, Math.round((kg * LB_PER_KG) / stepLb) * stepLb);
    return lb / LB_PER_KG;
  }
  const stepKg = equipment === 'dumbbell' ? 1 : 2.5;
  return Math.max(stepKg, Math.round(kg / stepKg) * stepKg);
}
