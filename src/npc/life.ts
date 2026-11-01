import * as THREE from 'three';
import { z } from 'zod';
import type { AnimState } from '../characters/animator';
import type { AppearanceInput } from '../characters/appearance';
import { pick, range, type Rng } from '../procgen/rng';
import { randomCitizen } from './crowd';
import { StatueSchema } from '../world/statues';

/**
 * Ambient life of the Academy (content/world/academy.life.json): who walks which path, and the small scenes
 * that fill the precinct when no story is happening there: debate circles under the planes, a lecture with
 * listeners on the ground, geometry drawn in the sand, readers, wrestlers and runners at the gymnasium,
 * offerings at the altars, gardeners in the grove. Everything is data; the Crowd places and animates it.
 */
export const LifeRole = z.enum(['scholar', 'elder', 'youth', 'athlete', 'citizen', 'woman', 'worker', 'traveller', 'priest']);
export type LifeRole = z.infer<typeof LifeRole>;

const Anim = z.enum(['idle', 'gesture', 'read', 'write', 'sit', 'sitGround', 'drawDirt', 'wrestle', 'pray', 'dig', 'throw', 'lie']);

export const LifeSchema = z.object({
  walkers: z.array(
    z.object({
      path: z.string(),
      count: z.number().int().min(0),
      lateral: z.number().default(1),
      roles: z.array(LifeRole).min(1),
      /** Walk side by side in pairs (philosophers on the peripatos). */
      pairs: z.boolean().default(false),
      speed: z.tuple([z.number(), z.number()]).default([1.0, 1.4]),
      gait: z.enum(['walk', 'run']).default('walk'),
      /** Use only part of the path: [from, to] point indices. */
      slice: z.tuple([z.number().int(), z.number().int()]).optional(),
    }),
  ),
  scenes: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['circle', 'lecture', 'geometry', 'wrestle', 'solo', 'bench']),
      x: z.number(),
      z: z.number(),
      /** Direction the scene faces (lecture: from the teacher toward the listeners; solo: the figure). */
      heading: z.number().default(0),
      count: z.number().int().min(1).default(4),
      radius: z.number().default(1.5),
      roles: z.array(LifeRole).min(1).default(['scholar']),
      anim: Anim.optional(),
      /** Solo figures and listeners can sit on a stone seat. */
      seat: z.boolean().default(false),
    }),
  ),
  statues: z.array(StatueSchema).default([]),
});
export type LifeData = z.infer<typeof LifeSchema>;
export type LifeScene = LifeData['scenes'][number];

/**
 * The palette of a well-off Athenian student, after the painted korai and the Alexander Sarcophagus (and with an
 * eye to Raphael): madder red and rose, saffron, woad blue, a sea-green, a brownish purple, set against
 * undyed wool and bleached linen. docs/RESEARCH.md §9.
 */
const RICH = ['#b0402c', '#9c3426', '#c47468', '#d39a34', '#c08a2e', '#34558f', '#2c4878', '#4d7a6c', '#6e4a6e', '#5a3d58', '#efe6d2', '#e6dcc4', '#d8c9a8', '#efe6d2'];
const CHITON = ['#efe6d2', '#e8dfca', '#e3d8c0', '#d9cbb0', '#efe9dc', '#c47468', '#d39a34', '#7f9db8'];
const BORDERS = ['#8c3b2a', '#2c4878', '#c9922e', '#5a3d58', '#2b1d14'];
const SKIN = ['#c99872', '#b98560', '#d8a882', '#a8744f', '#c08a64', '#e0b694', '#b07a56'];
const HAIR = ['#2b1d14', '#3a2618', '#1d1510', '#4a3220', '#5c4028'];

export function lifeAppearance(rng: Rng, role: LifeRole): AppearanceInput {
  if (role === 'citizen' || role === 'woman' || role === 'worker' || role === 'traveller' || role === 'youth' || role === 'elder') {
    const a = randomCitizen(rng, role);
    // Academy people dress a little better than the road: a himation for most, with the richer dyes.
    if (role !== 'worker' && a.himation !== undefined && rng() < 0.75) a.himation = { color: pick(rng, RICH), ...(rng() < 0.35 ? { border: pick(rng, BORDERS) } : {}) };
    return a;
  }
  if (role === 'athlete') {
    return {
      height: range(rng, 1.68, 1.84),
      build: range(rng, 0.55, 0.95),
      sex: 'm',
      age: rng() < 0.6 ? 'youth' : 'adult',
      skin: pick(rng, ['#b98560', '#a8744f', '#c08a64', '#b07a56']), // oiled and sunburnt
      hair: { style: pick(rng, ['short', 'curly', 'cropped'] as const), color: pick(rng, HAIR) },
      beard: { style: rng() < 0.6 ? 'none' : 'trimmed', color: pick(rng, HAIR) },
      // Athletes trained naked; the game gives them a perizoma of undyed, oil-stained leather or wool.
      chiton: { color: pick(rng, ['#8a6a48', '#7a5c3e', '#9a7a56']), length: 'short' },
      loincloth: true,
      props: [],
    };
  }
  if (role === 'priest') {
    return {
      height: range(rng, 1.64, 1.78),
      build: rng(),
      sex: 'm',
      age: 'old',
      skin: pick(rng, SKIN),
      hair: { style: 'long', color: pick(rng, ['#8c8a86', '#d0ccc4']) },
      beard: { style: 'long', color: pick(rng, ['#8c8a86', '#d0ccc4']) },
      chiton: { color: '#f2ede2', length: 'ankle' },
      himation: { color: '#f2ede2', border: '#8c3b2a' },
      props: [],
    };
  }
  // Scholar: the young men (and the few women) of the Academy: long chiton or himation alone, a book roll or tablet.
  const fem = rng() < 0.12;
  const age = rng() < 0.6 ? 'youth' : rng() < 0.85 ? 'adult' : 'old';
  return {
    height: fem ? range(rng, 1.55, 1.66) : range(rng, 1.64, 1.82),
    build: range(rng, 0.15, 0.7),
    sex: fem ? 'f' : 'm',
    age,
    skin: pick(rng, SKIN),
    hair: { style: fem ? 'cropped' : pick(rng, ['short', 'curly', 'curly', 'long'] as const), color: age === 'old' ? pick(rng, ['#8c8a86', '#a39e98']) : pick(rng, HAIR) },
    beard: { style: fem || (age === 'youth' && rng() < 0.6) ? 'none' : pick(rng, ['trimmed', 'full', 'long'] as const), color: age === 'old' ? '#a39e98' : pick(rng, HAIR) },
    chiton: { color: pick(rng, CHITON), length: rng() < 0.55 ? 'ankle' : 'knee', ...(rng() < 0.25 ? { border: pick(rng, BORDERS) } : {}) },
    himation: { color: pick(rng, RICH), ...(rng() < 0.4 ? { border: pick(rng, BORDERS) } : {}) },
    props: rng() < 0.45 ? [pick(rng, ['scroll', 'scroll', 'tablet'] as const)] : [],
  };
}

export interface Figure {
  x: number;
  z: number;
  heading: number;
  role: LifeRole;
  anim: AnimState;
  /** Fixed figures keep their pose; others alternate between idle and gesture like a conversation. */
  fixed: boolean;
  seat?: boolean;
}

/** Expand one scene into figures (pure: positions and poses only). */
export function sceneFigures(s: LifeScene, rng: Rng): Figure[] {
  const out: Figure[] = [];
  const role = () => pick(rng, s.roles);
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  switch (s.kind) {
    case 'circle': {
      const speaker = Math.floor(rng() * s.count);
      for (let i = 0; i < s.count; i++) {
        const a = (i / s.count) * Math.PI * 2 + rng() * 0.35;
        const r = s.radius * range(rng, 0.9, 1.1);
        const x = s.x + Math.cos(a) * r;
        const zz = s.z + Math.sin(a) * r;
        out.push({ x, z: zz, heading: Math.atan2(s.x - x, s.z - zz) + (rng() - 0.5) * 0.4, role: role(), anim: i === speaker ? 'gesture' : 'idle', fixed: false });
      }
      break;
    }
    case 'lecture': {
      // The teacher stands; listeners sit on the ground in an arc in front of him.
      out.push({ x: s.x, z: s.z, heading: s.heading, role: s.roles.includes('elder') ? 'elder' : 'scholar', anim: 'gesture', fixed: true });
      const n = s.count;
      for (let i = 0; i < n; i++) {
        const row = i < Math.ceil(n * 0.6) ? 0 : 1;
        const inRow = row === 0 ? Math.ceil(n * 0.6) : n - Math.ceil(n * 0.6);
        const k = row === 0 ? i : i - Math.ceil(n * 0.6);
        const a = s.heading + ((k + 0.5) / inRow - 0.5) * (row === 0 ? 2.0 : 1.5) + (rng() - 0.5) * 0.1;
        const r = s.radius + row * 1.3 + rng() * 0.3;
        const x = s.x + Math.sin(a) * r;
        const zz = s.z + Math.cos(a) * r;
        const anim: AnimState = s.seat ? (rng() < 0.3 ? 'write' : 'sit') : rng() < 0.2 ? 'read' : 'sitGround';
        out.push({ x, z: zz, heading: Math.atan2(s.x - x, s.z - zz), role: role(), anim: anim === 'read' ? 'sitGround' : anim, fixed: true, seat: s.seat });
      }
      break;
    }
    case 'geometry': {
      // One draws in the sand; the others stand around the figure, looking down at it.
      out.push({ x: s.x - fx * 0.5, z: s.z - fz * 0.5, heading: s.heading, role: role(), anim: 'drawDirt', fixed: true });
      for (let i = 0; i < s.count - 1; i++) {
        const a = s.heading + Math.PI + ((i + 0.5) / (s.count - 1) - 0.5) * 2.4;
        const x = s.x - Math.sin(a) * s.radius;
        const zz = s.z - Math.cos(a) * s.radius;
        out.push({ x, z: zz, heading: Math.atan2(s.x - x, s.z - zz), role: role(), anim: i === 0 ? 'gesture' : 'idle', fixed: false });
      }
      break;
    }
    case 'wrestle': {
      out.push({ x: s.x - fx * 0.42, z: s.z - fz * 0.42, heading: s.heading, role: 'athlete', anim: 'wrestle', fixed: true });
      out.push({ x: s.x + fx * 0.42, z: s.z + fz * 0.42, heading: s.heading + Math.PI, role: 'athlete', anim: 'wrestle', fixed: true });
      break;
    }
    case 'bench': {
      // A row of seated people (on a stone bench), all facing the heading.
      const sx = Math.cos(s.heading);
      const sz = -Math.sin(s.heading);
      for (let i = 0; i < s.count; i++) {
        const o = (i - (s.count - 1) / 2) * 0.75;
        out.push({ x: s.x + sx * o, z: s.z + sz * o, heading: s.heading + (rng() - 0.5) * 0.3, role: role(), anim: s.anim ?? (rng() < 0.35 ? 'write' : 'sit'), fixed: true, seat: true });
      }
      break;
    }
    case 'solo':
      out.push({ x: s.x, z: s.z, heading: s.heading, role: role(), anim: s.anim ?? 'idle', fixed: s.anim !== undefined && s.anim !== 'idle' && s.anim !== 'gesture', seat: s.seat });
      break;
  }
  return out;
}

/** Plain stone seats (blocks of poros) for seated figures: one instanced mesh. */
export function buildSeats(seats: { x: number; z: number; heading: number; y: number }[]): THREE.InstancedMesh | null {
  if (!seats.length) return null;
  const geo = new THREE.BoxGeometry(0.62, 0.44, 0.42);
  geo.translate(0, 0.2, 0); // sunk 2 cm into the ground
  const mat = new THREE.MeshStandardMaterial({ color: 0xbfb19a, roughness: 0.92 });
  const mesh = new THREE.InstancedMesh(geo, mat, seats.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  seats.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.heading);
    // The seat sits under the hips, a little behind the figure's feet.
    m.compose(new THREE.Vector3(s.x - Math.sin(s.heading) * 0.12, s.y, s.z - Math.cos(s.heading) * 0.12), q, one);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'life-seats';
  return mesh;
}
