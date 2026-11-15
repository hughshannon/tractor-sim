import type { DriveInput } from '../sim/tractor';

/** Keyboard state plus one-shot key bindings. */
export class Input {
  private down = new Set<string>();
  private bindings = new Map<string, () => void>();
  enabled = true;

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

  private any(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  drive(): DriveInput {
    if (!this.enabled) return { throttle: 0, steer: 0, brake: true };
    const fwd = this.any('KeyW', 'ArrowUp') ? 1 : 0;
    const back = this.any('KeyS', 'ArrowDown') ? 1 : 0;
    const left = this.any('KeyA', 'ArrowLeft') ? 1 : 0;
    const right = this.any('KeyD', 'ArrowRight') ? 1 : 0;
    return { throttle: fwd - back, steer: left - right, brake: this.any('ShiftLeft', 'ShiftRight') };
  }
}
