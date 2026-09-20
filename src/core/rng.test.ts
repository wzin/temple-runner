import { describe, expect, it } from 'vitest';
import { chance, int, mulberry32, pick } from './rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('stays in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('helpers respect bounds', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 200; i++) expect([1, 2, 3]).toContain(int(r, 1, 3));
    expect(['a', 'b']).toContain(pick(r, ['a', 'b']));
    expect(chance(() => 0.1, 0.2)).toBe(true);
    expect(chance(() => 0.3, 0.2)).toBe(false);
  });
});
