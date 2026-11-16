export type ImplementKind = 'plow' | 'seeder' | 'harvester' | 'sprayer';

export interface ImplementDef {
  id: string;
  name: string;
  kind: ImplementKind;
  /** Working width in metres. */
  width: number;
  price: number;
  /** Max speed (m/s) while lowered and working. */
  workSpeed: number;
  /** Fuel consumption multiplier while lowered. */
  fuelMul: number;
  /** Distance from tractor centre; positive = front-mounted, negative = towed behind. */
  offset: number;
  /** Minimum tractor horsepower needed to pull it. */
  power: number;
}

export const IMPLEMENTS: Record<string, ImplementDef> = {
  plow_s: { id: 'plow_s', name: 'Plow 3m', kind: 'plow', width: 3, price: 0, workSpeed: 6, fuelMul: 2, offset: -3.4, power: 40 },
  seeder_s: { id: 'seeder_s', name: 'Seeder 3m', kind: 'seeder', width: 3, price: 0, workSpeed: 7, fuelMul: 1.4, offset: -3.4, power: 40 },
  harvester_s: { id: 'harvester_s', name: 'Harvester 3m', kind: 'harvester', width: 3, price: 0, workSpeed: 5, fuelMul: 1.8, offset: 3.2, power: 40 },
  sprayer_s: { id: 'sprayer_s', name: 'Sprayer 6m', kind: 'sprayer', width: 6, price: 2500, workSpeed: 8, fuelMul: 1.2, offset: -3.4, power: 40 },
  plow_l: { id: 'plow_l', name: 'Plow 6m', kind: 'plow', width: 6, price: 4000, workSpeed: 6, fuelMul: 2.6, offset: -3.8, power: 80 },
  seeder_l: { id: 'seeder_l', name: 'Seeder 6m', kind: 'seeder', width: 6, price: 4500, workSpeed: 7, fuelMul: 1.8, offset: -3.8, power: 80 },
  harvester_l: { id: 'harvester_l', name: 'Harvester 6m', kind: 'harvester', width: 6, price: 9000, workSpeed: 5, fuelMul: 2.4, offset: 3.4, power: 80 },
  sprayer_l: { id: 'sprayer_l', name: 'Sprayer 12m', kind: 'sprayer', width: 12, price: 7000, workSpeed: 8, fuelMul: 1.5, offset: -3.8, power: 80 },
  plow_xl: { id: 'plow_xl', name: 'Plow 9m', kind: 'plow', width: 9, price: 12000, workSpeed: 6.5, fuelMul: 3.2, offset: -4.2, power: 180 },
  seeder_xl: { id: 'seeder_xl', name: 'Seeder 9m', kind: 'seeder', width: 9, price: 13000, workSpeed: 7.5, fuelMul: 2.3, offset: -4.2, power: 180 },
  harvester_xl: { id: 'harvester_xl', name: 'Harvester 9m', kind: 'harvester', width: 9, price: 22000, workSpeed: 5.5, fuelMul: 3, offset: 3.6, power: 180 },
  sprayer_xl: { id: 'sprayer_xl', name: 'Sprayer 18m', kind: 'sprayer', width: 18, price: 15000, workSpeed: 9, fuelMul: 1.8, offset: -4.2, power: 180 },
};

export interface TractorDef {
  id: string;
  name: string;
  price: number;
  /** Horsepower; decides which implements it can pull. */
  power: number;
  maxSpeed: number;
  accel: number;
  fuelCapacity: number;
  /** Grain tank capacity (litres) used while harvesting. */
  grainCapacity: number;
  color: number;
}

export const TRACTORS: Record<string, TractorDef> = {
  basic: { id: 'basic', name: 'Farmhand 80', price: 0, power: 80, maxSpeed: 11, accel: 4, fuelCapacity: 150, grainCapacity: 2000, color: 0xc8302a },
  scout: { id: 'scout', name: 'Scout 50', price: 6000, power: 50, maxSpeed: 16, accel: 7, fuelCapacity: 90, grainCapacity: 1200, color: 0xe07a20 },
  pro: { id: 'pro', name: 'Workhorse 200', price: 15000, power: 200, maxSpeed: 15, accel: 6, fuelCapacity: 300, grainCapacity: 5000, color: 0x2a6fc8 },
  titan: { id: 'titan', name: 'Titan 400', price: 42000, power: 400, maxSpeed: 17, accel: 7, fuelCapacity: 520, grainCapacity: 10000, color: 0x4a4f58 },
};

/** Garage list order. */
export const IMPLEMENT_KINDS: ImplementKind[] = ['plow', 'seeder', 'sprayer', 'harvester'];

export const canPull = (tractor: TractorDef, imp: ImplementDef): boolean => tractor.power >= imp.power;

// ---- Wear -------------------------------------------------------------------

/** Seconds of lowered, working use that take an implement from 100% to 0%. */
export const IMPLEMENT_LIFE = 900;
/** Metres driven that take a tractor from 100% to 0%. */
export const TRACTOR_LIFE = 20000;
/** Below this condition, performance starts to drop. */
export const WEAR_THRESHOLD = 0.5;
/** Fraction of an item's value that a full repair (0% to 100%) costs. Free starter gear counts as $2,000. */
export const REPAIR_RATE = 0.25;
const MIN_REPAIR_VALUE = 2000;

export function repairCost(price: number, condition: number): number {
  return Math.ceil(Math.max(price, MIN_REPAIR_VALUE) * REPAIR_RATE * Math.max(0, 1 - condition));
}

/** Speed multiplier for worn equipment: 1 above the threshold, falling to 0.7 at 0%. */
export function wearSpeed(condition: number): number {
  return condition >= WEAR_THRESHOLD ? 1 : 0.7 + 0.3 * (condition / WEAR_THRESHOLD);
}

/** Fuel multiplier for worn equipment: 1 above the threshold, rising to 1.4 at 0%. */
export function wearFuel(condition: number): number {
  return condition >= WEAR_THRESHOLD ? 1 : 1.4 - 0.4 * (condition / WEAR_THRESHOLD);
}
