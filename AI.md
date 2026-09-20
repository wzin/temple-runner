# Temple Runner — project knowledge

Temple Run-inspired endless runner. Three.js + TypeScript + Vite. The game
logic lives in a pure-TypeScript **track-space core** (`src/core/`, no Three.js
imports, unit-tested with vitest); Three.js only renders it (`src/view/`).

Design spec: `docs/superpowers/specs/2026-09-20-track-space-core-design.md`.
Implementation plan: `docs/superpowers/plans/2026-09-20-track-space-core.md`.

## Commands (all inside Docker, nothing on the host)

```bash
docker compose --profile dev run --rm dev npm ci      # once, fills the node_modules volume
docker compose --profile dev up -d dev                # http://localhost:3001 (DEV_PORT=… to change); starts api-dev too
docker compose --profile dev run --rm dev npm test
docker compose --profile dev run --rm dev npx tsc --noEmit
docker build -t temple-runner .                       # production image (Caddy)
```

## Track space

Everything that moves has `(s, x, y)`: distance along the centre line, lateral
offset (right is positive), height. `Track.sample(s, x, y)` maps that to world
space, so the player, coins, obstacles and camera can never drift off the path.
World axes: start heading is `-z`, right is `+x`. Right vector of heading
`(dx, dz)` is `(-dz, dx)`.

## Modules

| File | Purpose |
|------|---------|
| `src/core/rng.ts` | seedable PRNG (`mulberry32`); all randomness goes through it |
| `src/core/track.ts` | segments (straight / 90° turn / fork), generator rules, `sample()`, turn windows; a fork stops generation until `resolveFork()` |
| `src/core/input.ts` | `TickInput` shape and the one-slot `TurnBuffer` (150 ms) |
| `src/core/player.ts` | state machine `running/jumping/sliding/falling/dead`, physics constants |
| `src/core/spawner.ts` | coins and obstacles laid by `s`; `OBSTACLES` type table |
| `src/core/collision.ts` | swept obstacle check, coin pickup |
| `src/core/difficulty.ts` | `difficultyAt(s)`: speed 15→24, turn/obstacle density, spacing; linear to 1500 m |
| `src/core/powerups.ts` | magnet (10 s, pulls coins within 8 m), shield (absorbs one stumble), boost (5 s, ×1.6 speed, ignores obstacles, auto-turns) |
| `src/core/game.ts` | wires the above; `tick(dt, input, nowMs)` returns `GameEvent[]` (coin, hit, shielded, turn, fall, dead, jump, slide, land, powerup, powerupEnd) |
| `src/view/scene.ts` | renderer, lights |
| `src/view/camera.ts` | follow camera from `track.sample`; frozen pose while falling |
| `src/view/trackView.ts` | one `Group` per segment, added/disposed with the track |
| `src/view/playerView.ts` | low-poly rigged runner (arms/legs swing by distance, tuck on jump, lean on slide), shield aura, warm point light |
| `coinView.ts`, `obstacleView.ts`, `powerUpView.ts`, `monkeyView.ts` | instanced meshes placed from track coordinates each frame; monkeys sit `9 → 2.5 m` behind the player as proximity rises |
| `src/view/floorView.ts` | one instanced mesh of 2 m floor slabs rebuilt per frame; slabs over gap obstacles are skipped, so gaps are real holes; fork stubs |
| `src/view/groundView.ts`, `cliffView.ts` | the land lies 14 m below; the track runs on an instanced stone embankment (2 m blocks), trees grow on the low ground 7–21 m out |
| `src/view/biome.ts`, `skyView.ts`, `treeView.ts` | biome config (sky, sun, fog, tints, trees); equirect sky painted on a canvas and used as `scene.background` (horizon and below are the fog colour so fogged geometry vanishes); instanced trees with generated leaf/bark textures on the low ground |
| `src/view/torchView.ts` | wall torches as four instanced meshes (handle, bowl, flame, glow), rebuilt per frame |
| `src/view/trackView.ts` props | a totem with glowing eyes at every corner / fork far wall; walls per segment |
| `src/view/flameMaterial.ts` | procedural additive flame shader (instancing-aware); torches and fire obstacles; `tickFlames(seconds)` each frame |
| `src/view/decalView.ts`, `propView.ts`, `ruinsView.ts` | wall relief bands and corner arrow glyphs; boulders, fallen columns, ferns, bushes on the low ground; skyline ruins billboards |
| `src/view/particles.ts` | pooled additive point sprites: embers over fire obstacles, gold sparks on coin pickup |
| `scripts/gen-texture.mjs` | fal.ai (Flux) asset generator: `--kind pbr` (seamless set, normals from Marigold depth), `sprite` (RGBA from black), `image`, `panorama`; key from `FAL_KEY` or `.api_keys` (gitignored). `remoteSet()`/`sprite()` in textures.ts load results lazily with flat/transparent placeholders |
| `src/view/textures.ts` | procedural PBR sets baked at startup as the fallback; `loadRealTextures()` swaps in `public/textures/<set>/{color,normal,roughness}.jpg` (CC0 from ambientCG, see `public/textures/CREDITS.md`) in place when present |
| `src/ui/domInput.ts` | keyboard → `TickInput`; turn presses go straight to `game.pressTurn` with the real press time |
| `src/ui/GameOver.ts`, `src/ui/leaderboard.ts` | arcade name entry (Enter saves, Space restarts afterwards), top-10 board from `/api/scores` |
| `server/index.mjs` | leaderboard API: Node 22 `node:sqlite`, GET/POST `/api/scores`, name 1–12 chars, score must equal distance + 10·coins, 3 s per-IP cooldown |
| `src/ui/*` (HUD, menus), `src/gameState.ts`, `src/audio.ts`, `src/styles.css` | UI shell kept from the prototype; `main.ts` copies score/coins/proximity into `gameState` |
| `src/main.ts` | RAF loop, screens, events → sounds |

`window.__game` (live `Game`) and `window.__scene` (Three.js scene) are exposed for automated play-testing.

## Rules of play (as implemented)

- Controls: A/D and ←/→ are symmetric (hold = drift, tap = turn press); W/↑/Space jump; S/↓ slide.
- Turn window: 6 m before the corner to 2 m after. Correct press inside it → turn.
  Wrong direction → fall. No press by the corner → run straight off the edge.
- Forks (from 150 m, 35% of turns): T-junction, either direction is accepted. Both continuations are pre-generated 100 m ahead (`track.branches`, rendered via `track.allSegments()`), so nothing pops in when you choose; the unchosen branch disappears. During boost your press still decides; random only if you pressed nothing.
- Jump: 11.5 m/s up, gravity 30 → 0.77 s airtime, 2.2 m apex. Slide: 0.7 s, height 0.9.
- Obstacles (`OBSTACLES` in `spawner.ts`): fire (lane, y 0–0.8, jump), log (y 1.0–1.6,
  slide or jump), branch (y 1.0–2.6, slide), gap (fatal, jump; drawn as a violet pit with yellow rims). First at s ≥ 60,
  spacing 25 → 16 m with difficulty, never within 10 m of a turn window.
- Patterns (`PATTERNS`): single, logWithArc (≥100 m), twoLaneFire (≥200 m), gapThenBranch (≥400 m), laneFireRow (≥600 m).
- Power-ups appear from 120 m, 8% per 12 m chunk, one live at a time. Boost and a 0.6 s grace after it make the runner invulnerable: collisions skipped, corners taken automatically, presses ignored.
- The generator never crosses itself: every candidate segment is tested against laid corridors (main path and both branches) padded 8 m sideways; the chooser ranks free candidates by how far the track can still go (search depth 5), then open space ahead, then the wanted shape. A fork whose speculative branch gets boxed in collapses into a plain corner towards the other branch. Stress tests simulate real runs with drop-behind and fork resolution.
- Obstacles keep `1.2 s × speed` clear after every corner (the outgoing leg is hidden behind the corner wall until you turn).
- Lookahead is time-based: `12 s × speed`, clamped 150–300 m (`game.lookahead`); the fog's near/far are fractions (0.12/0.62) of it, so the generated end is always hidden.
- Difficulty ramps to 1500 m; the turn window is `0.4 s × speed` before the corner, so reaction time stays constant. Obstacle spacing is also time-based (1.7 s → 1.05 s of running), and patterns that chain a jump with a slide place the second obstacle beyond the landing point (`JUMP_AIRTIME × speed + 4 m`).
- Resume from pause runs a 3-2-1 countdown; beating the stored high score flashes a banner once per run; during boost the runner turns ghostly with an aura and gaps show a translucent veil.
- High score persists in `localStorage['temple-runner.highScore']`; Space/Enter restarts from the menu or game-over screen. The menu shows the top five from the API.
- Version: `VERSION` file injected as `__APP_VERSION__` (bottom-right corner). Release with `scripts/release.sh X.Y.Z` (writes VERSION, tags `vX.Y.Z`, pushes; Komodo redeploys from main).
- Touch: arrow panel on coarse-pointer devices, shown only during a run, raised above browser bars (12dvh + safe area); text selection/callouts/scroll blocked on the canvas; swipe gestures; coach hints at run start and before the first corner
- Turn window: a correct press counts from `1.0 s × speed` before the corner (`turnLead`), a wrong press is fatal only inside the last `0.4 s × speed` (`strictFrom`), and presses up to `max(2 m, 0.15 s × speed)` after the corner still count. Early wrong presses are ignored. (tap = turn, hold = drift, ▲ jump, ▼ slide) plus swipe gestures on the canvas.
- Performance: no shadow maps, pixel ratio capped at 1.5, everything repeated is instanced (floor, cliffs, trees, torches, coins, obstacles, power-ups).
- Turn presses survive a frame hitch: the buffer expires 150 ms after the press but never before one tick has seen it.
- Proximity meter: +25 per hit, −2/s, 100 = caught. Score = floor(distance) + 10 × coins.
- Track: 3 straights first, ≥ 2 straights after a turn, then 15% turn chance per 20 m segment.
  Lookahead 120 m, content dropped 40 m behind.

## Deployment

Two containers: `web` (Dockerfile: node build → Caddy serving `dist/`, proxying `/api/*` to `api:3002`) and `api` (Dockerfile.api: Node 22 + node:sqlite, DB in the `scores_data` volume). `compose.yaml` is the Komodo stack (`temple-runner` on mail.ziniewicz.eu, `web` on `traefik_proxy`, both on the stack's `internal` network); Traefik route lives in `homecloud/traefik/dynamic/temple-runner.yml` → https://temple.ziniewicz.eu.

**Komodo webhook: Force deploy must be ON** (Stack → Config → Webhooks). The default `DeployStackIfChanged` only diffs `compose.yaml`; this stack builds its images from source, so a code-only push is accepted but nothing redeploys (Komodo shows the new commit as "available" but keeps the old one running). Same lesson as the accountant stack in homecloud.

## Roadmap

2. Done (2026-09-20): speed ramp, camera swing/dip/shake, landing squash, power-ups, monkeys, patterns, persistence, basic procedural textures.
3. Done (2026-09-20): procedural PBR textures, torches, totems, rigged runner, particles, forks, real gap holes, biome sky/trees, SQLite leaderboard. Next: more biomes, AI/CC0 textures, ambient sound, mobile controls.
4. Mobile controls. 5. Persistence, stats, audio assets.
