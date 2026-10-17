import { Gender } from './types';

export const DOTS_CONSTANTS = {
  male: {
    A: -0.0000010930,
    B: 0.0007391293,
    C: -0.1918759221,
    D: 24.0900756,
    E: -307.75076,
  },
  female: {
    A: -0.0000010706,
    B: 0.0005158568,
    C: -0.1126655495,
    D: 13.6175032,
    E: -57.96288,
  },
};

/**
 * Calculates official international DOTS coefficient denominator polynomial:
 * Denominator = A*w^4 + B*w^3 + C*w^2 + D*w + E
 * where w is bodyweight (or 7-day EMA bodyweight) in kg.
 */
export function calculateDotsDenominator(bodyweightEmaKg: number, gender: Gender = 'male'): number {
  const c = DOTS_CONSTANTS[gender];
  const w = Math.max(40, Math.min(220, bodyweightEmaKg)); // clamp reasonable ranges
  const w2 = w * w;
  const w3 = w2 * w;
  const w4 = w3 * w;

  return c.A * w4 + c.B * w3 + c.C * w2 + c.D * w + c.E;
}

/**
 * Official International DOTS Polynomial:
 * DOTS = E1RM_kg * (500 / (A*w^4 + B*w^3 + C*w^2 + D*w + E))
 */
export function calculateDotsScore(
  totalOrE1rmKg: number,
  bodyweightEmaKg: number,
  gender: Gender = 'male'
): number {
  if (totalOrE1rmKg <= 0 || bodyweightEmaKg <= 0) return 0;
  const denominator = calculateDotsDenominator(bodyweightEmaKg, gender);
  if (denominator <= 0) return 0;

  const dots = totalOrE1rmKg * (500 / denominator);
  return Math.round(dots * 100) / 100;
}
