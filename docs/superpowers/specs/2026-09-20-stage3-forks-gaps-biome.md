# Stage 3 — forks, real gaps, calmer run cycle, biome backdrop

Date: 2026-09-20. Requested after play-testing stage 2.

## Requirements

1. **Run cycle.** The runner's limbs cycle far too fast ("turbo twitching"). Target a
   visual cadence of roughly 2 cycles per second at base speed, rising only mildly
   with speed. Cycle stays distance-driven (no drift when paused) but with a stride of
   ~7.5 m per full cycle and smaller swing amplitudes.
2. **Forks (T-junctions).** Not every corner is forced. Some are forks where the player
   chooses left or right, as in Temple Run. A fork shows both branches; whichever
   direction is pressed in the window becomes the path, and the other branch stays as a
   dead-end stub. No press by the corner still means running off the edge. Forks start
   after 150 m and are ~35% of corners.
3. **Real gaps.** Gaps must be actual holes in the floor, not a slab painted on top:
   the floor is missing over the gap, the pit below is visible, and the rims still mark
   the edges. Gap length becomes 4 m, aligned with the 2 m floor slabs so the hole and
   the collision extent coincide.
4. **Backdrop and biome.** A sky dome with sun, clouds and a mountain silhouette,
   low-poly trees beside the track, warm directional light from the sun. All of it
   driven by a **biome** definition (sky colours, sun position, fog, tree colours,
   material tints) so more biomes can be added later. First biome: *Inca highlands*.

## Design

### Core: forks
- `Segment.fork: boolean`. A fork segment is a turn whose `turn`/`outDir` are unknown
  until the player chooses. `Track.extendTo` stops at an unresolved fork (the track
  cannot continue before the direction exists). `Track.resolveFork(seg, dir)` sets
  `turn`, `outDir`, the generator cursor and resets the straights-after-turn counter, so
  the next `extendTo` continues along the chosen branch.
- `Track.sample(s)` for `s` past an unresolved corner keeps the incoming heading
  (harmless: the player cannot legally be there).
- Generator: when a turn is due and `nextS ≥ forkMinS` and `chance(forkChance)`, the
  turn is a fork. Options `forkChance` (0.35) and `forkMinS` (150).
- Game: in a fork window any press resolves the fork with that direction and counts
  as a turn. Boost/grace auto-resolves with a seeded random direction. Missed corner →
  fall as before.
- Spawner: `fill()` never lays content past `track.end() − 12`.

### View
- **Floor slabs** move from per-segment boxes to one `InstancedMesh` of 6×0.5×2 m
  textured slabs rebuilt each frame from the live segments (≈120 instances). A slab
  overlapping a gap obstacle is skipped, which makes the hole. Turn/fork squares are
  three slabs along the incoming heading; fork stubs get four slabs each until the fork
  resolves, then only the unchosen stub keeps them.
- **Pit**: the gap mesh becomes a deep dark box whose top sits below the floor, so the
  slab edges and the dark interior read as a chasm. Yellow rims unchanged.
- **Fork geometry**: run-in with both walls, a T far wall spanning both stubs, near-side
  stub walls from 3 m on, arrows both ways, a totem facing the runner on the far wall.
- **Sky dome**: 300 m sphere, back-faced, unaffected by fog, following the camera.
  Equirectangular canvas: vertical gradient, sun disc + halo, fbm clouds above the
  horizon, layered mountain silhouette at the horizon. Directional light direction and
  colour come from the biome's sun.
- **Trees**: instanced trunk + canopy cones, 6 per side per straight segment at 5–12 m
  from the centre line, seeded by segment id; rebuilt per frame like slabs.
- **Biome** (`src/view/biome.ts`): `{ name, sky: {zenith, horizon, ground, sun: {azimuth, elevation, color, size}}, cloudCover, fog: {color, near, far}, floorTint, wallTint, tree: {trunk, canopy}, ambient }`. `activeBiome()` returns the current one; `BIOMES.inca` is the default.

### Tests (core)
- Fork stops extension; `resolveFork` continues along the chosen heading; both
  directions accepted in the window; boost auto-resolves; missed fork → fall.
- Spawner lays nothing beyond `track.end() − 12`.
