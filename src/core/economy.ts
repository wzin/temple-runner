/** Rubies and the character catalogue: pure rules shared by the menu, the runner view and the tests. */

export const RUBY_COINS = 10_000;

export interface SkinDef { id: string; name: string; file: string; cost: number; blurb: string }
/** In unlock order: the first is free, then 1, 5 and 10 rubies. `id` is also the server's key. */
export const SKINS: SkinDef[] = [
  { id: 'adventurer', name: 'Adventurer', file: 'adventurer', cost: 0, blurb: 'Hat, backpack, no fear.' },
  { id: 'adventurer-f', name: 'Adventuress', file: 'adventurer-f', cost: 1, blurb: 'Faster than the cats, in her own opinion.' },
  { id: 'hooded', name: 'Hooded', file: 'hooded', cost: 5, blurb: 'Nobody has seen the face under the hood.' },
  { id: 'king', name: 'King', file: 'king', cost: 10, blurb: 'Runs like he owns the temple. He does.' },
  { id: 'witch', name: 'Witch', file: 'witch', cost: 10, blurb: 'The cats are hers. Allegedly.' },
  { id: 'soldier', name: 'Soldier', file: 'soldier', cost: 10, blurb: 'Deployed to the ridge, never came back.' },
];

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
