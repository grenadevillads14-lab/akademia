import * as THREE from 'three';
import { fbmTile, smoothstep } from '../procgen/noise';
import { hash2 } from '../procgen/rng';

/**
 * Procedural, seamlessly tiling ground textures packed into one texture array
 * (layer order = SURFACE_LAYERS in heightfield.ts). Painterly rather than photographic:
 * a few colour bands broken up by noise. Generated once at boot in ~100 ms.
 * These are replacement candidates for Poly Haven CC0 textures (see ASSETS.md).
 */
type Rgb = [number, number, number];
type Painter = (u: number, v: number) => Rgb;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const painters: Painter[] = [
  // 0 grass: lush spring green with darker clumps and a few flower specks
  (u, v) => {
    const n = fbmTile(u, v, 6, 4, 11) * 0.5 + 0.5;
    const blades = fbmTile(u * 1.0, v * 3.0, 24, 2, 12) * 0.5 + 0.5;
    let c = mix([62, 92, 38], [104, 132, 52], n);
    c = mix(c, [44, 70, 30], smoothstep(0.55, 0.9, blades) * 0.5);
    const speck = hash2(Math.floor(u * 256), Math.floor(v * 256), 13);
    if (speck > 0.997) c = [220, 210, 120];
    return c;
  },
  // 1 dry grass / summer meadow: straw and ochre
  (u, v) => {
    const n = fbmTile(u, v, 6, 4, 21) * 0.5 + 0.5;
    const s = fbmTile(u, v * 3, 20, 2, 22) * 0.5 + 0.5;
    let c = mix([150, 128, 72], [196, 170, 102], n);
    c = mix(c, [120, 104, 60], smoothstep(0.6, 0.9, s) * 0.6);
    return c;
  },
  // 2 dirt path: packed reddish-brown earth with pebbles
  (u, v) => {
    const n = fbmTile(u, v, 5, 4, 31) * 0.5 + 0.5;
    let c = mix([128, 96, 66], [160, 124, 88], n);
    const p = hash2(Math.floor(u * 128), Math.floor(v * 128), 32);
    if (p > 0.96) c = mix(c, [190, 176, 150], 0.7);
    if (p < 0.03) c = mix(c, [92, 70, 50], 0.6);
    return c;
  },
  // 3 rock: pale grey limestone with ochre stains and dark cracks
  (u, v) => {
    const n = fbmTile(u, v, 4, 5, 41) * 0.5 + 0.5;
    const crack = Math.abs(fbmTile(u, v, 8, 3, 42));
    let c = mix([150, 144, 132], [196, 188, 172], n);
    c = mix(c, [176, 150, 108], smoothstep(0.6, 0.85, fbmTile(u, v, 3, 2, 43) * 0.5 + 0.5) * 0.5);
    c = mix(c, [90, 84, 76], (1 - smoothstep(0.0, 0.05, crack)) * 0.7);
    return c;
  },
  // 4 sand: fine pale palaestra sand
  (u, v) => {
    const n = fbmTile(u, v, 12, 3, 51) * 0.5 + 0.5;
    const g = hash2(Math.floor(u * 256), Math.floor(v * 256), 52);
    return mix([206, 184, 140], [226, 208, 166], n * 0.7 + g * 0.3);
  },
  // 5 mud / river bank: dark wet earth with green tinge
  (u, v) => {
    const n = fbmTile(u, v, 6, 4, 61) * 0.5 + 0.5;
    return mix([70, 62, 46], [102, 96, 64], n);
  },
  // 6 paving: irregular limestone slabs with dark joints
  (u, v) => {
    const cells = 4;
    const x = u * cells;
    const y = v * cells;
    const row = Math.floor(y);
    const off = (row % 2) * 0.5;
    const fx = (x + off) % 1;
    const fy = y % 1;
    const joint = Math.min(fx, 1 - fx, fy, 1 - fy);
    const tone = hash2(Math.floor(x + off) % cells, row, 71);
    const n = fbmTile(u, v, 8, 3, 72) * 0.5 + 0.5;
    let c = mix([170, 160, 140], [204, 194, 172], tone * 0.6 + n * 0.4);
    c = mix(c, [96, 88, 74], 1 - smoothstep(0.0, 0.035, joint));
    return c;
  },
  // 7 road: wide packed earth with cart ruts and gravel
  (u, v) => {
    const n = fbmTile(u, v, 5, 4, 81) * 0.5 + 0.5;
    let c = mix([150, 122, 90], [176, 148, 112], n);
    const rut = Math.abs(Math.sin(u * Math.PI * 4));
    c = mix(c, [124, 98, 72], (1 - smoothstep(0.0, 0.18, rut)) * 0.35);
    const p = hash2(Math.floor(u * 200), Math.floor(v * 200), 82);
    if (p > 0.95) c = mix(c, [205, 196, 178], 0.6);
    return c;
  },
];

export const GROUND_LAYER_COUNT = painters.length;

export function createGroundTextureArray(size = 256): THREE.DataArrayTexture {
  const data = new Uint8Array(size * size * 4 * painters.length);
  for (let layer = 0; layer < painters.length; layer++) {
    const paint = painters[layer]!;
    const base = layer * size * size * 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [r, g, b] = paint(x / size, y / size);
        const i = base + (y * size + x) * 4;
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
        data[i + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataArrayTexture(data, size, size, painters.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
