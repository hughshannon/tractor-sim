import * as THREE from 'three';
import { CROPS, CROP_IDS, type CropId } from '../sim/crops';

/**
 * Procedural low-poly crop models, one geometry per crop per growth stage.
 *
 * Each geometry is a short row segment (about 1.8 m along X, centred on the origin) holding several
 * plants. Colours live in vertex colours so stems, leaves, ears and flowers can differ; the
 * per-instance colour only adds a small brightness / ripening tint on top.
 */

export const enum Stage {
  Sprout = 0,
  Leafy = 1,
  Mature = 2,
  Ripe = 3,
}
export const STAGE_COUNT = 4;

/** Growth fraction at which a seeded tile moves to the next stage. */
const STAGE_START = [0, 0.2, 0.5];

/** Stage of a tile plus progress (0..1) through that stage. */
export function cropStage(growth: number, ripe: boolean): { stage: Stage; t: number } {
  if (ripe) return { stage: Stage.Ripe, t: 1 };
  for (let s = STAGE_START.length - 1; s >= 0; s--) {
    if (growth >= STAGE_START[s]) {
      const end = STAGE_START[s + 1] ?? 1;
      return { stage: s as Stage, t: (growth - STAGE_START[s]) / (end - STAGE_START[s]) };
    }
  }
  return { stage: Stage.Sprout, t: 0 };
}

/** Uniform scale within a stage, so plants keep growing smoothly between model swaps. */
export function stageScale(stage: Stage, t: number): number {
  const from = [0.6, 0.7, 0.85, 1][stage];
  return from + (1 - from) * t;
}

/** Instance tint applied late in the mature stage (crop starting to ripen), or null. */
export const TURN_TINT: Record<CropId, number | null> = {
  wheat: 0xfff0a0,
  corn: 0xf0e8b0,
  canola: null,
};

/** Soil tint under the canopy: [r, g, b, amount] per stage. Fills gaps when seen from a distance. */
export const GROUND_TINT: Record<CropId, [number, number, number, number][]> = {
  wheat: [[0, 0, 0, 0], [86, 128, 48, 0.35], [92, 134, 52, 0.6], [196, 166, 86, 0.75]],
  corn: [[0, 0, 0, 0], [74, 116, 44, 0.25], [64, 104, 38, 0.55], [150, 128, 78, 0.55]],
  canola: [[0, 0, 0, 0], [76, 128, 70, 0.4], [196, 186, 52, 0.7], [146, 124, 74, 0.7]],
};

// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];

/** Small deterministic PRNG so every build produces the same models. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const col = (hex: number) => new THREE.Color(hex);

interface BladeOpts {
  /** Initial elevation from horizontal, 0..1 (1 = straight up). */
  lift: number;
  /** How much the blade curves downward over its length (radians). */
  droop: number;
  segs: number;
  /** Width profile: grass tapers from the base, leaf is widest a third of the way up, stem is constant. */
  shape?: 'grass' | 'leaf' | 'stem';
}

class Builder {
  private pos: number[] = [];
  private col: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  tri(a: V3, b: V3, c: V3, ca: THREE.Color, cb = ca, cc = ca): void {
    this.pos.push(...a, ...b, ...c);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  /**
   * A curving, tapering strip starting at `o` heading in direction `yaw`.
   * Returns the tip position and direction, handy for attaching ears or flowers.
   */
  blade(o: V3, yaw: number, len: number, width: number, opts: BladeOpts, base: THREE.Color, tip: THREE.Color): { tip: V3; dir: V3 } {
    const { segs, droop } = opts;
    const shape = opts.shape ?? 'grass';
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const sx = -dz, sz = dx; // horizontal side vector
    const widthAt = (t: number) =>
      shape === 'stem' ? width
        : shape === 'leaf' ? width * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * t)), 0.7)
          : width * (1 - t);
    let e = opts.lift * Math.PI / 2;
    let p: V3 = [...o];
    const step = len / segs;
    const left: V3[] = [], right: V3[] = [], cols: THREE.Color[] = [];
    let dir: V3 = [0, 1, 0];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const w = widthAt(t) / 2;
      left.push([p[0] - sx * w, p[1], p[2] - sz * w]);
      right.push([p[0] + sx * w, p[1], p[2] + sz * w]);
      cols.push(base.clone().lerp(tip, t));
      if (k < segs) {
        dir = [Math.cos(e) * dx, Math.sin(e), Math.cos(e) * dz];
        p = [p[0] + dir[0] * step, p[1] + dir[1] * step, p[2] + dir[2] * step];
        e -= droop / segs;
      }
    }
    for (let k = 0; k < segs; k++) {
      const pointed = k === segs - 1 && widthAt(1) < 1e-4;
      if (pointed) {
        const tipP: V3 = [(left[k + 1][0] + right[k + 1][0]) / 2, left[k + 1][1], (left[k + 1][2] + right[k + 1][2]) / 2];
        this.tri(left[k], right[k], tipP, cols[k], cols[k], cols[k + 1]);
      } else {
        this.tri(left[k], right[k], right[k + 1], cols[k], cols[k], cols[k + 1]);
        this.tri(left[k], right[k + 1], left[k + 1], cols[k], cols[k + 1], cols[k + 1]);
      }
    }
    return { tip: p, dir };
  }

  /** Add a three.js primitive, scaled, pointed along `dir` and placed at `at`. */
  prim(geo: THREE.BufferGeometry, at: V3, dir: V3, scale: V3, c: THREE.Color, cTop = c): void {
    this.v.set(...dir).normalize();
    this.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.v);
    this.m.compose(new THREE.Vector3(...at), this.q, new THREE.Vector3(...scale));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(this.m);
    const p = g.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      tmp.copy(c).lerp(cTop, maxY > minY ? (p.getY(i) - minY) / (maxY - minY) : 0);
      this.col.push(tmp.r, tmp.g, tmp.b);
    }
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const OCTA = new THREE.OctahedronGeometry(1, 0);
/** Two crossed flat diamonds: a 4-triangle stand-in for a grain ear. */
const EAR = (() => {
  const p = [0, -1, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, -1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
})();
const CONE = new THREE.ConeGeometry(1, 1, 5, 1, true).translate(0, 0.5, 0);
const CYL = new THREE.CylinderGeometry(0.75, 1, 1, 5, 1, true).translate(0, 0.5, 0);

/** Evenly spaced positions along the segment with a little jitter. */
function along(n: number, r: () => number, len = 1.8): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(-len / 2 + (i + 0.5) * (len / n) + (r() - 0.5) * (len / n) * 0.5);
  return out;
}

// --- Wheat ------------------------------------------------------------------------------------

function wheat(stage: Stage): THREE.BufferGeometry {
  const def = CROPS.wheat;
  const b = new Builder();
  const r = rng(101 + stage);
  const leaf = col(def.youngColor), leafDark = col(0x3e7a28);
  const earGreen = col(0x9cc860), stemGreen = col(0x78b048);
  const straw = col(def.ripeColor), strawDark = col(0xa88a48), earGold = col(0xf0d080), earBase = col(0xd0a850), dry = col(0xb89a58);
  const H = def.height;
  for (const z0 of [-0.18, 0.18]) {
    const n = stage === Stage.Sprout ? 7 : 6;
    for (const x of along(n, r)) {
      const z = z0 + (r() - 0.5) * 0.12;
      if (stage === Stage.Sprout) {
        for (let k = 0; k < 3; k++) {
          b.blade([x, 0, z], r() * Math.PI * 2, 0.16 + r() * 0.07, 0.035,
            { lift: 0.8 + r() * 0.2, droop: 0.4, segs: 2 }, leafDark, leaf);
        }
      } else if (stage === Stage.Leafy) {
        for (let k = 0; k < 5; k++) {
          b.blade([x + (r() - 0.5) * 0.06, 0, z + (r() - 0.5) * 0.06], k / 5 * Math.PI * 2 + r(), 0.3 + r() * 0.14, 0.04,
            { lift: 0.62 + r() * 0.3, droop: 0.9, segs: 3 }, leafDark, leaf);
        }
      } else {
        const ripe = stage === Stage.Ripe;
        // A leaf at the base, then a few stems each topped with an ear.
        for (let k = 0; k < 1; k++) {
          b.blade([x, 0, z], r() * Math.PI * 2, 0.32 + r() * 0.1, 0.045,
            { lift: 0.55 + r() * 0.2, droop: ripe ? 1.6 : 1.0, segs: 3 }, ripe ? strawDark : leafDark, ripe ? dry : leaf);
        }
        for (let k = 0; k < 4; k++) {
          const yaw = r() * Math.PI * 2;
          const stem = b.blade([x + (r() - 0.5) * 0.08, 0, z + (r() - 0.5) * 0.08], yaw, H * (0.78 + r() * 0.14), 0.022,
            { lift: 0.9 + r() * 0.08, droop: ripe ? 0.35 : 0.1, segs: 2, shape: 'stem' },
            ripe ? strawDark : leafDark, ripe ? straw : stemGreen);
          // Ripe ears nod over in the direction the stem leans.
          const nod = ripe ? 0.9 : 0.15;
          const d: V3 = [stem.dir[0] + Math.cos(yaw) * nod, stem.dir[1], stem.dir[2] + Math.sin(yaw) * nod];
          b.prim(EAR, [stem.tip[0] + d[0] * 0.08, stem.tip[1] + d[1] * 0.08, stem.tip[2] + d[2] * 0.08], d,
            [0.035, 0.1, 0.035], ripe ? earBase : stemGreen, ripe ? earGold : earGreen);
        }
      }
    }
  }
  return b.build();
}

// --- Corn -------------------------------------------------------------------------------------

function corn(stage: Stage): THREE.BufferGeometry {
  const def = CROPS.corn;
  const b = new Builder();
  const r = rng(202 + stage);
  const leaf = col(def.youngColor), leafDark = col(0x2c7428), leafLight = col(0x6cb848);
  const stalkGreen = col(0x5c9a3a), tassel = col(0xd8c878), earGreen = col(0x7cb050), silk = col(0xb07840);
  const dryLeaf = col(def.ripeColor), dryDark = col(0x9a8450), dryTip = col(0x8a6a3a), husk = col(0xd8c48a);
  const ripe = stage === Stage.Ripe;
  for (const x of along(3, r)) {
    const z = (r() - 0.5) * 0.08;
    const plane = r() * Math.PI; // corn leaves alternate in one plane
    if (stage === Stage.Sprout) {
      for (let k = 0; k < 3; k++) {
        b.blade([x, 0, z], plane + (k % 2) * Math.PI + (r() - 0.5) * 0.4, 0.2 + k * 0.05, 0.075,
          { lift: 0.85 - k * 0.1, droop: 0.9, segs: 3, shape: 'leaf' }, leafDark, leafLight);
      }
      continue;
    }
    const top = stage === Stage.Leafy ? 0.28 : 1.6 * (0.95 + r() * 0.1);
    b.prim(CYL, [x, 0, z], [0, 1, 0], [0.035, top, 0.035], ripe ? dryDark : leafDark, ripe ? dryLeaf : stalkGreen);
    const leaves = stage === Stage.Leafy ? 6 : 7;
    for (let k = 0; k < leaves; k++) {
      const y = stage === Stage.Leafy ? 0.02 + k * 0.045 : 0.12 + k * (top * 0.82 / leaves);
      const len = stage === Stage.Leafy ? 0.42 + r() * 0.16 : 0.62 + Math.sin((k + 1) / leaves * Math.PI) * 0.25;
      b.blade([x, y, z], plane + (k % 2) * Math.PI + (r() - 0.5) * 0.5, len, 0.1,
        { lift: 0.78 - (ripe ? 0.25 : 0), droop: ripe ? 2.4 : 1.5, segs: 4, shape: 'leaf' },
        ripe ? dryDark : leaf, ripe ? dryTip : leafLight);
    }
    if (stage === Stage.Leafy) continue;
    // Tassel.
    for (let k = 0; k < 5; k++) {
      b.blade([x, top, z], k / 5 * Math.PI * 2 + r(), 0.22 + r() * 0.08, 0.02,
        { lift: k === 0 ? 1 : 0.75, droop: 1.2, segs: 2 }, ripe ? dryDark : tassel, ripe ? dryTip : tassel);
    }
    // Ear (with silk while growing), angled away from the stalk.
    const earY = top * 0.5;
    const yaw = plane + Math.PI / 2;
    const tilt = ripe ? 0.9 : 0.35;
    const d: V3 = [Math.cos(yaw) * tilt, 1, Math.sin(yaw) * tilt];
    b.prim(CYL, [x + Math.cos(yaw) * 0.04, earY, z + Math.sin(yaw) * 0.04], d, [0.05, 0.24, 0.05],
      ripe ? husk : earGreen, ripe ? husk : earGreen);
    const n = Math.hypot(...d);
    const tipAt: V3 = [x + Math.cos(yaw) * 0.04 + d[0] / n * 0.24, earY + d[1] / n * 0.24, z + Math.sin(yaw) * 0.04 + d[2] / n * 0.24];
    b.prim(CONE, tipAt, d, [0.038, 0.08, 0.038], ripe ? husk : silk, ripe ? dryTip : silk);
  }
  return b.build();
}

// --- Canola -----------------------------------------------------------------------------------

function canola(stage: Stage): THREE.BufferGeometry {
  const def = CROPS.canola;
  const b = new Builder();
  const r = rng(303 + stage);
  const leaf = col(def.youngColor), leafDark = col(0x3a7a48), leafBlue = col(0x6aa880);
  const stemGreen = col(0x6aa050), flower = col(0xf7d81a), flowerLight = col(0xfff060);
  const pod = col(def.ripeColor), podDark = col(0x8a7440), stemDry = col(0x9a8a58);
  const H = def.height;
  for (const x of along(5, r)) {
    const z = (r() - 0.5) * 0.14;
    if (stage === Stage.Sprout || stage === Stage.Leafy) {
      const big = stage === Stage.Leafy;
      const n = big ? 6 : 4;
      for (let k = 0; k < n; k++) {
        b.blade([x, 0.01, z], k / n * Math.PI * 2 + r() * 0.5, big ? 0.22 + r() * 0.08 : 0.11 + r() * 0.03, big ? 0.15 : 0.09,
          { lift: big ? 0.5 : 0.4, droop: big ? 0.8 : 0.4, segs: big ? 3 : 2, shape: 'leaf' }, leafDark, big ? leafBlue : leaf);
      }
      continue;
    }
    const ripe = stage === Stage.Ripe;
    // Lower leaves (just a couple of withered ones when ripe).
    for (let k = 0; k < (ripe ? 1 : 3); k++) {
      b.blade([x, 0.02, z], r() * Math.PI * 2, 0.24 + r() * 0.06, 0.13,
        { lift: 0.45, droop: ripe ? 1.4 : 0.8, segs: 3, shape: 'leaf' }, ripe ? podDark : leafDark, ripe ? stemDry : leafBlue);
    }
    // Main stem and two side branches, each ending in a flower head or a spray of pods.
    for (let k = 0; k < (ripe ? 4 : 3); k++) {
      const main = k === 0;
      const yaw = r() * Math.PI * 2;
      const start: V3 = main ? [x, 0, z] : [x, H * (0.3 + r() * 0.15), z];
      const stem = b.blade(start, yaw, main ? H * (0.85 + r() * 0.1) : H * 0.5, 0.022,
        { lift: main ? 0.95 : 0.7, droop: main ? 0.05 : -0.35, segs: 2, shape: 'stem' },
        ripe ? podDark : leafDark, ripe ? stemDry : stemGreen);
      const [tx, ty, tz] = stem.tip;
      if (ripe) {
        for (let p = 0; p < 7; p++) {
          b.blade([tx, ty - 0.02 - p * 0.035, tz], p * 2.4 + r(), 0.13 + r() * 0.04, 0.04,
            { lift: 0.5 + r() * 0.3, droop: -0.2, segs: 1 }, podDark, pod);
        }
      } else {
        b.prim(OCTA, [tx, ty + 0.02, tz], [0, 1, 0], [0.11, 0.08, 0.11], flower, flowerLight);
        b.prim(OCTA, [tx + (r() - 0.5) * 0.08, ty - 0.08, tz + (r() - 0.5) * 0.08], [0, 1, 0], [0.08, 0.06, 0.08], flower, flowerLight);
      }
    }
  }
  return b.build();
}

// ---------------------------------------------------------------------------------------------

const BUILDERS: Record<CropId, (s: Stage) => THREE.BufferGeometry> = { wheat, corn, canola };
let cache: THREE.BufferGeometry[][] | null = null;

/** Geometries indexed [cropIndex][stage], built once and shared by every field. */
export function cropGeometries(): THREE.BufferGeometry[][] {
  if (!cache) cache = CROP_IDS.map((id) => Array.from({ length: STAGE_COUNT }, (_, s) => BUILDERS[id](s as Stage)));
  return cache;
}

// --- Wind -------------------------------------------------------------------------------------

/** Shared clock for crop sway; advance it once per frame. */
export const windTime = { value: 0 };

/** Bend vertices in world space after the instance transform, so neighbouring plants sway together. */
function addWind(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wp = modelMatrix * mvPosition;
        float h = max( transformed.y, 0.0 );
        float gust = sin( uWindTime * 1.3 + wp.x * 0.18 + wp.z * 0.11 ) * 0.7
                   + sin( uWindTime * 2.9 + wp.x * 0.7 - wp.z * 0.4 ) * 0.3;
        float bend = gust * 0.06 * h * sqrt( h );
        mvPosition.x += bend;
        mvPosition.z += bend * 0.45;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
}

let materials: { color: THREE.MeshLambertMaterial; depth: THREE.MeshDepthMaterial } | null = null;

/** Shared crop material (vertex colours, flat shaded, double sided) and a matching shadow material. */
export function cropMaterials(): { color: THREE.MeshLambertMaterial; depth: THREE.MeshDepthMaterial } {
  if (materials) return materials;
  const color = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  addWind(color);
  addWind(depth);
  materials = { color, depth };
  return materials;
}
