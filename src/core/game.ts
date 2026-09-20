import { pickCoins, sweepObstacles } from './collision';
import { TickInput, TurnBuffer } from './input';
import { Player } from './player';
import { mulberry32 } from './rng';
import { OBSTACLES, ObstacleKind, Spawner } from './spawner';
import { Track, TurnDir, Vec2 } from './track';

export type GameEvent =
  | { type: 'coin' }
  | { type: 'hit'; kind: ObstacleKind }
  | { type: 'turn'; dir: TurnDir }
  | { type: 'fall'; reason: 'missedTurn' | 'wrongTurn' | 'gap' | 'caught' }
  | { type: 'dead' }
  | { type: 'jump' }
  | { type: 'slide' };

export const LOOKAHEAD = 120;
export const KEEP_BEHIND = 40;
export const COIN_RADIUS = 1.2;
export const PROXIMITY_PER_HIT = 25;
export const PROXIMITY_DECAY = 2; // per second

export class Game {
  track!: Track; player!: Player; spawner!: Spawner;
  readonly buffer = new TurnBuffer(150);
  coins = 0; distance = 0; score = 0; proximity = 0; over = false;
  fallPose: { x: number; z: number; dir: Vec2; s: number } | null = null;
  private deadReported = false;

  constructor(seed: number) { this.reset(seed); }

  reset(seed = Date.now() >>> 0): void {
    const rng = mulberry32(seed);
    this.track = new Track(rng); this.player = new Player(); this.spawner = new Spawner(rng, this.track);
    this.buffer.clear();
    this.coins = 0; this.distance = 0; this.score = 0; this.proximity = 0; this.over = false; this.fallPose = null; this.deadReported = false;
    this.layAhead();
  }

  pressTurn(dir: TurnDir, nowMs: number): void { if (!this.over && this.player.state !== 'falling') this.buffer.press(dir, nowMs); }

  tick(dt: number, input: TickInput, nowMs: number): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.over) return events;
    const p = this.player;
    const wasState = p.state;

    p.tick(dt, input);
    if (wasState === 'running' && p.state === 'jumping') events.push({ type: 'jump' });
    if (wasState === 'running' && p.state === 'sliding') events.push({ type: 'slide' });

    if (p.down) {
      if (p.state === 'dead' && !this.deadReported) { this.deadReported = true; this.over = true; events.push({ type: 'dead' }); }
      return events;
    }

    this.distance = p.s;
    this.handleTurns(nowMs, events);
    if (p.down) return events;

    for (const c of pickCoins(this.spawner.coins, p.s, p.x, p.y, COIN_RADIUS)) { void c; this.coins++; events.push({ type: 'coin' }); }
    for (const o of sweepObstacles(this.spawner.obstacles, p.prevS, p.s, p.lateral, p.vertical)) {
      events.push({ type: 'hit', kind: o.kind });
      if (OBSTACLES[o.kind].fatal) { this.startFall('gap', events); break; }
      p.stumble(); this.proximity = Math.min(100, this.proximity + PROXIMITY_PER_HIT);
      if (this.proximity >= 100) { this.startFall('caught', events); break; }
    }
    if (!p.down) this.proximity = Math.max(0, this.proximity - PROXIMITY_DECAY * dt);

    this.score = Math.floor(this.distance) + this.coins * 10;
    this.layAhead();
    return events;
  }

  private handleTurns(nowMs: number, events: GameEvent[]): void {
    const p = this.player;
    const w = this.track.turnWindowAt(p.s);
    const pressed = this.buffer.peek(nowMs);
    if (!w) return;
    if (pressed) {
      this.buffer.consume();
      w.segment.turnDone = true;
      if (pressed === w.segment.turn) events.push({ type: 'turn', dir: pressed });
      else this.startFall('wrongTurn', events);
      return;
    }
    if (p.s > w.corner) {
      // Past the corner with no input: keep running straight off the edge.
      w.segment.turnDone = true;
      this.startFall('missedTurn', events);
    }
  }

  private startFall(reason: 'missedTurn' | 'wrongTurn' | 'gap' | 'caught', events: GameEvent[]): void {
    const p = this.player;
    const w = this.track.turnWindows().find((tw) => tw.segment.turnDone && p.s >= tw.from && p.s <= tw.corner + 0.5);
    const at = reason === 'missedTurn' && w ? this.track.sample(w.corner - 1e-6, p.x) : this.track.sample(p.s, p.x);
    this.fallPose = { x: at.x, z: at.z, dir: at.dir, s: p.s };
    p.fall();
    events.push({ type: 'fall', reason });
  }

  private layAhead(): void {
    const ahead = this.player.s + LOOKAHEAD;
    this.track.extendTo(ahead);
    this.spawner.fill(ahead - 10);
    this.track.dropBehind(this.player.s - KEEP_BEHIND);
    this.spawner.prune(this.player.s - KEEP_BEHIND);
  }
}
