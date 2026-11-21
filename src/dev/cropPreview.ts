/**
 * Dev-only page (npm run dev, then open /crops.html) showing every crop at several growth points,
 * rendered with the real FieldView. Rows: wheat, corn, canola, potatoes, tomatoes, pumpkins, sunflowers.
 * Columns: increasing growth, then ripe.
 * Drag to orbit, scroll to zoom.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FieldView } from '../render/fieldView';
import { createScene } from '../render/scene';
import { CROP_IDS, CROPS } from '../sim/crops';
import { Field, TileState } from '../sim/field';

const GROWTH = [0.1, 0.35, 0.6, 0.9, 1];
const COLS = 4, ROWS = 3, GAP = 4;

const { renderer, scene, camera, sun } = createScene(document.getElementById('app')!);
const views: FieldView[] = [];
let id = 1;
CROP_IDS.forEach((crop, ci) => {
  GROWTH.forEach((g, gi) => {
    const x = gi * (COLS * 2 + GAP), z = ci * (ROWS * 2 + GAP);
    const label = g >= 1 ? `${CROPS[crop].name} ripe` : `${CROPS[crop].name} ${Math.round(g * 100)}%`;
    const f = new Field(id++, label, x, z, COLS, ROWS, 0, true);
    for (let i = 0; i < f.size; i++) {
      f.plow(i);
      f.seed(i, crop);
    }
    f.growth.fill(g >= 1 ? 1 : g);
    if (g >= 1) f.state.fill(TileState.Ripe);
    f.version++;
    const v = new FieldView(f);
    scene.add(v.group);
    views.push(v);
  });
});

const W = GROWTH.length * (COLS * 2 + GAP) - GAP, D = CROP_IDS.length * (ROWS * 2 + GAP) - GAP;
const center = new THREE.Vector3(W / 2, 0, D / 2);
const params = new URLSearchParams(location.search);
// ?at=col,row focuses the camera on one plot (col = growth column, row = crop), e.g. ?at=4,0 for ripe wheat.
const at = params.get('at')?.split(',').map(Number);
const target = at
  ? new THREE.Vector3(at[0] * (COLS * 2 + GAP) + COLS, 0.5, at[1] * (ROWS * 2 + GAP) + ROWS)
  : center;
camera.position.copy(target).add(at ? new THREE.Vector3(-3, 3.5, 8) : new THREE.Vector3(0, 26, 34));
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
controls.update();
sun.position.set(center.x + 30, 60, center.z + 20);
sun.target.position.copy(center);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  for (const v of views) v.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
