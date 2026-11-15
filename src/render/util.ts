import * as THREE from 'three';

const matCache = new Map<string, THREE.MeshLambertMaterial>();

/** Shared flat-shaded Lambert material per colour. */
export function mat(color: number, opts: { flat?: boolean } = {}): THREE.MeshLambertMaterial {
  const key = `${color}:${opts.flat ?? true}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: opts.flat ?? true });
    matCache.set(key, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop: number, rBot: number, h: number, color: number, seg = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Deterministic 0..1 hash of an integer. */
export function hash(n: number): number {
  let x = (n | 0) * 374761393 + 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967295;
}

/** Make a text label sprite. */
export function labelSprite(text: string, opts: { bg?: string; fg?: string; scale?: number } = {}): THREE.Sprite {
  const lines = text.split('\n');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = 'bold 44px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48;
  const h = lines.length * 54 + 26;
  canvas.width = Math.ceil(w);
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = opts.bg ?? 'rgba(20,24,18,0.78)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 18);
  ctx.fill();
  ctx.fillStyle = opts.fg ?? '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, 16 + i * 54));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const s = (opts.scale ?? 1) * 0.012;
  sprite.scale.set(canvas.width * s, canvas.height * s, 1);
  return sprite;
}
