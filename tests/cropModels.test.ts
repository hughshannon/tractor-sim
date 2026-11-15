import { describe, expect, it } from 'vitest';
import { Stage, cropGeometries, cropStage, stageScale } from '../src/render/cropModels';
import { CROP_IDS } from '../src/sim/crops';

describe('crop stages', () => {
  it('maps growth to stages with progress through each', () => {
    expect(cropStage(0, false)).toEqual({ stage: Stage.Sprout, t: 0 });
    expect(cropStage(0.1, false).stage).toBe(Stage.Sprout);
    expect(cropStage(0.2, false)).toEqual({ stage: Stage.Leafy, t: 0 });
    expect(cropStage(0.35, false).t).toBeCloseTo(0.5);
    expect(cropStage(0.5, false).stage).toBe(Stage.Mature);
    expect(cropStage(0.99, false).stage).toBe(Stage.Mature);
    expect(cropStage(1, true)).toEqual({ stage: Stage.Ripe, t: 1 });
  });

  it('grows plants up to full size by the end of each stage', () => {
    for (const s of [Stage.Sprout, Stage.Leafy, Stage.Mature, Stage.Ripe]) {
      expect(stageScale(s, 1)).toBe(1);
      expect(stageScale(s, 0)).toBeGreaterThan(0.5);
    }
  });
});

describe('crop geometries', () => {
  const geos = cropGeometries();

  it('builds a coloured model for every crop and stage', () => {
    expect(geos).toHaveLength(CROP_IDS.length);
    for (const stages of geos) {
      expect(stages).toHaveLength(4);
      for (const g of stages) {
        expect(g.attributes.position.count).toBeGreaterThan(0);
        expect(g.attributes.color.count).toBe(g.attributes.position.count);
      }
    }
  });

  it('stays within the per-tile triangle budget', () => {
    // Two row segments per tile; the largest field has ~1000 tiles.
    for (const stages of geos) {
      for (const g of stages) expect((g.attributes.position.count / 3) * 2).toBeLessThan(900);
    }
  });
});
