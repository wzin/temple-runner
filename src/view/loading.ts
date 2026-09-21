import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { onAssetProgress } from './textures';

/**
 * Two-stage asset loading.
 *  - "lobby": what the first screen needs (menu backdrop, the previewed character). A boot overlay covers the page
 *    until these are in.
 *  - "game": every texture set, sprite and model the run needs. The PLAY button fills up with this progress and only
 *    becomes active when everything has arrived, so a run never starts with placeholder art.
 * Textures report through textures.ts' queue; GLBs go through `loadGLB`, which counts them.
 */
type Stage = 'lobby' | 'game';
interface Counter { pending: number; done: number }
const counters: Record<Stage, Counter> = { lobby: { pending: 0, done: 0 }, game: { pending: 0, done: 0 } };
let texDone = 0; let texTotal = 0;
const listeners: (() => void)[] = [];
const loader = new GLTFLoader();

onAssetProgress((d, total) => { texDone = d; texTotal = total; notify(); });
function notify(): void { for (const cb of listeners) cb(); }
export function onLoadProgress(cb: () => void): void { listeners.push(cb); cb(); }

export function track<T>(stage: Stage, p: Promise<T>): Promise<T> {
  counters[stage].pending++; notify();
  const settle = () => { counters[stage].pending--; counters[stage].done++; notify(); };
  p.then(settle, settle);
  return p;
}

/** Load a GLB and count it towards a stage (game by default). */
export function loadGLB(url: string, stage: Stage = 'game'): Promise<GLTF> {
  return track(stage, new Promise<GLTF>((resolve, reject) => loader.load(url, resolve, undefined, reject)));
}

/** Preload an image (the menu backdrop) as a lobby asset. */
export function loadImage(url: string, stage: Stage = 'lobby'): Promise<void> {
  return track(stage, new Promise<void>((resolve) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => resolve(); img.src = url; }));
}

export function progress(stage: Stage): { done: number; total: number; fraction: number; complete: boolean } {
  const c = counters[stage];
  const done = c.done + (stage === 'game' ? texDone : 0);
  const total = c.done + c.pending + (stage === 'game' ? texTotal : 0);
  const complete = c.pending === 0 && (stage !== 'game' || texDone >= texTotal) && total > 0;
  return { done, total, fraction: total ? done / total : 0, complete };
}
