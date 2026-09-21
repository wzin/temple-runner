/** Rubies and the character catalogue: pure rules shared by the menu, the runner view and the tests. */

export const RUBY_COINS = 1_000;

/** Multipliers and counts a character brings into a run; 1 / 1 hit = no bonus. */
export interface Traits { boostMul: number; magnetMul: number; magnetRadiusMul: number; energyMul: number; proximityDecayMul: number; shieldHits: number; coinMul: number; rubyMul: number }
export const DEFAULT_TRAITS: Traits = { boostMul: 1, magnetMul: 1, magnetRadiusMul: 1, energyMul: 1, proximityDecayMul: 1, shieldHits: 1, coinMul: 1, rubyMul: 1 };

export interface SkinDef { id: string; name: string; file: string; cost: number; blurb: string; trait: string; traits: Partial<Traits> }
/** In unlock order; the better the trait, the higher the price. `id` is also the server's key. */
export const SKINS: SkinDef[] = [
  { id: 'adventurer', name: 'Adventurer', file: 'adventurer', cost: 0, blurb: 'Hat, whip hand, no fear.', trait: 'No bonus — the honest way.', traits: {} },
  { id: 'adventurer-f', name: 'Adventuress', file: 'adventurer-f', cost: 1, blurb: 'Same hat, better footwork.', trait: 'Boost energy charges 10% faster.', traits: { energyMul: 1.1 } },
  { id: 'farmer', name: 'Farmer', file: 'farmer', cost: 2, blurb: 'Came for the potatoes, stayed for the gold.', trait: 'Magnet lasts 20% longer.', traits: { magnetMul: 1.2 } },
  { id: 'hooded', name: 'Hooded', file: 'hooded', cost: 5, blurb: 'Nobody has seen the face under the hood.', trait: 'Boost lasts 20% longer.', traits: { boostMul: 1.2 } },
  { id: 'punk', name: 'Punk', file: 'punk', cost: 6, blurb: 'The cats are scared of the hair.', trait: 'Cats fall back 30% faster after a stumble.', traits: { proximityDecayMul: 1.3 } },
  { id: 'witch', name: 'Witch', file: 'witch', cost: 10, blurb: 'The cats are hers. Allegedly.', trait: 'Magnet reaches 30% further and lasts 20% longer.', traits: { magnetRadiusMul: 1.3, magnetMul: 1.2 } },
  { id: 'soldier', name: 'Soldier', file: 'soldier', cost: 10, blurb: 'Deployed to the ridge, never came back.', trait: 'Shield takes two hits.', traits: { shieldHits: 2 } },
  { id: 'scifi', name: 'Pilot', file: 'scifi', cost: 14, blurb: 'Crash-landed. Still running.', trait: 'Boost 30% longer, energy charges 15% faster.', traits: { boostMul: 1.3, energyMul: 1.15 } },
  { id: 'king', name: 'King', file: 'king', cost: 18, blurb: 'Runs like he owns the temple. He does.', trait: 'Coins are worth 20% more.', traits: { coinMul: 1.2 } },
  { id: 'astronaut', name: 'Astronaut', file: 'astronaut', cost: 25, blurb: 'Gravity is optional.', trait: 'Ruby gems appear 50% more often, boost 20% longer.', traits: { rubyMul: 1.5, boostMul: 1.2 } },
];
export function traitsOf(id: string): Traits { return { ...DEFAULT_TRAITS, ...(SKINS.find((s) => s.id === normalizeSkinId(id))?.traits ?? {}) }; }

/** Old saved skin ids from before the catalogue existed. */
const LEGACY_IDS: Record<string, string> = { runner: 'adventurer', 'runner-f': 'adventurer-f', guardian: 'hooded' };
export function normalizeSkinId(id: string | null | undefined): string {
  if (!id) return SKINS[0].id;
  const mapped = LEGACY_IDS[id] ?? id;
  return SKINS.some((s) => s.id === mapped) ? mapped : SKINS[0].id;
}

export function rubiesFromCoins(coinsTotal: number, rubiesSpent = 0): number {
  return Math.max(0, Math.floor(coinsTotal / RUBY_COINS) - rubiesSpent);
}

export function coinsToNextRuby(coinsTotal: number): number {
  return RUBY_COINS - (coinsTotal % RUBY_COINS);
}

export function canAfford(rubies: number, skinId: string): boolean {
  const def = SKINS.find((s) => s.id === skinId);
  return !!def && rubies >= def.cost;
}
