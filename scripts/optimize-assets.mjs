#!/usr/bin/env node
// Convert every generated asset to WebP and downscale sets that only ever appear small.
//   node scripts/optimize-assets.mjs            (idempotent; removes the .jpg/.png sources it converts)
// Keeps public/art/og-image.jpg and public/favicon.png as they are (social scrapers and browsers want those).
import { execFileSync } from 'node:child_process';

const py = `
import os, sys
from PIL import Image
root = 'public'
SMALL = {'coin', 'coin-big', 'log-end', 'monkey-face', 'iron', 'feather', 'bronze', 'skin', 'fur', 'lava', 'water', 'mosaic', 'portal'}
SMALL_SPRITES = {'icon-magnet', 'icon-shield', 'icon-bolt', 'soot', 'arrow'}
KEEP = {'public/art/og-image.jpg', 'public/favicon.png'}
total_before = total_after = 0
for dirpath, _, files in os.walk(root):
    for f in files:
        src = os.path.join(dirpath, f)
        if src in KEEP or not f.lower().endswith(('.jpg', '.jpeg', '.png')): continue
        name, _ = os.path.splitext(f)
        dst = os.path.join(dirpath, name + '.webp')
        im = Image.open(src)
        folder = os.path.basename(dirpath)
        is_sprite = dirpath.endswith('sprites')
        # Size policy
        if dirpath.startswith('public/textures'):
            target = 512 if folder in SMALL or folder.startswith('skin-') else 1024
        elif is_sprite:
            target = 512 if name in SMALL_SPRITES else 1024
        else:
            target = None
        if target and max(im.size) > target:
            ratio = target / max(im.size)
            im = im.resize((max(1, round(im.size[0] * ratio)), max(1, round(im.size[1] * ratio))), Image.LANCZOS)
        if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGBA' if is_sprite else 'RGB')
        q = 84 if name in ('normal',) else 80
        im.save(dst, 'WEBP', quality=q, method=6)
        b = os.path.getsize(src); a = os.path.getsize(dst); total_before += b; total_after += a
        os.remove(src)
print(f'[optimize] {total_before/1e6:.1f} MB -> {total_after/1e6:.1f} MB')
`;
execFileSync('python3', ['-c', py], { stdio: 'inherit' });
