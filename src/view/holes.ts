import type { Game } from '../core/game';
import type { Obstacle } from '../core/spawner';

/**
 * Where the ridge is broken: full gaps cut the whole width; half gaps (`halfgap`) cut one side, leaving a strip
 * to run on along the other wall. Shared by the floor, embankment, decals and torches so every layer breaks alike.
 */
export interface Holes {
  /** Full break across the width at centre-line position s (slab of 2 m centred on s). */
  holed(s: number): boolean;
  /** −1 / 1 when a half gap removes the left / right half at s, else 0. */
  halfAt(s: number): -1 | 0 | 1;
  /** A plank bridge spans the hole at s: the floor is gone but the walls stand. */
  bridged(s: number): boolean;
  /** True when the wall/floor edge on `side` is missing at s (full gap or half gap on that side). */
  holedSide(s: number, side: -1 | 1): boolean;
  all: Obstacle[];
}

export function holesOf(game: Game, slab = 2): Holes {
  const all = game.spawner.obstacles.filter((o) => o.kind === 'gap' || o.kind === 'halfgap' || o.kind === 'chasm');
  const overlaps = (g: Obstacle, s: number) => s + slab / 2 > g.s0 + 1e-6 && s - slab / 2 < g.s1 - 1e-6;
  const holed = (s: number) => all.some((g) => (g.kind === 'gap' || g.kind === 'chasm') && overlaps(g, s));
  const bridged = (s: number) => all.some((g) => g.kind === 'chasm' && overlaps(g, s));
  const halfAt = (s: number): -1 | 0 | 1 => { const g = all.find((h) => h.kind === 'halfgap' && overlaps(h, s)); return g ? ((g.x0 + g.x1) / 2 < 0 ? -1 : 1) : 0; };
  return { all, holed, halfAt, bridged, holedSide: (s, side) => (holed(s) && !bridged(s)) || halfAt(s) === side };
}
