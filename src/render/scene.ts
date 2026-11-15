import * as THREE from 'three';
import { WORLD_HALF } from '../sim/farm';
import { hash } from './util';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  resize(): void;
}

export function createScene(container: HTMLElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Color(0x9fd3f0);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 140, 320);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 800);

  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x5a7a3a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  scene.add(createGround());

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, sun, hemi, resize };
}

function createGround(): THREE.Group {
  const g = new THREE.Group();
  const size = WORLD_HALF * 2 + 200;
  const seg = 80;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  // Per-vertex colour variation and gentle bumps outside the playable area.
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x77a843);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z)) - WORLD_HALF;
    if (edge > 0) pos.setY(i, Math.min(edge * 0.15, 12) * hash(i));
    const v = 0.9 + hash(i * 7) * 0.18;
    c.copy(base).multiplyScalar(v);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true;
  g.add(ground);
  return g;
}
