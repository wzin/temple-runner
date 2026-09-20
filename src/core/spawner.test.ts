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
