import { LOAN_RATE, creditLimit, instalment } from './bank';
import {
  CROPS, FERTILIZER_COST_PER_TILE, GRAIN_IDS, PRODUCE_IDS, amountText, isGrain, isProduce,
  type CropId, type GrainId, type ProduceId,
} from './crops';
import { DAY_LENGTH } from './daylight';
import {
  IMPLEMENTS, IMPLEMENT_LIFE, TRACTORS, TRACTOR_LIFE, canPull, repairCost, wearFuel, wearSpeed,
  type ImplementDef, type TractorDef,
} from './equipment';
import { BUILDINGS, STORAGE_LEVELS, WORLD_HALF, createFields, zoneAt, type Zone } from './farm';
import { Field, TileState, type Obstacle } from './field';
import { priceAt } from './market';
import {
  DEFAULT_PRICE_LEVEL, MAX_CUSTOMERS, PRICE_LEVELS, STAND_COUNTER, STAND_LEVELS, WHOLESALE_RATE,
  customerRate, isOpen, makeCustomer, standPrice, timeline, type Customer,
} from './stand';
import { createTractor, resolveBox, resolveCircle, segmentDistance, stepTractor, type DriveInput, type TractorState } from './tractor';

export const FUEL_PRICE = 1.5;
const LOAN_RATE_PER_SECOND = LOAN_RATE / DAY_LENGTH;
const money = (n: number) => `$${Math.floor(n).toLocaleString()}`;
export const START_MONEY = 3000;
const TRACTOR_RADIUS = 1.6;
const EMPTY_TANK_SPEED = 2;
/** Condition an implement loses when it hits a boulder at full working speed. */
export const BOULDER_DAMAGE = 0.05;

export interface Message {
  text: string;
  time: number;
  kind: 'info' | 'good' | 'warn';
}

export type GameEvent =
  | 'sell' | 'refuel' | 'buy' | 'attach' | 'warn' | 'bump'
  | 'lower' | 'raise' | 'repair' | 'unload' | 'loan' | 'customer';

export type ActionResult = { ok: true; text: string } | { ok: false; text: string };

export class Game {
  time = 0;
  money = START_MONEY;
  fields: Field[] = createFields();
  /** Every boulder on the farm, on owned land or not. */
  readonly boulders: Obstacle[] = this.fields.flatMap((f) => f.obstacles);
  tractor: TractorState = createTractor(0, 4, 0);
  tractorId = 'basic';
  ownedTractors = new Set<string>(['basic']);
  ownedImplements = new Set<string>(['plow_s', 'seeder_s', 'harvester_s']);
  attached: string | null = 'harvester_s';
  lowered = false;
  /** 0 = raised, 1 = lowered; animated. */
  lowerAnim = 0;
  seedCrop: CropId = 'wheat';
  fuel: number;
  grain: { crop: CropId | null; amount: number } = { crop: null, amount: 0 };
  messages: Message[] = [];
  stats = { earned: 0, harvested: 0, standEarned: 0 };
  /** Condition 0..1 of every owned tractor and implement, keyed by id. */
  tractorCondition = new Map<string, number>([['basic', 1]]);
  implementCondition = new Map<string, number>([['plow_s', 1], ['seeder_s', 1], ['harvester_s', 1]]);
  /** Silo storage upgrade level (index into STORAGE_LEVELS) and stored grain per crop. */
  storageLevel = 0;
  storage: Record<GrainId, number> = { wheat: 0, corn: 0, canola: 0 };
  /** Outstanding bank loan (with accrued interest) and consecutive missed morning instalments. */
  loan = 0;
  loanMissed = 0;
  /** Farm stand upgrade level (index into STAND_LEVELS), stock per produce, price setting, takings today. */
  standLevel = 0;
  standStock: Record<ProduceId, number> = { potato: 0, tomato: 0, pumpkin: 0, sunflower: 0 };
  standPriceLevel = DEFAULT_PRICE_LEVEL;
  standToday = 0;
  /** Customers currently walking to, at, or away from the stand. Not saved. */
  customers: Customer[] = [];
  /** Randomness for customers; replaceable in tests. */
  random: () => number = Math.random;
  /** True during frames where the implement is actually engaging the ground. */
  workingNow = false;
  /** Optional listener for sound/effects; the sim never depends on it. */
  onEvent: ((e: GameEvent) => void) | null = null;
  private lastNotice = new Map<string, number>();
  private lastBump = -10;
  private nextCustomer = 1;
  private customerId = 0;

  constructor() {
    this.fuel = this.tractorDef.fuelCapacity;
    this.fields[0].fillRipe('wheat');
  }

  get tractorDef(): TractorDef {
    return TRACTORS[this.tractorId];
  }

  get implement(): ImplementDef | null {
    return this.attached ? IMPLEMENTS[this.attached] : null;
  }

  get tractorWear(): number {
    return this.tractorCondition.get(this.tractorId) ?? 1;
  }

  get implementWear(): number {
    return this.attached ? this.implementCondition.get(this.attached) ?? 1 : 1;
  }

  get storageCapacity(): number {
    return STORAGE_LEVELS[this.storageLevel].capacity;
  }

  get stored(): number {
    return GRAIN_IDS.reduce((n, id) => n + this.storage[id], 0);
  }

  get standCapacity(): number {
    return STAND_LEVELS[this.standLevel].capacity;
  }

  get standStocked(): number {
    return PRODUCE_IDS.reduce((n, id) => n + this.standStock[id], 0);
  }

  /** What the bank values the farm's purchases at: land, buildings and bought equipment. */
  get assets(): number {
    let n = 0;
    for (const f of this.fields) if (f.owned) n += f.price;
    for (const id of this.ownedTractors) n += TRACTORS[id].price;
    for (const id of this.ownedImplements) n += IMPLEMENTS[id].price;
    for (let i = 1; i <= this.storageLevel; i++) n += STORAGE_LEVELS[i].price;
    for (let i = 1; i <= this.standLevel; i++) n += STAND_LEVELS[i].price;
    return n;
  }

  get creditLimit(): number {
    return creditLimit(this.assets);
  }

  /** How much more the bank will lend right now. */
  get creditAvailable(): number {
    return Math.max(0, this.creditLimit - Math.ceil(this.loan));
  }

  /** Seconds until the next morning instalment. */
  get nextPaymentIn(): number {
    return DAY_LENGTH - (this.time % DAY_LENGTH);
  }

  get zone(): Zone | null {
    return zoneAt(this.tractor.x, this.tractor.z);
  }

  notify(text: string, kind: Message['kind'] = 'info', cooldown = 3): void {
    const last = this.lastNotice.get(text);
    if (last !== undefined && this.time - last < cooldown) return;
    this.lastNotice.set(text, this.time);
    this.messages.push({ text, time: this.time, kind });
    if (kind === 'warn') this.emit('warn');
    if (this.messages.length > 6) this.messages.shift();
  }

  emit(e: GameEvent): void {
    this.onEvent?.(e);
  }

  /** Silo price for grain. */
  price(crop: GrainId): number {
    return priceAt(crop, this.time);
  }

  /** Farm stand price for produce at the current price setting. */
  standPrice(crop: ProduceId): number {
    return standPrice(crop, this.standPriceLevel);
  }

  fieldAt(x: number, z: number): Field | null {
    return this.fields.find((f) => f.contains(x, z)) ?? null;
  }

  /** World position of the implement's working bar. */
  implementPos(): { x: number; z: number } {
    const imp = this.implement;
    const off = imp ? imp.offset : 0;
    const t = this.tractor;
    return { x: t.x + Math.sin(t.heading) * off, z: t.z + Math.cos(t.heading) * off };
  }

  update(dt: number, input: DriveInput): void {
    const day = Math.floor(this.time / DAY_LENGTH);
    this.time += dt;
    this.accrueInterest(dt);
    if (Math.floor(this.time / DAY_LENGTH) > day) this.newDay();
    this.updateStand(dt);
    const def = this.tractorDef;
    const imp = this.implement;

    // Fuel.
    const tractorWear = this.tractorWear;
    const impWear = this.implementWear;
    const working = this.lowered && imp !== null;
    const burn = (0.04 + 0.16 * Math.abs(input.throttle)) * (working ? imp.fuelMul * wearFuel(impWear) : 1) * wearFuel(tractorWear);
    this.fuel = Math.max(0, this.fuel - burn * dt);
    if (this.fuel <= 0) this.notify('Out of fuel! Crawl back to the fuel pump.', 'warn', 6);
    if (this.money < 100 && this.creditAvailable >= 1000 && this.time > 5) {
      this.notify('Running low on money? The bank, west of the garage, can lend you some.', 'info', 120);
    }
    else if (this.fuel < def.fuelCapacity * 0.15) this.notify('Fuel is low.', 'warn', 20);

    let maxSpeed = def.maxSpeed * wearSpeed(tractorWear);
    if (working) maxSpeed = Math.min(maxSpeed, imp.workSpeed * wearSpeed(impWear));
    if (this.fuel <= 0 || tractorWear <= 0) maxSpeed = EMPTY_TANK_SPEED;
    if (tractorWear <= 0) this.notify(`The ${def.name} has broken down! Limp back to the garage for repairs.`, 'warn', 8);

    const before = { x: this.tractor.x, z: this.tractor.z, heading: this.tractor.heading };
    stepTractor(this.tractor, input, dt, {
      maxSpeed,
      maxReverse: 4,
      accel: def.accel,
      wheelBase: 2.6,
      maxSteer: 0.6,
    });
    const impactSpeed = Math.abs(this.tractor.speed);
    let hit = false;
    for (const b of BUILDINGS) hit = resolveBox(this.tractor, TRACTOR_RADIUS, b.box) || hit;
    for (const b of this.boulders) hit = resolveCircle(this.tractor, TRACTOR_RADIUS, b) || hit;
    const t = this.tractor;
    if (this.implementHitsBoulder()) {
      // A lowered implement can't pass a boulder: stop dead where we were and take damage.
      t.x = before.x;
      t.z = before.z;
      t.heading = before.heading;
      t.speed = 0;
      hit = true;
      this.boulderStrike(impactSpeed);
    }
    const lim = WORLD_HALF - 2;
    if (Math.abs(t.x) > lim || Math.abs(t.z) > lim) {
      t.x = Math.max(-lim, Math.min(lim, t.x));
      t.z = Math.max(-lim, Math.min(lim, t.z));
      t.speed *= 0.3;
      hit = true;
    }
    if (hit && impactSpeed > 2 && this.time - this.lastBump > 0.6) {
      this.lastBump = this.time;
      this.emit('bump');
    }

    this.lowerAnim += (this.lowered ? 1 : -1) * dt * 2.5;
    this.lowerAnim = Math.max(0, Math.min(1, this.lowerAnim));

    this.workingNow = working && this.lowerAnim > 0.9 && Math.abs(t.speed) > 0.3 && impWear > 0;
    if (working && impWear <= 0) this.notify(`The ${imp.name} is broken. Repair it at the garage.`, 'warn', 8);
    if (this.workingNow) this.work();
    this.wear(dt, Math.abs(t.speed) * dt);

    for (const f of this.fields) f.update(dt);
  }

  /** True when the lowered implement's working bar overlaps a boulder. */
  implementHitsBoulder(): boolean {
    const imp = this.implement;
    if (!imp || this.lowerAnim < 0.5) return false;
    const p = this.implementPos();
    const h = this.tractor.heading;
    const rx = -Math.cos(h) * imp.width / 2, rz = Math.sin(h) * imp.width / 2;
    return this.boulders.some((b) => segmentDistance(b.x, b.z, p.x - rx, p.z - rz, p.x + rx, p.z + rz) < b.radius);
  }

  private boulderStrike(speed: number): void {
    const imp = this.implement!;
    if (speed > 1) {
      const before = this.implementWear;
      const after = Math.max(0, before - BOULDER_DAMAGE * Math.min(1, speed / imp.workSpeed));
      this.implementCondition.set(imp.id, after);
      this.notify(`The ${imp.name} hit a boulder! Raise it (Space) or steer around.`, 'warn', 2);
      if (before > 0 && after <= 0) this.notify(`The ${imp.name} is broken. Repair it at the garage.`, 'warn', 0);
    } else {
      this.notify('A boulder is in the way of your implement. Raise it (Space) or steer around.', 'warn', 6);
    }
  }

  /** Wear the current tractor by distance driven and the implement by time spent working. */
  private wear(dt: number, distance: number): void {
    const warn = (before: number, after: number, name: string) => {
      if (before >= 0.25 && after < 0.25) this.notify(`The ${name} is badly worn (25%). Repair it at the garage.`, 'warn', 0);
      else if (before >= 0.5 && after < 0.5) this.notify(`The ${name} is wearing out and working slower. Repair it at the garage.`, 'warn', 0);
    };
    if (distance > 0) {
      const before = this.tractorWear;
      const after = Math.max(0, before - distance / TRACTOR_LIFE);
      this.tractorCondition.set(this.tractorId, after);
      warn(before, after, this.tractorDef.name);
    }
    if (this.workingNow && this.attached) {
      const before = this.implementWear;
      const after = Math.max(0, before - dt / IMPLEMENT_LIFE);
      this.implementCondition.set(this.attached, after);
      warn(before, after, this.implement!.name);
    }
  }

  /** Apply the attached implement to the tiles under its working bar. */
  work(): void {
    const imp = this.implement;
    if (!imp) return;
    const p = this.implementPos();
    const h = this.tractor.heading;
    // Right vector = (-cos h, sin h).
    const rx = -Math.cos(h), rz = Math.sin(h);
    const steps = Math.max(2, Math.ceil(imp.width / 0.5));
    for (let s = 0; s <= steps; s++) {
      const o = -imp.width / 2 + (imp.width * s) / steps;
      const wx = p.x + rx * o, wz = p.z + rz * o;
      const field = this.fieldAt(wx, wz);
      if (!field) continue;
      if (!field.owned) {
        this.notify(`You don't own ${field.name}. Buy it at the shop.`, 'warn', 5);
        continue;
      }
      const i = field.tileAt(wx, wz);
      if (!this.workTile(field, i, imp)) return;
    }
  }

  /** Returns false to stop processing this frame (e.g. tank full, no money). */
  private workTile(field: Field, i: number, imp: ImplementDef): boolean {
    switch (imp.kind) {
      case 'plow':
        if (field.state[i] === TileState.Seeded || field.state[i] === TileState.Ripe) {
          this.notify('Plowing destroys crops. Harvest first!', 'warn', 8);
          return true;
        }
        field.plow(i);
        return true;
      case 'seeder': {
        if (field.state[i] !== TileState.Plowed) return true;
        const cost = CROPS[this.seedCrop].seedCostPerTile;
        if (this.money < cost) {
          this.notify(`Not enough money for seed.${this.bankHint()}`, 'warn');
          return false;
        }
        if (field.seed(i, this.seedCrop)) this.money -= cost;
        return true;
      }
      case 'sprayer': {
        if (field.state[i] !== TileState.Seeded || field.fert[i]) return true;
        if (this.money < FERTILIZER_COST_PER_TILE) {
          this.notify(`Not enough money for fertilizer.${this.bankHint()}`, 'warn');
          return false;
        }
        if (field.fertilize(i)) this.money -= FERTILIZER_COST_PER_TILE;
        return true;
      }
      case 'harvester': {
        if (field.state[i] !== TileState.Ripe) return true;
        const crop = field.cropAt(i)!;
        if (this.grain.amount > 0 && this.grain.crop !== crop) {
          const where = isGrain(this.grain.crop!) ? 'at the silo' : 'at the farm stand';
          this.notify(`Tank holds ${CROPS[this.grain.crop!].name}. Unload it ${where} before harvesting ${CROPS[crop].name}.`, 'warn');
          return false;
        }
        if (this.grain.amount + field.yieldAt(i) > this.tractorDef.grainCapacity) {
          this.notify(isGrain(crop) ? 'Grain tank full! Unload at the silo.' : 'Tank full! Unload the produce at the farm stand.', 'warn');
          return false;
        }
        const r = field.harvest(i)!;
        this.grain.crop = r.crop;
        this.grain.amount += r.amount;
        this.stats.harvested += r.amount;
        return true;
      }
    }
  }

  toggleLower(): void {
    if (!this.implement) {
      this.notify('No implement attached. Visit the garage.', 'warn');
      return;
    }
    this.lowered = !this.lowered;
    this.emit(this.lowered ? 'lower' : 'raise');
  }

  /**
   * Context action for the zone the tractor is in. Returns which panel should open, if any.
   * Without storage the silo sells straight from the tank; with storage it opens the silo panel.
   */
  interact(): 'shop' | 'silo' | 'bank' | 'stand' | null {
    const z = this.zone;
    if (!z) return null;
    if (z.id === 'shed') return 'shop';
    if (z.id === 'bank') return 'bank';
    if (z.id === 'stand') return 'stand';
    if (z.id === 'silo') {
      if (this.storageLevel > 0) return 'silo';
      this.report(this.sellGrain());
    }
    if (z.id === 'fuel') this.report(this.refuel());
    return null;
  }

  report(r: ActionResult): void {
    this.notify(r.text, r.ok ? 'good' : 'warn', 0);
  }

  sellGrain(): ActionResult {
    const { crop, amount } = this.grain;
    if (!crop || amount <= 0) return { ok: false, text: 'Grain tank is empty.' };
    if (!isGrain(crop)) return { ok: false, text: `The silo only buys grain. Take the ${CROPS[crop].name} to the farm stand.` };
    const total = Math.round(amount * this.price(crop));
    this.money += total;
    this.stats.earned += total;
    this.grain = { crop: null, amount: 0 };
    this.emit('sell');
    return { ok: true, text: `Sold ${amount} L of ${CROPS[crop].name} for $${total.toLocaleString()}.` };
  }

  /** Move as much of the tank as fits into silo storage. */
  unloadGrain(): ActionResult {
    const { crop, amount } = this.grain;
    if (!crop || amount <= 0) return { ok: false, text: 'Grain tank is empty.' };
    if (!isGrain(crop)) return { ok: false, text: `The silo only stores grain. Take the ${CROPS[crop].name} to the farm stand.` };
    const space = this.storageCapacity - this.stored;
    if (space <= 0) return { ok: false, text: 'Storage is full. Sell some grain or upgrade storage.' };
    const moved = Math.min(space, amount);
    this.storage[crop] += moved;
    this.grain = moved === amount ? { crop: null, amount: 0 } : { crop, amount: amount - moved };
    this.emit('unload');
    const rest = moved < amount ? ` Storage full; ${amount - moved} L left in the tank.` : '';
    return { ok: true, text: `Stored ${moved.toLocaleString()} L of ${CROPS[crop].name}.${rest}` };
  }

  /** Sell stored grain of one crop at today's price (all of it unless an amount is given). */
  sellStored(crop: GrainId, amount = this.storage[crop]): ActionResult {
    const litres = Math.min(amount, this.storage[crop]);
    if (litres <= 0) return { ok: false, text: `No ${CROPS[crop].name} in storage.` };
    const total = Math.round(litres * this.price(crop));
    this.storage[crop] -= litres;
    this.money += total;
    this.stats.earned += total;
    this.emit('sell');
    return { ok: true, text: `Sold ${litres.toLocaleString()} L of stored ${CROPS[crop].name} for $${total.toLocaleString()}.` };
  }

  buyStorage(): ActionResult {
    const next = STORAGE_LEVELS[this.storageLevel + 1];
    if (!next) return { ok: false, text: 'Storage is fully upgraded.' };
    const fail = this.spend(next.price, next.name);
    if (fail) return fail;
    this.storageLevel++;
    this.emit('buy');
    return { ok: true, text: `Built ${next.name}. Unload grain at the silo and sell when prices are high.` };
  }

  repairTractor(id: string): ActionResult {
    const def = TRACTORS[id];
    const cond = this.tractorCondition.get(id);
    if (!def || cond === undefined) return { ok: false, text: 'You do not own that tractor.' };
    return this.repair(def.name, def.price, cond, () => this.tractorCondition.set(id, 1));
  }

  repairImplement(id: string): ActionResult {
    const def = IMPLEMENTS[id];
    const cond = this.implementCondition.get(id);
    if (!def || cond === undefined) return { ok: false, text: 'You do not own that implement.' };
    return this.repair(def.name, def.price, cond, () => this.implementCondition.set(id, 1));
  }

  /** Total cost to repair everything owned. */
  repairAllCost(): number {
    let n = 0;
    for (const [id, c] of this.tractorCondition) n += repairCost(TRACTORS[id].price, c);
    for (const [id, c] of this.implementCondition) n += repairCost(IMPLEMENTS[id].price, c);
    return n;
  }

  repairAll(): ActionResult {
    const cost = this.repairAllCost();
    if (cost <= 0) return { ok: false, text: 'Everything is in perfect condition.' };
    const fail = this.spend(cost, 'repairs');
    if (fail) return fail;
    for (const id of this.tractorCondition.keys()) this.tractorCondition.set(id, 1);
    for (const id of this.implementCondition.keys()) this.implementCondition.set(id, 1);
    this.emit('repair');
    return { ok: true, text: `Repaired everything for $${cost.toLocaleString()}.` };
  }

  private repair(name: string, price: number, cond: number, done: () => void): ActionResult {
    const cost = repairCost(price, cond);
    if (cost <= 0) return { ok: false, text: `The ${name} is in perfect condition.` };
    const fail = this.spend(cost, `repairing the ${name}`);
    if (fail) return fail;
    done();
    this.emit('repair');
    return { ok: true, text: `Repaired the ${name} for $${cost.toLocaleString()}.` };
  }

  refuel(): ActionResult {
    const need = this.tractorDef.fuelCapacity - this.fuel;
    if (need < 0.5) return { ok: false, text: 'Tank is already full.' };
    const litres = Math.min(need, this.money / FUEL_PRICE);
    if (litres < 0.5) return { ok: false, text: `Not enough money for fuel.${this.bankHint()}` };
    const cost = Math.ceil(litres * FUEL_PRICE);
    this.money -= cost;
    this.fuel += litres;
    this.emit('refuel');
    return { ok: true, text: `Refuelled ${Math.round(litres)} L for $${cost}.` };
  }

  private spend(price: number, what: string): ActionResult | null {
    if (this.money < price) return { ok: false, text: `Not enough money for ${what}.${this.bankHint()}` };
    this.money -= price;
    return null;
  }

  buyImplement(id: string): ActionResult {
    const def = IMPLEMENTS[id];
    if (!def) return { ok: false, text: 'Unknown implement.' };
    if (this.ownedImplements.has(id)) return { ok: false, text: `You already own the ${def.name}.` };
    const fail = this.spend(def.price, def.name);
    if (fail) return fail;
    this.ownedImplements.add(id);
    this.implementCondition.set(id, 1);
    this.emit('buy');
    return { ok: true, text: `Bought ${def.name}.` };
  }

  attach(id: string | null): ActionResult {
    if (id !== null && !this.ownedImplements.has(id)) return { ok: false, text: 'You do not own that implement.' };
    if (id !== null && !canPull(this.tractorDef, IMPLEMENTS[id])) {
      return { ok: false, text: `The ${IMPLEMENTS[id].name} needs ${IMPLEMENTS[id].power} hp. The ${this.tractorDef.name} has ${this.tractorDef.power} hp.` };
    }
    this.attached = id;
    this.emit('attach');
    this.lowered = false;
    this.lowerAnim = 0;
    return { ok: true, text: id ? `Attached ${IMPLEMENTS[id].name}.` : 'Detached implement.' };
  }

  buyTractor(id: string): ActionResult {
    const def = TRACTORS[id];
    if (!def) return { ok: false, text: 'Unknown tractor.' };
    if (this.ownedTractors.has(id)) return { ok: false, text: `You already own the ${def.name}.` };
    const fail = this.spend(def.price, def.name);
    if (fail) return fail;
    this.ownedTractors.add(id);
    this.tractorCondition.set(id, 1);
    this.emit('buy');
    return this.selectTractor(id);
  }

  selectTractor(id: string): ActionResult {
    if (!this.ownedTractors.has(id)) return { ok: false, text: 'You do not own that tractor.' };
    if (this.grain.amount > 0 && this.grain.amount > TRACTORS[id].grainCapacity) {
      return { ok: false, text: 'Sell your grain before switching tractors.' };
    }
    this.tractorId = id;
    this.fuel = Math.min(this.fuel, this.tractorDef.fuelCapacity);
    const imp = this.implement;
    if (imp && !canPull(this.tractorDef, imp)) {
      this.attached = null;
      this.lowered = false;
      this.lowerAnim = 0;
      return { ok: true, text: `Now driving the ${this.tractorDef.name}. It is too small for the ${imp.name}, so that was detached.` };
    }
    return { ok: true, text: `Now driving the ${this.tractorDef.name}.` };
  }

  buyField(id: number): ActionResult {
    const f = this.fields.find((x) => x.id === id);
    if (!f) return { ok: false, text: 'Unknown field.' };
    if (f.owned) return { ok: false, text: `You already own ${f.name}.` };
    const fail = this.spend(f.price, f.name);
    if (fail) return fail;
    f.owned = true;
    this.emit('buy');
    return { ok: true, text: `Bought ${f.name}!` };
  }

  // ---- Bank ---------------------------------------------------------------------------------

  private bankHint(): string {
    return this.creditAvailable >= 500 ? ' The bank can lend you money.' : '';
  }

  private accrueInterest(dt: number): void {
    if (this.loan > 0) this.loan += this.loan * LOAN_RATE_PER_SECOND * dt;
  }

  /** Morning: collect the loan instalment and report yesterday's stand takings. */
  private newDay(): void {
    if (this.standToday > 0) this.notify(`The farm stand took ${money(this.standToday)} yesterday.`, 'good', 0);
    this.standToday = 0;
    if (this.loan <= 0) return;
    const due = instalment(this.loan);
    if (this.money >= due) {
      this.money -= due;
      this.loan = Math.max(0, this.loan - due);
      if (this.loan < 0.5) this.loan = 0;
      this.loanMissed = 0;
      this.emit('loan');
      this.notify(this.loan > 0
        ? `Bank: loan instalment of ${money(due)} paid. ${money(Math.ceil(this.loan))} still owed.`
        : `Bank: final instalment of ${money(due)} paid. Your loan is cleared!`, 'info', 0);
    } else {
      this.loanMissed++;
      this.notify(`Bank: missed a ${money(due)} instalment. No fee is charged; pay when you can.`, 'warn', 0);
    }
  }

  borrow(amount: number): ActionResult {
    amount = Math.floor(amount);
    if (amount <= 0) return { ok: false, text: 'Choose an amount to borrow.' };
    if (amount > this.creditAvailable) {
      return { ok: false, text: `The bank will only lend you ${money(this.creditAvailable)} more. Buy land or equipment to raise your limit.` };
    }
    this.loan += amount;
    this.money += amount;
    this.emit('loan');
    return { ok: true, text: `Borrowed ${money(amount)}. You now owe ${money(Math.ceil(this.loan))}.` };
  }

  /** Repay part of the loan, or all of it (as much as you can afford) when no amount is given. */
  repay(amount = Math.ceil(this.loan)): ActionResult {
    if (this.loan <= 0) return { ok: false, text: 'You have no loan to repay.' };
    const pay = Math.min(Math.floor(amount), Math.ceil(this.loan), Math.floor(this.money));
    if (pay <= 0) return { ok: false, text: 'Not enough money to make a repayment.' };
    this.money -= pay;
    this.loan = Math.max(0, this.loan - pay);
    if (this.loan < 0.5) {
      this.loan = 0;
      this.loanMissed = 0;
    }
    this.emit('loan');
    return { ok: true, text: this.loan > 0 ? `Repaid ${money(pay)}. ${money(Math.ceil(this.loan))} still owed.` : `Repaid ${money(pay)}. Your loan is cleared!` };
  }

  // ---- Farm stand -------------------------------------------------------------------------

  /** Different kinds of produce in stock. */
  get standKinds(): number {
    return PRODUCE_IDS.filter((id) => this.standStock[id] > 0).length;
  }

  get standOpen(): boolean {
    return isOpen(this.time);
  }

  /** Customers per second while open, with the current stock and prices. */
  get potentialCustomerRate(): number {
    return customerRate(this.standLevel, this.standPriceLevel, this.standKinds);
  }

  /** Customers per second right now. */
  get customerRate(): number {
    return this.standOpen ? this.potentialCustomerRate : 0;
  }

  private updateStand(dt: number): void {
    const rate = this.customerRate;
    if (rate > 0 && this.customers.length < MAX_CUSTOMERS) {
      this.nextCustomer -= dt * rate;
      if (this.nextCustomer <= 0) {
        // Exponential gaps between arrivals, measured in "customer units" so rate changes apply at once.
        this.nextCustomer = -Math.log(1 - this.random() * 0.999);
        const stocked = PRODUCE_IDS.filter((id) => this.standStock[id] > 0);
        const crop = stocked[Math.floor(this.random() * stocked.length)];
        this.customers.push(makeCustomer(++this.customerId, crop, this.random));
      }
    }
    for (const c of this.customers) {
      c.age += dt;
      if (!c.served && c.age >= timeline(c).arrive) this.serve(c);
    }
    this.customers = this.customers.filter((c) => c.age < timeline(c).gone);
  }

  /** A customer at the counter buys what they came for, or something else if it sold out. */
  private serve(c: Customer): void {
    c.served = true;
    if (this.standStock[c.crop] <= 0) {
      const other = PRODUCE_IDS.find((id) => this.standStock[id] > 0);
      if (!other) return;
      c.crop = other;
    }
    const units = Math.min(c.want, this.standStock[c.crop]);
    const total = Math.round(units * this.standPrice(c.crop));
    this.standStock[c.crop] -= units;
    c.bought = units;
    this.money += total;
    this.stats.earned += total;
    this.stats.standEarned += total;
    this.standToday += total;
    const near = Math.hypot(this.tractor.x - STAND_COUNTER.x, this.tractor.z - STAND_COUNTER.z) < 35;
    if (near) {
      this.emit('customer');
      this.notify(`A customer bought ${amountText(c.crop, units)} for ${money(total)}.`, 'good', 0);
    }
    if (this.standStocked <= 0) this.notify('The farm stand has sold out! Bring more produce.', 'warn', 30);
  }

  /** Move produce from the tractor tank onto the stand, as much as fits. */
  stockStand(): ActionResult {
    const { crop, amount } = this.grain;
    if (!crop || amount <= 0) return { ok: false, text: 'The tank is empty.' };
    if (!isProduce(crop)) return { ok: false, text: `The farm stand sells vegetables and flowers. Take the ${CROPS[crop].name} to the silo.` };
    const space = this.standCapacity - this.standStocked;
    if (space <= 0) return { ok: false, text: 'The stand is full. Wait for customers or upgrade the stand.' };
    const moved = Math.min(space, amount);
    this.standStock[crop] += moved;
    this.grain = moved === amount ? { crop: null, amount: 0 } : { crop, amount: amount - moved };
    this.emit('unload');
    const rest = moved < amount ? ` The stand is full; ${amount - moved} ${CROPS[crop].unit} left in the tank.` : '';
    return { ok: true, text: `Stocked the stand with ${amountText(crop, moved)}.${rest}` };
  }

  /** Sell the tank's produce to a wholesaler for a low price. */
  wholesale(): ActionResult {
    const { crop, amount } = this.grain;
    if (!crop || amount <= 0) return { ok: false, text: 'The tank is empty.' };
    if (!isProduce(crop)) return { ok: false, text: 'Sell grain at the silo.' };
    const total = Math.round(amount * CROPS[crop].basePrice * WHOLESALE_RATE);
    this.money += total;
    this.stats.earned += total;
    this.grain = { crop: null, amount: 0 };
    this.emit('sell');
    return { ok: true, text: `Sold ${amountText(crop, amount)} to the wholesaler for ${money(total)}.` };
  }

  setStandPrice(level: number): ActionResult {
    if (!PRICE_LEVELS[level]) return { ok: false, text: 'Unknown price setting.' };
    this.standPriceLevel = level;
    return { ok: true, text: `Stand prices set to ${PRICE_LEVELS[level].name}.` };
  }

  buyStandUpgrade(): ActionResult {
    const next = STAND_LEVELS[this.standLevel + 1];
    if (!next) return { ok: false, text: 'The stand is fully upgraded.' };
    const fail = this.spend(next.price, `the ${next.name}`);
    if (fail) return fail;
    this.standLevel++;
    this.emit('buy');
    return { ok: true, text: `Built the ${next.name}. More room for produce and more customers!` };
  }

  setSeed(crop: CropId): void {
    this.seedCrop = crop;
    this.notify(`Seed selected: ${CROPS[crop].name}`, 'info', 0);
  }
}
