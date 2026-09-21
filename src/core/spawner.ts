import { densityForceDistance } from './difficulty';
import { POWERUP_KINDS, PowerUp } from './powerups';
import { Rng, chance, int, pick } from './rng';
import { TRACK_HALF_WIDTH, Track } from './track';

export type ObstacleKind = 'fire' | 'log' | 'branch' | 'gap' | 'halfgap' | 'chasm' | 'spikegate';

export interface Obstacle { id: number; kind: ObstacleKind; s0: number; s1: number; x0: number; x1: number; y0: number; y1: number; hit: boolean; passed: boolean; /** chasm pieces: centre x of the plank bridge that spans the whole hole */ plankX?: number }
export interface Coin { id: number; s: number; x: number; y: number; collected: boolean; value: number }

/** y ranges are chosen against the player: standing 0–1.8, sliding 0–0.9, jump apex 2.2. */
export const OBSTACLES: Record<ObstacleKind, { depth: number; y0: number; y1: number; lane: boolean; fatal: boolean }> = {
  fire:   { depth: 1.0, y0: 0.0,  y1: 0.8, lane: true,  fatal: false }, // jump over; sliding still burns
  log:    { depth: 1.2, y0: 1.0,  y1: 1.6, lane: false, fatal: false }, // slide under or jump over
  branch: { depth: 0.6, y0: 1.0,  y1: 2.6, lane: false, fatal: false }, // must slide
  gap:    { depth: 4.0, y0: -10,  y1: 0.0, lane: false, fatal: true  }, // must jump; 4 m = two floor slabs, so the hole matches the collision
  halfgap: { depth: 8.0, y0: -10, y1: 0.0, lane: false, fatal: true }, // one side of the ridge is gone for four slabs: run along the other wall
  chasm:   { depth: 6.0, y0: -10, y1: 0.0, lane: false, fatal: true }, // full break with a plank bridge on one lane; laid as two pieces either side of the planks
  spikegate: { depth: 0.6, y0: 1.0, y1: 2.6, lane: false, fatal: true }, // spiked gate: pass under it or die
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

export interface SpawnTuning { obstacleChance: number; obstacleSpacing: number; speed: number }
/** Airtime of a jump (from player physics: 2·v/g with v = 11.5, g = 30). Pattern gaps that follow a jump scale with it. */
export const JUMP_AIRTIME = 0.77;
export interface SpawnerOptions {
  chunk: number;
  firstObstacleAt: number;
  turnMargin: number;
  coinChance: number;
  powerUpChance: number;
  /** Expected metres between ruby gems (~2–3 minutes of running). */
  rubyEvery: number; firstRubyAt: number;
  firstPowerUpAt: number;
  /** Seconds of running after a corner before the first obstacle may appear. */
  afterCornerSeconds: number;
  tuning: (s: number) => SpawnTuning;
}
const DEFAULTS: SpawnerOptions = {
  chunk: 4, firstObstacleAt: 60, turnMargin: 8, coinChance: 0.35, powerUpChance: 0.03, firstPowerUpAt: 120, rubyEvery: 2200, firstRubyAt: 500, afterCornerSeconds: 0.7,
  tuning: () => ({ obstacleChance: 0.45, obstacleSpacing: 25, speed: 15 }),
};

export class Spawner {
  readonly coins: Coin[] = [];
  /** Multiplies the distance between ruby gems (a character trait makes them more frequent: scale < 1). */
  rubyScale = 1;
  readonly obstacles: Obstacle[] = [];
  readonly powerUps: PowerUp[] = [];
  private cursor = 0;
  private lastObstacleEnd = -Infinity;
  private nextId = 0;
  private readonly opts: SpawnerOptions;

  constructor(private readonly rng: Rng, private readonly track: Track, opts: Partial<SpawnerOptions> = {}) { this.opts = { ...DEFAULTS, ...opts }; }

  fill(upTo: number): void {
    // Content past a fork was laid for both branches at once, so it had to dodge every corner on either side and came
    // out sparse. Once the player (or the generator) has chosen, re-lay everything beyond the corner wall for the one path.
    for (const corner of this.track.takeResolvedCorners()) this.relayFrom(corner + 10);
    const limit = Math.min(upTo, this.track.end() - this.opts.chunk);
    while (this.cursor < limit) { this.layChunk(this.cursor); this.cursor += this.opts.chunk; }
  }

  private relayFrom(s: number): void {
    if (s >= this.cursor) return;
    for (let i = this.obstacles.length - 1; i >= 0; i--) if (this.obstacles[i].s0 >= s) this.obstacles.splice(i, 1);
    for (let i = this.coins.length - 1; i >= 0; i--) if (this.coins[i].s >= s) this.coins.splice(i, 1);
    for (let i = this.powerUps.length - 1; i >= 0; i--) if (this.powerUps[i].s >= s && this.powerUps[i].kind !== 'ruby') this.powerUps.splice(i, 1);
    this.lastObstacleEnd = this.obstacles.reduce((m, o) => Math.max(m, o.s1), -Infinity);
    const prev = this.cursor;
    this.cursor = Math.ceil(s / this.opts.chunk) * this.opts.chunk;
    while (this.cursor < prev) { this.layChunk(this.cursor); this.cursor += this.opts.chunk; }
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
    let pattern = this.choosePattern(s);
    // The whole pattern span must stay clear of every turn window (long patterns can straddle a segment).
    // After a corner the margin is time-based: the outgoing leg is hidden behind the corner wall until
    // the runner has turned, so the first obstacle must be at least `afterCorner` seconds of running away.
    const afterCorner = o.afterCornerSeconds * t.speed;
    const beforeCorner = o.turnMargin;   // a clean approach: nothing in the last metres before the corner square
    const windows = this.track.turnWindowsForSpawning();
    const clearFor = (len: number) => !windows.some((w) => w.corner + afterCorner >= s && w.corner - beforeCorner <= s + len);
    // For a single, pick the kind now so the clearance check uses its real depth; if the pick does not fit the
    // free stretch (short straights at speed), fall back to the shallowest kinds so the segment still gets something.
    let singleKind: ObstacleKind | null = pattern === 'single' ? this.pickSingleKind(s) : null;
    if (singleKind && !clearFor(OBSTACLES[singleKind].depth)) {
      const fallback = (['fire', 'log', 'gap'] as ObstacleKind[]).concat(s >= 300 ? ['spikegate'] : ['branch']).sort((a, b) => OBSTACLES[a].depth - OBSTACLES[b].depth);
      singleKind = fallback.find((k) => clearFor(OBSTACLES[k].depth)) ?? singleKind;
    }
    let len = singleKind ? OBSTACLES[singleKind].depth : this.patternLength(pattern, t.speed);
    if (!singleKind && !clearFor(len)) {
      // A set piece does not fit between these corners: lay a single that does instead of leaving the stretch empty.
      pattern = 'single';
      const fallback = (['fire', 'log', 'gap'] as ObstacleKind[]).concat(s >= 300 ? ['spikegate'] : ['branch']).sort((a, b) => OBSTACLES[a].depth - OBSTACLES[b].depth);
      singleKind = fallback.find((k) => clearFor(OBSTACLES[k].depth)) ?? 'fire';
      len = OBSTACLES[singleKind].depth;
    }
    const clearOfTurns = clearFor(len);
    const canObstacle = s >= o.firstObstacleAt && s - this.lastObstacleEnd >= t.obstacleSpacing && clearOfTurns;
    // Never an empty stretch: 14 m after the last obstacle (about the minimum spacing) the next clear spot gets one for sure.
    const overdue = s - this.lastObstacleEnd > densityForceDistance();
    if (canObstacle && (overdue || chance(this.rng, t.obstacleChance))) { this.layPattern(pattern, s, t.speed, singleKind); return; }
    if (s >= o.firstRubyAt && chance(this.rng, o.chunk / (o.rubyEvery * this.rubyScale)) && !this.nearAnyTurn(s, 4) && !this.obstacles.some((ob) => s > ob.s0 - 3 && s < ob.s1 + 3)) { this.powerUps.push({ id: this.nextId++, kind: 'ruby', s, x: pick(this.rng, LANES), y: 1.0, taken: false }); return; }
    if (s >= o.firstPowerUpAt && !this.powerUps.some((p) => !p.taken && p.s > s - 200) && chance(this.rng, o.powerUpChance)) { this.layPowerUp(s); return; }
    if (chance(this.rng, o.coinChance)) this.layCoinRun(s);
  }

  private choosePattern(s: number): PatternKind {
    const available = (Object.keys(PATTERNS) as PatternKind[]).filter((k) => s >= PATTERNS[k].minS);
    // Singles stay common so patterns feel like set pieces.
    return chance(this.rng, 0.5) ? 'single' : pick(this.rng, available);
  }

  /** The whole ridge is gone for three slabs; a plank bridge one lane wide (centre `plankX`) crosses it. Two fatal pieces flank the planks. */
  private placeBridge(s: number): void {
    const lane = pick(this.rng, LANES);
    const spec = OBSTACLES.chasm;
    const mk = (x0: number, x1: number): Obstacle => ({ id: this.nextId++, kind: 'chasm', s0: s, s1: s + spec.depth, x0, x1, y0: spec.y0, y1: spec.y1, hit: false, passed: false, plankX: lane });
    if (lane - 0.9 > -TRACK_HALF_WIDTH) this.obstacles.push(mk(-TRACK_HALF_WIDTH, lane - 0.9));
    if (lane + 0.9 < TRACK_HALF_WIDTH) this.obstacles.push(mk(lane + 0.9, TRACK_HALF_WIDTH));
    this.lastObstacleEnd = Math.max(this.lastObstacleEnd, s + spec.depth);
    if (lane - 0.9 > -TRACK_HALF_WIDTH) this.clearUnder(s, s + spec.depth, -TRACK_HALF_WIDTH, lane - 0.9);
    if (lane + 0.9 < TRACK_HALF_WIDTH) this.clearUnder(s, s + spec.depth, lane + 0.9, TRACK_HALF_WIDTH);
  }

  /** Half the ridge falls away: the hole covers one side up to 0.4 m past the centre, so only the far lane is safe. */
  private placeHalfGap(s: number): Obstacle {
    const side = chance(this.rng, 0.5) ? -1 : 1;
    const spec = OBSTACLES.halfgap;
    const ob: Obstacle = { id: this.nextId++, kind: 'halfgap', s0: s, s1: s + spec.depth, x0: side < 0 ? -TRACK_HALF_WIDTH : -0.4, x1: side < 0 ? 0.4 : TRACK_HALF_WIDTH, y0: spec.y0, y1: spec.y1, hit: false, passed: false };
    this.obstacles.push(ob);
    this.lastObstacleEnd = Math.max(this.lastObstacleEnd, ob.s1);
    this.clearUnder(ob.s0, ob.s1, ob.x0, ob.x1);
    return ob;
  }

  /** Content laid earlier that a new obstacle makes unreachable: ground coins inside it, power-ups within 2 m of it. */
  private clearUnder(s0: number, s1: number, x0: number, x1: number): void {
    for (let i = this.coins.length - 1; i >= 0; i--) { const c = this.coins[i]; if (c.y < 1.0 && c.s >= s0 - 1 && c.s <= s1 + 1 && c.x > x0 - 0.5 && c.x < x1 + 0.5) this.coins.splice(i, 1); }
    for (let i = this.powerUps.length - 1; i >= 0; i--) { const p = this.powerUps[i]; if (p.s >= s0 - 2 && p.s <= s1 + 2 && p.x > x0 - 0.5 && p.x < x1 + 0.5) this.powerUps.splice(i, 1); }
  }

  private place(kind: ObstacleKind, s: number, lane: number | null): Obstacle {
    const spec = OBSTACLES[kind];
    const centre = spec.lane ? (lane ?? pick(this.rng, LANES)) : 0;
    const half = spec.lane ? 1 : TRACK_HALF_WIDTH;
    const ob: Obstacle = { id: this.nextId++, kind, s0: s, s1: s + spec.depth, x0: centre - half, x1: centre + half, y0: spec.y0, y1: spec.y1, hit: false, passed: false };
    this.obstacles.push(ob);
    this.lastObstacleEnd = Math.max(this.lastObstacleEnd, ob.s1);
    this.clearUnder(ob.s0, ob.s1, ob.x0, ob.x1);
    return ob;
  }

  /** Metres a jump covers at this speed, plus a landing margin before the next action. */
  private jumpReach(speed: number): number { return JUMP_AIRTIME * speed + 4; }

  private patternLength(pattern: PatternKind, speed: number): number {
    if (pattern === 'gapThenBranch') return OBSTACLES.gap.depth + this.jumpReach(speed) + OBSTACLES.branch.depth;
    if (pattern === 'laneFireRow') return 2 * this.fireStep(speed) + OBSTACLES.fire.depth;
    if (pattern === 'single') return OBSTACLES.halfgap.depth;   // the longest thing a single can be (chasm 6, halfgap 8)
    return PATTERNS[pattern].length;
  }

  /** Fires in a row are spaced so a jump clears at most one: a bit more than one jump reach. */
  private fireStep(speed: number): number { return this.jumpReach(speed) + 2; }

  private pickSingleKind(s: number): ObstacleKind {
    return pick(this.rng, ['fire', 'log', 'branch', 'gap', 'gap', 'halfgap', 'halfgap', 'chasm', 'chasm', ...(s >= 300 ? ['spikegate', 'spikegate'] as const : [])] as const);
  }

  private layPattern(pattern: PatternKind, s: number, speed: number, singleKind: ObstacleKind | null = null): void {
    switch (pattern) {
      case 'single': {
        // Gaps twice as likely as the others: holes in the road are the signature hazard.
        const kind = singleKind ?? this.pickSingleKind(s);
        if (kind === 'halfgap') { this.placeHalfGap(s); return; }
        if (kind === 'chasm') { this.placeBridge(s); return; }
        this.place(kind, s, null);
        return;
      }
      case 'twoLaneFire': {
        const open = int(this.rng, 0, 2);
        LANES.forEach((lane, i) => { if (i !== open) this.place('fire', s, lane); });
        return;
      }
      case 'gapThenBranch': {
        // The branch sits where the runner lands after jumping the gap, with room to start a slide.
        this.place('gap', s, null);
        this.place('branch', s + OBSTACLES.gap.depth + this.jumpReach(speed), null);
        return;
      }
      case 'logWithArc': {
        this.place('log', s + 3, null);
        const lane = pick(this.rng, LANES);
        // Five coins arcing over the log; the middle one sits above the jump apex's reach only if you jump early.
        for (let i = 0; i < 5; i++) {
          const y = 0.6 + 1.7 * Math.sin((Math.PI * i) / 4);
          this.coins.push({ id: this.nextId++, s: s + i * COIN_SPACING, x: lane, y, collected: false, value: i === 2 ? 5 : 1 });
        }
        return;
      }
      case 'laneFireRow': {
        const order = [...LANES];
        for (let i = order.length - 1; i > 0; i--) { const j = int(this.rng, 0, i); [order[i], order[j]] = [order[j], order[i]]; }
        order.forEach((lane, i) => this.place('fire', s + i * this.fireStep(speed), lane));
        return;
      }
    }
  }

  private nearAnyTurn(s: number, margin: number): boolean {
    return this.track.turnWindowsForSpawning().some((w) => s >= w.strictFrom - margin && s <= w.to + margin);
  }

  private layPowerUp(s: number): void {
    if (this.obstacles.some((o) => s > o.s0 - 3 && s < o.s1 + 3)) return;   // never right on top of an obstacle
    if (this.nearAnyTurn(s, 4)) return;
    for (const ob of this.obstacles) if (s >= ob.s0 - 2 && s <= ob.s1 + 2) return;
    this.powerUps.push({ id: this.nextId++, kind: pick(this.rng, POWERUP_KINDS), s, x: pick(this.rng, LANES), y: 1.0, taken: false });
  }

  private layCoinRun(s: number): void {
    const n = int(this.rng, 6, 10);
    const lane = pick(this.rng, LANES);
    const end = s + (n - 1) * COIN_SPACING;
    if (this.nearAnyTurn(s, 2) || this.nearAnyTurn(end, 2)) return;
    for (const ob of this.obstacles) if (end >= ob.s0 - 1 && s <= ob.s1 + 1) return;
    for (let i = 0; i < n; i++) {
      // Runs are straight lines at one height, evenly spaced (arcs only appear over the log obstacle).
      const y = 0.6;
      // The middle coin of a run is sometimes a medallion worth five (same size, different face).
      const value = i === Math.floor(n / 2) && chance(this.rng, 0.12) ? 5 : 1;
      this.coins.push({ id: this.nextId++, s: s + i * COIN_SPACING, x: lane, y, collected: false, value });
    }
  }
}
