import { CROPS, type ProduceId } from './crops';
import { hourAt } from './daylight';

/**
 * The roadside farm stand. You stock it with produce from the tractor; while it is open, customers walk in
 * from the road, buy something that is in stock and walk off again.
 */

export interface StandLevel {
  name: string;
  price: number;
  /** Total units of produce it can hold. */
  capacity: number;
  /** Customer arrival multiplier. */
  demand: number;
}

export const STAND_LEVELS: StandLevel[] = [
  { name: 'Roadside cart', price: 0, capacity: 400, demand: 1 },
  { name: 'Farm stand', price: 6000, capacity: 1500, demand: 1.8 },
  { name: 'Farm shop', price: 18000, capacity: 5000, demand: 3 },
];

export interface PriceLevel {
  name: string;
  /** Multiplier on each crop's normal price. */
  mul: number;
  /** Multiplier on how often customers come. */
  demand: number;
}

export const PRICE_LEVELS: PriceLevel[] = [
  { name: 'Bargain', mul: 0.8, demand: 1.6 },
  { name: 'Fair', mul: 1, demand: 1 },
  { name: 'Premium', mul: 1.3, demand: 0.55 },
];
export const DEFAULT_PRICE_LEVEL = 1;

/** Opening hours (clock time). */
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 20;
/** Customers per second at a cart with fair prices and one kind of produce. */
export const BASE_CUSTOMER_RATE = 1 / 9;
/** Each extra kind of produce in stock brings this many more customers. */
export const VARIETY_BONUS = 0.2;
export const MAX_CUSTOMERS = 10;
/** Selling a tank of produce to the wholesaler pays this fraction of the normal price. */
export const WHOLESALE_RATE = 0.5;

/** How much one customer buys of each crop: [min, max] units. */
export const BASKET: Record<ProduceId, [number, number]> = {
  potato: [3, 10],
  tomato: [2, 6],
  pumpkin: [1, 3],
  sunflower: [5, 12],
};

export const isOpen = (t: number): boolean => {
  const h = hourAt(t);
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
};

/** Price per unit at the stand for a crop and price level. */
export function standPrice(crop: ProduceId, level: number): number {
  return Math.round(CROPS[crop].basePrice * PRICE_LEVELS[level].mul * 100) / 100;
}

/** Customers per second for a stand level, price level and number of different crops in stock. */
export function customerRate(standLevel: number, priceLevel: number, kinds: number): number {
  if (kinds <= 0) return 0;
  return BASE_CUSTOMER_RATE * STAND_LEVELS[standLevel].demand * PRICE_LEVELS[priceLevel].demand
    * (1 + VARIETY_BONUS * (kinds - 1));
}

// ---- Customers walking to and from the stand ----------------------------------------------

/** Counter at the front of the stand (customers stand here) and the road they arrive along. */
export const STAND_COUNTER = { x: 29, z: 3.4 };
export const ROAD_Z = 10;
export const WALK_SPEED = 1.4;
export const BUY_TIME = 2.5;

type P = [number, number];

export interface Customer {
  id: number;
  /** Seconds since the customer appeared. */
  age: number;
  /** Polyline from the road to the counter, and from the counter back to the road. */
  pathIn: P[];
  pathOut: P[];
  crop: ProduceId;
  want: number;
  /** Units actually bought (0 until served, or if it sold out before they got there). */
  bought: number;
  served: boolean;
  /** 0..1 used by the renderer for clothing colour and height. */
  look: number;
}

function length(path: P[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return n;
}

/** Arrival time at the counter and the time the customer has walked off. */
export function timeline(c: Customer): { arrive: number; leave: number; gone: number } {
  const arrive = length(c.pathIn) / WALK_SPEED;
  const leave = arrive + BUY_TIME;
  return { arrive, leave, gone: leave + length(c.pathOut) / WALK_SPEED };
}

/** A new customer coming in from one side of the road, leaving towards the other. */
export function makeCustomer(id: number, crop: ProduceId, random: () => number): Customer {
  const side = random() < 0.5 ? -1 : 1;
  const slot = (random() - 0.5) * 3;
  const cx = STAND_COUNTER.x + slot, cz = STAND_COUNTER.z + random() * 0.4;
  const from: P = [STAND_COUNTER.x + side * (16 + random() * 12), ROAD_Z + (random() - 0.5) * 2];
  const to: P = [STAND_COUNTER.x - side * (16 + random() * 12), ROAD_Z + (random() - 0.5) * 2];
  const [lo, hi] = BASKET[crop];
  return {
    id,
    age: 0,
    pathIn: [from, [cx + side * 1.5, ROAD_Z - 1], [cx, cz]],
    pathOut: [[cx, cz], [cx - side * 1.5, ROAD_Z - 1], to],
    crop,
    want: lo + Math.floor(random() * (hi - lo + 1)),
    bought: 0,
    served: false,
    look: random(),
  };
}

function along(path: P[], d: number): { x: number; z: number; heading: number } {
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (d <= seg || i === path.length - 1) {
      const k = seg > 0 ? Math.min(1, d / seg) : 1;
      return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, heading: Math.atan2(bx - ax, bz - az) };
    }
    d -= seg;
  }
  return { x: path[0][0], z: path[0][1], heading: 0 };
}

/** Where a customer is now, which way they face and whether they are walking. */
export function customerPose(c: Customer): { x: number; z: number; heading: number; walking: boolean } {
  const { arrive, leave } = timeline(c);
  if (c.age < arrive) return { ...along(c.pathIn, c.age * WALK_SPEED), walking: true };
  if (c.age < leave) {
    const [x, z] = c.pathIn[c.pathIn.length - 1];
    return { x, z, heading: Math.PI, walking: false }; // facing the counter (-Z)
  }
  return { ...along(c.pathOut, (c.age - leave) * WALK_SPEED), walking: true };
}
