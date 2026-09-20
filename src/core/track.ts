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
