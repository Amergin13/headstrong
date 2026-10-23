/**
 * Weight units. All data is stored in kilograms; pounds are a display/input layer only.
 */
export type WeightUnit = 'kg' | 'lb';

export const LB_PER_KG = 2.2046226218;

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

/**
 * Snaps a kg load to the nearest loadable increment in the athlete's unit so prescriptions
 * match real plates and dumbbells (2.5 kg / 5 lb for barbells & cables, 2 kg / 5 lb per pair of dumbbells).
 */
export function snapLoadKg(kg: number, unit: WeightUnit, equipment?: string): number {
  if (kg <= 0) return 0;
  if (unit === 'lb') {
    const stepLb = 5;
    const lb = Math.max(stepLb, Math.round((kg * LB_PER_KG) / stepLb) * stepLb);
    return lb / LB_PER_KG;
  }
  const stepKg = equipment === 'dumbbell' ? 2 : 2.5;
  return Math.max(stepKg, Math.round(kg / stepKg) * stepKg);
}
