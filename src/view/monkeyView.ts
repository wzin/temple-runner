import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Game } from '../core/game';
import { yawOf } from './util';

/**
 * The chasers: three big cats — the Quaternius wolf model (CC0) galloping behind the runner, the middle one
 * recoloured black like a panther. (Wojtek asked to keep "the cat" of the two beasts and have three of them.)
 * They close in as the proximity meter rises (9 m → 2.5 m behind) and snap when almost on you.
 * The module keeps its old name so main.ts is untouched.
 */

const FAR = 9;    // metres behind the player at proximity 0 (just behind the camera, so hidden)
const NEAR = 2.5; // metres behind at proximity 100
const SPREAD = 1.7;

interface Beast { group: THREE.Group; mixer: THREE.AnimationMixer | null; run?: THREE.AnimationAction; attack?: THREE.AnimationAction; runDuration: number; attackUntil: number }
interface Spec { file: string; height: number; run: string; attack: string; lane: number; tint?: number }
const SPECS: Spec[] = [
  { file: 'wolf', height: 0.85, run: 'Gallop', attack: 'Attack', lane: -1 },
  { file: 'wolf', height: 0.9, run: 'Gallop', attack: 'Attack', lane: 0, tint: 0x1a1a1e },
  { file: 'wolf', height: 0.85, run: 'Gallop', attack: 'Attack', lane: 1, tint: 0x6a5238 },
];
const beasts: Beast[] = [];
let lastMs = 0;

function setup(beast: Beast, spec: Spec, scene: THREE.Group, clips: THREE.AnimationClip[]): void {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const k = spec.height / Math.max(0.01, size.y);
  scene.scale.setScalar(k);
  scene.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.frustumCulled = false; o.castShadow = true;
    // Each cat gets its own coat: clone the body materials so a tint does not leak into the others.
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => (m as THREE.MeshStandardMaterial).clone());
    for (const m of mats) if (spec.tint !== undefined && /Main/.test(m.name)) m.color.set(spec.tint).multiplyScalar(m.name.includes('Light') ? 1.6 : 1);
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  beast.group.add(scene);
  beast.mixer = new THREE.AnimationMixer(scene);
  const find = (n: string) => clips.find((c) => c.name.replace(/^.*\|/, '') === n);
  const run = find(spec.run); const attack = find(spec.attack);
  if (run) { beast.run = beast.mixer.clipAction(run); beast.runDuration = run.duration; beast.run.play(); }
  if (attack) { beast.attack = beast.mixer.clipAction(attack); beast.attack.setLoop(THREE.LoopOnce, 1); beast.attack.clampWhenFinished = false; }
}

export function initMonkeyView(scene: THREE.Scene): void {
  const loader = new GLTFLoader();
  const cache = new Map<string, Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }>>();
  SPECS.forEach((spec, i) => {
    const beast: Beast = { group: new THREE.Group(), mixer: null, runDuration: 1, attackUntil: 0 };
    beast.group.visible = false;
    scene.add(beast.group);
    beasts.push(beast);
    if (!cache.has(spec.file)) cache.set(spec.file, new Promise((resolve, reject) => loader.load(`/models/beasts/${spec.file}.glb`, (g) => resolve({ scene: g.scene, clips: g.animations }), undefined, reject)));
    cache.get(spec.file)!.then(({ scene: src, clips }) => {
      // Every cat after the first is a skeleton-aware clone of the shared model.
      const model = i === 0 ? src : (cloneSkeleton(src) as THREE.Group);
      setup(beast, spec, model, clips);
    }).catch(() => { /* no chasers if the model is missing */ });
  });
}

export function updateMonkeyView(game: Game, timeMs: number): void {
  const dt = lastMs ? Math.min(0.1, (timeMs - lastMs) / 1000) : 0.016;
  lastMs = timeMs;
  const p = game.player;
  const behind = FAR - (FAR - NEAR) * (game.proximity / 100);
  const anchorS = (p.down && game.fallPose ? game.fallPose.s : p.s);
  const visible = !game.invulnerable && game.proximity > 0;
  beasts.forEach((b, i) => {
    const spec = SPECS[i];
    const s = Math.max(0, anchorS - behind - Math.abs(spec.lane) * 0.9);
    const x = spec.lane * SPREAD + Math.sin(timeMs * 0.0016 + i) * 0.25;
    const w = game.track.sample(s, x);
    b.group.position.set(w.x, w.y, w.z);
    b.group.rotation.set(0, yawOf(w.dir), 0);
    b.group.visible = visible && b.mixer !== null;
    if (!b.mixer) return;
    // Gallop matched to the runner's speed (a wolf's gallop clip covers roughly 7 m per cycle).
    if (b.run) b.run.timeScale = Math.max(0.6, (p.speed / 7) * b.runDuration);
    if (b.attack && game.proximity > 80 && timeMs > b.attackUntil && Math.sin(timeMs * 0.003 + i * 2) > 0.97) {
      b.attack.reset().play(); b.attackUntil = timeMs + 2500;
    }
    b.mixer.update(dt);
  });
}
