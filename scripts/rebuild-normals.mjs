#!/usr/bin/env node
// Recompute normal.webp for every PBR set from its color map: high-passed luminance with a percentile
// stretch, so relief is strong and consistent regardless of how the depth model behaved.
import { execFileSync } from 'node:child_process';
const py = `
import os, numpy as np
from PIL import Image, ImageFilter
root = 'public/textures'
for folder in sorted(os.listdir(root)):
    d = os.path.join(root, folder)
    c = os.path.join(d, 'color.webp')
    if not os.path.isfile(c): continue
    im = Image.open(c).convert('L')
    W, H = im.size
    h = np.asarray(im.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255.0
    base = np.asarray(im.filter(ImageFilter.GaussianBlur(max(8, W // 32)))).astype(np.float32) / 255.0
    rel = h - base
    lo, hi = np.percentile(rel, 2), np.percentile(rel, 98)
    rel = np.clip((rel - lo) / max(hi - lo, 1e-6), 0, 1)
    k = 3.2 * (W / 1024)
    gx = (np.roll(rel, -1, axis=1) - np.roll(rel, 1, axis=1)) * k
    gy = (np.roll(rel, -1, axis=0) - np.roll(rel, 1, axis=0)) * k
    n = np.stack([-gx, -gy, np.ones_like(rel)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(d, 'normal.webp'), 'WEBP', quality=84, method=6)
    print(f'[normals] {folder}: {os.path.getsize(os.path.join(d, "normal.webp"))//1024} KB')
`;
execFileSync('python3', ['-c', py], { stdio: 'inherit' });
