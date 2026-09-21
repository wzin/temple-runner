import * as THREE from 'three';
import type { Game } from '../core/game';
import { yawOf } from './util';
import { loadGLB } from './loading';

/**
 * The chasers: three Bengal tigers ("Geo Bengal Tiger", Poly by Google, CC-BY 3.0) galloping behind the runner.
 * The model is a static mesh, so the gallop is procedural: a bounding bob, a fore-aft rock and a slight sway per
 * stride, phase-shifted per tiger. They close in as the proximity meter rises (9 m → 2.5 m behind) and lunge
 * (a forward snap) when almost on you. The module keeps its old name so main.ts is untouched.
 */

const FAR = 9;    // metres behind the player at proximity 0 (just behind the camera, so hidden)
const NEAR = 2.5; // metres behind at proximity 100
const SPREAD = 1.7;
const HEIGHT = 1.3;       // height of the model after normalisation (a real tiger stands ~1 m at the shoulder; a little larger reads better)
const STRIDE = 3.2;       // metres per gallop cycle
/** Yaw applied to the model so its nose points along +z (the heading); tuned by eye against the screenshot. */
const MODEL_YAW = Math.PI;

interface Beast { group: THREE.Group; body: THREE.Group | null; lane: number; phase: number; lungeUntil: number }
const beasts: Beast[] = [];
let lastMs = 0;

function setup(beast: Beast, model: THREE.Group): void {
  // Clones arrive with the first tiger's scale and offset already applied: measure from identity so every tiger comes out the same size.
  model.scale.set(1, 1, 1); model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = HEIGHT / Math.max(0.01, size.y);
  const body = new THREE.Group();
  model.scale.setScalar(k);
  model.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.frustumCulled = false; o.castShadow = true;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => (m as THREE.MeshStandardMaterial).clone());
    for (const m of mats) { m.roughness = Math.max(0.7, m.roughness ?? 0.8); m.emissive.set(0x140800); }
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  body.rotation.y = MODEL_YAW;
  body.add(model);
  beast.body = body;
  beast.group.add(body);
}

export function initMonkeyView(scene: THREE.Scene): void {
  const load = loadGLB('/models/beasts/tiger.glb');
  [-1, 0, 1].forEach((lane, i) => {
    const beast: Beast = { group: new THREE.Group(), body: null, lane, phase: i * 2.1, lungeUntil: 0 };
    beast.group.name = `tiger${i}`;
    beast.group.visible = false;
    scene.add(beast.group);
    beasts.push(beast);
    load.then((g) => setup(beast, i === 0 ? g.scene : (g.scene.clone(true) as THREE.Group))).catch(() => { /* no chasers if the model is missing */ });
  });
}

export function updateMonkeyView(game: Game, timeMs: number): void {
  const dt = lastMs ? Math.min(0.1, (timeMs - lastMs) / 1000) : 0.016;
  lastMs = timeMs;
  void dt;
  const p = game.player;
  const behind = FAR - (FAR - NEAR) * (game.proximity / 100);
  const anchorS = (p.down && game.fallPose ? game.fallPose.s : p.s);
  const visible = !game.invulnerable && game.proximity > 0;
  const t = timeMs * 0.001;
  for (const b of beasts) {
    const lunge = timeMs < b.lungeUntil ? Math.sin((b.lungeUntil - timeMs) / 400 * Math.PI) : 0;
    const s = Math.max(0, anchorS - behind - Math.abs(b.lane) * 0.9 + lunge * 1.2);
    const x = b.lane * SPREAD + Math.sin(t * 1.6 + b.phase) * 0.25;
    const w = game.track.sample(s, x);
    // Gallop: one bound per STRIDE metres; the body rises and rocks nose-down on landing.
    const cycle = ((p.s / STRIDE) * Math.PI * 2 + b.phase) % (Math.PI * 2);
    const bob = Math.max(0, Math.sin(cycle)) * 0.22;
    b.group.position.set(w.x, w.y + bob, w.z);
    b.group.rotation.set(-Math.cos(cycle) * 0.18, yawOf(w.dir), Math.sin(cycle * 0.5 + b.phase) * 0.04);
    b.group.visible = visible && b.body !== null;
    if (game.proximity > 80 && timeMs > b.lungeUntil && Math.sin(t * 3 + b.phase * 2) > 0.97) b.lungeUntil = timeMs + 400;
  }
}
