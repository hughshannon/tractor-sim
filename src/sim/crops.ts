export type GrainId = 'wheat' | 'corn' | 'canola';
export type ProduceId = 'potato' | 'tomato' | 'pumpkin' | 'sunflower';
export type CropId = GrainId | ProduceId;

export interface CropDef {
  id: CropId;
  name: string;
  /** Grain is sold or stored at the silo; produce is sold at the farm stand. */
  kind: 'grain' | 'produce';
  /** Unit the harvest is counted in (L for grain, kg or pieces for produce). */
  unit: string;
  /** Seconds of game time from seeding to ripe. */
  growTime: number;
  /** Units harvested per tile. */
  yieldPerTile: number;
  /** Money charged per tile seeded. */
  seedCostPerTile: number;
  /** Base price per unit: the market base for grain, the normal stand price for produce. */
  basePrice: number;
  /** Base colours for the crop models: young foliage, ripe plant. */
  youngColor: number;
  ripeColor: number;
  /** Full-grown plant height in metres. */
  height: number;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: {
    id: 'wheat', name: 'Wheat', kind: 'grain', unit: 'L', growTime: 90, yieldPerTile: 10, seedCostPerTile: 2,
    basePrice: 1.4, youngColor: 0x5fa83a, ripeColor: 0xe0c060, height: 0.9,
  },
  corn: {
    id: 'corn', name: 'Corn', kind: 'grain', unit: 'L', growTime: 150, yieldPerTile: 14, seedCostPerTile: 4,
    basePrice: 1.2, youngColor: 0x3f9a35, ripeColor: 0xc8b040, height: 1.8,
  },
  canola: {
    id: 'canola', name: 'Canola', kind: 'grain', unit: 'L', growTime: 120, yieldPerTile: 8, seedCostPerTile: 3,
    basePrice: 2.1, youngColor: 0x58a848, ripeColor: 0xb8a060, height: 1.1,
  },
  potato: {
    id: 'potato', name: 'Potatoes', kind: 'produce', unit: 'kg', growTime: 110, yieldPerTile: 12, seedCostPerTile: 4,
    basePrice: 1.6, youngColor: 0x4f9a3a, ripeColor: 0x9a9a50, height: 0.55,
  },
  tomato: {
    id: 'tomato', name: 'Tomatoes', kind: 'produce', unit: 'kg', growTime: 140, yieldPerTile: 8, seedCostPerTile: 5,
    basePrice: 3.2, youngColor: 0x3f8a32, ripeColor: 0xd8352a, height: 1.2,
  },
  pumpkin: {
    id: 'pumpkin', name: 'Pumpkins', kind: 'produce', unit: 'pcs', growTime: 170, yieldPerTile: 2, seedCostPerTile: 4,
    basePrice: 11, youngColor: 0x4a9a38, ripeColor: 0xe8801c, height: 0.6,
  },
  sunflower: {
    id: 'sunflower', name: 'Sunflowers', kind: 'produce', unit: 'stems', growTime: 130, yieldPerTile: 6, seedCostPerTile: 3,
    basePrice: 3, youngColor: 0x5aa03a, ripeColor: 0xf5c518, height: 2,
  },
};

/** Order matters: field tiles store the index into this list, so new crops are only ever appended. */
export const CROP_IDS: CropId[] = ['wheat', 'corn', 'canola', 'potato', 'tomato', 'pumpkin', 'sunflower'];
export const GRAIN_IDS: GrainId[] = ['wheat', 'corn', 'canola'];
export const PRODUCE_IDS: ProduceId[] = ['potato', 'tomato', 'pumpkin', 'sunflower'];

export const isGrain = (crop: CropId): crop is GrainId => CROPS[crop].kind === 'grain';
export const isProduce = (crop: CropId): crop is ProduceId => CROPS[crop].kind === 'produce';

/** "120 kg Potatoes" / "1,200 L Wheat". */
export function amountText(crop: CropId, amount: number): string {
  return `${Math.round(amount).toLocaleString()} ${CROPS[crop].unit} ${CROPS[crop].name}`;
}

/** Money charged per growing tile sprayed with fertilizer. */
export const FERTILIZER_COST_PER_TILE = 2;
/** Extra yield on fertilized tiles (0.4 = +40%). */
export const FERTILIZER_BONUS = 0.4;

/** Units harvested from one tile, rounded to whole units. */
export function tileYield(crop: CropId, fertilized: boolean): number {
  return Math.round(CROPS[crop].yieldPerTile * (fertilized ? 1 + FERTILIZER_BONUS : 1));
}
