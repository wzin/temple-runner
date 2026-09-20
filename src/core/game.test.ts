import { describe, expect, it } from 'vitest';
import { Game, GameEvent, LOOKAHEAD } from './game';
import { NO_INPUT, TickInput } from './input';

/** Drives a Game with a consistent clock so buffered presses and ticks agree on "now". */
class Sim {
  ms = 0;
  constructor(readonly g: Game, readonly dt = 1 / 120) {}
  press(dir: 'left' | 'right'): void { this.g.pressTurn(dir, this.ms); }
  tick(input: TickInput = NO_INPUT): GameEvent[] { const ev = this.g.tick(this.dt, input, this.ms); this.ms += this.dt * 1000; return ev; }
  /** Tick until pred() or the run is over; with autopilot the correct turn is pressed when a window opens. */
  run(pred: () => boolean, opts: { autopilot?: boolean; forkChoice?: 'left' | 'right'; noObstacles?: boolean; maxTicks?: number } = {}): GameEvent[] {
    const events: GameEvent[] = []; let n = 0;
    while (!pred() && !this.g.over) {
      if (opts.noObstacles) this.g.spawner.obstacles.length = 0;
      if (opts.autopilot) {
        const w = this.g.track.turnWindowAt(this.g.player.s);
        // Forced turns are taken; unresolved forks are left to the test unless it asks for a default choice.
        if (w && w.segment.turn) this.press(w.segment.turn);
        else if (w && opts.forkChoice) this.press(opts.forkChoice);
      }
      events.push(...this.tick());
      if (++n > (opts.maxTicks ?? 200_000)) throw new Error('Sim.run runaway');
    }
    return events;
  }
}

function gameWithEarlyTurn(): { g: Game; sim: Sim } {
  for (let seed = 1; seed < 200; seed++) {
    const g = new Game(seed);
    if (g.track.turnWindows().some((w) => w.corner < LOOKAHEAD)) return { g, sim: new Sim(g) };
  }
  throw new Error('no seed with an early turn');
}

describe('Game', () => {
  it('keeps the track and content laid ahead of the player', () => {
    const g = new Game(1); const sim = new Sim(g);
    sim.run(() => g.player.s > 300, { autopilot: true, forkChoice: 'left', noObstacles: true });
    expect(g.player.s).toBeGreaterThan(300);
    expect(g.track.end()).toBeGreaterThan(g.player.s + LOOKAHEAD - 1);
    const first = g.track.segments[0];
    expect(first.s0 + first.length).toBeGreaterThanOrEqual(g.player.s - 40 - 20);
  });

  it('accepts a buffered early turn press and preserves x', () => {
    const { g, sim } = gameWithEarlyTurn(); const w = g.track.turnWindows()[0];
    g.player.x = 1;
    sim.run(() => g.player.s >= w.from - 1, { noObstacles: true });
    sim.press(w.segment.turn!);                      // ≈67 ms before the window opens
    const events = sim.run(() => w.segment.turnDone || g.player.s > w.to + 1, { noObstacles: true });
    expect(events.some((e) => e.type === 'turn')).toBe(true);
    expect(g.player.state).toBe('running');
    expect(g.player.x).toBe(1);
  });

  it('a press that is too early expires and the turn is missed', () => {
    const { g, sim } = gameWithEarlyTurn(); const w = g.track.turnWindows()[0];
    sim.run(() => g.player.s >= w.from - 5, { noObstacles: true });        // well before the window, ttl is 150 ms
    sim.press(w.segment.turn!);
    const events = sim.run(() => g.player.state === 'falling' || g.player.s > w.to + 5, { noObstacles: true });
    expect(events.some((e) => e.type === 'fall' && e.reason === 'missedTurn')).toBe(true);
  });

  it('wrong turn in the window falls, missed turn falls and freezes a pose', () => {
    let { g, sim } = gameWithEarlyTurn(); let w = g.track.turnWindows()[0];
    sim.run(() => g.player.s >= w.strictFrom + 0.5, { noObstacles: true });   // inside the reaction zone a wrong press is fatal
    sim.press(w.segment.turn === 'left' ? 'right' : 'left');
    expect(sim.tick().some((e) => e.type === 'fall' && e.reason === 'wrongTurn')).toBe(true);

    ({ g, sim } = gameWithEarlyTurn()); w = g.track.turnWindows()[0];
    // First window of the run, nobody presses: the corner is missed once the late window closes.
    const events = sim.run(() => g.player.state === 'falling' || g.player.s > w.to + 5, { noObstacles: true });
    expect(events.some((e) => e.type === 'fall' && e.reason === 'missedTurn')).toBe(true);
    expect(g.fallPose).not.toBeNull();
    expect(g.player.s).toBeLessThan(w.to + 2);
    const tail = sim.run(() => g.over);
    expect(g.over).toBe(true);
    expect(tail.some((e) => e.type === 'dead')).toBe(true);
  });

  it('coins raise the score and hits raise proximity; 100 proximity ends the run', () => {
    const g = new Game(2); const sim = new Sim(g);
    g.spawner.coins.push({ id: 999, s: 3, x: 0, y: 0.6, collected: false, value: 1 });
    const coinEvents = sim.run(() => g.player.s > 4);
    expect(coinEvents.filter((e) => e.type === 'coin')).toHaveLength(1);
    expect(g.coins).toBe(1); expect(g.score).toBeGreaterThan(10);

    g.proximity = 90;
    g.spawner.obstacles.push({ id: 998, kind: 'fire', s0: g.player.s + 1, s1: g.player.s + 2, x0: -3, x1: 3, y0: 0, y1: 0.8, hit: false, passed: false });
    const events = sim.run(() => g.player.state === 'falling' || g.player.s > 20);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(events.some((e) => e.type === 'fall' && e.reason === 'caught')).toBe(true);
  });

  it('jump and slide events fire once per action', () => {
    const g = new Game(3); const sim = new Sim(g);
    const moves = (ev: GameEvent[]) => ev.filter((e) => e.type === 'jump' || e.type === 'slide');
    expect(moves(sim.tick({ drift: 0, jump: true, slide: false }))).toEqual([{ type: 'jump' }]);
    expect(moves(sim.tick({ drift: 0, jump: true, slide: false }))).toEqual([]);
    sim.run(() => g.player.state === 'running');
    expect(moves(sim.tick({ drift: 0, jump: false, slide: true }))).toEqual([{ type: 'slide' }]);
  });

  it('speeds up with distance and widens the turn window accordingly', () => {
    const g = new Game(4); const sim = new Sim(g);
    const early = g.track.turnEarly;
    sim.run(() => g.player.s > 1600, { autopilot: true, forkChoice: 'right', noObstacles: true });
    expect(g.over).toBe(false);
    expect(g.player.speed).toBeGreaterThan(20);
    expect(g.track.turnEarly).toBeGreaterThan(early);
  });

  it('magnet pulls coins in, shield absorbs one hit, boost ignores obstacles and auto-turns', () => {
    const g = new Game(5); const sim = new Sim(g);
    g.spawner.obstacles.length = 0; g.spawner.coins.length = 0; g.spawner.powerUps.length = 0;
    g.spawner.powerUps.push({ id: 900, kind: 'magnet', s: 2, x: 0, y: 1, taken: false });
    g.spawner.coins.push({ id: 901, s: 12, x: 1.5, y: 0.6, collected: false, value: 1 });
    let events = sim.run(() => g.player.s > 14);
    expect(events.some((e) => e.type === 'powerup' && e.kind === 'magnet')).toBe(true);
    expect(g.coins).toBe(1); // lateral offset 1.5 would normally be out of the 1.2 radius

    g.spawner.powerUps.push({ id: 902, kind: 'shield', s: g.player.s + 2, x: 0, y: 1, taken: false });
    g.spawner.obstacles.push({ id: 903, kind: 'fire', s0: g.player.s + 5, s1: g.player.s + 6, x0: -3, x1: 3, y0: 0, y1: 0.8, hit: false, passed: false });
    events = sim.run(() => g.player.s > g.spawner.obstacles[0].s1 + 1);
    expect(events.some((e) => e.type === 'shielded')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(g.shield).toBe(false); expect(g.proximity).toBe(0);

    g.spawner.powerUps.push({ id: 904, kind: 'boost', s: g.player.s + 2, x: 0, y: 1, taken: false });
    g.spawner.obstacles.push({ id: 905, kind: 'gap', s0: g.player.s + 6, s1: g.player.s + 9, x0: -3, x1: 3, y0: -10, y1: 0, hit: false, passed: false });
    const startS = g.player.s;
    events = sim.run(() => g.player.s > startS + 12);
    expect(events.some((e) => e.type === 'powerup' && e.kind === 'boost')).toBe(true);
    expect(g.player.state).toBe('running');
    expect(g.player.speed).toBeGreaterThan(20);
    // A turn arriving during boost is taken automatically.
    const w = g.track.turnWindows().find((tw) => !tw.segment.turnDone && tw.corner > g.player.s);
    if (w && w.corner - g.player.s < g.player.speed * 4) {
      const ev = sim.run(() => g.player.s > w.corner + 1);
      expect(ev.some((e) => e.type === 'turn')).toBe(true);
    }
  });

  it('land event fires once when a jump ends', () => {
    const g = new Game(6); const sim = new Sim(g);
    sim.tick({ drift: 0, jump: true, slide: false });
    const ev = sim.run(() => g.player.state === 'running');
    expect(ev.filter((e) => e.type === 'land')).toHaveLength(1);
  });

  it('boost ending on the corner tick and wrong presses during boost do not kill', () => {
    // Wrong press while boosting is ignored.
    let { g, sim } = gameWithEarlyTurn(); let w = g.track.turnWindows()[0];
    g.spawner.obstacles.length = 0;
    sim.run(() => g.player.s >= w.from - 30);
    g.spawner.powerUps.push({ id: 950, kind: 'boost', s: g.player.s + 1, x: g.player.x, y: 1, taken: false });
    sim.run(() => g.boosting);
    sim.run(() => g.player.s >= w.from + 0.5);
    sim.press(w.segment.turn === 'left' ? 'right' : 'left');
    let events = sim.run(() => g.player.s > w.corner + 1);
    expect(events.some((e) => e.type === 'fall')).toBe(false);
    expect(events.some((e) => e.type === 'turn')).toBe(true);

    // Boost timer runs out exactly as the corner is crossed: grace keeps the auto-turn.
    ({ g, sim } = gameWithEarlyTurn()); w = g.track.turnWindows()[0];
    g.spawner.obstacles.length = 0;
    sim.run(() => g.player.s >= w.corner - 3);
    g.active = { kind: 'boost', timer: 0.02 };
    events = sim.run(() => g.player.s > w.corner + 1);
    expect(events.some((e) => e.type === 'powerupEnd' && e.kind === 'boost')).toBe(true);
    expect(events.some((e) => e.type === 'fall')).toBe(false);
    expect(g.player.state).toBe('running');
  });

  it('forks: either direction is accepted, generation continues, a missed fork falls', () => {
    const forkGame = () => {
      for (let seed = 1; seed < 400; seed++) {
        const g = new Game(seed);
        const sim = new Sim(g);
        sim.run(() => g.track.segments.some((sg) => sg.fork && !sg.resolved) || g.player.s > 900, { autopilot: true, noObstacles: true });
        const fork = g.track.segments.find((sg) => sg.fork && !sg.resolved);
        if (fork && !g.over) return { g, sim, fork };
      }
      throw new Error('no fork found');
    };
    for (const dir of ['left', 'right'] as const) {
      const { g, sim, fork } = forkGame();
      const w = g.track.turnWindows().find((tw) => tw.segment === fork)!;
      sim.run(() => g.player.s >= w.from + 0.5, { autopilot: true, noObstacles: true });
      const endBefore = g.track.end();
      sim.press(dir);
      const events = sim.run(() => g.player.s > w.corner + 2, { noObstacles: true });
      expect(events.some((e) => e.type === 'turn' && e.dir === dir)).toBe(true);
      expect(fork.turn).toBe(dir);
      expect(g.track.pendingFork()).toBeNull();
      expect(g.track.end()).toBeGreaterThanOrEqual(endBefore);
      expect(g.track.segments.some((sg) => sg.s0 > fork.s0 && sg.dir.x === fork.outDir.x && sg.dir.z === fork.outDir.z)).toBe(true);
      expect(g.player.state).toBe('running');
    }
    const { g, sim, fork } = forkGame();
    const w = g.track.turnWindows().find((tw) => tw.segment === fork)!;
    const events = sim.run(() => g.player.down || g.player.s > w.to + 5, { autopilot: true, noObstacles: true });
    expect(events.some((e) => e.type === 'fall' && e.reason === 'missedTurn')).toBe(true);
  });

  it('spawner never lays content past the laid track', () => {
    const g = new Game(11); const sim = new Sim(g);
    sim.run(() => g.track.pendingFork() !== null || g.player.s > 900, { autopilot: true, noObstacles: true });
    const end = g.track.end();
    for (const c of g.spawner.coins) expect(c.s).toBeLessThan(end);
    for (const pu of g.spawner.powerUps) expect(pu.s).toBeLessThan(end);
  });

  it('score always equals floor(distance) + 10 * coins, including on the tick the run ends', () => {
    const { g, sim } = gameWithEarlyTurn(); const w = g.track.turnWindows()[0];
    g.spawner.obstacles.length = 0;
    sim.run(() => g.over, { noObstacles: true });
    expect(g.player.s).toBeGreaterThan(w.corner);
    expect(g.score).toBe(Math.floor(g.distance) + g.coins * 10);
  });

  it('magnet still collects coins while boosting', () => {
    const g = new Game(8); const sim = new Sim(g);
    g.spawner.obstacles.length = 0; g.spawner.coins.length = 0; g.spawner.powerUps.length = 0;
    g.active = { kind: 'magnet', timer: 10 };
    g.player.speedScale = 2.4; // ~36 m/s like a late boost
    for (let i = 0; i < 6; i++) g.spawner.coins.push({ id: 700 + i, s: 20 + i * 3, x: 1.5, y: 0.6, collected: false, value: 1 });
    sim.run(() => g.player.s > 60, { noObstacles: true });
    expect(g.coins).toBe(6);
  });

  it('a correct press up to a second early is accepted; an early wrong press is ignored', () => {
    let { g, sim } = gameWithEarlyTurn(); let w = g.track.turnWindows()[0];
    g.spawner.obstacles.length = 0;
    // 0.9 s before the corner (outside the 0.4 s reaction zone, inside the 1 s lead).
    sim.run(() => g.player.s >= w.corner - 0.9 * g.player.speed, { noObstacles: true });
    sim.press(w.segment.turn!);
    let events = sim.run(() => g.player.s > w.corner + 1, { noObstacles: true });
    expect(events.some((e) => e.type === 'turn')).toBe(true);
    expect(g.player.state).toBe('running');

    ({ g, sim } = gameWithEarlyTurn()); w = g.track.turnWindows()[0];
    g.spawner.obstacles.length = 0;
    sim.run(() => g.player.s >= w.corner - 0.9 * g.player.speed, { noObstacles: true });
    sim.press(w.segment.turn === 'left' ? 'right' : 'left');      // wrong, but early: ignored
    events = sim.run(() => g.player.s >= w.corner - 0.3 * g.player.speed, { noObstacles: true });
    expect(events.some((e) => e.type === 'fall')).toBe(false);
    sim.press(w.segment.turn!);                                     // then the right one
    events = sim.run(() => g.player.s > w.corner + 1, { noObstacles: true });
    expect(events.some((e) => e.type === 'turn')).toBe(true);
  });
});
