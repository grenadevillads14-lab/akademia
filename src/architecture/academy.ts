import * as THREE from 'three';
import type { Rng } from '../procgen/rng';
import { column, entablature, GYMNASIUM_ORDER, orderHeight, stoa } from './doric';
import { courtyardHouse, type Ground } from './greek';
import type { Builder} from './kit';
import { Frame } from './kit';

/**
 * Buildings of the Academy precinct (docs/RESEARCH.md §2–5).
 * Each function builds in a local Frame (+Z forward) and returns collision boxes in that frame.
 */
export type LocalBox = [lx: number, ly: number, lz: number, sx: number, sy: number, sz: number];

/**
 * The gymnasium/palaestra after Vitruvius 5.11: a square peristyle around a sand court, single porticoes
 * on three sides with exedrae for philosophers, and a deeper double portico on the south (here local -Z)
 * with the ephebeion in the middle and the dust room, punching-bag room, oil store and bath beside it.
 */
export function gymnasium(b: Builder, f: Frame, rng: Rng, size = 44): LocalBox[] {
  const o = GYMNASIUM_ORDER;
  const boxes: LocalBox[] = [];
  const half = size / 2;
  const depth = 5.2;
  // Three single porticoes facing inward (N, E, W) and a double one on the south.
  const sides: { rot: number; deep: boolean }[] = [
    { rot: Math.PI, deep: false }, // north side (local +Z edge) faces -Z (inward)
    { rot: Math.PI / 2, deep: false }, // west side faces +X
    { rot: -Math.PI / 2, deep: false }, // east side faces -X
    { rot: 0, deep: true }, // south side (local -Z edge) faces +Z
  ];
  for (const s of sides) {
    const d = s.deep ? depth * 2.2 : depth;
    const lf = f.sub(Math.sin(s.rot) * -(half - d / 2), Math.cos(s.rot) * -(half - d / 2), s.rot);
    stoa(b, lf, size - d * 2 - 0.4, d, o);
    // Outer back wall is part of the stoa; exedrae on the single porticoes.
    if (!s.deep) {
      const [ex, ez] = lf.toWorld(0, -d / 2 + 1.6);
      exedra(b, new Frame(ex, ez, lf.rot, f.y + 0.57), 2.4, rng);
    }
  }
  // South rooms behind the double portico (Vitruvius): ephebeion centre, then side rooms.
  const roomsZ = -half + 2.6;
  const rooms = [-13, -6.5, 0, 6.5, 13];
  for (const [i, rx] of rooms.entries()) {
    b.boxIn(f, 'whitewash', rx + 3.2, 0.57 + 2.2, roomsZ, 0.4, 4.4, 5.2);
    if (i === 2) b.boxIn(f, 'dark', rx, 0.57 + 1.6, roomsZ + 2.62, 2.6, 3.2, 0.05); // wide ephebeion opening
    else b.boxIn(f, 'dark', rx, 0.57 + 1.15, roomsZ + 2.62, 1.2, 2.3, 0.05);
  }
  b.boxIn(f, 'whitewash', 0, 0.57 + 2.2, roomsZ + 2.6, size - 1.2, 4.4, 0.35);
  // Sand court (the skamma) edged with a stone kerb, and a bronze-mouthed basin by the bath.
  // A stone kerb around the open sand court (the sand itself is the terrain's palaestra layer).
  const court = 28;
  for (const [lx, lz, sx, sz] of [[0, court / 2, court, 0.4], [0, -court / 2, court, 0.4], [court / 2, 0, 0.4, court], [-court / 2, 0, 0.4, court]] as const) {
    b.boxIn(f, 'ashlar', lx, 0.1, lz, sx + 0.4, 0.3, sz);
  }
  // Athletes' gear by the oil store: strigils and oil flasks (aryballoi) on pegs, a discus leaning on the wall.
  for (let k = 0; k < 5; k++) {
    b.boxIn(f, 'wood', 6.5 + k * 0.5, 0.57 + 1.7, -half + 5.35, 0.05, 0.05, 0.25);
    const ary = new THREE.SphereGeometry(0.07, 8, 6);
    const [ax, az] = f.toWorld(6.5 + k * 0.5, -half + 5.45);
    b.geometry('terracotta', ary, new THREE.Vector3(ax, f.y + 0.57 + 1.55, az), new THREE.Euler());
    ary.dispose();
  }
  const discus = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 16);
  discus.rotateX(Math.PI / 2 - 0.2);
  const [dx, dz] = f.toWorld(9.5, -half + 5.3);
  b.geometry('bronze', discus, new THREE.Vector3(dx, f.y + 0.57 + 0.12, dz), new THREE.Euler(0, f.rot, 0));
  discus.dispose();
  b.boxIn(f, 'ashlar', -13, 0.57 + 0.45, -half + 7.2, 1.8, 0.9, 1.0);
  b.boxIn(f, 'dark', -13, 0.57 + 0.86, -half + 7.2, 1.5, 0.05, 0.75);
  // Colliders: outer walls (with the entrance gap on the north).
  const H = orderHeight(o) + 0.6;
  boxes.push([0, H / 2, -half, size, H, 0.8]);
  boxes.push([-half, H / 2, 0, 0.8, H, size]);
  boxes.push([half, H / 2, 0, 0.8, H, size]);
  boxes.push([-size / 4 - 1.5, H / 2, half, size / 2 - 3, H, 0.8]);
  boxes.push([size / 4 + 1.5, H / 2, half, size / 2 - 3, H, 0.8]);
  // Propylon (entrance porch) on the north side.
  const pf = f.sub(0, half + 1.6, 0);
  b.boxIn(pf, 'ashlar', 0, 0.3, 0, 7.5, 0.6, 3.6);
  for (const sx of [-1.6, 1.6]) {
    const [x, z] = pf.toWorld(sx, 1.3);
    column(b, x, f.y + 0.6, z, o, f.rot);
  }
  entablature(b, new Frame(pf.x, pf.z, pf.rot, f.y + 0.6), -2.4, 2.4, 1.3, o.H, o, 3.2, 1);
  b.gableRoof(pf, 0, 0, 6.8, 3.6, 0.6 + orderHeight(o));
  // Remove the wall where the entrance is: carve the doorway (dark) on the north back wall.
  b.boxIn(f, 'dark', 0, 0.57 + 1.6, half + 0.31, 3.0, 3.2, 0.05);
  return boxes;
}

/** A curved stone bench (exedra) where philosophers sat. */
export function exedra(b: Builder, f: Frame, radius: number, _rng: Rng): void {
  const segs = 9;
  for (let i = 0; i < segs; i++) {
    const a = Math.PI * (i / (segs - 1)) - Math.PI / 2;
    const lx = Math.sin(a) * radius;
    const lz = Math.cos(a) * radius * 0.7;
    const sf = f.sub(lx, lz, a + Math.PI);
    b.boxIn(sf, 'ashlar', 0, 0.22, 0, 0.95, 0.44, 0.5);
    b.boxIn(sf, 'ashlar', 0, 0.62, -0.25, 0.95, 0.4, 0.1);
  }
}

/** The teaching circle: a ring of stone benches under the great plane, the worn earth at its centre. */
export function benchRing(b: Builder, f: Frame, radius: number, gapAngle = 0.6): LocalBox[] {
  const boxes: LocalBox[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gapAngle / 2) continue; // entrance gap
    const lx = Math.sin(a) * radius;
    const lz = Math.cos(a) * radius;
    const sf = f.sub(lx, lz, a);
    b.boxIn(sf, 'ashlar', 0, 0.24, 0, 2.1, 0.48, 0.55);
    b.boxIn(sf, 'ashlar', -0.85, 0.12, 0, 0.3, 0.24, 0.45);
    boxes.push([lx, 0.24, lz, 1.6, 0.48, 1.6]);
    // Left behind on the benches: wax tablets (wooden frame, dark wax), a stylus, a scroll.
    if (i % 3 === 1) {
      b.boxIn(sf, 'wood', 0.4, 0.5, 0.05, 0.32, 0.03, 0.22);
      b.boxIn(sf, 'dark', 0.4, 0.515, 0.05, 0.26, 0.01, 0.16);
      b.boxIn(sf, 'bronze', 0.62, 0.5, 0.0, 0.14, 0.012, 0.012);
    }
    if (i % 4 === 2) {
      const scroll = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8);
      scroll.rotateZ(Math.PI / 2);
      const [sx2, sz2] = sf.toWorld(-0.3, 0.05);
      b.geometry('whitewash', scroll, new THREE.Vector3(sx2, sf.y + 0.52, sz2), new THREE.Euler(0, sf.rot, 0), new THREE.Vector3(1, 1, 1), { tint: new THREE.Color(1.0, 0.95, 0.82) });
      scroll.dispose();
    }
  }
  return boxes;
}

/**
 * A small shrine in antis (the Mouseion): two columns between projecting walls, a cella with a door,
 * a gabled roof; an altar in front.
 */
export function shrine(b: Builder, f: Frame, w = 6.4, d = 9): LocalBox[] {
  const o = { D: 0.48, H: 3.0 };
  b.boxIn(f, 'ashlar', 0, 0.3, 0, w + 1.2, 0.6, d + 1.2);
  b.boxIn(f, 'ashlar', 0, 0.6, 0, w + 0.6, 0.15, d + 0.6);
  const top = orderHeight(o);
  // Cella walls.
  b.boxIn(f, 'whitewash', 0, 0.7 + top / 2, -d / 2 + 0.25, w, top, 0.5);
  for (const sx of [-1, 1]) b.boxIn(f, 'whitewash', sx * (w / 2 - 0.25), 0.7 + top / 2, -0.4, 0.5, top, d - 1.6);
  b.boxIn(f, 'whitewash', 0, 0.7 + top / 2, d / 2 - 2.4, w, top, 0.4);
  b.boxIn(f, 'dark', 0, 0.7 + 1.3, d / 2 - 2.17, 1.4, 2.6, 0.05);
  for (const sx of [-1.15, 1.15]) {
    const [x, z] = f.toWorld(sx, d / 2 - 0.7);
    column(b, x, f.y + 0.68, z, o, f.rot);
  }
  entablature(b, new Frame(f.x, f.z, f.rot, f.y + 0.68), -w / 2 + 0.3, w / 2 - 0.3, d / 2 - 0.7, o.H, o, 2.3, 1);
  b.gableRoof(f, 0, 0, d, w, 0.68 + top);
  // Altar before the steps.
  altar(b, f.sub(0, d / 2 + 3.5), 'small');
  return [[0, 2, 0, w + 1, 4, d + 1]];
}

/** Altars: 'small' block altar, 'stepped' monumental altar (Prometheus), with a bronze fire bowl. */
export function altar(b: Builder, f: Frame, kind: 'small' | 'stepped' = 'small'): LocalBox[] {
  if (kind === 'small') {
    b.boxIn(f, 'ashlar', 0, 0.15, 0, 2.0, 0.3, 1.4);
    b.boxIn(f, 'marble', 0, 0.65, 0, 1.5, 0.7, 0.95);
    b.boxIn(f, 'marble', 0, 1.05, 0, 1.7, 0.12, 1.1);
    // Ash and charred offerings on the hearth (the fire itself is world/fires.ts).
    b.boxIn(f, 'paint', 0, 1.12, 0, 1.2, 0.03, 0.7, new THREE.Color(0.32, 0.29, 0.26));
    b.boxIn(f, 'paint', 0.1, 1.14, -0.05, 0.5, 0.04, 0.35, new THREE.Color(0.12, 0.1, 0.09));
    return [[0, 0.6, 0, 2, 1.2, 1.4]];
  }
  for (let s = 0; s < 3; s++) b.boxIn(f, 'ashlar', 0, 0.12 + s * 0.24, 0, 5.2 - s * 0.6, 0.24, 3.6 - s * 0.5);
  b.boxIn(f, 'marble', 0, 0.72 + 0.6, 0, 3.0, 1.2, 1.8);
  b.boxIn(f, 'marble', 0, 1.98, 0, 3.3, 0.14, 2.1);
  b.boxIn(f, 'paint', 0, 1.88, 0.96, 3.3, 0.08, 0.04, new THREE.Color(0.7, 0.3, 0.2));
  // Bronze bowl for the fire.
  const bowl = new THREE.SphereGeometry(0.55, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.rotateX(Math.PI);
  const [x, z] = f.toWorld(0, 0);
  b.geometry('bronze', bowl, new THREE.Vector3(x, f.y + 2.55, z), new THREE.Euler(0, 0, 0));
  bowl.dispose();
  return [[0, 1, 0, 5.2, 2, 3.6]];
}

/** A dry-stone enclosure wall along a closed polygon, with gaps for gates; thyme grows on top (shrubs added by data). */
export function enclosure(b: Builder, ground: Ground, points: [number, number][], opts: { height: number; style: 'drystone' | 'ashlar'; gates: [number, number][]; gateWidth: number }): { x: number; z: number; rot: number; len: number }[] {
  const segs: { x: number; z: number; rot: number; len: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    for (let s = 0; s < len; s += 4) {
      const l = Math.min(4, len - s);
      const t = (s + l / 2) / len;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (opts.gates.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < opts.gateWidth / 2 + 1.5)) continue;
      const f = new Frame(x, z, rot, ground(x, z));
      const h = opts.height * (0.92 + ((i * 7 + s) % 5) * 0.03);
      b.boxIn(f, opts.style, 0, h / 2 - 0.4, 0, l + 0.05, h + 0.8, opts.style === 'drystone' ? 0.8 : 1.0);
      b.boxIn(f, opts.style === 'drystone' ? 'drystone' : 'ashlar', 0, h + 0.06, 0, l + 0.05, 0.14, opts.style === 'drystone' ? 0.9 : 1.1);
      segs.push({ x, z, rot, len: l });
    }
  }
  // Gate posts.
  for (const [gx, gz] of opts.gates) {
    const y = ground(gx, gz);
    for (const s of [-1, 1]) b.box('ashlar', gx + s * (opts.gateWidth / 2 + 0.4), y + opts.height * 0.7, gz, 0.9, opts.height * 1.5, 0.9);
  }
  return segs;
}

/** Plato's house in the garden: a modest courtyard house with a scroll room (cubbies seen through the door). */
export function platoHouse(b: Builder, f: Frame, rng: Rng): LocalBox[] {
  courtyardHouse(b, f, 13, 11, rng, 1);
  // Scroll cubbies (a dark lattice of pigeonholes) visible inside the open street door.
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) b.boxIn(f, 'wood', -3 + c * 0.42, 0.6 + r * 0.42, 3.6, 0.38, 0.38, 0.35);
  return [[0, 2, 0, 13, 4, 11]];
}

/** Hero-shrine (heroon) on Colonus: a low walled precinct with an altar inside. */
export function heroon(b: Builder, f: Frame): LocalBox[] {
  for (const [lx, lz, sx, sz] of [[0, 4, 9, 0.6], [0, -4, 9, 0.6], [-4.5, 0, 0.6, 8], [4.5, 1.6, 0.6, 4.8]] as const) b.boxIn(f, 'ashlar', lx, 0.55, lz, sx, 1.1, sz);
  altar(b, f.sub(0, 0), 'small');
  return [[0, 0.55, 4, 9, 1.1, 0.6], [0, 0.55, -4, 9, 1.1, 0.6], [-4.5, 0.55, 0, 0.6, 1.1, 8]];
}

/** A slab footbridge over an irrigation channel. */
export function slabBridge(b: Builder, f: Frame, span: number, width: number): void {
  b.boxIn(f, 'ashlar', 0, 0.12, 0, width, 0.24, span);
  for (const s of [-1, 1]) b.boxIn(f, 'ashlar', 0, -0.2, s * (span / 2 - 0.3), width + 0.2, 0.6, 0.6);
}
