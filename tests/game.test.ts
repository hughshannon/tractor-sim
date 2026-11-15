import { describe, expect, it } from 'vitest';
import { CROPS } from '../src/sim/crops';
import { TileState } from '../src/sim/field';
import { FUEL_PRICE, Game, START_MONEY } from '../src/sim/game';
import { priceAt } from '../src/sim/market';

const idle = { throttle: 0, steer: 0, brake: false };

/** Place the tractor so its implement sits over the given world point, facing +Z. */
function placeImplementAt(g: Game, x: number, z: number) {
  g.tractor.heading = 0;
  g.tractor.x = x;
  g.tractor.z = z - g.implement!.offset;
  g.tractor.speed = 1;
}

describe('Game', () => {
  it('starts with a ripe home field and a harvester attached', () => {
    const g = new Game();
    expect(g.money).toBe(START_MONEY);
    expect(g.fields[0].owned).toBe(true);
    expect(g.fields[0].counts()[TileState.Ripe]).toBe(g.fields[0].size);
    expect(g.implement?.kind).toBe('harvester');
  });

  it('harvests into the tank and sells at the market price', () => {
    const g = new Game();
    const f = g.fields[0];
    g.lowered = true;
    placeImplementAt(g, f.x + 10, f.z + 5);
    g.work();
    expect(g.grain.crop).toBe('wheat');
    // A 3 m bar spans 2 or 3 tiles of 2 m.
    expect(g.grain.amount).toBeGreaterThanOrEqual(2 * CROPS.wheat.yieldPerTile);

    g.tractor.x = 15;
    g.tractor.z = -2;
    const amount = g.grain.amount;
    const expected = Math.round(amount * priceAt('wheat', g.time));
    const r = g.sellGrain();
    expect(r.ok).toBe(true);
    expect(g.money).toBe(START_MONEY + expected);
    expect(g.grain.amount).toBe(0);
  });

  it('stops harvesting when the tank is full', () => {
    const g = new Game();
    g.grain = { crop: 'wheat', amount: g.tractorDef.grainCapacity - 5 };
    placeImplementAt(g, g.fields[0].x + 10, g.fields[0].z + 5);
    g.work();
    expect(g.grain.amount).toBe(g.tractorDef.grainCapacity - 5);
    expect(g.messages.at(-1)?.text).toMatch(/tank full/i);
  });

  it('plows and seeds, charging for seed', () => {
    const g = new Game();
    const f = g.fields[0];
    f.state.fill(TileState.Stubble);
    g.attach('plow_s');
    placeImplementAt(g, f.x + 10, f.z + 5);
    g.work();
    const plowed = f.counts()[TileState.Plowed];
    expect(plowed).toBeGreaterThan(0);

    g.attach('seeder_s');
    g.setSeed('corn');
    placeImplementAt(g, f.x + 10, f.z + 5);
    g.work();
    expect(f.counts()[TileState.Seeded]).toBe(plowed);
    expect(g.money).toBe(START_MONEY - plowed * CROPS.corn.seedCostPerTile);
  });

  it('does not work fields the player does not own', () => {
    const g = new Game();
    const east = g.fields[1];
    g.attach('plow_s');
    placeImplementAt(g, east.x + 10, east.z + 5);
    g.work();
    expect(east.counts()[TileState.Plowed]).toBe(0);
  });

  it('burns fuel and refuels for money', () => {
    const g = new Game();
    for (let i = 0; i < 600; i++) g.update(1 / 60, { ...idle, throttle: 1 });
    expect(g.fuel).toBeLessThan(g.tractorDef.fuelCapacity);
    const missing = g.tractorDef.fuelCapacity - g.fuel;
    const before = g.money;
    expect(g.refuel().ok).toBe(true);
    expect(g.fuel).toBeCloseTo(g.tractorDef.fuelCapacity);
    expect(before - g.money).toBe(Math.ceil(missing * FUEL_PRICE));
  });

  it('buys implements, tractors and fields only with enough money', () => {
    const g = new Game();
    expect(g.buyImplement('harvester_l').ok).toBe(false);
    g.money = 100000;
    expect(g.buyImplement('harvester_l').ok).toBe(true);
    expect(g.buyImplement('harvester_l').ok).toBe(false);
    expect(g.attach('harvester_l').ok).toBe(true);
    expect(g.buyTractor('pro').ok).toBe(true);
    expect(g.tractorId).toBe('pro');
    expect(g.buyField(2).ok).toBe(true);
    expect(g.fields[1].owned).toBe(true);
    expect(g.money).toBe(100000 - 9000 - 15000 - 12000);
  });

  it('opens the shop only at the shed', () => {
    const g = new Game();
    expect(g.interact()).toBeNull();
    g.tractor.x = -15;
    g.tractor.z = -2;
    expect(g.interact()).toBe('shop');
  });
});

describe('market', () => {
  it('drifts prices within a band around the base price', () => {
    for (let t = 0; t < 2000; t += 7) {
      const p = priceAt('wheat', t);
      expect(p).toBeGreaterThan(CROPS.wheat.basePrice * 0.7);
      expect(p).toBeLessThan(CROPS.wheat.basePrice * 1.3);
    }
    expect(priceAt('corn', 0)).not.toBe(priceAt('corn', 100));
  });
});
