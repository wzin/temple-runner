import { pickCoins, pickPowerUps, sweepObstacles } from './collision';
import { difficultyAt } from './difficulty';
import { TickInput, TurnBuffer } from './input';
import { Player } from './player';
import { BOOST_SPEED_FACTOR, MAGNET_PULL_SPEED, MAGNET_RADIUS, POWERUPS, PowerUpKind } from './powerups';
import { Rng, mulberry32, pick } from './rng';
import { OBSTACLES, ObstacleKind, Spawner } from './spawner';
import { Track, TurnDir, Vec2 } from './track';

export type FallReason = 'missedTurn' | 'wrongTurn' | 'gap' | 'caught';

export type GameEvent =
  | { type: 'coin' }
  | { type: 'hit'; kind: ObstacleKind }
  | { type: 'shielded'; kind: ObstacleKind }
  | { type: 'turn'; dir: TurnDir }
  | { type: 'fall'; reason: FallReason }
  | { type: 'dead' }
  | { type: 'jump' }
  | { type: 'slide' }
  | { type: 'land' }
  | { type: 'powerup'; kind: PowerUpKind }
  | { type: 'powerupEnd'; kind: PowerUpKind };

/** Content is laid this many seconds of running ahead (clamped); the fog is tuned to hide the far end. */
export const LOOKAHEAD_SECONDS = 12;
export const LOOKAHEAD_MIN = 150;
export const LOOKAHEAD_MAX = 300;
export const LOOKAHEAD = LOOKAHEAD_MIN; // kept for callers that want a static number
export const KEEP_BEHIND = 40;
export const COIN_RADIUS = 1.2;
export const POWERUP_RADIUS = 1.4;
export const PROXIMITY_PER_HIT = 25;
export const PROXIMITY_DECAY = 2; // per second
/** Seconds after a boost ends during which the runner is still invulnerable and turns are automatic. */
export const BOOST_GRACE = 0.6;

export interface ActivePowerUp { kind: PowerUpKind; timer: number }

export class Game {
  track!: Track; player!: Player; spawner!: Spawner;
  private rng!: Rng;
  readonly buffer = new TurnBuffer(150);
  coins = 0; distance = 0; score = 0; proximity = 0; over = false;
  active: ActivePowerUp | null = null;
  shield = false;
  private boostGrace = 0;
  /** Set when a turn was just taken; the camera uses it for its swing. */
  lastTurn: { dir: TurnDir; age: number } | null = null;
  fallPose: { x: number; z: number; dir: Vec2; s: number } | null = null;
  private deadReported = false;

  /** Metres of track kept generated ahead of the player at the current speed. */
  get lookahead(): number {
    const d = difficultyAt(this.player.s);
    return Math.max(LOOKAHEAD_MIN, Math.min(LOOKAHEAD_MAX, d.speed * LOOKAHEAD_SECONDS));
  }

  constructor(seed: number) { this.reset(seed); }

  reset(seed = Date.now() >>> 0): void {
    const rng = mulberry32(seed);
    this.rng = rng;
    this.track = new Track(rng, { turnChance: () => difficultyAt(this.track.end()).turnChance });
    this.player = new Player();
    this.spawner = new Spawner(rng, this.track, { tuning: (s) => difficultyAt(s) });
    this.buffer.clear();
    this.coins = 0; this.distance = 0; this.score = 0; this.proximity = 0; this.over = false;
    this.active = null; this.shield = false; this.boostGrace = 0; this.lastTurn = null; this.fallPose = null; this.deadReported = false;
    this.applyDifficulty();
    this.layAhead();
  }

  get boosting(): boolean { return this.active?.kind === 'boost'; }
  /** Boost or its landing grace: no collisions, turns are taken automatically, presses are ignored. */
  get invulnerable(): boolean { return this.boosting || this.boostGrace > 0; }
  get magnet(): boolean { return this.active?.kind === 'magnet'; }

  pressTurn(dir: TurnDir, nowMs: number): void { if (!this.over && !this.player.down) this.buffer.press(dir, nowMs); }

  tick(dt: number, input: TickInput, nowMs: number): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.over) return events;
    const p = this.player;
    const wasState = p.state;

    this.applyDifficulty();
    p.tick(dt, input);
    if (wasState === 'running' && p.state === 'jumping') events.push({ type: 'jump' });
    if (wasState === 'running' && p.state === 'sliding') events.push({ type: 'slide' });
    if (wasState === 'jumping' && p.state === 'running') events.push({ type: 'land' });
    if (this.lastTurn) { this.lastTurn.age += dt; if (this.lastTurn.age > 1) this.lastTurn = null; }

    if (p.down) {
      if (p.state === 'dead' && !this.deadReported) { this.deadReported = true; this.over = true; events.push({ type: 'dead' }); }
      return events;
    }

    this.distance = p.s;
    this.score = Math.floor(this.distance) + this.coins * 10;   // keep score and distance consistent even if this tick ends the run
    this.tickPowerUp(dt, events);
    if (this.boostGrace > 0) this.boostGrace -= dt;
    this.handleTurns(nowMs, events);
    if (p.down) return events;

    if (this.magnet) this.pullCoins(dt);
    for (const c of pickCoins(this.spawner.coins, p.s, p.x, p.y, COIN_RADIUS)) { void c; this.coins++; events.push({ type: 'coin' }); }
    for (const pu of pickPowerUps(this.spawner.powerUps, p.s, p.x, p.y, POWERUP_RADIUS)) this.activate(pu.kind, events);

    if (!this.invulnerable) {
      for (const o of sweepObstacles(this.spawner.obstacles, p.prevS, p.s, p.lateral, p.vertical)) {
        if (OBSTACLES[o.kind].fatal) { events.push({ type: 'hit', kind: o.kind }); this.startFall('gap', events); break; }
        if (this.shield) { this.shield = false; events.push({ type: 'shielded', kind: o.kind }); events.push({ type: 'powerupEnd', kind: 'shield' }); continue; }
        events.push({ type: 'hit', kind: o.kind });
        p.stumble(); this.proximity = Math.min(100, this.proximity + PROXIMITY_PER_HIT);
        if (this.proximity >= 100) { this.startFall('caught', events); break; }
      }
    } else {
      // Boost flies over everything: mark what we pass so it cannot hit later.
      for (const o of this.spawner.obstacles) if (!o.hit && !o.passed && p.s > o.s1) o.passed = true;
    }
    if (!p.down) this.proximity = Math.max(0, this.proximity - PROXIMITY_DECAY * dt);

    this.score = Math.floor(this.distance) + this.coins * 10;
    this.layAhead();
    return events;
  }

  private applyDifficulty(): void {
    const d = difficultyAt(this.player.s);
    const boost = this.boosting ? BOOST_SPEED_FACTOR : 1;
    this.player.speedScale = (d.speed / this.player.cfg.speed) * boost;
    this.track.turnEarly = d.reactionTime * d.speed * boost;
    this.track.turnLate = Math.max(2, 0.15 * d.speed * boost);   // a late press still counts for ~150 ms past the corner
  }

  private activate(kind: PowerUpKind, events: GameEvent[]): void {
    if (kind === 'shield') { this.shield = true; }
    else {
      if (kind === 'boost') this.proximity = 0;   // the monkeys are left behind
      if (this.active) events.push({ type: 'powerupEnd', kind: this.active.kind });
      this.active = { kind, timer: POWERUPS[kind].duration };
    }
    events.push({ type: 'powerup', kind });
  }

  private tickPowerUp(dt: number, events: GameEvent[]): void {
    if (!this.active) return;
    this.active.timer -= dt;
    if (this.active.timer <= 0) {
      if (this.active.kind === 'boost') this.boostGrace = BOOST_GRACE;
      events.push({ type: 'powerupEnd', kind: this.active.kind });
      this.active = null;
    }
  }

  private pullCoins(dt: number): void {
    const p = this.player;
    for (const c of this.spawner.coins) {
      if (c.collected) continue;
      const ds = c.s - p.s; const dx = c.x - p.x; const dy = c.y - (p.y + 0.6);
      const dist = Math.hypot(ds, dx, dy);
      if (dist > MAGNET_RADIUS * (this.boosting ? 1.6 : 1) || dist < 1e-6) continue;
      // Pull faster than the runner moves, or coins never catch up during a boost.
      const pull = Math.max(MAGNET_PULL_SPEED, p.speed * 1.8);
      const step = Math.min(dist, pull * dt) / dist;
      c.s -= ds * step; c.x -= dx * step; c.y -= dy * step;
    }
  }

  private handleTurns(nowMs: number, events: GameEvent[]): void {
    const p = this.player;
    const w = this.track.turnWindowAt(p.s);
    const pressed = this.buffer.peek(nowMs);
    if (!w) return;
    const seg = w.segment;
    if (this.invulnerable) {
      // Flying: any press is harmless, the corner is taken automatically.
      this.buffer.consume();
      // At a fork the player's press still decides; random only if nothing was pressed.
      if (seg.fork && !seg.resolved && pressed) this.track.resolveFork(seg, pressed);
      if (p.s > w.corner) {
        if (seg.fork && !seg.resolved) this.track.resolveFork(seg, pick(this.rng, ['left', 'right'] as const));
        seg.turnDone = true; events.push({ type: 'turn', dir: seg.turn! }); this.lastTurn = { dir: seg.turn!, age: 0 };
      }
      return;
    }
    if (pressed) {
      this.buffer.consume();
      seg.turnDone = true;
      if (seg.fork && !seg.resolved) this.track.resolveFork(seg, pressed);   // a fork accepts either direction
      if (pressed === seg.turn) { events.push({ type: 'turn', dir: pressed }); this.lastTurn = { dir: pressed, age: 0 }; }
      else this.startFall('wrongTurn', events);
      return;
    }
    if (p.s > w.corner) {
      seg.turnDone = true;
      // Past the corner with no input: keep running straight off the edge.
      this.startFall('missedTurn', events);
    }
  }

  private startFall(reason: FallReason, events: GameEvent[]): void {
    const p = this.player;
    const w = this.track.turnWindows().find((tw) => tw.segment.turnDone && p.s >= tw.from && p.s <= tw.corner + 0.5);
    const at = reason === 'missedTurn' && w ? this.track.sample(w.corner - 1e-6, p.x) : this.track.sample(p.s, p.x);
    this.fallPose = { x: at.x, z: at.z, dir: at.dir, s: p.s };
    p.fall();
    events.push({ type: 'fall', reason });
  }

  private layAhead(): void {
    const ahead = this.player.s + this.lookahead;
    this.track.extendTo(ahead);
    this.spawner.fill(ahead - 10);   // clamps itself to the laid track (forks stop generation)
    this.track.dropBehind(this.player.s - KEEP_BEHIND);
    this.spawner.prune(this.player.s - KEEP_BEHIND);
  }
}
