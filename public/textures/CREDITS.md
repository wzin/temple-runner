# Texture credits

All sets here were generated with fal.ai (Flux dev) through `scripts/gen-texture.mjs`
and post-processed into seamless PBR sets (`color.jpg`, `normal.jpg` derived from
luminance, `roughness.jpg`). Prompts are in the git history of the generating commit.

| Folder | Used on |
|--------|---------|
| wall-inca | track walls |
| floor-temple | floor slabs |
| cliff-rock | embankment blocks |
| totem | corner totems |
| gold-glyph | corner marker plate |
| bark-tropical | tree trunks |
| leaves, leaves2 | tree canopies (two variants), branch obstacles |
| ground-jungle | the land below the embankment |

Earlier CC0 sets from ambientCG (PavingStones070, Bricks075A, Bark012, Grass004) were
used up to v0.4.1 and can be restored from git if wanted. If a set is missing at runtime
the game falls back to its procedural texture (`src/view/textures.ts`).
