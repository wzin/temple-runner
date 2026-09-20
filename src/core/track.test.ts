import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { SEGMENT_LENGTH, TURN_EARLY, TURN_LATE, Track, rightOf, turnLeft, turnRight } from './track';

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
