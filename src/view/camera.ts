import * as THREE from 'three';
import type { Game } from '../core/game';
import { smooth } from './util';

export let camera: THREE.PerspectiveCamera;

const BEHIND = 8;
const HEIGHT = 5.5;
const AHEAD = 6;
const RATE = 6;

const targetPos = new THREE.Vector3();
const targetLook = new THREE.Vector3();
const currentLook = new THREE.Vector3();

export function initCamera(): void {
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

function computeTargets(game: Game): void {
  const p = game.player;
  if (p.down && game.fallPose) {
    const fp = game.fallPose;
    targetPos.set(fp.x - fp.dir.x * BEHIND, HEIGHT, fp.z - fp.dir.z * BEHIND);
    targetLook.set(fp.x + fp.dir.x * 4, Math.max(p.y, -12) + 1, fp.z + fp.dir.z * 4);
    return;
  }
  const back = game.track.sample(Math.max(0, p.s - BEHIND), p.x * 0.3);
  const ahead = game.track.sample(p.s + AHEAD, p.x * 0.5);
  targetPos.set(back.x, HEIGHT, back.z);
  targetLook.set(ahead.x, 1.2, ahead.z);
}

export function snapCamera(game: Game): void {
  computeTargets(game);
  camera.position.copy(targetPos);
  currentLook.copy(targetLook);
  camera.lookAt(currentLook);
}

export function updateCamera(game: Game, dt: number): void {
  computeTargets(game);
  const k = smooth(RATE, dt);
  camera.position.lerp(targetPos, k);
  currentLook.lerp(targetLook, k);
  camera.lookAt(currentLook);
}
