import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { NO_CROP, TileState } from '../src/sim/field';
import { BACKUP_KEY, decodeSave, FarmSaves, SAVE_KEY, SAVE_VERSION, snapshot } from '../src/sim/save';

class MemoryStorage {
  values = new Map<string, string>();
  failKey: string | null = null;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('Storage full');
    this.values.set(key, value);
  }
}

/** Keys added in save version 3. */
const V3_KEYS = ['loan', 'loanMissed', 'standLevel', 'standStock', 'standPriceLevel', 'standToday'];

function setup() {
  const storage = new MemoryStorage();
  const saves = new FarmSaves(() => storage);
  return { storage, saves };
}

describe('farm save data', () => {
  it('round trips purchases, tractor state, fuel, grain, money and every field tile', () => {
    const game = new Game();
    game.money = 100000;
    game.buyTractor('pro');
    game.buyImplement('seeder_l');
    game.attach('seeder_l');
    game.buyField(2);
    game.setSeed('corn');
    game.time = 45.75;
    game.fuel = 40.25;
    game.lowered = true;
    game.lowerAnim = 0.75;
    game.tractor = { x: 30, z: 40, heading: 1.2, speed: 3, steer: -0.2, odometer: 200 };
    game.grain = { crop: 'canola', amount: 50 };
    game.stats = { earned: 2000, harvested: 1500, standEarned: 300 };
    game.fields[0].harvest(0);
    game.fields[0].plow(0);
    game.fields[0].seed(0, 'corn');
    game.fields[0].update(30);
    game.fields[1].plow(0);
    game.fields[1].seed(0, 'canola');
    const saved = snapshot(game);
    const restored = decodeSave(JSON.stringify(saved));
    expect(snapshot(restored)).toEqual(saved);
    expect(restored.fields[0].growth).toBeInstanceOf(Float32Array);
    expect(restored.fields[0].state).toBeInstanceOf(Uint8Array);
    restored.fields[0].update(150);
    expect(restored.fields[0].state[0]).toBe(TileState.Ripe);
    expect(restored.fields[0].harvest(0)?.crop).toBe('corn');
    expect(restored.buyImplement('seeder_l').ok).toBe(false);
    expect(restored.selectTractor('basic').ok).toBe(true);
  });

  it('round trips wear, storage and fertilized tiles', () => {
    const game = new Game();
    game.money = 1e6;
    game.buyStorage();
    game.buyStorage();
    game.storage = { wheat: 1200, corn: 0, canola: 340 };
    game.buyTractor('titan');
    game.tractorCondition.set('basic', 0.42);
    game.implementCondition.set('harvester_s', 0.1);
    const f = game.fields[0];
    f.harvest(5);
    f.plow(5);
    f.seed(5, 'canola');
    f.fertilize(5);
    const saved = snapshot(game);
    const restored = decodeSave(JSON.stringify(saved));
    expect(snapshot(restored)).toEqual(saved);
    expect(restored.tractorCondition.get('basic')).toBe(0.42);
    expect(restored.fields[0].fert[5]).toBe(1);
    expect(restored.storageCapacity).toBe(25000);
  });

  it('upgrades a version 1 save with perfect equipment, no storage and no fertilizer', () => {
    const game = new Game();
    game.money = 5000;
    game.fields[0].harvest(0);
    const v1: Record<string, unknown> = { ...snapshot(game), version: 1 };
    delete v1.tractorCondition;
    delete v1.implementCondition;
    delete v1.storageLevel;
    delete v1.storage;
    for (const key of V3_KEYS) delete v1[key];
    v1.stats = { earned: 0, harvested: 0 };
    v1.fields = (v1.fields as Record<string, unknown>[]).map(({ fert: _, ...rest }) => rest);
    const restored = decodeSave(JSON.stringify(v1));
    expect(restored.money).toBe(5000);
    expect(restored.fields[0].state[0]).toBe(TileState.Stubble);
    expect([...restored.tractorCondition]).toEqual([['basic', 1]]);
    expect(restored.implementCondition.get('harvester_s')).toBe(1);
    expect(restored.storageLevel).toBe(0);
    expect(restored.fields[0].fert.every((v) => v === 0)).toBe(true);
    expect(restored.loan).toBe(0);
    expect(snapshot(restored).version).toBe(SAVE_VERSION);
  });

  it('upgrades a version 2 save with no loan, an empty cart and fair prices', () => {
    const game = new Game();
    game.money = 7000;
    game.storageLevel = 1;
    game.storage.corn = 900;
    const v2: Record<string, unknown> = { ...snapshot(game), version: 2, stats: { earned: 10, harvested: 20 } };
    for (const key of V3_KEYS) delete v2[key];
    const restored = decodeSave(JSON.stringify(v2));
    expect(restored.money).toBe(7000);
    expect(restored.storage.corn).toBe(900);
    expect(restored.loan).toBe(0);
    expect(restored.standLevel).toBe(0);
    expect(restored.standStock).toEqual({ potato: 0, tomato: 0, pumpkin: 0, sunflower: 0 });
    expect(restored.stats).toEqual({ earned: 10, harvested: 20, standEarned: 0 });
    expect(snapshot(restored).version).toBe(SAVE_VERSION);
  });

  it('round trips loans, the farm stand and vegetable crops', () => {
    const game = new Game();
    game.money = 1e5;
    game.borrow(4000);
    game.loanMissed = 2;
    game.buyStandUpgrade();
    game.standStock = { potato: 120, tomato: 0, pumpkin: 14, sunflower: 60 };
    game.setStandPrice(2);
    game.standToday = 345;
    game.grain = { crop: 'tomato', amount: 80 };
    game.fields[0].harvest(3);
    game.fields[0].plow(3);
    game.fields[0].seed(3, 'sunflower');
    const saved = snapshot(game);
    const restored = decodeSave(JSON.stringify(saved));
    expect(snapshot(restored)).toEqual(saved);
    expect(restored.fields[0].cropAt(3)).toBe('sunflower');
    expect(restored.loan).toBe(4000);
    expect(restored.standCapacity).toBe(1500);
  });

  it('supports detached equipment and empty inventories of implements', () => {
    const game = new Game();
    game.attach(null);
    game.ownedImplements.clear();
    expect(snapshot(decodeSave(JSON.stringify(snapshot(game))))).toEqual(snapshot(game));
  });

  const invalid: [string, (data: ReturnType<typeof snapshot>) => void][] = [
    ['old version', (s) => { s.version = 0; }],
    ['future version', (s) => { s.version = 999; }],
    ['negative money', (s) => { s.money = -1; }],
    ['non-finite money', (s) => { s.money = Infinity; }],
    ['negative time', (s) => { s.time = -1; }],
    ['unknown tractor', (s) => { s.tractorId = 'toString'; }],
    ['unowned tractor', (s) => { s.tractorId = 'pro'; }],
    ['unknown implement', (s) => { s.ownedImplements.push('__proto__'); }],
    ['duplicate inventory', (s) => { s.ownedTractors.push('basic'); }],
    ['unowned attachment', (s) => { s.attached = 'plow_l'; }],
    ['bad seed', (s) => { s.seedCrop = 'beans' as 'corn'; }],
    ['out of bounds', (s) => { s.tractor.x = 500; }],
    ['missing tractor value', (s) => { delete (s.tractor as Partial<typeof s.tractor>).heading; }],
    ['bad fuel', (s) => { s.fuel = 99999; }],
    ['overfilled grain', (s) => { s.grain = { crop: 'wheat', amount: 99999 }; }],
    ['grain without crop', (s) => { s.grain = { crop: null, amount: 20 }; }],
    ['bad statistics', (s) => { s.stats.harvested = -1; }],
    ['missing field', (s) => { s.fields.pop(); }],
    ['wrong field layout', (s) => { s.fields.reverse(); }],
    ['short tile array', (s) => { s.fields[0].state.pop(); }],
    ['invalid state', (s) => { s.fields[0].state[0] = 6; }],
    ['fractional state', (s) => { s.fields[0].state[0] = 2.5; }],
    ['invalid crop', (s) => { s.fields[0].crop[0] = 8; }],
    ['missing ripe crop', (s) => { s.fields[0].crop[0] = NO_CROP; }],
    ['bad growth', (s) => { s.fields[0].growth[0] = -0.5; }],
    ['unripe ripe tile', (s) => { s.fields[0].growth[0] = 0.5; }],
    ['crop on grass', (s) => { s.fields[1].crop[0] = 0; }],
    ['fertilized grass', (s) => { s.fields[1].fert[0] = 1; }],
    ['bad fertilizer flag', (s) => { s.fields[0].fert[0] = 2; }],
    ['missing fertilizer', (s) => { s.fields[0].fert.pop(); }],
    ['condition above 100%', (s) => { s.tractorCondition.basic = 1.5; }],
    ['negative condition', (s) => { s.implementCondition.plow_s = -0.1; }],
    ['condition for unowned item', (s) => { (s.tractorCondition as Record<string, number>).pro = 1; }],
    ['missing condition', (s) => { delete (s.implementCondition as Record<string, number>).plow_s; }],
    ['unknown storage level', (s) => { s.storageLevel = 9; }],
    ['storage without a silo', (s) => { s.storage.wheat = 10; }],
    ['negative storage', (s) => { s.storageLevel = 1; s.storage.corn = -5; }],
    ['overfilled storage', (s) => { s.storageLevel = 1; s.storage.corn = 99999; }],
    ['negative loan', (s) => { s.loan = -10; }],
    ['fractional missed payments', (s) => { s.loanMissed = 1.5; }],
    ['unknown stand level', (s) => { s.standLevel = 7; }],
    ['unknown price level', (s) => { s.standPriceLevel = -1; }],
    ['overstocked stand', (s) => { s.standStock.potato = 99999; }],
    ['grain on the stand', (s) => { (s.standStock as Record<string, number>).wheat = 5; }],
    ['produce in the silo', (s) => { s.storageLevel = 1; (s.storage as Record<string, number>).potato = 5; }],
    ['missing stand earnings', (s) => { delete (s.stats as Partial<typeof s.stats>).standEarned; }],
    ['implement too big for tractor', (s) => { s.ownedImplements.push('plow_xl'); s.implementCondition.plow_xl = 1; s.attached = 'plow_xl'; }],
  ];
  it.each(invalid)('rejects %s without mutating the live farm', (_, mutate) => {
    const original = new Game();
    const saved = snapshot(original);
    mutate(saved);
    expect(() => decodeSave(JSON.stringify(saved))).toThrow();
    expect(original.money).toBe(3000);
    expect(original.fields[0].cropAt(0)).toBe('wheat');
  });
  it.each(['null', '[]', '{}', 'broken json', '{"version":1}'])('rejects malformed input %s', (raw) => {
    expect(() => decodeSave(raw)).toThrow();
  });
});

describe('browser farm storage', () => {
  it('starts normally without a save and restores saved progress on a new session', () => {
    const { storage, saves } = setup();
    const loaded = saves.load();
    expect(loaded.status).toBe('new');
    loaded.game.money = 1234.5;
    saves.save(loaded.game);
    const next = new FarmSaves(() => storage).load();
    expect(next.status).toBe('loaded');
    expect(next.game.money).toBe(1234.5);
  });

  it.each(['bad json', JSON.stringify({ version: 0 }), JSON.stringify({ version: 99 }), ''])(
    'preserves an unreadable or outdated save: %s', (raw) => {
      const { storage, saves } = setup();
      storage.setItem(SAVE_KEY, raw);
      expect(saves.load().status).toBe('protected');
      expect(() => saves.save(new Game())).toThrow();
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
    },
  );

  it('handles blocked storage access', () => {
    const saves = new FarmSaves(() => { throw new Error('Blocked'); });
    expect(saves.load().status).toBe('unavailable');
    expect(() => saves.save(new Game())).toThrow();
    expect(() => saves.startFresh()).toThrow();
  });

  it('preserves the last save when storage is full or current state is invalid', () => {
    const { storage, saves } = setup();
    const { game } = saves.load();
    saves.save(game);
    const previous = storage.getItem(SAVE_KEY);
    game.money = 2000;
    storage.failKey = SAVE_KEY;
    expect(() => saves.save(game)).toThrow();
    expect(storage.getItem(SAVE_KEY)).toBe(previous);
    storage.failKey = null;
    game.money = NaN;
    expect(() => saves.save(game)).toThrow();
    expect(storage.getItem(SAVE_KEY)).toBe(previous);
  });

  it('starts fresh with a backup and prevents lifecycle handlers from restoring the old farm', () => {
    const { storage, saves } = setup();
    const { game } = saves.load();
    game.money = 888;
    saves.save(game);
    const previous = storage.getItem(SAVE_KEY);
    saves.startFresh();
    expect(storage.getItem(BACKUP_KEY)).toBe(previous);
    expect(new FarmSaves(() => storage).load().game.money).toBe(3000);
    expect(() => saves.save(game)).toThrow();
    expect(new FarmSaves(() => storage).load().game.money).toBe(3000);
  });

  it.each([BACKUP_KEY, SAVE_KEY])('keeps the original farm if reset cannot write %s', (key) => {
    const { storage, saves } = setup();
    const { game } = saves.load();
    game.money = 888;
    saves.save(game);
    const previous = storage.getItem(SAVE_KEY);
    storage.failKey = key;
    expect(() => saves.startFresh()).toThrow();
    expect(storage.getItem(SAVE_KEY)).toBe(previous);
    storage.failKey = null;
    saves.save(game);
  });

  it('backs up incompatible saves before an explicitly requested fresh start', () => {
    const { storage, saves } = setup();
    storage.setItem(SAVE_KEY, 'incompatible save');
    saves.load();
    saves.startFresh();
    expect(storage.getItem(BACKUP_KEY)).toBe('incompatible save');
    expect(saves.load().status).toBe('loaded');
  });
});
