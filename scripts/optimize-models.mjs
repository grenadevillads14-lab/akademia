// Simplify the fetched Poly Haven models into game-ready LODs and pack each into a single .glb.
// Usage: node scripts/optimize-models.mjs
// Input:  public/assets/ph/models/<id>/<id>.gltf   (from scripts/fetch_polyhaven.py)
// Output: public/assets/ph/game/<id>/lod0.gltf, lod1.gltf sharing one set of WebP textures (+ models.json).
// The raw downloads in public/assets/ph/models are a git-ignored cache.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'public/assets/ph/models';
// Target triangle counts per LOD. Foliage keeps more detail at LOD0 (alpha cards suffer when simplified).
const TARGETS = {
  boulder_01: [6000, 1500],
  namaqualand_boulder_02: [6000, 1500],
  namaqualand_boulder_04: [5000, 1200],
  stone_01: [2500, 600],
  shrub_01: [12000, 4000],
  shrub_02: [9000, 3000],
  shrub_04: [9000, 3000],
  wild_rooibos_bush: [9000, 3000],
  grass_medium_01: [5000, 1600],
  grass_medium_02: [4000, 1400],
  antique_ceramic_vase_01: [3000, 900],
  ceramic_vase_01: [3000, 900],
  planter_pot_clay: [2000, 700],
  wicker_basket_01: [4000, 1200],
  marble_bust_01: [6000, 1800],
};

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      n += idx ? idx.getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
    }
  }
  return Math.round(n);
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report = {};
for (const id of readdirSync(ROOT)) {
  const src = join(ROOT, id, `${id}.gltf`);
  if (!existsSync(src)) continue;
  const targets = TARGETS[id] ?? [5000, 1500];
  report[id] = {};
  for (const [lod, target] of targets.entries()) {
    const doc = await io.read(src);
    const before = triangles(doc);
    const ratio = Math.min(1, target / Math.max(1, before));
    await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: lod === 0 ? 0.02 : 0.08, lockBorder: false }), prune());
    const after = triangles(doc);
    const outDir = join('public/assets/ph/game', id);
    mkdirSync(outDir, { recursive: true });
    for (const tex of doc.getRoot().listTextures()) tex.setURI(`${id}_${tex.getURI().split('/').pop()}`);
    for (const buf of doc.getRoot().listBuffers()) buf.setURI(`lod${lod}.bin`);
    await io.write(join(outDir, `lod${lod}.gltf`), doc);
    report[id][`lod${lod}`] = after;
    console.info(`${id} lod${lod}: ${before} -> ${after} tris`);
  }
}
writeFileSync('public/assets/ph/models.json', JSON.stringify(report, null, 1));
