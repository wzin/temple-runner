import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAITS, RUBY_COINS, SKINS, canAfford, coinsToNextRuby, normalizeSkinId, rubiesFromCoins, traitsOf } from './economy';

describe('economy', () => {
  it('pays one ruby per 1 000 coins, minus what was spent', () => {
    expect(RUBY_COINS).toBe(1_000);
    expect(rubiesFromCoins(999)).toBe(0);
    expect(rubiesFromCoins(1_000)).toBe(1);
    expect(rubiesFromCoins(3_500, 2)).toBe(1);
    expect(rubiesFromCoins(500, 3)).toBe(0);
    expect(coinsToNextRuby(950)).toBe(50);
    expect(coinsToNextRuby(2_000)).toBe(1_000);
  });
  it('has ten characters, priced by the strength of their trait', () => {
    expect(SKINS.map((s) => s.cost)).toEqual([0, 1, 2, 5, 6, 10, 10, 14, 18, 25]);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(10);
    expect(traitsOf('adventurer')).toEqual(DEFAULT_TRAITS);
    expect(traitsOf('soldier').shieldHits).toBe(2);
    expect(traitsOf('scifi').boostMul).toBeCloseTo(1.3);
    expect(traitsOf('nope').coinMul).toBe(1);
    expect(canAfford(0, 'adventurer')).toBe(true);
    expect(canAfford(4, 'hooded')).toBe(false);
    expect(canAfford(5, 'hooded')).toBe(true);
    expect(canAfford(99, 'nope')).toBe(false);
  });
  it('maps the old saved skin ids', () => {
    expect(normalizeSkinId('runner')).toBe('adventurer');
    expect(normalizeSkinId('guardian')).toBe('hooded');
    expect(normalizeSkinId('king')).toBe('king');
    expect(normalizeSkinId('garbage')).toBe('adventurer');
    expect(normalizeSkinId(null)).toBe('adventurer');
  });
});
