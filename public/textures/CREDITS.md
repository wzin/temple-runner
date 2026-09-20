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
| tunic, skin | runner clothes and skin (pants reuse the tunic weave) |
| fur | monkeys |
| bronze | torch bowls |
| relief | carved frieze band along the walls |
| rock, column | boulders and fallen columns on the low ground |
| lava | floor of the gap pits |
| log-end | tree-ring caps of logs and branches |
| coin | embossed coin faces |

Sprites (`public/sprites`, RGBA from a black background): fire, icon-magnet, icon-shield, icon-bolt, fern, bush, ruins (skyline), soot (torch stains), arrow (corner glyph).
Art (`public/art`): menu-bg (menu backdrop), og-image (link preview), sky (equirect panorama, horizon blended into the fog colour).
PBR normal maps come from Marigold depth (fal-ai/imageutils/marigold-depth) where available, else from luminance.

Earlier CC0 sets from ambientCG (PavingStones070, Bricks075A, Bark012, Grass004) were
used up to v0.4.1 and can be restored from git if wanted. If a set is missing at runtime
the game falls back to its procedural texture (`src/view/textures.ts`).
