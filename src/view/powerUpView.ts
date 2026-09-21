import * as THREE from 'three';
import type { Game } from '../core/game';
import { ALL_PICKUP_KINDS, PowerUpKind } from '../core/powerups';
import { loadGLB } from './loading';

/**
 * Pickups as real models, big enough to read from far away (~1.4 m), spinning slowly over a soft halo:
 *  magnet – a classic red horseshoe magnet with silver tips (built here: no CC0 magnet model exists)
 *  shield – Kenney's round shield (Mini Dungeon, CC0)
 *  boost  – a lightning bolt (Poly by Google, CC-BY)
 *  ruby   – Kenney's jewel (Platformer Kit, CC0) recast in deep red, the rare gem worth one ruby
 * Every kind is a list of instanced parts sharing one matrix per pickup; models load lazily and until then
 * a plain glowing shape stands in.
 */

const MAX = 32;
const SIZE: Record<PowerUpKind, number> = { magnet: 1.3, shield: 1.4, boost: 1.5, ruby: 1.0 };
const GLOW: Record<PowerUpKind, number> = { magnet: 0xff4040, shield: 0x5fd8ff, boost: 0xffb020, ruby: 0xff2060 };
const MODEL: Partial<Record<PowerUpKind, string>> = { shield: 'shield-round', boost: 'bolt', ruby: 'jewel' };

interface Kind { parts: THREE.InstancedMesh[]; halo: THREE.InstancedMesh; count: number }
const kinds = new Map<PowerUpKind, Kind>();
const dummy = new THREE.Object3D();
let sceneRef: THREE.Scene;

function add(scene: THREE.Scene, m: THREE.InstancedMesh): THREE.InstancedMesh { m.count = 0; m.frustumCulled = false; scene.add(m); return m; }

/** Bake a GLB into instanced parts of the requested height, centred, base at y 0. */
function bake(kind: PowerUpKind, root: THREE.Object3D, recolor?: (m: THREE.MeshStandardMaterial) => void): THREE.InstancedMesh[] {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const k = SIZE[kind] / Math.max(0.01, Math.max(size.x, size.y, size.z));
  const c = box.getCenter(new THREE.Vector3());
  const parts: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld).translate(-c.x, -c.y, -c.z).scale(k, k, k);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = (mats[0] as THREE.MeshStandardMaterial).clone();
    m.roughness = Math.min(m.roughness, 0.6); m.metalness = Math.max(m.metalness, 0.2);
    recolor?.(m);
    parts.push(add(sceneRef, new THREE.InstancedMesh(geo, m, MAX)));
  });
  return parts;
}

function magnetParts(): THREE.InstancedMesh[] {
  const red = new THREE.MeshStandardMaterial({ color: 0xd42020, emissive: 0x5a0808, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.3 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.25, metalness: 0.9 });
  const k = SIZE.magnet / 1.3;
  const arc = new THREE.TorusGeometry(0.42, 0.15, 10, 20, Math.PI).rotateZ(Math.PI).scale(k, k, k);           // U opens downwards
  const legs = new THREE.BoxGeometry(0.3, 0.32, 0.3);
  const legL = legs.clone().translate(-0.42, -0.16, 0).scale(k, k, k); const legR = legs.clone().translate(0.42, -0.16, 0).scale(k, k, k);
  const tips = new THREE.BoxGeometry(0.31, 0.22, 0.31);
  const tipL = tips.clone().translate(-0.42, -0.43, 0).scale(k, k, k); const tipR = tips.clone().translate(0.42, -0.43, 0).scale(k, k, k);
  const merge = (geos: THREE.BufferGeometry[]) => {
    const parts = geos.map((g) => g.index ? g.toNonIndexed() : g);
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const sz = name === 'uv' ? 2 : 3; const arr = new Float32Array(n * sz); let o = 0;
      for (const g of parts) { const a = g.attributes[name] as THREE.BufferAttribute; arr.set(a.array as Float32Array, o); o += a.count * sz; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
    }
    return out;
  };
  return [add(sceneRef, new THREE.InstancedMesh(merge([arc, legL, legR]), red, MAX)), add(sceneRef, new THREE.InstancedMesh(merge([tipL, tipR]), silver, MAX))];
}

export function initPowerUpView(scene: THREE.Scene): void {
  sceneRef = scene;
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32); grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  for (const kind of ALL_PICKUP_KINDS) {
    const halo = add(scene, new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloTex, color: GLOW[kind], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), MAX));
    // Placeholder until the model arrives: a glowing octahedron.
    const placeholder = add(scene, new THREE.InstancedMesh(new THREE.OctahedronGeometry(SIZE[kind] * 0.35), new THREE.MeshStandardMaterial({ color: GLOW[kind], emissive: GLOW[kind], emissiveIntensity: 0.6 }), MAX));
    const entry: Kind = { parts: [placeholder], halo, count: 0 };
    kinds.set(kind, entry);
    if (kind === 'magnet') { scene.remove(placeholder); entry.parts = magnetParts(); continue; }
    const file = MODEL[kind];
    if (!file) continue;
    loadGLB(`/models/kenney/${file}.glb`).then((g) => {
      const recolor = kind === 'ruby' ? (m: THREE.MeshStandardMaterial) => { m.map = null; m.color.set(0xe0143c); m.emissive.set(0x7a0a20); m.emissiveIntensity = 0.7; m.roughness = 0.15; m.metalness = 0.2; m.transparent = true; m.opacity = 0.92; }
        : kind === 'boost' ? (m: THREE.MeshStandardMaterial) => { m.color.set(0xffd040); m.emissive.set(0xff9a00); m.emissiveIntensity = 0.6; m.metalness = 0.6; m.roughness = 0.3; }
        : (m: THREE.MeshStandardMaterial) => { m.emissive.set(0x1a4a5a); m.emissiveIntensity = 0.25; };
      const parts = bake(kind, g.scene, recolor);
      if (parts.length) { scene.remove(placeholder); entry.parts = parts; }
    }).catch(() => { /* keep the placeholder */ });
  }
}

export function updatePowerUpView(game: Game, timeMs: number, camera: THREE.Camera): void {
  for (const k of kinds.values()) k.count = 0;
  for (const p of game.spawner.powerUps) {
    if (p.taken) continue;
    const entry = kinds.get(p.kind); if (!entry) continue;
    for (const w of game.track.samplesAt(p.s, p.x, p.y + Math.sin(timeMs * 0.004 + p.id) * 0.15)) {
      if (entry.count >= MAX) break;
      // Shields and bolts face the runner (they are flat); magnets and gems just spin.
      const yaw = p.kind === 'magnet' || p.kind === 'ruby' ? timeMs * 0.0015 + p.id : Math.atan2(camera.position.x - w.x, camera.position.z - w.z) + Math.sin(timeMs * 0.002 + p.id) * 0.35;
      dummy.position.set(w.x, w.y + SIZE[p.kind] * 0.55, w.z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      for (const part of entry.parts) part.setMatrixAt(entry.count, dummy.matrix);
      dummy.position.set(w.x, w.y + 0.06, w.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1 + Math.sin(timeMs * 0.005 + p.id) * 0.1); dummy.updateMatrix();
      entry.halo.setMatrixAt(entry.count, dummy.matrix);
      entry.count++;
    }
  }
  for (const k of kinds.values()) { for (const m of [...k.parts, k.halo]) { m.count = k.count; m.instanceMatrix.needsUpdate = true; } }
}
