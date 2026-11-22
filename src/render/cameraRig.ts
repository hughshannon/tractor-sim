import * as THREE from 'three';
import type { TractorState } from '../sim/tractor';

export type CameraMode = 'follow' | 'cab' | 'overhead';

const MODES: CameraMode[] = ['follow', 'cab', 'overhead'];
export const CAMERA_MODE_NAMES: Record<CameraMode, string> = {
  follow: 'Chase camera',
  cab: 'Cab view',
  overhead: 'Overhead camera',
};

const DEFAULT_FOV = 50;
const DEFAULT_NEAR = 0.5;
const CAB_FOV = 72;
const CAB_NEAR = 0.05;
/** Slight downward tilt so the hood and implement are in view. */
const CAB_PITCH = -0.12;
const MAX_LOOK_YAW = 2.2;
const MAX_LOOK_PITCH = 0.9;

/**
 * Smooth chase camera with zoom (mouse wheel), a first-person cab view and an overhead mode.
 * In the cab view, drag (mouse or finger) to look around; the view eases back to the front on release.
 * On touch screens, pinch with two fingers to zoom.
 */
export class CameraRig {
  mode: CameraMode = 'follow';
  zoom = 1;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private yaw = 0;
  private initialised = false;
  private eye: THREE.Object3D | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private dragging = false;
  private tmp = new THREE.Vector3();
  private touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.5, Math.min(2.5, this.zoom * (e.deltaY > 0 ? 1.1 : 0.9)));
      },
      { passive: false },
    );
    // Two fingers on the canvas pinch-zoom; one drags the cab view. Touch gestures are ours, not the browser's.
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        dom.setPointerCapture(e.pointerId);
        if (this.touches.size === 2) {
          this.dragging = false;
          this.pinchDist = this.touchSpread();
          return;
        }
        if (this.touches.size > 2) return;
      }
      if (this.mode !== 'cab' || e.button !== 0) return;
      this.dragging = true;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      const last = this.touches.get(e.pointerId);
      if (last) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last.x = e.clientX;
        last.y = e.clientY;
        if (this.touches.size === 2) {
          const d = this.touchSpread();
          // Fingers apart = zoom in (camera closer).
          if (this.pinchDist > 0 && d > 0) this.zoom = clamp(this.zoom * (this.pinchDist / d), 0.5, 2.5);
          this.pinchDist = d;
          return;
        }
        if (this.dragging) this.lookBy(dx, dy);
        return;
      }
      if (this.dragging) this.lookBy(e.movementX, e.movementY);
    });
    const release = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      this.pinchDist = 0;
      this.dragging = false;
    };
    dom.addEventListener('pointerup', release);
    dom.addEventListener('pointercancel', release);
  }

  private lookBy(dx: number, dy: number): void {
    this.lookYaw = clamp(this.lookYaw - dx * 0.005, -MAX_LOOK_YAW, MAX_LOOK_YAW);
    this.lookPitch = clamp(this.lookPitch - dy * 0.005, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);
  }

  private touchSpread(): number {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Point the cab view from this object (a child of the tractor body at the driver's eyes). */
  setCabAnchor(eye: THREE.Object3D): void {
    this.eye = eye;
  }

  /** Cycle chase → cab → overhead. Returns the new mode. */
  toggle(): CameraMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.lookYaw = this.lookPitch = 0;
    this.dragging = false;
    // Snap rather than glide when leaving the cab so the camera doesn't sweep through the tractor.
    this.initialised = false;
    return this.mode;
  }

  update(t: TractorState, dt: number): void {
    const cab = this.mode === 'cab' && this.eye !== null;
    this.setLens(cab ? CAB_FOV : DEFAULT_FOV, cab ? CAB_NEAR : DEFAULT_NEAR);

    // Follow heading lazily; when reversing keep the camera behind the tractor's nose direction.
    let dy = t.heading - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 2.5);

    if (cab) {
      this.updateCab(t, dt);
      return;
    }

    const target = new THREE.Vector3(t.x, 0, t.z);
    const desired = new THREE.Vector3();
    if (this.mode === 'follow') {
      const dist = 16 * this.zoom, height = 10 * this.zoom;
      desired.set(t.x - Math.sin(this.yaw) * dist, height, t.z - Math.cos(this.yaw) * dist);
      target.x += Math.sin(this.yaw) * 4;
      target.z += Math.cos(this.yaw) * 4;
    } else {
      desired.set(t.x, 55 * this.zoom, t.z - 18 * this.zoom);
    }
    if (!this.initialised) {
      this.pos.copy(desired);
      this.look.copy(target);
      this.initialised = true;
    }
    const k = Math.min(1, dt * 5);
    this.pos.lerp(desired, k);
    this.look.lerp(target, Math.min(1, dt * 8));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  private updateCab(t: TractorState, dt: number): void {
    // Glance back to the front when the mouse is released.
    if (!this.dragging) {
      const k = Math.min(1, dt * 3);
      this.lookYaw -= this.lookYaw * k;
      this.lookPitch -= this.lookPitch * k;
    }
    // The eye is parented to the vibrating tractor body, so engine shake comes through for free.
    const eye = this.eye!;
    eye.updateWorldMatrix(true, false);
    eye.getWorldPosition(this.tmp);
    this.camera.position.copy(this.tmp);
    this.camera.rotation.set(CAB_PITCH + this.lookPitch, t.heading + Math.PI + this.lookYaw, 0, 'YXZ');
    // Keep the chase camera ready to resume from behind the tractor.
    this.pos.copy(this.tmp);
    this.look.set(t.x, 0, t.z);
  }

  private setLens(fov: number, near: number): void {
    if (this.camera.fov === fov && this.camera.near === near) return;
    this.camera.fov = fov;
    this.camera.near = near;
    this.camera.updateProjectionMatrix();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
