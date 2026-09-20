export type Rng = () => number;

/** Small, fast, seedable PRNG. Same seed → same sequence, which keeps tests and future replays deterministic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chance(rng: Rng, p: number): boolean { return rng() < p; }
export function int(rng: Rng, lo: number, hi: number): number { return lo + Math.floor(rng() * (hi - lo + 1)); }
export function pick<T>(rng: Rng, items: readonly T[]): T { return items[Math.floor(rng() * items.length)]; }
