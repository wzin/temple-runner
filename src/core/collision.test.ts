import { describe, expect, it } from 'vitest';
import { pickCoins, sweepObstacles } from './collision';
import type { Coin, Obstacle } from './spawner';

const fire = (): Obstacle => ({ id: 1, kind: 'fire', s0: 10, s1: 11, x0: -1, x1: 1, y0: 0, y1: 0.8, hit: false, passed: false });
const branch = (): Obstacle => ({ id: 2, kind: 'branch', s0: 10, s1: 10.6, x0: -3, x1: 3, y0: 1.0, y1: 2.6, hit: false, passed: false });

describe('sweepObstacles', () => {
  it('hits when a fast step jumps over the obstacle interval on the ground', () => {
    const o = fire();
    expect(sweepObstacles([o], 9, 12, [-0.4, 0.4], [0, 1.8])).toEqual([o]); expect(o.hit).toBe(true);
  });
  it('misses laterally and marks passed', () => {
    const o = fire();
    expect(sweepObstacles([o], 9, 12, [1.6, 2.4], [0, 1.8])).toEqual([]); expect(o.passed).toBe(true);
    expect(sweepObstacles([o], 12, 13, [-0.4, 0.4], [0, 1.8])).toEqual([]);
  });
  it('jump clears fire, slide does not; slide clears branch, jump does not', () => {
    expect(sweepObstacles([fire()], 9, 12, [-0.4, 0.4], [1.0, 2.8])).toEqual([]);
    expect(sweepObstacles([fire()], 9, 12, [-0.4, 0.4], [0, 0.9])).toHaveLength(1);
    expect(sweepObstacles([branch()], 9, 12, [-0.4, 0.4], [0, 0.9])).toEqual([]);
    expect(sweepObstacles([branch()], 9, 12, [-0.4, 0.4], [2.0, 3.8])).toHaveLength(1);
  });
});

describe('pickCoins', () => {
  it('collects within radius once', () => {
    const c: Coin = { id: 1, s: 5, x: 0, y: 0.6, collected: false, value: 1 };
    expect(pickCoins([c], 5.5, 0.3, 0, 1.2)).toEqual([c]);
    expect(pickCoins([c], 5.5, 0.3, 0, 1.2)).toEqual([]);
    const far: Coin = { id: 2, s: 5, x: 0, y: 2.2, collected: false, value: 1 };
    expect(pickCoins([far], 5, 0, 0, 1.2)).toEqual([]);
  });
});
