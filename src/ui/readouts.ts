import { CROPS } from '../sim/crops';
import { type Field, TileState } from '../sim/field';
import { FUEL_PRICE, type Game } from '../sim/game';

/**
 * Plain-data readouts shared by the screen HUD and the in-cab instruments, so both always agree.
 */

export const STATE_NAMES: Record<TileState, string> = {
  [TileState.Grass]: 'Grass',
  [TileState.Plowed]: 'Plowed',
  [TileState.Seeded]: 'Growing',
  [TileState.Ripe]: 'Ripe',
  [TileState.Stubble]: 'Stubble',
};

/** Display order for field coverage: most valuable first. */
export const STATE_ORDER: TileState[] = [TileState.Ripe, TileState.Seeded, TileState.Plowed, TileState.Stubble, TileState.Grass];

export function speedKmh(g: Game): number {
  return Math.round(Math.abs(g.tractor.speed) * 3.6);
}

export function reversing(g: Game): boolean {
  return g.tractor.speed < -0.1;
}

export function implementStateText(g: Game): string {
  if (!g.implement) return 'Attach one at the garage';
  return g.lowered ? '▼ LOWERED — working' : '▲ Raised  [Space] to lower';
}

/** Whether the grain tank is worth showing: harvesting, or still carrying grain. */
export function showGrain(g: Game): boolean {
  return g.implement?.kind === 'harvester' || g.grain.amount > 0;
}

export function grainText(g: Game): string {
  return `${g.grain.amount} / ${g.tractorDef.grainCapacity} L${g.grain.crop ? ' ' + CROPS[g.grain.crop].name : ''}`;
}

/** Contextual action prompt for the zone the tractor is in, or '' when there is nothing to do. */
export function promptText(g: Game): string {
  const zone = g.zone;
  if (zone?.id === 'shed') return 'Press E to open the garage & shop';
  if (zone?.id === 'silo') return g.grain.amount > 0 ? `Press E to sell ${g.grain.amount} L` : 'Silo: bring grain here to sell';
  if (zone?.id === 'fuel') return `Press E to refuel ($${Math.ceil((g.tractorDef.fuelCapacity - g.fuel) * FUEL_PRICE)})`;
  return '';
}

export interface FieldReport {
  field: Field;
  /** Share of the field in each state (0..1), in STATE_ORDER, omitting empty states. */
  coverage: { state: TileState; share: number }[];
  /** What is under the implement right now, e.g. "Growing Corn 42%", or '' if off the field. */
  underImplement: string;
}

/** Coverage of the field the tractor (or its implement) is in, or null when on neither. */
export function fieldReport(g: Game): FieldReport | null {
  const p = g.implementPos();
  const f = g.fieldAt(g.tractor.x, g.tractor.z) ?? g.fieldAt(p.x, p.z);
  if (!f) return null;
  const c = f.counts();
  const ti = f.tileAt(p.x, p.z);
  let underImplement = '';
  if (ti >= 0) {
    const s = f.state[ti] as TileState;
    const crop = f.cropAt(ti);
    underImplement = STATE_NAMES[s] + (crop ? ` ${CROPS[crop].name}` : '') +
      (s === TileState.Seeded ? ` ${Math.round(f.growth[ti] * 100)}%` : '');
  }
  return {
    field: f,
    coverage: STATE_ORDER.filter((s) => c[s] > 0).map((state) => ({ state, share: c[state] / f.size })),
    underImplement,
  };
}

export const percent = (share: number) => `${Math.round(share * 100)}%`;
