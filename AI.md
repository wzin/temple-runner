# Totem Dash - Project Knowledge

## Overview
Temple Run-inspired endless runner built with Three.js + TypeScript + Vite. Abstract/geometric visual style.

## Quick Start
```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # Production build
```

## Controls
- **A/D**: Strafe left/right
- **Up/W/Space**: Jump
- **Down/S**: Slide
- **Left Arrow**: Turn left at corners
- **Right Arrow**: Turn right at corners
- **ESC**: Pause

## Architecture

### Core Files
| File | Purpose |
|------|---------|
| `src/main.ts` | Game loop, initialization, screen transitions |
| `src/scene.ts` | Three.js scene, renderer, lighting |
| `src/camera.ts` | Third-person camera following player |
| `src/player.ts` | Player mesh, movement, jump/slide/turn mechanics |
| `src/input.ts` | Keyboard input handling with frame-based press detection |
| `src/gameState.ts` | Central state: score, coins, proximity, power-ups |

### Path System
| File | Purpose |
|------|---------|
| `src/path/PathSegment.ts` | Creates straight and turn segment geometry |
| `src/path/PathGenerator.ts` | Procedural spawning, turn detection, cleanup |

**Key Implementation Details:**
- Segments use **world-space positioning** with quaternion rotation (not group rotation)
- Each floor/wall piece is positioned individually at calculated world coordinates
- `quaternion.setFromUnitVectors(Vector3(0,0,1), direction)` aligns geometry with path direction
- Turn segments have: incoming floor, corner fill, outgoing floor, walls, arrow indicator
- At least **2 straight segments** follow every turn
- Turn frequency: 85% straight, 7.5% left, 7.5% right

**Cross Product for "Right" Vector:**
```typescript
const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
```
This gives the correct right-hand perpendicular. Using `crossVectors(up, direction)` gives the WRONG direction.

### Obstacles
| File | Purpose |
|------|---------|
| `src/obstacles/FallenTree.ts` | Horizontal log (jump OR slide) |
| `src/obstacles/Fire.ts` | Low flames (must jump) |
| `src/obstacles/ObstacleManager.ts` | Spawning, collision detection |

**Spawn Settings:**
- `SPAWN_INTERVAL = 60` (distance between spawn attempts)
- `MIN_SPAWN_DISTANCE = 80` (no obstacles before this distance)
- `MIN_OBSTACLE_SEPARATION = 40` (minimum gap between obstacles)
- Spawn chance: 15% per eligible segment

### Collectibles & Power-ups
| File | Purpose |
|------|---------|
| `src/collectibles/Coin.ts` | Rotating coins, magnet attraction |
| `src/powerups/PowerUp.ts` | Magnet (blue), Shield (green), Speed (orange) |

### Monkey Chase System
`src/monkey.ts` - Three monkeys chase from behind. Proximity bar increases on obstacle hits, decreases while running clean. 100% = game over.

### Audio
`src/audio.ts` - Procedural Web Audio API sounds (no audio files needed). Synthesizes: jump, slide, coin, stumble, gameOver, click, powerup.

### UI (HTML/CSS Overlay)
| File | Purpose |
|------|---------|
| `src/ui/MainMenu.ts` | Title screen, play button |
| `src/ui/HUD.ts` | Score, coins, proximity bar, power-up timer |
| `src/ui/PauseMenu.ts` | Resume, restart, quit |
| `src/ui/GameOver.ts` | Final score, high score, retry |
| `src/styles.css` | All UI styling |

## Game Mechanics

### Turn System
- Turn segments have a `turnZone` (Box3) for detection
- Player must press correct arrow key while in zone
- Wrong key or no input = `missedTurn()` = fall animation = game over

### Collision Detection
- Player has bounding box that changes height when sliding
- Fallen tree: avoidable by jump OR slide
- Fire: must jump (sliding doesn't help)
- Collision triggers `triggerStumble()` which increases proximity bar

### Proximity Bar
- Increases by 25 on each obstacle hit
- Decreases by 2/second while running clean
- At 100% = game over (monkeys catch player)
- Shield power-up blocks one hit

## Constants Reference

### Path Geometry (PathSegment.ts)
```typescript
SEGMENT_WIDTH = 6
SEGMENT_LENGTH = 20
WALL_HEIGHT = 2
WALL_THICKNESS = 0.5
```

### Player Physics (player.ts)
```typescript
LANE_WIDTH = 2
MAX_LANE_OFFSET = 2
LATERAL_SPEED = 8
JUMP_FORCE = 12
GRAVITY = 30
SLIDE_DURATION = 0.6
TURN_DURATION = 0.3
```

### Game Speed (gameState.ts)
```typescript
INITIAL_SPEED = 15
```

## Known Issues / Future Improvements
1. Turn wall geometry could be refined for cleaner corners
2. Difficulty could ramp up over time (speed increase, more obstacles)
3. Could add more obstacle types
4. Mobile touch controls not implemented

## File Structure
```
totem_dash/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── AI.md
├── src/
│   ├── main.ts
│   ├── scene.ts
│   ├── player.ts
│   ├── camera.ts
│   ├── input.ts
│   ├── gameState.ts
│   ├── score.ts
│   ├── audio.ts
│   ├── monkey.ts
│   ├── styles.css
│   ├── path/
│   │   ├── PathGenerator.ts
│   │   └── PathSegment.ts
│   ├── obstacles/
│   │   ├── FallenTree.ts
│   │   ├── Fire.ts
│   │   └── ObstacleManager.ts
│   ├── collectibles/
│   │   └── Coin.ts
│   ├── powerups/
│   │   └── PowerUp.ts
│   └── ui/
│       ├── MainMenu.ts
│       ├── HUD.ts
│       ├── PauseMenu.ts
│       └── GameOver.ts
```
