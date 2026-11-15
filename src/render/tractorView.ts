import * as THREE from 'three';
import type { ImplementDef } from '../sim/equipment';
import type { TractorState } from '../sim/tractor';
import { box, cyl, mat } from './util';

const REAR_R = 0.85;
const FRONT_R = 0.5;

function wheel(r: number, w: number): THREE.Group {
  const g = new THREE.Group();
  const tire = cyl(r, r, w, 0x222222, 14);
  tire.rotation.z = Math.PI / 2;
  const hub = cyl(r * 0.5, r * 0.5, w + 0.04, 0xe6c22e, 8);
  hub.rotation.z = Math.PI / 2;
  g.add(tire, hub);
  // Tread blocks make the rotation visible.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = box(w + 0.02, 0.12, 0.18, 0x1a1a1a, 0, Math.cos(a) * r, Math.sin(a) * r);
    t.rotation.x = -a;
    g.add(t);
  }
  return g;
}

export class TractorView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private paint: THREE.MeshLambertMaterial;
  private rearWheels: THREE.Group[] = [];
  private frontWheels: THREE.Group[] = [];
  private frontPivots: THREE.Group[] = [];
  private implementMount = new THREE.Group();
  private implementLift: THREE.Object3D | null = null;
  private implementSpin: THREE.Object3D | null = null;
  private implementId: string | null = null;
  private colorHex = -1;
  private exhaust: THREE.Mesh;

  constructor() {
    this.paint = new THREE.MeshLambertMaterial({ color: 0xc8302a, flatShading: true });
    const b = this.body;
    const painted = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = box(w, h, d, 0, x, y, z);
      m.material = this.paint;
      return m;
    };
    // Chassis, hood, fenders.
    b.add(box(1.0, 0.4, 3.6, 0x2b2b2b, 0, 0.75, 0.1));
    b.add(painted(1.1, 0.8, 2.0, 0, 1.3, 1.1));
    b.add(box(1.0, 0.5, 0.12, 0x333333, 0, 1.25, 2.12)); // grille
    b.add(painted(1.5, 0.5, 1.4, 0, 1.15, -0.8));
    b.add(painted(0.5, 0.12, 1.8, 0.95, 1.72, -0.8));
    b.add(painted(0.5, 0.12, 1.8, -0.95, 1.72, -0.8));
    // Cab: posts, glass, roof.
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.45 });
    for (const [x, z] of [[-0.62, -0.1], [0.62, -0.1], [-0.62, -1.4], [0.62, -1.4]]) {
      b.add(box(0.1, 1.5, 0.1, 0x222222, x, 2.15, z));
    }
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 1.2), glass);
    g1.position.set(0, 2.15, -0.75);
    b.add(g1);
    b.add(painted(1.5, 0.14, 1.7, 0, 2.95, -0.75));
    b.add(box(0.5, 0.5, 0.5, 0x3a3a3a, 0, 1.65, -0.6)); // seat
    // Exhaust.
    this.exhaust = cyl(0.07, 0.07, 1.1, 0x333333, 6);
    this.exhaust.position.set(0.4, 2.2, 1.6);
    b.add(this.exhaust);
    // Lights.
    b.add(box(0.2, 0.14, 0.05, 0xfff6c0, 0.35, 1.45, 2.13));
    b.add(box(0.2, 0.14, 0.05, 0xfff6c0, -0.35, 1.45, 2.13));
    this.root.add(b);

    for (const side of [-1, 1]) {
      const rw = wheel(REAR_R, 0.55);
      rw.position.set(side * 1.0, REAR_R, -0.8);
      this.rearWheels.push(rw);
      this.root.add(rw);

      const pivot = new THREE.Group();
      pivot.position.set(side * 0.8, FRONT_R, 1.8);
      const fw = wheel(FRONT_R, 0.35);
      pivot.add(fw);
      this.frontPivots.push(pivot);
      this.frontWheels.push(fw);
      this.root.add(pivot);
    }
    this.root.add(this.implementMount);
  }

  setColor(hex: number): void {
    if (hex === this.colorHex) return;
    this.colorHex = hex;
    this.paint.color.setHex(hex);
  }

  setImplement(def: ImplementDef | null): void {
    const id = def?.id ?? null;
    if (id === this.implementId) return;
    this.implementId = id;
    this.implementMount.clear();
    this.implementLift = null;
    this.implementSpin = null;
    if (!def) return;
    const built = buildImplement(def);
    this.implementMount.add(built.group);
    this.implementLift = built.lift;
    this.implementSpin = built.spin;
  }

  update(s: TractorState, lower: number, time: number): void {
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.heading;
    for (const w of this.rearWheels) w.rotation.x = s.odometer / REAR_R;
    for (const w of this.frontWheels) w.rotation.x = s.odometer / FRONT_R;
    for (const p of this.frontPivots) p.rotation.y = s.steer;
    // Engine vibration.
    const rpm = 0.5 + Math.min(1, Math.abs(s.speed) / 8);
    this.body.position.y = Math.sin(time * 60 * rpm) * 0.015;
    if (this.implementLift) this.implementLift.position.y = (1 - lower) * 0.6;
    if (this.implementSpin && lower > 0.5) this.implementSpin.rotation.x += Math.abs(s.speed) * 0.05 + 0.08;
  }
}

/** Build implement geometry. The `lift` child is raised/lowered; `spin` rotates (harvester reel). */
function buildImplement(def: ImplementDef): { group: THREE.Group; lift: THREE.Object3D; spin: THREE.Object3D | null } {
  const group = new THREE.Group();
  const lift = new THREE.Group();
  group.add(lift);
  const w = def.width;
  const front = def.offset > 0;
  const zBar = def.offset;
  // Drawbar / linkage from the tractor to the implement.
  const linkLen = Math.abs(def.offset) - (front ? 2.0 : 1.4);
  const link = box(0.25, 0.2, linkLen, 0x444444, 0, 0.7, (front ? 2.0 : -1.4) + (front ? linkLen / 2 : -linkLen / 2));
  group.add(link);
  let spin: THREE.Object3D | null = null;

  if (def.kind === 'plow') {
    lift.add(box(w, 0.2, 0.3, 0x2d5fa8, 0, 0.6, zBar));
    const n = Math.round(w / 0.75);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n;
      const shank = box(0.12, 0.6, 0.12, 0x2d5fa8, x, 0.3, zBar - 0.1);
      const blade = box(0.5, 0.25, 0.08, 0xb8b8b8, x + 0.1, 0.05, zBar - 0.2);
      blade.rotation.y = 0.6;
      lift.add(shank, blade);
    }
  } else if (def.kind === 'seeder') {
    lift.add(box(w, 0.15, 0.3, 0x2f8a3a, 0, 0.35, zBar));
    lift.add(box(w * 0.85, 0.8, 1.0, 0x3aa848, 0, 1.0, zBar + 0.2));
    lift.add(box(w * 0.85 + 0.1, 0.1, 1.1, 0xe8e8e8, 0, 1.45, zBar + 0.2));
    const n = Math.round(w / 0.5);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n;
      const disc = cyl(0.25, 0.25, 0.05, 0x777777, 8);
      disc.rotation.z = Math.PI / 2;
      disc.position.set(x, 0.25, zBar - 0.1);
      lift.add(disc);
    }
    // Wheels to the sides.
    for (const side of [-1, 1]) {
      const wh = cyl(0.4, 0.4, 0.25, 0x222222, 10);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(side * (w / 2 + 0.2), 0.4, zBar + 0.2);
      group.add(wh);
    }
  } else {
    // Harvester header with a spinning reel.
    lift.add(box(w, 0.25, 1.2, 0xd8a020, 0, 0.35, zBar));
    lift.add(box(w, 0.8, 0.12, 0xd8a020, 0, 0.75, zBar - 0.6));
    for (const side of [-1, 1]) lift.add(box(0.1, 0.9, 1.3, 0xb88010, side * (w / 2), 0.7, zBar));
    // Dividers.
    const n = Math.round(w / 0.75);
    for (let i = 0; i <= n; i++) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), mat(0xb88010));
      tip.rotation.x = Math.PI / 2;
      tip.position.set(-w / 2 + (w * i) / n, 0.35, zBar + 0.85);
      lift.add(tip);
    }
    const reel = new THREE.Group();
    reel.position.set(0, 1.0, zBar + 0.2);
    const axle = cyl(0.06, 0.06, w - 0.2, 0x555555, 6);
    axle.rotation.z = Math.PI / 2;
    reel.add(axle);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      reel.add(box(w - 0.3, 0.06, 0.06, 0xd23a2a, 0, Math.cos(a) * 0.45, Math.sin(a) * 0.45));
    }
    lift.add(reel);
    spin = reel;
  }
  return { group, lift, spin };
}
