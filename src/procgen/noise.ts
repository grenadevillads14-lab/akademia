import { hash2 } from './rng';

/**
 * 2D gradient noise (Perlin-style, quintic fade) in roughly [-1, 1], plus fbm and ridged variants.
 * Pure functions; deterministic for a given seed.
 */
const GRADS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function grad(ix: number, iy: number, seed: number, dx: number, dy: number): number {
  const g = GRADS[Math.floor(hash2(ix, iy, seed) * 8) & 7]!;
  return g[0] * dx + g[1] * dy;
}

export function noise2(x: number, y: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fade(fx);
  const v = fade(fy);
  const n00 = grad(x0, y0, seed, fx, fy);
  const n10 = grad(x0 + 1, y0, seed, fx - 1, fy);
  const n01 = grad(x0, y0 + 1, seed, fx, fy - 1);
  const n11 = grad(x0 + 1, y0 + 1, seed, fx - 1, fy - 1);
  const nx0 = n00 + u * (n10 - n00);
  const nx1 = n01 + u * (n11 - n01);
  return (nx0 + v * (nx1 - nx0)) * 1.4142;
}

export function fbm(x: number, y: number, octaves = 4, seed = 0, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]: sharp crests, for rocky hills. */
export function ridged(x: number, y: number, octaves = 4, seed = 0): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x * freq, y * freq, seed + i * 57));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Gradient noise that tiles with period (px, py) in lattice units, for seamless textures. */
export function noise2Periodic(x: number, y: number, px: number, py: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fade(fx);
  const v = fade(fy);
  const wx = (i: number) => ((i % px) + px) % px;
  const wy = (i: number) => ((i % py) + py) % py;
  const n00 = grad(wx(x0), wy(y0), seed, fx, fy);
  const n10 = grad(wx(x0 + 1), wy(y0), seed, fx - 1, fy);
  const n01 = grad(wx(x0), wy(y0 + 1), seed, fx, fy - 1);
  const n11 = grad(wx(x0 + 1), wy(y0 + 1), seed, fx - 1, fy - 1);
  const nx0 = n00 + u * (n10 - n00);
  const nx1 = n01 + u * (n11 - n01);
  return (nx0 + v * (nx1 - nx0)) * 1.4142;
}

/** Tileable fbm over the unit square: u, v in [0,1), base period in lattice cells. */
export function fbmTile(u: number, v: number, period: number, octaves = 4, seed = 0): number {
  let amp = 1;
  let p = period;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2Periodic(u * p, v * p, p, p, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

export const smoothstep =(e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
