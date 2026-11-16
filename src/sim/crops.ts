export type CropId = 'wheat' | 'corn' | 'canola';

export interface CropDef {
  id: CropId;
  name: string;
  /** Seconds of game time from seeding to ripe. */
  growTime: number;
  /** Litres of grain harvested per tile. */
  yieldPerTile: number;
  /** Money charged per tile seeded. */
  seedCostPerTile: number;
  /** Base market price per litre. */
  basePrice: number;
  /** Base colours for the crop models: young foliage, ripe plant. */
  youngColor: number;
  ripeColor: number;
  /** Full-grown plant height in metres. */
  height: number;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: {
    id: 'wheat', name: 'Wheat', growTime: 90, yieldPerTile: 10, seedCostPerTile: 2,
    basePrice: 1.4, youngColor: 0x5fa83a, ripeColor: 0xe0c060, height: 0.9,
  },
  corn: {
    id: 'corn', name: 'Corn', growTime: 150, yieldPerTile: 14, seedCostPerTile: 4,
    basePrice: 1.2, youngColor: 0x3f9a35, ripeColor: 0xc8b040, height: 1.8,
  },
  canola: {
    id: 'canola', name: 'Canola', growTime: 120, yieldPerTile: 8, seedCostPerTile: 3,
    basePrice: 2.1, youngColor: 0x58a848, ripeColor: 0xb8a060, height: 1.1,
  },
};

export const CROP_IDS: CropId[] = ['wheat', 'corn', 'canola'];

/** Money charged per growing tile sprayed with fertilizer. */
export const FERTILIZER_COST_PER_TILE = 2;
/** Extra yield on fertilized tiles (0.4 = +40%). */
export const FERTILIZER_BONUS = 0.4;

/** Litres harvested from one tile, rounded to whole litres. */
export function tileYield(crop: CropId, fertilized: boolean): number {
  return Math.round(CROPS[crop].yieldPerTile * (fertilized ? 1 + FERTILIZER_BONUS : 1));
}
