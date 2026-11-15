import { describe, expect, it } from 'vitest';
import { TileState } from '../src/sim/field';
import { FUEL_PRICE, Game } from '../src/sim/game';
import { fieldReport, grainText, promptText, reversing, showGrain, speedKmh } from '../src/ui/readouts';

describe('readouts', () => {
  it('reports speed in km/h and reverse', () => {
    const g = new Game();
    g.tractor.speed = 5;
    expect(speedKmh(g)).toBe(18);
    expect(reversing(g)).toBe(false);
    g.tractor.speed = -2;
    expect(speedKmh(g)).toBe(7);
    expect(reversing(g)).toBe(true);
  });

  it('prompts for the zone the tractor is in', () => {
    const g = new Game();
    g.tractor.x = 0;
    g.tractor.z = 40;
    expect(promptText(g)).toBe('');
    g.tractor.x = -15;
    g.tractor.z = -2;
    expect(promptText(g)).toMatch(/garage/);
    g.tractor.x = 15;
    expect(promptText(g)).toMatch(/bring grain/);
    g.grain = { crop: 'wheat', amount: 120 };
    expect(promptText(g)).toBe('Press E to sell 120 L');
    g.tractor.x = 0;
    g.tractor.z = -7;
    g.fuel = g.tractorDef.fuelCapacity - 10;
    expect(promptText(g)).toBe(`Press E to refuel ($${Math.ceil(10 * FUEL_PRICE)})`);
  });

  it('shows the grain tank while harvesting or carrying grain', () => {
    const g = new Game();
    expect(showGrain(g)).toBe(true);
    g.attached = 'plow_s';
    expect(showGrain(g)).toBe(false);
    g.grain = { crop: 'corn', amount: 50 };
    expect(showGrain(g)).toBe(true);
    expect(grainText(g)).toBe(`50 / ${g.tractorDef.grainCapacity} L Corn`);
  });

  it('summarises field coverage and the tile under the implement', () => {
    const g = new Game();
    expect(fieldReport(g)).toBeNull();
    const f = g.fields[0];
    for (let i = 0; i < f.size / 2; i++) f.harvest(i);
    g.tractor.heading = 0;
    g.tractor.x = f.x + 1;
    g.tractor.z = f.z + f.depth - 1 - g.implement!.offset;
    const r = fieldReport(g)!;
    expect(r.field).toBe(f);
    expect(r.coverage).toEqual([
      { state: TileState.Ripe, share: 0.5 },
      { state: TileState.Stubble, share: 0.5 },
    ]);
    expect(r.underImplement).toBe('Ripe Wheat');
  });
});
