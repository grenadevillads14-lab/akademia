import * as THREE from 'three';
import { z } from 'zod';
import { Builder, Frame, resolveMaterial } from '../architecture/kit';
import {
  casualtyList,
  cityWall,
  courtyardHouse,
  dipylon,
  funeraryVase,
  graveTerrace,
  hermShaft,
  kiln,
  naiskos,
  potteryCluster,
  simpleGate,
  stele,
  tower,
  type GraveSlot,
} from '../architecture/greek';
import { inscription, relief } from '../architecture/reliefs';
import type { Physics } from '../physics/physics';
import { closestOnPolyline, polylineLength, samplePolyline } from '../procgen/geometry2d';
import { mulberry32, range } from '../procgen/rng';
import type { MaterialLib } from '../render/materialLib';
import { ModelField, type ModelLib, type Placement } from '../render/modelLib';
import type { Heightfield } from './heightfield';

/**
 * The built environment of a world (content/world/<id>.structures.json): city wall and gates,
 * districts of houses, the road of graves, herms, and scattered Poly Haven models (rocks, shrubs, pots).
 */
const v2 = z.tuple([z.number(), z.number()]);
const circle = z.tuple([z.number(), z.number(), z.number()]);
const scatter = z.object({ circle, count: z.number(), models: z.array(z.string()), scale: v2, seed: z.number() });
const StructuresSchema = z.object({
  notes: z.string().optional(),
  cityWall: z.object({ points: z.array(v2), height: z.number(), socle: z.number(), thickness: z.number(), towerEvery: z.number(), towerSize: z.number(), towerHeight: z.number() }).optional(),
  gates: z.array(z.object({ id: z.string(), type: z.enum(['dipylon', 'simple']), x: z.number(), z: z.number(), rot: z.number() })).default([]),
  districts: z
    .array(
      z.object({
        id: z.string(),
        style: z.enum(['city', 'potters']),
        frame: z.object({ x: z.number(), z: z.number(), rot: z.number() }),
        uRange: v2,
        vRange: v2,
        blockU: z.number(),
        blockV: z.number(),
        street: z.number(),
        avenue: z.object({ u: z.number(), width: z.number() }),
        keepClear: z.array(circle).default([]),
        density: z.number(),
        seed: z.number(),
      }),
    )
    .default([]),
  pompeion: z.object({ x: z.number(), z: z.number(), rot: z.number(), w: z.number(), d: z.number() }).optional(),
  graveRoad: z
    .object({ path: z.string(), from: z.number(), to: z.number(), setback: z.number(), terraceWidth: v2, terraceDepth: v2, gap: v2, publicListsEvery: z.number(), seed: z.number() })
    .optional(),
  herms: z.array(z.object({ id: z.string(), x: z.number(), z: z.number(), rot: z.number() })).default([]),
  propClusters: z.array(z.object({ id: z.string(), x: z.number(), z: z.number(), radius: z.number(), models: z.array(z.string()), count: z.number(), seed: z.number() })).default([]),
  rocks: z.array(scatter).default([]),
  shrubs: z.array(scatter).default([]),
  tufts: z.array(scatter).default([]),
});
export type StructuresData = z.infer<typeof StructuresSchema>;

export interface Structures {
  readonly group: THREE.Group;
  readonly models: ModelField;
  /** Herm positions (fast travel later). */
  readonly herms: { id: string; position: THREE.Vector3 }[];
  update(camera: THREE.Camera, dt: number): void;
  dispose(): void;
}

interface Collider {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rot: number;
}

export async function buildStructures(
  data: unknown,
  ctx: { hf: Heightfield; lib: MaterialLib; models: ModelLib; physics: Physics | null; shadows: boolean; detail: number },
): Promise<Structures> {
  const S = StructuresSchema.parse(data);
  const { hf } = ctx;
  const ground = (x: number, z: number) => hf.height(x, z);
  const group = new THREE.Group();
  group.name = 'structures';
  const colliders: Collider[] = [];
  const collide = (f: Frame, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) => {
    const [x, zz] = f.toWorld(lx, lz);
    colliders.push({ x, y: f.y + ly, z: zz, sx, sy, sz, rot: f.rot });
  };

  // --- Fortifications and gates ---
  const fort = new Builder();
  const rngF = mulberry32(7);
  const gateSkips = S.gates.map((g) => ({ at: [g.x, g.z] as [number, number], radius: g.type === 'dipylon' ? 30 : 10 }));
  if (S.cityWall) {
    const w = S.cityWall;
    cityWall(fort, ground, w.points as [number, number][], { ...w, skip: gateSkips, seed: 11 });
    for (let i = 0; i < w.points.length - 1; i++) {
      const [ax, az] = w.points[i]!;
      const [bx, bz] = w.points[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
      for (let s = 0; s < len; s += 12) {
        const t = (s + 6) / len;
        const cx = ax + (bx - ax) * t;
        const cz = az + (bz - az) * t;
        if (gateSkips.some((k) => Math.hypot(cx - k.at[0], cz - k.at[1]) < k.radius)) continue;
        collide(new Frame(cx, cz, rot, ground(cx, cz)), 0, w.height / 2, 0, 12, w.height + 2, w.thickness);
      }
    }
  }
  for (const g of S.gates) {
    const f = new Frame(g.x, g.z, g.rot, ground(g.x, g.z));
    if (g.type === 'dipylon') {
      dipylon(fort, f, rngF);
      // Colliders: court side walls, gate side blocks, piers, towers.
      for (const sx of [-1, 1]) {
        collide(f, sx * (10 + 1.6), 4.5, 0, 3.2, 9, 34);
        for (const gz of [-17, 17]) {
          collide(f, sx * 10.5, 4.5, gz, 6.0, 9, 3.2);
          collide(f, sx * (10 + 3.2 + 4.5 - 1.5), 7, gz > 0 ? 17 + 4.5 - 2.5 : -17 + 4.5 - 1, 9, 14, 9);
        }
      }
      for (const gz of [-17, 17]) collide(f, 0, 3, gz, 3.2, 6, 3.4);
    } else {
      simpleGate(fort, f, rngF);
      for (const sx of [-1, 1]) collide(f, sx * 5.0, 4, 0, 5.8, 8, 3.2);
    }
  }
  if (S.pompeion) {
    const p = S.pompeion;
    const f = new Frame(p.x, p.z, p.rot, ground(p.x, p.z));
    const wallH = 6;
    for (const [lx, lz, sx, sz] of [
      [0, p.d / 2, p.w, 0.7],
      [0, -p.d / 2, p.w, 0.7],
      [-p.w / 2, 0, 0.7, p.d],
      [p.w / 2, 0, 0.7, p.d],
    ] as const) {
      if (lz > 0 && sx > 1) {
        // Street front with a propylon in the middle.
        for (const side of [-1, 1]) fort.boxIn(f, 'whitewash', side * (p.w / 4 + 2), wallH / 2, lz, p.w / 2 - 4, wallH, sz);
        fort.boxIn(f, 'ashlar', 0, 3, lz + 1.5, 8, 6, 3);
        fort.boxIn(f, 'dark', 0, 2.2, lz + 3.02, 3, 4.4, 0.1);
        fort.gableRoof(f.sub(0, lz + 1.5), 0, 0, 8, 3, 6);
      } else {
        fort.boxIn(f, 'whitewash', lx, wallH / 2, lz, sx, wallH, sz);
      }
      collide(f, lx, wallH / 2, lz, Math.max(sx, 0.7), wallH, Math.max(sz, 0.7));
    }
    // Inner portico roofs around the court.
    fort.gableRoof(f.sub(0, -p.d / 2 + 3), 0, 0, p.w - 1.4, 5.4, 4.6);
    fort.gableRoof(f.sub(0, p.d / 2 - 3), 0, 0, p.w - 1.4, 5.4, 4.6);
    for (let i = -p.w / 2 + 3; i <= p.w / 2 - 3; i += 3) {
      for (const lz of [-p.d / 2 + 5.6, p.d / 2 - 5.6]) {
        const [x, zz] = f.toWorld(i, lz);
        fort.cylinder('whitewash', x, f.y, zz, 0.24, 0.28, 4.6, 10);
      }
    }
  }
  group.add(await fort.build(ctx.lib, 'fortifications', { castShadow: ctx.shadows }));

  // --- Districts of houses ---
  const houses = new Builder();
  const nearWater = (x: number, zz: number, m: number) => hf.layout.rivers.some((r) => closestOnPolyline(x, zz, r.points).dist < r.width / 2 + m);
  const nearPath = (x: number, zz: number, m: number) => hf.layout.paths.some((p) => closestOnPolyline(x, zz, p.points).dist < p.width / 2 + m);
  const inBounds = (x: number, zz: number) => x > hf.layout.bounds.minX + 10 && x < hf.layout.bounds.maxX - 10 && zz > hf.layout.bounds.minZ + 10 && zz < hf.layout.bounds.maxZ - 10;
  for (const d of S.districts) {
    const rng = mulberry32(d.seed);
    const F = new Frame(d.frame.x, d.frame.z, d.frame.rot, 0);
    for (let u = d.uRange[0]; u < d.uRange[1]; u += d.blockU + d.street) {
      for (let v = d.vRange[0]; v < d.vRange[1]; v += d.blockV + d.street) {
        // Two rows of lots back to back per block, facing the streets on either side.
        for (const row of [0, 1]) {
          let lu = u;
          while (lu < u + d.blockU - 6) {
            const lotW = Math.min(range(rng, 9, 15), u + d.blockU - lu);
            const lotD = d.blockV / 2;
            const cu = lu + lotW / 2;
            const cv = v + (row === 0 ? lotD / 2 : d.blockV - lotD / 2);
            lu += lotW;
            if (Math.abs(cu - d.avenue.u) < d.avenue.width / 2 + lotW / 2) continue;
            if (rng() > d.density) continue;
            const [x, zz] = F.toWorld(cu, cv);
            if (!inBounds(x, zz)) continue;
            if (d.keepClear.some(([kx, kz, kr]) => Math.hypot(x - kx, zz - kz) < kr)) continue;
            if (nearWater(x, zz, 6) || nearPath(x, zz, 3)) continue;
            const y = Math.max(ground(x, zz), ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => ground(x + a! * lotW * 0.4, zz + c! * lotD * 0.4)));
            // Face the street: row 0 faces -v, row 1 faces +v. Athens grew organically, so lots
            // drift a few degrees off the grid and vary in depth.
            const facing = d.frame.rot + (row === 0 ? Math.PI : 0) + (rng() - 0.5) * 0.12;
            const hf2 = new Frame(x, zz, facing, y);
            const w = lotW - range(rng, 0.2, 1.2);
            const dd = lotD - range(rng, 0.2, 2.5);
            if (d.style === 'potters' && rng() < 0.45) {
              courtyardHouse(houses, hf2, Math.min(w, 9), Math.min(dd, 8), rng, 1);
              kiln(houses, hf2.sub(range(rng, -2, 2), -dd / 2 - 3), rng);
            } else {
              courtyardHouse(houses, hf2, w, dd, rng, d.style === 'city' && rng() < 0.25 ? 2 : 1);
            }
            collide(hf2, 0, 2, 0, w, 4, dd);
          }
        }
      }
    }
  }
  group.add(await houses.build(ctx.lib, 'houses', { castShadow: ctx.shadows }));

  // --- Road of graves (Demosion Sema and family terraces) ---
  const graves = new Builder();
  const decals: { kind: 'list' | 'epitaph' | 'rider' | 'farewell' | 'youth' | 'anthemion'; f: Frame; w: number; h: number; y: number; z: number; seed: number }[] = [];
  if (S.graveRoad) {
    const gr = S.graveRoad;
    const path = hf.layout.paths.find((p) => p.id === gr.path);
    if (!path) throw new Error(`graveRoad: unknown path ${gr.path}`);
    const rng = mulberry32(gr.seed);
    const len = Math.min(gr.to, polylineLength(path.points));
    let nextList = gr.from + 20;
    let dexileosPlaced = false;
    for (const side of [-1, 1]) {
      for (let s = gr.from; s < len; ) {
        const tw = range(rng, gr.terraceWidth[0], gr.terraceWidth[1]);
        const td = range(rng, gr.terraceDepth[0], gr.terraceDepth[1]);
        const p = samplePolyline(path.points, s + tw / 2);
        s += tw + range(rng, gr.gap[0], gr.gap[1]);
        const nx = -p.tz * side;
        const nz = p.tx * side;
        const off = gr.setback + td / 2;
        const cx = p.x + nx * off;
        const cz = p.z + nz * off;
        // Frame faces the road (local +Z toward the road).
        const rot = Math.atan2(-nx, -nz);
        const f = new Frame(cx, cz, rot, ground(cx, cz));
        if (side === 1 && s > nextList) {
          // A public monument: casualty lists by tribe, set before a polyandrion mound.
          nextList += gr.publicListsEvery;
          casualtyList(graves, f.sub(0, td / 2 - 1.2));
          decals.push({ kind: 'list', f: f.sub(0, td / 2 - 1.2 + 0.125), w: 2.5, h: 2.3, y: 0.5 + 1.3, z: 0, seed: Math.floor(rng() * 1e6) });
          collide(f, 0, 1.6, td / 2 - 1.2, 3.4, 3.2, 1);
          const mound = new THREE.SphereGeometry(td * 0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
          mound.scale(1.6, 0.35, 1);
          graves.geometry('drystone', mound, new THREE.Vector3(cx, f.y - 0.2, cz), new THREE.Euler(0, rot, 0));
          mound.dispose();
          continue;
        }
        const slots = graveTerrace(graves, f, tw, td, rng);
        collide(f, 0, 0.6, 0, tw, 1.6, td);
        for (const slot of slots) placeMonument(graves, slot, decals, !dexileosPlaced && side === -1 && s > 70 ? ((dexileosPlaced = true), 'rider') : undefined);
      }
    }
  }
  group.add(await graves.build(ctx.lib, 'graves', { castShadow: ctx.shadows }));
  group.add(await buildDecals(decals, ctx.lib));

  // --- Herms (marble shaft + Poly Haven marble bust as the head) ---
  const herms: Structures['herms'] = [];
  const hermB = new Builder();
  const bust = await ctx.models.get('marble_bust_01');
  const hermPlacements: Placement[] = [];
  for (const h of S.herms) {
    const y = ground(h.x, h.z);
    hermShaft(hermB, h.x, y, h.z, h.rot);
    colliders.push({ x: h.x, y: y + 0.8, z: h.z, sx: 0.6, sy: 1.6, sz: 0.6, rot: h.rot });
    hermPlacements.push({ x: h.x, y: y + 1.54, z: h.z, rot: h.rot + Math.PI, scale: 1.0 });
    herms.push({ id: h.id, position: new THREE.Vector3(h.x, y, h.z) });
  }
  if (S.herms.length) group.add(await hermB.build(ctx.lib, 'herms', { castShadow: ctx.shadows }));

  // --- Scattered models: pottery, rocks, shrubs, grass tufts ---
  const field = new ModelField(28, 260, ctx.shadows);
  const scatterPlace = async (list: { circle: [number, number, number]; count: number; models: string[]; scale: [number, number]; seed: number }[], kind: 'rock' | 'shrub' | 'tuft') => {
    for (const sc of list) {
      const rng = mulberry32(sc.seed * 977 + kind.length);
      const perModel = new Map<string, Placement[]>();
      let placed = 0;
      for (let tries = 0; tries < sc.count * 12 && placed < Math.round(sc.count * ctx.detail); tries++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * sc.circle[2];
        const x = sc.circle[0] + Math.cos(a) * r;
        const zz = sc.circle[1] + Math.sin(a) * r;
        if (!inBounds(x, zz) || nearPath(x, zz, 1.5) || nearWater(x, zz, 1)) continue;
        if (kind !== 'rock' && hf.grassDensity(x, zz) < 0.3) continue;
        const id = sc.models[Math.floor(rng() * sc.models.length)]!;
        const scale = range(rng, sc.scale[0], sc.scale[1]);
        const sink = kind === 'rock' ? 0.25 * scale : 0.03;
        const pl: Placement = { x, y: ground(x, zz) - sink, z: zz, rot: rng() * Math.PI * 2, scale };
        if (kind === 'rock') pl.tilt = (rng() - 0.5) * 0.4;
        (perModel.get(id) ?? perModel.set(id, []).get(id)!).push(pl);
        if (kind === 'rock' && scale > 1.2) colliders.push({ x, y: pl.y + 0.5 * scale, z: zz, sx: 1.4 * scale, sy: 1.0 * scale, sz: 1.4 * scale, rot: pl.rot });
        placed++;
      }
      for (const [id, items] of perModel) field.add(await ctx.models.get(id), items, kind !== 'tuft');
    }
  };
  await scatterPlace(S.rocks as never, 'rock');
  await scatterPlace(S.shrubs as never, 'shrub');
  await scatterPlace(S.tufts as never, 'tuft');
  const pottery = new Builder();
  for (const c of S.propClusters) {
    const rng = mulberry32(c.seed * 131);
    if (c.models.length === 1 && c.models[0] === 'pottery') {
      for (const s of potteryCluster(pottery, ground, c.x, c.z, c.radius, c.count, rng)) {
        colliders.push({ x: s.x, y: ground(s.x, s.z) + 0.3, z: s.z, sx: s.r * 2, sy: 0.8, sz: s.r * 2, rot: 0 });
      }
      continue;
    }
    const perModel = new Map<string, Placement[]>();
    for (let i = 0; i < c.count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * c.radius;
      const x = c.x + Math.cos(a) * r;
      const zz = c.z + Math.sin(a) * r;
      const id = c.models[Math.floor(rng() * c.models.length)]!;
      (perModel.get(id) ?? perModel.set(id, []).get(id)!).push({ x, y: ground(x, zz), z: zz, rot: rng() * Math.PI * 2, scale: range(rng, 0.9, 1.4) });
    }
    for (const [id, items] of perModel) field.add(await ctx.models.get(id), items);
  }
  group.add(await pottery.build(ctx.lib, 'pottery', { castShadow: ctx.shadows }));
  field.add(bust, hermPlacements);
  group.add(field.group);

  // --- Physics ---
  if (ctx.physics) {
    const R = ctx.physics.R;
    const q = new THREE.Quaternion();
    for (const c of colliders) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
      ctx.physics.world.createCollider(
        R.ColliderDesc.cuboid(c.sx / 2, c.sy / 2, c.sz / 2)
          .setTranslation(c.x, c.y, c.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      );
    }
  }
  void tower;

  return {
    group,
    models: field,
    herms,
    update(camera, dt) {
      field.update(camera, dt);
    },
    dispose() {
      field.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
      });
    },
  };
}

function placeMonument(
  b: Builder,
  slot: GraveSlot,
  decals: { kind: 'list' | 'epitaph' | 'rider' | 'farewell' | 'youth' | 'anthemion'; f: Frame; w: number; h: number; y: number; z: number; seed: number }[],
  force?: 'rider',
): void {
  const f = new Frame(slot.x, slot.z, slot.rot, slot.y);
  const kind = force ? 'naiskos' : slot.kind;
  switch (kind) {
    case 'stele':
      stele(b, slot);
      decals.push({ kind: 'anthemion', f, w: 0.6, h: 0.6, y: 0.3 + 1.9 * slot.scale + 0.2, z: 0.075, seed: slot.seed });
      decals.push({ kind: 'epitaph', f, w: 0.5, h: 0.25, y: 0.3 + 1.9 * slot.scale - 0.25, z: 0.085, seed: slot.seed });
      break;
    case 'naiskos': {
      naiskos(b, slot);
      const sc = slot.scale * 1.15;
      const motif = force ?? (['farewell', 'youth', 'farewell'] as const)[slot.seed % 3]!;
      decals.push({ kind: motif, f, w: 1.0 * sc, h: 1.2 * sc, y: 0.4 + 0.75 * sc, z: -0.055, seed: slot.seed });
      break;
    }
    case 'lekythos':
    case 'loutrophoros':
      funeraryVase(b, slot, kind);
      break;
    case 'trapeza':
      b.boxIn(f, 'marble', 0, 0.35, 0, 1.6 * slot.scale, 0.7, 0.9);
      b.boxIn(f, 'marble', 0, 0.74, 0, 1.75 * slot.scale, 0.08, 1.0);
      break;
    case 'list':
      break;
  }
}

/** Carved inscriptions and reliefs as thin marble planes with normal maps (few shared materials). */
async function buildDecals(
  decals: { kind: 'list' | 'epitaph' | 'rider' | 'farewell' | 'youth' | 'anthemion'; f: Frame; w: number; h: number; y: number; z: number; seed: number }[],
  lib: MaterialLib,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'carvings';
  const marble = await resolveMaterial(lib, 'marble');
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const matFor = (kind: string, variant: number) => {
    const key = `${kind}:${variant}`;
    let m = mats.get(key);
    if (!m) {
      const tex = kind === 'list' || kind === 'epitaph' ? inscription(variant * 7 + 3, kind) : relief(kind as 'rider', variant);
      m = new THREE.MeshStandardMaterial({
        color: marble.color.clone(),
        map: marble.map,
        roughness: 0.55,
        normalMap: tex.normal,
        normalScale: new THREE.Vector2(1.6, 1.6),
        aoMap: tex.ao,
        aoMapIntensity: kind === 'list' || kind === 'epitaph' ? 0.85 : 0.6,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      mats.set(key, m);
    }
    return m;
  };
  const byMat = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
  for (const d of decals) {
    const variant = d.seed % (d.kind === 'list' ? 4 : 3);
    const m = matFor(d.kind, variant);
    const g = new THREE.PlaneGeometry(d.w, d.h);
    const [x, zz] = d.f.toWorld(0, d.z);
    g.rotateY(d.f.rot);
    g.translate(x, d.f.y + d.y, zz);
    (byMat.get(m) ?? byMat.set(m, []).get(m)!).push(g);
  }
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  for (const [m, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
