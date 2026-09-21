/**
 * Pillarboxing on wide screens: the game is a corridor runner, so on a desktop monitor the wide 16:9 view mostly
 * shows forest far to the sides and costs frames for it. The play area is limited to MAX_ASPECT (width/height)
 * and centred, with dark bars left and right; phones (portrait) are unaffected. Every overlay lives inside
 * #game-container, so the UI follows the play area.
 */
const MAX_ASPECT = 0.9;

export function viewportSize(): { w: number; h: number } {
  const h = window.innerHeight;
  const w = Math.min(window.innerWidth, Math.round(h * MAX_ASPECT));
  return { w, h };
}

export function applyViewport(): { w: number; h: number } {
  const size = viewportSize();
  const c = document.getElementById('game-container');
  if (c) { c.style.width = `${size.w}px`; c.style.marginLeft = 'auto'; c.style.marginRight = 'auto'; }
  return size;
}
