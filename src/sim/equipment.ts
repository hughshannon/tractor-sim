export type ImplementKind = 'plow' | 'seeder' | 'harvester';

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
}

export const IMPLEMENTS: Record<string, ImplementDef> = {
  plow_s: { id: 'plow_s', name: 'Plow 3m', kind: 'plow', width: 3, price: 0, workSpeed: 6, fuelMul: 2, offset: -3.4 },
  seeder_s: { id: 'seeder_s', name: 'Seeder 3m', kind: 'seeder', width: 3, price: 0, workSpeed: 7, fuelMul: 1.4, offset: -3.4 },
  harvester_s: { id: 'harvester_s', name: 'Harvester 3m', kind: 'harvester', width: 3, price: 0, workSpeed: 5, fuelMul: 1.8, offset: 3.2 },
  plow_l: { id: 'plow_l', name: 'Plow 6m', kind: 'plow', width: 6, price: 4000, workSpeed: 6, fuelMul: 2.6, offset: -3.8 },
  seeder_l: { id: 'seeder_l', name: 'Seeder 6m', kind: 'seeder', width: 6, price: 4500, workSpeed: 7, fuelMul: 1.8, offset: -3.8 },
  harvester_l: { id: 'harvester_l', name: 'Harvester 6m', kind: 'harvester', width: 6, price: 9000, workSpeed: 5, fuelMul: 2.4, offset: 3.4 },
};

export interface TractorDef {
  id: string;
  name: string;
  price: number;
  maxSpeed: number;
  accel: number;
  fuelCapacity: number;
  /** Grain tank capacity (litres) used while harvesting. */
  grainCapacity: number;
  color: number;
}

export const TRACTORS: Record<string, TractorDef> = {
  basic: { id: 'basic', name: 'Farmhand 80', price: 0, maxSpeed: 11, accel: 4, fuelCapacity: 150, grainCapacity: 2000, color: 0xc8302a },
  pro: { id: 'pro', name: 'Workhorse 200', price: 15000, maxSpeed: 15, accel: 6, fuelCapacity: 300, grainCapacity: 5000, color: 0x2a6fc8 },
};
