import * as THREE from 'three';
import { CROP_IDS, type CropId } from '../sim/crops';
import { Field, TileState } from '../sim/field';
import {
  GROUND_TINT, TURN_TINT, Stage, cropGeometries, cropMaterials, cropStage, stageScale, windTime,
} from './cropModels';
import { hash, labelSprite } from './util';

const PX = 4; // texture pixels per tile

/**
 * Crop rows per tile, as Z offsets from the tile centre. They sit in the two dark furrow stripes that
 * paintTexture draws (texture rows run towards -Z, so furrow pixel rows 0 and 2 land at +0.75 and -0.25).
 */
const ROW_Z = [0.75, -0.25];
const NO_STAGE = 255;

const SOIL: Record<TileState, [number, number, number]> = {
  [TileState.Grass]: [112, 160, 64],
  [TileState.Plowed]: [104, 72, 44],
  [TileState.Seeded]: [118, 86, 54],
  [TileState.Ripe]: [118, 86, 54],
  [TileState.Stubble]: [190, 168, 104],
};

/** Renders one field: a soil texture with per-tile states and instanced crop models per crop and stage. */
export class FieldView {
  readonly group = new THREE.Group();
  private data: Uint8Array;
  private texture: THREE.DataTexture;
  /** One instanced mesh per [crop][stage]. */
  private crops: THREE.InstancedMesh[][];
  /** Last rendered crop/stage code per tile, so the soil can be repainted when a stage changes. */
  private tileStage: Uint8Array;
  private sign: THREE.Group;
  private lastVersion = -1;
  private lastOwned: boolean | null = null;
  private cropTimer = 0;
  private tmpM = new THREE.Matrix4();
  private tmpC = new THREE.Color();
  private tint = new THREE.Color();
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

    this.tileStage = new Uint8Array(field.size).fill(NO_STAGE);
    const { color, depth } = cropMaterials();
    const capacity = field.size * ROW_Z.length;
    // Every instance stays inside the field, so one fixed bounding sphere avoids recomputing it.
    const bounds = new THREE.Sphere(
      new THREE.Vector3(field.x + field.width / 2, 1, field.z + field.depth / 2),
      Math.hypot(field.width, field.depth) / 2 + 2,
    );
    this.crops = cropGeometries().map((stages) => stages.map((geo) => {
      const mesh = new THREE.InstancedMesh(geo, color, capacity);
      mesh.customDepthMaterial = depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.tmpC.setHex(0xffffff)); // allocate instanceColor before first render
      mesh.boundingSphere = bounds;
      mesh.count = 0;
      this.group.add(mesh);
      return mesh;
    }));

    this.sign = new THREE.Group();
    this.group.add(this.sign);
  }

  update(dt: number): void {
    windTime.value = performance.now() / 1000;
    const f = this.field;
    if (f.owned !== this.lastOwned) {
      this.lastOwned = f.owned;
      this.buildSign();
    }
    if (f.version !== this.lastVersion) {
      this.lastVersion = f.version;
      this.updateCrops();
      this.paintTexture();
      this.cropTimer = 0;
      return;
    }
    this.cropTimer += dt;
    if (this.cropTimer > 0.25) {
      this.cropTimer = 0;
      if (this.updateCrops()) this.paintTexture();
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
        let base = SOIL[s];
        const code = this.tileStage[i];
        if (code !== NO_STAGE) {
          const [tr0, tg, tb, k] = GROUND_TINT[CROP_IDS[code >> 2]][code & 3];
          base = [base[0] + (tr0 - base[0]) * k, base[1] + (tg - base[1]) * k, base[2] + (tb - base[2]) * k];
        }
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

  /** Lay out crop instances. Returns true if any tile changed crop stage (soil needs repainting). */
  private updateCrops(): boolean {
    const f = this.field;
    for (const stages of this.crops) for (const m of stages) m.count = 0;
    let stageChanged = false;
    for (let i = 0; i < f.size; i++) {
      const s = f.state[i];
      if (s !== TileState.Seeded && s !== TileState.Ripe) {
        if (this.tileStage[i] !== NO_STAGE) {
          this.tileStage[i] = NO_STAGE;
          stageChanged = true;
        }
        continue;
      }
      const ci = f.crop[i];
      const id: CropId = CROP_IDS[ci];
      const { stage, t } = cropStage(f.growth[i], s === TileState.Ripe);
      const code = (ci << 2) | stage;
      if (this.tileStage[i] !== code) {
        this.tileStage[i] = code;
        stageChanged = true;
      }
      const mesh = this.crops[ci][stage];
      const grow = stageScale(stage, t);
      // Late in the mature stage the crop starts turning towards its ripe colour.
      const turnHex = TURN_TINT[id];
      const turn = stage === Stage.Mature && turnHex !== null ? Math.max(0, t - 0.5) * 2 * 0.7 : 0;
      if (turn > 0) this.tint.setHex(turnHex!);
      const [cx, cz] = f.tileCenter(i);
      for (let r = 0; r < ROW_Z.length; r++) {
        const seed = (i * ROW_Z.length + r) * 7 + f.id * 100003;
        const j1 = hash(seed), j2 = hash(seed + 1), j3 = hash(seed + 2);
        this.tmpP.set(cx + (j1 - 0.5) * 0.3, 0, cz + ROW_Z[r] + (j2 - 0.5) * 0.08);
        // Flip and mirror segments so neighbours never repeat exactly, while keeping them along the row.
        this.tmpQ.setFromAxisAngle(this.up, (j1 < 0.5 ? 0 : Math.PI) + (j3 - 0.5) * 0.12);
        const size = grow * (0.92 + j3 * 0.16);
        this.tmpS.set(j2 < 0.5 ? -size : size, size * (0.94 + j2 * 0.12), size);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        const n = mesh.count++;
        mesh.setMatrixAt(n, this.tmpM);
        this.tmpC.setScalar(0.9 + j1 * 0.2);
        if (turn > 0) this.tmpC.lerp(this.tint, turn);
        mesh.setColorAt(n, this.tmpC);
      }
    }
    for (const stages of this.crops) {
      for (const m of stages) {
        m.visible = m.count > 0;
        if (!m.visible) continue;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
    return stageChanged;
  }
}
