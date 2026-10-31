import * as THREE from 'three';
import { mulberry32 } from '../procgen/rng';
import { WIND_GLSL } from '../world/wind';
import type { Terrain } from '../world/terrain';
import type { WorldUniforms } from '../world/uniforms';

/**
 * GPU grass: tiles of blades instanced around the player. Blades read terrain height and a grass-density
 * mask from the terrain's baked textures, sway with the global wind, bend away from the player, and
 * shrink to nothing at the edge of the radius (no popping). One draw call.
 */
export interface Grass {
  readonly mesh: THREE.InstancedMesh;
  update(focus: THREE.Vector3): void;
  dispose(): void;
}

const TILE = 8; // metres

export function createGrass(terrain: Terrain, u: WorldUniforms, opts: { density: number; radius: number }): Grass {
  const blades = Math.round(2400 * opts.density); // per tile (≈ 37 per m² at full density)
  const rng = mulberry32(77);
  const pos: number[] = [];
  const blade: number[] = []; // per vertex: local x, z, random, height factor
  const idx: number[] = [];
  for (let b = 0; b < blades; b++) {
    const bx = rng() * TILE;
    const bz = rng() * TILE;
    const r = rng();
    const h = 0.28 + Math.pow(rng(), 1.6) * 0.75;
    const w = 0.03 + rng() * 0.03;
    const a = rng() * Math.PI;
    const ca = Math.cos(a) * w;
    const sa = Math.sin(a) * w;
    const base = pos.length / 3;
    // 5 vertices: two pairs along the blade and a tip. y holds height fraction 0..1.
    const levels = [0, 0.45, 1] as const;
    for (const lv of levels) {
      if (lv === 1) {
        pos.push(0, 1, 0);
        blade.push(bx, bz, r, h);
      } else {
        const taper = 1 - lv * 0.6;
        pos.push(-ca * taper, lv, -sa * taper, ca * taper, lv, sa * taper);
        blade.push(bx, bz, r, h, bx, bz, r, h);
      }
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(TILE / 2, 0, TILE / 2), 1e5); // positioned on GPU

  const tilesAcross = Math.ceil((opts.radius * 2) / TILE) + 1;
  const count = tilesAcross * tilesAcross;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  const uRadius = { value: opts.radius };
  const uDensity = { value: Math.min(1, opts.density) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.time;
    shader.uniforms.uWindDir = u.windDir;
    shader.uniforms.uWindStrength = u.windStrength;
    shader.uniforms.uGust = u.gust;
    shader.uniforms.uPlayer = u.playerPos;
    shader.uniforms.uFocus = u.focusPos;
    shader.uniforms.uHeight = { value: terrain.heightTexture };
    shader.uniforms.uMask = { value: terrain.grassTexture };
    shader.uniforms.uRect = { value: terrain.textureRect };
    shader.uniforms.uRadius = uRadius;
    shader.uniforms.uDensity = uDensity;
    shader.uniforms.uSeasonTint = u.seasonTint;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         ${WIND_GLSL}
         attribute vec4 aBlade;
         uniform vec3 uPlayer;
         uniform vec3 uFocus;
         uniform sampler2D uHeight;
         uniform sampler2D uMask;
         uniform vec4 uRect;
         uniform float uRadius;
         uniform float uDensity;
         varying float vTipT;
         varying float vRand;
         varying vec2 vGrassXZ;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 tileOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
         vec2 wxz = tileOrigin.xz + aBlade.xy;
         vec2 tuv = (wxz - uRect.xy) / uRect.zw;
         float ground = texture2D(uHeight, tuv).r;
         float mask = texture2D(uMask, tuv).r;
         float dist = distance(wxz, uFocus.xz);
         float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius, dist);
         float lodKeep = mix(1.0, 0.3, smoothstep(10.0, uRadius, dist)); // thin out with distance
         float alive = step(aBlade.z, mask * uDensity * lodKeep) * fade;
         float h = aBlade.w * alive * (0.6 + 0.6 * mask);
         // Dead or faded blades collapse to a point (a zero-height blade still rasterises as a dark sliver).
         float widthK = alive > 0.0 ? 1.0 : 0.0;
         vec3 transformed = vec3(position.x * widthK, position.y * h, position.z * widthK);
         // Wind and the player's feet push blades over; the tip moves most.
         vec2 sway = windSway(vec3(wxz.x, ground, wxz.y), position.y, 1.4) * 0.35;
         vec2 away = wxz - uPlayer.xz;
         float push = (1.0 - smoothstep(0.2, 1.3, length(away))) * step(abs(uPlayer.y - ground), 2.0);
         sway += normalize(away + 1e-4) * push * 0.55;
         transformed.xz += sway * position.y * h * 2.0;
         transformed.y -= length(sway) * position.y * h * 0.5;
         transformed += vec3(wxz.x, ground, wxz.y) - tileOrigin;
         vTipT = position.y;
         vRand = aBlade.z;
         vGrassXZ = wxz;`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSeasonTint;
         varying float vTipT;
         varying float vRand;
         varying vec2 vGrassXZ;
         float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
         float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
           return mix(mix(gh(i),gh(i+vec2(1,0)),f.x), mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x), f.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `// Patches: lush green near water and shade, straw-dry elsewhere; per-blade jitter.
         float patchN = gn(vGrassXZ * 0.08) * 0.7 + gn(vGrassXZ * 0.35) * 0.3;
         vec3 rootC = vec3(0.10, 0.16, 0.05);
         vec3 green = mix(vec3(0.30, 0.48, 0.12), vec3(0.45, 0.58, 0.18), vRand);
         vec3 dry = mix(vec3(0.62, 0.55, 0.28), vec3(0.75, 0.66, 0.38), vRand);
         vec3 tipC = mix(green, dry, smoothstep(0.45, 0.8, patchN) * 0.85);
         vec3 c = mix(rootC, tipC, smoothstep(0.0, 0.9, vTipT)) * uSeasonTint;
         // Spring flowers on a few blade tips: poppies, chamomile, wild anise (docs/RESEARCH.md §12).
         float flower = step(0.985, vRand) * step(0.82, vTipT);
         float kind = fract(vRand * 97.0);
         vec3 fc = kind < 0.4 ? vec3(0.85, 0.12, 0.08) : kind < 0.75 ? vec3(0.95, 0.94, 0.88) : vec3(0.92, 0.82, 0.25);
         diffuseColor.rgb = mix(c, fc, flower * uSeasonTint.g);`,
      );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'grass';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  let lastX = Infinity;
  let lastZ = Infinity;

  return {
    mesh,
    update(focus) {
      const cx = Math.floor(focus.x / TILE);
      const cz = Math.floor(focus.z / TILE);
      if (cx === lastX && cz === lastZ) return;
      lastX = cx;
      lastZ = cz;
      const half = Math.floor(tilesAcross / 2);
      let k = 0;
      for (let j = -half; j < tilesAcross - half; j++) {
        for (let i = -half; i < tilesAcross - half; i++) {
          m.makeTranslation((cx + i) * TILE, 0, (cz + j) * TILE);
          mesh.setMatrixAt(k++, m);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
