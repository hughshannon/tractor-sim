import * as THREE from 'three';
import { PRODUCE_IDS, type ProduceId } from '../sim/crops';
import { BUILDINGS } from '../sim/farm';
import type { Game } from '../sim/game';
import { MAX_CUSTOMERS, customerPose, type Customer } from '../sim/stand';
import type { Lamps } from './lighting';
import { box, cyl, labelSprite, mat } from './util';

const WOOD = 0x9a6a3e, WOOD_DARK = 0x6e4a2a, CRATE = 0xb88a54;
const PRODUCE_COLOR: Record<ProduceId, number> = {
  potato: 0xc8a070, tomato: 0xd8352a, pumpkin: 0xe8801c, sunflower: 0xf5c518,
};
const SHIRTS = [0x3a6ea8, 0xc8483a, 0x4a9a5a, 0xe0b040, 0x8a5aa8, 0xe07a9a, 0x3a3f48, 0xf0f0f0];
const TROUSERS = [0x2a3a5a, 0x4a3a2a, 0x3a3a3a, 0x5a6a7a];
const SKIN = [0xf0c8a0, 0xd8a070, 0xa8704a, 0x6e4a32];

/** The farm stand (rebuilt when upgraded), its stock in crates and the customers walking to it. */
export class StandView {
  private root = new THREE.Group();
  private model = new THREE.Group();
  private fills = new Map<ProduceId, THREE.Mesh>();
  private pumpkins: THREE.Mesh[] = [];
  private sign: THREE.Sprite | null = null;
  private people: Person[] = [];
  private level = -1;
  private open: boolean | null = null;

  constructor(scene: THREE.Scene, lamps: Lamps) {
    const b = BUILDINGS.find((x) => x.kind === 'stand')!.box;
    this.root.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.root.add(this.model);
    scene.add(this.root);

    // Roadside signboard pointing drivers in.
    const post = box(0.15, 2.2, 0.15, WOOD_DARK, 0, 1.1, 0);
    const board = labelSprite('FRESH\nPRODUCE', { bg: 'rgba(250,240,210,0.95)', fg: '#7a2a1a', scale: 0.55 });
    board.position.set(0, 2.2, 0);
    const signGroup = new THREE.Group();
    signGroup.add(post, board);
    signGroup.position.set(this.root.position.x - 6, 0, 6.8);
    scene.add(signGroup);

    // A warm lamp under the awning for dusk trade.
    const light = lamps.light(new THREE.PointLight(0xffc880, 0, 10, 1.6), 8);
    light.position.set(this.root.position.x, 2.6, this.root.position.z + 1.6);
    scene.add(light);

    for (let i = 0; i < MAX_CUSTOMERS; i++) {
      const p = new Person(i);
      this.people.push(p);
      scene.add(p.root);
    }
  }

  update(game: Game, now: number): void {
    if (game.standLevel !== this.level) {
      this.level = game.standLevel;
      this.build(this.level);
      this.open = null;
    }
    if (game.standOpen !== this.open) {
      this.open = game.standOpen;
      if (this.sign) this.root.remove(this.sign);
      this.sign = labelSprite(this.open ? 'OPEN' : 'CLOSED', {
        bg: this.open ? 'rgba(40,110,40,0.9)' : 'rgba(130,40,30,0.9)', scale: 0.45,
      });
      this.sign.position.set(-2.2, this.level === 0 ? 2.2 : 3.4, 2);
      this.root.add(this.sign);
    }

    // Crates fill up with stock; each crate shows up to a quarter of the stand's capacity.
    const share = game.standCapacity / PRODUCE_IDS.length;
    for (const id of PRODUCE_IDS) {
      const m = this.fills.get(id)!;
      const k = Math.min(1, game.standStock[id] / share);
      m.visible = k > 0;
      m.scale.y = Math.max(0.05, k);
    }
    const shown = Math.min(this.pumpkins.length, Math.ceil(game.standStock.pumpkin / 4));
    this.pumpkins.forEach((p, i) => (p.visible = i < shown));

    const customers = game.customers;
    this.people.forEach((p, i) => p.update(customers[i], now));
  }

  private build(level: number): void {
    this.model.clear();
    this.fills.clear();
    this.pumpkins = [];
    const g = this.model;
    // Footprint is 6 x 3 m (local x -3..3, z -1.5..1.5); the counter faces +Z, towards the road.
    if (level === 0) {
      // Roadside cart: a wooden bed on two wheels with a parasol.
      g.add(box(3.6, 0.12, 1.6, WOOD, 0, 0.9, 0.2));
      g.add(box(3.6, 0.3, 0.08, WOOD_DARK, 0, 1.08, 1.0));
      g.add(box(3.6, 0.3, 0.08, WOOD_DARK, 0, 1.08, -0.6));
      for (const x of [-1, 1]) {
        const w = cyl(0.45, 0.45, 0.1, WOOD_DARK, 12);
        w.rotation.z = Math.PI / 2;
        w.position.set(x < 0 ? -1.85 : 1.85, 0.45, 0.2);
        g.add(w);
      }
      g.add(box(0.1, 0.9, 0.1, WOOD_DARK, -1.6, 0.45, 0.9), box(0.1, 0.9, 0.1, WOOD_DARK, 1.6, 0.45, 0.9));
      g.add(box(1.4, 0.06, 0.06, WOOD_DARK, 2.5, 0.75, -0.2));
      const pole = cyl(0.04, 0.04, 2.2, 0xdddddd, 6);
      pole.position.set(0, 2, 0.2);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.6, 8), mat(0xe04a3a));
      shade.position.set(0, 3.1, 0.2);
      shade.castShadow = true;
      g.add(pole, shade);
      this.crates(g, 1.02, 0.2, 0.8);
      return;
    }
    // Stand and shop: a counter with posts and a striped awning.
    g.add(box(6, 1, 0.9, WOOD, 0, 0.5, 0.95));
    g.add(box(6.2, 0.1, 1.1, WOOD_DARK, 0, 1.05, 0.95));
    for (const x of [-2.9, 2.9]) for (const z of [-1.3, 1.35]) g.add(box(0.16, 2.9, 0.16, WOOD_DARK, x, 1.45, z));
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const s = box(6.6 / stripes, 0.08, 3.6, i % 2 ? 0xf4f0e8 : 0xc8382a, -3.3 + (i + 0.5) * (6.6 / stripes), 3.05, 0.1);
      s.rotation.x = -0.12;
      g.add(s);
    }
    if (level >= 2) {
      // Farm shop: walls, shelves and a sign board on the roof.
      g.add(box(6, 2.9, 0.15, 0xe8dcc0, 0, 1.45, -1.4));
      g.add(box(0.15, 2.9, 2.8, 0xe8dcc0, -3, 1.45, 0), box(0.15, 2.9, 2.8, 0xe8dcc0, 3, 1.45, 0));
      g.add(box(5.4, 0.08, 0.6, WOOD, 0, 1.2, -1.0), box(5.4, 0.08, 0.6, WOOD, 0, 1.9, -1.0));
      const board = labelSprite('FARM SHOP', { bg: 'rgba(60,40,20,0.95)', fg: '#ffd23a', scale: 0.7 });
      board.position.set(0, 3.9, 1.2);
      g.add(board);
      this.crates(g, 1.25, -1.0, 1.1);
    }
    this.crates(g, 1.1, 0.95, 1.2);
    // Pumpkins piled on the ground in front of the counter.
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 5), mat(PRODUCE_COLOR.pumpkin));
      p.scale.y = 0.75;
      p.position.set(-2.6 + (i % 4) * 0.4 + (i >= 4 ? 0.2 : 0), 0.16 + (i >= 4 ? 0.28 : 0), 1.75);
      p.castShadow = true;
      g.add(p);
      this.pumpkins.push(p);
    }
  }

  /** One crate per produce along the counter, each with a fill block that grows with stock. */
  private crates(g: THREE.Group, y: number, z: number, spacing: number): void {
    PRODUCE_IDS.forEach((id, i) => {
      const x = (i - (PRODUCE_IDS.length - 1) / 2) * spacing;
      g.add(box(0.8, 0.06, 0.6, CRATE, x, y + 0.03, z));
      g.add(box(0.8, 0.3, 0.05, CRATE, x, y + 0.15, z + 0.28), box(0.8, 0.3, 0.05, CRATE, x, y + 0.15, z - 0.28));
      g.add(box(0.05, 0.3, 0.6, CRATE, x - 0.38, y + 0.15, z), box(0.05, 0.3, 0.6, CRATE, x + 0.38, y + 0.15, z));
      if (this.fills.has(id)) return; // shop shelves are decoration; the counter crates show stock
      const fill = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.5).translate(0, 0.16, 0), mat(PRODUCE_COLOR[id]));
      fill.position.set(x, y + 0.06, z);
      fill.castShadow = true;
      g.add(fill);
      this.fills.set(id, fill);
    });
  }
}

/** A low-poly person who walks along a customer's path, carrying their purchase away. */
class Person {
  readonly root = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private bag: THREE.Mesh;
  private styled = -1;
  private parts: { body: THREE.Mesh; head: THREE.Mesh };

  constructor(private slot: number) {
    this.legL = box(0.16, 0.8, 0.18, 0x2a3a5a, -0.11, 0.4, 0);
    this.legR = box(0.16, 0.8, 0.18, 0x2a3a5a, 0.11, 0.4, 0);
    const body = box(0.46, 0.62, 0.26, 0x3a6ea8, 0, 1.11, 0);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), mat(0xf0c8a0));
    head.position.y = 1.62;
    head.castShadow = true;
    this.armL = box(0.12, 0.6, 0.14, 0x3a6ea8, -0.3, 1.1, 0);
    this.armR = box(0.12, 0.6, 0.14, 0x3a6ea8, 0.3, 1.1, 0);
    for (const limb of [this.legL, this.legR, this.armL, this.armR]) {
      // Pivot limbs at the hip / shoulder.
      const h = (limb.geometry as THREE.BoxGeometry).parameters.height;
      limb.geometry = limb.geometry.clone().translate(0, -h / 2, 0);
      limb.position.y += h / 2;
    }
    this.bag = box(0.26, 0.24, 0.16, 0xb88a54, 0.32, 0.72, 0.08);
    this.root.add(this.legL, this.legR, body, head, this.armL, this.armR, this.bag);
    this.root.visible = false;
    this.parts = { body, head };
  }

  update(c: Customer | undefined, now: number): void {
    if (!c) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    if (this.styled !== c.id) {
      this.styled = c.id;
      const k = c.look;
      const shirt = mat(SHIRTS[Math.floor(k * SHIRTS.length) % SHIRTS.length]);
      this.parts.body.material = shirt;
      this.armL.material = shirt;
      this.armR.material = shirt;
      const legs = mat(TROUSERS[Math.floor(k * 37) % TROUSERS.length]);
      this.legL.material = legs;
      this.legR.material = legs;
      this.parts.head.material = mat(SKIN[Math.floor(k * 53) % SKIN.length]);
      this.root.scale.setScalar(0.88 + ((k * 97) % 1) * 0.2);
    }
    const pose = customerPose(c);
    this.root.position.set(pose.x, 0, pose.z);
    this.root.rotation.y = pose.heading;
    const swing = pose.walking ? Math.sin(now * 7 + this.slot) * 0.5 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    const carrying = c.bought > 0;
    this.armR.rotation.x = carrying ? -0.2 : swing * 0.8;
    this.bag.visible = carrying;
    if (carrying) this.bag.material = mat(PRODUCE_COLOR[c.crop]);
    this.root.position.y = pose.walking ? Math.abs(Math.sin(now * 7 + this.slot)) * 0.04 : 0;
  }
}
