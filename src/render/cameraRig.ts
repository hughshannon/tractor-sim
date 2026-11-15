import * as THREE from 'three';
import type { TractorState } from '../sim/tractor';

export type CameraMode = 'follow' | 'overhead';

/** Smooth chase camera with zoom (mouse wheel) and an overhead mode. */
export class CameraRig {
  mode: CameraMode = 'follow';
  zoom = 1;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private yaw = 0;
  private initialised = false;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.5, Math.min(2.5, this.zoom * (e.deltaY > 0 ? 1.1 : 0.9)));
      },
      { passive: false },
    );
  }

  toggle(): void {
    this.mode = this.mode === 'follow' ? 'overhead' : 'follow';
  }

  update(t: TractorState, dt: number): void {
    // Follow heading lazily; when reversing keep the camera behind the tractor's nose direction.
    let dy = t.heading - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 2.5);

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
}
