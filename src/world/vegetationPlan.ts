import { z } from 'zod';
import { closestOnPolyline, polylineLength, rectDistance, samplePolyline } from '../procgen/geometry2d';
import { mulberry32 } from '../procgen/rng';
import type { Plant } from '../vegetation/forest';
import type { SpeciesId } from '../vegetation/species';
import type { Heightfield } from './heightfield';

/**
 * Turns the data-driven planting plan (content/world/<world>.vegetation.json) into concrete plants.
 * Pure and deterministic, so it is unit-tested (no trees on paths, moriai at their fixed places).
 */
const species = z.enum(['olive', 'moria', 'plane', 'plane_ancient', 'cypress', 'fig', 'pomegranate', 'myrtle', 'laurel', 'reed']);
const circle = z.tuple([z.number(), z.number(), z.number()]);

const Rule = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('points'),
    species,
    items: z.array(z.object({ id: z.string(), x: z.number(), z: z.number(), scale: z.number().optional(), rot: z.number().optional() })),
  }),
  z.object({
    type: z.literal('along'),
    species,
    path: z.string().optional(),
    channel: z.string().optional(),
    spacing: z.number(),
    offset: z.number(),
    sides: z.enum(['both', 'left', 'right']),
    jitter: z.number().default(0),
  }),
  z.object({ type: z.literal('ring'), species, center: z.tuple([z.number(), z.number()]), radius: z.number(), count: z.number(), jitter: z.number().default(0) }),
  z.object({
    type: z.literal('rows'),
    species,
    origin: z.tuple([z.number(), z.number()]),
    rows: z.number(),
    cols: z.number(),
    dx: z.number(),
    dz: z.number(),
    jitter: z.number().default(0),
  }),
  z.object({
    /** Rotated rows of trees in a rectangle (orchards), with gaps, skipping paths, buildings and water. */
    type: z.literal('orchard'),
    species,
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    rot: z.number().default(0),
    dx: z.number(),
    dz: z.number(),
    fill: z.number().default(0.9),
    jitter: z.number().default(0.8),
    avoidPaths: z.number().default(5),
    avoidWater: z.number().default(5),
    exclude: z.array(circle).default([]),
    seed: z.number().default(1),
  }),
  z.object({
    type: z.literal('scatter'),
    species,
    circle: circle.optional(),
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    count: z.number(),
    minSpacing: z.number(),
    avoidPaths: z.number().default(0),
    avoidFlats: z.boolean().default(false),
    avoidWater: z.number().default(0),
    exclude: z.array(circle).default([]),
    seed: z.number().default(1),
  }),
  z.object({
    type: z.literal('riverbank'),
    species,
    river: z.string(),
    count: z.number(),
    band: z.tuple([z.number(), z.number()]),
    minSpacing: z.number(),
    seed: z.number().default(1),
  }),
]);

export const VegetationPlanSchema = z.object({ notes: z.string().optional(), rules: z.array(Rule) });
export type VegetationPlan = z.infer<typeof VegetationPlanSchema>;

export function parseVegetationPlan(data: unknown): VegetationPlan {
  const r = VegetationPlanSchema.safeParse(data);
  if (!r.success) throw new Error(`Invalid vegetation plan: ${z.prettifyError(r.error)}`);
  return r.data;
}

/** Spatial hash for min-spacing checks. */
class Grid {
  private readonly cells = new Map<string, [number, number, number][]>();
  constructor(private readonly size = 16) {}
  private key(x: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
  }
  add(x: number, z: number, r: number) {
    const k = this.key(x, z);
    const list = this.cells.get(k) ?? [];
    list.push([x, z, r]);
    this.cells.set(k, list);
  }
  clear(x: number, z: number, r: number): boolean {
    const cx = Math.floor(x / this.size);
    const cz = Math.floor(z / this.size);
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        for (const [px, pz, pr] of this.cells.get(`${cx + i},${cz + j}`) ?? []) {
          if (Math.hypot(px - x, pz - z) < Math.max(r, pr)) return false;
        }
      }
    }
    return true;
  }
}

export function planVegetation(plan: VegetationPlan, hf: Heightfield): Plant[] {
  const L = hf.layout;
  const out: Plant[] = [];
  const grid = new Grid();
  const inBounds = (x: number, z: number) => x > L.bounds.minX + 4 && x < L.bounds.maxX - 4 && z > L.bounds.minZ + 4 && z < L.bounds.maxZ - 4;
  const nearPath = (x: number, z: number, margin: number) => L.paths.some((p) => closestOnPolyline(x, z, p.points).dist < p.width / 2 + margin);
  const nearFlat = (x: number, z: number) => L.flats.some((f) => f.surface !== 'grass' && rectDistance(x, z, f.x, f.z, f.hw, f.hd, f.rot ?? 0) < 2);
  const nearWater = (x: number, z: number, margin: number) =>
    L.rivers.some((r) => closestOnPolyline(x, z, r.points).dist < r.width / 2 + margin) ||
    L.channels.some((c) => closestOnPolyline(x, z, c.points).dist < c.width / 2 + margin);
  const push = (sp: SpeciesId, x: number, z: number, extra: Partial<Plant> = {}) => {
    if (!inBounds(x, z)) return;
    out.push({ species: sp, x, z, ...extra });
    grid.add(x, z, sp === 'reed' ? 1.2 : sp === 'myrtle' || sp === 'laurel' ? 2 : 4);
  };

  for (const rule of plan.rules) {
    switch (rule.type) {
      case 'points':
        for (const it of rule.items) push(rule.species, it.x, it.z, { id: it.id, ...(it.scale !== undefined ? { scale: it.scale } : {}), ...(it.rot !== undefined ? { rot: it.rot } : {}) });
        break;
      case 'along': {
        const pts = rule.path ? L.paths.find((p) => p.id === rule.path)?.points : L.channels.find((c) => c.id === rule.channel)?.points;
        if (!pts) throw new Error(`Vegetation rule refers to unknown ${rule.path ? `path "${rule.path}"` : `channel "${rule.channel}"`}`);
        const rng = mulberry32(pts.length * 977 + rule.spacing);
        const len = polylineLength(pts);
        for (let s = rule.spacing / 2; s < len; s += rule.spacing) {
          const p = samplePolyline(pts, s);
          for (const side of rule.sides === 'both' ? [-1, 1] : rule.sides === 'left' ? [-1] : [1]) {
            const x = p.x - p.tz * rule.offset * side + (rng() - 0.5) * rule.jitter;
            const z = p.z + p.tx * rule.offset * side + (rng() - 0.5) * rule.jitter;
            if (nearFlat(x, z) || !grid.clear(x, z, 3)) continue;
            push(rule.species, x, z);
          }
        }
        break;
      }
      case 'ring': {
        const rng = mulberry32(rule.count * 31 + rule.radius);
        for (let i = 0; i < rule.count; i++) {
          const a = (i / rule.count) * Math.PI * 2 + rng() * 0.3;
          push(rule.species, rule.center[0] + Math.cos(a) * rule.radius + (rng() - 0.5) * rule.jitter, rule.center[1] + Math.sin(a) * rule.radius + (rng() - 0.5) * rule.jitter);
        }
        break;
      }
      case 'rows': {
        const rng = mulberry32(rule.rows * 131 + rule.cols);
        for (let r = 0; r < rule.rows; r++) {
          for (let c = 0; c < rule.cols; c++) {
            push(rule.species, rule.origin[0] + c * rule.dx + (rng() - 0.5) * rule.jitter, rule.origin[1] + r * rule.dz + (rng() - 0.5) * rule.jitter);
          }
        }
        break;
      }
      case 'orchard': {
        const rng = mulberry32(rule.seed * 6151);
        const [cx, cz, hw, hh] = rule.rect;
        const c = Math.cos(rule.rot);
        const sn = Math.sin(rule.rot);
        for (let lz = -hh; lz <= hh; lz += rule.dz) {
          for (let lx = -hw; lx <= hw; lx += rule.dx) {
            if (rng() > rule.fill) continue;
            const jx = lx + (rng() - 0.5) * rule.jitter;
            const jz = lz + (rng() - 0.5) * rule.jitter;
            const x = cx + jx * c - jz * sn;
            const z = cz + jx * sn + jz * c;
            if (!inBounds(x, z)) continue;
            if (rule.exclude.some(([ex, ez, er]) => Math.hypot(x - ex, z - ez) < er)) continue;
            if (nearPath(x, z, rule.avoidPaths) || nearFlat(x, z) || nearWater(x, z, rule.avoidWater)) continue;
            push(rule.species, x, z);
          }
        }
        break;
      }
      case 'scatter': {
        const rng = mulberry32(rule.seed * 7919);
        let placed = 0;
        for (let tries = 0; tries < rule.count * 30 && placed < rule.count; tries++) {
          let x: number;
          let z: number;
          if (rule.circle) {
            const a = rng() * Math.PI * 2;
            const r = Math.sqrt(rng()) * rule.circle[2];
            x = rule.circle[0] + Math.cos(a) * r;
            z = rule.circle[1] + Math.sin(a) * r;
          } else if (rule.rect) {
            x = rule.rect[0] + (rng() * 2 - 1) * rule.rect[2];
            z = rule.rect[1] + (rng() * 2 - 1) * rule.rect[3];
          } else break;
          if (!inBounds(x, z)) continue;
          if (rule.exclude.some(([ex, ez, er]) => Math.hypot(x - ex, z - ez) < er)) continue;
          if (rule.avoidPaths > 0 && nearPath(x, z, rule.avoidPaths)) continue;
          if (rule.avoidFlats && nearFlat(x, z)) continue;
          if (rule.avoidWater > 0 && nearWater(x, z, rule.avoidWater)) continue;
          if (!grid.clear(x, z, rule.minSpacing)) continue;
          push(rule.species, x, z);
          placed++;
        }
        break;
      }
      case 'riverbank': {
        const river = L.rivers.find((r) => r.id === rule.river);
        if (!river) throw new Error(`Unknown river "${rule.river}"`);
        const rng = mulberry32(rule.seed * 104729);
        const len = polylineLength(river.points);
        let placed = 0;
        for (let tries = 0; tries < rule.count * 20 && placed < rule.count; tries++) {
          const p = samplePolyline(river.points, rng() * len);
          const side = rng() > 0.5 ? 1 : -1;
          const d = river.width / 2 + rule.band[0] + rng() * (rule.band[1] - rule.band[0]);
          const x = p.x - p.tz * d * side;
          const z = p.z + p.tx * d * side;
          if (nearPath(x, z, 1.5)) continue;
          if (!grid.clear(x, z, rule.minSpacing)) continue;
          push(rule.species, x, z);
          placed++;
        }
        break;
      }
    }
  }
  return out;
}
