#!/usr/bin/env node
// Trim a GLB to what the game uses, with gltf-transform (run inside the dev container):
//   node scripts/trim-glb.mjs in.glb out.glb --keep-nodes Arch_Round,Column_Round   # keep only these top-level mesh nodes
//   node scripts/trim-glb.mjs in.glb out.glb --keep-anims Idle,Run,Roll,Death        # keep only these animation clips (suffix match)
//   node scripts/trim-glb.mjs a.glb,b.glb out.glb --webp 1024                        # merge several GLBs into one library, textures → WebP ≤1024
//   node scripts/trim-glb.mjs in.glb out.glb --rename Old=New,Old2=New2               # rename mesh nodes
// Then unreferenced meshes/materials/textures/accessors are pruned and duplicates merged.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, resample, textureCompress, unpartition } from '@gltf-transform/functions';
import { statSync } from 'node:fs';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) { console.error('usage: trim-glb.mjs in.glb out.glb [--keep-nodes a,b] [--keep-anims a,b]'); process.exit(1); }
const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1].split(',') : null; };
const keepNodes = opt('--keep-nodes'); const keepAnims = opt('--keep-anims'); const webp = opt('--webp'); const rename = opt('--rename');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const inputs = input.split(',');
const doc = await io.read(inputs[0]);
for (const extra of inputs.slice(1)) {
  // Merge: every extra file's scene content moves into the first document's default scene.
  const other = await io.read(extra);
  mergeDocuments(doc, other);
  const scenes = doc.getRoot().listScenes();
  const main = scenes[0];
  for (const sc of scenes.slice(1)) { for (const n of sc.listChildren()) main.addChild(n); sc.dispose(); }
}
const root = doc.getRoot();
if (rename) for (const pair of rename) { const [from, to] = pair.split('='); for (const n of root.listNodes()) if (n.getName() === from) n.setName(to); }

if (keepNodes && keepNodes[0] === 'NONE') {
  // Clip-only file: drop every mesh but keep the skeleton nodes the animations target.
  for (const node of root.listNodes()) node.setMesh(null);
  for (const skin of root.listSkins()) skin.dispose();
} else if (keepNodes) {
  const keep = new Set(keepNodes);
  // A node is kept if it, or any ancestor, is in the list (pieces may be grouped under a named parent).
  const wanted = (node) => { for (let n = node; n; n = n.getParentNode()) if (keep.has(n.getName())) return true; return false; };
  const hasWantedBelow = (node) => wanted(node) || node.listChildren().some(hasWantedBelow);
  for (const node of root.listNodes()) {
    if (node.getMesh() && !wanted(node)) node.setMesh(null);
  }
  for (const node of root.listNodes()) if (!hasWantedBelow(node) && !node.getMesh()) node.dispose();
  const found = root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
  const missing = keepNodes.filter((k) => !found.includes(k));
  if (missing.length) console.warn('not found:', missing.join(', '));
}
if (keepAnims) {
  for (const a of root.listAnimations()) {
    const name = a.getName().replace(/^.*\|/, '');
    if (!keepAnims.includes(name)) a.dispose(); else a.setName(name);
  }
}
await doc.transform(prune({ keepLeaves: true }), dedup(), resample());
if (webp) {
  const sharp = (await import('sharp')).default;
  const size = Number(webp[0]) || 1024;
  await doc.transform(unpartition(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }));
}
await io.write(output, doc);
console.log(`${input} ${inputs.reduce((a, f) => a + statSync(f).size, 0) / 1024 | 0} KB -> ${output} ${(statSync(output).size / 1024) | 0} KB; nodes ${root.listNodes().filter((n) => n.getMesh()).length}, anims ${root.listAnimations().map((a) => a.getName()).join(',')}`);
