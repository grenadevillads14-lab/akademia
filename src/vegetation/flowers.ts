import * as THREE from 'three';
import { noise2 } from '../procgen/noise';
import { mulberry32 } from '../procgen/rng';
import type { Heightfield } from '../world/heightfield';
import type { WorldUniforms } from '../world/uniforms';

/**
 * Attic spring wildflowers around the player (docs/RESEARCH.md §12): corn poppies (Papaver rhoeas), chamomile
 * (Anthemis), anemones (Anemone coronaria, violet and scarlet) and crown daisies (Glebionis coronaria). They grow
 * in drifts: a low-frequency noise picks the species and the density, so a meadow has a red patch here and a
 * white one there instead of confetti. Placed per 8 m tile on grassy ground, re-laid as the player moves; one
 * draw call. Heads open with the season (WorldUniforms.greenness) and the stems sway with the wind.
 */
const TILE = 8;
const CELLS = 5; // poppy, chamomile, anemone, daisy, stem

export interface Flowers {
  readonly mesh: THREE.InstancedMesh;
  update(focus: THREE.Vector3): void;
  dispose(): void;
}

function petalAtlas(): THREE.CanvasTexture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S * CELLS;
  cv.height = S;
  const g = cv.getContext('2d')!;
  const flower = (cx: number, petals: number, len: number, wid: number, colA: string, colB: string, centre: string, centreR: number, cup = 0) => {
    g.save();
    g.translate(cx + S / 2, S / 2);
    for (let i = 0; i < petals; i++) {
      g.save();
      g.rotate((i / petals) * Math.PI * 2 + (i % 2) * 0.12);
      const grad = g.createLinearGradient(0, 0, 0, -len);
      grad.addColorStop(0, colB);
      grad.addColorStop(0.35, colA);
      grad.addColorStop(1, colA);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-wid, -len * 0.35, -wid * (1 - cup), -len, 0, -len);
      g.bezierCurveTo(wid * (1 - cup), -len, wid, -len * 0.35, 0, 0);
      g.fill();
      // Petal veins.
      g.strokeStyle = 'rgba(0,0,0,0.08)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -4);
      g.lineTo(0, -len * 0.85);
      g.stroke();
      g.restore();
    }
    g.fillStyle = centre;
    g.beginPath();
    g.arc(0, 0, centreR, 0, Math.PI * 2);
    g.fill();
    // Stamens / disc florets.
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const r = Math.sqrt(i / 18) * centreR * 0.8;
      g.fillRect(Math.cos(a) * r - 1, Math.sin(a) * r - 1, 2, 2);
    }
    g.restore();
  };
  // Poppy: four broad scarlet petals with a dark blotch at the base.
  flower(0, 4, 58, 50, '#d8251a', '#3a0d0a', '#1c1410', 9, 0.1);
  // Chamomile: many narrow white rays, a domed yellow disc.
  flower(S, 16, 50, 9, '#f6f3ea', '#e9e6dc', '#e2b21c', 15);
  // Anemone: six rounded violet petals, white ring, inky centre.
  flower(S * 2, 6, 54, 34, '#7b3fa0', '#efe6f2', '#1a1424', 11);
  // Crown daisy: golden rays with a paler tip.
  flower(S * 3, 14, 52, 12, '#f2c21e', '#e8a614', '#c98a12', 13);
  // Stem: green with a darker edge.
  const sg = g.createLinearGradient(S * 4, 0, S * 5, 0);
  sg.addColorStop(0, '#2f4a1c');
  sg.addColorStop(0.5, '#5f8a36');
  sg.addColorStop(1, '#2f4a1c');
  g.fillStyle = sg;
  g.fillRect(S * 4, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Stem (a thin quad, 0..1 tall; instances face random ways) and head (a tilted disc + a small cross), part flag in aPart. */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], u0: number, u1: number, p: number) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    part.push(p, p, p, p);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const w = 0.009;
  const su0 = 4 / CELLS + 0.02;
  const su1 = 5 / CELLS - 0.02;
  quad([-w, 0, 0], [w, 0, 0], [w, 1, 0], [-w, 1, 0], su0, su1, 0);
  // Head disc, in the unit cell (u 0..1/CELLS, chosen per instance), radius 1, centred at y = 1.
  const r = 1;
  const tilt = 0.35;
  const y = (z: number) => 1 + z * Math.sin(tilt);
  quad([-r, y(-r), -r * Math.cos(tilt)], [r, y(-r), -r * Math.cos(tilt)], [r, y(r), r * Math.cos(tilt)], [-r, y(r), r * Math.cos(tilt)], 0, 1 / CELLS, 1);
  // A second, steeper disc across the first: reads as a flower from the side too.
  const h = 0.55;
  quad([0, 1 - h * 0.2, -r], [0, 1 - h * 0.2, r], [0, 1 + h * 0.8, r], [0, 1 + h * 0.8, -r], 0, 1 / CELLS, 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Normals point up: flowers are lit like the meadow around them, not like flat cards.
  const n = geo.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return geo;
}

export function createFlowers(hf: Heightfield, u: WorldUniforms, opts: { radius: number; density: number }): Flowers {
  const across = Math.ceil((opts.radius * 2) / TILE) + 1;
  const tiles = across * across;
  const perTile = Math.round(500 * opts.density);
  const atlas = petalAtlas();
  const geo = flowerGeometry();
  // Per instance: [cell, head radius / height, phase, unused].
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(tiles * perTile * 4), 4);
  geo.setAttribute('aFlower', attr);
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.time;
    sh.uniforms.uWindDir = u.windDir;
    sh.uniforms.uWind = u.windStrength;
    sh.uniforms.uBloom = u.greenness;
    sh.uniforms.uFocus = u.focusPos;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPart;
        attribute vec4 aFlower;
        uniform float uTime; uniform vec2 uWindDir; uniform float uWind; uniform float uBloom; uniform vec3 uFocus;
        varying float vPart;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vPart = aPart;
        if (aPart > 0.5) vMapUv.x += aFlower.x / ${CELLS}.0;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Heads: scale about the stem top (instance scale is the stem height; aFlower.y the head radius ratio).
        float open = clamp(uBloom * 1.4 - 0.15, 0.0, 1.0);
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float fade = 1.0 - smoothstep(${(opts.radius * 0.7).toFixed(1)}, ${opts.radius.toFixed(1)}, distance(ip.xz, uFocus.xz));
        if (aPart > 0.5) transformed = vec3(0.0, 1.0, 0.0) + (transformed - vec3(0.0, 1.0, 0.0)) * vec3(aFlower.y, aFlower.y, aFlower.y) * open * fade;
        else transformed.xz *= fade;
        // Sway: the top moves most, gusts roll through the meadow.
        float h = transformed.y * transformed.y;
        float sw = sin(uTime * 2.1 + aFlower.z + dot(ip.xz, vec2(0.21, 0.17))) * 0.5 + sin(uTime * 3.7 + aFlower.z * 2.0) * 0.2;
        transformed.xz += (uWindDir * (0.35 + sw) * uWind * 0.12 + vec2(sw * 0.02)) * h;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPart;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Petals are thin: light comes through them (a little glow, not a hard card).
        if (vPart > 0.5) totalEmissiveRadiance += diffuseColor.rgb * 0.22;`,
      )
      // Both faces keep the upward normal (a flipped back face would turn the petals black).
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => 'flowers';
  const mesh = new THREE.InstancedMesh(geo, mat, tiles * perTile);
  mesh.name = 'flowers';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const slotKey: (string | null)[] = new Array(tiles).fill(null);
  let lastX = Infinity;
  let lastZ = Infinity;

  const layTile = (tx: number, tz: number, slot: number) => {
    const rng = mulberry32((tx * 92837111) ^ (tz * 689287499) ^ 0xf10);
    for (let i = 0; i < perTile; i++) {
      const x = (tx + rng()) * TILE;
      const z = (tz + rng()) * TILE;
      // Drifts: density and species follow slow noise fields.
      const drift = noise2(x * 0.045, z * 0.045) * 0.6 + noise2(x * 0.13 + 7.1, z * 0.13 - 3.3) * 0.4;
      const grass = hf.grassDensity(x, z);
      const keep = grass > 0.25 && rng() < Math.max(0, drift * 2.2 + 0.12) * grass && hf.water(x, z).level < hf.height(x, z) - 0.05;
      const k = slot * perTile + i;
      if (!keep) {
        m.makeScale(0, 0, 0);
        mesh.setMatrixAt(k, m);
        continue;
      }
      const sp = noise2(x * 0.02 + 40, z * 0.02 - 11);
      const r = rng();
      const cell = sp > 0.25 ? (r < 0.8 ? 0 : 1) : sp > -0.1 ? (r < 0.6 ? 1 : r < 0.85 ? 3 : 0) : sp > -0.35 ? (r < 0.65 ? 2 : 1) : r < 0.7 ? 3 : 1;
      const height = (cell === 0 ? 0.55 : cell === 2 ? 0.36 : 0.45) * (0.75 + rng() * 0.5);
      // Heads a little larger than life: at walking distance a 5 cm poppy is only a few pixels.
      const head = (cell === 0 ? 0.085 : cell === 2 ? 0.07 : 0.055) * (0.8 + rng() * 0.4);
      p.set(x, hf.height(x, z) - 0.01, z);
      e.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
      q.setFromEuler(e);
      s.set(height, height, height);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      attr.setXYZW(k, cell, head / height, rng() * 6.28, 0);
    }
  };

  return {
    mesh,
    update(focus) {
      const cx = Math.floor(focus.x / TILE);
      const cz = Math.floor(focus.z / TILE);
      if (cx === lastX && cz === lastZ) return;
      lastX = cx;
      lastZ = cz;
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
      mesh.instanceMatrix.needsUpdate = true;
      attr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      atlas.dispose();
    },
  };
}
