import * as THREE from 'three';
import type { Game } from '../core/game';
import { smooth } from './util';

export let camera: THREE.PerspectiveCamera;

const BEHIND = 11;
const HEIGHT = 6.5;
const AHEAD = 6;
const RATE = 6;

const targetPos = new THREE.Vector3();
const targetLook = new THREE.Vector3();
const currentLook = new THREE.Vector3();

// Reactions driven by game events; each decays on its own.
let roll = 0;          // radians, from turns
let dip = 0;           // metres, from landings
let shake = 0;         // metres, from hits
let seed = 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };

export function cameraTurn(dir: 'left' | 'right'): void { roll = dir === 'left' ? 0.11 : -0.11; }
export function cameraLand(): void { dip = 0.45; }
export function cameraHit(): void { shake = 0.25; }

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
  roll *= Math.exp(-4 * dt);
  dip *= Math.exp(-6 * dt);
  shake *= Math.exp(-8 * dt);
  targetPos.y -= dip;
  targetPos.x += rand() * shake; targetPos.y += rand() * shake;
  camera.position.lerp(targetPos, k);
  currentLook.lerp(targetLook, k);
  camera.lookAt(currentLook);
  camera.rotateZ(roll);
}
