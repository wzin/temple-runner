# Totem Dash

A web-based endless runner game inspired by Temple Run 1.0.

## Tech Stack
- **Framework**: Three.js
- **Platform**: Web browser (desktop first for v1)
- **Package Manager**: npm (via nvm)
- **Build Tool**: TBD (likely Vite for fast dev)

## Core Gameplay
- Endless runner with monkeys chasing from behind
- Player runs automatically at fixed speed (no acceleration in v1)
- Procedurally generated path with turns and obstacles
- Score = distance traveled + coins collected

## Controls (Desktop v1)

| Key | Action |
|-----|--------|
| A / D | Hold to drift left/right on the path |
| Left Arrow | Turn left at corners |
| Right Arrow | Turn right at corners |
| Up Arrow | Jump |
| Down Arrow | Slide |

*Mobile support (touch + gyro) planned for v2*

## Obstacles

| Obstacle | Required Action | Visual |
|----------|-----------------|--------|
| Fallen tree | Slide under | Horizontal bar across path |
| Fire | Jump over | Low obstacle with flame color |
| Turn (corner) | Press turn direction | Path bends left or right |

## Stumble System
- Proximity bar shows how close monkeys are
- Hitting an obstacle (fire/tree) = stumble, bar increases
- Bar fills up = monkeys catch you = game over
- Bar slowly decreases over time while running clean

## Turn Mechanics
- At corners, player MUST press correct turn direction
- Missing a turn = fall off edge = instant game over (dramatic fall animation)
- Turns are a skill check, not forgiving

## Collectibles
- **Coins**: Scattered along the path, add to score
- Coins appear in lines/patterns on the path

## Power-ups (v1)

| Power-up | Effect | Duration |
|----------|--------|----------|
| Magnet | Attracts nearby coins automatically | ~10 seconds |
| Shield | Ignore next obstacle hit (no stumble) | 1 hit |
| Speed Boost | Temporary speed increase | ~5 seconds |

## Visual Style
- **Aesthetic**: Abstract/geometric - simple colored shapes, minimal detail
- **Player**: Simple capsule/pill shape (easy to animate)
- **Environment**: Clean geometric shapes, solid colors
- No textures for v1

## UI Elements (Standard)
- **Main menu**: Play button, controls displayed
- **In-game HUD**: Score/distance, coin count, proximity bar, pause button
- **Pause menu**: Resume, restart, quit to menu
- **Game over screen**: Final score, high score (session), restart button

## Audio (SFX only)
- Jump sound
- Slide sound
- Coin pickup
- Stumble/hit
- Game over
- UI button clicks

## Data Persistence
- High score: Session only (resets on browser close)
- No localStorage for v1

## Not in v1
- Mobile/touch controls
- Gyroscope support
- Tutorial
- Multiple characters/skins
- Shop/upgrades
- Leaderboards
- Background music

---
*Last updated: Initial requirements complete*
