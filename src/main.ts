import { Game, GameEvent } from './core/game';
import { gameState } from './gameState';
import { initAudio, playSound } from './audio';
import { initScene, scene, renderer } from './view/scene';
import { camera, cameraHit, cameraLand, cameraTurn, initCamera, snapCamera, updateCamera } from './view/camera';
import { initTrackView, resetTrackView, updateTrackView } from './view/trackView';
import { initPlayerView, playerLanded, updatePlayerView } from './view/playerView';
import { initCoinView, updateCoinView } from './view/coinView';
import { initObstacleView, updateObstacleView } from './view/obstacleView';
import { initPowerUpView, updatePowerUpView } from './view/powerUpView';
import { initMonkeyView, updateMonkeyView } from './view/monkeyView';
import { coinBurst, initParticles, updateParticles } from './view/particles';
import { initFloorView, updateFloorView } from './view/floorView';
import { initSky, updateSky } from './view/skyView';
import { initTrees, updateTrees } from './view/treeView';
import { activeBiome } from './view/biome';
import { endFrame, initDomInput, onTurn, pollInput, wasPausePressed } from './ui/domInput';
import { initMainMenu, showMainMenu, hideMainMenu } from './ui/MainMenu';
import { initHUD, updateHUD, showHUD, hideHUD } from './ui/HUD';
import { initPauseMenu, showPauseMenu, hidePauseMenu } from './ui/PauseMenu';
import { initGameOver, isEnteringName, showGameOver, hideGameOver } from './ui/GameOver';

const HIGH_SCORE_KEY = 'temple-runner.highScore';

const game = new Game(Date.now() >>> 0);
let lastTime = 0;

// Exposed for automated play-testing (headless browser drives the run through these handles).
declare global { interface Window { __game: Game; __scene: typeof scene } }
window.__game = game;

function loadHighScore(): number {
  try { return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0; } catch { return 0; }
}
function saveHighScore(value: number): void {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(value)); } catch { /* private mode etc. */ }
}

function init(): void {
  initScene();
  window.__scene = scene;
  initCamera();
  initDomInput();
  initAudio();

  initSky(scene, activeBiome());
  initTrees(scene, activeBiome());
  initFloorView(scene);
  initTrackView(scene);
  initPlayerView(scene);
  initCoinView(scene);
  initObstacleView(scene);
  initPowerUpView(scene);
  initMonkeyView(scene);
  initParticles(scene);

  onTurn((dir, nowMs) => {
    if (gameState.screen === 'playing') game.pressTurn(dir, nowMs);
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || isEnteringName()) return;
    if ((e.code === 'Space' || e.code === 'Enter') && (gameState.screen === 'gameover' || gameState.screen === 'menu')) {
      e.preventDefault();
      startGame();
    }
  });

  initMainMenu(startGame);
  initHUD(pauseGame);
  initPauseMenu(resumeGame, restartGame, quitToMenu);
  initGameOver(restartGame, quitToMenu);

  gameState.highScore = loadHighScore();
  syncViews(0);
  snapCamera(game);
  showMainMenu(gameState.highScore);
  hideHUD();
  hidePauseMenu();
  hideGameOver();

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (wasPausePressed()) {
    if (gameState.screen === 'playing') pauseGame();
    else if (gameState.screen === 'paused') resumeGame();
  }

  if (gameState.screen === 'playing') {
    const events = game.tick(dt, pollInput(), now);
    handleEvents(events);
    syncState();
    syncViews(now);
    updateParticles(game, dt);
    updateCamera(game, dt);
    updateHUD();
    if (game.over) endRun();
  } else if (gameState.screen === 'menu') {
    syncViews(now);
  }

  updateSky(camera);
  renderer.render(scene, camera);
  endFrame();
}

function handleEvents(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'coin': playSound('coin'); coinBurst(game); break;
      case 'jump': playSound('jump'); break;
      case 'slide': playSound('slide'); break;
      case 'land': playSound('land'); playerLanded(); cameraLand(); break;
      case 'hit': playSound('stumble'); cameraHit(); break;
      case 'shielded': playSound('powerup'); cameraHit(); break;
      case 'fall': playSound('stumble'); cameraHit(); break;
      case 'dead': playSound('gameOver'); break;
      case 'turn': cameraTurn(e.dir); break;
      case 'powerup': playSound('powerup'); break;
      case 'powerupEnd': break;
    }
  }
}

function syncState(): void {
  gameState.score = game.score;
  gameState.coins = game.coins;
  gameState.proximityBar = game.proximity;
  gameState.activePowerUp = game.active?.kind ?? (game.shield ? 'shield' : null);
  gameState.powerUpTimer = game.active?.timer ?? 0;
}

function syncViews(now: number): void {
  updateTrackView(game);
  updateFloorView(game);
  updateTrees(game);
  updatePlayerView(game, now);
  updateCoinView(game, now);
  updateObstacleView(game, now);
  updatePowerUpView(game, now);
  updateMonkeyView(game, now);
}

function startGame(): void {
  hideMainMenu();
  hidePauseMenu();
  hideGameOver();
  showHUD();

  resetTrackView();
  game.reset(Date.now() >>> 0);
  gameState.screen = 'playing';
  syncState();
  syncViews(performance.now());
  snapCamera(game);
  lastTime = performance.now();
}

function endRun(): void {
  gameState.screen = 'gameover';
  if (game.score > gameState.highScore) {
    gameState.highScore = game.score;
    saveHighScore(gameState.highScore);
  }
  hideHUD();
  showGameOver({ score: game.score, coins: game.coins, distance: Math.floor(game.distance) });
}

function pauseGame(): void {
  if (gameState.screen !== 'playing') return;
  gameState.screen = 'paused';
  showPauseMenu();
  playSound('click');
}

function resumeGame(): void {
  if (gameState.screen !== 'paused') return;
  gameState.screen = 'playing';
  hidePauseMenu();
  lastTime = performance.now();
}

function restartGame(): void {
  hidePauseMenu();
  hideGameOver();
  startGame();
}

function quitToMenu(): void {
  hidePauseMenu();
  hideGameOver();
  hideHUD();
  showMainMenu(gameState.highScore);
  gameState.screen = 'menu';
}

document.addEventListener('DOMContentLoaded', init);
