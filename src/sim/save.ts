import { CROP_IDS } from './crops';
import { IMPLEMENTS, TRACTORS } from './equipment';
import { WORLD_HALF } from './farm';
import { NO_CROP, TileState } from './field';
import { Game } from './game';

export const SAVE_KEY = 'tractor-farm.save';
export const BACKUP_KEY = 'tractor-farm.previous-save';
export const SAVE_VERSION = 1;
export const PLAYERS_KEY = 'tractor-farm.players';
export const CURRENT_PLAYER_KEY = 'tractor-farm.player';
/** The first player keeps the original keys, so existing farms load unchanged. */
export const DEFAULT_PLAYER = 'Farmer 1';

export const saveKey = (player: string) => (player === DEFAULT_PLAYER ? SAVE_KEY : `${SAVE_KEY}:${player}`);
export const backupKey = (player: string) => (player === DEFAULT_PLAYER ? BACKUP_KEY : `${BACKUP_KEY}:${player}`);

/** Only simulation state belongs in a save; definitions and effects stay in code. */
export function snapshot(game: Game) {
  return {
    version: SAVE_VERSION,
    time: game.time,
    money: game.money,
    tractor: { ...game.tractor },
    tractorId: game.tractorId,
    ownedTractors: [...game.ownedTractors],
    ownedImplements: [...game.ownedImplements],
    attached: game.attached,
    lowered: game.lowered,
    lowerAnim: game.lowerAnim,
    seedCrop: game.seedCrop,
    fuel: game.fuel,
    grain: { ...game.grain },
    stats: { ...game.stats },
    fields: game.fields.map((field) => ({
      id: field.id,
      owned: field.owned,
      state: Array.from(field.state),
      crop: Array.from(field.crop),
      growth: Array.from(field.growth),
    })),
  };
}

type Save = ReturnType<typeof snapshot>;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const known = (value: unknown, definitions: object): value is string =>
  typeof value === 'string' && Object.hasOwn(definitions, value);
const crop = (value: unknown) => CROP_IDS.some((id) => id === value);
const inventory = (value: unknown, definitions: object): value is string[] =>
  Array.isArray(value) && value.length <= Object.keys(definitions).length
  && value.every((id) => known(id, definitions)) && new Set(value).size === value.length;

/** Reject the whole save on any mismatch, before touching a running game. */
function valid(value: unknown, game: Game): value is Save {
  if (!record(value) || value.version !== SAVE_VERSION
    || !number(value.time) || !number(value.money)
    || !inventory(value.ownedTractors, TRACTORS)
    || !inventory(value.ownedImplements, IMPLEMENTS)
    || !known(value.tractorId, TRACTORS) || !value.ownedTractors.includes(value.tractorId)
    || (value.attached !== null && (!known(value.attached, IMPLEMENTS) || !value.ownedImplements.includes(value.attached)))
    || typeof value.lowered !== 'boolean' || (value.lowered && value.attached === null)
    || !number(value.lowerAnim, 0, 1) || !crop(value.seedCrop)) return false;

  const def = TRACTORS[value.tractorId];
  const t = value.tractor;
  const grain = value.grain;
  if (!record(t) || !number(t.x, -WORLD_HALF + 2, WORLD_HALF - 2)
    || !number(t.z, -WORLD_HALF + 2, WORLD_HALF - 2)
    || !number(t.heading, -Number.MAX_SAFE_INTEGER) || !number(t.speed, -4, def.maxSpeed)
    || !number(t.steer, -0.6, 0.6) || !number(t.odometer, -Number.MAX_SAFE_INTEGER)
    || !number(value.fuel, 0, def.fuelCapacity)
    || !record(grain) || !number(grain.amount, 0, def.grainCapacity)
    || (grain.amount === 0 ? grain.crop !== null : !crop(grain.crop))
    || !record(value.stats) || !number(value.stats.earned) || !number(value.stats.harvested)
    || !Array.isArray(value.fields) || value.fields.length !== game.fields.length) return false;

  const fields = value.fields;
  return game.fields.every((field, index) => {
    const saved: unknown = fields[index];
    if (!record(saved) || saved.id !== field.id || typeof saved.owned !== 'boolean'
      || (index === 0 && !saved.owned)
      || !Array.isArray(saved.state) || saved.state.length !== field.size
      || !Array.isArray(saved.crop) || saved.crop.length !== field.size
      || !Array.isArray(saved.growth) || saved.growth.length !== field.size) return false;
    for (let i = 0; i < field.size; i++) {
      const state: unknown = saved.state[i];
      const id: unknown = saved.crop[i];
      const growth: unknown = saved.growth[i];
      if (!number(state, TileState.Grass, TileState.Stubble) || !Number.isInteger(state)
        || !number(growth, 0, 1)) return false;
      if (state === TileState.Seeded || state === TileState.Ripe) {
        if (!number(id, 0, CROP_IDS.length - 1) || !Number.isInteger(id)
          || (state === TileState.Ripe && growth !== 1)) return false;
      } else if (id !== NO_CROP || growth !== 0) return false;
    }
    return true;
  });
}

export function decodeSave(raw: string): Game {
  const value: unknown = JSON.parse(raw);
  if (record(value) && value.version !== SAVE_VERSION) {
    throw new Error('This save uses an unsupported version.');
  }
  const game = new Game();
  if (!valid(value, game)) throw new Error('This save is damaged or incompatible.');
  game.time = value.time;
  game.money = value.money;
  game.tractor = { ...value.tractor };
  game.tractorId = value.tractorId;
  game.ownedTractors = new Set(value.ownedTractors);
  game.ownedImplements = new Set(value.ownedImplements);
  game.attached = value.attached;
  game.lowered = value.lowered;
  game.lowerAnim = value.lowerAnim;
  game.seedCrop = value.seedCrop;
  game.fuel = value.fuel;
  game.grain = { ...value.grain };
  game.stats = { ...value.stats };
  value.fields.forEach((saved, index) => {
    const field = game.fields[index];
    field.owned = saved.owned;
    field.state.set(saved.state);
    field.crop.set(saved.crop);
    field.growth.set(saved.growth);
    field.version++;
  });
  return game;
}

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult = { game: Game; status: 'loaded' | 'new' | 'protected' | 'unavailable'; message: string };

/** A failed load never grants permission to overwrite the original save. */
export class FarmSaves {
  private writable = false;

  constructor(private storage: () => StorageAccess, readonly player = DEFAULT_PLAYER) {}

  load(): LoadResult {
    this.writable = false;
    let raw: string | null;
    try {
      raw = this.storage().getItem(saveKey(this.player));
    } catch {
      return { game: new Game(), status: 'unavailable', message: 'Browser storage is unavailable. Progress cannot be saved.' };
    }
    if (raw !== null) {
      try {
        const game = decodeSave(raw);
        this.writable = true;
        return { game, status: 'loaded', message: 'Farm loaded. Autosave is on.' };
      } catch {
        return {
          game: new Game(), status: 'protected',
          message: 'Saved farm could not be loaded. It is untouched; autosave is off. Use New farm to replace it with a backup.',
        };
      }
    }
    this.writable = true;
    return { game: new Game(), status: 'new', message: 'New farm. Progress saves in this browser only.' };
  }

  save(game: Game): void {
    if (!this.writable) throw new Error('Autosave is off to protect your existing save.');
    const raw = JSON.stringify(snapshot(game));
    decodeSave(raw);
    // setItem is atomic: a quota failure leaves the previous save intact.
    this.storage().setItem(saveKey(this.player), raw);
  }

  /** Call only after confirmation. Back up first; never delete a save to reset it. */
  startFresh(): void {
    const storage = this.storage();
    const previous = storage.getItem(saveKey(this.player));
    if (previous !== null) storage.setItem(backupKey(this.player), previous);
    storage.setItem(saveKey(this.player), JSON.stringify(snapshot(new Game())));
    // Block lifecycle saves from writing the old in-memory farm during reload.
    this.writable = false;
  }
}

/** Who is playing in this browser. Each player has their own farm save. */
export class Players {
  constructor(private storage: () => StorageAccess) {}

  list(): string[] {
    try {
      const value: unknown = JSON.parse(this.storage().getItem(PLAYERS_KEY) ?? 'null');
      if (Array.isArray(value) && value.length && value.every((n) => typeof n === 'string')) return value;
    } catch { /* fall through to the default player */ }
    return [DEFAULT_PLAYER];
  }

  current(): string {
    let name: string | null = null;
    try { name = this.storage().getItem(CURRENT_PLAYER_KEY); } catch { /* storage unavailable */ }
    return name !== null && this.list().includes(name) ? name : DEFAULT_PLAYER;
  }

  /** Adds the player if new and makes them current. Returns the cleaned-up name. */
  switchTo(rawName: string): string {
    const name = rawName.trim().slice(0, 24);
    if (!name) throw new Error('Player name is empty.');
    const players = this.list();
    if (!players.includes(name)) this.storage().setItem(PLAYERS_KEY, JSON.stringify([...players, name]));
    this.storage().setItem(CURRENT_PLAYER_KEY, name);
    return name;
  }
}
