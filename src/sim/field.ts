import { CROPS, CROP_IDS, tileYield, type CropId } from './crops';

export const TILE_SIZE = 2;
export const NO_CROP = 255;

export enum TileState {
  Grass = 0,
  Plowed = 1,
  Seeded = 2,
  Ripe = 3,
  Stubble = 4,
}

/** A giant boulder: a circle on the ground that tractors must drive around. */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

/** A tile is blocked when a boulder covers more than its edge (a tile it only grazes stays workable). */
const BLOCK_MARGIN = 0.3;

export interface HarvestResult {
  crop: CropId;
  amount: number;
}

/** A rectangular field made of square tiles. (x, z) is the minimum corner in world space. */
export class Field {
  readonly state: Uint8Array;
  readonly crop: Uint8Array;
  readonly growth: Float32Array;
  /** 1 where a growing or ripe crop has been fertilized. */
  readonly fert: Uint8Array;
  /** 1 where a boulder sits on the tile: it stays grass and can never be worked. */
  readonly blocked: Uint8Array;
  /** Incremented whenever a tile's state changes (used by the renderer to know when to redraw). */
  version = 0;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly x: number,
    readonly z: number,
    readonly cols: number,
    readonly rows: number,
    readonly price: number,
    public owned: boolean,
    readonly obstacles: readonly Obstacle[] = [],
  ) {
    const n = cols * rows;
    this.state = new Uint8Array(n);
    this.crop = new Uint8Array(n).fill(NO_CROP);
    this.growth = new Float32Array(n);
    this.fert = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const [cx, cz] = this.tileCenter(i);
      const h = TILE_SIZE / 2;
      for (const o of obstacles) {
        // Distance from the boulder centre to the nearest point of the tile square.
        const dx = Math.max(Math.abs(o.x - cx) - h, 0), dz = Math.max(Math.abs(o.z - cz) - h, 0);
        if (Math.hypot(dx, dz) < o.radius - BLOCK_MARGIN) this.blocked[i] = 1;
      }
    }
  }

  /** Tiles that can be farmed (not under a boulder). */
  get workable(): number {
    let n = this.size;
    for (let i = 0; i < this.blocked.length; i++) n -= this.blocked[i];
    return n;
  }

  get size(): number {
    return this.cols * this.rows;
  }

  get width(): number {
    return this.cols * TILE_SIZE;
  }

  get depth(): number {
    return this.rows * TILE_SIZE;
  }

  get hectares(): number {
    return (this.width * this.depth) / 10000;
  }

  contains(wx: number, wz: number): boolean {
    return wx >= this.x && wz >= this.z && wx < this.x + this.width && wz < this.z + this.depth;
  }

  /** Tile index under a world position, or -1 if outside the field. */
  tileAt(wx: number, wz: number): number {
    if (!this.contains(wx, wz)) return -1;
    const c = Math.floor((wx - this.x) / TILE_SIZE);
    const r = Math.floor((wz - this.z) / TILE_SIZE);
    return r * this.cols + c;
  }

  tileCenter(i: number): [number, number] {
    const c = i % this.cols;
    const r = Math.floor(i / this.cols);
    return [this.x + (c + 0.5) * TILE_SIZE, this.z + (r + 0.5) * TILE_SIZE];
  }

  cropAt(i: number): CropId | null {
    const v = this.crop[i];
    return v === NO_CROP ? null : CROP_IDS[v];
  }

  plow(i: number): boolean {
    const s = this.state[i];
    if (this.blocked[i] || (s !== TileState.Grass && s !== TileState.Stubble)) return false;
    this.state[i] = TileState.Plowed;
    this.crop[i] = NO_CROP;
    this.growth[i] = 0;
    this.fert[i] = 0;
    this.version++;
    return true;
  }

  seed(i: number, crop: CropId): boolean {
    if (this.state[i] !== TileState.Plowed) return false;
    this.state[i] = TileState.Seeded;
    this.crop[i] = CROP_IDS.indexOf(crop);
    this.growth[i] = 0;
    this.fert[i] = 0;
    this.version++;
    return true;
  }

  /** Fertilize a growing crop. Returns false if the tile is not growing or is already fertilized. */
  fertilize(i: number): boolean {
    if (this.state[i] !== TileState.Seeded || this.fert[i]) return false;
    this.fert[i] = 1;
    this.version++;
    return true;
  }

  /** Litres a ripe tile would yield, or 0. */
  yieldAt(i: number): number {
    const crop = this.state[i] === TileState.Ripe ? this.cropAt(i) : null;
    return crop ? tileYield(crop, this.fert[i] === 1) : 0;
  }

  harvest(i: number): HarvestResult | null {
    if (this.state[i] !== TileState.Ripe) return null;
    const crop = this.cropAt(i);
    if (!crop) return null;
    const amount = this.yieldAt(i);
    this.state[i] = TileState.Stubble;
    this.crop[i] = NO_CROP;
    this.growth[i] = 0;
    this.fert[i] = 0;
    this.version++;
    return { crop, amount };
  }

  /** Fill every tile with a ripe crop (used for the starting field). */
  fillRipe(crop: CropId): void {
    const id = CROP_IDS.indexOf(crop);
    for (let i = 0; i < this.size; i++) {
      if (this.blocked[i]) continue;
      this.state[i] = TileState.Ripe;
      this.crop[i] = id;
      this.growth[i] = 1;
      this.fert[i] = 0;
    }
    this.version++;
  }

  /** Advance crop growth. Returns true if any tile ripened. */
  update(dt: number): boolean {
    let ripened = false;
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] !== TileState.Seeded) continue;
      const crop = CROPS[CROP_IDS[this.crop[i]]];
      const g = this.growth[i] + dt / crop.growTime;
      if (g >= 1) {
        this.growth[i] = 1;
        this.state[i] = TileState.Ripe;
        ripened = true;
      } else {
        this.growth[i] = g;
      }
    }
    if (ripened) this.version++;
    return ripened;
  }

  /** Tile states over the workable tiles (boulder tiles are left out). */
  counts(): Record<TileState, number> {
    const out = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } as Record<TileState, number>;
    for (let i = 0; i < this.state.length; i++) if (!this.blocked[i]) out[this.state[i] as TileState]++;
    return out;
  }
}
