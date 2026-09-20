# Texture credits

All PBR sets in this folder come from [ambientCG](https://ambientcg.com) and are
released under CC0 1.0 (public domain). Downscaled to 1024² JPEG.

| Folder | ambientCG asset |
|--------|-----------------|
| floor  | PavingStones070 |
| wall   | Bricks075A |
| bark   | Bark012 |
| ground | Grass004 |

Files per set: `color.jpg`, `normal.jpg` (OpenGL convention), `roughness.jpg`.
If a set is missing the game falls back to its procedural texture (`src/view/textures.ts`).

| leaves | generated with fal.ai (Flux dev) via `scripts/gen-texture.mjs`, post-processed to a seamless PBR set |
