import * as THREE from 'three';
import type { Game } from '../core/game';
import { yawOf } from './util';

let group: THREE.Group;
let body: THREE.Mesh;
let head: THREE.Mesh;

export function initPlayerView(scene: THREE.Scene): void {
  group = new THREE.Group();
  group.rotation.order = 'YXZ'; // yaw first, then pitch/roll for tumble and stumble
  const mat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x2d8f4e, emissiveIntensity: 0.2 });
  body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12), mat);
  body.position.y = 0.8;
  body.castShadow = true;
  group.add(body);
  head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), mat);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
  for (const side of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
    eye.position.set(side, 1.65, 0.25);
    group.add(eye);
  }
  scene.add(group);
}

export function updatePlayerView(game: Game, timeMs: number): void {
  const p = game.player;
  if (p.down && game.fallPose) {
    // Keep running straight from the frozen pose while dropping, then tumble.
    const elapsed = p.cfg.fallDuration - Math.max(0, p.fallTimer);
    const run = p.cfg.speed * Math.min(elapsed, 0.6);
    const fp = game.fallPose;
    group.position.set(fp.x + fp.dir.x * run, p.y, fp.z + fp.dir.z * run);
    group.rotation.set(-elapsed * 2.5, yawOf(fp.dir), elapsed * 1.5);
    return;
  }

  const s = game.track.sample(p.s, p.x, p.y);
  group.position.set(s.x, s.y, s.z);
  group.rotation.set(0, yawOf(s.dir), p.stumbleTimer > 0 ? Math.sin(timeMs * 0.03) * 0.25 : 0);

  const sliding = p.state === 'sliding';
  body.scale.y = sliding ? 0.5 : 1;
  const bob = p.state === 'running' ? Math.sin(timeMs * 0.015) * 0.05 : 0;
  body.position.y = (sliding ? 0.4 : 0.8) + bob;
  head.position.y = (sliding ? 0.9 : 1.6) + bob;
}
