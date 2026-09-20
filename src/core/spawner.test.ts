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
    // Patterns place several obstacles close together; the gap between *groups* keeps the spacing.
    let groupStart = sorted[0].s0;
    for (let i = 1; i < sorted.length; i++) {
      const dist = sorted[i].s0 - sorted[i - 1].s1;
      if (sorted[i].s0 - groupStart > 12) { expect(dist).toBeGreaterThanOrEqual(15); groupStart = sorted[i].s0; }
    }
  });
  it('keeps obstacles and coins away from turn windows', () => {
    const { sp, track } = build(12);
    for (const o of sp.obstacles) expect(track.nearTurnWindow(o.s0, 10)).toBe(false);
    for (const c of sp.coins) expect(track.nearTurnWindow(c.s, 2)).toBe(false);
  });
  it('ground coins do not overlap obstacles (arcs over logs may)', () => {
    const { sp } = build(13);
    expect(sp.coins.length).toBeGreaterThan(20);
    for (const c of sp.coins) {
      if (c.y >= 1.0) continue;
      for (const o of sp.obstacles) expect(c.s < o.s0 - 1 || c.s > o.s1 + 1).toBe(true);
    }
  });
  it('patterns respect lane extents and appear only after their minimum distance', () => {
    let fires2 = 0; let rows = 0;
    for (let seed = 20; seed < 40; seed++) {
      const { sp } = build(seed);
      const bySegment = new Map<number, typeof sp.obstacles>();
      for (const o of sp.obstacles) { const k = Math.round(o.s0 * 10); bySegment.set(k, [...(bySegment.get(k) ?? []), o]); }
      for (const group of bySegment.values()) {
        if (group.length === 2 && group.every((o) => o.kind === 'fire')) { fires2++; expect(group[0].s0).toBeGreaterThanOrEqual(200); expect(group[0].x0).not.toBe(group[1].x0); }
      }
      const fires = sp.obstacles.filter((o) => o.kind === 'fire').sort((a, b) => a.s0 - b.s0);
      for (let i = 0; i + 2 < fires.length; i++) {
        if (Math.abs(fires[i + 1].s0 - fires[i].s0 - 4) < 1e-6 && Math.abs(fires[i + 2].s0 - fires[i + 1].s0 - 4) < 1e-6) { rows++; expect(fires[i].s0).toBeGreaterThanOrEqual(600); }
      }
    }
    expect(fires2).toBeGreaterThan(0); expect(rows).toBeGreaterThan(0);
  });
  it('lays power-ups away from turns and obstacles, not before 120 m', () => {
    let total = 0;
    for (let seed = 40; seed < 50; seed++) {
      const { sp, track } = build(seed);
      for (const p of sp.powerUps) {
        total++;
        expect(p.s).toBeGreaterThanOrEqual(120);
        expect(track.nearTurnWindow(p.s, 4)).toBe(false);
        for (const o of sp.obstacles) expect(p.s < o.s0 - 2 || p.s > o.s1 + 2).toBe(true);
      }
    }
    expect(total).toBeGreaterThan(3);
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
