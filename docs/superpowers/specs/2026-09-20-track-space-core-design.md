# Temple Runner — track-space core redesign

Date: 2026-09-20
Status: approved in chat (rewrite the core in track space, keep the UI/audio shell)

## Problem

The existing prototype (`totem_dash`, Three.js + TypeScript + Vite) moves the
player in world space and derives everything else from that. This produces
four coupled defects that make the demo unplayable:

1. **Turns drift.** A turn rotates the player's heading from wherever the key
   was pressed, not around the corner. After each turn the player's centre line
   diverges from the path's; walls have no collision, so the player runs through
   walls or into the void.
2. **Turn input is dropped.** The turn is accepted only if the key press lands
   in the frame while the player is inside an axis-aligned `Box3` around the
   corner. Early presses are lost; the window is under half a second.
3. **Spawning breaks after turns.** Obstacles and coins use
   `player.position.length()` (distance from the origin) as the run distance.
   After turns that value stops growing, so spawning stalls or misfires.
4. **Collisions misalign after turns.** Obstacle bounding boxes are axis-aligned
   in world space; once the path is not aligned with the Z axis they no longer
   cover the geometry.

## Goals

- Turns, jumps, slides, coins and obstacles behave like Temple Run 1: the
  player is always on the track, turns snap to the corner, input is buffered.
- The core model (track, player, spawning, collision) is pure TypeScript with
  no Three.js dependency, unit-tested without WebGL.
- The project builds and deploys as a static site through Komodo behind Traefik
  at `https://temple.ziniewicz.eu` from day one.
- Development runs inside Docker (no host `node_modules`).

## Non-goals (this stage)

Textures, models, mobile controls, persistence, sound assets, difficulty
ramp. These are later stages listed under Roadmap.

## Design

### Track space

Every moving thing has a **track coordinate** `(s, x, y)`:

- `s` — distance along the track centre line from the start, metres.
- `x` — lateral offset from the centre line, metres, positive to the right
  in the direction of travel. Clamped to `±(TRACK_HALF_WIDTH − PLAYER_RADIUS)`.
- `y` — height above the floor.

The **track** is an ordered list of segments. Each segment has a start
distance `s0`, a length, a start point and a unit heading in world space, and a
kind: `straight` or `turn` (`left`/`right`, 90°). A turn segment is a straight
run-in to the corner point followed by a straight run-out along the new
heading; the corner is at `s0 + runIn`.

`track.sample(s, x)` returns the world position and heading for a track
coordinate: find the segment containing `s`, walk `s − s0` along it (through
the corner if past it), then offset by `x` along the segment's right vector at
that point. Because the corner is a point on the centre line, positions on both
sides are continuous. This single function is what the renderer uses to place
the player, coins, obstacles and camera, so nothing can drift.

### Player

Player state lives in track space: `s`, `x`, `y`, `vy`, `state` (`running` |
`jumping` | `sliding` | `stumbling` | `falling` | `dead`), `slideTimer`,
`stumbleTimer`, `heading` (index of the segment whose heading the camera uses).

Per tick with `dt`:

1. `s += speed × dt` (speed frozen while falling/dead).
2. Lateral: A/D drift `x` at `LATERAL_SPEED`, clamped.
3. Vertical: `vy −= GRAVITY × dt; y += vy × dt; if y ≤ 0 → land`. Jump sets
   `vy = JUMP_VELOCITY` from the ground only. Tuned for ~0.75 s airtime and
   ~2.2 m apex so a low obstacle (fire, 0.8 m) is clearable with margin.
4. Slide: sets `sliding` for `SLIDE_DURATION`; the player's collision height
   drops from 1.8 m to 0.9 m. Jump cancels slide and vice versa is disallowed.

### Turns and input buffering

Each turn segment has a **turn window** on the centre line:
`[corner − TURN_EARLY, corner + TURN_LATE]` (defaults 6 m before, 2 m after).

- A turn key press is recorded with its timestamp into a one-slot **input
  buffer** that lives for `BUFFER_MS` (150 ms) or until consumed.
- When the player's `s` is inside the window and the buffer holds the correct
  direction, the turn is **accepted**: the buffer is consumed, the player's
  heading segment advances, and a short camera swing plays. `s` is unchanged;
  the geometry handles the corner because `sample()` follows the centre line.
- Wrong direction inside the window: the player **falls** (Temple Run 1 rule).
- Passing `corner + TURN_LATE` with no accepted turn: the player **falls**.
- Turn keys outside any window are ignored (buffer just expires).

`x` is preserved through a turn. Temple Run 1 keeps the lateral offset relative
to the new heading, which is what `sample()` gives for free.

### Spawning

Spawning is driven by `s`, never by world position. A **spawner** keeps a
cursor `sSpawned` (how far ahead content has been laid) and, whenever
`sSpawned < player.s + LOOKAHEAD`, lays the next **chunk**:

- The track generator appends segments ahead until the track extends past
  `player.s + LOOKAHEAD`, and drops segments whose end is behind
  `player.s − KEEP_BEHIND`. Rule: after a turn at least two straights; turn
  probability 15% per straight otherwise, direction 50/50, never two turns in
  a row.
- Coins are placed in **runs**: 5–8 coins, 1.5 m apart, at a fixed `x` lane
  (−1.5, 0, 1.5), optionally in an arc (raised `y` so they must be jumped
  for). Coin runs never overlap a turn window or an obstacle's `s`.
- Obstacles have a **type table**: `fire` (low, must jump), `log` (mid, jump or
  slide), `branch` (high bar, must slide), `gap` (missing floor stretch, must
  jump). Each gets an `s`, an `x` extent (full width or one lane) and a
  height range. Minimum spacing 25 m between obstacles, none within 10 m of a
  turn window, none for the first 60 m.

### Collision

Collision is a 1D-plus check in track space: an obstacle with `s ∈ [sA, sB]`,
`x ∈ [xA, xB]`, `y ∈ [yA, yB]` hits the player when the player's `s` crosses
into `[sA, sB]` (swept between last and current `s` so high speed cannot skip
it), the player's lateral extent overlaps `[xA, xB]`, and the player's vertical
extent `[y, y + height]` overlaps `[yA, yB]`. Coins use a radius check on
`(s, x, y)` distance. Each obstacle is checked once (a `hit`/`passed` flag).

Hit result: `stumble` (proximity meter +25, brief slowdown, shield consumes it)
except `gap`, which is a fall.

### Rendering

Three.js is a **view** of the model. `TrackView` builds meshes per segment when
segments are appended and disposes them when dropped. `PlayerView`,
`CoinView`, `ObstacleView` read track coordinates each frame and place meshes
with `track.sample()`. The camera sits at `sample(player.s − 8, 0)` raised
5 m, looking at `sample(player.s + 6, x/2)` with a smoothed heading, so
turns feel like the Temple Run swing. No game logic lives in views.

### Module layout

```
src/
  core/            pure TS, no Three.js, unit-tested
    track.ts       segment list, generator rules, sample()
    player.ts      state machine, physics tick, turn acceptance
    input.ts       key state + one-slot buffer (DOM adapter in ui/)
    spawner.ts     coins/obstacles by s, type table
    collision.ts   sweep + overlap checks
    game.ts        ties the above together; tick(dt) → events
    rng.ts         seedable PRNG (deterministic tests, replays later)
  view/            Three.js
    scene.ts camera.ts trackView.ts playerView.ts coinView.ts obstacleView.ts
  ui/              kept from the prototype: HUD, menus, styles, audio, DOM input
  main.ts          wiring + requestAnimationFrame loop
```

`gameState.ts`, `score.ts`, `audio.ts`, `ui/*` and `styles.css` are reused
with minimal edits (they already read a plain state object). The old
`path/`, `player.ts`, `obstacles/`, `collectibles/`, `powerups/`, `monkey.ts`
are replaced. Power-ups and monkeys return in stage 2 on top of the new core.

### Testing

Vitest, run inside the dev container. Core tests:

- `track`: sample() continuity across a corner; heading after left/right;
  generator invariants (two straights after a turn, no double turns).
- `player`: jump airtime/apex within tolerance; slide height; turn accepted
  from a buffered early press; wrong turn → fall; late → fall; `x` preserved.
- `spawner`: no obstacle inside a turn window; spacing; coin runs don't
  overlap obstacles.
- `collision`: swept hit at high speed; jump clears fire; slide clears branch;
  slide does not clear fire.

Manual check: `docker compose up dev` → http://localhost:3000, play through
several turns.

### Deployment

- `Dockerfile`: stage 1 `node:22-alpine` runs `npm ci && npm run build`;
  stage 2 `caddy:2-alpine` copies `dist/` to `/srv` with a `Caddyfile`
  (SPA fallback, gzip, security headers, 1 h cache for hashed assets).
- `compose.yaml`: service `web`, `container_name: temple-runner`, network
  `traefik_proxy` (external), wget healthcheck, `restart: unless-stopped`.
  Profile `dev` runs Vite with the source mounted, port 3000.
- Traefik route in `homecloud/traefik/dynamic/temple-runner.yml`:
  `Host(\`temple.ziniewicz.eu\`)` → `http://temple-runner:80`, letsencrypt.
  Public, no ipgate.
- Komodo: stack `temple-runner` from GitHub `wzin/temple-runner`, server
  mail.ziniewicz.eu, webhook on push to `main` (registered by hand in the UI).

## Roadmap after this stage

2. Feel and items: speed ramp, camera tuning, power-ups (magnet, shield,
   boost), monkeys/proximity meter, stumble animation.
3. Look: textures, environment props, character model, skybox, particles.
4. Mobile: swipe gestures, tilt drift, responsive HUD.
5. Meta: persistent high score, run stats, audio assets, difficulty tiers.
