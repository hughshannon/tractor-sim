import { describe, expect, it } from 'vitest';
import { combineDrive } from '../src/core/input';
import { STICK_DEAD_ZONE, stickToDrive } from '../src/ui/touch';

describe('stickToDrive', () => {
  const R = 60;

  it('is neutral at the centre and inside the dead zone', () => {
    expect(stickToDrive(0, 0, R)).toEqual({ throttle: 0, steer: 0 });
    const inside = R * STICK_DEAD_ZONE * 0.9;
    expect(stickToDrive(inside, -inside, R)).toEqual({ throttle: 0, steer: 0 });
  });

  it('drives forward when pushed up and reverses when pulled down', () => {
    expect(stickToDrive(0, -R, R).throttle).toBe(1);
    expect(stickToDrive(0, R, R).throttle).toBe(-1);
  });

  it('steers left (+1) when pushed left and right (-1) when pushed right', () => {
    expect(stickToDrive(-R, 0, R).steer).toBe(1);
    expect(stickToDrive(R, 0, R).steer).toBe(-1);
  });

  it('ramps smoothly past the dead zone and clamps beyond the rim', () => {
    const half = stickToDrive(0, -R * (STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) / 2), R).throttle;
    expect(half).toBeCloseTo(0.5);
    expect(stickToDrive(-3 * R, -3 * R, R)).toEqual({ throttle: 1, steer: 1 });
  });
});

describe('combineDrive', () => {
  it('lets the stronger of keyboard and touch win on each axis', () => {
    const keys = { throttle: 1, steer: 0, brake: false };
    const touch = { throttle: 0.3, steer: -0.6, brake: false };
    expect(combineDrive(keys, touch)).toEqual({ throttle: 1, steer: -0.6, brake: false });
  });

  it('brakes if either source brakes', () => {
    const idle = { throttle: 0, steer: 0, brake: false };
    expect(combineDrive(idle, { ...idle, brake: true }).brake).toBe(true);
    expect(combineDrive({ ...idle, brake: true }, idle).brake).toBe(true);
  });
});
