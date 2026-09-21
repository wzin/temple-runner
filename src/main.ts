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
import { currentSkinId, setSkin } from './view/playerView';
import { creditRun, flushRuns } from './ui/account';
import { traitsOf } from './core/economy';
import { startMusic, setMusicIntensity } from './audio';
import { loadImage, onLoadProgress, progress } from './view/loading';
import { initScoresScreen } from './ui/ScoresScreen';
import { initFloorView, updateFloorView } from './view/floorView';
import { initGround, updateGround } from './view/groundView';
import { initCliffs, updateCliffs } from './view/cliffView';
import { initTorches, updateTorches } from './view/torchView';
import { initDecals, updateDecals } from './view/decalView';
import { initProps, updateProps } from './view/propView';
import { initRuins, updateRuins } from './view/ruinsView';
import { tickFlames } from './view/flameMaterial';
import { initSky, updateSky } from './view/skyView';
import { initModels, updateModels } from './view/modelView';
import { activeBiome } from './view/biome';
import { loadRealTextures, releaseAssets } from './view/textures';
import { endFrame, initDomInput, onTurn, pollInput, setTouchControlsVisible, wasBoostPressed, wasPausePressed } from './ui/domInput';
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
  initModels(scene);
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
    if (e.repeat || isEnteringName() || e.target instanceof HTMLInputElement || !document.getElementById('account-modal')?.classList.contains('hidden') || !document.getElementById('scores-screen')?.classList.contains('hidden')) return;
    if ((e.code === 'Space' || e.code === 'Enter') && (gameState.screen === 'gameover' || gameState.screen === 'menu')) {
      e.preventDefault();
      startGame();
    }
  });

  initMainMenu(startGame, (id) => setSkin(id), currentSkinId());
  window.addEventListener('pointerdown', () => { setMusicIntensity(gameState.screen === 'playing' ? 1 : 0.35); startMusic(); }, { once: true });
  initScoresScreen();
  void flushRuns().catch(() => undefined);
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
  // Stage 1: the boot overlay stays until the lobby's own assets are in (backdrop + previewed character).
  void loadImage('/art/menu-bg.webp');
  const boot = document.getElementById('boot'); const bootFill = document.getElementById('boot-fill');
  const bootTimeout = setTimeout(() => boot?.classList.add('hidden'), 10_000);
  // Stage 2: the PLAY button is the progress bar for everything a run needs.
  const play = document.getElementById('play-btn') as HTMLButtonElement | null;
  onLoadProgress(() => {
    const lobby = progress('lobby');
    if (bootFill) bootFill.style.width = `${Math.round(lobby.fraction * 100)}%`;
    if (lobby.complete && boot && !boot.classList.contains('hidden')) { boot.classList.add('hidden'); clearTimeout(bootTimeout); }
    const g = progress('game');
    const pct = Math.round(g.fraction * 100);
    if (play) {
      play.disabled = !g.complete;
      play.classList.toggle('loading', !g.complete);
      play.style.setProperty('--p', `${pct}%`);
      play.textContent = g.complete ? 'PLAY' : `LOADING ${pct}%`;
    }
  });
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (wasBoostPressed() && gameState.screen === 'playing') game.pressBoost();   // the 'powerup' event follows on the next tick
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
      case 'energyFull': playSound('powerup'); flashUntil = performance.now() + 2500; break;
      case 'ruby': playSound('powerup'); rubyFlashUntil = performance.now() + 2200; powerUpBurst(game, [1, 0.2, 0.35]); break;
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
let flashUntil = 0; let rubyFlashUntil = 0;
function updateHint(now: number): void {
  const el = document.getElementById('hint');
  if (!el) return;
  const touch = isTouch();
  let text = '';
  const w = game.track.turnWindowAt(game.player.s);
  const corner = game.track.turnWindows().find((tw) => !tw.segment.turnDone && tw.corner > game.player.s && tw.corner - game.player.s < 30);
  if (now < rubyFlashUntil) {
    text = '◆ RUBY FOUND! +1 AT THE END OF THE RUN';
  } else if (now < flashUntil) {
    text = touch ? 'BOOST READY · TAP THE BAR OR ⚡' : 'BOOST READY · PRESS E';
  } else if (!turnedOnce && (w || corner)) {
    text = touch ? 'SWIPE ◄ ► TO TURN' : 'PRESS ← → TO TURN';
  } else if (now < hintUntil) {
    text = touch ? 'SWIPE ANYWHERE: ◄ ► TURN · ▲ JUMP · ▼ SLIDE' : '← → TURN · ↑ JUMP · ↓ SLIDE';
  }
  if (text) { if (el.textContent !== text) el.textContent = text; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
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
  gameState.energy = game.energy;
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
  updateModels(game);
  updatePlayerView(game, now);
  updateCoinView(game, now);
  updateObstacleView(game, now, camera);
  updatePowerUpView(game, now, camera);
  updateMonkeyView(game, now);
}

function startGame(): void {
  if (!progress('game').complete) return;   // every texture and model must be in before a run starts
  hideMainMenu();
  hidePauseMenu();
  hideGameOver();
  showHUD();

  resetTrackView();
  hideHighScoreBanner();
  beatHighScore = false;
  game.reset(Date.now() >>> 0);
  game.setTraits(traitsOf(currentSkinId()));
  startMusic(); setMusicIntensity(1);
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
  setMusicIntensity(0.35);
  void creditRun(game.coins, Math.floor(game.distance), game.rubiesFound).catch(() => undefined);   // rubies: 1 per 10 000 coins across runs
  showGameOver({ score: game.score, coins: game.coins, distance: Math.floor(game.distance) });
}

function pauseGame(): void {
  if (gameState.screen !== 'playing') return;
  gameState.screen = 'paused';
  setMusicIntensity(0.25);
  setTouchControlsVisible(false);
  showPauseMenu();
  playSound('click');
}

/** Resume goes through a 3-2-1 countdown so the player can re-read the situation. */
function resumeGame(): void {
  setMusicIntensity(1);
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
  setMusicIntensity(0.35);
  hidePauseMenu();
  hideCountdown();
  hideGameOver();
  hideHUD();
  showMainMenu(gameState.highScore);
  gameState.screen = 'menu';
  setTouchControlsVisible(false);
}

document.addEventListener('DOMContentLoaded', init);
