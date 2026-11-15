import * as THREE from 'three';
import { nightFactor, sunHeight, hourAt } from '../sim/daylight';
import { hash } from './util';

const DAY_SKY = new THREE.Color(0x9fd3f0);
const DUSK_SKY = new THREE.Color(0xe89a6a);
const NIGHT_SKY = new THREE.Color(0x0a1224);
const DAY_HEMI_SKY = new THREE.Color(0xdff2ff);
const NIGHT_HEMI_SKY = new THREE.Color(0x4a5e8a);
const DAY_HEMI_GROUND = new THREE.Color(0x5a7a3a);
const NIGHT_HEMI_GROUND = new THREE.Color(0x1a2418);
const SUN_NOON = new THREE.Color(0xfff1d6);
const SUN_LOW = new THREE.Color(0xffa060);
const MOON = new THREE.Color(0x9fb4ff);

let glowTex: THREE.Texture | null = null;

/** Soft radial gradient used for light pools and lens flares. */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Additive, unlit material whose strength is driven by the lamp level. */
export function glowMaterial(color: number, opts: { map?: boolean; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, map: opts.map === false ? null : glowTexture(), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: opts.side ?? THREE.FrontSide,
  });
}

interface LightEntry { light: THREE.Light; max: number }
interface GlowEntry { mat: THREE.Material & { opacity: number }; max: number }
interface LensEntry { mat: THREE.MeshBasicMaterial; off: THREE.Color; on: THREE.Color }

/**
 * Everything that switches on at night: real lights, additive glows and emissive lenses.
 * Lights stay in the scene at zero intensity in daytime so shaders never recompile.
 */
export class Lamps {
  private lights: LightEntry[] = [];
  private glows: GlowEntry[] = [];
  private lenses: LensEntry[] = [];
  level = -1;

  light<T extends THREE.Light>(light: T, max: number): T {
    light.intensity = 0;
    this.lights.push({ light, max });
    return light;
  }

  glow<T extends THREE.Material & { opacity: number }>(mat: T, max: number): T {
    this.glows.push({ mat, max });
    return mat;
  }

  /** An unlit lens that goes from `off` colour by day to `on` colour when lit. */
  lens(off: number, on: number): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ color: off });
    this.lenses.push({ mat, off: new THREE.Color(off), on: new THREE.Color(on) });
    return mat;
  }

  set(level: number): void {
    if (Math.abs(level - this.level) < 1e-3) return;
    this.level = level;
    for (const l of this.lights) l.light.intensity = l.max * level;
    for (const g of this.glows) {
      g.mat.opacity = g.max * level;
      g.mat.visible = level > 0.01;
    }
    for (const l of this.lenses) l.mat.color.lerpColors(l.off, l.on, level);
  }
}

/** Drives sky, fog, ambient and the sun/moon from the game clock. */
export class DayNight {
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private sky = new THREE.Color();

  constructor(
    private scene: THREE.Scene,
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
  ) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = hash(i * 3) * Math.PI * 2;
      const y = 0.08 + hash(i * 3 + 1) * 0.92;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 600, y * 600, Math.sin(a) * r * 600], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    scene.add(this.stars);
  }

  /** Returns the night factor (0 day .. 1 night). */
  update(time: number, focus: { x: number; z: number }, camera: THREE.Camera): number {
    const night = nightFactor(time);
    const s = sunHeight(time);
    // Warm horizon glow peaks while the sun is near the horizon.
    const dusk = Math.max(0, 1 - Math.abs(s) / 0.25) * (1 - night * 0.6);

    this.sky.copy(DAY_SKY).lerp(NIGHT_SKY, night).lerp(DUSK_SKY, dusk * 0.55);
    (this.scene.background as THREE.Color).copy(this.sky);
    this.scene.fog!.color.copy(this.sky);

    this.hemi.intensity = 1.4 - 1.05 * night;
    this.hemi.color.lerpColors(DAY_HEMI_SKY, NIGHT_HEMI_SKY, night);
    this.hemi.groundColor.lerpColors(DAY_HEMI_GROUND, NIGHT_HEMI_GROUND, night);

    // The sun travels east (+X) to west (-X), tilted south so shadows keep some length at noon.
    // At night the same light becomes the moon, opposite the sun.
    const theta = ((hourAt(time) - 6) / 24) * Math.PI * 2;
    const up = s > -0.02;
    const a = up ? theta : theta + Math.PI;
    const dir = new THREE.Vector3(Math.cos(a), Math.max(0.12, Math.sin(a)), 0.45).normalize();
    this.sun.position.set(focus.x + dir.x * 85, dir.y * 85, focus.z + dir.z * 85);
    this.sun.target.position.set(focus.x, 0, focus.z);
    if (up) {
      this.sun.intensity = 2.2 * Math.min(1, Math.max(0, s) / 0.2) ** 0.8;
      this.sun.color.lerpColors(SUN_LOW, SUN_NOON, Math.min(1, s / 0.4));
    } else {
      this.sun.intensity = 0.35 * Math.min(1, -s / 0.2);
      this.sun.color.copy(MOON);
    }

    this.starMat.opacity = Math.max(0, night - 0.3) / 0.7 * 0.9;
    this.stars.visible = this.starMat.opacity > 0.01;
    this.stars.position.copy(camera.position);
    return night;
  }
}
