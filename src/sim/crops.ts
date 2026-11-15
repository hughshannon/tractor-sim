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
  /** Colours: young plant, ripe plant. */
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
    basePrice: 2.1, youngColor: 0x58a848, ripeColor: 0xf2dc30, height: 1.1,
  },
};

export const CROP_IDS: CropId[] = ['wheat', 'corn', 'canola'];
