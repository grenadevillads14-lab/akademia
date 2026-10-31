import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../procgen/rng';
import type { Builder} from './kit';
import { Frame } from './kit';

/**
 * Greek architecture generators (docs/RESEARCH.md §1, §9, §11).
 * Heights come from a ground sampler so everything sits on the terrain; foundations run below ground.
 */
export type Ground = (x: number, z: number) => number;

const tone = (rng: Rng, base = 1, spread = 0.08) => {
  const k = base + (rng() - 0.5) * spread;
  return new THREE.Color(k, k * (0.99 + rng() * 0.02), k * (0.97 + rng() * 0.04));
};

/**
 * City wall (Themistoclean): a socle of limestone ashlar with a clay-plastered mudbrick superstructure,
 * a walkway parapet with merlons, and square towers at intervals. `skip` leaves gaps for gates.
 */
export function cityWall(
  b: Builder,
  ground: Ground,
  points: [number, number][],
  opts: { height: number; socle: number; thickness: number; towerEvery: number; towerSize: number; towerHeight: number; skip: { at: [number, number]; radius: number }[]; seed: number },
): void {
  const rng = mulberry32(opts.seed);
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2; // local +X along the wall
    const seg = 6;
    for (let s = 0; s < len; s += seg) {
      const l = Math.min(seg, len - s);
      const t = (s + l / 2) / len;
      const cx = ax + (bx - ax) * t;
      const cz = az + (bz - az) * t;
      if (opts.skip.some((k) => Math.hypot(cx - k.at[0], cz - k.at[1]) < k.radius)) continue;
      const g = Math.min(ground(ax + (bx - ax) * (s / len), az + (bz - az) * (s / len)), ground(ax + (bx - ax) * ((s + l) / len), az + (bz - az) * ((s + l) / len)));
      const f = new Frame(cx, cz, rot, g);
      const foot = 1.5; // foundation below ground
      b.boxIn(f, 'ashlarBig', 0, (opts.socle + foot) / 2 - foot, 0, l + 0.02, opts.socle + foot, opts.thickness + 0.3, tone(rng, 1, 0.06));
      const upper = opts.height - opts.socle;
      b.boxIn(f, 'mudbrick', 0, opts.socle + upper / 2, 0, l + 0.02, upper, opts.thickness, tone(rng, 1, 0.1));
      // Parapet with merlons on the outer face (local -Z = outside).
      b.boxIn(f, 'mudbrick', 0, opts.height + 0.45, -opts.thickness / 2 + 0.3, l, 0.9, 0.6);
      for (let m = -l / 2 + 0.75; m < l / 2; m += 1.8) b.boxIn(f, 'mudbrick', m, opts.height + 1.25, -opts.thickness / 2 + 0.3, 0.95, 0.7, 0.6);
      // Coping tiles along the top of the parapet.
      b.boxIn(f, 'terracotta', 0, opts.height + 0.92, -opts.thickness / 2 + 0.3, l, 0.06, 0.7);
    }
    // Towers along the wall.
    for (let s = opts.towerEvery * 0.5; s < len; s += opts.towerEvery) {
      const t = s / len;
      const cx = ax + (bx - ax) * t;
      const cz = az + (bz - az) * t;
      if (opts.skip.some((k) => Math.hypot(cx - k.at[0], cz - k.at[1]) < k.radius + opts.towerSize)) continue;
      const f = new Frame(cx, cz, rot, ground(cx, cz));
      tower(b, f.sub(0, -opts.thickness / 2 - opts.towerSize / 2 + 1.2), opts.towerSize, opts.towerHeight, opts.socle + 1, rng);
    }
  }
}

/** Square tower: ashlar socle, plastered upper storey with slit windows, a tiled pyramid roof. */
export function tower(b: Builder, f: Frame, size: number, height: number, socle: number, rng: Rng): void {
  const foot = 1.5;
  b.boxIn(f, 'ashlarBig', 0, (socle + foot) / 2 - foot, 0, size + 0.4, socle + foot, size + 0.4, tone(rng, 1, 0.05));
  const upper = height - socle;
  b.boxIn(f, 'mudbrick', 0, socle + upper / 2, 0, size, upper, size, tone(rng, 1, 0.08));
  // String course between storeys.
  b.boxIn(f, 'ashlar', 0, socle + upper * 0.55, 0, size + 0.18, 0.3, size + 0.18);
  // Windows (shuttered openings) on each face, upper storey.
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    const fx = Math.sin(a) * (size / 2 + 0.01);
    const fz = Math.cos(a) * (size / 2 + 0.01);
    for (const off of [-size * 0.22, size * 0.22]) {
      const ox = Math.cos(a) * off;
      const oz = -Math.sin(a) * off;
      const w = side % 2 === 0 ? 0.7 : 0.08;
      const d = side % 2 === 0 ? 0.08 : 0.7;
      b.boxIn(f, 'dark', fx + ox, socle + upper * 0.75, fz + oz, w, 1.1, d);
      b.boxIn(f, 'wood', fx + ox, socle + upper * 0.75 + 0.62, fz + oz, w + 0.1, 0.1, d + 0.1);
    }
  }
  // Low pyramid roof of tiles.
  const roofH = size * 0.28;
  const pyramid = new THREE.ConeGeometry(size * 0.78, roofH, 4, 1);
  pyramid.rotateY(Math.PI / 4);
  const [x, z] = f.toWorld(0, 0);
  b.geometry('roof', pyramid, new THREE.Vector3(x, f.y + height + roofH / 2, z), new THREE.Euler(0, f.rot, 0));
  pyramid.dispose();
  b.boxIn(f, 'wood', 0, height + 0.05, 0, size + 0.5, 0.18, size + 0.5);
}

/**
 * The Dipylon: a courtyard gate. Local +Z points out of the city (toward the Academy). The inner gate
 * (z = -L/2) and outer gate (z = +L/2) each have two passages separated by a pier ("double gate");
 * four towers stand at the corners, the outer pair projecting forward.
 */
export function dipylon(b: Builder, f: Frame, rng: Rng, dims = { length: 34, width: 20, wallH: 8.5, socle: 3.5, thick: 3.2, towerSize: 9, towerH: 14 }): void {
  const { length: L, width: W, wallH, socle, thick, towerSize: T, towerH } = dims;
  const foot = 1.5;
  // Side walls of the court.
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + thick / 2);
    b.boxIn(f, 'ashlarBig', x, (socle + foot) / 2 - foot, 0, thick + 0.3, socle + foot, L, tone(rng, 1, 0.05));
    b.boxIn(f, 'mudbrick', x, socle + (wallH - socle) / 2, 0, thick, wallH - socle, L, tone(rng, 1, 0.08));
    for (let m = -L / 2 + 0.8; m < L / 2; m += 1.8) b.boxIn(f, 'mudbrick', x + sx * (thick / 2 - 0.3), wallH + 0.7, m, 0.6, 1.4, 0.95);
  }
  // Gate fronts: wall with two passages and a central pier, lintels of big ashlar, wooden leaves standing open.
  for (const gz of [-L / 2, L / 2]) {
    const passage = 4.2;
    const pier = 3.2;
    const openH = 5.6;
    const span = W + thick * 2;
    const sideW = (span - passage * 2 - pier) / 2;
    for (const sx of [-1, 1]) {
      const cx = sx * (span / 2 - sideW / 2);
      b.boxIn(f, 'ashlarBig', cx, (wallH + foot) / 2 - foot, gz, sideW, wallH + foot, thick, tone(rng, 1, 0.05));
    }
    b.boxIn(f, 'ashlarBig', 0, (openH + foot) / 2 - foot, gz, pier, openH + foot, thick + 0.2, tone(rng, 1.03, 0.04));
    // Lintel and wall above the openings.
    b.boxIn(f, 'ashlarBig', 0, openH + 0.55, gz, passage * 2 + pier + 0.6, 1.1, thick + 0.25);
    b.boxIn(f, 'mudbrick', 0, openH + 1.1 + (wallH - openH - 1.1) / 2, gz, passage * 2 + pier + 0.6, wallH - openH - 1.1, thick);
    for (let m = -span / 2 + 0.8; m < span / 2; m += 1.8) b.boxIn(f, 'mudbrick', m, wallH + 0.7, gz + (gz > 0 ? 1 : -1) * (thick / 2 - 0.3), 0.95, 1.4, 0.6);
    // Thresholds.
    for (const sx of [-1, 1]) b.boxIn(f, 'paving', sx * (pier / 2 + passage / 2), 0.06, gz, passage, 0.18, thick + 0.4);
    // Door leaves swung open against the passage walls.
    for (const sx of [-1, 1]) {
      const px = sx * (pier / 2 + passage / 2);
      for (const side of [-1, 1]) {
        const hingeX = px + side * (passage / 2 - 0.12);
        b.boxIn(f, 'wood', hingeX, openH / 2 - 0.1, gz + (gz > 0 ? -1 : 1) * (thick / 2 + 1.05), 0.14, openH - 0.4, 2.0);
        for (const by of [1.0, 2.6, 4.2]) b.boxIn(f, 'bronze', hingeX, by, gz + (gz > 0 ? -1 : 1) * (thick / 2 + 1.05), 0.17, 0.12, 2.02);
      }
    }
  }
  // Four towers: outer pair project out beyond the outer gate.
  for (const sx of [-1, 1]) {
    tower(b, f.sub(sx * (W / 2 + thick + T / 2 - 1.5), L / 2 + T / 2 - 2.5), T, towerH, socle + 1, rng);
    tower(b, f.sub(sx * (W / 2 + thick + T / 2 - 1.5), -L / 2 + T / 2 - 1), T, towerH - 1.5, socle + 1, rng);
  }
  // Paved court floor and a stone water trough by the inner gate (for travellers' animals).
  b.boxIn(f, 'paving', 0, 0.03, 0, W, 0.1, L - thick);
  b.boxIn(f, 'ashlar', W / 2 - 2.2, 0.45, -L / 2 + 6, 1.2, 0.9, 3.4);
  b.boxIn(f, 'dark', W / 2 - 2.2, 0.85, -L / 2 + 6, 0.9, 0.1, 3.1);
}

/** A simple gate in the wall (the Sacred Gate): one passage, flanking walls, the stream channel beside it. */
export function simpleGate(b: Builder, f: Frame, rng: Rng, opts = { width: 16, wallH: 8, socle: 3, thick: 3.2, passage: 4.4 }): void {
  const foot = 1.5;
  const openH = 5;
  const sideW = (opts.width - opts.passage) / 2;
  for (const sx of [-1, 1]) {
    const cx = sx * (opts.passage / 2 + sideW / 2);
    b.boxIn(f, 'ashlarBig', cx, (opts.wallH + foot) / 2 - foot, 0, sideW, opts.wallH + foot, opts.thick, tone(rng, 1, 0.05));
  }
  b.boxIn(f, 'ashlarBig', 0, openH + 0.5, 0, opts.passage + 0.6, 1.0, opts.thick + 0.2);
  b.boxIn(f, 'mudbrick', 0, openH + 1 + (opts.wallH - openH - 1) / 2, 0, opts.passage + 0.6, opts.wallH - openH - 1, opts.thick);
  tower(b, f.sub(-opts.width / 2 - 3.5, -2), 7, 12, 4, rng);
}

/**
 * Courtyard house (pastas type): rooms around an open court, mudbrick on a stone socle, plastered
 * (some whitewashed), tiled roofs sloping into the court. Doorway and small high windows on the street.
 * Local +Z faces the street.
 */
export function courtyardHouse(b: Builder, f: Frame, w: number, d: number, rng: Rng, storeys = 1): void {
  const wallH = storeys === 2 ? 6.2 : 3.4;
  const socle = 0.7;
  const thick = 0.5;
  const plaster = rng() < 0.55 ? 'whitewash' : 'mudbrick';
  const tint = plaster === 'whitewash' ? tone(rng, 1, 0.05) : tone(rng, 1, 0.14);
  const foot = 1.2;
  // Outer walls with a stone socle.
  const walls: [number, number, number, number][] = [
    [0, d / 2 - thick / 2, w, thick],
    [0, -d / 2 + thick / 2, w, thick],
    [-w / 2 + thick / 2, 0, thick, d],
    [w / 2 - thick / 2, 0, thick, d],
  ];
  for (const [x, z, sx, sz] of walls) {
    b.boxIn(f, 'drystone', x, (socle + foot) / 2 - foot, z, sx + 0.08, socle + foot, sz + 0.08, tone(rng, 1, 0.1));
    b.boxIn(f, plaster, x, socle + (wallH - socle) / 2, z, sx, wallH - socle, sz, tint);
  }
  // Street door with a lintel; small high windows.
  const doorX = (rng() - 0.5) * (w - 3);
  b.boxIn(f, 'dark', doorX, 1.1, d / 2 + 0.005, 1.2, 2.2, 0.06);
  b.boxIn(f, 'wood', doorX, 2.3, d / 2 + 0.06, 1.6, 0.18, 0.2);
  if (rng() < 0.6) b.boxIn(f, 'wood', doorX + 0.32, 1.05, d / 2 + 0.08, 0.6, 2.05, 0.06); // a half-open door leaf
  for (let k = 0; k < Math.floor(w / 4); k++) {
    const wx = -w / 2 + 2 + k * 4 + rng();
    if (Math.abs(wx - doorX) < 1.4) continue;
    b.boxIn(f, 'dark', wx, wallH - 0.9, d / 2 + 0.005, 0.5, 0.5, 0.06);
  }
  // Rooms: a wing along the back and one side, roofs pitched into the court.
  const backD = Math.min(4.5, d * 0.42);
  b.boxIn(f, plaster, 0, socle + (wallH - socle) / 2, -d / 2 + backD, w - thick * 2, wallH - socle, 0.4, tint);
  b.gableRoof(f.sub(0, -d / 2 + backD / 2), 0, 0, w - 0.2, backD, wallH);
  const sideW = Math.min(3.8, w * 0.35);
  const sideX = rng() < 0.5 ? -1 : 1;
  b.boxIn(f, plaster, sideX * (w / 2 - sideW), socle + (wallH - socle) / 2, d * 0.1, 0.4, wallH - socle, d - backD - 1, tint);
  b.gableRoof(f.sub(sideX * (w / 2 - sideW / 2), (backD - 0.5) / 2, Math.PI / 2), 0, 0, d - backD - 0.6, sideW, wallH - (storeys === 2 ? 2.8 : 0.3));
  // Court floor (beaten earth / pebbles) and a well-head.
  b.boxIn(f, 'drystone', -sideX * 1.2, 0.4, 0.8, 0.8, 0.8, 0.8, tone(rng, 1, 0.1));
}

/** A potter's kiln: a domed mudbrick oven with a stoke-hole, plus stacked pots nearby. */
export function kiln(b: Builder, f: Frame, rng: Rng): void {
  const dome = new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 1.15, 1);
  const [x, z] = f.toWorld(0, 0);
  b.geometry('mudbrick', dome, new THREE.Vector3(x, f.y + 0.6, z), new THREE.Euler(0, 0, 0), new THREE.Vector3(1, 1, 1), { tint: tone(rng, 0.85, 0.1) });
  dome.dispose();
  b.cylinder('mudbrick', x, f.y - 0.3, z, 1.65, 1.75, 0.9, 14, tone(rng, 0.8, 0.1));
  b.boxIn(f, 'dark', 0, 0.4, 1.55, 0.7, 0.6, 0.3);
  b.cylinder('dark', x, f.y + 2.3, z, 0.25, 0.3, 0.12, 8);
}

/** Grave terrace by the road: a retaining wall, an earth platform, and monuments on top. */
export interface GraveSlot {
  kind: 'stele' | 'naiskos' | 'lekythos' | 'loutrophoros' | 'list' | 'trapeza';
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  seed: number;
}

export function graveTerrace(b: Builder, f: Frame, w: number, d: number, rng: Rng): GraveSlot[] {
  const h = 0.9 + rng() * 0.8;
  const mat = rng() < 0.6 ? 'ashlar' : 'drystone';
  b.boxIn(f, mat, 0, (h - 1) / 2, d / 2 - 0.4, w, h + 1, 0.8, tone(rng, 1, 0.08));
  for (const sx of [-1, 1]) b.boxIn(f, mat, sx * (w / 2 - 0.4), (h - 1) / 2, 0, 0.8, h + 1, d, tone(rng, 1, 0.08));
  b.boxIn(f, 'ashlar', 0, h + 0.05, d / 2 - 0.4, w + 0.1, 0.12, 0.95);
  const slots: GraveSlot[] = [];
  const n = Math.max(1, Math.floor(w / 3.2));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (w / n) * (i + 0.5);
    const [x, z] = f.toWorld(lx, d / 2 - 1.4);
    const r = rng();
    const kind: GraveSlot['kind'] = r < 0.42 ? 'stele' : r < 0.6 ? 'lekythos' : r < 0.72 ? 'loutrophoros' : r < 0.9 ? 'naiskos' : 'trapeza';
    slots.push({ kind, x, y: f.y + h, z, rot: f.rot, scale: range(rng, 0.9, 1.15), seed: Math.floor(rng() * 1e6) });
  }
  return slots;
}

/** Anthemion stele: a tall slender marble slab crowned by a palmette (relief added as a decal). */
export function stele(b: Builder, s: GraveSlot): void {
  const f = new Frame(s.x, s.z, s.rot, s.y);
  const h = 1.9 * s.scale;
  b.boxIn(f, 'ashlar', 0, 0.15, 0, 0.9, 0.3, 0.5);
  b.boxIn(f, 'marble', 0, 0.3 + h / 2, 0, 0.55, h, 0.16);
  b.boxIn(f, 'marble', 0, 0.3 + h + 0.25, 0, 0.62, 0.5, 0.14);
}

/** Naiskos: a stele framed like a small temple (pilasters, architrave, pediment) for a relief panel. */
export function naiskos(b: Builder, s: GraveSlot): void {
  const f = new Frame(s.x, s.z, s.rot, s.y);
  const sc = s.scale * 1.15;
  b.boxIn(f, 'ashlar', 0, 0.2, 0, 1.6 * sc, 0.4, 0.8);
  b.boxIn(f, 'marble', 0, 0.4 + 0.75 * sc, -0.12, 1.2 * sc, 1.5 * sc, 0.12); // back panel
  for (const sx of [-1, 1]) b.boxIn(f, 'marble', sx * 0.58 * sc, 0.4 + 0.75 * sc, 0, 0.16 * sc, 1.5 * sc, 0.36);
  b.boxIn(f, 'marble', 0, 0.4 + 1.58 * sc, 0, 1.36 * sc, 0.18 * sc, 0.4);
  const ped = new THREE.CylinderGeometry(0.01, 0.78 * sc, 0.32 * sc, 3, 1);
  ped.rotateX(Math.PI / 2);
  ped.rotateZ(Math.PI);
  ped.scale(1, 1, 0.38 / 0.78 / sc);
  const [x, z] = f.toWorld(0, 0);
  b.geometry('marble', ped, new THREE.Vector3(x, f.y + 0.4 + 1.67 * sc + 0.16 * sc, z), new THREE.Euler(0, f.rot, 0));
  ped.dispose();
}

/** Marble lekythos or loutrophoros (funerary vase forms) on a base. */
export function funeraryVase(b: Builder, s: GraveSlot, kind: 'lekythos' | 'loutrophoros'): void {
  const sc = s.scale * (kind === 'lekythos' ? 1.25 : 1.4);
  const prof =
    kind === 'lekythos'
      ? [[0, 0], [0.16, 0], [0.13, 0.08], [0.2, 0.25], [0.22, 0.75], [0.17, 0.92], [0.07, 0.98], [0.06, 1.12], [0.1, 1.2], [0.05, 1.25], [0, 1.25]]
      : [[0, 0], [0.15, 0], [0.12, 0.1], [0.24, 0.35], [0.24, 0.6], [0.12, 0.85], [0.07, 1.0], [0.07, 1.25], [0.16, 1.38], [0, 1.4]];
  const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x! * sc, y! * sc)), 14);
  b.box('ashlar', s.x, s.y + 0.15, s.z, 0.6, 0.3, 0.6, s.rot);
  b.geometry('marble', lathe, new THREE.Vector3(s.x, s.y + 0.3, s.z), new THREE.Euler(0, s.rot, 0));
  lathe.dispose();
}

/** Casualty-list stele: a broad marble slab with a moulded crown, inscribed (decal) by tribe. */
export function casualtyList(b: Builder, f: Frame): void {
  b.boxIn(f, 'ashlar', 0, 0.25, 0, 3.4, 0.5, 1.0);
  b.boxIn(f, 'marble', 0, 0.5 + 1.3, 0, 2.8, 2.6, 0.24);
  b.boxIn(f, 'marble', 0, 0.5 + 2.7, 0, 3.0, 0.22, 0.32);
}

/** Herm: a square marble pillar with a bearded head (head model attached separately). */
export function hermShaft(b: Builder, x: number, y: number, z: number, rot: number): void {
  b.box('ashlar', x, y + 0.12, z, 0.6, 0.24, 0.6, rot);
  b.box('marble', x, y + 0.24 + 0.65, z, 0.32, 1.3, 0.28, rot);
}

/** Greek pottery (terracotta, some with black-glaze bands): transport amphorae, pithoi, hydriai, kraters. */
export type PotKind = 'amphora' | 'pithos' | 'hydria' | 'krater';
const POT_PROFILES: Record<PotKind, [number, number][]> = {
  // Pointed-foot transport amphora (leans or stacks).
  amphora: [[0, 0], [0.03, 0.02], [0.05, 0.1], [0.16, 0.3], [0.19, 0.48], [0.17, 0.62], [0.08, 0.72], [0.06, 0.82], [0.075, 0.86], [0.06, 0.88], [0, 0.88]],
  // Big storage jar, usually sunk into the ground.
  pithos: [[0, 0], [0.22, 0], [0.38, 0.25], [0.46, 0.6], [0.42, 0.9], [0.3, 1.08], [0.3, 1.16], [0.36, 1.2], [0, 1.2]],
  hydria: [[0, 0], [0.09, 0], [0.08, 0.04], [0.16, 0.18], [0.18, 0.3], [0.13, 0.42], [0.06, 0.48], [0.055, 0.56], [0.09, 0.6], [0, 0.6]],
  krater: [[0, 0], [0.11, 0], [0.08, 0.06], [0.1, 0.12], [0.2, 0.28], [0.24, 0.42], [0.27, 0.5], [0, 0.5]],
};

export function pot(b: Builder, x: number, y: number, z: number, kind: PotKind, scale: number, rot: number, rng: Rng, tilt = 0): void {
  const prof = POT_PROFILES[kind].map(([px, py]) => new THREE.Vector2(px * scale, py * scale));
  const geo = new THREE.LatheGeometry(prof, 14);
  const t = tone(rng, 1, 0.12);
  b.geometry('terracotta', geo, new THREE.Vector3(x, y, z), new THREE.Euler(tilt, rot, tilt * 0.5), new THREE.Vector3(1, 1, 1), { tint: t });
  geo.dispose();
  if (kind !== 'pithos' && rng() < 0.6) {
    // A black-glaze band around the shoulder.
    const h = POT_PROFILES[kind];
    const shoulder = h[Math.floor(h.length * 0.45)]!;
    const band = new THREE.CylinderGeometry(shoulder[0] * scale * 1.01, shoulder[0] * scale * 1.01, 0.05 * scale, 14, 1, true);
    band.translate(0, shoulder[1] * scale, 0);
    b.geometry('dark', band, new THREE.Vector3(x, y, z), new THREE.Euler(tilt, rot, tilt * 0.5));
    band.dispose();
  }
  if (kind === 'amphora' || kind === 'hydria') {
    // Handles.
    for (const s of [-1, 1]) {
      const handle = new THREE.TorusGeometry(0.07 * scale, 0.012 * scale, 4, 8, Math.PI);
      handle.rotateZ(s * Math.PI / 2);
      handle.translate(s * 0.1 * scale, 0.74 * scale * (kind === 'hydria' ? 0.65 : 1), 0);
      b.geometry('terracotta', handle, new THREE.Vector3(x, y, z), new THREE.Euler(tilt, rot, tilt * 0.5), new THREE.Vector3(1, 1, 1), { tint: t });
      handle.dispose();
    }
  }
}

/** A potter's yard: amphorae leaning in rows, a few sunk pithoi, hydriai and kraters drying. */
export function potteryCluster(b: Builder, ground: Ground, cx: number, cz: number, radius: number, count: number, rng: Rng): { x: number; z: number; r: number }[] {
  const solid: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = ground(x, z);
    const k = rng();
    if (k < 0.45) {
      // Leaning transport amphorae.
      pot(b, x, y + 0.02, z, 'amphora', range(rng, 0.9, 1.15), rng() * Math.PI * 2, rng, 0.25 + rng() * 0.2);
    } else if (k < 0.62) {
      pot(b, x, y - 0.5, z, 'pithos', range(rng, 1.0, 1.3), rng() * Math.PI * 2, rng);
      solid.push({ x, z, r: 0.6 });
    } else if (k < 0.82) {
      pot(b, x, y, z, 'hydria', range(rng, 0.9, 1.1), rng() * Math.PI * 2, rng);
    } else {
      pot(b, x, y, z, 'krater', range(rng, 0.9, 1.2), rng() * Math.PI * 2, rng);
    }
  }
  return solid;
}
