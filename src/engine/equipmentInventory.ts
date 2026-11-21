import { EquipmentInventory, TrainingLocation, UserProfile } from './types';
import { LB_PER_KG, snapLoadKg, WeightUnit } from '../utils/units';

export const STANDARD_PLATES_BY_UNIT: Record<WeightUnit, readonly number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export const STANDARD_BARS_BY_UNIT: Record<WeightUnit, readonly number[]> = {
  kg: [20, 15],
  lb: [45, 35],
};

/** Default full-gym inventory (generous commercial plate rack + full dumbbell rack). */
export function createDefaultEquipmentInventory(
  location: 'gym' | 'home',
  unit: WeightUnit = 'kg'
): EquipmentInventory {
  if (unit === 'lb') {
    return location === 'home'
      ? {
          barWeightKg: 45 / LB_PER_KG,
          plateUnit: 'lb',
          platePairs: { '45': 2, '35': 1, '25': 1, '10': 2, '5': 2, '2.5': 1 },
          dumbbellMode: 'range',
          dumbbellMinKg: 5 / LB_PER_KG,
          dumbbellMaxKg: 50 / LB_PER_KG,
          dumbbellStepKg: 5 / LB_PER_KG,
        }
      : {
          barWeightKg: 45 / LB_PER_KG,
          plateUnit: 'lb',
          platePairs: { '45': 6, '35': 2, '25': 2, '10': 3, '5': 2, '2.5': 2 },
          dumbbellMode: 'range',
          dumbbellMinKg: 5 / LB_PER_KG,
          dumbbellMaxKg: 120 / LB_PER_KG,
          dumbbellStepKg: 5 / LB_PER_KG,
        };
  }

  return location === 'home'
    ? {
        barWeightKg: 20,
        plateUnit: 'kg',
        platePairs: { '25': 0, '20': 2, '15': 1, '10': 2, '5': 2, '2.5': 2, '1.25': 1 },
        dumbbellMode: 'range',
        dumbbellMinKg: 2,
        dumbbellMaxKg: 30,
        dumbbellStepKg: 2,
      }
    : {
        barWeightKg: 20,
        plateUnit: 'kg',
        platePairs: { '25': 4, '20': 6, '15': 2, '10': 3, '5': 2, '2.5': 2, '1.25': 2 },
        dumbbellMode: 'range',
        dumbbellMinKg: 2,
        dumbbellMaxKg: 60,
        dumbbellStepKg: 2,
      };
}

/** Returns the active location's custom inventory if saved, or undefined if using standard defaults. */
export function getActiveEquipmentInventory(
  profile?: Pick<UserProfile, 'activeLocation' | 'equipmentInventories'> | null,
  locationOverride?: TrainingLocation
): EquipmentInventory | undefined {
  const loc = locationOverride ?? profile?.activeLocation ?? 'gym';
  if (loc !== 'gym' && loc !== 'home') return undefined;
  return profile?.equipmentInventories?.[loc];
}

export interface PlateSolveResult {
  platesPerSide: number[];
  achievedTotal: number;
  remainderTotal: number;
  maxLoadableTotal: number;
}

/**
 * Bounded per-side plate solver respecting exact available plate pair counts.
 * Uses exact subset-sum search over the bounded inventory so home gyms with limited pairs
 * (e.g. only 1×15 kg + 2×5 kg) always find the closest achievable combination without
 * ever prescribing plates the athlete doesn't own.
 */
export function calculateBarbellPlatesForInventory(
  targetTotal: number,
  barWeight: number,
  platePairs: Record<string, number>
): PlateSolveResult {
  const denominations = Object.entries(platePairs)
    .map(([k, count]) => ({ weight: Number(k), pairs: Math.max(0, Math.floor(Number(count) || 0)) }))
    .filter((p) => Number.isFinite(p.weight) && p.weight > 0 && p.pairs > 0)
    .sort((a, b) => b.weight - a.weight);

  const maxSideSum = denominations.reduce((sum, p) => sum + p.weight * p.pairs, 0);
  const maxLoadableTotal = Math.round((barWeight + maxSideSum * 2) * 100) / 100;

  if (targetTotal <= barWeight || denominations.length === 0) {
    return {
      platesPerSide: [],
      achievedTotal: Math.round(barWeight * 100) / 100,
      remainderTotal: Math.max(0, Math.round((targetTotal - barWeight) * 100) / 100),
      maxLoadableTotal,
    };
  }

  const desiredSide = Math.max(0, (targetTotal - barWeight) / 2);

  // Convert weights to integer quarter-units (0.25 resolution handles 1.25, 2.5, 0.5 cleanly)
  const SCALE = 4;
  const targetUnits = Math.round(desiredSide * SCALE);
  const maxUnits = Math.round(maxSideSum * SCALE);
  const capUnits = Math.min(maxUnits, targetUnits + 20); // allow slight overshoot to find nearest achievable

  // Bounded DP: store best (fewest plates) combination for each reachable side sum
  const bestCombo = new Map<number, number[]>();
  bestCombo.set(0, []);

  for (const { weight, pairs } of denominations) {
    const wUnits = Math.round(weight * SCALE);
    if (wUnits <= 0) continue;
    for (let p = 0; p < pairs; p++) {
      const snapshot = Array.from(bestCombo.entries());
      for (const [sumU, combo] of snapshot) {
        const nextU = sumU + wUnits;
        if (nextU > capUnits) continue;
        const candidate = [...combo, weight];
        const existing = bestCombo.get(nextU);
        if (!existing || candidate.length < existing.length) {
          bestCombo.set(nextU, candidate);
        }
      }
    }
  }

  // Pick closest achievable sum not exceeding target when tie-breaking, else nearest overall
  let chosenUnits = 0;
  let bestDiff = Infinity;
  for (const sumU of bestCombo.keys()) {
    const diff = Math.abs(sumU - targetUnits);
    if (diff < bestDiff || (diff === bestDiff && sumU <= targetUnits && chosenUnits > targetUnits)) {
      bestDiff = diff;
      chosenUnits = sumU;
    }
  }

  // For plate calculator display, prefer <= target if user asks "what plates make X"
  let floorUnits = 0;
  for (const sumU of bestCombo.keys()) {
    if (sumU <= targetUnits && sumU > floorUnits) {
      floorUnits = sumU;
    }
  }
  const exactUnder = floorUnits === targetUnits ? floorUnits : bestDiff <= 2 ? chosenUnits : floorUnits;
  const platesPerSide = (bestCombo.get(exactUnder) ?? []).sort((a, b) => b - a);
  const sideAchieved = platesPerSide.reduce((s, w) => s + w, 0);
  const achievedTotal = Math.round((barWeight + sideAchieved * 2) * 100) / 100;
  const remainderTotal = Math.round(Math.abs(targetTotal - achievedTotal) * 100) / 100;

  return {
    platesPerSide,
    achievedTotal,
    remainderTotal,
    maxLoadableTotal,
  };
}

/**
 * Generates the sorted list of loadable per-dumbbell weights (in kg) for an inventory.
 */
export function getAvailableDumbbellWeightsKg(inventory: EquipmentInventory): number[] {
  if (inventory.dumbbellMode === 'fixed_list' && Array.isArray(inventory.availableDumbbellsKg)) {
    return [...new Set(inventory.availableDumbbellsKg.filter((w) => Number.isFinite(w) && w > 0))].sort(
      (a, b) => a - b
    );
  }
  const min = Math.max(0.5, inventory.dumbbellMinKg ?? 2);
  const max = Math.max(min, inventory.dumbbellMaxKg ?? 50);
  const step = Math.max(0.5, inventory.dumbbellStepKg ?? 2);
  const weights: number[] = [];
  for (let w = min; w <= max + 1e-6; w += step) {
    weights.push(Math.round(w * 100) / 100);
    if (weights.length > 200) break;
  }
  return weights;
}

/**
 * Snaps a prescribed kg weight to the nearest weight actually loadable with the athlete's
 * gym/home plate inventory or dumbbell rack. Falls back cleanly to `snapLoadKg` when no
 * custom inventory is provided or the equipment is cable/machine/bodyweight.
 */
export function snapWeightToInventory(
  kg: number,
  equipment: string | undefined,
  unit: WeightUnit,
  inventory?: EquipmentInventory | null
): number {
  if (kg <= 0) return 0;
  if (!inventory) return snapLoadKg(kg, unit, equipment);

  if (equipment === 'dumbbell') {
    const weights = getAvailableDumbbellWeightsKg(inventory);
    if (weights.length === 0) return snapLoadKg(kg, unit, equipment);
    let best = weights[0];
    let bestDiff = Math.abs(weights[0] - kg);
    for (const w of weights) {
      const diff = Math.abs(w - kg);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = w;
      }
    }
    return best;
  }

  if (equipment === 'barbell') {
    const toInvUnit = (vKg: number) => (inventory.plateUnit === 'lb' ? vKg * LB_PER_KG : vKg);
    const fromInvUnit = (vInv: number) => (inventory.plateUnit === 'lb' ? vInv / LB_PER_KG : vInv);
    const barInv = Math.round(toInvUnit(inventory.barWeightKg) * 2) / 2;
    const targetInv = toInvUnit(kg);
    if (targetInv <= barInv) return fromInvUnit(barInv);
    const solved = calculateBarbellPlatesForInventory(targetInv, barInv, inventory.platePairs);
    return Math.round(fromInvUnit(solved.achievedTotal) * 100) / 100;
  }

  return snapLoadKg(kg, unit, equipment);
}

/** Returns the smallest loadable weight step (in kg) for an equipment type given an inventory. */
export function getInventoryStepKg(
  equipment: string | undefined,
  unit: WeightUnit,
  inventory?: EquipmentInventory | null
): number {
  if (inventory && equipment === 'dumbbell') {
    if (inventory.dumbbellMode === 'range' && inventory.dumbbellStepKg && inventory.dumbbellStepKg > 0) {
      return inventory.dumbbellStepKg;
    }
    const list = getAvailableDumbbellWeightsKg(inventory);
    if (list.length >= 2) {
      let minStep = Infinity;
      for (let i = 1; i < list.length; i++) {
        const d = list[i] - list[i - 1];
        if (d > 0.05 && d < minStep) minStep = d;
      }
      if (Number.isFinite(minStep)) return Math.round(minStep * 100) / 100;
    }
  }
  if (inventory && equipment === 'barbell') {
    const activePlates = Object.entries(inventory.platePairs)
      .filter(([, count]) => (count || 0) > 0)
      .map(([w]) => Number(w))
      .filter((w) => Number.isFinite(w) && w > 0);
    if (activePlates.length > 0) {
      const smallestPlate = Math.min(...activePlates);
      const stepInv = smallestPlate * 2;
      return inventory.plateUnit === 'lb' ? stepInv / LB_PER_KG : stepInv;
    }
  }
  if (unit === 'lb') return 5 / LB_PER_KG;
  return equipment === 'dumbbell' ? 1 : 2.5;
}
