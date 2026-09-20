# Stage 2 — Feel, items and basic textures

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the run feel like Temple Run: difficulty ramps, the camera and character react, power-ups and monkeys return on the track-space core, obstacle patterns need lane choices, scores persist, and the world gets simple procedural textures.

**Architecture:** All rules stay in `src/core/` (pure TS, tested). New core pieces: a `difficulty` function of distance, a `powerups` module, obstacle *patterns* in the spawner, and new events (`land`, `powerup`, `powerupEnd`). Views react to events for camera swing, landing squash and stumble shake; a `textures.ts` module builds seamless canvas textures at startup so no asset pipeline is needed yet.

**Spec:** roadmap section of `docs/superpowers/specs/2026-09-20-track-space-core-design.md`; scope agreed in chat 2026-09-20 (all six points plus "super basic" textures).

## Global constraints

- No Three.js under `src/core/`. Randomness only via `Rng`.
- Everything runs in Docker: `docker compose --profile dev run --rm dev npm test`, `npx tsc --noEmit`.
- Keep 60 fps on integrated graphics: textures ≤ 512², instanced meshes for repeated items, no per-frame allocations in views beyond what exists.
- Commit per task.

## Tasks

### Task 1: Difficulty ramp (core)
- `src/core/difficulty.ts`: `difficultyAt(s)` → `{ speed, turnChance, obstacleChance, obstacleSpacing, reactionTime }`, linear from s=0 to s=1500 then flat: speed 15→24, turnChance 0.15→0.30, obstacleChance 0.45→0.7, spacing 25→16, reactionTime constant 0.4 s.
- `Player`: `speedScale` (set by Game each tick) multiplies `cfg.speed`; jump velocity unchanged so airtime is constant and the jump covers more distance at speed (as in Temple Run).
- `Track`: `turnEarly` becomes a mutable field (default 6) that Game sets to `reactionTime × speed` every tick; `turnChance` becomes a function `() => number` read at generation.
- `Spawner`: reads `obstacleChance`/`obstacleSpacing` through a provider function evaluated at the chunk's `s`.
- Tests: speed at 0/750/1500/3000; window widens with speed; spawner spacing shrinks far out.

### Task 2: Events for feel + camera/character reactions (core + view)
- Core: `land` event when jumping→running; `Game.lastTurnDir` + `turnAge` for the camera; `stumbleTimer` already exists.
- Camera: on `turn`, add a yaw lead toward the new heading and a roll of ±6° decaying over 0.5 s; on `land`, dip camera height 0.4 m decaying; on `hit`, shake (random ±0.15 m for 0.3 s using a seeded rng in the view is fine).
- Player view: landing squash (scale y 0.75 → 1 over 0.15 s), run lean forward proportional to speed, stumble wobble stronger, tumble on fall unchanged.
- Sound: `land` → short thud (add to `audio.ts` synth).

### Task 3: Power-ups (core + view + HUD)
- `src/core/powerups.ts`: `PowerUpKind = 'magnet' | 'shield' | 'boost'`, `PowerUp { id, kind, s, x, taken }`, durations magnet 10 s, boost 5 s, shield until hit.
- Spawner lays a power-up with 8% chance per chunk when none is live ahead and `s ≥ 120`, at a lane, never near turn windows or obstacles.
- Game: `active: { kind, timer } | null`, `shield: boolean`. Magnet: coins within 8 m (track distance) glide toward the player at 20 m/s in `(s, x, y)` and are collected. Shield: absorbs one non-fatal hit and one gap (Temple Run's shield saves from gaps too? No — keep shield for stumbles only; gap still fatal). Boost: speed ×1.6 and all collisions ignored for 5 s; the player is lifted to y=1.5 visually (view only).
- Events `powerup(kind)`, `powerupEnd(kind)`; HUD indicator already reads `gameState.activePowerUp/powerUpTimer`.
- View: instanced icosahedra (blue magnet, green shield, orange boost) bobbing and spinning.
- Tests: magnet pulls a coin from 5 m and collects it; shield blocks one hit then is gone; boost ignores a fire; power-up expires.

### Task 4: Monkeys (view, driven by proximity)
- `src/view/monkeyView.ts`: three monkeys from the prototype meshes (sphere body, head, red eyes, arms) placed at `sample(player.s − gapBehind, x_i)` where `gapBehind = 14 − 11 × proximity/100`; bob while running; when `fall reason caught`, they overlap the player.
- Proximity decay stays 2/s; the HUD bar remains.

### Task 5: Obstacle patterns (core)
- Spawner picks a *pattern* instead of a single obstacle: `single` (as now), `twoLaneFire` (fire in two of three lanes, forces a lane change), `gapThenBranch` (gap, then branch 7 m later: jump then slide), `logWithArc` (log with an arc of coins over it), `laneFireRow` (three fires staggered 4 m apart in different lanes). Patterns have a minimum `s` (twoLaneFire ≥ 200, gapThenBranch ≥ 400, laneFireRow ≥ 600).
- Tests: each pattern's obstacles keep the lane extents and spacing invariants; no pattern overlaps a turn window.

### Task 6: Persistence and restart (ui)
- High score in `localStorage['temple-runner.highScore']`, loaded at init, saved on game over; shown in the main menu too.
- Space / Enter on the game-over screen restarts; Enter on the menu starts.

### Task 7: Basic procedural textures (view)
- `src/view/textures.ts`: build `CanvasTexture`s once: `stoneFloor` (512², tiles with grout, value-noise grime, seamless by wrapping noise), `wallBricks` (running bond, mossy tint), `woodBark` (vertical grain for logs), `leaves` (blotchy green for branches), all `RepeatWrapping`; repeat set per mesh from world size (1 tile ≈ 2 m).
- Apply to floor, walls, log, branch; keep emissive accents. Colour-space `SRGBColorSpace`.
- Screenshot check via the headless script.

### Task 8: Verify and ship
- `npm test`, `tsc`, autopilot run ≥ 1000 m with patterns and power-ups active, screenshots of textures, a turn, a gap, monkeys close.
- Commit, push, update `AI.md`.
