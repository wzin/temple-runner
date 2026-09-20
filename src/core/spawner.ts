import { POWERUP_KINDS, PowerUp } from './powerups';
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
  gap:    { depth: 4.0, y0: -10,  y1: 0.0, lane: false, fatal: true  }, // must jump; 4 m = two floor slabs, so the hole matches the collision
};

export const LANES = [-1.5, 0, 1.5];
export const COIN_SPACING = 1.5;

/** Obstacle arrangements. Each needs a minimum distance before it can appear. */
export type PatternKind = 'single' | 'twoLaneFire' | 'gapThenBranch' | 'logWithArc' | 'laneFireRow';
export const PATTERNS: Record<PatternKind, { minS: number; length: number }> = {
  single:        { minS: 0,   length: 3 },
  logWithArc:    { minS: 100, length: 6 },
  twoLaneFire:   { minS: 200, length: 1 },
  gapThenBranch: { minS: 400, length: 11 },
  laneFireRow:   { minS: 600, length: 9 },
};

export interface SpawnTuning { obstacleChance: number; obstacleSpacing: number }
export interface SpawnerOptions {
  chunk: number;
  firstObstacleAt: number;
  turnMargin: number;
  coinChance: number;
  powerUpChance: number;
  firstPowerUpAt: number;
  tuning: (s: number) => SpawnTuning;
}
const DEFAULTS: SpawnerOptions = {
  chunk: 12, firstObstacleAt: 60, turnMargin: 10, coinChance: 0.55, powerUpChance: 0.08, firstPowerUpAt: 120,
  tuning: () => ({ obstacleChance: 0.45, obstacleSpacing: 25 }),
};

export class Spawner {
  readonly coins: Coin[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly powerUps: PowerUp[] = [];
  private cursor = 0;
  private lastObstacleEnd = -Infinity;
  private nextId = 0;
  private readonly opts: SpawnerOptions;

  constructor(private readonly rng: Rng, private readonly track: Track, opts: Partial<SpawnerOptions> = {}) { this.opts = { ...DEFAULTS, ...opts }; }

  fill(upTo: number): void {
    const limit = Math.min(upTo, this.track.end() - this.opts.chunk);
    while (this.cursor < limit) { this.layChunk(this.cursor); this.cursor += this.opts.chunk; }
  }

  prune(behind: number): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) if (this.obstacles[i].s1 < behind) this.obstacles.splice(i, 1);
    for (let i = this.coins.length - 1; i >= 0; i--) if (this.coins[i].s < behind) this.coins.splice(i, 1);
    for (let i = this.powerUps.length - 1; i >= 0; i--) if (this.powerUps[i].s < behind) this.powerUps.splice(i, 1);
  }

  reset(): void { this.coins.length = 0; this.obstacles.length = 0; this.powerUps.length = 0; this.cursor = 0; this.lastObstacleEnd = -Infinity; }

  private layChunk(s: number): void {
    const o = this.opts;
    const t = o.tuning(s);
    const pattern = this.choosePattern(s);
    const len = PATTERNS[pattern].length;
    const canObstacle = s >= o.firstObstacleAt && s - this.lastObstacleEnd >= t.obstacleSpacing
      && !this.track.nearTurnWindow(s, o.turnMargin) && !this.track.nearTurnWindow(s + len, o.turnMargin);
    if (canObstacle && chance(this.rng, t.obstacleChance)) { this.layPattern(pattern, s); return; }
    if (s >= o.firstPowerUpAt && !this.powerUps.some((p) => !p.taken && p.s > s - 200) && chance(this.rng, o.powerUpChance)) { this.layPowerUp(s); return; }
    if (chance(this.rng, o.coinChance)) this.layCoinRun(s);
  }

  private choosePattern(s: number): PatternKind {
    const available = (Object.keys(PATTERNS) as PatternKind[]).filter((k) => s >= PATTERNS[k].minS);
    // Singles stay common so patterns feel like set pieces.
    return chance(this.rng, 0.5) ? 'single' : pick(this.rng, available);
  }

  private place(kind: ObstacleKind, s: number, lane: number | null): Obstacle {
    const spec = OBSTACLES[kind];
    const centre = spec.lane ? (lane ?? pick(this.rng, LANES)) : 0;
    const half = spec.lane ? 1 : TRACK_HALF_WIDTH;
    const ob: Obstacle = { id: this.nextId++, kind, s0: s, s1: s + spec.depth, x0: centre - half, x1: centre + half, y0: spec.y0, y1: spec.y1, hit: false, passed: false };
    this.obstacles.push(ob);
    this.lastObstacleEnd = Math.max(this.lastObstacleEnd, ob.s1);
    return ob;
  }

  private layPattern(pattern: PatternKind, s: number): void {
    switch (pattern) {
      case 'single': {
        const kind = pick(this.rng, ['fire', 'log', 'branch', 'gap'] as const);
        this.place(kind, s, null);
        return;
      }
      case 'twoLaneFire': {
        const open = int(this.rng, 0, 2);
        LANES.forEach((lane, i) => { if (i !== open) this.place('fire', s, lane); });
        return;
      }
      case 'gapThenBranch': {
        this.place('gap', s, null);
        this.place('branch', s + OBSTACLES.gap.depth + 7, null);
        return;
      }
      case 'logWithArc': {
        this.place('log', s + 3, null);
        const lane = pick(this.rng, LANES);
        // Five coins arcing over the log; the middle one sits above the jump apex's reach only if you jump early.
        for (let i = 0; i < 5; i++) {
          const y = 0.6 + 1.7 * Math.sin((Math.PI * i) / 4);
          this.coins.push({ id: this.nextId++, s: s + i * COIN_SPACING, x: lane, y, collected: false });
        }
        return;
      }
      case 'laneFireRow': {
        const order = [...LANES];
        for (let i = order.length - 1; i > 0; i--) { const j = int(this.rng, 0, i); [order[i], order[j]] = [order[j], order[i]]; }
        order.forEach((lane, i) => this.place('fire', s + i * 4, lane));
        return;
      }
    }
  }

  private layPowerUp(s: number): void {
    if (this.track.nearTurnWindow(s, 4)) return;
    for (const ob of this.obstacles) if (s >= ob.s0 - 2 && s <= ob.s1 + 2) return;
    this.powerUps.push({ id: this.nextId++, kind: pick(this.rng, POWERUP_KINDS), s, x: pick(this.rng, LANES), y: 1.0, taken: false });
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
