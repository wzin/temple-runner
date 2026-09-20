import { Game, GameEvent } from './core/game';
import { gameState } from './gameState';
import { initAudio, playSound } from './audio';
import { initScene, scene, renderer } from './view/scene';
import { camera, initCamera, snapCamera, updateCamera } from './view/camera';
import { initTrackView, resetTrackView, updateTrackView } from './view/trackView';
import { initPlayerView, updatePlayerView } from './view/playerView';
import { initCoinView, updateCoinView } from './view/coinView';
import { initObstacleView, updateObstacleView } from './view/obstacleView';
import { endFrame, initDomInput, onTurn, pollInput, wasPausePressed } from './ui/domInput';
import { initMainMenu, showMainMenu, hideMainMenu } from './ui/MainMenu';
import { initHUD, updateHUD, showHUD, hideHUD } from './ui/HUD';
import { initPauseMenu, showPauseMenu, hidePauseMenu } from './ui/PauseMenu';
import { initGameOver, showGameOver, hideGameOver } from './ui/GameOver';

const game = new Game(Date.now() >>> 0);
let lastTime = 0;

// Exposed for automated play-testing (headless browser drives the run through this handle).
declare global { interface Window { __game: Game } }
window.__game = game;

function init(): void {
  initScene();
  initCamera();
  initDomInput();
  initAudio();

  initTrackView(scene);
  initPlayerView(scene);
  initCoinView(scene);
  initObstacleView(scene);

  onTurn((dir, nowMs) => {
    if (gameState.screen === 'playing') game.pressTurn(dir, nowMs);
  });

  initMainMenu(startGame);
  initHUD(pauseGame);
  initPauseMenu(resumeGame, restartGame, quitToMenu);
  initGameOver(restartGame, quitToMenu);

  syncViews(0);
  snapCamera(game);
  showMainMenu();
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
    updateCamera(game, dt);
    updateHUD();
    if (game.over) endRun();
  } else if (gameState.screen === 'menu') {
    syncViews(now);
  }

  renderer.render(scene, camera);
  endFrame();
}

function handleEvents(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'coin': playSound('coin'); break;
      case 'jump': playSound('jump'); break;
      case 'slide': playSound('slide'); break;
      case 'hit': playSound('stumble'); break;
      case 'fall': playSound('stumble'); break;
      case 'dead': playSound('gameOver'); break;
      case 'turn': break;
    }
  }
}

function syncState(): void {
  gameState.score = game.score;
  gameState.coins = game.coins;
  gameState.proximityBar = game.proximity;
}

function syncViews(now: number): void {
  updateTrackView(game);
  updatePlayerView(game, now);
  updateCoinView(game, now);
  updateObstacleView(game, now);
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
  if (game.score > gameState.highScore) gameState.highScore = game.score;
  hideHUD();
  showGameOver();
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
  showMainMenu();
  gameState.screen = 'menu';
}

document.addEventListener('DOMContentLoaded', init);
