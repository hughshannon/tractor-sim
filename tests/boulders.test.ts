import { describe, expect, it } from 'vitest';
import { BOULDERS } from '../src/sim/farm';
import { Field, TileState } from '../src/sim/field';
import { BOULDER_DAMAGE, Game } from '../src/sim/game';
import { decodeSave, snapshot } from '../src/sim/save';

const forward = { throttle: 1, steer: 0, brake: false };
const meadow = (g: Game) => g.fields.find((f) => f.id === 5)!;
const ridge = (g: Game) => g.fields.find((f) => f.id === 6)!;

describe('boulder fields', () => {
  it('are for sale, cheaper per tile than open land, and have boulders inside them', () => {
    const g = new Game();
    const east = g.fields.find((f) => f.id === 2)!;
    for (const f of [meadow(g), ridge(g)]) {
      expect(f.owned).toBe(false);
      expect(f.obstacles.length).toBeGreaterThan(3);
      expect(f.workable).toBeLessThan(f.size);
      expect(f.price / f.workable).toBeLessThan(east.price / east.size);
      for (const o of f.obstacles) expect(f.contains(o.x, o.z)).toBe(true);
    }
    expect(g.buyField(5).ok).toBe(false); // too expensive at the start
  });

  it('leaves room between boulders and the field edge for a tractor to pass', () => {
    const gap = 2 * 1.6 + 1;
    for (const [id, list] of Object.entries(BOULDERS)) {
      const f = new Game().fields.find((x) => x.id === Number(id))!;
      list.forEach((a, i) => {
        list.slice(i + 1).forEach((b) => expect(Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius).toBeGreaterThan(gap));
        expect(Math.min(a.x - f.x, f.x + f.width - a.x, a.z - f.z, f.z + f.depth - a.z) - a.radius).toBeGreaterThan(gap / 2);
      });
    }
  });

  it('blocks tiles under a boulder from being worked', () => {
    const f = new Field(9, 'Rocks', 0, 0, 6, 6, 0, true, [{ x: 6, z: 6, radius: 2 }]);
    const under = f.tileAt(6.5, 6.5);
    const far = f.tileAt(0.5, 0.5);
    expect(f.blocked[under]).toBe(1);
    expect(f.blocked[far]).toBe(0);
    expect(f.plow(under)).toBe(false);
    expect(f.plow(far)).toBe(true);
    f.fillRipe('wheat');
    expect(f.state[under]).toBe(TileState.Grass);
    const c = f.counts();
    expect(c[TileState.Ripe]).toBe(f.workable);
    expect(c[TileState.Grass]).toBe(0);
  });

  it('stops the tractor from driving through a boulder', () => {
    const g = new Game();
    g.attach(null);
    const b = meadow(g).obstacles[0];
    g.tractor = { x: b.x, z: b.z - b.radius - 6, heading: 0, speed: 0, steer: 0, odometer: 0 };
    for (let i = 0; i < 300; i++) g.update(1 / 60, forward);
    expect(Math.hypot(g.tractor.x - b.x, g.tractor.z - b.z)).toBeGreaterThanOrEqual(b.radius + 1.6 - 1e-6);
    expect(g.tractor.z).toBeLessThan(b.z);
  });

  it('a lowered implement that hits a boulder stops the tractor and is damaged; raised, it does not', () => {
    const g = new Game();
    g.money = 1e5;
    g.buyImplement('sprayer_s');
    g.attach('sprayer_s');
    const b = meadow(g).obstacles[0];
    const imp = g.implement!;
    // Drive +Z past the boulder: the tractor body clears it, but the 6 m boom (trailing behind) does not.
    const side = 1.6 + b.radius + 0.3;
    expect(side - imp.width / 2).toBeLessThan(b.radius);
    g.tractor = { x: b.x - side, z: b.z - 12, heading: 0, speed: 0, steer: 0, odometer: 0 };
    g.toggleLower();
    for (let i = 0; i < 400; i++) g.update(1 / 60, forward);
    const wear = g.implementCondition.get('sprayer_s')!;
    expect(wear).toBeLessThan(1);
    // One hit, plus a little ordinary wear from working; leaning on the throttle doesn't keep grinding it down.
    expect(wear).toBeGreaterThan(1 - BOULDER_DAMAGE - 0.005);
    const stuckAt = g.tractor.z;
    expect(stuckAt + imp.offset).toBeLessThan(b.z);
    expect(g.messages.some((m) => m.text.includes('hit a boulder'))).toBe(true);

    g.toggleLower();
    for (let i = 0; i < 300; i++) g.update(1 / 60, forward);
    expect(g.tractor.z).toBeGreaterThan(b.z + 5);
    expect(g.implementCondition.get('sprayer_s')).toBe(wear);
  });

  it('upgrades a version 3 save by adding the boulder fields unowned', () => {
    const g = new Game();
    g.money = 1234;
    const v3: Record<string, unknown> = { ...snapshot(g), version: 3 };
    v3.fields = (v3.fields as unknown[]).slice(0, 4);
    const restored = decodeSave(JSON.stringify(v3));
    expect(restored.money).toBe(1234);
    expect(restored.fields).toHaveLength(6);
    expect(meadow(restored).owned).toBe(false);
    expect(snapshot(restored).version).toBe(4);
  });

  it('rejects a save with a crop on a boulder tile', () => {
    const g = new Game();
    const s = snapshot(g);
    const f = meadow(g);
    const i = f.blocked.indexOf(1);
    s.fields[4].state[i] = TileState.Plowed;
    expect(() => decodeSave(JSON.stringify(s))).toThrow();
  });
});
