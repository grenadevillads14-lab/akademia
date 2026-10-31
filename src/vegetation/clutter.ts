import * as THREE from 'three';
import { mulberry32 } from '../procgen/rng';
import type { Heightfield } from '../world/heightfield';
import { atlasRect } from './leafAtlas';

/**
 * Ground clutter around the player: pebbles and small stones on paths, dirt and dry ground, and fallen
 * olive and plane leaves scattered everywhere (thicker on bare ground). Placed on the CPU per 8 m tile
 * from the real terrain surface weights, re-laid only when the player crosses a tile, two draw calls.
 */
const TILE = 8;

export interface Clutter {
  readonly group: THREE.Group;
  update(focus: THREE.Vector3): void;
  dispose(): void;
}

export function createClutter(hf: Heightfield, leafAtlas: THREE.Texture, opts: { radius: number; density: number }): Clutter {
  const group = new THREE.Group();
  group.name = 'clutter';
  const across = Math.ceil((opts.radius * 2) / TILE) + 1;
  const tiles = across * across;
  const perTilePebbles = Math.round(140 * opts.density);
  const perTileLeaves = Math.round(110 * opts.density);

  // Pebbles: irregular, flattened icosahedra.
  const pebbleGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    const p = pebbleGeo.getAttribute('position');
    const rng = mulberry32(5);
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + rng() * 0.5;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.55, p.getZ(i) * k);
    }
    pebbleGeo.computeVertexNormals();
  }
  const pebbleMat = new THREE.MeshStandardMaterial({ roughness: 0.95, color: 0xffffff, envMapIntensity: 0.5 });
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, tiles * perTilePebbles);
  pebbles.castShadow = false;
  pebbles.receiveShadow = true;
  pebbles.frustumCulled = false;

  // Fallen leaves: small quads lying on the ground, cut from the leaf atlas (one leaf-sized patch of a spray).
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  leafGeo.rotateX(-Math.PI / 2);
  const leafMat = new THREE.MeshStandardMaterial({ map: leafAtlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const [u0, v0, u1, v1] = atlasRect('plane');
  const [o0, ov0, o1, ov1] = atlasRect('olive');
  // Per-instance UV window (which leaf patch) via an instanced attribute.
  const uvWin = new THREE.InstancedBufferAttribute(new Float32Array(tiles * perTileLeaves * 4), 4);
  leafGeo.setAttribute('aUvWin', uvWin);
  leafMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aUvWin;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = mix(aUvWin.xy, aUvWin.zw, uv);');
  };
  leafMat.customProgramCacheKey = () => 'clutter-leaves';
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, tiles * perTileLeaves);
  leaves.receiveShadow = true;
  leaves.frustumCulled = false;
  group.add(pebbles, leaves);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  const w = new Float32Array(8);
  let lastX = Infinity;
  let lastZ = Infinity;
  const slotKey: (string | null)[] = new Array(tiles).fill(null);

  const layTile = (tx: number, tz: number, slot: number) => {
    const rng = mulberry32((tx * 73856093) ^ (tz * 19349663));
    for (let i = 0; i < perTilePebbles; i++) {
      const x = (tx + rng()) * TILE;
      const z = (tz + rng()) * TILE;
      hf.surface(x, z, w);
      // Paths, dirt, dry ground and rock carry stones; grass hides most of them.
      const stony = w[2]! * 1.0 + w[7]! * 0.9 + w[1]! * 0.45 + w[3]! * 1.0 + w[4]! * 0.25 + w[0]! * 0.08;
      const keep = rng() < stony && hf.water(x, z).level < hf.height(x, z) - 0.05;
      const r = keep ? 0.012 + Math.pow(rng(), 3) * 0.07 : 0;
      pos.set(x, hf.height(x, z) + r * 0.15, z);
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.4, rng() * Math.PI * 2, (rng() - 0.5) * 0.4));
      s.set(r, r, r);
      m.compose(pos, q, s);
      const k = slot * perTilePebbles + i;
      pebbles.setMatrixAt(k, m);
      // Limestone and schist pebbles: earthy, not white.
      const shade = 0.22 + rng() * 0.22;
      col.setRGB(shade * 1.08, shade * 0.98, shade * 0.84);
      pebbles.setColorAt(k, col);
    }
    for (let i = 0; i < perTileLeaves; i++) {
      const x = (tx + rng()) * TILE;
      const z = (tz + rng()) * TILE;
      hf.surface(x, z, w);
      const bare = w[2]! + w[1]! * 0.8 + w[7]! * 0.6 + w[0]! * 0.25 + w[6]! * 0.15;
      const keep = rng() < bare && hf.water(x, z).level < hf.height(x, z) - 0.05;
      const olive = rng() < 0.6;
      const size = keep ? (olive ? 0.06 : 0.13) * (0.8 + rng() * 0.5) : 0;
      pos.set(x, hf.height(x, z) + 0.012, z);
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3));
      s.set(size, size, size);
      m.compose(pos, q, s);
      const k = slot * perTileLeaves + i;
      leaves.setMatrixAt(k, m);
      // A small window of the spray around one leaf.
      const [a0, b0, a1, b1] = olive ? [o0, ov0, o1, ov1] : [u0, v0, u1, v1];
      const cu = a0 + (a1 - a0) * (0.25 + rng() * 0.5);
      const cv = b0 + (b1 - b0) * (0.35 + rng() * 0.5);
      const hw = (a1 - a0) * (olive ? 0.09 : 0.2);
      uvWin.setXYZW(k, cu - hw, cv - hw, cu + hw, cv + hw);
      // Dry leaves: browns, ochres, a few still green.
      const dry = rng();
      col.setRGB(0.95 + dry * 0.25, 0.75 + dry * 0.1, 0.45 - dry * 0.2);
      leaves.setColorAt(k, col);
    }
  };

  return {
    group,
    update(focus) {
      const cx = Math.floor(focus.x / TILE);
      const cz = Math.floor(focus.z / TILE);
      if (cx === lastX && cz === lastZ) return;
      lastX = cx;
      lastZ = cz;
      // Only lay out tiles that just came into range; reuse the slots of tiles that left.
      const half = Math.floor(across / 2);
      const want = new Map<string, [number, number]>();
      for (let j = -half; j < across - half; j++) for (let i = -half; i < across - half; i++) want.set(`${cx + i},${cz + j}`, [cx + i, cz + j]);
      const free: number[] = [];
      slotKey.forEach((key, slot) => {
        if (key && want.has(key)) want.delete(key);
        else free.push(slot);
      });
      for (const [key, [tx, tz]] of want) {
        const slot = free.pop();
        if (slot === undefined) break;
        slotKey[slot] = key;
        layTile(tx, tz, slot);
      }
      pebbles.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      uvWin.needsUpdate = true;
    },
    dispose() {
      pebbleGeo.dispose();
      pebbleMat.dispose();
      leafGeo.dispose();
      leafMat.dispose();
    },
  };
}
