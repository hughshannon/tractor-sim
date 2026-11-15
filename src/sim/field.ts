import { CROPS, CROP_IDS, type CropId } from './crops';

export const TILE_SIZE = 2;
export const NO_CROP = 255;

export enum TileState {
  Grass = 0,
  Plowed = 1,
  Seeded = 2,
  Ripe = 3,
  Stubble = 4,
}

export interface HarvestResult {
  crop: CropId;
  amount: number;
}

/** A rectangular field made of square tiles. (x, z) is the minimum corner in world space. */
export class Field {
  readonly state: Uint8Array;
  readonly crop: Uint8Array;
  readonly growth: Float32Array;
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
  ) {
    const n = cols * rows;
    this.state = new Uint8Array(n);
    this.crop = new Uint8Array(n).fill(NO_CROP);
    this.growth = new Float32Array(n);
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
    if (s !== TileState.Grass && s !== TileState.Stubble) return false;
    this.state[i] = TileState.Plowed;
    this.crop[i] = NO_CROP;
    this.growth[i] = 0;
    this.version++;
    return true;
  }

  seed(i: number, crop: CropId): boolean {
    if (this.state[i] !== TileState.Plowed) return false;
    this.state[i] = TileState.Seeded;
    this.crop[i] = CROP_IDS.indexOf(crop);
    this.growth[i] = 0;
    this.version++;
    return true;
  }

  harvest(i: number): HarvestResult | null {
    if (this.state[i] !== TileState.Ripe) return null;
    const crop = this.cropAt(i);
    if (!crop) return null;
    this.state[i] = TileState.Stubble;
    this.crop[i] = NO_CROP;
    this.growth[i] = 0;
    this.version++;
    return { crop, amount: CROPS[crop].yieldPerTile };
  }

  /** Fill every tile with a ripe crop (used for the starting field). */
  fillRipe(crop: CropId): void {
    this.state.fill(TileState.Ripe);
    this.crop.fill(CROP_IDS.indexOf(crop));
    this.growth.fill(1);
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

  counts(): Record<TileState, number> {
    const out = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } as Record<TileState, number>;
    for (let i = 0; i < this.state.length; i++) out[this.state[i] as TileState]++;
    return out;
  }
}
