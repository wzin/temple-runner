import * as THREE from 'three';
import type { Game } from '../core/game';
import { yawOf } from './util';

const COUNT = 3;
const SPREAD = 1.6;
const FAR = 9;    // metres behind the player at proximity 0 (just behind the camera, so hidden)
const NEAR = 2.5; // metres behind at proximity 100
const monkeys: THREE.Group[] = [];

function makeMonkey(): THREE.Group {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), fur);
  body.position.y = 0.75; body.scale.y = 1.2; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), fur);
  head.position.y = 1.55; head.castShadow = true;
  g.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1 });
  for (const side of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
    eye.position.set(side, 1.6, 0.32);
    g.add(eye);
  }
  for (const side of [-0.6, 0.6]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 6), fur);
    arm.position.set(side, 0.9, 0.2); arm.rotation.x = -0.9;
    g.add(arm);
  }
  return g;
}

export function initMonkeyView(scene: THREE.Scene): void {
  for (let i = 0; i < COUNT; i++) { const m = makeMonkey(); monkeys.push(m); scene.add(m); }
}

export function updateMonkeyView(game: Game, timeMs: number): void {
  const p = game.player;
  const behind = FAR - (FAR - NEAR) * (game.proximity / 100);
  const anchorS = (p.down && game.fallPose ? game.fallPose.s : p.s);
  for (let i = 0; i < COUNT; i++) {
    const m = monkeys[i];
    const s = Math.max(0, anchorS - behind - i * 1.2);
    const x = (i - 1) * SPREAD + Math.sin(timeMs * 0.002 + i) * 0.2;
    const w = game.track.sample(s, x);
    const hop = Math.abs(Math.sin(timeMs * 0.012 + i * 2)) * 0.35;
    m.position.set(w.x, hop, w.z);
    m.rotation.set(0, yawOf(w.dir), 0);
    m.visible = game.proximity > 0 || behind < FAR;
  }
}
