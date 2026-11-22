import type { DriveInput } from '../sim/tractor';
import type { Input } from '../core/input';
import { h } from './dom';

/** Fraction of the stick's travel ignored around the centre, so a resting thumb doesn't creep. */
export const STICK_DEAD_ZONE = 0.15;

/**
 * Map a joystick offset (pixels from its centre, screen axes: +x right, +y down) to drive input.
 * Up drives forward, down reverses, left/right steer. Past the dead zone the response ramps from 0 to 1.
 */
export function stickToDrive(dx: number, dy: number, radius: number): Pick<DriveInput, 'throttle' | 'steer'> {
  const axis = (v: number) => {
    const n = Math.max(-1, Math.min(1, v / radius));
    const m = Math.abs(n);
    return m <= STICK_DEAD_ZONE ? 0 : Math.sign(n) * ((m - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
  };
  // steer is +1 = left, throttle is +1 = forward; screen y grows downward.
  return { throttle: -axis(dy) || 0, steer: -axis(dx) || 0 };
}

/** True on phones and tablets (a finger is the primary pointer). */
export function prefersTouch(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * On-screen controls for touch screens: a floating joystick on the left half for throttle and
 * steering, and buttons on the right for brake, implement, interact, camera and help.
 * Shown on coarse-pointer devices, or as soon as the player touches the screen.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private stickZone = h('div.stick-zone');
  private stickBase = h('div.stick-base');
  private stickKnob = h('div.stick-knob');
  private interactBtn: HTMLButtonElement;
  private implementBtn: HTMLButtonElement;
  private small: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private brakeIds = new Set<number>();
  private visible = true;
  active = false;
  /** Called when touch mode switches on, so the rest of the UI can adapt its hints. */
  onActivate: () => void = () => {};

  constructor(root: HTMLElement, private input: Input) {
    this.stickBase.append(this.stickKnob);
    this.stickZone.append(this.stickBase);

    const brake = this.button('touch-brake', 'Brake', 'Brake (hold)');
    brake.addEventListener('pointerdown', (e) => {
      this.brakeIds.add(e.pointerId);
      brake.setPointerCapture(e.pointerId);
      this.sync();
    });
    const releaseBrake = (e: PointerEvent) => {
      this.brakeIds.delete(e.pointerId);
      this.sync();
    };
    brake.addEventListener('pointerup', releaseBrake);
    brake.addEventListener('pointercancel', releaseBrake);

    this.implementBtn = this.tap('touch-implement', '⇅', 'Lower / raise implement', 'Space');
    this.interactBtn = this.tap('touch-interact', 'Use', 'Interact (garage, silo, fuel, bank, farm stand)', 'KeyE');
    const small = this.small = h('div.touch-small', {},
      this.tap('touch-camera', '🎥', 'Change camera', 'KeyC'),
      this.tap('touch-help', '?', 'Help', 'KeyH'),
    );
    const pad = h('div.touch-pad', {}, small, this.interactBtn, this.implementBtn, brake);
    this.el = h('div.touch-controls.hidden', {}, this.stickZone, pad);

    this.stickZone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      this.stickZone.setPointerCapture(e.pointerId);
      // The stick appears under the thumb wherever it lands.
      const zone = this.stickZone.getBoundingClientRect();
      this.origin = { x: e.clientX, y: e.clientY };
      this.stickBase.style.left = `${e.clientX - zone.left}px`;
      this.stickBase.style.top = `${e.clientY - zone.top}px`;
      this.stickBase.classList.add('held');
      this.moveStick(e);
    });
    this.stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e);
    });
    const releaseStick = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.resetStick();
    };
    this.stickZone.addEventListener('pointerup', releaseStick);
    this.stickZone.addEventListener('pointercancel', releaseStick);

    // Keep long-presses from opening the context menu or selecting text.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    root.append(this.el);

    if (prefersTouch()) this.activate();
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.activate();
    }, { capture: true });
  }

  private button(cls: string, label: string, title: string): HTMLButtonElement {
    return h(`button.touch-btn.${cls}`, { type: 'button', title, 'aria-label': title }, label);
  }

  private tap(cls: string, label: string, title: string, code: string): HTMLButtonElement {
    const b = this.button(cls, label, title);
    // pointerdown rather than click: instant response, and works while the other thumb is steering.
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.press(code);
    });
    return b;
  }

  private activate(): void {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch');
    this.el.classList.toggle('hidden', !this.visible);
    this.onActivate();
  }

  private stickRadius(): number {
    return this.stickBase.offsetWidth / 2 || 60;
  }

  private moveStick(e: PointerEvent): void {
    const r = this.stickRadius();
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      dx *= r / d;
      dy *= r / d;
    }
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const drive = stickToDrive(dx, dy, r);
    this.input.touch.throttle = drive.throttle;
    this.input.touch.steer = drive.steer;
  }

  private resetStick(): void {
    this.stickId = null;
    this.stickBase.classList.remove('held');
    this.stickBase.style.left = this.stickBase.style.top = '';
    this.stickKnob.style.transform = '';
    this.input.touch.throttle = this.input.touch.steer = 0;
  }

  private sync(): void {
    this.input.touch.brake = this.brakeIds.size > 0;
  }

  /** Put another HUD button (e.g. mute) in the small button column. */
  adopt(button: HTMLElement): void {
    this.small.append(button);
  }

  /** Hide while a menu or the help card is open, dropping any held input. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) {
      this.resetStick();
      this.brakeIds.clear();
      this.sync();
    }
    if (this.active) this.el.classList.toggle('hidden', !visible);
  }

  /** Highlight the context buttons when they have something to do. */
  update(canInteract: boolean, hasImplement: boolean): void {
    this.interactBtn.classList.toggle('ready', canInteract);
    this.implementBtn.disabled = !hasImplement;
  }
}
