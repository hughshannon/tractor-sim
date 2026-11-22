import { CROP_IDS, GRAIN_IDS, PRODUCE_IDS } from './crops';
import { IMPLEMENTS, TRACTORS, canPull } from './equipment';
import { STORAGE_LEVELS, WORLD_HALF, createFields } from './farm';
import { NO_CROP, TileState } from './field';
import { Game } from './game';
import { PRICE_LEVELS, STAND_LEVELS } from './stand';

export const SAVE_KEY = 'tractor-farm.save';
export const BACKUP_KEY = 'tractor-farm.previous-save';
export const SAVE_VERSION = 5;
/** Older versions decodeSave can upgrade. */
const MIGRATABLE = [1, 2, 3, 4];

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
    tractorCondition: Object.fromEntries([...game.ownedTractors].map((id) => [id, game.tractorCondition.get(id) ?? 1])),
    implementCondition: Object.fromEntries([...game.ownedImplements].map((id) => [id, game.implementCondition.get(id) ?? 1])),
    storageLevel: game.storageLevel,
    storage: { ...game.storage },
    loan: game.loan,
    loanMissed: game.loanMissed,
    standLevel: game.standLevel,
    standStock: { ...game.standStock },
    standPriceLevel: game.standPriceLevel,
    standToday: game.standToday,
    fields: game.fields.map((field) => ({
      id: field.id,
      owned: field.owned,
      state: Array.from(field.state),
      crop: Array.from(field.crop),
      growth: Array.from(field.growth),
      fert: Array.from(field.fert),
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
const integer = (value: unknown, min: number, max: number): value is number => number(value, min, max) && Number.isInteger(value);
/** A record with exactly these keys, each a non-negative number; returns the total or -1. */
function amounts(value: unknown, keys: readonly string[]): number {
  if (!record(value) || Object.keys(value).length !== keys.length) return -1;
  let total = 0;
  for (const key of keys) {
    const n = value[key];
    if (!Object.hasOwn(value, key) || !number(n)) return -1;
    total += n;
  }
  return total;
}
const inventory = (value: unknown, definitions: object): value is string[] =>
  Array.isArray(value) && value.length <= Object.keys(definitions).length
  && value.every((id) => known(id, definitions)) && new Set(value).size === value.length;

/** Conditions must cover exactly the owned items, each 0..1. */
const conditions = (value: unknown, owned: string[]): value is Record<string, number> =>
  record(value) && Object.keys(value).length === owned.length
  && owned.every((id) => Object.hasOwn(value, id) && number(value[id], 0, 1));

/**
 * Upgrade an older save to the current shape, one version at a time. Version 1 gains equipment in perfect
 * condition, no storage and no fertilized tiles; version 2 gains no loan and an empty roadside cart;
 * version 3 gains the boulder fields, unowned and untouched; version 4 gets the one-time loan amnesty.
 * The result still goes through full validation.
 */
function migrate(value: RecordValue): RecordValue {
  if (value.version === 1) value = migrate1(value);
  if (value.version === 2) value = migrate2(value);
  if (value.version === 3) value = migrate3(value);
  if (value.version === 4) value = migrate4(value);
  return value;
}

/** One-time bank amnesty: every outstanding loan and missed instalment is written off. */
function migrate4(value: RecordValue): RecordValue {
  const forgiven = typeof value.loan === 'number' && value.loan > 0 ? Math.ceil(value.loan) : 0;
  return { ...value, version: 5, loan: 0, loanMissed: 0, amnesty: forgiven };
}

/** Append fields that were added to the farm after the save was made, in their starting state. */
function migrate3(value: RecordValue): RecordValue {
  if (!Array.isArray(value.fields)) return { ...value, version: 4 };
  const fresh = createFields().slice(value.fields.length).map((f) => ({
    id: f.id,
    owned: false,
    state: Array.from(f.state),
    crop: Array.from(f.crop),
    growth: Array.from(f.growth),
    fert: Array.from(f.fert),
  }));
  return { ...value, version: 4, fields: [...value.fields, ...fresh] };
}

function migrate2(value: RecordValue): RecordValue {
  return {
    ...value,
    version: 3,
    stats: record(value.stats) ? { ...value.stats, standEarned: 0 } : value.stats,
    loan: 0,
    loanMissed: 0,
    standLevel: 0,
    standStock: { potato: 0, tomato: 0, pumpkin: 0, sunflower: 0 },
    standPriceLevel: 1,
    standToday: 0,
  };
}

function migrate1(value: RecordValue): RecordValue {
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const perfect = (v: unknown) => Object.fromEntries(ids(v).map((id) => [id, 1]));
  return {
    ...value,
    version: 2,
    tractorCondition: perfect(value.ownedTractors),
    implementCondition: perfect(value.ownedImplements),
    storageLevel: 0,
    storage: { wheat: 0, corn: 0, canola: 0 },
    fields: Array.isArray(value.fields)
      ? value.fields.map((f: unknown) => (record(f) && Array.isArray(f.state) ? { ...f, fert: f.state.map(() => 0) } : f))
      : value.fields,
  };
}

/** Reject the whole save on any mismatch, before touching a running game. */
function valid(value: unknown, game: Game): value is Save {
  if (!record(value) || value.version !== SAVE_VERSION
    || !number(value.time) || !number(value.money)
    || !inventory(value.ownedTractors, TRACTORS)
    || !inventory(value.ownedImplements, IMPLEMENTS)
    || !known(value.tractorId, TRACTORS) || !value.ownedTractors.includes(value.tractorId)
    || (value.attached !== null && (!known(value.attached, IMPLEMENTS) || !value.ownedImplements.includes(value.attached)))
    || typeof value.lowered !== 'boolean' || (value.lowered && value.attached === null)
    || !number(value.lowerAnim, 0, 1) || !crop(value.seedCrop)
    || !conditions(value.tractorCondition, value.ownedTractors)
    || !conditions(value.implementCondition, value.ownedImplements)
    || !number(value.storageLevel, 0, STORAGE_LEVELS.length - 1) || !Number.isInteger(value.storageLevel)) return false;

  const def = TRACTORS[value.tractorId];
  if (value.attached !== null && !canPull(def, IMPLEMENTS[value.attached])) return false;
  const stored = amounts(value.storage, GRAIN_IDS);
  if (stored < 0 || stored > STORAGE_LEVELS[value.storageLevel].capacity) return false;
  if (!number(value.loan) || !integer(value.loanMissed, 0, Number.MAX_SAFE_INTEGER)
    || !integer(value.standLevel, 0, STAND_LEVELS.length - 1)
    || !integer(value.standPriceLevel, 0, PRICE_LEVELS.length - 1)
    || !number(value.standToday)) return false;
  const stocked = amounts(value.standStock, PRODUCE_IDS);
  if (stocked < 0 || stocked > STAND_LEVELS[value.standLevel].capacity) return false;

  const t = value.tractor;
  const grain = value.grain;
  if (!record(t) || !number(t.x, -WORLD_HALF + 2, WORLD_HALF - 2)
    || !number(t.z, -WORLD_HALF + 2, WORLD_HALF - 2)
    || !number(t.heading, -Number.MAX_SAFE_INTEGER) || !number(t.speed, -4, def.maxSpeed)
    || !number(t.steer, -0.6, 0.6) || !number(t.odometer, -Number.MAX_SAFE_INTEGER)
    || !number(value.fuel, 0, def.fuelCapacity)
    || !record(grain) || !number(grain.amount, 0, def.grainCapacity)
    || (grain.amount === 0 ? grain.crop !== null : !crop(grain.crop))
    || !record(value.stats) || !number(value.stats.earned) || !number(value.stats.harvested) || !number(value.stats.standEarned)
    || !Array.isArray(value.fields) || value.fields.length !== game.fields.length) return false;

  const fields = value.fields;
  return game.fields.every((field, index) => {
    const saved: unknown = fields[index];
    if (!record(saved) || saved.id !== field.id || typeof saved.owned !== 'boolean'
      || (index === 0 && !saved.owned)
      || !Array.isArray(saved.state) || saved.state.length !== field.size
      || !Array.isArray(saved.crop) || saved.crop.length !== field.size
      || !Array.isArray(saved.growth) || saved.growth.length !== field.size
      || !Array.isArray(saved.fert) || saved.fert.length !== field.size) return false;
    for (let i = 0; i < field.size; i++) {
      const state: unknown = saved.state[i];
      const id: unknown = saved.crop[i];
      const growth: unknown = saved.growth[i];
      const fert: unknown = saved.fert[i];
      if (fert !== 0 && fert !== 1) return false;
      // Boulder tiles can never be worked.
      if (field.blocked[i] && (state !== TileState.Grass || id !== NO_CROP || growth !== 0)) return false;
      if (fert === 1 && state !== TileState.Seeded && state !== TileState.Ripe) return false;
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
  const parsed: unknown = JSON.parse(raw);
  if (record(parsed) && parsed.version !== SAVE_VERSION && !MIGRATABLE.includes(parsed.version as number)) {
    throw new Error('This save uses an unsupported version.');
  }
  const value: unknown = record(parsed) ? migrate(parsed) : parsed;
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
  game.tractorCondition = new Map(Object.entries(value.tractorCondition));
  game.implementCondition = new Map(Object.entries(value.implementCondition));
  game.storageLevel = value.storageLevel;
  game.storage = { ...value.storage };
  game.loan = value.loan;
  game.loanMissed = value.loanMissed;
  game.standLevel = value.standLevel;
  game.standStock = { ...value.standStock };
  game.standPriceLevel = value.standPriceLevel;
  game.standToday = value.standToday;
  const amnesty = (value as RecordValue).amnesty;
  if (typeof amnesty === 'number' && amnesty > 0) {
    game.notify(`Bank amnesty: your loan of $${amnesty.toLocaleString()} has been written off. This is a one-time offer.`, 'good', 0);
  }
  value.fields.forEach((saved, index) => {
    const field = game.fields[index];
    field.owned = saved.owned;
    field.state.set(saved.state);
    field.crop.set(saved.crop);
    field.growth.set(saved.growth);
    field.fert.set(saved.fert);
    field.version++;
  });
  return game;
}

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult = { game: Game; status: 'loaded' | 'new' | 'protected' | 'unavailable'; message: string };

/** A failed load never grants permission to overwrite the original save. */
export class FarmSaves {
  private writable = false;

  constructor(private storage: () => StorageAccess) {}

  load(): LoadResult {
    this.writable = false;
    let raw: string | null;
    try {
      raw = this.storage().getItem(SAVE_KEY);
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
    this.storage().setItem(SAVE_KEY, raw);
  }

  /** Call only after confirmation. Back up first; never delete a save to reset it. */
  startFresh(): void {
    const storage = this.storage();
    const previous = storage.getItem(SAVE_KEY);
    if (previous !== null) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(SAVE_KEY, JSON.stringify(snapshot(new Game())));
    // Block lifecycle saves from writing the old in-memory farm during reload.
    this.writable = false;
  }
}
