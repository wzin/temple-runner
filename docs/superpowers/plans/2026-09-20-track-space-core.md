# Track-Space Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the world-space prototype core with a pure-TypeScript track-space model (track, player, spawner, collision) that Three.js only renders, so turns, jumps, coins and obstacles behave like Temple Run 1.

**Architecture:** Everything that moves has a track coordinate `(s, x, y)`; `Track.sample(s, x, y)` maps it to world space. `Game.tick(dt, input)` advances the model and returns events; `main.ts` feeds events to audio/HUD and lets `view/*` place meshes. The old `path/`, `player.ts`, `obstacles/`, `collectibles/`, `powerups/`, `monkey.ts` are deleted; `ui/*`, `audio.ts`, `styles.css`, `gameState.ts` stay as the UI shell.

**Tech Stack:** TypeScript 5, Vite 5, Vitest 2, Three.js 0.160. All commands run in Docker: `docker compose --profile dev run --rm dev <cmd>`.

**Spec:** `docs/superpowers/specs/2026-09-20-track-space-core-design.md`

## Global Constraints

- No Three.js import anywhere under `src/core/`.
- Core is deterministic given a seed: all randomness goes through `Rng` from `src/core/rng.ts`.
- World axes: forward at start is `-z`, right is `+x`, up is `+y`. Right vector of heading `(dx, dz)` is `(-dz, dx)`. Left turn maps `(dx, dz)` → `(dz, -dx)`, right turn → `(-dz, dx)`.
- Constants from the spec: `TRACK_HALF_WIDTH = 3`, `SEGMENT_LENGTH = 20`, turn window `6 m` before to `2 m` after the corner, buffer TTL `150 ms`, two straights after every turn, turn probability `0.15`, lookahead `120 m`, keep-behind `40 m`, obstacle spacing `25 m`, no obstacles within `10 m` of a turn window or before `s = 60`.
- Test command: `docker compose --profile dev run --rm dev npm test`. Type check: `docker compose --profile dev run --rm dev npx tsc --noEmit`.
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/core/rng.ts` | seedable PRNG (`mulberry32`) |
| `src/core/track.ts` | segments, generator rules, `sample()`, turn windows |
| `src/core/input.ts` | `TickInput` shape, one-slot `TurnBuffer` |
| `src/core/player.ts` | player state machine and vertical/lateral physics |
| `src/core/spawner.ts` | coins and obstacles laid by `s`, obstacle type table |
| `src/core/collision.ts` | swept obstacle check, coin pickup |
| `src/core/game.ts` | wiring, turn acceptance, proximity, events |
| `src/view/scene.ts` | renderer, lights (moved from `src/scene.ts`) |
| `src/view/camera.ts` | follow camera driven by `track.sample` |
| `src/view/trackView.ts` | meshes per segment, add/dispose with the track |
| `src/view/playerView.ts` | capsule placed from player track coords |
| `src/view/coinView.ts`, `src/view/obstacleView.ts` | instanced meshes for coins/obstacles |
| `src/ui/domInput.ts` | keyboard → `TickInput` + turn presses |
| `src/main.ts` | game loop, screens, event → sound/HUD |

---

### Task 1: Seedable RNG

**Files:** Create `src/core/rng.ts`, `src/core/rng.test.ts`

**Interfaces:** Produces `type Rng = () => number` (uniform in `[0,1)`), `mulberry32(seed: number): Rng`, `pick<T>(rng, items: T[]): T`, `chance(rng, p): boolean`, `int(rng, lo, hi): number` (inclusive).

- [ ] Write `src/core/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chance, int, mulberry32, pick } from './rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('stays in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('helpers respect bounds', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 200; i++) expect([1, 2, 3]).toContain(int(r, 1, 3));
    expect(['a', 'b']).toContain(pick(r, ['a', 'b']));
    expect(chance(() => 0.1, 0.2)).toBe(true);
    expect(chance(() => 0.3, 0.2)).toBe(false);
  });
});
```

- [ ] Run `docker compose --profile dev run --rm dev npm test` → FAIL (module missing).
- [ ] Write `src/core/rng.ts`:

```ts
export type Rng = () => number;

/** Small, fast, seedable PRNG. Same seed → same sequence, which keeps tests and future replays deterministic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chance(rng: Rng, p: number): boolean { return rng() < p; }
export function int(rng: Rng, lo: number, hi: number): number { return lo + Math.floor(rng() * (hi - lo + 1)); }
export function pick<T>(rng: Rng, items: readonly T[]): T { return items[Math.floor(rng() * items.length)]; }
```

- [ ] Run tests → PASS. Commit `feat(core): seedable rng`.

### Task 2: Track model

**Files:** Create `src/core/track.ts`, `src/core/track.test.ts`

**Interfaces:** Produces

```ts
export interface Vec2 { x: number; z: number }
export type TurnDir = 'left' | 'right';
export interface Segment { id: number; kind: 'straight' | 'turn'; turn?: TurnDir; s0: number; length: number; start: Vec2; dir: Vec2; runIn: number; outDir: Vec2; turnDone: boolean }
export interface Sample { x: number; y: number; z: number; dir: Vec2 }
export interface TurnWindow { segment: Segment; corner: number; from: number; to: number }
export const TRACK_HALF_WIDTH = 3; export const SEGMENT_LENGTH = 20; export const TURN_EARLY = 6; export const TURN_LATE = 2;
export function rightOf(d: Vec2): Vec2; export function turnLeft(d: Vec2): Vec2; export function turnRight(d: Vec2): Vec2;
export class Track {
  constructor(rng: Rng, opts?: { turnChance?: number; straightsAfterTurn?: number; initialStraights?: number });
  readonly segments: Segment[];
  end(): number;                       // s where the laid track ends
  extendTo(s: number): Segment[];      // append until end() > s, return appended
  dropBehind(s: number): Segment[];    // remove segments fully behind s, return removed
  segmentAt(s: number): Segment | undefined;
  sample(s: number, x?: number, y?: number): Sample;
  cornerOf(seg: Segment): number;      // s of the corner (turn segments)
  turnWindowAt(s: number): TurnWindow | null;  // window containing s on a not-yet-handled turn
  turnWindows(): TurnWindow[];
  nearTurnWindow(s: number, margin: number): boolean;
}
```

- [ ] Write `src/core/track.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { SEGMENT_LENGTH, TURN_EARLY, TURN_LATE, Track, rightOf, turnLeft, turnRight } from './track';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('heading helpers', () => {
  it('right of north (-z) is +x', () => { expect(rightOf({ x: 0, z: -1 })).toEqual({ x: 1, z: -0 }); });
  it('left of north is west, right of north is east', () => {
    expect(turnLeft({ x: 0, z: -1 })).toEqual({ x: -1, z: -0 });
    expect(turnRight({ x: 0, z: -1 })).toEqual({ x: 1, z: 0 });
  });
});

describe('Track generation', () => {
  it('starts with straights and always follows a turn with two straights', () => {
    const t = new Track(mulberry32(3), { turnChance: 0.9 });
    t.extendTo(2000);
    const kinds = t.segments.map((s) => s.kind);
    expect(kinds.slice(0, 3)).toEqual(['straight', 'straight', 'straight']);
    for (let i = 0; i < kinds.length - 2; i++) {
      if (kinds[i] === 'turn') { expect(kinds[i + 1]).toBe('straight'); expect(kinds[i + 2]).toBe('straight'); }
    }
    expect(kinds).toContain('turn');
  });
  it('segments are contiguous in s and space', () => {
    const t = new Track(mulberry32(5), { turnChance: 0.5 });
    t.extendTo(1000);
    for (let i = 1; i < t.segments.length; i++) {
      const prev = t.segments[i - 1]; const cur = t.segments[i];
      expect(close(prev.s0 + prev.length, cur.s0)).toBe(true);
      const end = t.sample(prev.s0 + prev.length);
      expect(close(end.x, cur.start.x) && close(end.z, cur.start.z)).toBe(true);
    }
  });
  it('drops segments behind and keeps the rest', () => {
    const t = new Track(mulberry32(1)); t.extendTo(300);
    const removed = t.dropBehind(100);
    expect(removed.length).toBeGreaterThan(0);
    for (const s of t.segments) expect(s.s0 + s.length).toBeGreaterThanOrEqual(100);
    expect(t.segmentAt(150)).toBeDefined();
  });
});

describe('Track.sample', () => {
  it('walks a straight and applies lateral offset to the right', () => {
    const t = new Track(mulberry32(1)); t.extendTo(50);
    const p = t.sample(10, 1.5);
    expect(close(p.x, 1.5)).toBe(true); expect(close(p.z, -10)).toBe(true); expect(p.dir).toEqual({ x: 0, z: -1 });
  });
  it('is continuous through a corner and heading changes after it', () => {
    const t = new Track(mulberry32(3), { turnChance: 1 }); t.extendTo(200);
    const turn = t.segments.find((s) => s.kind === 'turn')!;
    const c = t.cornerOf(turn);
    const before = t.sample(c - 1e-4, 1); const after = t.sample(c + 1e-4, 1);
    // The centre line is continuous; the lateral offset swings with the heading, so compare centre-line points.
    const cb = t.sample(c - 1e-4); const ca = t.sample(c + 1e-4);
    expect(Math.hypot(cb.x - ca.x, cb.z - ca.z)).toBeLessThan(1e-3);
    expect(before.dir).not.toEqual(after.dir);
    expect(after.dir).toEqual(turn.outDir);
    expect(c).toBe(turn.s0 + SEGMENT_LENGTH / 2);
  });
  it('exposes turn windows around the corner', () => {
    const t = new Track(mulberry32(3), { turnChance: 1 }); t.extendTo(200);
    const turn = t.segments.find((s) => s.kind === 'turn')!;
    const c = t.cornerOf(turn);
    expect(t.turnWindowAt(c - TURN_EARLY + 0.1)?.segment).toBe(turn);
    expect(t.turnWindowAt(c + TURN_LATE - 0.1)?.segment).toBe(turn);
    expect(t.turnWindowAt(c - TURN_EARLY - 0.1)).toBeNull();
    turn.turnDone = true;
    expect(t.turnWindowAt(c)).toBeNull();
    expect(t.nearTurnWindow(c - TURN_EARLY - 5, 10)).toBe(true);
    expect(t.nearTurnWindow(c - TURN_EARLY - 11, 10)).toBe(false);
  });
});
```

- [ ] Run tests → FAIL. Write `src/core/track.ts`:

```ts
import { Rng, chance, pick } from './rng';

export interface Vec2 { x: number; z: number }
export type TurnDir = 'left' | 'right';

export interface Segment {
  id: number;
  kind: 'straight' | 'turn';
  turn?: TurnDir;
  s0: number;
  length: number;
  start: Vec2;
  dir: Vec2;      // heading at the start
  runIn: number;  // distance from start to the corner (== length for straights)
  outDir: Vec2;   // heading after the corner (== dir for straights)
  turnDone: boolean;
}

export interface Sample { x: number; y: number; z: number; dir: Vec2 }
export interface TurnWindow { segment: Segment; corner: number; from: number; to: number }

export const TRACK_HALF_WIDTH = 3;
export const SEGMENT_LENGTH = 20;
export const TURN_EARLY = 6;
export const TURN_LATE = 2;

export function rightOf(d: Vec2): Vec2 { return { x: -d.z, z: d.x }; }
export function turnLeft(d: Vec2): Vec2 { return { x: d.z, z: -d.x }; }
export function turnRight(d: Vec2): Vec2 { return { x: -d.z, z: d.x }; }

export interface TrackOptions { turnChance?: number; straightsAfterTurn?: number; initialStraights?: number }

export class Track {
  readonly segments: Segment[] = [];
  private nextId = 0;
  private nextS = 0;
  private nextStart: Vec2 = { x: 0, z: 0 };
  private nextDir: Vec2 = { x: 0, z: -1 };
  private straightsSinceTurn = 0;
  private laid = 0;
  private readonly turnChance: number;
  private readonly straightsAfterTurn: number;
  private readonly initialStraights: number;

  constructor(private readonly rng: Rng, opts: TrackOptions = {}) {
    this.turnChance = opts.turnChance ?? 0.15;
    this.straightsAfterTurn = opts.straightsAfterTurn ?? 2;
    this.initialStraights = opts.initialStraights ?? 3;
  }

  end(): number { return this.nextS; }

  extendTo(s: number): Segment[] {
    const added: Segment[] = [];
    while (this.nextS <= s) added.push(this.append(this.chooseKind()));
    return added;
  }

  dropBehind(s: number): Segment[] {
    const removed: Segment[] = [];
    while (this.segments.length && this.segments[0].s0 + this.segments[0].length < s) removed.push(this.segments.shift()!);
    return removed;
  }

  segmentAt(s: number): Segment | undefined {
    return this.segments.find((seg) => s >= seg.s0 && s < seg.s0 + seg.length);
  }

  sample(s: number, x = 0, y = 0): Sample {
    const seg = this.segmentAt(s) ?? (s < (this.segments[0]?.s0 ?? 0) ? this.segments[0] : this.segments[this.segments.length - 1]);
    if (!seg) return { x, y, z: -s, dir: { x: 0, z: -1 } };
    const local = s - seg.s0;
    let cx: number; let cz: number; let dir: Vec2;
    if (local <= seg.runIn) {
      cx = seg.start.x + seg.dir.x * local; cz = seg.start.z + seg.dir.z * local; dir = seg.dir;
    } else {
      const corner = this.cornerPoint(seg); const past = local - seg.runIn;
      cx = corner.x + seg.outDir.x * past; cz = corner.z + seg.outDir.z * past; dir = seg.outDir;
    }
    const r = rightOf(dir);
    return { x: cx + r.x * x, y, z: cz + r.z * x, dir };
  }

  cornerOf(seg: Segment): number { return seg.s0 + seg.runIn; }

  turnWindows(): TurnWindow[] {
    return this.segments.filter((s) => s.kind === 'turn').map((segment) => {
      const corner = this.cornerOf(segment);
      return { segment, corner, from: corner - TURN_EARLY, to: corner + TURN_LATE };
    });
  }

  turnWindowAt(s: number): TurnWindow | null {
    return this.turnWindows().find((w) => !w.segment.turnDone && s >= w.from && s <= w.to) ?? null;
  }

  nearTurnWindow(s: number, margin: number): boolean {
    return this.turnWindows().some((w) => s >= w.from - margin && s <= w.to + margin);
  }

  private cornerPoint(seg: Segment): Vec2 {
    return { x: seg.start.x + seg.dir.x * seg.runIn, z: seg.start.z + seg.dir.z * seg.runIn };
  }

  private chooseKind(): 'straight' | 'turn' {
    if (this.laid < this.initialStraights) return 'straight';
    if (this.straightsSinceTurn < this.straightsAfterTurn) return 'straight';
    return chance(this.rng, this.turnChance) ? 'turn' : 'straight';
  }

  private append(kind: 'straight' | 'turn'): Segment {
    const dir = this.nextDir;
    const turn = kind === 'turn' ? pick(this.rng, ['left', 'right'] as const) : undefined;
    const outDir = turn === 'left' ? turnLeft(dir) : turn === 'right' ? turnRight(dir) : dir;
    const runIn = kind === 'turn' ? SEGMENT_LENGTH / 2 : SEGMENT_LENGTH;
    const seg: Segment = { id: this.nextId++, kind, turn, s0: this.nextS, length: SEGMENT_LENGTH, start: this.nextStart, dir, runIn, outDir, turnDone: false };
    this.segments.push(seg);
    const end = this.sample(this.nextS + SEGMENT_LENGTH - 1e-9);
    this.nextStart = { x: end.x + outDir.x * 1e-9, z: end.z + outDir.z * 1e-9 };
    this.nextStart = this.exactEnd(seg);
    this.nextDir = outDir;
    this.nextS += SEGMENT_LENGTH;
    this.laid++;
    this.straightsSinceTurn = kind === 'turn' ? 0 : this.straightsSinceTurn + 1;
    return seg;
  }

  private exactEnd(seg: Segment): Vec2 {
    const c = this.cornerPoint(seg); const out = seg.length - seg.runIn;
    return { x: c.x + seg.outDir.x * out, z: c.z + seg.outDir.z * out };
  }
}
```

  (Remove the two throwaway `end`/`nextStart` lines that precede `this.nextStart = this.exactEnd(seg)` when implementing; `exactEnd` is the only end computation needed.)

- [ ] Run tests → PASS. Commit `feat(core): track segments, generator and sample()`.

### Task 3: Input buffer

**Files:** Create `src/core/input.ts`, `src/core/input.test.ts`

**Interfaces:** Produces `interface TickInput { drift: number /* -1..1 */; jump: boolean; slide: boolean }`, `class TurnBuffer { constructor(ttlMs = 150); press(dir: TurnDir, nowMs: number): void; peek(nowMs: number): TurnDir | null; consume(): void; clear(): void }`.

- [ ] Test:

```ts
import { describe, expect, it } from 'vitest';
import { TurnBuffer } from './input';

describe('TurnBuffer', () => {
  it('holds the last press for the ttl then expires', () => {
    const b = new TurnBuffer(150);
    b.press('left', 1000);
    expect(b.peek(1100)).toBe('left');
    expect(b.peek(1151)).toBeNull();
  });
  it('a newer press replaces the older one and consume empties it', () => {
    const b = new TurnBuffer(150);
    b.press('left', 0); b.press('right', 10);
    expect(b.peek(20)).toBe('right');
    b.consume();
    expect(b.peek(20)).toBeNull();
  });
});
```

- [ ] Implement:

```ts
import type { TurnDir } from './track';

export interface TickInput { drift: number; jump: boolean; slide: boolean }
export const NO_INPUT: TickInput = { drift: 0, jump: false, slide: false };

/** One-slot buffer so a turn pressed slightly early still counts when the window opens. */
export class TurnBuffer {
  private dir: TurnDir | null = null;
  private at = 0;
  constructor(private readonly ttlMs = 150) {}
  press(dir: TurnDir, nowMs: number): void { this.dir = dir; this.at = nowMs; }
  peek(nowMs: number): TurnDir | null {
    if (this.dir && nowMs - this.at > this.ttlMs) this.dir = null;
    return this.dir;
  }
  consume(): void { this.dir = null; }
  clear(): void { this.dir = null; }
}
```

- [ ] Tests PASS. Commit `feat(core): turn input buffer`.

### Task 4: Player physics

**Files:** Create `src/core/player.ts`, `src/core/player.test.ts`

**Interfaces:** Produces

```ts
export type PlayerState = 'running' | 'jumping' | 'sliding' | 'falling' | 'dead';
export interface PlayerConfig { speed: number; lateralSpeed: number; jumpVelocity: number; gravity: number; slideDuration: number; stumbleDuration: number; stumbleSlow: number; fallDuration: number; halfWidth: number; height: number; slideHeight: number; maxX: number }
export const DEFAULT_PLAYER: PlayerConfig;
export class Player {
  s: number; prevS: number; x: number; y: number; vy: number; state: PlayerState; stumbleTimer: number; fallTimer: number;
  constructor(cfg?: Partial<PlayerConfig>); readonly cfg: PlayerConfig;
  tick(dt: number, input: TickInput): void;
  jump(): boolean; slide(): boolean; stumble(): void; fall(): void;
  get height(): number; get lateral(): [number, number]; get vertical(): [number, number]; get speed(): number;
  reset(): void;
}
```

- [ ] Test:

```ts
import { describe, expect, it } from 'vitest';
import { NO_INPUT } from './input';
import { DEFAULT_PLAYER, Player } from './player';

function run(p: Player, seconds: number, input = NO_INPUT, dt = 1 / 120) {
  for (let t = 0; t < seconds; t += dt) p.tick(dt, input);
}

describe('Player', () => {
  it('runs forward at speed and clamps lateral drift', () => {
    const p = new Player();
    run(p, 1, { drift: 1, jump: false, slide: false });
    expect(p.s).toBeCloseTo(DEFAULT_PLAYER.speed, 0);
    expect(p.x).toBeCloseTo(DEFAULT_PLAYER.maxX, 5);
  });
  it('jump lasts ~0.75 s and reaches ~2.2 m', () => {
    const p = new Player();
    p.tick(1 / 120, { drift: 0, jump: true, slide: false });
    expect(p.state).toBe('jumping');
    let apex = 0; let t = 0; const dt = 1 / 240;
    while (p.state === 'jumping' && t < 3) { p.tick(dt, NO_INPUT); apex = Math.max(apex, p.y); t += dt; }
    expect(t).toBeGreaterThan(0.7); expect(t).toBeLessThan(0.85);
    expect(apex).toBeGreaterThan(2.0); expect(apex).toBeLessThan(2.4);
    expect(p.y).toBe(0); expect(p.state).toBe('running');
  });
  it('slide lowers the collision height for its duration and blocks a jump', () => {
    const p = new Player();
    p.tick(1 / 120, { drift: 0, jump: false, slide: true });
    expect(p.state).toBe('sliding'); expect(p.height).toBe(DEFAULT_PLAYER.slideHeight);
    expect(p.jump()).toBe(false);
    run(p, DEFAULT_PLAYER.slideDuration + 0.05);
    expect(p.state).toBe('running'); expect(p.height).toBe(DEFAULT_PLAYER.height);
  });
  it('stumble slows temporarily, fall stops and then kills', () => {
    const p = new Player();
    p.stumble(); expect(p.speed).toBeLessThan(DEFAULT_PLAYER.speed);
    run(p, DEFAULT_PLAYER.stumbleDuration + 0.05); expect(p.speed).toBe(DEFAULT_PLAYER.speed);
    p.fall(); expect(p.speed).toBe(0); expect(p.state).toBe('falling');
    run(p, DEFAULT_PLAYER.fallDuration + 0.05); expect(p.state).toBe('dead');
    expect(p.y).toBeLessThan(0);
  });
});
```

- [ ] Implement:

```ts
import type { TickInput } from './input';

export type PlayerState = 'running' | 'jumping' | 'sliding' | 'falling' | 'dead';

export interface PlayerConfig {
  speed: number; lateralSpeed: number; jumpVelocity: number; gravity: number;
  slideDuration: number; stumbleDuration: number; stumbleSlow: number; fallDuration: number;
  halfWidth: number; height: number; slideHeight: number; maxX: number;
}

// jumpVelocity 11.5 / gravity 30 → 0.77 s airtime, 2.2 m apex.
export const DEFAULT_PLAYER: PlayerConfig = {
  speed: 15, lateralSpeed: 8, jumpVelocity: 11.5, gravity: 30,
  slideDuration: 0.7, stumbleDuration: 0.5, stumbleSlow: 0.6, fallDuration: 1.5,
  halfWidth: 0.4, height: 1.8, slideHeight: 0.9, maxX: 2.2,
};

export class Player {
  readonly cfg: PlayerConfig;
  s = 0; prevS = 0; x = 0; y = 0; vy = 0;
  state: PlayerState = 'running';
  stumbleTimer = 0; slideTimer = 0; fallTimer = 0;

  constructor(cfg: Partial<PlayerConfig> = {}) { this.cfg = { ...DEFAULT_PLAYER, ...cfg }; }

  get height(): number { return this.state === 'sliding' ? this.cfg.slideHeight : this.cfg.height; }
  get lateral(): [number, number] { return [this.x - this.cfg.halfWidth, this.x + this.cfg.halfWidth]; }
  get vertical(): [number, number] { return [this.y, this.y + this.height]; }
  get speed(): number {
    if (this.state === 'falling' || this.state === 'dead') return 0;
    return this.stumbleTimer > 0 ? this.cfg.speed * this.cfg.stumbleSlow : this.cfg.speed;
  }

  tick(dt: number, input: TickInput): void {
    this.prevS = this.s;
    if (this.state === 'dead') return;
    if (this.state === 'falling') {
      this.fallTimer -= dt; this.vy -= this.cfg.gravity * dt; this.y += this.vy * dt;
      if (this.fallTimer <= 0) this.state = 'dead';
      return;
    }
    if (input.jump) this.jump();
    if (input.slide) this.slide();

    this.s += this.speed * dt;
    this.x = Math.max(-this.cfg.maxX, Math.min(this.cfg.maxX, this.x + input.drift * this.cfg.lateralSpeed * dt));

    if (this.state === 'jumping') {
      this.vy -= this.cfg.gravity * dt; this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.state = 'running'; }
    }
    if (this.state === 'sliding') { this.slideTimer -= dt; if (this.slideTimer <= 0) this.state = 'running'; }
    if (this.stumbleTimer > 0) this.stumbleTimer -= dt;
  }

  jump(): boolean {
    if (this.state !== 'running') return false;
    this.state = 'jumping'; this.vy = this.cfg.jumpVelocity; return true;
  }
  slide(): boolean {
    if (this.state !== 'running') return false;
    this.state = 'sliding'; this.slideTimer = this.cfg.slideDuration; return true;
  }
  stumble(): void { if (this.state !== 'falling' && this.state !== 'dead') this.stumbleTimer = this.cfg.stumbleDuration; }
  fall(): void {
    if (this.state === 'falling' || this.state === 'dead') return;
    this.state = 'falling'; this.fallTimer = this.cfg.fallDuration; this.vy = Math.min(this.vy, 0);
  }
  reset(): void { this.s = 0; this.prevS = 0; this.x = 0; this.y = 0; this.vy = 0; this.state = 'running'; this.stumbleTimer = 0; this.slideTimer = 0; this.fallTimer = 0; }
}
```

- [ ] Tests PASS. Commit `feat(core): player state machine and physics`.

### Task 5: Spawner

**Files:** Create `src/core/spawner.ts`, `src/core/spawner.test.ts`

**Interfaces:** Produces

```ts
export type ObstacleKind = 'fire' | 'log' | 'branch' | 'gap';
export interface Obstacle { id: number; kind: ObstacleKind; s0: number; s1: number; x0: number; x1: number; y0: number; y1: number; hit: boolean; passed: boolean }
export interface Coin { id: number; s: number; x: number; y: number; collected: boolean }
export const OBSTACLES: Record<ObstacleKind, { depth: number; y0: number; y1: number; lane: boolean; fatal: boolean }>;
export const LANES = [-1.5, 0, 1.5];
export class Spawner {
  constructor(rng: Rng, track: Track, opts?: Partial<SpawnerOptions>);
  readonly coins: Coin[]; readonly obstacles: Obstacle[];
  fill(upTo: number): void;   // lay content up to s = upTo (track must already extend there)
  prune(behind: number): void;
  reset(): void;
}
export interface SpawnerOptions { chunk: number; firstObstacleAt: number; obstacleSpacing: number; turnMargin: number; obstacleChance: number; coinChance: number }
```

- [ ] Test:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { OBSTACLES, Spawner } from './spawner';
import { Track } from './track';

function build(seed: number) {
  const rng = mulberry32(seed); const track = new Track(rng, { turnChance: 0.4 });
  track.extendTo(1500); const sp = new Spawner(rng, track); sp.fill(1400); return { track, sp };
}

describe('Spawner', () => {
  it('lays obstacles only after the first stretch and with spacing', () => {
    const { sp } = build(11);
    expect(sp.obstacles.length).toBeGreaterThan(5);
    const sorted = [...sp.obstacles].sort((a, b) => a.s0 - b.s0);
    expect(sorted[0].s0).toBeGreaterThanOrEqual(60);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].s0 - sorted[i - 1].s0).toBeGreaterThanOrEqual(25);
  });
  it('keeps obstacles and coins away from turn windows', () => {
    const { sp, track } = build(12);
    for (const o of sp.obstacles) expect(track.nearTurnWindow(o.s0, 10)).toBe(false);
    for (const c of sp.coins) expect(track.nearTurnWindow(c.s, 2)).toBe(false);
  });
  it('coin runs do not overlap obstacles', () => {
    const { sp } = build(13);
    expect(sp.coins.length).toBeGreaterThan(20);
    for (const c of sp.coins) for (const o of sp.obstacles) expect(c.s < o.s0 - 1 || c.s > o.s1 + 1).toBe(true);
  });
  it('lane obstacles are one lane wide, others span the track', () => {
    const { sp } = build(14);
    for (const o of sp.obstacles) {
      const spec = OBSTACLES[o.kind];
      expect(o.s1 - o.s0).toBeCloseTo(spec.depth, 5);
      if (spec.lane) expect(o.x1 - o.x0).toBeCloseTo(2, 5); else expect(o.x1 - o.x0).toBeGreaterThan(5);
    }
  });
  it('prune removes passed content and reset clears everything', () => {
    const { sp } = build(15);
    sp.prune(500);
    for (const o of sp.obstacles) expect(o.s1).toBeGreaterThanOrEqual(500);
    for (const c of sp.coins) expect(c.s).toBeGreaterThanOrEqual(500);
    sp.reset(); expect(sp.coins).toHaveLength(0); expect(sp.obstacles).toHaveLength(0);
  });
});
```

- [ ] Implement:

```ts
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
```

- [ ] Tests PASS. Commit `feat(core): spawner for coins and obstacles in track space`.

### Task 6: Collision

**Files:** Create `src/core/collision.ts`, `src/core/collision.test.ts`

**Interfaces:** Produces `sweepObstacles(obstacles: Obstacle[], prevS: number, s: number, lateral: [number, number], vertical: [number, number]): Obstacle[]` (marks `hit`/`passed`), `pickCoins(coins: Coin[], s: number, x: number, y: number, radius: number): Coin[]` (marks `collected`).

- [ ] Test:

```ts
import { describe, expect, it } from 'vitest';
import { pickCoins, sweepObstacles } from './collision';
import type { Coin, Obstacle } from './spawner';

const fire = (): Obstacle => ({ id: 1, kind: 'fire', s0: 10, s1: 11, x0: -1, x1: 1, y0: 0, y1: 0.8, hit: false, passed: false });
const branch = (): Obstacle => ({ id: 2, kind: 'branch', s0: 10, s1: 10.6, x0: -3, x1: 3, y0: 1.0, y1: 2.6, hit: false, passed: false });

describe('sweepObstacles', () => {
  it('hits when a fast step jumps over the obstacle interval on the ground', () => {
    const o = fire();
    expect(sweepObstacles([o], 9, 12, [-0.4, 0.4], [0, 1.8])).toEqual([o]); expect(o.hit).toBe(true);
  });
  it('misses laterally and marks passed', () => {
    const o = fire();
    expect(sweepObstacles([o], 9, 12, [1.6, 2.4], [0, 1.8])).toEqual([]); expect(o.passed).toBe(true);
    expect(sweepObstacles([o], 12, 13, [-0.4, 0.4], [0, 1.8])).toEqual([]);
  });
  it('jump clears fire, slide does not; slide clears branch, jump does not', () => {
    expect(sweepObstacles([fire()], 9, 12, [-0.4, 0.4], [1.0, 2.8])).toEqual([]);
    expect(sweepObstacles([fire()], 9, 12, [-0.4, 0.4], [0, 0.9])).toHaveLength(1);
    expect(sweepObstacles([branch()], 9, 12, [-0.4, 0.4], [0, 0.9])).toEqual([]);
    expect(sweepObstacles([branch()], 9, 12, [-0.4, 0.4], [2.0, 3.8])).toHaveLength(1);
  });
});

describe('pickCoins', () => {
  it('collects within radius once', () => {
    const c: Coin = { id: 1, s: 5, x: 0, y: 0.6, collected: false };
    expect(pickCoins([c], 5.5, 0.3, 0, 1.2)).toEqual([c]);
    expect(pickCoins([c], 5.5, 0.3, 0, 1.2)).toEqual([]);
    const far: Coin = { id: 2, s: 5, x: 0, y: 2.2, collected: false };
    expect(pickCoins([far], 5, 0, 0, 1.2)).toEqual([]);
  });
});
```

- [ ] Implement:

```ts
import type { Coin, Obstacle } from './spawner';

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1;

/** Swept check between the previous and current s so a fast frame cannot skip a thin obstacle. */
export function sweepObstacles(obstacles: Obstacle[], prevS: number, s: number, lateral: [number, number], vertical: [number, number]): Obstacle[] {
  const hits: Obstacle[] = [];
  for (const o of obstacles) {
    if (o.hit || o.passed) continue;
    if (!overlaps(Math.min(prevS, s), Math.max(prevS, s), o.s0, o.s1)) { if (s > o.s1) o.passed = true; continue; }
    if (overlaps(lateral[0], lateral[1], o.x0, o.x1) && overlaps(vertical[0], vertical[1], o.y0, o.y1)) { o.hit = true; hits.push(o); }
    else if (s > o.s1) o.passed = true;
  }
  return hits;
}

export function pickCoins(coins: Coin[], s: number, x: number, y: number, radius: number): Coin[] {
  const got: Coin[] = [];
  for (const c of coins) {
    if (c.collected) continue;
    const d = Math.hypot(c.s - s, c.x - x, c.y - (y + 0.6));
    if (d <= radius) { c.collected = true; got.push(c); }
  }
  return got;
}
```

  (`y + 0.6` compares against the player's mid-body, so a grounded player still picks up coins that hover at 0.6 m; arc coins at 2.2 m need a jump.)

- [ ] Tests PASS. Commit `feat(core): swept collision and coin pickup`.

### Task 7: Game

**Files:** Create `src/core/game.ts`, `src/core/game.test.ts`

**Interfaces:** Produces

```ts
export type GameEvent =
  | { type: 'coin' } | { type: 'hit'; kind: ObstacleKind } | { type: 'turn'; dir: TurnDir }
  | { type: 'fall'; reason: 'missedTurn' | 'wrongTurn' | 'gap' | 'caught' } | { type: 'dead' } | { type: 'jump' } | { type: 'slide' };
export const LOOKAHEAD = 120; export const KEEP_BEHIND = 40;
export class Game {
  constructor(seed: number);
  readonly track: Track; readonly player: Player; readonly spawner: Spawner; readonly buffer: TurnBuffer;
  coins: number; distance: number; score: number; proximity: number; over: boolean;
  fallPose: { x: number; z: number; dir: Vec2; s: number } | null;   // frozen pose when the run ended by falling
  pressTurn(dir: TurnDir, nowMs: number): void;
  tick(dt: number, input: TickInput, nowMs: number): GameEvent[];
  reset(seed?: number): void;
}
```

- [ ] Test:

```ts
import { describe, expect, it } from 'vitest';
import { Game, LOOKAHEAD } from './game';
import { NO_INPUT } from './input';

function findTurnGame(): Game {
  for (let seed = 1; seed < 200; seed++) {
    const g = new Game(seed);
    if (g.track.turnWindows().some((w) => w.corner < LOOKAHEAD)) return g;
  }
  throw new Error('no seed with an early turn');
}
function runUntil(g: Game, pred: () => boolean, maxS = 500, dt = 1 / 120): void {
  let t = 0;
  while (!pred() && g.player.s < maxS) { g.tick(dt, NO_INPUT, t * 1000); t += dt; }
}

describe('Game', () => {
  it('keeps the track and content laid ahead of the player', () => {
    const g = new Game(1);
    runUntil(g, () => g.player.s > 300);
    expect(g.track.end()).toBeGreaterThan(g.player.s + LOOKAHEAD - 1);
    expect(g.track.segments[0].s0 + g.track.segments[0].length).toBeGreaterThanOrEqual(g.player.s - 40 - 20);
  });
  it('accepts a buffered early turn press and preserves x', () => {
    const g = findTurnGame(); const w = g.track.turnWindows()[0];
    g.player.x = 1;
    runUntil(g, () => g.player.s >= w.from - 1);
    g.pressTurn(w.segment.turn!, 0);                 // pressed 1 m (≈67 ms) before the window opens
    const events: ReturnType<Game['tick']> = [];
    runUntil(g, () => { events.push(...g.tick(1 / 120, NO_INPUT, 10)); return w.segment.turnDone || g.player.s > w.to + 1; });
    expect(events.some((e) => e.type === 'turn')).toBe(true);
    expect(g.player.state).not.toBe('falling'); expect(g.player.x).toBe(1);
  });
  it('wrong turn in the window falls, missed turn falls', () => {
    let g = findTurnGame(); let w = g.track.turnWindows()[0];
    runUntil(g, () => g.player.s >= w.from + 0.5);
    g.pressTurn(w.segment.turn === 'left' ? 'right' : 'left', 0);
    expect(g.tick(1 / 120, NO_INPUT, 0).some((e) => e.type === 'fall' && e.reason === 'wrongTurn')).toBe(true);
    g = findTurnGame(); w = g.track.turnWindows()[0];
    const events: ReturnType<Game['tick']> = [];
    runUntil(g, () => { events.push(...g.tick(1 / 120, NO_INPUT, 0)); return g.player.state === 'falling' || g.player.s > w.to + 5; });
    expect(events.some((e) => e.type === 'fall' && e.reason === 'missedTurn')).toBe(true);
    expect(g.fallPose).not.toBeNull();
    runUntil(g, () => g.over, 1e9);
    expect(g.over).toBe(true);
  });
  it('coins raise the score and hits raise proximity; 100 proximity ends the run', () => {
    const g = new Game(2);
    g.spawner.coins.push({ id: 999, s: 3, x: 0, y: 0.6, collected: false });
    runUntil(g, () => g.player.s > 4);
    expect(g.coins).toBe(1); expect(g.score).toBeGreaterThan(10);
    g.proximity = 90;
    g.spawner.obstacles.push({ id: 998, kind: 'fire', s0: g.player.s + 1, s1: g.player.s + 2, x0: -3, x1: 3, y0: 0, y1: 0.8, hit: false, passed: false });
    const events: ReturnType<Game['tick']> = [];
    runUntil(g, () => { events.push(...g.tick(1 / 120, NO_INPUT, 0)); return g.over || g.player.s > 20; });
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(events.some((e) => e.type === 'fall' && e.reason === 'caught')).toBe(true);
  });
});
```

- [ ] Implement:

```ts
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

    if (p.state === 'falling' || p.state === 'dead') {
      if (p.state === 'dead' && !this.deadReported) { this.deadReported = true; this.over = true; events.push({ type: 'dead' }); }
      return events;
    }

    this.distance = p.s;
    this.handleTurns(nowMs, events);
    if (p.state === 'falling') return events;

    for (const c of pickCoins(this.spawner.coins, p.s, p.x, p.y, COIN_RADIUS)) { void c; this.coins++; events.push({ type: 'coin' }); }
    for (const o of sweepObstacles(this.spawner.obstacles, p.prevS, p.s, p.lateral, p.vertical)) {
      events.push({ type: 'hit', kind: o.kind });
      if (OBSTACLES[o.kind].fatal) { this.startFall('gap', events); break; }
      p.stumble(); this.proximity = Math.min(100, this.proximity + PROXIMITY_PER_HIT);
      if (this.proximity >= 100) { this.startFall('caught', events); break; }
    }
    if (p.state !== 'falling') this.proximity = Math.max(0, this.proximity - PROXIMITY_DECAY * dt);

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
```

  Note the missed-turn rule: the spec's `TURN_LATE` keeps the window open for a *late correct press* until 2 m past the corner, but with no press at all the fall starts the moment the corner is passed, so the player visibly runs straight off the edge instead of auto-following the bend.

- [ ] Tests PASS. Commit `feat(core): game loop, turn acceptance, proximity and events`.

### Task 8: Views (Three.js)

**Files:** Move `src/scene.ts` → `src/view/scene.ts` (unchanged). Create `src/view/camera.ts`, `src/view/trackView.ts`, `src/view/playerView.ts`, `src/view/coinView.ts`, `src/view/obstacleView.ts`. Delete `src/camera.ts`, `src/path/`, `src/player.ts`, `src/obstacles/`, `src/collectibles/`, `src/powerups/`, `src/monkey.ts`.

**Interfaces:** Each view exposes `init(scene)`, `update(game, dt)` (and `reset()` where it holds meshes). Camera: `initCamera()`, `updateCamera(game, dt)`, `snapCamera(game)`, exported `camera`.

Key rule: every world position comes from `game.track.sample(s, x, y)`; the only exception is the frozen `game.fallPose` used while `player.state` is `falling`/`dead`.

- [ ] `trackView.ts`: keep a `Map<segmentId, THREE.Group>`; each frame add groups for segments not yet in the map and dispose groups whose segment left `game.track.segments`. Build a straight as one floor box (`TRACK_HALF_WIDTH*2 × 0.5 × SEGMENT_LENGTH`) plus two wall boxes, positioned at `sample(s0 + L/2)` and rotated with `quaternion.setFromUnitVectors((0,0,1), (dir.x,0,dir.z))`. Build a turn as an incoming floor (`runIn + HALF_WIDTH` long ending at the corner + half width), an outgoing floor starting at the corner, a corner square, the outer walls, and a bright arrow cone at the corner pointing along `outDir`. Reuse the material colours from the prototype's `PathSegment.ts`.
- [ ] `playerView.ts`: capsule (cylinder + sphere + eyes) as in the prototype; `update`: if falling/dead, `pos = fallPose + dir * (player.s - fallPose.s) ... ` — the player's `s` is frozen when falling, so instead animate forward with `fallPose.dir * cfg.speed * elapsedFall` where `elapsedFall = fallDuration - fallTimer`, `y = player.y`, and roll the mesh. Otherwise `sample(player.s, player.x, player.y)`, mesh yaw = `atan2(dir.x, dir.z) + π`, squash when sliding.
- [ ] `coinView.ts` / `obstacleView.ts`: one `THREE.InstancedMesh` per kind (coins: gold cylinder; fire: orange box; log: brown cylinder lying across; branch: green box; gap: black flat box at y −0.3 marking the missing floor). Each frame rebuild instance matrices from live spawner arrays (skip `collected`); set `count`. Sizes come from `OBSTACLES[kind]` (`depth`, `x1−x0`, `y1−y0`), position from `sample(mid s, mid x, mid y)`.
- [ ] `camera.ts`: target position `sample(player.s − 8, player.x * 0.3, 5.5)`, look-at `sample(player.s + 6, player.x * 0.5, 1.2)`; lerp both with factor `1 − exp(−6 dt)`; while falling use `fallPose`.
- [ ] Type check → PASS (`npx tsc --noEmit` in the dev container). Commit `feat(view): render the track-space model with three.js`.

### Task 9: Wiring, input adapter, UI shell

**Files:** Create `src/ui/domInput.ts`; rewrite `src/main.ts`; modify `src/gameState.ts` (trim to the UI-facing fields the HUD/GameOver read: `screen`, `score`, `coins`, `highScore`, `proximityBar`, `activePowerUp`, `powerUpTimer`); delete `src/input.ts`, `src/score.ts`; update `index.html` title to “Temple Runner” and copy; update `AI.md` module map.

- [ ] `domInput.ts`: listens to keydown/keyup; exposes `pollInput(): TickInput` (drift from A/D held, `jump`/`slide` true only on the frame they were first pressed), `onTurn(cb: (dir: TurnDir, nowMs: number) => void)` invoked directly from the keydown handler (so buffering starts at the real press time, not the next frame), `wasPausePressed(): boolean`, `endFrame()`.
- [ ] `main.ts`: `const game = new Game(seed)`; RAF loop with `dt = min(elapsed, 0.1)`; on `playing`: `events = game.tick(dt, pollInput(), performance.now())`, map events to `playSound` (`coin`, `stumble` for hit, `jump`, `slide`, `gameOver` on dead), sync `gameState.{score,coins,proximityBar}` from `game`, update views and camera, `updateHUD()`; on `dead` show game over and set high score. Screens (menu/pause/game over) as before.
- [ ] Build inside Docker (`npm run build`), run `docker compose --profile dev up dev`, play: three turns both directions, jump fire, slide branch, hit log, fall at a missed turn. Fix what is off.
- [ ] Commit `feat: wire the track-space core into the game loop and UI` and push to `main`.

### Task 10: Deploy check

- [ ] Register the Komodo stack `temple-runner` (repo `wzin/temple-runner`, server mail.ziniewicz.eu, compose `compose.yaml`) and its GitHub webhook — manual step in the Komodo UI, done by the owner.
- [ ] After the first deploy: `curl -sI https://temple.ziniewicz.eu | head -1` → `HTTP/2 200`.

## Self-review

- Spec coverage: track space (T2), player (T4), turns + buffering (T3, T7), spawning (T5), collision (T6), rendering (T8), module layout (T8–T9), tests (T1–T7), deployment (done in scaffolding commit; T10 verifies).
- Placeholders: none; T8/T9 describe view code in prose because it is Three.js placement with no logic, and every referenced symbol is defined in T1–T7.
- Type consistency: `TickInput`, `TurnDir`, `Obstacle`, `Coin`, `Sample`, `TurnWindow`, `GameEvent` names are used identically across tasks.
