import * as THREE from 'three';
import type { Physics } from '../physics/physics';
import { createGroundTextureArray } from '../render/groundTextures';
import { SURFACE_LAYERS, type Heightfield } from './heightfield';
import type { WorldUniforms } from './uniforms';

/**
 * Terrain: a grid sampled from the analytic heightfield, split into chunks for frustum culling,
 * with an 8-layer splat material, a matching Rapier heightfield collider, and baked
 * height / grass-density textures for GPU-placed grass.
 */
export interface Terrain {
  readonly group: THREE.Group;
  readonly heightTexture: THREE.DataTexture;
  readonly grassTexture: THREE.DataTexture;
  /** World-space rectangle the baked textures cover: [minX, minZ, sizeX, sizeZ]. */
  readonly textureRect: THREE.Vector4;
  dispose(): void;
}

const CHUNK_CELLS = 64;

export function buildTerrain(hf: Heightfield, physics: Physics | null, uniforms: WorldUniforms): Terrain {
  const { bounds, cellSize } = hf.layout;
  const cols = Math.round((bounds.maxX - bounds.minX) / cellSize);
  const rows = Math.round((bounds.maxZ - bounds.minZ) / cellSize);
  const vx = cols + 1;
  const vz = rows + 1;

  // Sample heights and surfaces once on the full vertex grid.
  const heights = new Float32Array(vx * vz);
  const splat = new Float32Array(vx * vz * SURFACE_LAYERS.length);
  const grass = new Uint8Array(vx * vz);
  const tmp = new Float32Array(SURFACE_LAYERS.length);
  for (let j = 0; j < vz; j++) {
    const z = bounds.minZ + j * cellSize;
    for (let i = 0; i < vx; i++) {
      const x = bounds.minX + i * cellSize;
      const idx = j * vx + i;
      heights[idx] = hf.height(x, z);
      hf.surface(x, z, tmp);
      splat.set(tmp, idx * SURFACE_LAYERS.length);
      grass[idx] = Math.round(hf.grassDensity(x, z) * 255);
    }
  }

  const material = createTerrainMaterial(uniforms);
  const group = new THREE.Group();
  group.name = 'terrain';

  const hAt = (i: number, j: number) => heights[Math.min(vz - 1, Math.max(0, j)) * vx + Math.min(vx - 1, Math.max(0, i))]!;

  for (let cj = 0; cj < rows; cj += CHUNK_CELLS) {
    for (let ci = 0; ci < cols; ci += CHUNK_CELLS) {
      const ncx = Math.min(CHUNK_CELLS, cols - ci);
      const ncz = Math.min(CHUNK_CELLS, rows - cj);
      const nv = (ncx + 1) * (ncz + 1);
      const pos = new Float32Array(nv * 3);
      const nrm = new Float32Array(nv * 3);
      const sA = new Float32Array(nv * 4);
      const sB = new Float32Array(nv * 4);
      let k = 0;
      for (let j = 0; j <= ncz; j++) {
        for (let i = 0; i <= ncx; i++) {
          const gi = ci + i;
          const gj = cj + j;
          const h = hAt(gi, gj);
          pos[k * 3] = bounds.minX + gi * cellSize;
          pos[k * 3 + 1] = h;
          pos[k * 3 + 2] = bounds.minZ + gj * cellSize;
          // Normal from central differences.
          const dx = hAt(gi + 1, gj) - hAt(gi - 1, gj);
          const dz = hAt(gi, gj + 1) - hAt(gi, gj - 1);
          const n = new THREE.Vector3(-dx, 2 * cellSize, -dz).normalize();
          nrm[k * 3] = n.x;
          nrm[k * 3 + 1] = n.y;
          nrm[k * 3 + 2] = n.z;
          const so = (gj * vx + gi) * SURFACE_LAYERS.length;
          for (let l = 0; l < 4; l++) {
            sA[k * 4 + l] = splat[so + l]!;
            sB[k * 4 + l] = splat[so + 4 + l]!;
          }
          k++;
        }
      }
      const index: number[] = [];
      for (let j = 0; j < ncz; j++) {
        for (let i = 0; i < ncx; i++) {
          const a = j * (ncx + 1) + i;
          const b = a + 1;
          const c = a + (ncx + 1);
          const d = c + 1;
          index.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('splatA', new THREE.BufferAttribute(sA, 4));
      geo.setAttribute('splatB', new THREE.BufferAttribute(sB, 4));
      geo.setIndex(index);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.name = `terrain-${ci}-${cj}`;
      group.add(mesh);
    }
  }

  // Physics: Rapier heightfield. Matrix has (rows+1) x (cols+1) entries, column-major,
  // rows along local z and columns along local x, centred on the collider's origin.
  if (physics) {
    const R = physics.R;
    const hfData = new Float32Array(vx * vz);
    for (let i = 0; i < vx; i++) {
      for (let j = 0; j < vz; j++) hfData[i * vz + j] = heights[j * vx + i]!;
    }
    const sizeX = cols * cellSize;
    const sizeZ = rows * cellSize;
    const desc = R.ColliderDesc.heightfield(rows, cols, hfData, { x: sizeX, y: 1, z: sizeZ }).setTranslation(
      bounds.minX + sizeX / 2,
      0,
      bounds.minZ + sizeZ / 2,
    );
    physics.world.createCollider(desc);
  }

  // Baked textures for the grass shader (height as half-float for linear filtering everywhere).
  const halfHeights = new Uint16Array(vx * vz);
  for (let i = 0; i < heights.length; i++) halfHeights[i] = THREE.DataUtils.toHalfFloat(heights[i]!);
  const heightTexture = new THREE.DataTexture(halfHeights, vx, vz, THREE.RedFormat, THREE.HalfFloatType);
  heightTexture.magFilter = heightTexture.minFilter = THREE.LinearFilter;
  heightTexture.needsUpdate = true;
  const grassTexture = new THREE.DataTexture(grass, vx, vz, THREE.RedFormat, THREE.UnsignedByteType);
  grassTexture.magFilter = grassTexture.minFilter = THREE.LinearFilter;
  grassTexture.needsUpdate = true;
  const textureRect = new THREE.Vector4(bounds.minX, bounds.minZ, cols * cellSize, rows * cellSize);

  return {
    group,
    heightTexture,
    grassTexture,
    textureRect,
    dispose() {
      for (const c of group.children) (c as THREE.Mesh).geometry.dispose();
      material.dispose();
      (material.userData.layers as THREE.Texture | undefined)?.dispose();
      heightTexture.dispose();
      grassTexture.dispose();
    },
  };
}

function createTerrainMaterial(uniforms: WorldUniforms): THREE.MeshStandardMaterial {
  const layers = createGroundTextureArray(256);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.userData.layers = layers;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLayers = { value: layers };
    shader.uniforms.uSeasonTint = uniforms.seasonTint;
    shader.uniforms.uWetness = uniforms.wetness;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec4 splatA;
         attribute vec4 splatB;
         varying vec4 vSplatA;
         varying vec4 vSplatB;
         varying vec3 vWorldPosT;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vSplatA = splatA;
         vSplatB = splatB;
         vWorldPosT = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform mediump sampler2DArray uLayers;
         uniform vec3 uSeasonTint;
         uniform float uWetness;
         varying vec4 vSplatA;
         varying vec4 vSplatB;
         varying vec3 vWorldPosT;
         vec3 layer(float i, vec2 uv) {
           // Two scales blended to hide tiling.
           vec3 a = texture(uLayers, vec3(uv, i)).rgb;
           vec3 b = texture(uLayers, vec3(uv * 0.237 + 0.31, i)).rgb;
           return mix(a, b, 0.45);
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 tuv = vWorldPosT.xz / 3.5;
         vec3 g = layer(0.0, tuv) * uSeasonTint;
         vec3 col = g * vSplatA.x
           + layer(1.0, tuv) * vSplatA.y
           + layer(2.0, tuv) * vSplatA.z
           + layer(3.0, tuv * 0.5) * vSplatA.w
           + layer(4.0, tuv) * vSplatB.x
           + layer(5.0, tuv) * vSplatB.y
           + layer(6.0, vWorldPosT.xz / 2.2) * vSplatB.z
           + layer(7.0, tuv * 0.6) * vSplatB.w;
         // Large-scale tonal variation so the plain doesn't look uniform from above.
         float macro = texture(uLayers, vec3(vWorldPosT.xz / 180.0, 1.0)).r;
         col *= mix(0.86, 1.1, macro);
         col *= mix(1.0, 0.72, uWetness * (vSplatB.y + vSplatA.z + vSplatB.w));
         diffuseColor.rgb *= col;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness - 0.25 * vSplatB.z - 0.2 * uWetness;`,
      );
  };
  return mat;
}
