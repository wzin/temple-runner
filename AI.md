# Temple Runner — project knowledge

Temple Run-inspired endless runner. Three.js + TypeScript + Vite. The game
logic lives in a pure-TypeScript **track-space core** (`src/core/`, no Three.js
imports, unit-tested with vitest); Three.js only renders it (`src/view/`).

Design spec: `docs/superpowers/specs/2026-09-20-track-space-core-design.md`.
Implementation plan: `docs/superpowers/plans/2026-09-20-track-space-core.md`.

## Commands (all inside Docker, nothing on the host)

```bash
docker compose --profile dev run --rm dev npm ci      # once, fills the node_modules volume
docker compose --profile dev up -d dev                # http://localhost:3001 (DEV_PORT=… to change)
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
| `src/core/track.ts` | segments (straight / 90° turn), generator rules, `sample()`, turn windows |
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
| `src/view/playerView.ts`, `coinView.ts`, `obstacleView.ts`, `powerUpView.ts`, `monkeyView.ts` | meshes placed from track coordinates each frame; monkeys sit `9 → 2.5 m` behind the player as proximity rises |
| `src/view/textures.ts` | seamless procedural PBR sets (colour + normal + roughness) for stone floor, bricks, bark, leaves, baked on canvases at startup (~0.4 s); one tile = 2 m; sky gradient background |
| `src/ui/domInput.ts` | keyboard → `TickInput`; turn presses go straight to `game.pressTurn` with the real press time |
| `src/ui/*` (HUD, menus), `src/gameState.ts`, `src/audio.ts`, `src/styles.css` | UI shell kept from the prototype; `main.ts` copies score/coins/proximity into `gameState` |
| `src/main.ts` | RAF loop, screens, events → sounds |

`window.__game` (live `Game`) and `window.__scene` (Three.js scene) are exposed for automated play-testing.

## Rules of play (as implemented)

- Controls: A/D and ←/→ are symmetric (hold = drift, tap = turn press); W/↑/Space jump; S/↓ slide.
- Turn window: 6 m before the corner to 2 m after. Correct press inside it → turn.
  Wrong direction → fall. No press by the corner → run straight off the edge.
- Jump: 11.5 m/s up, gravity 30 → 0.77 s airtime, 2.2 m apex. Slide: 0.7 s, height 0.9.
- Obstacles (`OBSTACLES` in `spawner.ts`): fire (lane, y 0–0.8, jump), log (y 1.0–1.6,
  slide or jump), branch (y 1.0–2.6, slide), gap (fatal, jump; drawn as a violet pit with yellow rims). First at s ≥ 60,
  spacing 25 → 16 m with difficulty, never within 10 m of a turn window.
- Patterns (`PATTERNS`): single, logWithArc (≥100 m), twoLaneFire (≥200 m), gapThenBranch (≥400 m), laneFireRow (≥600 m).
- Power-ups appear from 120 m, 8% per 12 m chunk, one live at a time. Boost and a 0.6 s grace after it make the runner invulnerable: collisions skipped, corners taken automatically, presses ignored.
- Difficulty ramps to 1500 m; the turn window is `0.4 s × speed` before the corner, so reaction time stays constant.
- High score persists in `localStorage['temple-runner.highScore']`; Space/Enter restarts from the menu or game-over screen.
- Proximity meter: +25 per hit, −2/s, 100 = caught. Score = floor(distance) + 10 × coins.
- Track: 3 straights first, ≥ 2 straights after a turn, then 15% turn chance per 20 m segment.
  Lookahead 120 m, content dropped 40 m behind.

## Deployment

Static site: `Dockerfile` builds with node and serves `dist/` with Caddy
(`Caddyfile`). `compose.yaml` is the Komodo stack (`temple-runner` on
mail.ziniewicz.eu, network `traefik_proxy`); Traefik route lives in
`homecloud/traefik/dynamic/temple-runner.yml` → https://temple.ziniewicz.eu.

## Roadmap

2. Done (2026-09-20): speed ramp, camera swing/dip/shake, landing squash, power-ups, monkeys, patterns, persistence, basic procedural textures.
3. Look: real textures (AI-generated or CC0 PBR), props, character model, skybox, particles.
4. Mobile controls. 5. Persistence, stats, audio assets.
