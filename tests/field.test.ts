import { describe, expect, it } from 'vitest';
import { CROPS } from '../src/sim/crops';
import { Field, TILE_SIZE, TileState } from '../src/sim/field';

const mk = () => new Field(1, 'Test', 10, 20, 4, 3, 0, true);

describe('Field', () => {
  it('maps world positions to tiles', () => {
    const f = mk();
    expect(f.tileAt(10, 20)).toBe(0);
    expect(f.tileAt(10 + TILE_SIZE * 1.5, 20 + TILE_SIZE * 2.5)).toBe(2 * 4 + 1);
    expect(f.tileAt(9.9, 20)).toBe(-1);
    expect(f.tileAt(10 + f.width, 20)).toBe(-1);
    expect(f.tileCenter(0)).toEqual([11, 21]);
  });

  it('runs the full crop cycle', () => {
    const f = mk();
    expect(f.seed(0, 'wheat')).toBe(false); // grass cannot be seeded
    expect(f.plow(0)).toBe(true);
    expect(f.plow(0)).toBe(false); // already plowed
    expect(f.seed(0, 'wheat')).toBe(true);
    expect(f.state[0]).toBe(TileState.Seeded);
    expect(f.harvest(0)).toBeNull(); // not ripe

    f.update(CROPS.wheat.growTime / 2);
    expect(f.growth[0]).toBeCloseTo(0.5);
    expect(f.state[0]).toBe(TileState.Seeded);

    expect(f.update(CROPS.wheat.growTime)).toBe(true);
    expect(f.state[0]).toBe(TileState.Ripe);

    expect(f.harvest(0)).toEqual({ crop: 'wheat', amount: CROPS.wheat.yieldPerTile });
    expect(f.state[0]).toBe(TileState.Stubble);
    expect(f.plow(0)).toBe(true); // stubble can be plowed again
  });

  it('bumps version on state change only', () => {
    const f = mk();
    const v = f.version;
    f.plow(0);
    expect(f.version).toBe(v + 1);
    f.plow(0);
    expect(f.version).toBe(v + 1);
  });

  it('counts tile states', () => {
    const f = mk();
    f.fillRipe('corn');
    f.harvest(3);
    const c = f.counts();
    expect(c[TileState.Ripe]).toBe(11);
    expect(c[TileState.Stubble]).toBe(1);
  });
});
