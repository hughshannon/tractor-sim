import type { DriveInput } from '../sim/tractor';

/** Keyboard state plus one-shot key bindings. On-screen touch controls feed `touch` and call `press`. */
export class Input {
  private down = new Set<string>();
  private bindings = new Map<string, () => void>();
  enabled = true;
  /** Analog drive from the on-screen joystick and brake pedal, combined with the keys. */
  touch: DriveInput = { throttle: 0, steer: 0, brake: false };

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.bindings.get(e.code)?.();
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  on(codes: string | string[], fn: () => void): void {
    for (const c of Array.isArray(codes) ? codes : [codes]) this.bindings.set(c, fn);
  }

  /** Fire a key binding as if the key had been pressed (for on-screen buttons). */
  press(code: string): void {
    this.bindings.get(code)?.();
  }

  private any(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  drive(): DriveInput {
    if (!this.enabled) return { throttle: 0, steer: 0, brake: true };
    const fwd = this.any('KeyW', 'ArrowUp') ? 1 : 0;
    const back = this.any('KeyS', 'ArrowDown') ? 1 : 0;
    const left = this.any('KeyA', 'ArrowLeft') ? 1 : 0;
    const right = this.any('KeyD', 'ArrowRight') ? 1 : 0;
    return combineDrive(
      { throttle: fwd - back, steer: left - right, brake: this.any('ShiftLeft', 'ShiftRight') },
      this.touch,
    );
  }
}

/** Merge keyboard and touch drive: the stronger input on each axis wins, either brake brakes. */
export function combineDrive(a: DriveInput, b: DriveInput): DriveInput {
  const pick = (x: number, y: number) => (Math.abs(y) > Math.abs(x) ? y : x);
  return { throttle: pick(a.throttle, b.throttle), steer: pick(a.steer, b.steer), brake: a.brake || b.brake };
}
