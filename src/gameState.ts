export type GameScreen = 'menu' | 'playing' | 'paused' | 'gameover';

export interface GameState {
  screen: GameScreen;
  score: number;
  coins: number;
  highScore: number;
  distance: number;
  proximityBar: number;
  speed: number;
  baseSpeed: number;
  activePowerUp: PowerUpType | null;
  powerUpTimer: number;
  hasShield: boolean;
  isStumbling: boolean;
  stumbleTimer: number;
  isFalling: boolean;
  fallTimer: number;
}

export type PowerUpType = 'magnet' | 'shield' | 'speed';

const INITIAL_SPEED = 15;

export function createInitialState(): GameState {
  return {
    screen: 'menu',
    score: 0,
    coins: 0,
    highScore: 0,
    distance: 0,
    proximityBar: 0,
    speed: INITIAL_SPEED,
    baseSpeed: INITIAL_SPEED,
    activePowerUp: null,
    powerUpTimer: 0,
    hasShield: false,
    isStumbling: false,
    stumbleTimer: 0,
    isFalling: false,
    fallTimer: 0,
  };
}

export const gameState: GameState = createInitialState();

export function resetGame(): void {
  const highScore = gameState.highScore;
  Object.assign(gameState, createInitialState());
  gameState.highScore = highScore;
  gameState.screen = 'playing';
}

export function updateScore(delta: number): void {
  gameState.distance += gameState.speed * delta;
  gameState.score = Math.floor(gameState.distance) + gameState.coins * 10;
}

export function addCoin(): void {
  gameState.coins++;
}

export function addProximity(amount: number): void {
  gameState.proximityBar = Math.min(100, gameState.proximityBar + amount);
}

export function decreaseProximity(amount: number): void {
  gameState.proximityBar = Math.max(0, gameState.proximityBar - amount);
}

export function triggerStumble(): void {
  if (gameState.hasShield) {
    gameState.hasShield = false;
    gameState.activePowerUp = null;
    return;
  }
  gameState.isStumbling = true;
  gameState.stumbleTimer = 0.5;
  addProximity(25);
}

export function triggerFall(): void {
  gameState.isFalling = true;
  gameState.fallTimer = 2;
  gameState.speed = 0;
}

export function gameOver(): void {
  gameState.screen = 'gameover';
  if (gameState.score > gameState.highScore) {
    gameState.highScore = gameState.score;
  }
}

export function activatePowerUp(type: PowerUpType): void {
  gameState.activePowerUp = type;
  gameState.powerUpTimer = 10;

  if (type === 'shield') {
    gameState.hasShield = true;
  } else if (type === 'speed') {
    gameState.speed = gameState.baseSpeed * 1.5;
  }
}

export function updatePowerUps(delta: number): void {
  if (gameState.activePowerUp) {
    gameState.powerUpTimer -= delta;
    if (gameState.powerUpTimer <= 0) {
      if (gameState.activePowerUp === 'speed') {
        gameState.speed = gameState.baseSpeed;
      }
      gameState.activePowerUp = null;
      gameState.powerUpTimer = 0;
    }
  }
}

export function updateStumble(delta: number): void {
  if (gameState.isStumbling) {
    gameState.stumbleTimer -= delta;
    if (gameState.stumbleTimer <= 0) {
      gameState.isStumbling = false;
    }
  }
}

export function updateFall(delta: number): void {
  if (gameState.isFalling) {
    gameState.fallTimer -= delta;
    if (gameState.fallTimer <= 0) {
      gameOver();
    }
  }
}
