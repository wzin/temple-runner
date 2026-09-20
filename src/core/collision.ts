import type { PowerUp } from './powerups';
import type { Coin, Obstacle } from './spawner';

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1;

/** Swept check between the previous and current s so a fast frame cannot skip a thin obstacle. */
export function sweepObstacles(obstacles: Obstacle[], prevS: number, s: number, lateral: [number, number], vertical: [number, number]): Obstacle[] {
  const hits: Obstacle[] = [];
  for (const o of obstacles) {
    if (o.hit || o.passed) continue;
    if (!overlaps(Math.min(prevS, s), Math.max(prevS, s), o.s0, o.s1)) { if (s > o.s1) o.passed = true; continue; }
    if (overlaps(lateral[0], lateral[1], o.x0, o.x1) && overlaps(vertical[0], vertical[1], o.y0, o.y1)) { o.hit = true; hits.push(o); }
    else if (s > o.s1) o.passed = true;
  }
  return hits;
}

export function pickCoins(coins: Coin[], s: number, x: number, y: number, radius: number): Coin[] {
  const got: Coin[] = [];
  for (const c of coins) {
    if (c.collected) continue;
    const d = Math.hypot(c.s - s, c.x - x, c.y - (y + 0.6));
    if (d <= radius) { c.collected = true; got.push(c); }
  }
  return got;
}

export function pickPowerUps(items: PowerUp[], s: number, x: number, y: number, radius: number): PowerUp[] {
  const got: PowerUp[] = [];
  for (const it of items) {
    if (it.taken) continue;
    if (Math.hypot(it.s - s, it.x - x, it.y - (y + 0.9)) <= radius) { it.taken = true; got.push(it); }
  }
  return got;
}
