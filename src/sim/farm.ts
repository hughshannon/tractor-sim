import { Field, type Obstacle } from './field';
import type { Box } from './tractor';

export type ZoneId = 'shed' | 'silo' | 'fuel' | 'bank' | 'stand';

export interface Zone {
  id: ZoneId;
  x: number;
  z: number;
  radius: number;
  label: string;
}

export interface Building {
  kind: 'shed' | 'silo' | 'pump' | 'bank' | 'stand';
  box: Box;
}

export const WORLD_HALF = 130;

export const BUILDINGS: Building[] = [
  { kind: 'shed', box: { minX: -22, minZ: -16, maxX: -8, maxZ: -6 } },
  { kind: 'silo', box: { minX: 10, minZ: -16, maxX: 20, maxZ: -6 } },
  { kind: 'pump', box: { minX: -1, minZ: -12, maxX: 1, maxZ: -11 } },
  { kind: 'bank', box: { minX: -34, minZ: -13, maxX: -26, maxZ: -6 } },
  /** Roadside stand: the counter faces the road (+Z); the tractor restocks it from the yard side. */
  { kind: 'stand', box: { minX: 26, minZ: -1, maxX: 32, maxZ: 2 } },
];

export const ZONES: Zone[] = [
  { id: 'shed', x: -15, z: -2, radius: 4.5, label: 'GARAGE & SHOP' },
  { id: 'silo', x: 15, z: -2, radius: 4.5, label: 'SELL GRAIN' },
  { id: 'fuel', x: 0, z: -7, radius: 3.5, label: 'FUEL' },
  { id: 'bank', x: -30, z: -2, radius: 3.5, label: 'BANK' },
  { id: 'stand', x: 29, z: -5, radius: 3.5, label: 'FARM STAND' },
];

export function createFields(): Field[] {
  return [
    new Field(1, 'Home Field', -24, 14, 24, 16, 0, true),
    new Field(2, 'East Field', 32, 14, 24, 16, 12000, false),
    new Field(3, 'West Field', -84, 14, 26, 20, 15000, false),
    new Field(4, 'North Field', -40, 62, 40, 24, 24000, false),
    // Cheap land south of the yard, strewn with giant boulders you have to farm around.
    new Field(5, 'Boulder Meadow', 48, -74, 26, 20, 9000, false, BOULDERS[5]),
    new Field(6, 'Rocky Ridge', -104, -96, 30, 24, 13000, false, BOULDERS[6]),
  ];
}

/** Giant boulders per field id, spaced so a tractor can always squeeze between them. */
export const BOULDERS: Record<number, Obstacle[]> = {
  5: [
    { x: 59, z: -61, radius: 2.6 },
    { x: 77, z: -46, radius: 3.2 },
    { x: 91, z: -64, radius: 2.3 },
    { x: 66, z: -42, radius: 1.9 },
    { x: 84, z: -57, radius: 1.7 },
  ],
  6: [
    { x: -92, z: -84, radius: 3.0 },
    { x: -75, z: -71, radius: 3.6 },
    { x: -57, z: -86, radius: 2.4 },
    { x: -89, z: -59, radius: 2.2 },
    { x: -61, z: -59, radius: 3.0 },
    { x: -51, z: -73, radius: 2.0 },
    { x: -74, z: -89, radius: 1.8 },
  ],
};

export function zoneAt(x: number, z: number): Zone | null {
  for (const zone of ZONES) {
    const dx = x - zone.x, dz = z - zone.z;
    if (dx * dx + dz * dz <= zone.radius * zone.radius) return zone;
  }
  return null;
}

/** Silo storage upgrades. Level 0 has no storage: grain must be sold straight from the tank. */
export const STORAGE_LEVELS: { capacity: number; price: number; name: string }[] = [
  { capacity: 0, price: 0, name: 'No storage' },
  { capacity: 10000, price: 6000, name: 'Grain bin 10,000 L' },
  { capacity: 25000, price: 12000, name: 'Grain bins 25,000 L' },
  { capacity: 60000, price: 25000, name: 'Storage silo 60,000 L' },
];
