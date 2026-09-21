import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { OBSTACLES, Spawner } from './spawner';
import { Track } from './track';

function build(seed: number) {
  const rng = mulberry32(seed); const track = new Track(rng, { turnChance: 0.4, forkChance: 0 }); // forks stop generation; tested in track/game
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
  it('keeps obstacles and coins away from turn windows, with a time-based margin after corners', () => {
    const { sp, track } = build(12);
    for (const o of sp.obstacles) {
      expect(track.nearTurnWindow(o.s0, 10)).toBe(false);
      for (const w of track.turnWindows()) { if (o.s0 > w.corner) expect(o.s0 - w.corner).toBeGreaterThanOrEqual(0.9 * 15 - 1e-6); else expect(w.corner - o.s1).toBeGreaterThanOrEqual(10 - 1e-6); }
    }
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
      const step = 0.77 * 15 + 6; // fireStep at the default tuning speed of 15
      for (let i = 0; i + 2 < fires.length; i++) {
        if (Math.abs(fires[i + 1].s0 - fires[i].s0 - step) < 1e-6 && Math.abs(fires[i + 2].s0 - fires[i + 1].s0 - step) < 1e-6) { rows++; expect(fires[i].s0).toBeGreaterThanOrEqual(600); }
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
      if (spec.lane) expect(o.x1 - o.x0).toBeCloseTo(2, 5);
      else if (o.kind === 'halfgap') expect(o.x1 - o.x0).toBeCloseTo(3.4, 5);   // one side plus a little past the centre
      else if (o.kind === 'chasm') { expect(o.x1 - o.x0).toBeGreaterThan(1); expect(o.x1 - o.x0).toBeLessThan(5); }   // one of the two pieces beside the planks
      else expect(o.x1 - o.x0).toBeGreaterThan(5);
    }
  });
  it('prune removes passed content and reset clears everything', () => {
    const { sp } = build(15);
    sp.prune(500);
    for (const o of sp.obstacles) expect(o.s1).toBeGreaterThanOrEqual(500);
    for (const c of sp.coins) expect(c.s).toBeGreaterThanOrEqual(500);
    sp.reset(); expect(sp.coins).toHaveLength(0); expect(sp.obstacles).toHaveLength(0);
  });

  it('a branch after a gap is placed beyond the landing point at any speed', () => {
    for (const speed of [15, 20, 24]) {
      const rng = mulberry32(77); const track = new Track(rng, { turnChance: 0, forkChance: 0 }); track.extendTo(3000);
      const sp = new Spawner(rng, track, { tuning: () => ({ obstacleChance: 1, obstacleSpacing: 30, speed }) });
      sp.fill(2900);
      const gaps = sp.obstacles.filter((o) => o.kind === 'gap');
      let pairs = 0;
      for (const g of gaps) {
        const branch = sp.obstacles.find((o) => o.kind === 'branch' && o.s0 > g.s1 && o.s0 < g.s1 + 40);
        if (!branch) continue;
        pairs++;
        // Jumping from just before the gap, the runner lands at gap start + airtime*speed; the branch must be later.
        expect(branch.s0).toBeGreaterThanOrEqual(g.s0 + 0.77 * speed + 2);
      }
      expect(pairs).toBeGreaterThan(0);
    }
  });
});

describe('rubies', () => {
  it('lays a ruby gem roughly every 2–3 minutes of running (about one per 2.6 km), never right at a corner', () => {
    let rubies = 0; let metres = 0;
    for (let seed = 100; seed < 112; seed++) {
      const { sp, track } = build(seed);
      const far = track.end();
      metres += far;
      for (const p of sp.powerUps) if (p.kind === 'ruby') { rubies++; expect(p.s).toBeGreaterThanOrEqual(500); }
    }
    const perKm = rubies / (metres / 1000);
    expect(perKm).toBeGreaterThan(0.1);
    expect(perKm).toBeLessThan(0.9);
  });
});
