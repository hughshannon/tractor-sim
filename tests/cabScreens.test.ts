import { describe, expect, it } from 'vitest';
import { GPS_COLORS, mapColor } from '../src/render/gpsMap';
import { pixelTextWidth } from '../src/render/pixelFont';
import { TileState } from '../src/sim/field';
import { Game } from '../src/sim/game';
import { fieldProgress } from '../src/ui/readouts';

/** Put the tractor in the middle of the home field. */
function inHomeField(g: Game) {
  const f = g.fields[0];
  g.tractor.heading = 0;
  g.tractor.x = f.x + f.width / 2;
  g.tractor.z = f.z + f.depth / 2;
  return f;
}

describe('GPS field progress', () => {
  it('names the zone off-field, without a percentage', () => {
    const g = new Game();
    g.tractor.x = 15;
    g.tractor.z = -2;
    expect(fieldProgress(g)).toEqual({ name: 'SILO', done: null, onField: false });
    g.tractor.z = 40;
    g.tractor.x = 100;
    expect(fieldProgress(g)).toEqual({ name: '', done: null, onField: false });
  });

  it('measures harvest progress against the crop that was there', () => {
    const g = new Game();
    const f = inHomeField(g);
    expect(fieldProgress(g)).toEqual({ name: 'HOME', done: 0, onField: true });
    for (let i = 0; i < f.size / 4; i++) f.harvest(i);
    expect(fieldProgress(g).done).toBe(0.25);
  });

  it('measures plowing and seeding across the whole field', () => {
    const g = new Game();
    const f = inHomeField(g);
    for (let i = 0; i < f.size; i++) f.harvest(i);
    for (let i = 0; i < f.size / 2; i++) f.plow(i);
    g.attached = 'plow_s';
    expect(fieldProgress(g).done).toBe(0.5);
    g.attached = 'seeder_s';
    expect(fieldProgress(g).done).toBe(0);
    for (let i = 0; i < f.size / 4; i++) f.seed(i, 'corn');
    expect(fieldProgress(g).done).toBe(0.25);
    g.attached = 'harvester_s';
    expect(fieldProgress(g).done).toBe(1); // all ripe crop has been cut
  });
});

describe('GPS map colours', () => {
  it('colours owned field tiles by state and dims unowned fields', () => {
    const g = new Game();
    const home = g.fields[0];
    const [x, z] = home.tileCenter(0);
    expect(mapColor(g, x, z)).toBe(GPS_COLORS[TileState.Ripe]);
    home.harvest(0);
    expect(mapColor(g, x, z)).toBe(GPS_COLORS[TileState.Stubble]);
    home.plow(0);
    expect(mapColor(g, x, z)).toBe(GPS_COLORS[TileState.Plowed]);
    home.seed(0, 'wheat');
    expect(mapColor(g, x, z)).toMatch(/^rgb\(/);
    const east = g.fields[1];
    expect(mapColor(g, east.x + 1, east.z + 1)).toBe(GPS_COLORS.notOwned);
  });

  it('shows zones, the yard and open ground', () => {
    const g = new Game();
    expect(mapColor(g, 15, -2)).toBe(GPS_COLORS.zone);
    expect(mapColor(g, 0, -15.5)).toBe(GPS_COLORS.yard);
    expect(mapColor(g, 100, -100)).toBe(GPS_COLORS.ground);
  });
});

describe('pixel font', () => {
  it('advances 4 texels per glyph with no trailing gap', () => {
    expect(pixelTextWidth('07:34')).toBe(19);
    expect(pixelTextWidth('')).toBe(0);
  });
});
