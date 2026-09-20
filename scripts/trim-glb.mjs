#!/usr/bin/env node
// Trim a GLB to what the game uses, with gltf-transform (run inside the dev container):
//   node scripts/trim-glb.mjs in.glb out.glb --keep-nodes Arch_Round,Column_Round   # keep only these top-level mesh nodes
//   node scripts/trim-glb.mjs in.glb out.glb --keep-anims Idle,Run,Roll,Death        # keep only these animation clips (suffix match)
// Then unreferenced meshes/materials/textures/accessors are pruned and duplicates merged.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { statSync } from 'node:fs';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) { console.error('usage: trim-glb.mjs in.glb out.glb [--keep-nodes a,b] [--keep-anims a,b]'); process.exit(1); }
const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1].split(',') : null; };
const keepNodes = opt('--keep-nodes'); const keepAnims = opt('--keep-anims');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

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
await io.write(output, doc);
console.log(`${input} ${(statSync(input).size / 1024) | 0} KB -> ${output} ${(statSync(output).size / 1024) | 0} KB; nodes ${root.listNodes().filter((n) => n.getMesh()).length}, anims ${root.listAnimations().map((a) => a.getName()).join(',')}`);
