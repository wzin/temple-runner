import * as THREE from 'three';
import type { Game } from '../core/game';

/**
 * One pooled point system per look (additive glow). Fire obstacles emit rising
 * embers every frame; coin pickups burst gold sparks. Pure view code.
 */

const POOL = 700;

class Pool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel = new Float32Array(POOL * 3);
  private readonly life = new Float32Array(POOL);
  private readonly maxLife = new Float32Array(POOL);
  private next = 0;

  constructor(size: number, private readonly gravity: number) {
    this.pos = new Float32Array(POOL * 3);
    this.col = new Float32Array(POOL * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < POOL; i++) this.pos[i * 3 + 1] = -1000; // parked
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number): void {
    const i = this.next; this.next = (this.next + 1) % POOL;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b], i * 3);
    this.life[i] = life; this.maxLife[i] = life;
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1000; continue; }
      const k = i * 3;
      this.vel[k + 1] += this.gravity * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.col[k] *= 0.985; this.col[k + 1] *= 0.97; this.col[k + 2] *= 0.95; // cool down towards red
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

let embers: Pool;
let sparks: Pool;
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export function initParticles(scene: THREE.Scene): void {
  embers = new Pool(0.28, 0.6);
  sparks = new Pool(0.16, -9);
  scene.add(embers.points, sparks.points);
}

/** Gold burst where a coin was picked up. */
export function coinBurst(game: Game): void {
  const p = game.player;
  const w = game.track.sample(p.s, p.x, p.y + 0.8);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2; const sp = 1.5 + rnd() * 2.5;
    sparks.emit(w.x, w.y, w.z, Math.cos(a) * sp, 2 + rnd() * 3, Math.sin(a) * sp, 0.35 + rnd() * 0.3, 1.0, 0.85, 0.3);
  }
}

export function updateParticles(game: Game, dt: number): void {
  const p = game.player;
  for (const o of game.spawner.obstacles) {
    if (o.kind !== 'fire' || o.hit) continue;
    if (o.s0 < p.s - 15 || o.s0 > p.s + 60) continue;
    if (rnd() < 0.7) {
      const s = o.s0 + rnd() * (o.s1 - o.s0);
      const x = o.x0 + rnd() * (o.x1 - o.x0);
      for (const w of game.track.samplesAt(s, x, 0.3 + rnd() * 0.5)) {
        embers.emit(w.x, w.y, w.z, (rnd() - 0.5) * 0.6, 1.2 + rnd() * 1.5, (rnd() - 0.5) * 0.6, 0.5 + rnd() * 0.5, 1.0, 0.55 + rnd() * 0.3, 0.1);
      }
    }
  }
  embers.update(dt);
  sparks.update(dt);
}
