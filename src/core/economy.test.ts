import { describe, expect, it } from 'vitest';
import { RUBY_COINS, SKINS, canAfford, coinsToNextRuby, normalizeSkinId, rubiesFromCoins } from './economy';

describe('economy', () => {
  it('pays one ruby per 10 000 coins, minus what was spent', () => {
    expect(RUBY_COINS).toBe(10_000);
    expect(rubiesFromCoins(9_999)).toBe(0);
    expect(rubiesFromCoins(10_000)).toBe(1);
    expect(rubiesFromCoins(35_000, 2)).toBe(1);
    expect(rubiesFromCoins(5_000, 3)).toBe(0);
    expect(coinsToNextRuby(9_500)).toBe(500);
    expect(coinsToNextRuby(20_000)).toBe(10_000);
  });
  it('has six characters priced 0, 1, 5, 10, 10, 10', () => {
    expect(SKINS.map((s) => s.cost)).toEqual([0, 1, 5, 10, 10, 10]);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(6);
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
