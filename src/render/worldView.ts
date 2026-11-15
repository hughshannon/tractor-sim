import * as THREE from 'three';
import { BUILDINGS, WORLD_HALF, ZONES, type Building } from '../sim/farm';
import type { Field } from '../sim/field';
import { box, cyl, hash, labelSprite, mat } from './util';

export function buildWorld(scene: THREE.Scene, fields: Field[]): void {
  for (const b of BUILDINGS) scene.add(buildBuilding(b));

  for (const z of ZONES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(z.radius - 0.35, z.radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85 }),
    );
    ring.position.set(z.x, 0.06, z.z);
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(z.radius - 0.35, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.15 }),
    );
    fill.position.set(z.x, 0.05, z.z);
    const label = labelSprite(z.label, { bg: 'rgba(40,40,20,0.8)', fg: '#ffd23a', scale: 0.8 });
    label.position.set(z.x, 4.5, z.z);
    scene.add(ring, fill, label);
  }

  // Gravel yard and dirt tracks.
  const dirt = (w: number, d: number, x: number, z: number, color = 0xa08a62) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(color));
    m.position.set(x, 0.01, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  dirt(50, 22, 0, -6, 0xb09c72);
  dirt(6, 14, 0, 7);
  dirt(150, 5, -5, 10);
  dirt(5, 12, -20, 56);
  dirt(5, 8, 44, 10);

  // Trees on the outskirts, avoiding fields and the yard.
  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const blocked = (x: number, z: number) =>
    (Math.abs(x) < 34 && z > -24 && z < 14) ||
    Math.abs(z - 10) < 4 ||
    fields.some((f) => x > f.x - 5 && x < f.x + f.width + 5 && z > f.z - 5 && z < f.z + f.depth + 5);
  for (let i = 0; i < 900 && crowns.length < 240; i++) {
    const x = (hash(i * 2) - 0.5) * (WORLD_HALF * 2 + 60);
    const z = (hash(i * 2 + 1) - 0.5) * (WORLD_HALF * 2 + 60);
    if (blocked(x, z)) continue;
    // Denser near the world edge.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF;
    if (hash(i * 5 + 3) > edge * edge * 1.4 + 0.05) continue;
    const s = 0.8 + hash(i * 11) * 0.8;
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 1 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    m.compose(new THREE.Vector3(x, 3.6 * s, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i)), new THREE.Vector3(s, s, s));
    crowns.push(m.clone());
  }
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), mat(0x6b4a2b), trunks.length);
  const crownMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 0), mat(0x3f7a2e), crowns.length);
  trunks.forEach((t, i) => trunkMesh.setMatrixAt(i, t));
  const c = new THREE.Color();
  crowns.forEach((t, i) => {
    crownMesh.setMatrixAt(i, t);
    crownMesh.setColorAt(i, c.setHex(0x3f7a2e).multiplyScalar(0.8 + hash(i * 13) * 0.4));
  });
  for (const im of [trunkMesh, crownMesh]) {
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }
}

function buildBuilding(b: Building): THREE.Group {
  const g = new THREE.Group();
  const { minX, minZ, maxX, maxZ } = b.box;
  const w = maxX - minX, d = maxZ - minZ;
  g.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);

  if (b.kind === 'shed') {
    const h = 5;
    g.add(box(w, h, d, 0x9a3b2c, 0, h / 2, 0));
    // Gable roof.
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.5, 0);
    shape.lineTo(0, 2.6);
    shape.lineTo(w / 2 + 0.5, 0);
    shape.lineTo(-w / 2 - 0.5, 0);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 1, bevelEnabled: false });
    roofGeo.translate(0, h, -(d + 1) / 2);
    const roof = new THREE.Mesh(roofGeo, mat(0x5a5f66));
    roof.castShadow = true;
    g.add(roof);
    // Big door facing +Z with white trim.
    g.add(box(7, 4.2, 0.1, 0x6e2a1f, 0, 2.1, d / 2 + 0.05));
    g.add(box(7.4, 0.25, 0.15, 0xf0f0f0, 0, 4.3, d / 2 + 0.08));
    const x1 = box(0.2, 5.6, 0.12, 0xf0f0f0, 0, 2.1, d / 2 + 0.1);
    x1.rotation.z = 0.98;
    const x2 = x1.clone();
    x2.rotation.z = -0.98;
    g.add(x1, x2);
  } else if (b.kind === 'silo') {
    for (const [x, z, r, h] of [[-2.2, -1.5, 2.3, 11], [2.4, -1.5, 2.3, 9]]) {
      const s = cyl(r, r, h, 0xc9ccd1, 16);
      s.position.set(x, h / 2, z);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r + 0.2, 1.6, 16), mat(0x9aa0a8));
      cap.position.set(x, h + 0.8, z);
      cap.castShadow = true;
      g.add(s, cap);
      for (let k = 1; k < h / 2; k++) {
        const band = cyl(r + 0.03, r + 0.03, 0.12, 0x8f949b, 16);
        band.position.set(x, k * 2, z);
        g.add(band);
      }
    }
    // Intake pit and office.
    g.add(box(4, 0.3, 2, 0x555555, 0, 0.15, d / 2 - 0.8));
    g.add(box(3, 2.6, 2.4, 0xe8dcc0, 3.2, 1.3, 2.8));
  } else {
    g.add(box(w, 2.2, d, 0xd8d8d8, 0, 1.1, 0));
    g.add(box(w + 0.1, 0.5, d + 0.1, 0xd23a2a, 0, 2.0, 0));
    const hose = cyl(0.05, 0.05, 1.2, 0x222222, 6);
    hose.position.set(w / 2 + 0.1, 1.0, 0.3);
    g.add(hose);
  }
  return g;
}
