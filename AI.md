# Temple Runner — project knowledge (AI.md)

Temple Run-style endless runner in the browser. Three.js + TypeScript + Vite, a pure-TypeScript
**track-space core** with 54 vitest tests, a tiny Node + SQLite leaderboard API, generated art from
fal.ai, CC0 low-poly models from Kenney. Deployed as two containers behind Traefik via Komodo at
**https://temple.ziniewicz.eu**. Current version: see `VERSION` (0.7.x as of 2026-09-20).

Owner: Wojtek (wzin). Repo: `git@github.com:wzin/temple-runner.git` (SSH only). Everything runs in
Docker; nothing is installed on the host except what `scripts/*.mjs` need (node 22, python3 + PIL + numpy).

---

## 1. Layout

```
src/core/        pure TS game model, no Three.js, unit-tested       (track, player, spawner, collision, game, difficulty, powerups, input, rng)
src/view/        Three.js rendering of the model (no game logic)     (scene, camera, floorView, trackView, decalView, propView, modelView, obstacleView, coinView, powerUpView, playerView, monkeyView, torchView, particles, flameMaterial, skyView, groundView, cliffView, ruinsView, cloudView(mist only), textures, biome, util)
scripts/trim-glb.mjs  gltf-transform: keep named pieces / animation clips, embed external textures, prune
src/ui/          DOM overlay: HUD, menus, game over + leaderboard, DOM/touch input
src/main.ts      RAF loop, screens, events → sound/particles/camera, skin picker, hints, countdown
server/index.mjs leaderboard API (Node 22 node:sqlite)
scripts/         gen-texture.mjs (fal.ai), optimize-assets.mjs (WebP), rebuild-normals.mjs, release.sh
public/          textures/<set>/{color,normal,roughness,ao}.webp, sprites/*.webp, art/*.webp|jpg, models/{kenney/*.glb, ruins/ruins.glb, chars/*.glb}, favicon.png
docs/superpowers/ specs and plans (2026-09-20 track-space core, stage2 polish, stage3 forks/gaps/biome)
```

Docker: `Dockerfile` (node build → Caddy serving `dist/`, `/api/*` proxied to `api:3002`), `Dockerfile.api`,
`compose.yaml` (services `web`, `api`; dev profile `dev` + `api-dev`, host port 3001). `VERSION` is copied into the
web image and injected as `__APP_VERSION__` (bottom-right label).

## 2. Commands

```bash
docker compose --profile dev run --rm dev npm ci        # once, fills the node_modules volume
docker compose --profile dev up -d dev                  # http://localhost:3001 (DEV_PORT=…); api-dev comes with it
docker compose --profile dev run --rm dev npm test      # 54 tests
docker compose --profile dev run --rm dev npx tsc --noEmit
docker compose --profile dev run --rm dev npm run build
node scripts/gen-texture.mjs <name> "<prompt>" [--kind pbr|sprite|image|panorama] [--no-seam] [--no-depth] [--w W --h H] [--seed N]
node scripts/optimize-assets.mjs                        # everything under public/ → WebP (run after every generation)
node scripts/rebuild-normals.mjs                        # normal maps from colour (high-pass luminance, contrast stretch)
scripts/release.sh X.Y.Z                                # writes VERSION, commits, tags vX.Y.Z, pushes main + tag
node scripts/trim-glb.mjs in.glb out.glb --keep-nodes A,B   # (in the dev container) library GLB → only these pieces
node scripts/trim-glb.mjs in.glb out.glb --keep-anims Idle,Run # character → only these clips; --keep-nodes NONE = clips only
node scripts/trim-glb.mjs in.glb out.glb                    # plain rewrite: embeds external textures (Kenney colormap.png)
```

Headless play-testing (**always cap the container**: `docker run --memory=2g --memory-swap=2g --cpus=2 --pids-limit=400 …`; an uncapped swiftshader Chromium once took the host's GNOME session down): Playwright scripts live in the session scratchpad (not in the repo); they drive the game
through `window.__game` (the live `Game`) and `window.__scene`, freeze the simulation for screenshots by wrapping
`game.tick` (a real screenshot takes ~1 s under swiftshader, during which the runner would travel 15 m), and press
keys with `page.keyboard`. Image `gamedev-playwright:latest` (local) has Playwright 1.50. Pattern worth keeping.

## 3. Track space (core)

Every moving thing has `(s, x, y)`: distance along the centre line, lateral offset (right positive), height.
`Track.sample(s, x, y)` / `sampleSegment(seg, s, x, y)` map to world space; `samplesAt(s, x, y)` returns one
placement per branch when `s` lies beyond a pending fork (content is drawn on both branches). World axes: start
heading `-z`, right `+x`; right vector of heading `(dx, dz)` is `(-dz, dx)`. Segments are 20 m; a turn is 10 m
run-in + 90° corner + 10 m run-out; the corner square is 6×6 m.

**Generation** (`track.ts`): 3 straights first, ≥2 straights after every turn, then a turn with probability from
`difficultyAt(s)` (0.15 → 0.30). **Self-avoidance:** every candidate segment is tested against all laid corridors
(main path + both fork branches) padded 8 m sideways (`CLEARANCE_HALF_WIDTH`), so no crossings and no parallel
corridors closer than ~11 m; the chooser ranks free candidates by reachable depth (`reach`, search depth `LOOK = 5`),
then open straight distance ahead (`openness`), then the wanted shape. **Forks** (`fork: true`, from 150 m, 35% of
turns): both continuations are generated (`branches`, `BRANCH_AHEAD = 100`, extended to the lookahead) and rendered
via `allSegments()`; `resolveFork(seg, dir)` adopts the chosen branch. If a branch is boxed in it stops growing (`deadBranch()`), or, when the corner is beyond
`collapseDistance` (set by the game to `max(160, 0.46·lookahead + 60)`, i.e. behind the fog), the fork collapses into a plain corner
(`collapseFork`). `resolveFork` never takes a dead branch: a press towards it is redirected to the open side and the side taken is
returned (a tester once saw a branch vanish in view, pressed towards it and died at the corner). Segments
behind `player.s − 40` are dropped. Stress tests simulate 3 km runs with drop-behind and fork resolution.

**Turn windows** (`TurnWindow {from, strictFrom, corner, to}`): a missed corner is drawn as running straight over the corner square (`game.missedCorner`, playerView) so it never looks like an auto-turn. `turnLead = 1.0 s × speed` before the corner (a correct
press is accepted from here), `turnEarly = 0.4 s × speed` (`strictFrom`, the reaction zone), `turnLate = max(3 m,
0.35 s × speed)` after the corner. Missing the corner falls only once `s > to` (the runner visibly follows the bend
meanwhile; the fall pose is staged back at the corner). **A wrong-direction press never kills**: A/D and ←/→ both
drift and turn, so a dodge near a corner must be harmless. At a fork an early press is stored as `forkIntent` and the
branches stay until the reaction zone or the corner; during boost/grace a press still decides, random only if none.
`TurnBuffer` keeps a press 150 ms, but never expires it before one tick has seen it (frame hitches).

**Player** (`player.ts`): speed 15 → 24 m/s over 1500 m (`difficulty.ts`, `speedScale`), jump 11.5 m/s / g 30 (0.77 s
airtime, 2.2 m apex), slide 0.7 s (height 0.9), stumble slows 0.6× for 0.5 s, fall 1.5 s then dead.

**Spawner** (`spawner.ts`): 12 m chunks; obstacle chance 0.45 → 0.7; spacing is time-based (1.7 s → 1.05 s of running);
nothing within `1.2 s × speed` before or after a corner (`afterCornerSeconds`) and whole patterns stay clear of turn
windows (including branch windows). Obstacles: fire (lane, y 0–0.8, jump), log (y 1.0–1.6, slide/jump; drawn as a stone column that topples off a wall 62 → 34 m ahead and drops to chest height), branch (y
1.0–2.6, slide; drawn as a 4.2 m gate with a solid panel above the lintel, unmistakably not jumpable), gap (4 m = two slabs, fatal, jump), **halfgap** (8 m; one side of the ridge from the wall to 0.4 m past the centre is gone, only the far lane is safe; floor, walls, embankment, decals and torches all break on that side via `view/holes.ts`), **chasm** (6 m full break with a plank-and-rope bridge one lane wide, laid as two fatal pieces either side of the planks, `plankX`; walls stay), **spikegate** (from 300 m: the gate shape with red-hot iron spikes, fatal — pass under or die). Singles: gap, halfgap, chasm and spikegate carry double weight. **Density rules** (`density.test.ts` asserts ≤20% of straight segments empty over 1.2 km): chunks of 4 m (12 m steps missed the few free metres on short straights); a single's clearance uses its own depth and falls back to the shallowest kind that fits (fire/log/gap/spikegate); set pieces that do not fit become a fitting single; an obstacle is forced 14 m after the last one; corner clearance 0.7 s after / 8 m before; spacing 0.9 → 0.75 s. Content past a pending fork is laid for both branches at once and stays sparse, so after `resolveFork`/`collapseFork` the spawner re-lays everything beyond corner+10 (`takeResolvedCorners` → `relayFrom`). Turn segments themselves hold nothing (≈40% of segments). Obstacles clear ground coins and power-ups they cover (`clearUnder`). **One knob**: `OBSTACLE_DENSITY` in `difficulty.ts` (0–100, default 50) scales chance, spacing and forcing distance; `?density=40` in the URL overrides it for that page load. **Pit tolerance** (`collision.ts`): pits claim the runner only 2 m past their edge (coyote time to jump) and judge footing by the body centre ±0.15 m, so brushing a plank edge is fine (tested). Patterns unlock with distance: logWithArc 100 m, twoLaneFire
200 m, gapThenBranch 400 m (branch placed at `gap + 0.77 s × speed + 4 m`), laneFireRow 600 m. Coins in runs of 5–8
(some arcs), `value` 1 or 5 (big medallion). Power-ups from 120 m, 8%/chunk, **stacking** (`game.timers` per kind; picking the same kind refreshes it; HUD lists them all): magnet 10 s (pull
`max(20, 1.8 × speed)` m/s), shield (one stumble), boost 5 s (×1.6, invulnerable, auto-turns) + 0.6 s grace.
Proximity meter +25 per hit, −2/s, 100 = caught; boost resets it and hides the cats. **Coin energy**: each coin value adds 0.6 to `game.energy` (~170 coin-points), capped at `100 × seconds/45` since the run or last boost, so a boost is never ready before 45 s of running (typically ~60 s); at 100 the `energyFull` event fires and `pressBoost()` (E / Enter / Shift / B, tapping the HUD bar or the pad's ⚡) spends it on a normal 5 s boost.

**Lookahead:** `game.lookahead = clamp(12 s × speed, 140, 230)` m; fog near/far are 7%/40% of it; views draw only `game.visibleSegments()` (s0 within 50% of the lookahead), the rest exists for the spawner. Turn chance 0.35 → 0.5 with one straight after a turn: frequent corners are the render-distance limiter. Shader flames carry `fog: true` so torches no longer pierce the fog.

## 4. Rendering (view)

Everything repeated is instanced and rebuilt from the live segments each frame (~170 drawables, ~1400 instances):

| Module | What |
|---|---|
| `floorView.ts` | 2 m floor slabs in eight looks with per-instance colour variation (`setColorAt`, also on wall and embankment blocks) and 2.6 m half slabs beside half gaps (path/broken/mossy mixed per slab, plus whole stretches of glyph, cobble, sand, obsidian, temple) with tilt/height noise and sunk slabs; **wall blocks** (2 m, three looks, straights only) so a gap cuts floor + walls; torn slabs (`brokenSlabGeometry`) at gap lips; fork stubs |
| `trackView.ts` | per-segment groups: bend walls (L-shaped outer wall, inner post), T walls for forks, totems, glyph plates. Straight walls are NOT here (see floorView) |
| `cliffView.ts` | stone embankment blocks from the ground (y −14) to the floor, skipped under gaps |
| `decalView.ts` | per 2 m block: relief band, gold trim; cornice blocks on wall tops; vines/banners; portal arch or jaguar face on bend walls; arrow glyph decals on corner plates; start mosaic — all skip gap spans |
| `modelView.ts` | GLB models flattened to instanced parts (`register`), base at y 0, centred; `lib:` entries come from library GLBs (`ruins`, `nature`) by node name; `gold: true` recasts a piece in gold. Forest = Quaternius Stylized Nature (textured trees/pines/palms/dead trees, bushes, rocks, grass, a giant twisted landmark tree 12% of segments) + Kenney fillers; 40 spots per segment. Ruin clusters (75% of segments, 10–25 m out) with shrines, a ring of undergrowth/rubble and a mist patch; more mist patches on both sides of every segment (`mistPatches` → cloudView). Columns at joints and bends, spikes/skulls (`crest`) along the wall tops, pots/crates at the wall feet, path stones, gap rubble, statues at bends, **golden idol on the T wall of every fork**. Gateway arches were tried and removed (read as blocking the path). `window.__models` = per-model counts for the harness |
| `propView.ts` | remaining billboards: ferns, bushes, skulls, roots on the cliff; textured columns and pillars |
| `obstacleView.ts` | every obstacle has three looks by `id % 3`. fire = bonfire / burning log / stone brazier ring: coal bed (lava set, emissive), four shader flame sheets (one camera-facing + two fanned + hot core), flickering ground glow, one point light following the nearest fire ahead; log = bark cylinder with tree-ring caps; **branch = low gate** in stone, wooden stakes or obsidian+gold (posts, lintel 1.0–1.8 m, five teeth to 2.6 m — must slide); the toppling log is a dead tree or a stone column; gaps show a lava or river pool below (40% water) and a veil while invulnerable |
| `coinView.ts` | coin discs with embossed faces; big medallions |
| `powerUpView.ts` | big model pickups over a halo: red horseshoe magnet (built), Kenney round shield, golden triple chevron for boost (built), Kenney jewel recast red = ruby gem. The boost blinks (aura + gap veils) in its last 1.5 s (`game.boostEnding`) |
| `playerView.ts` | animated GLB character (Quaternius, CC0) with an AnimationMixer: Run speed-matched (`STRIDE` 7.5 m/cycle), Roll = slide (compressed to 0.7 s), HitRecieve = stumble, Death = fall, Idle when standing. No jump clip in the pack → `Man_Jump` from the Animated Men pack retargeted by bone name (quaternion tracks only). `SKINS` = files adventurer / adventurer-f / hooded (ids runner / runner-f / guardian kept for saved prefs); only the chosen file is downloaded (~1.2–1.5 MB). Normalised to 1.75 m, feet at 0. Shield aura, boost ghosting, dim lamp kept |
| `monkeyView.ts` | the chasers: three Bengal tigers (Poly by Google "Geo Bengal Tiger", CC-BY 3.0, static mesh; procedural gallop bob/rock/lunge, 1.3 m) `9 → 2.5 m` behind as proximity rises, snapping (Attack/Punch) above 80, hidden while invulnerable |
| `torchView.ts` | instanced torches: bronze bowls, shader flames, soot decals |
| `flameMaterial.ts` | procedural fire shader for instanced quads (instancing-aware, `tickFlames(t)`): domain-warped 5-octave fbm, three overlapping tongues, cavities, rising sparks; opts scale/speed/width/glow. Used by torches and bonfires |
| `particles.ts` | pooled additive points: embers over fire, coin sparks, hit sparks, power-up bursts, landing dust |
| `skyView.ts` | painted equirect sky as `scene.background` (horizon and below = fog colour so fogged geometry vanishes); replaced by `public/art/sky.webp` panorama when it loads |
| `ruinsView.ts`, `cloudView.ts` | skyline ruins and far temples (fog-tinted billboards); ground mist wisps. Cloud/canopy sheets were removed (read as hanging textures) |
| `camera.ts` | 11 m behind, 6.5 m up, swing on turn, dip on landing, shake on hit; follows `fallPose` when falling |
| `scene.ts` | ACES tone mapping (exposure 1.05), pixel ratio ≤ 1.5, no shadow maps, sun/ambient/fog from `biome.ts` (`updateFog(lookahead)`) |

**3D models.** Sources that work non-interactively: Kenney zips (`curl kenney.nl/assets/<kit>` and grep the `media/pages/assets/.../*.zip` link; `Models/GLB format/*.glb`, some kits reference `Textures/colormap.png` externally → rewrite with `trim-glb.mjs` to embed) and Poly Pizza (`curl -A Mozilla poly.pizza/m/<id>` and grep `static.poly.pizza/<uuid>.glb`; bundles list `/m/<id>` + `alt` names). Quaternius packs on Poly Pizza are CC0 GLBs; the Modular Ruins pack is one GLB with 95 named pieces (trimmed to 36). Characters: "CharacterArmature" rigs, 24 clips, no Jump; the Animated Men "Man" has Man_Jump on mostly the same bone names. Sizes: ruins 2.1 MB, each character ~1.3 MB, Kenney pieces ~1 MB total.

**Textures** (`textures.ts`): procedural PBR fallbacks baked at startup (~0.4 s) for floor/wall/bark/leaves/ground/cliff/
totem/glyph; `loadRealTextures()` swaps the generated sets in place. `remoteSet(folder, colour, priority)` gives a flat
placeholder set that fills from `/textures/<folder>/*.webp`; `sprite(name)` a transparent placeholder from
`/sprites/<name>.webp`. Priority queue: 0 immediately, others after the first frame, 3 files per 120 ms
(`releaseAssets`, `onAssetProgress` → menu "LOADING WORLD n/total"). **Always `dispose()` the placeholder texture
before swapping its image**: WebGL2 sizes texture storage on the first upload, so a 2×2 placeholder would otherwise
keep rendering a single colour (the "flat textures" bug of v0.5–0.6). `pbrMaterial(maps, extra)` wires a set.

**Biome** (`biome.ts`): one entry `inca` (sky colours, sun, fog fractions, light, tints). Add entries for new biomes.

## 5. UI, input, mobile

HUD (score, coins, proximity bar, power-up indicator, NEW HIGH SCORE banner, coach hints), main menu (skin picker,
hall of fame top 5, loading bar, key help), pause (ESC, big pause button), resume = 3-2-1 countdown, game over =
arcade name entry (remembered nick as placeholder, Enter saves, then Space/Enter restarts) + top 10 with your rank.
Keys: A/D and ←/→ = hold to drift, tap to turn; W/↑/Space jump; S/↓ slide; E/Enter/Shift/B boost. Touch (`domInput.ts`): **swipe anywhere**
(recognised after 24 px of movement; touches starting within 28 px of the screen edges are ignored because that band belongs to browser
back/forward and system gestures) plus a one-thumb pad: a diamond of four buttons with ⚡ in the centre in one bottom corner, side
swappable (⇄) and switchable off in the pause menu (`temple-runner.pad` in localStorage); text selection/callouts/scroll
blocked (fixed Siri/selection popups and hijacked swipes on iOS/Android). Hints: controls line for 4.5 s at start,
"TAP ◄ ► / SWIPE TO TURN" before the first corner until the first turn.

## 6. Accounts, rubies, lobby (0.11)

**Economy** (`core/economy.ts`, tested): 1 ruby per 1 000 coins collected across all runs, plus rare ruby gems on the
track (`spawner` lays a `ruby` pickup about once per 2.6 km, never within 4 m of a corner; `game.rubiesFound`).
Ten characters (`SKINS`, each with a **trait** — `Traits` multipliers applied by `game.setTraits` at run start): adventurer 0 (none),
adventurer-f 1 (energy ×1.1), farmer 2 (magnet ×1.2), hooded 5 (boost ×1.2), punk 6 (cat decay ×1.3), witch 10 (magnet radius ×1.3 + ×1.2),
soldier 10 (shield 2 hits), scifi "Pilot" 14 (boost ×1.3, energy ×1.15), king 18 (coins ×1.2), astronaut 25 (ruby gems ×1.5, boost ×1.2).
Server `SKIN_COST` mirrors the prices.
**Server** (`server/index.mjs`, node:sqlite): every visitor gets a guest player + `tr_session` cookie (httpOnly, 1 year);
`GET /api/me`, `POST /api/progress {coins, distance, rubies}` (plausibility: coins ≤ 0.8·distance + 30, rubies ≤ 1 + distance/1200),
`POST /api/register {username, password}` (3–12 chars `[A-Za-z0-9_]`, scrypt; **10 registrations per IP per hour**; the guest's
progress becomes the account), `/api/login`, `/api/logout`, `POST /api/unlock {skin}` (spends rubies server-side).
Tables `players`, `sessions`, `registrations`. Rubies = floor(coins_total/1000) + rubies_bonus − rubies_spent.
**Client** (`ui/account.ts`): cookie session, offline queue of unsent runs (`temple-runner.pending-runs`), `onPlayerChange`.
**Lobby** (`ui/MainMenu.ts`, `ui/skinPreview.ts`): carousel with a live 3D preview (own small renderer, Idle clip, slow turn;
← → / A D / swipe on the canvas), locked characters washed out with a 🔒 cost badge, SELECT / UNLOCK FOR N ◆ button,
ruby pill on every screen (`#rubies`), guest nudge → CREATE A PASSWORD modal (register/login tabs), logged-in badge
(`body.logged-in`). `ui/ScoresScreen.ts`: full ladder (up to 200 rows: nick, score, coins, local date without seconds).
**Music** (`audio.ts`): procedural Andean groove synthesised in WebAudio (skin drum, log drums, seed shaker, pan-flute pentatonic
phrases regenerated every four bars) at 96 bpm, scheduled a beat ahead; `startMusic` on the first pointer gesture, intensity ducked to
0.35 in menus/after death, 0.25 paused; MUSIC toggle in the pause menu (`temple-runner.music`).
**Mosaic**: the start sun mosaic is also laid every ~650 m (3% of straights, never over a hole).
**Forks**: 70% of corners are T-junctions (`forkChance`); turn chance 0.55 → 0.7. (16 m segments were tried and hung — the real cause was the branch pre-generation loop in `append`: when `appendToFree` returned null the loop never advanced; fixed in 0.14.1 with a break + dead branch. Shorter segments remain untested since.)
**Loading** (`view/loading.ts`): two stages — `lobby` (menu backdrop + previewed character) behind the `#boot` overlay,
`game` (all texture sets + every GLB through `loadGLB`) shown as the PLAY button filling up; `startGame` refuses until
`progress('game').complete`. **Pillarbox** (`view/viewport.ts`): on wide screens the play area is capped at aspect 0.9
and centred (dark bars), so a desktop does not render a wide forest for nothing; overlays live inside `#game-container`.

## 7. Leaderboard API (`server/index.mjs`)

Node 22 `node:sqlite`, DB at `/data/scores.db` (volume `scores_data`; dev uses `scores_dev`). `GET /api/health`,
`GET /api/scores?limit=`, `POST /api/scores {name, score, coins, distance}`: name `^[A-Za-z0-9 _.-]{1,12}$`, integers,
**score must equal distance + 10·coins** (the game keeps them consistent even on the final tick), 3 s per-IP cooldown. A registered
session's run is stored under the account name whatever the client sent (`scores.player_id`); rows carry `registered`, and
`GET /api/players/<name>/scores` lists an account's runs. Registered players skip the name prompt at game over (auto-save); ★ names
on every board open that player's runs (`ScoresScreen.openPlayer`).
Caddy proxies `/api/*` to `api:3002`; Vite dev proxies to `api-dev` via `API_URL`. Client (`ui/leaderboard.ts`): 8 s timeout,
3 attempts with back-off (3.2 s after a 429), and an **offline queue** in localStorage: a score that still fails is kept and
flushed when the menu or game-over board next opens (a tester saw "Failed to fetch" once — a dropped connection, likely a
redeploy or proxy restart; Caddy access logs on the web container are the place to look). API healthcheck uses 127.0.0.1
(busybox wget resolves localhost to ::1 and the server binds IPv4). The API logs every accepted score.

## 8. Assets pipeline (fal.ai)

Key in `.api_keys` (gitignored, dockerignored) or `FAL_KEY`. `gen-texture.mjs` calls `fal-ai/flux/dev` (28 steps),
kinds: `pbr` (seamless by offset-blend, normals from `fal-ai/imageutils/marigold-depth` unless `--no-depth`; the depth
route often came out flat, hence `rebuild-normals.mjs`), `sprite` (RGBA from black background), `image`, `panorama`
(lower half blended to fog colour). Then `optimize-assets.mjs` → WebP (1024, small sets/sprites 512). ~60 sets +
~25 sprites + 3 art ≈ 12 MB. Cost so far ≈ 3 $ (each image ~3–5 ¢). Credits in `public/textures/CREDITS.md`.
Notes: portraits come out as 3D renders, not cylindrical unwraps (hence the two-hemisphere head); "seamless" blend
leaves faint ghosts on some tiles; wall-vines looked like a tree pasted on the wall and was removed.

## 9. Deployment

Komodo stack `temple-runner` on mail.ziniewicz.eu builds from `wzin/temple-runner` main via GitHub webhook;
**Force deploy must be ON** (default `DeployStackIfChanged` only diffs compose.yaml, so code-only pushes would not
redeploy). Traefik route: `homecloud/traefik/dynamic/temple-runner.yml` → `http://temple-runner:80`; DNS
`temple.ziniewicz.eu` CNAME → cloud.ziniewicz.eu. Release with `scripts/release.sh` (tags `vX.Y.Z`). The UI shows the
VERSION; production said `vdev` until VERSION was copied into the image (0.4.1).

## 10. Conventions and gotchas

- Git remotes must be SSH (`gh repo create` makes HTTPS → ksshaskpass prompts). Never commit `.api_keys`.
- Wojtek wants long tasks handed back with a 7-tone sound (`~/.cache/claude-notify.sh 7`) and a local link.
- Port 3000 on the host is taken; dev uses 3001.
- Restart the dev container after changing `VERSION` (Vite `define` is read at startup).
- Run `optimize-assets.mjs` after every generation, or loaders will 404 (they only read `.webp`).
- Placeholder texture swap → `dispose()` first (see §4). Instanced meshes: `frustumCulled = false` (shared bounding
  sphere at the origin culled everything far from the start — the first "invisible obstacles" bug).
- Vertical UV of equirect canvases: row 0 = zenith for `scene.background`.

## 11. History

0.1 prototype rewrite in track space (fixes drift/dropped input/spawn) · 0.2–0.3 feel, power-ups, monkeys, patterns,
leaderboard, forks, real gaps, biome, mobile · 0.4.x lookahead/fog, both-branch previews, version label, textures
(CC0 then generated), self-avoiding generator, embankment · 0.5.x generated Inca texture set, shader flames,
mobile fixes, early/late turn windows · 0.6.0 skins, big asset pass, WebP + progressive loading, dispose fix,
fork intent · 0.7.0 Kenney models, gap cuts the ridge, natural slabs, no wrong-turn death · 0.7.1 AI.md, no vine wall ·
0.8.0 animated Quaternius characters (3 skins), Modular Ruins library (arches, columns, ruin clusters, props), more Kenney
kits, bonfire shader fire with light, stone gate replaces the leaf-puff branch, score retry + offline queue, API healthcheck ·
0.14.3 real tigers · 0.14.2 pit tolerance + density knob ·
0.14.1 freeze fix (boxed-in fresh fork), density rework, far content culled ·
0.14.0 plank-bridge chasms, spike gates, an obstacle in every segment, 70% forks, stacking power-ups, straight-on missed corners, FPS meter, coin pitch loop ·
0.13.0 ten runners with traits, procedural music, mosaics along the path, 50% forks ·
0.12.0 half-broken runways, 4.2 m gates, toppling columns, tile variation, fogged flames, distance culling + more turns, chevron boost, real magnet, boost blink, ruby per 1000 coins ·
0.11.0 accounts + rubies + lobby carousel + full ladder, two-stage loading, pillarbox, obstacle and pickup variants, ruby gems, three cats 0.7 m ·
0.9.1 three cats · 0.10.0 one-thumb pad + swipe anywhere, falling-tree log, coin energy boost, smaller cats, more gaps/details ·
0.9.0 feedback round: arches out, root sprite out, textured Quaternius nature library replaces Kenney trees, three cats chase, golden idol at forks, 8 floor looks, thicker fog + mist patches, doubled props/coins/crests, bigger runner, aligned hall of fame.

## 12. Next candidates

Mesh simplification for the nature library (NormalTree ~10k verts each; `gltf-transform simplify`); menu preview of the chosen character (idle clip); second biome (night jungle
or ice temple); KTX2 compression; seam-free tiling via inpainting; HUD/menu frames in Inca style; ambient sound;
big-coin/gem variants; water gaps as broken plank bridges (`bridge-plank`, `stone-steps` sets are generated but
unused); `idol` sprite unused.
