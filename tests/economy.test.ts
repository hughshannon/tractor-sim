import { describe, expect, it } from 'vitest';
import { CROPS, FERTILIZER_COST_PER_TILE, tileYield } from '../src/sim/crops';
import {
  IMPLEMENTS, IMPLEMENT_LIFE, TRACTORS, TRACTOR_LIFE, repairCost, wearFuel, wearSpeed,
} from '../src/sim/equipment';
import { STORAGE_LEVELS } from '../src/sim/farm';
import { Field, TileState } from '../src/sim/field';
import { Game, START_MONEY } from '../src/sim/game';
import { priceAt } from '../src/sim/market';

const drive = { throttle: 1, steer: 0, brake: false };

function placeImplementAt(g: Game, x: number, z: number) {
  g.tractor.heading = 0;
  g.tractor.x = x;
  g.tractor.z = z - g.implement!.offset;
  g.tractor.speed = 1;
}

describe('fertilizer', () => {
  it('only fertilizes growing crops, once, and boosts their yield', () => {
    const f = new Field(1, 'Test', 0, 0, 3, 1, 0, true);
    expect(f.fertilize(0)).toBe(false); // grass
    f.plow(0);
    f.seed(0, 'wheat');
    f.plow(1);
    f.seed(1, 'wheat');
    expect(f.fertilize(0)).toBe(true);
    expect(f.fertilize(0)).toBe(false);
    f.update(CROPS.wheat.growTime);
    expect(f.harvest(0)?.amount).toBe(tileYield('wheat', true));
    expect(f.harvest(1)?.amount).toBe(CROPS.wheat.yieldPerTile);
    expect(tileYield('wheat', true)).toBeGreaterThan(CROPS.wheat.yieldPerTile);
    expect(f.fert[0]).toBe(0); // cleared after harvest
  });

  it('sprays growing tiles for a fee with the sprayer', () => {
    const g = new Game();
    const f = g.fields[0];
    f.state.fill(TileState.Plowed);
    f.crop.fill(255);
    f.growth.fill(0);
    for (let i = 0; i < f.size; i++) f.seed(i, 'corn');
    g.money = 10000;
    g.buyImplement('sprayer_s');
    expect(g.attach('sprayer_s').ok).toBe(true);
    placeImplementAt(g, f.x + 20, f.z + 10);
    g.work();
    const sprayed = f.fert.reduce((n, v) => n + v, 0);
    expect(sprayed).toBeGreaterThanOrEqual(3);
    expect(g.money).toBe(10000 - IMPLEMENTS.sprayer_s.price - sprayed * FERTILIZER_COST_PER_TILE);
    g.work(); // same tiles again: no extra charge
    expect(g.money).toBe(10000 - IMPLEMENTS.sprayer_s.price - sprayed * FERTILIZER_COST_PER_TILE);
  });
});

describe('grain storage', () => {
  it('sells straight from the tank at the silo until storage is built', () => {
    const g = new Game();
    g.tractor.x = 15;
    g.tractor.z = -2;
    g.grain = { crop: 'wheat', amount: 100 };
    expect(g.interact()).toBeNull();
    expect(g.grain.amount).toBe(0);
    g.money = 100000;
    expect(g.buyStorage().ok).toBe(true);
    expect(g.interact()).toBe('silo');
  });

  it('stores grain, respects capacity and sells later at the later price', () => {
    const g = new Game();
    g.money = 100000;
    g.buyStorage();
    const cap = STORAGE_LEVELS[1].capacity;
    g.storage.corn = cap - 500;
    g.grain = { crop: 'wheat', amount: 800 };
    expect(g.unloadGrain().ok).toBe(true);
    expect(g.storage.wheat).toBe(500);
    expect(g.grain).toEqual({ crop: 'wheat', amount: 300 });
    expect(g.unloadGrain().ok).toBe(false); // full

    g.time = 500;
    const before = g.money;
    expect(g.sellStored('wheat').ok).toBe(true);
    expect(g.money - before).toBe(Math.round(500 * priceAt('wheat', 500)));
    expect(g.storage.wheat).toBe(0);
    expect(g.sellStored('wheat').ok).toBe(false);
  });

  it('upgrades storage level by level and stops at the top', () => {
    const g = new Game();
    g.money = 1e6;
    for (let i = 1; i < STORAGE_LEVELS.length; i++) expect(g.buyStorage().ok).toBe(true);
    expect(g.storageCapacity).toBe(STORAGE_LEVELS.at(-1)!.capacity);
    expect(g.buyStorage().ok).toBe(false);
    expect(g.money).toBe(1e6 - STORAGE_LEVELS.reduce((n, l) => n + l.price, 0));
  });
});

describe('wear and repairs', () => {
  it('wears the tractor by distance and the implement only while working', () => {
    const g = new Game();
    for (let i = 0; i < 600; i++) g.update(1 / 60, drive);
    expect(g.tractorWear).toBeLessThan(1);
    expect(g.tractorWear).toBeCloseTo(1 - g.tractor.odometer / TRACTOR_LIFE, 2);
    expect(g.implementWear).toBe(1);

    g.lowered = true;
    g.lowerAnim = 1;
    g.tractor.x = g.fields[0].x + 10;
    g.tractor.z = g.fields[0].z + 2;
    for (let i = 0; i < 60; i++) g.update(1 / 60, drive);
    expect(g.implementWear).toBeLessThan(1);
    expect(g.implementWear).toBeGreaterThan(1 - 2 / IMPLEMENT_LIFE);
  });

  it('slows and stops worn equipment', () => {
    expect(wearSpeed(1)).toBe(1);
    expect(wearSpeed(0.5)).toBe(1);
    expect(wearSpeed(0)).toBeCloseTo(0.7);
    expect(wearFuel(0)).toBeCloseTo(1.4);

    const g = new Game();
    g.implementCondition.set('harvester_s', 0);
    g.lowered = true;
    g.lowerAnim = 1;
    g.tractor.speed = 3;
    g.update(1 / 60, drive);
    expect(g.workingNow).toBe(false);
    expect(g.messages.at(-1)?.text).toMatch(/broken/i);
  });

  it('charges repairs by wear and item value', () => {
    const g = new Game();
    g.tractorCondition.set('basic', 0.5);
    g.implementCondition.set('plow_s', 0);
    expect(repairCost(TRACTORS.pro.price, 0.5)).toBe(Math.ceil(15000 * 0.25 * 0.5));
    const cost = repairCost(0, 0.5);
    expect(g.repairTractor('basic').ok).toBe(true);
    expect(g.money).toBe(START_MONEY - cost);
    expect(g.tractorWear).toBe(1);
    expect(g.repairTractor('basic').ok).toBe(false);
    expect(g.repairTractor('pro').ok).toBe(false); // not owned

    const all = g.repairAllCost();
    expect(all).toBe(repairCost(0, 0));
    expect(g.repairAll().ok).toBe(true);
    expect(g.implementCondition.get('plow_s')).toBe(1);
    expect(g.repairAll().ok).toBe(false);
  });

  it('new purchases start in perfect condition', () => {
    const g = new Game();
    g.money = 1e6;
    g.buyTractor('titan');
    g.buyImplement('harvester_xl');
    expect(g.tractorCondition.get('titan')).toBe(1);
    expect(g.implementCondition.get('harvester_xl')).toBe(1);
  });
});

describe('equipment tiers', () => {
  it('needs enough horsepower to attach big implements', () => {
    const g = new Game();
    g.money = 1e6;
    g.buyImplement('plow_xl');
    expect(g.attach('plow_xl').ok).toBe(false); // Farmhand 80 is too small
    expect(g.attach('plow_l').ok).toBe(false); // not owned
    g.buyTractor('pro');
    expect(g.attach('plow_xl').ok).toBe(true);
  });

  it('detaches an implement the new tractor cannot pull', () => {
    const g = new Game();
    g.money = 1e6;
    g.buyImplement('seeder_l');
    g.attach('seeder_l');
    const r = g.buyTractor('scout');
    expect(r.ok).toBe(true);
    expect(g.tractorId).toBe('scout');
    expect(g.attached).toBeNull();
    expect(g.attach('seeder_s').ok).toBe(true);
  });

  it('every tractor can pull the starter implements', () => {
    for (const t of Object.values(TRACTORS)) {
      for (const id of ['plow_s', 'seeder_s', 'harvester_s', 'sprayer_s']) expect(t.power).toBeGreaterThanOrEqual(IMPLEMENTS[id].power);
    }
  });
});
