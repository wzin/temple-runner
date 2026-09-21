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
/**
 * Turn window: a correct press counts from `from` (generous lead), a wrong press only
 * falls from `strictFrom` (the reaction zone), anything up to `to` past the corner.
 */
export interface TurnWindow { segment: Segment; corner: number; from: number; strictFrom: number; to: number }

export const TRACK_HALF_WIDTH = 3;
export const SEGMENT_LENGTH = 20;
export const TURN_EARLY = 6;
export const TURN_LATE = 2;

export function rightOf(d: Vec2): Vec2 { return { x: -d.z, z: d.x }; }
export function turnLeft(d: Vec2): Vec2 { return { x: d.z, z: -d.x }; }
export function turnRight(d: Vec2): Vec2 { return { x: -d.z, z: d.x }; }

export interface TrackOptions { turnChance?: number | (() => number); straightsAfterTurn?: number; initialStraights?: number; forkChance?: number; forkMinS?: number }

interface GenState { nextS: number; nextStart: Vec2; nextDir: Vec2; straightsSinceTurn: number; segments: Segment[] }

/** Axis-aligned rectangle in the XZ plane. */
interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Lateral half-extent of laid corridors when testing a candidate against them: with the true
 * half-width of 3, parallel corridors must be more than 11 m apart centre to centre (the grid
 * puts them at 10 or 20 m), and any crossing is rejected. Ends are not padded, so a corridor may
 * run up to another one head-on across the usual 10 m.
 */
export const CLEARANCE_HALF_WIDTH = 8;

/** Rectangle around the centre line a→b: `lateral` half-width to the sides, `along` extension past the ends. */
function rectAlong(a: Vec2, b: Vec2, lateral: number, along: number): Rect {
  const alongZ = Math.abs(a.x - b.x) < 1e-6;   // segments are axis-aligned
  const hx = alongZ ? lateral : along; const hz = alongZ ? along : lateral;
  return { minX: Math.min(a.x, b.x) - hx, maxX: Math.max(a.x, b.x) + hx, minZ: Math.min(a.z, b.z) - hz, maxZ: Math.max(a.z, b.z) + hz };
}
function rectsOverlap(p: Rect, q: Rect, shrink: number): boolean {
  return p.minX + shrink < q.maxX - shrink && q.minX + shrink < p.maxX - shrink && p.minZ + shrink < q.maxZ - shrink && q.minZ + shrink < p.maxZ - shrink;
}
/** Rectangles covering a segment's centre line pieces (run-in and run-out for turns). */
function footprint(start: Vec2, dir: Vec2, runIn: number, outDir: Vec2, runOut: number, lateral: number, along: number): Rect[] {
  const corner = { x: start.x + dir.x * runIn, z: start.z + dir.z * runIn };
  const rects = [rectAlong(start, corner, lateral, along)];
  if (runOut > 0) rects.push(rectAlong(corner, { x: corner.x + outDir.x * runOut, z: corner.z + outDir.z * runOut }, lateral, along));
  return rects;
}

/** How far past a pending fork each branch is generated ahead of time. */
export const BRANCH_AHEAD = 100;
/** Lookahead depth (segments) of the self-avoidance search. */
const LOOK = 5;
const SHAPES: { kind: 'straight' | 'turn'; turn?: TurnDir }[] = [{ kind: 'straight' }, { kind: 'turn', turn: 'left' }, { kind: 'turn', turn: 'right' }];

export class Track {
  readonly segments: Segment[] = [];
  /** Pre-generated continuations of a pending fork, one per direction; rendered but not yet part of the path. */
  branches: Record<TurnDir, GenState> | null = null;
  /** Last `dropBehind` position: the player runs about KEEP_BEHIND ahead of it (the track's only clue where they are). */
  private behindS = -Infinity;
  /** A boxed-in branch may turn the fork into a plain corner only when the corner is at least this far ahead (beyond the fog). */
  collapseDistance = 160;
  /** Branches that ran out of room; they stop growing instead of collapsing a fork the player is already approaching. */
  private deadBranches = new Set<TurnDir>();
  private nextId = 0;
  private nextS = 0;
  private nextStart: Vec2 = { x: 0, z: 0 };
  private nextDir: Vec2 = { x: 0, z: -1 };
  private straightsSinceTurn = 0;
  private laid = 0;
  private readonly turnChance: () => number;
  /** Metres before / after the corner where a turn press is accepted; the game scales both with speed. */
  turnEarly = TURN_EARLY;
  turnLate = TURN_LATE;
  /** Metres before the corner where a *correct* press is already accepted (≥ turnEarly). */
  turnLead = TURN_EARLY;
  private readonly straightsAfterTurn: number;
  private readonly initialStraights: number;
  private readonly forkChance: number;
  private readonly forkMinS: number;

  constructor(private readonly rng: Rng, opts: TrackOptions = {}) {
    const tc = opts.turnChance ?? 0.15;
    this.turnChance = typeof tc === 'function' ? tc : () => tc;
    this.straightsAfterTurn = opts.straightsAfterTurn ?? 1;
    this.initialStraights = opts.initialStraights ?? 3;
    this.forkChance = opts.forkChance ?? 0.7;   // most corners are T-junctions
    this.forkMinS = opts.forkMinS ?? 150;
  }

  end(): number {
    if (this.branches) return Math.min(this.branches.left.nextS, this.branches.right.nextS);
    return this.nextS;
  }

  /** Main path plus speculative branch segments, for rendering. */
  /** Everything to draw: main path, both pending branches, and the branch the player did not take (kept as a
   *  visible "ghost" until the corner is well behind, so nothing pops out of existence in front of the runner). */
  allSegments(): Segment[] {
    const live = this.liveSegments();
    return this.ghost ? [...live, ...this.ghost.segments] : live;
  }
  /** Segments that matter for generation and collisions (no ghost). */
  private liveSegments(): Segment[] {
    if (!this.branches) return this.segments;
    return [...this.segments, ...this.branches.left.segments, ...this.branches.right.segments];
  }
  private ghost: { segments: Segment[]; corner: number } | null = null;

  /** The last segment, if it is a fork still waiting for the player's choice. */
  pendingFork(): Segment | null {
    const last = this.segments[this.segments.length - 1];
    return last && last.fork && !last.resolved ? last : null;
  }

  extendTo(s: number): Segment[] {
    const added: Segment[] = [];
    while (this.nextS <= s && !this.pendingFork()) added.push(this.appendFree());
    if (this.branches) {
      for (const dir of ['left', 'right'] as const) {
        const b = this.branches[dir];
        while (this.branches && !this.deadBranches.has(dir) && b.nextS <= s) {
          const seg = this.appendToFree(b, dir);
          if (!seg) { this.branchBoxedIn(dir); break; }
          added.push(seg);
        }
        if (!this.branches) break;
      }
      // A collapsed fork continues as main path.
      while (this.nextS <= s && !this.pendingFork()) added.push(this.appendFree());
    }
    return added;
  }

  /** The side of the pending fork that stopped growing (boxed in), if any. */
  deadBranch(): TurnDir | null {
    if (!this.branches) return null;
    for (const d of ['left', 'right'] as const) if (this.deadBranches.has(d)) return d;
    return null;
  }

  /** Resolve the fork towards `dir`; a dead (boxed-in) branch is never taken — the other side is used. Returns the side taken. */
  resolveFork(seg: Segment, dir: TurnDir): TurnDir {
    if (!seg.fork || seg.resolved) return seg.turn ?? dir;
    const other: TurnDir = dir === 'left' ? 'right' : 'left';
    if (this.deadBranches.has(dir) && !this.deadBranches.has(other)) dir = other;
    seg.turn = dir;
    seg.outDir = dir === 'left' ? turnLeft(seg.dir) : turnRight(seg.dir);
    seg.resolved = true;
    const chosen = this.branches?.[dir];
    const abandoned = this.branches?.[other];
    this.ghost = abandoned && abandoned.segments.length ? { segments: abandoned.segments, corner: this.cornerOf(seg) } : null;
    if (chosen) {
      for (const b of chosen.segments) { delete b.branch; this.segments.push(b); }
      this.nextS = chosen.nextS; this.nextStart = chosen.nextStart; this.nextDir = chosen.nextDir; this.straightsSinceTurn = chosen.straightsSinceTurn;
    } else {
      this.nextStart = this.exactEnd(seg);
      this.nextDir = seg.outDir;
      this.straightsSinceTurn = 0;
    }
    this.branches = null;
    this.deadBranches.clear();
    return dir;
  }

  /** Windows on the main path; with `includeBranches` also those on speculative branches (for spawning). */
  turnWindowsForSpawning(): TurnWindow[] {
    const main = this.turnWindows();
    if (!this.branches) return main;
    const extra = [...this.branches.left.segments, ...this.branches.right.segments].filter((s) => s.kind === 'turn').map((segment) => {
      const corner = this.cornerOf(segment);
      return { segment, corner, from: corner - Math.max(this.turnLead, this.turnEarly), strictFrom: corner - this.turnEarly, to: corner + this.turnLate };
    });
    return [...main, ...extra];
  }

  /**
   * Every world placement of a track coordinate: one on the main path, or one per
   * speculative branch when `s` lies beyond a pending fork. Content (coins,
   * obstacles) is drawn at all of them so both branches preview what is coming.
   */
  samplesAt(s: number, x = 0, y = 0): Sample[] {
    const main = this.segmentAt(s);
    if (main) return [this.sampleSegment(main, s, x, y)];
    if (!this.branches) return [];
    const out: Sample[] = [];
    for (const dir of ['left', 'right'] as const) {
      const seg = this.branches[dir].segments.find((sg) => s >= sg.s0 && s < sg.s0 + sg.length);
      if (seg) out.push(this.sampleSegment(seg, s, x, y));
    }
    return out;
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
    this.behindS = s;
    if (this.ghost && s > this.ghost.corner + 20) this.ghost = null;   // s is player.s − 40: the corner is 60 m back
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
      return { segment, corner, from: corner - Math.max(this.turnLead, this.turnEarly), strictFrom: corner - this.turnEarly, to: corner + this.turnLate };
    });
  }

  turnWindowAt(s: number): TurnWindow | null {
    return this.turnWindows().find((w) => !w.segment.turnDone && s >= w.from && s <= w.to) ?? null;
  }

  nearTurnWindow(s: number, margin: number): boolean {
    return this.turnWindows().some((w) => s >= w.from - margin && s <= w.to + margin);
  }

  /** Rectangles of every laid segment (main path and branches), for self-intersection tests. */
  private occupied(exclude: Set<Segment>): Rect[] {
    const out: Rect[] = [];
    for (const seg of this.liveSegments()) {
      if (exclude.has(seg)) continue;
      const runOut = seg.kind === 'turn' ? seg.length - seg.runIn : 0;
      if (seg.fork && !seg.resolved) {
        // An unresolved fork occupies its run-in and both run-outs.
        out.push(...footprint(seg.start, seg.dir, seg.runIn, turnLeft(seg.dir), seg.length - seg.runIn, CLEARANCE_HALF_WIDTH, 0));
        out.push(...footprint(seg.start, seg.dir, seg.runIn, turnRight(seg.dir), seg.length - seg.runIn, CLEARANCE_HALF_WIDTH, 0));
      } else {
        out.push(...footprint(seg.start, seg.dir, seg.runIn, seg.outDir, runOut, CLEARANCE_HALF_WIDTH, 0));
      }
    }
    return out;
  }

  /**
   * Would a segment of this shape, laid from `start` along `dir`, run into existing track?
   * The segment it continues from is excluded (they touch by construction). The test uses the
   * true corridor half-width for the candidate against clearance-padded rectangles of the rest.
   */
  private blocked(start: Vec2, dir: Vec2, kind: 'straight' | 'turn', turn: TurnDir | undefined, previous: Segment | undefined, extraExclude: Segment[] = []): boolean {
    const runIn = kind === 'turn' ? SEGMENT_LENGTH / 2 : SEGMENT_LENGTH;
    const outDir = turn === 'left' ? turnLeft(dir) : turn === 'right' ? turnRight(dir) : dir;
    const candidate = footprint(start, dir, runIn, outDir, kind === 'turn' ? SEGMENT_LENGTH - runIn : 0, TRACK_HALF_WIDTH, 0);
    const exclude = new Set<Segment>(extraExclude);
    if (previous) exclude.add(previous);
    const others = this.occupied(exclude);
    // Shrink slightly so corridors that merely touch at a shared boundary do not count.
    return candidate.some((c) => others.some((o) => rectsOverlap(c, o, 0.01)));
  }

  private cornerPoint(seg: Segment): Vec2 {
    return { x: seg.start.x + seg.dir.x * seg.runIn, z: seg.start.z + seg.dir.z * seg.runIn };
  }

  private chooseKind(): 'straight' | 'turn' {
    if (this.laid < this.initialStraights) return 'straight';
    if (this.straightsSinceTurn < this.straightsAfterTurn) return 'straight';
    return chance(this.rng, this.turnChance()) ? 'turn' : 'straight';
  }

  /**
   * Lay the next main-path segment, avoiding existing track. Preference order: the kind the
   * generator wanted, then the alternatives; a turn only towards a free side; a fork only when
   * both sides are free.
   */
  /** End pose of a candidate shape laid from (start, dir). */
  private endPose(start: Vec2, dir: Vec2, kind: 'straight' | 'turn', turn: TurnDir | undefined): { start: Vec2; dir: Vec2 } {
    const runIn = kind === 'turn' ? SEGMENT_LENGTH / 2 : SEGMENT_LENGTH;
    const outDir = turn === 'left' ? turnLeft(dir) : turn === 'right' ? turnRight(dir) : dir;
    const c = { x: start.x + dir.x * runIn, z: start.z + dir.z * runIn };
    const out = SEGMENT_LENGTH - runIn;
    return { start: { x: c.x + outDir.x * out, z: c.z + outDir.z * out }, dir: outDir };
  }

  /**
   * Pick the next shape from a preference list: the first candidate that is free *and* leaves
   * at least one free continuation; else the first free one; else the first (boxed in, rare).
   */
  private chooseFree(start: Vec2, dir: Vec2, previous: Segment | undefined, prefs: { kind: 'straight' | 'turn'; turn?: TurnDir }[], strict?: false): { kind: 'straight' | 'turn'; turn?: TurnDir };
  private chooseFree(start: Vec2, dir: Vec2, previous: Segment | undefined, prefs: { kind: 'straight' | 'turn'; turn?: TurnDir }[], strict: true): { kind: 'straight' | 'turn'; turn?: TurnDir } | null;
  private chooseFree(start: Vec2, dir: Vec2, previous: Segment | undefined, prefs: { kind: 'straight' | 'turn'; turn?: TurnDir }[], strict = false): { kind: 'straight' | 'turn'; turn?: TurnDir } | null {
    // Safety first: how far can the track still go after each candidate (up to LOOK segments), then how
    // much open space lies ahead, and only then the shape the generator wanted. This keeps the walk out of
    // pockets it has built for itself; the fallback below only fires when every option is already dead.
    const scored = prefs
      .map((c, i) => ({ c, i, blocked: this.blocked(start, dir, c.kind, c.turn, previous) }))
      .filter((x) => !x.blocked)
      .map((x) => { const e = this.endPose(start, dir, x.c.kind, x.c.turn); return { ...x, reach: this.reach(e.start, e.dir, LOOK), open: this.openness(e.start, e.dir) }; })
      .sort((p, q) => q.reach - p.reach || q.open - p.open || p.i - q.i);
    if (scored.length === 0) return strict ? null : prefs[0];
    return scored[0].c;
  }

  /** Longest sequence of further segments (≤ limit) that avoids existing track from this pose. */
  private reach(start: Vec2, dir: Vec2, limit: number): number {
    if (limit === 0) return 0;
    let best = 0;
    for (const n of SHAPES) {
      if (this.blocked(start, dir, n.kind, n.turn, undefined)) continue;
      const e = this.endPose(start, dir, n.kind, n.turn);
      const d = 1 + this.reach(e.start, e.dir, limit - 1);
      if (d > best) best = d;
      if (best === limit) break;
    }
    return best;
  }

  /** How many straight segments fit ahead before hitting existing track (capped). */
  private openness(start: Vec2, dir: Vec2): number {
    let n = 0; let pose = { start, dir };
    while (n < 6 && !this.blocked(pose.start, pose.dir, 'straight', undefined, undefined)) { pose = this.endPose(pose.start, pose.dir, 'straight', undefined); n++; }
    return n;
  }

  private prefs(wanted: 'straight' | 'turn'): { kind: 'straight' | 'turn'; turn?: TurnDir }[] {
    const first = pick(this.rng, ['left', 'right'] as const);
    const second: TurnDir = first === 'left' ? 'right' : 'left';
    const turns = [{ kind: 'turn' as const, turn: first }, { kind: 'turn' as const, turn: second }];
    return wanted === 'turn' ? [...turns, { kind: 'straight' }] : [{ kind: 'straight' }, ...turns];
  }

  private appendFree(): Segment {
    const wanted = this.chooseKind();
    const previous = this.segments[this.segments.length - 1];
    const start = this.nextStart; const dir = this.nextDir;
    if (wanted === 'turn' && this.nextS >= this.forkMinS && chance(this.rng, this.forkChance)) {
      // A fork needs both sides free, each with somewhere to go afterwards.
      const both = (['left', 'right'] as const).every((d) => {
        if (this.blocked(start, dir, 'turn', d, previous)) return false;
        const e = this.endPose(start, dir, 'turn', d);
        return this.reach(e.start, e.dir, 3) >= 3;
      });
      if (both) return this.append('turn', undefined, true);
    }
    const c = this.chooseFree(start, dir, previous, this.prefs(wanted));
    return this.append(c.kind, c.turn, false);
  }

  private chooseKindFor(g: GenState, _allowFork: boolean): 'straight' | 'turn' {
    if (g.straightsSinceTurn < this.straightsAfterTurn) return 'straight';
    return chance(this.rng, this.turnChance()) ? 'turn' : 'straight';
  }

  /** Branch version of appendFree: same preference order, tested against everything laid so far. */
  /** Returns null when the branch has nowhere left to go without crossing existing track. */
  private appendToFree(g: GenState, branch: TurnDir): Segment | null {
    const wanted = this.chooseKindFor(g, false);
    const previous = g.segments[g.segments.length - 1] ?? this.segments[this.segments.length - 1];
    const c = this.chooseFree(g.nextStart, g.nextDir, previous, this.prefs(wanted), true);
    if (!c) return null;
    return this.appendTo(g, c.kind, branch, c.turn);
  }

  /**
   * A branch cannot continue. Far from the player the fork quietly becomes a plain corner towards the
   * other branch; near the player (the window may already be open) the fork must not change, so the
   * branch just stops growing. If the player then picks it, the main path continues from its end.
   */
  private branchBoxedIn(dir: TurnDir): void {
    const fork = this.pendingFork();
    if (!fork) return;
    const playerS = this.behindS + 40;
    const other: TurnDir = dir === 'left' ? 'right' : 'left';
    if (this.cornerOf(fork) - playerS > this.collapseDistance && !this.deadBranches.has(other)) this.collapseFork(other);
    else this.deadBranches.add(dir);
  }

  /**
   * A speculative branch is boxed in: turn the fork into a plain corner towards the other branch
   * (which keeps its pre-generated segments). Happens far ahead of the player, so at most a distant pop.
   */
  private collapseFork(keep: TurnDir): void {
    const fork = this.pendingFork();
    if (!fork || !this.branches) return;
    fork.fork = false;
    this.resolveFork(fork, keep); // resolveFork checks `fork.fork`, so set the turn data directly below if needed
    if (!fork.resolved) {
      fork.turn = keep; fork.outDir = keep === 'left' ? turnLeft(fork.dir) : turnRight(fork.dir); fork.resolved = true;
      const chosen = this.branches[keep];
      for (const b of chosen.segments) { delete b.branch; this.segments.push(b); }
      this.nextS = chosen.nextS; this.nextStart = chosen.nextStart; this.nextDir = chosen.nextDir; this.straightsSinceTurn = chosen.straightsSinceTurn;
      this.branches = null;
    }
  }

  /** Append a non-fork segment to a branch generator state. */
  private appendTo(g: GenState, kind: 'straight' | 'turn', branch: TurnDir, turnDir: TurnDir | undefined): Segment {
    const dir = g.nextDir;
    const turn = kind === 'turn' ? (turnDir ?? pick(this.rng, ['left', 'right'] as const)) : undefined;
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

  private append(kind: 'straight' | 'turn', turnDir: TurnDir | undefined, fork: boolean): Segment {
    const dir = this.nextDir;
    const turn = kind === 'turn' && !fork ? (turnDir ?? pick(this.rng, ['left', 'right'] as const)) : undefined;
    const outDir = turn === 'left' ? turnLeft(dir) : turn === 'right' ? turnRight(dir) : dir;
    const runIn = kind === 'turn' ? SEGMENT_LENGTH / 2 : SEGMENT_LENGTH;
    const seg: Segment = { id: this.nextId++, kind, turn, s0: this.nextS, length: SEGMENT_LENGTH, start: this.nextStart, dir, runIn, outDir, turnDone: false, fork, resolved: !fork };
    this.segments.push(seg);
    this.nextS += SEGMENT_LENGTH;
    if (fork) {
      this.laid++;
      // Both continuations exist before the choice, so nothing pops in when the player turns.
      this.branches = { left: this.startBranch(seg, 'left'), right: this.startBranch(seg, 'right') };
      // extendTo() grows the branches to the same lookahead as the main path.
      for (const d of ['left', 'right'] as const) {
        const b = this.branches[d];
        while (b.nextS <= seg.s0 + seg.length + BRANCH_AHEAD) this.appendToFree(b, d);
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
