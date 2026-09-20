# Texture credits

All sets here were generated with fal.ai (Flux dev) through `scripts/gen-texture.mjs`
and post-processed into seamless PBR sets (`color.jpg`, `normal.jpg` derived from
luminance, `roughness.jpg`). Prompts are in the git history of the generating commit.

| Folder | Used on |
|--------|---------|
| wall-inca | track walls |
| floor-path | floor slabs (irregular flagstones) |
| floor-temple | alternative floor (glyph tiles), unused |
| cliff-rock | embankment blocks |
| totem | corner totems |
| gold-glyph | corner marker plate |
| bark-tropical | tree trunks |
| leaves, leaves2 | procedural fallback canopies (Kenney trees are the real ones now) |
| ground-jungle | the land below the embankment |
| tunic, skin, skin-* | former procedural runner (replaced by Quaternius characters in 0.8; kept for the menu portraits) |
| fur | monkeys |
| bronze | torch bowls |
| relief | carved frieze band along the walls |
| rock, column | boulders, fallen columns, stone gate caps and teeth |
| wall-carved | gate posts of the slide-under obstacle |
| lava | floor of the gap pits |
| log-end | tree-ring caps of logs and branches |
| coin | embossed coin faces |

Sprites (`public/sprites`, RGBA from a black background): icon-magnet, icon-shield, icon-bolt, fern, bush, ruins (skyline), soot (torch stains), arrow (corner glyph).
Art (`public/art`): menu-bg (menu backdrop), og-image (link preview), sky (equirect panorama, horizon blended into the fog colour).
PBR normal maps come from Marigold depth (fal-ai/imageutils/marigold-depth) where available, else from luminance.

Earlier CC0 sets from ambientCG (PavingStones070, Bricks075A, Bark012, Grass004) were
used up to v0.4.1 and can be restored from git if wanted. If a set is missing at runtime
the game falls back to its procedural texture (`src/view/textures.ts`).

## Later batches (all generated, WebP)

PBR: tunic, skin, fur, bronze, relief, rock, column, lava, log-end, coin, coin-big, skin-{runner,runner-f,guardian}-{face,front,back},
portal, mosaic, cornice, iron, feather, monkey-face, water, floor-path (current floor), floor-broken, floor-mossy,
wall-vines, wall-carved, wall-mossy, pillar, bridge-plank (unused yet), gold-trim, stone-steps (unused yet), jaguar-face.
Sprites: fire, icon-*, fern, bush, ruins, soot, arrow, clouds, vines, canopy, roots, statue, idol (unused yet), banner, skull, palm, fog-wisp, temple-far.
Art: menu-bg, og-image, sky.

## Models

`public/models/kenney/*.glb` are from the Kenney Nature Kit (https://kenney.nl/assets/nature-kit), CC0 1.0 (licence file alongside).

## 3D models

- `public/models/kenney/` — Kenney kits (CC0), see `CREDITS.txt` there.
- `public/models/ruins/ruins.glb` — Quaternius Modular Ruins Pack (CC0), trimmed.
- `public/models/chars/` — Quaternius animated characters (CC0), trimmed; the jump comes from the Animated Men pack.
