import * as THREE from 'three';
import { hashString, mulberry32 } from '../procgen/rng';
import type { WorldUniforms } from '../world/uniforms';
import { createLeafAtlas } from './leafAtlas';
import { createLeafDepthMaterial, createLeafMaterial, createWoodDepthMaterial, createWoodMaterial } from './materials';
import { SPECIES, type SpeciesId } from './species';
import { buildImpostorQuad, generateTree, type TreeGeometry } from './treeGen';

/**
 * All trees and shrubs in a world, drawn with two BatchedMeshes (wood + foliage): a handful of
 * draw calls for thousands of plants. Each plant switches between LOD0/1/2 and a camera-facing
 * impostor (rendered into an atlas at startup) by distance.
 */
export interface Plant {
  species: SpeciesId;
  x: number;
  z: number;
  /** Ground height; filled in by the builder if omitted. */
  y?: number;
  scale?: number;
  rot?: number;
  variant?: number;
  /** Stable id, e.g. "moria-3", for gameplay lookups. */
  id?: string;
}

export interface Forest {
  readonly group: THREE.Group;
  readonly plants: readonly Required<Omit<Plant, 'id'>>[];
  update(camera: THREE.Camera): void;
  /** Debug/benchmark counters. */
  stats(): { plants: number; lod: [number, number, number, number, number] };
  dispose(): void;
}

const IMPOSTOR_SLOT = 256;
const IMPOSTOR_ATLAS = 2048;
const SLOTS_PER_ROW = IMPOSTOR_ATLAS / IMPOSTOR_SLOT;

interface VariantGeo {
  lods: [TreeGeometry, TreeGeometry, TreeGeometry];
  impostor: THREE.BufferGeometry;
  woodIds: [number, number, number];
  leafIds: [number, number, number, number]; // LOD0..2 + impostor
}

export function buildForest(
  plantsIn: Plant[],
  opts: {
    renderer: THREE.WebGLRenderer;
    uniforms: WorldUniforms;
    sunDir: THREE.Vector3;
    heightAt: (x: number, z: number) => number;
    variants?: number;
    drawDistance: number;
    shadows: boolean;
  },
): Forest {
  const variantsPer = opts.variants ?? 3;
  const plants = plantsIn.map((p, i) => {
    const rng = mulberry32(hashString(p.id ?? `${p.species}:${i}:${p.x.toFixed(1)}:${p.z.toFixed(1)}`));
    return {
      species: p.species,
      x: p.x,
      z: p.z,
      y: p.y ?? opts.heightAt(p.x, p.z) - 0.05,
      scale: p.scale ?? 0.85 + rng() * 0.35,
      rot: p.rot ?? rng() * Math.PI * 2,
      variant: (p.variant ?? Math.floor(rng() * variantsPer)) % variantsPer,
    };
  });

  const usedSpecies = [...new Set(plants.map((p) => p.species))];
  const geos = new Map<string, VariantGeo>();
  const leafAtlas = createLeafAtlas();
  const impostorRT = new THREE.WebGLRenderTarget(IMPOSTOR_ATLAS, IMPOSTOR_ATLAS, {
    colorSpace: THREE.SRGBColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  const woodMat = createWoodMaterial(opts.uniforms);
  const leafMat = createLeafMaterial(opts.uniforms, leafAtlas, impostorRT.texture, opts.sunDir);
  // The capture pass must not bind the atlas it renders into (that's a GL feedback loop).
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const captureLeafMat = createLeafMaterial(opts.uniforms, leafAtlas, blank, opts.sunDir);

  let slot = 0;
  for (const sp of usedSpecies) {
    for (let v = 0; v < variantsPer; v++) {
      const seed = hashString(sp) + v * 7919;
      const spec = SPECIES[sp];
      const lods: [TreeGeometry, TreeGeometry, TreeGeometry] = [generateTree(spec, seed, 0), generateTree(spec, seed, 1), generateTree(spec, seed, 2)];
      const s = slot++;
      if (s >= SLOTS_PER_ROW * SLOTS_PER_ROW) throw new Error('Impostor atlas full: reduce species variants');
      const sx = (s % SLOTS_PER_ROW) * IMPOSTOR_SLOT;
      const sy = Math.floor(s / SLOTS_PER_ROW) * IMPOSTOR_SLOT;
      const pad = 2 / IMPOSTOR_ATLAS;
      const rect: [number, number, number, number] = [sx / IMPOSTOR_ATLAS + pad, sy / IMPOSTOR_ATLAS + pad, (sx + IMPOSTOR_SLOT) / IMPOSTOR_ATLAS - pad, (sy + IMPOSTOR_SLOT) / IMPOSTOR_ATLAS - pad];
      const impostor = buildImpostorQuad(lods[0].height, lods[0].radius, rect);
      geos.set(`${sp}:${v}`, { lods, impostor, woodIds: [0, 0, 0], leafIds: [0, 0, 0, 0] });
      renderImpostor(opts.renderer, impostorRT, sx, sy, lods[0], woodMat, captureLeafMat, opts.uniforms);
    }
  }
  opts.renderer.setRenderTarget(null);
  captureLeafMat.dispose();
  blank.dispose();

  // Capacity for the batches.
  let woodV = 0, woodI = 0, leafV = 0, leafI = 0;
  for (const g of geos.values()) {
    for (const l of g.lods) {
      woodV += l.wood.attributes.position!.count;
      woodI += l.wood.index!.count;
      leafV += l.leaves.attributes.position!.count;
      leafI += l.leaves.index!.count;
    }
    leafV += g.impostor.attributes.position!.count;
    leafI += g.impostor.index!.count;
  }
  const n = Math.max(1, plants.length);
  const wood = new THREE.BatchedMesh(n, Math.max(3, woodV), Math.max(3, woodI), woodMat);
  const leaves = new THREE.BatchedMesh(n, Math.max(3, leafV), Math.max(3, leafI), leafMat);
  wood.name = 'forest-wood';
  leaves.name = 'forest-leaves';
  for (const m of [wood, leaves]) {
    m.castShadow = opts.shadows;
    m.receiveShadow = true;
    m.frustumCulled = false; // per-instance culling happens inside the batch
  }
  wood.customDepthMaterial = createWoodDepthMaterial(opts.uniforms);
  leaves.customDepthMaterial = createLeafDepthMaterial(opts.uniforms, leafAtlas);

  for (const g of geos.values()) {
    g.woodIds = [wood.addGeometry(g.lods[0].wood), wood.addGeometry(g.lods[1].wood), wood.addGeometry(g.lods[2].wood)];
    g.leafIds = [leaves.addGeometry(g.lods[0].leaves), leaves.addGeometry(g.lods[1].leaves), leaves.addGeometry(g.lods[2].leaves), leaves.addGeometry(g.impostor)];
  }

  const woodInst: number[] = [];
  const leafInst: number[] = [];
  const lodState = new Int8Array(plants.length).fill(-1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const tintRng = mulberry32(11);
  for (const p of plants) {
    const g = geos.get(`${p.species}:${p.variant}`)!;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
    m.compose(pos.set(p.x, p.y, p.z), q, scl.setScalar(p.scale));
    const wi = wood.addInstance(g.woodIds[0]);
    const li = leaves.addInstance(g.leafIds[0]);
    wood.setMatrixAt(wi, m);
    leaves.setMatrixAt(li, m);
    // Slight per-tree tint so groves aren't clones.
    const t = 0.9 + tintRng() * 0.2;
    leaves.setColorAt(li, col.setRGB(t * (0.97 + tintRng() * 0.06), t, t * (0.95 + tintRng() * 0.08)));
    wood.setColorAt(wi, col.setRGB(1, 1, 1));
    woodInst.push(wi);
    leafInst.push(li);
  }

  const group = new THREE.Group();
  group.name = 'forest';
  group.add(wood, leaves);

  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const camPos = new THREE.Vector3();

  return {
    group,
    plants,
    update(camera) {
      camera.getWorldPosition(camPos);
      counts.fill(0);
      for (let i = 0; i < plants.length; i++) {
        const p = plants[i]!;
        const spec = SPECIES[p.species];
        const d = Math.hypot(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z) / Math.max(0.6, p.scale);
        const lod = d < spec.lod[0] ? 0 : d < spec.lod[1] ? 1 : d < spec.lod[2] ? 2 : d * p.scale < opts.drawDistance ? 3 : 4;
        counts[lod]!++;
        if (lod === lodState[i]) continue;
        const g = geos.get(`${p.species}:${p.variant}`)!;
        const wi = woodInst[i]!;
        const li = leafInst[i]!;
        if (lod <= 2) {
          wood.setVisibleAt(wi, true);
          wood.setGeometryIdAt(wi, g.woodIds[lod as 0 | 1 | 2]);
          leaves.setVisibleAt(li, true);
          leaves.setGeometryIdAt(li, g.leafIds[lod as 0 | 1 | 2]);
        } else if (lod === 3) {
          wood.setVisibleAt(wi, false);
          leaves.setVisibleAt(li, true);
          leaves.setGeometryIdAt(li, g.leafIds[3]);
        } else {
          wood.setVisibleAt(wi, false);
          leaves.setVisibleAt(li, false);
        }
        lodState[i] = lod;
      }
    },
    stats: () => ({ plants: plants.length, lod: [...counts] as [number, number, number, number, number] }),
    dispose() {
      wood.dispose();
      leaves.dispose();
      woodMat.dispose();
      leafMat.dispose();
      wood.customDepthMaterial?.dispose();
      leaves.customDepthMaterial?.dispose();
      leafAtlas.dispose();
      impostorRT.dispose();
      for (const g of geos.values()) {
        for (const l of g.lods) {
          l.wood.dispose();
          l.leaves.dispose();
        }
        g.impostor.dispose();
      }
    },
  };
}

/** Render one tree, orthographic from the side, into its impostor-atlas slot (albedo with soft baked shading). */
function renderImpostor(
  renderer: THREE.WebGLRenderer,
  rt: THREE.WebGLRenderTarget,
  sx: number,
  sy: number,
  tree: TreeGeometry,
  woodMat: THREE.Material,
  leafMat: THREE.Material,
  u: WorldUniforms,
): void {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.4));
  const dl = new THREE.DirectionalLight(0xfff4e0, 1.6);
  dl.position.set(0.3, 1, 1);
  scene.add(dl);
  const woodMesh = new THREE.Mesh(tree.wood, woodMat);
  const leafMesh = new THREE.Mesh(tree.leaves, leafMat);
  scene.add(woodMesh, leafMesh);
  const w = tree.radius * 1.05;
  const h = tree.height * 1.02;
  const cam = new THREE.OrthographicCamera(-w, w, h, 0, 0.1, w * 4 + 10);
  cam.position.set(0, 0, w * 2 + 5);
  cam.lookAt(0, 0, 0);
  // Freeze wind and translucency while capturing.
  const saved = { gust: u.gust.value, wind: u.windStrength.value, night: u.night.value };
  u.gust.value = 0;
  u.windStrength.value = 0;
  u.night.value = 1;
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  // Each slot is cleared by render() inside its scissor box, so the clear colour must be transparent.
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rt);
  if (sx === 0 && sy === 0) {
    rt.scissorTest = false;
    renderer.clear(true, true, true);
  }
  rt.viewport.set(sx, sy, IMPOSTOR_SLOT, IMPOSTOR_SLOT);
  rt.scissor.set(sx, sy, IMPOSTOR_SLOT, IMPOSTOR_SLOT);
  rt.scissorTest = true;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  rt.scissorTest = false;
  rt.viewport.set(0, 0, IMPOSTOR_ATLAS, IMPOSTOR_ATLAS);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(prevColor, prevAlpha);
  u.gust.value = saved.gust;
  u.windStrength.value = saved.wind;
  u.night.value = saved.night;
}
