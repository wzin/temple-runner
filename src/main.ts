import { initScene, scene, renderer } from './scene';
import { initCamera, camera, updateCamera, setCameraPosition } from './camera';
import { initPlayer, getPlayer, updatePlayer, resetPlayer } from './player';
import { initInput, clearFrameInput, wasJustPressed } from './input';
import { gameState, resetGame, updatePowerUps as updateGamePowerUps, updateStumble, updateFall } from './gameState';
import { initPathGenerator, updatePathGenerator, resetPathGenerator } from './path/PathGenerator';
import { initObstacleManager, updateObstacles, resetObstacles } from './obstacles/ObstacleManager';
import { initCoins, updateCoins, resetCoins } from './collectibles/Coin';
import { initPowerUps, updatePowerUps, resetPowerUps } from './powerups/PowerUp';
import { initMonkeys, updateMonkeys, resetMonkeys } from './monkey';
import { updateScore } from './score';
import { initAudio, playSound } from './audio';
import { initMainMenu, showMainMenu, hideMainMenu } from './ui/MainMenu';
import { initHUD, updateHUD, showHUD, hideHUD } from './ui/HUD';
import { initPauseMenu, showPauseMenu, hidePauseMenu } from './ui/PauseMenu';
import { initGameOver, showGameOver, hideGameOver } from './ui/GameOver';

let lastTime = 0;

function init(): void {
  // Initialize core systems
  initScene();
  initCamera();
  initInput();
  initAudio();

  // Initialize game objects
  initPlayer();
  initPathGenerator();
  initObstacleManager();
  initCoins();
  initPowerUps();
  initMonkeys();

  // Initialize UI
  initMainMenu(startGame);
  initHUD(pauseGame);
  initPauseMenu(resumeGame, restartGame, quitToMenu);
  initGameOver(restartGame, quitToMenu);

  // Set initial camera position
  const player = getPlayer();
  setCameraPosition(player.position, player.direction);

  // Show main menu
  showMainMenu();
  hideHUD();
  hidePauseMenu();
  hideGameOver();

  // Start game loop
  lastTime = performance.now();
  gameLoop(lastTime);
}

function gameLoop(currentTime: number): void {
  requestAnimationFrame(gameLoop);

  const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  // Handle pause toggle
  if (wasJustPressed('pause') && gameState.screen === 'playing') {
    pauseGame();
  } else if (wasJustPressed('pause') && gameState.screen === 'paused') {
    resumeGame();
  }

  // Update game state
  if (gameState.screen === 'playing') {
    update(delta);
  }

  // Always render
  render();

  // Clear frame-specific input
  clearFrameInput();
}

function update(delta: number): void {
  // Update player movement
  updatePlayer(delta);

  // Update game state timers
  updateGamePowerUps(delta);
  updateStumble(delta);
  updateFall(delta);

  // Update path generation
  updatePathGenerator();

  // Update obstacles
  updateObstacles(delta);

  // Update collectibles
  updateCoins(delta);
  updatePowerUps(delta);

  // Update monkeys
  updateMonkeys(delta);

  // Update score
  updateScore(delta);

  // Update camera
  const player = getPlayer();
  updateCamera(player.position, player.direction, delta);

  // Update HUD
  updateHUD();

  // Check for game over
  if (gameState.screen === 'gameover') {
    playSound('gameOver');
    hideHUD();
    showGameOver();
  }
}

function render(): void {
  renderer.render(scene, camera);
}

function startGame(): void {
  hideMainMenu();
  showHUD();
  hidePauseMenu();
  hideGameOver();

  resetGame();
  resetPlayer();
  resetPathGenerator();
  resetObstacles();
  resetCoins();
  resetPowerUps();
  resetMonkeys();

  const player = getPlayer();
  setCameraPosition(player.position, player.direction);
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

// Start the game when DOM is ready
document.addEventListener('DOMContentLoaded', init);
