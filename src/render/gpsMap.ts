import { BUILDINGS, TRACKS, ZONES } from '../sim/farm';
import { TileState } from '../sim/field';
import type { Game } from '../sim/game';

/** GPS map palette. Growing crops shade from SEEDED_FROM to SEEDED_TO as they mature. */
export const GPS_COLORS = {
  [TileState.Grass]: '#6f8f3f',
  [TileState.Plowed]: '#7b4a26',
  [TileState.Ripe]: '#e0c060',
  [TileState.Stubble]: '#ddd2ac',
  notOwned: '#4d6a33',
  building: '#4c5258',
  zone: '#b89a3a',
  yard: '#9a8a66',
  track: '#86764f',
  ground: '#2b4122',
} as const;
const SEEDED_FROM = [0x1f, 0x6a, 0x46];
const SEEDED_TO = [0x7e, 0xe2, 0xa2];

function seededColor(growth: number): string {
  const c = SEEDED_FROM.map((v, i) => Math.round(v + (SEEDED_TO[i] - v) * growth));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Colour of one GPS map texel at world position (x, z). */
export function mapColor(g: Game, x: number, z: number): string {
  for (const f of g.fields) {
    const i = f.tileAt(x, z);
    if (i < 0) continue;
    if (!f.owned) return GPS_COLORS.notOwned;
    const s = f.state[i] as TileState;
    return s === TileState.Seeded ? seededColor(f.growth[i]) : GPS_COLORS[s];
  }
  for (const b of BUILDINGS) {
    if (x >= b.box.minX && x < b.box.maxX && z >= b.box.minZ && z < b.box.maxZ) return GPS_COLORS.building;
  }
  for (const zn of ZONES) {
    if ((x - zn.x) ** 2 + (z - zn.z) ** 2 < zn.radius * zn.radius) return GPS_COLORS.zone;
  }
  for (const t of TRACKS) {
    if (Math.abs(x - t.x) < t.w / 2 && Math.abs(z - t.z) < t.d / 2) return t.yard ? GPS_COLORS.yard : GPS_COLORS.track;
  }
  return GPS_COLORS.ground;
}
