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

/** Photographic ground layers (Poly Haven), in SURFACE_LAYERS order, with tile sizes in metres. */
export interface GroundLayers {
  diff: THREE.DataArrayTexture;
  nor: THREE.DataArrayTexture;
  metres: number[];
}

export function buildTerrain(hf: Heightfield, physics: Physics | null, uniforms: WorldUniforms, layers?: GroundLayers): Terrain {
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

  const material = layers ? createPhotoTerrainMaterial(uniforms, layers) : createTerrainMaterial(uniforms);
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

/**
 * Terrain material with photographic layers: albedo + normal texture arrays, height-aware blending
 * (each layer's own brightness decides who wins at the borders, so paths break up into pebbles and
 * grass clumps instead of a soft fade), and a low-frequency tone map to hide tiling.
 */
function createPhotoTerrainMaterial(uniforms: WorldUniforms, layers: GroundLayers): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.userData.layers = layers.diff;
  const m = layers.metres;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDiff = { value: layers.diff };
    shader.uniforms.uNor = { value: layers.nor };
    shader.uniforms.uScaleA = { value: new THREE.Vector4(1 / m[0]!, 1 / m[1]!, 1 / m[2]!, 1 / m[3]!) };
    shader.uniforms.uScaleB = { value: new THREE.Vector4(1 / m[4]!, 1 / m[5]!, 1 / m[6]!, 1 / m[7]!) };
    shader.uniforms.uSeasonTint = uniforms.seasonTint;
    shader.uniforms.uWetness = uniforms.wetness;
    shader.uniforms.uGreen = uniforms.greenness;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splatA; attribute vec4 splatB;
        varying vec4 vSplatA; varying vec4 vSplatB; varying vec3 vWorldPosT;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplatA = splatA; vSplatB = splatB; vWorldPosT = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform mediump sampler2DArray uDiff;
        uniform mediump sampler2DArray uNor;
        uniform vec4 uScaleA; uniform vec4 uScaleB;
        uniform vec3 uSeasonTint; uniform float uWetness; uniform float uGreen;
        varying vec4 vSplatA; varying vec4 vSplatB; varying vec3 vWorldPosT;
        vec2 terrainUv(float s) { return vec2(vWorldPosT.x, -vWorldPosT.z) * s; }
        // Explicit gradients: sampling happens inside a loop with early-outs, where implicit
        // derivatives are undefined (that caused sparkling pixels). Gradients are computed once.
        // A second, scaled sample breaks up visible repetition.
        vec2 gdx; vec2 gdy;
        vec4 sampleLayer(sampler2DArray t, float i, float s) {
          vec2 uv = terrainUv(s);
          vec4 a = textureGrad(t, vec3(uv, i), gdx * s, gdy * s);
          vec4 b = textureGrad(t, vec3(uv * 0.31 + vec2(0.37, 0.71), i), gdx * s * 0.31, gdy * s * 0.31);
          return mix(a, b, 0.35);
        }
`)
      .replace('#include <map_fragment>', `
        gdx = dFdx(vec2(vWorldPosT.x, -vWorldPosT.z));
        gdy = dFdy(vec2(vWorldPosT.x, -vWorldPosT.z));
        float w0[8];
        w0[0]=vSplatA.x; w0[1]=vSplatA.y; w0[2]=vSplatA.z; w0[3]=vSplatA.w;
        w0[4]=vSplatB.x; w0[5]=vSplatB.y; w0[6]=vSplatB.z; w0[7]=vSplatB.w;
        float sc[8];
        sc[0]=uScaleA.x; sc[1]=uScaleA.y; sc[2]=uScaleA.z; sc[3]=uScaleA.w;
        sc[4]=uScaleB.x; sc[5]=uScaleB.y; sc[6]=uScaleB.z; sc[7]=uScaleB.w;
        vec3 tnorm = vec3(0.0);
        float wsum = 0.0;
        vec3 col = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          if (w0[i] < 0.004) continue;
          vec4 d = sampleLayer(uDiff, float(i), sc[i]);
          vec3 n = sampleLayer(uNor, float(i), sc[i]).xyz * 2.0 - 1.0;
          vec3 tintL = i == 7 ? vec3(1.08, 1.05, 1.0) : i == 4 ? vec3(1.12, 1.08, 1.0) : vec3(1.0);
          d.rgb *= tintL;
          float h = dot(d.rgb, vec3(0.333));
          float w = w0[i] * pow(h + 0.35, 4.0);
          w = w0[i] < 0.995 ? w : 10.0;
          col += d.rgb * w;
          tnorm += n * w;
          wsum += w;
        }
        col /= max(wsum, 1e-4);
        tnorm /= max(wsum, 1e-4);
        col = mix(col, col * uSeasonTint, vSplatA.x + vSplatA.y * 0.6);
        // Spring meadows: push the photo grass toward fresh green (the source photo is half dry).
        col = mix(col, col * vec3(0.78, 1.18, 0.62), uGreen * vSplatA.x * 0.85);
        // Meadow seen from afar reads as the colour of its grass, not the soil between blades.
        vec3 meadow = mix(vec3(0.17, 0.25, 0.06), vec3(0.42, 0.38, 0.2), 1.0 - uGreen);
        col = mix(col, meadow, vSplatA.x * 0.62);
        // Pull photo albedo toward the painterly palette: a little less red, a little less saturated.
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, mix(0.78, 1.0, vSplatA.x)) * vec3(1.0, 0.98, 0.95);
        float macro = textureGrad(uDiff, vec3(vec2(vWorldPosT.x, -vWorldPosT.z) / 160.0, 1.0), gdx / 160.0, gdy / 160.0).r;
        col *= mix(0.85, 1.12, macro);
        // Farmland beyond the precinct: a patchwork of parcels (wheat, ploughed earth, vineyards, fallow),
        // edged by darker field boundaries. Only on open ground, fading in away from the Academy.
        {
          vec2 wp2 = vec2(vWorldPosT.x, vWorldPosT.z);
          float away = smoothstep(260.0, 360.0, length(wp2 - vec2(-30.0, -60.0))) * smoothstep(110.0, 170.0, length(wp2 - vec2(445.0, 505.0)));
          float open = (vSplatA.x + vSplatA.y) * (1.0 - vSplatB.w) * (1.0 - vSplatB.z);
          float fw = away * open;
          if (fw > 0.01) {
            float ang = 0.35;
            vec2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * wp2;
            vec2 cellSize = vec2(95.0, 62.0);
            vec2 cid = floor(r / cellSize);
            vec2 f = fract(r / cellSize);
            float hsh = fract(sin(dot(cid, vec2(127.1, 311.7))) * 43758.5453);
            float hsh2 = fract(sin(dot(cid, vec2(269.5, 183.3))) * 43758.5453);
            vec3 fieldC;
            if (hsh < 0.3) fieldC = mix(vec3(0.62, 0.52, 0.27), vec3(0.7, 0.6, 0.33), hsh2);          // ripe wheat / barley
            else if (hsh < 0.48) fieldC = mix(vec3(0.34, 0.25, 0.17), vec3(0.42, 0.31, 0.21), hsh2);  // ploughed earth
            else if (hsh < 0.66) {                                                                       // vineyard rows
              float rowS = smoothstep(0.35, 0.5, abs(fract(r.y / 2.2) - 0.5) * 2.0);
              fieldC = mix(vec3(0.22, 0.28, 0.1), vec3(0.4, 0.31, 0.2), rowS);
            } else fieldC = col;                                                                         // fallow pasture
            float edge = min(min(f.x, 1.0 - f.x) * cellSize.x, min(f.y, 1.0 - f.y) * cellSize.y);
            fieldC = mix(fieldC * 0.62, fieldC, smoothstep(0.6, 2.2, edge)); // hedge or rubble wall
            col = mix(col, fieldC, fw * 0.85);
          }
        }
        col *= mix(1.0, 0.7, uWetness * (vSplatB.y + vSplatA.z + vSplatB.w));
        diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Ground UV frame: T = +X, B = -Z, N = up (see terrainUv). Perturb the geometric normal.
        vec3 geoN = normalize((vec4(normal, 0.0) * viewMatrix).xyz); // transpose = inverse for a rotation
        vec3 pert = vec3(tnorm.x, 0.0, -tnorm.y) * 0.9;
        vec3 worldN = normalize(geoN + pert);
        normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness - 0.2 * uWetness - 0.15 * vSplatB.z;');
  };
  return mat;
}
