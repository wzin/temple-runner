import { Rng, chance, int, pick } from './rng';
import { TRACK_HALF_WIDTH, Track } from './track';

export type ObstacleKind = 'fire' | 'log' | 'branch' | 'gap';

export interface Obstacle { id: number; kind: ObstacleKind; s0: number; s1: number; x0: number; x1: number; y0: number; y1: number; hit: boolean; passed: boolean }
export interface Coin { id: number; s: number; x: number; y: number; collected: boolean }

/** y ranges are chosen against the player: standing 0–1.8, sliding 0–0.9, jump apex 2.2. */
export const OBSTACLES: Record<ObstacleKind, { depth: number; y0: number; y1: number; lane: boolean; fatal: boolean }> = {
  fire:   { depth: 1.0, y0: 0.0,  y1: 0.8, lane: true,  fatal: false }, // jump over; sliding still burns
  log:    { depth: 1.2, y0: 1.0,  y1: 1.6, lane: false, fatal: false }, // slide under or jump over
  branch: { depth: 0.6, y0: 1.0,  y1: 2.6, lane: false, fatal: false }, // must slide
  gap:    { depth: 3.0, y0: -10,  y1: 0.0, lane: false, fatal: true  }, // must jump; touching the floor here = fall
};

export const LANES = [-1.5, 0, 1.5];
export const COIN_SPACING = 1.5;

export interface SpawnerOptions { chunk: number; firstObstacleAt: number; obstacleSpacing: number; turnMargin: number; obstacleChance: number; coinChance: number }
const DEFAULTS: SpawnerOptions = { chunk: 12, firstObstacleAt: 60, obstacleSpacing: 25, turnMargin: 10, obstacleChance: 0.45, coinChance: 0.55 };

export class Spawner {
  readonly coins: Coin[] = [];
  readonly obstacles: Obstacle[] = [];
  private cursor = 0;
  private lastObstacleS = -Infinity;
  private nextId = 0;
  private readonly opts: SpawnerOptions;

  constructor(private readonly rng: Rng, private readonly track: Track, opts: Partial<SpawnerOptions> = {}) { this.opts = { ...DEFAULTS, ...opts }; }

  fill(upTo: number): void {
    while (this.cursor < upTo) { this.layChunk(this.cursor); this.cursor += this.opts.chunk; }
  }

  prune(behind: number): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) if (this.obstacles[i].s1 < behind) this.obstacles.splice(i, 1);
    for (let i = this.coins.length - 1; i >= 0; i--) if (this.coins[i].s < behind) this.coins.splice(i, 1);
  }

  reset(): void { this.coins.length = 0; this.obstacles.length = 0; this.cursor = 0; this.lastObstacleS = -Infinity; }

  private layChunk(s: number): void {
    const o = this.opts;
    const canObstacle = s >= o.firstObstacleAt && s - this.lastObstacleS >= o.obstacleSpacing && !this.track.nearTurnWindow(s, o.turnMargin);
    if (canObstacle && chance(this.rng, o.obstacleChance)) { this.layObstacle(s); return; }
    if (chance(this.rng, o.coinChance)) this.layCoinRun(s);
  }

  private layObstacle(s: number): void {
    const kind = pick(this.rng, ['fire', 'log', 'branch', 'gap'] as const);
    const spec = OBSTACLES[kind];
    const lane = spec.lane ? pick(this.rng, LANES) : 0;
    const half = spec.lane ? 1 : TRACK_HALF_WIDTH;
    this.obstacles.push({ id: this.nextId++, kind, s0: s, s1: s + spec.depth, x0: lane - half, x1: lane + half, y0: spec.y0, y1: spec.y1, hit: false, passed: false });
    this.lastObstacleS = s;
  }

  private layCoinRun(s: number): void {
    const n = int(this.rng, 5, 8);
    const lane = pick(this.rng, LANES);
    const arc = chance(this.rng, 0.3);
    const end = s + (n - 1) * COIN_SPACING;
    if (this.track.nearTurnWindow(s, 2) || this.track.nearTurnWindow(end, 2)) return;
    for (const ob of this.obstacles) if (end >= ob.s0 - 1 && s <= ob.s1 + 1) return;
    for (let i = 0; i < n; i++) {
      const y = arc ? 0.6 + 1.6 * Math.sin((Math.PI * i) / (n - 1)) : 0.6;
      this.coins.push({ id: this.nextId++, s: s + i * COIN_SPACING, x: lane, y, collected: false });
    }
  }
}
