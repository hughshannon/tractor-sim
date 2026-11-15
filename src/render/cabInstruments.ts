import * as THREE from 'three';
import { clockText, lampsOn, nightFactor } from '../sim/daylight';
import type { Game } from '../sim/game';
import { money } from '../ui/dom';
import { fieldProgress, percent, reversing, showGrain, speedKmh } from '../ui/readouts';
import { mapColor } from './gpsMap';
import { drawPixelText, pixelTextWidth } from './pixelFont';
import { box } from './util';

/**
 * Working instruments inside the cab, drawn onto canvas textures:
 *  - an instrument cluster behind the steering wheel (speedometer, fuel and grain-tank gauges, warning lamps),
 *  - a small low-resolution GPS on the dash to the right of the wheel: a heading-up pixel map coloured by
 *    ground state, with the current field and how much of it the implement has done,
 *  - a two-line LCD on the dash to the left of the wheel: money, clock with sun/moon, implement up/down.
 * They replace the screen HUD in the cab view. Screens are unlit so they stay readable at night.
 */

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const BG = '#0c120e';
const TEXT = '#f4f1e6';
const DIM = '#9aa596';
const ACCENT = '#ffd23a';
const GOOD = '#9cf27a';
const WARN = '#ff8a7a';
const LCD_BG = '#0d1a10';

/** GPS: 40×30 map texels at 4 m each, plus an 8-texel status line. */
const GPS_W = 40, GPS_MAP_H = 30, GPS_H = 38, GPS_M_PER_TEXEL = 4, GPS_TRACTOR_ROW = 20;
const LCD_W = 68, LCD_H = 15;

/** One canvas-backed display: a glowing plane in a dark bezel. */
class Screen {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly group = new THREE.Group();
  private nextDraw = 0;
  private hz: number;

  constructor(
    px: number, py: number, readonly w: number, readonly h: number,
    opts: { hz: number; anisotropy?: number; pixelated?: boolean; border?: number },
  ) {
    this.hz = opts.hz;
    this.canvas.width = px;
    this.canvas.height = py;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    if (opts.pixelated) {
      // Hard-edged texels, like a cheap low-res LCD.
      this.texture.magFilter = THREE.NearestFilter;
      this.texture.minFilter = THREE.NearestFilter;
      this.texture.generateMipmaps = false;
    } else {
      this.texture.anisotropy = opts.anisotropy ?? 1;
    }
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    glass.position.z = 0.002;
    const border = opts.border ?? 0.015;
    const bezel = box(w + border * 2, h + border * 2, 0.025, 0x161616, 0, 0, -0.013);
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

/** Top of the dashboard box in tractor body space. */
const DASH_TOP = 1.9;

export class CabInstruments {
  /** Add this to the tractor body; positions are in body space (+Z forward, +X to the driver's left). */
  readonly group = new THREE.Group();
  private cluster: Screen;
  private gps: Screen;
  private lcd: Screen;

  constructor(private game: Game, eye: THREE.Vector3, anisotropy = 1) {
    // Cluster: on the steering column, read through the top half of the wheel.
    this.cluster = new Screen(512, 192, 0.36, 0.135, { hz: 30, anisotropy });
    this.cluster.group.position.set(0, 2.05, -0.15);
    face(this.cluster.group, eye);
    const hood = box(0.42, 0.025, 0.1, 0x1a1a1a, 0, 0.085, 0.03);
    hood.rotation.x = -0.25;
    this.cluster.group.add(hood);
    this.group.add(this.cluster.group, box(0.42, 0.16, 0.14, 0x202020, 0, 1.94, -0.1));

    // Dash pods either side of the cluster, clear of the wheel rim: GPS to the right (-X), LCD to the left.
    this.gps = new Screen(GPS_W, GPS_H, 0.13, (0.13 * GPS_H) / GPS_W, { hz: 10, pixelated: true, border: 0.01 });
    this.lcd = new Screen(LCD_W, LCD_H, 0.17, (0.17 * LCD_H) / LCD_W, { hz: 4, pixelated: true, border: 0.008 });
    this.mountOnDash(this.gps, -0.35, eye);
    this.mountOnDash(this.lcd, 0.375, eye);
    this.update(0, true);
  }

  /** Stand a screen on the dash top at `x`, facing the driver, on a pod that fills the gap below it. */
  private mountOnDash(screen: Screen, x: number, eye: THREE.Vector3): void {
    const lift = 0.11;
    const y = DASH_TOP + lift + screen.h / 2;
    screen.group.position.set(x, y, -0.2);
    face(screen.group, eye);
    const pod = box(Math.min(0.08, screen.w), lift, 0.05, 0x202020, x, DASH_TOP + lift / 2, -0.17);
    this.group.add(screen.group, pod);
  }

  update(now: number, force = false): void {
    if (this.cluster.due(now, force)) this.drawCluster(now);
    if (this.gps.due(now, force)) this.drawGps();
    if (this.lcd.due(now, force)) this.drawLcd();
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

  // ---------------------------------------------------------------- GPS

  private drawGps(): void {
    const g = this.game, s = this.gps, c = s.ctx;
    const t = g.tractor;
    const sin = Math.sin(t.heading), cos = Math.cos(t.heading);
    // Heading-up: screen-up is the tractor's forward (sin h, cos h), screen-left its left (cos h, -sin h).
    for (let v = 0; v < GPS_MAP_H; v++) {
      for (let u = 0; u < GPS_W; u++) {
        const left = -(u + 0.5 - GPS_W / 2) * GPS_M_PER_TEXEL;
        const fwd = -(v + 0.5 - GPS_TRACTOR_ROW) * GPS_M_PER_TEXEL;
        c.fillStyle = mapColor(g, t.x + fwd * sin + left * cos, t.z + fwd * cos - left * sin);
        c.fillRect(u, v, 1, 1);
      }
    }
    // Tractor arrow, fixed and pointing up, with a red nose.
    const ax = GPS_W / 2, ay = GPS_TRACTOR_ROW;
    c.fillStyle = '#ffffff';
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [1, 1], [2, 1]]) {
      c.fillRect(ax + dx, ay + dy, 1, 1);
    }
    c.fillStyle = '#d23a2a';
    c.fillRect(ax, ay - 2, 1, 1);

    // Status line: field and progress.
    c.fillStyle = BG;
    c.fillRect(0, GPS_MAP_H, GPS_W, GPS_H - GPS_MAP_H);
    const { name, done, onField } = fieldProgress(g);
    drawPixelText(c, name.slice(0, 5), 1, GPS_MAP_H + 2, TEXT);
    const pct = !onField ? '' : done === null ? '--' : percent(done);
    if (pct) drawPixelText(c, pct, GPS_W - 1 - pixelTextWidth(pct), GPS_MAP_H + 2, done !== null && done >= 1 ? ACCENT : GOOD);
    s.commit();
  }

  // ---------------------------------------------------------------- LCD

  private drawLcd(): void {
    const g = this.game, s = this.lcd, c = s.ctx;
    c.fillStyle = LCD_BG;
    c.fillRect(0, 0, LCD_W, LCD_H);
    drawPixelText(c, money(g.money), 2, 2, GOOD);
    const clock = clockText(g.time);
    const cx = LCD_W - 2 - pixelTextWidth(clock);
    drawPixelText(c, clock, cx, 2, TEXT);
    if (nightFactor(g.time) > 0.5) {
      // Crescent moon.
      c.fillStyle = '#dfe6f0';
      c.fillRect(cx - 5, 2, 2, 1);
      c.fillRect(cx - 6, 3, 1, 3);
      c.fillRect(cx - 5, 6, 2, 1);
    } else {
      c.fillStyle = ACCENT;
      c.fillRect(cx - 6, 3, 3, 3);
      c.fillRect(cx - 5, 2, 1, 5);
      c.fillRect(cx - 7, 4, 5, 1);
    }
    c.fillStyle = '#1f3324';
    c.fillRect(0, 8, LCD_W, 1);
    const imp = g.implement;
    if (!imp) {
      drawPixelText(c, 'NO IMPLEMENT', 2, 9, DIM);
    } else {
      drawPixelText(c, imp.kind, 2, 9, '#c8d0c0');
      const state = g.lowered ? '▼ DOWN' : '▲ UP';
      drawPixelText(c, state, LCD_W - 2 - pixelTextWidth(state), 9, g.lowered ? GOOD : DIM);
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

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

