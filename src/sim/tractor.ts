export interface TractorState {
  x: number;
  z: number;
  /** Heading in radians; forward = (sin h, cos h) on the XZ plane. */
  heading: number;
  /** Signed speed along heading, m/s. */
  speed: number;
  /** Current front-wheel steer angle in radians (positive = left). */
  steer: number;
  /** Accumulated wheel travel (metres) for wheel spin animation. */
  odometer: number;
}

export interface DriveInput {
  /** -1 (reverse) .. 1 (forward). */
  throttle: number;
  /** -1 (right) .. 1 (left). */
  steer: number;
  brake: boolean;
}

export interface DriveParams {
  maxSpeed: number;
  maxReverse: number;
  accel: number;
  wheelBase: number;
  maxSteer: number;
}

export const DEFAULT_DRIVE: DriveParams = {
  maxSpeed: 11,
  maxReverse: 4,
  accel: 4,
  wheelBase: 2.6,
  maxSteer: 0.6,
};

export function createTractor(x = 0, z = 0, heading = 0): TractorState {
  return { x, z, heading, speed: 0, steer: 0, odometer: 0 };
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}

/** Advance the tractor with a simple kinematic bicycle model. */
export function stepTractor(s: TractorState, input: DriveInput, dt: number, p: DriveParams): void {
  const BRAKE = 14;
  const DRAG = 2.5;

  // Speed.
  if (input.brake) {
    s.speed = approach(s.speed, 0, BRAKE * dt);
  } else if (input.throttle !== 0) {
    const opposing = Math.sign(input.throttle) !== Math.sign(s.speed) && Math.abs(s.speed) > 0.05;
    if (opposing) {
      s.speed = approach(s.speed, 0, BRAKE * dt);
    } else {
      const target = input.throttle > 0 ? p.maxSpeed * input.throttle : p.maxReverse * input.throttle;
      s.speed = approach(s.speed, target, (Math.abs(s.speed) > Math.abs(target) ? BRAKE : p.accel) * dt);
    }
  } else {
    s.speed = approach(s.speed, 0, DRAG * dt);
  }

  // Steering: less lock at higher speed, wheels turn at a finite rate and self-centre.
  const speedFactor = 1 / (1 + Math.abs(s.speed) * 0.08);
  const targetSteer = input.steer * p.maxSteer * speedFactor;
  s.steer = approach(s.steer, targetSteer, 2.2 * dt);

  // Kinematics.
  s.heading += (s.speed / p.wheelBase) * Math.tan(s.steer) * dt;
  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;
  s.odometer += s.speed * dt;
}

export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Push a circle of radius r at the tractor position out of a box. Returns true on collision. */
export function resolveBox(s: TractorState, r: number, b: Box): boolean {
  const cx = Math.max(b.minX, Math.min(s.x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(s.z, b.maxZ));
  const dx = s.x - cx;
  const dz = s.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    s.x = cx + (dx / d) * r;
    s.z = cz + (dz / d) * r;
  } else {
    // Centre inside the box: push out along the shortest axis.
    const left = s.x - b.minX, right = b.maxX - s.x, down = s.z - b.minZ, up = b.maxZ - s.z;
    const m = Math.min(left, right, down, up);
    if (m === left) s.x = b.minX - r;
    else if (m === right) s.x = b.maxX + r;
    else if (m === down) s.z = b.minZ - r;
    else s.z = b.maxZ + r;
  }
  s.speed *= 0.3;
  return true;
}
