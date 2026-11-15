import './style.css';
import { Input } from './core/input';
import { CameraRig } from './render/cameraRig';
import { FieldView } from './render/fieldView';
import { createScene } from './render/scene';
import { TractorView } from './render/tractorView';
import { buildWorld } from './render/worldView';
import { CROP_IDS } from './sim/crops';
import { Game } from './sim/game';
import { Hud } from './ui/hud';
import { Shop } from './ui/shop';

const STEP = 1 / 60;

const container = document.getElementById('app')!;
const uiRoot = document.getElementById('ui')!;

const game = new Game();
const { renderer, scene, camera, sun } = createScene(container);
buildWorld(scene, game.fields);
const fieldViews = game.fields.map((f) => {
  const v = new FieldView(f);
  scene.add(v.group);
  return v;
});
const tractorView = new TractorView();
scene.add(tractorView.root);
const rig = new CameraRig(camera, renderer.domElement);

const input = new Input();
const hud = new Hud(uiRoot, game);
const shop = new Shop(uiRoot, game, () => (input.enabled = true));

const paused = () => shop.open || hud.helpVisible;

input.on('Space', () => !paused() && game.toggleLower());
input.on('KeyE', () => {
  if (shop.open) return shop.close();
  if (paused()) return;
  if (game.interact() === 'shop') {
    input.enabled = false;
    game.tractor.speed = 0;
    shop.show();
  }
});
input.on('Escape', () => (shop.open ? shop.close() : hud.toggleHelp(false)));
input.on('KeyH', () => !shop.open && hud.toggleHelp());
input.on('KeyC', () => rig.toggle());
CROP_IDS.forEach((id, i) => input.on([`Digit${i + 1}`, `Numpad${i + 1}`], () => !paused() && game.setSeed(id)));

game.notify('Your wheat is ripe! Lower the harvester with Space and drive through the Home Field.', 'info', 0);

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (!paused()) {
    acc += dt;
    while (acc >= STEP) {
      game.update(STEP, input.drive());
      acc -= STEP;
    }
  }

  const t = game.tractor;
  tractorView.setColor(game.tractorDef.color);
  tractorView.setImplement(game.implement);
  tractorView.update(t, game.lowerAnim, now / 1000);
  for (const v of fieldViews) v.update(dt);
  rig.update(t, dt);
  // Keep the shadow frustum centred on the tractor.
  sun.position.set(t.x + 40, 70, t.z + 25);
  sun.target.position.set(t.x, 0, t.z);
  hud.update(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) Object.assign(window, { game });
