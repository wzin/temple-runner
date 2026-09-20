import * as THREE from 'three';
import type { Game } from '../core/game';
import { yawOf } from './util';

/** Low-poly runner: torso, head, swinging arms and legs. Animation is driven by distance, not time. */

let group: THREE.Group;
let rig: THREE.Group;
let torso: THREE.Mesh;
let head: THREE.Mesh;
let armL: THREE.Group; let armR: THREE.Group;
let legL: THREE.Group; let legR: THREE.Group;
let shieldMesh: THREE.Mesh;
let lamp: THREE.PointLight;
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

  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b08a, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x3fbf6f, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x5a3b2a, roughness: 0.9 });

  torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), shirt);
  torso.position.y = 1.1; torso.castShadow = true;
  rig.add(torso);
  head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skin);
  head.position.y = 1.62; head.castShadow = true;
  rig.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), pants);
  hair.position.y = 1.66;
  rig.add(hair);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const side of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
    eye.position.set(side, 1.64, 0.21);
    rig.add(eye);
  }
  armL = limb(0.5, 0.09, skin, 1.38, -0.36); armR = limb(0.5, 0.09, skin, 1.38, 0.36);
  legL = limb(0.55, 0.11, pants, 0.8, -0.15); legR = limb(0.55, 0.11, pants, 0.8, 0.15);
  rig.add(armL, armR, legL, legR);

  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.6, transparent: true, opacity: 0.25 }));
  shieldMesh.position.y = 1.0;
  shieldMesh.visible = false;
  group.add(shieldMesh);

  // Warm lamp travelling with the runner so the PBR relief reads up close.
  lamp = new THREE.PointLight(0xffc48a, 18, 14, 2);
  lamp.position.set(0, 2.6, -1.5);
  group.add(lamp);

  scene.add(group);
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
  lamp.intensity = 16 + Math.sin(timeMs * 0.02) * 2;
}
