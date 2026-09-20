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
import { coinBurst, hitSparks, initParticles, landingDust, powerUpBurst, updateParticles } from './view/particles';
import { initClouds, updateClouds } from './view/cloudView';
import { SKINS, currentSkinId, setSkin } from './view/playerView';
import { initFloorView, updateFloorView } from './view/floorView';
import { initGround, updateGround } from './view/groundView';
import { initCliffs, updateCliffs } from './view/cliffView';
import { initTorches, updateTorches } from './view/torchView';
import { initDecals, updateDecals } from './view/decalView';
import { initProps, updateProps } from './view/propView';
import { initRuins, updateRuins } from './view/ruinsView';
import { tickFlames } from './view/flameMaterial';
import { initSky, updateSky } from './view/skyView';
import { initTrees, updateTrees } from './view/treeView';
import { activeBiome } from './view/biome';
import { loadRealTextures, onAssetProgress, releaseAssets } from './view/textures';
import { endFrame, initDomInput, onTurn, pollInput, setTouchControlsVisible, wasPausePressed } from './ui/domInput';
import { initMainMenu, showMainMenu, hideMainMenu } from './ui/MainMenu';
import { initHUD, updateHUD, showHUD, hideHUD, showHighScoreBanner, hideHighScoreBanner } from './ui/HUD';
import { initPauseMenu, showPauseMenu, hidePauseMenu } from './ui/PauseMenu';
import { initGameOver, isEnteringName, showGameOver, hideGameOver } from './ui/GameOver';

const HIGH_SCORE_KEY = 'temple-runner.highScore';

const game = new Game(Date.now() >>> 0);
let lastTime = 0;
let beatHighScore = false;     // banner shown once per run
let countdownEnd = 0;          // performance.now() when a resume countdown finishes
let hintUntil = 0;             // performance.now() until which the start hint stays
let turnedOnce = false;        // first successful turn hides the corner coach mark
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
  initDecals(scene);
  initProps(scene);
  initRuins(scene);
  initClouds(scene);
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
  initSkinPicker();
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
  // Everything that is not the immediate world starts loading after the first frame, a few files at a time.
  requestAnimationFrame(() => releaseAssets());
  const loading = document.getElementById('loading'); const count = document.getElementById('loading-count'); const fill = document.getElementById('loading-fill');
  onAssetProgress((d, total) => {
    if (!loading) return;
    const finishedAll = d >= total;
    loading.classList.toggle('hidden', finishedAll);
    if (count) count.textContent = `${d}/${total}`;
    if (fill) fill.style.width = `${total ? Math.round((d / total) * 100) : 100}%`;
  });
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (wasPausePressed()) {
    if (gameState.screen === 'playing') pauseGame();
    else if (gameState.screen === 'paused') resumeGame();
    else if (gameState.screen === 'countdown') { gameState.screen = 'paused'; hideCountdown(); setTouchControlsVisible(false); showPauseMenu(); }
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
    updateHint(now);
    if (game.over) endRun();
  } else if (gameState.screen === 'menu') {
    syncViews(now);
  }

  updateFog(game.lookahead);
  tickFlames(now / 1000);
  updateSky(camera);
  updateGround(camera);
  updateRuins(camera);
  updateClouds(camera, now);
  renderer.render(scene, camera);
  endFrame();
}

function handleEvents(events: GameEvent[]): void {
  for (const e of events) {
    if (e.type === 'turn') turnedOnce = true;
    switch (e.type) {
      case 'coin': playSound('coin'); coinBurst(game); break;
      case 'jump': playSound('jump'); break;
      case 'slide': playSound('slide'); break;
      case 'land': playSound('land'); playerLanded(); cameraLand(); landingDust(game); break;
      case 'hit': playSound('stumble'); cameraHit(); hitSparks(game); break;
      case 'shielded': playSound('powerup'); cameraHit(); break;
      case 'fall': playSound('stumble'); cameraHit(); break;
      case 'dead': playSound('gameOver'); break;
      case 'turn': cameraTurn(e.dir); break;
      case 'powerup': playSound('powerup'); powerUpBurst(game, e.kind === 'magnet' ? [0.3, 0.5, 1] : e.kind === 'shield' ? [0.4, 0.9, 1] : [1, 0.6, 0.2]); break;
      case 'powerupEnd': break;
    }
  }
}

const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

/** Start-of-run controls reminder, then a corner coach mark until the first turn is taken. */
function updateHint(now: number): void {
  const el = document.getElementById('hint');
  if (!el) return;
  const touch = isTouch();
  let text = '';
  const w = game.track.turnWindowAt(game.player.s);
  const corner = game.track.turnWindows().find((tw) => !tw.segment.turnDone && tw.corner > game.player.s && tw.corner - game.player.s < 30);
  if (!turnedOnce && (w || corner)) {
    text = touch ? 'TAP ◄ ► OR SWIPE TO TURN' : 'PRESS ← → TO TURN';
  } else if (now < hintUntil) {
    text = touch ? 'SWIPE ◄ ► TURN · ▲ JUMP · ▼ SLIDE' : '← → TURN · ↑ JUMP · ↓ SLIDE';
  }
  if (text) { if (el.textContent !== text) el.textContent = text; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

/** Skin buttons on the main menu. */
function initSkinPicker(): void {
  const box = document.getElementById('skin-picker');
  if (!box) return;
  const render = () => {
    box.innerHTML = '';
    for (const sk of SKINS) {
      const b = document.createElement('button');
      b.className = 'skin-btn' + (sk.id === currentSkinId() ? ' active' : '');
      b.textContent = sk.name;
      b.addEventListener('click', () => { setSkin(sk.id); playSound('click'); render(); });
      box.appendChild(b);
    }
  };
  render();
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
  updateDecals(game, now);
  updateProps(game, camera);
  updateTrees(game);
  updatePlayerView(game, now);
  updateCoinView(game, now);
  updateObstacleView(game, now);
  updatePowerUpView(game, now, camera);
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
  setTouchControlsVisible(true);
  hintUntil = performance.now() + 4500;
  turnedOnce = false;
  syncState();
  syncViews(performance.now());
  snapCamera(game);
  lastTime = performance.now();
}

function endRun(): void {
  gameState.screen = 'gameover';
  setTouchControlsVisible(false);
  document.getElementById('hint')?.classList.add('hidden');
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
  setTouchControlsVisible(false);
  showPauseMenu();
  playSound('click');
}

/** Resume goes through a 3-2-1 countdown so the player can re-read the situation. */
function resumeGame(): void {
  if (gameState.screen !== 'paused') return;
  hidePauseMenu();
  setTouchControlsVisible(true);
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
  setTouchControlsVisible(false);
}

document.addEventListener('DOMContentLoaded', init);
