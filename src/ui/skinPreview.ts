import * as THREE from 'three';
import { SKINS } from '../core/economy';
import { loadGLB } from '../view/loading';

/**
 * The lobby's character carousel: its own small renderer showing the chosen character idling and slowly turning.
 * Only renders while the menu is visible. Models are cached once loaded; locked ones are drawn as dark silhouettes.
 */
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene; let camera: THREE.PerspectiveCamera;
let holder: THREE.Group;
let mixer: THREE.AnimationMixer | null = null;
const cache = new Map<string, Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }>>();
let currentId = '';
let locked = false;
let running = false;
let lastMs = 0;
let materials: THREE.MeshStandardMaterial[] = [];

export function initSkinPreview(canvas: HTMLCanvasElement): void {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch { renderer = null; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(canvas.clientWidth || 260, canvas.clientHeight || 320, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, (canvas.clientWidth || 260) / (canvas.clientHeight || 320), 0.1, 50);
  camera.position.set(0, 1.35, 5.2); camera.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight(0xfff0dd, 0x3a2a40, 1.6));
  const key = new THREE.DirectionalLight(0xffe0b0, 2.2); key.position.set(2, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe94560, 1.2); rim.position.set(-3, 2, -2); scene.add(rim);
  // Stone plinth under the feet.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.18, 24), new THREE.MeshStandardMaterial({ color: 0x5a5058, roughness: 0.9 }));
  plinth.position.y = -0.09; scene.add(plinth);
  holder = new THREE.Group(); scene.add(holder);
}

function load(file: string): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> {
  if (!cache.has(file)) cache.set(file, loadGLB(`/models/chars/${file}.glb`, 'lobby').then((g) => ({ scene: g.scene, clips: g.animations })));
  return cache.get(file)!;
}

/** Show a character; `isLocked` draws it as a dark statue. */
export function showSkin(id: string, isLocked: boolean): Promise<void> {
  const def = SKINS.find((s) => s.id === id) ?? SKINS[0];
  if (!renderer) return Promise.resolve();
  currentId = def.id; locked = isLocked;
  return load(def.file).then(({ scene: src, clips }) => {
    if (currentId !== def.id) return;
    holder.clear(); materials = [];
    const model = src;   // the lobby is the only user of this instance; playerView loads its own copy
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()); const k = 1.9 / Math.max(0.01, size.y);
    model.scale.setScalar(k);
    model.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
    model.traverse((o) => {
      if (o.name === 'Sword') o.visible = false;
      if (o instanceof THREE.Mesh) { o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m instanceof THREE.MeshStandardMaterial) materials.push(m); }
    });
    applyLock();
    holder.add(model);
    mixer = new THREE.AnimationMixer(model);
    const idle = clips.find((c) => /Idle$/.test(c.name)) ?? clips[0];
    if (idle) mixer.clipAction(idle).play();
  }).catch(() => { /* preview stays empty */ });
}

function applyLock(): void {
  for (const m of materials) {
    // Locked: the character keeps its look but is washed out, like an inactive button.
    if (locked) { m.userData.color ??= m.color.clone(); m.color.copy(m.userData.color).lerp(new THREE.Color(0xffffff), 0.38); m.emissive.set(0x2a2a30); }
    else if (m.userData.color) { m.color.copy(m.userData.color); m.emissive.set(0x000000); }
  }
}
export function setPreviewLocked(isLocked: boolean): void { locked = isLocked; applyLock(); }

export function startPreview(): void { if (running || !renderer) return; running = true; lastMs = 0; requestAnimationFrame(frame); }
export function stopPreview(): void { running = false; }

function frame(now: number): void {
  if (!running || !renderer) return;
  requestAnimationFrame(frame);
  const dt = lastMs ? Math.min(0.1, (now - lastMs) / 1000) : 0.016; lastMs = now;
  const canvas = renderer.domElement;
  const w = canvas.clientWidth || 260; const h = canvas.clientHeight || 320;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  holder.rotation.y += dt * 0.6;
  mixer?.update(dt);
  renderer.render(scene, camera);
}
