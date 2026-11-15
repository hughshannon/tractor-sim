import * as THREE from 'three';
import { CROPS, CROP_IDS } from '../sim/crops';
import { clockText, lampsOn, nightFactor } from '../sim/daylight';
import { BUILDINGS, TRACKS, ZONES } from '../sim/farm';
import { type Field, TileState } from '../sim/field';
import type { Game } from '../sim/game';
import { priceTrend } from '../sim/market';
import { money } from '../ui/dom';
import {
  STATE_NAMES, STATE_ORDER, fieldReport, grainText, percent, promptText, reversing, showGrain, speedKmh,
} from '../ui/readouts';
import { box, cyl } from './util';

/**
 * Working instruments inside the cab, drawn onto canvas textures:
 *  - an instrument cluster behind the steering wheel (speedometer, fuel and grain-tank gauges, warning lamps),
 *  - a GPS screen on the right pillar with a heading-up map of the farm coloured by what each tile needs,
 *  - a farm terminal on the left pillar (money, clock, implement, seed, market, prompts and messages).
 * They replace the screen HUD in the cab view. Screens are unlit so they stay readable at night.
 */

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const BG = '#0c120e';
const TEXT = '#f4f1e6';
const DIM = '#9aa596';
const ACCENT = '#ffd23a';
const GOOD = '#9cf27a';
const WARN = '#ff8a7a';

/** Map colours for each tile state; growing crops brighten as they mature. */
export const TILE_COLORS: Record<TileState, string> = {
  [TileState.Grass]: '#6f8f3f',
  [TileState.Plowed]: '#7b4a26',
  [TileState.Seeded]: '#3fae74',
  [TileState.Ripe]: '#e0c060',
  [TileState.Stubble]: '#ddd2ac',
};
const SEEDED_FROM = new THREE.Color('#1f6a46');
const SEEDED_TO = new THREE.Color('#7ee2a2');

/** One canvas-backed display: a glowing plane in a dark bezel. */
class Screen {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly group = new THREE.Group();
  private nextDraw = 0;

  constructor(px: number, py: number, readonly w: number, readonly h: number, anisotropy: number, private hz: number) {
    this.canvas.width = px;
    this.canvas.height = py;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    glass.position.z = 0.002;
    const bezel = box(w + 0.03, h + 0.03, 0.03, 0x161616, 0, 0, -0.016);
    bezel.castShadow = false;
    this.group.add(bezel, glass);
  }

  /** Redraw at most `hz` times a second (or immediately when forced). */
  due(now: number, force: boolean): boolean {
    if (!force && now < this.nextDraw) return false;
    this.nextDraw = now + 1 / this.hz;
    return true;
  }

  commit(): void {
    this.texture.needsUpdate = true;
  }
}

/** Point `obj` (whose face is +Z) at `eye`, everything in the same parent space. */
function face(obj: THREE.Object3D, eye: THREE.Vector3): void {
  const m = new THREE.Matrix4().lookAt(eye, obj.position, new THREE.Vector3(0, 1, 0));
  obj.quaternion.setFromRotationMatrix(m);
}

/** A thin bar between two points (mounting arms). */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = cyl(r, r, len, 0x222222, 6);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export class CabInstruments {
  /** Add this to the tractor body; positions are in body space (+Z forward, +X to the driver's left). */
  readonly group = new THREE.Group();
  private cluster: Screen;
  private gps: Screen;
  private terminal: Screen;
  private fieldImages = new Map<Field, { canvas: HTMLCanvasElement; version: number; at: number }>();

  constructor(private game: Game, eye: THREE.Vector3, anisotropy = 1) {
    // Cluster: on the steering column, read through the top half of the wheel.
    this.cluster = new Screen(512, 192, 0.36, 0.135, anisotropy, 30);
    this.cluster.group.position.set(0, 2.05, -0.15);
    face(this.cluster.group, eye);
    const hood = box(0.42, 0.025, 0.1, 0x1a1a1a, 0, 0.085, 0.03);
    hood.rotation.x = -0.25;
    this.cluster.group.add(hood);
    this.group.add(this.cluster.group, box(0.42, 0.16, 0.14, 0x202020, 0, 1.94, -0.1));

    // GPS on the right (driver's right is -X), farm terminal on the left, both on arms from the front pillars.
    this.gps = new Screen(512, 384, 0.3, 0.225, anisotropy, 24);
    this.terminal = new Screen(512, 384, 0.3, 0.225, anisotropy, 6);
    for (const [screen, side] of [[this.gps, -1], [this.terminal, 1]] as const) {
      const pos = new THREE.Vector3(side * 0.41, 2.27, -0.27);
      screen.group.position.copy(pos);
      face(screen.group, eye);
      this.group.add(screen.group, strut(pos.clone().add(new THREE.Vector3(side * 0.08, 0, 0.04)), new THREE.Vector3(side * 0.6, 2.27, -0.12), 0.015));
    }
    this.update(0, true);
  }

  update(now: number, force = false): void {
    if (this.cluster.due(now, force)) this.drawCluster(now);
    if (this.gps.due(now, force)) this.drawGps(now);
    if (this.terminal.due(now, force)) this.drawTerminal(now);
  }

  // ---------------------------------------------------------------- cluster

  private drawCluster(now: number): void {
    const g = this.game, def = g.tractorDef, s = this.cluster, c = s.ctx;
    const W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);

    const fuel = g.fuel / def.fuelCapacity;
    dial(c, 86, 100, 64, fuel, { labels: ['E', '½', 'F'], minor: 4, red: [0, 0.15] });
    caption(c, 86, 150, 'FUEL', `${Math.round(g.fuel)} L`, fuel < 0.15 ? WARN : TEXT);

    const top = Math.max(40, Math.ceil((def.maxSpeed * 3.6) / 10) * 10);
    const kmh = Math.abs(g.tractor.speed) * 3.6;
    const labels = Array.from({ length: top / 10 + 1 }, (_, i) => String(i * 10));
    dial(c, 256, 98, 88, kmh / top, { labels, minor: 2 });
    c.textAlign = 'center';
    c.fillStyle = TEXT;
    c.font = `800 34px ${FONT}`;
    c.fillText(String(speedKmh(g)), 256, 150);
    c.fillStyle = DIM;
    c.font = `600 13px ${FONT}`;
    c.fillText('km/h', 256, 166);
    c.font = `800 16px ${FONT}`;
    c.fillStyle = reversing(g) ? ACCENT : '#3a443c';
    c.fillText('R', 236, 186);
    c.fillStyle = reversing(g) ? '#3a443c' : GOOD;
    c.fillText('F', 276, 186);

    const cap = def.grainCapacity;
    const tank = g.grain.amount / cap;
    const harvesting = showGrain(g);
    c.globalAlpha = harvesting ? 1 : 0.45;
    dial(c, 426, 100, 64, tank, { labels: ['0', '½', '1'], minor: 4, red: [0.95, 1] });
    caption(c, 426, 150, 'TANK', percent(tank), tank > 0.95 ? WARN : TEXT);
    c.globalAlpha = 1;

    // Warning lamps in the corners.
    const blink = Math.floor(now * 2) % 2 === 0;
    lamp(c, 6, 6, 'LIGHTS', lampsOn(g.time), '#5fb0ff');
    lamp(c, W - 82, 6, 'FULL', tank >= 0.99 && blink, '#ff5a4a');
    lamp(c, 6, H - 26, 'FUEL', fuel < 0.15 && (fuel > 0 || blink), '#ffb02e');
    lamp(c, W - 82, H - 26, 'IMPL ▼', g.lowered && g.implement !== null, GOOD);
    s.commit();
  }

  // ---------------------------------------------------------------- GPS map

  private drawGps(now: number): void {
    const g = this.game, s = this.gps, c = s.ctx;
    const W = s.canvas.width, H = s.canvas.height;
    const MAP_H = 316;
    const scale = 3.2; // px per metre: about 160 m across
    const t = g.tractor;
    const cx = W / 2, cy = MAP_H * 0.68;
    const sin = Math.sin(t.heading), cos = Math.cos(t.heading);
    // Heading-up: the tractor's forward is screen-up and its left is screen-left.
    const a = -scale * cos, b = -scale * sin, cc = scale * sin, d = -scale * cos;
    const e = cx - (a * t.x + cc * t.z), f = cy - (b * t.x + d * t.z);
    const toScreen = (x: number, z: number): [number, number] => [a * x + cc * z + e, b * x + d * z + f];

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#2b4122';
    c.fillRect(0, 0, W, H);
    c.save();
    c.beginPath();
    c.rect(0, 0, W, MAP_H);
    c.clip();
    c.setTransform(a, b, cc, d, e, f);

    for (const tr of TRACKS) {
      c.fillStyle = tr.yard ? '#9a8a66' : '#86764f';
      c.fillRect(tr.x - tr.w / 2, tr.z - tr.d / 2, tr.w, tr.d);
    }
    c.imageSmoothingEnabled = false;
    for (const fld of g.fields) {
      c.globalAlpha = fld.owned ? 1 : 0.45;
      c.drawImage(this.fieldImage(fld, now), fld.x, fld.z, fld.width, fld.depth);
      c.globalAlpha = 1;
      c.lineWidth = 0.5;
      c.strokeStyle = fld.owned ? 'rgba(255,255,255,0.7)' : 'rgba(255,210,58,0.7)';
      c.setLineDash(fld.owned ? [] : [2, 2]);
      c.strokeRect(fld.x, fld.z, fld.width, fld.depth);
      c.setLineDash([]);
    }
    for (const bl of BUILDINGS) {
      c.fillStyle = '#4c5258';
      c.fillRect(bl.box.minX, bl.box.minZ, bl.box.maxX - bl.box.minX, bl.box.maxZ - bl.box.minZ);
    }
    c.strokeStyle = ACCENT;
    c.lineWidth = 0.6;
    for (const z of ZONES) {
      c.beginPath();
      c.arc(z.x, z.z, z.radius, 0, Math.PI * 2);
      c.stroke();
    }
    // Implement working bar, across the direction of travel.
    const imp = g.implement;
    if (imp) {
      const p = g.implementPos();
      const lx = cos * imp.width / 2, lz = -sin * imp.width / 2;
      c.strokeStyle = g.workingNow ? GOOD : g.lowered ? ACCENT : '#c8c8c8';
      c.lineWidth = 0.9;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(p.x - lx, p.z - lz);
      c.lineTo(p.x + lx, p.z + lz);
      c.stroke();
      c.lineCap = 'butt';
    }
    c.setTransform(1, 0, 0, 1, 0, 0);

    // Labels stay upright.
    c.textAlign = 'center';
    c.font = `700 13px ${FONT}`;
    const label = (text: string, x: number, y: number, color: string) => {
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.strokeText(text, x, y);
      c.fillStyle = color;
      c.fillText(text, x, y);
    };
    for (const fld of g.fields) {
      const [x, y] = toScreen(fld.x + fld.width / 2, fld.z + fld.depth / 2);
      label(fld.name, x, y, TEXT);
      if (!fld.owned) label(`FOR SALE ${money(fld.price)}`, x, y + 15, ACCENT);
    }
    c.font = `700 11px ${FONT}`;
    const zoneNames = { shed: 'SHOP', silo: 'SILO', fuel: 'FUEL' };
    for (const z of ZONES) {
      const [x, y] = toScreen(z.x, z.z);
      label(zoneNames[z.id], x, y + 4, ACCENT);
    }

    // Tractor marker: a fixed-size arrow pointing up.
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#d23a2a';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(cx, cy - 13);
    c.lineTo(cx + 8, cy + 9);
    c.lineTo(cx, cy + 4);
    c.lineTo(cx - 8, cy + 9);
    c.closePath();
    c.fill();
    c.stroke();

    // Compass (north is +Z) and scale bar.
    const nx = cc / scale, ny = d / scale;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath();
    c.arc(30, 30, 22, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ff5a4a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(30 - nx * 6, 30 - ny * 6);
    c.lineTo(30 + nx * 8, 30 + ny * 8);
    c.stroke();
    c.font = `800 12px ${FONT}`;
    c.fillStyle = TEXT;
    c.textBaseline = 'middle';
    c.fillText('N', 30 + nx * 16, 30 + ny * 16);
    c.textBaseline = 'alphabetic';
    const bar = 20 * scale;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(W - bar - 26, 10, bar + 16, 28);
    c.fillStyle = TEXT;
    c.fillRect(W - bar - 18, 28, bar, 3);
    c.font = `700 11px ${FONT}`;
    c.fillText('20 m', W - bar / 2 - 18, 23);
    c.restore();

    // Status bar: the field you're in and how much of it is in each state.
    c.fillStyle = '#121a13';
    c.fillRect(0, MAP_H, W, H - MAP_H);
    c.fillStyle = '#2e3a2f';
    c.fillRect(0, MAP_H, W, 2);
    const report = fieldReport(g);
    c.textAlign = 'left';
    if (report) {
      c.font = `800 17px ${FONT}`;
      c.fillStyle = report.field.owned ? TEXT : ACCENT;
      c.fillText(report.field.name + (report.field.owned ? '' : ' — not owned'), 12, MAP_H + 24);
      if (report.underImplement) {
        c.textAlign = 'right';
        c.font = `600 13px ${FONT}`;
        c.fillStyle = DIM;
        c.fillText(`Implement: ${report.underImplement}`, W - 12, MAP_H + 23);
        c.textAlign = 'left';
      }
      legend(c, 12, MAP_H + 50, report.coverage.map(({ state, share }) => [state, `${STATE_NAMES[state]} ${percent(share)}`]));
    } else {
      c.font = `800 17px ${FONT}`;
      c.fillStyle = TEXT;
      c.fillText(g.zone ? g.zone.label : 'Off field', 12, MAP_H + 24);
      legend(c, 12, MAP_H + 50, STATE_ORDER.map((st) => [st, st === TileState.Grass ? 'Unworked' : STATE_NAMES[st]]));
    }
    s.commit();
  }

  /** One pixel per tile, cached until the field changes (or once a second while crops grow). */
  private fieldImage(f: Field, now: number): HTMLCanvasElement {
    let img = this.fieldImages.get(f);
    if (!img) {
      const canvas = document.createElement('canvas');
      canvas.width = f.cols;
      canvas.height = f.rows;
      img = { canvas, version: -1, at: -Infinity };
      this.fieldImages.set(f, img);
    }
    if (img.version === f.version && now - img.at < 1) return img.canvas;
    img.version = f.version;
    img.at = now;
    const ctx = img.canvas.getContext('2d')!;
    const data = ctx.createImageData(f.cols, f.rows);
    const col = new THREE.Color();
    const base = Object.fromEntries(STATE_ORDER.map((st) => [st, new THREE.Color(TILE_COLORS[st])]));
    const ripe = Object.fromEntries(CROP_IDS.map((id) => [id, new THREE.Color(CROPS[id].ripeColor).lerp(new THREE.Color('#ffe080'), 0.25)]));
    for (let i = 0; i < f.size; i++) {
      const st = f.state[i] as TileState;
      if (st === TileState.Seeded) col.copy(SEEDED_FROM).lerp(SEEDED_TO, f.growth[i]);
      else if (st === TileState.Ripe) col.copy(ripe[f.cropAt(i) ?? 'wheat']);
      else col.copy(base[st]);
      // Light checkerboard so individual tiles read on the map.
      const k = ((i % f.cols) + Math.floor(i / f.cols)) % 2 ? 1 : 0.93;
      data.data.set([col.r * 255 * k, col.g * 255 * k, col.b * 255 * k, 255], i * 4);
    }
    ctx.putImageData(data, 0, 0);
    return img.canvas;
  }

  // ---------------------------------------------------------------- terminal

  private drawTerminal(now: number): void {
    const g = this.game, s = this.terminal, c = s.ctx;
    const W = s.canvas.width, H = s.canvas.height;
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);

    // Header: money and clock.
    c.fillStyle = '#1b2a1c';
    c.fillRect(0, 0, W, 54);
    c.textAlign = 'left';
    c.font = `800 32px ${FONT}`;
    c.fillStyle = GOOD;
    c.fillText(money(g.money), 14, 39);
    c.textAlign = 'right';
    c.font = `800 26px ${FONT}`;
    c.fillStyle = TEXT;
    c.fillText(clockText(g.time), W - 14, 37);
    const night = nightFactor(g.time) > 0.5;
    const ix = W - 108, iy = 27;
    c.fillStyle = night ? '#dfe6f0' : '#ffd23a';
    c.beginPath();
    c.arc(ix, iy, 10, 0, Math.PI * 2);
    c.fill();
    if (night) {
      c.fillStyle = '#1b2a1c';
      c.beginPath();
      c.arc(ix + 5, iy - 4, 9, 0, Math.PI * 2);
      c.fill();
    }

    // Implement column.
    const imp = g.implement;
    c.textAlign = 'left';
    c.font = `800 23px ${FONT}`;
    c.fillStyle = TEXT;
    c.fillText(imp ? imp.name : 'No implement', 14, 88);
    c.font = `700 17px ${FONT}`;
    c.fillStyle = !imp ? DIM : g.lowered ? GOOD : DIM;
    c.fillText(!imp ? 'Attach one at the garage' : g.lowered ? '▼ LOWERED — working' : '▲ Raised  [Space] lowers', 14, 114);
    c.font = `600 13px ${FONT}`;
    c.fillStyle = DIM;
    c.fillText(g.tractorDef.name, 14, 134);

    let y = 158;
    if (imp?.kind === 'seeder') {
      c.font = `700 12px ${FONT}`;
      c.fillStyle = DIM;
      c.fillText('SEED  [1] [2] [3]', 14, y);
      CROP_IDS.forEach((id, i) => {
        const x = 14 + i * 96, on = g.seedCrop === id;
        roundRect(c, x, y + 8, 90, 42, 8, on ? ACCENT : '#243024');
        c.fillStyle = on ? '#2a2a10' : TEXT;
        c.font = `800 15px ${FONT}`;
        c.fillText(`${i + 1} ${CROPS[id].name}`, x + 9, y + 27);
        c.font = `600 12px ${FONT}`;
        c.fillText(`$${CROPS[id].seedCostPerTile}/tile`, x + 9, y + 43);
      });
      y += 64;
    }
    if (showGrain(g)) {
      const share = g.grain.amount / g.tractorDef.grainCapacity;
      c.font = `700 12px ${FONT}`;
      c.fillStyle = DIM;
      c.fillText('GRAIN TANK', 14, y);
      roundRect(c, 14, y + 8, 280, 14, 7, '#2a332b');
      roundRect(c, 14, y + 8, Math.max(14, 280 * share), 14, 7, share > 0.95 ? '#e8453a' : '#e0c060');
      c.font = `600 14px ${FONT}`;
      c.fillStyle = TEXT;
      c.fillText(grainText(g), 14, y + 42);
    }

    // Market column.
    const mx = 318;
    c.fillStyle = '#243024';
    c.fillRect(mx - 12, 66, 2, 172);
    c.font = `800 15px ${FONT}`;
    c.fillStyle = ACCENT;
    c.fillText('MARKET  $/L', mx, 86);
    CROP_IDS.forEach((id, i) => {
      const ry = 120 + i * 36, tr = priceTrend(id, g.time);
      c.textAlign = 'left';
      c.font = `600 17px ${FONT}`;
      c.fillStyle = TEXT;
      c.fillText(CROPS[id].name, mx, ry);
      c.textAlign = 'right';
      c.font = `800 17px ${FONT}`;
      c.fillStyle = tr > 0 ? GOOD : tr < 0 ? WARN : TEXT;
      c.fillText(`${g.price(id).toFixed(2)} ${tr > 0 ? '▲' : tr < 0 ? '▼' : '•'}`, W - 14, ry);
    });

    // Messages and the current action prompt.
    c.textAlign = 'left';
    c.fillStyle = '#243024';
    c.fillRect(0, 246, W, 2);
    const prompt = promptText(g);
    const recent = g.messages.filter((m) => g.time - m.time < 6).slice(-2).reverse();
    let my = 272;
    const maxLines = prompt ? 3 : 5;
    let lines = 0;
    c.font = `600 16px ${FONT}`;
    for (const m of recent) {
      const wrapped = wrap(c, m.text, W - 40).slice(0, maxLines - lines);
      if (!wrapped.length) break;
      c.fillStyle = m.kind === 'good' ? GOOD : m.kind === 'warn' ? '#e8453a' : '#8ac';
      c.fillRect(14, my - 15, 4, wrapped.length * 20);
      c.fillStyle = TEXT;
      for (const line of wrapped) {
        c.fillText(line, 26, my);
        my += 20;
      }
      my += 6;
      lines += wrapped.length;
    }
    if (prompt) {
      const pulse = 0.85 + 0.15 * Math.sin(now * 5);
      c.globalAlpha = pulse;
      roundRect(c, 12, H - 50, W - 24, 38, 19, ACCENT);
      c.globalAlpha = 1;
      c.textAlign = 'center';
      c.font = `800 18px ${FONT}`;
      c.fillStyle = '#2a2a10';
      c.fillText(prompt, W / 2, H - 25);
    }
    s.commit();
  }
}

// ---------------------------------------------------------------- drawing helpers

function dial(
  c: CanvasRenderingContext2D, cx: number, cy: number, r: number, value: number,
  opts: { labels: string[]; minor: number; red?: [number, number] },
): void {
  const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
  const at = (v: number) => start + sweep * Math.max(0, Math.min(1, v));
  c.fillStyle = '#151c17';
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#3a443c';
  c.lineWidth = 3;
  c.stroke();
  if (opts.red) {
    c.strokeStyle = '#e8453a';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(cx, cy, r - 7, at(opts.red[0]), at(opts.red[1]));
    c.stroke();
  }
  const majors = opts.labels.length - 1;
  const n = majors * opts.minor;
  c.strokeStyle = '#dfe4da';
  for (let i = 0; i <= n; i++) {
    const ang = at(i / n), major = i % opts.minor === 0;
    const len = major ? 13 : 7;
    c.lineWidth = major ? 3 : 1.5;
    c.beginPath();
    c.moveTo(cx + Math.cos(ang) * (r - 4), cy + Math.sin(ang) * (r - 4));
    c.lineTo(cx + Math.cos(ang) * (r - 4 - len), cy + Math.sin(ang) * (r - 4 - len));
    c.stroke();
  }
  c.fillStyle = TEXT;
  c.font = `700 ${r > 70 ? 14 : 13}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  opts.labels.forEach((l, i) => {
    const ang = at(i / majors);
    c.fillText(l, cx + Math.cos(ang) * (r - 28), cy + Math.sin(ang) * (r - 28));
  });
  c.textBaseline = 'alphabetic';
  const ang = at(value);
  c.strokeStyle = '#ff7a1a';
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - Math.cos(ang) * 10, cy - Math.sin(ang) * 10);
  c.lineTo(cx + Math.cos(ang) * (r - 12), cy + Math.sin(ang) * (r - 12));
  c.stroke();
  c.lineCap = 'butt';
  c.fillStyle = '#2b2b2b';
  c.beginPath();
  c.arc(cx, cy, 7, 0, Math.PI * 2);
  c.fill();
}

function caption(c: CanvasRenderingContext2D, x: number, y: number, title: string, value: string, color: string): void {
  c.textAlign = 'center';
  c.font = `800 15px ${FONT}`;
  c.fillStyle = color;
  c.fillText(value, x, y);
  c.font = `700 11px ${FONT}`;
  c.fillStyle = DIM;
  c.fillText(title, x, y + 16);
}

function lamp(c: CanvasRenderingContext2D, x: number, y: number, text: string, on: boolean, color: string): void {
  roundRect(c, x, y, 76, 20, 5, on ? color : '#1c231e');
  c.textAlign = 'center';
  c.font = `800 11px ${FONT}`;
  c.fillStyle = on ? '#101010' : '#3e4a40';
  c.fillText(text, x + 38, y + 14);
}

function legend(c: CanvasRenderingContext2D, x: number, y: number, items: [TileState, string][]): void {
  c.textAlign = 'left';
  c.font = `700 12px ${FONT}`;
  for (const [st, text] of items) {
    c.fillStyle = st === TileState.Seeded ? '#4fc184' : TILE_COLORS[st];
    c.fillRect(x, y - 11, 13, 13);
    c.fillStyle = TEXT;
    c.fillText(text, x + 18, y);
    x += 18 + c.measureText(text).width + 10;
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
