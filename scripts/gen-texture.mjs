#!/usr/bin/env node
// Generate a seamless PBR texture set with fal.ai (Flux) and derive normal + roughness maps.
//   node scripts/gen-texture.mjs <name> "<prompt>" [--size 1024] [--seed 42]
// Output: public/textures/<name>/{color,normal,roughness}.jpg  (+ raw.png kept for reference)
// Key: FAL_KEY env var, or FAL_KEY=... line in ./.api_keys (gitignored).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name, prompt, ...rest] = process.argv.slice(2);
if (!name || !prompt) { console.error('usage: gen-texture.mjs <name> "<prompt>" [--size N] [--seed N] [--model fal-ai/flux/dev]'); process.exit(1); }
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const size = Number(opt('--size', 1024));
const seed = Number(opt('--seed', 7));
const model = opt('--model', 'fal-ai/flux/dev');

function key() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  if (existsSync('.api_keys')) {
    const m = readFileSync('.api_keys', 'utf8').match(/^\s*(?:export\s+)?FAL_KEY\s*=\s*["']?([^"'\s]+)/m);
    if (m) return m[1];
    const any = readFileSync('.api_keys', 'utf8').match(/([0-9a-f-]{36}:[0-9a-f]{32})/);
    if (any) return any[1];
  }
  throw new Error('no fal.ai key: set FAL_KEY or put FAL_KEY=... in .api_keys');
}

const fullPrompt = `${prompt}, seamless tileable texture, top-down orthographic, flat even lighting, no shadows, no text, photorealistic material scan, 4k detail`;
console.log(`[fal] ${model} ${size}x${size} seed ${seed}`);
const res = await fetch(`https://fal.run/${model}`, {
  method: 'POST',
  headers: { Authorization: `Key ${key()}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: fullPrompt, image_size: { width: size, height: size }, num_inference_steps: 28, guidance_scale: 3.5, seed, num_images: 1, enable_safety_checker: false, output_format: 'png' }),
});
if (!res.ok) { console.error(await res.text()); process.exit(1); }
const data = await res.json();
const url = data.images?.[0]?.url;
if (!url) { console.error('no image in response', JSON.stringify(data).slice(0, 400)); process.exit(1); }
const png = Buffer.from(await (await fetch(url)).arrayBuffer());
const dir = `public/textures/${name}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/raw.png`, png);
console.log(`[fal] saved ${dir}/raw.png (${(png.length / 1024).toFixed(0)} KB)`);

// Post-process with Python/PIL: make seamless (offset + blended seams), derive normal and roughness.
const py = `
import sys, numpy as np
from PIL import Image, ImageFilter
src = Image.open(sys.argv[1]).convert('RGB')
W, H = src.size
a = np.asarray(src).astype(np.float32)
# Seamless: blend the image with a half-offset copy using a smooth mask near the seams.
off = np.roll(np.roll(a, W // 2, axis=1), H // 2, axis=0)
yy, xx = np.mgrid[0:H, 0:W]
dx = np.minimum(xx, W - xx) / (W / 2); dy = np.minimum(yy, H - yy) / (H / 2)
edge = np.clip(np.minimum(dx, dy) * 4.0, 0, 1)[..., None]   # 1 in the middle, 0 at the borders
color = a * edge + off * (1 - edge)
Image.fromarray(color.clip(0, 255).astype(np.uint8)).save(sys.argv[2] + '/color.jpg', quality=88)
# Height from luminance (blurred), normal from gradients (OpenGL convention), roughness from inverted local contrast.
lum = Image.fromarray(color.clip(0,255).astype(np.uint8)).convert('L').filter(ImageFilter.GaussianBlur(1.2))
h = np.asarray(lum).astype(np.float32) / 255.0
gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 3.0
gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 3.0
n = np.stack([-gx, -gy, np.ones_like(h)], axis=-1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(sys.argv[2] + '/normal.jpg', quality=88)
detail = np.asarray(Image.fromarray((h*255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)).astype(np.float32) / 255.0
rough = np.clip(0.55 + 0.45 * (1.0 - detail * 3.0), 0.3, 1.0)
Image.fromarray((rough * 255).astype(np.uint8)).convert('RGB').save(sys.argv[2] + '/roughness.jpg', quality=85)
print('[post] color/normal/roughness written')
`;
execFileSync('python3', ['-c', py, `${dir}/raw.png`, dir], { stdio: 'inherit' });
