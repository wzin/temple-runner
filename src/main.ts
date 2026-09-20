import { Game, GameEvent } from './core/game';
import { gameState } from './gameState';
import { initAudio, playSound } from './audio';
import { initScene, scene, renderer, updateFog } from './view/scene';
import { camera, cameraHit, cameraLand, cameraTurn, initCamera, snapCamera, updateCamera } from './view/camera';
import { initTrackView, resetTrackView, updateTrackView } from './view/trackView';
import { initPlayerView, playerLanded, updatePlayerView } from './view/playerView';
import { initCoinView, updateCoinView } from './view/coinView';
import { initObstacleView, updateObstacleView } from './view/obstacleView';
import { initPowerUpView, updatePowerUpView } from './view/powerUpView';
import { initMonkeyView, updateMonkeyView } from './view/monkeyView';
import { coinBurst, initParticles, updateParticles } from './view/particles';
import { initFloorView, updateFloorView } from './view/floorView';
import { initGround, updateGround } from './view/groundView';
import { initCliffs, updateCliffs } from './view/cliffView';
import { initTorches, updateTorches } from './view/torchView';
import { initSky, updateSky } from './view/skyView';
import { initTrees, updateTrees } from './view/treeView';
import { activeBiome } from './view/biome';
import { loadRealTextures } from './view/textures';
import { endFrame, initDomInput, onTurn, pollInput, wasPausePressed } from './ui/domInput';
import { initMainMenu, showMainMenu, hideMainMenu } from './ui/MainMenu';
import { initHUD, updateHUD, showHUD, hideHUD, showHighScoreBanner, hideHighScoreBanner } from './ui/HUD';
import { initPauseMenu, showPauseMenu, hidePauseMenu } from './ui/PauseMenu';
import { initGameOver, isEnteringName, showGameOver, hideGameOver } from './ui/GameOver';

const HIGH_SCORE_KEY = 'temple-runner.highScore';

const game = new Game(Date.now() >>> 0);
let lastTime = 0;
let beatHighScore = false;     // banner shown once per run
let countdownEnd = 0;          // performance.now() when a resume countdown finishes
const COUNTDOWN_MS = 3000;

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
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;
  initScene();
  window.__scene = scene;
  initCamera();
  initDomInput();
  initAudio();

  initSky(scene, activeBiome());
  initGround(scene);
  initCliffs(scene);
  initTrees(scene, activeBiome());
  initFloorView(scene);
  initTrackView(scene);
  initTorches(scene);
  loadRealTextures();   // upgrades the procedural maps in place once the JPEGs arrive
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
    else if (gameState.screen === 'countdown') { gameState.screen = 'paused'; hideCountdown(); showPauseMenu(); }
  }

  if (gameState.screen === 'countdown') {
    const left = countdownEnd - now;
    if (left <= 0) { hideCountdown(); gameState.screen = 'playing'; lastTime = now; }
    else setCountdownNumber(Math.ceil(left / 1000));
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

  updateFog(game.lookahead);
  updateSky(camera);
  updateGround(camera);
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
  if (!beatHighScore && gameState.highScore > 0 && game.score > gameState.highScore) {
    beatHighScore = true;
    showHighScoreBanner();
    playSound('powerup');
  }
  gameState.score = game.score;
  gameState.coins = game.coins;
  gameState.proximityBar = game.proximity;
  gameState.activePowerUp = game.active?.kind ?? (game.shield ? 'shield' : null);
  gameState.powerUpTimer = game.active?.timer ?? 0;
}

function syncViews(now: number): void {
  updateTrackView(game);
  updateFloorView(game);
  updateCliffs(game);
  updateTorches(game, now);
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
  hideHighScoreBanner();
  beatHighScore = false;
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

/** Resume goes through a 3-2-1 countdown so the player can re-read the situation. */
function resumeGame(): void {
  if (gameState.screen !== 'paused') return;
  hidePauseMenu();
  gameState.screen = 'countdown';
  countdownEnd = performance.now() + COUNTDOWN_MS;
  setCountdownNumber(3);
  document.getElementById('countdown')?.classList.remove('hidden');
  playSound('click');
}

function setCountdownNumber(n: number): void {
  const el = document.getElementById('countdown-number');
  if (el && el.textContent !== String(n)) el.textContent = String(n);
}

function hideCountdown(): void {
  document.getElementById('countdown')?.classList.add('hidden');
}

function restartGame(): void {
  hidePauseMenu();
  hideCountdown();
  hideGameOver();
  startGame();
}

function quitToMenu(): void {
  hidePauseMenu();
  hideCountdown();
  hideGameOver();
  hideHUD();
  showMainMenu(gameState.highScore);
  gameState.screen = 'menu';
}

document.addEventListener('DOMContentLoaded', init);
