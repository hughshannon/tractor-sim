import { Field } from './field';
import type { Box } from './tractor';

export type ZoneId = 'shed' | 'silo' | 'fuel';

export interface Zone {
  id: ZoneId;
  x: number;
  z: number;
  radius: number;
  label: string;
}

export interface Building {
  kind: 'shed' | 'silo' | 'pump';
  box: Box;
}

export const WORLD_HALF = 130;

export const BUILDINGS: Building[] = [
  { kind: 'shed', box: { minX: -22, minZ: -16, maxX: -8, maxZ: -6 } },
  { kind: 'silo', box: { minX: 10, minZ: -16, maxX: 20, maxZ: -6 } },
  { kind: 'pump', box: { minX: -1, minZ: -12, maxX: 1, maxZ: -11 } },
];

export const ZONES: Zone[] = [
  { id: 'shed', x: -15, z: -2, radius: 4.5, label: 'GARAGE & SHOP' },
  { id: 'silo', x: 15, z: -2, radius: 4.5, label: 'SELL GRAIN' },
  { id: 'fuel', x: 0, z: -7, radius: 3.5, label: 'FUEL' },
];

export function createFields(): Field[] {
  return [
    new Field(1, 'Home Field', -24, 14, 24, 16, 0, true),
    new Field(2, 'East Field', 32, 14, 24, 16, 12000, false),
    new Field(3, 'West Field', -84, 14, 26, 20, 15000, false),
    new Field(4, 'North Field', -40, 62, 40, 24, 24000, false),
  ];
}

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
