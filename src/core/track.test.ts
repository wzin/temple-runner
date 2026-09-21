import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { SEGMENT_LENGTH, Segment, TURN_EARLY, TURN_LATE, Track, rightOf, turnLeft, turnRight } from './track';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('heading helpers', () => {
  const v = (d: { x: number; z: number }) => [d.x + 0, d.z + 0]; // +0 normalises -0
  it('right of north (-z) is +x', () => { expect(v(rightOf({ x: 0, z: -1 }))).toEqual([1, 0]); });
  it('left of north is west, right of north is east', () => {
    expect(v(turnLeft({ x: 0, z: -1 }))).toEqual([-1, 0]);
    expect(v(turnRight({ x: 0, z: -1 }))).toEqual([1, 0]);
  });
});

describe('Track generation', () => {
  it('starts with straights and always follows a turn with a straight', () => {
    const t = new Track(mulberry32(3), { turnChance: 0.9 });
    t.extendTo(2000);
    const kinds = t.segments.map((s) => s.kind);
    expect(kinds.slice(0, 3)).toEqual(['straight', 'straight', 'straight']);
    // Collision avoidance may occasionally force a turn early; it must stay rare.
    let turns = 0; let early = 0;
    for (let i = 0; i < kinds.length - 2; i++) {
      if (kinds[i] === 'turn') { turns++; if (kinds[i + 1] !== 'straight') early++; }
    }
    expect(turns).toBeGreaterThan(5);
    expect(early / turns).toBeLessThan(0.1);
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
    expect(t.turnWindowAt(c)?.strictFrom).toBe(c - TURN_EARLY);
    expect(t.turnWindowAt(c + TURN_LATE - 0.1)?.segment).toBe(turn);
    expect(t.turnWindowAt(c - TURN_EARLY - 0.1)).toBeNull();
    turn.turnDone = true;
    expect(t.turnWindowAt(c)).toBeNull();
    expect(t.nearTurnWindow(c - TURN_EARLY - 5, 10)).toBe(true);
    expect(t.nearTurnWindow(c - TURN_EARLY - 11, 10)).toBe(false);
  });
});

describe('forks', () => {
  function trackWithFork() {
    const t = new Track(mulberry32(9), { turnChance: 1, forkChance: 1, forkMinS: 0 });
    t.extendTo(500);
    return t;
  }
  it('stops extending at an unresolved fork and continues after resolving', () => {
    const t = trackWithFork();
    const fork = t.pendingFork();
    expect(fork).not.toBeNull();
    expect(t.segments[t.segments.length - 1]).toBe(fork);
    // The main path stops at the fork; the pre-generated branches carry the usable end further.
    expect(t.segments.every((sg) => sg.s0 + sg.length <= fork!.s0 + SEGMENT_LENGTH)).toBe(true);
    expect(t.end()).toBeGreaterThan(fork!.s0 + SEGMENT_LENGTH);
    const mainCount = t.segments.length;
    t.extendTo(500);
    expect(t.segments.length).toBe(mainCount);   // main path does not grow past a pending fork
    t.resolveFork(fork!, 'right');
    expect(fork!.turn).toBe('right');
    expect(fork!.resolved).toBe(true);
    const next = t.segments[mainCount];
    expect(next.dir).toEqual(fork!.outDir);
    const end = t.sample(fork!.s0 + fork!.length - 1e-6);
    expect(Math.hypot(end.x - next.start.x, end.z - next.start.z)).toBeLessThan(1e-3);
    // A straight follows a resolved fork, like any turn.
    expect(t.segments[mainCount].kind).toBe('straight');
  });
  it('does not fork before forkMinS', () => {
    const t = new Track(mulberry32(9), { turnChance: 1, forkChance: 1, forkMinS: 300 });
    t.extendTo(250);
    expect(t.segments.some((s) => s.fork)).toBe(false);
    expect(t.segments.some((s) => s.kind === 'turn')).toBe(true);
  });
});

describe('fork branches are pre-generated', () => {
  it('both continuations exist before the choice and the chosen one becomes the path', () => {
    const t = new Track(mulberry32(21), { turnChance: 1, forkChance: 1, forkMinS: 0 });
    t.extendTo(400);
    const fork = t.pendingFork()!;
    expect(t.branches).not.toBeNull();
    const forkEnd = fork.s0 + fork.length;
    for (const dir of ['left', 'right'] as const) {
      const b = t.branches![dir];
      expect(b.segments.length).toBeGreaterThan(3);
      expect(b.segments[0].s0).toBe(forkEnd);
      expect(b.segments.every((s) => s.branch === dir && !s.fork)).toBe(true);
      expect(b.nextS).toBeGreaterThan(forkEnd + 100);
      // Continuity: the branch starts where the fork's run-out ends for that direction.
      const outDir = dir === 'left' ? turnLeft(fork.dir) : turnRight(fork.dir);
      expect(b.segments[0].dir).toEqual(outDir);
    }
    expect(t.allSegments().length).toBe(t.segments.length + t.branches!.left.segments.length + t.branches!.right.segments.length);
    expect(t.end()).toBeGreaterThan(forkEnd + 100);
    const leftSegs = t.branches!.left.segments;
    t.resolveFork(fork, 'left');
    expect(t.branches).toBeNull();
    expect(t.segments.slice(-leftSegs.length)).toEqual(leftSegs);
    expect(leftSegs.every((s) => s.branch === undefined)).toBe(true);
    // Continuous in space through the fork and along the adopted branch.
    for (let i = 1; i < t.segments.length; i++) {
      const prev = t.segments[i - 1]; const cur = t.segments[i];
      const end = t.sample(prev.s0 + prev.length - 1e-9);
      expect(Math.hypot(end.x - cur.start.x, end.z - cur.start.z)).toBeLessThan(1e-3);
    }
    const more = t.extendTo(t.end() + 60);
    expect(more.length).toBeGreaterThan(0);
  });
});

describe('the track never runs into itself', () => {
  type R = { chain: string; idx: number; minX: number; maxX: number; minZ: number; maxZ: number };
  /** Corridor rectangles (true width) of every laid segment piece, tagged with chain and position in it. */
  function rects(t: Track): R[] {
    const out: R[] = [];
    const chains: [string, Segment[]][] = [['main', t.segments]];
    if (t.branches) chains.push(['left', t.branches.left.segments], ['right', t.branches.right.segments]);
    for (const [chain, segs] of chains) {
      segs.forEach((seg, idx) => {
        const pieces: [number, number][] = seg.kind === 'turn' ? [[seg.s0, seg.s0 + seg.runIn], [seg.s0 + seg.runIn, seg.s0 + seg.length]] : [[seg.s0, seg.s0 + seg.length]];
        if (seg.fork && !seg.resolved) pieces.pop();
        for (const [a, b] of pieces) {
          const p = t.sampleSegment(seg, a + 1e-6); const q = t.sampleSegment(seg, b - 1e-6);
          out.push({ chain, idx, minX: Math.min(p.x, q.x) - 3, maxX: Math.max(p.x, q.x) + 3, minZ: Math.min(p.z, q.z) - 3, maxZ: Math.max(p.z, q.z) + 3 });
        }
      });
    }
    return out;
  }
  const overlap = (p: R, q: R, shrink: number) =>
    p.minX + shrink < q.maxX - shrink && q.minX + shrink < p.maxX - shrink && p.minZ + shrink < q.maxZ - shrink && q.minZ + shrink < p.maxZ - shrink;
  /** Same segment, neighbours in one chain, or a branch's first segment against the fork (last main segment). */
  const adjacent = (a: R, b: R, mainLen: number) => {
    if (a.chain === b.chain) return Math.abs(a.idx - b.idx) <= 1;
    const [m, o] = a.chain === 'main' ? [a, b] : b.chain === 'main' ? [b, a] : [null, null];
    if (!m || !o) return false;
    return m.idx === mainLen - 1 && o.idx === 0;
  };
  function check(t: Track, label: string) {
    const rs = rects(t);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      if (adjacent(rs[i], rs[j], t.segments.length)) continue;
      expect(overlap(rs[i], rs[j], 0.5), `${label}: ${rs[i].chain}#${rs[i].idx} vs ${rs[j].chain}#${rs[j].idx}`).toBe(false);
    }
  }

  it('frequent turns, one straight between them, many seeds: corridors never overlap', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const t = new Track(mulberry32(seed), { turnChance: 1, straightsAfterTurn: 1, forkChance: 0 });
      t.extendTo(1500);
      check(t, `seed ${seed}`);
    }
  });

  it('game-like run over 3 km (300 m ahead, 40 m kept behind): kept corridors never overlap', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = new Track(mulberry32(seed), { turnChance: 0.5, forkChance: 0 });
      for (let s = 0; s <= 3000; s += 20) {
        t.extendTo(s + 300);
        t.dropBehind(s - 40);
        check(t, `seed ${seed} at s=${s}`);
      }
    }
  });

  it('the same run with forks resolved as they come', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = new Track(mulberry32(seed), { turnChance: 0.5, forkChance: 0.5, forkMinS: 100 });
      const rng = mulberry32(seed + 1000);
      for (let s = 0; s <= 2000; s += 20) {
        t.extendTo(s + 300);
        const fork = t.pendingFork();
        if (fork && t.cornerOf(fork) < s + 30) t.resolveFork(fork, rng() < 0.5 ? 'left' : 'right');
        t.dropBehind(s - 40);
        check(t, `seed ${seed} at s=${s}`);
      }
    }
  });

  it('holds with forks and their pre-generated branches', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const t = new Track(mulberry32(seed), { turnChance: 0.6, forkChance: 0.6, forkMinS: 0 });
      t.extendTo(900);
      check(t, `seed ${seed}`);
    }
  });
});

describe('dead branches', () => {
  it('never resolves a fork into a boxed-in branch and only collapses forks beyond the fog', () => {
    // Find a seed whose first fork is pending, mark one side dead by hand and choose it.
    for (let seed = 1; seed < 400; seed++) {
      const track = new Track(mulberry32(seed), { turnChance: 0.5, forkChance: 1 });
      track.extendTo(600);
      const fork = track.segments.find((s) => s.fork && !s.resolved);
      if (!fork) continue;
      const priv = track as unknown as { deadBranches: Set<'left' | 'right'> };
      expect(track.collapseDistance).toBeGreaterThanOrEqual(160);
      priv.deadBranches.add('right');
      expect(track.deadBranch()).toBe('right');
      const taken = track.resolveFork(fork, 'right');
      expect(taken).toBe('left');
      expect(fork.turn).toBe('left');
      expect(track.deadBranch()).toBeNull();
      return;
    }
    throw new Error('no fork found in 400 seeds');
  });
});

describe('ghost branch', () => {
  it('keeps the branch the player did not take visible until the corner is well behind', () => {
    for (let seed = 1; seed < 400; seed++) {
      const track = new Track(mulberry32(seed), { turnChance: 0.5, forkChance: 1 });
      track.extendTo(600);
      const fork = track.segments.find((s) => s.fork && !s.resolved);
      if (!fork) continue;
      const before = track.allSegments().filter((s) => s.branch === 'right').length;
      if (before === 0) continue;
      const corner = fork.s0 + fork.runIn;
      track.resolveFork(fork, 'left');
      expect(track.allSegments().filter((s) => s.branch === 'right').length).toBe(before);   // still drawn
      track.dropBehind(corner - 10);
      expect(track.allSegments().some((s) => s.branch === 'right')).toBe(true);
      track.dropBehind(corner + 21);
      expect(track.allSegments().some((s) => s.branch === 'right')).toBe(false);
      return;
    }
    throw new Error('no fork found');
  });
});
