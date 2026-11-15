import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { NO_CROP, TileState } from '../src/sim/field';
import { BACKUP_KEY, decodeSave, DEFAULT_PLAYER, FarmSaves, Players, SAVE_KEY, snapshot } from '../src/sim/save';

class MemoryStorage {
  values = new Map<string, string>();
  failKey: string | null = null;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('Storage full');
    this.values.set(key, value);
  }
}

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
    game.stats = { earned: 2000, harvested: 1500 };
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

describe('multiple players', () => {
  it('keeps a separate farm per player and leaves the original save with the first player', () => {
    const storage = new MemoryStorage();
    const first = new FarmSaves(() => storage);
    const game = first.load().game;
    game.money = 1234;
    first.save(game);

    const players = new Players(() => storage);
    expect(players.current()).toBe(DEFAULT_PLAYER);
    expect(players.switchTo('  Sam ')).toBe('Sam');
    expect(players.list()).toEqual([DEFAULT_PLAYER, 'Sam']);
    expect(players.current()).toBe('Sam');

    const sam = new FarmSaves(() => storage, players.current());
    const samLoad = sam.load();
    expect(samLoad.status).toBe('new');
    samLoad.game.money = 99;
    sam.save(samLoad.game);
    sam.startFresh();

    expect(new FarmSaves(() => storage).load().game.money).toBe(1234);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).money).toBe(1234);
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
    expect(new FarmSaves(() => storage, 'Sam').load().game.money).toBe(3000);
  });

  it('falls back to the first player when the player list is missing or damaged', () => {
    const storage = new MemoryStorage();
    storage.setItem('tractor-farm.players', 'not json');
    storage.setItem('tractor-farm.player', 'Ghost');
    const players = new Players(() => storage);
    expect(players.list()).toEqual([DEFAULT_PLAYER]);
    expect(players.current()).toBe(DEFAULT_PLAYER);
    expect(() => players.switchTo('   ')).toThrow();
  });
});
