import type { PowerUp } from './powerups';
import { OBSTACLES } from './spawner';
import type { Coin, Obstacle } from './spawner';

/** Pits (gap, half gap, chasm pieces) only claim the runner this far past their edge: standing on the very edge still
 *  leaves time to jump ("coyote time", ~0.1 s at speed). */
export const PIT_GRACE = 2.0;
/** Over a pit the runner's footing is judged by the centre of the body, not the shoulders, so brushing a plank's edge is fine. */
export const PIT_FOOT_HALF_WIDTH = 0.15;

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1;

/** Swept check between the previous and current s so a fast frame cannot skip a thin obstacle. */
export function sweepObstacles(obstacles: Obstacle[], prevS: number, s: number, lateral: [number, number], vertical: [number, number]): Obstacle[] {
  const hits: Obstacle[] = [];
  for (const o of obstacles) {
    if (o.hit || o.passed) continue;
    const pit = OBSTACLES[o.kind].y1 <= 0;
    const s0 = pit ? o.s0 + PIT_GRACE : o.s0;
    if (!overlaps(Math.min(prevS, s), Math.max(prevS, s), s0, o.s1)) { if (s > o.s1) o.passed = true; continue; }
    const centre = (lateral[0] + lateral[1]) / 2;
    const lat: [number, number] = pit ? [centre - PIT_FOOT_HALF_WIDTH, centre + PIT_FOOT_HALF_WIDTH] : lateral;
    if (overlaps(lat[0], lat[1], o.x0, o.x1) && overlaps(vertical[0], vertical[1], o.y0, o.y1)) { o.hit = true; hits.push(o); }
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
