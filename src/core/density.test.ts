import { expect, it } from 'vitest';
import { Game } from './game';
import { NO_INPUT } from './input';

it('leaves at most 20% of straight segments without an obstacle over a 1.2 km run', () => {
  const stats = { segs: 0, empty: 0, turnSegs: 0, straightEmpty: 0, straights: 0 }; const details: string[] = [];
  for (let seed = 1; seed <= 3; seed++) {
    const g = new Game(seed);
    let ms = 0; const seen = new Set<number>();
    // Run with autopilot for ~1600 m so difficulty and lookahead behave like a real game.
    let ticks = 0;
    while (g.player.s < 1200 && !g.over && ticks++ < 200000) {
      const w = g.track.turnWindowAt(g.player.s);
      if (w && w.segment.turn && !w.segment.turnDone) g.pressTurn(w.segment.turn, ms);
      else if (w && w.segment.fork && !w.segment.resolved) g.pressTurn('left', ms);
      g.spawner.obstacles.forEach((o) => { if (o.s0 < g.player.s + 3) o.passed = true; });   // never die
      const t0 = Date.now(); g.tick(1 / 60, NO_INPUT, ms); ms += 1000 / 60;
      if (Date.now() - t0 > 400) { console.log('SLOW seed', seed, 's', g.player.s.toFixed(1), 'ms', Date.now() - t0, 'segs', g.track.segments.length, 'end', g.track.end().toFixed(0), 'obstacles', g.spawner.obstacles.length, 'coins', g.spawner.coins.length); }
      // Judge each segment once, right after the runner leaves it (its obstacles are still in memory).
      for (const seg of g.track.segments) {
        const end = seg.s0 + seg.length;
        if (end > g.player.s || end < g.player.s - 5 || seen.has(seg.id) || seg.s0 < 60) continue;
        seen.add(seg.id);
        stats.segs++;
        const has = g.spawner.obstacles.some((o) => o.s0 < end && o.s1 > seg.s0);
        if (seg.kind === 'turn') stats.turnSegs++; else stats.straights++;
        if (!has) { stats.empty++; if (seg.kind !== 'turn') { stats.straightEmpty++; if (details.length < 14) {
          const corners = g.track.segments.filter((x) => x.kind === 'turn').map((x) => x.s0 + x.runIn);
          const prevC = Math.max(...corners.filter((c) => c < seg.s0), -1); const nextC = Math.min(...corners.filter((c) => c > seg.s0), 1e9);
          const near = g.spawner.obstacles.filter((o) => o.s1 > seg.s0 - 30 && o.s0 < end + 30).map((o) => `${o.kind}@${o.s0.toFixed(0)}-${o.s1.toFixed(0)}`).join(',');
          details.push(`s0=${seg.s0} prevCorner=${prevC >= 0 ? (seg.s0 - prevC).toFixed(0) : '-'} nextCorner=${nextC < 1e9 ? (nextC - end).toFixed(0) : '-'} speed=${g.player.speed.toFixed(0)} near=[${near}]`);
        } } }
      }
    }
  }
  // Turn segments cannot hold obstacles (the corner square and its approach are kept clear), so the rule is about straights.
  expect(stats.straights).toBeGreaterThan(50);
  expect(stats.straightEmpty / stats.straights).toBeLessThanOrEqual(0.2);
  if (details.length) console.log('empty straights:', details.join(' | '));
});

it('the density knob really thins the track: density 5 leaves most straights empty', async () => {
  const { setObstacleDensity } = await import('./difficulty');
  setObstacleDensity(5);
  try {
    const g = new Game(2);
    let ms = 0; let ticks = 0; const seen = new Set<number>(); let straights = 0; let empty = 0;
    while (g.player.s < 800 && !g.over && ticks++ < 200000) {
      const w = g.track.turnWindowAt(g.player.s);
      if (w && w.segment.turn && !w.segment.turnDone) g.pressTurn(w.segment.turn, ms);
      else if (w && w.segment.fork && !w.segment.resolved) g.pressTurn('left', ms);
      g.spawner.obstacles.forEach((o) => { if (o.s0 < g.player.s + 3) o.passed = true; });
      g.tick(1 / 60, NO_INPUT, ms); ms += 1000 / 60;
      for (const seg of g.track.segments) {
        const end = seg.s0 + seg.length;
        if (end > g.player.s || end < g.player.s - 5 || seen.has(seg.id) || seg.s0 < 60 || seg.kind !== 'straight') continue;
        seen.add(seg.id); straights++;
        if (!g.spawner.obstacles.some((o) => o.s0 < end && o.s1 > seg.s0)) empty++;
      }
    }
    expect(straights).toBeGreaterThan(15);
    expect(empty / straights).toBeGreaterThan(0.5);
  } finally { setObstacleDensity(50); }
});
