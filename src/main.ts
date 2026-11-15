import './style.css';
import { SoundEngine } from './audio/sound';
import { Input } from './core/input';
import { CameraRig } from './render/cameraRig';
import { FieldView } from './render/fieldView';
import { createScene } from './render/scene';
import { TractorView } from './render/tractorView';
import { buildWorld } from './render/worldView';
import { CROP_IDS } from './sim/crops';
import { FarmSaves, Players } from './sim/save';
import { Hud } from './ui/hud';
import { Shop } from './ui/shop';
import { saveControls } from './ui/saveControls';

const STEP = 1 / 60;

const container = document.getElementById('app')!;
const uiRoot = document.getElementById('ui')!;

const players = new Players(() => window.localStorage);
const saves = new FarmSaves(() => window.localStorage, players.current());
const loaded = saves.load();
const game = loaded.game;
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
saveControls(uiRoot, saves, loaded, players);
if (loaded.status === 'loaded') hud.toggleHelp(false);

const sound = new SoundEngine();
game.onEvent = (e) => sound.play(e);

const muteBtn = document.createElement('button');
muteBtn.className = 'mute-btn';
muteBtn.title = 'Mute / unmute (M)';
const syncMute = () => (muteBtn.textContent = sound.muted ? '🔇' : '🔊');
syncMute();
const toggleMute = () => {
  sound.toggleMute();
  syncMute();
};
muteBtn.addEventListener('click', toggleMute);
uiRoot.append(muteBtn);

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
input.on('KeyM', toggleMute);
CROP_IDS.forEach((id, i) => input.on([`Digit${i + 1}`, `Numpad${i + 1}`], () => !paused() && game.setSeed(id)));

if (loaded.status === 'loaded') game.notify(`Welcome back, ${saves.player}! Your farm has been restored.`, 'good', 0);
else game.notify('Your wheat is ripe! Lower the harvester with Space and drive through the Home Field.', 'info', 0);

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const drive = input.drive();
  if (!paused()) {
    acc += dt;
    while (acc >= STEP) {
      game.update(STEP, drive);
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

  const speed = Math.abs(t.speed);
  const throttle = paused() ? 0 : Math.abs(drive.throttle);
  sound.update({
    rpm: (speed / game.tractorDef.maxSpeed) * 0.75 + throttle * 0.25,
    load: game.workingNow ? 1 : game.lowered ? 0.3 : 0,
    working: game.workingNow && !paused() ? game.implement!.kind : null,
    speed,
  });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) Object.assign(window, { game });
if (import.meta.env.DEV) Object.assign(window, { sound });
