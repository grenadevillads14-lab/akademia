import { closestOnPolyline, rectDistance } from '../procgen/geometry2d';
import { fbm, lerp, ridged, smoothstep } from '../procgen/noise';
import type { Layout, Surface } from './layout';

/**
 * The analytic terrain: height and ground surface as pure functions of (x, z), derived from the layout data.
 * The mesh, the physics heightfield, grass placement and gameplay queries (water depth, "am I on a path?")
 * all sample the same functions, so they always agree.
 */

/** Ground layers blended in the terrain shader, in attribute order. */
export const SURFACE_LAYERS = ['grass', 'dry', 'dirt', 'rock', 'sand', 'mud', 'paving', 'road'] as const;
export type SurfaceWeights = Float32Array; // length = SURFACE_LAYERS.length

const layerIndex: Record<Surface, number> = {
  grass: 0,
  dry: 1,
  dirt: 2,
  rock: 3,
  sand: 4,
  mud: 5,
  paving: 6,
  road: 7,
  track: 2,
};

export interface WaterInfo {
  /** World-space water surface height, or -Infinity where there is no water. */
  level: number;
  /** Id of the river or channel. */
  id: string | null;
  /** Flow direction (unit vector along the water course). */
  flowX: number;
  flowZ: number;
}

export interface Heightfield {
  height(x: number, z: number): number;
  surface(x: number, z: number, out?: SurfaceWeights): SurfaceWeights;
  water(x: number, z: number): WaterInfo;
  /** 0..1 how much grass may grow here (no grass on paths, sand, water, paving). */
  grassDensity(x: number, z: number): number;
  readonly layout: Layout;
}

export function createHeightfield(layout: Layout): Heightfield {
  const t = layout.terrain;
  const seed = layout.seed;

  const natural = (x: number, z: number): number => {
    let h = t.base + x * t.slopeX + z * t.slopeZ + fbm(x * t.noiseScale, z * t.noiseScale, 4, seed) * t.noiseAmp;
    for (const hill of layout.hills) {
      const d = Math.hypot(x - hill.x, z - hill.z) / hill.radius;
      if (d < 1) {
        const shape = Math.pow(Math.cos((d * Math.PI) / 2), 2); // smooth dome
        const rock = hill.rocky > 0 ? ridged(x * 0.02, z * 0.02, 3, seed + 9) * hill.rocky * 0.35 : 0;
        h += hill.height * shape * (1 + rock);
      }
    }
    return h;
  };

  const height = (x: number, z: number): number => {
    let h = natural(x, z);

    // Flats: blend toward the level of their centre (or an explicit height).
    for (const f of layout.flats) {
      const d = rectDistance(x, z, f.x, f.z, f.hw, f.hd, f.rot ?? 0);
      if (d < f.margin) {
        const target = f.height ?? natural(f.x, f.z);
        const w = 1 - smoothstep(0, f.margin, d);
        h = lerp(h, target, w);
      }
    }

    // Paths are slightly flattened toward their centreline height.
    for (const p of layout.paths) {
      const hit = closestOnPolyline(x, z, p.points);
      const edge = p.width * 0.5 + 2;
      if (hit.dist < edge) {
        const centre = natural(hit.x, hit.z);
        h = lerp(h, centre, (1 - smoothstep(p.width * 0.5, edge, hit.dist)) * 0.7);
      }
    }

    // Rivers carve a channel with sloping banks.
    for (const r of layout.rivers) {
      const hit = closestOnPolyline(x, z, r.points);
      const half = r.width * 0.5;
      if (hit.dist < half + r.bank) {
        const banksLevel = natural(hit.x, hit.z) + r.waterLevelOffset;
        const bed = banksLevel - r.depth;
        const inner = 1 - smoothstep(half * 0.4, half, hit.dist); // 1 in the middle of the bed
        const bankBlend = 1 - smoothstep(half, half + r.bank, hit.dist);
        const carved = lerp(banksLevel + 0.2, bed, inner);
        h = lerp(h, Math.min(h, carved), bankBlend);
      }
    }

    // Irrigation channels: narrow stone-lined trenches.
    for (const c of layout.channels) {
      const hit = closestOnPolyline(x, z, c.points);
      const half = c.width * 0.5;
      if (hit.dist < half + 0.6) {
        const w = 1 - smoothstep(half, half + 0.6, hit.dist);
        h -= c.depth * w;
      }
    }
    return h;
  };

  const surface = (x: number, z: number, out: SurfaceWeights = new Float32Array(SURFACE_LAYERS.length)): SurfaceWeights => {
    out.fill(0);
    // Base: green near water and in the grove, drier toward the city and on hill slopes.
    const n = fbm(x * 0.02, z * 0.02, 3, seed + 3) * 0.5 + 0.5;
    const nearRiver = layout.rivers.reduce((m, r) => Math.min(m, closestOnPolyline(x, z, r.points).dist), Infinity);
    const wet = 1 - smoothstep(30, 220, nearRiver);
    let dry = smoothstep(0.45, 0.85, n) * (1 - wet) * 0.6;
    for (const hill of layout.hills) {
      const d = Math.hypot(x - hill.x, z - hill.z) / hill.radius;
      if (d < 1 && hill.rocky > 0) {
        const rock = smoothstep(0.75, 0.2, d) * hill.rocky * smoothstep(0.45, 0.65, ridged(x * 0.03, z * 0.03, 2, seed + 4));
        out[3] = Math.max(out[3]!, rock);
        dry = Math.max(dry, (1 - d) * 0.8);
      }
    }
    out[0] = 1 - dry;
    out[1] = dry;

    for (const r of layout.rivers) {
      const hit = closestOnPolyline(x, z, r.points);
      const m = 1 - smoothstep(r.width * 0.5, r.width * 0.5 + r.bank * 0.7, hit.dist);
      if (m > 0) out[5] = Math.max(out[5]!, m);
    }
    for (const p of layout.paths) {
      const hit = closestOnPolyline(x, z, p.points);
      const edgeNoise = fbm(x * 0.3, z * 0.3, 2, seed + 7) * 0.8;
      const m = 1 - smoothstep(p.width * 0.5 - 0.6, p.width * 0.5 + 0.8, hit.dist + edgeNoise);
      if (m > 0) {
        const li = layerIndex[p.surface];
        out[li] = Math.max(out[li]!, m);
      }
    }
    for (const f of layout.flats) {
      if (f.surface === 'grass') continue;
      const d = rectDistance(x, z, f.x, f.z, f.hw, f.hd, f.rot ?? 0);
      const m = 1 - smoothstep(-0.5, 1.5, d);
      if (m > 0) {
        const li = layerIndex[f.surface];
        out[li] = Math.max(out[li]!, m);
      }
    }
    for (const c of layout.channels) {
      const hit = closestOnPolyline(x, z, c.points);
      const m = 1 - smoothstep(c.width * 0.5, c.width * 0.5 + 1.5, hit.dist);
      if (m > 0) out[5] = Math.max(out[5]!, m * 0.8);
    }

    // Overlays win over the base: scale base layers down by the strongest overlay.
    let overlay = 0;
    for (let i = 2; i < out.length; i++) overlay = Math.max(overlay, out[i]!);
    out[0] = out[0]! * (1 - overlay);
    out[1] = out[1]! * (1 - overlay);
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += out[i]!;
    if (sum > 0) for (let i = 0; i < out.length; i++) out[i] = out[i]! / sum;
    return out;
  };

  const water = (x: number, z: number): WaterInfo => {
    for (const r of layout.rivers) {
      const hit = closestOnPolyline(x, z, r.points);
      if (hit.dist < r.width * 0.5 + 1) {
        const a = r.points[hit.segment]!;
        const b = r.points[hit.segment + 1]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return {
          level: natural(hit.x, hit.z) + r.waterLevelOffset - 0.15,
          id: r.id,
          flowX: (b[0] - a[0]) / len,
          flowZ: (b[1] - a[1]) / len,
        };
      }
    }
    return { level: -Infinity, id: null, flowX: 0, flowZ: 0 };
  };

  const scratch = new Float32Array(SURFACE_LAYERS.length);
  const grassDensity = (x: number, z: number): number => {
    const s = surface(x, z, scratch);
    return Math.max(0, 1 - (s[2]! + s[3]! + s[4]! + s[5]! * 0.6 + s[6]! + s[7]!) * 1.4);
  };

  return { height, surface, water, grassDensity, layout };
}
