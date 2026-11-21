import * as THREE from 'three';
import { BUILDINGS, WORLD_HALF, ZONES, type Building } from '../sim/farm';
import type { Field } from '../sim/field';
import { Lamps, glowMaterial, glowTexture } from './lighting';
import { box, cyl, hash, labelSprite, mat } from './util';

export function buildWorld(scene: THREE.Scene, fields: Field[], lamps: Lamps): void {
  for (const b of BUILDINGS) if (b.kind !== 'stand') scene.add(buildBuilding(b));
  buildFloodlights(scene, lamps);
  buildFieldLights(scene, fields, lamps);

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
  dirt(74, 22, 0, -6, 0xb09c72);
  dirt(6, 14, 0, 7);
  dirt(150, 5, -5, 10);
  dirt(5, 12, -20, 56);
  dirt(5, 8, 44, 10);

  // Trees on the outskirts, avoiding fields and the yard.
  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const blocked = (x: number, z: number) =>
    (Math.abs(x) < 42 && z > -24 && z < 14) ||
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
  } else if (b.kind === 'bank') {
    // Small country bank: stone walls, a pediment on four columns and steps facing the yard (+Z).
    const h = 4.2;
    g.add(box(w, h, d - 1.4, 0xe8e0cc, 0, h / 2, -0.7));
    g.add(box(w + 0.4, 0.4, d - 1.0, 0xcfc6b0, 0, h + 0.2, -0.7));
    const ped = new THREE.Shape();
    ped.moveTo(-w / 2 - 0.2, 0);
    ped.lineTo(0, 1.3);
    ped.lineTo(w / 2 + 0.2, 0);
    ped.lineTo(-w / 2 - 0.2, 0);
    const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 1.6, bevelEnabled: false });
    pedGeo.translate(0, h + 0.4, d / 2 - 1.6);
    const pedMesh = new THREE.Mesh(pedGeo, mat(0xd8d0bc));
    pedMesh.castShadow = true;
    g.add(pedMesh);
    for (const x of [-2.9, -1.1, 1.1, 2.9]) {
      const c = cyl(0.22, 0.26, h, 0xf4f0e6, 10);
      c.position.set(x, h / 2 + 0.25, d / 2 - 0.5);
      g.add(c);
    }
    g.add(box(w, 0.25, 1.6, 0xbfb8a8, 0, 0.125, d / 2 - 0.6));
    g.add(box(1.6, 2.6, 0.1, 0x2e5a3a, 0, 1.3, d / 2 - 1.36));
    g.add(box(1.0, 1.2, 0.1, 0x6f8796, -2.4, 2.2, d / 2 - 1.36), box(1.0, 1.2, 0.1, 0x6f8796, 2.4, 2.2, d / 2 - 1.36));
    const sign = labelSprite('$ FARM BANK $', { bg: 'rgba(30,50,40,0.9)', fg: '#ffd23a', scale: 0.6 });
    sign.position.set(0, h + 0.9, d / 2 + 0.2);
    g.add(sign);
  } else {
    g.add(box(w, 2.2, d, 0xd8d8d8, 0, 1.1, 0));
    g.add(box(w + 0.1, 0.5, d + 0.1, 0xd23a2a, 0, 2.0, 0));
    const hose = cyl(0.05, 0.05, 1.2, 0x222222, 6);
    hose.position.set(w / 2 + 0.1, 1.0, 0.3);
    g.add(hose);
  }
  return g;
}

const FLOOD_ON = 0xfff2d8;

/** A wall- or pole-mounted floodlight: housing, glowing lens, flare, faint beam and a real spotlight. */
function floodlight(
  scene: THREE.Scene, lamps: Lamps, at: THREE.Vector3, aim: THREE.Vector3,
  opts: { intensity: number; angle: number; reach: number },
): void {
  const g = new THREE.Group();
  g.position.copy(at);
  g.lookAt(aim);
  // Housing faces +Z towards the aim point after lookAt.
  g.add(box(0.7, 0.4, 0.3, 0x2e3236, 0, 0, -0.05));
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.3), lamps.lens(0x8a8f96, FLOOD_ON));
  lens.position.z = 0.11;
  g.add(lens);
  scene.add(g);

  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: FLOOD_ON, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
  }));
  lamps.glow(flare.material, 0.9);
  flare.scale.setScalar(2.4);
  flare.position.copy(at).addScaledVector(aim.clone().sub(at).normalize(), 0.25);
  scene.add(flare);

  // Faint visible beam: an open cone from the lamp to the ground.
  const dir = aim.clone().sub(at);
  const len = dir.length();
  const coneGeo = new THREE.ConeGeometry(Math.tan(opts.angle * 0.8) * len, len, 24, 1, true);
  coneGeo.translate(0, -len / 2, 0);
  const beam = new THREE.Mesh(coneGeo, lamps.glow(glowMaterial(0xffe6b8, { map: false, side: THREE.DoubleSide }), 0.03));
  beam.position.copy(at);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  beam.renderOrder = 2;
  scene.add(beam);

  const spot = lamps.light(new THREE.SpotLight(FLOOD_ON, 0, opts.reach, opts.angle, 0.55, 1.4), opts.intensity);
  spot.position.copy(at);
  spot.target.position.copy(aim);
  scene.add(spot, spot.target);
}

function buildFloodlights(scene: THREE.Scene, lamps: Lamps): void {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Garage: a pair over the big door, lighting the apron and the shop zone.
  floodlight(scene, lamps, v(-19.5, 4.7, -5.7), v(-17, 0, 0), { intensity: 90, angle: 0.75, reach: 32 });
  floodlight(scene, lamps, v(-10.5, 4.7, -5.7), v(-13, 0, 0), { intensity: 90, angle: 0.75, reach: 32 });
  // Silo: high on the front of the tall bin, over the intake and sell zone.
  floodlight(scene, lamps, v(12.8, 7.5, -10.05), v(15, 0, -2), { intensity: 160, angle: 0.6, reach: 40 });
  // Fuel pump: a lamp post beside the pump arching over the fuel zone.
  const pole = cyl(0.09, 0.12, 5.4, 0x5a5f66, 8);
  pole.position.set(1.35, 2.7, -11.5);
  const arm = box(0.1, 0.1, 1.8, 0x5a5f66, 1.35, 5.35, -10.7);
  scene.add(pole, arm);
  floodlight(scene, lamps, v(1.35, 5.2, -9.8), v(0, 0, -7), { intensity: 70, angle: 0.8, reach: 25 });

  // Lit office window at the silo.
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), lamps.lens(0x6f8796, 0xffd48a));
  win.position.set(18.2, 1.6, -6.98);
  scene.add(win);
  const winGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
  }));
  lamps.glow(winGlow.material, 0.22);
  winGlow.scale.set(3, 2, 1);
  winGlow.position.set(18.2, 1.6, -6.8);
  scene.add(winGlow);
  const winLight = lamps.light(new THREE.PointLight(0xffc070, 0, 8, 1.5), 6);
  winLight.position.set(18.2, 1.6, -6.2);
  scene.add(winLight);
}

const FIELD_LIGHT = 0xffc27a;
const FIELD_LIGHT_SPACING = 6;
const FIELD_LIGHT_INSET = 1.1;

/** Low in-ground marker lights around every field edge, each casting a soft pool of light. */
function buildFieldLights(scene: THREE.Scene, fields: Field[], lamps: Lamps): void {
  const points: [number, number][] = [];
  for (const f of fields) {
    const x0 = f.x - FIELD_LIGHT_INSET, z0 = f.z - FIELD_LIGHT_INSET;
    const x1 = f.x + f.width + FIELD_LIGHT_INSET, z1 = f.z + f.depth + FIELD_LIGHT_INSET;
    const corners: [number, number][] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
    // Walk each edge, excluding its start point; the final edge also stops short of (x0, z0) where the sign stands.
    for (let e = 0; e < 4; e++) {
      const [ax, az] = corners[e], [bx, bz] = corners[e + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / FIELD_LIGHT_SPACING));
      for (let i = 1; i <= (e === 3 ? n - 1 : n); i++) points.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
    }
  }
  const n = points.length;
  const housings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 8), mat(0x3a3d40), n);
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 8), lamps.lens(0x9a9a8a, 0xffe0b0), n);
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2),
    lamps.glow(glowMaterial(FIELD_LIGHT), 0.32), n,
  );
  pools.renderOrder = 1;
  const flarePos = new Float32Array(n * 3);
  const m = new THREE.Matrix4();
  points.forEach(([x, z], i) => {
    housings.setMatrixAt(i, m.makeTranslation(x, 0.06, z));
    caps.setMatrixAt(i, m.makeTranslation(x, 0.13, z));
    pools.setMatrixAt(i, m.makeTranslation(x, 0.05, z));
    flarePos.set([x, 0.3, z], i * 3);
  });
  const flareGeo = new THREE.BufferGeometry();
  flareGeo.setAttribute('position', new THREE.BufferAttribute(flarePos, 3));
  const flares = new THREE.Points(flareGeo, lamps.glow(new THREE.PointsMaterial({
    color: FIELD_LIGHT, map: glowTexture(), size: 1.1, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), 0.8));
  housings.receiveShadow = true;
  scene.add(housings, caps, pools, flares);
}
