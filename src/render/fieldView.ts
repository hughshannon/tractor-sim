import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CROPS, CROP_IDS } from '../sim/crops';
import { Field, TileState } from '../sim/field';
import { hash, labelSprite } from './util';

const PX = 4; // texture pixels per tile

const SOIL: Record<TileState, [number, number, number]> = {
  [TileState.Grass]: [112, 160, 64],
  [TileState.Plowed]: [104, 72, 44],
  [TileState.Seeded]: [118, 86, 54],
  [TileState.Ripe]: [118, 86, 54],
  [TileState.Stubble]: [190, 168, 104],
};

let clumpGeo: THREE.BufferGeometry | null = null;
function cropClump(): THREE.BufferGeometry {
  if (clumpGeo) return clumpGeo;
  const parts: THREE.BufferGeometry[] = [];
  const offsets = [[-0.45, -0.4], [0.4, -0.35], [0, 0.1], [-0.35, 0.5], [0.45, 0.45]];
  offsets.forEach(([x, z], i) => {
    const h = 0.85 + (i % 3) * 0.08;
    const g = new THREE.ConeGeometry(0.28, h, 5);
    g.translate(x, h / 2, z);
    parts.push(g);
  });
  clumpGeo = mergeGeometries(parts)!;
  return clumpGeo;
}

/** Renders one field: a soil texture with per-tile states and instanced crop clumps. */
export class FieldView {
  readonly group = new THREE.Group();
  private data: Uint8Array;
  private texture: THREE.DataTexture;
  private crops: THREE.InstancedMesh;
  private sign: THREE.Group;
  private lastVersion = -1;
  private lastOwned: boolean | null = null;
  private cropTimer = 0;
  private tmpM = new THREE.Matrix4();
  private tmpC = new THREE.Color();
  private tmpC2 = new THREE.Color();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private field: Field) {
    const w = field.cols * PX, h = field.rows * PX;
    this.data = new Uint8Array(w * h * 4);
    this.texture = new THREE.DataTexture(this.data, w, h);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(field.width, field.depth);
    geo.rotateX(-Math.PI / 2);
    const plane = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.texture }));
    plane.position.set(field.x + field.width / 2, 0.03, field.z + field.depth / 2);
    plane.receiveShadow = true;
    this.group.add(plane);

    // Darker border strip.
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(field.width + 1.2, field.depth + 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x55702e }),
    );
    border.position.set(plane.position.x, 0.015, plane.position.z);
    border.receiveShadow = true;
    this.group.add(border);

    this.crops = new THREE.InstancedMesh(cropClump(), new THREE.MeshLambertMaterial({ flatShading: true }), field.size);
    this.crops.castShadow = true;
    this.crops.receiveShadow = true;
    this.crops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < field.size; i++) this.crops.setColorAt(i, this.tmpC.setHex(0xffffff));
    this.group.add(this.crops);

    this.sign = new THREE.Group();
    this.group.add(this.sign);
  }

  update(dt: number): void {
    const f = this.field;
    if (f.owned !== this.lastOwned) {
      this.lastOwned = f.owned;
      this.buildSign();
    }
    if (f.version !== this.lastVersion) {
      this.lastVersion = f.version;
      this.paintTexture();
      this.updateCrops();
      this.cropTimer = 0;
      return;
    }
    this.cropTimer += dt;
    if (this.cropTimer > 0.25) {
      this.cropTimer = 0;
      this.updateCrops();
    }
  }

  private buildSign(): void {
    const f = this.field;
    this.sign.clear();
    const text = f.owned ? `${f.name}\n${f.hectares.toFixed(2)} ha` : `${f.name} — FOR SALE\n$${f.price.toLocaleString()}`;
    const label = labelSprite(text, { bg: f.owned ? 'rgba(30,60,25,0.8)' : 'rgba(150,40,30,0.85)', scale: 0.9 });
    const x = f.x - 1.5, z = f.z - 1.5;
    label.position.set(x, 3.6, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.8, 0.15), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
    post.position.set(x, 1.4, z);
    post.castShadow = true;
    this.sign.add(post, label);
  }

  private paintTexture(): void {
    const f = this.field;
    const w = f.cols * PX;
    for (let r = 0; r < f.rows; r++) {
      // Texture v=0 is at the plane's +Z edge after rotation, so flip rows.
      const tr = f.rows - 1 - r;
      for (let c = 0; c < f.cols; c++) {
        const i = r * f.cols + c;
        const s = f.state[i] as TileState;
        const base = SOIL[s];
        for (let py = 0; py < PX; py++) {
          for (let px = 0; px < PX; px++) {
            const X = c * PX + px, Y = tr * PX + py;
            let k = 0.88 + hash(X * 7919 + Y * 104729) * 0.2;
            if (s === TileState.Plowed || s === TileState.Seeded || s === TileState.Ripe) {
              if (py % 2 === 0) k *= 0.82; // furrows
            } else if (s === TileState.Stubble && px % 2 === 0) {
              k *= 0.9;
            }
            const o = (Y * w + X) * 4;
            this.data[o] = Math.min(255, base[0] * k);
            this.data[o + 1] = Math.min(255, base[1] * k);
            this.data[o + 2] = Math.min(255, base[2] * k);
            this.data[o + 3] = 255;
          }
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  private updateCrops(): void {
    const f = this.field;
    let any = false;
    for (let i = 0; i < f.size; i++) {
      const s = f.state[i];
      if (s !== TileState.Seeded && s !== TileState.Ripe) {
        this.tmpM.makeScale(0, 0, 0);
        this.crops.setMatrixAt(i, this.tmpM);
        continue;
      }
      any = true;
      const def = CROPS[CROP_IDS[f.crop[i]]];
      const g = f.growth[i];
      const [cx, cz] = f.tileCenter(i);
      const jitter = hash(i + f.id * 10007);
      this.tmpP.set(cx + (jitter - 0.5) * 0.4, 0, cz + (hash(i * 3 + 1) - 0.5) * 0.4);
      this.tmpQ.setFromAxisAngle(this.up, jitter * Math.PI * 2);
      const h = def.height * (0.08 + 0.92 * g) * (0.9 + jitter * 0.2);
      const spread = 0.5 + 0.5 * Math.min(1, g * 2);
      this.tmpS.set(spread, h, spread);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.crops.setMatrixAt(i, this.tmpM);
      if (s === TileState.Ripe) this.tmpC.setHex(def.ripeColor);
      else this.tmpC.setHex(def.youngColor).lerp(this.tmpC2.setHex(def.ripeColor), Math.max(0, g - 0.7) / 0.3 * 0.6);
      this.tmpC.multiplyScalar(0.92 + jitter * 0.16);
      this.crops.setColorAt(i, this.tmpC);
    }
    this.crops.visible = any;
    this.crops.instanceMatrix.needsUpdate = true;
    if (this.crops.instanceColor) this.crops.instanceColor.needsUpdate = true;
    this.crops.computeBoundingSphere();
  }
}
