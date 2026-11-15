import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIVE, createTractor, resolveBox, stepTractor } from '../src/sim/tractor';

const run = (throttle: number, steer: number, seconds: number, t = createTractor()) => {
  for (let i = 0; i < seconds * 60; i++) stepTractor(t, { throttle, steer, brake: false }, 1 / 60, DEFAULT_DRIVE);
  return t;
};

describe('tractor physics', () => {
  it('accelerates forward along +Z at heading 0 up to max speed', () => {
    const t = run(1, 0, 10);
    expect(t.speed).toBeCloseTo(DEFAULT_DRIVE.maxSpeed);
    expect(t.z).toBeGreaterThan(50);
    expect(Math.abs(t.x)).toBeLessThan(1e-6);
  });

  it('reverses with a lower top speed', () => {
    const t = run(-1, 0, 10);
    expect(t.speed).toBeCloseTo(-DEFAULT_DRIVE.maxReverse);
    expect(t.z).toBeLessThan(0);
  });

  it('turns left (towards +X) with positive steer', () => {
    const t = run(1, 1, 2);
    expect(t.heading).toBeGreaterThan(0);
    expect(t.x).toBeGreaterThan(0);
  });

  it('coasts to a stop with no throttle', () => {
    const t = run(1, 0, 3);
    run(0, 0, 10, t);
    expect(t.speed).toBe(0);
  });

  it('is pushed out of boxes', () => {
    const t = createTractor(0, 0);
    t.speed = 5;
    expect(resolveBox(t, 1, { minX: -0.5, minZ: 0.5, maxX: 0.5, maxZ: 2 })).toBe(true);
    expect(t.z).toBeCloseTo(-0.5);
    expect(t.speed).toBeLessThan(5);
    expect(resolveBox(t, 1, { minX: 10, minZ: 10, maxX: 11, maxZ: 11 })).toBe(false);
  });
});
