import * as THREE from 'three';
import type { Game } from '../core/game';
import { pbrMaterial, remoteSet } from './textures';
import { yawOf } from './util';

/** Low-poly runner: torso, head, swinging arms and legs. Animation is driven by distance, not time. */

let group: THREE.Group;
let rig: THREE.Group;
let torso: THREE.Mesh;
let head: THREE.Mesh;
let headBack: THREE.Mesh;
let armL: THREE.Group; let armR: THREE.Group;
let legL: THREE.Group; let legR: THREE.Group;
let shieldMesh: THREE.Mesh;
let boostAura: THREE.Mesh;
let lamp: THREE.PointLight;
let bodyMaterials: THREE.MeshStandardMaterial[] = [];

/** Selectable skins: each has a head wrap (face), tunic front/back panels and skin/hair tones. */
export interface Skin { id: string; name: string; tone: number; pants: number; hair: number }
export const SKINS: Skin[] = [
  { id: 'runner', name: 'Runner', tone: 0xe0b08a, pants: 0x6a5a4a, hair: 0x1e1a1a },
  { id: 'runner-f', name: 'Runner (F)', tone: 0xd9a57f, pants: 0x4a5a6a, hair: 0x241a12 },
  { id: 'guardian', name: 'Guardian', tone: 0xc9906a, pants: 0x3a3a3a, hair: 0x2a1a0a },
];
const SKIN_KEY = 'temple-runner.skin';
export function currentSkinId(): string { try { return localStorage.getItem(SKIN_KEY) || 'runner'; } catch { return 'runner'; } }
let limbMeshes: THREE.Mesh[] = [];
let squash = 0; // 0..1, decays after landing

const STRIDE = 7.5; // metres per full run cycle (~2 cycles/s at base speed)

export function playerLanded(): void { squash = 1; }

function limb(length: number, radius: number, material: THREE.Material, pivotY: number, x: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, pivotY, 0);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
  mesh.position.y = -length / 2 - radius; // hang from the pivot
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

export function initPlayerView(scene: THREE.Scene): void {
  group = new THREE.Group();
  group.rotation.order = 'YXZ';
  rig = new THREE.Group();
  group.add(rig);

  const placeholder = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true });
  torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), placeholder);
  torso.position.y = 1.1; torso.castShadow = true;
  rig.add(torso);
  // Head: front hemisphere (phi 0..π covers z ≥ 0, u = 0.5 at +z) carries the portrait; the back is hair.
  head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI), placeholder);
  head.position.y = 1.62; head.castShadow = true;
  rig.add(head);
  headBack = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12, Math.PI, Math.PI), placeholder);
  headBack.position.y = 1.62;
  rig.add(headBack);
  armL = limb(0.5, 0.09, placeholder, 1.38, -0.36); armR = limb(0.5, 0.09, placeholder, 1.38, 0.36);
  legL = limb(0.55, 0.11, placeholder, 0.8, -0.15); legR = limb(0.55, 0.11, placeholder, 0.8, 0.15);
  rig.add(armL, armR, legL, legR);
  limbMeshes = [armL, armR, legL, legR].map((g) => g.children[0] as THREE.Mesh);
  setSkin(currentSkinId());

  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0x5fd8ff, emissive: 0x3ab8ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.22, depthWrite: false }));
  shieldMesh.position.y = 1.0;
  shieldMesh.visible = false;
  group.add(shieldMesh);

  boostAura = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  boostAura.position.y = 1.0;
  boostAura.visible = false;
  group.add(boostAura);

  // Warm lamp travelling with the runner so the PBR relief reads up close.
  lamp = new THREE.PointLight(0xffc48a, 7, 11, 2);
  lamp.position.set(0, 2.6, -1.5);
  group.add(lamp);

  scene.add(group);
}

/** Swap every body material for the chosen skin; safe to call any time (also from the menu). */
export function setSkin(id: string): void {
  const skin = SKINS.find((sk) => sk.id === id) ?? SKINS[0];
  try { localStorage.setItem(SKIN_KEY, skin.id); } catch { /* ignore */ }
  const face = remoteSet(`skin-${skin.id}-face`, skin.tone);
  const front = remoteSet(`skin-${skin.id}-front`, 0x8a3a2a);
  const back = remoteSet(`skin-${skin.id}-back`, 0x7a3a2a);
  const weave = remoteSet('tunic', 0x8a3a2a); for (const t of [weave.map, weave.normalMap, weave.roughnessMap]) t.repeat.set(1, 2);
  const skinTex = remoteSet('skin', skin.tone);
  const mk = (m: ReturnType<typeof remoteSet>, extra: THREE.MeshStandardMaterialParameters = {}) => pbrMaterial(m, { color: 0xffffff, transparent: true, ...extra });
  const side = mk(weave); const frontM = mk(front); const backM = mk(back);
  const headM = new THREE.MeshStandardMaterial({ map: face.map, color: 0xffffff, roughness: 0.7, transparent: true });
  const skinM = mk(skinTex, { color: 0xffffff });
  const pantsM = mk(weave, { color: skin.pants });
  // BoxGeometry groups: +x, -x, +y, -y, +z (front), -z (back)
  torso.material = [side, side, side, side, frontM, backM];
  head.material = headM;
  headBack.material = new THREE.MeshStandardMaterial({ color: skin.hair, roughness: 0.9, transparent: true });
  limbMeshes[0].material = skinM; limbMeshes[1].material = skinM; limbMeshes[2].material = pantsM; limbMeshes[3].material = pantsM;
  bodyMaterials = [side, frontM, backM, headM, skinM, pantsM, headBack.material as THREE.MeshStandardMaterial];
}

export function updatePlayerView(game: Game, timeMs: number): void {
  const p = game.player;
  if (p.down && game.fallPose) {
    const elapsed = p.cfg.fallDuration - Math.max(0, p.fallTimer);
    const run = Math.min(p.cfg.speed * elapsed, 3);
    const fp = game.fallPose;
    group.position.set(fp.x + fp.dir.x * run, p.y, fp.z + fp.dir.z * run);
    group.rotation.set(-elapsed * 2.5, yawOf(fp.dir), elapsed * 1.5);
    armL.rotation.x = armR.rotation.x = -2.4; legL.rotation.x = legR.rotation.x = 0.6;
    return;
  }

  const lift = game.boosting ? 1.2 : 0;
  const w = game.track.sample(p.s, p.x, p.y + lift);
  group.position.set(w.x, w.y, w.z);
  const speedRatio = p.speed / p.cfg.speed;
  const lean = 0.08 + (speedRatio - 1) * 0.12;
  group.rotation.set(-lean, yawOf(w.dir), p.stumbleTimer > 0 ? Math.sin(timeMs * 0.03) * 0.25 : 0);

  squash *= Math.exp(-0.012 * 16.7);
  const sliding = p.state === 'sliding';
  const jumping = p.state === 'jumping';
  const phase = (p.s / STRIDE) * Math.PI * 2;
  const swing = jumping || sliding ? 0 : Math.sin(phase);

  rig.scale.set(1 + 0.15 * squash, 1 - 0.22 * squash, 1 + 0.15 * squash);
  rig.position.y = sliding ? -0.55 : 0;
  rig.rotation.x = sliding ? -0.9 : 0;

  if (jumping) {
    armL.rotation.x = armR.rotation.x = -2.6;      // arms up
    legL.rotation.x = 0.9; legR.rotation.x = -0.4;  // tucked
  } else if (sliding) {
    armL.rotation.x = armR.rotation.x = -0.4;
    legL.rotation.x = legR.rotation.x = 0.3;
  } else {
    armL.rotation.x = swing * 0.7; armR.rotation.x = -swing * 0.7;
    legL.rotation.x = -swing * 0.8; legR.rotation.x = swing * 0.8;
  }
  const bob = jumping || sliding ? 0 : Math.abs(Math.cos(phase)) * 0.04;
  torso.position.y = 1.1 + bob; head.position.y = 1.62 + bob;

  shieldMesh.visible = game.shield;
  shieldMesh.rotation.y = timeMs * 0.001;
  // Invulnerable (boost or its grace): ghostly runner with a pulsing aura.
  const ghost = game.invulnerable;
  const opacity = ghost ? 0.45 + Math.sin(timeMs * 0.02) * 0.1 : 1;
  for (const m of bodyMaterials) m.opacity = opacity;
  boostAura.visible = ghost;
  boostAura.scale.setScalar(1 + Math.sin(timeMs * 0.012) * 0.08);
  lamp.intensity = 6.5 + Math.sin(timeMs * 0.02) * 0.8;
}
