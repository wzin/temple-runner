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
  /** T-junction: the player picks left or right; until then outDir is a placeholder. */
  fork: boolean;
  resolved: boolean;
  /** Set on speculative segments generated behind a pending fork, before the player chose. */
  branch?: TurnDir;
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

export interface TrackOptions { turnChance?: number | (() => number); straightsAfterTurn?: number; initialStraights?: number; forkChance?: number; forkMinS?: number }

interface GenState { nextS: number; nextStart: Vec2; nextDir: Vec2; straightsSinceTurn: number; segments: Segment[] }

/** How far past a pending fork each branch is generated ahead of time. */
export const BRANCH_AHEAD = 100;

export class Track {
  readonly segments: Segment[] = [];
  /** Pre-generated continuations of a pending fork, one per direction; rendered but not yet part of the path. */
  branches: Record<TurnDir, GenState> | null = null;
  private nextId = 0;
  private nextS = 0;
  private nextStart: Vec2 = { x: 0, z: 0 };
  private nextDir: Vec2 = { x: 0, z: -1 };
  private straightsSinceTurn = 0;
  private laid = 0;
  private readonly turnChance: () => number;
  /** Metres before the corner where a turn press is accepted; the game scales it with speed. */
  turnEarly = TURN_EARLY;
  private readonly straightsAfterTurn: number;
  private readonly initialStraights: number;
  private readonly forkChance: number;
  private readonly forkMinS: number;

  constructor(private readonly rng: Rng, opts: TrackOptions = {}) {
    const tc = opts.turnChance ?? 0.15;
    this.turnChance = typeof tc === 'function' ? tc : () => tc;
    this.straightsAfterTurn = opts.straightsAfterTurn ?? 2;
    this.initialStraights = opts.initialStraights ?? 3;
    this.forkChance = opts.forkChance ?? 0.35;
    this.forkMinS = opts.forkMinS ?? 150;
  }

  end(): number {
    if (this.branches) return Math.min(this.branches.left.nextS, this.branches.right.nextS);
    return this.nextS;
  }

  /** Main path plus speculative branch segments, for rendering. */
  allSegments(): Segment[] {
    if (!this.branches) return this.segments;
    return [...this.segments, ...this.branches.left.segments, ...this.branches.right.segments];
  }

  /** The last segment, if it is a fork still waiting for the player's choice. */
  pendingFork(): Segment | null {
    const last = this.segments[this.segments.length - 1];
    return last && last.fork && !last.resolved ? last : null;
  }

  extendTo(s: number): Segment[] {
    const added: Segment[] = [];
    while (this.nextS <= s && !this.pendingFork()) added.push(this.append(this.chooseKind()));
    if (this.branches) {
      for (const dir of ['left', 'right'] as const) {
        const b = this.branches[dir];
        while (b.nextS <= s) added.push(this.appendTo(b, this.chooseKindFor(b, false), dir));
      }
    }
    return added;
  }

  /** Commit a fork to one branch so generation can continue behind it. */
  resolveFork(seg: Segment, dir: TurnDir): void {
    if (!seg.fork || seg.resolved) return;
    seg.turn = dir;
    seg.outDir = dir === 'left' ? turnLeft(seg.dir) : turnRight(seg.dir);
    seg.resolved = true;
    const chosen = this.branches?.[dir];
    if (chosen) {
      for (const b of chosen.segments) { delete b.branch; this.segments.push(b); }
      this.nextS = chosen.nextS; this.nextStart = chosen.nextStart; this.nextDir = chosen.nextDir; this.straightsSinceTurn = chosen.straightsSinceTurn;
    } else {
      this.nextStart = this.exactEnd(seg);
      this.nextDir = seg.outDir;
      this.straightsSinceTurn = 0;
    }
    this.branches = null;
  }

  /** Windows on the main path; with `includeBranches` also those on speculative branches (for spawning). */
  turnWindowsForSpawning(): TurnWindow[] {
    const main = this.turnWindows();
    if (!this.branches) return main;
    const extra = [...this.branches.left.segments, ...this.branches.right.segments].filter((s) => s.kind === 'turn').map((segment) => {
      const corner = this.cornerOf(segment);
      return { segment, corner, from: corner - this.turnEarly, to: corner + TURN_LATE };
    });
    return [...main, ...extra];
  }

  /** Sample within a specific segment (works for speculative branch segments too). */
  sampleSegment(seg: Segment, s: number, x = 0, y = 0): Sample {
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
    return this.sampleSegment(seg, s, x, y);
  }

  cornerOf(seg: Segment): number { return seg.s0 + seg.runIn; }

  turnWindows(): TurnWindow[] {
    return this.segments.filter((s) => s.kind === 'turn').map((segment) => {
      const corner = this.cornerOf(segment);
      return { segment, corner, from: corner - this.turnEarly, to: corner + TURN_LATE };
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
    return chance(this.rng, this.turnChance()) ? 'turn' : 'straight';
  }

  private chooseKindFor(g: GenState, _allowFork: boolean): 'straight' | 'turn' {
    if (g.straightsSinceTurn < this.straightsAfterTurn) return 'straight';
    return chance(this.rng, this.turnChance()) ? 'turn' : 'straight';
  }

  /** Append a non-fork segment to a branch generator state. */
  private appendTo(g: GenState, kind: 'straight' | 'turn', branch: TurnDir): Segment {
    const dir = g.nextDir;
    const turn = kind === 'turn' ? pick(this.rng, ['left', 'right'] as const) : undefined;
    const outDir = turn === 'left' ? turnLeft(dir) : turn === 'right' ? turnRight(dir) : dir;
    const runIn = kind === 'turn' ? SEGMENT_LENGTH / 2 : SEGMENT_LENGTH;
    const seg: Segment = { id: this.nextId++, kind, turn, s0: g.nextS, length: SEGMENT_LENGTH, start: g.nextStart, dir, runIn, outDir, turnDone: false, fork: false, resolved: true, branch };
    g.segments.push(seg);
    g.nextS += SEGMENT_LENGTH;
    g.nextStart = this.exactEnd(seg);
    g.nextDir = outDir;
    g.straightsSinceTurn = kind === 'turn' ? 0 : g.straightsSinceTurn + 1;
    return seg;
  }

  private append(kind: 'straight' | 'turn'): Segment {
    const dir = this.nextDir;
    const fork = kind === 'turn' && this.nextS >= this.forkMinS && chance(this.rng, this.forkChance);
    const turn = kind === 'turn' && !fork ? pick(this.rng, ['left', 'right'] as const) : undefined;
    const outDir = turn === 'left' ? turnLeft(dir) : turn === 'right' ? turnRight(dir) : dir;
    const runIn = kind === 'turn' ? SEGMENT_LENGTH / 2 : SEGMENT_LENGTH;
    const seg: Segment = { id: this.nextId++, kind, turn, s0: this.nextS, length: SEGMENT_LENGTH, start: this.nextStart, dir, runIn, outDir, turnDone: false, fork, resolved: !fork };
    this.segments.push(seg);
    this.nextS += SEGMENT_LENGTH;
    if (fork) {
      this.laid++;
      // Both continuations exist before the choice, so nothing pops in when the player turns.
      this.branches = { left: this.startBranch(seg, 'left'), right: this.startBranch(seg, 'right') };
      for (const d of ['left', 'right'] as const) {
        const b = this.branches[d];
        while (b.nextS <= seg.s0 + seg.length + BRANCH_AHEAD) this.appendTo(b, this.chooseKindFor(b, false), d);
      }
      return seg;
    }
    this.nextStart = this.exactEnd(seg);
    this.nextDir = outDir;
    this.laid++;
    this.straightsSinceTurn = kind === 'turn' ? 0 : this.straightsSinceTurn + 1;
    return seg;
  }

  private startBranch(fork: Segment, dir: TurnDir): GenState {
    const outDir = dir === 'left' ? turnLeft(fork.dir) : turnRight(fork.dir);
    const c = this.cornerPoint(fork); const out = fork.length - fork.runIn;
    return { nextS: fork.s0 + fork.length, nextStart: { x: c.x + outDir.x * out, z: c.z + outDir.z * out }, nextDir: outDir, straightsSinceTurn: 0, segments: [] };
  }

  private exactEnd(seg: Segment): Vec2 {
    const c = this.cornerPoint(seg); const out = seg.length - seg.runIn;
    return { x: c.x + seg.outDir.x * out, z: c.z + seg.outDir.z * out };
  }
}
