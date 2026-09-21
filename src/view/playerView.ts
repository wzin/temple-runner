import * as THREE from 'three';
import type { Game } from '../core/game';
import { yawOf } from './util';
import { SKINS, normalizeSkinId } from '../core/economy';
import { loadGLB } from './loading';

/**
 * The runner is a rigged, animated GLB (Quaternius "Ultimate Modular" characters, CC0) driven by
 * an AnimationMixer: Run (loop, speed-matched to the player), Roll for the slide, HitRecieve for a
 * stumble, Death for the fall and Idle while waiting. The characters ship without a jump clip, so
 * the jump is Man_Jump from Quaternius' Animated Men pack retargeted by bone name (both packs share
 * the same CharacterArmature bone naming for the body; hands and root differ and are dropped).
 * Skins are different character files; only the selected one is downloaded.
 */

const SKIN_KEY = 'temple-runner.skin';
export function currentSkinId(): string { try { return normalizeSkinId(localStorage.getItem(SKIN_KEY)); } catch { return SKINS[0].id; } }

const HEIGHT = 2.1;         // metres; above the 1.8 m collision box so the runner does not look tiny on the 6 m path
const STRIDE = 7.5;         // metres per run cycle at which the Run clip plays at 1x (~2 cycles/s at base speed)
const FADE = 0.12;

type ClipName = 'Idle' | 'Run' | 'Roll' | 'HitRecieve' | 'Death' | 'Jump';

let group: THREE.Group;
let rig: THREE.Group;
let model: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
let actions: Partial<Record<ClipName, THREE.AnimationAction>> = {};
let current: ClipName | null = null;
let clipDuration: Partial<Record<ClipName, number>> = {};
let bodyMaterials: THREE.MeshStandardMaterial[] = [];
let shieldMesh: THREE.Mesh;
let shadowBlob: THREE.Mesh;
let boostAura: THREE.Mesh;
let lamp: THREE.PointLight;
let squash = 0;
let lastMs = 0;
let loadedSkin = '';
let jumpClip: THREE.AnimationClip | null = null;
let pendingJumpFor: THREE.Group | null = null;

export function playerLanded(): void { squash = 1; }

export function initPlayerView(scene: THREE.Scene): void {
  group = new THREE.Group();
  group.rotation.order = 'YXZ';
  rig = new THREE.Group();
  group.add(rig);

  // Contact shadow under the feet: the cheapest way to make the runner read against the floor.
  const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sg = sc.getContext('2d')!;
  const grad = sg.createRadialGradient(32, 32, 2, 32, 32, 32); grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64);
  shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadowBlob.position.y = 0.03; shadowBlob.renderOrder = 1;
  group.add(shadowBlob);
  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0x5fd8ff, emissive: 0x3ab8ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.22, depthWrite: false }));
  shieldMesh.position.y = 1.0; shieldMesh.visible = false;
  group.add(shieldMesh);
  boostAura = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  boostAura.position.y = 1.0; boostAura.visible = false;
  group.add(boostAura);
  // Warm lamp travelling with the runner so the PBR relief reads up close.
  lamp = new THREE.PointLight(0xffc48a, 7, 11, 2);
  lamp.position.set(0, 2.6, -1.5);
  group.add(lamp);
  scene.add(group);

  loadGLB('/models/chars/jump-clip.glb').then((g) => {
    jumpClip = g.animations.find((c) => c.name === 'Man_Jump') ?? g.animations[0] ?? null;
    if (jumpClip && pendingJumpFor && pendingJumpFor === model) attachJump();
  }).catch(() => { /* no jump clip: the run pose is held in the air */ });
  setSkin(currentSkinId());
}

/** Retarget the borrowed jump clip onto the current model: keep tracks whose bone exists, drop root motion. */
function attachJump(): void {
  if (!jumpClip || !model || !mixer) return;
  const names = new Set<string>();
  model.traverse((o) => names.add(o.name));
  const tracks = jumpClip.tracks.filter((t) => {
    const dot = t.name.lastIndexOf('.');
    const node = t.name.slice(0, dot); const prop = t.name.slice(dot + 1);
    // Rotations only: the two rigs share bone names but not bone lengths, so position/scale tracks would distort the body.
    return names.has(node) && prop === 'quaternion';
  });
  if (tracks.length < 8) return;
  const clip = new THREE.AnimationClip('Jump', jumpClip.duration, tracks.map((t) => t.clone()));
  const a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
  actions.Jump = a; clipDuration.Jump = clip.duration;
  pendingJumpFor = null;
}

/** Load the chosen character; safe to call any time (also from the menu). */
export function setSkin(id: string): void {
  const skin = SKINS.find((sk) => sk.id === normalizeSkinId(id)) ?? SKINS[0];
  try { localStorage.setItem(SKIN_KEY, skin.id); } catch { /* ignore */ }
  if (loadedSkin === skin.id) return;
  loadedSkin = skin.id;
  loadGLB(`/models/chars/${skin.file}.glb`).then((gltf) => {
    if (loadedSkin !== skin.id) return; // a later choice won
    if (model) { rig.remove(model); mixer?.stopAllAction(); }
    model = gltf.scene;
    // Normalise: feet on the ground, HEIGHT metres tall, facing +z (the heading).
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const k = HEIGHT / Math.max(0.01, size.y);
    model.scale.setScalar(k);
    model.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
    bodyMaterials = [];
    model.traverse((o) => {
      if (o.name === 'Sword') { o.visible = false; return; }
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled = false; o.castShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m instanceof THREE.MeshStandardMaterial) {
        m.transparent = true; m.roughness = Math.max(0.6, m.roughness);
        // Lift the palette a little so the runner separates from the sand-coloured slabs.
        m.color.multiplyScalar(1.18); m.emissive.set(0x1a1612); m.emissiveIntensity = 1;
        bodyMaterials.push(m);
      }
    });
    rig.add(model);
    mixer = new THREE.AnimationMixer(model);
    actions = {}; clipDuration = {}; current = null;
    for (const clip of gltf.animations) {
      const name = clip.name.replace(/^.*\|/, '') as ClipName;
      const a = mixer.clipAction(clip);
      if (name === 'Roll' || name === 'HitRecieve' || name === 'Death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[name] = a; clipDuration[name] = clip.duration;
    }
    pendingJumpFor = model;
    if (jumpClip) attachJump();
    play('Idle', 0);
  }).catch(() => { loadedSkin = ''; });
}

function play(name: ClipName, fade = FADE, timeScale = 1): void {
  const next = actions[name];
  if (!next || !mixer) return;
  if (current === name) { next.timeScale = timeScale; return; }
  const prev = current ? actions[current] : undefined;
  next.reset(); next.timeScale = timeScale; next.enabled = true; next.setEffectiveWeight(1);
  if (prev && prev !== next) { next.play(); prev.crossFadeTo(next, fade, false); } else next.fadeIn(fade).play();
  current = name;
}

export function updatePlayerView(game: Game, timeMs: number): void {
  const dt = lastMs ? Math.min(0.1, (timeMs - lastMs) / 1000) : 0.016;
  lastMs = timeMs;
  const p = game.player;

  if (p.down && game.fallPose) {
    // Fall: the character drops where the miss was staged and plays its death animation.
    const elapsed = p.cfg.fallDuration - Math.max(0, p.fallTimer);
    const run = Math.min(p.cfg.speed * elapsed * 0.6, 2.5);
    const fp = game.fallPose;
    group.position.set(fp.x + fp.dir.x * run, Math.max(p.y, -6), fp.z + fp.dir.z * run);
    group.rotation.set(0, yawOf(fp.dir), 0);
    rig.rotation.x = -Math.min(1, elapsed * 1.5) * 0.4;
    play('Death', 0.1, 1.3);
    mixer?.update(dt);
    return;
  }

  const lift = game.boosting ? 1.2 : 0;
  const w = game.track.sample(p.s, p.x, p.y + lift);
  const miss = game.missedCorner;
  if (miss) {
    // Did not turn: keep running straight over the corner square towards the wall/void until the fall.
    const right = { x: -miss.dir.z, z: miss.dir.x };
    group.position.set(miss.x + miss.dir.x * miss.past + right.x * p.x, p.y + lift, miss.z + miss.dir.z * miss.past + right.z * p.x);
  } else group.position.set(w.x, w.y, w.z);
  // The shadow stays on the slabs while the runner is in the air, fading with height.
  shadowBlob.position.y = 0.03 - (p.y + lift); shadowBlob.scale.setScalar(Math.max(0.5, 1 - (p.y + lift) * 0.25)); (shadowBlob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 1 - (p.y + lift) * 0.3);
  const speedRatio = p.speed / p.cfg.speed;
  const lean = 0.06 + (speedRatio - 1) * 0.1;
  group.rotation.set(-lean, yawOf(miss ? miss.dir : w.dir), p.stumbleTimer > 0 ? Math.sin(timeMs * 0.03) * 0.15 : 0);

  squash *= Math.exp(-0.012 * 16.7);
  const sliding = p.state === 'sliding';
  const jumping = p.state === 'jumping';
  rig.scale.set(1 + 0.12 * squash, 1 - 0.18 * squash, 1 + 0.12 * squash);
  rig.rotation.x = 0;

  if (p.speed < 0.5) {
    play('Idle', 0.3);
  } else if (sliding) {
    // Roll clip compressed to the slide duration.
    play('Roll', 0.06, (clipDuration.Roll ?? 1) / p.cfg.slideDuration);
  } else if (jumping) {
    if (actions.Jump) play('Jump', 0.08, (clipDuration.Jump ?? 1) / 0.85);
    else { play('Run', 0.1, 0); }                    // no clip: hold the running pose in the air
  } else if (p.stumbleTimer > 0 && actions.HitRecieve) {
    play('HitRecieve', 0.06, (clipDuration.HitRecieve ?? 1) / p.cfg.stumbleDuration);
  } else {
    play('Run', FADE, (p.speed / STRIDE) * (clipDuration.Run ?? 1));
  }
  mixer?.update(dt);

  shieldMesh.visible = game.shield;
  shieldMesh.rotation.y = timeMs * 0.001;
  // Invulnerable (boost or its grace): ghostly runner with a pulsing aura.
  const ghost = game.invulnerable;
  const blinkOff = game.boostEnding && Math.floor(timeMs / 120) % 2 === 0;   // the boost is about to wear off
  const opacity = ghost ? (blinkOff ? 0.95 : 0.45 + Math.sin(timeMs * 0.02) * 0.1) : 1;
  for (const m of bodyMaterials) m.opacity = opacity;
  boostAura.visible = ghost && !blinkOff;
  boostAura.scale.setScalar(1 + Math.sin(timeMs * 0.012) * 0.08);
  lamp.intensity = 6.5 + Math.sin(timeMs * 0.02) * 0.8;
}
