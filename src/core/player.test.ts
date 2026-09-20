import { describe, expect, it } from 'vitest';
import { NO_INPUT } from './input';
import { DEFAULT_PLAYER, Player } from './player';

function run(p: Player, seconds: number, input = NO_INPUT, dt = 1 / 120) {
  for (let t = 0; t < seconds; t += dt) p.tick(dt, input);
}

describe('Player', () => {
  it('runs forward at speed and clamps lateral drift', () => {
    const p = new Player();
    run(p, 1, { drift: 1, jump: false, slide: false });
    expect(p.s).toBeCloseTo(DEFAULT_PLAYER.speed, 0);
    expect(p.x).toBeCloseTo(DEFAULT_PLAYER.maxX, 5);
  });
  it('jump lasts ~0.75 s and reaches ~2.2 m', () => {
    const p = new Player();
    p.tick(1 / 120, { drift: 0, jump: true, slide: false });
    expect(p.state).toBe('jumping');
    let apex = 0; let t = 0; const dt = 1 / 240;
    while (p.state === 'jumping' && t < 3) { p.tick(dt, NO_INPUT); apex = Math.max(apex, p.y); t += dt; }
    expect(t).toBeGreaterThan(0.7); expect(t).toBeLessThan(0.85);
    expect(apex).toBeGreaterThan(2.0); expect(apex).toBeLessThan(2.4);
    expect(p.y).toBe(0); expect(p.state).toBe('running');
  });
  it('slide lowers the collision height for its duration and blocks a jump', () => {
    const p = new Player();
    p.tick(1 / 120, { drift: 0, jump: false, slide: true });
    expect(p.state).toBe('sliding'); expect(p.height).toBe(DEFAULT_PLAYER.slideHeight);
    expect(p.jump()).toBe(false);
    run(p, DEFAULT_PLAYER.slideDuration + 0.05);
    expect(p.state).toBe('running'); expect(p.height).toBe(DEFAULT_PLAYER.height);
  });
  it('stumble slows temporarily, fall stops and then kills', () => {
    const p = new Player();
    p.stumble(); expect(p.speed).toBeLessThan(DEFAULT_PLAYER.speed);
    run(p, DEFAULT_PLAYER.stumbleDuration + 0.05); expect(p.speed).toBe(DEFAULT_PLAYER.speed);
    p.fall(); expect(p.speed).toBe(0); expect(p.state).toBe('falling');
    run(p, DEFAULT_PLAYER.fallDuration + 0.05); expect(p.state).toBe('dead');
    expect(p.y).toBeLessThan(0);
  });
});
