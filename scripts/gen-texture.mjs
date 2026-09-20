#!/usr/bin/env node
// Asset generator on fal.ai (Flux dev) with post-processing.
//   node scripts/gen-texture.mjs <name> "<prompt>" [--kind pbr|sprite|image|panorama] [--size 1024] [--w W --h H]
//                               [--seed 7] [--model fal-ai/flux/dev] [--no-depth] [--no-seam]
// kinds:
//   pbr      → public/textures/<name>/{color,normal,roughness,ao}.jpg  seamless; normals from Marigold depth (fal) unless --no-depth
//   sprite   → public/sprites/<name>.png   RGBA, alpha from a black background (billboards: fire, icons, ferns, silhouettes)
//   image    → public/art/<name>.jpg       plain picture (menu background, og image)
//   panorama → public/art/<name>.jpg       equirectangular sky; lower half blended into the fog colour
// Key: FAL_KEY env var, or a fal key inside ./.api_keys (gitignored).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name, prompt, ...rest] = process.argv.slice(2);
if (!name || !prompt) { console.error('usage: gen-texture.mjs <name> "<prompt>" [--kind pbr|sprite|image|panorama] ...'); process.exit(1); }
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const flag = (k) => rest.includes(k);
const kind = opt('--kind', 'pbr');
const size = Number(opt('--size', 1024));
const W = Number(opt('--w', kind === 'panorama' ? 1536 : size));
const H = Number(opt('--h', kind === 'panorama' ? 768 : size));
const seed = Number(opt('--seed', 7));
const model = opt('--model', 'fal-ai/flux/dev');
const useDepth = kind === 'pbr' && !flag('--no-depth');
const seamless = kind === 'pbr' && !flag('--no-seam');

function key() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  if (existsSync('.api_keys')) {
    const t = readFileSync('.api_keys', 'utf8');
    const m = t.match(/^\s*(?:export\s+)?FAL_KEY\s*=\s*["']?([^"'\s]+)/m) || t.match(/([0-9a-f-]{36}:[0-9a-f]{32})/);
    if (m) return m[1];
  }
  throw new Error('no fal.ai key: set FAL_KEY or put it in .api_keys');
}
const KEY = key();

async function fal(endpoint, body) {
  const res = await fetch(`https://fal.run/${endpoint}`, { method: 'POST', headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}
const fetchBuf = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());

const suffix = {
  pbr: ', seamless tileable texture, top-down orthographic, flat even lighting, no shadows, no text, photorealistic material scan, 4k detail',
  sprite: ', centered on a pure black background, isolated object, no text, no watermark, game asset, high detail',
  image: ', cinematic lighting, high detail, no text, no watermark',
  panorama: ', equirectangular 360 degree panorama, seamless left-right edges, horizon exactly at the vertical center, no text',
}[kind];
console.log(`[fal] ${kind} ${model} ${W}x${H} seed ${seed}: ${name}`);
const gen = await fal(model, { prompt: prompt + suffix, image_size: { width: W, height: H }, num_inference_steps: 28, guidance_scale: 3.5, seed, num_images: 1, enable_safety_checker: false, output_format: 'png' });
const url = gen.images?.[0]?.url;
if (!url) throw new Error('no image: ' + JSON.stringify(gen).slice(0, 300));
const png = await fetchBuf(url);
console.log(`[fal] image ${(png.length / 1024).toFixed(0)} KB`);

let depthPng = null;
if (useDepth) {
  try {
    const d = await fal('fal-ai/imageutils/marigold-depth', { image_url: url });
    depthPng = await fetchBuf(d.image.url);
    console.log(`[fal] depth ${(depthPng.length / 1024).toFixed(0)} KB`);
  } catch (e) { console.warn('[fal] depth failed, falling back to luminance:', e.message); }
}

const outDir = kind === 'pbr' ? `public/textures/${name}` : kind === 'sprite' ? 'public/sprites' : 'public/art';
mkdirSync(outDir, { recursive: true });
const tmp = `/tmp/gen-${name}`; mkdirSync(tmp, { recursive: true });
writeFileSync(`${tmp}/raw.png`, png);
if (depthPng) writeFileSync(`${tmp}/depth.png`, depthPng);

const py = `
import sys, json, numpy as np
from PIL import Image, ImageFilter
kind, name, tmp, out, seamless = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] == '1'
src = Image.open(tmp + '/raw.png').convert('RGB')
W, H = src.size
a = np.asarray(src).astype(np.float32)

def make_seamless(img):
    h, w = img.shape[:2]
    off = np.roll(np.roll(img, w // 2, axis=1), h // 2, axis=0)
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.minimum(xx, w - xx) / (w / 2); dy = np.minimum(yy, h - yy) / (h / 2)
    edge = np.clip(np.minimum(dx, dy) * 4.0, 0, 1)
    edge = edge[..., None] if img.ndim == 3 else edge
    return img * edge + off * (1 - edge)

if kind == 'pbr':
    color = make_seamless(a) if seamless else a
    Image.fromarray(color.clip(0, 255).astype(np.uint8)).save(out + '/color.jpg', quality=88)
    try:
        d = Image.open(tmp + '/depth.png').convert('L').resize((W, H), Image.LANCZOS)
        h = np.asarray(d).astype(np.float32) / 255.0
        h = 1.0 - h if h.mean() > 0.5 else h   # Marigold: near = bright; we want raised = bright
        # Keep only local relief: subtract a wide blur so the whole tile does not tilt.
        base = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(48))).astype(np.float32) / 255.0
        h = np.clip((h - base) * 3.0 + 0.5, 0, 1)
        strength = 4.0
    except Exception as e:
        lum = Image.fromarray(color.clip(0, 255).astype(np.uint8)).convert('L').filter(ImageFilter.GaussianBlur(1.2))
        h = np.asarray(lum).astype(np.float32) / 255.0
        strength = 3.0
    if seamless: h = make_seamless(h)
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * strength * (W / 1024)
    gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength * (H / 1024)
    n = np.stack([-gx, -gy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(out + '/normal.jpg', quality=88)
    # AO: how much lower a pixel is than its blurred surroundings.
    blur = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255.0
    ao = np.clip(1.0 - (blur - h) * 2.5, 0.35, 1.0)
    Image.fromarray((ao * 255).astype(np.uint8)).convert('RGB').save(out + '/ao.jpg', quality=85)
    detail = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)).astype(np.float32) / 255.0
    rough = np.clip(0.55 + 0.45 * (1.0 - detail * 3.0), 0.3, 1.0)
    Image.fromarray((rough * 255).astype(np.uint8)).convert('RGB').save(out + '/roughness.jpg', quality=85)
    print('[post] pbr set written to', out)
elif kind == 'sprite':
    # Alpha from brightness against the black background, colour un-darkened at the edges.
    lum = a.max(axis=2) / 255.0
    alpha = np.clip((lum - 0.06) / 0.5, 0, 1)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255.0
    rgb = np.where(alpha[..., None] > 0.02, a / np.maximum(alpha[..., None], 0.35), a)
    rgba = np.concatenate([rgb.clip(0, 255), (alpha * 255)[..., None]], axis=-1).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(out + '/' + name + '.png', optimize=True)
    print('[post] sprite written to', out + '/' + name + '.png')
elif kind == 'panorama':
    fog = np.array(json.loads(sys.argv[6]), dtype=np.float32)
    yy = np.mgrid[0:H, 0:W][0] / H
    t = np.clip((yy - 0.42) / 0.10, 0, 1)[..., None]      # blend to fog just above the horizon and below it
    img = a * (1 - t) + fog * t
    # wrap the left/right seam
    off = np.roll(img, W // 2, axis=1); xx = np.mgrid[0:H, 0:W][1]; ex = np.clip(np.minimum(xx, W - xx) / (W / 2) * 6.0, 0, 1)[..., None]
    img = img * ex + off * (1 - ex)
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(out + '/' + name + '.jpg', quality=90)
    print('[post] panorama written to', out + '/' + name + '.jpg')
else:
    src.save(out + '/' + name + '.jpg', quality=88)
    print('[post] image written to', out + '/' + name + '.jpg')
`;
execFileSync('python3', ['-c', py, kind, name, tmp, outDir, seamless ? '1' : '0', JSON.stringify([0x8a, 0x78, 0x98])], { stdio: 'inherit' });
