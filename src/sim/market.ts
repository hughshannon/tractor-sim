import { CROPS, type CropId } from './crops';

const WAVES: Record<CropId, { period: number; phase: number }> = {
  wheat: { period: 240, phase: 0 },
  corn: { period: 310, phase: 2.1 },
  canola: { period: 200, phase: 4.2 },
};

/** Deterministic drifting market price per litre at game time t (seconds). */
export function priceAt(crop: CropId, t: number): number {
  const { period, phase } = WAVES[crop];
  const base = CROPS[crop].basePrice;
  const swing =
    0.2 * Math.sin((2 * Math.PI * t) / period + phase) +
    0.08 * Math.sin((2 * Math.PI * t) / (period * 0.37) + phase * 1.7);
  return Math.round(base * (1 + swing) * 100) / 100;
}

/** Price trend (-1 falling, 0 flat, 1 rising) over the next few seconds. */
export function priceTrend(crop: CropId, t: number): -1 | 0 | 1 {
  const d = priceAt(crop, t + 5) - priceAt(crop, t);
  if (d > 0.005) return 1;
  if (d < -0.005) return -1;
  return 0;
}
